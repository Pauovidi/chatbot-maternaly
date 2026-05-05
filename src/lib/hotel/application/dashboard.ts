import { getHotelFeatureFlags } from "../config";
import { loadDemoState } from "./demo-store";
import type { DemoDashboardData } from "./types";

export async function getDemoDashboardData(): Promise<DemoDashboardData> {
  const state = await loadDemoState();
  const flags = getHotelFeatureFlags();

  return {
    reservations: state.reservations,
    reminders: state.reminders,
    monthSnapshots: state.monthSnapshots,
    logs: state.logs,
    integrationModes: {
      email: flags.useMockEmailInput ? "manual" : "real",
      whatsapp: flags.useMockWhatsappSend ? "mock" : "real",
      sheets: flags.useGoogleSheetsReal ? "real" : "mock",
      reminders: flags.useRemindersReal ? "real" : "mock",
      persistence: flags.useDemoPersistence ? "mock" : "real",
    },
  };
}
