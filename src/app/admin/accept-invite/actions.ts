"use server";

import { redirect } from "next/navigation";

import { acceptInvitation } from "@/lib/auth/invite";
import { ADMIN_HOME_PATH, lookupStaffRole } from "@/lib/auth/roles";
import { createClient } from "@/lib/supabase/server";

export type AcceptInviteState = { error: string } | undefined;

/**
 * Accepts an Employee invitation with the user-scoped client (publishable key + cookies);
 * no privileged key is involved. Verifying the token starts the Employee's session.
 */
export async function acceptInvite(
  _previousState: AcceptInviteState,
  formData: FormData,
): Promise<AcceptInviteState> {
  const supabase = await createClient();

  const result = await acceptInvitation(
    {
      async verifyInvite(tokenHash) {
        const { data, error } = await supabase.auth.verifyOtp({
          type: "invite",
          token_hash: tokenHash,
        });
        return error || !data.user || !data.session ? null : { userId: data.user.id };
      },
      lookupRole: (userId) => lookupStaffRole(supabase, userId),
      async setPassword(password) {
        const { error } = await supabase.auth.updateUser({ password });
        return !error;
      },
      async signOut() {
        await supabase.auth.signOut({ scope: "local" });
      },
    },
    {
      tokenHash: formData.get("token_hash"),
      password: formData.get("password"),
      confirmation: formData.get("confirmation"),
    },
  );

  if (!result.ok) {
    return { error: result.error };
  }
  redirect(ADMIN_HOME_PATH);
}
