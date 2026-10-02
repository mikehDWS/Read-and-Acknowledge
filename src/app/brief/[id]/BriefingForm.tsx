"use client";

import { useActionState, useState } from "react";
import SignaturePad, { type SignatureValue } from "@/components/SignaturePad";
import { formatDateTime } from "@/lib/format";
import { ACKNOWLEDGEMENT_STATEMENT } from "@/lib/statement";
import { recordBriefing, type BriefingState } from "../actions";

type Person = { id: string; name: string; department: string; hasLogin: boolean; isExpected: boolean };

export default function BriefingForm({
  documentId,
  people,
  departments,
}: {
  documentId: string;
  people: Person[];
  departments: { id: number; name: string }[];
}) {
  const [state, action, pending] = useActionState<BriefingState, FormData>(recordBriefing, {});
  return (
    <>
      {state.signed && (
        <p className="notice ok" role="status">
          <strong>
            Signed by {state.signed.name} on {formatDateTime(new Date(state.signed.at))}.
          </strong>{" "}
          Hand the device to the next person.
        </p>
      )}
      {state.error && <p className="notice bad">{state.error}</p>}
      {/* A fresh form after each signature, so nothing carries over to the next person. */}
      <SignerForm
        key={state.round ?? 0}
        action={action}
        pending={pending}
        documentId={documentId}
        people={people}
        departments={departments}
      />
    </>
  );
}

function SignerForm({
  action,
  pending,
  documentId,
  people,
  departments,
}: {
  action: (form: FormData) => void;
  pending: boolean;
  documentId: string;
  people: Person[];
  departments: { id: number; name: string }[];
}) {
  const [personId, setPersonId] = useState("");
  const [newName, setNewName] = useState("");
  const [sig, setSig] = useState<SignatureValue>({ dataUrl: "", method: "drawn", typedName: "" });
  const isNew = personId === "new";
  const signerName = isNew ? newName : people.find((p) => p.id === personId)?.name ?? "";
  const ready =
    !!personId && (!isNew || !!newName.trim()) && !!sig.dataUrl && (sig.method === "drawn" || !!sig.typedName.trim());

  return (
    <form action={action}>
      <input type="hidden" name="document_id" value={documentId} />
      <input type="hidden" name="signature" value={sig.dataUrl} />
      <input type="hidden" name="signature_method" value={sig.method} />
      <input type="hidden" name="typed_name" value={sig.method === "typed" ? sig.typedName : ""} />

      <label htmlFor="person_id">Who is signing?</label>
      <select id="person_id" name="person_id" value={personId} onChange={(e) => setPersonId(e.target.value)} disabled={pending}>
        <option value="">Choose a person</option>
        {people.map((p) => (
          <option key={p.id} value={p.id}>
            {p.name} ({p.department}){!p.hasLogin && " · no account"}
            {!p.isExpected && " · not on the list yet"}
          </option>
        ))}
        <option value="new">Someone not listed…</option>
      </select>

      {isNew && (
        <div className="grid-2">
          <div>
            <label htmlFor="new_name">Full name</label>
            <input id="new_name" name="new_name" value={newName} onChange={(e) => setNewName(e.target.value)} required />
          </div>
          <div>
            <label htmlFor="new_department_id">Department</label>
            <select id="new_department_id" name="new_department_id" defaultValue={departments[0]?.id}>
              {departments.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="new_employee_id">
              Employee ID <span className="hint">Optional</span>
            </label>
            <input id="new_employee_id" name="new_employee_id" />
          </div>
          <p className="hint" style={{ alignSelf: "end" }}>
            They&apos;re added to People without a login.
          </p>
        </div>
      )}

      {personId && (
        <>
          <p className="statement">{ACKNOWLEDGEMENT_STATEMENT}</p>
          <SignaturePad onChange={setSig} namePlaceholder={signerName} disabled={pending} />
          <div className="actions">
            <button type="submit" disabled={!ready || pending}>
              {pending ? "Confirming…" : `Confirm${signerName ? ` for ${signerName}` : ""}`}
            </button>
          </div>
        </>
      )}
    </form>
  );
}
