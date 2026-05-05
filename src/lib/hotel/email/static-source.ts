import type { EmailMailboxSource, EmailSourceMessage } from "./types";

export function createStaticEmailSource(
  messages: EmailSourceMessage[],
): EmailMailboxSource {
  return {
    async listMessages() {
      return [...messages];
    },
  };
}
