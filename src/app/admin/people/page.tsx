import type { Metadata } from "next";
import { query } from "@/lib/db";
import { listDepartments } from "@/lib/departments";
import { requireAdmin } from "@/lib/session";
import { setRole } from "../actions";
import { AddPeopleForm, PersonEditForm, PersonLinkButton } from "../components";

export const metadata: Metadata = { title: "People" };

type Person = {
  id: string;
  name: string;
  email: string | null;
  employee_id: string | null;
  department_id: number | null;
  department: string | null;
  manages_ids: number[];
  manages: string[];
  role: "reader" | "admin";
  has_password: boolean;
  is_supervisor: boolean;
  locked: boolean;
  documents: number;
};

export default async function PeoplePage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; department?: string }>;
}) {
  const admin = await requireAdmin("/admin/people");
  const { q, department } = await searchParams;
  const search = q?.trim().slice(0, 200) ?? "";
  const departments = await listDepartments();
  // "none" lists people without a department; a number lists one department.
  const departmentFilter =
    department === "none" ? "none" : departments.find((o) => String(o.id) === department)?.id ?? null;
  const people = await query<Person>(
    `SELECT u.id, u.name, u.email, u.employee_id, u.department_id, o.name AS department, u.role, u.is_supervisor,
            ARRAY(SELECT dm.department_id FROM department_managers dm JOIN departments md ON md.id = dm.department_id
                   WHERE dm.user_id = u.id ORDER BY md.sort_order) AS manages_ids,
            ARRAY(SELECT md.name FROM department_managers dm JOIN departments md ON md.id = dm.department_id
                   WHERE dm.user_id = u.id ORDER BY md.sort_order) AS manages,

            u.password_hash IS NOT NULL AS has_password,
            coalesce(u.locked_until > now(), false) AS locked,
            (SELECT count(*) FROM document_signers es WHERE es.user_id = u.id)::int AS documents
       FROM users u
       LEFT JOIN departments o ON o.id = u.department_id
      WHERE ($1 = '' OR u.name ILIKE '%' || $1 || '%' OR u.email ILIKE '%' || $1 || '%')
        AND ($2::text IS NULL
             OR ($2 = 'none' AND u.department_id IS NULL)
             OR u.department_id::text = $2)
      ORDER BY lower(u.name)
      LIMIT 500`,
    [search.replace(/[\\%_]/g, (c) => `\\${c}`), departmentFilter === null ? null : String(departmentFilter)],
  );

  return (
    <>
      <h1>People</h1>
      <p className="lead">
        Everyone who signs in: readers and admins. New people need a set-password link before they can sign in.
        v1 doesn&apos;t send email, so copy the link and share it yourself.
      </p>

      <form method="get" className="filters" role="search">
        <label htmlFor="q" className="visually-hidden">
          Search people
        </label>
        <input id="q" name="q" type="search" placeholder="Search by name or email" defaultValue={search} />
        <label htmlFor="department-filter" className="visually-hidden">
          Department
        </label>
        <select id="department-filter" name="department" defaultValue={departmentFilter === null ? "" : String(departmentFilter)}>
          <option value="">All departments</option>
          {departments.map((o) => (
            <option key={o.id} value={o.id}>
              {o.name}
            </option>
          ))}
          <option value="none">No department</option>
        </select>

        <button type="submit" className="secondary">
          Search
        </button>
      </form>

      {people.length === 0 ? (
        <p>No people found.</p>
      ) : (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th scope="col">Name</th>
                <th scope="col">Department</th>
                <th scope="col">Account</th>
                <th scope="col">Role</th>
                <th scope="col">
                  <span className="visually-hidden">Actions</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {people.map((p) => (
                <tr key={p.id}>
                  <td>
                    {p.name}
                    <span className="hint">{p.email ?? "No email"}</span>
                    {p.employee_id && <span className="hint">ID {p.employee_id}</span>}
                    <span className="hint">
                      {p.documents} {p.documents === 1 ? "document" : "documents"}
                    </span>
                  </td>
                  <td>
                    {p.department ?? <span className="hint">No department</span>}
                    {p.manages.length > 0 && <span className="hint">Manages {p.manages.join(", ")}</span>}
                    {p.is_supervisor && <span className="hint">Supervisor</span>}
                  </td>
                  <td>
                    {p.has_password ? (
                      <span className="badge ok">Active</span>
                    ) : p.email ? (
                      <span className="badge muted">No password set</span>
                    ) : (
                      <span className="badge muted">No login</span>
                    )}
                    {p.locked && <span className="badge bad">Locked for now</span>}
                    <div style={{ marginTop: 6 }}>
                      {p.email ? (
                        <PersonLinkButton userId={p.id} hasPassword={p.has_password} />
                      ) : (
                        <span className="hint">Signs at briefings. Add an email to give them a login.</span>
                      )}
                    </div>
                  </td>
                  <td>
                    {p.role === "admin" ? "Admin" : "Reader"}
                    {p.id !== admin.id && (
                      <form action={setRole}>
                        <input type="hidden" name="id" value={p.id} />
                        <input type="hidden" name="role" value={p.role === "admin" ? "reader" : "admin"} />
                        <button type="submit" className="link-button" style={{ display: "block" }}>
                          {p.role === "admin" ? "Remove admin" : "Make admin"}
                        </button>
                      </form>
                    )}
                  </td>
                  <td>
                    <PersonEditForm person={p} departments={departments} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <section className="card" aria-labelledby="add-people-heading" style={{ marginTop: 24 }}>
        <h2 id="add-people-heading" style={{ marginTop: 0 }}>
          Add people
        </h2>
        <AddPeopleForm departments={departments} />
      </section>
    </>
  );
}
