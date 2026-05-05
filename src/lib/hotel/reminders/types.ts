import type { HotelSlot } from "@/lib/hotel/domain/slots";
import type {
  DemoLogEntry,
  DemoReservationRecord,
  ReminderJob as PersistedReminderJob,
  ReservationStatus,
} from "@/lib/hotel/integrations/types";

export type ReminderMode = "mock" | "real";

export type ReminderState =
  | "draft"
  | "scheduled"
  | "queued"
  | "preview"
  | "sent"
  | "failed"
  | "skipped"
  | "paused";

export type ReminderChannel = "whatsapp" | "email" | "internal";

export interface ReminderTraceEvent {
  at: string;
  stage: string;
  message: string;
  payload?: Record<string, unknown>;
}

export interface ReminderPlan {
  reminderId: string;
  reservationId: string;
  petName: string;
  ownerName?: string;
  phoneE164?: string;
  entryDate: string;
  entrySlot: HotelSlot;
  entryAt: string;
  dueAt: string;
  leadHours: number;
  channel: ReminderChannel;
  mode: ReminderMode;
  state: ReminderState;
  previewText: string;
  trace: ReminderTraceEvent[];
  sourceStatus: ReservationStatus;
}

export interface ReminderPlanInput {
  reservation: DemoReservationRecord;
  leadHours?: number;
  channel?: ReminderChannel;
  reminderId?: string;
  now?: Date;
}

export interface ReminderSelectionResult {
  due: ReminderPlan[];
  pending: ReminderPlan[];
  overdue: ReminderPlan[];
}

export interface ReminderTransportResponse {
  ok: boolean;
  status: number;
  statusText: string;
  bodyText?: string;
}

export interface ReminderTransportAdapter {
  send(plan: ReminderPlan): Promise<ReminderTransportResponse>;
}

export interface ReminderPersistenceAdapter {
  saveReminder(reminder: PersistedReminderJob & Record<string, unknown>): Promise<void>;
  appendLog(entry: Omit<DemoLogEntry, "id" | "at">): Promise<DemoLogEntry>;
}

export interface ReminderSchedulingOptions {
  mode?: ReminderMode;
  channel?: ReminderChannel;
  leadHours?: number;
  webhookUrl?: string;
  storeName?: string;
  now?: Date;
  fallbackToPreview?: boolean;
  transport?: ReminderTransportAdapter;
  persistence?: ReminderPersistenceAdapter;
}

export interface ReminderDispatchResult {
  ok: boolean;
  mode: ReminderMode;
  state: ReminderState;
  delivered: boolean;
  previewed: boolean;
  persisted: boolean;
  reminder: ReminderPlan;
  logEntry?: DemoLogEntry;
  transportResponse?: ReminderTransportResponse;
}

export interface ReminderRuntimeConfig {
  defaultLeadHours: number;
  defaultChannel: ReminderChannel;
  defaultMode: ReminderMode;
  defaultStoreName: string;
  fallbackToPreview: boolean;
  webhookUrl?: string;
}

