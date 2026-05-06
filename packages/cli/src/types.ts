export type Severity = 'critical' | 'high' | 'medium' | 'low' | 'info';

export type Verdict = 'PASS' | 'REVIEW' | 'FAIL';

// Plugin contract — interface because discovery plugins implement it
export type AgentDiscoveryCheckOptions = {
  onProgress?: (message: string) => void;
};

export interface AgentDiscovery {
  id: string;
  displayName: string;
  isInstalled(options?: AgentDiscoveryCheckOptions): Promise<boolean>;
  discoverSkills(options?: DiscoverSkillsOptions): Promise<Skill[]>;
}

export type DiscoverSkillsOptions = {
  includeMarketplaces?: boolean;
};

export type Skill = {
  id: string; // stable hash of agentId + path
  agentId: string;
  name: string;
  path: string; // absolute dir or file path
  alsoInstalledAt?: string[];
  manifestPath: string | null;
  modifiedAt?: string;
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
  installState?: 'installed' | 'marketplace';
  treeSha256: string;
  trusted?: boolean;
  metadata?: Record<string, unknown> & {
    ruleScanFilename?: string;
    sourcePluginName?: string;
  };
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
  ignoredForVerdict?: boolean;
  fileRole?: 'inert-supporting-docs';
};

export type LlmReviewFinding = {
  severity: Severity;
  category: string;
  confidence: number;
  rationale: string;
  file?: string;
  suggestedFix?: string;
};

export type LlmReviewStatus =
  | 'not-run'
  | 'ok'
  | 'unavailable'
  | 'timeout'
  | 'invalid-response'
  | 'skipped-offline';

export type LlmReviewResult = {
  modelName: string;
  provider: string;
  model: string;
  status: LlmReviewStatus;
  promptVersion: string;
  findings: LlmReviewFinding[];
  error?: string;
};

export type SkillsShEnrichment = {
  gen: string;
  socketAlerts: number;
  snyk: string;
};

export type GitHubEnrichment = {
  stars: number;
  ageDays: number;
  contributors: number | null;
  contributorsStatus?: 'found' | 'unavailable';
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

export type EnrichmentSourceKey = 'skillsSh' | 'github' | 'depsdev';

export type EnrichmentSourceStatus =
  | 'found'
  | 'stale-cache'
  | 'no-input'
  | 'no-metadata'
  | 'unavailable'
  | 'skipped-offline';

export type EnrichmentSourceOutcome = {
  source: EnrichmentSourceKey;
  status: EnrichmentSourceStatus;
  reason?: string;
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
  llmReviews?: LlmReviewResult[];
  enrichment: Enrichment;
  enrichmentOutcomes?: EnrichmentSourceOutcome[];
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
  enrichmentOutcomes?: EnrichmentSourceOutcome[];
};
