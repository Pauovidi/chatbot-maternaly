import { describe, expect, it } from "vitest";
import { resolveMaternalyChatReply } from "./public-chat";

const forbiddenResponsePattern =
  /\b(?:hotel|perros|canino|vacunas|comida|visitas|residencia|qu[eé]\s+traer)\b/i;

describe("Maternaly public chat", () => {
  it("answers hola with Maternaly services", () => {
    const reply = resolveMaternalyChatReply("hola").text;

    expect(reply).toContain("Maternaly");
    expect(reply).toMatch(/información|talleres|charlas/i);
    expect(reply).not.toMatch(forbiddenResponsePattern);
  });
});
