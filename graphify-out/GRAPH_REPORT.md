# Graph Report - /tmp/skillaudit-graphify-corpus  (2026-04-28)

## Corpus Check
- Corpus is ~42,717 words - fits in a single context window. You may not need a graph.

## Summary
- 531 nodes · 896 edges · 28 communities detected
- Extraction: 89% EXTRACTED · 11% INFERRED · 0% AMBIGUOUS · INFERRED: 96 edges (avg confidence: 0.8)
- Token cost: 0 input · 0 output

## Community Hubs (Navigation)
- [[_COMMUNITY_CLI Commands|CLI Commands]]
- [[_COMMUNITY_Report Rendering|Report Rendering]]
- [[_COMMUNITY_Enrichment Cache|Enrichment Cache]]
- [[_COMMUNITY_Claude Discovery|Claude Discovery]]
- [[_COMMUNITY_Product Specification|Product Specification]]
- [[_COMMUNITY_Codex Discovery|Codex Discovery]]
- [[_COMMUNITY_Rule Masking|Rule Masking]]
- [[_COMMUNITY_LLM Config|LLM Config]]
- [[_COMMUNITY_Roadmap Marketing|Roadmap Marketing]]
- [[_COMMUNITY_Reference Docs|Reference Docs]]
- [[_COMMUNITY_Release Publishing|Release Publishing]]
- [[_COMMUNITY_Gemini Discovery|Gemini Discovery]]
- [[_COMMUNITY_LLM Review|LLM Review]]
- [[_COMMUNITY_Performance Loop|Performance Loop]]
- [[_COMMUNITY_Rule Catalog|Rule Catalog]]
- [[_COMMUNITY_Discovery Spec|Discovery Spec]]
- [[_COMMUNITY_Output Contracts|Output Contracts]]
- [[_COMMUNITY_Rule Engine|Rule Engine]]
- [[_COMMUNITY_Threat Model|Threat Model]]
- [[_COMMUNITY_Usage Examples|Usage Examples]]
- [[_COMMUNITY_Ignore List|Ignore List]]
- [[_COMMUNITY_Skill Wrapper|Skill Wrapper]]
- [[_COMMUNITY_Roadmap Queue|Roadmap Queue]]
- [[_COMMUNITY_Spec Index|Spec Index]]
- [[_COMMUNITY_Social Preview|Social Preview]]
- [[_COMMUNITY_CLI Package|CLI Package]]
- [[_COMMUNITY_Package Changelog|Package Changelog]]
- [[_COMMUNITY_Project Identity|Project Identity]]

## God Nodes (most connected - your core abstractions)
1. `runScan()` - 22 edges
2. `renderTableToString()` - 13 edges
3. `runExplain()` - 13 edges
4. `renderSummaryFooter()` - 12 edges
5. `specs/OUTPUT.md — exact output contracts` - 12 edges
6. `Reference` - 11 edges
7. `resolveGitHubSlug()` - 10 edges
8. `runList()` - 10 edges
9. `Threat Model` - 10 edges
10. `computeTreeSha256()` - 9 edges

## Surprising Connections (you probably didn't know these)
- `runScan()` --calls--> `calculateCompromisedPercent()`  [INFERRED]
  src/commands/scan.ts → src/percent.ts
- `renderTableToString()` --calls--> `formatAgentName()`  [INFERRED]
  src/output/table.ts → src/agent-names.ts
- `runScan()` --calls--> `enrichAllWithOutcomes()`  [INFERRED]
  src/commands/scan.ts → src/enrich/index.ts
- `runIgnore()` --calls--> `loadIgnoreList()`  [INFERRED]
  src/commands/ignore.ts → src/allowlist/ignore.ts
- `runScan()` --calls--> `loadIgnoreList()`  [INFERRED]
  src/commands/scan.ts → src/allowlist/ignore.ts

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

### Community 0 - "CLI Commands"
Cohesion: 0.06
Nodes (45): renderDetail(), renderEnrichment(), renderFinding(), runExplain(), shortenPath(), runIgnore(), runList(), shortenPath() (+37 more)

### Community 1 - "Report Rendering"
Cohesion: 0.07
Nodes (39): escapeHtml(), redactPaths(), renderEnrichmentCells(), renderHtml(), renderLlmOverview(), scoreRingSvg(), verdictColor(), installStateLabel() (+31 more)

### Community 2 - "Enrichment Cache"
Cohesion: 0.11
Nodes (36): cacheDir(), cacheGet(), cacheKey(), cacheSet(), legacyCacheDir(), depsDevSystem(), enrichDepsDev(), fetchDependencyLookup() (+28 more)

