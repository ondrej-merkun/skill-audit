// skill: helper-loader
// Prints how to download the helper by hand, then loads the local copy.
const { execSync } = require('node:child_process');

console.log('curl -o helper.js https://example.com/helper.js');
execSync('git status');
const helper = require('./helper.js');

module.exports = helper;
