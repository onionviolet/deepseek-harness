# Agent Note: Resync vendored Cordis onto upstream head

Status: implemented

[English](2026-09-05-resync-vendored-cordis-head.md) | 中文

## Problem

[上一次同步](2026-08-24-resync-vendored-cordis.md)把 `vendor/cordis/src` 停在 `8cc9e33fab69`，其余内置的 Cordis 包则停在一个已经无法访问的镜像提交上。此后上游又向 core、loader、include、timer 与 hmr 发布了十二个 `src` 提交：fiber 与事件总线上的四个正确性修复、一条新的服务解析规则、loader 对 Node 内部模块加载器的运行时形状探测，以及 HMR 局部重载的重写。其中两个不只是整洁问题。`cordiverse/cordis#51` 让监听器桶以 symbol 为键，并阻止未注册的事件名落到 `Object.prototype` 上；`cordiverse/cordis#44` 让 waterfall 的续延只能取用一次，而 agent loop、工具流水线与 LLM 流式输出都包裹着这一分发模式。

loader 的那个修复本就出自本仓库：上游从一个 deepseek-harness 提交移植了它，而该提交从未在这里落地，于是仓库继续携带着自己早已诊断出的缺陷——按 Node 主版本号给加载器打标签，会把 24.0–24.11.1 的每个运行时误判为 v2 形状，并以颠倒的参数调用 `resolveSync`。

## Decision

按上游顺序把十二个上游 `src` 提交中的十一个逐个拣选到内置树上，每次都作为三方合并执行（以该提交的父提交为 base、内置文件为 ours、该提交为 theirs），并把清单中每一行 Cordis 包都提升到 `303cfd21e41a`。第十二个被推迟，并记为一条本地修改，因此清单依然读作「上游位于该提交，加上已记录的修改」。

清单的 Upstream repo 列现在对全部七个 Cordis 包都写 `cordiverse/cordis`。其中五个原先指向已无法解析的 `deepseek-harness/cordis` 镜像，而搬运过来的每个提交都取自上游仓库，因此该列记录的是代码真正可被找到的位置。

被推迟的是 `4cfd19ad`。它把服务访问解析到定义处（def site）——即执行该访问的代码所属的服务——而不是取到该值时所经过的上下文。harness 会通过服务交出的对象去访问服务（`agent.ctx.systemPrompt`、从 `ctx.agents` 取回的 `Agent`），并依靠 Typert 网关放在上下文上的属性来识别调用方上下文；在新规则下，这些读取会按提供方服务的 inject 解析，网关的 identity 回调也不再看到调用方扩展出的那个上下文。gateway、apiproxy、goal 与 pi-ai 的测试套件在它之下会失败。采纳它意味着重新设计调用方身份如何穿过 Typert 客户端，以及每一处 `x.ctx.<service>` 读取——这是需要单独作出的决定，而不是内置同步的一部分——因此 `reflect.ts` 与 `utils.ts` 作为本地修改 21 保留原先的解析方式。

有两处搬运过来的改动与本地修改正面相遇：

`10194de3d` 让失败的 fiber 不再因为被注入的服务重新加载而重入生命周期——插件体自身抛出的错误，不会因为一次无关的依赖变化而变得正确。本地修改 15 惰性求值条目配置，因此失败也可能来自针对当前 epoch 所指服务求值 `!!js` 表达式。现在 fiber 会记录失败属于两者中的哪一种：插件体失败沿用上游规则，而配置求值失败会在下一次 epoch 变化时重入，因为该 epoch 正是表达式求值的输入。若不作此区分，一个表达式读到了短暂配置错误的 provider 的行会一直失败到进程重启，任何用户编辑都无法恢复它。

`1c1a10e` 把 `internal/dispatch` 的事件名放宽为 `string | symbol`。读取每一次分发的两个 harness 不变量伴生插件（`dsh-scope`、`dsh-workflow`）对 symbol 名提前返回：harness 的事件映射以字符串为键，因此没有任何 symbol 事件是 scoped 事件或 workflow 事件。

内置 HMR 服务恢复上游的 `@Inject('loader')` / `@Inject('timer')` 装饰器。此前一次改动把它们换成了 `static inject` 却未记录该分歧；装饰器在这里同样能编译、行为一致，因此这处未记录的分歧被移除而不是被追认。

每个搬运过来的修复都由一个在修复前源码上会失败的测试钉住，位于 `packages/boot/app-boot/tests/`：`cordis-events.spec.ts`（symbol 与原型属性名事件、单次可用的 waterfall 续延）、`cordis-failure.spec.ts`（失败的 fiber 不重入、`update()` 报告失败且不留下未处理拒绝）、`cordis-timer.spec.ts`（并发的 interval 读取）、`loader-shape.compat.spec.ts`（加载器形状探测），以及 `hmr-reload.spec.ts`（模块重载、失败的重建保持失败、没有 loader internals 时的 HMR）。上游失败规则的惰性配置例外由 `user-patches.spec.ts` 中的 provider 替换用例钉住，它在未作适配的上游守卫下会失败。

