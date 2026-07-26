const groupFiles = {
  direct: "direct.yaml",
  reject: "reject.yaml",
  proxy: "proxy.yaml",
  us: "us.yaml",
  jp: "jp.yaml",
  tw: "tw.yaml"
};

const domainInput = document.querySelector("#domain");
const ruleType = document.querySelector("#rule-type");
const group = document.querySelector("#group");
const saveButton = document.querySelector("#save");
const status = document.querySelector("#status");

function setStatus(message, kind = "") {
  status.className = kind;
  status.textContent = message;
}

function decodeBase64Utf8(value) {
  const bytes = Uint8Array.from(atob(value.replace(/\s/g, "")), (char) => char.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}

function encodeBase64Utf8(value) {
  const bytes = new TextEncoder().encode(value);
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

function addRule(content, rule) {
  const escaped = rule.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  if (new RegExp(`^\\s*-\\s*${escaped}\\s*$`, "m").test(content)) {
    return { content, changed: false };
  }
  if (/^payload:\s*\[\s*\]\s*$/m.test(content)) {
    return { content: content.replace(/^payload:\s*\[\s*\]\s*$/m, `payload:\n  - ${rule}`), changed: true };
  }
  const suffix = content.endsWith("\n") ? "" : "\n";
  return { content: `${content}${suffix}  - ${rule}\n`, changed: true };
}

async function githubRequest(url, settings, options = {}) {
  const response = await fetch(url, {
    ...options,
    headers: {
      Accept: "application/vnd.github+json",
      Authorization: `Bearer ${settings.token}`,
      "X-GitHub-Api-Version": "2022-11-28",
      ...(options.headers || {})
    }
  });
  if (!response.ok) {
    const detail = await response.json().catch(() => ({}));
    throw new Error(detail.message || `GitHub 请求失败（${response.status}）`);
  }
  return response.json();
}

async function addCurrentRule() {
  const settings = await chrome.storage.local.get(["owner", "repo", "branch", "token"]);
  if (!settings.owner || !settings.repo || !settings.branch || !settings.token) {
    setStatus("请先完成 GitHub 设置。", "error");
    return;
  }

  const domain = domainInput.value.trim().toLowerCase().replace(/^\.+/, "");
  if (!/^[a-z0-9.-]+$/i.test(domain) || !domain.includes(".")) {
    setStatus("请输入有效域名。", "error");
    return;
  }

  saveButton.disabled = true;
  setStatus("正在更新 GitHub 文件…");
  try {
    const file = groupFiles[group.value];
    const path = `rules/${file}`;
    const apiBase = `https://api.github.com/repos/${encodeURIComponent(settings.owner)}/${encodeURIComponent(settings.repo)}/contents/${path}`;
    const current = await githubRequest(`${apiBase}?ref=${encodeURIComponent(settings.branch)}`, settings);
    const rule = `${ruleType.value},${domain}`;
    const result = addRule(decodeBase64Utf8(current.content), rule);
    if (!result.changed) {
      setStatus("该规则已存在，无需重复添加。", "success");
      return;
    }
    await githubRequest(apiBase, settings, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        message: `rules: 添加 ${rule} 到 ${group.value}`,
        content: encodeBase64Utf8(result.content),
        sha: current.sha,
        branch: settings.branch
      })
    });
    setStatus(`已添加 ${rule}，GitHub 已更新。`, "success");
  } catch (error) {
    setStatus(error.message, "error");
  } finally {
    saveButton.disabled = false;
  }
}

document.querySelector("#open-options").addEventListener("click", () => chrome.runtime.openOptionsPage());
saveButton.addEventListener("click", addCurrentRule);

chrome.tabs.query({ active: true, lastFocusedWindow: true }, ([tab]) => {
  try {
    const hostname = new URL(tab.url).hostname.replace(/^www\./i, "");
    domainInput.value = hostname;
  } catch {
    setStatus("当前页面不是可添加规则的网址。", "error");
  }
});
