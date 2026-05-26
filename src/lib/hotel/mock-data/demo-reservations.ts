import { HOTEL_DEMO_CONFIG } from "../config";
import type { AvailabilityResult, ReminderJob, ReservationRecord } from "../domain/contracts";
import { buildPetKey, buildReservationId } from "../domain/identifiers";

const now = "2026-03-25T11:30:00+01:00";

const sampleAvailability: AvailabilityResult = {
  isAvailable: true,
  requiresReview: false,
  capacityPerSlot: HOTEL_DEMO_CONFIG.capacity.standardRoomsPerSlot,
  overflowUsed: false,
  blockingDates: [],
  snapshot: [
    {
      date: "2026-08-17",
      morningOccupied: 12,
      afternoonOccupied: 10,
      morningCapacity: HOTEL_DEMO_CONFIG.capacity.standardRoomsPerSlot,
      afternoonCapacity: HOTEL_DEMO_CONFIG.capacity.standardRoomsPerSlot,
    },
    {
      date: "2026-08-18",
      morningOccupied: 13,
      afternoonOccupied: 11,
      morningCapacity: HOTEL_DEMO_CONFIG.capacity.standardRoomsPerSlot,
      afternoonCapacity: HOTEL_DEMO_CONFIG.capacity.standardRoomsPerSlot,
    },
    {
      date: "2026-08-28",
      morningOccupied: 8,
      afternoonOccupied: 7,
      morningCapacity: HOTEL_DEMO_CONFIG.capacity.standardRoomsPerSlot,
      afternoonCapacity: HOTEL_DEMO_CONFIG.capacity.standardRoomsPerSlot,
    },
  ],
};

export const DEMO_RESERVATION_RECORDS: ReservationRecord[] = [
  {
    reservationId: buildReservationId({
      petName: "Luca",
      phone: "600000123",
      checkInDate: "2026-08-17",
      checkInSlot: "afternoon",
    }),
    petKey: buildPetKey("Luca", "Cliente Demo Smoke", "600000123"),
    status: "confirmada",
    workflowState: "reminder_scheduled",
    reviewState: "ok",
    source: "email",
    createdAt: now,
    updatedAt: now,
    ownerName: "Cliente Demo Smoke",
    ownerEmail: "cliente.demo.smoke@example.test",
    petName: "Luca",
    phone: "600000123",
    checkInDate: "2026-08-17",
    checkInSlot: "afternoon",
    checkOutDate: "2026-08-28",
    checkOutSlot: "morning",
    petCount: 1,
    notes: "Perro de agua; traer info de alimentación y contacto secundario.",
    reviewFlags: [],
    availability: sampleAvailability,
    pricing: {
      currency: "EUR",
      subtotal: 330,
      supplements: 0,
      total: 330,
      lineItems: [
        {
          code: "hotel-1-perro",
          label: "Hotel canino 1 perro",
          quantity: 11,
          unitPrice: 30,
          total: 330,
        },
      ],
      assumptions: ["Se ha tomado la tarifa de 1 perro por noche.", "No se ha aplicado suplemento de medio día."],
    },
  },
  {
    reservationId: buildReservationId({
      petName: "Bruna",
      phone: "+34 699 123 456",
      checkInDate: "2026-09-05",
      checkInSlot: "morning",
    }),
    petKey: buildPetKey("Bruna", "Marta Gil", "+34 699 123 456"),
    status: "pendiente",
    reviewState: "necesita_revision",
    source: "email",
    createdAt: now,
    updatedAt: now,
    ownerName: "Marta Gil",
    ownerEmail: "marta@example.com",
    petName: "Bruna",
    phone: "+34 699 123 456",
    checkInDate: "2026-09-05",
    checkInSlot: "morning",
    checkOutDate: "2026-09-07",
    checkOutSlot: "afternoon",
    petCount: 2,
    notes: "Falta confirmar si entra con medicacion.",
    reviewFlags: ["requiere_revision_manual"],
    availability: {
      ...sampleAvailability,
      isAvailable: true,
      requiresReview: true,
    },
    pricing: {
      currency: "EUR",
      subtotal: 90,
      supplements: 12,
      total: 102,
      lineItems: [
        {
          code: "hotel-2-perros",
          label: "Hotel canino 2 perros",
          quantity: 2,
          unitPrice: 45,
          total: 90,
        },
        {
          code: "suplemento-medio-dia",
          label: "Suplemento de medio día",
          quantity: 1,
          unitPrice: 12,
          total: 12,
        },
      ],
      assumptions: ["Se ha aplicado tarifa de 2 perros.", "Se ha aplicado suplemento de medio día por salida fuera de la franja de mañana."],
    },
  },
  {
    reservationId: buildReservationId({
      petName: "Nilo",
      phone: "618777888",
      checkInDate: "2026-09-10",
      checkInSlot: "afternoon",
    }),
    petKey: buildPetKey("Nilo", "Daniela Ruiz", "618777888"),
    status: "sin_disponibilidad",
    reviewState: "ok",
    source: "email",
    createdAt: now,
    updatedAt: now,
    ownerName: "Daniela Ruiz",
    ownerEmail: "daniela@example.com",
    petName: "Nilo",
    phone: "618777888",
    checkInDate: "2026-09-10",
    checkInSlot: "afternoon",
    checkOutDate: "2026-09-14",
    checkOutSlot: "morning",
    petCount: 3,
    notes: "Alta ocupacion en ambas franjas del 10/09.",
    reviewFlags: [],
    availability: {
      isAvailable: false,
      requiresReview: false,
      capacityPerSlot: HOTEL_DEMO_CONFIG.capacity.standardRoomsPerSlot,
      overflowUsed: false,
      blockingDates: ["2026-09-10"],
      snapshot: [],
    },
  },
];

