import { redirect } from "next/navigation";
import { Logo } from "@/components/logo";
import { Card } from "@/components/ui";
import { getAuthState } from "@/lib/auth";
import { safeNext } from "@/lib/safe-redirect";
import { MfaForm } from "./mfa-form";

export const metadata = { title: "Two-step sign-in" };

export default async function MfaPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const { next } = await searchParams;
  const { signedIn, profile, access } = await getAuthState();
  if (!signedIn) redirect("/login");
  if (!profile || profile.status !== "active") redirect("/auth/signout?error=inactive");
  const dest = safeNext(next);
  if (!access.mfaRequired || access.mfaOk) redirect(dest);

  return (
    <main className="flex min-h-dvh items-center justify-center p-4">
      <div className="w-full max-w-sm">
        <div className="mb-6 flex flex-col items-center text-center">
          <Logo size={48} />
          <h1 className="mt-3 text-xl font-bold">Two-step sign-in</h1>
          <p className="text-sm text-muted-foreground">
            Staff accounts are protected with a 6-digit code from an authenticator app on your phone (Google Authenticator, Microsoft
            Authenticator or similar).
          </p>
        </div>
        <Card>
          <MfaForm next={dest} email={profile.email} />
        </Card>
        <form action="/auth/signout" method="post" className="mt-4 text-center">
          <button className="text-sm text-muted-foreground underline">Sign out</button>
        </form>
      </div>
    </main>
  );
}
