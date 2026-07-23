export type MaternalyNormalizedServiceKey = "charla_embarazo_1_20" | "taller_blw";

export interface MaternalyNormalizedServiceDefinition {
  key: MaternalyNormalizedServiceKey;
  label: string;
  aliases: string[];
  requiresPregnancyWeek: boolean;
}

export const MATERNALY_NORMALIZED_SERVICES: Record<
  MaternalyNormalizedServiceKey,
  MaternalyNormalizedServiceDefinition
> = {
  charla_embarazo_1_20: {
    key: "charla_embarazo_1_20",
    label: "Charla informativa embarazo semana 1-20",
    aliases: [
      "charla embarazo",
      "charla informativa",
      "embarazo",
      "semana",
      "1-20",
    ],
    requiresPregnancyWeek: true,
  },
  taller_blw: {
    key: "taller_blw",
    label: "Taller BLW",
    aliases: ["blw", "taller blw", "baby led weaning"],
    requiresPregnancyWeek: false,
  },
};

export const NORMALIZED_REQUIRED_TABS = [
  "Servicio_Config",
  "Clientes_Local",
  "Grupos_Ediciones",
  "Sesiones",
  "Inscripciones",
  "Interacciones_Chatbot",
] as const;

export type NormalizedRequiredTab = (typeof NORMALIZED_REQUIRED_TABS)[number];
export type NormalizedRow = Record<string, string>;

export const NORMALIZED_COLUMN_ALIASES = {
  serviceId: ["service_id", "servicio_id", "id_servicio", "servicio"],
  serviceName: ["service_name", "nombre_servicio", "servicio", "nombre"],
  groupId: ["group_id", "grupo_id", "id_grupo", "edicion_id", "id_edicion"],
  groupName: ["group_name", "grupo", "nombre_grupo", "edicion", "nombre_edicion"],
  sessionId: ["session_id", "sesion_id", "id_sesion", "id"],
  sessionName: ["session_name", "sesion", "titulo", "nombre"],
  center: ["centro", "sede", "ubicacion", "ubicación"],
  modality: ["modalidad", "formato"],
  date: ["fecha", "date", "dia"],
  startTime: ["hora_inicio", "inicio", "start_time", "hora"],
  endTime: ["hora_fin", "fin", "end_time"],
  capacityTotal: ["capacidad_total", "capacidad", "cupo", "plazas_totales"],
  occupiedSeats: ["plazas_ocupadas", "ocupadas", "occupied_seats"],
  availableSeats: ["plazas_disponibles", "disponibles", "available_seats"],
  visibleChatbot: ["visible_chatbot", "visible_bot"],
  reservableChatbot: ["reservable_chatbot", "reservable_bot"],
  status: ["estado", "status", "estado_inscripcion", "resultado", "estado_cliente", "estado_sesion"],
  clientId: ["cliente_id", "client_id", "id_cliente"],
  registrationId: ["inscripcion_id", "registration_id", "id_inscripcion"],
  interactionId: ["interaccion_id", "interaction_id", "id_interaccion"],
  fullName: ["nombre_completo", "full_name", "contacto", "nombre", "nombre_y_apellidos"],
  firstName: ["nombre"],
  lastName: ["apellidos", "apellido"],
  phone: ["telefono", "teléfono", "telefono_normalizado", "phone", "whatsapp", "movil", "móvil"],
  email: ["email", "correo", "mail"],
  peopleCount: ["people_count", "personas", "plazas", "cantidad"],
  pregnancyWeek: ["semana_embarazo", "semana", "pregnancy_week"],
  idempotencyKey: ["idempotency_key", "clave_idempotencia", "external_id", "id_externo"],
  createdAt: ["created_at", "fecha_creacion", "creado_en", "fecha_hora", "fecha_inscripcion", "fecha_alta"],
  updatedAt: ["ultima_actualizacion", "updated_at"],
  source: ["source", "origen", "canal", "canal_origen", "channel"],
  notes: ["notas", "observaciones", "notes", "notas_privadas"],
  event: ["evento", "event", "accion_realizada", "accion"],
  result: ["resultado", "result"],
  mode: ["mode", "modo"],
  blockedReasons: ["blocked_reasons", "motivos_bloqueo"],
  price: ["precio", "precio_acordado"],
  paymentStatus: ["estado_pago", "payment_status"],
  partnerName: ["pareja_nombre", "acompanante", "acompañante", "nombre_pareja"],
  babyBirthDate: ["fecha_nacimiento_bebe", "fecha_nacimiento_bebé"],
  fppOrDueDate: ["fpp", "fecha_probable_parto"],
  requiresHuman: ["requiere_humano"],
  conversationId: ["conversation_id"],
  leadId: ["lead_id"],
  inboundSummary: ["mensaje_usuario_resumen"],
  outboundSummary: ["respuesta_bot_resumen"],
} as const;

