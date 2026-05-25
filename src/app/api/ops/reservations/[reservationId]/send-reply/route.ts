import { sendReservationReply } from "@/lib/hotel/application/operations";
import { requirePanelAuth } from "@/lib/hotel/conversations/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(
  request: Request,
  context: { params: Promise<{ reservationId: string }> },
) {
  const auth = requirePanelAuth(request);
  if (!auth.ok) {
    return auth.response;
  }

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
