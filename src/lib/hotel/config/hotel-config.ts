import type { HotelColorMapping, HotelConfig, HotelFeatureFlags } from "../domain/contracts";
import { HOTEL_SLOTS, HOTEL_SLOT_LABELS, HOTEL_SLOT_WINDOWS } from "../domain/slots";

export const HOTEL_DEMO_CONFIG: HotelConfig = {
  hotelName: "Somos Muy Perros",
  bookingFormUrl: "https://somosmuyperros.com/hotel-canino/",
  whatsappUrl: "https://wa.me/34682621177",
  whatsappPhone: "682 62 11 77",
  baseCountryCode: "34",
  reminderLeadHours: 120,
  defaultTimezone: "Europe/Madrid",
  defaultMonthSheetPrefix: "Reserva",
  receptionWindows: HOTEL_SLOT_WINDOWS,
  slotLabels: HOTEL_SLOT_LABELS,
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
};

export const HOTEL_FEATURE_FLAGS: HotelFeatureFlags = {
  useMockEmailInput: true,
  useMockWhatsappSend: true,
  useGoogleSheetsReal: false,
  useRemindersReal: false,
  useDemoPersistence: true,
};

export const HOTEL_COLOR_MAPPING: HotelColorMapping = {
  reservationStatus: {
    pendiente: "#D97706",
    disponible: "#16A34A",
    sin_disponibilidad: "#DC2626",
    confirmada: "#2563EB",
  },
  reviewState: {
    ok: "#0F766E",
    necesita_revision: "#B45309",
  },
  occupancyState: {
    free: "#E2F8E9",
    low: "#B7E4C7",
    medium: "#FDE68A",
    high: "#FDBA74",
    full: "#FCA5A5",
  },
  petCount: {
    1: "#7C3AED",
    2: "#DB2777",
    3: "#0369A1",
    4: "#047857",
  },
  sheetState: {
    disponible: "#16A34A",
    reservado: "#2563EB",
    bloqueado: "#DC2626",
    overflow: "#B45309",
    mantenimiento: "#6B7280",
  },
};

export const HOTEL_DEMO_RUNTIME = {
  timezone: HOTEL_DEMO_CONFIG.defaultTimezone,
  slots: HOTEL_SLOTS,
  bookingUrl: HOTEL_DEMO_CONFIG.bookingFormUrl,
  whatsappUrl: HOTEL_DEMO_CONFIG.whatsappUrl,
};
