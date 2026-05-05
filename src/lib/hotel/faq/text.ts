export function normalizeFaqText(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9:/ ]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function tokenizeFaqText(value: string) {
  return normalizeFaqText(value)
    .split(" ")
    .filter(Boolean);
}

export function uniqueFaqStrings(values: readonly string[]) {
  return Array.from(new Set(values.map((value) => value.trim()).filter(Boolean)));
}

export function hasAnyPhrase(value: string, phrases: readonly string[]) {
  return phrases.some((phrase) => value.includes(normalizeFaqText(phrase)));
}

export function countPhraseHits(value: string, phrases: readonly string[]) {
  return phrases.reduce(
    (total, phrase) => total + (value.includes(normalizeFaqText(phrase)) ? 1 : 0),
    0,
  );
}

export function hasAnyPattern(value: string, patterns: readonly RegExp[]) {
  return patterns.some((pattern) => pattern.test(value));
}

export function countPatternHits(value: string, patterns: readonly RegExp[]) {
  return patterns.reduce((total, pattern) => total + (pattern.test(value) ? 1 : 0), 0);
}
