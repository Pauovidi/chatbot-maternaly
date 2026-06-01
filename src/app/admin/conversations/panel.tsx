"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Bot,
  CheckCheck,
  Circle,
  Archive,
  ExternalLink,
  Film,
  MessageSquareText,
  RefreshCcw,
  Search,
  Send,
  UserRound,
} from "lucide-react";
import type {
  ConversationDashboard,
  ConversationListFilters,
  ConversationMode,
  ConversationRecord,
} from "@/lib/hotel/conversations/types";

interface ConversationsPanelProps {
  initialDashboard: ConversationDashboard;
  initialLastUpdatedAt?: string;
  initialLoadError?: string;
  llmProvider?: "mock" | "openai";
  sheetsAccessMode?: "read_only" | "dry_run" | "live";
  sheetsWriteEnabled?: boolean;
  whatsAppProviderMode?: "mock" | "ycloud" | "twilio";
}

type FilterMode = NonNullable<ConversationListFilters["mode"]>;
export const CONVERSATION_PANEL_POLL_INTERVAL_MS = 3000;

const filters: Array<{ label: string; value: FilterMode }> = [
  { label: "Todas", value: "all" },
  { label: "Pendientes", value: "pending" },
  { label: "Humano", value: "human" },
  { label: "Bot", value: "bot" },
  { label: "Leídas", value: "read" },
  { label: "Archivadas", value: "archived" },
];

