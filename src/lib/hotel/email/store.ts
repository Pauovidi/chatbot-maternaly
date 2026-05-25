import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import { resolveJsonStorePath } from "@/lib/hotel/persistence/runtime";

import type { EmailIngestionRecord, EmailIngestionState } from "./types";

const DEFAULT_STORE_NAME = "hotel-email-ingestion-state.json";

function getStorePath(storeName = DEFAULT_STORE_NAME) {
  return resolveJsonStorePath({
    fileName: storeName,
    pathEnv: "HOTEL_EMAIL_STATE_STORE_PATH",
    dirEnv: "HOTEL_EMAIL_STATE_STORE_DIR",
  });
}

async function ensureDirectory() {
  await mkdir(path.dirname(getStorePath()), { recursive: true });
}

function createDefaultState(): EmailIngestionState {
  return {
    processedByFingerprint: {},
    processedByMessageId: {},
    lastUidByMailbox: {},
    history: [],
    updatedAt: new Date().toISOString(),
  };
}

export async function loadEmailIngestionState(
  storeName = DEFAULT_STORE_NAME,
): Promise<EmailIngestionState> {
  try {
    const raw = await readFile(getStorePath(storeName), "utf8");
    return {
      ...createDefaultState(),
      ...(JSON.parse(raw) as EmailIngestionState),
    };
  } catch {
    return createDefaultState();
  }
}

export async function saveEmailIngestionState(
  state: EmailIngestionState,
  storeName = DEFAULT_STORE_NAME,
): Promise<void> {
  await ensureDirectory();
  const filePath = getStorePath(storeName);
  const tempPath = `${filePath}.tmp`;
  const payload = JSON.stringify(
    {
      ...state,
      updatedAt: new Date().toISOString(),
    },
    null,
    2,
  );

  await writeFile(tempPath, payload, "utf8");
  await rename(tempPath, filePath);
}

export function isEmailAlreadyProcessed(
  state: EmailIngestionState,
  record: Pick<EmailIngestionRecord, "fingerprint" | "messageId">,
) {
  return Boolean(
    state.processedByFingerprint[record.fingerprint] ||
      (record.messageId ? state.processedByMessageId[record.messageId] : false),
  );
}

export async function registerProcessedEmail(
  record: EmailIngestionRecord,
  storeName = DEFAULT_STORE_NAME,
): Promise<EmailIngestionState> {
  const state = await loadEmailIngestionState(storeName);
  state.processedByFingerprint[record.fingerprint] = record;
  if (record.messageId) {
    state.processedByMessageId[record.messageId] = record;
  }
  if (record.mailbox && record.uid !== undefined) {
    const current = state.lastUidByMailbox[record.mailbox] ?? 0;
    state.lastUidByMailbox[record.mailbox] = Math.max(current, record.uid);
  }
  state.history.unshift(record);
  state.history = state.history.slice(0, 200);
  await saveEmailIngestionState(state, storeName);
  return state;
}
