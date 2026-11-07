# Agent Note: 可选的 profile 采样控件

Status: implemented

[English](2026-10-24-optional-profile-sampling.md) | 中文

<a id="problem"></a>
## 问题

历史 fork 的编辑器温度控件依赖已移除的设置传输和 Host API 白名单补丁。直接将其应用于当前上游会保留这些过时依赖。

<a id="decision"></a>
## 决策

两个可选插件提供 profile 级温度覆盖和编辑器控件，在标准 bundle 中都保持禁用。Host 使用 volatile Config 字段，浏览器使用当前 Config 表单，正常请求头记录生效的标量。清除覆盖也会移除同一 agent（智能体）先前请求保留的温度。

<a id="alternatives-considered"></a>
## 考虑过的替代方案

**合并历史框架分支。** 合并预览在生命周期代码和已移除文件中出现冲突。本地安装以上游为基础；历史分支保留供单独评估。

**恢复旧设置白名单补丁。** 当前基于 Config 的表单会公开 volatile 字段并将其保存在活动 profile 中。额外 API 补丁会重复这一机制。

<a id="consequences"></a>
## 结果

此移植保留温度滑块和重置，将旧的提供方 top-p/seed 修改和框架补丁留在运行时之外。同一 profile 共用值，不同 profile 分别保存覆盖。上游已弃用该请求扩展，未来仍需承担兼容维护。
