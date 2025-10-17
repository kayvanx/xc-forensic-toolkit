/*
Oct 2025 - Kayvan
DEBUG_LEVEL=2 node run_query.js ./queries/step1_get_top_malicious_ips.json --drill-down SRC_IP ./queries/step2_count_waf_actions.json --relative 1h

*/
const util = require('util');
const { performSingleQuery, performDrillDown } = require('./workflows');
const { getTimeWindow, printUsage, loadConfig } = require('./utils');

const config = loadConfig();
const DEBUG_LEVEL = parseInt(process.env.DEBUG_LEVEL, 10) || 0;

async function main() {
  try {
    const args = process.argv.slice(2);
    const initialQueryFile = args[0];

    if (!initialQueryFile) {
      console.error('Error: Query file not specified.');
      printUsage();
      return;
    }

    const drillDownFlagIndex = args.indexOf('--drill-down');
    let timeArgs = [];

    if (drillDownFlagIndex !== -1) {
      const fieldToExtract = args[drillDownFlagIndex + 1];
      const drillDownQueryFile = args[drillDownFlagIndex + 2];
      if (!fieldToExtract || !drillDownQueryFile) {
        throw new Error('Usage: --drill-down <FIELD_TO_EXTRACT> <path/to/second_query.json>');
      }
      timeArgs = args.slice(drillDownFlagIndex + 3);
      const { startTime, endTime } = getTimeWindow(timeArgs);
      await performDrillDown(initialQueryFile, drillDownQueryFile, fieldToExtract, { startTime, endTime }, config, DEBUG_LEVEL);

    } else {
      timeArgs = args.slice(1);
      const { startTime, endTime } = getTimeWindow(timeArgs);
      await performSingleQuery(initialQueryFile, { startTime, endTime }, config, DEBUG_LEVEL);
    }

  } catch (error) {
    if (error.response) {
      console.error('API Error:', util.inspect(error.response.data, {colors: true, depth: null}));
    } else {
      console.error('Application Error:', error.message);
    }
    process.exit(1);
  }
}

main();
