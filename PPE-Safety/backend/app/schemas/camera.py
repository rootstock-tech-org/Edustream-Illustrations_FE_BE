from pydantic import BaseModel

class CameraSource(BaseModel):
    source: str