// Sends web push notifications. The database decides who to notify and calls
// this function with everything it needs, so the function keeps no secrets of
// its own: each request carries the shared secret (checked against the
// database), the signing keys, the subscriptions and the message.
//
// POST { init: true }                           generate signing keys, once
// POST { vapid, subscriptions, payload }        send `payload` to each subscription
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import webpush from "npm:web-push@3.6.7";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;

async function rpc(name: string, args: Record<string, unknown>) {
  const response = await fetch(`${SUPABASE_URL}/rest/v1/rpc/${name}`, {
    method: "POST",
    headers: { apikey: ANON_KEY, Authorization: `Bearer ${ANON_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify(args),
  });
  if (!response.ok) throw new Error(`${name} failed: ${response.status}`);
  return response.json().catch(() => null);
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

Deno.serve(async (req: Request) => {
  if (req.method !== "POST") return json({ error: "POST only" }, 405);
  const secret = req.headers.get("x-push-secret") ?? "";
  let body: any;
  try {
    body = await req.json();
  } catch {
    return json({ error: "Bad request" }, 400);
  }

  try {
    if (body?.init) {
      // push_init checks the secret itself and keeps the first keys it is given.
      const keys = webpush.generateVAPIDKeys();
      const publicKey = await rpc("push_init", { p_secret: secret, p_public: keys.publicKey, p_private: keys.privateKey });
      return json({ public: publicKey });
    }

    if (!(await rpc("push_check", { p_secret: secret }))) return json({ error: "Not allowed" }, 401);

    const { vapid, subscriptions, payload } = body ?? {};
    if (!vapid?.public || !vapid?.private || !Array.isArray(subscriptions) || !payload) {
      return json({ error: "Bad request" }, 400);
    }

    const message = JSON.stringify(payload);
    const options = {
      vapidDetails: { subject: vapid.subject, publicKey: vapid.public, privateKey: vapid.private },
      TTL: 60 * 60 * 12,
      urgency: "high" as const,
    };
    const results = await Promise.allSettled(subscriptions.map((s: any) =>
      webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, message, options)));

    // 404 and 410 mean the subscription is gone for good.
    const gone: string[] = [];
    const failed: { status?: number; reason: string }[] = [];
    results.forEach((result, i) => {
      if (result.status === "fulfilled") return;
      const status = result.reason?.statusCode;
      if (status === 404 || status === 410) gone.push(subscriptions[i].endpoint);
      else failed.push({ status, reason: String(result.reason?.body || result.reason?.message || result.reason).slice(0, 200) });
    });
    if (gone.length) await rpc("push_gone", { p_secret: secret, p_endpoints: gone });

    return json({ sent: results.length - gone.length - failed.length, gone: gone.length, failed });
  } catch (error) {
    return json({ error: String((error as Error)?.message ?? error).slice(0, 300) }, 500);
  }
});
