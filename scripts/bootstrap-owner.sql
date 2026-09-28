-- Assigns the initial Owner role. Run ONCE per environment, manually, as a privileged
-- database user (Supabase Dashboard -> SQL Editor, which runs as `postgres`). It cannot be
-- run through the Data API: user_roles accepts no writes from anon/authenticated.
--
-- Prerequisites:
--   1. The migrations in supabase/migrations/ have been applied.
--   2. The Owner's Supabase Auth user already exists (Dashboard -> Authentication -> Users
--      -> "Invite user", so the Owner sets their own password).
--
-- Usage: replace the placeholder email below with the Owner's email address IN THE SQL
-- EDITOR ONLY. Do not commit a real email address to this file.
--
-- Fails without changing anything if the placeholder was not replaced, no Auth user has
-- that email, or an Owner already exists (user_roles_single_owner).

do $$
declare
  owner_email constant text := 'REPLACE_WITH_OWNER_EMAIL';
  owner_id uuid;
begin
  if owner_email = 'REPLACE_WITH_OWNER_EMAIL' then
    raise exception 'Replace REPLACE_WITH_OWNER_EMAIL with the Owner''s email address first.';
  end if;

  select id into owner_id from auth.users where lower(email) = lower(owner_email);

  if owner_id is null then
    raise exception 'No Supabase Auth user with email %. Invite/create the user first.', owner_email;
  end if;

  insert into public.user_roles (user_id, role) values (owner_id, 'owner');

  raise notice 'User % (%) is now the Owner.', owner_email, owner_id;
end;
$$;
