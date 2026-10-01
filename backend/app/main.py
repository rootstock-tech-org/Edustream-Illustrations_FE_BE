from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api.health import router as health_router
from app.api.physical import router as physical_router
from app.api.physical_design import router as physical_design_router
from app.api.prompt import router as prompt_router
from app.api.scene import router as scene_router
from app.api.schematic import router as schematic_router
from app.api.simulation import router as simulation_router
from app.api.synthesis import router as synthesis_router
from app.core.config import get_settings

settings = get_settings()

app = FastAPI(title=settings.app_name)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(health_router)
app.include_router(simulation_router)
app.include_router(schematic_router)
app.include_router(physical_router)
app.include_router(scene_router)
app.include_router(prompt_router)
app.include_router(synthesis_router)
app.include_router(physical_design_router)
