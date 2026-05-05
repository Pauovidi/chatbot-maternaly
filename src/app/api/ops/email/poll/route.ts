import { pollReservationMailboxWorkflow } from "@/lib/hotel/application";

export async function POST() {
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
