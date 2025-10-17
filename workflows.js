const axios = require('axios');
const util = require('util');
const { Address4 } = require('ip-address');
const {
  prepareRequestBody,
  getRequestHeaders,
  logDebug,
  extractBucketKeys,
  readQueryTemplate,
  populateTemplate,
  buildRequestBody,
} = require('./utils');

function isIpAddress(value) {
  try {
    new Address4(value);
    return true;
  } catch (e) {
    return false;
  }
}

function filterExemptValues(values, exemptSubnets) {
  const areIps = values.every(isIpAddress);
  if (!areIps) {
    console.log("Skipping exemption filter because extracted values are not IP addresses.");
    return values;
  }

  if (!exemptSubnets || exemptSubnets.length === 0) return values;

  const subnetObjects = exemptSubnets.map(s => new Address4(s)).filter(Boolean);
  const filteredValues = values.filter(ip => {
    const ipObject = new Address4(ip);
    return !subnetObjects.some(subnet => ipObject.isInSubnet(subnet));
  });

  const removedCount = values.length - filteredValues.length;
  if (removedCount > 0) console.log(`Filtered out ${removedCount} exempt IP(s).`);
  return filteredValues;
}

async function performSingleQuery(queryFile, { startTime, endTime }, config, DEBUG_LEVEL) {
  console.log(`Running query from: ${queryFile}`);
  const requestBody = await prepareRequestBody(queryFile, { startTime, endTime }, config);
  logDebug(1, 'Aggregation Request', { url: config.API_AGGREGATION_URL, body: requestBody }, DEBUG_LEVEL);
  const response = await axios.post(config.API_AGGREGATION_URL, requestBody, getRequestHeaders(config));
  logDebug(2, 'Aggregation Response', response.data, DEBUG_LEVEL);
  console.log(util.inspect(response.data, { colors: true, depth: null }));
}

async function performDrillDown(initialQueryFile, drillDownQueryFile, fieldToExtract, { startTime, endTime }, config, DEBUG_LEVEL) {
  console.log(`STEP 1: Getting top values for '${fieldToExtract}' using '${initialQueryFile}'...`);
  const initialBody = await prepareRequestBody(initialQueryFile, { startTime, endTime }, config);
  logDebug(1, 'Aggregation Request', { url: config.API_AGGREGATION_URL, body: initialBody }, DEBUG_LEVEL);
  const aggResponse = await axios.post(config.API_AGGREGATION_URL, initialBody, getRequestHeaders(config));
  logDebug(2, 'Aggregation Response', aggResponse.data, DEBUG_LEVEL);
  
  let drillDownValues = extractBucketKeys(aggResponse.data, fieldToExtract);
  drillDownValues = filterExemptValues(drillDownValues, config.EXEMPT_SUBNETS);

  if (drillDownValues.length === 0) {
    console.log('No non-exempt values found to drill down on. Exiting.');
    return;
  }
  console.log(`Found ${drillDownValues.length} total non-exempt values.`);
  const limit = config.MAX_DRILLDOWN_VALUES || 10;
  if (drillDownValues.length > limit) {
    console.log(`Limiting to the top ${limit} values for the drill-down query.`);
    drillDownValues = drillDownValues.slice(0, limit);
  }
  console.log(`Using values: ${drillDownValues.join(', ')}\n`);

  console.log(`STEP 2: Getting details for these values using '${drillDownQueryFile}'...`);
  const drillDownTemplate = await readQueryTemplate(drillDownQueryFile);
  let populatedTemplate = populateTemplate(drillDownTemplate, { startTime, endTime }, config);
  populatedTemplate = populatedTemplate.replace(/"\{DRILLDOWN_VALUES\}"/g, `"${drillDownValues.join('|')}"`);
  
  const finalTemplateObject = JSON.parse(populatedTemplate);
  const finalBody = buildRequestBody(finalTemplateObject);
  
  // Decide whether to get events or count based on the second query file
  const isCountQuery = finalBody.aggs && Object.keys(finalBody.aggs).length > 0;
  
  if (isCountQuery) {
    logDebug(1, 'Drill-down Count Request', { url: config.API_AGGREGATION_URL, body: finalBody }, DEBUG_LEVEL);
    const countResponse = await axios.post(config.API_AGGREGATION_URL, finalBody, getRequestHeaders(config));
    logDebug(2, 'Drill-down Count Response', countResponse.data, DEBUG_LEVEL);
    printCountSummary(countResponse.data);
  } else {
    logDebug(1, 'Drill-down Events Request', { url: config.API_EVENTS_URL, body: finalBody }, DEBUG_LEVEL);
    const eventsResponse = await axios.post(config.API_EVENTS_URL, finalBody, getRequestHeaders(config));
    logDebug(2, 'Drill-down Events Response', eventsResponse.data, DEBUG_LEVEL);
    console.log('--- FINAL EVENT LOGS ---');
    console.log(util.inspect(eventsResponse.data, { colors: true, depth: null }));
  }
}

function printCountSummary(responseData) {
  console.log('--- FINAL COUNT SUMMARY ---');
  console.log(`Total events found: ${responseData.total_hits || 0}`);

  if (!responseData.aggs) return;

  const firstAggKey = Object.keys(responseData.aggs)[0];
  const buckets = responseData.aggs[firstAggKey]?.field_aggregation?.buckets;
  if (!buckets) return;

  let mitigatedCount = 0;
  let unmitigatedCount = 0;
  const unmitigatedActions = ['allow', 'report'];

  console.log('\nBreakdown by Action:');
  for (const bucket of buckets) {
    const action = bucket.key;
    const count = parseInt(bucket.count, 10);
    console.log(`  - ${action}: ${count}`);

    if (unmitigatedActions.includes(action)) {
      unmitigatedCount += count;
    } else {
      mitigatedCount += count;
    }
  }
  
  console.log('\nMitigation Summary:');
  console.log(`  - Unmitigated: ${unmitigatedCount}`);
  console.log(`  - Mitigated: ${mitigatedCount}`);
}

module.exports = {
  performSingleQuery,
  performDrillDown,
};
