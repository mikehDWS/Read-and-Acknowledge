import type { Metadata } from "next";
import { query } from "@/lib/db";
import { listOutstations } from "@/lib/outstations";
import { requireAdmin } from "@/lib/session";
import { setRole } from "../actions";
import { AddPeopleForm, PersonEditForm, PersonLinkButton } from "../components";

export const metadata: Metadata = { title: "People" };

type Person = {
  id: string;
  name: string;
  email: string;
  employee_id: string | null;
  outstation_id: number | null;
  outstation: string | null;
  role: "reader" | "admin";
  has_password: boolean;
  locked: boolean;
  documents: number;
};

export default async function PeoplePage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; outstation?: string }>;
}) {
  const admin = await requireAdmin("/admin/people");
  const { q, outstation } = await searchParams;
  const search = q?.trim().slice(0, 200) ?? "";
  const outstations = await listOutstations();
  // "none" lists people without an outstation; a number lists one outstation.
  const outstationFilter =
    outstation === "none" ? "none" : outstations.find((o) => String(o.id) === outstation)?.id ?? null;
  const people = await query<Person>(
    `SELECT u.id, u.name, u.email, u.employee_id, u.outstation_id, o.name AS outstation, u.role,
            u.password_hash IS NOT NULL AS has_password,
            coalesce(u.locked_until > now(), false) AS locked,
            (SELECT count(*) FROM document_signers es WHERE es.user_id = u.id)::int AS documents
       FROM users u
       LEFT JOIN outstations o ON o.id = u.outstation_id
      WHERE ($1 = '' OR u.name ILIKE '%' || $1 || '%' OR u.email ILIKE '%' || $1 || '%')
        AND ($2::text IS NULL
             OR ($2 = 'none' AND u.outstation_id IS NULL)
             OR u.outstation_id::text = $2)
      ORDER BY lower(u.name)
      LIMIT 500`,
    [search.replace(/[\\%_]/g, (c) => `\\${c}`), outstationFilter === null ? null : String(outstationFilter)],
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
        <label htmlFor="outstation-filter" className="visually-hidden">
          Outstation
        </label>
        <select id="outstation-filter" name="outstation" defaultValue={outstationFilter === null ? "" : String(outstationFilter)}>
          <option value="">All outstations</option>
          {outstations.map((o) => (
            <option key={o.id} value={o.id}>
              {o.name}
            </option>
          ))}
          <option value="none">No outstation</option>
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
                <th scope="col">Outstation</th>
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
                    <span className="hint">{p.email}</span>
                    {p.employee_id && <span className="hint">ID {p.employee_id}</span>}
                    <span className="hint">
                      {p.documents} {p.documents === 1 ? "document" : "documents"}
                    </span>
                  </td>
                  <td>{p.outstation ?? <span className="hint">Not set</span>}</td>
                  <td>
                    {p.has_password ? (
                      <span className="badge ok">Active</span>
                    ) : (
                      <span className="badge muted">No password set</span>
                    )}
                    {p.locked && <span className="badge bad">Locked for now</span>}
                    <div style={{ marginTop: 6 }}>
                      <PersonLinkButton userId={p.id} hasPassword={p.has_password} />
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
                    <PersonEditForm person={p} outstations={outstations} />
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
        <AddPeopleForm outstations={outstations} />
      </section>
    </>
  );
}
