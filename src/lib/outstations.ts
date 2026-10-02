import { query, type Queryable } from "./db";

export type Outstation = { id: number; name: string };

export function listOutstations(db?: Queryable): Promise<Outstation[]> {
  return query<Outstation>("SELECT id, name FROM outstations ORDER BY sort_order, name", [], db);
}

/** Case-insensitive match of a typed or pasted outstation name. */
export function findOutstation(name: string, outstations: Outstation[]): Outstation | undefined {
  const wanted = name.trim().toLowerCase();
  return outstations.find((o) => o.name.toLowerCase() === wanted);
}

/** Reads an optional outstation id from a form field; undefined means the value isn't a real outstation. */
export function outstationIdFrom(
  value: FormDataEntryValue | null,
  outstations: Outstation[],
): number | null | undefined {
  if (value === null || value === "") return null;
  const id = Number(value);
  return outstations.some((o) => o.id === id) ? id : undefined;
}

export type DistributionList = { id: number; name: string };

export function listDistributionLists(db?: Queryable): Promise<DistributionList[]> {
  return query<DistributionList>("SELECT id, name FROM distribution_lists ORDER BY sort_order, name", [], db);
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
