---
description: "An optional composer range, numeric field and Auto reset for the Host sampling plugin."
kind: "package-reference"
---

# @deepseek-ai/dsh-client-ui-sampling

English | [中文](README.zh.md)

## Summary

An optional composer range, numeric field and Auto reset for the Host sampling plugin.

## Table of Contents

- [Use this package](#use-this-package)
- [Dev Note](#dev-note)
- [Model Experience](#model-experience)
- [Known Limitations and Deferred Work](#known-limitations-and-deferred-work)

## Use this package

Enable `ui-sampling` in the Web profile together with the Host `llm-sampling` row. The control offers 0 through 2 in steps of 0.05. Numeric entry writes immediately; dragging writes on pointer release, adjustment-key release or blur. Auto removes the profile override. Accepted Host snapshots remain authoritative; failed writes show an error. Labels support English and Chinese.

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

- Temperature is shared across Sessions within one profile. This control does not change Ollama context allocation or provide other sampling parameters.
