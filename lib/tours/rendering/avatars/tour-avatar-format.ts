export function formatNumber(value: number): string {
  if (Number.isInteger(value)) return String(value);
  return value.toFixed(3).replace(/0+$/, "").replace(/\.$/, "");
}

export function formatTimestampForFile(seconds: number): string {
  return formatNumber(seconds).replace(/[^0-9a-z-]+/gi, "-");
}

export function toPercent(value: number): string {
  return `${Math.round(value * 100)}%`;
}
