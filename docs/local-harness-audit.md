# Local coding harness audit

English | [中文](local-harness-audit.zh.md)

## Summary

F1. Keep DeepSeek Harness and adapt a smaller active tool set. The optional [local coding compositions](user/guide/local-coding.md) reduce the measured headless catalog from 23 tools and 18,820 serialized schema bytes to 10 tools and 7,711 bytes, while retaining the demonstrated question, edit, shell-check and resume journey. No competitor code is copied.

F2. Configure small-window compaction explicitly. The default 65,536-token reserve is invalid for the local route's declared 32,768-token window and 4,096-token output cap. The route-specific 4,096-token reserve, summary cap and retention resolve to a valid 24,576-token pressure trigger. Successful short tasks alone had not established working compaction.

F3. [Local work](user/guide/local-work.md) adds skill loading, task tracking and Web file delivery for everyday scripts and file processing. The local setup selects it for new Web sessions and exposes the headless launcher as `dsh-work`.

This reference records inspection and trials on 2026-10-24 against the fork's published local-Ollama baseline, reporting version 0.2.1-rc.3. Source/config edits, deterministic checks, installed local configuration, live Ollama evidence, remote CI and human acceptance remain separate states.

## Table of Contents

- [Incumbent capabilities](#incumbent-capabilities)
- [Alternatives and mechanisms](#alternatives-and-mechanisms)
- [Community modules](#community-modules)
- [Acceptance evidence](#acceptance-evidence)
- [Remaining tradeoffs](#remaining-tradeoffs)

<a id="incumbent-capabilities"></a>
## Incumbent capabilities

The source inventory contains 365 workspace packages, including 22 bundle manifests and 58 experimental packages. These counts describe source availability. Both local profile manifests select the base plus their surface bundle and declare no third-party dependencies. Individual plugin activation requires a separate check.

| Capability | Available and selected composition | Evidence or limit |
|---|---|---|
| File tools and observation policy | Base and Standard; direct text tools absent from Minimal | Live reads and one-line literal edit succeeded; editing after process resume required rereading on 0.2.1-rc.3, and 0.2.2 ships the policy disabled |
| Shell and jobs | Base/Standard shell and job controls; Minimal has its own persistent shell | Live bash and tests succeeded; experimental global persistent-terminal bundle remains unselected |
| Durability and resume | JSONL persistence and checkpoint policy in base | Same session resumed in separate headless processes; conversation persistence does not undo files |
| Context management | Token meter, compaction and output pruner; scoped per Web preset | Default reserve fails the 32K configuration calculation; local route policy repairs it |
| Repeat and timeout guards | Base repeat-call reminder and declared tool deadlines | Source-inspected; exact repeats receive advice, not a hard stop; no new watchdog is installed |
| References and plugins | Built-in file/session references, inventory and plugin manager | Existing reference UI overlaps community file-mention plugins; Custom plugin indexes is optional and ships without an index source |
| Optional extensions | Inspector, worktrees, terminal tools, Auto review, teams, browser/CUA and example MCP compositions | Source-available; not established as enabled or demonstrated locally; Auto review adds same-model inference before calls |

The new headless overlay and custom Web preset preserve sandbox and approval infrastructure. A smaller catalog reduces prompt cost; shell permissions still determine what commands can do. The local configuration applies exact-route compaction policies to the Host and all four existing Web preset declarations, adds Local coding and Local work, and selects Local work for new Web sessions. Local preset copies require comparison after upstream upgrades.

<a id="alternatives-and-mechanisms"></a>
## Alternatives and mechanisms

These are primary-source inspections, not an executed ranking of competing harnesses. Latency and tool correctness on this Mac remain unmeasured for every alternative.

| Candidate and pinned source | Journey, useful mechanism and disposition | Cost and license |
|---|---|---|
| [Oh My Pi](https://github.com/can1357/oh-my-pi/tree/0b5c27ab24719c86a5986b95ee55f4e75bc1aaa0) | Project questions, edits and shell in a terminal workflow; selectable active tools and compact hashline prompts. Adapt active-tool selection through existing DSH configuration. Park hashline until literal-edit failures demonstrate a need. | Hashline uses snapshot tags and native Rust/N-API code; model-specific fallback can select replacement editing. Native builds and another plugin/config system add maintenance. MIT, with separate third-party notices. |
| [OpenCode](https://github.com/anomalyco/opencode/tree/ddd9e103fe082dcb24aaf8682d7e79eb9b0dce50) | Conversational coding with Ollama and granular allow/ask/deny permissions. Keep as a future whole-journey comparison if DSH's interaction remains limiting. | A Plan label alone is not shell confinement; permission configuration matters. A second session/config store has adoption cost. MIT. |
| [Cline](https://github.com/cline/cline/tree/40c5d99031fe1128189c5b52e40638d2b7787754) | [Local model guidance](https://docs.cline.bot/running-models-locally/overview) recommends compact prompts. [Shadow Git checkpoints](https://docs.cline.bot/core-workflows/checkpoints) offer file rollback while preserving conversation. Adapt prompt restraint; park installation pending an editor-specific need. | Checkpoints add project snapshot storage and work per tool use. VSCodium compatibility and this model's reliability are untested here. Apache-2.0. |
| [Albatross](https://github.com/morganlinton/Albatross/tree/e458e4277f463a4688f127ea6ea61f5a344b64b8) | Terminal Ollama workflow, resume, per-turn undo and reset/handoff. Park as a recovery-focused alternative rather than importing another runtime. | Inspected checkpoint source bounds retained turns, aggregate bytes and individual files; skipped files and partial restore are explicit. Undo is not universal transaction rollback. MIT. |
| [Mingbird](https://github.com/Mingbird/Mingbird-agent/tree/7a3bc35be14fcfb4b17a41b296207fe2e8cbfcec) | Category-based tool loading, prefill budgeting, loop escalation and completion checks. Adapt the small catalog and external artifact verification. | Keyword category routing and forced finish gates add behavior to maintain. macOS is experimental. Published author benchmarks are not evidence for this Mac/model. Apache-2.0 code; benchmark data separately CC BY 4.0. |

<a id="community-modules"></a>
## Community modules

Searches by context budgeting, Ollama failures, recovery and file references surfaced the following upstreams. Registry listings were discovery leads; the linked source manifests and documentation determine these dispositions. None was installed or executed.

| Primary source revision | Disposition and compatibility limit |
|---|---|
| [dsh-local-ai](https://github.com/PerryLink/dsh-local-ai/tree/a44e95f0f104ebccdd9d9883f44f3a842fcffbd4) | Skip for this route: model management and cloud fallback duplicate or broaden the configured adapter. Declared peer ranges include 0.2.1 prereleases; that does not prove rc.3 behavior. Apache-2.0. |
| [dsh-fetch-timeouts](https://github.com/d3vmeh/dsh-fetch-timeouts/tree/2b4e09b350e93bb2b61d0c4a25f5bb5bbaa60a68) | Park until an exact silent-stream timeout occurs. It wraps Node's global dispatcher, affecting unrelated fetches; longer deadlines also delay detecting dead connections. Node range admits the local runtime; rc.3 execution untested. MIT. |
| [dsh-context](https://github.com/bowenliang123/dsh-context/tree/5742e672225b4b5ceb72e69f152321a864111bfa) | Park the context dashboard until built-in metrics and request-header inspection cannot answer a concrete question. Broad peer ranges do not establish runtime compatibility. Apache-2.0. |
| [dsh-at-file](https://github.com/FSMargoo/dsh-at-file/tree/da602d1a8f1b417b8a1d8d4059e0f4cb1c353524) | Skip overlapping file mentions. A discovered registry entry described an older owner/revision and obsolete setup; current native file/session references already cover the core journey. MIT. |
| [dsh-session-insights](https://github.com/GreenLv/dsh-session-insights/tree/7a1b21dbb867da9c7cda573e7e4d5c00be1a53a0) | Park retrospective analysis. Manifest declares DSH >=0.2.1-rc.2; current deterministic metrics mode is offline, while optional semantic analysis uses the configured model. Not an execution-reliability improvement by itself. MIT. |

<a id="acceptance-evidence"></a>
## Acceptance evidence

The live fixture contained a label function missing Unicode casefold, four independent assertions, a README and a synthetic settings marker. Only the function's normalization line changed. The M5 Pro has 64 GB RAM; Ollama 0.40.3 reported a 65,536-token loaded allocation during the trial, distinct from the 32K Harness budget.

| Check | Observed result |
|---|---|
| Same project question, baseline | Correct source-linked answer; 49.92 seconds; first request 5,672 uncached input tokens |
| Same question, compact | Correct source-linked answer; 27.12 seconds; first request 2,633 uncached plus 28 cached input tokens, about 53% fewer combined input tokens |
| Resume, edit and check | 53.82 seconds; two failing assertions became four passes; first edit rejected until reread; one-line change only |
| Fresh-process follow-up | 31.76 seconds; recovered from one missing-file read using README guidance, recalled the marker and changed line, four tests passed |
| Live pressure compaction, temporary lower trigger | 106.19 seconds; one durable summary retained the marker and changed line; a later non-shrinking summary was rejected and the turn continued correctly |
| General script and CSV workflow | 95.69 seconds through the installed launcher; skill loaded, CLI inspected, exact CSV counts/totals verified, input unchanged |
| Resumed script extension | 193.25 seconds; added a Decimal minimum-amount flag; previously failing threshold test and existing default-output test both passed, independently rerun |
| Keyless recorded session | One new `local-coding-tools` scenario refreshed and replayed through the shipped headless profile; exact catalog and bash output retained |
| Web composition | Deterministic adapter: 11 tools including user questions, explicit 32K route, bounded summary request, stored replacement and continuation |

The live compaction trial temporarily lowered the trigger to 15% and retention to 1,024 tokens to exercise recovery without generating a 24K history; it does not measure normal-threshold performance. The 4,096-token reserve and summary cap stayed unchanged.

Times are single observations, not a speed ranking: the baseline had a cold model load and the compact question was warm. Input counts include provider-reported cache accounting; serialized schema bytes are not tokens. No paid provider or competitor runtime was used. Private machine logs, authentication URLs and private research content are excluded from repository artifacts.

<a id="remaining-tradeoffs"></a>
## Remaining tradeoffs

R1. Local coding omits skills, images, web and delegation on purpose; Local work adds skills and task tracking. Use Standard when those capabilities are needed; the local route still needs its scoped compaction policy there. Existing sessions retain old preset revisions.

R2. Session recovery is not file rollback. Keep synthetic or isolated workspaces for trials. Cline/Albatross-style undo remains a ranked follow-up only if ordinary Git checkpoints prove insufficient.

R3. No evidence here justifies porting historical framework patches wholesale, installing global timeout changes, adding forced completion loops, or restoring per-model temperature, top-p or seed controls. Historical branches remain preserved; individual fixes require a reproduced current failure.

## Dev Note

The repository examples are optional source configuration, not new default bundles. The owning guide gives their setup and recovery behavior; the tests and recorded scenario own repeatable acceptance. The live trials ran on 0.2.1-rc.3. The compositions were rebuilt on 0.2.2-rc.1, where the deterministic checks pass and live Ollama trials have not been repeated. The Web catalogs now include the four `team_task_*` tools that the base bundle mounts. Remote CI, cross-platform runtime trials and human acceptance are not claimed.
