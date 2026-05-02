# Graph Report - skillaudit  (2026-05-03)

## Corpus Check
- 155 files · ~93,241 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 623 nodes · 992 edges · 26 communities detected
- Extraction: 85% EXTRACTED · 15% INFERRED · 0% AMBIGUOUS · INFERRED: 152 edges (avg confidence: 0.8)
- Token cost: 0 input · 0 output

## Community Hubs (Navigation)
- [[_COMMUNITY_Community 0|Community 0]]
- [[_COMMUNITY_Community 1|Community 1]]
- [[_COMMUNITY_Community 2|Community 2]]
- [[_COMMUNITY_Community 3|Community 3]]
- [[_COMMUNITY_Community 4|Community 4]]
- [[_COMMUNITY_Community 5|Community 5]]
- [[_COMMUNITY_Community 6|Community 6]]
- [[_COMMUNITY_Community 7|Community 7]]
- [[_COMMUNITY_Community 8|Community 8]]
- [[_COMMUNITY_Community 9|Community 9]]
- [[_COMMUNITY_Community 10|Community 10]]
- [[_COMMUNITY_Community 11|Community 11]]
- [[_COMMUNITY_Community 12|Community 12]]
- [[_COMMUNITY_Community 13|Community 13]]
- [[_COMMUNITY_Community 14|Community 14]]
- [[_COMMUNITY_Community 15|Community 15]]
- [[_COMMUNITY_Community 16|Community 16]]
- [[_COMMUNITY_Community 18|Community 18]]
- [[_COMMUNITY_Community 19|Community 19]]
- [[_COMMUNITY_Community 20|Community 20]]
- [[_COMMUNITY_Community 22|Community 22]]
- [[_COMMUNITY_Community 23|Community 23]]
- [[_COMMUNITY_Community 25|Community 25]]
- [[_COMMUNITY_Community 26|Community 26]]
- [[_COMMUNITY_Community 27|Community 27]]
- [[_COMMUNITY_Community 37|Community 37]]

## God Nodes (most connected - your core abstractions)
1. `runScan()` - 22 edges
2. `trim()` - 19 edges
3. `readFile()` - 18 edges
4. `parse()` - 16 edges
5. `runExplain()` - 14 edges
6. `renderTableToString()` - 13 edges
7. `renderSummaryFooter()` - 12 edges
8. `resolveGitHubSlug()` - 11 edges
9. `FakeElement` - 10 edges
10. `add()` - 10 edges

## Surprising Connections (you probably didn't know these)
- `parse()` --calls--> `readPackageVersion()`  [INFERRED]
  test/fixtures/benign/date-parser/parse.py → packages/cli/src/version.ts
- `calculateCompromisedPercent()` --calls--> `runScan()`  [INFERRED]
  /tmp/skillaudit-graphify-corpus/packages/cli/src/percent.ts → packages/cli/src/commands/scan.ts
- `renderTableToString()` --calls--> `formatLlmReviewInline()`  [INFERRED]
  packages/cli/src/output/table.ts → /tmp/skillaudit-graphify-corpus/packages/cli/src/output/llm.ts
- `fetchImpl()` --calls--> `checkOpenAiCompatibleConnection()`  [INFERRED]
  test/scan-options.test.ts → packages/cli/src/llm/openai-compatible.ts
- `readFile()` --calls--> `readIgnoreListContent()`  [INFERRED]
  test/fixtures/malicious/remote-import-skill/utils.js → /tmp/skillaudit-graphify-corpus/packages/cli/src/allowlist/ignore.ts

## Communities

### Community 0 - "Community 0"
Cohesion: 0.06
Nodes (37): renderDetail(), renderEnrichment(), renderFinding(), runExplain(), shortenPath(), computeExitCode(), llmStatusLine(), loadSelectedLlmConfigs() (+29 more)

### Community 1 - "Community 1"
Cohesion: 0.08
Nodes (39): cacheDir(), cacheGet(), cacheKey(), cacheSet(), legacyCacheDir(), depsDevSystem(), enrichDepsDev(), fetchDependencyLookup() (+31 more)

