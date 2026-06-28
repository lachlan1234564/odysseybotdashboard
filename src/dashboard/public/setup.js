const form = document.querySelector("#setup-form");
const statusPanel = document.querySelector("#setup-status");
const message = document.querySelector("#setup-message");

function setMessage(text, kind = "") {
  message.textContent = text;
  message.className = `form-save-status ${kind}`.trim();
}

function showStatus(text, degraded = false) {
  statusPanel.classList.remove("hidden");
  statusPanel.classList.toggle("is-warning", degraded);
  statusPanel.innerHTML = `<div class="section-status-copy"><strong>${degraded ? "Action needed" : "Ready"}</strong><span>${text}</span></div>`;
}

function clearErrors() {
  document.querySelectorAll("[data-error-for]").forEach((node) => {
    node.textContent = "";
  });
}

function showErrors(fields = {}) {
  Object.entries(fields).forEach(([field, text]) => {
    const target = document.querySelector(`[data-error-for="${CSS.escape(field)}"]`);
    if (target) target.textContent = text;
  });
}

function lineIds(value) {
  return value
    .split(/[\n,]/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function formPayload() {
  const data = new FormData(form);
  return {
    dashboardName: String(data.get("dashboardName") || ""),
    botDisplayName: String(data.get("botDisplayName") || ""),
    supportServerName: String(data.get("supportServerName") || ""),
    discordToken: String(data.get("discordToken") || ""),
    discordClientId: String(data.get("discordClientId") || ""),
    discordClientSecret: String(data.get("discordClientSecret") || ""),
    discordGuildId: String(data.get("discordGuildId") || ""),
    publicBaseUrl: String(data.get("publicBaseUrl") || ""),
    verifyPublicBaseUrl: String(data.get("verifyPublicBaseUrl") || ""),
    discordOauthRedirectUri: String(data.get("discordOauthRedirectUri") || ""),
    dashboardPassword: String(data.get("dashboardPassword") || ""),
    adminUserIds: lineIds(String(data.get("adminUserIds") || ""))
  };
}

async function loadStatus() {
  try {
    const response = await fetch("/api/setup/status");
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || "Could not load setup status.");
    document.title = `${data.dashboardName || "CorePanel"} Setup`;
    if (!data.encryptionReady) {
      showStatus(data.encryptionMessage, true);
      form.querySelector('[type="submit"]').disabled = true;
      setMessage("Set COREPANEL_SECRET_KEY in Railway, then refresh this page.", "error");
      return;
    }
    showStatus(data.encryptionMessage, false);
    if (!data.setupRequired) {
      setMessage("CorePanel is already configured. Redirecting to login...", "success");
      window.setTimeout(() => window.location.replace("/login"), 900);
    }
  } catch (error) {
    showStatus(error.message, true);
  }
}

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  clearErrors();
  const button = form.querySelector('[type="submit"]');
  button.disabled = true;
  setMessage("Saving setup securely...", "saving");
  try {
    const response = await fetch("/api/setup", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(formPayload())
    });
    const data = await response.json();
    if (!response.ok) {
      showErrors(data.fields || {});
      throw new Error(data.error || "Setup could not be saved.");
    }
    form.reset();
    setMessage(data.message || "Setup saved. Opening the dashboard...", "success");
    window.setTimeout(() => window.location.replace(data.next || "/servers"), 900);
  } catch (error) {
    setMessage(error.message, "error");
  } finally {
    button.disabled = false;
  }
});

loadStatus();
