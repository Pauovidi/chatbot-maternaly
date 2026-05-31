export interface MaternalyChatAction {
  label: string;
  url: string;
}

export const MATERNALY_CHAT_QUICK_ACTIONS = [
  "Quiero ver horarios de AIPAP Agua",
  "Me interesa Pilates",
  "Preparacion al Parto",
  "Necesito factura o justificante",
] as const;

export function getMaternalyChatWelcomeMessage(): string {
  return [
    "Hola, soy el asistente de Maternaly.",
    "Puedo orientarte sobre servicios y ayudar a recoger datos para revisar disponibilidad. Solo confirmo plazas, pagos o facturas cuando exista un estado real validado.",
  ].join("\n\n");
}

function includesAny(text: string, words: string[]): boolean {
  const normalized = text.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
  return words.some((word) => normalized.includes(word));
}

export function resolveMaternalyChatReply(
  text: string,
): { text: string; actions?: MaternalyChatAction[] } {
  if (includesAny(text, ["aipap agua", "piscina", "hydra", "hidra", "beup", "up&you"])) {
    return {
      text:
        "AIPAP Agua se gestiona con especial cuidado porque puede requerir justificante de acceso a piscina. Puedo recoger sede, fecha y numero de personas; los horarios reales deben venir de Google Sheets.",
    };
  }

  if (includesAny(text, ["aipap terra", "terra", "tierra"])) {
    return {
      text:
        "AIPAP Terra va separado de AIPAP Agua. Para revisar opciones necesito sede o zona, dia preferido y numero de personas. Si falta mapping fiable, lo pasa el equipo.",
    };
  }

  if (includesAny(text, ["pilates", "yoga"])) {
    return {
      text:
        "Para Pilates o Yoga recojo servicio, sede y preferencia horaria. No ofrezco plaza hasta contrastar disponibilidad fiable en Sheets.",
    };
  }

  if (includesAny(text, ["parto", "preparacion"])) {
    return {
      text:
        "Preparacion al Parto requiere entrevista o revision humana. Hasta validar el documento completo, no invento flujo ni condiciones.",
    };
  }

  if (includesAny(text, ["factura", "justificante", "pago", "link"])) {
    return {
      text:
        "Puedo distinguir pago pendiente, pago confirmado, factura pendiente y factura enviada. Solo dire que una plaza o factura esta confirmada cuando exista evento real.",
    };
  }

  return {
    text:
      "Puedo ayudarte con Pilates, AIPAP Terra, AIPAP Agua, Preparacion al Parto, Suelo Pelvico, Lactancia, Diagnostico Prenatal y talleres. Dime servicio, sede o fecha aproximada.",
  };
}
