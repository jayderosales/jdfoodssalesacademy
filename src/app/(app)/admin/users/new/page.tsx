import Link from "next/link";
import { Card, PageHeader } from "@/components/ui";
import { requirePermission } from "@/lib/auth";
import { listTeams } from "@/lib/org";
import { listRoles } from "@/lib/rbac/queries";
import { NewUserForm } from "./new-user-form";

export const metadata = { title: "Add user" };

export default async function NewUserPage() {
  await requirePermission("admin.users.manage");
  const [teams, roles] = await Promise.all([listTeams(), listRoles()]);
  return (
    <>
      <PageHeader title="Add staff user" actions={<Link href="/admin/users" className="text-sm text-brand underline">Back to users</Link>} />
      <Card className="max-w-2xl">
        <NewUserForm
          teams={teams.map((t) => ({ id: t.id, label: t.label }))}
          roles={roles.filter((r) => r.is_internal && r.active).map((r) => ({ code: r.code, name: r.name, description: r.description }))}
        />
      </Card>
    </>
  );
}
