import type { Metadata } from "next";
import Link from "next/link";
import { query } from "@/lib/db";
import { formatDate, isOverdue } from "@/lib/format";
import { listCategories, listDepartments } from "@/lib/departments";
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
  departments: string[];
  category: string | null;
};

export default async function AdminDashboard({ searchParams }: { searchParams: Promise<{ category?: string }> }) {
  await requireAdmin("/admin");
  const { category } = await searchParams;
  const [departments, categories, allDocs] = await Promise.all([
    listDepartments(),
    listCategories(),
    query<{ id: string; name: string; version_label: string | null }>(
      "SELECT id, name, version_label FROM documents ORDER BY lower(name)",
    ),
  ]);
  // "none" shows documents without a category; a number shows one category.
  const categoryFilter =
    category === "none" ? "none" : categories.find((c) => String(c.id) === category)?.id ?? null;
  const docs = await query<Row>(
    `SELECT d.id, d.name, d.version_label, d.due_date, d.status, c.name AS category,
            (SELECT count(*) FROM document_signers es WHERE es.document_id = d.id)::int AS expected,
            (SELECT count(*) FROM document_signers es
               JOIN acknowledgements a
                 ON a.document_id = es.document_id AND a.user_id = es.user_id AND a.voided_at IS NULL
              WHERE es.document_id = d.id)::int AS signed,
            ARRAY(SELECT o.name FROM document_departments dos JOIN departments o ON o.id = dos.department_id
                   WHERE dos.document_id = d.id ORDER BY o.sort_order, o.name) AS departments
       FROM documents d
       LEFT JOIN document_categories c ON c.id = d.category_id
      WHERE $1::text IS NULL
         OR ($1 = 'none' AND d.category_id IS NULL)
         OR d.category_id::text = $1
      ORDER BY d.status = 'closed', d.due_date NULLS LAST, d.created_at DESC`,
    [categoryFilter === null ? null : String(categoryFilter)],
  );
  const uncategorised = await query<{ n: number }>("SELECT count(*)::int AS n FROM documents WHERE category_id IS NULL");
  const tabs = [
    { key: "", label: "All" },
    ...categories.map((c) => ({ key: String(c.id), label: c.name })),
    ...(uncategorised[0].n > 0 ? [{ key: "none", label: "No category" }] : []),
  ];
  const activeTab = categoryFilter === null ? "" : String(categoryFilter);

  return (
    <>
      <div className="actions" style={{ justifyContent: "space-between", marginTop: 0 }}>
        <h1 style={{ margin: 0 }}>Documents</h1>
        <Link href="/admin/documents/new" className="button">
          New document
        </Link>
      </div>

      <nav className="tabs" aria-label="Filter by category">
        {tabs.map((t) => (
          <Link
            key={t.key || "all"}
            href={t.key ? `/admin?category=${t.key}` : "/admin"}
            className={t.key === activeTab ? "tab current" : "tab"}
            aria-current={t.key === activeTab ? "page" : undefined}
          >
            {t.label}
          </Link>
        ))}
      </nav>

      {docs.length === 0 ? (
        <div className="card">
          <p>
            {allDocs.length === 0
              ? "No documents yet. Create one, choose who needs to sign it, then share its link."
              : "No documents in this category."}
          </p>
        </div>
      ) : (
        <div className="table-wrap" style={{ marginTop: 16 }}>
          <table>
            <thead>
              <tr>
                <th scope="col">Document</th>
                <th scope="col">Sent to</th>
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
                      <span className="hint">
                        {d.category ?? "No category"}
                        {d.version_label && ` · Version ${d.version_label}`}
                      </span>
                    </td>
                    <td>
                      {d.departments.length === 0 ? (
                        <span className="hint">Named people only</span>
                      ) : d.departments.length === departments.length ? (
                        "All departments"
                      ) : (
                        d.departments.join(", ")
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
              {allDocs.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name}
                  {d.version_label ? ` (${d.version_label})` : ""}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="export-department">Department</label>
            <select id="export-department" name="department" defaultValue="">
              <option value="">All departments</option>
              {departments.map((o) => (
                <option key={o.id} value={o.name}>
                  {o.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="export-category">Category</label>
            <select id="export-category" name="category" defaultValue="">
              <option value="">All categories</option>
              {categories.map((c) => (
                <option key={c.id} value={c.name}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>
          <div />
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
            Includes voided records, marked as voided. The department is the one each person was in when they signed.
          </span>
        </div>
      </form>
    </>
  );
}
