import type { Metadata } from "next";
import { headers } from "next/headers";
import Link from "next/link";
import { notFound } from "next/navigation";
import { query, queryOne } from "@/lib/db";
import { formatDate, formatDateTime, isOverdue } from "@/lib/format";
import { listCategories, listDepartments } from "@/lib/departments";
import { appBaseUrl } from "@/lib/request";
import { requireAdmin } from "@/lib/session";
import { isUuid } from "@/lib/validation";
import { addMeAsSigner, removeSigner, setDocumentStatus } from "../../actions";
import { AddPeopleForm, CopyField, DocumentForm, GroupsForm, PersonLinkButton, VoidForm } from "../../components";

export const metadata: Metadata = { title: "Document" };

type Doc = {
  id: string;
  name: string;
  description: string | null;
  version_label: string | null;
  due_date: string | null;
  location_url: string | null;
  link_token: string;
  status: "open" | "closed";
  created_at: Date;
  category_id: number | null;
  category: string | null;
};

type Signer = {
  id: string;
  name: string;
  email: string;
  has_password: boolean;
  acknowledged_at: Date | null;
  department: string | null;
  individual: boolean;
  via_department: boolean;
};

type Ack = {
  id: string;
  signer_name: string;
  signer_email: string;
  signer_department: string | null;
  version_label: string | null;
  acknowledged_at: Date;
  ip_address: string | null;
  voided_at: Date | null;
  void_reason: string | null;
  voided_by_name: string | null;
  signature_method: "drawn" | "typed" | null;
};

