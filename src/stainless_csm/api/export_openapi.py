"""Write the OpenAPI spec so the web app can generate its TypeScript types from it.

python -m stainless_csm.api.export_openapi apps/web/openapi.json
"""

import json
import sys
from pathlib import Path

from stainless_csm.api.main import create_app


def main() -> None:
    spec = create_app().openapi()
    text = json.dumps(spec, indent=2, ensure_ascii=False) + "\n"
    if len(sys.argv) > 1:
        Path(sys.argv[1]).write_text(text, encoding="utf-8")
    else:
        sys.stdout.write(text)


if __name__ == "__main__":
    main()
