import {
  dashboardSearchItems,
  hasFormStateChanged,
  nextSearchIndex,
  searchDashboardItems,
  shouldBlockNavigation,
  toggleState
} from "./dashboard-core.js";

const state = {
  guilds: [],
  resources: { guild: null, channels: [], roles: [], emojis: [] },
  customCommands: [],
  ticketTypes: [],
  ticketPanels: [],
  ticketTypesError: null,
  announcements: [],
  closeRequests: [],
  ticketTranscripts: [],
  docsTopics: [],
  docsSearchResults: [],
  docsSearchActiveIndex: -1,
  activeDocTopic: null,
  docsSearchOpen: false,
  ticketView: "panels",
  securityView: "anti-raid",
  automationView: "auto-mod",
  recentActivity: JSON.parse(sessionStorage.getItem("rapidbot.activity") || "[]"),
  welcome: null,
  antiRaid: null,
  antiNuke: null,
  antiRole: null,
  autoMod: null,
  rolePanels: [],
  giveaways: [],
  giveawayEntries: [],
  stickyMessages: [],
  scheduledAnnouncements: [],
  socials: null,
  verification: null,
  branding: null,
  logging: null,
  activePage: "overview",
  selectedGuildId: null,
  searchActiveIndex: -1,
  searchResults: [],
  autoModDiagnosticsRequest: 0,
  initializing: true,
  dirtyForms: new Set(),
  pendingNavigation: null,
  submittingForm: null,
  suppressBeforeUnload: false
};

const pageMeta = {
  overview: ["Overview", "A quick read on your server automation."],
  custom: ["Command Studio", "Build database-driven actions for /custom."],
  tickets: ["Ticket Studio", "Compose ticket types into reusable entry panels."],
  announcements: ["Announcements", "Reusable broadcasts with a Discord confirmation flow."],
  socials: ["Social Promotion", "Create and publish a safe, reusable directory of community links."],
  giveaways: ["Giveaways", "Create and manage restart-safe community giveaways."],
  moderation: ["Moderation", "Warnings and actions recorded by the bot."],
  settings: ["Server Settings", "Shared Discord roles, channels, and access defaults."],
  logging: ["Server Logs", "A configurable audit feed for server events, excluding normal message sends."],
  branding: ["Appearance", "Visual defaults used across bot messages."],
  welcome: ["Welcome & Goodbye", "Shape a clear member experience when people join or leave."],
  security: ["Security", "Anti-raid, anti-nuke, and role protection."],
  automation: ["Automation", "Message rules, role panels, sticky notices, and schedules."],
  docs: ["Documentation", "Help, setup, and troubleshooting."]
};

const actionLabels = {
  reply_message: "Reply with a plain message",
  reply_embed: "Reply with an embed",
  send_channel: "Send a message/embed to a channel",
  send_ephemeral: "Send an ephemeral reply",
  send_dm: "Send a DM to a user",
  add_role: "Give the user a role",
  remove_role: "Remove a role from the user",
  add_roles: "Give the user multiple roles",
  remove_roles: "Remove multiple roles from the user",
  toggle_role: "Toggle a role on/off for the user",
  post_ticket_panel: "Post a saved ticket panel",
  send_announcement: "Send a saved announcement",
  create_ticket: "Create a ticket channel",
  request_close_ticket: "Request to close the ticket",
  lock_channel: "Lock the current channel",
  unlock_channel: "Unlock the current channel",
  rename_channel: "Rename the current channel",
  move_channel: "Move channel to a category",
  add_user_to_channel: "Add a user to the channel",
  remove_user_from_channel: "Remove a user from the channel",
  timeout_user: "Timeout a user",
  remove_timeout: "Remove a user's timeout",
  kick_user: "Kick a user",
  ban_user: "Ban a user",
  unban_user: "Unban a user",
  purge_messages: "Purge recent messages",
  require_role: "Require a role before running",
  require_permission: "Require a permission before running",
  log_to_mod: "Log action to moderation log",
  action_sequence: "Run multiple actions in sequence"
};

const actionGroups = {
  message: ["reply_message", "send_ephemeral", "send_dm"],
  embed: ["reply_embed", "send_channel", "send_announcement", "log_to_mod", "create_ticket"],
  channel: ["send_channel", "log_to_mod"],
  ping: ["send_channel", "send_announcement"],
  role: ["add_role", "remove_role", "toggle_role"],
  roles: ["add_roles", "remove_roles"],
  panel: ["post_ticket_panel", "create_ticket"],
  announcement: ["send_announcement"],
  targetUser: ["send_dm", "timeout_user", "remove_timeout", "kick_user", "ban_user", "unban_user", "add_user_to_channel", "remove_user_from_channel"],
  reason: ["timeout_user", "kick_user", "ban_user", "unban_user", "request_close_ticket", "log_to_mod"],
  amount: ["purge_messages"],
  duration: ["timeout_user"],
  deleteDays: ["ban_user"],
  newName: ["rename_channel"],
  newCategory: ["move_channel", "create_ticket"],
  permission: ["require_permission"],
  sequence: ["action_sequence"]
};

const commandVariables = [
  ["{user}", "User mention"],
  ["{username}", "Username"],
  ["{user_id}", "User ID"],
  ["{server}", "Server name"],
  ["{server_id}", "Server ID"],
  ["{server_member_count}", "Member count"],
  ["{channel}", "Channel mention"],
  ["{channel_name}", "Channel name"],
  ["{channel_id}", "Channel ID"],
  ["{text}", "Command text"],
  ["{reason}", "Reason"],
  ["{target}", "Target member"],
  ["{created_at}", "Created date"]
];

const standardTicketEmojis = [
  ["🎫", "ticket"], ["💬", "chat"], ["❓", "question"], ["🛠️", "support"],
  ["💳", "billing"], ["🚨", "urgent"], ["📩", "message"], ["🐛", "bug"],
  ["💡", "idea"], ["🤝", "partnership"], ["📢", "announcement"], ["🎮", "gaming"],
  ["🎨", "creative"], ["📚", "information"], ["🔒", "private"], ["✅", "approved"],
  ["⭐", "featured"], ["❤️", "community"], ["🔥", "hot"], ["📦", "order"],
  ["🧾", "receipt"], ["💼", "business"], ["🧑‍💻", "technical"], ["🌐", "website"],
  ["🎉", "event"], ["🆘", "help"], ["📌", "general"], ["🔧", "tools"]
];

let activeVariableField = null;

class ApiError extends Error {
  constructor(message, fields = {}) {
    super(message);
    this.fields = fields;
  }
}

async function api(path, options = {}) {
  const isFormData = options.body instanceof FormData;
  let response;
  try {
    response = await fetch(`/api${path}`, {
      ...options,
      signal: options.signal || AbortSignal.timeout(15_000),
      headers: isFormData ? (options.headers || {}) : { "Content-Type": "application/json", ...(options.headers || {}) }
    });
  } catch (error) {
    if (error.name === "TimeoutError" || error.name === "AbortError") {
      throw new ApiError("The request took too long. Your changes were not lost; check the bot connection and retry.");
    }
    throw new ApiError("The dashboard backend is offline or unreachable. Start it with `pnpm dashboard` or `pnpm dev`, then try again.");
  }
  if (response.status === 401) {
    window.location.replace("/login");
    throw new ApiError("Authentication required.");
  }
  let data = null;
  if (response.status !== 204) {
    const text = await response.text();
    if (text) {
      try {
        data = JSON.parse(text);
      } catch {
        if (!response.ok) {
          throw new ApiError(`The dashboard returned an invalid response (${response.status}). Check the dashboard terminal for details.`);
        }
        throw new ApiError("The dashboard returned data that could not be read.");
      }
    }
  }
  if (response.status === 409 && data?.error?.includes("Choose a Discord server")) {
    window.location.replace("/servers");
    throw new ApiError(data.error);
  }
  if (!response.ok) throw new ApiError(data?.error || "Request failed.", data?.fields || {});
  return data;
}

function toast(message, isError = false) {
  if (isError) state.submittingForm = null;
  const element = document.querySelector("#toast");
  element.textContent = message;
  element.classList.toggle("error", isError);
  element.classList.add("show");
  window.clearTimeout(toast.timer);
  toast.timer = window.setTimeout(() => element.classList.remove("show"), isError ? 9000 : 6500);
}

function renderActivity() {
  const container = document.querySelector("#recent-activity");
  if (!container) return;
  container.innerHTML = state.recentActivity.length
    ? state.recentActivity.map((entry) => `<div class="activity-entry">
        <i class="${entry.type === "error" ? "error" : ""}"></i>
        <div><strong>${escapeHtml(entry.message)}</strong><span>${escapeHtml(entry.time)}</span></div>
      </div>`).join("")
    : emptyState("No dashboard changes yet", "Your successful saves, tests, uploads, and deletions will appear here.");
}

function recordActivity(message, type = "success") {
  state.recentActivity.unshift({
    message,
    type,
    time: new Date().toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })
  });
  state.recentActivity = state.recentActivity.slice(0, 8);
  sessionStorage.setItem("rapidbot.activity", JSON.stringify(state.recentActivity));
  renderActivity();
}

async function withBusy(button, busyText, task) {
  if (!button || button.disabled) return;
  const original = button.textContent;
  button.disabled = true;
  button.classList.add("is-busy");
  button.textContent = busyText;
  try {
    return await task();
  } finally {
    button.disabled = false;
    button.classList.remove("is-busy");
    button.textContent = original;
  }
}

function success(message) {
  if (state.submittingForm) {
    markFormClean(state.submittingForm);
    state.submittingForm = null;
  }
  toast(message);
  recordActivity(message);
  resumePendingNavigation();
}

function syncFeatureToggles(root = document) {
  root.querySelectorAll?.(".switch input[type='checkbox']").forEach((input) => {
    const stateValue = toggleState(input.checked, input.name === "active");
    const control = input.closest(".switch");
    const label = control?.querySelector(".switch-state");
    control?.classList.toggle("is-enabled", stateValue.enabled);
    control?.classList.toggle("is-disabled", !stateValue.enabled);
    if (label) label.textContent = stateValue.label;
  });
  root.querySelectorAll?.(".check-card input[type='checkbox']").forEach((input) => {
    const card = input.closest(".check-card");
    let badge = card?.querySelector(".option-state");
    if (card && !badge) {
      badge = document.createElement("b");
      badge.className = "option-state";
      card.append(badge);
    }
    const stateValue = toggleState(input.checked);
    card?.classList.toggle("is-enabled", stateValue.enabled);
    card?.classList.toggle("is-disabled", !stateValue.enabled);
    if (badge) badge.textContent = stateValue.enabled ? "On" : "Off";
  });
}

function setFormStatus(form, message, type, duration = 0) {
  const element = form.querySelector(".form-save-status");
  if (!element) return;
  window.clearTimeout(element.statusTimer);
  element.textContent = message;
  element.classList.remove("hidden", "saving", "success", "error");
  element.classList.add(type);
  if (duration > 0) {
    element.statusTimer = window.setTimeout(() => {
      element.classList.add("hidden");
      element.classList.remove("saving", "success", "error");
    }, duration);
  }
}

function clearFormStatus(form) {
  const element = form.querySelector(".form-save-status");
  if (!element) return;
  window.clearTimeout(element.statusTimer);
  element.textContent = "";
  element.classList.add("hidden");
  element.classList.remove("saving", "success", "error");
}

function escapeHtml(value = "") {
  return String(value).replace(/[&<>"']/g, (character) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;"
  })[character]);
}

function normalizeCommandName(value) {
  return value.normalize("NFKD").replace(/[\u0300-\u036f]/g, "").trim().toLowerCase()
    .replace(/\s+/g, "-").replace(/[^a-z0-9_-]+/g, "-").replace(/-{2,}/g, "-")
    .replace(/^[-_]+|[-_]+$/g, "").slice(0, 32);
}

function isVariableInput(element) {
  return element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement;
}

function variableInputLabel(element) {
  return element.closest("label")?.childNodes[0]?.textContent?.trim()
    || element.getAttribute("placeholder")
    || "selected field";
}

function renderCommandVariables() {
  const container = document.querySelector("#command-variable-chips");
  container.innerHTML = commandVariables.map(([value, label]) =>
    `<button type="button" class="variable-chip" data-variable="${escapeHtml(value)}" title="${escapeHtml(label)}">${escapeHtml(value)}</button>`
  ).join("");
}

function insertCommandVariable(variable) {
  const fallback = [...document.querySelectorAll("#custom-form [data-variable-input]")]
    .find((element) => !element.closest(".hidden"));
  const target = isVariableInput(activeVariableField) && activeVariableField.isConnected && !activeVariableField.disabled
    ? activeVariableField
    : fallback;
  if (!isVariableInput(target)) {
    toast("Click a message, embed, field, or reason box before inserting a variable.", true);
    return;
  }
  const start = target.selectionStart ?? target.value.length;
  const end = target.selectionEnd ?? start;
  target.setRangeText(variable, start, end, "end");
  target.focus();
  target.dispatchEvent(new Event("input", { bubbles: true }));
}

function customEmojiName(value = "") {
  return /^<a?:([^:>]+):\d+>$/.exec(value)?.[1] || "";
}

function ticketEmojiLabel(value = "") {
  const name = customEmojiName(value);
  return name ? `:${name}:` : value;
}

function setTicketEmoji(value = "", updatePreview = true) {
  const form = document.querySelector("#ticket-form");
  form.elements.emoji.value = value;
  const current = document.querySelector("#ticket-emoji-current");
  const custom = state.resources.emojis.find((emoji) => emoji.value === value);
  current.innerHTML = custom
    ? `<img src="${escapeHtml(custom.imageUrl)}" alt=":${escapeHtml(custom.name)}:">`
    : escapeHtml(value || "🎫");
  document.querySelector("#ticket-emoji-toggle span:last-child").textContent = value ? "Change emoji" : "Choose emoji";
  if (updatePreview) {
    clearErrors(form);
    updateTicketPreview();
    updateFormDirtyState(form);
  }
}

function renderTicketEmojiPicker(filter = "") {
  const query = filter.trim().toLowerCase();
  const standard = standardTicketEmojis.filter(([emoji, name]) =>
    !query || emoji.includes(query) || name.includes(query)
  );
  const custom = state.resources.emojis.filter((emoji) =>
    !query || emoji.name.toLowerCase().includes(query)
  );
  const sections = [];
  if (standard.length) {
    sections.push(`<div class="emoji-section"><strong>Standard</strong><div class="emoji-options">${standard.map(([emoji, name]) =>
      `<button type="button" class="emoji-option" data-emoji="${escapeHtml(emoji)}" title="${escapeHtml(name)}">${escapeHtml(emoji)}</button>`
    ).join("")}</div></div>`);
  }
  if (custom.length) {
    sections.push(`<div class="emoji-section"><strong>${escapeHtml(state.resources.guild?.name || "Server")} emoji</strong><div class="emoji-options">${custom.map((emoji) =>
      `<button type="button" class="emoji-option custom" data-emoji="${escapeHtml(emoji.value)}" title=":${escapeHtml(emoji.name)}:"><img src="${escapeHtml(emoji.imageUrl)}" alt=":${escapeHtml(emoji.name)}:"><small>${escapeHtml(emoji.name)}</small></button>`
    ).join("")}</div></div>`);
  }
  document.querySelector("#ticket-emoji-grid").innerHTML = sections.join("")
    || emptyState("No matching emoji", "Try another search.");
}

function resourceNames(ids, collection, prefix = "") {
  return ids.map((id) => {
    const resource = collection.find((item) => item.id === id);
    return resource ? `${prefix}${resource.name}` : id;
  }).join(", ");
}

function updateCommandConflicts() {
  const form = document.querySelector("#custom-form");
  const warning = document.querySelector("#command-conflict-warning");
  const allowedRoles = selectedValues(form.elements.allowedRoleIds);
  const blockedRoles = selectedValues(form.elements.blockedRoleIds);
  const allowedChannels = selectedValues(form.elements.allowedChannelIds);
  const blockedChannels = selectedValues(form.elements.blockedChannelIds);
  const roleConflicts = allowedRoles.filter((id) => blockedRoles.includes(id));
  const channelConflicts = allowedChannels.filter((id) => blockedChannels.includes(id));
  const messages = [];
  if (roleConflicts.length) {
    messages.push(`Remove role conflicts: ${resourceNames(roleConflicts, state.resources.roles, "@")}. Blocked rules take precedence at runtime.`);
  }
  if (channelConflicts.length) {
    messages.push(`Remove channel conflicts: ${resourceNames(channelConflicts, state.resources.channels, "#")}. Blocked rules take precedence at runtime.`);
  }
  if (form.elements.accessMode.value === "roles" && allowedRoles.length === 0) {
    messages.push("Selected roles access requires at least one allowed role.");
  }
  warning.textContent = messages.join(" ");
  warning.classList.toggle("hidden", messages.length === 0);
  return messages.length === 0;
}

function formObject(form) {
  return Object.fromEntries(new FormData(form).entries());
}

function selectedValues(select) {
  return [...select.selectedOptions].map((option) => option.value).filter(Boolean);
}

const formBaselines = new WeakMap();

function formFingerprint(form) {
  return JSON.stringify([...form.querySelectorAll("input, textarea, select")].map((field, index) => {
    const key = field.name
      || field.id
      || [...field.attributes].find((attribute) => attribute.name.startsWith("data-"))?.name
      || String(index);
    if (field instanceof HTMLInputElement && ["checkbox", "radio"].includes(field.type)) {
      return [key, field.type, field.checked];
    }
    if (field instanceof HTMLSelectElement && field.multiple) {
      return [key, "multiple", selectedValues(field)];
    }
    return [key, field.type || field.tagName, field.value];
  }));
}

function markFormClean(form) {
  if (!(form instanceof HTMLFormElement)) return;
  syncFeatureToggles(form);
  formBaselines.set(form, formFingerprint(form));
  state.dirtyForms.delete(form);
  updateUnsavedBar();
}

function markAllFormsClean() {
  document.querySelectorAll("form").forEach(markFormClean);
}

function updateFormDirtyState(form) {
  if (state.initializing || !(form instanceof HTMLFormElement)) return;
  const baseline = formBaselines.get(form);
  if (baseline === undefined) {
    markFormClean(form);
    return;
  }
  if (hasFormStateChanged(baseline, formFingerprint(form))) state.dirtyForms.add(form);
  else state.dirtyForms.delete(form);
  updateUnsavedBar();
}

function updateUnsavedBar() {
  const bar = document.querySelector("#unsaved-bar");
  const count = state.dirtyForms.size;
  bar.classList.toggle("hidden", count === 0);
  document.querySelector("#unsaved-copy").textContent = state.pendingNavigation
    ? `${state.pendingNavigation.label}. Save or discard first.`
    : `${count} editor${count === 1 ? " has" : "s have"} changes that are not saved yet.`;
}

function currentNavigationTarget() {
  return {
    type: "page",
    page: state.activePage,
    ticketView: state.ticketView,
    securityView: state.securityView,
    automationView: state.automationView,
    docTopic: state.activeDocTopic
  };
}

async function switchGuild(guildId) {
  const result = await api("/guilds/select", {
    method: "POST",
    body: JSON.stringify({ guildId })
  });
  state.suppressBeforeUnload = true;
  window.location.assign(result.next || "/");
}

async function performNavigation(target) {
  state.pendingNavigation = null;
  updateUnsavedBar();
  if (target.type === "logout") {
    await target.run();
    return;
  }
  if (target.type === "resetForm") {
    if (target.formId === "custom-form") resetCustomForm();
    return;
  }
  if (target.type === "server") {
    await switchGuild(target.guildId);
    return;
  }
  if (target.ticketView) state.ticketView = target.ticketView;
  if (target.securityView) state.securityView = target.securityView;
  if (target.automationView) state.automationView = target.automationView;
  await showPage(target.page);
  if (target.docTopic) await showDocsTopic(target.docTopic, true, target.docHash || "");
  if (target.targetId) {
    window.setTimeout(() => {
      const element = document.getElementById(target.targetId);
      if (!element) return;
      element.scrollIntoView({ behavior: "smooth", block: "center" });
      element.classList.remove("search-target");
      void element.offsetWidth;
      element.classList.add("search-target");
      window.setTimeout(() => element.classList.remove("search-target"), 1800);
    }, 80);
  }
}

function requestNavigation(target, label) {
  if (shouldBlockNavigation(state.dirtyForms.size)) {
    state.pendingNavigation = { target, label };
    updateUnsavedBar();
    signalBlockedNavigation();
    return;
  }
  performNavigation(target).catch((error) => toast(error.message, true));
}

function signalBlockedNavigation() {
  const shell = document.querySelector(".app-shell");
  const bar = document.querySelector("#unsaved-bar");
  shell?.classList.remove("navigation-blocked");
  bar?.classList.remove("attention");
  void shell?.offsetWidth;
  shell?.classList.add("navigation-blocked");
  bar?.classList.add("attention");
  window.clearTimeout(signalBlockedNavigation.timer);
  signalBlockedNavigation.timer = window.setTimeout(() => {
    shell?.classList.remove("navigation-blocked");
    bar?.classList.remove("attention");
  }, 520);
}

function resumePendingNavigation() {
  if (state.dirtyForms.size || !state.pendingNavigation) {
    updateUnsavedBar();
    return;
  }
  const pending = state.pendingNavigation;
  performNavigation(pending.target).catch((error) => toast(error.message, true));
}

function setSelectedValues(select, values = []) {
  const selected = new Set((values || []).map(String));
  [...select.options].forEach((option) => { option.selected = selected.has(option.value); });
}

function emptyState(title, copy) {
  return `<div class="empty-state"><strong>${escapeHtml(title)}</strong><span>${escapeHtml(copy)}</span></div>`;
}

function table(headers, rows) {
  if (!rows.length) return emptyState("Nothing recorded yet", "Activity will appear here once the bot starts handling requests.");
  return `<table><thead><tr>${headers.map((header) => `<th>${header}</th>`).join("")}</tr></thead><tbody>${rows.join("")}</tbody></table>`;
}

function clearErrors(form) {
  form.querySelectorAll(".field-error").forEach((element) => { element.textContent = ""; });
  form.querySelectorAll(".invalid").forEach((element) => element.classList.remove("invalid"));
}

function showErrors(form, fields) {
  Object.entries(fields || {}).forEach(([path, message]) => {
    const error = form.querySelector(`[data-error-for="${CSS.escape(path)}"]`);
    if (error) error.textContent = message;
    const fieldName = path.split(".").at(-1);
    const field = form.elements[fieldName];
    if (field instanceof HTMLElement) field.classList.add("invalid");
  });
}

