import pytest

from stainless_csm.core.trace import CalcStep, CalcTrace


def make_step(symbol: str = "ε_y") -> CalcStep:
    return CalcStep(
        symbol, "elastic strain at yield", "B.4", "f_y / E", "210 / 200000", 0.00105, "–"
    )


def test_steps_keep_insertion_order() -> None:
    trace = CalcTrace()
    trace.add(make_step("a"))
    trace.add(make_step("b"))
    assert [s.symbol for s in trace.steps] == ["a", "b"]
    assert len(trace) == 2


def test_get_returns_step_by_symbol() -> None:
    trace = CalcTrace([make_step("ε_y")])
    assert trace.get("ε_y").value == 0.00105


def test_get_unknown_symbol_raises() -> None:
    with pytest.raises(KeyError):
        CalcTrace().get("nope")


def test_duplicate_symbol_rejected() -> None:
    trace = CalcTrace([make_step()])
    with pytest.raises(ValueError):
        trace.add(make_step())


def test_step_is_immutable() -> None:
    with pytest.raises(AttributeError):
        make_step().value = 1.0  # type: ignore[misc]


def test_steps_view_is_read_only() -> None:
    trace = CalcTrace([make_step()])
    assert isinstance(trace.steps, tuple)
