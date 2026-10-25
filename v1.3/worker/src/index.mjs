/* Rug Rush assistant API: answers player questions with Claude Haiku 5.5, using the game snapshot sent by the client. */

import Anthropic from "@anthropic-ai/sdk";
import { SYSTEM } from "./prompt.mjs";

const MODEL = "claude-haiku-5-5";
const PRICE = { in: 0.1, out: 0.5 };
const ORIGINS = [/^https:\/\/rugs\.gzowo\.fun$/, /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/];
const PER_IP = 30;
const WINDOW_S = 600;

function cors(req) {
  const o = req.headers.get("origin") || "";
  return {
    "access-control-allow-origin": ORIGINS.some((r) => r.test(o)) ? o : "https://rugs.gzowo.fun",
    "access-control-allow-headers": "content-type",
    "access-control-allow-methods": "POST, GET, OPTIONS",
    "vary": "origin",
  };
}

function json(req, obj, status = 200) {
  return new Response(JSON.stringify(obj), { status, headers: Object.assign({ "content-type": "application/json" }, cors(req)) });
}

function day() {
  return new Date().toISOString().slice(0, 10);
}

async function spent(env) {
  return parseFloat((await env.LIMITS.get("usd:" + day())) || "0");
}

async function addSpent(env, usd) {
  const s = await spent(env);
  await env.LIMITS.put("usd:" + day(), String(s + usd), { expirationTtl: 172800 });
}

function usdOf(u) {
  return ((u.input_tokens || 0) * PRICE.in + (u.output_tokens || 0) * PRICE.out + (u.cache_read_input_tokens || 0) * PRICE.in * 0.1 + (u.cache_creation_input_tokens || 0) * PRICE.in * 1.25) / 1e6;
}

async function overIpLimit(req, env) {
  const ip = req.headers.get("cf-connecting-ip") || "anon";
  const key = `ip:${ip}:${Math.floor(Date.now() / 1000 / WINDOW_S)}`;
  const n = parseInt((await env.LIMITS.get(key)) || "0", 10);
  if (n >= PER_IP) return true;
  await env.LIMITS.put(key, String(n + 1), { expirationTtl: WINDOW_S * 2 });
  return false;
}

function clip(s, n) {
  return String(s ?? "").slice(0, n);
}

function userText(body) {
  const chat = Array.isArray(body.chat) ? body.chat.slice(-3) : [];
  const parts = [];
  if (chat.length) parts.push("Earlier in this chat:\n" + chat.map((c) => `Player: ${clip(c.q, 400)}\nRug Buddy: ${clip(c.a, 700)}`).join("\n"));
  parts.push("Game snapshot (JSON):\n" + clip(JSON.stringify(body.state ?? {}), 24000));
  parts.push("Player question: " + clip(body.q, 500));
  return parts.join("\n\n");
}

async function ask(req, env) {
  let body;
  try {
    body = await req.json();
  } catch (e) {
    return json(req, { error: "Bad request." }, 400);
  }
  if (!body || typeof body.q !== "string" || !body.q.trim()) return json(req, { error: "Ask something first." }, 400);
  const budget = parseFloat(env.DAILY_USD || "1");
  if ((await spent(env)) >= budget) return json(req, { error: "Rug Buddy is out of breath for today. Try again tomorrow!" }, 429);
  if (await overIpLimit(req, env)) return json(req, { error: "Easy there! Too many questions, wait a few minutes." }, 429);
  const client = new Anthropic({ apiKey: env.ANTHROPIC_API_KEY, maxRetries: 1, timeout: 30000 });
  try {
    const msg = await client.messages.create({
      model: MODEL,
      max_tokens: 2000,
      output_config: { effort: "medium" },
      system: [{ type: "text", text: SYSTEM, cache_control: { type: "ephemeral" } }],
      messages: [{ role: "user", content: userText(body) }],
    });
    await addSpent(env, usdOf(msg.usage || {}));
    if (msg.stop_reason === "refusal") return json(req, { answer: "I can't help with that one. Ask me about rugs!" });
    const answer = msg.content.filter((b) => b.type === "text").map((b) => b.text).join("").trim();
    return json(req, { answer: answer || "Hmm, I lost my train of thought. Ask again?", usage: { in: msg.usage?.input_tokens, cached: msg.usage?.cache_read_input_tokens, out: msg.usage?.output_tokens } });
  } catch (e) {
    if (e instanceof Anthropic.RateLimitError) return json(req, { error: "Rug Buddy is busy. Try again in a moment." }, 429);
    if (e instanceof Anthropic.APIError) return json(req, { error: "Rug Buddy hit a snag: " + (e.message || e.status) }, 502);
    return json(req, { error: "Rug Buddy is offline right now." }, 502);
  }
}

export default {
  async fetch(req, env) {
    const path = new URL(req.url).pathname.replace(/\/+$/, "");
    if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: cors(req) });
    if (path === "/health") return json(req, { ok: true, haveKey: !!env.ANTHROPIC_API_KEY, spent: +(await spent(env)).toFixed(4), budget: parseFloat(env.DAILY_USD || "1") });
    if (path === "/ask" && req.method === "POST") return ask(req, env);
    return json(req, { error: "Not found." }, 404);
  },
};
