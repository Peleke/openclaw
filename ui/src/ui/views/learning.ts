/**
 * Learning layer view for gateway UI.
 */

import { html, nothing, type TemplateResult } from "lit";
import type { LearningState } from "../controllers/learning";
import { icons } from "../icons";

export function renderLearning(
  state: LearningState,
  onRefresh: () => void,
  onOpenDashboard: () => void,
): TemplateResult {
  const { config, summary, posteriors, loading, lastError } = state;

  return html`
    <div class="view-header">
      <div class="view-title">
        <h1>Learning</h1>
        <span class="view-subtitle">Thompson Sampling active learning for prompt optimization</span>
      </div>
      <div class="view-actions">
        <button class="btn btn-secondary" @click=${onRefresh} ?disabled=${loading}>
          ${icons.refreshCw} Refresh
        </button>
        <button class="btn btn-primary" @click=${onOpenDashboard}>
          ${icons.barChart} Open Dashboard
        </button>
      </div>
    </div>

    ${lastError ? html`<div class="alert alert-error">${lastError}</div>` : nothing}

    <div class="learning-grid">
      <!-- Config Section -->
      <section class="card">
        <div class="card-header">
          <h2>${icons.settings} Configuration</h2>
          ${config
            ? html`<span class="badge ${config.phase === "active" ? "badge-success" : "badge-muted"}"
                >${config.phase.toUpperCase()}</span
              >`
            : nothing}
        </div>
        <div class="card-body">
          ${config
            ? html`
                <div class="config-grid">
                  <div class="config-item">
                    <span class="config-label">Enabled</span>
                    <span class="config-value">${config.enabled ? "Yes" : "No"}</span>
                  </div>
                  <div class="config-item">
                    <span class="config-label">Phase</span>
                    <span class="config-value">${config.phase}</span>
                  </div>
                  <div class="config-item">
                    <span class="config-label">Token Budget</span>
                    <span class="config-value">${config.tokenBudget.toLocaleString()}</span>
                  </div>
                  <div class="config-item">
                    <span class="config-label">Baseline Rate</span>
                    <span class="config-value">${(config.baselineRate * 100).toFixed(0)}%</span>
                  </div>
                  <div class="config-item">
                    <span class="config-label">Min Pulls</span>
                    <span class="config-value">${config.minPulls}</span>
                  </div>
                </div>
              `
            : html`<p class="muted">Loading...</p>`}
        </div>
      </section>

      <!-- Summary Section -->
      <section class="card">
        <div class="card-header">
          <h2>${icons.barChart} Summary</h2>
        </div>
        <div class="card-body">
          ${summary
            ? html`
                <div class="stats-grid">
                  <div class="stat">
                    <span class="stat-value">${summary.traceCount}</span>
                    <span class="stat-label">Traces</span>
                  </div>
                  <div class="stat">
                    <span class="stat-value">${summary.armCount}</span>
                    <span class="stat-label">Arms</span>
                  </div>
                  <div class="stat">
                    <span class="stat-value">${summary.totalTokens.toLocaleString()}</span>
                    <span class="stat-label">Total Tokens</span>
                  </div>
                  ${summary.baseline.tokenSavingsPercent != null
                    ? html`
                        <div class="stat ${summary.baseline.tokenSavingsPercent > 0 ? "stat-positive" : "stat-negative"}">
                          <span class="stat-value"
                            >${summary.baseline.tokenSavingsPercent > 0 ? "+" : ""}${summary.baseline.tokenSavingsPercent.toFixed(1)}%</span
                          >
                          <span class="stat-label">Token Savings</span>
                        </div>
                      `
                    : nothing}
                </div>
                <div class="run-dist">
                  <span class="muted"
                    >Baseline: ${summary.baseline.baselineRuns} | Selected:
                    ${summary.baseline.selectedRuns}</span
                  >
                </div>
              `
            : html`<p class="muted">Loading...</p>`}
        </div>
      </section>

      <!-- Top Posteriors -->
      <section class="card card-wide">
        <div class="card-header">
          <h2>${icons.list} Top Arms</h2>
        </div>
        <div class="card-body">
          ${posteriors.length > 0
            ? html`
                <table class="table">
                  <thead>
                    <tr>
                      <th>Arm</th>
                      <th>Mean</th>
                      <th>Pulls</th>
                      <th>Confidence</th>
                    </tr>
                  </thead>
                  <tbody>
                    ${posteriors.map(
                      (p) => html`
                        <tr>
                          <td>
                            ${p.armId}
                            ${p.isSeed ? html`<span class="badge badge-success">SEED</span>` : nothing}
                            ${p.isUnderexplored
                              ? html`<span class="badge badge-warning">EXPLORE</span>`
                              : nothing}
                          </td>
                          <td>${p.mean.toFixed(3)}</td>
                          <td>${p.pulls}</td>
                          <td>
                            <span
                              class="confidence ${p.confidence === "high"
                                ? "confidence-high"
                                : p.confidence === "medium"
                                  ? "confidence-medium"
                                  : "confidence-low"}"
                              >${p.confidence}</span
                            >
                          </td>
                        </tr>
                      `,
                    )}
                  </tbody>
                </table>
              `
            : html`<p class="muted">No posteriors yet. Run some agent messages to start learning.</p>`}
        </div>
      </section>
    </div>

    <style>
      .learning-grid {
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
      .stat-positive .stat-value {
        color: var(--color-success);
      }
      .stat-negative .stat-value {
        color: var(--color-error);
      }
      .run-dist {
        margin-top: 12px;
        text-align: center;
      }
      .confidence {
        padding: 2px 6px;
        border-radius: 4px;
        font-size: 0.75rem;
      }
      .confidence-high {
        background: var(--color-success-bg);
        color: var(--color-success);
      }
      .confidence-medium {
        background: var(--color-warning-bg);
        color: var(--color-warning);
      }
      .confidence-low {
        background: var(--color-error-bg);
        color: var(--color-error);
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
      @media (max-width: 768px) {
        .learning-grid {
          grid-template-columns: 1fr;
        }
      }
    </style>
  `;
}
