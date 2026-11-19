/* js/input.js (7/9) — 데이터 입력 — 에너지·폐기물·기타 지표 입력표와 저장 · 일괄 입력
   한 덩어리였던 js/app.js 를 순서 그대로 나눈 것. 파일들은 index.html 에 적힌 순서(core → … → main)로 불러오고,
   최상위 const·let·function 은 모든 파일이 함께 쓴다. 새 파일을 만들면 index.html 에도 넣을 것. */
  /* ── 에너지 월별 테이블 ─────────────────────────────── */
  function renderEnergyTable() {
    energyDirty = false; // DB 값으로 다시 그리므로 편집 상태 초기화
    const yr = $('e-year').value, si = $('e-site').value, ty = $('e-type').value;
    const f  = GHG[ty];
    $('e-unit-info').textContent = !f ? '' : !isEmit(ty) ? `단위: ${f.unit} · ${f.desc}` : `단위: ${f.unit} · ${f.scope} · 배출계수 ${f.desc}`;
    const tb = $('energy-tbody'), tf = $('energy-tfoot');

    if (!si || !ty) {
      $('e-save').disabled = false;
      $('e-save-info').textContent = '거점과 에너지원을 선택하세요';
      tb.innerHTML = `<tr><td colspan="5" class="table-empty" style="padding:20px">거점과 에너지원을 선택하면 월별 입력표가 표시됩니다</td></tr>`;
      tf.innerHTML = '';
      return;
    }

    const existing = {};
    energyRecs
      .filter(r => r.date?.startsWith(yr) && r.site === si && r.type === ty)
      .forEach(r => { const m = r.date?.split('-')[1]; if (m) existing[m] = r; });
    const ghgText = a => (!isEmit(ty) || !f) ? '' : fq(calcGHG(ty, a)) + ' tCO₂eq';

    tb.innerHTML = Array.from({ length: 12 }, (_, i) => {
      const m = pad(i + 1), ex = existing[m], na = !ex && isNaCell(si, ty, `${yr}-${m}`);
      const val = ex ? ex.amount : na ? '-' : '', note = ex ? (ex.note || '') : '';
      const badge = ex ? savedBadge('energy', [ex]) : na ? `<span class="existing-badge">해당없음</span>` : '';
      return `<tr data-month="${m}">
        <td class="m-label">${i+1}월</td>
        <td><input class="m-in${ex || na ? ' has-data' : ''}" type="text" inputmode="decimal" placeholder="미입력" value="${esc(val)}" data-m="${m}" data-field="amount" style="width:130px" aria-label="${i+1}월 사용량 (자료가 없으면 -)"></td>
        <td class="m-ghg" id="eghg-${m}">${ex ? ghgText(+ex.amount || 0) : na ? '해당없음' : ''}</td>
        <td><input class="m-note-in" type="text" placeholder="비고" value="${esc(note)}" data-m="${m}" data-field="note"></td>
        <td style="text-align:center">${badge}</td>
      </tr>`;
    }).join('');

    // 입력 이벤트: 배출량 자동 계산 + 합계 갱신 (0도 유효한 값)
    tb.querySelectorAll('input[data-field="amount"]').forEach(inp => {
      inp.addEventListener('input', () => {
        const a = numIn(inp.value);
        $(`eghg-${inp.dataset.m}`).textContent = isDash(inp.value) ? '해당없음' : !isNaN(a) ? ghgText(a) : '';
        inp.classList.toggle('has-data', inp.value !== '');
        updateEnergyTotals();
      });
    });

    updateEnergyTotals();
    applyLock(tb, 'e-save', 'e-save-info', yr, Object.keys(existing).length
      ? `기저장: ${Object.keys(existing).length}개월 · 값을 바꾸면 덮어쓰고, 칸을 비우면 삭제됩니다 · 자료가 없는 달은 '-'`
      : `${yr}년 ${si} ${ty} — 값을 입력하고 저장하세요 (빈칸 = 누락 · 자료가 없는 달은 '-' = 해당없음)`);
  }

  function updateEnergyTotals() {
    const ty = $('e-type').value, f = GHG[ty];
    const tf = $('energy-tfoot');
    let totalAmt = 0, totalGhg = 0, hasAny = false;
    document.querySelectorAll('#energy-tbody input[data-field="amount"]').forEach(inp => {
      const v = numIn(inp.value);
      if (!isNaN(v)) { totalAmt += v; totalGhg += calcGHG(ty, v); hasAny = true; }
    });
    if (!hasAny || !ty) { tf.innerHTML = ''; return; }
    tf.innerHTML = `<tr class="total-row">
      <td class="m-label">합계</td>
      <td style="font-family:var(--fdata);font-size:13px;padding:8px 8px">${fq(totalAmt)} ${f ? f.unit : ''}</td>
      <td class="m-ghg">${!isEmit(ty) ? '' : fq(totalGhg) + ' tCO₂eq'}</td>
      <td colspan="2"></td>
    </tr>`;
  }

  /* ── 폐기물 봉투 입력표 (월 × 봉투 규격) — 데이터 입력 탭과 그래프 팝업이 같이 씀 ─────
     규격(L)은 정해 두지 않고 직접 입력: 그 거점이 써 온 규격이 열로 나오고, '+ 규격'으로 열을 더하거나 머리글 L값을 고침
     한 달에 여러 규격을 살 수 있어 규격마다 수량을 따로 저장 (DB에는 규격마다 한 행)
     열은 data-col로 구분 (머리글 L값을 바꿀 수 있어서) · 칸의 data-sz는 처음 그릴 때의 규격(참고용) */
  const wasteSizesOf = si => [...new Set(wasteRecs.filter(r => r.site === si).map(r => +r.bagSize).filter(v => v > 0))].sort((x, y) => x - y);
  const wasteAt = (ym, si, sz) => wasteRecs.filter(r => r.date === ym && r.site === si && +r.bagSize === sz);
  const wsHead = (col, sz, dis) => `<th class="wsz"><span class="wsz-box"><input class="m-in wsz-v" type="number" min="0" step="any" inputmode="decimal"` +
    ` value="${sz}" data-orig="${sz}" data-col="${col}" placeholder="규격"${dis} aria-label="봉투 규격 (L)"><i>L</i></span></th>`;
  const wsCell = (col, m, sz, q, dis) => `<td><input class="m-in wq${q !== '' ? ' has-data' : ''}" type="text" inputmode="numeric" value="${q}"` +
    ` data-orig="${q}" data-m="${m}" data-col="${col}" data-sz="${sz}"${dis} aria-label="${+m}월 ${sz ? `${sz}L ` : '새 규격 '}봉투 수량"></td>`;
  function wasteGridParts(yr, si, locked) {
    const sizes = wasteSizesOf(si), cols = sizes.length ? sizes : [''], dis = locked ? ' disabled' : '';   // 써 온 규격이 없으면 빈 열 하나 (규격부터 적게)
    let saved = 0;
    const head = `<tr><th style="width:48px">월</th>${cols.map((sz, k) => wsHead(`c${k}`, sz, dis)).join('')}` +
      `<th class="wsz-add">${locked ? '' : '<button type="button" class="wg-add" title="봉투 규격 열 추가">+ 규격</button>'}</th>` +
      '<th style="text-align:right">발생량 (L)</th><th style="text-align:right">중량 (kg)</th><th style="text-align:right">배출량 (tCO₂eq)</th><th>비고</th><th style="width:60px"></th></tr>';
    const body = m12(i => {
      const m = pad(i + 1), ym = `${yr}-${m}`, rs = wasteRecs.filter(r => r.date === ym && r.site === si);
      if (rs.length) saved++;
      const note = rs.map(r => r.note || '').find(Boolean) || '';
      const na = !rs.length && isNaCell(si, '폐기물', ym);   // '-'(해당없음)로 저장한 달은 첫 칸에 '-'
      return `<tr data-month="${m}"><td class="m-label">${i + 1}월</td>` + cols.map((sz, k) => {
        const ex = sz === '' ? [] : wasteAt(ym, si, sz);
        return wsCell(`c${k}`, m, sz, ex.length ? sumBy(ex, r => r.qty) : na && k === 0 ? '-' : '', dis);
      }).join('') + '<td class="wsz-gap"></td>' +
      '<td class="m-ghg" data-out="vol" style="text-align:right;color:var(--indigo)"></td><td class="m-ghg" data-out="kg" style="text-align:right"></td>' +
      '<td class="m-ghg" data-out="ghg" style="text-align:right"></td>' +
      `<td><input class="m-note-in" type="text" placeholder="비고" value="${esc(note)}" data-orig="${esc(note)}" data-m="${m}" data-field="note"${dis} aria-label="${i + 1}월 비고"></td>` +
      `<td style="text-align:center">${rs.length ? savedBadge('waste', rs) : na ? '<span class="existing-badge">해당없음</span>' : ''}</td></tr>`;
    }).join('');
    return { head, body, ncol: cols.length, saved };
  }
  // 머리글 L값 → 열마다 규격 (비었거나 0 이하면 null)
  const wasteColSizes = tbl => Object.fromEntries([...tbl.querySelectorAll('input.wsz-v')].map(h => [h.dataset.col, +h.value > 0 ? +h.value : null]));
  // 규격 열 추가 (맨 끝, '+ 규격' 앞) → 새 머리글에 커서
  function wasteGridAddCol(tbl) {
    const k = +tbl.dataset.ncol || tbl.querySelectorAll('input.wsz-v').length, col = `c${k}`;
    tbl.dataset.ncol = k + 1;
    tbl.querySelector('th.wsz-add').insertAdjacentHTML('beforebegin', wsHead(col, '', ''));
    tbl.querySelectorAll('tbody tr[data-month]').forEach(tr => tr.querySelector('td.wsz-gap').insertAdjacentHTML('beforebegin', wsCell(col, tr.dataset.month, '', '', '')));
    tbl.querySelector(`input.wsz-v[data-col="${col}"]`).focus();
    wasteGridRecalc(tbl);
  }
  // 달마다 발생량(L)·중량(kg)·배출량 + 합계 줄(규격별 매수 포함) · 바뀐 칸 표시
  function wasteGridRecalc(tbl) {
    const size = wasteColSizes(tbl), heads = [...tbl.querySelectorAll('input.wsz-v')], qty = {};
    let tv = 0, tkg = 0, any = false;
    tbl.querySelectorAll('tbody tr[data-month]').forEach(tr => {
      let vol = 0, kg = 0, has = false, dash = false;
      tr.querySelectorAll('input.wq').forEach(inp => {
        const q = numIn(inp.value), sz = size[inp.dataset.col], col = inp.dataset.col;
        inp.classList.toggle('has-data', inp.value !== '');
        inp.classList.toggle('chg', inp.value.trim() !== inp.dataset.orig);
        if (isDash(inp.value)) dash = true;
        if (isNaN(q)) return;
        qty[col] = (qty[col] || 0) + q;
        if (sz) { vol += sz * q; kg += calcKg(sz, q); has = true; }
      });
      const note = tr.querySelector('[data-field="note"]');
      note?.classList.toggle('chg', note.value.trim() !== (note.dataset.orig || '').trim());
      const out = k => tr.querySelector(`[data-out="${k}"]`);
      out('vol').textContent = has ? `${fq(vol)} L` : dash ? '해당없음' : '';
      out('kg').textContent  = has ? fq(kg) : '';
      out('ghg').textContent = has ? fq(wasteGhg(kg / 1000, tbl.dataset.site)) : '';
      if (has) { tv += vol; tkg += kg; any = true; }
    });
    // 수량을 적었는데 규격이 없는 열은 머리글을 빨갛게
    heads.forEach(h => { h.classList.toggle('chg', h.value.trim() !== h.dataset.orig); h.classList.toggle('bad', !size[h.dataset.col] && qty[h.dataset.col] != null); });
    const foot = tbl.querySelector('tfoot');
    if (!foot) return;
    foot.innerHTML = !any ? '' : '<tr class="total-row"><td class="m-label">합계</td>' +
      heads.map(h => `<td class="m-ghg wq-sum">${qty[h.dataset.col] != null ? `${fmt(qty[h.dataset.col], 0)}매` : ''}</td>`).join('') + `<td></td>
      <td class="m-ghg" style="text-align:right;color:var(--indigo)">${fq(tv)} L</td>
      <td class="m-ghg" style="text-align:right">${fq(tkg)} kg<div class="wg-ton">${fq(tkg / 1000)} ton</div></td>
      <td class="m-ghg" style="text-align:right">${fq(wasteGhg(tkg / 1000, tbl.dataset.site))} tCO₂eq</td><td colspan="2"></td></tr>`;
  }
  // 저장: 바꾼 칸만 → { n: 저장 칸 수, d: 삭제 칸 수 } | false
  //  빈칸 = 그 규격 삭제 · 같은 규격이 여러 건이면 하나로 합침 · 머리글 L값을 바꾼 열은 옛 규격 행을 지우고 새 규격으로 다시 저장
  const listShort = (xs, k = 4) => xs.slice(0, k).join(', ') + (xs.length > k ? ` 외 ${xs.length - k}칸` : '');
  const WASTE_MULTI_MSG = '지금 DB는 한 달에 봉투 규격을 하나만 저장하게 되어 있어요. 저장소의 supabase/waste_multi_size.sql을 Supabase SQL Editor에서 한 번 실행하면 규격별로 저장돼요';
  async function saveWasteGrid(tbl, yr, si) {
    const heads = [...tbl.querySelectorAll('input.wsz-v')], size = wasteColSizes(tbl);
    const errAt = tbl.closest('#drill') ? $('drill-save') : $('w-save');   // 오류 문구를 띄울 저장 버튼
    const rows = [...tbl.querySelectorAll('tbody tr[data-month]')];
    const filled = col => rows.some(tr => { const v = tr.querySelector(`input.wq[data-col="${col}"]`)?.value.trim() ?? ''; return v !== '' && !isDash(v); });
    const used = heads.filter(h => filled(h.dataset.col));
    // ① 규격 검사: 수량을 적은 열은 규격(L)이 0보다 커야 하고, 같은 규격 열이 둘이면 안 됨
    const noSize = used.find(h => !size[h.dataset.col]);
    if (noSize) { fieldErr(errAt, [noSize], '수량을 적은 열의 봉투 규격(L)을 입력하세요'); return false; }
    const dup = used.map(h => size[h.dataset.col]).find((v, i, a) => a.indexOf(v) !== i);
    if (dup != null) { fieldErr(errAt, used.filter(h => size[h.dataset.col] === dup), `${fmt(dup, Number.isInteger(dup) ? 0 : 1)}L 규격 열이 두 개예요 · 한 열에 모아 입력하세요`); return false; }
    const posts = [], patches = [], dels = [], bad = [], cleared = [], noteOnly = [], moved = new Set(), naAdd = [], naDel = [], mixed = [], badEls = [];
    rows.forEach(tr => {
      const m = tr.dataset.month, ym = `${yr}-${m}`, noteEl = tr.querySelector('[data-field="note"]');
      const note = noteEl.value.trim(), noteChg = note !== (noteEl.dataset.orig || '').trim();
      const qs = [...tr.querySelectorAll('input.wq')], key = naKey(si, '폐기물', ym);
      // '-'가 하나라도 있으면 그 달 전체가 해당없음 (수량과 함께 쓰면 안 됨) · 모두 빈칸이면 누락
      if (qs.some(i => isDash(i.value))) {
        if (qs.some(i => i.value.trim() !== '' && !isDash(i.value))) { mixed.push(`${+m}월`); badEls.push(...qs.filter(i => i.value.trim() !== '')); return; }
        const ex = wasteRecs.filter(r => r.date === ym && r.site === si);
        if (ex.length) { dels.push(...ex); cleared.push(`${+m}월`); }
        naAdd.push(key); return;
      }
      naDel.push(key);
      if (noteChg && note && !qs.some(i => i.value.trim() !== '')) noteOnly.push(`${+m}월`);
      qs.forEach(inp => {
        const h = heads.find(x => x.dataset.col === inp.dataset.col), orig = h.dataset.orig === '' ? null : +h.dataset.orig, sz = size[inp.dataset.col];
        const ex = orig == null ? [] : wasteAt(ym, si, orig), raw = inp.value.trim(), label = `${+m}월 ${sz ?? orig ?? ''}L`;
        const sizeChg = ex.length > 0 && sz !== orig;
        if (!(raw !== inp.dataset.orig || inp.validity.badInput) && !sizeChg && !(noteChg && ex.length)) return;   // 그대로인 칸
        if (raw === '' && !inp.validity.badInput) { if (ex.length) { dels.push(...ex); cleared.push(`${+m}월 ${orig}L`); } return; }
        const q = numIn(raw);
        if (!Number.isInteger(q)) { bad.push(label); badEls.push(inp); return; }
        const d = { bag_size: sz, qty: q, weight_kg: calcKg(sz, q), weight_ton: calcTon(sz, q), note };
        if (sizeChg) { dels.push(...ex); posts.push({ date: ym, site: si, ...d }); moved.add(`${orig}L → ${sz}L`); }   // 규격을 바꾼 칸
        else if (ex.length) { patches.push([ex[0].id, d]); dels.push(...ex.slice(1)); }
        else posts.push({ date: ym, site: si, ...d });
      });
    });
    if (mixed.length) { fieldErr(errAt, badEls, `${mixed.join(', ')}: '-'(해당없음)와 수량을 한 달에 같이 넣을 수 없어요`); return false; }
    if (bad.length) { fieldErr(errAt, badEls, `${listShort(bad)}: 수량은 0 이상의 정수로 입력하세요 (자료가 없으면 -)`); return false; }
    if (noteOnly.length) { showToast(`${noteOnly.join(', ')}: 비고는 봉투 수량과 함께 저장돼요`, 'err'); return false; }
    const na = naDiff(naAdd, naDel);
    if (na.add.length && !v2) { showToast(NA_V2_MSG, 'err'); return false; }
    if (!posts.length && !patches.length && !dels.length && !na.add.length && !na.del.length) { showToast('바뀐 값이 없습니다', 'err'); return false; }
    if (cleared.length || moved.size) {
      const msg = [cleared.length ? `${listShort(cleared)}은 칸이 비었거나 '-'라서 저장된 값을 삭제합니다.` : '',
                   moved.size ? `봉투 규격을 바꿔 저장합니다: ${[...moved].join(', ')}` : ''].filter(Boolean).join(' ');
      if (!(await confirmBox(msg, cleared.length ? '삭제하고 저장' : '바꿔서 저장', '규격을 바꾸면 그 열의 올해 자료가 새 규격으로 저장돼요.', cleared.length ? 'danger' : 'primary'))) return false;
    }
    try {   // 지우기 → 고치기 → 추가 순 (규격을 바꾸거나 맞바꿔도 같은 달·규격이 잠깐이라도 겹치지 않게)
      for (const r of dels) await sb('DELETE', 'waste', `?id=eq.${r.id}`);
      for (const [id, d] of patches) await sb('PATCH', 'waste', `?id=eq.${id}`, d);
      for (const d of posts) await sb('POST', 'waste', '', d);
    } catch (e) { if (e.code === '23505') e.message = WASTE_MULTI_MSG; throw e; }
    await saveNa(na);
    return { n: posts.length + patches.length + na.add.length, d: cleared.length };
  }

  function renderWasteTable() {
    wasteDirty = false; // DB 값으로 다시 그리므로 편집 상태 초기화
    const yr = $('w-year').value, si = $('w-site').value;
    const th = $('waste-thead'), tb = $('waste-tbody'), tf = $('waste-tfoot');
    if (!si) {
      $('w-save').disabled = false;
      $('w-save-info').textContent = '거점을 선택하세요';
      th.innerHTML = '';
      tb.innerHTML = `<tr><td colspan="9" class="table-empty" style="padding:20px">거점을 선택하면 월별 입력표가 표시됩니다</td></tr>`;
      tf.innerHTML = '';
      return;
    }
    const g = wasteGridParts(yr, si, false), tbl = $('waste-mtbl');
    tbl.dataset.site = si;
    th.innerHTML = g.head; tb.innerHTML = g.body; tf.innerHTML = '';
    tbl.dataset.ncol = g.ncol;
    wasteGridRecalc(tbl);
    applyLock(tbl, 'w-save', 'w-save-info', yr, g.saved
      ? `기저장: ${g.saved}개월 · 규격별 수량을 바꾸면 덮어쓰고, 칸을 비우면 그 규격을 삭제합니다`
      : `${yr}년 ${si} — 봉투 규격(L)을 머리글에 적고 달마다 산 수량을 입력하세요`);
    tbl.querySelector('.wg-add')?.toggleAttribute('hidden', isClosed(yr));
  }

  /* ── 에너지 저장 (0 저장 가능, 빈칸으로 지우면 삭제) ───── */
  $('e-save').addEventListener('click', async () => {
    const yr = $('e-year').value, si = $('e-site').value, ty = $('e-type').value, f = GHG[ty];
    if (!si || !ty) { showToast('거점과 에너지원을 선택하세요', 'err'); return; }
    if (isClosed(yr)) { showToast(lockMsg(yr), 'err'); return; }
    const existing = {};
    energyRecs.filter(r => r.date?.startsWith(yr) && r.site === si && r.type === ty)
      .forEach(r => { const m = r.date?.split('-')[1]; if (m) existing[m] = r; });
    const rows = [], dels = [], bad = [], badEls = [], naAdd = [], naDel = [];
    let same = 0;
    $('energy-tbody').querySelectorAll('tr[data-month]').forEach(tr => {
      const m    = tr.dataset.month, key = naKey(si, ty, `${yr}-${m}`);
      const raw  = tr.querySelector('[data-field="amount"]').value.trim();
      const note = tr.querySelector('[data-field="note"]').value.trim();
      const ex   = existing[m];
      if (raw === '') { if (ex) dels.push(m); naDel.push(key); return; }          // 빈칸 = 누락
      if (isDash(raw)) { if (ex) dels.push(m); naAdd.push(key); return; }         // '-' = 해당없음
      naDel.push(key);
      const a = numIn(raw);
      if (isNaN(a)) { bad.push(m); badEls.push(tr.querySelector('[data-field="amount"]')); return; }
      // 바뀐 달만 저장 (변경 이력에 '수정 없음'이 쌓이지 않게). 배출계수·Scope가 바뀐 옛 값은 다시 저장
      if (ex && +ex.amount === a && (ex.note || '') === note && ex.scope === f.scope && ex.unit === f.unit
          && near(+ex.ghgStored || 0, calcGHG(ty, a))) { same++; return; }
      rows.push({ month: m, amount: a, note });
    });
    if (bad.length) { fieldErr($('e-save'), badEls, `${bad.map(m => +m + '월').join(', ')}: 0 이상의 숫자로 입력하세요 (자료가 없으면 -)`); return; }
    const na = naDiff(naAdd, naDel);
    if (na.add.length && !v2) { showToast(NA_V2_MSG, 'err'); return; }
    if (!rows.length && !dels.length && !na.add.length && !na.del.length) { showToast(same ? '바뀐 값이 없습니다' : '입력된 값이 없습니다', 'err'); return; }
    if (dels.length && !(await confirmBox(`${dels.map(m => +m + '월').join(', ')}은 칸이 비었거나 '-'라서 저장된 값을 삭제합니다.`, '삭제하고 저장'))) return;
    setBusy($('e-save'), true);
    try {
      for (const row of rows) {
        const data = {
          date: `${yr}-${row.month}`, site: si, type: ty,
          unit: f.unit, scope: f.scope, amount: row.amount,
          ghg: calcGHG(ty, row.amount), note: row.note
        };
        if (existing[row.month]) await sb('PATCH', 'energy', `?id=eq.${existing[row.month].id}`, data);
        else                      await sb('POST',  'energy', '', data);
      }
      for (const m of dels) await sb('DELETE', 'energy', `?id=eq.${existing[m].id}`);
      await saveNa(na);
      await refresh(); renderEnergyTable(); // 저장한 표만 DB 값으로 다시 그림 (다른 표의 저장 전 입력은 그대로)
      showToast(`✅ ${rows.length}개월 저장${dels.length ? ` · ${dels.length}개월 삭제` : ''}${na.add.length ? ` · 해당없음 ${na.add.length}개월` : ''} 완료`);
    } catch(e) { saveFailed(e, '저장', renderEnergyTable); }
    setBusy($('e-save'), false); $('e-save').disabled = isClosed($('e-year').value);
  });

  /* ── 폐기물 저장 (규격별 수량 · 0 저장 가능, 칸을 비우면 그 규격 삭제) ── */
  $('w-save').addEventListener('click', async () => {
    const yr = $('w-year').value, si = $('w-site').value;
    if (!si) { showToast('거점을 선택하세요', 'err'); return; }
    if (isClosed(yr)) { showToast(lockMsg(yr), 'err'); return; }
    setBusy($('w-save'), true);
    try {
      const res = await saveWasteGrid($('waste-mtbl'), yr, si);
      if (res) {
        await refresh(); renderWasteTable(); // 저장한 표만 DB 값으로 다시 그림
        showToast(`✅ ${res.n}칸 저장${res.d ? ` · ${res.d}칸 삭제` : ''} 완료`);
      }
    } catch(e) { saveFailed(e, '저장', renderWasteTable); }
    setBusy($('w-save'), false); $('w-save').disabled = isClosed($('w-year').value);
  });

  /* ── 기타 지표 입력: 용수(월별) · 친환경차(연도별) ────────── */
  const metricOf = (period, site, item) => metricRecs.find(r => r.period === period && r.site === site && r.item === item);
  const mRow = (period, site, item, value, note) => ({ period, site, item, value, unit: METRICS[item].unit, note });

  function renderWaterTable() {
    waterDirty = false;
    const yr = $('x-year').value, si = $('x-site').value, tb = $('water-tbody');
    if (!si) {
      $('x-save').disabled = false;
      $('x-save-info').textContent = '거점을 선택하세요';
      tb.innerHTML = `<tr><td colspan="4" class="table-empty" style="padding:20px">거점을 선택하면 월별 입력표가 표시됩니다</td></tr>`;
      $('water-tfoot').innerHTML = '';
      return;
    }
    const ex = m => metricOf(`${yr}-${m}`, si, WATER);
    tb.innerHTML = m12(i => {
      const m = pad(i + 1), r = ex(m), na = !r && isNaCell(si, WATER, `${yr}-${m}`);
      return `<tr data-month="${m}">
        <td class="m-label">${i + 1}월</td>
        <td><input class="m-in${r || na ? ' has-data' : ''}" type="text" inputmode="decimal" placeholder="미입력" value="${r ? r.value : na ? '-' : ''}" data-m="${m}" data-field="value" style="width:130px" aria-label="${i + 1}월 용수 사용량 (자료가 없으면 -)"></td>
        <td><input class="m-note-in" type="text" placeholder="비고" value="${esc(r?.note)}" data-m="${m}" data-field="note" aria-label="${i + 1}월 비고"></td>
        <td style="text-align:center">${r ? savedBadge('env_metrics', [r]) : na ? '<span class="existing-badge">해당없음</span>' : ''}</td>
      </tr>`;
    }).join('');
    tb.querySelectorAll('input[data-field="value"]').forEach(inp => inp.addEventListener('input', () => {
      inp.classList.toggle('has-data', inp.value !== ''); updateWaterTotal();
    }));
    updateWaterTotal();
    const n = m12(i => ex(pad(i + 1))).filter(Boolean).length;
    applyLock(tb, 'x-save', 'x-save-info', yr, n ? `기저장: ${n}개월 · 값을 바꾸면 덮어쓰고, 칸을 비우면 삭제됩니다`
                                                 : `${yr}년 ${si} 용수 — 값을 입력하고 저장하세요 (빈칸 = 누락 · 자료가 없는 달은 '-' = 해당없음)`);
  }
  function updateWaterTotal() {
    let t = 0, any = false;
    document.querySelectorAll('#water-tbody input[data-field="value"]').forEach(inp => {
      const v = numIn(inp.value);
      if (!isNaN(v)) { t += v; any = true; }
    });
    $('water-tfoot').innerHTML = !any ? '' : `<tr class="total-row"><td class="m-label">합계</td>
      <td style="font-family:var(--fdata);font-size:13px;padding:8px">${fq(t)} ㎥</td><td colspan="2"></td></tr>`;
  }

  // 친환경차 입력표에 보일 거점 — '업무용 차량'이 해당인 거점만 (데이터 관리 → 거점별 적용 항목)
  const evSites = () => siteOf(EV_ALL);
  function renderEvTable() {
    evDirty = false;
    const yr = $('v-year').value, tb = $('ev-tbody');
    const EV_SITES = evSites();
    tb.innerHTML = EV_SITES.map(s => {
      const a = metricOf(yr, s, EV_ALL), g = metricOf(yr, s, EV_GREEN), note = g ? (g.note || '') : (a?.note || '');
      return `<tr data-site="${s}">
        <td class="m-label" style="width:auto">${s}</td>
        <td><input class="m-in${a ? ' has-data' : ''}" type="number" min="0" step="1" placeholder="미입력" value="${a ? a.value : ''}" data-field="all" style="width:90px" aria-label="${s} 업무용 차량 대수"></td>
        <td><input class="m-in${g ? ' has-data' : ''}" type="number" min="0" step="1" placeholder="미입력" value="${g ? g.value : ''}" data-field="green" style="width:90px" aria-label="${s} 친환경차 대수"></td>
        <td class="m-ghg ev-rate"></td>
        <td><input class="m-note-in" type="text" placeholder="비고 (차종 등)" value="${esc(note)}" data-field="note" aria-label="${s} 비고"></td>
        <td style="text-align:center">${a || g ? savedBadge('env_metrics', [a, g]) : ''}</td>
      </tr>`;
    }).join('');
    tb.querySelectorAll('input[type="number"]').forEach(inp => inp.addEventListener('input', () => {
      inp.classList.toggle('has-data', inp.value !== ''); updateEvRates();
    }));
    updateEvRates();
    const n = EV_SITES.filter(s => metricOf(yr, s, EV_ALL) || metricOf(yr, s, EV_GREEN)).length;
    applyLock(tb, 'v-save', 'v-save-info', yr, n ? `기저장 · 값을 바꾸면 덮어쓰고, 두 칸을 모두 비우면 삭제됩니다`
                                                 : `${yr}년 말 기준 보유 대수를 입력하세요 (올해는 지금 기준)`);
  }
  function updateEvRates() {
    let A = 0, G = 0, any = false;
    document.querySelectorAll('#ev-tbody tr[data-site]').forEach(tr => {
      const aRaw = tr.querySelector('[data-field="all"]').value, gRaw = tr.querySelector('[data-field="green"]').value;
      const a = parseFloat(aRaw), g = parseFloat(gRaw), ok = aRaw !== '' && gRaw !== '' && !isNaN(a) && !isNaN(g);
      const cell = tr.querySelector('.ev-rate');
      cell.textContent = ok && a > 0 ? `${fmt(g / a * 100, 1)}%` : ok ? '—' : '';
      cell.classList.toggle('bad', ok && g > a);
      if (ok) { A += a; G += g; any = true; }
    });
    $('ev-tfoot').innerHTML = !any || evSites().length < 2 ? '' : `<tr class="total-row"><td class="m-label">합계</td>
      <td class="num" style="padding:8px">${fmt(A, 0)}대</td><td class="num" style="padding:8px">${fmt(G, 0)}대</td>
      <td class="m-ghg">${A > 0 ? fmt(G / A * 100, 1) + '%' : '—'}</td><td colspan="2"></td></tr>`;
  }

  /* ── PUE · 클라우드 전환률 입력표: 연도를 고르고 두 값을 넣으면 비율이 바로 계산됨 (기관 전체 = 대구본원) ── */
  const PUE_SITES = ['대구본원', '서울사무소'];   // PUE: 전산실이 있는 거점
  const PAIR = {
    pu: { sites: PUE_SITES, a: PUE_TOTAL, b: PUE_IT, unit: 'kWh', int: false, name: 'PUE', ratio: (a, b) => b > 0 ? fmt(a / b, 2) : '—',
          check: (a, b) => b > 0 && a >= b ? null : '총 전력은 IT 장비 전력 이상, IT 장비 전력은 0보다 커야 해요',
          ph: ['예: 2,400,000', '예: 1,600,000'] },
    cl: { sites: [ORG_SITE], a: CL_ALL, b: CL_DONE, unit: '개', int: true, name: '클라우드 전환률', ratio: (a, b) => a > 0 ? `${fmt(b / a * 100, 1)}%` : '—',
          check: (a, b) => b <= a ? null : '전환 시스템 수는 운영 정보시스템 수 이하로 입력하세요', ph: ['예: 120', '예: 42'] },
  };
  const pairDirty = { pu: false, cl: false };
  function renderPairTable(k) {
    pairDirty[k] = false;
    const c = PAIR[k], yr = $(`${k}-year`).value, tb = $(`${k}-tbody`), multi = c.sites.length > 1;
    let n = 0;
    tb.innerHTML = c.sites.map(s => {
      const ra = metricOf(yr, s, c.a), rb = metricOf(yr, s, c.b), note = rb?.note || ra?.note || '';
      if (ra || rb) n++;
      return `<tr data-site="${s}">${multi ? `<td class="m-label" style="width:auto;white-space:nowrap">${s}</td>` : ''}
      <td><input class="m-in${ra ? ' has-data' : ''}" type="text" inputmode="decimal" placeholder="${c.ph[0]}" value="${ra ? ra.value : ''}" data-field="a" style="width:100%;max-width:200px" aria-label="${yr}년 ${s} ${c.a}"></td>
      <td><input class="m-in${rb ? ' has-data' : ''}" type="text" inputmode="decimal" placeholder="${c.ph[1]}" value="${rb ? rb.value : ''}" data-field="b" style="width:100%;max-width:200px" aria-label="${yr}년 ${s} ${c.b}"></td>
      <td class="m-ghg pair-r" style="text-align:right;font-weight:600"></td>
      <td><input class="m-note-in" type="text" placeholder="비고" value="${esc(note)}" data-field="note" aria-label="${yr}년 ${s} ${c.name} 비고"></td>
      <td style="text-align:center">${ra || rb ? savedBadge('env_metrics', [ra, rb]) : ''}</td></tr>`; }).join('');
    tb.querySelectorAll('input').forEach(i => i.addEventListener('input', () => { pairDirty[k] = true; i.classList.toggle('has-data', i.value !== ''); updatePair(k); }));
    updatePair(k);
    applyLock(tb, `${k}-save`, `${k}-save-info`, yr, n ? `${yr}년 기저장 · 값을 바꾸면 덮어쓰고, 두 칸을 모두 비우면 삭제됩니다`
                                                  : `${yr}년 값을 입력하세요 · 다른 해는 위에서 연도를 바꿔 입력`);
  }
  function updatePair(k) {
    const c = PAIR[k];
    $(`${k}-tbody`).querySelectorAll('tr[data-site]').forEach(tr => {
      const a = numIn(tr.querySelector('[data-field="a"]').value), b = numIn(tr.querySelector('[data-field="b"]').value);
      const cell = tr.querySelector('.pair-r'), ok = !isNaN(a) && !isNaN(b);
      cell.textContent = ok ? c.ratio(a, b) : '';
      cell.classList.toggle('bad', ok && !!c.check(a, b));
    });
  }
  Object.keys(PAIR).forEach(k => $(`${k}-save`).addEventListener('click', async () => {
    const c = PAIR[k], yr = $(`${k}-year`).value, tb = $(`${k}-tbody`);
    if (isClosed(yr)) { showToast(lockMsg(yr), 'err'); return; }
    const ups = [], dels = [], delSites = [], bad = [], badEls = [];
    const pairEls = tr => [tr.querySelector('[data-field="a"]'), tr.querySelector('[data-field="b"]')];
    tb.querySelectorAll('tr[data-site]').forEach(tr => {
      const s = tr.dataset.site, q = f => tr.querySelector(`[data-field="${f}"]`).value.trim();
      const aRaw = q('a'), bRaw = q('b'), note = q('note'), exA = metricOf(yr, s, c.a), exB = metricOf(yr, s, c.b);
      if (aRaw === '' && bRaw === '') { if (exA || exB) { dels.push(...[exA, exB].filter(Boolean)); delSites.push(s); } return; }
      const a = numIn(aRaw), b = numIn(bRaw);
      if (aRaw === '' || bRaw === '' || isNaN(a) || isNaN(b) || (c.int && (!Number.isInteger(a) || !Number.isInteger(b)))) { bad.push(`${s}: 두 칸 모두 0 이상의 ${c.int ? '정수' : '숫자'}로`); badEls.push(...pairEls(tr)); return; }
      const why = c.check(a, b); if (why) { bad.push(`${s}: ${why}`); badEls.push(...pairEls(tr)); return; }
      ups.push(mRow(yr, s, c.a, a, exA ? (exA.note || '') : ''), mRow(yr, s, c.b, b, note));
    });
    if (bad.length) { fieldErr($(`${k}-save`), badEls, bad.join(' · ')); return; }
    if (!ups.length && !dels.length) { showToast('입력된 값이 없습니다', 'err'); return; }
    await saveMetrics(ups, dels, `${k}-save`, yr, `${yr}년 ${delSites.join(', ')} ${c.name}`, () => renderPairTable(k));
  }));

  // 기타 지표 저장 공통: 바뀐 값만 한 번에 upsert(같은 기간·거점·항목이면 덮어쓰기) + 비운 칸 삭제
  async function saveMetrics(ups, dels, btnId, yr, delLabel, rerender, na = { add: [], del: [] }) {
    const changed = ups.filter(u => { const ex = metricOf(u.period, u.site, u.item); return !ex || ex.value !== u.value || (ex.note || '') !== u.note; });
    if (na.add.length && !v2) { showToast(NA_V2_MSG, 'err'); return; }
    if (!changed.length && !dels.length && !na.add.length && !na.del.length) { showToast(ups.length ? '바뀐 값이 없습니다' : '입력된 값이 없습니다', 'err'); return; }
    if (dels.length && !(await confirmBox(`${delLabel}은 칸이 비었거나 '-'라서 저장된 값을 삭제합니다.`, '삭제하고 저장'))) return;
    setBusy($(btnId), true);
    try {
      if (changed.length) await sb('POST', 'env_metrics', '?on_conflict=period,site,item', changed, 'resolution=merge-duplicates,return=minimal');
      if (dels.length) await sb('DELETE', 'env_metrics', `?id=in.(${dels.map(r => r.id).join(',')})`);
      await saveNa(na);
      await refresh(); rerender(); // 저장한 표만 다시 그림 (옆 표의 저장 전 입력은 그대로)
      showToast(`✅ ${changed.length}건 저장${dels.length ? ` · ${dels.length}건 삭제` : ''}${na.add.length ? ` · 해당없음 ${na.add.length}건` : ''} 완료`);
    } catch (e) { saveFailed(e, '저장', rerender); }
    setBusy($(btnId), false); $(btnId).disabled = isClosed(yr);
  }

  $('x-save').addEventListener('click', async () => {
    const yr = $('x-year').value, si = $('x-site').value;
    if (!si) { showToast('거점을 선택하세요', 'err'); return; }
    if (isClosed(yr)) { showToast(lockMsg(yr), 'err'); return; }
    const ups = [], dels = [], delMonths = [], bad = [], badEls = [], naAdd = [], naDel = [];
    $('water-tbody').querySelectorAll('tr[data-month]').forEach(tr => {
      const m = tr.dataset.month, period = `${yr}-${m}`, inp = tr.querySelector('[data-field="value"]'), key = naKey(si, WATER, period);
      const raw = inp.value.trim(), note = tr.querySelector('[data-field="note"]').value.trim();
      const ex = metricOf(period, si, WATER);
      if (raw === '' || isDash(raw)) {   // 빈칸 = 누락 · '-' = 해당없음
        if (ex) { dels.push(ex); delMonths.push(+m + '월'); }
        (raw === '' ? naDel : naAdd).push(key); return;
      }
      naDel.push(key);
      const v = numIn(raw);
      if (isNaN(v)) { bad.push(+m + '월'); badEls.push(inp); return; }
      ups.push(mRow(period, si, WATER, v, note));
    });
    if (bad.length) { fieldErr($('x-save'), badEls, `${bad.join(', ')}: 0 이상의 숫자로 입력하세요 (자료가 없으면 -)`); return; }
    await saveMetrics(ups, dels, 'x-save', yr, delMonths.join(', '), renderWaterTable, naDiff(naAdd, naDel));
  });

  $('v-save').addEventListener('click', async () => {
    const yr = $('v-year').value;
    if (isClosed(yr)) { showToast(lockMsg(yr), 'err'); return; }
    const ups = [], dels = [], delSites = [], bad = [], badEls = [];
    $('ev-tbody').querySelectorAll('tr[data-site]').forEach(tr => {
      const s = tr.dataset.site, note = tr.querySelector('[data-field="note"]').value.trim();
      const aRaw = tr.querySelector('[data-field="all"]').value.trim(), gRaw = tr.querySelector('[data-field="green"]').value.trim();
      const exA = metricOf(yr, s, EV_ALL), exG = metricOf(yr, s, EV_GREEN);
      if (aRaw === '' && gRaw === '') {
        if (exA || exG) { dels.push(...[exA, exG].filter(Boolean)); delSites.push(s); }
        return;
      }
      const a = Number(aRaw), g = Number(gRaw);
      if (aRaw === '' || gRaw === '' || !Number.isInteger(a) || !Number.isInteger(g) || a < 0 || g < 0 || g > a) { bad.push(s); badEls.push(tr.querySelector('[data-field="all"]'), tr.querySelector('[data-field="green"]')); return; }
      ups.push(mRow(yr, s, EV_ALL, a, exA ? (exA.note || '') : ''), mRow(yr, s, EV_GREEN, g, note));
    });
    if (bad.length) { fieldErr($('v-save'), badEls, `${bad.join(', ')}: 두 칸 모두 0 이상의 정수로, 친환경차는 업무용 차량 수 이하로 입력하세요`); return; }
    await saveMetrics(ups, dels, 'v-save', yr, delSites.join(', '), renderEvTable);
  });

  /* ── 일괄 입력: 붙여넣기·파일 → 해석 → 미리보기 → 저장 ───────────────────
     알아보는 표  ① 제목 줄 + 월 머리글(가로) + 값 줄      ② 줄 앞 칸에 연도·거점·항목 + 월별 값
                  ③ 기간·거점·항목·사용량 열 (대시보드에서 내보낸 CSV 포함)
                  ④ 월이 세로(행)이고 열 머리글이 거점·항목·연도
     연도·거점·항목은 같은 줄 → 열 머리글 → 위쪽 제목 줄 → 시트 이름 → 파일 이름 → 기본값 순서로 찾음 */
  const BULK_SITE = [['대구본원', ['대구본원', '대구', '본원']], ['서울사무소', ['서울사무소', '서울']],
                     ['제주글로벌센터', ['제주글로벌센터', '글로벌센터', '제주청사', '제주']]];
  // 더 구체적인 이름을 먼저 확인 · '가스/디젤 오일'은 경유라 도시가스('가스')보다 먼저 · '열(스팀)'은 지역난방 · '='는 칸 전체가 그 낱말일 때만
  const BULK_ITEM = [
    [RE_BUY, ['재생에너지구매', '녹색프리미엄', 'rec', 'ppa']], [SAVE_REGEN, ['회생제동', '승강기']],
    [RE_SELF, ['태양광', '재생에너지', '자가발전', '신재생']], ['경유', ['경유', '디젤', 'diesel']],
    ['휘발유', ['휘발유', '가솔린', 'gasoline']], ['도시가스', ['도시가스', 'lng', '천연가스', '가스']],
    ['지역난방', ['지역난방', '난방', '스팀', '증기', '열(', '=열']], ['전력', ['전력', '전기']],
    [WATER, ['용수', '상수도', '수도']], ['폐기물', ['폐기물', '종량제']]];
  const BULK_ITEM_ORDER = [...Object.keys(GHG), WATER];
  const squash = t => String(t ?? '').replace(/\s+/g, '').toLowerCase();
  // '온실가스'의 가스·'냉난방'의 난방·'수도권'의 수도는 항목이 아님 · 영문 약어(REC 등)는 낱말로만
  function findIn(t, table) {
    const q = squash(t).replace(/온실가스|냉난방|수도권/g, ''); if (!q) return null;
    for (const [name, keys] of table)
      if (keys.some(k => k[0] === '=' ? q === k.slice(1) : /^[a-z]+$/.test(k) ? new RegExp(`(^|[^a-z])${k}([^a-z]|$)`).test(q) : q.includes(k))) return name;
    return null;
  }
  const findYear = t => { const v = String(t ?? ''); let m = v.match(/(?:^|\D)(20\d{2})(?!\d)/); if (m) return +m[1];
    m = v.match(/(?:^|\D)(\d{2})\s*년/); return m ? 2000 + +m[1] : null; };
  const UNIT_TAIL = /(kwh|mwh|nm3|nm³|gj|㎥|m3|m³|ℓ)$/i, THOUSANDS = /^-?\d{1,3}(,\d{3})+(\.\d+)?$/, NUM_LIKE = /^-?\d{1,3}(,[^,\s]{3})+(\.\S*)?$/;
  // 값 칸 → 숫자 · null(빈 칸, '-') · NaN(숫자가 아님). 천 단위 쉼표와 단위(kWh 등)는 허용
  function numOf(c) {
    let t = String(c ?? '').replace(/\s/g, '').replace(UNIT_TAIL, '');
    if (t === '' || /^[-–—]$/.test(t)) return null;
    if (t.includes(',')) { if (!THOUSANDS.test(t)) return NaN; t = t.replace(/,/g, ''); }
    return /^-?\d+(\.\d+)?$/.test(t) ? +t : NaN;
  }
  const YEAR_TOK = /^(?:20\d{2}년?|\d{2}년)$/;
  // 숫자를 잘못 친 칸(예: 8,4S6) — 글자 칸(1호기, (kWh))과 구분
  const typoNum = c => !YEAR_TOK.test(c) && /\d/.test(c) && c.replace(/[^\d.,]/g, '').length * 2 >= c.length;
  // 연도가 1씩 늘어나는 줄(예: 월 | 2024 | 2025 | 2026)은 값이 아니라 머리글
  const yearRow = cells => { const ns = cells.map(numOf).filter(Number.isFinite);
    return ns.length >= 2 && ns.every((n, i) => Number.isInteger(n) && n >= 2000 && n <= 2100 && (!i || n === ns[i - 1] + 1)); };
  const EN_M = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
  const EN_FULL = ['january', 'february', 'march', 'april', 'may', 'june', 'july', 'august', 'september', 'october', 'november', 'december'];
  // 월 칸 → { m } 또는 { y, m }  ('1월', '2024-01', '2024.1', '2024년 1월', '24년 1월', '25.1월', 'Jan', 'Jan-24', '2024-01-01')
  function monthCell(c) {
    const t = squash(c).replace(/^['`‘’]/, '').replace(/\(.*\)$/, ''); let m;
    const ok = (y, mm) => mm >= 1 && mm <= 12 ? (y ? { y, m: mm } : { m: mm }) : null;
    if ((m = t.match(/^(\d{1,2})월$/))) return ok(0, +m[1]);
    if ((m = t.match(/^(20\d{2})(?:[-./]|년)(\d{1,2})(?:월(?:\d{1,2}일)?|[-./]\d{1,2}일?)?$/))) return ok(+m[1], +m[2]);
    if ((m = t.match(/^(\d{2})(?:년|\.)(\d{1,2})월$/))) return ok(2000 + +m[1], +m[2]);
    if ((m = t.match(/^([a-z]+)\.?(?:[-/'’]?(20\d{2}|\d{2}))?$/))) {
      const w = m[1], i = EN_M.includes(w) ? EN_M.indexOf(w) : EN_FULL.includes(w) ? EN_FULL.indexOf(w) : w === 'sept' ? 8 : -1;
      if (i >= 0) return ok(m[2] ? (m[2].length === 2 ? 2000 + +m[2] : +m[2]) : 0, i + 1);
    }
    return null;
  }
  // 기간 칸(③) → 월 칸 모양 + '202401'
  const periodOf = c => { const p = monthCell(c); if (p) return p; const m = squash(c).match(/^(20\d{2})(\d{2})$/); return m && +m[2] >= 1 && +m[2] <= 12 ? { y: +m[1], m: +m[2] } : null; };
  const LONG_HDR = { period: ['기간', '연월', '년월', '날짜', '일자', 'date', 'period', 'month', '월'],
                     site: ['거점', '청사', '사업장', '사업소', 'site'],
                     item: ['에너지원/항목', '에너지원', '연료', '연료명', '항목', '구분', '에너지', '종류', 'item', 'type', '유형'],
                     value: ['사용량', '발전량', '값', '수량', '실적', 'amount', 'value'] };
  function longHeader(cells) {
    const col = {};
    cells.forEach((c, i) => { const t = squash(c);
      Object.entries(LONG_HDR).forEach(([k, names]) => { const r = names.findIndex(n => t === n || t.startsWith(n + '('));
        if (r >= 0 && (col[k] == null || r < col[k].r)) col[k] = { i, r }; }); });
    return col.period && col.value && (col.site || col.item) ? Object.fromEntries(Object.entries(col).map(([k, o]) => [k, o.i])) : null;
  }
  // 이 이름의 열에 있는 거점·항목은 꼭 알아봐야 함 (모르는 이름을 기본값으로 바꿔 저장하지 않음)
  const NAME_COL = { site: ['거점', '청사', '사업장', '사업소', 'site'], item: ['연료', '연료명', '에너지원', '에너지원명', '에너지원/항목'] };
  const SKIP_COL = /^(합계|계|소계|총계|누계|연간|연간합계|평균|비고|단위|total|sum|avg|average)(\(.*\))?$|^(전년|증감|비율|%)/;

  // 표(행×칸) → 기록 [{ site, item, ym, v, at }] + 안내
  function parseBulkGrid(grid, defs) {
    const recs = new Map(), warn = [], skips = new Map(), ctx = { file: '', sheet: '' };
    let texts = [], fresh = false, head = null, long = null, cols = null;
    const skip = (msg, at) => { if (!skips.has(msg)) skips.set(msg, []); skips.get(msg).push(at); };
    // own: 같은 줄·열 머리글 → upper: 위쪽 글자 줄(가까운 것부터, 앞 표 제목 포함) → 시트 이름 → 파일 이름 → 기본값
    const lookup = (own, upper, y) => {
      const all = [...own, ...upper, ctx.sheet, ctx.file].filter(Boolean);
      const first = fn => { for (const t of all) { const v = fn(t); if (v) return v; } return null; };
      return { site: first(t => findIn(t, BULK_SITE)) || defs.site, item: first(t => findIn(t, BULK_ITEM)) || defs.item,
               year: y || first(findYear) || defs.year };
    };
    const add = (at, k, m, v) => {
      if (v == null) return;
      if (k.item === '폐기물') return skip('폐기물은 봉투 규격·수량이 필요해 폐기물 탭에서 입력해요', at);
      if (k.item === WATER && !v2) return skip('용수는 DB 설정(phase2.sql)을 마친 뒤 입력할 수 있어요', at);
      if (!k.site) return skip('거점을 알 수 없어 건너뛰었어요 — 위 기본값에서 거점을 고르세요', at);
      if (!k.item) return skip('항목을 알 수 없어 건너뛰었어요 — 위 기본값에서 항목을 고르세요', at);
      if (!k.year) return skip('연도를 알 수 없어 건너뛰었어요 — 위 기본값에서 연도를 고르세요', at);
      if (itemNA(k.site, k.item)) return skip(`${k.site}${josa(k.site, '은', '는')} ${k.item}${josa(k.item, '을', '를')} 쓰지 않는 거점이라 건너뛰었어요`, at);
      const ym = `${k.year}-${pad(m)}`, where = `${at} · ${k.site} ${k.item} ${k.year}년 ${m}월`;
      if (Number.isNaN(v)) return warn.push(`${where}: 숫자가 아니라 건너뛰었어요`);
      if (v < 0) return warn.push(`${where}: 0 이상이어야 해서 건너뛰었어요`);
      const key = `${k.site}|${k.item}|${ym}`, prev = recs.get(key);
      if (prev && !near(prev.v, v)) warn.push(`${where}: ${prev.at}에도 있어 뒤의 값(${fmt(v, 2)})을 써요`);
      recs.set(key, { site: k.site, item: k.item, ym, v, at });
    };
    grid.forEach((row, r) => {
      row = row || [];
      if (row.ctx) {   // 파일·시트 이름 줄 (파일에서 읽을 때만)
        ctx[row.ctx] = String(row[0] ?? ''); if (row.ctx === 'file') ctx.sheet = '';
        texts = []; fresh = false; head = long = cols = null; return;
      }
      const cells = row.map(c => String(c ?? '').trim()), at = row.src || `${r + 1}번째 줄`;
      if (!cells.some(c => c && !/^[-=:|_~.·]+$/.test(c))) return;              // 빈 줄·구분선(---)
      const lh = longHeader(cells);
      if (lh) { long = lh; head = cols = null; fresh = false; return; }
      const months = cells.map((c, i) => ({ i, mc: monthCell(c) })).filter(o => o.mc);
      if (months.length >= 2) {                                                 // ①② 가로 월 머리글
        const start = months[0].i, leadHdr = cells.slice(0, start).map(squash);
        head = { cols: months.map(o => ({ i: o.i, ...o.mc })), start, n: cells.length, lead: cells.slice(0, start).filter(Boolean).join(' '), carry: [],
                 siteCol: leadHdr.findIndex(c => NAME_COL.site.includes(c)), itemCol: leadHdr.findIndex(c => NAME_COL.item.includes(c)) };
        long = cols = null; fresh = false; return;
      }
      const upper = texts.map(t => t.filter(Boolean).join(' ')).reverse();
      const pr = long ? periodOf(cells[long.period]) : null;
      if (pr) {                                                                  // ③ 한 줄 = 한 달 (기간 칸이 없는 줄은 제목 등으로 봄)
        const v = numOf(cells[long.value]);
        if (v == null) return;                                                   // 값이 빈 줄
        const itemTxt = long.item != null ? cells[long.item] : '', siteTxt = long.site != null ? cells[long.site] : '';
        if (itemTxt && !findIn(itemTxt, BULK_ITEM)) return skip(`알 수 없는 항목이라 건너뛰었어요: ${itemTxt}`, at);
        if (siteTxt && !findIn(siteTxt, BULK_SITE)) return skip(`알 수 없는 거점이라 건너뛰었어요: ${siteTxt}`, at);
        const own = [long.site, long.item].filter(i => i != null).map(i => cells[i]).concat(
          cells.filter((c, i) => c && ![long.period, long.value, long.site, long.item].includes(i) && Number.isNaN(numOf(c))));
        add(at, lookup(own, upper, pr.y), pr.m, v); fresh = false; return;
      }
      const f = cells.findIndex(Boolean), solo = cells.filter(Boolean);
      const lm = monthCell(cells[f]);
      if (head && !lm && !(solo.length === 1 && YEAR_TOK.test(solo[0]))) {      // ①② 값 줄 (첫 칸이 월이면 ④)
        let off = 0;
        if (row.loose) {   // 공백으로 나눈 줄: 앞 글자 칸 수가 머리글과 달라도 뒤쪽 숫자 묶음에 맞춤
          let s = cells.length; while (s > 0 && !Number.isNaN(numOf(cells[s - 1]))) s--;
          if (!(s > head.start && cells.slice(head.start, s).some(typoNum))) {
            // 값 묶음 맨 앞의 연도(2024)는 값이 아니라 이름표: 머리글의 앞 칸 자리이거나, 머리글보다 값이 많거나, 옆 값들에만 천 단위 쉼표가 있을 때
            const yearLabel = i => YEAR_TOK.test(cells[i]) && (i < head.start || cells.length - i > head.n - head.start || cells.slice(i + 1).some(c => c.includes(',')));
            while (s < cells.length - 1 && yearLabel(s)) s++;
            off = s - head.start;
          }
        }
        const vals = head.cols.map(c => ({ ...c, v: numOf(cells[c.i + off]) }));
        const nums = vals.filter(c => Number.isFinite(c.v)).length, bad = vals.filter(c => Number.isNaN(c.v)).length;
        if (nums && nums > bad && !yearRow(cells)) {
          let lead = cells.slice(0, head.start + off);
          if (!row.loose) lead = lead.map((c, i) => c || head.carry[i] || '');    // 병합 셀처럼 비운 앞 칸은 위 줄 값
          if (!row.loose) lead.forEach((c, i) => { head.carry[i] = c; });
          const unknown = (col, table) => !off && col >= 0 && lead[col] && !findIn(lead[col], table) ? lead[col] : null;
          const badItem = unknown(head.itemCol, BULK_ITEM), badSite = unknown(head.siteCol, BULK_SITE);
          if (badItem || badSite) {
            vals.forEach(c => { if (c.v != null) skip(badItem ? `알 수 없는 항목이라 건너뛰었어요: ${badItem}` : `알 수 없는 거점이라 건너뛰었어요: ${badSite}`, at); });
            fresh = false; return;
          }
          const k = lookup(lead.filter(Boolean), [head.lead, ...upper], null);
          vals.forEach(c => add(at, c.y ? { ...k, year: c.y } : k, c.m, c.v));
          fresh = false; return;
        }
      }
      // ④ 월이 세로: 첫 칸이 월이고 옆 칸들이 값 (열 머리글 = 바로 위 글자 줄)
      const hdr = cols || (fresh ? texts[texts.length - 1] : null);
      let mc = lm;
      if (!mc && hdr && /^(월|month)$/.test(squash(hdr[f])) && /^\d{1,2}$/.test(cells[f])) mc = monthCell(`${cells[f]}월`);
      if (mc) {
        const vi = cells.map((c, i) => i).filter(i => i !== f && cells[i] && (!Number.isNaN(numOf(cells[i])) || typoNum(cells[i])));
        if (vi.some(i => Number.isFinite(numOf(cells[i])))) {
          if (!cols) cols = hdr || [];
          // 값 칸 위가 모두 글자면 열 머리글, 아니면 그 줄도 제목으로 봄
          const isHdr = vi.every(i => cols[i]) && !(row.loose && cols.loose && cols.length !== cells.length);
          const up = isHdr ? [cols.slice(0, f + 1).filter(Boolean).join(' '), ...upper.slice(1)] : upper;
          const own = cells.filter((c, i) => c && i !== f && !vi.includes(i));
          vi.forEach(i => {
            if (isHdr && SKIP_COL.test(squash(cols[i]))) return;                 // 합계·평균·비고 열
            add(at, lookup(isHdr ? [cols[i], ...own] : own, up, mc.y || null), mc.m, numOf(cells[i]));
          });
          fresh = false; return;
        }
      }
      // 그 밖의 글자 줄 = 표 제목. 앞 표의 제목도 남겨 두고 가까운 줄부터 찾음 (연도만 바뀐 제목 등)
      if (head && !row.loose) cells.slice(0, head.start).forEach((c, i) => { if (c) head.carry[i] = c; });   // ② 값이 빈 줄의 앞 칸
      texts.push(Object.assign(cells, { loose: row.loose })); fresh = true; cols = null;
    });
    const msgs = [...skips].map(([msg, ats]) => { const u = [...new Set(ats)];
      return `${msg} (${ats.length}칸 · ${u.slice(0, 4).join(', ')}${u.length > 4 ? ' 등' : ''})`; });
    return { recs: [...recs.values()], warn: [...msgs, ...warn] };
  }

  // 저장된 값과 비교 → 칸마다 상태: new 새로 · chg 바뀜 · same 같음 · lock 마감 연도 · future 아직 안 온 달
  function planBulk(recs, warn) {
    const now = new Date(), curYM = `${now.getFullYear()}-${pad(now.getMonth() + 1)}`;
    const eMap = new Map(energyRecs.map(r => [`${r.site}|${r.type}|${r.date}`, r]));
    const cells = recs.map(r => {
      const ex = r.item === WATER ? metricOf(r.ym, r.site, WATER) : eMap.get(`${r.site}|${r.item}|${r.ym}`);
      const old = ex ? +(r.item === WATER ? ex.value : ex.amount) : null;
      const status = r.ym > curYM ? 'future' : isClosed(r.ym) ? 'lock' : !ex ? 'new' : near(old, r.v) ? 'same' : 'chg';
      return { ...r, ex, old, status };
    });
    return { cells, warn };
  }

  const BULK_IDLE = '붙여넣거나 파일을 놓으면 바로 미리보기가 나와요';
  let bulkGrid = null, bulkName = '', bulkPlan = null;
  function runBulk() {
    if (!bulkGrid) { bulkPlan = null; renderBulkPreview(); $('bulk-info').textContent = BULK_IDLE; return; }
    const defs = { year: +$('bulk-year').value || null, site: $('bulk-site').value || null, item: $('bulk-item').value || null };
    const { recs, warn } = parseBulkGrid(bulkGrid, defs);
    bulkPlan = planBulk(recs, warn);
    renderBulkPreview();
    $('bulk-info').textContent = recs.length ? `${bulkName ? `${bulkName} · ` : ''}${recs.length}개월을 찾았어요 · 아래에서 확인한 뒤 저장하세요`
      : '값을 찾지 못했어요 · 아래 안내와 \'알아보는 표 모양\'을 확인하거나 기본 연도·거점·항목을 골라 보세요';
  }
  function renderBulkPreview() {
    const p = bulkPlan;
    $('bulk-preview').hidden = !p || (!p.cells.length && !p.warn.length);
    if (!p) return;
    const ow = $('bulk-overwrite').checked, cnt = { new: 0, chg: 0, same: 0, lock: 0, future: 0 };
    p.cells.forEach(c => cnt[c.status]++);
    const n = cnt.new + (ow ? cnt.chg : 0);
    const chip = (cls, label, k) => cnt[k] ? `<span class="bk-chip ${cls}">${label} <b>${cnt[k]}</b></span>` : '';
    $('bulk-sum').innerHTML = chip('bk-new', '새로 추가', 'new') + chip('bk-chg', ow ? '덮어쓰기' : '값이 다름 (저장 안 함)', 'chg') + chip('bk-same', '이미 같음', 'same') +
      chip('bk-lock', icn('lock') + ' 마감 연도', 'lock') + chip('bk-future', '아직 안 온 달', 'future');
    const groups = new Map();
    p.cells.forEach(c => { const k = `${c.site}|${c.item}|${c.ym.slice(0, 4)}`; if (!groups.has(k)) groups.set(k, Array(12).fill(null)); groups.get(k)[+c.ym.slice(5) - 1] = c; });
    const ord = k => { const [s, it, y] = k.split('|'); return [SITES.indexOf(s), BULK_ITEM_ORDER.indexOf(it), +y]; };
    const keys = [...groups.keys()].sort((a, b) => { const A = ord(a), B = ord(b); return A[0] - B[0] || A[1] - B[1] || A[2] - B[2]; });
    const unit = it => it === WATER ? '㎥' : GHG[it]?.unit || '';
    const TIP = { new: '새로 추가', same: '이미 같은 값', lock: '마감된 연도라 저장 안 됨', future: '아직 오지 않은 달이라 저장 안 됨' };
    $('bulk-tbl').innerHTML = !keys.length ? '' :
      `<thead><tr><th>거점</th><th>항목</th><th>연도</th>${MONTHS.map(m => `<th class="n">${m}</th>`).join('')}<th class="n">합계</th></tr></thead><tbody>` +
      keys.map(k => { const [site, item, y] = k.split('|'), row = groups.get(k);
        return `<tr><td>${esc(site)}</td><td>${esc(item)} <span class="cmp-unit">${unit(item)}</span></td><td>${y}</td>` + row.map(c => !c ? '<td class="bk-none">·</td>'
          : `<td class="n bk-${c.status}" title="${esc(`${c.at} · ` + (c.status === 'chg' ? `저장된 값 ${fmt(c.old, 2)} → ${fmt(c.v, 2)}${ow ? '' : ' (덮어쓰기를 켜야 저장)'}` : TIP[c.status]))}">${fmt(c.v, Number.isInteger(c.v) ? 0 : 2)}</td>`).join('') +
          `<td class="n"><b>${fq(row.reduce((a, c) => a + (c ? c.v : 0), 0))}</b></td></tr>`; }).join('') + '</tbody>';
    $('bulk-warn').innerHTML = p.warn.slice(0, 30).map(w => `<li>${esc(w)}</li>`).join('') + (p.warn.length > 30 ? `<li>…외 ${p.warn.length - 30}건</li>` : '');
    $('bulk-save').disabled = n === 0;
    $('bulk-save').textContent = n ? `${n}개월 저장` : '저장할 새 값이 없어요';
  }

  // 붙여넣은 글자 → 표. 탭이 있으면 엑셀 복사본, 아니면 줄마다 쉼표(CSV)·세로줄(|) 표·공백으로 나눔
  function textToGrid(text) {
    const lines = text.replace(/^﻿/, '').replace(/\r\n?/g, '\n').split('\n');
    if (lines.some(l => l.includes('\t'))) return lines.map(l => l.split('\t'));
    let prevCsv = 0;
    return lines.map(l => {
      const t = l.trim();
      if (!t) return [];
      if (/^\|.*\|$/.test(t)) { prevCsv = 0; return t.slice(1, -1).split('|').map(c => c.trim()); }   // 마크다운 표
      // 쉼표 구분(CSV) 줄인지: 10,887 같은 천 단위 숫자(오타 포함)의 쉼표는 구분자가 아님
      const toks = t.split(/\s+/), fields = t.split(',').length;
      const csv = t.startsWith('"') || toks.some(k => k.includes(',') && !NUM_LIKE.test(k.replace(UNIT_TAIL, '')))
        || (prevCsv === fields && toks.length === 1);   // 바로 위가 같은 칸 수의 CSV 줄이면 100,200,300도 CSV
      prevCsv = csv ? fields : 0;
      if (csv) return parseCSV(t)[0] || [];
      return Object.assign(t.split(/\s+/), { loose: true });   // 공백으로 나눈 줄: 칸 위치 대신 값 순서로 맞춤
    });
  }
  function parseCSV(text) {
    const rows = []; let row = [], cell = '', q = false;
    for (let i = 0; i < text.length; i++) {
      const ch = text[i];
      if (q) { if (ch === '"') { if (text[i + 1] === '"') { cell += '"'; i++; } else q = false; } else cell += ch; }
      else if (ch === '"') q = true;
      else if (ch === ',') { row.push(cell); cell = ''; }
      else if (ch === '\n' || ch === '\r') { if (ch === '\r' && text[i + 1] === '\n') i++; row.push(cell); rows.push(row); row = []; cell = ''; }
      else cell += ch;
    }
    if (cell !== '' || row.length) { row.push(cell); rows.push(row); }
    return rows;
  }
  // 엑셀 파일을 읽는 도구(SheetJS)는 엑셀 파일을 놓을 때만 불러옴
  let xlsxLoading = null;
  const loadXlsx = () => window.XLSX ? Promise.resolve(window.XLSX) : (xlsxLoading ||= new Promise((ok, no) => {
    const sc = document.createElement('script');
    sc.src = 'https://cdn.sheetjs.com/xlsx-0.20.3/package/dist/xlsx.full.min.js';
    sc.onload = () => window.XLSX ? ok(window.XLSX) : sc.onerror();
    sc.onerror = () => { xlsxLoading = null; sc.remove(); no(new Error('엑셀 파일을 읽는 도구를 불러오지 못했어요. 엑셀에서 표를 복사해 붙여넣거나 CSV로 저장해 올려 주세요')); };
    document.head.appendChild(sc);
  }));
  const BULK_EXT = ['csv', 'tsv', 'txt', 'xlsx', 'xls'];
  async function fileToGrid(file) {
    const ext = (file.name.split('.').pop() || '').toLowerCase();
    const ctxRow = (name, kind) => Object.assign([name], { ctx: kind });
    const grid = [ctxRow(file.name.replace(/\.[^.]+$/, ''), 'file')];
    if (ext === 'xlsx' || ext === 'xls') {
      const X = await loadXlsx(), wb = X.read(await file.arrayBuffer(), { type: 'array', cellDates: true });
      wb.SheetNames.forEach(n => {
        const ws = wb.Sheets[n]; if (!ws || !ws['!ref']) return;
        const r0 = X.utils.decode_range(ws['!ref']).s.r, o = { header: 1, defval: '', blankrows: true };
        // 보이는 글자(1월·2024-01 등)를 쓰되, 숫자 칸은 표시 형식(쉼표·단위)과 관계없이 원래 값을 씀
        const shown = X.utils.sheet_to_json(ws, { ...o, raw: false, dateNF: 'yyyy-mm' }), raw = X.utils.sheet_to_json(ws, { ...o, raw: true });
        grid.push(ctxRow(n, 'sheet'));
        shown.forEach((row, i) => grid.push(Object.assign(row.map((s, j) => {
          const v = raw[i]?.[j]; return typeof v === 'number' && !monthCell(s) ? String(v) : String(s ?? '');
        }), { src: `'${n}' 시트 ${r0 + i + 1}행` })));
      });
      return grid;
    }
    const buf = await file.arrayBuffer();
    let text; // 한글 엑셀이 저장한 CSV는 대개 CP949(EUC-KR)
    try { text = new TextDecoder('utf-8', { fatal: true }).decode(buf); } catch { text = new TextDecoder('euc-kr').decode(buf); }
    text = text.replace(/^﻿/, '');
    const rows = ext === 'csv' && !text.includes('\t') ? parseCSV(text) : textToGrid(text);
    rows.forEach((row, i) => grid.push(Object.assign(row, { src: `${i + 1}행` })));
    return grid;
  }
  async function bulkFromFiles(list) {
    const files = [...(list || [])].filter(Boolean);
    if (!files.length || !canEdit()) return;
    document.querySelector('.tab-btn[data-tab="input"]').click();
    document.querySelector('.subtab-btn[data-sub="bulk"]').click();
    const bad = files.filter(f => !BULK_EXT.includes((f.name.split('.').pop() || '').toLowerCase()));
    if (bad.length) {
      const msg = `${bad.map(f => f.name).join(', ')}: CSV·엑셀(xlsx, xls)·텍스트 파일만 읽을 수 있어요 (한글·PDF 표는 복사해 붙여넣으세요)`;
      $('bulk-info').textContent = msg; showToast(msg, 'err'); return;
    }
    $('bulk-info').textContent = `${files.map(f => f.name).join(', ')} 읽는 중…`;
    try {
      const grid = [];
      for (const f of files) grid.push(...await fileToGrid(f));
      bulkGrid = grid; bulkName = files.length > 1 ? `파일 ${files.length}개` : files[0].name; $('bulk-text').value = ''; runBulk();
    } catch (e) { bulkGrid = null; bulkPlan = null; renderBulkPreview(); $('bulk-info').textContent = e.message; showToast(e.message, 'err'); }
  }
  function bulkFromText() {
    const t = $('bulk-text').value;
    bulkGrid = t.trim() ? textToGrid(t) : null; bulkName = '';
    runBulk();
  }
  function fillBulkSelects() {
    const curYr = new Date().getFullYear(), keep = ['bulk-year', 'bulk-site', 'bulk-item'].map(id => $(id).value);
    $('bulk-year').innerHTML = '<option value="">표에서 찾기</option>' + Array.from({ length: 11 }, (_, i) => curYr - i).map(y => `<option value="${y}">${y}년</option>`).join('');
    $('bulk-site').innerHTML = '<option value="">표에서 찾기</option>' + SITES.map(x => `<option>${x}</option>`).join('');
    $('bulk-item').innerHTML = '<option value="">표에서 찾기</option>' + [...Object.keys(GHG), ...(v2 ? [WATER] : [])].map(x => `<option>${x}</option>`).join('');
    ['bulk-year', 'bulk-site', 'bulk-item'].forEach((id, i) => { if ([...$(id).options].some(o => o.value === keep[i])) $(id).value = keep[i]; });
  }

  $('bulk-save').addEventListener('click', async () => {
    const p = bulkPlan; if (!p) return;
    const ow = $('bulk-overwrite').checked, todo = p.cells.filter(c => c.status === 'new' || (ow && c.status === 'chg'));
    if (!todo.length) return;
    setBusy($('bulk-save'), true);
    try {
      const ins = [], upd = [], mets = [];
      todo.forEach(c => {
        if (c.item === WATER) { mets.push(mRow(c.ym, c.site, WATER, c.v, c.ex?.note || '')); return; }
        const f = GHG[c.item], d = { amount: c.v, unit: f.unit, scope: f.scope, ghg: calcGHG(c.item, c.v) };
        if (c.ex) upd.push([c.ex.id, d]); else ins.push({ date: c.ym, site: c.site, type: c.item, note: '', ...d });
      });
      for (let i = 0; i < ins.length; i += 500) await sb('POST', 'energy', '', ins.slice(i, i + 500), 'return=minimal');
      for (const [id, d] of upd) await sb('PATCH', 'energy', `?id=eq.${id}`, d, 'return=minimal');
      if (mets.length) await sb('POST', 'env_metrics', '?on_conflict=period,site,item', mets, 'resolution=merge-duplicates,return=minimal');
      await refresh();
      showToast(`✅ ${todo.length}개월 저장 완료`);
      bulkGrid = null; bulkPlan = null; $('bulk-text').value = ''; $('bulk-overwrite').checked = false; renderBulkPreview();
      $('bulk-info').textContent = `${todo.length}개월을 저장했어요 · 입력 현황과 각 탭에 바로 반영돼요`;
    } catch (e) { saveFailed(e, '저장', runBulk); }   // 일부만 저장됐어도 다시 읽어 미리보기 상태를 갱신
    setBusy($('bulk-save'), false); $('bulk-save').disabled = !bulkPlan;
  });
  $('bulk-parse').addEventListener('click', bulkFromText);
  $('bulk-clear').addEventListener('click', () => { $('bulk-text').value = ''; bulkGrid = null; runBulk(); });
  let bulkTimer = 0;   // 붙여넣거나 고치면 잠시 뒤 바로 미리보기
  $('bulk-text').addEventListener('input', () => { clearTimeout(bulkTimer); bulkTimer = setTimeout(bulkFromText, 250); });
  ['bulk-year', 'bulk-site', 'bulk-item'].forEach(id => $(id).addEventListener('change', runBulk));
  $('bulk-overwrite').addEventListener('change', renderBulkPreview);
  $('bulk-drop').addEventListener('click', () => $('bulk-file').click());
  $('bulk-drop').addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); $('bulk-file').click(); } });
  $('bulk-file').addEventListener('change', e => { bulkFromFiles(e.target.files); e.target.value = ''; });
  // 화면 어디에 파일을 끌어다 놓아도 일괄 입력으로
  let dragDepth = 0;
  const hasFiles = e => [...(e.dataTransfer?.types || [])].includes('Files');
  const appOn = () => $('app').style.display !== 'none' && canEdit();   // 모니터링 권한은 끌어다 놓기 없음
  const showDrop = on => { $('drop-overlay').hidden = !on; $('bulk-drop').classList.toggle('over', on); };
  window.addEventListener('dragenter', e => { if (!hasFiles(e) || !appOn()) return; dragDepth++; showDrop(true); });
  window.addEventListener('dragleave', e => { if (!hasFiles(e)) return; if (--dragDepth <= 0) { dragDepth = 0; showDrop(false); } });
  window.addEventListener('dragover', e => { if (hasFiles(e)) { e.preventDefault(); e.dataTransfer.dropEffect = appOn() ? 'copy' : 'none'; } });
  window.addEventListener('drop', e => {
    if (!hasFiles(e)) return;
    e.preventDefault(); dragDepth = 0; showDrop(false);
    if (appOn()) bulkFromFiles(e.dataTransfer.files);
  });

