import type {
  AvailabilityResult,
  ParsedReservationDraft,
  PricingQuote,
  ReminderJob,
  ReservationRecord,
  SheetsMonthSnapshot,
} from "../domain/contracts";
import type { SheetsAvailabilityResult } from "../integrations/types";
import type {
  ReservationReviewFlag,
  ReservationStatus,
  ReservationWorkflowState,
  ReservationWorkflowTransition,
} from "../domain/states";
import type { ReservationIdentityTrace } from "../domain/identifiers";

export interface DemoLogEntry {
  id: string;
  at: string;
  event: string;
  message: string;
  level: "info" | "warn" | "error";
}

export interface DemoSheetWritePlan {
  sheetName: string;
  monthKey: string;
  prepared: boolean;
  colorKey: string;
  colorHex: string;
  petName?: string;
  notes: string[];
  cellUpdates: Array<{ field: string; value: string }>;
}

export interface ProcessReservationResult {
  parsed: ParsedReservationDraft;
  reservation: ReservationRecord | null;
  availability: AvailabilityResult | null;
  pricing: PricingQuote | null;
  status: ReservationStatus;
  workflowState: ReservationWorkflowState;
  workflowTrail: ReservationWorkflowTransition[];
  identityTrace: ReservationIdentityTrace | null;
  reviewFlags: ReservationReviewFlag[];
  reviewNotes: string[];
  whatsappMessage: string;
  sheetWritePlan: DemoSheetWritePlan | null;
  reminders: ReminderJob[];
  assumptions: string[];
  technical?: {
    sheetsAvailability?: SheetsAvailabilityResult | null;
  };
}

export interface DemoDashboardData {
  reservations: ReservationRecord[];
  reminders: ReminderJob[];
  monthSnapshots: SheetsMonthSnapshot[];
  logs: DemoLogEntry[];
  integrationModes: {
    email: "manual" | "mock" | "real";
    whatsapp: "mock" | "real";
    sheets: "mock" | "real";
    reminders: "mock" | "real";
    persistence: "mock" | "real";
  };
}

export interface DemoStoreState {
  reservations: ReservationRecord[];
  reminders: ReminderJob[];
  monthSnapshots: SheetsMonthSnapshot[];
  logs: DemoLogEntry[];
  updatedAt: string;
}
