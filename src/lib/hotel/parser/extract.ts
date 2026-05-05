import { normalizeReservationMoment } from "../date-normalization";
import type { ParsedReservationPet, ParsedReservationDraft } from "../domain/contracts";
import { normalizePhoneForIdentifier } from "../domain/identifiers";
import type { ReservationReviewFlag } from "../domain/states";

export interface ParsedEmailMeta {
  decodedText: string;
  reservationBlock: string;
  assumptions: string[];
  extractedFields: Record<string, string | number | boolean | undefined>;
}

export interface ParsedEmailResult {
  draft: ParsedReservationDraft;
  meta: ParsedEmailMeta;
}

function cleanText(value: string): string {
  return value
    .replace(/\r/g, "")
    .replace(/\u00a0/g, " ")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function maybeDecodeBase64PlainText(rawText: string): string {
  const match = rawText.match(
    /Content-Type:\s*text\/plain[\s\S]*?Content-Transfer-Encoding:\s*base64\s+([\s\S]*?)(?=\n--[_A-Za-z0-9=:-]+|\nContent-Type:|\Z)/i,
  );

  if (!match) {
    return rawText;
  }

  try {
    return Buffer.from(match[1].replace(/\s+/g, ""), "base64").toString("utf8");
  } catch {
    return rawText;
  }
}

function indexOfInsensitive(text: string, marker: string): number {
  return text.toLowerCase().indexOf(marker.toLowerCase());
}

function extractReservationBlock(decodedText: string): string {
  const startMarkers = [
    "Reserva de hotel",
    "Reserva de guardería",
    "Reserva de guarderia",
    "Un usuario ha solicitado hacer una reserva online a través de tu web. Estos son los datos:",
    "Tienes una nueva solicitud de reserva online de Hotel",
    "Hola,",
  ];

  const startIndex = startMarkers.reduce<number | undefined>((current, marker) => {
    if (current !== undefined) {
      return current;
    }

    const index = indexOfInsensitive(decodedText, marker);
    return index >= 0 ? index : undefined;
  }, undefined);

  const sliced = startIndex === undefined ? decodedText : decodedText.slice(startIndex);
  const endMarkers = ["Acceder al software", "GESPET", "---------- Forwarded message ----------"];
  let endIndex = sliced.length;

  for (const marker of endMarkers) {
    const candidate = indexOfInsensitive(sliced, marker);
    if (candidate >= 0 && candidate < endIndex) {
      endIndex = candidate;
    }
  }

  return cleanText(sliced.slice(0, endIndex));
}

function toBlockLines(block: string): string[] {
  return cleanText(block)
    .split("\n")
    .map((line) => line.replace(/[ \t]+$/g, ""));
}

function isLabeledLine(line: string): boolean {
  return /^[A-Za-zÁÉÍÓÚÑáéíóúñ][A-Za-zÁÉÍÓÚÑáéíóúñ ]{1,40}:\s*/.test(line.trim());
}

function collectSectionLines(lines: string[], startIndex: number): string[] {
  const values: string[] = [];
  let hasContent = false;

  for (let index = startIndex; index < lines.length; index += 1) {
    const line = lines[index]?.trim() ?? "";

    if (!line) {
      if (hasContent) {
        const nextNonEmpty = lines
          .slice(index + 1)
          .map((candidate) => candidate.trim())
          .find(Boolean);

        if (!nextNonEmpty || isLabeledLine(nextNonEmpty)) {
          break;
        }
      }
      continue;
    }

    if (isLabeledLine(line)) {
      break;
    }

    hasContent = true;
    values.push(line);
  }

  return values;
}

function readLabeledField(lines: string[], labels: string[]): string | undefined {
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index] ?? "";

    for (const label of labels) {
      const match = line.match(new RegExp(`^\\s*${label}\\s*:\\s*(.*)$`, "i"));
      if (!match) {
        continue;
      }

      const inlineValue = cleanText(match[1] ?? "");
      if (inlineValue) {
        return inlineValue;
      }

      const sectionValue = collectSectionLines(lines, index + 1)[0];
      return sectionValue ? cleanText(sectionValue) : undefined;
    }
  }

  return undefined;
}

function readMultilineSection(lines: string[], labels: string[]): string | undefined {
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index] ?? "";

    for (const label of labels) {
      const match = line.match(new RegExp(`^\\s*${label}\\s*:\\s*(.*)$`, "i"));
      if (!match) {
        continue;
      }

      const inlineValue = cleanText(match[1] ?? "");
      if (inlineValue) {
        return inlineValue;
      }

      const values = collectSectionLines(lines, index + 1);
      return values.length > 0 ? cleanText(values.join("\n")) : undefined;
    }
  }

  return undefined;
}