function optionList(items, label, emptyLabel = "Not configured") {
  return `<option value="">${emptyLabel}</option>${items.map((item) =>
    `<option value="${item.id}">${escapeHtml(label(item))}</option>`
  ).join("")}`;
}

function populateResourceSelects() {
  document.querySelectorAll("[data-channel-select]").forEach((select) => {
    const selected = selectedValues(select);
    const kind = select.dataset.channelSelect;
    const channels = state.resources.channels.filter((channel) =>
      kind === "category"
        ? channel.type === 4
        : kind === "all"
          ? channel.type !== 4
          : [0, 5].includes(channel.type)
    );
    select.innerHTML = `${select.multiple ? "" : '<option value="">Not configured</option>'}${channels.map((channel) =>
      `<option value="${channel.id}">${kind === "category" ? "Category · " : channel.type === 2 || channel.type === 13 ? "Voice · " : "#"}${escapeHtml(channel.name)}</option>`
    ).join("")}`;
    setSelectedValues(select, selected);
  });

  document.querySelectorAll("[data-role-select]").forEach((select) => {
    const selected = selectedValues(select);
    select.innerHTML = `${select.multiple ? "" : '<option value="">Not configured</option>'}${state.resources.roles.map((role) =>
      `<option value="${role.id}">@${escapeHtml(role.name)}</option>`
    ).join("")}`;
    setSelectedValues(select, selected);
  });
}

function populateLibrarySelects() {
  document.querySelectorAll("[data-ticket-type-select]").forEach((select) => {
    const selected = selectedValues(select);
    select.innerHTML = state.ticketTypes.map((type) =>
      `<option value="${type.id}">${escapeHtml(type.emoji ? `${ticketEmojiLabel(type.emoji)} ${type.label}` : type.label)}</option>`
    ).join("");
    setSelectedValues(select, selected);
  });
  document.querySelectorAll("[data-ticket-panel-select]").forEach((select) => {
    const current = select.value;
    select.innerHTML = optionList(state.ticketPanels, (panel) => panel.name, "Choose a panel");
    select.value = current;
  });
  document.querySelectorAll("[data-child-panel-select]").forEach((select) => {
    const selected = selectedValues(select);
    const editingId = Number(document.querySelector("#panel-form").elements.id.value);
    select.innerHTML = state.ticketPanels.filter((panel) => panel.id !== editingId && panel.panelKind === "standard")
      .map((panel) => `<option value="${panel.id}">${escapeHtml(panel.name)}</option>`).join("");
    setSelectedValues(select, selected);
  });
  document.querySelectorAll("[data-announcement-select]").forEach((select) => {
    const current = select.value;
    select.innerHTML = optionList(state.announcements, (template) => template.name, "Choose a template");
    select.value = current;
  });
}

function replacePreviewVariables(value = "") {
  const guildName = state.resources.guild?.name || "Your Server";
  return value
    .replaceAll("{user}", "@Lachlan")
    .replaceAll("{username}", "lachlan")
    .replaceAll("{server}", guildName)
    .replaceAll("{channel}", "#general")
    .replaceAll("{text}", "example text")
    .replaceAll("{reason}", "example reason")
    .replaceAll("{target}", "@Member")
    .replaceAll("{memberCount}", "1,234")
    .replaceAll("{createdAt}", "January 15, 2023")
    .replaceAll("{server_name}", guildName)
    .replaceAll("{server_id}", state.resources.guild?.id || "123456789012345678")
    .replaceAll("{server_member_count}", "1,234")
    .replaceAll("{server_created_at}", "January 1, 2022")
    .replaceAll("{server_icon}", "https://cdn.discordapp.com/embed/avatars/0.png")
    .replaceAll("{channel_name}", "general")
    .replaceAll("{channel_id}", "234567890123456789")
    .replaceAll("{user_name}", "lachlan")
    .replaceAll("{user_id}", "345678901234567890")
    .replaceAll("{user_avatar}", "https://cdn.discordapp.com/embed/avatars/1.png")
    .replaceAll("{ticket_id}", "42")
    .replaceAll("{ticket_category}", "General Support")
    .replaceAll("{created_at}", "June 7, 2026")
    .replaceAll("{closed_at}", "Not closed")
    .replaceAll("{boostCount}", "14")
    .replaceAll("{tier}", "Tier 2");
}

function renderDiscordPreview(container, { content = "", embed = null, components = null }) {
  const hasEmbed = embed && (embed.title || embed.description || embed.authorName || embed.imageUrl || embed.thumbnailUrl || embed.footerText || embed.fields?.length);
  const safeContent = replacePreviewVariables(content);
  const embedHtml = hasEmbed ? `
    <div class="discord-embed" style="--preview-color:${escapeHtml(embed.color || "#5865F2")}">
      ${embed.thumbnailUrl ? `<img class="preview-thumb" src="${escapeHtml(embed.thumbnailUrl)}" alt="">` : ""}
      ${embed.authorName ? `<div class="preview-author">${embed.authorIconUrl ? `<img src="${escapeHtml(embed.authorIconUrl)}" alt="">` : ""}<span>${escapeHtml(replacePreviewVariables(embed.authorName))}</span></div>` : ""}
      ${embed.title ? `<div class="preview-title">${escapeHtml(replacePreviewVariables(embed.title))}</div>` : ""}
      ${embed.description ? `<div class="preview-description">${escapeHtml(replacePreviewVariables(embed.description))}</div>` : ""}
      ${embed.fields?.length ? `<div class="preview-fields">${embed.fields.map((field) => `<div class="preview-field ${field.inline ? "inline" : ""}"><strong>${escapeHtml(replacePreviewVariables(field.name))}</strong><span>${escapeHtml(replacePreviewVariables(field.value))}</span></div>`).join("")}</div>` : ""}
      ${embed.imageUrl ? `<img class="preview-image" src="${escapeHtml(embed.imageUrl)}" alt="">` : ""}
      ${embed.footerText || embed.timestamp ? `<div class="preview-footer">${embed.footerIconUrl ? `<img src="${escapeHtml(embed.footerIconUrl)}" alt="">` : ""}<span>${escapeHtml(replacePreviewVariables(embed.footerText || "Today"))}${embed.timestamp ? " · Today at 12:00" : ""}</span></div>` : ""}
    </div>` : "";
  const componentHtml = components ? `<div class="preview-components">${components.mode === "dropdown"
    ? `<div class="preview-select">${escapeHtml(components.placeholder || "Choose an option")}⌄</div>`
    : `<div class="preview-buttons">${components.labels.slice(0, 10).map((label) => `<span class="preview-button ${escapeHtml(components.buttonStyle || "secondary")}">${escapeHtml(label)}</span>`).join("")}</div>`
  }</div>` : "";
  container.innerHTML = `<div class="discord-message"><div class="discord-avatar">O</div><div><div class="discord-head"><strong>Odyssey Bot</strong><span class="bot-tag">APP</span><time>Today at 12:00</time></div>${safeContent ? `<div class="discord-content">${escapeHtml(safeContent)}</div>` : ""}${embedHtml}${componentHtml}${!safeContent && !embedHtml ? '<div class="discord-content">Configure the action to see a preview.</div>' : ""}</div></div>`;
}

function embedFieldsFromDom() {
  return [...document.querySelectorAll("#embed-fields .embed-field-row")].map((row) => ({
    name: row.querySelector("[data-field-name]").value,
    value: row.querySelector("[data-field-value]").value,
    inline: row.querySelector("[data-field-inline]").checked
  })).filter((field) => field.name || field.value);
}

function addEmbedField(field = { name: "", value: "", inline: false }) {
  const row = document.createElement("div");
  row.className = "embed-field-row";
  row.innerHTML = `<input data-field-name data-variable-input maxlength="256" placeholder="Field name" value="${escapeHtml(field.name)}"><textarea data-field-value data-variable-input maxlength="1024" rows="1" placeholder="Field value">${escapeHtml(field.value)}</textarea><label class="inline-toggle" title="Inline"><input data-field-inline type="checkbox" ${field.inline ? "checked" : ""}></label><button type="button" class="remove-field">Remove</button>`;
  row.querySelector(".remove-field").addEventListener("click", () => {
    row.remove();
    updateCustomPreview();
    updateFormDirtyState(document.querySelector("#custom-form"));
  });
  row.querySelectorAll("input,textarea").forEach((input) => input.addEventListener("input", updateCustomPreview));
  document.querySelector("#embed-fields").append(row);
  updateFormDirtyState(document.querySelector("#custom-form"));
}

function customEmbedFromForm(form) {
  const value = (name) => form.elements[name]?.value || "";
  return {
    content: value("embedContent"),
    title: value("embedTitle"),
    titleUrl: value("embedTitleUrl"),
    description: value("embedDescription"),
    color: value("embedColor") || "#5865F2",
    authorName: value("embedAuthorName"),
    authorIconUrl: value("embedAuthorIconUrl"),
    authorUrl: value("embedAuthorUrl"),
    imageUrl: value("embedImageUrl"),
    thumbnailUrl: value("embedThumbnailUrl"),
    footerText: value("embedFooterText"),
    footerIconUrl: value("embedFooterIconUrl"),
    timestamp: form.elements.embedTimestamp.checked,
    fields: embedFieldsFromDom()
  };
}

function updateCustomActionVisibility() {
  const form = document.querySelector("#custom-form");
  const action = form.elements.actionType.value;

  document.querySelector('[data-action-group="message"]').classList.toggle("hidden", !actionGroups.message.includes(action));
  document.querySelector('[data-action-group="embed"]').classList.toggle("hidden", !actionGroups.embed.includes(action));
  document.querySelector('[data-action-group="channel"]').classList.toggle("hidden", !actionGroups.channel.includes(action));
  document.querySelector('[data-action-group="ping"]').classList.toggle("hidden", !actionGroups.ping.includes(action));
  document.querySelector('[data-action-group="role"]').classList.toggle("hidden", !actionGroups.role.includes(action));
  document.querySelector('[data-action-group="roles"]').classList.toggle("hidden", !actionGroups.roles.includes(action));
  document.querySelector('[data-action-group="panel"]').classList.toggle("hidden", !actionGroups.panel.includes(action));
  document.querySelector('[data-action-group="announcement"]').classList.toggle("hidden", !actionGroups.announcement.includes(action));
  document.querySelector('[data-action-group="target-user"]').classList.toggle("hidden", !actionGroups.targetUser.includes(action));
  document.querySelector('[data-action-group="reason"]').classList.toggle("hidden", !actionGroups.reason.includes(action));
  document.querySelector('[data-action-group="amount"]').classList.toggle("hidden", !actionGroups.amount.includes(action));
  document.querySelector('[data-action-group="duration"]').classList.toggle("hidden", !actionGroups.duration.includes(action));
  document.querySelector('[data-action-group="delete-days"]').classList.toggle("hidden", !actionGroups.deleteDays.includes(action));
  document.querySelector('[data-action-group="new-name"]').classList.toggle("hidden", !actionGroups.newName.includes(action));
  document.querySelector('[data-action-group="new-category"]').classList.toggle("hidden", !actionGroups.newCategory.includes(action));
  document.querySelector('[data-action-group="permission"]').classList.toggle("hidden", !actionGroups.permission.includes(action));
  document.querySelector('[data-action-group="sequence"]').classList.toggle("hidden", action !== "action_sequence");
  const preview = document.querySelector("#custom-preview");
  if (preview && !preview.querySelector(".discord-message")) {
    preview.setAttribute("aria-label", "Configure the action to see a preview");
  }
  updateCustomPreview();
}

function updateCustomPreview() {
  const form = document.querySelector("#custom-form");
  const action = form.elements.actionType.value;
  const embed = customEmbedFromForm(form);
  let content = form.elements.content.value;
  if (["reply_embed", "send_channel", "send_announcement", "log_to_mod", "create_ticket"].includes(action)) content = embed.content;
  if (actionGroups.role.includes(action)) content = `Role action: ${actionLabels[action]}`;
  if (actionGroups.roles.includes(action)) content = `Roles action: ${actionLabels[action]}`;
  if (actionGroups.targetUser.includes(action)) content = `Target user action: ${actionLabels[action]}`;
  if (action === "post_ticket_panel") content = "This command posts the selected ticket panel.";
  if (action === "action_sequence") content = "Runs multiple actions in sequence.";
  if (action === "require_role") content = "Requires the selected role to proceed.";
  if (action === "require_permission") content = "Requires the selected permission to proceed.";
  renderDiscordPreview(document.querySelector("#custom-preview"), {
    content,
    embed: actionGroups.embed.includes(action) ? embed : null
  });
}

function panelDraft() {
  const form = document.querySelector("#panel-form");
  const values = formObject(form);
  return {
    ...values,
    active: form.elements.active.checked,
    ticketTypeIds: selectedValues(form.elements.ticketTypeIds).map(Number),
    childPanelIds: selectedValues(form.elements.childPanelIds).map(Number)
  };
}

function updatePanelVisibility() {
  const kind = document.querySelector("#panel-form").elements.panelKind.value;
  document.querySelector("[data-panel-types]").classList.toggle("hidden", kind !== "standard");
  document.querySelector("[data-panel-children]").classList.toggle("hidden", kind !== "multi");
  updatePanelPreview();
}

function updatePanelPreview() {
  const draft = panelDraft();
  const typeMap = new Map(state.ticketTypes.map((type) => [type.id, type]));
  const panelMap = new Map(state.ticketPanels.map((panel) => [panel.id, panel]));
  const labels = draft.panelKind === "multi"
    ? draft.childPanelIds.map((id) => panelMap.get(id)?.name).filter(Boolean)
    : draft.ticketTypeIds.map((id) => {
        const type = typeMap.get(id);
        return type ? `${ticketEmojiLabel(type.emoji) || "🎫"} ${type.label}` : null;
      }).filter(Boolean);
  renderDiscordPreview(document.querySelector("#panel-preview"), {
    embed: {
      title: draft.title,
      description: draft.description,
      color: draft.color,
      imageUrl: draft.imageUrl,
      thumbnailUrl: draft.thumbnailUrl,
      footerText: draft.footerText,
      footerIconUrl: draft.footerIconUrl,
      fields: []
    },
    components: {
      mode: draft.panelKind === "multi" || draft.displayMode === "dropdown" ? "dropdown" : "buttons",
      placeholder: draft.dropdownPlaceholder,
      labels,
      buttonStyle: state.branding?.ticketButtonStyle || "secondary"
    }
  });
}

function updateTicketPreview() {
  const form = document.querySelector("#ticket-form");
  const values = formObject(form);
  renderDiscordPreview(document.querySelector("#ticket-preview"), {
    content: "@Lachlan",
    embed: {
      title: `${ticketEmojiLabel(values.emoji) || "🎫"} ${values.label || "Ticket type"}`,
      description: values.welcomeMessage,
      color: values.color,
      imageUrl: values.imageUrl,
      thumbnailUrl: values.thumbnailUrl,
      footerText: "",
      footerIconUrl: values.footerIconUrl,
      timestamp: true,
      fields: [{ name: "Opened by", value: "@Lachlan", inline: false }]
    },
    components: {
      mode: "buttons",
      buttonStyle: state.branding?.ticketButtonStyle || "secondary",
      labels: [
        ...(form.elements.claimButtonEnabled.checked ? ["Claim ticket"] : []),
        ...(form.elements.requestCloseEnabled.checked
          ? ["Request close"]
          : form.elements.closeButtonEnabled.checked ? ["Close ticket"] : [])
      ]
    }
  });
}

function updateAnnouncementPreview() {
  const form = document.querySelector("#announcement-form");
  const values = formObject(form);
  const isPlain = values.outputMode === "plain";
  form.querySelectorAll(".announcement-embed-only").forEach((field) => field.classList.toggle("hidden", isPlain));
  form.elements.title.required = !isPlain;
  const pingNotice = values.pingType === "none" ? "" : `Preview only: @${values.pingType} will be included when posted.`;
  renderDiscordPreview(document.querySelector("#announcement-preview"), {
    content: isPlain
      ? [pingNotice, values.title, values.body, values.footer].filter(Boolean).join("\n\n")
      : pingNotice,
    embed: isPlain ? null : {
      title: values.title,
      description: values.body,
      color: values.color,
      imageUrl: values.imageUrl,
      thumbnailUrl: values.thumbnailUrl,
      footerText: values.footer,
      fields: []
    }
  });
}

function socialEntries(containerId) {
  return [...document.querySelectorAll(`#${containerId} .social-entry-row`)]
    .map((row) => ({
      label: row.querySelector("[data-social-label]").value.trim(),
      url: row.querySelector("[data-social-url]").value.trim()
    }))
    .filter((entry) => entry.label || entry.url);
}

function addSocialEntry(containerId, entry = { label: "", url: "" }) {
  const row = document.createElement("div");
  row.className = "social-entry-row";
  row.innerHTML = `
    <input data-social-label maxlength="80" placeholder="${containerId === "social-members" ? "Name - platform" : "Link label"}" value="${escapeHtml(entry.label)}">
    <input data-social-url type="url" placeholder="https://..." value="${escapeHtml(entry.url)}">
    <button type="button" class="secondary-button compact remove-social-entry">Remove</button>`;
  row.querySelector(".remove-social-entry").addEventListener("click", () => {
    row.remove();
    updateSocialsPreview();
    updateFormDirtyState(document.querySelector("#socials-form"));
  });
  row.querySelectorAll("input").forEach((input) => input.addEventListener("input", updateSocialsPreview));
  document.querySelector(`#${containerId}`).append(row);
  updateFormDirtyState(document.querySelector("#socials-form"));
}

function updateSocialsPreview() {
  const form = document.querySelector("#socials-form");
  const values = formObject(form);
  const isPlain = values.outputMode === "plain";
  form.querySelectorAll(".socials-embed-only").forEach((field) => field.classList.toggle("hidden", isPlain));
  const links = socialEntries("social-links");
  const members = socialEntries("social-members");
  const fields = [
    ...(links.length ? [{ name: "Official socials", value: links.map((entry) => `${entry.label}: ${entry.url}`).join("\n"), inline: false }] : []),
    ...(members.length ? [{ name: "Community and members", value: members.map((entry) => `${entry.label}: ${entry.url}`).join("\n"), inline: false }] : [])
  ];
  renderDiscordPreview(document.querySelector("#socials-preview"), {
    content: isPlain
      ? [values.title, values.description, ...fields.map((field) => `${field.name}\n${field.value}`)].filter(Boolean).join("\n\n")
      : "",
    embed: isPlain ? null : {
      title: values.title,
      description: values.description,
      color: values.color,
      imageUrl: values.imageUrl,
      thumbnailUrl: values.thumbnailUrl,
      footerText: values.footerText,
      fields
    }
  });
}

function updateWelcomePreview() {
  const form = document.querySelector("#welcome-form");
  const values = formObject(form);
  renderDiscordPreview(document.querySelector("#welcome-preview"), {
    content: replacePreviewVariables(values.content),
    embed: {
      title: replacePreviewVariables(values.embedTitle),
      description: replacePreviewVariables(values.embedDescription),
      color: values.embedColor || "#5865F2",
      imageUrl: values.embedImageUrl,
      thumbnailUrl: values.embedThumbnailUrl,
      footerText: replacePreviewVariables(values.embedFooterText),
      fields: []
    }
  });
  renderDiscordPreview(document.querySelector("#goodbye-preview"), {
    content: replacePreviewVariables(values.goodbyeContent || "{user_name} has left {server_name}."),
    embed: form.elements.goodbyeEmbedEnabled.checked ? {
      title: replacePreviewVariables(values.embedTitle),
      description: replacePreviewVariables(values.embedDescription),
      color: values.embedColor || "#5865F2",
      imageUrl: values.embedImageUrl,
      thumbnailUrl: values.embedThumbnailUrl,
      footerText: replacePreviewVariables(values.embedFooterText),
      fields: []
    } : null
  });
  renderDiscordPreview(document.querySelector("#boost-preview"), {
    content: replacePreviewVariables(
      values.boostMessage
      || "Thank you {user} for boosting {server}! We now have {boostCount} boosts and are at {tier}."
    )
  });
}

function verificationDraft() {
  const form = document.querySelector("#verification-form");
  const values = formObject(form);
  return {
    ...values,
    enabled: form.elements.enabled.checked,
    publicChannelIds: selectedValues(form.elements.publicChannelIds),
    publicCategoryIds: selectedValues(form.elements.publicCategoryIds),
    hiddenChannelIds: selectedValues(form.elements.hiddenChannelIds),
    hiddenCategoryIds: selectedValues(form.elements.hiddenCategoryIds),
    lockAllChannels: form.elements.lockAllChannels.checked,
    autoCreateChannel: form.elements.autoCreateChannel.checked,
    lockVerificationChannel: form.elements.lockVerificationChannel.checked,
    updateEmbedOnSetup: form.elements.updateEmbedOnSetup.checked,
    applyPermissionsImmediately: form.elements.applyPermissionsImmediately.checked,
    vpnCheckEnabled: form.elements.vpnCheckEnabled.checked,
    vpnFailClosed: form.elements.vpnFailClosed.checked
  };
}

function updateVerificationPreview() {
  const draft = verificationDraft();
  renderDiscordPreview(document.querySelector("#verification-preview"), {
    embed: {
      title: draft.embedTitle,
      description: draft.embedDescription,
      color: draft.embedColor || "#C58B4B",
      footerText: "Discord OAuth verification • Odyssey Bot",
      timestamp: true,
      fields: []
    },
    components: {
      mode: "buttons",
      buttonStyle: "primary",
      labels: [draft.buttonText || "Verify Me"]
    }
  });
  document.querySelector("#verification-role-preview").textContent = draft.verifiedRoleId
    ? `@${roleName(draft.verifiedRoleId)}`
    : "Not configured";
  const publicNames = [
    ...draft.publicCategoryIds.map((id) => roleOrChannelLabel(id, "Category")),
    ...draft.publicChannelIds.map((id) => roleOrChannelLabel(id, "#"))
  ];
  const hiddenNames = [
    ...draft.hiddenCategoryIds.map((id) => roleOrChannelLabel(id, "Category")),
    ...draft.hiddenChannelIds.map((id) => roleOrChannelLabel(id, "#"))
  ];
  document.querySelector("#verification-visibility-summary").innerHTML = `
    <div><span>Public before verification</span><strong>${publicNames.length ? publicNames.map(escapeHtml).join(", ") : "Verification channel only"}</strong></div>
    <div><span>Explicitly hidden</span><strong>${hiddenNames.length ? hiddenNames.map(escapeHtml).join(", ") : "None selected"}</strong></div>
    <div><span>Default behaviour</span><strong>${draft.lockAllChannels ? "Hide every other server area" : "Keep other existing visibility"}</strong></div>`;
}

