import { MaternalyCopyRenderer } from "@/lib/maternaly/conversation/copy-renderer";
import { ensureMaternalySafeReply } from "@/lib/maternaly/conversation/safety";
import { getKnowledgeService } from "@/lib/maternaly/knowledge/catalog";
import { LlmIntentClassifier } from "@/lib/maternaly/llm/interpreter";
import type { StructuredIntent } from "@/lib/maternaly/llm/interpreter";

export interface MaternalyChatAction {
  label: string;
  url: string;
}

export const MATERNALY_CHAT_QUICK_ACTIONS = [
  "Quiero apuntarme al taller BLW",
  "Me interesa la charla de embarazo",
  "Quiero ver horarios de AIPAP Agua",
  "Me interesa Pilates",
] as const;

export function getMaternalyChatWelcomeMessage(): string {
  return "Hola, soy el asistente de Maternaly. Puedo ayudarte con información o preparar una solicitud para talleres y charlas.";
}

function buildPublicReplyFromIntent(intent: StructuredIntent): string {
  const renderer = new MaternalyCopyRenderer();
  if (intent.intent === "greeting") {
    return renderer.render({ decision: { action: "greeting" } }) ?? renderer.renderTechnicalFallback();
  }

  if (intent.intent === "privacy_question") {
    return renderer.render({ decision: { action: "privacy" } }) ?? renderer.renderTechnicalFallback();
  }

  if (intent.intent === "payment_question") {
    return renderer.render({ decision: { action: "payment" } }) ?? renderer.renderTechnicalFallback();
  }

  if (intent.intent === "invoice_question") {
    return renderer.render({ decision: { action: "invoice" } }) ?? renderer.renderTechnicalFallback();
  }

  const service = getKnowledgeService(intent.service_candidate);
  if (service) {
    return renderer.render({ decision: { action: "service_info", service } }) ?? renderer.renderTechnicalFallback();
  }

  return renderer.render({ decision: { action: "general" } }) ?? renderer.renderTechnicalFallback();
}

export function resolveMaternalyChatReply(
  text: string,
): { text: string; actions?: MaternalyChatAction[] } {
  const intent = new LlmIntentClassifier().classifyWithMock(text);
  return {
    text: ensureMaternalySafeReply(buildPublicReplyFromIntent(intent)),
  };
}
