# Graph Report - skillaudit  (2026-05-07)

## Corpus Check
- 181 files · ~114,148 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 738 nodes · 1353 edges · 26 communities detected
- Extraction: 85% EXTRACTED · 15% INFERRED · 0% AMBIGUOUS · INFERRED: 197 edges (avg confidence: 0.8)
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
1. `trim()` - 25 edges
2. `runScan()` - 24 edges
3. `readFile()` - 21 edges
4. `parse()` - 20 edges
5. `runExplain()` - 16 edges
6. `computeTreeSha256()` - 14 edges
7. `renderTableToString()` - 14 edges
8. `add()` - 13 edges
9. `runRules()` - 12 edges
10. `renderSummaryFooter()` - 12 edges

## Surprising Connections (you probably didn't know these)
- `readPackageVersion()` --calls--> `parse()`  [INFERRED]
  packages/cli/src/version.ts → test/fixtures/benign/date-parser/parse.py
- `reviewWithOpenAiCompatibleModel()` --calls--> `fetchImpl()`  [INFERRED]
  packages/cli/src/llm/review.ts → test/scan-options.test.ts
- `readPackageJson()` --calls--> `readFile()`  [INFERRED]
  packages/cli/src/enrich/metadata.ts → test/fixtures/malicious/remote-import-skill/utils.js
- `resolveGitHubSlug()` --calls--> `readFile()`  [INFERRED]
  packages/cli/src/enrich/metadata.ts → test/fixtures/malicious/remote-import-skill/utils.js
- `readDependencyRefs()` --calls--> `readFile()`  [INFERRED]
  packages/cli/src/enrich/metadata.ts → test/fixtures/malicious/remote-import-skill/utils.js

## Communities

### Community 0 - "Community 0"
Cohesion: 0.04
Nodes (54): appendToIgnoreList(), getConfigDir(), getIgnoreListPath(), loadIgnoreList(), readIgnoreListContent(), renderDetail(), renderEnrichment(), renderFinding() (+46 more)

### Community 1 - "Community 1"
Cohesion: 0.05
Nodes (44): add_days(), diff_days(), parse(), Date parsing and formatting utilities — pure stdlib., to_iso(), discoverAgentEntries(), discoverCommandFiles(), discoverMcpFromClaudeJson() (+36 more)

### Community 2 - "Community 2"
Cohesion: 0.06
Nodes (22): basenameOf(), extensionOf(), isMarkdownPromptFile(), isStringPrefixChar(), maskDocumentationExampleContext(), maskDocumentationTextInCode(), maskJavaScriptStringsAndComments(), maskMarkdownSecurityEducationContext() (+14 more)

### Community 3 - "Community 3"
Cohesion: 0.07
Nodes (41): escapeHtml(), redactPaths(), renderEnrichmentCells(), renderHtml(), renderLlmOverview(), scoreRingSvg(), verdictColor(), installStateLabel() (+33 more)

### Community 4 - "Community 4"
Cohesion: 0.1
Nodes (36): cacheDir(), cacheGet(), cacheKey(), cacheSet(), depsDevSystem(), enrichDepsDev(), fetchDependencyLookup(), fetchProjectScorecard() (+28 more)

### Community 5 - "Community 5"
Cohesion: 0.07
Nodes (14): executeHtmlReportScript(), FakeClassList, FakeDocument, FakeElement, FakeEvent, FakeTextNode, getFilter(), getRow() (+6 more)

### Community 6 - "Community 6"
Cohesion: 0.1
Nodes (29): convert(), extract_audio(), Thin wrapper around the local ffmpeg binary for common media operations., _run(), thumbnail(), trim(), buildLlmReviewMessages(), buildLlmReviewPayload() (+21 more)

### Community 7 - "Community 7"
Cohesion: 0.12
Nodes (27): appDataDir(), clineExtensionStorageDirs(), discoverLegacyRulesFile(), discoverRuleFiles(), discoverSkillsDir(), discoverWorkflowFiles(), getClineDir(), getCwd() (+19 more)

### Community 8 - "Community 8"
Cohesion: 0.1
Nodes (22): parseOptionalPositiveInteger(), runLlmAdd(), runLlmCheck(), runLlmList(), serializeHealth(), addLlmConfig(), getConfigDir(), getLlmConfigPath() (+14 more)

### Community 9 - "Community 9"
Cohesion: 0.11
Nodes (19): isPluginMarketplacePath(), normalizedSegments(), shouldSkipMarketplacePath(), withInstallState(), ancestorDirsToGitRoot(), descendantWindsurfRulesDirs(), discoverRuleFile(), discoverRulesDir() (+11 more)

