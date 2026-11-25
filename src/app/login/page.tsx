import { redirect } from "next/navigation";
import { Alert, Card } from "@/components/ui";
import { getAuthState, getSettings } from "@/lib/auth";
import { Logo } from "@/components/logo";
import { LoginForm } from "./login-form";

export const metadata = { title: "Sign in" };

const ERRORS: Record<string, string> = {
  inactive: "This account isn't active. If you just signed up, your manager needs to approve your account first.",
  link: "That sign-in link is invalid or has expired. Please request a new one.",
};

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string; error?: string; notice?: string }> }) {
  const { next, error, notice } = await searchParams;
  const { profile } = await getAuthState();
  if (profile?.status === "active") redirect("/dashboard");
  const settings = await getSettings().catch(() => null);

  return (
    <main className="flex min-h-dvh items-center justify-center p-4">
      <div className="w-full max-w-sm">
        <div className="mb-6 flex flex-col items-center text-center">
          <Logo size={56} />
          <h1 className="mt-3 text-2xl font-bold">{settings?.company_name ?? "JD Foods"} OS</h1>
          <p className="text-sm text-muted-foreground">Sign in with your work account.</p>
        </div>
        <Card>
          {notice === "confirmed" && (
            <div className="mb-4">
              <Alert tone="success">Your email is confirmed. Sign in below with your email and the password you created.</Alert>
            </div>
          )}
          {notice === "idle" && (
            <div className="mb-4">
              <Alert>You were signed out because you weren&apos;t active for a while. Sign in again to continue.</Alert>
            </div>
          )}
          {error && ERRORS[error] && (
            <div className="mb-4">
              <Alert tone="danger">{ERRORS[error]}</Alert>
            </div>
          )}
          <LoginForm next={next} />
        </Card>
        <p className="mt-4 text-center text-sm text-muted-foreground">
          Customer, distributor or supplier?{" "}
          <a href="/register" className="text-brand underline">Request an account</a>
        </p>
      </div>
    </main>
  );
}
