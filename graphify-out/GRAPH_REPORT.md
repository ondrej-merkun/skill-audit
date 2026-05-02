# Graph Report - skillaudit  (2026-05-03)

## Corpus Check
- 159 files · ~85,082 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 664 nodes · 1202 edges · 26 communities detected
- Extraction: 86% EXTRACTED · 14% INFERRED · 0% AMBIGUOUS · INFERRED: 169 edges (avg confidence: 0.8)
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
- [[_COMMUNITY_Community 17|Community 17]]
- [[_COMMUNITY_Community 18|Community 18]]
- [[_COMMUNITY_Community 19|Community 19]]
- [[_COMMUNITY_Community 20|Community 20]]
- [[_COMMUNITY_Community 21|Community 21]]
- [[_COMMUNITY_Community 23|Community 23]]
- [[_COMMUNITY_Community 24|Community 24]]
- [[_COMMUNITY_Community 25|Community 25]]
- [[_COMMUNITY_Community 30|Community 30]]

## God Nodes (most connected - your core abstractions)
1. `runScan()` - 22 edges
2. `readFile()` - 19 edges
3. `trim()` - 19 edges
4. `parse()` - 17 edges
5. `computeTreeSha256()` - 14 edges
6. `runExplain()` - 14 edges
7. `renderTableToString()` - 13 edges
8. `renderSummaryFooter()` - 12 edges
9. `add()` - 11 edges
10. `resolveGitHubSlug()` - 11 edges

## Surprising Connections (you probably didn't know these)
- `parse()` --calls--> `readPackageVersion()`  [INFERRED]
  test/fixtures/benign/date-parser/parse.py → packages/cli/src/version.ts
- `fetchImpl()` --calls--> `checkOpenAiCompatibleConnection()`  [INFERRED]
  test/scan-options.test.ts → packages/cli/src/llm/openai-compatible.ts
- `readFile()` --calls--> `readIgnoreListContent()`  [INFERRED]
  test/fixtures/malicious/remote-import-skill/utils.js → packages/cli/src/allowlist/ignore.ts
- `readFile()` --calls--> `discoverMcpSettings()`  [INFERRED]
  test/fixtures/malicious/remote-import-skill/utils.js → packages/cli/src/discovery/cline.ts
- `readFile()` --calls--> `discoverMcpJson()`  [INFERRED]
  test/fixtures/malicious/remote-import-skill/utils.js → packages/cli/src/discovery/cursor.ts

## Communities

### Community 0 - "Community 0"
Cohesion: 0.05
Nodes (51): appendToIgnoreList(), getConfigDir(), getIgnoreListPath(), getLegacyIgnoreListPath(), loadIgnoreList(), readIgnoreListContent(), renderDetail(), renderEnrichment() (+43 more)

### Community 1 - "Community 1"
Cohesion: 0.07
Nodes (39): escapeHtml(), redactPaths(), renderEnrichmentCells(), renderHtml(), renderLlmOverview(), scoreRingSvg(), verdictColor(), installStateLabel() (+31 more)

### Community 2 - "Community 2"
Cohesion: 0.07
Nodes (30): appDataDir(), clineExtensionStorageDirs(), discoverLegacyRulesFile(), discoverRuleFiles(), discoverSkillsDir(), discoverWorkflowFiles(), getClineDir(), getCwd() (+22 more)

### Community 3 - "Community 3"
Cohesion: 0.07
Nodes (13): basenameOf(), extensionOf(), isMarkdownPromptFile(), isStringPrefixChar(), maskDocumentationExampleContext(), maskDocumentationTextInCode(), maskJavaScriptStringsAndComments(), maskMarkdownSecurityEducationContext() (+5 more)

### Community 4 - "Community 4"
Cohesion: 0.1
Nodes (38): cacheDir(), cacheGet(), cacheKey(), cacheSet(), legacyCacheDir(), depsDevSystem(), enrichDepsDev(), fetchDependencyLookup() (+30 more)

### Community 5 - "Community 5"
Cohesion: 0.08
Nodes (26): convert(), extract_audio(), Thin wrapper around the local ffmpeg binary for common media operations., _run(), thumbnail(), trim(), buildLlmReviewMessages(), buildLlmReviewPayload() (+18 more)

### Community 6 - "Community 6"
Cohesion: 0.07
Nodes (14): executeHtmlReportScript(), FakeClassList, FakeDocument, FakeElement, FakeEvent, FakeTextNode, getFilter(), getRow() (+6 more)

### Community 7 - "Community 7"
Cohesion: 0.12
Nodes (21): parseOptionalPositiveInteger(), runLlmAdd(), runLlmCheck(), runLlmList(), serializeHealth(), addLlmConfig(), getConfigDir(), getLlmConfigPath() (+13 more)

### Community 8 - "Community 8"
Cohesion: 0.13
Nodes (20): isPluginMarketplacePath(), normalizedSegments(), shouldSkipMarketplacePath(), withInstallState(), ancestorDirsToGitRoot(), descendantWindsurfRulesDirs(), discoverRuleFile(), discoverRulesDir() (+12 more)

### Community 9 - "Community 9"
Cohesion: 0.13
Nodes (20): add_days(), diff_days(), parse(), Date parsing and formatting utilities — pure stdlib., to_iso(), discoverMcpJson(), discoverMcpSettings(), discoverAgentMarkdownFiles() (+12 more)

### Community 10 - "Community 10"
Cohesion: 0.19
Nodes (16): discoverActivePluginPayloadTree(), discoverAgentFiles(), discoverEnabledPluginCaches(), discoverMcpToml(), discoverPluginTree(), discoverSkillDirs(), discoverUntrustedProjectConfig(), makeId() (+8 more)

