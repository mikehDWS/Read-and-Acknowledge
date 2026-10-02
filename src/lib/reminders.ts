import { query, type Queryable } from "./db";
import { formatDate, isOverdue, todayIso } from "./format";
import { sendMail } from "./mail";

export type DigestDocument = {
  id: string;
  name: string;
  due: string | null;
  overdue: boolean;
  linkToken: string;
  outstanding: { name: string; department: string }[];
};

export type ManagerDigest = {
  userId: string;
  name: string;
  email: string;
  departments: string[];
  documents: DigestDocument[];
  outstanding: number;
};

/** What each manager would be told this week: open documents with people still to sign. */
export async function buildManagerDigests(db?: Queryable): Promise<ManagerDigest[]> {
  const managers = await query<{ user_id: string; name: string; email: string; departments: string[] }>(
    `SELECT u.id AS user_id, u.name, u.email,
            ARRAY_AGG(d.name ORDER BY d.sort_order, d.name) AS departments
       FROM department_managers dm
       JOIN users u ON u.id = dm.user_id
       JOIN departments d ON d.id = dm.department_id
      GROUP BY u.id, u.name, u.email
      ORDER BY lower(u.name)`,
    [],
    db,
  );
  const rows = await query<{
    manager_id: string;
    document_id: string;
    document_name: string;
    due_date: string | null;
    link_token: string;
    person: string;
    department: string;
  }>(
    `SELECT DISTINCT dm.user_id AS manager_id, doc.id AS document_id, doc.name AS document_name,
            doc.due_date, doc.link_token, u.name AS person, dep.name AS department
       FROM department_managers dm
       JOIN users u ON u.department_id = dm.department_id
       JOIN departments dep ON dep.id = u.department_id
       JOIN document_signers ds ON ds.user_id = u.id
       JOIN documents doc ON doc.id = ds.document_id AND doc.status = 'open'
      WHERE NOT EXISTS (
              SELECT 1 FROM acknowledgements a
               WHERE a.document_id = doc.id AND a.user_id = u.id AND a.voided_at IS NULL)
      ORDER BY doc.due_date NULLS LAST, doc.name, dep.name, u.name`,
    [],
    db,
  );

  return managers.map((m) => {
    const docs = new Map<string, DigestDocument>();
    for (const r of rows.filter((x) => x.manager_id === m.user_id)) {
      const doc = docs.get(r.document_id) ?? {
        id: r.document_id,
        name: r.document_name,
        due: r.due_date,
        overdue: isOverdue(r.due_date),
        linkToken: r.link_token,
        outstanding: [],
      };
      doc.outstanding.push({ name: r.person, department: r.department });
      docs.set(r.document_id, doc);
    }
    const documents = [...docs.values()];
    return {
      userId: m.user_id,
      name: m.name,
      email: m.email,
      departments: m.departments,
      documents,
      outstanding: documents.reduce((n, d) => n + d.outstanding.length, 0),
    };
  });
}

const esc = (v: string) =>
  v.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

