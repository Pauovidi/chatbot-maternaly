import type { MaternalyServiceId } from "@/lib/maternaly/domain/types";
import type { MaternalyNormalizedServiceKey } from "@/lib/maternaly/sheets/normalized-template";

export interface KnowledgeSession {
  location?: string;
  modality?: "presencial" | "online";
  venue?: string;
  date?: string;
  weekday?: string;
  startTime?: string;
  endTime?: string;
}

export interface KnowledgeService {
  id: MaternalyServiceId;
  normalizedServiceKey?: MaternalyNormalizedServiceKey;
  name: string;
  aliases: string[];
  category: "reservable" | "informational" | "sensitive";
  summary: string;
  details: string[];
  requiredData: string[];
  pricing?: string[];
  sessions?: KnowledgeSession[];
  requiresInterview?: boolean;
  clinicalEscalation?: boolean;
  safetyNotes: string[];
  nextQuestion: string;
}

export const MATERNALY_KNOWLEDGE_VERSION = "maternaly_kb_demo_2026_07_01_warm_pilates_v1";

export const MATERNALY_KNOWLEDGE_SERVICES: KnowledgeService[] = [
  {
    id: "charla_embarazo_1_20",
    normalizedServiceKey: "charla_embarazo_1_20",
    name: "Charla informativa gratuita semana 1 a 20 de embarazo",
    aliases: [
      "charla",
      "charla embarazo",
      "charla informativa",
      "charla gratuita",
      "semana 1 a 20",
      "semana 1-20",
      "embarazadas 1 a 20",
    ],
    category: "reservable",
    summary:
      "Charla gratuita para embarazadas entre la semana 1 y la 20, disponible en Erandio, Bilbao y online.",
    details: [
      "Trata cambios corporales, cuidados, alimentación, actividad física, exámenes, medicación segura, sexualidad y cambios emocionales.",
      "Las plazas deben comprobarse en el Sheet normalizado si está disponible.",
    ],
    requiredData: [
      "nombre y apellidos",
      "teléfono",
      "si acude 1 o 2 personas",
      "nombre de pareja o acompañante si acuden 2",
      "fecha probable de parto",
    ],
    sessions: [
      { location: "Erandio", modality: "presencial", date: "2026-06-25", startTime: "18:30" },
      { location: "Erandio", modality: "presencial", date: "2026-07-16", startTime: "18:30" },
      { location: "Erandio", modality: "presencial", date: "2026-08-20", startTime: "18:30" },
      { location: "Erandio", modality: "presencial", date: "2026-09-24", startTime: "18:30" },
      { location: "Erandio", modality: "presencial", date: "2026-10-08", startTime: "18:30" },
      { location: "Bilbao", modality: "presencial", date: "2026-06-16", startTime: "17:00" },
      { location: "Bilbao", modality: "presencial", date: "2026-10-06", startTime: "17:00" },
      { location: "Bilbao", modality: "presencial", date: "2026-12-15", startTime: "17:00" },
      { modality: "online", date: "2026-07-20", startTime: "19:00" },
      { modality: "online", date: "2026-08-10", startTime: "19:00" },
      { modality: "online", date: "2026-09-07", startTime: "19:00" },
      { modality: "online", date: "2026-10-05", startTime: "19:00" },
    ],
    safetyNotes: [
      "No confirmar plaza si el Sheet no devuelve disponibilidad fiable.",
      "Si falla Sheets, recoger datos y derivar la solicitud.",
    ],
    nextQuestion: "¿Prefieres Bilbao, Erandio u online?",
  },
  {
    id: "taller_blw",
    normalizedServiceKey: "taller_blw",
    name: "Taller BLW",
    aliases: ["blw", "taller blw", "baby led weaning", "alimentación complementaria", "alimentacion complementaria"],
    category: "reservable",
    summary:
      "Taller presencial de Baby-Led Weaning / Alimentación Complementaria Autorregulada, de 17:00 a 20:00.",
    details: ["Plazas máximas: 14 personas.", "Es una preinscripción si no hay pago o validación real."],
    requiredData: [
      "nombre y apellidos",
      "teléfono",
      "email si el flujo lo permite",
      "si viene 1 persona o pareja",
      "nombre de pareja si procede",
      "fecha de nacimiento del bebé",
    ],
    pricing: ["45 €/persona", "75 €/pareja"],
    sessions: [
      { location: "Erandio", date: "2026-09-02", weekday: "miércoles", startTime: "17:00", endTime: "20:00" },
      { location: "Erandio", date: "2026-10-07", weekday: "miércoles", startTime: "17:00", endTime: "20:00" },
      { location: "Erandio", date: "2026-11-04", weekday: "miércoles", startTime: "17:00", endTime: "20:00" },
      { location: "Erandio", date: "2026-12-02", weekday: "miércoles", startTime: "17:00", endTime: "20:00" },
      { location: "Bilbao", date: "2026-09-25", weekday: "viernes", startTime: "17:00", endTime: "20:00" },
      { location: "Bilbao", date: "2026-10-23", weekday: "viernes", startTime: "17:00", endTime: "20:00" },
      { location: "Bilbao", date: "2026-11-27", weekday: "viernes", startTime: "17:00", endTime: "20:00" },
      { location: "Bilbao", date: "2026-12-18", weekday: "viernes", startTime: "17:00", endTime: "20:00" },
    ],
    safetyNotes: [
      "No decir plaza confirmada sin pago validado.",
      "Usar preinscripción o solicitud pendiente de validación/pago si no hay herramienta de pago real.",
    ],
    nextQuestion: "¿Te interesa Bilbao o Erandio?",
  },
  {
    id: "pilates",
    name: "Pilates Embarazo",
    aliases: ["pilates", "pilates embarazo", "pilates embarazadas", "pilates prenatal"],
    category: "informational",
    summary:
      "Pilates para embarazo en grupos reducidos, desde la semana 14 y hasta el final de la gestación.",
    details: [
      "Ayuda a mejorar el tono muscular y la forma física, aumenta fuerza y resistencia, favorece la circulación de las piernas y cuida la postura para aliviar molestias de espalda.",
      "Trabaja conciencia corporal, control de la respiración y suelo pélvico, y aporta bienestar y relajación durante el embarazo.",
      "Los grupos son reducidos para ofrecer atención personalizada y mantener medidas de higiene y seguridad.",
      "Bilbao: lunes 10:00-11:00, lunes 11:00-12:00, lunes 17:00-18:00, lunes 18:15-19:15; miércoles 10:00-11:00, miércoles 17:00-18:00, miércoles 18:15-19:15.",
      "Erandio: martes 17:30-18:30; jueves 10:00-11:00, jueves 11:00-12:00, jueves 17:30-18:30.",
    ],
    requiredData: ["sede de interés", "semana de embarazo", "preferencia horaria"],
    pricing: ["59 €/mes 1 clase/semana", "99 €/mes 2 clases/semana"],
    sessions: [
      { location: "Bilbao", modality: "presencial", weekday: "lunes", startTime: "10:00", endTime: "11:00" },
      { location: "Bilbao", modality: "presencial", weekday: "lunes", startTime: "11:00", endTime: "12:00" },
      { location: "Bilbao", modality: "presencial", weekday: "lunes", startTime: "17:00", endTime: "18:00" },
      { location: "Bilbao", modality: "presencial", weekday: "lunes", startTime: "18:15", endTime: "19:15" },
      { location: "Bilbao", modality: "presencial", weekday: "miércoles", startTime: "10:00", endTime: "11:00" },
      { location: "Bilbao", modality: "presencial", weekday: "miércoles", startTime: "17:00", endTime: "18:00" },
      { location: "Bilbao", modality: "presencial", weekday: "miércoles", startTime: "18:15", endTime: "19:15" },
      { location: "Erandio", modality: "presencial", weekday: "martes", startTime: "17:30", endTime: "18:30" },
      { location: "Erandio", modality: "presencial", weekday: "jueves", startTime: "10:00", endTime: "11:00" },
      { location: "Erandio", modality: "presencial", weekday: "jueves", startTime: "11:00", endTime: "12:00" },
      { location: "Erandio", modality: "presencial", weekday: "jueves", startTime: "17:30", endTime: "18:30" },
    ],
    safetyNotes: [
      "Responder como información salvo que exista Sheet fiable para reserva.",
      "Si la usuaria menciona dolor fuerte, sangrado, fiebre, contraindicaciones o una situación delicada, derivar al equipo/profesional.",
    ],
    nextQuestion: "¿Te apetece que deje tu interés preparado para que el equipo revise disponibilidad?",
  },
  {
    id: "aipap_terra",
    name: "AIPAP Terra",
    aliases: ["aipap terra", "terra", "tierra", "acondicionamiento pélvico tierra", "acondicionamiento pelvico tierra"],
    category: "informational",
    summary: "Acondicionamiento integral pélvico en tierra desde la semana 14.",
    details: ["Erandio: lunes 18:30-19:30.", "Bilbao: viernes 11:15-12:15."],
    requiredData: ["sede de interés", "semana de embarazo", "preferencia horaria"],
    pricing: ["59 €/mes 1 clase/semana", "99 €/mes 2 clases/semana"],
    safetyNotes: ["No confundir con AIPAP Agua."],
    nextQuestion: "¿Buscas AIPAP Terra en Bilbao o Erandio?",
  },
  {
    id: "aipap_agua",
    name: "AIPAP Agua",
    aliases: ["aipap agua", "agua", "piscina", "hydra", "hidra", "beup", "up&you", "up and you"],
    category: "informational",
    summary:
      "Método en piscina para preparar físicamente el parto; no hace falta saber nadar porque se trabaja donde se hace pie.",
    details: [
      "Desde semana 14. Si se busca mínimo de beneficio, se recomiendan unas 10 sesiones y empezar sobre semana 26-27.",
      "Centros: Up&You Bilbao, Hydra Artea / Leioa y BeUp BEC / Barakaldo.",
      "Up&You Bilbao: lunes 11:00, 12:00, 13:00, 17:30, 18:30; martes 10:30, 12:00, 13:00, 17:00, 18:00, 19:30; miércoles 11:00, 12:00, 17:30, 18:30.",
      "Hydra Artea: lunes 15:30; martes 13:30; miércoles 15:30; viernes 13:30 y 14:30.",
      "BeUp BEC: lunes 12:30 y jueves 12:30.",
    ],
    requiredData: ["centro de interés", "semana de embarazo", "preferencia horaria"],
    pricing: [
      "BeUp: 72,50 €/mes 1 día; 138,50 € 2 días.",
      "Up&You: txartela 7 € si no socia; 72,50 €/mes 1 día; 138,50 € 2 días.",
      "Hydra: txartela 12 € si no socia; 81,20 € 1 día; 155,10 € 2 días.",
    ],
    safetyNotes: ["No confirmar plaza ni justificante sin validación real."],
    nextQuestion: "¿Qué centro te viene mejor: Up&You Bilbao, Hydra Artea o BeUp BEC?",
  },
  {
    id: "yoga_prenatal",
    name: "Yoga Prenatal",
    aliases: ["yoga", "yoga prenatal"],
    category: "informational",
    summary: "Actividad prenatal informativa; aparece Bilbao miércoles 11:15-12:15 en documentos.",
    details: ["Precio orientativo: 59 €/mes 1 clase/semana."],
    requiredData: ["interés", "sede", "semana de embarazo"],
    pricing: ["59 €/mes 1 clase/semana"],
    safetyNotes: ["No reservar si no hay grupo activo o fuente fiable."],
    nextQuestion: "¿Quieres que recoja tu interés para que el equipo confirme si hay grupo activo?",
  },
  {
    id: "metodo_5p",
    name: "Método 5P",
    aliases: ["metodo 5p", "método 5p", "5p", "winner flow", "tronco"],
    category: "informational",
    summary:
      "Reeducación propioceptiva pelviperineal para abdomen y suelo pélvico en embarazo o postparto.",
    details: [
      "Activa musculatura abdominal, lumbar y perineal profunda; tonifica abdomen y suelo pélvico; reprograma postura; desbloquea diafragma; mejora molestias de espalda y cuello.",
      "Bloque de 6 sesiones.",
    ],
    requiredData: ["embarazo o postparto", "objetivo principal", "preferencia de sede"],
    pricing: ["85 €", "95 € con winner flow", "135 € con winner flow + tronco"],
    safetyNotes: ["Si falta grupo activo, recoger interés y derivar."],
    nextQuestion: "¿Lo buscas durante embarazo o postparto?",
  },
  {
    id: "diagnostico_prenatal",
    name: "Diagnóstico Prenatal",
    aliases: ["diagnostico prenatal", "diagnóstico prenatal", "everli", "detesex", "ecografía", "ecografia", "5d", "8k", "sexo fetal"],
    category: "sensitive",
    summary: "Incluye EVERLI, Detesex y ecografía emocional 5D/8K.",
    details: [
      "EVERLI: test prenatal no invasivo con precisión superior al 99%; detecta trisomías 21/18/13; resultados en 3-6 días laborables; puede ser gemelar desde semana 12 y ovodonación.",
      "Detesex: sexo fetal temprano desde semana 5; detecta cromosoma Y.",
      "Ecografía 5D/8K: emocional, no diagnóstica; mejor semanas 24-30; si el bebé no se deja ver, se repite hasta 3 veces sin coste.",
    ],
    requiredData: ["tipo de prueba", "semana de embarazo", "preferencia de sede o contacto"],
    clinicalEscalation: true,
    safetyNotes: ["Dudas clínicas o diagnósticas deben derivarse a profesional."],
    nextQuestion: "¿Te interesa EVERLI, Detesex o ecografía 5D/8K?",
  },
  {
    id: "suelo_pelvico",
    name: "Fisioterapia y Suelo Pélvico",
    aliases: ["suelo pelvico", "suelo pélvico", "fisioterapia", "fisio embarazo", "fisio postparto", "ciatica", "ciática", "pubalgia", "lumbar", "masaje perineal", "indiba", "drenaje linfatico", "drenaje linfático"],
    category: "sensitive",
    summary: "Fisioterapia de embarazo, drenaje linfático, masaje perineal e INDIBA postparto.",
    details: [
      "Fisioterapia embarazo: ciática, pubalgia y dolor lumbar.",
      "Drenaje linfático: piernas hinchadas y túnel carpiano.",
      "Masaje perineal: desde semana 32, orientado a reducir episiotomías o desgarros.",
      "INDIBA postparto: cicatrices, tono muscular y sensación de calor indoloro.",
    ],
    requiredData: ["motivo de consulta", "embarazo o postparto", "teléfono de contacto"],
    clinicalEscalation: true,
    safetyNotes: ["No dar diagnóstico personalizado."],
    nextQuestion: "¿Es una consulta de embarazo, postparto o suelo pélvico?",
  },
  {
    id: "lactancia",
    name: "Lactancia",
    aliases: ["lactancia", "mastitis", "grietas", "dolor lactancia", "baja producción", "baja produccion", "huelga lactancia"],
    category: "sensitive",
    summary: "Servicio sensible al tiempo para dolor, grietas, mastitis, baja producción y huelgas de lactancia.",
    details: ["Puede haber consulta a domicilio según disponibilidad del equipo."],
    requiredData: ["motivo", "teléfono", "si es urgente"],
    clinicalEscalation: true,
    safetyNotes: ["Dudas urgentes o clínicas deben derivarse."],
    nextQuestion: "¿Es algo urgente o puedes contarme brevemente qué está pasando?",
  },
  {
    id: "fisioterapia_pediatrica",
    name: "Fisioterapia Pediátrica / Familia",
    aliases: ["fisioterapia pediatrica", "fisioterapia pediátrica", "fisio pediatrica", "fisio pediátrica", "colicos", "cólicos", "plagiocefalia", "frenillo", "frenillo lingual", "primeros auxilios", "heimlich", "atragantamiento"],
    category: "sensitive",
    summary: "Cólicos, plagiocefalia, frenillo lingual y primeros auxilios familiares.",
    details: [
      "Cuanto antes se trate la plagiocefalia, más fácil es evitar casco.",
      "Primeros auxilios: atragantamiento, Heimlich y pérdida de consciencia.",
    ],
    requiredData: ["edad del bebé o niño", "motivo", "teléfono"],
    clinicalEscalation: true,
    safetyNotes: ["Derivar casos clínicos."],
    nextQuestion: "¿Qué edad tiene el bebé o niño y qué os preocupa?",
  },
];

export function normalizeKnowledgeText(text: string): string {
  return text.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
}

export function findKnowledgeService(text: string): KnowledgeService | null {
  const normalized = normalizeKnowledgeText(text);
  return (
    MATERNALY_KNOWLEDGE_SERVICES.find((service) =>
      service.aliases.some((alias) => normalized.includes(normalizeKnowledgeText(alias))),
    ) ?? null
  );
}

export function getKnowledgeService(id: string | undefined): KnowledgeService | null {
  if (!id) {
    return null;
  }

  return (
    MATERNALY_KNOWLEDGE_SERVICES.find(
      (service) => service.id === id || service.normalizedServiceKey === id,
    ) ?? null
  );
}

export function getKnowledgeServiceByNormalizedKey(
  key: MaternalyNormalizedServiceKey | undefined,
): KnowledgeService | null {
  return MATERNALY_KNOWLEDGE_SERVICES.find((service) => service.normalizedServiceKey === key) ?? null;
}
