import fs from "node:fs/promises";
import path from "node:path";
import { GoogleSheetsClient } from "@/lib/maternaly/sheets/client";
import { redactCell, redactRows } from "@/lib/maternaly/sheets/redaction";

export const MATERNALY_ORIGINAL_SHEET_IDS = [
  "163BD-mjKeYGx7bjjUzW_FUYhwMUniLfHlhPnByZWOfI",
  "1p74UI3SUFgtHCc5mSdW0RnmV2pnGECBTBudJz8YF5Do",
] as const;

export const DEFAULT_MATERNALY_DEMO_PAYMENT_LINK =
  "https://app.uelzpay.com/checkout/cml6qypoi00g0qy01fkfdapmh";

const CANCELLATION_PATTERN = /\b(CANCEL[ÓO]|CANCELAD[AO]|ANULADO|NO VINO)\b/i;
const TEST_ADN_PATTERN = /\b(TEST\s*ADN|ADN|DETESEX)\b/i;

export interface CopyWriteConfig {
  copySheetIds: string[];
  writeEnabled: boolean;
  writeMode: "copy_only" | "disabled" | string;
  paymentLink: string;
  originalSheetIds: string[];
}

export interface ColumnMapping {
  date?: number;
  time?: number;
  professional?: number;
  location?: number;
  service?: number;
  firstName?: number;
  lastName?: number;
  fullName?: number;
  phone?: number;
  email?: number;
  payment?: number;
  paymentMethod?: number;
  status?: number;
  observations?: number;
  paymentLink?: number;
  formulaColumns: number[];
  doNotTouchColumns: number[];
}

export interface LastValidRowReference {
  rowNumber: number;
  values: unknown[];
  date?: string;
  time?: string;
  professional?: string;
  location?: string;
  service?: string;
  observations?: string;
}

export interface CopyTabAudit {
  title: string;
  gid?: number;
  headers: string[];
  headerRowNumber: number;
  lastNonEmptyRowNumber?: number;
  lastValidRow?: LastValidRowReference;
  columnCandidates: {
    date: string[];
    time: string[];
    professional: string[];
    location: string[];
    service: string[];
    firstName: string[];
    lastName: string[];
    fullName: string[];
    phone: string[];
    email: string[];
    payment: string[];
    paymentMethod: string[];
    status: string[];
    observations: string[];
  };
  formulaLikeColumns: string[];
  doNotTouchColumns: string[];
  risks: string[];
  score: number;
  sampleRows: unknown[][];
  proposedMapping: ColumnMapping;
}

export interface CopySpreadsheetAudit {
  spreadsheetId: string;
  spreadsheetIdRedacted: string;
  title?: string;
  access: "read" | "not_configured" | "error";
  tabs: CopyTabAudit[];
  selectedTab?: string;
  error?: string;
}

export interface ReservationWritePlan {
  operation: "append";
  targetSpreadsheetId: string;
  targetSpreadsheetIdRedacted: string;
  targetSpreadsheetTitle?: string;
  targetTab: string;
  targetRow?: number;
  targetRange?: string;
  sourceLastRowReference: LastValidRowReference;
  proposedDate: string;
  proposedTime: string;
  selectedLocation: "BILBAO" | "ERANDIO";
  service: "TEST ADN / DETESEX";
  customer: {
    fullName?: string;
    email?: string;
    phone?: string;
  };
  customerRedacted: {
    fullName?: unknown;
    email?: unknown;
    phone?: unknown;
  };
  paymentLink: string;
  fields: Record<string, string>;
  riskLevel: "low" | "medium" | "high" | "blocked";
  manualReviewRequired: boolean;
  originalSheetProtected: true;
  copyOnly: true;
  backupCreated: boolean;
  allowedByPolicy: boolean;
  blockedReason?: string;
}

export interface WriteResultReport {
  generatedAt: string;
  plan: ReservationWritePlan;
  applied: boolean;
  backup?: {
    type: "duplicated_tab" | "snapshot";
    title?: string;
    path?: string;
  };
  error?: string;
}

