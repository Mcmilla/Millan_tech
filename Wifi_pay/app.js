"use strict";

const PAYMENT_CONFIG = {
  apiBaseUrl: "/api",
  statusPollIntervalMs: 2500,
  statusPollLimit: 72
};

const PLANS = [
  { id: "1-hour", label: "1 Hour Unlimited", duration: "1 hour", price: 9, badge: "Quick browse" },
  { id: "4-hours", label: "4 Hours Unlimited", duration: "4 hours", price: 19, badge: "Easy break" },
  { id: "24-hours", label: "24 Hours Unlimited", duration: "1 day", price: 29, badge: "Most popular", featured: true },
  { id: "1-week", label: "1 Week Unlimited", duration: "7 days", price: 189, badge: "Great value" },
  { id: "2-weeks", label: "2 Weeks Unlimited", duration: "14 days", price: 299, badge: "Stay connected" },
  { id: "1-month", label: "1 Month Unlimited", duration: "30 days", price: 479, badge: "Best for regulars" }
];

const plansGrid = document.querySelector("#plans-grid");
const modal = document.querySelector("#checkout-modal");
const closeModalButton = document.querySelector("#close-modal");
const checkoutForm = document.querySelector("#checkout-form");
const selectedPlanElement = document.querySelector("#selected-plan");
const phoneInput = document.querySelector("#phone-number");
const phoneError = document.querySelector("#phone-error");
const phoneInputWrap = document.querySelector(".phone-input-wrap");
const paymentStatus = document.querySelector("#payment-status");
const payButton = document.querySelector("#pay-button");
const buttonLabel = payButton.querySelector(".button-label");
let selectedPlan = null;
let previousFocus = null;
let activePollController = null;

document.querySelector("#current-year").textContent = String(new Date().getFullYear());

function renderPlans() {
  const checkIcon = '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="m3 8 3.2 3.2L13 4.5"/></svg>';
  const arrowIcon = '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M3 8h9M8 4l4 4-4 4"/></svg>';

  plansGrid.innerHTML = PLANS.map((plan) => `
    <article class="plan-card${plan.featured ? " featured" : ""}">
      <div class="plan-topline">
        <span class="plan-duration">${escapeHtml(plan.label)}</span>
        <span class="plan-badge">${escapeHtml(plan.badge)}</span>
      </div>
      <p class="plan-price"><span class="currency">KSh</span><span class="amount">${plan.price}</span></p>
      <p class="plan-duration-copy">${escapeHtml(plan.duration)} of unlimited access</p>
      <div class="plan-divider"></div>
      <span class="plan-feature">${checkIcon}Unlimited browsing</span>
      <button class="plan-button" type="button" data-plan-id="${escapeHtml(plan.id)}" aria-label="Choose ${escapeHtml(plan.label)} for KSh ${plan.price}">
        Choose plan ${arrowIcon}
      </button>
    </article>
  `).join("");
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (character) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;"
  })[character]);
}

function openCheckout(plan) {
  selectedPlan = plan;
  previousFocus = document.activeElement;
  selectedPlanElement.innerHTML = `
    <span class="selected-plan-copy">
      <span class="selected-plan-name">${escapeHtml(plan.label)}</span>
      <span class="selected-plan-description">${escapeHtml(plan.duration)} · Unlimited browsing</span>
    </span>
    <span class="selected-plan-price">KSh ${plan.price}</span>
  `;
  checkoutForm.hidden = false;
  paymentStatus.hidden = true;
  paymentStatus.className = "payment-status";
  checkoutForm.reset();
  clearPhoneError();
  setLoading(false);
  modal.hidden = false;
  document.body.classList.add("modal-open");
  window.requestAnimationFrame(() => phoneInput.focus());
}

function closeCheckout() {
  if (activePollController) {
    activePollController.abort();
    activePollController = null;
  }
  modal.hidden = true;
  document.body.classList.remove("modal-open");
  if (previousFocus && typeof previousFocus.focus === "function") {
    previousFocus.focus();
  }
}

function clearPhoneError() {
  phoneError.textContent = "";
  phoneInputWrap.classList.remove("invalid");
  phoneInput.removeAttribute("aria-invalid");
}

function validatePhone(value) {
  const digits = value.replace(/\D/g, "");
  const local = digits.startsWith("254") ? digits.slice(3) : digits.startsWith("0") ? digits.slice(1) : digits;
  return /^[17]\d{8}$/.test(local);
}

function normalizePhone(value) {
  const digits = value.replace(/\D/g, "");
  const local = digits.startsWith("254") ? digits.slice(3) : digits.startsWith("0") ? digits.slice(1) : digits;
  return `254${local}`;
}

function setLoading(loading) {
  payButton.disabled = loading;
  payButton.classList.toggle("loading", loading);
  buttonLabel.textContent = loading ? "Please wait…" : "Pay with M-Pesa";
}

