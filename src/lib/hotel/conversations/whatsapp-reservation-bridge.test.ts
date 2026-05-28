import { describe, expect, it } from "vitest";

import { buildEntryLogRecord } from "@/lib/hotel/application/entry-log";
import type { ReservationRecord } from "@/lib/hotel/domain/contracts";
import type { DemoReservationRecord, SheetsAvailabilityResult } from "@/lib/hotel/integrations/types";
import { createStaticClientDirectory } from "@/lib/hotel/clients";
import type { SheetAdapter, SheetsWriteResult } from "@/lib/hotel/sheets/types";
import { handleInboundWhatsApp } from "./service";
import {
  createEmptyConversationSnapshot,
  filterConversationRecords,
  type ConversationStore,
} from "./store";
import type {
  Conversation,
  ConversationEvent,
  ConversationListFilters,
  ConversationRecord,
  ConversationSnapshot,
  Message,
} from "./types";

class MemoryConversationStore implements ConversationStore {
  private snapshot: ConversationSnapshot = createEmptyConversationSnapshot();

  async load(): Promise<ConversationSnapshot> {
    return structuredClone(this.snapshot);
  }

  async save(snapshot: ConversationSnapshot): Promise<void> {
    this.snapshot = structuredClone(snapshot);
  }

  async list(filters?: ConversationListFilters): Promise<ConversationRecord[]> {
    return filterConversationRecords(this.snapshot.conversations, filters);
  }

  async getById(id: string): Promise<ConversationRecord | undefined> {
    return structuredClone(this.snapshot.conversations.find((record) => record.id === id));
  }

  async getByPhone(phoneNormalized: string): Promise<ConversationRecord | undefined> {
    return structuredClone(
      this.snapshot.conversations.find((record) => record.phoneNormalized === phoneNormalized),
    );
  }

  async upsertConversation(conversation: Conversation): Promise<ConversationRecord> {
    const existing = this.snapshot.conversations.find((record) => record.id === conversation.id);
    const record: ConversationRecord = {
      ...existing,
      ...conversation,
      messages: existing?.messages ?? [],
      events: existing?.events ?? [],
    };
    this.snapshot.conversations = [
      record,
      ...this.snapshot.conversations.filter((item) => item.id !== record.id),
    ];
    return structuredClone(record);
  }

  async addMessage(message: Message): Promise<Message> {
    const record = this.snapshot.conversations.find(
      (conversation) => conversation.id === message.conversationId,
    );
    if (!record) {
      throw new Error("Conversation not found");
    }
    record.messages.push(message);
    record.updatedAt = message.createdAt;
    record.lastMessagePreview = message.body.slice(0, 180);
    if (message.direction === "inbound") {
      record.unreadCount += 1;
      record.lastInboundAt = message.createdAt;
    } else {
      record.lastOutboundAt = message.createdAt;
    }
    return structuredClone(message);
  }

  async addEvent(event: ConversationEvent): Promise<ConversationEvent> {
    const record = this.snapshot.conversations.find(
      (conversation) => conversation.id === event.conversationId,
    );
    if (!record) {
      throw new Error("Conversation not found");
    }
    record.events.push(event);
    record.updatedAt = event.createdAt;
    return structuredClone(event);
  }

  async replaceConversation(record: ConversationRecord): Promise<ConversationRecord> {
    this.snapshot.conversations = [
      structuredClone(record),
      ...this.snapshot.conversations.filter((item) => item.id !== record.id),
    ];
    return structuredClone(record);
  }

  async seed(records: ConversationRecord[]): Promise<ConversationSnapshot> {
    this.snapshot = {
      conversations: structuredClone(records),
      updatedAt: new Date().toISOString(),
    };
    return this.load();
  }
}

function makeAvailability(available = true): SheetsAvailabilityResult {
  return {
    available,
    conflicts: available ? [] : ["2026-12-30"],
    monthKey: "2026-12",
    sheetName: "DICIEMBRE 2026",
    remainingByDate: {
      "2026-12-29": { morning: available ? 8 : 0, afternoon: available ? 8 : 0 },
      "2026-12-30": { morning: available ? 8 : 0, afternoon: available ? 8 : 0 },
      "2026-12-31": { morning: available ? 8 : 0, afternoon: available ? 8 : 0 },
    },
  };
}

