export type MaternalyJourneyStage = "embarazo" | "postparto" | "otros";

export interface MaternalyJourneyStageOption {
  id: MaternalyJourneyStage;
  label: "EMBARAZO" | "POSTPARTO" | "OTROS";
}

export const MATERNALY_JOURNEY_STAGE_OPTIONS = [
  { id: "embarazo", label: "EMBARAZO" },
  { id: "postparto", label: "POSTPARTO" },
  { id: "otros", label: "OTROS" },
] as const satisfies readonly MaternalyJourneyStageOption[];

export interface MaternalyPregnancyMenuItem {
  id:
    | "charla_informativa"
    | "test_adn_fetal"
    | "detesex"
    | "preparacion_parto"
    | "metodo_maternaly"
    | "ecografia_5d"
    | "taller_blw"
    | "aipap_agua"
    | "pilates_embarazo"
    | "yoga_embarazo"
    | "metodo_5p"
    | "entrenamiento_funcional_embarazo"
    | "fisioterapia_embarazo"
    | "psicologia_perinatal";
  label: string;
  group: "servicio" | "actividad" | "unidad";
}

/**
 * Menú de embarazo prescrito por el documento de la clienta. El orden es parte
 * del contrato conversacional y no debe sustituirse por el catálogo genérico.
 */
export const MATERNALY_PREGNANCY_SERVICE_MENU = [
  {
    id: "charla_informativa",
    label: "Charla informativa gratuita (semana 1 a semana 20)",
    group: "servicio",
  },
  { id: "test_adn_fetal", label: "Test ADN fetal", group: "servicio" },
  {
    id: "detesex",
    label: "Detesex (sexo del bebé mediante análisis de sangre)",
    group: "servicio",
  },
  {
    id: "preparacion_parto",
    label: "Preparación al parto (seguro o privado)",
    group: "servicio",
  },
  {
    id: "metodo_maternaly",
    label: "Método Maternaly (seguro o privado)",
    group: "servicio",
  },
  { id: "ecografia_5d", label: "Ecografía 5D", group: "servicio" },
  {
    id: "taller_blw",
    label: "Taller BLW (Baby-Led Weaning)",
    group: "servicio",
  },
  { id: "aipap_agua", label: "AIPAP Agua", group: "actividad" },
  {
    id: "pilates_embarazo",
    label: "Pilates para el embarazo",
    group: "actividad",
  },
  {
    id: "yoga_embarazo",
    label: "Yoga para el embarazo",
    group: "actividad",
  },
  {
    id: "metodo_5p",
    label: "Método 5P (abdomen y suelo pélvico)",
    group: "actividad",
  },
  {
    id: "entrenamiento_funcional_embarazo",
    label: "Entrenamiento funcional para el embarazo",
    group: "actividad",
  },
  {
    id: "fisioterapia_embarazo",
    label: "Unidad de Fisioterapia en el embarazo",
    group: "unidad",
  },
  {
    id: "psicologia_perinatal",
    label: "Unidad de Psicología perinatal",
    group: "unidad",
  },
] as const satisfies readonly MaternalyPregnancyMenuItem[];

export const MATERNALY_CHARLA_FACTS = {
  name: "Charla informativa gratuita para embarazadas de la semana 1 a la semana 20",
  audience: "Embarazadas entre la semana 1 y la semana 20",
  deliveredBy: "matronas",
  price: "gratuita",
  topics: [
    "cambios que se producen en el cuerpo durante el embarazo",
    "autocuidados",
    "alimentación",
    "actividad física",
    "pruebas y exámenes del embarazo",
    "medicación segura para el bebé",
    "sexualidad",
    "cambios emocionales",
  ],
  formats: ["presencial", "online"],
  companionPolicy: "Puedes acudir sola o acompañada por tu pareja u otra persona.",
  cta: "¿Quieres reservar tu plaza?",
} as const;

export const MATERNALY_CHARLA_CTA = MATERNALY_CHARLA_FACTS.cta;

export type MaternalyCharlaOptionId = "erandio" | "bilbao" | "online";
export type MaternalyCharlaModality = "presencial" | "online";
export type MaternalyCharlaLocation = "Erandio" | "Bilbao" | "Online";

