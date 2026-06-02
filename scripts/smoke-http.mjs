#!/usr/bin/env node

const baseUrl = (process.env.SMOKE_BASE_URL ?? "http://127.0.0.1:3000").replace(/\/$/, "");
const basicAuth = process.env.SMOKE_BASIC_AUTH;
const requireProductionSafe = process.env.SMOKE_REQUIRE_PRODUCTION_SAFE === "true";

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

const legacyHotelResponsePattern =
  /\b(?:hotel|perros|canino|vacunas|comida|visitas|residencia|qu[eé]\s+traer)\b/i;

async function request(path, init) {
  const headers = new Headers(init?.headers);
  if (basicAuth && !headers.has("authorization")) {
    headers.set("authorization", `Basic ${basicAuth}`);
  }

  const response = await fetch(`${baseUrl}${path}`, { ...init, headers });
  const text = await response.text();
  return { response, text };
}

async function checkGet(path) {
  const { response, text } = await request(path);
  assert(response.ok, `${path} devolvio ${response.status}: ${text.slice(0, 240)}`);
  assert(text.length > 0, `${path} respondio vacio`);
  console.log(`[ok] GET ${path}`);
  return text;
}

async function checkHealth() {
  const { response, text } = await request("/api/health");
  assert(response.ok, `/api/health devolvio ${response.status}: ${text}`);

  let json;
  try {
    json = JSON.parse(text);
  } catch {
    throw new Error(`/api/health no devolvio JSON valido: ${text}`);
  }

  assert(json.ok === true, "Health debe devolver ok=true en el smoke seguro.");
  assert(json.app === "Maternaly", `Health app inesperada: ${json.app}`);
  if (requireProductionSafe) {
    assert(json.database?.configured === true, "DATABASE_URL debe estar configurado para smoke production-like.");
    assert(json.database?.reachable === true, "La base de datos debe ser alcanzable para smoke production-like.");
    assert(json.whatsapp?.provider === "mock", "El smoke seguro debe ejecutarse con WHATSAPP_PROVIDER=mock.");
    assert(json.googleSheets?.accessMode === "read_only", "El smoke seguro debe usar Sheets read_only.");
    assert(json.googleSheets?.writeEnabled === false, "La escritura real en Sheets debe estar bloqueada.");
    assert(json.llm?.provider === "mock", "El smoke seguro debe ejecutarse con LLM_PROVIDER=mock.");
  }
  console.log("[ok] GET /api/health");
}

async function checkOpsRedirect() {
  const { response } = await request("/ops", { redirect: "manual" });
  assert(
    response.status === 307 || response.status === 308,
    `/ops debe redirigir al panel y devolvio ${response.status}`,
  );

  const location = response.headers.get("location") ?? "";
  assert(
    location === "/admin/conversations" || location.endsWith("/admin/conversations"),
    `/ops redirigio a destino inesperado: ${location}`,
  );
  console.log("[ok] GET /ops -> /admin/conversations");
}

async function checkYCloudWebhookEndpoint() {
  const suffix = String(Date.now()).slice(-8);
  const payload = {
    id: `ycloud_smoke_${suffix}`,
    from: `+346${suffix}`,
    to: "+34944000000",
    text: "Hola, quiero informacion sobre AIPAP Agua",
    type: "text",
  };

  const { response, text } = await request("/api/webhooks/ycloud", {
    method: "POST",
    headers: {
      "content-type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  if (response.status === 401) {
    console.log("[skip] POST /api/webhooks/ycloud requiere firma configurada");
    return;
  }

  assert(response.ok, `/api/webhooks/ycloud devolvio ${response.status}: ${text}`);

  const json = JSON.parse(text);
  assert(json.ok === true, "/api/webhooks/ycloud no devolvio ok=true");
  assert(json.provider === "ycloud", "El webhook debe normalizar provider=ycloud");
  assert(typeof json.conversationId === "string" && json.conversationId.length > 0, "Falta conversationId");
  console.log("[ok] POST /api/webhooks/ycloud");
}

async function checkTwilioWebhookEndpoint() {
  const suffix = String(Date.now()).slice(-8);
  const token = process.env.TWILIO_WEBHOOK_AUTH_TOKEN;
  const url = token
    ? `/api/twilio/whatsapp?token=${encodeURIComponent(token)}`
    : "/api/twilio/whatsapp";
  const cases = [
    ["hola", "Maternaly"],
    ["Pilates", "Pilates"],
    ["Quiero reservar Test ADN", "18:20"],
  ];

  for (const [body, expected] of cases) {
    const payload = new URLSearchParams({
      From: `whatsapp:+346${suffix}`,
      To: "whatsapp:+14155238886",
      Body: body,
      MessageSid: `SM_SMOKE_${suffix}_${body.length}`,
      ProfileName: "Smoke Sandbox",
    });

    const { response, text } = await request(url, {
      method: "POST",
      headers: {
        "content-type": "application/x-www-form-urlencoded",
      },
      body: payload,
    });

    if (response.status === 401) {
      console.log("[skip] POST /api/twilio/whatsapp requiere TWILIO_WEBHOOK_AUTH_TOKEN");
      return;
    }

    assert(response.ok, `/api/twilio/whatsapp devolvio ${response.status}: ${text}`);
    assert(text.includes("<Response>"), "/api/twilio/whatsapp no devolvio TwiML Response");
    assert(text.includes("<Message>"), "/api/twilio/whatsapp no devolvio TwiML Message");
    assert(text.includes(expected), `/api/twilio/whatsapp no devolvio ${expected}`);
    assert(
      !legacyHotelResponsePattern.test(text),
      "/api/twilio/whatsapp devolvio texto heredado de hotel/perros",
    );
    assert(
      response.headers.get("content-type")?.includes("text/xml"),
      "/api/twilio/whatsapp debe devolver text/xml",
    );
  }
  console.log("[ok] POST /api/twilio/whatsapp multi-turn");
}

async function main() {
  console.log(`Smoke HTTP Maternaly contra ${baseUrl}`);

  await checkGet("/");
  await checkHealth();
  await checkOpsRedirect();
  await checkGet("/admin/conversations");
  await checkTwilioWebhookEndpoint();
  await checkYCloudWebhookEndpoint();

  console.log("[ok] Smoke HTTP Maternaly completado sin WhatsApp real ni escritura real en Sheets");
}

main().catch((error) => {
  console.error(`[fail] ${error.message}`);
  process.exitCode = 1;
});
