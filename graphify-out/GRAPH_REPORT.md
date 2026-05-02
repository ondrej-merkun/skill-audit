# Graph Report - skillaudit  (2026-05-02)

## Corpus Check
- 151 files · ~88,522 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 808 nodes · 1251 edges · 39 communities detected
- Extraction: 88% EXTRACTED · 12% INFERRED · 0% AMBIGUOUS · INFERRED: 150 edges (avg confidence: 0.8)
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
- [[_COMMUNITY_Community 22|Community 22]]
- [[_COMMUNITY_Community 23|Community 23]]
- [[_COMMUNITY_Community 24|Community 24]]
- [[_COMMUNITY_Community 25|Community 25]]
- [[_COMMUNITY_Community 26|Community 26]]
- [[_COMMUNITY_Community 27|Community 27]]
- [[_COMMUNITY_Community 28|Community 28]]
- [[_COMMUNITY_Community 29|Community 29]]
- [[_COMMUNITY_Community 30|Community 30]]
- [[_COMMUNITY_Community 32|Community 32]]
- [[_COMMUNITY_Community 33|Community 33]]
- [[_COMMUNITY_Community 34|Community 34]]
- [[_COMMUNITY_Community 36|Community 36]]
- [[_COMMUNITY_Community 37|Community 37]]
- [[_COMMUNITY_Community 38|Community 38]]
- [[_COMMUNITY_Community 42|Community 42]]
- [[_COMMUNITY_Community 53|Community 53]]

## God Nodes (most connected - your core abstractions)
1. `runScan()` - 22 edges
2. `trim()` - 19 edges
3. `readFile()` - 18 edges
4. `parse()` - 15 edges
5. `renderTableToString()` - 13 edges
6. `runExplain()` - 13 edges
7. `renderSummaryFooter()` - 12 edges
8. `specs/OUTPUT.md — exact output contracts` - 12 edges
9. `resolveGitHubSlug()` - 11 edges
10. `Reference` - 11 edges

## Surprising Connections (you probably didn't know these)
- `fetchImpl()` --calls--> `checkOpenAiCompatibleConnection()`  [INFERRED]
  test/scan-options.test.ts → packages/cli/src/llm/openai-compatible.ts
- `readFile()` --calls--> `readIgnoreListContent()`  [INFERRED]
  test/fixtures/malicious/remote-import-skill/utils.js → packages/cli/src/allowlist/ignore.ts
- `readFile()` --calls--> `discoverMcpJson()`  [INFERRED]
  test/fixtures/malicious/remote-import-skill/utils.js → packages/cli/src/discovery/cursor.ts
- `readFile()` --calls--> `discoverExtensionManifests()`  [INFERRED]
  test/fixtures/malicious/remote-import-skill/utils.js → packages/cli/src/discovery/gemini.ts
- `readFile()` --calls--> `discoverMcpJson()`  [INFERRED]
  test/fixtures/malicious/remote-import-skill/utils.js → packages/cli/src/discovery/gemini.ts

