"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import {
  addPeople,
  addSigners,
  createDocument,
  createPersonLink,
  setDocumentDepartments,
  updateDocument,
  updatePerson,
  voidAcknowledgement,
  type AccountLinkState,
  type AddPeopleState,
  type DocumentFormState,
  type DepartmentsFormState,
  type PersonFormState,
  type VoidState,
} from "./actions";

type Department = { id: number; name: string };

type Group = { id: number; name: string };

/** A grid of tick boxes (or one-choice tick list when `single`) for departments. */
function GroupChecks({
  name,
  idPrefix,
  items,
  selected,
  single = false,
  noneLabel,
}: {
  name: string;
  idPrefix: string;
  items: Group[];
  selected: number[];
  single?: boolean;
  noneLabel?: string;
}) {
  return (
    <div className="check-grid">
      {items.map((o) => (
        <label key={o.id} className="check-item" htmlFor={`${idPrefix}-${o.id}`}>
          <input
            id={`${idPrefix}-${o.id}`}
            type={single ? "radio" : "checkbox"}
            name={name}
            value={o.id}
            defaultChecked={selected.includes(o.id)}
          />
          {o.name}
        </label>
      ))}
      {single && noneLabel && (
        <label className="check-item" htmlFor={`${idPrefix}-none`}>
          <input id={`${idPrefix}-none`} type="radio" name={name} value="" defaultChecked={selected.length === 0} />
          {noneLabel}
        </label>
      )}
    </div>
  );
}

function GroupPickers({ departments, selectedDepartments }: { departments: Group[]; selectedDepartments: number[] }) {
  return <GroupChecks name="department_ids" idPrefix="os" items={departments} selected={selectedDepartments} />;
}

function DepartmentSelect({
  id,
  departments,
  defaultValue,
  emptyLabel,
}: {
  id: string;
  departments: Department[];
  defaultValue?: number | null;
  emptyLabel: string;
}) {
  return (
    <select id={id} name="department_id" defaultValue={defaultValue ?? ""}>
      <option value="">{emptyLabel}</option>
      {departments.map((o) => (
        <option key={o.id} value={o.id}>
          {o.name}
        </option>
      ))}
    </select>
  );
}

/** Which departments need to acknowledge a document. */
export function GroupsForm({
  documentId,
  departments,
  selectedDepartments,
}: {
  documentId: string;
  departments: Group[];
  selectedDepartments: number[];
}) {
  const [state, action, pending] = useActionState<DepartmentsFormState, FormData>(setDocumentDepartments, {});
  return (
    <form action={action}>
      <input type="hidden" name="document_id" value={documentId} />
      <GroupPickers departments={departments} selectedDepartments={selectedDepartments} />
      {state.error && (
        <p className="notice bad" role="alert">
          {state.error}
        </p>
      )}
      {state.saved && (
        <p className="notice ok" role="status">
          Saved.
        </p>
      )}
      <div className="actions">
        <button type="submit" disabled={pending}>
          {pending ? "Saving…" : "Save"}
        </button>
        <span className="hint">
          Everyone in a ticked department needs to sign, including people who join later.
        </span>
      </div>
    </form>
  );
}

