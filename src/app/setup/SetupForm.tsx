"use client";

import { useActionState } from "react";
import { MIN_PASSWORD_LENGTH } from "@/lib/passwords-rules";
import { createFirstAdmin, type SetupState } from "./actions";

export default function SetupForm() {
  const [state, action, pending] = useActionState<SetupState, FormData>(createFirstAdmin, {});
  return (
    <form action={action}>
      {state.error && (
        <p className="notice bad" role="alert">
          {state.error}
        </p>
      )}
      <label htmlFor="code">
        Setup code <span className="hint">The SETUP_CODE value from your hosting settings.</span>
      </label>
      <input id="code" name="code" type="password" autoComplete="off" required />
      <label htmlFor="name">Your name</label>
      <input id="name" name="name" type="text" autoComplete="name" required defaultValue={state.name} />
      <label htmlFor="email">Your email</label>
      <input id="email" name="email" type="email" autoComplete="username" required defaultValue={state.email} />
      <label htmlFor="password">
        Password <span className="hint">At least {MIN_PASSWORD_LENGTH} characters.</span>
      </label>
      <input id="password" name="password" type="password" autoComplete="new-password" minLength={MIN_PASSWORD_LENGTH} required />
      <label htmlFor="confirm">Type it again</label>
      <input id="confirm" name="confirm" type="password" autoComplete="new-password" required />
      <div className="actions">
        <button type="submit" disabled={pending}>
          {pending ? "Creating…" : "Create admin account"}
        </button>
      </div>
    </form>
  );
}
