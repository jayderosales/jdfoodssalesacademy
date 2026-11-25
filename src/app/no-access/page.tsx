import { redirect } from "next/navigation";
import { Logo } from "@/components/logo";
import { Card } from "@/components/ui";
import { getAuthState } from "@/lib/auth";

export const metadata = { title: "No access yet" };

/** A staff account that is active but has no roles yet. */
export default async function NoAccessPage() {
  const { signedIn, profile, access } = await getAuthState();
  if (!signedIn) redirect("/login");
  if (access.isInternal) redirect("/dashboard");
  if (profile && profile.account_type !== "staff") redirect("/portal");
  return (
    <main className="flex min-h-dvh items-center justify-center p-4">
      <Card className="max-w-sm text-center">
        <div className="mb-3 flex justify-center"><Logo size={48} /></div>
        <h1 className="mb-2 text-lg font-bold">Your account has no role yet</h1>
        <p className="mb-4 text-sm text-muted-foreground">
          You&apos;re signed in, but an administrator still needs to give you a role before you can see anything. Please contact them.
        </p>
        <form action="/auth/signout" method="post">
          <button className="text-sm text-brand underline">Sign out</button>
        </form>
      </Card>
    </main>
  );
}