function roleOrChannelLabel(id, prefix) {
  const channel = state.resources.channels.find((item) => item.id === id);
  return channel ? `${prefix === "#" ? "#" : `${prefix} · `}${channel.name}` : id;
}

function renderVerificationReadiness(verification) {
  const panel = document.querySelector("#verification-readiness");
  const readiness = verification.readiness || {};
  const environmentChecks = [
    { label: "Discord OAuth secret", ok: verification.oauthConfigured },
    { label: "OAuth redirect URI", ok: verification.oauthRedirectConfigured },
    { label: "Public verify hostname", ok: verification.verifyPublicUrlConfigured },
    { label: "Verified role hierarchy", ok: readiness.roleManageable },
    ...(readiness.permissionChecks || []).map((check) => ({
      label: check.label,
      ok: check.ok
    }))
  ];
  const warnings = [
    ...(!verification.oauthConfigured ? ["DISCORD_CLIENT_SECRET is missing, so verification cannot be enabled."] : []),
    ...(!verification.oauthRedirectConfigured ? ["Set the exact DISCORD_OAUTH_REDIRECT_URI registered in Discord."] : []),
    ...(!verification.verifyPublicUrlConfigured ? ["Set VERIFY_PUBLIC_BASE_URL to the public verify hostname."] : []),
    ...(readiness.warnings || [])
  ];
  panel.classList.toggle("has-warnings", warnings.length > 0);
  panel.innerHTML = `
    <div class="section-title">
      <div><span class="step">Check</span><h3>Verification readiness</h3><p>${warnings.length ? "Resolve these items before applying the live gate." : "OAuth, role hierarchy, and Discord permissions are ready."}</p></div>
      <span class="state-pill ${warnings.length ? "warning" : "enabled"}">${warnings.length ? `${warnings.length} warning${warnings.length === 1 ? "" : "s"}` : "Ready"}</span>
    </div>
    <div class="diagnostic-checks">${environmentChecks.map((check) =>
      `<span class="${check.ok ? "ok" : "missing"}">${check.ok ? "Ready" : "Missing"} · ${escapeHtml(check.label)}</span>`
    ).join("")}</div>
    ${warnings.length ? `<div class="diagnostic-warnings">${warnings.map((warning) => `<p>${escapeHtml(warning)}</p>`).join("")}</div>` : ""}`;
}

function renderVerificationSetupResult(result, dryRun = false) {
  const container = document.querySelector("#verification-setup-result");
  container.classList.remove("hidden", "success", "error");
  container.classList.add(result.permissionsFailed ? "error" : "success");
  const visible = (result.visibleChannelIds || []).map((id) => roleOrChannelLabel(id, "#"));
  const hidden = (result.hiddenChannelIds || []).map((id) => roleOrChannelLabel(id, "#"));
  container.innerHTML = `
    <strong>${dryRun ? "Dry run complete" : result.permissionsFailed ? "Setup completed with warnings" : "Setup completed"}</strong>
    <dl>
      <div><dt>Permission writes</dt><dd>${dryRun ? result.permissionChangesPlanned : `${result.permissionsApplied} applied`}</dd></div>
      <div><dt>Failures</dt><dd>${result.permissionsFailed || 0}</dd></div>
      <div><dt>Public areas</dt><dd>${visible.length}</dd></div>
      <div><dt>Hidden areas</dt><dd>${hidden.length}</dd></div>
    </dl>
    ${result.warnings?.length ? `<p>${result.warnings.map(escapeHtml).join("<br>")}</p>` : ""}
    ${result.failures?.length ? `<p>${result.failures.slice(0, 5).map((failure) => `${escapeHtml(roleOrChannelLabel(failure.channelId, "#"))}: ${escapeHtml(failure.message)}`).join("<br>")}</p>` : ""}
    <small>${dryRun ? "No Discord channels or permissions were changed." : "Existing unrelated role and member overwrites were preserved."}</small>`;
}

async function loadOverview() {
  const data = await api("/overview");
  const labels = {
    customCommands: "Commands",
    ticketTypes: "Ticket types",
    ticketPanels: "Ticket panels",
    openTickets: "Open tickets",
    announcements: "Announcements",
    warnings: "Warnings"
  };
  document.querySelector("#overview-cards").innerHTML = Object.entries(data).map(([key, value]) =>
    `<article class="surface stat-card"><strong>${value}</strong><span>${labels[key]}</span></article>`
  ).join("");
  renderActivity();
}

function itemList(items, type, subtitle) {
  if (!items.length) return emptyState(`No ${type === "custom" ? "commands" : type === "panel" ? "panels" : type === "ticket" ? "ticket types" : "templates"} yet`, "Create the first one in the editor beside this list.");
  return items.map((item) => `<div class="list-item"><div class="list-copy"><strong>${escapeHtml(item.name || item.label)}</strong><span>${escapeHtml(subtitle(item))}</span></div><div class="item-actions"><button data-action="edit" data-type="${type}" data-id="${item.id}">Edit</button><button class="delete" data-action="delete" data-type="${type}" data-id="${item.id}">Delete</button></div></div>`).join("");
}

async function loadCustomCommands() {
  state.customCommands = await api("/custom-commands");
  document.querySelector("#custom-count").textContent = state.customCommands.length;
  document.querySelector("#custom-list").innerHTML = itemList(state.customCommands, "custom", (item) =>
    `${item.enabled ? "Enabled" : "Disabled"} · ${actionLabels[item.actionType]} · /custom ${item.name}`
  );
}

async function loadTickets() {
  const [typesResult, panelsResult, historyResult, closeRequestsResult, transcriptsResult] = await Promise.allSettled([
    api("/ticket-types"),
    api("/ticket-panels"),
    api("/tickets"),
    api("/ticket-close-requests"),
    api("/ticket-transcripts")
  ]);
  const ticketStatus = document.querySelector("#ticket-load-status");
  const typesPayload = typesResult.status === "fulfilled" ? typesResult.value : null;
  state.ticketTypes = Array.isArray(typesPayload) ? typesPayload : (typesPayload?.items || []);
  state.ticketPanels = panelsResult.status === "fulfilled" && Array.isArray(panelsResult.value) ? panelsResult.value : [];
  state.closeRequests = closeRequestsResult.status === "fulfilled" && Array.isArray(closeRequestsResult.value) ? closeRequestsResult.value : [];
  state.ticketTranscripts = transcriptsResult.status === "fulfilled" && Array.isArray(transcriptsResult.value) ? transcriptsResult.value : [];
  state.ticketTypesError = typesResult.status === "rejected"
    ? typesResult.reason?.message || "Ticket types could not be loaded."
    : typesPayload?.ok === false ? typesPayload.error || "Ticket types could not be loaded." : null;
  const history = historyResult.status === "fulfilled" && Array.isArray(historyResult.value) ? historyResult.value : [];
  const failedAreas = [
    state.ticketTypesError ? "ticket types" : "",
    panelsResult.status === "rejected" ? "ticket panels" : "",
    historyResult.status === "rejected" ? "ticket history" : "",
    closeRequestsResult.status === "rejected" ? "close requests" : "",
    transcriptsResult.status === "rejected" ? "transcripts" : ""
  ].filter(Boolean);
  if (failedAreas.length) {
    ticketStatus.classList.remove("hidden");
    ticketStatus.innerHTML = `
      <div class="section-status-copy">
        <strong>${state.ticketTypesError ? "Ticket types could not be loaded" : "Some ticket data could not be loaded"}</strong>
        <span>${escapeHtml(state.ticketTypesError || `Unavailable: ${failedAreas.join(", ")}. Other dashboard areas are still available.`)}</span>
      </div>
      <button type="button" class="secondary-button compact" id="retry-ticket-load">Retry</button>`;
    ticketStatus.querySelector("#retry-ticket-load").addEventListener("click", () => {
      loadTickets().catch((error) => toast(error.message, true));
    });
  } else {
    ticketStatus.classList.add("hidden");
    ticketStatus.innerHTML = "";
  }
  populateLibrarySelects();
  document.querySelector("#ticket-count").textContent = state.ticketTypes.length;
  document.querySelector("#panel-count").textContent = state.ticketPanels.length;
  document.querySelector("#ticket-list").innerHTML = state.ticketTypesError
    ? emptyState("Ticket types unavailable", "Retry when the dashboard database connection is available.")
    : itemList(state.ticketTypes, "ticket", (item) =>
    `${item.active ? "Active" : "Disabled"} · ${ticketEmojiLabel(item.emoji) || "No emoji"} · ${item.categoryId ? "Custom category" : "Default category"} · ${item.staffRoleIds.length} staff role(s)`
  );
  document.querySelector("#panel-list").innerHTML = panelsResult.status === "rejected"
    ? emptyState("Ticket panels unavailable", "Retry when the dashboard connection recovers.")
    : itemList(state.ticketPanels, "panel", (item) =>
    `${item.active ? "Active" : "Disabled"} · ${item.panelKind === "multi" ? "Multi-panel" : item.displayMode} · ${item.panelKind === "multi" ? item.childPanelIds.length : item.ticketTypeIds.length} option(s)`
  );
  document.querySelector("#ticket-history").innerHTML = table(
    ["Type", "User", "Status", "Opened", "Claimed by"],
    history.map((ticket) => `<tr><td>${escapeHtml(ticket.typeLabel || "Deleted type")}</td><td>${escapeHtml(ticket.userId)}</td><td><span class="pill">${escapeHtml(ticket.status)}</span></td><td>${escapeHtml(ticket.openedAt)}</td><td>${escapeHtml(ticket.claimedBy || "-")}</td></tr>`)
  );
  document.querySelector("#ticket-transcripts").innerHTML = table(
    ["Ticket", "Opened by", "Closed by", "Messages", "Created", "Download"],
    state.ticketTranscripts.map((transcript) => `<tr>
      <td>${escapeHtml(transcript.channelName)}<br><span class="table-secondary">#${transcript.ticketId}</span></td>
      <td>${escapeHtml(transcript.openerId)}</td>
      <td>${escapeHtml(transcript.closedBy)}</td>
      <td>${escapeHtml(String(transcript.messageCount))}</td>
      <td>${escapeHtml(transcript.createdAt)}</td>
      <td><a class="secondary-button compact" href="/api/ticket-transcripts/${transcript.id}/download" target="_blank" rel="noopener">Download</a></td>
    </tr>`)
  );
  document.querySelector("#ticket-close-requests").innerHTML = table(
    ["Request", "Source", "Ticket", "Requester", "Reason", "Status", "Resolved by", "Created"],
    state.closeRequests.map((request) => `<tr>
      <td>#${request.id}</td>
      <td><span class="pill">${request.requestSource === "staff" ? "Staff → Community" : "Community → Staff"}</span></td>
      <td>${escapeHtml(request.typeLabel || "Ticket")}<br><span class="table-secondary">#${escapeHtml(request.channelId || "deleted")}</span></td>
      <td>${escapeHtml(request.requestedBy)}</td>
      <td class="wrap-cell">${escapeHtml(request.reason || "No reason provided")}</td>
      <td><span class="pill status-${escapeHtml(request.status)}">${escapeHtml(request.status)}</span></td>
      <td>${escapeHtml(request.resolvedBy || "-")}</td>
      <td>${escapeHtml(request.createdAt)}</td>
    </tr>`)
  );
  updatePanelPreview();
}

async function loadAnnouncements() {
  state.announcements = await api("/announcements");
  populateLibrarySelects();
  document.querySelector("#announcement-count").textContent = state.announcements.length;
  document.querySelector("#announcement-list").innerHTML = itemList(state.announcements, "announcement", (item) =>
    `${item.outputMode === "plain" ? "Plain text" : "Embed"} · ${item.targetChannelId ? "Saved target channel" : "Uses server default channel"}`
  );
}

async function loadSocials() {
  const data = await api("/socials");
  state.socials = data;
  const form = document.querySelector("#socials-form");
  form.elements.outputMode.value = data.outputMode || "embed";
  form.elements.title.value = data.title || "";
  form.elements.description.value = data.description || "";
  form.elements.color.value = data.color || "#5865F2";
  form.elements.colorText.value = data.color || "#5865F2";
  form.elements.thumbnailUrl.value = data.thumbnailUrl || "";
  form.elements.imageUrl.value = data.imageUrl || "";
  form.elements.targetChannelId.value = data.targetChannelId || "";
  document.querySelector("#social-links").innerHTML = "";
  document.querySelector("#social-members").innerHTML = "";
  (data.links || []).forEach((entry) => addSocialEntry("social-links", entry));
  (data.memberEntries || []).forEach((entry) => addSocialEntry("social-members", entry));
  if (!data.links?.length) addSocialEntry("social-links");
  updateSocialsPreview();
  markFormClean(form);
}

function updateGiveawayPreview() {
  const form = document.querySelector("#giveaway-form");
  const values = formObject(form);
  const timestamp = values.endsAt ? Math.floor(new Date(values.endsAt).getTime() / 1000) : null;
  renderDiscordPreview(document.querySelector("#giveaway-preview"), {
    embed: {
      title: values.prize ? `Giveaway: ${values.prize}` : "Giveaway: Prize name",
      description: [
        values.description || "Click Enter Giveaway below to join.",
        "",
        `**Winners:** ${values.winnersCount || 1}`,
        timestamp ? `**Ends:** <t:${timestamp}:R>` : "**Ends:** choose an end time",
        values.requiredRoleId ? `**Required role:** @${roleName(values.requiredRoleId)}` : ""
      ].filter(Boolean).join("\n"),
      color: "#C58B4B",
      fields: []
    },
    components: { mode: "buttons", labels: ["Enter Giveaway"] }
  });
}

async function loadGiveaways() {
  const data = await api("/giveaways");
  state.giveaways = data.giveaways || [];
  state.giveawayEntries = data.entries || [];
  document.querySelector("#giveaway-count").textContent = state.giveaways.length;
  document.querySelector("#giveaway-list").innerHTML = state.giveaways.length
    ? state.giveaways.map((item) => {
      const entries = state.giveawayEntries.find((entry) => entry.giveawayId === item.id)?.count ?? 0;
      const primaryAction = item.status === "draft" ? "start" : item.status === "active" ? "end" : "reroll";
      return `<div class="saved-item">
        <div class="list-copy"><strong>${escapeHtml(item.prize)}</strong><span>${escapeHtml(item.status)} · ${entries} entr${entries === 1 ? "y" : "ies"} · ends ${new Date(item.endsAt).toLocaleString()}</span></div>
        <div class="item-actions">
          <button data-giveaway-action="${primaryAction}" data-id="${item.id}">${primaryAction === "start" ? "Start" : primaryAction === "end" ? "End" : "Reroll"}</button>
          <button class="secondary-button" data-giveaway-action="reroll" data-id="${item.id}">Reroll</button>
          <button class="delete" data-giveaway-action="cancel" data-id="${item.id}">Cancel</button>
        </div>
      </div>`;
    }).join("")
    : emptyState("No giveaways yet", "Create a giveaway draft, then start it when you are ready.");
  const form = document.querySelector("#giveaway-form");
  if (!form.elements.endsAt.value) {
    const soon = new Date(Date.now() + 60 * 60_000);
    soon.setMinutes(soon.getMinutes() - soon.getTimezoneOffset());
    form.elements.endsAt.value = soon.toISOString().slice(0, 16);
  }
  updateGiveawayPreview();
  markFormClean(form);
}

async function loadGuilds() {
  const data = await api("/guilds");
  state.guilds = data.guilds;
  state.selectedGuildId = data.selectedGuildId;
  const select = document.querySelector("#guild-switcher");
  select.innerHTML = state.guilds.map((guild) =>
    `<option value="${guild.id}">${escapeHtml(guild.name)}</option>`
  ).join("");
  select.value = data.selectedGuildId;
}

async function loadModeration() {
  const data = await api("/moderation");
  document.querySelector("#cases-table").innerHTML = table(
    ["Case", "Action", "Target", "Moderator", "Status", "Reason", "Updated"],
    (data.cases || []).map((item) => `<tr>
      <td>#${item.caseNumber}</td>
      <td><span class="pill">${escapeHtml(item.actionType)}</span></td>
      <td>${escapeHtml(item.targetUserId)}</td>
      <td>${escapeHtml(item.moderatorId)}</td>
      <td><span class="pill status-${escapeHtml(item.status)}">${escapeHtml(item.status)}</span></td>
      <td class="wrap-cell">${escapeHtml(item.reason || "No reason")}</td>
      <td>${escapeHtml(item.updatedAt)}</td>
    </tr>`)
  );
  document.querySelector("#warnings-table").innerHTML = table(
    ["ID", "User", "Moderator", "Reason", "Date"],
    data.warnings.map((warning) => `<tr><td>${warning.id}</td><td>${escapeHtml(warning.userId)}</td><td>${escapeHtml(warning.moderatorId)}</td><td>${escapeHtml(warning.reason)}</td><td>${escapeHtml(warning.createdAt)}</td></tr>`)
  );
  document.querySelector("#actions-table").innerHTML = table(
    ["Action", "Target", "Moderator", "Reason", "Date"],
    data.actions.map((action) => `<tr><td><span class="pill">${escapeHtml(action.action)}</span></td><td>${escapeHtml(action.targetUserId || "-")}</td><td>${escapeHtml(action.moderatorId)}</td><td>${escapeHtml(action.reason || "-")}</td><td>${escapeHtml(action.createdAt)}</td></tr>`)
  );
}

async function loadSettings() {
  const settings = await api("/settings");
  const form = document.querySelector("#settings-form");
  Object.entries(settings).forEach(([key, value]) => {
    const field = form.elements[key];
    if (!field) return;
    if (field instanceof HTMLSelectElement && field.multiple) setSelectedValues(field, value);
    else field.value = value || "";
  });
  markFormClean(form);
}

async function loadLogging() {
  const settings = await api("/logging");
  state.logging = settings;
  const form = document.querySelector("#logging-form");
  Object.entries(settings).forEach(([key, value]) => {
    const field = form.elements[key];
    if (!field) return;
    if (field.type === "checkbox") field.checked = Boolean(value);
    else field.value = value || "";
  });
  syncFeatureToggles(form);
  markFormClean(form);
}

function blendHex(colorValue, amount = 0.22) {
  const match = /^#([0-9a-f]{6})$/i.exec(colorValue);
  if (!match) return "#E0B476";
  const number = Number.parseInt(match[1], 16);
  const channels = [number >> 16, (number >> 8) & 255, number & 255]
    .map((channel) => Math.round(channel + (255 - channel) * amount));
  return `#${channels.map((channel) => channel.toString(16).padStart(2, "0")).join("")}`;
}

function shadeHex(colorValue, amount = 0.2) {
  const match = /^#([0-9a-f]{6})$/i.exec(colorValue);
  if (!match) return "#9F6536";
  const number = Number.parseInt(match[1], 16);
  const channels = [number >> 16, (number >> 8) & 255, number & 255]
    .map((channel) => Math.round(channel * (1 - amount)));
  return `#${channels.map((channel) => channel.toString(16).padStart(2, "0")).join("")}`;
}

