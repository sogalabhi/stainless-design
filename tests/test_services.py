import pytest

from helpers import GAMMA_M0, E
from stainless_csm import services as c
from stainless_csm.core.enums import SectionType, StainlessFamily
from stainless_csm.core.errors import CSMError, NotApplicableError
from stainless_csm.material_models.csm_bilinear import CSMBilinearModel


def model(designation: str = "1.4307") -> CSMBilinearModel:
    return CSMBilinearModel(c.build_material(c.MaterialForm(designation, E)))


def test_grade_choice_builds_material_from_table() -> None:
    m = c.build_material(c.MaterialForm("1.4462", E))
    assert (m.family, m.fy, m.fu) == (StainlessFamily.DUPLEX, 450, 650)
    assert m.source == "Table 5.1 – 1.4462"


def test_custom_material_and_enhanced_source() -> None:
    form = c.MaterialForm(None, E, StainlessFamily.AUSTENITIC, 260, 540, enhanced=True)
    assert c.build_material(form).source == "user-enhanced (cold-formed)"
    assert c.build_material(c.MaterialForm(None, E, fy=260, fu=540)).source == "user-defined"


def test_bad_custom_inputs_raise_csm_error() -> None:
    with pytest.raises(CSMError):
        c.build_material(c.MaterialForm(None, E, fy=500, fu=400))


def test_labels_and_notes() -> None:
    assert c.grade_label("1.4307") == "1.4307 · austenitic · 210/500"
    assert "180" in (c.grade_note("1.4307") or "")
    assert "1.4307" in c.designations()


def test_material_hint_says_which_cap_governs() -> None:
    assert "15 will govern" in c.material_hint(model("1.4307"))
    assert "C₁ε_u/ε_y will govern" in c.material_hint(model("1.4462"))


def test_coefficient_rows_mark_the_selected_family() -> None:
    rows = c.coefficient_rows(StainlessFamily.FERRITIC)
    assert [r.family for r in rows] == ["Austenitic", "Duplex", "Ferritic"]
    assert [r.selected for r in rows] == [False, False, True]
    assert (rows[2].c1, rows[2].c2, rows[2].c3) == ("0.40", "0.45", "0.60")


def test_run_tension_returns_the_b6_1_numbers() -> None:
    result = c.run_tension(model(), c.TensionForm(1000, SectionType.I_SECTION, GAMMA_M0))
    assert result.resistance == pytest.approx(233_145, rel=1e-3)


def test_run_tension_with_holes_is_not_applicable() -> None:
    with pytest.raises(NotApplicableError):
        c.run_tension(model(), c.TensionForm(1000, SectionType.I_SECTION, GAMMA_M0, has_holes=True))
