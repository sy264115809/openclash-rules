import fs from "node:fs";
import path from "node:path";

export const providerStartMarker = "# __PROXY_PROVIDERS_START__";
export const providerEndMarker = "# __PROXY_PROVIDERS_END__";

export function validateSubscriptionUrl(value) {
  const normalized = value.trim();
  if (!normalized || /\s/.test(normalized)) return null;

  try {
    const url = new URL(normalized);
    if (!["http:", "https:"].includes(url.protocol) || !url.hostname) return null;
    return normalized;
  } catch {
    return null;
  }
}

export function readSubscriptionUrl(filePath, { warn = true } = {}) {
  if (!fs.existsSync(filePath)) return null;

  const lines = fs.readFileSync(filePath, "utf8")
    .replace(/^\uFEFF/, "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  const url = lines.length === 1 ? validateSubscriptionUrl(lines[0]) : null;

  if (!url && warn) {
    console.warn(`警告：${filePath} 必须只包含一个有效的 http:// 或 https:// URL，已忽略。`);
  }
  return url;
}

function yamlSingleQuoted(value) {
  return `'${value.replaceAll("'", "''")}'`;
}

export function renderProxyProviders({ primaryUrl = null } = {}) {
  const entries = [];
  if (primaryUrl) {
    entries.push(`  Primary: {<<: *base-provider, url: ${yamlSingleQuoted(primaryUrl)}, override: {additional-prefix: '[P] '}}`);
  }

  const lines = [providerStartMarker];
  if (entries.length > 0) lines.push("proxy-providers:", ...entries);
  lines.push(providerEndMarker);
  return `${lines.join("\n")}\n`;
}

export function replaceProxyProviders(template, providers) {
  const start = template.indexOf(providerStartMarker);
  const end = template.indexOf(providerEndMarker);
  if (start < 0 || end < start) {
    throw new Error("模板中未找到完整的 proxy-providers 标记。");
  }

  const finish = end + providerEndMarker.length;
  return `${template.slice(0, start)}${renderProxyProviders(providers).trimEnd()}${template.slice(finish)}`;
}

export function subscriptionFile(root, name) {
  return path.join(root, "subscription", name);
}

export function findInjectedSubscriptionUrl(root) {
  for (const name of ["sub-inject.txt", "inject.txt"]) {
    const filePath = subscriptionFile(root, name);
    const url = readSubscriptionUrl(filePath);
    if (url) return { url, filePath, name };
  }
  return null;
}
