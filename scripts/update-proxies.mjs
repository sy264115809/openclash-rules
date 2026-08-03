#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import {
  findInjectedSubscriptionUrl,
  validateSubscriptionUrl
} from "./subscription-providers.mjs";
import { composeTemplate, topLevelSection } from "./template-composer.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const templateDir = path.join(root, "template");
const defaultTemplatePath = path.join(templateDir, "default.yaml");
const customTemplatePath = path.join(templateDir, "custom.yaml");
const distDir = path.join(root, "dist");
const remoteTemplates = {
  pro: { label: "Pro", url: "https://raw.githubusercontent.com/666OS/YYDS/main/mihomo/config/cn/Pro_cn.yaml" },
  lite: { label: "Lite", url: "https://raw.githubusercontent.com/666OS/YYDS/main/mihomo/config/cn/Lite_cn.yaml" },
  mini: { label: "Mini", url: "https://raw.githubusercontent.com/666OS/YYDS/main/mihomo/config/cn/Mini_cn.yaml" }
};

function fail(message) {
  console.error(`错误：${message}`);
  process.exit(1);
}

async function promptHidden(message) {
  if (!process.stdin.isTTY) fail("请在交互式终端中运行此脚本。");
  process.stdout.write(message);
  process.stdin.setRawMode(true);
  process.stdin.resume();
  process.stdin.setEncoding("utf8");

  return new Promise((resolve, reject) => {
    let value = "";
    const onData = (chunk) => {
      for (const character of chunk) {
        if (character === "\u0003") {
          cleanup();
          reject(new Error("已取消。"));
          return;
        }
        if (character === "\r" || character === "\n") {
          cleanup();
          process.stdout.write("\n");
          resolve(value.trim());
          return;
        }
        if (character === "\u007f") {
          value = value.slice(0, -1);
        } else {
          value += character;
        }
      }
    };
    const cleanup = () => {
      process.stdin.off("data", onData);
      process.stdin.setRawMode(false);
      process.stdin.pause();
    };
    process.stdin.on("data", onData);
  });
}

async function selectOption(title, options, defaultValue) {
  if (!process.stdin.isTTY) fail("请通过命令行参数指定选项，或在交互式终端中运行此脚本。");
  let selected = Math.max(0, options.findIndex((option) => option.value === defaultValue));
  const render = (moveUp = false) => {
    if (moveUp) process.stdout.write(`\u001B[${options.length}A`);
    for (let index = 0; index < options.length; index += 1) {
      const option = options[index];
      const marker = index === selected ? "❯" : " ";
      const text = `${marker} ${option.label}${option.description ? ` — ${option.description}` : ""}`;
      process.stdout.write(`\r\u001B[2K${index === selected ? "\u001B[36m" : ""}${text}\u001B[0m\n`);
    }
  };

  process.stdout.write(`\n\u001B[1m${title}\u001B[0m（↑↓ 选择，Enter 确认）\n`);
  process.stdout.write("\u001B[?25l");
  process.stdin.setRawMode(true);
  process.stdin.resume();
  process.stdin.setEncoding("utf8");
  render();

  return new Promise((resolve, reject) => {
    const cleanup = () => {
      process.stdin.off("data", onData);
      process.stdin.setRawMode(false);
      process.stdin.pause();
      process.stdout.write("\u001B[?25h");
    };
    const onData = (chunk) => {
      if (chunk === "\u0003") {
        cleanup();
        reject(new Error("已取消。"));
      } else if (chunk === "\r" || chunk === "\n") {
        const choice = options[selected];
        cleanup();
        process.stdout.write(`已选择：${choice.label}\n`);
        resolve(choice.value);
      } else if (chunk === "\u001B[A" || chunk === "k") {
        selected = (selected - 1 + options.length) % options.length;
        render(true);
      } else if (chunk === "\u001B[B" || chunk === "j") {
        selected = (selected + 1) % options.length;
        render(true);
      }
    };
    process.stdin.on("data", onData);
  });
}

async function download(url, label = "订阅") {
  let lastError;
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    try {
      const response = await fetch(url, {
        signal: AbortSignal.timeout(60_000),
        redirect: "follow",
        headers: {
          Accept: "application/yaml, text/yaml, text/plain, */*",
          "User-Agent": "Mihomo/1.19.0"
        }
      });
      if (!response.ok) {
        const hint = response.status === 403 ? "；链接可能已过期，或服务端拒绝当前请求" : "";
        throw new Error(`HTTP ${response.status}${hint}`);
      }
      return await response.text();
    } catch (error) {
      lastError = error;
      if (attempt < 3) await new Promise((resolve) => setTimeout(resolve, 1000));
    }
  }
  throw new Error(`${label}下载失败：${lastError.message}`);
}

