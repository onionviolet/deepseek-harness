# Local Ollama setup

English | [中文](local-setup.zh.md)

## Build and run

Use the Node version required by `package.json`, install with the pinned pnpm, then run `pnpm run build`. Start the Web profile with `pnpm dsh web` from the checkout. The CLI prints an authenticated loopback URL. Keep that URL and runtime logs private.

For a one-shot task, run `pnpm dsh --profile headless "your task"`. Profile patches live under `$DSH_HOME/profiles/<profile>/cordis.patch.yml`; the home patch applies to every profile. Keep machine paths, credentials and local receipts outside Git.

## Configure Ollama

Declare a custom `openai-completions` route in the `llm-pi-ai` entry with base URL `http://127.0.0.1:11434/v1`, explicit model id and capacities, and a local placeholder Authorization header if required. Set `agent-default-model` to that route and model. Use the [provider guide](user/guide/providers.md) for the current configuration format. Confirm the endpoint's reasoning and image capabilities rather than inferring them from its model name.

## Optional temperature control

Add the following rows to the Web profile patch. The Host row also works in headless; the UI row belongs only in Web. Both plugins remain disabled in standard bundles.

```yaml
- id: llm-sampling
  disabled: false
- id: ui-sampling
  disabled: false
```

The [Host plugin](../packages/llm/llm-sampling/README.md) owns the override; the [composer plugin](../packages/client/ui-sampling/README.md) edits it. Keep the temperature value in the profile rather than the higher-precedence home patch so browser writes can take effect.

## Verify

`pnpm exec vitest run packages/llm/llm-sampling/tests/sampling.spec.ts` checks live updates, durable header agreement, reset on the same Agent, invalid input and unload. The `sampling-temperature` scenario replays a real headless profile with the override enabled. Local acceptance additionally exercises file creation, bash, numeric persistence, Auto reset and server restart in a disposable workspace. A local pass does not establish every provider, image input, remote CI or human acceptance.
