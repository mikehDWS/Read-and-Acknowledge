"use client";

import { useActionState } from "react";
import { sendRemindersNow, type SendRemindersState } from "./actions";

export default function SendForm({ disabled }: { disabled: boolean }) {
  const [state, action, pending] = useActionState<SendRemindersState, FormData>(sendRemindersNow, {});
  const run = state.run;
  return (
    <form action={action}>
      {state.error && (
        <p className="notice bad" role="alert">
          {state.error}
        </p>
      )}
      {run && (
        <div className={`notice ${run.failed.length ? "warn" : "ok"}`} role="status">
          {run.sent.length > 0 ? `Sent to ${run.sent.join(", ")}.` : "No reminders sent."}
          {run.alreadySent.length > 0 && ` Already reminded this week: ${run.alreadySent.join(", ")}.`}
          {run.nothingOutstanding.length > 0 && ` Nothing outstanding for ${run.nothingOutstanding.join(", ")}.`}
          {run.failed.length > 0 && (
            <ul>
              {run.failed.map((f) => (
                <li key={f.name}>
                  {f.name}: {f.error}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
      <label className="check-item" htmlFor="force" style={{ marginTop: 12 }}>
        <input id="force" type="checkbox" name="force" value="yes" /> Also send to managers already reminded this week
      </label>
      <div className="actions">
        <button type="submit" disabled={disabled || pending}>
          {pending ? "Sending…" : "Send reminders now"}
        </button>
      </div>
    </form>
  );
}
