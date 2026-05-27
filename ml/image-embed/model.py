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