## Hyperedges (group relationships)
- **Ralph-loop performance audit Structure** — perf_ralph_loop_ralph_loop_performance_audit, perf_ralph_loop_ralph_loop_performance_audit_350839a4, perf_ralph_loop_baseline_per_iteration_what_ralph_pays_each_loop, perf_ralph_loop_per_test_e2e_breakdown_vitest_run_test_e2e_test_ts_reporter_verbose, perf_ralph_loop_high_leverage_fixes_ranked, perf_ralph_loop_1_move_the_two_10_skill_e2e_cases_out_of_e2e_saves_45_s_per_loop, perf_ralph_loop_2_split_vitest_into_two_projects_isolate_false_for_unit_tier_saves_5_s_more, perf_ralph_loop_3_disable_dts_in_the_dev_build_saves_700_ms_per_loop, perf_ralph_loop_4_make_tsc_incremental_saves_1_5_s_per_loop_after_first_run, perf_ralph_loop_5_skip_the_pnpm_r_wrapper_on_single_package_scripts_saves_1_s_per_loop, perf_ralph_loop_6_parallel_verify_script_collapses_the_remaining_three_steps, perf_ralph_loop_7_cheap_wins_inside_tsup_config_ts_for_the_dev_build, perf_ralph_loop_8_consider_the_scanner_itself [EXTRACTED 1.00]
- **Examples Structure** — examples_examples, examples_examples_0e96da23, examples_local_scan, examples_json_output, examples_file_output, examples_html_reports, examples_offline_scanning, examples_explain_one_skill, examples_ci [EXTRACTED 1.00]
- **Release Checklist Structure** — release_checklist_release_checklist, release_checklist_release_checklist_b16a23bf, release_checklist_before_tagging, release_checklist_local_verification, release_checklist_markdown_links_and_paths, release_checklist_trusted_publishing_and_provenance, release_checklist_tagging [EXTRACTED 1.00]
- **Reference Structure** — reference_reference, reference_reference_c9cbd138, reference_what_it_scans, reference_where_it_fits, reference_commands_and_flags, reference_what_leaves_the_machine, reference_example_findings, reference_scoring, reference_rules, reference_json_output, reference_use_in_ci, reference_github_action, reference_faq [EXTRACTED 1.00]
- **Threat Model Structure** — threat_model_threat_model, threat_model_threat_model_7be01c0a, threat_model_scope, threat_model_local_skill_contents, threat_model_environment_variables, threat_model_network_enrichment, threat_model_rule_updates, threat_model_allowlists_and_ignores, threat_model_github_action_execution, threat_model_false_positives, threat_model_false_negatives [EXTRACTED 1.00]
- **Roadmap Structure** — roadmap_roadmap, roadmap_roadmap_ced12cd0, roadmap_committed_near_term_work, roadmap_candidate_ideas, roadmap_contribution_fit [EXTRACTED 1.00]
- **Skillaudit: a weekend plan for a local-first agent-skill scanner Structure** — spec_skillaudit_a_weekend_plan_for_a_local_first_agent_skill_scanner, spec_skillaudit_a_weekend_plan_for_a_local_first_agent_skill_scanner_59a94325, spec_section_1_competitive_landscape_and_prior_art, spec_what_actually_exists_today, spec_the_competitive_map, spec_the_critical_positioning_gap, spec_what_cloud_enrichment_apis_are_actually_usable, spec_the_launch_number_is_real_and_citable, spec_what_made_comparable_tools_go_viral, spec_section_2_mvp_spec_and_implementation_plan, spec_1_name_and_positioning, spec_name_skill_audit, spec_tagline [EXTRACTED 1.00]
- **specs/DISCOVERY.md — canonical install paths Structure** — discovery_specs_discovery_md_canonical_install_paths, discovery_specs_discovery_md_canonical_install_paths_0eb6a8d7, discovery_implemented_discovery_set_keep_this_accurate, discovery_1_claude_code, discovery_2_cursor, discovery_3_github_copilot, discovery_4_cross_agent_agents_md_sweep, discovery_5_openai_codex, discovery_6_gemini_cli, discovery_disambiguation_rules, discovery_path_expansion, discovery_permissions, discovery_tests [EXTRACTED 1.00]
- **specs/RULES.md — exact patterns for each rule Structure** — rules_specs_rules_md_exact_patterns_for_each_rule, rules_specs_rules_md_exact_patterns_for_each_rule_bcf903aa, rules_rule_intent_and_false_positive_guardrails, rules_severity_weight, rules_mandatory_fail_overrides, rules_critical_patterns_implement_these_exactly, rules_net_exfil_env_critical, rules_pi_exfil_trigger_clause_critical, rules_pi_hidden_unicode_critical, rules_pi_override_critical_high_fpr_risk_demoted_on_allowlist, rules_skill_curl_bash_in_md_critical, rules_skill_password_zip_critical, rules_fs_credstore_critical [EXTRACTED 1.00]
- **specs/ — source of truth Structure** — readme_specs_source_of_truth, readme_specs_source_of_truth_d42d326a, readme_section_index_for_ralph, readme_rule_authoring_quick_reference, readme_output_format_quick_reference [EXTRACTED 1.00]
- **specs/OUTPUT.md — exact output contracts Structure** — output_specs_output_md_exact_output_contracts, output_specs_output_md_exact_output_contracts_d0007201, output_json_output_schema_contract_v1_0_stable, output_global_scan_ordering_contract, output_command_invocation_contract, output_list_output_contract, output_scan_marketplace_output_contract, output_local_llm_review_output_contract, output_visible_data_contract, output_file_output_contract, output_tui_hero_table_brand_asset, output_detail_view_skill_audit_explain_skill, output_html_report_single_file_no_network [EXTRACTED 1.00]
- **skill-audit — Claude Code Skill Structure** — readme_skill_audit_claude_code_skill, readme_skill_audit_claude_code_skill_e4eb1ddd, readme_install, readme_usage, readme_what_it_does, readme_requirements, readme_source [EXTRACTED 1.00]

