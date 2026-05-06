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
}

export interface ConversationListFilters {
  query?: string;
  search?: string;
  status?: string;
  channel?: string;
  unreadOnly?: boolean;
  limit?: number;
  mode?: "all" | ConversationMode | "pending" | "read";
}

export interface ConversationStats {
  total: number;
  unread: number;
  pending: number;
  human: number;
  read: number;
}

export interface ConversationDashboard {
  conversations: ConversationRecord[];
  stats: ConversationStats;
}
