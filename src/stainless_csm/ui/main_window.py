"""The main window: settings on top, one tab per step."""

from PySide6.QtWidgets import QComboBox, QLabel, QMainWindow, QTabWidget, QToolBar

from stainless_csm.ui.material_page import MaterialPage
from stainless_csm.ui.tension_page import TensionPage


class MainWindow(QMainWindow):
    def __init__(self) -> None:
        super().__init__()
        self.setWindowTitle(
            "Stainless steel · Continuous Strength Method (EN 1993-1-4:2025, Annex B)"
        )
        self.resize(1400, 900)

        self.material_page = MaterialPage()
        self.tension_page = TensionPage()
        self.tabs = QTabWidget()
        self.tabs.addTab(self.material_page, "1 · Material (B.4)")
        self.tabs.addTab(self.tension_page, "2 · Tension (B.6.1)")
        self.setCentralWidget(self.tabs)

        toolbar = QToolBar("Settings")
        toolbar.setMovable(False)
        self.addToolBar(toolbar)
        toolbar.addWidget(QLabel("  Mode: "))
        self.mode_box = QComboBox()
        self.mode_box.addItems(["Beginner", "Expert"])
        self.mode_box.setToolTip("Expert unlocks custom f_y/f_u, E and γM0.")
        toolbar.addWidget(self.mode_box)
        toolbar.addSeparator()
        toolbar.addWidget(QLabel("  Graph view: "))
        self.view_box = QComboBox()
        self.view_box.addItems(["Schematic", "True scale"])
        self.view_box.setToolTip(
            "Schematic spaces the key strains out like Figure B.1. "
            "True scale shows real strains: the elastic part is a thin sliver."
        )
        toolbar.addWidget(self.view_box)
        toolbar.addSeparator()
        toolbar.addWidget(QLabel("  units: N, mm, N/mm² (forces shown in kN)"))

        self.material_page.modelChanged.connect(self.tension_page.set_model)
        self.mode_box.currentTextChanged.connect(self._on_mode)
        self.view_box.currentTextChanged.connect(self._on_view)
        self.material_page.refresh()

    def _on_mode(self, text: str) -> None:
        expert = text == "Expert"
        self.tension_page.set_expert(expert)
        self.material_page.set_expert(expert)

    def _on_view(self, text: str) -> None:
        schematic = text == "Schematic"
        self.tension_page.set_schematic(schematic)
        self.material_page.set_schematic(schematic)
