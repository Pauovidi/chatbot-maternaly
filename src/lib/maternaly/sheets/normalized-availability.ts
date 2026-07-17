import type { NormalizedServiceSheetSnapshot } from "@/lib/maternaly/sheets/normalized-client";
import {
  MATERNALY_CHARLA_SESSIONS,
  isDocumentedCharlaSession,
  normalizeCharlaDate,
  normalizeCharlaModality,
  normalizeCharlaTime,
  resolveCharlaOption,
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
  availabilityStatus: "available" | "full" | "unknown_capacity";
  source?: "normalized_sheets" | "contract_pending_validation";
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
        (!rowServiceId || rowServiceId === snapshot.serviceKey) &&
        (!group?.serviceId || group.serviceId === snapshot.serviceKey)
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
        availableSeats === undefined ? "unknown_capacity" : full ? "full" : "available";

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
        source: "normalized_sheets" as const,
      };
    })
    .filter((session) => isCurrentOrFutureSession(session.date, today))
    .filter(
      (session) =>
        snapshot.serviceKey !== "charla_embarazo_1_20" ||
        isDocumentedCharlaSession({
          location: session.location,
          modality: session.modality,
          groupName: session.groupName,
          sessionName: session.sessionName,
          date: session.date,
          startTime: session.startTime,
        }),
    );

  if (snapshot.serviceKey !== "charla_embarazo_1_20") {
    return sessions;
  }

  const optionOrder = new Map([
    ["erandio", 0],
    ["bilbao", 1],
    ["online", 2],
  ]);
  return sessions.sort((a, b) => {
    const aOrder = optionOrder.get(resolveCharlaOption(a)?.id ?? "") ?? 99;
    const bOrder = optionOrder.get(resolveCharlaOption(b)?.id ?? "") ?? 99;
    return aOrder - bOrder || compareSessions(a, b);
  });
}

function charlaSessionKey(session: {
  optionId?: string;
  location?: string;
  modality?: string;
  groupName?: string;
  sessionName?: string;
  date?: string;
  startTime?: string;
}): string | undefined {
  const optionId = session.optionId ?? resolveCharlaOption(session)?.id;
  const date = normalizeCharlaDate(session.date);
  const startTime = normalizeCharlaTime(session.startTime);
  return optionId && date && startTime ? `${optionId}|${date}|${startTime}` : undefined;
}

/**
 * Proyecta siempre el calendario prescrito por la clienta. Las filas reales de
 * Sheets conservan capacidad e IDs; las fechas sin respaldo se etiquetan como
 * pendientes para que puedan mostrarse, pero nunca escribirse automáticamente.
 */
export function projectCharlaContractCalendar(
  sheetSessions: NormalizedAvailableSession[],
  options: { now?: Date } = {},
): NormalizedAvailableSession[] {
  const today = currentDateIso(options.now ?? new Date());
  const realByContractKey = new Map<string, NormalizedAvailableSession>();

  for (const session of sheetSessions) {
    const key = charlaSessionKey(session);
    if (key && !realByContractKey.has(key)) {
      realByContractKey.set(key, session);
    }
  }

  return MATERNALY_CHARLA_SESSIONS
    .filter((session) => session.date >= today)
    .map((contractSession) => {
      const key = charlaSessionKey(contractSession)!;
      const real = realByContractKey.get(key);
      if (real) {
        return { ...real, source: "normalized_sheets" as const };
      }

      return {
        serviceKey: "charla_embarazo_1_20" as const,
        serviceLabel: MATERNALY_NORMALIZED_SERVICES.charla_embarazo_1_20.label,
        groupId: `contract-pending:${contractSession.optionId}`,
        groupName: contractSession.location,
        sessionId: `contract-pending:${contractSession.optionId}:${contractSession.date}:${contractSession.startTime}`,
        sessionName: MATERNALY_NORMALIZED_SERVICES.charla_embarazo_1_20.label,
        location: contractSession.location,
        modality: contractSession.modality,
        date: contractSession.date,
        startTime: contractSession.startTime,
        occupied: 0,
        full: false,
        availabilityStatus: "unknown_capacity" as const,
        source: "contract_pending_validation" as const,
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
