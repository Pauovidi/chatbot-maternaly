import fs from "node:fs/promises";
import path from "node:path";
import { readMaternalyRuntimeConfig } from "@/lib/maternaly/config/env";
import { GoogleSheetsClient, readPublicCsvSample } from "@/lib/maternaly/sheets/client";
import { redactRows } from "@/lib/maternaly/sheets/redaction";

type ColumnHint =
  | "date"
  | "time"
  | "service"
  | "location"
  | "capacity"
  | "contact"
  | "status"
  | "payment"
  | "invoice"
  | "link";

export interface TabAudit {
  title: string;
  gid?: number;
  detectedHeaders: string[];
  sampleRows: unknown[][];
  columnHints: Record<ColumnHint, string[]>;
  emptyRowsInSample: number;
  formulaLikeCells: string[];
  safeWriteCandidates: string[];
  risks: string[];
}

export interface SpreadsheetAudit {
  spreadsheetId: string;
  title?: string;
  access: "read" | "public_read" | "not_configured" | "error";
  readMethod: "service_account" | "public_csv" | "fixtures";
  tabs: TabAudit[];
  error?: string;
}

const HINTS: Record<ColumnHint, RegExp> = {
  date: /fecha|dia|date/i,
  time: /hora|time|inicio|fin/i,
  service: /servicio|curso|actividad|taller|clase|aipap|pilates/i,
  location: /sede|centro|ubicacion|lugar|venue|bilbao|erandio|barakaldo|leioa|bec/i,
  capacity: /cupo|plazas|capacidad|libres|ocupad/i,
  contact: /nombre|telefono|email|correo|contact/i,
  status: /estado|status/i,
  payment: /pago|payment|pagad/i,
  invoice: /factura|invoice/i,
  link: /link|enlace|url|http/i,
};