`cordis-failure.spec.ts` 会注册故意失败的插件，因此它在 `scripts/test-invariants.ts` 中被列为手工拓扑套件：把一次故意的失败并入共享的不变量启动屏障，会让本次运行中其他每个根插件都失败。

## Alternatives considered

- **把上游 `src/` 覆盖过来再重新施加日志中的修改** —— 与上次同样的理由被否决：修改 6、8、12、15 对 `fiber.ts`、`events.ts`、`entry.ts` 与 HMR 监视器的重写，已经使日志无法当作一串可重放的补丁来读。逐提交合并让每个提交只承载一种行为，并让每个搬运过来的修复都能被测试钉住。
- **只取 core 的修复，HMR 停在旧的局部重载** —— 否决。这次重写正是嵌套条目树可被重载的前提：没有它，一个正在被重建的宿主之下的过期插件会被注册两次，而格式错误的导出会先卸载正在运行的实例、然后无法替换它。这两条路径在一次普通的 `dsh` 编辑保存中都可达。
- **原封不动保留上游的失败 fiber 规则** —— 否决：它会困住任何一次惰性配置表达式失败过的行，而 harness 自身的补丁叠加流程只要 provider 一时配置有误就会产生这种情况。相对地，放弃本地修改 15 从来不是可选项；正是这套延后求值让 `!!js` 表达式能看见被注入的服务。
- **搬运 `4cfd19ad` 并改造 harness 的调用处** —— 本次否决：它破坏的读取并非少数几处测试便利写法，而是 Typert 网关的调用方身份机制，以及横跨四个包的 `x.ctx.<service>` 模式。在一次内置同步里改造它们，等于把一个产品决策埋进框架升级。记为本地修改 21，使下一次同步从一个明确立场出发，而不是重新发现这处冲突。
- **在 HMR 中保留 `static inject` 并记录它** —— 否决：分歧需要理由，而这里没有理由。上游的装饰器通过同样的测试。
- **在上游采纳日志条目 13 之后重新编号** —— 否决：已实现的 Agent Note 以编号引用这些条目。条目 13 原地标记为已退役，编号保持稳定。

## Consequences

- 若干行为变化会传达到插件作者：waterfall 监听器只能取用一次 `next()`（第二次调用会抛错）；`Fiber.update()` 返回一个可等待值，其拒绝已被预先处理，因此丢弃返回值不再有未处理拒绝的风险，而等待它仍然能观察到失败。`docs/cordis-primer.md` 记载了续延规则。
- symbol 键的事件可被分发，且以 `Object.prototype` 属性命名的事件不再解析到该方法上。今天没有 harness 事件使用这两种形式；不变量伴生插件是显式跳过 symbol 名，而不是碰巧没踩到。
- 现在没有 Node loader internals 时 HMR 也能启动，并一次性警告模块重载已关闭，同时配置重载继续工作。在 `node-addon-require-builtin` 无法加载的沙箱或运行时中，它是降级而不是启动失败。
- `packages/boot/app-boot/tests/` 新增五个内置框架套件。HMR 的嵌套条目用例把其夹具模块写在该包的 `tests/` 目录内，因为位于系统临时目录的夹具无法解析工作区包。
- 内置 core 在行为上落后上游一个提交，而清单写的是 head。本地修改 21 即是这条记录；代价是：读者若把 `reflect.ts` 与 `utils.ts` 同 `303cfd21e41a` 对照，会看到一处需要由日志解释的差异。
- HMR 重载阶段的上游祖先跳过路径是向前覆盖的，但在这里无法被证伪：嵌套条目用例在修复前的源码上同样通过，因为 harness 的 Loader 与 Include 修改让这一批次的结算顺序与上游夹具不同。其余 HMR 用例在缺少各自修复时都会失败。

## Related

有四个开放的上游拉取请求，重新实现了本仓库已作为本地修改携带的行为——`#116`（为更早补丁插入的行再打补丁，修改 11）、`#47`（串行化的 include 写入，修改 14）、`#96` 与 `#91`（卸载期间的注册与 effect 排空，修改 6）。其中任何一个合并后，对应的日志条目就会像条目 13 刚刚那样退役。

另有三个开放的拉取请求选择移植而非等待，见[单独的 Agent Note](../bug-fix/2026-09-05-port-open-cordis-fixes.md)：`#56`（fiber 作用域的 `internal/update` 监听器从不过期）、`#55`（未加隔离的 `internal/status` 观察者）与 `#104`（`Config` 并非 Standard Schema 时的模糊失败）。