export interface TestAdnReservationInput {
  spreadsheetId?: string;
  tab?: string;
  fullName: string;
  email: string;
  phone?: string;
  selectedLocation: "BILBAO" | "ERANDIO";
}

export function readCopyWriteConfig(env: NodeJS.ProcessEnv = process.env): CopyWriteConfig {
  const copySheetIds = [
    env.MATERNALY_COPY_SHEET_1_ID?.trim(),
    env.MATERNALY_COPY_SHEET_2_ID?.trim(),
    ...(env.MATERNALY_COPY_SHEET_IDS?.split(",").map((id) => id.trim()) ?? []),
  ].filter((id): id is string => Boolean(id));

  return {
    copySheetIds: Array.from(new Set(copySheetIds)),
    writeEnabled: ["1", "true", "yes", "on"].includes(
      (env.MATERNALY_REAL_STRUCTURE_WRITE_ENABLED ?? "").trim().toLowerCase(),
    ),
    writeMode: env.MATERNALY_REAL_STRUCTURE_WRITE_MODE?.trim() || "disabled",
    paymentLink: env.MATERNALY_DEMO_PAYMENT_LINK?.trim() || DEFAULT_MATERNALY_DEMO_PAYMENT_LINK,
    originalSheetIds: [...MATERNALY_ORIGINAL_SHEET_IDS],
  };
}

export function redactSheetId(id: string): string {
  if (id.length <= 12) {
    return "[REDACTED_SHEET_ID]";
  }

  return `${id.slice(0, 6)}...${id.slice(-4)}`;
}

export function assertCopySheetAllowed(
  spreadsheetId: string | undefined,
  config = readCopyWriteConfig(),
): string[] {
  const errors: string[] = [];

  if (!spreadsheetId?.trim()) {
    errors.push("No copy spreadsheet ID configured.");
    return errors;
  }

  if (config.originalSheetIds.includes(spreadsheetId)) {
    errors.push("Target spreadsheet is one of the protected original Maternaly Sheets.");
  }

  if (config.copySheetIds.length === 0) {
    errors.push("No MATERNALY_COPY_SHEET_1_ID or MATERNALY_COPY_SHEET_2_ID configured.");
  }

  if (!config.copySheetIds.includes(spreadsheetId)) {
    errors.push("Target spreadsheet is not allowlisted as a copy.");
  }

  return errors;
}

export function assertCopyWriteEnabled(config = readCopyWriteConfig()): string[] {
  const errors: string[] = [];

  if (!config.writeEnabled) {
    errors.push("MATERNALY_REAL_STRUCTURE_WRITE_ENABLED is not true.");
  }

  if (config.writeMode !== "copy_only") {
    errors.push("MATERNALY_REAL_STRUCTURE_WRITE_MODE must be copy_only.");
  }

  return errors;
}

function normalizeHeader(header: string): string {
  return header
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .trim();
}

function findColumns(headers: string[], regex: RegExp): number[] {
  return headers
    .map((header, index) => ({ header: normalizeHeader(header), index }))
    .filter(({ header }) => regex.test(header))
    .map(({ index }) => index);
}

function labelHeaders(headers: string[], indexes: number[]): string[] {
  return indexes.map((index) => headers[index]).filter(Boolean);
}

