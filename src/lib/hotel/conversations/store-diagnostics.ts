import { getConversationStore } from "./file-store";
import {
  diagnoseGoogleSheetsConversationStore,
  getGoogleSheetsConversationStoreConfig,
} from "./google-sheets-store";
import { readConversationStoreRuntimeConfig } from "@/lib/hotel/persistence/runtime";

export interface ConversationStoreDiagnostics {
  selectedProvider: string;
  runtimeTarget: string;
  sheetName?: string;
  googleCredentialsConfigured: boolean;
  spreadsheetConfigured: boolean;
  tabExists?: boolean;
  canRead: boolean;
  canWrite?: boolean;
  rowCount: number;
  conversationCount: number;
  parseErrors: number;
  panelShouldLoad: boolean;
  error?: {
    type: string;
    code?: string;
  };
}

function sanitizeError(error: unknown): ConversationStoreDiagnostics["error"] {
  const record = error as {
    code?: unknown;
    status?: unknown;
    response?: { status?: unknown };
    name?: unknown;
  };
  const rawCode = record?.code ?? record?.status ?? record?.response?.status;
  return {
    type:
      error instanceof Error
        ? error.name || "Error"
        : typeof error === "string"
          ? "Error"
          : "UnknownError",
    code: rawCode === undefined ? undefined : String(rawCode),
  };
}

export function buildConversationStoreErrorMessage(): string {
  const runtime = readConversationStoreRuntimeConfig();

  if (runtime.provider === "google_sheets") {
    return "No se pudo cargar la store de conversaciones de Google Sheets. Revisa /api/health y el endpoint de debug de conversations-store.";
  }

  if (runtime.provider === "postgres") {
    return "No se pudo cargar la store de conversaciones. Revisa /api/health y ejecuta migraciones si falta Postgres.";
  }

  return "No se pudo cargar la store de conversaciones. Revisa /api/health y la configuración del store.";
}

export function logConversationStoreFailure(error: unknown, source: string): void {
  const runtime = readConversationStoreRuntimeConfig();
  const sheetsConfig = getGoogleSheetsConversationStoreConfig();
  const sanitizedError = sanitizeError(error);

  console.info(
    "[maternaly.conversations-store]",
    JSON.stringify({
      source,
      selectedProvider: runtime.provider,
      runtimeTarget: runtime.runtimeTarget,
      sheetName: runtime.sheetName,
      googleCredentialsConfigured: Boolean(
        sheetsConfig.accessToken || sheetsConfig.serviceAccountJson,
      ),
      spreadsheetConfigured: runtime.spreadsheetIdConfigured,
      errorType: sanitizedError?.type,
      code: sanitizedError?.code,
    }),
  );
}

export async function diagnoseConversationStore(): Promise<ConversationStoreDiagnostics> {
  const runtime = readConversationStoreRuntimeConfig();
  const sheetsConfig = getGoogleSheetsConversationStoreConfig();

  if (runtime.provider === "google_sheets") {
    const sheetsDiagnostics = await diagnoseGoogleSheetsConversationStore();
    return {
      selectedProvider: runtime.provider,
      runtimeTarget: runtime.runtimeTarget,
      sheetName: sheetsDiagnostics.sheetName,
      googleCredentialsConfigured: sheetsDiagnostics.googleCredentialsConfigured,
      spreadsheetConfigured: sheetsDiagnostics.spreadsheetConfigured,
      tabExists: sheetsDiagnostics.tabExists,
      canRead: sheetsDiagnostics.canRead,
      canWrite: sheetsDiagnostics.canWrite,
      rowCount: sheetsDiagnostics.rowCount,
      conversationCount: sheetsDiagnostics.conversationCount,
      parseErrors: sheetsDiagnostics.parseErrors,
      panelShouldLoad: sheetsDiagnostics.panelShouldLoad,
      error: sheetsDiagnostics.error,
    };
  }

  const diagnostics: ConversationStoreDiagnostics = {
    selectedProvider: runtime.provider,
    runtimeTarget: runtime.runtimeTarget,
    sheetName: runtime.sheetName,
    googleCredentialsConfigured: Boolean(
      sheetsConfig.accessToken || sheetsConfig.serviceAccountJson,
    ),
    spreadsheetConfigured: runtime.spreadsheetIdConfigured,
    canRead: false,
    rowCount: 0,
    conversationCount: 0,
    parseErrors: 0,
    panelShouldLoad: false,
  };

  try {
    const snapshot = await getConversationStore().load();
    diagnostics.canRead = true;
    diagnostics.canWrite = runtime.provider !== "postgres" ? true : undefined;
    diagnostics.conversationCount = snapshot.conversations.length;
    diagnostics.rowCount = snapshot.conversations.length;
    diagnostics.panelShouldLoad = true;
  } catch (error) {
    diagnostics.error = sanitizeError(error);
  }

  return diagnostics;
}