function applyDashboardAccent(value) {
  if (!/^#[0-9a-f]{6}$/i.test(value || "")) return;
  const isLight = document.documentElement.dataset.theme === "light";
  document.documentElement.style.setProperty("--brand", isLight ? shadeHex(value, 0.18) : value);
  document.documentElement.style.setProperty("--brand-bright", isLight ? shadeHex(value, 0.36) : blendHex(value));
}

window.addEventListener("odyssey:themechange", () => {
  const accent = state.branding?.accentColor;
  if (accent) applyDashboardAccent(accent);
});

function updateBrandingPreview() {
  const form = document.querySelector("#branding-form");
  const values = formObject(form);
  applyDashboardAccent(values.accentColor);
  renderDiscordPreview(document.querySelector("#branding-preview"), {
    embed: {
      title: values.ticketPanelTitle || "Support Tickets",
      description: values.ticketPanelDescription || "Choose a ticket type below to contact the team.",
      color: values.ticketPanelColor || "#5865F2",
      imageUrl: values.ticketPanelImageUrl,
      thumbnailUrl: values.embedIconUrl,
      footerText: values.footerText,
      footerIconUrl: values.embedIconUrl,
      fields: []
    },
    components: {
      mode: "buttons",
      labels: ["General support", "Billing"],
      buttonStyle: values.ticketButtonStyle || "secondary"
    }
  });
  const media = [
    { label: "Embed icon", url: values.embedIconUrl },
    { label: "Ticket banner", url: values.ticketPanelImageUrl },
    { label: "Announcement image", url: values.announcementDefaultImageUrl },
    { label: "Announcement thumbnail", url: values.announcementDefaultThumbnailUrl }
  ];
  document.querySelector("#branding-media-preview").innerHTML = media.map((item) => item.url
    ? `<div class="media-preview-item"><img src="${escapeHtml(item.url)}" alt=""><span>${escapeHtml(item.label)}</span></div>`
    : `<div class="media-preview-item empty"><div>Image</div><span>${escapeHtml(item.label)}</span></div>`
  ).join("");
}

async function loadBranding() {
  const branding = await api("/branding");
  state.branding = branding;
  const form = document.querySelector("#branding-form");
  Object.entries(branding).forEach(([key, value]) => {
    if (form.elements[key]) form.elements[key].value = value || "";
  });
  ["accentColor", "ticketPanelColor", "announcementDefaultColor"].forEach((name) => {
    if (form.elements[`${name}Text`]) form.elements[`${name}Text`].value = form.elements[name].value.toUpperCase();
  });
  updateBrandingPreview();
  markFormClean(form);
}

async function loadWelcome() {
  const data = await api("/welcome");
  state.welcome = data;
  const form = document.querySelector("#welcome-form");
  Object.entries(data).forEach(([key, value]) => {
    const field = form.elements[key];
    if (!field) return;
    if (field instanceof HTMLSelectElement && field.multiple) setSelectedValues(field, value);
    else if (field.type === "checkbox") field.checked = Boolean(value);
    else field.value = value || "";
  });
  updateWelcomePreview();
  markFormClean(form);
}

async function loadSecurity() {
  const [antiRaid, antiNuke, antiRole, verification] = await Promise.all([
    api("/anti-raid"),
    api("/anti-nuke"),
    api("/anti-role"),
    api("/verification")
  ]);
  state.antiRaid = antiRaid;
  state.antiNuke = antiNuke;
  state.antiRole = antiRole;
  state.verification = verification;

  const raidForm = document.querySelector("#anti-raid-form");
  Object.entries(antiRaid).forEach(([key, value]) => {
    const field = raidForm.elements[key];
    if (!field) return;
    if (field instanceof HTMLSelectElement && field.multiple) setSelectedValues(field, value);
    else if (field.type === "checkbox") field.checked = Boolean(value);
    else field.value = value ?? "";
  });

  const nukeForm = document.querySelector("#anti-nuke-form");
  Object.entries(antiNuke).forEach(([key, value]) => {
    const field = nukeForm.elements[key];
    if (!field) return;
    if (field.type === "checkbox") field.checked = Boolean(value);
    else field.value = value ?? "";
  });

  const roleForm = document.querySelector("#anti-role-form");
  Object.entries(antiRole).forEach(([key, value]) => {
    const field = roleForm.elements[key];
    if (!field) return;
    if (field instanceof HTMLSelectElement && field.multiple) setSelectedValues(field, value);
    else if (field.type === "checkbox") field.checked = Boolean(value);
    else if (Array.isArray(value)) field.value = value.join(" ");
    else field.value = value ?? "";
  });

  const verificationForm = document.querySelector("#verification-form");
  Object.entries(verification.settings).forEach(([key, value]) => {
    const field = verificationForm.elements[key];
    if (!field) return;
    if (field instanceof HTMLSelectElement && field.multiple) setSelectedValues(field, value);
    else if (field.type === "checkbox") field.checked = Boolean(value);
    else field.value = value ?? "";
  });
  verificationForm.elements.embedColorText.value = verification.settings.embedColor.toUpperCase();
  const cards = [
    {
      label: "Discord OAuth",
      ok: verification.oauthConfigured,
      detail: verification.oauthConfigured
        ? (verification.oauthRedirectConfigured ? "Client secret and redirect URI configured" : "Client secret set; add the exact DISCORD_OAUTH_REDIRECT_URI")
        : "Not configured — add DISCORD_CLIENT_SECRET to .env"
    },
    {
      label: "Public verification URL",
      ok: verification.verifyPublicUrlConfigured,
      detail: verification.verifyPublicUrlConfigured
        ? "VERIFY_PUBLIC_BASE_URL set"
        : "Not set — verification setup will not generate a fallback admin-host link"
    },
    {
      label: "VPN / proxy provider",
      ok: verification.vpnProviderConfigured,
      detail: verification.vpnProviderConfigured
        ? "Provider API key and URL template configured"
        : "Not configured — VPN checks will be skipped"
    },
    {
      label: "Proxy / Cloudflare Tunnel",
      ok: verification.trustProxyEnabled,
      detail: verification.trustProxyEnabled
        ? "TRUST_PROXY=true — X-Forwarded-For headers trusted"
        : "TRUST_PROXY not set — set to true when running behind Cloudflare Tunnel or a reverse proxy"
    }
  ];

  document.querySelector("#verification-provider-status").innerHTML = cards.map((card) =>
    `<div class="provider-card ${card.ok ? "ok" : "warn"}">
      <div class="provider-card-icon">${card.ok ? "&#10003;" : "!"}</div>
      <div class="provider-card-body">
        <strong>${escapeHtml(card.label)}</strong>
        <span>${escapeHtml(card.detail)}</span>
      </div>
    </div>`
  ).join("");

  renderVerificationReadiness(verification);
  document.querySelector("#stable-verification-link").value = verification.stableUrl || "";
  const setupStatus = document.querySelector("#verification-setup-status");
  setupStatus.innerHTML = `
    <div><span>Mode</span><strong>${verification.settings.enabled ? "Enabled" : "Disabled"}</strong></div>
    <div><span>Permissions</span><strong>${verification.settings.permissionsApplied ? "Applied" : "Not applied"}</strong></div>
    <div><span>Channel</span><strong>${verification.settings.verificationChannelId ? escapeHtml(channelName(verification.settings.verificationChannelId)) : `Will create #${escapeHtml(verification.settings.verificationChannelName)}`}</strong></div>
    <div><span>Last setup</span><strong>${verification.settings.lastSetupAt ? escapeHtml(new Date(verification.settings.lastSetupAt).toLocaleString()) : "Never"}</strong></div>`;
  updateVerificationPreview();

  document.querySelector("#verification-records").innerHTML = table(
    ["User", "Result", "Reasons", "Risk", "VPN", "Verified", "Review"],
    verification.records.map((record) => `<tr>
      <td>${escapeHtml(record.userId)}</td>
      <td><span class="pill status-${escapeHtml(record.status)}">${escapeHtml(record.status)}</span></td>
      <td class="wrap-cell">${escapeHtml((record.reasonCodes || []).join(", ") || "None")}</td>
      <td>${record.riskScore}</td>
      <td>${record.vpnDetected === null ? "N/A" : record.vpnDetected ? "Yes" : "No"}</td>
      <td>${escapeHtml(record.verifiedAt)}</td>
      <td><div class="table-actions">
        <button class="secondary-button compact" data-verification-review="approve" data-id="${record.id}">Approve</button>
        <button class="secondary-button compact danger" data-verification-review="deny" data-id="${record.id}">Deny</button>
      </div></td>
    </tr>`)
  );
  syncFeatureToggles(verificationForm);
  [raidForm, nukeForm, roleForm, verificationForm].forEach(markFormClean);
}

function automationList(items, type, subtitle, extraAction) {
  if (!items.length) return emptyState("Nothing configured yet", "Use the editor to create the first item.");
  return items.map((item) => `<div class="list-item">
    <div class="list-copy"><strong>${escapeHtml(item.name || channelName(item.channelId))}</strong><span>${escapeHtml(subtitle(item))}</span></div>
    <div class="item-actions">
      <button data-auto-action="edit" data-auto-type="${type}" data-id="${item.id}">Edit</button>
      <button data-auto-action="${extraAction}" data-auto-type="${type}" data-id="${item.id}">${extraAction === "post" ? "Post" : "Test"}</button>
      <button class="delete" data-auto-action="delete" data-auto-type="${type}" data-id="${item.id}">Delete</button>
    </div>
  </div>`).join("");
}

function channelName(channelId) {
  const channel = state.resources.channels.find((item) => item.id === channelId);
  return channel ? `#${channel.name}` : channelId || "No channel";
}

function roleName(roleId) {
  return state.resources.roles.find((item) => item.id === roleId)?.name || roleId;
}

function collectRolePanelOptions() {
  const form = document.querySelector("#role-panel-form");
  const selected = selectedValues(form.elements.roleIds);
  const rows = [...document.querySelectorAll("#role-panel-options [data-role-option]")];
  const byRole = new Map(rows.map((row) => [row.dataset.roleId, {
    roleId: row.dataset.roleId,
    label: row.querySelector("[data-role-label]").value.trim(),
    description: row.querySelector("[data-role-description]").value.trim(),
    emoji: row.querySelector("[data-role-emoji]").value.trim(),
    category: row.querySelector("[data-role-category]").value.trim() || "General",
    requiredRoleId: row.querySelector("[data-role-required]").value || null
  }]));
  return selected.map((roleId) => byRole.get(roleId) || {
    roleId,
    label: "",
    description: "",
    emoji: "",
    category: "General",
    requiredRoleId: null
  });
}

function renderRolePanelOptions(existing = []) {
  const form = document.querySelector("#role-panel-form");
  const selected = selectedValues(form.elements.roleIds);
  const current = collectRolePanelOptions();
  const optionMap = new Map([...existing, ...current].map((option) => [option.roleId, option]));
  const roleChoices = optionList(state.resources.roles, (role) => role.name, "No extra requirement");
  const container = document.querySelector("#role-panel-options");
  if (!selected.length) {
    container.innerHTML = emptyState("Choose roles first", "Select one or more roles above, then customize how they appear.");
    return;
  }
  container.innerHTML = selected.map((roleId) => {
    const option = optionMap.get(roleId) || {};
    return `<div class="role-option-card" data-role-option data-role-id="${escapeHtml(roleId)}">
      <div class="role-option-title"><strong>${escapeHtml(roleName(roleId))}</strong><span>${escapeHtml(roleId)}</span></div>
      <div class="form-grid compact-grid">
        <label class="field">Button/dropdown label<input data-role-label maxlength="80" value="${escapeHtml(option.label || "")}" placeholder="${escapeHtml(roleName(roleId))}"></label>
        <label class="field">Category<input data-role-category maxlength="80" value="${escapeHtml(option.category || "General")}" placeholder="General"></label>
        <label class="field">Emoji<input data-role-emoji maxlength="100" value="${escapeHtml(option.emoji || "")}" placeholder="✨ or <:role:123>"></label>
        <label class="field">Required role<select data-role-required>${roleChoices}</select></label>
        <label class="field span-2">Description<input data-role-description maxlength="100" value="${escapeHtml(option.description || "")}" placeholder="Shown in dropdown menus"></label>
      </div>
    </div>`;
  }).join("");
  selected.forEach((roleId) => {
    const option = optionMap.get(roleId) || {};
    const row = container.querySelector(`[data-role-id="${CSS.escape(roleId)}"]`);
    if (row) row.querySelector("[data-role-required]").value = option.requiredRoleId || "";
  });
  container.querySelectorAll("input, select").forEach((field) => {
    field.addEventListener("input", () => {
      updateRolePanelPreview();
      updateFormDirtyState(form);
    });
    field.addEventListener("change", () => {
      updateRolePanelPreview();
      updateFormDirtyState(form);
    });
  });
}

function updateRolePanelPreview() {
  const form = document.querySelector("#role-panel-form");
  const values = formObject(form);
  const options = collectRolePanelOptions();
  renderDiscordPreview(document.querySelector("#role-panel-preview"), {
    embed: {
      title: values.title || "Choose your roles",
      description: values.description || "Click a button to add or remove a role.",
      color: values.color || "#5865F2",
      fields: []
    },
    components: {
      mode: values.layout || "buttons",
      labels: options.map((option) => option.label || roleName(option.roleId))
    }
  });
}

function updateStickyPreview() {
  const values = formObject(document.querySelector("#sticky-form"));
  renderDiscordPreview(document.querySelector("#sticky-preview"), {
    content: values.content || "Your sticky message preview appears here."
  });
}

function domainValues(value) {
  return String(value || "").split(/[\s,]+/).map((item) => item.trim()).filter(Boolean);
}

function addAutoModLinkRule(rule = { channelId: "", allowedDomains: [], blockedDomains: [] }) {
  const row = document.createElement("div");
  row.className = "automod-link-rule";
  const channels = state.resources.channels.filter((channel) => [0, 5].includes(channel.type));
  row.innerHTML = `
    <label class="field">Channel<select data-link-rule-channel>${optionList(channels, (channel) => `#${channel.name}`, "Choose a channel")}</select></label>
    <label class="field">Allowed domains<textarea data-link-rule-allowed rows="2" placeholder="x.com, twitter.com">${escapeHtml((rule.allowedDomains || []).join("\n"))}</textarea><small>Domain only. Subdomains are included.</small></label>
    <label class="field">Blocked domains<textarea data-link-rule-blocked rows="2" placeholder="example.com">${escapeHtml((rule.blockedDomains || []).join("\n"))}</textarea><small>These stay blocked in this channel.</small></label>
    <button type="button" class="secondary-button compact remove-link-rule">Remove rule</button>`;
  row.querySelector("[data-link-rule-channel]").value = rule.channelId || "";
  row.querySelector(".remove-link-rule").addEventListener("click", () => {
    row.remove();
    updateFormDirtyState(document.querySelector("#auto-mod-form"));
  });
  document.querySelector("#automod-link-rules").append(row);
  updateFormDirtyState(document.querySelector("#auto-mod-form"));
}

function autoModLinkRules() {
  return [...document.querySelectorAll("#automod-link-rules .automod-link-rule")].map((row) => ({
    channelId: row.querySelector("[data-link-rule-channel]").value,
    allowedDomains: domainValues(row.querySelector("[data-link-rule-allowed]").value),
    blockedDomains: domainValues(row.querySelector("[data-link-rule-blocked]").value)
  }));
}

function formatReadinessTime(value) {
  if (!value) return "Not checked yet";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "Unknown" : date.toLocaleString();
}

function renderAutoModDiagnostics(diagnostics) {
  const panel = document.querySelector("#automod-diagnostics");
  const status = diagnostics.status || (diagnostics.ok ? "ready" : diagnostics.unavailable ? "offline" : "warning");
  const variants = {
    checking: {
      eyebrow: "Checking",
      title: "Checking Discord readiness",
      summary: "AutoMod settings are ready to edit while the live permission check runs.",
      pill: "Checking…"
    },
    ready: {
      eyebrow: "Ready",
      title: "Discord connected",
      summary: diagnostics.summary || "Discord intents and permissions are ready for AutoMod.",
      pill: "Ready"
    },
    warning: {
      eyebrow: "Review",
      title: "Discord connected · action needed",
      summary: diagnostics.summary || "Some intents or permissions need attention for reliable moderation.",
      pill: `${diagnostics.warnings?.length || 0} item${diagnostics.warnings?.length === 1 ? "" : "s"}`
    },
    degraded: {
      eyebrow: "Degraded",
      title: "Using the last successful check",
      summary: diagnostics.summary || "Discord did not answer the latest readiness refresh.",
      pill: "Retry available"
    },
    offline: {
      eyebrow: "Unavailable",
      title: "Live Discord check unavailable",
      summary: diagnostics.summary || "The dashboard could not reach Discord right now.",
      pill: "Offline"
    }
  };
  const variant = variants[status] || variants.offline;
  const ignoredChannels = diagnostics.exemptions?.ignoredChannels || [];
  const ignoredRoles = diagnostics.exemptions?.ignoredRoles || [];
  const ignoredUsers = diagnostics.exemptions?.ignoredUserIds || [];
  const checkedLabel = diagnostics.stale && diagnostics.lastSuccessfulAt
    ? `Last successful check: ${formatReadinessTime(diagnostics.lastSuccessfulAt)}`
    : diagnostics.checkedAt
      ? `Last checked: ${formatReadinessTime(diagnostics.checkedAt)}${diagnostics.cached ? " · cached" : ""}`
      : "";

  panel.dataset.status = status;
  panel.setAttribute("aria-busy", String(status === "checking"));
  panel.innerHTML = `
    <div class="diagnostic-header">
      <div class="diagnostic-heading">
        <span class="diagnostic-indicator" aria-hidden="true">${status === "checking" ? '<span class="diagnostic-spinner"></span>' : ""}</span>
        <div>
          <span class="diagnostic-eyebrow">${escapeHtml(variant.eyebrow)}</span>
          <h3>${escapeHtml(variant.title)}</h3>
          <p>${escapeHtml(variant.summary)}</p>
        </div>
      </div>
      <div class="diagnostic-actions">
        <span class="diagnostic-state">${escapeHtml(variant.pill)}</span>
        ${diagnostics.retryable ? '<button type="button" class="secondary-button compact" data-retry-automod-readiness>Retry check</button>' : ""}
      </div>
    </div>
    ${checkedLabel ? `<p class="diagnostic-meta">${escapeHtml(checkedLabel)}</p>` : ""}
    ${diagnostics.checks?.length ? `<div class="diagnostic-checks">${diagnostics.checks.map((check) =>
      `<span class="${check.ok ? "ok" : "missing"}">${check.ok ? "✓" : "!"} ${escapeHtml(check.label)}</span>`
    ).join("")}</div>` : ""}
    ${diagnostics.warnings?.length ? `<div class="diagnostic-warnings">${diagnostics.warnings.map((warning) =>
      `<p>${escapeHtml(warning)}</p>`
    ).join("")}</div>` : ""}
    ${diagnostics.unavailable ? `<div class="diagnostic-scope">
      <div><strong>Still available</strong><span>Edit and save every AutoMod setting below.</span></div>
      <div><strong>Temporarily unavailable</strong><span>Live Discord intent, channel, and permission validation.</span></div>
    </div>` : ""}
    ${diagnostics.exemptions ? `<details class="diagnostic-exemptions">
      <summary>Review configured exemptions</summary>
      <div>
        <p><strong>Non-link exempt channels:</strong> ${ignoredChannels.length ? ignoredChannels.map((channel) => `#${escapeHtml(channel.name)} (${escapeHtml(channel.id)})`).join(", ") : "None"}</p>
        <p><strong>Ignored roles:</strong> ${ignoredRoles.length ? ignoredRoles.map((role) => `${escapeHtml(role.name)} (${escapeHtml(role.id)})`).join(", ") : "None"}</p>
        <p><strong>Ignored users:</strong> ${ignoredUsers.length ? ignoredUsers.map(escapeHtml).join(", ") : "None"}</p>
        <p>If a test channel, account, or role appears here, non-link rules intentionally skip it.</p>
      </div>
    </details>` : ""}`;

  panel.querySelector("[data-retry-automod-readiness]")?.addEventListener("click", () => {
    loadAutoModDiagnostics(true);
  });
}

async function loadAutoModDiagnostics(force = false) {
  const requestId = ++state.autoModDiagnosticsRequest;
  renderAutoModDiagnostics({
    status: "checking",
    summary: force
      ? "Refreshing Discord intents, channels, roles, and permissions."
      : "AutoMod settings are ready to edit while the live permission check runs."
  });
  try {
    const diagnostics = await api(`/auto-mod/diagnostics${force ? "?force=true" : ""}`);
    if (requestId !== state.autoModDiagnosticsRequest) return;
    renderAutoModDiagnostics(diagnostics);
    if (force && ["ready", "warning"].includes(diagnostics.status)) {
      success(diagnostics.status === "ready"
        ? "Discord readiness check completed."
        : "Discord is connected. Review the readiness items shown.");
    }
  } catch (error) {
    if (requestId !== state.autoModDiagnosticsRequest) return;
    renderAutoModDiagnostics({
      status: "offline",
      unavailable: true,
      retryable: true,
      checkedAt: new Date().toISOString(),
      summary: "The readiness request could not be completed.",
      warnings: [error.message || "Try the check again in a moment."],
      checks: [],
      exemptions: null
    });
  }
}

async function loadAutomation() {
  void loadAutoModDiagnostics();
  const [autoMod, rolePanels, stickyMessages, scheduledAnnouncements] = await Promise.all([
    api("/auto-mod"),
    api("/role-panels"),
    api("/sticky-messages"),
    api("/scheduled-announcements")
  ]);
  state.autoMod = autoMod;
  state.rolePanels = rolePanels;
  state.stickyMessages = stickyMessages;
  state.scheduledAnnouncements = scheduledAnnouncements;

  const autoForm = document.querySelector("#auto-mod-form");
  Object.entries(autoMod).forEach(([key, value]) => {
    const field = autoForm.elements[key];
    if (!field) return;
    if (field instanceof HTMLSelectElement && field.multiple) setSelectedValues(field, value);
    else if (field.type === "checkbox") field.checked = Boolean(value);
    else if (Array.isArray(value)) field.value = value.join(" ");
    else field.value = value ?? "";
  });
  document.querySelector("#automod-link-rules").innerHTML = "";
  (autoMod.linkChannelRules || []).forEach(addAutoModLinkRule);

  populateLibrarySelects();
  document.querySelector("#role-panel-count").textContent = rolePanels.length;
  document.querySelector("#role-panel-list").innerHTML = automationList(
    rolePanels,
    "role-panel",
    (item) => `${item.active ? "Active" : "Disabled"} · ${item.roleIds.length} role(s) · ${channelName(item.channelId)}`,
    "post"
  );
  document.querySelector("#sticky-count").textContent = stickyMessages.length;
  document.querySelector("#sticky-list").innerHTML = automationList(
    stickyMessages,
    "sticky",
    (item) => `${item.enabled ? "Enabled" : "Disabled"} · ${channelName(item.channelId)} · ${item.minIntervalSeconds}s delay`,
    "test"
  );
  document.querySelector("#scheduled-count").textContent = scheduledAnnouncements.length;
  document.querySelector("#scheduled-list").innerHTML = automationList(
    scheduledAnnouncements,
    "scheduled",
    (item) => `${item.enabled ? "Enabled" : "Disabled"} · ${item.scheduleType} · ${new Date(item.nextRunAt).toLocaleString()}`,
    "test"
  );
  renderRolePanelOptions();
  updateRolePanelPreview();
  updateStickyPreview();
  markFormClean(autoForm);
}

function enhanceDocsCodeBlocks() {
  document.querySelectorAll("#docs-topic-content pre").forEach((pre) => {
    if (pre.querySelector(".copy-button")) return;
    const button = document.createElement("button");
    button.type = "button";
    button.className = "copy-button";
    button.textContent = "Copy";
    button.addEventListener("click", async () => {
      await navigator.clipboard.writeText(pre.querySelector("code")?.textContent || pre.textContent || "");
      button.textContent = "Copied";
      window.setTimeout(() => { button.textContent = "Copy"; }, 1400);
    });
    pre.append(button);
  });
}

function stripFirstDocsHeading(html) {
  return String(html || "").replace(/^\s*<h1\b[\s\S]*?<\/h1>/i, "").trim();
}

function docsPathParts(path = "") {
  return String(path).split("→").map((part) => part.trim()).filter(Boolean);
}

function renderDocsTopicList(topics) {
  if (!topics.length) {
    return emptyState("No docs available", "Documentation topics will appear here once the dashboard can load them.");
  }

  const groups = new Map();
  topics.forEach((topic, index) => {
    const category = topic.category || docsPathParts(topic.path)[0] || "Docs";
    if (!groups.has(category)) groups.set(category, []);
    groups.get(category).push({ topic, index });
  });

  return [...groups.entries()].map(([category, entries]) => `<section class="docs-category">
    <div class="docs-category-title">${escapeHtml(category)}</div>
    <div class="docs-category-items">
      ${entries.map(({ topic, index }) => {
        const parts = docsPathParts(topic.path);
        const label = topic.navTitle || parts.at(-1) || topic.title;
        return `<button type="button" class="docs-nav-item ${topic.slug === state.activeDocTopic ? "active" : ""}" data-doc-slug="${escapeHtml(topic.slug)}" data-doc-index="${index}">
          <strong>${escapeHtml(label)}</strong>
        </button>`;
      }).join("")}
    </div>
  </section>`).join("");
}

async function loadDocsIndex() {
  state.docsTopics = await api("/docs");
  const list = document.querySelector("#docs-topic-list");
  list.innerHTML = renderDocsTopicList(state.docsTopics);
  if (!state.activeDocTopic && state.docsTopics[0]) await showDocsTopic(state.docsTopics[0].slug, false, "", { scroll: false });
}

function renderDocsSearchResults(results, query = "") {
  if (!query.trim()) {
    const suggested = results.slice(0, 8);
    if (!suggested.length) return emptyState("Search documentation", "Type a feature, setup step, or error to find the right guide.");
    return `<div class="docs-search-summary">Suggested docs</div>${suggested.map((topic, index) => renderDocsSearchResult(topic, index, query)).join("")}`;
  }
  if (!results.length) return emptyState("No matching docs", "Try terms like cloudflare verification setup, ticket setup, logging, automod, role panels, or commands.");
  return results.map((topic, index) => renderDocsSearchResult(topic, index, query)).join("");
}

function renderDocsSearchResult(topic, index, query = "") {
  const title = topic.heading || topic.title;
  const path = topic.heading ? `${topic.path} / ${topic.heading}` : topic.path;
  const hash = topic.hash || "";
  return `<button type="button" class="docs-search-result ${index === state.docsSearchActiveIndex ? "keyboard-active" : ""}" data-doc-slug="${escapeHtml(topic.slug)}" data-doc-index="${index}" ${hash ? `data-doc-hash="${escapeHtml(hash)}"` : ""}>
    <span class="docs-search-result-path">${highlightSearchText(path || "Docs", query)}</span>
    <strong>${highlightSearchText(title, query)}</strong>
    <small>${highlightSearchText(topic.description || "", query)}</small>
    <i aria-hidden="true">↵</i>
  </button>`;
}

async function loadDocsSearchResults(query = "") {
  const normalized = query.trim();
  state.docsSearchResults = await api(`/docs${normalized ? `?search=${encodeURIComponent(normalized)}` : ""}`);
  state.docsSearchActiveIndex = state.docsSearchResults.length ? 0 : -1;
  document.querySelector("#docs-search-results").innerHTML = renderDocsSearchResults(state.docsSearchResults, normalized);
  setDocsSearchActiveIndex(state.docsSearchActiveIndex);
}

function setDocsSearchActiveIndex(index) {
  state.docsSearchActiveIndex = index;
  document.querySelectorAll("#docs-search-results [data-doc-index]").forEach((button, buttonIndex) => {
    const active = buttonIndex === index;
    button.classList.toggle("keyboard-active", active);
    button.setAttribute("aria-selected", String(active));
    if (active) button.scrollIntoView({ block: "nearest" });
  });
}

async function openDocsSearchModal(query = "") {
  const modal = document.querySelector("#docs-search-modal");
  const input = document.querySelector("#docs-search");
  modal.classList.remove("hidden");
  modal.setAttribute("aria-hidden", "false");
  state.docsSearchOpen = true;
  input.value = query;
  await loadDocsSearchResults(query);
  window.setTimeout(() => input.focus(), 0);
}

function closeDocsSearchModal({ restoreFocus = true } = {}) {
  const modal = document.querySelector("#docs-search-modal");
  if (!modal || modal.classList.contains("hidden")) return;
  modal.classList.add("hidden");
  modal.setAttribute("aria-hidden", "true");
  state.docsSearchOpen = false;
  state.docsSearchActiveIndex = -1;
  if (restoreFocus) document.querySelector("#docs-search-trigger")?.focus();
}

function scrollToDocsHash(hash) {
  if (!hash) return false;
  const target = document.getElementById(hash);
  if (!target) return false;
  target.scrollIntoView({ behavior: "smooth", block: "start" });
  target.classList.remove("docs-target-heading");
  void target.offsetWidth;
  target.classList.add("docs-target-heading");
  window.setTimeout(() => target.classList.remove("docs-target-heading"), 1800);
  return true;
}

function renderDocsPageToc() {
  const toc = document.querySelector("#docs-page-toc");
  if (!toc) return;
  const headings = [...document.querySelectorAll("#docs-topic-content .docs-rendered h2, #docs-topic-content .docs-rendered h3")]
    .filter((heading) => heading.id)
    .slice(0, 14);
  toc.innerHTML = headings.length
    ? `<div class="section-title"><div><p class="eyebrow">On this page</p><h3>Contents</h3></div></div><nav class="docs-page-toc-nav">${headings.map((heading) => `<a href="#${escapeHtml(heading.id)}" class="${heading.tagName === "H3" ? "is-nested" : ""}">${escapeHtml(heading.textContent.replace(/#$/, "").trim())}</a>`).join("")}</nav>`
    : `<div class="section-title"><div><p class="eyebrow">On this page</p><h3>Contents</h3></div></div>${emptyState("Short guide", "This page is brief enough to read from top to bottom.")}`;
}

function renderDocsPagination(topic) {
  if (!topic.previous && !topic.next) return "";
  const link = (entry, direction) => entry
    ? `<button type="button" class="docs-page-link ${direction}" data-doc-slug="${escapeHtml(entry.slug)}">
        <span>${direction === "previous" ? "Previous" : "Next"}</span>
        <strong>${escapeHtml(entry.title)}</strong>
        <small>${escapeHtml(entry.path || "")}</small>
      </button>`
    : `<span></span>`;
  return `<nav class="docs-pagination" aria-label="Documentation pagination">${link(topic.previous, "previous")}${link(topic.next, "next")}</nav>`;
}

async function showDocsTopic(slug, pushHistory = true, hash = "", options = {}) {
  const topic = await api(`/docs/${encodeURIComponent(slug)}`);
  state.activeDocTopic = topic.slug;
  const activeHash = hash || "";
  document.querySelector("#docs-topic-content").innerHTML = `
    <header class="docs-article-header">
      <div class="docs-breadcrumb">${docsPathParts(topic.path).map((part) => `<span>${escapeHtml(part)}</span>`).join("<i>/</i>")}</div>
      <h1>${escapeHtml(topic.title)}</h1>
      <p>${escapeHtml(topic.description)}</p>
    </header>
    <div class="docs-rendered">${stripFirstDocsHeading(topic.html)}</div>
    ${renderDocsPagination(topic)}
  `;
  document.querySelectorAll("[data-doc-slug]").forEach((button) => {
    button.classList.toggle("active", button.dataset.docSlug === topic.slug);
  });
  enhanceDocsCodeBlocks();
  renderDocsPageToc();
  const route = `/docs/${topic.slug}${activeHash ? `#${encodeURIComponent(activeHash)}` : ""}`;
  if (pushHistory && `${window.location.pathname}${window.location.hash}` !== route) {
    window.history.pushState({ page: "docs", topic: topic.slug, hash: activeHash }, "", route);
  }
  if (activeHash) {
    window.setTimeout(() => {
      if (!scrollToDocsHash(activeHash)) document.querySelector(".docs-article")?.scrollIntoView({ block: "start", behavior: "smooth" });
    }, 40);
  } else if (options.scroll !== false) {
    document.querySelector(".docs-article")?.scrollIntoView({ block: "start", behavior: "smooth" });
  }
}

function setTicketView(view) {
  state.ticketView = view || "panels";
  document.querySelectorAll("[data-ticket-view]").forEach((item) => item.classList.toggle("active", item.dataset.ticketView === state.ticketView));
  document.querySelectorAll(".ticket-view").forEach((panel) => panel.classList.toggle("active", panel.id === `ticket-view-${state.ticketView}`));
  const labels = {
    panels: ["Ticket Panels", "Build and post reusable ticket entry messages."],
    types: ["Ticket Types", "Configure routing, staff access, lifecycle rules, and welcome messages."],
    history: ["Ticket History", "Review recently opened, claimed, and closed tickets."],
    "close-requests": ["Close Requests", "Review ticket closure requests and their final status."]
  };
  document.querySelector("#page-title").textContent = labels[state.ticketView][0];
  document.querySelector("#page-subtitle").textContent = labels[state.ticketView][1];
}

function setSecurityView(view) {
  state.securityView = view || "anti-raid";
  document.querySelectorAll("[data-security-view]").forEach((item) => item.classList.toggle("active", item.dataset.securityView === state.securityView));
  document.querySelectorAll(".security-view").forEach((panel) => panel.classList.toggle("active", panel.id === `security-view-${state.securityView}`));
  const labels = {
    "anti-raid": ["Anti Raid", "Detect suspicious join waves and protect member-facing channels."],
    "anti-nuke": ["Anti Nuke", "Monitor destructive administrative actions and respond with explicit safeguards."],
    "anti-role": ["Role Protection", "Audit dangerous role changes and protected-role assignments."],
    verification: ["Verification", "Confirm Discord identity with a transparent consent flow."]
  };
  const label = labels[state.securityView] || labels["anti-raid"];
  document.querySelector("#page-title").textContent = label[0];
  document.querySelector("#page-subtitle").textContent = label[1];
}

function setAutomationView(view) {
  state.automationView = view || "auto-mod";
  document.querySelectorAll("[data-automation-view]").forEach((item) => {
    item.classList.toggle("active", item.dataset.automationView === state.automationView);
  });
  document.querySelectorAll(".automation-view").forEach((panel) => {
    panel.classList.toggle("active", panel.id === `automation-view-${state.automationView}`);
  });
  const labels = {
    "auto-mod": ["Auto Mod", "Detect common message abuse with explicit rules and exemptions.", "auto-mod"],
    "role-panels": ["Role Panels", "Publish safe self-service role buttons for members.", "role-panels"],
    sticky: ["Sticky Messages", "Keep an important notice at the bottom without flooding a channel.", "sticky-messages"],
    scheduled: ["Scheduled Announcements", "Send saved announcement templates once or repeatedly.", "scheduled-announcements"]
  };
  const label = labels[state.automationView] || labels["auto-mod"];
  document.querySelector("#page-title").textContent = label[0];
  document.querySelector("#page-subtitle").textContent = label[1];
  document.querySelector("#automation-docs").dataset.docTopic = label[2];
}

async function showPage(name) {
  state.activePage = name;
  document.querySelectorAll(".nav-group").forEach((group) => {
    group.classList.toggle("open", group.querySelector(`[data-nav-toggle="${name}"]`) !== null);
  });
  document.querySelectorAll(".nav-item").forEach((item) => {
    const isParent = item.dataset.navToggle === name;
    item.classList.toggle("active", item.dataset.page === name || isParent);
  });
  document.querySelectorAll(".page").forEach((page) => page.classList.toggle("active", page.id === `page-${name}`));
  document.querySelector("#page-title").textContent = pageMeta[name][0];
  document.querySelector("#page-subtitle").textContent = pageMeta[name][1];
  const loaders = { overview: loadOverview, custom: loadCustomCommands, tickets: loadTickets, announcements: loadAnnouncements, socials: loadSocials, giveaways: loadGiveaways, moderation: loadModeration, settings: loadSettings, logging: loadLogging, branding: loadBranding, welcome: loadWelcome, security: loadSecurity, automation: loadAutomation };
  try { if (loaders[name]) await loaders[name](); } catch (error) { toast(error.message, true); }
  if (name === "tickets") setTicketView(state.ticketView);
  if (name === "security") setSecurityView(state.securityView);
  if (name === "automation") setAutomationView(state.automationView);
  if (name === "docs") {
    if (!window.location.pathname.startsWith("/docs")) {
      window.history.pushState({ page: "docs" }, "", "/docs");
    }
    try {
      await loadDocsIndex();
      if (!state.activeDocTopic && state.docsTopics[0]) await showDocsTopic(state.docsTopics[0].slug, false, "", { scroll: false });
    } catch (error) {
      document.querySelector("#docs-topic-content").innerHTML = emptyState("Documentation unavailable", error.message);
    }
  } else if (window.location.pathname.startsWith("/docs")) {
    window.history.pushState({ page: name }, "", "/");
  }
  window.scrollTo({ top: 0, behavior: "smooth" });
}

function highlightSearchText(value, query) {
  const tokens = String(query).trim().split(/[^a-z0-9]+/i).filter(Boolean).sort((a, b) => b.length - a.length);
  if (!tokens.length) return escapeHtml(value);
  const pattern = new RegExp(`(${tokens.map((token) => token.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|")})`, "ig");
  return String(value).split(pattern).map((part) =>
    tokens.some((token) => token.toLowerCase() === part.toLowerCase())
      ? `<mark>${escapeHtml(part)}</mark>`
      : escapeHtml(part)
  ).join("");
}

function setSearchActiveIndex(index) {
  state.searchActiveIndex = index;
  document.querySelectorAll("#dashboard-search-results [data-search-index]").forEach((button, buttonIndex) => {
    const active = buttonIndex === index;
    button.classList.toggle("active", active);
    button.setAttribute("aria-selected", String(active));
    if (active) button.scrollIntoView({ block: "nearest" });
  });
}

function renderDashboardSearch(query) {
  const results = searchDashboardItems(query, dashboardSearchItems).slice(0, 9);
  state.searchResults = results;
  state.searchActiveIndex = results.length ? 0 : -1;
  const container = document.querySelector("#dashboard-search-results");
  const input = document.querySelector("#dashboard-search");
  container.classList.toggle("hidden", !query.trim());
  input.setAttribute("aria-expanded", String(Boolean(query.trim())));
  container.innerHTML = results.length
    ? results.map((item, index) => `
      <button type="button" role="option" data-search-index="${index}" aria-selected="${index === 0}">
        <span class="search-result-heading">
          <strong>${highlightSearchText(item.label, query)}</strong>
          <span class="search-result-category">${escapeHtml(item.category || "Page")}</span>
        </span>
        <span>${highlightSearchText(item.description, query)}</span>
        ${item.matchedText && item.matchedText !== item.label && item.matchedText !== item.description
          ? `<small>Matched: ${highlightSearchText(item.matchedText, query)}</small>`
          : ""}
      </button>
    `).join("")
    : emptyState("No matching dashboard area", "Try a feature name such as tickets, auto roles, or invite blocker.");
  if (results.length) setSearchActiveIndex(0);
}

function navigateSearchItem(item) {
  if (!item) return;
  document.querySelector("#dashboard-search").value = "";
  renderDashboardSearch("");
  requestNavigation({ type: "page", ...item }, `Open ${item.label}`);
}

function resetCustomForm() {
  const form = document.querySelector("#custom-form");
  form.reset();
  form.elements.id.value = "";
  form.elements.enabled.checked = true;
  form.elements.embedColor.value = "#5865f2";
  form.elements.embedColorText.value = "#5865F2";
  form.elements.cooldownSeconds.value = 0;
  form.elements.durationMinutes.value = "";
  form.elements.deleteMessageDays.value = "";
  form.elements.amount.value = "";
  form.elements.newName.value = "";
  form.elements.reason.value = "";
  form.elements.permissionName.value = "";
  form.elements.pingType.value = "none";
  document.querySelector("#embed-fields").innerHTML = "";
  document.querySelector("#sequence-fields").innerHTML = "";
  form.querySelector(".cancel-edit").style.display = "none";
  clearErrors(form);
  updateCommandConflicts();
  updateCustomActionVisibility();
  markFormClean(form);
}

function resetPanelForm() {
  const form = document.querySelector("#panel-form");
  form.reset();
  form.elements.id.value = "";
  form.elements.active.checked = true;
  form.elements.title.value = "Support Tickets";
  form.elements.description.value = "Choose a ticket type below to contact the team.";
  form.elements.color.value = "#5865f2";
  form.elements.colorText.value = "#5865F2";
  form.elements.dropdownPlaceholder.value = "Choose a ticket type";
  form.querySelector(".cancel-edit").style.display = "none";
  clearErrors(form);
  populateLibrarySelects();
  updatePanelVisibility();
  markFormClean(form);
}

function resetTicketForm() {
  const form = document.querySelector("#ticket-form");
  clearFormStatus(form);
  form.reset();
  form.elements.id.value = "";
  form.elements.active.checked = true;
  form.elements.welcomeMessage.value = "Thanks for contacting us. A staff member will be with you shortly.";
  form.elements.color.value = "#5865f2";
  form.elements.maxOpenTickets.value = 1;
  form.elements.autoCloseHours.value = 0;
  form.elements.namingFormat.value = "ticket-{username}";
  form.elements.claimButtonEnabled.checked = true;
  form.elements.closeButtonEnabled.checked = true;
  form.elements.requestCloseEnabled.checked = false;
  form.elements.closeRequestDelaySeconds.value = 0;
  setTicketEmoji("", false);
  document.querySelector("#ticket-emoji-menu").classList.add("hidden");
  document.querySelector("#ticket-emoji-search").value = "";
  renderTicketEmojiPicker();
  form.querySelector(".cancel-edit").style.display = "none";
  clearErrors(form);
  updateTicketPreview();
  markFormClean(form);
}

function resetAnnouncementForm() {
  const form = document.querySelector("#announcement-form");
  form.reset();
  form.elements.id.value = "";
  form.elements.outputMode.value = "embed";
  form.elements.color.value = "#5865f2";
  form.querySelector(".cancel-edit").style.display = "none";
  updateAnnouncementPreview();
  markFormClean(form);
}

function resetRolePanelForm() {
  const form = document.querySelector("#role-panel-form");
  form.reset();
  form.elements.id.value = "";
  form.elements.active.checked = true;
  form.elements.layout.value = "buttons";
  form.elements.maxSelectedPerCategory.value = 0;
  form.elements.removeRoleOnSelect.checked = false;
  form.elements.requiredRoleId.value = "";
  form.elements.logChannelId.value = "";
  form.elements.title.value = "Choose your roles";
  form.elements.color.value = "#5865f2";
  form.elements.colorText.value = "#5865F2";
  form.querySelector(".cancel-edit").style.display = "none";
  clearErrors(form);
  renderRolePanelOptions();
  updateRolePanelPreview();
  markFormClean(form);
}

function resetStickyForm() {
  const form = document.querySelector("#sticky-form");
  form.reset();
  form.elements.id.value = "";
  form.elements.enabled.checked = true;
  form.elements.minIntervalSeconds.value = 30;
  form.querySelector(".cancel-edit").style.display = "none";
  clearErrors(form);
  updateStickyPreview();
  markFormClean(form);
}

function resetScheduledForm() {
  const form = document.querySelector("#scheduled-form");
  form.reset();
  form.elements.id.value = "";
  form.elements.enabled.checked = true;
  form.elements.scheduleType.value = "once";
  const soon = new Date(Date.now() + 60 * 60_000);
  soon.setMinutes(soon.getMinutes() - soon.getTimezoneOffset());
  form.elements.nextRunAt.value = soon.toISOString().slice(0, 16);
  form.querySelector(".cancel-edit").style.display = "none";
  clearErrors(form);
  markFormClean(form);
}

document.querySelectorAll("[data-page]").forEach((button) => button.addEventListener("click", () => {
  requestNavigation({
    type: "page",
    page: button.dataset.page,
    ticketView: button.dataset.ticketView,
    securityView: button.dataset.securityView,
    automationView: button.dataset.automationView
  }, `Open ${button.textContent.trim()}`);
}));
document.querySelectorAll("[data-nav-toggle]").forEach((button) => button.addEventListener("click", () => {
  const group = button.closest(".nav-group");
  group.classList.toggle("open");
}));
document.querySelectorAll(".jump-button").forEach((button) => button.addEventListener("click", () => {
  requestNavigation({ type: "page", page: button.dataset.jump }, `Open ${pageMeta[button.dataset.jump]?.[0] || "that page"}`);
}));
document.querySelectorAll("[data-doc-topic]").forEach((button) => button.addEventListener("click", async () => {
  requestNavigation(
    { type: "page", page: "docs", docTopic: button.dataset.docTopic },
    "Open documentation"
  );
}));
document.querySelector("#logout").addEventListener("click", () => {
  const run = async () => {
    await api("/logout", { method: "POST" });
    state.suppressBeforeUnload = true;
    window.location.replace("/login");
  };
  if (state.dirtyForms.size) {
    state.pendingNavigation = {
      target: { type: "logout", run },
      label: "Log out"
    };
    updateUnsavedBar();
  } else {
    run().catch((error) => toast(error.message, true));
  }
});
document.querySelector("#clear-activity").addEventListener("click", () => {
  state.recentActivity = [];
  sessionStorage.removeItem("rapidbot.activity");
  renderActivity();
});

document.querySelector("#dashboard-search").addEventListener("input", (event) => {
  renderDashboardSearch(event.target.value);
});
document.querySelector("#dashboard-search").addEventListener("keydown", (event) => {
  if (event.key === "Escape") {
    event.currentTarget.value = "";
    renderDashboardSearch("");
    return;
  }
  if (["ArrowDown", "ArrowUp"].includes(event.key)) {
    event.preventDefault();
    setSearchActiveIndex(nextSearchIndex(
      state.searchActiveIndex,
      state.searchResults.length,
      event.key
    ));
    return;
  }
  if (event.key === "Enter" && state.searchResults?.length) {
    event.preventDefault();
    navigateSearchItem(state.searchResults[state.searchActiveIndex] || state.searchResults[0]);
  }
});
document.querySelector("#dashboard-search-results").addEventListener("click", (event) => {
  const button = event.target.closest("[data-search-index]");
  if (button) navigateSearchItem(state.searchResults?.[Number(button.dataset.searchIndex)]);
});
document.querySelector("#dashboard-search-results").addEventListener("pointermove", (event) => {
  const button = event.target.closest("[data-search-index]");
  if (button) setSearchActiveIndex(Number(button.dataset.searchIndex));
});
document.addEventListener("keydown", (event) => {
  if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
    event.preventDefault();
    document.querySelector("#dashboard-search").focus();
  }
});
document.addEventListener("click", (event) => {
  if (!event.target.closest(".dashboard-search")) renderDashboardSearch("");
});

document.addEventListener("submit", (event) => {
  if (event.target instanceof HTMLFormElement && event.target.id !== "login-form") {
    state.submittingForm = event.target;
  }
}, true);
document.addEventListener("input", (event) => {
  const form = event.target.closest?.("form");
  if (form) {
    syncFeatureToggles(form);
    updateFormDirtyState(form);
  }
}, true);
document.addEventListener("change", (event) => {
  const form = event.target.closest?.("form");
  if (form) {
    syncFeatureToggles(form);
    updateFormDirtyState(form);
  }
}, true);

document.querySelector("#save-changes").addEventListener("click", () => {
  const dirtyForms = [...state.dirtyForms];
  const form = dirtyForms.find((candidate) => candidate.closest(".page.active"))
    || dirtyForms[0];
  if (!form) return resumePendingNavigation();
  form.requestSubmit();
});
document.querySelector("#discard-changes").addEventListener("click", () => {
  const pending = state.pendingNavigation;
  const target = pending?.target || currentNavigationTarget();
  state.dirtyForms.clear();
  state.pendingNavigation = null;
  updateUnsavedBar();
  if (target.type === "server" || target.type === "logout") {
    performNavigation(target).catch((error) => toast(error.message, true));
    return;
  }
  sessionStorage.setItem("odyssey.pendingNavigation", JSON.stringify(target));
  state.suppressBeforeUnload = true;
  window.location.reload();
});
window.addEventListener("beforeunload", (event) => {
  if (!state.suppressBeforeUnload && state.dirtyForms.size) {
    event.preventDefault();
    event.returnValue = "";
  }
});

document.querySelector("#custom-form").addEventListener("input", updateCustomPreview);
document.querySelector("#custom-form").addEventListener("change", updateCommandConflicts);
document.querySelector("#custom-form").addEventListener("focusin", (event) => {
  if (!isVariableInput(event.target) || !event.target.matches("[data-variable-input]")) return;
  activeVariableField = event.target;
  document.querySelector("#variable-target-hint").textContent = `Inserts into: ${variableInputLabel(event.target)}`;
});
document.querySelector("#command-variable-chips").addEventListener("click", (event) => {
  const chip = event.target.closest("[data-variable]");
  if (chip) insertCommandVariable(chip.dataset.variable);
});
document.querySelector("#custom-form").elements.actionType.addEventListener("change", updateCustomActionVisibility);
document.querySelector("#add-embed-field").addEventListener("click", () => addEmbedField());
document.querySelector("#custom-form").elements.name.addEventListener("blur", (event) => {
  const normalized = normalizeCommandName(event.target.value);
  if (normalized && normalized !== event.target.value) {
    event.target.value = normalized;
    toast(`Command name normalized to "${normalized}".`);
  }
  const error = document.querySelector('[data-error-for="name"]');
  error.textContent = normalized ? "" : "Enter at least one lowercase letter or number.";
  event.target.classList.toggle("invalid", !normalized);
});

function buildActionPayload(values, embed, form) {
  const actionType = values.actionType;
  const allowedRoleIds = selectedValues(form.elements.allowedRoleIds);
  const blockedRoleIds = selectedValues(form.elements.blockedRoleIds);
  const allowedChannelIds = selectedValues(form.elements.allowedChannelIds);
  const blockedChannelIds = selectedValues(form.elements.blockedChannelIds);
  const roleIntersection = allowedRoleIds.filter((id) => blockedRoleIds.includes(id));
  if (roleIntersection.length > 0) {
    toast("A role cannot be both allowed and blocked.", true);
    return null;
  }
  const channelIntersection = allowedChannelIds.filter((id) => blockedChannelIds.includes(id));
  if (channelIntersection.length > 0) {
    toast("A channel cannot be both allowed and blocked.", true);
    return null;
  }
  if (!updateCommandConflicts()) return null;
  const payload = {
    name: values.name,
    description: values.description,
    enabled: form.elements.enabled.checked,
    actionType,
    accessMode: values.accessMode,
    allowedRoleIds,
    blockedRoleIds,
    allowedChannelIds,
    blockedChannelIds,
    cooldownType: values.cooldownType,
    cooldownSeconds: Number(values.cooldownSeconds),
    replyVisibility: values.replyVisibility,
    deleteUsage: form.elements.deleteUsage.checked,
    actionConfig: {
      content: actionType === "require_permission"
        ? values.permissionName
        : actionGroups.message.includes(actionType) ? values.content : embed.content,
      targetChannelId: ["send_channel", "send_announcement", "log_to_mod"].includes(actionType)
        ? (actionType === "send_announcement" ? (values.announcementChannelId || null) : (values.targetChannelId || null))
        : null,
      roleId: values.roleId || null,
      roleIds: selectedValues(form.elements.roleIds),
      ticketPanelId: actionGroups.panel.includes(actionType) ? (values.ticketPanelId ? Number(values.ticketPanelId) : null) : null,
      announcementTemplateId: actionType === "send_announcement" ? (values.announcementTemplateId ? Number(values.announcementTemplateId) : null) : null,
      embed,
      targetUserId: values.targetUserId || null,
      durationMinutes: values.durationMinutes ? Number(values.durationMinutes) : null,
      deleteMessageDays: values.deleteMessageDays ? Number(values.deleteMessageDays) : null,
      amount: values.amount ? Number(values.amount) : null,
      reason: values.reason || "",
      logChannelId: actionType === "log_to_mod" ? (values.targetChannelId || null) : null,
      newName: values.newName || "",
      newCategoryId: values.newCategoryId || null,
      pingType: values.pingType || "none",
      actionSequence: actionType === "action_sequence" ? collectSequence(form) : []
    }
  };
  return payload;
}

function collectSequence(form) {
  const items = [];
  document.querySelectorAll("#sequence-fields .sequence-item").forEach((row) => {
    const actionType = row.querySelector("[data-seq-action]").value;
    const content = row.querySelector("[data-seq-content]").value;
    const targetChannelId = row.querySelector("[data-seq-channel]").value || null;
    const roleId = row.querySelector("[data-seq-role]").value || null;
    const targetUserId = row.querySelector("[data-seq-user]").value || null;
    const durationMinutes = row.querySelector("[data-seq-duration]").value || null;
    const deleteMessageDays = row.querySelector("[data-seq-delete]").value || null;
    const amount = row.querySelector("[data-seq-amount]").value || null;
    const reason = row.querySelector("[data-seq-reason]").value || "";
    const newName = row.querySelector("[data-seq-newname]").value || "";
    const newCategoryId = row.querySelector("[data-seq-category]").value || null;
    const pingType = row.querySelector("[data-seq-ping]").value || "none";
    const embedColor = row.querySelector("[data-seq-color]").value || "#5865F2";
    const embedTitle = row.querySelector("[data-seq-title]").value || "";
    const embedDescription = row.querySelector("[data-seq-description]").value || "";
    items.push({
      actionType,
      content,
      targetChannelId,
      roleId,
      roleIds: [],
      embed: {
        content: "", title: embedTitle, titleUrl: "", description: embedDescription,
        color: embedColor, authorName: "", authorIconUrl: "", authorUrl: "",
        imageUrl: "", thumbnailUrl: "", footerText: "", footerIconUrl: "", timestamp: false, fields: []
      },
      targetUserId,
      durationMinutes: durationMinutes ? Number(durationMinutes) : null,
      deleteMessageDays: deleteMessageDays ? Number(deleteMessageDays) : null,
      amount: amount ? Number(amount) : null,
      reason,
      logChannelId: null,
      newName,
      newCategoryId,
      pingType
    });
  });
  return items;
}

document.querySelector("#custom-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  const form = event.currentTarget;
  clearErrors(form);
  form.elements.name.value = normalizeCommandName(form.elements.name.value);
  if (!form.elements.name.value) {
    showErrors(form, { name: "Use lowercase letters, numbers, hyphens, and underscores only." });
    toast("Fix the command name before saving.", true);
    return;
  }
  const values = formObject(form);
  const embed = customEmbedFromForm(form);
  const payload = buildActionPayload(values, embed, form);
  if (!payload) return;
  const isUpdate = Boolean(values.id);
  await withBusy(form.querySelector('[type="submit"]'), isUpdate ? "Updating command..." : "Creating command...", async () => {
    try {
      await api(`/custom-commands${isUpdate ? `/${values.id}` : ""}`, { method: isUpdate ? "PUT" : "POST", body: JSON.stringify(payload) });
      resetCustomForm();
      await Promise.all([loadCustomCommands(), loadOverview()]);
      success(`Successfully ${isUpdate ? "updated" : "created"} command: ${payload.name}`);
    } catch (error) {
      showErrors(form, error.fields);
      toast(`Could not save command: ${error.message}`, true);
    }
  });
});

document.querySelector("#add-sequence-item").addEventListener("click", () => {
  const container = document.querySelector("#sequence-fields");
  const row = document.createElement("div");
  row.className = "sequence-item";
  row.innerHTML = `
    <div class="form-grid seq-row">
      <label class="field">Action<select data-seq-action>
        ${Object.entries(actionLabels).map(([k, v]) => `<option value="${k}">${v}</option>`).join("")}
      </select></label>
      <label class="field">Content<textarea data-seq-content data-variable-input rows="2" maxlength="2000"></textarea></label>
      <label class="field">Target channel<select data-seq-channel data-channel-select="text"><option value="">Not configured</option></select></label>
      <label class="field">Optional ping<select data-seq-ping><option value="none">No ping</option><option value="everyone">@everyone</option><option value="here">@here</option></select></label>
      <label class="field">Role<select data-seq-role data-role-select><option value="">Not configured</option></select></label>
      <label class="field">Target user<input data-seq-user placeholder="User ID"></label>
      <label class="field">Duration (min)<input data-seq-duration type="number" min="1" max="40320"></label>
      <label class="field">Delete days<input data-seq-delete type="number" min="0" max="7"></label>
      <label class="field">Amount<input data-seq-amount type="number" min="1" max="100"></label>
      <label class="field">Reason<textarea data-seq-reason data-variable-input rows="1" maxlength="1000"></textarea></label>
      <label class="field">New name<input data-seq-newname data-variable-input maxlength="100"></label>
      <label class="field">Category<select data-seq-category data-channel-select="category"><option value="">Not configured</option></select></label>
      <label class="field">Embed color<input data-seq-color type="color" value="#5865f2"></label>
      <label class="field">Embed title<input data-seq-title data-variable-input maxlength="256"></label>
      <label class="field span-2">Embed description<textarea data-seq-description data-variable-input rows="2" maxlength="4096"></textarea></label>
    </div>
    <button type="button" class="remove-seq secondary-button compact">Remove action</button>
  `;
  row.querySelector(".remove-seq").addEventListener("click", () => {
    row.remove();
    updateFormDirtyState(document.querySelector("#custom-form"));
  });
  populateResourceSelects();
  container.append(row);
  updateFormDirtyState(document.querySelector("#custom-form"));
});

document.querySelector("#custom-send-test").addEventListener("click", async () => {
  const form = document.querySelector("#custom-form");
  const channelId = document.querySelector("#custom-test-channel").value;
  if (!channelId) return toast("Choose a Discord channel for the test.", true);
  const action = form.elements.actionType.value;
  if (!["reply_message", "reply_embed", "send_channel"].includes(action)) return toast("This action is tested by running /custom in Discord.", true);
  const embed = customEmbedFromForm(form);
  const button = document.querySelector("#custom-send-test");
  await withBusy(button, "Sending test...", async () => {
    try {
      await api("/test/embed", {
        method: "POST",
        body: JSON.stringify({
          channelId,
          content: action === "reply_message" ? form.elements.content.value : embed.content,
          embed
        })
      });
      success("Successfully sent command preview.");
    } catch (error) { toast(`Could not send command preview: ${error.message}`, true); }
  });
});

document.querySelector("#panel-form").addEventListener("input", updatePanelPreview);
document.querySelector("#panel-form").elements.panelKind.addEventListener("change", updatePanelVisibility);
document.querySelector("#panel-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  const form = event.currentTarget;
  clearErrors(form);
  const values = panelDraft();
  const payload = {
    name: values.name,
    targetChannelId: values.targetChannelId || null,
    title: values.title,
    description: values.description,
    color: values.color,
    imageUrl: values.imageUrl,
    thumbnailUrl: values.thumbnailUrl,
    footerText: values.footerText,
    footerIconUrl: values.footerIconUrl,
    displayMode: values.displayMode,
    dropdownPlaceholder: values.dropdownPlaceholder,
    active: values.active,
    panelKind: values.panelKind,
    ticketTypeIds: values.ticketTypeIds,
    childPanelIds: values.childPanelIds
  };
  const isUpdate = Boolean(values.id);
  await withBusy(form.querySelector('[type="submit"]'), isUpdate ? "Updating panel..." : "Creating panel...", async () => {
    try {
      await api(`/ticket-panels${isUpdate ? `/${values.id}` : ""}`, { method: isUpdate ? "PUT" : "POST", body: JSON.stringify(payload) });
      resetPanelForm();
      await Promise.all([loadTickets(), loadOverview()]);
      success(`Successfully ${isUpdate ? "updated" : "created"} ticket panel: ${payload.name}`);
    } catch (error) {
      showErrors(form, error.fields);
      toast(`Could not save ticket panel: ${error.message}`, true);
    }
  });
});

document.querySelector("#panel-send-test").addEventListener("click", async () => {
  const panelId = Number(document.querySelector("#panel-form").elements.id.value);
  const channelId = document.querySelector("#panel-test-channel").value || null;
  if (!panelId) return toast("Save the panel before sending a test.", true);
  const button = document.querySelector("#panel-send-test");
  await withBusy(button, "Sending panel...", async () => {
    try {
      await api("/test/ticket-panel", { method: "POST", body: JSON.stringify({ panelId, channelId }) });
      success("Successfully posted the saved ticket panel.");
    } catch (error) { toast(`Could not post ticket panel: ${error.message}`, true); }
  });
});

document.querySelector("#ticket-emoji-toggle").addEventListener("click", () => {
  const menu = document.querySelector("#ticket-emoji-menu");
  menu.classList.toggle("hidden");
  if (!menu.classList.contains("hidden")) {
    renderTicketEmojiPicker(document.querySelector("#ticket-emoji-search").value);
    document.querySelector("#ticket-emoji-search").focus();
  }
});
document.querySelector("#ticket-emoji-search").addEventListener("input", (event) => {
  renderTicketEmojiPicker(event.target.value);
});
document.querySelector("#ticket-emoji-grid").addEventListener("click", (event) => {
  const option = event.target.closest("[data-emoji]");
  if (!option) return;
  setTicketEmoji(option.dataset.emoji);
  document.querySelector("#ticket-emoji-menu").classList.add("hidden");
});
document.querySelector("#ticket-emoji-clear").addEventListener("click", () => {
  setTicketEmoji("");
  document.querySelector("#ticket-emoji-menu").classList.add("hidden");
});

document.querySelector("#ticket-form").addEventListener("input", (event) => {
  updateTicketPreview();
  if (!event.currentTarget.querySelector('[type="submit"]').disabled) {
    clearFormStatus(event.currentTarget);
  }
});
document.querySelector("#ticket-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  const form = event.currentTarget;
  clearErrors(form);
  setFormStatus(form, "Saving ticket type and validating its Discord category...", "saving");
  const values = formObject(form);
  const payload = {
    label: values.label,
    description: values.description,
    emoji: values.emoji,
    staffRoleIds: selectedValues(form.elements.staffRoleIds),
    pingRoleIds: selectedValues(form.elements.pingRoleIds),
    allowedRoleIds: selectedValues(form.elements.allowedRoleIds),
    blockedRoleIds: selectedValues(form.elements.blockedRoleIds),
    categoryId: values.categoryId || null,
    welcomeMessage: values.welcomeMessage,
    color: values.color,
    imageUrl: values.imageUrl,
    thumbnailUrl: values.thumbnailUrl,
    footerText: values.footerText,
    footerIconUrl: values.footerIconUrl,
    transcriptChannelId: values.transcriptChannelId || null,
    maxOpenTickets: Number(values.maxOpenTickets),
    namingFormat: values.namingFormat,
    claimButtonEnabled: form.elements.claimButtonEnabled.checked,
    closeButtonEnabled: form.elements.closeButtonEnabled.checked,
    closeReasonRequired: form.elements.closeReasonRequired.checked,
    requestCloseEnabled: form.elements.requestCloseEnabled.checked,
    closeRequestDelaySeconds: Number(values.closeRequestDelaySeconds || 0),
    autoCloseHours: Number(values.autoCloseHours),
    active: form.elements.active.checked,
    sortOrder: Number(values.sortOrder || 0)
  };
  const isUpdate = Boolean(values.id);
  await withBusy(form.querySelector('[type="submit"]'), isUpdate ? "Updating ticket type..." : "Creating ticket type...", async () => {
    try {
      await api(`/ticket-types${isUpdate ? `/${values.id}` : ""}`, { method: isUpdate ? "PUT" : "POST", body: JSON.stringify(payload) });
      resetTicketForm();
      const message = `Successfully ${isUpdate ? "updated" : "created"} ticket type: ${payload.label}`;
      setFormStatus(form, message, "success", 8000);
      toast(message);
      recordActivity(message);
      try {
        await Promise.all([loadTickets(), loadOverview()]);
      } catch (refreshError) {
        const refreshMessage = `Ticket type saved, but the dashboard could not refresh: ${refreshError.message}`;
        setFormStatus(form, refreshMessage, "error", 12000);
        toast(refreshMessage, true);
        recordActivity(refreshMessage, "error");
      }
    } catch (error) {
      showErrors(form, error.fields);
      const message = `Could not save ticket type: ${error.message}`;
      setFormStatus(form, message, "error", 12000);
      toast(message, true);
      recordActivity(message, "error");
    }
  });
});

document.querySelector("#announcement-form").addEventListener("input", updateAnnouncementPreview);
document.querySelector("#announcement-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  const form = event.currentTarget;
  const values = formObject(form);
  const isUpdate = Boolean(values.id);
  await withBusy(form.querySelector('[type="submit"]'), isUpdate ? "Updating template..." : "Creating template...", async () => {
    try {
      await api(`/announcements${isUpdate ? `/${values.id}` : ""}`, {
        method: isUpdate ? "PUT" : "POST",
        body: JSON.stringify({
        name: values.name, outputMode: values.outputMode || "embed",
        title: values.title, body: values.body, color: values.color,
        imageUrl: values.imageUrl, thumbnailUrl: values.thumbnailUrl,
        footer: values.footer, targetChannelId: values.targetChannelId || null,
        pingType: values.pingType || "none"
        })
      });
      resetAnnouncementForm();
      await Promise.all([loadAnnouncements(), loadOverview()]);
      success(`Successfully ${isUpdate ? "updated" : "created"} announcement template: ${values.name}`);
    } catch (error) {
      toast(`Could not save announcement template: ${error.message}`, true);
    }
  });
});

