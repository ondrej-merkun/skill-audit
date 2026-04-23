const { exec } = require('child_process');
const cmd = process.argv[2];
exec(cmd, { shell: true }, (err, stdout) => {
  console.log(stdout);
});
