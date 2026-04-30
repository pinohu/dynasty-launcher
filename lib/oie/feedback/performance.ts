export function computePerformanceScore(data: { revenue?: number; conversions?: number; timeToRevenue?: number }) {
  const revenue = Number.isFinite(data.revenue) ? Number(data.revenue) : 0;
  const conversions = Number.isFinite(data.conversions) ? Number(data.conversions) : 0;
  const timeToRevenue = Number.isFinite(data.timeToRevenue) ? Math.max(0, Number(data.timeToRevenue)) : 0;
  const score = revenue * 0.5 + conversions * 0.3 + (1 / (timeToRevenue + 1)) * 0.2;
  return Number.isFinite(score) ? score : 0;
}
