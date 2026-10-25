# 本地 Ollama 设置

[English](local-setup.md) | 中文

<a id="build-and-run"></a>
## 构建与运行

使用 `package.json` 要求的 Node 版本和固定版本的 pnpm 安装依赖，再运行 `pnpm run build`。在 checkout 中通过 `pnpm dsh web` 启动 Web profile。CLI（命令行界面）会输出经过身份验证的回环地址。请勿公开该地址或运行日志。

单次任务使用 `pnpm dsh --profile headless "your task"`。profile 补丁位于 `$DSH_HOME/profiles/<profile>/cordis.patch.yml`；home 补丁应用于所有 profile。机器路径、凭据和本地验证记录不应进入 Git。

<a id="configure-ollama"></a>
## 配置 Ollama

在 `llm-pi-ai` 条目中声明自定义 `openai-completions` 路由，设置基础地址 `http://127.0.0.1:11434/v1`、明确的模型 id 和容量，并在需要时使用本地占位 Authorization 请求头。将 `agent-default-model` 指向该路由和模型。当前配置格式见[提供方指南](user/guide/providers.zh.md)。请验证端点的推理和图像能力，不要仅凭模型名称推断。

<a id="optional-temperature-control"></a>
## 可选温度控件

将以下条目加入 Web profile 补丁。Host 条目也适用于 headless；UI 条目只用于 Web。两个插件在标准 bundle 中都保持禁用。

```yaml
- id: llm-sampling
  disabled: false
- id: ui-sampling
  disabled: false
```

[Host 插件](../packages/llm/llm-sampling/README.zh.md)负责覆盖值，[编辑器插件](../packages/client/ui-sampling/README.zh.md)负责编辑。请将温度值保存在 profile 中，而非优先级更高的 home 补丁中，以便浏览器写入生效。

<a id="verify"></a>
## 验证

`pnpm exec vitest run packages/llm/llm-sampling/tests/sampling.spec.ts` 检查实时更新、持久化请求头的一致性、同一 agent（智能体）的重置、非法输入和卸载。`sampling-temperature` 场景会在启用覆盖的真实 headless profile 中回放。本地验收还应在临时工作区测试创建文件、bash、数值持久化、Auto 重置和服务器重启。本地通过并不证明所有提供方、图像输入、远程 CI 或人工验收均已通过。