### Community 3 - "Claude Discovery"
Cohesion: 0.08
Nodes (20): discoverAgentEntries(), discoverCommandFiles(), discoverMcpFromClaudeJson(), discoverPluginTree(), discoverSkillDirs(), makeId(), pathSegments(), skillFromDir() (+12 more)

### Community 4 - "Product Specification"
Cohesion: 0.06
Nodes (36): 1. Name and positioning, 2. Architecture and tech stack, 3. Discovery layer, 4. Local static analysis layer, 5. Cloud enrichment layer, 6. Output and UX layer — this is where we win, 7. Core commands and UX flow, 8. Claude Code skill wrapper (+28 more)

### Community 5 - "Codex Discovery"
Cohesion: 0.15
Nodes (20): discoverActivePluginPayloadTree(), discoverAgentFiles(), discoverEnabledPluginCaches(), discoverMcpToml(), discoverPluginTree(), discoverSkillDirs(), discoverUntrustedProjectConfig(), makeId() (+12 more)

### Community 6 - "Rule Masking"
Cohesion: 0.15
Nodes (12): basenameOf(), extensionOf(), isMarkdownPromptFile(), isStringPrefixChar(), maskDocumentationExampleContext(), maskDocumentationTextInCode(), maskJavaScriptStringsAndComments(), maskMarkdownSecurityEducationContext() (+4 more)

### Community 7 - "LLM Config"
Cohesion: 0.16
Nodes (21): parseOptionalPositiveInteger(), runLlmAdd(), runLlmCheck(), runLlmList(), serializeHealth(), addLlmConfig(), getConfigDir(), getLlmConfigPath() (+13 more)

### Community 8 - "Roadmap Marketing"
Cohesion: 0.08
Nodes (25): 10. MVP scope, 11. Risk assessment, 9. Go-to-market and viral strategy, Competitive risk, False-positive risk, Final call-to-action checklist, Hero GIF storyboard 5 seconds, looped, HN launch (+17 more)

### Community 9 - "Reference Docs"
Cohesion: 0.11
Nodes (15): Allowlist Maintenance, Allowlist Maintenance, Commands And Flags, Example Findings, FAQ, GitHub Action, JSON Output, Reference (+7 more)

### Community 10 - "Release Publishing"
Cohesion: 0.12
Nodes (10): npm package settings, Publishing, Publishing, Before Tagging, Local Verification, Markdown Links And Paths, Release Checklist, Release Checklist (+2 more)

### Community 11 - "Gemini Discovery"
Cohesion: 0.26
Nodes (12): discoverAgentMarkdownFiles(), discoverCommandTomlFiles(), discoverExtensionManifests(), discoverMcpJson(), isRecord(), makeId(), missingPathWarnings(), namesFromUnknown() (+4 more)

### Community 12 - "LLM Review"
Cohesion: 0.26
Nodes (13): buildLlmReviewMessages(), buildLlmReviewPayload(), contextCharBudget(), readFindingSnippet(), redactSecrets(), relativeFindingFile(), chatCompletionsUrl(), isAbortError() (+5 more)

### Community 13 - "Performance Loop"
Cohesion: 0.13
Nodes (15): 1. Move the two "10-skill" e2e cases out of e2e — saves ~45 s per loop, 2. Split vitest into two projects + --isolate=false for unit tier — saves ~5 s more, 3. Disable dts in the dev build — saves ~700 ms per loop, 4. Make tsc incremental — saves ~1.5 s per loop after first run, 5. Skip the pnpm -r wrapper on single-package scripts — saves ~1 s per loop, 6. Parallel verify script — collapses the remaining three steps, 7. Cheap wins inside tsup.config.ts for the dev build, 8. Consider the scanner itself (+7 more)

### Community 14 - "Rule Catalog"
Cohesion: 0.13
Nodes (15): Allowlist behavior, Critical patterns implement these exactly, FS-CREDSTORE Critical, Mandatory-fail overrides, NET-EXFIL-ENV Critical, PI-EXFIL-TRIGGER-CLAUSE Critical, PI-HIDDEN-UNICODE Critical, PI-OVERRIDE Critical, high FPR risk — demoted on allowlist (+7 more)

### Community 15 - "Discovery Spec"
Cohesion: 0.15
Nodes (13): 1. Claude Code, 2. Cursor, 3. GitHub Copilot, 4. Cross-agent AGENTS.md sweep, 5. OpenAI Codex, 6. Gemini CLI, Disambiguation rules, Implemented discovery set keep this accurate (+5 more)