function formatDate(value?: string) {
  if (!value) {
    return "Sin actividad";
  }

  return new Intl.DateTimeFormat("es-ES", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

function formatEventType(value: string) {
  const labels: Record<string, string> = {
    auto_reply_skipped_human_mode: "Bot pausado por modo humano",
    bot_reply_sent: "Respuesta automática enviada",
    conversation_created: "Conversación creada",
    conversation_archived: "Conversación archivada",
    conversation_unarchived: "Conversación restaurada",
    conversation_reopened_from_inbound: "Reabierta por WhatsApp entrante",
    human_requested: "Handoff solicitado",
    client_directory_ambiguous: "Match ambiguo de cliente",
    client_directory_blocked: "Cliente bloqueado en directorio",
    client_directory_match: "Cliente habitual detectado",
    manual_reply_failed: "Respuesta manual fallida",
    manual_reply_sent: "Respuesta manual enviada",
    marked_read: "Marcada como leída",
    media_attachment_mock_requested: "Vídeo mock solicitado",
    mode_changed: "Modo actualizado",
    nlu_classified: "Intent detectado",
    reservation_context_detected: "Reserva detectada",
    maternaly_intent_detected: "Servicio Maternaly detectado",
  };

  return labels[value] ?? value.replaceAll("_", " ");
}

function formatSender(value: string) {
  const labels: Record<string, string> = {
    bot: "Bot",
    human: "Equipo",
    system: "Sistema",
    user: "Cliente",
  };

  return labels[value] ?? value;
}

function formatUpdatedAt(value: string) {
  return new Date(value).toLocaleTimeString("es-ES", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

function conversationTitle(conversation: ConversationRecord) {
  return conversation.clientName ?? conversation.customerName ?? conversation.displayName ?? conversation.phoneE164;
}

function conversationSubtitle(conversation: ConversationRecord) {
  const parts = [
    conversation.phoneE164,
    conversation.clientEmail,
    conversation.serviceDetected ? `Servicio: ${conversation.serviceDetected}` : undefined,
  ].filter(Boolean);

  return parts.join(" · ");
}

export function ConversationsPanel({
  initialDashboard,
  initialLastUpdatedAt = "",
  initialLoadError,
  llmProvider = "mock",
  sheetsAccessMode = "read_only",
  sheetsWriteEnabled = false,
  whatsAppProviderMode = "mock",
}: ConversationsPanelProps) {
  const [dashboard, setDashboard] = useState(initialDashboard);
  const [selectedId, setSelectedId] = useState(
    initialDashboard.conversations[0]?.id ?? "",
  );
  const [query, setQuery] = useState("");
  const [mode, setMode] = useState<FilterMode>("all");
  const [reply, setReply] = useState("");
  const [error, setError] = useState(initialLoadError ?? "");
  const [pollError, setPollError] = useState("");
  const [lastUpdatedAt, setLastUpdatedAt] = useState(initialLastUpdatedAt);
  const [isPending, setIsPending] = useState(false);
  const timelineRef = useRef<HTMLDivElement | null>(null);
  const refreshPromiseRef = useRef<Promise<void> | null>(null);
  const refreshAbortRef = useRef<AbortController | null>(null);
  const modeRef = useRef(mode);
  const queryRef = useRef(query);

  useEffect(() => {
    modeRef.current = mode;
  }, [mode]);

  useEffect(() => {
    queryRef.current = query;
  }, [query]);

  const selected = useMemo(
    () =>
      dashboard.conversations.find((conversation) => conversation.id === selectedId) ??
      dashboard.conversations[0],
    [dashboard.conversations, selectedId],
  );

  function isTimelineNearBottom() {
    const timeline = timelineRef.current;
    if (!timeline) {
      return true;
    }

    return timeline.scrollHeight - timeline.scrollTop - timeline.clientHeight < 96;
  }

  function scrollTimelineToBottom(behavior: ScrollBehavior = "auto") {
    const timeline = timelineRef.current;
    if (!timeline) {
      return;
    }

    if (timeline.scrollHeight <= timeline.clientHeight + 1) {
      timeline.scrollTop = 0;
      return;
    }

    timeline.scrollTo({ top: timeline.scrollHeight, behavior });
  }

  useEffect(() => {
    requestAnimationFrame(() => scrollTimelineToBottom("auto"));
  }, [selected?.id]);

  const refresh = useCallback(async (
    nextMode?: FilterMode,
    nextQuery?: string,
    options: { force?: boolean; silent?: boolean } = {},
  ) => {
    const requestedMode = nextMode ?? modeRef.current;
    const requestedQuery = nextQuery ?? queryRef.current;
    if (refreshPromiseRef.current && !options.force) {
      return refreshPromiseRef.current;
    }

    if (refreshPromiseRef.current && options.force) {
      refreshAbortRef.current?.abort();
      await refreshPromiseRef.current.catch(() => undefined);
    }

    const controller = new AbortController();
    const shouldAutoScroll = isTimelineNearBottom();
    const params = new URLSearchParams();
    if (requestedMode !== "all") {
      params.set("mode", requestedMode);
    }
    if (requestedQuery.trim()) {
      params.set("query", requestedQuery.trim());
    }

    const promise = (async () => {
      const response = await fetch(`/api/conversations?${params.toString()}`, {
        credentials: "same-origin",
        signal: controller.signal,
      });
      const data = (await response.json()) as ConversationDashboard & {
        ok?: boolean;
        error?: string;
      };

      if (!response.ok || data.ok === false) {
        throw new Error(data.error ?? "No se pudo cargar el panel.");
      }

      setDashboard(data);
      setSelectedId((current) =>
        data.conversations.some((conversation) => conversation.id === current)
          ? current
          : data.conversations[0]?.id ?? "",
      );
      setPollError("");
      setLastUpdatedAt(new Date().toISOString());
      if (shouldAutoScroll) {
        requestAnimationFrame(() => scrollTimelineToBottom(options.silent ? "auto" : "smooth"));
      }
    })()
      .catch((caught) => {
        if (caught instanceof DOMException && caught.name === "AbortError") {
          return;
        }

        if (options.silent) {
          setPollError("No se pudo actualizar en segundo plano.");
          return;
        }

        throw caught;
      })
      .finally(() => {
        if (refreshPromiseRef.current === promise) {
          refreshPromiseRef.current = null;
        }
        if (refreshAbortRef.current === controller) {
          refreshAbortRef.current = null;
        }
      });

    refreshPromiseRef.current = promise;
    refreshAbortRef.current = controller;
    return promise;
  }, []);

  useEffect(() => {
    const interval = window.setInterval(() => {
      void refresh(undefined, undefined, { silent: true });
    }, CONVERSATION_PANEL_POLL_INTERVAL_MS);

    function refreshWhenVisible() {
      if (document.visibilityState === "visible") {
        void refresh(undefined, undefined, { force: true, silent: true });
      }
    }

    document.addEventListener("visibilitychange", refreshWhenVisible);
    return () => {
      window.clearInterval(interval);
      document.removeEventListener("visibilitychange", refreshWhenVisible);
      refreshAbortRef.current?.abort();
    };
  }, [refresh]);

  function run(action: () => Promise<void>) {
    setError("");
    setIsPending(true);
    void action()
      .catch((caught) => {
        setError(caught instanceof Error ? caught.message : "Ha fallado la acción.");
      })
      .finally(() => setIsPending(false));
  }

  function changeMode(nextMode: FilterMode) {
    setMode(nextMode);
    run(() => refresh(nextMode, query, { force: true }));
  }

  function search(nextQuery: string) {
    setQuery(nextQuery);
    run(() => refresh(mode, nextQuery, { force: true }));
  }

  async function postAction(path: string, body?: unknown, method = "POST") {
    const response = await fetch(path, {
      method,
      headers: {
        "Content-Type": "application/json",
      },
      credentials: "same-origin",
      body: body ? JSON.stringify(body) : method === "DELETE" ? undefined : "{}",
    });
    const data = (await response.json()) as { ok?: boolean; error?: string };

    if (!response.ok || data.ok === false) {
      throw new Error(data.error ?? "La accion no se pudo completar.");
    }
  }

  function setConversationMode(conversation: ConversationRecord, nextMode: ConversationMode) {
    if (conversation.mode === nextMode) {
      return;
    }

    run(async () => {
      await postAction(
        `/api/conversations/${encodeURIComponent(conversation.id)}/mode`,
        { mode: nextMode },
      );
      await refresh(undefined, undefined, { force: true });
    });
  }

  function markRead(conversation: ConversationRecord) {
    if (conversation.unreadCount === 0 && !conversation.humanRequested) {
      return;
    }

    run(async () => {
      await postAction(
        `/api/conversations/${encodeURIComponent(conversation.id)}/mark-read`,
      );
      await refresh(undefined, undefined, { force: true });
    });
  }

  function sendReply(conversation: ConversationRecord) {
    const body = reply.trim();
    if (!body) {
      setError("Escribe una respuesta antes de enviar.");
      return;
    }

    run(async () => {
      await postAction(
        `/api/conversations/${encodeURIComponent(conversation.id)}/reply`,
        { body },
      );
      setReply("");
      await refresh(undefined, undefined, { force: true });
    });
  }

  function requestVideoMock(conversation: ConversationRecord) {
    run(async () => {
      await postAction(
        `/api/conversations/${encodeURIComponent(conversation.id)}/media-mock`,
        { kind: "video" },
      );
      await refresh(undefined, undefined, { force: true });
    });
  }

  function archiveSelectedConversation(conversation: ConversationRecord) {
    run(async () => {
      await postAction(
        `/api/conversations/${encodeURIComponent(conversation.id)}/archive`,
        { reason: "inbox_cleanup" },
      );
      await refresh(undefined, undefined, { force: true });
    });
  }

  function unarchiveSelectedConversation(conversation: ConversationRecord) {
    run(async () => {
      await postAction(
        `/api/conversations/${encodeURIComponent(conversation.id)}/archive`,
        undefined,
        "DELETE",
      );
      await refresh("archived", undefined, { force: true });
    });
  }

  return (
    <section className="conversations-panel" aria-busy={isPending}>
      <div className="conversation-panel-toolbar">
        <div className="conversation-panel-actions">
          <Link href="/admin/registro-entrada" className="conversation-top-link">
            Registro de entrada
            <ExternalLink size={14} />
          </Link>
        </div>
        <details className="conversation-technical-status">
          <summary>Estado técnico</summary>
          <span className={`conversation-transport conversation-transport-${whatsAppProviderMode}`}>
            <Circle size={10} fill="currentColor" />
            Proveedor: WhatsApp · {formatProviderMode(whatsAppProviderMode)}
          </span>
          <span className="conversation-transport conversation-transport-mock">
            <Circle size={10} fill="currentColor" />
            LLM: {llmProvider === "mock" ? "Mock" : "OpenAI"}
          </span>
          <span className="conversation-transport conversation-transport-mock">
            <Circle size={10} fill="currentColor" />
            Sheets: {formatSheetsAccessMode(sheetsAccessMode)}
          </span>
          <span className="conversation-transport conversation-transport-mock">
            <Circle size={10} fill="currentColor" />
            Writes: {sheetsWriteEnabled ? "activados" : "bloqueados"}
          </span>
        </details>
      </div>

      <div className="conversation-workspace">
        <aside className="conversation-sidebar">
          <div className="conversation-sidebar-brand">
            <div>
              <strong>Inbox WhatsApp Maternaly</strong>
              <small>Servicios, reservas y handoffs</small>
            </div>
          </div>

          <div className="conversation-metrics">
            <Metric label="Pendientes" value={dashboard.stats.pending} />
            <Metric label="Humano" value={dashboard.stats.human} />
            <Metric label="Activas" value={dashboard.stats.total} />
            <Metric label="Leídas" value={dashboard.stats.read} />
          </div>

          <div className="conversation-toolbar">
            <label className="conversation-search">
              <Search size={17} aria-hidden="true" />
              <input
                value={query}
                onChange={(event) => search(event.target.value)}
                placeholder="Buscar teléfono, nombre o servicio"
              />
            </label>
            <button
              className="conversation-refresh-button"
              type="button"
              onClick={() => run(() => refresh())}
              title="Actualizar"
              aria-label="Actualizar"
              disabled={isPending}
            >
              <RefreshCcw size={17} />
              Actualizar
            </button>
          </div>
          <div className="conversation-poll-status" role="status" aria-live="polite">
            {pollError ||
              (lastUpdatedAt
                ? `Actualizado ${formatUpdatedAt(lastUpdatedAt)}`
                : "Actualizado")}
          </div>
          {error ? <div className="conversation-error">{error}</div> : null}

          <div className="conversation-tabs" role="tablist" aria-label="Filtros">
            {filters.map((filter) => (
              <button
                key={filter.value}
                className={mode === filter.value ? "is-active" : ""}
                type="button"
                onClick={() => changeMode(filter.value)}
                disabled={isPending && mode === filter.value}
              >
                {filter.label}
              </button>
            ))}
          </div>

          <div className="conversation-list">
            {isPending ? (
              <div className="conversation-loading">Actualizando inbox...</div>
            ) : null}
            {dashboard.conversations.length === 0 ? (
              <div className="conversation-empty">
                <strong>Aún no hay conversaciones.</strong>
                <span>
                  El panel está listo en modo seguro y mostrará aquí los próximos mensajes de WhatsApp.
                </span>
              </div>
            ) : (
              dashboard.conversations.map((conversation) => (
                <button
                  key={conversation.id}
                  className={`conversation-list-item ${
                    selected?.id === conversation.id ? "is-selected" : ""
                  }`}
                  type="button"
                  onClick={() => setSelectedId(conversation.id)}
                >
                  <span className="conversation-list-main">
                    <span className="conversation-list-title-row">
                      <strong>{conversationTitle(conversation)}</strong>
                      <time>{formatDate(conversation.updatedAt)}</time>
                    </span>
                    <span className="conversation-list-subtitle">
                      {conversationSubtitle(conversation)}
                    </span>
                    <ClientBadges conversation={conversation} compact />
                    <small>{conversation.lastMessagePreview ?? "Sin mensajes todavía"}</small>
                  </span>
                  <span className="conversation-list-meta">
                    <ModeBadge mode={conversation.mode} />
                    {conversation.unreadCount > 0 ? (
                      <b>{conversation.unreadCount}</b>
                    ) : null}
                  </span>
                </button>
              ))
            )}
          </div>
        </aside>

        <div className="conversation-detail">
          {selected ? (
            <>
              <header className="conversation-detail-header">
                <div className="conversation-contact-summary">
                  <div className="conversation-contact-title-row">
                    <h2>{conversationTitle(selected)}</h2>
                    <ModeBadge mode={selected.mode} />
                    <ClientBadges conversation={selected} compact />
                  </div>
                  <span>
                    {selected.phoneE164}
                    {selected.serviceDetected ? ` · Servicio: ${selected.serviceDetected}` : ""}
                  </span>
                </div>
                <div className="conversation-actions">
                  {selected.unreadCount > 0 || selected.humanRequested ? (
                    <button
                      type="button"
                      onClick={() => markRead(selected)}
                      disabled={isPending}
                    >
                      <CheckCheck size={16} />
                      Marcar como leído
                    </button>
                  ) : null}
                  {selected.archivedAt ? (
                    <button
                      type="button"
                      onClick={() => unarchiveSelectedConversation(selected)}
                      disabled={isPending}
                    >
                      <RefreshCcw size={16} />
                      Restaurar
                    </button>
                  ) : selected.mode === "bot" ? (
                    <button
                      type="button"
                      onClick={() => setConversationMode(selected, "human")}
                      disabled={isPending}
                    >
                      <UserRound size={16} />
                      Tomar conversación
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={() => setConversationMode(selected, "bot")}
                      disabled={isPending}
                    >
                      <Bot size={16} />
                      Devolver al bot
                    </button>
                  )}
                  {!selected.archivedAt ? (
                    <button
                      type="button"
                      onClick={() => archiveSelectedConversation(selected)}
                      disabled={isPending}
                    >
                      <Archive size={16} />
                      Archivar
                    </button>
                  ) : null}
                </div>
              </header>

              <details className="conversation-context-details">
                <summary>Contexto</summary>
                <div className="conversation-status-row">
                  <span>{selected.humanRequested ? "Handoff solicitado" : "Sin handoff"}</span>
                  <span>{selected.unreadCount} no leídos</span>
                  <span>{selected.channel ?? selected.sourceType}</span>
                  <span>{selected.messages.length} mensajes</span>
                  <span>{selected.events.length} eventos</span>
                  <span>Última actividad {formatDate(selected.updatedAt)}</span>
                  {selected.clientEmail ? <span>{selected.clientEmail}</span> : null}
                  {selected.reservationId ? <span>Reserva: {selected.reservationId}</span> : null}
                  {selected.assignedAgent ? <span>{selected.assignedAgent}</span> : null}
                  <span>{selected.sheetSource ? `Sheet conectado: ${selected.sheetSource}` : "Sheet pendiente"}</span>
                  {selected.sheetRange ? <span>Rango: {selected.sheetRange}</span> : null}
                  <span>Reserva: {selected.maternalyReservationStatus ?? "none"}</span>
                  <span>Pago: {selected.maternalyPaymentStatus ?? "none"}</span>
                  <span>Factura: {selected.maternalyInvoiceStatus ?? "none"}</span>
                  <span>
                    {selected.maternalyReviewStatus === "manual_review_required"
                      ? "Revisión manual"
                      : "Bot activo"}
                  </span>
                </div>
              </details>

              {selected.clientWarnings?.length ? (
                <div className="conversation-client-alerts">
                  {selected.clientWarnings.map((warning) => (
                    <span key={warning}>{warning}</span>
                  ))}
                </div>
              ) : null}
              <div className="conversation-timeline" ref={timelineRef}>
                {[...selected.messages, ...selected.events]
                  .filter((item) => !("eventType" in item) || item.eventType !== "nlu_classified")
                  .sort((left, right) => left.createdAt.localeCompare(right.createdAt))
                  .map((item) =>
                    "body" in item ? (
                      <div
                        key={item.id}
                        className={`conversation-message is-${item.direction} from-${item.senderType}`}
                      >
                        <span>
                          {formatSender(item.senderType)} · {formatDate(item.createdAt)}
                        </span>
                        <p>{item.body}</p>
                      </div>
                    ) : (
                      <div key={item.id} className="conversation-event">
                        <MessageSquareText size={14} />
                        <span>
                          {formatEventType(item.eventType)} · {formatDate(item.createdAt)}
                        </span>
                      </div>
                    ),
                  )}
              </div>

              <div className="conversation-composer">
                <label className="conversation-composer-field">
                  <span>Respuesta manual del equipo</span>
                  <textarea
                    value={reply}
                    onChange={(event) => setReply(event.target.value)}
                    placeholder="Escribe una respuesta clara para WhatsApp"
                    rows={3}
                    maxLength={1200}
                    disabled={isPending}
                  />
                </label>
                <div className="conversation-composer-actions">
                  <button
                    className="conversation-send-button"
                    type="button"
                    onClick={() => sendReply(selected)}
                    disabled={isPending || !reply.trim() || Boolean(selected.archivedAt)}
                  >
                    <Send size={17} />
                    Enviar
                  </button>
                  <button
                    className="conversation-video-mock-button"
                    type="button"
                    onClick={() => requestVideoMock(selected)}
                    disabled={isPending || Boolean(selected.archivedAt)}
                    title="Mock: requiere almacenamiento de archivos"
                  >
                    <Film size={17} />
                    Adjuntar vídeo
                    <small>Mock</small>
                  </button>
                </div>
                <small className="conversation-composer-hint">
                  {whatsAppProviderMode === "mock"
                    ? "Modo demo: se guarda en el timeline, no sale por WhatsApp real."
                    : whatsAppProviderMode === "ycloud"
                      ? "YCloud configurado como provider principal: revisa el mensaje antes de enviarlo."
                      : "Twilio Sandbox activo: revisa el mensaje antes de enviarlo."}
                </small>
              </div>
            </>
          ) : (
            <div className="conversation-empty conversation-empty-large">
              <strong>Aún no hay conversaciones.</strong>
              <span>Cuando llegue el primer mensaje, aparecerá aquí el timeline.</span>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}

function formatProviderMode(mode: NonNullable<ConversationsPanelProps["whatsAppProviderMode"]>) {
  const labels: Record<NonNullable<ConversationsPanelProps["whatsAppProviderMode"]>, string> = {
    mock: "Mock",
    twilio: "Twilio Sandbox",
    ycloud: "YCloud",
  };

  return labels[mode];
}

function formatSheetsAccessMode(mode: NonNullable<ConversationsPanelProps["sheetsAccessMode"]>) {
  const labels: Record<NonNullable<ConversationsPanelProps["sheetsAccessMode"]>, string> = {
    dry_run: "dry-run",
    live: "live",
    read_only: "read-only",
  };

  return labels[mode];
}

function Metric({ label, value }: { label: string; value: number }) {
  return (
    <div className="conversation-metric">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function ModeBadge({ mode }: { mode: ConversationMode }) {
  return (
    <span className={`conversation-mode conversation-mode-${mode}`}>
      {mode === "human" ? "Humano" : "Bot"}
    </span>
  );
}

function ClientBadges({
  conversation,
  compact = false,
}: {
  conversation: ConversationRecord;
  compact?: boolean;
}) {
  const status = conversation.clientStatus ?? "unknown";
  const labels: Record<typeof status, string> = {
    ambiguous: "Revisión manual",
    blocked: "Revisión manual",
    known: "Cliente habitual",
    unknown: "Nuevo contacto",
  };

  return (
    <span className={`conversation-client-badges ${compact ? "is-compact" : ""}`}>
      <span className={`conversation-client-badge conversation-client-${status}`}>
        {labels[status]}
      </span>
      {conversation.clientSource ? (
        <span className="conversation-client-badge conversation-client-source">
          Directorio
        </span>
      ) : null}
    </span>
  );
}
