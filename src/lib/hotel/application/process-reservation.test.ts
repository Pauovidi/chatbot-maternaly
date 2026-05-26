import { beforeEach, describe, expect, it, vi } from "vitest";
import { parseReservationEmail } from "../parser";

vi.mock("../parser", () => ({
  parseReservationEmail: vi.fn(() => ({
    draft: {
      source: "email",
      rawText: "mock",
      subject: "Reserva",
      ownerName: "Ana Lopez",
      ownerEmail: "ana@example.com",
      petName: "Luna",
      phone: "612 345 678",
      whatsapp: "612 345 678",
      checkInDate: "2026-04-12",
      checkInTurn: "manana",
      checkOutDate: "2026-04-15",
      checkOutTurn: "tarde",
      petCount: 1,
      notes: "trae manta",
      language: "es",
      reviewFlags: [],
      reviewState: "ok",
    },
    meta: {
      decodedText: "mock",
      reservationBlock: "mock",
      assumptions: [],
      extractedFields: {},
    },
  })),
}));

vi.mock("../availability/engine", () => ({
  evaluateAvailability: vi.fn(() => ({
    status: "available_standard",
    requestedUnits: 1,
    standardCapacity: 18,
    overflowCapacity: 0,
    totalCapacity: 18,
    occupiedSlotCount: 4,
    slotSnapshots: [
      {
        pointIndex: 1,
        date: "2026-04-12",
        slot: "morning",
        occupiedUnits: 0,
        standardCapacity: 18,
        totalCapacity: 18,
        remainingStandardUnits: 18,
        remainingTotalUnits: 18,
        requestedUnits: 1,
        status: "available_standard",
      },
    ],
    bottlenecks: [],
  })),
}));

vi.mock("../pricing/engine", () => ({
  quoteStayPrice: vi.fn(() => ({
    baseAmount: 32,
    halfDayAmount: 0,
    total: 32,
    rateBand: 1,
    fullDays: 3,
    halfDays: 0,
    dailyRate: 32,
    halfDaySupplement: 0,
  })),
}));

vi.mock("../config", () => ({
  getHotelFeatureFlags: vi.fn(() => ({
    useMockEmailInput: true,
    useMockWhatsappSend: true,
    useGoogleSheetsReal: false,
    useRemindersReal: false,
    useDemoPersistence: false,
  })),
  getHotelRuntimeConfig: vi.fn(() => ({
    reminderLeadHours: 120,
    capacity: {
      standardRoomsPerSlot: 18,
      overflowRoomsPerSlot: 0,
      allowOverflow: false,
      maxPetsPerRoom: 1,
    },
    pricing: {
      tiers: [
        { petCount: 1, nightlyRate: 32 },
        { petCount: 2, nightlyRate: 58 },
        { petCount: 3, nightlyRate: 84 },
        { petCount: 4, nightlyRate: 108 },
      ],
      halfDaySupplement: { enabled: true, label: "Medio día", amount: 8 },
      dayGuarderiaPrice: 20,
      guarderiaBono10Price: 180,
    },
  })),
  HOTEL_DEMO_CONFIG: {
    bookingFormUrl: "https://somosmuyperros.com/hotel-canino/",
    defaultTimezone: "Europe/Madrid",
    defaultMonthSheetPrefix: "Reserva",
    reminderLeadHours: 48,
    whatsappUrl: "https://wa.me/34682621177",
    whatsappPhone: "682 62 11 77",
    baseCountryCode: "34",
    capacity: {
      standardRoomsPerSlot: 18,
      overflowRoomsPerSlot: 0,
      allowOverflow: false,
      maxPetsPerRoom: 1,
    },
    pricing: {
      tiers: [
        { petCount: 1, nightlyRate: 30 },
        { petCount: 2, nightlyRate: 45 },
        { petCount: 3, nightlyRate: 50 },
        { petCount: 4, nightlyRate: 55 },
      ],
      halfDaySupplement: {
        enabled: true,
        label: "Suplemento de medio día",
        amount: 12,
      },
      dayGuarderiaPrice: 25,
      guarderiaBono10Price: 220,
    },
  },
  HOTEL_COLOR_MAPPING: {
    sheetState: {
      reservado: "#00ff00",
      bloqueado: "#ff0000",
      overflow: "#0000ff",
    },
  },
}));

