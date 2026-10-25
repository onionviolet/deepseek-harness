---
description: "为模型请求提供可选的 profile 级温度覆盖。"
kind: "package-reference"
---

# @deepseek-ai/dsh-llm-sampling

[English](README.md) | 中文

## 概述

为模型请求提供可选的 profile 级温度覆盖。

## 目录

- [使用本包](#use-this-package)
- [开发备注](#dev-note)
- [模型体验](#model-experience)
- [已知限制与延期工作](#known-limitations-and-deferred-work)

<a id="use-this-package"></a>
## 使用本包

在 profile 补丁中启用 `llm-sampling`。其 volatile `temperature` 接受 0 到 2；省略该值会恢复适配器默认值，即使先前请求已保存温度也一样。监听器通过请求 waterfall 委派，并保留其他请求控制。编辑器通过标准表单修改同一 Config。home 层的温度优先于 profile 编辑。

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

- 同一 profile 内的所有模型和 Session 共用温度。Web 与 headless profile 分别保存覆盖值。本插件不提供按模型设置、`/temp`、top-p 或 seed。上游已弃用 `agent/request` 扩展；移除该扩展时需要替代实现。
