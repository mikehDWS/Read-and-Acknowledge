import type { Metadata } from "next";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { query } from "@/lib/db";
import { managedDepartments } from "@/lib/departments";
import { formatDate, formatDateTime, isOverdue } from "@/lib/format";
import { appBaseUrl } from "@/lib/request";
import { requireUser } from "@/lib/session";
import { CopyField } from "../admin/components";

export const metadata: Metadata = { title: "My team" };

type Row = {
  document_id: string;
  document_name: string;
  category: string | null;
  version_label: string | null;
  due_date: string | null;
  link_token: string;
  user_id: string;
  name: string;
  email: string | null;
  department: string;
  acknowledged_at: Date | null;
};

type DocGroup = {
  id: string;
  name: string;
  category: string | null;
  version: string | null;
  due: string | null;
  link: string;
  people: Row[];
};

export default async function TeamPage({ searchParams }: { searchParams: Promise<{ department?: string }> }) {
  const user = await requireUser("/team");
  const managed = await managedDepartments(user.id);
  if (managed.length === 0) redirect("/my");
  const { department } = await searchParams;
  const selected = managed.find((d) => String(d.id) === department) ?? null;
  const departmentIds = selected ? [selected.id] : managed.map((d) => d.id);

  // Everyone in the manager's departments who is expected to sign an open document.
  const rows = await query<Row>(
    `SELECT d.id AS document_id, d.name AS document_name, c.name AS category, d.version_label, d.due_date,
            d.link_token, u.id AS user_id, u.name, u.email, dep.name AS department, a.acknowledged_at
       FROM document_signers ds
       JOIN documents d ON d.id = ds.document_id AND d.status = 'open'
       LEFT JOIN document_categories c ON c.id = d.category_id
       JOIN users u ON u.id = ds.user_id
       JOIN departments dep ON dep.id = u.department_id
       LEFT JOIN acknowledgements a
              ON a.document_id = d.id AND a.user_id = u.id AND a.voided_at IS NULL
      WHERE u.department_id = ANY($1::int[])
      ORDER BY d.due_date NULLS LAST, lower(d.name), a.acknowledged_at IS NOT NULL, lower(u.name)`,
    [departmentIds],
  );

  const base = appBaseUrl(await headers());
  const groups = new Map<string, DocGroup>();
  for (const r of rows) {
    const g = groups.get(r.document_id) ?? {
      id: r.document_id,
      name: r.document_name,
      category: r.category,
      version: r.version_label,
      due: r.due_date,
      link: `${base}/sign/${r.link_token}`,
      people: [],
    };
    g.people.push(r);
    groups.set(r.document_id, g);
  }
  const docs = [...groups.values()];
  const outstanding = rows.filter((r) => !r.acknowledged_at).length;
  const scope = selected ? selected.name : managed.map((d) => d.name).join(", ");

  return (
    <>
      <h1>My team</h1>
      <p className="lead">
        {docs.length === 0
          ? `No open documents for ${scope}.`
          : outstanding === 0
            ? `Everyone in ${scope} is up to date.`
            : `${outstanding} ${outstanding === 1 ? "signature is" : "signatures are"} still needed in ${scope}.`}
      </p>

      {managed.length > 1 && (
        <nav className="tabs" aria-label="Filter by department">
          <a href="/team" className={selected ? "tab" : "tab current"} aria-current={selected ? undefined : "page"}>
            All my departments
          </a>
          {managed.map((d) => (
            <a
              key={d.id}
              href={`/team?department=${d.id}`}
              className={selected?.id === d.id ? "tab current" : "tab"}
              aria-current={selected?.id === d.id ? "page" : undefined}
            >
              {d.name}
            </a>
          ))}
        </nav>
      )}

      {docs.map((g) => {
        const signed = g.people.filter((p) => p.acknowledged_at).length;
        const late = isOverdue(g.due);
        return (
          <section key={g.id} className="card" aria-labelledby={`doc-${g.id}`}>
            <h2 id={`doc-${g.id}`} style={{ marginTop: 0 }}>
              {g.name}
            </h2>
            <p className="hint" style={{ marginTop: -8 }}>
              {[g.category, g.version && `Version ${g.version}`, g.due && `Due ${formatDate(g.due)}`]
                .filter(Boolean)
                .join(" · ")}
            </p>
            <p>
              <strong>
                {signed} of {g.people.length} signed
              </strong>
              {signed < g.people.length && late && <span className="badge bad" style={{ marginLeft: 8 }}>Overdue</span>}
            </p>
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th scope="col">Name</th>
                    <th scope="col">Department</th>
                    <th scope="col">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {g.people.map((p) => (
                    <tr key={p.user_id}>
                      <td>
                        {p.name}
                        <span className="hint">{p.email ?? "No login: brief them in person"}</span>
                      </td>
                      <td>{p.department}</td>
                      <td>
                        {p.acknowledged_at ? (
                          <span className="badge ok">Signed {formatDateTime(p.acknowledged_at)}</span>
                        ) : late ? (
                          <span className="badge bad">Overdue</span>
                        ) : (
                          <span className="badge warn">Needs to sign</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {signed < g.people.length && (
              <details style={{ marginTop: 12 }}>
                <summary>Sign link to send to your team</summary>
                <div style={{ marginTop: 8 }}>
                  <CopyField value={g.link} label={`Sign link for ${g.name}`} />
                </div>
              </details>
            )}
          </section>
        );
      })}
    </>
  );
}
