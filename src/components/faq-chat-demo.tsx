"use client";

import { useState } from "react";
import { demoFaqQuickPrompts } from "@/components/demo-data";
import { getFaqSectionById } from "@/lib/hotel/content/faq";
import {
  type FaqAction,
  type FaqOutputType,
  type FaqRuntimeLinks,
  resolveFaqQuery,
} from "@/lib/hotel/faq";

type ChatMessage = {
  id: number;
  role: "bot" | "user";
  text: string;
  actions?: FaqAction[];
  meta?: {
    intent: string;
    category: string;
    outputType: FaqOutputType;
    score: number;
    usedFallback: boolean;
  };
};

interface FaqChatDemoProps {
  debugAvailable?: boolean;
  runtimeLinks?: Partial<FaqRuntimeLinks>;
}

const initialMessages: ChatMessage[] = [
  {
    id: 1,
    role: "bot",
    text: "Hola, soy el asistente FAQ de la demo. Respondo con un catálogo controlado y, si la consulta necesita disponibilidad real o revisión humana, te lo indico sin improvisar.",
  },
];

function getOutputLabel(outputType: FaqOutputType) {
  if (outputType === "workflow") {
    return "workflow";
  }

  if (outputType === "handoff") {
    return "humano";
  }

  return "faq";
}

export function FaqChatDemo({
  debugAvailable = false,
  runtimeLinks,
}: FaqChatDemoProps) {
  const [messages, setMessages] = useState<ChatMessage[]>(initialMessages);
  const [question, setQuestion] = useState("");
  const [showDebug, setShowDebug] = useState(false);

  const sendQuestion = (value: string) => {
    const trimmed = value.trim();
    if (!trimmed) {
      return;
    }

    const resolution = resolveFaqQuery(trimmed, runtimeLinks);
    const categoryTitle =
      getFaqSectionById(resolution.category)?.title ?? resolution.category;

    setMessages((current) => [
      ...current,
      {
        id: (current.at(-1)?.id ?? 0) + 1,
        role: "user",
        text: trimmed,
      },
      {
        id: (current.at(-1)?.id ?? 0) + 2,
        role: "bot",
        text: resolution.reply,
        actions: resolution.actions,
        meta: {
          intent: resolution.intent,
          category: categoryTitle,
          outputType: resolution.outputType,
          score: resolution.score,
          usedFallback: resolution.usedFallback,
        },
      },
    ]);
    setQuestion("");
  };

  const latestDebugMessage = [...messages]
    .reverse()
    .find((message) => message.role === "bot" && message.meta);

  return (
    <section className="demo-panel demo-chat">
      <div className="demo-chat-head">
        <div>
          <p className="demo-kicker">FAQ controlada</p>
          <h2 className="demo-section-title">Intents cerrados y routing seguro</h2>
          <p className="demo-subtle">
            Si la duda es FAQ pura, respondemos. Si pide hueco o reserva, la
            enviamos al workflow. Si el caso es especial, pasa a humano.
          </p>
        </div>
        <div className="demo-chat-head-actions">
          {debugAvailable ? (
            <button
              type="button"
              className={`demo-chip demo-chip-button ${
                showDebug ? "demo-chip-active" : ""
              }`}
              onClick={() => setShowDebug((current) => !current)}
            >
              {showDebug ? "Ocultar debug demo" : "Ver debug demo"}
            </button>
          ) : null}
        </div>
      </div>

      {showDebug && latestDebugMessage?.meta ? (
        <div className="demo-debug-panel">
          <div className="demo-debug-grid">
            <div>
              <span>Intent detectado</span>
              <strong>{latestDebugMessage.meta.intent}</strong>
            </div>
            <div>
              <span>Categoría</span>
              <strong>{latestDebugMessage.meta.category}</strong>
            </div>
            <div>
              <span>Salida</span>
              <strong>{getOutputLabel(latestDebugMessage.meta.outputType)}</strong>
            </div>
            <div>
              <span>Score</span>
              <strong>{latestDebugMessage.meta.score}</strong>
            </div>
          </div>
          <p className="demo-subtle">
            El panel de debug solo aparece en modo demo para enseñar cómo se
            enruta cada consulta.
          </p>
        </div>
      ) : null}

      <div className="demo-chat-stream" aria-live="polite">
        {messages.map((message) => (
          <div
            key={message.id}
            className={`demo-chat-bubble ${
              message.role === "bot"
                ? "demo-chat-bubble-bot"
                : "demo-chat-bubble-user"
            }`}
          >
            <p className="demo-chat-copy">{message.text}</p>

            {message.actions?.length ? (
              <div className="demo-chat-bubble-actions">
                {message.actions.map((action) => (
                  <a
                    key={`${message.id}-${action.url}`}
                    className="demo-button demo-button-secondary"
                    href={action.url}
                  >
                    {action.label}
                  </a>
                ))}
              </div>
            ) : null}

            {showDebug && message.meta ? (
              <div className="demo-chat-meta">
                <span className="demo-badge">{message.meta.intent}</span>
                <span className="demo-badge">{message.meta.category}</span>
                <span
                  className={`demo-badge demo-badge-${message.meta.outputType}`}
                >
                  {getOutputLabel(message.meta.outputType)}
                </span>
                {message.meta.usedFallback ? (
                  <span className="demo-badge">fallback</span>
                ) : null}
              </div>
            ) : null}
          </div>
        ))}
      </div>

      <div className="demo-chat-quickstart">
        <div>
          <p className="demo-kicker">Ejemplos rápidos</p>
          <p className="demo-subtle">
            Prueba preguntas FAQ, consultas con workflow y casos que van a
            humano.
          </p>
        </div>
        <div className="demo-chip-row">
          {demoFaqQuickPrompts.map((prompt) => (
            <button
              key={prompt.key}
              type="button"
              className="demo-chip demo-chip-button"
              onClick={() => sendQuestion(prompt.question)}
            >
              {prompt.label}
            </button>
          ))}
        </div>
      </div>

      <form
        className="demo-chat-form"
        onSubmit={(event) => {
          event.preventDefault();
          sendQuestion(question);
        }}
      >
        <label className="sr-only" htmlFor="faq-question">
          Escribe tu pregunta
        </label>
        <textarea
          id="faq-question"
          className="demo-textarea demo-textarea-chat"
          placeholder="Escribe aquí una duda del cliente: precios, vacunas, fechas, comportamiento..."
          value={question}
          onChange={(event) => setQuestion(event.target.value)}
          rows={4}
        />
        <div className="demo-chat-form-actions">
          <button className="demo-button demo-button-primary" type="submit">
            Probar intent
          </button>
          <button
            className="demo-button demo-button-secondary"
            type="button"
            onClick={() =>
              sendQuestion("Mi perro es muy especial, te puedo llamar y contarte")
            }
          >
            Ver derivación a humano
          </button>
        </div>
      </form>
    </section>
  );
}
