Plant Pharmacy Website

1. Project Overview
   The Plant Pharmacy Website is an informational website for a pharmacy/business specializing in plant-based products.
   The website has two primary areas:
   Public Website
   Accessible to everyone without authentication.
   Visitors can:
   View the landing page.
   Browse available products.
   Search/filter products.
   View individual product information.
   See featured products.
   See currently active promotions, announcements, and events.
   View information about the pharmacy.
   View contact/location information.
   The website does not support:
   Online ordering.
   Shopping carts.
   Checkout.
   Payments.
   Shipping.
   Customer accounts.
   The website is strictly informational.
   Visitors never have accounts; there is no customer/client role (see section 5).
   Administrative Panel
   Accessible only to authenticated users who hold an application role of Employee or Owner
   (see section 5). Being signed in to Supabase Auth alone does not grant access.
   Employees and the Owner can:
   Log in securely.
   Add products.
   Edit products.
   Archive/remove products.
   Mark products as available/unavailable.
   Mark products as featured.
   Upload product images.
   Create promotional events/announcements.
   Define when promotions begin and end.
   Edit existing promotions.
   Remove/deactivate promotions.
   Upload promotional images.
   Additionally, only the Owner can:
   View employees.
   Invite employees by email.
   Revoke/deactivate employee access.
   Resend employee invitations (potential).

2. Technology Stack
   Frontend
   Next.js
   React
   TypeScript
   CSS/UI solution to be determined during implementation
   Backend
   Next.js server functionality
   Supabase
   Database
   Supabase PostgreSQL
   Authentication
   Supabase Auth
   File Storage
   Supabase Storage
   Version Control
   Git
   GitHub

3. High-Level Architecture
   Public Website
   │
   ├── Landing Page
   ├── Products
   ├── Product Details
   ├── Promotions
   ├── About
   └── Contact
   │
   │
   Next.js Application
   │
   ▼
   Supabase
   ┌─────┼─────┐
   │ │ │
   Auth DB Storage
   │ │ │
   │ │ └── Images
   │ │
   │ ├── products
   │ ├── events
   │ └── user_roles (owner / employee, keyed by auth.users.id)
   │
   └── Admin authentication (identity, passwords, sessions, invitations)

Admin Panel
│
├── Login                 (Employee + Owner)
├── Dashboard             (Employee + Owner)
├── Product Management    (Employee + Owner)
├── Event Management      (Employee + Owner)
└── Employee Management   (Owner only)

4. Database Design
   Products
   Table:
   products
   Proposed fields:
   Field
   Type
   Purpose
   id
   UUID
   Primary identifier
   name
   TEXT
   Product name
   slug
   TEXT UNIQUE
   URL-friendly identifier
   description
   TEXT
   Product description
   category
   TEXT
   Product category
   image_path
   TEXT
   Optional product image: object path in the product-images bucket (Milestone 8; was
   image_url, renamed because it holds a path, not a URL; see section 6)
   price
   DECIMAL
   Optional displayed price
   is_available
   BOOLEAN
   Whether product is currently available
   is_featured
   BOOLEAN
   Whether product appears in featured sections
   created_at
   TIMESTAMP
   Creation time
   updated_at
   TIMESTAMP
   Last modification

Additional medicinal/product information may later include:
Ingredients
Manufacturer
Usage information
Warnings
Packaging/quantity
These should only be added if required by the actual business.

Events / Promotions
Table:
events
This table represents temporary marketing content including:
Discounts
Promotions
New product announcements
Special campaigns
Pharmacy events
Temporary notices
Proposed fields:
Field
Type
Purpose
id
UUID
Primary identifier
title
TEXT
Event/promotion title
description
TEXT
Description
image_path
TEXT
Optional promotional image: object path in the promotion-images bucket (Milestone 8;
was image_url; see section 6)
event_type
TEXT
Promotion/event classification
starts_at
TIMESTAMP
Beginning of visibility period
ends_at
TIMESTAMP
End of visibility period
is_active
BOOLEAN
Manual enable/disable
created_at
TIMESTAMP
Creation time
updated_at
TIMESTAMP
Last modification

A promotion should normally appear publicly when:
is_active = true

AND

starts_at <= current time

AND

ends_at >= current time

Authorization Records (implemented — Milestone 4)
Table:
user_roles
Records each staff member's application role.
Field
Type
Purpose
user_id
UUID PRIMARY KEY
References auth.users.id, ON DELETE CASCADE (one record per staff user)
role
TEXT
CHECK role in ('owner', 'employee')
created_at / updated_at
TIMESTAMPTZ
Record history (updated_at maintained by public.set_updated_at())
Partial unique index user_roles_single_owner: at most one owner row.
The table stores no email, password, or other credential; identity data stays in Supabase Auth.
A Supabase Auth user with no authorization record has no application permissions.
No generic RBAC/permissions system: exactly two roles until the business needs more.
Not writable through the Data API by anyone (Owner included); an authenticated user can
read only their own row. Role changes happen through privileged server-side access
(Milestone 6) or the manual Owner bootstrap (README, "Bootstrapping the Owner").

5. Authentication & Authorization
   Authentication vs Authorization
   Authentication answers: "Who is this user?"
   Supabase Auth handles this: identity, email, password authentication, sessions,
   invitation emails and other authentication-related functionality.
   Authorization answers: "What is this authenticated user allowed to do?"
   The application/database authorization model handles this, using the authorization
   records described in section 4.
   An authenticated Supabase user is NOT automatically an Employee.
   Checking auth.uid() IS NOT NULL is therefore insufficient for administrative write
   authorization. Administrative database policies and server-side checks must verify
   the user's application role.
   Passwords must never be stored inside application database tables.

   Access Levels
   1. Public Visitor
   Has no account and does not authenticate.
   Can access the public website, browse products intended for public display, and view
   currently relevant promotions/events.
   Cannot access administrative pages.
   Cannot create, modify, or delete application data.
   There is no client/customer database role and no customer account system.
   2. Employee (authenticated, role = employee)
   Can access the administrative dashboard.
   Can create and edit products, remove/archive products where supported, and change
   product availability and featured status.
   Can create and edit events/promotions and deactivate/remove them.
   Manages product images through the admin interface (Milestone 8); promotional images
   will be managed the same way once event management exists (Milestone 9).
   Cannot create or remove other employees, change any user's role, promote themselves
   to Owner, or access Owner-only account-management functionality.
   3. Owner (authenticated, role = owner)
   Has all Employee capabilities.
   Additionally manages employee access: view employees, invite/create employee accounts,
   revoke/deactivate employee access, potentially resend invitations, and use the
   Owner-only employee-management UI (/admin/employees).
   There is initially exactly one Owner unless requirements change (enforced by the
   user_roles_single_owner index).
   The initial Owner account is bootstrapped manually during application
   setup/deployment: create the Owner's Supabase Auth user (Dashboard "Create new user";
   the Owner sets their own password), then run scripts/bootstrap-owner.sql
   (README, "Bootstrapping the Owner"). Done for the current hosted project.

   Role hierarchy:
   auth.users (Supabase Auth: identity)
   │
   ▼
   authorization record (application: role)
   │
   ├── owner
   └── employee

   Public Registration
   Public account registration is NOT part of the application. Visitors do not need
   accounts. Employees enter the system only through the Owner-controlled invitation
   process, so no administrative access may depend on public self-registration.

   Employee Invitation Flow (implemented — Milestone 6; verified on the hosted project)
   1. Owner signs into the administrative system.
   2. Owner opens employee management (/admin/employees).
   3. Owner enters the employee's email address.
   4. The request is sent to a protected Next.js server-side action/endpoint.
   5. The server verifies that the requesting user is an Owner.
   6. The server uses privileged Supabase server-side functionality to create/invite the employee.
   7. Supabase sends an invitation email to the employee.
   8. The employee follows the invitation link.
   9. The employee establishes their own password.
   10. The employee can then sign in and use Employee administrative functionality.
   The Owner never chooses, knows, stores, or emails an employee's password.
   Passwords remain entirely under Supabase Auth.
   Implementation (Milestone 6): step 6 is inviteUserByEmail followed by inserting the
   employee role (the Auth user is deleted again if the insert fails). Steps 8–9 happen at
   /admin/accept-invite?token_hash=..., linked from the custom invite email template
   (supabase/templates/invite.html). The token is verified only when the password form
   is submitted (verifyOtp type invite, then updateUser). Existing Auth accounts (Owner,
   Employee, or without a role) are refused rather than given a role.
   Revocation: delete the employee role row (access ends immediately), then hard-delete
   the Auth user, which revokes their sessions and refresh tokens.
   Hosted: invitation emails go through the project's custom SMTP provider, using the
   repository's invite template (see the Milestone 6 hosted verification log entry).

   Privileged Supabase Operations
   Inviting/creating users requires a privileged Supabase credential (secret/service-role key).
   It is used only in server-side code, in a server-only environment variable (no
   NEXT_PUBLIC_ prefix): SUPABASE_SECRET_KEY, read only by src/lib/supabase/admin.ts
   (server-only) and used only by Owner employee management (Milestone 6).
   It must NEVER be exposed through NEXT_PUBLIC_* variables, sent to the browser, included in
   client-side JavaScript, stored in public source code, or committed to Git.
   The Owner dashboard calls protected server-side application functionality; being an Owner
   never causes privileged credentials to become available to the browser.

