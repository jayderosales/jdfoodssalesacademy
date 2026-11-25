import Link from "next/link";
import { Logo } from "@/components/logo";
import { Card } from "@/components/ui";
import { RegisterForm } from "./register-form";

export const metadata = { title: "Request an account" };

export default async function RegisterPage({ searchParams }: { searchParams: Promise<{ type?: string }> }) {
  const { type } = await searchParams;
  const initial = type === "distributor" || type === "supplier" ? type : "customer";
  return (
    <main className="flex min-h-dvh items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="mb-6 flex flex-col items-center text-center">
          <Logo size={48} />
          <h1 className="mt-3 text-xl font-bold">Request a JD Foods account</h1>
          <p className="text-sm text-muted-foreground">For customers, distributors and suppliers. We&apos;ll review your request and email you when it&apos;s approved.</p>
        </div>
        <Card>
          <RegisterForm initialType={initial} />
        </Card>
        <p className="mt-4 text-center text-sm text-muted-foreground">
          JD Foods staff: your account is created by an administrator. <Link href="/login" className="text-brand underline">Sign in</Link>
        </p>
      </div>
    </main>
  );
}
