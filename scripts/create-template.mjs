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
const target = path.resolve(targetArgument || path.join(root, "openclash-tmp.yaml"));
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
fs.writeFileSync(target, [...lines.slice(0, start), ...replacement, ...lines.slice(finish)].join(""), "utf8");
console.log(`已生成不含节点的模板：${target}`);
