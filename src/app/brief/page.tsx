import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { query } from "@/lib/db";
import { briefingDepartments } from "@/lib/departments";
import { formatDate, isOverdue } from "@/lib/format";
import { requireUser } from "@/lib/session";

export const metadata: Metadata = { title: "Brief staff" };

type Row = {
  id: string;
  name: string;
  category: string | null;
  version_label: string | null;
  due_date: string | null;
  expected: number;
  signed: number;
};

export default async function BriefListPage() {
  const user = await requireUser("/brief");
  const departments = await briefingDepartments(user.id);
  if (departments.length === 0) redirect("/my");
  const ids = departments.map((d) => d.id);

  // Open documents sent to one of the briefer's departments, with progress for those departments.
  const docs = await query<Row>(
    `SELECT d.id, d.name, c.name AS category, d.version_label, d.due_date,
            (SELECT count(*) FROM document_signers ds JOIN users u ON u.id = ds.user_id
              WHERE ds.document_id = d.id AND u.department_id = ANY($1::int[]))::int AS expected,
            (SELECT count(*) FROM document_signers ds JOIN users u ON u.id = ds.user_id
               JOIN acknowledgements a ON a.document_id = ds.document_id AND a.user_id = ds.user_id AND a.voided_at IS NULL
              WHERE ds.document_id = d.id AND u.department_id = ANY($1::int[]))::int AS signed
       FROM documents d
       LEFT JOIN document_categories c ON c.id = d.category_id
      WHERE d.status = 'open'
        AND (EXISTS (SELECT 1 FROM document_departments dd WHERE dd.document_id = d.id AND dd.department_id = ANY($1::int[]))
             OR EXISTS (SELECT 1 FROM document_signers ds JOIN users u ON u.id = ds.user_id
                         WHERE ds.document_id = d.id AND u.department_id = ANY($1::int[])))
      ORDER BY d.due_date NULLS LAST, lower(d.name)`,
    [ids],
  );

  return (
    <>
      <h1>Brief staff</h1>
      <p className="lead">
        Brief a document in person, then hand your device to each person to sign. Use this for staff in{" "}
        {departments.map((d) => d.name).join(", ")}, including anyone without an account.
      </p>
      {docs.length === 0 ? (
        <div className="card">
          <p>No open documents for your departments.</p>
        </div>
      ) : (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th scope="col">Document</th>
                <th scope="col">Due</th>
                <th scope="col">Your departments</th>
              </tr>
            </thead>
            <tbody>
              {docs.map((d) => (
                <tr key={d.id}>
                  <td>
                    <Link href={`/brief/${d.id}`}>{d.name}</Link>
                    <span className="hint">
                      {[d.category, d.version_label && `Version ${d.version_label}`].filter(Boolean).join(" · ")}
                    </span>
                  </td>
                  <td>
                    {d.due_date ? formatDate(d.due_date) : "—"}
                    {d.signed < d.expected && isOverdue(d.due_date) && (
                      <span className="badge bad" style={{ marginLeft: 6 }}>
                        Overdue
                      </span>
                    )}
                  </td>
                  <td>
                    {d.signed} of {d.expected} signed
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
