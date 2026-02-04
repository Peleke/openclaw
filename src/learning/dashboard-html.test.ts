import { describe, it, expect } from "vitest";
import { generateLearningDashboardHtml } from "./dashboard-html.js";

describe("generateLearningDashboardHtml", () => {
  const html = generateLearningDashboardHtml({
    apiBase: "http://localhost:18789/__openclaw__/api/learning",
  });

  it("includes Chart.js CDN", () => {
    expect(html).toContain("chart.js");
  });

  it("includes canvas elements for all charts", () => {
    const canvasMatches = html.match(/<canvas /g);
    // convergenceChart, baselineChart, tokensChart, runDistChart, heatmapCanvas
    expect(canvasMatches).toHaveLength(5);
  });

  it("includes the API base URL", () => {
    expect(html).toContain("http://localhost:18789/__openclaw__/api/learning");
  });

  it("includes auto-refresh interval", () => {
    expect(html).toContain("setInterval(refresh, 30000)");
  });

  it("is valid HTML structure", () => {
    expect(html).toContain("<!DOCTYPE html>");
    expect(html).toContain("</html>");
  });

  it("includes mode badge", () => {
    expect(html).toContain('id="modeBadge"');
    expect(html).toContain("mode-passive");
    expect(html).toContain("mode-active");
  });

  it("includes heatmap legend", () => {
    expect(html).toContain("heatmap-legend");
    expect(html).toContain("Referenced");
    expect(html).toContain("Included (not used)");
    expect(html).toContain("Excluded");
  });

  it("includes posteriors table", () => {
    expect(html).toContain("posteriors-table");
    expect(html).toContain('id="posteriorsBody"');
    expect(html).toContain("Credible Interval");
  });

  it("includes renderConfig function", () => {
    expect(html).toContain("function renderConfig(config)");
  });

  it("includes renderBaseline function", () => {
    expect(html).toContain("function renderBaseline(baseline)");
  });

  it("includes renderPosteriors function", () => {
    expect(html).toContain("function renderPosteriors(posteriors)");
  });

  it("fetches config in refresh", () => {
    expect(html).toContain("fetchJson('/config')");
    expect(html).toContain("renderConfig(config)");
  });
});