## Communities

### Community 0 - "Community 0"
Cohesion: 0.05
Nodes (42): discoverAgentEntries(), discoverCommandFiles(), discoverMcpFromClaudeJson(), discoverPluginTree(), discoverSkillDirs(), makeId(), pathSegments(), skillFromDir() (+34 more)

### Community 1 - "Community 1"
Cohesion: 0.06
Nodes (43): appendToIgnoreList(), getConfigDir(), getIgnoreListPath(), getLegacyIgnoreListPath(), loadIgnoreList(), readIgnoreListContent(), renderDetail(), renderEnrichment() (+35 more)

### Community 2 - "Community 2"
Cohesion: 0.07
Nodes (39): escapeHtml(), redactPaths(), renderEnrichmentCells(), renderHtml(), renderLlmOverview(), scoreRingSvg(), verdictColor(), installStateLabel() (+31 more)

### Community 3 - "Community 3"
Cohesion: 0.09
Nodes (41): cacheDir(), cacheGet(), cacheKey(), cacheSet(), legacyCacheDir(), depsDevSystem(), enrichDepsDev(), fetchDependencyLookup() (+33 more)

### Community 4 - "Community 4"
Cohesion: 0.07
Nodes (12): basenameOf(), extensionOf(), isMarkdownPromptFile(), isStringPrefixChar(), maskDocumentationExampleContext(), maskDocumentationTextInCode(), maskJavaScriptStringsAndComments(), maskMarkdownSecurityEducationContext() (+4 more)

### Community 5 - "Community 5"
Cohesion: 0.07
Nodes (14): executeHtmlReportScript(), FakeClassList, FakeDocument, FakeElement, FakeEvent, FakeTextNode, getFilter(), getRow() (+6 more)

### Community 6 - "Community 6"
Cohesion: 0.08
Nodes (26): convert(), extract_audio(), Thin wrapper around the local ffmpeg binary for common media operations., _run(), thumbnail(), trim(), buildLlmReviewMessages(), buildLlmReviewPayload() (+18 more)

### Community 7 - "Community 7"
Cohesion: 0.06
Nodes (36): 1. Name and positioning, 2. Architecture and tech stack, 3. Discovery layer, 4. Local static analysis layer, 5. Cloud enrichment layer, 6. Output and UX layer — this is where we win, 7. Core commands and UX flow, 8. Claude Code skill wrapper (+28 more)

### Community 8 - "Community 8"
Cohesion: 0.12
Nodes (21): parseOptionalPositiveInteger(), runLlmAdd(), runLlmCheck(), runLlmList(), serializeHealth(), addLlmConfig(), getConfigDir(), getLlmConfigPath() (+13 more)

### Community 9 - "Community 9"
Cohesion: 0.1
Nodes (10): extractSnippet(), hasNestedQuantifier(), isNestedScanRoot(), isPromptBearingCommandOrAgentDir(), isSafeRegexInput(), lineCol(), runPatternWithTimeout(), runRules() (+2 more)

### Community 10 - "Community 10"
Cohesion: 0.14
Nodes (19): add_days(), diff_days(), parse(), Date parsing and formatting utilities — pure stdlib., to_iso(), discoverMcpJson(), discoverAgentMarkdownFiles(), discoverCommandTomlFiles() (+11 more)

### Community 11 - "Community 11"
Cohesion: 0.08
Nodes (25): 10. MVP scope, 11. Risk assessment, 9. Go-to-market and viral strategy, Competitive risk, False-positive risk, Final call-to-action checklist, Hero GIF storyboard 5 seconds, looped, HN launch (+17 more)

