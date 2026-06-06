const form = document.querySelector("#login-form");
const error = document.querySelector("#login-error");

fetch("/api/session")
  .then((response) => response.json())
  .then((session) => {
    if (session.authenticated) window.location.replace("/");
  });

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  error.textContent = "";
  const button = form.querySelector("button");
  button.disabled = true;
  try {
    const response = await fetch("/api/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password: form.password.value })
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || "Login failed.");
    window.location.replace("/");
  } catch (loginError) {
    error.textContent = loginError.message;
  } finally {
    button.disabled = false;
  }
});