export const MATERNALY_CONTACT = {
  phone: "634402760",
  email: "info@maternaly.es",
  satisfactionSurveyUrl: "https://forms.gle/qHzrKyuwwGMRR4e67",
} as const;

export const MATERNALY_LOCATIONS = {
  Erandio: {
    address:
      "Av. José Luis Goyoaga 32, Edificio Noray, 1ª planta, Local 111-112, Erandio. Timbre 112.",
  },
  Bilbao: {
    address: "Paseo Uribitarte 22, primero F, Bilbao.",
  },
} as const;

export interface MaternalyCharlaOption {
  id: MaternalyCharlaOptionId;
  location: MaternalyCharlaLocation;
  modality: MaternalyCharlaModality;
  startTime: string;
  address?: string;
  attendanceNote?: string;
}

/** Sin preferencia se muestran las tres opciones en este orden; con preferencia se conserva el subconjunto compatible. */
export const MATERNALY_CHARLA_OPTIONS = [
  {
    id: "erandio",
    location: "Erandio",
    modality: "presencial",
    startTime: "18:30",
    address: MATERNALY_LOCATIONS.Erandio.address,
  },
  {
    id: "bilbao",
    location: "Bilbao",
    modality: "presencial",
    startTime: "17:00",
    address: MATERNALY_LOCATIONS.Bilbao.address,
  },
  {
    id: "online",
    location: "Online",
    modality: "online",
    startTime: "19:00",
    attendanceNote:
      "La charla se realiza en directo por Zoom. Recibirás las claves de acceso antes del inicio.",
  },
] as const satisfies readonly MaternalyCharlaOption[];

export interface MaternalyCharlaSession {
  optionId: MaternalyCharlaOptionId;
  location: MaternalyCharlaLocation;
  modality: MaternalyCharlaModality;
  date: string;
  startTime: string;
}

/** Fechas vigentes del documento; los ejemplos históricos de junio/julio no pertenecen a esta lista. */
export const MATERNALY_CHARLA_SESSIONS = [
  {
    optionId: "erandio",
    location: "Erandio",
    modality: "presencial",
    date: "2026-08-20",
    startTime: "18:30",
  },
  {
    optionId: "erandio",
    location: "Erandio",
    modality: "presencial",
    date: "2026-09-24",
    startTime: "18:30",
  },
  {
    optionId: "erandio",
    location: "Erandio",
    modality: "presencial",
    date: "2026-10-08",
    startTime: "18:30",
  },
  {
    optionId: "bilbao",
    location: "Bilbao",
    modality: "presencial",
    date: "2026-10-06",
    startTime: "17:00",
  },
  {
    optionId: "bilbao",
    location: "Bilbao",
    modality: "presencial",
    date: "2026-12-15",
    startTime: "17:00",
  },
  {
    optionId: "online",
    location: "Online",
    modality: "online",
    date: "2026-08-10",
    startTime: "19:00",
  },
  {
    optionId: "online",
    location: "Online",
    modality: "online",
    date: "2026-09-07",
    startTime: "19:00",
  },
  {
    optionId: "online",
    location: "Online",
    modality: "online",
    date: "2026-10-05",
    startTime: "19:00",
  },
] as const satisfies readonly MaternalyCharlaSession[];

export interface MaternalyCharlaScheduleCandidate {
  text?: string;
  location?: string;
  center?: string;
  modality?: string;
  groupName?: string;
  sessionName?: string;
  date?: string;
  startTime?: string;
}

function normalizeContractText(value: string | undefined): string {
  return (value ?? "")
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .trim()
    .toLowerCase();
}

export function normalizeCharlaModality(
  value: string | undefined,
): MaternalyCharlaModality | undefined {
  const normalized = normalizeContractText(value);
  if (!normalized) {
    return undefined;
  }
  if (/\b(?:online|on\s+line|zoom|virtual|distancia)\b/.test(normalized)) {
    return "online";
  }
  if (/\b(?:presencial|fisic[ao])\b/.test(normalized)) {
    return "presencial";
  }
  return undefined;
}

