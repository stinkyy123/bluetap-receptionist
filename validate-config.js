#!/usr/bin/env node
// validate-config.js — sanity-check a client config BEFORE rendering/deploying.
//   node validate-config.js <client>
//
// Catches the config-logic traps that the code cannot: keyword collisions that make a
// service unbookable or over-flag cheap jobs. These are business decisions, so findings
// are surfaced (not auto-fixed). Exits 1 if any HIGH finding — the build-agent must raise
// them at the config gate.
//
// Dependency-free on purpose (no npm install in a fresh clone).
const fs = require('fs');
const path = require('path');

const client = process.argv[2];
if (!client) { console.error('usage: node validate-config.js <client>'); process.exit(1); }
const root = __dirname;
const cfg = JSON.parse(fs.readFileSync(path.join(root, 'clients', client, 'config.json'), 'utf8'));
const schema = JSON.parse(fs.readFileSync(path.join(root, 'schema', 'client-config.schema.json'), 'utf8'));

const HIGH = [], WARN = [], INFO = [];
// A "high ticket" keyword is over-flagging only if EVERY variant of that job is cheap.
// Judge on the item's MAX price, and ignore "+$N" add-on surcharges (they're not the job
// price). Without this, bluetap's deliberate "water heater" flag ($249 repair, but a
// $1,399 replace) reads as a false positive.
const HIGH_TICKET_FLOOR = 300;

// ---------- 1. schema shape (required keys, dependency-free) ----------
for (const k of schema.required) if (!(k in cfg)) HIGH.push(`missing required field: ${k}`);
for (const k of Object.keys(cfg)) if (!(k in schema.properties)) WARN.push(`unknown field (not in schema): ${k}`);
if (cfg.prompt) for (const k of schema.properties.prompt.required) if (!(k in cfg.prompt)) HIGH.push(`missing prompt.${k}`);
if (cfg.schedule) for (const k of schema.properties.schedule.required) if (!(k in cfg.schedule)) HIGH.push(`missing schedule.${k}`);

// ---------- 2. un-provisioned placeholders ----------
const todos = Object.entries(cfg).filter(([, v]) => typeof v === 'string' && /TODO/i.test(v)).map(([k]) => k);
if (todos.length) INFO.push(`un-provisioned (fine pre-provisioning, blocks deploy): ${todos.join(', ')}`);

// ---------- 3. keyword collisions (the real point of this script) ----------
const lc = s => String(s || '').toLowerCase();
const emergency = (cfg.emergencyKeywords || []).map(lc);
const highTicket = (cfg.highTicketKeywords || []).map(lc);
const serviceExamples = lc(cfg.serviceExamples);
const pricingItems = lc(cfg.prompt && cfg.prompt.pricingLine).split('·').map(s => s.trim()).filter(Boolean);

// 3a. emergency keyword that also names a normal service => that service can NEVER be booked.
// The worker scans emergencyKeywords against service/notes/requestedText and returns before
// any calendar path (BUILD-NOTES: the 2PM-booked incident).
for (const kw of emergency) {
  if (kw && serviceExamples.includes(kw)) {
    HIGH.push(`"${kw}" is BOTH an emergencyKeyword and in serviceExamples — the agent invites callers to say it, but the worker's guardrail will reroute every such call to emergency-callback. That service can never be booked. Intentional?`);
  }
  const hit = pricingItems.find(it => it.includes(kw) && kw);
  if (hit) {
    HIGH.push(`"${kw}" is an emergencyKeyword but also appears in a priced service ("${hit}") — those jobs can never be booked (auto-rerouted to emergency).`);
  }
}

// 3b. high-ticket keyword matching a CHEAP job => over-flagging (the BUILD-NOTES "$199 faucet" footgun).
for (const kw of highTicket) {
  for (const it of pricingItems) {
    if (!kw || !it.includes(kw)) continue;
    const base = it.replace(/\+\s*\$[\d,]+/g, '');            // drop "+$149 expansion tank" surcharges
    const prices = (base.match(/\$[\d,]+/g) || []).map(p => Number(p.replace(/[$,]/g, '')));
    const max = prices.length ? Math.max(...prices) : null;   // cheap only if even the dearest variant is cheap
    if (max !== null && max < HIGH_TICKET_FLOOR) {
      WARN.push(`highTicketKeyword "${kw}" matches a job that is cheap in every variant ("${it}", top price $${max}) — every one gets high_ticket_review-flagged for a human. This is the documented "$199 faucet swap" footgun; narrow the keyword.`);
    }
  }
}

// 3c. substring traps — the worker substring-matches, so short keywords misfire.
for (const kw of emergency) {
  if (kw && kw.replace(/\s/g, '').length <= 4) {
    WARN.push(`emergencyKeyword "${kw}" is very short — the worker substring-matches, so it can fire inside unrelated words (e.g. "no ac" matches "no access"). Consider a longer phrase.`);
  }
}

// ---------- report ----------
const line = s => console.log('  ' + s);
console.log(`\nconfig sanity-check: ${client}`);
if (HIGH.length) { console.log('\nHIGH (decide before building):'); HIGH.forEach(line); }
if (WARN.length) { console.log('\nWARN:'); WARN.forEach(line); }
if (INFO.length) { console.log('\nINFO:'); INFO.forEach(line); }
if (!HIGH.length && !WARN.length) console.log('  no collisions found ✅');
console.log('');
process.exit(HIGH.length ? 1 : 0);
