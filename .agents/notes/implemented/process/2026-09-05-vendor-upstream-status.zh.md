# Agent Note: Read the vendor manifest back with a status command

Status: implemented

[English](2026-09-05-vendor-upstream-status.md) | 中文

## Problem

`vendor/README.md` 中的清单记录了每个内置目录取自哪个上游仓库与哪个提交，却从来没有任何东西把它读回去。漂移只有在有人想起来去看时才会被发现，于是它不断累积：到[同步到上游 head](2026-09-05-resync-vendored-cordis-head.md) 时，Cordis 各行已落后十二个 `src` 提交，而其中一个提交正是上游*从本仓库*移植走的修复——harness 一直携带着自己早已诊断出的缺陷，只因没有人比对过两侧。

其中两个记录的上游根本无法访问。`cosmokit/` 与 `schemastery/` 行指向的 `deepseek-harness` 镜像已不再解析，而它们记录的提交在任何可达仓库中都不存在：`shigma/cosmokit` 与 `shigma/schemastery` 存在，却不含这些 SHA。没有人注意到，因为没有任何东西尝试过。

## Decision

`pnpm run vendor:status` 解析清单表格，并通过 GitHub REST API 询问每个上游仓库：自记录的提交以来，有哪些提交触及该包的 `src` 前缀。它为每一行打印一条结果——已是最新、落后 n 个提交及其标题、或比较失败——而 `--check` 在任一行落后时以非零码退出，这正是计划任务所需要的形态。

该工具报告漂移，但不作为提交的门禁。内置漂移并非当前评审的改动所导致，而一次网络调用也不能待在 `hygiene` 或 pre-commit 钩子里。把它做成由维护者或计划任务调用的命令，能让离线门禁保持离线。

决定相关性的是源码前缀而非包目录：对只发布 `src` 的内置副本来说，上游的 README 或测试改动不算漂移。清单解析、前缀推导、提交过滤与报告渲染都是基于注入式比较获取器的纯函数，因此 `scripts/vendor-upstream-status.spec.ts` 无需网络即可覆盖它们，其中一个用例解析本仓库实际发布的清单——表格格式若发生变化，会让该用例失败，而不是悄悄报告零行。

无法访问的 `cosmokit/` 与 `schemastery/` provenance 被记录在 `vendor/README.md` 中，作为一处明确的缺口，而不是靠猜测修补：把这些行改指 `shigma/*` 会声称一个不含所记录提交的仓库，这比原来的问题更糟。下一位同步这两个包的人，应通过把内置源码与可达上游比对来重新确定 provenance，再改指该行。

## Alternatives considered

- **每夜 CI 任务，将内置源码与上游检出逐一比对** —— 这仍归[供应链提案](../../proposed/process/2026-06-11-supply-chain-and-vendor-drift.md)所有；它需要为每条本地修改准备一个签入的补丁文件，才能把预期分歧与新漂移区分开。本命令以更低成本回答了另一个问题（「上游此后做了什么？」），无需维护新产物，而这正是最近两次同步真正需要回答的问题。
- **把它加入 `hygiene` 或 pre-commit 钩子** —— 否决：它需要网络，其答案与当前评审的改动无关，而在提交钩子里放一次受限流的 API 调用，等于用一个真实门禁换来一个时灵时不灵的门禁。
- **比较文件内容而不是提交列表** —— 此处否决：内置文件承载着二十四条已记录的本地修改，因此内容差异大多是预期分歧，必须配合上述补丁文件机制才可读。提交列表则可直接行动：每一条都是可拣选或可排除的候选。
- **把 `cosmokit`/`schemastery` 行改指 `shigma/*`** —— 否决：那些仓库并不含所记录的提交，该行将声称一个无法检出的 provenance。一个由工具在每次运行时报告的不可达镜像，才是诚实的状态。

## Consequences

- `pnpm run vendor:status` 是同步流程要求执行的第一件事，因此一次同步从上游提交清单开始，而不是从某人手工拼出的差异开始。
- 该命令今天会以非零码退出，因为两行不可验证的 provenance 被报告为比较失败。这是刻意的：它们的 provenance 确实已损坏，而一次全绿的运行只会掩盖它。因此计划中的 `--check` 任务需要先修好这两行才值得接入。
- 除非设置了 `GITHUB_TOKEN` 或 `GH_TOKEN`，否则调用 GitHub API 时不带令牌。九行请求可以放进未认证的限流额度内；落后很多的仓库最多报告该区间的前 100 个提交，足以据此决定是否同步。
