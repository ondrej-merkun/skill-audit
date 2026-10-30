import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import ampDiscovery from '../packages/cli/src/discovery/amp.js';
import openclawDiscovery from '../packages/cli/src/discovery/openclaw.js';
import opencodeDiscovery from '../packages/cli/src/discovery/opencode.js';
import type { Skill } from '../packages/cli/src/types.js';

// Each test runs in a git repository at <tmp>/repo with the working directory at
// <tmp>/repo/app, so project discovery must walk from cwd up to the git root and stop there.
let tmp: string;
let home: string;
let repo: string;
let cwd: string;

beforeEach(async () => {
  tmp = await mkdtemp(join(tmpdir(), 'skill-audit-agents-'));
  home = join(tmp, 'home');
  repo = join(tmp, 'repo');
  cwd = join(repo, 'app');
  await mkdir(join(repo, '.git'), { recursive: true });
  await writeFile(join(repo, '.git', 'HEAD'), 'ref: refs/heads/main\n');
  await mkdir(cwd, { recursive: true });

  vi.stubEnv('HOME', home);
  vi.stubEnv('USERPROFILE', home);
  vi.stubEnv('SKILL_AUDIT_CWD', cwd);
  for (const name of [
    'XDG_CONFIG_HOME',
    'OPENCODE_CONFIG',
    'OPENCODE_CONFIG_DIR',
    'OPENCLAW_STATE_DIR',
    'OPENCLAW_CONFIG_PATH',
    'OPENCLAW_WORKSPACE_DIR',
  ]) {
    vi.stubEnv(name, undefined);
  }
});

afterEach(async () => {
  vi.unstubAllEnvs();
  await rm(tmp, { recursive: true, force: true });
});

