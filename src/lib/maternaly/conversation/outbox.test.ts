import { describe, expect, it } from "vitest";
import { MaternalyConversationOutbox } from "./outbox";

describe("Maternaly conversation outbox", () => {
  it("renders text and at most one service poster in a Twilio WhatsApp response", () => {
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
          prefaceText: "Te paso la información del taller BLW para que sepas en qué consiste.",
        },
        {
          serviceId: "charla_embarazo_1_20",
          alt: "Cartel charla",
          url: "https://maternaly.example.test/maternaly/services/charla-informativa-embarazo.jpeg",
        },
      ],
    });

    expect(result.twiml).toContain(
      "<Body>Te paso la información del taller BLW para que sepas en qué consiste.</Body>",
    );
    expect(result.twiml).toContain("<Body>Información de BLW &amp; seguridad</Body>");
    expect(result.twiml).toContain(
      "<Media>https://maternaly.example.test/maternaly/services/taller-blw.jpeg</Media>",
    );
    expect(result.twiml).not.toContain("charla-informativa-embarazo.jpeg");
    expect(result.twiml.match(/<Message>/g)).toHaveLength(2);
    expect(result.twiml.indexOf("Te paso la información")).toBeLessThan(
      result.twiml.indexOf("<Media>"),
    );
    expect(result.media.map((item) => item.serviceId)).toEqual(["taller_blw"]);
  });
});
