"use client";

import { useActionState } from "react";
import { MIN_PASSWORD_LENGTH } from "@/lib/passwords-rules";
import { setPassword, type SetPasswordState } from "./actions";

export default function SetPasswordForm({ token, email }: { token: string; email: string }) {
  const [state, action, pending] = useActionState<SetPasswordState, FormData>(setPassword, {});
  return (
    <form action={action}>
      {state.error && (
        <p className="notice bad" role="alert">
          {state.error}
        </p>
      )}
      <input type="hidden" name="token" value={token} />
      {/* Lets password managers save the right username. */}
      <input type="email" name="username" autoComplete="username" value={email} readOnly hidden />
      <label htmlFor="password">
        New password
        <span className="hint">At least {MIN_PASSWORD_LENGTH} characters. A short phrase is easy to remember.</span>
      </label>
      <input
        id="password"
        name="password"
        type="password"
        autoComplete="new-password"
        minLength={MIN_PASSWORD_LENGTH}
        required
      />
      <label htmlFor="confirm">Type it again</label>
      <input id="confirm" name="confirm" type="password" autoComplete="new-password" required />
      <div className="actions">
        <button type="submit" disabled={pending}>
          {pending ? "Saving…" : "Set password and sign in"}
        </button>
      </div>
    </form>
  );
}
