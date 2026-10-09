import { CircleCheck, CircleDashed, CircleAlert, CircleSlash, Clock } from "lucide-react";
import type { MissingItem, TabStatus } from "../lib/inputs";
import { STATUS_WORDS } from "../lib/inputs";
import { renderSymbols } from "./Symbols";
import { StatusBox } from "./ui";

const ICONS = {
  done: CircleCheck,
  waiting: CircleDashed,
  not_applicable: CircleSlash,
  later: Clock,
  error: CircleAlert,
} as const;

/** The status icon shown on a tab. The words are there for screen readers, so colour is never alone. */
export function StatusIcon({ status }: { status: TabStatus }) {
  const Icon = ICONS[status];
  return (
    <>
      <Icon size={14} className={`tab-status tab-status-${status}`} aria-hidden="true" />
      <span className="sr-only">, {STATUS_WORDS[status]}</span>
    </>
  );
}

/** "Waiting for: ..." where each missing input is a link that opens it in the dock. */
export function Waiting({
  items,
  onGo,
}: {
  items: MissingItem[];
  onGo: (item: MissingItem) => void;
}) {
  if (items.length === 0) return null;
  return (
    <StatusBox kind="info">
      <span>Waiting for: </span>
      {items.map((item, index) => (
        <span key={`${item.group}/${item.field}`}>
          {index > 0 ? "; " : ""}
          <button type="button" className="link-button" onClick={() => onGo(item)}>
            {renderSymbols(item.label)}
          </button>
        </span>
      ))}
      <span>.</span>
    </StatusBox>
  );
}
