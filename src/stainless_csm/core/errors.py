"""Errors the UI can catch in one place (``except CSMError``) and show as a plain message."""


class CSMError(Exception):
    """Base class for every error raised on purpose by this package."""


class InvalidMaterialError(CSMError):
    """Material inputs are physically meaningless or inconsistent."""


class OutOfRangeError(CSMError):
    """A value lies outside the range the code defines; we never extrapolate."""


class NotApplicableError(CSMError):
    """The method does not apply to this case (e.g. holes, slenderness out of range)."""


class InvalidSectionError(CSMError):
    """Section geometry or slenderness inputs are physically meaningless."""


class NotBuiltYetError(CSMError):
    """The case belongs to Annex B but this tool does not calculate it yet. Not a refusal."""
