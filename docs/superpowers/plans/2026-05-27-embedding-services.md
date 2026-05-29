# Embedding Services Implementation Plan (sub-project 1/5)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stand up two Python FastAPI embedding microservices (BGE text + FG-CLIP 2 image) and a NestJS client module that talks to them, verified end to end.

**Architecture:** Each model runs as its own FastAPI service under `ml/`, loading its model lazily and returning L2-normalized vectors over HTTP. A NestJS `EmbeddingsModule` exposes `TextEmbeddingClient` + `ImageEmbeddingClient` (batching, timeout, kill-switch) for later sub-projects. Two new `docker-compose` services (GPU-reserved, CPU-overridable) plus a shared HuggingFace cache volume.

**Tech Stack:** Python 3.11 + FastAPI + sentence-transformers / transformers + PyTorch (CUDA); NestJS 10 + `@nestjs/config`; Jest; pytest; Docker Compose. Spec: `docs/superpowers/specs/2026-05-27-embedding-services-design.md`.

**Verification notes:**
- Python services: heavy ML deps (torch/transformers) are imported **lazily inside functions**, so the FastAPI route tests run with only `fastapi pytest httpx` installed and **mock the model functions** (they assert the HTTP contract: shapes, `failed[]` passthrough, empty-input handling — not torch internals). Real model output (dims, normalization) is validated manually via `docker compose up` + `curl`.
- NestJS client: real Jest unit tests mocking `global.fetch`.
- Compose: validated with `docker compose config -q`. Actually running the GPU services downloads multi-GB weights and needs an NVIDIA GPU (WSL2 CUDA); that's a manual, environment-dependent step.

---

## File Structure

**Create — text service (`ml/text-embed/`):**
- `model.py` — lazy model load + `embed(texts, is_query)` + `dim()` + `is_loaded()`.
- `app.py` — FastAPI routes `/health`, `/info`, `/embed`.
- `requirements.txt` — runtime deps (torch is in the CUDA base image).
- `requirements-dev.txt` — light test deps (`fastapi pytest httpx`).
- `Dockerfile` — CUDA PyTorch base, installs reqs, runs uvicorn.
- `test_app.py` — route contract tests (model mocked).

**Create — image service (`ml/image-embed/`):** same layout; `model.py` adds `embed_images(urls)` (fetch+encode, per-URL failure → zero vector + `failed[]`) and `embed_texts(texts)` (CLIP text encoder); `app.py` adds `/embed/image` and `/embed/text`.

**Create — NestJS client (`backend/src/embeddings/`):**
- `embeddings.http.ts` — shared `postJson(url, body, timeoutMs)` fetch helper.
- `text-embedding.client.ts` — `TextEmbeddingClient.embed(texts, opts)`.
- `image-embedding.client.ts` — `ImageEmbeddingClient.embedImages(urls)` + `.embedText(texts)`.
- `embeddings.module.ts` — provides + exports both clients.
- `text-embedding.client.spec.ts`, `image-embedding.client.spec.ts` — Jest unit tests.

**Modify:**
- `backend/src/app.module.ts` — import `EmbeddingsModule`.
- `backend/.env.example` — new env vars.
- `docker-compose.yml` — two services + `hf_cache` volume + backend env.

---

### Task 1: Text embedding service (`ml/text-embed/`)

**Files:**
- Create: `ml/text-embed/model.py`, `ml/text-embed/app.py`, `ml/text-embed/requirements.txt`, `ml/text-embed/requirements-dev.txt`, `ml/text-embed/Dockerfile`, `ml/text-embed/test_app.py`

- [ ] **Step 1: Create `model.py`**

