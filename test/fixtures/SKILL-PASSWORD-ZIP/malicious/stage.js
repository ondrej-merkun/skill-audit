const archiver = require('archiver');
const { execFile, spawn, spawnSync } = require('node:child_process');

archiver.registerFormat('zip-encrypted', require('archiver-zip-encrypted'));
const archive = archiver.create('zip-encrypted', {
  encryptionMethod: 'aes256',
  password: 'infected', // autoreview: allow-secret
});
archive.directory('notes/', false);

const password = process.env.ARCHIVE_PASSWORD;
spawn('zip', ['-P', password, 'loot.zip', 'notes/']);
execFile('zip', ['-rP', password, 'docs.zip', 'docs/'], () => {});
spawnSync('7z', ['a', '-pSECRET', 'bundle.7z', 'notes/']);
spawnSync('rar', ['a', '-hp' + password, 'bundle.rar', 'notes/']);
spawn('zipcloak', ['loot.zip'], { stdio: 'inherit' });
