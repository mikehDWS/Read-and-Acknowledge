import type { Metadata } from "next";
import Link from "next/link";
import { query } from "@/lib/db";
import { formatDate, formatDateTime, isOverdue } from "@/lib/format";
import { requireUser } from "@/lib/session";

export const metadata: Metadata = { title: "My documents" };

type Row = {
  id: string;
  name: string;
  version_label: string | null;
  category: string | null;
  due_date: string | null;
  link_token: string;
  status: "open" | "closed";
  acknowledged_at: Date | null;
};

export default async function MyDocumentsPage() {
  const user = await requireUser("/my");
  const rows = await query<Row>(
    `SELECT d.id, d.name, d.version_label, c.name AS category, d.due_date, d.link_token, d.status, a.acknowledged_at
       FROM document_signers es
       JOIN documents d ON d.id = es.document_id
       LEFT JOIN document_categories c ON c.id = d.category_id
       LEFT JOIN acknowledgements a
              ON a.document_id = d.id AND a.user_id = es.user_id AND a.voided_at IS NULL
      WHERE es.user_id = $1
      ORDER BY (a.id IS NOT NULL), d.due_date NULLS LAST, d.name`,
    [user.id],
  );
  const outstanding = rows.filter((r) => !r.acknowledged_at && r.status === "open").length;

  return (
    <>
      <h1>My documents</h1>
      <p className="lead">
        {rows.length === 0
          ? "You haven't been asked to acknowledge any documents yet."
          : outstanding === 0
            ? "You're up to date."
            : `${outstanding} ${outstanding === 1 ? "document needs" : "documents need"} your acknowledgement.`}
      </p>
      {rows.length > 0 && (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th scope="col">Document</th>
                <th scope="col">Due</th>
                <th scope="col">Status</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id}>
                  <td>
                    <Link href={`/sign/${r.link_token}`}>{r.name}</Link>
                    {(r.category || r.version_label) && (
                      <span className="hint">
                        {[r.category, r.version_label && `Version ${r.version_label}`].filter(Boolean).join(" · ")}
                      </span>
                    )}
                  </td>
                  <td>{r.due_date ? formatDate(r.due_date) : "—"}</td>
                  <td>
                    {r.acknowledged_at ? (
                      <span className="badge ok">Signed {formatDateTime(r.acknowledged_at)}</span>
                    ) : r.status === "closed" ? (
                      <span className="badge muted">Closed</span>
                    ) : isOverdue(r.due_date) ? (
                      <span className="badge bad">Overdue</span>
                    ) : (
                      <span className="badge warn">To sign</span>
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
