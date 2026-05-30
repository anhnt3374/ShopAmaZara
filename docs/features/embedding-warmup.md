# Embedding service warmup

Both ML embedding services (`text-embed`, `image-embed`) load their models
lazily on the first request, so the first search/index after startup or a long
idle period pays the model-load cost.

`EmbeddingWarmupService` (in `backend/src/embeddings/`) keeps them warm: a few
seconds after the backend starts it issues a mock embed to both services
(`text.embed(['warm'], { isQuery: true })` and the CLIP text path
`image.embedText(['warm'])`),
then repeats on a fixed interval. Runs fire both services in parallel and
swallow failures (logged at `warn`) so warmup never destabilizes the API.

**Health-gated.** Before warming a service, the pass polls its `/health`
endpoint until the HTTP server responds (short probes, ~3s apart, up to ~90s),
so it doesn't fire while the container is still starting. The warm call itself
then triggers the (possibly cold) lazy model load and waits up to
`EMBED_WARMUP_TIMEOUT_MS` for it — long by default, because the first load
downloads weights and moves the model onto the GPU, which can take minutes.
This is why warmup no longer logs `embed request timed out after 30000ms`
during a cold start.

## Configuration

| Variable                   | Default  | Meaning                                        |
|----------------------------|----------|------------------------------------------------|
| `EMBED_WARMUP_ENABLED`     | `true`   | Master switch. Also skipped if `EMBEDDINGS_ENABLED=false`. |
| `EMBED_WARMUP_DELAY_MS`    | `5000`   | Delay after startup before the first warmup.    |
| `EMBED_WARMUP_INTERVAL_MS` | `300000` | Interval between warmups (5 min).               |
| `EMBED_WARMUP_TIMEOUT_MS`  | `300000` | Timeout for the warm call — rides out the cold model load. |
