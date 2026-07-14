# receptionist-template

A **config-driven template** for the MakeMyWorkflow AI phone receptionist. One proven,
battle-tested build (originally "BlueTap") turned into infrastructure: a new client is a
`config.json` + a render step, not a hand rebuild.

> **⚠️ Reference implementation — parameterize, don't refactor.** The worker
> (`worker/src/index.template.js`) carries bug fixes whose incident histories live in
> [`BUILD-NOTES.md`](BUILD-NOTES.md). Change **client values only**. Any change to the
> worker's logic (state machine, address handling, SMS routing, deploy dance) needs a
> deliberate decision — read BUILD-NOTES first.

## Layout
```
prompt.template.txt           # the agent prompt, business-specifics as @@tokens@@
worker/src/index.template.js  # the worker; ONLY the BUSINESS block is tokenized
worker/wrangler.template.toml # worker name + SHEETS_ID tokenized
deploy_retell.js              # pushes a client's rendered prompt+tools to Retell (reads config)
render.js                     # config -> rendered prompt + worker + wrangler
schema/client-config.schema.json
clients/<client>/config.json  # per-client values (bluetap is the committed reference)
clients/<client>/dist/        # render output (gitignored)
BUILD-NOTES.md                # the tribal knowledge — READ THIS before touching the worker
```

## Render a client
```bash
node render.js bluetap
# writes clients/bluetap/dist/{prompt.txt, worker/src/index.js, worker/wrangler.toml}
```
`render.js` is pure value-substitution over the `*.template` files. It fails loudly if any
`@@token@@` is left unfilled.

**Zero-drift guarantee (bluetap):** rendering bluetap reproduces the live prompt
**byte-for-byte**, and the worker `BUSINESS` block **value-for-value** (the two long keyword
arrays render single-line vs. the original's hand-wrapped multi-line — cosmetic only).

## Deploy (per BUILD-NOTES §2 — the publish + re-pin dance is mandatory)
```bash
cd clients/<client>/dist/worker && npx wrangler deploy        # 1. worker first (CLOUDFLARE_API_TOKEN = cfut_ token)
cd -
RETELL_API_KEY=… TOOL_SECRET=… node deploy_retell.js <client> # 2. push prompt+tools to the LLM
# 3. publish the agent, then 4. RE-PIN the phone number to the published version (BUILD-NOTES §2a)
```
Skipping the re-pin ships to a draft nobody calls. Read BUILD-NOTES §2 in full.

## Add a new client
1. Copy `clients/bluetap/config.json` → `clients/<client>/config.json`; fill in their values
   (validate against `schema/client-config.schema.json`).
2. Stand up the client-owned accounts (Retell, Twilio + A2P 10DLC, Google Calendar/Sheets) —
   these are human/provisioning steps; put the resulting IDs in the config.
3. `node render.js <client>` → review the dist → deploy (above) → run the QA scenarios.

Real client configs are **gitignored** (they contain client PII) — only the bluetap reference
and the schema are committed. This repo is public: **never commit secrets** (BUILD-NOTES §8;
secrets are set on the worker via `wrangler secret put`).

Driven end-to-end by the `build-agent` in the
[agentic-workflow](https://github.com/stinkyy123/agentic-workflow) repo.
