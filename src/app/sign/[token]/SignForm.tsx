"use client";

import { useActionState, useState } from "react";
import { ACKNOWLEDGEMENT_STATEMENT } from "@/lib/statement";
import { acknowledge, type AcknowledgeState } from "./actions";

export default function SignForm({ token }: { token: string }) {
  const [state, action, pending] = useActionState<AcknowledgeState, FormData>(acknowledge, {});
  const [agreed, setAgreed] = useState(false);

  return (
    <form action={action}>
      {state.error && (
        <p className="notice bad" role="alert">
          {state.error}
        </p>
      )}
      <input type="hidden" name="token" value={token} />
      <label className="checkbox">
        <input
          type="checkbox"
          name="agree"
          value="yes"
          checked={agreed}
          onChange={(e) => setAgreed(e.target.checked)}
        />
        <span>{ACKNOWLEDGEMENT_STATEMENT}</span>
      </label>
      <button type="submit" disabled={!agreed || pending} aria-describedby="confirm-hint">
        {pending ? "Confirming…" : "Confirm"}
      </button>
      <p id="confirm-hint" className="hint">
        Your name, the date and time are recorded when you confirm. You can't undo this yourself.
      </p>
    </form>
  );
}
