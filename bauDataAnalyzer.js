/* ==========================================================================
   MODULE: BAU DATA ANALYZER (metrics & comparisons for Branchline App Usage)
   ========================================================================== */
const BauDataAnalyzer = (() => {
  const { stats, groupBy, TARGET } = BauUtils;

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
        cinNo: st.cinNo,
        coutNo: st.coutNo,
        prevRate: stPrev.rate,
        prevTotal: stPrev.total,
        prevNo: stPrev.no,
        delta: (st.rate != null && stPrev.rate != null) ? st.rate - stPrev.rate : null
      };
    }).filter(r => r.total > 0).sort((a, b) => (b.no - a.no) || ((a.rate ?? 1) - (b.rate ?? 1)));
  }

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

    const overall = stats(latest);
    const overallPrev = stats(prev);
    const rateDiff = (overall.rate != null && overallPrev.rate != null) ? overall.rate - overallPrev.rate : null;

    // Line type split
    const bulk = stats(latest.filter(r => /bulk/i.test(r.lineType)));
    const bulkPrev = stats(prev.filter(r => /bulk/i.test(r.lineType)));
    const collection = stats(latest.filter(r => /collection/i.test(r.lineType)));
    const collectionPrev = stats(prev.filter(r => /collection/i.test(r.lineType)));

    // Carrier type: Own vs Third-party SP
    const own = stats(latest.filter(r => /^own$/i.test(r.carrier)));
    const ownPrev = stats(prev.filter(r => /^own$/i.test(r.carrier)));
    const tp = stats(latest.filter(r => /third|thrid|sp/i.test(r.carrier)));
    const tpPrev = stats(prev.filter(r => /third|thrid|sp/i.test(r.carrier)));

    // Non-compliant trips
    const missTrips = latest.filter(r => !r.compliant);
    const noClockIn = latest.filter(r => r.clockIn === 'NO');
    const noClockOut = latest.filter(r => r.clockOut === 'NO');

    // Miss by DC Intended
    const missByDc = groupBy(missTrips, r => r.dcName || r.dcIntended || '(blank)');
    const dcMissList = Object.entries(missByDc).map(([dc, list]) => {
      const st = stats(latest.filter(r => (r.dcName || r.dcIntended) === dc));
      const sample = list[0];
      return {
        dc,
        dcCode: sample ? sample.dcIntended : '',
        miss: list.length,
        cinNo: list.filter(r => r.clockIn === 'NO').length,
        coutNo: list.filter(r => r.clockOut === 'NO').length,
        total: st.total,
        rate: st.rate
      };
    }).sort((a, b) => b.miss - a.miss);

    // Miss by SP
    const missBySp = groupBy(missTrips, r => r.sp);
    const spMissList = Object.entries(missBySp).map(([sp, list]) => {
      const st = stats(latest.filter(r => r.sp === sp));
      return {
        sp,
        miss: list.length,
        cinNo: list.filter(r => r.clockIn === 'NO').length,
        coutNo: list.filter(r => r.clockOut === 'NO').length,
        total: st.total,
        rate: st.rate
      };
    }).sort((a, b) => b.miss - a.miss);

    // Miss by Driver
    const missByDriver = groupBy(missTrips, r => r.driver);
    const driverMissList = Object.entries(missByDriver).map(([driver, list]) => {
      const st = stats(latest.filter(r => r.driver === driver));
      const sample = list[0];
      return {
        driver,
        miss: list.length,
        cinNo: list.filter(r => r.clockIn === 'NO').length,
        coutNo: list.filter(r => r.clockOut === 'NO').length,
        total: st.total,
        rate: st.rate,
        sp: sample ? sample.sp : '',
        plate: sample ? sample.plate : ''
      };
    }).sort((a, b) => b.miss - a.miss);

    // Miss by Route
    const missByRoute = groupBy(missTrips, r => r.route);
    const routeMissList = Object.entries(missByRoute).map(([route, list]) => {
      const sample = list[0];
      const st = stats(latest.filter(r => r.route === route));
      return {
        route,
        miss: list.length,
        total: st.total,
        rate: st.rate,
        sp: sample.sp,
        depDc: sample.dcName || sample.dcIntended || sample.depDc
      };
    }).sort((a, b) => b.miss - a.miss);

    // Comparison tables
    const dcRows = buildCompareRows(prev, latest, r => r.dcName || r.dcIntended || '(blank)');
    const spRows = buildCompareRows(prev, latest, r => r.sp);
    const driverRows = buildCompareRows(prev, latest, r => r.driver).slice(0, 50);
    const routeRows = buildCompareRows(prev, latest, r => r.route);
    const carrierRows = buildCompareRows(prev, latest, r => r.carrier || '(blank)');

    // Detail of non-compliant trips
    const missDetail = missTrips.map(r => ({
      date: r.dateKey,
      shipmentNo: r.shipmentNo,
      mission: r.mission,
      driver: r.driver,
      plate: r.plate,
      sp: r.sp,
      carrier: r.carrier,
      dc: r.dcName || r.dcIntended,
      route: r.route,
      clockIn: r.clockIn || '—',
      clockOut: r.clockOut || '—',
      issue: (r.clockIn === 'NO' && r.clockOut === 'NO') ? 'No Clock In & Out'
        : (r.clockIn === 'NO') ? 'No Clock In (Arrival)'
        : (r.clockOut === 'NO') ? 'No Clock Out (Departure)'
        : 'Incomplete'
    })).sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));

    // Daily history (all dates)
    const histRows = (storedDates || []).map(d => {
      const st = stats(allRows.filter(r => r.dateKey === d));
      return {
        date: d,
        total: st.total,
        yes: st.yes,
        no: st.no,
        rate: st.rate,
        cinRate: st.cinRate,
        coutRate: st.coutRate
      };
    });

    return {
      datePrev,
      dateLatest,
      datePrevLabel: dateLabel(datePrev, storedDates),
      dateLatestLabel: dateLabel(dateLatest, storedDates),
      isOverallLatest,
      target,
      targetPct,
      overall,
      overallPrev,
      rateDiff,
      bulk, bulkPrev,
      collection, collectionPrev,
      own, ownPrev,
      tp, tpPrev,
      dcMissList,
      spMissList,
      driverMissList,
      routeMissList,
      dcRows,
      spRows,
      driverRows,
      routeRows,
      carrierRows,
      missDetail,
      noClockInCount: noClockIn.length,
      noClockOutCount: noClockOut.length,
      histRows
    };
  }

  return { compute };
})();
