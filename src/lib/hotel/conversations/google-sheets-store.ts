import { google, type sheets_v4 } from "googleapis";
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

const GOOGLE_SHEETS_SCOPES = ["https://www.googleapis.com/auth/spreadsheets"] as const;
const CONVERSATIONS_HEADERS = ["kind", "conversationId", "updatedAt", "payloadJson"] as const;
const META_ROW_KIND = "meta";
const CONVERSATION_ROW_KIND = "conversation";

interface SheetsConnection {
  client: sheets_v4.Sheets;
  spreadsheetId: string;
}

export interface GoogleSheetsConversationStoreIo {
  ensureSheet(sheetName: string): Promise<void>;
  readRows(sheetName: string): Promise<string[][]>;
  writeRows(sheetName: string, rows: string[][]): Promise<void>;
}

function normalizePrivateKey(value: string): string {
  return value.replace(/\\n/g, "\n");
}

function readStringEnv(env: NodeJS.ProcessEnv, names: string[]): string | undefined {
  for (const name of names) {
    const value = env[name]?.trim();
    if (value) {
      return value;
    }
  }

  return undefined;
}

function readGoogleServiceAccountJson(env: NodeJS.ProcessEnv): string | undefined {
  const rawJson = readStringEnv(env, [
    "MATERNALY_GOOGLE_SHEETS_SERVICE_ACCOUNT_JSON",
    "HOTEL_GOOGLE_SHEETS_SERVICE_ACCOUNT_JSON",
    "GOOGLE_SERVICE_ACCOUNT_JSON",
  ]);
  if (rawJson) {
    return rawJson;
  }

  const base64 = readStringEnv(env, ["GOOGLE_SERVICE_ACCOUNT_JSON_BASE64"]);
  if (base64) {
    return Buffer.from(base64, "base64").toString("utf8");
  }

  const clientEmail = readStringEnv(env, [
    "MATERNALY_GOOGLE_SHEETS_SERVICE_ACCOUNT_EMAIL",
    "HOTEL_GOOGLE_SHEETS_SERVICE_ACCOUNT_EMAIL",
    "GOOGLE_SERVICE_ACCOUNT_EMAIL",
  ]);
  const privateKey = readStringEnv(env, [
    "MATERNALY_GOOGLE_SHEETS_PRIVATE_KEY",
    "HOTEL_GOOGLE_SHEETS_PRIVATE_KEY",
    "GOOGLE_PRIVATE_KEY",
  ]);

  if (!clientEmail || !privateKey) {
    return undefined;
  }

  return JSON.stringify({
    project_id: readStringEnv(env, [
      "MATERNALY_GOOGLE_PROJECT_ID",
      "HOTEL_GOOGLE_PROJECT_ID",
      "GOOGLE_PROJECT_ID",
    ]),
    client_email: clientEmail,
    private_key: normalizePrivateKey(privateKey),
  });
}

export function getGoogleSheetsConversationStoreConfig(env: NodeJS.ProcessEnv = process.env) {
  return {
    spreadsheetId: readStringEnv(env, [
      "MATERNALY_GOOGLE_SHEETS_SPREADSHEET_ID",
      "HOTEL_GOOGLE_SHEETS_SPREADSHEET_ID",
    ]),
    accessToken: readStringEnv(env, ["HOTEL_GOOGLE_SHEETS_ACCESS_TOKEN"]),
    serviceAccountJson: readGoogleServiceAccountJson(env),
    sheetName:
      readStringEnv(env, [
        "MATERNALY_CONVERSATIONS_SHEET_NAME",
        "HOTEL_CONVERSATIONS_SHEET_NAME",
      ]) ?? "CONVERSATIONS",
  };
}

