import { describe, expect, it } from "vitest";
import { MaternalyConversationOutbox } from "./outbox";

describe("Maternaly conversation outbox", () => {
  it("renders text and service media in one Twilio WhatsApp response", () => {
    const result = new MaternalyConversationOutbox().buildText({
      conversationId: "conversation_media",
      provider: "twilio",
      rendered: {
        kind: "text",
        text: "Información de BLW & seguridad",
        source: "copy_renderer",
        renderer: "MaternalyCopyRenderer",
      },
      media: [
        {
          serviceId: "taller_blw",
          alt: "Cartel BLW",
          url: "https://maternaly.example.test/maternaly/services/taller-blw.jpeg",
        },
      ],
    });

    expect(result.twiml).toContain("<Body>Información de BLW &amp; seguridad</Body>");
    expect(result.twiml).toContain(
      "<Media>https://maternaly.example.test/maternaly/services/taller-blw.jpeg</Media>",
    );
  });
});
