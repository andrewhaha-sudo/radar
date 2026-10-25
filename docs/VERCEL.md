# Publish RADAR on Vercel with Supabase

The repository now includes a Vercel SPA + Node API deployment. **It has not been published to a live Vercel account.** You need to create/sign in to Vercel, authorize the GitHub repository, and enter private server settings there. No private passwords or tokens should be sent in chat or committed.

## 1. Prepare Supabase

Use the existing project `https://xtfbdaphayodkkgzwecb.supabase.co`. In Supabase enable **Authentication → Providers → Email** and permit sign-ups. Gmail and other valid email domains work; RADAR has no `.edu` restriction. Enable email confirmation and configure production SMTP for dependable confirmation/recovery mail. A Gmail address does not grant school permissions.

Have these private server values ready in the Supabase dashboard:

- **Connect → Session pooler** PostgreSQL URI. Use the pooler hostname/port provided by Supabase, replace the password locally, URL-encode special characters. This is the database password, not the public anon key. RADAR verifies TLS certificates.
- **Project Settings → API Keys** service-role key, server only. The app uses it to manage a **private** `radar-uploads` bucket. Do not use a public bucket.
- Your confirmed account email for `RADAR_ADMIN_EMAIL`. Only this initial confirmed Supabase identity receives the installation administrator role; public sign-up never lets someone select an administrator role.

See [SUPABASE.md](SUPABASE.md) for database namespaces, private Storage, migrations and local-to-cloud data limits. Back up first. Existing SQLite school data is not automatically transferred to Supabase.

For local SQLite development, Gmail sign-up also works. If you own the local server and want your registered Gmail account to manage setup, run `npm run admin:local -- your-existing-account@gmail.com`, then sign out/in. This terminal-only utility is blocked in hosted PostgreSQL mode. Other users cannot elevate themselves through registration.

## 2. Import GitHub in Vercel

1. Create/sign in at Vercel using your GitHub account.
2. Add New → Project → import `andrewhaha-sudo/radar`.
3. Select `design/radar-command-dashboard` as the deployment/production branch. The updated code is on this branch; importing old `main` will deploy old code.
4. Framework: **Vite**. Root directory: repository root. Build: `npm run build`. Output: `dist`. Node: **24.x**. Use the included `vercel.json`; do not deploy only a copied `dist` folder, since accounts/API need the function too.
5. Add the following server environment variables to the production deployment. Private keys must **not** start with `VITE_`.

