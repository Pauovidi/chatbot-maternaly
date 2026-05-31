export function redactCell(value: unknown): unknown {
  if (typeof value !== "string") {
    return value;
  }

  const text = value.trim();
  if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(text)) {
    const [local, domain] = text.split("@");
    return `${local.slice(0, 1)}***@${domain}`;
  }

  const phoneDigits = text.replace(/[^\d+]/g, "");
  if (/^\+?\d{8,15}$/.test(phoneDigits)) {
    return `${phoneDigits.slice(0, 3)}******${phoneDigits.slice(-3)}`;
  }

  if (/^\d{8}[A-Za-z]$|^[XYZ]\d{7}[A-Za-z]$/.test(text)) {
    return "[REDACTED_ID]";
  }

  if (/^[A-ZÁÉÍÓÚÑ][a-záéíóúñ]+(\s+[A-ZÁÉÍÓÚÑ][a-záéíóúñ]+)+$/.test(text)) {
    return "[REDACTED_NAME]";
  }

  return value;
}

export function redactRows(rows: unknown[][]): unknown[][] {
  return rows.map((row) => row.map(redactCell));
}
