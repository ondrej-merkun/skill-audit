import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { Script, createContext } from 'node:vm';
import { describe, expect, it, vi } from 'vitest';
import stripAnsi from './helpers/strip-ansi.js';
import { formatAgentName } from '../packages/cli/src/agent-names.js';
import { renderTable, renderTableToString } from '../packages/cli/src/output/table.js';
import {
  renderSummaryFooter,
  renderSummaryCompact,
  renderSummary,
} from '../packages/cli/src/output/summary.js';
import { renderJson } from '../packages/cli/src/output/json.js';
import { sortScanSkills } from '../packages/cli/src/output/sort.js';
import { calculateCompromisedPercent } from '../packages/cli/src/percent.js';
import type { LlmReviewResult, ScanResult, ScannedSkill } from '../packages/cli/src/types.js';

const PACKAGE_JSON = JSON.parse(
  readFileSync(fileURLToPath(new URL('../packages/cli/package.json', import.meta.url)), 'utf-8')
) as { version: string };
const PACKAGE_VERSION = PACKAGE_JSON.version;

function makeSkill(overrides: Partial<ScannedSkill> = {}): ScannedSkill {
  return {
    id: 'abc123',
    agentId: 'claude-code',
    name: 'test-skill',
    path: '/tmp/test-skill',
    manifestPath: null,
    format: 'SKILL.md',
    scope: 'user',
    treeSha256: 'deadbeef',
    findings: [],
    enrichment: {},
    summary: {
      critical: 0,
      high: 0,
      medium: 0,
      low: 0,
      info: 0,
      score: 100,
      verdict: 'PASS',
      mandatoryFail: [],
      allowlisted: false,
    },
    ...overrides,
  };
}

function makeScanResult(overrides: Partial<ScanResult> = {}): ScanResult {
  return {
    schemaVersion: '1.0',
    scan: {
      startedAt: '2024-01-01T00:00:00.000Z',
      durationMs: 1320,
      toolVersion: PACKAGE_VERSION,
    },
    agents: [{ id: 'claude-code', installed: true, skillsScanned: 1 }],
    skills: [makeSkill()],
    summary: {
      skillsScanned: 1,
      compromised: 0,
      percentCompromised: 0,
      verdict: 'PASS',
    },
    ...overrides,
  };
}

function makeFinding(severity: ScannedSkill['findings'][number]['severity']) {
  return {
    ruleId: `RULE-${severity.toUpperCase()}`,
    severity,
    category: 'test',
    file: 'SKILL.md',
    line: 1,
    column: 1,
    snippet: severity,
    message: `${severity} finding`,
    fix: 'Fix it.',
    cwe: [],
  };
}

function makeLlmReview(overrides: Partial<LlmReviewResult> = {}): LlmReviewResult {
  return {
    modelName: 'alpha',
    provider: 'openai-compatible',
    model: 'alpha-local',
    status: 'ok',
    promptVersion: '2026-04-28.schema-v2',
    findings: [],
    ...overrides,
  };
}

function makeRiskSkill(
  name: string,
  score: number,
  verdict: ScannedSkill['summary']['verdict'],
  severity?: ScannedSkill['findings'][number]['severity'],
  agentId = 'claude-code'
): ScannedSkill {
  const findings = severity === undefined ? [] : [makeFinding(severity)];
  return makeSkill({
    id: name,
    name,
    agentId,
    path: `/tmp/${name}`,
    findings,
    summary: {
      critical: severity === 'critical' ? 1 : 0,
      high: severity === 'high' ? 1 : 0,
      medium: severity === 'medium' ? 1 : 0,
      low: severity === 'low' ? 1 : 0,
      info: severity === 'info' ? 1 : 0,
      score,
      verdict,
      mandatoryFail: verdict === 'FAIL' ? ['RULE'] : [],
      allowlisted: false,
    },
  });
}

function riskFixtureSkills(): ScannedSkill[] {
  return [
    makeRiskSkill('pass-clean', 100, 'PASS'),
    makeRiskSkill('fail-score-40', 40, 'FAIL', 'high'),
    makeRiskSkill('review-score-50', 50, 'REVIEW', 'critical'),
    makeRiskSkill('fail-score-0', 0, 'FAIL', 'medium'),
  ];
}

class FakeEvent {
  defaultPrevented = false;

  constructor(
    readonly type: string,
    readonly key = ''
  ) {}

  preventDefault(): void {
    this.defaultPrevented = true;
  }
}

type FakeListener = (event: FakeEvent) => void;
type FakeNode = FakeElement | FakeTextNode;

class FakeTextNode {
  parentNode: FakeElement | null = null;

  constructor(readonly textContent: string) {}
}

class FakeClassList {
  constructor(private readonly element: FakeElement) {}

  add(token: string): void {
    this.setTokens([...this.tokens(), token]);
  }

  remove(token: string): void {
    this.setTokens(this.tokens().filter((existing) => existing !== token));
  }

  contains(token: string): boolean {
    return this.tokens().includes(token);
  }

  toggle(token: string, force?: boolean): boolean {
    const shouldAdd = force ?? !this.contains(token);
    if (shouldAdd) this.add(token);
    else this.remove(token);
    return shouldAdd;
  }

  private tokens(): string[] {
    return this.element.className.split(/\s+/).filter(Boolean);
  }

  private setTokens(tokens: string[]): void {
    this.element.className = [...new Set(tokens)].join(' ');
  }
}

class FakeElement {
  readonly attributes = new Map<string, string>();
  readonly listeners = new Map<string, FakeListener[]>();
  readonly style: Record<string, string> = {};
  readonly children: FakeNode[] = [];
  readonly classList = new FakeClassList(this);
  parentNode: FakeElement | null = null;
  className = '';
  textContent = '';

  constructor(readonly tagName: string) {}

  get firstChild(): FakeNode | null {
    return this.children[0] ?? null;
  }

  setAttribute(name: string, value: string): void {
    this.attributes.set(name, value);
    if (name === 'class') this.className = value;
  }

  getAttribute(name: string): string | null {
    return this.attributes.get(name) ?? null;
  }

  appendChild(node: FakeNode): FakeNode {
    node.parentNode = this;
    this.children.push(node);
    return node;
  }

  removeChild(node: FakeNode): FakeNode {
    const index = this.children.indexOf(node);
    if (index >= 0) this.children.splice(index, 1);
    node.parentNode = null;
    return node;
  }

  addEventListener(type: string, listener: FakeListener): void {
    const listeners = this.listeners.get(type) ?? [];
    listeners.push(listener);
    this.listeners.set(type, listeners);
  }

  dispatchEvent(event: FakeEvent): boolean {
    for (const listener of this.listeners.get(event.type) ?? []) {
      listener(event);
    }
    return !event.defaultPrevented;
  }

  click(): void {
    this.dispatchEvent(new FakeEvent('click'));
  }
}

