"use client";

import { MessageCircle, RotateCcw, Send, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import {
  getMaternalyChatWelcomeMessage,
  MATERNALY_CHAT_QUICK_ACTIONS,
  resolveMaternalyChatReply,
} from "@/lib/maternaly/public-chat";
import type { MaternalyChatAction } from "@/lib/maternaly/public-chat";

type ChatMessage = {
  role: "user" | "assistant";
  text: string;
  actions?: MaternalyChatAction[];
};

interface PublicChatWidgetProps {
  floating?: boolean;
}

function getInitialMessages(): ChatMessage[] {
  return [{ role: "assistant", text: getMaternalyChatWelcomeMessage() }];
}

export function PublicChatWidget({
  floating = false,
}: PublicChatWidgetProps) {
  const timeoutRef = useRef<number | null>(null);
  const messagesContainerRef = useRef<HTMLDivElement | null>(null);
  const bottomRef = useRef<HTMLDivElement | null>(null);
  const shouldAutoScrollRef = useRef(true);
  const [isOpen, setIsOpen] = useState(!floating);
  const [loading, setLoading] = useState(false);
  const [input, setInput] = useState("");
  const [messages, setMessages] = useState<ChatMessage[]>(() => getInitialMessages());

  function isNearBottom() {
    const container = messagesContainerRef.current;
    if (!container) {
      return true;
    }

    const distanceFromBottom =
      container.scrollHeight - container.scrollTop - container.clientHeight;
    return distanceFromBottom <= 72;
  }

  function scrollToBottom(behavior: ScrollBehavior = "smooth") {
    bottomRef.current?.scrollIntoView({ behavior, block: "end" });
  }

  useEffect(() => {
    return () => {
      if (timeoutRef.current !== null) {
        window.clearTimeout(timeoutRef.current);
      }
    };
  }, []);

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    if (!shouldAutoScrollRef.current && !loading) {
      return;
    }

    const frame = window.requestAnimationFrame(() => {
      scrollToBottom(messages.length <= 1 && !loading ? "auto" : "smooth");
    });

    return () => window.cancelAnimationFrame(frame);
  }, [isOpen, loading, messages]);

  function resetChat() {
    if (timeoutRef.current !== null) {
      window.clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }

    shouldAutoScrollRef.current = true;
    setLoading(false);
    setInput("");
    setMessages(getInitialMessages());
  }

  function queueAssistantReply(text: string) {
    const reply = resolveMaternalyChatReply(text);

    timeoutRef.current = window.setTimeout(() => {
      setMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          text: reply.text,
          actions: reply.actions,
        },
      ]);
      setLoading(false);
      timeoutRef.current = null;
    }, 320);
  }

  function sendMessage(text: string) {
    if (loading || !text.trim()) {
      return;
    }

    shouldAutoScrollRef.current = true;
    setMessages((prev) => [...prev, { role: "user", text }]);
    setInput("");
    setLoading(true);
    queueAssistantReply(text);
  }

  const widgetCard = (
    <div className="flex h-[min(72vh,640px)] w-full flex-col overflow-hidden rounded-[30px] border border-[var(--primary-border)] bg-white shadow-[0_24px_80px_rgba(110,63,92,0.14)]">
      <div className="flex items-center justify-between border-b border-[var(--primary-border)] bg-[var(--primary-soft)] px-5 py-4">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-[var(--primary-muted)]">
            WhatsApp V1
          </p>
          <p className="text-sm font-semibold text-[var(--primary-text)]">Maternaly</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={resetChat}
            className="inline-flex items-center gap-1 rounded-full border border-[var(--primary-border)] bg-white px-3 py-1.5 text-xs font-medium text-[var(--primary-text)] transition-colors hover:bg-[var(--primary-soft-2)]"
          >
            <RotateCcw size={12} />
            Reiniciar chat
          </button>
          {floating ? (
            <button
              type="button"
              onClick={() => setIsOpen(false)}
              aria-label="Cerrar chat"
              className="text-[var(--primary-text)]"
            >
              <X size={16} />
            </button>
          ) : null}
        </div>
      </div>

      <div
        ref={messagesContainerRef}
        className="flex-1 space-y-3 overflow-y-auto bg-[var(--primary-soft-2)] p-5"
        onScroll={() => {
          shouldAutoScrollRef.current = isNearBottom();
        }}
      >
        {messages.map((message, index) => (
          <div
            key={`${message.role}-${index}`}
            className={`max-w-[90%] space-y-3 rounded-[24px] px-4 py-3.5 text-sm leading-6 whitespace-pre-line ${
              message.role === "user"
                ? "ml-auto bg-[var(--primary)] text-white"
                : "border border-[var(--primary-border)] bg-white text-[var(--primary-ink)] shadow-[0_6px_20px_rgba(110,63,92,0.08)]"
            }`}
          >
            <p>{message.text}</p>
            {message.actions?.length ? (
              <div className="flex flex-wrap gap-2">
                {message.actions.map((action) => (
                  <a
                    key={`${action.label}-${action.url}`}
                    href={action.url}
                    className="rounded-full border border-[var(--primary-border)] bg-[var(--primary-soft)] px-3 py-1.5 text-[11px] font-semibold uppercase tracking-[0.14em] text-[var(--primary-text)] transition-colors hover:bg-[var(--primary-soft-2)]"
                  >
                    {action.label}
                  </a>
                ))}
              </div>
            ) : null}
          </div>
        ))}
        {loading ? (
          <p className="text-xs uppercase tracking-[0.18em] text-[var(--primary-muted)]">
            Escribiendo...
          </p>
        ) : null}
        <div ref={bottomRef} aria-hidden="true" />
      </div>

      <div className="border-t border-[var(--primary-border)] bg-white p-4">
        <p className="mb-3 text-[11px] font-semibold uppercase tracking-[0.22em] text-[var(--primary-muted)]">
          Preguntas rápidas
        </p>
        <div className="mb-4 flex flex-wrap gap-2">
          {MATERNALY_CHAT_QUICK_ACTIONS.map((action) => (
            <button
              key={action}
              type="button"
              className="rounded-full border border-[var(--primary-border)] bg-[var(--primary-soft)] px-3 py-2 text-xs font-medium text-[var(--primary-text)] transition-colors hover:bg-[var(--primary-soft-2)]"
              onClick={() => sendMessage(action)}
              disabled={loading}
            >
              {action}
            </button>
          ))}
        </div>

        <form
          className="flex items-center gap-2"
          onSubmit={(event) => {
            event.preventDefault();
            sendMessage(input);
          }}
        >
          <input
            className="public-chat-input h-12 flex-1 rounded-2xl border border-[var(--primary-border)] bg-white px-4 text-sm text-[var(--primary-ink)] outline-none transition-colors placeholder:text-[var(--primary-muted)] focus:border-[var(--primary)]"
            value={input}
            onChange={(event) => setInput(event.target.value)}
            placeholder="Escribe tu duda sobre servicios Maternaly"
            disabled={loading}
          />
          <button
            type="submit"
            className="public-chat-send-button inline-flex h-12 items-center justify-center gap-2 rounded-2xl bg-[var(--primary)] px-4 text-sm font-semibold text-white transition-transform hover:-translate-y-0.5 disabled:opacity-60"
            disabled={loading}
          >
            <Send size={16} />
            Enviar
          </button>
        </form>
      </div>
    </div>
  );

  if (!floating) {
    return widgetCard;
  }

  return (
    <div className="fixed bottom-6 right-6 z-50">
      {isOpen ? <div className="mb-3 w-[340px]">{widgetCard}</div> : null}

      <button
        type="button"
        onClick={() => {
          shouldAutoScrollRef.current = true;
          setIsOpen((prev) => !prev);
        }}
        className="flex h-14 w-14 items-center justify-center rounded-full bg-[var(--primary)] text-white shadow-lg"
        aria-label="Abrir chat"
      >
        <MessageCircle size={24} />
      </button>
    </div>
  );
}
