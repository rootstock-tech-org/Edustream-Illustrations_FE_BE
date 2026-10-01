from unittest.mock import MagicMock, patch

import httpx
import pytest
from groq import APIConnectionError, APIStatusError, APITimeoutError

from app.core.config import Settings
from app.domain.prompt.groq_client import (
    GroqConfigError,
    GroqProviderError,
    GroqTimeoutError,
    request_vlsi_intent,
)

_DUMMY_REQUEST = httpx.Request("POST", "https://api.groq.com/openai/v1/chat/completions")


def _settings(api_key: str | None = "test-key") -> Settings:
    return Settings(groq_api_key=api_key, groq_model="test-model", groq_timeout_seconds=5.0)


def test_missing_api_key_raises_config_error_before_any_network_call() -> None:
    with patch("app.domain.prompt.groq_client.get_settings", return_value=_settings(api_key=None)):
        with patch("app.domain.prompt.groq_client.Groq") as fake_groq_class:
            with pytest.raises(GroqConfigError):
                request_vlsi_intent("anything")
            fake_groq_class.assert_not_called()


def test_successful_response_returns_parsed_json() -> None:
    fake_message = MagicMock(content='{"circuit_name": "X", "components": [], "connections": []}')
    fake_response = MagicMock(choices=[MagicMock(message=fake_message)])
    fake_client = MagicMock()
    fake_client.chat.completions.create.return_value = fake_response

    with patch("app.domain.prompt.groq_client.get_settings", return_value=_settings()):
        with patch("app.domain.prompt.groq_client.Groq", return_value=fake_client):
            result = request_vlsi_intent("design an AND gate")

    assert result == {"circuit_name": "X", "components": [], "connections": []}


def test_sdk_timeout_converted_to_groq_timeout_error() -> None:
    fake_client = MagicMock()
    fake_client.chat.completions.create.side_effect = APITimeoutError(request=_DUMMY_REQUEST)

    with patch("app.domain.prompt.groq_client.get_settings", return_value=_settings()):
        with patch("app.domain.prompt.groq_client.Groq", return_value=fake_client):
            with pytest.raises(GroqTimeoutError):
                request_vlsi_intent("anything")


def test_sdk_connection_error_converted_to_provider_error() -> None:
    fake_client = MagicMock()
    fake_client.chat.completions.create.side_effect = APIConnectionError(request=_DUMMY_REQUEST)

    with patch("app.domain.prompt.groq_client.get_settings", return_value=_settings()):
        with patch("app.domain.prompt.groq_client.Groq", return_value=fake_client):
            with pytest.raises(GroqProviderError):
                request_vlsi_intent("anything")


def test_sdk_status_error_converted_to_provider_error() -> None:
    dummy_response = httpx.Response(status_code=500, request=_DUMMY_REQUEST)
    fake_client = MagicMock()
    fake_client.chat.completions.create.side_effect = APIStatusError(
        "server error", response=dummy_response, body=None
    )

    with patch("app.domain.prompt.groq_client.get_settings", return_value=_settings()):
        with patch("app.domain.prompt.groq_client.Groq", return_value=fake_client):
            with pytest.raises(GroqProviderError):
                request_vlsi_intent("anything")


def test_non_json_content_raises_provider_error() -> None:
    fake_message = MagicMock(content="not valid json at all")
    fake_response = MagicMock(choices=[MagicMock(message=fake_message)])
    fake_client = MagicMock()
    fake_client.chat.completions.create.return_value = fake_response

    with patch("app.domain.prompt.groq_client.get_settings", return_value=_settings()):
        with patch("app.domain.prompt.groq_client.Groq", return_value=fake_client):
            with pytest.raises(GroqProviderError):
                request_vlsi_intent("anything")


def test_empty_content_raises_provider_error() -> None:
    fake_message = MagicMock(content=None)
    fake_response = MagicMock(choices=[MagicMock(message=fake_message)])
    fake_client = MagicMock()
    fake_client.chat.completions.create.return_value = fake_response

    with patch("app.domain.prompt.groq_client.get_settings", return_value=_settings()):
        with patch("app.domain.prompt.groq_client.Groq", return_value=fake_client):
            with pytest.raises(GroqProviderError):
                request_vlsi_intent("anything")