function showStatus(message, state) {
  paymentStatus.textContent = message;
  paymentStatus.className = `payment-status ${state}`;
  paymentStatus.hidden = false;
}

async function startLivePayment(phoneNumber) {
  const response = await fetch(`${PAYMENT_CONFIG.apiBaseUrl}/payments`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      planId: selectedPlan.id,
      phoneNumber,
      paymentMethod: "mpesa"
    })
  });
  const result = await response.json().catch(() => null);

  if (!response.ok) {
    throw new Error(result?.message || "We couldn't start your payment. Please try again.");
  }
  if (!result || typeof result.paymentId !== "string") {
    throw new Error("The payment service returned an invalid response. Please try again.");
  }

  showStatus(result.message || "Check your phone and approve the M-Pesa prompt.", "waiting");
  await pollPaymentStatus(result.paymentId);
}

async function pollPaymentStatus(paymentId) {
  if (activePollController) {
    activePollController.abort();
  }
  const controller = new AbortController();
  activePollController = controller;

  for (let attempt = 0; attempt < PAYMENT_CONFIG.statusPollLimit; attempt += 1) {
    await new Promise((resolve) => window.setTimeout(resolve, PAYMENT_CONFIG.statusPollIntervalMs));
    if (controller.signal.aborted) {
      return;
    }

    const response = await fetch(`${PAYMENT_CONFIG.apiBaseUrl}/payments/${encodeURIComponent(paymentId)}`, {
      headers: { Accept: "application/json" },
      signal: controller.signal
    });
    const result = await response.json().catch(() => null);

    if (!response.ok || !result || typeof result.status !== "string") {
      throw new Error(result?.message || "We couldn't check your payment status. Please contact support before trying again.");
    }
    if (result.status === "active") {
      const receipt = result.receiptNumber ? ` Receipt: ${result.receiptNumber}.` : "";
      showStatus(`Payment confirmed.${receipt} Your Wi-Fi access is ready.`, "success");
      if (result.credentials && result.credentials.username && result.credentials.password) {
        const instructions = document.createElement("p");
        instructions.textContent = `Connect to the Wi-Fi sign-in page and enter username ${result.credentials.username} and password ${result.credentials.password}.`;
        paymentStatus.append(instructions);
      }
      checkoutForm.hidden = true;
      return;
    }
    if (result.status === "failed" || result.status === "expired") {
      throw new Error(result.message || "Payment wasn't completed. Please try again.");
    }
    if (result.status === "provisioning_failed") {
      showStatus(result.message || "Payment received, but Wi-Fi activation needs support. Do not pay again.", "error");
      checkoutForm.hidden = true;
      return;
    }
    if (result.message) {
      showStatus(result.message, "waiting");
    }
  }

  showStatus("Your payment is still processing. Check your M-Pesa messages before retrying.", "waiting");
}

plansGrid.addEventListener("click", (event) => {
  const button = event.target.closest("[data-plan-id]");
  if (!button) {
    return;
  }
  const plan = PLANS.find((item) => item.id === button.dataset.planId);
  if (plan) {
    openCheckout(plan);
  }
});

closeModalButton.addEventListener("click", closeCheckout);
modal.addEventListener("click", (event) => {
  if (event.target === modal) {
    closeCheckout();
  }
});

document.addEventListener("keydown", (event) => {
  if (modal.hidden) {
    return;
  }
  if (event.key === "Escape") {
    closeCheckout();
  }
  if (event.key === "Tab") {
    const focusable = [...modal.querySelectorAll('button:not([disabled]), input:not([disabled]), [href], [tabindex]:not([tabindex="-1"])')]
      .filter((element) => !element.closest("[hidden]"));
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  }
});

phoneInput.addEventListener("input", clearPhoneError);
phoneInput.addEventListener("blur", () => {
  const value = phoneInput.value.trim();
  if (value && !validatePhone(value)) {
    phoneError.textContent = "Enter a valid Kenyan number, e.g. 0712 345 678.";
    phoneInputWrap.classList.add("invalid");
    phoneInput.setAttribute("aria-invalid", "true");
  }
});

checkoutForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  clearPhoneError();
  const phone = phoneInput.value.trim();

  if (!validatePhone(phone)) {
    phoneError.textContent = "Enter a valid Kenyan number, e.g. 0712 345 678.";
    phoneInputWrap.classList.add("invalid");
    phoneInput.setAttribute("aria-invalid", "true");
    phoneInput.focus();
    return;
  }

  if (!selectedPlan) {
    showStatus("Choose a Wi-Fi plan before continuing.", "error");
    return;
  }

  setLoading(true);
  paymentStatus.hidden = true;
  try {
    await startLivePayment(normalizePhone(phone));
  } catch (error) {
    if (error.name === "AbortError") {
      return;
    }
    showStatus(error.message || "Something went wrong. Please try again.", "error");
  } finally {
    setLoading(false);
  }
});

renderPlans();