function makeBridgeDeps(options: {
  availabilitySequence?: boolean[];
  writeFails?: boolean;
} = {}) {
  const counters = {
    checks: 0,
    writes: 0,
    reservations: [] as ReservationRecord[],
  };
  const sequence = options.availabilitySequence ?? [true, true];
  const adapter: SheetAdapter = {
    async readMonth() {
      return {
        monthKey: "2026-12",
        sheetName: "DICIEMBRE 2026",
        capacityBySlot: { morning: 10, afternoon: 10 },
        occupiedByDate: {},
        reservations: [],
        colorPlan: [],
      };
    },
    async validateMonthStructure() {
      return {
        ok: true,
        monthKey: "2026-12",
        sheetName: "DICIEMBRE 2026",
        layout: {
          rangeStart: "A1",
          rangeEnd: "AF39",
          titleRow: 1,
          dayHeaderRow: 3,
          firstReservationRow: 4,
          lastReservationRow: 39,
          firstDayColumn: 2,
          lastDayColumn: 32,
          specialLabelColumn: 1,
        },
        issues: [],
        rowCount: 39,
        dayHeaders: [29, 30, 31],
        occupiedCells: 0,
      };
    },
    async checkAvailability() {
      const available = sequence[Math.min(counters.checks, sequence.length - 1)];
      counters.checks += 1;
      return makeAvailability(available);
    },
    async buildWritePlan(reservation: DemoReservationRecord) {
      return {
        sheetName: "DICIEMBRE 2026",
        reservationId: reservation.id,
        petName: reservation.petName,
        rowHint: 7,
        colorPlan: [],
        cellUpdates: [{ cell: "B7", value: reservation.petName }],
        metadataUpdates: [],
      };
    },
    async writeReservation(reservation: DemoReservationRecord): Promise<SheetsWriteResult> {
      counters.writes += 1;
      if (options.writeFails) {
        throw new Error("mock sheet write failed");
      }
      return {
        ok: true,
        reservationId: reservation.id,
        sheetName: "DICIEMBRE 2026",
        petName: reservation.petName,
        rowHint: 7,
        colorPlan: [],
        cellUpdates: [{ cell: "B7", value: reservation.petName }],
        metadataUpdates: [],
        mode: "mock",
      };
    },
    async cancelReservation(reservationId: string) {
      return {
        ok: true,
        reservationId,
        sheetName: "DICIEMBRE 2026",
        clearedCells: ["B7"],
        metadataUpdates: [],
        mode: "mock",
        cancelledAt: new Date().toISOString(),
      };
    },
  };

  return {
    counters,
    deps: {
      async buildSheetAdapter() {
        return adapter;
      },
      async upsertReservationRecord(reservation: ReservationRecord) {
        counters.reservations.push(structuredClone(reservation));
      },
    },
  };
}