function readOwnerNameFromHeuristics(block: string): string | undefined {
  const patterns = [
    /(?:soy|me llamo)\s+([A-ZÁÉÍÓÚÑ][^\n.,]+)/i,
    /Cliente\s*:\s*([^\n]+)/i,
  ];

  for (const pattern of patterns) {
    const match = block.match(pattern);
    if (match?.[1]) {
      return cleanText(match[1]);
    }
  }

  return undefined;
}

function readPhoneFromHeuristics(block: string): string | undefined {
  const patterns = [
    /(?:tel[eé]fono|whatsapp)[^0-9+]*([+()0-9 .-]{9,})/i,
    /\b(\+?\d[\d .-]{7,}\d)\b/,
  ];

  for (const pattern of patterns) {
    const match = block.match(pattern);
    if (match?.[1]) {
      return cleanText(match[1].replace(/[.]+$/, ""));
    }
  }

  return undefined;
}

function parseAnimalLine(line: string): ParsedReservationPet | null {
  const cleanLine = cleanText(line);
  if (!cleanLine) {
    return null;
  }

  const parts = cleanLine
    .split(/\s*-\s*/)
    .map((part) => cleanText(part))
    .filter(Boolean);

  if (parts.length === 0) {
    return null;
  }

  return {
    name: parts[0],
    sex: parts[1] ? parts[1].toLowerCase() : undefined,
    breed: parts.length > 2 ? parts.slice(2).join(" - ") : undefined,
    rawLine: cleanLine,
  };
}

function readPetsFromAnimals(animalsBlock?: string): ParsedReservationPet[] {
  if (!animalsBlock) {
    return [];
  }

  return animalsBlock
    .split("\n")
    .map((line) => parseAnimalLine(line))
    .filter((pet): pet is ParsedReservationPet => pet !== null);
}

function readPetNameFromNarrative(block: string): string | undefined {
  const patterns = [
    /para\s+([A-ZÁÉÍÓÚÑ][a-záéíóúñ]+)(?:,|\s)/i,
    /dejar a\s+([A-ZÁÉÍÓÚÑ][a-záéíóúñ]+)(?:,|\s)/i,
  ];

  for (const pattern of patterns) {
    const match = block.match(pattern);
    if (match?.[1]) {
      return cleanText(match[1]);
    }
  }

  return undefined;
}

function readPetCount(block: string, pets: ParsedReservationPet[]): number | undefined {
  const explicit = block.match(/\b(\d+)\s*perros?\b/i);
  if (explicit?.[1]) {
    return Number(explicit[1]);
  }

  if (pets.length > 0) {
    return pets.length;
  }

  if (/perro\b/i.test(block)) {
    return 1;
  }

  return undefined;
}

function readNotes(block: string, lines: string[]): string | undefined {
  const labeledNotes = readLabeledField(lines, ["Notas", "Observaciones"]);
  if (labeledNotes) {
    return labeledNotes;
  }

  const noteLines = block
    .split("\n")
    .map((line) => line.trim())
    .filter((line) =>
      /manta|pienso|medicaci|car[aá]cter|alimenta|comida|tratamiento/i.test(line),
    );

  return noteLines.length > 0 ? noteLines.join(" ") : undefined;
}

function detectReservationType(block: string): ParsedReservationDraft["reservationType"] | undefined {
  return /reserva\s+de\s+hotel/i.test(block) ? "hotel" : undefined;
}

function buildReviewFlags(input: {
  petName?: string;
  phone?: string;
  checkInDate?: string;
  checkOutDate?: string;
  checkInTurn?: ParsedReservationDraft["checkInTurn"];
  checkOutTurn?: ParsedReservationDraft["checkOutTurn"];
  checkInTime?: string;
  checkOutTime?: string;
  petCount?: number;
  needsReview: boolean;
}): ReservationReviewFlag[] {
  const flags = new Set<ReservationReviewFlag>();
  const hasInvalidCheckInSlot = Boolean(input.checkInTime && !input.checkInTurn);
  const hasInvalidCheckOutSlot = Boolean(input.checkOutTime && !input.checkOutTurn);

  if (!input.petName) {
    flags.add("falta_nombre_perro");
  }

  if (!input.phone) {
    flags.add("falta_telefono");
  } else if (!normalizePhoneForIdentifier(input.phone)) {
    flags.add("telefono_no_normalizado");
  }

  if (!input.checkInDate) {
    flags.add("falta_fecha_entrada");
  }

  if (!input.checkOutDate) {
    flags.add("falta_fecha_salida");
  }

  if (hasInvalidCheckInSlot || hasInvalidCheckOutSlot) {
    flags.add("invalid_slot");
  }

  if (!input.checkInTurn && !hasInvalidCheckInSlot) {
    flags.add("falta_turno_entrada");
  }

  if (!input.checkOutTurn && !hasInvalidCheckOutSlot) {
    flags.add("falta_turno_salida");
  }

  if (!input.petCount) {
    flags.add("numero_perros_ambiguous");
  }

  if (input.needsReview && !hasInvalidCheckInSlot && !hasInvalidCheckOutSlot) {
    flags.add("requiere_revision_manual");
  }

  return Array.from(flags);
}

