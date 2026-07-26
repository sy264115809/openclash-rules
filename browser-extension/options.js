const fields = ["owner", "repo", "branch", "token"];
const status = document.querySelector("#status");

async function loadOptions() {
  const saved = await chrome.storage.local.get(fields);
  for (const name of fields) {
    document.querySelector(`#${name}`).value = saved[name] || (name === "repo" ? "openclash-rules" : name === "branch" ? "main" : "");
  }
}

document.querySelector("#save-options").addEventListener("click", async () => {
  const values = Object.fromEntries(fields.map((name) => [name, document.querySelector(`#${name}`).value.trim()]));
  if (!values.owner || !values.repo || !values.branch || !values.token) {
    status.className = "error";
    status.textContent = "请填写所有字段。";
    return;
  }
  await chrome.storage.local.set(values);
  status.className = "success";
  status.textContent = "设置已保存。";
});

loadOptions();
