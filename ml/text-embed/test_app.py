import math

from fastapi.testclient import TestClient

import app as appmod
import model as m


def _unit(v):
    return abs(math.sqrt(sum(x * x for x in v)) - 1.0) < 1e-6


def test_embed_returns_vectors_and_dim(monkeypatch):
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
