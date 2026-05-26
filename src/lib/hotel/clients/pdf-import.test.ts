import { describe, expect, it } from "vitest";
import {
  parsePdfExtractedClientRows,
  rowsToClientSheetMatrix,
  serializeClientRowsAsCsv,
  type PdfExtractedClientRow,
} from "./pdf-import";

const baseRows: PdfExtractedClientRow[] = [
  {
    page: 1,
    rowIndex: 1,
    activo: "Sí",
    fechaAlta: "01/01/2026",
    nombre: "Cliente Uno",
    telefonoMovil: "+34 682 62 11 77",
    email: "CLIENTE.UNO@example.test",
  },
  {
    page: 1,
    rowIndex: 2,
    activo: "Sí",
    fechaAlta: "02/01/2026",
    nombre: "Cliente Dos NO COGER RESERVA",
    telefonoMovil: "682621178",
  },
  {
    page: 1,
    rowIndex: 3,
    activo: "No",
    fechaAlta: "03/01/2026",
    fechaBaja: "04/01/2026",
    nombre: "Cliente Tres",
    telefonoFijo: "971 111 222",
    email: "cliente.tres@example.test",
  },
];

describe("PDF client import parser", () => {
  it("normalizes phone, email and schema fields from extracted PDF rows", () => {
    const result = parsePdfExtractedClientRows({
      rows: baseRows,
      pagesDetected: 1,
      extractionMethod: "test",
      now: "2026-05-26T00:00:00.000Z",
    });

    expect(result.report).toMatchObject({
      pagesDetected: 1,
      parsedRows: 3,
      validRows: 3,
      validPhones: 3,
      validEmails: 2,
      rowsWithoutContact: 0,
      blockedWarnings: 1,
      parseConfidencePct: 100,
    });
    expect(result.rows[0].telefono_normalizado).toBe("34682621177");
    expect(result.rows[0].email).toBe("cliente.uno@example.test");
    expect(result.rows[1].bloqueado_no_reservar).toBe("true");
    expect(result.rows[1].notas).toBe("NO COGER RESERVA");
    expect(result.rows[1].nombre).toBe("Cliente Dos");
  });

  it("reports duplicates and rows without contact using aggregate metrics only", () => {
    const result = parsePdfExtractedClientRows({
      rows: [
        ...baseRows,
        {
          page: 2,
          rowIndex: 1,
          activo: "Sí",
          fechaAlta: "04/01/2026",
          nombre: "Cliente Cuatro",
          telefonoMovil: "682621177",
          email: "cliente.uno@example.test",
        },
        {
          page: 2,
          rowIndex: 2,
          activo: "Sí",
          fechaAlta: "05/01/2026",
          nombre: "Cliente Sin Contacto",
        },
      ],
      pagesDetected: 2,
      extractionMethod: "test",
      now: "2026-05-26T00:00:00.000Z",
    });

    expect(result.report.duplicatePhones).toBe(1);
    expect(result.report.duplicateEmails).toBe(1);
    expect(result.report.rowsWithoutContact).toBe(1);
    expect(JSON.stringify(result.report)).not.toContain("Cliente Uno");
    expect(JSON.stringify(result.report)).not.toContain("682621177");
    expect(JSON.stringify(result.report)).not.toContain("cliente.uno");
  });

  it("rejects rows without name and exports CLIENTES-compatible CSV", () => {
    const result = parsePdfExtractedClientRows({
      rows: [
        ...baseRows,
        {
          page: 2,
          rowIndex: 3,
          activo: "Sí",
          fechaAlta: "06/01/2026",
          telefonoMovil: "682621179",
        },
      ],
      pagesDetected: 2,
      extractionMethod: "test",
      now: "2026-05-26T00:00:00.000Z",
    });

    expect(result.report.rejectedRows).toBe(1);
    expect(result.rows).toHaveLength(3);
    expect(rowsToClientSheetMatrix(result.rows)[0]).toHaveLength(13);

    const csv = serializeClientRowsAsCsv(result.rows);
    expect(csv.split("\n")[0]).toBe(
      "activo,fecha_alta,fecha_baja,nombre,nif,telefono_fijo,telefono_movil,telefono_normalizado,email,notas,bloqueado_no_reservar,origen,updated_at",
    );
    expect(csv).not.toContain("undefined");
  });
});
