# Accounts and keys to set up

Put every key in `.env.local` (local) and in Vercel → Project → Settings → Environment Variables (preview + production). Never paste keys into chat, docs or commits. Variable names are in `.env.example`.

| # | Account | Status | What to do | Env vars |
|---|---|---|---|---|
| 1 | **GitHub repo** | Exists: `jayderosales/jdfoodssalesacademy` | Keep it, or rename it to e.g. `jdfoods-os` (GitHub redirects the old URL). Turn on branch protection for `main` once CI exists (Phase 1a). | — |
| 2 | **Supabase project (Singapore)** | Exists (live project linked to the Academy) | Confirm the region is Southeast Asia (Singapore). Upgrade to **Pro** before go-live (daily backups, point-in-time recovery option, no pausing). Enable the **pg_cron** and **pg_net** extensions (Database → Extensions). Create an access token (Account → Access Tokens) for CI. | `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_PROJECT_REF`, `SUPABASE_DB_PASSWORD`, `SUPABASE_ACCESS_TOKEN` |
| 3 | **Vercel project** | To create | Import the GitHub repo, framework Next.js, region **sin1 (Singapore)**. Add env vars. Plan: Pro is needed for commercial use and for cron frequency beyond daily. | `NEXT_PUBLIC_SITE_URL`, `CRON_SECRET` |
| 4 | **Resend** | To create | Add and verify the `jdfoods.ph` domain (DNS records: SPF, DKIM, and a DMARC record). Create an API key with send access. Then set Supabase Auth → SMTP to use Resend so invite/magic-link emails come from your domain. | `RESEND_API_KEY`, `EMAIL_FROM`, `EMAIL_REPLY_TO` |
| 5 | **PayMongo** | To create | Sign up; use **test keys** only until Phase 7 go-live. Create a webhook (URL given in Phase 7) for payment events and copy its signing secret. | `NEXT_PUBLIC_PAYMONGO_PUBLIC_KEY`, `PAYMONGO_SECRET_KEY`, `PAYMONGO_WEBHOOK_SECRET` |
| 6 | **Shopify custom app** | To create (needed in Phase 3b) | Shopify admin → Settings → Apps and sales channels → Develop apps → Create app. Admin API scopes: `read_products`, `read_inventory`, `write_inventory`, `read_locations`, `read_orders`, `read_all_orders` (to import order history beyond 60 days; requires a request to Shopify), `read_customers`, `read_fulfillments`, `write_fulfillments`, `read_merchant_managed_fulfillment_orders`, `write_merchant_managed_fulfillment_orders`, `read_returns`. Install the app, copy the Admin API access token (shown once) and the API secret key. | `SHOPIFY_STORE_DOMAIN`, `SHOPIFY_ADMIN_API_ACCESS_TOKEN`, `SHOPIFY_API_VERSION`, `SHOPIFY_WEBHOOK_SECRET`, `SHOPIFY_LOCATION_ID` |
| 7 | **Anthropic API key** | Exists (Academy uses it) | Create a separate key per environment (dev / production) so usage can be told apart, and set a monthly spend limit in the Anthropic console. | `ANTHROPIC_API_KEY`, `AI_MODEL_*` |
| 8 | Marketplace partner/API access (Shopee, Lazada, TikTok Shop) | Optional, apply now | Apply for open-platform/partner access; approval takes time. Until then we use CSV/Excel exports. | (added when approved) |

Not needed yet: maps API (Phase 10, Claude will ask before adding a paid key), e-signature provider (Phase 11c), SMS provider (optional, Phase 10).
