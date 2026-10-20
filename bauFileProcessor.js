/* ==========================================================================
   MODULE: BAU FILE PROCESSOR (Excel upload & normalization for Branchline App Usage)
   ========================================================================== */
const BauFileProcessor = (() => {
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
          const hdr = (sample[0] || []).map(h => String(h || '').toLowerCase()).join(' ');
          if (hdr.includes('clock in remarks') || hdr.includes('clock out remarks')) {
            sheetName = n;
            break;
          }
        }
      }
    }
    if (!sheetName) {
      alert('No DATA sheet found with Clock In / Clock Out Remarks columns.');
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
      if (lower === 'date' && colMap.date == null) colMap.date = i;
      if ((lower.includes('shipmentno') || lower === 'shipment no') && colMap.shipmentNo == null) colMap.shipmentNo = i;
      if (lower.includes('unique code') && colMap.uniqueCode == null) colMap.uniqueCode = i;
      if (lower.includes('task status') && colMap.status == null) colMap.status = i;
      if (lower.includes('mission name') && colMap.mission == null) colMap.mission = i;
      if ((lower.includes('departure dc name') || lower === 'departure dc name') && colMap.depDc == null) colMap.depDc = i;
      if (lower.includes('departure dc code') && colMap.depDcCode == null) colMap.depDcCode = i;
      // First "DC INTENDED" only — file has a duplicate column that is mostly blank / SP names
      if (lower === 'dc intended' && colMap.dcIntended == null) colMap.dcIntended = i;
      if ((lower.includes('sp names') || lower === 'sp names') && colMap.spNames == null) colMap.spNames = i;
      if (lower.includes('vehicle') && lower.includes('carrier') && lower.includes('name') && colMap.carrierName == null) colMap.carrierName = i;
      if (lower === 'carrier' && colMap.carrier == null) colMap.carrier = i;
      if (lower.includes('line type') && colMap.lineType == null) colMap.lineType = i;
      if (lower.includes('driver') && !lower.includes('phone') && !lower.includes('check') && colMap.driver == null) colMap.driver = i;
      if (lower.includes('vehicle plate') && colMap.plate == null) colMap.plate = i;
      if ((lower === 'route' || lower === 'route label') && colMap.route == null) colMap.route = i;
      if (lower.includes('clock in remarks') && colMap.clockIn == null) colMap.clockIn = i;
      if (lower.includes('clock out remarks') && colMap.clockOut == null) colMap.clockOut = i;
      if ((lower.includes('to the vehicle outlet name') || lower.includes('outlet name')) && colMap.destOutlet == null) colMap.destOutlet = i;
      if (lower.includes('actual arrival') && colMap.arrival == null) colMap.arrival = i;
    });

    const { parseDateKey, cleanText, normalizeYesNo, resolveDcName } = BauUtils;

    const normalized = aoa.slice(1).map(r => {
      const get = (idx) => (idx != null ? r[idx] : null);
      const dateVal = get(colMap.date) ?? get(colMap.arrival);
      const dateKey = parseDateKey(dateVal);
      const status = cleanText(get(colMap.status));
      const clockIn = normalizeYesNo(get(colMap.clockIn));
      const clockOut = normalizeYesNo(get(colMap.clockOut));
      const compliant = clockIn === 'YES' && clockOut === 'YES';

      const dcIntendedCode = cleanText(get(colMap.dcIntended)) || '(blank)';
      const dcName = resolveDcName(dcIntendedCode);

      // SP: prefer SP NAMES, fallback carrier name
      let sp = cleanText(get(colMap.spNames));
      if (!sp || sp === '.') sp = cleanText(get(colMap.carrierName)) || '(blank)';

      return {
        dateKey,
        clockIn,
        clockOut,
        compliant,
        status,
        shipmentNo: cleanText(get(colMap.shipmentNo)),
        uniqueCode: cleanText(get(colMap.uniqueCode)),
        mission: cleanText(get(colMap.mission)),
        depDc: cleanText(get(colMap.depDc)) || '(blank)',
        depDcCode: cleanText(get(colMap.depDcCode)),
        dcIntended: dcIntendedCode,
        dcName,
        sp,
        carrierName: cleanText(get(colMap.carrierName)) || '(blank)',
        carrier: cleanText(get(colMap.carrier)) || '(blank)',
        lineType: cleanText(get(colMap.lineType)) || '(blank)',
        destOutlet: cleanText(get(colMap.destOutlet)),
        driver: cleanText(get(colMap.driver)) || '(blank)',
        plate: cleanText(get(colMap.plate)),
        route: cleanText(get(colMap.route)) || '(blank)'
      };
    }).filter(r => r.dateKey);

    // Keep Completed (or On the way) with at least one clock flag
    const valid = normalized.filter(r => {
      if (r.clockIn !== 'YES' && r.clockIn !== 'NO' && r.clockOut !== 'YES' && r.clockOut !== 'NO') return false;
      if (!r.status) return true;
      const s = r.status.toLowerCase();
      return s.includes('completed') || s.includes('on the way') || s.includes('arrived');
    });

    const dates = [...new Set(valid.map(r => r.dateKey))].filter(Boolean).sort();
    if (!dates.length) {
      alert('No valid App Usage rows with Clock In/Out (YES/NO) and dates found.');
      if (loading) loading.classList.add('hidden');
      return;
    }

    storedRows = valid;
    storedDates = dates;

    const selPrev = document.getElementById('selectPrev');
    const selLatest = document.getElementById('selectLatest');
    const dateOpts = '<option value="ALL">Overall (All dates)</option>' +
      dates.map(d => '<option value="' + d + '">' + d + '</option>').join('');
    if (selPrev) selPrev.innerHTML = dateOpts;
    if (selLatest) selLatest.innerHTML = dateOpts;
    const latest = dates[dates.length - 1];
    const prev = dates.length >= 2 ? dates[dates.length - 2] : dates[0];
    if (selPrev) selPrev.value = prev;
    if (selLatest) selLatest.value = latest;

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
