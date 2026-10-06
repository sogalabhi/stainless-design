"""Step 1: material and the B.4 stress–strain model."""

from PySide6.QtCore import Qt, Signal
from PySide6.QtGui import QFont
from PySide6.QtWidgets import (
    QAbstractItemView,
    QCheckBox,
    QComboBox,
    QDoubleSpinBox,
    QFormLayout,
    QGroupBox,
    QHBoxLayout,
    QHeaderView,
    QLabel,
    QScrollArea,
    QSplitter,
    QTableWidget,
    QTableWidgetItem,
    QTextBrowser,
    QVBoxLayout,
    QWidget,
)

from stainless_csm import services as controller
from stainless_csm.core.enums import StainlessFamily
from stainless_csm.core.errors import CSMError
from stainless_csm.material_models.csm_bilinear import CSMBilinearModel
from stainless_csm.ui import format as fmt
from stainless_csm.ui import plots
from stainless_csm.ui.prefill import ELASTIC_MODULUS
from stainless_csm.ui.widgets import (
    CollapsibleSection,
    MetricCard,
    PlotCanvas,
    StatusLabel,
    highlight_color,
    muted_label,
)

CUSTOM_LABEL = "Custom…"


def make_spin(maximum: float, value: float, step: float, decimals: int = 1) -> QDoubleSpinBox:
    spin = QDoubleSpinBox()
    spin.setRange(0.0, maximum)
    spin.setDecimals(decimals)
    spin.setSingleStep(step)
    spin.setValue(value)
    spin.setGroupSeparatorShown(True)
    spin.setKeyboardTracking(False)
    return spin


