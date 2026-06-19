import { MaternalyCopyRenderer } from "@/lib/maternaly/conversation/copy-renderer";

const renderer = new MaternalyCopyRenderer();

export const MATERNALY_SAFE_FALLBACK = renderer.renderTechnicalFallback();

const LEGACY_HOTEL_PATTERNS = [
  /\bhotel(?:es)?\b/i,
  /\bperr[oa]s?\b/i,
  /\bcanin[oa]s?\b/i,
  /\bvacunas?\b/i,
  /\bcomida\b/i,
  /\bvisitas?\b/i,
  /\bresidencia\b/i,
  /\bqu[eé]\s+traer\b/i,
  /\bsomos\s+perros\b/i,
];

export function containsLegacyHotelKnowledge(text: string): boolean {
  return LEGACY_HOTEL_PATTERNS.some((pattern) => pattern.test(text));
}

export function ensureMaternalySafeReply(candidate: string | undefined): string {
  const reply = candidate?.trim() ?? "";
  if (!reply || containsLegacyHotelKnowledge(reply)) {
    return MATERNALY_SAFE_FALLBACK;
  }

  return reply;
}
