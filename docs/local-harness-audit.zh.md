# 本地编码 Harness 审计

[English](local-harness-audit.md) | 中文

## 概述

F1. 保留 DeepSeek Harness，并采用更小的活动工具集。可选的[本地编码组合](user/guide/local-coding.zh.md)将测得的 headless 目录从 23 个工具、18,820 字节序列化 schema 降至 10 个工具、7,711 字节，同时保留已演示的问答、编辑、shell 检查及恢复流程。未复制竞争项目代码。

F2. 明确配置小窗口压缩。默认的 65,536 token 预留无法放入本地路由声明的 32,768 token 窗口与 4,096 token 输出上限。路由专用的 4,096 token 余量、摘要上限及保留量，得到有效的 24,576 token 压力触发点。此前短任务成功并未证明压缩正常工作。

F3. [Local work](user/guide/local-work.zh.md)为日常脚本与文件处理增加技能加载、任务跟踪及 Web 文件交付。本地设置将其选为新 Web 会话默认值，并通过 `dsh-work` 提供 headless 启动器。

本参考记录 2026-10-24 针对 fork 已发布本地 Ollama 基线的检查与试验，报告版本为 0.2.1-rc.3。源码/配置编辑、确定性检查、已安装本地配置、真实 Ollama 证据、远程 CI 和人工验收保持区分。

## 目录

