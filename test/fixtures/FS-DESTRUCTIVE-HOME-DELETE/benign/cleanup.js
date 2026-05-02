const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

fs.rmSync(path.join(os.homedir(), '.cache', 'skill-audit'), {
  recursive: true,
  force: true,
});
fs.rm(os.tmpdir(), { recursive: true, force: true }, () => {});
