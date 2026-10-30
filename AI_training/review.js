const reviewForm = document.querySelector("#review-form");

reviewForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  if (!reviewForm.reportValidity()) return;

  const message = document.querySelector("#review-message");
  message.hidden = true;
  const button = reviewForm.querySelector('button[type="submit"]');
  const values = Object.fromEntries(new FormData(reviewForm));
  button.disabled = true;
  try {
    const response = await fetch("/api/review", {
      method: "POST",
      credentials: "same-origin",
      headers: { "Content-Type": "application/json", "X-Admin-Key": values.admin_key },
      body: JSON.stringify({ submission_id: values.submission_id, status: values.status })
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(result.error || "The review could not be saved.");
    message.textContent = `Application ${result.status}.`;
    message.classList.add("success");
    message.hidden = false;
    reviewForm.elements.submission_id.value = "";
  } catch (error) {
    message.textContent = error.message;
    message.classList.remove("success");
    message.hidden = false;
  } finally {
    button.disabled = false;
    reviewForm.elements.admin_key.value = "";
  }
});
