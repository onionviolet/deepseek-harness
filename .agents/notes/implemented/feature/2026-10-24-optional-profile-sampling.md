# Agent Note: Optional profile sampling control

Status: implemented

English | [中文](2026-10-24-optional-profile-sampling.zh.md)

## Problem

The historical fork's composer temperature control depends on a removed settings transport and a Host API allowlist patch. Reapplying it directly to current upstream would preserve those obsolete dependencies.

## Decision

Two optional plugins provide a profile-wide temperature override and a composer editor. Both are disabled in the standard bundles. The Host uses a volatile Config field, the browser uses the current Config form, and the normal request header records the effective scalar. Clearing the override removes a temperature retained from an earlier request on the same Agent.

## Alternatives considered

**Merge the historical framework branch.** Its merge preview has conflicts in lifecycle code and removed files. The local installation uses upstream as its base; historical branches remain available for separate evaluation.

**Restore the old settings allowlist patch.** The current Config-derived form exposes volatile fields and persists them in the active profile. An extra API patch would duplicate that mechanism.

## Consequences

The port preserves the temperature bar and reset while leaving old provider top-p/seed changes and framework patches out of the runtime. Values are shared within a profile; distinct profiles keep independent overrides. The request extension is deprecated upstream and remains a future compatibility obligation.