describe("WhatsApp reservation bridge", () => {
  it("creates a pending proposal from a full reservation request without writing Sheets", async () => {
    const store = new MemoryConversationStore();
    const { counters, deps } = makeBridgeDeps();

    const result = await handleInboundWhatsApp(
      {
        from: "whatsapp:+34600009991",
        body: "Quiero reservar para Kira QA del 29 al 31 de diciembre de 2026",
        messageSid: "SM_BRIDGE_PROPOSAL",
      },
      store,
      createStaticClientDirectory([]),
      deps,
    );

    expect(result.conversation.mode).toBe("bot");
    expect(result.conversation.reservationId).toBeUndefined();
    expect(result.conversation.pendingReservationProposal).toMatchObject({
      status: "proposed",
      petName: "Kira QA",
      checkIn: "2026-12-29",
      checkOut: "2026-12-31",
    });
    expect(result.botReply?.body).toContain("Tenemos disponibilidad");
    expect(result.botReply?.body).toContain("¿Quieres que dejemos la reserva anotada?");
    expect(counters.checks).toBe(1);
    expect(counters.writes).toBe(0);
    expect(counters.reservations).toHaveLength(0);
  });

  it("writes a confirmed proposal through the adapter and projects it into entry log", async () => {
    const store = new MemoryConversationStore();
    const { counters, deps } = makeBridgeDeps();

    await handleInboundWhatsApp(
      {
        from: "whatsapp:+34600009991",
        body: "Quiero reservar para Kira QA del 29 al 31 de diciembre de 2026",
        messageSid: "SM_BRIDGE_CONFIRM_1",
      },
      store,
      createStaticClientDirectory([]),
      deps,
    );
    const confirmed = await handleInboundWhatsApp(
      {
        from: "whatsapp:+34600009991",
        body: "Sí, confirma",
        messageSid: "SM_BRIDGE_CONFIRM_2",
      },
      store,
      createStaticClientDirectory([]),
      deps,
    );

    expect(counters.checks).toBe(2);
    expect(counters.writes).toBe(1);
    expect(counters.reservations).toHaveLength(1);
    expect(confirmed.conversation.pendingReservationProposal?.status).toBe("confirmed");
    expect(confirmed.conversation.reservationId).toBe(counters.reservations[0].reservationId);
    expect(confirmed.botReply?.body).toContain("queda anotada");
    expect(confirmed.conversation.events.some((event) => event.eventType === "reservation_confirmed_from_whatsapp")).toBe(true);

    const reservation = counters.reservations[0];
    expect(reservation).toMatchObject({
      status: "confirmada",
      source: "demo",
      petName: "Kira QA",
      checkInDate: "2026-12-29",
      checkOutDate: "2026-12-31",
    });
    expect(reservation.sheetRegistration?.cells).toEqual(["B7"]);

    const entry = buildEntryLogRecord(reservation);
    expect(entry).toMatchObject({
      source: "chatbot",
      action: "confirmada",
      petName: "Kira QA",
      reservationId: reservation.reservationId,
      gestetStatus: "procesado Gestet",
    });
  });

  it("does not confirm without a pending proposal", async () => {
    const store = new MemoryConversationStore();
    const { counters, deps } = makeBridgeDeps();

    const result = await handleInboundWhatsApp(
      {
        from: "whatsapp:+34600009991",
        body: "Sí, confirma",
        messageSid: "SM_BRIDGE_NO_PROPOSAL",
      },
      store,
      createStaticClientDirectory([]),
      deps,
    );

    expect(result.conversation.mode).toBe("bot");
    expect(result.botReply?.body).toContain("necesito primero comprobar");
    expect(counters.checks).toBe(0);
    expect(counters.writes).toBe(0);
    expect(counters.reservations).toHaveLength(0);
  });

  it("revalidates availability before writing and hands off if the slot disappeared", async () => {
    const store = new MemoryConversationStore();
    const { counters, deps } = makeBridgeDeps({ availabilitySequence: [true, false] });

    await handleInboundWhatsApp(
      {
        from: "whatsapp:+34600009991",
        body: "Quiero reservar para Kira QA del 29 al 31 de diciembre de 2026",
        messageSid: "SM_BRIDGE_LOST_1",
      },
      store,
      createStaticClientDirectory([]),
      deps,
    );
    const result = await handleInboundWhatsApp(
      {
        from: "whatsapp:+34600009991",
        body: "Sí, confirma",
        messageSid: "SM_BRIDGE_LOST_2",
      },
      store,
      createStaticClientDirectory([]),
      deps,
    );

    expect(result.conversation.mode).toBe("human");
    expect(result.conversation.pendingReservationProposal?.status).toBe("failed");
    expect(result.botReply?.body).toContain("ya no puedo dejarla anotada");
    expect(counters.checks).toBe(2);
    expect(counters.writes).toBe(0);
    expect(counters.reservations).toHaveLength(0);
  });

  it("does not confirm expired proposals", async () => {
    const store = new MemoryConversationStore();
    const { counters, deps } = makeBridgeDeps();
    let now = new Date("2026-05-27T10:00:00.000Z");
    const timedDeps = {
      ...deps,
      now: () => now,
    };

    await handleInboundWhatsApp(
      {
        from: "whatsapp:+34600009991",
        body: "Quiero reservar para Kira QA del 29 al 31 de diciembre de 2026",
        messageSid: "SM_BRIDGE_EXPIRED_1",
      },
      store,
      createStaticClientDirectory([]),
      timedDeps,
    );
    now = new Date("2026-05-27T13:01:00.000Z");
    const result = await handleInboundWhatsApp(
      {
        from: "whatsapp:+34600009991",
        body: "Sí, confirma",
        messageSid: "SM_BRIDGE_EXPIRED_2",
      },
      store,
      createStaticClientDirectory([]),
      timedDeps,
    );

    expect(result.conversation.pendingReservationProposal?.status).toBe("expired");
    expect(result.botReply?.body).toContain("ya no está vigente");
    expect(counters.writes).toBe(0);
    expect(counters.reservations).toHaveLength(0);
  });

  it("does not say confirmed when the sheet write fails", async () => {
    const store = new MemoryConversationStore();
    const { counters, deps } = makeBridgeDeps({ writeFails: true });

    await handleInboundWhatsApp(
      {
        from: "whatsapp:+34600009991",
        body: "Quiero reservar para Kira QA del 29 al 31 de diciembre de 2026",
        messageSid: "SM_BRIDGE_WRITE_FAIL_1",
      },
      store,
      createStaticClientDirectory([]),
      deps,
    );
    const result = await handleInboundWhatsApp(
      {
        from: "whatsapp:+34600009991",
        body: "Sí, confirma",
        messageSid: "SM_BRIDGE_WRITE_FAIL_2",
      },
      store,
      createStaticClientDirectory([]),
      deps,
    );

    expect(result.conversation.mode).toBe("human");
    expect(result.conversation.pendingReservationProposal?.status).toBe("failed");
    expect(result.botReply?.body).toContain("no la marco como confirmada");
    expect(counters.writes).toBe(1);
    expect(counters.reservations).toHaveLength(0);
    const serialized = JSON.stringify(result.conversation);
    expect(serialized).not.toContain("mock sheet write failed");
  });

  it("does not persist raw reservation ids or sheet internals in conversation events", async () => {
    const store = new MemoryConversationStore();
    const { counters, deps } = makeBridgeDeps();

    await handleInboundWhatsApp(
      {
        from: "whatsapp:+34600009991",
        body: "Quiero reservar para Kira QA del 29 al 31 de diciembre de 2026",
        messageSid: "SM_BRIDGE_PRIVACY_1",
      },
      store,
      createStaticClientDirectory([]),
      deps,
    );
    const result = await handleInboundWhatsApp(
      {
        from: "whatsapp:+34600009991",
        body: "Sí, confirma",
        messageSid: "SM_BRIDGE_PRIVACY_2",
      },
      store,
      createStaticClientDirectory([]),
      deps,
    );
    const reservationId = counters.reservations[0].reservationId;
    const eventPayloads = JSON.stringify(result.conversation.events.map((event) => event.payload));

    expect(eventPayloads).not.toContain(reservationId);
    expect(eventPayloads).not.toContain("DICIEMBRE 2026");
    expect(eventPayloads).not.toContain('"rowHint"');
    expect(eventPayloads).toContain("[reservation-id:");
  });

  it("does not bridge blocked or ambiguous clients", async () => {
    const blockedStore = new MemoryConversationStore();
    const { counters, deps } = makeBridgeDeps();

    const blocked = await handleInboundWhatsApp(
      {
        from: "whatsapp:+34600009991",
        body: "Quiero reservar para Kira QA del 29 al 31 de diciembre de 2026",
        messageSid: "SM_BRIDGE_BLOCKED",
      },
      blockedStore,
      createStaticClientDirectory([
        {
          nombre: "Cliente QA Bloqueado",
          telefonoNormalizado: "34600009991",
          bloqueadoNoReservar: true,
        },
      ]),
      deps,
    );

    const ambiguousStore = new MemoryConversationStore();
    const ambiguous = await handleInboundWhatsApp(
      {
        from: "whatsapp:+34600009992",
        body: "Quiero reservar para Kira QA del 29 al 31 de diciembre de 2026",
        messageSid: "SM_BRIDGE_AMBIGUOUS",
      },
      ambiguousStore,
      createStaticClientDirectory([
        { nombre: "Cliente QA A", telefonoNormalizado: "34600009992" },
        { nombre: "Cliente QA B", telefonoNormalizado: "34600009992" },
      ]),
      deps,
    );

    expect(blocked.conversation.mode).toBe("human");
    expect(blocked.conversation.pendingReservationProposal).toBeUndefined();
    expect(ambiguous.conversation.mode).toBe("human");
    expect(ambiguous.conversation.pendingReservationProposal).toBeUndefined();
    expect(counters.checks).toBe(0);
    expect(counters.writes).toBe(0);
  });

  it("does not duplicate writes on repeated confirmation once a proposal is confirmed", async () => {
    const store = new MemoryConversationStore();
    const { counters, deps } = makeBridgeDeps();

    await handleInboundWhatsApp(
      {
        from: "whatsapp:+34600009991",
        body: "Quiero reservar para Kira QA del 29 al 31 de diciembre de 2026",
        messageSid: "SM_BRIDGE_IDEMPOTENT_1",
      },
      store,
      createStaticClientDirectory([]),
      deps,
    );
    await handleInboundWhatsApp(
      {
        from: "whatsapp:+34600009991",
        body: "Sí, confirma",
        messageSid: "SM_BRIDGE_IDEMPOTENT_2",
      },
      store,
      createStaticClientDirectory([]),
      deps,
    );
    const repeated = await handleInboundWhatsApp(
      {
        from: "whatsapp:+34600009991",
        body: "Sí, confirma",
        messageSid: "SM_BRIDGE_IDEMPOTENT_3",
      },
      store,
      createStaticClientDirectory([]),
      deps,
    );

    expect(repeated.conversation.pendingReservationProposal?.status).toBe("confirmed");
    expect(counters.writes).toBe(1);
    expect(counters.reservations).toHaveLength(1);
  });
});
