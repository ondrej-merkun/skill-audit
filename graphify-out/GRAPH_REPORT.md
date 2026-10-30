# Graph Report - skillaudit  (2026-10-30)

## Corpus Check
- 417 files · ~136,232 words
- Verdict: corpus is large enough that graph structure adds value.
- Unclassified: 18 file(s) not represented in the graph (top: .toml 10, (none) 6, .mdc 2)

## Summary
- 2294 nodes · 4030 edges · 286 communities (107 shown, 179 thin omitted)
- Extraction: 97% EXTRACTED · 3% INFERRED · 0% AMBIGUOUS · INFERRED: 103 edges (avg confidence: 0.88)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `4adc4e60`
- Run `git rev-parse HEAD` and compare to check if the graph is stale.
- Run `graphify update .` after code changes (no API cost).

## Community Hubs (Navigation)
- summary.ts
- enrich/index.ts
- rules/agent-config.ts
- engine.ts
- subprocess
- cli/package.json
- output.test.ts
- discovery/index.ts
- scan-options.test.ts
- network-exfil.ts
- config.ts
- review.ts
- isRegularFile
- explain.test.ts
- rules.test.ts
- scan.ts
- ref_node_path
- rules/index.ts
- discovery/agent-config.ts
- claude-code.ts
- filesystem.ts
- cline.ts
- codex.ts
- progress.ts
- code-context.ts
- steps
- windsurf.ts
- steps
- gemini.ts
- compilerOptions
- package.json
- explain.ts
- Commands
- json.ts
- secrets.ts
- compilerOptions
- README.md
- attributes
- attributes
- attributes
- biome.json
- Implemented discovery set (keep this accurate)
- e2e.test.ts
- scan-multi.test.ts
- attributes
- version-pins.test.ts
- obfuscation.ts
- ref_node_url
- High-leverage fixes, ranked
- types.ts
- feature_request.yml
- fs-walk.ts
- prompt-injection.ts
- Your iteration protocol — follow exactly
- specs/OUTPUT.md — exact output contracts
- parse.py
- Reference
- specs/RULES.md — exact patterns for each rule
- action.yml
- updates
- requests
- steps
- skill-audit
- kanban/kanban.py
- process.py
- AGENT.md — conventions for the `skill-audit` repo
- Threat Model
- skill-audit MVP spec and implementation plan
- benign/package.json
- test_secret_detector.py
- allowlist/ignore.ts
- code-execution.ts
- Critical patterns (implement these exactly)
- malicious/package.json
- AGENTS.md — entry point for any AI coding agent
- LESSONS.md — things the loop learned the hard way
- Changelog
- webhook-exfil-skill/notify.py
- inputs
- CONTRIBUTING.md
- Examples
- Release Checklist
- skill-audit — Claude Code Skill
- format.py
- ref_fs
- 5. Cloud enrichment layer
- enrich-github.test.ts
- env
- contact_links
- security-education.ts
- .ralph/fix_plan.md — skill-audit task list
- 6. Output and UX layer
- enrich-deps-dev.test.ts
- scan-enrichment-pipeline.test.ts
- aws_ops.py
- PULL_REQUEST_TEMPLATE.md
- utils.js
- discovery-registry.test.ts
- pnpm-workspace.yaml
- socket
- specs/ — source of truth
- 2. Architecture and tech stack
- 4. Local static analysis layer
- extractor.py
- yaml
- PI-JAILBREAK/benign/SKILL.md
- PI-OVERRIDE/benign/SKILL.md
- agent
- args
- fail-on
- path
- upload-results
- version
- with
- Security Policy
- filesystem
- run-ralph-claude.sh
- run-ralph-codex.sh
- c2_node.js
- cleanup.js
- PI-METADATA-MISMATCH/benign/SKILL.md
- Data Downloader Skill
- local-python
- runner
- skill-audit
- run_cmd.js
- security-auditor/SKILL.md
- Installation
- Browser Profile Auditor
- FS-CREDSTORE/benign/SKILL.md
- Cloud access reference
- pretty-substitution
- pretty-loader
- bootstrap
- Request catchers in skills
- OBFS-EVAL-ATOB/benign/safe.js
- Security scanner docs
- Installer Skill
- PDF Extractor Skill
- Config Reader Skill
- csv-processor/SKILL.md
- date-parser/SKILL.md
- ffmpeg-wrapper/SKILL.md
- benign/git-helper/SKILL.md
- json-validator/SKILL.md
- kanban/SKILL.md
- markdown-formatter/SKILL.md
- pdf-extractor/SKILL.md
- skill-tester/SKILL.md
- test-runner/SKILL.md
- CODEEXEC-JS-EVAL-FUNCTION/benign/safe.js
- eval_code.js
- CODEEXEC-SHELL-BACKTICK/benign/safe.sh
- run.sh
- example.md
- DEPS-INLINE-INSTALL/benign/setup.sh
- DEPS-INLINE-INSTALL/benign/SKILL.md
- DEPS-INLINE-INSTALL/malicious/setup.sh
- DEPS-INLINE-INSTALL/malicious/SKILL.md
- cwd/AGENTS.md
- cwd/CLAUDE.md
- GEMINI.md
- run-tests.md
- local-linter/SKILL.md
- compound-engineering/agents/reviewer.md
- polish.md
- proof/SKILL.md
- review/SKILL.md
- work/SKILL.md
- skills/git-helper/SKILL.md
- coding.md
- deploy-helper/SKILL.md
- release.md
- codex/AGENTS.md
- AGENTS.override.md
- cache-only-helper/SKILL.md
- disabled-helper/SKILL.md
- cache-agent.md
- cache-command.md
- cache-helper/SKILL.md
- quick-check.md
- audit-helper/SKILL.md
- ship.md
- review-helper/SKILL.md
- copilot-instructions.md
- python.instructions.md
- ci-helper/SKILL.md
- code-reviewer/SKILL.md
- planner.md
- workspace-tools/agents/reviewer.md
- evil.sh script
- cache-cleaner.sh
- profile-notes.md
- browser-dump.sh
- FS-CREDSTORE/benign/docs.md
- FS-CREDSTORE/benign/safe.sh
- evil.sh script
- home.sh
- cleanup.sh script
- FS-DESTRUCTIVE-HOME-DELETE/benign/README.md
- lang-php.md
- delete_home.sh script
- evil.sh script
- FS-KEYCHAIN-ACCESS/benign/safe.sh
- evil.sh script
- normal_git.sh
- steal.sh
- normal_log.sh
- history_search.sh
- security.md
- inert-supporting-docs/SKILL.md
- code-execution-skill/SKILL.md
- credstore-read-skill/SKILL.md
- env-exfil-skill/SKILL.md
- hidden-unicode-skill/SKILL.md
- obfuscated-eval-skill/SKILL.md
- override-instructions-skill/SKILL.md
- archive.sh
- password-zip-skill/SKILL.md
- remote-import-skill/SKILL.md
- trigger-clause-skill/SKILL.md
- webhook-exfil-skill/SKILL.md
- metadata-header-normal-api.sh
- NET-CLOUD-METADATA-CREDENTIALS/benign/reference.md
- azure-imds.sh
- NET-DNS-UNUSUAL-TLD/benign/reference.md
- sample_asset.js
- c2.sh
- report-build.sh
- evil.sh script
- health.sh
- output_example.sh
- sample_asset.sh
- fetch.sh
- NET-WEBHOOK-KNOWN/benign/docs.md
- slack_notify.sh
- OBFS-BASE64-LARGE/benign/safe.sh
- OBFS-BASE64-LARGE/malicious/evil.sh
- safe-decode.sh
- decode-and-run.sh script
- scanner_rule_strings.js
- OBFS-EVAL-ATOB/malicious/SKILL.md
- SKILL-DISABLE-SAFETY/malicious/SKILL.md
- SKILL-MEMORY-WRITE/malicious/SKILL.md
- SKILL-PASSWORD-ZIP/benign/setup.sh
- SKILL-PASSWORD-ZIP/malicious/setup.sh