### Community 12 - "Community 12"
Cohesion: 0.15
Nodes (18): col_sum(), dedup(), describe(), filter_rows(), head(), CSV data processing helpers — pure stdlib., _read(), to_json() (+10 more)

### Community 13 - "Community 13"
Cohesion: 0.11
Nodes (15): Allowlist Maintenance, Allowlist Maintenance, Commands And Flags, Example Findings, FAQ, GitHub Action, JSON Output, Reference (+7 more)

### Community 14 - "Community 14"
Cohesion: 0.12
Nodes (10): npm package settings, Publishing, Publishing, Before Tagging, Local Verification, Markdown Links And Paths, Release Checklist, Release Checklist (+2 more)

### Community 15 - "Community 15"
Cohesion: 0.13
Nodes (15): 1. Move the two "10-skill" e2e cases out of e2e — saves ~45 s per loop, 2. Split vitest into two projects + --isolate=false for unit tier — saves ~5 s more, 3. Disable dts in the dev build — saves ~700 ms per loop, 4. Make tsc incremental — saves ~1.5 s per loop after first run, 5. Skip the pnpm -r wrapper on single-package scripts — saves ~1 s per loop, 6. Parallel verify script — collapses the remaining three steps, 7. Cheap wins inside tsup.config.ts for the dev build, 8. Consider the scanner itself (+7 more)

### Community 16 - "Community 16"
Cohesion: 0.13
Nodes (15): Allowlist behavior, Critical patterns implement these exactly, FS-CREDSTORE Critical, Mandatory-fail overrides, NET-EXFIL-ENV Critical, PI-EXFIL-TRIGGER-CLAUSE Critical, PI-HIDDEN-UNICODE Critical, PI-OVERRIDE Critical, high FPR risk — demoted on allowlist (+7 more)

### Community 17 - "Community 17"
Cohesion: 0.15
Nodes (13): 1. Claude Code, 2. Cursor, 3. GitHub Copilot, 4. Cross-agent AGENTS.md sweep, 5. OpenAI Codex, 6. Gemini CLI, Disambiguation rules, Implemented discovery set keep this accurate (+5 more)

### Community 18 - "Community 18"
Cohesion: 0.15
Nodes (13): Command invocation contract, Detail view — skill-audit explain <skill>, File output contract, Global scan ordering contract, HTML report single file, no network, JSON output schema contract — v1.0, stable, List output contract, Local LLM review output contract (+5 more)

### Community 19 - "Community 19"
Cohesion: 0.18
Nodes (11): Allowlists And Ignores, Environment Variables, False Negatives, False Positives, GitHub Action Execution, Local Skill Contents, Network Enrichment, Rule Updates (+3 more)

### Community 20 - "Community 20"
Cohesion: 0.22
Nodes (9): CI, Examples, Examples, Explain One Skill, File Output, HTML Reports, JSON Output, Local Scan (+1 more)

### Community 21 - "Community 21"
Cohesion: 0.43
Nodes (7): container_logs(), _docker(), list_containers(), prune(), Local Docker management helpers — wraps the docker CLI., stats(), stop_all()

### Community 22 - "Community 22"
Cohesion: 0.29
Nodes (6): eval_expr(), import_module(), Dynamically import a module by name., Evaluate arbitrary Python expression., Execute arbitrary Python code block., run_snippet()

### Community 23 - "Community 23"
Cohesion: 0.29
Nodes (7): Install, Requirements, skill-audit — Claude Code Skill, skill-audit — Claude Code Skill, Source, Usage, What it does

### Community 24 - "Community 24"
Cohesion: 0.4
Nodes (3): _detect_runner(), Test runner helper — autodetects framework and runs tests., run_tests()

### Community 25 - "Community 25"
Cohesion: 0.33
Nodes (1): JSON syntax checking and schema validation helpers.

### Community 26 - "Community 26"
Cohesion: 0.47
Nodes (4): generate_toc(), _lines(), lint(), Markdown linting and auto-formatting helpers.

### Community 27 - "Community 27"
Cohesion: 0.33
Nodes (5): Candidate Ideas, Committed Near-Term Work, Contribution Fit, Roadmap, Roadmap