### Community 2 - "Community 2"
Cohesion: 0.08
Nodes (26): convert(), extract_audio(), Thin wrapper around the local ffmpeg binary for common media operations., _run(), thumbnail(), trim(), buildLlmReviewMessages(), buildLlmReviewPayload() (+18 more)

### Community 3 - "Community 3"
Cohesion: 0.07
Nodes (14): executeHtmlReportScript(), FakeClassList, FakeDocument, FakeElement, FakeEvent, FakeTextNode, getFilter(), getRow() (+6 more)

### Community 4 - "Community 4"
Cohesion: 0.09
Nodes (27): appendToIgnoreList(), getConfigDir(), getIgnoreListPath(), getLegacyIgnoreListPath(), loadIgnoreList(), readIgnoreListContent(), runIgnore(), runList() (+19 more)

### Community 5 - "Community 5"
Cohesion: 0.09
Nodes (12): discoverSingleFile(), discoverSkillsDir(), makeId(), pathExists(), discoverLegacyCursorRules(), discoverMcpJson(), makeId(), pathExists() (+4 more)

### Community 6 - "Community 6"
Cohesion: 0.1
Nodes (24): escapeHtml(), redactPaths(), renderEnrichmentCells(), renderHtml(), renderLlmOverview(), scoreRingSvg(), verdictColor(), collectLlmComparisons() (+16 more)

### Community 7 - "Community 7"
Cohesion: 0.12
Nodes (19): add_days(), diff_days(), parse(), Date parsing and formatting utilities — pure stdlib., to_iso(), discoverAgentEntries(), discoverCommandFiles(), discoverMcpFromClaudeJson() (+11 more)

### Community 8 - "Community 8"
Cohesion: 0.15
Nodes (20): discoverActivePluginPayloadTree(), discoverAgentFiles(), discoverEnabledPluginCaches(), discoverMcpToml(), discoverPluginTree(), discoverSkillDirs(), discoverUntrustedProjectConfig(), makeId() (+12 more)

### Community 9 - "Community 9"
Cohesion: 0.11
Nodes (5): chatCompletionsUrl(), checkOpenAiCompatibleConnection(), isAbortError(), validChatCompletionsResponse(), runCli()

### Community 10 - "Community 10"
Cohesion: 0.17
Nodes (18): col_sum(), dedup(), describe(), filter_rows(), head(), CSV data processing helpers — pure stdlib., _read(), to_json() (+10 more)

### Community 11 - "Community 11"
Cohesion: 0.19
Nodes (13): basenameOf(), extensionOf(), isMarkdownPromptFile(), isStringPrefixChar(), maskDocumentationExampleContext(), maskDocumentationTextInCode(), maskJavaScriptStringsAndComments(), maskMarkdownSecurityEducationContext() (+5 more)

### Community 12 - "Community 12"
Cohesion: 0.19
Nodes (17): parseOptionalPositiveInteger(), runLlmAdd(), runLlmCheck(), runLlmList(), serializeHealth(), addLlmConfig(), getConfigDir(), getLlmConfigPath() (+9 more)

### Community 13 - "Community 13"
Cohesion: 0.26
Nodes (12): discoverAgentMarkdownFiles(), discoverCommandTomlFiles(), discoverExtensionManifests(), discoverMcpJson(), isRecord(), makeId(), missingPathWarnings(), namesFromUnknown() (+4 more)

### Community 14 - "Community 14"
Cohesion: 0.28
Nodes (10): extractSnippet(), globalPattern(), hasNestedQuantifier(), isNestedScanRoot(), isPromptBearingCommandOrAgentDir(), isSafeRegexInput(), lineCol(), runPatternWithTimeout() (+2 more)

### Community 15 - "Community 15"
Cohesion: 0.43
Nodes (7): container_logs(), _docker(), list_containers(), prune(), Local Docker management helpers — wraps the docker CLI., stats(), stop_all()

### Community 16 - "Community 16"
Cohesion: 0.29
Nodes (6): eval_expr(), import_module(), Dynamically import a module by name., Evaluate arbitrary Python expression., Execute arbitrary Python code block., run_snippet()

