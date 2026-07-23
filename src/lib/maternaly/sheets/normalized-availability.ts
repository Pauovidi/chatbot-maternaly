import {
  serviceIdBelongsToNormalizedWorkbook,
  type NormalizedServiceSheetSnapshot,
} from "@/lib/maternaly/sheets/normalized-client";
import {
  normalizeCharlaDate,
  normalizeCharlaModality,
  normalizeCharlaTime,
} from "@/lib/maternaly/knowledge/charla-informativa-contract";
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
  location?: string;
  modality?: "presencial" | "online";
  date?: string;
  startTime?: string;
  endTime?: string;
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
          serviceId: getCell(row, "serviceId"),
          center: getCell(row, "center"),
          modality: getCell(row, "modality"),
          capacityTotal: parsePositiveInteger(getCell(row, "capacityTotal")),
          status: getCell(row, "status"),
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

function currentDateIso(now: Date): string {
  return [
    now.getFullYear().toString().padStart(4, "0"),
    (now.getMonth() + 1).toString().padStart(2, "0"),
    now.getDate().toString().padStart(2, "0"),
  ].join("-");
}

function isCurrentOrFutureSession(date: string | undefined, today: string): boolean {
  const normalized = normalizeCharlaDate(date);
  return !normalized || normalized >= today;
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
    (!status || !NON_OCCUPYING_STATUSES.some((item) => status.includes(item)))
  );
}

function hasExplicitUnlimitedCapacity(row: NormalizedRow): boolean {
  const reservable = humanNormalize(getCell(row, "reservableChatbot"));
  return ["si", "yes", "true", "1"].includes(reservable);
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
  options: { now?: Date } = {},
): NormalizedAvailableSession[] {
  const service = MATERNALY_NORMALIZED_SERVICES[snapshot.serviceKey];
  const groups = indexGroups(snapshot.tabs.Grupos_Ediciones.rows);
  const registrations = snapshot.tabs.Inscripciones.rows;
  const today = currentDateIso(options.now ?? new Date());

  const sessions = snapshot.tabs.Sesiones.rows
    .filter(isActiveRow)
    .filter((row) => {
      const group = groups.get(getCell(row, "groupId"));
      const rowServiceId = getCell(row, "serviceId");
      return (
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
        directAvailable === undefined &&
        hasExplicitUnlimitedCapacity(row);
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
      const availableSeats = unlimitedCapacity
        ? undefined
        : directAvailable ??
          (capacityTotal === undefined ? undefined : Math.max(capacityTotal - occupied, 0));
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
        capacityTotal,
        occupied,
        availableSeats,
        full,
        availabilityStatus,
      };
    })
    .filter((session) => isCurrentOrFutureSession(session.date, today));

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
        ? "inscripción libre"
        : session.availableSeats === undefined
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
