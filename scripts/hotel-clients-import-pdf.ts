import { existsSync } from "node:fs";
import { spawn } from "node:child_process";
import { resolve } from "node:path";

function parseArgs(argv: string[]) {
  let file: string | undefined;
  for (let index = 0; index < argv.length; index += 1) {
    if (argv[index] === "--file") {
      file = argv[index + 1];
      index += 1;
    }
  }
  return { file };
}

function runPdftotext(file: string): Promise<string> {
  return new Promise((resolveText, reject) => {
    const child = spawn("pdftotext", ["-layout", file, "-"], {
      stdio: ["ignore", "pipe", "pipe"],
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
        reject(new Error(stderr || `pdftotext terminó con código ${code}`));
      }
    });
  });
}

async function main() {
  const { file } = parseArgs(process.argv.slice(2));
  if (!file) {
    throw new Error('Uso: npm run clients:import:pdf -- --file "../BBDD clientes.pdf" --dry-run');
  }

  const filePath = resolve(file);
  if (!existsSync(filePath)) {
    throw new Error("PDF no encontrado.");
  }

  const text = await runPdftotext(filePath);
  const lines = text.split(/\r?\n/).filter((line) => line.trim());
  const candidateRows = lines.filter((line) => /\S+@\S+|\b\d[\d\s+()-]{8,}\d\b/.test(line));

  console.log(
    JSON.stringify(
      {
        ok: true,
        mode: "dry-run",
        parser: "pdftotext",
        totalTextLines: lines.length,
        candidateRows: candidateRows.length,
        applySupported: false,
        recommendation:
          "Usar CSV/TSV exportado para importar. Este preflight PDF no imprime PII ni aplica cambios.",
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
      error: error instanceof Error ? error.message : "error desconocido",
      applySupported: false,
    }),
  );
  process.exitCode = 1;
});
