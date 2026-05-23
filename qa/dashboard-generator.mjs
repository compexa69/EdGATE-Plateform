/**
 * EdTech Platform — Interactive QA Dashboard Generator (Phase 6)
 * Generates a rich, dark-mode HTML dashboard with Chart.js charts,
 * performance metrics, coverage gauge, and sortable test table.
 */
import { writeFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dir = dirname(fileURLToPath(import.meta.url));

export function generateDashboard(results, stats) {
  const passed  = results.filter(r => r.status === "PASS");
  const failed  = results.filter(r => r.status === "FAIL");
  const partial = results.filter(r => r.status === "PARTIAL");
  const skipped = results.filter(r => r.status === "SKIP");

  const modules = [...new Set(results.map(r => r.module))];
  const moduleData = modules.map(m => ({
    name: m,
    pass:    results.filter(r => r.module === m && r.status === "PASS").length,
    fail:    results.filter(r => r.module === m && r.status === "FAIL").length,
    partial: results.filter(r => r.module === m && r.status === "PARTIAL").length,
    skip:    results.filter(r => r.module === m && r.status === "SKIP").length,
    total:   results.filter(r => r.module === m).length,
    avgTime: (() => {
      const t = results.filter(r => r.module === m && r.responseTime > 0).map(r => r.responseTime);
      return t.length ? Math.round(t.reduce((a,b)=>a+b,0)/t.length) : 0;
    })(),
  }));

  const deployReady = failed.filter(t => ["Security","Auth"].includes(t.module)).length === 0;
  const coveragePct = parseFloat(stats.coverage?.pct ?? 0);
  const now = new Date().toISOString();

  // Serialize results for JS
  const resultsJson = JSON.stringify(results.map(r => ({
    id: r.id, module: r.module, feature: r.feature,
    desc: r.desc, status: r.status, severity: r.severity,
    responseTime: r.responseTime || 0, ts: r.ts,
    error: r.error || "", fix: r.fix || "",
    preconditions: r.preconditions || "", steps: r.steps || "",
  })));

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>EdTech Platform — QA Dashboard</title>
<script src="https://cdn.jsdelivr.net/npm/chart.js@4.4.0/dist/chart.umd.min.js"></script>
<style>
  *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
  :root {
    --bg: #0F172A; --card: #1E293B; --card2: #162032; --border: #334155;
    --indigo: #6366F1; --green: #22C55E; --red: #EF4444;
    --yellow: #F59E0B; --purple: #A855F7; --cyan: #06B6D4;
    --text: #E2E8F0; --muted: #94A3B8; --radius: 12px;
    --green-dim: rgba(34,197,94,0.15); --red-dim: rgba(239,68,68,0.15);
    --yellow-dim: rgba(245,158,11,0.15); --indigo-dim: rgba(99,102,241,0.15);
  }
  body { background: var(--bg); color: var(--text); font-family: 'Segoe UI', system-ui, sans-serif; min-height: 100vh; }

  /* ── Header ── */
  header {
    background: linear-gradient(135deg, #1E293B 0%, #0F172A 100%);
    border-bottom: 1px solid var(--border); padding: 20px 28px;
    display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 12px;
  }
  .hdr-left h1 {
    font-size: 1.35rem; font-weight: 800;
    background: linear-gradient(90deg, var(--indigo), var(--purple));
    -webkit-background-clip: text; -webkit-text-fill-color: transparent;
  }
  .hdr-left p { font-size: 0.75rem; color: var(--muted); margin-top: 2px; }
  .hdr-right { display: flex; align-items: center; gap: 12px; flex-wrap: wrap; }
  .deploy-badge {
    display: inline-flex; align-items: center; gap: 6px; padding: 6px 14px;
    border-radius: 999px; font-size: 0.75rem; font-weight: 700; letter-spacing: 0.03em;
    ${deployReady
      ? "background: rgba(34,197,94,0.15); color: #22C55E; border: 1px solid #22C55E;"
      : "background: rgba(239,68,68,0.15); color: #EF4444; border: 1px solid #EF4444;"}
  }
  .meta-tag { font-size: 0.7rem; color: var(--muted); background: rgba(255,255,255,0.04); border: 1px solid var(--border); padding: 4px 10px; border-radius: 6px; }

  /* ── Layout ── */
  main { padding: 24px 28px; max-width: 1480px; margin: 0 auto; }

  /* ── Stat Cards ── */
  .stat-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(155px, 1fr)); gap: 14px; margin-bottom: 28px; }
  .stat-card { background: var(--card); border: 1px solid var(--border); border-radius: var(--radius); padding: 18px 16px; text-align: center; position: relative; overflow: hidden; transition: transform 0.15s; }
  .stat-card:hover { transform: translateY(-2px); }
  .stat-card::before { content: ''; position: absolute; top: 0; left: 0; right: 0; height: 3px; border-radius: var(--radius) var(--radius) 0 0; }
  .stat-card.total::before   { background: var(--indigo); }
  .stat-card.pass::before    { background: var(--green); }
  .stat-card.fail::before    { background: var(--red); }
  .stat-card.partial::before { background: var(--yellow); }
  .stat-card.skip::before    { background: var(--muted); }
  .stat-card.rate::before    { background: var(--purple); }
  .stat-card.cov::before     { background: var(--cyan); }
  .stat-card.avg::before     { background: var(--yellow); }
  .stat-value { font-size: 2.2rem; font-weight: 800; line-height: 1.1; margin: 8px 0 6px; }
  .stat-card.total   .stat-value { color: var(--indigo); }
  .stat-card.pass    .stat-value { color: var(--green); }
  .stat-card.fail    .stat-value { color: var(--red); }
  .stat-card.partial .stat-value { color: var(--yellow); }
  .stat-card.skip    .stat-value { color: var(--muted); }
  .stat-card.rate    .stat-value { color: var(--purple); }
  .stat-card.cov     .stat-value { color: var(--cyan); }
  .stat-card.avg     .stat-value { color: var(--yellow); }
  .stat-label { font-size: 0.72rem; color: var(--muted); text-transform: uppercase; letter-spacing: 0.06em; }
  .stat-sub { font-size: 0.68rem; color: var(--muted); margin-top: 4px; }

  /* ── Grid ── */
  .grid-2 { display: grid; grid-template-columns: 1fr 1fr; gap: 22px; margin-bottom: 22px; }
  .grid-3 { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 22px; margin-bottom: 22px; }
  .grid-1-2 { display: grid; grid-template-columns: 1fr 2fr; gap: 22px; margin-bottom: 22px; }
  @media (max-width: 1100px) { .grid-2, .grid-3, .grid-1-2 { grid-template-columns: 1fr; } }

  /* ── Cards ── */
  .card { background: var(--card); border: 1px solid var(--border); border-radius: var(--radius); padding: 22px; }
  .card h2 { font-size: 0.9rem; font-weight: 600; color: var(--text); display: flex; align-items: center; gap: 8px; margin-bottom: 18px; }
  .card h2 span.icon { font-size: 1rem; }
  .chart-wrap { position: relative; }
  .chart-wrap.md { height: 270px; }
  .chart-wrap.sm { height: 220px; }
  .chart-wrap.lg { height: 320px; }

  /* ── Coverage Gauge ── */
  .gauge-wrap { display: flex; flex-direction: column; align-items: center; gap: 10px; }
  .gauge-ring { position: relative; width: 160px; height: 160px; }
  .gauge-ring canvas { position: absolute; top: 0; left: 0; }
  .gauge-center { position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%); text-align: center; }
  .gauge-pct { font-size: 1.8rem; font-weight: 800; color: var(--cyan); line-height: 1; }
  .gauge-label { font-size: 0.65rem; color: var(--muted); text-transform: uppercase; letter-spacing: 0.06em; margin-top: 2px; }
  .gauge-detail { font-size: 0.7rem; color: var(--muted); text-align: center; }

  /* ── Module table ── */
  .module-table { width: 100%; border-collapse: collapse; }
  .module-table th { text-align: left; font-size: 0.72rem; color: var(--muted); text-transform: uppercase; letter-spacing: 0.05em; padding: 8px 10px; border-bottom: 1px solid var(--border); }
  .module-table td { padding: 9px 10px; font-size: 0.8rem; border-bottom: 1px solid rgba(51,65,85,0.4); white-space: nowrap; }
  .module-table tr:last-child td { border-bottom: none; }
  .module-table tr:hover td { background: rgba(255,255,255,0.02); }
  .progress-mini { height: 5px; background: rgba(255,255,255,0.08); border-radius: 99px; overflow: hidden; min-width: 60px; }
  .progress-mini-fill { height: 100%; border-radius: 99px; background: var(--green); transition: width 0.5s; }

  /* ── Badges ── */
  .badge { display: inline-flex; align-items: center; gap: 3px; padding: 2px 7px; border-radius: 999px; font-size: 0.68rem; font-weight: 600; }
  .badge.pass    { background: var(--green-dim);  color: var(--green); }
  .badge.fail    { background: var(--red-dim);    color: var(--red); }
  .badge.partial { background: var(--yellow-dim); color: var(--yellow); }
  .badge.skip    { background: rgba(148,163,184,0.15); color: var(--muted); }
  .badge.ok      { background: var(--green-dim);  color: var(--green); }
  .badge.issues  { background: var(--red-dim);    color: var(--red); }
  .badge.crit    { background: var(--red-dim);    color: var(--red); }
  .badge.high    { background: var(--yellow-dim); color: var(--yellow); }
  .badge.medium  { background: rgba(245,158,11,0.1); color: #FBBF24; }
  .badge.low     { background: rgba(34,197,94,0.1); color: var(--green); }
  .badge.medium-sev { background: var(--yellow-dim); color: var(--yellow); }

  /* ── Test table ── */
  .test-toolbar { display: flex; gap: 10px; margin-bottom: 14px; flex-wrap: wrap; align-items: center; }
  .test-toolbar input { background: var(--bg); border: 1px solid var(--border); color: var(--text); padding: 6px 12px; border-radius: 8px; font-size: 0.8rem; width: 220px; outline: none; }
  .test-toolbar input:focus { border-color: var(--indigo); }
  .filter-btn { padding: 5px 12px; border-radius: 8px; border: 1px solid var(--border); background: var(--bg); color: var(--muted); font-size: 0.75rem; cursor: pointer; transition: all 0.15s; }
  .filter-btn:hover, .filter-btn.active { background: var(--indigo-dim); border-color: var(--indigo); color: var(--text); }
  .test-table { width: 100%; border-collapse: collapse; font-size: 0.78rem; }
  .test-table th { text-align: left; padding: 9px 10px; background: rgba(255,255,255,0.03); border-bottom: 1px solid var(--border); color: var(--muted); font-size: 0.7rem; text-transform: uppercase; letter-spacing: 0.05em; cursor: pointer; user-select: none; white-space: nowrap; }
  .test-table th:hover { color: var(--text); }
  .test-table th .sort-icon { opacity: 0.4; margin-left: 3px; }
  .test-table td { padding: 9px 10px; border-bottom: 1px solid rgba(51,65,85,0.35); vertical-align: top; }
  .test-table tr:hover td { background: rgba(255,255,255,0.025); }
  .test-table tr.hidden { display: none; }
  .test-id { font-family: monospace; color: var(--muted); font-size: 0.75rem; }
  .test-desc { color: var(--text); max-width: 320px; }
  .test-time { font-variant-numeric: tabular-nums; color: var(--muted); }
  .test-time.slow { color: var(--yellow); }
  .test-time.vslow { color: var(--red); }
  td details summary { cursor: pointer; color: var(--muted); font-size: 0.7rem; }
  td details[open] { background: rgba(0,0,0,0.2); padding: 6px 8px; border-radius: 6px; margin-top: 4px; }
  td details p { font-size: 0.72rem; color: var(--muted); margin: 2px 0; }
  td details p strong { color: var(--text); }
  .pagination { display: flex; gap: 6px; align-items: center; margin-top: 14px; font-size: 0.78rem; color: var(--muted); }
  .page-btn { padding: 4px 10px; border-radius: 6px; border: 1px solid var(--border); background: var(--bg); color: var(--muted); cursor: pointer; transition: all 0.1s; }
  .page-btn:hover, .page-btn.active { background: var(--indigo); border-color: var(--indigo); color: white; }
  .page-info { flex: 1; text-align: center; }

  /* ── Timing histogram ── */
  .timing-bars { display: flex; flex-direction: column; gap: 8px; }
  .timing-row { display: flex; align-items: center; gap: 10px; font-size: 0.75rem; }
  .timing-label { width: 110px; color: var(--muted); text-align: right; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .timing-bar-track { flex: 1; height: 8px; background: rgba(255,255,255,0.06); border-radius: 99px; overflow: hidden; }
  .timing-bar-fill { height: 100%; border-radius: 99px; background: linear-gradient(90deg, var(--indigo), var(--purple)); }
  .timing-val { width: 48px; text-align: right; color: var(--muted); font-variant-numeric: tabular-nums; }

  /* ── Checklist ── */
  .checklist { display: flex; flex-direction: column; gap: 8px; }
  .check-row { display: flex; align-items: flex-start; gap: 10px; font-size: 0.8rem; }
  .check-icon { width: 18px; height: 18px; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-size: 0.65rem; flex-shrink: 0; margin-top: 1px; }
  .check-icon.ok { background: var(--green-dim); color: var(--green); }
  .check-icon.pending { background: rgba(255,255,255,0.06); color: var(--muted); border: 1px dashed var(--border); }
  .check-text { color: var(--text); line-height: 1.4; }
  .check-text.pending-text { color: var(--muted); }

  /* ── Severity breakdown ── */
  .sev-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
  .sev-card { border-radius: 8px; padding: 12px 14px; display: flex; justify-content: space-between; align-items: center; }
  .sev-card.crit { background: var(--red-dim); border: 1px solid rgba(239,68,68,0.3); }
  .sev-card.high { background: var(--yellow-dim); border: 1px solid rgba(245,158,11,0.3); }
  .sev-card.med { background: var(--indigo-dim); border: 1px solid rgba(99,102,241,0.3); }
  .sev-card.low { background: var(--green-dim); border: 1px solid rgba(34,197,94,0.3); }
  .sev-name { font-size: 0.72rem; font-weight: 700; text-transform: uppercase; letter-spacing: 0.06em; }
  .sev-card.crit .sev-name { color: var(--red); }
  .sev-card.high .sev-name { color: var(--yellow); }
  .sev-card.med  .sev-name { color: var(--indigo); }
  .sev-card.low  .sev-name { color: var(--green); }
  .sev-count { font-size: 1.6rem; font-weight: 800; }
  .sev-card.crit .sev-count { color: var(--red); }
  .sev-card.high .sev-count { color: var(--yellow); }
  .sev-card.med  .sev-count { color: var(--indigo); }
  .sev-card.low  .sev-count { color: var(--green); }

  /* ── Footer ── */
  footer { text-align: center; padding: 20px; color: var(--muted); font-size: 0.72rem; border-top: 1px solid var(--border); margin-top: 24px; }
  a { color: var(--indigo); text-decoration: none; }
  a:hover { text-decoration: underline; }

  /* ── Scroll ── */
  .scroll-x { overflow-x: auto; }
</style>
</head>
<body>

<header>
  <div class="hdr-left">
    <h1>EdTech Platform — QA Dashboard</h1>
    <p>JEE / NEET / GATE Prep | ${now.split("T")[0]} | ${stats.total} test cases across ${modules.length} modules</p>
  </div>
  <div class="hdr-right">
    <span class="deploy-badge">${deployReady ? "✅ READY TO DEPLOY" : "❌ CRITICAL ISSUES"}</span>
    <span class="meta-tag">⏱ ${stats.elapsed}s</span>
    <span class="meta-tag">🎯 ${stats.successPct}%</span>
    <span class="meta-tag">📡 ${stats.coverage?.pct ?? "—"}% covered</span>
  </div>
</header>

<main>

<!-- ── Stat Cards ── -->
<div class="stat-grid">
  <div class="stat-card total">
    <div class="stat-label">Total Tests</div>
    <div class="stat-value">${stats.total}</div>
    <div class="stat-sub">${modules.length} modules</div>
  </div>
  <div class="stat-card pass">
    <div class="stat-label">Passed</div>
    <div class="stat-value">${passed.length}</div>
    <div class="stat-sub">${((passed.length/stats.total)*100).toFixed(1)}% of total</div>
  </div>
  <div class="stat-card fail">
    <div class="stat-label">Failed</div>
    <div class="stat-value">${failed.length}</div>
    <div class="stat-sub">${failed.filter(t=>t.severity==="CRITICAL").length} critical</div>
  </div>
  <div class="stat-card partial">
    <div class="stat-label">Partial</div>
    <div class="stat-value">${partial.length}</div>
    <div class="stat-sub">External deps</div>
  </div>
  <div class="stat-card skip">
    <div class="stat-label">Skipped</div>
    <div class="stat-value">${skipped.length}</div>
    <div class="stat-sub">By design</div>
  </div>
  <div class="stat-card rate">
    <div class="stat-label">Success Rate</div>
    <div class="stat-value">${stats.successPct}%</div>
    <div class="stat-sub">excl. skipped</div>
  </div>
  <div class="stat-card cov">
    <div class="stat-label">API Coverage</div>
    <div class="stat-value">${stats.coverage?.pct ?? "—"}%</div>
    <div class="stat-sub">${stats.coverage?.hit ?? "—"}/${stats.coverage?.total ?? 109} endpoints</div>
  </div>
  <div class="stat-card avg">
    <div class="stat-label">Avg Response</div>
    <div class="stat-value">${stats.timing?.avg ?? "—"}<span style="font-size:1rem">ms</span></div>
    <div class="stat-sub">p95: ${stats.timing?.p95 ?? "—"}ms</div>
  </div>
</div>

<!-- ── Row 1: Donut + Bar + Coverage ── -->
<div class="grid-3">
  <div class="card">
    <h2><span class="icon">🍩</span> Test Result Distribution</h2>
    <div class="chart-wrap md"><canvas id="donutChart"></canvas></div>
  </div>
  <div class="card">
    <h2><span class="icon">📊</span> Module Results</h2>
    <div class="chart-wrap md"><canvas id="moduleBarChart"></canvas></div>
  </div>
  <div class="card">
    <h2><span class="icon">📡</span> API Coverage</h2>
    <div class="gauge-wrap" style="padding-top:16px">
      <div class="gauge-ring">
        <canvas id="gaugeChart" width="160" height="160"></canvas>
        <div class="gauge-center">
          <div class="gauge-pct">${stats.coverage?.pct ?? "—"}%</div>
          <div class="gauge-label">Coverage</div>
        </div>
      </div>
      <div class="gauge-detail">${stats.coverage?.hit ?? "—"} of ${stats.coverage?.total ?? 109} endpoints hit<br>during this QA run</div>
      <div class="sev-grid" style="margin-top:12px; width:100%">
        <div class="sev-card crit"><span class="sev-name">CRITICAL</span><span class="sev-count">${results.filter(r=>r.severity==="CRITICAL").length}</span></div>
        <div class="sev-card high"><span class="sev-name">HIGH</span><span class="sev-count">${results.filter(r=>r.severity==="HIGH").length}</span></div>
        <div class="sev-card med"><span class="sev-name">MEDIUM</span><span class="sev-count">${results.filter(r=>r.severity==="MEDIUM").length}</span></div>
        <div class="sev-card low"><span class="sev-name">LOW</span><span class="sev-count">${results.filter(r=>r.severity==="LOW").length}</span></div>
      </div>
    </div>
  </div>
</div>

<!-- ── Row 2: Module Table + Performance ── -->
<div class="grid-2">
  <div class="card">
    <h2><span class="icon">🗂</span> Module Status Overview</h2>
    <table class="module-table">
      <thead><tr>
        <th>Module</th><th>Pass</th><th>Fail</th><th>Part</th><th>Skip</th>
        <th>Progress</th><th>Status</th>
      </tr></thead>
      <tbody>
        ${moduleData.map(m => {
          const pct = Math.round((m.pass / m.total) * 100);
          const status = m.fail > 0 ? "issues" : m.partial > 0 ? "partial" : m.skip > 0 ? "skip" : "ok";
          const statusLabel = m.fail > 0 ? "Issues" : m.partial > 0 ? "Partial" : m.skip > 0 ? "Skipped" : "Pass";
          return `<tr>
            <td style="font-weight:600">${m.name}</td>
            <td style="color:#22C55E">${m.pass}</td>
            <td style="color:${m.fail>0?"#EF4444":"#94A3B8"}">${m.fail}</td>
            <td style="color:${m.partial>0?"#F59E0B":"#94A3B8"}">${m.partial}</td>
            <td style="color:${m.skip>0?"#94A3B8":"#334155"}">${m.skip}</td>
            <td>
              <div class="progress-mini">
                <div class="progress-mini-fill" style="width:${pct}%;background:${m.fail>0?"#EF4444":m.partial>0?"#F59E0B":"#22C55E"}"></div>
              </div>
            </td>
            <td><span class="badge ${status}">${statusLabel}</span></td>
          </tr>`;
        }).join("")}
      </tbody>
    </table>
  </div>

  <div class="card">
    <h2><span class="icon">⚡</span> Response Times by Module</h2>
    <div class="timing-bars" id="timingBars">
      ${moduleData.filter(m => m.avgTime > 0).sort((a,b)=>b.avgTime-a.avgTime).map(m => {
        const maxT = Math.max(...moduleData.map(x => x.avgTime), 1);
        const pct = Math.round((m.avgTime / maxT) * 100);
        return `<div class="timing-row">
          <span class="timing-label">${m.name}</span>
          <div class="timing-bar-track"><div class="timing-bar-fill" style="width:${pct}%"></div></div>
          <span class="timing-val">${m.avgTime}ms</span>
        </div>`;
      }).join("")}
    </div>
    <div style="margin-top:20px">
      <div class="chart-wrap sm"><canvas id="perfChart"></canvas></div>
    </div>
  </div>
</div>

<!-- ── Row 3: Deployment Checklist + Issues ── -->
<div class="grid-2">
  <div class="card">
    <h2><span class="icon">🚀</span> Deployment Readiness</h2>
    <div style="margin-bottom:14px">
      <div style="background:${deployReady?"rgba(34,197,94,0.12)":"rgba(239,68,68,0.12)"}; border:1px solid ${deployReady?"#22C55E":"#EF4444"}; border-radius:8px; padding:10px 14px; font-size:0.85rem; font-weight:700; color:${deployReady?"#22C55E":"#EF4444"}">
        ${deployReady ? "✅  READY FOR PRODUCTION DEPLOYMENT" : "❌  NOT READY — CRITICAL ISSUES FOUND"}
      </div>
    </div>
    <div class="checklist">
      ${[
        [results.find(r=>r.id==="HC-001")?.status==="PASS",  "Health endpoint responding"],
        [results.find(r=>r.id==="A-001")?.status==="PASS",   "User registration working"],
        [results.find(r=>r.id==="A-006")?.status==="PASS",   "Login (JWT) working"],
        [results.find(r=>r.id==="A-010")?.status==="PASS",   "Auth guard protecting endpoints"],
        [results.find(r=>r.id==="A-012b")?.status==="PASS",  "Token revocation working"],
        [results.find(r=>r.id==="SEC-001")?.status==="PASS", "SQL injection protection"],
        [results.find(r=>r.id==="SEC-003")?.status==="PASS", "Mass assignment protection"],
        [results.find(r=>r.id==="AD-002")?.status==="PASS",  "Admin role separation"],
        [false, "RESEND_API_KEY configured"],
        [false, "B2 storage credentials set"],
        [false, "VAPID keys configured"],
        [false, "Rate limiting (production mode)"],
      ].map(([ok, label]) => `
        <div class="check-row">
          <div class="check-icon ${ok?"ok":"pending"}">${ok?"✓":"○"}</div>
          <span class="check-text ${ok?"":"pending-text"}">${label}</span>
        </div>`).join("")}
    </div>
  </div>

  <div class="card">
    <h2><span class="icon">🐛</span> Issues & Findings</h2>
    ${failed.length === 0 && partial.length === 0
      ? `<div style="text-align:center;padding:32px 0;color:var(--green)">
           <div style="font-size:2rem">🎉</div>
           <div style="font-weight:700;margin-top:8px">Zero Failures!</div>
           <div style="color:var(--muted);font-size:0.8rem;margin-top:4px">All tests passed cleanly.</div>
         </div>`
      : `<table class="module-table">
           <thead><tr><th>ID</th><th>Module</th><th>Issue</th><th>Severity</th><th>Status</th></tr></thead>
           <tbody>
             ${[...failed, ...partial].map(t => `
               <tr>
                 <td class="test-id">${t.id}</td>
                 <td>${t.module}</td>
                 <td style="font-size:0.75rem;max-width:200px">${t.desc.slice(0,50)}</td>
                 <td><span class="badge ${t.severity==="CRITICAL"?"crit":t.severity==="HIGH"?"high":"medium-sev"}">${t.severity}</span></td>
                 <td><span class="badge ${t.status==="FAIL"?"fail":"partial"}">${t.status}</span></td>
               </tr>`).join("")}
           </tbody>
         </table>`}
    ${partial.length > 0 ? `
      <div style="margin-top:14px;padding:10px 12px;background:rgba(245,158,11,0.08);border:1px solid rgba(245,158,11,0.25);border-radius:8px;font-size:0.75rem;color:#FBBF24">
        ⚠️ <strong>${partial.length} partial test(s)</strong> require external secrets (RESEND, B2, VAPID) to fully pass.
      </div>` : ""}
  </div>
</div>

<!-- ── Row 4: Full Test Table ── -->
<div class="card" style="margin-bottom:22px">
  <h2><span class="icon">📋</span> All Test Cases</h2>
  <div class="test-toolbar">
    <input type="text" id="searchInput" placeholder="Search test ID, module, description…" oninput="filterTests()">
    <button class="filter-btn active" data-filter="ALL" onclick="setFilter('ALL')">All (${stats.total})</button>
    <button class="filter-btn" data-filter="PASS" onclick="setFilter('PASS')">✅ Pass (${passed.length})</button>
    <button class="filter-btn" data-filter="FAIL" onclick="setFilter('FAIL')">❌ Fail (${failed.length})</button>
    <button class="filter-btn" data-filter="PARTIAL" onclick="setFilter('PARTIAL')">⚠️ Partial (${partial.length})</button>
    <button class="filter-btn" data-filter="SKIP" onclick="setFilter('SKIP')">⊘ Skip (${skipped.length})</button>
    <span id="resultCount" style="margin-left:auto;font-size:0.75rem;color:var(--muted)">Showing ${stats.total} results</span>
  </div>
  <div class="scroll-x">
    <table class="test-table" id="testTable">
      <thead>
        <tr>
          <th onclick="sortTable(0)">ID <span class="sort-icon">↕</span></th>
          <th onclick="sortTable(1)">Module <span class="sort-icon">↕</span></th>
          <th onclick="sortTable(2)">Feature <span class="sort-icon">↕</span></th>
          <th>Description</th>
          <th onclick="sortTable(4)">Severity <span class="sort-icon">↕</span></th>
          <th onclick="sortTable(5)">Time <span class="sort-icon">↕</span></th>
          <th onclick="sortTable(6)">Status <span class="sort-icon">↕</span></th>
          <th>Details</th>
        </tr>
      </thead>
      <tbody id="testTableBody">
        ${results.map(t => {
          const timeClass = t.responseTime > 500 ? "vslow" : t.responseTime > 200 ? "slow" : "";
          const sevClass = t.severity === "CRITICAL" ? "crit" : t.severity === "HIGH" ? "high" : t.severity === "MEDIUM" ? "medium-sev" : "low";
          const stClass = t.status === "PASS" ? "pass" : t.status === "FAIL" ? "fail" : t.status === "PARTIAL" ? "partial" : "skip";
          return `<tr data-status="${t.status}" data-module="${t.module}">
            <td class="test-id">${t.id}</td>
            <td>${t.module}</td>
            <td style="font-size:0.75rem;color:var(--muted)">${t.feature}</td>
            <td class="test-desc">${t.desc.slice(0,55)}${t.desc.length>55?"…":""}</td>
            <td><span class="badge ${sevClass}">${t.severity}</span></td>
            <td class="test-time ${timeClass}">${t.responseTime > 0 ? t.responseTime + "ms" : "—"}</td>
            <td><span class="badge ${stClass}">${t.status}</span></td>
            <td>
              <details>
                <summary>view</summary>
                <p><strong>Expected:</strong> ${String(t.expected || "").slice(0,60)}</p>
                <p><strong>Actual:</strong> ${String(t.actual || "").slice(0,60)}</p>
                ${t.error ? `<p><strong>Error:</strong> ${t.error.slice(0,80)}</p>` : ""}
                ${t.fix ? `<p><strong>Fix:</strong> ${t.fix.slice(0,80)}</p>` : ""}
                <p><strong>Steps:</strong> ${(t.steps||"").slice(0,80)}</p>
              </details>
            </td>
          </tr>`;
        }).join("")}
      </tbody>
    </table>
  </div>
</div>

</main>

<footer>
  EdTech QA Suite v2.0 &nbsp;|&nbsp; Generated ${now} &nbsp;|&nbsp; Node.js ${process.version}
  &nbsp;|&nbsp;
  <a href="passed-tests.md">passed-tests.md</a> &nbsp;|&nbsp;
  <a href="failed-tests.md">failed-tests.md</a> &nbsp;|&nbsp;
  <a href="final-summary-report.md">summary.md</a> &nbsp;|&nbsp;
  <a href="final-summary-report.pdf">summary.pdf</a>
</footer>

<script>
const RESULTS = ${resultsJson};
let currentFilter = 'ALL';
let sortCol = -1;
let sortDir = 1;

// ── Charts ────────────────────────────────────────────────────────────────────
Chart.defaults.color = '#94A3B8';
Chart.defaults.font.family = "'Segoe UI', system-ui, sans-serif";

// Donut
new Chart(document.getElementById('donutChart').getContext('2d'), {
  type: 'doughnut',
  data: {
    labels: ['Passed', 'Failed', 'Partial', 'Skipped'],
    datasets: [{ data: [${passed.length}, ${failed.length}, ${partial.length}, ${skipped.length}],
      backgroundColor: ['rgba(34,197,94,0.85)','rgba(239,68,68,0.85)','rgba(245,158,11,0.85)','rgba(148,163,184,0.5)'],
      borderColor: ['#22C55E','#EF4444','#F59E0B','#64748B'],
      borderWidth: 2, hoverOffset: 8 }]
  },
  options: {
    responsive: true, maintainAspectRatio: false,
    cutout: '70%',
    plugins: {
      legend: { position: 'bottom', labels: { padding: 14, font: { size: 11 } } },
      tooltip: { callbacks: { label: ctx => \` \${ctx.label}: \${ctx.parsed} (\${((ctx.parsed/${stats.total})*100).toFixed(1)}%)\` } }
    }
  }
});

// Module stacked bar
const modLabels = ${JSON.stringify(modules)};
const modPass   = ${JSON.stringify(moduleData.map(m => m.pass))};
const modFail   = ${JSON.stringify(moduleData.map(m => m.fail))};
const modPartial= ${JSON.stringify(moduleData.map(m => m.partial))};
const modSkip   = ${JSON.stringify(moduleData.map(m => m.skip))};

new Chart(document.getElementById('moduleBarChart').getContext('2d'), {
  type: 'bar',
  data: {
    labels: modLabels,
    datasets: [
      { label: 'Pass',    data: modPass,    backgroundColor: 'rgba(34,197,94,0.8)',   borderRadius: 3 },
      { label: 'Fail',    data: modFail,    backgroundColor: 'rgba(239,68,68,0.8)',   borderRadius: 3 },
      { label: 'Partial', data: modPartial, backgroundColor: 'rgba(245,158,11,0.8)', borderRadius: 3 },
      { label: 'Skip',    data: modSkip,    backgroundColor: 'rgba(148,163,184,0.5)', borderRadius: 3 },
    ]
  },
  options: {
    responsive: true, maintainAspectRatio: false,
    scales: {
      x: { stacked: true, grid: { color: 'rgba(51,65,85,0.5)' }, ticks: { font: { size: 9 }, maxRotation: 45 } },
      y: { stacked: true, grid: { color: 'rgba(51,65,85,0.5)' }, ticks: { stepSize: 1 } }
    },
    plugins: { legend: { position: 'bottom', labels: { padding: 12, font: { size: 10 } } } }
  }
});

// Coverage gauge
new Chart(document.getElementById('gaugeChart').getContext('2d'), {
  type: 'doughnut',
  data: {
    datasets: [{
      data: [${coveragePct}, ${100 - coveragePct}],
      backgroundColor: ['rgba(6,182,212,0.85)', 'rgba(30,41,59,0.6)'],
      borderColor: ['#06B6D4', 'transparent'], borderWidth: [2, 0],
    }]
  },
  options: {
    responsive: false, cutout: '72%', rotation: -90, circumference: 180,
    plugins: { legend: { display: false }, tooltip: { enabled: false } }
  }
});

// Performance chart
const perfModules = ${JSON.stringify(moduleData.filter(m=>m.avgTime>0).sort((a,b)=>b.avgTime-a.avgTime).slice(0,10).map(m=>m.name))};
const perfTimes   = ${JSON.stringify(moduleData.filter(m=>m.avgTime>0).sort((a,b)=>b.avgTime-a.avgTime).slice(0,10).map(m=>m.avgTime))};

new Chart(document.getElementById('perfChart').getContext('2d'), {
  type: 'bar',
  data: {
    labels: perfModules,
    datasets: [{ label: 'Avg Response (ms)', data: perfTimes,
      backgroundColor: perfTimes.map(t => t > 500 ? 'rgba(239,68,68,0.7)' : t > 200 ? 'rgba(245,158,11,0.7)' : 'rgba(99,102,241,0.7)'),
      borderRadius: 4 }]
  },
  options: {
    responsive: true, maintainAspectRatio: false, indexAxis: 'y',
    scales: {
      x: { grid: { color: 'rgba(51,65,85,0.4)' }, ticks: { font: { size: 9 } } },
      y: { grid: { display: false }, ticks: { font: { size: 9 } } }
    },
    plugins: {
      legend: { display: false },
      tooltip: { callbacks: { label: ctx => \` \${ctx.parsed.x}ms\` } }
    }
  }
});

// ── Filtering ──────────────────────────────────────────────────────────────────
function setFilter(f) {
  currentFilter = f;
  document.querySelectorAll('.filter-btn').forEach(b => b.classList.toggle('active', b.dataset.filter === f));
  filterTests();
}

function filterTests() {
  const q = document.getElementById('searchInput').value.toLowerCase();
  const rows = document.querySelectorAll('#testTableBody tr');
  let visible = 0;
  rows.forEach(row => {
    const statusMatch = currentFilter === 'ALL' || row.dataset.status === currentFilter;
    const textMatch = !q || row.textContent.toLowerCase().includes(q);
    const show = statusMatch && textMatch;
    row.classList.toggle('hidden', !show);
    if (show) visible++;
  });
  document.getElementById('resultCount').textContent = \`Showing \${visible} results\`;
}

// ── Sorting ────────────────────────────────────────────────────────────────────
function sortTable(col) {
  if (sortCol === col) sortDir *= -1; else { sortCol = col; sortDir = 1; }
  const tbody = document.getElementById('testTableBody');
  const rows = [...tbody.querySelectorAll('tr')];
  rows.sort((a, b) => {
    const av = a.cells[col].textContent.trim();
    const bv = b.cells[col].textContent.trim();
    const an = parseFloat(av); const bn = parseFloat(bv);
    if (!isNaN(an) && !isNaN(bn)) return (an - bn) * sortDir;
    return av.localeCompare(bv) * sortDir;
  });
  rows.forEach(r => tbody.appendChild(r));
}
</script>
</body>
</html>`;

  writeFileSync(join(__dir, "reports", "dashboard.html"), html);
  console.log("  ✓ dashboard.html");
}
