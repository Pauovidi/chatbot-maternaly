"use client";

import { useState } from "react";
import type { ProcessReservationResult } from "@/lib/hotel/application/types";
import type { GoogleSheetsConfigStatus } from "@/lib/hotel/config";
import {
  demoSampleEmails,
  formatCurrency,
  formatSpanishDate,
  reservationStatusLabels,
} from "@/components/demo-data";

type SampleKey = (typeof demoSampleEmails)[number]["id"];

interface ReservationLabProps {
  sheetsStatus?: GoogleSheetsConfigStatus;
  startEmpty?: boolean;
}

const DEFAULT_SHEETS_STATUS: GoogleSheetsConfigStatus = {
  mode: "mock",
  activeAdapter: "mock",
  isReady: false,
  reason: "Google Sheets real no está validado en esta vista.",
  missing: [],
  authMode: "missing",
};

const reviewFlagLabels: Record<string, string> = {
  invalid_slot: "Hora fuera de franja operativa",
  falta_nombre_perro: "Falta nombre de la mascota",
  falta_telefono: "Falta teléfono",
  falta_fecha_entrada: "Falta fecha de entrada",
  falta_fecha_salida: "Falta fecha de salida",
  falta_turno_entrada: "Falta turno de entrada",
  falta_turno_salida: "Falta turno de salida",
  numero_perros_ambiguous: "Número de mascotas ambiguo",
  telefono_no_normalizado: "Teléfono no normalizado",
  fecha_incompleta: "Fecha incompleta",
  requiere_revision_manual: "Revisión manual",
};

function formatMoment(date?: string, time?: string, turn?: string) {
  if (!date && !time) {
    return "Pendiente";
  }

  const parts = [formatSpanishDate(date)];

  if (time) {
    parts.push(time);
  }

  if (turn === "manana" || turn === "morning") {
    parts.push("mañana");
  } else if (turn === "tarde" || turn === "afternoon") {
    parts.push("tarde");
  } else if (time) {
    parts.push("requiere validación de turno");
  }

  return parts.join(" · ");
}

function getDecision(result: ProcessReservationResult | null) {
  if (!result) {
    return "Pendiente";
  }

  if (result.workflowState === "pending_review") {
    return "Revisión manual";
  }

  if (result.status === "sin_disponibilidad") {
    return "Sin disponibilidad";
  }

  if (result.status === "disponible") {
    return "Disponible";
  }

  return reservationStatusLabels[result.status];
}

function getSheetsNotes(result: ProcessReservationResult | null): string[] {
  return (
    result?.reviewNotes.filter((note) => note.startsWith("Sheets")) ?? []
  );
}

function getActionLabel(
  result: ProcessReservationResult | null,
  sheetsStatus: GoogleSheetsConfigStatus,
) {
  if (!result) {
    return "Sin acción preparada todavía";
  }

  if (sheetsStatus.mode === "real" && getSheetsNotes(result).length > 0) {
    return "La integración real necesita revisión antes de preparar la acción";
  }

  if (sheetsStatus.connectionStatus === "error") {
    return "La conexión real está configurada, pero necesita corrección antes de operar";
  }

  if (result.workflowState === "pending_review") {
    return "Pendiente de revisión manual antes de responder";
  }

  if (result.status === "sin_disponibilidad") {
    return "Respuesta de no disponibilidad preparada";
  }

  if (sheetsStatus.mode === "real" && result.sheetWritePlan) {
    return "Acción preparada sobre la hoja real";
  }

  if (result.status === "disponible") {
    return "Respuesta comercial preparada para confirmación";
  }

  return "Acción preparada";
}