6. Storage (implemented — Milestone 8)
   Supabase Storage stores images. PostgreSQL stores only a reference, never binary data.
   Migration: supabase/migrations/20260930120000_add_image_storage.sql.

   Buckets (created by the migration, not by hand):
   product-images     product photos (products.image_path)
   promotion-images   promotion/event images (events.image_path); infrastructure only
                      until Milestone 9 builds event management
   Two buckets, because each maps to one table: uploads into product-images must target an
   existing product's folder, uploads into promotion-images an existing event's folder.
   Both: public = true, file_size_limit = 5 MiB, allowed_mime_types = image/jpeg,
   image/png, image/webp.

   Public read decision: product and promotion images are public website content (the
   rows that reference them are public too), so both buckets are public. Anyone can
   download an object through its public URL
   (<SUPABASE_URL>/storage/v1/object/public/<bucket>/<path>); no signed URLs are needed,
   and nothing private may ever be put in these buckets. Knowing a URL grants read access
   only; every write is authorized by Storage RLS. Anonymous users cannot list objects.

   What the database stores: the object path inside the bucket (image_path), not a full
   URL and not a signed URL. URLs are built at render time from NEXT_PUBLIC_SUPABASE_URL
   (src/lib/images/validation.ts publicImageUrl), so a project URL change does not
   invalidate stored rows. NULL = no image; images are optional and existing rows stayed
   valid (NULL).

   Object-path convention: <row uuid>/<random uuid>.<ext>, ext in jpg | png | webp, e.g.
   product-images/7c9e…/3f1a….webp. The server generates it (crypto.randomUUID()); the
   uploaded file name is never used. The same rule is enforced three times: in the
   application (isImageObjectPath / newImageObjectPath), in the Storage insert policies
   (name pattern + existing product/event folder), and by CHECK constraints
   products_image_path_format / events_image_path_format, which also require the path to
   be in the row's own folder (<row id>/...). So a row can never reference another row's
   object, and cleanup derived from a row stays inside that row's folder. No collisions
   (random name per upload), no path traversal (fixed character set, no "..", no nested
   folders), and all images of a product are under one folder, which makes cleanup simple.

   Validation (server-side, src/lib/images/validation.ts; the file input's accept= and the
   browser size check are convenience only):
   - missing file / untouched input: refused ("Choose an image file to upload.")
   - empty file: refused
   - more than 5 MiB (5,242,880 bytes): refused before the content is read; the actual
     byte count is checked again after reading (the declared size is not trusted)
   - type: determined from the file signature (magic bytes): JPEG FF D8 FF, PNG 89 50 4E
     47 0D 0A 1A 0A, WebP "RIFF"…"WEBP". Anything else (GIF, SVG, HEIC, AVIF, PDF,
     executables, text) is refused whatever its name or declared type. A declared type
     that disagrees with the content is refused too (an empty declared type is allowed;
     "image/jpg" is treated as image/jpeg). The sniffed type is what is stored as the
     object's content type.
   Formats: JPEG, PNG, WebP. Not SVG (can carry scripts), not GIF (animation not needed),
   not HEIC/AVIF (browser support / signature complexity; can be added later).
   Maximum size: 5 MiB, enough for an ordinary product photo from a phone or camera and
   well above what a web page needs. Enforced by the application, by the buckets'
   file_size_limit, and indirectly by the Server Action body limit (next.config.ts
   serverActions.bodySizeLimit = 6mb; the default is 1 MB; the extra MB is multipart
   overhead). The body limit applies to every Server Action.
   Limitation: the signature check does not decode the image, so a file that starts with a
   valid image header but contains other data (a polyglot) is accepted. Impact is limited:
   files are served from the Supabase Storage domain (not the application's origin) with
   an image content type. No re-encoding is done, so EXIF metadata (for example GPS
   location in phone photos) is kept; staff should upload photos without location data.
   No image-processing dependency was added.

   Authorization (storage.objects RLS; storage.objects already has RLS enabled by
   Supabase; grants are unchanged):
   anon                         public URL download only; no list, upload or delete
   authenticated without role   nothing
   employee / owner             select (list; also required by the Storage API for
                                deletes), insert (convention + existing row folder),
                                delete (both buckets)
   nobody                       update (no UPDATE policy): objects are immutable, never
                                overwritten or moved; a replacement is a new object
   Policies: image_objects_select_staff, product_images_insert_staff,
   promotion_images_insert_staff, image_objects_delete_staff, all TO authenticated and
   using private.is_staff(), limited to the two buckets. The application uploads and
   deletes with the staff member's own session (publishable key), so these policies are
   enforced for every call. The secret key is not used for Storage.

   Product image flow (Milestone 8): images are managed on /admin/products/[id]/edit, in an
   "Image" section with its own form, separate from the product details form. Creating a
   product does not upload an image: the product must exist first (the Storage insert
   policy requires its folder id to be an existing product), which avoids a product/image
   state that is half created. The new-product page says so.
   Server Function changeProductImage (intent upload | remove) reads only the product id,
   the intent and the file. Bucket, object path and the image being replaced are derived on
   the server; the id is UUID-validated; the current image_path is read from the
   database. Rules: src/lib/products/images.ts (authorizeStaff first).

   Replacement (order chosen so the working image is never lost):
   1. validate the file; read the product's current image_path from the database
   2. upload the new object under a new name (upsert false: never overwrites)
   3. update products.image_path with a compare-and-set on the previously read path
   4. delete the old object
   Removal: clear image_path (compare-and-set), then delete the object.

   Product deletion: delete the row first (DELETE … RETURNING name, image_path), then
   delete its images: the returned path plus anything else found in the product's folder
   (leftovers of earlier failures). Targets are derived from the trusted product id and the
   database row, never from the form, and only paths inside <product id>/ are deleted.
   Row first, because a product must never reference a missing file; an orphaned file
   (not referenced by anything) is the lesser failure.

   Partial failures (fixed messages; details logged as "[images] <category>" with the
   object path and the Storage status/code only; no tokens, keys or raw messages):
   upload fails                      nothing changed; "Could not upload the image."
                                     (403 -> "You are not allowed …") [upload_failed]
   upload ok, DB update fails        the new object is deleted again; old image kept and
                                     still shown; "Could not save the image."
                                     [reference_update_failed]
   … and that delete fails too       the new object is orphaned and logged
                                     [orphaned_upload]; old image kept
   product changed/deleted meanwhile compare-and-set updates nothing; new object deleted;
                                     "The product was changed or deleted …"
   DB ok, old-object delete fails    replacement succeeds; message says the previous file
                                     could not be deleted; logged [old_image_cleanup_failed]
   old object already missing        Storage reports no error; normal success
   remove: file delete fails         reference cleared (image no longer shown); message
                                     says so; logged
   product delete: file delete fails product deleted; message says the image file could
                                     not be removed; logged [owner_cleanup_failed]
   product delete: folder list fails the stored image is still removed; logged
   Orphaned files are unreferenced and harmless apart from storage use; delete them in the
   Dashboard (Storage -> bucket -> <product id>/) when the log reports one, or they are
   swept when the product is deleted.

   Caching: objects are uploaded with Cache-Control max-age=86400 (1 day). Names never
   repeat, so no stale image is ever shown after a replacement; a removed image may stay in
   browser/CDN caches for up to a day.

   Display: the admin list shows a 56 px thumbnail, the edit page a 240 px preview.
   next/image with unoptimized (no remotePatterns, no image optimization). No image,
   invalid path or a file that fails to load shows "No image" / "Image unavailable"; the
   page never fails because of an image. The public catalogue (Milestone 10) will decide
   on optimization.

   Promotion images: the promotion-images bucket, its insert policy (existing event
   folder), the shared select/delete policies and events.image_path with its constraint
   exist and are tested at the database level. There is no upload UI: event management is
   Milestone 9, which will reuse src/lib/images/ (validation, paths, ImageStorage with
   IMAGE_BUCKETS.promotions, removeOwnerImages) and mirror src/lib/products/images.ts.

7. Security Requirements
   The public website must have read-only access to information intended for visitors.
   Unauthenticated users must NOT be able to:
   Create products.
   Modify products.
   Delete/archive products.
   Create events.
   Modify events.
   Delete events.
   Access administrative pages.
   Administrative database operations must be protected server-side/database-side.
   Hiding admin controls in React is not sufficient authorization.
   Supabase Row Level Security should be enabled where appropriate.
   The application must not rely solely on client-side authentication checks.
   Secrets and privileged Supabase credentials must never be exposed to the browser.
   Being authenticated is not authorization: administrative writes require an Employee or
   Owner role verified by database policies (and by server-side checks in the application).
   Employee management is Owner-only and is verified server-side before any privileged
   Supabase operation runs.
   Users must not be able to grant themselves a role or change their own or anyone else's
   role; the authorization records must themselves be protected by RLS.
   Public self-registration must not grant any administrative access.

   Authorization Model
   PUBLIC VISITOR (anonymous)
   Products: read all product rows. is_available does not control visibility: unavailable
   products are shown as "currently unavailable". (If an archive flag is added later,
   archived rows will be excluded.)
   Product removal (Milestone 7 decision): there is no archive flag. "Archive/remove" is a
   permanent delete (products_delete_staff policy); "Mark unavailable" is the reversible way
   to take a product out of stock while keeping it listed.
   Events: read only currently relevant events
   (is_active = true AND starts_at <= current time AND ends_at >= current time).
   Writes: none.
   Employee management: no access.

   AUTHENTICATED USER WITHOUT A ROLE
   Treated like a Public Visitor for data access. No administrative access, no writes.

   EMPLOYEE
   Products: read, create, update, delete/archive as supported.
   Events: read, create, update, delete/deactivate as supported.
   Employee management: no access.

   OWNER
   Products: same management permissions as Employee.
   Events: same management permissions as Employee.
   Employee management: Owner-only (view, invite, revoke/deactivate).

   Enforcement (Milestone 4)
   PostgreSQL grants: anon has SELECT on products/events only; authenticated has
   SELECT/INSERT/UPDATE/DELETE on products/events and SELECT on user_roles; no TRUNCATE
   and no user_roles writes for either; service_role (server-only) has all.
   RLS policies: products readable by everyone; events readable by everyone when
   currently visible and by staff always; product/event writes only when
   private.is_staff(); user_roles readable only for the caller's own row.
   private.is_staff(): SECURITY INVOKER, search_path pinned, in the private schema (not
   exposed through the Data API), EXECUTE for authenticated only.
   Application roles are read from user_roles, never from JWT claims or user_metadata.

   Enforcement (Milestone 8, Storage): product-images and promotion-images are public
   buckets (public download by URL, no anonymous listing). Uploads and deletes on
   storage.objects require private.is_staff(); nobody can update/overwrite objects. Upload
   names must follow <existing row id>/<uuid>.<jpg|png|webp>. products/events image_path
   CHECK constraints keep each reference inside its own row's folder. See section 6.

8. Public Routes
   Planned routes:
   /
   Landing page.
   /products
   Product catalog.
   /products/[slug]
   Individual product page.
   /about
   Information about the pharmacy.
   /contact
   Contact/location information.

9. Administrative Routes
   All routes except /admin/login and /admin/accept-invite require an Employee or Owner role.
   /admin/login
   Employee/Owner authentication.
   /admin/accept-invite
   Public. Invited Employee sets their password (token verified on submit).
   /admin
   Administrative dashboard.
   /admin/products
   Product management.
   /admin/products/new
   Create product.
   /admin/products/[id]/edit
   Edit product.
   /admin/events
   Promotion/event management.
   /admin/events/new
   Create promotion/event.
   /admin/events/[id]/edit
   Edit promotion/event.
   /admin/employees
   Employee management: list, invite, revoke/deactivate. Owner only.
   Employees are denied access (enforced server-side, not only by hiding the link).
   Enforcement (Milestone 5): src/proxy.ts checks the session and user_roles for every
   /admin/* request except /admin/login. Protected pages live in the
   src/app/admin/(dashboard)/ route group, whose layout calls requireStaff()
   (src/lib/auth/staff.ts). Pages and Server Functions that touch admin data call it too.
   Anonymous visitors are redirected to /admin/login. A signed-in user without a staff
   role has that session signed out and is redirected to /admin/login?error=unauthorized.
   Staff visiting /admin/login are redirected to /admin.
   /admin/employees (Milestone 6): the page and its Server Functions call the Owner check
   (src/lib/employees/management.ts authorizeOwner) server-side. Employees get a denial
   message and no data; privileged calls run only after the check.
   /admin/products, /admin/products/new, /admin/products/[id]/edit (Milestone 7): Owner and
   Employee. Pages call requireStaff(); every product Server Function calls
   src/lib/products/management.ts, which checks the staff role (authorizeStaff) before any
   query. Queries use the user-scoped client (publishable key + session), so the products
   RLS policies (private.is_staff()) enforce the role again in the database. No secret key.
   Product images (Milestone 8): managed on /admin/products/[id]/edit (separate "Image"
   form, Server Function changeProductImage). The rules in src/lib/products/images.ts call
   authorizeStaff() first; uploads/deletes use the user-scoped client, so Storage RLS
   (private.is_staff()) checks the role again. No secret key.

10. Implementation Milestones

Milestone 0 — Project Specification
Status: ✅ DEFINED
Goals:
Define project purpose.
Define public/admin separation.
Define initial technology stack.
Define major entities.
Define initial feature scope.
Explicitly exclude e-commerce functionality.
Completion criteria:
Public website requirements defined.
Administrative requirements defined.
Initial database model defined.
Authentication strategy defined.
Image storage strategy defined.
Major routes identified.
E-commerce explicitly excluded.

Milestone 1 — Project Foundation
Status: ✅ COMPLETE
Goals:
Create a clean Next.js/TypeScript project foundation.
Tasks:
Create Next.js application.
Enable TypeScript strict mode.
Establish src/ structure.
Configure linting.
Configure formatting if desired.
Establish environment variable structure.
Add .env.example.
Configure .gitignore.
Create initial project documentation.
Verify development server.
Verify production build.
Verify type checking.
Verify linting.
Completion criteria:
npm run dev
npm run build
npm run lint
must work successfully.
TypeScript must compile without errors.

Milestone 2 — Supabase Foundation
Status: ✅ COMPLETE
Goals:
Connect the application to Supabase correctly.
Tasks:
Create/configure Supabase project.
Install required Supabase packages.
Configure environment variables.
Create browser Supabase client.
Create server Supabase client.
Configure session handling.
Confirm application can communicate with Supabase.
Ensure secrets are not exposed.
Completion criteria:
Application successfully communicates with Supabase.
Browser/server responsibilities are separated correctly.
Environment variables are documented.
Production build succeeds.

Milestone 3 — Database Schema
Status: ✅ COMPLETE
Goals:
Create the core application database.
Tasks:
Create products table.
Create events table.
Add UUID primary keys.
Add timestamps.
Add product slug uniqueness constraint.
Add sensible defaults.
Add validation/database constraints.
Add updated_at behavior.
Create database migration files.
Seed development/test records if useful.
Completion criteria:
Products can be created and queried.
Events can be created and queried.
Database can be recreated from migrations.

Milestone 4 — Database Security / RLS
Status: ✅ COMPLETE (implemented; deployed to and verified on the hosted project 2026-09-28)
Goals:
Secure the database before building administrative CRUD features, using the
Owner/Employee authorization model (sections 5 and 7).
Tasks:
Create the minimal authorization structure required to distinguish Owner and Employee
(profiles or user_roles; see section 4).
Associate authorization records with Supabase Auth users (auth.users.id).
Restrict allowed roles to owner and employee.
Enable RLS on products.
Enable RLS on events.
Implement public product read policy (final decision: all rows public; is_available only affects display).
Implement public event read policy (is_active and starts_at <= now() and ends_at >= now()).
Implement authenticated Employee/Owner management policies (read all, create, update, delete).
Ensure merely being authenticated does not grant administrative write access
(policies check the role, not only auth.uid() IS NOT NULL).
Consider security of the authorization table itself (enable RLS; no user can grant or
change roles, including their own).
Establish how the initial Owner is bootstrapped.
Test anonymous, Employee, Owner, and unauthorized authenticated-user access.
Ship together with the Milestone 3 migration when first applying to the hosted project.
Expected behavior:
Anonymous
READ products (all rows) ✓
READ events (currently relevant only) ✓
CREATE product ✗
UPDATE product ✗
DELETE product ✗
CREATE event ✗
UPDATE event ✗
DELETE event ✗
Modify authorization records ✗

Authenticated user without a role
Same as Anonymous

Employee
READ (all products/events) ✓
CREATE ✓
UPDATE ✓
DELETE/ARCHIVE ✓
Modify authorization records ✗

Owner
Same product/event permissions as Employee ✓
Modify authorization records directly through the public API ✗
(employee access is managed through server-side actions in Milestone 6)
Completion criteria:
Security rules are enforced by Supabase/PostgreSQL rather than only by the UI.
Authentication alone never grants write access; the Owner/Employee role is verified.
The initial Owner can be bootstrapped using a documented procedure.

Milestone 5 — Admin Authentication
Status: ✅ COMPLETE (2026-09-28; hosted Owner verification passed, see development log)
Goals:
Allow Employees and the Owner to access administrative functionality.
Tasks:
Build admin login page (shared by Employee and Owner).
Implement Supabase login.
Implement logout.
Protect /admin.
Protect administrative child routes.
Check the user's application role server-side, not only that a session exists.
Deny signed-in users without an Employee/Owner role.
Make the user's role available to server code so Owner-only areas can be gated.
Public sign-up is already disabled (supabase/config.toml locally; hosted Dashboard setting verified 2026-09-28).
Handle expired sessions.
Handle invalid credentials.
Redirect unauthenticated visitors.
Verify authenticated sessions survive navigation.
Completion criteria:
Anonymous visitor:
/admin → redirected to login
Authenticated user without a role:
/admin → access denied
Employee:
/admin → dashboard
Owner:
/admin → dashboard

Milestone 6 — Owner Employee Management
Status: ✅ COMPLETE (implemented 2026-09-28; hosted Owner/Employee lifecycle verified
2026-09-30 with custom SMTP, see development log)
Goals:
Allow the Owner to securely manage Employee access without directly using the Supabase dashboard.
Tasks:
Owner-only employee-management route (/admin/employees).
List employees.
Invite employee by email.
Protected server-side invitation action/endpoint.
Verify Owner authorization server-side.
Send employee invitation through Supabase.
Employee establishes own password.
Revoke/deactivate employee access.
Handle duplicate/existing email cases.
Handle invitation failures.
Ensure Employees cannot access this functionality.
Ensure privileged Supabase credentials never reach the browser.
Completion criteria:
The Owner can invite an Employee through the application.
The Employee receives the appropriate invitation flow and establishes their own credentials.
The Employee can subsequently sign in.
The Employee receives Employee permissions.
The Employee cannot manage other users.
The Owner can revoke/deactivate Employee access.
All privileged user-management operations occur server-side.

Milestone 7 — Admin Product Management
Status: ✅ COMPLETE (implemented 2026-09-30; hosted verification with a real Employee
account passed 2026-09-30, see development log)
Goals:
Implement complete product management.
Tasks:
Product list.
Create product.
Edit product.
Archive/delete product.
Toggle availability.
Toggle featured status.
Validate product input.
Generate/validate slugs.
Display success/error feedback.
Completion criteria:
An Employee (or the Owner) can manage the complete product catalog without directly accessing Supabase.
Implementation (2026-09-30):
Architecture: same layering as Milestone 6. src/lib/products/management.ts holds the rules
(authorizeStaff first, then input validation, then the ProductStore); supabase-store.ts is
the adapter over the request's user-scoped Supabase client; store.ts (server-only) opens it.
Server Functions in src/app/admin/(dashboard)/products/actions.ts are thin wrappers that
pass getAdminAccess() and only the whitelisted form fields.
Authorization: Owner and Employee (not Owner-only). Three layers: proxy + requireStaff() on
pages; authorizeStaff() inside every rule (Server Functions are public POST endpoints);
RLS in the database. The secret key is not used for products.
Fields managed: name, slug, description, category, price, is_available, is_featured.
image_url was untouched (managed as image_path since Milestone 8). id and timestamps are never taken from the browser;
updated_at comes from the existing products_set_updated_at trigger.
Validation (server-side; browser constraints are convenience only): name required (trimmed,
whitespace collapsed, ≤120); slug optional (empty = generated from the name with diacritics
transliterated, e.g. "Kamilica čaj" -> kamilica-caj) or typed (lower-cased, must match the
products_slug_format rule, ≤100); category optional (≤60); description optional (≤5000);
price optional, 0–99999999.99 with at most 2 decimals, "." or "," accepted, stored as
numeric; checkboxes true only when checked. Empty optional fields are stored as NULL.
Slug uniqueness: enforced by products_slug_key; a 23505 is shown as a slug field error.
Slugs are not auto-suffixed: the employee chooses another one.
Status toggles set an explicit value (not "flip"), so double submissions are idempotent.
Removal: permanent delete with a browser confirmation (no archive column exists; see
section 7). Product ids are UUID-validated; update/delete/toggle report "does not exist"
when no row was affected.
Feedback: fixed messages only. Create/edit redirect to /admin/products?notice=created|updated
(only these codes render); list actions show their result above the table.
No migration, no RLS or grant change.

Milestone 8 — Image Storage
Status: ✅ COMPLETE (implemented 2026-09-30; migration applied to the hosted project and
hosted image upload test passed 2026-09-30, see development log)
Goals:
Support product and promotional imagery.
Tasks:
Create/configure product image storage.
Create/configure promotion image storage.
Configure storage security.
Implement image upload.
Validate file type.
Validate file size.
Save image references to database.
Display uploaded images.
Handle image replacement.
Handle deleted/archived content appropriately.
Completion criteria:
An administrator can upload an image through the application and the image appears on the corresponding public content.
Implementation (2026-09-30): see section 6 for the full design.
Storage: public buckets product-images and promotion-images (5 MiB, JPEG/PNG/WebP),
staff-only insert/select/delete policies on storage.objects via private.is_staff(), no
update policy. Created by migration 20260930120000_add_image_storage.sql (also renames
products/events image_url -> image_path and adds the path CHECK constraints).
Product images: upload, replace and remove on the edit page; thumbnails in the list;
image cleanup when a product is deleted. Server-side validation by file signature; paths
generated by the server; replacement and deletion ordered for safe partial failure.
Promotion images: bucket and policies only; the UI comes with Milestone 9.
Discrepancy with the completion criterion: there are no public product/promotion pages
yet (Milestones 10/11). The criterion is met for this milestone when an uploaded image is
reachable at its public URL and shown in the admin; public pages will render the same URL.
Hosted: migration applied and the image upload test passed (2026-09-30).

Milestone 9 — Admin Event/Promotion Management
Status: ⬜ NOT STARTED
Goals:
Allow Employees and the Owner to manage temporary website content.
Tasks:
Event list.
Create event.
Edit event.
Delete/deactivate event.
Configure start date.
Configure end date.
Toggle active status.
Upload promotional image.
Validate date ranges.
Completion criteria:
Administrator can create:
Title:
"Autumn Herbal Tea Week"

Starts:
October 1

Ends:
October 7

Active:
Yes
and the system has enough information to determine whether it should currently be displayed.

Milestone 10 — Public Product Catalog
Status: ⬜ NOT STARTED
Goals:
Expose product information publicly.
Tasks:
Build /products.
Fetch products.
Product cards.
Product images.
Availability display.
Categories.
Search.
Filtering.
Product detail pages.
Handle invalid product URLs.
Responsive layout.
Completion criteria:
Visitors can browse and inspect the pharmacy's product catalog without authentication.

Milestone 11 — Public Promotion System
Status: ⬜ NOT STARTED
Goals:
Automatically display currently relevant promotions.
Tasks:
Query active promotions.
Respect starts_at.
Respect ends_at.
Respect is_active.
Display promotional images.
Handle multiple simultaneous promotions.
Handle no active promotions.
Completion criteria:
Expired promotions disappear without requiring an employee to manually remove them.
Future promotions remain hidden until their start time.

Milestone 12 — Landing Page
Status: ⬜ NOT STARTED
Goals:
Create the primary marketing experience.
Potential sections:
Navigation.
Hero.
Current promotion.
Featured products.
Product categories.
About section.
Pharmacy/location section.
Contact CTA.
Footer.
Mobile navigation.
Design goals:
Modern.
Clean.
Premium.
Natural/plant-inspired.
Professional.
Trustworthy.
Responsive.
Avoid generic "template" appearance.

Milestone 13 — About & Contact
Status: ⬜ NOT STARTED
Tasks:
About page.
Contact page.
Address.
Phone.
Email if applicable.
Business hours.
Map/location integration if desired.
Social links if applicable.
Completion criteria:
Visitors can easily determine what the pharmacy is, where it is, and how to contact it.

Milestone 14 — UX / Responsive Polish
Status: ⬜ NOT STARTED
Tasks:
Mobile testing.
Tablet testing.
Desktop testing.
Navigation polish.
Loading states.
Empty states.
Error states.
Form validation UX.
Confirmation for destructive actions.
Accessibility review.
Keyboard navigation.
Image optimization.
Layout shift review.

Milestone 15 — SEO & Metadata
Status: ⬜ NOT STARTED
Tasks:
Site metadata.
Page titles.
Meta descriptions.
Product metadata.
Open Graph metadata.
Sitemap.
Robots configuration.
Semantic HTML.
Canonical URLs where necessary.

Milestone 16 — Security Review
Status: ⬜ NOT STARTED
Verify:
RLS enabled correctly.
Anonymous users cannot write.
Authenticated users without a role cannot write or access admin routes.
Employees cannot access employee management or change roles.
Authorization records cannot be modified through the public API.
Admin routes protected.
Admin mutations protected server-side.
Owner-only actions verify the Owner role server-side.
No service-role/secret key exposed (not in NEXT_PUBLIC_ variables or client bundles).
Public sign-up disabled.
Environment secrets protected.
Inputs validated.
Uploads validated.
Authentication errors handled safely.
No sensitive information logged.
Authorization tested manually.

Milestone 17 — Testing & QA
Status: ⬜ NOT STARTED
Test complete workflows.
Public
Landing page works.
Products load.
Search works.
Filters work.
Product pages work.
Promotions appear correctly.
Expired promotions disappear.
Mobile layout works.
Admin
Login works.
Logout works.
Product creation works.
Product editing works.
Product removal/archive works.
Image upload works.
Event creation works.
Event editing works.
Event expiration works.
Owner
Owner can invite an Employee.
Invited Employee sets their own password and signs in.
Owner can revoke/deactivate an Employee; revoked Employee loses access.
Security
Anonymous write attempts fail.
Anonymous admin access fails.
Authenticated users without a role are denied admin access and writes.
Employees cannot access /admin/employees or its server actions.
Invalid sessions fail safely.
Direct API/database attempts respect authorization.

Milestone 18 — Deployment
Status: ⬜ NOT STARTED
Tasks:
Select hosting environment.
Configure production environment variables.
Configure production Supabase settings.
Configure authentication URLs (including invitation redirect URLs).
Configure invitation email template/SMTP (done on the current hosted project in
Milestone 6; repeat for any new environment).
Disable public sign-up.
Store the privileged Supabase key only as a server-side environment variable.
Bootstrap the initial Owner account.
Configure domain.
Configure HTTPS.
Run migrations.
Build production application.
Deploy.
Perform production smoke test.
Completion criteria:
The public website is reachable through its production domain and the administrative system works correctly in production for both the Owner and Employees.

11. Project Progress
    Milestone 0 — Specification: ✅ Complete
    Milestone 1 — Project Foundation: ✅ Complete
    Milestone 2 — Supabase Foundation: ✅ Complete
    Milestone 3 — Database Schema: ✅ Complete
    Milestone 4 — Database Security / RLS: ✅ Complete (deployed and verified on hosted Supabase)
    Milestone 5 — Admin Authentication: ✅ Complete (hosted Owner verification passed)
    Milestone 6 — Owner Employee Management: ✅ Complete (hosted lifecycle verified)
    Milestone 7 — Admin Product Management: ✅ Complete (hosted Employee verification passed)
    Milestone 8 — Image Storage: ✅ Complete (hosted migration applied, upload test passed)
    Milestone 9 — Admin Event Management: ⬜ Not Started
    Milestone 10 — Public Product Catalog: ⬜ Not Started
    Milestone 11 — Public Promotion System: ⬜ Not Started
    Milestone 12 — Landing Page: ⬜ Not Started
    Milestone 13 — About & Contact: ⬜ Not Started
    Milestone 14 — UX / Responsive Polish: ⬜ Not Started
    Milestone 15 — SEO & Metadata: ⬜ Not Started
    Milestone 16 — Security Review: ⬜ Not Started
    Milestone 17 — Testing & QA: ⬜ Not Started
    Milestone 18 — Deployment: ⬜ Not Started

12. Development Log
    Use this section to record completed work.
    Entry Template
    YYYY-MM-DD — Milestone X
    Completed
    Item
    Item
    Files created
    path/file
    Files modified
    path/file
    Database changes
    Migration/table/policy/etc.
    Tests performed
    Test
    Test
    Known issues
    Issue or None
    Next milestone
    Milestone X

    2026-09-28 — Milestone 1
    Completed
    Next.js 16 App Router project with TypeScript (strict) and src/ structure
    ESLint (eslint-config-next core-web-vitals + TypeScript), typecheck script
    .env.example convention, .gitignore, README
    Files created
    package.json, package-lock.json, tsconfig.json, next.config.ts, eslint.config.mjs
    .gitignore, .env.example, README.md, AGENTS.md, CLAUDE.md
    src/app/layout.tsx, src/app/page.tsx, src/app/globals.css, src/app/favicon.ico
    Files modified
    PROJECT.md
    Database changes
    None
    Tests performed
    npm run lint, npm run typecheck (incl. from clean state), npm run build
    npm run dev and npm run start serve / with HTTP 200
    Known issues
    None blocking
    Next milestone
    Milestone 2 — Supabase Foundation

    2026-09-28 — Milestone 2
    Completed
    Installed @supabase/ssr and @supabase/supabase-js (auth-helpers packages are deprecated)
    Browser client (src/lib/supabase/client.ts) and server-only server client (src/lib/supabase/server.ts)
    Session refresh via Next.js 16 proxy (src/proxy.ts, formerly middleware); no route protection
    Env validation; refuses secret/service_role keys in NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
    Read-only connectivity check: npm run check:supabase (Auth health endpoint)
    Files created
    src/lib/supabase/env.ts, src/lib/supabase/client.ts, src/lib/supabase/server.ts
    src/lib/supabase/proxy.ts, src/proxy.ts, scripts/check-supabase.mjs
    Files modified
    package.json, package-lock.json, .env.example, README.md, PROJECT.md
    Database changes
    None
    Tests performed
    npm run lint, npm run typecheck, npm run build: pass
    Dev server: missing env -> clear error (500); placeholder env -> / 200 (also with stale auth cookie)
    Secret key (sb_secret_) and legacy service_role JWT in public var -> refused
    Importing server client into a Client Component -> build fails (server-only guard)
    check:supabase error paths (missing .env.local, unreachable host) -> exit non-zero
    Live connectivity: npm run check:supabase against the configured project -> success
    (Auth service GoTrue v2.197.0 responded; credentials in git-ignored .env.local)
    Known issues
    None blocking
    Next milestone
    Milestone 3 — Database Schema

    2026-09-28 — Milestone 3
    Completed
    Supabase CLI project layout (supabase/config.toml via `supabase init`, project_id plant-pharmacy, Postgres 17)
    products and events tables with gen_random_uuid() primary keys and timestamptz created_at/updated_at
    Reusable trigger function public.set_updated_at() (search_path pinned to '') with BEFORE UPDATE triggers on both tables
    Constraints: products_slug_key (unique), products_name_not_blank, products_slug_format
    (lowercase kebab-case, rejects empty/whitespace), products_price_non_negative (numeric(10,2), nullable),
    events_title_not_blank, events_ends_after_starts (strictly later)
    Defaults: is_available true, is_featured false, is_active true
    Development seed (supabase/seed.sql): Chamomile Tea, Herbal Balm, Autumn Herbal Tea Week;
    loaded only by local `supabase db reset`, never by `db push`
    RLS deliberately not configured (Milestone 4)
    Files created
    supabase/config.toml, supabase/.gitignore
    supabase/migrations/20260928084238_create_products_and_events.sql
    supabase/seed.sql
    Files modified
    PROJECT.md, README.md
    Database changes
    Migration 20260928084238_create_products_and_events: function set_updated_at, tables products and events,
    triggers products_set_updated_at and events_set_updated_at
    Not yet applied to the hosted Supabase project (must ship together with Milestone 4 RLS)
    Tests performed
    No Docker/Supabase CLI local stack/psql on the dev machine, so tests ran against PGlite 0.5.8
    (PostgreSQL 18.3 compiled to WASM), fresh in-memory database, migration + seed applied from the repo files:
    33/33 checks passed — UUID/timestamp/default generation, query, updated_at trigger on both tables
    (including overriding an explicit updated_at), duplicate slug, negative price (insert and update),
    empty/whitespace/tab-only/null name, empty/whitespace/uppercase/space slug, end before start,
    equal start/end (insert and update), empty/whitespace title, missing starts_at, visibility query,
    identical schema from two fresh databases
    npm run lint, npm run typecheck, npm run build: pass
    Known issues
    Migration not yet verified on the Supabase Postgres image (supabase start / db reset need Docker)
    Next milestone
    Milestone 4 — Database Security / RLS

    2026-09-28 — Documentation / Design (before Milestone 4)
    Completed
    Authorization architecture changed before Milestone 4 to formally distinguish three access levels:
    anonymous Public Visitors (no accounts, read-only public content),
    authenticated Employees (product/event management),
    and an authenticated Owner (Employee capabilities plus Owner-only employee management)
    Being authenticated no longer implies being an employee: administrative access requires an
    owner/employee application role stored in an authorization record keyed by auth.users.id
    Employee onboarding will use an Owner-controlled invitation workflow (Supabase invitation email,
    employee sets own password) rather than Owner-assigned passwords
    Privileged Supabase key reserved for server-side use only; public sign-up not part of the application
    Roadmap: Milestone 4 extended (authorization table, role-based policies, Owner bootstrap);
    Milestone 5 covers Owner and Employee login; new Milestone 6 — Owner Employee Management;
    former Milestones 6–17 renumbered to 7–18; route /admin/employees added to the specification
    Files created
    None
    Files modified
    PROJECT.md, README.md
    Database changes
    None
    Tests performed
    None (documentation only)
    Known issues
    None
    Next milestone
    Milestone 4 — Database Security / RLS

    2026-09-28 — Milestone 4
    Completed
    Authorization table public.user_roles (user_id PK/FK auth.users on delete cascade, role
    text CHECK owner/employee, created_at/updated_at reusing public.set_updated_at(),
    partial unique index user_roles_single_owner)
    Role helper private.is_staff(): SECURITY INVOKER, search_path '', private schema not
    exposed through the Data API, EXECUTE for authenticated only
    RLS enabled on products, events, user_roles with policies products_select_public,
    products_{insert,update,delete}_staff, events_select_public, events_select_staff,
    events_{insert,update,delete}_staff, user_roles_select_own (no user_roles write policies)
    Explicit grants replacing Supabase's permissive defaults (no TRUNCATE for API roles,
    anon read-only, no user_roles writes except service_role); EXECUTE on
    public.set_updated_at() revoked from API roles
    Final public product decision: all product rows public, is_available is display-only
    Public sign-up disabled in supabase/config.toml ([auth] and [auth.email]); hosted setting
    documented as a manual step
    Owner bootstrap: scripts/bootstrap-owner.sql (placeholder email, fails safely) + README procedure
    Files created
    supabase/migrations/20260928090452_add_authorization_and_rls.sql
    scripts/bootstrap-owner.sql
    Files modified
    supabase/config.toml, README.md, PROJECT.md
    Database changes
    Migration 20260928090452_add_authorization_and_rls (table, index, trigger, schema,
    function, grants, RLS, 10 policies). Not applied to the hosted project.
    Tests performed
    No Docker, so no Supabase local stack. Tests ran on real PostgreSQL 17.10 binaries
    (embedded-postgres) plus real PostgREST 16.4, outside the repo, with a Supabase emulation:
    anon/authenticated/service_role/authenticator roles, auth.users, Supabase's auth.uid()
    definition, Supabase's permissive default privileges, migrations run as a NON-superuser
    postgres role. 148/148 checks passed:
    migrations + seed apply in order to two fresh databases with identical
    schema/policy/grant fingerprints; bootstrap script (placeholder refused, unknown email
    refused, owner assigned, second owner refused); role CHECK/FK/PK/cascade/updated_at;
    SQL-level SET ROLE + request.jwt.claims (TRUNCATE denied, RLS cannot be disabled,
    is_staff() results, auth.users unreadable, JWT/user_metadata role claims ignored);
    full HTTP access matrix through PostgREST with HS256-signed JWTs for anon (no token and
    anon JWT), authenticated without role, employee and owner, including user_roles
    insert/upsert/update/delete attempts, RPC exposure of helpers, forged/expired tokens,
    role revocation
    Mutation checks: weakening is_staff() to "any authenticated user" -> 18 failures;
    removing the explicit REVOKEs -> 24 failures (tests detect both)
    npm run lint, npm run typecheck, npm run build: pass
    Known issues
    Not verified against the Supabase Postgres image, GoTrue-issued tokens, or the hosted
    project (Docker unavailable; hosted push intentionally not performed)
    Hosted sign-up setting and Owner bootstrap are manual deployment steps
    Next milestone
    Milestone 5 — Admin Authentication

    2026-09-28 — Milestone 4 hosted deployment & verification
    Completed
    CLI linked to hosted project ENSI (Postgres 17.6). Remote state before deployment: empty
    public schema, no private schema, no migration history, 0 Auth users; default privileges
    were Supabase's permissive defaults (ALL incl. TRUNCATE for anon/authenticated)
    Hosted public sign-up disabled in the Dashboard (verified: settings disable_signup true,
    /auth/v1/signup returns signup_disabled)
    npx supabase db push (dry run first) applied 20260928084238 and 20260928090452 in one
    session; tables empty immediately after; both recorded in remote migration history
    Live catalog verified: RLS on products/events/user_roles; anon SELECT only on
    products/events; authenticated SELECT/INSERT/UPDATE/DELETE on products/events and
    SELECT on user_roles; no TRUNCATE for API roles; 10 policies as designed; user_roles
    PK/FK (auth.users, cascade)/role CHECK/single-owner index; private.is_staff()
    SECURITY INVOKER, search_path '', EXECUTE only for authenticated; private schema not
    exposed (PGRST106), is_staff/set_updated_at not callable as RPC (PGRST202)
    Owner Auth user created by the Owner in the Dashboard; scripts/bootstrap-owner.sql run
    through the linked CLI with the email substituted in memory; exactly one owner row,
    referencing the intended Auth user; re-run refused (duplicate key)
    Files created
    None
    Files modified
    README.md, PROJECT.md (hosted state; Owner creation uses "Create new user" until an
    invitation-acceptance page exists; CLI --file note for the bootstrap script)
    Database changes
    Hosted: both migrations applied; one owner row in user_roles. No other data.
    Tests performed
    Anonymous via the real Data API (publishable key): all product/event/user_roles writes
    and user_roles reads denied (401/42501); RPC/private-schema exposure checks
    Owner smoke test run by the Owner (normal password sign-in, publishable key, no
    service-role key): 25/25 passed — Owner product/event CRUD, Owner sees
    current/future/expired/inactive events, Owner reads only own user_roles row and cannot
    insert/upsert/update/delete role rows; anonymous sees available and unavailable
    products and only the current event, all anonymous writes denied; test rows cleaned up
    Final state: 0 products, 0 events, 1 Auth user, 1 owner row, 0 employees
    Security Advisor: only auth_leaked_password_protection (Auth setting, not database);
    performance advisor: multiple permissive SELECT policies on events (intentional)
    Known issues
    Authenticated-without-role path not smoke-tested on hosted (no temporary production
    user created); covered by local PostgREST tests and the identical hosted catalog
    Employee path not smoke-tested on hosted (no employees exist; not created by design)
    Next milestone
    Milestone 5 — Admin Authentication

    2026-09-28 — Milestone 5
    Completed
    /admin/login: email/password form (useActionState; loading state; safe error messages;
    no sign-up/registration/user creation anywhere). The login Server Function calls
    signInWithPassword and then reads the user's own user_roles row. It redirects
    owner/employee users to /admin. Any other account is signed out immediately and shown
    "This account does not have access to the admin area."
    Route protection: src/proxy.ts guards /admin and every child route except /admin/login
    (getClaims JWT verification + user_roles lookup with the user's session; no service
    role). No session -> /admin/login. No staff role -> session signed out ->
    /admin/login?error=unauthorized. Role lookup error -> /admin/login?error=unavailable
    (fails closed, session kept). Only fixed ?error codes are rendered.
    Data access layer src/lib/auth/staff.ts: getAdminAccess() (React cache), requireStaff().
    Called by the (dashboard) route-group layout and the /admin page. The login page
    redirects staff to /admin and shows the form to everyone else (no redirect loop).
    /admin dashboard: heading, email, role, "Log out" (Server Function,
    signOut scope local, redirect to /admin/login)
    Admin pages marked noindex. Minimal functional CSS in globals.css.
    Unit tests with Node's built-in runner (npm test; no new dependencies)
    Files created
    src/lib/auth/roles.ts, src/lib/auth/staff.ts, src/app/admin/actions.ts,
    src/app/admin/login/{page.tsx,login-form.tsx,actions.ts},
    src/app/admin/(dashboard)/{layout.tsx,page.tsx}, tests/auth-roles.test.ts
    Files modified
    src/proxy.ts, src/lib/supabase/proxy.ts (returns client/claims; redirect helper that keeps
    refreshed cookies), src/app/globals.css, package.json (test script),
    tsconfig.json (allowImportingTsExtensions, for the tests), README.md, PROJECT.md
    Database changes
    None. No migrations, no RLS/grant changes, owner row untouched, no users created.
    Tests performed
    npm run lint, npm run typecheck, npm run build: pass. npm test: 11/11 pass.
    End-to-end (outside the repo): production build driven over HTTP by submitting the
    real forms, against a local mock of the Supabase Auth/PostgREST endpoints (owner,
    employee, no-role, role-lookup-error and expired-token accounts; RLS own-row
    emulated): 67/67 checks passed. Checks covered: anonymous redirects for /admin and all
    listed child routes (including client-navigation requests); login page with no sign-up
    UI; invalid, unknown-email and empty credentials (generic message, no cookie, empty
    input never sent to Auth); Owner login -> /admin with email and role shown, refresh and
    navigation, /admin/login -> /admin; logout clears cookies, revokes the session, and
    /admin redirects afterwards; replaying pre-logout cookies is rejected; Employee login
    shows the Employee role; the no-role account is refused at login and its existing
    session is signed out by the proxy with no redirect loop; role lookup error fails
    closed; an expired access token is refreshed; an invalid refresh token, a garbage
    cookie and a forged JWT for the Owner's id all go to login; unknown ?error codes are
    not rendered; no token material in the HTML. A cross-origin Server Action POST is
    rejected by Next (500, no cookies).
    Hosted (real Supabase project, publishable key only): /admin/login 200; /admin,
    /admin/products, /admin/events/new and /admin/products/x/edit redirect to
    /admin/login; invalid credentials (a non-existent @example.invalid address) show the
    generic error, set no cookie, and /admin stays protected. Hosted JWT signing key is
    ES256 (read from the public JWKS endpoint)
    Known issues
    Hosted Owner login/refresh/logout not yet run: it needs the Owner's password, which is
    not available to the implementer. Run the README "Admin authentication" flow once as
    the Owner. (Resolved: passed on 2026-09-28, see the next entry.)
    Hosted no-role and Employee paths not tested (no such accounts exist; not created by
    design). Covered by the mock end-to-end run and the Milestone 4 RLS tests.
    With ES256, an access-token copy taken before logout remains valid until it expires
    (1 hour or less); the refresh token is revoked at logout. Standard Supabase behavior.
    npm test needs Node 22.18+ (TypeScript type stripping); package engines still say 20.9+
    (resolved in the final cleanup entry below)
    Next milestone
    Milestone 6 — Owner Employee Management

    2026-09-28 — Milestone 5 hosted Owner verification & final cleanup
    Completed
    Hosted Owner verification (real Owner account, hosted Supabase project, run manually by
    the Owner using the README "Admin authentication" check):
    Anonymous /admin -> /admin/login: PASS
    Owner login against hosted Supabase: PASS
    Owner role recognition (email and "Owner" shown on /admin): PASS
    Session persistence after refresh: PASS
    Session persistence across navigation (away from and back to /admin): PASS
    Authenticated /admin/login -> /admin redirect: PASS
    Logout -> /admin/login: PASS
    /admin protected after logout: PASS
    Node requirement corrected. @supabase/* packages declare node >=22.0.0; npm test relies
    on default TypeScript type stripping (Node 22.18.0 / 23.6.0). The test script
    passed a directory (node --test tests/), which Node 22 resolves as a module and fails;
    it now passes a glob that Node expands itself.
    Files created
    None
    Files modified
    package.json (engines.node ^22.18.0 || >=23.6.0; test script glob), README.md, PROJECT.md
    Database changes
    None
    Tests performed
    Node 22.18.0: npm ci --dry-run (no engine warnings), npm test 11/11, npm run lint,
    npm run typecheck, npm run build, next start smoke test (/ 200, /admin -> /admin/login,
    /admin/login 200): all pass. Node 22.17.0: npm test fails (.ts not supported), which
    confirms the minimum. Node 26.10.0: npm test, lint, typecheck, build: pass.
    Known issues
    Hosted Employee and no-role paths not tested against real hosted accounts (no such
    accounts exist; not created by design). Covered by the mock end-to-end run and the
    Milestone 4 RLS tests.
    With ES256, an access-token copy taken before logout remains valid until it expires
    (1 hour or less); the refresh token is revoked at logout. Standard Supabase behavior.
    Next milestone
    Milestone 6 — Owner Employee Management

    2026-09-28 — Milestone 6 (implementation; hosted verification pending)
    Completed
    /admin/employees (Owner only): Employee list (email, role, invitation pending/active,
    date added), "Add employee" (email only), "Remove access" with confirmation; pending
    states, fixed safe messages. Dashboard link shown to the Owner only (convenience; the
    page checks the role itself). Employees see a denial message and no data.
    Owner gate: src/lib/employees/management.ts authorizeOwner() on the verified session +
    own user_roles row, called first by listEmployees/inviteEmployee/removeEmployee; the
    privileged directory is opened only afterwards. Form role values and user ids are
    never trusted (ids are UUID-validated and re-checked).
    Privileged access: SUPABASE_SECRET_KEY (server-only, sb_secret_ or legacy
    service_role; validated) in src/lib/supabase/admin.ts (server-only, stateless client),
    used only through src/lib/employees/. Normal data access unchanged (user-scoped + RLS).
    Provisioning: refuse existing accounts (Owner, Employee, no-role) -> inviteUserByEmail
    -> insert role 'employee' (hard-coded) -> on insert failure delete the Auth user.
    Onboarding: custom invite template -> /admin/accept-invite?token_hash=... (public,
    no-referrer); password validated (8–72 bytes, confirmed) before the token is spent;
    verifyOtp(invite) + updateUser(password) + role check; failures sign the session out.
    Revocation: delete the employee row (filtered role='employee'), then hard-delete the
    Auth user (sessions/refresh tokens revoked); Owner/self/non-employee refused; if the
    account deletion fails, access is still revoked and the Owner is told.
    Files created
    src/lib/supabase/admin.ts, src/lib/employees/{management.ts,supabase-directory.ts,directory.ts},
    src/lib/auth/invite.ts, src/app/admin/(dashboard)/employees/{page.tsx,actions.ts,employee-forms.tsx},
    src/app/admin/accept-invite/{page.tsx,actions.ts,accept-invite-form.tsx},
    supabase/templates/invite.html, tests/employee-management.test.ts, tests/accept-invite.test.ts
    Files modified
    src/lib/auth/roles.ts (accept-invite public path, path constants), src/lib/supabase/env.ts
    (export isPrivilegedKey), src/app/admin/(dashboard)/page.tsx (Owner link),
    src/app/globals.css (list style), supabase/config.toml (local invite template),
    tests/auth-roles.test.ts, .env.example, README.md, PROJECT.md
    Database changes
    None. No migration, no RLS/grant change (service_role grants from Milestone 4 suffice).
    Hosted database untouched; owner row untouched; no accounts created.
    Tests performed
    npm test 55/55; npm run lint, npm run typecheck, npm run build: pass.
    Mock end-to-end (outside the repo): production build driven over HTTP by submitting the
    real rendered forms, against a local mock of Supabase Auth + PostgREST user_roles
    (own-row RLS, no role writes without the secret key, FK cascade, single-owner index,
    one-time invite tokens): 61/61 passed. Anonymous: page and actions redirect to login,
    no privileged calls. No-role: redirect with error=unauthorized, no privileged calls.
    Employee: /admin works, no employee link, /admin/employees denied without data,
    invite/remove/"create owner" POSTs denied with zero privileged calls, no users created.
    Owner: list excludes Owner and no-role accounts; invite normalizes email, creates the
    user and exactly the employee role (a forged role=owner field is ignored), still one
    owner; duplicate, owner-email, existing no-role and invalid emails refused; self,
    malformed-id and non-employee removals refused. Accept invite: page public and does not
    spend the token, no-referrer, mismatch refused without spending, success redirects to
    /admin as Employee with a session, new Employee denied /admin/employees, token single
    use, malformed token refused. Removal: role deleted before the Auth user, removed
    Employee's existing cookie redirected to login. Invitation revoked before acceptance
    cannot be accepted. Secret value, variable name and admin API code absent from
    .next/static and server output; / and /admin/login still 200.
    Known issues
    Hosted not yet configured: SUPABASE_SECRET_KEY not in .env.local; invite email template
    and Site URL must be set in the Dashboard (README "Employee management").
    Hosted Employee invite/accept/remove not run (would create a real account and send a
    real email; needs the Owner's permission).
    If saving the password fails after the token was verified, the link is spent; the Owner
    removes and re-invites the Employee (rare: the password is validated first).
    The built-in Supabase email sender is rate-limited; custom SMTP is a Milestone 18 task.
    Employee list reads each Employee with getUserById; the existing-email check pages
    through listUsers (fine for a small staff; fails closed past 50,000 users).
    Next milestone
    Milestone 6 hosted verification, then Milestone 7 — Admin Product Management
    (Hosted configuration and verification done: see the next entry.)

    2026-09-30 — Milestone 6 hosted verification & completion
    Completed
    Hosted configuration (done by the Owner in the Supabase Dashboard / local env):
    SUPABASE_SECRET_KEY set in the git-ignored .env.local; custom SMTP configured on the
    hosted project; hosted "Invite user" template replaced with
    supabase/templates/invite.html (links to /admin/accept-invite?token_hash=...).
    No credentials, SMTP settings or tokens are recorded in the repository.
    Hosted lifecycle verification (real hosted project, run manually by the Owner with a
    test Employee address they control; README "Manual hosted check"):
    Owner opens Employee Management (/admin/employees): PASS
    Owner invites a new Employee: PASS
    Real invitation email delivered through the custom SMTP provider: PASS
    Invite link routes to the app's /admin/accept-invite flow: PASS
    Invited Employee opens the invitation: PASS
    Employee chooses and saves their own password: PASS
    Employee signs in and reaches the permitted admin area: PASS
    Owner removes the Employee: PASS
    Removed Employee can no longer sign in or access the admin area: PASS
    All Milestone 6 completion criteria are met; status set to COMPLETE.
    Files created
    None
    Files modified
    PROJECT.md, README.md (hosted state, SMTP now configured, completion status).
    supabase/templates/invite.html has a pending formatting-only change (line wrapping; link
    and text unchanged) made before this task; left as is.
    Database changes
    None. No migration, RLS or grant change. The test Employee's role row and Auth user
    were removed by the verified revocation flow.
    Tests performed
    npm test 55/55 pass; npm run lint, npm run typecheck, npm run build: pass
    git status/diff reviewed: no secret-bearing or generated files tracked or staged;
    .env.local is ignored (.gitignore: .env* except .env.example)
    Known issues
    Step 3 of the manual check (a signed-in Employee opening /admin/employees sees the
    Owner-only denial) was not separately reported for the hosted run; it is covered by
    the unit tests and the mock end-to-end run.
    If saving the password fails after the token was verified, the link is spent; the Owner
    removes and re-invites the Employee (rare: the password is validated first).
    Employee list reads each Employee with getUserById; the existing-email check pages
    through listUsers (fine for a small staff; fails closed past 50,000 users).
    At deployment the hosted Site URL must point to the production domain and the
    secret key must be set as a production server-side variable (Milestone 18).
    Next milestone
    Milestone 7 — Admin Product Management

    2026-09-30 — Milestone 7 (implementation; hosted verification pending)
    Completed
    /admin/products (Owner + Employee): table of all products (name, slug, category, price,
    availability, featured, updated), empty-catalogue and load-failure states, "Add product"
    link, per-row Edit, Mark available/unavailable, Feature/Unfeature and Delete (with
    confirmation). Result messages shown above the table.
    /admin/products/new and /admin/products/[id]/edit: shared form (name, slug, category,
    price, description, available, featured) with field-level errors that keep the
    submitted values; invalid/unknown ids show "This product does not exist".
    Dashboard links to product management for all staff.
    Rules in src/lib/products/management.ts: authorizeStaff() before any store call;
    parseProductForm() (normalization, limits, slug generation/validation, price parsing);
    only PRODUCT_FIELDS are read from forms and only those columns written; database errors
    reduced to code/status and mapped to fixed messages (23505 -> slug taken, 42501/401/403
    -> not permitted).
    Removal decision: hard delete (no archive column; section 7). No image handling (Milestone 8).
    No public catalogue (Milestone 10).
    Files created
    src/lib/products/{management.ts,supabase-store.ts,store.ts},
    src/app/admin/(dashboard)/products/{page.tsx,actions.ts,product-list.tsx,product-form.tsx},
    src/app/admin/(dashboard)/products/new/page.tsx,
    src/app/admin/(dashboard)/products/[id]/edit/page.tsx, tests/product-management.test.ts
    Files modified
    src/lib/auth/roles.ts (ADMIN_PRODUCTS_PATH), src/app/admin/(dashboard)/page.tsx (link),
    src/app/globals.css (table/form helpers), README.md, PROJECT.md
    Database changes
    None. No migration, no RLS/grant change. Hosted database untouched.
    Tests performed
    npm test 99/99 (44 new: staff gate for every caller type with zero store calls for
    non-staff, create/edit/toggle/delete for Owner and Employee, validation, slug generation
    and conflicts, invalid/nonexistent ids, error mapping, adapter queries and column
    whitelist). npm run lint, npm run typecheck, npm run build: pass.
    Database (outside the repo): repo migrations + seed on PGlite (PostgreSQL in WASM) with
    anon/authenticated roles, auth.uid() from request.jwt.claims and Supabase's permissive
    default privileges; the SQL the adapter's PostgREST calls produce: 34/34 passed.
    Anonymous insert/update/delete denied (42501) and reads allowed; no-role insert denied
    (42501) and update/delete affect 0 rows (reported as "does not exist"); Employee and
    Owner insert/update/flag/delete succeed; trigger bumps updated_at; duplicate slug on
    insert and update -> 23505; negative price -> 23514; missing id -> 0 rows; TRUNCATE and
    user_roles writes still denied; one owner row unchanged.
    Mock end-to-end (outside the repo): production build driven over HTTP by submitting the
    real rendered forms (no JavaScript) against a local mock of Supabase Auth + PostgREST
    with emulated grants/RLS: 54/54 passed. Anonymous: product pages redirect to login;
    replayed create/toggle/delete payloads redirect with zero writes. No-role session:
    replayed POSTs -> login?error=unauthorized, zero writes; login refused. Employee: list,
    create (slug generated, price normalized; forged id/image_url/created_at/role fields not
    written), invalid values re-rendered with errors and kept values, duplicate typed and
    generated slugs, edit page prefilled, invalid/nonexistent/tampered ids, update, slug
    conflict, availability and featured toggles, tampered flag/value/intent refused, delete
    and repeated delete, no raw database text in any response, still denied
    /admin/employees. Owner: create/update/toggle/delete. Empty catalogue message. Logout
    protects product pages. Unknown ?notice codes are not rendered.
    Real build with the hosted env, anonymous only (read-only): / and /admin/login 200;
    /admin/products, /new and /[id]/edit -> /admin/login. SUPABASE_SECRET_KEY value and
    name absent from .next/static and .next/server.
    Known issues
    Hosted product CRUD not yet run by a real Owner/Employee (needs their passwords; see
    README "Product management", "Manual hosted check"). (Resolved: passed as an Employee
    on 2026-09-30, see the next entry.)
    The list is not paginated; PostgREST's default max-rows (1000 on hosted projects) caps
    it. Fine for a single pharmacy's catalogue.
    Categories are free text (the schema column is text); typos create separate categories.
    Deleting a product that later has an uploaded image will need image cleanup (Milestone 8).
    Next milestone
    Milestone 7 hosted verification, then Milestone 8 — Image Storage
    (Hosted verification done: see the next entry.)

    2026-09-30 — Milestone 7 hosted verification & completion
    Completed
    Hosted verification (real hosted Supabase project, run manually by the project owner
    with a real Employee account, signed in through /admin/login with the publishable key
    and normal session; no secret key involved): various product-management operations
    were exercised through /admin/products and its create/edit pages and all worked
    correctly. This confirms product management end to end with a real authenticated
    Employee against the hosted database, grants and RLS (private.is_staff()).
    No account details, credentials or test data are recorded in the repository.
    All Milestone 7 completion criteria and the Definition of Done are met; status set to
    COMPLETE.
    Files created
    None
    Files modified
    PROJECT.md, README.md (hosted verification recorded, completion status)
    Database changes
    None. No migration, RLS or grant change.
    Tests performed
    npm test 99/99; npm run lint, npm run typecheck, npm run build: pass
    git status/diff reviewed: no secret-bearing or generated files; .env.local ignored
    Known issues
    The hosted run was reported as a whole ("various operations"), not step by step
    against the README checklist; individual steps (duplicate slug, delete, both toggles)
    are also covered by the unit, database (PGlite) and mock end-to-end runs.
    Hosted product management was verified as an Employee; the Owner uses the same code
    path and the same RLS policies (covered locally, and Owner product writes were verified
    on the hosted database in the Milestone 4 smoke test).
    Test products created during the hosted run, if any remain, are ordinary catalogue rows
    and can be deleted from /admin/products.
    The list is not paginated (PostgREST max-rows, 1000 on hosted projects).
    Categories are free text; typos create separate categories.
    Deleting a product that later has an uploaded image will need image cleanup (Milestone 8).
    Next milestone
    Milestone 8 — Image Storage

    2026-09-30 — Milestone 8 (implementation; hosted migration and verification pending)
    Completed
    Migration 20260930120000_add_image_storage: products/events image_url renamed to
    image_path (object path, not URL); CHECK constraints products_image_path_format and
    events_image_path_format (<row id>/<uuid>.<jpg|png|webp>, own folder only); public
    buckets product-images and promotion-images (5 MiB, JPEG/PNG/WebP; upserted so the
    settings are reproducible); storage.objects policies image_objects_select_staff,
    product_images_insert_staff, promotion_images_insert_staff, image_objects_delete_staff
    (TO authenticated, private.is_staff(), no UPDATE policy)
    src/lib/images/: validation.ts (limits, signature sniffing, path generation/checks,
    public URLs), storage.ts (ImageStorage port, Supabase adapter with the user-scoped
    client, fixed bucket; removeOwnerImages; [images] issue log)
    src/lib/products/images.ts: setProductImage (validate -> read current path -> upload new
    -> compare-and-set -> delete old; compensation on failure) and removeProductImage
    deleteProduct now takes an ImageStorage and removes the product's images after the row
    ProductStore: setImagePath (compare-and-set), image_path in reads, remove returns it
    Edit page "Image" section (preview, upload/replace, remove with confirmation); list
    thumbnails; new-product page hint; next.config.ts serverActions.bodySizeLimit 6mb
    Runtime relative imports in modules loaded by npm test carry the .ts extension
    (tsconfig allowImportingTsExtensions was already on), because Node's type stripping
    does not resolve extensionless specifiers; earlier tested modules had only type imports
    Files created
    supabase/migrations/20260930120000_add_image_storage.sql,
    src/lib/images/{validation.ts,storage.ts}, src/lib/products/images.ts,
    src/app/admin/(dashboard)/products/{product-image.tsx,product-image-form.tsx},
    tests/product-images.test.ts, tests/support/fakes.ts
    Files modified
    src/lib/products/{management.ts,supabase-store.ts,store.ts},
    src/app/admin/(dashboard)/products/{actions.ts,page.tsx,product-list.tsx},
    src/app/admin/(dashboard)/products/new/page.tsx,
    src/app/admin/(dashboard)/products/[id]/edit/page.tsx, src/app/globals.css,
    next.config.ts, tests/product-management.test.ts (shared fakes, new deleteProduct
    argument, image_path in expected shapes), README.md, PROJECT.md
    Database changes
    Migration above. NOT applied to the hosted project (needs authorization; see README
    "Image storage", "Deploying the migration").
    Tests performed
    npm test 144/144 (45 new: validation of every accepted/refused type, missing/empty/
    oversized/lying-size/unreadable files, path generation and strict recognition,
    traversal and file-name independence, staff gate with zero store/storage calls for
    anonymous/no-role/unavailable, Owner and Employee upload, replacement, removal,
    deletion cleanup incl. folder sweep and other-folder safety, every partial failure in
    section 6, Storage and product-store adapters). npm run lint, npm run typecheck,
    npm run build: pass.
    Database (outside the repo): all repo migrations + seed on PGlite 0.5.8 with a Supabase
    emulation (anon/authenticated/service_role, auth.users, Supabase's auth.uid(),
    permissive default privileges, storage.buckets/storage.objects shaped like Supabase's
    with RLS and Supabase's grants); SQL as the Storage API runs it (SET ROLE +
    request.jwt.claims): 86/86 passed. Columns renamed; seed rows keep NULL; buckets and
    settings; exact policy set; constraints accept own-folder paths and reject other
    folders, traversal, bad names/extensions, uppercase and full URLs; anon and no-role
    upload/list/update/delete denied in both buckets; Employee and Owner upload (both
    buckets), list, delete; uploads refused for unsafe names, traversal, SVG, double
    extension, non-existent product, wrong bucket/folder type, missing folder, other
    buckets; no overwrite/move (no UPDATE policy, duplicate insert fails); deleting a
    missing object is not an error; delete row then image works; upload into a deleted
    product's folder refused; revoked Employee denied; JWT role claims ignored;
    Milestone 4/7 spot checks (anon writes, TRUNCATE, user_roles writes, no-role insert,
    private.is_staff() not executable by anon); two fresh databases have identical
    policy/bucket/constraint fingerprints; re-running the bucket upsert restores settings.
    Mutation checks: removing private.is_staff() from the storage policies -> 7 failures;
    removing the own-folder rule from the constraints -> 3 failures.
    The database run found a real bug that the unit tests could not: an unqualified
    "name" inside the products subquery of the insert policy resolved to products.name.
    Fixed by qualifying objects.name before the migration was applied anywhere.
    Production build started with placeholder env: / and /admin/login 200; product pages
    redirect to /admin/login; no secret key material in .next/static.
    Known issues
    Hosted: migration not applied; buckets/policies not verified against the real Storage
    API; no real upload performed (needs authorization and a staff session).
    The Storage API itself is emulated in the database tests (its RLS behavior is what is
    tested, not its HTTP layer, the bucket size/MIME enforcement or public URL serving).
    Signature-only validation (no decode); EXIF metadata kept; no resizing/optimization.
    A request body over 6 MB is refused by Next.js before the Server Function runs, which
    shows the generic error page instead of the fixed message (the browser-side size check
    prevents this in normal use).
    Orphaned objects are possible only after two failures in a row; they are logged and
    swept when the product is deleted.
    No public pages yet, so the completion criterion "appears on the corresponding public
    content" can only be checked through the public URL (Milestones 10/11).
    Next milestone
    Milestone 8 hosted migration and verification, then Milestone 9 — Admin
    Event/Promotion Management
    (Hosted migration and verification done: see the next entry.)

    2026-09-30 — Milestone 8 hosted deployment & verification
    Completed
    Migration 20260930120000_add_image_storage applied to the hosted project by the project
    owner. Confirmed read-only with `npx supabase migration list --linked`: local and remote
    history both list 20260928084238, 20260928090452 and 20260930120000.
    Hosted image upload test (real hosted project, run manually by the project owner
    through the application; README "Image storage", manual hosted check): reported as
    passing ("it all worked").
    All Milestone 8 completion criteria that can be checked before the public pages exist
    are met; status set to COMPLETE.
    Files created
    None
    Files modified
    PROJECT.md, README.md (hosted state, completion status)
    Database changes
    Hosted: migration 20260930120000 applied (image_url -> image_path, CHECK constraints,
    product-images/promotion-images buckets, four storage.objects policies).
    Tests performed
    Hosted image upload test by the project owner: pass. Remote migration history checked.
    Known issues
    The hosted test was reported as a whole, not step by step against the README
    checklist. Which role ran it, and whether replacement, the refusal of invalid/oversized
    files, removal, product-deletion cleanup and the anonymous curl upload were each run,
    was not reported. These cases are covered by the unit tests and the database (PGlite)
    policy tests.
    "Appears on the corresponding public content" can only be checked through the public
    URL until the public pages exist (Milestones 10/11).
    Earlier limitations remain: signature-only validation (no decode), EXIF metadata kept,
    no resizing/optimization; request bodies over 6 MB get Next's generic error page;
    orphaned files only after two consecutive failures (logged, swept on product deletion);
    removed images may stay cached for up to a day.
    Next milestone
    Milestone 9 — Admin Event/Promotion Management

13. AI Development Workflow
    Claude will perform most implementation work.
    Claude should NOT be given unrestricted instructions such as:
    Build milestone 5.
    Instead, each implementation prompt should specify:
    Current milestone.
    Existing project state.
    Exact objective.
    Requirements.
    Constraints.
    Security requirements.
    Files/components likely affected.
    Required tests.
    Completion criteria.
    Required implementation report.
    Claude should inspect the existing codebase before making changes rather than assuming the current architecture.

14. Required Claude Completion Report
    After every implementation task, Claude should provide:
    IMPLEMENTATION REPORT

Milestone:
Task:

## Completed:

## Files created:

## Files modified:

## Database migrations:

## Security changes:

## Tests executed:

## Test results:

## Known issues:

## Assumptions made:

## Recommended next task:

The report should be saved/copied into the development workflow so another developer or AI can determine the current state without reconstructing previous work.

15. Definition of Done
    A milestone is NOT considered complete merely because the feature visually works.
    A milestone is complete when:
    Implementation is finished.
    TypeScript passes.
    Linting passes.
    Production build passes.
    Relevant functionality is tested.
    Security implications are considered.
    Database migrations are reproducible.
    No known blocking bugs remain.
    Documentation reflects the implementation.
    Claude provides an implementation report.

16. Current State
    Current milestone:
    Milestone 9 — Admin Event/Promotion Management (not started)
    Project status:
    Milestones 1–8 complete. Staff sign in at /admin/login. /admin and every child route
    require an owner/employee user_roles row, checked in the proxy and by requireStaff().
    Logout is in the admin header. Earlier milestones: Application connects to Supabase (browser/server clients,
    proxy session refresh, env configuration verified). products, events and user_roles
    exist as migrations with RLS, role-checked policies and explicit grants
    (sections 4, 5, 7). Both migrations are applied to and verified on the hosted project;
    hosted public sign-up is disabled; the Owner is bootstrapped (one owner, no employees).
    Owner sign-in, session persistence and logout verified on the hosted project
    (2026-09-28). Requires Node ^22.18.0 || >=23.6.0.
    Milestone 6 complete: /admin/employees (Owner only; list, invite, remove) and
    /admin/accept-invite, using the server-only SUPABASE_SECRET_KEY. Hosted project has
    custom SMTP and the repository's invite template; the full Owner invite -> Employee
    accept/password/sign-in -> Owner removal -> access lost lifecycle was verified on the
    hosted project (2026-09-30); the test Employee was removed afterwards.
    Milestone 7 complete: /admin/products (list, availability/featured toggles, permanent
    delete), /admin/products/new and /admin/products/[id]/edit for Owner and Employee,
    using the user-scoped client and the existing products RLS (no migration, no secret
    key). Unit, database (PGlite) and mock end-to-end checks pass, and product management
    was verified on the hosted project with a real Employee account (2026-09-30).
    Milestone 8 implemented (2026-09-30): public product-images/promotion-images buckets
    with staff-only write policies, products/events.image_path (object path, own-folder
    CHECK), product image upload/replace/remove on the edit page, list thumbnails, image
    cleanup on product deletion. Unit and database (PGlite) tests pass. Migration
    20260930120000_add_image_storage.sql is applied to the hosted project, and the hosted
    image upload test passed (2026-09-30). Milestone 8 complete.
    Next action:
    Milestone 9 — Admin Event/Promotion Management (reuse src/lib/images/ and the
    promotion-images bucket for promotional images).
