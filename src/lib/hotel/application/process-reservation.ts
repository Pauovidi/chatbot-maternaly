import { evaluateAvailability } from "../availability/engine";
import type { ExistingStay } from "../availability/types";
import { demoPricingConfig } from "../pricing/config";
import { quoteStayPrice } from "../pricing/engine";
import { getHotelFeatureFlags, getHotelRuntimeConfig, HOTEL_COLOR_MAPPING } from "../config";
import {
  buildWhatsAppAvailabilityMessage,
} from "../content/whatsapp-templates";
import { buildGoogleSheetAdapter } from "../sheets";
import type {
  AvailabilityDaySnapshot,
  AvailabilityResult,
  PricingQuote,
  ReminderJob,
  ReservationRecord,
} from "../domain/contracts";
import {
  buildReservationIdentity,
  normalizePhoneForIdentifier,
} from "../domain/identifiers";
import { RESERVATION_TURN_TO_SLOT } from "../domain/slots";
import {
  type ReservationWorkflowState,
  type ReservationWorkflowTransition,
} from "../domain/states";
import { parseReservationEmail, type ParsedEmailResult } from "../parser";
import { appendLog, loadDemoState, replaceRemindersForReservation, upsertReservation } from "./demo-store";
import {
  mapLegacyAvailabilityToDomain,
  mapLegacyWritePlanToDemoPlan,
  toLegacyAvailabilityInput,
  toLegacyReservationRecord,
} from "./integration-bridge";
import { buildReservationReminderJob } from "./reminder-job";
import type { DemoSheetWritePlan, ProcessReservationResult } from "./types";
import type { SheetsWriteResult } from "../sheets/types";

function buildExistingStays(records: ReservationRecord[]): ExistingStay[] {
  return records
    .filter((record) => record.status === "disponible" || record.status === "confirmada")
    .map((record) => ({
      id: record.reservationId,
      label: record.petName,
      units: Math.max(1, Math.ceil(record.petCount)),
      window: {
        checkIn: {
          date: record.checkInDate,
          slot: record.checkInSlot,
        },
        checkOut: {
          date: record.checkOutDate,
          slot: record.checkOutSlot,
        },
      },
    }));
}

function buildSyntheticStaysFromSnapshots(
  monthSnapshots: Awaited<ReturnType<typeof loadDemoState>>["monthSnapshots"],
): ExistingStay[] {
  return monthSnapshots.flatMap((monthSnapshot) =>
    Object.entries(monthSnapshot.occupied).flatMap(([date, slots]) => [
      ...(slots.morning > 0
        ? [
            {
              id: `${monthSnapshot.monthKey}-${date}-morning`,
              label: `${monthSnapshot.sheetName} mañana`,
              units: slots.morning,
              window: {
                checkIn: { date, slot: "morning" as const },
                checkOut: { date, slot: "morning" as const },
              },
            } satisfies ExistingStay,
          ]
        : []),
      ...(slots.afternoon > 0
        ? [
            {
              id: `${monthSnapshot.monthKey}-${date}-afternoon`,
              label: `${monthSnapshot.sheetName} tarde`,
              units: slots.afternoon,
              window: {
                checkIn: { date, slot: "afternoon" as const },
                checkOut: { date, slot: "afternoon" as const },
              },
            } satisfies ExistingStay,
          ]
        : []),
    ]),
  );
}

function buildCapacityConfig() {
  const runtimeConfig = getHotelRuntimeConfig();

  return {
    standardUnits: runtimeConfig.capacity.standardRoomsPerSlot,
    overflowUnits: runtimeConfig.capacity.overflowRoomsPerSlot,
    overflowEnabled: runtimeConfig.capacity.allowOverflow,
  };
}