export function detectColumnMapping(headers: string[], rows: unknown[][]): ColumnMapping {
  const formulaColumns = new Set<number>();
  rows.forEach((row) => {
    row.forEach((cell, index) => {
      if (typeof cell === "string" && cell.trim().startsWith("=")) {
        formulaColumns.add(index);
      }
    });
  });

  const invoiceColumns = findColumns(headers, /factura|invoice/);
  const paidDateColumns = findColumns(headers, /fecha.*pago|pago.*fecha|cobrado|pagado real/);
  const paidAmountColumns = findColumns(headers, /importe.*pag|pagad[oa]|cobro|transferencia/);

  return {
    date: findColumns(headers, /^fecha$|fecha cita|dia|date/)[0],
    time: findColumns(headers, /^hora$|hora cita|inicio/)[0],
    professional: findColumns(headers, /profesional|matrona|persona|doctor|maider/)[0],
    location: findColumns(headers, /sede|centro|ubicacion|lugar|bilbao|erandio/)[0],
    service: findColumns(headers, /servicio|prueba|test|actividad|curso|dete?sex|adn/)[0],
    firstName: findColumns(headers, /^nombre$/)[0],
    lastName: findColumns(headers, /apellido/)[0],
    fullName: findColumns(headers, /nombre.*apellido|cliente|paciente|nombre completo/)[0],
    phone: findColumns(headers, /telefono|movil|whatsapp|phone/)[0],
    email: findColumns(headers, /email|correo|mail/)[0],
    payment: findColumns(headers, /^pago$|estado pago|payment/)[0],
    paymentMethod: findColumns(headers, /forma.*pago|metodo.*pago|medio.*pago/)[0],
    status: findColumns(headers, /estado|reserva|status/)[0],
    observations: findColumns(headers, /observaciones|comentarios|notas|obs/)[0],
    paymentLink: findColumns(headers, /enlace.*pago|link.*pago|uelz/)[0],
    formulaColumns: [...formulaColumns],
    doNotTouchColumns: Array.from(new Set([...formulaColumns, ...invoiceColumns, ...paidDateColumns, ...paidAmountColumns])),
  };
}

function getMappedValue(row: unknown[], index: number | undefined): string | undefined {
  if (index === undefined) {
    return undefined;
  }

  const value = String(row[index] ?? "").trim();
  return value || undefined;
}

function isNonEmptyRow(row: unknown[]): boolean {
  return row.some((cell) => String(cell ?? "").trim());
}

export function findLastValidRow(rows: unknown[][], mapping: ColumnMapping): LastValidRowReference | undefined {
  for (let index = rows.length - 1; index >= 0; index -= 1) {
    const row = rows[index];
    if (!isNonEmptyRow(row)) {
      continue;
    }

    const joined = row.map((cell) => String(cell ?? "")).join(" ");
    if (CANCELLATION_PATTERN.test(joined)) {
      continue;
    }

    return {
      rowNumber: index + 1,
      values: redactRows([row])[0],
      date: getMappedValue(row, mapping.date),
      time: getMappedValue(row, mapping.time),
      professional: getMappedValue(row, mapping.professional),
      location: getMappedValue(row, mapping.location),
      service: getMappedValue(row, mapping.service),
      observations: getMappedValue(row, mapping.observations),
    };
  }

  return undefined;
}

function detectHeaderRow(rows: unknown[][]): { headers: string[]; rowNumber: number } {
  const scored = rows.slice(0, 20).map((row, index) => {
    const headers = row.map((cell) => String(cell ?? "").trim());
    const joined = normalizeHeader(headers.join(" "));
    const score = [
      /fecha/.test(joined),
      /hora/.test(joined),
      /nombre|paciente|cliente/.test(joined),
      /telefono|email|correo/.test(joined),
      /servicio|prueba|test/.test(joined),
      /sede|centro|ubicacion/.test(joined),
    ].filter(Boolean).length;
    return { headers, rowNumber: index + 1, score };
  });
  const best = scored.sort((a, b) => b.score - a.score)[0];

  return best && best.score > 0 ? best : { headers: rows[0]?.map((cell) => String(cell ?? "").trim()) ?? [], rowNumber: 1 };
}

export function addDaysLiteral(date: string, days: number): string {
  const match = date.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (!match) {
    throw new Error(`Unsupported date format: ${date}`);
  }

  const dateValue = new Date(Date.UTC(Number(match[3]), Number(match[2]) - 1, Number(match[1])));
  dateValue.setUTCDate(dateValue.getUTCDate() + days);
  return `${String(dateValue.getUTCDate()).padStart(2, "0")}/${String(dateValue.getUTCMonth() + 1).padStart(2, "0")}/${dateValue.getUTCFullYear()}`;
}