class MaterialPage(QWidget):
    modelChanged = Signal(object)  # CSMBilinearModel | None

    def __init__(self) -> None:
        super().__init__()
        self._expert = False
        self._schematic = True
        self._build_inputs()
        self._build_results()

        splitter = QSplitter(Qt.Orientation.Horizontal)
        splitter.addWidget(self._inputs)
        scroll = QScrollArea()
        scroll.setWidgetResizable(True)
        scroll.setFrameShape(QScrollArea.Shape.NoFrame)
        scroll.setWidget(self._results)
        splitter.addWidget(scroll)
        splitter.setStretchFactor(1, 1)
        splitter.setSizes([400, 900])
        layout = QHBoxLayout(self)
        layout.addWidget(splitter)

        self._populate_grades()
        self._connect()
        self.refresh()

    # --- construction ---------------------------------------------------------------

    def _build_inputs(self) -> None:
        self._inputs = QGroupBox("Inputs")
        self._inputs.setMaximumWidth(460)
        outer = QVBoxLayout(self._inputs)
        form = QFormLayout()
        outer.addLayout(form)

        self.grade_box = QComboBox()
        form.addRow("Grade (Table 5.1)", self.grade_box)

        self.family_box = QComboBox()
        for family in StainlessFamily:
            self.family_box.addItem(family.value, family)
        self.fy_spin = make_spin(2000, 210, 10)
        self.fu_spin = make_spin(3000, 500, 10)
        self.enhanced_check = QCheckBox("Enhanced by cold-forming (5.1.2.3)")
        form.addRow("Family", self.family_box)
        form.addRow("f_y [N/mm²]", self.fy_spin)
        form.addRow("f_u [N/mm²]", self.fu_spin)
        form.addRow("", self.enhanced_check)
        self._custom_widgets = (self.family_box, self.fy_spin, self.fu_spin, self.enhanced_check)

        self.e_spin = make_spin(1e6, ELASTIC_MODULUS, 1000, 0)
        form.addRow("E [N/mm²]", self.e_spin)
        self._form = form

        self.note_label = muted_label("")
        self.source_label = muted_label("")
        outer.addWidget(self.note_label)
        outer.addWidget(self.source_label)
        outer.addStretch(1)

    def _build_results(self) -> None:
        self._results = QWidget()
        layout = QVBoxLayout(self._results)

        self.error_label = StatusLabel()
        layout.addWidget(self.error_label)

        self._content = QWidget()
        content = QVBoxLayout(self._content)
        content.setContentsMargins(0, 0, 0, 0)
        layout.addWidget(self._content)
        layout.addStretch(1)

        cards = QHBoxLayout()
        self.cards = {
            "eps_y": MetricCard("ε<sub>y</sub>"),
            "eps_u": MetricCard("ε<sub>u</sub>"),
            "e_sh": MetricCard("E<sub>sh</sub> [N/mm²]"),
            "c1": MetricCard("C₁ε<sub>u</sub>"),
            "sigma_c1": MetricCard("σ at C₁ε<sub>u</sub>"),
        }
        for card in self.cards.values():
            cards.addWidget(card)
        content.addLayout(cards)

        self.hint_label = muted_label("")
        content.addWidget(self.hint_label)

        self.canvas = PlotCanvas(min_height=430)
        content.addWidget(self.canvas)

        explainer = QTextBrowser()
        explainer.setHtml(fmt.MATERIAL_EXPLAINER_HTML)
        explainer.setMinimumHeight(230)
        self.explainer = CollapsibleSection("What am I looking at? (plain English)", explainer)
        content.addWidget(self.explainer)

        content.addWidget(QLabel("<b>Table B.1 — CSM material model coefficients</b>"))
        self.coefficients = QTableWidget(3, 4)
        self.coefficients.setHorizontalHeaderLabels(["Stainless steel", "C₁", "C₂", "C₃"])
        self.coefficients.verticalHeader().hide()
        self.coefficients.setEditTriggers(QAbstractItemView.EditTrigger.NoEditTriggers)
        self.coefficients.setSelectionMode(QAbstractItemView.SelectionMode.NoSelection)
        self.coefficients.horizontalHeader().setSectionResizeMode(QHeaderView.ResizeMode.Stretch)
        self.coefficients.setFixedHeight(self.coefficients.horizontalHeader().height() + 3 * 30 + 6)
        for row in range(3):
            self.coefficients.setRowHeight(row, 30)
        content.addWidget(self.coefficients)

        self.working = QTextBrowser()
        self.working.setMinimumHeight(320)
        self.working_section = CollapsibleSection("Show working — B.4", self.working)
        content.addWidget(self.working_section)

    def _connect(self) -> None:
        self.grade_box.currentIndexChanged.connect(self._on_grade_changed)
        self.family_box.currentIndexChanged.connect(self.refresh)
        for spin in (self.fy_spin, self.fu_spin, self.e_spin):
            spin.valueChanged.connect(self.refresh)
        self.enhanced_check.toggled.connect(self.refresh)

    # --- state ----------------------------------------------------------------------

    def set_expert(self, expert: bool) -> None:
        self._expert = expert
        self._populate_grades()
        self.refresh()

    def set_schematic(self, schematic: bool) -> None:
        self._schematic = schematic
        self.refresh()

    def _populate_grades(self) -> None:
        previous = self.grade_box.currentData() if self.grade_box.count() else None
        had_previous = self.grade_box.count() > 0
        self.grade_box.blockSignals(True)
        self.grade_box.clear()
        for designation in controller.designations():
            self.grade_box.addItem(controller.grade_label(designation), designation)
        if self._expert:
            self.grade_box.addItem(CUSTOM_LABEL, None)
        wanted = previous if had_previous else controller.DEFAULT_DESIGNATION
        index = self.grade_box.findData(wanted)
        self.grade_box.setCurrentIndex(index if index >= 0 else 0)
        self.grade_box.blockSignals(False)

    def _on_grade_changed(self) -> None:
        self.refresh()

    def current_form(self) -> controller.MaterialForm:
        return controller.MaterialForm(
            designation=self.grade_box.currentData(),
            family=self.family_box.currentData(),
            fy=self.fy_spin.value(),
            fu=self.fu_spin.value(),
            elastic_modulus=self.e_spin.value(),
            enhanced=self.enhanced_check.isChecked(),
        )

    # --- rendering ------------------------------------------------------------------

    def refresh(self) -> None:
        form = self.current_form()
        custom = form.designation is None
        for widget in self._custom_widgets:
            self._form.setRowVisible(widget, custom)
        self.e_spin.setEnabled(self._expert or custom)

        if not custom:
            note = controller.grade_note(form.designation or "")
            self.note_label.setText(f"Note: {note}" if note else "")
        else:
            self.note_label.setText("")

        try:
            material = controller.build_material(form)
            model = CSMBilinearModel(material)
        except CSMError as error:
            self._content.hide()
            self.error_label.show_message("error", str(error))
            self.source_label.setText("")
            self.modelChanged.emit(None)
            return

        self.error_label.hide()
        self._content.show()
        self.source_label.setText(f"Source: {material.source}")
        self._render(model)
        self.modelChanged.emit(model)

    def _render(self, model: CSMBilinearModel) -> None:
        self.cards["eps_y"].set_content(fmt.number(model.yield_strain), tooltip="f_y / E")
        self.cards["eps_u"].set_content(fmt.number(model.ultimate_strain), tooltip="Formula B.5")
        self.cards["e_sh"].set_content(
            fmt.number(model.strain_hardening_modulus), tooltip="Formula B.4"
        )
        self.cards["c1"].set_content(fmt.number(model.strain_limit_c1))
        self.cards["sigma_c1"].set_content(fmt.number(model.stress_at_strain_limit_c1))
        self.hint_label.setText(controller.material_hint(model))

        self.canvas.draw_with(
            lambda fig, theme: plots.draw_stress_strain(fig, model, self._schematic, theme)
        )

        for row, entry in enumerate(controller.coefficient_rows(model.material.family)):
            for column, text in enumerate((entry.family, entry.c1, entry.c2, entry.c3)):
                item = QTableWidgetItem(text)
                if entry.selected:
                    font = QFont(item.font())
                    font.setBold(True)
                    item.setFont(font)
                    item.setBackground(highlight_color())
                item.setTextAlignment(
                    Qt.AlignmentFlag.AlignVCenter
                    | (Qt.AlignmentFlag.AlignLeft if column == 0 else Qt.AlignmentFlag.AlignRight)
                )
                self.coefficients.setItem(row, column, item)

        self.working.setHtml(fmt.trace_html(model.trace))
