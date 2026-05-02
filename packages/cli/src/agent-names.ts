const AGENT_DISPLAY_NAMES: Record<string, string> = {
  'claude-code': 'Claude Code',
  cursor: 'Cursor',
  copilot: 'GitHub Copilot',
  cline: 'Cline',
  codex: 'OpenAI Codex',
  gemini: 'Gemini CLI',
  windsurf: 'Windsurf',
  'cross-agent': 'Cross-agent',
};

export function formatAgentName(agentId: string): string {
  return AGENT_DISPLAY_NAMES[agentId] ?? agentId;
}
