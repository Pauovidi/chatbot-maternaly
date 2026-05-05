export * from "./config";
export * from "./availability";
export * from "./engines";
export * from "./faq";
export * from "./content/faq";
export * from "./content/whatsapp-templates";
export * from "./date-normalization";
export {
  getDemoDashboardData,
  processReservationEmail,
} from "./application";
export type {
  DemoDashboardData,
  ProcessReservationResult,
} from "./application";
export type {
  AvailabilityDaySnapshot,
  AvailabilityResult as HotelDomainAvailabilityResult,
  DemoPersistenceEnvelope,
  DemoStatusCounters,
  GoogleSheetsMonthRequest,
  HalfDaySupplementConfig,
  HotelCapacityConfig,
  HotelColorMapping,
  HotelConfig,
  HotelFeatureFlags,
  IncomingReservationEmail,
  ParsedReservationDraft,
  PricingLineItem,
  PricingQuote as HotelDomainPricingQuote,
  ReminderJob,
  ReservationDraft,
  ReservationRecord,
  ReservationStayRange,
  SheetMonthKey,
  SheetsMonthSnapshot,
  SheetsReservationWritePayload,
} from "./domain/contracts";
export * from "./domain/identifiers";
export * from "./domain/slots";
export * from "./domain/states";
export * from "./parser";
export * from "./pricing";
export * from "./mock-data";
export {
  createHotelIntegrationBundle,
  getSheetNameFromDate,
  getSlotLabel,
  hotelDemoConfig,
  readDemoState,
} from "./integrations";
