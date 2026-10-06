"""Step 2: CSM tension resistance (B.6.1)."""

from PySide6.QtCore import Qt
from PySide6.QtWidgets import (
    QCheckBox,
    QComboBox,
    QFormLayout,
    QGroupBox,
    QHBoxLayout,
    QScrollArea,
    QSplitter,
    QTextBrowser,
    QVBoxLayout,
    QWidget,
)

from stainless_csm import services as controller
from stainless_csm.core.enums import SectionType
from stainless_csm.core.errors import CSMError
from stainless_csm.csm.tension import TensionResult
from stainless_csm.material_models.csm_bilinear import CSMBilinearModel
from stainless_csm.ui import format as fmt
from stainless_csm.ui import plots
from stainless_csm.ui.material_page import make_spin
from stainless_csm.ui.prefill import GAMMA_M0
from stainless_csm.ui.widgets import (
    CollapsibleSection,
    MetricCard,
    PlotCanvas,
    StatusLabel,
    muted_label,
)


class TensionPage(QWidget):
    def __init__(self) -> None:
        super().__init__()
        self._model: CSMBilinearModel | None = None
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

        self._connect()
        self.refresh()

    # --- construction ---------------------------------------------------------------

    def _build_inputs(self) -> None:
        self._inputs = QGroupBox("Inputs")
        self._inputs.setMaximumWidth(460)
        outer = QVBoxLayout(self._inputs)
        self.material_label = muted_label("")
        outer.addWidget(self.material_label)

        form = QFormLayout()
        outer.addLayout(form)
        self._form = form

        self.area_spin = make_spin(1e9, 1000, 100, 1)
        form.addRow("Area A [mm²]", self.area_spin)

        self.section_box = QComboBox()
        for section in SectionType:
            self.section_box.addItem(section.value, section)
        form.addRow("Section type (B.2)", self.section_box)

        self.holes_check = QCheckBox("Section has holes (bolt holes, slots)")
        form.addRow("", self.holes_check)

        self.gamma_spin = make_spin(10, GAMMA_M0, 0.05, 2)
        form.addRow("γM0 (National Annex)", self.gamma_spin)
        outer.addStretch(1)

    def _build_results(self) -> None:
        self._results = QWidget()
        layout = QVBoxLayout(self._results)

        self.message_label = StatusLabel()
        layout.addWidget(self.message_label)

        self._content = QWidget()
        content = QVBoxLayout(self._content)
        content.setContentsMargins(0, 0, 0, 0)
        layout.addWidget(self._content)
        layout.addStretch(1)

        cards = QHBoxLayout()
        self.cards = {
            "ratio": MetricCard("ε<sub>csm,t</sub> / ε<sub>y</sub>"),
            "stress": MetricCard("f<sub>csm,t</sub> [N/mm²]"),
            "resistance": MetricCard("N<sub>csm,t,Rd</sub> [kN]"),
            "classic": MetricCard("N<sub>pl,Rd</sub> (classic) [kN]"),
        }
        for card in self.cards.values():
            cards.addWidget(card)
        content.addLayout(cards)

        self.governs_label = muted_label("")
        content.addWidget(self.governs_label)

        self.canvas = PlotCanvas(min_height=450)
        content.addWidget(self.canvas)

        self.notes_label = StatusLabel()
        content.addWidget(self.notes_label)

        self.working = QTextBrowser()
        self.working.setMinimumHeight(320)
        self.working_section = CollapsibleSection("Show working — B.6.1", self.working)
        content.addWidget(self.working_section)

    def _connect(self) -> None:
        for spin in (self.area_spin, self.gamma_spin):
            spin.valueChanged.connect(self.refresh)
        self.section_box.currentIndexChanged.connect(self.refresh)
        self.holes_check.toggled.connect(self.refresh)

    # --- state ----------------------------------------------------------------------

    def set_model(self, model: CSMBilinearModel | None) -> None:
        self._model = model
        self.refresh()

    def set_expert(self, expert: bool) -> None:
        self._expert = expert
        self.refresh()

    def set_schematic(self, schematic: bool) -> None:
        self._schematic = schematic
        self.refresh()

    def current_form(self) -> controller.TensionForm:
        return controller.TensionForm(
            area=self.area_spin.value(),
            section_type=self.section_box.currentData(),
            has_holes=self.holes_check.isChecked(),
            gamma_m0=self.gamma_spin.value() if self._expert else GAMMA_M0,
        )

    # --- rendering ------------------------------------------------------------------

    def refresh(self) -> None:
        self._form.setRowVisible(self.gamma_spin, self._expert)

        if self._model is None:
            self._content.hide()
            self.message_label.show_message("info", "Complete step 1 (Material) first.")
            self.material_label.setText("")
            return
        self.material_label.setText(f"Material: {self._model.material.source}")

        try:
            result = controller.run_tension(self._model, self.current_form())
        except CSMError as error:
            self._content.hide()
            self.message_label.show_message("error", str(error))
            return

        self.message_label.hide()
        self._content.show()
        self._render(self._model, result)

    def _render(self, model: CSMBilinearModel, result: TensionResult) -> None:
        self.cards["ratio"].set_content(
            fmt.number(result.strain_ratio),
            tooltip=f"Formula B.14. Governed by: {result.governing.value}",
        )
        self.cards["stress"].set_content(
            fmt.number(result.design_stress),
            "",
            "Formula B.13",
        )
        self.cards["resistance"].set_content(
            f"{fmt.kn(result.resistance):.1f}",
            "",
            "Formula B.12",
        )
        self.governs_label.setText(f"{result.governing.value} governs the strain limit (B.14).")

        self.canvas.draw_with(
            lambda fig, theme: plots.draw_stress_strain(fig, model, self._schematic, theme, result)
        )
        if result.notes:
            self.notes_label.show_message("info", "\n".join(result.notes))
        else:
            self.notes_label.hide()
        self.working.setHtml(fmt.trace_html(result.trace, clauses={"B.6.1"}))
