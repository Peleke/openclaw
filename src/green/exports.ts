/**
 * Regulatory report export functions for GHG Protocol, CDP, TCFD, and ISO 14064.
 *
 * Compliance framework references:
 * - GHG Protocol Corporate Standard: https://ghgprotocol.org/corporate-standard
 * - CDP Climate Change Module: https://www.cdp.net/en/guidance/guidance-for-companies
 * - TCFD Recommendations: https://www.fsb-tcfd.org/recommendations/
 * - ISO 14064-1:2018: https://www.iso.org/standard/66453.html
 * - SBTi ICT Sector Guidance: https://sciencebasedtargets.org/sectors/ict
 */

import type { DatabaseSync } from "node:sqlite";
import type { GhgProtocolExport, CdpExport, TcfdExport, TargetProgress } from "./types.js";
import {
  getCarbonSummaryForPeriod,
  getTargetProgress,
  listCarbonTargets,
  getEmissionsForYear,
} from "./store.js";
import { confidenceToUncertainty } from "./carbon-calculator.js";

// -- Methodology Documentation --

export const METHODOLOGY_DESCRIPTION = `Per-token emission factors estimated from academic research (Lacoste et al. 2019, Patterson et al. 2022, Luccioni et al. 2024) with conservative fallbacks. Factors account for GPU power consumption during inference with approximately 3:1 output-to-input energy ratio. All calculations are Scope 3, Category 1 (Purchased Goods and Services) under the GHG Protocol Corporate Standard.`;

export const EMISSION_FACTOR_SOURCES = [
  "ML CO2 Impact Calculator (Lacoste et al., 2019)",
  "Carbon Emissions and Large Neural Network Training (Patterson et al., 2022)",
  "Power Hungry Processing (Luccioni et al., 2024)",
  "Cloud Carbon Footprint methodology",
  "CodeCarbon hardware measurements",
];

// -- Period Parsing Utilities --

/**
 * Convert period string to timestamp range.
 * Supports formats: "2025", "2025-Q1", "2025-W05", "2025-01"
 */
export function periodToRange(period: string): { start: number; end: number } {
  // Year only: "2025"
  const yearMatch = period.match(/^(\d{4})$/);
  if (yearMatch) {
    const year = parseInt(yearMatch[1], 10);
    return {
      start: new Date(year, 0, 1).getTime(),
      end: new Date(year + 1, 0, 1).getTime() - 1,
    };
  }

  // Quarter: "2025-Q1"
  const quarterMatch = period.match(/^(\d{4})-Q([1-4])$/);
  if (quarterMatch) {
    const year = parseInt(quarterMatch[1], 10);
    const quarter = parseInt(quarterMatch[2], 10);
    const startMonth = (quarter - 1) * 3;
    return {
      start: new Date(year, startMonth, 1).getTime(),
      end: new Date(year, startMonth + 3, 1).getTime() - 1,
    };
  }

  // Month: "2025-01"
  const monthMatch = period.match(/^(\d{4})-(\d{2})$/);
  if (monthMatch) {
    const year = parseInt(monthMatch[1], 10);
    const month = parseInt(monthMatch[2], 10) - 1;
    return {
      start: new Date(year, month, 1).getTime(),
      end: new Date(year, month + 1, 1).getTime() - 1,
    };
  }

  // ISO week: "2025-W05"
  const weekMatch = period.match(/^(\d{4})-W(\d{2})$/i);
  if (weekMatch) {
    const year = parseInt(weekMatch[1], 10);
    const week = parseInt(weekMatch[2], 10);

    // Find Monday of ISO week 1 (week containing Jan 4)
    const jan4 = new Date(Date.UTC(year, 0, 4));
    const dayOfWeek = jan4.getUTCDay() || 7; // Convert Sunday=0 to 7
    const mondayWeek1 = new Date(jan4);
    mondayWeek1.setUTCDate(jan4.getUTCDate() - dayOfWeek + 1);

    // Calculate Monday of target week
    const mondayOfWeek = new Date(mondayWeek1);
    mondayOfWeek.setUTCDate(mondayWeek1.getUTCDate() + (week - 1) * 7);

    // Sunday of target week (end of week)
    const sundayOfWeek = new Date(mondayOfWeek);
    sundayOfWeek.setUTCDate(mondayOfWeek.getUTCDate() + 6);
    sundayOfWeek.setUTCHours(23, 59, 59, 999);

    return {
      start: mondayOfWeek.getTime(),
      end: sundayOfWeek.getTime(),
    };
  }

  // Default: all time
  return { start: 0, end: Date.now() };
}

