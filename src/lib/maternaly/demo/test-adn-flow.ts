import type { ConversationEvent } from "@/lib/hotel/conversations/types";
import {
  CopySheetsRealWriteService,
  DEFAULT_MATERNALY_DEMO_PAYMENT_LINK,
  buildTestAdnProposal,
  readCopyWriteConfig,
  redactSheetId,
  type LastValidRowReference,
  type ReservationWritePlan,
  type WriteResultReport,
} from "@/lib/maternaly/sheets/copy-real-write";

export const TEST_ADN_DEMO_EVENT = "maternaly_test_adn_demo_state";

type DemoPhase =
  | "awaiting_location"
  | "awaiting_customer"
  | "awaiting_confirmation"
  | "completed"
  | "manual_review";

export interface TestAdnDemoState {
  phase: DemoPhase;
  service: "TEST ADN / DETESEX";
  proposedDate: string;
  proposedTime: "18:20";
  selectedLocation?: "BILBAO" | "ERANDIO";
  fullName?: string;
  email?: string;
  phone?: string;
  sourceLastRowReference: LastValidRowReference;
  paymentLink: string;
  writePlan?: ReservationWritePlan;
  writeApplied?: boolean;
  writeError?: string;
}

export interface TestAdnFlowResult {
  handled: boolean;
  reply?: string;
  state?: TestAdnDemoState;
  writeReport?: WriteResultReport;
}

const TEST_ADN_INTENT_PATTERN = /\b(test\s*adn|adn|detesex|dete\s*sex|cita\s+para\s+adn|reservar\s+adn|reservar\s+detesex)\b/i;
const AFFIRMATIVE_PATTERN = /^(si|sí|confirmo|quiero pagar|adelante|ok|vale|de acuerdo)\b/i;
const FORBIDDEN_FINAL_COPY = /\b(reserva confirmada|pago confirmado|factura enviada|plaza confirmada)\b/i;

export const FIXTURE_LAST_TEST_ADN_ROW: LastValidRowReference = {
  rowNumber: 42,
  values: ["04/06/2026", "17:10", "MAIDER", "DETESEX", "BILBAO"],
  date: "04/06/2026",
  time: "17:10",
  professional: "MAIDER",
  service: "DETESEX",
  location: "BILBAO",
};

function normalize(text: string): string {
  return text
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .trim()
    .toLowerCase();
}

export function isTestAdnDemoIntent(message: string): boolean {
  return TEST_ADN_INTENT_PATTERN.test(message);
}

function detectLocation(message: string): "BILBAO" | "ERANDIO" | undefined {
  const text = normalize(message);
  if (/\berandio\b/.test(text)) {
    return "ERANDIO";
  }
  if (/\bbilbao\b/.test(text)) {
    return "BILBAO";
  }
  return undefined;
}

function parseCustomerData(message: string, fallbackPhone?: string): {
  fullName?: string;
  email?: string;
  phone?: string;
} {
  const email = message.match(/[^\s,;]+@[^\s,;]+\.[^\s,;]+/)?.[0];
  const phone = message.match(/(?:\+?\d[\d\s().-]{7,}\d)/)?.[0]?.replace(/\s+/g, " ");
  const beforeEmail = email ? message.slice(0, message.indexOf(email)) : message;
  const fullName = beforeEmail
    .replace(/[,+;]+/g, " ")
    .replace(/\b(tel|telefono|móvil|movil|email|correo)\b/gi, " ")
    .replace(/\s+/g, " ")
    .trim();

  return {
    fullName: fullName || undefined,
    email,
    phone: phone || fallbackPhone,
  };
}

function formatProposalIntro(date: string): string {
  return `Puedo ayudarte con Test ADN / Detesex. Según la última cita registrada, puedo proponerte una nueva cita para el ${date} a las 18:20. ¿La prefieres en Bilbao o en Erandio?`;
}

function ensureSafeDemoReply(reply: string): string {
  if (FORBIDDEN_FINAL_COPY.test(reply)) {
    throw new Error("Unsafe Test ADN demo reply contains forbidden confirmation wording.");
  }

  return reply;
}

function eventPayload(event: ConversationEvent): TestAdnDemoState | undefined {
  if (event.eventType !== TEST_ADN_DEMO_EVENT || !event.payload || typeof event.payload !== "object") {
    return undefined;
  }

  return event.payload as TestAdnDemoState;
}

export function getLatestTestAdnState(events: ConversationEvent[] = []): TestAdnDemoState | undefined {
  return events.map(eventPayload).filter((state): state is TestAdnDemoState => Boolean(state)).at(-1);
}

async function detectSourceLastRow(
  service = new CopySheetsRealWriteService(),
): Promise<LastValidRowReference> {
  const config = readCopyWriteConfig();
  if (config.copySheetIds.length === 0) {
    return FIXTURE_LAST_TEST_ADN_ROW;
  }

  const audits = await service.auditCopies(config);
  const readable = audits.find((audit) => audit.access === "read");
  const tab = readable?.tabs.find((candidate) => candidate.title === readable.selectedTab) ?? readable?.tabs[0];
  return tab?.lastValidRow ?? FIXTURE_LAST_TEST_ADN_ROW;
}

async function createInitialState(service?: CopySheetsRealWriteService): Promise<TestAdnDemoState> {
  const sourceLastRowReference = await detectSourceLastRow(service);
  const proposal = buildTestAdnProposal(sourceLastRowReference);
  return {
    phase: "awaiting_location",
    service: "TEST ADN / DETESEX",
    proposedDate: proposal.proposedDate,
    proposedTime: proposal.proposedTime,
    sourceLastRowReference,
    paymentLink: readCopyWriteConfig().paymentLink || DEFAULT_MATERNALY_DEMO_PAYMENT_LINK,
  };
}

