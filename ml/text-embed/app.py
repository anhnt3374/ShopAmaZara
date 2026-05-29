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
