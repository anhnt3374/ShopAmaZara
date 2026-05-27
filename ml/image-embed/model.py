"""FG-CLIP 2 (qihoo360/fg-clip2-base) wrapper: batch image + text encoding,
L2-normalized vectors as plain lists. Heavy imports are lazy so the route tests
can mock these functions without torch/transformers installed.

Uses the model's real API (confirmed against the model card / reference impl):
- AutoModelForCausalLM + AutoTokenizer + AutoImageProcessor, trust_remote_code.
- text: token-length routing -> walk_type "short" (<=64 tok, max_length 64) or
  "long" (max_length 196); `model.get_text_features(..., walk_type=...)`.
- image: `processor(images, max_num_patches=...)` then `model.get_image_features`.
- attn_implementation defaults to "eager" (safest on new GPU archs under cu13).
"""
import os

MODEL_NAME = os.getenv("IMAGE_EMBED_MODEL", "qihoo360/fg-clip2-base")
DEVICE = os.getenv("EMBED_DEVICE", "cuda")
ATTN_IMPL = os.getenv("IMAGE_ATTN_IMPL", "eager")
SHORT_MAX_TOKENS = int(os.getenv("IMAGE_SHORT_MAX_TOKENS", "64"))
MAX_PATCHES = int(os.getenv("IMAGE_MAX_PATCHES", "256"))
FETCH_TIMEOUT = float(os.getenv("IMAGE_FETCH_TIMEOUT", "10"))
MAX_BYTES = int(os.getenv("IMAGE_MAX_BYTES", str(10 * 1024 * 1024)))

_model = None
_tokenizer = None
_processor = None
_device_str = None
_dim = None


def _resolve_device(requested):
    import torch

    requested = (requested or "auto").lower()
    if requested == "cpu":
        return "cpu"
    if requested == "cuda":
        if not torch.cuda.is_available():
            raise RuntimeError("EMBED_DEVICE=cuda requested but no CUDA device is available")
        return "cuda"
    return "cuda" if torch.cuda.is_available() else "cpu"


def get_model():
    global _model, _tokenizer, _processor, _device_str
    if _model is None:
        from transformers import AutoImageProcessor, AutoModelForCausalLM, AutoTokenizer

        _device_str = _resolve_device(DEVICE)
        kwargs = {"trust_remote_code": True}
        _tokenizer = AutoTokenizer.from_pretrained(MODEL_NAME, **kwargs)
        _processor = AutoImageProcessor.from_pretrained(MODEL_NAME, **kwargs)
        _model = AutoModelForCausalLM.from_pretrained(
            MODEL_NAME, attn_implementation=ATTN_IMPL, **kwargs
        )
        _model.to(_device_str).eval()
    return _model, _tokenizer, _processor


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


def embed_texts(texts):
    import torch
    import torch.nn.functional as F

    if not texts:
        return []
    model, tokenizer, _ = get_model()

    # Route each text to the short or long encoder by its (untruncated) token count.
    token_lens = [
        len(tokenizer(t, add_special_tokens=True, truncation=False, return_tensors=None)["input_ids"])
        for t in texts
    ]
    short_idx = [i for i, n in enumerate(token_lens) if n <= SHORT_MAX_TOKENS]
    long_idx = [i for i, n in enumerate(token_lens) if n > SHORT_MAX_TOKENS]

    out = [None] * len(texts)
    with torch.inference_mode():
        for idx_group, max_len, walk in ((short_idx, 64, "short"), (long_idx, 196, "long")):
            if not idx_group:
                continue
            enc = tokenizer(
                [texts[i] for i in idx_group],
                padding="max_length",
                max_length=max_len,
                truncation=True,
                return_tensors="pt",
            ).to(_device_str)
            feats = model.get_text_features(**enc, walk_type=walk)
            feats = F.normalize(feats, p=2, dim=-1).float().cpu().tolist()
            for j, i in enumerate(idx_group):
                out[i] = feats[j]
    return out


def dim():
    global _dim
    if _dim is None:
        _dim = len(embed_texts(["."])[0])
    return _dim


def embed_images(urls):
    import torch
    import torch.nn.functional as F

    model, _, processor = get_model()
    images, ok_idx, failed = [], [], []
    for i, url in enumerate(urls):
        try:
            images.append(_fetch_image(url))
            ok_idx.append(i)
        except Exception:
            failed.append(i)
    vectors = [[0.0] * dim() for _ in urls]
    if images:
        with torch.inference_mode():
            enc = processor(images=images, max_num_patches=MAX_PATCHES, return_tensors="pt").to(
                _device_str
            )
            feats = model.get_image_features(**enc)
            feats = F.normalize(feats, p=2, dim=-1).float().cpu().tolist()
        for j, i in enumerate(ok_idx):
            vectors[i] = feats[j]
    return vectors, failed
