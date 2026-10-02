import type { Metadata } from "next";
import { query } from "@/lib/db";
import { formatDate, formatDateTime } from "@/lib/format";
import { mailConfigured } from "@/lib/mail";
import { buildManagerDigests, weekStart } from "@/lib/reminders";
import { requireAdmin } from "@/lib/session";
import SendForm from "./SendForm";

export const metadata: Metadata = { title: "Reminders" };

export default async function RemindersPage() {
  await requireAdmin("/admin/reminders");
  const week = weekStart();
  const [digests, sent] = await Promise.all([
    buildManagerDigests(),
    query<{ user_id: string; sent_at: Date }>("SELECT user_id, sent_at FROM manager_reminders WHERE week_start = $1", [week]),
  ]);
  const sentAt = new Map(sent.map((s) => [s.user_id, s.sent_at]));
  const configured = mailConfigured();
  const scheduled = !!process.env.CRON_SECRET;

  return (
    <>
      <h1>Manager reminders</h1>
      <p className="lead">
        Every Monday morning, each department manager is emailed the people in their departments who still need to
        sign an open document. Managers with nothing outstanding aren&apos;t emailed.
      </p>

      {!configured && (
        <div className="notice warn">
          Email isn&apos;t set up yet. Add these settings to the app (on Vercel: Settings → Environment Variables), then
          redeploy: <code>SMTP_HOST</code>, <code>SMTP_PORT</code>, <code>SMTP_USER</code>, <code>SMTP_PASS</code> and{" "}
          <code>MAIL_FROM</code>.
        </div>
      )}
      {configured && !scheduled && (
        <div className="notice warn">
          The weekly schedule needs a <code>CRON_SECRET</code> setting (a long random phrase). Until it&apos;s set, use{" "}
          <strong>Send reminders now</strong>.
        </div>
      )}

      <section className="card" aria-labelledby="send-heading">
        <h2 id="send-heading" style={{ marginTop: 0 }}>
          Send now
        </h2>
        <p className="hint">Sends this week&apos;s reminder to every manager with outstanding signatures who hasn&apos;t had it yet.</p>
        <SendForm disabled={!configured} />
      </section>

      <h2>What each manager gets this week</h2>
      <p className="hint">Week starting {formatDate(week)}.</p>
      {digests.length === 0 ? (
        <p>No departments have a manager yet. Set managers in a person&apos;s Edit form on the People page.</p>
      ) : (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th scope="col">Manager</th>
                <th scope="col">Outstanding</th>
                <th scope="col">This week</th>
              </tr>
            </thead>
            <tbody>
              {digests.map((d) => (
                <tr key={d.userId}>
                  <td>
                    {d.name}
                    <span className="hint">{d.email}</span>
                    <span className="hint">Manages {d.departments.join(", ")}</span>
                  </td>
                  <td>
                    {d.outstanding === 0 ? (
                      <span className="hint">Nothing outstanding</span>
                    ) : (
                      <details>
                        <summary>
                          {d.outstanding} {d.outstanding === 1 ? "signature" : "signatures"} across {d.documents.length}{" "}
                          {d.documents.length === 1 ? "document" : "documents"}
                        </summary>
                        <ul>
                          {d.documents.map((doc) => (
                            <li key={doc.id}>
                              <strong>{doc.name}</strong>
                              {doc.due && ` · due ${formatDate(doc.due)}`}
                              {doc.overdue && " · overdue"}: {doc.outstanding.map((p) => p.name).join(", ")}
                            </li>
                          ))}
                        </ul>
                      </details>
                    )}
                  </td>
                  <td>
                    {sentAt.has(d.userId) ? (
                      <span className="badge ok">Sent {formatDateTime(sentAt.get(d.userId)!)}</span>
                    ) : d.outstanding === 0 ? (
                      <span className="badge muted">Not needed</span>
                    ) : (
                      <span className="badge warn">Not sent yet</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
