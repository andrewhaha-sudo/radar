# Welcome, feature tour and school restoration

RADAR now remembers the last authorized school on the account, instead of only on the session that disappears at logout. Signing back in restores that school's dashboard, map location, buildings and published close-up view, with the role assigned by that school. Logging out does not delete school records.

An explicitly chosen original account workspace also stays selected. A remembered school is checked against current ownership/membership before restoration; revoked memberships do not reopen private school records. When no choice has been saved and exactly one school is available, that school opens automatically. The directory's return action now returns to the connected school instead of switching back to the original database.

Approved students, parents, teachers, inspectors, responders and administrators do not need approval again after signing in. **New school memberships still require one approval by an authorized school administrator.** A public signup role does not grant access to another school's private records. Administrators can manage school roles through the existing member tools.

## New opening experience

Before sign-in, a short RADAR logo sequence traces the shield, reveals radar rings and a sweep, then brings in the wordmark. It plays once per browser tab session and automatically continues in about three seconds. **Skip intro** works immediately. Use **Replay logo animation** on the welcome screen or **Replay opening animation** on the login form to watch again. Reduced-motion users see a static logo with a shorter transition. The opening is a brand animation, not a claim that network work has completed.

After the logo, an animated welcome screen introduces RADAR with a three-slide earthquake, typhoon and flood preparedness carousel. Use **Open RADAR** or **Skip to sign in** to proceed immediately. The illustrations have previous/next controls, slide selectors and a pause button. Reduced-motion preferences disable decorative motion and start the slideshow paused. **Replay opening animation** is available on the login form.

The scenes are generated, fictional illustrations of school damage, visibly labeled as such. They are not photographs, documented incidents or evidence about a real school. The optimized artwork is served locally from `public/assets/welcome-preparedness.webp`.

After signing in, **Let's get started** explains the dashboard, campus views, inspection workflow, Photo Route Studio, tool shortcuts and school access. The content respects role permissions. Dismiss or complete it once per account and tour version on that browser; completion is browser-local, so a new device can show it again. Replay it from **Account menu → What's new & getting started**. No tutorial completion grants extra permissions.

Panel entrances are staggered as they enter the viewport, including panels loaded by switching routes or operation tabs. Compact cards lift slightly; campus viewers fade without a transform. Buttons have restrained press feedback, menu openings ease in, and shared cards respect reduced-motion preferences. Panels remain visible if motion is unsupported; no animation changes permissions, starts network tasks or moves map controls.

## Logo motion preview

![RADAR shield animation, recorded in the local training app](previews/radar-logo-opening.gif)

The reference video informed the pacing of the reveal; RADAR uses its own shield, radar sweep, colors and wordmark. No reference logo or video asset is shipped in the app.

## Previews

[Mobile welcome](previews/welcome-mobile.png) · [Getting-started tour](previews/getting-started-tour.png). Screenshots use the disposable training environment; its training banner is not part of the production welcome screen.

## Verification

- 78 automated tests pass, including school restoration, all six school roles, explicit original-workspace selection and revoked membership handling.
- 34 feature integration tests pass with the PostgreSQL-compatible test adapter.
- Production build passes. Lint completes with existing repository warnings.
- Chromium checks cover the welcome controls, real WebP response, reduced motion, first-run tour and replay, and actual UI logout/login for all six approved school roles. School selection and the published close-up view remain visible. Layouts were checked at 360, 390, 768, 1024 and 1440 pixels, without horizontal overflow or browser exceptions.
- Additional Chromium checks cover the traced shield, automatic continuation, keyboard-accessible Skip, both replay paths, 390px launch, static reduced-motion logo, panel entrances across dashboard and operation tabs, unchanged map transforms and no browser exceptions.
- This does not claim a live hosted Supabase acceptance test or Vercel deployment.

## Updating an existing installation

Stop the old server with Ctrl+C. In the RADAR repository:

```sh
git pull origin design/radar-command-dashboard
npm ci
npm run dev
```

Open the URL printed by the development server. Existing data stays in place; startup adds the account preference columns automatically. For a hosted installation, rebuild and redeploy with its existing durable database configuration. Do not delete or reseed the database to refresh the interface.
