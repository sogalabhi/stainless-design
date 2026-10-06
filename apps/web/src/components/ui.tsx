import { CircleAlert, CircleCheck, CircleX, Info } from "lucide-react";
import { type ReactNode, useEffect, useId, useState } from "react";
import { renderSymbols } from "./Symbols";

export type StatusKind = "pass" | "fail" | "info" | "error";

const STATUS_ICONS = {
  pass: CircleCheck,
  fail: CircleX,
  info: Info,
  error: CircleAlert,
} as const;

/** A message with an icon. The wording always says PASS/FAIL too, so colour is never alone. */
export function StatusBox({ kind, children }: { kind: StatusKind; children: ReactNode }) {
  const Icon = STATUS_ICONS[kind];
  return (
    <div className={`status status-${kind}`} role={kind === "error" ? "alert" : "status"}>
      <Icon size={20} aria-hidden="true" />
      <div>{children}</div>
    </div>
  );
}

export function MetricCard({
  title,
  value,
  sub,
  hint,
}: {
  title: string;
  value: string;
  sub?: string;
  hint?: string;
}) {
  return (
    <div className="metric" title={hint}>
      <div className="metric-title">{renderSymbols(title)}</div>
      <div className="metric-value">{value}</div>
      {sub ? <div className="metric-sub">{renderSymbols(sub)}</div> : null}
    </div>
  );
}

export function Collapsible({ title, children }: { title: string; children: ReactNode }) {
  return (
    <details className="collapsible">
      <summary>{title}</summary>
      <div className="collapsible-body">{children}</div>
    </details>
  );
}

/** A number the user must give: empty means "not given yet" (null). Nothing is ever pre-filled. */
export function NumberField({
  label,
  value,
  onChange,
  unit,
  step,
  min,
  hint,
}: {
  label: string;
  value: number | null;
  onChange: (value: number | null) => void;
  unit?: string;
  step?: number;
  min?: number;
  hint?: string;
}) {
  const id = useId();
  const [text, setText] = useState(value === null ? "" : String(value));
  useEffect(() => {
    const current = text === "" ? null : Number(text);
    if (current !== value) setText(value === null ? "" : String(value));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);
  return (
    <div className="field">
      <label htmlFor={id}>
        {renderSymbols(label)}
        {unit ? <span className="unit"> [{unit}]</span> : null}
      </label>
      <input
        id={id}
        type="number"
        value={text}
        step={step}
        min={min}
        placeholder="required"
        onChange={(event) => {
          setText(event.target.value);
          const parsed = event.target.valueAsNumber;
          onChange(event.target.value === "" || Number.isNaN(parsed) ? null : parsed);
        }}
      />
      {hint ? <div className="field-hint">{hint}</div> : null}
    </div>
  );
}

export function SelectField<T extends string>({
  label,
  value,
  options,
  onChange,
  placeholder,
}: {
  label: string;
  value: T | null;
  options: { value: T; label: string }[];
  onChange: (value: T) => void;
  placeholder?: string;
}) {
  const id = useId();
  return (
    <div className="field">
      <label htmlFor={id}>{renderSymbols(label)}</label>
      <select
        id={id}
        value={value ?? ""}
        onChange={(event) => onChange(event.target.value as T)}
      >
        {value === null ? (
          <option value="" disabled>
            {placeholder ?? "choose"}
          </option>
        ) : null}
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </div>
  );
}

export function CheckField({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
}) {
  const id = useId();
  return (
    <div className="field field-check">
      <input id={id} type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      <label htmlFor={id}>{label}</label>
    </div>
  );
}

export function Segmented<T extends string>({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: T;
  options: { value: T; label: string }[];
  onChange: (value: T) => void;
}) {
  return (
    <div className="segmented-group">
      <span className="segmented-label">{label}</span>
      <div className="segmented" role="radiogroup" aria-label={label}>
        {options.map((option) => (
          <button
            key={option.value}
            type="button"
            role="radio"
            aria-checked={value === option.value}
            className={value === option.value ? "active" : ""}
            onClick={() => onChange(option.value)}
          >
            {option.label}
          </button>
        ))}
      </div>
    </div>
  );
}
