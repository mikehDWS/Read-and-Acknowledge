"use server";

import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { audit } from "@/lib/audit";
import { transaction } from "@/lib/db";
import { mailConfigured } from "@/lib/mail";
import { sendManagerReminders, type ReminderRun } from "@/lib/reminders";
import { appBaseUrl } from "@/lib/request";
import { assertAdmin } from "@/lib/session";

export type SendRemindersState = { error?: string; run?: ReminderRun };

export async function sendRemindersNow(_prev: SendRemindersState, form: FormData): Promise<SendRemindersState> {
  const admin = await assertAdmin();
  if (!mailConfigured()) return { error: "Email isn't set up yet. See the settings listed on this page." };
  const force = form.get("force") === "yes";
  const run = await sendManagerReminders(appBaseUrl(await headers()), force);
  await transaction((db) =>
    audit(db, admin.id, "reminders.send", "reminders", null, { force, sent: run.sent.length, failed: run.failed.length }),
  );
  revalidatePath("/admin/reminders");
  return { run };
}
