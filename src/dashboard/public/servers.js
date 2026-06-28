const grid = document.querySelector("#server-grid");
const status = document.querySelector("#server-select-status");
const refresh = document.querySelector("#refresh-servers");
const appBrand = { dashboardName: "Bot Dashboard", botDisplayName: "Discord Bot" };

async function request(path, options = {}) {
  let response;
  try {
    response = await fetch(`/api${path}`, {
      ...options,
      headers: { "Content-Type": "application/json", ...(options.headers || {}) },
      signal: AbortSignal.timeout(12_000)
    });
  } catch (error) {
    if (error.name === "TimeoutError") {
      throw new Error("Discord took too long to respond. The dashboard is still running; retry in a moment.");
    }
    throw new Error("The dashboard backend is offline or unreachable.");
  }
  const data = await response.json().catch(() => ({}));
  if (response.status === 401) {
    window.location.replace("/login");
    throw new Error("Authentication required.");
  }
  if (!response.ok) throw new Error(data.error || "Could not load Discord servers.");
  return data;
}

function escapeHtml(value = "") {
  return String(value).replace(/[&<>"']/g, (character) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;"
  })[character]);
}

function guildIcon(guild) {
  if (!guild.icon) return `<span>${escapeHtml(guild.name.slice(0, 1).toUpperCase())}</span>`;
  return `<img src="https://cdn.discordapp.com/icons/${guild.id}/${guild.icon}.png?size=128" alt="">`;
}

async function selectGuild(guildId, button) {
  button.disabled = true;
  button.textContent = "Opening...";
  try {
    const result = await request("/guilds/select", {
      method: "POST",
      body: JSON.stringify({ guildId })
    });
    window.location.replace(result.next || "/dashboard");
  } catch (error) {
    status.textContent = error.message;
    status.classList.add("error");
    button.disabled = false;
    button.textContent = "Open dashboard";
  }
}

async function loadGuilds() {
  refresh.disabled = true;
  status.classList.remove("error");
  status.textContent = "Loading Discord servers...";
  grid.innerHTML = "";
  try {
    const data = await request("/guilds");
    if (data.autoSelected && data.guilds.length === 1) {
      status.textContent = "One server found. Opening its dashboard...";
      window.location.replace("/dashboard");
      return;
    }
    status.textContent = `${data.guilds.length} server${data.guilds.length === 1 ? "" : "s"} available`;
    grid.innerHTML = data.guilds.map((guild) => `
      <article class="server-card ${guild.id === data.selectedGuildId ? "selected" : ""}">
        <div class="server-card-icon">${guildIcon(guild)}</div>
        <div class="server-card-copy">
          <strong>${escapeHtml(guild.name)}</strong>
          <span>${guild.id === data.selectedGuildId ? "Currently selected" : `${escapeHtml(appBrand.botDisplayName)} connected`}</span>
        </div>
        <button type="button" data-guild-id="${guild.id}">Open dashboard</button>
      </article>
    `).join("");
  } catch (error) {
    status.textContent = error.message;
    status.classList.add("error");
  } finally {
    refresh.disabled = false;
  }
}

grid.addEventListener("click", (event) => {
  const button = event.target.closest("[data-guild-id]");
  if (button) selectGuild(button.dataset.guildId, button);
});
refresh.addEventListener("click", loadGuilds);
document.querySelector("#server-logout").addEventListener("click", async () => {
  await request("/logout", { method: "POST", body: "{}" }).catch(() => undefined);
  window.location.replace("/login");
});

request("/session")
  .then((session) => {
    if (session.setupRequired) return window.location.replace(session.next || "/setup");
    appBrand.dashboardName = session.dashboardName || appBrand.dashboardName;
    appBrand.botDisplayName = session.botDisplayName || appBrand.botDisplayName;
    document.title = `Choose a Server | ${appBrand.dashboardName}`;
    const eyebrow = document.querySelector(".server-select-header .eyebrow");
    const mark = document.querySelector(".brand-mark");
    if (eyebrow) eyebrow.textContent = `${appBrand.dashboardName} dashboard`;
    if (mark) mark.textContent = appBrand.dashboardName.slice(0, 1).toUpperCase();
    return session.authenticated ? loadGuilds() : window.location.replace("/login");
  })
  .catch((error) => {
    status.textContent = error.message;
    status.classList.add("error");
  });
