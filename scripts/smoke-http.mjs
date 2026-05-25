#!/usr/bin/env node

const baseUrl = (process.env.SMOKE_BASE_URL ?? "http://127.0.0.1:3000").replace(/\/$/, "");
const basicAuth = process.env.SMOKE_BASIC_AUTH;

const sampleEmail = `Asunto: Solicitud de reserva web

Hola,
Quería reservar para Luna, una golden retriever muy tranquila.
Soy Ana López y mi teléfono es 612 345 678.
Entrada: 12/04/2026 por la mañana.
Salida: 15/04/2026 por la tarde.
Sería 1 perro.
Notas: trae su manta y come pienso propio.
`;

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

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
  assert(response.ok, `${path} devolvió ${response.status}`);
  assert(text.length > 0, `${path} respondió vacío`);
  console.log(`[ok] GET ${path}`);
}

async function checkProcessEndpoint() {
  const { response, text } = await request("/api/demo/process", {
    method: "POST",
    headers: {
      "content-type": "application/json",
    },
    body: JSON.stringify({
      subject: "Smoke demo",
      rawText: sampleEmail,
    }),
  });

  assert(response.ok, `/api/demo/process devolvió ${response.status}: ${text}`);

  let json;
  try {
    json = JSON.parse(text);
  } catch {
    throw new Error(`La respuesta de /api/demo/process no es JSON válido: ${text}`);
  }

  assert(
    ["disponible", "confirmada"].includes(json.status),
    `Se esperaba status "disponible" o "confirmada" y llegó ${json.status}`,
  );
  assert(json.availability?.isAvailable === true, "La disponibilidad debería ser true");
  assert(typeof json.whatsappMessage === "string" && json.whatsappMessage.trim().length > 0, "Falta el mensaje de WhatsApp");
  assert(json.sheetWritePlan?.prepared === true, "Falta el plan de escritura para Sheets");
  console.log("[ok] POST /api/demo/process");
  console.log(`[ok] status=${json.status} price=${json.pricing?.total ?? "n/a"}`);
}

async function checkTwilioWebhookEndpoint() {
  const sid = `SM_SMOKE_HTTP_${Date.now()}`;
  const params = new URLSearchParams({
    From: "whatsapp:+34600000901",
    To: "whatsapp:+14155238886",
    Body: "Hola, quiero hablar con una persona",
    MessageSid: sid,
  });
  const token = process.env.TWILIO_WEBHOOK_AUTH_TOKEN;
  const path = token
    ? `/api/twilio/whatsapp?token=${encodeURIComponent(token)}`
    : "/api/twilio/whatsapp";
  const { response, text } = await request(path, {
    method: "POST",
    headers: {
      "content-type": "application/x-www-form-urlencoded",
    },
    body: params,
  });

  assert(response.ok, `/api/twilio/whatsapp devolvió ${response.status}: ${text}`);
  assert(text.startsWith('<?xml version="1.0" encoding="UTF-8"?>'), "Twilio no devolvió XML");
  assert(text.includes("<Response>") && text.includes("</Response>"), "Twilio no devolvió TwiML Response");
  assert(text.includes("<Message>"), "Twilio no devolvió respuesta de handoff");
  console.log("[ok] POST /api/twilio/whatsapp");

  const { response: listResponse, text: listText } = await request(
    "/api/conversations?query=34600000901",
  );
  assert(listResponse.ok, `/api/conversations devolvió ${listResponse.status}: ${listText}`);

  const json = JSON.parse(listText);
  assert(json.ok === true, "/api/conversations no devolvió ok=true");
  assert(
    json.conversations?.some(
      (conversation) =>
        conversation.phoneNormalized === "34600000901" &&
        conversation.mode === "human" &&
        conversation.events?.some((event) => event.eventType === "human_requested"),
    ),
    "La conversación Twilio smoke no aparece como handoff humano",
  );
  console.log("[ok] GET /api/conversations Twilio handoff");
}

async function main() {
  console.log(`Smoke HTTP contra ${baseUrl}`);

  await checkGet("/");
  await checkGet("/demo");
  await checkGet("/ops");
  await checkGet("/internal");
  await checkGet("/faq-demo");
  await checkGet("/reservas-demo");
  await checkGet("/admin");
  await checkProcessEndpoint();
  await checkTwilioWebhookEndpoint();

  console.log("[ok] Smoke HTTP completado");
}

main().catch((error) => {
  console.error(`[fail] ${error.message}`);
  process.exitCode = 1;
});
