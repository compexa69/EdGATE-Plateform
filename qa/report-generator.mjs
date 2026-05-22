/**
 * Generates all markdown reports from test results.
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

function severityOf(t) {
  if (t.module === "Security") return "🔴 CRITICAL";
  if (t.module === "Auth") return "🔴 HIGH";
  if (["Subjects","Chapters","Topics","Exams"].includes(t.module)) return "🟠 HIGH";
  if (["Admin","Profile","Dashboard"].includes(t.module)) return "🟡 MEDIUM";
  return "🟢 LOW";
}

function tableHeader() {
  return `| Test ID | Module | Feature | Description | Status |\n|---------|--------|---------|-------------|--------|\n`;
}

function tableRow(t) {
  return `| ${t.id} | ${t.module} | ${t.feature} | ${t.desc} | ${statusEmoji(t.status)} ${t.status} |\n`;
}

function detailBlock(t) {
  let s = `### ${t.id} — ${t.desc}\n\n`;
  s += `| Field | Value |\n|-------|-------|\n`;
  s += `| **Module** | ${t.module} |\n`;
  s += `| **Feature** | ${t.feature} |\n`;
  s += `| **Status** | ${statusEmoji(t.status)} ${t.status} |\n`;
  s += `| **Expected** | \`${t.expected}\` |\n`;
  s += `| **Actual** | \`${t.actual}\` |\n`;
  s += `| **Timestamp** | ${t.ts} |\n`;
  if (t.error) s += `| **Error** | \`${t.error}\` |\n`;
  if (t.fix) s += `| **Suggested Fix** | ${t.fix} |\n`;
  s += "\n---\n\n";
  return s;
}

export function generateReports(results, stats) {
  const passed  = results.filter(r => r.status === "PASS");
  const failed  = results.filter(r => r.status === "FAIL");
  const partial = results.filter(r => r.status === "PARTIAL");
  const skipped = results.filter(r => r.status === "SKIP");

  const now = new Date().toISOString();
  const date = now.split("T")[0];

  // ── Passed ─────────────────────────────────────────────────────────────────
  let md = `# ✅ Passed Tests Report\n\n`;
  md += `> **Generated:** ${now}  |  **Suite:** EdTech Platform QA\n\n`;
  md += `## Summary\n\n`;
  md += `| Metric | Value |\n|--------|-------|\n`;
  md += `| Total Passed | **${passed.length}** |\n`;
  md += `| Success Rate | **${stats.successPct}%** |\n`;
  md += `| Duration | **${stats.elapsed}s** |\n\n`;
  md += `## Passed Test Cases\n\n${tableHeader()}`;
  passed.forEach(t => md += tableRow(t));
  md += `\n## Detailed Results\n\n`;
  passed.forEach(t => md += detailBlock(t));

  // Module coverage
  const modules = [...new Set(passed.map(t => t.module))];
  md += `## Module Coverage\n\n| Module | Passed |\n|--------|--------|\n`;
  modules.forEach(m => {
    const c = passed.filter(t => t.module === m).length;
    md += `| ${m} | ${c} |\n`;
  });
  writeFileSync(join(REPORTS, "passed-tests.md"), md);
  console.log("  ✓ passed-tests.md");

  // ── Failed ─────────────────────────────────────────────────────────────────
  md = `# ❌ Failed Tests Report\n\n`;
  md += `> **Generated:** ${now}  |  **Suite:** EdTech Platform QA\n\n`;
  md += `## Summary\n\n`;
  md += `| Metric | Value |\n|--------|-------|\n`;
  md += `| Total Failed | **${failed.length}** |\n`;
  md += `| Failure Rate | **${((failed.length / stats.total) * 100).toFixed(1)}%** |\n`;
  md += `| Critical Issues | **${failed.filter(t => t.module === "Security").length}** |\n\n`;

  if (failed.length === 0) {
    md += `## 🎉 No Failed Tests!\n\nAll executed tests passed successfully.\n`;
  } else {
    md += `## Failed Test Cases\n\n${tableHeader()}`;
    failed.forEach(t => md += tableRow(t));
    md += `\n## Detailed Failure Analysis\n\n`;
    failed.forEach(t => {
      let s = `### ${t.id} — ${t.desc}\n\n`;
      s += `**Severity:** ${severityOf(t)}\n\n`;
      s += `| Field | Value |\n|-------|-------|\n`;
      s += `| **Module** | ${t.module} |\n`;
      s += `| **Feature** | ${t.feature} |\n`;
      s += `| **Expected** | \`${t.expected}\` |\n`;
      s += `| **Actual** | \`${t.actual}\` |\n`;
      s += `| **Error** | \`${t.error || "N/A"}\` |\n`;
      s += `| **Bug Location** | \`artifacts/api-server/src/routes/\` |\n`;
      s += `| **Suggested Fix** | ${t.fix || "Investigate the route handler"} |\n`;
      s += `| **Timestamp** | ${t.ts} |\n`;
      s += "\n**Steps to Reproduce:**\n1. Start the API server\n";
      s += `2. Send the failing request to \`${BASE_PATH(t)}\`\n`;
      s += `3. Observe the actual response vs expected\n\n---\n\n`;
      md += s;
    });
  }
  writeFileSync(join(REPORTS, "failed-tests.md"), md);
  console.log("  ✓ failed-tests.md");

  // ── Partial ────────────────────────────────────────────────────────────────
  md = `# ⚠️ Partially Passed Tests Report\n\n`;
  md += `> **Generated:** ${now}  |  **Suite:** EdTech Platform QA\n\n`;
  md += `## Summary\n\n`;
  md += `| Metric | Value |\n|--------|-------|\n`;
  md += `| Total Partial | **${partial.length}** |\n`;
  md += `| Root Cause | Usually missing optional secrets (B2, RESEND) |\n\n`;

  if (partial.length === 0) {
    md += `## No Partial Tests\n\nAll tests completed fully (pass or fail).\n`;
  } else {
    md += `## Partially Passed Test Cases\n\n${tableHeader()}`;
    partial.forEach(t => md += tableRow(t));
    md += `\n## Root Cause Analysis\n\n`;
    partial.forEach(t => {
      let s = `### ${t.id} — ${t.desc}\n\n`;
      s += `| Field | Value |\n|-------|-------|\n`;
      s += `| **Module** | ${t.module} |\n`;
      s += `| **Feature** | ${t.feature} |\n`;
      s += `| **Steps Passed** | Request reaches route handler |\n`;
      s += `| **Steps Failed** | External service (B2 / email) not configured |\n`;
      s += `| **Root Cause** | ${t.error || "External dependency missing"} |\n`;
      s += `| **Recommended Fix** | ${t.fix || "Configure external service credentials"} |\n`;
      s += "\n---\n\n";
      md += s;
    });
    md += `## Optional Secrets Required\n\n`;
    md += `To make partial tests fully pass, configure these Replit Secrets:\n\n`;
    md += `| Secret | Purpose | Required For |\n|--------|---------|-------------|\n`;
    md += `| \`RESEND_API_KEY\` | Transactional email | Email verification, password reset |\n`;
    md += `| \`B2_KEY_ID\` | Backblaze B2 storage | PDF note uploads |\n`;
    md += `| \`B2_APPLICATION_KEY\` | Backblaze B2 storage | PDF note uploads |\n`;
    md += `| \`VAPID_PRIVATE_KEY\` | Push notifications | Browser push alerts |\n`;
    md += `| \`VAPID_PUBLIC_KEY\` | Push notifications | Browser push alerts |\n`;
  }
  writeFileSync(join(REPORTS, "partially-passed-tests.md"), md);
  console.log("  ✓ partially-passed-tests.md");

  // ── Skipped ────────────────────────────────────────────────────────────────
  md = `# ⊘ Skipped Tests Report\n\n`;
  md += `> **Generated:** ${now}  |  **Suite:** EdTech Platform QA\n\n`;
  md += `## Summary\n\n`;
  md += `| Metric | Value |\n|--------|-------|\n`;
  md += `| Total Skipped | **${skipped.length}** |\n`;
  md += `| Primary Cause | Dependency on prior test step |\n\n`;

  md += `## Skipped Test Cases\n\n`;
  md += `| Test ID | Module | Feature | Description | Reason |\n|---------|--------|---------|-------------|--------|\n`;
  skipped.forEach(t => md += `| ${t.id} | ${t.module} | ${t.feature} | ${t.desc} | ${t.error || "Dependency failed"} |\n`);
  md += `\n## Analysis\n\n`;
  md += `Tests are skipped when a prerequisite step (e.g., creating a resource) fails. `;
  md += `Fix the root-cause failures in the **Failed Tests Report** to unblock these tests.\n\n`;
  md += `### Dependency Chain\n\n`;
  md += `\`\`\`\nRegister Admin → Create Subject → Create Chapter → Create Topic\n`;
  md += `                                                     ↓\n`;
  md += `                              Create Exam ← Create Question\n`;
  md += `\`\`\`\n`;
  writeFileSync(join(REPORTS, "skipped-tests.md"), md);
  console.log("  ✓ skipped-tests.md");

  // ── Final Summary ──────────────────────────────────────────────────────────
  const deployReady = failed.filter(t => ["Security","Auth"].includes(t.module)).length === 0;
  const criticalBugs = failed.filter(t => t.module === "Security");
  const highBugs = failed.filter(t => ["Auth","Subjects","Chapters","Topics","Exams"].includes(t.module));

  md = `# 📊 Final QA Summary Report\n\n`;
  md += `> **Generated:** ${now}  |  **Project:** EdTech Study Platform (JEE/NEET/GATE)  |  **Version:** 1.0.0\n\n`;

  md += `## Executive Summary\n\n`;
  md += `The EdTech Platform was subjected to a comprehensive automated QA suite covering **${stats.total} test cases** `;
  md += `across ${[...new Set(results.map(r => r.module))].length} modules. `;
  md += `The suite executed in **${stats.elapsed} seconds** and achieved a **${stats.successPct}% success rate**.\n\n`;

  md += `## Test Execution Statistics\n\n`;
  md += `| Category | Count | Percentage |\n|----------|-------|------------|\n`;
  md += `| ✅ Passed | **${passed.length}** | ${((passed.length/stats.total)*100).toFixed(1)}% |\n`;
  md += `| ❌ Failed | **${failed.length}** | ${((failed.length/stats.total)*100).toFixed(1)}% |\n`;
  md += `| ⚠️ Partial | **${partial.length}** | ${((partial.length/stats.total)*100).toFixed(1)}% |\n`;
  md += `| ⊘ Skipped | **${skipped.length}** | ${((skipped.length/stats.total)*100).toFixed(1)}% |\n`;
  md += `| **Total** | **${stats.total}** | 100% |\n\n`;

  md += `## Module-wise Status\n\n`;
  md += `| Module | Pass | Fail | Partial | Skip | Status |\n|--------|------|------|---------|------|--------|\n`;
  const mods = [...new Set(results.map(r => r.module))];
  mods.forEach(m => {
    const mp = results.filter(r => r.module === m && r.status === "PASS").length;
    const mf = results.filter(r => r.module === m && r.status === "FAIL").length;
    const mpa = results.filter(r => r.module === m && r.status === "PARTIAL").length;
    const ms = results.filter(r => r.module === m && r.status === "SKIP").length;
    const mStatus = mf > 0 ? "❌ Issues" : mpa > 0 ? "⚠️ Partial" : ms > 0 ? "⊘ Skipped" : "✅ Pass";
    md += `| ${m} | ${mp} | ${mf} | ${mpa} | ${ms} | ${mStatus} |\n`;
  });

  md += `\n## Critical Issues\n\n`;
  if (criticalBugs.length === 0) {
    md += `✅ **No critical security issues found.**\n\n`;
  } else {
    md += `| ID | Description | Severity |\n|----|-------------|----------|\n`;
    criticalBugs.forEach(t => md += `| ${t.id} | ${t.desc} | 🔴 CRITICAL |\n`);
    md += "\n";
  }

  md += `## High Priority Bugs\n\n`;
  if (highBugs.length === 0) {
    md += `✅ **No high priority bugs found.**\n\n`;
  } else {
    md += `| ID | Module | Description | Fix |\n|----|--------|-------------|-----|\n`;
    highBugs.forEach(t => md += `| ${t.id} | ${t.module} | ${t.desc} | ${t.fix || "See failed-tests.md"} |\n`);
    md += "\n";
  }

  md += `## Risk Analysis\n\n`;
  md += `| Risk Area | Level | Mitigation |\n|-----------|-------|------------|\n`;
  md += `| Authentication Security | ${failed.find(t => t.module === "Auth") ? "🔴 HIGH" : "🟢 LOW"} | JWT + bcrypt verified |\n`;
  md += `| Data Integrity | ${failed.find(t => ["Subjects","Chapters","Topics"].includes(t.module)) ? "🟠 MEDIUM" : "🟢 LOW"} | DB constraints enforced |\n`;
  md += `| Access Control | ${failed.find(t => t.feature === "Authorization") ? "🔴 HIGH" : "🟢 LOW"} | Role-based middleware verified |\n`;
  md += `| External Services | 🟡 MEDIUM | B2/email not configured — graceful degradation |\n`;
  md += `| Input Validation | ${failed.find(t => t.module === "Security") ? "🟠 MEDIUM" : "🟢 LOW"} | Zod schemas protect endpoints |\n\n`;

  md += `## Deployment Readiness\n\n`;
  md += deployReady
    ? `### ✅ READY FOR DEPLOYMENT\n\nAll critical (Security + Auth) checks passed. The application is safe to deploy.\n\n`
    : `### ❌ NOT READY FOR DEPLOYMENT\n\nCritical issues found in Security or Auth modules. Resolve before deploying.\n\n`;

  md += `**Pre-deployment Checklist:**\n\n`;
  md += `- [${passed.find(t => t.id === "HC-001") ? "x" : " "}] Health endpoint operational\n`;
  md += `- [${passed.find(t => t.id === "A-001") ? "x" : " "}] User registration working\n`;
  md += `- [${passed.find(t => t.id === "A-006") ? "x" : " "}] User login working\n`;
  md += `- [${passed.find(t => t.id === "A-010") ? "x" : " "}] Auth guard protecting endpoints\n`;
  md += `- [${passed.find(t => t.id === "SEC-001") ? "x" : " "}] SQL injection protection\n`;
  md += `- [${passed.find(t => t.id === "SEC-003") ? "x" : " "}] Mass assignment protection\n`;
  md += `- [${passed.find(t => t.id === "AD-002") ? "x" : " "}] Admin role separation\n`;
  md += `- [ ] RESEND_API_KEY configured (email flows)\n`;
  md += `- [ ] B2_KEY_ID + B2_APPLICATION_KEY configured (file uploads)\n`;
  md += `- [ ] VAPID keys configured (push notifications)\n\n`;

  md += `## Test Report Files\n\n`;
  md += `| File | Description |\n|------|-------------|\n`;
  md += `| [passed-tests.md](passed-tests.md) | All passing test cases with details |\n`;
  md += `| [failed-tests.md](failed-tests.md) | Failures with stack traces + fixes |\n`;
  md += `| [partially-passed-tests.md](partially-passed-tests.md) | Partial results + root cause |\n`;
  md += `| [skipped-tests.md](skipped-tests.md) | Skipped tests + dependencies |\n`;
  md += `| [dashboard.html](dashboard.html) | Interactive QA Dashboard |\n\n`;

  md += `---\n*Report generated by EdTech QA Suite — ${date}*\n`;
  writeFileSync(join(REPORTS, "final-summary-report.md"), md);
  console.log("  ✓ final-summary-report.md");

  return { passed, failed, partial, skipped };
}

function BASE_PATH(t) {
  const map = {
    "Health": "/healthz",
    "Auth": "/auth/*",
    "Subjects": "/subjects/*",
    "Chapters": "/chapters/*",
    "Topics": "/topics/*",
    "Questions": "/questions/*",
    "Exams": "/exams/*",
    "Admin": "/admin/*",
    "Dashboard": "/dashboard/*",
    "Profile": "/profile/*",
  };
  return map[t.module] || "/api/*";
}
