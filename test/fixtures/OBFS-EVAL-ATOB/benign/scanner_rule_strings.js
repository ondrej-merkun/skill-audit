const rules = [
  {
    id: "OBFS-EVAL-ATOB",
    example: "Never run eval(atob(payload)).",
    fix: "Decode base64 data without executing it.",
  },
  {
    id: "OBFS-EVAL-BUFFER",
    example: "Do not use eval(Buffer.from(encoded, 'base64')).",
  },
];

// eval(atob(payload)) appears in this comment as scanner documentation only.
console.log(rules.map((rule) => rule.id).join(","));
