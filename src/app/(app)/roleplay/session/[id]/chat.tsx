"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Send } from "lucide-react";
import { Alert, Button } from "@/components/ui";
import { cn } from "@/lib/utils";
import { finishRoleplay } from "../../actions";

interface Msg {
  role: "rep" | "customer";
  content: string;
  pending?: boolean;
}

/** Hide end/error markers while text streams in. */
function visible(text: string) {
  const i = text.indexOf("[[");
  return (i === -1 ? text : text.slice(0, i)).trimEnd();
}

export function RoleplayChat({
  sessionId,
  initial,
  status,
  maxTurns,
  customerName,
}: {
  sessionId: string;
  initial: Msg[];
  status: string;
  maxTurns: number;
  customerName: string;
}) {
  const router = useRouter();
  const [messages, setMessages] = useState<Msg[]>(initial);
  const [input, setInput] = useState("");
  const [streaming, setStreaming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [grading, startGrading] = useTransition();
  const bottomRef = useRef<HTMLDivElement>(null);
  const autoGraded = useRef(false);

  const repTurns = messages.filter((m) => m.role === "rep" && !m.pending).length;
  const ended = status !== "active";

  // Adopt the server's copy after a refresh, but never step back to an older, shorter list.
  useEffect(() => {
    if (!streaming) setMessages((prev) => (initial.length >= prev.length ? initial : prev));
  }, [initial, streaming]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages]);

  const grade = () =>
    startGrading(async () => {
      setError(null);
      const res = await finishRoleplay(sessionId);
      if (!res.ok) setError(res.error ?? "Grading failed.");
      router.refresh();
    });

  // The customer ended the conversation (or the turn limit was hit) → score it automatically.
  useEffect(() => {
    if (status === "ended" && !autoGraded.current) {
      autoGraded.current = true;
      grade();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status]);

  async function send(e: React.FormEvent) {
    e.preventDefault();
    const text = input.trim();
    if (!text || streaming || ended) return;
    setError(null);
    setInput("");
    setStreaming(true);
    setMessages((m) => [...m, { role: "rep", content: text }, { role: "customer", content: "", pending: true }]);

    const rollback = (msg: string) => {
      setMessages((m) => m.slice(0, -2));
      setInput(text);
      setError(msg);
    };

    try {
      const res = await fetch(`/api/roleplay/${sessionId}/turn`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: text }),
      });
      if (!res.ok || !res.body) {
        const j = await res.json().catch(() => ({}));
        rollback(j.error ?? "Something went wrong. Please try again.");
        return;
      }
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let full = "";
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        full += decoder.decode(value, { stream: true });
        setMessages((m) => [...m.slice(0, -1), { role: "customer", content: visible(full), pending: true }]);
      }
      const err = full.match(/\[\[ERROR:(.*?)\]\]/);
      if (err) {
        rollback(err[1]);
        return;
      }
      setMessages((m) => [...m.slice(0, -1), { role: "customer", content: visible(full) }]);
    } catch {
      rollback("Connection problem. Please check your internet and try again.");
    } finally {
      setStreaming(false);
      router.refresh(); // picks up saved messages and whether the customer ended the conversation
    }
  }

  return (
    <div className="flex min-h-[60dvh] flex-col">
      <div className="flex-1 space-y-3 pb-4" aria-live="polite">
        {messages.length === 0 && (
          <p className="rounded-lg bg-muted p-3 text-center text-sm text-muted-foreground">
            You start. Say hello to {customerName} as you would in real life.
          </p>
        )}
        {messages.map((m, i) => (
          <div key={i} className={cn("flex", m.role === "rep" ? "justify-end" : "justify-start")}>
            <div
              className={cn(
                "max-w-[85%] whitespace-pre-line rounded-2xl px-4 py-2 text-[15px] leading-relaxed shadow-sm",
                m.role === "rep" ? "rounded-br-sm bg-brand text-white" : "rounded-bl-sm border bg-card",
              )}
            >
              {m.role === "customer" && <p className="mb-0.5 text-xs font-semibold text-brand-2">{customerName}</p>}
              {m.content || (m.pending ? <span className="inline-flex gap-1" aria-label="Customer is typing"><Dot /><Dot d={150} /><Dot d={300} /></span> : "…")}
            </div>
          </div>
        ))}
        <div ref={bottomRef} />
      </div>

      {error && <div className="mb-2"><Alert tone="danger">{error}</Alert></div>}

      {ended || grading ? (
        <div className="sticky bottom-16 rounded-xl border bg-card p-4 text-center shadow-lg md:bottom-4">
          {grading ? (
            <p className="text-sm font-medium">Scoring your conversation… this takes about 15–30 seconds.</p>
          ) : (
            <>
              <p className="mb-2 text-sm">The conversation has ended.</p>
              <Button onClick={grade}>Get my score</Button>
            </>
          )}
        </div>
      ) : (
        <div className="sticky bottom-16 z-20 rounded-xl border bg-card p-2 shadow-lg md:bottom-4">
          <form onSubmit={send} className="flex items-end gap-2">
            <label htmlFor="msg" className="sr-only">Your message</label>
            <textarea
              id="msg"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey && window.matchMedia("(min-width: 768px)").matches) {
                  e.preventDefault();
                  void send(e);
                }
              }}
              rows={2}
              maxLength={1500}
              placeholder="Type what you would say…"
              className="min-h-11 flex-1 resize-none rounded-lg border bg-background px-3 py-2 text-base focus:outline-none focus:ring-2 focus:ring-brand-2"
              disabled={streaming}
            />
            <Button type="submit" disabled={streaming || !input.trim()} aria-label="Send" className="h-11 w-11 p-0">
              <Send className="size-5" />
            </Button>
          </form>
          <div className="mt-2 flex items-center justify-between px-1 text-xs text-muted-foreground">
            <span>Turn {repTurns}/{maxTurns}</span>
            <button
              type="button"
              className="underline disabled:opacity-50"
              disabled={streaming || repTurns === 0}
              onClick={() => window.confirm("End the conversation and get your score?") && grade()}
            >
              End &amp; get feedback
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function Dot({ d = 0 }: { d?: number }) {
  return <span className="size-1.5 animate-bounce rounded-full bg-muted-foreground" style={{ animationDelay: `${d}ms` }} />;
}
