# CHOMP Website — Chat Handoff

Use this document as context when continuing the CHOMP website in a new chat.

## Project and live links

- Local project: `C:\Users\arshb\Desktop\Chomp`
- GitHub repository: https://github.com/Arshbrar07/Chomp
- Main branch: `main`
- Live website: https://chomp-z69.pages.dev
- Cloudflare Pages project: `chomp`
- Current source commit at handoff: `b9dd8ee`

## Public files that make up the deployed website

- `index.html` — the entire public website, styles, animations, and browser JavaScript.
- `_worker.js` — Cloudflare Pages Worker that serves assets and proxies/caches the live-data API.
- `favicon.svg` — CHOMP browser-tab icon.

Only these three files should normally be included in a manual Cloudflare Pages deployment. There are older experimental backend/mock files and temporary upload folders in the local workspace; they are untracked and must not be deployed or deleted without the user's permission.

## Current public links

- Every **Feed Chomp** button: https://t.me/HungryChompBot
- Other Telegram/community buttons: https://t.me/Chomponsol
- X account: https://x.com/Chomp_0n_Sol
- Pump.fun buttons currently use the generic URL: https://pump.fun/

The old Shrink bot URL must not be restored to Feed Chomp buttons.

## Token and on-chain data

- Token mint / CA: `BXRtLzupLSdS4KNLLEwondWiprU7KS7wVqLNAVqppump`
- Burn signer: `9XpUpv1yo2n1DWoQoKWr3Wx3RpihbgBku9vvZ39dm4at`
- Public same-origin endpoints used by the page:
  - `/api/supply`
  - `/api/holders`
  - `/api/cycles`
- The cycles response includes the burn history and total burned amount.
- Helius is called only by the private Cloudflare Worker. The API key is stored as the Cloudflare secret `HELIUS_API_KEY`; never put it in the HTML, repository, logs, or chat output.

## Cloudflare architecture and API optimization

The Pages Worker has a private service binding named `SHRINK_API` connected to the existing Cloudflare Worker service `shrink`. `_worker.js` forwards the three allowed API paths through that binding and serves everything else from `env.ASSETS`.

Caching currently works at two layers:

- Pages edge proxy: supply and cycles for 5 minutes; holders for 30 minutes.
- The private `shrink` Worker also has its own Cache API layer.
- Browser data refresh happens every 5 minutes and only while the tab is visible.
- Returning to a visible tab triggers a refresh.
- The API key therefore remains private and normal page traffic should mostly receive cached responses.

Do not remove these caching protections without a specific reason.

## Current website behavior

- Dark CHOMP landing page with inline branding and responsive layout.
- Browser favicon uses the CHOMP logo.
- The live-data section displays:
  - supply remaining
  - holder count
  - cycles executed
  - total burned
  - confirmed burn log with Solscan transaction links
- The burn log shows about five rows at once and scrolls internally for older entries.
- The lower CTA section contains a feeding-lane animation:
  - the complete original two-eye/full-teeth CHOMP logo is rotated sideways
  - it walks from left to right
  - supply markers `1B`, `1M`, `1`, `0.1`, and `0.01` disappear as its mouth reaches them
  - the timing was manually synchronized to account for the mascot's off-screen starting position
  - reduced-motion users receive a non-moving version
- The earlier mock app code is still present inside `index.html`, but public Feed Chomp links go directly to Telegram rather than opening that mock UI.

## Recent design decisions

- Button text was changed from **Launch App** to **Feed Chomp**.
- Feed Chomp now opens `@HungryChompBot`.
- The animated mascot must use the full established CHOMP logo. Do not replace it with the earlier one-eye simplified profile.
- The mascot's mouth must face the supply while walking.
- Supply markers should disappear at the moment the mascot overlaps them, not after it passes.
- Ordinary Telegram links remain separate from the bot link.

## Validation before publishing

1. Check the last inline `<script>` in `index.html` with Node's `--check`.
2. Check `_worker.js` with Node's `--check`.
3. Run `git diff --check`.
4. Confirm Feed Chomp, Telegram, and X links have not been mixed up.
5. Confirm no secret value is present in tracked files.
6. Commit and push only the intended tracked files.
7. Deploy `index.html`, `_worker.js`, and `favicon.svg` to the Cloudflare Pages project `chomp` on branch `main`.
8. Verify the exact deployment URL before relying on the main alias, which can take a short time to propagate.

## Wrangler runtime note

The installed Wrangler version requires the bundled Node 24 executable:

`C:\Users\arshb\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe`

Wrangler entry point:

`.\node_modules\wrangler\bin\wrangler.js`

Typical deployment shape:

`<Node 24 path> .\node_modules\wrangler\bin\wrangler.js pages deploy <staging-folder> --project-name chomp --branch main --commit-dirty=true`

Use a small staging folder containing only the three public deployment files.

## Git and workspace caution

At handoff, several old experimental files and `.cloudflare-upload-*` directories are untracked. They were deliberately not pushed. Preserve them unless the user explicitly asks to clean them up. Never use destructive Git commands or broad recursive deletion in this workspace.

## Suggested first action in a new chat

Ask the new assistant to read this file, inspect `index.html`, `_worker.js`, and `favicon.svg`, then continue from the live site and current `main` branch without rebuilding the project from scratch.
