"""Small helper for writing the LaTeX of a calculation step.

Templates use <name> placeholders so LaTeX braces need no doubling:

    tex(r"\\varepsilon_y = \\frac{f_y}{E} = \\frac{<fy>}{<e>}", fy=210, e=200000)
"""

import re

_PLACEHOLDER = re.compile(r"<(\w+)>")


def number_tex(value: float) -> str:
    """A number as compact LaTeX: 6 significant figures, scientific notation for tiny values."""
    text = f"{value:.6g}"
    if "e" not in text:
        return text
    mantissa, exponent = text.split("e")
    return rf"{mantissa} \times 10^{{{int(exponent)}}}"


def tex(template: str, **values: float | str) -> str:
    def fill(match: re.Match[str]) -> str:
        value = values[match.group(1)]
        return value if isinstance(value, str) else number_tex(value)

    return _PLACEHOLDER.sub(fill, template)


_UNSAFE_TEXT = re.compile(r"[^A-Za-z0-9 .,:;()/+\-]")


def text_tex(text: str) -> str:
    """User-supplied words (e.g. a plate name) made safe to put inside \\text{...}."""
    return _UNSAFE_TEXT.sub("", text)
