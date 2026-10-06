"""Entry point:  python -m stainless_csm.ui.app   (or the `stainless-csm` command)."""

import sys

from PySide6.QtWidgets import QApplication

from stainless_csm.ui.main_window import MainWindow


def main() -> None:
    app = QApplication(sys.argv)
    app.setApplicationName("Stainless CSM")
    window = MainWindow()
    window.show()
    sys.exit(app.exec())


if __name__ == "__main__":
    main()
