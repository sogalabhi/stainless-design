"""Rich-text helpers for the desktop app. Plain formatting lives in stainless_csm.formatting."""

import html

from stainless_csm.core.trace import CalcTrace
from stainless_csm.formatting import kn, number, percent, step_line

__all__ = ["MATERIAL_EXPLAINER_HTML", "kn", "number", "percent", "step_line", "trace_html"]

MATERIAL_EXPLAINER_HTML = """
<ul>
<li><b>Blue line:</b> the CSM idealisation of the steel: a steep elastic line up to yield,
then a gentle <i>strain-hardening</i> line up to the ultimate strength.</li>
<li><b>Dashed grey line:</b> the classic assumption, flat at f<sub>y</sub>. The shaded gap is
the extra strength CSM lets you use.</li>
<li><b>E<sub>sh</sub></b> is just rise over run of the second line:
(f<sub>u</sub> − f<sub>y</sub>) / (C₂ε<sub>u</sub> − ε<sub>y</sub>).</li>
<li><b>C₂ε<sub>u</sub></b> is not where the steel breaks. It is an anchor point chosen so the
straight line follows the real, rounded curve in the strain range that matters.</li>
<li><b>C₁ε<sub>u</sub></b> is the largest strain the method lets you use: a ductility cap.</li>
<li>The ε<sub>u</sub> formula estimates the fracture strain from f<sub>y</sub>/f<sub>u</sub>
because the real value is usually unknown. Ferritic steels use C₃ = 0.6 because they are less
ductile.</li>
</ul>
"""


def trace_html(trace: CalcTrace, clauses: set[str] | None = None) -> str:
    """The working as rich text: a clause chip, the description and the one-line equation."""
    parts: list[str] = []
    for step in trace:
        if clauses is not None and step.clause not in clauses:
            continue
        chip = (
            '<span style="background-color:#2a78d6; color:#ffffff;">'
            f"&nbsp;{html.escape(step.clause)}&nbsp;</span>"
        )
        parts.append(
            f"<p>{chip} {html.escape(step.description)}<br>"
            f'<span style="font-family:monospace;">{html.escape(step_line(step))}</span></p>'
        )
    return "".join(parts)