export function buildTestAdnProposal(lastRow: LastValidRowReference): {
  proposedDate: string;
  proposedTime: "18:20";
  defaultLocation: "BILBAO" | "ERANDIO";
} {
  return {
    proposedDate: addDaysLiteral(lastRow.date ?? "04/06/2026", 4),
    proposedTime: "18:20",
    defaultLocation: /erandio/i.test(lastRow.location ?? "") ? "ERANDIO" : "BILBAO",
  };
}

function scoreTab(headers: string[], rows: unknown[][]): number {
  const joinedHeaders = normalizeHeader(headers.join(" "));
  const joinedRows = rows.map((row) => row.join(" ")).join(" ");
  return [
    /fecha/.test(joinedHeaders),
    /hora/.test(joinedHeaders),
    /sede|centro|ubicacion/.test(joinedHeaders),
    /servicio|prueba|test|adn|detesex/.test(joinedHeaders),
    /nombre|paciente|cliente/.test(joinedHeaders),
    TEST_ADN_PATTERN.test(joinedRows),
  ].filter(Boolean).length;
}

export function auditTab(title: string, gid: number | undefined, rows: unknown[][]): CopyTabAudit {
  const header = detectHeaderRow(rows);
  const mapping = detectColumnMapping(header.headers, rows);
  const lastValidRow = findLastValidRow(rows, mapping);
  const candidates = {
    date: labelHeaders(header.headers, findColumns(header.headers, /^fecha$|fecha cita|dia|date/)),
    time: labelHeaders(header.headers, findColumns(header.headers, /^hora$|hora cita|inicio/)),
    professional: labelHeaders(header.headers, findColumns(header.headers, /profesional|matrona|persona|doctor|maider/)),
    location: labelHeaders(header.headers, findColumns(header.headers, /sede|centro|ubicacion|lugar|bilbao|erandio/)),
    service: labelHeaders(header.headers, findColumns(header.headers, /servicio|prueba|test|actividad|curso|dete?sex|adn/)),
    firstName: labelHeaders(header.headers, findColumns(header.headers, /^nombre$/)),
    lastName: labelHeaders(header.headers, findColumns(header.headers, /apellido/)),
    fullName: labelHeaders(header.headers, findColumns(header.headers, /nombre.*apellido|cliente|paciente|nombre completo/)),
    phone: labelHeaders(header.headers, findColumns(header.headers, /telefono|movil|whatsapp|phone/)),
    email: labelHeaders(header.headers, findColumns(header.headers, /email|correo|mail/)),
    payment: labelHeaders(header.headers, findColumns(header.headers, /^pago$|estado pago|payment/)),
    paymentMethod: labelHeaders(header.headers, findColumns(header.headers, /forma.*pago|metodo.*pago|medio.*pago/)),
    status: labelHeaders(header.headers, findColumns(header.headers, /estado|reserva|status/)),
    observations: labelHeaders(header.headers, findColumns(header.headers, /observaciones|comentarios|notas|obs/)),
  };
  const risks = [
    !lastValidRow ? "No last valid non-cancelled row detected." : "",
    mapping.date === undefined ? "No date column detected." : "",
    mapping.time === undefined ? "No time column detected." : "",
    mapping.service === undefined ? "No service/test column detected." : "",
    mapping.doNotTouchColumns.length ? "Formula or real payment/invoice columns detected; append only." : "",
  ].filter(Boolean);

  return {
    title,
    gid,
    headers: header.headers.filter(Boolean),
    headerRowNumber: header.rowNumber,
    lastNonEmptyRowNumber: rows.findLastIndex(isNonEmptyRow) + 1 || undefined,
    lastValidRow,
    columnCandidates: candidates,
    formulaLikeColumns: mapping.formulaColumns.map((index) => header.headers[index] || `column_${index + 1}`),
    doNotTouchColumns: mapping.doNotTouchColumns.map((index) => header.headers[index] || `column_${index + 1}`),
    risks,
    score: scoreTab(header.headers, rows),
    sampleRows: redactRows(rows.slice(Math.max(0, header.rowNumber - 1), header.rowNumber + 7)),
    proposedMapping: mapping,
  };
}

