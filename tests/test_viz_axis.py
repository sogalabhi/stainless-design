import pytest

from stainless_csm.viz.axis import StrainAxis


def test_schematic_axis_spaces_knots_evenly() -> None:
    axis = StrainAxis.build([(0.0, "0"), (0.001, "a"), (0.05, "b"), (0.09, "c")], schematic=True)
    assert [axis.x(s) for s in (0.0, 0.001, 0.05, 0.09)] == pytest.approx([0, 1, 2, 3])
    assert axis.x(0.0255) == pytest.approx(1.5)  # linear between knots


def test_true_scale_axis_is_identity() -> None:
    axis = StrainAxis.build([(0.0, "0"), (0.09, "c")], schematic=False)
    assert axis.x(0.0123) == 0.0123


def test_axis_merges_coincident_knots() -> None:
    axis = StrainAxis.build(
        [(0.0, "0"), (0.0158, "15ε_y"), (0.0158 * (1 + 1e-12), "ε_csm,t")], True
    )
    assert len(axis.strains) == 2
    assert axis.labels[1] == "15ε_y = ε_csm,t"
