# 本地脚本与文件工作

[English](local-work.md) | 中文

## 概述

Local work 适用于已有脚本、文本和 CSV 处理、小范围脚本修改及项目问答。它在精简编码工具集上增加技能加载与任务跟踪；Web 还提供用户提问和文件交付。本地模型、沙箱、审批策略及持久会话基础设施保持相同。

## 目录

- [运行任务](#run-a-task)
- [使用 Web 预设](#use-the-web-preset)
- [加载脚本说明](#load-script-instructions)
- [检查结果](#check-results)

<a id="run-a-task"></a>
## 运行任务

[启动器](../../../apps/cli/config/examples/local-work/run.sh)使用已提供的 headless profile 和 [Local work 覆盖层](../../../apps/cli/config/examples/local-work/headless.patch.yml)。将 `harness_checkout` 设为检出的绝对路径，从文件所在目录运行：

```sh
"$harness_checkout/apps/cli/config/examples/local-work/run.sh" "Explain the script and its inputs. Make no changes."
```

本地 wrapper 可将此启动器提供为 `dsh-work`。它保留当前目录并透传 headless 选项。使用 `--json` 获取持久会话 id，随后调用可通过 `--session-id <id>` 继续任务。启动器使用已有 `dsh` 命令及其配置的 Node runtime；不会启动另一个 agent 服务。

<a id="use-the-web-preset"></a>
## 使用 Web 预设

[Web 覆盖层](../../../apps/cli/config/examples/local-work/web.patch.yml)声明自定义 `local-work` 预设。可将其作为 profile 层或调用覆盖层，在尚无该声明的 profile 中应用一次。已配置的 profile 不应再次追加同一声明。在常规设置中选择 Local work 作为新会话默认值。已有会话保留之前的预设。

创建或编辑文件的任务应选择 Workspace write；选择预设不会改变访问模式。

预设包含直接文件工具、搜索、shell、作业控制、技能、todo、用户提问及用于已验证输出文件的 `present`。它省略委派、模型支持的网页搜索、插件管理及图像工具。这些省略降低提示大小；不限制 shell 命令能做什么。权限模式仍负责隔离。

<a id="load-script-instructions"></a>
## 加载脚本说明

附带的 [local-scripts 技能](../../../apps/cli/config/examples/local-work/skills/local-scripts/SKILL.md)涵盖脚本检查、已有环境、输出验证及恢复。将其置于 `$DSH_HOME/skills/local-scripts/SKILL.md`，正常的文件系统技能提供方即可发现。替换前先比较已有文件。项目专用指令与技能仍通过正常项目根目录提供。

运行陌生脚本时，可要求模型使用 `local-scripts`。摘要不等于完整流程：模型必须先加载技能再遵循其内容。

<a id="check-results"></a>
## 检查结果

有效请求应指明输入、脚本、输出目录及预期结果。例如：检查脚本与帮助，将 CSV 汇总到新输出文件，验证计数和总额，并保持输入不变。包含空格的路径需要引号。

修改脚本时，先复现失败，再进行有限编辑并运行检查。查看实际文件，不仅看模型的完成消息。浏览器 userscript 可作为代码检查和测试；安装到浏览器或提交门户数据是独立操作。

Local work 不是无人值守调度器。发送、提交、花费、发布及删除用户数据仍需要针对具体操作的授权。

## 开发说明

Web 组合测试检查 14 个工具的目录，并通过隔离文件系统提供方加载附带脚本技能。`local-work-tools` 录制会话场景检查 headless 覆盖层。真实合成脚本验证记录应保存在本地证据中，不应将私有项目日志复制到仓库。
