import { timingSafeEqual } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { mailConfigured } from "@/lib/mail";
import { sendManagerReminders } from "@/lib/reminders";
import { appBaseUrl } from "@/lib/request";

export const dynamic = "force-dynamic";

/**
 * Weekly manager reminders. Called by the hosting scheduler (Vercel Cron sends
 * "Authorization: Bearer <CRON_SECRET>"), or by any scheduler with the same header.
 */
export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET ?? "";
  if (secret.length < 16) return NextResponse.json({ error: "CRON_SECRET isn't set" }, { status: 503 });
  const given = Buffer.from(request.headers.get("authorization") ?? "");
  const expected = Buffer.from(`Bearer ${secret}`);
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) {
    return NextResponse.json({ error: "Not authorised" }, { status: 401 });
  }
  if (!mailConfigured()) return NextResponse.json({ error: "Email isn't set up" }, { status: 503 });

  const run = await sendManagerReminders(appBaseUrl(request.headers));
  return NextResponse.json({
    sent: run.sent.length,
    alreadySent: run.alreadySent.length,
    nothingOutstanding: run.nothingOutstanding.length,
    failed: run.failed.length,
  });
}
