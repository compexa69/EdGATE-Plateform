/**
 * Drop-in Supabase JS client replacement using the existing pg Pool.
 * Keys passed to insert/update/upsert are already snake_case (as used in original Supabase calls).
 * Keys returned from select are kept in snake_case to match original Supabase behavior.
 */
import { pool } from "@workspace/db";
import type { PoolClient } from "pg";

type Row = Record<string, unknown>;
type SupabaseResult<T> = { data: T; error: null; count?: number } | { data: null; error: Error; count?: number };

interface JoinSpec {
  table: string;
  innerCols: string;
}

function parseSelect(raw: string): { mainCols: string; joins: JoinSpec[] } {
  const joins: JoinSpec[] = [];
  const joinRe = /(\w+)\(([^()]+(?:\([^()]*\)[^()]*)*)\)/g;
  let cleaned = raw;
  let m: RegExpExecArray | null;
  while ((m = joinRe.exec(raw)) !== null) {
    joins.push({ table: m[1], innerCols: m[2] });
    cleaned = cleaned.replace(m[0], "");
  }
  cleaned = cleaned.replace(/,\s*,/g, ",").replace(/^\s*,\s*/, "").replace(/,\s*$/, "").trim();
  return { mainCols: cleaned || "*", joins };
}

async function resolveJoin(client: PoolClient, mainRows: Row[], join: JoinSpec, parentTableName: string): Promise<void> {
  const { table: joinTable, innerCols } = join;
  const singularJoin = joinTable.replace(/s$/, "");
  const fkInParentSnake = `${singularJoin}_id`;
  const sampleRow = mainRows[0];

  if (sampleRow && fkInParentSnake in sampleRow) {
    const ids = [...new Set(mainRows.map((r) => r[fkInParentSnake]).filter((v) => v != null))];
    if (!ids.length) { for (const row of mainRows) row[joinTable] = null; return; }
    const result = await client.query(`SELECT * FROM "${joinTable}" WHERE id = ANY($1)`, [ids]);
    const relRows = result.rows as Row[];
    const { joins: nestedJoins } = parseSelect(innerCols);
    if (nestedJoins.length > 0 && relRows.length > 0) {
      for (const nj of nestedJoins) await resolveJoin(client, relRows, nj, joinTable);
    }
    const relMap = new Map(relRows.map((r) => [r.id as string, r]));
    for (const row of mainRows) row[joinTable] = relMap.get(row[fkInParentSnake] as string) ?? null;
  } else {
    const singularParent = parentTableName.replace(/s$/, "");
    const fkColSnake = `${singularParent}_id`;
    const parentIds = [...new Set(mainRows.map((r) => r.id).filter((v) => v != null))];
    if (!parentIds.length) { for (const row of mainRows) row[joinTable] = null; return; }
    const result = await client.query(`SELECT * FROM "${joinTable}" WHERE "${fkColSnake}" = ANY($1)`, [parentIds]);
    const relRows = result.rows as Row[];
    const relMap = new Map(relRows.map((r) => [r[fkColSnake] as string, r]));
    for (const row of mainRows) row[joinTable] = relMap.get(row.id as string) ?? null;
  }
}

class QueryBuilder {
  _table: string;
  _rawTable: string;
  _selectStr = "*";
  _filters: Array<{ col: string; op: string; val: unknown }> = [];
  _orders: Array<{ col: string; asc: boolean }> = [];
  _limitN: number | null = null;
  _countExact = false;
  _headOnly = false;
  _data: Row | null = null;
  _batchData: Row[] | null = null;
  _operation: "select" | "insert" | "update" | "delete" | "upsert" = "select";
  _onConflict: string | null = null;
  _ignoreDups = false;
  _returnRows = false;
  _isSingle = false;
  _isMaybe = false;

  constructor(table: string) {
    this._rawTable = table;
    this._table = `"${table}"`;
  }

  select(cols = "*", opts?: { count?: "exact"; head?: boolean }): this {
    if (this._operation !== "select") {
      this._returnRows = true;
      return this;
    }
    this._selectStr = cols;
    if (opts?.count === "exact") { this._countExact = true; this._headOnly = opts.head ?? false; }
    return this;
  }

