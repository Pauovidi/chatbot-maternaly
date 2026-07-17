import type { MaternalyServiceId } from "@/lib/maternaly/domain/types";
import {
  MATERNALY_CHARLA_FACTS,
  MATERNALY_CHARLA_SESSIONS,
} from "@/lib/maternaly/knowledge/charla-informativa-contract";
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

export const MATERNALY_KNOWLEDGE_VERSION = "maternaly_kb_2026_07_17_word_pregnancy_menu_v2";

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
    summary: `${MATERNALY_CHARLA_FACTS.name}, disponible en Erandio, Bilbao y online.`,
    details: [
      `Trata ${MATERNALY_CHARLA_FACTS.topics.join(", ")}.`,
      `La charla la imparten ${MATERNALY_CHARLA_FACTS.deliveredBy}. ${MATERNALY_CHARLA_FACTS.companionPolicy}`,
      "Las plazas deben comprobarse en el Sheet normalizado si está disponible.",
    ],
    requiredData: [
      "nombre y apellidos",
      "teléfono",
      "si acude 1 o 2 personas",
      "nombre de pareja o acompañante si acuden 2",
      "fecha probable de parto",
    ],
    sessions: MATERNALY_CHARLA_SESSIONS.map(
      ({ location, modality, date, startTime }) => ({
        location,
        modality,
        date,
        startTime,
      }),
    ),
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
    aliases: [
      "blw",
      "taller blw",
      "baby led weaning",
      "alimentación complementaria",
      "alimentacion complementaria",
      "alimentación del bebé",
      "alimentacion del bebe",
      "empezar con sólidos",
      "empezar con solidos",
    ],
    category: "reservable",
    summary:
      "Taller presencial de Baby-Led Weaning / Alimentación Complementaria Autorregulada, de 17:00 a 20:00.",
    details: [
      "Se trabajan el concepto de autorregulación, los requisitos para empezar y la introducción segura de alimentos.",
      "Incluye qué alimentos ofrecer, alergias alimentarias en la infancia y alimentación saludable.",
      "Plazas máximas: 14 personas.",
      "Es una preinscripción si no hay pago o validación real.",
    ],
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
      { location: "Erandio", modality: "presencial", date: "2026-09-02", weekday: "miércoles", startTime: "17:00", endTime: "20:00" },
      { location: "Erandio", modality: "presencial", date: "2026-10-07", weekday: "miércoles", startTime: "17:00", endTime: "20:00" },
      { location: "Erandio", modality: "presencial", date: "2026-11-04", weekday: "miércoles", startTime: "17:00", endTime: "20:00" },
      { location: "Erandio", modality: "presencial", date: "2026-12-02", weekday: "miércoles", startTime: "17:00", endTime: "20:00" },
      { location: "Bilbao", modality: "presencial", date: "2026-09-25", weekday: "viernes", startTime: "17:00", endTime: "20:00" },
      { location: "Bilbao", modality: "presencial", date: "2026-10-23", weekday: "viernes", startTime: "17:00", endTime: "20:00" },
      { location: "Bilbao", modality: "presencial", date: "2026-11-27", weekday: "viernes", startTime: "17:00", endTime: "20:00" },
      { location: "Bilbao", modality: "presencial", date: "2026-12-18", weekday: "viernes", startTime: "17:00", endTime: "20:00" },
    ],
    safetyNotes: [
      "No decir plaza confirmada sin pago validado.",
      "Usar preinscripción o solicitud pendiente de validación/pago si no hay herramienta de pago real.",
    ],
    nextQuestion: "¿Te interesa Bilbao o Erandio?",
  },
  {
    id: "test_adn_fetal",
    name: "Test ADN fetal",
    aliases: [
      "test adn fetal",
      "test de adn fetal",
      "test adn",
      "prueba adn fetal",
      "adn fetal",
      "adn prenatal",
      "test prenatal no invasivo",
      "everli",
    ],
    category: "sensitive",
    summary:
      "Prueba prenatal no invasiva que analiza ADN fetal para detectar las trisomías 21, 18 y 13.",
    details: [
      "La información validada del servicio EVERLI indica una precisión superior al 99 % y resultados en 3-6 días laborables.",
      "Puede realizarse en embarazo gemelar desde la semana 12 y también en casos de ovodonación.",
    ],
    requiredData: ["semana de embarazo", "tipo de prueba", "teléfono de contacto"],
    clinicalEscalation: true,
    safetyNotes: [
      "No interpretar resultados ni dar diagnóstico por WhatsApp.",
      "El equipo debe confirmar disponibilidad, condiciones y tarifa antes de cerrar una cita.",
    ],
    nextQuestion:
      "¿Quieres información general sobre la prueba o prefieres que el equipo confirme cómo gestionarla?",
  },
  {
    id: "detesex",
    name: "Detesex",
    aliases: [
      "detesex",
      "dete sex",
      "test detesex",
      "test de sexo fetal",
      "sexo fetal por sangre",
      "sexo del bebe por sangre",
      "sexo del bebé por sangre",
      "analisis para saber el sexo del bebe",
      "análisis para saber el sexo del bebé",
      "sexo del bebe mediante analisis de sangre",
      "sexo del bebé mediante análisis de sangre",
    ],
    category: "sensitive",
    summary:
      "Análisis de sangre para conocer de forma temprana el sexo del bebé mediante la detección del cromosoma Y.",
    details: ["La información disponible indica que puede realizarse desde la semana 5."],
    requiredData: ["semana de embarazo", "teléfono de contacto"],
    clinicalEscalation: true,
    safetyNotes: [
      "No interpretar resultados por WhatsApp.",
      "El equipo debe confirmar disponibilidad, condiciones y tarifa antes de cerrar una cita.",
    ],
    nextQuestion:
      "¿Quieres que te cuente en qué consiste o prefieres que el equipo confirme las opciones para realizarlo?",
  },
  {
    id: "preparacion_parto",
    name: "Preparación al parto",
    aliases: [
      "preparacion al parto",
      "preparación al parto",
      "curso preparacion al parto",
      "curso de preparacion al parto",
      "curso de preparación al parto",
      "preparacion parto",
      "preparación parto",
      "curso preparto",
      "clases preparto",
    ],
    category: "informational",
    summary:
      "Servicio de preparación al parto de Maternaly, disponible por seguro o de forma privada.",
    details: [
      "Antes de cerrar una opción, el equipo confirma la cobertura y si hace falta una entrevista previa.",
    ],
    requiredData: ["seguro o privado", "semana de embarazo"],
    requiresInterview: true,
    safetyNotes: [
      "No inventar horarios, tarifas, cobertura ni dar una plaza por confirmada.",
    ],
    nextQuestion: "¿Lo buscas por seguro o de forma privada?",
  },
  {
    id: "metodo_maternaly",
    name: "Método Maternaly",
    aliases: [
      "metodo maternaly",
      "método maternaly",
      "programa maternaly",
    ],
    category: "informational",
    summary:
      "Es una de las opciones de embarazo de Maternaly y puede consultarse por seguro o de forma privada.",
    details: [
      "El equipo confirma de forma personalizada las condiciones, el contenido y la disponibilidad antes de ofrecer una cita.",
    ],
    requiredData: ["seguro o privado", "motivo de consulta"],
    safetyNotes: [
      "No inventar contenido, horarios, tarifas, cobertura ni disponibilidad.",
    ],
    nextQuestion: "¿Lo buscas por seguro o de forma privada?",
  },
  {
    id: "ecografia_5d",
    name: "Ecografía 5D",
    aliases: [
      "ecografia 5d",
      "ecografía 5d",
      "eco 5d",
      "eco emocional",
      "ecografia emocional 5d",
      "ecografía emocional 5d",
      "5d",
      "8k",
    ],
    category: "sensitive",
    summary:
      "Ecografía emocional 5D/8K, no diagnóstica, orientada a ver al bebé durante el embarazo.",
    details: [
      "La franja indicada como más adecuada es entre las semanas 24 y 30.",
      "Si el bebé no se deja ver, la información disponible contempla hasta tres repeticiones sin coste.",
    ],
    requiredData: ["semana de embarazo", "teléfono de contacto"],
    clinicalEscalation: true,
    safetyNotes: [
      "No presentarla como prueba diagnóstica ni interpretar hallazgos.",
      "El equipo debe confirmar disponibilidad, condiciones y tarifa.",
    ],
    nextQuestion:
      "¿De cuántas semanas estás para que el equipo pueda orientarte sobre esta ecografía?",
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
    aliases: [
      "aipap agua",
      "aipap",
      "aipap embarazo",
      "aipap para el embarazo",
      "agua",
      "piscina",
      "hydra",
      "hidra",
      "beup",
      "up&you",
      "up and you",
    ],
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
    aliases: [
      "yoga",
      "yoga prenatal",
      "yoga embarazo",
      "yoga para el embarazo",
      "yoga embarazadas",
    ],
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
    id: "entrenamiento_funcional_embarazo",
    name: "Entrenamiento funcional para el embarazo",
    aliases: [
      "entrenamiento funcional embarazo",
      "entrenamiento funcional para el embarazo",
      "entrenamiento funcional",
      "entrenamiento para embarazadas",
      "entrenamiento embarazadas",
    ],
    category: "informational",
    summary:
      "Actividad de entrenamiento funcional incluida entre las opciones de embarazo de Maternaly.",
    details: [
      "El equipo debe confirmar el grupo activo, la adecuación, los horarios y las condiciones antes de ofrecer una plaza.",
    ],
    requiredData: ["semana de embarazo", "preferencia de sede u horario"],
    safetyNotes: [
      "No inventar horarios, tarifas o disponibilidad.",
      "Si se mencionan síntomas o una contraindicación, derivar al equipo profesional.",
    ],
    nextQuestion:
      "¿Quieres que el equipo confirme qué grupo y horario pueden encajarte?",
  },
  {
    id: "fisioterapia_embarazo",
    name: "Unidad de Fisioterapia en el embarazo",
    aliases: [
      "fisioterapia embarazo",
      "fisioterapia en el embarazo",
      "fisio embarazo",
      "fisioterapia para embarazadas",
      "fisio para embarazadas",
      "unidad fisioterapia embarazo",
      "unidad de fisioterapia en el embarazo",
    ],
    category: "sensitive",
    summary:
      "Unidad de fisioterapia para consultas durante el embarazo, como ciática, pubalgia o dolor lumbar.",
    details: [
      "También consta atención de drenaje linfático para piernas hinchadas o túnel carpiano y masaje perineal desde la semana 32.",
    ],
    requiredData: ["motivo de consulta", "semana de embarazo", "teléfono de contacto"],
    clinicalEscalation: true,
    safetyNotes: [
      "No dar diagnóstico ni pautas clínicas personalizadas por WhatsApp.",
      "El equipo profesional debe valorar el caso y confirmar disponibilidad.",
    ],
    nextQuestion:
      "¿Quieres contarme brevemente el motivo para que el equipo profesional pueda orientarte?",
  },
  {
    id: "psicologia_perinatal",
    name: "Unidad de Psicología perinatal",
    aliases: [
      "psicologia perinatal",
      "psicología perinatal",
      "unidad psicologia perinatal",
      "unidad de psicologia perinatal",
      "unidad de psicología perinatal",
      "psicologa perinatal",
      "psicóloga perinatal",
      "psicologo perinatal",
      "psicólogo perinatal",
    ],
    category: "sensitive",
    summary:
      "Unidad de Psicología perinatal de Maternaly para consultas vinculadas a esta etapa.",
    details: [
      "El equipo profesional revisa cada consulta y confirma la forma de atención y la disponibilidad.",
    ],
    requiredData: ["motivo de consulta", "teléfono de contacto"],
    clinicalEscalation: true,
    safetyNotes: [
      "No realizar valoración clínica ni inventar horarios, tarifas o disponibilidad.",
      "Si existe riesgo inmediato o una crisis, indicar atención urgente y derivar a una profesional.",
    ],
    nextQuestion:
      "¿Quieres contarme brevemente qué necesitas para que una profesional pueda orientarte?",
  },
  {
    id: "diagnostico_prenatal",
    name: "Diagnóstico Prenatal",
    aliases: ["diagnostico prenatal", "diagnóstico prenatal", "ecografía", "ecografia", "sexo fetal"],
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
  if (!key) {
    return null;
  }

  return MATERNALY_KNOWLEDGE_SERVICES.find((service) => service.normalizedServiceKey === key) ?? null;
}

export function getKnowledgeServicesByModality(
  modality: KnowledgeSession["modality"] | undefined,
): KnowledgeService[] {
  if (!modality) {
    return [];
  }

  return MATERNALY_KNOWLEDGE_SERVICES.filter((service) =>
    service.sessions?.some((session) => session.modality === modality),
  );
}
