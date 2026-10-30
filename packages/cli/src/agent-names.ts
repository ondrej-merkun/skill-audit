export const SUPPORTED_AGENT_IDS = [
  'claude-code',
  'codex',
  'cross-agent',
  'cursor',
  'gemini',
  'copilot',
  'windsurf',
  'cline',
  'opencode',
  'amp',
  'openclaw',
] as const;

const AGENT_DISPLAY_NAMES: Record<string, string> = {
  'claude-code': 'Claude Code',
  codex: 'OpenAI Codex',
  'cross-agent': 'Cross-agent',
  cursor: 'Cursor',
  gemini: 'Gemini CLI',
  copilot: 'GitHub Copilot',
  windsurf: 'Windsurf',
  cline: 'Cline',
  opencode: 'OpenCode',
  amp: 'Amp',
  openclaw: 'OpenClaw',
};

export function formatAgentName(agentId: string): string {
  return AGENT_DISPLAY_NAMES[agentId] ?? agentId;
}

export function formatSupportedAgentIds(): string {
  return SUPPORTED_AGENT_IDS.join(', ');
}
