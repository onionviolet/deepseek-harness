# Agent Note: Resync vendored Cordis onto upstream 4.0.0-rc.8

Status: implemented

[English](2026-08-24-resync-vendored-cordis.md) | 中文

## Problem

内置的 Cordis core 停在 `56b3d4f7`，而上游已经向 `packages/core/src` 发布了六个正确性与性能修复。其中四个所触及的文件带有大量本地修改：fiber 生命周期加固、Loader/Include 的事务化调和、以及 Loader 配置的惰性求值，因此手册中记载的同步流程（「把 `src/` 覆盖过来，再重新施加本地修改」）无法作为一次机械操作完成。不同步的代价是继续背负没有理由自己承担的上游缺陷：注销时删错 sink 的 exporter disposer，以及 `info`/`warn` 严重级别颠倒——它会让级别阈值保留较轻的那一档。

## Decision

按依赖顺序把上游的 `src` 提交逐个摘取到内置树上，而不是整体覆盖 `src/`；并在部分同步存续期间把该状态记录进 manifest。

`vendor/README.md` 新增 **In-flight upstream sync** 一节，逐条列出已经先于 manifest Commit 列施加的上游提交。该列继续标注所有文件都完整对应的那个快照，因此它不会声称一次并未发生的同步；当最后一个提交落地时，这一节被删除、该列被推进。这一节中的条目是上游代码，不进入本地修改日志——后者始终是与上游之间差异的记录。

回归覆盖落在 `packages/boot/app-boot/tests/`。`vendor/` 既不在覆盖率通道的 `include` 内，也不在 vitest 的用例匹配范围内，因此它没有属于自己的测试目录；app-boot 本就拥有组装后的 cordis 树，并承载着本地修改所需的 Loader 与 HMR 回归，这使它成为「未来重新同步时不得悄悄丢失的框架行为」的唯一归属地。

每个修复都由一个在修复前源码上会失败的测试钉住。这正是逐个摘取的意义所在：一个靠手工重新施加到已被本地改写的代码上的上游修复，并不因为它能通过编译而得到验证。

## Alternatives considered

- **覆盖上游 `src/` 后重新施加本地修改日志** —— 否决，尽管这正是 `vendor/README.md` 记载的流程。本地修改 6、8、12、15 对 `fiber.ts` 与 `events.ts` 的改写程度，已使该日志不再读作一个可重新施加的补丁序列；整体覆盖会迫使评审者在一次改动中，把六个上游修复的并集与四处本地改写一起对比，且没有任何一个提交可以单独钉住某一项行为。
- **只取两个 logger 修复就停手** —— 否决：这会把被包装 fiber 的 `restart()` 缺陷与可调用服务的 shadow 缺口留在框架层，而 agent loop 的正确性依赖于该层的生命周期语义；同时会让 manifest 停在一个没有任何文件真正对应的 SHA 上。
- **立即推进 manifest Commit 列并注明例外** —— 否决：该列的含义是「上游此 SHA 加上已记录的修改」，据一个被提前推进的列去重建内置树的读者，会得到我们并不发布的代码。In-flight 列表把风险反转了：它宁可多报剩余工作，也不少报差异。
- **弃用内置 logger，改用有维护的日志依赖** —— 在此否决：`ctx.logger` 是一个与 fiber 身份和 intercept 求值交织在一起的 Cordis 服务，替换它属于框架决策，而非一次同步。

## Consequences

- manifest 在该序列的每个提交上都是真实的，代价是多出一节、并且必须在推进该列时删除。过期的 in-flight 列表是可见的（它写明了提交），而过期的 Commit 列不是。
- `packages/boot/app-boot/tests/` 现在既是引导胶水的测试归属地，也是内置框架回归的归属地。这一归属写在测试文件里而非默认成立，因为该包的 README 描述的是引导辅助函数，其中没有任何内容能预示 logger 覆盖。
- 配置中的数值日志级别含义发生变化：`levels: { default: 1 }` 原先选中 `info`，现在选中 `warn`。仓库中唯一的此类取值是 `default: 3`（debug），其含义未变，并且没有任何已发布的落盘格式携带级别。
