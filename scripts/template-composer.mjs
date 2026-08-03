import { renderProxyProviders } from "./subscription-providers.mjs";

function linesOf(text) {
  return text.split(/(?<=\n)/);
}

export function topLevelSection(text, name) {
  const lines = linesOf(text);
  const start = lines.findIndex((line) => new RegExp(`^${name}:\\s*$`).test(line.trimEnd()));
  if (start < 0) return null;
  const end = lines.findIndex((line, index) => index > start && /^\S/.test(line));
  const finish = end < 0 ? lines.length : end;
  return { start, finish, lines: lines.slice(start, finish), body: lines.slice(start + 1, finish) };
}

export function replaceTopLevelSection(text, name, replacement) {
  const section = topLevelSection(text, name);
  if (!section) throw new Error(`模板中未找到顶层 ${name}: 块。`);
  const lines = linesOf(text);
  return [...lines.slice(0, section.start), ...linesOf(replacement), ...lines.slice(section.finish)].join("");
}

export function customFragments(localTemplate) {
  const customAnchor = localTemplate.match(/^x-rule-set-custom:.*$/m)?.[0] || null;
  const providerSection = topLevelSection(localTemplate, "rule-providers");
  const ruleSection = topLevelSection(localTemplate, "rules");
  const providers = providerSection ? providerSection.body.filter((line) => /^\s{2}Custom[A-Za-z]+:/.test(line)) : [];
  const rules = ruleSection ? ruleSection.body.filter((line) => /^\s{2}- RULE-SET,Custom[A-Za-z]+,/.test(line)) : [];
  if (!customAnchor || providers.length === 0 || rules.length === 0) {
    throw new Error("本地模板缺少完整的 Custom 锚点、规则提供者或规则片段。");
  }
  return { customAnchor, providers, rules };
}

function ensureCustomAnchor(template, anchor) {
  if (/^x-rule-set-custom:.*$/m.test(template)) {
    return template.replace(/^x-rule-set-custom:.*$/m, anchor);
  }
  const providerIndex = template.search(/^proxy-providers:\s*$/m);
  if (providerIndex < 0) throw new Error("远程模板中未找到 proxy-providers: 块，无法插入 Custom 锚点。");
  return `${template.slice(0, providerIndex)}${anchor}\n\n${template.slice(providerIndex)}`;
}

function prependCustomSection(template, name, lines, comment) {
  const section = topLevelSection(template, name);
  if (!section) throw new Error(`远程模板中未找到 ${name}: 块。`);
  const existing = section.body.filter((line) => !/Custom[A-Za-z]+/.test(line));
  const rendered = `${name}:\n${comment}\n${lines.join("")}\n${existing.join("")}`;
  return replaceTopLevelSection(template, name, rendered);
}

function providerBody(parsedProviders) {
  if (!parsedProviders) return [];
  return parsedProviders.body.filter((line) => !line.match(/^\s*#/) && line.trim() !== "");
}

function composeProviders(parsedProviders, primaryUrl) {
  const parsed = providerBody(parsedProviders);
  const sourceAlreadyHasPrimary = parsed.some((line) => /^\s{2}Primary\s*:/.test(line));
  const injected = primaryUrl && !sourceAlreadyHasPrimary
    ? renderProxyProviders({ primaryUrl }).split("\n").filter((line) => !line.startsWith("#") && line.trim()).slice(1).map((line) => `${line}\n`)
    : [];
  const body = [...injected, ...parsed];
  return body.length > 0 ? `proxy-providers:\n${body.join("")}` : "proxy-providers:\n  # 未注入代理提供者\n";
}

function injectProxyBlock(template, proxyBlock) {
  if (topLevelSection(template, "proxies")) return replaceTopLevelSection(template, "proxies", proxyBlock);
  const marker = "# __PROXIES_PLACEHOLDER__";
  if (template.includes(marker)) return template.replace(marker, proxyBlock.trimEnd());
  throw new Error("模板中未找到 proxies: 块或节点占位符。");
}

export function composeTemplate({ remoteTemplate, localTemplate, proxyBlock, parsedProviders, primaryUrl }) {
  const custom = customFragments(localTemplate);
  let output = ensureCustomAnchor(remoteTemplate.replace(/^\uFEFF/, ""), custom.customAnchor);
  output = replaceTopLevelSection(output, "proxy-providers", composeProviders(parsedProviders, primaryUrl));
  output = injectProxyBlock(output, proxyBlock);
  output = prependCustomSection(output, "rule-providers", custom.providers, "  # 个人规则提供者（由本地 Custom 片段叠加）");
  output = prependCustomSection(output, "rules", custom.rules, "  # 个人规则：置顶以优先于模板通用规则");
  return output;
}
