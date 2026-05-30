# Embedding service warmup — design

**Date:** 2026-05-30
**Status:** Approved

## Problem

The two ML embedding services load their models **lazily on first request**
(`ml/text-embed/model.py:16-28`, `ml/image-embed/model.py`). Once loaded the
model stays resident, but the first request after the service starts — or after
a long idle period where the process/GPU memory may have been reclaimed — pays
the full model-load cost. This makes the first search (or first index) after
idle noticeably slow.

## Goal

Keep both embedding models warm by having the **backend** issue periodic mock
embed calls, so real user requests rarely hit a cold model.

Non-goals: changing the ML services themselves; warming via real image
downloads; any user-facing behavior change.

## Component: `EmbeddingWarmupService`

Location: `backend/src/embeddings/embedding-warmup.service.ts`

A NestJS provider registered in `EmbeddingsModule`, implementing
`OnModuleInit` and `OnModuleDestroy`. It depends on the existing
`TextEmbeddingClient`, `ImageEmbeddingClient`, and `ConfigService`.

### Lifecycle

- **`onModuleInit`** — if warmup is enabled, schedule the first `warmOnce()`
  after `EMBED_WARMUP_DELAY_MS`. After each run completes (success *or*
  failure), it self-reschedules the next run `EMBED_WARMUP_INTERVAL_MS` later
  using a recursive `setTimeout` (not `setInterval`), so a slow warmup never
  stacks on top of the previous one.
- **`onModuleDestroy`** — clears the pending timer so shutdown and tests leave
  no dangling timers.

### `warmOnce()`

Fires both services **in parallel** (`Promise.allSettled`):

- text-embed → `text.embed(['warm'], { isQuery: true })`
- image-embed → `image.embedText(['warm'])` (CLIP text encoder path — no image
  download required)

Each call's failure (service down, still booting, timeout) is logged at `warn`
and swallowed; a successful run logs at `debug`. Warmup must never throw or
destabilize the API.

## Configuration (env)

| Variable                   | Default  | Meaning                                            |
|----------------------------|----------|----------------------------------------------------|
| `EMBED_WARMUP_ENABLED`     | `true`   | Master switch for warmup.                           |
| `EMBED_WARMUP_DELAY_MS`    | `5000`   | Delay after startup before the first warmup.        |
| `EMBED_WARMUP_INTERVAL_MS` | `300000` | Keep-alive cadence between warmups (5 min).         |

Warmup is also skipped when `EMBEDDINGS_ENABLED=false` (the clients already
throw in that mode; the service short-circuits to avoid noisy logs).

Invalid/non-positive numeric values fall back to the defaults, matching the
parsing style already used in the embedding clients.

## Wiring

- Register `EmbeddingWarmupService` in `embeddings.module.ts` `providers`
  (no export needed — nothing else consumes it).
- Document the three env vars in `backend/.env.example` and `CLAUDE.md`.

## Testing

`backend/src/embeddings/embedding-warmup.service.spec.ts` using Jest fake
timers, with mocked clients:

1. Nothing fires before `EMBED_WARMUP_DELAY_MS` elapses.
2. After the delay, both `text.embed` and `image.embedText` are called.
3. After each `EMBED_WARMUP_INTERVAL_MS`, both are called again.
4. A rejected client call is swallowed — no unhandled rejection, and the next
   run is still scheduled.
5. `onModuleDestroy` cancels the pending timer (no further calls afterward).
6. With `EMBED_WARMUP_ENABLED=false` (or `EMBEDDINGS_ENABLED=false`), no timer
   is scheduled and no calls are made.

## Documentation

- Feature page `docs/features/embedding-warmup.md`.
- Row in `docs/README.md` completed-features table.
