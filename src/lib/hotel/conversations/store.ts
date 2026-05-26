import type {
  Conversation,
  ConversationEvent,
  ConversationListFilters,
  ConversationRecord,
  ConversationSnapshot,
  Message,
} from "./types";

export interface ConversationStore {
  load(): Promise<ConversationSnapshot>;
  save(snapshot: ConversationSnapshot): Promise<void>;
  list(filters?: ConversationListFilters): Promise<ConversationRecord[]>;
  getById(id: string): Promise<ConversationRecord | undefined>;
  getByPhone(phoneNormalized: string): Promise<ConversationRecord | undefined>;
  upsertConversation(conversation: Conversation): Promise<ConversationRecord>;
  addMessage(message: Message): Promise<Message>;
  addEvent(event: ConversationEvent): Promise<ConversationEvent>;
  replaceConversation(record: ConversationRecord): Promise<ConversationRecord>;
  seed(records: ConversationRecord[]): Promise<ConversationSnapshot>;
}

export function createEmptyConversationSnapshot(): ConversationSnapshot {
  return {
    conversations: [],
    updatedAt: new Date().toISOString(),
  };
}

export function filterConversationRecords(
  records: ConversationRecord[],
  filters: ConversationListFilters = {},
): ConversationRecord[] {
  const query = (filters.query ?? filters.search)?.trim().toLowerCase();
  const limit =
    typeof filters.limit === "number" && Number.isFinite(filters.limit)
      ? Math.max(1, Math.min(filters.limit, 200))
      : undefined;

  const filtered = records
    .filter((record) => {
      if (filters.mode === "bot" || filters.mode === "human") {
        return record.mode === filters.mode;
      }

      if (filters.mode === "pending") {
        return record.humanRequested || record.unreadCount > 0;
      }

      if (filters.mode === "read") {
        return record.unreadCount === 0 && !record.humanRequested;
      }

      return true;
    })
    .filter((record) => {
      if (!filters.status || filters.status === "all") {
        return true;
      }

      return record.status === filters.status;
    })
    .filter((record) => {
      if (!filters.channel || filters.channel === "all") {
        return true;
      }

      return (record.channel ?? record.sourceType) === filters.channel;
    })
    .filter((record) => !filters.unreadOnly || record.unreadCount > 0)
    .filter((record) => {
      if (!query) {
        return true;
      }

      const haystack = [
        record.phoneE164,
        record.phoneNormalized,
        record.displayName,
        record.customerName,
        record.clientName,
        record.clientStatus,
        record.clientSource,
        ...(record.clientWarnings ?? []),
        record.petName,
        record.channel,
        record.status,
        ...(record.tags ?? []),
        record.lastMessagePreview,
        ...record.messages.map((message) => message.body),
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();

      return haystack.includes(query);
    })
    .sort((left, right) => {
      const leftTime = left.updatedAt ?? left.createdAt;
      const rightTime = right.updatedAt ?? right.createdAt;
      return rightTime.localeCompare(leftTime);
    });

  return typeof limit === "number" ? filtered.slice(0, limit) : filtered;
}