function buildPricingConfig() {
  const runtimeConfig = getHotelRuntimeConfig();
  const halfDaySupplement = runtimeConfig.pricing.halfDaySupplement.amount;

  return {
    ...demoPricingConfig,
    rates: {
      1: {
        dailyRate: runtimeConfig.pricing.tiers[0].nightlyRate,
        halfDaySupplement,
      },
      2: {
        dailyRate: runtimeConfig.pricing.tiers[1].nightlyRate,
        halfDaySupplement,
      },
      3: {
        dailyRate: runtimeConfig.pricing.tiers[2].nightlyRate,
        halfDaySupplement,
      },
      4: {
        dailyRate: runtimeConfig.pricing.tiers[3].nightlyRate,
        halfDaySupplement,
      },
    },
  };
}

function groupSnapshots(
  slotSnapshots: ReturnType<typeof evaluateAvailability>["slotSnapshots"],
): AvailabilityDaySnapshot[] {
  const grouped = new Map<string, AvailabilityDaySnapshot>();

  for (const slot of slotSnapshots) {
    const snapshot =
      grouped.get(slot.date) ??
      {
        date: slot.date,
        morningOccupied: 0,
        afternoonOccupied: 0,
        morningCapacity: slot.standardCapacity,
        afternoonCapacity: slot.standardCapacity,
      };

    if (slot.slot === "morning") {
      snapshot.morningOccupied = slot.occupiedUnits;
      snapshot.morningCapacity = slot.standardCapacity;
    } else {
      snapshot.afternoonOccupied = slot.occupiedUnits;
      snapshot.afternoonCapacity = slot.standardCapacity;
    }

    grouped.set(slot.date, snapshot);
  }

  return Array.from(grouped.values()).sort((left, right) =>
    left.date.localeCompare(right.date),
  );
}

function mapAvailability(
  availability: ReturnType<typeof evaluateAvailability>,
  requiresReview: boolean,
): AvailabilityResult {
  return {
    isAvailable: availability.status !== "unavailable" && availability.status !== "invalid_window",
    requiresReview,
    capacityPerSlot: availability.standardCapacity,
    overflowUsed: availability.status === "available_overflow",
    blockingDates: availability.bottlenecks.map((item) => item.date),
    snapshot: groupSnapshots(availability.slotSnapshots),
  };
}

function mapPricing(pricing: ReturnType<typeof quoteStayPrice>): PricingQuote {
  return {
    currency: "EUR",
    subtotal: pricing.baseAmount,
    supplements: pricing.halfDayAmount,
    total: pricing.total,
    lineItems: [
      {
        code: `hotel-${pricing.rateBand}-perro`,
        label: `Hotel canino ${pricing.rateBand} perro${pricing.rateBand > 1 ? "s" : ""}`,
        quantity: pricing.fullDays,
        unitPrice: pricing.dailyRate,
        total: pricing.baseAmount,
      },
      ...(pricing.halfDays > 0
        ? [
            {
              code: "suplemento-medio-dia",
              label: "Suplemento de medio día",
              quantity: pricing.halfDays,
              unitPrice: pricing.halfDaySupplement,
              total: pricing.halfDayAmount,
            },
          ]
        : []),
    ],
    assumptions: pricing.halfDays
      ? ["El cálculo incluye suplemento de medio día cuando la estancia ocupa un slot extra."]
      : ["El cálculo se ha hecho solo con tarifa base por estancia."],
  };
}

function detectBathRequested(notes?: string): boolean {
  return /peluquer|bañ|ban|grooming/i.test(notes ?? "");
}

function buildSpecialNotes(draft: ParsedEmailResult["draft"]): string | undefined {
  const notes = [
    draft.notes,
    draft.checkInTimeAdjustmentMessage,
    draft.checkOutTimeAdjustmentMessage,
  ].filter(Boolean);

  return notes.length > 0 ? notes.join(" ") : undefined;
}

