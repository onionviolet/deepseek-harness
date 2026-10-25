---
description: "An optional profile-wide temperature override for model requests."
kind: "package-reference"
---

# @deepseek-ai/dsh-llm-sampling

English | [中文](README.zh.md)

## Summary

An optional profile-wide temperature override for model requests.

## Table of Contents

- [Use this package](#use-this-package)
- [Dev Note](#dev-note)
- [Model Experience](#model-experience)
- [Known Limitations and Deferred Work](#known-limitations-and-deferred-work)

## Use this package

Enable the `llm-sampling` row in a profile patch. Its volatile `temperature` accepts 0 through 2. Omission restores the adapter default, including after an earlier request stored a temperature. The listener delegates through the request waterfall and leaves other request controls intact. The composer edits the same Config through standard forms. A home-level temperature takes precedence over profile edits.

## Dev Note

Both plugins remain disabled in standard bundles. See the [local setup guide](../../../docs/local-setup.md) for configuration and verification.

## Model Experience

### Request temperature

#### What the model sees

The Host sampling plugin sets the `temperature` scalar recorded in the normal request header. No prompt text is added by either plugin. The provider decides whether the scalar affects generation.

#### Token effect

No input tokens are added. Sampling can change generated output and its length.

#### KV Cache effect

The prompt prefix is unchanged by a temperature edit.

## Known Limitations and Deferred Work

- Values apply to every model and Session within one profile. Web and headless profiles keep separate overrides. Per-model values, `/temp`, top-p and seed are outside this plugin. The upstream `agent/request` extension is deprecated; removing it requires a replacement.
