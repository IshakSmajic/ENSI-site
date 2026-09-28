-- Milestone 3: core schema for products and events.
--
-- Row Level Security is intentionally NOT configured here; it is added in
-- Milestone 4. Do not apply this migration to a hosted project without the
-- Milestone 4 migration: tables in the public schema are reachable through the
-- Supabase Data API with the publishable key until RLS is enabled.

-- Reusable trigger function: stamps updated_at on every row update.
-- Empty search_path so the function cannot be hijacked through search_path;
-- now() lives in pg_catalog, which is always searched.
create function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

comment on function public.set_updated_at() is
  'BEFORE UPDATE trigger function: sets updated_at to the current transaction time.';

-- Products -------------------------------------------------------------------

create table public.products (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null,
  description text,
  category text,
  image_url text,
  price numeric(10, 2),
  is_available boolean not null default true,
  is_featured boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint products_slug_key unique (slug),
  constraint products_name_not_blank check (name ~ '[^[:space:]]'),
  -- Lowercase URL-safe segments joined by single hyphens, e.g. "chamomile-tea".
  -- Also rules out empty/whitespace slugs and case-only duplicates.
  constraint products_slug_format check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  constraint products_price_non_negative check (price is null or price >= 0)
);

comment on table public.products is 'Plant-based products shown in the public catalog.';
comment on column public.products.price is 'Optional displayed price; the site does not sell online.';

create trigger products_set_updated_at
  before update on public.products
  for each row
  execute function public.set_updated_at();

-- Events ---------------------------------------------------------------------
-- Promotions, discounts, announcements, campaigns, pharmacy events and notices.
-- Public visibility is derived at query time:
--   is_active and starts_at <= now() and ends_at >= now()

create table public.events (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  description text,
  image_url text,
  event_type text,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint events_title_not_blank check (title ~ '[^[:space:]]'),
  constraint events_ends_after_starts check (ends_at > starts_at)
);

comment on table public.events is
  'Time-bounded promotions, announcements and events. Visible when is_active and now() is within [starts_at, ends_at].';

create trigger events_set_updated_at
  before update on public.events
  for each row
  execute function public.set_updated_at();
