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
  agentIds?: string[];
  agentPaths?: Array<{ agentId: string; path: string }>;
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
    | 'gemini-agent-md'
    | 'agent-config';
  scope: 'user' | 'project' | 'managed';
  // Set when dedupe merged installations that differ in scope, format, or scan name. Rule
  // selection reads them; the JSON and list outputs do not show them.
  installations?: SkillInstallation[];
  installState?: 'installed' | 'marketplace';
  treeSha256: string;
  trusted?: boolean;
  metadata?: Record<string, unknown> & {
    ruleScanFilename?: string;
    // Rules scan this text instead of the file at `path`, e.g. one MCP server's definition.
    ruleScanContent?: string;
    sourcePluginName?: string;
  };
};

/**
 * What rule selection reads from one installation of a skill. It holds no path, because the
 * HTML report embeds skills and redacts only the known path fields.
 */
export type SkillInstallation = {
  format: Skill['format'];
  scope: Skill['scope'];
  // The name that rules match for a single-file target, such as `settings.local.json`.
  scanName: string;
};

export type Rule = {
  id: string;
  category: string;
  severity: Severity;
  appliesTo: string[]; // glob patterns for which files this rule matches
  appliesToScopes?: Array<Skill['scope']>; // set = agent config targets of these scopes only
  patterns: RegExp[];
  prepareContent?: (content: string, filePath: string) => string;
  // A narrower view of the content. Pattern matches in it report this higher severity.
  escalation?: {
    severity: Severity;
    prepareContent: (content: string, filePath: string) => string;
  };
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
};
