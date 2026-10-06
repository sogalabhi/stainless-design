"""Drive the real widgets offscreen."""

import pytest
from PySide6.QtWidgets import QApplication

from stainless_csm.ui.main_window import MainWindow


@pytest.fixture(scope="module")
def app() -> QApplication:
    return QApplication.instance() or QApplication([])  # type: ignore[return-value]


@pytest.fixture
def window(app: QApplication) -> MainWindow:
    w = MainWindow()
    w.show()
    app.processEvents()
    return w


def test_opens_with_default_material_and_tension_result(window: MainWindow) -> None:
    material, tension = window.material_page, window.tension_page
    assert material.cards["eps_y"].value_text() == "0.00105"
    assert material.cards["e_sh"].value_text() == "3 160.8"
    assert "15 will govern" in material.hint_label.text()
    assert tension.cards["resistance"].value_text() == "233.1"


def test_table_b1_highlights_the_selected_family(window: MainWindow) -> None:
    table = window.material_page.coefficients
    bold = [table.item(row, 0).font().bold() for row in range(3)]
    assert bold == [True, False, False]  # austenitic selected by default


def test_changing_grade_updates_everything(window: MainWindow) -> None:
    material = window.material_page
    material.grade_box.setCurrentIndex(material.grade_box.findData("1.4462"))
    assert material.cards["eps_y"].value_text() == "0.00225"
    assert "C₁ε_u/ε_y will govern" in material.hint_label.text()
    assert window.tension_page.cards["ratio"].value_text() == "13.675"
    table = material.coefficients
    assert [table.item(row, 0).font().bold() for row in range(3)] == [False, True, False]


def test_holes_show_a_clear_message_not_a_traceback(window: MainWindow) -> None:
    tension = window.tension_page
    tension.holes_check.setChecked(True)
    assert "B.6.1" in tension.message_label.text()
    assert not tension.message_label.isHidden()
    assert tension._content.isHidden()
    tension.holes_check.setChecked(False)
    assert tension.message_label.isHidden()


def test_expert_mode_unlocks_custom_e_and_gamma(window: MainWindow) -> None:
    material, tension = window.material_page, window.tension_page
    assert tension._form.isRowVisible(tension.gamma_spin) is False
    assert not material.e_spin.isEnabled()
    assert material.grade_box.findText("Custom…") == -1

    window.mode_box.setCurrentText("Expert")
    assert tension._form.isRowVisible(tension.gamma_spin) is True
    assert material.e_spin.isEnabled()
    assert material.grade_box.findText("Custom…") >= 0

    tension.gamma_spin.setValue(1.0)
    assert tension.cards["resistance"].value_text() == "256.5"  # γM0 = 1.0 instead of 1.1


def test_custom_material_and_error_message(window: MainWindow) -> None:
    window.mode_box.setCurrentText("Expert")
    material = window.material_page
    material.grade_box.setCurrentIndex(material.grade_box.findText("Custom…"))
    material.fy_spin.setValue(500)
    material.fu_spin.setValue(400)  # fu below fy
    assert not material.error_label.isHidden()
    assert "fu" in material.error_label.text() or "Ultimate" in material.error_label.text()
    assert "Complete step 1" in window.tension_page.message_label.text()

    material.fu_spin.setValue(650)
    assert material.error_label.isHidden()
    assert window.tension_page.message_label.isHidden()


def test_graph_view_toggle_changes_the_axis_label(window: MainWindow) -> None:
    ax = window.material_page.canvas.figure.axes[0]
    assert "not to scale" in ax.get_xlabel()
    window.view_box.setCurrentText("True scale")
    ax = window.material_page.canvas.figure.axes[0]
    assert "true scale" in ax.get_xlabel()


def test_working_sections_toggle(window: MainWindow) -> None:
    section = window.material_page.working_section
    assert not section.is_expanded()
    section.button.setChecked(True)
    assert section.is_expanded()
    assert "B.4" in window.material_page.working.toPlainText()
    assert "input" in window.material_page.working.toPlainText()
    assert "B.6.1" in window.tension_page.working.toPlainText()
