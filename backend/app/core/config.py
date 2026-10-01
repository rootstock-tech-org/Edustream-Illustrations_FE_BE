from functools import lru_cache
from pathlib import Path

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """Application configuration loaded from environment variables."""

    app_name: str = "VLSI Digital Twin"
    environment: str = "development"
    # Local frontend dev server origins only - no production assumptions
    # baked in. The Tailscale-IP origin is included because this project's
    # actual development workflow runs the frontend dev server on a remote
    # box reached via Tailscale (not literal localhost) from the browser.
    cors_origins: list[str] = [
        "http://localhost:3000",
        "http://127.0.0.1:3000",
        "http://100.127.206.37:3000",
    ]

    # Step 16: Groq LLM provider config for AI prompt-to-intent resolution
    # (app/domain/prompt/groq_client.py). groq_api_key is intentionally
    # Optional - a missing key produces a structured, honest
    # "not configured" failure from /api/prompt/resolve rather than a
    # crash; it is never hardcoded/defaulted to a real value here.
    groq_api_key: str | None = Field(
        default=None,
        description="API key for the Groq LLM provider. Required for POST /api/prompt/resolve to succeed.",
    )
    groq_model: str = Field(
        default="llama-3.3-70b-versatile",
        description="Groq-hosted model used for VLSI intent extraction.",
    )
    groq_timeout_seconds: float = Field(
        default=30.0,
        description="Timeout in seconds for a single Groq API call.",
    )

    # Step 18: real Yosys synthesis (app/domain/synthesis/yosys_runner.py).
    # Defaults to "yosys" (resolved via PATH) - set to an absolute path
    # (e.g. an OSS CAD Suite install not on PATH) when needed. A missing/
    # unusable binary produces a structured "yosys not found" failure from
    # POST /api/synthesis/generate, never a crash or a fabricated result.
    yosys_path: str = Field(
        default="yosys",
        description="Path to the real Yosys executable used for Step 18 synthesis.",
    )
    yosys_timeout_seconds: float = Field(
        default=60.0,
        description="Timeout in seconds for a single real Yosys synthesis run.",
    )

    # Step 19: real physical design via LibreLane + SKY130 + OpenROAD.
    # librelane_binary defaults to "librelane" (resolved via PATH) - set to
    # an absolute path (e.g. an isolated pip venv, since LibreLane is not
    # installed into this project's own backend venv) when needed.
    librelane_binary: str = Field(
        default="librelane",
        description="Path to the real LibreLane CLI executable used for Step 19 physical design.",
    )
    physical_design_timeout_seconds: float = Field(
        default=600.0,
        description="Timeout in seconds for a single real LibreLane physical-design run.",
    )
    physical_design_max_concurrent_jobs: int = Field(
        default=1,
        description="Maximum number of real LibreLane physical-design jobs allowed to run at once.",
    )
    physical_design_work_root: str = Field(
        default_factory=lambda: str(Path.home() / "physical_design_jobs"),
        description=(
            "Root directory for per-job physical-design work directories. Must be "
            "under the user's home directory - LibreLane's --dockerized mode only "
            "mounts $HOME into the container, so a job directory outside it is "
            "invisible to the real LibreLane Docker run."
        ),
    )

    # Step 20 follow-up: real GDS viewer. The real `klayout` Python package
    # is NOT installed in this project's own backend venv (never added -
    # avoids a new backend dependency) - it is already installed, real, and
    # working inside the SAME isolated venv used to invoke LibreLane
    # itself. Empty string (default) means: derive the python3 executable
    # from `librelane_binary`'s own directory at call time (same venv,
    # sibling binary) rather than hardcoding a machine-specific path here.
    gds_reader_python_binary: str = Field(
        default="",
        description=(
            "Path to a Python executable with the real 'klayout' package "
            "installed, used to parse real GDS artifacts for the GDS viewer. "
            "Empty string derives it from librelane_binary's own venv directory."
        ),
    )
    gds_reader_timeout_seconds: float = Field(
        default=30.0,
        description="Timeout in seconds for a single real GDS-parsing subprocess call.",
    )

    model_config = SettingsConfigDict(env_file=".env", extra="ignore")


@lru_cache
def get_settings() -> Settings:
    return Settings()