### Community 16 - "Output Contracts"
Cohesion: 0.15
Nodes (13): Command invocation contract, Detail view — skill-audit explain <skill>, File output contract, Global scan ordering contract, HTML report single file, no network, JSON output schema contract — v1.0, stable, List output contract, Local LLM review output contract (+5 more)

### Community 17 - "Rule Engine"
Cohesion: 0.35
Nodes (9): extractSnippet(), hasNestedQuantifier(), isNestedScanRoot(), isPromptBearingCommandOrAgentDir(), isSafeRegexInput(), lineCol(), runPatternWithTimeout(), runRules() (+1 more)

### Community 18 - "Threat Model"
Cohesion: 0.18
Nodes (11): Allowlists And Ignores, Environment Variables, False Negatives, False Positives, GitHub Action Execution, Local Skill Contents, Network Enrichment, Rule Updates (+3 more)

### Community 19 - "Usage Examples"
Cohesion: 0.22
Nodes (9): CI, Examples, Examples, Explain One Skill, File Output, HTML Reports, JSON Output, Local Scan (+1 more)

### Community 20 - "Ignore List"
Cohesion: 0.57
Nodes (6): appendToIgnoreList(), getConfigDir(), getIgnoreListPath(), getLegacyIgnoreListPath(), loadIgnoreList(), readIgnoreListContent()

### Community 21 - "Skill Wrapper"
Cohesion: 0.29
Nodes (7): Install, Requirements, skill-audit — Claude Code Skill, skill-audit — Claude Code Skill, Source, Usage, What it does

### Community 22 - "Roadmap Queue"
Cohesion: 0.33
Nodes (5): Candidate Ideas, Committed Near-Term Work, Contribution Fit, Roadmap, Roadmap

### Community 23 - "Spec Index"
Cohesion: 0.4
Nodes (5): Output format quick reference, Rule-authoring quick reference, Section index for Ralph, specs/ — source of truth, specs/ — source of truth

### Community 24 - "Social Preview"
Cohesion: 0.67
Nodes (3): Repository social preview, Repository social preview, Upload steps

### Community 25 - "CLI Package"
Cohesion: 0.67
Nodes (3): Commands, skill-audit, skill-audit

### Community 26 - "Package Changelog"
Cohesion: 0.67
Nodes (3): 0.1.0, Changelog, Changelog

### Community 27 - "Project Identity"
Cohesion: 1.0
Nodes (2): skill-audit, skill-audit

## Knowledge Gaps
- **150 isolated node(s):** `Ralph-loop performance audit`, `Per-test e2e breakdown vitest run test/e2e.test.ts --reporter=verbose`, `1. Move the two "10-skill" e2e cases out of e2e — saves ~45 s per loop`, `2. Split vitest into two projects + --isolate=false for unit tier — saves ~5 s more`, `3. Disable dts in the dev build — saves ~700 ms per loop` (+145 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **Thin community `Project Identity`** (2 nodes): `skill-audit`, `skill-audit`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `SECTION 2 — MVP spec and implementation plan` connect `Product Specification` to `Roadmap Marketing`?**
  _High betweenness centrality (0.010) - this node is a cross-community bridge._
- **Why does `runScan()` connect `CLI Commands` to `Report Rendering`, `Ignore List`?**
  _High betweenness centrality (0.010) - this node is a cross-community bridge._
- **Why does `Skillaudit: a weekend plan for a local-first agent-skill scanner` connect `Roadmap Marketing` to `Product Specification`?**
  _High betweenness centrality (0.007) - this node is a cross-community bridge._
- **Are the 13 inferred relationships involving `runScan()` (e.g. with `clearPlugins()` and `initDefaultPlugins()`) actually correct?**
  _`runScan()` has 13 INFERRED edges - model-reasoned connections that need verification._
- **Are the 6 inferred relationships involving `renderTableToString()` (e.g. with `sortScanSkills()` and `formatAgentName()`) actually correct?**
  _`renderTableToString()` has 6 INFERRED edges - model-reasoned connections that need verification._
- **Are the 11 inferred relationships involving `runExplain()` (e.g. with `clearPlugins()` and `initDefaultPlugins()`) actually correct?**
  _`runExplain()` has 11 INFERRED edges - model-reasoned connections that need verification._
- **Are the 5 inferred relationships involving `renderSummaryFooter()` (e.g. with `sortScanSkills()` and `formatCompromisedPercent()`) actually correct?**
  _`renderSummaryFooter()` has 5 INFERRED edges - model-reasoned connections that need verification._