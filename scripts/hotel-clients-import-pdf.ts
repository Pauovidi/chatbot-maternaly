import { existsSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import { spawn } from "node:child_process";
import { dirname, relative, resolve } from "node:path";
import {
  parsePdfExtractedClientRows,
  serializeClientRowsAsCsv,
  type PdfExtractedClientRow,
} from "../src/lib/hotel/clients/pdf-import";

interface CliOptions {
  file?: string;
  dryRun: boolean;
  exportCsv: boolean;
  output?: string;
}

interface PythonExtractionResult {
  ok: boolean;
  method: string;
  pagesDetected: number;
  rows: PdfExtractedClientRow[];
  pageStats: Array<{ page: number; rows: number; headerDetected: boolean }>;
}

function parseArgs(argv: string[]): CliOptions {
  const options: CliOptions = {
    dryRun: true,
    exportCsv: false,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const value = argv[index];
    if (value === "--file") {
      options.file = argv[index + 1];
      index += 1;
    } else if (value === "--export-csv") {
      options.exportCsv = true;
    } else if (value === "--output") {
      options.output = argv[index + 1];
      index += 1;
    } else if (value === "--dry-run") {
      options.dryRun = true;
    }
  }

  return options;
}

function runProcess(command: string, args: string[], input?: string): Promise<string> {
  return new Promise((resolveText, reject) => {
    const child = spawn(command, args, {
      stdio: ["pipe", "pipe", "pipe"],
      windowsHide: true,
    });
    let output = "";
    let stderr = "";

    child.stdout.on("data", (chunk) => {
      output += String(chunk);
    });
    child.stderr.on("data", (chunk) => {
      stderr += String(chunk);
    });
    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) {
        resolveText(output);
      } else {
        reject(new Error(stderr ? "extractor_failed" : `extractor_exit_${code}`));
      }
    });

    child.stdin.end(input ?? "");
  });
}

async function tryPdftotext(filePath: string): Promise<string | null> {
  try {
    return await runProcess("pdftotext", ["-layout", filePath, "-"]);
  } catch {
    return null;
  }
}

async function extractWithPython(filePath: string): Promise<PythonExtractionResult> {
  const code = String.raw`
import json
import sys

if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8")
if hasattr(sys.stderr, "reconfigure"):
    sys.stderr.reconfigure(encoding="utf-8")

try:
    import fitz
except Exception:
    print(json.dumps({"ok": False, "error": "pymupdf_unavailable"}))
    sys.exit(2)

pdf_path = sys.argv[1]
doc = fitz.open(pdf_path)

def clean(value):
    return " ".join(str(value or "").split())

def col_for_x(x):
    if x < 55:
        return "activo"
    if x < 115:
        return "fechaAlta"
    if x < 170:
        return "fechaBaja"
    if x < 370:
        return "nombre"
    if x < 440:
        return "nif"
    if x < 540:
        return "telefonoFijo"
    if x < 640:
        return "telefonoMovil"
    return "email"

rows = []
page_stats = []
for page_index, page in enumerate(doc):
    words = page.get_text("words")
    lines = {}
    header_detected = False
    for word in words:
        x0, y0, x1, y1, text = word[:5]
        y = round(y0, 1)
        lines.setdefault(y, []).append((x0, clean(text)))
    page_rows = 0
    for y in sorted(lines):
        tokens = sorted(lines[y], key=lambda item: item[0])
        line_text = " ".join(token for _, token in tokens).lower()
        if "activo" in line_text and "nombre" in line_text and "email" in line_text:
            header_detected = True
            continue
        if y < 90:
            continue
        cells = {}
        for x, token in tokens:
            col = col_for_x(x)
            cells[col] = clean((cells.get(col, "") + " " + token).strip())
        activo = cells.get("activo", "").lower()
        if activo not in ("si", "sí", "no", "s", "n", "true", "false", "1", "0"):
            continue
        if not (cells.get("fechaAlta") or cells.get("nombre")):
            continue
        page_rows += 1
        rows.append({
            "page": page_index + 1,
            "rowIndex": page_rows,
            "activo": cells.get("activo", ""),
            "fechaAlta": cells.get("fechaAlta", ""),
            "fechaBaja": cells.get("fechaBaja", ""),
            "nombre": cells.get("nombre", ""),
            "nif": cells.get("nif", ""),
            "telefonoFijo": cells.get("telefonoFijo", ""),
            "telefonoMovil": cells.get("telefonoMovil", ""),
            "email": cells.get("email", ""),
        })
    page_stats.append({
        "page": page_index + 1,
        "rows": page_rows,
        "headerDetected": header_detected,
    })

print(json.dumps({
    "ok": True,
    "method": "python_pymupdf_words",
    "pagesDetected": len(doc),
    "rows": rows,
    "pageStats": page_stats,
}, ensure_ascii=False))
`;

  const output = await runProcess("python", ["-", filePath], code);
  const parsed = JSON.parse(output) as PythonExtractionResult & { error?: string };
  if (!parsed.ok) {
    throw new Error(parsed.error ?? "python_extraction_failed");
  }
  return parsed;
}

