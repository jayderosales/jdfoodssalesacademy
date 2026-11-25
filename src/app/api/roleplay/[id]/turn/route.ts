import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { getAuthState } from "@/lib/auth";
import { runTurn } from "@/lib/roleplay/service";

export const runtime = "nodejs";
export const maxDuration = 60;

const body = z.object({ message: z.string().trim().min(1, "Type a message.").max(1500, "Keep messages under 1,500 characters.") });

/** Sends the rep's message and streams back the AI customer's reply as plain text. */
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { profile } = await getAuthState();
  if (!profile || profile.status !== "active") return NextResponse.json({ error: "Please sign in again." }, { status: 401 });

  const { id } = await params;
  if (!z.string().uuid().safeParse(id).success) return NextResponse.json({ error: "Not found." }, { status: 404 });

  const parsed = body.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0].message }, { status: 400 });

  const result = await runTurn(profile, id, parsed.data.message);
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status });

  return new Response(result.stream, {
    headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store", "X-Accel-Buffering": "no" },
  });
}
