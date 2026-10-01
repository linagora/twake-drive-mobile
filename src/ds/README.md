# `src/ds` — the home-grown design-system components

`AGENTS.md` sets the direction: the app has no real design system yet, and the
target is a home-grown React Native component package carrying the cozy-ui /
twake-mui tokens, moving off `react-native-paper` progressively. This folder is
where that package grows, in place, before it is ever extracted.

## What belongs here

A component qualifies when it is useful to any screen, not to one feature.
What it may depend on:

- `react-native` and `react-native-paper` (the current UI lib — wrapping it is
  how we move off it later without a flag day),
- `@/ui/theme` for `cozyTokens`, and the Paper theme for colours,
- `react-i18next`, for a string the component owns rather than receives.

What it must not depend on:

- `cozy-client`, queries, doctypes, or anything that knows what a file is,
- app routing (`expo-router`), screens, or feature folders,
- the web MUI libraries (`cozy-ui`, `twake-mui`) — they are a token reference
  only and must never be imported in React Native.

Business knowledge stays at the call site and arrives as props. `AccessibleRow`
takes a composed `label`; it does not know how to describe a file.

The point of those rules is that extracting this folder into a package is a
move, not a rewrite.

## Accessibility is part of the contract, not a later pass

Paper's `List.Item` ships no accessibility props at all — no role, no state —
which is why every row in the app was announced as a role-less element
(see issue #407, finding B2). A component here makes the semantics an explicit,
required part of its API rather than something each call site remembers:
`AccessibleRow` cannot be rendered without a `label`.

The app ships in 7 languages, so any string a component here owns goes through
an i18n key filled in all 7 locale files.
