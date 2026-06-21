import type { NormalizedServiceSheetSnapshot } from "@/lib/maternaly/sheets/normalized-client";
import {
  MATERNALY_NORMALIZED_SERVICES,
  getCell,
  humanNormalize,
  parsePositiveInteger,
  type MaternalyNormalizedServiceKey,
  type NormalizedRow,
} from "@/lib/maternaly/sheets/normalized-template";

export interface NormalizedAvailableSession {
  serviceKey: MaternalyNormalizedServiceKey;
  serviceLabel: string;
  groupId: string;
  groupName: string;
  sessionId: string;
  sessionName: string;
  date?: string;
  startTime?: string;
  endTime?: string;
  capacityTotal?: number;
  occupied: number;
  availableSeats?: number;
  full: boolean;
  availabilityStatus: "available" | "full" | "unknown_capacity";
}

const OCCUPYING_STATUSES = [
  "activa",
  "pendiente confirmar",
  "preinscrita",
  "reserva pendiente",
  "confirmada",
];

const NON_OCCUPYING_STATUSES = [
  "cancelada",
  "anulada",
  "baja",
  "no vino",
  "rechazada",
];

export function registrationOccupiesCapacity(status: string): boolean {
  const normalized = humanNormalize(status);
  if (NON_OCCUPYING_STATUSES.some((item) => normalized.includes(item))) {
    return false;
  }

  return OCCUPYING_STATUSES.some((item) => normalized.includes(item));
}

function indexGroups(rows: NormalizedRow[]) {
  return new Map(
    rows.map((row) => {
      const groupId = getCell(row, "groupId");
      return [
        groupId,
        {
          groupId,
          groupName: getCell(row, "groupName") || groupId,
          capacityTotal: parsePositiveInteger(getCell(row, "capacityTotal")),
          status: getCell(row, "status"),
        },
      ] as const;
    }),
  );
}

function isActiveRow(row: NormalizedRow): boolean {
  const status = humanNormalize(getCell(row, "status"));
  const visible = humanNormalize(getCell(row, "visibleChatbot"));
  const reservable = humanNormalize(getCell(row, "reservableChatbot"));
  const hidden = ["no", "false", "0", "oculto", "oculta"].includes(visible);
  const notReservable = ["no", "false", "0"].includes(reservable);

  return (
    !hidden &&
    !notReservable &&
    (!status || !NON_OCCUPYING_STATUSES.some((item) => status.includes(item)))
  );
}

export function calculateSessionOccupancy(input: {
  registrations: NormalizedRow[];
  sessionId: string;
  groupId: string;
}): number {
  return input.registrations.filter((row) => {
    const rowSessionId = getCell(row, "sessionId");
    const rowGroupId = getCell(row, "groupId");
    const sameSession = rowSessionId ? rowSessionId === input.sessionId : rowGroupId === input.groupId;
    return sameSession && registrationOccupiesCapacity(getCell(row, "status"));
  }).length;
}

export function listAvailableSessionsFromSnapshot(
  snapshot: NormalizedServiceSheetSnapshot,
): NormalizedAvailableSession[] {
  const service = MATERNALY_NORMALIZED_SERVICES[snapshot.serviceKey];
  const groups = indexGroups(snapshot.tabs.Grupos_Ediciones.rows);
  const registrations = snapshot.tabs.Inscripciones.rows;

  return snapshot.tabs.Sesiones.rows
    .filter(isActiveRow)
    .map((row) => {
      const groupId = getCell(row, "groupId");
      const group = groups.get(groupId);
      const sessionId = getCell(row, "sessionId") || `${groupId}:${getCell(row, "date")}:${getCell(row, "startTime")}`;
      const sessionCapacity = parsePositiveInteger(getCell(row, "capacityTotal"));
      const directOccupied = parsePositiveInteger(getCell(row, "occupiedSeats"));
      const directAvailable = parsePositiveInteger(getCell(row, "availableSeats"));
      const capacityTotal = sessionCapacity ?? group?.capacityTotal;
      const calculatedOccupied = calculateSessionOccupancy({
        registrations,
        sessionId,
        groupId,
      });
      const occupied =
        directOccupied ??
        (directAvailable !== undefined && capacityTotal !== undefined
          ? Math.max(capacityTotal - directAvailable, 0)
          : calculatedOccupied);
      const availableSeats =
        directAvailable ??
        (capacityTotal === undefined ? undefined : Math.max(capacityTotal - occupied, 0));
      const full = availableSeats !== undefined && availableSeats <= 0;
      const center = getCell(row, "center");

      return {
        serviceKey: snapshot.serviceKey,
        serviceLabel: service.label,
        groupId,
        groupName: center || group?.groupName || groupId,
        sessionId,
        sessionName: getCell(row, "sessionName") || service.label,
        date: getCell(row, "date") || undefined,
        startTime: getCell(row, "startTime") || undefined,
        endTime: getCell(row, "endTime") || undefined,
        capacityTotal,
        occupied,
        availableSeats,
        full,
        availabilityStatus:
          availableSeats === undefined ? "unknown_capacity" : full ? "full" : "available",
      };
    });
}

export function formatAvailableSessionsReply(sessions: NormalizedAvailableSession[]): string {
  if (sessions.length === 0) {
    return "Ahora mismo no veo horarios disponibles para ese servicio en los Sheets. Puedo dejarte con el equipo para revisarlo.";
  }

  const lines = sessions.slice(0, 4).map((session, index) => {
    const when = [session.date, session.startTime].filter(Boolean).join(" ");
    const capacity =
      session.availableSeats === undefined
        ? "disponibilidad a validar"
        : session.full
          ? "sin plazas libres"
          : `${session.availableSeats} plaza${session.availableSeats === 1 ? "" : "s"} disponible${session.availableSeats === 1 ? "" : "s"}`;
    return `${index + 1}. ${when || session.sessionName} (${capacity})`;
  });

  return [
    "Te puedo ayudar con los horarios disponibles.",
    ...lines,
    "Dime cuál prefieres y para dejar la solicitud registrada necesito nombre, teléfono y email.",
  ].join("\n");
}
