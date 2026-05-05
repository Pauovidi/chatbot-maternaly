import { sendReservationReply } from "@/lib/hotel/application";

export async function POST(
  _request: Request,
  context: { params: Promise<{ reservationId: string }> },
) {
  const { reservationId } = await context.params;

  try {
    const result = await sendReservationReply(reservationId);
    return Response.json(result);
  } catch (error) {
    return Response.json(
      {
        message:
          error instanceof Error
            ? error.message
            : "No se pudo preparar/enviar la respuesta al cliente.",
      },
      { status: 400 },
    );
  }
}
