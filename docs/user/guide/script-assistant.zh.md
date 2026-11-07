# 脚本本地助手

[English](script-assistant.md) | 中文

## 概述

可选的 [Python 桥接服务](../../../apps/cli/config/examples/script-assistant/bridge.py) 为浏览器脚本提供本地 JSON 端点，检查课程引文并按需进行有界的 harness 检索。它使用已安装的 Ollama 模型，不提交浏览器表单。

## 目录

- [启动服务](#start-the-service)
- [选择路径](#choose-a-path)
- [发送请求](#send-a-request)
- [检查边界](#check-the-boundaries)

<a id="start-the-service"></a>
## 启动服务

需要带有常规开发依赖的源码检出、Python 3 和可用的 `dsh` 命令。将 `harness_checkout` 设为检出的绝对路径：

```sh
python3 "$harness_checkout/apps/cli/config/examples/script-assistant/bridge.py" --dsh "$(command -v dsh)"
```

服务仅绑定 `127.0.0.1:11435`。`GET /health` 检查桥接服务，`GET /api/tags` 列出已安装的本地 Ollama 模型。Ollama 保持在 `127.0.0.1:11434`。桥接服务通过受支持的 headless 配置启动工具检索。[MCP 服务](../../../apps/cli/config/examples/script-assistant/reference-server.mjs) 使用检出中现有的官方 MCP SDK 依赖。

<a id="choose-a-path"></a>
## 选择路径

脚本请求使用同一端点。选择 `assistant.mode: always` 可在每批开始前运行 harness 检索，选择 `auto` 则仅在缺少证据时使用工具。`auto` 路径生成结构化答案，检查来源 ID 和原文引语，再让本地模型检查证据是否支持实际所选选项。不确定或无支持的答案保持空白。如果仍有未解决的问题，且课程资料库包含未使用的证据，则最多运行一次 harness 检索，并在找到新来源后重试完整批次。

`always` 在每批开始前运行检索，增加启动和工具开销，也不保证答案更好。不带 `assistant` 的请求提供通用结构化推理，没有课程审查或工具。浏览器中明确选择 Direct Ollama 会完全绕过桥接服务。所选服务失败时不会静默回退。

<a id="send-a-request"></a>
## 发送请求

`POST /api/chat` 接受含 `model`、`messages` 和 `format` JSON Schema 的 JSON。输出采用 Ollama 非流式 `message.content` 结构。桥接服务内部流式读取 Ollama 输出以支持取消。它固定温度为零，关闭 thinking，并使用 32,768 token 上下文。[Ollama 结构化输出](https://docs.ollama.com/capabilities/structured-outputs) 约束格式；客户端仍须检查内容。

课程模式的最后一条用户消息包含 JSON 对象 `questions` 和 `lessonReferences.passages`。问题具有唯一的 `id`、`type`、`stem`，以及含 `id` 和 `text` 的 `choices`。答案含 `id`、`choices`、`response`、`uncertain`、`reason`、`citations`；引文含 `sourceId` 和 `quote`。使用精确批次大小的 Schema，并在客户端再次检查 ID 和选项数量。受支持模式的请求包含 `assistant: {mode, references}`。每个来源含字符串 `id`、`page`、`title`、`text`，初始所选段落必须与资料库完全匹配。可选的 `course` 标签是客户端元数据，不是访问边界。

响应增加 `referencePassages`，包含检索找到的规范段落，以及 `assistantStatus` 和 `lookupTools`。接受返回段落前，应与原始资料库核对。仅发送当前课程资料，每批最多 20 题，请求最多 8 MiB。无效、不完整或截断的批次整体失败。问题、后端、模型或课程证据变化时，应使客户端检查点失效并阻止填入旧答案。

<a id="check-the-boundaries"></a>
## 检查边界

检索代理只接收由所提供资料包支持的 `search_references` 和 `read_reference`。原生 shell、文件系统、网络、技能及委派工具均禁用。只读权限模式本身不限制读取；边界由这两个工具的目录建立。检索使用隔离的临时 home，关闭遥测，并在完成后移除请求和会话文件。其默认预算为可配置的 300 秒；推理没有生成期限，可通过断开客户端连接取消。

HTTP 服务接受精确的回环 Host，以及无 Origin 或源码中声明的两个学习网站 HTTPS Origin。它不转发 cookie 或授权头，不记录请求正文，也不暴露任意 URL。一次只处理一个推理请求，忙时返回 429。这不协调其他使用相同 Ollama 服务的应用。依赖浏览器兼容性前，应单独测试实际用户脚本管理器的传输。

原文引语检查与第二次模型审查可减少特定错误。相同模型仍可能重复推理错误，因此这些检查不能证明正确性。不包含公网检索、OCR、音频转录、浏览器操作或自动提交。缺少课程证据时明确留空。人工审查及课程允许使用规则仍适用于预期交付物。

## 开发说明

运行 `python3 -m unittest discover -s apps/cli/config/examples/script-assistant -p test_bridge.py -v`。合成测试覆盖真实引文搭配错误答案、缺少来源、有界检索策略、格式错误批次、Origin/Host 检查、忙状态及断线取消。实时合成凭证须将模型和工具调用与浏览器安装、人工验收分别记录。

启动服务后，可运行 `python3 apps/cli/config/examples/script-assistant/smoke.py --model <installed-model>`。此可选实时检查仅使用虚构图书馆问题，要求实际检索及正确的有据答案；不访问学习网站。
