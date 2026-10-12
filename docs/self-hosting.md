# Self-hosting

This fork deploys to Cloudflare:

| Project | Directory | URL |
| --- | --- | --- |
| Pages project `halo-web-mjweaver01` (game files; `src/index.js` runs as `_worker.js` for telemetry) | `services/web` | https://halo.mjweaver01.com |
| Worker `halo-web-signaling` (lobbies and WebRTC signaling) | `services/signaling` | https://halo-web-signaling.mjweaver01.workers.dev |

The DNS of `mjweaver01.com` stays at GoDaddy. A Pages project, unlike a
Worker, accepts a custom subdomain from another DNS provider, so GoDaddy has
one record: `CNAME halo -> halo-web-mjweaver01.pages.dev`. The custom domain
is attached in the Pages project (Custom domains).

The game must be at the root of its own hostname, because the client sends
telemetry to `/v1/...` paths. No Halo game data is hosted. Each player
supplies their own XISO.

## 1. Cloudflare resources

These already exist in the Cloudflare account and are set in the repository:

| Resource | Value | Where it is used |
| --- | --- | --- |
| Account ID | `4303a98c4737bbefefd029227c5e1b7b` | `services/signaling/wrangler.jsonc` |
| `workers.dev` subdomain | `mjweaver01` | Signaling hostname in `port/web/shell.html` and `tools/halo_telemetry.mjs` |
| KV namespace `HALO_ABUSE` | `b4729df09aed488ea0515d28f62815ae` | `services/signaling/wrangler.jsonc` |
| Turnstile widget `halo-web` | site key `0x4AAAAAAFUx_dZRGjdOL3lX`; domains `halo.mjweaver01.com` and `halo-web-mjweaver01.pages.dev` | `port/web/shell.html` |
| Analytics Engine | enabled in the dashboard (Workers > Analytics Engine) | Both projects |

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

The menu images in `port/web/assets/ui/` are Halo artwork, so they are not
in Git. Each deployment serves them, so they can be taken from the live site:

```sh
python3 tools/web_fetch_ui_assets.py
```

The script tries this site's addresses, then `mitchellhynes.com/halo`, and fails if any image is missing. To use a
different source, give `--source URL` (repeat it for fallbacks).

Install Ninja and the Emscripten SDK (6.0.12) into `build/emsdk`. Then, from
the repository root:

```sh
source build/emsdk/emsdk_env.sh
python3 configure.py --release
ninja web
cd services/web
npm ci
npm run deploy
```

## 5. Continuous deployment

Both deployments run in GitHub Actions with the repository secrets
`CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID`:

| Workflow | Runs when | Does |
| --- | --- | --- |
| `deploy.yml` | A push to `main` changes `services/signaling` | Tests and deploys the signaling Worker |
| `deploy-web.yml` | Any other push to `main` that is not only documentation | Downloads the UI images from the live site, builds the game and deploys the Pages project |

The API token needs these account permissions: Cloudflare Pages (Edit), Workers Scripts (Edit),
Workers KV Storage (Edit) and Account Settings
(Read), plus the user permissions Memberships (Read) and User Details (Read).

## Pull changes from upstream

```sh
git fetch upstream
git merge upstream/main
```

Conflicts can occur in `wrangler.jsonc`, `port/web/shell.html` and the
shell test. Keep this fork's hostnames, keys and credits.
