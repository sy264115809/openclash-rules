# OpenClash 自定义规则

本仓库用于维护个人 OpenClash / Mihomo 规则。每个文件按处理方式拆分，避免在规则文件中混入策略组名称。

| 文件 | 在主配置中的目标策略 |
| --- | --- |
| `rules/reject.yaml` | `REJECT` |
| `rules/direct.yaml` | `DIRECT` |
| `rules/proxy.yaml` | `国外流量` |
| `rules/us.yaml` | `美国策略` |
| `rules/jp.yaml` | `日本策略` |
| `rules/tw.yaml` | `台湾策略` |

规则使用 Mihomo 的 `classical` 格式。修改后提交并推送到 GitHub；路由器按主配置中 `interval` 指定的周期下载更新。

请勿在本仓库提交订阅链接、节点地址、密码或其他凭据。

## 更新临时订阅节点

脚本默认提供 [666OS/YYDS 中文模板](https://github.com/666OS/YYDS/tree/main/mihomo/config/cn) 的远程选择：Pro、Lite、Mini；也可选择本地 `openclash-tmp.yaml`。运行时会交互式选择模板、读取一次性订阅地址，并在不纳入 Git 的 `dist/subcription-YYYYMMDD/` 目录生成完整配置：

```bash
npm run update-proxies
```

也可以跳过交互式模板选择：

```bash
npm run update-proxies -- --template pro
npm run update-proxies -- --template lite
npm run update-proxies -- --template mini
npm run update-proxies -- --template local
```

远程模板生成时，脚本会叠加本地 `openclash-tmp.yaml` 中的 `Custom` 片段：`x-rule-set-custom`、`Custom*` 规则提供者和置顶的 `Custom*` 规则。订阅内容中的 `proxies:` 与 `proxy-providers:` 也会一并注入输出；本地 `subscription/sub-inject.txt` 中的 Primary 地址仍会合并，除非订阅本身已定义 `Primary`。

主订阅输入完成后，脚本还会询问要注入 `proxy-providers.Primary` 的订阅 URL。交互输入优先级最高；直接回车时依次读取 `subscription/sub-inject.txt`、`subscription/inject.txt`。模板本身只保留空注入标记，实际 URL 仅写入已被 Git 忽略的 `dist` 配置。详细规则见 [`subscription/README.md`](subscription/README.md)。

每次解析的目录中包含：`raw.txt`（原始响应）、`parsed.yaml`（解析后的 YAML）、`proxies.yaml`（拆分节点）和 `openclash.yaml`（最终完整配置）。成功后 `dist/latest` 会以符号链接指向最近一次解析目录。

交互输入订阅地址时可直接留空，脚本会使用 `dist/latest/parsed.yaml` 中的最新结果填充节点，无需再次访问一次性链接。`dist` 已在 `.gitignore` 中忽略，且文件权限仅限当前用户读取；其中可能含有节点凭据，请勿分享或提交。

脚本也支持 Base64 编码的 AnyTLS URI 订阅，会转换为 Mihomo 的 `proxies` YAML 节点。其他 URI 类型请在机场面板切换为 Clash/Mihomo YAML 格式后再使用。

若需要重新分析已保存的响应而不再次请求订阅，可运行：

```bash
npm run update-proxies -- --response-file dist/subcription-YYYYMMDD/raw.txt
```

如需以当前完整配置重新生成模板，可运行：

```bash
npm run create-template -- /路径/到/完整配置.yaml
```