  eq(col: string, val: unknown): this { this._filters.push({ col, op: "=", val }); return this; }
  neq(col: string, val: unknown): this { this._filters.push({ col, op: "<>", val }); return this; }
  gt(col: string, val: unknown): this { this._filters.push({ col, op: ">", val }); return this; }
  gte(col: string, val: unknown): this { this._filters.push({ col, op: ">=", val }); return this; }
  lt(col: string, val: unknown): this { this._filters.push({ col, op: "<", val }); return this; }
  lte(col: string, val: unknown): this { this._filters.push({ col, op: "<=", val }); return this; }
  in(col: string, vals: unknown[]): this { this._filters.push({ col, op: "in", val: vals }); return this; }
  is(col: string, val: null | boolean): this { this._filters.push({ col, op: "is", val }); return this; }
  order(col: string, opts?: { ascending?: boolean }): this { this._orders.push({ col, asc: opts?.ascending !== false }); return this; }
  limit(n: number): this { this._limitN = n; return this; }
  single(): this { this._isSingle = true; this._returnRows = true; return this; }
  maybeSingle(): this { this._isMaybe = true; this._returnRows = true; return this; }

  insert(data: Row | Row[]): this {
    this._operation = "insert";
    if (Array.isArray(data)) { this._batchData = data; } else { this._data = data; }
    return this;
  }

  update(data: Row): this { this._operation = "update"; this._data = data; return this; }
  delete(): this { this._operation = "delete"; return this; }

  upsert(data: Row, opts?: { onConflict?: string; ignoreDuplicates?: boolean }): this {
    this._operation = "upsert";
    this._data = data;
    this._onConflict = opts?.onConflict ?? null;
    this._ignoreDups = opts?.ignoreDuplicates ?? false;
    return this;
  }

  then<TResult1 = SupabaseResult<unknown>, TResult2 = never>(
    onfulfilled?: ((value: SupabaseResult<unknown>) => TResult1 | PromiseLike<TResult1>) | null,
    onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
  ): Promise<TResult1 | TResult2> {
    return this._execute().then(onfulfilled as never, onrejected as never) as Promise<TResult1 | TResult2>;
  }

  private _buildWhere(offset = 0): { text: string; values: unknown[] } {
    if (!this._filters.length) return { text: "", values: [] };
    const values: unknown[] = [];
    const parts = this._filters.map((f) => {
      if (f.op === "is") {
        if (f.val === null) return `"${f.col}" IS NULL`;
        return `"${f.col}" = ${f.val ? "TRUE" : "FALSE"}`;
      }
      if (f.op === "in") { values.push(f.val); return `"${f.col}" = ANY($${offset + values.length})`; }
      values.push(f.val);
      return `"${f.col}" ${f.op} $${offset + values.length}`;
    });
    return { text: " WHERE " + parts.join(" AND "), values };
  }

