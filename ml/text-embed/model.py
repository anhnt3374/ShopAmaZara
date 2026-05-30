import os
import threading

MODEL_NAME = os.getenv("TEXT_EMBED_MODEL", "BAAI/bge-small-en-v1.5")
DEVICE = os.getenv("EMBED_DEVICE", "cuda")
# bge models want this instruction prepended to *queries* (not passages) for retrieval.
QUERY_INSTRUCTION = "Represent this sentence for searching relevant passages: "

_model = None
_load_lock = threading.Lock()
# Serialize inference: the HF fast tokenizer inside SentenceTransformer raises
# "Already borrowed" if encode() runs from multiple threads at once.
_infer_lock = threading.Lock()


def get_model():
    global _model
    # Fast path; otherwise serialize the lazy load so concurrent first requests
    # (uvicorn threadpool) don't each spin up a SentenceTransformer at once.
    if _model is not None:
        return _model
    with _load_lock:
        if _model is None:  # double-checked
            from sentence_transformers import SentenceTransformer  # lazy: heavy import

            model = SentenceTransformer(MODEL_NAME, device=DEVICE)
            _model = model  # publish only after a successful load
    return _model


def is_loaded():
    return _model is not None


def embed(texts: list[str], is_query: bool = False) -> list[list[float]]:
    model = get_model()
    inputs = [QUERY_INSTRUCTION + t for t in texts] if is_query else list(texts)
    with _infer_lock:
        vecs = model.encode(inputs, normalize_embeddings=True)
    return [list(map(float, v)) for v in vecs]


def dim():
    return int(get_model().get_sentence_embedding_dimension())