```python
import os

MODEL_NAME = os.getenv("TEXT_EMBED_MODEL", "BAAI/bge-small-en-v1.5")
DEVICE = os.getenv("EMBED_DEVICE", "cuda")
# bge models want this instruction prepended to *queries* (not passages) for retrieval.
QUERY_INSTRUCTION = "Represent this sentence for searching relevant passages: "

_model = None


def get_model():
    global _model
    if _model is None:
        from sentence_transformers import SentenceTransformer  # lazy: heavy import

        _model = SentenceTransformer(MODEL_NAME, device=DEVICE)
    return _model


def is_loaded():
    return _model is not None


def embed(texts, is_query=False):
    model = get_model()
    inputs = [QUERY_INSTRUCTION + t for t in texts] if is_query else list(texts)
    vecs = model.encode(inputs, normalize_embeddings=True)
    return [list(map(float, v)) for v in vecs]


def dim():
    return int(get_model().get_sentence_embedding_dimension())
```

- [ ] **Step 2: Create `app.py`**

```python
from fastapi import FastAPI
from pydantic import BaseModel

import model as m

app = FastAPI(title="text-embed")


class EmbedRequest(BaseModel):
    texts: list[str]
    is_query: bool = False


@app.get("/health")
def health():
    return {"status": "ok", "model_loaded": m.is_loaded()}


@app.get("/info")
def info():
    return {"model": m.MODEL_NAME, "dim": m.dim(), "device": m.DEVICE}


@app.post("/embed")
def embed(req: EmbedRequest):
    if not req.texts:
        return {"vectors": [], "dim": 0}
    vectors = m.embed(req.texts, is_query=req.is_query)
    return {"vectors": vectors, "dim": len(vectors[0])}
```

- [ ] **Step 3: Create `requirements.txt` and `requirements-dev.txt`**

`requirements.txt`:
```
fastapi==0.115.*
uvicorn[standard]==0.32.*
sentence-transformers==3.*
```

`requirements-dev.txt`:
```
fastapi==0.115.*
pytest==8.*
httpx==0.27.*
```

- [ ] **Step 4: Create `Dockerfile`**

```dockerfile
FROM pytorch/pytorch:2.4.1-cuda12.1-cudnn9-runtime
WORKDIR /app
ENV HF_HOME=/hf_cache
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY . .
EXPOSE 8000
CMD ["uvicorn", "app:app", "--host", "0.0.0.0", "--port", "8000"]
```

- [ ] **Step 5: Write the failing route tests (`test_app.py`)**

```python
import math

from fastapi.testclient import TestClient

import app as appmod
import model as m


def _unit(v):
    return abs(math.sqrt(sum(x * x for x in v)) - 1.0) < 1e-6


def test_embed_returns_vectors_and_dim(monkeypatch):
    # Mock the model functions so no torch/sentence-transformers is needed.
    monkeypatch.setattr(m, "embed", lambda texts, is_query=False: [[0.6, 0.8] for _ in texts])
    client = TestClient(appmod.app)
    r = client.post("/embed", json={"texts": ["red shoes", "blue hat"]})
    assert r.status_code == 200
    body = r.json()
    assert body["dim"] == 2
    assert len(body["vectors"]) == 2
    assert all(_unit(v) for v in body["vectors"])


def test_embed_empty_returns_empty(monkeypatch):
    monkeypatch.setattr(m, "embed", lambda texts, is_query=False: [])
    client = TestClient(appmod.app)
    r = client.post("/embed", json={"texts": []})
    assert r.json() == {"vectors": [], "dim": 0}


def test_is_query_flag_forwarded(monkeypatch):
    seen = {}

    def fake_embed(texts, is_query=False):
        seen["is_query"] = is_query
        return [[1.0, 0.0] for _ in texts]

    monkeypatch.setattr(m, "embed", fake_embed)
    client = TestClient(appmod.app)
    client.post("/embed", json={"texts": ["q"], "is_query": True})
    assert seen["is_query"] is True


def test_health_reports_not_loaded(monkeypatch):
    monkeypatch.setattr(m, "_model", None)
    client = TestClient(appmod.app)
    assert client.get("/health").json() == {"status": "ok", "model_loaded": False}
```

- [ ] **Step 6: Run the tests — expect PASS**

Run:
```bash
cd ml/text-embed && python -m venv .venv && . .venv/bin/activate && pip install -r requirements-dev.txt && python -m pytest -q
```
Expected: 4 passed. (The model functions are mocked, so no heavy deps are needed.)

