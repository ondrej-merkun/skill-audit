export function calculateCompromisedPercent(compromised: number, total: number): number {
  if (compromised <= 0 || total <= 0) return 0;

  const percent = (compromised / total) * 100;
  if (percent > 0 && percent < 1) {
    return Math.round(percent * 100) / 100;
  }

  return Math.round(percent);
}

export function formatCompromisedPercent(percent: number): string {
  if (percent > 0 && percent < 1) {
    return percent.toFixed(2);
  }

  return String(percent);
}
