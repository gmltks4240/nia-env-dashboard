/* js/dashboard.js (4/9) — 올해 현황 · 실적 조회 — 거점 선택 · 한 해 화면(renderYearView) · 거점별 사용량 · 자원·기타 지표 · 입력 현황판 · 예측 근거
   한 덩어리였던 js/app.js 를 순서 그대로 나눈 것. 파일들은 index.html 에 적힌 순서(core → … → main)로 불러오고,
   최상위 const·let·function 은 모든 파일이 함께 쓴다. 새 파일을 만들면 index.html 에도 넣을 것. */
  /* ── 거점 선택 (올해 현황·실적 조회가 같이 씀) — 기본은 목표를 가장 많이 적용하는 거점 ── */
  let curSite = HEAD_SITE;
  /* 거점 소개는 js/config.js 의 targetSites 에서 자동으로 만든다 (기관마다 거점 수·목표가 다르므로) */
  const TGT_NAMES = { ghg: '온실가스', re: 'RE100', wt: '폐기물' };
  const SITE_INFO = (() => {
    const of = si => {
      const has = { ghg: TARGET_SITES.ghg.includes(si), re: TARGET_SITES.re.includes(si), wt: TARGET_SITES.waste.includes(si) };
      const on = Object.keys(TGT_NAMES).filter(k => has[k]), off = Object.keys(TGT_NAMES).filter(k => !has[k]);
      if (!on.length) return { role: '모니터링', tone: '', desc: '적용하는 감축 목표가 없어요 · 사용량 추이만 봐요' };
      const all = on.length === 3;
      const with_ = k => k === 'ghg' ? TARGET_SITES.ghg : k === 're' ? TARGET_SITES.re : TARGET_SITES.waste;
      return {
        role: all ? '감축 목표 관리' : `${on.map(k => TGT_NAMES[k]).join('·')} 목표`,
        tone: all ? 'goal' : 'part',
        desc: all ? '온실가스·RE100·폐기물 목표를 모두 적용하는 거점이에요'
                  : `${on.map(k => `${TGT_NAMES[k]}(${sitesTxt(with_(k))})`).join(' · ')} 적용`
                    + (off.length ? ` · ${off.map(k => TGT_NAMES[k]).join('·')}는 추이만 봐요` : ''),
      };
    };
    const out = Object.fromEntries(SITES.map(si => [si, of(si)]));
    out[''] = { role: `${SITES.length}개 거점 합계`, tone: '',
                desc: `${SITES.length}개 거점을 합친 화면 · 목표는 대상 거점끼리 모아 봐요` };
    return out;
  })();
  const ITEM_NAMES = [['전력', '전력'], ['도시가스', '도시가스'], ['지역난방', '지역난방'], ['휘발유', '휘발유'], ['경유', '경유'],
                      [RE_SELF, '태양광(자가발전)'], [RE_BUY, '재생에너지 구매'], [SAVE_REGEN, '승강기 회생제동']];
  // 관리 항목: 최근 3개년에 입력된 자료가 있는 항목
  function siteItems(si) {
    const sites = si ? [si] : SITES, from = String(new Date().getFullYear() - 2), mine = r => sites.includes(r.site);
    const types = new Set(energyRecs.filter(r => mine(r) && (r.date || '') >= from).map(r => r.type));
    const out = ITEM_NAMES.filter(([t]) => types.has(t)).map(([, n]) => n);
    if (metricRecs.some(r => mine(r) && r.item === WATER && r.period >= from)) out.push('용수');
    if (wasteRecs.some(r => mine(r) && (r.date || '') >= from)) out.push('폐기물');
    if (metricRecs.some(r => mine(r) && r.item === EV_ALL && r.period >= from)) out.push('친환경차');
    return out;
  }
  function renderSiteInfo(id, si, year) {
    const info = SITE_INFO[si] ?? SITE_INFO[''], items = siteItems(si);
    const cy = +year || new Date().getFullYear(), rg = reGoalOf(cy);   // year = 보고 있는 연도 (없으면 올해)
    // 적용 목표 칩 (data-k = 목표 종류) — 올해 현황·그 해 자세히는 목표 카드를 그린 뒤 '✓ 여유 · ✗ 부족' 판정 칩으로 바꿈 (siteVerdicts)
    const tags = [TARGET_SITES.ghg.includes(si) && ['ghg', '온실가스 감축'], TARGET_SITES.re.includes(si) && ['re', `RE100 ${rg != null ? `${yrShort(cy)} ${rg}%` : '이행'}`],
                  TARGET_SITES.waste.includes(si) && ['wt', '폐기물 감축']].filter(Boolean);
    if (!si) tags.push(['ghg', `온실가스 감축 (${sitesTxt(TARGET_SITES.ghg)})`], ['re', `RE100 (${sitesTxt(TARGET_SITES.re)})`], ['wt', `폐기물 감축 (${sitesTxt(TARGET_SITES.waste)})`]);
    $(id).innerHTML = `<div class="si-head"><b class="si-name">${si || '전체 합계'}</b><span class="si-role ${info.tone}">${info.role}</span></div>` +
      `<div class="si-meta"><span class="si-k si-tk">적용 목표</span>` +
      (tags.length ? tags.map(([k, t]) => `<span class="si-tag" data-k="${k}">${t}</span>`).join('') : '<span class="si-none">없음</span>') + '</div>' +
      `<p class="si-desc">${info.desc}` +
      `<span class="si-items"><span class="si-k">관리 항목</span><span${items.length > 3 ? ` title="${esc(items.join(' · '))}"` : ''}>` +
      (items.length ? items.slice(0, 3).map(esc).join(' · ') + (items.length > 3 ? ` 외 ${items.length - 3}개` : '')
                    : '<span class="si-none">입력된 자료 없음</span>') + '</span></span></p>';
  }
  function setSite(si) {
    curSite = si;
    document.querySelectorAll('.site-seg button').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.site === si)));
    if (si && $('bs-site').value !== si) { $('bs-site').value = si; renderWxChart(); }   // 예측 근거의 기온 차트도 같은 거점으로
    if ($('tab-history').classList.contains('active')) renderHistory();
    else if ($('tab-roadmap').classList.contains('active')) renderRoadmapTab();
    else renderDash();
  }
  // 목표 카드 — 올해: 실적(누적) 게이지 + 연간 예측 게이지 / 지난 연도: 그 해 실적 게이지 + 달성 여부
  // 목표·데이터가 없으면 이전 값이 남지 않게 초기화
  function renderTargetCard(P, key, tgt, act, est, emptyMsg, isCur) {
    const $$ = id => $(P + id), sub = $$(`k-tgt-${key}-sub`);
    sub.className = 'kpi-sub';
    if (!tgt) {
      $$(`k-tgt-${key}`).textContent = '—'; $$(`k-tgt-${key}-rate`).textContent = '';
      setBar(P, `${key}-act`, 0, '—'); setBar(P, `${key}-pred`, 0, '—'); sub.textContent = emptyMsg; return null;
    }
    $$(`k-tgt-${key}`).textContent = fq(tgt.target);
    $$(`k-tgt-${key}-rate`).textContent = `(${fmt(tgt.rate, 1)}% 감축)`;
    if (!(act > 0)) {
      setBar(P, `${key}-act`, 0, '—'); setBar(P, `${key}-pred`, 0, '—'); sub.textContent = `${HEAD_SITE} 데이터 없음`; return null;
    }
    const a = act / tgt.target * 100;
    setBar(P, `${key}-act`, a, `${fmt(a, 1)}%(${fq(act)}t)`, a > 100 ? 'var(--red)' : 'var(--green)');
    if (!isCur) {
      sub.className = 'kpi-sub kpi-yoy ' + (a > 100 ? 'bad' : 'good');
      sub.textContent = a > 100 ? `✗ 목표보다 ${fq(act - tgt.target)}t 초과` : `✓ 달성 · 목표보다 ${fq(tgt.target - act)}t 적게 배출`;
      return a > 100 ? { over: true, msg: `목표를 ${fq(act - tgt.target)} tCO₂eq 넘었어요 (목표 ${fq(tgt.target)} · 실적 ${fq(act)})` } : { over: false };
    }
    sub.textContent = '';
    const p = est / tgt.target * 100;
    setBar(P, `${key}-pred`, p, `${fmt(p, 1)}%(${fq(est)}t)`, p > 100 ? 'var(--red)' : PRED_COLOR);
    $$(`pct-${key}-pred`).style.color = p > 100 ? 'var(--red)' : PRED_COLOR;
    return p > 100 ? { over: true, msg: `이대로면 목표를 ${fq(est - tgt.target)} tCO₂eq 넘을 전망이에요 (목표 ${fq(tgt.target)} · 연말 예측 ${fq(est)})` } : { over: false };
  }

  /* ── 올해 현황 ───────────────────────────────────────── */
  // 실적이 몇 월까지 들어왔나 (거점마다 배출원 자료가 있는 마지막 달) → { by: {거점: 월}, max, txt: '1~9월' · '대구 9월 · 제주·서울 4월까지' }
  function dataThrough(year, sites) {
    const by = Object.fromEntries(sites.map(s => [s, Math.max(0, ...energyRecs.filter(r => r.site === s && isEmit(r.type) && r.date?.startsWith(String(year))).map(r => +r.date.slice(5, 7)))]));
    const ms = [...new Set(Object.values(by).filter(Boolean))].sort((a, b) => b - a), max = ms[0] || 0;
    const txt = !max ? '' : ms.length === 1 ? `1~${max}월` : ms.map(m => `${sites.filter(s => by[s] === m).map(s => SITE_SHORT[s] || s).join('·')} ${m}월`).join(' · ') + '까지';
    return { by, max, txt };
  }
  function renderDash() {
    const si = curSite, today = new Date(), curYr = today.getFullYear();
    renderSiteInfo('site-info', si);
    const allTs = [...energyRecs, ...wasteRecs, ...metricRecs].map(r => r.updatedAt || r.createdAt).filter(Boolean).sort().reverse();
    $('hdr-updated').textContent = allTs.length ? '최근 업데이트: ' + fmtTs(allTs[0]) : '';
    // 오늘 날짜 대신 '실적이 몇 월까지 + 남은 달은 예측' · 최근 업데이트 (휴대폰은 머리 오른쪽이 숨겨져 여기서 봄)
    const thr = dataThrough(curYr, si ? [si] : SITES), upd = allTs.length ? new Date(allTs[0]) : null;
    $('cur-year-label').innerHTML = (thr.max ? `실적 ${esc(thr.txt)}${thr.max < 12 ? ' + 예측' : ''}` : '아직 입력 전 · 예측') +
      (upd ? `<span class="chip-upd"> · ${upd.getMonth() + 1}.${upd.getDate()} 업데이트</span>` : '');
    $('cur-year-label').title = `${today.toLocaleDateString('ko-KR')} 기준 · ` + (thr.max ? `거점마다 입력된 마지막 달: ${Object.entries(thr.by).map(([s, m]) => `${s} ${m ? `${m}월` : '없음'}`).join(' · ')} · 남은 달·빈 칸은 기상연동 예측` : '입력된 실적이 없어요');
    renderYearView('', curYr, si);
    renderDashToc();
  }

  /* ── 한 해 화면: 올해 현황(P '')과 실적 조회의 한 해(P 'y-', 올해 현황 화면 복제)가 같이 씀 ──
     올해 = 누적 실적 + 기상연동 예측 · 전년 동기 대비 / 지난 연도 = 연간 실적 · 전년 대비 (예측 없음) */
  /* 계산 근거에 쓰는 조각 (에너지원별 · 거점별 · 월별) — 올해 현황과 실적 조회가 같이 씀
     ey = 그 해 그 거점의 에너지 자료 · si = 거점 하나(없으면 세 거점 합계) */
  function calcRows(ey, si) {
    const typeRows = ts => ts.filter(t => !itemNA(si, t)).map(t => {
      const rs = ey.filter(r => r.type === t);
      return rs.length ? { k: t, sub: GHG[t].scope, amt: sumBy(rs, r => r.amount), amtU: GHG[t].unit, factor: GHG[t].desc, ghg: sumBy(rs, r => r.ghg) } : null;
    }).filter(Boolean);
    const siteRows = (test, f = r => r.ghg, src = ey) => si ? [] : SITES.map(st => {
      const rs = src.filter(r => r.site === st && test(r));
      return rs.length ? { k: st, ghg: sumBy(rs, f), col: SITE_COL[st] } : null;
    }).filter(Boolean);
    const monthRows = (test, f = r => r.ghg, src = ey) => {
      const by = {};
      src.filter(test).forEach(r => { const m = +r.date.slice(5, 7); by[m] = (by[m] || 0) + (+f(r) || 0); });
      return Object.keys(by).map(Number).sort((a, b) => a - b).map(m => ({ m, v: by[m] }));
    };
    return { typeRows, siteRows, monthRows };
  }

  // 카드 안 경고 이유 한 줄 (kind = up 늘어남 · chk 입력 확인(입력 권한만) · over 목표 초과) — 빈 글이면 지움
  //  세로 카드는 월별 막대 위에 · 가로 카드(사용량)는 이름 아래 왼쪽 둘째 줄에 (카드는 늘 두 줄 — 값·사용량은 오른쪽 두 줄)
  //  맨 앞 표시(⚠·🔍·▲)는 따로 감싸 둠 — 가로 카드에서는 바로 위 이름 옆 표시와 겹쳐서 숨김
  function whyLine(card, kind, text) {
    let el = card.querySelector(`.kpi-why.${kind}`);
    if (!text) { el?.remove(); card.classList.toggle('has-why', !!card.querySelector('.kpi-why')); return; }
    if (!el) {
      el = document.createElement('div'); el.className = `kpi-why ${kind}`;
      if (kind === 'chk') el.dataset.need = 'edit';
      const mb = card.querySelector('.kpi-mb'); mb ? card.insertBefore(el, mb) : card.append(el);
    }
    const m = /^(\S+)\s+([\s\S]*)$/u.exec(text);
    if (m) { const ic = document.createElement('span'); ic.className = 'wi'; ic.textContent = m[1]; el.replaceChildren(ic, ` ${m[2]}`); }
    else el.textContent = text;
    el.title = text;
    card.classList.add('has-why');
  }
  function renderYearView(P, year, si) {
    const $$ = id => $(P + id), curYr = new Date().getFullYear(), isCur = year === curYr;
    const yr = String(year), prevYr = String(year - 1), yS = yrShort(yr), pS = yrShort(prevYr);
    // 올해 = '1~9월 누적'처럼 실적이 들어온 달까지 (거점마다 다르면 가장 늦은 달 · 날짜 줄에 거점별로)
    const thr = isCur ? dataThrough(year, si ? [si] : SITES) : null, cumTxt = thr?.max ? `1~${thr.max}월 누적` : '올해 누적';
    $$('ghg-period').textContent = isCur ? cumTxt : `${yS} 연간 실적`;
    $$('use-period').textContent = isCur ? cumTxt : `${yS} 연간`;
    $$('yv').querySelectorAll('.tl-act').forEach(e => { e.textContent = isCur ? '누적' : '실적'; });
    ['own', 'law'].forEach(k => { $$(`row-${k}-pred`).hidden = !isCur; });   // 지난 연도엔 예측 줄 없음 (RE100·폐기물은 카드가 직접)

    const inView = r => !si || r.site === si;
    // 전체 합계: 목표를 모두 보여 주되 목표마다 대상 거점으로 집계 (온실가스 = 대구본원 · RE100 = 대구+제주 합산 · 폐기물 = 세 거점 합산)
    const T = si ? targetsFor(si) : { ghg: true, re: true, wt: v2 };
    setTargetView(T, si, { [P + 'tc-ghg']: 'ghg', [P + 'tc-base']: 'ghg', [P + 'tc-own']: 'ghg', [P + 'tc-law']: 'ghg', [P + 'tc-re']: 're', [P + 'tc-wt']: 'wt' },
                  P + 'sec-target', P + 'target-grid', P + 'tgt-site');
    const vdict = {};   // 목표마다 판정 { st: ok|no, txt } — 거점 설명의 판정 칩에 씀
    const reNote = 'RE100 = (자가발전 + 구매) ÷ 총 전력 · 폐기물 = 종량제 봉투 기준';
    $$('tgt-note').innerHTML = !isCur ? `${yS} 실적 기준 · ${T.ghg ? '온실가스 = Scope 1+2' : reNote}`
      : T.ghg ? '온실가스 = Scope 1+2 · 예측 = 기상연동 예측 · <a href="#sec-basis" class="hd-link">근거 보기 ↓</a>'
      : reNote;
    const ey = energyRecs.filter(r => r.date?.startsWith(yr) && inView(r));
    const wy = wasteRecs.filter(r  => r.date?.startsWith(yr) && inView(r));
    const prevRecs = energyRecs.filter(r => r.date?.startsWith(prevYr) && inView(r));
    const fc = isCur ? buildForecast(curYr, si) : null;

    // 전년 대비 → { v: 증감률%, p: 전년 값(지난 연도만) } | null
    //  올해: 올해 입력된 (거점·에너지원·월) 칸과 같은 칸의 작년 값끼리 (전년 동기) / 지난 연도: 연간 합계끼리
    const keyOf = r => `${r.site}|${r.type}|${r.date.slice(5, 7)}`;
    const agg = (recs, f) => recs.reduce((m, r) => { m[keyOf(r)] = (m[keyOf(r)] || 0) + (+f(r) || 0); return m; }, {});
    const yoy = (test, f = r => r.ghg) => {
      if (!isCur) {
        const pr = prevRecs.filter(test), p = sumBy(pr, f);
        return pr.length && p > 0 ? { v: (sumBy(ey.filter(test), f) - p) / p * 100, p } : null;
      }
      const cur = agg(ey.filter(test), f), prev = agg(prevRecs.filter(test), f);
      let c = 0, p = 0;
      Object.entries(cur).forEach(([k, v]) => { if (k in prev) { c += v; p += prev[k]; } });
      return p > 0 ? { v: (c - p) / p * 100 } : null;
    };
    const arrow = v => v > 0 ? '▲' : v < 0 ? '▼' : '';
    const setYoy = (id, o) => {
      const el = $$(id);
      el.className = 'kpi-sub kpi-yoy' + (o == null ? '' : o.v > 0.05 ? ' bad' : o.v < -0.05 ? ' good' : '');
      el.textContent = o == null ? (isCur ? '전년 동기 자료 없음' : '비교할 전년 자료 없음')
        : `${isCur ? '전년 동기 대비' : '전년 대비'} ${arrow(o.v)}${fmt(Math.abs(o.v), 1)}%` + (o.p != null ? ` · ${pS} ${fq(o.p)}` : '');
    };

    /* ── 카드 표시 ─────────────────────────────────────────────
       [늘어남 ⚠ 주황] ① 전년 동기(지난 연도는 연간) 대비 +10% 이상  ② 평년(지난 연도들의 같은 달 평균) 대비 +20% 이상
       [확인 필요 🔍]  ③ 입력 실수 의심 — 한 칸(거점·항목·월)이 그 거점·항목 평소 값(중앙값)의 3배 이상
       ①②는 환경성과라 누구나 보고, ③은 자료 품질이라 입력·수정·관리자만 봄 (고칠 수 있는 사람에게만)
       ②③은 견줄 지난 자료가 있을 때만 봄 · 늘면 좋은 항목(재생에너지·회생제동)은 보지 않음
       목표를 넘은 카드(빨강)는 따로 setOver()에서 — 목표가 있는 항목만 */
    const histRecs = energyRecs.filter(r => +(r.date || '').slice(0, 4) < +yr && inView(r));
    // 평년 대비: 올해 자료가 있는 달만, 지난 연도들의 같은 달 평균과 견줌
    const normOf = (test, f = r => r.ghg) => {
      const cur = {}, past = {};
      ey.filter(test).forEach(r => { const m = r.date.slice(5, 7); cur[m] = (cur[m] || 0) + (+f(r) || 0); });
      histRecs.filter(test).forEach(r => { const m = r.date.slice(5, 7), y = r.date.slice(0, 4); (past[m] ||= {})[y] = (past[m][y] || 0) + (+f(r) || 0); });
      let c = 0, n = 0, ms = 0; const yrs = new Set();
      Object.entries(cur).forEach(([m, v]) => {
        const o = past[m]; if (!o) return;
        const vs = Object.values(o);
        c += v; n += sumArr(vs) / vs.length; ms++;
        Object.keys(o).forEach(y => yrs.add(y));
      });
      return ms && n > 0 ? { v: (c - n) / n * 100, cur: c, norm: n, ms, yrs: [...yrs].sort() } : null;
    };
    // 입력 실수 의심: 같은 묶음(거점·항목) 다른 칸들의 중앙값보다 3배 이상 큰 칸 (견줄 칸이 4개 이상일 때만)
    //  recs = 모든 해 자료 (평소 값을 보려면 지난 연도까지 봐야 함) · val = 칸 값 · uom = 단위
    const spikeIn = (recs, val, uom) => {
      const cells = new Map();
      recs.filter(r => r.date).forEach(r => {
        const k = `${r.site}|${r.kind || r.type}|${r.date}`;
        cells.set(k, (cells.get(k) || 0) + (+val(r) || 0));
      });
      const pool = new Map();
      cells.forEach((v, k) => { const g = k.slice(0, k.lastIndexOf('|')); if (!pool.has(g)) pool.set(g, []); pool.get(g).push([k, v]); });
      const out = [];
      cells.forEach((v, k) => {
        const [site, type, date] = k.split('|');
        if (date.slice(0, 4) !== yr) return;   // 보고 있는 해의 칸만
        const others = pool.get(`${site}|${type}`).filter(([kk]) => kk !== k).map(([, vv]) => vv);
        if (others.length < 4) return;
        const med = medianOf(others);
        if (med > 0 && v >= med * AL.spike) out.push({ site, type, date, v, med, x: v / med, u: uom || GHG[type]?.unit || '' });
      });
      return out.sort((a, b) => b.x - a.x);
    };
    const spikeOf = test => spikeIn(energyRecs.filter(r => inView(r) && test(r)), r => r.amount);
    // 카드 한 장의 표시 → { up: [{ txt, why }], chk: [{ txt, why }] } | null
    const alertOf = (test, f = r => r.ghg, o = {}) => {
      const tags = [], chk = [];
      const yo = o.yoy !== undefined ? o.yoy : yoy(test, f);
      if (yo && yo.v >= AL.yoy) tags.push({ txt: `${isCur ? '전년 동기' : '전년'} 대비 ${fmt(yo.v, 1)}% 늘었어요`, why: `${isCur ? '올해 입력된 같은 칸(거점·항목·월)끼리' : '연간 합계끼리'} 견줬어요 · 기준 +${AL.yoy}%` });
      const nm = o.skipNorm ? null : normOf(test, f);
      if (nm && nm.v >= AL.norm) tags.push({ txt: `평년 대비 ${fmt(nm.v, 1)}% 높아요`, why: `${nm.yrs.map(yrShort).join('·')}년 같은 ${nm.ms}개월 평균 ${fq(nm.norm)} → 올해 ${fq(nm.cur)} · 기준 +${AL.norm}%` });
      const sp = o.skipSpike ? [] : spikeOf(test);
      if (sp.length) {
        const a = sp[0];
        chk.push({ txt: `입력 실수가 의심돼요 (평소의 ${fmt(a.x, 1)}배)`, why: `${fmtYM(a.date)} ${a.site} ${a.type} ${fq(a.v)}${a.u ? ' ' + a.u : ''} · 평소 ${fq(a.med)} · 기준 ${AL.spike}배${sp.length > 1 ? ` (이런 칸 ${sp.length}개)` : ''}` });
      }
      return tags.length || chk.length ? { up: tags, chk } : null;
    };
    // 카드에 배지 달기 (누르면 계산 근거 팝업에서 까닭을 봄)
    //  ⚠ = 늘어남(누구나) · 🔍 = 입력 확인 필요(입력·수정·관리자만, CSS가 숨김) · 빨강 = 목표 초과(setOver)
    const badge = (lb, cls, txt, tags) => {
      let b = lb.querySelector('.' + cls);
      if (!tags?.length) { b?.remove(); return; }
      if (!b) {
        b = document.createElement('span'); b.className = cls;
        if (cls === 'kpi-check') b.dataset.need = 'edit';   // 고칠 수 있는 사람에게만
        lb.append(b);
      }
      b.textContent = txt;
      b.title = tags.map(t => t.txt).join('\n');
    };
    const setAlert = (id, al) => {
      const el = $$(id), card = el?.closest('.kpi-card'); if (!card) return;
      const lb = card.querySelector('.kpi-label'); if (!lb) return;
      card.classList.toggle('alert-up', !!al?.up.length);
      badge(lb, 'kpi-alert', '⚠', al?.up);
      badge(lb, 'kpi-check', icn('search'), al?.chk);
      whyLine(card, 'up', al?.up?.length ? `⚠ ${al.up[0].txt}` : '');
      whyLine(card, 'chk', al?.chk?.length ? `${icn('search')} ${al.chk[0].txt}` : '');
    };
    // 목표를 넘었거나 넘을 전망인 카드 (빨강) — 목표가 있는 항목만 · 늘어남(주황)보다 셈
    //  keep    = 목표를 안 넘었을 때 되돌릴 ⚠ 표시 (총 온실가스 카드처럼 두 표시를 같이 쓰는 카드용)
    //  noBadge = 카드가 이미 '✗ 미달' 같은 판정을 글로 보여 주는 경우 — 색만 바꾸고 ▲는 달지 않음
    const setOver = (id, over, why, { keep = null, noBadge = false } = {}) => {
      const el = $$(id), card = el?.closest('.kpi-card'); if (!card) return;
      card.classList.toggle('alert-over', !!over);
      if (over) card.classList.remove('alert-up');
      const lb = card.querySelector('.kpi-label');
      if (!lb) return;
      if (noBadge) { badge(lb, 'kpi-alert', '⚠', keep?.up || null); card.title = over ? why : ''; return; }
      badge(lb, 'kpi-alert', over ? '▲' : '⚠', over ? [{ txt: why }] : (keep?.up || null));
      whyLine(card, 'over', over ? `▲ ${String(why).split(' · ')[0]}` : '');   // 목표 초과는 이유 한 줄 (늘어남 줄 대신)
      if (over) whyLine(card, 'up', '');
      else if (keep?.up?.length) whyLine(card, 'up', `⚠ ${keep.up[0].txt}`);
    };

    // ① 온실가스 (선택 거점) — Scope는 에너지원 기준으로 분류
    const isScope = sc => r => isEmit(r.type) && scopeOf(r.type) === sc;
    const s1 = sumBy(ey.filter(isScope('Scope 1')), r => r.ghg), s2 = sumBy(ey.filter(isScope('Scope 2')), r => r.ghg);
    const wTon = sumBy(wy, r => r.weightTon), wGhg = sumBy(wy, r => r.ghg || 0),
          wGhgNA = wy.length > 0 && !wy.some(r => r.ghg != null),   // 이 거점은 폐기물 계수 미산정(서울 등) — 0이 아니라 '미산정'
          hasE = ey.some(r => isEmit(r.type));   // 에너지 입력이 없으면 0 대신 '—'
    // 정수 부분은 크게, 소수 부분은 작게 (값은 그대로)
    const bigNum = v => { const [i, d] = fq(v).split('.'); return d ? `${i}<small class="dec">.${d}</small>` : i; };
    $$('k-total').innerHTML = hasE ? bigNum(s1 + s2) : '—';
    $$('k-s1').innerHTML    = hasE ? bigNum(s1) : '—';
    $$('k-s2').innerHTML    = hasE ? bigNum(s2) : '—';
    $$('k-waste').innerHTML = !wy.length ? '—' : wGhgNA ? '<span class="cmp-na">미산정</span>' : bigNum(wGhg);
    $$('k-waste-sub').textContent = wy.length ? `폐기물 ${fq(wTon)} ton · 소각 기준` : '-';
    // 출장(철도)은 거점 구분 없이 전사 기준 — 카드 숫자(폐기물)에 더하지 않고 따로 보여 줌
    const tripEl = $$('k-trip-sub'), tb = tripBatches.find(b => String(b.year) === String(year) && b.mode === 'rail' && b.summary);
    if (tripEl) { tripEl.hidden = !tb; tripEl.textContent = tb ? `출장(철도) ${fq(tb.summary.kg / 1000)} tCO₂eq · 전사 · 추정 ${tb.summary.n ? Math.round(tb.summary.D / tb.summary.n * 100) : 0}%` : ''; }
    if (hasE) {
      setYoy('k-total-yoy', yoy(r => isEmit(r.type)));
      setYoy('k-s1-yoy', yoy(isScope('Scope 1')));
      setYoy('k-s2-yoy', yoy(isScope('Scope 2')));
    } else ['k-total-yoy', 'k-s1-yoy', 'k-s2-yoy'].forEach(id => { $$(id).className = 'kpi-sub'; $$(id).textContent = '-'; });
    // 총 온실가스 연말 예측 (= 입력된 실적 + 아직 입력 안 된 거점·달의 기상연동 예측) · 전년 연간과 견줌 — 보고서에 쓸 숫자를 카드에서 바로
    const estTot = isCur && hasE && fc ? s1 + s2 + sumArr(fc.predGhgS1) + sumArr(fc.predGhgS2) : null;
    const prevTot = sumBy(prevRecs.filter(r => isEmit(r.type)), r => r.ghg);
    $$('k-total-est').innerHTML = estTot == null ? '' : `연말 예측 <b>${fq(estTot)}</b>t` +
      (prevTot > 0 ? ` · ${pS} ${fq(prevTot)}t <span class="${estTot <= prevTot ? 'good' : 'bad'}">${arrow(estTot - prevTot)}${fmt(Math.abs(estTot - prevTot) / prevTot * 100, 1)}%</span>` : '');
    $$('k-total-est').title = estTot == null ? '' : '연말 예측 = 입력된 실적 + 아직 입력 안 된 거점·달의 기상연동 예측 · 전년은 연간 실적';
    // Scope 3(폐기물)은 지난 연도만 전년 대비 — 봉투는 매달 사지 않아 올해 누적끼리 비교하면 들쭉날쭉
    const wPrev = wasteRecs.filter(r => r.date?.startsWith(prevYr) && inView(r)), wPrevGhg = sumBy(wPrev, r => r.ghg || 0);
    if (isCur || !wy.length) $$('k-waste-yoy').textContent = '';
    else setYoy('k-waste-yoy', wPrev.length && wPrevGhg > 0 ? { v: (wGhg - wPrevGhg) / wPrevGhg * 100, p: wPrevGhg } : null);
    // 카드 아래 월별 막대: 그 해 실적 · 올해 아직 입력 안 된 칸의 예측(옅게) · 전년 같은 달(회색 눈금) — 숫자 하나로는 안 보이는 흐름
    {
      const ghgMon = (rs, test) => monthlySum(rs.filter(test), r => r.ghg), wMon = rs => monthlySum(rs, r => r.ghg || 0);
      const predOf = (...arrs) => fc ? m12(i => { const v = arrs.reduce((a, arr) => a + (arr?.[i] || 0), 0); return v > 0 ? v : null; }) : null;
      const emit = r => isEmit(r.type);
      const put = (id, act, pred, prev, name, o = {}) => { $$(id).innerHTML = monthBars(m12(i => ({ m: i + 1, a: act[i], p: pred?.[i] ?? null, q: prev?.[i] ?? null })), { name, pS, ...o }); };
      put('k-total-mb', ghgMon(ey, emit), predOf(fc?.predGhgS1, fc?.predGhgS2), ghgMon(prevRecs, emit), '총 온실가스');
      put('k-s1-mb', ghgMon(ey, isScope('Scope 1')), predOf(fc?.predGhgS1), ghgMon(prevRecs, isScope('Scope 1')), 'Scope 1');
      put('k-s2-mb', ghgMon(ey, isScope('Scope 2')), predOf(fc?.predGhgS2), ghgMon(prevRecs, isScope('Scope 2')), 'Scope 2');
      // 폐기물은 봉투를 산 달에 몰려 있어(사는 달만 막대) 전년 같은 달과 견주지 않음 — 다른 곳(전년 대비)과 같은 규칙
      put('k-waste-mb', wMon(wy), null, null, 'Scope 3 (폐기물)', { act: '구매', note: '봉투 산 달 기준' });
      const mbs = ['k-total-mb', 'k-s1-mb', 'k-s2-mb', 'k-waste-mb'].map(id => $$(id)), has = sel => mbs.some(el => el.querySelector(sel));
      $$('ghg-unit').innerHTML = (has('.mb') ? '<span class="mb-legend">카드 아래 막대 = 월별<i></i>실적' + (has('.mb-p') ? '<i class="p"></i>예측' : '') +
        (has('.mb-q') ? `<i class="q"></i>${pS} 같은 달` : '') + '</span>' : '') + '단위: tCO₂eq';
    }

    /* ── 계산 근거 (카드를 누르면 뜨는 팝업에 쓸 자료) ─────────────
       무엇이 합쳐져 이 값이 됐는지: 에너지원별(사용량 × 배출계수) · 거점별 · 월별 · 경고 이유 */
    const CALC = calcStore[P] = {};
    const periodTxt = isCur ? `${yS} 올해 누적 (1월~이번 달)` : `${yS} 연간`;
    const siteTxt = si || `${SITES.length}개 거점 합계`;
    const { typeRows, siteRows, monthRows } = calcRows(ey, si);
    const calc = (id, o) => { CALC[id] = { period: periodTxt, site: siteTxt, unit: 'tCO₂eq', ...o }; };

    const alTotal = hasE ? alertOf(r => isEmit(r.type)) : null;
    const alS1 = hasE ? alertOf(isScope('Scope 1')) : null;
    const alS2 = hasE ? alertOf(isScope('Scope 2')) : null;
    setAlert('k-total', alTotal); setAlert('k-s1', alS1); setAlert('k-s2', alS2);
    // 폐기물(Scope 3): 봉투를 한꺼번에 사서 달마다 들쭉날쭉 → 전년·평년 비교는 하지 않고 입력 실수만 봄
    const wAll = wasteRecs.filter(r => inView(r)).map(r => ({ ...r, kind: '폐기물' }));
    const wSpike = spikeIn(wAll, r => (+r.bagSize || 0) * (+r.qty || 0), 'L');
    const alWaste = wSpike.length ? { up: [], chk: [{ txt: `입력 실수가 의심돼요 (평소의 ${fmt(wSpike[0].x, 1)}배)`,
      why: `${fmtYM(wSpike[0].date)} ${wSpike[0].site} 봉투 ${fq(wSpike[0].v)} L · 평소 ${fq(wSpike[0].med)} L · 기준 ${AL.spike}배` }] } : null;
    setAlert('k-waste', alWaste);

    const EF_NOTE = '배출량 = 사용량 × 배출계수 · 지난 연도까지 지금 계수로 다시 계산해 같은 기준으로 비교해요';
    calc('k-total', { title: '총 온실가스', sub: 'Scope 1 + Scope 2', value: hasE ? s1 + s2 : null,
      rows: typeRows(EMIT_TYPES), sites: siteRows(r => isEmit(r.type)), months: monthRows(r => isEmit(r.type)), alert: alTotal, note: EF_NOTE });
    calc('k-s1', { title: 'Scope 1 직접 배출', sub: '우리가 직접 태운 연료', value: hasE ? s1 : null,
      rows: typeRows(EMIT_TYPES.filter(t => scopeOf(t) === 'Scope 1')), sites: siteRows(isScope('Scope 1')), months: monthRows(isScope('Scope 1')), alert: alS1, note: EF_NOTE });
    calc('k-s2', { title: 'Scope 2 간접 배출', sub: '사서 쓴 전기·열', value: hasE ? s2 : null,
      rows: typeRows(EMIT_TYPES.filter(t => scopeOf(t) === 'Scope 2')), sites: siteRows(isScope('Scope 2')), months: monthRows(isScope('Scope 2')), alert: alS2, note: EF_NOTE });
    calc('k-waste', { title: 'Scope 3 기타 간접 (폐기물)', sub: '종량제 봉투 기준', value: wy.length && !wGhgNA ? wGhg : null,
      rows: wy.length ? [{ k: '종량제 봉투', sub: '소각·매립', amt: wTon, amtU: 'ton', factor: WASTE_EF_TXT, ghg: wGhg }] : [],
      sites: siteRows(() => true, r => r.ghg || 0, wy), months: monthRows(() => true, r => r.ghg || 0, wy), alert: alWaste,
      note: '발생량 = 봉투 용량(L) × 매수 × 0.174 kg/L · 배출량 = 발생량(ton) × ' + WASTE_EF_TXT + ' · 봉투를 한꺼번에 사는 달이 있어 전년·평년 비교는 하지 않아요' });

    // ② 사용량
    const amt = t => sumBy(ey.filter(r => r.type === t), r => r.amount);
    const show = (t, div) => ey.some(r => r.type === t) ? fq(amt(t) / div) : '—'; // 입력이 없으면 0 대신 '—'
    const elecKwh = amt('전력'), reSelf = amt(RE_SELF), reBuy = amt(RE_BUY);
    $$('k-elec').textContent     = show('전력', 1);
    $$('k-gas').textContent      = show('도시가스', 1);   // Nm³ (작은 그래프·표·팝업과 같은 단위)
    $$('k-heat').textContent     = show('지역난방', 1);
    $$('k-gasoline').textContent = show('휘발유', 1);
    $$('k-diesel').textContent   = show('경유', 1);
    [['card-re', 'k-re-kwh', reSelf], ['card-re-buy', 'k-re-buy', reBuy]].forEach(([card, id, v]) => {
      $$(id).textContent = v > 0 ? fq(v) : '-';
      $$(card).classList.toggle('kpi-placeholder', !(v > 0));
    });
    const wVol = sumBy(wy, r => (+r.bagSize || 0) * (+r.qty || 0));
    $$('k-waste-vol').textContent = wVol > 0 ? fq(wVol) : '—';
    // 폐기물 카드: 큰 숫자 = tCO₂eq · 아래 = 용량(L)과 무게(= 용량 L × 0.174 kg/L · 입력표와 같은 환산)
    $$('k-waste-vol-co2').textContent = !wy.length ? '—' : wGhgNA ? '미산정' : fq(wGhg);
    $$('k-waste-vol-amt').hidden = !wy.length;
    $$('k-waste-kg').textContent = wy.length ? `${fq(sumBy(wy, wKg))}\u00A0kg\u00A0(${fq(wTon)}\u00A0ton)` : '';
    // 사용량 카드: 큰 숫자 = 온실가스 환산값(tCO₂eq) · 아래 작은 줄 = 원래 단위의 사용량
    const co2Rs = rs => rs.length ? fq(sumBy(rs, r => r.ghg)) : '—';
    [['k-gas', '도시가스'], ['k-gasoline', '휘발유'], ['k-diesel', '경유'], ['k-elec', '전력'], ['k-heat', '지역난방']]
      .forEach(([id, t]) => {
        const na = itemNA(si, t), rs = ey.filter(r => r.type === t);
        $$(`${id}-co2`).textContent = na ? '해당 없음' : co2Rs(rs);
        $$(`${id}-amt`).hidden = na || !rs.length;
      });
    $$('k-re-kwh-co2').textContent = reSelf > 0 ? `${co2Txt(RE_SELF, reSelf)} (참고)` : '';   // 자가발전 = 회피 배출량 (co2Txt가 '회피'를 붙임)
    $$('k-re-buy-note').textContent = reBuy > 0 ? 'RE100 이행률에만 반영' : '';
    // 사용량 카드: 경고(늘면 나쁜 배출원만) + 계산 근거
    [['k-gas', '도시가스'], ['k-gasoline', '휘발유'], ['k-diesel', '경유'], ['k-elec', '전력'], ['k-heat', '지역난방']].forEach(([id, t]) => {
      const rs = ey.filter(r => r.type === t), isT = r => r.type === t;
      const al = itemNA(si, t) || !rs.length ? null : alertOf(isT);
      setAlert(`${id}-co2`, al);
      calc(`${id}-co2`, { title: t, sub: GHG[t].scope, value: rs.length ? sumBy(rs, r => r.ghg) : null,
        rows: typeRows([t]), sites: siteRows(isT), months: monthRows(isT), alert: al,
        amt: rs.length ? { v: sumBy(rs, r => r.amount), u: GHG[t].unit } : null, note: EF_NOTE });
    });
    calc('k-waste-vol-co2', { ...CALC['k-waste'], title: '폐기물', sub: '종량제 봉투 · Scope 3',
      amt: wy.length ? { v: wVol, u: 'L' } : null });
    setAlert('k-waste-vol-co2', alWaste);
    // 재생에너지는 늘어나는 게 좋아 경고 대상이 아님 — 계산 근거만
    calc('k-re-kwh', { title: '재생에너지 자가발전', sub: '태양광 등 · RE100 이행률에 반영', value: reSelf > 0 ? reSelf : null, unit: 'kWh',
      rows: [], sites: siteRows(r => r.type === RE_SELF, r => r.amount), months: monthRows(r => r.type === RE_SELF, r => r.amount),
      alert: null, note: `발전한 만큼 한전 전기를 덜 사 회피 배출량 ${fq(co2Of(RE_SELF, reSelf) || 0)} tCO₂eq (참고값 · 배출량에서 빼지는 않아요)` });
    calc('k-re-buy', { title: '재생에너지 구매', sub: '녹색프리미엄·REC·PPA', value: reBuy > 0 ? reBuy : null, unit: 'kWh',
      rows: [], sites: siteRows(r => r.type === RE_BUY, r => r.amount), months: monthRows(r => r.type === RE_BUY, r => r.amount),
      alert: null, note: 'RE100 이행률에만 반영하고 온실가스 배출량에는 반영하지 않아요' });

    // ③ RE100 이행률 = (자가발전 + 구매) ÷ 총 전력사용량(한전 구매 + 자가발전) — 대구본원·제주글로벌센터
    //    목표 = 정부 기준 이행 목표 (26년 15% → 30년 60% → 50년 100%) · 25년 이전은 목표 없음
    const reSt = si ? null : yearStat(yr, TARGET_SITES.re);   // 전체 합계 = 대구+제주 합산 (서울은 RE100 대상 아님)
    const rElec = reSt ? (reSt.elec ?? 0) : elecKwh, rSelf = reSt ? (reSt.reSelf ?? 0) : reSelf, rBuy = reSt ? (reSt.reBuy ?? 0) : reBuy;
    const cons = rElec + rSelf, reAll = rSelf + rBuy, reSub = $$('k-re-sub'), reGoal = reGoalOf(year);
    let rePred = null;
    reSub.className = 'kpi-sub tg-msg'; reSub.textContent = ''; reSub.title = '';
    if (T.re) {
      const reCard = $$('tc-re'), vd = $$('k-re-verdict');
      // 열쇠 ① 그 해 정부 목표 (청록) — 목표가 없는 해(25년까지)는 '목표는 26년부터' 글자만
      $$('k-re-goal').textContent = reGoal != null ? `목표 ${reGoal}%` : `목표는 ${yrShort(RE_FIRST)}부터`;
      $$('re-k-goal').classList.toggle('nog', reGoal == null);
      $$('re-k-goal').title = `${reGoal != null ? `${yS} 목표 ${reGoal}% · ` : ''}공공기관 RE100 이행 목표 (${yrShort(RE_FIRST)} ${RE_GOAL[RE_FIRST]}% → 30년 60% → 50년 100%)`;
      // 열쇠 ② 모자라면 몇 kWh 더 필요한지 · 아니면 전년 실적 (흐름)
      const k2 = $$('re-k-2'), prevRe = re100Of(yearStat(prevYr, si ? [si] : TARGET_SITES.re));
      const setK2 = need => {
        k2.innerHTML = need > 0 ? `<b>+${fq(Math.ceil(need))}kWh</b> 필요` : prevRe != null ? `${pS} 실적 <b>${fmt(prevRe, 1)}%</b>` : '';
        k2.title = need > 0 ? `${fmt(reGoal, 0)}%까지 ${needTxt(need)}` : prevRe != null ? `${pS} RE100 이행률 (실적)` : '';
        k2.hidden = !k2.innerHTML;
      };
      if (reAll > 0 && cons > 0) {
        const re100 = reAll / cons * 100, reEq = `${si ? '' : sitesTxt(TARGET_SITES.re, { sum: false }) + ' · '}(자가 ${fq(rSelf)} + 구매 ${fq(rBuy)}) ÷ 총 ${fq(cons)} kWh`;
        // 올해 연말 예측 — 전력·자가발전은 남은 달을 예측, 구매분은 입력된 양 그대로 (rePredParts와 같은 셈)
        let pp = null;
        if (isCur && !si) pp = rePredParts(curYr, TARGET_SITES.re);   // 전체 합계: 대구·제주를 각각 예측해 합산
        else if (isCur && fc) {
          const pSelf = sumArr(fc.predEnergy[RE_SELF]), pElec = sumArr(fc.predEnergy['전력']);
          pp = { elec: rElec + pElec, self: rSelf + pSelf, buy: rBuy, actCons: cons, actRe: reAll };
          pp.cons = pp.elec + pp.self; pp.re = pp.self + pp.buy;
        }
        rePred = pp && pp.cons > 0 ? pp.re / pp.cons * 100 : null;
        const showPred = isCur && rePred != null;
        const v = isCur ? rePred : re100;   // 올해는 연말 예측으로, 지난 연도는 실적으로 목표 비교
        const need = reGoal != null && v != null && v < reGoal && (pp || !isCur)
          ? Math.max(0, reGoal / 100 * (pp ? pp.cons : cons) - (pp ? pp.re : reAll)) : 0;
        const st = reGoal == null || v == null ? 'na' : v >= reGoal ? 'ok' : 'no';
        // 숫자 줄: ■ 누적 14.5% □ 연말 예측 12.4% (지난 연도는 ■ 25년 실적 9.0%) — 목표와 견주는 값은 연말 예측
        //  지금까지 이행률은 1년치 구매가 한 번에 들어와 연중에는 높게 보일 수 있음
        $$('re-na').hidden = true; $$('re-n-a').hidden = false; $$('re-n-p').hidden = !showPred;
        $$('re-n-ak').textContent = isCur ? '누적' : `${yS} 실적`;
        $$('k-re-act').textContent = fmt(re100, 1);
        $$('k-re-pct').textContent = fmt(showPred ? rePred : re100, 1);
        $$('k-re-when').textContent = showPred ? '연말 예측' : '';
        $$('k-re-act').closest('.tg-nums').title = reEq;
        reCard.style.setProperty('--tgc', TG_COL[st]);
        // 막대: 옅은 굵은 막대 = 연말 예측 · 그 안의 진한 막대 = 누적 · 청록 눈금 = 목표
        // 링: 진한 호 = 누적(실적) · 옅은 호 = 연말 예측 · 흰 눈금 = 목표 — 100%를 향하는 지표라 막대 대신 원형
        $$('re-chart').innerHTML = ringSvg({ act: re100, est: showPred ? rePred : null, goal: reGoal, col: TG_COL[st], center: `${fmt(v ?? re100, 1)}%`,
          aria: `${isCur ? '누적' : `${yS} 실적`} ${fmt(re100, 1)}%${showPred ? ` · 연말 예측 ${fmt(rePred, 1)}%` : ''}${reGoal != null ? ` · 목표 ${reGoal}%` : ''}` });
        // 판정은 제목 옆에 짧게 (마우스를 올리면 전체 문장)
        vd.className = 're-verdict' + (st === 'ok' ? ' good' : st === 'no' ? ' bad' : '');
        vd.innerHTML = st === 'na' ? '' : (st === 'ok' ? '✓ 달성' : `✗ ${fmt(reGoal - v, 1)}%p 부족`) + (isCur ? '<span class="vs"> 전망</span>' : '');
        vd.title = vd.dataset.full = st === 'na' ? '' : st === 'ok' ? `✓ 목표 달성${isCur ? ' 전망 (연말 예측)' : ''}` : `✗ 목표까지 ${fmt(reGoal - v, 1)}%p${isCur ? ' (연말 예측)' : ''}`;
        setK2(need);
        const reMiss = st === 'no';
        if (st !== 'na') vdict.re = reMiss ? { st: 'no', txt: `✗ ${fmt(reGoal - v, 1)}%p 부족` } : { st: 'ok', txt: '✓ 달성' };
        setOver('k-re-pct', reMiss, `RE100 이행 목표 ${isCur ? '미달 전망' : '미달'} · 목표 ${fmt(reGoal, 1)}% · ${isCur ? '연말 예측' : '실적'} ${fmt(v || 0, 1)}%`, { noBadge: true });
        // 계산 근거: 올해는 연말 예측 셈(남은 달 예측 포함)을, 지난 연도는 실적 셈을 보여 줌
        const fE = Math.round(showPred ? pp.elec : rElec), fS = Math.round(showPred ? pp.self : rSelf), fB = Math.round(showPred ? pp.buy : rBuy);
        const r1 = x => Math.round(x * 10) / 10;   // 이행률은 소수 첫째 자리까지
        const reSites = si ? [si] : TARGET_SITES.re;
        calc('k-re-pct', { title: 'RE100 이행률', sub: '재생에너지로 쓴 전기의 비율', site: si || sitesLabel(TARGET_SITES.re),
          period: showPred ? `${yS} 연말 예측` : `${yS}년`, value: r1(showPred ? rePred : re100), unit: '%',
          rows: [], sites: [], months: [],
          vs: reGoal == null || v == null ? null : { k: showPred ? `${yS} 연말 예측` : `${yS} 실적`, v, t: reGoal, tk: '정부 목표', unit: '%', lower: false, est: isCur },
          fc: showPred ? fcReOf(curYr, reSites) : null,
          src: [{ k: '전력·자가발전·구매', ...S_IN_E }, ...(showPred ? [S_FC(si || '')] : []),
                { k: '정부 이행 목표', v: reGoal != null ? `${fmt(reGoal, 0)}%` : null, kind: 'fix', from: `공공기관 RE100 이행 목표 (${yrShort(RE_FIRST)} ${RE_GOAL[RE_FIRST]}% → 30년 60% → 50년 100%)` }],
          formula: { parts: [{ group: [{ k: showPred ? '자가발전 (남은 달 예측 포함)' : '자가발전', v: fS, u: 'kWh' }, { k: '구매 (녹색프리미엄 등)', v: fB, u: 'kWh', op: '+' }] },
                             { k: showPred ? '총 전력사용량 (남은 달 예측 포함)' : '총 전력사용량 (한전 + 자가발전)', v: fE + fS, u: 'kWh', op: '÷' }],
            result: { k: showPred ? `${yS} 연말 예측` : `${yS} 이행률`, v: r1(showPred ? rePred : re100), u: '%' } },
          facts: [{ k: `${yS} 정부 목표`, v: reGoal == null ? null : `${fmt(reGoal, 1)}%` },
                  ...(showPred ? [{ k: '지금까지 이행률 (입력된 달까지)', v: `${fmt(re100, 1)}%` },
                                  ...(fB > 0 ? [{ k: '구매분 처리', v: '입력된 양 그대로 (남은 달로 늘리지 않음)' }] : [])] : []),
                  ...(reGoal != null && v != null ? [{ k: v >= reGoal ? '목표보다 높음 (달성)' : '목표까지', v: `${fmt(Math.abs(v - reGoal), 1)}%p` }] : []),
                  ...(need > 0 ? [{ k: '목표까지 더 필요한 재생에너지', v: Math.ceil(need), u: 'kWh' }] : [])],
          over: reMiss ? `RE100 이행 목표 ${isCur ? '미달 전망' : '미달'} · 목표 ${fmt(reGoal, 1)}%${need > 0 ? ` · ${needTxt(need)}` : ''}` : '',
          note: (showPred ? '지금까지 이행률은 1년치 구매가 이미 들어와 있어 연중에는 높게 보일 수 있어요 — 남은 달 전기 사용까지 더한 연말 예측으로 목표와 견줘요 · ' : '') +
                '자가발전은 쓴 전기이자 만든 전기라 분모·분자에 모두 들어가요 · 구매분은 이행률에만 반영하고 배출량에는 반영하지 않아요' });
      } else {
        $$('re-na').hidden = false; $$('re-n-a').hidden = $$('re-n-p').hidden = true;
        $$('k-re-act').textContent = $$('k-re-pct').textContent = '—'; $$('k-re-when').textContent = '';
        $$('re-chart').innerHTML = ringSvg({ aria: '재생에너지 자료 없음' });
        vd.textContent = ''; vd.className = 're-verdict'; vd.title = '';
        reCard.style.setProperty('--tgc', TG_COL.na);
        setK2(0);
        setOver('k-re-pct', false, '', { noBadge: true });
        calc('k-re-pct', { title: 'RE100 이행률', sub: '재생에너지로 쓴 전기의 비율', site: si || sitesLabel(TARGET_SITES.re), value: null, unit: '%',
          empty: '재생에너지 자료가 없어요', rows: [], sites: [], months: [], note: '자가발전·구매 실적을 입력하면 이행률이 계산돼요' });
      }
    }

    // ④ 온실가스 감축 목표 대비 실적 + 감축 로드맵 — 대구본원을 고를 때만 (Scope 1+2)
    if (T.ghg) {
      const totalDgb = dgbOf(yr);
      const dataMonths = new Set(energyRecs.filter(r => r.date?.startsWith(yr) && r.site === HEAD_SITE && isEmit(r.type)).map(r => r.date.slice(5, 7))).size;
      const annualEst = !isCur ? null : fc?.annualPred ?? (dataMonths > 0 ? totalDgb * 12 / dataMonths : 0);
      const rm = ROADMAP[year], lr = LAW_RATE[year], b = baseOf(year);
      const vOwn = renderTargetCard(P, 'own', rm ? { target: rm.target, rate: ownRate(year) } : null, totalDgb, annualEst, `자체 로드맵 목표 없음 (${yearSpan(ROADMAP)})`, isCur);
      const vLaw = renderTargetCard(P, 'law', lr !== undefined && b ? { target: b * (1 - lr / 100), rate: lr } : null, totalDgb, annualEst, `법적 권장감축률 없음 (${yearSpan(LAW_RATE)})`, isCur);
      const ownT0 = rm ? rm.target : null, lawT0 = lr !== undefined && b ? b * (1 - lr / 100) : null;
      const gv = renderGhgTarget(P, { act: totalDgb, est: annualEst, own: ownT0, law: lawT0, base: b || null, isCur, yS });
      if (gv) vdict.ghg = gv;
      $$('k-tgt-base').textContent = b ? fq(b) : '—';
      $$('k-tgt-base-yr').textContent = `${yS} 적용값 (해마다 조정)`;
      $$('k-tgt-base-sub').textContent = isCur || !(totalDgb > 0) || !b ? `${HEAD_SITE} 기준`
        : `${yS} 실적 ${fq(totalDgb)}t · 기준 대비 ${totalDgb <= b ? '▼' : '▲'}${fmt(Math.abs(b - totalDgb) / b * 100, 1)}%`;
      // 목표를 넘었으면 빨강 — 목표 카드에 · 거점이 대구본원(목표 적용 거점)이면 총 온실가스 카드에도
      setOver('k-tgt-own', vOwn?.over, `자체 배출목표 초과 · ${vOwn?.msg || ''}`);
      setOver('tg-verdict', gv?.st === 'no', `온실가스 배출목표 ${isCur ? '초과 전망' : '초과'}`, { noBadge: true });
      setOver('k-tgt-law', vLaw?.over, `법적 배출목표 초과 · ${vLaw?.msg || ''}`);
      const overGhg = si === ORG_SITE && (vOwn?.over || vLaw?.over);
      // 목표 카드 계산 근거 — 목표는 대구본원 기준
      //  맨 위에 '연말 예측(지난 연도는 실적) vs 목표' 판정 → 목표 식 → 연말 예측은 이렇게(실적 + 남은 달 예측) → 숫자 출처
      const tSite = ORG_SITE, act = isCur ? annualEst : totalDgb, actK = isCur ? `${yS} 연말 예측` : `${yS} 실적`;
      const fcG = isCur ? fcGhgOf(yr, [tSite]) : null;
      const vsOf = (t, tk) => t == null || !(act > 0) ? null : { k: actK, v: act, t, tk, unit: 'tCO₂eq', gu: 't', lower: true, est: isCur, d: 3 };
      calc('k-tgt-base', { title: '기준배출량', sub: '배출목표의 바탕이 되는 값', period: `${yS} 적용값`, site: tSite, value: b || null, unit: 'tCO₂eq',
        empty: '이 해의 기준배출량이 없어요', rows: [], sites: [], months: [],
        facts: [{ k: '적용 연도', v: `${yS}` }, { k: '대상', v: tSite }],
        note: '배출목표를 정하는 바탕이 되는 값이에요 · 해마다 조정되며 데이터 관리 → 연도 마감·로드맵에서 고쳐요' });
      const ownT = rm ? rm.target : null, lawT = lr !== undefined && b ? b * (1 - lr / 100) : null;
      calc('k-tgt-own', { title: '자체 배출목표', sub: 'NIA 감축 로드맵', period: `${yS} 목표`, site: tSite, value: ownT, unit: 'tCO₂eq',
        empty: `자체 로드맵 목표가 없는 해예요 (${yearSpan(ROADMAP)})`, rows: [], sites: [], months: [],
        vs: vsOf(ownT, '자체 목표'), valueK: `${yS} 자체 목표`,
        formula: !rm || !b ? null : { parts: [{ k: `기준배출량 (${yS})`, v: b, u: 't' }, { k: `남길 비율 (100 − ${fmt(ownRate(year), 1)}%)`, v: `${fmt(100 - ownRate(year), 1)}%`, op: '×' }],
          result: { k: `${yS} 자체 목표`, v: rm.target, u: 't' } },
        fc: fcG, src: srcGhg(yr, { base: b, rateK: '자체 감축률·목표배출량', rateV: rm ? `${fmt(ownRate(year), 1)}%` : null, est: isCur }),
        over: vOwn?.over ? `자체 배출목표 ${isCur ? '초과 전망' : '초과'} · ${vOwn.msg}` : '',
        note: 'NIA가 스스로 정한 연도별 목표예요 · 데이터 관리 → 연도 마감·로드맵에서 고쳐요' });
      calc('k-tgt-law', { title: '법적 배출목표', sub: '정부 권장감축률 적용', period: `${yS} 목표`, site: tSite, value: lawT, unit: 'tCO₂eq',
        empty: `권장감축률이 없는 해예요 (${yearSpan(LAW_RATE)})`, rows: [], sites: [], months: [],
        vs: vsOf(lawT, '법적 목표'), valueK: `${yS} 법적 목표`,
        formula: lr === undefined || !b ? null : { parts: [{ k: `기준배출량 (${yS})`, v: b, u: 't' }, { k: `남길 비율 (100 − ${fmt(lr, 1)}%)`, v: `${fmt(100 - lr, 1)}%`, op: '×' }],
          result: { k: `${yS} 법적 목표`, v: lawT, u: 't' } },
        fc: fcG, src: srcGhg(yr, { base: b, rateK: '권장감축률', rateV: lr === undefined ? null : `${fmt(lr, 1)}%`, est: isCur }),
        over: vLaw?.over ? `법적 배출목표 ${isCur ? '초과 전망' : '초과'} · ${vLaw.msg}` : '',
        note: '기준배출량에 정부 권장감축률을 적용한 목표예요' });
      setOver('k-total', overGhg, [vOwn?.over ? '자체' : '', vLaw?.over ? '법적' : ''].filter(Boolean).join('·') +
        ` 배출목표 ${isCur ? '초과 전망' : '초과'} · ${(vOwn?.over ? vOwn : vLaw)?.msg || ''}`, { keep: calcStore[P]?.['k-total']?.alert });
    } else { setOver('k-tgt-own', false); setOver('k-tgt-law', false); setOver('tg-verdict', false, '', { noBadge: true }); setOver('k-total', false, '', { keep: calcStore[P]?.['k-total']?.alert }); }
    // 전체 합계 = 세 거점 합산 목표
    const wv = T.wt ? renderWasteTarget(P, year, si || TARGET_SITES.waste, isCur) : null;
    if (wv?.t != null) vdict.wt = wv.over ? { st: 'no', txt: `✗ ${fq(wv.v - wv.t)}t 초과` } : { st: 'ok', txt: `✓ 여유 ${fq(wv.t - wv.v)}t` };
    setOver('k-wt-target', !!wv?.over, `폐기물 감축 목표 ${isCur ? '초과 전망' : '초과'}`, { noBadge: true });
    siteVerdicts(P, vdict, isCur, year);   // 거점 설명의 '적용 목표' 칩 → 판정 칩 (첫 화면에서 '목표 지키나?')

    // 차량연료를 쓰지 않는 거점(서울·제주): 휘발유·경유 카드는 '해당 없음', 월별 차량연료 차트는 빼고 온실가스 차트를 넓게
    const fuelNA = itemNA(si, '휘발유') && itemNA(si, '경유');
    [['card-gasoline', 'k-gasoline', '휘발유'], ['card-diesel', 'k-diesel', '경유'], ['card-heat', 'k-heat', '지역난방']].forEach(([card, id, t]) => {
      $$(card).classList.toggle('kpi-placeholder', itemNA(si, t));
      if (itemNA(si, t)) { $$(`${id}-co2`).textContent = '해당 없음'; $$(`${id}-amt`).hidden = true; }
    });
    $$('k-s1-sub').textContent = fuelNA ? '도시가스' : '도시가스·휘발유·경유';
    $$('cf-card').hidden = fuelNA;   // 온실가스 그래프를 넓게 하는 것은 renderYearCharts에서 (자료 없는 그래프와 함께)

    // ⑤ 승강기 회생제동 발전량 (대구본원만 · 자원·기타 지표 카드 · 배출량에서 다시 빼지 않는 참고 지표)
    $$('card-regen').hidden = !!si && itemNA(si, SAVE_REGEN);   // 전체 합계에서는 대구본원 값
    const regenRecs = ey.filter(r => r.type === SAVE_REGEN), regen = sumBy(regenRecs, r => r.amount);
    if (regenRecs.length) {
      const months = new Set(regenRecs.map(r => r.date.slice(5, 7))).size, ry = yoy(r => r.type === SAVE_REGEN, r => r.amount);
      calc('k-regen', { title: '승강기 회생제동 발전량', sub: `${si ? '' : ORG_SITE + ' · '}내려가는 승강기가 만든 전기`, value: regen, unit: 'kWh',
        rows: [], sites: siteRows(r => r.type === SAVE_REGEN, r => r.amount), months: monthRows(r => r.type === SAVE_REGEN, r => r.amount),
        alert: null, note: `그만큼 한전 전기를 덜 써서 회피 배출량 ${fq(calcGHG('전력', regen))} tCO₂eq (참고값 · 배출량에서 빼지는 않아요)` });
      $$('k-regen').textContent = fq(regen);
      $$('k-regen-sub').textContent = `${si ? '' : HEAD_SITE + ' · '}${months}개월 ${isCur ? '누적' : '합계'}` + (ry == null ? '' : ` · ${isCur ? '전년 동기' : '전년'} 대비 ${arrow(ry.v)}${fmt(Math.abs(ry.v), 1)}%`) +
        ` · 회피 ${fq(calcGHG('전력', regen))} tCO₂eq` + (elecKwh > 0 ? ` · 전력의 ${fmt(regen / elecKwh * 100, 2)}%` : '');
    } else {
      calc('k-regen', { title: '승강기 회생제동 발전량', sub: '내려가는 승강기가 만든 전기', value: null, unit: 'kWh', rows: [], sites: [], months: [], alert: null, note: '' });
      $$('k-regen').textContent = '-';
      $$('k-regen-sub').textContent = isCur ? '데이터 입력 → 에너지원 \'승강기 회생제동\'' : '-';
    }

    // ⑥ 거점별 분류 (거점 '전체'일 때): 온실가스 비중 막대 + 거점 × 에너지원 표
    $$('site-breakdown').style.display = si ? 'none' : '';
    if (!si) renderSiteBreakdown(P, yr, isCur, yoy);

    // ⑦ 자원·기타 지표 (2단계)
    if (v2) renderEnvKpis(P, si, year, isCur);

    // 빈 칸 정리 (자원·기타 · 사용량) · 경고 표시 읽는 법
    tidyEnv(P); tidyUsage(P, ey);
    // 자료가 없어 '해당 없음·추후 예정'인 카드는 눌러도 보여 줄 게 없으니 키보드 차례에서도 뺌
    document.querySelectorAll(`#${P ? 'y-yv' : 'yv'} .kpi-click`).forEach(c =>
      c.setAttribute('tabindex', c.classList.contains('kpi-placeholder') ? '-1' : '0'));
    renderYearCharts(P, ey, wy, fc, si, year);
  }

  /* ── 거점별 에너지 사용량 (전체 합계 · 올해 현황 / 실적 조회 그 해 자세히) ──
     위 = 온실가스(Scope 1+2) 거점별 비중 막대 · 아래 = 거점 × 에너지원 표 (온실가스 줄이 맨 위, 칸 아래 = 전년(동기) 대비)
     에너지 칸 위 = 사용량, 아래 = 온실가스 환산 · 칸이나 거점 이름을 누르면 그 거점의 그 해 월별 자료 */
  const SB_ROWS = [
    { ic: 'bolt', label: '전력', unit: 'kWh', ts: ['전력'], div: 1 },
    { ic: 'flame', label: '도시가스', unit: 'Nm³', ts: ['도시가스'], div: 1 },
    { ic: 'heat', label: '지역난방', unit: 'GJ', ts: ['지역난방'], div: 1 },
    { ic: 'pump', label: '차량연료', unit: 'L · 휘발유+경유', ts: ['휘발유', '경유'], div: 1 },
  ];
  // 전년 대비 알약 (늘면 빨강 · 줄면 초록 · ±0.05% 안쪽은 회색 →)
  const yoyPill = o => !o ? '' : `<span class="dpill ${o.v > 0.05 ? 'bad' : o.v < -0.05 ? 'good' : 'flat'}">${o.v > 0.05 ? '▲' : o.v < -0.05 ? '▼' : '→ '}${fmt(Math.abs(o.v), 1)}%</span>`;
  function renderSiteBreakdown(P, yr, isCur, yoy) {
    const recs = energyRecs.filter(r => r.date?.startsWith(yr) && SITES.includes(r.site)), yS = yrShort(yr);
    const pick = (s, f) => recs.filter(r => (!s || r.site === s) && f(r));
    const ghgOf = s => { const rs = pick(s, r => isEmit(r.type)); return rs.length ? sumBy(rs, r => r.ghg) : null; };
    const g = Object.fromEntries(SITES.map(s => [s, ghgOf(s)])), tot = ghgOf(null);
    const pct = s => tot > 0 && g[s] != null ? g[s] / tot * 100 : null;
    // ① 온실가스 비중 막대 (거점 색 · 칸 사이 2px)
    $(P + 'sb-share').innerHTML = !(tot > 0) ? '' :
      `<div class="sb-share-hd"><span>온실가스 (Scope 1+2) 거점별 비중</span><span class="sb-tot">${SITES.length}개 거점 합계 <b>${fq(tot)}</b> tCO₂eq</span></div>` +
      `<div class="sb-bar" role="img" aria-label="${esc(SITES.map(s => `${s} ${pct(s) == null ? '자료 없음' : `${fmt(pct(s), 1)}%`}`).join(', '))}">` +
      SITES.filter(s => g[s] > 0).map(s => `<i style="flex:${g[s]} 0 0;background:${SITE_COL[s]}" title="${esc(`${s} ${fq(g[s])} tCO₂eq (${fmt(pct(s), 1)}%)`)}"></i>`).join('') + '</div>' +
      `<div class="sb-leg">${SITES.map(s => `<span><i class="sb-dot" style="background:${SITE_COL[s]}"></i>${s} <b>${pct(s) == null ? '—' : `${fmt(pct(s), 1)}%`}</b></span>`).join('')}</div>`;
    // ② 거점 × 에너지원 표
    const btn = (s, ts, main, sub, title) => `<button type="button" class="sb-btn" data-site="${esc(s)}"${ts ? ` data-ts="${esc(ts.join(','))}"` : ''} title="${esc(title)}">` +
      `<span class="sb-a">${main}</span>${sub ? `<span class="sb-g">${sub}</span>` : ''}</button>`;
    const sumc = (main, sub) => `<td class="sb-sumc"><span class="sb-btn"><span class="sb-a">${main}</span>${sub ? `<span class="sb-g">${sub}</span>` : ''}</span></td>`;
    const months = s => new Set(pick(s, () => true).map(r => r.date.slice(5, 7))).size;
    const head = '<thead><tr><th>항목</th>' + SITES.map(s => {
      const n = months(s), sub = isCur ? (n ? `${n}개월 입력` : '입력 없음') : !n ? '자료 없음' : n < 12 ? `${n}개월` : '';
      return `<th><button type="button" class="sb-btn sb-site" data-site="${esc(s)}" title="${esc(`${s} ${yS} 월별 자료 보기`)}"><span><i class="sb-dot" style="background:${SITE_COL[s]}"></i>` +
        `<span class="nm-l">${s}</span><span class="nm-s">${SITE_SHORT[s]}</span></span>${sub ? `<small>${sub}</small>` : ''}</button></th>`;
    }).join('') + `<th class="sb-sumh"><span class="nm-l">${SITES.length}개 거점 합계</span><span class="nm-s">합계</span></th></tr></thead>`;
    const ghgRow = '<tr class="sb-ghg"><td class="sb-nm">온실가스<small>Scope 1+2 · tCO₂eq</small></td>' +
      SITES.map(s => `<td>${btn(s, null, g[s] == null ? '—' : fq(g[s]), yoyPill(g[s] == null ? null : yoy(r => r.site === s && isEmit(r.type))),
        `${s} ${yS} 온실가스 ${g[s] == null ? '자료 없음' : `${fq(g[s])} tCO₂eq`} · 누르면 월별 자료`)}</td>`).join('') +
      sumc(tot == null ? '—' : fq(tot), yoyPill(tot == null ? null : yoy(r => isEmit(r.type)))) + '</tr>';
    const rows = SB_ROWS.filter(r => SITES.some(s => !r.ts.every(t => itemNA(s, t)))).map(r => {
      const name = r.label, unit = r.unit.split(' ·')[0];
      const cells = SITES.map(s => {
        if (r.ts.every(t => itemNA(s, t))) return '<td class="sb-na">해당 없음</td>';
        const rs = pick(s, x => r.ts.includes(x.type));
        if (!rs.length) return `<td>${btn(s, r.ts, '—', '', `${s} ${name} 자료 없음 · 누르면 월별 자료`)}</td>`;
        const a = sumBy(rs, x => x.amount) / r.div, gg = sumBy(rs, x => x.ghg);
        return `<td>${btn(s, r.ts, fq(a), fq(gg), `${s} ${name} ${fq(a)} ${unit} · ${fq(gg)} tCO₂eq · 누르면 월별 자료`)}</td>`;
      }).join('');
      const all = pick(null, x => r.ts.includes(x.type));
      return `<tr><td class="sb-nm"><span class="sb-ic" aria-hidden="true">${icn(r.ic)} </span>${name}<small>${r.unit}</small></td>${cells}` +
        (all.length ? sumc(fq(sumBy(all, x => x.amount) / r.div), fq(sumBy(all, x => x.ghg))) : sumc('—', '')) + '</tr>';
    }).join('');
    $(P + 'sb-tbl').innerHTML = `${head}<tbody>${ghgRow}${rows}</tbody>`;
    $(P + 'sb-note').textContent = `${isCur ? '올해 누적' : `${yS} 연간`} · 칸을 누르면 그 거점의 월별 자료`;
    $(P + 'sb-legend').innerHTML = `<span><b>칸 위</b> 사용량 · <b>칸 아래</b> 온실가스 환산 (tCO₂eq)</span><span><b>▲▼</b> 온실가스 ${isCur ? '전년 동기' : '전년'} 대비</span>`;
  }

  /* ── 자원·기타 지표: 용수·친환경차 (선택 거점) ── */
  // 전년 대비 표시: cur = 올해(전년 동기 대비) / 지난 연도(전년 대비, 전년 값 함께)
  const yoyLabel = (el, v, cur = true, prevTxt = '') => {
    el.className = 'kpi-sub kpi-yoy' + (v == null ? '' : v > 0.05 ? ' bad' : v < -0.05 ? ' good' : '');
    el.textContent = v == null ? (cur ? '전년 동기 자료 없음' : '비교할 전년 자료 없음')
      : `${cur ? '전년 동기 대비' : '전년 대비'} ${v > 0 ? '▲' : v < 0 ? '▼' : ''}${fmt(Math.abs(v), 1)}%` + (prevTxt ? ` · ${prevTxt}` : '');
  };
  // 친환경차: (연도, 거점들) → { all, green, rate } (연말 기준, 입력이 없으면 null)
  function evStat(y, sites) {
    const pick = item => metricRecs.filter(r => r.item === item && r.period === String(y) && sites.includes(r.site));
    const a = pick(EV_ALL), g = pick(EV_GREEN);
    if (!a.length && !g.length) return null;
    const all = sumBy(a, r => r.value), green = sumBy(g, r => r.value);
    return { all, green, rate: all > 0 ? green / all * 100 : null };
  }
  function renderEnvKpis(P, si, year, isCur) {
    const $$ = id => $(P + id), yr = String(year), prevYr = String(year - 1), sites = si ? [si] : SITES, yEl = $$('k-water-yoy');
    // 용수: 올해 누적 + 전년 동기 대비 (올해 입력된 거점·월과 같은 칸끼리) / 지난 연도: 연간 합계 + 전년 대비
    const water = y => metricRecs.filter(r => r.item === WATER && r.period.startsWith(y + '-') && sites.includes(r.site));
    const cur = water(yr), prevAll = water(prevYr), curSum = sumBy(cur, r => r.value);
    const waterNA = allNA(si, WATER), evNA = allNA(si, EV_ALL);   // 거점별 적용 항목에서 뺀 거점
    $$('card-water')?.classList.toggle('tgt-na', waterNA);
    $$('card-ev')?.classList.toggle('tgt-na', evNA);
    $$('k-water').textContent = waterNA ? '-' : cur.length ? fq(curSum) : '-';
    if (waterNA) { yEl.className = 'kpi-sub'; yEl.textContent = '해당 없음'; }
    else if (!cur.length) { yEl.className = 'kpi-sub'; yEl.textContent = isCur ? '데이터 입력 → 기타 지표' : '-'; }
    else if (isCur) {
      const prev = Object.fromEntries(prevAll.map(r => [`${r.site}|${r.period.slice(5)}`, r.value]));
      let c = 0, p = 0;
      cur.forEach(r => { const k = `${r.site}|${r.period.slice(5)}`; if (k in prev) { c += r.value; p += prev[k]; } });
      yoyLabel(yEl, p > 0 ? (c - p) / p * 100 : null);
    } else {
      const p = sumBy(prevAll, r => r.value);
      yoyLabel(yEl, prevAll.length && p > 0 ? (curSum - p) / p * 100 : null, false, p > 0 ? `${yrShort(prevYr)} ${fq(p)}` : '');
    }
    // 친환경차: 올해는 값이 없으면 가장 최근 연도 값 / 지난 연도는 그 해 연말 값만
    const evYears = [...new Set(metricRecs.filter(r => r.item === EV_ALL || r.item === EV_GREEN).map(r => r.period))]
      .filter(y => /^\d{4}$/.test(y) && (isCur ? y <= yr : y === yr)).sort().reverse();
    const ev = evYears.map(y => ({ y, s: evStat(y, sites) })).find(o => o.s);
    const evCalc = o => { (calcStore[P] ||= {})['k-ev'] = { title: icn('battery') + ' 친환경차 전환율', sub: '업무용 차량 중 친환경차 비율',
      period: `${yrShort(yr)}`, site: si || `${SITES.length}개 거점 합계`, unit: '%', rows: [], sites: [], months: [], ...o }; };
    $$('k-ev-bar').innerHTML = '';
    if (evNA) { $$('k-ev').textContent = '-'; $$('k-ev-sub').textContent = '해당 없음';
      evCalc({ value: null, empty: '이 거점은 해당 없는 항목이에요' }); }
    else if (ev && ev.s.rate != null) {
      evCalc({ value: ev.s.rate, period: `${yrShort(ev.y)} ${ev.y === yr && isCur ? '현재' : '말'} 기준`,
        formula: { parts: [{ k: '친환경차', v: ev.s.green, u: '대' }, { k: '업무용 차량', v: ev.s.all, u: '대', op: '÷' }],
          result: { k: '전환율', v: ev.s.rate, u: '%' } },
        facts: [{ k: '아직 전환하지 않은 차', v: ev.s.all - ev.s.green, u: '대' }],
        note: '전기·수소차를 친환경차로 봐요 · 연말 보유 대수 기준 (올해는 지금 기준)' });
      $$('k-ev').textContent = fmt(ev.s.rate, 1);
      $$('k-ev-sub').textContent = `${yrShort(ev.y)} ${ev.y === yr && isCur ? '현재' : '말'} · 업무용 ${fmt(ev.s.all, 0)}대 중 ${fmt(ev.s.green, 0)}대`;
      // 원형 링 (전환율 → 100%) · 대수는 아래 설명 줄에
      const nAll = Math.round(ev.s.all), nG = Math.round(ev.s.green), bar = $$('k-ev-bar');
      bar.className = 'ev-ring';
      bar.innerHTML = ringSvg({ act: ev.s.rate, col: 'var(--green)', size: 40, aria: `업무용 ${nAll}대 중 친환경차 ${nG}대 · 전환율 ${fmt(ev.s.rate, 1)}%` });
    } else {
      $$('k-ev').textContent = '-';
      $$('k-ev-sub').textContent = ev ? `${yrShort(ev.y)} 업무용 차량 0대` : isCur ? '데이터 입력 → 기타 지표' : '-';
      evCalc({ value: null, empty: ev ? '업무용 차량이 0대로 입력돼 있어요' : '친환경차 자료가 없어요',
        note: '데이터 입력 → 기타 지표에서 업무용 차량 수와 친환경차 수를 넣으면 계산돼요' });
    }
    // 용수 계산 근거 (누르면 뜨는 팝업) — 거점별·월별 사용량
    const wBy = (key, keyOf) => {
      const by = {};
      cur.forEach(r => { const k = keyOf(r); by[k] = (by[k] || 0) + (+r.value || 0); });
      return Object.keys(by).sort().map(k => ({ k: key(k), v: by[k], col: SITE_COL[k] }));
    };
    (calcStore[P] ||= {})['k-water'] = {
      title: icn('drop') + ' 용수 사용량', sub: '상수도', value: waterNA || !cur.length ? null : curSum, unit: '㎥',
      period: isCur ? `${yrShort(yr)} 올해 누적 (1월~이번 달)` : `${yrShort(yr)} 연간`, site: si || `${SITES.length}개 거점 합계`,
      rows: [], sites: si ? [] : wBy(k => k, r => r.site).map(x => ({ k: x.k, ghg: x.v, col: x.col })),
      months: wBy(k => k, r => r.period.slice(5)).map(x => ({ m: +x.k, v: x.v })),
      alert: null, note: waterNA ? '이 거점은 해당 없는 항목이에요' : '달마다 입력한 상수도 사용량을 더한 값이에요',
    };
    renderOrgKpis(P, yr, isCur, si);
  }
  // PUE · 클라우드 전환률 (기관 전체 · 연도별) — 올해는 값이 없으면 가장 최근 연도 값 / 지난 연도는 그 해 값만 · 전년 대비 함께
  function orgStat(y, pueSites = PUE_SITES) {
    const v = item => metricOf(String(y), ORG_SITE, item)?.value;
    const sum = item => { const rs = pueSites.map(s => metricOf(String(y), s, item)).filter(Boolean); return rs.length ? sumBy(rs, r => r.value) : null; };
    const t = sum(PUE_TOTAL), it = sum(PUE_IT), all = v(CL_ALL), done = v(CL_DONE);
    return { pue: t != null && it > 0 ? t / it : null, t, it, cloud: all > 0 && done != null ? done / all * 100 : null, all, done };
  }
  function renderOrgKpis(P, yr, isCur, si) {
    const $$ = id => $(P + id), pueSites = si ? PUE_SITES.filter(s => s === si) : PUE_SITES;
    const orgStat0 = orgStat; const orgStatS = y => orgStat0(y, pueSites);
    const ys = [...new Set(metricRecs.filter(r => [PUE_TOTAL, PUE_IT, CL_ALL, CL_DONE].includes(r.item)).map(r => r.period))]
      .filter(y => /^\d{4}$/.test(y) && (isCur ? y <= yr : y === yr)).sort().reverse();
    const pick = key => ys.find(y => orgStatS(y)[key] != null);
    const oCalc = (id, o) => { (calcStore[P] ||= {})[id] = { period: `${yrShort(yr)}`, site: si || '기관 전체',
      rows: [], sites: [], months: [], ...o }; };
    const show = (key, valId, subId, fmtV, detail, diffTxt, mk) => {
      const y = pick(key), sub = $$(subId);
      sub.className = 'kpi-sub';
      if (!y) {
        $$(valId).textContent = '-'; sub.textContent = isCur ? '데이터 입력 → 기타 지표' : '-';
        oCalc(valId, { ...mk(null, null), value: null, empty: '아직 입력된 자료가 없어요' });
        return;
      }
      const s = orgStatS(y), p = orgStatS(+y - 1)[key];
      $$(valId).textContent = fmtV(s[key]);
      sub.textContent = [`${yrShort(y)}${isCur && y !== yr ? ' (최근 입력)' : ''}`, detail(s), p != null ? diffTxt(s[key], p) : ''].filter(Boolean).join(' · ');
      oCalc(valId, { ...mk(s, y), value: s[key], period: `${yrShort(y)}${isCur && y !== yr ? ' (최근 입력값)' : ''}`,
        facts: [...(mk(s, y).facts || []), ...(p != null ? [{ k: `${yrShort(+y - 1)} 값`, v: fmtV(p) }] : [])] });
    };
    // PUE: 낮을수록 좋음 · 고른 거점 (전체 합계 = config 의 pue 거점 합 · 전산실이 없는 곳은 해당 없음)
    $$('k-pue').closest('.kpi-card').classList.toggle('kpi-placeholder', !pueSites.length);
    if (!pueSites.length) { $$('k-pue').textContent = '해당 없음'; $$('k-pue-sub').textContent = `전산실 PUE는 ${PUE_SITES.join('·') || '해당 거점 없음'}`; }
    else show('pue', 'k-pue', 'k-pue-sub', v => fmt(v, 2), s => `총 ${fq(s.t)} ÷ IT ${fq(s.it)} kWh`,
      (v, p) => `전년 ${fmt(p, 2)} ${v < p ? '▼' : v > p ? '▲' : '→'}${fmt(Math.abs(v - p), 2)}`,
      s => ({ title: icn('monitor') + ' PUE (전력효율지수)', sub: '데이터센터가 쓴 전기 중 IT 장비 몫', unit: '배',
        site: sitesLabel(pueSites),
        formula: !s ? null : { parts: [{ k: '데이터센터 총 전력', v: s.t, u: 'kWh' }, { k: 'IT 장비 전력', v: s.it, u: 'kWh', op: '÷' }],
          result: { k: 'PUE', v: s.pue, u: '배' } },
        facts: !s ? [] : [{ k: '냉방·조명 등 IT 외 전력', v: s.t - s.it, u: 'kWh' }],
        note: `1에 가까울수록 효율적이에요 (1.0 = 모든 전기를 IT 장비가 씀) · 전산실이 있는 ${PUE_SITES.join('·')}만 해당` }));
    // 클라우드 전환률: 높을수록 좋음
    show('cloud', 'k-cloud', 'k-cloud-sub', v => fmt(v, 1), s => `${fmt(s.done, 0)}/${fmt(s.all, 0)}개 전환`,
      (v, p) => `전년 ${v > p ? '▲' : v < p ? '▼' : '→'}${fmt(Math.abs(v - p), 1)}%p`,
      s => ({ title: icn('cloud') + ' 클라우드 전환률', sub: '운영 정보시스템 중 클라우드로 옮긴 비율', unit: '%', site: '기관 전체',
        formula: !s ? null : { parts: [{ k: '클라우드 전환 시스템', v: s.done, u: '개' }, { k: '운영 정보시스템', v: s.all, u: '개', op: '÷' }],
          result: { k: '전환률', v: s.cloud, u: '%' } },
        facts: !s ? [] : [{ k: '아직 전환하지 않은 시스템', v: s.all - s.done, u: '개' }],
        note: '자체 전산실 서버를 줄이면 그만큼 전력 사용과 배출이 줄어요' }));
    $$('k-cloud-sub').title = $$('k-cloud-sub').textContent;
  }

  /* ── 폐기물 감축 로드맵 (env_settings.waste_roadmap = { baseYear, rates: { 연도: 기준 대비 감축률% } })
        같은 감축률을 목표 대상 청사(대구본원·제주글로벌센터)마다 그 청사의 기준연도 발생량에 적용 ── */
  const wKg = r => +r.weightKg || (+r.weightTon || 0) * 1000;   // 폐기물 무게(kg) — 옛 자료에 kg 칸이 비어 있으면 ton에서
  const wasteYearTon = (y, sites = SITES) => {
    const rs = wasteRecs.filter(r => r.date?.startsWith(String(y)) && sites.includes(r.site)); return rs.length ? sumBy(rs, r => r.weightTon) : null; };
  function wasteRoadmap(site) {   // site = 거점 하나 또는 거점 배열(합산 목표)
    const rm = settings.waste_roadmap;
    if (!v2 || !rm?.baseYear) return null;
    const sites = Array.isArray(site) ? site : [site];
    const baseYear = String(rm.baseYear), rates = rm.rates || {}, baseTon = wasteYearTon(baseYear, sites);
    return { baseYear, rates, baseTon,
      target: y => (baseTon != null && rates[y] != null && y !== baseYear) ? baseTon * (1 - rates[y] / 100) : null };
  }
  // 올해 예상 발생량: 거점별로 마지막 입력 달 다음부터는 직전 2개년 같은 달 평균
  // (봉투는 매달 사지 않으므로, 학습연도에 기록이 없는 달은 0으로 봄)
  function wasteProjection(curYr, sites) {
    const yr = String(curYr), train = Array.from({ length: TRAIN_N }, (_, i) => String(curYr - TRAIN_N + i));
    let ytd = 0, proj = 0, any = false;
    sites.forEach(s => {
      const rs = wasteRecs.filter(r => r.site === s), cur = rs.filter(r => r.date?.startsWith(yr));
      const ty = train.filter(y => rs.some(r => r.date?.startsWith(y)));
      const c = sumBy(cur, r => r.weightTon);
      ytd += c; proj += c;
      if (cur.length || ty.length) any = true;
      if (!ty.length) return;
      const last = cur.length ? Math.max(...cur.map(r => +r.date.slice(5, 7))) : 0;
      for (let m = last + 1; m <= 12; m++)
        proj += ty.reduce((a, y) => a + sumBy(rs.filter(r => r.date === `${y}-${pad(m)}`), r => r.weightTon), 0) / ty.length;
    });
    return any ? { ytd, proj } : null;
  }
  // 폐기물 감축 목표 카드 (청사별) — 올해: 누적 + 연말 예측 / 지난 연도: 그 해 실적 + 달성 여부
  const WT_NOTE = '발생량 = 봉투 용량(L) × 매수 × 0.174 kg/L · 목표 = 기준연도 발생량 × (100% − 감축률)';
  const srcWaste = (rm, yr, est) => [
    S_SET(`기준연도·감축률 (${yrShort(rm.baseYear)} 기준${rm.rates?.[yr] != null ? ` · ${yrShort(yr)} ${fmt(rm.rates[yr], 1)}%` : ''})`, null),
    { k: est ? `${yrShort(yr)} 지금까지 발생량` : `${yrShort(yr)} 발생량`, ...S_IN_W },
    ...(est ? [{ k: '남은 달 예측', kind: 'pred', from: `직전 ${TRAIN_N}개년 같은 달 평균 — 올해 현황 월별 폐기물 그래프`, go: 'dashboard', scroll: 'sec-charts', btn: '그래프 보기' }] : []),
    { k: '무게 환산', kind: 'fix', from: '봉투 용량(L) × 매수 × 0.174 kg/L' }];
  const wEq = (rm, yr, tgt) => ({ parts: [{ k: `${yrShort(rm.baseYear)} 기준연도 발생량`, v: rm.baseTon, u: 't' },
      { k: `남길 비율 (100 − ${fmt(rm.rates[yr], 1)}%)`, v: `${fmt(100 - rm.rates[yr], 1)}%`, op: '×' }],
    result: { k: `${yrShort(yr)} 목표`, v: tgt, u: 't' } });
  // 폐기물 감축 목표 카드 — 온실가스 카드와 같은 모양: 판정 · ■ 누적 □ 연말 예측 · 막대(진한 누적 + 옅은 남은 달) · 청록 = 목표 · 회색 = 기준연도
  //  목표가 없어도(로드맵 미설정 등) 발생량은 보여 주고, 견줄 것으로 전년 발생량(회색)을 깔아 둠
  function renderWasteTarget(P, year, site, isCur) {   // site = 거점 하나 또는 거점 배열(합산)
    const sites = Array.isArray(site) ? site : [site], siteName = sitesLabel(sites);
    const $$ = id => $(P + id), rm = wasteRoadmap(sites), yr = String(year), yS = yrShort(yr), sub = $$('k-wt-sub'), vd = $$('k-wt-verdict');
    // 누르면 뜨는 계산 근거 (기준연도 발생량 × 남길 비율 = 목표)
    const wCalc = o => { (calcStore[P] ||= {})['k-wt-target'] = {
      title: icn('trash') + ' 폐기물 감축 목표', sub: '종량제 봉투 발생량 기준', period: `${yS} 목표`, site: siteName,
      unit: 'ton', rows: [], sites: [], months: [], ...o }; };
    // 양: 올해 = 누적 + 연말 예측(남은 달은 직전 2개년 같은 달 평균) · 지난 연도 = 그 해 실적
    const p = isCur ? wasteProjection(year, sites) : null;
    const act = isCur ? (p ? p.ytd : null) : wasteYearTon(yr, sites), est = isCur && p ? p.proj : null;
    const tgt = rm && rm.baseTon != null && +yr > +rm.baseYear ? rm.target(yr) : null;
    // 회색 기준: 로드맵 기준연도 발생량 · 로드맵이 없거나 그 이전이면 전년 발생량(참고)
    const prevY = String(year - 1), prevT = wasteYearTon(prevY, sites);
    const ref = tgt != null ? { y: rm.baseYear, x: rm.baseTon, base: true } : prevT != null ? { y: prevY, x: prevT, base: false } : null;
    const v = isCur ? est : act, st = tgt == null || v == null ? 'na' : v > tgt ? 'no' : 'ok', col = TG_COL[st];
    $$('tc-wt').style.setProperty('--tgc', col);
    // 숫자 줄: ■ 누적 1.566t □ 연말 예측 6.264t (지난 연도는 ■ 25년 실적)
    const hasV = act != null || est != null;
    $$('wt-na').hidden = hasV; $$('wt-n-a').hidden = !hasV; $$('wt-n-p').hidden = !(hasV && est != null);
    $$('wt-n-ak').textContent = isCur ? '누적' : `${yS} 실적`;
    $$('k-wt-act').textContent = hasV ? fq(act ?? 0) : '—'; $$('k-wt-est').textContent = est != null ? fq(est) : '—';
    famChart($$('wt-chart'), { mode: 'stack', act: act ?? 0, est, col,
      ticks: [tgt != null && { k: 'goal', x: tgt, n: '목표' }, ref && { k: 'base', x: ref.x, n: yrShort(ref.y) }].filter(Boolean),
      aria: `${isCur ? '누적' : `${yS} 실적`} ${fq(act ?? 0)}t${est != null ? ` · 연말 예측 ${fq(est)}t` : ''}${tgt != null ? ` · 목표 ${fq(tgt)}t` : ''}${ref ? ` · ${yrShort(ref.y)} ${fq(ref.x)}t` : ''}` });
    // 열쇠: ■ 26년 목표 5.951t ▼5.0% · ■ 25년 6.264t (기준연도 또는 전년)
    $$('k-wt-year').textContent = '목표';
    $$('k-wt-target').textContent = tgt != null ? fq(tgt) : '—';
    $$('k-wt-rate').textContent = tgt != null ? `▼${fmt(rm.rates[yr], 1)}%` : '';
    $$('wt-k-goal').hidden = tgt == null;
    $$('wt-k-goal').title = tgt != null ? `${yS} 목표 · ${yrShort(rm.baseYear)} 발생량 ${fq(rm.baseTon)}t 대비 ${fmt(rm.rates[yr], 1)}% 감축` : '';
    $$('wt-k-base').hidden = !ref;
    if (ref) { $$('wt-base-k').textContent = yrShort(ref.y); $$('wt-base-v').textContent = fq(ref.x);
               $$('wt-k-base').title = ref.base ? `기준연도(${yrShort(ref.y)}) 발생량` : `${yrShort(ref.y)} 발생량 (참고 — 감축 목표가 없어 전년과 견줌)`; }
    // 목표가 없는 경우의 안내 (아래 한 줄)
    const noTgt = !rm ? '감축 로드맵 미설정' + forAdmin(' · 데이터 관리 → 연도 마감·로드맵에서 정하세요')
      : !isCur && yr === rm.baseYear ? `${yS}${josa(yS, '은', '는')} 기준연도${rm.baseTon != null ? ` · ${fq(rm.baseTon)}t` : ''}`
      : +yr < +rm.baseYear ? `기준연도(${yrShort(rm.baseYear)}) 이전이라 목표 없음`
      : rm.baseTon == null ? `기준연도(${rm.baseYear}년) ${siteName} 폐기물 데이터 없음`
      : tgt == null ? `${yr}년 목표 없음${forAdmin(' · 로드맵에서 감축률을 입력하세요')}` : '';
    sub.className = 'kpi-sub tg-msg'; sub.textContent = noTgt; sub.title = '';
    vd.className = 're-verdict'; vd.textContent = ''; vd.title = '';
    if (noTgt) {
      wCalc({ value: null, empty: noTgt, note: '기준연도 발생량에 연도별 감축률을 적용해 목표를 정해요 · 데이터 관리 → 연도 마감·로드맵',
              src: [S_SET('폐기물 감축 로드맵 (기준연도·연도별 감축률)', rm ? `${yrShort(rm.baseYear)} 기준` : '미설정'), { k: `${yS} 발생량`, ...S_IN_W }] });
      return null;
    }
    if (v == null) { wCalc({ value: tgt, formula: wEq(rm, yr, tgt), facts: [{ k: '감축률', v: `${fmt(rm.rates[yr], 1)}%` }], src: srcWaste(rm, yr, isCur), note: WT_NOTE }); return null; }
    // 판정 (제목 옆에 짧게 · 마우스를 올리면 전체 문장)
    const gap = Math.abs(v - tgt), over = st === 'no';
    vd.className = 're-verdict ' + (over ? 'bad' : 'good');
    vd.innerHTML = (over ? `✗ ${fq(gap)}t 초과` : `✓ ${fq(gap)}t 여유`) + (isCur ? '<span class="vs"> 전망</span>' : '');
    vd.title = isCur ? (over ? `이대로면 목표보다 ${fq(gap)}t 많아요 (연말 예측)` : `목표보다 ${fq(gap)}t 적게 발생할 전망 (연말 예측)`)
                     : (over ? `목표보다 ${fq(gap)}t 많이 발생` : `목표 달성 · ${fq(gap)}t 적게 발생`);
    if (isCur) {
      sub.title = '연말 예측 = 입력된 달 + 남은 달은 직전 2개년 같은 달 평균';
      wCalc({ value: tgt, formula: wEq(rm, yr, tgt),
        vs: { k: `${yS} 연말 예측`, v: est, t: tgt, tk: '목표', unit: 'ton', gu: 't', lower: true, est: true, d: 3 },
        facts: [{ k: '감축률', v: `${fmt(rm.rates[yr], 1)}%` }],
        fc: fcWasteOf(year, sites), src: srcWaste(rm, yr, true),
        over: over ? `폐기물 감축 목표 초과 전망 · 목표 ${fq(tgt)}t · 연말 예측 ${fq(est)}t` : '',
        note: `${WT_NOTE} · 연말 예측 = 입력된 달 + 남은 달은 직전 2개년 같은 달 평균` });
    } else {
      wCalc({ value: tgt, formula: wEq(rm, yr, tgt),
        vs: { k: `${yS} 실적`, v: act, t: tgt, tk: '목표', unit: 'ton', gu: 't', lower: true, est: false, d: 3 },
        facts: [{ k: '감축률', v: `${fmt(rm.rates[yr], 1)}%` }], src: srcWaste(rm, yr, false),
        over: over ? `폐기물 감축 목표 초과 · 목표 ${fq(tgt)}t · 실적 ${fq(act)}t` : '', note: WT_NOTE });
    }
    return { over, v, t: tgt };
  }

  /* ── 입력 현황판: 연도별로 월마다 입력해야 할 칸이 채워졌는지 ── */
  const STATUS_ITEMS = ['전력', '도시가스', '지역난방', '휘발유', '경유', RE_SELF, SAVE_REGEN, '폐기물', WATER];
  let statusOpened = false;
  // '거점|항목|YYYY-MM' → 그 달 입력값 합계 (월별 항목만 · 키가 없으면 빈 칸, 0도 '입력됨')
  //  폐기물은 봉투 수량, 에너지는 사용량, 용수는 값을 더함
  function buildHasMap() {
    const has = {}, add = (k, v) => { has[k] = (has[k] || 0) + (+v || 0); };
    energyRecs.forEach(r => add(`${r.site}|${r.type}|${(r.date || '').slice(0, 7)}`, r.amount));
    wasteRecs.forEach(r => add(`${r.site}|폐기물|${(r.date || '').slice(0, 7)}`, r.qty));
    metricRecs.forEach(r => { if (METRICS[r.item]?.freq === 'month') add(`${r.site}|${r.item}|${r.period}`, r.value); });
    return has;
  }
  const entered = (has, k) => has[k] != null;   // 0으로 입력한 달도 '입력됨'
  // 그 해와 직전 2개년 안에 한 번이라도 입력한 (거점·항목)만 '입력 대상'으로 봄
  const isExpected = (has, s, it, y) => [y - 2, y - 1, y].some(yy => m12(i => entered(has, `${s}|${it}|${yy}-${pad(i + 1)}`)).some(Boolean));
  // 지난 연도 누락 칸 수 (연도 마감 전 확인용 · 0 = 입력됨 · '-'로 입력한 해당없음 칸은 빼고)
  function missingCells(y) {
    const has = buildHasMap();
    let miss = 0;
    SITES.forEach(s => STATUS_ITEMS.filter(it => !itemNA(s, it) && isExpected(has, s, it, y)).forEach(it => {
      m12(i => { const ym = `${y}-${pad(i + 1)}`; if (!entered(has, `${s}|${it}|${ym}`) && !isNaCell(s, it, ym)) miss++; });
    }));
    return miss;
  }
  // 연도별 입력 칸 상태 → { rows, late, na, due }
  //  입력됨 = 값이 있음(0 포함) · 해당없음 = '-'로 입력 · 입력 차례 = 올해 지난달 빈칸 · 누락 = 그 밖의 지난 빈칸 · 아직 아님 = 이번 달 이후
  function statusOf(year, has) {
    const now = new Date(), curYr = now.getFullYear(), curM = now.getMonth() + 1;
    let late = 0, na = 0, due = 0;
    const rows = [];
    SITES.forEach(s => STATUS_ITEMS.filter(it => !itemNA(s, it) && isExpected(has, s, it, year)).forEach(it => {
      const cells = m12(i => {
        const m = i + 1, ym = `${year}-${pad(m)}`, v = has[`${s}|${it}|${ym}`], done = v != null;
        const st = done ? 'ok' : isNaCell(s, it, ym) ? 'none'
          : year < curYr || m < curM - 1 ? 'late' : year === curYr && m === curM - 1 ? 'due' : 'future';
        if (st === 'late') late++; if (st === 'none') na++; if (st === 'due') due++;
        return { m, st };
      });
      rows.push({ s, it, cells });
    }));
    return { rows, late, na, due };
  }
  function renderStatusBoard() {
    const curYr = new Date().getFullYear(), has = buildHasMap();
    // 연도 목록: 자료가 있는 해 + 올해 (최근 연도가 위)
    // (입력표와 같은 최근 10년 — 칸을 누르면 그 연도 입력표로 이동)
    const yrs = [...new Set([String(curYr), ...Object.keys(has).map(k => k.split('|')[2].slice(0, 4))])]
      .filter(y => /^\d{4}$/.test(y) && +y <= curYr && +y > curYr - 10).sort().reverse();
    const sel = $('status-year'), keep = sel.value;
    sel.innerHTML = yrs.map(y => `<option value="${y}">${y}년${isClosed(y) ? ' [마감]' : ''}</option>`).join('');
    sel.value = yrs.includes(keep) ? keep : String(curYr);
    const year = +sel.value, { rows, late, na, due } = statusOf(year, has), cur = year === curYr;
    const LBL = { ok: '입력됨', none: "해당없음 ('-'로 입력함)", late: '누락 (빈칸)', due: '입력 차례', future: '아직 아님' };
    let prevSite = null;
    $('status-tbl').innerHTML = rows.length === 0 ? `<tbody><tr><td class="table-empty">${year}년에 입력 대상 항목이 없습니다</td></tr></tbody>` :
      `<thead><tr><th style="text-align:left">거점</th><th style="text-align:left">항목</th>${MONTHS.map(m => `<th>${m}</th>`).join('')}</tr></thead><tbody>` +
      rows.map(r => {
        const siteCell = r.s !== prevSite ? `<td class="st-site">${r.s}</td>` : '<td></td>'; prevSite = r.s;
        return `<tr>${siteCell}<td class="st-item">${r.it}</td>${r.cells.map(c => c.st === 'future'
          ? `<td><span class="st st-future" title="${c.m}월 · ${LBL.future}"></span></td>`
          : (w => `<td><button class="st st-${c.st}" data-site="${r.s}" data-item="${r.it}" data-year="${year}" title="${year}년 ${r.s} ${r.it} ${c.m}월 · ${LBL[c.st]}${w ? ` · ${esc(whoShort(w))}` : ''} (눌러서 입력)" aria-label="${year}년 ${r.s} ${r.it} ${c.m}월 ${LBL[c.st]}${w ? ` · ${esc(whoShort(w))}` : ''}"></button></td>`)(c.st === 'ok' ? whoCell(r.s, r.it, `${year}-${pad(c.m)}`) : null)).join('')}</tr>`;
      }).join('') + '</tbody>';
    $('status-summary').textContent = [late ? `⚠ 누락 ${late}칸` : '', due ? `입력 차례 ${due}칸` : '', na ? `해당없음 ${na}칸` : ''].filter(Boolean).join(' · ')
      || (cur ? '올해 지난달까지 모두 입력됨' : `${year}년 모두 입력됨`);
    $('status-summary').className = 'hd-note' + (late ? ' st-warn' : '');
    $('status-year-note').textContent = (cur ? '올해: 지난달이 입력 차례' : `${isClosed(year) ? '[마감] 마감된 연도 · ' : ''}지난 연도`) + " · 빈칸 = 누락 · 자료가 없는 달은 '-' 입력";
    if (!statusOpened) { $('sec-status').open = late + due > 0; statusOpened = true; } // 처음 한 번만 자동으로 펼침
    // 올해 현황의 알림 칩은 언제나 올해 기준 (누르면 데이터 입력 탭의 현황판으로)
    const now = cur ? { late, due } : statusOf(curYr, has), chip = $('status-chip');
    chip.hidden = !(now.late || now.due);
    chip.className = 'status-chip' + (now.late ? ' warn' : '');
    chip.textContent = now.late ? `⚠ 입력 누락 ${now.late}칸 · 입력 차례 ${now.due}칸 →` : `입력 차례 ${now.due}칸 →`;
    chip.title = '데이터 입력 탭의 입력 현황(올해)으로 이동';
  }
  // 현황판 칸을 누르면 해당 연도·거점·항목의 입력표로 이동
  async function gotoInput(site, item, year) {
    if (!canEdit()) return;
    const yr = String(year || new Date().getFullYear()), sub = item === '폐기물' ? 'waste' : item === WATER ? 'metrics' : 'energy';
    const dirty = { energy: energyDirty, waste: wasteDirty, metrics: waterDirty }[sub];
    if (dirty && !(await confirmBox('저장하지 않은 입력이 있어요. 버리고 이동할까요?', '버리고 이동', '이동하면 지금 입력표의 저장 전 값은 사라져요.', 'primary'))) return;
    document.querySelector('.tab-btn[data-tab="input"]').click();
    document.querySelector(`.subtab-btn[data-sub="${sub}"]`).click();
    if (sub === 'waste') { $('w-year').value = yr; $('w-site').value = site; renderWasteTable(); }
    else if (sub === 'metrics') { $('x-year').value = yr; $('x-site').value = site; renderWaterTable(); }
    else { $('e-year').value = yr; $('e-site').value = site; syncEnergyTypes(); $('e-type').value = item; renderEnergyTable(); }
  }

  // 한 해 화면 보기 상태 (P마다): 월별 추이 = 그래프 | 표 · 월별 온실가스 = Scope별 | 에너지원별
  const yvState = { '': { view: 'chart', by: 'scope' }, 'y-': { view: 'chart', by: 'scope' } };
  const yvLast = {}, yvYear = {};   // 마지막으로 그린 자료(보기만 바꿀 때 차트만 다시 그림) · 화면마다 보이는 연도(그래프를 누를 때 씀)

  // 한 해 화면 차트 (P = '' 올해 현황 · 'y-' 실적 조회 한 해) — fc(예측)는 올해만
  function renderYearCharts(P, ey, wy, fc, si, year) {
    yvLast[P] = [ey, wy, fc, si, year]; yvYear[P] = year;
    const set = CHARTS[P] || {}, showPred = !!fc, $$ = id => $(P + id), st = yvState[P] || yvState[''];
    const sync = (id, v) => $$(id).querySelectorAll('button[data-v]').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.v === v)));
    sync('ce-view', st.view); sync('cgm-by', st.by);

    // ① 월별 에너지원별 사용량 — 그래프(에너지원마다 작은 그래프: 막대 = 그 해 · 회색 점선 = 전년 같은 달) 또는 표(사용량 + tCO₂eq)
    const asTable = st.view === 'table';
    $$('ce-title').textContent = asTable ? '월별 에너지원별 사용량 · 온실가스 환산 (표)' : '월별 에너지원별 사용량';
    const tap = canEdit() ? '그 달 자료를 보고 바로 고칠 수 있어요' : '그 달 자료를 거점·에너지원별로 볼 수 있어요';
    $$('ce-note').textContent = asTable ? `칸을 누르면 ${tap}`
      : `막대를 누르면 ${tap}`;
    $$('ce-tbl-wrap').hidden = !asTable;
    $$('ce-legend').hidden = !asTable;
    $$('ce-grid').hidden = asTable; $$('ce-key').hidden = asTable;
    if (asTable) {
      $$('ce-empty').hidden = true; $$('ce-card').classList.remove('is-empty');
      renderMonthTable(P, ey, fc, si);
    } else renderEnergyPanels(P, set, ey, fc, si, year);

    // ② 차량연료 (L) — 이제 위 에너지원별 작은 그래프의 휘발유·경유 칸(실적·예측·전년 같은 달)으로 봄 · 예전 그래프는 숨김
    setChart(set.fuel, P + 'chart-fuel', P + 'cf-empty', ['휘발유', '경유'].map(t => ({
      label: `${t} (L)`, $type: t, data: monthlySum(ey.filter(r => r.type === t), r => r.amount), backgroundColor: hexA(typeCol(t), .8), borderRadius: 4 })));
    $$('cf-card').hidden = true;

    // ③ 월별 온실가스: 입력된 실적(Scope 1·2 또는 에너지원별) 위에 아직 입력 안 된 거점·항목의 예측 막대를 쌓음
    //    (일부만 입력된 달도 빠진 부분을 예측으로 채워 보여 줌 — 아직 입력 전인 달은 예측 막대만)
    const S1C = rgbOf(cssVar('--chart-s1')), S2C = rgbOf(cssVar('--chart-s2')), byType = st.by === 'type';
    const ghgM = test => monthlySum(ey.filter(r => isEmit(r.type) && test(r)), r => r.ghg);
    const actual = byType
      ? EMIT_TYPES.filter(t => !itemNA(si, t)).map(t => ({ label: t, $type: t, data: ghgM(r => r.type === t),
          $amt: monthlySum(ey.filter(r => r.type === t), r => r.amount), backgroundColor: hexA(typeCol(t), .85), borderRadius: 4 }))
      : [{ label: 'Scope 1 실적', data: ghgM(r => scopeOf(r.type) === 'Scope 1'), backgroundColor: `rgba(${S1C},0.82)`, borderRadius: 4 },
         { label: 'Scope 2 실적', data: ghgM(r => scopeOf(r.type) === 'Scope 2'), backgroundColor: `rgba(${S2C},0.85)`, borderRadius: 4 }];
    const hasAct  = m12(i => actual.some(d => d.data[i] != null));
    const predAll = m12(i => showPred ? (fc.predGhgS1[i] ?? 0) + (fc.predGhgS2[i] ?? 0) : 0);
    const partial = m12(i => hasAct[i] && predAll[i] > 0);
    if (set.ghg) set.ghg.options.plugins.tooltip.callbacks.footer = items => {
      const i = items[0]?.dataIndex;
      if (i == null || !(predAll[i] > 0)) return '';
      if (!hasAct[i]) return '아직 입력 전인 달 · 기상연동 예측';
      const miss = fc?.missing?.[i] || [];
      return [`미입력 ${miss.length}건 → 예측으로 채움:`, ...miss.slice(0, 6).map(x => ` · ${x}`), ...(miss.length > 6 ? [` · 외 ${miss.length - 6}건`] : [])];
    };
    if (set.ghg) {
      set.ghg.data.labels = MONTHS;
      const tot = m12(i => actual.reduce((a, d) => a + (d.data[i] || 0), 0) + (predAll[i] > 0 ? predAll[i] : 0));
      set.ghg.options.plugins.barLabels.only = labelPicks(tot, hasAct);   // 숫자는 가장 큰 달 · 마지막 실적 달만 (나머지는 마우스)
    }
    $$('cgm-note').hidden = !partial.some(Boolean);
    setChart(set.ghg, P + 'chart-ghg-monthly', P + 'cgm-empty', [
      ...actual,
      { label: '예측 (미입력분)', data: m12(i => predAll[i] > 0 ? predAll[i] : null),
        backgroundColor: hexA(PRED_COLOR, .28), borderColor: hexA(PRED_COLOR, .95), borderWidth: 1.5, borderRadius: 4 },
    ]);

    // ④-1 월별 승강기 회생제동 발전량 (kWh) — 대구본원(또는 전체 합계)일 때만 · 폐기물 그래프 왼쪽 · 전년 같은 달은 점선
    const showRegen = !si || !itemNA(si, SAVE_REGEN);
    $$('crg-card').hidden = !showRegen;
    if (showRegen) {
      const rgMon = rs => m12(i => { const x = rs.filter(r => r.date?.slice(5, 7) === pad(i + 1)); return x.length ? sumBy(x, r => r.amount) : null; });
      const cur = ey.filter(r => r.type === SAVE_REGEN), prev = energyRecs.filter(r => r.type === SAVE_REGEN && r.date?.startsWith(String(year - 1)) && (!si || r.site === si));
      if (set.regen) { set.regen.data.labels = MONTHS; set.regen.options.plugins.legend.display = prev.length > 0;
                       const rv = rgMon(cur); set.regen.options.plugins.barLabels.only = labelPicks(rv, rv.map(v => v != null)); }
      setChart(set.regen, P + 'chart-regen', P + 'crg-empty', !cur.length ? [] : [
        { type: 'bar', label: `${yrShort(year)} 발전량`, data: rgMon(cur), order: 2, backgroundColor: cssVar('--chart-re-gen'), borderRadius: 4, maxBarThickness: 36 },
        ...(prev.length ? [{ type: 'line', label: `${yrShort(year - 1)} (전년)`, data: rgMon(prev), order: 1, borderColor: cssVar('--chart-ghost'), backgroundColor: cssVar('--chart-ghost'),
          borderDash: [5, 4], borderWidth: 1.5, pointRadius: 2.5, tension: .3, spanGaps: true }] : []),
      ]);
    }

    // ④ 월별 폐기물 발생량 (kg) — 위에서 고른 거점만 · 전체 합계면 거점별로 쌓음 · 전년 같은 달은 점선
    const wSites = si ? [si] : SITES;   // 거점 색 = SITE_COL (다른 거점별 그래프·표와 같은 색)
    const wMon = (rs, s) => m12(i => { const x = rs.filter(r => r.site === s && r.date?.slice(5, 7) === pad(i + 1)); return x.length ? sumBy(x, wKg) : null; });
    const prevW = wasteRecs.filter(r => r.date?.startsWith(String(year - 1)) && wSites.includes(r.site));
    const prevMon = m12(i => { const x = prevW.filter(r => r.date.slice(5, 7) === pad(i + 1)); return x.length ? sumBy(x, wKg) : null; });
    $$('cw-title').textContent = `월별 폐기물 발생량 · ${si || '전체 합계'} (kg)`;
    if (set.ws) { set.ws.data.labels = MONTHS; set.ws.options.plugins.legend.display = !si || prevW.length > 0;
                  const wt = m12(i => wSites.reduce((a, s) => a + (wMon(wy, s)[i] || 0), 0)); set.ws.options.plugins.barLabels.only = labelPicks(wt, wt.map(v => v > 0)); }
    setChart(set.ws, P + 'chart-ws', P + 'cw-empty', !wy.length ? [] : [
      ...wSites.map(s => ({ type: 'bar', label: si ? `${yrShort(year)} 발생량` : s, $site: s, data: wMon(wy, s), stack: 'w', order: 2,
        backgroundColor: SITE_COL[s], borderRadius: 4, maxBarThickness: 36 })),
      ...(prevW.length ? [{ type: 'line', label: `${yrShort(year - 1)} (전년)`, data: prevMon, order: 1, borderColor: cssVar('--chart-ghost'), backgroundColor: cssVar('--chart-ghost'),
        borderDash: [5, 4], borderWidth: 1.5, pointRadius: 2.5, tension: .3, spanGaps: true, stack: 'prev' }] : []),
    ]);

    // 짝 그래프가 빠졌거나(해당 없음) 자료가 없어 한 줄로 줄었으면 남은 그래프를 넓게
    //  (차량연료 ↔ 월별 온실가스 · 회생제동 ↔ 폐기물)
    const out = id => $$(id).hidden || $$(id).classList.contains('is-empty');
    [['cgm-card', 'cf-card'], ['cf-card', 'cgm-card'], ['cw-card', 'crg-card'], ['crg-card', 'cw-card']]
      .forEach(([a, b]) => $$(a).classList.toggle('chart-wide', out(b) && !out(a)));
  }

  // 월별 에너지원별 작은 그래프 — 에너지원마다 그래프 하나 (축 하나)
  //  막대 = 그 해 실적 · 올해는 아직 입력 안 된 거점·달의 예측을 옅은 막대로 위에 쌓음 (표의 '+예측'과 같은 값)
  //  회색 점선 = 전년 같은 달 · 위 줄 = 누적(지난 연도는 연간) + 전년 대비 (올해는 입력된 칸끼리 = 전년 동기)
  //  고른 거점에 그 에너지원이 없거나 자료가 없으면 그 그래프는 뺌
  function renderEnergyPanels(P, set, ey, fc, si, year) {
    const $$ = id => $(P + id), isCur = !!fc, yS = yrShort(year), pS = yrShort(year - 1), sites = si ? [si] : SITES;
    const prevE = energyRecs.filter(r => r.date?.startsWith(String(year - 1)) && sites.includes(r.site));
    const cellKey = r => `${r.site}|${r.date.slice(5, 7)}`;
    let shown = 0, anyPred = false, anyPrev = false;
    ETYPES.forEach((t, k) => {
      const c = set.em?.[k], cur = ey.filter(r => r.type === t), pr = prevE.filter(r => r.type === t);
      const act = monthlySum(cur, r => r.amount);
      const pred = m12(i => { const v = isCur ? fc.predEnergy?.[t]?.[i] : null; return v > 0 ? v : null; });
      const prev = monthlySum(pr, r => r.amount);
      const on = sites.some(s => !itemNA(s, t)) && (act.some(v => v != null) || pred.some(v => v != null));
      $$('em-p' + k).hidden = !on;
      if (!on) { if (c) { c.data.datasets = []; c.update('none'); } return; }
      shown++;
      const hasPred = pred.some(v => v != null), hasPrev = pr.length > 0, col = typeCol(t), A = sumArr(act);
      anyPred ||= hasPred; anyPrev ||= hasPrev;
      // 전년 대비: 올해 = 올해 입력된 (거점·달) 칸과 같은 칸의 작년 값끼리 · 지난 연도 = 연간 합계끼리
      let yo = null;
      if (!isCur) { const p = sumArr(prev); yo = hasPrev && p > 0 && cur.length ? (A - p) / p * 100 : null; }
      else {
        const pv = {}; pr.forEach(r => { pv[cellKey(r)] = (pv[cellKey(r)] || 0) + (+r.amount || 0); });
        const cc = {}; cur.forEach(r => { cc[cellKey(r)] = (cc[cellKey(r)] || 0) + (+r.amount || 0); });
        let a = 0, b = 0; Object.entries(cc).forEach(([kk, v]) => { if (kk in pv) { a += v; b += pv[kk]; } });
        yo = b > 0 ? (a - b) / b * 100 : null;
      }
      const good = t === RE_SELF ? yo > 0 : yo < 0, flat = yo == null || Math.abs(yo) < 0.05;
      $$('em-n' + k).innerHTML = `<i class="mt-dot" style="background:${col}"></i>${esc(emName(t))}<small>${esc(GHG[t]?.unit || '')}</small>`;
      $$('em-s' + k).innerHTML = !cur.length ? `<span>${isCur ? '아직 입력 전 · 예측만' : '입력 없음'}</span>`
        : `${isCur ? '누적' : '연간'} <b>${fq(A)}</b>` +
          (yo == null ? '' : ` <span class="dpill ${flat ? 'flat' : good ? 'good' : 'bad'}" title="${isCur ? '전년 동기 대비 (올해 입력된 칸끼리)' : '전년 대비'}">` +
            `${isCur ? '전년 동기 ' : '전년 '}${flat ? '→ ' : yo > 0 ? '▲' : '▼'}${fmt(Math.abs(yo), 1)}%</span>`);
      $$('chart-em' + k).setAttribute('aria-label', `${yS} 월별 ${emName(t)} 사용량 (${GHG[t]?.unit || ''})` +
        (cur.length ? ` · ${isCur ? '누적' : '연간'} ${fq(A)}` : '') + (yo == null ? '' : ` · 전년 대비 ${yo > 0 ? '+' : ''}${fmt(yo, 1)}%`));
      if (!c) return;
      c.data.labels = MONTHS;
      c.data.datasets = [
        { type: 'bar', label: `${yS} 실적`, $type: t, data: act, stack: 'a', order: 2, backgroundColor: hexA(col, .85), borderRadius: 2, maxBarThickness: 22 },
        ...(hasPred ? [{ type: 'bar', label: '예측 (미입력분)', $type: t, $pred: true, data: pred, stack: 'a', order: 2,
          backgroundColor: hexA(col, .22), borderColor: hexA(col, .85), borderWidth: 1, borderRadius: 2, maxBarThickness: 22 }] : []),
        ...(hasPrev ? [{ type: 'line', label: `${pS} 같은 달`, $type: t, $prev: true, data: prev, stack: 'p', order: 1,
          borderColor: cssVar('--chart-ghost'), backgroundColor: cssVar('--chart-ghost'), borderDash: [4, 3], borderWidth: 1.5, pointRadius: 1.8, pointHoverRadius: 4, tension: .3, spanGaps: true }] : []),
      ];
      c.update(chartQuiet ? 'none' : undefined);
    });
    // 한 줄에 그래프 수만큼 (넓은 화면) · 중간 화면은 4개면 2+2
    $$('ce-grid').style.setProperty('--n', String(shown <= 4 ? Math.max(1, shown) : 3));
    $$('ce-grid').style.setProperty('--nt', String(shown === 3 ? 3 : shown <= 1 ? 1 : 2));
    $$('ce-grid').hidden = !shown; $$('ce-empty').hidden = !!shown; $$('ce-key').hidden = !shown;
    $$('ce-card').classList.toggle('is-empty', !shown);
    $$('ce-key').innerHTML = `<span><i class="k-a"></i>${yS} 실적</span>` + (anyPred ? '<span><i class="k-p"></i>예측 (아직 입력 안 된 거점·달)</span>' : '') +
      (anyPrev ? `<span><i class="k-q"></i>${pS} 같은 달</span>` : '') + '<span class="k-why">· 에너지원마다 단위가 달라 그래프를 나눴어요</span>';
  }

  // 막대 숫자를 붙일 칸: 가장 큰 칸 + 마지막 실적 칸 (막대마다 숫자를 다 쓰면 읽기 어려움 · 나머지는 마우스를 올리면)
  function labelPicks(vals, hasAct) {
    let mx = -1, last = -1;
    vals.forEach((v, i) => { if (v > 0 && (mx < 0 || v > vals[mx])) mx = i; if (hasAct[i]) last = i; });
    return [...new Set([mx, last].filter(i => i >= 0))];
  }
  // 월별 표: 에너지원 × 월 — 칸마다 위 = 사용량(원래 단위), 아래 = 온실가스 환산(tCO₂eq)
  //  올해는 아직 입력 전인 칸을 기상연동 예측(파란 기울임)으로, 일부 거점만 입력된 달은 '+예측'으로 함께 보여 줌
  function renderMonthTable(P, ey, fc, si) {
    const isCur = !!fc, sites = si ? [si] : SITES;
    const cellOf = (t, i) => {
      const rs = ey.filter(r => r.type === t && r.date?.slice(5, 7) === pad(i + 1));
      return { a: rs.length ? sumBy(rs, r => r.amount) : null, p: isCur ? (fc.predEnergy[t]?.[i] ?? null) : null };
    };
    const rows = [...EMIT_TYPES, RE_SELF].filter(t => sites.some(s => !itemNA(s, t)))
      .map(t => ({ t, cells: m12(i => cellOf(t, i)) })).filter(r => r.cells.some(c => c.a != null || c.p != null));
    const tbl = $(P + 'ce-tbl');
    if (!rows.length) { tbl.innerHTML = '<tbody><tr><td class="table-empty">데이터가 없습니다</td></tr></tbody>'; $(P + 'ce-legend').hidden = true; return; }
    const g3 = v => fq(v);
    const btn = (m, t, cls, main, sub, extra = '', title = '') =>
      `<button type="button" class="mt-btn${cls}" data-m="${m}"${t ? ` data-t="${esc(t)}"` : ''}${title ? ` title="${esc(title)}"` : ''}>` +
      `<span class="mt-a">${main}</span>${sub ? `<span class="mt-g">${sub}</span>` : ''}${extra}</button>`;
    // 사용량 칸 (t = 에너지원)
    const useCell = (t, c, m) => {
      if (c.a == null && c.p == null) return `<td>${btn(m, t, ' mt-na', '—', '', '', `${m}월 ${t} ${canEdit() ? '입력하기' : '입력 전'}`)}</td>`;
      if (c.a == null) return `<td>${btn(m, t, ' pred', fq(c.p), co2Txt(t, c.p).replace(' tCO₂eq', ''), '', `${m}월 ${t} — 아직 입력 전 · 기상연동 예측`)}</td>`;
      const part = c.p > 0 ? `<span class="mt-p">+예측 ${fq(c.p)}</span>` : '';
      return `<td>${btn(m, t, '', fq(c.a), co2Txt(t, c.a).replace(' tCO₂eq', ''), part, `${m}월 ${t} ${canEdit() ? '보기·고치기' : '자세히 보기'}`)}</td>`;
    };
    const sumCell = (main, sub, cls = '') => `<td class="mt-sum${cls}"><span class="mt-a">${main}</span>${sub ? `<span class="mt-g">${sub}</span>` : ''}</td>`;
    const body = rows.map(({ t, cells }) => {
      const has = cells.some(c => c.a != null), A = sumArr(cells.map(c => c.a)), Pd = sumArr(cells.map(c => c.p));
      const scope = isEmit(t) ? GHG[t].scope : '아래: 회피(참고)';
      return `<tr><td class="mt-name"><i class="mt-dot" style="background:${typeCol(t)}"></i>${t}<small>${GHG[t].unit} · ${scope}</small></td>` +
        cells.map((c, i) => useCell(t, c, i + 1)).join('') +
        (has ? sumCell(fq(A), co2Txt(t, A).replace(' tCO₂eq', '')) : sumCell('—', '', ' mt-na')) +
        (isCur ? sumCell(fq(A + Pd), co2Txt(t, A + Pd).replace(' tCO₂eq', ''), ' pred') : '') + '</tr>';
    }).join('');
    // 온실가스 합계 (배출원만)
    const em = rows.filter(r => isEmit(r.t));
    const totA = m12(i => em.some(r => r.cells[i].a != null) ? sumBy(em, r => co2Of(r.t, r.cells[i].a ?? 0)) : null);
    const totP = m12(i => sumBy(em, r => co2Of(r.t, r.cells[i].p ?? 0)));
    const totRow = !em.length ? '' : `<tr class="mt-tot"><td class="mt-name">온실가스 합계<small>tCO₂eq · Scope 1+2</small></td>` +
      m12(i => totA[i] == null && !(totP[i] > 0) ? `<td>${btn(i + 1, '', ' mt-na', '—')}</td>`
        : totA[i] == null ? `<td>${btn(i + 1, '', ' pred', g3(totP[i]), '', '', `${i + 1}월 — 기상연동 예측`)}</td>`
        : `<td>${btn(i + 1, '', '', g3(totA[i]), '', totP[i] > 0 ? `<span class="mt-p">+예측 ${g3(totP[i])}</span>` : '', `${i + 1}월 ${canEdit() ? '보기·고치기' : '자세히 보기'}`)}</td>`).join('') +
      sumCell(g3(sumArr(totA)), '') + (isCur ? sumCell(g3(sumArr(totA) + sumArr(totP)), '', ' pred') : '') + '</tr>';
    tbl.innerHTML = `<thead><tr><th>에너지원</th>${MONTHS.map(m => `<th>${m}</th>`).join('')}<th>${isCur ? '누적' : '합계'}</th>${isCur ? '<th>연말 예측</th>' : ''}</tr></thead>` +
      `<tbody>${body}${totRow}</tbody>`;
    $(P + 'ce-legend').innerHTML = `<span><b>칸 위</b> 사용량 (원래 단위) · <b>칸 아래</b> 온실가스 환산 (tCO₂eq)</span>` +
      (isCur ? '<span><i>파란 기울임</i> = 기상연동 예측 (아직 입력 전) · <b>+예측</b> = 일부 거점이 아직 입력 전이라 더해질 예측</span>' : '') +
      (rows.some(r => r.t === RE_SELF) ? '<span>재생에너지 아래 = 회피 배출량 (참고 · 전력 배출계수)</span>' : '');
  }

  /* ── 기상연동 예측 근거 (올해 현황 맨 아래) ─────────────── */
  const pctTxt = (a, b) => b > 0 ? `${a >= b ? '+' : '−'}${fmt(Math.abs(a - b) / b * 100, 0)}%` : '—';
  function renderBasis() {
    const curYr = new Date().getFullYear(), train = trainYearsFor(curYr);
    $('bs-train').textContent = train.length
      ? `직전 ${train.length}개년(${train.map(yrShort).join('·')}) 같은 달 사용량 평균 — 해가 바뀌면 학습연도도 자동으로 바뀌어요`
      : '학습할 지난 연도 자료가 아직 없어요';
    $('bs-src-tbl').innerHTML = '<thead><tr><th>거점</th><th class="r">위도, 경도</th><th>관측 기간</th><th class="r">올해 평균기온</th><th class="r">받은 자료</th></tr></thead><tbody>' +
      SITES.map(s => {
        const w = wxBySite?.[s], [lat, lon] = SITE_COORDS[s];
        if (!w) return `<tr><td>${s}</td><td class="r">${lat.toFixed(2)}, ${lon.toFixed(2)}</td><td colspan="3" class="warn">받지 못함 → 같은 달 평균만 사용</td></tr>`;
        const ks = Object.keys(w).sort(), days = ks.reduce((a, k) => a + w[k].days, 0);
        // 올해 평균기온 = 올해 받은 일평균기온의 평균 (달마다 일수로 가중)
        const cy = ks.filter(k => k.startsWith(`${curYr}-`)), cd = cy.reduce((a, k) => a + w[k].days, 0);
        const avgT = cd ? cy.reduce((a, k) => a + w[k].t * w[k].days, 0) / cd : null;
        const tTip = cd ? ` title="${curYr}년 1월 1일부터 ${cd}일치 일평균기온의 평균"` : '';
        return `<tr><td>${s}</td><td class="r">${lat.toFixed(2)}, ${lon.toFixed(2)}</td><td>${fmtYM(ks[0])} ~ ${fmtYM(ks[ks.length - 1])}</td>` +
          `<td class="r"${tTip}>${avgT == null ? '—' : `${fmt(avgT, 1)}℃`}</td>` +
          `<td class="r ok" title="일평균기온 자료를 받은 날 수">${fmt(days, 0)}일 ✓</td></tr>`;
      }).join('') + '</tbody>';
    renderWxChart();
    renderBasisModel(curYr, train);
  }
  // 월평균기온: 학습연도(점선) vs 올해(주황 굵은 선) + 올해 냉난방도일 누계 vs 평년
  function renderWxChart() {
    const site = $('bs-site').value || HEAD_SITE, w = wxBySite?.[site], curYr = new Date().getFullYear(), yr = String(curYr);
    const train = trainYearsFor(curYr), years = [...train, yr], cols = yearColors(Math.max(train.length, 1));
    $('bs-chart-title').textContent = `월평균기온 (℃) · ${site}`;
    $('bs-dd-note').textContent = '';
    if (!w) { setChart(CHARTS['']?.wx, 'chart-wx', 'cwx-empty', []); return; }
    setChart(CHARTS['']?.wx, 'chart-wx', 'cwx-empty', years.map((y, i) => {
      const cur = y === yr;
      return { label: cur ? `${yrShort(y)} (올해)` : yrShort(y),
        data: m12(j => { const v = w[`${y}-${pad(j + 1)}`]; return v ? v.t : null; }),   // 툴팁에서 셋째 자리까지
        borderColor: cur ? cssVar('--chart-current') : cols[i], backgroundColor: 'transparent', borderWidth: cur ? 3 : 1.5,
        borderDash: cur ? [] : [5, 4], pointRadius: cur ? 3 : 0, tension: .3, spanGaps: false };
    }));
    let h = 0, c = 0, hb = 0, cb = 0, n = 0;
    m12(i => {
      const cur = w[`${yr}-${pad(i + 1)}`], base = train.map(y => w[`${y}-${pad(i + 1)}`]).filter(x => x?.full);
      if (!cur?.full || !base.length) return;
      n++; h += cur.hdd; c += cur.cdd;
      hb += base.reduce((a, x) => a + x.hdd, 0) / base.length; cb += base.reduce((a, x) => a + x.cdd, 0) / base.length;
    });
    if (n) $('bs-dd-note').textContent = `올해 관측이 끝난 ${n}개월 누계 · 난방도일 ${fq(h)} (평년 ${fq(hb)}, ${pctTxt(h, hb)}) · ` +
      `냉방도일 ${fq(c)} (평년 ${fq(cb)}, ${pctTxt(c, cb)}) — 평년보다 많을수록 그 달 예측이 올라가요`;
  }
  // 기온 민감도(학습 결과) + 사후 검증: 올해 입력된 달을 모른다고 치고 다시 예측해 실제와 비교
  function renderBasisModel(curYr, train) {
    const yr = String(curYr), hist = seriesHist(), slopes = [], ev = {};
    SITES.forEach(s => [...WX_TYPES].forEach(t => {
      const h = hist[`${s}|${t}`];
      if (!h || !train.some(y => Object.keys(h).some(k => k.startsWith(y)))) return;
      const wx = wxBySite?.[s], hTrain = Object.fromEntries(Object.entries(h).filter(([k]) => !k.startsWith(yr)));
      const pW = forecastMonthly(hTrain, wx, train, yr, true), p0 = forecastMonthly(hTrain, wx, train, yr, false);
      slopes.push({ s, t, kH: pW.kH, kC: pW.kC, wx: !!wx, yrRate: pW.yrRate });
      m12(i => {
        const k = `${yr}-${pad(i + 1)}`, a = h[k];
        if (a == null || pW[i].pred == null || !wx?.[k]?.full) return;
        const e = ev[t] || (ev[t] = { n: 0, a: 0, w: 0, b: 0 });
        e.n++; e.a += a; e.w += Math.abs(a - pW[i].pred); e.b += Math.abs(a - p0[i].pred);
      });
    }));
    const k = (v, t) => v > 0 ? `+${fmt(v, v < 10 ? 2 : 0)} ${GHG[t].unit}` : '<span class="cmp-na">영향 작음</span>';
    // 연평균 변화율 → 사람이 읽는 말 (0.92 → '해마다 -8.0%')
    const trendTxt = r => {
      if (r == null || Math.abs(r - 1) < 0.005) return '<span class="cmp-na">거의 그대로</span>';
      const p = (r - 1) * 100;
      return `<span class="${p < 0 ? 'ok' : 'warn'}">${p > 0 ? '+' : ''}${fmt(p, 1)}%<small>/년</small></span>`;
    };
    $('bs-slope-tbl').innerHTML = !slopes.length ? '<tbody><tr><td class="table-empty">학습할 자료가 없어요</td></tr></tbody>' :
      '<thead><tr><th>거점</th><th>에너지원</th><th class="r">난방도일 +1</th><th class="r">냉방도일 +1</th><th class="r">해마다 추세</th></tr></thead><tbody>' +
      slopes.map(r => `<tr><td>${r.s}</td><td>${r.t}</td>${r.wx ? `<td class="r">${k(r.kH, r.t)}</td><td class="r">${k(r.kC, r.t)}</td>`
        : '<td colspan="2" class="warn">기상 데이터 없음</td>'}<td class="r">${trendTxt(r.yrRate)}</td></tr>`).join('') + '</tbody>';
    const rows = [...WX_TYPES].filter(t => ev[t]?.a > 0);
    // 오차를 막대로 (짧을수록 정확) — 기상연동 예측 vs 같은 달 평균만 · 어느 쪽이 나은지 한눈에
    const errMax = Math.max(1e-9, ...rows.map(t => Math.max(ev[t].w, ev[t].b) / ev[t].a * 100));
    const ebar = (v, cls) => `<span class="ebar" aria-hidden="true"><i class="${cls}" style="width:${(v / errMax * 100).toFixed(1)}%"></i></span>`;
    $('bs-eval-tbl').innerHTML = !rows.length ? '<tbody><tr><td class="table-empty">올해 비교할 입력 달이 아직 없어요</td></tr></tbody>' :
      '<thead><tr><th>에너지원</th><th class="r">비교한 달</th><th class="r">기상연동 예측 오차</th><th class="r">같은 달 평균만</th><th>더 잘 맞힌 쪽</th></tr></thead><tbody>' +
      rows.map(t => {
        const e = ev[t], w = e.w / e.a * 100, b = e.b / e.a * 100, better = w <= b;
        return `<tr><td>${t}</td><td class="r">${e.n}</td><td class="r ${better ? 'ok' : 'warn'}">${ebar(w, better ? 'ok' : 'warn')}${fmt(w, 1)}%</td>` +
          `<td class="r">${ebar(b, '')}${fmt(b, 1)}%</td><td class="${better ? 'ok' : 'warn'}">${better ? '✓ 날씨 보정' : '같은 달 평균'}</td></tr>`;
      }).join('') + '</tbody>';
    $('bs-eval-note').textContent = rows.length
      ? '오차 = |실제 − 예측|의 합 ÷ 실제의 합 (거점 합산, 기상 관측이 끝난 달만) · 낮을수록 정확해요. 초록이면 날씨 보정이 같은 달 평균보다 잘 맞힌 것'
      : '';
  }

  /* ── 실적 조회 (마감된 연도만, 예측 없음) ─────────────── */
  const pastYears = () => [...new Set([...energyRecs.map(r => r.date), ...wasteRecs.map(r => r.date), ...metricRecs.map(r => r.period)]
    .map(d => (d || '').slice(0, 4)))].filter(y => /^\d{4}$/.test(y) && +y < new Date().getFullYear()).sort();
  const yrLock = y => `${yrShort(y)}${isClosed(y) ? ' ' + icn('lock') : ''}`; // 표 머리글용: 마감 연도 표시
  // 연도·거점별 집계 (입력이 하나도 없는 항목은 null → 표에 0 대신 '—')
  function yearStat(y, sites) {
    const e = energyRecs.filter(r => r.date?.startsWith(y) && sites.includes(r.site));
    const w = wasteRecs.filter(r => r.date?.startsWith(y) && sites.includes(r.site));
    const m = metricRecs.filter(r => r.period?.slice(0, 4) === y && sites.includes(r.site));
    const ghg = sc => sumBy(e.filter(r => isEmit(r.type) && scopeOf(r.type) === sc), r => r.ghg);
    const amt = (...ts) => { const rs = e.filter(r => ts.includes(r.type)); return rs.length ? sumBy(rs, r => r.amount) : null; };
    const mx  = item => { const rs = m.filter(r => r.item === item); return rs.length ? sumBy(rs, r => r.value) : null; };
    const wTon = w.length ? sumBy(w, r => r.weightTon) : null;
    const ev = evStat(y, sites);
    // 에너지원별 온실가스 환산 (tCO₂eq) — 재생에너지 자가발전·회생제동은 회피 배출량(참고)
    const co2 = (...ts) => { const rs = e.filter(r => ts.includes(r.type)); return rs.length ? sumBy(rs, r => co2Of(r.type, +r.amount || 0)) : null; };
    const g = { elec: co2('전력'), gas: co2('도시가스'), heat: co2('지역난방'), gasoline: co2('휘발유'), diesel: co2('경유'),
                fuel: co2('휘발유', '경유'), reSelf: co2(RE_SELF), regen: co2(SAVE_REGEN) };
    return {
      s1: ghg('Scope 1'), s2: ghg('Scope 2'), wTon, s3: w.length && w.some(r => r.ghg != null) ? sumBy(w, r => r.ghg || 0) : null, g,
      elec: amt('전력'), gas: amt('도시가스'), heat: amt('지역난방'), gasoline: amt('휘발유'), diesel: amt('경유'),
      fuel: amt('휘발유', '경유'), reSelf: amt(RE_SELF), reBuy: amt(RE_BUY), regen: amt(SAVE_REGEN),
      water: mx(WATER), evAll: ev?.all ?? null, evGreen: ev?.green ?? null, evRate: ev?.rate ?? null,
      months: new Set(e.map(r => r.date.slice(5, 7))).size, hasData: e.length + w.length + m.length > 0,
    };
  }
  const re100Of = s => { const c = (s.elec ?? 0) + (s.reSelf ?? 0), r = (s.reSelf ?? 0) + (s.reBuy ?? 0); return (c > 0 && r > 0) ? r / c * 100 : null; };
  const dgbOf = y => sumBy(energyRecs.filter(r => r.date?.startsWith(y) && r.site === HEAD_SITE && isEmit(r.type)), r => r.ghg);
  const divN = (v, k) => v == null ? null : v / k;
  let histExports = {}; // CSV 내보내기용: compare = 연도별 비교 표, site = 거점별 표

  const ghgOfStat = s => s.months ? s.s1 + s.s2 : null; // 에너지 입력이 없는 해는 0 대신 '—'

  // 실적 조회 상태 — 고른 연도 · 보기('cmp' 연도별 비교 | 'year' 그 해 자세히) · 증감 요인 나눔 · 월별 누적 여부
  let histYear = null, histView = 'cmp', histWhyBy = 'type', histCum = false, histCopy = '', histMixBy = 'scope', histMonYrs = null;   // histMixBy: 배출 구성을 나눠 쌓는 방식 (scope · type · site) · histMonYrs: 월별 패턴에서 비교할 기간 (null = 고른 연도까지 최근 4개년 · { from, to } = 그 사이 연도)
  const HV_KEY = 'nia-env.hv';   // 고른 보기는 이 브라우저에 기억
  try { if (['cmp', 'year'].includes(localStorage.getItem(HV_KEY))) histView = localStorage.getItem(HV_KEY); } catch { /* 저장소를 못 쓰면 기본값 */ }
  const yearsSpan = ys => ys.length > 1 ? `${yrShort(ys[0])}~${yrShort(ys[ys.length - 1])}` : yrShort(ys[0]);

  // 실적 조회: 위쪽에서 연도 하나(‹ 2025년 ›)를 고르고 [연도별 비교 | 그 해 자세히]를 오감 (기본 = 가장 최근 연도 · 연도별 비교)
  function renderHistory() {
    const years = pastYears(), si = curSite;
    renderSiteInfo('h-site-info', si, histYear);
    $('h-empty').hidden = years.length > 0;
    $('h-body').hidden = !years.length;
    $('h-pick').hidden = $('h-tabs').hidden = !years.length;
    histExports = {};
    if (!years.length) { $('h-toc').innerHTML = ''; syncStick(); return; }
    if (!years.includes(histYear)) histYear = years[years.length - 1];
    const yi = years.indexOf(histYear);
    $('h-year').innerHTML = years.slice().reverse().map(y => `<option value="${y}">${y}년${isClosed(y) ? ' [마감]' : ''}</option>`).join('');
    $('h-year').value = histYear;
    $('h-prev').disabled = yi <= 0;
    $('h-next').disabled = yi >= years.length - 1;
    $('hv-year').textContent = `${yrShort(histYear)} 자세히`;
    ['cmp', 'year'].forEach(v => { const b = $(`hv-${v}`); b.setAttribute('aria-selected', String(histView === v)); b.tabIndex = histView === v ? 0 : -1; });
    const cmp = histView === 'cmp';
    $('h-cmp-view').hidden = !cmp;
    $('h-year-view').hidden = cmp;
    const S = Object.fromEntries(years.map(yy => [yy, yearStat(yy, si ? [si] : SITES)]));
    // RE100은 대상 거점(대구·제주)만 — 전체 합계에서 서울이 섞이지 않게 (올해 현황과 같은 셈)
    //  연도 키와 섞이지 않게 숨은 칸(enumerable:false)으로 달아 둠
    Object.defineProperty(S, 're', { value: si ? S : Object.fromEntries(years.map(yy => [yy, yearStat(yy, TARGET_SITES.re)])), enumerable: false });
    // 온실가스 자체·법적 목표는 대구본원만 — 전체 합계에서도 목표 비교는 대구본원 배출로 (세 거점 합을 대구 목표와 견주지 않게)
    Object.defineProperty(S, 'ghg', { value: si ? S : Object.fromEntries(years.map(yy => [yy, yearStat(yy, TARGET_SITES.ghg)])), enumerable: false });
    if (cmp) renderCompareView(years, S, si);
    else { renderYearView('y-', +histYear, si); renderHistSiteTable(histYear); }
    renderHistToc();
    syncStick();
  }

