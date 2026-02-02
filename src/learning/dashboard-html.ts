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
  h1 { color: #FF5A2D; margin-bottom: 8px; font-size: 1.6rem; }
  .subtitle { color: #8B7F77; margin-bottom: 24px; font-size: 0.9rem; }
  .summary { display: flex; gap: 24px; margin-bottom: 24px; flex-wrap: wrap; }
  .stat { background: #16213e; border-radius: 8px; padding: 16px 24px; min-width: 140px; }
  .stat .label { color: #8B7F77; font-size: 0.8rem; text-transform: uppercase; }
  .stat .value { color: #FF5A2D; font-size: 1.8rem; font-weight: bold; margin-top: 4px; }
  .charts { display: grid; grid-template-columns: 1fr 1fr; gap: 24px; margin-bottom: 24px; }
  .chart-box { background: #16213e; border-radius: 8px; padding: 16px; }
  .chart-box h2 { color: #FF8A5B; font-size: 1rem; margin-bottom: 12px; }
  .heatmap-wrap { background: #16213e; border-radius: 8px; padding: 16px; }
  .heatmap-wrap h2 { color: #FF8A5B; font-size: 1rem; margin-bottom: 12px; }
  canvas { width: 100% !important; }
  @media (max-width: 768px) { .charts { grid-template-columns: 1fr; } }
</style>
</head>
<body>
<h1>Learning Dashboard</h1>
<p class="subtitle">Auto-refreshes every 30s</p>

<div class="summary" id="summary"></div>

<div class="charts">
  <div class="chart-box">
    <h2>Arm Convergence</h2>
    <canvas id="convergenceChart"></canvas>
  </div>
  <div class="chart-box">
    <h2>Token Savings</h2>
    <canvas id="tokensChart"></canvas>
  </div>
</div>

<div class="heatmap-wrap">
  <h2>Reference Heatmap</h2>
  <canvas id="heatmapCanvas" height="200"></canvas>
</div>

<script>
const API = ${JSON.stringify(apiBase)};
let convergenceChart, tokensChart;

async function fetchJson(path) {
  const res = await fetch(API + path);
  return res.json();
}

function renderSummary(s) {
  const el = document.getElementById('summary');
  const range = s.minTimestamp && s.maxTimestamp
    ? new Date(s.minTimestamp).toLocaleDateString() + ' – ' + new Date(s.maxTimestamp).toLocaleDateString()
    : '–';
  el.innerHTML = [
    { label: 'Traces', value: s.traceCount },
    { label: 'Arms', value: s.armCount },
    { label: 'Total Tokens', value: s.totalTokens.toLocaleString() },
    { label: 'Date Range', value: range },
  ].map(d => '<div class="stat"><div class="label">' + d.label + '</div><div class="value">' + d.value + '</div></div>').join('');
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

function renderHeatmap(posteriors, traces) {
  const canvas = document.getElementById('heatmapCanvas');
  const ctx = canvas.getContext('2d');
  const arms = posteriors.map(p => p.armId);
  const recentTraces = traces.slice(0, 50);
  if (arms.length === 0 || recentTraces.length === 0) {
    ctx.fillStyle = '#8B7F77';
    ctx.fillText('No data yet', 10, 30);
    return;
  }
  const cellW = Math.max(8, Math.floor((canvas.clientWidth - 120) / recentTraces.length));
  const cellH = 18;
  canvas.width = 120 + recentTraces.length * cellW;
  canvas.height = arms.length * cellH + 30;
  // Arm labels
  ctx.fillStyle = '#8B7F77';
  ctx.font = '11px system-ui';
  arms.forEach((arm, i) => {
    const short = arm.length > 14 ? arm.slice(0, 14) + '…' : arm;
    ctx.fillText(short, 2, i * cellH + cellH - 4 + 20);
  });
  // Cells
  recentTraces.forEach((trace, col) => {
    const armOutcomes = trace.arms || [];
    arms.forEach((arm, row) => {
      const outcome = armOutcomes.find(a => a.armId === arm);
      const x = 120 + col * cellW;
      const y = row * cellH + 20;
      if (outcome && outcome.referenced) {
        ctx.fillStyle = '#2FBF71';
      } else if (outcome && outcome.included) {
        ctx.fillStyle = '#2a4a3e';
      } else {
        ctx.fillStyle = '#1a1a2e';
      }
      ctx.fillRect(x, y, cellW - 1, cellH - 1);
    });
  });
}

async function refresh() {
  try {
    const [summary, posteriors, tokenTs, convergenceTs, tracesRes] = await Promise.all([
      fetchJson('/summary'),
      fetchJson('/posteriors'),
      fetchJson('/timeseries?metric=tokens&window=1h'),
      fetchJson('/timeseries?metric=convergence&window=1h'),
      fetchJson('/traces?limit=50'),
    ]);
    renderSummary(summary);
    renderConvergence(convergenceTs.buckets || []);
    renderTokens(tokenTs.buckets || []);
    renderHeatmap(posteriors || [], tracesRes.traces || []);
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
