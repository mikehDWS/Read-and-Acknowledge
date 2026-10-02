import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { query, queryOne } from "@/lib/db";
import { briefingDepartments } from "@/lib/departments";
import { formatDate, formatDateTime } from "@/lib/format";
import { requireUser } from "@/lib/session";
import { isUuid } from "@/lib/validation";
import BriefingForm from "./BriefingForm";

export const metadata: Metadata = { title: "Brief a document" };

type Doc = {
  id: string;
  name: string;
  description: string | null;
  version_label: string | null;
  category: string | null;
  due_date: string | null;
  location_url: string | null;
  status: "open" | "closed";
};

type Person = {
  id: string;
  name: string;
  department: string;
  has_login: boolean;
  is_expected: boolean;
  acknowledged_at: Date | null;
  briefed_by_name: string | null;
};

export default async function BriefPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!isUuid(id)) notFound();
  const user = await requireUser(`/brief/${id}`);
  const departments = await briefingDepartments(user.id);
  if (departments.length === 0) redirect("/my");

  const doc = await queryOne<Doc>(
    `SELECT d.id, d.name, d.description, d.version_label, c.name AS category, d.due_date, d.location_url, d.status
       FROM documents d LEFT JOIN document_categories c ON c.id = d.category_id WHERE d.id = $1`,
    [id],
  );
  if (!doc) notFound();

  // Everyone in the briefer's departments, whether or not the document was sent to them.
  const people = await query<Person>(
    `SELECT u.id, u.name, dep.name AS department, u.password_hash IS NOT NULL AS has_login,
            EXISTS (SELECT 1 FROM document_signers ds WHERE ds.document_id = $1 AND ds.user_id = u.id) AS is_expected,
            a.acknowledged_at, a.briefed_by_name
       FROM users u
       JOIN departments dep ON dep.id = u.department_id
       LEFT JOIN acknowledgements a ON a.document_id = $1 AND a.user_id = u.id AND a.voided_at IS NULL
      WHERE u.department_id = ANY($2::int[])
      ORDER BY dep.sort_order, lower(u.name)`,
    [doc.id, departments.map((d) => d.id)],
  );
  const signed = people.filter((p) => p.acknowledged_at);
  const outstanding = people
    .filter((p) => !p.acknowledged_at)
    .map((p) => ({ id: p.id, name: p.name, department: p.department, hasLogin: p.has_login, isExpected: p.is_expected }));

  return (
    <>
      <p>
        <Link href="/brief">← All briefings</Link>
      </p>
      <h1>{doc.name}</h1>
      <dl className="meta">
        {doc.category && (
          <>
            <dt>Category</dt>
            <dd>{doc.category}</dd>
          </>
        )}
        {doc.version_label && (
          <>
            <dt>Version</dt>
            <dd>{doc.version_label}</dd>
          </>
        )}
        {doc.due_date && (
          <>
            <dt>Due</dt>
            <dd>{formatDate(doc.due_date)}</dd>
          </>
        )}
        <dt>Briefed by</dt>
        <dd>{user.name}</dd>
      </dl>
      {doc.description && <p style={{ whiteSpace: "pre-line" }}>{doc.description}</p>}
      {doc.location_url && (
        <p>
          <a href={doc.location_url} target="_blank" rel="noopener noreferrer">
            Open the document
          </a>{" "}
          <span className="hint">Opens in a new tab.</span>
        </p>
      )}

      {doc.status === "closed" ? (
        <p className="notice warn">This document is no longer accepting acknowledgements.</p>
      ) : (
        <div className="card" style={{ maxWidth: 640 }}>
          <h2 style={{ marginTop: 0 }}>Sign after the briefing</h2>
          <p className="hint">
            Once you&apos;ve briefed the document, hand your device to each person in turn. The record shows you
            gave the briefing.
          </p>
          <BriefingForm documentId={doc.id} people={outstanding} departments={departments} />
        </div>
      )}

      <h2>Signed in your departments ({signed.length})</h2>
      {signed.length === 0 ? (
        <p className="hint">Nobody in your departments has signed yet.</p>
      ) : (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th scope="col">Name</th>
                <th scope="col">Department</th>
                <th scope="col">Signed</th>
                <th scope="col">How</th>
              </tr>
            </thead>
            <tbody>
              {signed.map((p) => (
                <tr key={p.id}>
                  <td>{p.name}</td>
                  <td>{p.department}</td>
                  <td>{formatDateTime(p.acknowledged_at!)}</td>
                  <td>{p.briefed_by_name ? `Briefed by ${p.briefed_by_name}` : "Signed online"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
