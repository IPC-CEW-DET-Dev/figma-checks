#!/usr/bin/env node
import dns from "node:dns";
import { Command } from "commander";
import chalk from "chalk";
import { loadConfig } from "./config/loadConfig.js";
import { runComparison } from "./index.js";
import { generateReport } from "./report/generateReport.js";
import { isComponentPassing } from "./report/summary.js";

// Node's DNS resolver can disagree with the OS resolver on some networks (often IPv6-related),
// causing spurious ENOTFOUND for hosts that resolve fine via `nslookup`/curl. Preferring IPv4 avoids it.
dns.setDefaultResultOrder("ipv4first");

const program = new Command();

program
  .name("component-tester")
  .description("Compare Figma components against their production implementation")
  .option("-c, --config <path>", "path to components.config.json", "components.config.json")
  .option("-o, --only <name>", "only run the component with this name")
  .option("-t, --threshold <percent>", "max allowed visual mismatch percentage", "5")
  .action(async (opts) => {
    const threshold = parseFloat(opts.threshold);
    const config = await loadConfig(opts.config);
    const run = await runComparison(config, { only: opts.only });
    const reportPath = await generateReport(run, threshold);

    console.log("");
    let anyFailed = false;
    for (const result of run.components) {
      const passing = isComponentPassing(result, threshold);
      if (!passing) anyFailed = true;
      const label = passing ? chalk.green("PASS") : chalk.red("FAIL");
      console.log(`${label}  ${result.name}`);
      if (result.error) {
        console.log(chalk.red(`       ${result.error}`));
        continue;
      }
      if (result.images) {
        console.log(`       visual mismatch: ${result.images.mismatchPercent.toFixed(2)}%`);
      }
      if (result.parts.length === 0) {
        for (const diff of result.styleDiffs.filter((d) => !d.pass)) {
          const location = diff.actualSource ? ` (found on ${chalk.cyan(diff.actualSource)})` : "";
          console.log(chalk.yellow(`       ${diff.property}: expected "${diff.expected}", got "${diff.actual}"${location}`));
        }
      }
      for (const part of result.parts) {
        if (part.error) {
          console.log(chalk.red(`       [${part.name}] ${part.error}`));
          continue;
        }
        for (const diff of part.styleDiffs.filter((d) => !d.pass)) {
          const location = diff.actualSource ? ` (found on ${chalk.cyan(diff.actualSource)})` : "";
          console.log(chalk.yellow(`       [${part.name}] ${diff.property}: expected "${diff.expected}", got "${diff.actual}"${location}`));
        }
      }
    }

    console.log("");
    console.log(`Report written to ${chalk.cyan(reportPath)}`);

    if (anyFailed) process.exitCode = 1;
  });

program.parseAsync(process.argv);