function sanitizeError(error: unknown): string {
  if (error instanceof Error && error.message === "unsafe_export_path") {
    return "unsafe_export_path";
  }
  if (error instanceof Error && error.message === "pymupdf_unavailable") {
    return "pymupdf_unavailable";
  }
  if (error instanceof Error && error.message === "extractor_failed") {
    return "extractor_failed";
  }
  return "pdf_extraction_failed";
}

function assertSafeExportPath(output: string): void {
  const absolute = resolve(output);
  const relativePath = relative(process.cwd(), absolute).replace(/\\/g, "/");
  const allowed =
    !relativePath.startsWith("../") &&
    !relativePath.startsWith("/") &&
    (relativePath.startsWith("local-data/") ||
      relativePath.startsWith("imports/") ||
      relativePath.startsWith("exports/"));

  if (!allowed) {
    throw new Error("unsafe_export_path");
  }
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  if (!options.file) {
    throw new Error('Uso: npm run clients:import:pdf -- --file "../BBDD clientes.pdf" --dry-run');
  }

  const filePath = resolve(options.file);
  if (!existsSync(filePath)) {
    throw new Error("pdf_not_found");
  }

  const pdftotext = await tryPdftotext(filePath);
  const extraction = await extractWithPython(filePath);
  const parsed = parsePdfExtractedClientRows({
    rows: extraction.rows,
    pagesDetected: extraction.pagesDetected,
    extractionMethod: pdftotext ? "pdftotext_available_python_pymupdf_words" : extraction.method,
  });
  const canApply = parsed.report.parseConfidencePct >= 90;
  let exported = false;

  if (options.exportCsv && canApply) {
    const output = resolve(options.output ?? "local-data/clientes-import-sanitized-output.csv");
    assertSafeExportPath(output);
    await mkdir(dirname(output), { recursive: true });
    await writeFile(output, serializeClientRowsAsCsv(parsed.rows), "utf8");
    exported = true;
  }

  console.log(
    JSON.stringify(
      {
        ok: true,
        mode: "dry-run",
        pdfFound: true,
        extractionMethod: parsed.report.extractionMethod,
        pagesDetected: parsed.report.pagesDetected,
        totalRowsDetected: parsed.report.totalRowsDetected,
        parsedRows: parsed.report.parsedRows,
        validRows: parsed.report.validRows,
        validPhones: parsed.report.validPhones,
        validEmails: parsed.report.validEmails,
        rowsWithoutContact: parsed.report.rowsWithoutContact,
        duplicatePhones: parsed.report.duplicatePhones,
        duplicateEmails: parsed.report.duplicateEmails,
        blockedWarnings: parsed.report.blockedWarnings,
        ambiguousRows: parsed.report.ambiguousRows,
        rejectedRows: parsed.report.rejectedRows,
        parseConfidencePct: parsed.report.parseConfidencePct,
        sampleShapeOnly: parsed.report.sampleShapeOnly,
        canApply,
        csvExportedToIgnoredFolder: exported,
        applySupported: false,
        recommendation: canApply
          ? "Dry-run OK. Revisar CSV local ignorado antes de importar con clients:import."
          : "No aplicar. Pedir CSV/Excel o ajustar parser.",
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
      mode: "dry-run",
      error: sanitizeError(error),
      applySupported: false,
    }),
  );
  process.exitCode = 1;
});
