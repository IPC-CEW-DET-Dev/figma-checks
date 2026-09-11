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
  .action(async (opts) => {
    const config = await loadConfig(opts.config);
    const run = await runComparison(config, { only: opts.only });
    const reportPath = await generateReport(run);

    console.log("");
    let anyFailed = false;
    for (const result of run.components) {
      const passing = isComponentPassing(result);
      if (!passing) anyFailed = true;
      const label = passing ? chalk.green("PASS") : chalk.red("FAIL");
      console.log(`${label}  ${result.name}`);
      if (result.error) {
        console.log(chalk.red(`       ${result.error}`));
        continue;
      }
      for (const diff of result.styleDiffs.filter((d) => !d.pass)) {
        const location = diff.actualSource ? ` (found on ${chalk.cyan(diff.actualSource)})` : "";
        console.log(chalk.yellow(`       ${diff.property}: expected "${diff.expected}", got "${diff.actual}"${location}`));
      }
    }

    console.log("");
    console.log(`Report written to ${chalk.cyan(reportPath)}`);

    if (anyFailed) process.exitCode = 1;
  });

program.parseAsync(process.argv);