- [ ] **Step 7: Commit**

```bash
git add ml/text-embed/
git commit -m "feat(ml): text embedding FastAPI service (bge-small-en-v1.5)"
```

---

### Task 2: Image embedding service (`ml/image-embed/`)

**Files:**
- Create: `ml/image-embed/model.py`, `ml/image-embed/app.py`, `ml/image-embed/requirements.txt`, `ml/image-embed/requirements-dev.txt`, `ml/image-embed/Dockerfile`, `ml/image-embed/test_app.py`

- [ ] **Step 1: Create `model.py`**

```python
import os

MODEL_NAME = os.getenv("IMAGE_EMBED_MODEL", "qihoo360/fg-clip2-base")
DEVICE = os.getenv("EMBED_DEVICE", "cuda")
FETCH_TIMEOUT = float(os.getenv("IMAGE_FETCH_TIMEOUT", "10"))
MAX_BYTES = int(os.getenv("IMAGE_MAX_BYTES", str(10 * 1024 * 1024)))

_model = None
_processor = None
_dim = None


def get_model():
    global _model, _processor
    if _model is None:
        # Lazy heavy imports. NOTE: confirm the exact load API against the
        # qihoo360/fg-clip2-base model card during the manual run step; adjust
        # these 3 lines if the card differs. The service contract (normalized
        # vectors, auto-detected dim, two endpoints) does not change.
        from transformers import AutoModel, AutoProcessor

        _model = AutoModel.from_pretrained(MODEL_NAME, trust_remote_code=True).to(DEVICE).eval()
        _processor = AutoProcessor.from_pretrained(MODEL_NAME, trust_remote_code=True)
    return _model, _processor


def is_loaded():
    return _model is not None


def _fetch_image(url):
    import httpx
    from io import BytesIO
    from PIL import Image

    resp = httpx.get(url, timeout=FETCH_TIMEOUT, follow_redirects=True)
    resp.raise_for_status()
    if len(resp.content) > MAX_BYTES:
        raise ValueError("image too large")
    return Image.open(BytesIO(resp.content)).convert("RGB")


def _normalize(t):
    return t / t.norm(dim=-1, keepdim=True)


def embed_texts(texts):
    import torch

    model, processor = get_model()
    with torch.no_grad():
        inputs = processor(text=list(texts), return_tensors="pt", padding=True).to(DEVICE)
        feats = _normalize(model.get_text_features(**inputs)).cpu().tolist()
    return [list(map(float, v)) for v in feats]


def dim():
    global _dim
    if _dim is None:
        _dim = len(embed_texts(["probe"])[0])
    return _dim


def embed_images(urls):
    import torch

    model, processor = get_model()
    images, ok_idx, failed = [], [], []
    for i, url in enumerate(urls):
        try:
            images.append(_fetch_image(url))
            ok_idx.append(i)
        except Exception:
            failed.append(i)
    vectors = [[0.0] * dim() for _ in urls]
    if images:
        with torch.no_grad():
            inputs = processor(images=images, return_tensors="pt").to(DEVICE)
            feats = _normalize(model.get_image_features(**inputs)).cpu().tolist()
        for j, i in enumerate(ok_idx):
            vectors[i] = list(map(float, feats[j]))
    return vectors, failed
```

- [ ] **Step 2: Create `app.py`**

```python
from fastapi import FastAPI
from pydantic import BaseModel

import model as m

app = FastAPI(title="image-embed")


class ImageRequest(BaseModel):
    image_urls: list[str]


class TextRequest(BaseModel):
    texts: list[str]


@app.get("/health")
def health():
    return {"status": "ok", "model_loaded": m.is_loaded()}


@app.get("/info")
def info():
    return {"model": m.MODEL_NAME, "dim": m.dim(), "device": m.DEVICE}


@app.post("/embed/image")
def embed_image(req: ImageRequest):
    if not req.image_urls:
        return {"vectors": [], "dim": 0, "failed": []}
    vectors, failed = m.embed_images(req.image_urls)
    return {"vectors": vectors, "dim": len(vectors[0]), "failed": failed}


@app.post("/embed/text")
def embed_text(req: TextRequest):
    if not req.texts:
        return {"vectors": [], "dim": 0}
    vectors = m.embed_texts(req.texts)
    return {"vectors": vectors, "dim": len(vectors[0])}
```

