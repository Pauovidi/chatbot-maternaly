import type { NormalizedSheetsClient } from "@/lib/maternaly/sheets/normalized-client";
import { calculateSessionOccupancy } from "@/lib/maternaly/sheets/normalized-availability";
import { rowsToObjects } from "@/lib/maternaly/sheets/normalized-template";

export const NORMALIZED_TEST_HEADERS = {
  Servicio_Config: [["service_id", "servicio"]],
  Clientes_Local: [["nombre_completo", "telefono", "email", "idempotency_key", "created_at"]],
  Grupos_Ediciones: [["group_id", "grupo", "capacidad_total", "estado"]],
  Sesiones: [["session_id", "group_id", "sesion", "fecha", "hora_inicio", "hora_fin", "capacidad_total", "estado"]],
  Inscripciones: [["service_id", "session_id", "group_id", "estado", "nombre_completo", "telefono", "email", "people_count", "semana_embarazo", "observaciones", "source", "idempotency_key", "created_at"]],
  Interacciones_Chatbot: [["idempotency_key", "evento", "mode", "blocked_reasons", "created_at"]],
} satisfies Record<string, string[][]>;

export const REAL_TEMPLATE_TEST_HEADERS = {
  Servicio_Config: [["campo", "valor", "obligatorio", "descripcion"]],
  Clientes_Local: [[
    "cliente_id",
    "nombre",
    "apellidos",
    "telefono_normalizado",
    "email",
    "dni_nif",
    "fpp",
    "fecha_nacimiento_bebe",
    "centro_preferente",
    "canal_origen",
    "consentimiento_comunicaciones",
    "estado_cliente",
    "cliente_global_id",
    "notas_privadas",
    "fecha_alta",
    "ultima_actualizacion",
  ]],
  Grupos_Ediciones: [[
    "grupo_id",
    "servicio_id",
    "nombre_grupo",
    "centro",
    "modalidad",
    "capacidad_total",
    "estado_grupo",
    "visible_chatbot",
    "reservable_chatbot",
  ]],
  Sesiones: [[
    "sesion_id",
    "grupo_id",
    "servicio_id",
    "fecha",
    "hora_inicio",
    "hora_fin",
    "centro",
    "modalidad",
    "estado_sesion",
    "capacidad_total",
    "plazas_ocupadas",
    "plazas_disponibles",
    "visible_chatbot",
    "reservable_chatbot",
    "observaciones",
  ]],
  Inscripciones: [[
    "inscripcion_id",
    "cliente_id",
    "nombre",
    "apellidos",
    "telefono",
    "grupo_id",
    "servicio_id",
    "fecha_inscripcion",
    "canal_origen",
    "precio_acordado",
    "estado_pago",
    "estado_inscripcion",
    "fpp",
    "pareja_nombre",
    "consentimiento_comunicaciones",
    "observaciones",
  ]],
  Interacciones_Chatbot: [[
    "interaccion_id",
    "fecha_hora",
    "canal",
    "telefono",
    "cliente_id",
    "lead_id",
    "servicio_id",
    "intent",
    "mensaje_usuario_resumen",
    "respuesta_bot_resumen",
    "accion_realizada",
    "resultado",
    "requiere_humano",
    "conversation_id",
    "observaciones",
  ]],
} satisfies Record<string, string[][]>;

export interface NormalizedWorkbookOptions {
  serviceKey?: "taller_blw" | "charla_embarazo_1_20";
  registrations?: string[][];
  sessionCapacity?: string;
  multiSession?: boolean;
  visualHeaderRows?: boolean;
  realTemplate?: boolean;
}

