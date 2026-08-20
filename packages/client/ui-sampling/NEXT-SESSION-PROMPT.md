# Resolved 2026-08-19: the composer temperature slider works

This file previously carried a diagnostic plan built on a wrong hypothesis. Keeping it would send the next session down the same dead end, so the plan is gone and the answer is here.

## What was actually wrong

`packages/host/apiproxy/src/api-proxy.ts` filters every settings namespace through `exposedNamespaces()` before `settings.describe` returns it or `settings.mutate` accepts a write. The set is the configurable model providers plus two hardcoded arrays, `WEB_SETTINGS_NAMESPACES` and `PRODUCT_SETTINGS_NAMESPACES`. `llm-sampling` was in none of them.

That single fact produced all three symptoms. `describe` omitted the namespace, so `SettingsScopeController.read()` took its `view === undefined` branch: `status` left `loading` for `unavailable`, `writable` came from the response's top-level flag and was therefore true, and `value` was never assigned. `mutate` answered `settings-not-exposed`. `ui-theme` worked only because `'ui-theme'` is in the array.

The `base` option and the host-and-client package split were both red herrings.

## The fix

1. `'llm-sampling'` added to `WEB_SETTINGS_NAMESPACES` in `packages/host/apiproxy/src/api-proxy.ts`.
2. A `ui-sampling` row added to `packages/bundle/web-app/cordis.patch.yml`.

Verified end to end: 0.75 written over the wire reached the bar, the reset button cleared `temperature` from `~/.dsh/settings.yaml`, and 0.3 typed into the field wrote it back. Shipped with no temperature set.

## What this costs

A settings namespace cannot reach the browser without an edit inside `packages/host/apiproxy`. The upstream comment above that array names moving the declaration to `settings.register()` as deferred work. So this package cannot ship as a pure standalone npm plugin while it stores its value in a settings namespace, unlike `whale-on-desk` or `dsh-diagram`, which store nothing host-side. The only plugin-side route to exposure is `ctx.llm.registerConfigurableProviders()` with a matching `settingsNs`, which would put a phantom provider in the models settings page.

That one array entry is the line to re-apply after an upstream pull.

## Probe without a browser

```
curl -s -X POST http://127.0.0.1:3080/api/settings.describe -H "content-type: application/json" \
  -d '{"type":"client-request","rpcId":"probe","method":"settings.describe","payload":{}}'
```

## Rebuild and restart

```
npm run build:lib:host
npm run build:lib:client
npm run build:web
powershell -File C:\Users\wayba\bin\Start-LocalAI.ps1 -Stop
powershell -File C:\Users\wayba\bin\Start-LocalAI.ps1 -NoBrowser
```
