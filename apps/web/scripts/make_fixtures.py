"""Write realistic API responses for the web tests, straight from the real API.

.venv/bin/python apps/web/scripts/make_fixtures.py
"""

import json
from pathlib import Path

from fastapi.testclient import TestClient

from stainless_csm.api.main import create_app

OUT = Path(__file__).resolve().parents[1] / "src" / "test" / "fixtures"
client = TestClient(create_app())


def write(name: str, data: object) -> None:
    (OUT / f"{name}.json").write_text(json.dumps(data, ensure_ascii=False) + "\n", encoding="utf-8")


def main() -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    write("grades", client.get("/api/v1/grades").json())
    material = {"designation": "1.4307", "elastic_modulus": 200000}
    write(
        "material",
        client.post("/api/v1/material-model", json={"material": material}).json(),
    )
    tension = {"area": 1000, "section_type": "I-section", "has_holes": False}
    write(
        "tension",
        client.post("/api/v1/tension", json={"material": material, "tension": tension}).json(),
    )
    write(
        "deformation",
        client.post(
            "/api/v1/deformation-capacity",
            json={
                "material": material,
                "geometry": {"kind": "welded_i", "b": 150, "tf": 10, "hw": 300, "tw": 6},
                "omega": 15,
            },
        ).json(),
    )
    write(
        "deformation_not_allowed",
        client.post(
            "/api/v1/deformation-capacity",
            json={
                "material": material,
                "geometry": {"kind": "rhs", "b": 400, "h": 400, "t": 2},
                "omega": 15,
            },
        ).json(),
    )
    write(
        "tension_holes_error",
        client.post(
            "/api/v1/tension",
            json={"material": material, "tension": {**tension, "has_holes": True}},
        ).json(),
    )


if __name__ == "__main__":
    main()