// -- GHG Protocol Export --

/**
 * Export data in GHG Protocol Corporate Standard format.
 * Scope 3, Category 1: Purchased Goods and Services.
 */
export function exportGhgProtocol(db: DatabaseSync, period: string): GhgProtocolExport {
  const { start, end } = periodToRange(period);
  const summary = getCarbonSummaryForPeriod(db, start, end);
  const uncertainty = confidenceToUncertainty(summary.avgConfidence);
  const uncertaintyPercent = ((uncertainty.upper - uncertainty.lower) / 2) * 100;

  // Map confidence to data quality descriptor
  const dataQuality =
    summary.avgConfidence >= 0.6 ? "Good" : summary.avgConfidence >= 0.3 ? "Fair" : "Poor";

  return {
    reportingPeriod: period,
    organizationalBoundary: "Operational control - AI inference API usage",
    scope3Category1: {
      emissions_tCO2eq: summary.totalCo2Grams / 1_000_000, // Convert g to t
      calculationMethod: "Average-data method using per-model emission factors",
      dataQuality,
      uncertainty_percent: Math.round(uncertaintyPercent),
      emissionFactorSources: EMISSION_FACTOR_SOURCES,
    },
  };
}

// -- CDP Climate Change Module Export --

/**
 * Export data in CDP Climate Change reporting format.
 * Covers Module 7 (Scope 3 emissions) structure.
 */
export function exportCdp(db: DatabaseSync, year: number): CdpExport {
  const { start, end } = periodToRange(String(year));
  const summary = getCarbonSummaryForPeriod(db, start, end);

  // Map confidence to CDP data quality categories
  const dataQuality: CdpExport["scope3"]["category1"]["dataQuality"] =
    summary.avgConfidence >= 0.6 ? "calculated" : "estimated";

  return {
    reportingYear: year,
    scope3: {
      category1: {
        emissions_tCO2eq: summary.totalCo2Grams / 1_000_000,
        methodology: "hybrid",
        methodologyDescription: METHODOLOGY_DESCRIPTION,
        dataQuality,
        percentageCalculatedUsingPrimaryData: 0, // No supplier-specific data yet
        emissionFactorSources: EMISSION_FACTOR_SOURCES,
      },
    },
    intensity: [
      {
        metric: "CO2 per million tokens",
        value: summary.intensityPerMillionTokens,
        unit: "gCO2eq/1M tokens",
      },
      {
        metric: "CO2 per API call",
        value: summary.intensityPerQuery,
        unit: "gCO2eq/call",
      },
    ],
  };
}

// -- TCFD Recommendations Export --

export type TcfdExportOptions = {
  period?: string;
  baseYear?: number;
};

/**
 * Export data aligned with TCFD Recommendations.
 * Includes absolute emissions, intensity metrics, targets, and historical trend.
 */
