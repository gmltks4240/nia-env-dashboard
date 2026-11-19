/* js/manage.js (8/9) — 데이터 관리 — 목록·CSV · 연도 마감 · 기준배출량·목표 · 각종 설정 · 변경 이력
   한 덩어리였던 js/app.js 를 순서 그대로 나눈 것. 파일들은 index.html 에 적힌 순서(core → … → main)로 불러오고,
   최상위 const·let·function 은 모든 파일이 함께 쓴다. 새 파일을 만들면 index.html 에도 넣을 것. */
  /* ── 관리 테이블 렌더 (페이지네이션) ────────────────── */
  const recTable = r => r._t === 'metric' ? 'env_metrics' : r._t;   // 목록 줄 → DB 표 이름 (변경 이력과 같은 이름)
  // 입력·수정한 사람 고르기 — 지금 자료를 마지막으로 바꾼 사람들 (이름 가나다순)
  function fillWhoFilter() {
    const sel = $('m-who'); sel.hidden = !whoMap;
    if (!whoMap) { sel.value = ''; return; }
    const ppl = new Map();
    whoMap.forEach((w, k) => { if (w.by && !k.startsWith('env_settings|') && !ppl.has(w.by)) ppl.set(w.by, whoLabel(w)); });
    const keep = sel.value, opts = [...ppl].sort((a, b) => a[1].localeCompare(b[1], 'ko'));
    sel.innerHTML = '<option value="">입력·수정한 사람 전체</option>' + opts.map(([e, n]) => `<option value="${esc(e)}">${esc(n)}${e === me?.email ? ' (나)' : ''}</option>`).join('');
    sel.value = opts.some(([e]) => e === keep) ? keep : '';
  }
  // 항목 필터: 유형에 맞는 항목만 (에너지 = 에너지원 · 기타 지표 = 용수 등) · 폐기물은 항목이 하나라 숨김
  function fillItemFilter() {
    const sel = $('m-item'), ty = $('m-type').value, cur = sel.value;
    const en = Object.keys(GHG), mt = v2 ? Object.keys(METRICS) : [];
    const grp = (label, ks) => ks.length ? `<optgroup label="${label}">${ks.map(k => `<option value="${esc(k)}">${esc(k)}</option>`).join('')}</optgroup>` : '';
    sel.hidden = ty === 'waste';
    sel.innerHTML = '<option value="">항목 전체</option>' +
      (ty === 'metric' ? grp('기타 지표', mt) : ty === 'energy' ? grp('에너지', en) : grp('에너지', en) + grp('기타 지표', mt));
    sel.value = [...sel.options].some(o => o.value === cur) && !sel.hidden ? cur : '';
  }
  function getManageRows() {
    const yr = $('m-year').value, si = $('m-site').value, ty = $('m-type').value, who = whoMap ? $('m-who').value : '';
    const item = $('m-item').hidden ? '' : $('m-item').value;
    let rows = [];
    if (!ty || ty === 'energy') rows = rows.concat(energyRecs
      .filter(r => (!yr || r.date?.startsWith(yr)) && (!si || r.site === si))
      .map(r => ({ ...r, _t: 'energy' })));
    if (!ty || ty === 'waste') rows = rows.concat(wasteRecs
      .filter(r => (!yr || r.date?.startsWith(yr)) && (!si || r.site === si))
      .map(r => ({ ...r, _t: 'waste' })));
    if (!ty || ty === 'metric') rows = rows.concat(metricRecs
      .filter(r => (!yr || r.period.startsWith(yr)) && (!si || r.site === si))
      .map(r => ({ ...r, date: r.period, _t: 'metric' })));
    if (who) rows = rows.filter(r => whoOf(recTable(r), r.id)?.by === who);
    if (item) rows = rows.filter(r => (r._t === 'energy' && r.type === item) || (r._t === 'metric' && r.item === item));
    if (pendDel) rows = rows.filter(r => !isPendingDel(r._t, r.id));   // 되돌리기를 기다리는 줄은 빼고
    rows.sort((a, b) => (b.date || '').localeCompare(a.date || '') || (b.createdAt || 0) - (a.createdAt || 0));
    return rows;
  }

  function renderManage() {
    fillWhoFilter();
    fillItemFilter();
    const rows = getManageRows();
    const total = rows.length;
    const pageCount = Math.ceil(total / PAGE_SIZE);
    if (managePage >= pageCount) managePage = Math.max(0, pageCount - 1);

    const slice = rows.slice(managePage * PAGE_SIZE, (managePage + 1) * PAGE_SIZE);
    const tb = $('manage-tbody');

    if (!rows.length) {
      tb.innerHTML = `<tr><td colspan="7" class="table-empty">
  <img src="${MASCOT_EMPTY}" class="empty-mascot" alt="">
  <div>데이터가 없습니다</div>
</td></tr>`;
      $('pagination').style.display = 'none';
      return;
    }

    tb.innerHTML = slice.map(r => {
      const ie = r._t === 'energy', im = r._t === 'metric';
      // 항목마다 제 아이콘 (전력 = 번개, 재생에너지 = 해 …)
      const TYPE_IC = { '전력': 'bolt', '도시가스': 'flame', '지역난방': 'heat', '휘발유': 'pump', '경유': 'truck',
                        [RE_SELF]: 'sun', [RE_BUY]: 'leaf', [SAVE_REGEN]: 'lift', [WATER]: 'drop', [EV_ALL]: 'car', [EV_GREEN]: 'car' };
      const typeBadge = ie ? `<span class="badge be">${icn(TYPE_IC[r.type] || 'bolt')} ${esc(r.type)}</span>`
        : im ? `<span class="badge bmx">${TYPE_IC[r.item] ? icn(TYPE_IC[r.item]) : icn('list')} ${esc(r.item)}</span>` : `<span class="badge bw">${icn('trash')} 종량제</span>`;
      // Scope 배지: 에너지원 기준 분류 (재생에너지는 배출원이 아니라 RE)
      const sc = im ? '지표' : !ie ? 'S3' : isRE(r.type) ? 'RE' : isSaving(r.type) ? '절감' : scopeOf(r.type) === 'Scope 1' ? 'S1' : 'S2';
      const scopeBadge = `<span class="badge ${{ S1: 'bs1', S2: 'bs2', S3: 'bs3', RE: 'bre', '절감': 'bsave', '지표': 'bmx' }[sc]}">${sc}</span>`;
      const mu = METRICS[r.item]?.unit || r.unit || '';
      const usage = ie ? `<span class="num">${fq(r.amount)}</span> ${GHG[r.type]?.unit || ''}`
        : im ? `<span class="num">${mu === '대' ? fmt(r.value, 0) : fq(r.value)}</span> ${esc(mu)}`
        : `<span class="num">${esc(r.bagSize)}L×${esc(r.qty)}매</span> = <span class="num" style="color:var(--indigo)">${fq(r.bagSize*r.qty)}</span>L → <span class="num">${fq(r.weightTon)}</span>ton`;
      const ghg = im ? `<span style="color:var(--muted);font-size:11px">해당 없음</span>`
        : !ie ? `<span class="num">${fq(r.ghg || 0)}</span> tCO₂eq`
        : !isEmit(r.type) ? `<span style="color:var(--muted);font-size:11px">배출 없음</span>`
        : `<span class="num">${fq(r.ghg)}</span> tCO₂eq`;
      const locked = isClosed((r.date || '').slice(0, 4)), dis = locked ? ' disabled title="마감된 연도라 고칠 수 없어요"' : '';
      // 누가: 마지막으로 바꾼 사람 · 입력/수정 · 날짜 (마우스를 올리면 처음 입력한 사람까지) — 변경 이력이 없으면 등록일
      const w = whoOf(recTable(r), r.id), nm = whoLabel(w);
      const whoTd = !whoMap ? fmtTs(r.createdAt)
        : !w ? `<span class="who-c none" title="변경 이력이 없는 자료예요 (변경 이력 기능 전에 넣은 자료)">—<small>등록 ${esc(fmtTs(r.createdAt))}</small></span>`
        : `<span class="who-c${w.by && w.by === me?.email ? ' me' : ''}" title="${esc(whoTitle(w))}"><b>${esc(nm || '기록 없음')}</b><small>${WHO_ACT[w.act] || '변경'} · ${whoWhen(w.at)}</small></span>`;
      return `<tr>
        <td>${esc(fmtYM(r.date))}${im && METRICS[r.item]?.freq === 'year' ? ' <span style="color:var(--muted);font-size:11px">(연말)</span>' : ''}</td>
        <td>${esc(r.site) || '—'}</td>
        <td>${typeBadge} ${scopeBadge}</td>
        <td>${usage}</td>
        <td>${ghg}</td>
        <td>${whoTd}</td>
        <td style="white-space:nowrap">${locked ? '<span class="badge blk" title="마감된 연도">' + icn('lock') + ' 마감</span> ' : ''}
          <button class="btn-sm btn-edit" data-id="${r.id}" data-type="${r._t}"${dis}>수정</button>
          <button class="btn-sm btn-del"  data-id="${r.id}" data-type="${r._t}" style="margin-left:4px"${dis}>삭제</button>
        </td>
      </tr>`;
    }).join('');

    // 페이지네이션
    const pag = $('pagination');
    pag.style.display = 'flex';
    const start = managePage * PAGE_SIZE + 1;
    const end   = Math.min((managePage + 1) * PAGE_SIZE, total);
    $('pag-info').textContent = `${start}–${end} / 전체 ${total}건`;

    const btns = $('pag-btns');
    btns.innerHTML = '';
    const addBtn = (label, page, disabled, active) => {
      const b = document.createElement('button');
      b.className = 'btn-pag' + (active ? ' active' : '');
      b.textContent = label;
      b.disabled = disabled;
      b.addEventListener('click', () => { managePage = page; renderManage(); });
      btns.appendChild(b);
    };
    addBtn('◀ 이전', managePage - 1, managePage === 0, false);
    // 페이지 번호 버튼 (최대 5개 표시)
    const rangeStart = Math.max(0, managePage - 2);
    const rangeEnd   = Math.min(pageCount - 1, rangeStart + 4);
    for (let p = rangeStart; p <= rangeEnd; p++) {
      addBtn(p + 1, p, false, p === managePage);
    }
    addBtn('다음 ▶', managePage + 1, managePage >= pageCount - 1, false);
  }

  /* ── CSV 내보내기 ────────────────────────────────────── */
  function exportCSV() {
    // 시계열로 쓰기 좋게 오래된 달부터 · 같은 달은 거점 순
    const rows = getManageRows().slice().sort((a, b) => (a.date || '').localeCompare(b.date || '') || SITES.indexOf(a.site) - SITES.indexOf(b.site));
    if (!rows.length) { showToast('내보낼 데이터가 없습니다', 'err'); return; }
    const headers = ['기간', '거점', '유형', '에너지원/항목', '사용량', '단위', 'Scope', 'GHG(tCO2eq)', '폐기물(ton)', '비고', '등록일'];
    const csvRows = rows.map(r => {
      if (r._t === 'energy') {
        return [r.date, r.site, '에너지', r.type, r.amount, GHG[r.type]?.unit || '', isRE(r.type) ? 'RE' : isSaving(r.type) ? '절감' : scopeOf(r.type), isEmit(r.type) ? r.ghg : 0, '', r.note || '', fmtTs(r.createdAt)];
      } else if (r._t === 'metric') {
        return [r.period, r.site, '기타 지표', r.item, r.value, METRICS[r.item]?.unit || r.unit || '', '', '', '', r.note || '', fmtTs(r.createdAt)];
      } else {
        return [r.date, r.site, '폐기물', `종량제${r.bagSize}L×${r.qty}매`, r.qty, '매', 'Scope 3', r.ghg || 0, r.weightTon, r.note || '', fmtTs(r.createdAt)];
      }
    });
    const BOM = '﻿';
    const csv = [headers, ...csvRows]
      .map(row => row.map(v => `"${String(v ?? '').replace(/"/g, '""')}"`).join(','))
      .join('\n');
    const blob = new Blob([BOM + csv], { type: 'text/csv;charset=utf-8;' });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href = url;
    // 파일 이름에 고른 조건을 넣음 — 예: NIA_환경경영_제주글로벌센터_재생에너지_2025_2026-11-06.csv
    const item = $('m-item').hidden ? '' : $('m-item').value;
    const tags = [$('m-site').value, item || ({ energy: '에너지', waste: '폐기물', metric: '기타지표' })[$('m-type').value], $('m-year').value]
      .filter(Boolean).map(s => String(s).replace(/[\\/:*?"<>|\s]+/g, ''));
    a.download = `NIA_환경경영_${tags.length ? tags.join('_') + '_' : ''}${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    showToast(`${icn('download')} ${rows.length}건 CSV 내보내기 완료`);
  }

  /* ── 연도 마감 (env_settings.closed_years) ─────────────── */
  function renderCloseTable() {
    const curYr = new Date().getFullYear();
    const count = (recs, f, y) => recs.filter(r => (f(r) || '').startsWith(y)).length;
    const years = [...new Set([...energyRecs.map(r => r.date), ...wasteRecs.map(r => r.date), ...metricRecs.map(r => r.period), ...settings.closed_years]
      .map(d => (d || '').slice(0, 4)))].filter(y => /^\d{4}$/.test(y)).sort().reverse();
    $('close-tbl').innerHTML = !years.length ? '<tbody><tr><td class="table-empty">데이터가 있는 연도가 없습니다</td></tr></tbody>' :
      `<thead><tr><th>연도</th><th>데이터</th><th>누락</th><th>상태</th><th></th></tr></thead><tbody>` + years.map(y => {
        const closed = isClosed(y), past = +y < curYr, miss = past ? missingCells(+y) : null;
        const n = [['에너지', count(energyRecs, r => r.date, y)], ['폐기물', count(wasteRecs, r => r.date, y)], ['기타', count(metricRecs, r => r.period, y)]]
          .filter(([, c]) => c).map(([k, c]) => `${k} ${c}`).join(' · ') || '없음';
        const btn = closed ? `<button class="btn-sm btn-edit" data-year="${y}" data-act="open">마감 해제</button>`
          : past ? `<button class="btn-sm btn-lock" data-year="${y}" data-act="close">마감하기</button>`
          : '<button class="btn-sm btn-edit" disabled title="해가 끝난 뒤 마감할 수 있어요">연말 후 가능</button>';
        return `<tr><td><b>${y}년</b></td><td style="font-size:12px">${n}</td>
          <td style="font-size:12px">${miss == null ? '<span class="cmp-na">진행 중</span>' : miss ? `<span class="lock-note">${miss}칸</span>` : '없음'}</td>
          <td>${closed ? '<span class="st-closed">' + icn('lock') + ' 마감</span>' : '<span class="st-open">열림</span>'}</td>
          <td style="text-align:right">${btn}</td></tr>`;
      }).join('') + '</tbody>';
  }
  $('close-tbl').addEventListener('click', async e => {
    const b = e.target.closest('button[data-year]');
    if (!b || b.disabled) return;
    const y = b.dataset.year, closing = b.dataset.act === 'close';
    const miss = closing ? missingCells(+y) : 0;
    const ok = closing
      ? await confirmBox(`${y}년을 마감할까요?`, '마감하기',
          `${miss ? `⚠ 입력 현황 기준 누락(빈칸)이 ${miss}칸 있어요 ('-'로 입력한 해당없음은 빼고). ` : ''}마감하면 그 해 데이터는 추가·수정·삭제할 수 없어요. 필요하면 언제든 해제할 수 있어요.`, 'primary')
      : await confirmBox(`${y}년 마감을 해제할까요?`, '해제하기', '해제하면 그 해 데이터를 다시 고칠 수 있어요. 수정이 끝나면 다시 마감하세요.', 'primary');
    if (!ok) return;
    setBusy(b, true, '처리 중…');
    try {
      // 다른 사람이 방금 바꾼 마감 목록을 덮어쓰지 않도록 최신 값을 읽은 뒤 바꿈
      const cur = (await sb('GET', 'env_settings', '?key=eq.closed_years&select=value'))[0]?.value;
      const list = (Array.isArray(cur) ? cur : []).map(String);
      const next = closing ? [...new Set([...list, y])].sort() : list.filter(x => x !== y);
      await sb('POST', 'env_settings', '?on_conflict=key', [{ key: 'closed_years', value: next }], 'resolution=merge-duplicates,return=minimal');
      await refresh();
      showToast(closing ? `${icn('lock')} ${y}년을 마감했어요` : `${icn('unlock')} ${y}년 마감을 해제했어요`);
    } catch (err) { showToast('설정 저장 실패: ' + err.message, 'err'); setBusy(b, false); b.disabled = false; }
  });

  /* ── 온실가스 기준배출량 · 감축 목표 설정 ───────────────────────────
     이 표의 값이 그대로 목표·로드맵에 쓰임 — 기본값도 칸에 실제 값으로 채워 보여 줌 (흐린 안내 글자 없음)
     칸: 기준배출량 | 법적 목표 = 권장감축률(%) · 감축목표량(t) · 배출허용량(t) | 자체 목표 = 자체 감축률(%) · 자체 감축량(t) · 자체 목표배출량(t)
       묶음마다 한 칸만 고치면 나머지 두 칸은 그 해 기준배출량으로 계산 (법적 목표는 권장감축률로, 자체 목표는 자체 목표배출량으로 저장)
       감축목표량 = 기준배출량 × 권장감축률 · 배출허용량 = 기준배출량 − 감축목표량 · 자체 감축량 = 기준배출량 − 자체 목표배출량
     저장 값: env_settings.ghg_base = { 'YYYY': 기준배출량 t } · ghg_law = { 'YYYY': 확정 권장감축률 % } · ghg_law_tent = { 'YYYY': 미확정 권장감축률 % }
              · ghg_own = { 'YYYY': 자체 목표배출량 t } — 저장할 때는 표 전체를 저장
     31년~ 법적 목표는 '미확정' 단추로 확정/미확정을 바꿈 · 올해 이후 기준배출량을 고치면 뒤 연도 중 같은 값이던 해도 함께 바뀜
     칸을 비우고 나가면 기본값(기준배출량은 앞 연도 값)으로 돌아감 · 바뀐 칸은 주황 테두리 */
  const GB_F = { b: '기준배출량', lr: '권장감축률', lc: '감축목표량', lt: '배출허용량', or: '자체 감축률', oc: '자체 감축량', ot: '자체 목표배출량' };
  const GB_GRP = { b: 'b', lr: 'law', lc: 'law', lt: 'law', or: 'own', oc: 'own', ot: 'own' };
  const r6 = v => Math.round(v * 1e6) / 1e6;
  // 칸에 보이는 값: 배출량은 소수 셋째 자리, 권장감축률 셋째 · 자체 감축률 둘째 자리까지 (끝의 0은 생략, 천 단위 쉼표)
  const gbFmt = (f, v) => v == null || !isFinite(v) ? '' : (+Number(v).toPrecision(12)).toLocaleString('ko-KR', { maximumFractionDigits: f === 'or' ? 2 : 3 });
  let gbM = {}, gbOrig = {};   // 연도별 { b: 기준배출량, rate: 권장감축률, tent: 미확정, own: 자체 목표배출량 } — 지금 표 / 처음 표
  const gbYears = () => Object.keys(gbM).map(Number).sort((a, b) => a - b);
  const gbDefLaw = y => LAW_RATE_DEFAULT[y] !== undefined ? { rate: LAW_RATE_DEFAULT[y], tent: false }
    : LAW_RATE_TENT_DEFAULT[y] !== undefined ? { rate: LAW_RATE_TENT_DEFAULT[y], tent: true } : null;
  // 그 해 계산에 쓰는 기준배출량 (칸이 비었으면 앞 연도 값)
  const gbBase = y => { for (let z = y; gbM[z]; z--) if (gbM[z].b > 0) return gbM[z].b; return null; };
  function renderBaseForm() {
    gbDirty = false;
    const curYr = new Date().getFullYear();
    const dataYs = energyRecs.filter(r => r.site === '대구본원').map(r => +(r.date || '').slice(0, 4)).filter(y => y > 1990);
    const ks = [...Object.keys(ghgBaseY), ...Object.keys(ROADMAP), ...Object.keys(LAW_RATE), ...Object.keys(LAW_TENT)].map(Number);
    gbM = {};
    for (let y = Math.min(...ks, ...dataYs, curYr); y <= Math.max(...ks, curYr + 1); y++) {
      const conf = LAW_RATE[y], tr = LAW_TENT[y];
      gbM[y] = { b: baseOf(y), rate: conf ?? tr ?? null, tent: conf === undefined && tr !== undefined, own: ROADMAP[y]?.target ?? null };
    }
    gbOrig = JSON.parse(JSON.stringify(gbM));
    const inp = (y, f) => `<input class="m-in gb-in" type="text" inputmode="decimal" data-year="${y}" data-f="${f}" aria-label="${y}년 ${GB_F[f]}">`;
    // 2031년 이후(장기 목표)는 '장기 목표 보기'로 펼침 · 미확정 단추는 법적 기본값이 확정이 아닌 해(31년~)만
    $('gb-tbody').innerHTML = gbYears().reverse().map(y => {
      const far = y > Math.max(2030, curYr + 1), tog = LAW_RATE_DEFAULT[y] === undefined && gbM[y].rate != null;
      return `<tr data-year="${y}"${far ? ' class="gb-far"' : ''}><td class="m-label">${y}년${isClosed(y) ? ' ' + icn('lock') : ''}</td><td>${inp(y, 'b')}</td>` +
        `<td><div class="gb-rate">${inp(y, 'lr')}${tog ? `<button type="button" class="gb-tent-btn" data-year="${y}"></button>` : ''}</div></td>` +
        `<td>${inp(y, 'lc')}</td><td>${inp(y, 'lt')}</td><td>${inp(y, 'or')}</td><td>${inp(y, 'oc')}</td><td>${inp(y, 'ot')}</td></tr>`;
    }).join('');
    gbYears().forEach(y => gbFill(y));
    updateBaseRows();
  }
  // 한 해의 칸을 표 값으로 채움 (지금 고치고 있는 칸 skip은 그대로)
  function gbFill(y, skip) {
    const m = gbM[y], tr = $('gb-tbody').querySelector(`tr[data-year="${y}"]`);
    if (!m || !tr) return;
    const b = gbBase(y), law = m.rate != null && b, own = m.own != null && b;
    const v = { b: m.b, lr: m.rate, lc: law ? b * m.rate / 100 : null, lt: law ? b * (1 - m.rate / 100) : null,
                or: own ? (b - m.own) / b * 100 : null, oc: own ? b - m.own : null, ot: m.own };
    tr.querySelectorAll('input[data-f]').forEach(i => { if (i.dataset.f !== skip) { i.value = gbFmt(i.dataset.f, v[i.dataset.f]); i.classList.remove('bad'); } });
  }
  const gbDiff = (a, b) => a == null || b == null ? a != b : Math.abs(a - b) > 1e-9;
  function gbChanges() {
    const ys = gbYears();
    return { b: ys.filter(y => gbDiff(gbOrig[y]?.b, gbM[y].b)),
             law: ys.filter(y => gbDiff(gbOrig[y]?.rate, gbM[y].rate) || !!gbOrig[y]?.tent !== !!gbM[y].tent),
             own: ys.filter(y => gbDiff(gbOrig[y]?.own, gbM[y].own)) };
  }
  // 바뀐 칸(주황) · 미확정 법적 목표(점선·흐린 기울임) · 미확정/확정 단추 · 저장 안내
  function updateBaseRows() {
    const ch = gbChanges(), S = { b: new Set(ch.b), law: new Set(ch.law), own: new Set(ch.own) };
    $('gb-tbody').querySelectorAll('tr[data-year]').forEach(tr => {
      const y = +tr.dataset.year, m = gbM[y];
      tr.querySelectorAll('input[data-f]').forEach(i => {
        const g = GB_GRP[i.dataset.f];
        i.classList.toggle('chg', S[g].has(y));
        i.classList.toggle('has-data', i.value.trim() !== '');
        i.classList.toggle('gb-tent', g === 'law' && m.tent && m.rate != null);
        i.placeholder = '없음';
        i.title = g === 'law' && m.tent ? `${y}년 법적 목표는 미확정 참고값이에요 (달성 판정에 쓰지 않음)` : '';
      });
      const btn = tr.querySelector('.gb-tent-btn');
      if (btn) {
        btn.setAttribute('aria-pressed', String(!!m.tent));
        btn.textContent = m.tent ? '미확정' : '확정';
        btn.title = m.tent ? `${y}년 법적 목표: 미확정 참고값 · 누르면 확정으로` : `${y}년 법적 목표: 확정 · 누르면 미확정으로`;
      }
    });
    const parts = [['기준배출량', ch.b], ['법적 목표', ch.law], ['자체 목표', ch.own]].filter(([, a]) => a.length);
    $('gb-save-info').textContent = parts.length ? `바뀐 값: ${parts.map(([k, a]) => `${k} ${a.length}개 연도`).join(' · ')} · 저장하면 로드맵·달성 현황이 다시 계산돼요`
      : '이 표의 값이 그대로 목표·로드맵에 쓰여요 · 묶음마다 한 칸만 고치면 나머지는 계산돼요';
  }
  // 두 표의 차이: [{ y, a: 전, b: 후 }] (연도 순) — 변경 이력에서도 씀
  function baseChanges(a, b) {
    return [...new Set([...Object.keys(a || {}), ...Object.keys(b || {})])].sort()
      .map(y => ({ y, a: a?.[y] ?? null, b: b?.[y] ?? null }))
      .filter(c => c.a == null || c.b == null ? c.a !== c.b : Math.abs(c.a - c.b) > 1e-9);
  }
  $('gb-tbody').addEventListener('input', e => {
    const i = e.target, f = i.dataset?.f, y = +i.dataset?.year, m = gbM[y];
    if (!f || !m) return;
    gbDirty = true;
    const raw = i.value.trim(), v = raw === '' ? null : numIn(raw.replace(/\.$/, ''));   // 소수점까지만 친 중간 상태(예: '40.')도 숫자로
    if (raw !== '' && isNaN(v)) { i.classList.add('bad'); updateBaseRows(); return; }
    i.classList.remove('bad');
    if (f === 'b') {
      const prev = m.b;
      m.b = v;
      // 올해 이후: 뒤 연도 중 같은 값이던 해도 함께 (그 값을 이어 쓰던 해)
      if (y >= new Date().getFullYear() && prev != null)
        for (let z = y + 1; gbM[z] && gbM[z].b != null && Math.abs(gbM[z].b - prev) < 1e-9; z++) gbM[z].b = v;
      gbYears().filter(z => z >= y).forEach(z => gbFill(z, z === y ? 'b' : null));   // 기준배출량이 바뀌면 감축목표량·배출허용량·자체 감축률·감축량을 다시 계산
    } else {
      const b = gbBase(y);
      if (f === 'lr') m.rate = v;
      else if (f === 'lc') m.rate = v == null ? null : b ? r6(v / b * 100) : m.rate;
      else if (f === 'lt') m.rate = v == null ? null : b ? r6((1 - v / b) * 100) : m.rate;
      else if (f === 'ot') m.own = v;
      else if (f === 'oc') m.own = v == null ? null : b ? r6(b - v) : m.own;
      else if (f === 'or') m.own = v == null ? null : b ? r6(b * (1 - v / 100)) : m.own;
      gbFill(y, f);
    }
    updateBaseRows();
  });
  // 칸에서 나가면: 비웠으면 기본값으로 (기준배출량 = 앞 연도 값 · 법적 목표 = 기본 권장감축률 · 자체 목표 = 기본 로드맵), 아니면 쉼표·자릿수를 맞춰 다시 씀
  $('gb-tbody').addEventListener('focusout', e => {
    const i = e.target, f = i.dataset?.f, y = +i.dataset?.year, m = gbM[y];
    if (!f || !m || i.classList.contains('bad')) return;
    if (i.value.trim() === '') {
      if (f === 'b') { const c = gbBase(y - 1); for (let z = y; gbM[z] && gbM[z].b == null; z++) gbM[z].b = c; }
      else if (GB_GRP[f] === 'law') { const d = gbDefLaw(y); m.rate = d ? d.rate : null; m.tent = d ? d.tent : false; }
      else m.own = ROADMAP_DEFAULT[y]?.target ?? null;
      gbYears().filter(z => z >= y).forEach(z => gbFill(z));
    } else gbFill(y);
    updateBaseRows();
  });
  // 미확정 ↔ 확정 (31년~ 법적 목표)
  $('gb-tbody').addEventListener('click', e => {
    const btn = e.target.closest('.gb-tent-btn'), m = btn && gbM[+btn.dataset.year];
    if (!m) return;
    m.tent = !m.tent; gbDirty = true;
    updateBaseRows();
  });
  $('gb-long').addEventListener('click', () => {
    const on = $('gb-tbl').classList.toggle('show-long');
    $('gb-long').setAttribute('aria-expanded', String(on));
    $('gb-long').textContent = on ? '장기 목표 접기 ▴' : '2031~2050년 장기 목표 보기 ▾';
  });
  $('gb-save').addEventListener('click', async () => {
    const ys = gbYears(), ch = gbChanges();
    const bad = [...$('gb-tbody').querySelectorAll('input.bad')].map(i => `${i.dataset.year}년 ${GB_F[i.dataset.f]}`);
    ys.forEach(y => { const m = gbM[y];
      if (m.b != null && !(m.b > 0 && m.b < 1e7)) bad.push(`${y}년 기준배출량`);
      if (m.rate != null && !(m.rate >= 0 && m.rate <= 100)) bad.push(`${y}년 법적 목표`);
      if (m.own != null && !(m.own > 0 && m.own < 1e7)) bad.push(`${y}년 자체 목표`); });
    const bu = [...new Set(bad)];
    if (bu.length) { showToast(`${bu.slice(0, 3).join(', ')}${bu.length > 3 ? ` 외 ${bu.length - 3}칸` : ''}: 배출량은 0보다 큰 숫자, 감축률은 0~100(%) 사이로 입력하세요 (감축목표량은 기준배출량 이하)`, 'err'); return; }
    const nextB = Object.fromEntries(ys.filter(y => gbM[y].b > 0).map(y => [y, gbM[y].b]));
    if (!Object.keys(nextB).length) { showToast('기준배출량을 한 해 이상 입력하세요', 'err'); return; }
    if (!ch.b.length && !ch.law.length && !ch.own.length) { showToast('바뀐 값이 없습니다', 'err'); return; }
    // 확인 창: 화면에서 보는 단위로
    const pct = v => `${(+Number(v).toPrecision(12)).toLocaleString('ko-KR', { maximumFractionDigits: 3 })}%`;
    const lawS = (y, o) => o?.rate == null ? '없음' : `${o.tent ? '미확정 ' : !!gbOrig[y]?.tent !== !!gbM[y].tent ? '확정 ' : ''}${pct(o.rate)}`;
    const show = (arr, f) => arr.slice(0, 3).map(y => `${yrShort(y)} ${f(y, gbOrig[y])} → ${f(y, gbM[y])}`).join(' · ') + (arr.length > 3 ? ` 외 ${arr.length - 3}개` : '');
    const parts = [[ch.b, '기준배출량', show(ch.b, (y, o) => o?.b == null ? '없음' : fq(o.b))], [ch.law, '법적 목표', show(ch.law, lawS)],
                   [ch.own, '자체 목표', show(ch.own, (y, o) => o?.own == null ? '없음' : `${fq(o.own)}t`)]].filter(([a]) => a.length);
    const closed = [...new Set([...ch.b, ...ch.law, ...ch.own].filter(y => isClosed(y)).map(yrShort))];
    if (!(await confirmBox(`${parts.map(([a, k]) => `${k} ${a.length}개 연도`).join(' · ')}를 바꿀까요?`, '저장',
      `${parts.map(([, k, t]) => `${k}: ${t}`).join('\n')}\n감축 로드맵·목표 달성 현황이 다시 계산돼요.` +
      (closed.length ? ` ⚠ 마감된 ${closed.join('·')} 실적의 목표 달성 여부도 바뀌어요.` : ''), 'primary'))) return;
    setBusy($('gb-save'), true);
    try {
      // 표 전체를 저장: 기준배출량 · 확정 권장감축률 · 미확정 권장감축률 · 자체 목표배출량
      const conf = {}, tent = {}, own = {};
      ys.forEach(y => { const m = gbM[y]; if (m.rate != null) (m.tent ? tent : conf)[y] = m.rate; if (m.own != null) own[y] = m.own; });
      const rows = [];
      if (ch.b.length) rows.push({ key: 'ghg_base', value: nextB });
      if (ch.law.length) rows.push({ key: 'ghg_law', value: conf }, { key: 'ghg_law_tent', value: tent });
      if (ch.own.length) rows.push({ key: 'ghg_own', value: own });
      await sb('POST', 'env_settings', '?on_conflict=key', rows, 'resolution=merge-duplicates,return=minimal');
      await refresh(); renderBaseForm();
      showToast(`✅ 저장했어요 · ${parts.map(([a, k]) => `${k} ${a.length}개 연도`).join(' · ')}`);
    } catch (e) { showToast('저장 실패: ' + e.message, 'err'); }
    setBusy($('gb-save'), false); $('gb-save').disabled = false;
  });

  /* ── 거점별 적용 항목 (env_settings.site_na) ───────────────────
     칸을 누르면 해당 ↔ 해당 없음 · 저장하면 입력 목록·현황판·화면·표에 바로 반영 */
  let naMap = {};   // 지금 화면의 값 { 거점: Set(해당 없는 항목) }
  const naSetOf = v => Object.fromEntries(SITES.map(st => [st, new Set(v[st] || [])]));
  const naSame = (a, b) => SITES.every(st => a[st].size === b[st].size && [...a[st]].every(k => b[st].has(k)));
  function renderSiteNaForm() {
    naDirty = false;
    naMap = naSetOf(SITE_NA);
    let grp = '';
    $('na-tbody').innerHTML = NA_ITEMS.map(it => {
      const head = it.g !== grp ? `<tr class="na-grp"><td colspan="${SITES.length + 1}">${(grp = it.g)}</td></tr>` : '';
      const sub = it.sub || (GHG[it.k] ? GHG[it.k].scope : it.k === '폐기물' ? 'Scope 3' : METRICS[it.k] ? METRICS[it.k].unit : '');
      return head + `<tr data-item="${esc(it.k)}"><td class="na-item">${it.icon} ${esc(it.name || it.k)}` +
        `${sub ? `<small>${esc(sub)}</small>` : ''}</td>` +
        SITES.map(st => `<td><button type="button" class="na-cell" data-site="${esc(st)}" data-item="${esc(it.k)}"></button></td>`).join('') + '</tr>';
    }).join('');
    updateNaCells();
  }
  function updateNaCells() {
    const now = naSetOf(SITE_NA);
    let n = 0;
    $('na-tbody').querySelectorAll('.na-cell').forEach(b => {
      const st = b.dataset.site, k = b.dataset.item, na = naMap[st].has(k), chg = na !== now[st].has(k);
      b.setAttribute('aria-pressed', String(!na));
      b.innerHTML = na ? '<span class="na-short">—</span><span class="na-full">해당 없음</span>' : '<span class="na-short">✓</span><span class="na-full">✓ 해당</span>';
      b.title = `${st} · ${k} — ${na ? '쓰지 않는 항목 (입력·화면에서 뺌)' : '쓰는 항목'}`;
      b.classList.toggle('chg', chg);
      n += chg ? 1 : 0;
    });
    $('na-save-info').textContent = n ? `바뀐 칸 ${n}개 · 저장하면 입력 목록·현황판·화면에 바로 반영돼요`
      : '칸을 누르면 해당 ↔ 해당 없음이 바뀌어요';
  }
  $('na-tbody').addEventListener('click', e => {
    const b = e.target.closest('.na-cell'); if (!b) return;
    const st = b.dataset.site, k = b.dataset.item, on = naMap[st].has(k);
    const ks = [k, ...(NA_ITEMS.find(i => i.k === k)?.with || [])];   // 묶인 항목(업무용 차량·친환경차)은 함께
    ks.forEach(x => on ? naMap[st].delete(x) : naMap[st].add(x));
    naDirty = true; updateNaCells();
  });
  $('na-reset').addEventListener('click', () => { naMap = naSetOf(SITE_NA_DEFAULT); naDirty = true; updateNaCells(); });
  $('na-save').addEventListener('click', async () => {
    const now = naSetOf(SITE_NA);
    if (naSame(naMap, now)) { showToast('바뀐 값이 없습니다', 'err'); return; }
    // 확인 창: 거점마다 바뀐 항목 (입력된 값이 있는 항목은 경고)
    const lines = [], warn = [];
    SITES.forEach(st => {
      const add = [...naMap[st]].filter(k => !now[st].has(k)), del = [...naMap[st]].length >= 0 ? [...now[st]].filter(k => !naMap[st].has(k)) : [];
      if (!add.length && !del.length) return;
      lines.push(`${st}: ${[...add.map(k => `${k} → 해당 없음`), ...del.map(k => `${k} → 해당`)].join(' · ')}`);
      add.filter(k => hasRecords(st, k)).forEach(k => warn.push(`${st} ${k}`));
    });
    if (!(await confirmBox(`거점별 적용 항목을 바꿀까요?`, '저장',
      `${lines.join('\n')}\n입력 목록·입력 현황판·화면·표에 바로 반영돼요.` +
      (warn.length ? ` ⚠ ${warn.slice(0, 3).join(', ')}${warn.length > 3 ? ` 외 ${warn.length - 3}개` : ''}는 이미 입력된 값이 있어요 (값은 지우지 않고 화면에서만 빼요).` : ''), 'primary'))) return;
    setBusy($('na-save'), true);
    try {
      const value = Object.fromEntries(SITES.map(st => [st, [...naMap[st]].sort()]));
      await sb('POST', 'env_settings', '?on_conflict=key', [{ key: 'site_na', value }], 'resolution=merge-duplicates,return=minimal');
      await refresh({ force: true });
      showToast('✅ 거점별 적용 항목을 저장했어요');
    } catch (e) { showToast('저장 실패: ' + e.message, 'err'); }
    setBusy($('na-save'), false); $('na-save').disabled = false;
  });
  /* ── TOE 환산계수 설정 ───────────────────────────────── */
  const toeStr = f => String(+(+f).toFixed(9));   // 0.000229 · 0.0238846
  function renderToeTbl() {
    $('toe-tbody').innerHTML = EVAL.types.map(t =>
      `<tr><td class="ct-nm">${esc(t)}</td><td>${esc(GHG[t]?.unit || '')}</td>` +
      `<td><input type="number" class="toe-in" data-t="${esc(t)}" step="any" min="0" max="0.999999" ` +
      `value="${toeStr(toeF[t])}" ${canEdit() ? '' : 'disabled'} aria-label="${esc(t)} 환산계수"></td>` +
      `<td class="toe-def">${toeStr(TOE_DEFAULT[t])}</td></tr>`).join('');
    $('toe-save').disabled = !canEdit();
  }
  const toeRead = () => Object.fromEntries([...document.querySelectorAll('.toe-in')]
    .map(i => [i.dataset.t, +i.value]).filter(([, v]) => Number.isFinite(v) && v > 0));
  $('toe-reset')?.addEventListener('click', () => {
    document.querySelectorAll('.toe-in').forEach(i => { i.value = toeStr(TOE_DEFAULT[i.dataset.t]); });
    $('toe-save-info').textContent = '기본값으로 되돌렸어요 · 저장해야 반영돼요';
  });
  $('toe-save')?.addEventListener('click', async () => {
    const next = toeRead();
    if (Object.keys(next).length !== EVAL.types.length) { fieldErr($('toe-save'), [...document.querySelectorAll('.toe-in')].filter(i => !(+i.value > 0)), '모든 에너지원에 0보다 큰 값을 넣어 주세요'); return; }
    const ch = EVAL.types.filter(t => toeStr(next[t]) !== toeStr(toeF[t]));
    if (!ch.length) { showToast('바뀐 값이 없습니다', 'err'); return; }
    if (!(await confirmBox('TOE 환산계수를 바꿀까요?', '저장',
      `${ch.map(t => `${t}: ${toeStr(toeF[t])} → ${toeStr(next[t])}`).join('\n')}\n` +
      '메인의 에너지 사용량 절감 실적(40점)이 이 계수로 다시 계산돼요.', 'primary'))) return;
    setBusy($('toe-save'), true);
    try {
      // 기본값과 같은 값은 저장하지 않음 (계수가 개정되면 기본값을 따라가게)
      const value = Object.fromEntries(EVAL.types.filter(t => toeStr(next[t]) !== toeStr(TOE_DEFAULT[t])).map(t => [t, next[t]]));
      await sb('POST', 'env_settings', '?on_conflict=key', [{ key: 'toe_factor', value }], 'resolution=merge-duplicates,return=minimal');
      await refresh({ force: true });
      showToast('✅ TOE 환산계수를 저장했어요');
    } catch (e) { showToast('저장 실패: ' + e.message, 'err'); }
    setBusy($('toe-save'), false); $('toe-save').disabled = false;
  });
  /* ── 배출계수 이력 (env_settings.ghg_factor_log) ─────────────── */
  function renderFactorLog() {
    const now = $('fl-now'); if (!now) return;
    const cf = currentFactors();
    now.innerHTML = EMIT_TYPES.map(t => `<tr><td class="ct-nm">${esc(t)}</td><td>${esc(GHG[t]?.unit || '')}</td><td class="fl-f">${factorStr(cf.energy[t])}</td><td class="fl-src">${esc(GHG[t]?.src || GHG[t]?.desc || '')}</td></tr>`).join('')
      + `<tr><td class="ct-nm">폐기물 · 대구본원</td><td>ton</td><td class="fl-f">${factorStr(WASTE_EF['대구본원'])}</td><td class="fl-src" rowspan="2">소각·매립 계수: 한국환경산업기술원 환경성적표지 평가계수(탄소발자국) · 처리비율: 2024년 전국 폐기물 발생·처리현황 p.72(대구)·p.86(제주) · 발생량 환산 0.174 kg/L: 환경정보공개시스템 비가정부문 환산기준</td></tr>`
      + `<tr><td class="ct-nm">폐기물 · 제주글로벌센터</td><td>ton</td><td class="fl-f">${factorStr(WASTE_EF['제주글로벌센터'])}</td></tr>`;
    $('fl-list').innerHTML = factorLog.length
      ? factorLog.map(e => `<li><b>${esc(e.date)}</b> ${esc(e.note || '')}${e.by ? `<span class="fl-by"> · ${esc(e.by)}</span>` : ''}</li>`).join('')
      : '<li class="fl-empty">아직 기록된 이력이 없어요 — 계수를 개정하면 적용일과 내용을 남겨 두세요.</li>';
    $('fl-add').disabled = !canEdit();
  }
  $('fl-add')?.addEventListener('click', async () => {
    const date = ($('fl-date').value || '').trim(), note = ($('fl-note').value || '').trim();
    if (!FL_DATE.test(date)) { fieldErr($('fl-add'), [$('fl-date')], '적용일(월)을 넣어 주세요'); return; }
    if (!note) { fieldErr($('fl-add'), [$('fl-note')], '변경 내용을 간단히 적어 주세요'); return; }
    if (factorLog.some(e => e.date === date && e.note === note)) { showToast('같은 이력이 이미 있어요', 'err'); return; }
    if (!(await confirmBox('배출계수 이력에 추가할까요?', '추가', `${date} · ${note}\n지금 적용 중인 계수가 함께 기록돼요.`, 'primary'))) return;
    setBusy($('fl-add'), true, '추가 중…');
    try {
      const entry = { date, note, by: (me?.name || me?.email || ''), at: new Date().toISOString(), factors: currentFactors() };
      const next = [entry, ...factorLog].slice(0, 50);
      await sb('POST', 'env_settings', '?on_conflict=key', [{ key: 'ghg_factor_log', value: next }], 'resolution=merge-duplicates,return=minimal');
      $('fl-date').value = ''; $('fl-note').value = '';
      await refresh({ force: true });
      showToast('✅ 배출계수 이력을 기록했어요');
    } catch (e) { showToast('저장 실패: ' + e.message, 'err'); }
    setBusy($('fl-add'), false); $('fl-add').disabled = false;
  });
  /* ── 연도별 공식 확정 배출량 (env_settings.official_ghg) ──────── */
  const ogMonth = d => /^\d{4}-\d{2}$/.test(String(d)) ? String(d) : '';
  const ogYears = () => [...new Set([...(settings.closed_years || []), ...energyRecs.map(r => (r.date || '').slice(0, 4)).filter(Boolean)])]
    .filter(y => /^\d{4}$/.test(y)).sort().reverse().slice(0, 8);
  const yearCalcTotal = y => sumBy(energyRecs.filter(r => r.date && r.date.slice(0, 4) === y && isEmit(r.type)), r => r.ghg || 0);
  function renderOfficialGhg() {
    const tb = $('og-tbody'); if (!tb) return;
    const ed = canEdit();
    tb.innerHTML = ogYears().map(y => {
      const o = officialGhg[y] || {}, calc = yearCalcTotal(y);
      const diff = (o.total != null) ? (+o.total - calc) : null;
      const diffTxt = diff == null ? '-' : (diff >= 0 ? '+' + fq(diff) : '△' + fq(Math.abs(diff)));
      return `<tr data-y="${y}"><td class="ct-nm">${esc(yrShort(y))}</td>` +
        `<td><input type="number" class="og-total" data-y="${y}" step="any" min="0" value="${o.total != null ? o.total : ''}" placeholder="미기록" ${ed ? '' : 'disabled'} aria-label="${y} 공식 확정"></td>` +
        `<td><input type="month" class="og-date" data-y="${y}" value="${esc(ogMonth(o.date))}" ${ed ? '' : 'disabled'} aria-label="${y} 확정일"></td>` +
        `<td><input type="text" class="og-note" data-y="${y}" maxlength="80" value="${esc(o.note || '')}" placeholder="예: NGMS 명세서 확정" ${ed ? '' : 'disabled'} aria-label="${y} 비고"></td>` +
        `<td class="fl-f">${calc > 0 ? fq(calc) : '-'}</td><td class="fl-f">${diffTxt}</td></tr>`;
    }).join('');
    $('og-save').disabled = !ed;
  }
  $('og-save')?.addEventListener('click', async () => {
    const next = {};
    document.querySelectorAll('.og-total').forEach(inp => {
      const y = inp.dataset.y, t = (inp.value || '').trim();
      if (t === '' || !Number.isFinite(+t) || +t < 0) return;
      const date = document.querySelector(`.og-date[data-y="${y}"]`)?.value || '';
      const note = (document.querySelector(`.og-note[data-y="${y}"]`)?.value || '').trim();
      next[y] = { total: +t, date: /^\d{4}-\d{2}$/.test(date) ? date : '', note };
    });
    if (JSON.stringify(next) === JSON.stringify(officialGhg)) { showToast('바뀐 값이 없습니다', 'err'); return; }
    const ys = Object.keys(next).sort();
    if (!(await confirmBox('공식 확정 배출량을 저장할까요?', '저장',
      (ys.length ? ys.map(y => `${yrShort(y)}: ${fq(next[y].total)} tCO₂eq`).join('\n') : '모든 연도 비움') +
      '\n대시보드 산정값과 나란히 비교에 쓰여요.', 'primary'))) return;
    setBusy($('og-save'), true);
    try {
      await sb('POST', 'env_settings', '?on_conflict=key', [{ key: 'official_ghg', value: next }], 'resolution=merge-duplicates,return=minimal');
      await refresh({ force: true });
      showToast('✅ 공식 확정 배출량을 저장했어요');
    } catch (e) { showToast('저장 실패: ' + e.message, 'err'); }
    setBusy($('og-save'), false); $('og-save').disabled = false;
  });
  /* ── 태양광 설비·증설 계획 설정 (env_settings.solar_plants) ──── */
  let solarDraft = [], solarDirty = false;
  function renderSolarTbl() {
    solarDraft = solarRows.map(r => ({ ...r })); solarDirty = false;
    drawSolarRows();
  }
  function drawSolarRows() {
    const ed = isAdmin(), now = ymNow();
    $('solar-tbody').innerHTML = solarDraft.length ? solarDraft.map((r, i) => {
      const plan = r.from && r.from > now;
      return `<tr data-i="${i}"${plan ? ' class="so-plan"' : ''}>` +
        `<td><select class="so-site" aria-label="거점" ${ed ? '' : 'disabled'}>${SITES.map(s => `<option value="${esc(s)}"${s === r.site ? ' selected' : ''}>${esc(SITE_SHORT[s] || s)}</option>`).join('')}</select></td>` +
        `<td><input type="text" class="so-name" maxlength="40" value="${esc(r.name)}" placeholder="예: 증축동 옥상" aria-label="설치 위치" ${ed ? '' : 'disabled'}></td>` +
        `<td><span class="so-kwb"><input type="number" class="so-kw" step="any" min="0" value="${r.kw ?? ''}" placeholder="용량" aria-label="용량 kW" ${ed ? '' : 'disabled'}><span class="so-u">kW</span></span></td>` +
        `<td><input type="month" class="so-from" value="${esc(r.from)}" aria-label="가동 시작 달" ${ed ? '' : 'disabled'}>` +
        `<span class="so-tag">${!r.from ? '기존 설비' : plan ? '증설 예정' : '가동 중'}</span></td>` +
        `<td>${ed ? '<button type="button" class="so-del" aria-label="이 줄 빼기" title="이 줄 빼기">✕</button>' : ''}</td></tr>`; }).join('')
      : '<tr><td colspan="5" class="muted" style="padding:12px">등록된 태양광 설비가 없어요</td></tr>';
    drawSolarSum();
    $('solar-save').disabled = !ed; $('solar-add').disabled = !ed;
  }
  // 거점마다 지금 용량 · 증설 예정 (입력하는 대로 바로)
  function drawSolarSum() {
    const now = ymNow();
    $('solar-sum').innerHTML = SITES.map(s => { const rs = solarDraft.filter(r => r.site === s && +r.kw > 0);
      if (!rs.length) return '';
      const cur = sumBy(rs.filter(r => !r.from || r.from <= now), r => +r.kw), plan = sumBy(rs.filter(r => r.from && r.from > now), r => +r.kw);
      return `<span>${esc(SITE_SHORT[s] || s)} 지금 <b>${fq(+cur.toFixed(3))}kW</b>${plan > 0 ? ` · 증설 예정 <b>+${fq(+plan.toFixed(3))}kW</b>` : ''}</span>`; }).join('');
  }
  // 입력 칸 → 초안 (줄마다)
  $('solar-tbody')?.addEventListener('input', e => {
    const tr = e.target.closest('tr[data-i]'); if (!tr) return;
    const r = solarDraft[+tr.dataset.i]; if (!r) return;
    if (e.target.classList.contains('so-site')) r.site = e.target.value;
    else if (e.target.classList.contains('so-name')) r.name = e.target.value;
    else if (e.target.classList.contains('so-kw')) r.kw = e.target.value === '' ? null : +e.target.value;
    else if (e.target.classList.contains('so-from')) r.from = e.target.value || '';
    solarDirty = true; drawSolarSum(); $('solar-save-info').textContent = '바꾼 값은 저장해야 반영돼요';
  });
  $('solar-tbody')?.addEventListener('change', e => { if (e.target.matches('.so-site, .so-from')) { e.target.dispatchEvent(new Event('input', { bubbles: true })); drawSolarRows(); } });
  $('solar-tbody')?.addEventListener('click', e => {
    const b = e.target.closest('.so-del'); if (!b) return;
    solarDraft.splice(+b.closest('tr').dataset.i, 1); solarDirty = true; drawSolarRows();
    $('solar-save-info').textContent = '줄을 뺐어요 · 저장해야 반영돼요';
  });
  $('solar-add')?.addEventListener('click', () => {
    const y = new Date().getFullYear() + 1;
    solarDraft.push({ site: '대구본원', name: '', kw: null, from: `${y}-01` }); solarDirty = true; drawSolarRows();
    $('solar-tbody').querySelector('tr:last-child .so-kw')?.focus();
    $('solar-save-info').textContent = '용량과 가동 시작 달을 넣고 저장하세요';
  });
  $('solar-save')?.addEventListener('click', async () => {
    const bad = solarDraft.findIndex(r => !(+r.kw > 0) || (r.from && !SOLAR_YM.test(r.from)));
    if (bad >= 0) { fieldErr($('solar-save'), [$('solar-tbody').querySelectorAll('.so-kw')[bad]], `${bad + 1}번째 줄: 용량(kW)을 0보다 크게 넣어 주세요`); return; }
    const next = cleanSolar(solarDraft), key = r => `${r.site}|${r.name}|${r.kw}|${r.from}`;
    const before = solarRows.map(key).sort().join(','), after = next.map(key).sort().join(',');
    if (before === after) { showToast('바뀐 값이 없습니다', 'err'); return; }
    const line = r => `${SITE_SHORT[r.site] || r.site}${r.name ? ` ${r.name}` : ''} ${fq(r.kw)}kW${r.from ? ` (${r.from} 가동)` : ' (기존)'}`;
    if (!(await confirmBox('태양광 설비를 바꿀까요?', '저장', `${next.length ? next.map(line).join('\n') : '설비 없음'}\n전망(RE100·온실가스)이 이 설비로 다시 계산돼요.`, 'primary'))) return;
    setBusy($('solar-save'), true);
    try {
      await sb('POST', 'env_settings', '?on_conflict=key', [{ key: 'solar_plants', value: next }], 'resolution=merge-duplicates,return=minimal');
      solarDirty = false;
      await refresh({ force: true });
      showToast('✅ 태양광 설비를 저장했어요');
    } catch (e) { showToast('저장 실패: ' + e.message, 'err'); }
    setBusy($('solar-save'), false); $('solar-save').disabled = false;
  });
  // 그 거점·항목에 이미 입력된 값이 있는지 (해당 없음으로 바꿀 때 알려 주려고)
  function hasRecords(site, item) {
    if (item === '폐기물') return wasteRecs.some(r => r.site === site);
    if (METRICS[item]) return metricRecs.some(r => r.site === site && r.item === item);
    return energyRecs.some(r => r.site === site && r.type === item);
  }

  /* ── 폐기물 감축 로드맵 설정 (env_settings.waste_roadmap) ──── */
  function renderRoadmapForm() {
    rmDirty = false;
    const rm = settings.waste_roadmap || {}, curYr = new Date().getFullYear();
    // 기준연도 후보: 목표 대상 청사(대구본원·제주글로벌센터)의 폐기물 데이터가 있는 지난 연도 (+ 이미 저장된 기준연도)
    const opts = [...new Set([...wasteRecs.filter(r => TARGET_SITES.waste.includes(r.site)).map(r => (r.date || '').slice(0, 4)).filter(y => /^\d{4}$/.test(y) && +y < curYr),
                              ...(rm.baseYear ? [String(rm.baseYear)] : [])])].sort();
    const base = rm.baseYear ? String(rm.baseYear) : (opts[opts.length - 1] || '');
    $('rm-base').innerHTML = opts.length ? opts.map(y => `<option value="${y}"${y === base ? ' selected' : ''}>${y}년</option>`).join('')
                                         : '<option value="">폐기물 데이터 없음</option>';
    fillRoadmapRows(rm.rates || {});
  }
  function fillRoadmapRows(rates) {
    const base = $('rm-base').value, tb = $('rm-tbody');
    $('rm-base-ton').textContent = !base ? '—' : TARGET_SITES.waste.map(st => { const t = wasteYearTon(base, [st]);
      return `${st} ${t != null ? `${fq(t)} t` : '자료 없음'}`; }).join(' · ') + (() => { const t = wasteYearTon(base, TARGET_SITES.waste); return t != null ? ` · 합산 ${fq(t)} t` : ''; })();
    $('rm-save').disabled = !base;
    if (!base) {
      tb.innerHTML = '<tr><td colspan="6" class="table-empty" style="padding:20px">폐기물 데이터가 있는 지난 연도가 있어야 기준연도를 정할 수 있어요</td></tr>';
      return;
    }
    const ys = [];
    for (let y = +base + 1; y <= rmEnd(); y++) ys.push(String(y));
    tb.innerHTML = ys.map(y => `<tr data-year="${y}">
        <td class="m-label">${y}년</td>
        <td><input class="m-in${rates[y] != null ? ' has-data' : ''}" type="number" min="0" max="100" step="0.1" placeholder="미정" value="${rates[y] ?? ''}" data-year="${y}" style="width:100px" aria-label="${y}년 감축률(%)"></td>
        ${TARGET_SITES.waste.map(st => `<td class="m-ghg rm-t" data-site="${st}"></td>`).join('')}<td class="m-ghg rm-t" data-site="__sum" style="font-weight:600"></td>
      </tr>`).join('');
    updateRoadmapTargets();
  }
  function updateRoadmapTargets() {
    const base = $('rm-base').value, tons = Object.fromEntries(TARGET_SITES.waste.map(st => [st, wasteYearTon(base, [st])]));
    tons.__sum = wasteYearTon(base, TARGET_SITES.waste);   // 목표·로드맵 탭은 세 거점 합산 목표로 판정
    $('rm-tbody').querySelectorAll('tr[data-year]').forEach(tr => {
      const inp = tr.querySelector('input'), v = parseFloat(inp.value);
      inp.classList.toggle('has-data', inp.value !== '');
      tr.querySelectorAll('.rm-t').forEach(td => { const bt = tons[td.dataset.site];
        td.textContent = (inp.value !== '' && !isNaN(v) && bt != null) ? `${fq(bt * (1 - v / 100))} t` : ''; });
    });
  }
  const readRates = () => Object.fromEntries([...$('rm-tbody').querySelectorAll('input[data-year]')]
    .filter(i => i.value.trim() !== '').map(i => [i.dataset.year, parseFloat(i.value)]));
  $('rm-base').addEventListener('change', () => { rmDirty = true; fillRoadmapRows(readRates()); });
  $('rm-tbody').addEventListener('input', () => { rmDirty = true; updateRoadmapTargets(); });
  // 빠른 채우기: 기준연도 다음 해부터 매년 n%p씩 누적 (예: 2 → 2, 4, 6 …)
  $('rm-fill').addEventListener('click', () => {
    const n = parseFloat($('rm-step').value);
    if (isNaN(n) || n <= 0 || n > 100) { showToast('매년 감축할 %p를 0보다 크게 입력하세요', 'err'); return; }
    $('rm-tbody').querySelectorAll('input[data-year]').forEach((inp, k) => { inp.value = String(Math.min(100, Math.round(n * (k + 1) * 10) / 10)); });
    rmDirty = true; updateRoadmapTargets();
  });
  $('rm-save').addEventListener('click', async () => {
    const base = $('rm-base').value;
    if (!base) return;
    const bad = [], badEls = [], rates = {};
    $('rm-tbody').querySelectorAll('input[data-year]').forEach(inp => {
      const raw = inp.value.trim();
      if (raw === '') return;
      const v = Number(raw);
      if (isNaN(v) || v < 0 || v > 100) { bad.push(inp.dataset.year); badEls.push(inp); } else rates[inp.dataset.year] = v;
    });
    if (bad.length) { fieldErr($('rm-save'), badEls, `${bad.join(', ')}년: 감축률은 0~100 사이로 입력하세요`); return; }
    setBusy($('rm-save'), true);
    try {
      await sb('POST', 'env_settings', '?on_conflict=key', [{ key: 'waste_roadmap', value: { baseYear: base, rates } }], 'resolution=merge-duplicates,return=minimal');
      await refresh(); renderRoadmapForm();
      showToast('✅ 폐기물 감축 로드맵을 저장했어요');
    } catch (e) { showToast('저장 실패: ' + e.message, 'err'); }
    setBusy($('rm-save'), false); $('rm-save').disabled = !$('rm-base').value;
  });

  /* ── 변경 이력 (change_log: DB 트리거가 자동 기록, 읽기 전용) ─── */
  let logRows = [];
  const LOG_TABLE = { energy: '에너지', waste: '폐기물', env_metrics: '기타 지표', env_settings: '설정', app_users: '사용자 권한' };
  // 누가: 로그인 이메일로 기록 → 관리자 화면에선 가입한 이름으로 (모르면 이메일 앞부분) · 권한 설정 전 기록은 —
  const logWho = r => !r.changed_by ? '' : r.changed_by_name || whoName(r.changed_by);   // 바꾼 그때 이름 (who_changed.sql 뒤) → 가입 이름 → 이메일 앞부분
  const logPeople = new Map();   // 지금까지 본 '바꾼 사람' (이메일 → 이름) — 사람으로 고르기 목록
  function fillLogWho() {
    if (isAdmin()) users.forEach(u => logPeople.set(u.email, u.name || whoName(u.email)));
    whoMap?.forEach(w => { if (w.by && !logPeople.has(w.by)) logPeople.set(w.by, whoLabel(w)); });
    logRows.forEach(r => { if (r.changed_by) logPeople.set(r.changed_by, logWho(r)); });
    const sel = $('log-who'), keep = sel.value, opts = [...logPeople].sort((a, b) => a[1].localeCompare(b[1], 'ko'));
    sel.innerHTML = '<option value="">바꾼 사람 전체</option>' + opts.map(([e, n]) => `<option value="${esc(e)}">${esc(n)}${e === me?.email ? ' (나)' : ''}</option>`).join('');
    sel.value = opts.some(([e]) => e === keep) ? keep : '';
    // 이름이 이메일 앞부분으로만 보이는 경우 (관리자에게 DB 설정 안내)
    $('log-desc').textContent = '최근 200건 · DB 설정 이후의 변경분부터 자동으로 기록돼요 · 누가 = 바꾼 사람 (마우스를 올리면 로그인 이메일 · 로그인 기능을 켠 뒤 기록부터)' +
      (whoView === false && isAdmin() ? ' · 입력·수정 권한자 화면에도 이름으로 보이게 하려면 DB에서 supabase/who_changed.sql을 한 번 실행하세요' : '');
  }
  const LOG_ACT   = { INSERT: ['추가', 'la-ins'], UPDATE: ['수정', 'la-upd'], DELETE: ['삭제', 'la-del'] };
  const LOG_FIELD = { date: '기간', period: '기간', site: '거점', type: '에너지원', item: '항목', amount: '사용량', value: '값',
                      bag_size: '봉투 규격(L)', qty: '수량(매)', note: '비고' };
  async function loadChangeLog() {
    if (!v2) return;
    const t = $('log-table').value, who = $('log-who').value;
    $('log-tbody').innerHTML = '<tr><td colspan="6" class="table-empty">불러오는 중…</td></tr>';
    try {
      logRows = await sb('GET', 'change_log', `?select=*&order=changed_at.desc&limit=200${t ? `&table_name=eq.${t}` : ''}${who ? `&changed_by=eq.${encodeURIComponent(who)}` : ''}`);
      fillLogWho();
      renderChangeLog();
    } catch (e) {
      logRows = [];
      $('log-tbody').innerHTML = `<tr><td colspan="6" class="table-empty">변경 이력을 불러오지 못했어요: ${esc(e.message)}</td></tr>`;
    }
  }
  // 대상: '26년 3월 · 대구본원 · 전력' 같은 사람이 읽는 이름
  function logTarget(r) {
    const d = r.new_data || r.old_data || {};
    if (r.table_name === 'app_users') return [d.name, d.email].filter(Boolean).join(' · ');
    if (r.table_name === 'env_settings') return d.key === 'closed_years' ? '연도 마감' : d.key === 'waste_roadmap' ? '폐기물 감축 로드맵'
      : d.key === 'ghg_base' ? '온실가스 기준배출량' : d.key === 'ghg_own' ? '온실가스 자체 목표' : d.key === 'ghg_law' ? '법적 목표(권장감축률)' : d.key === 'ghg_law_tent' ? '법적 목표 미확정 참고값' : d.key === 'it_metrics' ? 'PUE·클라우드 전환률' : d.key === 'na_cells' ? "해당없음('-') 칸" : d.key === 'site_na' ? '거점별 적용 항목' : d.key === 'toe_factor' ? 'TOE 환산계수' : d.key === 'solar_plants' ? '태양광 설비·증설 계획' : d.key === 'ghg_factor_log' ? '배출계수 이력' : d.key === 'official_ghg' ? '공식 확정 배출량' : d.key || '';
    const what = r.table_name === 'waste' ? '종량제 봉투' : (d.type || d.item || '');
    return [fmtYM(d.date || d.period), d.site, what].filter(Boolean).join(' · ');
  }
  // 변경 내용 (일반 텍스트 — 화면에선 이스케이프해서 넣음)
  function logDetail(r) {
    const o = r.old_data || {}, n = r.new_data || {};
    const show = (k, v) => v == null || v === '' ? (k === 'note' ? '(없음)' : '—') : typeof v === 'number' ? fmt(v, Number.isInteger(v) ? 0 : 2) : String(v);
    if (r.table_name === 'app_users') {   // 권한 주기·바꾸기·막기 · 이름·부서 수정
      const rl = (x, first) => ROLE_NAME[x.role] || (first && !x.approved_by ? '승인 대기' : '권한 없음');
      return [(o.role ?? null) !== (n.role ?? null) ? `권한 ${rl(o, true)} → ${rl(n)}` : '',
              (o.name ?? '') !== (n.name ?? '') ? `이름 ${o.name || '—'} → ${n.name || '—'}` : '',
              (o.dept ?? '') !== (n.dept ?? '') ? `부서 ${o.dept || '—'} → ${n.dept || '—'}` : ''].filter(Boolean).join(' · ') || '변경 없음';
    }
    if (r.table_name === 'env_settings') {
      const key = n.key || o.key;
      if (key === 'closed_years') {
        const a = new Set(o.value || []), b = new Set(n.value || []);
        return [...[...b].filter(y => !a.has(y)).map(y => `${icn('lock')} ${y}년 마감`), ...[...a].filter(y => !b.has(y)).map(y => `${icn('unlock')} ${y}년 마감 해제`)].join(' · ') || '변경 없음';
      }
      if (key === 'ghg_base') {   // 처음 저장(추가)은 기본값과 비교
        if (r.action === 'DELETE') return '저장한 값 삭제 (기본값으로)';
        const before = r.action === 'INSERT' ? GHG_BASE_DEFAULT : cleanBase(o.value) || {}, ch = baseChanges(before, cleanBase(n.value) || {});
        return ch.map(c => `${c.y}년 ${c.a == null ? '없음' : fq(c.a)} → ${c.b == null ? '없음' : fq(c.b)}`).join(' · ')
          || (r.action === 'INSERT' ? '기본값 그대로 저장' : '변경 없음');
      }
      if (key === 'it_metrics') {   // 연도별 PUE·클라우드 전환률
        const a = cleanIt(o.value), b = cleanIt(n.value), f = r => r ? [r.pue != null ? `PUE ${r.pue}` : '', r.cloud != null ? `클라우드 전환률 ${r.cloud}%` : ''].filter(Boolean).join(' · ') || '비고만' : '없음';
        return [...new Set([...Object.keys(a), ...Object.keys(b)])].sort().filter(y => JSON.stringify(a[y] || {}) !== JSON.stringify(b[y] || {}))
          .map(y => `${y}년 ${f(a[y])} → ${f(b[y])}`).join(' · ') || '변경 없음';
      }
      if (key === 'ghg_law') {   // 확정 권장감축률 (없는 해 = 기본값 · 31년~은 미확정) — 기본값과 합친 값끼리 비교
        const eff = v => ({ ...LAW_RATE_DEFAULT, ...(cleanRates(v) || {}) });
        const ch = baseChanges(r.action === 'INSERT' ? LAW_RATE_DEFAULT : eff(o.value), r.action === 'DELETE' ? LAW_RATE_DEFAULT : eff(n.value));
        const p = v => v == null ? '미확정' : `${(+Number(v).toPrecision(12)).toLocaleString('ko-KR', { maximumFractionDigits: 3 })}%`;
        return ch.map(c => `${c.y}년 권장감축률 ${p(c.a)} → ${p(c.b)}`).join(' · ') || '변경 없음';
      }
      if (key === 'ghg_law_tent') {   // 미확정 권장감축률 값만 (확정/미확정으로 옮긴 해는 '법적 목표(권장감축률)' 줄에)
        const a = r.action === 'INSERT' ? LAW_RATE_TENT_DEFAULT : cleanRates(o.value) || {}, b = cleanRates(n.value) || {};
        const p = v => `${(+Number(v).toPrecision(12)).toLocaleString('ko-KR', { maximumFractionDigits: 3 })}%`;
        return baseChanges(a, b).filter(c => c.a != null && c.b != null).map(c => `${c.y}년 ${p(c.a)} → ${p(c.b)}`).join(' · ') || '미확정 값 변경 없음';
      }
      if (key === 'ghg_own') {   // 연도별 자체 목표배출량 (없는 해 = 기본 로드맵 값) — 기본값과 합친 값끼리 비교
        const def = Object.fromEntries(Object.entries(ROADMAP_DEFAULT).map(([y, x]) => [y, x.target])), eff = v => ({ ...def, ...(cleanBase(v) || {}) });
        const ch = baseChanges(r.action === 'INSERT' ? def : eff(o.value), r.action === 'DELETE' ? def : eff(n.value));
        return ch.map(c => `${c.y}년 ${c.a == null ? '없음' : fq(c.a)} → ${c.b == null ? '없음' : fq(c.b)}`).join(' · ') || '변경 없음';
      }
      if (key === 'site_na') {   // 거점마다 '해당 없음'으로 바뀐 항목 / 다시 '해당'이 된 항목
        const a = cleanSiteNa(o.value) || SITE_NA_DEFAULT, b = cleanSiteNa(n.value) || SITE_NA_DEFAULT;
        const out = SITES.map(st => {
          const A = new Set(a[st] || []), B = new Set(b[st] || []);
          const add = [...B].filter(k => !A.has(k)), del = [...A].filter(k => !B.has(k));
          return add.length || del.length ? `${st}: ${[...add.map(k => `${k} → 해당 없음`), ...del.map(k => `${k} → 해당`)].join(', ')}` : '';
        }).filter(Boolean);
        return out.join(' · ') || '변경 없음';
      }
      if (key === 'na_cells') {   // '거점|항목|YYYY-MM' 목록에서 더해지고 빠진 칸
        const a = cleanNa(o.value), b = cleanNa(n.value), fmtK = k => { const [si, it, ym] = k.split('|'); return `${fmtYM(ym)} ${si} ${it}`; };
        const add = [...b].filter(k => !a.has(k)), del = [...a].filter(k => !b.has(k));
        const part = (arr, w) => arr.length ? `${w} ${arr.length}칸 (${arr.slice(0, 3).map(fmtK).join(', ')}${arr.length > 3 ? ' 등' : ''})` : '';
        return [part(add, "'-' 입력"), part(del, '해제')].filter(Boolean).join(' · ') || '변경 없음';
      }
      if (key === 'waste_roadmap') {
        const v = n.value || {};
        if (r.action === 'DELETE') return '로드맵 삭제';
        const rs = Object.entries(v.rates || {}).map(([y, p]) => `${y.slice(2)}년 ${p}%`).join(', ');
        return `기준 ${v.baseYear || '—'}년 · 목표 ${rs || '없음'}`;
      }
      return '';
    }
    if (r.action === 'UPDATE') {
      return Object.keys(LOG_FIELD).filter(k => (k in n || k in o) && JSON.stringify(o[k] ?? null) !== JSON.stringify(n[k] ?? null))
        .map(k => `${LOG_FIELD[k]} ${show(k, o[k])} → ${show(k, n[k])}`).join(' · ') || '계산값만 바뀜';
    }
    const d = r.action === 'DELETE' ? o : n;
    const val = r.table_name === 'energy' ? `${show('amount', d.amount)} ${d.unit || ''}`
      : r.table_name === 'waste' ? `${d.bag_size}L × ${d.qty}매` : `${show('value', d.value)} ${d.unit || ''}`;
    return val.trim() + (d.note ? ` · 비고 "${d.note}"` : '');
  }
  function renderChangeLog() {
    $('log-tbody').innerHTML = !logRows.length
      ? '<tr><td colspan="6" class="table-empty">아직 기록된 변경이 없어요</td></tr>'
      : logRows.map(r => {
          const [act, cls] = LOG_ACT[r.action] || [r.action, ''];
          return `<tr><td>${fmtDT(r.changed_at)}</td><td class="log-who"${r.changed_by ? ` title="${esc(r.changed_by)}"` : ''}>${esc(logWho(r) || '—')}</td><td>${esc(LOG_TABLE[r.table_name] || r.table_name)}</td>
            <td><span class="la ${cls}">${esc(act)}</span></td><td>${esc(logTarget(r))}</td><td>${esc(logDetail(r))}</td></tr>`;
        }).join('');
  }
  function exportChangeLog() {
    if (!logRows.length) { showToast('내보낼 변경 이력이 없습니다', 'err'); return; }
    const rows = [['시각', '누가', '이메일', '구분', '작업', '대상', '변경 내용'],
      ...logRows.map(r => [fmtDT(r.changed_at), logWho(r), r.changed_by || '', LOG_TABLE[r.table_name] || r.table_name, (LOG_ACT[r.action] || [r.action])[0], logTarget(r), logDetail(r)])];
    const csv = rows.map(row => row.map(v => `"${String(v ?? '').replace(/"/g, '""')}"`).join(',')).join('\n');
    const url = URL.createObjectURL(new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' }));
    const a = document.createElement('a');
    a.href = url; a.download = `NIA_변경이력_${new Date().toISOString().slice(0, 10)}.csv`; a.click();
    URL.revokeObjectURL(url);
    showToast(`${icn('download')} ${logRows.length}건 내보내기 완료`);
  }
  $('log-table').addEventListener('change', loadChangeLog);
  $('log-who').addEventListener('change', loadChangeLog);
  $('log-reload').addEventListener('click', loadChangeLog);
  $('log-export').addEventListener('click', exportChangeLog);

