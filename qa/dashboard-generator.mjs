/**
 * Generates the interactive QA dashboard HTML file.
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
  }));

  const deployReady = failed.filter(t => ["Security","Auth"].includes(t.module)).length === 0;

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
    --bg: #0F172A; --card: #1E293B; --border: #334155;
    --indigo: #6366F1; --green: #22C55E; --red: #EF4444;
    --yellow: #F59E0B; --purple: #A855F7; --text: #E2E8F0;
    --muted: #94A3B8; --radius: 12px;
  }
  body { background: var(--bg); color: var(--text); font-family: 'Segoe UI', system-ui, sans-serif; min-height: 100vh; }
  header { background: linear-gradient(135deg, #1E293B 0%, #0F172A 100%); border-bottom: 1px solid var(--border); padding: 24px 32px; display: flex; justify-content: space-between; align-items: center; }
  header h1 { font-size: 1.5rem; font-weight: 700; background: linear-gradient(90deg, var(--indigo), var(--purple)); -webkit-background-clip: text; -webkit-text-fill-color: transparent; }
  header .meta { font-size: 0.8rem; color: var(--muted); text-align: right; }
  .deploy-badge { display: inline-flex; align-items: center; gap: 8px; padding: 6px 14px; border-radius: 999px; font-size: 0.8rem; font-weight: 600; ${deployReady ? "background: rgba(34,197,94,0.15); color: #22C55E; border: 1px solid #22C55E;" : "background: rgba(239,68,68,0.15); color: #EF4444; border: 1px solid #EF4444;"} }
  main { padding: 32px; max-width: 1400px; margin: 0 auto; }
  .stat-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: 16px; margin-bottom: 32px; }
  .stat-card { background: var(--card); border: 1px solid var(--border); border-radius: var(--radius); padding: 20px; text-align: center; position: relative; overflow: hidden; }
  .stat-card::before { content: ''; position: absolute; top: 0; left: 0; right: 0; height: 3px; }
  .stat-card.total::before { background: var(--indigo); }
  .stat-card.pass::before  { background: var(--green); }
  .stat-card.fail::before  { background: var(--red); }
  .stat-card.partial::before { background: var(--yellow); }
  .stat-card.skip::before  { background: var(--muted); }
  .stat-card.rate::before  { background: var(--purple); }
  .stat-value { font-size: 2.5rem; font-weight: 800; line-height: 1; margin-bottom: 8px; }
  .stat-card.total .stat-value  { color: var(--indigo); }
  .stat-card.pass .stat-value   { color: var(--green); }
  .stat-card.fail .stat-value   { color: var(--red); }
  .stat-card.partial .stat-value { color: var(--yellow); }
  .stat-card.skip .stat-value   { color: var(--muted); }
  .stat-card.rate .stat-value   { color: var(--purple); }
  .stat-label { font-size: 0.8rem; color: var(--muted); text-transform: uppercase; letter-spacing: 0.05em; }
  .grid-2 { display: grid; grid-template-columns: 1fr 1fr; gap: 24px; margin-bottom: 32px; }
  @media (max-width: 900px) { .grid-2 { grid-template-columns: 1fr; } }
  .card { background: var(--card); border: 1px solid var(--border); border-radius: var(--radius); padding: 24px; }
  .card h2 { font-size: 1rem; font-weight: 600; margin-bottom: 20px; color: var(--text); display: flex; align-items: center; gap: 8px; }
  .chart-wrap { position: relative; height: 260px; }
  .module-table { width: 100%; border-collapse: collapse; }
  .module-table th { text-align: left; font-size: 0.75rem; color: var(--muted); text-transform: uppercase; letter-spacing: 0.05em; padding: 8px 12px; border-bottom: 1px solid var(--border); }
  .module-table td { padding: 10px 12px; font-size: 0.875rem; border-bottom: 1px solid rgba(51,65,85,0.5); }
  .module-table tr:last-child td { border-bottom: none; }
  .badge { display: inline-flex; align-items: center; gap: 4px; padding: 2px 8px; border-radius: 999px; font-size: 0.7rem; font-weight: 600; }
  .badge.pass    { background: rgba(34,197,94,0.15);  color: var(--green); }
  .badge.fail    { background: rgba(239,68,68,0.15);  color: var(--red); }
  .badge.partial { background: rgba(245,158,11,0.15); color: var(--yellow); }
  .badge.skip    { background: rgba(148,163,184,0.15);color: var(--muted); }
  .badge.ok      { background: rgba(34,197,94,0.15);  color: var(--green); }
  .badge.issues  { background: rgba(239,68,68,0.15);  color: var(--red); }
  .tests-section { margin-bottom: 32px; }
  .tests-section h2 { font-size: 1rem; font-weight: 600; margin-bottom: 16px; display: flex; align-items: center; gap: 8px; }
  .filter-bar { display: flex; gap: 8px; margin-bottom: 16px; flex-wrap: wrap; }
  .filter-btn { padding: 6px 14px; border-radius: 999px; border: 1px solid var(--border); background: transparent; color: var(--muted); cursor: pointer; font-size: 0.8rem; transition: all 0.2s; }
  .filter-btn:hover, .filter-btn.active { border-color: var(--indigo); color: var(--indigo); background: rgba(99,102,241,0.1); }
  .test-row { background: var(--card); border: 1px solid var(--border); border-radius: 8px; padding: 12px 16px; margin-bottom: 8px; display: grid; grid-template-columns: 90px 120px 160px 1fr 80px; gap: 12px; align-items: center; font-size: 0.875rem; transition: border-color 0.2s; }
  .test-row:hover { border-color: var(--indigo); }
  .test-row .test-id { font-family: monospace; color: var(--indigo); font-weight: 600; }
  .test-row .test-module { color: var(--muted); font-size: 0.8rem; }
  .test-row .test-desc { color: var(--text); }
  .test-row .test-error { font-size: 0.75rem; color: var(--red); margin-top: 4px; }
  .test-row .test-fix { font-size: 0.75rem; color: var(--yellow); margin-top: 2px; }
  .progress-bar { width: 100%; background: var(--border); border-radius: 999px; height: 8px; overflow: hidden; margin-top: 8px; }
  .progress-fill { height: 100%; border-radius: 999px; background: linear-gradient(90deg, var(--indigo), var(--purple)); transition: width 0.8s ease; }
  .search-input { width: 100%; padding: 10px 16px; background: var(--card); border: 1px solid var(--border); border-radius: 8px; color: var(--text); font-size: 0.875rem; margin-bottom: 16px; }
  .search-input:focus { outline: none; border-color: var(--indigo); }
  .section-divider { border: none; border-top: 1px solid var(--border); margin: 32px 0; }
  .bug-list { list-style: none; }
  .bug-item { padding: 12px 16px; margin-bottom: 8px; border-radius: 8px; border-left: 3px solid; }
  .bug-item.critical { border-color: var(--red); background: rgba(239,68,68,0.08); }
  .bug-item.high { border-color: var(--yellow); background: rgba(245,158,11,0.08); }
  .bug-item.medium { border-color: var(--purple); background: rgba(168,85,247,0.08); }
  .bug-item .bug-id { font-family: monospace; font-weight: 700; font-size: 0.8rem; }
  .bug-item .bug-desc { font-size: 0.875rem; margin-top: 2px; }
  .bug-item .bug-fix { font-size: 0.75rem; color: var(--muted); margin-top: 4px; }
  .empty-state { text-align: center; padding: 40px; color: var(--muted); }
  .empty-state .icon { font-size: 2.5rem; margin-bottom: 8px; }
  footer { text-align: center; padding: 24px; color: var(--muted); font-size: 0.8rem; border-top: 1px solid var(--border); margin-top: 32px; }
</style>
</head>
<body>
<header>
  <div>
    <h1>📊 EdTech QA Dashboard</h1>
    <div class="meta">EdTech Study Platform (JEE/NEET/GATE) &nbsp;·&nbsp; ${new Date().toLocaleString()}</div>
  </div>
  <span class="deploy-badge">${deployReady ? "✅ Ready to Deploy" : "❌ Not Ready to Deploy"}</span>
</header>
<main>

<!-- STAT CARDS -->
<div class="stat-grid">
  <div class="stat-card total"><div class="stat-value">${stats.total}</div><div class="stat-label">Total Tests</div></div>
  <div class="stat-card pass"><div class="stat-value">${passed.length}</div><div class="stat-label">✅ Passed</div></div>
  <div class="stat-card fail"><div class="stat-value">${failed.length}</div><div class="stat-label">❌ Failed</div></div>
  <div class="stat-card partial"><div class="stat-value">${partial.length}</div><div class="stat-label">⚠️ Partial</div></div>
  <div class="stat-card skip"><div class="stat-value">${skipped.length}</div><div class="stat-label">⊘ Skipped</div></div>
  <div class="stat-card rate"><div class="stat-value">${stats.successPct}%</div><div class="stat-label">Success Rate</div></div>
</div>

<div style="margin-bottom:32px;">
  <div style="display:flex;justify-content:space-between;margin-bottom:6px;font-size:0.8rem;color:var(--muted);">
    <span>Overall Progress</span><span>${stats.successPct}%</span>
  </div>
  <div class="progress-bar"><div class="progress-fill" style="width:${stats.successPct}%"></div></div>
</div>

<!-- CHARTS -->
<div class="grid-2">
  <div class="card">
    <h2>📈 Test Distribution</h2>
    <div class="chart-wrap"><canvas id="donutChart"></canvas></div>
  </div>
  <div class="card">
    <h2>🏗️ Module Status</h2>
    <div class="chart-wrap"><canvas id="moduleChart"></canvas></div>
  </div>
</div>

<!-- MODULE TABLE -->
<div class="card" style="margin-bottom:32px;">
  <h2>📋 Module-wise Results</h2>
  <table class="module-table">
    <thead><tr><th>Module</th><th>✅ Pass</th><th>❌ Fail</th><th>⚠️ Partial</th><th>⊘ Skip</th><th>Status</th></tr></thead>
    <tbody>
      ${moduleData.map(m => `
      <tr>
        <td><strong>${m.name}</strong></td>
        <td><span class="badge pass">${m.pass}</span></td>
        <td><span class="badge fail">${m.fail}</span></td>
        <td><span class="badge partial">${m.partial}</span></td>
        <td><span class="badge skip">${m.skip}</span></td>
        <td><span class="badge ${m.fail > 0 ? "issues" : "ok"}">${m.fail > 0 ? "⚠ Issues" : "✓ OK"}</span></td>
      </tr>`).join("")}
    </tbody>
  </table>
</div>

<!-- BUG REPORT -->
<div class="card" style="margin-bottom:32px;">
  <h2>🐛 Bug Report</h2>
  ${failed.length === 0 ? `<div class="empty-state"><div class="icon">🎉</div><div>No bugs found! All tests passed.</div></div>` : `
  <ul class="bug-list">
    ${failed.map(t => {
      const sev = t.module === "Security" ? "critical" : ["Auth","Subjects","Chapters","Topics","Exams"].includes(t.module) ? "high" : "medium";
      const sevLabel = sev === "critical" ? "🔴 CRITICAL" : sev === "high" ? "🟠 HIGH" : "🟡 MEDIUM";
      return `<li class="bug-item ${sev}">
        <div><span class="bug-id">[${t.id}]</span> <strong>${sevLabel}</strong></div>
        <div class="bug-desc">${t.desc}</div>
        <div class="bug-fix">💡 Fix: ${t.fix || "Investigate route handler"}</div>
      </li>`;
    }).join("")}
  </ul>`}
</div>

<!-- PARTIAL TESTS -->
${partial.length > 0 ? `
<div class="card" style="margin-bottom:32px;">
  <h2>⚠️ Partial Passes (Missing External Secrets)</h2>
  <ul class="bug-list">
    ${partial.map(t => `<li class="bug-item medium">
      <div><span class="bug-id">[${t.id}]</span> ${t.desc}</div>
      <div class="bug-fix">💡 ${t.fix || "Configure external service credentials"}</div>
    </li>`).join("")}
  </ul>
</div>` : ""}

<!-- ALL TESTS TABLE -->
<div class="tests-section">
  <h2>🧪 All Test Cases</h2>
  <input class="search-input" type="text" id="searchInput" placeholder="Search by ID, module, description..." oninput="filterTests()">
  <div class="filter-bar">
    <button class="filter-btn active" onclick="setFilter('ALL', this)">All (${stats.total})</button>
    <button class="filter-btn" onclick="setFilter('PASS', this)">✅ Pass (${passed.length})</button>
    <button class="filter-btn" onclick="setFilter('FAIL', this)">❌ Fail (${failed.length})</button>
    <button class="filter-btn" onclick="setFilter('PARTIAL', this)">⚠️ Partial (${partial.length})</button>
    <button class="filter-btn" onclick="setFilter('SKIP', this)">⊘ Skip (${skipped.length})</button>
  </div>
  <div id="testList">
    ${results.map(t => `
    <div class="test-row" data-status="${t.status}" data-module="${t.module}" data-desc="${t.desc.toLowerCase()}">
      <span class="test-id">${t.id}</span>
      <span class="test-module">${t.module}</span>
      <span class="test-module">${t.feature}</span>
      <div>
        <div class="test-desc">${t.desc}</div>
        ${t.error ? `<div class="test-error">Error: ${t.error}</div>` : ""}
        ${t.fix && t.status !== "PASS" ? `<div class="test-fix">💡 ${t.fix}</div>` : ""}
      </div>
      <span class="badge ${t.status.toLowerCase()}">${t.status}</span>
    </div>`).join("")}
  </div>
</div>

</main>
<footer>EdTech Platform QA Dashboard &nbsp;·&nbsp; Generated ${new Date().toISOString()} &nbsp;·&nbsp; ${stats.total} tests in ${stats.elapsed}s</footer>

<script>
const RESULTS = ${JSON.stringify(results)};
let currentFilter = "ALL";

function setFilter(status, btn) {
  currentFilter = status;
  document.querySelectorAll(".filter-btn").forEach(b => b.classList.remove("active"));
  btn.classList.add("active");
  filterTests();
}

function filterTests() {
  const q = document.getElementById("searchInput").value.toLowerCase();
  document.querySelectorAll(".test-row").forEach(row => {
    const matchStatus = currentFilter === "ALL" || row.dataset.status === currentFilter;
    const matchSearch = !q || row.dataset.desc.includes(q) || row.dataset.module.toLowerCase().includes(q);
    row.style.display = matchStatus && matchSearch ? "" : "none";
  });
}

// Donut Chart
const ctx1 = document.getElementById("donutChart").getContext("2d");
new Chart(ctx1, {
  type: "doughnut",
  data: {
    labels: ["Passed", "Failed", "Partial", "Skipped"],
    datasets: [{
      data: [${passed.length}, ${failed.length}, ${partial.length}, ${skipped.length}],
      backgroundColor: ["#22C55E", "#EF4444", "#F59E0B", "#64748B"],
      borderWidth: 0, hoverOffset: 8,
    }]
  },
  options: {
    responsive: true, maintainAspectRatio: false,
    plugins: {
      legend: { position: "bottom", labels: { color: "#94A3B8", padding: 16, font: { size: 12 } } },
    },
    cutout: "65%",
  }
});

// Module Bar Chart
const ctx2 = document.getElementById("moduleChart").getContext("2d");
const mods = ${JSON.stringify(moduleData)};
new Chart(ctx2, {
  type: "bar",
  data: {
    labels: mods.map(m => m.name),
    datasets: [
      { label: "Pass", data: mods.map(m => m.pass), backgroundColor: "#22C55E", borderRadius: 4 },
      { label: "Fail", data: mods.map(m => m.fail), backgroundColor: "#EF4444", borderRadius: 4 },
      { label: "Partial", data: mods.map(m => m.partial), backgroundColor: "#F59E0B", borderRadius: 4 },
    ]
  },
  options: {
    responsive: true, maintainAspectRatio: false,
    plugins: { legend: { labels: { color: "#94A3B8", font: { size: 11 } } } },
    scales: {
      x: { stacked: true, ticks: { color: "#64748B", maxRotation: 45 }, grid: { color: "#1E293B" } },
      y: { stacked: true, ticks: { color: "#64748B" }, grid: { color: "rgba(51,65,85,0.5)" } },
    }
  }
});
</script>
</body>
</html>`;

  const outPath = join(__dir, "reports", "dashboard.html");
  writeFileSync(outPath, html);
  console.log("  ✓ dashboard.html");
}
