import pytest
from matplotlib.figure import Figure

from helpers import GAMMA_M0, grade_material
from stainless_csm.core.enums import SectionType
from stainless_csm.csm.tension import CSMTension, TensionInput, TensionResult
from stainless_csm.material_models.csm_bilinear import CSMBilinearModel
from stainless_csm.ui.plots import (
    draw_stress_strain,
)
from stainless_csm.ui.theme import DARK, LIGHT


def model_for(designation: str) -> CSMBilinearModel:
    return CSMBilinearModel(grade_material(designation))


def tension_for(model: CSMBilinearModel) -> TensionResult:
    data = TensionInput(model, 1000.0, SectionType.I_SECTION, GAMMA_M0)
    return CSMTension(data).calculate()


def line_by_label(fig: Figure, label: str):  # type: ignore[no-untyped-def]
    return next(line for line in fig.axes[0].get_lines() if line.get_label() == label)


@pytest.mark.parametrize("theme", [LIGHT, DARK])
@pytest.mark.parametrize("schematic", [True, False])
@pytest.mark.parametrize("designation", ["1.4307", "1.4003", "1.4462"])
def test_material_figure_draws_both_curves(designation: str, schematic: bool, theme) -> None:  # type: ignore[no-untyped-def]
    model = model_for(designation)
    fig = Figure()
    draw_stress_strain(fig, model, schematic, theme)
    csm = line_by_label(fig, "CSM bilinear (B.4)")
    ys = list(csm.get_ydata())
    assert ys[0] == 0.0
    assert ys[1] == pytest.approx(model.material.fy)
    assert ys[-1] == pytest.approx(model.material.fu)
    line_by_label(fig, "Elastic–perfectly plastic (classic)")
    xlabel = fig.axes[0].get_xlabel()
    assert ("not to scale" in xlabel) is schematic


def test_true_scale_uses_real_strains() -> None:
    model = model_for("1.4307")
    fig = Figure()
    draw_stress_strain(fig, model, False, LIGHT)
    xs = list(line_by_label(fig, "CSM bilinear (B.4)").get_xdata())
    assert xs[-1] == pytest.approx(model.strain_end)


def test_redrawing_replaces_the_previous_figure() -> None:
    fig = Figure()
    model = model_for("1.4307")
    draw_stress_strain(fig, model, True, LIGHT)
    draw_stress_strain(fig, model, True, LIGHT, tension_for(model))
    assert len(fig.axes) == 1


@pytest.mark.parametrize("schematic", [True, False])
@pytest.mark.parametrize("designation", ["1.4307", "1.4003", "1.4462"])
def test_tension_figure_marks_the_governing_cap(designation: str, schematic: bool) -> None:
    model = model_for(designation)
    result = tension_for(model)
    fig = Figure()
    draw_stress_strain(fig, model, schematic, LIGHT, result)
    marker = line_by_label(fig, "Tension limit ε_csm,t")
    assert next(iter(marker.get_ydata())) == pytest.approx(result.design_stress)
    texts = [t.get_text() for t in fig.axes[0].texts]
    assert sum("governs" in t and "not governing" not in t for t in texts) == 1
