const form = document.querySelector("#setup-form");
const statusPanel = document.querySelector("#setup-status");
const message = document.querySelector("#setup-message");
const inviteMode = document.querySelector("#invite-permissions-mode");
const customPermissionsField = document.querySelector("#custom-permissions-field");
const customPermissions = document.querySelector("#invite-custom-permissions");
const inviteLink = document.querySelector("#invite-link");
const copyInvite = document.querySelector("#copy-invite-link");
const openInvite = document.querySelector("#open-invite-link");

const recommendedPermissions = "1494917442774";
const administratorPermissions = "8";

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

function invitePermissions() {
  if (inviteMode.value === "admin") return administratorPermissions;
  if (inviteMode.value === "custom") return customPermissions.value.trim() || "0";
  return recommendedPermissions;
}

function generateInviteLink() {
  const clientId = form.discordClientId.value.trim();
  const validClientId = /^\d{16,22}$/.test(clientId);
  customPermissionsField.classList.toggle("hidden", inviteMode.value !== "custom");

  if (!validClientId) {
    inviteLink.value = "";
    inviteLink.placeholder = "Enter a valid client/application ID to generate an invite link";
    openInvite.href = "#";
    openInvite.classList.add("disabled-link");
    copyInvite.disabled = true;
    return "";
  }

  const url = new URL("https://discord.com/oauth2/authorize");
  url.searchParams.set("client_id", clientId);
  url.searchParams.set("scope", "bot applications.commands");
  url.searchParams.set("permissions", invitePermissions());
  const value = url.toString();
  inviteLink.value = value;
  openInvite.href = value;
  openInvite.classList.remove("disabled-link");
  copyInvite.disabled = false;
  return value;
}

async function loadStatus() {
  try {
    const response = await fetch("/api/setup/status");
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || "Could not load setup status.");
    document.title = `${data.dashboardName || "Bot Dashboard"} Setup`;
    if (!data.encryptionReady) {
      showStatus(data.encryptionMessage, true);
      form.querySelector('[type="submit"]').disabled = true;
      setMessage("Set SETUP_SECRET_KEY in Railway, then refresh this page.", "error");
      return;
    }
    showStatus(data.encryptionMessage, false);
    if (!data.setupRequired) {
      setMessage("Setup is already complete. Redirecting to login...", "success");
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
    form.discordToken.value = "";
    form.discordClientSecret.value = "";
    generateInviteLink();
    setMessage(data.message || "Setup saved. Invite the bot if you have not already, then open the dashboard.", "success");
    const submit = form.querySelector('[type="submit"]');
    submit.textContent = "Setup saved";
    const existing = document.querySelector("#open-dashboard-after-setup");
    if (!existing) {
      const link = document.createElement("a");
      link.id = "open-dashboard-after-setup";
      link.className = "secondary-button compact";
      link.href = data.next || "/servers";
      link.textContent = "Open dashboard";
      submit.insertAdjacentElement("beforebegin", link);
    }
  } catch (error) {
    setMessage(error.message, "error");
  } finally {
    button.disabled = false;
  }
});

form.discordClientId.addEventListener("input", generateInviteLink);
inviteMode.addEventListener("change", generateInviteLink);
customPermissions.addEventListener("input", generateInviteLink);
copyInvite.addEventListener("click", async () => {
  const value = generateInviteLink();
  if (!value) {
    setMessage("Enter the Discord client/application ID first.", "error");
    return;
  }
  try {
    await navigator.clipboard.writeText(value);
    setMessage("Invite link copied. It does not include your bot token.", "success");
  } catch {
    inviteLink.select();
    setMessage("Copy is blocked by the browser. Select and copy the invite link manually.", "error");
  }
});
openInvite.addEventListener("click", (event) => {
  if (!generateInviteLink()) {
    event.preventDefault();
    setMessage("Enter the Discord client/application ID first.", "error");
  }
});

generateInviteLink();
loadStatus();
