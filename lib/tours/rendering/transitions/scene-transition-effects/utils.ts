export function roundTransitionSeconds(value: number): number {
  return Math.round(value * 1000) / 1000;
}

export function formatTransitionSeconds(value: number): string {
  return roundTransitionSeconds(value).toFixed(3).replace(/\.?0+$/, "");
}