## God Nodes (most connected - your core abstractions)
1. `Skill` - 43 edges
2. `isRegularFile()` - 37 edges
3. `computeTreeSha256()` - 34 edges
4. `readDirFollowingLinks()` - 34 edges
5. `runScan()` - 33 edges
6. `discoverAll()` - 25 edges
7. `runRules()` - 24 edges
8. `enterDirOnce()` - 23 edges
9. `renderHtml()` - 21 edges
10. `withInstallState()` - 20 edges

## Surprising Connections (you probably didn't know these)
- `Project gotchas (the things that burn time if you don't know)` --references--> `discoverAll()`  [INFERRED]
  CLAUDE.md → packages/cli/src/discovery/index.ts
- `Discovery and output invariants` --references--> `discoverAll()`  [INFERRED]
  docs/agents/AGENT.md → packages/cli/src/discovery/index.ts
- `8. Shared Agent Skills directory` --references--> `discoverAll()`  [INFERRED]
  specs/DISCOVERY.md → packages/cli/src/discovery/index.ts
- `Disambiguation rules` --references--> `discoverAll()`  [INFERRED]
  specs/DISCOVERY.md → packages/cli/src/discovery/index.ts
- `Pending tasks` --references--> `Skill`  [INFERRED]
  .ralph/fix_plan.md → packages/cli/src/types.ts

## Import Cycles
- None detected.

## Communities (286 total, 179 thin omitted)

