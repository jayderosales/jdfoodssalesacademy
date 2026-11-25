import type { Metadata, Viewport } from "next";
import "./globals.css";
import { ServiceWorkerRegister } from "@/components/sw-register";
import { getAuthState, getSettings } from "@/lib/auth";
import { isHexColor } from "@/lib/utils";

export const metadata: Metadata = {
  title: { default: "JD Foods OS", template: "%s · JD Foods OS" },
  description: "JD Foods company system: training, sales, inventory, finance and more.",
  icons: { icon: "/icon.svg", apple: "/icon.svg" },
  appleWebApp: { capable: true, title: "JD Foods", statusBarStyle: "default" },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#c8102e",
};

/** Brand colours from Settings, validated as hex before being written into CSS. */
async function brandStyle() {
  const { profile } = await getAuthState();
  if (!profile) return null;
  const s = await getSettings();
  if (!s) return null;
  const vars = [
    isHexColor(s.brand_primary) && `--brand-primary:${s.brand_primary}`,
    isHexColor(s.brand_secondary) && `--brand-secondary:${s.brand_secondary}`,
    isHexColor(s.brand_accent) && `--brand-accent:${s.brand_accent}`,
  ].filter(Boolean);
  return vars.length ? `:root{${vars.join(";")}}` : null;
}

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const css = await brandStyle().catch(() => null);
  return (
    <html lang="en">
      <head>{css ? <style>{css}</style> : null}</head>
      <body className="min-h-dvh antialiased">
        {children}
        <ServiceWorkerRegister />
      </body>
    </html>
  );
}
