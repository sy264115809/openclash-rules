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

`openclash-tmp.yaml` 是不含节点的配置模板。运行以下命令后，脚本会交互式读取一次性订阅地址，原样提取其中顶层 `proxies` 块，并生成不纳入 Git 的 `dist/openclash-YYYYDDMM.yaml`：

```bash
npm run update-proxies
```

每次请求的原始响应会同时保存为 `dist/subscription-YYYYDDMM.txt`，即使解析失败也会保留，便于本地排查订阅格式。该目录已在 `.gitignore` 中忽略，且文件权限仅限当前用户读取；其中可能含有节点凭据，请勿分享或提交。

脚本也支持 Base64 编码的 AnyTLS URI 订阅，会转换为 Mihomo 的 `proxies` YAML 节点。其他 URI 类型请在机场面板切换为 Clash/Mihomo YAML 格式后再使用。

若需要重新分析已保存的响应而不再次请求订阅，可运行：

```bash
npm run update-proxies -- --response-file dist/subscription-YYYYDDMM.txt
```

如需以当前完整配置重新生成模板，可运行：

```bash
npm run create-template -- /路径/到/完整配置.yaml
```
