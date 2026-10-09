
from fastapi.testclient import TestClient

from stainless_csm.api.main import create_app
from stainless_csm.input_help import IN_STANDARD_PREFIX, OUTSIDE_STANDARD, load_input_help

client = TestClient(create_app())

# Every field key the dock and the geometry window render (plan.md section 4e). The three plate
# fields (flat width, thickness, k_sigma) are one entry each, matched by suffix on the website.
DOCK_KEYS = {
    "grade", "fy", "fu", "family", "E", "enhanced",
    "sectionType", "fabrication",
    "h", "b", "tw", "tf", "t", "r", "s", "rO", "d", "cStem",
    "area", "gammaM0", "hasHoles",
    "route", "nu", "omega", "sigmaCr",
    "kSigma", "plateWidth", "plateThickness",
}  # fmt: skip

PARTS = ("what", "why", "where", "source")
MAX_PART = 200


def test_every_dock_field_has_an_entry_and_nothing_else_does() -> None:
    keys = [e.key for e in load_input_help()]
    assert len(keys) == len(set(keys))
    assert set(keys) == DOCK_KEYS


def test_every_part_is_filled_and_short() -> None:
    for entry in load_input_help():
        assert entry.name, entry.key
        for part in PARTS:
            text = getattr(entry, part)
            assert text.strip(), (entry.key, part)
            assert len(text) <= MAX_PART, (entry.key, part, len(text))
            assert "\n" not in text, (entry.key, part)


def test_every_entry_carries_one_of_the_two_source_tags() -> None:
    for entry in load_input_help():
        inside = entry.source.startswith(IN_STANDARD_PREFIX) and entry.source.endswith(")")
        assert inside or entry.source == OUTSIDE_STANDARD, entry.key
        assert entry.in_standard is inside, entry.key


def test_values_quoted_from_the_standard_sit_on_the_right_entries() -> None:
    by_key = {e.key: e for e in load_input_help()}

    def mentions(key: str) -> str:
        e = by_key[key]
        return f"{e.what} {e.why} {e.where}"

    assert "200 000" in mentions("E") and by_key["E"].source == "In EN 1993-1-4 (5.1.5)"
    assert "0.3" in mentions("nu") and by_key["nu"].source == "In EN 1993-1-4 (5.1.5)"
    assert "1.10" in mentions("gammaM0") and "8.1 NOTE" in by_key["gammaM0"].source
    # no other entry quotes a value of its own
    for key, entry in by_key.items():
        text = f"{entry.what} {entry.why} {entry.where}"
        if key != "E":
            assert "200 000" not in text, key
        if key != "nu":
            assert "0.3" not in text, key
        if key != "gammaM0":
            assert "1.10" not in text, key


def test_what_the_facts_say_about_the_inputs_outside_annex_b() -> None:
    by_key = {e.key: e for e in load_input_help()}
    assert by_key["omega"].source == OUTSIDE_STANDARD and "7.4.3.5" in by_key["omega"].where
    assert by_key["kSigma"].source == OUTSIDE_STANDARD and "6.4.1" in by_key["kSigma"].where
    assert by_key["sigmaCr"].source == OUTSIDE_STANDARD and "B.5.2(2)" in by_key["sigmaCr"].where
    assert "B.6.1(2)" in by_key["hasHoles"].where and "8.1.2" in by_key["hasHoles"].where
    assert "5.1.2.3" in by_key["fy"].where and "B.3(3)" in by_key["fy"].where
    assert "B.2" in by_key["sectionType"].why
    assert by_key["cStem"].source == OUTSIDE_STANDARD


def test_api_serves_the_help() -> None:
    response = client.get("/api/v1/input-help")
    assert response.status_code == 200
    body = response.json()
    assert {item["key"] for item in body} == DOCK_KEYS
    entry = next(item for item in body if item["key"] == "gammaM0")
    assert set(entry) == {"key", "name", "what", "why", "where", "source", "in_standard"}
    assert entry["in_standard"] is True
    omega = next(item for item in body if item["key"] == "omega")
    assert omega["in_standard"] is False
