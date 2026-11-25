import Link from "next/link";
import { DifficultyBadge } from "@/components/roleplay-badges";
import { DemoChat } from "./demo-chat";

export const metadata = { title: "Roleplay" };

export default function DemoChatPage() {
  return (
    <div className="mx-auto max-w-2xl">
      <div className="mb-3 flex items-center justify-between gap-2">
        <Link href="/demo/roleplay" className="text-sm text-muted-foreground hover:text-brand">← Scenarios</Link>
        <DifficultyBadge difficulty="easy" />
      </div>
      <h1 className="text-xl font-bold">Aling Nena&apos;s carinderia: switching chili garlic</h1>
      <details className="mb-4 mt-1 rounded-lg border bg-card p-3 text-sm" open>
        <summary className="cursor-pointer font-medium">Situation &amp; goal</summary>
        <p className="mt-2">It&apos;s 2:30 PM, after the lunch rush, at a busy carinderia near a jeepney terminal in Quezon City. The owner is wiping tables. Siomai and pancit are on the menu, and you can see a jar of a cheap chili garlic brand on every table.</p>
        <p className="mt-2 text-muted-foreground"><strong>Your goal:</strong> Get a small trial order of All Purpose Chili Garlic.</p>
      </details>
      <DemoChat />
    </div>
  );
}
