# Q Simplified (QMS Angular)

**Q Simplified** is a queue management system (QMS) for banks and similar service organizations. It covers the full customer journey: ticket issue at a kiosk, agent serving, hall display announcements, admin configuration, SMS notifications, and post-service feedback.

This repository is an **Angular 21 SSR** rewrite of the original Next.js QMS, with an Express BFF, SQL Server via Drizzle ORM, and the same operational model (EAT timezone, daily counters, multi-session portals).

---

## Table of contents

- [What it does](#what-it-does)
- [Architecture](#architecture)
- [Dependencies](#dependencies)
- [Pages & routes](#pages--routes)
- [Design considerations](#design-considerations)
- [Database overview](#database-overview)
- [Setup](#setup)
- [Deployment](#deployment)
- [Further reading](#further-reading)

---

## What it does

| Portal | Who uses it | Purpose |
|--------|-------------|---------|
| **Dashboard** | Admins / managers | Branches, users, roles, queues, ads, forex, settings, audits |
| **Kiosk** | Customers | Select service, language, optional phone; print/issue ticket |
| **Serving (Agent)** | Tellers | Open today’s counter, claim tickets, hold/redirect/serve |
| **Hall display** | Waiting area | Live queue, ads, spoken ticket announcements |
| **Feedback** | Customers | Rate service via branch search or SMS deep link |

Typical flow: **kiosk issues ticket → hall announces when claimed → teller serves → optional SMS rating link → customer rates**.

---

## Architecture

```
┌─────────────┐     ┌──────────────────────────────┐     ┌─────────────┐
│  Browser    │────▶│  Angular SSR + Express BFF   │────▶│  SQL Server │
│  (portals)  │◀────│  src/server.ts + /api/*      │◀────│  (Drizzle)  │
└─────────────┘     └──────────────────────────────┘     └─────────────┘
                              │
                              ├── iron-session cookies (auth / kiosk / display)
                              ├── VMS SMS gateway
                              ├── uploads/ + public/audio/
                              └── logs/ (daily rotation)
```

| Layer | Location | Role |
|-------|----------|------|
| UI | `src/app/features/*` | Lazy-loaded portal pages |
| Core | `src/app/core/*` | API client, guards, timezone, inactivity timeout |
| BFF | `src/server/*` | REST API, sessions, tickets, SMS, LDAP, audit |
| Schema | `src/server/db/schema.ts` | Drizzle MSSQL models |
| SSR entry | `src/server.ts` | Express, CSP, static assets, Angular engine |

**Session cookies**

| Cookie | Portal | Lifetime |
|--------|--------|----------|
| `auth-session` | Dashboard / serving | Dashboard ~24h; serving until EAT midnight |
| `kiosk-session` | Kiosk | ~1 month |
| `display-session` | Hall display | ~1 month |

---

## Dependencies

### Runtime (high level)

| Area | Packages |
|------|----------|
| Framework | Angular 21 (`@angular/*`, `@angular/ssr`), Express 5 |
| Database | `drizzle-orm`, `mssql` |
| Auth | `iron-session`, `bcryptjs`, optional `ldapjs` |
| Logging | `pino`, `sonic-boom` (daily file rotation under `logs/`) |
| UI | Tailwind 4, `@spartan-ng/brain`, `lucide-angular`, `ngx-sonner`, Chart.js |
| Other | `dotenv`, `multer` (ads/uploads), `qrcode`, `luxon` |

SMS uses the **VMS** HTTP API (`src/server/sms.ts`) — no third-party SMS SDK. D-Mark is not used.

### Scripts

```bash
npm start              # ng serve on 0.0.0.0:4200
npm run start:local    # ng serve on localhost:4200
npm run build          # production SSR build → dist/qmsangular/
npm run serve:ssr:qmsangular   # node dist/qmsangular/server/server.mjs
npm test               # Vitest
```

---

## Pages & routes

Defined in `src/app/app.routes.ts`.

### Public

| Path | Description |
|------|-------------|
| `/` | Landing — portal chooser |
| `/settingsForm` | First-time company setup |
| `/feedback/login` | Pick branch for walk-up rating |
| `/RateService/:branchId` | Find today’s ticket and rate |
| `/rating/:ticketId` | SMS deep-link rating page |

### Auth

| Path | Mode |
|------|------|
| `/login` | Staff dashboard login |
| `/adminLoginLocal` | Admin login |
| `/tellerLogin` | Agent / serving login |
| `/kioskLogin` | Kiosk login |
| `/displayLogin` | Hall display login |

### Guarded portals

| Path | Guard | Description |
|------|-------|-------------|
| `/dashboard/*` | `dashboardGuard` | Admin shell (home, branches, users, roles, queues, counters, forex, ads, announcements, socials, settings, hall preview, ticket history, sessions, logs, audit) |
| `/serving` | `servingGuard` | Agent desk |
| `/serving/reports` | `servingGuard` | Per-counter daily reports |
| `/kioskDisplay` | `kioskGuard` | Ticket issue UI |
| `/hallDisplay` | `displayGuard` | Waiting-room display + audio |

---

## Design considerations

1. **Africa/Kampala (EAT)** — Business “today” and stored timestamps follow EAT conventions (`src/server/timezone.ts`). Ticket/counter queries are day-scoped.
2. **Daily counters** — Counter numbers are unique **per branch per EAT day**. Agents must open a new counter each morning; yesterday’s rows do not carry over.
3. **Ticket numbers** — Generated per branch for the day (e.g. `A01`… then letter roll).
4. **Idle security** — Dashboard and serving sessions are logged out after **5 minutes** of inactivity. Kiosk and hall sessions are **not** idle-killed (month-long cookies).
5. **SMS (VMS only)** — E-ticket SMS on create; rating SMS when a ticket is marked Served (needs `FEEDBACK_URL` / `APP_URL` / `ORIGIN`).
6. **Hall audio** — Opus/clip sequences under `public/audio/{Language}/`; announcements queued in `ticket_announcements`.
7. **Auth modes** — `AUTH_METHOD=database|ldap|hybrid` with optional LDAP env vars.
8. **CSP & Host allowlist** — Security headers in `src/server/csp.ts`; `NG_ALLOWED_HOSTS` for LAN/SSR Host checks.
9. **Logging** — Structured JSON to `logs/app.log`, rotated to `logs/app.YYYY-MM-DD.log`.

---

## Database overview

SQL Server schema is defined in Drizzle at `src/server/db/schema.ts`. Relationships are enforced in application logic (UUID string IDs).

| Group | Tables |
|-------|--------|
| Org | `settings`, `branches`, `users`, `roles` |
| Services | `queues`, `sub_menu_items`, `sub_sub_menu_items` |
| Operations | `counters`, `banktickets`, `ticket_services`, `counter_availability_events`, `ticket_announcements` |
| Displays | `ads`, `ad_branches`, `announcements`, `announcement_types`, `social_media`, `exchange_rates` |
| Audit | `logs`, `user_sessions`, `audit_logs` |

**Serving ticket lifecycle (summary)**

```
Not Served → Serving ⇄ Hold
                ↓
           Redirected → (claim again)
                ↓
        Served | No Show | Cancelled
```

For column-level detail, ER-style diagrams, and serving scenarios, see **[docs/db.md](docs/db.md)**.

---

## Setup

### Prerequisites

- Node.js 20+
- npm 10+
- Microsoft SQL Server with an existing QMS database (compatible with this schema)

### Install

```bash
cd qmsangular
npm install
cp .env.example .env   # or create .env from the template below
```

### Environment

Create `.env` in `qmsangular/` (do not commit secrets):

```bash
# SQL Server (Prisma-style URL)
DATABASE_URL="sqlserver://HOST:1433;database=DB;user=USER;password=PASS;encrypt=true;trustServerCertificate=true"

ORIGIN="http://localhost:4200"
APP_URL="http://localhost:4200"
FEEDBACK_URL="http://localhost:4200"
ALLOWED_ORIGINS=*

SESSION_PASSWORD="complex_password_at_least_32_characters_long"
COOKIE_SECURE="false"
RATING_API_SECRET="change-me"

# VMS SMS
SMS_API_KEY="vms_..."
SMS_SENDER_ID="7787"
SMS_ENDPOINT="https://vmsapi.nesscom.net:9443/send"
VERIFY_TLS=true

AUTH_METHOD="database"
USE_LDAP="false"
# LDAP_* when USE_LDAP=true

LOG_LEVEL="info"
NG_ALLOWED_HOSTS=*
HOST=0.0.0.0
PORT=4000
```

Also keep the client rating token in sync: `src/app/core/public-config.ts` (`RATING_API_SECRET`).

### Run locally

```bash
npm start
# open http://localhost:4200
```

Health check: `GET /api/health`.

Optional first boot: visit `/settingsForm` if company settings are not yet configured.

---

## Deployment

1. Set production env (`COOKIE_SECURE=true` behind HTTPS, strong `SESSION_PASSWORD`, real `FEEDBACK_URL`, `NG_ALLOWED_HOSTS` for your hostnames).
2. Build and run SSR:

```bash
npm run build
npm run serve:ssr:qmsangular
```

Default listen: `HOST` (default `0.0.0.0`) and `PORT` (default `4000`). Compatible with process managers such as PM2.

### Persist on the host

| Path | Purpose |
|------|---------|
| `uploads/` | Logos and ad media |
| `public/audio/` | Hall announcement clips |
| `logs/` | Application log files |

Ensure the SQL Server account can read/write the QMS database and that the Node process can write `uploads/` and `logs/`.

---

## Further reading

- **[docs/db.md](docs/db.md)** — Database tables, relationships, serving scenarios, diagrams
- Schema source of truth: `src/server/db/schema.ts`
- Ticket status constants: `src/server/ticketStatus.ts`
