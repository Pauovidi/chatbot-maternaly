import { describe, expect, it } from "vitest";
import { demoPricingConfig } from "./config";
import { quoteStayPrice } from "./engine";

describe("pricing engine", () => {
  it("calcula precio básico por una estancia de un slot", () => {
    const quote = quoteStayPrice(
      {
        stay: {
          checkIn: { date: "2026-05-10", slot: "morning" },
          checkOut: { date: "2026-05-10", slot: "morning" },
        },
        dogs: 1,
      },
      demoPricingConfig,
    );

    expect(quote.slotCount).toBe(1);
    expect(quote.fullDays).toBe(0);
    expect(quote.halfDays).toBe(1);
    expect(quote.total).toBe(12);
  });

  it("calcula un día completo cuando la estancia ocupa dos slots", () => {
    const quote = quoteStayPrice(
      {
        stay: {
          checkIn: { date: "2026-05-10", slot: "afternoon" },
          checkOut: { date: "2026-05-11", slot: "morning" },
        },
        dogs: 2,
      },
      demoPricingConfig,
    );

    expect(quote.slotCount).toBe(2);
    expect(quote.fullDays).toBe(1);
    expect(quote.halfDays).toBe(0);
    expect(quote.total).toBe(45);
  });

  it("aplica suplemento de medio día cuando la estancia deja un slot impar", () => {
    const quote = quoteStayPrice(
      {
        stay: {
          checkIn: { date: "2026-05-10", slot: "morning" },
          checkOut: { date: "2026-05-11", slot: "morning" },
        },
        dogs: 4,
      },
      demoPricingConfig,
    );

    expect(quote.slotCount).toBe(3);
    expect(quote.fullDays).toBe(1);
    expect(quote.halfDays).toBe(1);
    expect(quote.total).toBe(67);
  });
});
