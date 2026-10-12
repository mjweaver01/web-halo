# Self-hosting

This fork deploys two Cloudflare Workers:

| Worker | Directory | URL |
| --- | --- | --- |
| `halo-web` (game files and telemetry) | `services/web` | https://halo-web.mjweaver01.workers.dev |
| `halo-web-signaling` (lobbies and WebRTC signaling) | `services/signaling` | https://halo-web-signaling.mjweaver01.workers.dev |

The game must be at the root of its own hostname, because the client sends
telemetry to `/v1/...` paths. No Halo game data is hosted. Each player
supplies their own XISO.

## 1. Cloudflare resources

These already exist in the Cloudflare account and are set in the repository:

| Resource | Value | Where it is used |
| --- | --- | --- |
| Account ID | `4303a98c4737bbefefd029227c5e1b7b` | `services/signaling/wrangler.jsonc` |
| `workers.dev` subdomain | `mjweaver01` | Hostnames in `wrangler.jsonc`, `port/web/shell.html`, `tools/halo_telemetry.mjs` |
| KV namespace `HALO_ABUSE` | `b4729df09aed488ea0515d28f62815ae` | `services/signaling/wrangler.jsonc` |
| Turnstile widget `halo-web` | site key `0x4AAAAAAFUx_dZRGjdOL3lX` | `port/web/shell.html` |
| Analytics Engine | enabled in the dashboard (Workers > Analytics Engine) | Both Workers |

To deploy from a different account, change these values, then run
`npm run types` in `services/signaling`. Create the KV namespace with
`npx wrangler kv namespace create HALO_ABUSE`.

## 2. Log in

```sh
npx wrangler login
```

## 3. Deploy signaling

```sh
cd services/signaling
npm ci
openssl rand -hex 32 | npx wrangler secret put ROOM_ID_SECRET
openssl rand -hex 32 | npx wrangler secret put ABUSE_ID_SECRET
openssl rand -hex 32 | npx wrangler secret put ADMIN_TOKEN   # keep a copy for tools/halo_telemetry.mjs
npx wrangler secret put TURNSTILE_SECRET                      # the Turnstile widget's secret key
# Optional TURN relay for strict NATs:
npx wrangler secret put TURN_KEY_ID
npx wrangler secret put TURN_KEY_SECRET
npx wrangler secret put CLOUDFLARE_ANALYTICS_TOKEN            # Account Analytics Read; for TURN caps
npm run check
npm run deploy
```

## 4. Build and deploy the game

Install Ninja and the Emscripten SDK. Then, from the repository root:

```sh
python3 configure.py --release
ninja web
cd services/web
npm ci
npm run deploy
```

## 5. Continuous deployment (optional)

`.github/workflows/deploy.yml` deploys signaling on pushes to `main` that
change `services/signaling`. Add the repository secrets `CLOUDFLARE_API_TOKEN`
(Edit Cloudflare Workers permission) and `CLOUDFLARE_ACCOUNT_ID`. Until then,
that workflow fails.

## Pull changes from upstream

```sh
git fetch upstream
git merge upstream/main
```

Conflicts can occur in `wrangler.jsonc`, `port/web/shell.html` and the
shell test. Keep this fork's hostnames, keys and credits.
