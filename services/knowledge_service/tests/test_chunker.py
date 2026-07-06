"""Test unitari del chunker (funzioni pure, nessun I/O)."""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent))

import pytest

from chunker import Chunk, chunk_text, extension_of, extract_text, is_supported


def test_extension_and_support():
    assert extension_of("guida.PDF") == ".pdf"
    assert extension_of("nofile") == ""
    assert is_supported("readme.md")
    assert is_supported("a.txt")
    assert not is_supported("malware.exe")
    assert not is_supported("noext")


def test_extract_txt_normalizes_whitespace():
    raw = "Riga  con   spazi\n\n\n\nmultipli\x00qui".encode("utf-8")
    text = extract_text("nota.txt", raw)
    assert "\x00" not in text
    assert "   " not in text
    assert "\n\n\n" not in text


def test_extract_unsupported_raises():
    with pytest.raises(ValueError):
        extract_text("x.exe", b"data")


def test_chunk_empty_text_returns_empty():
    assert chunk_text("") == []
    assert chunk_text("   \n  ") == []


def test_chunk_short_text_single_chunk():
    chunks = chunk_text("solo tre parole")
    assert len(chunks) == 1
    assert chunks[0] == Chunk(index=0, text="solo tre parole")


def test_chunk_overlap_and_indices():
    words = " ".join(f"w{i}" for i in range(600))
    chunks = chunk_text(words, chunk_words=280, overlap_words=50)
    # 600 parole, step 230 → chunk a 0, 230, 460
    assert [c.index for c in chunks] == [0, 1, 2]
    first = chunks[0].text.split()
    second = chunks[1].text.split()
    # La coda del primo chunk ricompare in testa al secondo (overlap 50)
    assert first[-50:] == second[:50]


def test_chunk_covers_all_words():
    words = " ".join(f"t{i}" for i in range(1000))
    chunks = chunk_text(words, chunk_words=280, overlap_words=50)
    seen = set()
    for c in chunks:
        seen.update(c.text.split())
    assert seen == {f"t{i}" for i in range(1000)}


def test_chunk_invalid_params():
    with pytest.raises(ValueError):
        chunk_text("a b c", chunk_words=0)
    with pytest.raises(ValueError):
        chunk_text("a b c", chunk_words=100, overlap_words=100)
