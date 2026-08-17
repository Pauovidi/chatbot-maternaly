import {
  serviceIdBelongsToNormalizedWorkbook,
  type NormalizedServiceSheetSnapshot,
} from "@/lib/maternaly/sheets/normalized-client";
import {
  normalizeCharlaDate,
  normalizeCharlaModality,
  normalizeCharlaTime,
} from "@/lib/maternaly/knowledge/charla-informativa-contract";
import { madridSessionStartsAt } from "@/lib/maternaly/reminders/charla-integration";
import {
  MATERNALY_NORMALIZED_SERVICES,
  getCell,
  humanNormalize,
  parsePositiveInteger,
  registrationStatusDomain,
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
  location?: string;
  modality?: "presencial" | "online";
  date?: string;
  startTime?: string;
  endTime?: string;
  onlineJoinUrl?: string;
  onlineAccessCode?: string;
  onlineMeetingId?: string;
  capacityTotal?: number;
  occupied: number;
  availableSeats?: number;
  full: boolean;
  availabilityStatus: "available" | "unlimited" | "full" | "unknown_capacity";
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
  "inactiva",
  "inactivo",
  "cerrada",
  "cerrado",
  "finalizada",
  "finalizado",
  "archivada",
  "archivado",
];

export function registrationOccupiesCapacity(status: string): boolean {
  const normalized = humanNormalize(status);
  if (NON_OCCUPYING_STATUSES.some((item) => normalized.includes(item))) {
    return false;
  }

  return OCCUPYING_STATUSES.some((item) => normalized.includes(item));
}

export function registrationIsOpen(status: string): boolean {
  const domain = registrationStatusDomain(status);
  return domain === "confirmed" || domain === "pending";
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
          serviceId: getCell(row, "serviceId"),
          center: getCell(row, "center"),
          modality: getCell(row, "modality"),
          capacityTotal: parsePositiveInteger(getCell(row, "capacityTotal")),
          status: getCell(row, "status"),
          active: isActiveRow(row),
        },
      ] as const;
    }),
  );
}

function normalizeSessionModality(...values: Array<string | undefined>): "presencial" | "online" | undefined {
  for (const value of values) {
    const modality = normalizeCharlaModality(value);
    if (modality) {
      return modality;
    }
  }

  const combined = humanNormalize(values.filter(Boolean).join(" "));
  if (/\b(?:bilbao|erandio)\b/.test(combined)) {
    return "presencial";
  }
  return undefined;
}

function normalizeSessionLocation(input: {
  rowCenter?: string;
  groupCenter?: string;
  groupName?: string;
  sessionName?: string;
  modality?: "presencial" | "online";
}): string | undefined {
  const combined = humanNormalize(
    [input.rowCenter, input.groupCenter, input.groupName, input.sessionName]
      .filter(Boolean)
      .join(" "),
  );
  if (input.modality === "online" || /\b(?:online|on\s+line|zoom|virtual)\b/.test(combined)) {
    return "Online";
  }
  if (/\berandio\b/.test(combined)) {
    return "Erandio";
  }
  if (/\bbilbao\b/.test(combined)) {
    return "Bilbao";
  }
  return input.rowCenter || input.groupCenter || undefined;
}

function isFutureSessionStart(
  date: string | undefined,
  startTime: string | undefined,
  now: Date,
): boolean {
  if (!date || !startTime) {
    return false;
  }
  try {
    return new Date(madridSessionStartsAt(date, startTime)).getTime() > now.getTime();
  } catch {
    return false;
  }
}

function compareSessions(a: NormalizedAvailableSession, b: NormalizedAvailableSession): number {
  const aDate = normalizeCharlaDate(a.date) ?? "9999-12-31";
  const bDate = normalizeCharlaDate(b.date) ?? "9999-12-31";
  const dateComparison = aDate.localeCompare(bDate);
  if (dateComparison !== 0) {
    return dateComparison;
  }
  return (normalizeCharlaTime(a.startTime) ?? "99:99").localeCompare(
    normalizeCharlaTime(b.startTime) ?? "99:99",
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
    ["activa", "activo", "abierta", "abierto", "programada", "programado", "publicada", "publicado"].includes(
      status,
    )
  );
}

export function calculateSessionOccupancy(input: {
  registrations: NormalizedRow[];
  sessionId: string;
  groupId: string;
}): number {
  return input.registrations.reduce((occupied, row) => {
    const rowSessionId = getCell(row, "sessionId");
    const rowGroupId = getCell(row, "groupId");
    const notes = getCell(row, "notes");
    const notesSessionId = /\bsession\s*:\s*([^|\s]+)\b/i.exec(notes)?.[1];
    const sameStableGroup = Boolean(
      rowGroupId && input.groupId && humanNormalize(rowGroupId) === humanNormalize(input.groupId),
    );
    const sameSession = sameStableGroup || (rowSessionId
      ? rowSessionId === input.sessionId
      : notesSessionId
        ? notesSessionId === input.sessionId
        : false);
    if (!sameSession || !registrationOccupiesCapacity(getCell(row, "status"))) {
      return occupied;
    }

    const directPeopleCount = parsePositiveInteger(getCell(row, "peopleCount"));
    const notesPeopleCount = /\bpersonas?\s*:\s*(\d+)\b/i.exec(notes)?.[1];
    const partnerPeopleCount = getCell(row, "partnerName").trim() ? 2 : undefined;
    const peopleCount = directPeopleCount ??
      (notesPeopleCount ? Number.parseInt(notesPeopleCount, 10) : undefined) ??
      partnerPeopleCount;
    return occupied + Math.max(1, peopleCount ?? 1);
  }, 0);
}

