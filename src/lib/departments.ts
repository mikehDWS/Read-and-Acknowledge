import { query, type Queryable } from "./db";

export type Department = { id: number; name: string };

export function listDepartments(db?: Queryable): Promise<Department[]> {
  return query<Department>("SELECT id, name FROM departments ORDER BY sort_order, name", [], db);
}

/** Case-insensitive match of a typed or pasted department name. */
export function findDepartment(name: string, departments: Department[]): Department | undefined {
  const wanted = name.trim().toLowerCase();
  return departments.find((o) => o.name.toLowerCase() === wanted);
}

/** Reads an optional department id from a form field; undefined means the value isn't a real department. */
export function departmentIdFrom(
  value: FormDataEntryValue | null,
  departments: Department[],
): number | null | undefined {
  if (value === null || value === "") return null;
  const id = Number(value);
  return departments.some((o) => o.id === id) ? id : undefined;
}

/** The ids ticked in a group of checkboxes, keeping only ones that exist. */
export function idsFrom(form: FormData, field: string, valid: { id: number }[]): number[] {
  const known = new Set(valid.map((v) => v.id));
  return [...new Set(form.getAll(field).map(Number))].filter((id) => known.has(id));
}

export type DocumentCategory = { id: number; name: string };

export function listCategories(db?: Queryable): Promise<DocumentCategory[]> {
  return query<DocumentCategory>("SELECT id, name FROM document_categories ORDER BY sort_order, name", [], db);
}

/** Departments a person manages, in list order. */
export function managedDepartments(userId: string, db?: Queryable): Promise<Department[]> {
  return query<Department>(
    `SELECT d.id, d.name FROM department_managers dm JOIN departments d ON d.id = dm.department_id
      WHERE dm.user_id = $1 ORDER BY d.sort_order, d.name`,
    [userId],
    db,
  );
}

/** Departments a person can run briefings for: the ones they manage, plus their own if a supervisor. */
export function briefingDepartments(userId: string, db?: Queryable): Promise<Department[]> {
  return query<Department>(
    `SELECT d.id, d.name FROM departments d
      WHERE d.id IN (SELECT dm.department_id FROM department_managers dm WHERE dm.user_id = $1)
         OR d.id = (SELECT u.department_id FROM users u WHERE u.id = $1 AND u.is_supervisor)
      ORDER BY d.sort_order, d.name`,
    [userId],
    db,
  );
}
