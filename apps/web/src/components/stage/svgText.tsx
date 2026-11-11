import { Fragment, type ReactNode } from "react";

const RUN = /([\p{L}\p{N}_,]+)/gu;

/**
 * Symbols such as ε_csm,t inside SVG text: the subscript is a shifted, smaller tspan (an HTML <sub>
 * is not valid in SVG). The same run rule as renderSymbols.
 */
export function svgSymbols(text: string): ReactNode[] {
  return text.split(RUN).map((part, index) => {
    if (!part.includes("_")) return <Fragment key={index}>{part}</Fragment>;
    let run = part;
    let trailing = "";
    while (run.endsWith(",")) {
      run = run.slice(0, -1);
      trailing += ",";
    }
    const [head, ...rest] = run.split("_");
    return (
      <Fragment key={index}>
        {head}
        <tspan baselineShift="sub" fontSize="9.5">
          {rest.join("_")}
        </tspan>
        {trailing}
      </Fragment>
    );
  });
}
