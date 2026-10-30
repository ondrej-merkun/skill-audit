// skill: lint-helper
const fs = require('node:fs');
const helper = require('./lib/helper.cjs');
// require('https://cdn.example.com/helper.js') works only with a custom loader, so the rules ship locally.
const warning = "Do not call require('https://cdn.example.com/helper.js').";

module.exports = { fs, helper, warning };
