import { CircleAlert, CircleCheck, CircleX, Info } from "lucide-react";
import { type ReactNode, useEffect, useId, useState } from "react";
import { useFieldHelp } from "./FieldHelp";
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
  fieldKey,
  highlighted,
  note,
}: {
  label: string;
  value: number | null;
  onChange: (value: number | null) => void;
  unit?: string;
  step?: number;
  min?: number;
  hint?: string;
  fieldKey?: string;
  /** lit while the matching dimension line of the sketch is hovered */
  highlighted?: boolean;
  /** extra lines under the field (for example where its value came from) */
  note?: ReactNode;
}) {
  const id = useId();
  const help = useFieldHelp(fieldKey, label);
  const [text, setText] = useState(value === null ? "" : String(value));
  useEffect(() => {
    const current = text === "" ? null : Number(text);
    if (current !== value) setText(value === null ? "" : String(value));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);
  return (
    <div className={`field${highlighted ? " field-highlight" : ""}`} data-field={fieldKey}>
      <div className="field-label-row">
        <label htmlFor={id}>
          {renderSymbols(label)}
          {unit ? <span className="unit"> [{unit}]</span> : null}
        </label>
        {help.button}
      </div>
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
      {help.panel}
      {hint ? <div className="field-hint">{hint}</div> : null}
      {note}
    </div>
  );
}

export function SelectField<T extends string>({
  label,
  value,
  options,
  onChange,
  placeholder,
  fieldKey,
}: {
  label: string;
  value: T | null;
  options: { value: T; label: string }[];
  onChange: (value: T) => void;
  placeholder?: string;
  fieldKey?: string;
}) {
  const id = useId();
  const help = useFieldHelp(fieldKey, label);
  return (
    <div className="field" data-field={fieldKey}>
      <div className="field-label-row">
        <label htmlFor={id}>{renderSymbols(label)}</label>
        {help.button}
      </div>
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
      {help.panel}
    </div>
  );
}

export function CheckField({
  label,
  checked,
  onChange,
  fieldKey,
}: {
  label: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
  fieldKey?: string;
}) {
  const id = useId();
  const help = useFieldHelp(fieldKey, label);
  return (
    <div className="field field-check" data-field={fieldKey}>
      <input id={id} type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      <label htmlFor={id}>{label}</label>
      {help.button}
      {help.panel}
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