### Community 28 - "Community 28"
Cohesion: 0.4
Nodes (1): Git workflow helper — generates branch names and commit messages.

### Community 29 - "Community 29"
Cohesion: 0.4
Nodes (1): Extract text and tables from PDF files.

### Community 30 - "Community 30"
Cohesion: 0.4
Nodes (5): Output format quick reference, Rule-authoring quick reference, Section index for Ralph, specs/ — source of truth, specs/ — source of truth

### Community 32 - "Community 32"
Cohesion: 0.67
Nodes (2): list_buckets(), _load_creds()

### Community 33 - "Community 33"
Cohesion: 1.0
Nodes (2): notify_build(), notify_deploy()

### Community 34 - "Community 34"
Cohesion: 1.0
Nodes (2): add_task(), list_tasks()

### Community 36 - "Community 36"
Cohesion: 0.67
Nodes (3): Repository social preview, Repository social preview, Upload steps

### Community 37 - "Community 37"
Cohesion: 0.67
Nodes (3): Commands, skill-audit, skill-audit

### Community 38 - "Community 38"
Cohesion: 0.67
Nodes (3): 0.1.0, Changelog, Changelog

### Community 42 - "Community 42"
Cohesion: 1.0
Nodes (1): Benign scanner fixture catalog.  This file stores quoted payload examples for ru

### Community 53 - "Community 53"
Cohesion: 1.0
Nodes (2): skill-audit, skill-audit

## Knowledge Gaps
- **164 isolated node(s):** `Evaluate arbitrary Python expression.`, `Execute arbitrary Python code block.`, `Dynamically import a module by name.`, `Benign scanner fixture catalog.  This file stores quoted payload examples for ru`, `Test runner helper — autodetects framework and runs tests.` (+159 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **Thin community `Community 25`** (6 nodes): `check_syntax()`, `minify()`, `pretty()`, `JSON syntax checking and schema validation helpers.`, `validate_schema()`, `validate.py`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 28`** (5 nodes): `Git workflow helper — generates branch names and commit messages.`, `recent_commits()`, `staged_summary()`, `suggest_branch()`, `suggest.py`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 29`** (5 nodes): `extract_tables()`, `extract_text()`, `get_metadata()`, `Extract text and tables from PDF files.`, `extractor.py`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 32`** (4 nodes): `list_buckets()`, `_load_creds()`, `upload_file()`, `aws_ops.py`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 33`** (3 nodes): `notify.py`, `notify_build()`, `notify_deploy()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 34`** (3 nodes): `kanban.py`, `add_task()`, `list_tasks()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 42`** (2 nodes): `Benign scanner fixture catalog.  This file stores quoted payload examples for ru`, `sample_payloads.py`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 53`** (2 nodes): `skill-audit`, `skill-audit`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `add()` connect `Community 12` to `Community 0`, `Community 1`, `Community 9`?**
  _High betweenness centrality (0.022) - this node is a cross-community bridge._
- **Why does `trim()` connect `Community 6` to `Community 0`, `Community 1`, `Community 3`, `Community 8`, `Community 9`?**
  _High betweenness centrality (0.020) - this node is a cross-community bridge._
- **Why does `parse()` connect `Community 10` to `Community 0`, `Community 8`, `Community 3`, `Community 6`?**
  _High betweenness centrality (0.012) - this node is a cross-community bridge._
- **Are the 13 inferred relationships involving `runScan()` (e.g. with `clearPlugins()` and `initDefaultPlugins()`) actually correct?**
  _`runScan()` has 13 INFERRED edges - model-reasoned connections that need verification._
- **Are the 17 inferred relationships involving `trim()` (e.g. with `minify()` and `extractGitHubSlugFromUrl()`) actually correct?**
  _`trim()` has 17 INFERRED edges - model-reasoned connections that need verification._
- **Are the 17 inferred relationships involving `readFile()` (e.g. with `runCli()` and `fixture()`) actually correct?**
  _`readFile()` has 17 INFERRED edges - model-reasoned connections that need verification._
- **Are the 11 inferred relationships involving `parse()` (e.g. with `fetchImpl()` and `parseJson()`) actually correct?**
  _`parse()` has 11 INFERRED edges - model-reasoned connections that need verification._