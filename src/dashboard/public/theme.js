(() => {
  const storageKey = "corepanel.dashboard.theme";
  const allowedThemes = new Set(["light", "dark"]);
  const media = window.matchMedia("(prefers-color-scheme: light)");

  function savedTheme() {
    const value = window.localStorage.getItem(storageKey);
    return allowedThemes.has(value) ? value : null;
  }

  function preferredTheme() {
    return savedTheme() ?? (media.matches ? "light" : "dark");
  }

  function syncButtons(theme) {
    document.querySelectorAll("[data-theme-toggle]").forEach((button) => {
      const nextTheme = theme === "dark" ? "light" : "dark";
      button.dataset.activeTheme = theme;
      button.setAttribute("aria-label", `Switch to ${nextTheme} mode`);
      button.setAttribute("title", `Switch to ${nextTheme} mode`);
      button.setAttribute("aria-pressed", String(theme === "dark"));
      const label = button.querySelector(".theme-label");
      if (label) label.textContent = theme === "dark" ? "Dark" : "Light";
    });
  }

  function applyTheme(theme, persist = false) {
    const nextTheme = allowedThemes.has(theme) ? theme : preferredTheme();
    document.documentElement.dataset.theme = nextTheme;
    document.documentElement.style.colorScheme = nextTheme;
    if (persist) window.localStorage.setItem(storageKey, nextTheme);
    syncButtons(nextTheme);
    window.dispatchEvent(new CustomEvent("corepanel:themechange", {
      detail: { theme: nextTheme }
    }));
    return nextTheme;
  }

  function toggleTheme() {
    const current = document.documentElement.dataset.theme || preferredTheme();
    applyTheme(current === "dark" ? "light" : "dark", true);
  }

  applyTheme(preferredTheme());

  document.addEventListener("DOMContentLoaded", () => {
    syncButtons(document.documentElement.dataset.theme || preferredTheme());
    document.querySelectorAll("[data-theme-toggle]").forEach((button) => {
      button.addEventListener("click", toggleTheme);
    });
  });

  media.addEventListener?.("change", () => {
    if (!savedTheme()) applyTheme(preferredTheme());
  });

  window.CorePanelTheme = {
    apply: (theme) => applyTheme(theme, true),
    current: () => document.documentElement.dataset.theme,
    toggle: toggleTheme
  };
})();
