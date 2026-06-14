const form = document.querySelector("#login-form");
const error = document.querySelector("#login-error");
const password = document.querySelector("#password");
const togglePassword = document.querySelector("#toggle-password");

fetch("/api/session")
  .then((response) => response.json())
  .then((session) => {
    if (session.authenticated) window.location.replace(session.next || "/servers");
  });

togglePassword.addEventListener("click", () => {
  const showing = password.type === "text";
  password.type = showing ? "password" : "text";
  togglePassword.setAttribute("aria-pressed", String(!showing));
  togglePassword.setAttribute("aria-label", showing ? "Show password" : "Hide password");
  password.focus({ preventScroll: true });
  password.setSelectionRange(password.value.length, password.value.length);
});

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  error.textContent = "";
  const button = form.querySelector('[type="submit"]');
  button.disabled = true;
  try {
    const response = await fetch("/api/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password: form.password.value })
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || "Login failed.");
    window.location.replace(data.next || "/servers");
  } catch (loginError) {
    error.textContent = loginError.message;
  } finally {
    button.disabled = false;
  }
});
