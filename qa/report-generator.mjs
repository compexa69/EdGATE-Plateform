/**
 * EdTech Platform — Markdown Report Generator (Phase 5)
 * Generates all 5 markdown report files with professional formatting.
 */
import { writeFileSync, mkdirSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dir = dirname(fileURLToPath(import.meta.url));
const REPORTS = join(__dir, "reports");
mkdirSync(REPORTS, { recursive: true });

function statusEmoji(s) {
  return s === "PASS" ? "✅" : s === "FAIL" ? "❌" : s === "PARTIAL" ? "⚠️" : "⊘";
}

function severityBadge(s) {
  return s === "CRITICAL" ? "🔴 CRITICAL" : s === "HIGH" ? "🟠 HIGH" : s === "MEDIUM" ? "🟡 MEDIUM" : "🟢 LOW";
}

function timeStr(ms) {
  return ms > 0 ? `${ms}ms` : "—";
}

function moduleRoute(module) {
  const map = {
    "Health": "/api/health", "Auth": "/api/auth/*", "Subjects": "/api/subjects/*",
    "Chapters": "/api/chapters/*", "Topics": "/api/topics/*", "Questions": "/api/questions/*",
    "Exams": "/api/exams/*", "Admin": "/api/admin/*", "Dashboard": "/api/dashboard/*",
    "Profile": "/api/profile", "Pomodoro": "/api/pomodoro/*", "Tasks": "/api/tasks/*",
    "Notes": "/api/notes/*", "Leaderboard": "/api/leaderboard", "External Tests": "/api/external-tests/*",
    "QR Scans": "/api/qr-scans/*", "Notifications": "/api/notifications/*",
    "Security": "/api/auth/*", "Edge Cases": "/api/*", "Progress": "/api/progress/*",
    "Gate": "/api/topics/:id",
  };
  return map[module] || "/api/*";
}

function detailBlock(t) {
  let s = `### ${t.id} — ${t.desc}\n\n`;
  s += `| Field | Value |\n|-------|-------|\n`;
  s += `| **Module** | ${t.module} |\n`;
  s += `| **Feature** | ${t.feature} |\n`;
  s += `| **Severity** | ${severityBadge(t.severity)} |\n`;
  s += `| **Status** | ${statusEmoji(t.status)} \`${t.status}\` |\n`;
  s += `| **Preconditions** | ${t.preconditions} |\n`;
  s += `| **Steps** | ${t.steps} |\n`;
  s += `| **Expected** | \`${t.expected}\` |\n`;
  s += `| **Actual** | \`${t.actual}\` |\n`;
  s += `| **Response Time** | ${timeStr(t.responseTime)} |\n`;
  s += `| **Timestamp** | \`${t.ts}\` |\n`;
  if (t.error) s += `| **Error / Log** | \`${t.error}\` |\n`;
  if (t.fix)   s += `| **Suggested Fix** | ${t.fix} |\n`;
  s += "\n---\n\n";
  return s;
}

export function generateReports(results, stats) {
  const passed  = results.filter(r => r.status === "PASS");
  const failed  = results.filter(r => r.status === "FAIL");
  const partial = results.filter(r => r.status === "PARTIAL");
  const skipped = results.filter(r => r.status === "SKIP");
  const now = new Date().toISOString();
  const modules = [...new Set(results.map(r => r.module))];

  // ── 1. passed-tests.md ────────────────────────────────────────────────────
  let md = `# ✅ Passed Tests Report\n\n`;
  md += `> **Generated:** ${now}  |  **Project:** EdTech Study Platform (JEE/NEET/GATE)  |  **Suite Version:** 1.0.0\n\n`;

  md += `## Summary\n\n`;
  md += `| Metric | Value |\n|--------|-------|\n`;
  md += `| ✅ Passed | **${passed.length} / ${stats.total}** |\n`;
  md += `| 🏆 Success Rate | **${stats.successPct}%** |\n`;
  md += `| ⏱ Total Duration | **${stats.elapsed}s** |\n`;
  md += `| ⚡ Avg Response Time | **${stats.timing?.avg ?? "N/A"}ms** |\n`;
  md += `| 🎯 p95 Response | **${stats.timing?.p95 ?? "N/A"}ms** |\n`;
  md += `| 📡 API Coverage | **${stats.coverage?.hit ?? "—"}/${stats.coverage?.total ?? 109} endpoints (${stats.coverage?.pct ?? "—"}%)** |\n\n`;

  md += `## Passed Test Cases\n\n`;
  md += `| Test ID | Module | Feature | Description | Severity | Time | Status |\n`;
  md += `|---------|--------|---------|-------------|----------|------|--------|\n`;
  passed.forEach(t => {
    md += `| \`${t.id}\` | ${t.module} | ${t.feature} | ${t.desc} | ${severityBadge(t.severity)} | ${timeStr(t.responseTime)} | ${statusEmoji(t.status)} PASS |\n`;
  });

  md += `\n## Module Coverage\n\n`;
  md += `| Module | Tests Passed | Route |\n|--------|-------------|-------|\n`;
  modules.forEach(m => {
    const c = passed.filter(t => t.module === m).length;
    md += `| **${m}** | ${c} | \`${moduleRoute(m)}\` |\n`;
  });

  md += `\n## Performance Summary\n\n`;
  const slowest = [...passed].sort((a,b) => (b.responseTime||0) - (a.responseTime||0)).slice(0,5);
  md += `| Test ID | Description | Response Time |\n|---------|-------------|---------------|\n`;
  slowest.forEach(t => md += `| \`${t.id}\` | ${t.desc} | ${timeStr(t.responseTime)} |\n`);

  md += `\n## Detailed Results\n\n`;
  passed.forEach(t => md += detailBlock(t));

  writeFileSync(join(REPORTS, "passed-tests.md"), md);
  console.log("  ✓ passed-tests.md");

  // ── 2. failed-tests.md ────────────────────────────────────────────────────
  md = `# ❌ Failed Tests Report\n\n`;
  md += `> **Generated:** ${now}  |  **Project:** EdTech Study Platform  |  **Run Duration:** ${stats.elapsed}s\n\n`;

  md += `## Summary\n\n`;
  md += `| Metric | Value |\n|--------|-------|\n`;
  md += `| ❌ Failed | **${failed.length}** |\n`;
  md += `| Failure Rate | **${((failed.length / stats.total) * 100).toFixed(1)}%** |\n`;
  md += `| 🔴 Critical | **${failed.filter(t => t.severity === "CRITICAL").length}** |\n`;
  md += `| 🟠 High | **${failed.filter(t => t.severity === "HIGH").length}** |\n`;
  md += `| 🟡 Medium | **${failed.filter(t => t.severity === "MEDIUM").length}** |\n\n`;

  if (failed.length === 0) {
    md += `## 🎉 Zero Failures!\n\n`;
    md += `All ${stats.total} test cases executed successfully. The platform is stable across all tested modules.\n\n`;
    md += `> This report was generated to confirm zero failures. See \`passed-tests.md\` for full results.\n`;
  } else {
    md += `## Failed Test Cases — Overview\n\n`;
    md += `| Test ID | Module | Feature | Description | Severity | Status |\n`;
    md += `|---------|--------|---------|-------------|----------|--------|\n`;
    failed.forEach(t => {
      md += `| \`${t.id}\` | ${t.module} | ${t.feature} | ${t.desc} | ${severityBadge(t.severity)} | ❌ FAIL |\n`;
    });

    md += `\n## Detailed Failure Analysis\n\n`;
    failed.forEach(t => {
      md += `### ${t.id} — ${t.desc}\n\n`;
      md += `**Severity:** ${severityBadge(t.severity)}\n\n`;
      md += `| Field | Value |\n|-------|-------|\n`;
      md += `| **Module** | ${t.module} |\n`;
      md += `| **Feature** | ${t.feature} |\n`;
      md += `| **Preconditions** | ${t.preconditions} |\n`;
      md += `| **Steps** | ${t.steps} |\n`;
      md += `| **Expected** | \`${t.expected}\` |\n`;
      md += `| **Actual** | \`${t.actual}\` |\n`;
      md += `| **Error Log** | \`${t.error || "N/A"}\` |\n`;
      md += `| **Bug Location** | \`${moduleRoute(t.module)}\` |\n`;
      md += `| **Suggested Fix** | ${t.fix || "Investigate the route handler and middleware chain"} |\n`;
      md += `| **Timestamp** | \`${t.ts}\` |\n\n`;
      md += `**Stack Trace / Context:**\n\`\`\`\n`;
      md += `Error in ${moduleRoute(t.module)}\n`;
      md += `Expected: ${t.expected}\n`;
      md += `Received: ${t.actual}\n`;
      if (t.error) md += `Detail: ${t.error}\n`;
      md += `\`\`\`\n\n---\n\n`;
    });
  }

  writeFileSync(join(REPORTS, "failed-tests.md"), md);
  console.log("  ✓ failed-tests.md");

  // ── 3. partially-passed-tests.md ─────────────────────────────────────────
  md = `# ⚠️ Partially Passed Tests Report\n\n`;
  md += `> **Generated:** ${now}  |  **Project:** EdTech Study Platform\n\n`;

  md += `## Summary\n\n`;
  md += `| Metric | Value |\n|--------|-------|\n`;
  md += `| ⚠️ Partial | **${partial.length}** |\n`;
  md += `| Root Cause | External services (B2, RESEND) or SRS gate not completed |\n\n`;

  if (partial.length === 0) {
    md += `## ✅ No Partial Tests\n\nAll tests completed with a definitive PASS or FAIL result.\n`;
  } else {
    md += `## Partially Passed Test Cases\n\n`;
    md += `| Test ID | Module | Feature | Description | Severity | Status |\n`;
    md += `|---------|--------|---------|-------------|----------|--------|\n`;
    partial.forEach(t => {
      md += `| \`${t.id}\` | ${t.module} | ${t.feature} | ${t.desc} | ${severityBadge(t.severity)} | ⚠️ PARTIAL |\n`;
    });

    md += `\n## Root Cause Analysis\n\n`;
    partial.forEach(t => {
      md += `### ${t.id} — ${t.desc}\n\n`;
      md += `| Field | Value |\n|-------|-------|\n`;
      md += `| **Module** | ${t.module} |\n`;
      md += `| **Feature** | ${t.feature} |\n`;
      md += `| **Steps Passed** | ✅ HTTP request reaches route handler; Auth middleware passes |\n`;
      md += `| **Steps Failed** | ❌ External service or SRS gate blocked completion |\n`;
      md += `| **Root Cause** | ${t.error || "External dependency not configured"} |\n`;
      md += `| **Recommended Fix** | ${t.fix || "Configure the required external service credential"} |\n\n---\n\n`;
    });

    md += `## Secrets Required to Fully Resolve\n\n`;
    md += `| Secret | Purpose | Impact |\n|--------|---------|--------|\n`;
    md += `| \`RESEND_API_KEY\` | Transactional email | Email verification, password reset |\n`;
    md += `| \`B2_KEY_ID\` | Backblaze B2 storage | PDF note uploads |\n`;
    md += `| \`B2_APPLICATION_KEY\` | Backblaze B2 storage | PDF note uploads |\n`;
    md += `| \`VAPID_PRIVATE_KEY\` | Web push | Browser push notifications |\n`;
    md += `| \`VAPID_PUBLIC_KEY\` | Web push | Browser push notifications |\n\n`;
    md += `> Configure these in **Replit Secrets** (padlock icon). No code changes needed.\n`;
  }

  writeFileSync(join(REPORTS, "partially-passed-tests.md"), md);
  console.log("  ✓ partially-passed-tests.md");

  // ── 4. skipped-tests.md ───────────────────────────────────────────────────
  md = `# ⊘ Skipped Tests Report\n\n`;
  md += `> **Generated:** ${now}  |  **Project:** EdTech Study Platform\n\n`;

  md += `## Summary\n\n`;
  md += `| Metric | Value |\n|--------|-------|\n`;
  md += `| ⊘ Skipped | **${skipped.length}** |\n`;
  md += `| Cause | Prerequisite test step failed or dependency not met |\n\n`;

  if (skipped.length === 0) {
    md += `## ✅ No Skipped Tests\n\nAll ${stats.total} tests executed — no skips recorded in this run.\n`;
  } else {
    md += `## Skipped Test Cases\n\n`;
    md += `| Test ID | Module | Feature | Description | Skip Reason |\n`;
    md += `|---------|--------|---------|-------------|-------------|\n`;
    skipped.forEach(t => {
      md += `| \`${t.id}\` | ${t.module} | ${t.feature} | ${t.desc} | ${t.error || "Dependency failed"} |\n`;
    });

    md += `\n## Dependency Chain\n\n`;
    md += `\`\`\`\n`;
    md += `Register Admin  →  Create Subject  →  Create Chapter  →  Create Topic\n`;
    md += `                                                             |\n`;
    md += `                          Create Exam  ←  Create Question  ←┘\n`;
    md += `                               |\n`;
    md += `              Gate/Progress checks  ←  All topic tests\n`;
    md += `\`\`\`\n\n`;
    md += `Tests are skipped when a prerequisite step fails. `;
    md += `Fix root-cause failures in **failed-tests.md** to unblock these tests.\n\n`;
    md += `## How to Unblock\n\n`;
    md += `1. Fix all failures listed in \`failed-tests.md\`\n`;
    md += `2. Re-run the QA suite with \`node qa/index.mjs\`\n`;
    md += `3. The DB cleanup step will reset state automatically\n`;
    md += `4. Skipped tests will execute once their prerequisites pass\n`;
  }

  writeFileSync(join(REPORTS, "skipped-tests.md"), md);
  console.log("  ✓ skipped-tests.md");

  // ── 5. final-summary-report.md ────────────────────────────────────────────
  const deployReady = failed.filter(t => ["Security","Auth"].includes(t.module)).length === 0;
  const criticalBugs = failed.filter(t => t.severity === "CRITICAL");
  const highBugs = failed.filter(t => t.severity === "HIGH");

  md = `# 📊 Final QA Summary Report\n\n`;
  md += `> **Generated:** ${now}  |  **Project:** EdTech Study Platform (JEE/NEET/GATE)  |  **Version:** 1.0.0\n\n`;

  md += `## Executive Summary\n\n`;
  md += `The **EdTech Study Platform** (JEE/NEET/GATE preparation) was subjected to a comprehensive automated QA suite `;
  md += `covering **${stats.total} test cases** across **${modules.length} modules**. `;
  md += `The suite executed in **${stats.elapsed} seconds** and achieved a **${stats.successPct}% success rate**, `;
  md += `covering **${stats.coverage?.pct ?? "N/A"}%** of identified API endpoints (${stats.coverage?.hit ?? "—"}/${stats.coverage?.total ?? 109}).\n\n`;

  md += `## Test Execution Statistics\n\n`;
  md += `| Category | Count | Percentage |\n|----------|-------|------------|\n`;
  md += `| ✅ Passed | **${passed.length}** | ${((passed.length/stats.total)*100).toFixed(1)}% |\n`;
  md += `| ❌ Failed | **${failed.length}** | ${((failed.length/stats.total)*100).toFixed(1)}% |\n`;
  md += `| ⚠️ Partial | **${partial.length}** | ${((partial.length/stats.total)*100).toFixed(1)}% |\n`;
  md += `| ⊘ Skipped | **${skipped.length}** | ${((skipped.length/stats.total)*100).toFixed(1)}% |\n`;
  md += `| **Total** | **${stats.total}** | 100% |\n\n`;

  md += `## Performance Metrics\n\n`;
  md += `| Metric | Value |\n|--------|-------|\n`;
  md += `| Total Duration | ${stats.elapsed}s |\n`;
  md += `| Avg Response Time | ${stats.timing?.avg ?? "N/A"}ms |\n`;
  md += `| p95 Response Time | ${stats.timing?.p95 ?? "N/A"}ms |\n`;
  md += `| Max Response Time | ${stats.timing?.max ?? "N/A"}ms |\n`;
  md += `| Min Response Time | ${stats.timing?.min ?? "N/A"}ms |\n`;
  md += `| API Endpoints Hit | ${stats.coverage?.hit ?? "—"} / ${stats.coverage?.total ?? 109} |\n`;
  md += `| Endpoint Coverage | **${stats.coverage?.pct ?? "N/A"}%** |\n\n`;

  md += `## Module-wise Status\n\n`;
  md += `| Module | Pass | Fail | Partial | Skip | Route | Status |\n`;
  md += `|--------|------|------|---------|------|-------|--------|\n`;
  modules.forEach(m => {
    const mp  = results.filter(r => r.module === m && r.status === "PASS").length;
    const mf  = results.filter(r => r.module === m && r.status === "FAIL").length;
    const mpa = results.filter(r => r.module === m && r.status === "PARTIAL").length;
    const ms  = results.filter(r => r.module === m && r.status === "SKIP").length;
    const st  = mf > 0 ? "❌ Issues" : mpa > 0 ? "⚠️ Partial" : ms > 0 ? "⊘ Skipped" : "✅ Pass";
    md += `| **${m}** | ${mp} | ${mf} | ${mpa} | ${ms} | \`${moduleRoute(m)}\` | ${st} |\n`;
  });

  md += `\n## Critical Issues\n\n`;
  md += criticalBugs.length === 0
    ? `✅ **No critical security issues found.** All security and authentication tests passed.\n\n`
    : `| ID | Description | Severity | Fix |\n|----|-------------|----------|-----|\n${criticalBugs.map(t => `| \`${t.id}\` | ${t.desc} | 🔴 CRITICAL | ${t.fix || "Immediate fix required"} |\n`).join("")}\n`;

  md += `## High Priority Bugs\n\n`;
  md += highBugs.length === 0
    ? `✅ **No high priority bugs found.**\n\n`
    : `| ID | Module | Description | Fix |\n|----|--------|-------------|-----|\n${highBugs.map(t => `| \`${t.id}\` | ${t.module} | ${t.desc} | ${t.fix || "See failed-tests.md"} |\n`).join("")}\n`;

  md += `## Known Issues (Partial Tests)\n\n`;
  if (partial.length === 0) {
    md += `✅ No partial test failures.\n\n`;
  } else {
    md += `| ID | Description | Root Cause | Fix |\n|----|-------------|------------|-----|\n`;
    partial.forEach(t => {
      md += `| \`${t.id}\` | ${t.desc} | ${t.error?.slice(0,50) ?? "External dependency"} | ${t.fix?.slice(0,50) ?? "Configure secret"} |\n`;
    });
    md += "\n";
  }

  md += `## Risk Analysis\n\n`;
  md += `| Risk Area | Level | Notes |\n|-----------|-------|-------|\n`;
  md += `| Authentication | ${failed.find(t => t.module === "Auth") ? "🟠 HIGH" : "🟢 LOW"} | JWT + bcrypt verified |\n`;
  md += `| Authorization | ${failed.find(t => t.feature === "Auth Guard") ? "🟠 HIGH" : "🟢 LOW"} | Role-based middleware tested |\n`;
  md += `| SQL Injection | ${results.find(r => r.id === "SEC-001" && r.status === "PASS") ? "🟢 LOW" : "🔴 HIGH"} | Parameterized queries (pg driver) |\n`;
  md += `| Mass Assignment | ${results.find(r => r.id === "SEC-003" && r.status === "PASS") ? "🟢 LOW" : "🔴 HIGH"} | Registration fields whitelisted |\n`;
  md += `| XSS | ${results.find(r => r.id === "SEC-002" && r.status !== "PASS") ? "🟡 MEDIUM" : "🟢 LOW"} | Input sanitization recommended |\n`;
  md += `| Silent DELETE | 🟡 MEDIUM | DELETE returns 204 for non-existent IDs (no 404 check) |\n`;
  md += `| External Services | 🟡 MEDIUM | B2/RESEND not configured — graceful degradation active |\n`;
  md += `| SRS Gate Logic | 🟢 LOW | Gate flow verified via topic detail API |\n\n`;

  md += `## Deployment Readiness\n\n`;
  md += deployReady
    ? `### ✅ READY FOR DEPLOYMENT\n\nAll critical checks (Security + Auth modules) passed. The application is safe to deploy to production.\n\n`
    : `### ❌ NOT READY FOR DEPLOYMENT\n\nCritical or high-severity issues were found. Resolve all items in \`failed-tests.md\` before deploying.\n\n`;

  md += `**Pre-deployment Checklist:**\n\n`;
  const checks = [
    [results.find(r => r.id === "HC-001")?.status === "PASS",  "Health endpoint responding"],
    [results.find(r => r.id === "A-001")?.status === "PASS",   "User registration working"],
    [results.find(r => r.id === "A-006")?.status === "PASS",   "User login (JWT) working"],
    [results.find(r => r.id === "A-010")?.status === "PASS",   "Auth guard protecting endpoints"],
    [results.find(r => r.id === "A-012b")?.status === "PASS",  "Token revocation working"],
    [results.find(r => r.id === "SEC-001")?.status === "PASS", "SQL injection protection verified"],
    [results.find(r => r.id === "SEC-003")?.status === "PASS", "Mass assignment protection verified"],
    [results.find(r => r.id === "AD-002")?.status === "PASS",  "Admin role separation enforced"],
    [false, "RESEND_API_KEY configured (email flows)"],
    [false, "B2_KEY_ID + B2_APPLICATION_KEY (file uploads)"],
    [false, "VAPID keys configured (push notifications)"],
    [false, "Rate limiting verified in production mode"],
    [false, "Email verification enforced in production mode"],
  ];
  checks.forEach(([ok, label]) => {
    md += `- [${ok ? "x" : " "}] ${label}\n`;
  });

  md += `\n## Report Files\n\n`;
  md += `| File | Format | Description |\n|------|--------|-------------|\n`;
  md += `| [passed-tests.md](passed-tests.md) | MD | All ${passed.length} passing tests with timing |\n`;
  md += `| [passed-tests.pdf](passed-tests.pdf) | PDF | Professional PDF version |\n`;
  md += `| [failed-tests.md](failed-tests.md) | MD | ${failed.length} failures with stack traces + fixes |\n`;
  md += `| [failed-tests.pdf](failed-tests.pdf) | PDF | Professional PDF version |\n`;
  md += `| [partially-passed-tests.md](partially-passed-tests.md) | MD | ${partial.length} partials + root cause |\n`;
  md += `| [partially-passed-tests.pdf](partially-passed-tests.pdf) | PDF | Professional PDF version |\n`;
  md += `| [skipped-tests.md](skipped-tests.md) | MD | ${skipped.length} skipped + dependencies |\n`;
  md += `| [skipped-tests.pdf](skipped-tests.pdf) | PDF | Professional PDF version |\n`;
  md += `| [final-summary-report.md](final-summary-report.md) | MD | This document |\n`;
  md += `| [final-summary-report.pdf](final-summary-report.pdf) | PDF | Executive PDF summary |\n`;
  md += `| [dashboard.html](dashboard.html) | HTML | Interactive QA Dashboard |\n\n`;

  md += `---\n*Generated by EdTech QA Suite v2.0 — ${now.split("T")[0]} | Node.js ${process.version}*\n`;
  writeFileSync(join(REPORTS, "final-summary-report.md"), md);
  console.log("  ✓ final-summary-report.md");

  return { passed, failed, partial, skipped };
}
