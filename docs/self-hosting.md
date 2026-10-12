# Self-hosting

This fork deploys two Cloudflare Workers:

| Worker | Directory | Hostname |
| --- | --- | --- |
| `halo-web` (game files and telemetry) | `services/web` | `halo-web.<subdomain>.workers.dev` |
| `halo-web-signaling` (lobbies and WebRTC signaling) | `services/signaling` | `halo-web-signaling.<subdomain>.workers.dev` |

The game must be at the root of its own hostname, because the client sends
telemetry to `/v1/...` paths. No Halo game data is hosted. Each player
supplies their own XISO.

## 1. Get the workers.dev subdomain

Everything runs on free `workers.dev` addresses. No custom domain or DNS
change is necessary. Create a free Cloudflare account, then:

```sh
npx wrangler login
npx wrangler whoami                                  # shows the account ID
```

The dashboard shows the account's `workers.dev` subdomain under
Workers & Pages (the first deployment asks you to choose one if none exists).

## 2. Fill the placeholders

```sh
cd services/signaling && npx wrangler kv namespace create HALO_ABUSE
```

| Placeholder | File | Value |
| --- | --- | --- |
| `REPLACE_WITH_SUBDOMAIN` | `services/signaling/wrangler.jsonc`, `port/web/shell.html`, `tools/halo_telemetry.mjs`, READMEs | The `workers.dev` subdomain |
| `REPLACE_WITH_CLOUDFLARE_ACCOUNT_ID` | `services/signaling/wrangler.jsonc` | Account ID |
| `REPLACE_WITH_HALO_ABUSE_KV_ID` | `services/signaling/wrangler.jsonc` | ID of the new KV namespace |
| `REPLACE_WITH_TURNSTILE_SITE_KEY` | `port/web/shell.html` | Site key of a Turnstile widget for `halo-web.<subdomain>.workers.dev` (Dashboard > Turnstile > Add widget) |

After you edit `wrangler.jsonc`, run `npm run types` in `services/signaling`.

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