export function createNormalizedWorkbook(options: NormalizedWorkbookOptions = {}): Record<string, unknown[][]> {
  const serviceKey = options.serviceKey ?? "taller_blw";
  const isCharla = serviceKey === "charla_embarazo_1_20";
  const serviceName = isCharla ? "Charla informativa embarazo semana 1-20" : "Taller BLW";
  const groupId = isCharla ? "grupo_charla_bilbao" : "grupo_blw_bilbao";
  const groupName = isCharla ? "Charla Bilbao presencial" : "Taller BLW Bilbao";
  const sessionId = isCharla ? "sesion_charla_bilbao_20261006" : "sesion_blw_bilbao_20260925";
  const sessionName = isCharla ? "Charla Bilbao 6 octubre" : "BLW Bilbao 25 septiembre";
  const date = isCharla ? "2026-10-06" : "2026-09-25";
  const time = isCharla ? "17:00" : "17:00";
  const endTime = isCharla ? "18:30" : "20:00";
  const extraGroupId = isCharla ? "grupo_charla_erandio" : "grupo_blw_erandio";
  const extraGroupName = isCharla ? "Charla Erandio presencial" : "Taller BLW Erandio";
  const extraSessionId = isCharla ? "sesion_charla_erandio_20260924" : "sesion_blw_erandio_20260902";
  const extraSessionName = isCharla ? "Charla Erandio 24 septiembre" : "BLW Erandio 2 septiembre";
  const extraDate = isCharla ? "2026-09-24" : "2026-09-02";
  const extraTime = isCharla ? "18:30" : time;
  const extraEndTime = isCharla ? "20:00" : endTime;
  const capacity = options.sessionCapacity ?? "3";
  const extraCapacity = options.sessionCapacity ?? "4";
  const withVisualRows = (tab: string, rows: unknown[][]) =>
    options.visualHeaderRows ? [[tab], [`Ayuda visual para ${tab}`], ...rows] : rows;

  if (options.realTemplate) {
    const center = isCharla ? "Bilbao" : "Bilbao";
    const extraCenter = "Erandio";
    return {
      Servicio_Config: withVisualRows("Servicio_Config", [
        ...REAL_TEMPLATE_TEST_HEADERS.Servicio_Config,
        ["servicio_id", serviceKey, "Sí", "ID único del servicio"],
        ["nombre_servicio", serviceName, "Sí", "Nombre comercial del servicio"],
      ]),
      Clientes_Local: withVisualRows("Clientes_Local", [...REAL_TEMPLATE_TEST_HEADERS.Clientes_Local]),
      Grupos_Ediciones: withVisualRows("Grupos_Ediciones", [
        ...REAL_TEMPLATE_TEST_HEADERS.Grupos_Ediciones,
        [groupId, serviceKey, groupName, center, "Presencial", capacity, "Activa", "sí", "sí"],
        ...(options.multiSession
          ? [[extraGroupId, serviceKey, extraGroupName, extraCenter, "Presencial", extraCapacity, "Activa", "sí", "sí"]]
          : []),
      ]),
      Sesiones: withVisualRows("Sesiones", [
        ...REAL_TEMPLATE_TEST_HEADERS.Sesiones,
        [sessionId, groupId, serviceKey, date, time, endTime, center, "Presencial", "Activa", capacity, "0", capacity, "sí", "sí", ""],
        ...(options.multiSession
          ? [[extraSessionId, extraGroupId, serviceKey, extraDate, extraTime, extraEndTime, extraCenter, "Presencial", "Activa", extraCapacity, "0", extraCapacity, "sí", "sí", ""]]
          : []),
      ]),
      Inscripciones: withVisualRows("Inscripciones", [
        ...REAL_TEMPLATE_TEST_HEADERS.Inscripciones,
        ...(options.registrations ?? []),
      ]),
      Interacciones_Chatbot: withVisualRows("Interacciones_Chatbot", [
        ...REAL_TEMPLATE_TEST_HEADERS.Interacciones_Chatbot,
      ]),
    };
  }

  return {
    Servicio_Config: withVisualRows("Servicio_Config", [
      ...NORMALIZED_TEST_HEADERS.Servicio_Config,
      [serviceKey, serviceName],
    ]),
    Clientes_Local: withVisualRows("Clientes_Local", [...NORMALIZED_TEST_HEADERS.Clientes_Local]),
    Grupos_Ediciones: withVisualRows("Grupos_Ediciones", [
      ...NORMALIZED_TEST_HEADERS.Grupos_Ediciones,
      [groupId, groupName, capacity, "Activa"],
      ...(options.multiSession ? [[extraGroupId, extraGroupName, extraCapacity, "Activa"]] : []),
    ]),
    Sesiones: withVisualRows("Sesiones", [
      ...NORMALIZED_TEST_HEADERS.Sesiones,
      [sessionId, groupId, sessionName, date, time, endTime, "", "Activa"],
      ...(options.multiSession
        ? [[extraSessionId, extraGroupId, extraSessionName, extraDate, extraTime, extraEndTime, "", "Activa"]]
        : []),
    ]),
    Inscripciones: withVisualRows("Inscripciones", [
      ...NORMALIZED_TEST_HEADERS.Inscripciones,
      ...(options.registrations ?? []),
    ]),
    Interacciones_Chatbot: withVisualRows("Interacciones_Chatbot", [...NORMALIZED_TEST_HEADERS.Interacciones_Chatbot]),
  };
}

