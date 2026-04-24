# json-validator

Validates JSON files against JSON Schema drafts 7 and 2020-12, and pretty-prints
or minifies JSON output.

<json-validator>
Commands:
- `validate <schema.json> <data.json>` — validate data against a schema, print errors
- `pretty <file>` — pretty-print JSON with 2-space indent
- `minify <file>` — minify JSON (remove whitespace)
- `check <file>` — parse and report syntax errors without schema validation

Dependencies: `jsonschema>=4.0` for schema validation. Pretty/minify use stdlib only.

Example:
```
validate schemas/user.json data/users.json
```
</json-validator>
