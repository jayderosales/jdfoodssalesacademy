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

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string; error?: string }> }) {
  const { next, error } = await searchParams;
  const { profile } = await getAuthState();
  if (profile?.status === "active") redirect("/dashboard");
  const settings = await getSettings().catch(() => null);

  return (
    <main className="flex min-h-dvh items-center justify-center p-4">
      <div className="w-full max-w-sm">
        <div className="mb-6 flex flex-col items-center text-center">
          <Logo size={56} />
          <h1 className="mt-3 text-2xl font-bold">{settings?.company_name ?? "JD Foods"} Sales Academy</h1>
          <p className="text-sm text-muted-foreground">Sign in with the account your manager created for you.</p>
        </div>
        <Card>
          {error && ERRORS[error] && (
            <div className="mb-4">
              <Alert tone="danger">{ERRORS[error]}</Alert>
            </div>
          )}
          <LoginForm next={next} />
        </Card>
      </div>
    </main>
  );
}
