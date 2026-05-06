import { timingSafeEqual } from "node:crypto";
import { headers as nextHeaders } from "next/headers";
import { NextResponse } from "next/server";

export interface PanelAuthResult {
  ok: boolean;
  agent: string;
  response?: NextResponse;
}

type PanelAuthEnv = {
  NODE_ENV?: string;
  HOTEL_PANEL_USERNAME?: string;
  HOTEL_PANEL_PASSWORD?: string;
  HOTEL_PANEL_ALLOW_LOCAL_AUTH_BYPASS?: string;
};

function safeEqual(left: string, right: string): boolean {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);

  if (leftBuffer.length !== rightBuffer.length) {
    return false;
  }

  return timingSafeEqual(leftBuffer, rightBuffer);
}

function parseBasicAuth(header: string | null): { username: string; password: string } | undefined {
  if (!header?.startsWith("Basic ")) {
    return undefined;
  }

  try {
    const decoded = Buffer.from(header.slice("Basic ".length), "base64").toString("utf8");
    const separatorIndex = decoded.indexOf(":");
    if (separatorIndex < 0) {
      return undefined;
    }

    return {
      username: decoded.slice(0, separatorIndex),
      password: decoded.slice(separatorIndex + 1),
    };
  } catch {
    return undefined;
  }
}

function canBypassMissingCredentials(env: PanelAuthEnv = process.env): boolean {
  return (
    env.NODE_ENV === "test" ||
    env.NODE_ENV === "development" ||
    env.HOTEL_PANEL_ALLOW_LOCAL_AUTH_BYPASS === "true"
  );
}

export function verifyPanelAuthorization(
  authorizationHeader: string | null,
  env: PanelAuthEnv = process.env,
): PanelAuthResult {
  const expectedUsername = env.HOTEL_PANEL_USERNAME;
  const expectedPassword = env.HOTEL_PANEL_PASSWORD;

  if (!expectedUsername || !expectedPassword) {
    if (canBypassMissingCredentials(env)) {
      return { ok: true, agent: "demo-admin" };
    }

    return {
      ok: false,
      agent: "anonymous",
      response: NextResponse.json(
        { ok: false, error: "Panel credentials are not configured." },
        { status: 503 },
      ),
    };
  }

  const credentials = parseBasicAuth(authorizationHeader);

  if (
    credentials &&
    safeEqual(credentials.username, expectedUsername) &&
    safeEqual(credentials.password, expectedPassword)
  ) {
    return { ok: true, agent: credentials.username };
  }

  return {
    ok: false,
    agent: "anonymous",
    response: NextResponse.json(
      { ok: false, error: "Unauthorized" },
      {
        status: 401,
        headers: {
          "WWW-Authenticate": 'Basic realm="Somos Muy Perros conversaciones"',
        },
      },
    ),
  };
}

export function requirePanelAuth(request: Request): PanelAuthResult {
  return verifyPanelAuthorization(request.headers.get("authorization"));
}

export async function verifyPanelPageAccess(): Promise<PanelAuthResult> {
  const headerList = await nextHeaders();
  return verifyPanelAuthorization(headerList.get("authorization"));
}
