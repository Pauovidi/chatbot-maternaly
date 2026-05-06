import type { OutboundSender } from "@/lib/hotel/conversations/service";
import { sendTwilioWhatsAppText } from "./client";

export function createTwilioWhatsAppSender(): OutboundSender {
  return {
    sendText(input) {
      return sendTwilioWhatsAppText(input);
    },
  };
}