/** The reminder email for one manager. */
export function renderDigest(digest: ManagerDigest, baseUrl: string): { subject: string; text: string; html: string } {
  const n = digest.outstanding;
  const scope = digest.departments.join(", ");
  const subject = `${n} ${n === 1 ? "signature" : "signatures"} still needed in ${scope}`;
  const teamUrl = `${baseUrl}/team`;
  const firstName = digest.name.split(/\s+/)[0] || digest.name;

  const textDocs = digest.documents
    .map((d) => {
      const due = d.due ? ` (due ${formatDate(d.due)}${d.overdue ? ", overdue" : ""})` : "";
      const people = d.outstanding.map((p) => `  - ${p.name}, ${p.department}`).join("\n");
      return `${d.name}${due}\n${people}\n  Sign link: ${baseUrl}/sign/${d.linkToken}`;
    })
    .join("\n\n");
  const text = `Hello ${firstName},

These people in ${scope} still need to sign:

${textDocs}

See everyone's progress: ${teamUrl}

You're getting this weekly because you manage ${scope} in Read and Acknowledge.`;

  const htmlDocs = digest.documents
    .map((d) => {
      const due = d.due
        ? ` <span style="color:${d.overdue ? "#8f1d1d" : "#5b6572"}">· Due ${esc(formatDate(d.due))}${d.overdue ? " · Overdue" : ""}</span>`
        : "";
      const people = d.outstanding
        .map((p) => `<li>${esc(p.name)} <span style="color:#5b6572">· ${esc(p.department)}</span></li>`)
        .join("");
      return `<h3 style="margin:20px 0 4px;font-size:16px">${esc(d.name)}${due}</h3>
<ul style="margin:4px 0 6px;padding-left:20px">${people}</ul>
<p style="margin:0;font-size:13px"><a href="${esc(`${baseUrl}/sign/${d.linkToken}`)}">Sign link to send to your team</a></p>`;
    })
    .join("");
  const html = `<div style="font-family:system-ui,-apple-system,'Segoe UI',Roboto,sans-serif;color:#1b1f24;max-width:600px">
<p>Hello ${esc(firstName)},</p>
<p>These people in <strong>${esc(scope)}</strong> still need to sign:</p>
${htmlDocs}
<p style="margin-top:24px"><a href="${esc(teamUrl)}" style="background:#1f5fbf;color:#ffffff;padding:10px 16px;border-radius:6px;text-decoration:none;display:inline-block">See everyone's progress</a></p>
<p style="color:#5b6572;font-size:13px">You're getting this weekly because you manage ${esc(scope)} in Read and Acknowledge.</p>
</div>`;
  return { subject, text, html };
}

/** Monday of the current week in the app's time zone, as YYYY-MM-DD. */
export function weekStart(now: Date = new Date()): string {
  const today = todayIso(now);
  const d = new Date(`${today}T00:00:00Z`);
  const day = (d.getUTCDay() + 6) % 7; // Monday = 0
  d.setUTCDate(d.getUTCDate() - day);
  return d.toISOString().slice(0, 10);
}

export type ReminderRun = {
  sent: string[];
  alreadySent: string[];
  nothingOutstanding: string[];
  failed: { name: string; error: string }[];
};

/**
 * Emails every manager with outstanding signatures. Without `force`, a manager who has already
 * had this week's reminder is skipped.
 */
export async function sendManagerReminders(baseUrl: string, force = false, now: Date = new Date()): Promise<ReminderRun> {
  const week = weekStart(now);
  const digests = await buildManagerDigests();
  const sentThisWeek = new Set(
    (await query<{ user_id: string }>("SELECT user_id FROM manager_reminders WHERE week_start = $1", [week])).map(
      (r) => r.user_id,
    ),
  );
  const run: ReminderRun = { sent: [], alreadySent: [], nothingOutstanding: [], failed: [] };
  for (const digest of digests) {
    if (digest.outstanding === 0) {
      run.nothingOutstanding.push(digest.name);
      continue;
    }
    if (!force && sentThisWeek.has(digest.userId)) {
      run.alreadySent.push(digest.name);
      continue;
    }
    try {
      await sendMail({ to: digest.email, ...renderDigest(digest, baseUrl) });
      await query(
        `INSERT INTO manager_reminders (user_id, week_start, documents, outstanding) VALUES ($1, $2, $3, $4)
         ON CONFLICT (user_id, week_start)
         DO UPDATE SET sent_at = now(), documents = EXCLUDED.documents, outstanding = EXCLUDED.outstanding`,
        [digest.userId, week, digest.documents.length, digest.outstanding],
      );
      run.sent.push(digest.name);
    } catch (err) {
      run.failed.push({ name: digest.name, error: err instanceof Error ? err.message : String(err) });
    }
  }
  return run;
}
