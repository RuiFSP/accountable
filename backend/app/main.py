"""The app: the routes for the copy the settings name, and how it is served."""

from __future__ import annotations

from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import Depends, FastAPI, Request, Response
from fastapi.responses import FileResponse, JSONResponse

from app import auth, db
from app.routes import activities, contacts, dashboard, deals, organizations, search
from app.settings import Settings, load_settings

# The built frontend, which only the shared copy serves; the local copy runs
# it through Vite on its own address.
FRONTEND_DIST = Path(__file__).resolve().parent.parent.parent / "frontend" / "dist"


def create_app(settings: Settings | None = None) -> FastAPI:
    """Build Accountable for these settings: this machine's copy or the shared one."""
    chosen = load_settings() if settings is None else settings

    @asynccontextmanager
    async def lifespan(_: FastAPI):
        db.prepare()
        yield

    app = FastAPI(title="Accountable API", lifespan=lifespan)
    app.state.settings = chosen
    app.state.keys = None

    guard = [Depends(auth.current_user)]
    app.include_router(organizations.router, dependencies=guard)
    app.include_router(contacts.router, dependencies=guard)
    app.include_router(deals.router, dependencies=guard)
    app.include_router(activities.router, dependencies=guard)
    app.include_router(dashboard.router, dependencies=guard)
    app.include_router(search.router, dependencies=guard)

    if chosen.mode == "shared":
        # The shared copy is only built with its settings, so the URL is there.
        assert chosen.supabase_url is not None
        app.state.keys = auth.KeyStore(chosen.supabase_url)
        _serve_frontend(app)
    else:
        app.include_router(auth.local)
    return app


def _serve_frontend(app: FastAPI) -> None:
    """The built frontend: its files, the page for any other address, and a
    JSON 404 for anything under /api that no route claimed."""

    @app.api_route(
        "/{full_path:path}",
        methods=["GET", "POST", "PUT", "PATCH", "DELETE"],
        include_in_schema=False,
    )
    def page(full_path: str, request: Request) -> Response:
        if full_path == "api" or full_path.startswith("api/"):
            return JSONResponse({"detail": "Not Found"}, status_code=404)
        if request.method != "GET":
            return JSONResponse({"detail": "Method Not Allowed"}, status_code=405)
        built = _built_file(full_path)
        if built is not None:
            return FileResponse(built)
        index = FRONTEND_DIST / "index.html"
        if index.is_file():
            return FileResponse(index)
        return JSONResponse({"detail": "Not Found"}, status_code=404)


def _built_file(address: str) -> Path | None:
    """The built file an address names, or None when it isn't in the folder."""
    root = FRONTEND_DIST.resolve()
    candidate = (root / address).resolve()
    if not candidate.is_relative_to(root):
        return None
    return candidate if candidate.is_file() else None


app = create_app()
