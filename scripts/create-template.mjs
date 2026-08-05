#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const [sourceArgument, targetArgument] = process.argv.slice(2);

if (!sourceArgument) {
  console.error("用法：npm run create-template -- <完整配置文件> [模板输出路径]");
  process.exit(1);
}

const source = path.resolve(sourceArgument);
const target = path.resolve(targetArgument || path.join(root, "template", "default.yaml"));
if (!fs.existsSync(source)) {
  console.error(`找不到源配置：${source}`);
  process.exit(1);
}

const lines = fs.readFileSync(source, "utf8").split(/(?<=\n)/);
const start = lines.findIndex((line) => /^proxies:\s*$/.test(line.trimEnd()));
if (start < 0) {
  console.error("源配置中未找到顶层 proxies: 块。");
  process.exit(1);
}

const finish = lines.findIndex((line, index) => index > start && /^\S/.test(line));
if (finish < 0) {
  console.error("源配置中的 proxies: 块没有结束位置。");
  process.exit(1);
}

const replacement = [
  "# 节点由 scripts/update-proxies.mjs 生成时填充；请勿提交生成的 dist 文件。\n",
  "# __PROXIES_PLACEHOLDER__\n",
  "\n"
];
let template = [...lines.slice(0, start), ...replacement, ...lines.slice(finish)].join("");
const providerLines = template.split(/(?<=\n)/);
const providerStart = providerLines.findIndex((line) => /^proxy-providers:\s*$/.test(line.trimEnd()));
if (providerStart >= 0) {
  const providerEnd = providerLines.findIndex((line, index) => index > providerStart && /^\S/.test(line));
  const finish = providerEnd < 0 ? providerLines.length : providerEnd;
  template = [...providerLines.slice(0, providerStart), "proxy-providers:\n", "  # 本地模板不保存订阅地址；生成 dist 配置时按订阅内容与本地注入设置合并。\n", ...providerLines.slice(finish)].join("");
}

// 个人规则统一由 template/custom.yaml 在生成最终配置时叠加，默认模板不保存副本。
template = template.replace(/^x-rule-set-custom:.*\r?\n/m, "");
const ruleLines = template.split(/(?<=\n)/);
const ruleStart = ruleLines.findIndex((line) => /^rules:\s*$/.test(line.trimEnd()));
if (ruleStart >= 0) {
  const ruleEnd = ruleLines.findIndex((line, index) => index > ruleStart && /^\S/.test(line));
  const finish = ruleEnd < 0 ? ruleLines.length : ruleEnd;
  const rules = ruleLines.slice(ruleStart + 1, finish)
    .filter((line) => !/^\s+- RULE-SET,Custom[A-Za-z]+,/.test(line))
    .filter((line) => !/^\s*# 个人规则：/.test(line));
  template = [...ruleLines.slice(0, ruleStart), "rules:\n", ...rules, ...ruleLines.slice(finish)].join("");
}

fs.writeFileSync(target, template, "utf8");
console.log(`已生成不含节点的模板：${target}`);
console.log("模板中的 proxy-providers 与 Custom 片段已清空；Custom 统一由 template/custom.yaml 叠加。");