export const DEMO_REMINDER_QUEUE: ReminderJob[] = [
  {
    reminderId: "rem-20260815-luca",
    reservationId: DEMO_RESERVATION_RECORDS[0].reservationId,
    petName: "Luca",
    ownerName: "Cliente Demo Smoke",
    scheduledFor: "2026-08-12T16:30:00+02:00",
    leadHours: 120,
    status: "pendiente",
    channel: "whatsapp",
    messagePreview: "Recordatorio: la reserva de Luca entra en 5 dias.",
  },
];

export const DEMO_EMAIL_INBOX = [
  {
    id: "email-001",
    subject: "Fwd: Tienes nuevas Reservas Online pendientes de confirmar",
    receivedAt: "2026-03-25T11:22:13+01:00",
    summary:
      "Cliente Demo Smoke solicita estancia para Luca del 2026-08-17 13:00 al 2026-08-28 13:00, telefono 600000123.",
  },
  {
    id: "email-002",
    subject: "Reserva hotel canino - Bruna",
    receivedAt: "2026-03-25T09:55:00+01:00",
    summary:
      "Marta Gil pide disponibilidad para dos perros y comenta que uno lleva medicacion. Requiere revision manual.",
  },
];

export const DEMO_SHEET_SNAPSHOTS = [
  {
    sheetName: "Reserva Agosto 2026",
    monthKey: "2026-08",
    capacityPerSlot: HOTEL_DEMO_CONFIG.capacity.standardRoomsPerSlot,
    occupied: {
      "2026-08-17": { morning: 12, afternoon: 10 },
      "2026-08-18": { morning: 13, afternoon: 11 },
      "2026-08-28": { morning: 8, afternoon: 7 },
    },
  },
  {
    sheetName: "Reserva Septiembre 2026",
    monthKey: "2026-09",
    capacityPerSlot: HOTEL_DEMO_CONFIG.capacity.standardRoomsPerSlot,
    occupied: {
      "2026-09-05": { morning: 17, afternoon: 16 },
      "2026-09-10": { morning: 18, afternoon: 18 },
    },
  },
];
