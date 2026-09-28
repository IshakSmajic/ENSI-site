import type { Metadata } from "next";
import Link from "next/link";

import { INVITE_MESSAGES, PASSWORD_MIN_LENGTH, parseTokenHash } from "@/lib/auth/invite";
import { ADMIN_LOGIN_PATH } from "@/lib/auth/roles";

import { AcceptInviteForm } from "./accept-invite-form";

export const metadata: Metadata = {
  title: "Accept invitation | Plant Pharmacy",
  robots: { index: false, follow: false },
  // The URL carries the invitation token: never send it to other sites as a referrer.
  referrer: "no-referrer",
};

// Public (like /admin/login): the invited Employee has no session yet. Rendering the page
// does not use the token; it is verified only when the form is submitted.
export default async function AcceptInvitePage({
  searchParams,
}: PageProps<"/admin/accept-invite">) {
  const { token_hash } = await searchParams;
  const tokenHash = parseTokenHash(token_hash);

  return (
    <main className="admin-login">
      <h1>Accept your invitation</h1>
      {tokenHash ? (
        <>
          <p>Choose a password (at least {PASSWORD_MIN_LENGTH} characters) for your staff account.</p>
          <AcceptInviteForm tokenHash={tokenHash} />
        </>
      ) : (
        <p role="alert" className="admin-error">
          {INVITE_MESSAGES.invalidLink}
        </p>
      )}
      <p>
        Already set your password? <Link href={ADMIN_LOGIN_PATH}>Sign in</Link>
      </p>
    </main>
  );
}
