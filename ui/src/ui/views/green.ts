/**
 * Green layer view for gateway UI.
 * Displays environmental impact tracking and compliance metrics.
 */

import { html, nothing, type TemplateResult } from "lit";
import type {
  GreenState,
  GreenSummary,
  GreenTarget,
  GreenTargetProgress,
} from "../controllers/green";
import {
  formatCo2,
  formatWater,
  confidenceLabel,
  dataQualityScore,
} from "../controllers/green";
import { icons } from "../icons";

export function renderGreen(
  state: GreenState,
  onRefresh: () => void,
): TemplateResult {
  const { summary, targets, targetProgress, loading, lastError } = state;

  return html`
    <div class="view-header">
      <div class="view-title">
        <h1>Environmental Impact</h1>
        <span class="view-subtitle"
          >Carbon tracking and regulatory compliance (GHG Protocol, TCFD,
          SBTi)</span
        >
      </div>
      <div class="view-actions">
        <button
          class="btn btn-secondary"
          @click=${onRefresh}
          ?disabled=${loading}
        >
          ${icons.refreshCw} Refresh
        </button>
      </div>
    </div>

    ${lastError
      ? html`<div class="alert alert-error">${lastError}</div>`
      : nothing}

    <div class="green-grid">
      <!-- Summary Section -->
      <section class="card">
        <div class="card-header">
          <h2>${icons.activity} Carbon Summary</h2>
          ${summary
            ? html`<span
                class="badge ${summary.avgConfidence >= 0.5
                  ? "badge-success"
                  : "badge-warning"}"
                >${(summary.avgConfidence * 100).toFixed(0)}%
                Confidence</span
              >`
            : nothing}
        </div>
        <div class="card-body">
          ${summary
            ? html`
                <div class="stats-grid">
                  <div class="stat">
                    <span class="stat-value">${formatCo2(summary.totalCo2Grams)}</span>
                    <span class="stat-label">Total CO₂eq</span>
                  </div>
                  <div class="stat">
                    <span class="stat-value">${formatWater(summary.totalWaterMl)}</span>
                    <span class="stat-label">Water Usage</span>
                  </div>
                  <div class="stat">
                    <span class="stat-value">${summary.traceCount}</span>
                    <span class="stat-label">API Calls</span>
                  </div>
                  <div class="stat">
                    <span class="stat-value"
                      >${summary.totalTokens.toLocaleString()}</span
                    >
                    <span class="stat-label">Tokens</span>
                  </div>
                </div>
              `
            : html`<p class="muted">Loading...</p>`}
        </div>
      </section>

      <!-- Intensity Metrics (TCFD) -->
      <section class="card">
        <div class="card-header">
          <h2>${icons.barChart} Intensity Metrics</h2>
          <span class="badge badge-muted">TCFD</span>
        </div>
        <div class="card-body">
          ${summary
            ? html`
                <div class="config-grid">
                  <div class="config-item">
                    <span class="config-label">Per Million Tokens</span>
                    <span class="config-value"
                      >${summary.intensityPerMillionTokens.toFixed(2)}
                      gCO₂eq</span
                    >
                  </div>
                  <div class="config-item">
                    <span class="config-label">Per API Call</span>
                    <span class="config-value"
                      >${summary.intensityPerQuery.toFixed(4)} gCO₂eq</span
                    >
                  </div>
                  <div class="config-item">
                    <span class="config-label">Uncertainty Range</span>
                    <span class="config-value"
                      >${(summary.uncertaintyLower * 100).toFixed(0)}% -
                      ${(summary.uncertaintyUpper * 100).toFixed(0)}%</span
                    >
                  </div>
                </div>
              `
            : html`<p class="muted">Loading...</p>`}
        </div>
      </section>

      <!-- Data Quality (GHG Protocol) -->
      <section class="card">
        <div class="card-header">
          <h2>${icons.checkCircle} Data Quality</h2>
          <span class="badge badge-muted">GHG Protocol</span>
        </div>
        <div class="card-body">
          ${summary
            ? html`
                <div class="config-grid">
                  <div class="config-item">
                    <span class="config-label">Quality Score</span>
                    <span class="config-value"
                      >${dataQualityScore(summary.avgConfidence)} / 5</span
                    >
                  </div>
                  <div class="config-item">
                    <span class="config-label">Confidence Level</span>
                    <span class="config-value"
                      >${confidenceLabel(summary.avgConfidence)}</span
                    >
                  </div>
                  <div class="config-item">
                    <span class="config-label">Scope</span>
                    <span class="config-value">Scope 3, Category 1</span>
                  </div>
                  <div class="config-item">
                    <span class="config-label">Method</span>
                    <span class="config-value">Average-data</span>
                  </div>
                </div>
              `
            : html`<p class="muted">Loading...</p>`}
        </div>
      </section>

      <!-- Provider Breakdown -->
      <section class="card">
        <div class="card-header">
          <h2>${icons.pieChart} By Provider</h2>
        </div>
        <div class="card-body">
          ${summary?.byProvider && Object.keys(summary.byProvider).length > 0
            ? html`
                <table class="table">
                  <thead>
                    <tr>
                      <th>Provider</th>
                      <th style="text-align: right">Traces</th>
                      <th style="text-align: right">CO₂eq</th>
                    </tr>
                  </thead>
                  <tbody>
                    ${Object.entries(summary.byProvider).map(
                      ([provider, data]) => html`
                        <tr>
                          <td>${provider}</td>
                          <td style="text-align: right">${data.traceCount}</td>
                          <td style="text-align: right">
                            ${formatCo2(data.co2Grams)}
                          </td>
                        </tr>
                      `,
                    )}
                  </tbody>
                </table>
              `
            : html`<p class="muted">No provider data yet.</p>`}
        </div>
      </section>

      <!-- Targets (SBTi) -->
      <section class="card card-wide">
        <div class="card-header">
          <h2>${icons.target} Emission Targets</h2>
          <span class="badge badge-muted">SBTi</span>
        </div>
        <div class="card-body">
          ${targets.length > 0
            ? html`
                <table class="table">
                  <thead>
                    <tr>
                      <th>Target</th>
                      <th>Pathway</th>
                      <th style="text-align: right">Reduction</th>
                      <th style="text-align: right">Progress</th>
                      <th style="text-align: right">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    ${targetProgress.map(
                      (p) => html`
                        <tr>
                          <td>
                            ${p.target.name}
                            <span class="muted"
                              >(${p.target.baseYear}→${p.target.targetYear})</span
                            >
                          </td>
                          <td>${p.target.pathway}</td>
                          <td style="text-align: right">
                            ${p.target.targetReductionPercent}%
                          </td>
                          <td style="text-align: right">
                            ${p.progressPercent.toFixed(1)}%
                          </td>
                          <td style="text-align: right">
                            <span
                              class="badge ${p.onTrack
                                ? "badge-success"
                                : "badge-warning"}"
                            >
                              ${p.onTrack ? "On Track" : "Behind"}
                            </span>
                          </td>
                        </tr>
                      `,
                    )}
                  </tbody>
                </table>
              `
            : html`<p class="muted">
                No targets set. Use
                <code>openclaw green targets:add</code> to create one.
              </p>`}
        </div>
      </section>

      <!-- Export Formats -->
      <section class="card card-wide">
        <div class="card-header">
          <h2>${icons.fileText} Regulatory Exports</h2>
        </div>
        <div class="card-body">
          <p class="muted" style="margin-bottom: 12px;">
            Export carbon data in regulatory formats via CLI:
          </p>
          <div class="export-commands">
            <code>openclaw green export --format ghg-protocol --period 2026</code>
            <code>openclaw green export --format cdp --period 2026</code>
            <code>openclaw green export --format tcfd --period 2026</code>
            <code>openclaw green export --format iso14064 --period 2026</code>
          </div>
        </div>
      </section>
    </div>

    <style>
      .green-grid {
        display: grid;
        grid-template-columns: 1fr 1fr;
        gap: 16px;
        margin-top: 16px;
      }
      .card-wide {
        grid-column: 1 / -1;
      }
      .config-grid,
      .stats-grid {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(120px, 1fr));
        gap: 12px;
      }
      .config-item {
        display: flex;
        flex-direction: column;
        gap: 4px;
      }
      .config-label {
        font-size: 0.75rem;
        color: var(--color-text-muted);
        text-transform: uppercase;
      }
      .config-value {
        font-size: 1rem;
        font-weight: 500;
      }
      .stat {
        text-align: center;
        padding: 12px;
        background: var(--color-bg-secondary);
        border-radius: 8px;
      }
      .stat-value {
        display: block;
        font-size: 1.5rem;
        font-weight: bold;
        color: var(--color-accent);
      }
      .stat-label {
        font-size: 0.75rem;
        color: var(--color-text-muted);
        text-transform: uppercase;
      }
      .badge {
        display: inline-block;
        padding: 2px 6px;
        border-radius: 4px;
        font-size: 0.7rem;
        margin-left: 4px;
      }
      .badge-success {
        background: var(--color-success-bg);
        color: var(--color-success);
      }
      .badge-warning {
        background: var(--color-warning-bg);
        color: var(--color-warning);
      }
      .badge-muted {
        background: var(--color-bg-secondary);
        color: var(--color-text-muted);
      }
      .export-commands {
        display: flex;
        flex-direction: column;
        gap: 8px;
      }
      .export-commands code {
        display: block;
        background: var(--color-bg-secondary);
        padding: 8px 12px;
        border-radius: 4px;
        font-family: monospace;
        font-size: 0.85rem;
      }
      @media (max-width: 768px) {
        .green-grid {
          grid-template-columns: 1fr;
        }
      }
    </style>
  `;
}