export function selectBestTestAdnTab(audit: CopySpreadsheetAudit): CopyTabAudit | undefined {
  return [...audit.tabs].sort((a, b) => b.score - a.score)[0];
}

export class CopySheetsRealWriteService {
  constructor(private readonly client = new GoogleSheetsClient()) {}

  async auditCopies(config = readCopyWriteConfig()): Promise<CopySpreadsheetAudit[]> {
    if (config.copySheetIds.length === 0) {
      return [
        {
          spreadsheetId: "",
          spreadsheetIdRedacted: "[missing]",
          access: "not_configured",
          tabs: [],
          error: "MATERNALY_COPY_SHEET_1_ID and MATERNALY_COPY_SHEET_2_ID are not configured.",
        },
      ];
    }

    return Promise.all(
      config.copySheetIds.map(async (spreadsheetId) => {
        const blocked = assertCopySheetAllowed(spreadsheetId, config);
        if (blocked.length > 0) {
          return {
            spreadsheetId,
            spreadsheetIdRedacted: redactSheetId(spreadsheetId),
            access: "error" as const,
            tabs: [],
            error: blocked.join(" | "),
          };
        }

        try {
          const profile = await this.client.profileSpreadsheet(spreadsheetId);
          const tabs = await Promise.all(
            profile.tabs.map(async (tab) =>
              auditTab(tab.title, tab.gid, await this.client.readTabSample(spreadsheetId, tab.title, "A1:AZ1000")),
            ),
          );
          const audit: CopySpreadsheetAudit = {
            spreadsheetId,
            spreadsheetIdRedacted: redactSheetId(spreadsheetId),
            title: profile.title,
            access: "read",
            tabs,
          };
          audit.selectedTab = selectBestTestAdnTab(audit)?.title;
          return audit;
        } catch (error) {
          return {
            spreadsheetId,
            spreadsheetIdRedacted: redactSheetId(spreadsheetId),
            access: "error" as const,
            tabs: [],
            error: error instanceof Error ? error.message : "Unknown Sheets error",
          };
        }
      }),
    );
  }

  buildPlanFromAudit(
    audit: CopySpreadsheetAudit,
    input: TestAdnReservationInput,
    config = readCopyWriteConfig(),
  ): ReservationWritePlan {
    const targetTab = input.tab
      ? audit.tabs.find((tab) => tab.title === input.tab)
      : selectBestTestAdnTab(audit);
    const lastRow = targetTab?.lastValidRow ?? {
      rowNumber: 1,
      values: [],
      date: "04/06/2026",
      time: "17:10",
      professional: "MAIDER",
      location: "BILBAO",
      service: "DETESEX",
    };
    const proposal = buildTestAdnProposal(lastRow);
    const selectedLocation = input.selectedLocation;
    const fields: Record<string, string> = {
      service: "TEST ADN / DETESEX",
      location: selectedLocation,
      date: proposal.proposedDate,
      time: proposal.proposedTime,
      professional: lastRow.professional ?? "",
      status: "RESERVA FIJADA PENDIENTE DE PAGO",
      paymentMethod: "UELZ",
      payment: "PENDIENTE",
      observations: `Reserva generada por bot Maternaly demo. Pendiente de pago. Enlace Uelz: ${config.paymentLink}`,
      fullName: input.fullName,
      email: input.email,
      phone: input.phone ?? "",
      paymentLink: config.paymentLink,
    };
    const policyErrors = [
      ...assertCopySheetAllowed(audit.spreadsheetId, config),
      ...assertCopyWriteEnabled(config),
    ];

    return {
      operation: "append",
      targetSpreadsheetId: audit.spreadsheetId,
      targetSpreadsheetIdRedacted: audit.spreadsheetIdRedacted,
      targetSpreadsheetTitle: audit.title,
      targetTab: targetTab?.title ?? "UNKNOWN",
      sourceLastRowReference: lastRow,
      proposedDate: proposal.proposedDate,
      proposedTime: proposal.proposedTime,
      selectedLocation,
      service: "TEST ADN / DETESEX",
      customer: {
        fullName: input.fullName,
        email: input.email,
        phone: input.phone,
      },
      customerRedacted: {
        fullName: redactCell(input.fullName),
        email: redactCell(input.email),
        phone: input.phone ? redactCell(input.phone) : undefined,
      },
      paymentLink: config.paymentLink,
      fields,
      riskLevel: policyErrors.length || !targetTab ? "blocked" : "medium",
      manualReviewRequired: Boolean(policyErrors.length || !targetTab),
      originalSheetProtected: true,
      copyOnly: true,
      backupCreated: false,
      allowedByPolicy: policyErrors.length === 0,
      blockedReason: policyErrors.join(" | ") || (!targetTab ? "No target tab detected." : undefined),
    };
  }

