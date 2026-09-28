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
   image_url
   TEXT
   Product image reference
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
image_url
TEXT
Promotional image
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
   Will eventually manage product/promotional images through the admin interface.
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
   setup/deployment: invite the Owner through Supabase Auth, then run
   scripts/bootstrap-owner.sql in the SQL Editor (README, "Bootstrapping the Owner").

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

   Employee Invitation Flow (planned — Owner Employee Management milestone)
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

   Privileged Supabase Operations
   Inviting/creating users requires a privileged Supabase credential (secret/service-role key).
   It is used only in server-side code, in a server-only environment variable (no
   NEXT_PUBLIC_ prefix), introduced no earlier than the Owner Employee Management milestone.
   It must NEVER be exposed through NEXT_PUBLIC_* variables, sent to the browser, included in
   client-side JavaScript, stored in public source code, or committed to Git.
   The Owner dashboard calls protected server-side application functionality; being an Owner
   never causes privileged credentials to become available to the browser.

6. Storage
   Supabase Storage will store images.
   Potential buckets:
   product-images
   promotion-images
   Database records store references/URLs to these files rather than storing image binary data directly in PostgreSQL.

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
   All routes except /admin/login require an Employee or Owner role.
   /admin/login
   Employee/Owner authentication.
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
   The route through which an invited employee sets their password is defined in the
   Owner Employee Management milestone.

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
Status: ✅ COMPLETE
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
Status: ⬜ NOT STARTED
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
Confirm public sign-up is disabled on the hosted project (supabase/config.toml already disables it locally since Milestone 4).
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
Status: ⬜ NOT STARTED
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
Status: ⬜ NOT STARTED
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

Milestone 8 — Image Storage
Status: ⬜ NOT STARTED
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
Configure invitation email template/SMTP if required.
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
    Milestone 4 — Database Security / RLS: ✅ Complete
    Milestone 5 — Admin Authentication: ⬜ Not Started
    Milestone 6 — Owner Employee Management: ⬜ Not Started
    Milestone 7 — Admin Product Management: ⬜ Not Started
    Milestone 8 — Image Storage: ⬜ Not Started
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
    Milestone 5 — Admin Authentication
    Project status:
    Milestones 1–4 complete. Application connects to Supabase (browser/server clients,
    proxy session refresh, env configuration verified). products, events and user_roles
    exist as migrations with RLS, role-checked policies and explicit grants
    (sections 4, 5, 7). The migrations have NOT been applied to the hosted project yet;
    apply both together (README, "Deploying the database"), disable public sign-up on the
    hosted project, then bootstrap the Owner.
    Next action:
    Milestone 5: admin login/logout and /admin protection, resolving the user's role
    server-side from user_roles (the user can read their own row).
