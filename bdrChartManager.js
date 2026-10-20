/* ==========================================================================
   MODULE: BDR CHART MANAGER (Branchline)
   ========================================================================== */
const BdrChartManager = (() => {
  const charts = {};

  function destroy(key) {
    if (charts[key]) {
      charts[key].destroy();
      charts[key] = null;
    }
  }

  function render(dcLateList, spLateList, routeLateList, histRows, targetPct) {
    if (targetPct == null) targetPct = 98;
    ['dc', 'sp', 'routes', 'history'].forEach(destroy);

    const barOpts = (label) => ({
      indexAxis: 'y',
      responsive: true,
      maintainAspectRatio: false,
      plugins: { legend: { display: false } },
      scales: {
        x: { beginAtZero: true, ticks: { stepSize: 1 }, title: { display: true, text: label } },
        y: { ticks: { font: { size: 11 } } }
      }
    });

    const el = (id) => document.getElementById(id);

    if (el('chartDC')) {
      const top = (dcLateList || []).slice(0, 12);
      charts.dc = new Chart(el('chartDC'), {
        type: 'bar',
        data: {
          labels: top.map(r => r.dc.length > 22 ? r.dc.slice(0, 20) + '…' : r.dc),
          datasets: [{ data: top.map(r => r.late), backgroundColor: 'rgba(230,0,18,0.75)', borderRadius: 5 }]
        },
        options: barOpts('Late trips')
      });
    }
    if (el('chartSP')) {
      const top = (spLateList || []).slice(0, 12);
      charts.sp = new Chart(el('chartSP'), {
        type: 'bar',
        data: {
          labels: top.map(r => r.sp.length > 22 ? r.sp.slice(0, 20) + '…' : r.sp),
          datasets: [{ data: top.map(r => r.late), backgroundColor: 'rgba(183,28,28,0.7)', borderRadius: 5 }]
        },
        options: barOpts('Late trips')
      });
    }
    if (el('chartRoutes')) {
      const top = (routeLateList || []).slice(0, 12);
      charts.routes = new Chart(el('chartRoutes'), {
        type: 'bar',
        data: {
          labels: top.map(r => r.route.length > 28 ? r.route.slice(0, 26) + '…' : r.route),
          datasets: [{ data: top.map(r => r.late), backgroundColor: 'rgba(198,40,40,0.7)', borderRadius: 5 }]
        },
        options: barOpts('Late trips')
      });
    }
    if (el('chartHistory')) {
      charts.history = new Chart(el('chartHistory'), {
        type: 'line',
        data: {
          labels: (histRows || []).map(h => h.date.slice(5)),
          datasets: [
            {
              label: 'Achievement Rate',
              data: (histRows || []).map(h => h.rate != null ? +(h.rate * 100).toFixed(2) : null),
              borderColor: '#1565C0',
              backgroundColor: 'rgba(21,101,192,0.12)',
              fill: true,
              tension: 0.25,
              spanGaps: true,
              pointRadius: 3
            },
            {
              label: 'Target ' + targetPct + '%',
              data: (histRows || []).map(() => targetPct),
              borderColor: '#9E9E9E',
              borderDash: [6, 4],
              pointRadius: 0,
              tension: 0
            }
          ]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: { legend: { position: 'bottom', labels: { boxWidth: 12, font: { size: 11 } } } },
          scales: {
            y: {
              min: Math.max(70, Math.min(...(histRows || []).map(h => (h.rate || 1) * 100)) - 8),
              max: 102,
              title: { display: true, text: 'Rate %' }
            }
          }
        }
      });
    }
  }

  return { render };
})();