| Variable | Value / source |
| --- | --- |
| `RADAR_DATABASE_DRIVER` | `postgres` (required; disposable serverless SQLite is blocked) |
| `SUPABASE_URL` | `https://xtfbdaphayodkkgzwecb.supabase.co` |
| `SUPABASE_PUBLISHABLE_KEY` | Public publishable/anon key from Supabase (the existing project's public key is in `.env.example`) |
| `SUPABASE_DB_URL` | Private session-pooler PostgreSQL URI |
| `SUPABASE_SERVICE_ROLE_KEY` | Private service-role API key |
| `SUPABASE_STORAGE_BUCKET` | `radar-uploads` |
| `RADAR_ADMIN_EMAIL` | Your own confirmed Supabase email |
| `RADAR_PUBLIC_URL` | Your final `https://your-project.vercel.app` origin, without a trailing path |
| `CRON_SECRET` | A long random private secret, only if configuring a scheduler |

Deploy. If Vercel assigns the public hostname only after the first deployment, set `RADAR_PUBLIC_URL` to that hostname and redeploy. Environment changes require a redeployment. Do not give preview branches access to production school data unless intended.

## 3. Finish Auth URLs and school setup

In **Supabase → Authentication → URL Configuration**, set Site URL to the final HTTPS Vercel origin and add the corresponding confirmation/recovery redirect URLs (including `/reset-password`). Redeploy after changing app environment variables.

Register with your administrator Gmail/email, confirm it, and sign in. Select a Camarines Norte school and create its empty workspace. Open **Buildings & rooms → Set your school’s location**: click the actual school on the map, or use GPS while on campus; enter the verification source, confirm the pin, and save. Then add each actual building's own position, floors and rooms. Changing the school center does not move buildings.

Other people use **Create account**, confirm their email, sign in, choose their school and **Request school access**. Administrators approve them under **Campus operations → School members** after checking identity. Roles and records stay school-specific. A request can be saved before a workspace is activated, but an authorized administrator must create the workspace before reviewing its requests.

Open **Campus operations → Setup & launch** to inspect database, location, account recovery, AI, notification and asset prerequisites. “Configured” is not a successful live test.

## 4. Optional AI, push, SMS and real 3D

Set private optional variables from `.env.example` in Vercel and redeploy. Instructions are in [RADAR-2-FEATURES.md](RADAR-2-FEATURES.md).

- AI needs a funded/authorized OpenAI key and explicit inspector consent for actual inspection images. Test with permitted non-sensitive photos; proposals need human review.
- Browser push needs a VAPID pair, HTTPS/PWA support and individual subscriptions. Test on real intended devices. It does not guarantee delivery.
- SMS needs a configured/funded Twilio sender and consented recipients. Configure a signed status callback through `RADAR_PUBLIC_URL`. Accepted/queued SMS is not confirmed device delivery.
- 3D views need real self-contained GLB models; 360 views need actual panoramas. First-person movement requires verified metric spawn coordinates. Optional GLB object-name mappings connect registered rooms and floor groups; upload these under the model’s optional settings. No interiors or emergency telemetry are generated.
- USGS earthquake data can be enabled with `RADAR_USGS_FEED_ENABLED=true`; separate official regional storm/fault/volcano/flood/landslide datasets are not silently substituted.

## 5. Serverless-specific limits and maintenance

API requests and private file paths are routed to `api/index.mjs`. Required cloud settings are checked before application initialization; missing settings return `503 CLOUD_SETUP_REQUIRED`, rather than creating fake/demo school records. All API and upload responses remain private/no-store. HTTPS session cookies use `Secure`.

Vercel limits function request/response payload sizes. Files larger than 3 MB use a school/user-scoped signed direct upload to **private Supabase Storage**, followed by server-side completion/GLB validation. The application limit remains **10 MB**. The private file route checks account/school authorization before issuing a short-lived Storage download redirect on Vercel. A pending direct upload cannot be read through RADAR until validated. Signed URLs/tokens are temporary capabilities; do not share them publicly. Storage objects can still need administrative cleanup after abandoned uploads.

A serverless function cannot run the standalone server's minute interval. Alert/notification requests schedule bounded background maintenance with Vercel `waitUntil`; durable jobs also have an authorized manual process button. For unattended schedules, configure an HTTPS scheduler to call `GET /api/internal/maintenance` with `Authorization: Bearer <CRON_SECRET>`. Each invocation handles the original namespace plus up to three school workspaces and persists a cursor. Repeat at a cadence appropriate to your school count and provider limits. **Vercel Hobby cron limits do not provide a minute-by-minute emergency scheduler.** A daily task is not real-time alert delivery. Review available hosting plans or use an appropriate external scheduler/always-on worker before relying on unattended notification timing.

The repository does not install a paid plan, create provider accounts, send live SMS, or claim live monitoring/restore tests. Configure gateway rate limiting for public multi-instance use (shared database auth throttling is implemented, but gateway protection also limits public traffic before application/database work), supervise failure logs/jobs and rehearse Supabase database **and** Storage restores. Inspect [the feature audit](RADAR-2-FEATURES.md) for remaining advanced capabilities before operational use.

## 6. Verify the actual deployment

1. Open `/api/health` through the deployed HTTPS origin: expect database `postgres` and API version `2.1`.
2. Test fresh Gmail sign-up, email confirmation, login, logout and password recovery. Check cookies remain HttpOnly/Secure.
3. Test a school join request, approval and revocation with separate accounts; verify one school's records do not appear in another school.
4. Save the school location and a real inspection/photo, then reload and redeploy to verify persistence.
5. Test optional providers independently, including a file above 3 MB, actual browser push permission/delivery, signed SMS receipts and scheduler batches. Configured flags do not establish those outcomes.
6. Review Vercel function logs, database backups, Storage privacy and restore procedures. Do not publish secret keys in screenshots, support messages or frontend environment variables.