export function parseReservationEmail(input: {
  subject: string;
  rawText: string;
}): ParsedEmailResult {
  const decodedText = cleanText(maybeDecodeBase64PlainText(input.rawText));
  const reservationBlock = extractReservationBlock(decodedText);
  const reservationLines = toBlockLines(reservationBlock);
  const reservationType = detectReservationType(reservationBlock);
  const ownerName =
    readLabeledField(reservationLines, ["Cliente", "Propietario"]) ??
    readOwnerNameFromHeuristics(reservationBlock);
  const ownerEmail = readLabeledField(reservationLines, ["Email", "Correo"]);
  const phone =
    readLabeledField(reservationLines, ["Tel[eé]fono", "Telefono"]) ??
    readPhoneFromHeuristics(reservationBlock);
  const whatsapp = readLabeledField(reservationLines, ["WhatsApp", "Whatsapp"]);
  const checkInRaw = readLabeledField(reservationLines, ["Fecha entrada", "Entrada"]);
  const checkOutRaw = readLabeledField(reservationLines, ["Fecha salida", "Salida"]);
  const animalsBlock = readMultilineSection(reservationLines, ["Animales"]);
  const pets = readPetsFromAnimals(animalsBlock);
  const primaryPet = pets[0];
  const petName = primaryPet?.name ?? readPetNameFromNarrative(reservationBlock);
  const notes = readNotes(reservationBlock, reservationLines);
  const petCount = readPetCount(reservationBlock, pets);
  const normalizedCheckIn = normalizeReservationMoment(checkInRaw, "entrada");
  const normalizedCheckOut = normalizeReservationMoment(checkOutRaw, "salida");
  const reviewFlags = buildReviewFlags({
    petName,
    phone: whatsapp ?? phone,
    checkInDate: normalizedCheckIn.isoDate,
    checkOutDate: normalizedCheckOut.isoDate,
    checkInTime: normalizedCheckIn.time,
    checkOutTime: normalizedCheckOut.time,
    checkInTurn: normalizedCheckIn.turn,
    checkOutTurn: normalizedCheckOut.turn,
    petCount,
    needsReview: normalizedCheckIn.needsReview || normalizedCheckOut.needsReview,
  });

  return {
    draft: {
      source: "email",
      subject: input.subject,
      rawText: reservationBlock,
      reservationType,
      ownerName,
      ownerEmail,
      petName,
      petSex: primaryPet?.sex,
      petBreed: primaryPet?.breed,
      pets: pets.length > 0 ? pets : undefined,
      phone,
      whatsapp,
      checkInDate: normalizedCheckIn.isoDate,
      checkInTime: normalizedCheckIn.time,
      originalRequestedCheckInTime: normalizedCheckIn.originalRequestedTime,
      normalizedCheckInTime: normalizedCheckIn.normalizedReceptionTime,
      checkInTimeWasAdjusted: normalizedCheckIn.wasTimeAdjusted,
      checkInTimeAdjustmentMessage: normalizedCheckIn.timeAdjustmentExplanation,
      checkInTurn: normalizedCheckIn.turn,
      checkOutDate: normalizedCheckOut.isoDate,
      checkOutTime: normalizedCheckOut.time,
      originalRequestedCheckOutTime: normalizedCheckOut.originalRequestedTime,
      normalizedCheckOutTime: normalizedCheckOut.normalizedReceptionTime,
      checkOutTimeWasAdjusted: normalizedCheckOut.wasTimeAdjusted,
      checkOutTimeAdjustmentMessage: normalizedCheckOut.timeAdjustmentExplanation,
      checkOutTurn: normalizedCheckOut.turn,
      petCount,
      notes,
      language: "es",
      reviewFlags,
      reviewState: reviewFlags.length > 0 ? "necesita_revision" : "ok",
      workflowState: reviewFlags.length > 0 ? "pending_review" : "parsed",
    },
    meta: {
      decodedText,
      reservationBlock,
      assumptions: [...normalizedCheckIn.notes, ...normalizedCheckOut.notes],
      extractedFields: {
        reservationType,
        ownerName,
        ownerEmail,
        phone,
        whatsapp,
        petName,
        petSex: primaryPet?.sex,
        petBreed: primaryPet?.breed,
        petCount,
        checkInRaw,
        checkInDate: normalizedCheckIn.isoDate,
        checkInTime: normalizedCheckIn.time,
        normalizedCheckInTime: normalizedCheckIn.normalizedReceptionTime,
        checkInTimeWasAdjusted: normalizedCheckIn.wasTimeAdjusted,
        checkOutRaw,
        checkOutDate: normalizedCheckOut.isoDate,
        checkOutTime: normalizedCheckOut.time,
        normalizedCheckOutTime: normalizedCheckOut.normalizedReceptionTime,
        checkOutTimeWasAdjusted: normalizedCheckOut.wasTimeAdjusted,
      },
    },
  };
}
