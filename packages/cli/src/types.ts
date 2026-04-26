export type Severity = 'critical' | 'high' | 'medium' | 'low' | 'info';

export type Verdict = 'PASS' | 'REVIEW' | 'FAIL';

// Plugin contract — interface because discovery plugins implement it
export interface AgentDiscovery {
  id: string;
  displayName: string;
  isInstalled(): Promise<boolean>;
  discoverSkills(): Promise<Skill[]>;
}

export type Skill = {
  id: string; // stable hash of agentId + path
  agentId: string;
  name: string;
  path: string; // absolute dir or file path
  alsoInstalledAt?: string[];
  manifestPath: string | null;
  format:
    | 'SKILL.md'
    | 'plugin.json'
    | 'mcp-server'
    | 'mcp-toml'
    | 'mcp-json'
    | 'prompt-md'
    | 'rules-md'
    | 'agents-md'
    | 'gemini-extension-json'
    | 'gemini-command-toml'
    | 'gemini-agent-md';
  scope: 'user' | 'project' | 'managed';
  treeSha256: string;
  trusted?: boolean;
  metadata?: Record<string, unknown>;
};

export type Rule = {
  id: string;
  category: string;
  severity: Severity;
  appliesTo: string[]; // glob patterns for which files this rule matches
  patterns: RegExp[];
  prepareContent?: (content: string, filePath: string) => string;
  message: string;
  fix: string;
  cwe: string[];
};

export type Finding = {
  ruleId: string;
  severity: Severity;
  category: string;
  file: string;
  line: number;
  column: number;
  snippet: string;
  message: string;
  fix: string;
  cwe: string[];
};

export type SkillsShEnrichment = {
  gen: string;
  socketAlerts: number;
  snyk: string;
};

export type GitHubEnrichment = {
  stars: number;
  ageDays: number;
  contributors: number;
};

export type DepsDevEnrichment = {
  scorecardScore: number | null;
  osvAdvisories: number;
};

export type Enrichment = {
  skillsSh?: SkillsShEnrichment;
  github?: GitHubEnrichment;
  depsdev?: DepsDevEnrichment;
};

export type EnrichmentStatus =
  | 'not-run'
  | 'skipped-offline'
  | 'unavailable'
  | 'no-metadata'
  | 'found';

export type SkillSummary = {
  critical: number;
  high: number;
  medium: number;
  low: number;
  info: number;
  score: number;
  verdict: Verdict;
  mandatoryFail: string[];
  allowlisted: boolean;
};

// A skill after scanning — extends Skill with runtime findings
export type ScannedSkill = Skill & {
  findings: Finding[];
  enrichment: Enrichment;
  summary: SkillSummary;
  ignored?: true;
};

export type AgentInfo = {
  id: string;
  installed: boolean;
  skillsScanned: number;
};

export type ScanMeta = {
  startedAt: string;
  durationMs: number;
  toolVersion: string;
};

export type ScanSummary = {
  skillsScanned: number;
  compromised: number;
  percentCompromised: number;
  verdict: Verdict;
};

export type ScanResult = {
  schemaVersion: '1.0';
  scan: ScanMeta;
  agents: AgentInfo[];
  skills: ScannedSkill[];
  summary: ScanSummary;
  enrichmentStatus?: EnrichmentStatus;
};