### Community 0 - "summary.ts"
Cohesion: 0.05
Nodes (83): 4. Architecture & performance — think before locking in, chalk@^5.3.0, formatAgentName(), skillAgentIds(), skillAgentLabel(), skillAgentNames(), escapeHtml(), hasEnrichmentDetails() (+75 more)

### Community 1 - "enrich/index.ts"
Cohesion: 0.05
Nodes (69): cacheDir(), CacheEntry, cacheGet(), CacheGetResult, cacheKey(), cacheSet(), DependencyLookup, DepsDevPackageResponse (+61 more)

### Community 2 - "rules/agent-config.ts"
Cohesion: 0.06
Nodes (57): commandValues(), AGENT_CONFIG_COMMANDS_SCAN_NAME, AGENT_CONFIG_FILENAMES, AGENT_SETTINGS_FILENAMES, agentConfigCommandValues(), agentConfigJson(), blankCommentOnlyLines(), collectCommandValues() (+49 more)

### Community 3 - "engine.ts"
Cohesion: 0.06
Nodes (57): EntryKind, entryKindSync(), kindOf(), addReachablePath(), aliasPathsOf(), buildReachabilityIndex(), classifySupportingFileRole(), DirAlias (+49 more)

### Community 4 - "subprocess"
Cohesion: 0.05
Nodes (26): container_logs(), _docker(), list_containers(), prune(), stats(), stop_all(), docker-helper, check_ffmpeg() (+18 more)

### Community 5 - "cli/package.json"
Cohesion: 0.05
Nodes (46): author, bin, skill-audit, bugs, url, dependencies, cli-table3@^0.6.3, commander@^14.0.3 (+38 more)

### Community 6 - "output.test.ts"
Cohesion: 0.07
Nodes (19): elementText(), executeHtmlReportScript(), FakeClassList, FakeDocument, FakeElement, FakeEvent, FakeListener, FakeNode (+11 more)

### Community 7 - "discovery/index.ts"
Cohesion: 0.09
Nodes (28): 2. Discovery & spec-reading — disambiguate depth explicitly, agentsMdSweepDiscovery, TARGET_FILENAMES, claudeCodeDiscovery, codexDiscovery, copilotDiscovery, cursorDiscovery, geminiDiscovery (+20 more)

### Community 8 - "scan-options.test.ts"
Cohesion: 0.08
Nodes (22): AGENT_DISPLAY_NAMES, SUPPORTED_AGENT_IDS, ExplainOptions, compareString(), ListOptions, NO_BORDERS, runList(), SCOPE_COLOR (+14 more)

### Community 9 - "network-exfil.ts"
Cohesion: 0.06
Nodes (35): apiEndpointOverridePattern, awsCredentialMetadataPath, azureIdentityMetadataPath, cloudMetadataClientPattern, cloudMetadataCurlPattern, cloudMetadataFetchPattern, credentialMetadataUrlPattern, CURL_SENDS_STDIN (+27 more)

### Community 10 - "config.ts"
Cohesion: 0.12
Nodes (30): LlmCheckOptions, NO_BORDERS, parseOptionalPositiveInteger(), runLlmAdd(), runLlmCheck(), runLlmList(), serializeConfig(), serializeHealth() (+22 more)

### Community 11 - "review.ts"
Cohesion: 0.11
Nodes (30): LLM_REVIEW_CATEGORIES, buildLlmReviewMessages(), buildLlmReviewPayload(), contextCharBudget(), LlmReviewPayload, LlmReviewSnippet, readFindingSnippet(), redactSecrets() (+22 more)

### Community 12 - "isRegularFile"
Cohesion: 0.14
Nodes (22): discoverHookFiles(), discoverInstructionsDir(), discoverSingleFile(), discoverSkillsDir(), makeId(), discoverLegacyCursorRules(), discoverMcpJson(), discoverRulesDir() (+14 more)

### Community 13 - "explain.test.ts"
Cohesion: 0.09
Nodes (17): 7. Rule fixtures, ALLOWLISTED_SHAS, countUniqueRulesBySeverity(), CREDENTIAL_STORE_RULES, getMandatoryFailIds(), lineRuleKey(), MANDATORY_FAIL_STANDALONE, PIPE_TO_SHELL_RULES (+9 more)

### Community 14 - "rules.test.ts"
Cohesion: 0.08
Nodes (28): FS_CREDSTORE, NET_EXFIL_ENV, NET_HOOK_HTTP_EXTERNAL, NET_WEBHOOK_KNOWN, agentContextWriteTarget, claudeContextTarget, curlPipeBashPattern, fsWriteAgentContextPattern (+20 more)

### Community 15 - "scan.ts"
Cohesion: 0.15
Nodes (25): formatSupportedAgentIds(), runExplain(), computeExitCode(), DEFAULT_OPTIONS, mapWithConcurrency(), renderScanPayload(), runScan(), scanProgressOutputKind() (+17 more)

