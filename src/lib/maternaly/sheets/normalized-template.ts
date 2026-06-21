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
  date: ["fecha", "date", "dia"],
  startTime: ["hora_inicio", "inicio", "start_time", "hora"],
  endTime: ["hora_fin", "fin", "end_time"],
  capacityTotal: ["capacidad_total", "capacidad", "cupo", "plazas_totales"],
  status: ["estado", "status"],
  clientId: ["cliente_id", "client_id", "id_cliente"],
  fullName: ["nombre_completo", "nombre", "full_name", "contacto"],
  phone: ["telefono", "teléfono", "phone", "whatsapp", "movil", "móvil"],
  email: ["email", "correo", "mail"],
  peopleCount: ["people_count", "personas", "plazas", "cantidad"],
  pregnancyWeek: ["semana_embarazo", "semana", "pregnancy_week"],
  idempotencyKey: ["idempotency_key", "clave_idempotencia", "external_id", "id_externo"],
  createdAt: ["created_at", "fecha_creacion", "creado_en"],
  source: ["source", "origen", "canal", "channel"],
  notes: ["notas", "observaciones", "notes"],
  event: ["evento", "event"],
  mode: ["mode", "modo"],
  blockedReasons: ["blocked_reasons", "motivos_bloqueo"],
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
  Clientes_Local: ["fullName", "phone", "email", "idempotencyKey"],
  Grupos_Ediciones: ["groupId", "groupName", "capacityTotal", "status"],
  Sesiones: [
    "sessionId",
    "groupId",
    "serviceId",
    "date",
    "startTime",
    "endTime",
    "capacityTotal",
    "status",
  ],
  Inscripciones: [
    "serviceId",
    "groupId",
    "sessionId",
    "fullName",
    "phone",
    "email",
    "status",
    "idempotencyKey",
  ],
  Interacciones_Chatbot: ["idempotencyKey", "createdAt", "source", "event", "notes"],
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