  buildAppendValues(plan: ReservationWritePlan, mapping: ColumnMapping, headerLength: number): Array<string | number | undefined> {
    const values: Array<string | number | undefined> = Array.from({ length: Math.max(headerLength, 1) });
    const set = (index: number | undefined, value: string | undefined) => {
      if (index !== undefined && !mapping.doNotTouchColumns.includes(index)) {
        values[index] = value;
      }
    };

    set(mapping.date, plan.proposedDate);
    set(mapping.time, plan.proposedTime);
    set(mapping.professional, plan.fields.professional);
    set(mapping.location, plan.selectedLocation);
    set(mapping.service, plan.service);
    set(mapping.fullName, plan.customer.fullName);
    set(mapping.firstName, plan.customer.fullName?.split(/\s+/)[0]);
    set(mapping.lastName, plan.customer.fullName?.split(/\s+/).slice(1).join(" "));
    set(mapping.phone, plan.customer.phone);
    set(mapping.email, plan.customer.email);
    set(mapping.status, plan.fields.status);
    set(mapping.paymentMethod, plan.fields.paymentMethod);
    set(mapping.payment, plan.fields.payment);
    set(mapping.observations, plan.fields.observations);
    set(mapping.paymentLink, plan.paymentLink);

    return values;
  }

  async writeTestAdnReservation(input: TestAdnReservationInput): Promise<WriteResultReport> {
    const config = readCopyWriteConfig();
    const audits = await this.auditCopies(config);
    const targetAudit = input.spreadsheetId
      ? audits.find((audit) => audit.spreadsheetId === input.spreadsheetId)
      : audits.find((audit) => audit.access === "read");
    const fallbackAudit = targetAudit ?? audits[0] ?? {
      spreadsheetId: input.spreadsheetId ?? "",
      spreadsheetIdRedacted: input.spreadsheetId ? redactSheetId(input.spreadsheetId) : "[missing]",
      access: "not_configured" as const,
      tabs: [],
    };
    if (!targetAudit) {
      const plan = this.buildPlanFromAudit(fallbackAudit, input, config);
      return { generatedAt: new Date().toISOString(), plan, applied: false, error: "No readable target copy audit." };
    }

    const plan = this.buildPlanFromAudit(targetAudit, input, config);
    const targetTab = targetAudit.tabs.find((tab) => tab.title === plan.targetTab);
    if (!plan.allowedByPolicy || targetTab?.gid === undefined) {
      return { generatedAt: new Date().toISOString(), plan, applied: false, error: plan.blockedReason ?? "Write blocked." };
    }

    const timestamp = new Date().toISOString().replace(/[-:T]/g, "").slice(0, 12);
    const backupTitle = `BACKUP_BOT_${timestamp}_${targetTab.title}`.slice(0, 99);
    let backupCreated = false;
    let backup: WriteResultReport["backup"];
    try {
      const duplicated = await this.client.duplicateTab(targetAudit.spreadsheetId, targetTab.gid, backupTitle);
      backupCreated = true;
      backup = { type: "duplicated_tab", title: duplicated.title };
    } catch (error) {
      const reportsDir = path.join(process.cwd(), "reports");
      await fs.mkdir(reportsDir, { recursive: true });
      const snapshotPath = path.join(reportsDir, `maternaly_copy_sheet_backup_${timestamp}.json`);
      await fs.writeFile(snapshotPath, `${JSON.stringify({ generatedAt: new Date().toISOString(), audit: targetAudit }, null, 2)}\n`, "utf8");
      backupCreated = true;
      backup = { type: "snapshot", path: snapshotPath };
      if (/403|permission/i.test(error instanceof Error ? error.message : "")) {
        return {
          generatedAt: new Date().toISOString(),
          plan: { ...plan, backupCreated },
          applied: false,
          backup,
          error: "Google Sheets returned 403 while creating duplicated-tab backup. Check Editor permissions.",
        };
      }
    }

    if (!backupCreated) {
      return { generatedAt: new Date().toISOString(), plan, applied: false, error: "Backup was not created; aborting write." };
    }

    const values = this.buildAppendValues(plan, targetTab.proposedMapping, targetTab.headers.length);
    try {
      const append = await this.client.appendRow(targetAudit.spreadsheetId, targetTab.title, values);
      return {
        generatedAt: new Date().toISOString(),
        plan: {
          ...plan,
          backupCreated,
          targetRange: append.updatedRange,
          targetRow: append.updatedRange?.match(/![A-Z]+(\d+):/) ? Number(append.updatedRange.match(/![A-Z]+(\d+):/)?.[1]) : undefined,
        },
        applied: true,
        backup,
      };
    } catch (error) {
      return {
        generatedAt: new Date().toISOString(),
        plan: { ...plan, backupCreated },
        applied: false,
        backup,
        error: error instanceof Error && /403|permission/i.test(error.message)
          ? "Google Sheets returned 403. Check that the service account is Editor on the copy."
          : error instanceof Error ? error.message : "Unknown append error",
      };
    }
  }
}