document.querySelector("#add-social-link").addEventListener("click", () => {
  if (socialEntries("social-links").length >= 15) return toast("Social promotions support up to 15 official links.", true);
  addSocialEntry("social-links");
  updateSocialsPreview();
});

document.querySelector("#add-social-member").addEventListener("click", () => {
  if (socialEntries("social-members").length >= 15) return toast("Social promotions support up to 15 member links.", true);
  addSocialEntry("social-members");
  updateSocialsPreview();
});

document.querySelector("#socials-form").addEventListener("input", updateSocialsPreview);
document.querySelector("#socials-form").addEventListener("change", updateSocialsPreview);
document.querySelector("#socials-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  const form = event.currentTarget;
  const values = formObject(form);
  clearErrors(form);
  await withBusy(form.querySelector('[type="submit"]'), "Saving Socials...", async () => {
    try {
      await api("/socials", {
        method: "PUT",
        body: JSON.stringify({
          outputMode: values.outputMode,
          title: values.title,
          description: values.description,
          color: values.color,
          thumbnailUrl: values.thumbnailUrl,
          imageUrl: values.imageUrl,
          targetChannelId: values.targetChannelId || null,
          links: socialEntries("social-links"),
          memberEntries: socialEntries("social-members")
        })
      });
      await loadSocials();
      success("Successfully saved Social Promotion settings.");
    } catch (error) {
      showErrors(form, error.fields);
      toast(`Could not save Social Promotion settings: ${error.message}`, true);
    }
  });
});