- [ ] **Step 3: Create `requirements.txt` and `requirements-dev.txt`**

`requirements.txt`:
```
fastapi==0.115.*
uvicorn[standard]==0.32.*
transformers==4.*
pillow==11.*
httpx==0.27.*
```
(If the `qihoo360/fg-clip2-base` card requires extra packages, e.g. `open_clip_torch`, add them here during the manual run step.)

`requirements-dev.txt`:
```
fastapi==0.115.*
pytest==8.*
httpx==0.27.*
```

- [ ] **Step 4: Create `Dockerfile`**

```dockerfile
FROM pytorch/pytorch:2.4.1-cuda12.1-cudnn9-runtime
WORKDIR /app
ENV HF_HOME=/hf_cache
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY . .
EXPOSE 8000
CMD ["uvicorn", "app:app", "--host", "0.0.0.0", "--port", "8000"]
```

- [ ] **Step 5: Write the failing route tests (`test_app.py`)**

```python
from fastapi.testclient import TestClient

import app as appmod
import model as m


def test_embed_image_passes_through_vectors_and_failed(monkeypatch):
    # Two URLs: index 1 "failed" -> zero vector + failed list. Model mocked.
    monkeypatch.setattr(
        m, "embed_images", lambda urls: ([[1.0, 0.0, 0.0, 0.0], [0.0, 0.0, 0.0, 0.0]], [1])
    )
    client = TestClient(appmod.app)
    r = client.post("/embed/image", json={"image_urls": ["http://a", "http://b"]})
    assert r.status_code == 200
    body = r.json()
    assert body["dim"] == 4
    assert body["failed"] == [1]
    assert len(body["vectors"]) == 2


def test_embed_image_empty(monkeypatch):
    monkeypatch.setattr(m, "embed_images", lambda urls: ([], []))
    client = TestClient(appmod.app)
    r = client.post("/embed/image", json={"image_urls": []})
    assert r.json() == {"vectors": [], "dim": 0, "failed": []}


def test_embed_text_clip_encoder(monkeypatch):
    monkeypatch.setattr(m, "embed_texts", lambda texts: [[0.6, 0.8] for _ in texts])
    client = TestClient(appmod.app)
    r = client.post("/embed/text", json={"texts": ["red shoes"]})
    body = r.json()
    assert body["dim"] == 2
    assert len(body["vectors"]) == 1


def test_health_reports_not_loaded(monkeypatch):
    monkeypatch.setattr(m, "_model", None)
    client = TestClient(appmod.app)
    assert client.get("/health").json() == {"status": "ok", "model_loaded": False}
```

- [ ] **Step 6: Run the tests — expect PASS**

Run:
```bash
cd ml/image-embed && python -m venv .venv && . .venv/bin/activate && pip install -r requirements-dev.txt && python -m pytest -q
```
Expected: 4 passed.

- [ ] **Step 7: Commit**

```bash
git add ml/image-embed/
git commit -m "feat(ml): image embedding FastAPI service (fg-clip2-base, image+text encoders)"
```

---

### Task 3: docker-compose wiring + env

**Files:**
- Modify: `docker-compose.yml`
- Modify: `backend/.env.example`

- [ ] **Step 1: Add the two services + volume to `docker-compose.yml`**

Add these two services under `services:` (alongside `mysql`, `backend`, `frontend`):

