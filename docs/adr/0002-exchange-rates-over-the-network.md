# ADR 0002: Exchange rates fetched over the network

**Date:** 2026-11-11 · **Status:** accepted

## Context

Foreign entries are to count as home-currency spending at the rate of the day
they were spent (spec: `docs/superpowers/specs/2026-11-11-currency-conversion-design.md`,
kept locally). A rate for an arbitrary past day cannot be derived on the
device.

This app has never made a network request. README says "Nothing ever leaves
the phone unless you export it", and CLAUDE.md says "the app must render
identically offline — no runtime network fetches, ever". Both were written
about fonts and rendering, but they read as absolute, so this decision has to
be made in the open.

## Decision

Fetch one number per (currency, day) from the Frankfurter API with the
platform's own `fetch`:

```
GET https://api.frankfurter.dev/v2/rates?base=AED&quotes=INR&date=2026-11-06
```

- No dependency, no API key, no account.
- The request carries two currency codes and a date — no amount, no note, no
  identifier. It is sent with `credentials: 'omit'` and no referrer.
- It is best-effort everywhere: a 4 second timeout, never thrown, never
  awaited by a save or a render. Without it the entry is saved in its own
  currency, exactly as before this feature, and converted later.
- Only the resulting home value is stored, on the entry. No rate table.

The rule that survives: **the app renders and works identically offline; the
only thing the network can add is a number.**

## Alternatives considered

**Type every rate by hand.** Zero network. Rejected by the owner: it adds a
lookup and a field to every foreign entry, on the screen that is meant to be
the fastest in the app.

**Frankfurter v1.** The endpoint checked first. Rejected: 29 ECB currencies,
and it answers "not found" for AED and LKR, both pinned in the app's
currency list and one of them in the owner's history.

**fawazahmed0/currency-api on jsDelivr.** Static files on a CDN, 339 codes.
Rejected: dated files only exist from 2024-03-02 (2023-06-15 returned 404),
so the owner's 2023 entries could not be filled in.

**A rate table bundled at build time.** Works offline. Rejected: stale the
day after a build, and a past day's rate for a new trip would always be
missing.

**Two providers with fallback.** Rejected for now: the failure mode of one
provider is already harmless (the entry waits), and a second provider doubles
the parsing and the places a request can go.

## Consequences

- README and CLAUDE.md are reworded: nothing personal leaves the device, and
  rendering never depends on the network.
- The service is run by a third party and can change or disappear. The app
  then degrades to "type the value yourself"; no entry is lost or blocked.
- A reference rate is not the card's rate. The owner can overwrite the value,
  and a hand-typed value is never replaced by a fetched one.
- The provider sees the device's IP address and which currency pair and day
  was asked for. It does not see amounts or anything that identifies an entry.
- Tests inject the `fetch` implementation; no test touches the network.
