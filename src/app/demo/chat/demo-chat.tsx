"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Send } from "lucide-react";
import { Button, buttonVariants } from "@/components/ui";
import { cn } from "@/lib/utils";
import { demoScript } from "../data";

interface Msg {
  role: "rep" | "customer";
  content: string;
  pending?: boolean;
}

/**
 * Scripted preview of the roleplay chat. The input is pre-filled with the next sample line;
 * tapping Send plays the customer's reply word by word, like the real streamed AI reply.
 */
export function DemoChat() {
  const [messages, setMessages] = useState<Msg[]>([]);
  const [step, setStep] = useState(0);
  const [input, setInput] = useState(demoScript[0].rep);
  const [busy, setBusy] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const finished = step >= demoScript.length && !busy;

  useEffect(() => bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "end" }), [messages]);

  async function send(e: React.FormEvent) {
    e.preventDefault();
    if (busy || step >= demoScript.length) return;
    const line = demoScript[step];
    setBusy(true);
    setMessages((m) => [...m, { role: "rep", content: input.trim() || line.rep }, { role: "customer", content: "", pending: true }]);
    setInput("");
    await new Promise((r) => setTimeout(r, 900));
    const words = line.customer.split(" ");
    for (let i = 1; i <= words.length; i++) {
      await new Promise((r) => setTimeout(r, 55));
      setMessages((m) => [...m.slice(0, -1), { role: "customer", content: words.slice(0, i).join(" "), pending: i < words.length }]);
    }
    const next = step + 1;
    setStep(next);
    setInput(demoScript[next]?.rep ?? "");
    setBusy(false);
  }

  return (
    <div className="flex min-h-[60dvh] flex-col">
      <div className="flex-1 space-y-3 pb-4" aria-live="polite">
        {messages.length === 0 && (
          <p className="rounded-lg bg-muted p-3 text-center text-sm text-muted-foreground">You start. Say hello to Aling Nena as you would in real life.</p>
        )}
        {messages.map((m, i) => (
          <div key={i} className={cn("flex", m.role === "rep" ? "justify-end" : "justify-start")}>
            <div className={cn("max-w-[85%] rounded-2xl px-4 py-2 text-[15px] leading-relaxed shadow-sm", m.role === "rep" ? "rounded-br-sm bg-brand text-white" : "rounded-bl-sm border bg-card")}>
              {m.role === "customer" && <p className="mb-0.5 text-xs font-semibold text-brand-2">Aling Nena</p>}
              {m.content || <span className="inline-flex gap-1" aria-label="Customer is typing"><Dot /><Dot d={150} /><Dot d={300} /></span>}
            </div>
          </div>
        ))}
        <div ref={bottomRef} />
      </div>

      {finished ? (
        <div className="sticky bottom-16 rounded-xl border bg-card p-4 text-center shadow-lg md:bottom-4">
          <p className="mb-3 text-sm">Aling Nena agreed to a trial. The conversation has ended.</p>
          <Link href="/demo/results" className={buttonVariants()}>See my score</Link>
        </div>
      ) : (
        <div className="sticky bottom-16 z-20 rounded-xl border bg-card p-2 shadow-lg md:bottom-4">
          <form onSubmit={send} className="flex items-end gap-2">
            <label htmlFor="msg" className="sr-only">Your message</label>
            <textarea
              id="msg"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              rows={2}
              className="min-h-11 flex-1 resize-none rounded-lg border bg-background px-3 py-2 text-base focus:outline-none focus:ring-2 focus:ring-brand-2"
              disabled={busy}
            />
            <Button type="submit" disabled={busy} aria-label="Send" className="h-11 w-11 p-0"><Send className="size-5" /></Button>
          </form>
          <div className="mt-2 flex justify-between px-1 text-xs text-muted-foreground">
            <span>Turn {step}/14</span>
            <span>Preview: sample lines are pre-filled</span>
          </div>
        </div>
      )}
    </div>
  );
}

function Dot({ d = 0 }: { d?: number }) {
  return <span className="size-1.5 animate-bounce rounded-full bg-muted-foreground" style={{ animationDelay: `${d}ms` }} />;
}
