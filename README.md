# service.powertechniquena.com

A conversational landing page for Google Ads traffic, plus a password-protected
dashboard for reviewing every conversation and seeing which options visitors
choose.

- **`/`** — the lander. Plain HTML, CSS and vanilla JavaScript. No build step.
- **`/admin`** — the dashboard. Sign in with a single password.

---

## How it works

The visitor lands on a chat that behaves like a message thread: an agent bubble
appears after a typing indicator, then answer buttons. Each answer routes to the
next question, and every path ends somewhere useful:

```
"Are you looking for parts or service?"
│
├─ Parts ─► "Reach out for help, or shop online?"
│           ├─ Shop on Web Shop        ─► link to the Atlas Copco Web Shop
│           ├─ Have someone contact me ─► form: name, phone, email, state, parts notes
│           └─ Call parts support now  ─► click-to-call
│
└─ Service ─► form: name, phone, email, service request details
```

Every step is logged — which question was shown, which button was tapped, when,
and which Google Ads campaign the visitor arrived from. That is what powers the
transcript replay and the "which options get chosen" charts.

Form submissions are saved first and emailed second, so a mail outage can never
lose a lead.

---

## Editing the conversation

**`public/flow.js` is the only file you need to touch** to change what the chat
says. It holds the agent's name, the phone number, the Web Shop URL, every
message, every button, and where each button leads.

The dashboard reads the same file, so renaming a question or an option keeps the
reports labelled correctly.

### Before launch

`public/flow.js` ships with a **placeholder phone number**. Replace both lines:

```js
phoneDisplay: "(800) 555-0100",
phoneHref: "tel:+18005550100",
```

---

## Deploying to Vercel

1. **Create a Postgres database.** Vercel Postgres, Neon, Supabase and Railway
   all work. Copy the **pooled** connection string.
2. **Import this repository** in Vercel. Leave the framework preset as *Other* —
   there is no build step. Static files are served from `public/`, and each file
   under `api/` becomes a serverless function automatically.
3. **Set the environment variables** below under Settings → Environment Variables.
4. **Deploy**, then point `service.powertechniquena.com` at the project under
   Settings → Domains.

The database tables are created automatically on the first request, so there is
no migration step. `schema.sql` documents the same schema in readable form.

### Environment variables

| Variable | Required | What it does |
|---|---|---|
| `DATABASE_URL` | yes | Postgres connection string (use the pooled one) |
| `ADMIN_PASSWORD` | yes | The password for `/admin` |
| `SESSION_SECRET` | yes | Signs the admin cookie — `openssl rand -hex 32` |
| `RESEND_API_KEY` | for email | API key from [resend.com](https://resend.com) |
| `FROM_EMAIL` | for email | e.g. `Power Technique Service <noreply@service.powertechniquena.com>` — the domain must be verified in Resend |
| `NOTIFY_EMAILS` | for email | Comma-separated recipients for new submissions |
| `NOTIFY_EMAILS_PARTS` | optional | Overrides `NOTIFY_EMAILS` for parts callbacks |
| `NOTIFY_EMAILS_SERVICE` | optional | Overrides `NOTIFY_EMAILS` for service requests |
| `IP_HASH_SALT` | optional | Salt used when hashing visitor IPs |

If the email variables are missing, submissions are still saved and still appear
in the dashboard — only the notification is skipped, and the dashboard shows why.

---

## Google Ads setup

Point ads at the domain with tracking parameters, for example:

```
https://service.powertechniquena.com/?utm_source=google&utm_medium=cpc&utm_campaign={campaignid}&utm_term={keyword}
```

`gclid` is picked up automatically when auto-tagging is on. Campaign, source,
keyword and click ID are stored against every conversation, shown in the
transcript, included in the notification email, and available as a dashboard
filter.

---

## The dashboard

`https://service.powertechniquena.com/admin`

**Overview** — conversations, engagement, submissions and click-throughs; a bar
chart per question showing how often each option is chosen (options nobody picked
show at zero, which is usually the interesting part); how far conversations get,
as a share of the step above; where conversations end up; and daily volume.

**Conversations** — every chat with the path taken, searchable by option,
campaign or keyword. Click *View* to replay the conversation as it happened,
with the campaign data and any submitted details.

**Submissions** — every parts callback and service request, with CSV export and
the delivery status of each notification email.

All three tabs share the period and campaign filters at the top.

---

## Local development

```bash
npm install
cp .env.example .env.local   # fill in DATABASE_URL, ADMIN_PASSWORD, SESSION_SECRET
npx vercel dev
```

`npx vercel dev` runs the static files and the serverless functions together,
the same way they run in production.

---

## Privacy note

Visitor IP addresses are hashed with a salt before storage and never kept in raw
form. Conversations record the options chosen, not free-text input, apart from
the details a visitor deliberately submits in a form.
