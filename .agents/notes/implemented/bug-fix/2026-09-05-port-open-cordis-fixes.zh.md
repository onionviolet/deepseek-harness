# Agent Note: Port three open upstream Cordis fixes

Status: implemented

[English](2026-09-05-port-open-cordis-fixes.md) | 中文

## Problem

内置 Cordis fiber 中有三个缺陷在[同步到上游 head](../process/2026-09-05-resync-vendored-cordis-head.md) 之后依然存在，因为上游尚未合并它们的修复：三者都躺在开放的拉取请求里，且都能从 harness 的日常运行中触达。

非 global 的 `ctx.on('internal/update')` 从未成为 fiber 的 effect。该注册在进入普通监听器路径之前就被截获并压入 `fiber._hooks`，而返回给调用方的是列表条目自身的 disposer——fiber 卸载时没有任何东西移除该条目。Fiber 实例会在重载中存活，于是每一代都留下自己的闭包：三次配置更新会派发六次监听器调用，且次数随每次重载增长。Loader 自身的 `internal/update` 处理也搭在这条链上，因此一次条目配置更新会重跑之前每一代的处理器。

`_updateState()` 通过 `emit()` 发出 `internal/status`，而 `emit()` 在一个未加隔离的循环中运行监听器——并且是在生命周期转换内部。于是一个抛错的诊断观察者会被 Fiber 构造函数捕获并写入 `_error`：对一个已干净应用的插件，`await plugin` 却拒绝；而当插件确实失败时，观察者的错误又会覆盖它，使 `FAILED` 指向错误的原因。本地修改 6 早已因同样的理由隔离了兄弟事件 `internal/plugin`；`internal/status` 却仍未隔离。

`resolveConfig()` 假定每个真值的插件 `Config` 都暴露 `~standard.validate`。插件就是被导入模块所导出的任意值，因此一个并非 Standard Schema 的 `Config`——一个普通对象、来自不匹配大版本的 Zod schema、或作者本意作为默认值的值——会在校验器内部以 `Cannot read properties of undefined (reading 'validate')` 失败，既不指出插件，也不指出它缺失的约定。

## Decision

把 [cordiverse/cordis#56](https://github.com/cordiverse/cordis/pull/56)、[cordiverse/cordis#55](https://github.com/cordiverse/cordis/pull/55) 与 [cordiverse/cordis#104](https://github.com/cordiverse/cordis/pull/104) 移植进内置树，记为本地修改 22、23 与 24，使下一次同步显式地重新施加或退役它们。

更新钩子的注册改为 `fiber.effect(() => hooks[method](listener), 'ctx.on("internal/update")')`。该条目由添加它的那一代所有，并随该代的卸载消失，而显式 disposer 在该代内仍然有效。

`internal/status` 与 `internal/plugin` 现在共用一个 `emitContained()` 辅助函数：它自行解析监听器集合，在各自的 `try` 中调用每个监听器，并记录同步抛出与返回的拒绝。上游为 status 单独写了第二个自由函数；harness 早已为插件拆卸持有同一段隔离循环，因此这两个通知是一个辅助函数加两个薄封装，而不是同一段循环的两份拷贝。

这两个事件的观察者既不拥有 fiber 状态，也不拥有 fiber 的错误。这正是隔离所表达的不变量：失败的诊断就是失败的诊断，而不是失败的插件。

`resolveConfig()` 会检查 `Config['~standard'].validate` 是否可调用，否则抛出 `plugin Config must implement Standard Schema V1`。这是模块边界上的校验，而不是对同进程接口的防御式类型检查：该值是从 Loader 导入的文件跨入进程的。

## Alternatives considered

- **等待上游合并这两个 PR** —— 否决：更新钩子的泄漏随每次重载增长，而 `dsh` 在每次配置编辑时都会重载。日志条目带有上游链接，未来的同步若发现它们已合并，就退役条目而不是重新施加。
- **像上游那样用第二个自由函数隔离 `internal/status`** —— 否决：harness 已用同一段循环隔离 `internal/plugin`。同一条隔离规则的两份拷贝迟早会漂移；共用辅助函数正是这处重复所要求的提取。
- **在 `_unload()` 中清空 `fiber._hooks`，而不是注册 effect** —— 否决：那会丢掉*当前*这一代在卸载期间注册的监听器，并且重新实现了 effect 系统已提供的所有权。effect 还让这次注册在 fiber 诊断中拥有一个标签。
- **顺带移植过期代次修复（[#54](https://github.com/cordiverse/cordis/pull/54)）** —— 推迟：它把 epoch 重新设计为期望状态快照加代次序号，且改动的文件承载着最重的本地修改，同时也未找到 harness 可触达的复现（恢复的 provider 会取得新的 `uid`，因此 epoch 字符串不会重复）。它与 `#110`（provider 拆卸相对消费者的顺序）和 `#66`（注入环检测）一同留在候选清单上。

## Consequences

- 注册了 `internal/update` 又发生重载的插件，不再重跑其之前各代的处理器。任何依赖这种累积的 harness 代码——未发现——都会从每次更新 n 次调用变为一次。
- 抛错的 `internal/status` 观察者现在只是一条被记录的错误，仅此而已。诊断、Web UI 的 fiber 视图，以及未来任何状态遥测，都无法让它们所观察的树失败。
- `emitContained()` 是生命周期通知唯一的隔离点，因此第三个此类事件天然获得同样的行为。
- `Config` 并非 Standard Schema 的插件，现在会在 `apply()` 运行之前以一条指明约定的消息注册失败。
- 由 `packages/boot/app-boot/tests/cordis-events.spec.ts`（钩子随代次过期、显式释放仍有效）与 `cordis-failure.spec.ts`（健康插件保持 ACTIVE、失败插件保留自身错误、无效 `Config` 被指明）覆盖。五个用例中有四个在移植前的源码上会失败。
