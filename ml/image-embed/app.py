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