export function normalizeCharlaDate(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  if (!trimmed) {
    return undefined;
  }
  const isoMatch = /^(\d{4})-(\d{2})-(\d{2})/.exec(trimmed);
  if (isoMatch) {
    return `${isoMatch[1]}-${isoMatch[2]}-${isoMatch[3]}`;
  }
  const spanishMatch = /^(\d{1,2})[\/-](\d{1,2})[\/-](\d{4})$/.exec(trimmed);
  if (!spanishMatch) {
    return undefined;
  }
  return `${spanishMatch[3]}-${spanishMatch[2].padStart(2, "0")}-${spanishMatch[1].padStart(2, "0")}`;
}

export function normalizeCharlaTime(value: string | undefined): string | undefined {
  const match = /^(\d{1,2}):(\d{2})/.exec(value?.trim() ?? "");
  if (!match) {
    return undefined;
  }
  return `${match[1].padStart(2, "0")}:${match[2]}`;
}

export function getCharlaOption(
  optionId: MaternalyCharlaOptionId,
): (typeof MATERNALY_CHARLA_OPTIONS)[number] {
  return MATERNALY_CHARLA_OPTIONS.find((option) => option.id === optionId)!;
}

export function getCharlaSessionsForOption(
  optionId: MaternalyCharlaOptionId,
): readonly MaternalyCharlaSession[] {
  return MATERNALY_CHARLA_SESSIONS.filter((session) => session.optionId === optionId);
}

/**
 * Resuelve sede/modalidad desde columnas explícitas o desde nombres legibles del
 * grupo/sesión. Rechaza combinaciones contradictorias (por ejemplo, Erandio + online).
 */
export function resolveCharlaOption(
  candidate: string | MaternalyCharlaScheduleCandidate,
): (typeof MATERNALY_CHARLA_OPTIONS)[number] | null {
  const input = typeof candidate === "string" ? { text: candidate } : candidate;
  const locationText = normalizeContractText(
    [input.text, input.location, input.center, input.groupName, input.sessionName]
      .filter(Boolean)
      .join(" "),
  );
  const explicitModality = normalizeCharlaModality(input.modality);
  const mentionsErandio = /\berandio\b/.test(locationText);
  const mentionsBilbao = /\bbilbao\b/.test(locationText);
  const mentionsOnline = /\b(?:online|on\s+line|zoom|virtual|distancia)\b/.test(locationText);
  const mentionedLocations = [mentionsErandio, mentionsBilbao, mentionsOnline].filter(Boolean).length;

  if (mentionedLocations > 1) {
    return null;
  }

  let optionId: MaternalyCharlaOptionId | undefined;
  if (mentionsErandio) {
    optionId = "erandio";
  } else if (mentionsBilbao) {
    optionId = "bilbao";
  } else if (mentionsOnline || explicitModality === "online") {
    optionId = "online";
  }

  if (!optionId) {
    return null;
  }

  const option = getCharlaOption(optionId);
  if (explicitModality && option.modality !== explicitModality) {
    return null;
  }
  return option;
}

/** Comprueba sede, modalidad y hora, pero permite incorporar nuevas fechas futuras. */
export function isCharlaScheduleCompatible(
  candidate: MaternalyCharlaScheduleCandidate,
): boolean {
  const option = resolveCharlaOption(candidate);
  const startTime = normalizeCharlaTime(candidate.startTime);
  return Boolean(option && startTime && option.startTime === startTime);
}

/** Comprueba además que la fecha pertenezca a las ocho convocatorias del Word. */
export function isDocumentedCharlaSession(
  candidate: MaternalyCharlaScheduleCandidate,
): boolean {
  const option = resolveCharlaOption(candidate);
  const date = normalizeCharlaDate(candidate.date);
  const startTime = normalizeCharlaTime(candidate.startTime);
  if (!option || !date || !startTime) {
    return false;
  }
  return MATERNALY_CHARLA_SESSIONS.some(
    (session) =>
      session.optionId === option.id &&
      session.date === date &&
      session.startTime === startTime,
  );
}
