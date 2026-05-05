#!/usr/bin/env node

const baseUrl = (process.env.SMOKE_BASE_URL ?? "http://127.0.0.1:3000").replace(/\/$/, "");

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
  const response = await fetch(`${baseUrl}${path}`, init);
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

  assert(json.status === "disponible", `Se esperaba status "disponible" y llegó ${json.status}`);
  assert(json.availability?.isAvailable === true, "La disponibilidad debería ser true");
  assert(typeof json.whatsappMessage === "string" && json.whatsappMessage.trim().length > 0, "Falta el mensaje de WhatsApp");
  assert(json.sheetWritePlan?.prepared === true, "Falta el plan de escritura para Sheets");
  console.log("[ok] POST /api/demo/process");
  console.log(`[ok] status=${json.status} price=${json.pricing?.total ?? "n/a"}`);
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

  console.log("[ok] Smoke HTTP completado");
}

main().catch((error) => {
  console.error(`[fail] ${error.message}`);
  process.exitCode = 1;
});