export function exportTcfd(db: DatabaseSync, opts: TcfdExportOptions = {}): TcfdExport {
  const period = opts.period ?? String(new Date().getFullYear());
  const { start, end } = periodToRange(period);
  const summary = getCarbonSummaryForPeriod(db, start, end);

  // Build historical trend (last 4 quarters)
  const historicalTrend: Array<{ period: string; emissions_tCO2eq: number }> = [];
  const now = new Date();
  for (let i = 3; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i * 3, 1);
    const q = Math.floor(d.getMonth() / 3) + 1;
    const qPeriod = `${d.getFullYear()}-Q${q}`;
    const { start: qs, end: qe } = periodToRange(qPeriod);
    const qSummary = getCarbonSummaryForPeriod(db, qs, qe);
    historicalTrend.push({
      period: qPeriod,
      emissions_tCO2eq: qSummary.totalCo2Grams / 1_000_000,
    });
  }

  // Get target progress
  const targets = listCarbonTargets(db);
  const targetProgress = targets
    .map((t) => getTargetProgress(db, t.targetId))
    .filter((p): p is TargetProgress => p !== null);

  // Baseline comparison
  let comparisonToBaseline: { baseYear: number; changePercent: number } | undefined;
  if (opts.baseYear) {
    const baseEmissions = getEmissionsForYear(db, opts.baseYear);
    if (baseEmissions > 0) {
      comparisonToBaseline = {
        baseYear: opts.baseYear,
        changePercent: ((summary.totalCo2Grams - baseEmissions) / baseEmissions) * 100,
      };
    }
  }

  return {
    absoluteEmissions: {
      scope3Cat1_tCO2eq: summary.totalCo2Grams / 1_000_000,
      reportingPeriod: period,
      comparisonToBaseline,
    },
    carbonIntensity: {
      perMillionTokens_gCO2eq: summary.intensityPerMillionTokens,
      perApiCall_gCO2eq: summary.intensityPerQuery,
    },
    targets: targetProgress.length > 0 ? targetProgress : undefined,
    historicalTrend,
  };
}

// -- ISO 14064-1 Compliance Summary --

export type Iso14064Summary = {
  reportingPeriod: string;
  organizationalBoundary: string;
  ghgInventory: {
    category: string;
    emissions_tCO2eq: number;
    uncertainty: {
      lower_tCO2eq: number;
      upper_tCO2eq: number;
      percent: number;
    };
    dataQuality: string;
    methodology: string;
  };
  baseYearComparison?: {
    baseYear: number;
    baseEmissions_tCO2eq: number;
    changePercent: number;
  };
};

/**
 * Export data aligned with ISO 14064-1:2018 requirements.
 * Includes uncertainty quantification required by the standard.
 */
export function exportIso14064(
  db: DatabaseSync,
  period: string,
  baseYear?: number,
): Iso14064Summary {
  const { start, end } = periodToRange(period);
  const summary = getCarbonSummaryForPeriod(db, start, end);
  const emissions_tCO2eq = summary.totalCo2Grams / 1_000_000;
  const uncertainty = confidenceToUncertainty(summary.avgConfidence);

  // ISO 14064 data quality description based on confidence
  const dataQuality =
    summary.avgConfidence >= 0.7
      ? "High quality - Based on verified emission factors"
      : summary.avgConfidence >= 0.5
        ? "Medium quality - Based on published research"
        : summary.avgConfidence >= 0.3
          ? "Low quality - Estimated from similar sources"
          : "Very low quality - Proxy data with high uncertainty";

  const result: Iso14064Summary = {
    reportingPeriod: period,
    organizationalBoundary: "Operational control",
    ghgInventory: {
      category: "Indirect GHG emissions from purchased goods and services (Category 4)",
      emissions_tCO2eq,
      uncertainty: {
        lower_tCO2eq: emissions_tCO2eq * uncertainty.lower,
        upper_tCO2eq: emissions_tCO2eq * uncertainty.upper,
        percent: ((uncertainty.upper - uncertainty.lower) / 2) * 100,
      },
      dataQuality,
      methodology: METHODOLOGY_DESCRIPTION,
    },
  };

  if (baseYear) {
    const baseEmissions = getEmissionsForYear(db, baseYear);
    if (baseEmissions > 0) {
      result.baseYearComparison = {
        baseYear,
        baseEmissions_tCO2eq: baseEmissions / 1_000_000,
        changePercent: ((summary.totalCo2Grams - baseEmissions) / baseEmissions) * 100,
      };
    }
  }

  return result;
}
