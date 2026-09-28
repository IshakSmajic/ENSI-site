-- Milestone 4: Owner/Employee authorization and Row Level Security.
--
-- Access model (PROJECT.md sections 5 and 7):
--   anon (Public Visitor)            read all products, read currently visible events, no writes
--   authenticated without a role     same as anon
--   authenticated employee / owner   full CRUD on products and events
--   nobody (via the Data API)        writes to user_roles; roles are managed with privileged
--                                    server-side access or a manual SQL bootstrap
--
-- Security is layered: table GRANTs decide which statements a Postgres role may run at all,
-- RLS policies decide which rows those statements see or produce. Grants are set explicitly
-- here instead of relying on Supabase's default privileges, which grant ALL (including
-- TRUNCATE, which bypasses RLS) on new public tables to anon and authenticated.

-- Authorization records ------------------------------------------------------

-- One row per staff member. A Supabase Auth user without a row has no application role.
-- Identity, email, passwords and sessions stay in auth.users; nothing credential-like is
-- stored here.
create table public.user_roles (
  user_id uuid primary key references auth.users (id) on delete cascade,
  role text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint user_roles_role_check check (role in ('owner', 'employee'))
);

comment on table public.user_roles is
  'Application role (owner or employee) of each staff member, keyed by auth.users.id. '
  'Not writable through the Data API: managed with privileged server-side access only.';

-- At most one Owner. The initial Owner is assigned manually after deployment (README,
-- "Bootstrapping the Owner"). Drop this index in a new migration if the business ever needs
-- several Owners.
create unique index user_roles_single_owner on public.user_roles ((true)) where role = 'owner';

create trigger user_roles_set_updated_at
  before update on public.user_roles
  for each row
  execute function public.set_updated_at();

-- Role check -----------------------------------------------------------------

-- Security-sensitive helpers live in a schema that is not exposed through the Data API
-- (config.toml [api] schemas), so they cannot be called as RPC endpoints.
create schema private;

comment on schema private is 'Internal helpers used by RLS policies. Not exposed through the Data API.';

-- True when the current user is an Employee or the Owner.
--
-- SECURITY INVOKER on purpose: it reads user_roles with the caller's own privileges, which
-- the user_roles_select_own policy limits to the caller's own row. That row is all the check
-- needs, so no privilege escalation (SECURITY DEFINER) is required, the function cannot read
-- or change anyone else's role, and there is no policy recursion (the user_roles policy does
-- not call this function). Empty search_path with fully qualified names prevents
-- search_path hijacking.
create function private.is_staff()
returns boolean
language sql
stable
security invoker
set search_path = ''
as $$
  select exists (
    select 1
    from public.user_roles
    where user_id = (select auth.uid())
      and role in ('owner', 'employee')
  );
$$;

comment on function private.is_staff() is
  'RLS helper: true when auth.uid() has the owner or employee role.';

-- Only authenticated users need it: anon policies never call it.
revoke all on schema private from public, anon, authenticated;
grant usage on schema private to authenticated;
revoke all on function private.is_staff() from public, anon, authenticated;
grant execute on function private.is_staff() to authenticated;

-- set_updated_at() only runs as a trigger, which does not check EXECUTE privilege on the
-- caller. Nobody needs to call it directly.
revoke all on function public.set_updated_at() from public, anon, authenticated;

-- Grants ---------------------------------------------------------------------

revoke all on table public.products, public.events, public.user_roles from public, anon, authenticated;

-- Public read of products/events; RLS narrows which event rows anon can see.
grant select on table public.products, public.events to anon, authenticated;

-- authenticated can issue writes, but RLS only lets them through for staff.
grant insert, update, delete on table public.products, public.events to authenticated;

-- Authenticated users may read (only) their own role row; no writes for anyone via the API.
grant select on table public.user_roles to authenticated;

-- Server-only privileged role (bypasses RLS). Used by future Owner employee management.
grant all on table public.products, public.events, public.user_roles to service_role;

-- Row Level Security ---------------------------------------------------------

alter table public.products enable row level security;
alter table public.events enable row level security;
alter table public.user_roles enable row level security;

-- Products: every row is public. is_available only changes how the product is displayed.
create policy products_select_public
  on public.products for select
  to anon, authenticated
  using (true);

create policy products_insert_staff
  on public.products for insert
  to authenticated
  with check ((select private.is_staff()));

create policy products_update_staff
  on public.products for update
  to authenticated
  using ((select private.is_staff()))
  with check ((select private.is_staff()));

create policy products_delete_staff
  on public.products for delete
  to authenticated
  using ((select private.is_staff()));

-- Events: the public sees only currently visible events; staff see all of them.
create policy events_select_public
  on public.events for select
  to anon, authenticated
  using (is_active and starts_at <= now() and ends_at >= now());

create policy events_select_staff
  on public.events for select
  to authenticated
  using ((select private.is_staff()));

create policy events_insert_staff
  on public.events for insert
  to authenticated
  with check ((select private.is_staff()));

create policy events_update_staff
  on public.events for update
  to authenticated
  using ((select private.is_staff()))
  with check ((select private.is_staff()));

create policy events_delete_staff
  on public.events for delete
  to authenticated
  using ((select private.is_staff()));

-- Authorization records: users can read their own role (used by is_staff() and by
-- server-side role checks). There are deliberately no insert/update/delete policies.
create policy user_roles_select_own
  on public.user_roles for select
  to authenticated
  using ((select auth.uid()) = user_id);
