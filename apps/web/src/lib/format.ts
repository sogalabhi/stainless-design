/** Display formatting. Engine units are N and N/mm2; kN appears only here, at the screen edge. */

export function kn(newtons: number): number {
  return newtons / 1000;
}

export function formatNumber(value: number): string {
  if (value === 0) return "0";
  const magnitude = Math.abs(value);
  if (magnitude < 0.01 || magnitude >= 1e7) return String(Number(value.toPrecision(4)));
  if (magnitude >= 1000) {
    return value.toLocaleString("en-US", { minimumFractionDigits: 1, maximumFractionDigits: 1 }).replace(/,/g, " ");
  }
  return String(Number(value.toPrecision(5)));
}

export function formatKn(newtons: number): string {
  return kn(newtons).toFixed(1);
}

export function formatPercent(fraction: number, signed = false): string {
  const text = `${Math.abs(fraction * 100).toFixed(0)} %`;
  if (!signed) return fraction < 0 ? `-${text}` : text;
  return `${fraction < 0 ? "-" : "+"}${text}`;
}
