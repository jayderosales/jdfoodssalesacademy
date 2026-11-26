import Link from "next/link";
import { Card, PageHeader } from "@/components/ui";
import { requirePermission } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { PettyCashForm } from "../petty-cash-form";

export const metadata = { title: "New petty cash request" };

export default async function NewPettyCashPage() {
  await requirePermission("petty_cash.request");
  const supabase = await createClient();
  const { data } = await supabase.from("departments").select("id, name").eq("active", true).order("name");
  return (
    <>
      <PageHeader title="New petty cash request" actions={<Link href="/requests/petty-cash" className="text-sm text-brand underline">Back</Link>} />
      <Card className="max-w-2xl">
        <PettyCashForm departments={(data as { id: string; name: string }[] | null) ?? []} />
      </Card>
    </>
  );
}