document.querySelector("#send-socials").addEventListener("click", async () => {
  const button = document.querySelector("#send-socials");
  await withBusy(button, "Sending Socials...", async () => {
    try {
      await api("/socials/send", { method: "POST", body: "{}" });
      success("Successfully sent the saved Social Promotion message.");
    } catch (error) {
      showErrors(document.querySelector("#socials-form"), error.fields);
      toast(`Could not send Social Promotion: ${error.message}`, true);
    }
  });
});

document.querySelector("#giveaway-form").addEventListener("input", updateGiveawayPreview);
document.querySelector("#giveaway-form").addEventListener("change", updateGiveawayPreview);
document.querySelector("#giveaway-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  const form = event.currentTarget;
  const values = formObject(form);
  clearErrors(form);
  await withBusy(form.querySelector('[type="submit"]'), "Saving giveaway...", async () => {
    try {
      await api("/giveaways", {
        method: "POST",
        body: JSON.stringify({
          channelId: values.channelId,
          prize: values.prize,
          description: values.description || "",
          winnersCount: Number(values.winnersCount || 1),
          endsAt: new Date(values.endsAt).toISOString(),
          requiredRoleId: values.requiredRoleId || null,
          boosterBonusEntries: Number(values.boosterBonusEntries || 0),
          bonusRoleId: values.bonusRoleId || null,
          bonusRoleEntries: Number(values.bonusRoleEntries || 0),
          status: "draft"
        })
      });
      form.reset();
      await loadGiveaways();
      success("Giveaway draft saved. Start it from the giveaway library when ready.");
    } catch (error) {
      showErrors(form, error.fields);
      toast(`Could not save giveaway: ${error.message}`, true);
    }
  });
});

document.querySelector("#giveaway-list").addEventListener("click", async (event) => {
  const button = event.target.closest("[data-giveaway-action]");
  if (!button) return;
  const id = button.dataset.id;
  const action = button.dataset.giveawayAction;
  if (action === "cancel" && !window.confirm("Cancel this giveaway?")) return;
  await withBusy(button, `${action}...`, async () => {
    try {
      await api(`/giveaways/${id}/${action}`, { method: "POST", body: "{}" });
      await loadGiveaways();
      success(`Giveaway ${action} complete.`);
    } catch (error) {
      toast(`Could not ${action} giveaway: ${error.message}`, true);
    }
  });
});

document.querySelector("#settings-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  const form = event.currentTarget;
  const values = formObject(form);
  await withBusy(form.querySelector('[type="submit"]'), "Saving settings...", async () => {
    try {
      await api("/settings", { method: "PUT", body: JSON.stringify({
      modLogChannelId: values.modLogChannelId || null,
      announcementChannelId: values.announcementChannelId || null,
      ticketCategoryId: values.ticketCategoryId || null,
      transcriptChannelId: values.transcriptChannelId || null,
      staffRoleIds: selectedValues(form.elements.staffRoleIds),
      mutedRoleId: values.mutedRoleId || null,
      adminRoleIds: selectedValues(form.elements.adminRoleIds)
      }) });
      success("Successfully saved server and modlog settings.");
    } catch (error) { toast(`Could not save server settings: ${error.message}`, true); }
  });
});

document.querySelector("#logging-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  const form = event.currentTarget;
  const values = formObject(form);
  clearErrors(form);
  setFormStatus(form, "Saving the logging channel and event categories...", "saving");
  await withBusy(form.querySelector('[type="submit"]'), "Saving logging...", async () => {
    try {
      state.logging = await api("/logging", {
        method: "PUT",
        body: JSON.stringify({
          enabled: form.elements.enabled.checked,
          channelId: values.channelId || null,
          members: form.elements.members.checked,
          messages: form.elements.messages.checked,
          voice: form.elements.voice.checked,
          channels: form.elements.channels.checked,
          roles: form.elements.roles.checked,
          server: form.elements.server.checked,
          invites: form.elements.invites.checked,
          threads: form.elements.threads.checked,
          moderation: form.elements.moderation.checked,
          dashboard: form.elements.dashboard.checked
        })
      });
      setFormStatus(form, "Server logging settings saved. The bot may take up to 10 seconds to refresh its event cache.", "success", 9000);
      success("Successfully saved server logging settings.");
    } catch (error) {
      showErrors(form, error.fields);
      setFormStatus(form, error.message, "error", 12000);
      toast(`Could not save server logging settings: ${error.message}`, true);
    }
  });
});

