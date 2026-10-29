import { createHash } from 'node:crypto';
import { stat } from 'node:fs/promises';
import { join, posix } from 'node:path';
import type { Skill } from '../types.js';
import { computeTreeSha256 } from './tree-hash.js';

// Each MCP server is scanned as a one-server .mcp.json document. Findings stay on that
// server, and rules never read or quote the rest of a shared file such as ~/.claude.json.
const MCP_SERVER_SCAN_FILENAME = '.mcp.json';

type AgentConfigFiles = {
  agentId: string;
  dir: string;
  // Skill name prefix, e.g. `~/.claude` for a home file or `.claude` for a project file.
  // Distinct names keep `skill-audit explain <name>` unambiguous.
  displayDir: string;
  fileNames: string[];
  scope: Skill['scope'];
  metadata?: Skill['metadata'];
};

/** Emits each agent hook or settings file that exists as a scan target. */
export async function discoverAgentConfigFiles(files: AgentConfigFiles): Promise<Skill[]> {
  const skills: Skill[] = [];

  for (const fileName of files.fileNames) {
    const path = join(files.dir, fileName);
    if (!(await isFile(path))) continue;

    skills.push({
      id: createHash('sha256').update(`${files.agentId}:${path}`).digest('hex').slice(0, 16),
      agentId: files.agentId,
      name: posix.join(files.displayDir, fileName),
      path,
      manifestPath: path,
      format: 'agent-config',
      scope: files.scope,
      treeSha256: await computeTreeSha256(path),
      ...(files.metadata === undefined ? {} : { metadata: files.metadata }),
    });
  }

  return skills;
}

/** Limits rule matching for an MCP server entry to that server's own definition. */
export function mcpServerScanMetadata(
  name: string,
  definition: unknown
): NonNullable<Skill['metadata']> {
  return {
    ruleScanFilename: MCP_SERVER_SCAN_FILENAME,
    ruleScanContent: JSON.stringify({ mcpServers: { [name]: definition } }, null, 2),
  };
}

async function isFile(path: string): Promise<boolean> {
  try {
    return (await stat(path)).isFile();
  } catch {
    return false;
  }
}
