import { hotelDemoConfig } from "@/lib/hotel/integrations/config";
import type {
  DemoLogEntry,
  DemoReservationRecord,
  HotelRuntimeFlags,
  ReminderJob,
  SheetsAvailabilityInput,
  SheetsAvailabilityResult,
  SheetsCancellationResult,
  SheetsWriteResult,
  TransportMode,
  WhatsappMessagePayload,
} from "@/lib/hotel/integrations/types";
import { appendDemoLog, loadDemoState } from "@/lib/hotel/persistence/store";
import { readHotelRuntimeFlags, readTransportMode } from "@/lib/hotel/runtime/env";
import { buildGoogleSheetAdapter } from "@/lib/hotel/sheets/google";
import { buildMockSheetAdapter } from "@/lib/hotel/sheets/mock";
import type { SheetAdapter } from "@/lib/hotel/sheets/types";
import { scheduleReminderJob } from "@/lib/hotel/reminders/scheduler";
import type { ReminderDispatchResult } from "@/lib/hotel/reminders/types";
import { sendWhatsAppBookingMessage, type WhatsappSendResult } from "@/lib/hotel/whatsapp/transport";

export interface HotelIntegrationBundle {
  flags: HotelRuntimeFlags;
  transportMode: TransportMode;
  sheets: SheetAdapter;
  sendWhatsAppMessage(payload: WhatsappMessagePayload): Promise<WhatsappSendResult>;
  scheduleReminder(job: ReminderJob): Promise<ReminderDispatchResult>;
  log(entry: Omit<DemoLogEntry, "id" | "at">): Promise<DemoLogEntry>;
  readAvailability(input: SheetsAvailabilityInput): Promise<SheetsAvailabilityResult>;
  writeReservation(reservation: DemoReservationRecord): Promise<SheetsWriteResult>;
  cancelReservation(reservationId: string): Promise<SheetsCancellationResult>;
}

export async function createHotelIntegrationBundle(
  storeName = "hotel-demo-state.json",
): Promise<HotelIntegrationBundle> {
  const flags = readHotelRuntimeFlags();
  const transportMode = readTransportMode();
  const sheets =
    transportMode !== "mock" && flags.useRealGoogleSheets
      ? await buildGoogleSheetAdapter({
          mode: transportMode,
          storeName,
          spreadsheetId: process.env.HOTEL_GOOGLE_SHEETS_SPREADSHEET_ID,
          accessToken: process.env.HOTEL_GOOGLE_SHEETS_ACCESS_TOKEN,
        })
      : await buildMockSheetAdapter(storeName);

  return {
    flags,
    transportMode,
    sheets,
    sendWhatsAppMessage(payload) {
      return sendWhatsAppBookingMessage(payload, {
        useMockWhatsApp: flags.useMockWhatsApp,
        webhookUrl: process.env.HOTEL_WHATSAPP_WEBHOOK_URL,
      });
    },
    scheduleReminder(job) {
      return scheduleReminderJob(job, {
        mode: flags.useRealReminders ? "real" : "mock",
        webhookUrl:
          process.env.HOTEL_REMINDERS_WEBHOOK_URL ??
          process.env.HOTEL_REMINDER_WEBHOOK_URL,
        storeName,
      });
    },
    async log(entry) {
      return appendDemoLog(entry, storeName);
    },
    async readAvailability(input) {
      return sheets.checkAvailability(input);
    },
    async writeReservation(reservation) {
      return sheets.writeReservation(reservation);
    },
    async cancelReservation(reservationId) {
      return sheets.cancelReservation(reservationId);
    },
  };
}

export async function readDemoState(storeName = "hotel-demo-state.json") {
  return loadDemoState(storeName);
}

export { hotelDemoConfig };
