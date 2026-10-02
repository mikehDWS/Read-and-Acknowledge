"use client";

import { useActionState, useState } from "react";
import SignaturePad, { type SignatureValue } from "@/components/SignaturePad";
import { ACKNOWLEDGEMENT_STATEMENT } from "@/lib/statement";
import { acknowledge, type AcknowledgeState } from "./actions";

export default function SignForm({ token, signerName }: { token: string; signerName: string }) {
  const [state, action, pending] = useActionState<AcknowledgeState, FormData>(acknowledge, {});
  const [sig, setSig] = useState<SignatureValue>({ dataUrl: "", method: "drawn", typedName: "" });
  const ready = !!sig.dataUrl && (sig.method === "drawn" || !!sig.typedName.trim());

  return (
    <form action={action}>
      {state.error && (
        <p className="notice bad" role="alert">
          {state.error}
        </p>
      )}
      <input type="hidden" name="token" value={token} />
      <input type="hidden" name="signature" value={sig.dataUrl} />
      <input type="hidden" name="signature_method" value={sig.method} />
      <input type="hidden" name="typed_name" value={sig.method === "typed" ? sig.typedName : ""} />

      <p className="statement">{ACKNOWLEDGEMENT_STATEMENT}</p>
      <SignaturePad onChange={setSig} namePlaceholder={signerName} disabled={pending} />

      <div className="actions">
        <button type="submit" disabled={!ready || pending} aria-describedby="confirm-hint">
          {pending ? "Confirming…" : "Confirm"}
        </button>
      </div>
      <p id="confirm-hint" className="hint">
        Your signature, name, the date and time are recorded when you confirm. You can&apos;t undo this yourself.
      </p>
    </form>
  );
}
