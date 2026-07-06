"""
Store vettoriale della knowledge base su Qdrant.

Qdrant è l'unica fonte di verità: ogni chunk è un punto con payload
denormalizzato (doc_id, filename, testo, metadati del documento). L'elenco dei
documenti si ricava raggruppando i punti per doc_id — nessun registro separato
da tenere sincronizzato.

La funzione di embedding è iniettata dall'esterno: in produzione è quella di
Gemini, nei test una fake deterministica. Lo store non conosce il provider.
"""
from __future__ import annotations

import uuid
from collections.abc import Callable
from dataclasses import dataclass, field
from datetime import datetime, timezone

from qdrant_client import QdrantClient, models

from chunker import Chunk, OVERLAP_WORDS

EmbedFn = Callable[[list[str], str], list[list[float]]]


@dataclass(frozen=True)
class DocumentMeta:
    id: str
    filename: str
    chunk_count: int
    uploaded_at: str


@dataclass(frozen=True)
class SearchHit:
    doc_id: str
    filename: str
    chunk_index: int
    text: str
    score: float


@dataclass
class KnowledgeStore:
    """Wrapper su Qdrant per indicizzare, cercare ed eliminare documenti."""

    embed_fn: EmbedFn
    dim: int
    path: str | None = None
    url: str | None = None
    collection: str = "knowledge"
    _client: QdrantClient = field(init=False)

    def __post_init__(self) -> None:
        if self.url:
            self._client = QdrantClient(url=self.url)
        elif self.path:
            self._client = QdrantClient(path=self.path)
        else:
            self._client = QdrantClient(location=":memory:")
        self._ensure_collection()

    def _ensure_collection(self) -> None:
        if not self._client.collection_exists(self.collection):
            self._client.create_collection(
                self.collection,
                vectors_config=models.VectorParams(size=self.dim, distance=models.Distance.COSINE),
            )

    # ── Scrittura ──────────────────────────────────────────────────────────

    def add_document(self, filename: str, chunks: list[Chunk]) -> DocumentMeta:
        """Indicizza i chunk di un documento e ne restituisce i metadati.

        Solleva ValueError se il documento non contiene testo indicizzabile.
        """
        if not chunks:
            raise ValueError("Nessun contenuto testuale da indicizzare nel documento.")

        doc_id = uuid.uuid4().hex
        uploaded_at = datetime.now(timezone.utc).isoformat()
        vectors = self.embed_fn([c.text for c in chunks], "RETRIEVAL_DOCUMENT")

        points = [
            models.PointStruct(
                id=uuid.uuid4().hex,
                vector=vector,
                payload={
                    "doc_id": doc_id,
                    "filename": filename,
                    "chunk_index": chunk.index,
                    "chunk_count": len(chunks),
                    "uploaded_at": uploaded_at,
                    "text": chunk.text,
                },
            )
            for chunk, vector in zip(chunks, vectors)
        ]
        self._client.upsert(self.collection, points=points)
        return DocumentMeta(id=doc_id, filename=filename, chunk_count=len(chunks), uploaded_at=uploaded_at)

    def delete_document(self, doc_id: str) -> bool:
        """Elimina tutti i chunk di un documento. True se esisteva."""
        existed = any(d.id == doc_id for d in self.list_documents())
        if not existed:
            return False
        self._client.delete(
            self.collection,
            points_selector=models.FilterSelector(
                filter=models.Filter(
                    must=[models.FieldCondition(key="doc_id", match=models.MatchValue(value=doc_id))]
                )
            ),
        )
        return True

    # ── Lettura ────────────────────────────────────────────────────────────

    def list_documents(self) -> list[DocumentMeta]:
        """Elenca i documenti indicizzati, dal più recente, raggruppando i chunk."""
        docs: dict[str, DocumentMeta] = {}
        offset = None
        while True:
            records, offset = self._client.scroll(
                self.collection,
                limit=256,
                offset=offset,
                with_payload=True,
                with_vectors=False,
            )
            for rec in records:
                p = rec.payload or {}
                doc_id = p.get("doc_id")
                if doc_id and doc_id not in docs:
                    docs[doc_id] = DocumentMeta(
                        id=doc_id,
                        filename=p.get("filename", "(sconosciuto)"),
                        chunk_count=p.get("chunk_count", 0),
                        uploaded_at=p.get("uploaded_at", ""),
                    )
            if offset is None:
                break
        return sorted(docs.values(), key=lambda d: d.uploaded_at, reverse=True)

    def document_content(self, doc_id: str) -> tuple[str, str] | None:
        """Ricostruisce (filename, testo) di un documento dai suoi chunk.

        I chunk hanno una sovrapposizione di OVERLAP_WORDS parole: per ricomporre
        il testo si prende il primo chunk intero e, dai successivi, si scartano le
        prime OVERLAP_WORDS parole (già presenti nel chunk precedente).
        """
        payloads: list[dict] = []
        offset = None
        while True:
            recs, offset = self._client.scroll(
                self.collection,
                limit=256,
                offset=offset,
                with_payload=True,
                with_vectors=False,
                scroll_filter=models.Filter(
                    must=[models.FieldCondition(key="doc_id", match=models.MatchValue(value=doc_id))]
                ),
            )
            payloads.extend(r.payload or {} for r in recs)
            if offset is None:
                break
        if not payloads:
            return None
        ordered = sorted(payloads, key=lambda p: p.get("chunk_index", 0))
        words: list[str] = []
        for i, p in enumerate(ordered):
            w = p.get("text", "").split()
            words.extend(w if i == 0 else w[OVERLAP_WORDS:])
        return ordered[0].get("filename", "(sconosciuto)"), " ".join(words)

    def search(self, query: str, top_k: int = 3) -> list[SearchHit]:
        """Restituisce i chunk più rilevanti per la query, ordinati per score."""
        if not query.strip():
            return []
        vector = self.embed_fn([query], "RETRIEVAL_QUERY")[0]
        hits = self._client.query_points(
            self.collection, query=vector, limit=top_k, with_payload=True
        ).points
        results: list[SearchHit] = []
        for h in hits:
            p = h.payload or {}
            results.append(
                SearchHit(
                    doc_id=p.get("doc_id", ""),
                    filename=p.get("filename", "(sconosciuto)"),
                    chunk_index=p.get("chunk_index", 0),
                    text=p.get("text", ""),
                    score=h.score,
                )
            )
        return results
