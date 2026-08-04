document.addEventListener("DOMContentLoaded", () => {
  const loginForm = document.getElementById("login-form");
  const registerForm = document.getElementById("register-form");
  const forgotForm = document.getElementById("forgot-password-form");
  const resetForm = document.getElementById("reset-password-form");
  const roleSelect = document.getElementById("role");

  if (roleSelect) {
    roleSelect.addEventListener("change", toggleTrainerCode);
    toggleTrainerCode();
  }

  if (loginForm) {
    loginForm.addEventListener("submit", handleLogin);
  }
  if (registerForm) {
    registerForm.addEventListener("submit", handleRegister);
  }
  if (forgotForm) {
    forgotForm.addEventListener("submit", handleForgotPassword);
  }
  if (resetForm) {
    resetForm.addEventListener("submit", handleResetPassword);
  }

  document.querySelectorAll(".password-toggle-btn").forEach(btn => {
    btn.addEventListener("click", () => togglePasswordVisibility(btn));
  });

  const resetEmailField = document.getElementById("reset-email");
  if (resetEmailField) {
    const params = new URLSearchParams(window.location.search);
    const prefillEmail = params.get("email");
    if (prefillEmail) resetEmailField.value = prefillEmail;
  }
});

function togglePasswordVisibility(btn) {
  const target = document.getElementById(btn.dataset.target);
  if (!target) return;
  const isShowing = target.type === "text";
  target.type = isShowing ? "password" : "text";
  const eyeIcon = btn.querySelector(".icon-eye");
  const eyeOffIcon = btn.querySelector(".icon-eye-off");
  if (eyeIcon) eyeIcon.style.display = isShowing ? "block" : "none";
  if (eyeOffIcon) eyeOffIcon.style.display = isShowing ? "none" : "block";
  btn.setAttribute("aria-label", isShowing ? "Show password" : "Hide password");
}

async function handleForgotPassword(e) {
  e.preventDefault();
  const submitBtn = document.getElementById("forgot-submit");
  const email = document.getElementById("forgot-email").value.trim();

  if (!email) {
    showMessage("Please enter your email.", "error");
    return;
  }

  submitBtn.disabled = true;
  submitBtn.textContent = "Sending...";

  try {
    const res = await fetch(`${API_BASE}/api/forgot-password`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ email })
    });
    const data = await res.json();

    if (!res.ok) {
      showMessage(data.error || "Could not process this request.", "error");
      submitBtn.disabled = false;
      submitBtn.textContent = "Send reset code";
      return;
    }

    showMessage("If an account exists for that email, a 6-digit code is on its way. Redirecting...", "success");
    submitBtn.textContent = "Sent";
    setTimeout(() => {
      window.location.href = "reset-password.html?email=" + encodeURIComponent(email);
    }, 1200);
  } catch (err) {
    showMessage("Could not reach the server. Please try again.", "error");
    submitBtn.disabled = false;
    submitBtn.textContent = "Send reset code";
  }
}

async function handleResetPassword(e) {
  e.preventDefault();
  const submitBtn = document.getElementById("reset-submit");
  const email = document.getElementById("reset-email").value.trim();
  const code = document.getElementById("reset-code").value.trim();
  const password = document.getElementById("new_password").value;
  const confirmPassword = document.getElementById("confirm_new_password").value;

  if (!email || !code) {
    showMessage("Please enter your email and the 6-digit code.", "error");
    return;
  }
  if (password.length < 6) {
    showMessage("Password must be at least 6 characters.", "error");
    return;
  }
  if (password !== confirmPassword) {
    showMessage("Passwords do not match.", "error");
    return;
  }

  submitBtn.disabled = true;
  submitBtn.textContent = "Saving...";

  try {
    const res = await fetch(`${API_BASE}/api/reset-password`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ email, code, password })
    });
    const data = await res.json();

    if (!res.ok) {
      showMessage(data.error || "Could not reset your password.", "error");
      submitBtn.disabled = false;
      submitBtn.textContent = "Set new password";
      return;
    }

    showMessage("Password updated. Redirecting to login...", "success");
    setTimeout(() => { window.location.href = "login.html"; }, 1200);
  } catch (err) {
    showMessage("Could not reach the server. Please try again.", "error");
    submitBtn.disabled = false;
    submitBtn.textContent = "Set new password";
  }
}

function toggleTrainerCode() {
  const role = document.getElementById("role").value;
  const wrap = document.getElementById("trainer-code-wrap");
  const codeInput = document.getElementById("trainer_code");
  if (!wrap || !codeInput) return;
  const isTrainer = role === "trainer";
  wrap.style.display = isTrainer ? "block" : "none";
  codeInput.required = isTrainer;
  if (!isTrainer) codeInput.value = "";
}

function showMessage(text, type) {
  const box = document.getElementById("auth-message");
  if (!box) return;
  box.textContent = text;
  box.className = "auth-message show " + type;
}

async function handleLogin(e) {
  e.preventDefault();
  const submitBtn = document.getElementById("login-submit");
  const email = document.getElementById("email").value.trim();
  const password = document.getElementById("password").value;

  if (!email || !password) {
    showMessage("Please fill in both fields.", "error");
    return;
  }

  submitBtn.disabled = true;
  submitBtn.textContent = "Logging in...";

  try {
    const res = await fetch(`${API_BASE}/api/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ email, password })
    });
    const data = await res.json();

    if (!res.ok) {
      showMessage(data.error || "Login failed. Please try again.", "error");
      submitBtn.disabled = false;
      submitBtn.textContent = "Log in";
      return;
    }

    showMessage("Welcome back, " + data.user.full_name + "! Redirecting...", "success");
    setTimeout(() => { window.location.href = "index.html"; }, 700);
  } catch (err) {
    showMessage("Could not reach the server. Please try again.", "error");
    submitBtn.disabled = false;
    submitBtn.textContent = "Log in";
  }
}

async function handleRegister(e) {
  e.preventDefault();
  const submitBtn = document.getElementById("register-submit");
  const full_name = document.getElementById("full_name").value.trim();
  const email = document.getElementById("email").value.trim();
  const phone = document.getElementById("phone").value.trim();
  const role = document.getElementById("role").value;
  const trainer_code = document.getElementById("trainer_code") ? document.getElementById("trainer_code").value.trim() : "";
  const password = document.getElementById("password").value;
  const confirm_password = document.getElementById("confirm_password").value;

  if (!full_name || !email || !phone || !password || !confirm_password) {
    showMessage("Please fill in all fields.", "error");
    return;
  }
  if (role === "trainer" && !trainer_code) {
    showMessage("Please enter the trainer invite code.", "error");
    return;
  }
  if (password.length < 6) {
    showMessage("Password must be at least 6 characters.", "error");
    return;
  }
  if (password !== confirm_password) {
    showMessage("Passwords do not match.", "error");
    return;
  }

  submitBtn.disabled = true;
  submitBtn.textContent = "Creating account...";

  try {
    const res = await fetch(`${API_BASE}/api/register`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ full_name, email, phone, role, trainer_code, password })
    });
    const data = await res.json();

    if (!res.ok) {
      showMessage(data.error || "Could not create account.", "error");
      submitBtn.disabled = false;
      submitBtn.textContent = "Create account";
      return;
    }

    showMessage("Account created. Redirecting...", "success");
    setTimeout(() => { window.location.href = "index.html"; }, 700);
  } catch (err) {
    showMessage("Could not reach the server. Please try again.", "error");
    submitBtn.disabled = false;
    submitBtn.textContent = "Create account";
  }
}



