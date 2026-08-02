#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import {
  findInjectedSubscriptionUrl,
  replaceProxyProviders,
  validateSubscriptionUrl
} from "./subscription-providers.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const templatePath = path.join(root, "openclash-tmp.yaml");
const distDir = path.join(root, "dist");
const marker = "# __PROXIES_PLACEHOLDER__";

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

async function download(url) {
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
  throw new Error(`订阅下载失败：${lastError.message}`);
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
    if (result) return { ...result, source: candidate.source };
  }

  for (const candidate of candidates) {
    const result = convertAnyTlsUris(candidate.content);
    if (result) return { ...result, source: `${candidate.source}（AnyTLS URI 转换）` };
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
  const block = lines.slice(start, finish < 0 ? lines.length : finish).join("").trimEnd();
  const nodeCount = block.split("\n").filter((line) => /^\s+-\s+(?:\{|name:)/.test(line)).length;
  if (nodeCount === 0) return null;
  return { block: `${block}\n`, nodeCount };
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
    return { block: renderNodes(nodes), nodeCount: nodes.length };
  } catch (error) {
    fail(`AnyTLS URI 转换失败：${error.message}`);
  }
}

function outputFileName(date = new Date()) {
  const day = String(date.getDate()).padStart(2, "0");
  const month = String(date.getMonth() + 1).padStart(2, "0");
  return `openclash-${date.getFullYear()}${day}${month}.yaml`;
}

function rawResponseFileName(date = new Date()) {
  const day = String(date.getDate()).padStart(2, "0");
  const month = String(date.getMonth() + 1).padStart(2, "0");
  return `subscription-${date.getFullYear()}${day}${month}.txt`;
}

if (!fs.existsSync(templatePath)) fail(`找不到模板：${templatePath}`);

try {
  const runDate = new Date();
  const responseFileIndex = process.argv.indexOf("--response-file");
  const responseFile = responseFileIndex >= 0 ? process.argv[responseFileIndex + 1] : null;
  if (responseFileIndex >= 0 && (!responseFile || responseFile.startsWith("--"))) {
    fail("--response-file 后必须提供本地响应文件路径。");
  }

  let subscriptionContent;
  let interactiveProviderUrl = null;
  if (responseFile) {
    const inputPath = path.resolve(responseFile);
    if (!fs.existsSync(inputPath)) fail(`找不到原始响应文件：${inputPath}`);
    subscriptionContent = fs.readFileSync(inputPath, "utf8");
    console.log(`正在使用已保存的原始响应：${inputPath}`);
  } else {
    const url = await promptHidden("请输入有效的 Clash/Mihomo 订阅地址（输入不会回显）：\n> ");
    if (!/^https?:\/\//i.test(url)) fail("订阅地址必须以 http:// 或 https:// 开头。");
    subscriptionContent = await download(url);

    const providerInput = await promptHidden("请输入要注入 Primary 的订阅地址（留空则依次读取 subscription/sub-inject.txt、subscription/inject.txt，输入不会回显）：\n> ");
    if (providerInput) {
      interactiveProviderUrl = validateSubscriptionUrl(providerInput);
      if (!interactiveProviderUrl) fail("Primary 订阅地址必须是有效的 http:// 或 https:// URL。");
    }
  }

  const injectedSubscription = interactiveProviderUrl ? null : findInjectedSubscriptionUrl(root);
  const primaryUrl = interactiveProviderUrl || injectedSubscription?.url || null;

  fs.mkdirSync(distDir, { recursive: true });
  const rawResponsePath = path.join(distDir, rawResponseFileName(runDate));
  fs.writeFileSync(rawResponsePath, subscriptionContent, { encoding: "utf8", mode: 0o600 });
  console.log(`原始订阅响应已保存：${rawResponsePath}`);

  const { block: proxyBlock, nodeCount, source } = extractProxyBlock(subscriptionContent);

  let template = fs.readFileSync(templatePath, "utf8");
  if (!template.includes(marker)) fail("模板中未找到节点占位符。");
  template = replaceProxyProviders(template, { primaryUrl });
  const output = template.replace(marker, proxyBlock);
  if ((output.match(/^proxies:\s*$/gm) || []).length !== 1) fail("生成配置中的 proxies: 块数量校验失败。");

  const outputPath = path.join(distDir, outputFileName(runDate));
  const temporaryPath = path.join(distDir, `.${path.basename(outputPath)}.${process.pid}.tmp`);
  fs.writeFileSync(temporaryPath, output, { encoding: "utf8", mode: 0o600 });
  fs.renameSync(temporaryPath, outputPath);
  console.log(`已生成：${outputPath}（${nodeCount} 个节点）`);
  console.log(`节点来源：${source}`);
  if (interactiveProviderUrl) console.log("已注入交互输入的 Primary 订阅。");
  else if (injectedSubscription) console.log(`已注入 Primary 订阅：subscription/${injectedSubscription.name}`);
  console.log("订阅地址未写入仓库；原始响应仅保存在已忽略的 dist 目录。");
} catch (error) {
  fail(error.message);
}
