import { createHash } from "node:crypto";
import {
  CLIENTS_SHEET_HEADERS,
  type ClientImportDryRunReport,
} from "./types";
import {
  hasDangerousClientNote,
  isTruthyCell,
  normalizeEmail,
  normalizePhone,
} from "./normalize";

export interface PdfExtractedClientRow {
  page: number;
  rowIndex: number;
  activo?: string;
  fechaAlta?: string;
  fechaBaja?: string;
  nombre?: string;
  nif?: string;
  telefonoFijo?: string;
  telefonoMovil?: string;
  email?: string;
}

export interface PdfClientImportRow {
  activo: string;
  fecha_alta: string;
  fecha_baja: string;
  nombre: string;
  nif: string;
  telefono_fijo: string;
  telefono_movil: string;
  telefono_normalizado: string;
  email: string;
  notas: string;
  bloqueado_no_reservar: string;
  origen: string;
  updated_at: string;
  sourceHash: string;
  hasContact: boolean;
  rejectedReason?: string;
}

export interface PdfClientDryRunReport extends ClientImportDryRunReport {
  pdfFound: boolean;
  extractionMethod: string;
  pagesDetected: number;
  totalRowsDetected: number;
  parsedRows: number;
  validRows: number;
  rowsWithoutContact: number;
  duplicateEmails: number;
  ambiguousRows: number;
  rejectedRows: number;
  parseConfidencePct: number;
  sampleShapeOnly?: {
    activo: boolean;
    hasFechaAlta: boolean;
    hasNombre: boolean;
    hasTelefonoMovil: boolean;
    hasEmail: boolean;
    blocked: boolean;
  };
}

export interface PdfClientParseResult {
  rows: PdfClientImportRow[];
  report: PdfClientDryRunReport;
}

const DATE_PATTERN =
  /^(\d{1,2}[./-]\d{1,2}[./-]\d{2,4}|\d{4}[./-]\d{1,2}[./-]\d{1,2})$/;
const NIF_LIKE_PATTERN = /\b[XYZ]?\d{5,8}[A-Z]\b|\b[A-Z]\d{7,8}\b/i;
const DANGEROUS_NOTE_PATTERNS = [
  /NO\s+COGER\s+RESERVAS?/i,
  /\bINFORMAL\b/i,
  /NO\s+VINO/i,
  /NO\s+ES\s+FORM/i,
];

function cleanCell(value?: string): string {
  return String(value ?? "")
    .replace(/\s+/g, " ")
    .trim();
}

function stripDangerousNotesFromName(name: string): { name: string; notes: string } {
  const notes = new Set<string>();
  let nextName = name;
  for (const pattern of DANGEROUS_NOTE_PATTERNS) {
    if (pattern.test(nextName)) {
      notes.add("NO COGER RESERVA");
      nextName = nextName.replace(pattern, " ");
    }
  }

  return {
    name: cleanCell(nextName),
    notes: Array.from(notes).join("; "),
  };
}

function hashRow(row: PdfExtractedClientRow): string {
  return createHash("sha256")
    .update(
      [
        row.page,
        row.rowIndex,
        row.activo,
        row.fechaAlta,
        row.fechaBaja,
        row.nombre,
        row.telefonoFijo,
        row.telefonoMovil,
        row.email,
      ].join("|"),
    )
    .digest("hex")
    .slice(0, 12);
}

