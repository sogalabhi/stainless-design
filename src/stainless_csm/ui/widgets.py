"""Small reusable Qt widgets."""

from collections.abc import Callable

from matplotlib.backends.backend_qtagg import FigureCanvasQTAgg
from matplotlib.figure import Figure
from PySide6.QtCore import Qt
from PySide6.QtGui import QColor, QPalette
from PySide6.QtWidgets import (
    QFrame,
    QHBoxLayout,
    QLabel,
    QSizePolicy,
    QStyle,
    QToolButton,
    QVBoxLayout,
    QWidget,
)

from stainless_csm.ui.theme import DARK, LIGHT, Theme


def theme_from_palette(palette: QPalette) -> Theme:
    """Light or dark chart colours to match the system theme, on the base (card) colour."""
    surface = palette.color(QPalette.ColorRole.Base)
    base = DARK if surface.lightness() < 128 else LIGHT
    return Theme(base.dark, base.text, surface.name(), base.grid)


class PlotCanvas(FigureCanvasQTAgg):
    """A matplotlib canvas that redraws itself through a drawing function."""

    def __init__(self, min_height: int = 360, parent: QWidget | None = None) -> None:
        super().__init__(Figure())  # type: ignore[no-untyped-call]
        self.setParent(parent)
        self.setMinimumHeight(min_height)
        self.setSizePolicy(QSizePolicy.Policy.Expanding, QSizePolicy.Policy.Fixed)
        self.setFixedHeight(min_height)

    def theme(self) -> Theme:
        return theme_from_palette(self.palette())

    def draw_with(self, draw: Callable[[Figure, Theme], None]) -> None:
        draw(self.figure, self.theme())
        self.draw_idle()  # type: ignore[no-untyped-call]


class MetricCard(QFrame):
    """A small labelled number: title, big value, optional sub-line."""

    def __init__(self, title: str, parent: QWidget | None = None) -> None:
        super().__init__(parent)
        self.setFrameShape(QFrame.Shape.StyledPanel)
        layout = QVBoxLayout(self)
        layout.setContentsMargins(10, 6, 10, 6)
        layout.setSpacing(1)
        self._title = QLabel(title)
        self._title.setStyleSheet("font-size: 11px; color: #898781;")
        self._value = QLabel("–")
        self._value.setStyleSheet("font-size: 18px; font-weight: bold;")
        self._sub = QLabel("")
        self._sub.setStyleSheet("font-size: 11px;")
        for label in (self._title, self._value, self._sub):
            layout.addWidget(label)

    def set_content(self, value: str, sub: str = "", tooltip: str = "") -> None:
        self._value.setText(value)
        self._sub.setText(sub)
        self._sub.setVisible(bool(sub))
        self.setToolTip(tooltip)

    def value_text(self) -> str:
        return self._value.text()

    def sub_text(self) -> str:
        return self._sub.text()


class CollapsibleSection(QWidget):
    """A header button that shows or hides a content widget."""

    def __init__(self, title: str, content: QWidget, expanded: bool = False) -> None:
        super().__init__()
        self._content = content
        self.button = QToolButton()
        self.button.setText(title)
        self.button.setCheckable(True)
        self.button.setChecked(expanded)
        self.button.setToolButtonStyle(Qt.ToolButtonStyle.ToolButtonTextBesideIcon)
        self.button.setStyleSheet("QToolButton { border: none; font-weight: bold; }")
        self.button.toggled.connect(self._toggle)
        layout = QVBoxLayout(self)
        layout.setContentsMargins(0, 0, 0, 0)
        layout.addWidget(self.button)
        layout.addWidget(content)
        self._toggle(expanded)

    def _toggle(self, expanded: bool) -> None:
        self.button.setArrowType(Qt.ArrowType.DownArrow if expanded else Qt.ArrowType.RightArrow)
        self._content.setVisible(expanded)

    def is_expanded(self) -> bool:
        return self.button.isChecked()


STATUS_STYLES = {
    "pass": "background-color: rgba(12, 163, 12, 0.18); border: 1px solid #0ca30c;",
    "fail": "background-color: rgba(208, 59, 59, 0.18); border: 1px solid #d03b3b;",
    "info": "background-color: rgba(42, 120, 214, 0.15); border: 1px solid #2a78d6;",
    "error": "background-color: rgba(208, 59, 59, 0.18); border: 1px solid #d03b3b;",
}


STATUS_ICONS = {
    "pass": QStyle.StandardPixmap.SP_DialogApplyButton,
    "fail": QStyle.StandardPixmap.SP_MessageBoxCritical,
    "info": QStyle.StandardPixmap.SP_MessageBoxInformation,
    "error": QStyle.StandardPixmap.SP_MessageBoxCritical,
}


class StatusLabel(QFrame):
    """A message box with a status icon and text: pass / fail / info / error.

    The icon is a standard Qt icon (no emoji); the wording always says PASS or FAIL as well,
    so meaning never rests on colour alone.
    """

    def __init__(self) -> None:
        super().__init__()
        layout = QHBoxLayout(self)
        layout.setContentsMargins(10, 8, 10, 8)
        self._icon = QLabel()
        self._icon.setFixedSize(22, 22)
        self._icon.setAlignment(Qt.AlignmentFlag.AlignTop)
        self._text = QLabel()
        self._text.setWordWrap(True)
        self._text.setTextInteractionFlags(Qt.TextInteractionFlag.TextSelectableByMouse)
        layout.addWidget(self._icon, 0, Qt.AlignmentFlag.AlignTop)
        layout.addWidget(self._text, 1)
        self.hide()

    def show_message(self, kind: str, text: str) -> None:
        self.setStyleSheet(f"StatusLabel {{ {STATUS_STYLES[kind]} border-radius: 6px; }}")
        self._icon.setPixmap(self.style().standardIcon(STATUS_ICONS[kind]).pixmap(20, 20))
        self._text.setText(text)
        self.show()

    def text(self) -> str:
        return self._text.text()


def muted_label(text: str) -> QLabel:
    label = QLabel(text)
    label.setWordWrap(True)
    label.setStyleSheet("color: #898781;")
    return label


def highlight_color() -> QColor:
    return QColor(42, 120, 214, 70)
