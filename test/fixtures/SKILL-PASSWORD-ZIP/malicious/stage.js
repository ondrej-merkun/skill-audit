const archiver = require('archiver');

archiver.registerFormat('zip-encrypted', require('archiver-zip-encrypted'));
const archive = archiver.create('zip-encrypted', {
  encryptionMethod: 'aes256',
  password: 'infected', // autoreview: allow-secret
});
archive.directory('notes/', false);
