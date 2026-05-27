import { loadDemoState } from "./demo-store";
import type { ReservationRecord } from "../domain/contracts";

export interface EntryLogRecord {
  reservationId: string;
  createdAt: string;
  source: "chatbot" | "formulario" | "recepción email" | "manual/revisión";
  action: "confirmada" | "modificada" | "rechazada" | "cancelada" | "revisión manual";
  clientName: string;
  clientStatus: "cliente habitual" | "nuevo contacto" | "ambiguo" | "bloqueado/revisión";
  phoneNormalized: string;
  petName: string;
  checkInDate: string;
  checkOutDate: string;
  notes: string;
  gestetStatus: "pendiente Gestet" | "procesado Gestet";
}

function normalizePhone(value?: string): string {
  return value?.replace(/[^\d+]/g, "") || "Pendiente";
}

function mapSource(record: ReservationRecord): EntryLogRecord["source"] {
  if (record.source === "web") {
    return "formulario";
  }

  if (record.source === "manual") {
    return "manual/revisión";
  }

  if (record.source === "demo") {
    return "chatbot";
  }

  return "recepción email";
}

function mapAction(record: ReservationRecord): EntryLogRecord["action"] {
  if (record.status === "confirmada") {
    return "confirmada";
  }

  if (record.status === "cancelada") {
    return "cancelada";
  }

  if (record.status === "sin_disponibilidad") {
    return "rechazada";
  }

  if (record.reviewState === "necesita_revision" || record.manualFollowupRequired) {
    return "revisión manual";
  }

  return "modificada";
}

function mapClientStatus(record: ReservationRecord): EntryLogRecord["clientStatus"] {
  if (record.reviewState === "necesita_revision" || record.manualFollowupRequired) {
    return "bloqueado/revisión";
  }

  if (record.source === "email" || record.sheetRegistration) {
    return "cliente habitual";
  }

  return "nuevo contacto";
}

export function buildEntryLogRecord(record: ReservationRecord): EntryLogRecord {
  const notes = [
    record.notes,
    record.specialNotes,
    record.checkInTimeAdjustmentMessage,
    record.checkOutTimeAdjustmentMessage,
  ].filter(Boolean);

  return {
    reservationId: record.reservationId,
    createdAt: record.createdAt,
    source: mapSource(record),
    action: mapAction(record),
    clientName: record.ownerName ?? "Cliente pendiente",
    clientStatus: mapClientStatus(record),
    phoneNormalized: normalizePhone(record.phone),
    petName: record.petName ?? "Mascota pendiente",
    checkInDate: record.checkInDate,
    checkOutDate: record.checkOutDate,
    notes: notes.join(" · ") || "Sin notas",
    gestetStatus: record.sheetRegistration ? "procesado Gestet" : "pendiente Gestet",
  };
}

export async function listEntryLogRecords(): Promise<EntryLogRecord[]> {
  const state = await loadDemoState();

  return state.reservations
    .filter((record) =>
      ["confirmada", "cancelada", "sin_disponibilidad"].includes(record.status) ||
      record.reviewState === "necesita_revision" ||
      record.manualFollowupRequired,
    )
    .map(buildEntryLogRecord)
    .sort((left, right) => right.createdAt.localeCompare(left.createdAt));
}
