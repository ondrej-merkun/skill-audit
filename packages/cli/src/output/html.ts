import { formatAgentName } from '../agent-names.js';
import { formatCompromisedPercent } from '../percent.js';
import type { ScanResult, ScannedSkill, Severity } from '../types.js';
import { installStateLabel } from './install-state.js';
import { collectLlmComparisons, collectLlmConsensus, highestLlmSeverity } from './llm.js';
import { sortScanSkills } from './sort.js';
import { formatTopIssuePlain } from './top-issue.js';

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function verdictColor(verdict: string): string {
  if (verdict === 'FAIL') return '#dc2626';
  if (verdict === 'REVIEW') return '#d97706';
  return '#16a34a';
}

function scoreRingSvg(score: number, verdict: string): string {
  const r = 36;
  const circ = 2 * Math.PI * r;
  const dash = (score / 100) * circ;
  const color = verdictColor(verdict);
  return `<svg width="90" height="90" viewBox="0 0 90 90" aria-label="Score ${score}">
  <circle cx="45" cy="45" r="${r}" fill="none" stroke="#e5e7eb" stroke-width="8"/>
  <circle cx="45" cy="45" r="${r}" fill="none" stroke="${color}" stroke-width="8"
    stroke-dasharray="${dash.toFixed(2)} ${circ.toFixed(2)}"
    stroke-dashoffset="${(circ / 4).toFixed(2)}" stroke-linecap="round"/>
  <text x="45" y="50" text-anchor="middle" font-size="18" font-weight="700" fill="${color}">${score}</text>
</svg>`;
}

function renderEnrichmentCells(skill: ScannedSkill): string {
  const rows: string[] = [];
  const { skillsSh, github, depsdev } = skill.enrichment;

  if (skillsSh !== undefined) {
    rows.push(
      `<div><span>skills.sh</span> Gen=${escapeHtml(skillsSh.gen)} · Socket=${skillsSh.socketAlerts} · Snyk=${escapeHtml(skillsSh.snyk)}</div>`
    );
  } else {
    rows.push('<div class="enrichment-missing"><span>skills.sh</span> —</div>');
  }

  if (github !== undefined) {
    const contributors =
      github.contributors === null ? 'contributors unknown' : `${github.contributors} contributors`;
    rows.push(
      `<div><span>GitHub</span> ${github.stars} stars · ${github.ageDays} days old · ${contributors}</div>`
    );
  } else {
    rows.push('<div class="enrichment-missing"><span>GitHub</span> —</div>');
  }

  if (depsdev !== undefined) {
    const score =
      depsdev.scorecardScore === null
        ? 'scorecard unavailable'
        : `scorecard ${depsdev.scorecardScore}`;
    rows.push(
      `<div><span>deps.dev</span> ${depsdev.osvAdvisories} OSV advisories · ${escapeHtml(score)}</div>`
    );
  } else {
    rows.push('<div class="enrichment-missing"><span>deps.dev</span> —</div>');
  }

  return rows.join('');
}

function hasEnrichmentDetails(skill: ScannedSkill): boolean {
  return (
    skill.enrichment.skillsSh !== undefined ||
    skill.enrichment.github !== undefined ||
    skill.enrichment.depsdev !== undefined
  );
}

function severityClass(severity: Severity): string {
  return `sev sev-${severity}`;
}

function renderLlmReviewCells(skill: ScannedSkill): string {
  if (skill.llmReviews === undefined || skill.llmReviews.length === 0) {
    return '<div class="llm-missing">—</div>';
  }

  return skill.llmReviews
    .map((review) => {
      if (review.status !== 'ok') {
        return `<div class="llm-row"><span>${escapeHtml(review.modelName)}</span> ${escapeHtml(review.status)}</div>`;
      }
      const highest = highestLlmSeverity(review);
      const findingText =
        review.findings.length === 1 ? '1 finding' : `${review.findings.length} findings`;
      const label =
        highest === null
          ? 'ok · 0 findings'
          : `ok · <strong class="${severityClass(highest)}">${escapeHtml(highest)}</strong> · ${findingText}`;
      return `<div class="llm-row"><span>${escapeHtml(review.modelName)}</span> ${label}</div>`;
    })
    .join('');
}

