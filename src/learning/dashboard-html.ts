/**
 * Self-contained HTML dashboard for learning layer observability.
 * Chart.js from CDN, dark theme, auto-refreshes every 30s.
 */

export function generateLearningDashboardHtml(opts: { apiBase: string }): string {
  const { apiBase } = opts;
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>OpenClaw Learning Dashboard</title>
<script src="https://cdn.jsdelivr.net/npm/chart.js@4"></script>
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { background: #1a1a2e; color: #e0e0e0; font-family: system-ui, sans-serif; padding: 24px; }
  h1 { color: #FF5A2D; margin-bottom: 8px; font-size: 1.6rem; display: inline-block; }
  .header { display: flex; align-items: center; gap: 12px; margin-bottom: 8px; }
  .mode-badge { padding: 4px 12px; border-radius: 4px; font-size: 0.75rem; font-weight: bold; text-transform: uppercase; }
  .mode-passive { background: #3b4c66; color: #8B9AAB; }
  .mode-active { background: #2a5a3e; color: #2FBF71; }
  .subtitle { color: #8B7F77; margin-bottom: 24px; font-size: 0.9rem; }
  .summary { display: flex; gap: 24px; margin-bottom: 24px; flex-wrap: wrap; }
  .stat { background: #16213e; border-radius: 8px; padding: 16px 24px; min-width: 140px; }
  .stat .label { color: #8B7F77; font-size: 0.8rem; text-transform: uppercase; }
  .stat .value { color: #FF5A2D; font-size: 1.8rem; font-weight: bold; margin-top: 4px; }
  .stat .value.positive { color: #2FBF71; }
  .stat .value.negative { color: #E23D2D; }
  .stat .sub { color: #8B7F77; font-size: 0.7rem; margin-top: 2px; }
  .charts { display: grid; grid-template-columns: 1fr 1fr; gap: 24px; margin-bottom: 24px; }
  .chart-box { background: #16213e; border-radius: 8px; padding: 16px; }
  .chart-box h2 { color: #FF8A5B; font-size: 1rem; margin-bottom: 12px; }
  .heatmap-wrap { background: #16213e; border-radius: 8px; padding: 16px; margin-bottom: 24px; }
  .heatmap-wrap h2 { color: #FF8A5B; font-size: 1rem; margin-bottom: 12px; }
  .heatmap-legend { display: flex; gap: 16px; margin-bottom: 12px; font-size: 0.75rem; }
  .heatmap-legend .item { display: flex; align-items: center; gap: 4px; }
  .heatmap-legend .swatch { width: 12px; height: 12px; border-radius: 2px; }
  .posteriors-wrap { background: #16213e; border-radius: 8px; padding: 16px; }
  .posteriors-wrap h2 { color: #FF8A5B; font-size: 1rem; margin-bottom: 12px; }
  .posteriors-table { width: 100%; border-collapse: collapse; font-size: 0.85rem; }
  .posteriors-table th { text-align: left; color: #8B7F77; padding: 8px 4px; border-bottom: 1px solid #2a2a4e; }
  .posteriors-table td { padding: 8px 4px; border-bottom: 1px solid #2a2a4e; }
  .posteriors-table tr:hover { background: #1e2a4a; }
  .arm-badge { padding: 2px 6px; border-radius: 3px; font-size: 0.7rem; margin-left: 4px; }
  .badge-seed { background: #2a5a3e; color: #2FBF71; }
  .badge-underexplored { background: #5a4a2e; color: #FFB020; }
  .ci-bar { display: inline-block; height: 8px; border-radius: 4px; background: #2a4a5e; position: relative; min-width: 60px; }
  .ci-fill { height: 100%; border-radius: 4px; background: #FF5A2D; position: absolute; }
  .ci-marker { position: absolute; width: 2px; height: 12px; background: #fff; top: -2px; }
  canvas { width: 100% !important; }
  @media (max-width: 768px) { .charts { grid-template-columns: 1fr; } }
</style>
</head>
<body>
<div class="header">
  <h1>Learning Dashboard</h1>
  <span id="modeBadge" class="mode-badge mode-passive">Passive</span>
</div>
<p class="subtitle">Auto-refreshes every 30s | <span id="configInfo"></span></p>

<div class="summary" id="summary"></div>

<div class="charts">
  <div class="chart-box">
    <h2>Arm Convergence</h2>
    <canvas id="convergenceChart"></canvas>
  </div>
  <div class="chart-box">
    <h2>Baseline vs Selected</h2>
    <canvas id="baselineChart"></canvas>
  </div>
</div>

<div class="charts">
  <div class="chart-box">
    <h2>Token Usage Over Time</h2>
    <canvas id="tokensChart"></canvas>
  </div>
  <div class="chart-box">
    <h2>Run Distribution</h2>
    <canvas id="runDistChart"></canvas>
  </div>
</div>

<div class="heatmap-wrap">
  <h2>Reference Heatmap</h2>
  <div class="heatmap-legend">
    <div class="item"><span class="swatch" style="background:#2FBF71"></span> Referenced</div>
    <div class="item"><span class="swatch" style="background:#2a4a3e"></span> Included (not used)</div>
    <div class="item"><span class="swatch" style="background:#4a2a3e"></span> Excluded</div>
    <div class="item"><span class="swatch" style="background:#1a1a2e"></span> Not present</div>
  </div>
  <canvas id="heatmapCanvas" height="200"></canvas>
</div>

<div class="posteriors-wrap">
  <h2>Arm Posteriors</h2>
  <table class="posteriors-table">
    <thead>
      <tr>
        <th>Arm</th>
        <th>Mean</th>
        <th>Credible Interval (95%)</th>
        <th>Pulls</th>
        <th>Confidence</th>
      </tr>
    </thead>
    <tbody id="posteriorsBody"></tbody>
  </table>
</div>

<script>
const API = ${JSON.stringify(apiBase)};
let convergenceChart, tokensChart, baselineChart, runDistChart;

async function fetchJson(path) {
  const res = await fetch(API + path);
  return res.json();
}

function renderConfig(config) {
  const badge = document.getElementById('modeBadge');
  const info = document.getElementById('configInfo');

  badge.className = 'mode-badge mode-' + (config.phase || 'passive');
  badge.textContent = config.phase === 'active' ? 'Active' : 'Passive';

  const parts = [];
  if (config.tokenBudget) parts.push('Budget: ' + config.tokenBudget.toLocaleString());
  if (config.baselineRate) parts.push('Baseline: ' + (config.baselineRate * 100).toFixed(0) + '%');
  if (config.minPulls) parts.push('Min pulls: ' + config.minPulls);
  info.textContent = parts.join(' | ');
}

function renderSummary(s) {
  const el = document.getElementById('summary');
  const range = s.minTimestamp && s.maxTimestamp
    ? new Date(s.minTimestamp).toLocaleDateString() + ' – ' + new Date(s.maxTimestamp).toLocaleDateString()
    : '–';

  const baseline = s.baseline || {};
  const savings = baseline.tokenSavingsPercent;
  const savingsClass = savings > 0 ? 'positive' : savings < 0 ? 'negative' : '';
  const savingsValue = savings != null ? (savings > 0 ? '+' : '') + savings.toFixed(1) + '%' : '–';

  el.innerHTML = [
    { label: 'Traces', value: s.traceCount },
    { label: 'Arms', value: s.armCount },
    { label: 'Total Tokens', value: s.totalTokens.toLocaleString() },
    { label: 'Token Savings', value: savingsValue, valueClass: savingsClass,
      sub: baseline.baselineRuns ? 'vs ' + baseline.baselineRuns + ' baseline runs' : '' },
    { label: 'Date Range', value: range },
  ].map(d => '<div class="stat"><div class="label">' + d.label + '</div><div class="value' +
    (d.valueClass ? ' ' + d.valueClass : '') + '">' + d.value + '</div>' +
    (d.sub ? '<div class="sub">' + d.sub + '</div>' : '') + '</div>').join('');
}

function renderConvergence(buckets) {
  const arms = [...new Set(buckets.map(b => b.armId).filter(Boolean))];
  const times = [...new Set(buckets.map(b => b.t))].sort((a,b) => a - b);
  const labels = times.map(t => new Date(t).toLocaleString());
  const colors = ['#FF5A2D','#2FBF71','#FFB020','#FF8A5B','#E23D2D','#8B7F77','#FF7A3D','#D14A22'];
  const datasets = arms.map((arm, i) => ({
    label: arm,
    data: times.map(t => {
      const b = buckets.find(x => x.t === t && x.armId === arm);
      return b ? b.value : null;
    }),
    borderColor: colors[i % colors.length],
    backgroundColor: 'transparent',
    tension: 0.3,
    spanGaps: true,
  }));
  const ctx = document.getElementById('convergenceChart').getContext('2d');
  if (convergenceChart) convergenceChart.destroy();
  convergenceChart = new Chart(ctx, {
    type: 'line',
    data: { labels, datasets },
    options: {
      responsive: true,
      plugins: { legend: { labels: { color: '#e0e0e0' } } },
      scales: {
        x: { ticks: { color: '#8B7F77', maxTicksLimit: 8 }, grid: { color: '#2a2a4e' } },
        y: { min: 0, max: 1, ticks: { color: '#8B7F77' }, grid: { color: '#2a2a4e' } },
      },
    },
  });
}

function renderTokens(buckets) {
  const labels = buckets.map(b => new Date(b.t).toLocaleString());
  const data = buckets.map(b => b.value);
  const ctx = document.getElementById('tokensChart').getContext('2d');
  if (tokensChart) tokensChart.destroy();
  tokensChart = new Chart(ctx, {
    type: 'line',
    data: {
      labels,
      datasets: [{
        label: 'Avg Tokens/Run',
        data,
        borderColor: '#FF5A2D',
        backgroundColor: 'rgba(255,90,45,0.15)',
        fill: true,
        tension: 0.3,
      }],
    },
    options: {
      responsive: true,
      plugins: { legend: { labels: { color: '#e0e0e0' } } },
      scales: {
        x: { ticks: { color: '#8B7F77', maxTicksLimit: 8 }, grid: { color: '#2a2a4e' } },
        y: { ticks: { color: '#8B7F77' }, grid: { color: '#2a2a4e' } },
      },
    },
  });
}

function renderBaseline(baseline) {
  const ctx = document.getElementById('baselineChart').getContext('2d');
  if (baselineChart) baselineChart.destroy();

  const hasData = baseline.baselineAvgTokens || baseline.selectedAvgTokens;
  if (!hasData) {
    baselineChart = new Chart(ctx, {
      type: 'bar',
      data: { labels: ['No data'], datasets: [{ data: [0], backgroundColor: '#2a2a4e' }] },
      options: { responsive: true, plugins: { legend: { display: false } } }
    });
    return;
  }

  baselineChart = new Chart(ctx, {
    type: 'bar',
    data: {
      labels: ['Avg Tokens', 'Avg Duration (s)'],
      datasets: [
        {
          label: 'Baseline (' + baseline.baselineRuns + ' runs)',
          data: [baseline.baselineAvgTokens || 0, (baseline.baselineAvgDuration || 0) / 1000],
          backgroundColor: '#8B7F77',
        },
        {
          label: 'Selected (' + baseline.selectedRuns + ' runs)',
          data: [baseline.selectedAvgTokens || 0, (baseline.selectedAvgDuration || 0) / 1000],
          backgroundColor: '#FF5A2D',
        },
      ],
    },
    options: {
      responsive: true,
      plugins: { legend: { labels: { color: '#e0e0e0' } } },
      scales: {
        x: { ticks: { color: '#8B7F77' }, grid: { color: '#2a2a4e' } },
        y: { ticks: { color: '#8B7F77' }, grid: { color: '#2a2a4e' } },
      },
    },
  });
}

function renderRunDist(baseline) {
  const ctx = document.getElementById('runDistChart').getContext('2d');
  if (runDistChart) runDistChart.destroy();

  const total = (baseline.baselineRuns || 0) + (baseline.selectedRuns || 0);
  if (total === 0) {
    runDistChart = new Chart(ctx, {
      type: 'doughnut',
      data: { labels: ['No data'], datasets: [{ data: [1], backgroundColor: ['#2a2a4e'] }] },
      options: { responsive: true, plugins: { legend: { display: false } } }
    });
    return;
  }

  runDistChart = new Chart(ctx, {
    type: 'doughnut',
    data: {
      labels: ['Baseline', 'Selected'],
      datasets: [{
        data: [baseline.baselineRuns || 0, baseline.selectedRuns || 0],
        backgroundColor: ['#8B7F77', '#FF5A2D'],
      }],
    },
    options: {
      responsive: true,
      plugins: {
        legend: { labels: { color: '#e0e0e0' } },
        tooltip: {
          callbacks: {
            label: (ctx) => ctx.label + ': ' + ctx.raw + ' (' + ((ctx.raw / total) * 100).toFixed(1) + '%)'
          }
        }
      },
    },
  });
}

function renderPosteriors(posteriors) {
  const tbody = document.getElementById('posteriorsBody');
  if (!posteriors || posteriors.length === 0) {
    tbody.innerHTML = '<tr><td colspan="5" style="color:#8B7F77">No posteriors yet</td></tr>';
    return;
  }

  tbody.innerHTML = posteriors.slice(0, 20).map(p => {
    const ci = p.credibleInterval || { lower: 0, upper: 1 };
    const ciWidth = (ci.upper - ci.lower) * 100;
    const ciLeft = ci.lower * 100;
    const meanPos = (p.mean - ci.lower) / (ci.upper - ci.lower || 1) * 100;

    let badges = '';
    if (p.isSeed) badges += '<span class="arm-badge badge-seed">SEED</span>';
    if (p.isUnderexplored) badges += '<span class="arm-badge badge-underexplored">EXPLORE</span>';

    const confColor = p.confidence === 'high' ? '#2FBF71' : p.confidence === 'medium' ? '#FFB020' : '#E23D2D';

    return '<tr>' +
      '<td>' + p.armId + badges + '</td>' +
      '<td>' + p.mean.toFixed(3) + '</td>' +
      '<td><div class="ci-bar" style="width:80px"><div class="ci-fill" style="left:' + ciLeft + '%;width:' + ciWidth + '%"></div><div class="ci-marker" style="left:' + meanPos + '%"></div></div> ' +
        '<span style="font-size:0.7rem;color:#8B7F77">[' + ci.lower.toFixed(2) + ', ' + ci.upper.toFixed(2) + ']</span></td>' +
      '<td>' + p.pulls + '</td>' +
      '<td style="color:' + confColor + '">' + (p.confidence || 'low') + '</td>' +
    '</tr>';
  }).join('');
}

function renderHeatmap(posteriors, traces) {
  const canvas = document.getElementById('heatmapCanvas');
  const ctx = canvas.getContext('2d');
  const arms = posteriors.map(p => p.armId);
  const recentTraces = traces.slice(0, 50);
  if (arms.length === 0 || recentTraces.length === 0) {
    canvas.width = 400;
    canvas.height = 50;
    ctx.fillStyle = '#8B7F77';
    ctx.font = '12px system-ui';
    ctx.fillText('No data yet', 10, 30);
    return;
  }
  const cellW = Math.max(8, Math.floor((canvas.clientWidth - 140) / recentTraces.length));
  const cellH = 18;
  canvas.width = 140 + recentTraces.length * cellW;
  canvas.height = arms.length * cellH + 30;

  // Clear canvas
  ctx.fillStyle = '#16213e';
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  // Arm labels
  ctx.fillStyle = '#8B7F77';
  ctx.font = '11px system-ui';
  arms.forEach((arm, i) => {
    const short = arm.length > 16 ? arm.slice(0, 16) + '…' : arm;
    ctx.fillText(short, 2, i * cellH + cellH - 4 + 20);
  });

  // Cells
  recentTraces.forEach((trace, col) => {
    const armOutcomes = trace.arms || [];
    arms.forEach((arm, row) => {
      const outcome = armOutcomes.find(a => a.armId === arm);
      const x = 140 + col * cellW;
      const y = row * cellH + 20;

      if (outcome && outcome.referenced) {
        ctx.fillStyle = '#2FBF71'; // Green: referenced
      } else if (outcome && outcome.included) {
        ctx.fillStyle = '#2a4a3e'; // Dark green: included but not used
      } else if (outcome && !outcome.included) {
        ctx.fillStyle = '#4a2a3e'; // Dark red: explicitly excluded
      } else {
        ctx.fillStyle = '#1a1a2e'; // Background: not present in trace
      }
      ctx.fillRect(x, y, cellW - 1, cellH - 1);
    });
  });
}

async function refresh() {
  try {
    const [config, summary, posteriors, tokenTs, convergenceTs, tracesRes] = await Promise.all([
      fetchJson('/config'),
      fetchJson('/summary'),
      fetchJson('/posteriors'),
      fetchJson('/timeseries?metric=tokens&window=1h'),
      fetchJson('/timeseries?metric=convergence&window=1h'),
      fetchJson('/traces?limit=50'),
    ]);
    renderConfig(config);
    renderSummary(summary);
    renderBaseline(summary.baseline || {});
    renderRunDist(summary.baseline || {});
    renderConvergence(convergenceTs.buckets || []);
    renderTokens(tokenTs.buckets || []);
    renderHeatmap(posteriors || [], tracesRes.traces || []);
    renderPosteriors(posteriors || []);
  } catch (err) {
    console.error('Dashboard refresh failed:', err);
  }
}

refresh();
setInterval(refresh, 30000);
</script>
</body>
</html>`;
}
