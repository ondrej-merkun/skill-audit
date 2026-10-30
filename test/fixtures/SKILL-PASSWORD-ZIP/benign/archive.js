const { execFile, spawn, spawnSync } = require('node:child_process');

// Archive the project without a password, so that scanners can read the archive
spawn('zip', ['-r', '-q', 'backup.zip', 'src/']);
execFile('zip', ['-r', 'site.zip', 'public/'], () => {});
spawnSync('7z', ['a', '-mx=9', 'backup.7z', 'src/']);

// A -P that belongs to another command does not count
const formats = ['zip', 'tar'];
spawnSync('rsync', ['-avP', 'backup.zip', 'deploy@example.com:/srv/']);
spawn('xargs', ['-P', '4', 'gzip'], { stdio: 'inherit' });