function renderLlmOverview(skills: ScannedSkill[]): string {
  const comparisons = collectLlmComparisons(skills);
  if (comparisons.length === 0) return '';
  const consensus = collectLlmConsensus(skills);
  const cards = comparisons
    .map((comparison) => {
      const statusText = Object.entries(comparison.statuses)
        .filter(([, count]) => count > 0)
        .map(([status, count]) => `${status}: ${count}`)
        .join(' · ');
      const severityText =
        comparison.findings === 0
          ? '0 findings'
          : Object.entries(comparison.severities)
              .filter(([, count]) => count > 0)
              .map(([severity, count]) => `${severity}: ${count}`)
              .join(' · ');
      return `<section class="llm-card">
        <h3>${escapeHtml(comparison.modelName)}</h3>
        <div>${escapeHtml(comparison.provider)} · ${escapeHtml(comparison.model)}</div>
        <div>${escapeHtml(statusText)}</div>
        <div>${escapeHtml(severityText)}</div>
      </section>`;
    })
    .join('');
  const consensusRows =
    consensus.length === 0
      ? ''
      : `<div class="llm-consensus"><strong>Consensus</strong>${consensus
          .slice(0, 3)
          .map(
            (group) =>
              `<div>${escapeHtml(group.skillName)} · ${escapeHtml(group.file)} · ${escapeHtml(group.severity)} · ${group.models.length} models</div>`
          )
          .join('')}</div>`;
  return `<section id="llm-comparison" aria-label="LLM review comparison">
    <h2>LLM Review</h2>
    <div class="llm-grid">${cards}</div>
    ${consensusRows}
  </section>`;
}

