import { afterEach, describe, expect, it, vi } from "vitest";
import ConversationsAdminPage from "@/app/admin/conversations/page";
import { POST as postTwilioWebhook } from "@/app/api/twilio/whatsapp/route";
import { resetConversationStoreForTests } from "./file-store";
import {
  GoogleSheetsConversationStore,
  type GoogleSheetsConversationStoreIo,
} from "./google-sheets-store";
import type { ConversationRecord, Message } from "./types";

const googleSheetsMockState = vi.hoisted(() => ({
  rows: [] as string[][],
  sheetExists: false,
}));

vi.mock("googleapis", () => {
  const values = {
    get: vi.fn(async () => ({ data: { values: googleSheetsMockState.rows } })),
    clear: vi.fn(async () => {
      googleSheetsMockState.rows = [];
      return { data: {} };
    }),
    update: vi.fn(async ({ requestBody }: { requestBody?: { values?: string[][] } }) => {
      googleSheetsMockState.rows = requestBody?.values ?? [];
      return { data: {} };
    }),
  };
  return {
    google: {
      auth: {
        OAuth2: class {
          setCredentials() {}
        },
        GoogleAuth: class {},
      },
      sheets: vi.fn(() => ({
        spreadsheets: {
          get: vi.fn(async () => ({
            data: {
              sheets: googleSheetsMockState.sheetExists
                ? [{ properties: { title: "CONVERSATIONS" } }]
                : [],
            },
          })),
          batchUpdate: vi.fn(async () => {
            googleSheetsMockState.sheetExists = true;
            return { data: {} };
          }),
          values,
        },
      })),
    },
  };
});

vi.mock("next/headers", () => ({
  headers: vi.fn(async () => new Headers()),
}));

class MemorySheetsIo implements GoogleSheetsConversationStoreIo {
  rows: string[][] = [];
  ensuredSheets: string[] = [];

  async ensureSheet(sheetName: string): Promise<void> {
    this.ensuredSheets.push(sheetName);
  }

  async readRows(): Promise<string[][]> {
    return this.rows;
  }

  async writeRows(_sheetName: string, rows: string[][]): Promise<void> {
    this.rows = rows;
  }
}

function baseConversation(overrides: Partial<ConversationRecord> = {}): ConversationRecord {
  const now = "2026-06-02T10:00:00.000Z";
  return {
    id: "conv_1",
    phoneE164: "+34600000001",
    phoneNormalized: "34600000001",
    displayName: "Cliente",
    customerName: "Cliente",
    channel: "twilio_sandbox",
    status: "open",
    priority: "normal",
    tags: [],
    sourceType: "whatsapp",
    mode: "bot",
    humanRequested: false,
    unreadCount: 0,
    createdAt: now,
    updatedAt: now,
    messages: [],
    events: [],
    ...overrides,
  };
}

function inboundMessage(overrides: Partial<Message> = {}): Message {
  return {
    id: "msg_1",
    conversationId: "conv_1",
    direction: "inbound",
    senderType: "user",
    transport: "whatsapp",
    externalMessageSid: "SM_TEST_1",
    body: "Hola",
    createdAt: "2026-06-02T10:01:00.000Z",
    ...overrides,
  };
}

