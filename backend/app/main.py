from fastapi import APIRouter, FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api import auth, dashboard, geo, projects, roles, users
from app.core.config import get_settings

app = FastAPI(title="SBI Foundation Project MIS", version="0.1.0",
              docs_url="/api/docs", openapi_url="/api/openapi.json")
app.add_middleware(CORSMiddleware, allow_origins=get_settings().cors_origins.split(","),
                   allow_credentials=True, allow_methods=["*"], allow_headers=["*"])

api = APIRouter(prefix="/api/v1")
for r in (auth.router, geo.router, projects.router, users.router, roles.router, dashboard.router):
    api.include_router(r)
app.include_router(api)


@app.get("/api/health")
def health():
    return {"status": "ok"}