```yaml
  text-embed:
    build:
      context: ./ml/text-embed
    container_name: amazara-text-embed
    restart: unless-stopped
    environment:
      TEXT_EMBED_MODEL: ${TEXT_EMBED_MODEL:-BAAI/bge-small-en-v1.5}
      EMBED_DEVICE: ${EMBED_DEVICE:-cuda}
      HF_HOME: /hf_cache
    volumes:
      - hf_cache:/hf_cache
    ports:
      - "8001:8000"
    deploy:
      resources:
        reservations:
          devices:
            - driver: nvidia
              count: 1
              capabilities: [gpu]

  image-embed:
    build:
      context: ./ml/image-embed
    container_name: amazara-image-embed
    restart: unless-stopped
    environment:
      IMAGE_EMBED_MODEL: ${IMAGE_EMBED_MODEL:-qihoo360/fg-clip2-base}
      EMBED_DEVICE: ${EMBED_DEVICE:-cuda}
      HF_HOME: /hf_cache
    volumes:
      - hf_cache:/hf_cache
    ports:
      - "8002:8000"
    deploy:
      resources:
        reservations:
          devices:
            - driver: nvidia
              count: 1
              capabilities: [gpu]
```

Add `hf_cache` to the existing `volumes:` block at the bottom of the file:

```yaml
volumes:
  amazara_mysql_data:
  amazara_backend_node_modules:
  amazara_frontend_node_modules:
  hf_cache:
```

- [ ] **Step 2: Add the client env vars to the backend service in `docker-compose.yml`**

In the `backend:` service's `environment:` block, append:

```yaml
      TEXT_EMBED_URL: ${TEXT_EMBED_URL:-http://text-embed:8000}
      IMAGE_EMBED_URL: ${IMAGE_EMBED_URL:-http://image-embed:8000}
      EMBEDDINGS_ENABLED: ${EMBEDDINGS_ENABLED:-true}
      EMBED_BATCH_SIZE: ${EMBED_BATCH_SIZE:-32}
      EMBED_REQUEST_TIMEOUT_MS: ${EMBED_REQUEST_TIMEOUT_MS:-30000}
```

(Do NOT add `depends_on` for the embed services — model load is slow and the backend must stay up regardless.)

- [ ] **Step 3: Add the new vars to `backend/.env.example`**

Append a section:

```
# Embedding services (sub-project 1)
TEXT_EMBED_URL=http://localhost:8001
IMAGE_EMBED_URL=http://localhost:8002
EMBEDDINGS_ENABLED=true
EMBED_BATCH_SIZE=32
EMBED_REQUEST_TIMEOUT_MS=30000
# Model services (read by the Python containers)
TEXT_EMBED_MODEL=BAAI/bge-small-en-v1.5
IMAGE_EMBED_MODEL=qihoo360/fg-clip2-base
EMBED_DEVICE=cuda
```

- [ ] **Step 4: Validate compose syntax**

Run: `docker compose config -q`
Expected: no output, exit 0 (compose file is valid).

- [ ] **Step 5: Commit**

```bash
git add docker-compose.yml backend/.env.example
git commit -m "chore(compose): add text-embed + image-embed services and client env"
```

- [ ] **Step 6 (manual, environment-dependent — not blocking the commit): real smoke test**

On a machine with an NVIDIA GPU (WSL2 CUDA) or with `EMBED_DEVICE=cpu`:
```bash
docker compose up -d text-embed image-embed   # first run downloads weights (slow)
curl -s localhost:8001/info
curl -s -X POST localhost:8001/embed -H 'content-type: application/json' -d '{"texts":["red running shoes"]}' | head -c 200
curl -s localhost:8002/info
curl -s -X POST localhost:8002/embed/image -H 'content-type: application/json' -d '{"image_urls":["<a real product image url>"]}' | head -c 200
```
Expected: `/info` reports dims (text=384); `/embed` returns a 384-length vector; `/embed/image` returns a vector of the image model's dim with `failed: []`. If FG-CLIP 2 load fails, adjust `ml/image-embed/model.py:get_model` and `requirements.txt` per the model card, then re-run.

---

### Task 4: NestJS EmbeddingsModule + clients

**Files:**
- Create: `backend/src/embeddings/embeddings.http.ts`, `backend/src/embeddings/text-embedding.client.ts`, `backend/src/embeddings/image-embedding.client.ts`, `backend/src/embeddings/embeddings.module.ts`, `backend/src/embeddings/text-embedding.client.spec.ts`, `backend/src/embeddings/image-embedding.client.spec.ts`
- Modify: `backend/src/app.module.ts`

