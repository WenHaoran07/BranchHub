/* ==========================================================================
   MODULE: BLT FILE PROCESSOR (Excel upload & normalization for Branchline)
   ========================================================================== */
const BltFileProcessor = (() => {
  let storedRows = null;
  let storedDates = [];
  let onReadyCallback = null;

  function getState() {
    return { storedRows, storedDates };
  }

  function handleFile(file) {
    const loading = document.getElementById('loading');
    const results = document.getElementById('results');
    if (loading) loading.classList.remove('hidden');
    if (results) results.classList.add('hidden');

    const reader = new FileReader();
    reader.onload = e => {
      try {
        const workbook = XLSX.read(new Uint8Array(e.target.result), { type: 'array', cellDates: false, raw: true });
        processWorkbook(workbook);
      } catch (err) {
        alert('Error reading file: ' + err.message);
        if (loading) loading.classList.add('hidden');
      }
    };
    reader.readAsArrayBuffer(file);
  }

  function processWorkbook(workbook) {
    const loading = document.getElementById('loading');
    let sheetName = workbook.SheetNames.includes('DATA') ? 'DATA' : null;
    if (!sheetName) {
      for (const n of workbook.SheetNames) {
        const sample = XLSX.utils.sheet_to_json(workbook.Sheets[n], { defval: null, header: 1 });
        if (sample.length > 1) {
          const hdr = (sample[0] || []).map(h => String(h || '').toLowerCase());
          if (hdr.some(h => h.includes('on time') || h.includes('plan travel') || h.includes('actual travel'))) {
            sheetName = n;
            break;
          }
        }
      }
    }
    if (!sheetName) {
      alert('No DATA sheet found with branchline travel-time columns.');
      if (loading) loading.classList.add('hidden');
      return;
    }

    const aoa = XLSX.utils.sheet_to_json(workbook.Sheets[sheetName], { header: 1, defval: null, raw: true });
    if (!aoa.length) {
      alert('DATA sheet is empty.');
      if (loading) loading.classList.add('hidden');
      return;
    }

    const headers = aoa[0].map(h => (h == null ? '' : String(h)));
    const colMap = {};
    headers.forEach((h, i) => {
      const lower = h.toLowerCase().trim().replace(/\n/g, ' ').replace(/\u00a0/g, ' ');
      if (lower.includes('on time yes') || lower === '(on time yes / no )' || lower.includes('on time')) colMap.onTime = i;
      if (lower.includes('plan travel') || lower === 'plan travel') colMap.planTT = i;
      if (lower.includes('actual travel') || lower === 'actual travel') colMap.actualTT = i;
      if (lower.includes('late time') && !lower.includes('unloading')) colMap.lateMin = i;
      if (lower === 'route' || lower === 'route label') colMap.route = i;
      if (lower === 'region') colMap.region = i;
      if (lower === 'date') colMap.date = i;
      if (lower.includes('shipmentno') || lower === 'shipment no') colMap.shipmentNo = i;
      if (lower.includes('unique code')) colMap.uniqueCode = i;
      if (lower.includes('task status')) colMap.status = i;
      if (lower.includes('mission name')) colMap.mission = i;
      if (lower.includes('departure dc name') || lower === 'departure dc name') colMap.depDc = i;
      if (lower.includes('departure dc code')) colMap.depDcCode = i;
      if (lower === 'dc intended') colMap.dcIntended = i;
      if (lower === 'ph/sp' || lower === 'ph / sp') colMap.phSp = i;
      if (lower.includes('sp names') || lower === 'sp names') colMap.spNames = i;
      if (lower.includes('vehicle') && lower.includes('carrier') && lower.includes('name')) colMap.carrierName = i;
      if (lower === 'carrier') colMap.carrier = i;
      if (lower.includes('line type')) colMap.lineType = i;
      if (lower.includes('to the vehicle outlet name') || lower.includes('outlet name')) colMap.destOutlet = i;
      if (lower.includes('driver') && !lower.includes('phone') && !lower.includes('check')) colMap.driver = i;
      if (lower.includes('vehicle plate')) colMap.plate = i;
      if (lower.includes('actual arrival')) colMap.arrival = i;
      // "Actual Truck Disatch Time" (typo in source) / Dispatch Time
      if (lower.includes('actual truck') && (lower.includes('disatch') || lower.includes('dispatch'))) colMap.dispatch = i;
      else if (colMap.dispatch == null && lower.includes('dispatch') && lower.includes('time')) colMap.dispatch = i;
    });

    const { parseDateKey, cleanText, parseTravelMinutes, resolveDcName } = BltUtils;

    const normalized = aoa.slice(1).map(r => {
      const dateVal = (colMap.date != null ? r[colMap.date] : null) ?? (colMap.arrival != null ? r[colMap.arrival] : null);
      const dateKey = parseDateKey(dateVal);
      const onTimeRaw = colMap.onTime != null ? r[colMap.onTime] : null;
      const onTime = String(onTimeRaw || '').toUpperCase().trim();
      const status = cleanText(colMap.status != null ? r[colMap.status] : '');
      const get = (idx) => (idx != null ? r[idx] : null);

      const dispatchVal = get(colMap.dispatch);
      const hasDispatch = dispatchVal != null && String(dispatchVal).trim() !== '';

      const planTT = parseTravelMinutes(get(colMap.planTT));
      // Blank dispatch → Excel often produces garbage ACTUAL/LATE; treat as missing travel
      const actualTT = hasDispatch ? parseTravelMinutes(get(colMap.actualTT)) : null;
      const lateMin = hasDispatch ? parseTravelMinutes(get(colMap.lateMin)) : null;

      // DC INTENDED is a code → resolve to DC name for grouping/display
      const dcIntendedCode = cleanText(get(colMap.dcIntended)) || '(blank)';
      const dcName = resolveDcName(dcIntendedCode);

      return {
        dateKey,
        onTime, // YES / NO / empty
        hasDispatch,
        missingDispatch: !hasDispatch,
        planTT: planTT != null ? planTT : 0,
        actualTT: actualTT != null ? actualTT : 0,
        lateMin: lateMin != null ? lateMin : 0,
        route: cleanText(get(colMap.route)) || '(blank)',
        region: cleanText(get(colMap.region)) || 'SLU',
        shipmentNo: cleanText(get(colMap.shipmentNo)),
        uniqueCode: cleanText(get(colMap.uniqueCode)),
        status,
        mission: cleanText(get(colMap.mission)),
        depDc: cleanText(get(colMap.depDc)) || '(blank)',
        depDcCode: cleanText(get(colMap.depDcCode)),
        dcIntended: dcIntendedCode,
        dcName,
        sp: cleanText(get(colMap.phSp)) || cleanText(get(colMap.spNames)) || '(blank)',
        carrierName: cleanText(get(colMap.carrierName)) || '(blank)',
        carrier: cleanText(get(colMap.carrier)) || '(blank)',
        lineType: cleanText(get(colMap.lineType)) || '(blank)',
        destOutlet: cleanText(get(colMap.destOutlet)),
        driver: cleanText(get(colMap.driver)),
        plate: cleanText(get(colMap.plate))
      };
    }).filter(r => r.dateKey);

    // Keep only rows with valid on-time flag (YES/NO) — these are completed arrivals
    // Also prefer Completed / On the way if status present
    const valid = normalized.filter(r => {
      if (r.onTime !== 'YES' && r.onTime !== 'NO') return false;
      if (!r.status) return true;
      const s = r.status.toLowerCase();
      return s.includes('completed') || s.includes('on the way') || s.includes('arrived');
    });

    const dates = [...new Set(valid.map(r => r.dateKey))].filter(Boolean).sort();
    if (!dates.length) {
      alert('No valid branchline trips with On-Time (YES/NO) and dates found.');
      if (loading) loading.classList.add('hidden');
      return;
    }

    storedRows = valid;
    storedDates = dates;

    const selPrev = document.getElementById('selectPrev');
    const selLatest = document.getElementById('selectLatest');
    // Overall (All dates) at top of every date filter
    const dateOpts = '<option value="ALL">Overall (All dates)</option>' +
      dates.map(d => '<option value="'+d+'">'+d+'</option>').join('');
    if (selPrev) selPrev.innerHTML = dateOpts;
    if (selLatest) selLatest.innerHTML = dateOpts;
    const latest = dates[dates.length - 1];
    const prev = dates.length >= 2 ? dates[dates.length - 2] : dates[0];
    if (selPrev) selPrev.value = prev;
    if (selLatest) selLatest.value = latest;

    // Delay Reason / IR sheets (optional — does not block travel-time analysis)
    if (typeof BltDelayReason !== 'undefined' && BltDelayReason.ingestWorkbook) {
      try {
        BltDelayReason.ingestWorkbook(workbook);
      } catch (err) {
        console.warn('Delay Reason parse skipped:', err);
      }
    }

    if (onReadyCallback) onReadyCallback(prev, latest);
  }

  function init(onReady) {
    onReadyCallback = onReady;
    const dropZone = document.getElementById('dropZone');
    const fileInput = document.getElementById('fileInput');
    if (!dropZone || !fileInput) return;

    dropZone.addEventListener('click', () => fileInput.click());
    dropZone.addEventListener('dragover', e => { e.preventDefault(); dropZone.classList.add('dragover'); });
    dropZone.addEventListener('dragleave', () => dropZone.classList.remove('dragover'));
    dropZone.addEventListener('drop', e => {
      e.preventDefault();
      dropZone.classList.remove('dragover');
      if (e.dataTransfer.files.length) handleFile(e.dataTransfer.files[0]);
    });
    fileInput.addEventListener('change', e => {
      if (e.target.files.length) handleFile(e.target.files[0]);
    });
  }

  return { init, getState, handleFile };
})();
