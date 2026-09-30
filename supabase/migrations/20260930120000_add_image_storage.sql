-- Milestone 8: image storage for products and promotions/events.
--
-- Images live in Supabase Storage; rows store only the object path inside the bucket
-- (never binary data, never a full or signed URL). Product and promotion images are public
-- website content, so both buckets are public: anyone can download an object by its public
-- URL. Every write is administrative: only Employees and the Owner (private.is_staff())
-- may upload or delete objects, enforced by RLS on storage.objects, not by the UI.
--
-- Object path convention (both buckets): <row uuid>/<random uuid>.<jpg|png|webp>
--   product-images/<products.id>/<uuid>.webp
--   promotion-images/<events.id>/<uuid>.jpg
-- The server generates every path; uploaded file names are never used. A new image always
-- gets a new name, so objects are never overwritten (there is no UPDATE policy) and a
-- replacement is "upload new, point the row at it, delete the old one".

-- Image references ------------------------------------------------------------

-- The Milestone 3 columns were named image_url but never written. They now hold an object
-- path, so they are renamed to say so. Existing rows keep NULL (no image); images stay
-- optional.
alter table public.products rename column image_url to image_path;
alter table public.events rename column image_url to image_path;

-- A path must follow the convention and sit in the row's own folder. The server derives
-- cleanup targets from this column, so a row can never point it at another row's (or an
-- arbitrary) object, whoever writes it. Fails on existing non-conforming values instead of
-- silently discarding them (none are expected: the columns were never written).
alter table public.products
  add constraint products_image_path_format check (
    image_path is null
    or (
      image_path ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(jpg|png|webp)$'
      and left(image_path, 37) = id::text || '/'
    )
  );

alter table public.events
  add constraint events_image_path_format check (
    image_path is null
    or (
      image_path ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(jpg|png|webp)$'
      and left(image_path, 37) = id::text || '/'
    )
  );

comment on column public.products.image_path is
  'Optional image: object path in the product-images Storage bucket (<id>/<uuid>.<ext>).';
comment on column public.events.image_path is
  'Optional image: object path in the promotion-images Storage bucket (<id>/<uuid>.<ext>).';

-- Buckets ---------------------------------------------------------------------

-- Public read, 5 MiB per object, JPEG/PNG/WebP only. Storage enforces the size and the
-- declared content type again, after the application's own checks. Upserting keeps the
-- settings reproducible if a bucket was already created by hand.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values
  ('product-images', 'product-images', true, 5242880,
   array['image/jpeg', 'image/png', 'image/webp']),
  ('promotion-images', 'promotion-images', true, 5242880,
   array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- Storage policies ------------------------------------------------------------
--
-- storage.objects already has RLS enabled by Supabase; grants are left as Supabase manages
-- them. Policies are permissive and apply only to these two buckets.
--
--   anon                        downloads through the public URL only (public buckets do not
--                               consult RLS for that); cannot list, upload or delete
--   authenticated without role  nothing
--   employee / owner            list/read, upload new objects, delete objects
--   nobody                      update/overwrite/move objects (no UPDATE policy)

-- Staff can see object rows, which the Storage API also needs for deletes and listings.
create policy image_objects_select_staff
  on storage.objects for select
  to authenticated
  using (
    bucket_id in ('product-images', 'promotion-images')
    and (select private.is_staff())
  );

-- Uploads must use the path convention and go into the folder of an existing product
-- (product-images) or event (promotion-images). Columns are qualified with "objects."
-- because products also has a "name" column, which an unqualified name inside the
-- subquery would resolve to.
create policy product_images_insert_staff
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'product-images'
    and (select private.is_staff())
    and objects.name ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(jpg|png|webp)$'
    and exists (
      select 1 from public.products p where p.id::text = split_part(objects.name, '/', 1)
    )
  );

create policy promotion_images_insert_staff
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'promotion-images'
    and (select private.is_staff())
    and objects.name ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(jpg|png|webp)$'
    and exists (
      select 1 from public.events e where e.id::text = split_part(objects.name, '/', 1)
    )
  );

-- No product/event check here: deleting the row first and its image afterwards is the
-- normal cleanup order.
create policy image_objects_delete_staff
  on storage.objects for delete
  to authenticated
  using (
    bucket_id in ('product-images', 'promotion-images')
    and (select private.is_staff())
  );
