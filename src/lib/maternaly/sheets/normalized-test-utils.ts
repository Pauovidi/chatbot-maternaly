import type { NormalizedSheetsClient } from "@/lib/maternaly/sheets/normalized-client";

export const NORMALIZED_TEST_HEADERS = {
  Servicio_Config: [["service_id", "servicio"]],
  Clientes_Local: [["nombre_completo", "telefono", "email", "idempotency_key", "created_at"]],
  Grupos_Ediciones: [["group_id", "grupo", "capacidad_total", "estado"]],
  Sesiones: [["session_id", "group_id", "sesion", "fecha", "hora_inicio", "capacidad_total", "estado"]],
  Inscripciones: [["service_id", "session_id", "group_id", "estado", "nombre_completo", "telefono", "email", "people_count", "semana_embarazo", "observaciones", "source", "idempotency_key", "created_at"]],
  Interacciones_Chatbot: [["idempotency_key", "evento", "mode", "blocked_reasons", "created_at"]],
} satisfies Record<string, string[][]>;

export function createNormalizedWorkbook(options: {
  serviceKey?: "taller_blw" | "charla_embarazo_1_20";
  registrations?: string[][];
  sessionCapacity?: string;
  multiSession?: boolean;
} = {}): Record<string, unknown[][]> {
  const serviceKey = options.serviceKey ?? "taller_blw";
  const isCharla = serviceKey === "charla_embarazo_1_20";
  const serviceName = isCharla ? "Charla informativa embarazo semana 1-20" : "Taller BLW";
  const groupId = isCharla ? "grupo_charla_bilbao" : "grupo_blw_bilbao";
  const groupName = isCharla ? "Charla Bilbao presencial" : "Taller BLW Bilbao";
  const sessionId = isCharla ? "sesion_charla_bilbao_20261006" : "sesion_blw_bilbao_20260925";
  const sessionName = isCharla ? "Charla Bilbao 6 octubre" : "BLW Bilbao 25 septiembre";
  const date = isCharla ? "2026-10-06" : "2026-09-25";
  const time = isCharla ? "17:00" : "17:00";
  const extraGroupId = isCharla ? "grupo_charla_erandio" : "grupo_blw_erandio";
  const extraGroupName = isCharla ? "Charla Erandio presencial" : "Taller BLW Erandio";
  const extraSessionId = isCharla ? "sesion_charla_erandio_20260924" : "sesion_blw_erandio_20260902";
  const extraSessionName = isCharla ? "Charla Erandio 24 septiembre" : "BLW Erandio 2 septiembre";
  const extraDate = isCharla ? "2026-09-24" : "2026-09-02";

  return {
    Servicio_Config: [
      ...NORMALIZED_TEST_HEADERS.Servicio_Config,
      [serviceKey, serviceName],
    ],
    Clientes_Local: [...NORMALIZED_TEST_HEADERS.Clientes_Local],
    Grupos_Ediciones: [
      ...NORMALIZED_TEST_HEADERS.Grupos_Ediciones,
      [groupId, groupName, options.sessionCapacity ?? "3", "Activa"],
      ...(options.multiSession ? [[extraGroupId, extraGroupName, "4", "Activa"]] : []),
    ],
    Sesiones: [
      ...NORMALIZED_TEST_HEADERS.Sesiones,
      [sessionId, groupId, sessionName, date, time, "", "Activa"],
      ...(options.multiSession
        ? [[extraSessionId, extraGroupId, extraSessionName, extraDate, time, "", "Activa"]]
        : []),
    ],
    Inscripciones: [
      ...NORMALIZED_TEST_HEADERS.Inscripciones,
      ...(options.registrations ?? []),
    ],
    Interacciones_Chatbot: [...NORMALIZED_TEST_HEADERS.Interacciones_Chatbot],
  };
}

export class InMemoryNormalizedSheetsClient implements NormalizedSheetsClient {
  readonly appended: Array<{
    sheetId: string;
    tabTitle: string;
    values: Array<string | number | undefined>;
  }> = [];

  constructor(private readonly workbook: Record<string, unknown[][]>) {}

  async readTabRows(_sheetId: string, tabTitle: string): Promise<unknown[][]> {
    const rows = this.workbook[tabTitle];
    if (!rows) {
      throw new Error(`missing_tab:${tabTitle}`);
    }

    return rows;
  }

  async appendRow(
    sheetId: string,
    tabTitle: string,
    values: Array<string | number | undefined>,
  ): Promise<{ updatedRange?: string; updatedRows?: number }> {
    this.appended.push({ sheetId, tabTitle, values });
    this.workbook[tabTitle]?.push(values);
    return {
      updatedRange: `${tabTitle}!A${this.workbook[tabTitle]?.length ?? 1}:Z${this.workbook[tabTitle]?.length ?? 1}`,
      updatedRows: 1,
    };
  }
}

export function normalizedTestEnv(overrides: Partial<NodeJS.ProcessEnv> = {}): NodeJS.ProcessEnv {
  return {
    ...process.env,
    MATERNALY_NORMALIZED_SHEETS_ENABLED: "true",
    MATERNALY_NORMALIZED_SHEETS_WRITE_MODE: "dry_run",
    MATERNALY_NORMALIZED_SERVICE_IDS: "taller_blw,charla_embarazo_1_20",
    MATERNALY_BLW_SHEET_ID: "sheet_blw",
    MATERNALY_CHARLA_EMBARAZO_SHEET_ID: "sheet_charla",
    MATERNALY_NORMALIZED_SHEET_IDS: "sheet_blw,sheet_charla",
    GOOGLE_SHEETS_ACCESS_MODE: "dry_run",
    BOT_SHEETS_LIVE_WRITE_ENABLED: "false",
    ...overrides,
  };
}