vi.mock("./demo-store", () => ({
  loadDemoState: vi.fn(async () => ({
    reservations: [],
    reminders: [],
    monthSnapshots: [],
    logs: [],
    updatedAt: new Date().toISOString(),
  })),
  appendLog: vi.fn(async () => undefined),
  replaceRemindersForReservation: vi.fn(async () => undefined),
  upsertReservation: vi.fn(async () => undefined),
}));

vi.mock("../content/whatsapp-templates", () => ({
  buildWhatsAppAvailabilityMessage: vi.fn(() => "mensaje disponibilidad"),
  buildWhatsAppManualReminderMessage: vi.fn(() => "recordatorio"),
}));

import { processReservationEmail } from "./process-reservation";

describe("processReservationEmail", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("conserva una traza de workflow y queda disponible hasta la confirmación", async () => {
    const result = await processReservationEmail({
      subject: "Solicitud de reserva",
      rawText: "contenido",
    });

    expect(result.status).toBe("disponible");
    expect(result.workflowState).toBe("available");
    expect(result.workflowTrail.map((step) => step.to)).toEqual([
      "parsed",
      "available",
    ]);
    expect(result.reservation?.identityTrace?.petKey).toContain("luna");
    expect(result.reservation?.identityTrace?.reservationId).toContain("34612345678");
    expect(result.identityTrace?.collisionKey).toContain("luna");
    expect(result.reminders).toHaveLength(0);
  });

  it("conserva trazabilidad cuando una hora se normaliza en el intake", async () => {
    vi.mocked(parseReservationEmail).mockReturnValue({
      draft: {
        source: "email",
        rawText: "mock",
        subject: "Reserva reenviada",
        reservationType: "hotel",
        ownerName: "Cliente Demo Smoke",
        ownerEmail: "cliente.demo.smoke@example.test",
        petName: "luca",
        petSex: "macho",
        petBreed: "perro de agua",
        pets: [
          {
            name: "luca",
            sex: "macho",
            breed: "perro de agua",
            rawLine: "luca - Macho - perro de agua",
          },
        ],
        phone: "600000123",
        whatsapp: "+34600000123",
        checkInDate: "2026-08-17",
        checkInTime: "07:00",
        originalRequestedCheckInTime: "07:00",
        normalizedCheckInTime: "08:00",
        checkInTimeWasAdjusted: true,
        checkInTimeAdjustmentMessage:
          "La hora solicitada (07:00) esta fuera del horario operativo. Aplicamos la hora valida mas cercana: 08:00. Horario del centro: 08:00-11:00 y 16:30-19:30.",
        checkInTurn: "manana",
        checkOutDate: "2026-08-28",
        checkOutTime: "07:00",
        originalRequestedCheckOutTime: "07:00",
        normalizedCheckOutTime: "08:00",
        checkOutTimeWasAdjusted: true,
        checkOutTimeAdjustmentMessage:
          "La hora solicitada (07:00) esta fuera del horario operativo. Aplicamos la hora valida mas cercana: 08:00. Horario del centro: 08:00-11:00 y 16:30-19:30.",
        checkOutTurn: "manana",
        petCount: 1,
        notes: undefined,
        language: "es",
        reviewFlags: [],
        reviewState: "ok",
      },
      meta: {
        decodedText: "mock",
        reservationBlock: "mock",
        assumptions: [
          "Hora 07:00 fuera de la franja válida de entrada; requiere revisión manual.",
          "Hora 07:00 fuera de la franja válida de salida; requiere revisión manual.",
        ],
        extractedFields: {},
      },
    });

    const result = await processReservationEmail({
      subject: "Solicitud de reserva",
      rawText: "contenido",
    });

    expect(result.status).toBe("disponible");
    expect(result.workflowState).toBe("available");
    expect(result.reviewFlags).not.toContain("invalid_slot");
    expect(result.reservation?.originalRequestedCheckInTime).toBe("07:00");
    expect(result.reservation?.normalizedCheckInTime).toBe("08:00");
    expect(result.reservation?.checkInTimeWasAdjusted).toBe(true);
    expect(result.reminders).toHaveLength(0);
  });
});
