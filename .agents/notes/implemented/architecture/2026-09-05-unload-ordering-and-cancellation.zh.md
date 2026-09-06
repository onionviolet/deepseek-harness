# Agent Note: Order teardown, announce cancellation

Status: implemented

[English](2026-09-05-unload-ordering-and-cancellation.md) | 中文

## Problem

provider fiber 会在消费者仍在使用其服务时，就释放这些服务所交出的资源。`Fiber._unload()` 在一个 `Promise.all` 中释放全部 effect，因此没有任何东西把服务的拆卸与仍在消费它的 fiber 的拆卸排序：消费者的异步清理可能调用某个服务，而其 socket、sandbox 或进程已被 provider 关闭。上游的 [cordiverse/cordis#110](https://github.com/cordiverse/cordis/pull/110) 针对同一缺陷（[issue 26](https://github.com/cordiverse/cordis/issues/26)）已开启数周。

[第一次移植尝试](../bug-fix/2026-09-05-port-open-cordis-fixes.md)失败了。上游把一个 fiber 的 disposer 列表拆成三个有序阶段——子 fiber、本 fiber 的服务、其余一切——这种串行化在五个包中破坏了九个 harness 测试，且每一个都是 setup 期间释放的路径。原因并不在于分组方式：一个精简的两阶段变体破坏了同一批测试。那次尝试得出两个事实，并塑造了本设计：

- harness 是通过*释放某个 effect*来向在途工作发信号的：工厂的 `accepting` 标志、E2B 服务的 `disposed` 标志、terminal 服务对 setup 的中止，全都在 disposer 内部翻转。因此任何延迟 fiber disposer 的顺序都会延迟取消，本应被放弃的 setup 反而会跑到底。
- 上游自身的机制在这里也达不到其目标。对 provide disposer 的插桩显示 `tracked 0 pending 0`：等到 provider 释放其服务时，`notify()` 早已把消费者从 impl 上摘除，disposer 无人可等。

## Decision

把此前由 disposer 一并承担的两件事分开——*取消*必须立即，*拆卸*必须有序。

`Fiber.signal` 是一个 `AbortSignal`，在 fiber 开始卸载的瞬间中止，早于任何 disposer 运行。一次重载会安装新的信号，因此仍持有旧信号的一方会看到它已中止。这是得知所有者即将离开的公开途径。

`_unload()` 随后只对必须排序的部分排序。fiber 先交出自己的服务——`ctx.provide()` 的 disposer 删除 store 条目、发出通知，并等待记录在 `Impl` 上的消费者 fiber——之后并发排空其余一切。子 fiber 与普通 effect 保留本地修改 6 所依赖的单次并发排空；只有 provider 自己的资源被移到其消费者之后。`_releasing` 沿用上游的做法，避免正在释放服务的消费者与该等待互锁。

消费者追踪取自 `#110`：`Impl` 携带当前注入它的 fiber 集合，由 `_setImpl()` 维护，因为仅靠 `notify()` 看不到已经在卸载中的消费者。

三个 harness 服务把宣告迁到信号上，并把拆卸留在 effect 中：agent loop 的 `FactoryOwnership`（停止接受、中止 teardown 信号、唤醒 `waitWhileActive`）、`dsh-e2b`（`disposed`）与 `dsh-subprocess-e2b`（`disposing` 以及中止在途的 terminal setup）。`docs/defensive-patterns.md` 为下一个服务写下了这条规则。

## Consequences

- 消费者的清理可以使用它注入的服务：provider 的资源比它活得更久。`packages/boot/app-boot/tests/cordis-fiber.spec.ts` 钉住了这一顺序，也钉住了信号先于第一个 disposer 触发；两者在改造前的源码上都会失败。
- agent-loop 有两处期望发生变化，其测试也随之改变。工厂在 scope 铸造期间卸载时，现在会完全跳过调用方的 `setup` 回调，而不是先运行再回滚——这本就是该测试名称一直宣称的行为。与工厂拆卸竞争的同步 `agentLoop.create()` 现在抛出 `agent loop is not active`，而不是返回一个随即被拆掉的 agent。
- 取消不再与拆卸顺序耦合，因此未来的顺序调整无法再悄悄延迟它。代价是多了一套需要知晓的机制：一位伸手用 disposer 去翻转标志的服务作者现在是错的，而只有这条被记录的模式会指出这一点。
- 上游的 `symbols.plugin` 标记没有搬运：这里没有任何东西对子 fiber 的释放排序，该标记不会有读者。
- 本仓库与上游现在以不同方式解决 issue 26。若 `#110` 按原样合并，下一次同步将重新施加本条修改而不是采纳它，日志条目也如是记载。

## Alternatives considered

- **按原样移植 `#110`** —— 依据上文证据否决：九个失败测试，且该机制在本仓库达不到自身目标。
- **标注必须延后运行的 effect**（`ctx.effect(execute, label, { afterConsumers: true })`）—— 否决：它把分类负担压给每个 provider 作者，而遗漏是静默的。把 provider 的整次排空排在其消费者之后，无需任何标注，且默认就是对的。
- **标注必须尽早运行的 effect（取消）** —— 以相反方向的同一理由否决：需要审计 38 处 `ctx.effect(() => () => …)`，漏掉一处就会静默延迟取消。信号独立于 effect 系统，因此没有什么可遗漏。
- **把取消留在 disposer 中并接受延迟送达** —— 否决：harness 那些 setup 期间释放的约定之所以存在，正是因为 setup 活得比其所有者更久时，半构建的 agent、terminal 与语言服务器会泄漏。
- **让消费者继续使用已释放的服务**（改为修复调用处）—— 否决：这会把一个所有权问题推给每个消费者的清理路径，而消费者无法区分已释放的服务与仍然存活的服务。
