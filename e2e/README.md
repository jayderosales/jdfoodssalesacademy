# End-to-end tests (Playwright)

These drive the real app in a browser against a real Supabase project. **Use a separate test project**, not production: `phase-1a.spec.ts` creates and deletes users.

## Run locally

```bash
npx playwright install chromium          # once
# .env.local must point at the TEST Supabase project and include SUPABASE_SERVICE_ROLE_KEY
npm run test:e2e
```

Playwright builds the app and starts it on port 3100. To test an already-running app (e.g. a Vercel preview), set `E2E_BASE_URL`.

## In CI

The `e2e` job in `.github/workflows/ci.yml` runs on pushes to `main` and on pull requests labelled `e2e`. Add these repository secrets (GitHub → Settings → Secrets and variables → Actions): `E2E_SUPABASE_URL`, `E2E_SUPABASE_ANON_KEY`, `E2E_SUPABASE_SERVICE_ROLE_KEY`.

## What's covered

| Spec | Flow |
|---|---|
| `smoke.spec.ts` | Sign-in page loads (desktop + phone); signed-out visitors are sent to sign-in |
| `phase-1a.spec.ts` | Admin signs in → sets up two-step sign-in → adds a staff user with a role → user signs in, sets up two-step sign-in, accepts the privacy notice, sees only their pages → audit log shows the role grant; sign-in history recorded |

Without Supabase credentials, `phase-1a.spec.ts` is skipped.
