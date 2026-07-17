import { describe, expect, it } from "vitest";
import {
  MATERNALY_CHARLA_FACTS,
  MATERNALY_CHARLA_OPTIONS,
  MATERNALY_CHARLA_SESSIONS,
  MATERNALY_CONTACT,
  MATERNALY_JOURNEY_STAGE_OPTIONS,
  MATERNALY_LOCATIONS,
  MATERNALY_PREGNANCY_SERVICE_MENU,
  getCharlaSessionsForOption,
  isCharlaScheduleCompatible,
  isDocumentedCharlaSession,
  resolveCharlaOption,
} from "./charla-informativa-contract";

describe("Word contract for the Maternaly informational talk", () => {
  it("keeps the three journey stages and the complete pregnancy menu in client order", () => {
    expect(MATERNALY_JOURNEY_STAGE_OPTIONS.map(({ label }) => label)).toEqual([
      "EMBARAZO",
      "POSTPARTO",
      "OTROS",
    ]);
    expect(MATERNALY_PREGNANCY_SERVICE_MENU.map(({ id }) => id)).toEqual([
      "charla_informativa",
      "test_adn_fetal",
      "detesex",
      "preparacion_parto",
      "metodo_maternaly",
      "ecografia_5d",
      "taller_blw",
      "aipap_agua",
      "pilates_embarazo",
      "yoga_embarazo",
      "metodo_5p",
      "entrenamiento_funcional_embarazo",
      "fisioterapia_embarazo",
      "psicologia_perinatal",
    ]);
  });

  it("contains all Charla facts and the explicit reservation call to action", () => {
    expect(MATERNALY_CHARLA_FACTS).toMatchObject({
      audience: expect.stringMatching(/semana 1.*semana 20/i),
      deliveredBy: "matronas",
      price: "gratuita",
      formats: ["presencial", "online"],
      cta: "¿Quieres reservar tu plaza?",
    });
    expect(MATERNALY_CHARLA_FACTS.topics.join(" ")).toMatch(
      /cuerpo.*autocuidados.*alimentación.*actividad física.*pruebas.*medicación segura.*sexualidad.*emocionales/i,
    );
    expect(MATERNALY_CHARLA_FACTS.companionPolicy).toMatch(/sola.*acompañada/i);
  });

  it("defines Erandio, Bilbao and online with their canonical times", () => {
    expect(
      MATERNALY_CHARLA_OPTIONS.map(({ id, location, modality, startTime }) => ({
        id,
        location,
        modality,
        startTime,
      })),
    ).toEqual([
      { id: "erandio", location: "Erandio", modality: "presencial", startTime: "18:30" },
      { id: "bilbao", location: "Bilbao", modality: "presencial", startTime: "17:00" },
      { id: "online", location: "Online", modality: "online", startTime: "19:00" },
    ]);
  });

  it("contains exactly the eight current dates and no historical example dates", () => {
    expect(
      MATERNALY_CHARLA_SESSIONS.map(({ optionId, date, startTime }) => ({
        optionId,
        date,
        startTime,
      })),
    ).toEqual([
      { optionId: "erandio", date: "2026-08-20", startTime: "18:30" },
      { optionId: "erandio", date: "2026-09-24", startTime: "18:30" },
      { optionId: "erandio", date: "2026-10-08", startTime: "18:30" },
      { optionId: "bilbao", date: "2026-10-06", startTime: "17:00" },
      { optionId: "bilbao", date: "2026-12-15", startTime: "17:00" },
      { optionId: "online", date: "2026-08-10", startTime: "19:00" },
      { optionId: "online", date: "2026-09-07", startTime: "19:00" },
      { optionId: "online", date: "2026-10-05", startTime: "19:00" },
    ]);
    expect(MATERNALY_CHARLA_SESSIONS.map(({ date }) => date)).not.toEqual(
      expect.arrayContaining(["2026-06-16", "2026-06-25", "2026-07-16", "2026-07-20"]),
    );
    expect(getCharlaSessionsForOption("online")).toHaveLength(3);
  });

  it("resolves human labels and rejects contradictory or undocumented schedules", () => {
    expect(resolveCharlaOption("me viene mejor Erandio")?.id).toBe("erandio");
    expect(resolveCharlaOption({ modality: "on line" })?.id).toBe("online");
    expect(resolveCharlaOption({ center: "Bilbao", modality: "Presencial" })?.id).toBe(
      "bilbao",
    );
    expect(resolveCharlaOption({ center: "Erandio", modality: "Online" })).toBeNull();
    expect(
      isCharlaScheduleCompatible({
        center: "Erandio",
        modality: "Presencial",
        startTime: "18:30:00",
      }),
    ).toBe(true);
    expect(
      isDocumentedCharlaSession({
        center: "Online",
        modality: "Online",
        date: "10/08/2026",
        startTime: "19:00",
      }),
    ).toBe(true);
    expect(
      isDocumentedCharlaSession({
        center: "Online",
        modality: "Online",
        date: "2026-11-02",
        startTime: "19:00",
      }),
    ).toBe(false);
  });

  it("keeps the Word contact details and venue instructions", () => {
    expect(MATERNALY_CONTACT).toEqual({
      phone: "634402760",
      email: "info@maternaly.es",
      satisfactionSurveyUrl: "https://forms.gle/qHzrKyuwwGMRR4e67",
    });
    expect(MATERNALY_LOCATIONS.Erandio.address).toMatch(/Goyoaga 32.*Local 111-112.*Timbre 112/i);
    expect(MATERNALY_LOCATIONS.Bilbao.address).toMatch(/Paseo Uribitarte 22.*primero F/i);
  });
});
