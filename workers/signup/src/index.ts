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
const MAX_RECONSTRUCTION_BODY_BYTES = 4_000;
const RECONSTRUCTION_LIMIT = 6;
const RECONSTRUCTION_CACHE_SECONDS = 60 * 60 * 24 * 7;
const CANONICAL_SITE = "https://smartrealty.us";

type AppEnv = Env & { OPENAI_API_KEY?: string };

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
  phone?: unknown;
  city?: unknown;
  state?: unknown;
  intent?: unknown;
};

type ReconstructionBody = {
  imageUrl?: unknown;
  listingId?: unknown;
  roomType?: unknown;
};

type RoomAnalysis = {
  sceneKind: "interior" | "exterior" | "unusable";
  roomType: "living" | "bedroom" | "dining" | "kitchen" | "office" | "other";
  confidence: "low" | "moderate" | "high";
  width: number;
  depth: number;
  height: number;
  floorFinish: "oak" | "dark-wood" | "tile" | "carpet" | "concrete" | "other";
  walls: Array<{ id: "north" | "west" | "east" | "south"; windows: number; door: boolean }>;
  notes: string;
};

type ReconstructedRoom = {
  mode: "vision" | "fallback";
  estimated: true;
  label: string;
  roomType: string;
  width: number;
  depth: number;
  height: number;
  photoUrl: string;
  sourcePhotoUrl: string;
  walls: Array<{ id: string; role: "wall"; windows: number; door: boolean }>;
  floor: { role: "floor"; finish: string };
  ceiling: { role: "ceiling" };
  objects: never[];
  analysis: {
    sceneKind: RoomAnalysis["sceneKind"];
    confidence: RoomAnalysis["confidence"];
    notes: string;
  };
};

const INTENTS: Record<string, string> = {
  browse: "Browse homes / Blue Book",
  buy: "Buy",
  sell: "Sell / list",
  rent: "Rent / stay",
  services: "Digital services / listing copy",
  dcw: "Daily Cache Wiper",
  bitcoin: "Bitcoin / node",
  investor: "Investor",
  other: "Other",
};

function cleanPhone(value: string): string {
  return value.replace(/[^\d+().\-\s]/g, "").replace(/\s+/g, " ").trim().slice(0, 32);
}

function cleanState(value: string): string {
  const s = cleanHeader(value, 40).toUpperCase();
  return s.length === 2 ? s : s.slice(0, 40);
}

function cleanIntent(value: string): string {
  const key = cleanHeader(value, 40).toLowerCase();
  return INTENTS[key] ? key : "";
}

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

const ROOM_ANALYSIS_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["sceneKind", "roomType", "confidence", "width", "depth", "height", "floorFinish", "walls", "notes"],
  properties: {
    sceneKind: { type: "string", enum: ["interior", "exterior", "unusable"] },
    roomType: { type: "string", enum: ["living", "bedroom", "dining", "kitchen", "office", "other"] },
    confidence: { type: "string", enum: ["low", "moderate", "high"] },
    width: { type: "number", minimum: 2.4, maximum: 15 },
    depth: { type: "number", minimum: 2.4, maximum: 15 },
    height: { type: "number", minimum: 2.1, maximum: 6 },
    floorFinish: { type: "string", enum: ["oak", "dark-wood", "tile", "carpet", "concrete", "other"] },
    walls: {
      type: "array",
      minItems: 4,
      maxItems: 4,
      items: {
        type: "object",
        additionalProperties: false,
        required: ["id", "windows", "door"],
        properties: {
          id: { type: "string", enum: ["north", "west", "east", "south"] },
          windows: { type: "integer", minimum: 0, maximum: 4 },
          door: { type: "boolean" },
        },
      },
    },
    notes: { type: "string", maxLength: 240 },
  },
} as const;

