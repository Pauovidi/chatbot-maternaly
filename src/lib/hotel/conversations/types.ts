import type { MaternalyJourneyStage as ContractJourneyStage } from "@/lib/maternaly/knowledge/charla-informativa-contract";

export type ConversationMode = "bot" | "human";
export type ConversationSourceType =
  | "whatsapp"
  | "web"
  | "email"
  | "manual"
  | "demo"
  | "reservation"
  | "unknown";
export type MessageDirection = "inbound" | "outbound";
export type MessageSenderType = "user" | "bot" | "human" | "system";
export type MessageTransport = "whatsapp";
export type ConversationClientStatus = "known" | "unknown" | "ambiguous" | "blocked";
export type ConversationClientConfidence = "strong" | "medium" | "weak" | "none";
export type MaternalyJourneyStage = ContractJourneyStage;

export interface PendingReservationProposal {
  proposalId: string;
  conversationId: string;
  phoneNormalized: string;
  clientStatus: ConversationClientStatus;
  clientName?: string;
  petName: string;
  checkIn: string;
  checkOut: string;
  checkInSlot: "morning" | "afternoon";
  checkOutSlot: "morning" | "afternoon";
  petCount: number;
  requestedAt: string;
  expiresAt: string;
  availabilitySnapshot?: unknown;
  status: "proposed" | "confirmed" | "expired" | "cancelled" | "failed";
  source: "whatsapp";
  createdFromMessageId: string;
  reservationId?: string;
  failureReason?: string;
}

export interface PendingReservationContext {
  contextId: string;
  conversationId: string;
  phoneNormalized: string;
  status: "collecting" | "fulfilled" | "expired" | "cancelled";
  source: "whatsapp";
  requestedAt: string;
  updatedAt: string;
  expiresAt: string;
  requestedFields: Array<"petName" | "dates">;
  createdFromMessageId: string;
}

export interface MaternalyNormalizedFlowState {
  serviceKey?: "charla_embarazo_1_20" | "taller_blw";
  journeyStage?: MaternalyJourneyStage;
  stage?:
    | "greeting"
    | "choosing_journey_stage"
    | "choosing_booking_service"
    | "collecting_service"
    | "awaiting_booking_decision"
    | "choosing_session"
    | "collecting_contact"
    | "write_planned"
    | "confirmed"
    | "blocked"
    | "handoff";
  selectedSessionId?: string;
  selectedGroupId?: string;
  fullName?: string;
  phone?: string;
  email?: string;
  peopleCount?: number;
  partnerName?: string;
  pregnancyWeek?: number;
  pregnancyMonth?: number;
  fppOrDueDate?: string;
  babyBirthDate?: string;
  location?: string;
  modality?: "presencial" | "online";
  observations?: string;
  pendingFields?: string[];
  idempotencyKey?: string;
  updatedAt: string;
}

export interface Conversation {
  id: string;
  phoneE164: string;
  phoneNormalized: string;
  displayName?: string;
  customerName?: string;
  petName?: string;
  channel?: string;
  status?: string;
  priority?: "low" | "normal" | "high" | "urgent" | string;
  tags?: string[];
  sourceType: ConversationSourceType;
  sourceRecordId?: string;
  reservationId?: string;
  serviceDetected?: string;
  sheetSource?: string;
  sheetRange?: string;
  maternalyReservationStatus?: "none" | "pending" | "confirmed";
  maternalyPaymentStatus?: "none" | "pending" | "confirmed";
  maternalyInvoiceStatus?: "none" | "pending" | "sent" | "failed";
  maternalyReviewStatus?: "ok" | "manual_review_required";
  clientStatus?: ConversationClientStatus;
  clientConfidence?: ConversationClientConfidence;
  clientName?: string;
  clientEmail?: string;
  clientWarnings?: string[];
  clientSource?: "google_sheets_client_directory";
  clientSheetName?: string;
  clientSheetRow?: number;
  maternalyNormalizedFlow?: MaternalyNormalizedFlowState;
  pendingReservationProposal?: PendingReservationProposal;
  pendingReservationContext?: PendingReservationContext;
  archivedAt?: string;
  archivedBy?: string;
  archivedReason?: string;
  requiresManualReview?: boolean;
  mode: ConversationMode;
  humanRequested: boolean;
  assignedAgent?: string;
  lastInboundAt?: string;
  lastOutboundAt?: string;
  lastMessagePreview?: string;
  unreadCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface Message {
  id: string;
  conversationId: string;
  direction: MessageDirection;
  senderType: MessageSenderType;
  transport: MessageTransport;
  externalMessageSid?: string;
  body: string;
  rawPayload?: unknown;
  createdAt: string;
}

export interface ConversationEvent {
  id: string;
  conversationId: string;
  eventType: string;
  type?: string;
  label?: string;
  payload?: unknown;
  createdAt: string;
  at?: string;
}

export interface ConversationRecord extends Conversation {
  messages: Message[];
  events: ConversationEvent[];
}

export interface ConversationSnapshot {
  conversations: ConversationRecord[];
  updatedAt: string;
  suppressDemoSeed?: boolean;
  resetAt?: string;
}

export interface ConversationListFilters {
  query?: string;
  search?: string;
  status?: string;
  channel?: string;
  unreadOnly?: boolean;
  limit?: number;
  mode?: "all" | ConversationMode | "pending" | "read" | "archived";
}

export interface ConversationStats {
  total: number;
  unread: number;
  pending: number;
  human: number;
  read: number;
  archived: number;
}

export interface ConversationDashboard {
  conversations: ConversationRecord[];
  stats: ConversationStats;
}
