import { describe, expect, it } from "vitest";

import { generateGreenDashboardHtml } from "./dashboard-html.js";

describe("generateGreenDashboardHtml", () => {
  const apiBase = "http://localhost:18789/__openclaw__/api/green";
  const html = generateGreenDashboardHtml({ apiBase });

  describe("basic structure", () => {
    it("returns valid HTML document", () => {
      expect(html).toContain("<!DOCTYPE html>");
      expect(html).toContain("<html");
      expect(html).toContain("</html>");
      expect(html).toContain("<head>");
      expect(html).toContain("</head>");
      expect(html).toContain("<body>");
      expect(html).toContain("</body>");
    });

    it("includes page title", () => {
      expect(html).toContain("<title>OpenClaw Green Dashboard</title>");
    });

    it("includes viewport meta tag", () => {
      expect(html).toContain('name="viewport"');
      expect(html).toContain("width=device-width");
    });

    it("includes charset meta tag", () => {
      expect(html).toContain('charset="utf-8"');
    });
  });

  describe("API integration", () => {
    it("interpolates API base URL correctly", () => {
      expect(html).toContain(`const API = "${apiBase}"`);
    });

    it("includes fetch for summary endpoint", () => {
      expect(html).toContain("fetchJson('/summary')");
    });

    it("includes fetch for timeseries endpoint", () => {
      expect(html).toContain("fetchJson('/timeseries?bucket=1d')");
    });

    it("includes fetch for intensity endpoint", () => {
      expect(html).toContain("fetchJson('/intensity')");
    });

    it("includes fetch for targets endpoint", () => {
      expect(html).toContain("fetchJson('/targets')");
    });

    it("includes fetch for traces endpoint", () => {
      expect(html).toContain("fetchJson('/traces?limit=20')");
    });

    it("includes fetch for config endpoint", () => {
      expect(html).toContain("fetchJson('/config')");
    });
  });

  describe("Chart.js integration", () => {
    it("includes Chart.js CDN script", () => {
      expect(html).toContain("https://cdn.jsdelivr.net/npm/chart.js@4");
    });

    it("creates timeseries chart", () => {
      expect(html).toContain("timeseriesChart");
      expect(html).toContain("new Chart(ctx");
    });

    it("creates provider doughnut chart", () => {
      expect(html).toContain("providerChart");
      expect(html).toContain("type: 'doughnut'");
    });
  });

  describe("UI sections", () => {
    it("includes header with title", () => {
      expect(html).toContain("Green Dashboard");
      expect(html).toContain('class="header"');
    });

    it("includes status badge", () => {
      expect(html).toContain('id="statusBadge"');
      expect(html).toContain("status-enabled");
      expect(html).toContain("status-disabled");
    });

    it("includes summary cards section", () => {
      expect(html).toContain('id="summary"');
      expect(html).toContain("Total CO₂");
      expect(html).toContain("Total Water");
      expect(html).toContain("Requests");
      expect(html).toContain("Avg/Request");
      expect(html).toContain("Confidence");
    });

    it("includes equivalents panel", () => {
      expect(html).toContain('id="equivalentsPanel"');
      expect(html).toContain("Real-World Equivalents");
      expect(html).toContain("Car travel");
      expect(html).toContain("Phone charges");
      expect(html).toContain("Tree absorption");
      expect(html).toContain("Google searches");
    });

    it("includes timeseries chart section", () => {
      expect(html).toContain('id="timeseriesChart"');
      expect(html).toContain("Emissions Over Time");
    });

    it("includes provider chart section", () => {
      expect(html).toContain('id="providerChart"');
      expect(html).toContain("Provider Breakdown");
    });

    it("includes intensity metrics panel", () => {
      expect(html).toContain('id="intensityGrid"');
      expect(html).toContain("Carbon Intensity (TCFD Metrics)");
    });

    it("includes targets panel", () => {
      expect(html).toContain('id="targetsPanel"');
      expect(html).toContain("Emission Reduction Targets (SBTi)");
    });

    it("includes traces table", () => {
      expect(html).toContain('id="tracesBody"');
      expect(html).toContain("Recent Traces");
      expect(html).toContain("<th>Time</th>");
      expect(html).toContain("<th>Provider</th>");
      expect(html).toContain("<th>Model</th>");
      expect(html).toContain("<th>Tokens</th>");
      expect(html).toContain("<th>CO₂ (g)</th>");
      expect(html).toContain("<th>Confidence</th>");
    });
  });

  describe("CSS theme", () => {
    it("uses dark background color", () => {
      expect(html).toContain("background: #1a1a2e");
    });

    it("uses card background color", () => {
      expect(html).toContain("background: #16213e");
    });

    it("uses green accent color", () => {
      expect(html).toContain("color: #2FBF71");
    });

    it("uses muted text color", () => {
      expect(html).toContain("color: #8B7F77");
    });

    it("uses warning color", () => {
      expect(html).toContain("#FFB020");
    });

    it("uses error color", () => {
      expect(html).toContain("#E23D2D");
    });

    it("includes responsive media query", () => {
      expect(html).toContain("@media (max-width: 768px)");
    });
  });

  describe("auto-refresh", () => {
    it("calls refresh on load", () => {
      expect(html).toContain("refresh();");
    });

    it("sets up 30-second interval", () => {
      expect(html).toContain("setInterval(refresh, 30000)");
    });

    it("includes auto-refresh subtitle", () => {
      expect(html).toContain("Auto-refreshes every 30s");
    });
  });

  describe("helper functions", () => {
    it("includes formatCo2 function", () => {
      expect(html).toContain("function formatCo2(grams)");
    });

    it("includes formatWater function", () => {
      expect(html).toContain("function formatWater(ml)");
    });

    it("includes getConfidenceClass function", () => {
      expect(html).toContain("function getConfidenceClass(conf)");
    });

    it("includes getConfidenceLabel function", () => {
      expect(html).toContain("function getConfidenceLabel(conf)");
    });
  });

  describe("render functions", () => {
    it("includes renderSummary function", () => {
      expect(html).toContain("function renderSummary(summary)");
    });

    it("includes renderEquivalents function", () => {
      expect(html).toContain("function renderEquivalents(equivalents)");
    });

    it("includes renderTimeseries function", () => {
      expect(html).toContain("function renderTimeseries(buckets)");
    });

    it("includes renderProviders function", () => {
      expect(html).toContain("function renderProviders(providers)");
    });

    it("includes renderIntensity function", () => {
      expect(html).toContain("function renderIntensity(intensity)");
    });

    it("includes renderTargets function", () => {
      expect(html).toContain("function renderTargets(data)");
    });

    it("includes renderTraces function", () => {
      expect(html).toContain("function renderTraces(traces)");
    });
  });

  describe("error handling", () => {
    it("handles empty/null data gracefully", () => {
      expect(html).toContain("No data");
      expect(html).toContain("No traces yet");
    });

    it("includes error logging", () => {
      expect(html).toContain("console.error");
    });

    it("includes try-catch for fetches", () => {
      expect(html).toContain("try {");
      expect(html).toContain("catch (err)");
    });
  });

  describe("different API bases", () => {
    it("works with localhost URL", () => {
      const localHtml = generateGreenDashboardHtml({
        apiBase: "http://localhost:18789/__openclaw__/api/green",
      });
      expect(localHtml).toContain("http://localhost:18789/__openclaw__/api/green");
    });

    it("works with Tailscale URL", () => {
      const tailscaleHtml = generateGreenDashboardHtml({
        apiBase: "http://100.64.0.1:18789/__openclaw__/api/green",
      });
      expect(tailscaleHtml).toContain("http://100.64.0.1:18789/__openclaw__/api/green");
    });

    it("escapes special characters in URL", () => {
      const html = generateGreenDashboardHtml({ apiBase: 'http://test"host' });
      // JSON.stringify should escape the quote
      expect(html).toContain('\\"');
    });
  });

  describe("confidence badges", () => {
    it("includes high confidence styling", () => {
      expect(html).toContain("conf-high");
      expect(html).toContain("High");
    });

    it("includes medium confidence styling", () => {
      expect(html).toContain("conf-medium");
      expect(html).toContain("Medium");
    });

    it("includes low confidence styling", () => {
      expect(html).toContain("conf-low");
      expect(html).toContain("Low");
    });
  });

  describe("target progress UI", () => {
    it("includes on-track status", () => {
      expect(html).toContain("on-track");
      expect(html).toContain("✓ On track");
    });

    it("includes behind status", () => {
      expect(html).toContain("behind");
      expect(html).toContain("⚠ Behind");
    });

    it("includes progress bar", () => {
      expect(html).toContain("progress-bar");
      expect(html).toContain("progress-fill");
    });
  });
});
