/**
 * Regional grid carbon intensity data and API integration.
 *
 * CURRENT STATUS: STUB
 * This file provides the architecture for future integration with external
 * regional grid carbon APIs. Currently uses static data from IEA 2023 averages.
 *
 * FUTURE API INTEGRATION CANDIDATES:
 * - Electricity Maps API (https://www.electricitymaps.com/) - Real-time, paid
 * - IEA Emission Factors (https://www.iea.org/data-and-statistics/) - Annual, paid
 * - EPA eGRID (https://www.epa.gov/egrid) - US only, free
 * - EEA CO2 Emission Intensity (https://www.eea.europa.eu/) - EU only, free
 *
 * To enable real-time regional data:
 * 1. Obtain API key from one of the above providers
 * 2. Set ELECTRICITY_MAPS_API_KEY or equivalent in environment
 * 3. Implement fetchRegionalGridCarbon() to call the API
 * 4. Update resolveRegionalGridCarbon() to use live data
 *
 * References:
 * - IEA World Energy Outlook 2023: https://www.iea.org/reports/world-energy-outlook-2023
 * - GHG Protocol Scope 2 Guidance: https://ghgprotocol.org/scope_2_guidance
 */

// -- Types --

export type RegionalGridData = {
  region: string;
  country: string;
  gridCarbonIntensity: number; // gCO₂/kWh
  source: "static" | "api" | "fallback";
  lastUpdated: number;
  methodology: "market-based" | "location-based";
};

export type CloudProviderRegion = {
  provider: string;
  region: string;
  country: string;
  ieaRegion?: string;
};

// -- Static IEA Country Averages (2023) --
// Source: IEA CO2 Emissions from Fuel Combustion Highlights 2023
// Units: gCO₂/kWh for electricity generation

/**
 * Static grid carbon intensity by IEA country/region (2023 averages).
 * STUB: Replace with API call when external integration is available.
 *
 * These are ANNUAL AVERAGES and do not reflect real-time marginal emissions.
 * For accurate location-based reporting, use an API like Electricity Maps.
 */
export const IEA_COUNTRY_AVERAGES: Record<string, number> = {
  // Major cloud provider countries
  US: 379, // United States
  DE: 352, // Germany
  GB: 207, // United Kingdom
  FR: 52, // France (low due to nuclear)
  IE: 296, // Ireland
  NL: 328, // Netherlands
  SE: 41, // Sweden (low due to hydro/nuclear)
  NO: 26, // Norway (low due to hydro)
  FI: 79, // Finland
  DK: 140, // Denmark
  BE: 155, // Belgium
  IT: 315, // Italy
  ES: 167, // Spain
  PL: 635, // Poland (high coal use)
  JP: 457, // Japan
  KR: 415, // South Korea
  SG: 408, // Singapore
  AU: 517, // Australia
  IN: 632, // India
  BR: 85, // Brazil (hydro)
  CA: 110, // Canada
  ZA: 709, // South Africa (high coal)
  CL: 294, // Chile
  AE: 380, // UAE

  // Global fallback
  WORLD: 436,
};

// -- Cloud Provider Region Mapping --
// Maps cloud provider regions to ISO country codes

/**
 * Map cloud provider regions to countries for grid carbon lookup.
 * STUB: Extend as needed for additional providers.
 */
