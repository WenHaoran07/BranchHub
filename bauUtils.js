/* ==========================================================================
   MODULE: BAU UTILS (Branchline App Usage shared helpers)
   ========================================================================== */
const BauUtils = (() => {
  const TARGET = 0.99; // SLU Branchline App Usage official target 99%

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

  /**
   * Stats for app usage rows.
   * compliant = both clockIn and clockOut are YES
   * rate = compliant / total
   * Also returns clockInRate / clockOutRate
   */
  function stats(rows) {
    if (!rows || !rows.length) {
      return {
        total: 0, yes: 0, no: 0, rate: null,
        cinYes: 0, cinNo: 0, cinRate: null,
        coutYes: 0, coutNo: 0, coutRate: null
      };
    }
    let yes = 0, cinYes = 0, cinNo = 0, coutYes = 0, coutNo = 0;
    rows.forEach(r => {
      if (r.compliant) yes++;
      if (r.clockIn === 'YES') cinYes++;
      else if (r.clockIn === 'NO') cinNo++;
      if (r.clockOut === 'YES') coutYes++;
      else if (r.clockOut === 'NO') coutNo++;
    });
    const total = rows.length;
    const no = total - yes;
    const cinTotal = cinYes + cinNo;
    const coutTotal = coutYes + coutNo;
    return {
      total,
      yes,
      no,
      rate: total ? yes / total : null,
      cinYes, cinNo,
      cinRate: cinTotal ? cinYes / cinTotal : null,
      coutYes, coutNo,
      coutRate: coutTotal ? coutYes / coutTotal : null
    };
  }

  function fmtPct(v) { return (v == null || isNaN(v)) ? '—' : (v * 100).toFixed(1) + '%'; }
  function fmtNum(v, d) { return (v == null || isNaN(v)) ? '—' : Number(v).toFixed(d == null ? 0 : d); }
  function fmtPp(v) {
    if (v == null || isNaN(v)) return '—';
    return (v >= 0 ? '+' : '') + (v * 100).toFixed(1) + ' pp';
  }

  function cleanText(v) {
    if (v == null) return '';
    return String(v).replace(/\u00a0/g, ' ').trim();
  }

  function normalizeYesNo(val) {
    if (val == null || val === '') return null;
    const s = String(val).trim().toUpperCase();
    if (s === 'YES' || s === 'Y' || s === 'TRUE' || s === '1') return 'YES';
    if (s === 'NO' || s === 'N' || s === 'FALSE' || s === '0') return 'NO';
    return null;
  }

  // DC INTENDED codes → DC names (Branchline SLU) — shared with BLT
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

  function resolveDcName(code) {
    if (code == null || code === '') return '(blank)';
    const key = String(code).replace(/\.0$/, '').trim();
    if (!key || key === '(blank)') return '(blank)';
    return DC_CODE_MAP[key] || key;
  }

  return {
    TARGET, DC_CODE_MAP,
    parseDateKey, groupBy, stats,
    fmtPct, fmtNum, fmtPp, cleanText, normalizeYesNo, resolveDcName
  };
})();