async function chooseTemplate() {
  const argumentIndex = process.argv.indexOf("--template");
  let selection = argumentIndex >= 0 ? process.argv[argumentIndex + 1]?.toLowerCase() : null;
  if (argumentIndex >= 0 && !["local", ...Object.keys(remoteTemplates)].includes(selection)) {
    fail("--template 仅支持 local、pro、lite、mini。");
  }
  if (!selection) {
    selection = await selectOption("选择基础模板", [
      { value: "pro", label: "Pro（远程）", description: "完整策略组与规则集" },
      { value: "lite", label: "Lite（远程）", description: "精简策略组" },
      { value: "mini", label: "Mini（远程）", description: "最小化配置" },
      { value: "local", label: "default.yaml（本地）", description: "使用 template/default.yaml" }
    ], "pro");
  }
  if (selection === "local") return { name: "本地", content: fs.readFileSync(defaultTemplatePath, "utf8") };
  const descriptor = remoteTemplates[selection];
  return { name: `${descriptor.label}（远程）`, content: await download(descriptor.url, `${descriptor.label} 模板`) };
}

function extractProxyBlock(subscription) {
  const candidates = [{ content: subscription.replace(/^\uFEFF/, ""), source: "原始响应" }];
  const compact = subscription.replace(/\s/g, "");
  if (/^[A-Za-z0-9+/_-]+={0,2}$/.test(compact) && compact.length >= 16) {
    try {
      const normalized = compact.replace(/-/g, "+").replace(/_/g, "/");
      candidates.push({ content: Buffer.from(normalized, "base64").toString("utf8").replace(/^\uFEFF/, ""), source: "Base64 解码后的响应" });
    } catch {
      // 无法解码时继续按原始响应判断。
    }
  }

  for (const candidate of candidates) {
    const result = extractTopLevelProxies(candidate.content);
    if (result) return { ...result, proxyProviders: topLevelSection(result.parsedYaml, "proxy-providers"), source: candidate.source };
  }

  for (const candidate of candidates) {
    const result = convertAnyTlsUris(candidate.content);
    if (result) return { ...result, parsedYaml: result.block, proxyProviders: null, source: `${candidate.source}（AnyTLS URI 转换）` };
  }

  const inspected = candidates.at(-1).content.trimStart();
  if (/^<(?:!doctype |html|head|body)/i.test(inspected)) {
    fail("订阅服务返回了 HTML 页面，而非 Clash/Mihomo 配置；链接可能已过期或需要浏览器验证。");
  }
  if (/^(?:ss|ssr|vmess|vless|trojan|hysteria2?|tuic):\/\//im.test(inspected)) {
    fail("订阅返回的是通用代理 URI，而非 Clash/Mihomo YAML；请在机场面板切换为 Clash 或 Mihomo 格式后重试。");
  }
  fail("订阅内容中未找到顶层 proxies: 块；请确认机场输出格式为 Clash 或 Mihomo YAML。");
}