### Community 16 - "ref_node_path"
Cohesion: 0.13
Nodes (8): clineDiscovery, PI_JAILBREAK, PI_OVERRIDE, TRASHED_PLUGIN_ROOT, testHome, testHome, fs, os

### Community 17 - "rules/index.ts"
Cohesion: 0.09
Nodes (21): DEPENDENCIES_RULES, DESTRUCTIVE_RULES, FS_DESTRUCTIVE_HOME_DELETE, maskDestructiveDeleteContext(), maskLine(), pythonRmtreeHomePattern, shellDestructiveDeletePattern, GIT_CRED_READ (+13 more)

### Community 18 - "discovery/agent-config.ts"
Cohesion: 0.11
Nodes (26): AgentConfigFiles, agentConfigSkill(), COMMAND_SEPARATORS, CommandWord, commandWords(), discoverAgentConfigFiles(), discoverHookScripts(), HookScriptRoot (+18 more)

### Community 19 - "claude-code.ts"
Cohesion: 0.15
Nodes (22): mcpServerScanMetadata(), ClaudeJson, claudePluginsDir(), discoverAgentEntries(), discoverCommandFiles(), discoverMcpFromClaudeJson(), discoverMcpJson(), discoverPluginHooks() (+14 more)

### Community 20 - "filesystem.ts"
Cohesion: 0.08
Nodes (25): awsCredPattern, chromiumBrowserStorePattern, dockerKubePattern, dotfileCredsPattern, etcPasswdPattern, etcSudoersPattern, FILESYSTEM_RULES, firefoxBrowserStorePattern (+17 more)

### Community 21 - "cline.ts"
Cohesion: 0.19
Nodes (23): appDataDir(), clineExtensionStorageDirs(), discoverLegacyRulesFile(), discoverMcpSettings(), discoverRuleFiles(), discoverSkillsDir(), discoverWorkflowFiles(), getClineDir() (+15 more)

### Community 22 - "codex.ts"
Cohesion: 0.15
Nodes (20): discoverActivePluginPayloadTree(), discoverAgentFiles(), discoverEnabledPluginCaches(), discoverMcpToml(), discoverPluginTree(), discoverPromptFiles(), discoverSkillDirs(), discoverUntrustedProjectConfig() (+12 more)

### Community 23 - "progress.ts"
Cohesion: 0.10
Nodes (16): createProgressReporter(), DISCOVERY_ASCII_FRAMES, DISCOVERY_UNICODE_FRAMES, DiscoveryProgressCallback, DiscoveryProgressEvent, formatEnrichmentOutcome(), formatEnrichmentSource(), isTruthyEnv() (+8 more)

### Community 24 - "code-context.ts"
Cohesion: 0.16
Nodes (24): basenameOf(), DOCUMENTATION_PATH_SEGMENTS, EXAMPLE_LABEL_PATTERN, EXAMPLE_MATERIAL_PATTERN, extensionOf(), isMarkdownPromptFile(), isStringPrefixChar(), JAVASCRIPT_CODE_EXTENSIONS (+16 more)

### Community 25 - "steps"
Cohesion: 0.08
Nodes (23): name, runs-on, steps, strategy, jobs, ci, node, os (+15 more)

### Community 26 - "windsurf.ts"
Cohesion: 0.16
Nodes (17): TypeScript conventions, ancestorDirsToGitRoot(), discoverRuleFile(), discoverRulesDir(), gitRootFromAncestors(), hasNestedWorkspaceRules(), hasWorkspaceRules(), HOOK_DIRS (+9 more)

### Community 27 - "steps"
Cohesion: 0.09
Nodes (21): MIN_NPM_VERSION, jobs, release, name, on, push, contents, id-token (+13 more)

### Community 28 - "gemini.ts"
Cohesion: 0.20
Nodes (18): discoverAgentMarkdownFiles(), discoverCommandTomlFiles(), discoverExtensionManifests(), discoverMcpJson(), discoverSettingsFile(), discoverUserSettings(), GeminiExtensionMetadata, GeminiExtensionParseResult (+10 more)

### Community 29 - "compilerOptions"
Cohesion: 0.10
Nodes (20): compilerOptions, declaration, declarationMap, esModuleInterop, exactOptionalPropertyTypes, forceConsistentCasingInFileNames, incremental, module (+12 more)

### Community 30 - "package.json"
Cohesion: 0.12
Nodes (19): devDependencies, @types/node@^22.20.5, typescript@^6.0.3, vitest@^4.1.12, engines, node, @types/node, typescript (+11 more)

