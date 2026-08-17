import type {
  MaternalyReminderOutboundMessage,
  MaternalyReminderRecord,
} from "./types";

export class MaternalyReminderConfigurationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "MaternalyReminderConfigurationError";
  }
}

function formattedSessionStart(reminder: MaternalyReminderRecord): string {
  return new Intl.DateTimeFormat("es-ES", {
    timeZone: reminder.timeZone,
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(new Date(reminder.sessionStartsAt));
}

function onlineInstructions(reminder: MaternalyReminderRecord): string {
  const access = reminder.onlineAccess;
  if (!access?.joinUrl || !access.meetingId || !access.passcode) {
    throw new MaternalyReminderConfigurationError(
      "The online Charla reminder needs the Zoom link, meeting ID and passcode.",
    );
  }
  let url: URL;
  try {
    url = new URL(access.joinUrl);
  } catch {
    throw new MaternalyReminderConfigurationError("The Zoom join link is not a valid URL.");
  }
  if (url.protocol !== "https:") {
    throw new MaternalyReminderConfigurationError("The Zoom join link must use HTTPS.");
  }

  return [
    "Modalidad: online por Zoom.",
    `Enlace: ${url.toString()}`,
    `ID de reunión: ${access.meetingId}`,
    `Clave de acceso: ${access.passcode}`,
  ].join("\n");
}

function inPersonInstructions(reminder: MaternalyReminderRecord): string {
  if (!reminder.address?.trim()) {
    throw new MaternalyReminderConfigurationError(
      "The in-person Charla reminder needs the centre address.",
    );
  }
  return [`Modalidad: presencial en ${reminder.location}.`, `Dirección: ${reminder.address}.`].join(
    "\n",
  );
}

export function buildMaternalyCharlaReminderMessage(
  reminder: MaternalyReminderRecord,
): MaternalyReminderOutboundMessage {
  const sessionStart = formattedSessionStart(reminder);
  const attendance =
    reminder.modality === "online"
      ? onlineInstructions(reminder)
      : inPersonInstructions(reminder);
  const body = [
    "Hola 😊 Te recordamos tu Charla Informativa gratuita de Maternaly.",
    `Será el ${sessionStart}.`,
    attendance,
    "Si finalmente no puedes asistir, responde a este mensaje cuanto antes para que podamos ayudarte.",
  ].join("\n\n");

  return {
    reminderId: reminder.reminderId,
    idempotencyKey: reminder.idempotencyKey,
    to: reminder.phoneE164,
    channel: "whatsapp",
    body,
    template:
      reminder.modality === "online"
        ? {
            kind: "charla_48h_online",
            variables: {
              "1": sessionStart,
              "2": reminder.onlineAccess?.joinUrl ?? "",
              "3": reminder.onlineAccess?.meetingId ?? "",
              "4": reminder.onlineAccess?.passcode ?? "",
            },
          }
        : {
            kind: "charla_48h_presencial",
            variables: {
              "1": sessionStart,
              "2": reminder.location,
              "3": reminder.address ?? "",
            },
          },
  };
}
