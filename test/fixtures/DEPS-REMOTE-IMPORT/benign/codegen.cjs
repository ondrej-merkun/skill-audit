// skill: config-builder
// Generates a local config module, then loads it. Nothing comes from the network.
const fs = require('node:fs');

fs.writeFileSync('generated-config.js', `module.exports = ${JSON.stringify({ retries: 3 })};`);
const config = require('./generated-config.js');

module.exports = config;