function extractTopLevelProxies(subscription) {
  const lines = subscription.split(/(?<=\n)/);
  const start = lines.findIndex((line) => /^proxies:\s*$/.test(line.trimEnd()));
  if (start < 0) return null;
  const finish = lines.findIndex((line, index) => index > start && /^\S/.test(line));
  const end = finish < 0 ? lines.length : finish;
  const { entries, filteredCount } = filterMetadataNodes(lines.slice(start + 1, end));
  const block = [lines[start], ...entries].join("").trimEnd();
  const nodeCount = entries.filter((line) => /^\s+-\s+(?:\{|name:)/.test(line)).length;
  if (nodeCount === 0) return null;
  const filteredBlock = `${block}\n`;
  return {
    block: filteredBlock,
    nodeCount,
    filteredCount,
    // 同时净化保存的解析结果，避免 latest 再次带回这类信息节点。
    parsedYaml: [...lines.slice(0, start), filteredBlock, ...lines.slice(end)].join("")
  };
}

function isSubscriptionMetadataName(name) {
  const normalized = name.trim();
  return /^\d+(?:\.\d+)?\s*(?:[KMGTPE]?B)\s*\|\s*\d+(?:\.\d+)?\s*(?:[KMGTPE]?B)$/i.test(normalized)
    || /^Traffic Reset:\s*.+\s+Left$/i.test(normalized)
    || /^Expire Date:\s*\d{4}-\d{2}-\d{2}$/i.test(normalized);
}

function nodeName(entry) {
  const matched = entry.match(/\bname\s*:\s*(?:"([^"]*)"|'([^']*)'|([^,\n}#]+))/i);
  return matched ? (matched[1] ?? matched[2] ?? matched[3]).trim() : null;
}

function filterMetadataNodes(lines) {
  const entries = [];
  let current = [];
  const flush = () => {
    if (current.length === 0) return;
    const entry = current.join("");
    if (!isSubscriptionMetadataName(nodeName(entry) || "")) entries.push(...current);
    current = [];
  };

  for (const line of lines) {
    if (/^\s+-\s+(?:\{|name:)/.test(line)) flush();
    current.push(line);
  }
  flush();

  const originalNodeCount = lines.filter((line) => /^\s+-\s+(?:\{|name:)/.test(line)).length;
  const keptNodeCount = entries.filter((line) => /^\s+-\s+(?:\{|name:)/.test(line)).length;
  return { entries, filteredCount: originalNodeCount - keptNodeCount };
}

function decodeUriPart(value) {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

function isTrue(value) {
  return ["1", "true", "yes"].includes(String(value || "").toLowerCase());
}

function yamlValue(value) {
  if (typeof value === "boolean" || typeof value === "number") return String(value);
  return JSON.stringify(value);
}

function renderNodes(nodes) {
  const lines = nodes.map((node) => {
    const fields = Object.entries(node).map(([key, value]) => `${key}: ${yamlValue(value)}`).join(", ");
    return `  - { ${fields} }`;
  });
  return `proxies:\n${lines.join("\n")}\n`;
}

function convertAnyTlsUris(subscription) {
  const lines = subscription.split(/\r?\n/).map((line) => line.trim()).filter((line) => line && !line.startsWith("#"));
  if (lines.length === 0 || !lines.every((line) => line.startsWith("anytls://"))) return null;

  try {
    const nodes = lines.map((line, index) => {
      const uri = new URL(line);
      const password = decodeUriPart(uri.username);
      if (!uri.hostname || !password) throw new Error(`第 ${index + 1} 个 AnyTLS URI 缺少服务器或密码`);
      const name = decodeUriPart(uri.hash.slice(1)) || `${uri.hostname}:${uri.port || 443}`;
      const node = {
        name,
        type: "anytls",
        server: uri.hostname,
        port: Number(uri.port || 443),
        password,
        udp: true
      };
      const fingerprint = uri.searchParams.get("fp");
      const sni = uri.searchParams.get("sni");
      if (fingerprint) node["client-fingerprint"] = fingerprint;
      if (sni) node.sni = sni;
      if (isTrue(uri.searchParams.get("insecure"))) node["skip-cert-verify"] = true;
      return node;
    });
    const keptNodes = nodes.filter((node) => !isSubscriptionMetadataName(node.name));
    return {
      block: renderNodes(keptNodes),
      nodeCount: keptNodes.length,
      filteredCount: nodes.length - keptNodes.length
    };
  } catch (error) {
    fail(`AnyTLS URI 转换失败：${error.message}`);
  }
}

function dateStamp(date = new Date()) {
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${date.getFullYear()}${month}${day}`;
}

function writeSensitiveFile(filePath, content) {
  fs.writeFileSync(filePath, content, { encoding: "utf8", mode: 0o600 });
}

function latestDirectory() {
  return path.join(distDir, "latest");
}

function createParseDirectory(date) {
  const directory = path.join(distDir, `subcription-${dateStamp(date)}`);
  fs.mkdirSync(directory, { recursive: true, mode: 0o700 });
  return directory;
}

function updateLatestLink(parseDirectory) {
  const latestPath = latestDirectory();
  try {
    if (fs.lstatSync(latestPath).isDirectory() && !fs.lstatSync(latestPath).isSymbolicLink()) {
      fail(`无法更新 latest：${latestPath} 是普通目录，请先手动处理。`);
    }
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
  }
  const temporaryLink = path.join(distDir, `.latest-${process.pid}`);
  try { fs.unlinkSync(temporaryLink); } catch (error) { if (error.code !== "ENOENT") throw error; }
  fs.symlinkSync(path.basename(parseDirectory), temporaryLink, "dir");
  fs.renameSync(temporaryLink, latestPath);
}

function loadLatestParsedResult() {
  const latestPath = path.join(latestDirectory(), "parsed.yaml");
  if (!fs.existsSync(latestPath)) fail("未找到最新解析结果；请先输入一次有效订阅地址。");
  const parsedYaml = fs.readFileSync(latestPath, "utf8");
  const extracted = extractTopLevelProxies(parsedYaml);
  if (!extracted) fail("最新解析结果不包含有效的 proxies: 块。");
  return {
    ...extracted,
    parsedYaml,
    proxyProviders: topLevelSection(parsedYaml, "proxy-providers"),
    source: "latest 解析结果",
    artifactDirectory: latestDirectory()
  };
}

if (!fs.existsSync(defaultTemplatePath)) fail(`找不到默认模板：${defaultTemplatePath}`);
if (!fs.existsSync(customTemplatePath)) fail(`找不到 Custom 片段：${customTemplatePath}`);

try {
  const runDate = new Date();
  const template = await chooseTemplate();
  const responseFileIndex = process.argv.indexOf("--response-file");
  const responseFile = responseFileIndex >= 0 ? process.argv[responseFileIndex + 1] : null;
  if (responseFileIndex >= 0 && (!responseFile || responseFile.startsWith("--"))) {
    fail("--response-file 后必须提供本地响应文件路径。");
  }

  let subscriptionContent = null;
  let parsedResult = null;
  let parseDirectory = null;
  let interactiveProviderUrl = null;
  if (responseFile) {
    const inputPath = path.resolve(responseFile);
    if (!fs.existsSync(inputPath)) fail(`找不到原始响应文件：${inputPath}`);
    subscriptionContent = fs.readFileSync(inputPath, "utf8");
    console.log(`正在使用已保存的原始响应：${inputPath}`);
  } else {
    const subscriptionMode = await selectOption("选择节点来源", [
      { value: "url", label: "输入新的订阅地址", description: "下载并解析一次性订阅" },
      { value: "latest", label: "使用 latest 解析结果", description: "不访问订阅地址，直接复用最近一次结果" }
    ], "url");
    if (subscriptionMode === "url") {
      const url = await promptHidden("请输入有效的 Clash/Mihomo 订阅地址（输入不会回显）：\n> ");
      if (!url) fail("订阅地址不能为空；如需复用已有结果，请在菜单中选择 latest。");
      if (!/^https?:\/\//i.test(url)) fail("订阅地址必须以 http:// 或 https:// 开头。");
      subscriptionContent = await download(url);

      const providerInput = await promptHidden("请输入要注入 Primary 的订阅地址（留空则依次读取 subscription/sub-inject.txt、subscription/inject.txt，输入不会回显）：\n> ");
      if (providerInput) {
        interactiveProviderUrl = validateSubscriptionUrl(providerInput);
        if (!interactiveProviderUrl) fail("Primary 订阅地址必须是有效的 http:// 或 https:// URL。");
      }
    } else {
      parsedResult = loadLatestParsedResult();
    }
  }

  const injectedSubscription = interactiveProviderUrl ? null : findInjectedSubscriptionUrl(root);
  const primaryUrl = interactiveProviderUrl || injectedSubscription?.url || null;

  fs.mkdirSync(distDir, { recursive: true });
  if (subscriptionContent) {
    parseDirectory = createParseDirectory(runDate);
    const rawResponsePath = path.join(parseDirectory, "raw.txt");
    writeSensitiveFile(rawResponsePath, subscriptionContent);
    console.log(`原始订阅响应已保存：${rawResponsePath}`);
  }

  if (!parsedResult) parsedResult = extractProxyBlock(subscriptionContent);
  const { block: proxyBlock, nodeCount, parsedYaml, proxyProviders, source, filteredCount = 0 } = parsedResult;
  if (subscriptionContent) {
    const parsedPath = path.join(parseDirectory, "parsed.yaml");
    const proxiesPath = path.join(parseDirectory, "proxies.yaml");
    writeSensitiveFile(parsedPath, parsedYaml);
    writeSensitiveFile(proxiesPath, proxyBlock);
    updateLatestLink(parseDirectory);
    console.log(`解析后的 YAML 已保存：${parsedPath}`);
    console.log(`拆分的 proxies 已保存：${proxiesPath}`);
    console.log(`latest 已指向：${parseDirectory}`);
  } else {
    parseDirectory = parsedResult.artifactDirectory || latestDirectory();
  }
  const customTemplate = fs.readFileSync(customTemplatePath, "utf8");
  const output = composeTemplate({ remoteTemplate: template.content, customTemplate, proxyBlock, parsedProviders: proxyProviders, primaryUrl });
  if ((output.match(/^proxies:\s*$/gm) || []).length !== 1) fail("生成配置中的 proxies: 块数量校验失败。");

  const outputPath = path.join(parseDirectory, "openclash.yaml");
  const temporaryPath = path.join(parseDirectory, `.openclash.yaml.${process.pid}.tmp`);
  fs.writeFileSync(temporaryPath, output, { encoding: "utf8", mode: 0o600 });
  fs.renameSync(temporaryPath, outputPath);
  console.log(`已生成：${outputPath}（${nodeCount} 个节点）`);
  console.log(`基础模板：${template.name}`);
  console.log(`节点来源：${source}`);
  if (filteredCount > 0) console.log(`已过滤 ${filteredCount} 个订阅信息节点（流量、重置时间、到期时间）。`);
  if (interactiveProviderUrl) console.log("已注入交互输入的 Primary 订阅。");
  else if (injectedSubscription) console.log(`已注入 Primary 订阅：subscription/${injectedSubscription.name}`);
  console.log("订阅地址未写入仓库；原始响应仅保存在已忽略的 dist 目录。");
} catch (error) {
  fail(error.message);
}