export default async function DocumentAdminPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!isUuid(id)) notFound();
  const admin = await requireAdmin(`/admin/documents/${id}`);

  const doc = await queryOne<Doc>(
    `SELECT d.id, d.name, d.description, d.version_label, d.due_date, d.location_url, d.link_token, d.status,
            d.created_at, d.category_id, c.name AS category
       FROM documents d LEFT JOIN document_categories c ON c.id = d.category_id
      WHERE d.id = $1`,
    [id],
  );
  if (!doc) notFound();

  const [signers, acks, departments, selectedRows, categories] = await Promise.all([
    query<Signer>(
      `SELECT u.id, u.name, u.email, u.password_hash IS NOT NULL AS has_password, a.acknowledged_at,
              o.name AS department, ds.individual,
              EXISTS (SELECT 1 FROM document_departments dos
                       WHERE dos.document_id = ds.document_id AND dos.department_id = u.department_id) AS via_department
         FROM document_signers ds
         JOIN users u ON u.id = ds.user_id
         LEFT JOIN departments o ON o.id = u.department_id
         LEFT JOIN acknowledgements a
                ON a.document_id = ds.document_id AND a.user_id = ds.user_id AND a.voided_at IS NULL
        WHERE ds.document_id = $1
        ORDER BY a.acknowledged_at IS NOT NULL, o.sort_order NULLS LAST, lower(u.name)`,
      [id],
    ),
    query<Ack>(
      `SELECT a.id, a.signer_name, a.signer_email, a.signer_department, a.signature_method, a.version_label, a.acknowledged_at, a.ip_address,
              a.voided_at, a.void_reason, v.name AS voided_by_name
         FROM acknowledgements a LEFT JOIN users v ON v.id = a.voided_by
        WHERE a.document_id = $1
        ORDER BY a.acknowledged_at DESC`,
      [id],
    ),
    listDepartments(),
    query<{ department_id: number }>("SELECT department_id FROM document_departments WHERE document_id = $1", [id]),
    listCategories(),
  ]);
  const selected = selectedRows.map((r) => r.department_id);


  // Signed and outstanding per department, for the people currently expected.
  const byDepartment = new Map<string, { signed: number; total: number }>();
  for (const s of signers) {
    const key = s.department ?? "No department";
    const row = byDepartment.get(key) ?? { signed: 0, total: 0 };
    row.total += 1;
    if (s.acknowledged_at) row.signed += 1;
    byDepartment.set(key, row);
  }
  const departmentOrder = [...departments.map((o) => o.name), "No department"];
  const summary = [...byDepartment.entries()].sort(
    ([a], [b]) => departmentOrder.indexOf(a) - departmentOrder.indexOf(b),
  );

  const signLink = `${appBaseUrl(await headers())}/sign/${doc.link_token}`;
  const signed = signers.filter((s) => s.acknowledged_at).length;
  const overdue = isOverdue(doc.due_date);
  const me = signers.find((s) => s.id === admin.id);

  return (
    <>
      <p>
        <Link href="/admin">← Documents</Link>
      </p>
      <h1>
        {doc.name}{" "}
        <span className={`badge ${doc.status === "open" ? "ok" : "muted"}`}>
          {doc.status === "open" ? "Open" : "Closed"}
        </span>
      </h1>
      <p className="lead">
        {doc.category ?? "No category"} · {signed} of {signers.length} signed
        {doc.version_label && ` · Version ${doc.version_label}`}
        {doc.due_date && ` · Due ${formatDate(doc.due_date)}`}
        {overdue && signed < signers.length && " · Overdue"}
      </p>

      <section className="card" aria-labelledby="share-heading">
        <h2 id="share-heading" style={{ marginTop: 0 }}>
          Share link
        </h2>
        <p className="hint">
          Send this link to the people below by email, chat or intranet. They sign in, tick the box and confirm.
          Only people on this document&apos;s list can sign.
        </p>
        <CopyField value={signLink} label="Sign link" />
        <form action={setDocumentStatus} className="actions">
          <input type="hidden" name="id" value={doc.id} />
          <input type="hidden" name="status" value={doc.status === "open" ? "closed" : "open"} />
          <button type="submit" className="secondary">
            {doc.status === "open" ? "Close link (stop accepting signatures)" : "Reopen link"}
          </button>
        </form>
      </section>

      <section className="card" aria-labelledby="mine-heading">
        <h2 id="mine-heading" style={{ marginTop: 0 }}>
          Your acknowledgement
        </h2>
        {me?.acknowledged_at ? (
          <p className="notice ok" style={{ marginBottom: 0 }}>
            You acknowledged this document on {formatDateTime(me.acknowledged_at)}.
          </p>
        ) : me ? (
          doc.status === "open" ? (
            <div className="actions" style={{ marginTop: 0 }}>
              <Link href={`/sign/${doc.link_token}`} className="button">
                Sign this document
              </Link>
              <span className="hint">You&apos;re on this document&apos;s list and haven&apos;t signed yet.</span>
            </div>
          ) : (
            <p className="hint">You&apos;re on the list, but the link is closed. Reopen it to sign.</p>
          )
        ) : (
          <form action={addMeAsSigner} className="actions" style={{ marginTop: 0 }}>
            <input type="hidden" name="document_id" value={doc.id} />
            <button type="submit" name="then" value="stay" className="secondary">
              Add me to this list
            </button>
            {doc.status === "open" && (
              <button type="submit" name="then" value="sign">
                Add me and sign now
              </button>
            )}
            <span className="hint">Admins acknowledge documents the same way as everyone else.</span>
          </form>
        )}
      </section>

      <section className="card" aria-labelledby="departments-heading">
        <h2 id="departments-heading" style={{ marginTop: 0 }}>
          Who needs to acknowledge this
        </h2>
        <GroupsForm documentId={doc.id} departments={departments} selectedDepartments={selected} />
      </section>

      {summary.length > 0 && (
        <>
          <h2>Progress by department</h2>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th scope="col">Department</th>
                  <th scope="col">Signed</th>
                  <th scope="col">Outstanding</th>
                </tr>
              </thead>
              <tbody>
                {summary.map(([name, row]) => (
                  <tr key={name}>
                    <td>{name}</td>
                    <td>
                      {row.signed} of {row.total}
                    </td>
                    <td>{row.total - row.signed}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      <h2>People expected to sign ({signers.length})</h2>
      {signers.length === 0 ? (
        <p>No one yet. Tick departments above, or add people below.</p>
      ) : (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th scope="col">Name</th>
                <th scope="col">Department</th>
                <th scope="col">Status</th>
                <th scope="col">
                  <span className="visually-hidden">Actions</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {signers.map((s) => (
                <tr key={s.id}>
                  <td>
                    {s.name}
                    <span className="hint">{s.email}</span>
                  </td>
                  <td>
                    {s.department ?? <span className="hint">No department</span>}
                    {!s.via_department && <span className="hint">Added by name</span>}
                  </td>
                  <td>
                    {s.acknowledged_at ? (
                      <span className="badge ok">Signed {formatDateTime(s.acknowledged_at)}</span>
                    ) : overdue ? (
                      <span className="badge bad">Overdue</span>
                    ) : (
                      <span className="badge warn">Outstanding</span>
                    )}
                    {!s.has_password && (
                      <div style={{ marginTop: 6 }}>
                        <span className="badge muted">No password set yet</span>{" "}
                        <PersonLinkButton userId={s.id} hasPassword={false} />
                      </div>
                    )}
                  </td>
                  <td>
                    {s.via_department ? (
                      <span className="hint">Via {s.department}</span>
                    ) : (
                      <form action={removeSigner}>
                        <input type="hidden" name="document_id" value={doc.id} />
                        <input type="hidden" name="user_id" value={s.id} />
                        <button type="submit" className="link-button" aria-label={`Remove ${s.name} from this document`}>
                          Remove
                        </button>
                      </form>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <section className="card" aria-labelledby="add-heading">
        <h2 id="add-heading" style={{ marginTop: 0 }}>
          Add individual people
        </h2>
        <p className="hint">For people outside the ticked departments.</p>
        <AddPeopleForm documentId={doc.id} departments={departments} />
      </section>

      <h2>Acknowledgement records ({acks.length})</h2>
      {acks.length === 0 ? (
        <p>No acknowledgements yet.</p>
      ) : (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th scope="col">Name</th>
                <th scope="col">Signed</th>
                <th scope="col">Version</th>
                <th scope="col">Signature</th>
                <th scope="col">IP address</th>
                <th scope="col">Record</th>
              </tr>
            </thead>
            <tbody>
              {acks.map((a) => (
                <tr key={a.id}>
                  <td>
                    {a.signer_name}
                    <span className="hint">{a.signer_email}</span>
                    {a.signer_department && <span className="hint">{a.signer_department}</span>}
                  </td>
                  <td>{formatDateTime(a.acknowledged_at)}</td>
                  <td>{a.version_label ?? "—"}</td>
                  <td>
                    {a.signature_method ? (
                      <>
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          className="signature-img"
                          src={`/admin/signatures/${a.id}`}
                          alt={`Signature of ${a.signer_name}`}
                          loading="lazy"
                        />
                        {a.signature_method === "typed" && <span className="hint">Typed</span>}
                      </>
                    ) : (
                      <span className="hint">Ticked (before signatures)</span>
                    )}
                  </td>
                  <td>{a.ip_address ?? "—"}</td>
                  <td>
                    {a.voided_at ? (
                      <>
                        <span className="badge muted">Voided</span>
                        <span className="hint">
                          {formatDateTime(a.voided_at)} by {a.voided_by_name ?? "an admin"}: {a.void_reason}
                        </span>
                      </>
                    ) : (
                      <VoidForm acknowledgementId={a.id} signerName={a.signer_name} />
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <p className="hint">
        Records can&apos;t be edited or deleted. Voiding keeps the record and the reason.{" "}
        <a href={`/admin/export?document=${doc.id}`} download>
          Download CSV
        </a>
      </p>

      <h2>Document details</h2>
      <div className="card">
        <DocumentForm
          doc={{
            id: doc.id,
            name: doc.name,
            description: doc.description,
            version_label: doc.version_label,
            due_date: doc.due_date,
            location_url: doc.location_url,
            category_id: doc.category_id,
          }}
          categories={categories}
        />
        <p className="hint">
          Past acknowledgements keep the name and version they were signed under.
        </p>
      </div>
    </>
  );
}
