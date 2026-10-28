# Alcor North Star — Internal Core Build

One Hotel. One System. One North Star. This first build delivers the complete internal platform: secure login, client onboarding, pipelines, manager allocation, configurable KPIs, the monthly KPI workflow, the management dashboard, and the branded PDF report. The client portal is designed for but not built yet.

## What gets built

### 1. Accounts and access
- Email + password login. No public signup — admins invite team members and client users from Team Management.
- Roles: Admin, Management, BD Manager, Pipeline Manager, Team Member, Client. Roles live in a dedicated roles table (never on the user profile) and are enforced server-side.
- Every screen and every data read is filtered by role: BD sees onboarding, Pipeline Managers see only their assigned clients/pipelines, Management sees everything.
- Internal notes and credentials are structurally unreachable by client accounts.

### 2. Client onboarding (BD)
Multi-step wizard with save-as-draft at every step:
1. Basic information — hotel, owner, contacts, address, rooms, property type, website and all social URLs.
2. Google Business Profile access — required access email mohnish@group2001.in, provided Yes/No, status Pending / Received / Verified.
3. Signed documents — Agreement, NOC. Upload with status Pending / Uploaded / Verified / Rejected.
4. Payment — status, amount, date, mode, transaction ID, screenshot upload.
5. Onboarding data — login credentials (encrypted, masked, reveal restricted to Admin/Management with the reveal logged), room categories with rates and photos, in-room and property amenities, property details, policies.
6. Brand & compliance documents — mandatory set (Lessee Agreement, Electricity Bill, PAN, Cancelled Cheque, GST, Aadhaar) plus optional (FSSAI, Udyog Aadhaar, Trademark), each with expiry date and reminder flags.
7. Pipeline selection — pick the services Alcor will deliver.
8. Manager allocation — per pipeline: manager, backup, start date, status, monthly KPI target.

Onboarding progress is shown as a checklist with a completeness percentage.

### 3. Pipelines
Seven pipelines available: Performance Marketing, Social Media, Google Business Profile, Influencer Marketing, B2B Connect, WhatsApp Marketing, OTAs. Only selected pipelines appear active for a client. Pipeline weights for the North Star Score are admin-configurable, never hard-coded.

### 4. Configurable KPI engine
- Admin KPI library: add, edit, delete, reorder KPIs; set type (number, currency, percentage, rating, text/audit), direction, default target.
- Assign KPIs to a pipeline globally, then override per client with client-specific monthly targets.
- Ships with the full suggested KPI set for each pipeline pre-loaded as library entries the admin can change.
- OTA pipeline supports multiple OTA records per month (per-OTA room nights, revenue, ADR, occupancy, commission, cancellation %, ranking, conversion).
- GBP supports the NAP audit fields alongside monthly growth KPIs.

### 5. Monthly KPI workflow
- Pipeline Manager opens a month, sees only assigned clients/pipelines, enters actuals against targets.
- Achievement % and month-on-month growth % calculate automatically from the previous approved month.
- Manager adds comments, challenges, next-month actions, and "what we did" work items.
- Status flow: Draft → Submitted → Management Review → Approved. Approved data is what any client-facing surface will ever read.
- Automatic status colour: GREEN 90%+, YELLOW 70–89%, RED below 70% — always with the numeric percentage shown.
- RED KPIs open a detail panel: what went wrong, manager comment, previous month, target, actual, corrective action, deadline, responsible person.

### 6. Management dashboard
- Metric cards: total clients, active, new this month, in onboarding, pending documents, active pipelines, performing, below target, average KPI achievement, overall client health.
- Client master list with client, property, city, rooms, active pipelines, managers, overall KPI %, health, onboarding status, last updated — filterable by client, city, pipeline, manager, status, KPI performance and month.
- North Star Monthly Review: overall business summary, pipeline ranking best-to-worst, and per-manager scorecards (clients, pipelines, achievement %, reports submitted/pending, red/yellow/green counts).

### 7. Client profile
Tabs: Overview, Onboarding, Documents, Property Information, Pipelines, Managers, KPIs, Monthly Reports, Internal Notes (labelled INTERNAL ONLY), Client View (preview of what the client will see).

### 8. Management action tracker
Client, pipeline, issue, action required, responsible manager, priority (Critical/High/Medium/Low), due date, status (Not Started / In Progress / Completed / Delayed), comments. Auto-suggests entries from RED KPIs.

### 9. Team management
Admin adds members: name, email, mobile, role, department, photo, status. Invite sends login credentials.

### 10. Notifications
In-app notification centre with the role-specific triggers: new onboarding, missing documents, pending payment, pending access, new assignment, KPI deadline, report pending, KPI submitted, KPI below target, client health changed, document expiry.

### 11. Branded PDF report
Downloadable Monthly Alcor Growth Report generated from approved data only: hotel name, reporting month, executive summary, what Alcor worked on, KPI results, month-on-month growth, key highlights, next month priorities, closing message. Alcor Getaways branding, positive-but-transparent client language. Internal notes and internal management data are excluded by construction.

### 12. Design
Premium hotel SaaS: navy blue, white, gold accents, generous white space, premium cards, clean charts, pipeline icons, responsive. The North Star motif appears subtly (score, review, quiet star marks) rather than as decoration.

## Technical notes
- Lovable Cloud backend: Postgres with row-level security on every table, secure file storage buckets for documents, screenshots and photos, and server-side role checks via a security-definer role function.
- Schema is built normalised and future-ready — clients, pipelines, client_pipelines, allocations, kpi_definitions, client_kpi_targets, kpi_entries, monthly_reports, documents, credentials, notes, actions, notifications — so revenue management, CRM, lead management, occupancy trackers and AI reporting can be added later without restructuring.
- Credentials are stored encrypted; reveals require Admin/Management and are audited.
- All privileged reads/writes go through authenticated server functions; nothing sensitive is queried from the browser.
- Client-portal-safe views are defined now (approved reports only) so the portal phase is UI work, not a data rewrite.

## Not in this build
Client portal screens (My Growth, What We Did, Results, Next Month, Reports) — planned next, with the data model and PDF already in place. Also excluded: revenue management, OTA rate comparison, sales CRM, AI assistant, WhatsApp/email delivery.

## Starting state
System starts empty — no demo data. First run creates the initial admin account, after which clients and team members are added through the app.
