# Agent Note: Port five open upstream Cordis fixes

Status: implemented

[English](2026-09-05-port-open-cordis-fixes.md) | 中文

## Problem

内置 Cordis fiber 中有五个缺陷在[同步到上游 head](../process/2026-09-05-resync-vendored-cordis-head.md) 之后依然存在，因为上游尚未合并它们的修复：五者都躺在开放的拉取请求里，且都能从 harness 的日常运行中触达。

非 global 的 `ctx.on('internal/update')` 从未成为 fiber 的 effect。该注册在进入普通监听器路径之前就被截获并压入 `fiber._hooks`，而返回给调用方的是列表条目自身的 disposer——fiber 卸载时没有任何东西移除该条目。Fiber 实例会在重载中存活，于是每一代都留下自己的闭包：三次配置更新会派发六次监听器调用，且次数随每次重载增长。Loader 自身的 `internal/update` 处理也搭在这条链上，因此一次条目配置更新会重跑之前每一代的处理器。

`_updateState()` 通过 `emit()` 发出 `internal/status`，而 `emit()` 在一个未加隔离的循环中运行监听器——并且是在生命周期转换内部。于是一个抛错的诊断观察者会被 Fiber 构造函数捕获并写入 `_error`：对一个已干净应用的插件，`await plugin` 却拒绝；而当插件确实失败时，观察者的错误又会覆盖它，使 `FAILED` 指向错误的原因。本地修改 6 早已因同样的理由隔离了兄弟事件 `internal/plugin`；`internal/status` 却仍未隔离。

fiber 用依赖 epoch 来标识在途的工作，而 epoch 表示的是*期望*状态，并非那次尝试的身份。于是 `A → B → A` 的序列会把挂起的尝试交还它当初捕获的那个值，它便如同仍然拥有该 fiber 一样提交结果。`Fiber.update()` 在插件体尚未跑完时走的正是这条路径：更新把 fiber 推到 INACTIVE 再立刻推回，挂起的第一次尝试醒来看到自己的 epoch，保留其 effect 并报告 ACTIVE——而更新自己的代次从未运行，其配置变更就此丢失，且没有任何诊断。

相互注入的插件永远不会激活。每个 fiber 都停在 PENDING 等待对方将提供的服务，没有任何东西报告这个环；而热重载还可能在可用版本已被卸载之后才引入它。

`resolveConfig()` 假定每个真值的插件 `Config` 都暴露 `~standard.validate`。插件就是被导入模块所导出的任意值，因此一个并非 Standard Schema 的 `Config`——一个普通对象、来自不匹配大版本的 Zod schema、或作者本意作为默认值的值——会在校验器内部以 `Cannot read properties of undefined (reading 'validate')` 失败，既不指出插件，也不指出它缺失的约定。

## Decision