### Community 31 - "explain.ts"
Cohesion: 0.18
Nodes (17): formatAgentPath(), renderDetail(), renderEnrichment(), renderFinding(), renderLlmReviews(), SEVERITY_DOT, shortenPath(), VERDICT_BADGE (+9 more)

### Community 32 - "Commands"
Cohesion: 0.13
Nodes (16): Explain One Skill, Unreleased, Commands, Default Scan, Discovery Surface, `explain`, `ignore`, `list` (+8 more)

### Community 33 - "json.ts"
Cohesion: 0.18
Nodes (14): skillAgentPaths(), serializeEnrichment(), serializeFinding(), serializeLlmFinding(), serializeLlmReview(), serializeSkill(), LlmReviewFinding, ScanResult (+6 more)

### Community 34 - "secrets.ts"
Cohesion: 0.15
Nodes (17): anthropicKeyPattern, awsKeyPattern, genericSecretAssignments, hasNearbyExampleHeading(), hasOnlySyntheticGenericValues(), hasPlaceholderSecret(), hasSecretLikeValue(), isSyntheticValue() (+9 more)

### Community 35 - "compilerOptions"
Cohesion: 0.11
Nodes (17): compilerOptions, allowJs, esModuleInterop, exactOptionalPropertyTypes, forceConsistentCasingInFileNames, incremental, module, moduleResolution (+9 more)

### Community 36 - "README.md"
Cohesion: 0.16
Nodes (9): Allowlist Maintenance, npm package settings, Publishing, Common Commands, Limitations, Optional Local LLM Review, Read The First Result, Use In CI (+1 more)

### Community 37 - "attributes"
Cohesion: 0.12
Nodes (16): description, label, options, placeholder, render, value, body, attributes (+8 more)

### Community 38 - "attributes"
Cohesion: 0.12
Nodes (16): description, label, options, placeholder, render, value, body, attributes (+8 more)

### Community 39 - "attributes"
Cohesion: 0.12
Nodes (16): description, label, options, placeholder, render, value, body, attributes (+8 more)

### Community 40 - "biome.json"
Cohesion: 0.13
Nodes (16): files, includes, formatter, enabled, indentStyle, indentWidth, lineWidth, quoteStyle (+8 more)

### Community 41 - "Implemented discovery set (keep this accurate)"
Cohesion: 0.12
Nodes (16): warn(), 1. Claude Code, 2. Cursor, 3. GitHub Copilot, 4. Cline, 5. Cross-agent AGENTS.md sweep, 6. OpenAI Codex, 7. Gemini CLI (+8 more)

### Community 42 - "e2e.test.ts"
Cohesion: 0.12
Nodes (14): ACTION_YML, BENIGN_DIR, CLI, CliResult, EXAMPLES_DOC, FIXTURES_DIR, JsonFinding, JsonOutput (+6 more)

### Community 43 - "scan-multi.test.ts"
Cohesion: 0.12
Nodes (9): BENIGN_DIR, benignSkills, FIXTURES_DIR, JsonFinding, JsonOutput, JsonSkill, MALICIOUS_DIR, maliciousSkills (+1 more)

### Community 44 - "attributes"
Cohesion: 0.12
Nodes (15): description, label, options, placeholder, value, body, attributes, id (+7 more)

### Community 45 - "version-pins.test.ts"
Cohesion: 0.12
Nodes (3): execFileAsync, PinnedLocation, REPO_ROOT

### Community 46 - "obfuscation.ts"
Cohesion: 0.14
Nodes (14): DECODE_EXEC_FILES, evalAtobPattern, evalBufferPattern, maskDecodeExecDocumentation(), maskObfuscationExampleContext(), maskPowerShellStringsAndComments(), OBFS_BASE64_LARGE, OBFS_DECODE_EXEC (+6 more)

### Community 47 - "ref_node_url"
Cohesion: 0.14
Nodes (11): OBFUSCATION_RULES, ActionReference, COMPOSITE_ACTION, isRemoteAction(), readRemoteActionReferences(), REPO_ROOT, WORKFLOWS_DIR, __dirname (+3 more)

### Community 48 - "High-leverage fixes, ranked"
Cohesion: 0.13
Nodes (14): 2026-05-02 implementation results, 2. Split `vitest` into two projects + `--isolate=false` for unit tier — saves ~5 s more, 3. Disable `dts` in the dev build — saves ~700 ms per loop, 4. Make `tsc` incremental — saves ~1.5 s per loop (after first run), 5. Skip the `pnpm -r` wrapper on single-package scripts — saves ~1 s per loop, 6. Parallel verify script — collapses the remaining three steps, 7. Cheap wins inside `tsup.config.ts` for the dev build, 8. Consider the scanner itself (+6 more)

