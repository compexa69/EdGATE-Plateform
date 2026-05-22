/**
 * EdTech Platform — QA Entry Point
 * Usage: node qa/index.mjs
 */
import { main } from "./runner.mjs";
import { generateReports } from "./report-generator.mjs";
import { generateDashboard } from "./dashboard-generator.mjs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dir = dirname(fileURLToPath(import.meta.url));

(async () => {
  const { results, stats } = await main();

  console.log("\n\x1b[1m── GENERATING REPORTS ──\x1b[0m");
  generateReports(results, stats);
  generateDashboard(results, stats);

  const reportDir = join(__dir, "reports");
  console.log(`\n\x1b[32m✓ All reports written to: ${reportDir}\x1b[0m`);
  console.log(`\n\x1b[1mFiles generated:\x1b[0m`);
  console.log(`  qa/reports/passed-tests.md`);
  console.log(`  qa/reports/failed-tests.md`);
  console.log(`  qa/reports/partially-passed-tests.md`);
  console.log(`  qa/reports/skipped-tests.md`);
  console.log(`  qa/reports/final-summary-report.md`);
  console.log(`  qa/reports/dashboard.html`);

  process.exit(stats.fail > 0 ? 1 : 0);
})();