export function renderCopyAuditMarkdown(audits: CopySpreadsheetAudit[], generatedAt: string): string {
  const lines = [
    "# Maternaly copy Sheets real-structure write audit",
    "",
    `Generated at: ${generatedAt}`,
    "",
    "Scope: copy-only. Original Sheet IDs are protected and must not be written.",
    "",
  ];

  for (const audit of audits) {
    lines.push(`## ${audit.title ?? "Copy Sheet"}`);
    lines.push(`- Spreadsheet ID: ${audit.spreadsheetIdRedacted}`);
    lines.push(`- Access: ${audit.access}`);
    lines.push(`- Selected Test ADN / Detesex tab: ${audit.selectedTab ?? "not detected"}`);
    if (audit.error) {
      lines.push(`- Error: ${audit.error}`);
    }

    for (const tab of audit.tabs) {
      lines.push("");
      lines.push(`### ${tab.title}`);
      lines.push(`- GID: ${tab.gid ?? "unknown"}`);
      lines.push(`- Headers: ${tab.headers.join(", ") || "not detected"}`);
      lines.push(`- Last non-empty row: ${tab.lastNonEmptyRowNumber ?? "not detected"}`);
      lines.push(`- Last valid row: ${tab.lastValidRow?.rowNumber ?? "not detected"}`);
      lines.push(`- Last valid row extracted: date=${tab.lastValidRow?.date ?? "n/a"}, time=${tab.lastValidRow?.time ?? "n/a"}, professional=${tab.lastValidRow?.professional ?? "n/a"}, location=${tab.lastValidRow?.location ?? "n/a"}, service=${tab.lastValidRow?.service ?? "n/a"}`);
      lines.push(`- Formula-like columns: ${tab.formulaLikeColumns.join(", ") || "none detected"}`);
      lines.push(`- Do-not-touch columns: ${tab.doNotTouchColumns.join(", ") || "none detected"}`);
      lines.push(`- Risks: ${tab.risks.join(" | ") || "none detected"}`);
      lines.push("- Column candidates:");
      for (const [key, value] of Object.entries(tab.columnCandidates)) {
        lines.push(`  - ${key}: ${value.join(", ") || "none"}`);
      }
      lines.push("- Proposed write: append a new row only, mapping detected empty cells in the new row.");
    }
    lines.push("");
  }

  return `${lines.join("\n")}\n`;
}

