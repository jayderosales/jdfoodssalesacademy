import { redirect } from "next/navigation";
import { Button, Card } from "@/components/ui";
import { Logo } from "@/components/logo";
import { getSettings, requireUser } from "@/lib/auth";
import { SimpleMarkdown } from "@/lib/simple-markdown";
import { createClient } from "@/lib/supabase/server";

export const metadata = { title: "Data privacy notice" };

async function acceptConsent() {
  "use server";
  const profile = await requireUser({ skipConsent: true });
  const settings = await getSettings();
  const supabase = await createClient();
  const { error } = await supabase
    .from("profiles")
    .update({ consent_version: settings?.consent_version ?? "v1", consent_at: new Date().toISOString() })
    .eq("id", profile.id);
  if (error) throw new Error(error.message);
  redirect("/dashboard");
}

export default async function ConsentPage() {
  const profile = await requireUser({ skipConsent: true });
  const settings = await getSettings();
  const upToDate = profile.consent_at && profile.consent_version === settings?.consent_version;

  return (
    <main className="mx-auto flex min-h-dvh max-w-2xl flex-col justify-center p-4">
      <div className="mb-4 flex items-center gap-3">
        <Logo size={40} />
        <div>
          <h1 className="text-xl font-bold">Before you start</h1>
          <p className="text-sm text-muted-foreground">Please read how JD Foods uses your data in the Sales Academy.</p>
        </div>
      </div>
      <Card>
        <div className="max-h-[60dvh] overflow-y-auto pr-1">
          <SimpleMarkdown text={settings?.consent_text || "Consent notice not configured yet."} />
        </div>
        <form action={acceptConsent} className="mt-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-xs text-muted-foreground">Notice version {settings?.consent_version}</p>
          {upToDate ? (
            <a href="/dashboard" className="text-sm text-brand underline">
              Already accepted — back to dashboard
            </a>
          ) : (
            <Button type="submit" size="lg">
              I have read and agree
            </Button>
          )}
        </form>
      </Card>
      <form action="/auth/signout" method="post" className="mt-4 text-center">
        <button className="text-sm text-muted-foreground underline">Sign out instead</button>
      </form>
    </main>
  );
}
