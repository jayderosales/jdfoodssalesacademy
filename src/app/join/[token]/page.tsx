import { Alert, Card } from "@/components/ui";
import { Logo } from "@/components/logo";
import { SimpleMarkdown } from "@/lib/simple-markdown";
import { createClient } from "@/lib/supabase/server";
import { JoinForm } from "./join-form";

export const metadata = { title: "Join the Sales Academy" };

/** Short public version of the privacy notice (settings aren't readable before sign-in). The full notice is shown after first sign-in. */
const CONSENT_FALLBACK = `**Employee Data Privacy Notice (Republic Act No. 10173 – Data Privacy Act of 2012)**

JD Foods collects only the personal data needed to run the Sales Academy: your name, work email, team, hire date, training activity (lessons, quiz answers, roleplay transcripts and scores), and field sales results entered by your manager. Only you, your sales manager and the owner/administrators can see it. Roleplay transcripts are processed by our AI provider (Anthropic) to generate customer replies and scores. You will see the full notice again after you sign in.`;

export default async function JoinPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const valid = /^[0-9a-f]{20,64}$/.test(token);
  let link: { team_name: string; valid: boolean } | undefined;
  if (valid) {
    const supabase = await createClient();
    const { data } = await supabase.rpc("signup_link_info", { p_token: token });
    link = (data as { team_name: string; valid: boolean }[] | null)?.[0];
  }

  return (
    <main className="flex min-h-dvh items-center justify-center p-4">
      <div className="w-full max-w-sm">
        <div className="mb-6 flex flex-col items-center text-center">
          <Logo size={56} />
          <h1 className="mt-3 text-2xl font-bold">Join the JD Foods Sales Academy</h1>
          {link?.valid && <p className="text-sm text-muted-foreground">You&apos;re joining <strong>{link.team_name}</strong> as a salesperson.</p>}
        </div>
        <Card>
          {!link ? (
            <Alert tone="danger">This sign-up link isn&apos;t valid. Check that you copied the whole link, or ask your manager for a new one.</Alert>
          ) : !link.valid ? (
            <Alert tone="danger">This sign-up link has expired or been switched off. Ask your manager for a new one.</Alert>
          ) : (
            <JoinForm token={token} consentText={<SimpleMarkdown text={CONSENT_FALLBACK} />} />
          )}
        </Card>
      </div>
    </main>
  );
}