### Community 11 - "Community 11"
Cohesion: 0.19
Nodes (12): discoverAgentEntries(), discoverCommandFiles(), discoverMcpFromClaudeJson(), discoverPluginTree(), discoverSkillDirs(), makeId(), pathSegments(), skillFromDir() (+4 more)

### Community 12 - "Community 12"
Cohesion: 0.22
Nodes (14): col_sum(), dedup(), describe(), filter_rows(), head(), CSV data processing helpers — pure stdlib., _read(), to_json() (+6 more)

### Community 13 - "Community 13"
Cohesion: 0.28
Nodes (10): extractSnippet(), globalPattern(), hasNestedQuantifier(), isNestedScanRoot(), isPromptBearingCommandOrAgentDir(), isSafeRegexInput(), lineCol(), runPatternWithSafetyPreflight() (+2 more)

### Community 14 - "Community 14"
Cohesion: 0.22
Nodes (1): runCli()

### Community 15 - "Community 15"
Cohesion: 0.43
Nodes (7): container_logs(), _docker(), list_containers(), prune(), Local Docker management helpers — wraps the docker CLI., stats(), stop_all()

### Community 16 - "Community 16"
Cohesion: 0.29
Nodes (6): eval_expr(), import_module(), Dynamically import a module by name., Evaluate arbitrary Python expression., Execute arbitrary Python code block., run_snippet()

### Community 17 - "Community 17"
Cohesion: 0.4
Nodes (3): _detect_runner(), Test runner helper — autodetects framework and runs tests., run_tests()

### Community 18 - "Community 18"
Cohesion: 0.33
Nodes (1): JSON syntax checking and schema validation helpers.

### Community 19 - "Community 19"
Cohesion: 0.47
Nodes (4): generate_toc(), _lines(), lint(), Markdown linting and auto-formatting helpers.

### Community 20 - "Community 20"
Cohesion: 0.4
Nodes (1): Git workflow helper — generates branch names and commit messages.

### Community 21 - "Community 21"
Cohesion: 0.4
Nodes (1): Extract text and tables from PDF files.

### Community 23 - "Community 23"
Cohesion: 0.67
Nodes (2): list_buckets(), _load_creds()

### Community 24 - "Community 24"
Cohesion: 1.0
Nodes (2): notify_build(), notify_deploy()

### Community 25 - "Community 25"
Cohesion: 1.0
Nodes (2): add_task(), list_tasks()

### Community 30 - "Community 30"
Cohesion: 1.0
Nodes (1): Benign scanner fixture catalog.  This file stores quoted payload examples for ru

## Knowledge Gaps
- **14 isolated node(s):** `Evaluate arbitrary Python expression.`, `Execute arbitrary Python code block.`, `Dynamically import a module by name.`, `Benign scanner fixture catalog.  This file stores quoted payload examples for ru`, `Test runner helper — autodetects framework and runs tests.` (+9 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **Thin community `Community 14`** (9 nodes): `stripAnsi()`, `runCli()`, `e2e.test.ts`, `strip-ansi.ts`, `makeDepsDevPackageResponse()`, `makeDepsDevProjectResponse()`, `makeDepsDevVersionResponse()`, `makeSkill()`, `scan-enrichment-pipeline.test.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 18`** (6 nodes): `check_syntax()`, `minify()`, `pretty()`, `JSON syntax checking and schema validation helpers.`, `validate_schema()`, `validate.py`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 20`** (5 nodes): `Git workflow helper — generates branch names and commit messages.`, `recent_commits()`, `staged_summary()`, `suggest_branch()`, `suggest.py`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 21`** (5 nodes): `extract_tables()`, `extract_text()`, `get_metadata()`, `Extract text and tables from PDF files.`, `extractor.py`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 23`** (4 nodes): `list_buckets()`, `_load_creds()`, `upload_file()`, `aws_ops.py`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 24`** (3 nodes): `notify.py`, `notify_build()`, `notify_deploy()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 25`** (3 nodes): `kanban.py`, `add_task()`, `list_tasks()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 30`** (2 nodes): `Benign scanner fixture catalog.  This file stores quoted payload examples for ru`, `sample_payloads.py`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `add()` connect `Community 12` to `Community 0`, `Community 8`, `Community 10`, `Community 13`?**
  _High betweenness centrality (0.037) - this node is a cross-community bridge._
- **Why does `trim()` connect `Community 5` to `Community 0`, `Community 4`, `Community 7`, `Community 10`, `Community 13`?**
  _High betweenness centrality (0.032) - this node is a cross-community bridge._
- **Why does `parse()` connect `Community 9` to `Community 2`, `Community 4`, `Community 5`, `Community 7`, `Community 11`?**
  _High betweenness centrality (0.022) - this node is a cross-community bridge._
- **Are the 13 inferred relationships involving `runScan()` (e.g. with `clearPlugins()` and `initDefaultPlugins()`) actually correct?**
  _`runScan()` has 13 INFERRED edges - model-reasoned connections that need verification._
- **Are the 18 inferred relationships involving `readFile()` (e.g. with `runCli()` and `fixture()`) actually correct?**
  _`readFile()` has 18 INFERRED edges - model-reasoned connections that need verification._
- **Are the 17 inferred relationships involving `trim()` (e.g. with `minify()` and `extractGitHubSlugFromUrl()`) actually correct?**
  _`trim()` has 17 INFERRED edges - model-reasoned connections that need verification._
- **Are the 13 inferred relationships involving `parse()` (e.g. with `fetchImpl()` and `parseJson()`) actually correct?**
  _`parse()` has 13 INFERRED edges - model-reasoned connections that need verification._