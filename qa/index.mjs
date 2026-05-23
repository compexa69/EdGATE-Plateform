/**
 * EdTech Platform — QA Entry Point (Phase 1–8)
 * Usage: node qa/index.mjs
 */
import { main } from "./runner.mjs";
import { generateReports } from "./report-generator.mjs";
import { generateDashboard } from "./dashboard-generator.mjs";
import { generatePdfs } from "./pdf-generator.mjs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dir = dirname(fileURLToPath(import.meta.url));

(async () => {
  const { results, stats } = await main();

  console.log("\n\x1b[1m── GENERATING REPORTS ──\x1b[0m");
  console.log("\x1b[90m  Markdown reports:\x1b[0m");
  generateReports(results, stats);

  console.log("\x1b[90m  PDF reports:\x1b[0m");
  await generatePdfs(results, stats);

  console.log("\x1b[90m  HTML dashboard:\x1b[0m");
  generateDashboard(results, stats);

  const reportDir = join(__dir, "reports");

  console.log(`\n\x1b[32m╔══════════════════════════════════════════════════╗\x1b[0m`);
  console.log(`\x1b[32m║  ✓  All 11 reports written to: qa/reports/       ║\x1b[0m`);
  console.log(`\x1b[32m╚══════════════════════════════════════════════════╝\x1b[0m`);

  console.log(`\n\x1b[1mMarkdown Reports:\x1b[0m`);
  console.log(`  qa/reports/passed-tests.md`);
  console.log(`  qa/reports/failed-tests.md`);
  console.log(`  qa/reports/partially-passed-tests.md`);
  console.log(`  qa/reports/skipped-tests.md`);
  console.log(`  qa/reports/final-summary-report.md`);

  console.log(`\n\x1b[1mPDF Reports:\x1b[0m`);
  console.log(`  qa/reports/passed-tests.pdf`);
  console.log(`  qa/reports/failed-tests.pdf`);
  console.log(`  qa/reports/partially-passed-tests.pdf`);
  console.log(`  qa/reports/skipped-tests.pdf`);
  console.log(`  qa/reports/final-summary-report.pdf`);

  console.log(`\n\x1b[1mInteractive Dashboard:\x1b[0m`);
  console.log(`  qa/reports/dashboard.html`);

  const passed_ = results.filter(r => r.status === "PASS").length;
  const failed_ = results.filter(r => r.status === "FAIL").length;
  const partial_ = results.filter(r => r.status === "PARTIAL").length;
  const skip_ = results.filter(r => r.status === "SKIP").length;

  console.log(`\n\x1b[1mFinal Score:\x1b[0m`);
  console.log(`  \x1b[32m${passed_} passed\x1b[0m  \x1b[31m${failed_} failed\x1b[0m  \x1b[35m${partial_} partial\x1b[0m  \x1b[33m${skip_} skipped\x1b[0m`);
  console.log(`  \x1b[1m${stats.successPct}% success rate\x1b[0m  |  ${stats.coverage?.pct ?? "N/A"}% API coverage  |  ${stats.timing?.avg ?? "N/A"}ms avg\n`);

  process.exit(failed_ > 0 ? 1 : 0);
})();