### Community 18 - "Community 18"
Cohesion: 0.4
Nodes (3): _detect_runner(), Test runner helper — autodetects framework and runs tests., run_tests()

### Community 19 - "Community 19"
Cohesion: 0.33
Nodes (1): JSON syntax checking and schema validation helpers.

### Community 20 - "Community 20"
Cohesion: 0.47
Nodes (4): generate_toc(), _lines(), lint(), Markdown linting and auto-formatting helpers.

### Community 22 - "Community 22"
Cohesion: 0.4
Nodes (1): Git workflow helper — generates branch names and commit messages.

### Community 23 - "Community 23"
Cohesion: 0.4
Nodes (1): Extract text and tables from PDF files.

### Community 25 - "Community 25"
Cohesion: 0.67
Nodes (2): list_buckets(), _load_creds()

### Community 26 - "Community 26"
Cohesion: 1.0
Nodes (2): notify_build(), notify_deploy()

### Community 27 - "Community 27"
Cohesion: 1.0
Nodes (2): add_task(), list_tasks()

### Community 37 - "Community 37"
Cohesion: 1.0
Nodes (1): Benign scanner fixture catalog.  This file stores quoted payload examples for ru

## Knowledge Gaps
- **14 isolated node(s):** `Evaluate arbitrary Python expression.`, `Execute arbitrary Python code block.`, `Dynamically import a module by name.`, `Benign scanner fixture catalog.  This file stores quoted payload examples for ru`, `Test runner helper — autodetects framework and runs tests.` (+9 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **Thin community `Community 19`** (6 nodes): `check_syntax()`, `minify()`, `pretty()`, `JSON syntax checking and schema validation helpers.`, `validate_schema()`, `validate.py`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 22`** (5 nodes): `Git workflow helper — generates branch names and commit messages.`, `recent_commits()`, `staged_summary()`, `suggest_branch()`, `suggest.py`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 23`** (5 nodes): `extract_tables()`, `extract_text()`, `get_metadata()`, `Extract text and tables from PDF files.`, `extractor.py`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 25`** (4 nodes): `list_buckets()`, `_load_creds()`, `upload_file()`, `aws_ops.py`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 26`** (3 nodes): `notify.py`, `notify_build()`, `notify_deploy()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 27`** (3 nodes): `kanban.py`, `add_task()`, `list_tasks()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 37`** (2 nodes): `Benign scanner fixture catalog.  This file stores quoted payload examples for ru`, `sample_payloads.py`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `runScan()` connect `Community 0` to `Community 10`, `Community 4`, `Community 6`?**
  _High betweenness centrality (0.063) - this node is a cross-community bridge._
- **Why does `readFile()` connect `Community 1` to `Community 2`, `Community 4`, `Community 5`, `Community 7`, `Community 8`, `Community 9`, `Community 12`, `Community 13`?**
  _High betweenness centrality (0.060) - this node is a cross-community bridge._
- **Why does `trim()` connect `Community 2` to `Community 0`, `Community 1`, `Community 4`, `Community 8`, `Community 12`, `Community 14`?**
  _High betweenness centrality (0.060) - this node is a cross-community bridge._
- **Are the 13 inferred relationships involving `runScan()` (e.g. with `clearPlugins()` and `initDefaultPlugins()`) actually correct?**
  _`runScan()` has 13 INFERRED edges - model-reasoned connections that need verification._
- **Are the 17 inferred relationships involving `trim()` (e.g. with `minify()` and `extractGitHubSlugFromUrl()`) actually correct?**
  _`trim()` has 17 INFERRED edges - model-reasoned connections that need verification._
- **Are the 17 inferred relationships involving `readFile()` (e.g. with `runCli()` and `fixture()`) actually correct?**
  _`readFile()` has 17 INFERRED edges - model-reasoned connections that need verification._
- **Are the 12 inferred relationships involving `parse()` (e.g. with `fetchImpl()` and `parseJson()`) actually correct?**
  _`parse()` has 12 INFERRED edges - model-reasoned connections that need verification._