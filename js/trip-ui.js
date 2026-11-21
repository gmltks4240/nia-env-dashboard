/* js/trip-ui.js (Scope 3 출장 3/3) — 화면 — 엑셀 올리기 · 장소 분류 검토표 · 미리보기 · 저장
   js/trip-engine.js 의 순수 함수를 불러 쓴다. 산정 규칙은 여기에 두지 않는다.
   core.js 의 loadAll 이 loadTripBatches 를, dashboard.js 가 tripBatches 를 쓴다. */
  let tripBatches = [];   // 출장(Scope 3) 연도별 산정 결과 — trip_batches 의 status=active 묶음 { year, mode, summary }
  async function loadTripBatches() {
    try { tripBatches = (await sb('GET', 'trip_batches', '?select=year,mode,summary,ref_version,created_at&status=eq.active')) || []; }
    catch (e) { tripBatches = []; }   // 표가 아직 없으면(SQL 실행 전) 출장 표시만 끔
  }

  /* ── 출장 배출량 (Scope 3 · 철도) — 엑셀 → 장소 분류 → 판정 → 미리보기 → 저장 ─────────────── */
  const TRIP_RAIL = '철도운임';
  let tripRef = null;
  // 기준표(운임·거리·판정)는 js/trip-data.js 의 @trip-ref 블록 — 색인은 출장 파일을 처음 올릴 때 한 번만 만듦
  const loadTripRef = async () => {
    if (!window.TRIP_REF) throw new Error('출장 산정 기준표가 이 파일에 없어요 · index.html을 최신으로 다시 올려 주세요');
    return tripRef ||= tripBuildRef(window.TRIP_REF, window.TRIP_FARE);
  };
  let trip = null;   // { name, hash, rows, rail, others, placeMap, placeMeta, results, summary, review, aiNote, dbMissing }
  const tripInfo = (msg, err) => { const el = $('trip-info'); el.innerHTML = msg; el.classList.toggle('err', !!err); };
  // 장소 사전(AI·사람 확정)을 끝까지 읽음 — 입력·수정 권한이 있을 때만 (장소명·행별 기록은 로그인한 담당자만 읽을 수 있음)
  //  map: 장소 → 지점 목록 · meta: 장소 → { source: 'human'|'ai', confidence, reason } · 표가 아직 없으면(SQL 실행 전) missing
  async function tripLoadPlaces() {
    const map = {}, meta = {};
    if (!session || !canEdit()) return { map, meta, missing: false };
    try {
      for (let off = 0; ; off += 1000) {
        const rows = await sb('GET', 'trip_places', `?select=raw,points,confidence,reason,source&order=raw.asc&limit=1000&offset=${off}`);
        (rows || []).forEach(r => {
          if (!Array.isArray(r.points)) return;
          map[r.raw] = r.points;
          meta[r.raw] = { source: r.source === 'human' ? 'human' : 'ai', confidence: ['high', 'low', 'unknown'].includes(r.confidence) ? r.confidence : 'high', reason: r.reason || '' };
        });
        if (!rows || rows.length < 1000) break;
      }
      return { map, meta, missing: false };
    } catch (e) { console.warn('[출장] 장소 사전을 읽지 못했어요:', e.message); return { map: {}, meta: {}, missing: isMissingTable(e) }; }
  }
  // 사전에도 없고 내장 규칙으로도 못 푼 장소만 AI 분류 함수로 보냄 (장소명 문자열만 전송) · 실패해도 산정은 계속
  //  50개씩 나눠, 첫 묶음으로 함수가 살아 있는지 본 뒤 나머지를 3묶음씩 동시에 · 한 묶음이 실패하면 새 묶음을 멈춤
  //  AI 가 '모름'이라 한 것도 돌려줌(함수가 사전에 남겨 다음에 다시 묻지 않음) → 검토표의 '확인 필요'에 나옴
  const TRIP_AI_BATCH = 50, TRIP_AI_PAR = 3;
  async function tripAskAI(raws, onStep) {
    const got = {}; let note = '', done = 0, next = 0, stop = false;
    if (!raws.length) return { got, note };
    if (!session?.access_token || !canEdit()) return { got, note: 'AI 분류는 로그인한 편집자만 쓸 수 있어요' };
    const batches = [];
    for (let i = 0; i < raws.length; i += TRIP_AI_BATCH) batches.push(raws.slice(i, i + TRIP_AI_BATCH));
    const step = async () => {
      const list = batches[next++];
      try {
        const res = await fetchT(`${SB_URL}/functions/v1/classify-places`, { method: 'POST',
          headers: { apikey: SB_KEY, Authorization: `Bearer ${session.access_token}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ places: list }) }, 120000);
        if (!res.ok) throw new Error(res.status === 404 ? 'AI 분류 함수가 아직 배포되지 않았어요' : `AI 분류 함수 오류 (${res.status})`);
        const j = await res.json();
        (j.results || []).forEach(r => {
          if (!r || typeof r.raw !== 'string' || !Array.isArray(r.points) || !list.includes(r.raw)) return;
          const confidence = ['high', 'low', 'unknown'].includes(r.confidence) ? r.confidence : 'low';
          got[r.raw] = { points: confidence === 'unknown' ? [] : r.points.filter(x => TRIP_POINTS.includes(x) && x !== '기타'), confidence, reason: String(r.reason || '').slice(0, 200) };
        });
        done += list.length; onStep?.(Math.min(done, raws.length), raws.length);
      } catch (e) { stop = true; note ||= e?.name === 'AbortError' ? 'AI 분류 함수가 응답하지 않았어요' : e.message; }
    };
    await step();
    const worker = async () => { while (!stop && next < batches.length) await step(); };
    if (!stop) await Promise.all(Array.from({ length: TRIP_AI_PAR }, worker));
    return { got, note };
  }
  const tripPlacesOf = rows => { const n = new Map(); rows.forEach(r => [r.origin, r.dest, r.via].forEach(t => { if (t) n.set(t, (n.get(t) || 0) + 1); })); return n; };
  const TRIP_CONF = { high: '높음', low: '낮음', unknown: '—' };
  function tripCompute() {
    trip.results = trip.rail.map(row => ({ row, res: classifyRail(row, tripRef, trip.placeMap) }));
    trip.summary = tripSummarize(trip.results);
    // 장소 분류 검토표: 교통비가 있는 철도 행에 나온 장소마다 분류·출처·운임 대조 (분류는 사람 확정 → AI → 키워드 규칙 순)
    const paid = trip.rail.filter(r => r.fare > 0), ev = tripPlaceEvidence(paid, tripRef, trip.placeMap);
    trip.review = [...tripPlacesOf(paid)].map(([raw, n]) => {
      const m = trip.placeMeta[raw], points = tripCities(raw, trip.placeMap), e = ev.get(raw) || null, mark = tripEvidenceMark(points, e);
      const source = m ? (m.source === 'human' ? '사람' : 'AI') : points.length ? '규칙' : '없음';
      const unsure = !!m && m.source === 'ai' && m.confidence === 'unknown';
      // 볼 순서: 0 운임과 다름 · 1 미분류 · 2 AI 도 모름 · 3 AI 확신 낮음·다름(건수 적음) · 4 나머지
      const rank = mark === '다름' ? 0 : source === '없음' ? 1 : unsure ? 2 : (source === 'AI' && m.confidence === 'low') || mark === '다름(건수 적음)' ? 3 : 4;
      return { raw, n, points, source, rank, mark,
        label: points.length ? points.join('·') : !m ? '미분류' : unsure ? '모름' : '거점 없음',
        confidence: m ? TRIP_CONF[m.confidence] : '', reason: m ? m.reason : points.length ? '키워드 규칙' : '',
        hint: e ? Object.entries(e.votes).sort((a, b) => b[1] - a[1]).map(([c, k]) => `${c} ${k}건`).join(' · ') : '' };
    }).sort((a, b) => a.rank - b.rank || b.n - a.n || (a.raw < b.raw ? -1 : 1));
  }
  async function tripRun(file) {
    if (!file) return;
    const isCsv = /\.(csv|tsv|txt)$/i.test(file.name);
    if (!isCsv && !/\.xlsx?$/i.test(file.name)) { tripInfo('엑셀(xlsx, xls)·CSV 파일만 읽을 수 있어요', true); return; }
    $('trip-out').hidden = true; trip = null;
    tripInfo(`${esc(file.name)} 읽는 중…`);
    try {
      const buf = await file.arrayBuffer(), rows = [], errs = [];
      const take = (n, grid) => { const p = tripParseSheet(n, grid); rows.push(...p.rows); if (p.error) errs.push(p.error); };
      if (isCsv) {
        // CSV 는 시트가 하나 — 연도는 출장시작일에서 읽음 · 한글 엑셀이 저장한 CSV 는 대개 CP949(EUC-KR)
        await loadTripRef();
        let text; try { text = new TextDecoder('utf-8', { fatal: true }).decode(buf); } catch { text = new TextDecoder('euc-kr').decode(buf); }
        text = text.replace(/^\ufeff/, '');
        take(file.name.replace(/\.[^.]+$/, ''), /\.csv$/i.test(file.name) && !text.includes('\t') ? parseCSV(text) : text.split(/\r?\n/).map(l => l.split('\t')));
      } else {
        const [X] = await Promise.all([loadXlsx(), loadTripRef()]), wb = X.read(buf, { type: 'array' });
        wb.SheetNames.forEach(n => { const ws = wb.Sheets[n]; if (ws && ws['!ref']) take(n, X.utils.sheet_to_json(ws, { header: 1, defval: '', raw: true })); });
      }
      const rail = rows.filter(r => r.mode === TRIP_RAIL && /^\d{4}$/.test(r.year));
      const noYear = rows.filter(r => r.mode === TRIP_RAIL && !/^\d{4}$/.test(r.year)).length;
      if (!rail.length && noYear) { tripInfo(`철도 ${noYear.toLocaleString('ko-KR')}건의 출장시작일을 읽지 못했어요 · 날짜를 2025-01-02 모양으로 저장해 주세요`, true); return; }
      if (!rail.length) { tripInfo(esc(errs[0] || (rows.length ? '철도 출장 행이 없어요 (국외출장 파일은 아직 산정하지 않아요)' : '출장 행을 찾지 못했어요')), true); return; }
      const others = {}; rows.forEach(r => { if (r.mode !== TRIP_RAIL) others[r.mode || '(빈칸)'] = (others[r.mode || '(빈칸)'] || 0) + 1; });
      let hash = '';
      try { hash = [...new Uint8Array(await crypto.subtle.digest('SHA-256', buf))].map(b => b.toString(16).padStart(2, '0')).join(''); } catch { /* file:// 등 — 지문 없이 진행 */ }
      const pl = await tripLoadPlaces();
      trip = { name: file.name, hash, rows, rail, others, noYear, placeMap: pl.map, placeMeta: pl.meta, dbMissing: pl.missing, aiNote: '' };
      tripCompute();
      const ask = trip.review.filter(x => x.source === '없음').map(x => x.raw);   // 건수 많은 장소부터
      if (ask.length) {
        const ai = await tripAskAI(ask, (a, b) => tripInfo(`새 장소 ${b.toLocaleString('ko-KR')}개 분류 중… (${a.toLocaleString('ko-KR')})`));
        Object.entries(ai.got).forEach(([raw, g]) => { trip.placeMap[raw] = g.points; trip.placeMeta[raw] = { source: 'ai', confidence: g.confidence, reason: g.reason }; });
        trip.aiNote = ai.note;
        if (Object.keys(ai.got).length) tripCompute();
      }
      tripRender();
    } catch (e) { console.error(e); trip = null; $('trip-out').hidden = true; tripInfo(esc(e.message || '파일을 읽지 못했어요'), true); }
  }
  function tripRender() {
    if (!trip) return;
    const n0 = v => Math.round(v).toLocaleString('ko-KR'), pc = (a, b) => b ? `${(a / b * 100).toFixed(1)}%` : '—';
    const years = Object.keys(trip.summary.byYear).sort();
    $('trip-summary').innerHTML = `<thead><tr><th>연도</th><th class="r">산정</th><th class="r">제외(0원)</th><th class="r">A 확정</th><th class="r">B 일치</th><th class="r">C 운임만</th><th class="r">D 추정</th><th class="r">만 인·km</th><th class="r">배출량 tCO₂eq</th><th class="r">그중 추정</th></tr></thead><tbody>` +
      years.map(y => { const s = trip.summary.byYear[y];
        return `<tr data-year="${y}"><td>${y}${isClosed(y) ? ' ' + icn('lock') : ''}</td><td class="r">${n0(s.n)}</td><td class="r">${n0(s.excluded)}</td>${['A', 'B', 'C', 'D'].map(g => `<td class="r">${pc(s[g], s.n)}</td>`).join('')}
          <td class="r">${(s.km / 1e4).toFixed(1)}</td><td class="r"><b>${(s.kg / 1000).toFixed(1)}</b></td><td class="r">${(s.kgD / 1000).toFixed(1)}</td></tr>`; }).join('') + '</tbody>';
    tripRenderReview();
    const dm = new Map();
    trip.results.forEach(({ row, res }) => { if (res.grade !== 'D') return; const k = row.fare, o = dm.get(k) || { n: 0, basis: res.basis, ex: `${row.origin}→${row.dest}` }; o.n++; dm.set(k, o); });
    const dtop = [...dm].sort((a, b) => b[1].n - a[1].n).slice(0, 10);
    $('trip-dtop').innerHTML = !dtop.length ? '<tbody><tr><td class="table-empty">추정으로 넘어간 행이 없어요</td></tr></tbody>' :
      '<thead><tr><th class="r">교통비</th><th class="r">건수</th><th>기록 예</th><th>적용</th></tr></thead><tbody>' +
      dtop.map(([f, o]) => `<tr><td class="r">${n0(f)}</td><td class="r">${n0(o.n)}</td><td>${esc(o.ex)}</td><td>${esc(o.basis)}</td></tr>`).join('') + '</tbody>';
    const oth = Object.entries(trip.others).sort((a, b) => b[1] - a[1]).map(([m, n]) => `${esc(m)} ${n0(n)}`).join(' · ');
    tripInfo(`${esc(trip.name)} · 철도 ${n0(trip.rail.length)}건 산정` + (oth ? ` · 미산정: ${oth}` : '') +
      (trip.noYear ? `<br>${icn('alert')} 출장시작일을 읽지 못한 철도 ${n0(trip.noYear)}건은 뺐어요` : '') +
      (trip.aiNote ? `<br>${icn('alert')} ${esc(trip.aiNote)} — 사전에 없는 장소는 내장 규칙으로만 분류했어요` : '') +
      (trip.dbMissing ? `<br>${icn('alert')} 장소 사전 표가 없어요 · 저장하려면 supabase/trip_scope3.sql을 한 번 실행하세요` : ''));
    $('trip-out').hidden = false;
  }
  const TRIP_VIEWS = { need: x => x.rank <= 3, ai: x => x.source === 'AI', rule: x => x.source === '규칙', human: x => x.source === '사람', all: () => true };
  const TRIP_MARK_CLS = { '일치': 'ok', '다름': 'bad', '다름(건수 적음)': 'warn' };
  function tripRenderReview() {
    if (!trip) return;
    const n0 = v => Math.round(v).toLocaleString('ko-KR'), list = trip.review.filter(TRIP_VIEWS[$('trip-rv-filter').value] || TRIP_VIEWS.need);
    const opt = '<option value="">지점 고르기</option>' + TRIP_POINTS.map(x => `<option value="${x}">${x === '기타' ? '거점 없음' : x}</option>`).join('');
    $('trip-rv-n').textContent = `확인 필요 ${n0(trip.review.filter(TRIP_VIEWS.need).length)}개 · 전체 ${n0(trip.review.length)}개`;
    $('trip-review').innerHTML = !list.length ? '<tbody><tr><td class="table-empty">여기에 해당하는 장소가 없어요</td></tr></tbody>' :
      '<thead><tr><th>장소</th><th class="r">출장</th><th>분류</th><th>출처</th><th>확신</th><th>이유</th><th>운임이 가리키는 곳</th><th>운임 대조</th><th>고치기</th></tr></thead><tbody>' +
      list.slice(0, 100).map(x => `<tr><td>${esc(x.raw)}</td><td class="r">${n0(x.n)}</td><td>${esc(x.label)}</td><td>${x.source}</td><td>${x.confidence}</td><td>${esc(x.reason)}</td><td>${esc(x.hint)}</td>
        <td><span class="trip-mk ${TRIP_MARK_CLS[x.mark] || ''}">${x.mark}</span></td>
        <td><select data-raw="${esc(x.raw)}" aria-label="${esc(x.raw)} 지점"${canEdit() ? '' : ' disabled'}>${opt}</select></td></tr>`).join('') +
      (list.length > 100 ? `<tr><td colspan="9" class="table-empty">외 ${n0(list.length - 100)}개 — 검토표 CSV로 전체를 볼 수 있어요</td></tr>` : '') + '</tbody>';
  }
  function tripReviewDownload() {
    if (!trip) return;
    const head = ['장소', '출장 건수', '분류', '출처', '확신', '이유', '운임이 가리키는 곳', '운임 대조'];
    const lines = trip.review.map(x => [x.raw, x.n, x.label, x.source, x.confidence, x.reason, x.hint, x.mark]);
    const csv = [head, ...lines].map(l => l.map(v => `"${String(v ?? '').replace(/"/g, '""')}"`).join(',')).join('\n');
    const url = URL.createObjectURL(new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' })), a = document.createElement('a');
    a.href = url; a.download = `NIA_출장_장소분류_검토표_${new Date().toISOString().slice(0, 10)}.csv`; a.click(); URL.revokeObjectURL(url);
    showToast(`${icn('download')} 장소 ${lines.length.toLocaleString('ko-KR')}개 CSV 내보내기 완료`);
  }
  function tripDownload() {
    if (!trip) return;
    const head = ['연도', '번호', '출장시작일', '출발지', '경유지', '목적지', '교통비', '판정등급', '이동횟수(편도)', '거리km', '배출계수', 'kgCO2e', '판정근거'];
    const lines = trip.results.map(({ row: r, res: x }) => [r.year, r.seq, r.date, r.origin, r.via, r.dest, r.fare, x.gradeLabel, x.legs, x.km, x.factor, x.kg, x.basis]);
    const csv = [head, ...lines].map(l => l.map(v => `"${String(v ?? '').replace(/"/g, '""')}"`).join(',')).join('\n');
    const url = URL.createObjectURL(new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' })), a = document.createElement('a');
    a.href = url; a.download = `NIA_출장_철도_Scope3_행별_${new Date().toISOString().slice(0, 10)}.csv`; a.click(); URL.revokeObjectURL(url);
    showToast(`${icn('download')} ${lines.length.toLocaleString('ko-KR')}건 CSV 내보내기 완료`);
  }
  // 사람이 장소를 지정 → 사전에 '사람 확정'으로 남기고 다시 계산 (AI가 덮어쓰지 않음)
  async function tripSetPlace(raw, point) {
    if (!trip || !point || !canEdit()) return;
    trip.placeMap[raw] = point === '기타' ? [] : [point];
    trip.placeMeta[raw] = { source: 'human', confidence: 'high', reason: '사람 확정' };
    tripCompute(); tripRender();
    try {
      await sb('POST', 'trip_places', '?on_conflict=raw', [{ raw, points: trip.placeMap[raw], confidence: 'high', reason: '사람 확정', source: 'human', updated_by: me?.email || null }], 'resolution=merge-duplicates,return=minimal');
      showToast(`'${esc(raw)}' → ${esc(point)} · 장소 사전에 저장했어요`);
    } catch (e) { showToast(`이번 계산에만 반영했어요 · 장소 사전 저장 실패: ${esc(e.message)}`, 'err'); }
  }
  let tripSaving = false;
  async function tripSave() {
    if (!trip || tripSaving || !canEdit()) return;
    const years = Object.keys(trip.summary.byYear).sort(), locked = years.filter(isClosed);
    if (locked.length) { showToast(`${locked.join('·')}년은 마감된 연도라 저장할 수 없어요`, 'err'); return; }
    const btn = $('trip-save'); tripSaving = true; btn.disabled = true; btn.textContent = '저장 중…';
    try {
      for (const y of years) {
        const id = crypto.randomUUID(), s = trip.summary.byYear[y];
        const months = Object.fromEntries(Object.entries(trip.summary.byMonth).filter(([k]) => k.startsWith(y)).map(([k, v]) => [k, { n: v.n, km: tripR1(v.km), kg: Math.round(v.kg * 1000) / 1000 }]));
        const mine = trip.results.filter(x => x.row.year === y);
        await sb('POST', 'trip_batches', '', [{ id, year: Number(y), mode: 'rail', file_name: trip.name, file_sha256: trip.hash || null, ref_version: tripRef.version,
          uploaded_by: me?.email || null, status: 'saving', summary: { ...s, km: tripR1(s.km), kg: Math.round(s.kg * 1000) / 1000, kgD: Math.round(s.kgD * 1000) / 1000, months, others: trip.others } }], 'return=minimal');
        for (let i = 0; i < mine.length; i += 500) {
          btn.textContent = `${y}년 저장 중… ${Math.min(i + 500, mine.length).toLocaleString('ko-KR')}/${mine.length.toLocaleString('ko-KR')}`;
          await sb('POST', 'trip_rows', '', mine.slice(i, i + 500).map(({ row: r, res: x }) => ({ batch_id: id, year: Number(y), seq: r.seq, trip_date: r.date || null, mode: 'rail',
            origin: r.origin, via: r.via, dest: r.dest, fare: r.fare, grade: x.grade, grade_label: x.gradeLabel, legs: x.legs, km: x.km, factor: x.factor, kgco2e: x.kg, basis: x.basis })), 'return=minimal');
        }
        // 새 묶음이 다 들어간 뒤에 같은 연도의 이전 묶음을 내림 (도중에 실패하면 이전 결과가 그대로 남음)
        await sb('PATCH', 'trip_batches', `?id=eq.${id}`, { status: 'active' }, 'return=minimal');
        await sb('DELETE', 'trip_rows', `?year=eq.${y}&mode=eq.rail&batch_id=neq.${id}`, null, 'return=minimal');
        await sb('PATCH', 'trip_batches', `?year=eq.${y}&mode=eq.rail&status=eq.active&id=neq.${id}`, { status: 'replaced' }, 'return=minimal');
      }
      showToast(`출장(철도) ${years.join('·')}년 산정 결과를 저장했어요`);
      await loadTripBatches(); renderAll({ force: true });
    } catch (e) {
      showToast(trip.dbMissing || /trip_/.test(e.message) ? `저장하지 못했어요 · supabase/trip_scope3.sql을 먼저 실행해 주세요 (${esc(e.message)})` : `저장하지 못했어요 · ${esc(e.message)}`, 'err');
    } finally { tripSaving = false; btn.disabled = false; btn.textContent = '저장'; }
  }
  $('trip-drop').addEventListener('click', () => $('trip-file').click());
  $('trip-drop').addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); $('trip-file').click(); } });
  $('trip-file').addEventListener('change', e => { tripRun(e.target.files[0]); e.target.value = ''; });
  $('trip-dl').addEventListener('click', tripDownload);
  $('trip-save').addEventListener('click', tripSave);
  $('trip-review').addEventListener('change', e => { const sel = e.target.closest('select[data-raw]'); if (sel) tripSetPlace(sel.dataset.raw, sel.value); });
  $('trip-rv-filter').addEventListener('change', tripRenderReview);
  $('trip-rv-dl').addEventListener('click', tripReviewDownload);