function record(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function outputText(payload: unknown): string {
  const root = record(payload);
  if (!root) return "";
  if (typeof root.output_text === "string") return root.output_text;
  if (!Array.isArray(root.output)) return "";
  for (const item of root.output) {
    const message = record(item);
    if (!message || !Array.isArray(message.content)) continue;
    for (const part of message.content) {
      const content = record(part);
      if (content && content.type === "output_text" && typeof content.text === "string") return content.text;
    }
  }
  return "";
}

function clampNumber(value: unknown, min: number, max: number, fallback: number): number {
  const number = typeof value === "number" && Number.isFinite(value) ? value : fallback;
  return Math.round(Math.min(max, Math.max(min, number)) * 100) / 100;
}

function safeListingImage(value: unknown): string | null {
  const raw = String(value || "").trim();
  if (!raw || raw.length > 500) return null;
  let url: URL;
  try {
    url = new URL(raw, `${CANONICAL_SITE}/`);
  } catch {
    return null;
  }
  if (url.protocol !== "https:" || !["smartrealty.us", "www.smartrealty.us"].includes(url.hostname)) return null;
  if (!url.pathname.startsWith("/images/") || !/\.(jpe?g|png|webp)$/i.test(url.pathname)) return null;
  url.hostname = "smartrealty.us";
  return url.toString();
}

async function imageCacheKey(imageUrl: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(imageUrl));
  const hex = Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
  return `room:v1:${hex}`;
}

function fallbackRoom(imageUrl: string, reason: string): ReconstructedRoom {
  return {
    mode: "fallback",
    estimated: true,
    label: reason,
    roomType: "living",
    width: 6.4,
    depth: 5.2,
    height: 2.72,
    photoUrl: "",
    sourcePhotoUrl: imageUrl,
    walls: [
      { id: "north", role: "wall", windows: 0, door: false },
      { id: "west", role: "wall", windows: 2, door: false },
      { id: "east", role: "wall", windows: 1, door: false },
      { id: "south", role: "wall", windows: 0, door: true },
    ],
    floor: { role: "floor", finish: "oak" },
    ceiling: { role: "ceiling" },
    objects: [],
    analysis: { sceneKind: "unusable", confidence: "low", notes: reason },
  };
}

function normalizeAnalysis(value: unknown): RoomAnalysis | null {
  const data = record(value);
  if (!data) return null;
  const sceneKinds = new Set(["interior", "exterior", "unusable"]);
  const roomTypes = new Set(["living", "bedroom", "dining", "kitchen", "office", "other"]);
  const confidences = new Set(["low", "moderate", "high"]);
  const finishes = new Set(["oak", "dark-wood", "tile", "carpet", "concrete", "other"]);
  if (!sceneKinds.has(String(data.sceneKind)) || !roomTypes.has(String(data.roomType))) return null;
  if (!confidences.has(String(data.confidence)) || !finishes.has(String(data.floorFinish))) return null;
  const rawWalls = data.walls;
  if (!Array.isArray(rawWalls) || rawWalls.length !== 4) return null;
  const wallIds = ["north", "west", "east", "south"] as const;
  const walls = wallIds.map((id) => {
    const found = rawWalls.map((wall: unknown) => record(wall)).find((wall) => wall?.id === id);
    return {
      id,
      windows: Math.round(clampNumber(found?.windows, 0, 4, 0)),
      door: found?.door === true,
    };
  });
  return {
    sceneKind: String(data.sceneKind) as RoomAnalysis["sceneKind"],
    roomType: String(data.roomType) as RoomAnalysis["roomType"],
    confidence: String(data.confidence) as RoomAnalysis["confidence"],
    width: clampNumber(data.width, 2.4, 15, 6.4),
    depth: clampNumber(data.depth, 2.4, 15, 5.2),
    height: clampNumber(data.height, 2.1, 6, 2.72),
    floorFinish: String(data.floorFinish) as RoomAnalysis["floorFinish"],
    walls,
    notes: cleanHeader(String(data.notes || ""), 240),
  };
}

