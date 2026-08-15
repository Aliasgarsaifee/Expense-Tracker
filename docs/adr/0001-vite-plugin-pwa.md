# ADR 0001: vite-plugin-pwa for the service worker

**Date:** 2026-08-16 · **Status:** accepted

## Context

The app is signed with a free Apple ID, so the native build expires every ~7
days and needs a Mac to re-sign. Shipping the same bundle as an installable
PWA removes that dependency permanently. A PWA needs a service worker to
render offline, which CLAUDE.md requires ("the app must render identically
offline — no runtime network fetches, ever").

CLAUDE.md treats a new dependency as an ADR-level decision: "every package
ships to the phone, and the app currently needs no router, no state library,
no CSS framework".

## Decision

Use `vite-plugin-pwa` as a **devDependency**. It generates the service worker
at build time and does not ship as a runtime dependency; only the generated
worker (~2-4KB) reaches the phone.

## Alternatives considered

**Hand-rolled service worker (~35-50 lines, zero dependencies).** Closer to
the repo's minimalism. Rejected because cache invalidation is the one bug
class that can serve a stale `index.html` indefinitely and make the app
unopenable. Recovery is "clear website data" — uncomfortably adjacent to an
irreplaceable local-only ledger. Workbox's precache manifest carries
per-file revision hashes and prunes old caches on activation; reimplementing
that correctly is more code than the plugin costs.

**No service worker.** Rejected: iOS caches aggressively enough that it would
often work, but "often" is not a property an expense tracker should have. No
worker means no guarantee of an offline launch.

## Consequences

- Offline launch is guaranteed by a precache manifest rather than by luck.
- `registerType: 'autoUpdate'` means a push to `main` reaches the phone on
  next launch with no prompt. The running version stays visible in
  Settings → About.
- `globPatterns` must include `woff2` or the bundled fonts are fetched at
  runtime. This is asserted in the build verification step.
- One more devDependency to keep current. It does not affect the native build,
  where the generated worker is inert.
