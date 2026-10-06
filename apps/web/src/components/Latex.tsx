import katex from "katex";
import "katex/dist/katex.min.css";
import { useMemo } from "react";

/** A LaTeX equation from the engine, typeset by KaTeX (with MathML for screen readers). */
export function Latex({ tex, display = true }: { tex: string; display?: boolean }) {
  const html = useMemo(
    () => katex.renderToString(tex, { displayMode: display, throwOnError: false, output: "htmlAndMathml" }),
    [tex, display],
  );
  return <span className="latex" dangerouslySetInnerHTML={{ __html: html }} />;
}