function buildReservationRecord(
  parsedEmail: ParsedEmailResult,
): ReservationRecord | null {
  const { draft } = parsedEmail;
  if (
    !draft.petName ||
    !draft.checkInDate ||
    !draft.checkOutDate ||
    !draft.checkInTurn ||
    !draft.checkOutTurn
  ) {
    return null;
  }

  const phone = draft.whatsapp ?? draft.phone ?? "";
  const normalizedPhone = normalizePhoneForIdentifier(phone);
  const checkInSlot = RESERVATION_TURN_TO_SLOT[draft.checkInTurn];
  const checkOutSlot = RESERVATION_TURN_TO_SLOT[draft.checkOutTurn];
  const createdAt = new Date().toISOString();
  const identityTrace = buildReservationIdentity({
    petName: draft.petName,
    checkInDate: draft.checkInDate,
    checkInSlot,
    phone: normalizedPhone || phone,
    ownerName: draft.ownerName,
    ownerEmail: draft.ownerEmail,
  });

  return {
    reservationId: identityTrace.reservationId,
    petKey: identityTrace.petKey,
    status: "pendiente",
    reviewState: draft.reviewState,
    source: draft.source,
    createdAt,
    updatedAt: createdAt,
    workflowState: "parsed",
    identityTrace,
    ownerName: draft.ownerName,
    ownerEmail: draft.ownerEmail,
    petName: draft.petName,
    phone: normalizedPhone || draft.phone,
    checkInDate: draft.checkInDate,
    checkInSlot,
    originalRequestedCheckInTime: draft.originalRequestedCheckInTime,
    normalizedCheckInTime: draft.normalizedCheckInTime,
    checkInTimeWasAdjusted: draft.checkInTimeWasAdjusted,
    checkInTimeAdjustmentMessage: draft.checkInTimeAdjustmentMessage,
    checkOutDate: draft.checkOutDate,
    checkOutSlot,
    originalRequestedCheckOutTime: draft.originalRequestedCheckOutTime,
    normalizedCheckOutTime: draft.normalizedCheckOutTime,
    checkOutTimeWasAdjusted: draft.checkOutTimeWasAdjusted,
    checkOutTimeAdjustmentMessage: draft.checkOutTimeAdjustmentMessage,
    petCount: draft.petCount ?? 1,
    notes: draft.notes,
    bathRequested: detectBathRequested(draft.notes),
    specialNotes: buildSpecialNotes(draft),
    manualFollowupRequired: detectBathRequested(draft.notes),
    reviewFlags: draft.reviewFlags,
  };
}

function deriveStatus(input: {
  availability: AvailabilityResult | null;
  reviewFlags: ProcessReservationResult["reviewFlags"];
}): ProcessReservationResult["status"] {
  if (!input.availability) {
    return "pendiente";
  }

  if (!input.availability.isAvailable) {
    return "sin_disponibilidad";
  }

  return input.reviewFlags.length > 0 ? "pendiente" : "disponible";
}

function createWorkflowTransition(
  from: ReservationWorkflowState,
  to: ReservationWorkflowState,
  reason: string,
): ReservationWorkflowTransition {
  return {
    from,
    to,
    at: new Date().toISOString(),
    reason,
  };
}