### Community 50 - "types.ts"
Cohesion: 0.20
Nodes (12): compareScannedSkillsByRisk(), compareString(), highestFindingSeverityRank(), SEVERITY_RANK, VERDICT_RANK, AgentDiscoveryCheckOptions, EnrichmentStatus, ScanMeta (+4 more)

### Community 51 - "feature_request.yml"
Cohesion: 0.15
Nodes (12): description, label, body, attributes, id, type, validations, description (+4 more)

### Community 52 - "fs-walk.ts"
Cohesion: 0.26
Nodes (12): isPluginTrashDir(), walk(), walk(), walk(), shouldSkipMarketplacePath(), descendantWindsurfRulesDirs(), walk(), ancestorsOf() (+4 more)

### Community 53 - "prompt-injection.ts"
Cohesion: 0.15
Nodes (12): exfilTriggerPattern, frontmatterSecrecyPattern, hiddenElementInstructionPattern, hiddenInstruction, hiddenStyle, PI_EXFIL_TRIGGER_CLAUSE, PI_HIDDEN_HTML_COMMENT, PI_HIDDEN_UNICODE (+4 more)

### Community 54 - "Your iteration protocol — follow exactly"
Cohesion: 0.15
Nodes (12): 1. Orient yourself (budget: ~5 tool calls max), 2. Pick ONE task, 3. Implement ONE task, not more, 4. Verify, 4b. Capture any new lesson, 5. Commit, 6. Check off the task, 7. Exit (+4 more)

### Community 55 - "specs/OUTPUT.md — exact output contracts"
Cohesion: 0.15
Nodes (12): Command invocation contract, Detail view — `skill-audit explain <skill>`, File output contract, Global scan ordering contract, HTML report (single file, no network), JSON output schema (contract — v1.0, stable), List output contract, Local LLM review output contract (+4 more)

### Community 56 - "parse.py"
Cohesion: 0.23
Nodes (4): add_days(), diff_days(), parse(), to_iso()

### Community 57 - "Reference"
Cohesion: 0.17
Nodes (12): Commands And Flags, Example Findings, FAQ, GitHub Action, JSON Output, Reference, Rules, Scoring (+4 more)

### Community 58 - "specs/RULES.md — exact patterns for each rule"
Cohesion: 0.17
Nodes (12): Agent hook and settings commands, Agent settings rules (project scope only), Allowlist behavior, Mandatory-fail overrides, MCP-PROJECT-AUTO-APPROVE (High), NET-API-ENDPOINT-OVERRIDE (Critical), NET-HOOK-HTTP-EXTERNAL (High, Critical with environment variables in headers), Rule intent and false-positive guardrails (+4 more)

### Community 59 - "action.yml"
Cohesion: 0.18
Nodes (10): author, branding, color, icon, description, name, outputs, verdict (+2 more)

### Community 60 - "updates"
Cohesion: 0.18
Nodes (10): npm-minor-patch, patterns, update-types, interval, updates, directory, groups, package-ecosystem (+2 more)

### Community 62 - "steps"
Cohesion: 0.20
Nodes (10): runs, steps, using, id, if, name, run, shell (+2 more)

