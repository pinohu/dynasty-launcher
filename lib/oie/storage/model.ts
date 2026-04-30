export interface IdeaRecord {
  id: string;
  idea: string;
  baseScore: number;
  adjustment: number;
  finalScore: number;
  confidence: number;
  leads?: number;
  conversions?: number;
  revenue?: number;
  timeToRevenue?: number;
  performanceScore?: number;
  createdAt?: string;
  updatedAt?: string;
}

export interface OIEHealthRecord {
  totalScores: number;
  fallbackCount: number;
  avgScore: number;
  lastOptimizationRun: string | null;
}
