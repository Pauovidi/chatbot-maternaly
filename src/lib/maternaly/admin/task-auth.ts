import crypto from "node:crypto";
import { verifyPanelAuthorization } from "@/lib/hotel/conversations/auth";

export interface AdminTaskAuthFailure {
  ok: false;
  status: number;
  body: {
    ok: false;
    error: string;
  };
}

export interface AdminTaskAuthSuccess {
  ok: true;
}

export type AdminTaskAuthResult = AdminTaskAuthSuccess | AdminTaskAuthFailure;

export type MaternalyIntegrationAuthResult = AdminTaskAuthSuccess | AdminTaskAuthFailure;

function readPresentedToken(request: Request): string {
  const bearer = request.headers.get("authorization")?.match(/^Bearer\s+(.+)$/i)?.[1]?.trim();
  return bearer || request.headers.get("x-maternaly-admin-task-token")?.trim() || "";
}

function tokensMatch(expected: string, presented: string): boolean {
  if (!expected || !presented) {
    return false;
  }

  const expectedBuffer = Buffer.from(expected);
  const presentedBuffer = Buffer.from(presented);
  if (expectedBuffer.length !== presentedBuffer.length) {
    return false;
  }

  return crypto.timingSafeEqual(expectedBuffer, presentedBuffer);
}

function verifyTokenRequest(
  request: Request,
  expected: string | undefined,
  messages: { missing: string; unauthorized: string },
): AdminTaskAuthResult {
  const configured = expected?.trim();
  if (!configured) {
    return {
      ok: false,
      status: 503,
      body: { ok: false, error: messages.missing },
    };
  }

  if (!tokensMatch(configured, readPresentedToken(request))) {
    return {
      ok: false,
      status: 401,
      body: { ok: false, error: messages.unauthorized },
    };
  }

  return { ok: true };
}

export function verifyMaternalyAdminTaskRequest(
  request: Request,
  env: Partial<NodeJS.ProcessEnv> = process.env,
): AdminTaskAuthResult {
  return verifyTokenRequest(request, env.MATERNALY_ADMIN_TASK_TOKEN, {
    missing: "MATERNALY_ADMIN_TASK_TOKEN is not configured.",
    unauthorized: "Unauthorized admin task request.",
  });
}

/**
 * Authenticates machine-to-machine integrations without reusing the admin
 * task token. The dedicated secret is intended for a single integration,
 * such as the remote Hermes Charla Informativa skill.
 */
export function verifyMaternalyIntegrationRequest(
  request: Request,
  env: Partial<NodeJS.ProcessEnv> = process.env,
): MaternalyIntegrationAuthResult {
  return verifyTokenRequest(request, env.MATERNALY_HERMES_INTEGRATION_TOKEN, {
    missing: "MATERNALY_HERMES_INTEGRATION_TOKEN is not configured.",
    unauthorized: "Unauthorized Maternaly integration request.",
  });
}

export function verifyMaternalyAdminDebugRequest(
  request: Request,
  env: Partial<NodeJS.ProcessEnv> = process.env,
): AdminTaskAuthResult {
  const expected = env.MATERNALY_ADMIN_TASK_TOKEN?.trim();
  if (expected) {
    return verifyMaternalyAdminTaskRequest(request, env);
  }

  const panelAuth = verifyPanelAuthorization(
    request.headers.get("authorization"),
    env as NodeJS.ProcessEnv,
  );
  if (panelAuth.ok) {
    return { ok: true };
  }

  const status = panelAuth.response?.status ?? 401;
  return {
    ok: false,
    status,
    body: {
      ok: false,
      error:
        status === 503
          ? "MATERNALY_ADMIN_TASK_TOKEN or panel credentials are required."
          : "Unauthorized admin debug request.",
    },
  };
}
