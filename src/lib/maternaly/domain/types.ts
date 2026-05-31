export type MaternalyServiceStatus =
  | "lead_created"
  | "reservation_interest"
  | "reservation_pending"
  | "payment_link_sent"
  | "payment_pending"
  | "payment_confirmed"
  | "reservation_confirmed"
  | "invoice_pending"
  | "invoice_sent"
  | "invoice_failed"
  | "manual_review_required"
  | "cancelled";

export type MaternalyServiceId =
  | "pilates"
  | "yoga_prenatal"
  | "aipap_terra"
  | "aipap_agua"
  | "preparacion_parto"
  | "suelo_pelvico"
  | "primeros_auxilios"
  | "diagnostico_prenatal"
  | "lactancia"
  | "fisioterapia_pediatrica"
  | "talleres"
  | "metodo_5p"
  | "unknown";

export interface NormalizedServiceSession {
  id: string;
  service_id: MaternalyServiceId | string;
  service_name: string;
  service_category?: string;
  modality?: string;
  location?: string;
  venue?: string;
  address?: string;
  date?: string;
  weekday?: string;
  start_time?: string;
  end_time?: string;
  duration_minutes?: number;
  capacity?: number;
  occupied_slots?: number;
  available_slots?: number;
  price?: number;
  payment_link?: string;
  payment_mode?: string;
  requires_interview: boolean;
  requires_manual_review: boolean;
  source_sheet_id: string;
  source_spreadsheet_title?: string;
  source_tab?: string;
  source_gid?: number;
  source_row_id?: number;
  source_range?: string;
  raw_payload: Record<string, unknown>;
  last_synced_at: string;
  validation_status: "valid" | "partial" | "invalid";
  validation_errors: string[];
}

export interface ReservationDraft {
  serviceId?: string;
  serviceName?: string;
  sessionId?: string;
  location?: string;
  venue?: string;
  date?: string;
  startTime?: string;
  contactName?: string;
  phone?: string;
  email?: string;
  peopleCount?: number;
  pregnancyWeek?: number;
  observations?: string;
}

export interface InternalMessage {
  id: string;
  provider: "ycloud" | "mock" | "twilio" | "unknown";
  from: string;
  to?: string;
  text?: string;
  media?: Array<{ type: "image" | "document" | "link"; url: string; filename?: string }>;
  occurredAt: string;
  raw: Record<string, unknown>;
}
