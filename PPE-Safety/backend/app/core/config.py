from pathlib import Path

BASE_DIR = Path(__file__).resolve().parents[2]

STORAGE_DIR = BASE_DIR / "storage"

# Weights trained for this project. Resolved from the package root rather than
# the working directory, so a module loads its model wherever uvicorn is
# started from.
MODELS_DIR = BASE_DIR / "models"

SNAPSHOTS_DIR = STORAGE_DIR / "snapshots"
UPLOADS_DIR = STORAGE_DIR / "uploads"
RECORDINGS_DIR = STORAGE_DIR / "recordings"
EXPORTS_DIR = STORAGE_DIR / "exports"
TEMP_DIR = STORAGE_DIR / "temp"


def create_storage_dirs():
    directories = [
        STORAGE_DIR,
        SNAPSHOTS_DIR,
        UPLOADS_DIR,
        RECORDINGS_DIR,
        EXPORTS_DIR,
        TEMP_DIR,
    ]

    for directory in directories:
        directory.mkdir(parents=True, exist_ok=True)