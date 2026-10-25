---
description: "为 Host 采样插件提供可选的编辑器滑块、数值输入框和 Auto 重置。"
kind: "package-reference"
---

# @deepseek-ai/dsh-client-ui-sampling

[English](README.md) | 中文

## 概述

为 Host 采样插件提供可选的编辑器滑块、数值输入框和 Auto 重置。

## 目录

- [使用本包](#use-this-package)
- [开发备注](#dev-note)
- [模型体验](#model-experience)
- [已知限制与延期工作](#known-limitations-and-deferred-work)

<a id="use-this-package"></a>
## 使用本包

在 Web profile 中启用 `ui-sampling`，同时启用 Host 的 `llm-sampling`。控件提供 0 到 2、步长 0.05 的选择。数值输入立即写入；拖动则在指针释放、调整键释放或失焦时写入。Auto 移除 profile 覆盖。已接受的 Host 快照保持权威；写入失败时显示错误。标签支持英文和中文。

<a id="dev-note"></a>
## 开发备注

这两个插件在标准 bundle 中保持禁用。配置和验证方法见[本地设置指南](../../../docs/local-setup.zh.md)。

<a id="model-experience"></a>
## 模型体验

<a id="request-temperature"></a>
### 请求温度

<a id="what-the-model-sees"></a>
#### 模型看到什么

Host 采样插件设置 `temperature` 标量，并由正常请求头记录。两个插件都不添加提示词文本。提供方决定该标量是否影响生成。

<a id="token-effect"></a>
#### token 影响

不添加输入 token。采样可能改变生成内容及其长度。

<a id="kv-cache-effect"></a>
#### KV Cache 影响

编辑温度不会改变提示词前缀。

<a id="known-limitations-and-deferred-work"></a>
## 已知限制与延期工作

- 同一 profile 的 Session 共用温度。本控件不会改变 Ollama 的上下文分配，也不提供其他采样参数。