export function listAvailableSessionsFromSnapshot(
  snapshot: NormalizedServiceSheetSnapshot,
  options: { now?: Date } = {},
): NormalizedAvailableSession[] {
  const service = MATERNALY_NORMALIZED_SERVICES[snapshot.serviceKey];
  const groups = indexGroups(snapshot.tabs.Grupos_Ediciones.rows);
  const registrations = snapshot.tabs.Inscripciones.rows;
  const now = options.now ?? new Date();

  const sessions = snapshot.tabs.Sesiones.rows
    .filter(isActiveRow)
    .filter((row) => {
      const group = groups.get(getCell(row, "groupId"));
      const rowServiceId = getCell(row, "serviceId");
      return (
        Boolean(group?.active) &&
        serviceIdBelongsToNormalizedWorkbook(snapshot, rowServiceId) &&
        serviceIdBelongsToNormalizedWorkbook(snapshot, group?.serviceId)
      );
    })
    .map((row) => {
      const groupId = getCell(row, "groupId");
      const group = groups.get(groupId);
      const sessionId = getCell(row, "sessionId") || `${groupId}:${getCell(row, "date")}:${getCell(row, "startTime")}`;
      const sessionCapacity = parsePositiveInteger(getCell(row, "capacityTotal"));
      const directOccupied = parsePositiveInteger(getCell(row, "occupiedSeats"));
      const directAvailable = parsePositiveInteger(getCell(row, "availableSeats"));
      const capacityTotal = sessionCapacity ?? group?.capacityTotal;
      const unlimitedCapacity =
        capacityTotal === undefined &&
        directAvailable === undefined;
      const calculatedOccupied = calculateSessionOccupancy({
        registrations,
        sessionId,
        groupId,
      });
      const occupiedFromDirectAvailability =
        directAvailable !== undefined && capacityTotal !== undefined
          ? Math.max(capacityTotal - directAvailable, 0)
          : 0;
      // Explicit counters or formulas can lag immediately after an append. The
      // registration rows are reconciled with them so a locked re-read cannot
      // hand out the same final seat twice.
      const occupied = Math.max(
        directOccupied ?? 0,
        occupiedFromDirectAvailability,
        calculatedOccupied,
      );
      const availableSeats = unlimitedCapacity
        ? undefined
        : capacityTotal !== undefined
          ? Math.max(capacityTotal - occupied, 0)
          : directAvailable;
      const full = availableSeats !== undefined && availableSeats <= 0;
      const sessionName = getCell(row, "sessionName") || service.label;
      const rowCenter = getCell(row, "center");
      const rowModality = getCell(row, "modality");
      const modality = normalizeSessionModality(
        rowModality,
        group?.modality,
        rowCenter,
        group?.center,
        group?.groupName,
        sessionName,
      );
      const location = normalizeSessionLocation({
        rowCenter,
        groupCenter: group?.center,
        groupName: group?.groupName,
        sessionName,
        modality,
      });
      const rawDate = getCell(row, "date");
      const availabilityStatus: NormalizedAvailableSession["availabilityStatus"] =
        unlimitedCapacity
          ? "unlimited"
          : availableSeats === undefined
            ? "unknown_capacity"
            : full
              ? "full"
              : "available";

      return {
        serviceKey: snapshot.serviceKey,
        serviceLabel: service.label,
        groupId,
        groupName: rowCenter || group?.center || group?.groupName || groupId,
        sessionId,
        sessionName,
        location,
        modality,
        date: normalizeCharlaDate(rawDate) ?? (rawDate || undefined),
        startTime: normalizeCharlaTime(getCell(row, "startTime")) ?? undefined,
        endTime: getCell(row, "endTime") || undefined,
        onlineJoinUrl: getCell(row, "onlineJoinUrl") || undefined,
        onlineAccessCode: getCell(row, "onlineAccessCode") || undefined,
        onlineMeetingId: getCell(row, "onlineMeetingId") || undefined,
        capacityTotal,
        occupied,
        availableSeats,
        full,
        availabilityStatus,
      };
    })
    .filter(
      (session) =>
        Boolean(session.modality && session.location) &&
        isFutureSessionStart(session.date, session.startTime, now),
    );

  if (snapshot.serviceKey !== "charla_embarazo_1_20") {
    return sessions;
  }

  return sessions.sort(compareSessions);
}

export function formatAvailableSessionsReply(sessions: NormalizedAvailableSession[]): string {
  if (sessions.length === 0) {
    return "Ahora mismo no veo horarios disponibles para ese servicio en los Sheets. Puedo dejarte con el equipo para revisarlo.";
  }

  const lines = sessions.slice(0, 4).map((session, index) => {
    const when = [session.date, session.startTime].filter(Boolean).join(" ");
    const capacity =
      session.availabilityStatus === "unlimited"
        ? undefined
        : session.availableSeats === undefined
          ? "disponibilidad a validar"
          : session.full
            ? "sin plazas libres"
            : `${session.availableSeats} plaza${session.availableSeats === 1 ? "" : "s"} disponible${session.availableSeats === 1 ? "" : "s"}`;
    return `${index + 1}. ${when || session.sessionName}${capacity ? ` (${capacity})` : ""}`;
  });

  return [
    "Te puedo ayudar con los horarios disponibles.",
    ...lines,
    "Dime cuál prefieres y para dejar la solicitud registrada necesito nombre, teléfono y email.",
  ].join("\n");
}
