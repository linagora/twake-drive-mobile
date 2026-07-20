# Copilot instructions — twake-drive-mobile

The authoritative agent rules for this repository live in **[`AGENTS.md`](../AGENTS.md)**
at the repo root. Read and follow it.

Key points (see `AGENTS.md` for the full reasoning):

- Generic Twake / Cozy conventions live in the shared repo
  [linagora/twake-guidelines](https://github.com/linagora/twake-guidelines);
  repo-specific architecture decisions live in `AGENTS.md`. On conflict, `AGENTS.md`
  wins for this repo.
- Offline-first: all data access goes through `useQuery` / `client.query` with `Q()`
  — never `client.collection(...)` directly.
- Sync is periodic (no websocket) → apply optimistic updates on mutations.
- New shared UI borrows palette/tokens from cozy-ui / twake-mui.
- Never ask a user for a password inside a webview.
- Check twake-drive (web) for prior art before deciding on any stack interaction.
- Do not run `expo prebuild` — native `ios/` and `android/` are hand-maintained.
- Commits follow Conventional Commits.
