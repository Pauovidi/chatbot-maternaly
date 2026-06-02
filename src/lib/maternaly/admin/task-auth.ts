import crypto from "node:crypto";

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

export function verifyMaternalyAdminTaskRequest(
  request: Request,
  env: NodeJS.ProcessEnv = process.env,
): AdminTaskAuthResult {
  const expected = env.MATERNALY_ADMIN_TASK_TOKEN?.trim();
  if (!expected) {
    return {
      ok: false,
      status: 503,
      body: {
        ok: false,
        error: "MATERNALY_ADMIN_TASK_TOKEN is not configured.",
      },
    };
  }

  if (!tokensMatch(expected, readPresentedToken(request))) {
    return {
      ok: false,
      status: 401,
      body: {
        ok: false,
        error: "Unauthorized admin task request.",
      },
    };
  }

  return { ok: true };
}