export function parsePdfExtractedClientRows(input: {
  rows: PdfExtractedClientRow[];
  pagesDetected: number;
  extractionMethod: string;
  now?: string;
}): PdfClientParseResult {
  const now = input.now ?? new Date().toISOString();
  const parsed = input.rows.map((row) => {
    const rawName = cleanCell(row.nombre);
    const noteExtraction = stripDangerousNotesFromName(rawName);
    const fixedPhone = cleanCell(row.telefonoFijo);
    const mobilePhone = cleanCell(row.telefonoMovil);
    const normalizedPhone =
      normalizePhone(mobilePhone) ?? normalizePhone(fixedPhone) ?? "";
    const email = normalizeEmail(cleanCell(row.email)) ?? cleanCell(row.email);
    const blocked =
      hasDangerousClientNote(noteExtraction.notes) ||
      hasDangerousClientNote(rawName);
    const activo = isTruthyCell(row.activo) ? "true" : "false";
    const hasContact = Boolean(normalizedPhone || normalizeEmail(email));
    const dateLooksValid =
      !cleanCell(row.fechaAlta) || DATE_PATTERN.test(cleanCell(row.fechaAlta));

    return {
      activo,
      fecha_alta: cleanCell(row.fechaAlta),
      fecha_baja: cleanCell(row.fechaBaja),
      nombre: noteExtraction.name,
      nif: cleanCell(row.nif),
      telefono_fijo: fixedPhone,
      telefono_movil: mobilePhone,
      telefono_normalizado: normalizedPhone,
      email,
      notas: noteExtraction.notes,
      bloqueado_no_reservar: blocked ? "true" : "",
      origen: "pdf_import_bbdd_clientes",
      updated_at: now,
      sourceHash: hashRow(row),
      hasContact,
      rejectedReason:
        !noteExtraction.name
          ? "missing_name"
          : !dateLooksValid
            ? "invalid_fecha_alta"
            : undefined,
    } satisfies PdfClientImportRow;
  });

  const validRows = parsed.filter((row) => !row.rejectedReason);
  const phoneCounts = countDuplicates(
    validRows.map((row) => row.telefono_normalizado).filter(Boolean),
  );
  const emailCounts = countDuplicates(
    validRows
      .map((row) => normalizeEmail(row.email) ?? "")
      .filter(Boolean),
  );
  const sample = validRows[0];
  const report: PdfClientDryRunReport = {
    pdfFound: true,
    extractionMethod: input.extractionMethod,
    pagesDetected: input.pagesDetected,
    totalRows: parsed.length,
    totalRowsDetected: input.rows.length,
    parsedRows: parsed.length,
    validRows: validRows.length,
    validPhones: validRows.filter((row) => Boolean(row.telefono_normalizado)).length,
    validEmails: validRows.filter((row) => Boolean(normalizeEmail(row.email))).length,
    rowsWithoutContact: validRows.filter((row) => !row.hasContact).length,
    duplicatePhones: phoneCounts,
    duplicateEmails: emailCounts,
    blockedWarnings: validRows.filter((row) => row.bloqueado_no_reservar === "true").length,
    ambiguousRows: phoneCounts + emailCounts,
    rejectedRows: parsed.filter((row) => row.rejectedReason).length,
    missingNames: parsed.filter((row) => !row.nombre).length,
    parseConfidencePct:
      parsed.length === 0 ? 0 : Math.round((validRows.length / parsed.length) * 10000) / 100,
    sampleShapeOnly: sample
      ? {
          activo: sample.activo === "true" || sample.activo === "false",
          hasFechaAlta: Boolean(sample.fecha_alta),
          hasNombre: Boolean(sample.nombre),
          hasTelefonoMovil: Boolean(sample.telefono_movil),
          hasEmail: Boolean(sample.email),
          blocked: sample.bloqueado_no_reservar === "true",
        }
      : undefined,
  };

  return { rows: validRows, report };
}

function countDuplicates(values: string[]): number {
  const counts = new Map<string, number>();
  for (const value of values) {
    counts.set(value, (counts.get(value) ?? 0) + 1);
  }
  return Array.from(counts.values()).filter((count) => count > 1).length;
}

export function rowsToClientSheetMatrix(rows: PdfClientImportRow[]): string[][] {
  return rows.map((row) => [
    row.activo,
    row.fecha_alta,
    row.fecha_baja,
    row.nombre,
    row.nif,
    row.telefono_fijo,
    row.telefono_movil,
    row.telefono_normalizado,
    row.email,
    row.notas,
    row.bloqueado_no_reservar,
    row.origen,
    row.updated_at,
  ]);
}

export function serializeClientRowsAsCsv(rows: PdfClientImportRow[]): string {
  const matrix = [[...CLIENTS_SHEET_HEADERS], ...rowsToClientSheetMatrix(rows)];
  return matrix
    .map((row) =>
      row
        .map((cell) => {
          const value = String(cell ?? "");
          return /[",\n\r]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
        })
        .join(","),
    )
    .join("\n");
}

export function looksLikeNif(value: string): boolean {
  return NIF_LIKE_PATTERN.test(value);
}
