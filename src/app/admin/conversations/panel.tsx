"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import {
  Bot,
  CheckCheck,
  Circle,
  ExternalLink,
  MessageSquareText,
  PawPrint,
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
  twilioMode: "mock" | "real";
}

type FilterMode = NonNullable<ConversationListFilters["mode"]>;

const filters: Array<{ label: string; value: FilterMode }> = [
  { label: "Todas", value: "all" },
  { label: "Pendientes", value: "pending" },
  { label: "Humano", value: "human" },
  { label: "Bot", value: "bot" },
  { label: "Leídas", value: "read" },
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
    human_requested: "Handoff solicitado",
    manual_reply_failed: "Respuesta manual fallida",
    manual_reply_sent: "Respuesta manual enviada",
    marked_read: "Marcada como leída",
    mode_changed: "Modo actualizado",
    reservation_context_detected: "Reserva detectada",
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

function conversationTitle(conversation: ConversationRecord) {
  return conversation.customerName ?? conversation.displayName ?? conversation.phoneE164;
}

function conversationSubtitle(conversation: ConversationRecord) {
  const parts = [
    conversation.phoneE164,
    conversation.petName ? `Mascota: ${conversation.petName}` : undefined,
  ].filter(Boolean);

  return parts.join(" · ");
}

export function ConversationsPanel({
  initialDashboard,
  twilioMode,
}: ConversationsPanelProps) {
  const [dashboard, setDashboard] = useState(initialDashboard);
  const [selectedId, setSelectedId] = useState(
    initialDashboard.conversations[0]?.id ?? "",
  );
  const [query, setQuery] = useState("");
  const [mode, setMode] = useState<FilterMode>("all");
  const [reply, setReply] = useState("");
  const [error, setError] = useState("");
  const [isPending, setIsPending] = useState(false);

  const selected = useMemo(
    () =>
      dashboard.conversations.find((conversation) => conversation.id === selectedId) ??
      dashboard.conversations[0],
    [dashboard.conversations, selectedId],
  );

  async function refresh(nextMode = mode, nextQuery = query) {
    const params = new URLSearchParams();
    if (nextMode !== "all") {
      params.set("mode", nextMode);
    }
    if (nextQuery.trim()) {
      params.set("query", nextQuery.trim());
    }

    const response = await fetch(`/api/conversations?${params.toString()}`, {
      credentials: "same-origin",
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
  }

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
    run(() => refresh(nextMode, query));
  }

  function search(nextQuery: string) {
    setQuery(nextQuery);
    run(() => refresh(mode, nextQuery));
  }

  async function postAction(path: string, body?: unknown) {
    const response = await fetch(path, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      credentials: "same-origin",
      body: body ? JSON.stringify(body) : "{}",
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
      await refresh();
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
      await refresh();
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
      await refresh();
    });
  }

  return (
    <section className="conversations-panel" aria-busy={isPending}>
      <header className="conversation-panel-hero">
        <div className="conversation-panel-title">
          <span className="conversation-brand-mark conversation-brand-mark-large">
            <PawPrint size={22} />
          </span>
          <div>
            <p className="demo-kicker">Somos Muy Perros</p>
            <h2>Panel de conversaciones</h2>
            <span>Inbox WhatsApp para reservas, estancias y handoffs del equipo.</span>
          </div>
        </div>
        <div className="conversation-panel-actions">
          <span className={`conversation-transport conversation-transport-${twilioMode}`}>
            <Circle size={10} fill="currentColor" />
            {twilioMode === "mock" ? "Modo demo" : "Twilio real"}
          </span>
          <Link href="/" className="conversation-top-link">
            Chat web
            <ExternalLink size={14} />
          </Link>
          <Link href="/admin" className="conversation-top-link">
            Admin reservas
            <ExternalLink size={14} />
          </Link>
        </div>
      </header>

      <div className="conversation-workspace">
        <aside className="conversation-sidebar">
          <div className="conversation-sidebar-brand">
            <span className="conversation-brand-mark">
              <PawPrint size={18} />
            </span>
            <div>
              <strong>Somos Muy Perros</strong>
              <small>Panel conversaciones</small>
            </div>
          </div>

          <div className="conversation-metrics">
            <Metric label="Pendientes" value={dashboard.stats.pending} />
            <Metric label="En humano" value={dashboard.stats.human} />
            <Metric label="Activas" value={dashboard.stats.total} />
            <Metric label="Leídas" value={dashboard.stats.read} />
          </div>

          <div className="conversation-toolbar">
            <label className="conversation-search">
              <Search size={17} aria-hidden="true" />
              <input
                value={query}
                onChange={(event) => search(event.target.value)}
                placeholder="Buscar teléfono, nombre o mascota"
              />
            </label>
            <button
              className="conversation-icon-button"
              type="button"
              onClick={() => run(() => refresh())}
              title="Actualizar"
              aria-label="Actualizar"
              disabled={isPending}
            >
              <RefreshCcw size={17} />
            </button>
          </div>

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

          <Link className="conversation-admin-link" href="/admin">
            Ver panel operativo de reservas
          </Link>

          <div className="conversation-list">
            {isPending ? (
              <div className="conversation-loading">Actualizando inbox...</div>
            ) : null}
            {dashboard.conversations.length === 0 ? (
              <div className="conversation-empty">
                <strong>No hay conversaciones para este filtro.</strong>
                <span>Prueba con otro filtro o espera al siguiente WhatsApp entrante.</span>
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
                <div>
                  <p className="demo-kicker">Conversación WhatsApp</p>
                  <h2>{conversationTitle(selected)}</h2>
                  <span>
                    {selected.phoneE164}
                    {selected.petName ? ` · Mascota: ${selected.petName}` : ""}
                    {selected.reservationId ? ` · Reserva: ${selected.reservationId}` : ""}
                    {selected.assignedAgent ? ` · ${selected.assignedAgent}` : ""}
                  </span>
                </div>
                <div className="conversation-actions">
                  <ModeBadge mode={selected.mode} />
                  <button
                    type="button"
                    onClick={() => markRead(selected)}
                    disabled={isPending || (selected.unreadCount === 0 && !selected.humanRequested)}
                  >
                    <CheckCheck size={16} />
                    Marcar como leído
                  </button>
                  <button
                    type="button"
                    onClick={() => setConversationMode(selected, "human")}
                    disabled={isPending || selected.mode === "human"}
                  >
                    <UserRound size={16} />
                    Tomar conversación
                  </button>
                  <button
                    type="button"
                    onClick={() => setConversationMode(selected, "bot")}
                    disabled={isPending || selected.mode === "bot"}
                  >
                    <Bot size={16} />
                    Devolver al bot
                  </button>
                </div>
              </header>

              <div className="conversation-status-row">
                <span>{selected.humanRequested ? "Handoff solicitado" : "Sin handoff"}</span>
                <span>{selected.unreadCount} no leídos</span>
                <span>{selected.channel ?? selected.sourceType}</span>
                <span>{selected.messages.length} mensajes</span>
                <span>{selected.events.length} eventos</span>
                <span>Última actividad {formatDate(selected.updatedAt)}</span>
              </div>

              {error ? <div className="conversation-error">{error}</div> : null}
              <div className={`conversation-transport conversation-transport-${twilioMode}`}>
                <Circle size={10} fill="currentColor" />
                {twilioMode === "mock"
                  ? "Modo demo: los mensajes no se envían por WhatsApp real."
                  : "Twilio real configurado para respuestas manuales."}
              </div>

              <div className="conversation-timeline">
                {[...selected.messages, ...selected.events]
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
                  <small>
                    {twilioMode === "mock"
                      ? "Modo demo: se guarda en el timeline, no sale por WhatsApp real."
                      : "Twilio real activo: revisa el mensaje antes de enviarlo."}
                  </small>
                </label>
                <button
                  type="button"
                  onClick={() => sendReply(selected)}
                  disabled={isPending || !reply.trim()}
                >
                  <Send size={17} />
                  Enviar
                </button>
              </div>
            </>
          ) : (
            <div className="conversation-empty conversation-empty-large">
              Selecciona o crea una conversación demo para empezar.
            </div>
          )}
        </div>
      </div>
    </section>
  );
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