### Community 10 - "Community 10"
Cohesion: 0.16
Nodes (20): addReachablePath(), buildReachabilityIndex(), classifySupportingFileRole(), extractSnippet(), findingForRole(), globalPattern(), hasNestedQuantifier(), isMarkdownPromptFile() (+12 more)

### Community 11 - "Community 11"
Cohesion: 0.15
Nodes (18): col_sum(), dedup(), describe(), filter_rows(), head(), CSV data processing helpers — pure stdlib., _read(), to_json() (+10 more)

### Community 12 - "Community 12"
Cohesion: 0.11
Nodes (1): runCli()

### Community 13 - "Community 13"
Cohesion: 0.26
Nodes (12): discoverAgentMarkdownFiles(), discoverCommandTomlFiles(), discoverExtensionManifests(), discoverMcpJson(), isRecord(), makeId(), missingPathWarnings(), namesFromUnknown() (+4 more)

### Community 14 - "Community 14"
Cohesion: 0.43
Nodes (7): container_logs(), _docker(), list_containers(), prune(), Local Docker management helpers — wraps the docker CLI., stats(), stop_all()

### Community 15 - "Community 15"
Cohesion: 0.29
Nodes (6): eval_expr(), import_module(), Dynamically import a module by name., Evaluate arbitrary Python expression., Execute arbitrary Python code block., run_snippet()

### Community 16 - "Community 16"
Cohesion: 0.4
Nodes (3): _detect_runner(), Test runner helper — autodetects framework and runs tests., run_tests()

### Community 17 - "Community 17"
Cohesion: 0.33
Nodes (1): JSON syntax checking and schema validation helpers.

### Community 18 - "Community 18"
Cohesion: 0.47
Nodes (4): generate_toc(), _lines(), lint(), Markdown linting and auto-formatting helpers.

### Community 19 - "Community 19"
Cohesion: 0.6
Nodes (5): isLikelySecurityEducationSkill(), readIfExists(), readSkillContext(), stringifyMetadata(), withSecurityEducationContextFinding()

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
- **Thin community `Community 12`** (18 nodes): `stripAnsi()`, `expectSupportedAgentHelp()`, `runCli()`, `e2e.test.ts`, `strip-ansi.ts`, `makeDepsDevPackageResponse()`, `makeDepsDevProjectResponse()`, `makeDepsDevVersionResponse()`, `makeSkill()`, `scan-enrichment-pipeline.test.ts`, `makeFinding()`, `makeInteractiveTTY()`, `makeSkill()`, `restoreProgressEnv()`, `restoreTTY()`, `scan-options.test.ts`, `withTempDir()`, `writeLlmConfig()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 17`** (6 nodes): `check_syntax()`, `minify()`, `pretty()`, `JSON syntax checking and schema validation helpers.`, `validate_schema()`, `validate.py`
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

- **Why does `trim()` connect `Community 6` to `Community 0`, `Community 1`, `Community 3`, `Community 4`, `Community 8`, `Community 10`?**
  _High betweenness centrality (0.035) - this node is a cross-community bridge._
- **Why does `add()` connect `Community 11` to `Community 0`, `Community 9`, `Community 10`, `Community 1`?**
  _High betweenness centrality (0.034) - this node is a cross-community bridge._
- **Why does `parse()` connect `Community 1` to `Community 0`, `Community 4`, `Community 6`, `Community 8`, `Community 13`?**
  _High betweenness centrality (0.021) - this node is a cross-community bridge._
- **Are the 23 inferred relationships involving `trim()` (e.g. with `minify()` and `extractGitHubSlugFromUrl()`) actually correct?**
  _`trim()` has 23 INFERRED edges - model-reasoned connections that need verification._
- **Are the 17 inferred relationships involving `runScan()` (e.g. with `formatSupportedAgentIds()` and `loadSelectedLlmConfigs()`) actually correct?**
  _`runScan()` has 17 INFERRED edges - model-reasoned connections that need verification._
- **Are the 20 inferred relationships involving `readFile()` (e.g. with `runCli()` and `fixture()`) actually correct?**
  _`readFile()` has 20 INFERRED edges - model-reasoned connections that need verification._
- **Are the 16 inferred relationships involving `parse()` (e.g. with `fetchImpl()` and `fetchImpl()`) actually correct?**
  _`parse()` has 16 INFERRED edges - model-reasoned connections that need verification._