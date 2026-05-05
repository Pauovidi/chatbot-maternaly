import { processReservationEmail } from "@/lib/hotel/application/process-reservation";

export async function POST(request: Request) {
  const body = (await request.json()) as {
    subject?: string;
    rawText?: string;
  };

  if (!body.rawText?.trim()) {
    return Response.json(
      {
        message: "Falta el contenido del email para procesar la reserva.",
      },
      { status: 400 },
    );
  }

  const result = await processReservationEmail({
    subject: body.subject ?? "Solicitud de reserva",
    rawText: body.rawText,
  });

  return Response.json(result);
}
