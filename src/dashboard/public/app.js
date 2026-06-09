const state = {
  guilds: [],
  resources: { guild: null, channels: [], roles: [] },
  customCommands: [],
  ticketTypes: [],
  ticketPanels: [],
  announcements: [],
  closeRequests: [],
  docsTopics: [],
  activeDocTopic: null,
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
  stickyMessages: [],
  scheduledAnnouncements: [],
  socials: null
};

const pageMeta = {
  overview: ["Overview", "A quick read on your server automation."],
  custom: ["Command Studio", "Build database-driven actions for /custom."],
  tickets: ["Ticket Studio", "Compose ticket types into reusable entry panels."],
  announcements: ["Announcements", "Reusable broadcasts with a Discord confirmation flow."],
  socials: ["Social Promotion", "Create and publish a safe, reusable directory of community links."],
  moderation: ["Moderation", "Warnings and actions recorded by the bot."],
  settings: ["Server Settings", "Shared Discord roles, channels, and access defaults."],
  branding: ["Appearance", "Visual defaults used across bot messages."],
  welcome: ["Welcome Messages", "Greet new members with style."],
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
  amount: ["purge_messages"],
  duration: ["timeout_user"],
  deleteDays: ["ban_user"],
  newName: ["rename_channel"],
  newCategory: ["move_channel", "create_ticket"],
  permission: ["require_permission"],
  sequence: ["action_sequence"]
};

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
      headers: isFormData ? (options.headers || {}) : { "Content-Type": "application/json", ...(options.headers || {}) }
    });
  } catch {
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
  if (!response.ok) throw new ApiError(data?.error || "Request failed.", data?.fields || {});
  return data;
}