### Community 63 - "skill-audit"
Cohesion: 0.20
Nodes (9): Commands (exact strings — use verbatim), Directory map, Identity, Never, Project gotchas (the things that burn time if you don't know), skill-audit, Tech stack, What "done" means for any task (+1 more)

### Community 64 - "kanban/kanban.py"
Cohesion: 0.33
Nodes (5): add(), list_cards(), _load(), move(), _save()

### Community 65 - "process.py"
Cohesion: 0.36
Nodes (7): col_sum(), dedup(), describe(), filter_rows(), head(), _read(), to_json()

### Community 66 - "AGENT.md — conventions for the `skill-audit` repo"
Cohesion: 0.20
Nodes (10): AGENT.md — conventions for the `skill-audit` repo, Build / test / lint commands, Commit style, Discovery and output invariants, Repo layout, Rule authoring conventions, Tech stack (do not drift), Testing conventions (+2 more)

### Community 67 - "Threat Model"
Cohesion: 0.20
Nodes (10): Allowlists And Ignores, Environment Variables, False Negatives, False Positives, GitHub Action Execution, Local Skill Contents, Network Access, Rule Updates (+2 more)

### Community 68 - "skill-audit MVP spec and implementation plan"
Cohesion: 0.20
Nodes (10): 1. Package and command names, 3. Discovery layer, 7. Core commands and UX flow, 8. Agent skill wrapper, Canonical install paths (from research, verified against official docs April 2026), Disambiguation, Name: **`skill-audit`**, Optional local LLM review (+2 more)

### Community 69 - "benign/package.json"
Cohesion: 0.22
Nodes (9): dependencies, commander@^11.0.0, commander, name, scripts, build, lint, test (+1 more)

### Community 71 - "allowlist/ignore.ts"
Cohesion: 0.53
Nodes (6): appendToIgnoreList(), getConfigDir(), getIgnoreListPath(), loadIgnoreList(), readIgnoreListContent(), runIgnore()

### Community 72 - "code-execution.ts"
Cohesion: 0.22
Nodes (8): CODE_EXECUTION_RULES, CODEEXEC_DESERIALIZE, CODEEXEC_JS_CHILDPROCESS_SHELL, CODEEXEC_JS_EVAL_FUNCTION, CODEEXEC_PY_EVAL, CODEEXEC_PY_OSSYS, CODEEXEC_SHELL_BACKTICK, newFunctionPattern

### Community 73 - "Critical patterns (implement these exactly)"
Cohesion: 0.22
Nodes (9): Critical patterns (implement these exactly), FS-CREDSTORE (Critical), NET-EXFIL-ENV (Critical), NET-WEBHOOK-KNOWN (Critical), PI-EXFIL-TRIGGER-CLAUSE (Critical), PI-HIDDEN-UNICODE (Critical), PI-OVERRIDE (Critical, high FPR risk — demoted on allowlist), SKILL-CURL-BASH-IN-MD (Critical) (+1 more)

### Community 74 - "malicious/package.json"
Cohesion: 0.25
Nodes (8): dependencies, commander@^11.0.0, commander, name, scripts, build, postinstall, version

### Community 75 - "AGENTS.md — entry point for any AI coding agent"
Cohesion: 0.25
Nodes (7): AGENTS.md — entry point for any AI coding agent, Build / test / lint commands (verbatim), graphify, Hard rules (loop-driver agnostic), Loop driver scripts, Read these in order, every session, Spec & task references

### Community 76 - "LESSONS.md — things the loop learned the hard way"
Cohesion: 0.25
Nodes (8): 1. Verification — "tests pass" is not "it works", 3. Identity & author metadata — never guess, 5. Orphans, cleanup, and the one-task-per-loop rule, 6. Loop hygiene, How to add a new lesson, LESSONS.md — things the loop learned the hard way, What does NOT belong here, update()

### Community 77 - "Changelog"
Cohesion: 0.25
Nodes (7): 0.1.0, 0.1.1, 0.1.2, 0.1.3, 0.2.0, 0.2.1, Changelog

### Community 79 - "inputs"
Cohesion: 0.29
Nodes (7): inputs, results-file, results-file, default, description, required, value

### Community 80 - "CONTRIBUTING.md"
Cohesion: 0.29
Nodes (3): Contributing, Development, Pull Requests

### Community 81 - "Examples"
Cohesion: 0.29
Nodes (6): CI, Examples, File Output, HTML Reports, JSON Output, Local Scan

### Community 82 - "Release Checklist"
Cohesion: 0.29
Nodes (7): Before Tagging, GitHub Release, Local Verification, Markdown Links And Paths, Release Checklist, Tagging, Trusted Publishing And Provenance

### Community 83 - "skill-audit — Claude Code Skill"
Cohesion: 0.29
Nodes (6): Install, Requirements, skill-audit — Claude Code Skill, Source, Usage, What it does

### Community 84 - "format.py"
Cohesion: 0.52
Nodes (4): fix(), generate_toc(), _lines(), lint()

### Community 85 - "ref_fs"
Cohesion: 0.29
Nodes (3): data, fs, fs

### Community 86 - "5. Cloud enrichment layer"
Cohesion: 0.29
Nodes (7): 5. Cloud enrichment layer, Caching strategy, Enrichment contract verification, Graceful degradation, Tier-1 enrichment calls (disabled design notes, 5s timeout, fail-silent), Tier-2 enrichment (opt-in via flags), ToS posture

### Community 88 - "env"
Cohesion: 0.33
Nodes (6): SA_AGENT, SA_ARGS, SA_FAIL_ON, SA_RESULTS_FILE, SA_VERSION, env

### Community 89 - "contact_links"
Cohesion: 0.33
Nodes (5): blank_issues_enabled, contact_links, about, name, url

### Community 90 - "security-education.ts"
Cohesion: 0.53
Nodes (5): isLikelySecurityEducationSkill(), readIfExists(), readSkillContext(), SECURITY_EDUCATION_CONTEXT_RULE_ID, stringifyMetadata()

### Community 91 - ".ralph/fix_plan.md — skill-audit task list"
Cohesion: 0.33
Nodes (5): Blockers, Decisions made during implementation, Dependencies added, Pending tasks, .ralph/fix_plan.md — skill-audit task list

### Community 92 - "6. Output and UX layer"
Cohesion: 0.33
Nodes (6): 6. Output and UX layer, Detail view — `skill-audit explain <skill>`, Example table output, HTML report — `--html [out.html]`, JSON schema (contract — stable from v0.1), Output modes

### Community 97 - "PULL_REQUEST_TEMPLATE.md"
Cohesion: 0.40
Nodes (4): Checklist, CLI Smoke Output, Summary, Tests Run

### Community 100 - "pnpm-workspace.yaml"
Cohesion: 0.40
Nodes (4): allowBuilds, esbuild, packages, pmOnFail

### Community 102 - "specs/ — source of truth"
Cohesion: 0.40
Nodes (4): Output format quick reference, Rule-authoring quick reference, Section index (for Ralph), specs/ — source of truth

### Community 103 - "2. Architecture and tech stack"
Cohesion: 0.40
Nodes (5): 2. Architecture and tech stack, Build and tooling, Directory layout, Distribution, Language: **TypeScript on Node.js 22+**

### Community 104 - "4. Local static analysis layer"
Cohesion: 0.40
Nodes (5): 4. Local static analysis layer, Highest-signal rules (illustrative examples), Performance budget (enforced), Rule taxonomy (50 rules, shipping at MVP), Scoring methodology

### Community 107 - "PI-JAILBREAK/benign/SKILL.md"
Cohesion: 0.40
Nodes (4): Build troubleshooting, Discord setup, Jailbreak assessment notes, SOC2 classification

### Community 108 - "PI-OVERRIDE/benign/SKILL.md"
Cohesion: 0.40
Nodes (4): Grader example, Role-change planning notes, Security documentation example, Skill persona

### Community 109 - "agent"
Cohesion: 0.50
Nodes (4): default, description, required, agent

### Community 110 - "args"
Cohesion: 0.50
Nodes (4): default, description, required, args

### Community 111 - "fail-on"
Cohesion: 0.50
Nodes (4): default, description, required, fail-on

### Community 112 - "path"
Cohesion: 0.50
Nodes (4): path, default, description, required

### Community 113 - "upload-results"
Cohesion: 0.50
Nodes (4): upload-results, default, description, required

### Community 114 - "version"
Cohesion: 0.50
Nodes (4): version, default, description, required

### Community 115 - "with"
Cohesion: 0.50
Nodes (4): with, if-no-files-found, name, path

### Community 117 - "Security Policy"
Cohesion: 0.50
Nodes (4): Reporting a Vulnerability, Scanner Scope, Security Policy, Supported Versions

### Community 118 - "filesystem"
Cohesion: 0.50
Nodes (3): npx, @modelcontextprotocol/server-filesystem, filesystem

### Community 123 - "cleanup.js"
Cohesion: 0.50
Nodes (3): fs, os, path

### Community 124 - "PI-METADATA-MISMATCH/benign/SKILL.md"
Cohesion: 0.50
Nodes (3): Data handling, User messaging, Writing guidance

### Community 125 - "Data Downloader Skill"
Cohesion: 0.50
Nodes (3): Attack examples, Data Downloader Skill, Usage

## Knowledge Gaps
- **7 isolated node(s):** `npx`, `@modelcontextprotocol/server-filesystem`, `python`, `bash`, `bash` (+2 more)
  These have ≤1 connection - possible missing edges or undocumented components. (Counts symbols only; 1206 node(s) total have ≤1 connection when file, concept and rationale nodes are included.)
- **179 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `skill-audit MVP spec and implementation plan` connect `skill-audit MVP spec and implementation plan` to `2. Architecture and tech stack`, `4. Local static analysis layer`, `CONTRIBUTING.md`, `5. Cloud enrichment layer`, `6. Output and UX layer`?**
  _High betweenness centrality (0.079) - this node is a cross-community bridge._
- **Are the 3 inferred relationships involving `Skill` (e.g. with `2. Discovery & spec-reading — disambiguate depth explicitly` and `Pending tasks`) actually correct?**
  _`Skill` has 3 INFERRED edges - model-reasoned connections that need verification._
- **What connects `npx`, `@modelcontextprotocol/server-filesystem`, `python` to the rest of the system?**
  _7 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `summary.ts` be split into smaller, more focused modules?**
  _Cohesion score 0.05446727185857621 - nodes in this community are weakly interconnected._
- **Why does `LESSONS.md — things the loop learned the hard way` connect `LESSONS.md — things the loop learned the hard way` to `CONTRIBUTING.md`, `summary.ts`, `explain.test.ts`, `discovery/index.ts`?**
  _High betweenness centrality (0.068) - this node is a cross-community bridge._
- **Should `enrich/index.ts` be split into smaller, more focused modules?**
  _Cohesion score 0.05030864197530864 - nodes in this community are weakly interconnected._
- **Why does `6. Output and UX layer` connect `6. Output and UX layer` to `skill-audit MVP spec and implementation plan`?**
  _High betweenness centrality (0.066) - this node is a cross-community bridge._