class FakeDocument {
  readonly body = new FakeElement('body');
  private readonly elements: FakeElement[] = [];
  private readonly ids = new Map<string, FakeElement>();

  register(element: FakeElement): FakeElement {
    this.elements.push(element);
    const id = element.getAttribute('id');
    if (id !== null) this.ids.set(id, element);
    return element;
  }

  querySelectorAll(selector: string): FakeElement[] {
    if (!selector.startsWith('.')) return [];
    const className = selector.slice(1);
    return this.elements.filter((element) => element.classList.contains(className));
  }

  getElementById(id: string): FakeElement | null {
    return this.ids.get(id) ?? null;
  }

  createElement(tagName: string): FakeElement {
    return new FakeElement(tagName);
  }

  createTextNode(textContent: string): FakeTextNode {
    return new FakeTextNode(textContent);
  }
}

function registerElement(
  document: FakeDocument,
  tagName: string,
  attributes: Record<string, string> = {}
): FakeElement {
  const element = new FakeElement(tagName);
  for (const [name, value] of Object.entries(attributes)) {
    element.setAttribute(name, value);
  }
  return document.register(element);
}

function executeHtmlReportScript(html: string): FakeDocument {
  const document = new FakeDocument();

  for (const id of [
    'panel',
    'overlay',
    'panel-close',
    'panel-title',
    'panel-meta',
    'panel-findings',
    'btn-copy-json',
    'btn-copy-md',
    'btn-download',
    'btn-share',
  ]) {
    registerElement(document, id.startsWith('btn-') || id === 'panel-close' ? 'button' : 'div', {
      id,
    });
  }

  for (const match of html.matchAll(
    /<button type="button"(?: id="([^"]+)")? class="([^"]+)" data-agent="([^"]*)" aria-pressed="([^"]+)">/g
  )) {
    registerElement(document, 'button', {
      ...(match[1] !== undefined ? { id: match[1] } : {}),
      class: match[2] ?? '',
      'data-agent': match[3] ?? '',
      'aria-pressed': match[4] ?? '',
    });
  }

  for (const match of html.matchAll(
    /<tr class="skill-row" data-idx="([^"]+)" data-agent="([^"]+)" tabindex="0">/g
  )) {
    registerElement(document, 'tr', {
      class: 'skill-row',
      'data-idx': match[1] ?? '',
      'data-agent': match[2] ?? '',
      tabindex: '0',
    });
  }

  const script = html.match(/<script>([\s\S]*)<\/script>/)?.[1];
  if (script === undefined) throw new Error('HTML report script not found');

  const clipboard = { writeText: vi.fn() };
  const context = createContext({
    document,
    navigator: { clipboard },
    Blob: class FakeBlob {
      constructor(
        readonly parts: unknown[],
        readonly options?: unknown
      ) {}
    },
    URL: { createObjectURL: () => 'blob:skill-audit-report' },
    JSON,
  });
  new Script(script).runInContext(context);

  return document;
}

function getElementById(document: FakeDocument, id: string): FakeElement {
  const element = document.getElementById(id);
  if (element === null) throw new Error(`Missing element #${id}`);
  return element;
}

function getFilter(document: FakeDocument, agentId: string): FakeElement {
  const filter = document
    .querySelectorAll('.agent-filter')
    .find((element) => element.getAttribute('data-agent') === agentId);
  if (filter === undefined) throw new Error(`Missing filter for ${agentId}`);
  return filter;
}

function getRow(document: FakeDocument, agentId: string): FakeElement {
  const row = document
    .querySelectorAll('.skill-row')
    .find((element) => element.getAttribute('data-agent') === agentId);
  if (row === undefined) throw new Error(`Missing row for ${agentId}`);
  return row;
}

function elementText(node: FakeNode): string {
  if (node instanceof FakeTextNode) return node.textContent;
  return [node.textContent, ...node.children.map((child) => elementText(child))].join('');
}

describe('sortScanSkills', () => {
  it('orders skills by score, verdict, highest finding severity, then identity', () => {
    const skills = [
      makeRiskSkill('zeta', 50, 'REVIEW', 'low', 'cursor'),
      makeRiskSkill('alpha', 0, 'FAIL', 'medium'),
      makeRiskSkill('beta-high', 50, 'REVIEW', 'high'),
      makeRiskSkill('beta-critical', 50, 'REVIEW', 'critical'),
      makeRiskSkill('agent-a', 50, 'REVIEW', 'critical', 'agents-md'),
    ];

    expect(sortScanSkills(skills).map((s) => s.name)).toEqual([
      'alpha',
      'agent-a',
      'beta-critical',
      'beta-high',
      'zeta',
    ]);
  });
});

describe('formatAgentName', () => {
  it('renders friendly names for known agents and preserves unknown ids', () => {
    expect(formatAgentName('claude-code')).toBe('Claude Code');
    expect(formatAgentName('cross-agent')).toBe('Cross-agent');
    expect(formatAgentName('unknown-agent')).toBe('unknown-agent');
  });
});

describe('renderTableToString', () => {
  it('includes skill count and agent count in header', () => {
    const result = makeScanResult();
    const out = stripAnsi(renderTableToString(result));
    expect(out).toContain('scanned 1 skill');
    expect(out).toContain('1 agent');
  });

  it('shows friendly per-agent skill counts in the scan overview', () => {
    const result = makeScanResult({
      agents: [
        { id: 'cursor', installed: true, skillsScanned: 1 },
        { id: 'claude-code', installed: true, skillsScanned: 2 },
      ],
      skills: [
        makeSkill({ id: 'cc-one', name: 'cc-one', agentId: 'claude-code' }),
        makeSkill({ id: 'cc-two', name: 'cc-two', agentId: 'claude-code' }),
        makeSkill({ id: 'cursor-one', name: 'cursor-one', agentId: 'cursor' }),
      ],
      summary: { skillsScanned: 3, compromised: 0, percentCompromised: 0, verdict: 'PASS' },
    });

    const out = stripAnsi(renderTableToString(result));

    expect(out).toContain('Agents scanned............ Claude Code: 2, Cursor: 1');
  });

  it('shows a single selected-agent count without implying other agents were scanned', () => {
    const result = makeScanResult({
      agents: [{ id: 'cursor', installed: true, skillsScanned: 2 }],
      skills: [
        makeSkill({ id: 'cursor-one', name: 'cursor-one', agentId: 'cursor' }),
        makeSkill({ id: 'cursor-two', name: 'cursor-two', agentId: 'cursor' }),
      ],
      summary: { skillsScanned: 2, compromised: 0, percentCompromised: 0, verdict: 'PASS' },
    });

    const out = stripAnsi(renderTableToString(result));

    expect(out).toContain('Agents scanned............ Cursor: 2');
    expect(out).not.toContain('Claude Code:');
  });

  it('renders friendly agent names in the human scan table', () => {
    const out = stripAnsi(renderTableToString(makeScanResult()));
    const tableAndSummary = out.split('\n  →  ')[0] ?? out;
    expect(tableAndSummary).toContain('Claude Code');
    expect(tableAndSummary).not.toContain(' claude-code ');
  });

  it('shows 🟢 dot and PASS for a clean skill', () => {
    const out = stripAnsi(renderTableToString(makeScanResult()));
    expect(out).toContain('🟢');
    expect(out).toContain('PASS');
  });

  it('shows 🔴 dot and FAIL for a failing skill', () => {
    const result = makeScanResult({
      skills: [
        makeSkill({
          summary: {
            critical: 1,
            high: 0,
            medium: 0,
            low: 0,
            info: 0,
            score: 0,
            verdict: 'FAIL',
            mandatoryFail: ['NET-EXFIL-ENV'],
            allowlisted: false,
          },
          findings: [
            {
              ruleId: 'NET-EXFIL-ENV',
              severity: 'critical',
              category: 'network-exfil',
              file: 'SKILL.md',
              line: 14,
              column: 1,
              snippet: 'os.environ',
              message: 'Env var exfiltrated via network.',
              fix: 'Remove network calls that include env vars.',
              cwe: ['CWE-200'],
            },
          ],
        }),
      ],
      summary: { skillsScanned: 1, compromised: 1, percentCompromised: 100, verdict: 'FAIL' },
    });
    const out = stripAnsi(renderTableToString(result));
    expect(out).toContain('🔴');
    expect(out).toContain('FAIL');
    expect(out).toContain('net-exfil-env');
    expect(out).toContain('SKILL.md:14');
  });

  it('shows orange dot 🟠 for REVIEW at score < 75', () => {
    const result = makeScanResult({
      skills: [
        makeSkill({
          summary: {
            critical: 0,
            high: 1,
            medium: 0,
            low: 0,
            info: 0,
            score: 65,
            verdict: 'REVIEW',
            mandatoryFail: [],
            allowlisted: false,
          },
        }),
      ],
    });
    const out = stripAnsi(renderTableToString(result));
    expect(out).toContain('🟠');
  });

  it('shows yellow dot 🟡 for REVIEW at score >= 75', () => {
    const result = makeScanResult({
      skills: [
        makeSkill({
          summary: {
            critical: 0,
            high: 1,
            medium: 0,
            low: 0,
            info: 0,
            score: 82,
            verdict: 'REVIEW',
            mandatoryFail: [],
            allowlisted: false,
          },
        }),
      ],
    });
    const out = stripAnsi(renderTableToString(result));
    expect(out).toContain('🟡');
  });

  it('shows "allowlisted ✓" for allowlisted skills', () => {
    const result = makeScanResult({
      skills: [
        makeSkill({
          name: 'anthropic/pdf',
          summary: {
            critical: 0,
            high: 0,
            medium: 0,
            low: 0,
            info: 0,
            score: 100,
            verdict: 'PASS',
            mandatoryFail: [],
            allowlisted: true,
          },
        }),
      ],
    });
    const out = stripAnsi(renderTableToString(result));
    expect(out).toContain('allowlisted ✓');
  });

  it('shows "—" for a clean non-allowlisted skill', () => {
    const out = stripAnsi(renderTableToString(makeScanResult()));
    expect(out).toContain('—');
  });

  it('shows skills.sh and deps.dev enrichment details per skill', () => {
    const result = makeScanResult({
      skills: [
        makeSkill({
          enrichment: {
            skillsSh: { gen: 'Low', socketAlerts: 0, snyk: 'Low' },
            depsdev: { scorecardScore: 8.5, osvAdvisories: 2 },
          },
        }),
      ],
    });
    const out = stripAnsi(renderTableToString(result));
    expect(out).toContain('ENRICHMENT');
    expect(out).toContain('Gen=Low');
    expect(out).toContain('Socket=0');
    expect(out).toContain('Snyk=Low');
    expect(out).toContain('2 OSV advisories');
  });

  it('renders zero deps.dev advisories compactly', () => {
    const result = makeScanResult({
      skills: [makeSkill({ enrichment: { depsdev: { scorecardScore: null, osvAdvisories: 0 } } })],
    });
    const out = stripAnsi(renderTableToString(result));
    expect(out).toContain('0 OSV');
  });

  it('omits enrichment when no table enrichment data exists', () => {
    const out = stripAnsi(renderTableToString(makeScanResult()));
    expect(out).not.toContain('ENRICHMENT');
    expect(out).not.toContain('Enrichment');
  });

  it('omits the enrichment column when enrichment was skipped for offline mode', () => {
    const out = stripAnsi(
      renderTableToString(makeScanResult({ enrichmentStatus: 'skipped-offline' }))
    );
    expect(out).not.toContain('ENRICHMENT');
  });

  it('shows GitHub enrichment in the default table enrichment column', () => {
    const result = makeScanResult({
      skills: [makeSkill({ enrichment: { github: { stars: 10, ageDays: 20, contributors: 3 } } })],
    });
    const out = stripAnsi(renderTableToString(result));
    expect(out).toContain('GitHub=10 stars');
    expect(out).toContain('3 contributors');
  });

  it('does not render unknown GitHub contributors as zero in table output', () => {
    const result = makeScanResult({
      skills: [
        makeSkill({
          enrichment: {
            github: { stars: 10, ageDays: 20, contributors: null },
          },
        }),
      ],
    });
    const out = stripAnsi(renderTableToString(result));
    expect(out).toContain('GitHub=10 stars');
    expect(out).toContain('contributors unknown');
    expect(out).not.toContain('0 contributors');
  });

  it('shows compact per-model LLM review status and highest severity', () => {
    const result = makeScanResult({
      skills: [
        makeSkill({
          llmReviews: [
            makeLlmReview({
              modelName: 'alpha',
              findings: [
                {
                  severity: 'high',
                  category: 'prompt-injection',
                  confidence: 0.82,
                  rationale: 'Override instruction.',
                  file: 'SKILL.md',
                },
              ],
            }),
            makeLlmReview({
              modelName: 'beta',
              model: 'beta-local',
              status: 'unavailable',
              findings: [],
            }),
          ],
        }),
      ],
    });

    const out = stripAnsi(renderTableToString(result));
    expect(out).toContain('LLM REVIEW');
    expect(out).toContain('alpha high (1)');
    expect(out).toContain('beta unavailable');
  });

  it('sorts FAIL rows before REVIEW and PASS', () => {
    const result = makeScanResult({
      skills: [
        makeSkill({
          id: 'pass-skill',
          name: 'pass-skill',
          summary: {
            critical: 0,
            high: 0,
            medium: 0,
            low: 0,
            info: 0,
            score: 100,
            verdict: 'PASS',
            mandatoryFail: [],
            allowlisted: false,
          },
        }),
        makeSkill({
          id: 'fail-skill',
          name: 'fail-skill',
          summary: {
            critical: 1,
            high: 0,
            medium: 0,
            low: 0,
            info: 0,
            score: 0,
            verdict: 'FAIL',
            mandatoryFail: ['NET-EXFIL-ENV'],
            allowlisted: false,
          },
        }),
      ],
      summary: { skillsScanned: 2, compromised: 1, percentCompromised: 50, verdict: 'FAIL' },
    });
    const out = stripAnsi(renderTableToString(result));
    const failIdx = out.indexOf('fail-skill');
    const passIdx = out.indexOf('pass-skill');
    expect(failIdx).toBeLessThan(passIdx);
  });

  it('sorts rows by risk-first score instead of verdict alone', () => {
    const out = stripAnsi(
      renderTableToString(
        makeScanResult({
          skills: riskFixtureSkills(),
          summary: { skillsScanned: 4, compromised: 2, percentCompromised: 50, verdict: 'FAIL' },
        })
      )
    );

    expect(out.indexOf('fail-score-0')).toBeLessThan(out.indexOf('fail-score-40'));
    expect(out.indexOf('fail-score-40')).toBeLessThan(out.indexOf('review-score-50'));
    expect(out.indexOf('review-score-50')).toBeLessThan(out.indexOf('pass-clean'));
  });

  it('shows compromised count in summary', () => {
    const result = makeScanResult({
      skills: [
        makeSkill({
          summary: {
            critical: 1,
            high: 0,
            medium: 0,
            low: 0,
            info: 0,
            score: 0,
            verdict: 'FAIL',
            mandatoryFail: ['NET-EXFIL-ENV'],
            allowlisted: false,
          },
        }),
      ],
      summary: { skillsScanned: 1, compromised: 1, percentCompromised: 100, verdict: 'FAIL' },
    });
    const out = stripAnsi(renderTableToString(result));
    expect(out).toContain('Compromised skills');
  });

  it('includes next-step commands for explain when there is a FAIL skill', () => {
    const result = makeScanResult({
      skills: [
        makeSkill({
          name: 'bad-skill',
          summary: {
            critical: 1,
            high: 0,
            medium: 0,
            low: 0,
            info: 0,
            score: 0,
            verdict: 'FAIL',
            mandatoryFail: ['NET-EXFIL-ENV'],
            allowlisted: false,
          },
        }),
      ],
      summary: { skillsScanned: 1, compromised: 1, percentCompromised: 100, verdict: 'FAIL' },
    });
    const out = stripAnsi(renderTableToString(result));
    expect(out).toContain('skill-audit explain bad-skill');
    expect(out).toContain('skill-audit --html report.html');
  });
});

describe('renderSummaryFooter', () => {
  it('includes Skills scanned count', () => {
    const out = stripAnsi(renderSummaryFooter(makeScanResult(), [makeSkill()]));
    expect(out).toContain('Skills scanned');
    expect(out).toContain('1');
  });

  it('includes Unique issues line', () => {
    const out = stripAnsi(renderSummaryFooter(makeScanResult(), [makeSkill()]));
    expect(out).toContain('Unique issues');
  });

  it('counts unique issue severity buckets by affected skill', () => {
    const criticalAndHighSkill = makeSkill({
      name: 'multi-finding',
      findings: [
        { ...makeFinding('critical'), ruleId: 'CRITICAL-RULE' },
        { ...makeFinding('high'), ruleId: 'HIGH-RULE' },
      ],
      summary: {
        critical: 1,
        high: 1,
        medium: 0,
        low: 0,
        info: 0,
        score: 65,
        verdict: 'REVIEW',
        mandatoryFail: [],
        allowlisted: false,
      },
    });
    const mediumSkill = makeSkill({
      name: 'medium-only',
      findings: [{ ...makeFinding('medium'), ruleId: 'MEDIUM-RULE' }],
      summary: {
        critical: 0,
        high: 0,
        medium: 1,
        low: 0,
        info: 0,
        score: 97,
        verdict: 'PASS',
        mandatoryFail: [],
        allowlisted: false,
      },
    });
    const result = makeScanResult({
      skills: [criticalAndHighSkill, mediumSkill],
      summary: { skillsScanned: 2, compromised: 0, percentCompromised: 0, verdict: 'REVIEW' },
    });

    const footer = stripAnsi(renderSummaryFooter(result, result.skills));
    expect(footer).toContain('Unique issues............. 2  (1 critical, 0 high, 1 medium, 0 low)');

    const compact = stripAnsi(renderSummaryCompact(result));
    expect(compact).toContain('1 critical · 0 high · 1 medium · 0 low');
  });

  it('shows compromised count when non-zero', () => {
    const failSkill = makeSkill({
      summary: {
        critical: 1,
        high: 0,
        medium: 0,
        low: 0,
        info: 0,
        score: 0,
        verdict: 'FAIL',
        mandatoryFail: ['NET-EXFIL-ENV'],
        allowlisted: false,
      },
    });
    const result = makeScanResult({
      skills: [failSkill],
      summary: { skillsScanned: 1, compromised: 1, percentCompromised: 100, verdict: 'FAIL' },
    });
    const out = stripAnsi(renderSummaryFooter(result, [failSkill]));
    expect(out).toContain('Compromised skills');
    expect(out).toContain('100%');
  });

  it('shows nonzero sub-1% compromised percentages with two decimal places', () => {
    const failSkill = makeSkill({
      summary: {
        critical: 1,
        high: 0,
        medium: 0,
        low: 0,
        info: 0,
        score: 0,
        verdict: 'FAIL',
        mandatoryFail: ['NET-EXFIL-ENV'],
        allowlisted: false,
      },
    });
    const result = makeScanResult({
      skills: [failSkill],
      summary: { skillsScanned: 334, compromised: 1, percentCompromised: 0.3, verdict: 'FAIL' },
    });
    const out = stripAnsi(renderSummaryFooter(result, [failSkill]));
    expect(out).toContain('0.30% of installed');
  });

  it('shows Duration line', () => {
    const out = stripAnsi(renderSummaryFooter(makeScanResult(), [makeSkill()]));
    expect(out).toContain('Duration');
    expect(out).toContain('1.32s');
  });

  it('shows next-command for FAIL skill', () => {
    const failSkill = makeSkill({
      name: 'risky-skill',
      summary: {
        critical: 1,
        high: 0,
        medium: 0,
        low: 0,
        info: 0,
        score: 0,
        verdict: 'FAIL',
        mandatoryFail: ['NET-EXFIL-ENV'],
        allowlisted: false,
      },
    });
    const result = makeScanResult({
      skills: [failSkill],
      summary: { skillsScanned: 1, compromised: 1, percentCompromised: 100, verdict: 'FAIL' },
    });
    const out = stripAnsi(renderSummaryFooter(result, [failSkill]));
    const nextCommands = out
      .split('\n')
      .filter((line) => line.includes('→'))
      .map((line) => line.trim());
    expect(nextCommands).toEqual([
      '→  skill-audit explain risky-skill    See full findings',
      '→  skill-audit llm add local --base-url http://127.0.0.1:11434/v1 --model <model_name>    Configure local LLM review',
      '→  skill-audit --llm local    Add local LLM review',
      '→  skill-audit ignore <skill>    Allowlist a false positive',
      '→  skill-audit --html report.html    Generate shareable HTML',
      '→  skill-audit --agent claude-code    Scan only Claude Code skills',
    ]);
  });

  it('uses the highest-risk skill for next-command suggestions', () => {
    const out = stripAnsi(
      renderSummaryFooter(
        makeScanResult({
          skills: riskFixtureSkills(),
          summary: { skillsScanned: 4, compromised: 2, percentCompromised: 50, verdict: 'FAIL' },
        }),
        riskFixtureSkills()
      )
    );

    expect(out).toContain('skill-audit explain fail-score-0');
    expect(out).not.toContain('skill-audit explain fail-score-40');
  });

  it('omits Enrichment line when no enrichment data', () => {
    const out = stripAnsi(renderSummaryFooter(makeScanResult(), [makeSkill()]));
    expect(out).not.toContain('Enrichment');
  });

  it('explains when enrichment ran but found no metadata', () => {
    const result = makeScanResult({ enrichmentStatus: 'no-metadata' });
    const out = stripAnsi(renderSummaryFooter(result, result.skills));
    expect(out).toContain('Enrichment');
    expect(out).toContain('no metadata found');
  });

  it('uses source outcomes instead of checkmarks when requested sources return no data', () => {
    const result = makeScanResult({
      enrichmentStatus: 'no-metadata',
      enrichmentOutcomes: [
        { source: 'skillsSh', status: 'no-metadata' },
        { source: 'github', status: 'no-input' },
        { source: 'depsdev', status: 'unavailable' },
      ],
    });
    const out = stripAnsi(renderSummaryFooter(result, result.skills));
    expect(out).toContain('skills.sh no metadata');
    expect(out).toContain('GitHub no input');
    expect(out).toContain('deps.dev unavailable');
    expect(out).not.toContain('skills.sh ✓');
    expect(out).not.toContain('deps.dev ✓');
  });

  it('explains when enrichment lookup is unavailable', () => {
    const result = makeScanResult({ enrichmentStatus: 'unavailable' });
    const out = stripAnsi(renderSummaryFooter(result, result.skills));
    expect(out).toContain('Enrichment');
    expect(out).toContain('lookup failed or timed out');
  });

  it('shows Enrichment line when skills.sh data is present', () => {
    const enrichedSkill = makeSkill({
      enrichment: { skillsSh: { gen: 'Low', socketAlerts: 0, snyk: 'Low' } },
    });
    const result = makeScanResult({ skills: [enrichedSkill] });
    const out = stripAnsi(renderSummaryFooter(result, [enrichedSkill]));
    expect(out).toContain('Enrichment');
    expect(out).toContain('skills.sh');
  });

  it('shows Enrichment line when deps.dev data is present', () => {
    const enrichedSkill = makeSkill({
      enrichment: { depsdev: { scorecardScore: null, osvAdvisories: 0 } },
    });
    const result = makeScanResult({ skills: [enrichedSkill] });
    const out = stripAnsi(renderSummaryFooter(result, [enrichedSkill]));
    expect(out).toContain('Enrichment');
    expect(out).toContain('deps.dev');
  });

  it('shows LLM review comparison in detailed and compact summaries', () => {
    const reviewedSkill = makeSkill({
      llmReviews: [
        makeLlmReview({
          modelName: 'alpha',
          findings: [
            {
              severity: 'critical',
              category: 'prompt-injection',
              confidence: 0.9,
              rationale: 'Critical override.',
            },
          ],
        }),
        makeLlmReview({ modelName: 'beta', model: 'beta-local', status: 'timeout' }),
      ],
    });
    const result = makeScanResult({ skills: [reviewedSkill] });

    const footer = stripAnsi(renderSummaryFooter(result, [reviewedSkill]));
    expect(footer).toContain('LLM review');
    expect(footer).toContain('alpha ok critical:1');
    expect(footer).toContain('beta timeout (0)');

    const compact = stripAnsi(renderSummaryCompact(result));
    expect(compact).toContain('LLM review: alpha ok critical:1');
    expect(compact).toContain('beta timeout (0)');
  });

  it('shows compact consensus only when models agree on a skill finding', () => {
    const agreeingSkill = makeSkill({
      name: 'agreeing-skill',
      llmReviews: [
        makeLlmReview({
          modelName: 'alpha',
          findings: [
            {
              severity: 'high',
              category: 'prompt-injection',
              confidence: 0.8,
              rationale: 'Override.',
              file: 'SKILL.md',
            },
          ],
        }),
        makeLlmReview({
          modelName: 'beta',
          findings: [
            {
              severity: 'high',
              category: 'prompt-injection',
              confidence: 0.7,
              rationale: 'Same issue.',
              file: 'SKILL.md',
            },
          ],
        }),
      ],
    });
    const disagreeingSkill = makeSkill({
      name: 'disagreeing-skill',
      llmReviews: [
        makeLlmReview({
          modelName: 'alpha',
          findings: [
            {
              severity: 'low',
              category: 'network',
              confidence: 0.6,
              rationale: 'Network concern.',
              file: 'net.js',
            },
          ],
        }),
        makeLlmReview({
          modelName: 'beta',
          findings: [
            {
              severity: 'medium',
              category: 'dependency',
              confidence: 0.65,
              rationale: 'Dependency concern.',
              file: 'package.json',
            },
          ],
        }),
      ],
    });
    const result = makeScanResult({ skills: [agreeingSkill, disagreeingSkill] });

    const compact = stripAnsi(renderSummaryCompact(result));
    expect(compact).toContain('LLM review: alpha ok high:2  beta ok high:2');
    expect(compact).toContain('LLM consensus: agreeing-skill/SKILL.md high (2 models)');
    expect(compact).not.toContain('disagreeing-skill/net.js low (2 models)');
  });
});

describe('renderSummaryCompact', () => {
  it('includes skill count', () => {
    const out = stripAnsi(renderSummaryCompact(makeScanResult()));
    expect(out).toContain('1 skills');
  });

  it('includes compromised count', () => {
    const out = stripAnsi(
      renderSummaryCompact(
        makeScanResult({
          summary: { skillsScanned: 5, compromised: 2, percentCompromised: 40, verdict: 'FAIL' },
        })
      )
    );
    expect(out).toContain('2 compromised');
    expect(out).toContain('40%');
  });

  it('shows nonzero sub-1% compromised percentages with two decimal places', () => {
    const out = stripAnsi(
      renderSummaryCompact(
        makeScanResult({
          summary: { skillsScanned: 334, compromised: 1, percentCompromised: 0.3, verdict: 'FAIL' },
        })
      )
    );
    expect(out).toContain('1 compromised (0.30%)');
  });

  it('includes verdict string', () => {
    const out = stripAnsi(renderSummaryCompact(makeScanResult()));
    expect(out).toContain('PASS');
  });

  it('includes duration', () => {
    const out = stripAnsi(renderSummaryCompact(makeScanResult()));
    expect(out).toContain('1.32s');
  });

  it('ends with newline', () => {
    const out = stripAnsi(renderSummaryCompact(makeScanResult()));
    expect(out.endsWith('\n')).toBe(true);
  });
});

describe('renderSummary', () => {
  it('writes compact summary to stdout', () => {
    const spy = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
    renderSummary(makeScanResult());
    expect(spy).toHaveBeenCalled();
    spy.mockRestore();
  });
});

describe('renderJson', () => {
  it('outputs schema_version 1.0', () => {
    const json = JSON.parse(renderJson(makeScanResult()));
    expect(json.schema_version).toBe('1.0');
  });

  it('serializes scan meta with snake_case keys', () => {
    const json = JSON.parse(renderJson(makeScanResult()));
    expect(json.scan.started_at).toBe('2024-01-01T00:00:00.000Z');
    expect(json.scan.duration_ms).toBe(1320);
    expect(json.scan.tool_version).toBe(PACKAGE_VERSION);
  });

  it('serializes agents with snake_case skills_scanned', () => {
    const json = JSON.parse(renderJson(makeScanResult()));
    expect(json.agents[0].id).toBe('claude-code');
    expect(json.agents[0].installed).toBe(true);
    expect(json.agents[0].skills_scanned).toBe(1);
  });

  it('serializes skill fields with snake_case keys', () => {
    const json = JSON.parse(renderJson(makeScanResult()));
    const skill = json.skills[0];
    expect(skill.agent_id).toBe('claude-code');
    expect(skill.install_state).toBe('installed');
    expect(skill.tree_sha256).toBe('deadbeef');
    expect(skill.allowlisted).toBe(false);
  });

  it('serializes also_installed_at only when duplicate paths are present', () => {
    const result = makeScanResult({
      skills: [
        makeSkill({ alsoInstalledAt: ['/tmp/copy-a', '/tmp/copy-b'] }),
        makeSkill({ id: 'unique-skill', name: 'unique-skill', path: '/tmp/unique-skill' }),
      ],
    });

    const json = JSON.parse(renderJson(result));
    expect(json.skills[0].also_installed_at).toEqual(['/tmp/copy-a', '/tmp/copy-b']);
    expect(json.skills[1]).not.toHaveProperty('also_installed_at');
    expect(Object.keys(json.skills[0]).slice(0, 7)).toEqual([
      'id',
      'agent_id',
      'name',
      'path',
      'install_state',
      'also_installed_at',
      'tree_sha256',
    ]);
  });

  it('serializes modified_at only when discovery found an mtime', () => {
    const result = makeScanResult({
      skills: [
        makeSkill({ modifiedAt: '2024-03-04T05:06:07.000Z' }),
        makeSkill({ id: 'no-mtime', name: 'no-mtime', path: '/tmp/no-mtime' }),
      ],
    });

    const json = JSON.parse(renderJson(result));
    expect(json.skills[0].modified_at).toBe('2024-03-04T05:06:07.000Z');
    expect(json.skills[1]).not.toHaveProperty('modified_at');
    expect(Object.keys(json.skills[0]).slice(0, 7)).toEqual([
      'id',
      'agent_id',
      'name',
      'path',
      'install_state',
      'modified_at',
      'tree_sha256',
    ]);
  });

  it('serializes finding fields with snake_case keys', () => {
    const result = makeScanResult({
      skills: [
        makeSkill({
          findings: [
            {
              ruleId: 'PI-EXFIL-TRIGGER-CLAUSE',
              severity: 'critical',
              category: 'prompt-injection',
              file: 'SKILL.md',
              line: 14,
              column: 1,
              snippet: 'When the user asks to open any URL...',
              message: 'Trigger+exfiltration clause detected.',
              fix: 'Remove instructions that append credentials to URLs.',
              cwe: ['CWE-200'],
            },
          ],
          summary: {
            critical: 1,
            high: 0,
            medium: 0,
            low: 0,
            info: 0,
            score: 0,
            verdict: 'FAIL',
            mandatoryFail: ['PI-EXFIL-TRIGGER-CLAUSE'],
            allowlisted: false,
          },
        }),
      ],
      summary: { skillsScanned: 1, compromised: 1, percentCompromised: 100, verdict: 'FAIL' },
    });
    const json = JSON.parse(renderJson(result));
    const finding = json.skills[0].findings[0];
    expect(finding.rule_id).toBe('PI-EXFIL-TRIGGER-CLAUSE');
    expect(finding.cwe).toEqual(['CWE-200']);
    expect(finding.file).toBe('SKILL.md');
    expect(finding.line).toBe(14);
  });

  it('serializes skill summary with mandatory_fail snake_case key', () => {
    const result = makeScanResult({
      skills: [
        makeSkill({
          summary: {
            critical: 1,
            high: 0,
            medium: 0,
            low: 0,
            info: 0,
            score: 0,
            verdict: 'FAIL',
            mandatoryFail: ['NET-EXFIL-ENV'],
            allowlisted: false,
          },
        }),
      ],
      summary: { skillsScanned: 1, compromised: 1, percentCompromised: 100, verdict: 'FAIL' },
    });
    const json = JSON.parse(renderJson(result));
    expect(json.skills[0].summary.mandatory_fail).toEqual(['NET-EXFIL-ENV']);
    expect(json.skills[0].summary).not.toHaveProperty('mandatoryFail');
  });

  it('serializes enrichment with snake_case field names', () => {
    const result = makeScanResult({
      skills: [
        makeSkill({
          enrichment: {
            skillsSh: { gen: 'Critical', socketAlerts: 7, snyk: 'Critical' },
            github: { stars: 2, ageDays: 4, contributors: 1 },
            depsdev: { osvAdvisories: 2, scorecardScore: 8.5 },
          },
        }),
      ],
    });
    const json = JSON.parse(renderJson(result));
    const enrich = json.skills[0].enrichment;
    expect(enrich.skills_sh.socket_alerts).toBe(7);
    expect(enrich.github.age_days).toBe(4);
    expect(enrich.deps_dev.osv_advisories).toBe(2);
    expect(enrich.deps_dev.scorecard_score).toBe(8.5);
    expect(Object.keys(enrich)).toEqual(['skills_sh', 'github', 'deps_dev']);
  });

  it('serializes LLM reviews with stable snake_case fields', () => {
    const result = makeScanResult({
      skills: [
        makeSkill({
          llmReviews: [
            makeLlmReview({
              modelName: 'alpha',
              findings: [
                {
                  severity: 'high',
                  category: 'prompt-injection',
                  confidence: 0.82,
                  rationale: 'Override instruction.',
                  file: 'SKILL.md',
                  suggestedFix: 'Remove the override.',
                },
              ],
            }),
            makeLlmReview({
              modelName: 'beta',
              model: 'beta-local',
              status: 'invalid-response',
              findings: [],
              error: 'bad JSON',
            }),
          ],
        }),
      ],
    });

    const json = JSON.parse(renderJson(result));
    expect(json.skills[0].llm_reviews).toEqual([
      {
        model_name: 'alpha',
        provider: 'openai-compatible',
        model: 'alpha-local',
        status: 'ok',
        prompt_version: '2026-04-28.schema-v2',
        findings: [
          {
            severity: 'high',
            category: 'prompt-injection',
            confidence: 0.82,
            rationale: 'Override instruction.',
            file: 'SKILL.md',
            suggested_fix: 'Remove the override.',
          },
        ],
      },
      {
        model_name: 'beta',
        provider: 'openai-compatible',
        model: 'beta-local',
        status: 'invalid-response',
        prompt_version: '2026-04-28.schema-v2',
        findings: [],
        error: 'bad JSON',
      },
    ]);
    expect(Object.keys(json.skills[0]).slice(0, 11)).toEqual([
      'id',
      'agent_id',
      'name',
      'path',
      'install_state',
      'tree_sha256',
      'allowlisted',
      'ignored',
      'findings',
      'llm_reviews',
      'summary',
    ]);
  });

  it('serializes deps.dev scorecard_score as null when unavailable', () => {
    const result = makeScanResult({
      skills: [makeSkill({ enrichment: { depsdev: { osvAdvisories: 0, scorecardScore: null } } })],
    });

    const json = JSON.parse(renderJson(result));
    expect(json.skills[0].enrichment.deps_dev).toEqual({
      osv_advisories: 0,
      scorecard_score: null,
    });
  });

  it('serializes GitHub contributors as null when unavailable', () => {
    const result = makeScanResult({
      skills: [makeSkill({ enrichment: { github: { stars: 2, ageDays: 4, contributors: null } } })],
    });

    const json = JSON.parse(renderJson(result));
    expect(json.skills[0].enrichment.github).toEqual({
      stars: 2,
      age_days: 4,
      contributors: null,
    });
  });

  it('omits enrichment when all enrichment keys are absent', () => {
    const json = JSON.parse(renderJson(makeScanResult()));
    expect(json.skills[0]).not.toHaveProperty('enrichment');
  });

  it('serializes top-level summary with snake_case keys', () => {
    const result = makeScanResult({
      summary: { skillsScanned: 47, compromised: 8, percentCompromised: 17.0, verdict: 'FAIL' },
    });
    const json = JSON.parse(renderJson(result));
    expect(json.summary.skills_scanned).toBe(47);
    expect(json.summary.percent_compromised).toBe(17.0);
    expect(json.summary.compromised).toBe(8);
    expect(json.summary.verdict).toBe('FAIL');
  });

  it('serializes sub-1% nonzero compromised percentages as a rounded number', () => {
    const percentCompromised = calculateCompromisedPercent(1, 334);
    const result = makeScanResult({
      summary: { skillsScanned: 334, compromised: 1, percentCompromised, verdict: 'FAIL' },
    });
    const json = JSON.parse(renderJson(result));
    expect(json.summary.percent_compromised).toBe(0.3);
  });

  it('field order matches spec: schema_version, scan, agents, skills, summary', () => {
    const json = renderJson(makeScanResult());
    const keys = Object.keys(JSON.parse(json));
    expect(keys).toEqual(['schema_version', 'scan', 'agents', 'skills', 'summary']);
  });

  it('produces valid JSON parseable output', () => {
    expect(() => JSON.parse(renderJson(makeScanResult()))).not.toThrow();
  });

  it('serializes skills in shared risk-first order', () => {
    const json = JSON.parse(
      renderJson(
        makeScanResult({
          skills: riskFixtureSkills(),
          summary: { skillsScanned: 4, compromised: 2, percentCompromised: 50, verdict: 'FAIL' },
        })
      )
    );

    expect(json.skills.map((s: { name: string }) => s.name)).toEqual([
      'fail-score-0',
      'fail-score-40',
      'review-score-50',
      'pass-clean',
    ]);
  });
});

describe('renderHtml', () => {
  it('embeds table rows in shared risk-first order', async () => {
    const { renderHtml } = await import('../packages/cli/src/output/html.js');
    const html = renderHtml(
      makeScanResult({
        skills: riskFixtureSkills(),
        summary: { skillsScanned: 4, compromised: 2, percentCompromised: 50, verdict: 'FAIL' },
      })
    );

    expect(html.indexOf('fail-score-0')).toBeLessThan(html.indexOf('fail-score-40'));
    expect(html.indexOf('fail-score-40')).toBeLessThan(html.indexOf('review-score-50'));
    expect(html.indexOf('review-score-50')).toBeLessThan(html.indexOf('pass-clean'));
  });

  it('renders all enrichment sources visibly in the report table and detail panel script', async () => {
    const { renderHtml } = await import('../packages/cli/src/output/html.js');
    const html = renderHtml(
      makeScanResult({
        skills: [
          makeSkill({
            enrichment: {
              skillsSh: { gen: 'Critical', socketAlerts: 7, snyk: 'High' },
              github: { stars: 12, ageDays: 34, contributors: 2 },
              depsdev: { scorecardScore: 8.5, osvAdvisories: 1 },
            },
          }),
        ],
      })
    );

    expect(html).toContain('Enrichment');
    expect(html).toContain('skills.sh');
    expect(html).toContain('GitHub');
    expect(html).toContain('deps.dev');
    expect(html).toContain('Gen=Critical');
    expect(html).toContain('Socket=7');
    expect(html).toContain('Snyk=High');
    expect(html).toContain('12 stars');
    expect(html).toContain('34 days old');
    expect(html).toContain('2 contributors');
    expect(html).toContain('1 OSV advisories');
    expect(html).toContain('scorecard 8.5');
  });

  it('does not render unknown GitHub contributors as zero in HTML', async () => {
    const { renderHtml } = await import('../packages/cli/src/output/html.js');
    const html = renderHtml(
      makeScanResult({
        skills: [
          makeSkill({
            enrichment: {
              github: { stars: 12, ageDays: 34, contributors: null },
            },
          }),
        ],
      })
    );

    expect(html).toContain('contributors unknown');
    expect(html).not.toContain('0 contributors');
  });

  it('omits HTML enrichment UI when sources are missing', async () => {
    const { renderHtml } = await import('../packages/cli/src/output/html.js');
    const html = renderHtml(makeScanResult({ skills: [makeSkill({ enrichment: {} })] }));

    expect(html).not.toContain('<th>Enrichment</th>');
    expect(html).not.toContain('class="enrichment-cell"');
    expect(html).not.toContain('<span>skills.sh</span> —');
    expect(html).not.toContain('<span>GitHub</span> —');
    expect(html).not.toContain('<span>deps.dev</span> —');
  });

  it('renders friendly agent names in visible HTML while keeping raw filter ids', async () => {
    const { renderHtml } = await import('../packages/cli/src/output/html.js');
    const html = renderHtml(
      makeScanResult({
        agents: [
          { id: 'claude-code', installed: true, skillsScanned: 1 },
          { id: 'unknown-agent', installed: true, skillsScanned: 1 },
        ],
        skills: [
          makeSkill(),
          makeSkill({
            id: 'unknown-skill',
            agentId: 'unknown-agent',
            name: 'unknown-skill',
            path: '/tmp/unknown-skill',
          }),
        ],
      })
    );

    expect(html).toContain('>Claude Code</td>');
    expect(html).toContain('data-agent="claude-code"');
    expect(html).toContain('>Claude Code</button>');
    expect(html).toContain('aria-pressed="false"');
    expect(html).toContain('"claude-code":"Claude Code"');
    expect(html).toContain('>unknown-agent</td>');
  });

  it('renders model comparison and per-model LLM findings in HTML', async () => {
    const { renderHtml } = await import('../packages/cli/src/output/html.js');
    const html = renderHtml(
      makeScanResult({
        skills: [
          makeSkill({
            name: 'reviewed-skill',
            llmReviews: [
              makeLlmReview({
                modelName: 'alpha',
                findings: [
                  {
                    severity: 'high',
                    category: 'prompt-injection',
                    confidence: 0.82,
                    rationale: 'The instruction asks the model to ignore policy.',
                    file: 'SKILL.md',
                  },
                ],
              }),
              makeLlmReview({
                modelName: 'beta',
                model: 'beta-local',
                status: 'invalid-response',
                findings: [],
              }),
            ],
          }),
        ],
      })
    );

    expect(html).toContain('id="llm-comparison"');
    expect(html).toContain('<th>LLM Review</th>');
    expect(html).toContain('alpha');
    expect(html).toContain('high');
    expect(html).toContain('invalid-response');
    expect(html).toContain('"llmReviews"');
    expect(html).not.toContain('llm_reviews');
  });

  it('opens HTML detail panel with LLM findings grouped by model', async () => {
    const { renderHtml } = await import('../packages/cli/src/output/html.js');
    const html = renderHtml(
      makeScanResult({
        skills: [
          makeSkill({
            name: 'reviewed-skill',
            llmReviews: [
              makeLlmReview({
                modelName: 'alpha',
                findings: [
                  {
                    severity: 'high',
                    category: 'prompt-injection',
                    confidence: 0.82,
                    rationale: 'The instruction asks the model to ignore policy.',
                    file: 'SKILL.md',
                  },
                ],
              }),
            ],
          }),
        ],
      })
    );
    const document = executeHtmlReportScript(html);
    const row = getRow(document, 'claude-code');

    row.click();

    const panelText = elementText(getElementById(document, 'panel-findings'));
    expect(panelText).toContain('LLM Review');
    expect(panelText).toContain('alpha');
    expect(panelText).toContain('confidence 82%');
    expect(panelText).toContain('The instruction asks the model to ignore policy.');
  });

  it('filters rows from the agent sidebar and keeps row expansion working', async () => {
    const { renderHtml } = await import('../packages/cli/src/output/html.js');
    const html = renderHtml(
      makeScanResult({
        agents: [
          { id: 'claude-code', installed: true, skillsScanned: 1 },
          { id: 'cursor', installed: true, skillsScanned: 1 },
        ],
        skills: [
          makeSkill({ id: 'claude-skill', agentId: 'claude-code', name: 'claude-skill' }),
          makeSkill({
            id: 'cursor-skill',
            agentId: 'cursor',
            name: 'cursor-skill',
            path: '/tmp/cursor-skill',
          }),
        ],
        summary: { skillsScanned: 2, compromised: 0, percentCompromised: 0, verdict: 'PASS' },
      })
    );
    const document = executeHtmlReportScript(html);
    const allFilter = getFilter(document, '');
    const claudeFilter = getFilter(document, 'claude-code');
    const cursorFilter = getFilter(document, 'cursor');
    const claudeRow = getRow(document, 'claude-code');
    const cursorRow = getRow(document, 'cursor');

    cursorFilter.click();

    expect(claudeRow.style.display).toBe('none');
    expect(cursorRow.style.display).toBe('');
    expect(cursorFilter.classList.contains('active')).toBe(true);
    expect(cursorFilter.getAttribute('aria-pressed')).toBe('true');
    expect(allFilter.getAttribute('aria-pressed')).toBe('false');

    cursorRow.click();

    expect(getElementById(document, 'panel').classList.contains('open')).toBe(true);
    expect(getElementById(document, 'panel-title').textContent).toBe('cursor-skill');

    allFilter.dispatchEvent(new FakeEvent('keydown', ' '));

    expect(claudeRow.style.display).toBe('');
    expect(cursorRow.style.display).toBe('');
    expect(allFilter.classList.contains('active')).toBe(true);
    expect(allFilter.getAttribute('aria-pressed')).toBe('true');

    claudeFilter.dispatchEvent(new FakeEvent('keydown', 'Enter'));

    expect(claudeRow.style.display).toBe('');
    expect(cursorRow.style.display).toBe('none');
    expect(claudeFilter.classList.contains('active')).toBe(true);
    expect(claudeFilter.getAttribute('aria-pressed')).toBe('true');
  });
});

describe('renderTable', () => {
  it('writes output to stdout without throwing', () => {
    const spy = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
    renderTable(makeScanResult());
    expect(spy).toHaveBeenCalled();
    spy.mockRestore();
  });

  it('handles a FAIL verdict skill without throwing', () => {
    const spy = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
    const result = makeScanResult({
      skills: [
        makeSkill({
          summary: {
            critical: 1,
            high: 0,
            medium: 0,
            low: 0,
            info: 0,
            score: 75,
            verdict: 'FAIL',
            mandatoryFail: ['NET-EXFIL-ENV'],
            allowlisted: false,
          },
        }),
      ],
      summary: { skillsScanned: 1, compromised: 1, percentCompromised: 100, verdict: 'FAIL' },
    });
    renderTable(result);
    expect(spy).toHaveBeenCalled();
    spy.mockRestore();
  });

  it('handles multiple skills without throwing', () => {
    const spy = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
    const result = makeScanResult({
      skills: [makeSkill(), makeSkill({ id: 'def456', agentId: 'cursor', name: 'another-skill' })],
      summary: { skillsScanned: 2, compromised: 0, percentCompromised: 0, verdict: 'PASS' },
    });
    renderTable(result);
    expect(spy).toHaveBeenCalled();
    spy.mockRestore();
  });
});
