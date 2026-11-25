import Link from "next/link";
import { Card, PageHeader } from "@/components/ui";
import { requireOwner } from "@/lib/auth";
import { listTeams } from "@/lib/org";
import { NewUserForm } from "./new-user-form";

export const metadata = { title: "Add user" };

export default async function NewUserPage() {
  await requireOwner();
  const teams = await listTeams();
  return (
    <>
      <PageHeader title="Add user" actions={<Link href="/admin/users" className="text-sm text-brand underline">Back to users</Link>} />
      <Card className="max-w-2xl">
        <NewUserForm teams={teams.map((t) => ({ id: t.id, label: t.label }))} />
      </Card>
    </>
  );
}