- [ ] **Step 1: Create the shared HTTP helper `embeddings.http.ts`**

```ts
export async function postJson<T>(url: string, body: unknown, timeoutMs: number): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    if (!res.ok) {
      throw new Error(`embed request failed: ${res.status} ${url}`);
    }
    return (await res.json()) as T;
  } finally {
    clearTimeout(timer);
  }
}
```

- [ ] **Step 2: Create `text-embedding.client.ts`**

```ts
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { postJson } from './embeddings.http';

interface EmbedResponse {
  vectors: number[][];
  dim: number;
}

@Injectable()
export class TextEmbeddingClient {
  constructor(private readonly config: ConfigService) {}

  private get enabled(): boolean {
    return this.config.get<string>('EMBEDDINGS_ENABLED', 'true') !== 'false';
  }
  private get baseUrl(): string {
    return this.config.get<string>('TEXT_EMBED_URL', 'http://text-embed:8000');
  }
  private get batchSize(): number {
    return Number(this.config.get<string>('EMBED_BATCH_SIZE', '32'));
  }
  private get timeoutMs(): number {
    return Number(this.config.get<string>('EMBED_REQUEST_TIMEOUT_MS', '30000'));
  }

  async embed(texts: string[], opts: { isQuery?: boolean } = {}): Promise<number[][]> {
    if (!this.enabled) throw new Error('Embeddings disabled (EMBEDDINGS_ENABLED=false)');
    if (texts.length === 0) return [];
    const out: number[][] = [];
    for (let i = 0; i < texts.length; i += this.batchSize) {
      const batch = texts.slice(i, i + this.batchSize);
      const res = await postJson<EmbedResponse>(
        `${this.baseUrl}/embed`,
        { texts: batch, is_query: opts.isQuery ?? false },
        this.timeoutMs,
      );
      out.push(...res.vectors);
    }
    return out;
  }
}
```

- [ ] **Step 3: Create `image-embedding.client.ts`**

```ts
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { postJson } from './embeddings.http';

interface ImageEmbedResponse {
  vectors: number[][];
  dim: number;
  failed: number[];
}
interface TextEmbedResponse {
  vectors: number[][];
  dim: number;
}

@Injectable()
export class ImageEmbeddingClient {
  constructor(private readonly config: ConfigService) {}

  private get enabled(): boolean {
    return this.config.get<string>('EMBEDDINGS_ENABLED', 'true') !== 'false';
  }
  private get baseUrl(): string {
    return this.config.get<string>('IMAGE_EMBED_URL', 'http://image-embed:8000');
  }
  private get batchSize(): number {
    return Number(this.config.get<string>('EMBED_BATCH_SIZE', '32'));
  }
  private get timeoutMs(): number {
    return Number(this.config.get<string>('EMBED_REQUEST_TIMEOUT_MS', '30000'));
  }

  async embedImages(urls: string[]): Promise<{ vectors: number[][]; failed: number[] }> {
    if (!this.enabled) throw new Error('Embeddings disabled (EMBEDDINGS_ENABLED=false)');
    if (urls.length === 0) return { vectors: [], failed: [] };
    const vectors: number[][] = [];
    const failed: number[] = [];
    for (let i = 0; i < urls.length; i += this.batchSize) {
      const batch = urls.slice(i, i + this.batchSize);
      const res = await postJson<ImageEmbedResponse>(
        `${this.baseUrl}/embed/image`,
        { image_urls: batch },
        this.timeoutMs,
      );
      vectors.push(...res.vectors);
      for (const f of res.failed ?? []) failed.push(i + f); // service indices are batch-relative
    }
    return { vectors, failed };
  }

  async embedText(texts: string[]): Promise<number[][]> {
    if (!this.enabled) throw new Error('Embeddings disabled (EMBEDDINGS_ENABLED=false)');
    if (texts.length === 0) return [];
    const out: number[][] = [];
    for (let i = 0; i < texts.length; i += this.batchSize) {
      const batch = texts.slice(i, i + this.batchSize);
      const res = await postJson<TextEmbedResponse>(
        `${this.baseUrl}/embed/text`,
        { texts: batch },
        this.timeoutMs,
      );
      out.push(...res.vectors);
    }
    return out;
  }
}
```

