import type { Metadata } from "next";
import Link from "next/link";
import { query } from "@/lib/db";
import { formatDate, isOverdue } from "@/lib/format";
import { listOutstations } from "@/lib/outstations";
import { requireAdmin } from "@/lib/session";

export const metadata: Metadata = { title: "Documents" };

type Row = {
  id: string;
  name: string;
  version_label: string | null;
  due_date: string | null;
  status: "open" | "closed";
  expected: number;
  signed: number;
  outstations: string[];
};

export default async function AdminDashboard() {
  await requireAdmin("/admin");
  const outstations = await listOutstations();
  const docs = await query<Row>(
    `SELECT d.id, d.name, d.version_label, d.due_date, d.status,
            (SELECT count(*) FROM document_signers es WHERE es.document_id = d.id)::int AS expected,
            (SELECT count(*) FROM document_signers es
               JOIN acknowledgements a
                 ON a.document_id = es.document_id AND a.user_id = es.user_id AND a.voided_at IS NULL
              WHERE es.document_id = d.id)::int AS signed,
            ARRAY(SELECT o.name FROM document_outstations dos JOIN outstations o ON o.id = dos.outstation_id
                   WHERE dos.document_id = d.id ORDER BY o.sort_order, o.name) AS outstations
       FROM documents d
      ORDER BY d.status = 'closed', d.due_date NULLS LAST, d.created_at DESC`,
  );

  return (
    <>
      <div className="actions" style={{ justifyContent: "space-between", marginTop: 0 }}>
        <h1 style={{ margin: 0 }}>Documents</h1>
        <Link href="/admin/documents/new" className="button">
          New document
        </Link>
      </div>

      {docs.length === 0 ? (
        <div className="card">
          <p>No documents yet. Create one, add the people who need to sign it, then share its link.</p>
        </div>
      ) : (
        <div className="table-wrap" style={{ marginTop: 16 }}>
          <table>
            <thead>
              <tr>
                <th scope="col">Document</th>
                <th scope="col">Outstations</th>
                <th scope="col">Due</th>
                <th scope="col">Signed</th>
                <th scope="col">Outstanding</th>
                <th scope="col">Status</th>
              </tr>
            </thead>
            <tbody>
              {docs.map((d) => {
                const outstanding = d.expected - d.signed;
                return (
                  <tr key={d.id}>
                    <td>
                      <Link href={`/admin/documents/${d.id}`}>{d.name}</Link>
                      {d.version_label && <span className="hint">Version {d.version_label}</span>}
                    </td>
                    <td>
                      {d.outstations.length === 0 ? (
                        <span className="hint">Named people only</span>
                      ) : d.outstations.length === outstations.length ? (
                        "All outstations"
                      ) : (
                        d.outstations.join(", ")
                      )}
                    </td>
                    <td>
                      {d.due_date ? formatDate(d.due_date) : "—"}
                      {outstanding > 0 && d.status === "open" && isOverdue(d.due_date) && (
                        <span className="badge bad" style={{ marginLeft: 6 }}>Overdue</span>
                      )}
                    </td>
                    <td>
                      {d.signed} of {d.expected}
                      {d.expected > 0 && <span className="hint">{Math.round((d.signed / d.expected) * 100)}%</span>}
                    </td>
                    <td>{outstanding}</td>
                    <td>
                      <span className={`badge ${d.status === "open" ? "ok" : "muted"}`}>
                        {d.status === "open" ? "Open" : "Closed"}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <h2>Export acknowledgements</h2>
      <form className="card" method="get" action="/admin/export">
        <div className="grid-2">
          <div>
            <label htmlFor="document">Document</label>
            <select id="document" name="document" defaultValue="">
              <option value="">All documents</option>
              {docs.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name}
                  {d.version_label ? ` (${d.version_label})` : ""}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="export-outstation">Outstation</label>
            <select id="export-outstation" name="outstation" defaultValue="">
              <option value="">All outstations</option>
              {outstations.map((o) => (
                <option key={o.id} value={o.name}>
                  {o.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="from">Signed from</label>
            <input id="from" name="from" type="date" />
          </div>
          <div>
            <label htmlFor="to">Signed to</label>
            <input id="to" name="to" type="date" />
          </div>
        </div>
        <div className="actions">
          <button type="submit">Download CSV</button>
          <span className="hint">
            Includes voided records, marked as voided. The outstation is the one each person was at when they signed.
          </span>
        </div>
      </form>
    </>
  );
}