export async function writeCopyAuditReports(
  audits: CopySpreadsheetAudit[],
  now = new Date(),
): Promise<{ markdownPath: string; jsonPath: string }> {
  const timestamp = now.toISOString().replace(/[-:T]/g, "").slice(0, 12);
  const reportsDir = path.join(process.cwd(), "reports");
  await fs.mkdir(reportsDir, { recursive: true });
  const markdownPath = path.join(reportsDir, `maternaly_copy_sheets_write_audit_${timestamp}.md`);
  const jsonPath = path.join(reportsDir, `maternaly_copy_sheets_write_audit_${timestamp}.json`);

  const redactedAudits = audits.map((audit) => ({
    ...audit,
    spreadsheetId: audit.spreadsheetIdRedacted,
  }));

  await fs.writeFile(markdownPath, renderCopyAuditMarkdown(audits, now.toISOString()), "utf8");
  await fs.writeFile(jsonPath, `${JSON.stringify({ generatedAt: now.toISOString(), audits: redactedAudits }, null, 2)}\n`, "utf8");
  return { markdownPath, jsonPath };
}

export async function writeCopyWriteResultReports(
  report: WriteResultReport,
  now = new Date(),
): Promise<{ markdownPath: string; jsonPath: string }> {
  const timestamp = now.toISOString().replace(/[-:T]/g, "").slice(0, 12);
  const reportsDir = path.join(process.cwd(), "reports");
  await fs.mkdir(reportsDir, { recursive: true });
  const markdownPath = path.join(reportsDir, `maternaly_copy_sheet_write_result_${timestamp}.md`);
  const jsonPath = path.join(reportsDir, `maternaly_copy_sheet_write_result_${timestamp}.json`);
  const lines = [
    "# Maternaly copy Sheet write result",
    "",
    `Generated at: ${report.generatedAt}`,
    `Applied: ${report.applied ? "yes" : "no"}`,
    `Target spreadsheet: ${report.plan.targetSpreadsheetIdRedacted}`,
    `Target tab: ${report.plan.targetTab}`,
    `Operation: ${report.plan.operation}`,
    `Target range: ${report.plan.targetRange ?? "not written"}`,
    `Backup: ${report.plan.backupCreated ? "created" : "not created"}`,
    `Policy allowed: ${report.plan.allowedByPolicy ? "yes" : "no"}`,
    `Proposed date/time: ${report.plan.proposedDate} ${report.plan.proposedTime}`,
    `Location: ${report.plan.selectedLocation}`,
    `Customer: ${String(report.plan.customerRedacted.fullName ?? "")}, ${String(report.plan.customerRedacted.email ?? "")}, ${String(report.plan.customerRedacted.phone ?? "")}`,
    `Payment link: ${report.plan.paymentLink}`,
    `Error: ${report.error ?? "none"}`,
    "",
  ];

  const redactedReport = {
    ...report,
    plan: {
      ...report.plan,
      targetSpreadsheetId: report.plan.targetSpreadsheetIdRedacted,
      customer: report.plan.customerRedacted,
      fields: {
        ...report.plan.fields,
        fullName: String(report.plan.customerRedacted.fullName ?? ""),
        email: String(report.plan.customerRedacted.email ?? ""),
        phone: String(report.plan.customerRedacted.phone ?? ""),
      },
    },
  };

  await fs.writeFile(markdownPath, `${lines.join("\n")}\n`, "utf8");
  await fs.writeFile(jsonPath, `${JSON.stringify(redactedReport, null, 2)}\n`, "utf8");
  return { markdownPath, jsonPath };
}
