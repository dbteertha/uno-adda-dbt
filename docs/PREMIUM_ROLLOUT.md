# DBT Games Premium Rollout

Production baseline: Phase 3 (`main`).
Development branch: `staging-premium`.
Staging service: `addawithdbt-staging`.

## Non-negotiable release rule

No premium wave is promoted to `main` unless the staging build passes the critical gameplay smoke gate. Optional modules must fail closed: a broken premium module may disappear, but it must never break the launcher, Classic/Flex room flow, socket connection, or card state.

## Feature flags

The safe runtime owns optional feature flags. Stable Phase 1-3 modules are enabled; later systems start disabled until individually rebuilt and tested.

- `premiumCore`: on
- `gameFeel`: on
- `effects`: on
- `analytics`: on
- `cinematic`: on in Classic
- `fun`: on in Classic
- `commentary`: on in Classic
- `admin`: only when `?edit=1`
- `audio`: off until Phase 4A validation
- `voice`: off until Phase 4B validation
- `social`: off until Phase 5 validation
- `progression`: off until Phase 6 validation
- `advanced`: off until later-wave validation

## Critical smoke gate

Every candidate release must preserve all of the following:

1. Home renders and `PLAY UNO` exists and responds.
2. Name/intro/menu flow completes.
3. Classic bot room can be created and starts.
4. Classic multiplayer room can create/join/ready/start.
5. Flex mode opens.
6. Flex bot room starts.
7. Flex multiplayer room can create/join/ready/start.
8. Draw/play/pass/UNO/rematch remain functional.
9. Reload/reconnect does not corrupt the room.
10. Optional-module failure does not stop any item above.
11. TypeScript build passes.
12. Render staging deploy is live without startup errors.

## Rollout waves

### Wave 1 — stability hardening
Safe module loader, runtime error capture, critical-DOM checks, feature flags, isolated staging service.

### Wave 2 — Phase 4A adaptive audio
Reintroduce audio only. Validate muted browser start, sound toggle, match-state intensity and zero gameplay dependency.

### Wave 3 — Phase 4B voice chat
Reintroduce voice behind its own flag. Game socket and game state remain independent. Voice failure must degrade to silent gameplay.

### Wave 4 — social intelligence
Rivalry, revenge, comeback, streaks, action history and commentary as read-only observers.

### Wave 5 — results and progression
Winner story, stats, achievements, streak records, profiles and rematch presentation.

### Wave 6 — cosmetics and personalization
Card backs, table skins, nameplates, victory effects, sound packs and seasonal themes.

### Wave 7 — rooms and modes
Room presets, tournament formats, challenge modes, improved invites and daily/weekly goals.

### Wave 8 — bots and reconnect intelligence
Bot personalities, practice mode, disconnect takeover and safe hand-back.

### Wave 9 — advanced multiplayer
Spectators, replay/highlights, recent players, favorites and moderation foundations.

### Wave 10 — accessibility, PWA and hardening
Low-end mode, reduced motion, colorblind support, sound captions, keyboard access, installability, telemetry and network/browser stress testing.

## Promotion rule

Promote only a staging commit that passed the smoke gate unchanged. If a regression appears after promotion, roll production back to the previous known-good SHA and keep development on staging until fixed.
