const result = new URLSearchParams(window.location.search).get("result");
const resultElement = document.querySelector("#verification-result");
const startElement = document.querySelector("#verification-start");

if (result) {
  startElement.classList.add("hidden");
  resultElement.classList.remove("hidden");
  resultElement.className = `verification-result ${result === "passed" ? "success" : "error"}`;
  resultElement.textContent = result === "passed"
    ? "Verification passed. You can return to Discord."
    : result === "failed"
      ? "Verification did not meet this server's requirements. Contact server staff if you need help."
      : "Verification could not be completed. The link may have expired - ask staff for a new one.";
} else {
  const token = window.location.pathname.split("/").filter(Boolean).at(-1);
  document.querySelector("#verification-button").href = `/api/verify/${encodeURIComponent(token)}/start`;
}
