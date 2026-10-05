"""Closed sets of values. An enum turns a typo into an error instead of a silent miss."""

from enum import Enum


class StainlessFamily(Enum):
    AUSTENITIC = "austenitic"
    DUPLEX = "duplex"
    FERRITIC = "ferritic"


class StrengthClass(Enum):
    SC210 = "SC210"
    SC450 = "SC450"


class CorrosionClass(Enum):
    I = "I"  # noqa: E741
    II = "II"
    III = "III"
    IV = "IV"
    V = "V"