function quoteSheetRange(sheetName: string, range: string): string {
  const escaped = sheetName.replace(/'/g, "''");
  return `'${escaped}'!${range}`;
}

async function createSheetsConnection(): Promise<SheetsConnection> {
  const config = getGoogleSheetsConversationStoreConfig();
  if (!config.spreadsheetId) {
    throw new Error(
      "Google Sheets conversation store requires MATERNALY_GOOGLE_SHEETS_SPREADSHEET_ID or HOTEL_GOOGLE_SHEETS_SPREADSHEET_ID.",
    );
  }

  if (config.accessToken) {
    const auth = new google.auth.OAuth2();
    auth.setCredentials({ access_token: config.accessToken });
    return {
      client: google.sheets({ version: "v4", auth }),
      spreadsheetId: config.spreadsheetId,
    };
  }

  const auth = new google.auth.GoogleAuth({
    credentials: config.serviceAccountJson
      ? JSON.parse(config.serviceAccountJson)
      : undefined,
    scopes: [...GOOGLE_SHEETS_SCOPES],
  });

  return {
    client: google.sheets({ version: "v4", auth }),
    spreadsheetId: config.spreadsheetId,
  };
}

class GoogleSheetsConversationStoreApi implements GoogleSheetsConversationStoreIo {
  private connection?: SheetsConnection;

  private async getConnection(): Promise<SheetsConnection> {
    this.connection ??= await createSheetsConnection();
    return this.connection;
  }

  async ensureSheet(sheetName: string): Promise<void> {
    const { client, spreadsheetId } = await this.getConnection();
    const spreadsheet = await client.spreadsheets.get({
      spreadsheetId,
      fields: "sheets.properties.title",
    });
    const exists = spreadsheet.data.sheets?.some(
      (sheet) => sheet.properties?.title === sheetName,
    );

    if (!exists) {
      await client.spreadsheets.batchUpdate({
        spreadsheetId,
        requestBody: {
          requests: [
            {
              addSheet: {
                properties: {
                  title: sheetName,
                },
              },
            },
          ],
        },
      });
    }

    const rows = await this.readRows(sheetName);
    const firstRow = rows[0] ?? [];
    if (firstRow.join("|") !== CONVERSATIONS_HEADERS.join("|")) {
      await client.spreadsheets.values.update({
        spreadsheetId,
        range: quoteSheetRange(sheetName, "A1:D1"),
        valueInputOption: "RAW",
        requestBody: {
          values: [[...CONVERSATIONS_HEADERS]],
        },
      });
    }
  }

  async readRows(sheetName: string): Promise<string[][]> {
    const { client, spreadsheetId } = await this.getConnection();
    const response = await client.spreadsheets.values.get({
      spreadsheetId,
      range: quoteSheetRange(sheetName, "A:D"),
      majorDimension: "ROWS",
      valueRenderOption: "FORMATTED_VALUE",
    });

    return (response.data.values ?? []).map((row) => row.map((cell) => String(cell ?? "")));
  }

  async writeRows(sheetName: string, rows: string[][]): Promise<void> {
    const { client, spreadsheetId } = await this.getConnection();
    await client.spreadsheets.values.clear({
      spreadsheetId,
      range: quoteSheetRange(sheetName, "A:D"),
    });
    await client.spreadsheets.values.update({
      spreadsheetId,
      range: quoteSheetRange(sheetName, `A1:D${Math.max(rows.length, 1)}`),
      valueInputOption: "RAW",
      requestBody: {
        values: rows,
      },
    });
  }
}

function parsePayload<T>(value: string | undefined): T | undefined {
  if (!value) {
    return undefined;
  }

  try {
    return JSON.parse(value) as T;
  } catch {
    return undefined;
  }
}

function snapshotToRows(snapshot: ConversationSnapshot): string[][] {
  const updatedAt = new Date().toISOString();
  const metadata = {
    updatedAt,
    suppressDemoSeed: snapshot.suppressDemoSeed === true,
    resetAt: snapshot.resetAt,
  };

  return [
    [...CONVERSATIONS_HEADERS],
    [META_ROW_KIND, "", updatedAt, JSON.stringify(metadata)],
    ...snapshot.conversations.map((conversation) => [
      CONVERSATION_ROW_KIND,
      conversation.id,
      conversation.updatedAt ?? updatedAt,
      JSON.stringify(conversation),
    ]),
  ];
}

function rowsToSnapshot(rows: string[][]): ConversationSnapshot {
  const dataRows =
    rows[0]?.join("|") === CONVERSATIONS_HEADERS.join("|") ? rows.slice(1) : rows;
  let metadata: Partial<ConversationSnapshot> = {};
  const conversations: ConversationRecord[] = [];

  for (const row of dataRows) {
    const [kind, , , payloadJson] = row;
    if (kind === META_ROW_KIND) {
      metadata = parsePayload<Partial<ConversationSnapshot>>(payloadJson) ?? {};
      continue;
    }

    if (kind === CONVERSATION_ROW_KIND) {
      const conversation = parsePayload<ConversationRecord>(payloadJson);
      if (conversation?.id) {
        conversations.push({
          ...conversation,
          messages: Array.isArray(conversation.messages) ? conversation.messages : [],
          events: Array.isArray(conversation.events) ? conversation.events : [],
        });
      }
    }
  }

  return {
    conversations,
    updatedAt:
      typeof metadata.updatedAt === "string"
        ? metadata.updatedAt
        : new Date().toISOString(),
    suppressDemoSeed: metadata.suppressDemoSeed === true,
    resetAt: typeof metadata.resetAt === "string" ? metadata.resetAt : undefined,
  };
}

export class GoogleSheetsConversationStore implements ConversationStore {
  constructor(
    private readonly sheetName = getGoogleSheetsConversationStoreConfig().sheetName,
    private readonly io: GoogleSheetsConversationStoreIo = new GoogleSheetsConversationStoreApi(),
  ) {}

  async load(): Promise<ConversationSnapshot> {
    await this.io.ensureSheet(this.sheetName);
    const rows = await this.io.readRows(this.sheetName);
    if (rows.length <= 1) {
      return createEmptyConversationSnapshot();
    }

    return rowsToSnapshot(rows);
  }

  async save(snapshot: ConversationSnapshot): Promise<void> {
    await this.io.ensureSheet(this.sheetName);
    await this.io.writeRows(this.sheetName, snapshotToRows(snapshot));
  }

  async list(filters?: ConversationListFilters): Promise<ConversationRecord[]> {
    const snapshot = await this.load();
    return filterConversationRecords(snapshot.conversations, filters);
  }

  async getById(id: string): Promise<ConversationRecord | undefined> {
    const snapshot = await this.load();
    return snapshot.conversations.find((record) => record.id === id);
  }

  async getByPhone(phoneNormalized: string): Promise<ConversationRecord | undefined> {
    const snapshot = await this.load();
    return snapshot.conversations.find(
      (record) => record.phoneNormalized === phoneNormalized,
    );
  }

  async upsertConversation(conversation: Conversation): Promise<ConversationRecord> {
    const snapshot = await this.load();
    const index = snapshot.conversations.findIndex(
      (record) => record.id === conversation.id,
    );
    const existing = index >= 0 ? snapshot.conversations[index] : undefined;
    const record: ConversationRecord = {
      ...existing,
      ...conversation,
      messages: existing?.messages ?? [],
      events: existing?.events ?? [],
    };

    if (index >= 0) {
      snapshot.conversations[index] = record;
    } else {
      snapshot.conversations.push(record);
    }

    await this.save(snapshot);
    return record;
  }

  async addMessage(message: Message): Promise<Message> {
    const snapshot = await this.load();
    const record = snapshot.conversations.find(
      (conversation) => conversation.id === message.conversationId,
    );

    if (!record) {
      throw new Error(`Conversation ${message.conversationId} not found`);
    }

    if (message.externalMessageSid) {
      const duplicate = record.messages.find(
        (item) => item.externalMessageSid === message.externalMessageSid,
      );
      if (duplicate) {
        return duplicate;
      }
    }

    record.messages.push(message);
    record.updatedAt = message.createdAt;
    record.lastMessagePreview = message.body.slice(0, 180);
    if (message.direction === "inbound") {
      record.lastInboundAt = message.createdAt;
      record.unreadCount += 1;
    } else {
      record.lastOutboundAt = message.createdAt;
    }

    await this.save(snapshot);
    return message;
  }

  async addEvent(event: ConversationEvent): Promise<ConversationEvent> {
    const snapshot = await this.load();
    const record = snapshot.conversations.find(
      (conversation) => conversation.id === event.conversationId,
    );

    if (!record) {
      throw new Error(`Conversation ${event.conversationId} not found`);
    }

    record.events.push(event);
    record.updatedAt = event.createdAt;
    await this.save(snapshot);
    return event;
  }

  async replaceConversation(record: ConversationRecord): Promise<ConversationRecord> {
    const snapshot = await this.load();
    const index = snapshot.conversations.findIndex(
      (conversation) => conversation.id === record.id,
    );

    if (index >= 0) {
      snapshot.conversations[index] = record;
    } else {
      snapshot.conversations.push(record);
    }

    await this.save(snapshot);
    return record;
  }

  async seed(records: ConversationRecord[]): Promise<ConversationSnapshot> {
    const snapshot = {
      conversations: records,
      updatedAt: new Date().toISOString(),
    };
    await this.save(snapshot);
    return snapshot;
  }
}