- [现有能力](#incumbent-capabilities)
- [替代方案与机制](#alternatives-and-mechanisms)
- [社区模块](#community-modules)
- [验收证据](#acceptance-evidence)
- [剩余取舍](#remaining-tradeoffs)

<a id="incumbent-capabilities"></a>
## 现有能力

源码清单包含 365 个工作区包，其中 22 个 bundle manifest、58 个实验包。这些计数描述源码可用性。两个本地 profile manifest 均选择 base 及对应界面 bundle，未声明第三方依赖。单个插件是否激活需另行检查。

| 能力 | 可用及所选组合 | 证据或局限 |
|---|---|---|
| 文件工具与观察策略 | Base 和 Standard；Minimal 不含直接文本工具 | 真实读取及单行字面编辑成功；进程恢复后编辑需要重新读取 |
| Shell 和作业 | Base/Standard 的 shell 与作业控制；Minimal 自带持久 shell | 真实 bash 与测试成功；实验性的全局持久终端 bundle 未选择 |
| 持久化与恢复 | Base 中的 JSONL 持久化及检查点策略 | 同一会话在独立 headless 进程中恢复；对话持久化不撤销文件 |
| 上下文管理 | Token meter、压缩及输出修剪器；Web 预设分别拥有作用域实例 | 默认预留无法通过 32K 配置计算；本地路由策略修复此问题 |
| 重复与超时守卫 | Base 重复调用提醒及已声明的工具期限 | 已检查源码；精确重复会收到建议而非强制停止；未安装新 watchdog |
| 引用与插件 | 内置文件/会话引用、inventory 及插件管理器 | 已有引用界面与社区文件提及插件重叠；Custom plugin indexes 可选，未附带索引源 |
| 可选扩展 | Inspector、worktree、终端工具、Auto review、团队、browser/CUA 及 MCP 组合示例 | 源码可用；未证明在本机启用或运行；Auto review 在调用前增加同模型推理 |

新的 headless 覆盖层和自定义 Web 预设保留沙箱及审批基础设施。较小目录降低提示词成本；shell 权限仍决定命令能做什么。本地配置为 Host 及四个已有 Web 预设声明应用精确路由压缩策略，新增 Local coding 和 Local work，并为新 Web 会话选择 Local work。上游升级后，本地预设副本需进行比较。

<a id="alternatives-and-mechanisms"></a>
## 替代方案与机制

以下为一手源码检查，不是竞争 Harness 的实际运行排名。所有替代方案在此 Mac 上的延迟及工具正确性均未测量。

| 候选与固定源码 | 流程、有用机制与处理 | 成本与许可证 |
|---|---|---|
| [Oh My Pi](https://github.com/can1357/oh-my-pi/tree/0b5c27ab24719c86a5986b95ee55f4e75bc1aaa0) | 终端工作流中的项目问答、编辑及 shell；可选择活动工具和紧凑 hashline 提示。通过现有 DSH 配置采用活动工具选择。在字面编辑失败证明需求前，暂缓 hashline。 | Hashline 使用快照标签及原生 Rust/N-API 代码；按模型回退可能选择替换编辑。原生构建及另一套插件/配置系统增加维护。MIT，另有第三方声明。 |
| [OpenCode](https://github.com/anomalyco/opencode/tree/ddd9e103fe082dcb24aaf8682d7e79eb9b0dce50) | 支持 Ollama 和细粒度 allow/ask/deny 权限的对话式编码。若 DSH 交互仍有限制，保留为未来完整流程对照。 | Plan 标签本身不提供 shell 隔离；权限配置才是关键。第二套会话/配置存储存在采用成本。MIT。 |
| [Cline](https://github.com/cline/cline/tree/40c5d99031fe1128189c5b52e40638d2b7787754) | [本地模型指南](https://docs.cline.bot/running-models-locally/overview)建议紧凑提示。[影子 Git 检查点](https://docs.cline.bot/core-workflows/checkpoints)可在保留对话时回滚文件。采用提示词节制；有编辑器专用需求前暂缓安装。 | 检查点增加项目快照存储和每次工具调用的工作量。本次未测试 VSCodium 兼容性或此模型的可靠性。Apache-2.0。 |
| [Albatross](https://github.com/morganlinton/Albatross/tree/e458e4277f463a4688f127ea6ea61f5a344b64b8) | 终端 Ollama 工作流、恢复、逐轮撤销及 reset/handoff。保留为偏重恢复的替代方案，而非导入另一个 runtime。 | 已检查的检查点源码限制保留轮数、总字节及单文件大小；明确报告跳过文件与部分恢复。撤销不是通用事务回滚。MIT。 |
| [Mingbird](https://github.com/Mingbird/Mingbird-agent/tree/7a3bc35be14fcfb4b17a41b296207fe2e8cbfcec) | 按类别加载工具、prefill 预算、循环升级处理及完成检查。采用小工具目录与外部产物验证。 | 关键词类别路由及强制 finish 检查增加待维护行为。macOS 属实验支持。作者发布的基准不是此 Mac/模型的证据。代码 Apache-2.0；基准数据另为 CC BY 4.0。 |

<a id="community-modules"></a>
## 社区模块

按上下文预算、Ollama 故障、恢复及文件引用搜索得到以下上游。Registry 列表仅作为发现线索；处理结论依据所链接的源码 manifest 与文档。均未安装或执行。

| 一手源码修订 | 处理与兼容性局限 |
|---|---|
| [dsh-local-ai](https://github.com/PerryLink/dsh-local-ai/tree/a44e95f0f104ebccdd9d9883f44f3a842fcffbd4) | 此路由跳过：模型管理及云端回退重复或扩大已配置适配器的功能。声明的 peer 范围包含 0.2.1 预发布版；不证明 rc.3 的运行行为。Apache-2.0。 |
| [dsh-fetch-timeouts](https://github.com/d3vmeh/dsh-fetch-timeouts/tree/2b4e09b350e93bb2b61d0c4a25f5bb5bbaa60a68) | 出现明确静默流超时前暂缓。它包装 Node 全局 dispatcher，影响无关 fetch；延长期限也会延迟发现失效连接。Node 范围允许本地 runtime；未测试 rc.3 执行。MIT。 |
| [dsh-context](https://github.com/bowenliang123/dsh-context/tree/5742e672225b4b5ceb72e69f152321a864111bfa) | 内置统计与请求头检查无法回答具体问题前，暂缓上下文 dashboard。宽泛 peer 范围不证明运行时兼容。Apache-2.0。 |
| [dsh-at-file](https://github.com/FSMargoo/dsh-at-file/tree/da602d1a8f1b417b8a1d8d4059e0f4cb1c353524) | 跳过重叠的文件提及功能。发现的 registry 条目描述旧 owner/修订与过时配置；当前原生文件/会话引用已覆盖核心流程。MIT。 |
| [dsh-session-insights](https://github.com/GreenLv/dsh-session-insights/tree/7a1b21dbb867da9c7cda573e7e4d5c00be1a53a0) | 暂缓回顾分析。Manifest 声明 DSH >=0.2.1-rc.2；当前确定性 metrics 模式离线运行，可选语义分析使用已配置模型。其本身不改善执行可靠性。MIT。 |

<a id="acceptance-evidence"></a>
## 验收证据

真实 fixture 含缺少 Unicode casefold 的标签函数、四个独立断言、README 及合成设置标记。仅函数的规范化行被修改。M5 Pro 拥有 64 GB RAM；试验中 Ollama 0.40.3 报告已加载的上下文分配为 65,536 token，与 Harness 的 32K 预算不同。

| 检查 | 观察结果 |
|---|---|
| 相同项目问题，基线 | 正确且引用源码的回答；49.92 秒；首请求 5,672 个未缓存输入 token |
| 相同问题，精简组合 | 正确且引用源码的回答；27.12 秒；首请求 2,633 个未缓存加 28 个缓存输入 token，合计输入约减少 53% |
| 恢复、编辑与检查 | 53.82 秒；两个失败断言变为四个通过；首次编辑被拒绝，重新读取后成功；仅改一行 |
| 新进程跟进 | 31.76 秒；根据 README 指引从一次缺失文件读取恢复，回忆标记及修改行，四个测试通过 |
| 临时较低触发点的真实压力压缩 | 106.19 秒；一个持久摘要保留标记及修改行；后续未缩短的摘要被拒绝，当前轮正确继续 |
| 通用脚本与 CSV 流程 | 通过已安装启动器耗时 95.69 秒；加载技能、检查 CLI、验证准确的 CSV 计数与总额，输入不变 |
| 恢复后扩展脚本 | 193.25 秒；添加 Decimal 最低金额选项；此前失败的阈值测试和已有默认输出测试均通过，并已独立重跑 |
| 无凭据录制会话 | 一个新增 `local-coding-tools` 场景通过已提供 headless profile 刷新并回放；保留精确目录及 bash 输出 |
| Web 组合 | 确定性适配器：11 个工具含用户提问、明确 32K 路由、有上限的摘要请求、已存替换及继续 |

真实压缩试验临时将触发点降至 15%、保留量降至 1,024 token，以便不生成 24K 历史也能检验恢复；它不测量正常阈值的性能。4,096 token 余量及摘要上限保持不变。

时间是单次观察，不是速度排名：基线经历冷模型加载，精简问题使用热模型。输入计数包含 provider 报告的缓存统计；序列化 schema 字节不等于 token。未使用付费 provider 或竞争 runtime。仓库产物不包含私有机器日志、认证 URL 或私有研究内容。

<a id="remaining-tradeoffs"></a>
## 剩余取舍

R1. Local coding 有意省略技能、图像、网页及委派；Local work 增加技能与任务跟踪。需要这些能力时使用 Standard；本地路由在那里仍需要作用域内压缩策略。已有会话保留旧预设修订。

R2. 会话恢复不是文件回滚。试验保留合成或隔离工作区。只有普通 Git 检查点不足时，Cline/Albatross 式撤销才是后续优先候选。

R3. 此处证据不足以支持整体移植历史框架补丁、安装全局超时修改、增加强制完成循环，或恢复按模型温度、top-p、seed 控制。历史分支保持保留；单项修复需要复现当前故障。

## 开发说明

仓库示例是可选源码配置，不是新增默认 bundle。所属指南描述配置与恢复行为；测试及录制场景负责可重复验收。未声称远程 CI、跨平台运行试验或人工验收通过。
