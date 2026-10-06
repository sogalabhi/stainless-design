"""Vercel serverless entry point: exposes the FastAPI app as `app`.

Vercel runs this file as the function behind /api/*. `src/` is added to the path because the
package is not installed there.
"""

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "src"))

from stainless_csm.api.main import app

__all__ = ["app"]
