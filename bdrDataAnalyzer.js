/* ==========================================================================
   MODULE: BDR DATA ANALYZER (metrics & comparisons for Branchline Departure Rate)
   ========================================================================== */
const BdrDataAnalyzer = (() => {
  const { stats, groupBy, TARGET } = BdrUtils;

  function buildCompareRows(prev, latest, keyFn) {
    const prevMap = groupBy(prev, keyFn);
    const latestMap = groupBy(latest, keyFn);
    const keys = new Set([...Object.keys(prevMap), ...Object.keys(latestMap)]);
    return [...keys].map(key => {
      const st = stats(latestMap[key] || []);
      const stPrev = stats(prevMap[key] || []);
      return {
        key,
        total: st.total,
        yes: st.yes,
        no: st.no,
        rate: st.rate,
        prevRate: stPrev.rate,
        prevTotal: stPrev.total,
        prevNo: stPrev.no,
        delta: (st.rate != null && stPrev.rate != null) ? st.rate - stPrev.rate : null
      };
    }).filter(r => r.total > 0).sort((a, b) => (b.no - a.no) || ((a.rate ?? 1) - (b.rate ?? 1)));
  }

  /** Rows for a date key, or all rows when key is ALL / empty */
  function rowsForDateKey(allRows, dateKey) {
    if (!dateKey || dateKey === 'ALL') return allRows.slice();
    return allRows.filter(r => r.dateKey === dateKey);
  }

  function dateLabel(dateKey, storedDates) {
    if (!dateKey || dateKey === 'ALL') {
      if (storedDates && storedDates.length) {
        return 'Overall (' + storedDates[0] + ' → ' + storedDates[storedDates.length - 1] + ')';
      }
      return 'Overall (All dates)';
    }
    return dateKey;
  }

  function compute(datePrev, dateLatest, storedRows, storedDates) {
    const allRows = storedRows || [];
    const prev = rowsForDateKey(allRows, datePrev);
    const latest = rowsForDateKey(allRows, dateLatest);
    const target = TARGET;
    const targetPct = Math.round(target * 100);
    const isOverallLatest = !dateLatest || dateLatest === 'ALL';
    const isOverallPrev = !datePrev || datePrev === 'ALL';

    const overall = stats(latest);
    const overallPrev = stats(prev);
    const rateDiff = (overall.rate != null && overallPrev.rate != null) ? overall.rate - overallPrev.rate : null;

    // Line type split
    const bulk = stats(latest.filter(r => /bulk/i.test(r.lineType)));
    const bulkPrev = stats(prev.filter(r => /bulk/i.test(r.lineType)));
    const collection = stats(latest.filter(r => /collection/i.test(r.lineType)));
    const collectionPrev = stats(prev.filter(r => /collection/i.test(r.lineType)));

    // Carrier type
    const own = stats(latest.filter(r => /^own$/i.test(r.carrier)));
    const ownPrev = stats(prev.filter(r => /^own$/i.test(r.carrier)));
    const tp = stats(latest.filter(r => /third|thrid|sp/i.test(r.carrier)));
    const tpPrev = stats(prev.filter(r => /third|thrid|sp/i.test(r.carrier)));

    const lateTrips = latest.filter(r => r.onTime === 'NO');

    // Late by DC Intended (code resolved to DC name)
    const lateByDc = groupBy(lateTrips, r => r.dcName || r.dcIntended || '(blank)');
    const dcLateList = Object.entries(lateByDc).map(([dc, list]) => {
      const st = stats(latest.filter(r => (r.dcName || r.dcIntended) === dc));
      const sample = list[0];
      return {
        dc,
        dcCode: sample ? sample.dcIntended : '',
        late: list.length,
        total: st.total,
        rate: st.rate
      };
    }).sort((a, b) => b.late - a.late);

    // Late by SP
    const lateBySp = groupBy(lateTrips, r => r.sp);
    const spLateList = Object.entries(lateBySp).map(([sp, list]) => {
      const st = stats(latest.filter(r => r.sp === sp));
      return { sp, late: list.length, total: st.total, rate: st.rate };
    }).sort((a, b) => b.late - a.late);

    // Late by Route
    const lateByRoute = groupBy(lateTrips, r => r.route);
    const routeLateList = Object.entries(lateByRoute).map(([route, list]) => {
      const sample = list[0];
      const st = stats(latest.filter(r => r.route === route));
      return {
        route,
        late: list.length,
        total: st.total,
        rate: st.rate,
        sp: sample.sp,
        depDc: sample.dcName || sample.dcIntended || sample.depDc
      };
    }).sort((a, b) => b.late - a.late);

    // Comparison tables — DC basis = DC Intended (name)
    const dcRows = buildCompareRows(prev, latest, r => r.dcName || r.dcIntended || '(blank)');
    const spRows = buildCompareRows(prev, latest, r => r.sp);
    const routeRows = buildCompareRows(prev, latest, r => r.route);
    const lineTypeRows = buildCompareRows(prev, latest, r => r.lineType || '(blank)');

    // SP late routes (routes under each SP that have late trips)
    const spLateRoutes = {};
    lateTrips.forEach(r => {
      const sp = r.sp || '(blank)';
      if (!spLateRoutes[sp]) spLateRoutes[sp] = {};
      const rt = r.route || '(blank)';
      if (!spLateRoutes[sp][rt]) spLateRoutes[sp][rt] = { route: rt, late: 0, depDc: r.dcName || r.dcIntended || r.depDc, trips: [] };
      spLateRoutes[sp][rt].late++;
      spLateRoutes[sp][rt].trips.push(r);
    });
    const spLateRouteList = Object.entries(spLateRoutes).map(([sp, routesMap]) => {
      const routes = Object.values(routesMap).sort((a, b) => b.late - a.late);
      const totalLate = routes.reduce((s, x) => s + x.late, 0);
      return { sp, totalLate, routes };
    }).sort((a, b) => b.totalLate - a.totalLate);

    // Late trip detail (departure)
    const lateDetail = lateTrips.map(r => {
      const missingDispatch = !!r.missingDispatch;
      return {
        shipmentNo: r.shipmentNo || r.uniqueCode || '',
        route: r.route,
        depDc: r.dcName || r.dcIntended || r.depDc,
        dcIntended: r.dcIntended,
        sp: r.sp,
        carrier: r.carrier,
        lineType: r.lineType,
        plate: r.plate,
        driver: r.driver,
        missingDispatch,
        scheduledDep: r.scheduledDep || '',
        dispatchTime: r.dispatchTime || '',
        lateMin: r.lateMin
      };
    }).sort((a, b) => {
      if (a.missingDispatch !== b.missingDispatch) return a.missingDispatch ? 1 : -1;
      return Math.abs(b.lateMin || 0) - Math.abs(a.lateMin || 0);
    });

    // Daily history (last 21 days or all available)
    const histDates = (storedDates || []).slice(-21);
    const histRows = histDates.map(d => {
      const day = allRows.filter(r => r.dateKey === d);
      const o = stats(day);
      return { date: d, total: o.total, rate: o.rate, late: o.no, yes: o.yes };
    });

    // Simple trend / forecast
    function forecastFrom(hist) {
      const pts = hist.filter(h => h.rate != null && h.total > 0);
      if (pts.length < 2) {
        return { predictedRate: null, risk: 'unknown', trend: 'flat', sample: pts.length };
      }
      const n = pts.length;
      const recent = pts.slice(-Math.min(7, n));
      const avg = recent.reduce((s, p) => s + p.rate, 0) / recent.length;
      const first = recent[0].rate;
      const last = recent[recent.length - 1].rate;
      const slope = last - first;
      let trend = 'flat';
      if (slope > 0.005) trend = 'up';
      else if (slope < -0.005) trend = 'down';
      const predictedRate = Math.max(0, Math.min(1, last + slope * 0.5));
      let risk = 'low';
      if (predictedRate < target - 0.02) risk = 'high';
      else if (predictedRate < target) risk = 'medium';
      return { predictedRate, risk, trend, sample: recent.length, avg };
    }
    const forecast = forecastFrom(histRows);

    return {
      datePrev, dateLatest,
      datePrevLabel: dateLabel(datePrev, storedDates),
      dateLatestLabel: dateLabel(dateLatest, storedDates),
      isOverallPrev, isOverallLatest,
      target, targetPct,
      overall, overallPrev, rateDiff,
      bulk, bulkPrev, collection, collectionPrev,
      own, ownPrev, tp, tpPrev,
      dcLateList, spLateList, routeLateList,
      dcRows, spRows, routeRows, lineTypeRows,
      spLateRouteList,
      lateDetail, histRows, forecast
    };
  }

  return { compute, rowsForDateKey, dateLabel };
})();
