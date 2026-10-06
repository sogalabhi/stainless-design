"""Chart colours. Framework-free so the figures can be drawn and tested without Qt."""

from dataclasses import dataclass

from stainless_csm.viz.palette import BLUE, CRITICAL, GOOD, MUTED, ORANGE, WARNING

__all__ = ["BLUE", "CRITICAL", "DARK", "GOOD", "LIGHT", "MUTED", "ORANGE", "WARNING", "Theme"]


@dataclass(frozen=True)
class Theme:
    dark: bool
    text: str
    surface: str
    grid: str


LIGHT = Theme(dark=False, text="#0b0b0b", surface="#fcfcfb", grid="#e1e0d9")
DARK = Theme(dark=True, text="#e8e8e6", surface="#1a1a19", grid="#2c2c2a")
