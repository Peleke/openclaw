/**
 * Self-contained HTML dashboard for Green module environmental impact tracking.
 * Chart.js from CDN, dark theme matching control-ui, auto-refreshes every 30s.
 */

export function generateGreenDashboardHtml(opts: { apiBase: string }): string {
  const { apiBase } = opts;
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>OpenClaw Green Dashboard</title>
<script src="https://cdn.jsdelivr.net/npm/chart.js@4"></script>
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { background: #1a1a2e; color: #e0e0e0; font-family: system-ui, sans-serif; padding: 24px; }
  h1 { color: #2FBF71; margin-bottom: 8px; font-size: 1.6rem; display: inline-block; }
  .header { display: flex; align-items: center; gap: 12px; margin-bottom: 8px; }
  .header-icon { font-size: 1.8rem; }
  .status-badge { padding: 4px 12px; border-radius: 4px; font-size: 0.75rem; font-weight: bold; text-transform: uppercase; }
  .status-enabled { background: #2a5a3e; color: #2FBF71; }
  .status-disabled { background: #5a2a2e; color: #E23D2D; }
  .subtitle { color: #8B7F77; margin-bottom: 24px; font-size: 0.9rem; }

  .summary { display: flex; gap: 16px; margin-bottom: 24px; flex-wrap: wrap; }
  .stat { background: #16213e; border-radius: 8px; padding: 16px 20px; min-width: 130px; flex: 1; }
  .stat .label { color: #8B7F77; font-size: 0.75rem; text-transform: uppercase; letter-spacing: 0.5px; }
  .stat .value { color: #2FBF71; font-size: 1.6rem; font-weight: bold; margin-top: 4px; }
  .stat .sub { color: #8B7F77; font-size: 0.7rem; margin-top: 2px; }

  .equivalents { background: #16213e; border-radius: 8px; padding: 16px; margin-bottom: 24px; }
  .equivalents h2 { color: #2FBF71; font-size: 1rem; margin-bottom: 12px; }
  .equiv-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(140px, 1fr)); gap: 12px; }
  .equiv-item { display: flex; align-items: center; gap: 8px; }
  .equiv-icon { font-size: 1.4rem; }
  .equiv-text { font-size: 0.85rem; }
  .equiv-value { font-weight: bold; color: #2FBF71; }

  .charts { display: grid; grid-template-columns: 1fr 1fr; gap: 24px; margin-bottom: 24px; }
  .chart-box { background: #16213e; border-radius: 8px; padding: 16px; }
  .chart-box h2 { color: #2FBF71; font-size: 1rem; margin-bottom: 12px; }
  .chart-box.full-width { grid-column: 1 / -1; }

  .intensity-panel { background: #16213e; border-radius: 8px; padding: 16px; margin-bottom: 24px; }
  .intensity-panel h2 { color: #2FBF71; font-size: 1rem; margin-bottom: 12px; }
  .intensity-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 16px; }
  .intensity-item .metric { font-size: 1.4rem; font-weight: bold; color: #2FBF71; }
  .intensity-item .unit { font-size: 0.75rem; color: #8B7F77; }
  .intensity-item .desc { font-size: 0.8rem; color: #8B7F77; margin-top: 4px; }

  .targets-panel { background: #16213e; border-radius: 8px; padding: 16px; margin-bottom: 24px; }
  .targets-panel h2 { color: #2FBF71; font-size: 1rem; margin-bottom: 12px; }
  .target-item { margin-bottom: 16px; }
  .target-header { display: flex; justify-content: space-between; margin-bottom: 8px; }
  .target-name { font-weight: bold; }
  .target-status { font-size: 0.8rem; padding: 2px 8px; border-radius: 4px; }
  .target-status.on-track { background: #2a5a3e; color: #2FBF71; }
  .target-status.behind { background: #5a4a2e; color: #FFB020; }
  .progress-bar { height: 8px; background: #2a2a4e; border-radius: 4px; overflow: hidden; }
  .progress-fill { height: 100%; background: #2FBF71; border-radius: 4px; transition: width 0.3s; }
  .progress-fill.behind { background: #FFB020; }
  .target-details { font-size: 0.75rem; color: #8B7F77; margin-top: 4px; }

  .traces-panel { background: #16213e; border-radius: 8px; padding: 16px; }
  .traces-panel h2 { color: #2FBF71; font-size: 1rem; margin-bottom: 12px; }
  .traces-table { width: 100%; border-collapse: collapse; font-size: 0.8rem; }
  .traces-table th { text-align: left; color: #8B7F77; padding: 8px 4px; border-bottom: 1px solid #2a2a4e; }
  .traces-table td { padding: 8px 4px; border-bottom: 1px solid #2a2a4e; }
  .traces-table tr:hover { background: #1e2a4a; }
  .conf-badge { padding: 2px 6px; border-radius: 3px; font-size: 0.7rem; }
  .conf-high { background: #2a5a3e; color: #2FBF71; }
  .conf-medium { background: #5a4a2e; color: #FFB020; }
  .conf-low { background: #5a2a3e; color: #E23D2D; }

  .no-data { color: #8B7F77; font-style: italic; text-align: center; padding: 24px; }

  canvas { width: 100% !important; }
  @media (max-width: 768px) {
    .charts { grid-template-columns: 1fr; }
    .intensity-grid { grid-template-columns: 1fr; }
  }
</style>
</head>
<body>
<div class="header">
  <span class="header-icon">🌱</span>
  <h1>Green Dashboard</h1>
  <span id="statusBadge" class="status-badge status-enabled">Enabled</span>
</div>
<p class="subtitle">Environmental impact tracking | Auto-refreshes every 30s</p>

<div class="summary" id="summary">
  <div class="stat"><div class="label">Total CO₂</div><div class="value" id="totalCo2">--</div><div class="sub" id="totalCo2Sub"></div></div>
  <div class="stat"><div class="label">Total Water</div><div class="value" id="totalWater">--</div></div>
  <div class="stat"><div class="label">Requests</div><div class="value" id="traceCount">--</div></div>
  <div class="stat"><div class="label">Avg/Request</div><div class="value" id="avgCo2">--</div></div>
  <div class="stat"><div class="label">Confidence</div><div class="value" id="confidence">--</div></div>
</div>

<div class="equivalents" id="equivalentsPanel">
  <h2>Real-World Equivalents</h2>
  <div class="equiv-grid" id="equivGrid"></div>
</div>

<div class="charts">
  <div class="chart-box">
    <h2>Emissions Over Time</h2>
    <canvas id="timeseriesChart"></canvas>
  </div>
  <div class="chart-box">
    <h2>Provider Breakdown</h2>
    <canvas id="providerChart"></canvas>
  </div>
</div>

<div class="intensity-panel">
  <h2>Carbon Intensity (TCFD Metrics)</h2>
  <div class="intensity-grid" id="intensityGrid"></div>
</div>

<div class="targets-panel" id="targetsPanel" style="display:none;">
  <h2>Emission Reduction Targets (SBTi)</h2>
  <div id="targetsList"></div>
</div>

<div class="traces-panel">
  <h2>Recent Traces</h2>
  <table class="traces-table">
    <thead>
      <tr>
        <th>Time</th>
        <th>Provider</th>
        <th>Model</th>
        <th>Tokens</th>
        <th>CO₂ (g)</th>
        <th>Confidence</th>
      </tr>
    </thead>
    <tbody id="tracesBody"></tbody>
  </table>
</div>

<script>
const API = ${JSON.stringify(apiBase)};
let timeseriesChart, providerChart;

async function fetchJson(path) {
  try {
    const res = await fetch(API + path);
    if (!res.ok) throw new Error('API error');
    return res.json();
  } catch (err) {
    console.error('Fetch failed:', path, err);
    return null;
  }
}

function formatCo2(grams) {
  if (grams >= 1000) return (grams / 1000).toFixed(2) + ' kg';
  return grams.toFixed(2) + ' g';
}

function formatWater(ml) {
  if (ml >= 1000) return (ml / 1000).toFixed(1) + ' L';
  return ml.toFixed(0) + ' mL';
}

function getConfidenceClass(conf) {
  if (conf >= 0.7) return 'conf-high';
  if (conf >= 0.4) return 'conf-medium';
  return 'conf-low';
}

function getConfidenceLabel(conf) {
  if (conf >= 0.7) return 'High';
  if (conf >= 0.4) return 'Medium';
  return 'Low';
}

function renderSummary(summary) {
  if (!summary) {
    document.getElementById('totalCo2').textContent = 'No data';
    return;
  }

  document.getElementById('totalCo2').textContent = formatCo2(summary.totalCo2Grams || 0);
  document.getElementById('totalWater').textContent = formatWater(summary.totalWaterMl || 0);
  document.getElementById('traceCount').textContent = (summary.traceCount || 0).toLocaleString();
  document.getElementById('avgCo2').textContent = formatCo2(summary.avgCo2PerTrace || 0);

  const conf = summary.avgConfidence || 0;
  const confEl = document.getElementById('confidence');
  confEl.textContent = getConfidenceLabel(conf);
  confEl.className = 'value ' + getConfidenceClass(conf).replace('conf-', '');
}

function renderEquivalents(equivalents) {
  const grid = document.getElementById('equivGrid');
  if (!equivalents) {
    grid.innerHTML = '<div class="no-data">No data yet</div>';
    return;
  }

  const items = [
    { icon: '🚗', label: 'Car travel', value: equivalents.carKm, unit: 'km' },
    { icon: '📱', label: 'Phone charges', value: equivalents.phoneCharges, unit: '' },
    { icon: '🌳', label: 'Tree absorption', value: equivalents.treeDays, unit: 'days' },
    { icon: '🔍', label: 'Google searches', value: equivalents.googleSearches, unit: '' },
  ];

  grid.innerHTML = items.map(item =>
    '<div class="equiv-item">' +
      '<span class="equiv-icon">' + item.icon + '</span>' +
      '<span class="equiv-text">' + item.label + ': <span class="equiv-value">' +
        (item.value ? item.value.toFixed(1) : '0') + '</span> ' + item.unit + '</span>' +
    '</div>'
  ).join('');
}

function renderTimeseries(buckets) {
  const ctx = document.getElementById('timeseriesChart').getContext('2d');
  if (timeseriesChart) timeseriesChart.destroy();

  if (!buckets || buckets.length === 0) {
    timeseriesChart = new Chart(ctx, {
      type: 'line',
      data: { labels: ['No data'], datasets: [{ data: [0], borderColor: '#2a2a4e' }] },
      options: { responsive: true, plugins: { legend: { display: false } } }
    });
    return;
  }

  const labels = buckets.map(b => new Date(b.t).toLocaleDateString());
  const data = buckets.map(b => b.co2Grams || 0);

  timeseriesChart = new Chart(ctx, {
    type: 'line',
    data: {
      labels,
      datasets: [{
        label: 'CO₂ (grams)',
        data,
        borderColor: '#2FBF71',
        backgroundColor: 'rgba(47, 191, 113, 0.15)',
        fill: true,
        tension: 0.3,
      }],
    },
    options: {
      responsive: true,
      plugins: { legend: { labels: { color: '#e0e0e0' } } },
      scales: {
        x: { ticks: { color: '#8B7F77', maxTicksLimit: 7 }, grid: { color: '#2a2a4e' } },
        y: { ticks: { color: '#8B7F77' }, grid: { color: '#2a2a4e' } },
      },
    },
  });
}

function renderProviders(providers) {
  const ctx = document.getElementById('providerChart').getContext('2d');
  if (providerChart) providerChart.destroy();

  if (!providers || providers.length === 0) {
    providerChart = new Chart(ctx, {
      type: 'doughnut',
      data: { labels: ['No data'], datasets: [{ data: [1], backgroundColor: ['#2a2a4e'] }] },
      options: { responsive: true, plugins: { legend: { display: false } } }
    });
    return;
  }

  const colors = ['#2FBF71', '#FFB020', '#E23D2D', '#8B7F77', '#FF8A5B', '#5A9FD4'];

  providerChart = new Chart(ctx, {
    type: 'doughnut',
    data: {
      labels: providers.map(p => p.provider),
      datasets: [{
        data: providers.map(p => p.totalCo2Grams || 0),
        backgroundColor: providers.map((_, i) => colors[i % colors.length]),
      }],
    },
    options: {
      responsive: true,
      plugins: {
        legend: { labels: { color: '#e0e0e0' } },
        tooltip: {
          callbacks: {
            label: (ctx) => {
              const prov = providers[ctx.dataIndex];
              return prov.provider + ': ' + formatCo2(prov.totalCo2Grams) + ' (' + (prov.percentage || 0).toFixed(1) + '%)';
            }
          }
        }
      },
    },
  });
}

function renderIntensity(intensity) {
  const grid = document.getElementById('intensityGrid');
  if (!intensity) {
    grid.innerHTML = '<div class="no-data">No data yet</div>';
    return;
  }

  const uncertainty = intensity.uncertainty || { lower: 0.5, upper: 1.5 };
  const uncertPercent = ((uncertainty.upper - uncertainty.lower) / 2 * 100).toFixed(0);

  grid.innerHTML = [
    { metric: (intensity.intensityPerMillionTokens || 0).toFixed(2), unit: 'gCO₂eq', desc: 'Per million tokens' },
    { metric: (intensity.intensityPerQuery || 0).toFixed(4), unit: 'gCO₂eq', desc: 'Per API call' },
    { metric: '±' + uncertPercent + '%', unit: '', desc: 'Uncertainty range' },
  ].map(item =>
    '<div class="intensity-item">' +
      '<div class="metric">' + item.metric + '</div>' +
      '<div class="unit">' + item.unit + '</div>' +
      '<div class="desc">' + item.desc + '</div>' +
    '</div>'
  ).join('');
}

function renderTargets(data) {
  const panel = document.getElementById('targetsPanel');
  const list = document.getElementById('targetsList');

  if (!data || !data.progress || data.progress.length === 0) {
    panel.style.display = 'none';
    return;
  }

  panel.style.display = 'block';
  list.innerHTML = data.progress.map(p => {
    const t = p.target;
    const onTrack = p.onTrack;
    const progressPct = Math.min(100, Math.max(0, p.progressPercent || 0));

    return '<div class="target-item">' +
      '<div class="target-header">' +
        '<span class="target-name">' + t.name + ' (' + t.baseYear + ' → ' + t.targetYear + ')</span>' +
        '<span class="target-status ' + (onTrack ? 'on-track' : 'behind') + '">' +
          (onTrack ? '✓ On track' : '⚠ Behind') + '</span>' +
      '</div>' +
      '<div class="progress-bar"><div class="progress-fill' + (onTrack ? '' : ' behind') + '" style="width:' + progressPct + '%"></div></div>' +
      '<div class="target-details">' + progressPct.toFixed(1) + '% toward ' + t.targetReductionPercent + '% reduction goal</div>' +
    '</div>';
  }).join('');
}

function renderTraces(traces) {
  const tbody = document.getElementById('tracesBody');
  if (!traces || traces.length === 0) {
    tbody.innerHTML = '<tr><td colspan="6" class="no-data">No traces yet</td></tr>';
    return;
  }

  tbody.innerHTML = traces.slice(0, 20).map(t => {
    const time = new Date(t.timestamp).toLocaleString();
    const tokens = (t.inputTokens || 0) + (t.outputTokens || 0);
    const confClass = getConfidenceClass(t.confidence || 0);
    const confLabel = getConfidenceLabel(t.confidence || 0);

    return '<tr>' +
      '<td>' + time + '</td>' +
      '<td>' + (t.provider || 'unknown') + '</td>' +
      '<td>' + (t.model || 'unknown') + '</td>' +
      '<td>' + tokens.toLocaleString() + '</td>' +
      '<td>' + (t.totalCo2Grams || 0).toFixed(4) + '</td>' +
      '<td><span class="conf-badge ' + confClass + '">' + confLabel + '</span></td>' +
    '</tr>';
  }).join('');
}

async function refresh() {
  try {
    const [config, summary, timeseries, intensity, targets, tracesRes] = await Promise.all([
      fetchJson('/config'),
      fetchJson('/summary'),
      fetchJson('/timeseries?bucket=1d'),
      fetchJson('/intensity'),
      fetchJson('/targets'),
      fetchJson('/traces?limit=20'),
    ]);

    // Status badge
    const badge = document.getElementById('statusBadge');
    if (config && config.enabled === false) {
      badge.className = 'status-badge status-disabled';
      badge.textContent = 'Disabled';
    } else {
      badge.className = 'status-badge status-enabled';
      badge.textContent = 'Enabled';
    }

    renderSummary(summary);
    renderEquivalents(summary?.equivalents);
    renderTimeseries(timeseries?.buckets);
    renderProviders(summary?.providers);
    renderIntensity(intensity);
    renderTargets(targets);
    renderTraces(tracesRes?.traces);

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
