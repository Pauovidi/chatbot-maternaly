import "server-only";
import { google } from "googleapis";
import {
  getGoogleSheetsConfigStatus,
  type GoogleSheetsConfigStatus,
} from "./env";
import { getSheetsAdapterContextFromEnv } from "./sheets";

async function createDriveClient() {
  const context = getSheetsAdapterContextFromEnv("real");

  if (context.accessToken?.trim()) {
    const auth = new google.auth.OAuth2();
    auth.setCredentials({
      access_token: context.accessToken.trim(),
    });

    return google.drive({
      version: "v3",
      auth,
    });
  }

  const credentials = context.serviceAccountJson
    ? JSON.parse(context.serviceAccountJson)
    : undefined;
  const auth = new google.auth.GoogleAuth({
    credentials,
    scopes: ["https://www.googleapis.com/auth/drive.metadata.readonly"],
  });

  return google.drive({
    version: "v3",
    auth,
  });
}

export async function getGoogleSheetsLiveStatus(): Promise<GoogleSheetsConfigStatus> {
  const baseStatus = getGoogleSheetsConfigStatus();

  if (!baseStatus.isReady || !baseStatus.spreadsheetId) {
    return {
      ...baseStatus,
      connectionStatus: "unknown",
      connectionReason: baseStatus.reason,
    };
  }

  try {
    const drive = await createDriveClient();
    const response = await drive.files.get({
      fileId: baseStatus.spreadsheetId,
      fields: "id,name,mimeType",
      supportsAllDrives: true,
    });

    if (response.data.mimeType !== "application/vnd.google-apps.spreadsheet") {
      return {
        ...baseStatus,
        connectionStatus: "error",
        connectionReason: `El ID configurado no apunta a un Google Sheet nativo (${response.data.mimeType ?? "mimeType desconocido"}).`,
      };
    }

    return {
      ...baseStatus,
      connectionStatus: "ok",
      connectionReason: `Documento accesible: ${response.data.name ?? baseStatus.spreadsheetIdSummary}.`,
    };
  } catch (error) {
    return {
      ...baseStatus,
      connectionStatus: "error",
      connectionReason:
        process.env.NODE_ENV === "production"
          ? "No se ha podido validar el acceso real al spreadsheet configurado."
          : error instanceof Error
            ? error.message
            : "No se ha podido validar el acceso real al spreadsheet configurado.",
    };
  }
}