export const CLOUD_REGION_TO_COUNTRY: CloudProviderRegion[] = [
  // AWS US regions
  { provider: "aws", region: "us-east-1", country: "US" },
  { provider: "aws", region: "us-east-2", country: "US" },
  { provider: "aws", region: "us-west-1", country: "US" },
  { provider: "aws", region: "us-west-2", country: "US" },
  // AWS Europe regions
  { provider: "aws", region: "eu-west-1", country: "IE" },
  { provider: "aws", region: "eu-west-2", country: "GB" },
  { provider: "aws", region: "eu-west-3", country: "FR" },
  { provider: "aws", region: "eu-central-1", country: "DE" },
  { provider: "aws", region: "eu-north-1", country: "SE" },
  // AWS Asia-Pacific regions
  { provider: "aws", region: "ap-northeast-1", country: "JP" },
  { provider: "aws", region: "ap-northeast-2", country: "KR" },
  { provider: "aws", region: "ap-southeast-1", country: "SG" },
  { provider: "aws", region: "ap-southeast-2", country: "AU" },
  { provider: "aws", region: "ap-south-1", country: "IN" },
  // AWS Other
  { provider: "aws", region: "sa-east-1", country: "BR" },
  { provider: "aws", region: "ca-central-1", country: "CA" },

  // GCP US regions
  { provider: "gcp", region: "us-central1", country: "US" },
  { provider: "gcp", region: "us-east1", country: "US" },
  { provider: "gcp", region: "us-east4", country: "US" },
  { provider: "gcp", region: "us-west1", country: "US" },
  { provider: "gcp", region: "us-west2", country: "US" },
  { provider: "gcp", region: "us-west3", country: "US" },
  { provider: "gcp", region: "us-west4", country: "US" },
  // GCP Europe regions
  { provider: "gcp", region: "europe-west1", country: "BE" },
  { provider: "gcp", region: "europe-west2", country: "GB" },
  { provider: "gcp", region: "europe-west3", country: "DE" },
  { provider: "gcp", region: "europe-west4", country: "NL" },
  { provider: "gcp", region: "europe-west6", country: "CH" },
  { provider: "gcp", region: "europe-north1", country: "FI" },
  // GCP Asia-Pacific
  { provider: "gcp", region: "asia-east1", country: "TW" },
  { provider: "gcp", region: "asia-northeast1", country: "JP" },
  { provider: "gcp", region: "asia-southeast1", country: "SG" },
  { provider: "gcp", region: "australia-southeast1", country: "AU" },

  // Azure US regions
  { provider: "azure", region: "eastus", country: "US" },
  { provider: "azure", region: "eastus2", country: "US" },
  { provider: "azure", region: "westus", country: "US" },
  { provider: "azure", region: "westus2", country: "US" },
  { provider: "azure", region: "centralus", country: "US" },
  // Azure Europe regions
  { provider: "azure", region: "northeurope", country: "IE" },
  { provider: "azure", region: "westeurope", country: "NL" },
  { provider: "azure", region: "uksouth", country: "GB" },
  { provider: "azure", region: "ukwest", country: "GB" },
  { provider: "azure", region: "francecentral", country: "FR" },
  { provider: "azure", region: "germanywestcentral", country: "DE" },
  { provider: "azure", region: "swedencentral", country: "SE" },
  // Azure Asia-Pacific
  { provider: "azure", region: "japaneast", country: "JP" },
  { provider: "azure", region: "japanwest", country: "JP" },
  { provider: "azure", region: "southeastasia", country: "SG" },
  { provider: "azure", region: "australiaeast", country: "AU" },
];

// Add Swiss average since it's not in IEA_COUNTRY_AVERAGES
const EXTENDED_AVERAGES: Record<string, number> = {
  ...IEA_COUNTRY_AVERAGES,
  CH: 24, // Switzerland (hydro/nuclear)
  TW: 509, // Taiwan
};

// -- Resolution Functions --

/**
 * Look up country code for a cloud provider region.
 */
export function regionToCountry(region: string): string | null {
  // Try exact match first
  const match = CLOUD_REGION_TO_COUNTRY.find(
    (r) => r.region.toLowerCase() === region.toLowerCase(),
  );
  if (match) return match.country;

  // Try prefix match (e.g., "us-east-1a" -> "us-east-1")
  const prefix = region.toLowerCase().replace(/-[a-z]$/, "");
  const prefixMatch = CLOUD_REGION_TO_COUNTRY.find((r) => r.region.toLowerCase() === prefix);
  if (prefixMatch) return prefixMatch.country;

  return null;
}

/**
 * Get static grid carbon intensity for a country.
 */
export function getCountryGridCarbon(country: string): number | null {
  const upper = country.toUpperCase();
  return EXTENDED_AVERAGES[upper] ?? null;
}

