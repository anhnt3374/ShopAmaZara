# Embedding services — design (sub-project 1 of 5)

## Context

This is the first of five sub-projects that together add semantic search + personalization
to AmaZara. The full effort decomposes into:

1. **Embedding services** (this doc) — stand up the two ML model services + a NestJS client.
2. Product embedding index — storage + backfill/indexing of per-product vectors.
3. Semantic search ranking — weighted blend (0.55 desc + 0.25 attr + 0.10 image + 0.10 boost), wired into `/products` and the chatbot.
4. Behavior tracking — events table + weight scheme.
5. Personalization — weighted user-preference vectors + user profile, re-ranking search.

Each sub-project gets its own spec → plan → implementation cycle. **This spec covers only
sub-project 1.**

The backend is NestJS/Node, which cannot run HuggingFace models in-process. The two models
(`BAAI/bge-small-en-v1.5` for text, `qihoo360/fg-clip2-base` for images) run as **two separate
Python microservices**; the backend calls them over HTTP.

## Goal

Two independently-deployable embedding services and a NestJS client module, verified end to
end (each service returns normalized vectors of the expected dimension; the client can reach
both). No product embeddings, search, or personalization yet.

## Architecture

```
ml/
  text-embed/    FastAPI service — BAAI/bge-small-en-v1.5 (384-dim)
  image-embed/   FastAPI service — qihoo360/fg-clip2-base (FG-CLIP 2; dim auto-detected)
backend/src/embeddings/   NestJS client module (TextEmbeddingClient, ImageEmbeddingClient)
docker-compose.yml        + two services + shared hf_cache volume (GPU reservation)
```

Two separate services (not one combined) per the requirement that each model be its own
service; they scale, restart, and fail independently.

## Service contracts

All returned vectors are **L2-normalized** (so cosine similarity == dot product in later
sub-projects). All embed endpoints are **batched** (accept arrays). Errors return HTTP 4xx/5xx
with a JSON `{ detail }` body.

### Text service (`ml/text-embed`)

| Method | Path | Request | Response |
|--------|------|---------|----------|
| GET | `/health` | — | `{ status: "ok", model_loaded: bool }` |
| GET | `/info` | — | `{ model, dim, device }` |
| POST | `/embed` | `{ texts: string[], is_query?: bool }` | `{ vectors: number[][], dim }` |

- Loaded with `sentence-transformers` (`SentenceTransformer(model, device=EMBED_DEVICE)`),
  `normalize_embeddings=True`.
- `is_query` (default `false`): when `true`, prepend the BGE retrieval instruction
  (`"Represent this sentence for searching relevant passages: "`) to each text. This preserves
  bge's query/passage asymmetry for search in sub-project 3. Passages (product text) use `false`.

### Image service (`ml/image-embed`)

FG-CLIP 2 is a CLIP-family model with a shared text/image embedding space, so it exposes both
encoders:

| Method | Path | Request | Response |
|--------|------|---------|----------|
| GET | `/health` | — | `{ status: "ok", model_loaded: bool }` |
| GET | `/info` | — | `{ model, dim, device }` |
| POST | `/embed/image` | `{ image_urls: string[] }` | `{ vectors: number[][], dim }` |
| POST | `/embed/text` | `{ texts: string[] }` | `{ vectors: number[][], dim }` |

- The service **fetches each image URL itself** (httpx, with a timeout and size cap), decodes
  with Pillow, runs the FG-CLIP 2 image encoder, returns normalized vectors. A URL that fails
  to fetch/decode yields a zero vector in its slot plus a `failed: number[]` index list in the
  response (so the caller knows which were skipped) — it does not fail the whole batch.
- `/embed/text` runs the FG-CLIP 2 **text** encoder (same space as images) — used in
  sub-project 3 so a text query can be matched against product *image* embeddings.
- Model is loaded per its HuggingFace model card (e.g. `transformers` AutoModel/AutoProcessor,
  `trust_remote_code` if the card requires it). The embedding **dimension is auto-detected**
  from the model output at startup and surfaced via `/info` — not hardcoded.

### Shared service conventions
- Model loads once at startup; `/health` reports `model_loaded` so the NestJS client and
  compose healthcheck can wait for readiness.
