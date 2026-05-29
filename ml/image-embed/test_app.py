from fastapi.testclient import TestClient

import app as appmod
import model as m


def test_embed_image_passes_through_vectors_and_failed(monkeypatch):
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
