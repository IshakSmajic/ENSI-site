"use client";

import { useActionState } from "react";

import { PASSWORD_MIN_LENGTH } from "@/lib/auth/invite";

import { acceptInvite } from "./actions";

export function AcceptInviteForm({ tokenHash }: { tokenHash: string }) {
  const [state, formAction, pending] = useActionState(acceptInvite, undefined);

  return (
    <form action={formAction} className="admin-form">
      <input type="hidden" name="token_hash" value={tokenHash} />

      <label htmlFor="password">New password</label>
      <input
        id="password"
        name="password"
        type="password"
        autoComplete="new-password"
        minLength={PASSWORD_MIN_LENGTH}
        required
      />

      <label htmlFor="confirmation">Confirm password</label>
      <input
        id="confirmation"
        name="confirmation"
        type="password"
        autoComplete="new-password"
        minLength={PASSWORD_MIN_LENGTH}
        required
      />

      {state?.error && (
        <p role="alert" className="admin-error">
          {state.error}
        </p>
      )}

      <button type="submit" disabled={pending}>
        {pending ? "Saving…" : "Set password and continue"}
      </button>
    </form>
  );
}