describe("Google Sheets conversation store", () => {
  afterEach(() => {
    resetConversationStoreForTests();
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
    googleSheetsMockState.rows = [];
    googleSheetsMockState.sheetExists = false;
    delete process.env.MATERNALY_CONVERSATIONS_STORE_PROVIDER;
    delete process.env.HOTEL_CONVERSATIONS_STORE_PROVIDER;
    delete process.env.MATERNALY_CONVERSATIONS_SHEET_NAME;
    delete process.env.MATERNALY_GOOGLE_SHEETS_SPREADSHEET_ID;
    delete process.env.MATERNALY_DEMO_VERCEL_GOOGLE_SHEETS_STORE_ENABLED;
    delete process.env.DATABASE_URL;
    delete process.env.TWILIO_WEBHOOK_AUTH_TOKEN;
    delete process.env.TWILIO_PROVIDER_MODE;
    delete process.env.WHATSAPP_PROVIDER;
    delete process.env.LLM_PROVIDER;
    delete process.env.GOOGLE_SHEETS_ACCESS_MODE;
    delete process.env.BOT_SHEETS_LIVE_WRITE_ENABLED;
  });

  it("serializes conversations, messages and mode updates into a CONVERSATIONS sheet", async () => {
    const io = new MemorySheetsIo();
    const store = new GoogleSheetsConversationStore("CONVERSATIONS", io);
    await store.seed([baseConversation()]);

    const first = await store.addMessage(inboundMessage());
    const duplicate = await store.addMessage(inboundMessage({ id: "msg_retry" }));
    const updated = await store.replaceConversation({
      ...(await store.getById("conv_1"))!,
      mode: "human",
      assignedAgent: "admin",
    });
    const loaded = await store.load();

    expect(io.ensuredSheets).toContain("CONVERSATIONS");
    expect(first.id).toBe("msg_1");
    expect(duplicate.id).toBe("msg_1");
    expect(updated.mode).toBe("human");
    expect(loaded.conversations).toHaveLength(1);
    expect(loaded.conversations[0].messages).toHaveLength(1);
    expect(io.rows[0]).toEqual(["kind", "conversationId", "updatedAt", "payloadJson"]);
    expect(io.rows.some((row) => row[0] === "conversation" && row[1] === "conv_1")).toBe(true);
  });

  it("lets the Twilio webhook persist inbound conversations through the configured Sheets store", async () => {
    vi.spyOn(console, "info").mockImplementation(() => undefined);
    vi.stubEnv("NODE_ENV", "production");
    process.env.APP_ENV = "production";
    process.env.MATERNALY_CONVERSATIONS_STORE_PROVIDER = "google_sheets";
    process.env.MATERNALY_CONVERSATIONS_SHEET_NAME = "CONVERSATIONS";
    process.env.MATERNALY_GOOGLE_SHEETS_SPREADSHEET_ID = "sheet-id";
    process.env.MATERNALY_DEMO_VERCEL_GOOGLE_SHEETS_STORE_ENABLED = "true";
    process.env.TWILIO_WEBHOOK_AUTH_TOKEN = "expected-token";
    process.env.TWILIO_PROVIDER_MODE = "sandbox";
    process.env.WHATSAPP_PROVIDER = "twilio";
    process.env.LLM_PROVIDER = "mock";
    process.env.GOOGLE_SHEETS_ACCESS_MODE = "read_only";
    process.env.BOT_SHEETS_LIVE_WRITE_ENABLED = "false";

    const response = await postTwilioWebhook(
      new Request("https://example.test/api/twilio/whatsapp?token=expected-token", {
        method: "POST",
        headers: {
          "content-type": "application/x-www-form-urlencoded",
        },
        body: new URLSearchParams({
          From: "whatsapp:+34600000009",
          To: "whatsapp:+14155238886",
          Body: "Hola, quiero información sobre Maternaly",
          MessageSid: "SM_SHEETS_001",
          ProfileName: "Cliente Demo",
        }),
      }),
    );

    const conversationRow = googleSheetsMockState.rows.find((row) => row[0] === "conversation");
    const conversation = JSON.parse(conversationRow?.[3] ?? "{}") as ConversationRecord;

    expect(response.status).toBe(200);
    expect(conversation.phoneNormalized).toBe("34600000009");
    expect(conversation.channel).toBe("twilio_sandbox");
    expect(conversation.messages).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          direction: "inbound",
          externalMessageSid: "SM_SHEETS_001",
        }),
      ]),
    );
  });

  it("renders the admin conversations page without Postgres when Sheets store is configured", async () => {
    vi.stubEnv("NODE_ENV", "test");
    process.env.APP_ENV = "production";
    process.env.MATERNALY_CONVERSATIONS_STORE_PROVIDER = "google_sheets";
    process.env.MATERNALY_GOOGLE_SHEETS_SPREADSHEET_ID = "sheet-id";
    process.env.MATERNALY_DEMO_VERCEL_GOOGLE_SHEETS_STORE_ENABLED = "true";
    delete process.env.DATABASE_URL;

    const page = await ConversationsAdminPage();

    expect(page).toBeTruthy();
  });
});
