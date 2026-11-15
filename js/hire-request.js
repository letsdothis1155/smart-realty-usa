/* Paid-service quote intake. A saved request is never a payment or booked job. */
(function () {
  "use strict";
  const form = document.getElementById("hireForm");
  if (!form) return;
  const button = document.getElementById("hireSubmit");
  const status = document.getElementById("hireStatus");
  const fallback = document.getElementById("hireEmailFallback");
  const serviceField = document.getElementById("hireService");
  const briefField = document.getElementById("hireBrief");
  let submitting = false;
  let completed = false;
  const value = (id) => document.getElementById(id).value.trim();
  const params = new URLSearchParams(window.location.search);
  const source = params.get("utm_source")?.toLowerCase() ?? "";
  const sourceNote = /^[a-z][a-z0-9]*(?:[-_][a-z0-9]+)*$/.test(source) && source.length <= 24
    ? "Source: " + source + " | "
    : "";
  const copyQuote = {
    title: "Listing copy pack",
    intent: "services",
    note: "Listing copy pack | starting quote USD 150 | /hire/ | ",
    placeholder: "Property type, confirmed features, and where you plan to use the copy.",
    nextStep: "Pay $150 with Stripe when you want the pack.",
  };
  const roomQuote = {
    title: "Listing copy + one-room visualization",
    intent: "other",
    note: "Quote: copy + one-room layout | /hire/ | ",
    placeholder: "Property features, the room name, its measurements if known, and the layout you want.",
    nextStep: "Andrew will follow up with scope, price, and a delivery date.",
  };
  const selectedQuote = () => serviceField.value === "room-and-copy" ? roomQuote : copyQuote;
  if (params.get("offer") === "room-and-copy") serviceField.value = "room-and-copy";

  function requestBody(quote) {
    return {
      name: value("hireName"),
      email: value("hireEmail"),
      city: value("hireCity"),
      intent: quote.intent,
      note: quote.note + sourceNote + "Brief: " + value("hireBrief"),
      website: value("hireWebsite"),
    };
  }

  function updateEmail(body, quote) {
    const message = ["I'd like a quote for " + quote.title + ".", "Name: " + body.name,
      "Reply email: " + body.email, "City: " + body.city, body.note,
      "Please confirm scope, final price and delivery date before payment."].join("\n");
    fallback.href = "mailto:andrewiredale@smartrealty.us?subject=" + encodeURIComponent(quote.title + " quote") + "&body=" + encodeURIComponent(message);
  }

  const initial = selectedQuote();
  briefField.placeholder = initial.placeholder;
  if (sourceNote || initial === roomQuote) updateEmail(requestBody(initial), initial);

  form.addEventListener("input", () => {
    const quote = selectedQuote();
    briefField.placeholder = quote.placeholder;
    updateEmail(requestBody(quote), quote);
    if (completed) {
      completed = false;
      button.disabled = false;
      button.textContent = "Request a quote — no charge";
      status.textContent = "You changed your brief. Submitting again creates another request.";
    }
  });

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (submitting || completed || !form.reportValidity()) return;
    if (!document.getElementById("hireConsent").checked) return;
    const quote = selectedQuote();
    const body = requestBody(quote);
    updateEmail(body, quote);
    submitting = true;
    serviceField.disabled = true;
    button.disabled = true;
    button.textContent = "Sending request…";
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
          : "We could not confirm receipt. Your brief is still here; use the email link below or try again.");
      }
      const reference = data.id.slice(0, 80);
      status.textContent = data.emailed === true
        ? "Request received and Andrew's notification was sent. Reference: " + reference + ". No payment has been taken. " + quote.nextStep
        : "Request saved. Reference: " + reference + ". We could not confirm Andrew's email notification. Use the email link below and include this reference. No payment has been taken.";
      if (data.emailed !== true) {
        body.note += " | Saved request reference: " + reference;
        updateEmail(body, quote);
      }
      completed = true;
      button.textContent = "Request saved — no charge";
    } catch (error) {
      status.textContent = error.name === "AbortError"
        ? "The request timed out; receipt is unconfirmed. Your brief is still here. Use the email link below before submitting again."
        : error.message || "Receipt is unconfirmed. Use the email link below.";
      button.textContent = "Try request again";
    } finally {
      clearTimeout(timer);
      submitting = false;
      serviceField.disabled = false;
      button.disabled = completed;
      status.focus();
    }
  });
})();
