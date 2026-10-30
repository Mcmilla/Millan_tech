const signupForm = document.querySelector("#signup-form");
const loginForm = document.querySelector("#login-form");
const authView = document.querySelector("#auth-view");
const accountView = document.querySelector("#account-view");
const signupTab = document.querySelector("#signup-tab");
const loginTab = document.querySelector("#login-tab");
const maxImageBytes = 4 * 1024 * 1024;
const allowedTypes = new Set(["image/jpeg", "image/png", "image/webp"]);

function showMessage(element, message, success = false) {
  element.textContent = message;
  element.classList.toggle("success", success);
  element.hidden = false;
}

async function request(url, options) {
  const response = await fetch(url, { credentials: "same-origin", ...options });
  const result = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(result.error || "Something went wrong. Please try again.");
  return result;
}

function setTab(tab) {
  const signupActive = tab === "signup";
  signupTab.classList.toggle("active", signupActive);
  signupTab.setAttribute("aria-selected", String(signupActive));
  loginTab.classList.toggle("active", !signupActive);
  loginTab.setAttribute("aria-selected", String(!signupActive));
  signupForm.hidden = !signupActive;
  loginForm.hidden = signupActive;
}

function displayAccount(account) {
  authView.hidden = true;
  accountView.hidden = false;
  document.querySelector("#account-status").textContent = account.status;
  document.querySelector("#submission-id").textContent = `Submission ID: ${account.submission_id}`;
  const descriptions = {
    pending: "Your application is being reviewed. You cannot access training jobs until a reviewer approves your identity documents.",
    approved: "Your identity has been approved. Your account is cleared for contributor job access.",
    rejected: "Your application was not approved. Job access remains disabled. Contact the platform team if you believe this is an error."
  };
  document.querySelector("#account-description").textContent = descriptions[account.status];
}

signupTab.addEventListener("click", () => setTab("signup"));
loginTab.addEventListener("click", () => setTab("login"));

signupForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const message = document.querySelector("#signup-message");
  message.hidden = true;
  if (!signupForm.reportValidity()) return;

  const data = new FormData(signupForm);
  const password = data.get("password");
  if (password.length < 12) {
    showMessage(message, "Choose a password with at least 12 characters.");
    return;
  }
  if (password !== data.get("password_confirmation")) {
    showMessage(message, "The passwords do not match.");
    return;
  }
  for (const fieldName of ["id_front", "id_back", "selfie"]) {
    const file = data.get(fieldName);
    if (!file || file.size === 0) {
      showMessage(message, "Upload all three identity photos to continue.");
      return;
    }
    if (file.size > maxImageBytes || !allowedTypes.has(file.type)) {
      showMessage(message, "Each photo must be JPEG, PNG, or WebP and no larger than 4 MB.");
      return;
    }
  }

  const submitButton = signupForm.querySelector('button[type="submit"]');
  submitButton.disabled = true;
  submitButton.textContent = "Submitting securely…";
  try {
    const result = await request("/api/signup", { method: "POST", body: data });
    displayAccount(result.account);
  } catch (error) {
    showMessage(message, error.message);
  } finally {
    submitButton.disabled = false;
    submitButton.textContent = "Submit application";
  }
});

loginForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const message = document.querySelector("#login-message");
  message.hidden = true;
  if (!loginForm.reportValidity()) return;

  const submitButton = loginForm.querySelector('button[type="submit"]');
  submitButton.disabled = true;
  try {
    const result = await request("/api/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(Object.fromEntries(new FormData(loginForm)))
    });
    displayAccount(result.account);
  } catch (error) {
    showMessage(message, error.message);
  } finally {
    submitButton.disabled = false;
  }
});

document.querySelector("#logout-button").addEventListener("click", async () => {
  try {
    await request("/api/logout", { method: "POST" });
    accountView.hidden = true;
    authView.hidden = false;
    loginForm.reset();
    setTab("signup");
  } catch (error) {
    document.querySelector("#account-description").textContent = error.message;
  }
});

if (["http:", "https:"].includes(window.location.protocol)) {
  request("/api/me", { method: "GET" })
    .then((result) => displayAccount(result.account))
    .catch((error) => {
      if (!error.message.includes("Not signed in")) showMessage(document.querySelector("#signup-message"), error.message);
    });
}
