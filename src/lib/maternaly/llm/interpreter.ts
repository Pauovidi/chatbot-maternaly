import { findKnowledgeService } from "@/lib/maternaly/knowledge/catalog";

export type MaternalyIntent =
  | "greeting"
  | "service_question"
  | "reservation_interest"
  | "payment_question"
  | "invoice_question"
  | "handoff_request"
  | "unknown";

export interface StructuredIntent {
  intent: MaternalyIntent;
  service_candidate?: string;
  location_preference?: string;
  venue_preference?: string;
  time_preference?: string;
  pregnancy_week?: number;
  people_count?: number;
  needs_availability_lookup: boolean;
  confidence: number;
  missing_fields: string[];
  should_handoff: boolean;
  safety_flags: string[];
}

const DEFAULT_INTENT: StructuredIntent = {
  intent: "unknown",
  needs_availability_lookup: false,
  confidence: 0.35,
  missing_fields: [],
  should_handoff: false,
  safety_flags: [],
};

function normalize(text: string): string {
  return text.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
}

function extractNumber(text: string, pattern: RegExp): number | undefined {
  const match = text.match(pattern);
  return match?.[1] ? Number(match[1]) : undefined;
}

export function validateStructuredIntent(value: unknown): StructuredIntent {
  const raw = value as Partial<StructuredIntent>;
  const intent = raw.intent ?? DEFAULT_INTENT.intent;
  const allowed: MaternalyIntent[] = [
    "greeting",
    "service_question",
    "reservation_interest",
    "payment_question",
    "invoice_question",
    "handoff_request",
    "unknown",
  ];

  return {
    ...DEFAULT_INTENT,
    intent: allowed.includes(intent) ? intent : "unknown",
    service_candidate: raw.service_candidate,
    location_preference: raw.location_preference,
    venue_preference: raw.venue_preference,
    time_preference: raw.time_preference,
    pregnancy_week: raw.pregnancy_week,
    people_count: raw.people_count,
    needs_availability_lookup: Boolean(raw.needs_availability_lookup),
    confidence:
      typeof raw.confidence === "number" && raw.confidence >= 0 && raw.confidence <= 1
        ? raw.confidence
        : DEFAULT_INTENT.confidence,
    missing_fields: Array.isArray(raw.missing_fields) ? raw.missing_fields : [],
    should_handoff: Boolean(raw.should_handoff),
    safety_flags: Array.isArray(raw.safety_flags) ? raw.safety_flags : [],
  };
}

export class LlmIntentClassifier {
  async classify(message: string): Promise<StructuredIntent> {
    if (process.env.LLM_PROVIDER === "openai" && process.env.OPENAI_API_KEY) {
      return this.classifyWithOpenAi(message);
    }

    return this.classifyWithMock(message);
  }

  classifyWithMock(message: string): StructuredIntent {
    const text = normalize(message);
    const service = findKnowledgeService(text);
    const wantsReservation = /(reserv|apunt|plaza|hueco|fecha|horario|disponib)/.test(text);
    const wantsPayment = /(pago|pagar|link|enlace)/.test(text);
    const wantsInvoice = /(factura|justificante)/.test(text);
    const handoff = /(hablar con|persona humana|humano|humana|llamad|equipo)/.test(text);
    const location = [
      "bilbao",
      "erandio",
      "bec",
      "barakaldo",
      "leioa",
      "up&you",
      "hydra",
      "beup",
    ].find((item) => text.includes(item.toLowerCase()));
    const pregnancyWeek = extractNumber(text, /(\d{1,2})\s*(semanas|semana)/);
    const peopleCount =
      extractNumber(text, /(\d{1,2})\s*(personas|plazas|adultos)/) ?? 1;
    const hasDay = /(lunes|martes|miercoles|jueves|viernes|sabado|domingo|\d{1,2}\/\d{1,2})/.test(text);

    return validateStructuredIntent({
      intent: handoff
        ? "handoff_request"
        : wantsPayment
          ? "payment_question"
          : wantsInvoice
            ? "invoice_question"
            : wantsReservation
              ? "reservation_interest"
              : service
                ? "service_question"
                : /hola|buenas|kaixo/.test(text)
                  ? "greeting"
                  : "unknown",
      service_candidate: service?.id,
      location_preference: location,
      venue_preference:
        location && ["up&you", "hydra", "beup"].includes(location) ? location : undefined,
      time_preference: text.includes("manana") ? "morning" : text.includes("tarde") ? "afternoon" : undefined,
      pregnancy_week: pregnancyWeek,
      people_count: peopleCount,
      needs_availability_lookup: Boolean(service && wantsReservation && service.category === "reservable"),
      confidence: service || wantsReservation ? 0.78 : 0.45,
      missing_fields: wantsReservation && !hasDay ? ["preferred_day"] : [],
      should_handoff: handoff || service?.requiresInterview === true,
      safety_flags: service?.id === "aipap_agua" ? ["pool_access_justification_required"] : [],
    });
  }

  private async classifyWithOpenAi(message: string): Promise<StructuredIntent> {
    const response = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
      },
      body: JSON.stringify({
        model: process.env.LLM_MODEL || "gpt-4.1-mini",
        input: [
          {
            role: "system",
            content:
              "Return only JSON for a Maternaly WhatsApp intent. Never invent availability, prices, payments or invoices.",
          },
          { role: "user", content: message },
        ],
      }),
    });

    if (!response.ok) {
      return this.classifyWithMock(message);
    }

    const payload = (await response.json()) as { output_text?: string };
    try {
      return validateStructuredIntent(JSON.parse(payload.output_text ?? "{}"));
    } catch {
      return this.classifyWithMock(message);
    }
  }
}

export class MaternalyConversationInterpreter {
  constructor(private readonly classifier = new LlmIntentClassifier()) {}

  async interpret(message: string): Promise<StructuredIntent> {
    return this.classifier.classify(message);
  }
}

export class ConversationStateReducer {
  reduce(previous: StructuredIntent | null, next: StructuredIntent): StructuredIntent {
    return validateStructuredIntent({
      ...previous,
      ...next,
      missing_fields: Array.from(new Set([...(previous?.missing_fields ?? []), ...next.missing_fields])),
      safety_flags: Array.from(new Set([...(previous?.safety_flags ?? []), ...next.safety_flags])),
    });
  }
}

export class SafeToolRouter {
  route(intent: StructuredIntent): "availability_lookup" | "write_plan" | "handoff" | "reply_only" {
    if (intent.should_handoff) {
      return "handoff";
    }

    if (intent.needs_availability_lookup && intent.confidence >= 0.65) {
      return "availability_lookup";
    }

    return "reply_only";
  }
}