export function CopyField({ value, label }: { value: string; label: string }) {
  const [copied, setCopied] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  async function copy() {
    try {
      await navigator.clipboard.writeText(value);
    } catch {
      inputRef.current?.select();
      document.execCommand("copy");
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }
  return (
    <div className="copy-row">
      <input ref={inputRef} type="text" readOnly value={value} aria-label={label} onFocus={(e) => e.target.select()} />
      <button type="button" className="secondary" onClick={copy}>
        {copied ? "Copied" : "Copy"}
      </button>
      <span className="visually-hidden" aria-live="polite">
        {copied ? "Link copied" : ""}
      </span>
    </div>
  );
}

type DocumentValues = {
  id?: string;
  name: string;
  description: string | null;
  version_label: string | null;
  due_date: string | null;
  location_url: string | null;
  category_id?: number | null;
};

export function DocumentForm({
  doc,
  departments,
  categories,
}: {
  doc?: DocumentValues;
  departments?: Department[];
  categories: Group[];
}) {
  const [state, action, pending] = useActionState<DocumentFormState, FormData>(
    doc?.id ? updateDocument : createDocument,
    {},
  );
  return (
    <form action={action}>
      {state.error && (
        <p className="notice bad" role="alert">
          {state.error}
        </p>
      )}
      {state.saved && (
        <p className="notice ok" role="status">
          Changes saved.
        </p>
      )}
      {doc?.id && <input type="hidden" name="id" value={doc.id} />}
      <label htmlFor="name">Document name</label>
      <input id="name" name="name" type="text" required maxLength={200} defaultValue={doc?.name} />
      <label htmlFor="category_id">Category</label>
      <select id="category_id" name="category_id" required defaultValue={doc?.category_id ?? ""}>
        <option value="" disabled>
          Choose a category
        </option>
        {categories.map((c) => (
          <option key={c.id} value={c.id}>
            {c.name}
          </option>
        ))}
      </select>
      <label htmlFor="description">
        Description <span className="hint">Optional. Shown to readers on the sign page.</span>
      </label>
      <textarea id="description" name="description" maxLength={4000} defaultValue={doc?.description ?? ""} />
      <div className="grid-2">
        <div>
          <label htmlFor="version_label">
            Version <span className="hint">Optional, e.g. 2.1 or March 2026</span>
          </label>
          <input id="version_label" name="version_label" type="text" maxLength={100} defaultValue={doc?.version_label ?? ""} />
        </div>
        <div>
          <label htmlFor="due_date">
            Due date <span className="hint">Optional</span>
          </label>
          <input id="due_date" name="due_date" type="date" defaultValue={doc?.due_date ?? ""} />
        </div>
      </div>
      <label htmlFor="location_url">
        Where the document is held <span className="hint">Optional web link, e.g. an intranet page</span>
      </label>
      <input
        id="location_url"
        name="location_url"
        type="url"
        maxLength={2000}
        placeholder="https://"
        defaultValue={doc?.location_url ?? ""}
      />
      {!doc?.id && departments && departments.length > 0 && (
        <fieldset className="fieldset">
          <legend>
            Who needs to acknowledge this{" "}
            <span className="hint">
              Everyone in a ticked department will need to sign. You can also add individual people next.
            </span>
          </legend>
          <GroupPickers departments={departments} selectedDepartments={[]} />
        </fieldset>
      )}
      <div className="actions">
        <button type="submit" disabled={pending}>
          {pending ? "Saving…" : doc?.id ? "Save changes" : "Create document"}
        </button>
      </div>
    </form>
  );
}

export function AddPeopleForm({
  documentId,
  departments = [],
}: {
  documentId?: string;
  departments?: Department[];
}) {
  const [state, action, pending] = useActionState<AddPeopleState, FormData>(
    documentId ? addSigners : addPeople,
    {},
  );
  const formRef = useRef<HTMLFormElement>(null);
  useEffect(() => {
    if (state.summary && !state.problems?.length) formRef.current?.reset();
  }, [state]);

  return (
    <form action={action} ref={formRef}>
      {documentId && <input type="hidden" name="document_id" value={documentId} />}
      <label htmlFor="people">
        People
        <span className="hint">
          One per line: <code>Name, email</code>, optionally with a department:{" "}
          <code>Name, email, Ferrybridge</code>. You can paste columns straight from a spreadsheet.
          New email addresses get a reader account.
        </span>
      </label>
      <textarea id="people" name="people" placeholder={"Sam Patel, sam.patel@example.com\nAlex Jones, alex.jones@example.com, Humber"} />
      {departments.length > 0 && (
        <>
          <p className="group-label">
            Department{" "}
            <span className="hint">
              Pick one. It applies to anyone without a department yet; a department on a line takes priority.
            </span>
          </p>
          <GroupChecks
            name="department_id"
            idPrefix={documentId ? "add-os" : "people-os"}
            items={departments}
            selected={[]}
            single
            noneLabel="Don't set"
          />
        </>
      )}
      {state.error && (
        <p className="notice bad" role="alert">
          {state.error}
        </p>
      )}
      {state.summary && (
        <p className="notice ok" role="status">
          {documentId
            ? `Added ${state.summary.added} to this document${state.summary.alreadyListed ? `; ${state.summary.alreadyListed} were already on the list` : ""}. ${state.summary.newAccounts} new ${state.summary.newAccounts === 1 ? "account" : "accounts"} created.`
            : `${state.summary.newAccounts} new ${state.summary.newAccounts === 1 ? "account" : "accounts"} created${state.summary.alreadyListed ? `; ${state.summary.alreadyListed} already had accounts` : ""}.`}
          {state.summary.newAccounts > 0 && " New people need a set-password link before they can sign in."}
        </p>
      )}
      {state.problems && state.problems.length > 0 && (
        <div className="notice warn" role="alert">
          <p style={{ margin: 0 }}>These lines were skipped:</p>
          <ul>
            {state.problems.map((p) => (
              <li key={p.line}>
                Line {p.line}: <code>{p.text}</code> ({p.reason})
              </li>
            ))}
          </ul>
        </div>
      )}
      <div className="actions">
        <button type="submit" disabled={pending}>
          {pending ? "Adding…" : documentId ? "Add to this document" : "Add people"}
        </button>
      </div>
    </form>
  );
}

export function PersonLinkButton({ userId, hasPassword }: { userId: string; hasPassword: boolean }) {
  const [state, action, pending] = useActionState<AccountLinkState, FormData>(createPersonLink, {});
  if (state.url) {
    return (
      <div>
        <CopyField value={state.url} label="Set-password link" />
        <span className="hint">
          Share this with them yourself. It works once and expires in 7 days. Any older link stops working.
        </span>
      </div>
    );
  }
  return (
    <form action={action} style={{ display: "inline" }}>
      <input type="hidden" name="id" value={userId} />
      <button type="submit" className="secondary" disabled={pending}>
        {hasPassword ? "Create reset link" : "Create set-password link"}
      </button>
      {state.error && <span className="badge bad">{state.error}</span>}
    </form>
  );
}

type PersonValues = {
  id: string;
  name: string;
  email: string;
  employee_id: string | null;
  department_id: number | null;
};

export function PersonEditForm({
  person,
  departments,
}: {
  person: PersonValues;
  departments: Department[];
}) {
  const [state, action, pending] = useActionState<PersonFormState, FormData>(updatePerson, {});
  return (
    <details>
      <summary>Edit</summary>
      <form action={action}>
        <input type="hidden" name="id" value={person.id} />
        <label htmlFor={`name-${person.id}`}>Name</label>
        <input id={`name-${person.id}`} name="name" type="text" required defaultValue={person.name} />
        <label htmlFor={`email-${person.id}`}>Email</label>
        <input id={`email-${person.id}`} name="email" type="email" required defaultValue={person.email} />
        <label htmlFor={`emp-${person.id}`}>
          Employee ID <span className="hint">Optional. Never shown to other readers.</span>
        </label>
        <input id={`emp-${person.id}`} name="employee_id" type="text" defaultValue={person.employee_id ?? ""} />
        <label htmlFor={`os-${person.id}`}>Department</label>
        <DepartmentSelect
          id={`os-${person.id}`}
          departments={departments}
          defaultValue={person.department_id}
          emptyLabel="No department"
        />

        {state.error && (
          <p className="notice bad" role="alert">
            {state.error}
          </p>
        )}
        {state.saved && (
          <p className="notice ok" role="status">
            Saved.
          </p>
        )}
        <div className="actions">
          <button type="submit" disabled={pending}>
            Save
          </button>
        </div>
      </form>
    </details>
  );
}

export function VoidForm({ acknowledgementId, signerName }: { acknowledgementId: string; signerName: string }) {
  const [state, action, pending] = useActionState<VoidState, FormData>(voidAcknowledgement, {});
  return (
    <details>
      <summary>Void</summary>
      <form action={action}>
        <input type="hidden" name="id" value={acknowledgementId} />
        <label htmlFor={`reason-${acknowledgementId}`}>
          Reason <span className="hint">Kept in the record. {signerName} will be able to sign again.</span>
        </label>
        <input id={`reason-${acknowledgementId}`} name="reason" type="text" required maxLength={1000} />
        {state.error && (
          <p className="notice bad" role="alert">
            {state.error}
          </p>
        )}
        <div className="actions">
          <button type="submit" className="danger" disabled={pending}>
            Void acknowledgement
          </button>
        </div>
      </form>
    </details>
  );
}