function deriveWorkflowTrail(input: {
  reservation: ReservationRecord | null;
  availability: AvailabilityResult | null;
  reviewFlags: ProcessReservationResult["reviewFlags"];
  reminders: ReminderJob[];
  parsed: ParsedEmailResult;
  isConfirmed: boolean;
}): {
  workflowState: ReservationWorkflowState;
  workflowTrail: ReservationWorkflowTransition[];
} {
  const workflowTrail: ReservationWorkflowTransition[] = [
    createWorkflowTransition("detected", "parsed", "Email recibido y parseado"),
  ];

  if (!input.reservation) {
    workflowTrail.push(
      createWorkflowTransition(
        "parsed",
        "pending_review",
        "Faltan datos criticos para crear la reserva",
      ),
    );

    return {
      workflowState: "pending_review",
      workflowTrail,
    };
  }

  if (input.reviewFlags.length > 0 || input.parsed.draft.reviewState === "necesita_revision") {
    workflowTrail.push(
      createWorkflowTransition(
        "parsed",
        "pending_review",
        "La reserva requiere revision manual",
      ),
    );

    return {
      workflowState: "pending_review",
      workflowTrail,
    };
  }

  if (!input.availability) {
    workflowTrail.push(
      createWorkflowTransition(
        "parsed",
        "failed",
        "No se pudo calcular la disponibilidad",
      ),
    );

    return {
      workflowState: "failed",
      workflowTrail,
    };
  }

  if (!input.availability.isAvailable) {
    workflowTrail.push(
      createWorkflowTransition(
        "parsed",
        "no_availability",
        "No hay hueco en los slots solicitados",
      ),
    );

    return {
      workflowState: "no_availability",
      workflowTrail,
    };
  }

  workflowTrail.push(
    createWorkflowTransition("parsed", "available", "Hueco confirmado"),
  );

  if (!input.isConfirmed) {
    return {
      workflowState: "available",
      workflowTrail,
    };
  }

  workflowTrail.push(
    createWorkflowTransition("available", "confirmed", "Reserva aceptada"),
  );

  if (input.reminders.length > 0) {
    workflowTrail.push(
      createWorkflowTransition(
        "confirmed",
        "reminder_scheduled",
        "Recordatorio 5 dias en cola",
      ),
    );

    return {
      workflowState: "reminder_scheduled",
      workflowTrail,
    };
  }

  return {
    workflowState: "confirmed",
    workflowTrail,
  };
}

function buildSheetWritePlan(
  reservation: ReservationRecord,
  status: ProcessReservationResult["status"],
): DemoSheetWritePlan {
  const colorKey =
    status === "disponible" || status === "confirmada"
      ? "reservado"
      : status === "sin_disponibilidad"
        ? "bloqueado"
        : "overflow";

  return {
    sheetName: reservation.checkInDate.slice(0, 7),
    monthKey: reservation.checkInDate.slice(0, 7),
    prepared: status === "disponible" || status === "confirmada",
    colorKey,
    colorHex: HOTEL_COLOR_MAPPING.sheetState[colorKey],
    petName: reservation.petName,
    notes: [
      "Escritura preparada para el adaptador de Google Sheets.",
      "Nombre de la mascota y color listos para aplicar según configuración.",
    ],
    cellUpdates: [
      { field: "pet_name", value: reservation.petName ?? "" },
      { field: "owner_name", value: reservation.ownerName ?? "" },
      { field: "phone", value: reservation.phone ?? "" },
      { field: "check_in", value: reservation.checkInDate },
      { field: "original_requested_checkin_time", value: reservation.originalRequestedCheckInTime ?? "" },
      { field: "normalized_checkin_time", value: reservation.normalizedCheckInTime ?? "" },
      { field: "check_out", value: reservation.checkOutDate },
      { field: "original_requested_checkout_time", value: reservation.originalRequestedCheckOutTime ?? "" },
      { field: "normalized_checkout_time", value: reservation.normalizedCheckOutTime ?? "" },
      { field: "status", value: status },
      { field: "bath_requested", value: reservation.bathRequested ? "true" : "false" },
      { field: "special_notes", value: reservation.specialNotes ?? "" },
      { field: "manual_followup_required", value: reservation.manualFollowupRequired ? "true" : "false" },
      { field: "cancellation_requested_at", value: reservation.cancellationRequestedAt ?? "" },
      { field: "reminder_sent_at", value: reservation.reminderSentAt ?? "" },
    ],
  };
}

function buildSheetRegistration(
  result: SheetsWriteResult,
): NonNullable<ReservationRecord["sheetRegistration"]> {
  return {
    sheetName: result.sheetName,
    reservationId: result.reservationId,
    rowHint: result.rowHint,
    cells: result.cellUpdates.map((update) => update.cell),
    writtenAt: new Date().toISOString(),
  };
}

