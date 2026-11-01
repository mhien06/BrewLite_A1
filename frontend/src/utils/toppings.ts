// Gom các phần giống nhau để hiển thị rõ số phần trên mỗi ly.
export function formatToppingLabels(labels: string[]): string {
  const counts = new Map<string, number>();
  for (const label of labels) counts.set(label, (counts.get(label) ?? 0) + 1);
  return [...counts].map(([label, count]) => count > 1 ? `${label} × ${count}` : label).join(", ");
}
