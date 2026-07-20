# Agent rules — twake-drive-mobile

Instructions for any AI coding agent (Claude Code, Cursor, Copilot, Codex, Gemini,
opencode…) working in this repository. Read this before writing code.

This file is the **single source of truth**. The per-agent files (`CLAUDE.md`,
`.github/copilot-instructions.md`, `.cursor/rules/twake.mdc`, `GEMINI.md`) only point
back here — do not duplicate content into them.

## Two levels of rules

1. **Generic Twake / Cozy conventions** (git, React, JavaScript/TypeScript, testing,
   cozy-client) live in the shared repo **[linagora/twake-guidelines](https://github.com/linagora/twake-guidelines)**.
   - **Claude Code:** install the plugin — `/plugin install twake-guidelines@twake-guidelines`.
     Skills auto-trigger per context; do not paste the central `AGENTS.md` by hand.
   - **Other agents:** read the central `AGENTS.md` in that repo.
2. **This repo's own architecture decisions** are below. When a repo-specific decision
   here conflicts with a generic convention, **this file wins for this repo**.

For setup, commands, and project structure, see **[README.md](README.md)** — do not
duplicate it here.

## Architecture decisions specific to this app

### Offline-first is the reason for the cozy-client stack

The app must work **offline**. That is why it is built on `cozy-client` +
`cozy-pouch-link` (and friends): they own the local persistence and replication, so
queries keep working with no network. Consequences:

- **Never bypass the query layer.** All reads go through `client.query()` /
  `useQuery()` with `Q(...)`. Hitting `client.collection(...)` directly bypasses the
  PouchDB pipeline and silently breaks offline (see the central cozy-client rules).
- Anything that must survive offline has to flow through this stack — don't reach for
  ad-hoc fetch/storage.

### Sync is periodic, not real-time — so we do optimistic updates

There is **no realtime/websocket** wiring. Data freshness comes from a **periodic
sync** on the Pouch/Couch replication. Because the server round-trip is not
immediate, the UI applies **optimistic updates**: reflect the change locally right
away, let the sync reconcile. When you add a mutation, update the local cache
optimistically rather than waiting on the network.

### Design system: none yet — grow it from cozy-ui / twake-mui

There is **no real design system** for the React Native app yet; we build one
progressively. Any new shared UI (palette, tokens, components) must **draw from
`cozy-ui` and `twake-mui`** (palette, spacing, naming) so mobile stays visually
coherent with the web products. Don't invent a parallel visual language — mirror the
existing one and factor reusable pieces as the system emerges.

### Native code is duplicated iOS/Android on purpose (for now)

The Android (SAF / `DocumentsProvider`) and iOS (File Provider / Share extensions)
native layers are currently **duplicated by choice**, not by accident. The plan is to
eventually **mutualise the "stack" layer in Rust** (shared contract logic), while the
platform integration stays native. Until then: keep the two sides in sync when you
touch stack-contract logic, and don't prematurely abstract — but don't let them
diverge in behavior either.

- The `android/` and `ios/` projects are committed and hand-maintained. **Do not run
  `expo prebuild`** — it overwrites the manual native config (see README).

### Always check twake-drive (web) before deciding

This app is a client of the same Twake Drive (Cozy) stack as the web app. Before
making a data/API/behavior decision, **look at how [twake-drive](https://github.com/linagora/twake-drive)
(the web version) does it** and mirror its approach. Don't reinvent a stack
interaction or drop to a lower layer than the web client uses.

### Never ask for a password inside a webview

We **never** prompt a user to type their password in a webview. Authentication goes
through the proper native/OAuth flow — a webview asking for credentials is a
phishing-shaped anti-pattern and is not acceptable here.

## Quick checklist before you open a PR

- Reads/writes go through `useQuery` / `client.query` with `Q()` — no direct
  collection access.
- Mutations update the cache optimistically.
- New UI borrows tokens/patterns from cozy-ui / twake-mui.
- No password entry in a webview.
- Checked twake-drive (web) for prior art on any stack interaction.
- `npm test`, `npm run typecheck`, `npm run lint` are green.
- Commits follow Conventional Commits (enforced locally by lefthook + in CI).
