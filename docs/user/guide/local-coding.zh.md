# 使用较小工具目录进行本地编码

[English](local-coding.md) | 中文

## 概述

可选的本地编码覆盖层适用于纯文本项目问答、定点文件编辑和 shell 检查。它们复用已提供的工具、沙箱、审批策略、持久会话及守卫。[审计](../../local-harness-audit.zh.md)记录测得的收益与局限。

## 目录

- [选择覆盖层](#choose-an-overlay)
- [配置压缩](#configure-compaction)
- [继续与恢复](#continue-and-recover)
- [验证](#verification)

<a id="choose-an-overlay"></a>
## 选择覆盖层

将 `harness_checkout` 设为源码检出的绝对路径。从要检查的临时项目运行以下命令，使用已安装的 `dsh` 启动器和已配置的模型路由。

```sh
dsh --profile headless --patch "$harness_checkout/apps/cli/config/examples/local-coding/headless.patch.yml" "Read README.md and explain this project. Make no edits."
dsh web --no-open --patch "$harness_checkout/apps/cli/config/examples/local-coding/web.patch.yml"
```

[headless 覆盖层](../../../apps/cli/config/examples/local-coding/headless.patch.yml)移除图像读取、委派、工作流、目标、网页访问、插件管理、技能、待办和计划工具。它保留文本读取、写入、字面编辑、glob、grep、shell、作业控制及工作目录选择。[Web 覆盖层](../../../apps/cli/config/examples/local-coding/web.patch.yml)新增自定义 `local-coding` 预设，提供上述能力及用户提问。在常规设置中选择 Local coding，影响随后新建的会话；已有会话保留其预设修订。覆盖层不改变默认选择。

这些是任务组合，不是安全策略。Shell 命令在所选权限模式下保留正常能力。需要改变隔离时，使用权限选择器或 headless 的 `--permission-mode`。覆盖层不授予 Full access，也不启用基于模型的 Auto review。

<a id="configure-compaction"></a>
## 配置压缩

两个示例均为精确路由 `ollama-local/qwen3.8:27b` 声明策略：4,096 token 余量、4,096 token 摘要上限和 4,096 token 保留量。在声明的 32,768 token 窗口与 4,096 token 请求输出预留下，压力触发点为 24,576 token。路由不同时，调整 provider/model 匹配及预算；这些示例值不会分配 Ollama 上下文。

[压缩包](../../../packages/compaction/compaction-basic/README.zh.md)定义策略公式与校验。默认的 65,536 token 余量无法放入此 32K 路由。一次短任务成功并不验证自动压缩：步骤压力配置无效时会警告并允许当前轮继续。

Headless 使用 Host 的 `compaction-basic` 行。Web 预设各自拥有独立作用域实例。顶层覆盖不会配置这些实例。修改已有 Web 预设时，按照[组合说明](../../../packages/preset/agent-preset/skills/editing-cordis-compositions/SKILL.md)替换其完整声明 config；保留其他插件，并更新其作用域内的压缩行。上游预设变化后，需要同步本地副本。

<a id="continue-and-recover"></a>
## 继续与恢复

Headless 在使用 `--json` 时输出会话 id。随后调用可使用相同覆盖层及工作区，通过 `--session-id` 提供该 id。恢复保留对话历史；新进程编辑已有文件前，必须重新读取以建立文件观察记录。

编辑被拒绝后，读取当前文件并重新考虑替换。命令被中断后，重试前先检查实际影响。会话持久化记录对话及工具结果；它不会恢复工作区文件。需要文件回滚时，使用临时检出或明确的 Git 检查点。

<a id="verification"></a>
## 验证

`local-coding-tools` 录制会话场景检查 headless 工具目录及 bash 输出。`apps/cli/tests/web-agent-presets.e2e.ts` 中可选本地编码用例挂载 Web 覆盖层、检查工具、通过确定性适配器压缩 32K 路由，并验证从已存摘要继续。审计区分这些检查、本地 Ollama 运行和人工验收。

## 开发说明

覆盖层不新增包或适配器。它们有意省略自动任务分类与强制完成重试；在对话中更换工具集也会改变请求前缀。
