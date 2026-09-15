/* Public advertiser quote intake. A saved inquiry is never a booking, contract, or charge. */
(function () {
  "use strict";
  const form = document.getElementById("advertiserForm");
  if (!form) return;
  const button = document.getElementById("advertiserSubmit");
  const status = document.getElementById("advertiserStatus");
  const fallback = document.getElementById("advertiserEmailFallback");
  let submitting = false;
  let completed = false;
  const value = (id) => document.getElementById(id).value.trim();

  function requestBody() {
    const segments = [
      "Advertising inquiry",
      "Business: " + value("advertiserBusiness"),
      "Business website: " + (value("advertiserBusinessUrl") || "not supplied"),
      "Placement: " + value("advertiserPlacement"),
      "Dates: " + (value("advertiserDates") || "flexible"),
      "Monthly budget: " + (value("advertiserBudget") || "not supplied"),
      "Campaign: " + value("advertiserDetails"),
    ];
    return {
      name: value("advertiserName"),
      email: value("advertiserEmail"),
      phone: value("advertiserPhone"),
      intent: "services",
      note: segments.join(" | ").slice(0, 500),
      website: value("advertiserWebsite"),
    };
  }

  function updateEmail(body) {
    const message = [
      "I would like a written advertising quote for smartrealty.us.",
      "Name: " + body.name,
      "Reply email: " + body.email,
      "Phone: " + (body.phone || "not supplied"),
      body.note,
      "Please confirm availability, exact placement, dates, and total price before invoicing.",
      "This is an inquiry, not a booking or charge.",
    ].join("\n");
    fallback.href = "mailto:andrewiredale@smartrealty.us?subject=" +
      encodeURIComponent("Advertising inquiry - Smart Realty") + "&body=" + encodeURIComponent(message);
  }

  form.addEventListener("input", () => {
    updateEmail(requestBody());
    if (completed) {
      completed = false;
      button.disabled = false;
      button.textContent = "Send inquiry - no charge";
      status.textContent = "You changed the campaign details. Submitting again creates another inquiry.";
    }
  });

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (submitting || completed || !form.reportValidity()) return;
    if (!document.getElementById("advertiserConsent").checked) return;
    const body = requestBody();
    updateEmail(body);
    submitting = true;
    button.disabled = true;
    button.textContent = "Sending inquiry...";
    status.textContent = "";
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 15000);
    try {
      const response = await fetch("/api/signup", {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify(body),
        signal: controller.signal,
      });
      const isJson = (response.headers.get("content-type") || "").includes("application/json");
      const data = isJson ? await response.json() : null;
      if (!response.ok || !data || data.ok !== true || typeof data.id !== "string" || !data.id.trim()) {
        throw new Error(response.status === 429
          ? "Too many requests. Please wait before retrying or use the email link below."
          : "We could not confirm receipt. Your campaign details are still here; use the email link below or try again.");
      }
      const reference = data.id.slice(0, 80);
      status.textContent = data.emailed === true
        ? "Inquiry received and Andrew's notification was sent. Reference: " + reference + ". No advertisement was booked and no charge was made."
        : "Inquiry saved. Reference: " + reference + ". We could not confirm Andrew's email notification; use the email link below and include this reference. No advertisement was booked and no charge was made.";
      if (data.emailed !== true) {
        body.note += " | Saved inquiry reference: " + reference;
        updateEmail(body);
      }
      completed = true;
      button.textContent = "Inquiry saved - no charge";
    } catch (error) {
      status.textContent = error.name === "AbortError"
        ? "The request timed out; receipt is unconfirmed. Your campaign details are still here. Use the email link below before submitting again."
        : error.message || "Receipt is unconfirmed. Use the email link below.";
      button.textContent = "Try inquiry again";
    } finally {
      clearTimeout(timer);
      submitting = false;
      button.disabled = completed;
      status.focus();
    }
  });

  updateEmail(requestBody());
})();
