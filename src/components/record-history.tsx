import { Card, CardTitle } from "@/components/ui";
import { can, getAccess } from "@/lib/auth";
import { describeAuditEntry, type AuditEntry } from "@/lib/audit";
import { createClient } from "@/lib/supabase/server";
import { formatDate } from "@/lib/utils";

/**
 * "History" panel for a record page: who changed what, field by field, from the audit log.
 * Shows nothing to people without audit.view (RLS would return no rows anyway).
 *
 * @param tables  audit entity (table) names to include
 * @param recordIds  record ids within those tables
 * @param userId  also include role grants/revocations for this user (user_roles rows that no longer exist)
 */
export async function RecordHistory({ tables, recordIds, userId, limit = 50 }: { tables: string[]; recordIds: string[]; userId?: string; limit?: number }) {
  const access = await getAccess();
  if (!can(access, "audit.view")) return null;
  const supabase = await createClient();

  const ors = [`and(entity.in.(${tables.join(",")}),entity_id.in.(${recordIds.join(",")}))`];
  if (userId) ors.push(`and(entity.eq.user_roles,or(after->>user_id.eq.${userId},before->>user_id.eq.${userId}))`);
  const { data } = await supabase
    .from("audit_log")
    .select("id, at, actor_id, action, entity, entity_id, before, after, diff, is_restricted")
    .or(ors.join(","))
    .order("at", { ascending: false })
    .limit(limit);
  const entries = (data as AuditEntry[] | null) ?? [];

  const actorIds = [...new Set(entries.map((e) => e.actor_id).filter((x): x is string => !!x))];
  const { data: actors } = actorIds.length
    ? await supabase.from("profiles").select("id, full_name, email").in("id", actorIds)
    : { data: [] };
  const actorName = new Map((actors ?? []).map((a: { id: string; full_name: string; email: string }) => [a.id, a.full_name || a.email]));

  // Role names for user_roles entries
  const roleIds = [...new Set(entries.filter((e) => e.entity === "user_roles").map((e) => (e.after ?? e.before)?.role_id as string | undefined).filter(Boolean))] as string[];
  const { data: roles } = roleIds.length ? await supabase.from("roles").select("id, name").in("id", roleIds) : { data: [] };
  const roleName = new Map((roles ?? []).map((r: { id: string; name: string }) => [r.id, r.name]));

  return (
    <Card>
      <CardTitle>History</CardTitle>
      {entries.length === 0 ? (
        <p className="text-sm text-muted-foreground">No changes recorded yet.</p>
      ) : (
        <ol className="space-y-3">
          {entries.map((e) => {
            const d = describeAuditEntry(e, { roleName: (id) => roleName.get(id) });
            return (
              <li key={e.id} className="border-l-2 pl-3 text-sm">
                <div>
                  <span className="font-medium">{e.actor_id ? (actorName.get(e.actor_id) ?? "A user") : "System"}</span> {d.summary}
                </div>
                <div className="text-xs text-muted-foreground">{formatDate(e.at, true)}</div>
                {d.changes.length > 0 && (
                  <ul className="mt-1 space-y-0.5 text-xs">
                    {d.changes.map((c) => (
                      <li key={c.field}>
                        <span className="text-muted-foreground">{c.label}:</span> <s className="text-muted-foreground">{c.from}</s> → {c.to}
                      </li>
                    ))}
                  </ul>
                )}
              </li>
            );
          })}
        </ol>
      )}
    </Card>
  );
}
