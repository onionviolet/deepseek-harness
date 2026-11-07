# Local coding with a smaller tool catalog

English | [中文](local-coding.zh.md)

## Summary

Use the optional local coding overlays for text-only project questions, targeted file edits and shell checks. They reuse the shipped tools, sandbox, approval policy, durable sessions and guards. The [audit](../../local-harness-audit.md) records the measured benefit and limitations.

## Table of Contents

- [Choose an overlay](#choose-an-overlay)
- [Configure compaction](#configure-compaction)
- [Continue and recover](#continue-and-recover)
- [Verification](#verification)

<a id="choose-an-overlay"></a>
## Choose an overlay

Set `harness_checkout` to your source checkout's absolute path. Run these commands from the disposable project you want to inspect, using your installed `dsh` launcher and configured model route.

```sh
dsh --profile headless --patch "$harness_checkout/apps/cli/config/examples/local-coding/headless.patch.yml" "Read README.md and explain this project. Make no edits."
dsh web --no-open --patch "$harness_checkout/apps/cli/config/examples/local-coding/web.patch.yml"
```

The [headless overlay](../../../apps/cli/config/examples/local-coding/headless.patch.yml) removes image reading, delegation, workflows, goals, web access, plugin management, skills, todo and plan tools. It retains text reads, writes, literal edits, glob, grep, shell, job controls and working-directory selection. The [Web overlay](../../../apps/cli/config/examples/local-coding/web.patch.yml) adds a custom `local-coding` preset with those capabilities plus user questions. Select Local coding in General settings for subsequently created sessions; existing sessions retain their preset revision. The overlay does not change the default selection.

These are task compositions, not security policies. Shell commands retain their normal capabilities under the selected permission mode. Use the permission picker or headless `--permission-mode` when confinement must change. The overlays neither grant Full access nor enable model-based Auto review.

<a id="configure-compaction"></a>
## Configure compaction

Both examples declare a policy for the exact route `ollama-local/qwen3.8:27b`: 4,096-token headroom, 4,096-token summary cap and 4,096-token retention. For a declared 32,768-token window and 4,096-token request output reservation, this resolves to a 24,576-token pressure trigger. Adapt the provider/model match and budgets when your route differs; these example values do not allocate Ollama context.

The [compaction package](../../../packages/compaction/compaction-basic/README.md) owns the policy formula and validation. Its default 65,536-token headroom does not fit this 32K route. A short successful turn does not verify automatic compaction: invalid step-pressure configuration warns and lets the turn continue.

Headless uses the Host `compaction-basic` row. Web presets own separate scoped instances. A top-level override does not configure those instances. To change an existing Web preset, replace its complete declaration config using the [composition instructions](../../../packages/preset/agent-preset/skills/editing-cordis-compositions/SKILL.md); retain its other plugins and update its scoped compaction row. Keep local copies aligned after upstream preset changes.

<a id="continue-and-recover"></a>
## Continue and recover

Headless prints its session id with `--json`. Supply that id with `--session-id` on a later invocation using the same overlay and workspace. Resume keeps conversation history; file observations must be renewed in the new process before editing an existing file.

After a rejected edit, read the current file and reconsider the replacement. After an interrupted command, inspect its actual effects before retrying. Session persistence records conversation and tool outcomes; it does not restore workspace files. Use a disposable checkout or an explicit Git checkpoint when file rollback is needed.

<a id="verification"></a>
## Verification

The `local-coding-tools` recorded-session scenario checks the headless tool catalog and bash output. The optional local coding case in `apps/cli/tests/web-agent-presets.e2e.ts` mounts the Web overlay, checks its tools, compacts a 32K route with a deterministic adapter, and verifies continuation from the stored summary. The audit separates those checks from local Ollama runs and human acceptance.

## Dev Note

The overlays add no package or adapter. They deliberately omit automatic task classification and forced completion retries; changing tool sets during a conversation also changes its request prefix.
