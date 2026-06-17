const result = new URLSearchParams(window.location.search).get("result");
const guildId = new URLSearchParams(window.location.search).get("guild");
const resultElement = document.querySelector("#verification-result");
const startElement = document.querySelector("#verification-start");

if (result) {
  startElement.classList.add("hidden");
  resultElement.classList.remove("hidden");
  resultElement.className = `verification-result ${result === "passed" ? "success" : "error"}`;
  const fallback = result === "passed"
    ? "Verification passed. You can return to Discord."
    : result === "failed"
      ? "Verification did not meet this server's requirements. Contact server staff if you need help."
      : "Verification could not be completed. The link may have expired - ask staff for a new one.";
  resultElement.textContent = fallback;
  if (guildId) {
    fetch(`/api/verify/result?guild=${encodeURIComponent(guildId)}&result=${encodeURIComponent(result)}`)
      .then((response) => response.ok ? response.json() : null)
      .then((data) => {
        if (data?.message) resultElement.textContent = data.message;
      })
      .catch(() => undefined);
  }
} else {
  const segments = window.location.pathname.split("/").filter(Boolean);
  const value = segments.at(-1);
  const stableServerLink = segments.at(-2) === "server";
  document.querySelector("#verification-button").href = stableServerLink
    ? `/api/verify/server/${encodeURIComponent(value)}/start`
    : `/api/verify/${encodeURIComponent(value)}/start`;
}