describe('opencode discovery plugin', () => {
  it('is installed when its config or data directory exists', async () => {
    expect(await opencodeDiscovery.isInstalled()).toBe(false);

    await mkdir(join(home, '.local', 'share', 'opencode'), { recursive: true });
    expect(await opencodeDiscovery.isInstalled()).toBe(true);
  });

  it('discovers config MCP servers, instructions, agents, commands, skills, plugins, and tools', async () => {
    const config = join(home, '.config', 'opencode');
    // JSONC with comments and trailing commas, and the OpenCode 1 `mcp.<name>` shape.
    await put(
      join(config, 'opencode.jsonc'),
      '{\n  // global servers\n  "mcp": {\n    "local-tools": { "type": "local", "command": ["npx", "-y", "tools"], },\n    "__proto__": { "type": "local", "command": ["proto"] },\n  },\n}\n'
    );
    await put(join(config, 'AGENTS.md'), '# Global rules\n');
    await put(join(config, 'agents', 'review.md'), 'Review code.\n');
    await put(join(config, 'mode', 'plan.md'), 'Plan only.\n');
    await put(join(config, 'command', 'deploy.md'), 'Deploy with !`./deploy.sh`.\n');
    await putSkill(join(config, 'skills', 'lint'));
    await put(join(config, 'plugins', 'notify.ts'), 'export const Notify = async () => ({});\n');
    await put(join(config, 'plugins', 'pkg', 'index.js'), 'export default {};\n');
    await put(join(config, 'plugins', 'README.md'), 'Not a plugin.\n');
    await put(join(config, 'tools', 'weather.ts'), 'export default {};\n');
    // A `plugin` list entry is an npm package name or a local module path.
    await put(join(config, 'tui.jsonc'), '{ "plugin": ["./session.js"], }\n');
    await put(join(config, 'session.js'), 'export default {};\n');
    await putSkill(join(home, '.claude', 'skills', 'claude-skill'));

    // OpenCode 2 nests servers under `mcp.servers`. Server names such as `command` and `__proto__`
    // must not change how the map is read.
    await put(
      join(repo, 'opencode.json'),
      JSON.stringify({
        // A file URL with a host names no local file; it must not stop discovery.
        plugin: ['opencode-npm-plugin', './tools/local-plugin.ts', 'file://remote.example/x.js'],
        mcp: {
          servers: {
            remote: { type: 'remote', url: 'https://mcp.example' },
            command: { type: 'local', command: ['tool'] },
            ['__proto__']: { type: 'local', command: ['proto'] },
          },
        },
      })
    );
    await put(join(repo, 'tools', 'local-plugin.ts'), 'export default {};\n');
    await put(join(repo, '.opencode', 'commands', 'test.md'), 'Run tests.\n');
    await putSkill(join(repo, '.opencode', 'skills', 'team', 'release'));
    await put(join(repo, '.opencode', 'skills', 'quick.md'), 'Quick skill.\n');
    await put(join(repo, '.opencode', 'plugins', 'guard.js'), 'export default {};\n');
    await putSkill(join(cwd, '.claude', 'skills', 'app-skill'));
    // Above the git root: OpenCode never reads it.
    await put(join(tmp, '.opencode', 'commands', 'outside.md'), 'Outside.\n');

    expectRows(await opencodeDiscovery.discoverSkills(), [
      ['<cwd>/.claude/skills/app-skill', 'app-skill', 'SKILL.md', 'project'],
      ['<repo>/.opencode/commands/test.md', 'test', 'prompt-md', 'project'],
      ['<repo>/.opencode/plugins/guard.js', 'guard.js', 'agent-config', 'project'],
      ['<repo>/.opencode/skills/quick.md', 'quick', 'SKILL.md', 'project'],
      ['<repo>/.opencode/skills/team/release', 'release', 'SKILL.md', 'project'],
      ['<repo>/opencode.json', 'remote', 'mcp-server', 'project'],
      ['<repo>/opencode.json', 'command', 'mcp-server', 'project'],
      ['<repo>/opencode.json', '__proto__', 'mcp-server', 'project'],
      ['<repo>/tools/local-plugin.ts', 'local-plugin.ts', 'agent-config', 'project'],
      ['~/.claude/skills/claude-skill', 'claude-skill', 'SKILL.md', 'user'],
      ['~/.config/opencode/AGENTS.md', 'AGENTS.md', 'agents-md', 'user'],
      ['~/.config/opencode/agents/review.md', 'review', 'agents-md', 'user'],
      ['~/.config/opencode/command/deploy.md', 'deploy', 'prompt-md', 'user'],
      ['~/.config/opencode/mode/plan.md', 'plan', 'agents-md', 'user'],
      ['~/.config/opencode/opencode.jsonc', 'local-tools', 'mcp-server', 'user'],
      ['~/.config/opencode/opencode.jsonc', '__proto__', 'mcp-server', 'user'],
      ['~/.config/opencode/plugins/notify.ts', 'notify.ts', 'agent-config', 'user'],
      ['~/.config/opencode/plugins/pkg', 'pkg', 'agent-config', 'user'],
      ['~/.config/opencode/session.js', 'session.js', 'agent-config', 'user'],
      ['~/.config/opencode/skills/lint', 'lint', 'SKILL.md', 'user'],
      ['~/.config/opencode/tools/weather.ts', 'weather.ts', 'agent-config', 'user'],
    ]);
  });

  it('reads the OPENCODE_CONFIG file and the OPENCODE_CONFIG_DIR directory', async () => {
    const customConfig = join(tmp, 'custom', 'team.json');
    const customDir = join(tmp, 'custom', 'dir');
    vi.stubEnv('OPENCODE_CONFIG', customConfig);
    vi.stubEnv('OPENCODE_CONFIG_DIR', customDir);
    await put(customConfig, JSON.stringify({ mcp: { team: { type: 'local', command: ['team'] } } }));
    await put(join(customDir, 'plugins', 'audit.ts'), 'export default {};\n');

    expectRows(await opencodeDiscovery.discoverSkills(), [
      ['<tmp>/custom/dir/plugins/audit.ts', 'audit.ts', 'agent-config', 'user'],
      ['<tmp>/custom/team.json', 'team', 'mcp-server', 'user'],
    ]);
  });

  it('reports a config once when an override names a file that it already reads', async () => {
    const config = join(home, '.config', 'opencode');
    vi.stubEnv('OPENCODE_CONFIG', join(config, 'opencode.json'));
    vi.stubEnv('OPENCODE_CONFIG_DIR', config);
    await put(join(config, 'opencode.json'), JSON.stringify({ mcp: { files: { command: ['f'] } } }));
    await put(join(config, 'plugins', 'audit.ts'), 'export default {};\n');

    expectRows(await opencodeDiscovery.discoverSkills(), [
      ['~/.config/opencode/opencode.json', 'files', 'mcp-server', 'user'],
      ['~/.config/opencode/plugins/audit.ts', 'audit.ts', 'agent-config', 'user'],
    ]);
  });
});

