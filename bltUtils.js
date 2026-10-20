/* ==========================================================================
   MODULE: BLT UTILS (Branchline Travel Time shared helpers)
   ========================================================================== */
const BltUtils = (() => {
  const TARGET = 0.98; // SLU Branchline official target 98%

  function pad2(n) { return String(n).padStart(2, '0'); }

  /**
   * Calendar day key YYYY-MM-DD from Excel serials / SheetJS Date / strings.
   * Avoids timezone off-by-one.
   */
  function parseDateKey(val) {
    if (val == null || val === '') return null;

    if (val instanceof Date && !isNaN(val.getTime())) {
      const adjusted = new Date(val.getTime() + val.getTimezoneOffset() * 60000);
      return adjusted.getFullYear() + '-' + pad2(adjusted.getMonth() + 1) + '-' + pad2(adjusted.getDate());
    }

    if (typeof val === 'number' && val > 40000 && val < 60000) {
      const daySerial = Math.floor(val + 1e-9);
      const epoch = Date.UTC(1899, 11, 30);
      const dt = new Date(epoch + daySerial * 86400000);
      return dt.getUTCFullYear() + '-' + pad2(dt.getUTCMonth() + 1) + '-' + pad2(dt.getUTCDate());
    }

    const s = String(val).trim();
    let m = s.match(/(\d{4})-(\d{2})-(\d{2})/);
    if (m) return m[1] + '-' + m[2] + '-' + m[3];
    m = s.match(/(\d{1,2})\/(\d{1,2})\/(\d{4})/);
    if (m) return m[3] + '-' + pad2(m[1]) + '-' + pad2(m[2]);

    const n = parseFloat(s);
    if (!isNaN(n) && n > 40000 && n < 60000) {
      const daySerial = Math.floor(n + 1e-9);
      const epoch = Date.UTC(1899, 11, 30);
      const dt = new Date(epoch + daySerial * 86400000);
      return dt.getUTCFullYear() + '-' + pad2(dt.getUTCMonth() + 1) + '-' + pad2(dt.getUTCDate());
    }
    return null;
  }

  function groupBy(arr, keyFn) {
    const map = {};
    arr.forEach(r => {
      const k = keyFn(r) || '(blank)';
      if (!map[k]) map[k] = [];
      map[k].push(r);
    });
    return map;
  }

  function stats(rows) {
    if (!rows || !rows.length) return { total: 0, yes: 0, no: 0, rate: null };
    const yes = rows.filter(r => r.onTime === 'YES').length;
    const no = rows.filter(r => r.onTime === 'NO').length;
    return { total: rows.length, yes, no, rate: yes / rows.length };
  }

  function fmtPct(v) { return (v == null || isNaN(v)) ? '—' : (v * 100).toFixed(1) + '%'; }
  function fmtNum(v, d) { return (v == null || isNaN(v)) ? '—' : Number(v).toFixed(d == null ? 1 : d); }
  function fmtPp(v) {
    if (v == null || isNaN(v)) return '—';
    return (v >= 0 ? '+' : '') + (v * 100).toFixed(1) + ' pp';
  }

  // Max plausible branchline travel duration (7 days). Larger = Excel formula garbage.
  const MAX_TRAVEL_MIN = 7 * 24 * 60; // 10080

  /**
   * Parse PLAN/ACTUAL/LATE TIME from Excel (minutes).
   * Rejects absurd values (e.g. ~66e6 from broken formulas) so they don't become million-hour displays.
   */
  function parseTravelMinutes(val) {
    if (val == null || val === '') return null;
    const n = typeof val === 'number' ? val : parseFloat(val);
    if (isNaN(n)) return null;
    if (Math.abs(n) > MAX_TRAVEL_MIN) return null;
    return n;
  }

  /**
   * Convert minutes → hours & minutes. 90 → "1h 30m", 1260 → "21h 0m"
   */
  function fmtDuration(minutes) {
    if (minutes == null || minutes === '' || isNaN(Number(minutes))) return '—';
    const n = Number(minutes);
    if (Math.abs(n) > MAX_TRAVEL_MIN) return '—';
    const totalMin = Math.round(n);
    const sign = totalMin < 0 ? '-' : '';
    const abs = Math.abs(totalMin);
    const h = Math.floor(abs / 60);
    const m = abs % 60;
    return sign + h + 'h ' + m + 'm';
  }

  function cleanText(v) {
    if (v == null) return '';
    return String(v).replace(/\u00a0/g, ' ').trim();
  }

  // DC INTENDED codes → DC names (Branchline SLU)
  const DC_CODE_MAP = {
    '206': 'Rizal DC',
    '430': 'Batangas DC',
    '431': 'Mindoro MamburaoDC1',
    '432': 'Mindoro CalapanDC2',
    '460': 'Cavite DC1',
    '470': 'LUCENA NEW DC',
    '480': 'PalawanDC1',
    '481': 'CORON DC',
    '491': 'Laguna-RTS DC',
    '492': 'Laguna DC2',
    '9071': 'DW-Taytay 888'
  };

  /**
   * Resolve DC INTENDED (code) to display name.
   * Accepts number or string; unknown codes return the code itself.
   */
  function resolveDcName(code) {
    if (code == null || code === '') return '(blank)';
    const key = String(code).replace(/\.0$/, '').trim();
    if (!key || key === '(blank)') return '(blank)';
    return DC_CODE_MAP[key] || key;
  }

  return {
    TARGET, MAX_TRAVEL_MIN, DC_CODE_MAP,
    parseDateKey, groupBy, stats,
    parseTravelMinutes, fmtPct, fmtNum, fmtPp, fmtDuration, cleanText, resolveDcName
  };
})();
