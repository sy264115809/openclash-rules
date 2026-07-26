# OpenClash 规则助手浏览器扩展

此扩展会将当前标签页域名写入 GitHub 仓库中的 `rules/*.yaml`，自动去重并提交。

## 安装

1. 在 Chrome 打开 `chrome://extensions`，或在 Edge 打开 `edge://extensions`。
2. 开启“开发人员模式”。
3. 点击“加载已解压的扩展程序”。
4. 选择本目录 `browser-extension`。

## 配置

1. 点击扩展图标，选择“设置”。
2. 填写 GitHub 用户名、仓库名 `openclash-rules` 与分支名 `main`。
3. 创建 Fine-grained Personal Access Token：只选择该仓库，并授予 **Contents: Read and write**。
4. 粘贴令牌并保存。

规则仓库必须保持公开，才能让路由器从 `raw.githubusercontent.com` 下载规则文件。令牌只保存在浏览器本地，不会上传到规则 YAML。

## 使用

浏览目标网页后点击扩展图标，确认域名、规则类型和目标分组，点击“添加并推送到 GitHub”。域名默认去掉 `www.`；若需指定子域名，可自行修改输入框内容，并选择“仅当前主机名”。