export function ReservationLab({
  sheetsStatus = DEFAULT_SHEETS_STATUS,
  startEmpty = false,
}: ReservationLabProps) {
  const [selectedSample, setSelectedSample] = useState<SampleKey | null>(
    startEmpty ? null : (demoSampleEmails[0]?.id ?? null),
  );
  const [rawEmail, setRawEmail] = useState<string>(
    startEmpty ? "" : (demoSampleEmails[0]?.content ?? ""),
  );
  const [result, setResult] = useState<ProcessReservationResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const canProcess = rawEmail.trim().length > 0 && !isProcessing;

  const processEmail = async () => {
    if (!rawEmail.trim()) {
      return;
    }

    setError(null);
    setIsProcessing(true);

    try {
      const response = await fetch("/api/demo/process", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          subject: "Solicitud de reserva web",
          rawText: rawEmail,
        }),
      });

      if (!response.ok) {
        throw new Error("No se ha podido procesar la reserva.");
      }

      const payload = (await response.json()) as ProcessReservationResult;
      setResult(payload);
    } catch (processingError) {
      setError(
        processingError instanceof Error
          ? processingError.message
          : "Error desconocido al procesar la reserva.",
      );
    } finally {
      setIsProcessing(false);
    }
  };

  const selectedSampleDefinition =
    demoSampleEmails.find((sample) => sample.id === selectedSample) ?? null;

  return (
    <section className="ops-review-layout">
      <section className="demo-panel demo-reservation-editor ops-review-panel">
        <div className="demo-panel-head">
          <div>
            <p className="demo-kicker">Email recibido</p>
            <h2 className="demo-section-title">Lógica de recepción de emails</h2>
            <p className="demo-subtle">
              {selectedSampleDefinition?.description ??
                "Pega un email real o carga uno de los casos de ejemplo para revisar la solicitud."}
            </p>
          </div>
          <div className="demo-chip-row">
            {demoSampleEmails.map((sample) => (
              <button
                key={sample.id}
                type="button"
                className={`demo-chip demo-chip-button ${
                  selectedSample === sample.id ? "demo-chip-active" : ""
                }`}
                onClick={() => {
                  setSelectedSample(sample.id);
                  setRawEmail(sample.content);
                }}
              >
                {sample.label}
              </button>
            ))}
          </div>
        </div>

        <textarea
          className="demo-textarea demo-textarea-editor"
          value={rawEmail}
          onChange={(event) => {
            setSelectedSample(null);
            setRawEmail(event.target.value);
          }}
          rows={18}
          placeholder="Pega aquí el contenido del email o pulsa uno de los casos precargados."
        />

        {rawEmail.trim().length === 0 ? (
          <p className="demo-subtle">
            Primero pega un email o carga uno de los ejemplos para activar el procesamiento.
          </p>
        ) : null}

        <div className="demo-chat-form-actions">
          <button
            className="demo-button demo-button-primary"
            type="button"
            onClick={processEmail}
            disabled={!canProcess}
          >
            {isProcessing ? "Procesando..." : "Procesar reserva"}
          </button>
        </div>

        {error ? <p className="demo-error">{error}</p> : null}
      </section>

      <section className="demo-panel demo-result-panel ops-review-panel">
        <div className="demo-result-head">
          <div>
            <p className="demo-kicker">Datos detectados</p>
            <h2 className="demo-section-title">Solicitud recibida y revisada</h2>
          </div>
          <span className={`demo-state demo-state-${result?.status ?? "pendiente"}`}>
            {result ? reservationStatusLabels[result.status] : "Esperando email"}
          </span>
        </div>

        {result ? (
          <>
            <dl className="ops-review-list">
              <div>
                <dt>Cliente</dt>
                <dd>{result.parsed.ownerName ?? "Pendiente"}</dd>
              </div>
              <div>
                <dt>Email</dt>
                <dd>{result.parsed.ownerEmail ?? "Pendiente"}</dd>
              </div>
              <div>
                <dt>Teléfono</dt>
                <dd>{result.parsed.phone ?? "Pendiente"}</dd>
              </div>
              <div>
                <dt>WhatsApp</dt>
                <dd>{result.parsed.whatsapp ?? "Pendiente"}</dd>
              </div>
              <div>
                <dt>Entrada</dt>
                <dd>
                  {formatMoment(
                    result.parsed.checkInDate,
                    result.parsed.checkInTime,
                    result.parsed.checkInTurn,
                  )}
                </dd>
              </div>
              <div>
                <dt>Salida</dt>
                <dd>
                  {formatMoment(
                    result.parsed.checkOutDate,
                    result.parsed.checkOutTime,
                    result.parsed.checkOutTurn,
                  )}
                </dd>
              </div>
              <div className="ops-review-list-wide">
                <dt>Mascota/s</dt>
                <dd>
                  {result.parsed.pets && result.parsed.pets.length > 0 ? (
                    <div className="ops-pet-list">
                      {result.parsed.pets.map((pet, index) => (
                        <div key={`${pet.name}-${index}`} className="ops-pet-item">
                          <strong>{pet.name}</strong>
                          <span>
                            {[pet.sex, pet.breed].filter(Boolean).join(" · ") || "Sin detalle"}
                          </span>
                        </div>
                      ))}
                    </div>
                  ) : (
                    result.parsed.petName ?? "Pendiente"
                  )}
                </dd>
              </div>
              <div className="ops-review-list-wide">
                <dt>Flags de revisión</dt>
                <dd>
                  <div className="demo-chip-row">
                    {result.reviewFlags.length > 0 ? (
                      result.reviewFlags.map((flag) => (
                        <span key={flag} className="demo-chip">
                          {reviewFlagLabels[flag] ?? flag}
                        </span>
                      ))
                    ) : (
                      <span className="demo-chip">Sin incidencias</span>
                    )}
                  </div>
                </dd>
              </div>
            </dl>

            <details className="ops-tech-details">
              <summary>Ver detalle técnico</summary>
              <div className="ops-tech-content">
                <div>
                  <p className="demo-result-label">Workflow</p>
                  <p className="demo-result-copy">{result.workflowState}</p>
                </div>
                <div>
                  <p className="demo-result-label">Notas</p>
                  <p className="demo-result-copy">
                    {[sheetsStatus.reason, ...result.reviewNotes].filter(Boolean).length > 0
                      ? [
                          sheetsStatus.connectionReason ?? sheetsStatus.reason,
                          ...result.reviewNotes,
                        ]
                          .filter(Boolean)
                          .join(" ")
                      : "Sin observaciones técnicas."}
                  </p>
                </div>
                <div>
                  <p className="demo-result-label">Google Sheets</p>
                  <p className="demo-result-copy">
                    {sheetsStatus.mode === "real"
                      ? sheetsStatus.connectionReason ??
                        `Adapter real activo · ${sheetsStatus.spreadsheetIdSummary}`
                      : sheetsStatus.reason}
                  </p>
                </div>
                <pre className="demo-json">{JSON.stringify(result, null, 2)}</pre>
              </div>
            </details>
          </>
        ) : (
          <div className="demo-empty-state">
            <p className="demo-result-copy">
              Procesa un email para ver la ficha operativa limpia de la reserva.
            </p>
          </div>
        )}
      </section>

      <section className="demo-panel demo-result-panel ops-review-panel">
        <div className="demo-result-head">
          <div>
            <p className="demo-kicker">Resultado operativo</p>
            <h2 className="demo-section-title">Decisión y acción preparada</h2>
          </div>
          <span className={`demo-state demo-state-${result?.status ?? "pendiente"}`}>
            {getDecision(result)}
          </span>
        </div>

        {result ? (
          <dl className="ops-review-list">
            <div>
              <dt>Disponibilidad</dt>
              <dd>
                {result.availability
                  ? result.availability.isAvailable
                    ? "Disponible"
                    : "Sin disponibilidad"
                  : "Pendiente por revisión manual"}
              </dd>
            </div>
            <div>
              <dt>Precio</dt>
              <dd>{formatCurrency(result.pricing?.total)}</dd>
            </div>
            <div>
              <dt>Decisión</dt>
              <dd>{getDecision(result)}</dd>
            </div>
            <div>
              <dt>Google Sheets</dt>
              <dd>{sheetsStatus.mode}</dd>
            </div>
            <div className="ops-review-list-wide">
              <dt>Estado de la integración</dt>
              <dd>
                {sheetsStatus.mode === "real"
                  ? sheetsStatus.connectionReason ??
                    `Adapter real activo · spreadsheet ${sheetsStatus.spreadsheetIdSummary}`
                  : sheetsStatus.reason}
                {getSheetsNotes(result).length > 0
                  ? ` · ${getSheetsNotes(result).join(" ")}`
                  : ""}
              </dd>
            </div>
            <div className="ops-review-list-wide">
              <dt>Mensaje preparado</dt>
              <dd>
                <pre className="demo-prewrap ops-message-preview">
                  {result.whatsappMessage}
                </pre>
              </dd>
            </div>
            <div className="ops-review-list-wide">
              <dt>Acción preparada o ejecutada</dt>
              <dd>{getActionLabel(result, sheetsStatus)}</dd>
            </div>
          </dl>
        ) : (
          <div className="demo-empty-state">
            <p className="demo-result-copy">
              {sheetsStatus.mode === "real"
                ? `${sheetsStatus.connectionReason ?? `Google Sheets real listo · ${sheetsStatus.spreadsheetIdSummary}`}. Aquí aparecerán la disponibilidad, el precio y la decisión operativa al procesar el email.`
                : `${sheetsStatus.reason} Aquí aparecerán la disponibilidad, el precio y la decisión operativa al procesar el email.`}
            </p>
          </div>
        )}
      </section>
    </section>
  );
}
