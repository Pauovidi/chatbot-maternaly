import { pollReservationMailboxWorkflow } from "@/lib/hotel/application/operations";
import { requirePanelAuth } from "@/lib/hotel/conversations/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const auth = requirePanelAuth(request);
  if (!auth.ok) {
    return auth.response;
  }

  try {
    const result = await pollReservationMailboxWorkflow();
    return Response.json(result);
  } catch (error) {
    return Response.json(
      {
        message:
          error instanceof Error
            ? error.message
            : "No se pudo ejecutar el polling del buzón.",
      },
      { status: 500 },
    );
  }
}