export function createRealTemplateWorkbook(
  options: Omit<NormalizedWorkbookOptions, "realTemplate"> = {},
): Record<string, unknown[][]> {
  return createNormalizedWorkbook({ ...options, realTemplate: true, visualHeaderRows: options.visualHeaderRows ?? true });
}

export class InMemoryNormalizedSheetsClient implements NormalizedSheetsClient {
  readonly appended: Array<{
    sheetId: string;
    tabTitle: string;
    values: Array<string | number | undefined>;
  }> = [];
  readonly formattedRanges: string[] = [];
  readonly updatedCells: Array<{
    sheetId: string;
    tabTitle: string;
    rowNumber: number;
    columnIndex: number;
    value: string | number;
  }> = [];

  constructor(
    private readonly workbook: Record<string, unknown[][]>,
    private readonly options: {
      failFormatting?: boolean;
      disableFormatting?: boolean;
      failAppendTabs?: string[];
      failAppendAfterApplyTabs?: string[];
      failUpdateAfterApply?: boolean;
    } = {},
  ) {}

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
  ): Promise<{
    updatedRange?: string;
    updatedRows?: number;
    formattedRange?: string;
    formatApplied?: boolean;
    formatWarning?: string;
  }> {
    if (this.options.failAppendTabs?.includes(tabTitle)) {
      throw new Error(`synthetic_append_failure:${tabTitle}`);
    }
    this.appended.push({ sheetId, tabTitle, values });
    this.workbook[tabTitle]?.push(values);
    if (this.options.failAppendAfterApplyTabs?.includes(tabTitle)) {
      throw new Error(`synthetic_append_response_lost:${tabTitle}`);
    }
    const updatedRange = `${tabTitle}!A${this.workbook[tabTitle]?.length ?? 1}:Z${this.workbook[tabTitle]?.length ?? 1}`;
    if (this.options.failFormatting) {
      return {
        updatedRange,
        updatedRows: 1,
        formatApplied: false,
        formatWarning: "synthetic_format_failure",
      };
    }

    if (!this.options.disableFormatting) {
      this.formattedRanges.push(updatedRange);
    }

    return {
      updatedRange,
      updatedRows: 1,
      formattedRange: this.options.disableFormatting ? undefined : updatedRange,
      formatApplied: !this.options.disableFormatting,
    };
  }

  async appendRegistrationRowIfCapacityAllows(
    sheetId: string,
    tabTitle: "Inscripciones",
    values: Array<string | number | undefined>,
    guard: {
      sessionId: string;
      groupId: string;
      capacityTotal: number;
      peopleCount: number;
    },
  ) {
    const registrations = rowsToObjects(this.workbook[tabTitle] ?? [], {
      tab: "Inscripciones",
    });
    if (registrations.parseError) {
      return { applied: false, reason: registrations.parseError };
    }
    const occupied = calculateSessionOccupancy({
      registrations: registrations.rows,
      sessionId: guard.sessionId,
      groupId: guard.groupId,
    });
    if (occupied + guard.peopleCount > guard.capacityTotal) {
      return { applied: false, reason: "session_full_on_atomic_append" };
    }
    const result = await this.appendRow(sheetId, tabTitle, values);
    return { applied: true, result };
  }

  async updateCell(
    sheetId: string,
    tabTitle: string,
    rowNumber: number,
    columnIndex: number,
    value: string | number,
  ): Promise<void> {
    const row = this.workbook[tabTitle]?.[rowNumber - 1];
    if (!row) {
      throw new Error(`missing_row:${tabTitle}:${rowNumber}`);
    }
    row[columnIndex] = value;
    this.updatedCells.push({ sheetId, tabTitle, rowNumber, columnIndex, value });
    if (this.options.failUpdateAfterApply) {
      throw new Error(`synthetic_update_response_lost:${tabTitle}`);
    }
  }

  async updateCellIfRowMatches(
    sheetId: string,
    tabTitle: string,
    rowNumber: number,
    columnIndex: number,
    value: string | number,
    expectedCells: Array<{ columnIndex: number; value: string | number }>,
  ): Promise<boolean> {
    const row = this.workbook[tabTitle]?.[rowNumber - 1];
    if (!row) {
      return false;
    }
    const matches = expectedCells.every(
      (expected) => String(row[expected.columnIndex] ?? "") === String(expected.value),
    );
    if (!matches) {
      return false;
    }
    await this.updateCell(sheetId, tabTitle, rowNumber, columnIndex, value);
    return true;
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
