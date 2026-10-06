#!/bin/sh
# Regenerate the TypeScript types from the FastAPI OpenAPI spec.
# Usage (from apps/web):  PYTHON=../../.venv/bin/python npm run gen:api
set -e
"${PYTHON:-python}" -m stainless_csm.api.export_openapi openapi.json
# --default-non-nullable false: request fields that have defaults stay optional
npx openapi-typescript openapi.json -o src/api/schema.d.ts --default-non-nullable false