document.querySelector("#branding-form").addEventListener("input", updateBrandingPreview);
document.querySelector("#branding-form").addEventListener("change", updateBrandingPreview);
document.querySelector("#branding-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  const form = event.currentTarget;
  const values = formObject(form);
  clearErrors(form);
  setFormStatus(form, "Saving appearance and updating the bot nickname in Discord...", "saving");
  await withBusy(form.querySelector('[type="submit"]'), "Saving appearance...", async () => {
    try {
      const result = await api("/branding", {
        method: "PUT",
        body: JSON.stringify({
          serverName: values.serverName,
          accentColor: values.accentColor,
          ticketButtonStyle: values.ticketButtonStyle,
          footerText: values.footerText,
          ticketPanelTitle: values.ticketPanelTitle,
          ticketPanelDescription: values.ticketPanelDescription,
          ticketPanelColor: values.ticketPanelColor,
          ticketPanelImageUrl: values.ticketPanelImageUrl,
          announcementDefaultColor: values.announcementDefaultColor,
          announcementDefaultImageUrl: values.announcementDefaultImageUrl,
          announcementDefaultThumbnailUrl: values.announcementDefaultThumbnailUrl,
          embedIconUrl: values.embedIconUrl
        })
      });
      state.branding = result.branding;
      await loadBranding();
      if (result.nickname.status === "failed") {
        markFormClean(form);
        state.submittingForm = null;
        setFormStatus(form, result.nickname.message, "error", 12000);
        toast(result.nickname.message, true);
        recordActivity(result.nickname.message, "error");
        resumePendingNavigation();
      } else {
        setFormStatus(form, result.nickname.message, "success", 8000);
        success("Successfully saved appearance and updated the Discord bot nickname.");
      }
    } catch (error) {
      showErrors(form, error.fields);
      setFormStatus(form, `Could not save appearance: ${error.message}`, "error", 12000);
      toast(`Could not save appearance: ${error.message}`, true);
    }
  });
});
document.querySelector("#branding-reset").addEventListener("click", async () => {
  if (!window.confirm("Reset this server's appearance settings to Odyssey Bot defaults?")) return;
  const button = document.querySelector("#branding-reset");
  const form = document.querySelector("#branding-form");
  await withBusy(button, "Resetting...", async () => {
    try {
      const result = await api("/branding", { method: "DELETE" });
      state.branding = result.branding;
      await loadBranding();
      const message = result.nickname.status === "updated"
        ? "Appearance and the Discord bot nickname were reset to defaults."
        : result.nickname.message;
      setFormStatus(form, message, result.nickname.status === "updated" ? "success" : "error", 10000);
      if (result.nickname.status === "updated") success(message);
      else {
        toast(message, true);
        recordActivity(message, "error");
      }
    } catch (error) {
      toast(`Could not reset appearance: ${error.message}`, true);
    }
  });
});

document.querySelector("#welcome-form").addEventListener("input", updateWelcomePreview);
document.querySelector("#welcome-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  const form = event.currentTarget;
  const values = formObject(form);
  await withBusy(form.querySelector('[type="submit"]'), "Saving welcome settings...", async () => {
    try {
      await api("/welcome", { method: "PUT", body: JSON.stringify({
      enabled: form.elements.enabled.checked,
      channelId: values.channelId || null,
      dmEnabled: form.elements.dmEnabled.checked,
      dmContent: values.dmContent || "",
      dmEmbedEnabled: form.elements.dmEmbedEnabled.checked,
      content: values.content || "",
      embedTitle: values.embedTitle || "",
      embedDescription: values.embedDescription || "",
      embedColor: values.embedColor || "#5865F2",
      embedImageUrl: values.embedImageUrl || "",
      embedThumbnailUrl: values.embedThumbnailUrl || "",
      embedFooterText: values.embedFooterText || "",
      autoRolesEnabled: form.elements.autoRolesEnabled.checked,
      autoRoleIds: selectedValues(form.elements.autoRoleIds),
      goodbyeEnabled: form.elements.goodbyeEnabled.checked,
      goodbyeChannelId: values.goodbyeChannelId || null,
      goodbyeContent: values.goodbyeContent || "",
      goodbyeEmbedEnabled: form.elements.goodbyeEmbedEnabled.checked,
      boostEnabled: form.elements.boostEnabled.checked,
      boostChannelId: values.boostChannelId || null,
      boostMessage: values.boostMessage || ""
      }) });
      await loadWelcome();
      success("Successfully saved welcome and goodbye settings.");
    } catch (error) { toast(`Could not save member message settings: ${error.message}`, true); }
  });
});

document.querySelector("#welcome-test").addEventListener("click", async () => {
  const channelId = document.querySelector("#welcome-test-channel").value;
  if (!channelId) return toast("Choose a channel to test the welcome message.", true);
  const form = document.querySelector("#welcome-form");
  const values = formObject(form);
  const embed = renderDiscordPreview(document.querySelector("#welcome-preview"), {
    content: replacePreviewVariables(values.content),
    embed: {
      title: replacePreviewVariables(values.embedTitle),
      description: replacePreviewVariables(values.embedDescription),
      color: values.embedColor || "#5865F2",
      imageUrl: values.embedImageUrl,
      thumbnailUrl: values.embedThumbnailUrl,
      footerText: replacePreviewVariables(values.embedFooterText),
      fields: []
    }
  });
  const button = document.querySelector("#welcome-test");
  await withBusy(button, "Sending test...", async () => {
    try {
      await api("/test/embed", {
      method: "POST",
      body: JSON.stringify({
        channelId,
        content: replacePreviewVariables(values.content),
        embed: {
          content: "", title: replacePreviewVariables(values.embedTitle),
          description: replacePreviewVariables(values.embedDescription),
          color: values.embedColor || "#5865F2", imageUrl: values.embedImageUrl,
          thumbnailUrl: values.embedThumbnailUrl, footerText: replacePreviewVariables(values.embedFooterText),
          footerIconUrl: "", timestamp: false, fields: [], authorName: "", authorIconUrl: "", authorUrl: "", titleUrl: ""
        }
      })
      });
      success("Successfully sent welcome message preview.");
    } catch (error) { toast(`Could not send welcome preview: ${error.message}`, true); }
  });
});

document.querySelector("#goodbye-test").addEventListener("click", async () => {
  const channelId = document.querySelector("#goodbye-test-channel").value;
  if (!channelId) return toast("Choose a channel to test the goodbye message.", true);
  const form = document.querySelector("#welcome-form");
  const values = formObject(form);
  const useEmbed = form.elements.goodbyeEmbedEnabled.checked;
  const button = document.querySelector("#goodbye-test");
  await withBusy(button, "Sending test...", async () => {
    try {
      await api("/test/embed", {
        method: "POST",
        body: JSON.stringify({
          channelId,
          content: replacePreviewVariables(values.goodbyeContent || "{user_name} has left {server_name}."),
          embed: useEmbed ? {
            content: "",
            title: replacePreviewVariables(values.embedTitle),
            description: replacePreviewVariables(values.embedDescription),
            color: values.embedColor || "#5865F2",
            imageUrl: values.embedImageUrl,
            thumbnailUrl: values.embedThumbnailUrl,
            footerText: replacePreviewVariables(values.embedFooterText),
            footerIconUrl: "",
            timestamp: false,
            fields: [],
            authorName: "",
            authorIconUrl: "",
            authorUrl: "",
            titleUrl: ""
          } : {
            content: "",
            title: "",
            description: "",
            color: "#5865F2",
            imageUrl: "",
            thumbnailUrl: "",
            footerText: "",
            footerIconUrl: "",
            timestamp: false,
            fields: [],
            authorName: "",
            authorIconUrl: "",
            authorUrl: "",
            titleUrl: ""
          }
        })
      });
      success("Successfully sent goodbye message preview.");
    } catch (error) {
      toast(`Could not send goodbye preview: ${error.message}`, true);
    }
  });
});

document.querySelector("#boost-test").addEventListener("click", async () => {
  const channelId = document.querySelector("#boost-test-channel").value;
  if (!channelId) return toast("Choose a channel to test the boost message.", true);
  const form = document.querySelector("#welcome-form");
  const values = formObject(form);
  const content = replacePreviewVariables(
    values.boostMessage
    || "Thank you {user} for boosting {server}! We now have {boostCount} boosts and are at {tier}."
  );
  const button = document.querySelector("#boost-test");
  await withBusy(button, "Sending test...", async () => {
    try {
      await api("/test/embed", {
        method: "POST",
        body: JSON.stringify({
          channelId,
          content,
          embed: {
            content: "", title: "", description: "", color: "#5865F2",
            imageUrl: "", thumbnailUrl: "", footerText: "", footerIconUrl: "",
            timestamp: false, fields: [], authorName: "", authorIconUrl: "",
            authorUrl: "", titleUrl: ""
          }
        })
      });
      success("Successfully sent boost message preview.");
    } catch (error) {
      toast(`Could not send boost preview: ${error.message}`, true);
    }
  });
});

document.querySelector("#anti-raid-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  const form = event.currentTarget;
  const values = formObject(form);
  await withBusy(form.querySelector('[type="submit"]'), "Saving Anti Raid...", async () => {
    try {
      await api("/anti-raid", { method: "PUT", body: JSON.stringify({
      enabled: form.elements.enabled.checked,
      joinThreshold: Number(values.joinThreshold),
      timeWindowSeconds: Number(values.timeWindowSeconds),
      action: values.action,
      lockdownDurationSeconds: Number(values.lockdownDurationSeconds),
      minAccountAgeDays: Number(values.minAccountAgeDays),
      blockNoAvatar: form.elements.blockNoAvatar.checked,
      bypassRoleIds: selectedValues(form.elements.bypassRoleIds),
      bypassUserIds: (values.bypassUserIds || "").split(/\s+/).filter(Boolean),
      alertChannelId: values.alertChannelId || null,
      logChannelId: values.logChannelId || null
      }) });
      success("Successfully saved Anti Raid settings.");
    } catch (error) { toast(`Could not save Anti Raid settings: ${error.message}`, true); }
  });
});

document.querySelector("#anti-nuke-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  const form = event.currentTarget;
  const values = formObject(form);
  await withBusy(form.querySelector('[type="submit"]'), "Saving Anti Nuke...", async () => {
    try {
      await api("/anti-nuke", { method: "PUT", body: JSON.stringify({
      enabled: form.elements.enabled.checked,
      channelDeleteThreshold: Number(values.channelDeleteThreshold),
      channelCreateThreshold: Number(values.channelCreateThreshold),
      roleDeleteThreshold: Number(values.roleDeleteThreshold),
      roleCreateThreshold: Number(values.roleCreateThreshold),
      banThreshold: Number(values.banThreshold),
      kickThreshold: Number(values.kickThreshold),
      webhookThreshold: Number(values.webhookThreshold),
      permissionThreshold: Number(values.permissionThreshold),
      botAddThreshold: Number(values.botAddThreshold),
      adminRoleThreshold: Number(values.adminRoleThreshold),
      timeWindowSeconds: Number(values.timeWindowSeconds),
      action: values.action,
      alertChannelId: values.alertChannelId || null,
      logChannelId: values.logChannelId || null
      }) });
      success("Successfully saved Anti Nuke settings.");
    } catch (error) { toast(`Could not save Anti Nuke settings: ${error.message}`, true); }
  });
});

document.querySelector("#anti-role-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  const form = event.currentTarget;
  const values = formObject(form);
  clearErrors(form);
  await withBusy(form.querySelector('[type="submit"]'), "Saving Role Protection...", async () => {
    try {
      await api("/anti-role", { method: "PUT", body: JSON.stringify({
        enabled: form.elements.enabled.checked,
        protectedRoleIds: selectedValues(form.elements.protectedRoleIds),
        trustedUserIds: (values.trustedUserIds || "").split(/\s+/).filter(Boolean),
        trustedRoleIds: selectedValues(form.elements.trustedRoleIds),
        action: values.action,
        massChangeThreshold: Number(values.massChangeThreshold),
        timeWindowSeconds: Number(values.timeWindowSeconds),
        logChannelId: values.logChannelId || null
      }) });
      await loadSecurity();
      success("Successfully saved Role Protection settings.");
    } catch (error) {
      showErrors(form, error.fields);
      toast(`Could not save Role Protection settings: ${error.message}`, true);
    }
  });
});

document.querySelector("#verification-form").addEventListener("input", updateVerificationPreview);
document.querySelector("#verification-form").addEventListener("change", updateVerificationPreview);
document.querySelector("#verification-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  const form = event.currentTarget;
  const values = formObject(form);
  clearErrors(form);
  if (
    form.elements.enabled.checked
    && form.elements.applyPermissionsImmediately.checked
    && !window.confirm("Save these settings and immediately apply channel permission changes to the live Discord server?")
  ) {
    setFormStatus(form, "Save cancelled before live permission changes were applied.", "error", 8000);
    return;
  }
  setFormStatus(form, "Saving verification gate settings and validating Discord references...", "saving");
  await withBusy(form.querySelector('[type="submit"]'), "Saving verification...", async () => {
    try {
      const result = await api("/verification", {
        method: "PUT",
        body: JSON.stringify({
          enabled: form.elements.enabled.checked,
          verifiedRoleId: values.verifiedRoleId || null,
          verificationChannelId: values.verificationChannelId || null,
          verificationChannelName: values.verificationChannelName,
          embedTitle: values.embedTitle,
          embedDescription: values.embedDescription,
          embedColor: values.embedColor,
          buttonText: values.buttonText,
          successMessage: values.successMessage,
          failureMessage: values.failureMessage,
          action: values.action,
          logChannelId: values.logChannelId || null,
          minAccountAgeDays: Number(values.minAccountAgeDays),
          minServerDays: Number(values.minServerDays),
          vpnCheckEnabled: form.elements.vpnCheckEnabled.checked,
          vpnFailClosed: form.elements.vpnFailClosed.checked,
          recordRetentionHours: Number(values.recordRetentionHours),
          publicChannelIds: selectedValues(form.elements.publicChannelIds),
          publicCategoryIds: selectedValues(form.elements.publicCategoryIds),
          hiddenChannelIds: selectedValues(form.elements.hiddenChannelIds),
          hiddenCategoryIds: selectedValues(form.elements.hiddenCategoryIds),
          lockAllChannels: form.elements.lockAllChannels.checked,
          autoCreateChannel: form.elements.autoCreateChannel.checked,
          lockVerificationChannel: form.elements.lockVerificationChannel.checked,
          updateEmbedOnSetup: form.elements.updateEmbedOnSetup.checked,
          applyPermissionsImmediately: form.elements.applyPermissionsImmediately.checked
        })
      });
      if (result.setup) renderVerificationSetupResult(result.setup);
      await loadSecurity();
      const message = result.setup
        ? "Verification settings saved and the live gate was applied."
        : "Verification settings saved. Run a dry preview before applying the live gate.";
      setFormStatus(form, message, "success", 10000);
      success(message);
    } catch (error) {
      showErrors(form, error.fields);
      setFormStatus(form, `Could not save verification settings: ${error.message}`, "error", 14000);
      toast(`Could not save verification settings: ${error.message}`, true);
    }
  });
});

function verificationFormIsSaved() {
  const form = document.querySelector("#verification-form");
  if (!state.dirtyForms.has(form)) return true;
  setFormStatus(form, "Save or discard the verification changes before running setup actions.", "error", 10000);
  form.scrollIntoView({ behavior: "smooth", block: "start" });
  return false;
}

document.querySelector("#create-verification-link").addEventListener("click", async () => {
  const button = document.querySelector("#create-verification-link");
  await withBusy(button, "Creating link...", async () => {
    try {
      const result = await api("/verification/link", { method: "POST", body: "{}" });
      document.querySelector("#verification-link").value = result.url;
      success(`Verification link created. It expires ${new Date(result.expiresAt).toLocaleString()}.`);
    } catch (error) {
      toast(`Could not create verification link: ${error.message}`, true);
    }
  });
});

document.querySelector("#copy-verification-link").addEventListener("click", async () => {
  const value = document.querySelector("#verification-link").value;
  if (!value) return toast("Create a verification link first.", true);
  try {
    await navigator.clipboard.writeText(value);
    success("Verification link copied.");
  } catch {
    toast("The browser could not copy the link. Select the link and copy it manually.", true);
  }
});

document.querySelector("#copy-stable-verification-link").addEventListener("click", async () => {
  const value = document.querySelector("#stable-verification-link").value;
  if (!value) return toast("Set VERIFY_PUBLIC_BASE_URL and enable verification first.", true);
  try {
    await navigator.clipboard.writeText(value);
    success("Stable server verification link copied.");
  } catch {
    toast("The browser could not copy the link. Select it and copy it manually.", true);
  }
});

document.querySelector("#verification-records").addEventListener("click", async (event) => {
  const button = event.target.closest("[data-verification-review]");
  if (!button) return;
  const decision = button.dataset.verificationReview;
  const id = button.dataset.id;
  const note = window.prompt(`Optional staff note for this ${decision}:`, "") || "";
  await withBusy(button, decision === "approve" ? "Approving..." : "Denying...", async () => {
    try {
      const result = await api(`/verification/records/${id}/review`, {
        method: "POST",
        body: JSON.stringify({ decision, note })
      });
      await loadSecurity();
      success(result.warning || `Verification record ${decision === "approve" ? "approved" : "denied"}.`);
    } catch (error) {
      toast(`Could not review verification record: ${error.message}`, true);
    }
  });
});

document.querySelector("#preview-verification-setup").addEventListener("click", async () => {
  if (!verificationFormIsSaved()) return;
  const button = document.querySelector("#preview-verification-setup");
  await withBusy(button, "Checking changes...", async () => {
    try {
      const result = await api("/verification/dry-run", { method: "POST", body: "{}" });
      renderVerificationSetupResult(result, true);
      success("Dry run completed. No Discord permissions were changed.");
    } catch (error) {
      toast(`Could not preview verification setup: ${error.message}`, true);
    }
  });
});

document.querySelector("#apply-verification-setup").addEventListener("click", async () => {
  if (!verificationFormIsSaved()) return;
  if (!window.confirm("Apply the saved verification gate to the live Discord server now? Existing affected overwrites will be backed up first.")) return;
  const button = document.querySelector("#apply-verification-setup");
  await withBusy(button, "Applying setup...", async () => {
    try {
      const result = await api("/verification/setup", { method: "POST", body: "{}" });
      renderVerificationSetupResult(result);
      await loadSecurity();
      success("Verification channel, embed, and permission gate were applied.");
    } catch (error) {
      toast(`Could not apply verification setup: ${error.message}`, true);
    }
  });
});

document.querySelector("#repost-verification-embed").addEventListener("click", async () => {
  if (!verificationFormIsSaved()) return;
  const button = document.querySelector("#repost-verification-embed");
  await withBusy(button, "Updating embed...", async () => {
    try {
      const result = await api("/verification/repost", { method: "POST", body: "{}" });
      renderVerificationSetupResult(result);
      await loadSecurity();
      success(result.embedPosted ? "Verification embed posted." : "Verification embed updated.");
    } catch (error) {
      toast(`Could not update the verification embed: ${error.message}`, true);
    }
  });
});

document.querySelector("#disable-verification-mode").addEventListener("click", async () => {
  if (!verificationFormIsSaved()) return;
  if (!window.confirm("Disable verification and restore every channel overwrite Odyssey Bot backed up? The verification channel and existing verified roles will remain.")) return;
  const button = document.querySelector("#disable-verification-mode");
  await withBusy(button, "Restoring permissions...", async () => {
    try {
      const result = await api("/verification/disable", {
        method: "POST",
        body: JSON.stringify({ restorePermissions: true })
      });
      await loadSecurity();
      success(`Verification disabled. ${result.restore?.restored ?? 0} permission overwrites restored.`);
    } catch (error) {
      toast(`Could not disable verification safely: ${error.message}`, true);
    }
  });
});

document.querySelector("#add-automod-link-rule").addEventListener("click", () => addAutoModLinkRule());

document.querySelector("#auto-mod-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  const form = event.currentTarget;
  const values = formObject(form);
  clearErrors(form);
  await withBusy(form.querySelector('[type="submit"]'), "Saving Auto Mod...", async () => {
    try {
      await api("/auto-mod", { method: "PUT", body: JSON.stringify({
        enabled: form.elements.enabled.checked,
        blockInvites: form.elements.blockInvites.checked,
        blockSuspiciousLinks: form.elements.blockSuspiciousLinks.checked,
        blockCaps: form.elements.blockCaps.checked,
        blockSpam: form.elements.blockSpam.checked,
        blockMassMentions: form.elements.blockMassMentions.checked,
        alwaysBlockDiscordInvites: form.elements.alwaysBlockDiscordInvites.checked,
        linkChannelRules: autoModLinkRules(),
        capsPercentage: Number(values.capsPercentage),
        spamThreshold: Number(values.spamThreshold),
        mentionThreshold: Number(values.mentionThreshold),
        mentionSpamThreshold: Number(values.mentionSpamThreshold),
        mentionWindowSeconds: Number(values.mentionWindowSeconds),
        action: values.action,
        timeoutMinutes: Number(values.timeoutMinutes),
        ignoredChannelIds: selectedValues(form.elements.ignoredChannelIds),
        ignoredRoleIds: selectedValues(form.elements.ignoredRoleIds),
        ignoredUserIds: (values.ignoredUserIds || "").split(/\s+/).filter(Boolean),
        logChannelId: values.logChannelId || null
      }) });
      await loadAutomation();
      success("Successfully saved Auto Mod settings.");
    } catch (error) {
      showErrors(form, error.fields);
      toast(`Could not save Auto Mod settings: ${error.message}`, true);
    }
  });
});