function toast(message, isError = false) {
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
  toast(message);
  recordActivity(message);
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
      kind === "category" ? channel.type === 4 : [0, 5].includes(channel.type)
    );
    select.innerHTML = `${select.multiple ? "" : '<option value="">Not configured</option>'}${channels.map((channel) =>
      `<option value="${channel.id}">${kind === "category" ? "Category · " : "#"}${escapeHtml(channel.name)}</option>`
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
    select.innerHTML = state.ticketTypes.map((type) => `<option value="${type.id}">${escapeHtml(type.emoji ? `${type.emoji} ${type.label}` : type.label)}</option>`).join("");
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
    .replaceAll("{closed_at}", "Not closed");
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
    : `<div class="preview-buttons">${components.labels.slice(0, 10).map((label) => `<span class="preview-button">${escapeHtml(label)}</span>`).join("")}</div>`
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
  row.innerHTML = `<input data-field-name maxlength="256" placeholder="Field name" value="${escapeHtml(field.name)}"><textarea data-field-value maxlength="1024" rows="1" placeholder="Field value">${escapeHtml(field.value)}</textarea><label class="inline-toggle" title="Inline"><input data-field-inline type="checkbox" ${field.inline ? "checked" : ""}></label><button type="button" class="remove-field">Remove</button>`;
  row.querySelector(".remove-field").addEventListener("click", () => { row.remove(); updateCustomPreview(); });
  row.querySelectorAll("input,textarea").forEach((input) => input.addEventListener("input", updateCustomPreview));
  document.querySelector("#embed-fields").append(row);
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
        return type ? `${type.emoji || "🎫"} ${type.label}` : null;
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
      labels
    }
  });
}

function updateTicketPreview() {
  const form = document.querySelector("#ticket-form");
  const values = formObject(form);
  renderDiscordPreview(document.querySelector("#ticket-preview"), {
    content: "@Lachlan",
    embed: {
      title: values.label || "Ticket type",
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
  });
  row.querySelectorAll("input").forEach((input) => input.addEventListener("input", updateSocialsPreview));
  document.querySelector(`#${containerId}`).append(row);
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
  const [types, panels, history, closeRequests] = await Promise.all([
    api("/ticket-types"),
    api("/ticket-panels"),
    api("/tickets"),
    api("/ticket-close-requests")
  ]);
  state.ticketTypes = types;
  state.ticketPanels = panels;
  state.closeRequests = closeRequests;
  populateLibrarySelects();
  document.querySelector("#ticket-count").textContent = types.length;
  document.querySelector("#panel-count").textContent = panels.length;
  document.querySelector("#ticket-list").innerHTML = itemList(types, "ticket", (item) =>
    `${item.active ? "Active" : "Disabled"} · max ${item.maxOpenTickets} per user · ${item.staffRoleIds.length} staff role(s)`
  );
  document.querySelector("#panel-list").innerHTML = itemList(panels, "panel", (item) =>
    `${item.active ? "Active" : "Disabled"} · ${item.panelKind === "multi" ? "Multi-panel" : item.displayMode} · ${item.panelKind === "multi" ? item.childPanelIds.length : item.ticketTypeIds.length} option(s)`
  );
  document.querySelector("#ticket-history").innerHTML = table(
    ["Type", "User", "Priority", "Status", "Opened", "Claimed by"],
    history.map((ticket) => `<tr><td>${escapeHtml(ticket.typeLabel || "Deleted type")}</td><td>${escapeHtml(ticket.userId)}</td><td><span class="pill priority-${escapeHtml(ticket.priority || "normal")}">${escapeHtml(ticket.priority || "normal")}</span></td><td><span class="pill">${escapeHtml(ticket.status)}</span></td><td>${escapeHtml(ticket.openedAt)}</td><td>${escapeHtml(ticket.claimedBy || "-")}</td></tr>`)
  );
  document.querySelector("#ticket-close-requests").innerHTML = table(
    ["Request", "Source", "Ticket", "Requester", "Reason", "Status", "Resolved by", "Created"],
    closeRequests.map((request) => `<tr>
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
}

async function loadGuilds() {
  const data = await api("/guilds");
  state.guilds = data.guilds;
  const select = document.querySelector("#guild-switcher");
  select.innerHTML = state.guilds.map((guild) =>
    `<option value="${guild.id}">${escapeHtml(guild.name)}</option>`
  ).join("");
  select.value = data.selectedGuildId;
}

async function loadModeration() {
  const data = await api("/moderation");
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
}

async function loadBranding() {
  const branding = await api("/branding");
  const form = document.querySelector("#branding-form");
  Object.entries(branding).forEach(([key, value]) => {
    if (form.elements[key]) form.elements[key].value = value || "";
  });
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
}

async function loadSecurity() {
  const [antiRaid, antiNuke, antiRole] = await Promise.all([
    api("/anti-raid"),
    api("/anti-nuke"),
    api("/anti-role")
  ]);
  state.antiRaid = antiRaid;
  state.antiNuke = antiNuke;
  state.antiRole = antiRole;

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

function updateRolePanelPreview() {
  const form = document.querySelector("#role-panel-form");
  const values = formObject(form);
  renderDiscordPreview(document.querySelector("#role-panel-preview"), {
    embed: {
      title: values.title || "Choose your roles",
      description: values.description || "Click a button to add or remove a role.",
      color: values.color || "#5865F2",
      fields: []
    },
    components: {
      mode: "buttons",
      labels: selectedValues(form.elements.roleIds).map((id) => roleName(id))
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
  row.querySelector(".remove-link-rule").addEventListener("click", () => row.remove());
  document.querySelector("#automod-link-rules").append(row);
}

function autoModLinkRules() {
  return [...document.querySelectorAll("#automod-link-rules .automod-link-rule")].map((row) => ({
    channelId: row.querySelector("[data-link-rule-channel]").value,
    allowedDomains: domainValues(row.querySelector("[data-link-rule-allowed]").value),
    blockedDomains: domainValues(row.querySelector("[data-link-rule-blocked]").value)
  }));
}

async function loadAutomation() {
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
  updateRolePanelPreview();
  updateStickyPreview();
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

async function loadDocsIndex(search = "") {
  state.docsTopics = await api(`/docs${search ? `?search=${encodeURIComponent(search)}` : ""}`);
  const list = document.querySelector("#docs-topic-list");
  list.innerHTML = state.docsTopics.length
    ? state.docsTopics.map((topic) => `<button type="button" data-doc-slug="${escapeHtml(topic.slug)}" class="${topic.slug === state.activeDocTopic ? "active" : ""}">
        <strong>${escapeHtml(topic.title)}</strong><span>${escapeHtml(topic.description)}</span>
      </button>`).join("")
    : emptyState("No matching topics", "Try another search term.");
  if (!state.activeDocTopic && state.docsTopics[0]) await showDocsTopic(state.docsTopics[0].slug, false);
}

async function showDocsTopic(slug, pushHistory = true) {
  const topic = await api(`/docs/${encodeURIComponent(slug)}`);
  state.activeDocTopic = topic.slug;
  document.querySelector("#docs-topic-content").innerHTML = topic.html;
  document.querySelectorAll("[data-doc-slug]").forEach((button) => {
    button.classList.toggle("active", button.dataset.docSlug === topic.slug);
  });
  enhanceDocsCodeBlocks();
  if (pushHistory && window.location.pathname !== `/docs/${topic.slug}`) {
    window.history.pushState({ page: "docs", topic: topic.slug }, "", `/docs/${topic.slug}`);
  }
  window.scrollTo({ top: 0, behavior: "smooth" });
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
    "anti-role": ["Role Protection", "Audit dangerous role changes and protected-role assignments."]
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
  const loaders = { overview: loadOverview, custom: loadCustomCommands, tickets: loadTickets, announcements: loadAnnouncements, socials: loadSocials, moderation: loadModeration, settings: loadSettings, branding: loadBranding, welcome: loadWelcome, security: loadSecurity, automation: loadAutomation };
  try { if (loaders[name]) await loaders[name](); } catch (error) { toast(error.message, true); }
  if (name === "tickets") setTicketView(state.ticketView);
  if (name === "security") setSecurityView(state.securityView);
  if (name === "automation") setAutomationView(state.automationView);
  if (name === "docs") {
    if (!window.location.pathname.startsWith("/docs")) {
      window.history.pushState({ page: "docs" }, "", "/docs");
    }
    try {
      await loadDocsIndex(document.querySelector("#docs-search").value.trim());
      if (!state.activeDocTopic && state.docsTopics[0]) await showDocsTopic(state.docsTopics[0].slug, false);
    } catch (error) {
      document.querySelector("#docs-topic-content").innerHTML = emptyState("Documentation unavailable", error.message);
    }
  } else if (window.location.pathname.startsWith("/docs")) {
    window.history.pushState({ page: name }, "", "/");
  }
  window.scrollTo({ top: 0, behavior: "smooth" });
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
  form.elements.pingType.value = "none";
  document.querySelector("#embed-fields").innerHTML = "";
  document.querySelector("#sequence-fields").innerHTML = "";
  form.querySelector(".cancel-edit").style.display = "none";
  clearErrors(form);
  updateCommandConflicts();
  updateCustomActionVisibility();
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
  form.querySelector(".cancel-edit").style.display = "none";
  clearErrors(form);
  updateTicketPreview();
}

function resetAnnouncementForm() {
  const form = document.querySelector("#announcement-form");
  form.reset();
  form.elements.id.value = "";
  form.elements.outputMode.value = "embed";
  form.elements.color.value = "#5865f2";
  form.querySelector(".cancel-edit").style.display = "none";
  updateAnnouncementPreview();
}

function resetRolePanelForm() {
  const form = document.querySelector("#role-panel-form");
  form.reset();
  form.elements.id.value = "";
  form.elements.active.checked = true;
  form.elements.title.value = "Choose your roles";
  form.elements.color.value = "#5865f2";
  form.elements.colorText.value = "#5865F2";
  form.querySelector(".cancel-edit").style.display = "none";
  clearErrors(form);
  updateRolePanelPreview();
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
}

document.querySelectorAll("[data-page]").forEach((button) => button.addEventListener("click", () => {
  if (button.dataset.ticketView) state.ticketView = button.dataset.ticketView;
  if (button.dataset.securityView) state.securityView = button.dataset.securityView;
  if (button.dataset.automationView) state.automationView = button.dataset.automationView;
  showPage(button.dataset.page);
}));
document.querySelectorAll("[data-nav-toggle]").forEach((button) => button.addEventListener("click", () => {
  const group = button.closest(".nav-group");
  group.classList.toggle("open");
}));
document.querySelectorAll(".jump-button").forEach((button) => button.addEventListener("click", () => showPage(button.dataset.jump)));
document.querySelectorAll("[data-doc-topic]").forEach((button) => button.addEventListener("click", async () => {
  await showPage("docs");
  await showDocsTopic(button.dataset.docTopic);
}));
document.querySelector("#logout").addEventListener("click", async () => { await api("/logout", { method: "POST" }); window.location.replace("/login"); });
document.querySelector("#clear-activity").addEventListener("click", () => {
  state.recentActivity = [];
  sessionStorage.removeItem("rapidbot.activity");
  renderActivity();
});

document.querySelector("#custom-form").addEventListener("input", updateCustomPreview);
document.querySelector("#custom-form").addEventListener("change", updateCommandConflicts);
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
      content: actionGroups.message.includes(actionType) ? values.content : embed.content,
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
      <label class="field">Content<textarea data-seq-content rows="2" maxlength="2000"></textarea></label>
      <label class="field">Target channel<select data-seq-channel data-channel-select="text"><option value="">Not configured</option></select></label>
      <label class="field">Optional ping<select data-seq-ping><option value="none">No ping</option><option value="everyone">@everyone</option><option value="here">@here</option></select></label>
      <label class="field">Role<select data-seq-role data-role-select><option value="">Not configured</option></select></label>
      <label class="field">Target user<input data-seq-user placeholder="User ID"></label>
      <label class="field">Duration (min)<input data-seq-duration type="number" min="1" max="40320"></label>
      <label class="field">Delete days<input data-seq-delete type="number" min="0" max="7"></label>
      <label class="field">Amount<input data-seq-amount type="number" min="1" max="100"></label>
      <label class="field">Reason<textarea data-seq-reason rows="1" maxlength="1000"></textarea></label>
      <label class="field">New name<input data-seq-newname maxlength="100"></label>
      <label class="field">Category<select data-seq-category data-channel-select="category"><option value="">Not configured</option></select></label>
      <label class="field">Embed color<input data-seq-color type="color" value="#5865f2"></label>
      <label class="field">Embed title<input data-seq-title maxlength="256"></label>
      <label class="field span-2">Embed description<textarea data-seq-description rows="2" maxlength="4096"></textarea></label>
    </div>
    <button type="button" class="remove-seq secondary-button compact">Remove action</button>
  `;
  row.querySelector(".remove-seq").addEventListener("click", () => row.remove());
  populateResourceSelects();
  container.append(row);
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

document.querySelector("#branding-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  const values = formObject(event.currentTarget);
  delete values.guildId;
  const form = event.currentTarget;
  await withBusy(form.querySelector('[type="submit"]'), "Saving appearance...", async () => {
    try {
      await api("/branding", { method: "PUT", body: JSON.stringify(values) });
      success("Successfully saved branding and appearance.");
    } catch (error) { toast(`Could not save appearance: ${error.message}`, true); }
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
      autoRoleIds: selectedValues(form.elements.autoRoleIds)
      }) });
      await loadWelcome();
      success("Successfully saved welcome message settings.");
    } catch (error) { toast(`Could not save welcome settings: ${error.message}`, true); }
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
document.querySelector("#role-panel-form").addEventListener("change", updateRolePanelPreview);
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
          title: values.title,
          description: values.description || "",
          color: values.color || "#5865F2",
          active: form.elements.active.checked,
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
  if (button.dataset.editor === "custom") resetCustomForm();
}));