- Each service is a thin FastAPI app: `main.py` (routes + request/response models) and a small
  `model.py` (load + encode). One responsibility each.

## NestJS client (`backend/src/embeddings/`)

An `EmbeddingsModule` exporting two injectable clients, consumed by later sub-projects:

- `TextEmbeddingClient.embed(texts: string[], opts?: { isQuery?: boolean }): Promise<number[][]>`
- `ImageEmbeddingClient.embedImages(urls: string[]): Promise<{ vectors: number[][]; failed: number[] }>`
- `ImageEmbeddingClient.embedText(texts: string[]): Promise<number[][]>`

Behavior:
- Base URLs from env `TEXT_EMBED_URL` / `IMAGE_EMBED_URL`; POST JSON via the global fetch.
- Chunk large inputs into batches (config `EMBED_BATCH_SIZE`, default 32) and concatenate.
- Per-request timeout (`EMBED_REQUEST_TIMEOUT_MS`, default 30000).
- Kill switch `EMBEDDINGS_ENABLED` (default `true`): when `false`, clients throw a clear
  "embeddings disabled" error rather than calling the network. (Later sub-projects decide how
  to degrade; this sub-project just exposes the flag.)
- No new HTTP routes on the backend in this sub-project — the module is wiring for later use.

## Configuration / infra

Env (documented in `backend/.env.example` and the service Dockerfiles):

| Var | Default | Used by |
|-----|---------|---------|
| `TEXT_EMBED_MODEL` | `BAAI/bge-small-en-v1.5` | text service |
| `IMAGE_EMBED_MODEL` | `qihoo360/fg-clip2-base` | image service |
| `EMBED_DEVICE` | `cuda` | both services (set `cpu` to run without a GPU) |
| `TEXT_EMBED_URL` | `http://text-embed:8000` | backend client |
| `IMAGE_EMBED_URL` | `http://image-embed:8000` | backend client |
| `EMBEDDINGS_ENABLED` | `true` | backend client |
| `EMBED_BATCH_SIZE` | `32` | backend client |
| `EMBED_REQUEST_TIMEOUT_MS` | `30000` | backend client |

`docker-compose.yml`:
- Two new services `text-embed` and `image-embed` built from `ml/*/Dockerfile` (CUDA-enabled
  PyTorch base image), each reserving the GPU via
  `deploy.resources.reservations.devices: [{ capabilities: [gpu] }]`. On WSL2 this uses the
  host NVIDIA GPU; setting `EMBED_DEVICE=cpu` (and dropping the reservation) runs CPU-only.
- A shared named volume `hf_cache` mounted at the HuggingFace cache dir so weights download once.
- Backend does **not** hard-`depends_on` these (model load is slow); it stays up and the client
  surfaces a clear error if a service is unreachable.

## Testing / verification
- **Services:** a `pytest` smoke test per service that boots the app with a tiny stub/the real
  model if available and asserts `/embed` returns vectors whose length matches `/info.dim` and
  are unit-norm. (If running the real model in CI is too heavy, the smoke test mocks the
  encoder and asserts the request/response shape + normalization passthrough.)
- **Backend client:** unit tests with a mocked `fetch` — batching splits correctly, vectors are
  concatenated in order, the timeout and `EMBEDDINGS_ENABLED=false` paths behave as specified.
- **Manual:** `docker compose up text-embed image-embed`, then
  `curl -X POST localhost:.../embed -d '{"texts":["red running shoes"]}'` returns a 384-length
  vector; `/embed/image` with a sample product image URL returns a vector of the image model's
  dim; `/info` reports the dims.

## Out of scope (later sub-projects)
- Computing/storing product embeddings, the `product_embeddings` storage choice, backfill, and
  on-create/update indexing (sub-project 2).
- Search ranking, query embedding, weighted blend, `/products` + chatbot integration (sub-project 3).
- Behavior events and weights (sub-project 4).
- User preference vectors + profile + re-ranking (sub-project 5).

## Open implementation note
The exact FG-CLIP 2 load/encode API (library, `trust_remote_code`, preprocessing) will follow
the `qihoo360/fg-clip2-base` model card and be confirmed during planning; the service contract
above (normalized vectors, auto-detected dim, the two endpoints) is fixed regardless of the
loading details.
