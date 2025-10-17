const fs = require('fs');
const fsPromises = require('fs/promises');
const path = require('path');
const util = require('util');
const { sub } = require('date-fns');

function loadConfig() {
  const configPath = path.join(__dirname, 'config.json');
  const configFileContent = fs.readFileSync(configPath, 'utf-8');
  const configWithoutComments = configFileContent.split('\n')
    .filter(line => !line.trim().startsWith('"_') && !line.trim().startsWith('"//'))
    .join('\n');
  const config = JSON.parse(configWithoutComments);

  config.VH_NAME = config.VH_NAME_TEMPLATE.replace('${LB_NAME}', config.LB_NAME);
  config.API_AGGREGATION_URL = config.API_AGGREGATION_URL_TEMPLATE
    .replace('{TENANT_URL}', config.TENANT_URL)
    .replace('{NAMESPACE}', config.NAMESPACE);
  config.API_EVENTS_URL = config.API_EVENTS_URL_TEMPLATE
    .replace('{TENANT_URL}', config.TENANT_URL)
    .replace('{NAMESPACE}', config.NAMESPACE);
  
  return config;
}

function logDebug(level, title, data, DEBUG_LEVEL) {
  if (DEBUG_LEVEL >= level) {
    console.log(`\n--- DEBUG [${title}] ---`);
    if (data.url) {
      console.log(`URL: ${data.url}`);
      console.log('BODY:', util.inspect(data.body, { colors: true, depth: null }));
    } else {
      console.log('RESPONSE DATA:', util.inspect(data, { colors: true, depth: null }));
    }
    console.log('--------------------------\n');
  }
}

function getRequestHeaders(config) {
  return {
    headers: {
      'Accept': 'application/json',
      'Content-Type': 'application/json',
      'Authorization': `APIToken ${config.API_TOKEN}`,
    },
  };
}

async function prepareRequestBody(queryFile, { startTime, endTime }, config) {
    const templateString = await readQueryTemplate(queryFile);
    const populatedTemplate = populateTemplate(templateString, { startTime, endTime }, config);
    const templateObject = JSON.parse(populatedTemplate);
    return buildRequestBody(templateObject);
}

function extractBucketKeys(responseData) {
  if (!responseData.aggs) return [];
  const firstAggKey = Object.keys(responseData.aggs)[0];
  const buckets = responseData.aggs[firstAggKey]?.field_aggregation?.buckets;
  if (!buckets) return [];
  return buckets.map(bucket => bucket.key);
}

// UPDATED: This function now preserves the original case for keys and values
function buildRequestBody(templateObject) {
  const queryParts = [];
  for (const key in templateObject.query) {
    let value = templateObject.query[key];
    const originalKey = key; // Use the key as-is
    
    let operator = '='; // Default operator
    
    // Check for explicit operators
    if (value.startsWith('!=')) {
      operator = '!=';
      value = value.substring(2);
    } else if (value.startsWith('!~')) {
      operator = '!~';
      value = value.substring(2);
    } else if (value.startsWith('=~')) {
      operator = '=~';
      value = value.substring(2);
    } else if (value.startsWith('=')) {
      value = value.substring(1);
    } else if (value.includes('|')) {
      // Infer regex for multi-value strings
      operator = '=~';
    }
    
    // Use the value as-is, without case conversion
    queryParts.push(`${originalKey}${operator}"${value}"`);
  }
  
  return {
    ...templateObject,
    query: `{${queryParts.join(',')}}`,
  };
}


function populateTemplate(template, { startTime, endTime }, config) {
  const replacements = { ...config, START_TIME: startTime, END_TIME: endTime };
  return template.replace(/{(\w+)}/g, (match, key) => replacements[key] || match);
}

async function readQueryTemplate(filePath) {
  try {
    return await fsPromises.readFile(path.resolve(filePath), 'utf-8');
  } catch (err) {
    throw new Error(`Could not read query file: ${path.resolve(filePath)}`);
  }
}

function getTimeWindow(timeArgs) {
  const timeFlag = timeArgs[0];
  const now = new Date();
  let startTime, endTime;

  switch (timeFlag) {
    case '--relative':
      if (!timeArgs[1]) throw new Error('Missing relative time value.');
      const [value, unit] = [parseInt(timeArgs[1]), timeArgs[1].slice(-1)];
      const duration = {};
      if (unit === 'm') duration.minutes = value;
      else if (unit === 'h') duration.hours = value;
      else if (unit === 'd') duration.days = value;
      startTime = sub(now, duration).toISOString();
      break;
    case '--absolute':
      if (!timeArgs[1] || !timeArgs[2]) throw new Error('Missing absolute start or end time.');
      startTime = timeArgs[1];
      endTime = timeArgs[2];
      break;
    default:
      startTime = sub(now, { minutes: 15 }).toISOString();
  }

  endTime = endTime || new Date().toISOString();
  return { startTime, endTime };
}

function printUsage() {
    console.log(`
Usage: node run_query.js <path/to/query.json> [time_option] [workflow_option]

Time Options:
  --relative <value>        Examples: 5m, 1h, 3d
  --absolute <start> <end>  Use an exact ISO 8601 time window.

Workflow Option:
  --drill-down <FIELD> <path/to/second_query.json>
                            Performs a 2-step analysis.
                            <FIELD> is the key to extract from step 1 (e.g., SRC_IP).
    `);
}

module.exports = {
  loadConfig,
  logDebug,
  getRequestHeaders,
  prepareRequestBody,
  extractBucketKeys,
  buildRequestBody,
  populateTemplate,
  readQueryTemplate,
  getTimeWindow,
  printUsage,
};
