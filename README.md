# BlueTap Receptionist — Reliability Layer

AI voice receptionist for BlueTap Plumbing & Drain (Retell agent → Cloudflare Worker → Google Calendar + Sheets + Twilio + Smarty). The Worker is a backstage **verification layer**: the bot keeps the call smooth, and correctness (address validation, confirmation SMS, flagging) happens asynchronously so call latency is unaffected.

## Layout
- `worker/src/index.js` — the Worker: booking state machine (pending → hard/soft-confirmed | flagged), Smarty address validation, Twilio confirm/reminder SMS, Google Calendar + Sheets queue, cron sweeper.
- `worker/wrangler.toml` — Worker config. Secrets are set with `wrangler secret put` (never committed): `GOOGLE_SERVICE_ACCOUNT`, `TWILIO_SID`, `TWILIO_AUTH_TOKEN`, `SMARTY_AUTH_ID`, `SMARTY_AUTH_TOKEN`, `TOOL_SECRET`.
- `deploy_retell_v15.js` — pushes the prompt + tools to the Retell LLM and patches agent turn-taking. Reads `RETELL_API_KEY` and `TOOL_SECRET` from env.
- `vapi_live_prompt_v15.txt` — the live agent prompt.

## Deploy
```
cd worker && npx wrangler deploy                          # Worker
RETELL_API_KEY=... TOOL_SECRET=... node deploy_retell_v15.js   # prompt/tools
```
After a Retell push, publish the agent and re-pin the phone number to the new published version.

## Secrets
No credentials live in this repo. All keys come from Worker secrets / environment variables. Do not commit `.env`, service-account JSON, or the legacy `get_google_token.js` / `patch_worker_url.js` helpers.
