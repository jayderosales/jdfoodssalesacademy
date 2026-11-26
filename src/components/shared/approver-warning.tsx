import Link from "next/link";
import { can, getAccess } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

/**
 * Shown before "Send for approval" when nobody other than the requester can approve this document (nobody may approve
 * their own request). Typical in a new setup where one person holds every role.
 */
export async function ApproverWarning({ docType, amount }: { docType: string; amount: number | string }) {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("approvers_available", { p_doc_type: docType, p_amount: Number(amount) });
  if (error || data !== false) return null;
  const admin = can(await getAccess(), "admin.users.manage");
  return (
    <div className="mb-4 rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
      <b>No one else can approve this yet.</b> Nobody may approve their own request, and you&apos;re the only person who holds the approver role for it.{" "}
      {admin ? (
        <>Add the approver first: <Link href="/admin/users" className="font-medium underline">Admin → Users</Link> → invite them and give them the role (e.g. Operations manager for petty cash up to ₱50,000, CEO for the rest).</>
      ) : (
        <>Ask an administrator to add an approver.</>
      )}
    </div>
  );
}
