# 订阅注入规则

此目录用于保存仅在本机使用的订阅地址。`*.txt` 已被 Git 忽略，避免订阅凭据进入仓库。

## Primary 订阅

在 `sub-inject.txt` 或 `inject.txt` 中写入一个完整的 `http://` 或 `https://` URL，且文件中只能有这一行有效内容。生成 `dist` 下的完整配置时，脚本会加入：

```yaml
proxy-providers:
  Primary: {<<: *base-provider, url: '文件中的 URL', override: {additional-prefix: '[P] '}}
```

脚本按以下优先级选择 URL：

- 运行 `npm run update-proxies` 时交互输入的 Primary URL。
- `subscription/sub-inject.txt`。
- `subscription/inject.txt`。

两个文件都不存在或内容无效时，不添加 `Primary`。

`openclash-tmp.yaml` 只保留空的注入标记，不保存实际订阅 URL；运行 `create-template` 重新生成模板时也会清空该区域。
