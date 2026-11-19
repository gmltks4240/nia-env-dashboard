/* js/main.js (9/9) — 시작 — 탭·필터 이벤트 · 수정/삭제 · 부팅(boot) 호출. 반드시 맨 마지막에 불러옴
   한 덩어리였던 js/app.js 를 순서 그대로 나눈 것. 파일들은 index.html 에 적힌 순서(core → … → main)로 불러오고,
   최상위 const·let·function 은 모든 파일이 함께 쓴다. 새 파일을 만들면 index.html 에도 넣을 것. */
  /* ── 탭 줄에 더 있으면 오른쪽 가장자리를 흐린다 (잘린 채 끝나면 더 있는 줄 모른다) ── */
  (() => {
    const row = document.querySelector('.tab-row');   // 실제 스크롤 컨테이너
    const more = () => { if (!row) return; const m = row.scrollLeft + row.clientWidth < row.scrollWidth - 1; if (m) row.dataset.more = '1'; else delete row.dataset.more; };
    if (row) {
      row.addEventListener('scroll', more, { passive: true });
      new ResizeObserver(more).observe(row);   // 로딩 화면 뒤에 숨어 있다가 보일 때, 창 크기가 바뀔 때
    }
  })();

  /* ── 탭·서브탭 네비게이션 ─────────────────────────── */
  document.querySelectorAll('.tab-btn').forEach(b => b.addEventListener('click', () => {
    if (!needOk(b)) return;   // 권한 없는 탭 (화면에서도 숨김)
    document.querySelectorAll('.tab-btn').forEach(x => x.classList.remove('active'));
    document.querySelectorAll('.tab-panel').forEach(x => x.classList.remove('active'));
    b.classList.add('active');
    $('tab-' + b.dataset.tab).classList.add('active');
    syncNavSite();   // 메인·목표·로드맵·입력·관리에서는 거점 선택 줄을 숨김
    syncStick();
    if (b.dataset.tab === 'home')      renderHome();
    if (b.dataset.tab === 'dashboard') renderDash();
    if (b.dataset.tab === 'history')   renderHistory();
    if (b.dataset.tab === 'roadmap')   renderRoadmapTab();
    if (b.dataset.tab === 'outlook')   renderOutlookTab();
    if (b.dataset.tab === 'manage')    renderManage();
  }));

  // 📈 전망 — 만약에 칸을 바꾸면 바로 다시 셈 (저장 안 됨) · 표 '모든 연도 보기'
  let wiT = 0;
  $('o-wi').addEventListener('input', () => { clearTimeout(wiT); wiT = setTimeout(renderOutlookTab, 250); });
  $('o-wi').addEventListener('change', () => { clearTimeout(wiT); renderOutlookTab(); });
  $('wi-reset').addEventListener('click', () => { ['wi-pv-kw', 'wi-buy', 'wi-cut'].forEach(id => { $(id).value = ''; }); clearTimeout(wiT); renderOutlookTab(); });
  // 🎯 목표에 맞춰 넣기 — 계산한 값을 그 칸에 넣고 다시 셈 (30년 목표를 맞추려면 30년 안에 시작해야 함)
  $('wi-fit').addEventListener('click', e => {
    const b = e.target.closest('button[data-fit]'); if (!b) return;
    const k = b.dataset.fit, y1 = String(new Date().getFullYear() + 1), early = id => { if (+$(id).value > 2030) $(id).value = y1; };
    if (k === 'pv') { $('wi-pv-kw').value = b.dataset.v; early('wi-pv-y'); }
    if (k === 'buy') { $('wi-buy').value = b.dataset.v; early('wi-buy-y'); }
    if (k === 'cut') $('wi-cut').value = b.dataset.v;
    clearTimeout(wiT); renderOutlookTab();
  });
  $('o-export').addEventListener('click', exportOutlook);
  document.querySelectorAll('#tab-outlook .o-all').forEach(b => b.addEventListener('click', () => {
    const all = !$(`o-${b.dataset.all}-tbl`).classList.toggle('o-ms');
    b.setAttribute('aria-expanded', String(all)); b.textContent = all ? '주요 연도만 ▴' : '모든 연도 보기 ▾';
  }));

  // 서브탭: 같은 줄(.subtab-nav)의 버튼끼리만 전환 (데이터 입력 / 데이터 관리 각각)
  document.querySelectorAll('.subtab-btn').forEach(b => b.addEventListener('click', () => {
    if (!needOk(b)) return;
    b.closest('.subtab-nav').querySelectorAll('.subtab-btn').forEach(x => {
      x.classList.toggle('active', x === b);
      $('sub-' + x.dataset.sub).hidden = x !== b;
    });
    if (b.dataset.sub === 'log') loadChangeLog();
    if (b.dataset.sub === 'users') loadUsers();
  }));

  /* ── 필터 변경 리스너 ─────────────────────────────── */
  // 거점에서 쓰지 않는 에너지원(서울·제주의 차량연료·회생제동)은 목록에서 숨김
  function syncEnergyTypes() {
    const si = $('e-site').value;
    [...$('e-type').options].forEach(o => { o.hidden = o.disabled = !!o.value && itemNA(si, o.value); });
    if ($('e-type').selectedOptions[0]?.disabled) $('e-type').value = '';
  }
  $('e-site').addEventListener('change', syncEnergyTypes);
  ['e-year', 'e-site', 'e-type'].forEach(id => $(id).addEventListener('change', renderEnergyTable));
  // 입력표에 값을 넣으면 '저장 전 편집 중'으로 표시 → 자동 새로고침이 덮어쓰지 않음
  $('energy-tbody').addEventListener('input', () => { energyDirty = true; });
  ['input', 'change'].forEach(ev => $('waste-mtbl').addEventListener(ev, () => { wasteDirty = true; }));
  $('waste-mtbl').addEventListener('input', () => wasteGridRecalc($('waste-mtbl')));   // 발생량·합계 바로 계산
  $('waste-mtbl').addEventListener('click', e => { if (e.target.closest('.wg-add')) { wasteDirty = true; wasteGridAddCol($('waste-mtbl')); } });   // + 규격
  ['w-year', 'w-site'].forEach(id => $(id).addEventListener('change', renderWasteTable));
  ['x-year', 'x-site'].forEach(id => $(id).addEventListener('change', renderWaterTable));
  $('v-year').addEventListener('change', renderEvTable);
  $('pu-year').addEventListener('change', () => renderPairTable('pu'));
  $('cl-year').addEventListener('change', () => renderPairTable('cl'));
  $('water-tbody').addEventListener('input', () => { waterDirty = true; });
  $('ev-tbody').addEventListener('input', () => { evDirty = true; });
  document.querySelectorAll('.site-seg').forEach(g => g.addEventListener('click', e => {
    const b = e.target.closest('button[data-site]');
    if (b && b.dataset.site !== curSite) setSite(b.dataset.site);
  }));
  // 실적 조회 위쪽 막대: 연도(‹ 목록 ›) — 보던 자리 그대로 연도만 바뀜
  const histGo = y => { if (y && y !== histYear) { histYear = y; renderHistory(); } };
  $('h-year').addEventListener('change', () => histGo($('h-year').value));
  [['h-prev', -1], ['h-next', 1]].forEach(([id, k]) => $(id).addEventListener('click', () => histGo(pastYears()[pastYears().indexOf(histYear) + k])));
  // 보기 탭 [연도별 비교 | 25년 자세히] — 바꾸면 새 보기의 맨 위로 · 화살표 키로도 (고른 보기는 이 브라우저에 기억)
  const reduceMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  function setHistView(v, focus = false) {
    if (v === histView) return;
    histView = v;
    try { localStorage.setItem(HV_KEY, v); } catch { /* 기억 못 해도 동작은 그대로 */ }
    renderHistory();
    if (focus) $(`hv-${v}`).focus();
    const top = $('h-site-info').getBoundingClientRect().top - stickPx();
    if (top < 0) window.scrollBy(0, top);
  }
  $('h-tabs').addEventListener('click', e => { const b = e.target.closest('[role="tab"]'); if (b) setHistView(b.dataset.view); });
  $('h-tabs').addEventListener('keydown', e => {
    const k = e.key, v = k === 'Home' ? 'cmp' : k === 'End' ? 'year' : (k === 'ArrowLeft' || k === 'ArrowRight') ? (histView === 'cmp' ? 'year' : 'cmp') : null;
    if (!v) return;
    e.preventDefault(); setHistView(v, true);
  });
  // 바로가기 칩 → 그 구역으로 (표는 펼쳐서)
  $('h-toc').addEventListener('click', e => {
    const a = e.target.closest('a[data-to]'), el = a && $(a.dataset.to);
    if (!el) return;
    e.preventDefault();
    if (el.tagName === 'DETAILS') el.open = true;
    if (a.dataset.to === 'h-sec-tbl') $('h-cmp-details').open = true;
    el.scrollIntoView({ behavior: reduceMotion() ? 'auto' : 'smooth', block: 'start' });
  });
  // 스크롤하면 바로가기에 지금 구역 표시 · 창 크기가 바뀌면 붙는 막대 높이 다시 재기
  let tocRaf = 0;
  window.addEventListener('scroll', () => { if (!tocRaf) tocRaf = requestAnimationFrame(() => { tocRaf = 0; histTocSpy(); dashTocSpy(); }); }, { passive: true });
  window.addEventListener('resize', () => { syncStick(); histTocSpy(); renderDashToc(); });
  $('h-cmp-etype').addEventListener('change', renderHistory);
  $('h-why-seg').addEventListener('click', e => { const b = e.target.closest('button[data-by]'); if (b && b.dataset.by !== histWhyBy) { histWhyBy = b.dataset.by; renderHistory(); } });
  $('h-why-list').addEventListener('click', e => {   // 요인 줄 → 그 에너지원(전체 합계면 대구본원부터) 또는 그 거점의 고른 연도 월별 자료
    const b = e.target.closest('button[data-k]'); if (!b) return;
    const k = b.dataset.k, bySite = !curSite && histWhyBy === 'site';
    openDrill({ kind: 'year', year: +histYear, site: bySite ? k : (curSite || '대구본원'), focus: bySite ? [] : [k] });
  });
  $('h-mon-yrs').addEventListener('click', e => {
    const b = e.target.closest('button[data-preset]'); if (!b) return;
    if (b.dataset.preset === 'recent') histMonYrs = null;
    else { const o = [...($('h-mon-yrs').querySelector('select')?.options || [])].map(x => x.value); if (!o.length) return; histMonYrs = { from: o[0], to: o[o.length - 1] }; }
    renderHistory();
  });
  // 기간 선택: 시작이 끝보다 늦으면 서로 맞춤
  $('h-mon-yrs').addEventListener('change', e => {
    const sel = e.target.closest('select[data-end]'); if (!sel) return;
    const [f, t] = [...$('h-mon-yrs').querySelectorAll('select[data-end]')].map(x => x.value);
    histMonYrs = +f <= +t ? { from: f, to: t } : sel.dataset.end === 'from' ? { from: f, to: f } : { from: t, to: t };
    renderHistory();
  });
  $('h-cum-seg').addEventListener('click', e => { const b = e.target.closest('button[data-cum]'); if (b && (b.dataset.cum === '1') !== histCum) { histCum = b.dataset.cum === '1'; renderHistory(); } });
  // 배출 구성의 거점 줄 → 그 거점의 고른 연도 자료 (온실가스 = 월별 에너지 · 폐기물 = 봉투)
  $('h-site-rows').addEventListener('click', e => { const b = e.target.closest('button[data-site]'); if (b) openDrill({ kind: 'year', year: +histYear, site: b.dataset.site }); });
  $('h-ws-rows').addEventListener('click', e => { const b = e.target.closest('button[data-site]'); if (b) openDrill({ kind: 'waste', year: +histYear, site: b.dataset.site }); });
  $('h-cs-by').addEventListener('click', e => { const b = e.target.closest('button[data-v]'); if (b && b.dataset.v !== histMixBy) { histMixBy = b.dataset.v; renderHistory(); } });
  // 핵심 변화 → 보고서 문구 복사 (클립보드를 못 쓰는 환경이면 선택 후 복사로 대신)
  $('h-copy').addEventListener('click', async () => {
    if (!histCopy) { showToast('복사할 문구가 없어요', 'err'); return; }
    let ok = false;
    try { await navigator.clipboard.writeText(histCopy); ok = true; } catch { /* 아래 방식으로 */ }
    if (!ok) {
      const ta = document.createElement('textarea');
      ta.value = histCopy; ta.setAttribute('readonly', ''); ta.style.cssText = 'position:fixed;top:0;left:0;opacity:0';
      document.body.appendChild(ta); ta.select();
      try { ok = document.execCommand('copy'); } catch { ok = false; }
      ta.remove();
    }
    if (ok) showToast(icn('clipboard') + ' 보고서 문구를 복사했어요 — 보고서에 붙여넣으세요');
    else { $('h-copy-text').closest('details').open = true; showToast('복사하지 못했어요 — 아래 문구를 직접 선택해 복사하세요', 'err'); }
  });
  $('h-export').addEventListener('click', () => exportHistory('compare'));
  $('h-export-site').addEventListener('click', () => exportHistory('site'));
  $('bs-site').addEventListener('change', renderWxChart);
  document.addEventListener('click', e => { if (e.target.closest('a[href="#sec-basis"]')) $('sec-basis').open = true; });
  // 올해 현황의 입력 누락 칩 → 데이터 입력 탭의 현황판
  $('status-chip').addEventListener('click', () => {
    if (!canEdit()) return;
    document.querySelector('.tab-btn[data-tab="input"]').click();
    $('status-year').value = String(new Date().getFullYear()); renderStatusBoard();
    $('sec-status').open = true;
    $('sec-status').scrollIntoView({ block: 'start' });
  });
  // 입력 현황판 칸 → 해당 입력표로 이동
  $('status-tbl').addEventListener('click', e => {
    const b = e.target.closest('button[data-site]');
    if (b) gotoInput(b.dataset.site, b.dataset.item, b.dataset.year);
  });
  $('status-year').addEventListener('change', renderStatusBoard);
  ['m-year', 'm-site', 'm-type', 'm-item', 'm-who'].forEach(id => $(id).addEventListener('change', () => { managePage = 0; renderManage(); }));

  /* ── 수정/삭제 ───────────────────────────────────────── */
  let editState = null;
  $('manage-tbody').addEventListener('click', async e => {
    const ed = e.target.closest('.btn-edit');
    const dl = e.target.closest('.btn-del');
    const TABLE = { energy: 'energy', waste: 'waste', metric: 'env_metrics' };
    const RECS  = { energy: energyRecs, waste: wasteRecs, metric: metricRecs };
    if (dl) { const { id, type } = dl.dataset; deleteWithUndo(id, type, TABLE[type], RECS[type].find(r => String(r.id) === id)); }
    if (ed) {
      const { id, type } = ed.dataset;
      const rec = RECS[type].find(r => String(r.id) === id);
      if (!rec) { showToast('레코드를 찾을 수 없습니다', 'err'); return; }
      editState = { id, type, rec };
      $('modal-title').textContent = { energy: '에너지 데이터 수정', waste: '폐기물 데이터 수정', metric: `${rec.item} 데이터 수정` }[type];
      // 목록에 없는 저장값도 선택지에 넣어 둠 (모르는 사이 첫 항목으로 바뀌어 저장되지 않게)
      const opts = (list, cur, label = v => v) => [...(cur != null && cur !== '' && !list.some(v => String(v) === String(cur)) ? [cur] : []), ...list]
        .map(v => `<option value="${esc(v)}"${String(v) === String(cur) ? ' selected' : ''}>${esc(label(v))}</option>`).join('');
      const siteSel = idAttr => `<select id="${idAttr}">${opts(SITES, rec.site)}</select>`;
      if (type === 'energy') {
        $('modal-body').innerHTML = `<div class="fgrid">
          <div class="fg"><label for="me-date">수집 기간</label><input type="month" id="me-date" value="${esc(rec.date)}"></div>
          <div class="fg"><label for="me-site">거점</label>${siteSel('me-site')}</div>
          <div class="fg"><label for="me-type">에너지원</label><select id="me-type">${opts(Object.keys(GHG), rec.type)}</select></div>
          <div class="fg"><label for="me-amount">사용량 (${esc(rec.unit)})</label><input type="number" id="me-amount" value="${rec.amount ?? ''}" min="0" step="0.01"></div>
          <div class="fg full"><label for="me-note">비고</label><input type="text" id="me-note" value="${esc(rec.note)}"></div>
        </div>`;
      } else if (type === 'waste') {
        $('modal-body').innerHTML = `<div class="fgrid">
          <div class="fg"><label for="mw-date">수집 기간</label><input type="month" id="mw-date" value="${esc(rec.date)}"></div>
          <div class="fg"><label for="mw-site">거점</label>${siteSel('mw-site')}</div>
          <div class="fg"><label for="mw-size">봉투 규격 (L)</label><input type="number" id="mw-size" value="${rec.bagSize ?? ''}" min="0" step="any" inputmode="decimal"></div>
          <div class="fg"><label for="mw-qty">구입 수량 (매)</label><input type="number" id="mw-qty" value="${rec.qty ?? ''}" min="0" step="1"></div>
          <div class="fg full"><label for="mw-note">비고</label><input type="text" id="mw-note" value="${esc(rec.note)}"></div>
        </div>`;
      } else {
        const md = METRICS[rec.item] || { unit: rec.unit || '', freq: rec.period.length > 4 ? 'month' : 'year' };
        $('modal-body').innerHTML = `<div class="fgrid">
          <div class="fg"><label for="mx-period">${md.freq === 'month' ? '기간' : '연도 (연말 기준)'}</label>${md.freq === 'month'
            ? `<input type="month" id="mx-period" value="${esc(rec.period)}">`
            : `<input type="number" id="mx-period" value="${esc(rec.period)}" min="2000" max="2100" step="1">`}</div>
          <div class="fg"><label for="mx-site">거점</label>${siteSel('mx-site')}</div>
          <div class="fg"><label for="mx-value">값 (${esc(md.unit)})</label><input type="number" id="mx-value" value="${rec.value}" min="0" step="${md.unit === '대' ? 1 : 0.01}"></div>
          <div class="fg full"><label for="mx-note">비고</label><input type="text" id="mx-note" value="${esc(rec.note)}"></div>
        </div>`;
      }
      $('modal').style.display = 'flex';
    }
  });

  $('modal-save').addEventListener('click', async () => {
    if (!editState) return;
    const { id, type, rec } = editState;
    const yearly = type === 'metric' && METRICS[rec.item]?.freq === 'year';
    const period = String((type === 'energy' ? $('me-date') : type === 'waste' ? $('mw-date') : $('mx-period')).value).trim();
    if (!(yearly ? /^\d{4}$/.test(period) : /^\d{4}-(0[1-9]|1[0-2])$/.test(period))) { fieldErr($('modal-save'), [type === 'energy' ? $('me-date') : type === 'waste' ? $('mw-date') : $('mx-period')], '기간을 올바르게 입력하세요'); return; }
    if (isClosed(period)) { showToast(lockMsg(period.slice(0, 4)), 'err'); return; } // 마감된 연도로 옮기기 차단
    let table, body;
    if (type === 'energy') {
      const t = $('me-type').value, a = parseFloat($('me-amount').value), f = GHG[t];
      if (!f) { showToast(`'${t}'은(는) 배출계수가 없는 에너지원이에요. 목록의 에너지원을 고르세요`, 'err'); return; }
      if (isNaN(a) || a < 0) { fieldErr($('modal-save'), [$('me-amount')], '사용량은 0 이상의 숫자로 입력하세요'); return; }
      table = 'energy';
      body = { date: period, site: $('me-site').value, type: t, amount: a, unit: f.unit, scope: f.scope,
               ghg: calcGHG(t, a), note: $('me-note').value.trim() };
    } else if (type === 'waste') {
      const sz = parseFloat($('mw-size').value), qRaw = $('mw-qty').value.trim(), q = Number(qRaw);
      if (!(sz > 0)) { fieldErr($('modal-save'), [$('mw-size')], '봉투 규격(L)을 0보다 큰 숫자로 입력하세요'); return; }
      if (qRaw === '' || !Number.isInteger(q) || q < 0) { fieldErr($('modal-save'), [$('mw-qty')], '수량은 0 이상의 정수로 입력하세요'); return; }
      table = 'waste';
      body = { date: period, site: $('mw-site').value, bag_size: sz, qty: q,
               weight_kg: calcKg(sz, q), weight_ton: calcTon(sz, q), note: $('mw-note').value.trim() };
    } else {
      const vRaw = $('mx-value').value.trim(), v = Number(vRaw), site = $('mx-site').value, isCount = METRICS[rec.item]?.unit === '대';
      if (vRaw === '' || isNaN(v) || v < 0 || (isCount && !Number.isInteger(v))) { fieldErr($('modal-save'), [$('mx-value')], isCount ? '대수는 0 이상의 정수로 입력하세요' : '값은 0 이상의 숫자로 입력하세요'); return; }
      // 친환경차는 업무용 차량 수를 넘을 수 없음
      const pair = rec.item === EV_GREEN ? metricOf(period, site, EV_ALL) : rec.item === EV_ALL ? metricOf(period, site, EV_GREEN) : null;
      if (pair && (rec.item === EV_GREEN ? v > pair.value : pair.value > v)) { showToast('친환경차는 업무용 차량 수 이하여야 해요', 'err'); return; }
      table = 'env_metrics';
      body = { period, site, value: v, note: $('mx-note').value.trim() };
    }
    setBusy($('modal-save'), true);
    try {
      await sb('PATCH', table, `?id=eq.${id}`, body);
      $('modal').style.display = 'none'; editState = null;
      await refresh();
      showToast('✅ 수정되었습니다');
    } catch(e) { saveFailed(e, '수정'); }
    setBusy($('modal-save'), false); $('modal-save').disabled = false;
  });

  const closeModal = () => { $('modal').style.display = 'none'; editState = null; };
  $('modal-x').addEventListener('click', closeModal);
  $('modal-cancel').addEventListener('click', closeModal);
  $('modal').addEventListener('click', e => { if (e.target === $('modal')) closeModal(); });

  /* ── 카드를 누르면: 이 값이 어떻게 나왔는지 (계산 근거 팝업) ───────────
     calcStore[P][카드] = { title, sub, value, unit, period, site, rows(에너지원별), sites(거점별), months(월별), amt(원래 단위), alert, note }
     rows = [{ k, sub, amt, amtU, factor, ghg }] — 사용량 × 배출계수 = tCO₂eq */
  let calcFrom = null;
  //  '' 올해 현황 · 'y-' 실적 조회 그 해 자세히 (올해 현황 화면 복제라 id 앞에 y-) · 'c-' 연도별 비교 · 'g-' 목표·로드맵
  const calcP = card => card.dataset.calcP ?? (card.closest('#y-yv') ? 'y-' : '');
  const cNum = v => { const [i, d] = fq(v).split('.'); return d ? `${i}<small>.${d}</small>` : i; };
  const cPct = (v, tot) => tot > 0 ? fmt(v / tot * 100, 1) : null;
  // 거점별 가로 막대
  const calcBars = items => {
    const max = Math.max(1e-9, ...items.map(i => Math.abs(i.v)));
    return '<div class="calc-bars">' + items.map(i =>
      `<span class="cb-k">${i.col ? `<i style="background:${i.col}"></i>` : ''}${esc(i.k)}</span>` +
      `<span class="cb-b"><i style="width:${(Math.abs(i.v) / max * 100).toFixed(1)}%${i.col ? `;background:${i.col}` : ''}"></i></span>` +
      `<span class="cb-v">${cNum(i.v)}</span>`).join('') + '</div>';
  };
  // 월별 막대 위 숫자 — 칸이 좁아 짧게 (100 이상 정수 · 10 이상 소수 한 자리 · 그 밖 두 자리 · 0은 0)
  const mLbl = v => { const a = Math.abs(v); return !a ? '0' : a >= 100 ? fmt(v, 0) : a >= 10 ? fmt(v, 1) : fmt(v, 2); };
  // 월별 세로 막대 (자료가 있는 달만 칠하고, 1~12월 자리는 늘 보여 줌 → 어느 달이 비었는지 한눈에) · 막대 위에 값
  const calcMonths = (months, unit) => {
    const by = Object.fromEntries(months.map(m => [m.m, m.v]));
    const vals = months.map(m => m.v), max = Math.max(1e-9, ...vals.map(Math.abs));
    const last = Math.max(...months.map(m => m.m), 0);
    const cols = [];
    for (let m = 1; m <= Math.max(12, last); m++) {
      const v = by[m], h = v == null ? 0 : Math.max(3, Math.abs(v) / max * 100);
      cols.push(`<span class="cm-col${v == null ? ' cm-0' : ''}${v != null && Math.abs(v) === max ? ' cm-max' : ''}"` +
        ` title="${esc(`${m}월 ${v == null ? '자료 없음' : `${fq(v)} ${unit}`}`)}">` +
        `<span class="cm-slot">${v == null ? '' : `<b class="cm-v">${mLbl(v)}</b>`}<i class="cm-b" style="height:${v == null ? '2px' : h.toFixed(1) + '%'}"></i></span><span class="cm-m">${m}</span></span>`);
    }
    const mx = months.find(m => Math.abs(m.v) === max);
    return `<div class="cm-chart">${cols.join('')}</div>` +
      `<div class="cm-note">${mx ? `가장 많은 달 <b style="color:var(--green)">${mx.m}월 ${fq(mx.v)}</b> ${esc(unit)}` : '—'}</div>`;
  };
  // 계산식 한 줄: (A + B) ÷ C × 100 = 값
  const calcEq = f => {
    const part = o => `<span class="eq-p${o.r ? ' eq-r' : ''}"><b>${o.v == null ? '—' : typeof o.v === 'number' ? cNum(o.v) : esc(o.v)}` +
      `${o.u ? `<small>${esc(o.u)}</small>` : ''}</b><span>${esc(o.k)}</span></span>`;
    // parts의 한 칸이 { group: [...] }이면 괄호로 묶어서 그림 — (자가 + 구매) ÷ 총 전력 처럼
    const seq = ps => ps.map((o, i) => (i ? `<span class="eq-o">${esc(o.op || '+')}</span>` : '') +
      (o.group ? `<span class="eq-g"><span class="eq-par">(</span>${seq(o.group)}<span class="eq-par">)</span></span>` : part(o))).join('');
    return `<div class="calc-eq">${seq(f.parts)}<span class="eq-o">=</span>${part({ ...f.result, r: true })}</div>`;
  };
  /* ── 계산 근거 팝업의 공통 블록 ─────────────────────────────────────────────
     읽는 순서: 값 → 목표와 견주기(vs) → 어떻게 계산했나(식·표) → 연말 예측은 이렇게(fc) → 숫자 출처·어디서 보나(src)
     어떤 숫자든 '어디서 왔고, 어디서 확인·수정하나'까지 팝업 안에서 따라갈 수 있게 */
  // 달 번호 묶음 → '1~9월' · '10~12월' · '1·3·5월'
  const rngLabel = ms => { const a = [...new Set(ms.map(Number))].sort((x, y) => x - y); if (!a.length) return '';
    const runs = []; a.forEach(m => { const r = runs[runs.length - 1]; if (r && m === r[1] + 1) r[1] = m; else runs.push([m, m]); });
    return runs.map(([s, e]) => s === e ? `${s}` : e === s + 1 ? `${s}·${e}` : `${s}~${e}`).join('·') + '월'; };
  // 목표와 견주기 — vs = { k: '26년 연말 예측', v, t, tk: '법적 목표', unit, gu: 't', lower, est, d }
  function vsStrip(vs) {
    if (!vs || vs.v == null || vs.t == null) return '';
    const ok = vs.lower ? vs.v <= vs.t : vs.v >= vs.t, d = vs.d ?? 1, pct = vs.unit === '%';
    const f = x => pct ? `${fmt(x, d)}%` : fmt(x, d), gap = `${fmt(Math.abs(vs.v - vs.t), d)}${pct ? '%p' : vs.gu || ''}`;
    const ft = x => pct && Number.isInteger(x) ? `${x}%` : f(x);   // 정부 목표처럼 정수 %는 그대로
    const max = Math.max(vs.v, vs.t) * 1.1 || 1;
    return `<div class="cvs ${ok ? 'ok' : 'no'}"><div class="cvs-row"><span class="cvs-k">${esc(vs.k)}</span>` +
      `<b>${f(vs.v)}${pct ? '' : `<small>${esc(vs.unit || '')}</small>`}</b>` +
      `<span class="cvs-r">${ok ? '✓' : '✗'} ${ok ? (vs.est ? '달성 전망' : '달성') : (vs.est ? '미달 전망' : '미달')} · ` +
      `${gap} ${vs.lower ? (ok ? '여유' : '초과') : (ok ? '높음' : '부족')}</span></div>` +
      `<div class="cvs-bar"><i class="${vs.est ? 'est' : ''}" style="width:${Math.min(100, vs.v / max * 100).toFixed(1)}%"></i>` +
      `<em style="left:${Math.min(100, vs.t / max * 100).toFixed(1)}%"></em></div>` +
      `<div class="cvs-scale"><span>0</span><span><b>│ ${esc(vs.tk || '목표')} ${ft(vs.t)}</b></span></div></div>`;
  }
  // 바로가기 단추 — 다른 화면으로 (data-go 탭 · data-sub 하위 탭 · data-scroll 요소 · data-site 거점)
  const goBtn = (o, label) => o?.rmpop ? `<button type="button" class="cs-go" data-rmpop="${esc(o.rmpop)}">${esc(label || o.btn || '보기')} →</button>`
    : o?.drill ? `<button type="button" class="cs-go" data-drill="${esc(JSON.stringify(o.drill))}">${esc(label || o.btn || '자료 보기')} →</button>`
    : !o?.go ? '' : `<button type="button" class="cs-go" data-go="${o.go}"` +
    `${o.sub ? ` data-sub="${o.sub}"` : ''}${o.scroll ? ` data-scroll="${o.scroll}"` : ''}${o.site != null ? ` data-site="${esc(o.site)}"` : ''}` +
    `${o.need ? ` data-need="${o.need}"` : ''}>${esc(label || o.btn || '보기')} →</button>`;
  // 연도 고르기 — ‹ 이전 해 · 연도 목록 · 다음 해 › + 이정표 칩 (올해 연말 예측 · 30 · 40 · 50년) · n = { kind: 'ghg' | 're', cur }
  const yrNavHtml = n => { const y0 = new Date().getFullYear(), ys = olYears(), i = ys.indexOf(n.cur);
    const k = y => `${n.kind}:${y}`, mk = [y0, 2030, 2040, 2050].filter((y, j, a) => y >= y0 && y <= OUTLOOK.to && a.indexOf(y) === j);
    return '<div class="cyn" role="group" aria-label="연도 고르기"><span class="cyn-pick">' +
      `<button type="button" class="cyn-st" ${i > 0 ? `data-rmpop="${k(ys[i - 1])}"` : 'disabled'} aria-label="이전 해">‹</button>` +
      `<select class="cyn-sel" aria-label="연도">${ys.map(y => `<option value="${k(y)}"${y === n.cur ? ' selected' : ''}>${yrShort(y)} ${y === y0 ? '연말 예측' : '전망'}</option>`).join('')}</select>` +
      `<button type="button" class="cyn-st" ${i >= 0 && i < ys.length - 1 ? `data-rmpop="${k(ys[i + 1])}"` : 'disabled'} aria-label="다음 해">›</button></span>` +
      mk.map(y => `<button type="button" data-rmpop="${k(y)}" aria-pressed="${y === n.cur}">${yrShort(y)}<small>${y === y0 ? '연말 예측' : '전망'}</small></button>`).join('') + '</div>'; };
  // 연말 예측은 이렇게 — fc = { unit, d, act, pred, months: [{ m, act, pred }], parts: [{ k, act, pred, u, strong }], method, link, title }
  function fcSection(f) {
    if (!f) return '';
    const d = f.d ?? 1, u = f.unit || '', fv = x => fmt(x, d), tot = f.act + f.pred;
    // 실적 달 · 통째로 예측한 달 · 입력은 됐지만 일부 항목이 비어 그 칸만 예측한 달 — 라벨이 겹치지 않게 (1~9월 실적 + 10~12월 예측 + 9월 빈칸)
    const aM = f.months.filter(m => m.act > 0).map(m => m.m), fullP = f.months.filter(m => m.pred > 0 && !(m.act > 0)).map(m => m.m);
    const partP = f.months.filter(m => m.pred > 0 && m.act > 0);
    const aL = aM.length ? `${rngLabel(aM)} 실적` : '실적';
    const pL = (fullP.length ? `${rngLabel(fullP)} 예측` : '빈칸 예측') + (fullP.length && partP.length ? ` + ${rngLabel(partP.map(m => m.m))} 빈칸` : '');
    // 빈칸 안내 — 같은 항목이 빈 달끼리 묶어서: '4~9월은 자가발전이 아직 입력 전이라 그 칸만 예측으로 채웠어요'
    const gaps = []; partP.forEach(m => { const k = (m.pt || []).join('·'), g = gaps.find(x => x.k === k); if (g) g.ms.push(m.m); else gaps.push({ k, ms: [m.m] }); });
    const gapTxt = gaps.map(g => `${rngLabel(g.ms)}${josa(rngLabel(g.ms), '은', '는')} ${g.k ? `${g.k}${josa(g.k, '이', '가')} ` : ''}아직 입력 전이라 그 칸만 예측으로 채웠어요`);
    const max = Math.max(1e-9, ...f.months.map(m => (m.act || 0) + (m.pred || 0)));
    const cols = f.months.map(m => { const a = m.act || 0, p = m.pred || 0;
      return `<span class="fm${p > 0 ? ' pred' : ''}" title="${esc(`${m.m}월 · 실적 ${a ? fv(a) : '—'}${p ? ` · 예측 ${fv(p)}` : ''} ${u}`)}"><span class="fm-slot">` +
        (a + p > 0 ? `<b class="fm-v">${mLbl(a + p)}</b>` : '') +
        (p > 0 ? `<i class="fm-p" style="height:${(p / max * 100).toFixed(1)}%"></i>` : '') +
        (a > 0 ? `<i class="fm-a" style="height:${(a / max * 100).toFixed(1)}%"></i>` : '') +
        `</span><span class="fm-m">${m.m}</span></span>`; }).join('');
    const parts = (f.parts || []).filter(p => (p.act || 0) + (p.pred || 0) > 0 || p.strong);
    return `<div class="calc-sec cfc"><h4><span>${esc(f.title || '연말 예측은 이렇게 나왔어요')}</span><em>${esc(u)}</em></h4>` +
      calcEq({ parts: [{ k: aL, v: fv(f.act), u }, { k: pL, v: fv(f.pred), u, op: '+' }], result: { k: f.resK || '연말 예측', v: fv(tot), u } }) +
      `<div class="cfc-m">${cols}</div>` +
      `<div class="cfc-leg"><span><i></i>입력된 실적</span><span><i class="p"></i>남은 달 예측</span></div>` +
      gapTxt.map(t => `<div class="cfc-gap">⚠ ${esc(t)}</div>`).join('') +
      (parts.length ? '<div class="calc-tw"><table class="calc-tbl"><thead><tr><th>항목</th><th>지금까지 실적</th><th>남은 달 예측</th><th>연말</th></tr></thead><tbody>' +
        parts.map(p => { const uu = p.u ?? u, n = x => x ? `${fmt(x, p.d ?? d)}<span class="ct-u">${esc(uu)}</span>` : '—';
          return `<tr${p.strong ? ' class="ct-sum"' : ''}><td class="ct-nm">${p.col ? `<i style="background:${p.col}"></i>` : ''}${esc(p.k)}${p.sub ? `<small>${esc(p.sub)}</small>` : ''}</td>` +
            `<td class="ct-n">${n(p.act)}</td><td class="ct-n" style="color:var(--chart-pred)">${n(p.pred)}</td><td class="ct-n ct-val">${n((p.act || 0) + (p.pred || 0))}</td></tr>`; }).join('') +
        '</tbody></table></div>' : '') +
      (f.method ? `<div class="cfc-how"><span>ⓘ ${esc(f.method)}</span>${goBtn(f.link, f.link?.label)}</div>` : '') + '</div>';
  }
  // 숫자 출처 · 어디서 보나 — src = [{ k, v, kind: in 입력값 | set 설정값 | fix 고정값 | pred 예측값, from, go, sub, scroll, site, need, btn }]
  const SRC_KIND = { in: '입력값', set: '설정값', fix: '고정값', pred: '예측값' };
  function srcSection(list) {
    if (!list?.length) return '';
    return '<div class="calc-sec"><h4><span>숫자 출처 · 어디서 보나</span><em>확인하거나 고치려면</em></h4><ul class="csrc">' +
      list.map(s => `<li><span class="cs-k">${esc(s.k)}${s.v != null ? `<b>${esc(s.v)}</b>` : ''}</span>` +
        `<span class="cs-f"><i class="${s.kind}">${SRC_KIND[s.kind] || ''}</i>${esc(s.from || '')}</span>${goBtn(s, s.btn)}</li>`).join('') + '</ul></div>';
  }
  // 카드마다 기본 출처 (팝업 데이터에 src가 따로 없을 때) — 어떤 숫자가 어디서 왔는지
  const S_IN_E = { kind: 'in', from: '데이터 입력 → 에너지 (월별 사용량)', go: 'input', sub: 'energy', need: 'edit', btn: '입력 보기' };
  const S_IN_W = { kind: 'in', from: '데이터 입력 → 폐기물 (월별 봉투 매수)', go: 'input', sub: 'waste', need: 'edit', btn: '입력 보기' };
  const S_IN_M = { kind: 'in', from: '데이터 입력 → 기타 지표 (연 1회)', go: 'input', sub: 'metrics', need: 'edit', btn: '입력 보기' };
  const S_EF = { k: '배출계수', kind: 'fix', from: '전력 0.4594 tCO₂eq/MWh · 도시가스 2.176 tCO₂eq/천Nm³ 등 (공표값)' };
  const S_SET = (k, v) => ({ k, v, kind: 'set', from: '데이터 관리 → 연도 마감·로드맵', go: 'manage', sub: 'settings', need: 'admin', btn: '설정 보기' });
  const S_FC = site => ({ k: '남은 달 예측', kind: 'pred', from: '기상연동 예측 — 올해 현황 월별 그래프의 점선', go: 'dashboard', scroll: 'sec-charts', site: site ?? '', btn: '그래프 보기' });
  function srcFor(key, c) {
    const k = String(key || ''), isCurFc = !!c.fc;
    if (/^k-(total|s1|s2|elec|gas|heat|gasoline|diesel)/.test(k)) return [{ k: '사용량', ...S_IN_E }, S_EF];
    if (/^k-s3|^k-waste/.test(k)) return [{ k: '봉투 매수', ...S_IN_W }, { k: '환산', kind: 'fix', from: '봉투 용량(L) × 0.174 kg/L · 소각 배출계수' }];
    if (/^k-re-(kwh|buy)|^k-regen/.test(k)) return [{ k: k.includes('buy') ? '구매량' : '발전량', ...S_IN_E }];
    if (k === 'k-tgt-base') return [S_SET('기준배출량', c.value != null ? `${fq(c.value)} t` : null)];
    if (/^k-ev|^k-pue|^k-cloud|^k-water/.test(k)) return [{ k: '입력값', ...S_IN_M }];
    return isCurFc ? [{ k: '지금까지 실적', ...S_IN_E }, S_FC()] : [];
  }
  function renderCalc(c, key) {
    const u = c.unit || 'tCO₂eq';
    $('calc-title').textContent = c.title;
    $('calc-sub').textContent = [c.sub, c.period, c.site].filter(Boolean).join(' · ');
    // 점수 히어로 (경영평가 계량 카드) · 그 밖에는 기존 큰 숫자 줄
    const q = c.score;
    $('calc-sum').className = q ? 'calc-sum calc-sum-q' : 'calc-sum';
    $('calc-sum').innerHTML = q
      ? `<div class="cscore ${q.tone}"><div class="cq-top">` +
        `<span class="cq-v">${fmt(q.got, 1)}<small>/ ${q.full}점</small></span>` +
        `<span class="cq-r">${q.tone === 'ok' ? '✓' : q.tone === 'no' ? '✗' : 'ⓘ'} ${esc(q.say)}</span></div>` +
        `<div class="cq-bar"><i style="width:${Math.min(100, q.got / q.full * 100).toFixed(1)}%"></i></div>` +
        (q.sub ? `<div class="cq-sub">${q.sub}</div>` : '') + '</div>'
      : c.valueTxt != null
      ? `<span class="cs-v">${esc(c.valueTxt)}<span class="cs-u">${esc(u)}</span></span>${c.valueK ? `<span class="cs-amt">${esc(c.valueK)}</span>` : ''}`
      : c.value == null
      ? `<span class="ds-none">${esc(c.empty || '입력된 자료가 없어요')}</span>`
      : `<span class="cs-v">${cNum(c.value)}<span class="cs-u">${esc(u)}</span></span>` +
        (c.valueK ? `<span class="cs-amt">${esc(c.valueK)}</span>` : '') +
        (c.amt ? `<span class="cs-amt">사용량 ${fq(c.amt.v)} ${esc(c.amt.u)}</span>` : '');
    // 목표와 견주기 — 값 바로 아래 (연말 예측·실적이 목표를 맞추나)
    if (c.vs) $('calc-sum').insertAdjacentHTML('beforeend', vsStrip(c.vs));
    // 연도 고르기 (목표·로드맵 그래프 · 📈 전망 탭에서 연 팝업) — 맨 위에서 올해 ~ 50년을 오감
    if (c.yrNav) $('calc-sum').insertAdjacentHTML('afterbegin', yrNavHtml(c.yrNav));
    // 경고 까닭 — 🔍 입력 확인은 고칠 수 있는 사람에게만
    const ws = [...(c.over ? [{ txt: c.over, cls: 'over', ico: '▲' }] : []),
                ...(c.alert?.up || []).map(t => ({ ...t, cls: 'up', ico: '⚠' })),
                ...(canEdit() ? (c.alert?.chk || []).map(t => ({ ...t, cls: 'chk', ico: icn('search') })) : [])];
    $('calc-why').innerHTML = ws.map(t => `<div class="cw ${t.cls}"><b>${t.ico} ${esc(t.txt)}</b>${t.why ? `<span>${esc(t.why)}</span>` : ''}</div>`).join('');
    const out = [];
    const rows = c.rows || [], tot = sumBy(rows, r => r.ghg), many = rows.length > 1;
    // ① 무엇이 얼마나 차지하나 — 한 줄 막대 + 범례 (항목이 둘 이상일 때)
    if (many && tot > 0) {
      out.push('<div class="calc-share"><div class="cs-bar">' +
        rows.filter(r => r.ghg > 0).map(r => `<i style="flex:${r.ghg} 0 0;background:${typeCol(r.k)}" title="${esc(`${r.k} ${fmt(r.ghg / tot * 100, 1)}%`)}"></i>`).join('') + '</div>' +
        '<div class="cs-leg">' + rows.filter(r => r.ghg > 0).map(r =>
          `<span><i style="background:${typeCol(r.k)}"></i>${esc(r.k)} <b>${fmt(r.ghg / tot * 100, 1)}%</b></span>`).join('') + '</div></div>');
    }
    // ② 계산식 (비율·목표 카드)
    if (c.formula) out.push(calcEq(c.formula));
    // ④ 사실 목록 (목표 카드: 기준연도·감축률·실적 등) — factsFirst면 미리 만든 블록보다 먼저
    const factsHtml = () => !c.facts?.length ? '' : `<div class="calc-sec"><h4><span>${esc(c.factsTitle || '기준')}</span></h4><table class="calc-tbl"><tbody>` +
      c.facts.map(f => `<tr><td class="ct-nm" style="font-weight:500;color:var(--text2)">${esc(f.k)}</td>` +
        `<td class="ct-n ct-val">${f.v == null ? '—' : (typeof f.v === 'number' ? cNum(f.v) : esc(f.v))}<span class="ct-u">${esc(f.u || '')}</span></td></tr>`).join('') +
      '</tbody></table></div>';
    if (c.factsFirst) out.push(factsHtml());
    // ②-1 미리 만든 블록 (전망: 목표와 견주기 · 에너지원별 셈 · 태양광 설비)
    if (c.blocks?.length) out.push(...c.blocks);
    // ③ 항목별: 사용량 × 배출계수 = tCO₂eq
    if (rows.length) {
      out.push(`<div class="calc-sec"><h4><span>${many ? '무엇이 합쳐졌나' : '어떻게 계산했나'}</span><em>사용량 × 배출계수 = ${esc(u)}</em></h4><table class="calc-tbl">` +
        `<thead><tr><th>항목</th><th>사용량</th><th class="ct-eq">× 배출계수</th><th>${esc(u)}</th>${many ? '<th class="ct-share">비중</th>' : ''}</tr></thead><tbody>` +
        rows.map(r => `<tr><td class="ct-nm"><i style="background:${typeCol(r.k)}"></i>${esc(r.k)}${r.sub ? `<small>${esc(r.sub)}</small>` : ''}</td>` +
          `<td class="ct-n">${fq(r.amt)}<span class="ct-u">${esc(r.amtU || '')}</span></td>` +
          `<td class="ct-eq">${esc(r.factor || '')}</td>` +
          `<td class="ct-n ct-val">${cNum(r.ghg)}</td>` +
          (many ? `<td class="ct-share"><span class="ct-sbar"><span class="sb"><i style="width:${(r.ghg / tot * 100).toFixed(1)}%;background:${typeCol(r.k)}"></i></span><b>${cPct(r.ghg, tot)}%</b></span></td>` : '') +
          '</tr>').join('') +
        (many ? `<tr class="ct-sum"><td>합계</td><td></td><td class="ct-eq"></td><td class="ct-n">${cNum(tot)}</td><td class="ct-share"><span class="ct-sbar"><b>100%</b></span></td></tr>` : '') +
        '</tbody></table></div>');
    }
    if (!c.factsFirst) out.push(factsHtml());
    // ④-0 연말 예측은 이렇게 — 예측이 들어간 값이면 '입력된 실적 + 남은 달 예측'을 달마다·항목마다
    if (c.fc) out.push(fcSection(c.fc));
    // ④-1 구간 계단 — '어느 칸에 들어 몇 점인가'를 한눈에 (steps = { title, items: [{ k, v }], cur })
    if (c.steps?.items?.length) out.push(`<div class="calc-sec"><h4><span>${esc(c.steps.title || '구간')}</span>` +
      `${c.steps.note ? `<em>${esc(c.steps.note)}</em>` : ''}</h4><div class="csteps">` +
      c.steps.items.map((s, i) => `<div class="cstep${i === c.steps.cur ? ' on' : ''}">` +
        `<b>${esc(s.v)}</b><span>${esc(s.k)}</span></div>`).join('') + '</div></div>');
    // ④-2 자유 표 — 경영평가 계량지표처럼 '항목 × 여러 기준'을 그대로 보여 줘야 할 때
    //  tbl = { title, unit, head: [열 이름], rows: [{ c: [칸…], sum }] } · 칸은 글자나 { v, cls }
    (Array.isArray(c.tbl) ? c.tbl : c.tbl ? [c.tbl] : []).forEach(t => {
      if (!t.rows?.length) return;
      out.push(`<div class="calc-sec"><h4><span>${esc(t.title || '내역')}</span>${t.unit ? `<em>${esc(t.unit)}</em>` : ''}</h4>` +
        '<div class="calc-tw"><table class="calc-tbl"><thead><tr>' + (t.head || []).map(h => `<th>${esc(h)}</th>`).join('') + '</tr></thead><tbody>' +
        t.rows.map(r => `<tr${r.sum ? ' class="ct-sum"' : ''}>` + r.c.map((x, i) => {
          const v = x && typeof x === 'object' ? x.v : x, cls = (x && typeof x === 'object' && x.cls) || '';
          return `<td class="${i ? 'ct-n' : 'ct-nm'}${cls ? ' ' + cls : ''}">${esc(String(v ?? '—'))}</td>`;
        }).join('') + '</tr>').join('') + '</tbody></table></div></div>');
    });
    // ⑤ 거점별 · 월별 (넓은 화면에서는 나란히)
    const half = [];
    if (c.sites?.length > 1) half.push(`<div class="calc-sec"><h4><span>거점별</span><em>${esc(u)}</em></h4>` + calcBars(c.sites.map(x => ({ k: x.k, v: x.ghg, col: x.col }))) + '</div>');
    if (c.months?.length) half.push(`<div class="calc-sec"><h4><span>월별</span><em>${esc(u)}</em></h4>` + calcMonths(c.months, u) + '</div>');
    out.push(...half);   // 위아래로 — 월별은 막대 위 숫자가 들어가도록 넓게
    // 숫자 출처 · 어디서 보나 (모든 팝업)
    out.push(srcSection(c.src || srcFor(key, c)));
    $('calc-body').innerHTML = out.join('') || (c.value == null ? '' : '<p class="calc-empty">나눠 볼 내역이 없어요</p>');
    $('calc-note').textContent = c.note || '';
    $('calc-scroll') && ($('calc-scroll').scrollTop = 0);
  }
  function openCalc(card) {
    if (!card || card.classList.contains('kpi-placeholder')) return;
    const c = calcStore[calcP(card)]?.[card.dataset.calc];
    if (!c) return;
    showCalc(c, card.dataset.calc);
  }
  // 카드가 아닌 곳(그래프 막대 등)에서도 같은 팝업을 띄움
  function showCalc(c, key) {
    calcFrom = document.activeElement;
    renderCalc(c, key);
    $('calc').style.display = 'flex';
    $('calc-x').focus({ preventScroll: true });
  }
  function closeCalc() {
    $('calc').style.display = 'none';
    if (calcFrom && document.contains(calcFrom)) calcFrom.focus?.();
  }
  document.addEventListener('click', e => {
    const el = e.target.closest('[data-calc]');
    if (!el) return;
    // 카드 안의 다른 버튼·링크를 누른 경우는 그쪽 동작으로
    if (el.classList.contains('kpi-click') && e.target.closest('a,button:not(.kpi-click)')) return;
    openCalc(el);
  });
  document.addEventListener('keydown', e => {
    if (e.key !== 'Enter' && e.key !== ' ') return;
    if (e.target.closest?.('button:not(.kpi-click)')) return;   // 카드 안 단추(목표 열쇠 등)는 단추 자기 동작으로 (Enter가 click이 됨)
    const card = e.target.closest?.('.kpi-click, .sum-click, .gs-card[data-calc], .ev-card[data-calc]');
    if (card) { e.preventDefault(); openCalc(card); }
  });
  ['calc-x', 'calc-close'].forEach(id => $(id).addEventListener('click', closeCalc));
  // 목표·로드맵 그래프 · 📈 전망 탭 → 그 해 계산 근거 (팝업이 열려 있으면 내용만 바꿈 — 연도 고르기·칩·'근거 보기')
  const openRmKey = (key, from) => { const [k, y] = key.split(':'), c = rmYearPop(k, +y);
    if ($('calc').style.display === 'none') return showCalc(c, '');
    renderCalc(c, '');
    // 고른 단추·목록에 그대로 머물게 (키보드로 해를 넘겨 볼 때)
    const box = $('calc'), sel = from?.classList?.contains('cyn-sel') ? box.querySelector('.cyn-sel')
      : from?.classList?.contains('cyn-st') ? box.querySelector(`.cyn-st[aria-label="${from.getAttribute('aria-label')}"]:not([disabled])`) || box.querySelector('.cyn-sel')
      : box.querySelector(`.cyn [data-rmpop="${key}"]`);
    sel?.focus({ preventScroll: true }); };
  const openRmPop = el => openRmKey(el.dataset.rmpop, el);
  document.addEventListener('click', e => { const b = e.target.closest('[data-rmpop]'); if (b) openRmPop(b); });
  document.addEventListener('change', e => { if (e.target.classList?.contains('cyn-sel')) openRmKey(e.target.value, e.target); });
  document.addEventListener('keydown', e => { if (e.key !== 'Enter' && e.key !== ' ') return;
    const r = e.target.closest?.('tr[data-rmpop], [role="button"][data-rmpop]'); if (r) { e.preventDefault(); openRmPop(r); } });
  // 팝업 안 '자료 보기' → 그 해 월별 자료 (그래프 막대를 눌렀을 때와 같은 표)
  document.addEventListener('click', e => { const b = e.target.closest('[data-drill]'); if (!b) return;
    let ctx = null; try { ctx = JSON.parse(b.dataset.drill); } catch (_) { return; }
    closeCalc(); openDrill(ctx); });
  $('calc').addEventListener('click', e => { if (e.target === $('calc')) closeCalc(); });
  document.addEventListener('keydown', e => { if (e.key === 'Escape' && $('calc').style.display !== 'none') closeCalc(); });

  /* ── 그래프·표에서 누른 자료 보기·고치기 (팝업) ─────────────────────
     ctx = { kind: 'month', year, month(1~12), sites, focus: [에너지원] }  — 그 달: 에너지원 × 거점
         | { kind: 'year',  year, site, focus }                             — 그 해 한 거점: 월 × 에너지원
         | { kind: 'waste', year, site }                                    — 그 해 한 거점의 폐기물 봉투: 월 × 규격
     칸마다 저장된 값과 온실가스 환산값을 보여 주고, 고친 칸만 저장 (마감된 연도는 보기만) */
  let drillCtx = null, drillDirty = false, drillFrom = null;
  // 팝업은 보기 화면부터 (drillMode 'view') — 숫자 칸이나 '값 고치기'를 누르면 고치기 화면('edit') · drillAll = 입력 없는 항목도 펼쳐 봄
  //  drillPick = 좁은 화면에서 표에 보여 줄 열 하나 (그 달: 'sum' 합계 또는 거점 번호 · 그 해: 에너지원) — 다른 열은 숨길 뿐 그대로 있음
  let drillMode = 'view', drillAll = false, drillOpenEdit = false, drillPrev = null, drillPick = null;
  const drillLocked = () => !!drillCtx && (isClosed(String(drillCtx.year)) || !canEdit());   // 보기만: 마감 연도 · 모니터링 권한
  const drillEditing = () => !!drillCtx && !drillLocked() && drillMode === 'edit';
  const thisYM = () => { const d = new Date(); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}`; };
  const siteHd = s => `<span class="nm-l">${s}</span><span class="nm-s">${SITE_SHORT[s] || s}</span>`;   // 좁은 화면 = 짧은 이름
  const numHtml = v => { const [i, d] = fq(v).split('.'); return d ? `${i}<small>.${d}</small>` : i; };   // 큰 숫자: 소수 부분은 조금 작게
  const DRILL_TYPES = Object.keys(GHG);
  const drillTypes = sites => DRILL_TYPES.filter(t => sites.some(s => !itemNA(s, t)));
  const recsAt = (ym, site, t) => energyRecs.filter(r => r.date === ym && r.site === site && r.type === t);
  const typeHead = t => `<i class="mt-dot" style="background:${typeCol(t)}"></i>${t}`;
  const tdA = (cls, k) => `${cls ? ` class="${cls}"` : ''}${k != null ? ` data-k="${esc(k)}"` : ''}`;   // 칸 속성 (data-k = 좁은 화면에서 고르는 열)

  // 팝업 칸 숫자: 천 단위 쉼표 · 소수는 셋째 자리까지 (끝의 0은 뺌 · 합계와 같은 자릿수) — 고치지 않은 칸은 저장할 때 건드리지 않음
  const drNum = v => v.toLocaleString('ko-KR', { maximumFractionDigits: 3 });
  // 고치기 칸: 저장된 값(같은 칸에 여러 건이면 합계) — 환산값은 오른쪽 '온실가스' 열과 위 요약에 바로 계산
  function drInput(ym, site, t, cls = '', k = null) {
    if (itemNA(site, t)) return `<td${tdA(`dr-na ${cls}`.trim(), k)}>해당 없음</td>`;
    const rs = recsAt(ym, site, t), raw = rs.length ? +sumBy(rs, r => r.amount).toFixed(6) : null;
    const v = raw != null ? drNum(raw) : isNaCell(site, t, ym) ? '-' : '';
    return `<td${tdA(cls, k)}><input class="dr-in" type="text" inputmode="decimal" value="${v}" data-orig="${v}"${raw != null && String(raw) !== String(v).replace(/,/g, '') ? ` title="저장된 값 ${raw}"` : ''}` +
      ` data-ym="${ym}" data-site="${esc(site)}" data-t="${esc(t)}" placeholder="미입력" aria-label="${esc(`${+ym.slice(5)}월 ${site} ${t} (${GHG[t].unit})`)}"></td>`;
  }
  // 보기 칸: 저장된 값 한 줄 — 누르면 그 칸을 고치는 화면으로
  function drView(ym, site, t, cls = '', k = null) {
    if (itemNA(site, t)) return `<td${tdA(`dr-na ${cls}`.trim(), k)} title="이 거점은 해당 없는 항목 (데이터 관리 › 거점별 적용 항목)">해당 없음</td>`;
    const rs = recsAt(ym, site, t), raw = rs.length ? +sumBy(rs, r => r.amount).toFixed(6) : null;
    const none = isNaCell(site, t, ym) ? '해당없음' : ym > thisYM() ? '—' : '미입력';
    return `<td${tdA(`dr-cell ${cls}`.trim(), k)} data-ym="${ym}" data-site="${esc(site)}" data-t="${esc(t)}" data-v="${raw ?? ''}">` +
      (raw != null ? `<span class="dr-v">${fq(raw)}</span>` : `<span class="dr-v dr-empty">${none}</span>`) + '</td>';
  }
  // 그 달: 줄 = 에너지원 · 열 = 단위 | 거점별 사용량 | 합계 | 온실가스(tCO₂eq) — 거점별 온실가스는 위 요약 카드에
  //  보기 화면은 모든 거점에 값이 없는 에너지원을 접어 둠 (누른 에너지원은 늘 보임) · 좁은 화면은 열 하나(합계 또는 거점)만
  function drillMonthHtml(c, edit) {
    const ym = `${c.year}-${pad(c.month)}`, sites = c.sites, multi = sites.length > 1, focus = c.focus || [];
    const all = drillTypes(sites), has = t => focus.includes(t) || sites.some(s => !itemNA(s, t) && (recsAt(ym, s, t).length || isNaCell(s, t, ym)));
    const empty = new Set(all.some(has) ? all.filter(t => !has(t)) : []);
    const K = i => multi ? String(i) : null, gk = multi ? 'sum' : null;
    const head = `<tr><th class="dc-name">에너지원</th><th class="dc-unit">단위</th>` +
      sites.map((s, i) => `<th${tdA('dc-site', K(i))}>${multi ? siteHd(s) : '사용량'}</th>`).join('') +
      (multi ? `<th${tdA('dc-sum', 'sum')}>합계</th>` + sites.map((s, i) => `<th${tdA('dc-g dc-gsite', i)}>온실가스<small>tCO₂eq</small></th>`).join('') : '') +
      `<th${tdA('dc-g dc-gsum', gk)}>온실가스<small>tCO₂eq</small></th></tr>`;
    const body = all.map(t => { const rc = [focus.includes(t) && 'dr-focus', empty.has(t) && 'x-empty'].filter(Boolean).join(' ');
      return `<tr data-t="${esc(t)}"${rc ? ` class="${rc}"` : ''}><td class="dc-name" data-u="${esc(GHG[t].unit)}">${typeHead(t)}</td><td class="dc-unit">${GHG[t].unit}</td>` +
      sites.map((s, i) => edit ? drInput(ym, s, t, 'dc-site', K(i)) : drView(ym, s, t, 'dc-site', K(i))).join('') +
      (multi ? `<td${tdA('dc-sum', 'sum')} data-sum-t="${esc(t)}"></td>` + sites.map((s, i) => `<td${tdA('dc-g dc-gsite', i)} data-g-t="${esc(t)}" data-g-site="${esc(s)}"></td>`).join('') : '') +
      `<td${tdA('dc-g dc-gsum', gk)} data-g-t="${esc(t)}"></td></tr>`; }).join('');
    const picks = !multi ? null : [...(edit ? [] : [['sum', '합계']]), ...sites.map((s, i) => [String(i), SITE_SHORT[s] || s])];
    return { html: `<table class="dr-tbl dr-month ${edit ? 'edit' : 'view'}${drillAll ? ' all' : ''}${multi ? '' : ' one'}"><thead>${head}</thead><tbody>${body}</tbody></table>`, nEmpty: empty.size, picks, pickLabel: '보는 거점' };
  }
  // 그 해 한 거점: 줄 = 월 · 열 = 온실가스(막대 + 값) | 에너지원별 사용량 · 맨 아래 = 합계 · 온실가스 환산
  //  보기 화면은 한 해 내내 값이 없는 에너지원 열을 접어 둠 · 좁은 화면은 에너지원 하나만
  function drillYearHtml(c, edit) {
    const yr = String(c.year), focus = c.focus || [], fc = t => focus.includes(t) ? ' dr-fcol' : '';
    const all = drillTypes([c.site]), has = t => focus.includes(t) || energyRecs.some(r => r.site === c.site && r.type === t && r.date?.startsWith(yr));
    const empty = new Set(all.some(has) ? all.filter(t => !has(t)) : []), types = all, tc = t => `dc-t${fc(t)}${empty.has(t) ? ' x-empty' : ''}`;
    const head = '<tr><th class="dc-name">월</th><th class="dc-ghg">온실가스<small>tCO₂eq</small></th>' +
      types.map(t => `<th${tdA(tc(t), t)}>${typeHead(t)}<small>${GHG[t].unit}</small></th>`).join('') + '</tr>';
    const body = m12(i => { const ym = `${yr}-${pad(i + 1)}`;
      return `<tr><td class="dc-name">${i + 1}월</td><td class="dc-ghg" data-ghg-ym="${ym}"></td>` +
        types.map(t => edit ? drInput(ym, c.site, t, tc(t), t) : drView(ym, c.site, t, tc(t), t)).join('') + '</tr>'; }).join('');
    const foot = `<tr class="dr-tot"><td class="dc-name">합계</td><td class="dc-ghg" data-ghg-all></td>${types.map(t => `<td${tdA(tc(t), t)} data-sum-t="${esc(t)}"></td>`).join('')}</tr>` +
      `<tr class="dr-tot2"><td class="dc-name">온실가스<small>tCO₂eq</small></td><td class="dc-ghg"></td>${types.map(t => `<td${tdA(tc(t), t)} data-g-t="${esc(t)}"></td>`).join('')}</tr>`;
    return { html: `<table class="dr-tbl dr-year ${edit ? 'edit' : 'view'}${drillAll ? ' all' : ''}"><thead>${head}</thead><tbody>${body}</tbody><tfoot>${foot}</tfoot></table>`,
             nEmpty: empty.size, picks: types.length > 1 ? types.map(t => [t, t, empty.has(t)]) : null, pickLabel: '보는 항목' };
  }
  // 폐기물 보기 (그 해 한 거점): 달마다 산 봉투(규격 × 매수) · 발생량 · 배출량 (비고가 있으면 비고) — 고치기 화면 = 봉투 입력표 (월 × 규격)
  function wasteViewHtml(yr, si) {
    const noteCol = wasteRecs.some(r => r.site === si && r.date?.startsWith(yr) && r.note), span = noteCol ? 4 : 3;
    const bag = (sz, q, x = '×') => `<span>${+sz > 0 ? `${fmt(+sz, Number.isInteger(+sz) ? 0 : 1)}L ${x} ` : ''}${fmt(q, 0)}매</span>`;
    const tq = {}; let tk = 0, any = false;
    const body = m12(i => {
      const m = pad(i + 1), ym = `${yr}-${m}`, rs = wasteRecs.filter(r => r.date === ym && r.site === si);
      if (!rs.length) return `<tr data-month="${m}"><td class="dc-name">${i + 1}월</td><td class="dr-cell" colspan="${span}"><span class="dr-v dr-empty">` +
        `${isNaCell(si, '폐기물', ym) ? '해당없음' : ym > thisYM() ? '—' : '미입력'}</span></td></tr>`;
      any = true;
      const by = {}; rs.forEach(r => { by[+r.bagSize || 0] = (by[+r.bagSize || 0] || 0) + (+r.qty || 0); });
      Object.entries(by).forEach(([sz, q]) => { tq[sz] = (tq[sz] || 0) + q; });
      const kg = sumBy(rs, wKg); tk += kg;
      return `<tr data-month="${m}"><td class="dc-name">${i + 1}월</td>` +
        `<td class="dr-cell dr-bags">${Object.entries(by).sort((x, y) => x[0] - y[0]).map(([sz, q]) => bag(sz, q)).join('')}</td>` +
        `<td class="dr-cell"><span class="dr-v">${fq(kg)}</span></td><td class="dr-cell dc-wg"><span class="dr-v">${fq(wasteGhg(kg / 1000, si))}</span></td>` +
        (noteCol ? `<td class="dr-cell dr-note dc-wn">${esc(rs.map(r => r.note || '').find(Boolean) || '')}</td>` : '') + '</tr>';
    }).join('');
    return `<table class="dr-tbl dr-waste view"><thead><tr><th class="dc-name">월</th><th>산 봉투<small>규격 × 매수</small></th><th>발생량<small>kg</small></th><th class="dc-wg">배출량<small>tCO₂eq</small></th>${noteCol ? '<th class="dc-wn">비고</th>' : ''}</tr></thead>` +
      `<tbody>${body}</tbody>` + (any ? `<tfoot><tr class="dr-tot"><td class="dc-name">합계</td><td class="dr-bags">${Object.entries(tq).sort((x, y) => x[0] - y[0]).map(([sz, q]) => bag(sz, q, '')).join('')}</td>` +
        `<td><span class="dr-v">${fq(tk)}</span></td><td class="dc-wg"><span class="dr-v">${fq(wasteGhg(tk / 1000, si))}</span></td>${noteCol ? '<td class="dc-wn"></td>' : ''}</tr></tfoot>` : '') + '</table>';
  }
  // 전년 같은 칸(거점|에너지원|월)의 온실가스 — 요약의 전년 비교용 (팝업을 그릴 때 한 번 모아 둠)
  function drillPrevMap(c) {
    const py = String(c.year - 1), sites = c.kind === 'month' ? c.sites : [c.site], mm = c.kind === 'month' ? pad(c.month) : null, m = new Map();
    energyRecs.forEach(r => {
      if (!r.date?.startsWith(py) || !sites.includes(r.site) || !isEmit(r.type) || (mm && r.date.slice(5, 7) !== mm)) return;
      const k = `${r.site}|${r.type}|${r.date.slice(5, 7)}`; m.set(k, (m.get(k) || 0) + (+r.ghg || 0));
    });
    return m;
  }
  // 요약 카드: 이름 · 큰 숫자 · 단위 · 전년 대비 (+ 거점별 칸)
  const dsMain = (k, sub, v, unit, yo, cmp, none) => `<div class="ds-main"><div class="ds-k">${k}${sub ? `<small>${sub}</small>` : ''}</div><div class="ds-v">` +
    (v == null ? `<span class="ds-none">${none}</span>` : `<b>${numHtml(v)}</b><span class="ds-u">${unit}</span>${yo == null ? '' : `${yoyPill({ v: yo })}<span class="ds-cmp">${cmp}</span>`}`) + '</div></div>';
  // 폐기물 요약: 그 해 발생량 + 전년 같은 달들 대비 · 배출량
  function wasteSummary(yr, si) {
    const rs = wasteRecs.filter(r => r.date?.startsWith(yr) && r.site === si);
    if (!rs.length) return dsMain(`${yrShort(yr)} 폐기물 발생량`, '', null, '', null, '', '입력된 자료가 없어요');
    const kg = sumBy(rs, wKg), ms = new Set(rs.map(r => r.date.slice(5, 7)));
    const prs = wasteRecs.filter(r => r.date?.startsWith(String(+yr - 1)) && r.site === si && ms.has(r.date.slice(5, 7))), pkg = sumBy(prs, wKg);
    return dsMain(`${yrShort(yr)} 폐기물 발생량`, `${ms.size}개월`, kg / 1000, 'ton', prs.length && pkg > 0 ? (kg - pkg) / pkg * 100 : null, ms.size < 12 ? `전년 같은 ${ms.size}개월 대비` : '전년 대비') +
      `<div class="ds-sites"><div class="ds-site"><span>배출량 (Scope 3)</span><b>${fq(wasteGhg(kg / 1000, si))}<small>tCO₂eq</small></b></div></div>`;
  }
  // 값이 바뀔 때마다 (보기 화면은 그릴 때 한 번): 합계 · 온실가스 열 · 달마다 온실가스 · 요약 카드 · 바뀐 칸 표시
  function drillRecalc() {
    const body = $('drill-body'), c = drillCtx; if (!c) return;
    const edit = drillEditing();
    if (c.kind === 'waste') {
      if (edit) wasteGridRecalc(body.querySelector('table'));
      $('drill-sum').innerHTML = edit ? '' : wasteSummary(String(c.year), c.site);
      drillInfo(); return;
    }
    const cells = [...body.querySelectorAll('input.dr-in, td.dr-cell')], isIn = el => el.tagName === 'INPUT';
    const val = el => { if (isIn(el)) { const v = numIn(el.value); return isNaN(v) ? null : v; } return el.dataset.v === '' ? null : +el.dataset.v; };
    cells.forEach(el => {
      const v = val(el), t = el.dataset.t;
      if (isIn(el)) { el.classList.toggle('chg', el.value.trim() !== el.dataset.orig); return; }
      const w = v == null || !whoMap ? null : whoLatest('energy', energyAt(el.dataset.site, t, el.dataset.ym));
      el.title = v == null ? (drillLocked() ? '' : '누르면 입력') : `${fq(v)} ${GHG[t].unit}${co2Of(t, v) != null ? ` · ${co2Txt(t, v)}` : ''}${w ? `\n${whoTitle(w)}` : ''}${drillLocked() ? '' : `${w ? '\n' : ' · '}누르면 고치기`}`;
    });
    const xsOf = f => cells.filter(f).map(val).filter(v => v != null);
    const empty = '<span class="dr-v dr-empty">—</span>';
    // 사용량 합계 (그 달: 거점 합계 열 · 그 해: 합계 줄)
    body.querySelectorAll('[data-sum-t]').forEach(td => { const xs = xsOf(el => el.dataset.t === td.dataset.sumT); td.innerHTML = xs.length ? `<span class="dr-v">${fq(sumArr(xs))}</span>` : empty; });
    // 온실가스 환산 (에너지원별 · 거점별): 배출원 = tCO₂eq · 자가발전·회생제동 = 회피 배출량(초록) · 구매 = —
    body.querySelectorAll('[data-g-t]').forEach(td => {
      const t = td.dataset.gT, s = td.dataset.gSite, xs = xsOf(el => el.dataset.t === t && (!s || el.dataset.site === s)), g = xs.length ? co2Of(t, sumArr(xs)) : null;
      td.innerHTML = g == null ? empty : `<span class="dr-v${isAvoid(t) ? ' avoid' : ''}">${isAvoid(t) ? '회피 ' : ''}${fq(g)}</span>`;
    });
    const emOf = f => cells.filter(el => isEmit(el.dataset.t) && f(el) && val(el) != null), ghgOf = xs => sumBy(xs, el => calcGHG(el.dataset.t, val(el)));
    // 그 해: 달마다 온실가스 = 막대(가장 많은 달 대비) + 값
    const ymTd = [...body.querySelectorAll('[data-ghg-ym]')], ymV = ymTd.map(td => { const xs = emOf(el => el.dataset.ym === td.dataset.ghgYm); return xs.length ? ghgOf(xs) : null; });
    const ymMax = Math.max(1e-9, ...ymV.filter(v => v != null));
    ymTd.forEach((td, i) => { td.innerHTML = ymV[i] == null ? empty
      : `<span class="dr-mb"><span class="dr-mbar"><i style="width:${(ymV[i] / ymMax * 100).toFixed(1)}%"></i></span><span class="dr-v">${fq(ymV[i])}</span></span>`; });
    const em = emOf(() => true), tot = ghgOf(em);
    body.querySelectorAll('[data-ghg-all]').forEach(td => { td.innerHTML = em.length ? `<span class="dr-v">${fq(tot)}</span>` : empty; });
    // 요약 카드: 온실가스 합계 + 전년 같은 칸(거점·에너지원·달)끼리 비교 · 세 거점이면 거점별
    let cc = 0, pp = 0;
    em.forEach(el => { const k = `${el.dataset.site}|${el.dataset.t}|${el.dataset.ym.slice(5, 7)}`;
      if (drillPrev?.has(k)) { cc += calcGHG(el.dataset.t, val(el)); pp += drillPrev.get(k); } });
    const nm = new Set(em.map(el => el.dataset.ym)).size, curYr = new Date().getFullYear();
    const k = c.kind === 'month' ? `${c.month}월 온실가스 배출` : `${yrShort(c.year)} ${c.year === curYr ? '누적' : '연간'} 온실가스 배출`;
    const cmp = c.kind === 'month' ? '전년 같은 달 대비' : nm < 12 ? `전년 같은 ${nm}개월 대비` : '전년 대비';
    const fut = c.kind === 'month' && `${c.year}-${pad(c.month)}` > thisYM();
    const sitesHtml = c.kind !== 'month' || c.sites.length < 2 ? '' : '<div class="ds-sites">' + c.sites.map(s => {
      const xs = emOf(el => el.dataset.site === s);
      return `<div class="ds-site${xs.length ? '' : fut ? ' none fut' : ' none'}"><span><i class="sb-dot" style="background:${SITE_COL[s]}"></i>${siteHd(s)}</span>` +
        `<b>${xs.length ? `${fq(ghgOf(xs))}<small>t</small>` : fut ? '—' : '미입력'}</b></div>`; }).join('') + '</div>';
    $('drill-sum').innerHTML = dsMain(k, 'Scope 1+2', em.length ? tot : null, 'tCO₂eq', pp > 0 ? (cc - pp) / pp * 100 : null, cmp,
      edit ? '칸에 사용량을 넣으면 바로 계산돼요' : '입력된 자료가 없어요') + sitesHtml;
    drillInfo();
  }
  // 아래쪽 안내: 마감 연도 / 보기 화면 / 바뀐 칸 수
  function drillInfo() {
    const yr = String(drillCtx?.year ?? ''), box = $('drill-info');
    if (isClosed(yr)) { box.innerHTML = `<span class="lock-note">${esc(lockMsg(yr))}</span>`; return; }
    if (!canEdit()) { box.textContent = viewOnlyMsg(); return; }
    if (!drillEditing()) { box.textContent = '숫자를 누르면 그 칸을 바로 고칠 수 있어요'; return; }
    const n = $('drill-body').querySelectorAll('input.chg').length;
    box.innerHTML = n ? `<span class="di-chg">바뀐 칸 ${n}개</span>저장하면 그래프·표에 바로 반영돼요` : "칸을 비우면 저장된 값을 지워요 · 자료가 없는 달은 '-'";
  }
  // 좁은 화면: 고른 열(data-k)만 보이게 — 칸은 모두 남아 있어 고친 값도 그대로
  function drillApplyPick() {
    const k = drillPick;
    $('drill-body').querySelectorAll('[data-k]').forEach(el => el.classList.toggle('m-off', k != null && el.dataset.k !== k));
    $('drill-pick').querySelectorAll('button[data-pick]').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.pick === k)));
  }
  // 좁은 화면 열 고르기: 고를 수 있는 열 [키, 이름, 빈 항목] · 지금 보이는 열인지 · 기본 열 (그 달 = 합계·첫 거점 · 그 해 = 누른 에너지원 → 첫 열)
  let drillPickList = [], drillNEmpty = 0;
  const drillPickOk = k => drillPickList.some(([kk, , e]) => kk === k && (drillAll || !e));
  const drillPickDefault = () => { const ok = drillPickList.filter(([k]) => drillPickOk(k)).map(([k]) => k);
    return !ok.length ? null : drillCtx?.kind === 'year' ? (ok.find(k => (drillCtx.focus || []).includes(k)) || ok[0]) : ok[0]; };
  // 입력 없는 항목 접기/펼치기 버튼 — 표를 다시 그리지 않고 class만 바꿔 고친 값이 그대로 남음
  const drillMoreBtn = () => { $('drill-more').innerHTML = !drillNEmpty ? ''
    : `<button type="button" id="drill-all" aria-expanded="${drillAll}">${drillAll ? '− 입력 없는 항목 접기' : `＋ 입력 없는 항목 ${drillNEmpty}개 보기`}</button>`; };
  function renderDrill() {
    const c = drillCtx; if (!c) return;
    const yr = String(c.year), locked = drillLocked(), edit = drillEditing(), now = new Date(), curYr = now.getFullYear();
    const minY = Math.min(curYr - 1, ...pastYears().map(Number));
    const badges = [];
    let title, tools;
    if (c.kind === 'month') {
      const idx = c.year * 12 + c.month - 1, lab = k => { const d = new Date(c.year, c.month - 1 + k, 1); return `${d.getFullYear() === c.year ? '' : `${String(d.getFullYear()).slice(2)}년 `}${d.getMonth() + 1}월`; };
      title = `${c.year}년 ${c.month}월 에너지 사용량`;
      badges.push(['', c.sites.length > 1 ? '세 거점' : c.sites[0]]);
      if (idx > curYr * 12 + now.getMonth()) badges.push(['b-pred', '아직 오지 않은 달 · 그래프 값은 예측']);
      tools = `<div class="drill-nav" role="group" aria-label="달 이동"><button type="button" data-nav="-1"${idx <= minY * 12 ? ' disabled' : ''}>◀ ${lab(-1)}</button>` +
        `<button type="button" data-nav="1"${idx >= curYr * 12 + 11 ? ' disabled' : ''}>${lab(1)} ▶</button></div>`;
    } else {
      title = `${c.year}년 ${c.site}`;   // 무엇을 보는지는 배지로 (제목이 한 줄에 들어가게)
      badges.push(['', c.kind === 'waste' ? '폐기물 · 종량제 봉투' : '월별 에너지 사용량']);
      const sites = SITES.filter(s => c.kind === 'waste' || drillTypes([s]).length);
      tools = `<div class="drill-nav" role="group" aria-label="연도 이동"><button type="button" data-nav="-1"${c.year <= minY ? ' disabled' : ''}>◀ ${yrShort(c.year - 1)}</button>` +
        `<button type="button" data-nav="1"${c.year >= curYr ? ' disabled' : ''}>${yrShort(c.year + 1)} ▶</button></div>` +
        `<div class="drill-sites" role="group" aria-label="거점">${sites.map(s => `<button type="button" data-site="${esc(s)}" aria-pressed="${s === c.site}">${siteHd(s)}</button>`).join('')}</div>`;
    }
    if (isClosed(yr)) badges.push(['b-lock', icn('lock') + ' 마감 · 보기만']);
    $('drill-title').textContent = title;
    $('drill-badges').innerHTML = badges.map(([cls, t]) => `<span${cls ? ` class="${cls}"` : ''}>${esc(t)}</span>`).join('');
    $('drill-tools').innerHTML = tools;
    drillPrev = c.kind === 'waste' ? null : drillPrevMap(c);
    let r = { nEmpty: 0, picks: null };
    if (c.kind === 'waste') {
      if (edit) { const g = wasteGridParts(yr, c.site, false);
        $('drill-body').innerHTML = `<table class="mtbl wgrid" data-ncol="${g.ncol}"><thead>${g.head}</thead><tbody>${g.body}</tbody><tfoot></tfoot></table>`; }
      else $('drill-body').innerHTML = wasteViewHtml(yr, c.site);
    } else { r = c.kind === 'month' ? drillMonthHtml(c, edit) : drillYearHtml(c, edit); $('drill-body').innerHTML = r.html; }
    $('drill-body').querySelector('.dr-tbl.view')?.classList.toggle('locked', locked);
    // 좁은 화면에서 볼 열: 그 달 = 합계(고치기 화면은 첫 거점) · 그 해 = 누른 에너지원 (없으면 첫 열)
    drillPickList = r.picks || []; drillNEmpty = r.nEmpty;
    drillPick = drillPickOk(drillPick) ? drillPick : drillPickDefault();
    $('drill-pick').innerHTML = !drillPickList.length ? '' : `<span class="dp-k">${r.pickLabel}</span><div class="dp-seg" role="group" aria-label="${r.pickLabel}">` +
      drillPickList.map(([k, l, e]) => `<button type="button" data-pick="${esc(k)}"${e ? ' class="x-empty"' : ''} aria-pressed="${k === drillPick}">${esc(l)}</button>`).join('') + '</div>';
    $('drill-pick').classList.toggle('all', drillAll);
    drillApplyPick();
    drillMoreBtn();
    $('drill-note').textContent = c.kind === 'waste' ? '발생량 = 봉투 용량(L) × 매수 × 0.174 kg/L · 배출량 = 발생량(t) × 사업장별 유효계수(대구 0.477 · 제주 1.138 · 서울 미산정)'
      : c.kind === 'month' ? '' : '온실가스 = 그 달 Scope 1+2 합계 · 막대 = 가장 많은 달 대비';
    $('drill-save').hidden = !edit;
    $('drill-edit').hidden = locked || edit;
    $('drill-cancel').textContent = edit ? '취소' : '닫기';
    const box = document.querySelector('#drill .drill-box'), w = c.kind === 'month' ? (c.sites.length > 1 ? 'm' : 's') : c.kind === 'waste' && !edit ? 's' : 'l';
    box.dataset.w = w;
    box.querySelector('.drill-hdr').classList.toggle('tools-row', c.kind !== 'month' && w === 's');
    drillRecalc();
  }
  // 고칠 수 있는 기간인데 입력된 자료가 하나도 없으면 바로 고치기 화면으로 (아직 오지 않은 달은 보기)
  const drillHasData = c => c.kind === 'waste' ? wasteRecs.some(r => r.site === c.site && r.date?.startsWith(String(c.year)))
    : c.kind === 'month' ? energyRecs.some(r => r.date === `${c.year}-${pad(c.month)}` && c.sites.includes(r.site))
    : energyRecs.some(r => r.site === c.site && r.date?.startsWith(String(c.year)));
  function openDrill(ctx) {
    if (!ctx || !ctx.year) return;
    drillFrom = document.activeElement;
    drillCtx = { ...ctx, year: +ctx.year };
    drillDirty = false; drillAll = false; drillPick = null;
    const future = drillCtx.kind === 'month' && `${drillCtx.year}-${pad(drillCtx.month)}` > thisYM();
    drillMode = !drillLocked() && (ctx.edit || (!future && !drillHasData(drillCtx))) ? 'edit' : 'view';
    drillOpenEdit = drillMode === 'edit';
    renderDrill();
    $('drill').style.display = 'flex';
    document.querySelector('#drill .drill-box').scrollTop = 0;   // 늘 제목·요약부터 보이게
    drillFocus();
  }
  // 고치기 화면: 누른 칸(마우스로 쓸 때는 강조된 칸, 없으면 보이는 첫 칸)에 커서 · 보기 화면: '값 고치기' 버튼 (마감 연도면 닫기)
  function drillFocus(target) {
    if (drillEditing()) {
      const vis = i => !i.disabled && !i.closest('.m-off');
      const ins = [...$('drill-body').querySelectorAll('input')].filter(vis);
      const f = target || (matchMedia('(pointer: fine)').matches &&
        (ins.find(i => i.closest('tr.dr-focus, td.dr-fcol')) || ins[0]));
      if (f) { f.focus(); if (target) f.select?.(); return; }
    }
    ($('drill-edit').hidden ? $('drill-x') : $('drill-edit')).focus({ preventScroll: true });   // 맨 아래 버튼으로 내려가지 않게
  }
  // 보기 → 고치기 (at = 누른 칸: 에너지 { ym, site, t } · 폐기물 { month }) — 좁은 화면이면 누른 칸의 열을 보여 줌
  function drillEnterEdit(at) {
    const c = drillCtx;
    if (!c || drillLocked()) return;
    drillMode = 'edit'; drillOpenEdit = false; drillDirty = false;
    if (at?.t) drillPick = c.kind === 'month' ? (c.sites.length > 1 ? String(c.sites.indexOf(at.site)) : null) : at.t;   // 누른 칸은 늘 값이 있는 항목
    else if (c.kind === 'month' && drillPick === 'sum') drillPick = null;   // 합계 열은 고칠 수 없으니 첫 거점으로
    renderDrill();
    if (!at) document.querySelector('#drill .drill-box').scrollTop = 0;   // '값 고치기' 버튼으로 들어오면 맨 위(요약·첫 칸)부터
    const body = $('drill-body');
    const t = at?.t ? body.querySelector(`input.dr-in[data-ym="${at.ym}"][data-site="${CSS.escape(at.site)}"][data-t="${CSS.escape(at.t)}"]`)
      : at?.month ? body.querySelector(`tr[data-month="${at.month}"] input.wq`) : null;
    drillFocus(t);
  }
  const drillUnsaved = () => drillDirty && !!$('drill-body').querySelector('input.chg');
  async function closeDrill(force = false) {
    if (!force && drillUnsaved() &&
        !(await confirmBox('저장하지 않은 값이 있어요. 닫을까요?', '닫기', '닫으면 이 창에서 고친 값은 사라져요.', 'primary'))) return;
    $('drill').style.display = 'none'; drillCtx = null; drillDirty = false; drillMode = 'view'; drillAll = false; drillPick = null;
    if (drillFrom && document.contains(drillFrom)) drillFrom.focus?.();
  }
  // 바꾼 에너지 칸 저장 → { n, d } | false
  async function saveDrillEnergy() {
    const ins = [...$('drill-body').querySelectorAll('input.dr-in')].filter(i => i.value.trim() !== i.dataset.orig);
    if (!ins.length) { showToast('바뀐 값이 없습니다', 'err'); return false; }
    const posts = [], patches = [], dels = [], bad = [], cleared = [], naAdd = [], naDel = [], badEls = [];
    ins.forEach(i => {
      const { ym, site, t } = i.dataset, raw = i.value.trim(), rs = recsAt(ym, site, t), f = GHG[t], label = `${+ym.slice(5)}월 ${site} ${t}`, key = naKey(site, t, ym);
      if (raw === '' || isDash(raw)) {   // 빈칸 = 누락 · '-' = 해당없음
        if (rs.length) { dels.push(...rs); cleared.push(label); }
        (raw === '' ? naDel : naAdd).push(key); return;
      }
      naDel.push(key);
      const a = numIn(raw);
      if (isNaN(a)) { bad.push(label); badEls.push(i); return; }
      const d = { amount: a, unit: f.unit, scope: f.scope, ghg: calcGHG(t, a) };
      if (rs.length) { patches.push([rs[0].id, d]); dels.push(...rs.slice(1)); }   // 같은 칸에 여러 건이면 하나로
      else posts.push({ date: ym, site, type: t, note: '', ...d });
    });
    if (bad.length) { fieldErr($('drill-save'), badEls, `${listShort(bad, 3)}: 0 이상의 숫자로 입력하세요 (자료가 없으면 -)`); return false; }
    const na = naDiff(naAdd, naDel);
    if (na.add.length && !v2) { showToast(NA_V2_MSG, 'err'); return false; }
    if (cleared.length && !(await confirmBox(`${listShort(cleared)}은 칸이 비었거나 '-'라서 저장된 값을 삭제합니다.`, '삭제하고 저장'))) return false;
    for (const r of dels) await sb('DELETE', 'energy', `?id=eq.${r.id}`);
    for (const [id, d] of patches) await sb('PATCH', 'energy', `?id=eq.${id}`, d);
    if (posts.length) await sb('POST', 'energy', '', posts, 'return=minimal');
    await saveNa(na);
    return { n: posts.length + patches.length + na.add.length, d: cleared.length };
  }
  $('drill-body').addEventListener('input', () => { drillDirty = true; drillRecalc(); });
  $('drill-body').addEventListener('click', e => {
    if (e.target.closest('.wg-add')) { drillDirty = true; wasteGridAddCol($('drill-body').querySelector('table')); drillInfo(); return; }   // 봉투 + 규격
    // 보기 화면: 숫자 칸을 누르면 그 칸을 고치는 화면으로 (글자를 드래그해 고르는 중이면 그대로)
    if (drillEditing() || drillLocked() || String(window.getSelection?.() || '')) return;
    const td = e.target.closest('td.dr-cell'); if (!td) return;
    drillEnterEdit(td.dataset.t ? { ym: td.dataset.ym, site: td.dataset.site, t: td.dataset.t } : { month: td.closest('tr[data-month]')?.dataset.month });
  });
  $('drill-edit').addEventListener('click', () => drillEnterEdit());
  $('drill-more').addEventListener('click', e => {
    if (!e.target.closest('#drill-all')) return;
    drillAll = !drillAll;
    $('drill-body').querySelector('.dr-tbl')?.classList.toggle('all', drillAll);
    $('drill-pick').classList.toggle('all', drillAll);
    if (!drillPickOk(drillPick)) drillPick = drillPickDefault();
    drillApplyPick(); drillMoreBtn(); $('drill-all')?.focus();
  });
  $('drill-pick').addEventListener('click', e => { const b = e.target.closest('button[data-pick]'); if (!b) return; drillPick = b.dataset.pick; drillApplyPick(); });
  $('drill-save').addEventListener('click', async () => {
    const c = drillCtx; if (!c) return;
    if (isClosed(String(c.year))) { showToast(lockMsg(String(c.year)), 'err'); return; }
    const btn = $('drill-save'); setBusy(btn, true);
    let res;
    try { res = c.kind === 'waste' ? await saveWasteGrid($('drill-body').querySelector('table'), String(c.year), c.site) : await saveDrillEnergy(); }
    catch (e) { setBusy(btn, false); btn.disabled = false; saveFailed(e, '저장', () => { if (drillCtx) renderDrill(); }); return; }
    setBusy(btn, false); btn.disabled = false;
    if (!res) return;
    await closeDrill(true);
    try { await refresh(); } catch (e) { console.warn('[저장 후 새로고침 실패]', e); }
    showToast(`✅ ${res.n}칸 저장${res.d ? ` · ${res.d}칸 삭제` : ''} 완료`);
  });
  $('drill-tools').addEventListener('click', async e => {
    const b = e.target.closest('button[data-nav],button[data-site]'), c = drillCtx;
    if (!b || !c || b.disabled || b.getAttribute('aria-pressed') === 'true') return;
    if (drillUnsaved() && !(await confirmBox('저장하지 않은 값이 있어요. 이동할까요?', '이동', '이동하면 이 창에서 고친 값은 사라져요.', 'primary'))) return;
    if (b.dataset.site) c.site = b.dataset.site;
    else if (c.kind === 'month') { const d = new Date(c.year, c.month - 1 + +b.dataset.nav, 1); c.year = d.getFullYear(); c.month = d.getMonth() + 1; }
    else c.year += +b.dataset.nav;
    drillDirty = false; renderDrill();
    document.querySelector('#drill .drill-box').scrollTop = 0;
  });
  $('drill-x').addEventListener('click', () => closeDrill());
  // 닫기(보기 화면) · 취소(고치기 화면 → 보기로, 처음부터 고치기로 열었으면 닫기)
  $('drill-cancel').addEventListener('click', async () => {
    if (!drillEditing() || drillOpenEdit) return closeDrill();
    if (drillUnsaved() && !(await confirmBox('고친 값을 저장하지 않고 보기로 돌아갈까요?', '돌아가기', '이 창에서 고친 값은 사라져요.', 'primary'))) return;
    drillMode = 'view'; drillDirty = false; renderDrill(); drillFocus();
  });
  $('drill').addEventListener('click', e => { if (e.target === $('drill')) closeDrill(); });
  document.addEventListener('keydown', e => { if (e.key === 'Escape' && drillCtx && !document.querySelector('[role="dialog"] .cb-ok')) closeDrill(); });

  // 그래프를 누르면 그 자료 팝업 — 차트마다 '누른 곳 → 무엇을 열지' (그림 영역 안을 눌렀을 때만)
  function attachDrills() {
    const inArea = (c, e) => { const a = c.chartArea; return a && e.x >= a.left && e.x <= a.right && e.y >= a.top && e.y <= a.bottom; };
    const hitDs = (c, e) => c.getElementsAtEventForMode(e, 'nearest', { intersect: true }, false)[0];   // 정확히 누른 점·막대
    const on = (c, f) => {
      if (!c) return;
      c.options.onHover = (e, els) => { c.canvas.style.cursor = els.length && inArea(c, e) && f(els[0].index, e, c) ? 'pointer' : ''; };
      c.options.onClick = (e, els) => { if (!els.length || !inArea(c, e)) return; const ctx = f(els[0].index, e, c);
        if (ctx?.pop) showCalc(ctx.pop(), ''); else if (ctx) openDrill(ctx); };   // pop = 계산 근거 팝업 (목표·로드맵의 올해·전망 막대)
    };
    const viewSites = () => curSite ? [curSite] : SITES, curYr = () => new Date().getFullYear();
    const yearAt = (c, i) => 2000 + parseInt(c.data.labels[i]);            // 'yy년' 눈금 → 연도
    const dsAt = (c, e) => { const h = hitDs(c, e); return h ? c.data.datasets[h.datasetIndex] : null; };
    const yearCtx = (y, site, focus = []) => y && y <= curYr() ? { kind: 'year', year: y, site, focus } : null;
    // 목표·로드맵: 지난 해 = 그 해 월별 자료 · 올해(연말 예측)·27~30년(전망, 2030 중기 그래프) = 어떻게 계산했는지 팝업
    const rmPick = (kind, c, y, past) => y < curYr() ? past : y <= OUTLOOK.to ? { pop: () => rmYearPop(kind, y) } : null;
    const ghgYear = (i, e, c) => { const y = yearAt(c, i); return rmPick('ghg', c, y, yearCtx(y, '대구본원')); };
    const reYear  = (i, e, c) => { const y = yearAt(c, i); return rmPick('re', c, y, yearCtx(y, rmapSite(), ['전력', RE_SELF, RE_BUY])); };
    ['', 'y-'].forEach(P => {
      const s = CHARTS[P] || {};
      const month = (i, e, c) => { const t = dsAt(c, e)?.$type; return { kind: 'month', year: yvYear[P], month: i + 1, sites: viewSites(), focus: t ? [t] : [] }; };
      [s.fuel, s.ghg].forEach(c => on(c, month));
      (s.em || []).forEach((c, k) => on(c, i => ({ kind: 'month', year: yvYear[P], month: i + 1, sites: viewSites(), focus: [ETYPES[k]] })));   // 그 에너지원 줄을 강조
      on(s.regen, i => ({ kind: 'month', year: yvYear[P], month: i + 1, sites: ['대구본원'], focus: [SAVE_REGEN] }));   // 누르면 그 달 자료
      on(s.ws, (i, e, c) => ({ kind: 'waste', year: yvYear[P], site: curSite || dsAt(c, e)?.$site || '대구본원' }));   // 누르면 그 거점의 봉투 입력표
    });
    const h = CHARTS.h || {}, o = CHARTS.o || {};
    [h.path, h.path50, o.ghg, o.src].forEach(c => on(c, ghgYear));
    [h.re, h.re50, o.re].forEach(c => on(c, reYear));
    on(h.energy, (i, e, c) => { const ds = dsAt(c, e) || c.data.datasets.find(d => d.$year === +histYear) || c.data.datasets[c.data.datasets.length - 1];
      const t = $('h-cmp-etype').value;
      return t === WATER || !ds ? null : { kind: 'month', year: ds.$year, month: i + 1, sites: viewSites(), focus: GHG[t] ? [t] : [] }; });
    on(h.scope, (i, e, c) => yearCtx(yearAt(c, i), dsAt(c, e)?.$site || curSite || '대구본원'));   // 거점별로 쌓았으면 누른 거점
    on(h.wrm, (i, e, c) => { const y = yearAt(c, i); return y <= curYr() ? { kind: 'waste', year: y, site: dsAt(c, e)?.$site || rmapSite() } : null; });   // 누른 거점 막대의 봉투 입력표
  }

  /* ── CSV 내보내기 버튼 ───────────────────────────────── */
  $('btn-export').addEventListener('click', exportCSV);

  /* ── 자동 새로고침 (60초) ───────────────────────────── */
  let autoTimer = null;
  function startAutoRefresh() {
    if (autoTimer) return; // 중복 실행 방지
    autoTimer = setInterval(() => syncRole().then(ok => ok && refresh({ auto: true }).then(() => { if (isAdmin()) loadUsers(true); }))
      .catch(e => { console.warn('[자동 새로고침 실패]', e); netDown(e); }), 60000);
  }
  function stopAutoRefresh() { clearInterval(autoTimer); autoTimer = null; }
  // 관리자가 내 권한을 바꾸면 1분 안에 반영 — 권한이 없어져도 보기는 그대로 (DB는 바뀐 즉시 막음)
  async function syncRole() {
    if (!session) return true;   // 로그인하지 않음 = 보기만 (바뀔 권한 없음)
    const m = await loadMe(), before = me?.role;
    me = m; applyRole();
    if (m.role !== before) {
      if (m.role) showToast(`${icn('key')} 권한이 ${ROLE_NAME[m.role]}${m.role === 'admin' ? '로' : '으로'} 바뀌었어요`);
      else { closeOverlays(); showToast('입력·수정 권한이 없어졌어요 · 이제 보기만 할 수 있어요', 'err'); }
    }
    return true;
  }
  // 로그인이 끝나거나 권한이 없어질 때: 떠 있는 팝업·창 닫기 (저장 전 값은 버림)
  function closeOverlays() {
    if ($('drill').style.display !== 'none') closeDrill(true);
    ['modal', 'pw-modal', 'calc'].forEach(id => { $(id).style.display = 'none'; });
    $('user-pop').hidden = true;
  }

  /* ── 화면 전환: 로그인 · 승인 대기 · 앱 ───────────────── */
  const SCREENS = ['loading', 'db-unavail', 'auth', 'auth-wait', 'app'];
  function showScreen(id) {
    SCREENS.forEach(k => {
      const el = $(k), on = k === id;
      if (k === 'auth' || k === 'auth-wait') el.hidden = !on;
      else el.style.display = on ? (k === 'loading' ? 'flex' : 'block') : 'none';
    });
  }
  // 로그인 화면 (tab = 'login' | 'signup' · msg = 위에 보여 줄 안내)
  function showAuth(tab = 'login', msg = '') {
    showScreen('auth');
    setAuthTab(tab);
    $(tab === 'signup' ? 'su-err' : 'li-err').textContent = msg;
    setTimeout(() => $(tab === 'signup' ? 'su-name' : 'li-email').focus(), 0);
  }
  function setAuthTab(tab) {
    ['login', 'signup'].forEach(t => { $(`at-${t}`).setAttribute('aria-selected', String(t === tab)); $(`f-${t}`).hidden = t !== tab; });
    $('li-err').textContent = ''; $('su-err').textContent = '';
  }
  // DB 설정 안내 화면 (로그인했는데 사용자·권한 표가 아직 없을 때) — 승인 대기·권한 없음은 보기 전용 + 안내 띠
  function showWait(kind) {
    const who = me ? `${me.name ? `${esc(me.name)} · ` : ''}${esc(me.email)}${me.dept ? ` · ${esc(me.dept)}` : ''}` : esc(session?.user?.email || '');
    const W = {
      setup: [icn('sliders'), 'DB 권한 설정이 필요해요', '로그인은 됐지만 DB에 사용자·권한 표가 아직 없어요. 관리자가 아래를 한 번 실행하면 돼요.' +
        '<ol><li>supabase/auth_roles.sql 맨 위의 첫 관리자 이메일을 바꾸기</li><li>Supabase 대시보드 → SQL Editor → New query → 붙여넣기 → Run</li><li>여기서 <b>다시 확인</b></li></ol>'],
    }[kind];
    $('wait-ico').innerHTML = W[0]; $('wait-title').textContent = W[1]; $('wait-msg').innerHTML = W[2];
    $('wait-who').innerHTML = who;
    showScreen('auth-wait');
  }
  // 내 권한 (app_users의 내 줄) — 표가 없으면 오류(isMissingTable)를 그대로 던짐
  async function loadMe() {
    const rows = await sb('GET', 'app_users', `?user_id=eq.${encodeURIComponent(session.user.id)}&select=*`);
    return rows[0] || { user_id: session.user.id, email: session.user.email, role: null };
  }

  /* ── 시작: (로그인했으면 내 권한) → 데이터 ('DB 연결 실패'와 '화면 오류'를 구분)
     로그인하지 않았으면 보기 전용으로 바로 · 승인 대기·권한 없음도 보기는 됨 ── */
  async function boot() {
    showScreen('loading');
    const hadSession = !!(session = loadSession());
    me = null;
    if (session) {
      try { me = await loadMe(); }
      catch (e) {
        if (isMissingTable(e)) { showWait('setup'); return; }   // auth_roles.sql 실행 전
        if (e.status === 401 || (!e.network && !session)) { onSessionLost(); return; }   // 로그인이 끝남 → 로그인 화면
        console.error('[DB 연결 실패]', e); showScreen('db-unavail'); return;
      }
    }
    applyRole();
    try {
      await loadAll();
      lastLoadAt = Date.now();
    } catch (e) {
      console.error('[DB 연결 실패]', e);
      if (hadSession && !session) return;   // 로그인이 끝나 로그인 화면으로 감
      // DB 규칙이 로그인한 사람만 보게 돼 있으면 (예전 auth_roles.sql) → 로그인 화면
      if (!session && (e.status === 401 || e.code === '42501')) { showAuth('login', '지금은 로그인해야 볼 수 있어요 · 로그인해 주세요'); return; }
      showScreen('db-unavail');
      return;
    }
    showScreen('app');
    if (!CHARTS.h?.energy) {
      try { buildCharts(); }
      catch (e) { console.error('[차트 생성 실패]', e); showToast('차트를 불러오지 못했습니다. 네트워크를 확인해 주세요', 'err'); }
    }
    renderAll({ force: true });
    if (isAdmin()) loadUsers(true);
    startAutoRefresh();
  }

  /* ── 권한에 맞게 화면 맞추기 ─────────────────────────────
     body[data-role] → CSS가 data-need="edit"(입력·수정·관리자) · data-need="admin"(관리자) 요소를 숨김
     지금 보고 있는 탭·서브탭이 숨겨지면 보이는 곳으로 */
  function applyRole() {
    document.body.dataset.role = me?.role || '';
    const nm = me?.name || (me?.email || '').split('@')[0];
    const lbl = !me ? '' : ROLE_NAME[me.role] || (me.approved_by ? '권한 없음' : '승인 대기');
    $('user-menu').hidden = !session || !me;
    $('btn-login').hidden = !!session;   // 로그인하지 않았으면 '로그인' (보기는 그대로)
    $('uc-name').textContent = nm; $('uc-role').textContent = lbl;
    $('up-name').textContent = nm; $('up-email').textContent = me?.email || ''; $('up-role').textContent = `권한: ${lbl || '없음'}${me?.dept ? ` · ${me.dept}` : ''}`;
    if (!isAdmin()) $('uc-dot').hidden = true;   // 승인 대기 알림 점은 관리자만
    // 로그인했지만 보기만 하는 이유 (승인 대기 · 권한 없음)
    const note = !me || me.role ? '' : !me.approved_by
      ? icn('clock') + ' <b>가입 승인 대기 중</b>이에요 · 관리자가 권한을 주면 1분 안에 입력·수정할 수 있어요 (지금은 보기만)'
      : icn('lock') + ' 이 계정은 <b>입력·수정 권한이 없어요</b> · 필요하면 관리자에게 요청하세요 (지금은 보기만)';
    $('role-note').innerHTML = note; $('role-note').hidden = !note;
    const act = document.querySelector('.tab-btn.active');
    if (act && !needOk(act)) document.querySelector('.tab-btn[data-tab="dashboard"]').click();
    document.querySelectorAll('.subtab-nav').forEach(nav => {
      const a = nav.querySelector('.subtab-btn.active');
      if (a && !needOk(a)) nav.querySelector('.subtab-btn:not([data-need])')?.click();
    });
    if (!isAdmin()) { $('log-table').querySelector('option[value="app_users"]').disabled = true; if ($('log-table').value === 'app_users') $('log-table').value = ''; }
    else $('log-table').querySelector('option[value="app_users"]').disabled = false;
  }

  /* ── 로그인 · 회원가입 · 로그아웃 · 비밀번호 ───────────── */
  $('auth-logo').src = document.querySelector('.loading-mascot')?.src || document.querySelector('#loading img')?.src || '';
  $('at-login').addEventListener('click', () => setAuthTab('login'));
  $('at-signup').addEventListener('click', () => setAuthTab('signup'));
  document.querySelectorAll('[data-auth-tab]').forEach(a => a.addEventListener('click', e => { e.preventDefault(); setAuthTab(a.dataset.authTab); $('su-name').focus(); }));
  const busy = (btn, on, label) => { const b = $(btn); b.disabled = on; if (label) b.textContent = label; };
  const emailOk = v => /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(v);
  $('f-login').addEventListener('submit', async e => {
    e.preventDefault();
    const email = $('li-email').value.trim().toLowerCase(), pw = $('li-pw').value;
    if (!emailOk(email)) { $('li-err').textContent = '이메일 주소를 확인해 주세요'; $('li-email').focus(); return; }
    if (!pw) { $('li-err').textContent = '비밀번호를 넣어 주세요'; $('li-pw').focus(); return; }
    busy('li-btn', true, '로그인 중…'); $('li-err').textContent = '';
    try {
      saveSession(toSession(await authApi('token?grant_type=password', { email, password: pw })));
      $('li-pw').value = '';
      await boot();
    } catch (err) { $('li-err').textContent = err.message; }
    finally { busy('li-btn', false, '로그인'); }
  });
  $('f-signup').addEventListener('submit', async e => {
    e.preventDefault();
    const name = $('su-name').value.trim(), dept = $('su-dept').value.trim(), email = $('su-email').value.trim().toLowerCase(), pw = $('su-pw').value;
    const bad = !name ? ['su-name', '이름을 넣어 주세요'] : !emailOk(email) ? ['su-email', '이메일 주소를 확인해 주세요']
      : pw.length < 8 ? ['su-pw', '비밀번호는 8자 이상으로 해 주세요'] : pw !== $('su-pw2').value ? ['su-pw2', '비밀번호 확인이 달라요'] : null;
    if (bad) { $('su-err').textContent = bad[1]; $(bad[0]).focus(); return; }
    busy('su-btn', true, '가입 신청 중…'); $('su-err').textContent = '';
    try {
      const j = await authApi('signup', { email, password: pw, data: { name, dept } });
      ['su-pw', 'su-pw2'].forEach(id => { $(id).value = ''; });
      if (j.access_token) { saveSession(toSession(j)); await boot(); }   // 확인 메일 없이 바로 (권장 설정)
      else {   // Supabase에서 Confirm email이 켜져 있으면 메일 확인 뒤 로그인
        showAuth('login'); $('li-email').value = email;
        $('li-err').textContent = '가입 신청됐어요 · 메일함의 확인 링크를 누른 뒤 로그인해 주세요 (메일이 안 오면 관리자에게 문의)';
      }
    } catch (err) { $('su-err').textContent = err.message; }
    finally { busy('su-btn', false, '가입 신청'); }
  });
  async function logout() {
    const tok = session?.access_token;
    stopAutoRefresh();
    saveSession(null); me = null;
    if (tok) authApi('logout', {}, 'POST', tok).catch(() => { /* 서버에 못 알려도 이 브라우저에서는 로그아웃 */ });
    location.reload();   // 화면에 남은 자료까지 깨끗하게
  }
  $('wait-logout').addEventListener('click', logout);
  $('btn-login').addEventListener('click', () => showAuth('login'));
  // 로그인 없이 현황 보기: 이미 불러온 화면이면 바로 (아니면 처음부터 보기 전용으로)
  $('auth-guest').addEventListener('click', () => {
    if (session) return;
    if (CHARTS.h?.energy) { applyRole(); showScreen('app'); renderAll({ force: true }); startAutoRefresh(); }
    else boot();
  });
  $('btn-logout').addEventListener('click', logout);
  $('wait-recheck').addEventListener('click', () => boot());
  // 내 이름·권한 메뉴
  const userPop = open => { $('user-pop').hidden = !open; $('user-chip').setAttribute('aria-expanded', String(open)); };
  $('user-chip').addEventListener('click', e => { e.stopPropagation(); userPop($('user-pop').hidden); });
  document.addEventListener('click', e => { if (!e.target.closest('#user-menu')) userPop(false); });
  document.addEventListener('keydown', e => { if (e.key === 'Escape' && !$('user-pop').hidden) { userPop(false); $('user-chip').focus(); } });
  $('btn-users').addEventListener('click', () => {
    userPop(false);
    document.querySelector('.tab-btn[data-tab="manage"]').click();
    document.querySelector('#tab-manage .subtab-btn[data-sub="users"]').click();
  });
  // 비밀번호 바꾸기 (로그인한 상태에서)
  const pwModal = open => { $('pw-modal').style.display = open ? 'flex' : 'none'; if (open) { $('pw-new').value = $('pw-new2').value = ''; $('pw-err').textContent = ''; setTimeout(() => $('pw-new').focus(), 0); } };
  $('btn-pw').addEventListener('click', () => { userPop(false); pwModal(true); });
  ['pw-x', 'pw-cancel'].forEach(id => $(id).addEventListener('click', () => pwModal(false)));
  $('pw-modal').addEventListener('click', e => { if (e.target === $('pw-modal')) pwModal(false); });
  $('f-pw').addEventListener('submit', async e => {
    e.preventDefault();
    const pw = $('pw-new').value;
    if (pw.length < 8) { $('pw-err').textContent = '비밀번호는 8자 이상으로 해 주세요'; return; }
    if (pw !== $('pw-new2').value) { $('pw-err').textContent = '비밀번호 확인이 달라요'; return; }
    busy('pw-save', true);
    try { await ensureToken(); await authApi('user', { password: pw }, 'PUT', session.access_token); pwModal(false); showToast(icn('key') + ' 비밀번호를 바꿨어요'); }
    catch (err) { $('pw-err').textContent = err.message; }
    finally { busy('pw-save', false); }
  });

  /* ── 사용자·권한 (관리자): 회원가입한 사람에게 권한 주기 ───── */
  const roleLbl = r => ROLE_NAME[r] || '권한 없음';
  async function loadUsers(quiet = false) {
    if (!isAdmin()) return;
    try { users = await sb('GET', 'app_users', '?select=*&order=created_at.desc'); }
    catch (e) { if (!quiet) $('users-tbody').innerHTML = `<tr><td colspan="6" class="table-empty">사용자 목록을 불러오지 못했어요: ${esc(e.message)}</td></tr>`; return; }
    renderUsers();
  }
  function renderUsers() {
    const pend = users.filter(u => !u.role && !u.approved_by);   // 승인 대기 = 아직 한 번도 권한을 받지 않은 가입
    const n = pend.length;
    $('badge-pending').hidden = $('badge-wait').hidden = $('uc-dot').hidden = !n;
    $('badge-pending').textContent = n; $('badge-wait').textContent = `대기 ${n}`;
    const who = u => `<b>${esc(u.name || '(이름 없음)')}</b><span>${esc(u.email)}${u.dept ? ` · ${esc(u.dept)}` : ''} · ${fmtDT(u.created_at)} 가입</span>`;
    $('users-pend').innerHTML = !n ? '' : `<div class="users-pend"><h4>${icn('clock')} 승인 대기 ${n}명</h4>` +
      pend.map(u => `<div class="up-row"><div class="up-id">${who(u)}</div><div class="up-act">` +
        ['viewer', 'editor', 'admin'].map(r => `<button type="button" data-uid="${esc(u.user_id)}" data-role="${r}">${ROLE_NAME[r]}${r === 'admin' ? '로' : '으로'} 승인</button>`).join('') + '</div></div>').join('') + '</div>';
    $('users-tbody').innerHTML = !users.length ? '<tr><td colspan="6" class="table-empty">아직 가입한 사람이 없어요</td></tr>'
      : users.map(u => `<tr class="${!u.role ? (u.approved_by ? 'u-off' : 'u-pend') : ''}"><td>${esc(u.name || '—')}${u.user_id === me?.user_id ? '<span class="u-me">나</span>' : ''}</td><td>${esc(u.dept || '—')}</td>` +
        `<td>${esc(u.email)}</td><td>${fmtDT(u.created_at)}</td>` +
        `<td><select data-uid="${esc(u.user_id)}" aria-label="${esc(`${u.name || u.email} 권한`)}">` +
          [['', '권한 없음'], ['viewer', '모니터링'], ['editor', '입력·수정'], ['admin', '관리자']].map(([v, l]) => `<option value="${v}"${(u.role || '') === v ? ' selected' : ''}>${l}</option>`).join('') +
        `</select></td><td>${u.approved_by ? `${!u.role ? '<span class="u-role r-none">권한 거둠</span> ' : ''}${esc(whoName(u.approved_by))} · ${fmtDT(u.approved_at)}`
          : !u.role ? '<span class="u-role r-none">승인 대기</span>' : '—'}</td></tr>`).join('');
  }
  async function setUserRole(uid, role, sel) {
    const u = users.find(x => x.user_id === uid); if (!u) return;
    const nm = u.name || u.email, self = uid === me?.user_id;
    const ask = role === 'admin' ? [`${nm}님을 관리자로 지정할까요?`, '관리자는 연도 마감·목표·로드맵 설정과 사용자 권한까지 바꿀 수 있어요.']
      : !role ? [`${nm}님의 입력·수정 권한을 거둘까요?`, '권한이 없어지면 보기만 할 수 있어요 (현황 보기는 로그인하지 않아도 돼요).']
      : self ? [`내 권한을 ${roleLbl(role)}${role === 'admin' ? '로' : '으로'} 바꿀까요?`, '바꾸면 이 화면(사용자·권한)을 더 볼 수 없어요.'] : null;
    if (ask && !(await confirmBox(ask[0], '바꾸기', ask[1], role ? 'primary' : 'danger'))) { if (sel) sel.value = u.role || ''; return; }
    try {
      await sb('POST', 'rpc/set_user_role', '', { target: uid, new_role: role || null });
      showToast(`✅ ${nm} → ${roleLbl(role)}`);
      if (self) { me.role = role || null; if (!me.role) { location.reload(); return; } applyRole(); }
      await loadUsers();
    } catch (e) { if (sel) sel.value = u.role || ''; showToast(e.message, 'err'); }
  }
  $('users-pend').addEventListener('click', e => { const b = e.target.closest('button[data-uid]'); if (b) setUserRole(b.dataset.uid, b.dataset.role); });
  $('users-tbody').addEventListener('change', e => { const sel = e.target.closest('select[data-uid]'); if (sel) setUserRole(sel.dataset.uid, sel.value, sel); });
  $('users-reload').addEventListener('click', () => loadUsers());

  /* ── 재시도 버튼 ─────────────────────────────────────── */
  $('btn-retry').addEventListener('click', boot);
  $('net-retry').addEventListener('click', e => retryLoad(e.currentTarget));
  // 인터넷이 끊기면 바로 띠 · 다시 이어지면 곧바로 최신 자료를 받아 옴
  window.addEventListener('offline', () => { if (lastLoadAt) netDown(); });
  window.addEventListener('online', () => { if (lastLoadAt && !$('net-banner').hidden) setTimeout(() => retryLoad($('net-retry')), 800); });
  // 탭 복귀 시 토큰 선제 갱신 + 오래 떠나 있었으면 자료 새로고침
  document.addEventListener('visibilitychange', () => {
    if (document.hidden || !session) return;
    const sec = session.expires_at - Date.now() / 1000;
    if (sec < 300) refreshSession().catch(() => {});   // 5분 이내면 미리 갱신
    if (lastLoadAt && Date.now() - lastLoadAt > 5 * 60_000) refresh({ auto: true }).catch(() => {});   // 5분 이상 떠나 있었으면 자료 새로고침
  });

  /* ── 초기화 ─────────────────────────────────────────── */
  // 실적 조회 배너는 기존 '검색 나나' 이미지를 같이 씀 (파일 크기 절약)
  $('hist-mascot').src = document.querySelector('.filter-mascot')?.src || '';
  document.querySelector('.hero-mascot').src = document.querySelector('.wb-mascot')?.src || document.querySelector('.loading-mascot')?.src || '';
  $('rmap-mascot').src = $('hist-mascot').src;
  $('o-mascot').src = $('hist-mascot').src;

  // 실적 조회의 '한 해' 화면 = 올해 현황 화면(#yv)을 그대로 복제 — 모든 id 앞에 'y-' (차트를 만들기 전에)
  (() => {
    const cl = $('yv').cloneNode(true), pre = el => { el.id = 'y-' + el.id; };
    pre(cl); cl.querySelectorAll('[id]').forEach(pre);
    cl.querySelectorAll('label[for]').forEach(l => { l.htmlFor = 'y-' + l.htmlFor; });
    $('h-yv-slot').replaceWith(cl);
  })();

  // 한 해 화면(올해 현황 · 실적 조회의 한 해): 월별 추이 그래프/표 · 월별 온실가스 Scope별/에너지원별 (이 브라우저에 기억)
  //  월별 표의 칸 → 그 달 자료 보기·고치기
  const YV_KEY = 'nia-env.yv';
  try { const sv = JSON.parse(localStorage.getItem(YV_KEY) || '{}');
        ['', 'y-'].forEach(P => { const o = sv[P || 'cur'] || {};
          if (['chart', 'table'].includes(o.view)) yvState[P].view = o.view;
          if (['scope', 'type'].includes(o.by)) yvState[P].by = o.by; }); } catch { /* 저장소를 못 쓰면 기본값 */ }
  ['', 'y-'].forEach(P => {
    const st = yvState[P];
    [['ce-view', 'view'], ['cgm-by', 'by']].forEach(([id, key]) => $(P + id).addEventListener('click', e => {
      const b = e.target.closest('button[data-v]');
      if (!b || st[key] === b.dataset.v) return;
      st[key] = b.dataset.v;
      try { localStorage.setItem(YV_KEY, JSON.stringify({ cur: yvState[''], 'y-': yvState['y-'] })); } catch { /* 기억 못 해도 동작은 그대로 */ }
      if (yvLast[P]) renderYearCharts(P, ...yvLast[P]);
    }));
    $(P + 'ce-tbl').addEventListener('click', e => {
      const b = e.target.closest('button[data-m]');
      // 비어 있는 칸('—', 입력하기) = 바로 입력할 수 있게 고치기 화면으로
      if (b) openDrill({ kind: 'month', year: yvYear[P], month: +b.dataset.m, sites: curSite ? [curSite] : SITES, focus: b.dataset.t ? [b.dataset.t] : [],
                         edit: b.classList.contains('mt-na') && !!b.dataset.t });
    });
    // 거점별 에너지 사용량 표: 칸·거점 이름 → 그 거점의 그 해 월별 자료
    $(P + 'sb-tbl').addEventListener('click', e => {
      const b = e.target.closest('button[data-site]');
      if (b) openDrill({ kind: 'year', year: yvYear[P], site: b.dataset.site, focus: b.dataset.ts ? b.dataset.ts.split(',') : [] });
    });
  });

  // 접고 펼치는 카드(감축 로드맵): 화면마다 접힘 상태를 이 브라우저에 기억 (저장소를 못 쓰면 매번 펼친 채로)
  const FOLD_KEY = 'nia-env.fold';
  const foldState = () => { try { return JSON.parse(localStorage.getItem(FOLD_KEY) || '{}') || {}; } catch { return {}; } };
  document.querySelectorAll('details.fold[id], details.fold-sec[id], details.hist-details[id]').forEach(d => {   // 보고서용 표도
    const v = foldState()[d.id];
    if (v === false) d.open = false; else if (v === true) d.open = true;
    d.addEventListener('toggle', () => {
      try { localStorage.setItem(FOLD_KEY, JSON.stringify({ ...foldState(), [d.id]: d.open })); } catch { /* 저장 못 해도 동작은 그대로 */ }
    });
  });

  // 탭 위 설명 띠: [접기]를 누르면 모든 탭의 설명이 한 줄로 (자주 보는 사람용 · 이 브라우저에 기억) · [설명 ▾]로 다시 펼침
  const INTRO_KEY = 'nia-env.intro';
  const setIntro = min => {
    document.body.classList.toggle('intro-min', min);
    document.querySelectorAll('.intro-x').forEach(b => {
      b.textContent = min ? '설명 ▾' : '접기 ▴';
      b.setAttribute('aria-expanded', String(!min));
      b.title = min ? '이 화면 설명 펼치기' : '설명을 한 줄로 접기 (모든 탭 같이)';
    });
  };
  document.querySelectorAll('.welcome-banner, .tab-banner').forEach(bn => {
    const b = document.createElement('button');
    b.type = 'button'; b.className = 'intro-x';
    b.addEventListener('click', () => {
      const min = !document.body.classList.contains('intro-min');
      setIntro(min);
      try { localStorage.setItem(INTRO_KEY, min ? 'min' : 'full'); } catch { /* 기억 못 해도 동작은 그대로 */ }
    });
    bn.append(b);
  });
  // 처음 여는 휴대폰(좁은 화면)은 접은 채로 시작 — 첫 화면에 숫자가 보이게 · 한 번 펼치거나 접으면 그 선택을 기억
  const narrow = () => matchMedia('(max-width:640px)').matches;
  let introMin = narrow();
  try { const v = localStorage.getItem(INTRO_KEY); if (v === 'min' || v === 'full') introMin = v === 'min'; } catch { /* 저장소를 못 쓰면 화면 폭으로 */ }
  setIntro(introMin);

  // 큰 숫자 칸(카드 값·이정표)의 소수 부분을 작게 — 화면이 바뀔 때마다 자동으로 (값은 그대로)
  const DEC_SEL = '.kpi-value, .sum-v, .rm-ms b';
  const splitDec = el => {
    if (el.querySelector('.dec')) return;
    const m = /^(-?[\d,]+)\.(\d+)(\D{0,3})$/.exec(el.textContent.trim());
    if (m) el.innerHTML = `${m[1]}<small class="dec">.${m[2]}</small>${m[3]}`;
  };
  let decRaf = 0;
  const decorateNums = () => { decRaf = 0; document.querySelectorAll(DEC_SEL).forEach(splitDec); };
  new MutationObserver(() => { if (!decRaf) decRaf = requestAnimationFrame(decorateNums); })
    .observe($('app'), { childList: true, subtree: true, characterData: true });

  boot().then(() => decorateNums());   // 원래: await boot(); decorateNums();
