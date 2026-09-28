-- Development seed data. Loaded by `supabase db reset` on a LOCAL database only
-- (see [db.seed] in config.toml); `supabase db push` never runs it.

insert into public.products (name, slug, description, category, price, is_featured)
values
  ('Chamomile Tea', 'chamomile-tea',
   'Dried chamomile flowers for a calming herbal infusion.', 'Teas', 6.50, true),
  ('Herbal Balm', 'herbal-balm',
   'Soothing balm made with plant oils and beeswax.', 'Balms', 12.00, false);

insert into public.events (title, description, event_type, starts_at, ends_at, is_active)
values
  ('Autumn Herbal Tea Week',
   'A week of discounts on selected herbal teas.', 'promotion',
   '2026-10-01 00:00:00+00', '2026-10-07 23:59:59+00', true);