  private async _execute(): Promise<SupabaseResult<unknown>> {
    const client = await pool.connect();
    try {
      switch (this._operation) {
        case "select": return await this._execSelect(client);
        case "insert": return await this._execInsert(client);
        case "update": return await this._execUpdate(client);
        case "delete": return await this._execDelete(client);
        case "upsert": return await this._execUpsert(client);
        default: return { data: null, error: new Error("Unknown operation") };
      }
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err));
      process.stderr.write(`[supabase-compat] ${this._rawTable}.${this._operation} FAILED: ${error.message}\n`);
      return { data: null, error };
    } finally {
      client.release();
    }
  }

  private async _execSelect(client: PoolClient): Promise<SupabaseResult<unknown>> {
    const { mainCols, joins } = parseSelect(this._selectStr);

    if (this._countExact) {
      const where = this._buildWhere();
      const r = await client.query(`SELECT COUNT(*) AS cnt FROM ${this._table}${where.text}`, where.values);
      return { data: this._headOnly ? null : [], error: null, count: parseInt(r.rows[0]?.cnt ?? "0", 10) };
    }

    const colsSql = mainCols === "*"
      ? "*"
      : mainCols.split(",").map((c) => { const t = c.trim(); return t === "*" ? "*" : `"${t}"`; }).join(", ");

    const where = this._buildWhere();
    let sql = `SELECT ${colsSql} FROM ${this._table}${where.text}`;
    if (this._orders.length) sql += " ORDER BY " + this._orders.map((o) => `"${o.col}" ${o.asc ? "ASC" : "DESC"}`).join(", ");
    if (this._limitN !== null) sql += ` LIMIT ${this._limitN}`;

    const result = await client.query(sql, where.values);
    const rows = result.rows as Row[];

    if (joins.length > 0 && rows.length > 0) {
      for (const join of joins) await resolveJoin(client, rows, join, this._rawTable);
    }

    if (this._isSingle || this._isMaybe) return { data: rows[0] ?? null, error: null };
    return { data: rows, error: null };
  }

  private async _execInsert(client: PoolClient): Promise<SupabaseResult<unknown>> {
    if (this._batchData) {
      if (this._batchData.length === 0) return { data: [], error: null };
      const keys = Object.keys(this._batchData[0]);
      const cols = keys.map((k) => `"${k}"`).join(", ");
      const rowValues: unknown[] = [];
      const placeholders = this._batchData.map((_, ri) => {
        return "(" + keys.map((__, ki) => `$${ri * keys.length + ki + 1}`).join(", ") + ")";
      }).join(", ");
      for (const row of this._batchData) keys.forEach((k) => rowValues.push(row[k]));
      let sql = `INSERT INTO ${this._table} (${cols}) VALUES ${placeholders}`;
      if (this._returnRows) sql += " RETURNING *";
      const result = await client.query(sql, rowValues);
      if (this._returnRows) return { data: result.rows, error: null };
      return { data: null, error: null };
    }

    const data = this._data!;
    const keys = Object.keys(data);
    const cols = keys.map((k) => `"${k}"`).join(", ");
    const placeholders = keys.map((_, i) => `$${i + 1}`).join(", ");
    const values = keys.map((k) => data[k]);

    let sql = `INSERT INTO ${this._table} (${cols}) VALUES (${placeholders})`;
    if (this._returnRows) sql += " RETURNING *";

    const result = await client.query(sql, values);
    if (this._returnRows) {
      const rows = result.rows as Row[];
      if (this._isSingle || this._isMaybe) return { data: rows[0] ?? null, error: null };
      return { data: rows, error: null };
    }
    return { data: null, error: null };
  }

  private async _execUpdate(client: PoolClient): Promise<SupabaseResult<unknown>> {
    const data = this._data!;
    const keys = Object.keys(data);
    const values: unknown[] = keys.map((k) => data[k]);
    const sets = keys.map((k, i) => `"${k}" = $${i + 1}`).join(", ");
    const where = this._buildWhere(keys.length);

    let sql = `UPDATE ${this._table} SET ${sets}${where.text}`;
    if (this._returnRows) sql += " RETURNING *";

    const result = await client.query(sql, [...values, ...where.values]);
    if (this._returnRows) {
      const rows = result.rows as Row[];
      if (this._isSingle || this._isMaybe) return { data: rows[0] ?? null, error: null };
      return { data: rows, error: null };
    }
    return { data: null, error: null };
  }

  private async _execDelete(client: PoolClient): Promise<SupabaseResult<unknown>> {
    const where = this._buildWhere();
    let sql = `DELETE FROM ${this._table}${where.text}`;
    if (this._returnRows) sql += " RETURNING *";

    const result = await client.query(sql, where.values);
    if (this._returnRows) {
      const rows = result.rows as Row[];
      if (this._isSingle || this._isMaybe) return { data: rows[0] ?? null, error: null };
      return { data: rows, error: null };
    }
    return { data: null, error: null };
  }

  private async _execUpsert(client: PoolClient): Promise<SupabaseResult<unknown>> {
    const data = this._data!;
    const keys = Object.keys(data);
    const cols = keys.map((k) => `"${k}"`).join(", ");
    const placeholders = keys.map((_, i) => `$${i + 1}`).join(", ");
    const values = keys.map((k) => data[k]);

    let sql = `INSERT INTO ${this._table} (${cols}) VALUES (${placeholders})`;
    if (this._onConflict) {
      const conflictCol = `"${this._onConflict}"`;
      if (this._ignoreDups) {
        sql += ` ON CONFLICT (${conflictCol}) DO NOTHING`;
      } else {
        const updateParts = keys.filter((k) => k !== this._onConflict).map((k) => `"${k}" = EXCLUDED."${k}"`);
        sql += updateParts.length > 0
          ? ` ON CONFLICT (${conflictCol}) DO UPDATE SET ${updateParts.join(", ")}`
          : ` ON CONFLICT (${conflictCol}) DO NOTHING`;
      }
    }
    await client.query(sql, values);
    return { data: null, error: null };
  }
}

class SupabaseCompat {
  from(table: string): QueryBuilder {
    return new QueryBuilder(table);
  }
}

export const supabase = new SupabaseCompat();
export type SupabaseClient = typeof supabase;