async function analyzeRoomPhoto(imageUrl: string, env: AppEnv): Promise<RoomAnalysis> {
  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${env.OPENAI_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: env.OPENAI_MODEL || "gpt-5.4-mini",
      store: false,
      max_output_tokens: 900,
      input: [
        {
          role: "user",
          content: [
            {
              type: "input_text",
              text: "Analyze this real-estate listing photo for an editable 3D planning preview. Determine whether it is an interior. For an interior, conservatively estimate rectangular room width, depth, and height in meters, classify the room and floor, and count visible or strongly implied windows and doors across four logical walls. A single photo cannot prove dimensions, so use moderate or low confidence unless spatial cues are unusually strong. For an exterior or unusable image, classify it honestly and return safe default dimensions 6.4 by 5.2 by 2.72 meters. Do not identify people, infer private information, or claim architectural accuracy.",
            },
            { type: "input_image", image_url: imageUrl, detail: "high" },
          ],
        },
      ],
      text: {
        format: {
          type: "json_schema",
          name: "room_reconstruction",
          strict: true,
          schema: ROOM_ANALYSIS_SCHEMA,
        },
      },
    }),
  });
  const payload: unknown = await response.json();
  if (!response.ok) {
    const root = record(payload);
    const apiError = record(root?.error);
    throw new Error(`OpenAI room analysis failed (${response.status}): ${cleanHeader(String(apiError?.message || "request failed"), 160)}`);
  }
  const text = outputText(payload);
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error("OpenAI room analysis returned invalid JSON");
  }
  const analysis = normalizeAnalysis(parsed);
  if (!analysis) throw new Error("OpenAI room analysis did not match the expected schema");
  return analysis;
}

function roomFromAnalysis(imageUrl: string, analysis: RoomAnalysis): ReconstructedRoom {
  if (analysis.sceneKind !== "interior") {
    const label = analysis.sceneKind === "exterior"
      ? "Exterior photo detected — showing a sample room. Choose an interior photo for reconstruction."
      : "Photo could not be analyzed — showing a sample room.";
    const room = fallbackRoom(imageUrl, label);
    room.analysis = { sceneKind: analysis.sceneKind, confidence: analysis.confidence, notes: analysis.notes || label };
    return room;
  }
  return {
    mode: "vision",
    estimated: true,
    label: `AI-estimated ${analysis.roomType} from one listing photo — not an architectural measurement.`,
    roomType: analysis.roomType,
    width: analysis.width,
    depth: analysis.depth,
    height: analysis.height,
    photoUrl: imageUrl,
    sourcePhotoUrl: imageUrl,
    walls: analysis.walls.map((wall) => ({ ...wall, role: "wall" as const })),
    floor: { role: "floor", finish: analysis.floorFinish },
    ceiling: { role: "ceiling" },
    objects: [],
    analysis: {
      sceneKind: analysis.sceneKind,
      confidence: analysis.confidence,
      notes: analysis.notes,
    },
  };
}

