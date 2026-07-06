"""
Test dello store Qdrant con una funzione di embedding fake e deterministica.

La fake mappa parole-chiave note su vettori fissi, così la ricerca è verificabile
senza rete né chiamate a Gemini. Qdrant gira in-memory.
"""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent))

import math

import pytest

from chunker import Chunk
from store import KnowledgeStore

DIM = 8

# Vettori base ortonormali per tre "argomenti".
_TOPICS = {
    "vpn": [1, 0, 0, 0, 0, 0, 0, 0],
    "stampante": [0, 1, 0, 0, 0, 0, 0, 0],
    "password": [0, 0, 1, 0, 0, 0, 0, 0],
}


def _normalize(v):
    n = math.sqrt(sum(x * x for x in v)) or 1.0
    return [x / n for x in v]


def fake_embed(texts, task_type):
    """Somma i vettori-argomento delle keyword presenti nel testo, poi normalizza."""
    out = []
    for t in texts:
        low = t.lower()
        acc = [0.0] * DIM
        for kw, base in _TOPICS.items():
            if kw in low:
                acc = [a + b for a, b in zip(acc, base)]
        if acc == [0.0] * DIM:
            acc[-1] = 1.0  # vettore "neutro" per testi senza keyword
        out.append(_normalize(acc))
    return out


@pytest.fixture
def store():
    return KnowledgeStore(embed_fn=fake_embed, dim=DIM)


def test_add_and_list_document(store):
    meta = store.add_document("vpn.md", [Chunk(0, "come configurare la vpn")])
    assert meta.filename == "vpn.md"
    assert meta.chunk_count == 1
    docs = store.list_documents()
    assert len(docs) == 1
    assert docs[0].id == meta.id


def test_add_empty_chunks_raises(store):
    with pytest.raises(ValueError):
        store.add_document("vuoto.txt", [])


def test_search_returns_relevant_chunk(store):
    store.add_document("vpn.md", [Chunk(0, "istruzioni per la vpn aziendale")])
    store.add_document("stampante.md", [Chunk(0, "installazione della stampante di rete")])
    hits = store.search("problema con la vpn", top_k=1)
    assert len(hits) == 1
    assert hits[0].filename == "vpn.md"
    assert hits[0].score > 0.9


def test_search_ranks_by_relevance(store):
    store.add_document("vpn.md", [Chunk(0, "vpn e accesso remoto")])
    store.add_document("password.md", [Chunk(0, "reset della password dimenticata")])
    hits = store.search("ho dimenticato la password", top_k=2)
    assert hits[0].filename == "password.md"
    assert hits[0].score >= hits[1].score


def test_search_empty_query(store):
    store.add_document("vpn.md", [Chunk(0, "vpn")])
    assert store.search("   ") == []


def test_delete_document(store):
    meta = store.add_document("vpn.md", [Chunk(0, "vpn"), Chunk(1, "vpn ancora")])
    assert store.delete_document(meta.id) is True
    assert store.list_documents() == []
    assert store.delete_document(meta.id) is False


def test_delete_only_target_document(store):
    a = store.add_document("vpn.md", [Chunk(0, "vpn")])
    b = store.add_document("stampante.md", [Chunk(0, "stampante")])
    store.delete_document(a.id)
    remaining = store.list_documents()
    assert len(remaining) == 1
    assert remaining[0].id == b.id