document.querySelector("#docs-search")?.addEventListener("input", (event) => {
  window.clearTimeout(state.docsSearchTimer);
  state.docsSearchTimer = window.setTimeout(() => {
    loadDocsIndex(event.target.value.trim()).catch((error) => toast(error.message, true));
  }, 180);
});

document.body.addEventListener("click", async (event) => {
  const docsTopic = event.target.closest("[data-doc-slug]");
  if (docsTopic) {
    await showDocsTopic(docsTopic.dataset.docSlug);
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
      form.elements.title.value = item.title;
      form.elements.description.value = item.description;
      form.elements.color.value = item.color;
      form.elements.colorText.value = item.color;
      form.elements.active.checked = item.active;
      setSelectedValues(form.elements.roleIds, item.roleIds);
      form.querySelector(".cancel-edit").style.display = "block";
      updateRolePanelPreview();
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
    form.elements.content.value = config.content;
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
    form.querySelector(".cancel-edit").style.display = "block";
    updateTicketPreview();
  }

  if (type === "announcement") {
    resetAnnouncementForm();
    const form = document.querySelector("#announcement-form");
    Object.entries(item).forEach(([key, value]) => { if (form.elements[key]) form.elements[key].value = value ?? ""; });
    form.querySelector(".cancel-edit").style.display = "block";
    updateAnnouncementPreview();
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
    const session = await api("/session");
    if (!session.authenticated) return window.location.replace("/login");
    await loadGuilds();
    state.resources = await api("/discord/resources");
    document.querySelector("#guild-name").textContent = state.resources.guild.name;
    populateResourceSelects();
    await Promise.all([loadCustomCommands(), loadTickets(), loadAnnouncements()]);
    populateLibrarySelects();
    resetCustomForm();
    resetPanelForm();
    resetTicketForm();
    resetAnnouncementForm();
    resetRolePanelForm();
    resetStickyForm();
    resetScheduledForm();
    await loadOverview();
    if (window.location.pathname === "/docs" || window.location.pathname === "/help" || window.location.pathname.startsWith("/docs/")) {
      await showPage("docs");
      const topic = window.location.pathname.split("/")[2];
      if (topic) await showDocsTopic(topic, false);
    }
  } catch (error) {
    toast(error.message, true);
    document.querySelector("#status").innerHTML = "<i></i>Connection issue";
  }
}

document.querySelector("#guild-switcher").addEventListener("change", async (event) => {
  const select = event.currentTarget;
  select.disabled = true;
  try {
    await api("/guilds/select", {
      method: "POST",
      body: JSON.stringify({ guildId: select.value })
    });
    window.location.reload();
  } catch (error) {
    select.disabled = false;
    toast(error.message, true);
  }
});

window.addEventListener("popstate", async () => {
  if (window.location.pathname.startsWith("/docs")) {
    await showPage("docs");
    const topic = window.location.pathname.split("/")[2];
    if (topic) await showDocsTopic(topic, false);
  }
});

init();
