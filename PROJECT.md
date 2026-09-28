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
   Administrative Panel
   Accessible only to authenticated employees.
   Administrators can:
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
   │ └── events
   │
   └── Admin authentication

Admin Panel
│
├── Login
├── Dashboard
├── Product Management
└── Event Management

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

5. Authentication
   Authentication will use Supabase Auth.
   Passwords must never be stored inside application database tables.
   Initially, authenticated accounts are assumed to represent authorized employees.
   Public registration is not required.
   Potential future authorization structure:
   auth.users
   │
   ▼
   profiles / user_roles
   │
   ├── owner
   ├── administrator
   └── employee
   Roles should only be introduced if different permission levels become necessary.

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
   /admin/login
   Employee authentication.
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
Status: ⬜ NOT STARTED
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
Status: ⬜ NOT STARTED
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
Status: ⬜ NOT STARTED
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
Status: ⬜ NOT STARTED
Goals:
Secure the database before building administrative CRUD features.
Tasks:
Enable RLS on products.
Enable RLS on events.
Define public read policies.
Define authenticated administrative write policies.
Test anonymous access.
Test authenticated access.
Test unauthorized write attempts.
Expected behavior:
Anonymous
READ products ✓
READ events ✓
CREATE product ✗
UPDATE product ✗
DELETE product ✗
CREATE event ✗
UPDATE event ✗
DELETE event ✗

Authorized employee
READ ✓
CREATE ✓
UPDATE ✓
DELETE/ARCHIVE ✓
Completion criteria:
Security rules are enforced by Supabase/PostgreSQL rather than only by the UI.

Milestone 5 — Admin Authentication
Status: ⬜ NOT STARTED
Goals:
Allow authorized employees to access administrative functionality.
Tasks:
Build admin login page.
Implement Supabase login.
Implement logout.
Protect /admin.
Protect administrative child routes.
Handle expired sessions.
Handle invalid credentials.
Redirect unauthenticated visitors.
Verify authenticated sessions survive navigation.
Completion criteria:
Anonymous visitor:
/admin → redirected to login
Authenticated employee:
/admin → dashboard

Milestone 6 — Admin Product Management
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
An employee can manage the complete product catalog without directly accessing Supabase.

Milestone 7 — Image Storage
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

Milestone 8 — Admin Event/Promotion Management
Status: ⬜ NOT STARTED
Goals:
Allow employees to manage temporary website content.
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

Milestone 9 — Public Product Catalog
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

Milestone 10 — Public Promotion System
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

Milestone 11 — Landing Page
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

Milestone 12 — About & Contact
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

Milestone 13 — UX / Responsive Polish
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

Milestone 14 — SEO & Metadata
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

Milestone 15 — Security Review
Status: ⬜ NOT STARTED
Verify:
RLS enabled correctly.
Anonymous users cannot write.
Admin routes protected.
Admin mutations protected server-side.
No service-role key exposed.
Environment secrets protected.
Inputs validated.
Uploads validated.
Authentication errors handled safely.
No sensitive information logged.
Authorization tested manually.

Milestone 16 — Testing & QA
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
Security
Anonymous write attempts fail.
Anonymous admin access fails.
Invalid sessions fail safely.
Direct API/database attempts respect authorization.

Milestone 17 — Deployment
Status: ⬜ NOT STARTED
Tasks:
Select hosting environment.
Configure production environment variables.
Configure production Supabase settings.
Configure authentication URLs.
Configure domain.
Configure HTTPS.
Run migrations.
Build production application.
Deploy.
Perform production smoke test.
Completion criteria:
The public website is reachable through its production domain and the administrative system works correctly in production.

11. Project Progress
    Milestone
    Status
12. Specification
    ✅ Complete
13. Project Foundation
    ⬜ Not Started
14. Supabase Foundation
    ⬜ Not Started
15. Database Schema
    ⬜ Not Started
16. Database Security / RLS
    ⬜ Not Started
17. Admin Authentication
    ⬜ Not Started
18. Admin Product Management
    ⬜ Not Started
19. Image Storage
    ⬜ Not Started
20. Admin Event Management
    ⬜ Not Started
21. Public Product Catalog
    ⬜ Not Started
22. Public Promotion System
    ⬜ Not Started
23. Landing Page
    ⬜ Not Started
24. About & Contact
    ⬜ Not Started
25. UX / Responsive Polish
    ⬜ Not Started
26. SEO & Metadata
    ⬜ Not Started
27. Security Review
    ⬜ Not Started
28. Testing & QA
    ⬜ Not Started
29. Deployment
    ⬜ Not Started

30. Development Log
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

31. AI Development Workflow
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

32. Required Claude Completion Report
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
    Milestone 1 — Project Foundation
    Project status:
    Planning complete. Implementation not yet started.
    Next action:
    Create the initial Next.js/TypeScript project foundation.
