import { HOTEL_SLOT_ORDER, type HotelSlot } from "./slots";

export interface ReservationIdentityInput {
  petName: string;
  checkInDate: string;
  checkInSlot?: HotelSlot;
  phone?: string;
  ownerName?: string;
  ownerEmail?: string;
}

export interface ReservationIdentityTrace {
  clientKey: string;
  petKey: string;
  reservationId: string;
  collisionKey: string;
  normalizedPhone: string;
  normalizedOwnerName: string;
  normalizedOwnerEmail: string;
  normalizedPetName: string;
}

export function normalizeIdentifierPart(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export function normalizePhoneForIdentifier(value: string, defaultCountryCode = "34"): string {
  const digits = value.replace(/\D/g, "");

  if (!digits) {
    return "";
  }

  if (digits.length === 9) {
    return `${defaultCountryCode}${digits}`;
  }

  if (digits.startsWith("00") && digits.length > 2) {
    return digits.slice(2);
  }

  return digits;
}

export function normalizeEmailForIdentifier(value?: string): string {
  return value ? normalizeIdentifierPart(value) : "";
}

export function buildClientKey(input: {
  phone?: string;
  ownerName?: string;
  ownerEmail?: string;
}): string {
  const normalizedPhone = input.phone ? normalizePhoneForIdentifier(input.phone) : "";
  const normalizedOwnerName = input.ownerName ? normalizeIdentifierPart(input.ownerName) : "";
  const normalizedOwnerEmail = normalizeEmailForIdentifier(input.ownerEmail);

  return [
    normalizedPhone || "sin-telefono",
    normalizedOwnerEmail || normalizedOwnerName || "sin-identidad",
  ]
    .filter(Boolean)
    .join("::");
}

export function buildPetKey(
  petName: string,
  ownerName?: string,
  phone?: string,
  ownerEmail?: string,
): string {
  const parts = [
    normalizeIdentifierPart(petName),
    buildClientKey({
      phone,
      ownerName,
      ownerEmail,
    }),
  ].filter(Boolean);

  return parts.join("::");
}

export function buildReservationId(input: {
  petName: string;
  phone: string;
  checkInDate: string;
  checkInSlot?: HotelSlot;
  ownerName?: string;
  ownerEmail?: string;
}): string {
  return buildReservationIdentity(input).reservationId;
}

export function buildReservationIdentity(
  input: ReservationIdentityInput,
): ReservationIdentityTrace {
  const slot = input.checkInSlot ?? HOTEL_SLOT_ORDER[0];
  const normalizedPhone = input.phone ? normalizePhoneForIdentifier(input.phone) : "";
  const normalizedOwnerName = input.ownerName ? normalizeIdentifierPart(input.ownerName) : "";
  const normalizedOwnerEmail = normalizeEmailForIdentifier(input.ownerEmail);
  const normalizedPetName = normalizeIdentifierPart(input.petName);
  const clientKey = buildClientKey({
    phone: input.phone,
    ownerName: input.ownerName,
    ownerEmail: input.ownerEmail,
  });
  const petKey = buildPetKey(input.petName, input.ownerName, input.phone, input.ownerEmail);
  const reservationId = [
    clientKey,
    normalizedPetName,
    input.checkInDate,
    slot,
  ].join("__");
  const collisionKey = [petKey, input.checkInDate, slot].join("__");

  return {
    clientKey,
    petKey,
    reservationId,
    collisionKey,
    normalizedPhone,
    normalizedOwnerName,
    normalizedOwnerEmail,
    normalizedPetName,
  };
}