- [ ] **Step 4: Create `embeddings.module.ts`**

```ts
import { Module } from '@nestjs/common';
import { TextEmbeddingClient } from './text-embedding.client';
import { ImageEmbeddingClient } from './image-embedding.client';

@Module({
  providers: [TextEmbeddingClient, ImageEmbeddingClient],
  exports: [TextEmbeddingClient, ImageEmbeddingClient],
})
export class EmbeddingsModule {}
```

- [ ] **Step 5: Write the failing client tests**

`backend/src/embeddings/text-embedding.client.spec.ts`:
```ts
import { TextEmbeddingClient } from './text-embedding.client';

function makeConfig(overrides: Record<string, string> = {}) {
  const values: Record<string, string> = { EMBED_BATCH_SIZE: '2', ...overrides };
  return {
    get: (key: string, def?: string) => values[key] ?? def,
  } as any;
}

describe('TextEmbeddingClient', () => {
  afterEach(() => jest.restoreAllMocks());

  it('batches by EMBED_BATCH_SIZE and concatenates vectors in order', async () => {
    const fetchMock = jest
      .fn()
      .mockResolvedValueOnce({ ok: true, json: async () => ({ vectors: [[1], [2]], dim: 1 }) })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ vectors: [[3]], dim: 1 }) });
    global.fetch = fetchMock as any;

    const client = new TextEmbeddingClient(makeConfig());
    const out = await client.embed(['a', 'b', 'c']);

    expect(out).toEqual([[1], [2], [3]]);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('forwards is_query', async () => {
    const fetchMock = jest
      .fn()
      .mockResolvedValue({ ok: true, json: async () => ({ vectors: [[1]], dim: 1 }) });
    global.fetch = fetchMock as any;

    const client = new TextEmbeddingClient(makeConfig());
    await client.embed(['q'], { isQuery: true });

    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(body.is_query).toBe(true);
  });

  it('returns [] for empty input without calling fetch', async () => {
    const fetchMock = jest.fn();
    global.fetch = fetchMock as any;
    const client = new TextEmbeddingClient(makeConfig());
    expect(await client.embed([])).toEqual([]);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('throws when disabled', async () => {
    const client = new TextEmbeddingClient(makeConfig({ EMBEDDINGS_ENABLED: 'false' }));
    await expect(client.embed(['a'])).rejects.toThrow(/disabled/);
  });

  it('throws on non-ok response', async () => {
    global.fetch = jest.fn().mockResolvedValue({ ok: false, status: 500 }) as any;
    const client = new TextEmbeddingClient(makeConfig());
    await expect(client.embed(['a'])).rejects.toThrow(/500/);
  });
});
```

`backend/src/embeddings/image-embedding.client.spec.ts`:
```ts
import { ImageEmbeddingClient } from './image-embedding.client';

function makeConfig(overrides: Record<string, string> = {}) {
  const values: Record<string, string> = { EMBED_BATCH_SIZE: '2', ...overrides };
  return { get: (key: string, def?: string) => values[key] ?? def } as any;
}

describe('ImageEmbeddingClient', () => {
  afterEach(() => jest.restoreAllMocks());

  it('offsets batch-relative failed indices to global indices', async () => {
    const fetchMock = jest
      .fn()
      // batch [0,1] -> failed index 1 (global 1)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ vectors: [[1], [0]], dim: 1, failed: [1] }),
      })
      // batch [2] -> failed index 0 (global 2)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ vectors: [[0]], dim: 1, failed: [0] }),
      });
    global.fetch = fetchMock as any;

    const client = new ImageEmbeddingClient(makeConfig());
    const out = await client.embedImages(['u0', 'u1', 'u2']);

    expect(out.vectors).toEqual([[1], [0], [0]]);
    expect(out.failed).toEqual([1, 2]);
  });

  it('embedText concatenates across batches', async () => {
    const fetchMock = jest
      .fn()
      .mockResolvedValueOnce({ ok: true, json: async () => ({ vectors: [[1], [2]], dim: 1 }) })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ vectors: [[3]], dim: 1 }) });
    global.fetch = fetchMock as any;

    const client = new ImageEmbeddingClient(makeConfig());
    expect(await client.embedText(['a', 'b', 'c'])).toEqual([[1], [2], [3]]);
  });

  it('throws when disabled', async () => {
    const client = new ImageEmbeddingClient(makeConfig({ EMBEDDINGS_ENABLED: 'false' }));
    await expect(client.embedImages(['u'])).rejects.toThrow(/disabled/);
  });
});
```