/**
 * Resolve regional grid carbon intensity for a cloud region.
 * STUB: Currently uses static IEA averages. Replace with API call for real-time data.
 *
 * @param region - Cloud provider region (e.g., "us-east-1", "eu-west-1")
 * @param defaultGridCarbon - Fallback value if region cannot be resolved
 * @returns Regional grid data including intensity and source
 */
export function resolveRegionalGridCarbon(
  region: string | undefined,
  defaultGridCarbon: number = 400,
): RegionalGridData {
  if (!region) {
    return {
      region: "unknown",
      country: "WORLD",
      gridCarbonIntensity: defaultGridCarbon,
      source: "fallback",
      lastUpdated: Date.now(),
      methodology: "location-based",
    };
  }

  const country = regionToCountry(region);
  if (!country) {
    return {
      region,
      country: "WORLD",
      gridCarbonIntensity: defaultGridCarbon,
      source: "fallback",
      lastUpdated: Date.now(),
      methodology: "location-based",
    };
  }

  const intensity = getCountryGridCarbon(country);
  if (intensity === null) {
    return {
      region,
      country,
      gridCarbonIntensity: defaultGridCarbon,
      source: "fallback",
      lastUpdated: Date.now(),
      methodology: "location-based",
    };
  }

  return {
    region,
    country,
    gridCarbonIntensity: intensity,
    source: "static",
    lastUpdated: Date.now(),
    methodology: "location-based",
  };
}

// -- Future API Integration Stubs --

/**
 * STUB: Fetch real-time grid carbon from Electricity Maps API.
 * Requires ELECTRICITY_MAPS_API_KEY environment variable.
 *
 * @param countryCode - ISO 3166-1 alpha-2 country code
 * @returns Grid carbon intensity in gCO₂/kWh, or null if unavailable
 */
export async function fetchElectricityMapsCarbon(_countryCode: string): Promise<number | null> {
  // STUB: Implement when API key is available
  // const apiKey = process.env.ELECTRICITY_MAPS_API_KEY;
  // if (!apiKey) return null;
  //
  // const url = `https://api.electricitymap.org/v3/carbon-intensity/latest?zone=${countryCode}`;
  // const response = await fetch(url, {
  //   headers: { "auth-token": apiKey },
  // });
  // if (!response.ok) return null;
  // const data = await response.json();
  // return data.carbonIntensity;

  return null;
}

/**
 * STUB: Fetch grid carbon from EPA eGRID for US regions.
 * Uses subregion-level data for more accurate US estimates.
 *
 * @param egridSubregion - eGRID subregion code (e.g., "RFCE", "CAMX")
 * @returns Grid carbon intensity in gCO₂/kWh, or null if unavailable
 */
export async function fetchEgridCarbon(_egridSubregion: string): Promise<number | null> {
  // STUB: Implement when eGRID data integration is available
  // eGRID data is published annually by EPA and can be cached locally
  return null;
}

// -- Configuration Type --

export type RegionalGridConfig = {
  /**
   * Enable real-time regional grid carbon lookups.
   * Requires API key for external service.
   */
  enabled: boolean;

  /**
   * API provider to use for real-time data.
   * Currently stubbed; will be implemented when API is available.
   */
  provider?: "electricity-maps" | "egrid" | "static";

  /**
   * API key for the selected provider.
   */
  apiKey?: string;

  /**
   * Cache TTL for API responses in milliseconds.
   * Default: 15 minutes (grid carbon changes slowly).
   */
  cacheTtlMs?: number;

  /**
   * Default region to use when region cannot be determined.
   */
  defaultRegion?: string;
};

/**
 * Default configuration for regional grid carbon.
 * Uses static IEA data until API integration is implemented.
 */
export const DEFAULT_REGIONAL_GRID_CONFIG: Required<RegionalGridConfig> = {
  enabled: false, // Disabled until API is available
  provider: "static",
  apiKey: "",
  cacheTtlMs: 15 * 60 * 1000, // 15 minutes
  defaultRegion: "us-east-1",
};
