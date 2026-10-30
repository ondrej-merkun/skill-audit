import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import Ajv from 'ajv-draft-04';
import addFormats from 'ajv-formats';

// The normative OASIS SARIF 2.1.0 errata01 schema, vendored from
// https://docs.oasis-open.org/sarif/sarif/v2.1.0/errata01/os/schemas/sarif-schema-2.1.0.json
// It is a draft-04 schema, so it needs the draft-04 Ajv class. ajv-formats checks the
// `uri` and `uri-reference` formats that artifact locations use.
const SCHEMA_PATH = fileURLToPath(new URL('../schemas/sarif-schema-2.1.0.json', import.meta.url));

const ajv = new Ajv({ allErrors: true });
addFormats(ajv);
const validateSarif = ajv.compile(JSON.parse(readFileSync(SCHEMA_PATH, 'utf-8')));

/** Returns the SARIF 2.1.0 schema errors of a log. An empty list means the log is valid. */
export function sarifSchemaErrors(log: unknown): string[] {
  if (validateSarif(log)) return [];
  return (validateSarif.errors ?? []).map((error) => `${error.instancePath} ${error.message}`);
}