把 [cordiverse/cordis#56](https://github.com/cordiverse/cordis/pull/56)、[#55](https://github.com/cordiverse/cordis/pull/55)、[#104](https://github.com/cordiverse/cordis/pull/104)、[#54](https://github.com/cordiverse/cordis/pull/54) 与 [#66](https://github.com/cordiverse/cordis/pull/66) 移植进内置树，记为本地修改 22 至 26，使下一次同步显式地重新施加或退役它们。

更新钩子的注册改为 `fiber.effect(() => hooks[method](listener), 'ctx.on("internal/update")')`。该条目由添加它的那一代所有，并随该代的卸载消失，而显式 disposer 在该代内仍然有效。

`internal/status` 与 `internal/plugin` 现在共用一个 `emitContained()` 辅助函数：它自行解析监听器集合，在各自的 `try` 中调用每个监听器，并记录同步抛出与返回的拒绝。上游为 status 单独写了第二个自由函数；harness 早已为插件拆卸持有同一段隔离循环，因此这两个通知是一个辅助函数加两个薄封装，而不是同一段循环的两份拷贝。

这两个事件的观察者既不拥有 fiber 状态，也不拥有 fiber 的错误。这正是隔离所表达的不变量：失败的诊断就是失败的诊断，而不是失败的插件。

现在每次 epoch 变化都会同时递增一个代次计数器，一次尝试只有在仍然同时拥有 epoch 与代次时，才能提交它的 effect、失败与状态转换。与上游的一处偏离：fiber 一旦被释放，失败仍会被记录，因为不会有更晚的尝试运行，而等待一次被自身释放中止的 setup 的调用方仍然需要知道它为何结束。`packages/lsp/lsp-stdio` 与 `packages/terminal/terminal` 编码了这条约定，上游未加修改的规则会同时破坏两者。

`RegistryService` 维护一张依赖图，覆盖声明的 inject、声明的 `provide` 名称，以及运行时的 `ctx.provide()` 调用。会闭合环的注册被拒绝并给出完整路径（`circular plugin dependency: alpha -> beta -> alpha`），而不是让两个 fiber 永远停在 PENDING；同一服务令牌的第二个提供者被拒绝；声明了却从未提供某服务的 fiber 会失败而不是加载成功。条目级 `inject` 的合并从 `internal/plugin` 移到新的 `internal/plugin-meta` 事件，使依赖图在 fiber 存在之前就能看到 loader 的补充。

`resolveConfig()` 会检查 `Config['~standard'].validate` 是否可调用，否则抛出 `plugin Config must implement Standard Schema V1`。这是模块边界上的校验，而不是对同进程接口的防御式类型检查：该值是从 Loader 导入的文件跨入进程的。

## Alternatives considered

- **等待上游合并这两个 PR** —— 否决：更新钩子的泄漏随每次重载增长，而 `dsh` 在每次配置编辑时都会重载。日志条目带有上游链接，未来的同步若发现它们已合并，就退役条目而不是重新施加。
- **像上游那样用第二个自由函数隔离 `internal/status`** —— 否决：harness 已用同一段循环隔离 `internal/plugin`。同一条隔离规则的两份拷贝迟早会漂移；共用辅助函数正是这处重复所要求的提取。
- **在 `_unload()` 中清空 `fiber._hooks`，而不是注册 effect** —— 否决：那会丢掉*当前*这一代在卸载期间注册的监听器，并且重新实现了 effect 系统已提供的所有权。effect 还让这次注册在 fiber 诊断中拥有一个标签。
- **一并移植 `#110`（provider 拆卸相对消费者的顺序）** —— 尝试后否决。它把 `_unload()` 的单次并发排空拆成三个有序阶段（子 fiber、本 fiber 的服务、其余一切）。这种串行化与本地修改 6 所拥有的排空约定相抵触，并在五个包中破坏了八个测试——agent scope 铸造、terminal 名称预留、LSP setup 中止、E2B terminal setup 与会话回滚——它们无一例外都是 setup 期间释放的路径，harness 在其中断言半构建的子对象能观察到什么。两阶段变体（先服务、后其余）破坏的是同样这八个。该修复自身的目标也未达成：等到 provider 释放其服务时，`notify()` 早已把消费者从 impl 上移除，disposer 无人可等。要落地它，就得在新的顺序下重新推导这些约定，那是生命周期重新设计，而不是移植。
- **等待 `#54` 与 `#66` 而不是移植** —— 在各自有了复现之后被否决：`#54` 的丢失更新只需对一个仍在加载的插件调用一次 `fiber.update()`；`#66` 的挂起只需两个相互注入的插件，而一个 preset 或用户的 `cordis.yml` 都可能无意中写出来。

## Consequences

- 注册了 `internal/update` 又发生重载的插件，不再重跑其之前各代的处理器。任何依赖这种累积的 harness 代码——未发现——都会从每次更新 n 次调用变为一次。
- 抛错的 `internal/status` 观察者现在只是一条被记录的错误，仅此而已。诊断、Web UI 的 fiber 视图，以及未来任何状态遥测，都无法让它们所观察的树失败。
- `emitContained()` 是生命周期通知唯一的隔离点，因此第三个此类事件天然获得同样的行为。
- `Config` 并非 Standard Schema 的插件，现在会在 `apply()` 运行之前以一条指明约定的消息注册失败。
- 在插件仍在加载时到达的更新，由它自己的代次来应用，而不是被它所取代的那次尝试丢弃；被取代的尝试所注册的 effect 会被回卷。
- `ctx.plugin()` 现在可能抛出 `CircularDependencyError`，而此前它会返回一个永远无法激活的 fiber。每次注册都要付出一次图遍历；在 harness 启动时这相当于每次注册重访数百个节点，远低于加载插件本身的开销。
- `#110` 仍未移植，因此 provider 仍可能在消费者尚处于自身异步释放过程中时就释放资源。上面的证据是下一次尝试的起点。
- 由 `packages/boot/app-boot/tests/cordis-events.spec.ts`（钩子随代次过期、显式释放仍有效）与 `cordis-failure.spec.ts`（健康插件保持 ACTIVE、失败插件保留自身错误、无效 `Config` 被指明）覆盖。五个用例中有四个在移植前的源码上会失败。
