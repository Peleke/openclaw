import { describe, it, expect } from "vitest";
import { generateLearningDashboardHtml } from "./dashboard-html.js";

describe("generateLearningDashboardHtml", () => {
  const html = generateLearningDashboardHtml({
    apiBase: "http://localhost:18789/__openclaw__/api/learning",
  });

  it("includes Chart.js CDN", () => {
    expect(html).toContain("chart.js");
  });

  it("includes 3 canvas elements", () => {
    const canvasMatches = html.match(/<canvas /g);
    expect(canvasMatches).toHaveLength(3);
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
});
