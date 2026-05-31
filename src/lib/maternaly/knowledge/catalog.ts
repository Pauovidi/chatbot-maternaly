import type { MaternalyServiceId } from "@/lib/maternaly/domain/types";

export interface KnowledgeService {
  id: MaternalyServiceId;
  name: string;
  aliases: string[];
  category: "reservable" | "informational";
  summary: string;
  requiresInterview?: boolean;
  safetyNotes: string[];
}

export const MATERNALY_KNOWLEDGE_SERVICES: KnowledgeService[] = [
  {
    id: "pilates",
    name: "Pilates Embarazo",
    aliases: ["pilates", "pilates embarazo"],
    category: "reservable",
    summary:
      "Pilates para embarazo. Horarios orientativos existen por sede, pero las reservas solo se ofrecen si Sheets devuelve datos fiables.",
    safetyNotes: ["No mezclar con Yoga Prenatal.", "No inventar horarios ni plazas."],
  },
  {
    id: "yoga_prenatal",
    name: "Yoga Prenatal",
    aliases: ["yoga", "yoga prenatal"],
    category: "informational",
    summary:
      "Yoga puede aparecer parcialmente activo. No debe reservarse sin disponibilidad fiable en Sheets.",
    safetyNotes: ["Si no hay grupo activo en Sheets, recoger interes o derivar a humano."],
  },
  {
    id: "aipap_terra",
    name: "AIPAP Terra",
    aliases: ["aipap terra", "terra", "tierra"],
    category: "reservable",
    summary:
      "AIPAP en tierra. Erandio lunes 18:30 y Bilbao viernes 11:15 son orientativos y deben verificarse contra Sheets.",
    safetyNotes: ["No confundir con AIPAP Agua."],
  },
  {
    id: "aipap_agua",
    name: "AIPAP Agua",
    aliases: ["aipap agua", "agua", "piscina", "hydra", "hidra", "beup", "up&you"],
    category: "reservable",
    summary:
      "AIPAP en piscina/gimnasio. Requiere especial cuidado porque la clienta puede necesitar justificante de acceso.",
    safetyNotes: [
      "No confirmar plaza sin pago confirmado.",
      "No enviar justificante si no existe confirmacion real.",
    ],
  },
  {
    id: "preparacion_parto",
    name: "Preparacion al Parto",
    aliases: ["preparacion al parto", "preparacion al nacimiento", "parto"],
    category: "informational",
    summary:
      "Flujo especial con entrevista previa. Si falta documento detallado, derivar a humano.",
    requiresInterview: true,
    safetyNotes: ["No inventar entrevista ni condiciones."],
  },
  {
    id: "suelo_pelvico",
    name: "Fisioterapia de Suelo Pelvico",
    aliases: ["suelo pelvico", "fisioterapia suelo pelvico"],
    category: "informational",
    summary: "Servicio sanitario informativo o derivable al equipo.",
    safetyNotes: ["No dar consejo medico personalizado."],
  },
  {
    id: "primeros_auxilios",
    name: "Primeros Auxilios",
    aliases: ["primeros auxilios"],
    category: "informational",
    summary: "Taller pendiente de mapping operativo definitivo.",
    safetyNotes: ["No reservar sin fuente conectada."],
  },
  {
    id: "diagnostico_prenatal",
    name: "Diagnostico Prenatal",
    aliases: ["diagnostico prenatal", "everli", "detesex", "ecografia", "5d", "8k"],
    category: "informational",
    summary: "Incluye Test Prenatal No Invasivo EVERLI, Detesex y ecografia 5D/8K.",
    safetyNotes: ["Derivar dudas clinicas a humano."],
  },
  {
    id: "lactancia",
    name: "Lactancia",
    aliases: ["lactancia"],
    category: "informational",
    summary: "Consulta o taller de lactancia, pendiente de fuente operativa.",
    safetyNotes: ["No confirmar cita sin fuente conectada."],
  },
  {
    id: "fisioterapia_pediatrica",
    name: "Fisioterapia Pediatrica",
    aliases: ["fisioterapia pediatrica", "fisio pediatrica"],
    category: "informational",
    summary: "Servicio informativo con derivacion si el caso requiere valoracion.",
    safetyNotes: ["No dar diagnosticos."],
  },
  {
    id: "talleres",
    name: "Talleres",
    aliases: ["taller", "talleres", "blw", "familiares"],
    category: "informational",
    summary: "Categoria general de talleres no mapeados.",
    safetyNotes: ["Pedir taller concreto."],
  },
  {
    id: "metodo_5p",
    name: "Metodo 5P",
    aliases: ["metodo 5p", "5p"],
    category: "informational",
    summary: "Puede ser reservable solo si Sheets lo soporta claramente.",
    safetyNotes: ["Tratar como informativo hasta mapping fiable."],
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
  return MATERNALY_KNOWLEDGE_SERVICES.find((service) => service.id === id) ?? null;
}