function redactPaths(skills: ScannedSkill[]): ScannedSkill[] {
  return skills.map((s) => {
    const redacted = {
      ...s,
      path: '[redacted]',
      findings: s.findings.map((f) => ({
        ...f,
        file: f.file.replace(/.*\//, '[redacted]/'),
        snippet: '[redacted]',
      })),
    };
    if (s.llmReviews === undefined) return redacted;
    return {
      ...redacted,
      llmReviews: s.llmReviews.map((review) => ({
        ...review,
        findings: review.findings.map((finding) => ({
          ...finding,
          ...(finding.file !== undefined
            ? { file: finding.file.replace(/.*\//, '[redacted]/') }
            : {}),
        })),
      })),
    };
  });
}

export function renderHtml(result: ScanResult): string {
  const sorted = sortScanSkills(result.skills);
  const publicSorted = sorted;

  const agentIds = [
    ...new Set([...result.agents.map((a) => a.id), ...sorted.map((skill) => skill.agentId)]),
  ];
  const agentNames = Object.fromEntries(
    [...new Set([...agentIds, ...sorted.map((skill) => skill.agentId)])].map((id) => [
      id,
      formatAgentName(id),
    ])
  );

  const overallScore =
    sorted.length > 0
      ? Math.round(sorted.reduce((s, sk) => s + sk.summary.score, 0) / sorted.length)
      : 100;
  const overallVerdict = result.summary.verdict;
  const showInstallState = sorted.some(
    (skill) => installStateLabel(skill.installState) === 'marketplace'
  );
  const showEnrichment = sorted.some(hasEnrichmentDetails);
  const showLlmReview = sorted.some((skill) => skill.llmReviews !== undefined);

  // Embed scan data as JSON for client-side consumption (all strings are server-generated)
  const jsonData = JSON.stringify({ result: { ...result, skills: publicSorted } });
  const redactedJson = JSON.stringify({
    result: { ...result, skills: redactPaths(publicSorted) },
  });

  const rows = sorted
    .map((sk, i) => {
      const v = sk.summary.verdict;
      const color = verdictColor(v);
      const ignoredTag = sk.ignored ? ` <span class="tag-ignored">ignored</span>` : '';
      const allowlistedTag = sk.summary.allowlisted
        ? ` <span class="tag-allow">allowlisted</span>`
        : '';
      const stateTag = showInstallState
        ? ` <span class="tag-state">${escapeHtml(installStateLabel(sk.installState))}</span>`
        : '';
      const topIssue = formatTopIssuePlain(sk);
      return `<tr class="skill-row" data-idx="${i}" data-agent="${escapeHtml(sk.agentId)}" tabindex="0">
      <td><span class="verdict-dot" style="background:${color}"></span> <strong style="color:${color}">${escapeHtml(v)}</strong></td>
      <td>${escapeHtml(sk.name)}${ignoredTag}${allowlistedTag}${stateTag}</td>
      <td>${escapeHtml(formatAgentName(sk.agentId))}</td>
      <td style="font-weight:600;color:${color}">${sk.summary.score}</td>
      <td>${sk.summary.critical}C ${sk.summary.high}H ${sk.summary.medium}M ${sk.summary.low}L</td>
      ${showEnrichment ? `<td class="enrichment-cell">${renderEnrichmentCells(sk)}</td>` : ''}
      ${showLlmReview ? `<td class="llm-cell">${renderLlmReviewCells(sk)}</td>` : ''}
      <td class="top-issue">${escapeHtml(topIssue)}</td>
    </tr>`;
    })
    .join('\n');

  const agentFilters = agentIds
    .map(
      (id) =>
        `<li><button type="button" class="agent-filter" data-agent="${escapeHtml(id)}" aria-pressed="false">${escapeHtml(formatAgentName(id))}</button></li>`
    )
    .join('\n');

  const css = `
*{box-sizing:border-box;margin:0;padding:0}
body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;font-size:14px;background:#f9fafb;color:#111827}
#header{position:sticky;top:0;z-index:100;background:#fff;border-bottom:1px solid #e5e7eb;padding:12px 20px;display:flex;align-items:center;gap:20px}
#header h1{font-size:16px;font-weight:700;flex:1}
#header .meta{color:#6b7280;font-size:13px}
#layout{display:flex;min-height:calc(100vh - 57px)}
#rail{width:200px;min-width:160px;background:#fff;border-right:1px solid #e5e7eb;padding:16px 12px;flex-shrink:0}
#rail h2{font-size:12px;font-weight:600;text-transform:uppercase;letter-spacing:.05em;color:#6b7280;margin-bottom:8px}
#rail ul{list-style:none}
#rail li{margin-bottom:4px}
#rail button{display:block;width:100%;padding:4px 8px;border:0;border-radius:6px;background:transparent;color:#374151;text-align:left;font:inherit;font-size:13px;cursor:pointer}
#rail button:hover,#rail button.active,#rail button:focus-visible{background:#f3f4f6;color:#111827;outline:none}
#rail button.active{font-weight:600}
#main{flex:1;padding:20px;overflow:auto}
.toolbar{display:flex;gap:8px;margin-bottom:12px}
.btn{padding:6px 12px;border-radius:6px;border:1px solid #d1d5db;background:#fff;cursor:pointer;font-size:13px;color:#374151}
.btn:hover{background:#f3f4f6}
.btn-danger{border-color:#fca5a5;color:#dc2626}
table{width:100%;border-collapse:collapse;background:#fff;border:1px solid #e5e7eb;border-radius:8px;overflow:hidden}
thead th{background:#f9fafb;padding:10px 12px;text-align:left;font-size:12px;font-weight:600;text-transform:uppercase;letter-spacing:.04em;color:#6b7280;border-bottom:1px solid #e5e7eb}
tbody tr{border-bottom:1px solid #f3f4f6;cursor:pointer}
tbody tr:last-child{border-bottom:none}
tbody tr:hover{background:#f9fafb}
tbody tr.selected{background:#eff6ff}
td{padding:10px 12px;vertical-align:middle}
.verdict-dot{display:inline-block;width:8px;height:8px;border-radius:50%;margin-right:6px;vertical-align:middle}
.top-issue{font-size:12px;color:#6b7280}
.enrichment-cell{font-size:12px;line-height:1.45;color:#374151;min-width:230px}
.enrichment-cell span{display:inline-block;min-width:54px;color:#6b7280}
.enrichment-missing{color:#9ca3af}
.llm-cell{font-size:12px;line-height:1.45;color:#374151;min-width:160px}
.llm-row span{display:inline-block;min-width:54px;color:#6b7280}
.llm-missing{color:#9ca3af}
#llm-comparison{background:#fff;border:1px solid #e5e7eb;border-radius:8px;margin-bottom:12px;padding:12px}
#llm-comparison h2{font-size:12px;font-weight:600;text-transform:uppercase;letter-spacing:.04em;color:#6b7280;margin-bottom:8px}
.llm-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:8px}
.llm-card{border:1px solid #e5e7eb;border-radius:6px;padding:10px;color:#374151;font-size:12px;line-height:1.5}
.llm-card h3{font-size:13px;color:#111827;margin-bottom:2px}
.llm-consensus{border-top:1px solid #e5e7eb;margin-top:10px;padding-top:10px;color:#374151;font-size:12px;line-height:1.5}
.tag-ignored,.tag-allow,.tag-state{display:inline-block;font-size:11px;padding:1px 6px;border-radius:10px;margin-left:6px;vertical-align:middle}
.tag-ignored{background:#fef3c7;color:#92400e}
.tag-allow{background:#d1fae5;color:#065f46}
.tag-state{background:#e0f2fe;color:#075985}
#panel{position:fixed;top:0;right:-480px;width:460px;height:100vh;background:#fff;border-left:1px solid #e5e7eb;box-shadow:-4px 0 20px rgba(0,0,0,.08);transition:right .2s ease;z-index:200;overflow-y:auto;padding:20px}
#panel.open{right:0}
#panel-close{position:absolute;top:12px;right:12px;background:none;border:none;font-size:20px;cursor:pointer;color:#6b7280}
#panel h2{font-size:16px;font-weight:700;margin-bottom:4px;padding-right:30px}
#panel .panel-meta{color:#6b7280;font-size:13px;margin-bottom:16px}
.finding{border:1px solid #e5e7eb;border-radius:6px;padding:12px;margin-bottom:10px}
.finding-header{display:flex;gap:8px;align-items:center;margin-bottom:6px}
.finding-rule{font-family:monospace;font-size:12px;font-weight:600}
.sev{padding:2px 8px;border-radius:10px;font-size:11px;font-weight:600;text-transform:uppercase}
.sev-critical{background:#fee2e2;color:#dc2626}
.sev-high{background:#ffedd5;color:#ea580c}
.sev-medium{background:#fef9c3;color:#ca8a04}
.sev-low{background:#f0fdf4;color:#16a34a}
.sev-info{background:#f0f9ff;color:#0284c7}
.finding pre{background:#f9fafb;border:1px solid #e5e7eb;border-radius:4px;padding:8px;font-size:12px;overflow-x:auto;margin-top:6px}
.finding-msg{margin-top:4px;font-size:13px}
.finding-fix{margin-top:6px;font-size:12px;color:#6b7280}
.enrichment{border-top:1px solid #e5e7eb;margin-top:14px;padding-top:14px}
.enrichment h3{font-size:12px;font-weight:600;text-transform:uppercase;letter-spacing:.04em;color:#6b7280;margin-bottom:8px}
.enrichment-row{font-size:13px;margin-bottom:6px;color:#374151}
.enrichment-row.missing{color:#9ca3af}
.enrichment-source{display:inline-block;min-width:72px;color:#6b7280}
.llm-review{border-top:1px solid #e5e7eb;margin-top:14px;padding-top:14px}
.llm-review h3{font-size:12px;font-weight:600;text-transform:uppercase;letter-spacing:.04em;color:#6b7280;margin-bottom:8px}
.llm-model{border:1px solid #e5e7eb;border-radius:6px;padding:10px;margin-bottom:8px}
.llm-model-header{display:flex;gap:8px;align-items:center;margin-bottom:6px}
.llm-model-name{font-weight:600}
.llm-model-meta{font-size:12px;color:#6b7280}
.llm-finding{border-top:1px solid #f3f4f6;padding-top:8px;margin-top:8px;font-size:13px}
.llm-rationale{margin-top:4px;color:#374151}
#overlay{display:none;position:fixed;inset:0;background:rgba(0,0,0,.15);z-index:199}
#overlay.visible{display:block}
`;

  // JS uses DOM methods (createElement/textContent) to avoid innerHTML with untrusted strings.
  // The embedded JSON (jsonData/redactedJson) is server-generated from typed ScanResult values
  // and is read-only on the client side — not used to build DOM.
  const js = `
(function(){
var DATA = ${jsonData};
var REDACTED = ${redactedJson};
var AGENT_NAMES = ${JSON.stringify(agentNames)};
var skills = DATA.result.skills;
var activeAgent = null;

function verdictColor(v){return v==='FAIL'?'#dc2626':v==='REVIEW'?'#d97706':'#16a34a';}
function agentName(id){return AGENT_NAMES[id] || id;}

function filterRows(){
  document.querySelectorAll('.skill-row').forEach(function(tr){
    var ag = tr.getAttribute('data-agent');
    tr.style.display = (!activeAgent || ag===activeAgent) ? '' : 'none';
  });
  document.querySelectorAll('.agent-filter').forEach(function(button){
    var selected = button.getAttribute('data-agent')===activeAgent;
    button.classList.toggle('active', selected);
    button.setAttribute('aria-pressed', selected ? 'true' : 'false');
  });
  var all = document.getElementById('all-link');
  if(all) {
    all.classList.toggle('active', !activeAgent);
    all.setAttribute('aria-pressed', !activeAgent ? 'true' : 'false');
  }
}

function makeFindingEl(f){
  var wrap = document.createElement('div');
  wrap.className = 'finding';

  var hdr = document.createElement('div');
  hdr.className = 'finding-header';

  var ruleEl = document.createElement('span');
  ruleEl.className = 'finding-rule';
  ruleEl.textContent = f.rule_id || f.ruleId || '';
  hdr.appendChild(ruleEl);

  var sevEl = document.createElement('span');
  var sev = (f.severity || '').toLowerCase();
  sevEl.className = 'sev sev-' + sev;
  sevEl.textContent = f.severity || '';
  hdr.appendChild(sevEl);
  wrap.appendChild(hdr);

  if(f.message){
    var msg = document.createElement('div');
    msg.className = 'finding-msg';
    msg.textContent = f.message;
    wrap.appendChild(msg);
  }
  if(f.snippet){
    var pre = document.createElement('pre');
    pre.textContent = f.snippet;
    wrap.appendChild(pre);
  }
  if(f.fix){
    var fix = document.createElement('div');
    fix.className = 'finding-fix';
    fix.textContent = 'Fix: ' + f.fix;
    wrap.appendChild(fix);
  }
  return wrap;
}

function makeEnrichmentEl(enrichment){
  var e = enrichment || {};
  if(!e.skillsSh && !e.github && !e.depsdev) return null;

  var wrap = document.createElement('div');
  wrap.className = 'enrichment';

  var title = document.createElement('h3');
  title.textContent = 'Enrichment';
  wrap.appendChild(title);

  function addRow(source, text, missing){
    var row = document.createElement('div');
    row.className = missing ? 'enrichment-row missing' : 'enrichment-row';
    var label = document.createElement('span');
    label.className = 'enrichment-source';
    label.textContent = source;
    row.appendChild(label);
    row.appendChild(document.createTextNode(text));
    wrap.appendChild(row);
  }

  if(e.skillsSh){
    addRow('skills.sh', 'Gen=' + e.skillsSh.gen + ' · Socket=' + e.skillsSh.socketAlerts + ' · Snyk=' + e.skillsSh.snyk, false);
  } else {
    addRow('skills.sh', '—', true);
  }
  if(e.github){
    var contributors = e.github.contributors === null ? 'contributors unknown' : e.github.contributors + ' contributors';
    addRow('GitHub', e.github.stars + ' stars · ' + e.github.ageDays + ' days old · ' + contributors, false);
  } else {
    addRow('GitHub', '—', true);
  }
  if(e.depsdev){
    var score = e.depsdev.scorecardScore === null ? 'scorecard unavailable' : 'scorecard ' + e.depsdev.scorecardScore;
    addRow('deps.dev', e.depsdev.osvAdvisories + ' OSV advisories · ' + score, false);
  } else {
    addRow('deps.dev', '—', true);
  }

  return wrap;
}

function makeLlmEl(reviews){
  if(!reviews || reviews.length === 0) return null;

  var wrap = document.createElement('div');
  wrap.className = 'llm-review';

  var title = document.createElement('h3');
  title.textContent = 'LLM Review';
  wrap.appendChild(title);

  reviews.forEach(function(review){
    var model = document.createElement('div');
    model.className = 'llm-model';

    var header = document.createElement('div');
    header.className = 'llm-model-header';

    var name = document.createElement('span');
    name.className = 'llm-model-name';
    name.textContent = review.modelName;
    header.appendChild(name);

    var status = document.createElement('span');
    status.className = 'sev sev-' + (review.status === 'ok' ? 'info' : 'medium');
    status.textContent = review.status;
    header.appendChild(status);
    model.appendChild(header);

    var meta = document.createElement('div');
    meta.className = 'llm-model-meta';
    meta.textContent = review.provider + ' · ' + review.model + ' · prompt ' + review.promptVersion;
    model.appendChild(meta);

    if(review.findings && review.findings.length > 0){
      review.findings.forEach(function(finding){
        var findingEl = document.createElement('div');
        findingEl.className = 'llm-finding';

        var sev = document.createElement('span');
        sev.className = 'sev sev-' + finding.severity;
        sev.textContent = finding.severity;
        findingEl.appendChild(sev);

        var confidence = document.createElement('span');
        confidence.className = 'llm-model-meta';
        confidence.textContent = ' confidence ' + Math.round(finding.confidence * 100) + '%';
        findingEl.appendChild(confidence);

        var rationale = document.createElement('div');
        rationale.className = 'llm-rationale';
        rationale.textContent = finding.rationale;
        findingEl.appendChild(rationale);

        if(finding.file){
          var file = document.createElement('div');
          file.className = 'llm-model-meta';
          file.textContent = finding.file;
          findingEl.appendChild(file);
        }

        model.appendChild(findingEl);
      });
    } else {
      var none = document.createElement('div');
      none.className = 'llm-model-meta';
      none.textContent = 'No LLM-only findings.';
      model.appendChild(none);
    }

    wrap.appendChild(model);
  });

  return wrap;
}

function openPanel(idx){
  var sk = skills[idx];
  if(!sk) return;
  document.querySelectorAll('.skill-row').forEach(function(tr,i){ tr.classList.toggle('selected',i===idx); });

  var v = sk.summary.verdict;
  var color = verdictColor(v);

  var titleEl = document.getElementById('panel-title');
  titleEl.textContent = sk.name;

  var metaEl = document.getElementById('panel-meta');
  metaEl.textContent = v + ' · Score: ' + sk.summary.score
    + ' · ' + agentName(sk.agentId)
    + ' · ' + sk.summary.critical + 'C ' + sk.summary.high + 'H '
    + sk.summary.medium + 'M ' + sk.summary.low + 'L';
  metaEl.style.color = color;

  var findingsEl = document.getElementById('panel-findings');
  while(findingsEl.firstChild) findingsEl.removeChild(findingsEl.firstChild);

  if(sk.findings && sk.findings.length > 0){
    sk.findings.forEach(function(f){ findingsEl.appendChild(makeFindingEl(f)); });
  } else {
    var none = document.createElement('p');
    none.style.color = '#6b7280';
    none.textContent = 'No findings.';
    findingsEl.appendChild(none);
  }

  var enrichmentEl = makeEnrichmentEl(sk.enrichment);
  if(enrichmentEl) findingsEl.appendChild(enrichmentEl);

  var llmEl = makeLlmEl(sk.llmReviews);
  if(llmEl) findingsEl.appendChild(llmEl);

  document.getElementById('panel').classList.add('open');
  document.getElementById('overlay').classList.add('visible');
}

function closePanel(){
  document.getElementById('panel').classList.remove('open');
  document.getElementById('overlay').classList.remove('visible');
  document.querySelectorAll('.skill-row').forEach(function(tr){ tr.classList.remove('selected'); });
}

document.querySelectorAll('.skill-row').forEach(function(tr,i){
  tr.addEventListener('click', function(){ openPanel(i); });
  tr.addEventListener('keydown', function(e){
    if(e.key==='Enter'||e.key===' '){
      e.preventDefault();
      openPanel(i);
    }
  });
});

function activateAgentFilter(button){
  var ag = button.getAttribute('data-agent');
  activeAgent = ag === '' || ag===activeAgent ? null : ag;
  filterRows();
}

document.querySelectorAll('.agent-filter').forEach(function(button){
  button.addEventListener('click', function(){
    activateAgentFilter(button);
  });
  button.addEventListener('keydown', function(e){
    if(e.key==='Enter'||e.key===' '){
      e.preventDefault();
      activateAgentFilter(button);
    }
  });
});
document.getElementById('panel-close').addEventListener('click', closePanel);
document.getElementById('overlay').addEventListener('click', closePanel);

document.getElementById('btn-copy-json').addEventListener('click', function(){
  navigator.clipboard.writeText(JSON.stringify(DATA.result, null, 2));
});

document.getElementById('btn-copy-md').addEventListener('click', function(){
  var lines = ['# skill-audit report', '', '| Skill | Verdict | Score |', '|---|---|---|'];
  skills.forEach(function(s){ lines.push('| '+s.name+' | '+s.summary.verdict+' | '+s.summary.score+' |'); });
  navigator.clipboard.writeText(lines.join('\\n'));
});

document.getElementById('btn-download').addEventListener('click', function(){
  var blob = new Blob([JSON.stringify(DATA.result, null, 2)], {type:'application/json'});
  var a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'skill-audit-report.json';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
});

document.getElementById('btn-share').addEventListener('click', function(){
  var blob = new Blob([JSON.stringify(REDACTED.result, null, 2)], {type:'application/json'});
  var a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'skill-audit-report-redacted.json';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
});
})();
`;

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8"/>
<meta name="viewport" content="width=device-width,initial-scale=1"/>
<title>skill-audit report — ${escapeHtml(result.scan.startedAt)}</title>
<style>${css}</style>
</head>
<body>
<div id="header">
  <h1>skill-audit</h1>
  ${scoreRingSvg(overallScore, overallVerdict)}
  <div>
    <div class="meta">${result.summary.skillsScanned} skills scanned · ${result.summary.compromised} compromised (${formatCompromisedPercent(result.summary.percentCompromised)}%)</div>
    <div class="meta">Scanned ${escapeHtml(result.scan.startedAt)} · ${result.scan.durationMs}ms · v${escapeHtml(result.scan.toolVersion)}</div>
  </div>
</div>
<div id="layout">
  <nav id="rail" aria-label="Agent filter">
    <h2>Agents</h2>
    <ul>
      <li><button type="button" id="all-link" class="agent-filter active" data-agent="" aria-pressed="true">All agents</button></li>
      ${agentFilters}
    </ul>
  </nav>
  <main id="main">
    <div class="toolbar">
      <button class="btn" id="btn-copy-json">Copy JSON</button>
      <button class="btn" id="btn-copy-md">Copy Markdown</button>
      <button class="btn" id="btn-download">Download JSON</button>
      <button class="btn btn-danger" id="btn-share">Share (redacted)</button>
    </div>
    ${renderLlmOverview(sorted)}
    <table>
      <thead>
        <tr>
          <th>Verdict</th>
          <th>Skill</th>
          <th>Agent</th>
          <th>Score</th>
          <th>Findings</th>
          ${showEnrichment ? '<th>Enrichment</th>' : ''}
          ${showLlmReview ? '<th>LLM Review</th>' : ''}
          <th>Top Issue</th>
        </tr>
      </thead>
      <tbody id="skills-tbody">
        ${rows}
      </tbody>
    </table>
  </main>
</div>
<div id="overlay"></div>
<aside id="panel" aria-label="Skill detail">
  <button id="panel-close" aria-label="Close panel">&times;</button>
  <h2 id="panel-title"></h2>
  <div id="panel-meta" class="panel-meta"></div>
  <div id="panel-findings"></div>
</aside>
<script>${js}</script>
</body>
</html>`;
}