document.querySelector("#role-panel-form").addEventListener("input", updateRolePanelPreview);
document.querySelector("#role-panel-form").addEventListener("change", (event) => {
  if (event.target?.name === "roleIds") renderRolePanelOptions();
  updateRolePanelPreview();
});
document.querySelector("#role-panel-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  const form = event.currentTarget;
  const values = formObject(form);
  const isUpdate = Boolean(values.id);
  clearErrors(form);
  await withBusy(form.querySelector('[type="submit"]'), isUpdate ? "Updating role panel..." : "Creating role panel...", async () => {
    try {
      await api(`/role-panels${isUpdate ? `/${values.id}` : ""}`, {
        method: isUpdate ? "PUT" : "POST",
        body: JSON.stringify({
          name: values.name,
          channelId: values.channelId || null,
          layout: values.layout || "buttons",
          title: values.title,
          description: values.description || "",
          color: values.color || "#5865F2",
          active: form.elements.active.checked,
          maxSelectedPerCategory: Number(values.maxSelectedPerCategory || 0),
          removeRoleOnSelect: form.elements.removeRoleOnSelect.checked,
          requiredRoleId: values.requiredRoleId || null,
          messageId: null,
          logChannelId: values.logChannelId || null,
          options: collectRolePanelOptions(),
          roleIds: selectedValues(form.elements.roleIds)
        })
      });
      resetRolePanelForm();
      await loadAutomation();
      success(`Successfully ${isUpdate ? "updated" : "created"} role panel: ${values.name}`);
    } catch (error) {
      showErrors(form, error.fields);
      toast(`Could not save role panel: ${error.message}`, true);
    }
  });
});

document.querySelector("#sticky-form").addEventListener("input", updateStickyPreview);
document.querySelector("#sticky-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  const form = event.currentTarget;
  const values = formObject(form);
  const isUpdate = Boolean(values.id);
  clearErrors(form);
  await withBusy(form.querySelector('[type="submit"]'), isUpdate ? "Updating sticky message..." : "Creating sticky message...", async () => {
    try {
      await api(`/sticky-messages${isUpdate ? `/${values.id}` : ""}`, {
        method: isUpdate ? "PUT" : "POST",
        body: JSON.stringify({
          channelId: values.channelId,
          content: values.content,
          enabled: form.elements.enabled.checked,
          minIntervalSeconds: Number(values.minIntervalSeconds)
        })
      });
      const label = channelName(values.channelId);
      resetStickyForm();
      await loadAutomation();
      success(`Successfully ${isUpdate ? "updated" : "created"} sticky message: ${label}`);
    } catch (error) {
      showErrors(form, error.fields);
      toast(`Could not save sticky message: ${error.message}`, true);
    }
  });
});

document.querySelector("#scheduled-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  const form = event.currentTarget;
  const values = formObject(form);
  const isUpdate = Boolean(values.id);
  clearErrors(form);
  await withBusy(form.querySelector('[type="submit"]'), isUpdate ? "Updating schedule..." : "Creating schedule...", async () => {
    try {
      const nextRunAt = new Date(values.nextRunAt);
      if (Number.isNaN(nextRunAt.getTime())) throw new ApiError("Choose a valid first send time.", { nextRunAt: "Choose a valid date and time." });
      await api(`/scheduled-announcements${isUpdate ? `/${values.id}` : ""}`, {
        method: isUpdate ? "PUT" : "POST",
        body: JSON.stringify({
          name: values.name,
          announcementTemplateId: Number(values.announcementTemplateId),
          channelId: values.channelId,
          pingType: values.pingType,
          scheduleType: values.scheduleType,
          nextRunAt: nextRunAt.toISOString(),
          intervalMinutes: values.scheduleType === "repeat" && values.intervalMinutes ? Number(values.intervalMinutes) : null,
          enabled: form.elements.enabled.checked
        })
      });
      resetScheduledForm();
      await loadAutomation();
      success(`Successfully ${isUpdate ? "updated" : "created"} scheduled announcement: ${values.name}`);
    } catch (error) {
      showErrors(form, error.fields);
      toast(`Could not save scheduled announcement: ${error.message}`, true);
    }
  });
});

document.querySelectorAll(".cancel-edit").forEach((button) => button.addEventListener("click", () => {
  const formId = button.closest("form").id;
  if (formId === "custom-form") resetCustomForm();
  if (formId === "panel-form") resetPanelForm();
  if (formId === "ticket-form") resetTicketForm();
  if (formId === "announcement-form") resetAnnouncementForm();
  if (formId === "role-panel-form") resetRolePanelForm();
  if (formId === "sticky-form") resetStickyForm();
  if (formId === "scheduled-form") resetScheduledForm();
}));

document.querySelectorAll(".new-editor").forEach((button) => button.addEventListener("click", () => {
  if (button.dataset.editor === "custom") {
    requestNavigation(
      { type: "resetForm", formId: "custom-form" },
      "Start a new command"
    );
  }
}));

document.querySelector("#docs-search-trigger")?.addEventListener("click", () => {
  openDocsSearchModal().catch((error) => toast(error.message, true));
});
document.querySelector("#docs-search-close")?.addEventListener("click", () => closeDocsSearchModal());
document.querySelector("[data-docs-search-close]")?.addEventListener("click", () => closeDocsSearchModal());
document.querySelector("#docs-search")?.addEventListener("input", (event) => {
  window.clearTimeout(state.docsSearchTimer);
  state.docsSearchTimer = window.setTimeout(() => {
    loadDocsSearchResults(event.target.value.trim()).catch((error) => toast(error.message, true));
  }, 180);
});
document.querySelector("#docs-search")?.addEventListener("keydown", (event) => {
  if (["ArrowDown", "ArrowUp"].includes(event.key)) {
    event.preventDefault();
    setDocsSearchActiveIndex(nextSearchIndex(
      state.docsSearchActiveIndex,
      state.docsSearchResults.length,
      event.key
    ));
  }
  if (event.key === "Enter") {
    const topic = state.docsSearchResults[state.docsSearchActiveIndex] || state.docsSearchResults[0];
    if (!topic) return;
    event.preventDefault();
    showDocsTopic(topic.slug, true, topic.hash || "").then(() => {
      closeDocsSearchModal({ restoreFocus: false });
    }).catch((error) => toast(error.message, true));
  }
  if (event.key === "Escape") {
    event.preventDefault();
    closeDocsSearchModal();
  }
});
document.addEventListener("keydown", (event) => {
  const isSearchShortcut = (event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k";
  if (isSearchShortcut && state.activePage === "docs") {
    event.preventDefault();
    openDocsSearchModal().catch((error) => toast(error.message, true));
  }
  if (event.key === "Escape" && state.docsSearchOpen) {
    event.preventDefault();
    closeDocsSearchModal();
  }
});

document.body.addEventListener("click", async (event) => {
  const docsTopic = event.target.closest("[data-doc-slug]");
  if (docsTopic) {
    const isSearchResult = Boolean(docsTopic.closest("#docs-search-modal"));
    await showDocsTopic(docsTopic.dataset.docSlug, true, docsTopic.dataset.docHash || "");
    if (isSearchResult) closeDocsSearchModal({ restoreFocus: false });
    return;
  }

  const automationButton = event.target.closest("[data-auto-action]");
  if (automationButton) {
    const id = Number(automationButton.dataset.id);
    const type = automationButton.dataset.autoType;
    const action = automationButton.dataset.autoAction;
    const collections = {
      "role-panel": state.rolePanels,
      sticky: state.stickyMessages,
      scheduled: state.scheduledAnnouncements
    };
    const item = collections[type]?.find((entry) => entry.id === id);
    if (!item) return;

    if (action === "delete") {
      const names = {
        "role-panel": item.name,
        sticky: channelName(item.channelId),
        scheduled: item.name
      };
      const paths = {
        "role-panel": "role-panels",
        sticky: "sticky-messages",
        scheduled: "scheduled-announcements"
      };
      if (!window.confirm(`Delete "${names[type]}"?`)) return;
      await withBusy(automationButton, "Deleting...", async () => {
        try {
          await api(`/${paths[type]}/${id}`, { method: "DELETE" });
          await loadAutomation();
          success(`Successfully deleted ${type.replace("-", " ")}: ${names[type]}`);
        } catch (error) {
          toast(`Could not delete ${type.replace("-", " ")}: ${error.message}`, true);
        }
      });
      return;
    }

    if (action === "post" && type === "role-panel") {
      await withBusy(automationButton, "Posting...", async () => {
        try {
          await api(`/role-panels/${id}/post`, { method: "POST", body: JSON.stringify({ channelId: null }) });
          success(`Successfully posted role panel: ${item.name}`);
        } catch (error) {
          toast(`Could not post role panel: ${error.message}`, true);
        }
      });
      return;
    }

    if (action === "test") {
      const path = type === "sticky"
        ? `/sticky-messages/${id}/test`
        : `/scheduled-announcements/${id}/test`;
      await withBusy(automationButton, "Sending...", async () => {
        try {
          await api(path, { method: "POST", body: "{}" });
          success(`Successfully sent ${type === "sticky" ? "sticky message" : "scheduled announcement"} preview.`);
        } catch (error) {
          toast(`Could not send preview: ${error.message}`, true);
        }
      });
      return;
    }

    if (action === "edit" && type === "role-panel") {
      resetRolePanelForm();
      const form = document.querySelector("#role-panel-form");
      form.elements.id.value = item.id;
      form.elements.name.value = item.name;
      form.elements.channelId.value = item.channelId || "";
      form.elements.layout.value = item.layout || "buttons";
      form.elements.logChannelId.value = item.logChannelId || "";
      form.elements.requiredRoleId.value = item.requiredRoleId || "";
      form.elements.maxSelectedPerCategory.value = item.maxSelectedPerCategory ?? 0;
      form.elements.removeRoleOnSelect.checked = Boolean(item.removeRoleOnSelect);
      form.elements.title.value = item.title;
      form.elements.description.value = item.description;
      form.elements.color.value = item.color;
      form.elements.colorText.value = item.color;
      form.elements.active.checked = item.active;
      setSelectedValues(form.elements.roleIds, item.roleIds);
      renderRolePanelOptions(item.options || []);
      form.querySelector(".cancel-edit").style.display = "block";
      updateRolePanelPreview();
      markFormClean(form);
    }

    if (action === "edit" && type === "sticky") {
      resetStickyForm();
      const form = document.querySelector("#sticky-form");
      form.elements.id.value = item.id;
      form.elements.channelId.value = item.channelId;
      form.elements.content.value = item.content;
      form.elements.enabled.checked = item.enabled;
      form.elements.minIntervalSeconds.value = item.minIntervalSeconds;
      form.querySelector(".cancel-edit").style.display = "block";
      updateStickyPreview();
      markFormClean(form);
    }

    if (action === "edit" && type === "scheduled") {
      resetScheduledForm();
      const form = document.querySelector("#scheduled-form");
      form.elements.id.value = item.id;
      form.elements.name.value = item.name;
      form.elements.announcementTemplateId.value = item.announcementTemplateId;
      form.elements.channelId.value = item.channelId;
      form.elements.pingType.value = item.pingType;
      form.elements.scheduleType.value = item.scheduleType;
      const localDate = new Date(item.nextRunAt);
      localDate.setMinutes(localDate.getMinutes() - localDate.getTimezoneOffset());
      form.elements.nextRunAt.value = localDate.toISOString().slice(0, 16);
      form.elements.intervalMinutes.value = item.intervalMinutes ?? "";
      form.elements.enabled.checked = item.enabled;
      form.querySelector(".cancel-edit").style.display = "block";
      markFormClean(form);
    }
    window.scrollTo({ top: 0, behavior: "smooth" });
    return;
  }

  const uploadButton = event.target.closest(".upload-button");
  if (uploadButton) {
    const form = uploadButton.closest("form");
    const input = document.createElement("input");
    input.type = "file";
    input.accept = "image/png,image/jpeg,image/gif,image/webp";
    input.addEventListener("change", async () => {
      if (!input.files?.[0]) return;
      const data = new FormData();
      data.append("image", input.files[0]);
      await withBusy(uploadButton, "Uploading...", async () => {
        try {
          const result = await api("/uploads", { method: "POST", body: data });
          form.elements[uploadButton.dataset.uploadTarget].value = result.url;
          form.elements[uploadButton.dataset.uploadTarget].dispatchEvent(new Event("input", { bubbles: true }));
          success(`Successfully uploaded image: ${result.name}`);
        } catch (error) { toast(`Could not upload image: ${error.message}`, true); }
      });
    });
    input.click();
    return;
  }

  const button = event.target.closest("[data-action]");
  if (!button) return;
  const id = Number(button.dataset.id);
  const type = button.dataset.type;
  const collections = { custom: state.customCommands, panel: state.ticketPanels, ticket: state.ticketTypes, announcement: state.announcements };
  const item = collections[type]?.find((entry) => entry.id === id);
  if (!item) return;

  if (button.dataset.action === "delete") {
    if (!window.confirm(`Delete "${item.name || item.label}"?`)) return;
    const paths = { custom: "custom-commands", panel: "ticket-panels", ticket: "ticket-types", announcement: "announcements" };
    const labels = { custom: "command", panel: "ticket panel", ticket: "ticket type", announcement: "announcement template" };
    await withBusy(button, "Deleting...", async () => {
      try {
        await api(`/${paths[type]}/${id}`, { method: "DELETE" });
        if (type === "custom") await loadCustomCommands();
        if (["panel", "ticket"].includes(type)) await loadTickets();
        if (type === "announcement") await loadAnnouncements();
        await loadOverview();
        success(`Successfully deleted ${labels[type]}: ${item.name || item.label}`);
      } catch (error) { toast(`Could not delete ${labels[type]}: ${error.message}`, true); }
    });
    return;
  }

  if (type === "custom") {
    resetCustomForm();
    const form = document.querySelector("#custom-form");
    const config = item.actionConfig;
    form.elements.id.value = item.id;
    form.elements.name.value = item.name;
    form.elements.description.value = item.description;
    form.elements.enabled.checked = item.enabled;
    form.elements.actionType.value = item.actionType;
    form.elements.content.value = item.actionType === "require_permission" ? "" : config.content;
    form.elements.permissionName.value = item.actionType === "require_permission" ? config.content : "";
    form.elements.targetChannelId.value = config.targetChannelId || "";
    form.elements.announcementChannelId.value = config.targetChannelId || "";
    form.elements.roleId.value = config.roleId || "";
    form.elements.roleIds && setSelectedValues(form.elements.roleIds, config.roleIds || []);
    form.elements.ticketPanelId.value = config.ticketPanelId || "";
    form.elements.announcementTemplateId.value = config.announcementTemplateId || "";
    form.elements.targetUserId.value = config.targetUserId || "";
    form.elements.durationMinutes.value = config.durationMinutes ?? "";
    form.elements.deleteMessageDays.value = config.deleteMessageDays ?? "";
    form.elements.amount.value = config.amount ?? "";
    form.elements.reason.value = config.reason || "";
    form.elements.newName.value = config.newName || "";
    form.elements.newCategoryId.value = config.newCategoryId || "";
    form.elements.pingType.value = config.pingType || "none";
    form.elements.accessMode.value = item.accessMode;
    setSelectedValues(form.elements.allowedRoleIds, item.allowedRoleIds);
    setSelectedValues(form.elements.blockedRoleIds, item.blockedRoleIds);
    setSelectedValues(form.elements.allowedChannelIds, item.allowedChannelIds);
    setSelectedValues(form.elements.blockedChannelIds, item.blockedChannelIds);
    form.elements.cooldownType.value = item.cooldownType;
    form.elements.cooldownSeconds.value = item.cooldownSeconds;
    form.elements.replyVisibility.value = item.replyVisibility;
    form.elements.deleteUsage.checked = item.deleteUsage;
    const embed = config.embed;
    const map = {
      embedContent: "content", embedTitle: "title", embedTitleUrl: "titleUrl",
      embedDescription: "description", embedColor: "color", embedColorText: "color",
      embedAuthorName: "authorName", embedAuthorIconUrl: "authorIconUrl", embedAuthorUrl: "authorUrl",
      embedImageUrl: "imageUrl", embedThumbnailUrl: "thumbnailUrl",
      embedFooterText: "footerText", embedFooterIconUrl: "footerIconUrl"
    };
    Object.entries(map).forEach(([field, key]) => { if (form.elements[field]) form.elements[field].value = embed[key] || ""; });
    if (form.elements.embedTimestamp) form.elements.embedTimestamp.checked = embed.timestamp;
    embed.fields.forEach(addEmbedField);
    if (config.actionSequence?.length) {
      config.actionSequence.forEach((seq) => {
        document.querySelector("#add-sequence-item").click();
        const rows = document.querySelectorAll("#sequence-fields .sequence-item");
        const row = rows[rows.length - 1];
        row.querySelector("[data-seq-action]").value = seq.actionType;
        row.querySelector("[data-seq-content]").value = seq.content || "";
        row.querySelector("[data-seq-channel]").value = seq.targetChannelId || "";
        row.querySelector("[data-seq-role]").value = seq.roleId || "";
        row.querySelector("[data-seq-user]").value = seq.targetUserId || "";
        row.querySelector("[data-seq-duration]").value = seq.durationMinutes ?? "";
        row.querySelector("[data-seq-delete]").value = seq.deleteMessageDays ?? "";
        row.querySelector("[data-seq-amount]").value = seq.amount ?? "";
        row.querySelector("[data-seq-reason]").value = seq.reason || "";
        row.querySelector("[data-seq-newname]").value = seq.newName || "";
        row.querySelector("[data-seq-category]").value = seq.newCategoryId || "";
        row.querySelector("[data-seq-ping]").value = seq.pingType || "none";
        row.querySelector("[data-seq-color]").value = seq.embed?.color || "#5865F2";
        row.querySelector("[data-seq-title]").value = seq.embed?.title || "";
        row.querySelector("[data-seq-description]").value = seq.embed?.description || "";
      });
    }
    form.querySelector(".cancel-edit").style.display = "block";
    updateCommandConflicts();
    updateCustomActionVisibility();
    markFormClean(form);
  }

  if (type === "panel") {
    resetPanelForm();
    const form = document.querySelector("#panel-form");
    Object.entries(item).forEach(([key, value]) => {
      if (!form.elements[key] || ["active", "ticketTypeIds", "childPanelIds"].includes(key)) return;
      form.elements[key].value = value ?? "";
    });
    form.elements.active.checked = item.active;
    setSelectedValues(form.elements.ticketTypeIds, item.ticketTypeIds);
    setSelectedValues(form.elements.childPanelIds, item.childPanelIds);
    form.elements.colorText.value = item.color;
    form.querySelector(".cancel-edit").style.display = "block";
    populateLibrarySelects();
    setSelectedValues(form.elements.ticketTypeIds, item.ticketTypeIds);
    setSelectedValues(form.elements.childPanelIds, item.childPanelIds);
    updatePanelVisibility();
    markFormClean(form);
  }

  if (type === "ticket") {
    resetTicketForm();
    const form = document.querySelector("#ticket-form");
    Object.entries(item).forEach(([key, value]) => {
      if (!form.elements[key] || ["active", "claimButtonEnabled", "closeButtonEnabled", "closeReasonRequired", "requestCloseEnabled", "staffRoleIds", "pingRoleIds", "allowedRoleIds", "blockedRoleIds"].includes(key)) return;
      form.elements[key].value = value ?? "";
    });
    ["active", "claimButtonEnabled", "closeButtonEnabled", "closeReasonRequired", "requestCloseEnabled"].forEach((key) => { if (form.elements[key]) form.elements[key].checked = item[key]; });
    ["staffRoleIds", "pingRoleIds", "allowedRoleIds", "blockedRoleIds"].forEach((key) => setSelectedValues(form.elements[key], item[key]));
    setTicketEmoji(item.emoji || "", false);
    form.querySelector(".cancel-edit").style.display = "block";
    updateTicketPreview();
    markFormClean(form);
  }

  if (type === "announcement") {
    resetAnnouncementForm();
    const form = document.querySelector("#announcement-form");
    Object.entries(item).forEach(([key, value]) => { if (form.elements[key]) form.elements[key].value = value ?? ""; });
    form.querySelector(".cancel-edit").style.display = "block";
    updateAnnouncementPreview();
    markFormClean(form);
  }
  window.scrollTo({ top: 0, behavior: "smooth" });
});

document.querySelectorAll(".color-control").forEach((control) => {
  const picker = control.querySelector('input[type="color"]');
  const text = control.querySelector('input:not([type="color"])');
  picker.addEventListener("input", () => { text.value = picker.value.toUpperCase(); picker.dispatchEvent(new Event("change", { bubbles: true })); });
  text.addEventListener("change", () => {
    if (/^#[0-9a-f]{6}$/i.test(text.value)) picker.value = text.value;
  });
});

async function init() {
  try {
    renderCommandVariables();
    const session = await api("/session");
    if (!session.authenticated) return window.location.replace("/login");
    if (!session.guildId) return window.location.replace("/servers");
    await loadGuilds();
    try {
      state.resources = await api("/discord/resources");
    } catch (error) {
      const selectedGuild = state.guilds.find((guild) => guild.id === state.selectedGuildId);
      state.resources = {
        guild: selectedGuild || { id: state.selectedGuildId, name: "Selected server" },
        channels: [],
        roles: [],
        emojis: []
      };
      toast(`Discord resources are temporarily unavailable: ${error.message}`, true);
    }
    document.querySelector("#guild-name").textContent = state.resources.guild?.name || "Selected server";
    populateResourceSelects();
    await Promise.allSettled([loadCustomCommands(), loadTickets(), loadAnnouncements(), loadBranding()]);
    populateLibrarySelects();
    resetCustomForm();
    resetPanelForm();
    resetTicketForm();
    resetAnnouncementForm();
    resetRolePanelForm();
    resetStickyForm();
    resetScheduledForm();
    await loadOverview();
    state.initializing = false;
    markAllFormsClean();
    if (window.location.pathname === "/docs" || window.location.pathname === "/help" || window.location.pathname.startsWith("/docs/")) {
      await showPage("docs");
      const topic = window.location.pathname.split("/")[2];
      if (topic) await showDocsTopic(topic, false, window.location.hash.replace(/^#/, ""));
    }
    const pendingTarget = sessionStorage.getItem("odyssey.pendingNavigation");
    if (pendingTarget) {
      sessionStorage.removeItem("odyssey.pendingNavigation");
      await performNavigation(JSON.parse(pendingTarget));
    }
  } catch (error) {
    state.initializing = false;
    toast(error.message, true);
    document.querySelector("#status").innerHTML = "<i></i>Connection issue";
  }
}

document.querySelector("#guild-switcher").addEventListener("change", async (event) => {
  const select = event.currentTarget;
  const guildId = select.value;
  select.value = state.selectedGuildId;
  requestNavigation(
    { type: "server", guildId },
    `Switch to ${state.guilds.find((guild) => guild.id === guildId)?.name || "another server"}`
  );
});

window.addEventListener("popstate", async () => {
  const topic = window.location.pathname.startsWith("/docs")
    ? window.location.pathname.split("/")[2]
    : null;
  requestNavigation(
    topic
      ? { type: "page", page: "docs", docTopic: topic, docHash: window.location.hash.replace(/^#/, "") }
      : { type: "page", page: "overview" },
    "Follow browser navigation"
  );
});

init();
