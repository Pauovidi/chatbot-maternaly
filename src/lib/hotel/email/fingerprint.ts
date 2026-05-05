import { createHash } from "node:crypto";

import type { EmailSourceMessage, NormalizedEmailContent } from "./types";

export function buildEmailIdempotencyKey(
  message: EmailSourceMessage,
  normalized: NormalizedEmailContent,
): string {
  const stableId = message.messageId ?? message.id ?? "";
  const raw = [
    stableId,
    `${message.uid ?? ""}`,
    normalized.fingerprint,
    normalized.subject,
    message.from ?? "",
  ].join("::");

  return createHash("sha256").update(raw).digest("hex");
}
