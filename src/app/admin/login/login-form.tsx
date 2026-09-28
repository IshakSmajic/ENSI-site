"use client";

import { useActionState } from "react";

import { login } from "./actions";

export function LoginForm({ notice }: { notice: string | null }) {
  const [state, formAction, pending] = useActionState(login, undefined);
  const error = state?.error ?? notice;

  return (
    <form action={formAction} className="admin-form">
      <label htmlFor="email">Email</label>
      <input
        id="email"
        name="email"
        type="email"
        autoComplete="username"
        defaultValue={state?.email}
        required
      />

      <label htmlFor="password">Password</label>
      <input
        id="password"
        name="password"
        type="password"
        autoComplete="current-password"
        required
      />

      {error && (
        <p role="alert" className="admin-error">
          {error}
        </p>
      )}

      <button type="submit" disabled={pending}>
        {pending ? "Signing in…" : "Sign in"}
      </button>
    </form>
  );
}
