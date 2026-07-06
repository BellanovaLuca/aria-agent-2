"""
Test dell'endpoint di sblocco utenza (verifica identità, anti-abuso, stati).

Configura l'ambiente PRIMA di importare `main`: db isolato in tmp, API key di
test, Email Service su porta chiusa (l'invio è best-effort e non deve influire).
"""
import importlib
import os
import sys
import tempfile
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent))
sys.path.insert(0, str(Path(__file__).parent.parent.parent))

_TMP_DB = Path(tempfile.gettempdir()) / "aria_test_unlock_db.json"
_TMP_DB.unlink(missing_ok=True)
os.environ["USER_DB_PATH"] = str(_TMP_DB)
os.environ["INTERNAL_API_KEY"] = "test-key-unlock"
os.environ["EMAIL_SERVICE_URL"] = "http://127.0.0.1:9"  # porta chiusa: send fallisce subito
os.environ["MAX_UNLOCKS_24H"] = "2"

import pytest
from fastapi.testclient import TestClient

import main

AUTH = {"X-Internal-Api-Key": "test-key-unlock"}


@pytest.fixture
def client():
    """TestClient con stato db reinizializzato ai DEMO_USERS per ogni test."""
    _TMP_DB.unlink(missing_ok=True)
    importlib.reload(main)
    return TestClient(main.app)


def test_requires_api_key(client):
    r = client.post("/unlock-account", json={"username": "luca.neri", "full_name": "Luca Neri", "channel": "voice"})
    assert r.status_code == 401


def test_unlock_locked_user_succeeds(client):
    # luca.neri è un DEMO_USER con status "locked"
    r = client.post("/unlock-account", headers=AUTH,
                    json={"username": "luca.neri", "full_name": "Luca Neri", "channel": "email"})
    assert r.status_code == 200
    assert r.json()["success"] is True
    # ora l'utente è attivo
    u = client.get("/users/luca.neri", headers=AUTH).json()
    assert u["status"] == "active"


def test_unlock_wrong_name_is_rejected(client):
    r = client.post("/unlock-account", headers=AUTH,
                    json={"username": "luca.neri", "full_name": "Mario Rossi", "channel": "email"})
    assert r.json()["success"] is False
    assert "identità" in r.json()["message"].lower()
    # resta bloccato
    assert client.get("/users/luca.neri", headers=AUTH).json()["status"] == "locked"


def test_name_match_is_case_and_space_insensitive(client):
    r = client.post("/unlock-account", headers=AUTH,
                    json={"username": "luca.neri", "full_name": "  luca   NERI ", "channel": "email"})
    assert r.json()["success"] is True


def test_unlock_unknown_user(client):
    r = client.post("/unlock-account", headers=AUTH,
                    json={"username": "inesistente", "full_name": "Chi Sa", "channel": "email"})
    assert r.json()["success"] is False
    assert "non trovato" in r.json()["message"].lower()


def test_already_active_user(client):
    r = client.post("/unlock-account", headers=AUTH,
                    json={"username": "mario.rossi", "full_name": "Mario Rossi", "channel": "email"})
    assert r.json()["success"] is False
    assert "già attivo" in r.json()["message"].lower()


def test_anti_abuse_blocks_after_threshold(client):
    """Dopo 2 sblocchi riusciti in 24h, il terzo è rifiutato."""
    payload = {"username": "luca.neri", "full_name": "Luca Neri", "channel": "email"}
    # 1° sblocco riuscito
    assert client.post("/unlock-account", headers=AUTH, json=payload).json()["success"] is True
    # riblocco via PUT per poter ritentare
    client.put("/users/luca.neri", headers=AUTH, json={"status": "locked"})
    # 2° sblocco riuscito
    assert client.post("/unlock-account", headers=AUTH, json=payload).json()["success"] is True
    client.put("/users/luca.neri", headers=AUTH, json={"status": "locked"})
    # 3° tentativo: bloccato dall'anti-abuso
    r3 = client.post("/unlock-account", headers=AUTH, json=payload)
    assert r3.json()["success"] is False
    assert "troppi sblocchi" in r3.json()["message"].lower()


def test_unlock_recorded_in_history_with_operation(client):
    client.post("/unlock-account", headers=AUTH,
                json={"username": "luca.neri", "full_name": "Luca Neri", "channel": "email"})
    history = client.get("/reset-history", headers=AUTH).json()
    unlocks = [e for e in history if e["operation"] == "unlock"]
    assert len(unlocks) == 1
    assert unlocks[0]["success"] is True


def test_voice_channel_unlock_succeeds_even_if_email_down(client):
    """Il canale email è best-effort: lo sblocco riesce anche se l'invio fallisce."""
    r = client.post("/unlock-account", headers=AUTH,
                    json={"username": "luca.neri", "full_name": "Luca Neri", "channel": "voice"})
    assert r.status_code == 200
    assert r.json()["success"] is True
