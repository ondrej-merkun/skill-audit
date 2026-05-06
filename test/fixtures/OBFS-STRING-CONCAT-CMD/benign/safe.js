// Normal string concatenation for non-dangerous strings
const greeting = "hel" + "lo, world";
const path = "/usr/" + "local" + "/bin";
const hex_color = "\xFF\x99\x00";   // 3-byte sequence, not 4+
const null_bytes = "\x00\x00\x00\x00";
const nop_sled = "\x90\x90\x90\x90";
const msg = "name: " + userName + ", role: " + userRole;
