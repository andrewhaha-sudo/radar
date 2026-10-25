# Supabase connection

The application supports two independent storage modes:

- `RADAR_DATABASE_DRIVER=sqlite`: the existing local database, local accounts and files.
- `RADAR_DATABASE_DRIVER=postgres`: Supabase Auth accounts, Supabase PostgreSQL school records, and a private Supabase Storage bucket for uploads.

The interface is the same in both modes. Changing modes does not migrate existing local accounts or data. Keep backups of the SQLite data directory. No local demo accounts, passwords, school records, files, sessions or activity are uploaded automatically. Hosted mode never runs the demonstration seed.

## Configure on your computer

1. Pull the latest `design/radar-command-dashboard` branch, then run `npm ci`.
2. Run `npm run setup:supabase` for an interactive setup with hidden private inputs. Alternatively, copy `.env.example` to `.env` in the project root and fill it in manually. The project URL and public publishable key are already filled in. These are public identifiers, not administrator credentials.
3. Open Supabase **Connect**, choose **Session pooler**, and copy the PostgreSQL URI to `SUPABASE_DB_URL` in `.env`. Insert your database password locally; URL-encode any password characters that have meaning in a URI. Use the session pooler on port 5432, not transaction pooling. TLS certificate checks remain enabled.
4. In Supabase **Project Settings → API Keys**, obtain the legacy server-only `service_role` key (or a server secret key supported by Supabase Storage) and put it in `SUPABASE_SERVICE_ROLE_KEY` in `.env`. Never prefix private variables with `VITE_`, share them in chat, or commit `.env`.
5. Set `RADAR_ADMIN_EMAIL` to the real email address you will register and confirm. Configure this before the first sign-in: only this confirmed email gets the initial administrator profile. Other new accounts receive the student role and cannot create or access another account's school workspaces.
6. In Supabase **Authentication → URL Configuration**, set the Site URL to `http://localhost:5173` for local development, or your deployed app's public URL. Match `RADAR_PUBLIC_URL` in `.env`. Enable Email under Authentication providers and configure email confirmation/delivery as needed.
7. Run `npm run check:supabase` to check Auth, the database connection and Storage credentials without creating records. Then set `RADAR_DATABASE_DRIVER=postgres`, stop the old server with Ctrl+C, and run `npm run dev`. The server creates the application schemas through the database connection; you do not need to paste SQL into the SQL Editor. If initialization fails, fix the reported connection error before using the hosted mode. It does not silently fall back to local storage.
8. On the login page choose **Create an account**, register using your administrator email, confirm the email if required, and sign in. Existing Supabase email/password accounts can sign in directly. Set the administrator email before that account's first RADAR sign-in.
9. Select a Camarines Norte school and create its workspace. Add its real buildings, floors, rooms and records. Verify the new account in Supabase Authentication and records in the private `radar_main` / `radar_school_<BEIS ID>` schemas (choose the schema in the Table Editor).

The bucket named `radar-uploads` is created as private on the first upload. If it already exists and is public, the application rejects it; change it to private in Supabase Storage. The server checks school ownership before returning uploaded files. Files are stored under `schools/<BEIS ID>/` or `original/`, with no public bucket policy.

## Data and access model

Supabase Auth manages registration and password verification. Passwords are never stored in application tables: the application stores only a Supabase Auth user ID and profile metadata. Local authentication remains available only in SQLite mode. Hosted sign-in creates a separate HttpOnly RADAR session persisted in PostgreSQL; Supabase access/refresh tokens are not exposed to browser code.

`radar_main` stores profiles, sessions and school ownership. Each school has its own `radar_school_<BEIS ID>` PostgreSQL schema containing the complete campus model (buildings, floors, rooms, inspections, hazards, alerts, incidents, resources, recovery and audit records). Database ownership is checked on the server. RLS is enabled on application tables, PUBLIC privileges are revoked, and these schemas must remain outside the schemas exposed by the Supabase Data API. Browser clients receive no database connection string or service-role key. The Node server uses the trusted database connection; application authorization remains server-enforced.

Only the workspace creator can open a school workspace in this version; school-member invitations remain a separate feature. A student signup does not grant access to another school's private records. Confirmation and password policies follow your Supabase Authentication settings. Workspace creation is local application setup and does not verify an official school affiliation.

## Verification and limits

The test suite exercises the PostgreSQL queries and school isolation against embedded PostgreSQL (PGlite), in addition to the original SQLite integration tests. Auth request and profile flows are tested against a mock Supabase Auth service. Those tests do not establish connectivity to your actual hosted project, successful real email delivery or live bucket access. Real hosted validation requires the private settings above.

For deployment, set `RADAR_PUBLIC_URL`, Supabase Site URL/redirects and your server environment variables to the deployed values; build with `npm run build` and run `npm start`. Keep private keys exclusively on the Node server. Use Supabase's backup facilities for the hosted database and storage. A filesystem backup of this app does not back up hosted data.
