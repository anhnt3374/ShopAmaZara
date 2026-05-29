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


def embed(texts: list[str], is_query: bool = False) -> list[list[float]]:
    model = get_model()
    inputs = [QUERY_INSTRUCTION + t for t in texts] if is_query else list(texts)
    vecs = model.encode(inputs, normalize_embeddings=True)
    return [list(map(float, v)) for v in vecs]


def dim():
    return int(get_model().get_sentence_embedding_dimension())