describe('amp discovery plugin', () => {
  it('is installed when ~/.config/amp exists', async () => {
    expect(await ampDiscovery.isInstalled()).toBe(false);

    await mkdir(join(home, '.config', 'amp'), { recursive: true });
    expect(await ampDiscovery.isInstalled()).toBe(true);
  });

  it('discovers settings MCP servers, instructions, skills, and plugins', async () => {
    const config = join(home, '.config', 'amp');
    await put(
      join(config, 'settings.json'),
      '{\n  // servers\n  "amp.mcpServers": {\n    "playwright": { "command": "npx", "args": ["-y", "@playwright/mcp"], },\n  },\n  "amp.notifications.enabled": false,\n}\n'
    );
    await put(join(config, 'AGENTS.md'), '# Amp rules\n');
    await put(join(home, '.config', 'AGENTS.md'), '# Shared rules\n');
    await putSkill(join(config, 'skills', 'amp-skill'));
    await putSkill(join(home, '.config', 'agents', 'skills', 'global-skill'));
    await putSkill(join(home, '.claude', 'skills', 'claude-skill'));
    await put(join(config, 'plugins', 'hello.ts'), 'export default {};\n');
    await put(join(config, 'plugins', 'multi', 'index.js'), 'export default {};\n');

    // Amp reads only the nearest workspace settings file.
    await put(
      join(cwd, '.amp', 'settings.jsonc'),
      JSON.stringify({ 'amp.mcpServers': { near: { url: 'https://mcp.example' } } })
    );
    await put(
      join(repo, '.amp', 'settings.json'),
      JSON.stringify({ 'amp.mcpServers': { far: { command: 'far' } } })
    );
    await put(join(repo, '.amp', 'plugins', 'project.js'), 'export default {};\n');
    // The shared plugin covers .agents/skills in cwd; Amp also reads the parent directories.
    await putSkill(join(repo, '.agents', 'skills', 'parent-skill'));
    await putSkill(join(repo, '.claude', 'skills', 'repo-skill'));

    expectRows(await ampDiscovery.discoverSkills(), [
      ['<cwd>/.amp/settings.jsonc', 'near', 'mcp-server', 'project'],
      ['<repo>/.agents/skills/parent-skill', 'parent-skill', 'SKILL.md', 'project'],
      ['<repo>/.amp/plugins/project.js', 'project.js', 'agent-config', 'project'],
      ['<repo>/.claude/skills/repo-skill', 'repo-skill', 'SKILL.md', 'project'],
      ['~/.claude/skills/claude-skill', 'claude-skill', 'SKILL.md', 'user'],
      ['~/.config/AGENTS.md', 'AGENTS.md', 'agents-md', 'user'],
      ['~/.config/agents/skills/global-skill', 'global-skill', 'SKILL.md', 'user'],
      ['~/.config/amp/AGENTS.md', 'AGENTS.md', 'agents-md', 'user'],
      ['~/.config/amp/plugins/hello.ts', 'hello.ts', 'agent-config', 'user'],
      ['~/.config/amp/plugins/multi', 'multi', 'agent-config', 'user'],
      ['~/.config/amp/settings.json', 'playwright', 'mcp-server', 'user'],
      ['~/.config/amp/skills/amp-skill', 'amp-skill', 'SKILL.md', 'user'],
    ]);
  });
});

