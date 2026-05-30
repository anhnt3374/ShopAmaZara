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

## Configuration

| Variable                   | Default  | Meaning                                        |
|----------------------------|----------|------------------------------------------------|
| `EMBED_WARMUP_ENABLED`     | `true`   | Master switch. Also skipped if `EMBEDDINGS_ENABLED=false`. |
| `EMBED_WARMUP_DELAY_MS`    | `5000`   | Delay after startup before the first warmup.    |
| `EMBED_WARMUP_INTERVAL_MS` | `300000` | Interval between warmups (5 min).               |
