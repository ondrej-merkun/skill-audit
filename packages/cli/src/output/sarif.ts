import { createHash } from 'node:crypto';
import { realpathSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { ALL_RULES } from '../rules/index.js';
import type { Finding, Rule, ScanResult, Severity } from '../types.js';
import { VERSION } from '../version.js';
import { sortScanSkills } from './sort.js';

const SARIF_SCHEMA_URI = 'https://json.schemastore.org/sarif-2.1.0.json';
const TOOL_INFORMATION_URI = 'https://github.com/ondrej-merkun/skill-audit';
// The base of relative locations. GitHub code scanning reads them from the repository root.
const PROJECT_ROOT_BASE_ID = '%SRCROOT%';

const SARIF_LEVEL: Record<Severity, SarifLevel> = {
  critical: 'error',
  high: 'error',
  medium: 'warning',
  low: 'note',
  info: 'note',
};

/**
 * Renders scanned skills as a SARIF 2.1.0 log for GitHub code scanning. The results keep the
 * risk-first skill order of the other scan outputs. `projectRoot` is the directory that
 * discovery searches for project skills.
 */
export function renderSarif(result: Pick<ScanResult, 'skills'>, projectRoot: string): string {
  const findings = sortScanSkills(result.skills).flatMap((skill) => skill.findings);
  const rules = ruleCatalog(findings);
  const context: ResultContext = {
    ruleIndexById: new Map(rules.map((rule, index) => [rule.id, index])),
    projectRootUri: directoryUri(projectRoot),
    fingerprintCounts: new Map(),
  };

  const log = {
    $schema: SARIF_SCHEMA_URI,
    version: '2.1.0',
    runs: [
      {
        tool: {
          driver: {
            name: 'skill-audit',
            semanticVersion: VERSION,
            informationUri: TOOL_INFORMATION_URI,
            rules: rules.map(ruleDescriptor),
          },
        },
        originalUriBaseIds: { [PROJECT_ROOT_BASE_ID]: { uri: context.projectRootUri } },
        // Finding columns are JavaScript string offsets.
        columnKind: 'utf16CodeUnits',
        results: findings.map((finding) => sarifResult(finding, context)),
      },
    ],
  };
  return JSON.stringify(log, null, 2);
}

// Every shipped rule, then each rule that exists only as a finding, such as the
// security-education context note.
function ruleCatalog(findings: Finding[]): CatalogRule[] {
  const rules = new Map<string, CatalogRule>(ALL_RULES.map((rule) => [rule.id, rule]));
  for (const { ruleId, category, severity, message, fix, cwe } of findings) {
    if (rules.has(ruleId)) continue;
    rules.set(ruleId, { id: ruleId, category, severity, message, fix, cwe });
  }
  return [...rules.values()];
}

function ruleDescriptor(rule: CatalogRule): object {
  return {
    id: rule.id,
    shortDescription: { text: rule.message },
    // The issue and fix text that `skill-audit explain` prints for a finding of this rule.
    help: { text: rule.fix ? `${rule.message}\n\nFix: ${rule.fix}` : rule.message },
    defaultConfiguration: { level: SARIF_LEVEL[rule.severity] },
    properties: { tags: ['security', rule.category, ...rule.cwe] },
  };
}

function sarifResult(finding: Finding, context: ResultContext): object {
  const artifactLocation = artifactLocationFor(finding.file, context.projectRootUri);

  // upload-sarif computes the fingerprint of a file in the checkout, and it warns when a
  // supplied one differs. It skips a file outside the checkout, so only that file gets ours.
  const partialFingerprints =
    artifactLocation.uriBaseId === undefined
      ? { primaryLocationLineHash: lineHash(finding, artifactLocation.uri, context) }
      : undefined;

  return {
    ruleId: finding.ruleId,
    ruleIndex: context.ruleIndexById.get(finding.ruleId),
    level: SARIF_LEVEL[finding.severity],
    message: { text: finding.message },
    locations: [
      {
        physicalLocation: {
          artifactLocation,
          region: { startLine: finding.line, startColumn: finding.column },
        },
      },
    ],
    ...(partialFingerprints !== undefined ? { partialFingerprints } : {}),
  };
}

// GitHub cannot show a result in a symlinked file, so a location names the real file. A file in
// the project is relative to the project root. A file outside it, such as a home directory
// skill, keeps an absolute file URI.
function artifactLocationFor(file: string, projectRootUri: string): ArtifactLocation {
  const uri = pathToFileURL(realPath(file)).href;
  if (!uri.startsWith(projectRootUri)) return { uri };

  // A colon in a relative path would make its first segment read as a URI scheme.
  const relativeUri = uri.slice(projectRootUri.length).replaceAll(':', '%3A');
  return { uri: relativeUri, uriBaseId: PROJECT_ROOT_BASE_ID };
}

// The hash covers the rule, the file, and the line text, but not the line number, so an alert
// keeps its identity when lines above it change. The suffix counts identical lines, as in
// GitHub's own fingerprints.
function lineHash(finding: Finding, uri: string, context: ResultContext): string {
  const lineText = finding.snippet.replace(/\s+/g, ' ');
  const hash = createHash('sha256')
    .update(`${finding.ruleId}\0${uri}\0${lineText}`)
    .digest('hex')
    .slice(0, 16);

  const occurrence = (context.fingerprintCounts.get(hash) ?? 0) + 1;
  context.fingerprintCounts.set(hash, occurrence);
  return `${hash}:${occurrence}`;
}

function directoryUri(dir: string): string {
  const uri = pathToFileURL(realPath(dir)).href;
  return uri.endsWith('/') ? uri : `${uri}/`;
}

// A path that does not resolve, for example a file deleted after the scan, keeps its absolute form.
function realPath(path: string): string {
  try {
    return realpathSync(path);
  } catch {
    return resolve(path);
  }
}

type SarifLevel = 'error' | 'warning' | 'note';

type CatalogRule = Pick<Rule, 'id' | 'category' | 'severity' | 'message' | 'fix' | 'cwe'>;

type ArtifactLocation = { uri: string; uriBaseId?: string };

type ResultContext = {
  ruleIndexById: Map<string, number>;
  projectRootUri: string;
  fingerprintCounts: Map<string, number>;
};