- [ ] **Step 6: Run the tests — expect PASS**

Run: `cd backend && npm test -- embeddings`
Expected: both spec files pass (8 tests). If `npm ci` hasn't been run, run `npm install` first.

- [ ] **Step 7: Register the module in `app.module.ts`**

Add the import near the other module imports:
```ts
import { EmbeddingsModule } from './embeddings/embeddings.module';
```
And add `EmbeddingsModule` to the `imports:` array (e.g. after `AiModule`):
```ts
    AiModule,
    EmbeddingsModule,
```

- [ ] **Step 8: Verify the backend still compiles**

Run: `cd backend && npm run build`
Expected: `nest build` exits 0.

- [ ] **Step 9: Commit**

```bash
git add backend/src/embeddings/ backend/src/app.module.ts
git commit -m "feat(be): EmbeddingsModule with text + image embedding HTTP clients"
```

---

## Self-Review

**Spec coverage:**
- Two separate FastAPI services, one per model → Tasks 1, 2. ✓
- Text `/health` `/info` `/embed` with `is_query` + BGE instruction, L2-normalized → Task 1. ✓
- Image `/embed/image` (URL-fetch, per-item failure → zero vector + `failed[]`) + `/embed/text` (CLIP text encoder) + auto-detected dim → Task 2. ✓
- L2 normalization (model side) + batched endpoints → Tasks 1/2 (`normalize_embeddings=True`, `_normalize`); batching on the client → Task 4. ✓
- NestJS `EmbeddingsModule` with `TextEmbeddingClient` + `ImageEmbeddingClient` (batching, timeout, `EMBEDDINGS_ENABLED` kill-switch), exported, no new HTTP routes → Task 4. ✓
- Env vars (`TEXT_EMBED_MODEL`, `IMAGE_EMBED_MODEL`, `EMBED_DEVICE`=cuda, URLs, `EMBEDDINGS_ENABLED`, batch, timeout) → Task 3. ✓
- docker-compose: two services, GPU reservation, shared `hf_cache`, no backend hard-depends_on → Task 3. ✓
- Verification: pytest route tests (model mocked) + Jest client tests + manual curl → Tasks 1/2/4 + Task 3 Step 6. ✓
- Open FG-CLIP load item acknowledged → Task 2 Step 1 comment + Task 3 Step 6. ✓

**Placeholder scan:** No TBD/TODO. The FG-CLIP load note is an explicit, spec-acknowledged verification instruction with concrete default code, not a placeholder. ✓

**Type/name consistency:** Python `model.embed`/`embed_images`/`embed_texts`/`dim`/`is_loaded`/`_model` names match between each `app.py`, `model.py`, and `test_app.py`. NestJS `postJson` signature matches both clients; `TextEmbeddingClient.embed(texts, opts)`, `ImageEmbeddingClient.embedImages(urls) -> {vectors, failed}` and `.embedText(texts)` match the spec and their specs. Config keys (`EMBEDDINGS_ENABLED`, `TEXT_EMBED_URL`, `IMAGE_EMBED_URL`, `EMBED_BATCH_SIZE`, `EMBED_REQUEST_TIMEOUT_MS`) are identical across clients, compose, and `.env.example`. ✓