export type NormalizedColumnKey = keyof typeof NORMALIZED_COLUMN_ALIASES;

export function normalizeSheetText(value: string): string {
  return value
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

export function humanNormalize(value: string): string {
  return value
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .trim()
    .toLowerCase();
}

export function coerceRows(values: unknown[][]): string[][] {
  return values.map((row) => row.map((cell) => String(cell ?? "").trim()));
}

const HEADER_SCAN_LIMIT = 20;

const NORMALIZED_COLUMN_ALIAS_LOOKUP = Object.fromEntries(
  Object.entries(NORMALIZED_COLUMN_ALIASES).flatMap(([key, aliases]) =>
    aliases.map((alias) => [normalizeSheetText(alias), key]),
  ),
) as Record<string, NormalizedColumnKey | undefined>;

const TAB_HEADER_EXPECTATIONS: Partial<Record<NormalizedRequiredTab, NormalizedColumnKey[]>> = {
  Servicio_Config: ["serviceId", "serviceName"],
  Clientes_Local: [
    "clientId",
    "fullName",
    "firstName",
    "lastName",
    "phone",
    "email",
    "source",
    "status",
    "notes",
    "createdAt",
    "updatedAt",
  ],
  Grupos_Ediciones: ["groupId", "groupName", "serviceId", "center", "modality", "capacityTotal", "status"],
  Sesiones: [
    "sessionId",
    "groupId",
    "serviceId",
    "date",
    "startTime",
    "endTime",
    "center",
    "modality",
    "capacityTotal",
    "occupiedSeats",
    "availableSeats",
    "visibleChatbot",
    "reservableChatbot",
    "status",
  ],
  Inscripciones: [
    "registrationId",
    "clientId",
    "serviceId",
    "groupId",
    "sessionId",
    "fullName",
    "firstName",
    "lastName",
    "phone",
    "status",
    "source",
    "notes",
    "createdAt",
    "price",
    "paymentStatus",
    "partnerName",
  ],
  Interacciones_Chatbot: [
    "interactionId",
    "createdAt",
    "source",
    "phone",
    "clientId",
    "leadId",
    "serviceId",
    "event",
    "result",
    "requiresHuman",
    "conversationId",
    "notes",
  ],
};

function minimumExpectedMatches(tab?: NormalizedRequiredTab): number {
  switch (tab) {
    case "Sesiones":
      return 3;
    case "Clientes_Local":
    case "Inscripciones":
    case "Grupos_Ediciones":
      return 2;
    case "Interacciones_Chatbot":
    case "Servicio_Config":
      return 1;
    default:
      return 2;
  }
}

function matchedColumnKeys(row: string[]): Set<NormalizedColumnKey> {
  const keys = new Set<NormalizedColumnKey>();
  for (const cell of row) {
    const key = NORMALIZED_COLUMN_ALIAS_LOOKUP[normalizeSheetText(cell)];
    if (key) {
      keys.add(key);
    }
  }
  return keys;
}

export function detectNormalizedHeaderRow(
  rows: string[][],
  tab?: NormalizedRequiredTab,
): {
  headerRowIndex: number;
  parseError?: string;
} {
  if (tab === "Servicio_Config") {
    const keyValueHeaderIndex = rows
      .slice(0, HEADER_SCAN_LIMIT)
      .findIndex((row) => {
        const cells = new Set(row.map(normalizeSheetText));
        return (
          (cells.has("campo") || cells.has("clave") || cells.has("field")) &&
          (cells.has("valor") || cells.has("value"))
        );
      });
    if (keyValueHeaderIndex >= 0) {
      return { headerRowIndex: keyValueHeaderIndex };
    }
  }

  const expected = tab
    ? TAB_HEADER_EXPECTATIONS[tab] ?? []
    : (Object.keys(NORMALIZED_COLUMN_ALIASES) as NormalizedColumnKey[]);
  const expectedSet = new Set(expected);
  let best: {
    index: number;
    score: number;
    matchedKeys: Set<NormalizedColumnKey>;
    expectedMatches: number;
  } | null = null;

  for (const [index, row] of rows.slice(0, HEADER_SCAN_LIMIT).entries()) {
    if (!row.some(Boolean)) {
      continue;
    }

    const matchedKeys = matchedColumnKeys(row);
    const expectedMatches = Array.from(matchedKeys).filter((key) => expectedSet.has(key)).length;
    const score = matchedKeys.size * 10 + expectedMatches * 20 + row.filter(Boolean).length;
    if (!best || score > best.score) {
      best = { index, score, matchedKeys, expectedMatches };
    }
  }

  if (!best) {
    return { headerRowIndex: -1, parseError: "header_not_found:no_non_empty_rows" };
  }

  const minExpected = minimumExpectedMatches(tab);
  if (best.matchedKeys.size < 2 || best.expectedMatches < minExpected) {
    return {
      headerRowIndex: -1,
      parseError: `header_not_found:${tab ?? "unknown"}:matched_${best.matchedKeys.size}:expected_${best.expectedMatches}`,
    };
  }

  return { headerRowIndex: best.index };
}

export function rowsToObjects(values: unknown[][], options: { tab?: NormalizedRequiredTab } = {}): {
  headers: string[];
  normalizedHeaders: string[];
  headerRowIndex: number;
  headerRowNumber?: number;
  rows: NormalizedRow[];
  parseError?: string;
} {
  const rows = coerceRows(values);
  const { headerRowIndex, parseError } = detectNormalizedHeaderRow(rows, options.tab);
  const headers = headerRowIndex >= 0 ? rows[headerRowIndex] : [];
  const normalizedHeaders = headers.map(normalizeSheetText);
  const body = headerRowIndex >= 0 ? rows.slice(headerRowIndex + 1) : [];

  return {
    headers,
    normalizedHeaders,
    headerRowIndex,
    headerRowNumber: headerRowIndex >= 0 ? headerRowIndex + 1 : undefined,
    parseError,
    rows: body
      .filter((row) => row.some(Boolean))
      .map((row) =>
        Object.fromEntries(
          normalizedHeaders.map((header, index) => [header, row[index] ?? ""]),
        ),
      ),
  };
}

export function getCell(row: NormalizedRow, key: NormalizedColumnKey): string {
  const aliases = NORMALIZED_COLUMN_ALIASES[key].map(normalizeSheetText);
  for (const alias of aliases) {
    const value = row[alias];
    if (value !== undefined && String(value).trim()) {
      return String(value).trim();
    }
  }

  return "";
}

export function hasColumn(headers: string[], key: NormalizedColumnKey): boolean {
  const normalizedHeaders = headers.map(normalizeSheetText);
  return NORMALIZED_COLUMN_ALIASES[key]
    .map(normalizeSheetText)
    .some((alias) => normalizedHeaders.includes(alias));
}

export function parsePositiveInteger(value: string): number | undefined {
  const number = Number.parseInt(value.replace(/[^\d-]/g, ""), 10);
  return Number.isFinite(number) && number >= 0 ? number : undefined;
}

export function normalizePhoneForMatch(value: string): string {
  return value.replace(/[^\d]/g, "");
}

export function redactSheetId(value: string): string {
  if (!value) {
    return "";
  }

  return value.length <= 10 ? "[sheet-id]" : `${value.slice(0, 4)}...${value.slice(-4)}`;
}
