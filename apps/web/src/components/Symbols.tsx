import { Fragment, type ReactNode } from "react";

const RUN = /([\p{L}\p{N}_,]+)/gu;

/** Turns symbols such as ε_csm,t into ε with a real subscript. */
export function renderSymbols(text: string): ReactNode[] {
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
        <sub>{rest.join("_")}</sub>
        {trailing}
      </Fragment>
    );
  });
}

export function Sym({ text }: { text: string }) {
  return <>{renderSymbols(text)}</>;
}
