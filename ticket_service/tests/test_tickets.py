"""
Test del ticket_service: numerazione INC, CRUD, filtri, PATCH e persistenza.

Configura un file tickets.json isolato e la API key PRIMA di importare `main`.
"""
import importlib
import os
import sys
import tempfile
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent))
sys.path.insert(0, str(Path(__file__).parent.parent.parent))

_TMP = Path(tempfile.gettempdir()) / "aria_test_tickets.json"
_TMP.unlink(missing_ok=True)
os.environ["TICKETS_DB_PATH"] = str(_TMP)
os.environ["INTERNAL_API_KEY"] = "test-key-tickets"

import pytest
from fastapi.testclient import TestClient

import main

AUTH = {"X-Internal-Api-Key": "test-key-tickets"}


@pytest.fixture
def client():
    _TMP.unlink(missing_ok=True)
    importlib.reload(main)
    return TestClient(main.app)


def _create(client, **kw):
    body = {"channel": "voice", "subject": "VPN non funziona", "description": "Errore 800", **kw}
    return client.post("/tickets", headers=AUTH, json=body)


def test_requires_api_key(client):
    assert client.get("/tickets").status_code == 401


def test_create_assigns_incrementing_numbers(client):
    r1 = _create(client)
    r2 = _create(client, subject="Altro problema")
    assert r1.status_code == 201
    assert r1.json()["number"] == "INC0001001"
    assert r2.json()["number"] == "INC0001002"
    assert r1.json()["status"] == "new"


def test_list_and_filter(client):
    _create(client, caller="mario.rossi")
    _create(client, caller="giulia.bianchi", channel="chat")
    all_t = client.get("/tickets", headers=AUTH).json()
    assert len(all_t) == 2
    mario = client.get("/tickets?caller=mario.rossi", headers=AUTH).json()
    assert len(mario) == 1 and mario[0]["caller"] == "mario.rossi"
    news = client.get("/tickets?status=new", headers=AUTH).json()
    assert len(news) == 2


def test_get_by_number_and_404(client):
    num = _create(client).json()["number"]
    assert client.get(f"/tickets/{num}", headers=AUTH).json()["number"] == num
    assert client.get("/tickets/INC9999999", headers=AUTH).status_code == 404


def test_patch_status_and_note(client):
    num = _create(client).json()["number"]
    r = client.patch(f"/tickets/{num}", headers=AUTH,
                     json={"status": "in_progress", "note": "Preso in carico", "author": "operatore"})
    assert r.status_code == 200
    t = r.json()
    assert t["status"] == "in_progress"
    assert len(t["notes"]) == 1
    assert t["notes"][0]["text"] == "Preso in carico"


def test_persistence_across_reload(client):
    num = _create(client).json()["number"]
    # ricarica il modulo: deve rileggere da tickets.json e continuare la numerazione
    importlib.reload(main)
    c2 = TestClient(main.app)
    assert c2.get(f"/tickets/{num}", headers=AUTH).status_code == 200
    # il prossimo numero non riparte da 1001
    nxt = _create(c2).json()["number"]
    assert nxt == "INC0001002"
