import { describe, expect, it } from "vitest";
import { resolveMaternalyChatReply } from "./public-chat";

const forbiddenResponsePattern =
  /\b(?:hotel|perros|canino|vacunas|comida|visitas|residencia|qu[eé]\s+traer)\b/i;

describe("Maternaly public chat", () => {
  it("answers hola with Maternaly services", () => {
    const reply = resolveMaternalyChatReply("hola").text;

    expect(reply).toContain("Maternaly");
    expect(reply).toMatch(/calma|información|talleres|charlas/i);
    expect(reply).not.toMatch(forbiddenResponsePattern);
  });

  it("answers global online discovery from the same catalog as WhatsApp", () => {
    const reply = resolveMaternalyChatReply("¿qué tenéis online?").text;

    expect(reply).toMatch(/opci[oó]n online.*charla informativa|charla informativa.*online/i);
    expect(reply).not.toMatch(/^El taller BLW no tiene/i);
  });

  it("answers Pilates questions with the enriched warm knowledge", () => {
    const reply = resolveMaternalyChatReply("precio pilates embarazo").text;

    expect(reply).toContain("Pilates embarazo");
    expect(reply).toContain("59 €/mes");
    expect(reply).toContain("99 €/mes");
    expect(reply).toMatch(/horarios de Bilbao o Erandio/i);
    expect(reply).not.toMatch(forbiddenResponsePattern);
  });

  it("does not answer clinical warning signs as regular Pilates information", () => {
    const reply = resolveMaternalyChatReply("tengo fiebre y sangrado, puedo hacer pilates embarazo").text;

    expect(reply).toMatch(/profesional|equipo de Maternaly/i);
    expect(reply).toMatch(/No puedo hacer diagn[oó]stico/i);
    expect(reply).not.toMatch(/Precio:|horarios/i);
  });
});
