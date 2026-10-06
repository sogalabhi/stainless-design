"""The FastAPI application. Run with `stainless-csm-api` or `uvicorn stainless_csm.api.main:app`.

If the web front end has been built (apps/web/dist), it is served from the same address.
"""

import os
from pathlib import Path

from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse
from fastapi.staticfiles import StaticFiles

from stainless_csm import __version__
from stainless_csm.api.routes import router
from stainless_csm.core.errors import CSMError


def web_dist_dir() -> Path:
    override = os.environ.get("STAINLESS_CSM_WEB_DIST")
    if override:
        return Path(override)
    return Path(__file__).resolve().parents[3] / "apps" / "web" / "dist"


async def csm_error_handler(_: Request, error: Exception) -> JSONResponse:
    """Every domain error becomes a clear 422 message, never a traceback."""
    return JSONResponse(
        status_code=422,
        content={"detail": str(error), "error_type": type(error).__name__},
    )


def create_app() -> FastAPI:
    app = FastAPI(
        title="Stainless CSM",
        version=__version__,
        description="Continuous Strength Method, EN 1993-1-4:2025 Annex B.",
    )
    app.add_exception_handler(CSMError, csm_error_handler)
    app.include_router(router)
    dist = web_dist_dir()
    if dist.is_dir():
        app.mount("/", StaticFiles(directory=dist, html=True), name="web")
    return app


app = create_app()


DEFAULT_PORT = 8100  # 8000 is commonly taken by other dev servers


def run() -> None:
    import uvicorn

    port = int(os.environ.get("STAINLESS_CSM_PORT", DEFAULT_PORT))
    uvicorn.run("stainless_csm.api.main:app", host="127.0.0.1", port=port)
