"""
Test del loop di function calling del chat_service con un client Gemini fake.

Nessuna rete: il client Gemini è simulato con risposte scriptate e le operazioni
(reset/unlock/search) sono monkeypatchate. Verifichiamo che il loop esegua i tool
richiesti, reinietti i risultati e restituisca la risposta testuale finale, e che
il dispatch instradi al canale "chat".
"""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent))
sys.path.insert(0, str(next(p for p in Path(__file__).resolve().parents if (p / ".env.example").is_file())))

import pytest
from google.genai import types

import agent
from shared import operations


# ── Fake del client Gemini ───────────────────────────────────────────────────

class _FakeFunctionCall:
    def __init__(self, name, args):
        self.name = name
        self.args = args


class _FakeCandidate:
    def __init__(self, content):
        self.content = content


class _FakeResponse:
    def __init__(self, *, text=None, function_calls=None):
        self.text = text
        self.function_calls = function_calls or []
        role = "model"
        parts = [types.Part(text=text)] if text else [types.Part(text="")]
        self.candidates = [_FakeCandidate(types.Content(role=role, parts=parts))]


class _FakeModels:
    def __init__(self, script):
        self._script = script
        self.received_contents = []

    async def generate_content(self, model, contents, config):
        self.received_contents.append(list(contents))
        return self._script.pop(0)


class _FakeClient:
    def __init__(self, script):
        self.aio = type("Aio", (), {"models": _FakeModels(script)})()


@pytest.fixture(autouse=True)
def fake_client(monkeypatch):
    """Sostituisce il client Gemini; ogni test imposta il proprio script."""
    holder = {}

    def _install(script):
        client = _FakeClient(script)
        monkeypatch.setattr(agent, "_get_client", lambda: client)
        holder["client"] = client
        return client

    return _install


@pytest.mark.asyncio
async def test_text_only_reply(fake_client):
    fake_client([_FakeResponse(text="Ciao! Come posso aiutarti?")])
    reply, history = await agent.generate_reply([], "ciao")
    assert reply == "Ciao! Come posso aiutarti?"
    # user + model = 2 turni
    assert len(history) == 2
    assert history[0].role == "user"


@pytest.mark.asyncio
async def test_tool_call_then_text(fake_client, monkeypatch):
    calls = {}

    async def fake_reset(identifier, channel):
        calls["identifier"] = identifier
        calls["channel"] = channel
        return {"found": True, "success": True, "message": "Password resettata."}

    monkeypatch.setattr(operations, "reset_password", fake_reset)

    fake_client([
        _FakeResponse(function_calls=[_FakeFunctionCall("reset_user_password", {"username": "mario.rossi"})]),
        _FakeResponse(text="Fatto, riceverai una email con la password temporanea."),
    ])

    reply, history = await agent.generate_reply([], "resetta la password di mario.rossi")

    assert "email" in reply.lower()
    assert calls["identifier"] == "mario.rossi"
    assert calls["channel"] == "chat"  # il canale chat, non voice
    # user, model(call), tool-response, model(text) = 4 turni
    assert len(history) == 4
    # il terzo turno è la risposta del tool
    assert history[2].parts[0].function_response is not None


@pytest.mark.asyncio
async def test_dispatch_routes_to_chat_channel(monkeypatch):
    seen = {}

    async def fake_unlock(username, full_name, channel):
        seen["args"] = (username, full_name, channel)
        return {"success": True, "message": "ok"}

    monkeypatch.setattr(operations, "unlock_account", fake_unlock)
    result = await agent._dispatch("unlock_account", {"username": "luca.neri", "full_name": "Luca Neri"})
    assert result["success"] is True
    assert seen["args"] == ("luca.neri", "Luca Neri", "chat")


@pytest.mark.asyncio
async def test_dispatch_unknown_tool():
    result = await agent._dispatch("non_esiste", {})
    assert "error" in result
