// Decodes a base64 config value — no execution
const encoded = "eyJ1c2VyIjoiYWxpY2UifQ==";
const config = JSON.parse(Buffer.from(encoded, 'base64').toString());
const decoded = atob("aGVsbG8=");
console.log(decoded, config.user);