function compactHeader(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

export function detectTabAudit(tab: { title: string; gid?: number }, rows: unknown[][]): TabAudit {
  const firstNonEmptyIndex = rows.findIndex((row) => row.some((cell) => String(cell ?? "").trim()));
  const headerRow = firstNonEmptyIndex >= 0 ? rows[firstNonEmptyIndex] : [];
  const headers = headerRow.map(compactHeader).filter(Boolean);
  const hints = Object.fromEntries(
    Object.entries(HINTS).map(([key, regex]) => [
      key,
      headers.filter((header) => regex.test(header)),
    ]),
  ) as Record<ColumnHint, string[]>;
  const formulaLikeCells: string[] = [];

  rows.forEach((row, rowIndex) => {
    row.forEach((cell, columnIndex) => {
      if (typeof cell === "string" && cell.trim().startsWith("=")) {
        formulaLikeCells.push(`R${rowIndex + 1}C${columnIndex + 1}`);
      }
    });
  });

  const risks = [
    headers.length === 0 ? "No se han detectado encabezados fiables." : "",
    hints.date.length === 0 ? "No hay columna de fecha clara." : "",
    hints.time.length === 0 ? "No hay columna de hora clara." : "",
    hints.service.length === 0 ? "No hay columna de servicio/curso clara." : "",
    formulaLikeCells.length > 0 ? "Hay formulas en la muestra; no se debe escribir encima." : "",
  ].filter(Boolean);

  return {
    title: tab.title,
    gid: tab.gid,
    detectedHeaders: headers,
    sampleRows: redactRows(rows.slice(0, 8)),
    columnHints: hints,
    emptyRowsInSample: rows.filter((row) => row.every((cell) => !String(cell ?? "").trim())).length,
    formulaLikeCells,
    safeWriteCandidates:
      headers.some((header) => /bot|test|log|reservas/i.test(header)) || /test|bot|log/i.test(tab.title)
        ? ["append-only candidate after Editor permission and WritePlan validation"]
        : [],
    risks,
  };
}

export class SheetAuditService {
  constructor(private readonly client = new GoogleSheetsClient()) {}

  async auditSpreadsheet(spreadsheetId: string): Promise<SpreadsheetAudit> {
    const config = readMaternalyRuntimeConfig();

    if (config.configured.googleSheets) {
      try {
        const profile = await this.client.profileSpreadsheet(spreadsheetId);
        const tabs = await Promise.all(
          profile.tabs.map(async (tab) =>
            detectTabAudit(tab, await this.client.readTabSample(spreadsheetId, tab.title)),
          ),
        );

        return {
          spreadsheetId,
          title: profile.title,
          access: "read",
          readMethod: "service_account",
          tabs,
        };
      } catch (error) {
        return {
          spreadsheetId,
          access: "error",
          readMethod: "service_account",
          tabs: [],
          error: error instanceof Error ? error.message : "Unknown Sheets error",
        };
      }
    }

    try {
      const rows = await readPublicCsvSample(spreadsheetId);
      return {
        spreadsheetId,
        title: `Public CSV ${spreadsheetId}`,
        access: "public_read",
        readMethod: "public_csv",
        tabs: [detectTabAudit({ title: "gid-0", gid: 0 }, rows)],
      };
    } catch (error) {
      return {
        spreadsheetId,
        access: "not_configured",
        readMethod: "fixtures",
        tabs: [],
        error:
          "Google service account is not configured and public CSV export is unavailable. " +
          (error instanceof Error ? error.message : "Unknown public export error"),
      };
    }
  }
}

export function renderAuditMarkdown(audits: SpreadsheetAudit[], generatedAt: string): string {
  const lines = [
    "# Maternaly Sheets audit",
    "",
    `Generated at: ${generatedAt}`,
    "",
    "This report redacts likely personal data and does not perform writes.",
    "",
  ];

  for (const audit of audits) {
    lines.push(`## ${audit.title ?? audit.spreadsheetId}`);
    lines.push(`- Spreadsheet ID: ${audit.spreadsheetId}`);
    lines.push(`- Access: ${audit.access}`);
    lines.push(`- Read method: ${audit.readMethod}`);
    if (audit.error) {
      lines.push(`- Error: ${audit.error}`);
    }

    for (const tab of audit.tabs) {
      lines.push("");
      lines.push(`### ${tab.title}`);
      lines.push(`- GID: ${tab.gid ?? "unknown"}`);
      lines.push(`- Headers: ${tab.detectedHeaders.join(", ") || "not detected"}`);
      lines.push(`- Empty rows in sample: ${tab.emptyRowsInSample}`);
      lines.push(`- Formula-like cells: ${tab.formulaLikeCells.join(", ") || "none in sample"}`);
      lines.push(`- Safe write candidates: ${tab.safeWriteCandidates.join(", ") || "none yet"}`);
      lines.push(`- Risks: ${tab.risks.join(" | ") || "none detected in sample"}`);
      lines.push("- Column hints:");
      for (const [hint, headers] of Object.entries(tab.columnHints)) {
        lines.push(`  - ${hint}: ${headers.join(", ") || "none"}`);
      }
    }

    lines.push("");
  }

  return `${lines.join("\n")}\n`;
}

export async function writeAuditReports(
  audits: SpreadsheetAudit[],
  now = new Date(),
): Promise<{ markdownPath: string; jsonPath: string }> {
  const timestamp = now.toISOString().replace(/[-:T]/g, "").slice(0, 12);
  const reportsDir = path.join(process.cwd(), "reports");
  await fs.mkdir(reportsDir, { recursive: true });
  const markdownPath = path.join(reportsDir, `maternaly_sheets_audit_${timestamp}.md`);
  const jsonPath = path.join(reportsDir, `maternaly_sheets_audit_${timestamp}.json`);

  await fs.writeFile(markdownPath, renderAuditMarkdown(audits, now.toISOString()), "utf8");
  await fs.writeFile(jsonPath, `${JSON.stringify({ generatedAt: now.toISOString(), audits }, null, 2)}\n`, "utf8");

  return { markdownPath, jsonPath };
}
