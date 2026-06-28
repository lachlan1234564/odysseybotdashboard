const brandTargets = document.querySelectorAll("[data-home-brand]");
const primaryAction = document.querySelector("#home-primary-action");

fetch("/api/session")
  .then((response) => response.json())
  .then((session) => {
    const name = session.dashboardName || "Bot Dashboard";
    document.title = name;
    brandTargets.forEach((target) => {
      target.textContent = name;
    });
    const mark = document.querySelector(".brand-mark");
    if (mark) mark.textContent = name.slice(0, 1).toUpperCase();
    if (!session.setupRequired && session.authenticated && session.guildId) {
      primaryAction.textContent = "Open dashboard";
      primaryAction.href = "/dashboard";
    } else if (!session.setupRequired && session.authenticated) {
      primaryAction.textContent = "Choose server";
      primaryAction.href = "/servers";
    } else {
      primaryAction.textContent = "Get Started";
      primaryAction.href = "/setup";
    }
  })
  .catch(() => {
    // Public home stays useful even when the API is still warming up.
  });
