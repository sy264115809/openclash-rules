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