async function handleReconstruction(request: Request, env: AppEnv, ctx: ExecutionContext): Promise<Response> {
  if (request.method === "GET") return json({ ok: true, service: "room-reconstruction" }, 200, request);
  if (request.method !== "POST") return json({ ok: false, error: "Method not allowed" }, 405, request);
  const length = Number(request.headers.get("Content-Length") || "0");
  if (length > MAX_RECONSTRUCTION_BODY_BYTES) return json({ ok: false, error: "Request too large" }, 413, request);

  const rawText = await request.text();
  if (rawText.length > MAX_RECONSTRUCTION_BODY_BYTES) return json({ ok: false, error: "Request too large" }, 413, request);
  let body: ReconstructionBody;
  try {
    body = rawText ? (JSON.parse(rawText) as ReconstructionBody) : {};
  } catch {
    return json({ ok: false, error: "Invalid JSON" }, 400, request);
  }

  const imageUrl = safeListingImage(body.imageUrl);
  if (!imageUrl) return json({ ok: false, error: "Choose a Smart Realty listing photo." }, 400, request);
  if (!env.OPENAI_API_KEY) {
    return json({ ok: false, error: "Photo analysis is temporarily unavailable.", room: fallbackRoom(imageUrl, "Photo analysis unavailable — showing a sample room.") }, 503, request);
  }

  const ip = request.headers.get("CF-Connecting-IP") || "unknown";
  const ipCount = await bump(env.SIGNUPS, `rl:room:${ip}:${hourBucket()}`, 7200);
  if (ipCount > RECONSTRUCTION_LIMIT) {
    return json({ ok: false, error: "Photo analysis limit reached. Try again later." }, 429, request);
  }

  const cacheKey = await imageCacheKey(imageUrl);
  const cached = await env.SIGNUPS.get(cacheKey);
  if (cached) {
    try {
      return json({ ok: true, cached: true, room: JSON.parse(cached) as ReconstructedRoom }, 200, request);
    } catch {
      // Ignore a malformed cache entry and refresh it.
    }
  }

  try {
    const analysis = await analyzeRoomPhoto(imageUrl, env);
    const room = roomFromAnalysis(imageUrl, analysis);
    ctx.waitUntil(env.SIGNUPS.put(cacheKey, JSON.stringify(room), { expirationTtl: RECONSTRUCTION_CACHE_SECONDS }));
    console.log(JSON.stringify({ message: "room photo analyzed", listingId: cleanHeader(String(body.listingId || ""), 80), sceneKind: analysis.sceneKind, confidence: analysis.confidence }));
    return json({ ok: true, cached: false, room }, 200, request);
  } catch (error) {
    console.error(JSON.stringify({ message: "room photo analysis failed", error: error instanceof Error ? error.message : String(error) }));
    return json({ ok: false, error: "Could not analyze this photo right now.", room: fallbackRoom(imageUrl, "Photo analysis failed — showing a sample room.") }, 502, request);
  }
}

export default {
  async fetch(request: Request, env: AppEnv, ctx: ExecutionContext): Promise<Response> {
    try {
      if (request.method === "OPTIONS") {
        return new Response(null, { status: 204, headers: corsHeaders(request) });
      }

      const url = new URL(request.url);
      const path = url.pathname.replace(/\/+$/, "") || "/";
      const isReconstruction = path === "/api/shop/reconstruct" || path === "/shop/reconstruct";
      if (isReconstruction) return handleReconstruction(request, env, ctx);
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
      const phone = cleanPhone(String(body.phone || ""));
      const city = cleanHeader(String(body.city || ""), 80);
      const state = cleanState(String(body.state || ""));
      const intent = cleanIntent(String(body.intent || ""));
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
        phone,
        city,
        state,
        intent,
        note,
        receivedAt,
        ip,
      };
      ctx.waitUntil(
        env.SIGNUPS.put(`req:${receivedAt}:${id}`, JSON.stringify(record), {
          expirationTtl: 60 * 60 * 24 * 90,
        }),
      );

      const intentLabel = intent ? INTENTS[intent] : "(none)";
      const subject = `Account request: ${name}${intent ? ` (${intentLabel})` : ""}`;
      const text = [
        "New account request from smartrealty.us",
        "",
        `Name: ${name}`,
        `Email: ${email}`,
        `Phone: ${phone || "(none)"}`,
        `City: ${city || "(none)"}`,
        `State: ${state || "(none)"}`,
        `Intent: ${intentLabel}`,
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
          <li><strong>Phone:</strong> ${phone ? escapeHtml(phone) : "(none)"}</li>
          <li><strong>City:</strong> ${city ? escapeHtml(city) : "(none)"}</li>
          <li><strong>State:</strong> ${state ? escapeHtml(state) : "(none)"}</li>
          <li><strong>Intent:</strong> ${escapeHtml(intentLabel)}</li>
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
          message: "unhandled worker error",
          error: error instanceof Error ? error.message : String(error),
        }),
      );
      return json({ ok: false, error: "Could not complete this request right now. Try again." }, 500, request);
    }
  },
} satisfies ExportedHandler<AppEnv>;
