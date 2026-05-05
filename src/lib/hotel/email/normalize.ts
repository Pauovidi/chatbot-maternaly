import { createHash } from "node:crypto";

import { normalizeWhitespace, stripHtml } from "./text";
import type { EmailSourceMessage, NormalizedEmailContent } from "./types";

function decodeQuotedPrintable(input: string) {
  return input
    .replace(/=\r?\n/g, "")
    .replace(/=([0-9A-F]{2})/gi, (_match, hex: string) =>
      String.fromCharCode(Number.parseInt(hex, 16)),
    );
}

function decodeBase64(input: string) {
  return Buffer.from(input.replace(/\s+/g, ""), "base64").toString("utf8");
}

function extractMimeBody(rawText: string) {
  const normalized = rawText.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  const plainTextMatch = normalized.match(
    /Content-Type:\s*text\/plain[\s\S]*?Content-Transfer-Encoding:\s*base64\s*\n\n([\s\S]*?)(?=\n--[_A-Za-z0-9=-]+|\nContent-Type:|\s*$)/i,
  );

  if (plainTextMatch?.[1]) {
    return normalizeWhitespace(decodeBase64(plainTextMatch[1]));
  }

  const htmlBase64Match = normalized.match(
    /Content-Type:\s*text\/html[\s\S]*?Content-Transfer-Encoding:\s*base64\s*\n\n([\s\S]*?)(?=\n--[_A-Za-z0-9=-]+|\nContent-Type:|\s*$)/i,
  );

  if (htmlBase64Match?.[1]) {
    return normalizeWhitespace(stripHtml(decodeBase64(htmlBase64Match[1])));
  }

  const qpHtmlMatch = normalized.match(
    /Content-Type:\s*text\/html[\s\S]*?Content-Transfer-Encoding:\s*quoted-printable\s*\n\n([\s\S]*?)(?=\n--[_A-Za-z0-9=-]+|\nContent-Type:|\s*$)/i,
  );

  if (qpHtmlMatch?.[1]) {
    return normalizeWhitespace(stripHtml(decodeQuotedPrintable(qpHtmlMatch[1])));
  }

  if (/<html[\s>]/i.test(normalized) || /<body[\s>]/i.test(normalized)) {
    return normalizeWhitespace(stripHtml(normalized));
  }

  return normalizeWhitespace(normalized);
}

function scoreReservationSignal(text: string, subject?: string, from?: string) {
  const haystack = `${subject ?? ""}\n${from ?? ""}\n${text}`.toLowerCase();
  const markers = [
    "reserva",
    "reservas",
    "hotel",
    "perro",
    "perros",
    "gespet",
    "cliente:",
    "fecha entrada",
    "fecha salida",
    "animales:",
    "solicitud de reserva",
  ];

  return markers.reduce((total, marker) => total + (haystack.includes(marker) ? 1 : 0), 0);
}

export function normalizeIncomingEmailContent(
  message: Pick<EmailSourceMessage, "subject" | "from" | "rawText">,
): NormalizedEmailContent {
  const normalizedSubject = normalizeWhitespace(message.subject);
  const normalizedText = extractMimeBody(message.rawText);
  const reasons: string[] = [];

  if (normalizedText !== normalizeWhitespace(message.rawText)) {
    reasons.push("mime_body_normalized");
  }

  if (scoreReservationSignal(normalizedText, normalizedSubject, message.from) < 2) {
    reasons.push("low_reservation_signal");
  }

  const fingerprint = createHash("sha256")
    .update(normalizedSubject)
    .update("\n")
    .update(message.from ?? "")
    .update("\n")
    .update(normalizedText)
    .digest("hex");

  return {
    subject: normalizedSubject,
    rawText: message.rawText,
    normalizedText,
    fingerprint,
    reasons,
    parserInput: {
      subject: normalizedSubject,
      rawText: normalizedText,
    },
  };
}
