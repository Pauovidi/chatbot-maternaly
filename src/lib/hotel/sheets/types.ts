import type {
  DemoReservationRecord,
  HotelSlot,
  MonthOccupancySnapshot,
  SheetCellMetadataUpdate,
  SheetCellUpdate,
  SheetColorPlan,
  SheetReservationRegistration,
  SheetWritePlan,
  SheetsCancellationResult,
  SheetsAvailabilityInput,
  SheetsAvailabilityResult,
  SheetsWriteResult,
  TransportMode,
} from "@/lib/hotel/integrations/types";
import type {
  SheetsColorPalette,
  SheetsMonthlyLayout,
} from "@/lib/hotel/config/sheets";

export type {
  DemoReservationRecord,
  HotelSlot,
  MonthOccupancySnapshot,
  SheetCellMetadataUpdate,
  SheetCellUpdate,
  SheetColorPlan,
  SheetReservationRegistration,
  SheetWritePlan,
  SheetsCancellationResult,
  SheetsAvailabilityInput,
  SheetsAvailabilityResult,
  SheetsWriteResult,
  TransportMode,
};

export interface SheetStructureIssue {
  code:
    | "missing_title"
    | "missing_day_header"
    | "invalid_day_header"
    | "missing_data_rows"
    | "unexpected_sheet_name"
    | "range_too_small"
    | "invalid_layout"
    | "invalid_special_label";
  message: string;
  severity: "error" | "warning";
  row?: number;
  column?: number;
}

export interface SheetStructureReport {
  ok: boolean;
  monthKey: string;
  sheetName: string;
  layout: SheetsMonthlyLayout;
  issues: SheetStructureIssue[];
  rowCount: number;
  dayHeaders: number[];
  occupiedCells: number;
}

export interface SheetAdapterContext {
  mode: TransportMode;
  spreadsheetId?: string;
  accessToken?: string;
  serviceAccountJson?: string;
  storeName?: string;
  sheetTitleByMonthKey?: Record<string, string>;
  layout?: Partial<SheetsMonthlyLayout>;
  colorPalette?: Partial<SheetsColorPalette>;
}

export interface SheetAdapter {
  readMonth(monthKey: string): Promise<MonthOccupancySnapshot>;
  validateMonthStructure(monthKey: string): Promise<SheetStructureReport>;
  checkAvailability(input: SheetsAvailabilityInput): Promise<SheetsAvailabilityResult>;
  buildWritePlan(reservation: DemoReservationRecord): Promise<SheetWritePlan>;
  writeReservation(reservation: DemoReservationRecord): Promise<SheetsWriteResult>;
  cancelReservation(reservationId: string): Promise<SheetsCancellationResult>;
}

export interface SheetMonthReadResult extends MonthOccupancySnapshot {
  structure: SheetStructureReport;
  rawValues: string[][];
}

export interface SheetWriteOptions {
  dryRun?: boolean;
}

export interface GoogleAuthContext {
  spreadsheetId: string;
  accessToken?: string;
  serviceAccountJson?: string;
}