async function writeOrPlanReservation(
  state: TestAdnDemoState,
  service: CopySheetsRealWriteService,
): Promise<WriteResultReport | undefined> {
  if (!state.selectedLocation || !state.fullName || !state.email) {
    return undefined;
  }

  return service.writeTestAdnReservation({
    fullName: state.fullName,
    email: state.email,
    phone: state.phone,
    selectedLocation: state.selectedLocation,
  });
}

export async function advanceTestAdnDemoFlow({
  message,
  previousState,
  fallbackPhone,
  executeWrite = true,
  service = new CopySheetsRealWriteService(),
}: {
  message: string;
  previousState?: TestAdnDemoState;
  fallbackPhone?: string;
  executeWrite?: boolean;
  service?: CopySheetsRealWriteService;
}): Promise<TestAdnFlowResult> {
  if (/factura/i.test(message)) {
    const state = previousState ?? (await createInitialState(service));
    return {
      handled: true,
      state,
      reply: ensureSafeDemoReply(
        "Lo dejo anotado para que el equipo pueda revisarlo y emitir la factura cuando el pago esté validado.",
      ),
    };
  }

  if (!previousState && isTestAdnDemoIntent(message)) {
    const state = await createInitialState(service);
    return {
      handled: true,
      state,
      reply: ensureSafeDemoReply(formatProposalIntro(state.proposedDate)),
    };
  }

  if (!previousState || previousState.phase === "completed") {
    return { handled: false };
  }

  if (previousState.phase === "awaiting_location") {
    const selectedLocation = detectLocation(message);
    if (!selectedLocation) {
      return {
        handled: true,
        state: previousState,
        reply: ensureSafeDemoReply("¿La prefieres en Bilbao o en Erandio?"),
      };
    }

    const state: TestAdnDemoState = {
      ...previousState,
      phase: "awaiting_customer",
      selectedLocation,
    };

    return {
      handled: true,
      state,
      reply: ensureSafeDemoReply(
        "Perfecto. Para dejar la reserva fijada pendiente de pago necesito nombre y apellidos, email y, si el teléfono no viene del WhatsApp, un teléfono de contacto.",
      ),
    };
  }

  if (previousState.phase === "awaiting_customer") {
    const customer = parseCustomerData(message, fallbackPhone);
    if (!customer.fullName || !customer.email || !customer.phone) {
      return {
        handled: true,
        state: previousState,
        reply: ensureSafeDemoReply(
          "Me falta algún dato. Necesito nombre y apellidos, email y teléfono de contacto para dejar la reserva fijada pendiente de pago.",
        ),
      };
    }

    const state: TestAdnDemoState = {
      ...previousState,
      ...customer,
      phase: "awaiting_confirmation",
    };

    return {
      handled: true,
      state,
      reply: ensureSafeDemoReply(
        `Confirmo los datos: Test ADN / Detesex, ${state.selectedLocation === "ERANDIO" ? "Erandio" : "Bilbao"}, ${state.proposedDate} a las ${state.proposedTime}, ${state.fullName}, ${state.email}. ¿Quieres que deje la reserva fijada pendiente de pago?`,
      ),
    };
  }

  if (previousState.phase === "awaiting_confirmation") {
    if (!AFFIRMATIVE_PATTERN.test(normalize(message))) {
      return {
        handled: true,
        state: previousState,
        reply: ensureSafeDemoReply(
          "De acuerdo. No hago ningún cambio. Cuando quieras, puedo dejarla fijada pendiente de pago.",
        ),
      };
    }

    const writeReport = executeWrite ? await writeOrPlanReservation(previousState, service) : undefined;
    const state: TestAdnDemoState = {
      ...previousState,
      phase: writeReport?.applied || !writeReport ? "completed" : "manual_review",
      writePlan: writeReport?.plan,
      writeApplied: writeReport?.applied ?? false,
      writeError: writeReport?.error,
    };
    const writeWarning =
      writeReport && !writeReport.applied
        ? "\n\nLa escritura en la copia queda pendiente de revisión humana porque ahora mismo no se ha podido aplicar de forma segura."
        : "";

    return {
      handled: true,
      state,
      writeReport,
      reply: ensureSafeDemoReply(
        `Perfecto, dejo tu reserva fijada como pendiente de pago para el ${state.proposedDate} a las ${state.proposedTime} en ${state.selectedLocation === "ERANDIO" ? "Erandio" : "Bilbao"}.\n\nPara completar la reserva, puedes realizar el pago aquí:\n${state.paymentLink}${writeWarning}`,
      ),
    };
  }

  return { handled: false };
}

export function summarizeWritePlanForEvent(plan: ReservationWritePlan | undefined) {
  if (!plan) {
    return undefined;
  }

  return {
    operation: plan.operation,
    targetSpreadsheetId: plan.targetSpreadsheetId ? redactSheetId(plan.targetSpreadsheetId) : undefined,
    targetTab: plan.targetTab,
    targetRange: plan.targetRange,
    proposedDate: plan.proposedDate,
    proposedTime: plan.proposedTime,
    selectedLocation: plan.selectedLocation,
    service: plan.service,
    customerRedacted: plan.customerRedacted,
    paymentLink: plan.paymentLink,
    riskLevel: plan.riskLevel,
    manualReviewRequired: plan.manualReviewRequired,
    originalSheetProtected: plan.originalSheetProtected,
    copyOnly: plan.copyOnly,
    backupCreated: plan.backupCreated,
    allowedByPolicy: plan.allowedByPolicy,
    blockedReason: plan.blockedReason,
  };
}
