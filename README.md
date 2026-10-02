# Read and Acknowledge

A web app where people sign in, open a shared link and tick a box to confirm they have read and
understood a named document. Each acknowledgement is recorded against the person, the document and
the time, giving the organisation an audit trail.

This is version 1 from the project brief: *Project Brief: Document Acknowledgement Web App*.

## Microsoft Power Apps version

[`power-app/`](power-app/README.md) has the same concept built on Microsoft 365: a canvas app with
SharePoint lists and two Power Automate flows. People sign in with their existing work accounts.
It includes a setup script, the flows step by step and every Power Fx formula.

## Put it online with Vercel

[Vercel](https://vercel.com) builds the app straight from this GitHub repo and gives you a web link.
Every push to `main` updates it. You'll need a free database from Neon, which Vercel connects for you.

1. **Sign up** at <https://vercel.com> with your GitHub account.
2. **Import the repo:** **Add New → Project**, pick `Read-and-Acknowledge`, then open
   **Environment Variables** and add `SETUP_CODE` = a phrase of at least 12 characters that only you
   know (you'll type it once on the setup page). Click **Deploy**. The first deploy works, but pages
   show an error until the database is connected.
3. **Add the database:** in the project, open **Storage → Create Database → Neon**, accept the
   defaults and connect it to this project (all environments).
4. **Redeploy:** **Deployments**, then the **⋯** menu on the latest one → **Redeploy**. This creates
   the tables.
5. **Create your admin account:** open `https://<your-project>.vercel.app/setup`, enter the setup
   code, your name, email and a password. The page stops working once an admin exists.

Sign links and set-password links use the project's production address automatically. To use your
own domain instead, add it under **Settings → Domains** and set `APP_URL` to it (for example
`https://acknowledge.example.com`), then redeploy.

Vercel's free Hobby plan is for personal, non-commercial use; company use needs the Pro plan.

## Try it locally

The quickest way is [Docker Desktop](https://www.docker.com/products/docker-desktop/) (Windows, Mac or Linux).
It runs the app and its database together; nothing else needs installing.

1. Download this repository (green **Code** button → **Download ZIP**, then unzip), or `git clone` it.
2. Open a terminal in the project folder and start it:

   ```bash
   docker compose up --build
   ```

   The first run takes a few minutes. It's ready when you see `Ready`.
3. In a **second** terminal, create your admin account:

   ```bash
   docker compose exec app npm run create-admin -- --name "Your Name" --email you@example.com
   ```

   It prints a link. Open it in your browser and set a password.
4. Go to <http://localhost:3000>. Create a document, add a few people (made-up emails are fine), and
   use **Create set-password link** to make a reader account. Open that link in a private window to
   sign as the reader.

To stop, press Ctrl+C in the first terminal. `docker compose down` removes the containers but keeps
your data; `docker compose down -v` deletes the data too.

## Clickable demo

`demo/index.html` is a standalone, browser-only demo with sample data. It doesn't need the server or
a database: open the file directly, or publish it with GitHub Pages. Changes stay in the viewer's browser.

## What it does

**Readers** (anyone asked to acknowledge a document)

- Sign in with their own account (email and password).
- See **My documents**: everything they've been asked to sign, with due dates and status.
- Open a document's link, see its name, description, version and an optional link to where it's held,
  tick *"I have read and understood this document."* and press **Confirm**. Confirm stays disabled
  until the box is ticked.
- See a confirmation with the date and time. They can't sign the same document twice, or undo it.

**Admins** (compliance, HR, legal or operations staff)

- Add a document by name, with optional description, version label, due date and link to where it's held.
- Choose which **outstations** (maintenance teams) need to acknowledge a document. Everyone at a ticked
  outstation is expected to sign, including people who join it later. The outstations are Head Office,
  Ferrybridge, Tuebrook, Stirling, Bardon, Isle of Grain, Humber, Port Talbot, Llanwern and Milford Haven.
- Tick **distribution lists** too: Engineering, Purchasing, Health and Safety and Operations Managers.
  Anyone at a ticked outstation **or** on a ticked list is expected to sign. A person has one outstation
  but can be on several lists.
- See progress by outstation and by distribution list on each document, and filter people and CSV
  exports by either.
- Add the people expected to sign, typed in or pasted straight from a spreadsheet (`Name, email`, two
  tab-separated columns in either order, or `Name <email>`). New email addresses get a reader account.
- Copy the document's sign link and share it themselves.
- See who has and hasn't signed each document, with overdue flags.
- Close a link so no more signatures are accepted, and reopen it.
- Void a mistaken acknowledgement with a reason; the record and reason are kept.
- Export acknowledgement records to CSV, filtered by document and date range.
- Acknowledge documents themselves: **Add me to this list** on a document's page (or on its sign
  page), then sign it like anyone else. Their documents also appear under **My documents**.
- Give each person an outstation and distribution lists when adding them (tick them for the whole
  batch, or put them on each line, e.g. `Sam Patel, sam@example.com, Ferrybridge, Engineering`), and
  change them later from the People page.
- Manage people: edit names, emails and employee IDs, make or remove admins, and create
  set-password or reset links.

## Decisions on the brief's open questions

The brief left two questions open. v1 takes these defaults; both are easy to change.

| Question | v1 default |
| --- | --- |
| How are reader accounts created? | An admin adds people by email. The app creates the account and the admin creates a one-time **set-password link** (valid 7 days) and shares it, like a sign link. |
| How do readers reset a forgotten password, with no emails in v1? | An admin creates a **reset link** from the People page and shares it. Setting a new password signs the person out everywhere else. |

Other choices worth knowing:

- **One acknowledgement per person per document.** Changing a document's version label doesn't ask
  people to sign again. For a new version that needs fresh sign-off, create a new document.
  Each record keeps the document name and version it was signed under.
- **Removing someone from a document's list** keeps any acknowledgement they already made.
- Times are shown in UK time (`APP_TIME_ZONE`, default `Europe/London`); CSV times are UTC.

## How the record is protected

- Acknowledgements are **append-only, enforced by the database**: a trigger blocks deletes, truncates
  and edits. The only change allowed is voiding a live record once, with a reason, and who voided it.
  A partial unique index allows one live acknowledgement per person per document.
- Each record stores the signer's name, email, outstation and distribution lists at the time, document name, version label, the exact statement
  text, timestamp, IP address and browser user agent.
- Admin actions (creating documents, adding and removing people, role changes, voids, account links)
  are written to an `audit_log` table.

## Security

- Passwords are hashed with bcrypt (cost 12) and must be at least 12 characters.
- Sign-in is rate limited by IP and email, and an account locks for 15 minutes after 5 wrong passwords.
- Sessions, set-password links and sign links use 256-bit random tokens. Sessions and account links
  are stored only as SHA-256 hashes. Session cookies are `HttpOnly`, `SameSite=Lax`, and in production
  `Secure` with the `__Host-` prefix.
- Only signed-in readers on a document's list can sign it. Readers never see other people's names.
- `Referrer-Policy: no-referrer` stops sign links leaking to other sites, and pages can't be framed.
- CSV exports neutralise cells that a spreadsheet would run as formulas.

## Running it without Docker

Needs Node.js 20+ and PostgreSQL 13+.

```bash
npm install
cp .env.example .env            # then edit DATABASE_URL and APP_URL
export $(grep -v '^#' .env | xargs)

npm run db:migrate              # creates the tables; safe to re-run
npm run create-admin -- --name "Your Name" --email you@example.com
# prints a one-time link: open it to set your password

npm run dev                     # or: npm run build && npm start
```

Then open the app, create a document, add people, create their set-password links and share the
document's sign link.

| Variable | Purpose |
| --- | --- |
| `DATABASE_URL` | PostgreSQL connection string (`POSTGRES_URL` also works; migrations prefer `DATABASE_URL_UNPOOLED` when set) |
| `APP_URL` | Public base URL used in the sign and set-password links admins copy |
| `APP_TIME_ZONE` | Optional. Time zone for displayed times and due dates (default `Europe/London`) |
| `SETUP_CODE` | Code needed on `/setup` to create the first admin when you have no command line (e.g. on Vercel) |
| `COOKIE_SECURE` | Optional. Set to `false` only for a plain-http local trial; secure cookies are on by default in production |

## Tests

```bash
npm run typecheck
npm test                                            # unit tests
TEST_DATABASE_URL=postgres://... npm test           # also checks the database rules
```

The database tests need a migrated, empty database (run `npm run db:migrate` against it first).
They run inside transactions that are rolled back.

## Project layout

```
db/migrations/        SQL schema, including the append-only trigger
scripts/              migrate and create-admin
src/lib/              database, sessions, passwords, tokens, CSV and list parsing
src/app/login         sign-in
src/app/account       set-password and reset links
src/app/my            reader's list of documents
src/app/sign          the sign page
src/app/admin         dashboard, documents, people and CSV export
tests/                unit and database tests
```

## Not in v1

From the brief: uploading or displaying documents, automatic emails or reminders, legally binding
e-signatures, quizzes, native apps and HR system integrations.

Also left for later:

- **Bot protection** (e.g. Cloudflare Turnstile) on the sign-in page. Rate limiting and lockout are in
  place, but the rate limiter is in memory, so it applies per server instance.
- **Multi-factor authentication** for admins.
- **Single sign-on** with existing work accounts (e.g. Microsoft Entra ID), which would replace
  set-password links.
- **Retention rules** for old records. The brief's question on how long records are kept is still open.
