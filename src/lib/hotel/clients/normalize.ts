const SPANISH_LOCAL_PHONE_PATTERN = /^[679]\d{8}$/;
const DANGEROUS_NOTE_PATTERNS = [
  /NO\s+COGER\s+RESERVAS?/i,
  /\bINFORMAL\b/i,
  /NO\s+VINO/i,
  /NO\s+ES\s+FORM/i,
];

export function stripDiacritics(input: string): string {
  return input.normalize("NFD").replace(/\p{Diacritic}/gu, "");
}

export function normalizePhone(input: string): string | null {
  const raw = input.replace(/^whatsapp:/i, "").trim();
  if (!raw) {
    return null;
  }

  let digits = raw.replace(/[^\d]/g, "");
  if (!digits) {
    return null;
  }

  if (digits.startsWith("00")) {
    digits = digits.slice(2);
  }

  if (SPANISH_LOCAL_PHONE_PATTERN.test(digits)) {
    digits = `34${digits}`;
  }

  if (digits.startsWith("0034")) {
    digits = digits.slice(2);
  }

  return digits.length >= 9 ? digits : null;
}

export function normalizeEmail(input: string): string | null {
  const value = input.trim().toLowerCase();
  if (!value) {
    return null;
  }

  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value) ? value : null;
}

export function normalizeName(input: string): string {
  return stripDiacritics(input)
    .toLowerCase()
    .replace(/[^\p{Letter}\p{Number}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function isTruthyCell(value: string | boolean | undefined): boolean {
  if (typeof value === "boolean") {
    return value;
  }

  return ["1", "true", "si", "sí", "yes", "y", "x"].includes(
    String(value ?? "").trim().toLowerCase(),
  );
}

export function hasDangerousClientNote(notes?: string): boolean {
  return DANGEROUS_NOTE_PATTERNS.some((pattern) => pattern.test(notes ?? ""));
}

export function buildClientWarnings(input: {
  notas?: string;
  bloqueadoNoReservar?: boolean;
  duplicate?: boolean;
}): string[] {
  const warnings = new Set<string>();

  if (input.bloqueadoNoReservar || hasDangerousClientNote(input.notas)) {
    warnings.add("NO COGER RESERVA");
  }

  if (input.duplicate) {
    warnings.add("datos duplicados");
  }

  return Array.from(warnings);
}
