import { dispatchDueReminders } from "@/lib/hotel/application";

export async function POST() {
  try {
    const result = await dispatchDueReminders();
    return Response.json(result);
  } catch (error) {
    return Response.json(
      {
        message:
          error instanceof Error
            ? error.message
            : "No se pudo ejecutar el envío de recordatorios.",
      },
      { status: 500 },
    );
  }
}