export async function processReservationEmail(input: {
  subject: string;
  rawText: string;
}): Promise<ProcessReservationResult> {
  const parsedEmail = parseReservationEmail(input);
  const reservation = buildReservationRecord(parsedEmail);
  const flags = getHotelFeatureFlags();
  const state = await loadDemoState();
  let availability: AvailabilityResult | null = null;
  let pricing: PricingQuote | null = null;
  let reminders: ReminderJob[] = [];
  let sheetWritePlan: DemoSheetWritePlan | null = null;
  let sheetsAvailabilityTechnical: Awaited<ReturnType<Awaited<ReturnType<typeof buildGoogleSheetAdapter>>["checkAvailability"]>> | null = null;
  const integrationReviewFlags = new Set<ProcessReservationResult["reviewFlags"][number]>();
  const integrationNotes: string[] = [];

  if (reservation) {
    if (flags.useGoogleSheetsReal) {
      try {
        const sheetAdapter = await buildGoogleSheetAdapter();
        const structure = await sheetAdapter.validateMonthStructure(
          reservation.checkInDate.slice(0, 7),
        );

        integrationNotes.push(
          ...structure.issues.map((issue) => `Sheets: ${issue.message}`),
        );

        if (!structure.ok) {
          integrationReviewFlags.add("requiere_revision_manual");
        } else {
          const legacyAvailability = await sheetAdapter.checkAvailability(
            toLegacyAvailabilityInput(reservation),
          );
          sheetsAvailabilityTechnical = legacyAvailability;
          availability = mapLegacyAvailabilityToDomain(
            legacyAvailability,
            parsedEmail.draft.reviewState === "necesita_revision",
          );
          const legacyWritePlan = await sheetAdapter.buildWritePlan(
            toLegacyReservationRecord(reservation, "disponible"),
          );
          sheetWritePlan = mapLegacyWritePlanToDemoPlan(
            legacyWritePlan,
            "disponible",
          );
        }
      } catch (error) {
        integrationReviewFlags.add("requiere_revision_manual");
        integrationNotes.push(
          error instanceof Error
            ? `Sheets real: ${error.message}`
            : "Sheets real: error desconocido al leer la hoja mensual.",
        );
      }
    } else {
      const existingStays = buildExistingStays([
        ...state.reservations.filter((item) => item.reservationId !== reservation.reservationId),
      ]).concat(buildSyntheticStaysFromSnapshots(state.monthSnapshots));
      const availabilityEngineResult = evaluateAvailability({
        requestedWindow: {
          checkIn: {
            date: reservation.checkInDate,
            slot: reservation.checkInSlot,
          },
          checkOut: {
            date: reservation.checkOutDate,
            slot: reservation.checkOutSlot,
          },
        },
        requestedUnits: Math.max(
          1,
          Math.ceil(
            reservation.petCount / getHotelRuntimeConfig().capacity.maxPetsPerRoom,
          ),
        ),
        existingStays,
        capacity: buildCapacityConfig(),
      });

      availability = mapAvailability(
        availabilityEngineResult,
        parsedEmail.draft.reviewState === "necesita_revision",
      );
    }

    pricing = mapPricing(
      quoteStayPrice(
        {
          stay: {
            checkIn: {
              date: reservation.checkInDate,
              slot: reservation.checkInSlot,
            },
            checkOut: {
              date: reservation.checkOutDate,
              slot: reservation.checkOutSlot,
            },
          },
          dogs: reservation.petCount,
        },
        buildPricingConfig(),
      ),
    );

    reminders = [];
  }

  let effectiveReviewFlags = Array.from(
    new Set([
      ...parsedEmail.draft.reviewFlags,
      ...integrationReviewFlags,
    ]),
  );
  let status = deriveStatus({
    availability,
    reviewFlags: effectiveReviewFlags,
  });
  let sheetRegistration: ReservationRecord["sheetRegistration"];

  if (reservation && flags.useGoogleSheetsReal && status === "disponible") {
    try {
      const sheetAdapter = await buildGoogleSheetAdapter();
      const writeResult = await sheetAdapter.writeReservation(
        toLegacyReservationRecord(reservation, "confirmada"),
      );
      sheetRegistration = buildSheetRegistration(writeResult);
      sheetWritePlan = mapLegacyWritePlanToDemoPlan(writeResult, "confirmada");
      status = "confirmada";
      integrationNotes.push(
        `Sheets: reserva escrita en ${writeResult.sheetName} (${writeResult.cellUpdates
          .map((update) => update.cell)
          .join(", ")}).`,
      );
    } catch (error) {
      integrationReviewFlags.add("requiere_revision_manual");
      integrationNotes.push(
        error instanceof Error
          ? `Sheets real: no se pudo escribir la reserva tras revalidar disponibilidad: ${error.message}`
          : "Sheets real: no se pudo escribir la reserva tras revalidar disponibilidad.",
      );
      effectiveReviewFlags = Array.from(
        new Set([
          ...parsedEmail.draft.reviewFlags,
          ...integrationReviewFlags,
        ]),
      );
      status = deriveStatus({
        availability,
        reviewFlags: effectiveReviewFlags,
      });
    }
  }

  const preliminaryRecord =
    reservation &&
    ({
      ...reservation,
      status,
      sheetRegistration,
      updatedAt: new Date().toISOString(),
      availability: availability ?? undefined,
      pricing: pricing ?? undefined,
      reviewFlags: effectiveReviewFlags,
      reviewState: effectiveReviewFlags.length > 0 ? "necesita_revision" : reservation.reviewState,
      manualFollowupRequired:
        reservation.manualFollowupRequired ||
        effectiveReviewFlags.includes("requiere_revision_manual"),
      identityTrace: reservation.identityTrace,
    } satisfies ReservationRecord);

  if (preliminaryRecord?.status === "confirmada") {
    reminders = [buildReservationReminderJob(preliminaryRecord)];
  }

  const workflow = deriveWorkflowTrail({
    reservation: preliminaryRecord,
    availability,
    reviewFlags: effectiveReviewFlags,
    reminders,
    parsed: parsedEmail,
    isConfirmed: preliminaryRecord?.status === "confirmada",
  });

  const record =
    preliminaryRecord &&
    ({
      ...preliminaryRecord,
      workflowState: workflow.workflowState,
      workflowTrail: workflow.workflowTrail,
    } satisfies ReservationRecord);

  if (record && flags.useDemoPersistence) {
    await upsertReservation(record);
    await replaceRemindersForReservation(record.reservationId, reminders);
  }

  await appendLog({
    level: status === "sin_disponibilidad" ? "warn" : "info",
    event: "reservation_processed",
    message: `Reserva procesada con estado ${status}.`,
  });

  return {
    parsed: parsedEmail.draft,
    reservation: record ?? null,
    availability,
    pricing,
    status,
    workflowState: workflow.workflowState,
    workflowTrail: workflow.workflowTrail,
    identityTrace: record?.identityTrace ?? null,
    reviewFlags: effectiveReviewFlags,
    reviewNotes: [...parsedEmail.meta.assumptions, ...integrationNotes],
    whatsappMessage:
      availability && record
        ? buildWhatsAppAvailabilityMessage({
            petName: record.petName,
            ownerName: record.ownerName,
            availability,
            pricing: pricing ?? undefined,
            reservation: record,
          })
        : "Faltan datos críticos. La solicitud debe revisarse manualmente antes de responder al cliente.",
    sheetWritePlan:
      record
        ? sheetWritePlan ?? buildSheetWritePlan(record, status)
        : null,
    reminders,
    assumptions: [...parsedEmail.meta.assumptions, ...integrationNotes],
    technical: sheetsAvailabilityTechnical
      ? {
          sheetsAvailability: sheetsAvailabilityTechnical,
        }
      : undefined,
  };
}