describe('openclaw discovery plugin', () => {
  it('is installed when ~/.openclaw exists', async () => {
    expect(await openclawDiscovery.isInstalled()).toBe(false);

    await mkdir(join(home, '.openclaw'), { recursive: true });
    expect(await openclawDiscovery.isInstalled()).toBe(true);
  });

  it('discovers config MCP servers, skills, hooks, extensions, and workspace files', async () => {
    const state = join(home, '.openclaw');
    // OpenClaw reads its config as JSON5: unquoted keys, single quotes, comments, trailing commas.
    // A 2026.6 config keeps servers in a root `mcpServers` map; a same name there stays separate.
    await put(
      join(state, 'openclaw.json'),
      "{\n  // tools\n  mcp: { servers: { docs: { url: 'https://mcp.example/mcp', transport: 'streamable-http', }, }, },\n  nodeHost: { mcp: { servers: { local: { command: 'local' } } } },\n  mcpServers: { docs: { command: 'docs' } },\n}\n"
    );
    await putSkill(join(state, 'skills', 'managed'));
    await putSkill(join(state, 'agents', 'main', 'agent', 'workshop-skills', 'learned'));
    await put(join(state, 'hooks', 'greeter', 'HOOK.md'), '---\nname: greeter\n---\n');
    await put(join(state, 'hooks', 'greeter', 'handler.js'), 'export default () => {};\n');
    await put(join(state, 'extensions', 'my-plugin', 'index.js'), 'export default {};\n');
    // OpenClaw skips script files at the top of an extensions root.
    await put(join(state, 'extensions', 'helper.js'), 'export default {};\n');
    await putSkill(join(home, '.agents', 'skills', 'personal'));

    const workspace = join(state, 'workspace');
    const bootstrapFiles = ['AGENTS.md', 'SOUL.md', 'USER.md', 'IDENTITY.md', 'BOOT.md', 'MEMORY.md'];
    for (const file of [...bootstrapFiles, 'TOOLS.md', 'HEARTBEAT.md']) {
      await put(join(workspace, file), `# ${file}\n`);
    }
    // Daily memory logs are not injected into the prompt.
    await put(join(workspace, 'memory', '2026-10-30.md'), 'Log.\n');
    await putSkill(join(workspace, 'skills', 'ws-skill'));
    await putSkill(join(workspace, '.agents', 'skills', 'project-agent'));
    // Workspace hooks and workspace extensions do not load until the user enables them.
    await put(join(workspace, 'hooks', 'opt-in', 'HOOK.md'), '---\nname: opt-in\n---\n');
    await put(join(workspace, '.openclaw', 'extensions', 'ws-plugin', 'index.js'), '');

    const skills = await openclawDiscovery.discoverSkills();

    // Same-named servers in two maps keep distinct ids, so `explain` and `ignore` can tell them apart.
    expect(new Set(skills.map((skill) => skill.id)).size).toBe(skills.length);
    expectRows(skills, [
      ['~/.agents/skills/personal', 'personal', 'SKILL.md', 'user'],
      [
        '~/.openclaw/agents/main/agent/workshop-skills/learned',
        'learned',
        'SKILL.md',
        'user',
      ],
      ['~/.openclaw/extensions/my-plugin', 'my-plugin', 'agent-config', 'user'],
      ['~/.openclaw/hooks/greeter', 'greeter', 'agent-config', 'user'],
      ['~/.openclaw/openclaw.json', 'docs', 'mcp-server', 'user'],
      ['~/.openclaw/openclaw.json', 'docs', 'mcp-server', 'user'],
      ['~/.openclaw/openclaw.json', 'local', 'mcp-server', 'user'],
      ['~/.openclaw/skills/managed', 'managed', 'SKILL.md', 'user'],
      ['~/.openclaw/workspace/.agents/skills/project-agent', 'project-agent', 'SKILL.md', 'user'],
      ['~/.openclaw/workspace/AGENTS.md', 'AGENTS.md', 'agents-md', 'user'],
      ['~/.openclaw/workspace/BOOT.md', 'BOOT.md', 'agents-md', 'user'],
      ['~/.openclaw/workspace/HEARTBEAT.md', 'HEARTBEAT.md', 'agents-md', 'user'],
      ['~/.openclaw/workspace/IDENTITY.md', 'IDENTITY.md', 'agents-md', 'user'],
      ['~/.openclaw/workspace/MEMORY.md', 'MEMORY.md', 'agents-md', 'user'],
      ['~/.openclaw/workspace/SOUL.md', 'SOUL.md', 'agents-md', 'user'],
      ['~/.openclaw/workspace/TOOLS.md', 'TOOLS.md', 'agents-md', 'user'],
      ['~/.openclaw/workspace/USER.md', 'USER.md', 'agents-md', 'user'],
      ['~/.openclaw/workspace/skills/ws-skill', 'ws-skill', 'SKILL.md', 'user'],
    ]);
  });

  it('follows the state, config, and workspace overrides and skips personal skills', async () => {
    // `openclaw --profile <name>` sets these variables.
    const state = join(tmp, 'state');
    vi.stubEnv('OPENCLAW_STATE_DIR', state);
    vi.stubEnv('OPENCLAW_CONFIG_PATH', join(tmp, 'config.json5'));
    vi.stubEnv('OPENCLAW_WORKSPACE_DIR', join(tmp, 'ws'));
    await put(join(tmp, 'config.json5'), "{ mcp: { servers: { files: { command: 'files' } } } }");
    await putSkill(join(state, 'skills', 'managed'));
    await put(join(tmp, 'ws', 'AGENTS.md'), '# Rules\n');
    // A non-default state directory excludes the home-scoped ~/.agents/skills.
    await putSkill(join(home, '.agents', 'skills', 'personal'));

    expectRows(await openclawDiscovery.discoverSkills(), [
      ['<tmp>/config.json5', 'files', 'mcp-server', 'user'],
      ['<tmp>/state/skills/managed', 'managed', 'SKILL.md', 'user'],
      ['<tmp>/ws/AGENTS.md', 'AGENTS.md', 'agents-md', 'user'],
    ]);
  });
});

async function put(path: string, content: string): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, content);
}

async function putSkill(dir: string): Promise<void> {
  await put(join(dir, 'SKILL.md'), '---\nname: skill\ndescription: Test skill.\n---\nBody.\n');
}

// Compares one row per discovered target, in any order: display path, name, format, and scope.
function expectRows(skills: Skill[], expected: string[][]): void {
  const actual = skills.map((skill) => [
    displayPath(skill.path),
    skill.name,
    skill.format,
    skill.scope,
  ]);
  expect(sortRows(actual)).toEqual(sortRows(expected));
}

function sortRows(rows: string[][]): string[][] {
  return [...rows].sort((a, b) => (a.join(' ') < b.join(' ') ? -1 : 1));
}

function displayPath(path: string): string {
  return path
    .replace(cwd, '<cwd>')
    .replace(repo, '<repo>')
    .replace(home, '~')
    .replace(tmp, '<tmp>');
}
