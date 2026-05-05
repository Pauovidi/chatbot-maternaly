import { HOTEL_SLOT_WINDOWS } from "@/lib/hotel/domain/slots";
import type { ReminderRuntimeConfig } from "./types";

function readBooleanEnv(name: string, fallback: boolean): boolean {
  const value = process.env[name];

  if (value === undefined) {
    return fallback;
  }

  return ["1", "true", "yes", "on"].includes(value.trim().toLowerCase());
}

function readStringEnv(name: string, fallback: string): string {
  const value = process.env[name]?.trim();
  return value ? value : fallback;
}

function readNumberEnv(name: string, fallback: number): number {
  const raw = process.env[name];

  if (raw === undefined) {
    return fallback;
  }

  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : fallback;
}

export const REMINDER_DEFAULT_CONFIG: ReminderRuntimeConfig = {
  defaultLeadHours: 120,
  defaultChannel: "whatsapp",
  defaultMode: "mock",
  defaultStoreName: "hotel-demo-state.json",
  fallbackToPreview: true,
  webhookUrl: process.env.HOTEL_REMINDER_WEBHOOK_URL?.trim() || undefined,
};

export function getReminderRuntimeConfig(): ReminderRuntimeConfig {
  const realModeFlag = process.env.HOTEL_USE_REMINDERS_REAL ?? process.env.HOTEL_USE_REAL_REMINDERS;
  const webhookUrl = process.env.HOTEL_REMINDER_WEBHOOK_URL ?? process.env.HOTEL_REMINDER_WEBHOOK;

  return {
    defaultLeadHours: readNumberEnv("HOTEL_REMINDER_LEAD_HOURS", REMINDER_DEFAULT_CONFIG.defaultLeadHours),
    defaultChannel: (readStringEnv("HOTEL_REMINDER_CHANNEL", REMINDER_DEFAULT_CONFIG.defaultChannel) as ReminderRuntimeConfig["defaultChannel"]),
    defaultMode: realModeFlag && ["1", "true", "yes", "on"].includes(realModeFlag.trim().toLowerCase()) ? "real" : REMINDER_DEFAULT_CONFIG.defaultMode,
    defaultStoreName: readStringEnv("HOTEL_REMINDER_STORE_NAME", REMINDER_DEFAULT_CONFIG.defaultStoreName),
    fallbackToPreview: readBooleanEnv("HOTEL_REMINDER_FALLBACK_TO_PREVIEW", REMINDER_DEFAULT_CONFIG.fallbackToPreview),
    webhookUrl: webhookUrl?.trim() || REMINDER_DEFAULT_CONFIG.webhookUrl,
  };
}

export const REMINDER_SLOT_WINDOWS = HOTEL_SLOT_WINDOWS;
