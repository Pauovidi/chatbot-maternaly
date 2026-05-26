import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import {
  CLIENTS_SHEET_NAME,
  backupClientsSheet,
  createClientsSheetsContext,
  ensureClientsSheet,
  quoteSheetRange,
} from "./hotel-clients-sheet";
import {
  CLIENTS_SHEET_HEADERS,
  type ClientImportDryRunReport,
  hasDangerousClientNote,
  isTruthyCell,
  normalizeEmail,
  normalizePhone,
} from "../src/lib/hotel/clients";

interface CliOptions {
  file?: string;
  apply: boolean;
}

function parseArgs(argv: string[]): CliOptions {
  const options: CliOptions = { apply: false };
  for (let index = 0; index < argv.length; index += 1) {
    const value = argv[index];
    if (value === "--file" || value === "--source") {
      options.file = argv[index + 1];
      index += 1;
    } else if (value === "--apply") {
      options.apply = true;
    } else if (value === "--dry-run") {
      options.apply = false;
    }
  }
  return options;
}

function parseDelimited(content: string, delimiter: "," | "\t"): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;

  for (let index = 0; index < content.length; index += 1) {
    const char = content[index];
    const next = content[index + 1];

    if (char === '"' && quoted && next === '"') {
      cell += '"';
      index += 1;
    } else if (char === '"') {
      quoted = !quoted;
    } else if (char === delimiter && !quoted) {
      row.push(cell);
      cell = "";
    } else if ((char === "\n" || char === "\r") && !quoted) {
      if (char === "\r" && next === "\n") {
        index += 1;
      }
      row.push(cell);
      if (row.some((value) => value.trim())) {
        rows.push(row);
      }
      row = [];
      cell = "";
    } else {
      cell += char;
    }
  }

  row.push(cell);
  if (row.some((value) => value.trim())) {
    rows.push(row);
  }

  return rows;
}

function normalizeHeader(value: string): string {
  return value
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .trim()
    .toLowerCase()
    .replace(/[.\s-]+/g, "_");
}

function buildHeaderIndex(headers: string[]) {
  const map = new Map<string, number>();
  headers.forEach((header, index) => map.set(normalizeHeader(header), index));
  return map;
}

function readByAliases(row: string[], headerIndex: Map<string, number>, aliases: string[]) {
  for (const alias of aliases) {
    const index = headerIndex.get(alias);
    if (index !== undefined) {
      return String(row[index] ?? "").trim();
    }
  }
  return "";
}

function mapRows(rows: string[][]): string[][] {
  const headerIndex = buildHeaderIndex(rows[0] ?? []);
  const now = new Date().toISOString();

  return rows.slice(1).map((row) => {
    const fijo = readByAliases(row, headerIndex, ["tel_fijo", "telefono_fijo", "telefono"]);
    const movil = readByAliases(row, headerIndex, ["tel_movil", "telefono_movil", "movil", "telefono"]);
    const notas = readByAliases(row, headerIndex, ["notas", "observaciones"]);
    const blocked =
      isTruthyCell(readByAliases(row, headerIndex, ["bloqueado_no_reservar", "bloqueado"])) ||
      hasDangerousClientNote(notas);
    const normalizedPhone =
      normalizePhone(
        readByAliases(row, headerIndex, ["telefono_normalizado", "telefono_norm"]) ||
          movil ||
          fijo,
      ) ?? "";
    const email =
      normalizeEmail(readByAliases(row, headerIndex, ["email", "correo"])) ??
      readByAliases(row, headerIndex, ["email", "correo"]);

    return [
      readByAliases(row, headerIndex, ["activo"]) || "true",
      readByAliases(row, headerIndex, ["fecha_alta"]),
      readByAliases(row, headerIndex, ["fecha_baja"]),
      readByAliases(row, headerIndex, ["nombre", "cliente", "propietario"]),
      readByAliases(row, headerIndex, ["nif", "dni"]),
      fijo,
      movil,
      normalizedPhone,
      email,
      notas,
      blocked ? "true" : "",
      readByAliases(row, headerIndex, ["origen"]) || "import_csv_tsv",
      readByAliases(row, headerIndex, ["updated_at"]) || now,
    ];
  });
}

function buildReport(rows: string[][]): ClientImportDryRunReport {
  const phoneCounts = new Map<string, number>();
  for (const row of rows) {
    const phone = row[7];
    if (phone) {
      phoneCounts.set(phone, (phoneCounts.get(phone) ?? 0) + 1);
    }
  }

  return {
    totalRows: rows.length,
    validPhones: rows.filter((row) => Boolean(row[7])).length,
    validEmails: rows.filter((row) => Boolean(normalizeEmail(row[8] ?? ""))).length,
    duplicatePhones: Array.from(phoneCounts.values()).filter((count) => count > 1).length,
    blockedWarnings: rows.filter((row) => row[10] === "true").length,
    missingNames: rows.filter((row) => !row[3]).length,
  };
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  if (!options.file) {
    throw new Error("Uso: npm run clients:import -- --file ./local-data/clientes.csv --dry-run");
  }

  const filePath = resolve(options.file);
  const raw = await readFile(filePath, "utf8");
  const delimiter = filePath.toLowerCase().endsWith(".tsv") ? "\t" : ",";
  const rows = mapRows(parseDelimited(raw, delimiter));
  const report = buildReport(rows);

  if (!options.apply) {
    console.log(JSON.stringify({ ok: true, mode: "dry-run", report }, null, 2));
    return;
  }

  const context = await createClientsSheetsContext();
  const backupSheetName = await backupClientsSheet(context);
  await ensureClientsSheet(context);
  await context.client.spreadsheets.values.clear({
    spreadsheetId: context.spreadsheetId,
    range: quoteSheetRange(CLIENTS_SHEET_NAME, "A:M"),
  });
  await context.client.spreadsheets.values.update({
    spreadsheetId: context.spreadsheetId,
    range: quoteSheetRange(CLIENTS_SHEET_NAME, "A1:M"),
    valueInputOption: "RAW",
    requestBody: { values: [[...CLIENTS_SHEET_HEADERS], ...rows] },
  });

  console.log(
    JSON.stringify(
      {
        ok: true,
        mode: "apply",
        sheetName: CLIENTS_SHEET_NAME,
        backupSheetName,
        report,
      },
      null,
      2,
    ),
  );
}

main().catch((error) => {
  console.error(
    JSON.stringify({
      ok: false,
      error: error instanceof Error ? error.message : "error desconocido",
    }),
  );
  process.exitCode = 1;
});
