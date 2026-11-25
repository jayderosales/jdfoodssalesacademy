import Link from "next/link";
import { DifficultyBadge } from "@/components/roleplay-badges";
import { Badge, Card, PageHeader, Table, Td, Th, buttonVariants } from "@/components/ui";
import { requireOwner } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

export const metadata = { title: "Roleplay scenarios" };

export default async function ScenariosAdminPage() {
  await requireOwner();
  const supabase = await createClient();
  const [{ data }, { data: sessions }] = await Promise.all([
    supabase.from("scenarios").select("id, title, difficulty, language, active, max_turns, persona").order("difficulty").order("title"),
    supabase.from("roleplay_sessions").select("scenario_id"),
  ]);
  const uses = new Map<string, number>();
  (sessions ?? []).forEach((s: { scenario_id: string }) => uses.set(s.scenario_id, (uses.get(s.scenario_id) ?? 0) + 1));

  return (
    <>
      <PageHeader
        title="Roleplay scenarios"
        actions={
          <div className="flex gap-2">
            <Link href="/admin/content" className={buttonVariants({ variant: "outline" })}>Back</Link>
            <Link href="/admin/content/scenarios/new" className={buttonVariants()}>Add scenario</Link>
          </div>
        }
      />
      <Card>
        <Table>
          <thead><tr><Th>Scenario</Th><Th>Difficulty</Th><Th>Language</Th><Th>Played</Th><Th>Status</Th></tr></thead>
          <tbody>
            {((data ?? []) as { id: string; title: string; difficulty: string; language: string; active: boolean; persona: { name: string; business_type: string } }[]).map((s) => (
              <tr key={s.id}>
                <Td>
                  <Link href={`/admin/content/scenarios/${s.id}`} className="font-medium text-brand underline">{s.title}</Link>
                  <div className="text-xs text-muted-foreground">{s.persona.name} · {s.persona.business_type}</div>
                </Td>
                <Td><DifficultyBadge difficulty={s.difficulty} /></Td>
                <Td>{s.language === "taglish" ? "Taglish" : "English"}</Td>
                <Td>{uses.get(s.id) ?? 0}</Td>
                <Td><Badge tone={s.active ? "success" : "neutral"}>{s.active ? "active" : "hidden"}</Badge></Td>
              </tr>
            ))}
          </tbody>
        </Table>
      </Card>
    </>
  );
}
