export const REAL_SAMPLE_EMAIL = `Tienes una nueva solicitud de reserva online de Hotel
Este es un email automático, por favor, no responda a este email.

Un usuario ha solicitado hacer una reserva online a través de tu web. Estos son los datos:

Reserva de hotel
Cliente: carolina rodriguez lopez

Email: carolinarolopez381@gmail.com

Teléfono: 646376965

WhatsApp: +34646376965

Fecha entrada: 2026-08-17 13:00

Fecha salida: 2026-08-28 13:00

Animales:

luca - Macho - perro de agua`;

export const MANUAL_SAMPLE_EMAIL = `Asunto: Solicitud de reserva web

Hola,
Quería reservar para Luna, una golden retriever muy tranquila.
Soy Ana López y mi teléfono es 612 345 678.
Entrada: 12/04/2026 por la mañana.
Salida: 15/04/2026 por la tarde.
Sería 1 perro.
Notas: trae su manta y come pienso propio.
`;

export const INCOMPLETE_SAMPLE_EMAIL = `Hola,
Me llamo Marta y quisiera dejar a Nala unos días.
Entrada el 18/04/2026 por la tarde.
Salgo a confirmar la hora de salida luego.
Gracias`;

export const NO_AVAILABILITY_SAMPLE_EMAIL = `Asunto: Reserva para dos perros

Hola,
Quiero dejar a Toby y Coco.
Soy Jorge Martín. Teléfono 677 222 111.
Entrada: 10/09/2026 por la mañana.
Salida: 14/09/2026 por la mañana.
Serían 3 perros.
`;

export const DEMO_SAMPLE_EMAILS = [
  {
    id: "real-forward",
    label: "Email real reenviado",
    description: "Caso real con hora 13:00 interpretada como turno de tarde.",
    content: REAL_SAMPLE_EMAIL,
  },
  {
    id: "available-manual",
    label: "Caso con disponibilidad",
    description: "Petición completa y apta para calcular precio y hueco.",
    content: MANUAL_SAMPLE_EMAIL,
  },
  {
    id: "pending-incomplete",
    label: "Caso incompleto",
    description: "Faltan teléfono y salida, por lo que queda pendiente.",
    content: INCOMPLETE_SAMPLE_EMAIL,
  },
  {
    id: "full-no-availability",
    label: "Caso sin disponibilidad",
    description: "Fechas que chocan con la ocupación actual para enseñar el no.",
    content: NO_AVAILABILITY_SAMPLE_EMAIL,
  },
] as const;
