import { EmailMessage } from "cloudflare:email";

const ALLOWED_ORIGINS = new Set([
  "https://smartrealty.us",
  "https://www.smartrealty.us",
  "https://letsdothis1155.github.io",
]);

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MAX_BODY_BYTES = 12_000;
const IP_LIMIT = 8;
const EMAIL_LIMIT = 3;

function corsHeaders(request: Request): Headers {
  const origin = request.headers.get("Origin") || "";
  const headers = new Headers({
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Accept",
    "Access-Control-Max-Age": "86400",
    Vary: "Origin",
  });
  if (!origin) return headers;
  if (ALLOWED_ORIGINS.has(origin) || /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin)) {
    headers.set("Access-Control-Allow-Origin", origin);
  }
  return headers;
}

function json(data: unknown, status: number, request: Request): Response {
  const headers = corsHeaders(request);
  headers.set("Content-Type", "application/json; charset=utf-8");
  headers.set("Cache-Control", "no-store");
  return new Response(JSON.stringify(data), { status, headers });
}

function cleanHeader(value: string, max = 120): string {
  return value.replace(/[\r\n\0]+/g, " ").replace(/\s+/g, " ").trim().slice(0, max);
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function hourBucket(): number {
  return Math.floor(Date.now() / 3_600_000);
}

function dayBucket(): string {
  return new Date().toISOString().slice(0, 10);
}

async function bump(kv: KVNamespace, key: string, ttl: number): Promise<number> {
  const current = Number.parseInt((await kv.get(key)) || "0", 10) || 0;
  const next = current + 1;
  await kv.put(key, String(next), { expirationTtl: ttl });
  return next;
}

type SignupBody = {
  name?: unknown;
  email?: unknown;
  note?: unknown;
  website?: unknown;
  company?: unknown;
  password?: unknown;
};

function buildMime(opts: {
  fromName: string;
  fromEmail: string;
  to: string;
  replyName: string;
  replyEmail: string;
  subject: string;
  text: string;
  html: string;
}): string {
  const boundary = `b${crypto.randomUUID()}`;
  const fromName = cleanHeader(opts.fromName, 80);
  const replyName = cleanHeader(opts.replyName, 80);
  const subject = cleanHeader(opts.subject, 140);
  return [
    `From: "${fromName}" <${opts.fromEmail}>`,
    `To: <${opts.to}>`,
    `Reply-To: "${replyName}" <${opts.replyEmail}>`,
    `Subject: ${subject}`,
    "MIME-Version: 1.0",
    `Content-Type: multipart/alternative; boundary="${boundary}"`,
    "",
    `--${boundary}`,
    "Content-Type: text/plain; charset=UTF-8",
    "Content-Transfer-Encoding: 8bit",
    "",
    opts.text,
    `--${boundary}`,
    "Content-Type: text/html; charset=UTF-8",
    "Content-Transfer-Encoding: 8bit",
    "",
    opts.html,
    `--${boundary}--`,
    "",
  ].join("\r\n");
}

async function deliverEmail(
  env: Env,
  opts: {
    name: string;
    email: string;
    subject: string;
    text: string;
    html: string;
  },
): Promise<{ emailed: boolean; via: string }> {
  const to = env.SIGNUP_TO;
  const from = env.SIGNUP_FROM;
  const fromName = env.SIGNUP_FROM_NAME || "Smart Realty USA";

  try {
    await env.EMAIL.send({
      to,
      from: { email: from, name: fromName },
      replyTo: { email: opts.email, name: opts.name },
      subject: opts.subject,
      text: opts.text,
      html: opts.html,
    });
    return { emailed: true, via: "email-binding" };
  } catch (error) {
    console.error(
      JSON.stringify({
        message: "structured email send failed",
        error: error instanceof Error ? error.message : String(error),
        code: error && typeof error === "object" && "code" in error ? error.code : undefined,
      }),
    );
  }

  try {
    const raw = buildMime({
      fromName,
      fromEmail: from,
      to,
      replyName: opts.name,
      replyEmail: opts.email,
      subject: opts.subject,
      text: opts.text,
      html: opts.html,
    });
    await env.EMAIL.send(new EmailMessage(from, to, raw));
    return { emailed: true, via: "email-mime" };
  } catch (error) {
    console.error(
      JSON.stringify({
        message: "mime email send failed",
        error: error instanceof Error ? error.message : String(error),
      }),
    );
  }

  try {
    const res = await fetch(`https://formsubmit.co/ajax/${encodeURIComponent(to)}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
        Origin: "https://smartrealty.us",
        Referer: "https://smartrealty.us/auth.html",
      },
      body: JSON.stringify({
        name: opts.name,
        email: opts.email,
        _subject: opts.subject,
        _template: "box",
        _captcha: "false",
        message: opts.text,
      }),
    });
    const payload = await res.text();
    if (res.ok && !payload.includes('"success":"false"')) {
      return { emailed: true, via: "formsubmit" };
    }
    console.error(
      JSON.stringify({
        message: "formsubmit failed",
        status: res.status,
        body: payload.slice(0, 300),
      }),
    );
  } catch (error) {
    console.error(
      JSON.stringify({
        message: "formsubmit threw",
        error: error instanceof Error ? error.message : String(error),
      }),
    );
  }

  return { emailed: false, via: "none" };
}

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    try {
      if (request.method === "OPTIONS") {
        return new Response(null, { status: 204, headers: corsHeaders(request) });
      }

      const url = new URL(request.url);
      const path = url.pathname.replace(/\/+$/, "") || "/";
      const isSignup = path === "/api/signup" || path === "/signup" || path === "/";

      if (!isSignup) {
        return json({ ok: false, error: "Not found" }, 404, request);
      }

      if (request.method === "GET") {
        return json({ ok: true, service: "signup" }, 200, request);
      }

      if (request.method !== "POST") {
        return json({ ok: false, error: "Method not allowed" }, 405, request);
      }

      const length = Number(request.headers.get("Content-Length") || "0");
      if (length > MAX_BODY_BYTES) {
        return json({ ok: false, error: "Request too large" }, 413, request);
      }

      const rawText = await request.text();
      if (rawText.length > MAX_BODY_BYTES) {
        return json({ ok: false, error: "Request too large" }, 413, request);
      }

      let body: SignupBody;
      try {
        body = rawText ? (JSON.parse(rawText) as SignupBody) : {};
      } catch {
        return json({ ok: false, error: "Invalid JSON" }, 400, request);
      }

      const honeypot = cleanHeader(String(body.website || body.company || ""), 80);
      if (honeypot) {
        return json({ ok: true, emailed: true }, 200, request);
      }

      const name = cleanHeader(String(body.name || ""), 80);
      const email = cleanHeader(String(body.email || "").toLowerCase(), 120);
      const note = cleanHeader(String(body.note || ""), 500);
      if (name.length < 2) {
        return json({ ok: false, error: "Enter your name." }, 400, request);
      }
      if (!EMAIL_RE.test(email)) {
        return json({ ok: false, error: "Enter a valid email." }, 400, request);
      }

      const ip = request.headers.get("CF-Connecting-IP") || "unknown";
      const ipCount = await bump(env.SIGNUPS, `rl:ip:${ip}:${hourBucket()}`, 7200);
      if (ipCount > IP_LIMIT) {
        return json({ ok: false, error: "Too many requests. Try again later." }, 429, request);
      }
      const emailCount = await bump(env.SIGNUPS, `rl:em:${email}:${dayBucket()}`, 172800);
      if (emailCount > EMAIL_LIMIT) {
        return json({ ok: false, error: "That email already sent a request today." }, 429, request);
      }

      const id = crypto.randomUUID();
      const receivedAt = new Date().toISOString();
      const record = {
        id,
        name,
        email,
        note,
        receivedAt,
        ip,
      };
      ctx.waitUntil(
        env.SIGNUPS.put(`req:${receivedAt}:${id}`, JSON.stringify(record), {
          expirationTtl: 60 * 60 * 24 * 90,
        }),
      );

      const subject = `Account request: ${name}`;
      const text = [
        "New account request from smartrealty.us",
        "",
        `Name: ${name}`,
        `Email: ${email}`,
        note ? `Note: ${note}` : "Note: (none)",
        `When: ${receivedAt}`,
        `Request ID: ${id}`,
        "",
        "Reply to this email to reach the applicant.",
        "No password was collected. This is a request, not a live member login.",
      ].join("\n");
      const html = `
        <p>New account request from <a href="https://smartrealty.us">smartrealty.us</a></p>
        <ul>
          <li><strong>Name:</strong> ${escapeHtml(name)}</li>
          <li><strong>Email:</strong> ${escapeHtml(email)}</li>
          <li><strong>Note:</strong> ${note ? escapeHtml(note) : "(none)"}</li>
          <li><strong>When:</strong> ${escapeHtml(receivedAt)}</li>
          <li><strong>Request ID:</strong> ${escapeHtml(id)}</li>
        </ul>
        <p>Reply to this email to reach the applicant.</p>
        <p>No password was collected. This is a request, not a live member login.</p>
      `.trim();

      const delivered = await deliverEmail(env, { name, email, subject, text, html });
      console.log(
        JSON.stringify({
          message: "signup request",
          id,
          emailed: delivered.emailed,
          via: delivered.via,
        }),
      );

      return json(
        {
          ok: true,
          emailed: delivered.emailed,
          id,
          message: delivered.emailed
            ? "Request sent. We will email you when your account is ready."
            : "Request saved. We will follow up at this email.",
        },
        200,
        request,
      );
    } catch (error) {
      console.error(
        JSON.stringify({
          message: "unhandled signup error",
          error: error instanceof Error ? error.message : String(error),
        }),
      );
      return json({ ok: false, error: "Could not submit right now. Try again." }, 500, request);
    }
  },
} satisfies ExportedHandler<Env>;
