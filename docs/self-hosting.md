# Self-hosting

This fork deploys two Cloudflare Workers:

| Worker | Directory | Hostname |
| --- | --- | --- |
| `halo-web` (game files and telemetry) | `services/web` | `halo.mjweaver01.com` |
| `halo-web-signaling` (lobbies and WebRTC signaling) | `services/signaling` | `halo-signal.mjweaver01.com` |

The game must be at the root of its own hostname, because the client sends
telemetry to `/v1/...` paths. No Halo game data is hosted. Each player
supplies their own XISO.

## 1. Put the domain on Cloudflare

Workers custom domains need the zone on Cloudflare DNS. Add `mjweaver01.com`
to Cloudflare and change the nameservers at the registrar to the ones that
Cloudflare gives. Both `routes` entries in the `wrangler.jsonc` files create
their DNS records and certificates during deployment.

## 2. Fill the placeholders

```sh
npx wrangler login
npx wrangler whoami                                  # shows the account ID
cd services/signaling && npx wrangler kv namespace create HALO_ABUSE
```

| Placeholder | File | Value |
| --- | --- | --- |
| `REPLACE_WITH_CLOUDFLARE_ACCOUNT_ID` | `services/signaling/wrangler.jsonc` | Account ID |
| `REPLACE_WITH_HALO_ABUSE_KV_ID` | `services/signaling/wrangler.jsonc` | ID of the new KV namespace |
| `REPLACE_WITH_TURNSTILE_SITE_KEY` | `port/web/shell.html` | Site key of a Turnstile widget for `halo.mjweaver01.com` (Dashboard > Turnstile > Add widget) |

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
