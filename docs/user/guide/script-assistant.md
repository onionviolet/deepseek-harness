# Local assistant for scripts

English | [中文](script-assistant.zh.md)

## Summary

The optional [Python bridge](../../../apps/cli/config/examples/script-assistant/bridge.py) gives browser scripts a local JSON endpoint with checked lesson citations and a bounded harness lookup. It uses installed Ollama models. It does not submit browser forms.

## Table of Contents

- [Start the service](#start-the-service)
- [Choose a path](#choose-a-path)
- [Send a request](#send-a-request)
- [Check the boundaries](#check-the-boundaries)

<a id="start-the-service"></a>
## Start the service

Use an installed source checkout with its normal development dependencies, Python 3 and a working `dsh` command. Set `harness_checkout` to that checkout's absolute path:

```sh
python3 "$harness_checkout/apps/cli/config/examples/script-assistant/bridge.py" --dsh "$(command -v dsh)"
```

The service binds only `127.0.0.1:11435`. `GET /health` checks the bridge; `GET /api/tags` lists installed local Ollama models. Ollama remains at `127.0.0.1:11434`. The bridge launches tool lookup through the supported headless profile. The [MCP server](../../../apps/cli/config/examples/script-assistant/reference-server.mjs) uses the checkout's existing official MCP SDK dependency.

<a id="choose-a-path"></a>
## Choose a path

Use one endpoint for script requests. Select `assistant.mode: always` for harness lookup before each batch, or `auto` for tools only when evidence is missing. The `auto` path proposes structured answers, verifies source IDs and exact quotes, then asks the local model to check whether the evidence supports the actual selected choices. Uncertain or unsupported answers become blank. If questions remain unresolved and the course library contains unused evidence, it runs at most one harness lookup and retries the complete batch when new sources arrive.

`always` runs lookup before each batch. It adds startup and tool overhead and does not guarantee better answers. A request without `assistant` provides generic structured inference without lesson review or tools. A browser's explicit Direct Ollama option bypasses this bridge entirely. There is no silent fallback when the selected service fails.

<a id="send-a-request"></a>
## Send a request

`POST /api/chat` accepts JSON with `model`, `messages` and a JSON Schema in `format`. Output follows Ollama's non-streaming `message.content` shape. The bridge internally streams Ollama output for cancellation. It fixes temperature to zero, disables thinking, and uses a 32,768-token context. [Ollama structured outputs](https://docs.ollama.com/capabilities/structured-outputs) constrain shape; clients must still validate content.

For lesson mode, the last user message contains a JSON object with `questions` and `lessonReferences.passages`. Questions have unique `id`, `type`, `stem` and `choices` entries with `id` and `text`. Answers have `id`, `choices`, `response`, `uncertain`, `reason` and `citations`; citations have `sourceId` and `quote`. Use an exact batch-size schema and validate IDs and choice cardinality again in the client. Supported mode requests contain `assistant: {mode, references}`. Each reference has string `id`, `page`, `title`, `text`; initial selected passages must exactly match that library. The optional `course` label is client metadata, not an access boundary.

The response adds `referencePassages` containing canonical passages found by lookup, `assistantStatus` and `lookupTools`. Validate returned passages against the original library before accepting them. Send only the active course's references, at most 20 questions and an 8 MiB request. Invalid, incomplete or truncated batches fail as a whole. Changes to questions, backend, model or lesson evidence should invalidate client checkpoints and prevent stale filling.

<a id="check-the-boundaries"></a>
## Check the boundaries

The retrieval agent receives only `search_references` and `read_reference`, backed by the supplied packet. Native shell, filesystem, web, skills and delegation tools are disabled. Read-only permission mode alone does not restrict reads; the two-tool catalog supplies that boundary. The lookup uses an isolated temporary home, disables telemetry, and removes its request/session files when done. It has a configurable 300-second default budget; inference has no generation deadline and can be cancelled by disconnecting the client.

The HTTP service accepts its exact loopback Host and either no Origin or the two supported HTTPS learning-site origins declared in the source. It does not forward cookies or authorization headers, log request bodies, or expose arbitrary URLs. It serves one inference request at a time and returns 429 when busy. This does not coordinate other applications using the same Ollama server. Test actual userscript-manager transport separately before relying on browser compatibility.

Exact quotation checks and a second model review reduce specific failure modes. The same model can repeat a reasoning error; these checks do not prove correctness. No public web retrieval, OCR, audio transcription, browser operation or automatic submission is included. Missing course evidence remains an explicit abstention. Human review and the course's permitted-use rules still apply to intended deliverables.

## Dev Note

Run `python3 -m unittest discover -s apps/cli/config/examples/script-assistant -p test_bridge.py -v`. Synthetic tests cover incorrect answers paired with real quotes, missing references, bounded lookup policy, malformed batches, origin/host checks, busy handling and disconnect cancellation. Live synthetic receipts must record model and tool use separately from browser installation and human acceptance.

With the service running, use `python3 apps/cli/config/examples/script-assistant/smoke.py --model <installed-model>`. This optional live check uses only a fictional library question and requires actual lookup plus a correct grounded answer; it never contacts a learning site.
