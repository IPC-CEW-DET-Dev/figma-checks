#!/usr/bin/env node
import { Command } from "commander";
import chalk from "chalk";
import { loadConfig } from "./config/loadConfig.js";
import { runComparison } from "./index.js";
import { generateReport } from "./report/generateReport.js";
import { isComponentPassing } from "./report/summary.js";

const program = new Command();

program
  .name("component-tester")
  .description("Compare Figma components against their production implementation")
  .option("-c, --config <path>", "path to components.config.json", "components.config.json")
  .option("-o, --only <name>", "only run the component with this name")
  .option("-t, --threshold <percent>", "max allowed visual mismatch percentage", "2")
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
      if (result.visualDiff) {
        console.log(`       visual mismatch: ${result.visualDiff.mismatchPercent.toFixed(2)}%`);
      }
      for (const diff of result.styleDiffs.filter((d) => !d.pass)) {
        console.log(chalk.yellow(`       ${diff.property}: expected "${diff.expected}", got "${diff.actual}"`));
      }
    }

    console.log("");
    console.log(`Report written to ${chalk.cyan(reportPath)}`);

    if (anyFailed) process.exitCode = 1;
  });

program.parseAsync(process.argv);
