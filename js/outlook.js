/* js/outlook.js (6/9) — 목표·로드맵 · 전망 — 연말 예측 분해 · 장기 전망 · 로드맵 그래프 · 전망 탭
   한 덩어리였던 js/app.js 를 순서 그대로 나눈 것. 파일들은 index.html 에 적힌 순서(core → … → main)로 불러오고,
   최상위 const·let·function 은 모든 파일이 함께 쓴다. 새 파일을 만들면 index.html 에도 넣을 것. */
  /* ── 목표·로드맵 탭: 온실가스 감축(대구본원) · RE100 이행 · 폐기물 감축 ─────────────
     기준 연도 = 올해(실적 + 기상연동 연말 예측) 또는 지난 연도(그 해 실적을 진하게)
     온실가스 로드맵은 언제나 대구본원 · RE100·폐기물은 고른 거점이 목표 대상이면 그 거점, 아니면 대구본원 기준 */
  let rmapYear = null;
  // 목표별 대상 거점 (목표·로드맵 탭) — 거점을 고르지 않고 목표마다 정해진 거점을 합산해 달성 여부를 봄
  const RMAP_GOALS = [
    { k: 'ghg', icon: icn('factory'), name: '온실가스 감축', sites: () => TARGET_SITES.ghg, how: '대구본원 Scope 1+2' },
    { k: 're',  icon: icn('sun'), name: 'RE100 이행',   sites: () => TARGET_SITES.re, how: '두 거점 합산 이행률' },
    { k: 'wt',  icon: icn('trash'), name: '폐기물 감축',  sites: () => TARGET_SITES.waste, how: '세 거점 합산 발생량' },
  ];
  const SITE_SHORT = { '대구본원': '대구', '제주글로벌센터': '제주', '서울사무소': '서울' };
  const sitesLabel = ss => ss.length === 1 ? ss[0] : `${ss.map(s => SITE_SHORT[s] || s).join('+')} 합산`;
  const rmapSite = () => '대구본원';   // 로드맵 그래프를 누르면 여는 자료의 기본 거점
  // RE100 연말 예측 (여러 거점 합산): 입력된 실적 + 거점마다 남은 달 전력·자가발전 예측 (구매분은 입력된 실적만)
  function rePredOf(curYr, sites) { const p = rePredParts(curYr, sites); return p && p.cons > 0 && p.re > 0 ? p.re / p.cons * 100 : null; }
  // 올해 RE100 연말 예측 — 전력·자가발전은 남은 달을 예측해 더하고, 구매(녹색프리미엄·REC·PPA)는 입력된 양 그대로
  //  (구매는 보통 1년치를 한 번에 계약·입력하므로 남은 달로 늘리지 않음 — 더 사면 그때 입력)
  //  반환: cons 총 전력(한전+자가) · re 재생에너지(자가+구매) · elec/self/buy 연말까지 · actCons/actRe 지금까지
  function rePredParts(curYr, sites) {
    let elec = 0, self = 0, buy = 0, actCons = 0, actRe = 0, any = false;
    sites.forEach(s => {
      const st = yearStat(String(curYr), [s]), fc = buildForecast(curYr, s);
      const pSelf = sumArr(fc?.predEnergy[RE_SELF] || []), pElec = sumArr(fc?.predEnergy['전력'] || []);
      elec += (st.elec ?? 0) + pElec; self += (st.reSelf ?? 0) + pSelf; buy += st.reBuy ?? 0;
      actCons += (st.elec ?? 0) + (st.reSelf ?? 0); actRe += (st.reSelf ?? 0) + (st.reBuy ?? 0);
      if (fc) any = true;
    });
    return any ? { cons: elec + self, re: self + buy, elec, self, buy, actCons, actRe } : null;
  }
  // RE100 목표까지 더 필요한 재생에너지(kWh) — 구매는 총 전력사용량을 바꾸지 않으므로 '목표% × 총 전력 − 재생에너지'
  //  올해는 연말 예측 기준, 지난 연도는 실적 기준 · 이미 달성이면 0
  function reNeed(y, sites) {
    const g = reGoalOf(y); if (g == null) return null;
    let cons, re;
    if (+y === new Date().getFullYear()) { const pp = rePredParts(+y, sites); if (!pp) return null; ({ cons, re } = pp); }
    else { const s = yearStat(String(y), sites); cons = (s.elec ?? 0) + (s.reSelf ?? 0); re = (s.reSelf ?? 0) + (s.reBuy ?? 0); }
    return cons > 0 ? Math.max(0, g / 100 * cons - re) : null;
  }
  const needTxt = kwh => kwh > 0 ? `재생에너지 ${fq(Math.ceil(kwh))}kWh 더 필요` : '';

  /* ── 연말 예측 분해 — 팝업의 '연말 예측은 이렇게 나왔어요' (달마다·항목마다 입력된 실적 + 남은 달 예측) ──
     예측 값은 buildForecast와 같은 셈이라 카드·목표·메인의 연말 예측과 숫자가 같음 */
  const fcMethod = y => `남은 달 = 직전 ${TRAIN_N}개년(${trainYearsFor(+y).map(yrShort).join('·')}) 같은 달 평균에 해마다의 추세를 반영 · ` +
    '이미 지난 달은 그 달 기온(냉난방도일)만큼 더 보정 · 앞으로 올 달과 차량연료·재생에너지는 기온 보정 없이';
  const fcLink = sites => ({ go: 'dashboard', scroll: 'sec-charts', site: sites.length === 1 ? sites[0] : '', label: '월별 그래프 보기' });
  // 달마다 '예측으로 채운 항목' (입력된 달인데 일부 항목만 비어 있으면 팝업이 무엇이 비었는지 알려 줌)
  const ptAdd = (mo, k) => { const a = (mo.pt ||= []); if (!a.includes(k)) a.push(k); };
  // 온실가스 (Scope 1+2) — 배출원마다
  function fcGhgOf(y, sites = [ORG_SITE]) {
    const ys = String(y), months = m12(i => ({ m: i + 1, act: 0, pred: 0 }));
    const parts = EMIT_TYPES.map(t => ({ k: t, sub: scopeOf(t), act: 0, pred: 0, col: typeCol(t) }));
    let any = false;
    sites.forEach(s => {
      const fc = buildForecast(+y, s); if (fc) any = true;
      energyRecs.filter(r => r.site === s && r.date?.startsWith(ys) && isEmit(r.type)).forEach(r => {
        const g = +r.ghg || 0; months[+r.date.slice(5, 7) - 1].act += g; const p = parts.find(x => x.k === r.type); if (p) p.act += g; });
      EMIT_TYPES.forEach(t => (fc?.predEnergy[t] || []).forEach((v, i) => { if (!(v > 0)) return;
        const g = calcGHG(t, v); months[i].pred += g; parts.find(x => x.k === t).pred += g;
        ptAdd(months[i], `${sites.length > 1 ? `${SITE_SHORT[s] || s} ` : ''}${t}`); }));
    });
    if (!any) return null;
    return { unit: 'tCO₂eq', d: 3, act: sumBy(months, m => m.act), pred: sumBy(months, m => m.pred), months, parts,
             method: fcMethod(y), link: fcLink(sites) };
  }
  // RE100 — 총 전력(분모) = 전력 + 자가발전 · 재생에너지(분자) = 자가발전 + 구매
  function fcReOf(y, sites) {
    const ys = String(y), months = m12(i => ({ m: i + 1, act: 0, pred: 0 }));
    const el = { k: '전력 (한전)', act: 0, pred: 0, col: typeCol('전력') }, se = { k: '자가발전', sub: '태양광 등', act: 0, pred: 0, col: typeCol(RE_SELF) },
          bu = { k: '구매', sub: '녹색프리미엄·REC·PPA', act: 0, pred: 0 };
    let any = false;
    sites.forEach(s => {
      const fc = buildForecast(+y, s); if (fc) any = true;
      energyRecs.filter(r => r.site === s && r.date?.startsWith(ys) && ['전력', RE_SELF, RE_BUY].includes(r.type)).forEach(r => {
        const v = +r.amount || 0, i = +r.date.slice(5, 7) - 1;
        if (r.type === RE_BUY) bu.act += v; else { (r.type === '전력' ? el : se).act += v; months[i].act += v; } });
      ['전력', RE_SELF].forEach(t => (fc?.predEnergy[t] || []).forEach((v, i) => { if (!(v > 0)) return;
        (t === '전력' ? el : se).pred += v; months[i].pred += v;
        ptAdd(months[i], `${sites.length > 1 ? `${SITE_SHORT[s] || s} ` : ''}${t === '전력' ? '전력' : '자가발전'}`); }));
    });
    if (!any) return null;
    return { unit: 'kWh', d: 0, title: '연말 예측은 이렇게 나왔어요 — 총 전력사용량', resK: '연말 총 전력', months,
             act: el.act + se.act, pred: el.pred + se.pred,
             parts: [el, se, bu, { k: '총 전력사용량', sub: '전력 + 자가발전 (나누는 수)', act: el.act + se.act, pred: el.pred + se.pred, strong: true },
                     { k: '재생에너지', sub: '자가발전 + 구매 (나뉘는 수)', act: se.act + bu.act, pred: se.pred, strong: true }],
             method: fcMethod(y) + ' · 구매는 입력된 양 그대로 (1년치 계약)', link: fcLink(sites) };
  }
  // 폐기물 — wasteProjection과 같은 셈 (마지막 입력 달 다음부터 직전 2개년 같은 달 평균)
  function fcWasteOf(y, sites) {
    const yr = String(y), train = Array.from({ length: TRAIN_N }, (_, i) => String(+y - TRAIN_N + i));
    const months = m12(i => ({ m: i + 1, act: 0, pred: 0 })), parts = [];
    let any = false;
    sites.forEach(s => {
      const rs = wasteRecs.filter(r => r.site === s), cur = rs.filter(r => r.date?.startsWith(yr));
      const ty = train.filter(t => rs.some(r => r.date?.startsWith(t)));
      if (cur.length || ty.length) any = true;
      let a = 0, p = 0;
      cur.forEach(r => { const v = +r.weightTon || 0; months[+r.date.slice(5, 7) - 1].act += v; a += v; });
      if (ty.length) {
        const last = cur.length ? Math.max(...cur.map(r => +r.date.slice(5, 7))) : 0;
        for (let m = last + 1; m <= 12; m++) {
          const v = ty.reduce((q, t) => q + sumBy(rs.filter(r => r.date === `${t}-${pad(m)}`), r => r.weightTon), 0) / ty.length;
          months[m - 1].pred += v; p += v; if (sites.length > 1) ptAdd(months[m - 1], SITE_SHORT[s] || s); }
      }
      parts.push({ k: s, act: a, pred: p });
    });
    if (!any) return null;
    return { unit: 'ton', d: 3, act: sumBy(months, m => m.act), pred: sumBy(months, m => m.pred), months, parts: parts.length > 1 ? parts : [],
             method: `남은 달 = 직전 ${TRAIN_N}개년(${train.map(yrShort).join('·')}) 같은 달 평균 (폐기물은 날씨 보정 없이)`, link: fcLink(sites) };
  }
  // 출처 줄 모음 (팝업마다 같은 말을 쓰도록)
  const srcGhg = (y, { base, rateK, rateV, est, site = ORG_SITE } = {}) => [
    ...(base != null ? [S_SET(`기준배출량 (${yrShort(y)})`, `${fq(base)} t`)] : []),
    ...(rateK ? [{ k: rateK, v: rateV, ...(rateK.includes('자체') ? { kind: 'set', from: '데이터 관리 → 연도 마감·로드맵 (NIA 2050 로드맵)', go: 'manage', sub: 'settings', need: 'admin', btn: '설정 보기' }
                                                                  : { kind: 'fix', from: '공공부문 온실가스 목표관리제 연도별 권장감축률 (24년 13.2% … 30년 37.4%)' }) }] : []),
    { k: est ? `${yrShort(y)} 지금까지 실적` : `${yrShort(y)} 실적`, ...S_IN_E },
    ...(est ? [S_FC(site)] : []), S_EF];

  /* ── 전망 (전망 탭 · 목표·로드맵 그래프) — 온실가스(대구본원) · RE100(대구+제주) · 올해 ~ 2050년 ─────────────
     출발점 = 올해 연말 예측 (실적 + 남은 달 기상연동 예측) — 몇 년 뒤 날씨는 알 수 없어 최근 추세를 이어 봄
     · 에너지원마다 최근 3년(올해 연말 예측까지) 연평균 증감률로 시작 — 한 해 ±7% 안으로
       (구조 변화로 크게 줄어든 항목이 몇 년 더 같은 속도로 줄어든다고 보지 않도록)
     · 감쇠: 추세의 힘은 해마다 20%씩 약해짐 — 사용량이 끝없이 줄거나 늘지 않고 몇 년 뒤엔 평평해짐 (2050까지 보기 때문)
     · 태양광 자가발전 = 올해 연말 예측 + 증설분 (1kW당 발전량 × 늘어난 설비 용량) — 늘어난 만큼 한전 전력은 줄어듦
       (건물이 쓰는 전기 총량은 그대로 · 나눠 쓰는 몫만 바뀜)
     · 재생에너지 구매(녹색프리미엄 등)는 정책 결정이라 추세를 잇지 않고 올해 양 그대로
     · 배출계수는 지금 값 그대로 — 계수가 바뀌면 전망도 바뀜 */
  const OUTLOOK = { to: 2050, span: 3, cap: 7, damp: 0.8 };
  // 감쇠 추세 배수 — n년 뒤 = (1 + g)(1 + g×0.8)(1 + g×0.8²)… (한 해 지날 때마다 추세의 힘이 20%씩 약해짐)
  const olMult = (g, n) => { let m = 1; for (let k = 0; k < n; k++) m *= 1 + g * Math.pow(OUTLOOK.damp, k); return m; };
  // 그 해 추세 증감률 (k = 올해에서 몇 년째) — 팝업 설명용
  const olRateAt = (g, k) => g * Math.pow(OUTLOOK.damp, k - 1);
  const olYears = () => { const a = []; for (let y = new Date().getFullYear(); y <= OUTLOOK.to; y++) a.push(y); return a; };
  // 그 해 에너지원 하나의 연간 사용량 (sites 합산) — 지난 연도는 12달이 다 있는 해만, 올해는 실적 + 남은 달 예측
  function olYearUse(y, sites, t, fcOf) {
    const curYr = new Date().getFullYear();
    let v = 0, any = false;
    for (const s of sites) {
      const rs = energyRecs.filter(r => r.site === s && r.type === t && r.date?.startsWith(String(y)));
      if (+y < curYr && rs.length && new Set(rs.map(r => r.date.slice(5, 7))).size < 12) return null;   // 빠진 달이 있는 해는 추세에 안 씀
      if (rs.length) { v += sumBy(rs, r => +r.amount || 0); any = true; }
      if (+y === curYr) { const p = sumArr(fcOf(s)?.predEnergy[t] || []); if (p > 0) { v += p; any = true; } }
    }
    return any ? v : null;
  }
  // 에너지원 하나의 올해 ~ 2050 (최근 추세 · 감쇠) — tv = 추세만 · v = 그 해 전망 (전력은 태양광 증설분·절감을 반영한 값)
  function olSeries(sites, t, fcOf) {
    const y0 = new Date().getFullYear(), u0 = olYearUse(y0, sites, t, fcOf);
    if (!(u0 > 0)) return null;
    let g = 0, from = null;
    for (let k = OUTLOOK.span; k >= 1; k--) {   // 가장 먼 해부터 (자료가 빠진 해는 건너뜀)
      const u = olYearUse(y0 - k, sites, t, fcOf);
      if (u > 0) { g = Math.pow(u0 / u, 1 / k) - 1; from = y0 - k; break; }
    }
    const gc = Math.max(-OUTLOOK.cap / 100, Math.min(OUTLOOK.cap / 100, g)), ys = olYears();
    const tv = ys.map(y => u0 * olMult(gc, y - y0));
    return { t, u0, g, gc, capped: Math.abs(gc - g) > 1e-9, from, ys, tv, v: tv.slice() };
  }
  const olFc = () => { const c = {}, y0 = new Date().getFullYear(); return s => (c[s] ??= buildForecast(y0, s)); };
  const ymNow = () => { const d = new Date(); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}`; };
  const hasSolar = s => solarRows.some(r => r.site === s);
  // 그 달 가동 중인 설비 용량 (kW) — 가동 시작이 비어 있으면 기존 설비
  const solarCap = (s, ym, rows = solarRows) => +sumBy(rows.filter(r => r.site === s && (!r.from || r.from <= ym)), r => r.kw).toFixed(3);
  // 1kW당 달마다 발전량 (kWh/kW) — 학습연도마다 '그 달 자가발전 실적 ÷ 그 달 설비 용량'의 평균
  //  실적이 없는 달은 다른 거점의 같은 달 평균 → 그래도 없으면 표준 (일평균 3.6시간 × 그 달 날수)
  //  반환: site → { yl: 12달 값, src: 'own' 모두 실측 | 'mix' 일부 채움 | 'std' 실측 없음 }
  function solarYields(train) {
    const own = s => m12(i => { const vs = train.map(y => { const ym = `${y}-${pad(i + 1)}`, cap = solarCap(s, ym);
        const rs = energyRecs.filter(r => r.site === s && r.type === RE_SELF && r.date === ym);
        return cap > 0 && rs.length ? sumBy(rs, r => +r.amount || 0) / cap : null; }).filter(v => v != null);
      return vs.length ? sumArr(vs) / vs.length : null; });
    const cache = {}, get = s => (cache[s] ??= own(s)), withPv = SITES.filter(hasSolar);
    return s => { const a = get(s), n = a.filter(v => v != null).length;
      const yl = a.map((v, i) => { if (v != null) return v;
        const o = withPv.filter(x => x !== s).map(x => get(x)[i]).filter(x => x != null);
        return o.length ? sumArr(o) / o.length : 3.6 * new Date(2001, i + 1, 0).getDate(); });
      return { yl, src: n === 12 ? 'own' : n ? 'mix' : 'std' }; };
  }
  // 태양광 증설분 — 거점마다 '1kW당 발전량(달마다, 학습연도 평균) × 그 해 달마다 설비 용량'을 올해와 견줌
  //  per[] = { site, yl 달마다 kWh/kW, annual 1kW당 연 발전량, cap 해마다 12월 용량, gen 해마다 발전량, extra 올해보다 늘어난 발전량 }
  //  extra = 만약에 계산에서 더해 보는 설비 (저장 안 됨)
  function solarOutlook(sites, extra = []) {
    const y0 = new Date().getFullYear(), ys = olYears(), yieldOf = solarYields(trainYearsFor(y0));
    const rows = extra.length ? solarRows.concat(extra) : solarRows;
    const per = sites.filter(s => rows.some(r => r.site === s)).map(s => {
      const { yl, src } = yieldOf(s), caps = ys.map(y => m12(i => solarCap(s, `${y}-${pad(i + 1)}`, rows)));
      const gen = caps.map(c => sumArr(c.map((k, i) => yl[i] * k)));
      return { site: s, yl, src, annual: sumArr(yl), cap: caps.map(c => c[11]), gen, extra: gen.map(v => v - gen[0]) };
    });
    if (!per.length) return null;
    const capNow = sumBy(per, p => p.cap[0]);
    return { ys, per, extra: ys.map((_, i) => sumBy(per, p => p.extra[i])),
             yAvg: capNow > 0 ? sumBy(per, p => p.annual * p.cap[0]) / capNow : null };   // 용량 가중 1kW당 연 발전량
  }
  /* 만약에 (전망 탭 계산기 · 저장 안 됨) — sc = { pv: { site, kw, from: 'YYYY-MM' }, buy: { kwh, from }, cut: { pct, from } } (없는 칸은 null)
     pv = 태양광을 더 설치 · buy = 재생에너지 구매량을 바꿈 · cut = 전력·도시가스·지역난방을 그 해부터 몇 % 덜 씀 */
  const SC_CUT_TYPES = ['전력', '도시가스', '지역난방'];
  const scCut = (sc, y) => sc?.cut && y >= sc.cut.from ? 1 - sc.cut.pct / 100 : 1;
  const scPv = (sc, sites) => sc?.pv && sites.includes(sc.pv.site) ? [sc.pv] : [];
  // 온실가스 (대구본원 Scope 1+2) — 에너지원별 사용량 전망 × 배출계수 · 태양광 증설분만큼 한전 전력 감소
  function ghgOutlook(sc = null) {
    const fcOf = olFc(), S = TARGET_SITES.ghg, per = EMIT_TYPES.map(t => olSeries(S, t, fcOf)).filter(Boolean);
    if (!per.length) return null;
    const ys = per[0].ys, sol = solarOutlook(S, scPv(sc, S));
    per.forEach(p => { if (SC_CUT_TYPES.includes(p.t) && sc?.cut) { p.cutF = ys.map(y => scCut(sc, y)); p.v = p.tv.map((v, i) => v * p.cutF[i]); } });
    const el = per.find(p => p.t === '전력');
    if (el && sol?.extra.some(v => v > 0)) { el.solar = sol.extra.map((x, i) => Math.min(Math.max(0, x), el.v[i])); el.v = el.v.map((v, i) => v - el.solar[i]); }
    return { ys, per, sol, sc, v: ys.map((_, i) => sumBy(per, p => calcGHG(p.t, p.v[i]))) };
  }
  // RE100 정부 목표가 없는 해(31~49년)는 앞뒤 목표를 이은 참고값 — 그래프에서 30년 60% → 50년 100%를 잇는 선과 같음
  const reGoalRef = y => { if (reGoalOf(y) != null) return null; const ks = Object.keys(RE_GOAL).map(Number).sort((a, b) => a - b);
    const lo = ks.filter(k => k < +y).pop(), hi = ks.find(k => k > +y);
    return lo == null || hi == null ? null : +(RE_GOAL[lo] + (RE_GOAL[hi] - RE_GOAL[lo]) * (+y - lo) / (hi - lo)).toFixed(1); };
  // RE100 (대구+제주) — 총 전력 = 한전 전력 + 자가발전 · 재생에너지 = 자가발전 + 구매(올해 양 그대로)
  //  자가발전 = 올해 연말 예측 + 증설분 · 한전 전력 = 최근 추세 − 증설분
  //  goal = 정부 목표 · ref = 목표가 없는 해의 참고값 · need = 목표(없으면 참고값)까지 더 필요한 재생에너지
  function reOutlook(sc = null) {
    const y0 = new Date().getFullYear(), S = TARGET_SITES.re, fcOf = olFc();
    const el = olSeries(S, '전력', fcOf);
    if (!el) return null;
    const sol = solarOutlook(S, scPv(sc, S)), self0 = olYearUse(y0, S, RE_SELF, fcOf) ?? 0;
    const buy = sumBy(energyRecs.filter(r => S.includes(r.site) && r.type === RE_BUY && r.date?.startsWith(String(y0))), r => +r.amount || 0);
    const rows = el.ys.map((y, i) => {
      const base = el.tv[i] * scCut(sc, y), ex = Math.min(sol ? Math.max(0, sol.extra[i]) : 0, base);
      const grid = base - ex, self = self0 + ex, cons = grid + self, b = sc?.buy && y >= sc.buy.from ? sc.buy.kwh : buy, re = self + b;
      const goal = reGoalOf(y), ref = reGoalRef(y), g = goal ?? ref;
      return { y, goal, ref, grid, base, self, ex, buy: b, cons, re, pct: cons > 0 ? re / cons * 100 : null,
               need: g == null || !(cons > 0) ? null : Math.max(0, g / 100 * cons - re) };
    });
    return { ys: el.ys, el, sol, sc, self0, buy, rows };
  }
  // 모자란 재생에너지를 태양광으로 채우면 몇 kW (1kW당 연 발전량 기준)
  const needKw = (kwh, sol) => kwh > 0 && sol?.yAvg > 0 ? Math.ceil(kwh / sol.yAvg) : null;
  // 태양광 설비 한 줄 — '대구 142.304kW · 제주 62.784kW' (y가 있으면 그 해 12월 기준)
  const solarLine = (sites, ym) => sites.filter(hasSolar).map(s => `${SITE_SHORT[s] || s} ${fq(solarCap(s, ym))}kW`).join(' · ');
  // 앞으로 가동할 설비 (증설 예정) — '27.3월 대구 +50kW'
  const solarPlans = sites => { const now = ymNow();
    return solarRows.filter(r => sites.includes(r.site) && r.from && r.from > now).sort((a, b) => a.from.localeCompare(b.from))
      .map(r => `${r.from.slice(2, 4)}.${+r.from.slice(5, 7)}월 ${SITE_SHORT[r.site] || r.site} +${fq(r.kw)}kW`); };
  const S_SOLAR = sites => ({ k: '태양광 설비 용량', v: solarLine(sites, ymNow()) || '없음', kind: 'set',
    from: '데이터 관리 → 연도 마감·로드맵 → 태양광 설비 (증설하면 가동 시작과 함께 추가)', go: 'manage', sub: 'settings', scroll: 'solar-card', need: 'admin', btn: '설비 보기' });

  /* ── 목표·로드맵 그래프 · 📈 전망 탭(카드·그래프·표)에서 누른 해의 계산 근거 (팝업) ─────────────
     올해 = 연말 예측 (입력된 실적 + 남은 달 예측) · 내년 ~ 50년 = 전망 (최근 추세 · 해마다 약해짐 + 태양광 증설분)
     팝업 위 ‹ 연도 목록 › 과 이정표 칩(올해 · 30 · 40 · 50년)으로 오감 — 전망의 출발점(올해 연말 예측)이 어떻게 나왔는지는 올해 칩에서 */
  const olArrow = g => `${g > 0 ? '▲' : g < 0 ? '▼' : '→'}${fmt(Math.abs(g * 100), 1)}%`;
  function rmYearPop(kind, y) {
    try { return kind === 're' ? reYearPop(+y) : ghgYearPop(+y); }
    catch (e) { console.warn('[목표·로드맵 팝업]', e); return { title: `${yrShort(y)} 계산 근거`, value: null, empty: '계산할 자료가 없어요' }; }
  }
  // 목표와 견주기 표 — 행 = 연말 예측 또는 전망 · 열 = 목표마다 여유/초과 (lower = 낮을수록 좋음) · extra = 덧붙일 열
  function olGoalSec(rows, goals, { unit, vk, d = 1, lower = true, pct = false, extra } = {}) {
    const f = v => pct ? `${fmt(v, d)}%` : fmt(v, d), fg = t => pct && Number.isInteger(t) ? `${t}%` : f(t);   // 정부 목표처럼 정수 %는 그대로
    const cell = (v, t) => { if (t == null || v == null) return '<td class="ct-n">—</td>';
      const ok = lower ? v <= t : v >= t;
      return `<td class="ct-n"><span class="ol-v ${ok ? 'ok' : 'no'}">${ok ? '✓' : '✗'} ${fmt(Math.abs(v - t), d)}${pct ? '%p' : ''} ` +
        `${lower ? (ok ? '여유' : '초과') : (ok ? '넘음' : '부족')}</span></td>`; };
    return `<div class="calc-sec"><h4><span>목표와 견주기</span><em>${esc(unit)}</em></h4><div class="calc-tw"><table class="calc-tbl olg"><thead><tr><th></th><th>${esc(vk)}</th>` +
      goals.map(g => `<th>${esc(g.k)}<small>${g.t == null ? '없음' : fg(g.t)}</small></th>`).join('') + (extra ? `<th>${esc(extra.k)}</th>` : '') + '</tr></thead><tbody>' +
      rows.map(r => `<tr><td class="ct-nm">${esc(r.k)}</td><td class="ct-n ct-val">${r.v == null ? '—' : f(r.v)}</td>` +
        goals.map(g => cell(r.v, g.t)).join('') + (extra ? `<td class="ct-n">${extra.f(r)}</td>` : '') + '</tr>').join('') + '</tbody></table></div></div>';
  }
  // 칸 하나 = 큰 값 + 작은 사용량 (에너지원별 표)
  const olCell = (big, small, cls = '') => `<td class="ct-n${cls ? ' ' + cls : ''}">${big}${small ? `<small class="ct-sub">${small}</small>` : ''}</td>`;
  //  up = 늘수록 좋은 항목 — 색만 반대로
  const olTrendCell = (p, y0, up = false) => !p ? olCell('—') : olCell(p.from ? olArrow(p.gc) : '—',
    p.capped ? `상한 · 실제 ${olArrow(p.g)}` : p.from ? `${yrShort(p.from)}→${yrShort(y0)} 연평균` : '비교할 해 없음',
    !p.from || !p.gc ? '' : (p.gc > 0) === up ? 'ct-good' : 'ct-bad');
  // 태양광 설비 표 — 거점마다 용량(올해 → 그 해) · 1kW당 연 발전량 · 증설분
  function solarSec(sol, i, y) {
    if (!sol) return '';
    const y0 = new Date().getFullYear();
    return `<div class="calc-sec"><h4><span>태양광 설비</span><em>자가발전 = 1kW당 발전량 × 설비 용량</em></h4><div class="calc-tw"><table class="calc-tbl"><thead><tr>` +
      `<th>거점</th><th>${yrShort(y0)} 말 용량</th><th>${yrShort(y)} 말 용량</th><th>1kW당 연 발전량</th><th>${yrShort(y)} 증설분</th></tr></thead><tbody>` +
      sol.per.map(p => `<tr><td class="ct-nm"><i style="background:${typeCol(RE_SELF)}"></i>${esc(p.site)}</td>` +
        olCell(`${fq(p.cap[0])}kW`) + olCell(`${fq(p.cap[i])}kW`, p.cap[i] > p.cap[0] ? `+${fq(+(p.cap[i] - p.cap[0]).toFixed(3))}kW` : '') +
        olCell(`${fq(Math.round(p.annual))}kWh`, `${trainYearsFor(y0).map(yrShort).join('·')} 실적 ÷ 용량`) +
        olCell(p.extra[i] > 0 ? `+${fq(Math.round(p.extra[i]))}kWh` : '—') + '</tr>').join('') + '</tbody></table></div></div>';
  }
  // 온실가스 (대구본원 Scope 1+2)
  function ghgYearPop(y) {
    const y0 = new Date().getFullYear(), yS = yrShort(y), y0S = yrShort(y0), S = TARGET_SITES.ghg;
    const lo = lawOf(y), law = lo?.t ?? null, tent = !!lo?.tent, own = ROADMAP[y]?.target ?? null;
    const goals = [{ k: tent ? '법적 목표 (미확정)' : '법적 목표', t: law }, { k: '자체 목표', t: own }];
    const head = { sub: `${sitesLabel(S)} Scope 1+2`, site: '', unit: 'tCO₂eq', yrNav: { kind: 'ghg', cur: y } };
    const dd = y === y0 ? 3 : 1;   // 올해는 카드처럼 소수 셋째 자리 · 전망은 첫째 자리
    const tgtSrc = [
      { k: `${yS} 법적 목표${tent ? ' (미확정)' : ''}`, v: law == null ? null : `${fmt(law, dd)} t`, kind: 'fix',
        from: `기준배출량 × (1 − 권장감축률${lo ? ` ${fmt(lo.rate, 1)}%` : ''}) · ${tent ? '31~50년은 아직 정해지지 않은 참고값 (30년 37.4% → 50년 100%)' : '공공부문 온실가스 목표관리제'}` },
      { k: `${yS} 자체 목표`, v: own == null ? null : `${fmt(own, dd)} t`, kind: 'set', from: '데이터 관리 → 연도 마감·로드맵 (NIA 2050 로드맵)',
        go: 'manage', sub: 'settings', need: 'admin', btn: '설정 보기' }];
    if (y === y0) {   // 올해 = 연말 예측
      const v = buildForecast(y0, S[0])?.annualPred ?? null;
      return { ...head, title: `${y0S} 온실가스 연말 예측`, period: '입력된 실적 + 남은 달 예측', value: v, valueK: `${y0S} 연말 예측`,
        empty: `${y0S} 실적이 없어 연말 예측을 못 해요`,
        blocks: v == null ? [] : [olGoalSec([{ k: `${y0S} 연말 예측`, v }], goals, { unit: 'tCO₂eq', vk: '배출량', d: 3 })],
        fc: fcGhgOf(y0, S),
        src: [{ k: `${y0S} 지금까지 실적`, ...S_IN_E }, S_FC(S[0]), S_EF, ...tgtSrc,
              { k: `${y0S} 월별 자료`, kind: 'in', from: '달마다 · 에너지원마다 입력된 값 (그래프 막대를 눌렀을 때와 같은 표)',
                drill: { kind: 'year', year: y0, site: S[0], focus: [] }, btn: '자료 보기' }] };
    }
    const OL = ghgOutlook(), i = OL ? OL.ys.indexOf(y) : -1;
    if (i < 0) return { ...head, title: `${yS} 온실가스 전망`, value: null, empty: `${yS} 전망을 낼 자료가 없어요 — 올해 연말 예측이 있어야 해요` };
    const v = OL.v[i], n = y - y0, ex = OL.sol?.extra[i] > 0 ? OL.sol.extra[i] : 0;
    // 셈 예 — 배출량이 가장 큰 에너지원으로 한 줄
    const big = OL.per.reduce((a, p) => calcGHG(p.t, p.u0) > calcGHG(a.t, a.u0) ? p : a), bu = GHG[big.t].unit;
    const pc = x => `${x < 0 ? '−' : '+'}${fmt(Math.abs(x * 100), 1)}%`;
    const steps = Array.from({ length: Math.min(n, 3) }, (_, k) => `${yrShort(y0 + k + 1)} ${pc(olRateAt(big.gc, k + 1))}`).join(' → ') + (n > 3 ? ' → …' : '');
    const exTxt = big.from ? `셈 예) ${big.t} ${y0S} 연말 예측 ${fq(Math.round(big.u0))} ${bu} × 추세 배수 ${fmt(olMult(big.gc, n), 3)} (${steps} · 해마다 20%씩 약해짐)` +
      ` = ${fq(Math.round(big.tv[i]))} ${bu}${big.solar?.[i] > 0 ? ` − 태양광 증설분 ${fq(Math.round(big.solar[i]))} ${bu} = ${fq(Math.round(big.v[i]))} ${bu}` : ''}` +
      ` → × 배출계수 ${GHG[big.t].desc.split(' (')[0]} = ${fmt(calcGHG(big.t, big.v[i]), 1)} t` : '';
    const how = `<div class="calc-sec"><h4><span>에너지원별로 이렇게 셈</span><em>tCO₂eq · 작은 글씨 = 사용량</em></h4><div class="calc-tw"><table class="calc-tbl"><thead><tr>` +
      `<th>에너지원</th><th>${y0S} 연말 예측</th><th>최근 추세</th><th>${yS} 전망</th></tr></thead><tbody>` +
      OL.per.map(p => { const u = esc(GHG[p.t].unit), sol = p.solar?.[i] > 0 ? p.solar[i] : 0;
        return `<tr><td class="ct-nm"><i style="background:${typeCol(p.t)}"></i>${esc(p.t)}<small>${esc(scopeOf(p.t) || '')}</small></td>` +
          olCell(fmt(calcGHG(p.t, p.u0), 1), `${fq(Math.round(p.u0))} ${u}`) + olTrendCell(p, y0) +
          olCell(fmt(calcGHG(p.t, p.v[i]), 1), `${fq(Math.round(p.v[i]))} ${u}${sol ? ` (태양광 증설 −${fq(Math.round(sol))})` : ''}`) + '</tr>'; }).join('') +
      `<tr class="ct-sum"><td>합계</td><td class="ct-n">${fmt(OL.v[0], 1)}</td><td></td><td class="ct-n">${fmt(v, 1)}</td></tr>` +
      '</tbody></table></div>' +
      `<div class="cfc-how"><span>ⓘ 전망 = 에너지원마다 ${y0S} 연말 예측에서 최근 연평균 증감률로 시작해 해마다 곱함 — 한 해 ±${OUTLOOK.cap}% 안, 추세의 힘은 해마다 20%씩 약해짐` +
      `${ex ? ' · 태양광을 늘리면 늘어난 발전량만큼 한전 전력을 뺌' : ''}${exTxt ? `<br>${esc(exTxt)}` : ''}</span></div></div>`;
    const caps = OL.per.filter(p => p.capped).map(p => p.t);
    return { ...head, title: `${yS} 온실가스 전망`, period: `${y0S} 연말 예측에서 최근 추세로`, valueTxt: fmt(v, 1), valueK: `${yS} 전망 배출량`,
      blocks: [olGoalSec([{ k: `${yS} 전망`, v }], goals, { unit: 'tCO₂eq', vk: '배출량' }), how, ...(ex ? [solarSec(OL.sol, i, y)] : [])],
      src: [{ k: `${y0S} 연말 예측 (출발점)`, v: `${fmt(OL.v[0], 1)} t`, kind: 'pred', from: '입력된 실적 + 남은 달 예측', rmpop: `ghg:${y0}`, btn: '근거 보기' },
            { ...S_IN_E, k: `지난 실적 (${yrShort(y0 - OUTLOOK.span)}~${yrShort(y0 - 1)})`, from: '추세를 셈 — 12달이 다 있는 해만 씀' },
            S_EF, ...(OL.sol ? [S_SOLAR(S)] : []), ...tgtSrc,
            { k: '추세 상한 · 감쇠', v: `연 ±${OUTLOOK.cap}% · 해마다 20%↓`, kind: 'fix', from: '크게 줄어든 항목이 몇 년 더, 2050년까지 같은 속도로 줄어든다고 보지 않도록 (대시보드 계산 규칙)', go: 'outlook', scroll: 'o-how-sec', btn: '셈 방법' }],
      note: (caps.length ? `${caps.join('·')}${josa(caps[caps.length - 1], '은', '는')} 최근 증감이 커서 한 해 ±${OUTLOOK.cap}%로 묶었어요 · ` : '') +
        '배출계수는 지금 값 그대로 — 계수가 바뀌면 전망도 바뀌어요' };
  }
  // RE100 (대구+제주 합산) — (자가발전 + 구매) ÷ (한전 전력 + 자가발전)
  function reYearPop(y) {
    const y0 = new Date().getFullYear(), yS = yrShort(y), y0S = yrShort(y0), S = TARGET_SITES.re, goal0 = reGoalOf(y), ref = reGoalRef(y), goal = goal0 ?? ref;
    const head = { sub: `${sitesLabel(S)} 이행률`, site: '', unit: '%', yrNav: { kind: 're', cur: y } };
    const goalSrc = { k: `${yS} 정부 이행 목표${goal0 == null && ref != null ? ' (참고)' : ''}`, v: goal != null ? `${fmt(goal, Number.isInteger(goal) ? 0 : 1)}%` : null, kind: 'fix',
      from: `공공기관 RE100 이행 목표 (${yrShort(RE_FIRST)} ${RE_GOAL[RE_FIRST]}% → 30년 60% → 50년 100%)${goal0 == null && ref != null ? ' · 31~49년은 정해진 값이 없어 30년과 50년을 이은 참고값' : ''}` };
    if (y === y0) {
      const pp = rePredParts(y0, S), v0 = pp && pp.cons > 0 ? pp.re / pp.cons * 100 : null, v = v0 == null ? null : Math.round(v0 * 10) / 10, need = reNeed(y0, S);
      const kw = needKw(need, solarOutlook(S));
      return { ...head, title: `${y0S} RE100 연말 예측`, period: '입력된 실적 + 남은 달 예측', value: v, valueK: `${y0S} 연말 예측 이행률`,
        empty: `${y0S} 전력 자료가 없어 연말 예측을 못 해요`,
        vs: v != null && goal != null ? { k: `${y0S} 연말 예측`, v: v0, t: goal, tk: '정부 목표', unit: '%', est: true, d: 1 } : null,
        formula: v == null ? null : { parts: [{ group: [{ k: '자가발전', v: Math.round(pp.self), u: 'kWh' }, { k: '구매', v: Math.round(pp.buy), u: 'kWh', op: '+' }] },
          { k: '총 전력 (한전 + 자가발전)', v: Math.round(pp.cons), u: 'kWh', op: '÷' }], result: { k: `${y0S} 연말 예측`, v, u: '%' } },
        facts: need > 0 ? [{ k: '목표까지 더 필요한 재생에너지', v: fq(Math.ceil(need)), u: 'kWh' },
                           ...(kw ? [{ k: '태양광으로 채우면 (1kW당 연 발전량 기준)', v: `약 ${fq(kw)}`, u: 'kW' }] : [])] : [],
        fc: fcReOf(y0, S),
        src: [{ k: '전력·자가발전·구매', ...S_IN_E }, S_FC(''), S_SOLAR(S), goalSrc,
              { k: `${y0S} 월별 자료`, kind: 'in', from: '대구본원 표부터 (위에서 거점을 바꿔 제주도)',
                drill: { kind: 'year', year: y0, site: rmapSite(), focus: ['전력', RE_SELF, RE_BUY] }, btn: '자료 보기' }] };
    }
    const ROL = reOutlook(), i = ROL ? ROL.ys.indexOf(y) : -1, r = i >= 0 ? ROL.rows[i] : null;
    if (!r || r.pct == null) return { ...head, title: `${yS} RE100 전망`, value: null, empty: `${yS} 전망을 낼 자료가 없어요 — 올해 전력 연말 예측이 있어야 해요` };
    const { el, sol, buy } = ROL, r0 = ROL.rows[0], k = v => fq(Math.round(v)), kw = needKw(r.need, sol);
    const c0 = sol ? +sumBy(sol.per, p => p.cap[0]).toFixed(3) : 0, ci = sol ? +sumBy(sol.per, p => p.cap[i]).toFixed(3) : 0;
    const capTxt = !sol ? '설비 없음' : ci > c0 ? `설비 ${fq(c0)} → ${fq(ci)}kW` : `설비 ${fq(c0)}kW 그대로`;
    const how = `<div class="calc-sec"><h4><span>이렇게 셈</span><em>kWh</em></h4><div class="calc-tw"><table class="calc-tbl"><thead><tr>` +
      `<th>항목</th><th>${y0S} 연말 예측</th><th>바뀌는 방식</th><th>${yS} 전망</th></tr></thead><tbody>` +
      `<tr><td class="ct-nm"><i style="background:${typeCol('전력')}"></i>한전 전력</td>${olCell(k(el.u0))}` +
        olCell(el.from ? `${olArrow(el.gc)} 추세` : '그대로', `${el.from ? `${yrShort(el.from)}→${y0S} 연평균 · 해마다 약해짐` : ''}${r.ex > 0 ? ' − 태양광 증설분' : ''}`, el.gc < 0 ? 'ct-good' : el.gc > 0 ? 'ct-bad' : '') +
        `${olCell(k(r.grid))}</tr>` +
      `<tr><td class="ct-nm"><i style="background:${typeCol(RE_SELF)}"></i>자가발전 <small>태양광</small></td>${olCell(k(ROL.self0))}` +
        olCell(r.ex > 0 ? `+${k(r.ex)}` : '그대로', capTxt, r.ex > 0 ? 'ct-good' : '') + `${olCell(k(r.self))}</tr>` +
      `<tr><td class="ct-nm"><i style="background:#94A3B8"></i>구매 <small>녹색프리미엄·REC·PPA</small></td>${olCell(k(buy))}${olCell('그대로', '정책 결정이라 추세 없음')}${olCell(k(buy))}</tr>` +
      `<tr class="ct-sum"><td>총 전력 <small>한전 + 자가발전 · 나누는 수</small></td>${olCell(k(r0.cons))}<td></td>${olCell(k(r.cons))}</tr>` +
      `<tr class="ct-sum"><td>재생에너지 <small>자가발전 + 구매 · 나뉘는 수</small></td>${olCell(k(r0.re))}<td></td>${olCell(k(r.re))}</tr>` +
      `<tr class="ct-sum"><td>이행률 <small>재생에너지 ÷ 총 전력</small></td>${olCell(`${fmt(r0.pct, 1)}%`)}<td></td>${olCell(`${fmt(r.pct, 1)}%`)}</tr>` +
      '</tbody></table></div>' +
      `<div class="cfc-how"><span>ⓘ 한전 전력 = ${y0S} 연말 예측 × 추세 배수 ${fmt(olMult(el.gc, y - y0), 3)} (최근 연평균 증감률로 시작해 해마다 20%씩 약해짐 · 한 해 ±${OUTLOOK.cap}% 안) · ` +
      `자가발전 = ${y0S} 연말 예측 + 태양광 증설분 (1kW당 발전량 × 늘어난 용량) · 늘어난 발전량만큼 한전 전력은 줄어요 — 건물이 쓰는 전기 총량은 그대로</span></div></div>`;
    return { ...head, title: `${yS} RE100 전망`, period: `${y0S} 연말 예측에서 최근 추세로`, valueTxt: fmt(r.pct, 1), valueK: `${yS} 전망 이행률`,
      factsFirst: true, factsTitle: '목표까지',
      vs: goal != null ? { k: `${yS} 전망`, v: r.pct, t: goal, tk: goal0 == null ? '정부 목표 (참고)' : '정부 목표', unit: '%', est: true, d: 1 } : null,
      facts: r.need > 0 ? [{ k: '목표까지 더 필요한 재생에너지 (연간)', v: fq(Math.ceil(r.need)), u: 'kWh' },
                           ...(kw ? [{ k: `태양광으로 채우면 (1kW당 연 ${fq(Math.round(sol.yAvg))}kWh 기준)`, v: `약 ${fq(kw)}`, u: 'kW' }] : []),
                           ...(buy > 0 ? [{ k: '구매로 채우면', v: `올해 구매량의 ${fmt(r.need / buy, 1)}배 더`, u: '' }] : [])] : [],
      blocks: [how, solarSec(sol, i, y)],
      src: [{ k: `${y0S} 연말 예측 (출발점)`, v: `${fmt(r0.pct, 1)}%`, kind: 'pred', from: '입력된 실적 + 남은 달 예측', rmpop: `re:${y0}`, btn: '근거 보기' },
            { ...S_IN_E, k: `지난 실적 (${yrShort(y0 - OUTLOOK.span)}~${yrShort(y0 - 1)})`, from: '한전 전력 추세를 셈 — 12달이 다 있는 해만 씀' },
            S_SOLAR(S),
            { k: '구매량', v: `${kwhK(buy)} kWh`, kind: 'in', from: `올해 입력된 구매량을 ${yS}에도 그대로 둠 — 더 사면 그만큼 이행률이 올라가요` },
            goalSrc],
      note: '더 필요한 양 = 목표% × 총 전력 − 재생에너지 · 태양광을 늘리면 재생에너지는 늘고 한전 전력은 그만큼 줄어요' };
  }
  // 범위 글자: 두 값이 (반올림해) 같으면 하나만
  const olRange = (a, b, f) => { const lo = Math.min(a, b), hi = Math.max(a, b), A = f(lo), B = f(hi); return A === B ? A : `${A} ~ ${B}`; };
  const kwhK = v => v >= 1e4 ? `${fmt(v / 1e4, 1)}만` : fq(Math.round(v));   // 큰 kWh는 '103.2만'처럼
  function renderRoadmapTab() {
    const curYr = new Date().getFullYear(), years = pastYears(), set = CHARTS.h || {};
    const opts = [String(curYr), ...years.slice().reverse()].filter((y, i, a) => a.indexOf(y) === i);
    if (!opts.includes(rmapYear)) rmapYear = String(curYr);
    $('rmap-year').innerHTML = opts.map(y => `<option value="${y}">${y}년${isClosed(y) ? ' [마감]' : ''}</option>`).join('');
    $('rmap-year').value = rmapYear;
    const oi = opts.indexOf(rmapYear);
    $('rmap-prev').disabled = oi >= opts.length - 1;   // 목록은 최근 연도가 위
    $('rmap-next').disabled = oi <= 0;
    const isCur = +rmapYear === curYr, RS = TARGET_SITES.re, WS = TARGET_SITES.waste;
    $('rmap-badge').hidden = !isCur;
    // 목표별 대상 거점 한 줄 안내
    $('rmap-scope').innerHTML = '<span class="rsc-lbl">목표별 대상 거점</span>' + RMAP_GOALS.map(g =>
      `<span class="rsc-item"><b>${g.icon} ${g.name}</b>${g.sites().map(s => `<i class="rsc-site">${SITE_SHORT[s] || s}</i>`).join('<em>+</em>')}` +
      `<small>${g.how}</small></span>`).join('');
    $('rmap-note').textContent = isCur ? '올해 = 입력된 실적 + 남은 달 예측 (기상연동)' : `${yrShort(rmapYear)} 실적 막대를 진하게`;
    $('h-goal-site').textContent = '온실가스 · RE100 · 폐기물';
    $('rmap-goal-note').textContent = (isCur ? '연한 막대 = 올해 연말 예측' : `진한 막대 = ${yrShort(rmapYear)}`) +
      (curYr < OUTLOOK.to ? ` · ${yrShort(curYr + 1)}~${yrShort(OUTLOOK.to)} 막대 = 전망 · 올해·전망 막대를 누르면 계산 근거` : ' · 올해 막대를 누르면 계산 근거');
    // 올해 연말 예측: 온실가스 = 대구본원 Scope 1+2 · RE100 = 대구+제주 합산 · 폐기물 = 세 거점 합산
    //  (지난 연도를 골라도 연도별 달성표의 '올해' 칸은 전망으로 보이게 늘 계산 · 그래프에는 올해를 고를 때만)
    let ghgPred = null, rePred = null, wtPred = null;
    {
      try { ghgPred = buildForecast(curYr, '대구본원')?.annualPred ?? null; } catch (e) { console.warn('[목표·로드맵 예측: 온실가스]', e); }
      try { rePred = rePredOf(curYr, RS); } catch (e) { console.warn('[목표·로드맵 예측: RE100]', e); }
      try { wtPred = v2 ? wasteProjection(curYr, WS)?.proj ?? null : null; } catch (e) { console.warn('[목표·로드맵 예측: 폐기물]', e); }
    }
    renderGoalStatus(rmapYear, ghgPred, rePred, wtPred);
    // 전망 (온실가스·RE100 · ~50년) — 고른 연도와 상관없이 '올해 연말 예측'에서 출발 · 그래프의 빗금 막대 + 아래 한 줄 (자세히는 📈 전망 탭)
    let OL = null, ROL = null;
    try { OL = ghgOutlook(); } catch (e) { console.warn('[목표·로드맵 전망: 온실가스]', e); }
    try { ROL = reOutlook(); } catch (e) { console.warn('[목표·로드맵 전망: RE100]', e); }
    $('h-rm-card').hidden = false;
    drawGhgRoadmap(set.path, set.path50, rmIds('h'), rmapYear, isCur ? ghgPred : null, OL);
    renderGhgRoadmapTable(rmapYear, isCur ? ghgPred : null);
    $('h-rerm-card').hidden = false;
    $('h-re-note').textContent = `※ ${sitesLabel(RS)} · 이행률 = 두 거점 (자가발전 + 구매) ÷ 두 거점 총 전력 · 정부 기준 이행 목표`;
    drawReRoadmap(set.re, set.re50, reIds('h'), rmapYear, RS, isCur ? rePred : null, ROL);
    renderRmOlLinks(OL, ROL);
    $('h-wrm-card').hidden = !v2;
    if (v2) renderWasteRoadmapChart(set.wrm, years, WS, isCur ? wtPred : null);
    $('rmap-wt-details').hidden = !v2;
    renderWasteRoadmapTable(WS);
    try { renderRoadmapToc(); } catch (e) { console.warn('[목표·로드맵: 바로가기]', e); }
  }
  // 목표 달성 현황: 고른 연도 카드(목표마다 대상 거점 · 합산 실적·목표 · 달성 여부 · 거점별 내역) + 연도별 달성표(✓/✗)
  //  온실가스(자체·법적) = 대구본원 · RE100 = 대구+제주 합산 · 폐기물 = 세 거점 합산 · 올해 = 연말 예측으로 '전망'
  /* 목표 묶음 (메인 화면·목표·로드맵 탭이 같이 씀)
     g = { k 이름, gn 짧은 이름, sites 대상 거점, unit, lower 낮을수록 좋음, t(y) 목표, v(y) 실적·예측 } */
  // 목표 카드 팝업의 '연말 예측은 이렇게'·'숫자 출처' (목표·로드맵 카드 · 메인이 같이 씀)
  function goalPop(g, y, isCur) {
    const RS = TARGET_SITES.re, WS = TARGET_SITES.waste;
    if (g.k === '자체 배출목표' || g.k === '법적 배출목표') {
      const own = g.k === '자체 배출목표', lr = LAW_RATE[y], orr = ownRate(y);
      return { fc: isCur ? fcGhgOf(y, TARGET_SITES.ghg) : null,
               src: srcGhg(y, { base: baseOf(y), rateK: own ? '자체 감축률·목표배출량' : '권장감축률',
                                rateV: own ? (orr != null ? `${fmt(orr, 1)}%` : null) : (lr != null ? `${fmt(lr, 1)}%` : null), est: isCur }) };
    }
    if (g.k === 'RE100 이행 목표') return { fc: isCur ? fcReOf(y, RS) : null,
      src: [{ k: '전력·자가발전·구매', ...S_IN_E }, ...(isCur ? [S_FC('')] : []),
            { k: '정부 이행 목표', v: reGoalOf(y) != null ? `${reGoalOf(y)}%` : null, kind: 'fix',
              from: `공공기관 RE100 이행 목표 (${yrShort(RE_FIRST)} ${RE_GOAL[RE_FIRST]}% → 30년 60% → 50년 100%)` }] };
    if (g.k === '폐기물 감축 목표') { const rm = v2 ? wasteRoadmap(WS) : null;
      return { fc: isCur ? fcWasteOf(y, WS) : null, src: rm ? srcWaste(rm, y, isCur) : [] }; }
    return {};
  }
  function goalSet(ghgPred, rePred, wtPred) {
    const curYr = new Date().getFullYear(), RS = TARGET_SITES.re, WS = TARGET_SITES.waste, rm = v2 ? wasteRoadmap(WS) : null;
    // 거점별 내역 (고른 연도 · 올해는 지금까지 누적)
    const reBy = y => RS.map(s => { const v = reOfYear(y, s); return `${SITE_SHORT[s]} ${v != null ? `${fmt(v, 1)}%` : '-'}`; }).join(' · ');
    const wtBy = y => WS.map(s => { const v = wasteYearTon(y, [s]); return `${SITE_SHORT[s]} ${v != null ? `${fq(v)}t` : '-'}`; }).join(' · ');
    const GOALS = [
      { k: '자체 배출목표', gn: '자체 목표', sites: TARGET_SITES.ghg, sub: '대구본원 · NIA 로드맵', unit: 't', lower: true, t: y => tgtOf(y, 'own'),
        note: 'NIA가 스스로 정한 연도별 목표예요 · 데이터 관리 → 연도 마감·로드맵에서 고쳐요',
        eq: (y, t) => { const b = baseOf(y); return b && t != null ? { parts: [{ k: `기준배출량 (${yrShort(y)})`, v: b, u: 't' },
          { k: '남길 비율', v: `${fmt(100 - ownRate(y), 1)}%`, op: '×' }], result: { k: `${yrShort(y)} 자체 목표`, v: t, u: 't' } } : null; },
        v: y => +y === curYr ? ghgPred : (+y < curYr && dgbOf(y) > 0 ? dgbOf(y) : null) },
      { k: '법적 배출목표', gn: '법적 목표', sites: TARGET_SITES.ghg, sub: '대구본원 · 기준배출량 × (1 − 권장감축률)', unit: 't', lower: true, t: y => tgtOf(y, 'law'),
        note: '기준배출량에 정부 권장감축률을 적용한 목표예요',
        eq: (y, t) => { const b = baseOf(y), lr = LAW_RATE[y]; return b && lr !== undefined && t != null ? { parts: [{ k: `기준배출량 (${yrShort(y)})`, v: b, u: 't' },
          { k: `남길 비율 (100 − ${fmt(lr, 1)}%)`, v: `${fmt(100 - lr, 1)}%`, op: '×' }], result: { k: `${yrShort(y)} 법적 목표`, v: t, u: 't' } } : null; },
        v: y => +y === curYr ? ghgPred : (+y < curYr && dgbOf(y) > 0 ? dgbOf(y) : null) },
      { k: 'RE100 이행 목표', gn: '정부 이행 목표', sites: RS, sub: `${sitesLabel(RS)} · 정부 기준 이행률`, unit: '%', lower: false, t: y => reGoalOf(y),
        note: `정부가 정한 연도별 이행률 목표예요 (${yrShort(RE_FIRST)} ${RE_GOAL[RE_FIRST]}% → 30년 60% → 50년 100%) · 이행률 = (자가발전 + 구매) ÷ 총 전력사용량 · 올해는 남은 달 전기 사용까지 더한 연말 예측으로 견줘요 (구매분은 입력된 양 그대로)`,
        v: y => +y === curYr ? rePred : (+y < curYr ? reOfYear(y, RS) : null), by: reBy,
        need: y => +y <= curYr ? reNeed(y, RS) : null },   // 모자라면 재생에너지 몇 kWh 더 필요한지
      ...(v2 ? [{ k: '폐기물 감축 목표', gn: '감축 목표', sites: WS, sub: `${sitesLabel(WS)} · 폐기물 감축 로드맵`, unit: 't', lower: true, cu: 'ton',
        note: WT_NOTE,
        eq: (y, t) => rm && t != null && rm.baseTon != null ? wEq(rm, y, t) : null,
        noneAll: rm ? '' : '감축 로드맵 미설정 · 데이터 관리에서 정해요',
        t: y => rm && y !== rm.baseYear ? rm.target(y) ?? null : null,
        v: y => +y === curYr ? wtPred : (+y < curYr ? wasteYearTon(y, WS) : null), by: wtBy }] : []),
    ];
    const num = (v, u) => u === '%' ? `${fmt(v, 1)}%` : `${fq(v)}t`;
    const judge = (g, y) => { const v = g.v(String(y)), t = g.t(String(y));
      if (t == null) return { st: 'none', t }; if (v == null) return { st: +y >= curYr ? 'fut' : 'nodata', t };
      return { st: (g.lower ? v <= t : v >= t) ? 'ok' : 'no', v, t, est: +y === curYr }; };
    // 목표가 있는 해 찾기 (빈 구간 설명용: '자체 목표는 24년부터')
    const tgtYs = g => { const out = []; for (let y = 2010; y <= 2050; y++) if (g.t(String(y)) != null) out.push(y); return out; };
    const noneMsg = (g, from, to) => { const ys = tgtYs(g), next = ys.find(y => y > +to), before = ys.some(y => y < +from);
      return !ys.length ? (g.noneAll || `${g.gn} 없음`) : next && !before ? `${g.gn}는 ${yrShort(next)}부터` : `${g.gn} 없음`; };
    return { GOALS, num, judge, tgtYs, noneMsg, rm, RS, WS, curYr };
  }

  function renderGoalStatus(selY, ghgPred, rePred, wtPred) {
    const { GOALS, num, judge, noneMsg, rm, RS, WS, curYr } = goalSet(ghgPred, rePred, wtPred);
    const isCurSel = +selY === curYr;
    // ① 고른 연도 카드 — 목표 카드: 큰 숫자 = 그 해 목표 · 회색 줄 = 연말 예측(올해)·실적(지난 연도) · 맨 아래 = 달성 여부
    const yS = yrShort(selY), isCur = +selY === curYr;
    let nOk = 0, nAll = 0;
    const GC = calcStore['g-'] = {};   // 목표 카드마다 계산 근거
    const cards = GOALS.map((g, gi) => {
      const j = judge(g, selY), v = g.v(String(selY));
      if (j.st === 'ok' || j.st === 'no') { nAll++; if (j.st === 'ok') nOk++; }
      const gap = j.v != null && j.t != null ? Math.abs(j.v - j.t) : null;
      const res = j.st === 'none' ? noneMsg(g, selY, selY) : j.st === 'nodata' || j.st === 'fut' ? (isCur ? '예측할 자료 없음' : `${yS} 실적 없음`)
        : j.st === 'ok' ? `✓ ${isCur ? '달성 전망' : '달성'} · 목표보다 ${g.lower ? '' : '+'}${num(gap, g.unit).replace('%', '%p')} ${g.lower ? '적음' : '높음'}`
        : `✗ ${isCur ? '미달 전망' : '미달'} · 목표까지 ${num(gap, g.unit).replace('%', '%p')} ${g.lower ? '더 줄여야' : '더 올려야'}` +
          (g.need && j.st === 'no' ? ((n => n > 0 ? ` (${needTxt(n)})` : '')(g.need(String(selY)))) : '');
      const scope = `<div class="gs-scope">${g.sites.map(st => `<i>${SITE_SHORT[st] || st}</i>`).join('<em>+</em>')}${g.sites.length > 1 ? '<span>합산</span>' : ''}</div>`;
      const by = g.by ? `<div class="gs-by" title="${isCurSel ? '올해 지금까지 누적' : `${yS} 실적`} · 거점별">${isCurSel ? '누적 ' : ''}${g.by(selY)}</div>` : '';
      // 계산 근거: 목표가 어떻게 나왔고 실적과 얼마나 차이 나는지
      const cid = `g${gi}`;
      const gSite = sitesLabel(g.sites);
      const pop = goalPop(g, String(selY), isCur), gU = g.cu || (g.unit === '%' ? '%' : 'tCO₂eq');
      GC[cid] = { title: g.k, sub: g.sub.replace(`${gSite} · `, ''), period: `${yS} 목표`, site: gSite, unit: gU,
        value: j.t, valueK: `${yS} ${g.gn}`, empty: noneMsg(g, selY, selY), rows: [], sites: [], months: [],
        vs: j.v == null || j.t == null ? null : { k: isCur ? `${yS} 연말 예측` : `${yS} 실적`, v: j.v, t: j.t, tk: g.gn,
          unit: gU, gu: 't', lower: g.lower, est: isCur, d: gU === '%' ? 1 : 3 },
        formula: g.eq ? g.eq(String(selY), j.t) : null,
        facts: [...(j.v == null ? [{ k: isCur ? `${yS} 연말 예측` : `${yS} 실적`, v: null }] : []),
                ...((n => n > 0 ? [{ k: '목표까지 더 필요한 재생에너지', v: Math.ceil(n), u: 'kWh' }] : [])(g.need && j.st === 'no' ? g.need(String(selY)) : 0)),
                ...(g.by ? [{ k: isCurSel ? '거점별 (지금까지)' : '거점별', v: g.by(selY) }] : [])],
        fc: pop.fc, src: pop.src,
        over: j.st === 'no' ? `${g.k} ${res.replace('✗ ', '')}` : '',
        note: g.note || '' };
      return `<div class="gs-card ${j.st === 'ok' ? 'ok' : j.st === 'no' ? 'no' : 'na'}" role="button" tabindex="0" data-calc="${cid}" data-calc-p="g-" title="누르면 계산 근거를 봐요"><div class="gs-k">${g.k}${scope}</div>` +
        `<div class="gs-v">${j.t != null ? num(j.t, g.unit) : '—'}<small>${yS} 목표${j.t == null ? ' 없음' : ''}</small></div>` +
        `<div class="gs-t">${isCur ? '연말 예측' : '실적'}${g.sites.length > 1 ? ' (합산)' : ''} ${v != null ? `<b>${num(v, g.unit)}</b>` : '—'}</div>${by}<div class="gs-r">${res}</div></div>`;
    });
    $('gs-site').textContent = `${yS}${isCur ? ' (연말 전망)' : ''}`;
    $('gs-note').textContent = `온실가스 = 대구본원 · RE100 = ${sitesLabel(RS)} · 폐기물 = ${sitesLabel(WS)}`;
    $('gs-cards').style.setProperty('--gs-n', cards.length || 1);
    $('gs-cards').innerHTML = (nAll ? `<div class="gs-sum">${yS} ${isCur ? '전망' : '결과'}: 목표 ${nAll}개 중 <b class="${nOk === nAll ? 'ok' : 'no'}">${nOk}개 ${isCur ? '달성 전망' : '달성'}</b></div>` : '') + cards.join('');
    // ② 연도별 달성표: 목표가 있는 해만 (지난 연도 ~ 2030)
    const first = Math.min(2024, ...pastYears().map(Number)), cols = [];
    for (let y = first; y <= Math.max(2030, curYr); y++) if (GOALS.some(g => g.t(String(y)) != null)) cols.push(String(y));
    const cell = (g, y) => {
      const j = judge(g, y), tip = j.t == null ? '목표 없음' : `${yrShort(y)} ${j.est ? '연말 예측' : '실적'} ${j.v != null ? num(j.v, g.unit) : '없음'} · 목표 ${num(j.t, g.unit)}`;
      const inner = j.st === 'ok' || j.st === 'no' ? `<span class="gs-pill ${j.st}${j.est ? ' est' : ''}">${j.st === 'ok' ? '✓' : '✗'}</span>`
        : j.st === 'fut' ? `<span class="gs-fut">${num(j.t, g.unit)}</span>` : '<span class="cmp-na">—</span>';
      return `<td class="${y === selY ? 'gs-sel' : ''}" title="${esc(tip)}">${inner}</td>`;
    };
    // 한 줄: 목표 없음(none)·실적 없음(nodata)이 이어지는 해는 한 칸으로 묶어 점선 + 설명 (고른 연도 열은 떼어 열 강조 유지 · 설명은 가장 긴 조각에)
    const rowCells = g => {
      const st = cols.map(y => { const s2 = judge(g, y).st; return s2 === 'none' || s2 === 'nodata' ? s2 : ''; }), out = [];
      for (let i = 0; i < cols.length;) {
        if (!st[i]) { out.push(cell(g, cols[i])); i++; continue; }
        let k = i; while (k + 1 < cols.length && st[k + 1] === st[i]) k++;
        const pieces = []; let a = i;
        for (let m = i; m <= k; m++) if (cols[m] === selY) { if (m > a) pieces.push([a, m - 1]); pieces.push([m, m]); a = m + 1; }
        if (a <= k) pieces.push([a, k]);
        const big = pieces.reduce((b, p) => p[1] - p[0] > b[1] - b[0] ? p : b, pieces[0]);
        const label = st[i] === 'nodata' ? '실적 없음' : noneMsg(g, cols[i], cols[k]);
        pieces.forEach(p => { const n = p[1] - p[0] + 1, range = `${yrShort(cols[p[0]])}${n > 1 ? `~${yrShort(cols[p[1]])}` : ''}`;
          out.push(`<td${n > 1 ? ` colspan="${n}"` : ''} class="gs-gap${cols[p[0]] === selY && n === 1 ? ' gs-sel' : ''}" title="${esc(`${range} ${label}`)}">` +
                   `${p === big && n >= 2 ? `<span>${label}</span>` : ''}</td>`); });
        i = k + 1;
      }
      return out.join('');
    };
    const rate = g => { const js = cols.filter(y => +y < curYr).map(y => judge(g, y)).filter(j => j.st === 'ok' || j.st === 'no');
      return js.length ? `<span class="gs-rate">${js.filter(j => j.st === 'ok').length}/${js.length}</span>` : '<span class="cmp-na">—</span>'; };
    // 접었을 때 한 줄 요약: 지난 연도 달성 (목표마다) · 올해 전망
    const done = g => cols.filter(y => +y < curYr).map(y => judge(g, y)).filter(j => j.st === 'ok' || j.st === 'no');
    const short = g => g.k.split(' ')[0];
    const past = GOALS.map(g => ({ g, js: done(g) })).filter(o => o.js.length);
    const now = GOALS.map(g => judge(g, String(curYr))).filter(j => j.st === 'ok' || j.st === 'no');
    $('gs-range').textContent = cols.length ? `${cols[0].slice(2)}~${yrShort(cols[cols.length - 1])}` : '';   // 16~30년
    $('gs-peek').innerHTML = [past.length ? `지난 연도 달성 ${past.map(o => `${esc(short(o.g))} <b>${o.js.filter(j => j.st === 'ok').length}/${o.js.length}</b>`).join(' · ')}` : '',
      now.length ? `${yrShort(curYr)} 전망 <span class="good">✓${now.filter(j => j.st === 'ok').length}</span>${now.some(j => j.st === 'no') ? ` <span class="bad">✗${now.filter(j => j.st === 'no').length}</span>` : ''}` : '']
      .filter(Boolean).join(' · ');
    $('gs-tbl').innerHTML = !cols.length ? '<tbody><tr><td class="table-empty">목표가 정해진 연도가 없어요</td></tr></tbody>' :
      `<thead><tr><th>목표</th>${cols.map(y => `<th class="${y === selY ? 'gs-sel' : ''}">${yrShort(y)}${+y === curYr ? '<div class="cmp-th-sub">올해</div>' : ''}</th>`).join('')}<th>지난 연도<div class="cmp-th-sub">달성</div></th></tr></thead><tbody>` +
      GOALS.map(g => `<tr><td>${g.k}<small>${g.sub}</small></td>${rowCells(g)}<td>${rate(g)}</td></tr>`).join('') + '</tbody>';
  }
  $('rmap-year').addEventListener('change', e => { rmapYear = e.target.value; renderRoadmapTab(); });
  $('rmap-prev').addEventListener('click', () => { const o = [...$('rmap-year').options].map(x => x.value), i = o.indexOf(rmapYear); if (i < o.length - 1) { rmapYear = o[i + 1]; renderRoadmapTab(); } });
  $('rmap-next').addEventListener('click', () => { const o = [...$('rmap-year').options].map(x => x.value), i = o.indexOf(rmapYear); if (i > 0) { rmapYear = o[i - 1]; renderRoadmapTab(); } });

  // 추이 미니 선 (SVG): 값이 있는 해만 잇고, 강조할 해(fi)에 점 — 연도별 핵심 지표 표
  function sparkSvg(vals, fi) {
    const W = 84, H = 22, pts = vals.map((v, i) => v == null ? null : [i, v]).filter(Boolean);
    if (!pts.length) return '';
    const vs = pts.map(q => q[1]), lo = Math.min(...vs), hi = Math.max(...vs), n = Math.max(vals.length - 1, 1);
    const x = i => (3 + i / n * (W - 6)).toFixed(1), y = v => (hi === lo ? H / 2 : H - 3 - (v - lo) / (hi - lo) * (H - 6)).toFixed(1);
    return `<svg class="spark" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" aria-hidden="true">` +
      (pts.length > 1 ? `<polyline class="sp-line" points="${pts.map(([i, v]) => `${x(i)},${y(v)}`).join(' ')}"/>` : '') +
      (vals[fi] != null ? `<circle class="sp-dot" cx="${x(fi)}" cy="${y(vals[fi])}" r="2.6"/>` : '') + '</svg>';
  }

  // 바로가기 칩에 넣을 구역인가 — 화면에 보이는 구역만
  const tocVis = id => { const el = $(id); return el && !el.hidden && el.style.display !== 'none' && !el.closest('[hidden]'); };
  // 바로가기 칩: 지금 보기의 구역 (숨은 구역은 뺌) · 누르면 그 구역으로 · 스크롤하면 지금 구역 표시
  const H_TOC = {
    cmp:  [['h-sec-sum', '핵심 성과'], ['h-sec-why', '증감 요인'], ['h-sec-trend', '지표 추이'], ['h-sec-mon', '월별 패턴'], ['h-sec-mix', '배출 구성'], ['h-sec-tbl', '표']],
    year: [['y-sec-ghg', '온실가스'], ['y-sec-target', '목표'], ['y-sec-usage', '사용량'], ['y-sec-charts', '월별 그래프'], ['h-year-details', '거점별 표']],
  };
  function renderHistToc() {
    $('h-toc').innerHTML = H_TOC[histView].filter(([id]) => $(id) && !$(id).hidden)
      .map(([id, t]) => `<a href="#${id}" data-to="${id}">${t}</a>`).join('');
    histTocSpy();
  }
  // 붙는 탭 줄·실적 조회 막대의 높이 → CSS 변수: --nav-h = 막대가 붙을 위치 · --h-stick = 구역으로 이동할 때 가리지 않을 여백
  //  (휴대폰에서는 막대가 붙지 않으므로 탭 줄 높이만)
  function syncStick() {
    const nav = document.querySelector('.tab-nav')?.offsetHeight || 49, bar = $('h-bar');
    const sticky = getComputedStyle(bar).position === 'sticky', st = document.documentElement.style;
    st.setProperty('--nav-h', `${nav}px`);
    st.setProperty('--h-stick', `${nav + (sticky ? bar.offsetHeight : 0) + 8}px`);
  }
  const stickPx = () => parseFloat(document.documentElement.style.getPropertyValue('--h-stick')) || 150;
  // 올해 현황 바로가기: 보이는 구역만 · 누르면 접힌 구역을 펼치고 이동 · 스크롤하면 지금 구역 표시
  const D_TOC = [['sec-ghg', '온실가스'], ['sec-target', '목표'], ['sec-env', '자원·기타'], ['sec-usage', '사용량'], ['site-breakdown', '거점별'], ['sec-charts', '월별 그래프'], ['sec-basis', '예측 근거']];
  function renderDashToc() {
    $('d-toc').innerHTML = D_TOC.filter(([id]) => tocVis(id)).map(([id, t]) => `<a href="#${id}" data-to="${id}">${t}</a>`).join('');
    const nav = document.querySelector('.tab-nav')?.offsetHeight || 49, bar = $('d-bar');
    const sticky = getComputedStyle(bar).position === 'sticky';   // 휴대폰에서는 붙지 않음
    document.documentElement.style.setProperty('--d-stick', `${nav + (sticky ? bar.offsetHeight : 0) + 8}px`);
    dashTocSpy();
  }
  function dashTocSpy() {
    const links = [...$('d-toc').querySelectorAll('a[data-to]')];
    if (!links.length || !$('tab-dashboard').classList.contains('active')) return;
    const line = (parseFloat(document.documentElement.style.getPropertyValue('--d-stick')) || 110) + 8;
    let cur = links[0];
    links.forEach(a => { if ($(a.dataset.to).getBoundingClientRect().top <= line) cur = a; });
    links.forEach(a => a.classList.toggle('on', a === cur));
  }
  $('d-toc').addEventListener('click', e => {
    const a = e.target.closest('a[data-to]'), el = a && $(a.dataset.to);
    if (!el) return;
    e.preventDefault();
    if (el.tagName === 'DETAILS') el.open = true;
    el.closest('details')?.setAttribute('open', '');   // 거점별 표는 '사용량' 구역 안에 있음
    el.scrollIntoView({ behavior: reduceMotion() ? 'auto' : 'smooth', block: 'start' });
  });
  // 목표·로드맵 바로가기: 구역 칩 · 누르면 접힌 구역을 펼치고 이동 · 스크롤하면 지금 구역 표시
  const R_TOC = [['rmap-status-sec', '달성 현황'], ['h-rm-card', '온실가스'], ['h-rerm-card', 'RE100'], ['h-wrm-card', '폐기물'], ['rmap-ghg-details', '표']];
  function renderRoadmapToc() {
    $('r-toc').innerHTML = R_TOC.filter(([id]) => tocVis(id)).map(([id, t]) => `<a href="#${id}" data-to="${id}">${t}</a>`).join('');
    document.documentElement.style.setProperty('--r-stick', `${(document.querySelector('.tab-nav')?.offsetHeight || 49) + 8}px`);
    roadmapTocSpy();
  }
  function roadmapTocSpy() {
    const links = [...$('r-toc').querySelectorAll('a[data-to]')];
    if (!links.length || !$('tab-roadmap').classList.contains('active')) return;
    const line = (parseFloat(document.documentElement.style.getPropertyValue('--r-stick')) || 57) + 8;
    let cur = links[0];
    links.forEach(a => { if ($(a.dataset.to).getBoundingClientRect().top <= line) cur = a; });
    links.forEach(a => a.classList.toggle('on', a === cur));
  }
  $('r-toc').addEventListener('click', e => {
    const a = e.target.closest('a[data-to]'), el = a && $(a.dataset.to);
    if (!el) return;
    e.preventDefault();
    if (el.tagName === 'DETAILS') el.open = true;
    el.scrollIntoView({ behavior: reduceMotion() ? 'auto' : 'smooth', block: 'start' });
  });

  // 전망 바로가기: 구역 칩 · 누르면 접힌 구역을 펼치고 이동 · 스크롤하면 지금 구역 표시
  const O_TOC = [['o-sum-sec', '한눈에 보기'], ['o-wi-sec', '만약에 계산'], ['o-ghg-sec', '온실가스'], ['o-re-sec', 'RE100'], ['o-ev-sec', '경영평가 점수'], ['o-how-sec', '계산 방법']];
  function renderOutlookToc() {
    $('o-toc').innerHTML = O_TOC.filter(([id]) => tocVis(id)).map(([id, t]) => `<a href="#${id}" data-to="${id}">${t}</a>`).join('');
    const nav = document.querySelector('.tab-nav')?.offsetHeight || 49, bar = $('o-bar');
    const sticky = getComputedStyle(bar).position === 'sticky';   // 휴대폰에서는 붙지 않음
    document.documentElement.style.setProperty('--o-stick', `${nav + (sticky ? bar.offsetHeight : 0) + 8}px`);
    outlookTocSpy();
  }
  function outlookTocSpy() {
    const links = [...$('o-toc').querySelectorAll('a[data-to]')];
    if (!links.length || !$('tab-outlook').classList.contains('active')) return;
    const line = (parseFloat(document.documentElement.style.getPropertyValue('--o-stick')) || 110) + 8;
    let cur = links[0];
    links.forEach(a => { if ($(a.dataset.to).getBoundingClientRect().top <= line) cur = a; });
    links.forEach(a => a.classList.toggle('on', a === cur));
  }
  $('o-toc').addEventListener('click', e => {
    const a = e.target.closest('a[data-to]'), el = a && $(a.dataset.to);
    if (!el) return;
    e.preventDefault();
    if (el.tagName === 'DETAILS') el.open = true;
    el.scrollIntoView({ behavior: reduceMotion() ? 'auto' : 'smooth', block: 'start' });
  });
  function histTocSpy() {
    const links = [...$('h-toc').querySelectorAll('a[data-to]')];
    if (!links.length || !$('tab-history').classList.contains('active')) return;
    const line = stickPx() + 8;
    let cur = links[0];
    links.forEach(a => { if ($(a.dataset.to).getBoundingClientRect().top <= line) cur = a; });
    links.forEach(a => a.classList.toggle('on', a === cur));
  }

  // 연도별 비교: 핵심 성과 → 증감 요인 → 에너지·자원 지표 추이 → 월별 패턴 → 배출 구성 → 표
  //  고른 연도(fy)를 그 전년(py)과 비교하고, 연도별 그래프에서는 고른 연도를 강조
  /* 연도별 비교 카드의 계산 근거 (calcStore['c-']) — 고른 해·거점 기준
     올해 현황과 같은 열쇠말을 써서 카드에 data-calc만 붙이면 됨 (경고는 카드가 전년 대비로 이미 보여 줌) */
  function buildCmpCalcs(fy, si, T) {
    const yr = String(fy), yS = yrShort(yr), sites = si ? [si] : SITES;
    const ey = energyRecs.filter(r => r.date?.startsWith(yr) && sites.includes(r.site));
    const wy = wasteRecs.filter(r => r.date?.startsWith(yr) && sites.includes(r.site));
    const { typeRows, siteRows, monthRows } = calcRows(ey, si);
    const C = calcStore['c-'] = {};
    const base = { period: `${yS} 연간`, site: si || '세 거점 합계', unit: 'tCO₂eq', rows: [], sites: [], months: [] };
    const put = (id, o) => { C[id] = { ...base, ...o }; };
    const isScope = sc => r => isEmit(r.type) && scopeOf(r.type) === sc;
    const EF_NOTE = '배출량 = 사용량 × 배출계수 · 지난 연도까지 지금 계수로 다시 계산해 같은 기준으로 비교해요';
    const sum = f => { const rs = ey.filter(f); return rs.length ? sumBy(rs, r => r.ghg) : null; };
    put('k-total', { title: '총 온실가스', sub: 'Scope 1 + Scope 2', value: sum(r => isEmit(r.type)),
      rows: typeRows(EMIT_TYPES), sites: siteRows(r => isEmit(r.type)), months: monthRows(r => isEmit(r.type)), note: EF_NOTE });
    put('k-s1', { title: 'Scope 1 직접 배출', sub: '우리가 직접 태운 연료', value: sum(isScope('Scope 1')),
      rows: typeRows(EMIT_TYPES.filter(t => scopeOf(t) === 'Scope 1')), sites: siteRows(isScope('Scope 1')), months: monthRows(isScope('Scope 1')), note: EF_NOTE });
    put('k-s2', { title: 'Scope 2 간접 배출', sub: '사서 쓴 전기·열', value: sum(isScope('Scope 2')),
      rows: typeRows(EMIT_TYPES.filter(t => scopeOf(t) === 'Scope 2')), sites: siteRows(isScope('Scope 2')), months: monthRows(isScope('Scope 2')), note: EF_NOTE });
    // 에너지원별 카드 (큰 숫자는 사용량이지만 팝업은 배출량까지 같이 보여 줌)
    [['k-elec-co2', '전력'], ['k-gas-co2', '도시가스'], ['k-heat-co2', '지역난방'], ['k-gasoline-co2', '휘발유'], ['k-diesel-co2', '경유']].forEach(([id, t]) => {
      const rs = ey.filter(r => r.type === t), isT = r => r.type === t;
      put(id, { title: t, sub: GHG[t].scope, value: rs.length ? sumBy(rs, r => r.ghg) : null,
        empty: itemNA(si, t) ? '이 거점은 해당 없는 항목이에요' : `${yS} 자료가 없어요`,
        rows: typeRows([t]), sites: siteRows(isT), months: monthRows(isT),
        amt: rs.length ? { v: sumBy(rs, r => r.amount), u: GHG[t].unit } : null, note: EF_NOTE });
    });
    // 늘면 좋은 항목 (배출량이 아니라 발전량·절감량)
    [['k-re-kwh', RE_SELF, '재생에너지 자가발전', '태양광 등 · RE100 이행률에 반영'],
     ['k-re-buy', RE_BUY, '재생에너지 구매', '녹색프리미엄·REC·PPA'],
     ['k-regen', SAVE_REGEN, '승강기 회생제동 발전량', '내려가는 승강기가 만든 전기']].forEach(([id, t, title, sub]) => {
      const v = sumBy(ey.filter(r => r.type === t), r => r.amount), isT = r => r.type === t;
      put(id, { title, sub, value: v > 0 ? v : null, unit: 'kWh', empty: `${yS} 자료가 없어요`,
        sites: siteRows(isT, r => r.amount), months: monthRows(isT, r => r.amount),
        note: t === RE_BUY ? 'RE100 이행률에만 반영하고 온실가스 배출량에는 반영하지 않아요'
          : `그만큼 한전 전기를 덜 써서 회피 배출량 ${fq(calcGHG('전력', v))} tCO₂eq (참고값 · 배출량에서 빼지는 않아요)` });
    });
    // 폐기물 발생량 (ton)
    const wTon = wy.length ? sumBy(wy, r => r.weightTon) : null, wVol = sumBy(wy, r => (+r.bagSize || 0) * (+r.qty || 0));
    put('k-waste-ton', { title: '폐기물 발생량', sub: 'Scope 3 · 종량제 봉투 기준', value: wTon, unit: 'ton', empty: `${yS} 폐기물 자료가 없어요`,
      amt: wy.length ? { v: wVol, u: 'L' } : null,
      sites: siteRows(() => true, r => r.weightTon, wy), months: monthRows(() => true, r => r.weightTon, wy),
      facts: wy.length ? [{ k: '배출량 환산', v: `${fq(sumBy(wy, r => r.ghg || 0))} tCO₂eq` }] : [],
      note: `발생량 = 봉투 용량(L) × 매수 × 0.174 kg/L · 배출량 = 발생량(ton) × ${WASTE_EF_TXT}` });
    // 용수
    const mw = metricRecs.filter(r => r.item === WATER && r.period.startsWith(yr + '-') && sites.includes(r.site));
    const byKey = (rs, keyOf) => { const by = {}; rs.forEach(r => { const k = keyOf(r); by[k] = (by[k] || 0) + (+r.value || 0); }); return by; };
    const wSite = byKey(mw, r => r.site), wMon = byKey(mw, r => +r.period.slice(5));
    put('k-water', { title: icn('drop') + ' 용수 사용량', sub: '상수도', value: mw.length ? sumBy(mw, r => r.value) : null, unit: '㎥',
      empty: allNA(si, WATER) ? '이 거점은 해당 없는 항목이에요' : `${yS} 용수 자료가 없어요`,
      sites: si ? [] : Object.keys(wSite).map(k => ({ k, ghg: wSite[k], col: SITE_COL[k] })),
      months: Object.keys(wMon).map(Number).sort((a, b) => a - b).map(m => ({ m, v: wMon[m] })),
      note: '달마다 입력한 상수도 사용량을 더한 값이에요' });
    // 친환경차 전환율 · RE100 이행률 · 기준배출량 대비 감축률 (비율은 식으로)
    const ev = evStat(yr, sites);
    put('k-ev', { title: icn('battery') + ' 친환경차 전환율', sub: '업무용 차량 중 친환경차 비율', value: ev?.rate ?? null, unit: '%',
      period: `${yS} 연말 기준`, empty: allNA(si, EV_ALL) ? '이 거점은 해당 없는 항목이에요' : `${yS} 차량 자료가 없어요`,
      formula: ev && ev.rate != null ? { parts: [{ k: '친환경차', v: ev.green, u: '대' }, { k: '업무용 차량', v: ev.all, u: '대', op: '÷' }],
        result: { k: '전환율', v: ev.rate, u: '%' } } : null,
      facts: ev && ev.rate != null ? [{ k: '아직 전환하지 않은 차', v: ev.all - ev.green, u: '대' }] : [],
      note: '전기·수소차를 친환경차로 봐요 · 연말 보유 대수 기준' });
    const reSt = si ? null : yearStat(yr, TARGET_SITES.re);
    const rElec = (reSt ? reSt.elec : sumBy(ey.filter(r => r.type === '전력'), r => r.amount)) || 0;
    const rSelf = (reSt ? reSt.reSelf : sumBy(ey.filter(r => r.type === RE_SELF), r => r.amount)) || 0;
    const rBuy = (reSt ? reSt.reBuy : sumBy(ey.filter(r => r.type === RE_BUY), r => r.amount)) || 0;
    const cons = rElec + rSelf, reAll = rSelf + rBuy, reGoal = reGoalOf(yr), re100 = cons > 0 && reAll > 0 ? reAll / cons * 100 : null;
    put('k-re-pct', { title: 'RE100 이행률', sub: '재생에너지로 쓴 전기의 비율', site: si || sitesLabel(TARGET_SITES.re),
      value: re100, unit: '%', empty: `${yS} 재생에너지 자료가 없어요`,
      formula: re100 == null ? null : { parts: [{ group: [{ k: '자가발전', v: rSelf, u: 'kWh' }, { k: '구매 (녹색프리미엄 등)', v: rBuy, u: 'kWh', op: '+' }] },
          { k: '총 전력사용량 (한전 + 자가발전)', v: cons, u: 'kWh', op: '÷' }], result: { k: `${yS} 이행률`, v: re100, u: '%' } },
      vs: re100 != null && reGoal != null ? { k: `${yS} 실적`, v: re100, t: reGoal, tk: '정부 목표', unit: '%', d: 1 } : null,
      facts: reGoal == null ? [{ k: `${yS} 정부 목표`, v: null }] : [],
      src: [{ k: '전력·자가발전·구매', ...S_IN_E },
            { k: '정부 이행 목표', v: reGoal != null ? `${reGoal}%` : null, kind: 'fix', from: `공공기관 RE100 이행 목표 (${yrShort(RE_FIRST)} ${RE_GOAL[RE_FIRST]}% → 30년 60% → 50년 100%)` }],
      note: '자가발전은 쓴 전기이자 만든 전기라 분모·분자에 모두 들어가요' });
    if (T.ghg) {
      const dgb = dgbOf(yr), b = baseOf(yr), cut = dgb > 0 && b ? (b - dgb) / b * 100 : null;
      put('k-cut', { title: '기준배출량 대비 감축률', sub: '기준배출량보다 얼마나 적게 배출했는지', site: ORG_SITE, value: cut, unit: '%',
        empty: `${yS} 대구본원 배출량 또는 기준배출량이 없어요`,
        formula: cut == null ? null : { parts: [{ group: [{ k: `기준배출량 (${yS})`, v: b, u: 't' }, { k: `${yS} 실적`, v: dgb, u: 't', op: '−' }] },
            { k: `기준배출량 (${yS})`, v: b, u: 't', op: '÷' }], result: { k: '감축률', v: cut, u: '%' } },
        vs: cut != null && ownRate(yr) != null ? { k: `${yS} 감축률`, v: cut, t: ownRate(yr), tk: '자체 목표', unit: '%', d: 1 } : null,
        facts: [{ k: '줄인 양', v: cut == null ? null : b - dgb, u: 'tCO₂eq' }],
        src: srcGhg(yr, { base: b, rateK: '자체 감축률·목표배출량', rateV: ownRate(yr) != null ? `${fmt(ownRate(yr), 1)}%` : null, est: false }),
        note: '기준배출량보다 얼마나 적게 배출했는지예요 · 높을수록 좋아요' });
    }
  }

  function renderCompareView(years, S, si) {
    // 전체 합계도 목표를 보여 줌 — 목표마다 대상 거점으로 집계 (올해 현황과 같은 규칙)
    const T = si ? targetsFor(si) : { ghg: true, re: true, wt: v2 }, set = CHARTS.h || {}, fy = histYear;
    const py = years.includes(String(+fy - 1)) ? String(+fy - 1) : null;
    buildCmpCalcs(fy, si, T);
    renderSummary(years, S, si, T, fy, py);
    renderCopyText(S, si, T, fy, py);   // 보고서 문구 (복사용)
    renderDrivers(si, fy, py, S);
    renderTrendTiles(years, S, si, fy, py);
    renderHistCompareTable(years, S, si, T, fy);
    renderMonthly(set.energy, years, si, fy);
    renderMixCharts(set, years, S, si, fy, py);
    renderWasteMatrix(years);
  }

  // 연도별 미니 막대 (HTML) — items = [{ y, v, t }] (t = 그 해 목표, 없으면 null) · 고른 연도는 진하게 · 목표는 주황 가로선
  //  막대에 마우스를 올리면 값 (화면 낭독기는 aria-label로 전체 값)
  function yearBars(items, fy, c) {
    if (!items.some(i => i.v != null)) return '';
    const max = Math.max(...items.map(i => Math.max(i.v ?? 0, i.t ?? 0))) || 1;
    const h = v => `${(Math.max(0, v) / max * 100).toFixed(1)}%`;
    const val = v => c.pct ? `${fmt(v, 1)}%` : `${fq(v)} ${c.unit}`;
    const lbl = String(c.label).replace(/^[^\p{L}\p{N}]+/u, '');   // 앞의 그림 글자 빼고
    return `<div class="yb" role="img" aria-label="${esc(lbl)} 연도별 — ${esc(items.map(it => `${yrShort(it.y)} ${it.v == null ? '-' : val(it.v)}`).join(', '))}">` +
      items.map(it => {
        const tip = `${yrShort(it.y)} ${it.v == null ? '-' : val(it.v)}` + (it.t != null ? ` · ${c.goalName || '목표'} ${val(it.t)}` : '');
        return `<div class="yb-c${it.y === fy ? ' on' : ''}" title="${esc(tip)}"><div class="yb-p">` +
          (it.v == null ? '<span class="yb-na">—</span>' : `<i class="yb-b" style="height:${h(it.v)}"></i>`) +
          (it.t != null ? `<i class="yb-t" style="bottom:${h(it.t)}"></i>` : '') +
          `</div><span class="yb-y">${yrShort(it.y)}</span></div>`;
      }).join('') + '</div>';
  }
  // 월별 미니 막대 (HTML) — 온실가스 카드 아래 · items = [{ m, a(실적), p(예측: 아직 입력 안 된 칸), q(전년 같은 달) }]
  //  실적 = 진한 막대 · 예측 = 옅은 막대(실적 위에 쌓음) · 전년 = 회색 눈금 · 막대에 마우스를 올리면 값
  function monthBars(items, o = {}) {
    if (!items.some(i => i.a != null || i.p != null)) return '';
    const u = o.unit || 't', A = o.act || '실적', max = Math.max(...items.map(i => Math.max((i.a || 0) + (i.p || 0), i.q || 0))) || 1;
    const h = v => `${(Math.max(0, v) / max * 100).toFixed(1)}%`, v3 = v => `${fq(v)}${u}`;
    const tip = it => `${it.m}월 · ` + (it.a == null && it.p == null ? '자료 없음' : it.a == null ? `예측 ${v3(it.p)}`
      : `${A} ${v3(it.a)}${it.p ? ` + 예측 ${v3(it.p)}` : ''}`) + (it.q != null ? ` · ${o.pS || '전년'} ${v3(it.q)}` : '');
    return `<div class="mb" role="img" aria-label="${esc(`${o.name || ''} 월별 (${u}) — ${items.map(tip).join(', ')}`)}">` +
      items.map(it => `<div class="mb-c" title="${esc(tip(it))}">` +
        (it.p ? `<i class="mb-p" style="height:${h(it.p)}"></i>` : '') + (it.a != null ? `<i class="mb-a" style="height:${h(it.a)}"></i>` : '') +
        (it.q != null ? `<i class="mb-q" style="bottom:${h(it.q)}"></i>` : '') + '</div>').join('') +
      `</div><div class="mb-x" aria-hidden="true"><span>1월</span>${o.note ? `<span class="mb-n">${esc(o.note)}</span>` : ''}<span>12월</span></div>`;
  }
  // 카드 줄 수를 맞춤: 한 줄 최대 max개 · 마지막 줄이 혼자 남지 않게 고르게 (예: 6개 → 3+3, 5개 → 3+2)
  const colsFor = (n, max, min = 2) => Math.max(min, Math.ceil((n || 1) / Math.ceil((n || 1) / max)));
  // 성과 카드: 고른 연도 값 · 전년 대비(▲▼% · 차이 · 전년 값) · 목표 상태 칩 · 연도별 미니 막대
  //  c = { label, sub, unit, pct(퍼센트 지표), up(늘면 좋음), v(y), co2(y), goal(y), goalName, chips(y, v) }
  function sumCard(c, ys, fy, py, mini = false) {
    const v = c.v(fy), p = py ? c.v(py) : null, g = c.goal ? c.goal(fy) : null;
    let delta;
    if (v != null && p != null) {
      const d = c.pct ? v - p : p !== 0 ? (v - p) / Math.abs(p) * 100 : null, flat = d == null || Math.abs(d) < 0.05;
      const tone = flat ? 'flat' : (c.up ? d > 0 : d < 0) ? 'good' : 'bad';
      delta = (d == null ? '' : `<span class="dpill ${tone}">${flat ? '→ ' : d > 0 ? '▲' : '▼'}${fmt(Math.abs(d), 1)}${c.pct ? '%p' : '%'}</span>`) +
        (c.pct ? '' : `<span class="dabs">${v - p >= 0 ? '+' : '△'}${fq(Math.abs(v - p))}</span>`) +
        `<span class="dprev">${yrShort(py)} ${c.pct ? `${fmt(p, 1)}%` : fq(p)}</span>`;
    } else if (v == null) delta = '<span class="dprev">-</span>';
    else if (py) delta = `<span class="dprev">${yrShort(py)} 자료 없음</span>`;
    else delta = '';   // 비교할 전년이 아예 없는 해 — 되풀이하지 않고 구역 머리에 한 줄로
    let chips = c.chips ? c.chips(fy, v) : '';
    if (!c.chips && c.goal && v != null) {
      if (g == null) chips = c.noGoal ? `<span class="schip">${c.noGoal}</span>` : '';
      else { const ok = c.up ? v >= g : v <= g;
             const gt = c.pct ? `${fmt(g, 1)}%` : `${fq(g)}${c.unitShort ?? ''}`;
             chips = `<span class="schip ${ok ? 'ok' : 'no'}" title="${esc(`${c.goalName} ${gt} · ${ok ? '달성' : '미달'}`)}">${ok ? '✓' : '✗'} ${c.goalName} ${gt}</span>`; }
    }
    const co2 = c.co2 ? c.co2(fy) : null;
    const items = ys.map(y => ({ y, v: c.v(y), t: c.goal ? c.goal(y) : null }));
    // 카드를 누르면 '이 숫자가 어떻게 나왔는지' 팝업 (오른쪽 아래 🔎는 올해 현황 카드와 같은 표시)
    const attrs = (c.calc ? ` role="button" tabindex="0" data-calc="${esc(c.calc)}" data-calc-p="c-" title="누르면 계산 근거를 봐요"` : '')
      + (c.vk ? ` data-vk="${c.vk}"` : '');
    return `<div class="sum-card${mini ? ' mini' : ''}${c.calc ? ' sum-click' : ''}"${attrs}>` +
      `<div class="sum-hd"><span class="sum-lbl">${c.ic ? icn(c.ic) + ' ' : ''}${c.label}${c.sub ? `<small>${c.sub}</small>` : ''}</span><span class="sum-unit">${c.unit}</span></div>` +
      `<div class="sum-v">${v == null ? '—' : c.pct ? fmt(v, 1) : fq(v)}</div>` +
      (co2 != null ? `<div class="sum-co2">${c.avoid ? '회피 ' : ''}${fq(co2)} tCO₂eq${c.avoid ? ' (참고)' : ''}` +
        (c.share != null ? `<span class="sh-bar" role="img" aria-label="${esc(`배출 비중 ${fmt(c.share, 1)}%`)}" title="${esc(`${String(c.label).replace(/^[^\p{L}\p{N}]+/u, '')} — 그 해 온실가스 배출의 ${fmt(c.share, 1)}%`)}"><i style="width:${c.share.toFixed(1)}%"></i></span><span class="sh-t">${fmt(c.share, 0)}%</span>` : '') +
        '</div>' : '') +
      `<div class="sum-d">${delta}</div>` + (chips ? `<div class="schips">${chips}</div>` : '') + yearBars(items, fy, c) + '</div>';
  }

  // ① 핵심 성과: 총배출·Scope 1·2 + 목표 지표(감축률·RE100·폐기물) — 값, 전년 대비, 목표 상태, 연도별 막대(주황 선 = 그 해 목표)
  function renderSummary(years, S, si, T, fy, py) {
    const ys = years.filter(y => +y <= +fy).slice(-6), rm = T.wt ? wasteRoadmap(si) : null;
    const cut = y => { const d = dgbOf(y), b = baseOf(y); return d > 0 && b ? (b - d) / b * 100 : null; };   // 그 해 기준배출량 대비
    //  자체·법적 배출목표는 대구본원만 적용 — 카드 값이 세 거점 합(전체 합계)이어도 비교는 늘 대구본원 배출로
    const ghgOwn = y => ghgOfStat(S.ghg[y]);
    const ghgChips = y => {
      const v = T.ghg ? ghgOwn(y) : null;
      if (v == null) return '';
      const at = si ? '' : ' (대구본원)';
      return [['자체 목표', tgtOf(y, 'own')], ['법적 목표', tgtOf(y, 'law')]].filter(([, t]) => t != null)
        .map(([nm, t]) => `<span class="schip ${v <= t ? 'ok' : 'no'}" title="${esc(`${nm} ${fq(t)} tCO₂eq 대비 ${fmt(v / t * 100, 1)}% (${v <= t ? '달성' : '미달'})${si ? '' : ' · 온실가스 목표는 대구본원만 적용해요'}`)}">${v <= t ? '✓' : '✗'} ${nm} ${fmt(v / t * 100, 1)}%${at}</span>`).join('');
    };
    const CARDS = [
      { label: '총 온실가스', sub: si ? 'Scope 1+2' : 'Scope 1+2 · 세 거점 합', unit: 'tCO₂eq', calc: 'k-total', vk: 'ghg', v: y => ghgOfStat(S[y]),
        goal: T.ghg && si ? y => tgtOf(y, 'own') : null, goalName: '자체 목표', chips: ghgChips },
      { label: 'Scope 1', sub: '도시가스·차량연료 (직접)', unit: 'tCO₂eq', calc: 'k-s1', v: y => S[y].months ? S[y].s1 : null },
      { label: 'Scope 2', sub: '전력·지역난방 (간접)', unit: 'tCO₂eq', calc: 'k-s2', v: y => S[y].months ? S[y].s2 : null },
      T.ghg && { label: '기준배출량 대비 감축률', sub: '대구본원 · 그 해 기준배출량 대비', unit: '%', pct: true, up: true, calc: 'k-cut', v: cut, goal: y => ownRate(y), goalName: '자체 목표' },
      T.re && { label: 'RE100 이행률', sub: si ? '(자가발전 + 구매) ÷ 총 전력' : '대구+제주 합산', unit: '%', pct: true, up: true, calc: 'k-re-pct', vk: 're',
                v: y => re100Of(S.re[y]), goal: y => reGoalOf(y), goalName: '정부 목표',
                noGoal: `정부 목표는 ${yrShort(RE_FIRST)}(${RE_GOAL[RE_FIRST]}%)부터` },
      { label: '폐기물 발생량', sub: `Scope 3 · 종량제 봉투 기준`, unit: 'ton', calc: 'k-waste-ton', vk: 'wt', v: y => S[y].wTon, goal: rm ? y => (y === rm.baseYear ? null : rm.target(y)) : null, goalName: '감축 목표', unitShort: 't',
        noGoal: rm && fy === rm.baseYear ? '감축 기준연도' : '' },
    ].filter(Boolean);
    const SHOW = CARDS.filter(c => ys.some(y => c.v(y) != null)), NONE = CARDS.filter(c => !SHOW.includes(c));
    $('h-sum').innerHTML = SHOW.map(c => sumCard(c, ys, fy, py)).join('');
    $('h-sum').style.setProperty('--cols', colsFor(SHOW.length, 4));
    // 자료가 없어 뺀 지표는 빈 칸 대신 한 줄로 (거점마다 칸 수가 들쭉날쭉해 보이지 않게)
    // 거점 설명의 '적용 목표' 칩 → 그 해 판정 칩 (✓ 달성 / ✗ 미달) — 올해 현황과 같은 모양
    const vd = {};
    const mark = (k, v, g, lower) => { if (v == null || g == null) return;
      const ok = lower ? v <= g : v >= g, gap = Math.abs(v - g);
      vd[k] = ok ? { st: 'ok', txt: `✓ 달성` } : { st: 'no', txt: `✗ ${k === 're' ? `${fmt(gap, 1)}%p 부족` : `${fq(gap)}t 초과`}` }; };
    const noGoal = (k, why) => { vd[k] = { st: 'na', txt: why }; };
    if (T.ghg) { const g = tgtOf(fy, 'own'); g == null ? noGoal('ghg', '자체 목표 없음') : mark('ghg', ghgOwn(fy), g, true); }
    if (T.re) { const g = reGoalOf(fy); g == null ? noGoal('re', `목표는 ${yrShort(RE_FIRST)}부터`) : mark('re', re100Of(S.re[fy]), g, false); }
    if (T.wt) { const g = rm && fy !== rm.baseYear ? rm.target(fy) : null;
                g == null ? noGoal('wt', rm && fy === rm.baseYear ? '기준연도' : '목표 없음') : mark('wt', S[fy].wTon, g, true); }
    siteVerdicts('y-', vd, false, fy);
    const naNote = $('h-sum-na');
    naNote.innerHTML = NONE.length ? `<b>자료 없음</b> ${esc(NONE.map(c => String(c.label).replace(/^[^\p{L}\p{N}]+/u, '')).join(' · '))}` : '';
    naNote.hidden = !NONE.length;
    $('h-sum-note').innerHTML = `${esc(si || '전체 거점')} · ${yrShort(fy)}${isClosed(fy) ? ' 확정' : ''} 실적${py ? ` · ${yrShort(py)} 대비` : ' · 비교할 전년 없음'}` +
      `<span class="hd-legend"> · 막대 = ${esc(yearsSpan(ys))}${T.ghg || T.re || T.wt ? ' · 주황 선 = 그 해 목표' : ''}</span>`;
  }

  // 에너지·자원 지표 추이: 지표마다 고른 연도 값 · 전년 대비 · 연도별 막대 (누르면 아래 월별 패턴으로)
  function renderTrendTiles(years, S, si, fy, py) {
    const ys = years.filter(y => +y <= +fy).slice(-6);
    const TILES = [
      { ic: 'bolt', label: '전력', unit: 'kWh', na: '전력', calc: 'k-elec-co2', v: y => S[y].elec, co2: y => S[y].g.elec },
      { ic: 'flame', label: '도시가스', unit: 'Nm³', na: '도시가스', calc: 'k-gas-co2', v: y => S[y].gas, co2: y => S[y].g.gas },
      { ic: 'heat', label: '지역난방', unit: 'GJ', na: '지역난방', calc: 'k-heat-co2', v: y => S[y].heat, co2: y => S[y].g.heat },
      { ic: 'pump', label: '휘발유', unit: 'L', na: '휘발유', calc: 'k-gasoline-co2', v: y => S[y].gasoline, co2: y => S[y].g.gasoline },
      { ic: 'truck', label: '경유', unit: 'L', na: '경유', calc: 'k-diesel-co2', v: y => S[y].diesel, co2: y => S[y].g.diesel },
      { ic: 'sun', label: '재생에너지 자가발전', unit: 'kWh', na: RE_SELF, up: true, calc: 'k-re-kwh', v: y => S[y].reSelf, co2: y => S[y].g.reSelf, avoid: true },
      { ic: 'leaf', label: '재생에너지 구매', unit: 'kWh', na: RE_BUY, up: true, calc: 'k-re-buy', v: y => S[y].reBuy },
      { ic: 'lift', label: '승강기 회생제동', unit: 'kWh', na: SAVE_REGEN, up: true, calc: 'k-regen', v: y => S[y].regen, co2: y => S[y].g.regen, avoid: true },
      { ic: 'drop', label: '용수', unit: '㎥', na: WATER, v2: true, calc: 'k-water', v: y => S[y].water },
      { ic: 'car', label: '친환경차 전환율 (연말)', unit: '%', na: EV_ALL, pct: true, up: true, v2: true, calc: 'k-ev', v: y => S[y].evRate },
    ].filter(t => (v2 || !t.v2) && !(t.na && allNA(si, t.na)) && ys.some(y => t.v(y) != null));
    // 배출 비중을 카드에 띠로 (어느 것이 큰지 한눈에) · 배출이 큰 것부터 · 회피·참고 항목(재생에너지 등)은 비중에서 뺌
    const share = t => (!t.co2 || t.avoid) ? null : Math.max(0, t.co2(fy) ?? 0);
    const tot = sumBy(TILES.map(t => ({ v: share(t) })).filter(x => x.v != null), x => x.v);
    TILES.forEach(t => { const g = share(t); t.share = tot > 0 && g != null ? g / tot * 100 : null; });
    TILES.sort((a, b) => (b.share ?? -1) - (a.share ?? -1));
    $('h-trend').innerHTML = TILES.length ? TILES.map(t => sumCard(t, ys, fy, py, true)).join('')
      : '<div class="hist-empty">에너지·자원 자료가 없어요</div>';
    $('h-trend').style.setProperty('--cols', colsFor(TILES.length, 5, 3));
    $('h-trend-note').innerHTML = `${esc(si || '전체 거점')} · ${esc(yearsSpan(ys))}<span class="hd-legend"> · 진한 막대 = ${yrShort(fy)} · 카드를 누르면 계산 근거를 봐요</span>`;
  }

  // 온실가스 증감 요인: 고른 연도(fy) − 전년(py) 배출을 에너지원별(또는 거점별)로 → 합이 총배출 증감
  const DRIVER_TYPES = ['전력', '도시가스', '지역난방', '휘발유', '경유'];
  const DRIVER_KEY = { '전력': 'elec', '도시가스': 'gas', '지역난방': 'heat', '휘발유': 'gasoline', '경유': 'diesel' };
  function driverRows(si, fy, py, by = 'type') {
    const sites = si ? [si] : SITES, keys = by === 'site' ? sites : DRIVER_TYPES;
    const sum = (y, k) => sumBy(energyRecs.filter(r => r.date?.startsWith(y) && sites.includes(r.site) && isEmit(r.type) && (by === 'site' ? r.site === k : r.type === k)), r => r.ghg);
    return keys.map(k => { const c = sum(fy, k), p = sum(py, k); return c > 0 || p > 0 ? { k, c, p, d: c - p } : null; }).filter(Boolean);
  }
  // 증감 요인: 한 문장 요약(얼마나 늘었/줄었나 · 가장 크게 늘린/줄인 요인) + 요인 목록
  //  목록 = 증감이 큰 순 · 가운데 0선 기준 막대(줄어든 배출 = 왼쪽 초록, 늘어난 배출 = 오른쪽 빨강) · 사용량(또는 거점 배출) 변화 · 맨 아래 = 총배출 증감
  //  줄을 누르면 그 에너지원(또는 거점)의 고른 연도 월별 자료
  function renderDrivers(si, fy, py, S) {
    const by = si ? 'type' : histWhyBy;
    $('h-why-seg').hidden = !!si;   // 거점별 나눔은 전체 합계에서만
    $('h-why-seg').querySelectorAll('button').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.by === by)));
    const rows = py ? driverRows(si, fy, py, by).sort((a, b) => Math.abs(b.d) - Math.abs(a.d)) : [];
    const c = sumBy(rows, x => x.c), p = sumBy(rows, x => x.p), d = c - p, ok = !!py && p > 0;
    $('h-cwhy-empty').hidden = ok;
    $('h-sec-why').hidden = !ok;   // 비교할 전년이 없는 해는 구역을 통째로 숨김 (빈 상자만 남지 않게)
    $('h-why-note').textContent = ok ? `${si || '전체 거점'} · ${yrShort(py)} → ${yrShort(fy)} · ${by === 'site' ? '거점' : '에너지원'}마다 늘거나 준 배출량 (tCO₂eq)`
                                     : `${yrShort(fy)}은 비교할 전년 자료가 없어요`;
    const EPS = 0.0005, sign = v => v > EPS ? '+' : v < -EPS ? '△' : '±', arr = v => v > 0 ? '▲' : v < 0 ? '▼' : '→ ';
    const tone = v => Math.abs(v) < EPS ? 'flat' : v > 0 ? 'bad' : 'good';
    const pct = (v, base) => base > 0 ? `${arr(v)}${fmt(Math.abs(v / base * 100), 1)}%` : '';
    // ① 한 문장 요약
    const big = xs => xs.reduce((m, x) => (!m || Math.abs(x.d) > Math.abs(m.d) ? x : m), null);
    const up = big(rows.filter(x => x.d > EPS)), dn = big(rows.filter(x => x.d < -EPS));
    $('h-why-head').innerHTML = !ok ? '' :
      `<p class="why-say">${yrShort(fy)} 총배출은 ${yrShort(py)}보다 ` + (Math.abs(d) < EPS ? '<b class="flat">거의 같았어요</b>'
        : `<b class="${tone(d)}">${fq(Math.abs(d))} tCO₂eq (${pct(d, p)}) ${d > 0 ? '늘었어요' : '줄었어요'}</b>`) + '</p>' +
      `<p class="why-sub"><span>${yrShort(py)} <b>${fq(p)}</b> → ${yrShort(fy)} <b>${fq(c)}</b> tCO₂eq</span>` +
      (up ? `<span>가장 크게 늘린 요인 <b class="bad">${esc(up.k)} +${fq(up.d)}t</b></span>` : '') +
      (dn ? `<span>가장 크게 줄인 요인 <b class="good">${esc(dn.k)} △${fq(-dn.d)}t</b></span>` : '') + '</p>';
    // ② 요인 목록
    const usage = x => { if (by === 'site') return null; const kk = DRIVER_KEY[x.k], u = GHG[x.k].unit, a = S[py]?.[kk], b = S[fy]?.[kk];
      return a == null && b == null ? null : { a, b, u, pct: a > 0 && b != null ? (b - a) / a * 100 : null }; };
    const maxAbs = Math.max(...rows.map(x => Math.abs(x.d)), Math.abs(d), 1e-9);
    const bar = v => `<span class="dv-bar" aria-hidden="true"><i class="${tone(v)}" style="${v < 0 ? 'right' : 'left'}:50%;width:${(Math.abs(v) / maxAbs * 50).toFixed(2)}%"></i></span>`;
    const row = x => {
      const t = tone(x.d), u = usage(x);
      const sub = by === 'site' ? `배출 <b>${fq(x.p)}</b> → <b>${fq(x.c)}</b> tCO₂eq` + (x.p > 0 ? ` <span class="dpill ${t}">${pct(x.d, x.p)}</span>` : '')
        : u ? `사용량 <b>${u.a == null ? '—' : fq(u.a)}</b> → <b>${u.b == null ? '—' : fq(u.b)}</b> ${u.u}` +
              (u.pct != null ? ` <span class="dpill ${u.pct > 0.05 ? 'bad' : u.pct < -0.05 ? 'good' : 'flat'}">${pct(u.pct, 100)}</span>` : ' <span class="dpill flat">새로 사용</span>') : '';
      return `<li><button type="button" class="dv-row" data-k="${esc(x.k)}" title="${esc(`${x.k} ${yrShort(fy)} 월별 자료 보기`)}">` +
        `<span class="dv-nm">${by === 'site' ? `<i class="sb-dot" style="background:${SITE_COL[x.k] || 'var(--muted)'}"></i>` : `<i class="mt-dot" style="background:${typeCol(x.k)}"></i>`}${esc(x.k)}</span>` +
        bar(x.d) + `<b class="dv-d ${t}">${sign(x.d)}${fq(Math.abs(x.d))}t</b>` + `<span class="dv-sub">${sub}</span></button></li>`;
    };
    $('h-why-list').innerHTML = !ok ? '' :
      '<li class="dv-hd" aria-hidden="true"><span class="dv-axl"><em>◀ 줄어든 배출</em><em>늘어난 배출 ▶</em></span></li>' + rows.map(row).join('') +
      `<li class="dv-tot"><span class="dv-nm">총배출 증감</span>${bar(d)}<b class="dv-d ${tone(d)}">${sign(d)}${fq(Math.abs(d))}t</b>` +
      `<span class="dv-sub">${yrShort(py)} <b>${fq(p)}</b> → ${yrShort(fy)} <b>${fq(c)}</b> tCO₂eq <span class="dpill ${tone(d)}">${pct(d, p)}</span></span></li>`;
  }

  // 보고서 문구 (복사용): 고른 연도 vs 전년 — 프로젝트 표기 (24년 00 → 25년 00 (0.0%↑) · 감소는 △)
  function renderCopyText(S, si, T, fy, py) {
    const nm = si || '전체 거점', fS = yrShort(fy), pS = py ? yrShort(py) : '', cur = S[fy], prev = py ? S[py] : null;
    const t1 = v => fmt(v, 1), t3 = v => fq(v), pct = (a, b) => b ? (a - b) / Math.abs(b) * 100 : null;
    const rep = (d, u = '%') => `${t1(Math.abs(d))}${u}${d > 0.05 ? '↑' : d < -0.05 ? '↓' : ''}`;
    const copy = [`[${nm} · ${fy}년 실적${py ? ` (${py}년 대비)` : ''}]`];
    // ① 온실가스 배출량 · ② 증감 요인 (에너지원별, 크게 변한 순 2개씩)
    const tot = ghgOfStat(cur), ptot = prev ? ghgOfStat(prev) : null;
    if (tot != null && !ptot) copy.push(`· 온실가스(Scope 1+2): ${fS} ${t3(tot)} tCO₂eq`);
    else if (tot != null) {
      copy.push(`· 온실가스(Scope 1+2): ${pS} ${t3(ptot)} → ${fS} ${t3(tot)} tCO₂eq (${rep(pct(tot, ptot))})`);
      const rows = driverRows(si, fy, py), ups = rows.filter(x => x.d > 0.05).sort((a, b) => b.d - a.d).slice(0, 2), dns = rows.filter(x => x.d < -0.05).sort((a, b) => a.d - b.d).slice(0, 2);
      if (ups.length || dns.length) copy.push(`· 증감 요인(tCO₂eq): ${[...ups.map(x => `${x.k} +${t3(x.d)}`), ...dns.map(x => `${x.k} △${t3(-x.d)}`)].join(', ')}`);
    }
    // ③ 온실가스 감축 목표 (대구본원)
    if (T.ghg) {
      const dgb = dgbOf(fy), own = tgtOf(fy, 'own'), law = tgtOf(fy, 'law'), b = baseOf(fy);
      if (dgb > 0 && b) {
        if (own != null) copy.push(`· 자체 배출목표 ${t3(own)} tCO₂eq 대비 ${t1(dgb / own * 100)}% (${dgb <= own ? '달성' : '미달성'})` +
          (law != null ? `, 법적 배출목표 ${t3(law)} tCO₂eq 대비 ${t1(dgb / law * 100)}% (${dgb <= law ? '달성' : '미달성'})` : ''));
        const cut = (b - dgb) / b * 100, pd = py ? dgbOf(py) : 0, pb = py ? baseOf(py) : null, pcut = pd > 0 && pb ? (pb - pd) / pb * 100 : null;
        copy.push(`· 기준배출량 대비 감축률: ${pcut != null ? `${pS} ${t1(pcut)}% → ` : ''}${fS} ${t1(cut)}%${pcut != null ? ` (${rep(cut - pcut, '%p')})` : ''}`);
      }
    }
    // ④ RE100 이행률 (대구본원·제주글로벌센터) — 정부 이행 목표는 26년부터
    //  전체 합계에서도 대상 거점(대구+제주)만으로 — 화면 카드와 같은 셈 (서울이 섞여 숫자가 달라지지 않게)
    if (T.re) {
      const re = re100Of(S.re[fy]), pre = py ? re100Of(S.re[py]) : null, g = reGoalOf(fy);
      if (re != null) copy.push(`· RE100 이행률: ${pre != null ? `${pS} ${t1(pre)}% → ` : ''}${fS} ${t1(re)}%${pre != null ? ` (${rep(re - pre, '%p')})` : ''}` +
        (g != null ? ` / 정부 이행 목표 ${g}% (${re >= g ? '달성' : '미달성'})` : ''));
    }
    // ⑤ 폐기물 감축 (로드맵이 있을 때)
    if (T.wt) {
      const rm = wasteRoadmap(si), a = cur.wTon, t = rm?.target(fy);
      if (a != null && rm && fy === rm.baseYear) copy.push(`· 폐기물 발생량: ${fS} ${fq(a)} ton (감축 기준연도)`);
      else if (a != null && t != null) copy.push(`· 폐기물 발생량: ${fS} ${fq(a)} ton / 감축 목표 ${fq(t)} ton (${a <= t ? '달성' : '미달성'})`);
    }
    // ⑥ 에너지 사용량 (전년 대비)
    if (prev) {
      const U = [['전력', s => s.elec], ['도시가스', s => s.gas], ['지역난방', s => s.heat], ['차량연료', s => s.fuel]]
        .map(([n, f]) => { const a = f(cur), b = f(prev); return a != null && b ? { n, d: pct(a, b) } : null; }).filter(Boolean);
      if (U.length) copy.push('· 에너지 사용량(전년 대비): ' + U.map(u => `${u.n} ${rep(u.d)}`).join(', '));
    }
    histCopy = copy.join('\n');
    $('h-copy-text').textContent = histCopy;
  }

  // NIA 온실가스 배출 감축 로드맵 (대구본원) — 2030 중기 · 2050 장기 · 이정표 · 접었을 때 요약
  //  지난 연도: 고른 연도(y)의 실적을 진하게 · 올해: 올해 연말 예측(pred)을 연한 막대로 함께
  const rmIds = P => P === 'h' ? ['h-chart-path', 'h-cp-empty', 'h-chart-path50', 'h-cp50-empty', 'h-rm-miles', 'h-rm-peek']
    : [P + 'chart-rm-path', P + 'crm-empty', P + 'chart-rm-path50', P + 'crm50-empty', P + 'rm-miles', P + 'rm-peek'];
  // 감축 로드맵 그래프의 표시 기간 (mid = 2030 중기 · long = 2050 장기) — null = 전체
  const ghgRange = { mid: null, long: null };
  const clipRange = (arr, k) => { const r = ghgRange[k]; return r ? arr.filter(y => +y >= +r.from && +y <= +r.to) : arr; };
  function renderRangePick(boxId, k, all) {
    const box = $(boxId); if (!box || !all.length) return;
    const r = ghgRange[k] && all.includes(ghgRange[k].from) && all.includes(ghgRange[k].to) ? ghgRange[k] : { from: all[0], to: all[all.length - 1] };
    const opt = sel => all.map(y => `<option value="${y}"${y === sel ? ' selected' : ''}>${yrShort(y)}</option>`).join('');
    box.innerHTML = `<select data-end="from" aria-label="시작 연도">${opt(r.from)}</select> ~ <select data-end="to" aria-label="끝 연도">${opt(r.to)}</select>` +
      (ghgRange[k] ? '<button type="button" data-reset="1" title="처음 기간으로">전체</button>' : '');
    box.dataset.k = k;
  }
  ['h-rng-mid', 'h-rng-long'].forEach(id => {
    $(id).addEventListener('change', e => {
      const box = $(id), [f, t] = [...box.querySelectorAll('select')].map(x => x.value), end = e.target.dataset.end;
      ghgRange[box.dataset.k] = +f <= +t ? { from: f, to: t } : end === 'from' ? { from: f, to: f } : { from: t, to: t };
      renderRoadmapTab();
    });
    $(id).addEventListener('click', e => { if (e.target.closest('button[data-reset]')) { ghgRange[$(id).dataset.k] = null; renderRoadmapTab(); } });
  });
  /* ── 📈 전망 탭 · 목표·로드맵 그래프 아래 전망 한 줄 ─────────────────────────────────────
     계산은 ghgOutlook · reOutlook (위) — 출발점 = 올해 연말 예측 · 에너지원마다 최근 추세(해마다 약해짐) · 태양광 증설분
     주요 연도 = 올해 ~ 30년 + 35·40·45·50년 (표는 주요 연도만 보이다가 '모든 연도 보기'로 펼침) */
  const OL_MS = y => y <= 2030 || y % 5 === 0;
  // 판정 한 칸 — lower = 낮을수록 좋음(배출량) · f = 차이 글자 · tent = 아직 정해지지 않은 목표(참고 · 흐리게)
  const olVerdict = (v, t, lower, f, tent = false) => t == null || v == null ? '<span class="ol-v na">목표 없음</span>'
    : (lower ? v <= t : v >= t) ? `<span class="ol-v ok${tent ? ' tent' : ''}">✓ 여유 ${f(Math.abs(t - v))}</span>`
    : `<span class="ol-v no${tent ? ' tent' : ''}">✗ ${lower ? '초과' : '부족'} ${f(Math.abs(v - t))}</span>`;
  // 목표를 처음 넘는(lower) · 처음 못 미치는 해 — 없으면 null
  const olFirstMiss = (ys, v, t, lower = true) => { for (let i = 0; i < ys.length; i++) { const g = t(ys[i]);
    if (g != null && v[i] != null && (lower ? v[i] > g + 1e-9 : v[i] < g - 1e-9)) return ys[i]; } return null; };
  const ownOf = y => ROADMAP[y]?.target ?? null;
  // 목표·로드맵 — 그래프 아래 한 줄: 30·50년 전망과 목표 · 누르면 📈 전망 탭의 그 표로
  function renderRmOlLinks(OL, ROL) {
    const g = $('h-ol-ghg-link'), r = $('h-ol-re-link'), t1 = v => fmt(v, 1), go = '<span class="oll-go">연도별 표 · 만약에 계산 →</span>';
    const mark = ok => ok ? ' <b class="good">✓</b>' : ' <b class="bad">✗</b>';
    g.hidden = !OL;
    if (OL) {
      const bits = [2030, 2050].filter(y => OL.ys.includes(y)).map(y => { const v = OL.v[OL.ys.indexOf(y)], own = ownOf(y);
        return `${yrShort(y)} <b>${t1(v)}t</b>${own == null ? '' : ` <small>자체 목표 ${t1(own)}t</small>${mark(v <= own)}`}`; });
      const miss = olFirstMiss(OL.ys, OL.v, ownOf);
      g.innerHTML = `<span class="oll-k">${icn('trend')} 전망</span><span>${bits.join(' · ')}</span>` +
        (miss ? `<span class="bad">지금 추세면 ${yrShort(miss)}부터 자체 목표 초과</span>` : '<span class="good">50년까지 자체 목표 안</span>') + go;
    }
    r.hidden = !ROL;
    if (ROL) {
      const row = y => ROL.rows.find(x => x.y === y), r30 = row(2030);
      const bits = [2030, 2050].map(row).filter(x => x && x.pct != null).map(x => { const gl = x.goal ?? x.ref;
        return `${yrShort(x.y)} <b>${fmt(x.pct, 1)}%</b>${gl == null ? '' : ` <small>목표 ${gl}%</small>${mark(x.pct >= gl)}`}`; });
      r.innerHTML = `<span class="oll-k">${icn('trend')} 전망</span><span>${bits.join(' · ')}</span>` +
        (r30?.need > 0 ? `<span>30년 목표까지 재생에너지 <b>${kwhK(r30.need)} kWh</b> 더</span>` : '') + go;
    }
  }
  // 빗금 무늬 (전망 막대 — 아직 오지 않은 해) · 색마다 한 번 만들어 둠
  const hatchCache = {};
  function hatch(col) {
    if (hatchCache[col]) return hatchCache[col];
    const c = document.createElement('canvas'); c.width = c.height = 7;
    const x = c.getContext('2d');
    x.fillStyle = hexA(col, .1); x.fillRect(0, 0, 7, 7);
    x.strokeStyle = hexA(col, .6); x.lineWidth = 1.4; x.beginPath();
    x.moveTo(-1, 8); x.lineTo(8, -1); x.moveTo(-1, 1); x.lineTo(1, -1); x.moveTo(6, 8); x.lineTo(8, 6); x.stroke();
    return (hatchCache[col] = x.createPattern(c, 'repeat'));
  }
  // 전망 막대 (내년 ~ 50년) — 에너지원마다 최근 추세 + 태양광 증설분
  //  o = { ys, v } · xs = 그래프 연도(문자·숫자) · lbl(y, v) = 막대 위 글자 (null = 그래프 기본 · '' = 안 씀) · 올해는 '올해 연말 예측' 막대가 따로 있음
  function olBars(o, xs, lbl = null, thick = 44) {
    if (!o) return [];
    const y0 = new Date().getFullYear(), C = cssVar('--chart-law-line'), pat = hatch(C);
    const data = xs.map(yy => { const i = o.ys.indexOf(+yy); return i < 0 || +yy <= y0 ? null : o.v[i]; });
    return [{ type: 'bar', label: '전망', order: 2, grouped: false, $ol: true, data, maxBarThickness: thick, borderRadius: thick > 20 ? 4 : 3,
      legendColor: pat, backgroundColor: pat, borderColor: hexA(C, .9), borderWidth: thick > 20 ? 1.3 : 1, borderSkipped: 'bottom',
      ...(lbl ? { valueLabels: data.map((v, i) => v == null ? null : lbl(+xs[i], v)) } : {}) }];
  }

  /* ── 📈 전망 탭 ──────────────────────────────────────────────────────────────
     한눈에 보기(카드) → 🧮 만약에 → 온실가스 · RE100 (그래프 + 표) → 경영평가 계량 점수 → 셈 방법
     탭이 열려 있을 때만 그림 (탭을 누를 때 · 자료가 바뀔 때 · 만약에 칸을 바꿀 때) */
  const VIO = () => cssVar('--vio');   // 만약에 (보라 점선)
  // 그래프 아래 눈금 — 5년마다 + 올해 (좁으면 10년마다)
  const olTicks = { autoSkip: false, maxRotation: 0, callback(v) { const l = this.getLabelForValue(v), y = 2000 + parseInt(l), y0 = new Date().getFullYear();
    if ((this.chart.data.labels || []).length <= 12) return l;
    return y === y0 || y % (this.chart.width < 560 ? 10 : 5) === 0 ? l : ''; } };
  function makeOutlookCharts() {
    const { bar, pathTip, pctTip } = chartKit();
    const ghg = bar('o-chart-ghg', [], { yTitle: 'tCO₂eq', grace: '12%', tooltip: pathTip, xGrid: { display: false }, xTicks: olTicks });
    const re = bar('o-chart-re', [], { yTitle: '%', grace: '6%', tooltip: pctTip, xGrid: { display: false }, xTicks: olTicks });
    re.options.scales.y.ticks.stepSize = 20;
    // 에너지원별 (대구본원 Scope 1+2) — 쌓은 막대 · 맨 위 = 그 해 합계
    const src = bar('o-chart-src', [], { stacked: true, yTitle: 'tCO₂eq', tooltip: { callbacks: {
      label: c => c.raw == null ? null : `${c.dataset.label}: ${fmt(c.raw, 1)} tCO₂eq` + (c.dataset.$amt?.[c.dataIndex] != null ? ` (${amtTxt(c.dataset.$type, c.dataset.$amt[c.dataIndex])})` : ''),
      footer: items => { const xs = items.filter(i => i.raw != null); return xs.length > 1 ? `합계 ${fmt(sumBy(xs, i => i.raw), 1)} tCO₂eq` : ''; } } } });
    return { ghg, re, src };
  }
  const olTabOn = () => document.querySelector('.tab-btn.active')?.dataset.tab === 'outlook';
  // 만약에 한 줄 — '대구 태양광 +100kW(27년~) · 구매 연 50.0만 kWh(28년~) · 절감 3%(27년~)'
  const scTxt = sc => !sc ? '' : [sc.pv ? `${SITE_SHORT[sc.pv.site] || sc.pv.site} 태양광 +${fq(sc.pv.kw)}kW(${yrShort(sc.pv.from.slice(0, 4))}~)` : '',
    sc.buy ? `구매 연 ${kwhK(sc.buy.kwh)} kWh(${yrShort(sc.buy.from)}~)` : '', sc.cut ? `절감 ${fq(sc.cut.pct)}%(${yrShort(sc.cut.from)}~)` : ''].filter(Boolean).join(' · ');
  let olLast = null;   // 마지막으로 그린 전망 (CSV 내보내기)
  function renderOutlookTab() {
    const y0 = new Date().getFullYear();
    let OL = null, ROL = null, SOL = null, SROL = null;
    try { OL = ghgOutlook(); } catch (e) { console.warn('[전망: 온실가스]', e); }
    try { ROL = reOutlook(); } catch (e) { console.warn('[전망: RE100]', e); }
    wiFill(ROL);
    const sc = wiRead();
    if (sc) {
      try { SOL = ghgOutlook(sc); } catch (e) { console.warn('[전망: 만약에 온실가스]', e); }
      try { SROL = reOutlook(sc); } catch (e) { console.warn('[전망: 만약에 RE100]', e); }
    }
    const EVB = olEval(OL), EVS = sc ? olEval(SOL, sc) : null;
    olLast = { OL, ROL, SOL, SROL, sc };
    $('o-sum-note').textContent = `${yrShort(y0)} 연말 예측에서 출발 · ${yrShort(y0 + 1)}~${yrShort(OUTLOOK.to)} = 지금처럼 가면`;
    const run = (k, f) => { try { f(); } catch (e) { console.warn(`[전망: ${k}]`, e); } };
    run('결론', () => renderOVerdict(OL, ROL, EVB));
    run('카드', () => renderOCards(OL, ROL, EVB, SOL, SROL, EVS));
    run('목표 지도', () => renderOMap(OL, ROL, SOL, SROL));
    run('목표에 맞춰 넣기', () => renderWiFit(sc));
    run('만약에', () => renderWiOut(sc, OL, ROL, SOL, SROL, EVB, EVS));
    run('온실가스', () => renderOGhg(OL, SOL, sc));
    run('RE100', () => renderORe(ROL, SROL, sc));
    run('에너지원별', () => renderOSrc(OL));
    run('경영평가', () => renderOEval(EVB, OL));
    run('셈 방법', () => renderOHow(ROL));
    $('o-span-chip').textContent = `지금 \u2192 ${OUTLOOK.to}년`;
    run('바로가기', renderOutlookToc);
  }
  // ⓪ 결론 — 목표마다 한 줄: 지금처럼 가면 지키나 · 언제부터 못 지키나 · 얼마나 · 무엇으로 채우나 (누르면 그 해 계산 근거)
  function renderOVerdict(OL, ROL, EV) {
    const y0 = new Date().getFullYear(), yE = OUTLOOK.to, t0 = v => fq(Math.round(v)), out = [], when = y => y === y0 ? '올해' : yrShort(y);
    if (OL) {
      const at = y => OL.v[OL.ys.indexOf(y)], miss = olFirstMiss(OL.ys, OL.v, ownOf), v30 = at(2030), o30 = ownOf(2030), vE = at(yE), oE = ownOf(yE);
      out.push({ ic: icn('factory'), k: '온실가스', st: !miss ? 'ok' : miss <= 2030 ? 'no' : 'warn', pop: `ghg:${miss || yE}`,
        b: !miss ? `${yrShort(yE)}까지 자체 목표 안` : `${when(miss)}부터 자체 목표 초과`,
        t: !miss ? `${yrShort(yE)} 전망 ${t0(vE)}t · 자체 목표 ${t0(oE)}t`
          : miss <= 2030 ? `30년 전망 ${t0(v30)}t — 자체 목표 ${t0(o30)}t보다 <b>${t0(v30 - o30)}t 많아요</b>`
          : `30년까지는 여유 ${t0(o30 - v30)}t · 줄어드는 속도는 느려지는데 목표는 계속 낮아져 ${yrShort(yE)}엔 목표보다 <b>${t0(vE - oE)}t 많아요</b>` });
    }
    if (ROL) {
      const miss = ROL.rows.find(r => { const g = r.goal ?? r.ref; return r.pct != null && g != null && r.pct < g - 1e-9; }), r30 = ROL.rows.find(r => r.y === 2030);
      const kw = r30 ? needKw(r30.need, ROL.sol) : null;
      out.push({ ic: icn('sun'), k: 'RE100', st: !miss ? 'ok' : 'no', pop: `re:${r30 ? 2030 : yE}`,
        b: !miss ? `${yrShort(yE)}까지 정부 목표 이상` : `${when(miss.y)}부터 정부 목표 미달`,
        t: r30?.need > 0 ? `30년 ${r30.goal}%까지 재생에너지 연 <b>${kwhK(r30.need)} kWh</b> 더 — 태양광이면 약 ${fq(kw)}kW` +
            (ROL.sol?.yAvg ? ` <small>(두 거점 평균 1kW당 연 ${fq(Math.round(ROL.sol.yAvg))}kWh)</small>` : '') +
            (ROL.buy > 0 ? ` · 구매면 올해 구매량의 ${fmt(r30.need / ROL.buy, 1)}배를 더` : '')
          : r30 ? `30년 전망 ${fmt(r30.pct, 1)}% · 정부 목표 ${r30.goal}%` : '' });
    }
    if (EV.length) {
      const bad = EV.find(r => r.ready && r.got < 100 - 1e-9), last = EV[EV.length - 1];
      const why = r => r.g && r.g.pt < EVAL.ghgPt - 1e-9 ? `온실가스 감축률 ${fmt(r.g.cut, 1)}%가 권장 ${fmt(r.g.rate, 1)}%보다 낮아요`
        : r.e ? `에너지 절감률 ${fmt(r.e.X, 2)}% — 만점 기준 1%` : '';
      out.push({ ic: icn('file'), k: '경영평가 계량', st: !bad ? 'ok' : 'no', go: 'o-ev-sec',
        b: !bad ? `${yrShort(last.y)}분까지 100점` : `${yrShort(bad.y)}분 ${fmt(bad.got, 1)}점`,
        t: !bad ? `${yrShort(last.y + 1)} 평가까지 온실가스 60 + 에너지 40 만점 전망` : `${yrShort(bad.y + 1)} 평가 · ${why(bad)}` });
    }
    $('o-verdict').hidden = !out.length;
    $('o-verdict').innerHTML = out.map(o => `<li class="${o.st}" role="button" tabindex="0"` +
      (o.pop ? ` data-rmpop="${o.pop}" title="누르면 계산 근거"` : ` data-go="outlook" data-scroll="${o.go}" title="누르면 아래 표로"`) + '>' +
      `<span class="ov-ic" aria-hidden="true">${o.ic}</span><span class="ov-m"><span class="ov-k">${esc(o.k)}</span>` +
      `<b class="ov-b">${o.st === 'ok' ? '✓' : o.st === 'warn' ? '!' : '✗'} ${o.b}</b><span class="ov-t">${o.t}</span></span><span class="ov-go" aria-hidden="true">›</span></li>`).join('');
  }
  // ① 카드 — 30·50년 온실가스 · 30·50년 RE100 · 계량 점수 (누르면 그 해 계산 근거) · 만약에가 켜져 있으면 보라 줄
  function renderOCards(OL, ROL, EV, SOL, SROL, EVS) {
    const t1 = v => fmt(v, 1), cards = [];
    const card = o => `<div class="gs-card o-card ${o.st}" role="button" tabindex="0"` +
      (o.pop ? ` data-rmpop="${o.pop}" title="누르면 계산 근거"` : ` data-go="outlook" data-scroll="${o.go}" title="누르면 아래 표로"`) + '>' +
      `<div class="gs-k">${o.k}</div><div class="gs-v">${o.v}<small>${o.u}</small></div><div class="gs-r">${o.r}</div>` +
      `<div class="gs-t">${o.t}</div>${o.sc ? `<div class="o-scl">만약에 ${o.sc}</div>` : ''}${o.s ? `<div class="o-cs">${o.s}</div>` : ''}</div>`;
    const mk = (v, t, lower) => t == null ? '' : (lower ? v <= t + 1e-9 : v >= t - 1e-9) ? ' ✓' : ' ✗';
    if (OL) {
      [2030, 2050].filter(y => OL.ys.includes(y)).forEach(y => {
        const i = OL.ys.indexOf(y), v = OL.v[i], own = ownOf(y), lo = lawOf(y), ok = own == null ? null : v <= own, b = baseOf(y), orr = ownRate(y);
        cards.push({ k: `${icn('factory')} ${yrShort(y)} 온실가스`, pop: `ghg:${y}`, v: t1(v), u: 'tCO₂eq', st: ok == null ? 'na' : ok ? 'ok' : 'no',
          t: own == null ? '자체 목표 없음' : `자체 목표 <b>${t1(own)}t</b>${lo ? ` · 법적${lo.tent ? '(미확정)' : ''} ${fq(+lo.t.toFixed(1))}t` : ''}`,
          r: ok == null ? '판단 전' : ok ? `✓ 자체 목표 안 · 여유 ${t1(own - v)}t` : `✗ 자체 목표보다 ${t1(v - own)}t 많음`,
          sc: SOL ? `<b>${t1(SOL.v[i])}t</b>${mk(SOL.v[i], own, true)}` : '',
          s: b > 0 ? `기준배출량 대비 <b>${fmtPct((v - b) / b * 100)}</b>${orr != null ? ` · 자체 목표 ${fmtPct(-orr)}` : ''}` : '' });
      });
    }
    if (ROL) {
      [2030, 2050].map(y => ROL.rows.find(x => x.y === y)).filter(x => x && x.pct != null).forEach(x => {
        const gl = x.goal ?? x.ref, ok = gl == null ? null : x.pct >= gl, kw = needKw(x.need, ROL.sol), sp = SROL?.rows.find(r => r.y === x.y)?.pct;
        cards.push({ k: `${icn('sun')} ${yrShort(x.y)} RE100 이행률`, pop: `re:${x.y}`, v: fmt(x.pct, 1), u: '%', st: ok == null ? 'na' : ok ? 'ok' : 'no',
          t: gl == null ? '정부 목표 없음' : `정부 목표 <b>${gl}%</b>`,
          r: ok == null ? '판단 전' : ok ? '✓ 목표 이상' : `✗ 목표까지 ${fmt(gl - x.pct, 1)}%p`,
          sc: sp != null ? `<b>${fmt(sp, 1)}%</b>${mk(sp, gl, false)}` : '',
          s: x.need > 0 ? `재생에너지 연 <b>${kwhK(x.need)} kWh</b> 더${kw ? ` · 태양광이면 약 ${fq(kw)}kW` : ''}` : '' });
      });
    }
    const e30 = EV.find(r => r.y === 2030) || EV[EV.length - 1], e0 = EV[0], s30 = EVS?.find(r => r.y === e30?.y);
    if (e30?.ready) cards.push({ k: `${icn('file')} 계량 점수 · ${yrShort(e30.y)}분`, go: 'o-ev-sec', v: fmt(e30.got, 1), u: '/ 100점',
      st: e30.got >= 100 - 1e-9 ? 'ok' : 'no', t: `${yrShort(e30.y + 1)} 평가 · 온실가스 ${fmt(e30.g.pt, 1)} + 에너지 ${fmt(e30.e.pt, 1)}`,
      r: e30.got >= 100 - 1e-9 ? '✓ 만점 전망' : `✗ 만점까지 ${fmt(100 - e30.got, 1)}점`,
      sc: s30?.ready ? `<b>${fmt(s30.got, 1)}점</b>` : '',
      s: e0?.ready && e0 !== e30 ? `${yrShort(e0.y)} 연말 예측이면 ${fmt(e0.got, 1)}점 (${yrShort(e0.y + 1)} 평가)` : '' });
    $('o-cards').innerHTML = cards.length ? cards.map(card).join('') : '<p class="o-empty">전망을 낼 자료가 없어요 — 올해 에너지 실적이 들어오면 보여요</p>';
  }
  // ② 목표별 전망 지도 — 해마다 목표 안(초록) · 밖(빨강) · 점선 칸 = 아직 정해지지 않은 목표(참고) · 칸을 누르면 그 해 계산 근거
  //  만약에가 켜져 있으면 목표마다 바로 아래 '만약에' 줄 (보기만)
  function renderOMap(OL, ROL, SOL, SROL) {
    const y0 = new Date().getFullYear(), ys = [], box = $('o-map');
    for (let y = y0; y <= OUTLOOK.to; y++) ys.push(y);
    const t1 = v => `${fmt(v, 1)}t`, p1 = v => `${fmt(v, 1)}%`, pp = v => `${fmt(v, 1)}%p`, gv = (o, y) => o.v[o.ys.indexOf(y)], rv = (o, y) => o.rows.find(r => r.y === y)?.pct ?? null;
    const defs = [];
    if (OL) {
      defs.push({ k: '자체 목표', ic: icn('factory'), kind: 'ghg', o: OL, so: SOL, val: gv, goal: ownOf, tent: () => false, lower: true, f: t1, fd: t1 });
      defs.push({ k: '법적 목표', ic: icn('factory'), kind: 'ghg', o: OL, so: SOL, val: gv, goal: y => lawOf(y)?.t ?? null, tent: y => !!lawOf(y)?.tent, lower: true, f: t1, fd: t1 });
    }
    if (ROL) defs.push({ k: 'RE100', ic: icn('sun'), kind: 're', o: ROL, so: SROL, val: rv, goal: y => reGoalOf(y) ?? reGoalRef(y), tent: y => reGoalOf(y) == null, lower: false, f: p1, fd: pp });
    box.hidden = !defs.length;
    if (!defs.length) { box.innerHTML = ''; return; }
    const stOf = (d, o, y) => { const v = d.val(o, y), g = d.goal(y); return v == null || g == null ? 'na' : (d.lower ? v <= g + 1e-9 : v >= g - 1e-9) ? 'ok' : 'no'; };
    const m5 = y => y % 5 === 0 || y === y0 ? ' m5' : '';
    const row = (d, o, sc) => {
      const st = ys.map(y => stOf(d, o, y)), i = st.indexOf('no'), tag = sc ? 'span' : 'button';
      return `<div class="om-row${sc ? ' sc' : ''}"><span class="om-k">${sc ? '↳ 만약에' : `${d.ic} ${esc(d.k)}`}</span>` +
        ys.map((y, j) => { const v = d.val(o, y), g = d.goal(y), tent = d.tent(y);
          const lab = `${yrShort(y)} ${d.k}${tent ? '(참고)' : ''}${sc ? ' · 만약에' : ''} — 전망 ${v == null ? '—' : d.f(v)} / 목표 ${g == null ? '없음' : d.f(g)}` +
            (st[j] === 'ok' ? ' ✓' : st[j] === 'no' ? ` ✗ ${d.lower ? '초과' : '부족'} ${d.fd(Math.abs(v - g))}` : '');
          return `<${tag}${sc ? '' : ' type="button"'} class="om-c ${st[j]}${tent ? ' tent' : ''}${m5(y)}"${sc ? '' : ` data-rmpop="${d.kind}:${y}"`} title="${esc(lab)}" aria-label="${esc(lab)}"></${tag}>`; }).join('') +
        `<span class="om-s">${i < 0 ? `<b class="good">✓ ${yrShort(OUTLOOK.to)}까지 지킴</b>` : `<b class="bad">✗ ${ys[i] === y0 ? '올해' : yrShort(ys[i])}부터 못 지킴</b>`}</span></div>`;
    };
    box.style.setProperty('--n', ys.length);
    box.innerHTML = `<div class="om-row om-hd"><span class="om-k">목표별 전망</span>` +
      ys.map(y => `<span class="om-y${m5(y)}">${String(y).slice(2)}</span>`).join('') + '<span class="om-s">칸을 누르면 계산 근거</span></div>' +
      defs.map(d => row(d, d.o) + (d.so ? row(d, d.so, true) : '')).join('');
  }
  // 경영평가 계량 점수 전망 — 올해 = 메인과 같은 연말 예측 점수 · 그 뒤 = 전망 (온실가스 = 전망 배출량 · 에너지 = 전망 사용량 TOE)
  //  권장감축률이 정해진 해(~30년)까지만 · sc(만약에)의 구매량은 본사(대구본원) 구매로 봄
  function olEval(OL, sc = null) {
    if (!OL) return [];
    const y0 = new Date().getFullYear(), pt = x => (EVAL.enSteps.find(([lo]) => x >= lo) || [0, 0])[1];
    const B = sumBy(EVAL.types, t => sumBy(EVAL.baseYears, by => evalAmt(by, t, null)) / EVAL.baseYears.length * (toeF[t] || 0));
    const buy0 = evalAmt(y0, RE_BUY, null);
    return OL.ys.filter(y => LAW_RATE[y] !== undefined).map(y => {
      if (y === y0) { const s = evalScore(y0, buildForecast(y0, EVAL.site)?.annualPred ?? null); return { ...s, est: true }; }
      const i = OL.ys.indexOf(y), base = baseOf(y), rate = LAW_RATE[y], v = OL.v[i];
      const g = base > 0 && rate > 0 ? (() => { const cut = (base - v) / base * 100; return { v, base, rate, cut, pt: Math.max(0, Math.min(EVAL.ghgPt, cut / rate * EVAL.ghgPt)) }; })() : null;
      let e = null;
      if (B > 0) {
        const A = sumBy(EVAL.types, t => (OL.per.find(p => p.t === t)?.v[i] || 0) * (toeF[t] || 0)), X = (B - A) / B * 100;
        const reKwh = sc?.buy && y >= sc.buy.from ? sc.buy.kwh : buy0, reToe = reKwh * (toeF['전력'] || 0);
        const X2 = reToe > 0 ? (B - (A - reToe)) / B * 100 : null, needRe = X < 1 && X2 != null && pt(X2) > pt(X);
        e = { A, B, X, X2, reKwh, needRe, pt: needRe ? pt(X2) : pt(X) };
      }
      return { y, g, e, est: false, got: (g?.pt || 0) + (e?.pt || 0), ready: !!g && !!e };
    });
  }
  function renderOEval(EV, OL) {
    const y0 = new Date().getFullYear(), d2 = v => fmt(v, 2);
    if (!EV.length) { $('o-ev-tbl').innerHTML = ''; $('o-ev-note').textContent = '전망을 낼 자료가 없어요'; return; }
    $('o-ev-tbl').innerHTML = '<thead><tr><th>실적 연도</th><th>온실가스 감축률 <small>권장감축률</small></th><th>온실가스 <small>60점</small></th>' +
      '<th>에너지 절감률 <small>기준연도 대비</small></th><th>에너지 <small>40점</small></th><th>합계 <small>100점</small></th></tr></thead><tbody>' +
      EV.map(r => { const g = r.g, e = r.e;
        return `<tr${r.y === 2030 ? ' class="ol-end"' : ''}><td class="ol-y">${yrShort(r.y)} <small>${r.y === y0 ? '연말 예측' : '전망'}</small><span class="ol-x">${yrShort(r.y + 1)} 평가</span></td>` +
          `<td class="num">${g ? `${fmt(g.cut, 1)}% <small>/ ${fmt(g.rate, 1)}%</small>` : '—'}</td>` +
          `<td class="num ${g ? (g.pt >= EVAL.ghgPt - 1e-9 ? 'good' : 'bad') : ''}">${g ? fmt(g.pt, 1) : '—'}</td>` +
          `<td class="num">${e ? `${d2(e.X)}%${e.needRe ? `<small class="ol-x">구매 더하면 ${d2(e.X2)}%</small>` : ''}` : '—'}</td>` +
          `<td class="num ${e ? (e.pt >= EVAL.enPt ? 'good' : 'bad') : ''}">${e ? fmt(e.pt, 1) : '—'}</td>` +
          `<td class="num"><b>${r.g || r.e ? fmt(r.got, 1) : '—'}</b></td></tr>`; }).join('') + '</tbody>';
    const buy0 = evalAmt(y0, RE_BUY, null), last = EV[EV.length - 1].y;
    $('o-ev-note').textContent = `온실가스 = 감축률 ÷ 권장감축률 × 60 (권장감축률 이상이면 만점) · 에너지 = 기준연도(${EVAL.baseYears.map(yrShort).join('·')}) 연평균 TOE 대비 절감률 — ` +
      `1% 이상 40점 · 0.5% 이상 20점 · 1%에 못 미치면 재생에너지 구매(본사 ${yrShort(y0)} ${kwhK(buy0)} kWh를 그대로 둠)로 보완` +
      (last < OUTLOOK.to ? ` · ${yrShort(last + 1)}부터는 권장감축률이 아직 정해지지 않아 셈하지 않아요` : '');
  }
  // ② 온실가스 (대구본원 Scope 1+2) — 실적 · 올해 연말 예측 · 전망(빗금) + 자체·법적 목표 + 만약에(보라 점선)
  function renderOGhg(OL, SOL, sc) {
    const y0 = new Date().getFullYear(), c = CHARTS.o?.ghg, t1 = v => fmt(v, 1);
    const navy = cssVar('--chart-actual'), TEAL = cssVar('--chart-own'), AMBER = cssVar('--chart-law');
    const xs = []; for (let y = y0 - 2; y <= OUTLOOK.to; y++) xs.push(y);
    const MS = y => y === y0 - 1 || y === y0 || y === 2030 || y === 2040 || y === 2050, l0 = (y, v) => MS(y) ? fmt(v, 0) : '';
    const act = y => y < y0 && dgbOf(String(y)) > 0 ? dgbOf(String(y)) : null;
    const law = xs.map(y => lawOf(y)), lawTent = law.map((l, i) => l && (l.tent || law[i - 1]?.tent || law[i + 1]?.tent) ? l.t : null);
    const pts = xs.map(y => y === 2030 || y === 2040 || y === 2050 ? 3 : 0);
    $('o-ghg-note').innerHTML = !OL ? '' : esc(`${yrShort(y0)} 연말 예측 ${t1(OL.v[0])}t에서 에너지원마다 최근 추세로${OL.sol?.extra.some(v => v > 0) ? ' · 태양광 증설분 반영' : ''} · 연도를 누르면 계산 근거`) +
      (sc ? ` <span class="o-scn">보라 점선 = 만약에 (${esc(scTxt(sc))})</span>` : '');
    if (c) {
      c.data.labels = xs.map(yrShort);
      const sAt = y => { const i = SOL ? SOL.ys.indexOf(y) : -1; return i < 0 ? null : SOL.v[i]; };
      setChart(c, 'o-chart-ghg', 'o-ghg-empty', !OL ? [] : [
        { type: 'bar', label: '배출 실적', order: 2, grouped: false, borderRadius: 4, maxBarThickness: 34, legendColor: navy,
          data: xs.map(act), valueLabels: xs.map(y => act(y) == null ? null : l0(y, act(y))), backgroundColor: hexA(navy, .75) },
        { type: 'bar', label: '올해 연말 예측', order: 2, grouped: false, borderRadius: 4, maxBarThickness: 34, $pop: true,
          data: xs.map(y => y === y0 ? OL.v[0] : null), valueLabels: xs.map(y => y === y0 ? fmt(OL.v[0], 0) : null), legendColor: hexA(PRED_COLOR, .45),
          backgroundColor: hexA(PRED_COLOR, .28), borderColor: hexA(PRED_COLOR, .95), borderWidth: 1.5 },
        ...olBars(OL, xs, l0, 34),
        { type: 'line', label: '자체 목표', order: 1, data: xs.map(ownOf), borderColor: TEAL, backgroundColor: TEAL, borderWidth: 2, pointRadius: pts, pointHoverRadius: 4, tension: 0 },
        { type: 'line', label: '법적 목표', order: 1, data: law.map(l => l && !l.tent ? l.t : null), borderColor: AMBER, backgroundColor: AMBER,
          borderWidth: 2, borderDash: [6, 4], pointRadius: 0, pointHoverRadius: 3, tension: 0 },
        { type: 'line', label: '법적 목표 31년~ (미확정)', order: 1, data: lawTent, legendColor: hexA(AMBER, .45), $noTip: law.map(l => !l?.tent),
          borderColor: hexA(AMBER, .6), backgroundColor: hexA(AMBER, .6), borderWidth: 1.5, borderDash: [2, 4], pointRadius: 0, pointHoverRadius: 3, tension: 0 },
        ...(SOL ? [{ type: 'line', label: '만약에', order: 0, data: xs.map(y => y >= y0 ? sAt(y) : null), borderColor: VIO(), backgroundColor: VIO(),
          borderWidth: 2.5, borderDash: [5, 4], pointRadius: pts, pointHoverRadius: 4, tension: 0 }] : []),
      ]);
    }
    if (!OL) { $('o-ghg-tbl').innerHTML = ''; return; }
    const dTxt = d => Math.abs(d) < 0.05 ? '그대로' : `${d < 0 ? '▼' : '▲'}${t1(Math.abs(d))}`;
    $('o-ghg-tbl').innerHTML = '<thead><tr><th>연도</th><th>전망 배출량 <small>tCO₂eq</small></th>' + (SOL ? '<th class="o-sc">만약에</th>' : '') +
      '<th>법적 목표 <small>배출허용량 · 권장감축률</small></th><th>자체 목표 <small>NIA 로드맵</small></th></tr></thead><tbody>' +
      OL.ys.map((y, i) => {
        const v = OL.v[i], lo = lawOf(y), own = ownOf(y), sv = SOL ? SOL.v[i] : null;
        return `<tr class="${[y === 2030 || y === OUTLOOK.to ? 'ol-end' : '', OL_MS(y) ? '' : 'o-x'].join(' ').trim()}" data-rmpop="ghg:${y}" tabindex="0" title="누르면 ${yrShort(y)} 계산 근거">` +
          `<td class="ol-y">${yrShort(y)}${y === y0 ? ' <small>연말 예측</small>' : ''}</td><td class="num">${t1(v)}</td>` +
          (SOL ? `<td class="num o-sc">${t1(sv)}<small class="ol-x">${dTxt(sv - v)}</small></td>` : '') +
          `<td><span class="ol-t num">${lo ? t1(lo.t) : '—'}${lo ? `<small>${fmt(lo.rate, 1)}%${lo.tent ? ' 미확정' : ''}</small>` : ''}</span>${olVerdict(v, lo?.t ?? null, true, t1, !!lo?.tent)}</td>` +
          `<td><span class="ol-t num">${own == null ? '—' : t1(own)}</span>${olVerdict(v, own, true, t1)}</td></tr>`; }).join('') + '</tbody>';
  }
  // ③ RE100 (대구+제주 합산) — 실적 · 올해 연말 예측 · 전망(빗금) + 정부 목표 + 만약에
  function renderORe(ROL, SROL, sc) {
    const y0 = new Date().getFullYear(), c = CHARTS.o?.re, RS = TARGET_SITES.re, p1 = v => `${fmt(v, 1)}%`;
    const G = cssVar('--chart-re-goal'), AMBER = cssVar('--chart-law');
    const xs = []; for (let y = y0 - 2; y <= OUTLOOK.to; y++) xs.push(y);
    const MS = y => y === y0 - 1 || y === y0 || y === 2030 || y === 2040 || y === 2050;
    const act = y => y < y0 ? reOfYear(y, RS) : null, pAt = (o, y) => o?.rows.find(r => r.y === y)?.pct ?? null;
    const sol = ROL?.sol, plans = solarPlans(RS), capOf = i => sol ? +sumBy(sol.per, p => p.cap[i]).toFixed(3) : 0;
    $('o-re-site').textContent = `${sitesLabel(RS)} · (자가발전 + 구매) ÷ 총 전력`;
    $('o-re-note').innerHTML = !ROL ? '' : esc(`한전 전력은 최근 추세 · 태양광은 설비 용량대로 · 구매는 올해 ${kwhK(ROL.buy)} kWh 그대로 · 연도를 누르면 계산 근거`) +
      (sc ? ` <span class="o-scn">보라 점선 = 만약에 (${esc(scTxt(sc))})</span>` : '');
    $('o-re-pv').innerHTML = `<span class="olpv-k">${icn('sun')} 태양광 설비</span><span class="olpv-v">${esc(solarLine(RS, ymNow()) || '없음')}</span>` +
      (sol?.yAvg ? `<span class="olpv-s">1kW당 연 ${fq(Math.round(sol.yAvg))} kWh</span>` : '') +
      `<span class="olpv-s">${plans.length ? `증설 예정 ${esc(plans.join(' · '))}` : '증설 예정 없음'}</span>` +
      '<button type="button" class="cs-go" data-go="manage" data-sub="settings" data-scroll="solar-card" data-need="admin">설비·증설 입력 →</button>';
    if (c) {
      c.data.labels = xs.map(yrShort);
      const goal = xs.map(reGoalOf), all = [...xs.map(act), ...(ROL?.rows || []).map(r => r.pct), ...(SROL?.rows || []).map(r => r.pct), 100].filter(v => v != null);
      // 0~100% 눈금 (위쪽 여백은 막대 값 자리) — 만약에로 100%를 넘으면 그만큼 늘림
      Object.assign(c.options.scales.y, { max: Math.max(112, Math.ceil(Math.max(...all) / 20) * 20 + 12), afterBuildTicks: ax => { ax.ticks = ax.ticks.filter(t => t.value <= ax.max - 12 + 1e-9); } });
      setChart(c, 'o-chart-re', 'o-re-empty', !ROL ? [] : [
        { type: 'bar', label: 'RE100 이행률', order: 2, grouped: false, borderRadius: 4, maxBarThickness: 34, legendColor: G, data: xs.map(act),
          valueLabels: xs.map(y => act(y) == null ? null : MS(y) ? p1(act(y)) : ''), backgroundColor: hexA(G, .75) },
        { type: 'bar', label: '올해 연말 예측', order: 2, grouped: false, borderRadius: 4, maxBarThickness: 34, $pop: true,
          data: xs.map(y => y === y0 ? pAt(ROL, y) : null), valueLabels: xs.map(y => y === y0 && pAt(ROL, y) != null ? p1(pAt(ROL, y)) : null),
          legendColor: hexA(PRED_COLOR, .45), backgroundColor: hexA(PRED_COLOR, .28), borderColor: hexA(PRED_COLOR, .95), borderWidth: 1.5 },
        ...olBars({ ys: ROL.ys, v: ROL.rows.map(r => r.pct) }, xs, (y, v) => MS(y) ? p1(v) : '', 34),
        { type: 'line', label: '정부 이행 목표', order: 1, data: goal, spanGaps: true, legendColor: AMBER, borderColor: AMBER, backgroundColor: AMBER,
          borderWidth: 2, borderDash: [6, 4], pointRadius: goal.map(v => v == null ? 0 : 3), tension: 0, markFmt: v => `${v}%`,
          markIdx: xs.map((y, i) => y === 2030 || y === 2050 ? i : -1).filter(i => i >= 0) },
        ...(SROL ? [{ type: 'line', label: '만약에', order: 0, data: xs.map(y => y >= y0 ? pAt(SROL, y) : null), borderColor: VIO(), backgroundColor: VIO(),
          borderWidth: 2.5, borderDash: [5, 4], pointRadius: xs.map(y => y === 2030 || y === 2040 || y === 2050 ? 3 : 0), pointHoverRadius: 4, tension: 0 }] : []),
      ]);
    }
    if (!ROL) { $('o-re-tbl').innerHTML = ''; return; }
    const dTxt = d => Math.abs(d) < 0.05 ? '그대로' : `${d > 0 ? '▲' : '▼'}${fmt(Math.abs(d), 1)}%p`;
    $('o-re-tbl').innerHTML = '<thead><tr><th>연도</th><th>태양광 설비 <small>연말</small></th><th>전망 이행률</th>' + (SROL ? '<th class="o-sc">만약에</th>' : '') +
      '<th>정부 목표</th><th>목표까지 더 필요한 재생에너지 <small>연간</small></th></tr></thead><tbody>' +
      ROL.rows.map((r, i) => { const cap = capOf(i), up = +(cap - capOf(0)).toFixed(3), kw = needKw(r.need, sol), gl = r.goal ?? r.ref, sp = SROL ? SROL.rows[i]?.pct : null;
        const how = [kw ? `태양광이면 약 ${fq(kw)}kW` : '', ROL.buy > 0 ? `구매면 올해의 ${fmt(r.need / ROL.buy, 1)}배` : ''].filter(Boolean).join(' · ');
        return `<tr class="${[r.y === 2030 || r.y === OUTLOOK.to ? 'ol-end' : '', OL_MS(r.y) ? '' : 'o-x'].join(' ').trim()}" data-rmpop="re:${r.y}" tabindex="0" title="누르면 ${yrShort(r.y)} 계산 근거">` +
          `<td class="ol-y">${yrShort(r.y)}${r.y === y0 ? ' <small>연말 예측</small>' : ''}</td>` +
          `<td class="num">${fq(cap)} <small>kW</small>${up > 0 ? `<small class="ol-x">+${fq(up)}kW 증설</small>` : ''}</td>` +
          `<td class="num">${r.pct == null ? '—' : p1(r.pct)}</td>` +
          (SROL ? `<td class="num o-sc">${sp == null ? '—' : p1(sp)}${sp != null && r.pct != null ? `<small class="ol-x">${dTxt(sp - r.pct)}</small>` : ''}</td>` : '') +
          `<td><span class="ol-t num">${gl == null ? '—' : `${gl}%`}${r.goal == null && r.ref != null ? '<small>참고</small>' : ''}</span>${olVerdict(r.pct, gl, false, v => `${fmt(v, 1)}%p`, r.goal == null)}</td>` +
          `<td class="num">${gl == null ? '—' : !(r.need > 0) ? '<span class="ol-v ok">✓ 충분</span>'
            : `<b>${kwhK(r.need)} kWh</b>${how ? `<small class="ol-x">${how}</small>` : ''}`}</td></tr>`; }).join('') + '</tbody>';
  }
  // ④ 에너지원별 — 쌓은 막대 (지난 2년 실적 · 올해 연말 예측 · ~30년 해마다 · 그 뒤 5년마다) + 표 (올해 · 추세 · 30 · 40 · 50년)
  function renderOSrc(OL) {
    const y0 = new Date().getFullYear(), c = CHARTS.o?.src, S = TARGET_SITES.ghg;
    const years = [...new Set([y0 - 2, y0 - 1, ...(OL?.ys || []).filter(OL_MS)])].filter(y => y <= OUTLOOK.to).sort((a, b) => a - b);
    const act = (y, t) => { const rs = energyRecs.filter(r => S.includes(r.site) && r.type === t && r.date?.startsWith(String(y))); return rs.length ? sumBy(rs, r => +r.amount || 0) : null; };
    if (c) {
      c.data.labels = years.map(yrShort);
      setChart(c, 'o-chart-src', 'o-src-empty', !OL ? [] : OL.per.map(p => {
        const col = typeCol(p.t), amt = years.map(y => y < y0 ? act(y, p.t) : p.v[p.ys.indexOf(y)]);
        return { type: 'bar', label: p.t, $type: p.t, $amt: amt, legendColor: col, data: amt.map(a => a == null ? null : calcGHG(p.t, a)),
          // 실적 = 채운 막대 · 올해 연말 예측·전망 = 옅게 채우고 테두리
          backgroundColor: years.map(y => y < y0 ? col : hexA(col, y === y0 ? .32 : .2)),
          borderColor: years.map(y => y < y0 ? col : hexA(col, .9)), borderWidth: years.map(y => y < y0 ? 0 : 1.2),
          borderSkipped: false, borderRadius: 2, maxBarThickness: 40 };
      }));
    }
    if (!OL) { $('o-src-tbl').innerHTML = ''; return; }
    const cols = [2030, 2040, 2050].filter(y => OL.ys.includes(y)), iE = OL.ys.indexOf(OUTLOOK.to);
    const tot = i => sumBy(OL.per, p => calcGHG(p.t, p.v[i])), totE = tot(iE);
    $('o-src-tbl').innerHTML = `<thead><tr><th>에너지원</th><th>${yrShort(y0)} 연말 예측</th><th>최근 추세 <small>연평균 · 해마다 약해짐</small></th>` +
      cols.map(y => `<th>${yrShort(y)} 전망</th>`).join('') + `<th>${yrShort(OUTLOOK.to)} 비중</th></tr></thead><tbody>` +
      OL.per.map(p => { const u = esc(GHG[p.t].unit), cell = i => { const sol = p.solar?.[i] > 0 ? p.solar[i] : 0;
          return `<td class="num">${fmt(calcGHG(p.t, p.v[i]), 1)}<small class="ol-x">${fq(Math.round(p.v[i]))} ${u}${sol ? ` (태양광 −${fq(Math.round(sol))})` : ''}</small></td>`; };
        return `<tr><td class="ol-k"><i style="background:${typeCol(p.t)}"></i>${esc(p.t)}</td>${cell(0)}` +
          `<td class="num ${p.gc < 0 ? 'good' : p.gc > 0 ? 'bad' : ''}" title="${p.from ? `${yrShort(p.from)} → ${yrShort(y0)} 연평균` : '비교할 지난 해 자료 없음'}${p.capped ? ` · 실제 ${olArrow(p.g)} (연 ±${OUTLOOK.cap}%로 묶음)` : ''}">` +
            `${p.from ? olArrow(p.gc) : '—'}${p.capped ? ' <small>상한</small>' : ''}</td>` +
          cols.map(y => cell(OL.ys.indexOf(y))).join('') +
          `<td class="num">${totE > 0 ? fmt(calcGHG(p.t, p.v[iE]) / totE * 100, 0) : '—'}%</td></tr>`; }).join('') +
      `<tr class="sum-row"><td>합계 <small>tCO₂eq</small></td><td class="num">${fmt(tot(0), 1)}</td><td></td>${cols.map(y => `<td class="num">${fmt(tot(OL.ys.indexOf(y)), 1)}</td>`).join('')}<td class="num">100%</td></tr></tbody>`;
  }
  /* 🧮 만약에 — 태양광 더 설치 · 재생에너지 구매량 · 에너지 절감 (저장 안 됨 · 이 화면에서만)
     sc = { pv: { site, kw, from: 'YYYY-01' }, buy: { kwh, from }, cut: { pct, from } } — 없는 칸은 null · 모두 비면 null */
  function wiFill(ROL) {
    const y0 = new Date().getFullYear(), ys = []; for (let y = y0 + 1; y <= OUTLOOK.to; y++) ys.push(y);
    ['wi-pv-y', 'wi-buy-y', 'wi-cut-y'].forEach(id => { const s = $(id); if (s.dataset.y0 === String(y0)) return;
      const v = s.value; s.innerHTML = ys.map(y => `<option value="${y}">${yrShort(y)}</option>`).join('');
      s.value = ys.includes(+v) ? v : String(y0 + 1); s.dataset.y0 = String(y0); });
    const ps = $('wi-pv-site');
    if (!ps.options.length) ps.innerHTML = TARGET_SITES.re.map(s => `<option value="${esc(s)}">${esc(SITE_SHORT[s] || s)}</option>`).join('');
    const buy = ROL?.buy ?? 0;
    $('wi-buy').placeholder = fq(Math.round(buy));
    $('wi-buy-now').textContent = `지금 연 ${kwhK(buy)} kWh (${sitesLabel(TARGET_SITES.re)})`;
    // 칸마다 무엇이 바뀌나 — 온실가스 목표는 대구본원만 · 구매는 RE100에만 (온실가스 감축으로 치지 않음)
    const ghgSite = TARGET_SITES.ghg.includes($('wi-pv-site').value);
    $('wi-pv-scope').textContent = ghgSite ? '온실가스 · RE100 · 경영평가' : `RE100만 (온실가스 목표는 ${TARGET_SITES.ghg.map(s => SITE_SHORT[s] || s).join('·')}만)`;
    $('wi-buy-scope').textContent = 'RE100 · 경영평가 에너지 보완 (온실가스는 그대로)';
    $('wi-cut-scope').textContent = '온실가스 · RE100 · 경영평가';
  }
  function wiRead() {
    const num = id => { const v = $(id).value.trim(); return v === '' || !isFinite(+v) ? null : +v; };
    const kw = num('wi-pv-kw'), buy = num('wi-buy'), cut = num('wi-cut');
    const sc = { pv: kw > 0 ? { site: $('wi-pv-site').value, name: '만약에', kw, from: `${$('wi-pv-y').value}-01` } : null,
                 buy: buy != null && buy >= 0 ? { kwh: buy, from: +$('wi-buy-y').value } : null,
                 cut: cut > 0 ? { pct: Math.min(cut, 90), from: +$('wi-cut-y').value } : null };
    $('wi-st').textContent = sc.pv || sc.buy || sc.cut ? '보라색 점선·칸 = 만약에 · 아래 그래프와 표에도 나와요' : '';
    return sc.pv || sc.buy || sc.cut ? sc : null;
  }
  function renderWiOut(sc, OL, ROL, SOL, SROL, EVB, EVS) {
    const box = $('o-wi-out'), y0 = new Date().getFullYear();
    if (!sc) { box.innerHTML = '<p class="o-wi-empty">칸에 값을 넣으면 지금 전망과 나란히 보여 줘요 — 예) 태양광 100kW · 에너지 3% 절감</p>'; return; }
    if (!OL && !ROL) { box.innerHTML = '<p class="o-wi-empty">전망을 낼 자료가 없어요</p>'; return; }
    const t1 = v => fmt(v, 1), p1 = v => `${fmt(v, 1)}%`;
    const gAt = (o, y) => { const i = o ? o.ys.indexOf(y) : -1; return i < 0 ? null : o.v[i]; }, rAt = (o, y) => o?.rows.find(r => r.y === y)?.pct ?? null;
    const eAt = (L, y) => L?.find(r => r.y === y), eY = [y0 + 1, 2030].filter((y, i, a) => a.indexOf(y) === i && EVB.some(r => r.y === y));
    const rows = [];
    // 값 줄 — a = 지금 전망 · b = 만약에 · lower = 낮을수록 좋음 · goal = 견줄 목표 (gk 이름 · gf 글자) · du = 차이 단위
    const vRow = (k, a, b, f, lower, goal, gk, du, gf = f) => rows.push({ k, a, b, cells: [a, b].map(v => v == null ? '—'
        : `${f(v)}${goal == null ? '' : ` ${(lower ? v <= goal : v >= goal) ? '<span class="ol-v ok">✓</span>' : '<span class="ol-v no">✗</span>'}`}`),
      d: a == null || b == null ? '' : Math.abs(b - a) < 0.05 ? '그대로' : `<span class="${(b < a) === lower ? 'good' : 'bad'}">${b > a ? '▲' : '▼'}${fmt(Math.abs(b - a), 1)}${du}</span>`,
      g: goal == null ? '' : `${gk} ${gf(goal)}` });
    if (OL) [2030, 2050].filter(y => OL.ys.includes(y)).forEach(y => vRow(`${icn('factory')} ${yrShort(y)} 온실가스 <small>tCO₂eq</small>`, gAt(OL, y), gAt(SOL, y), t1, true, ownOf(y), '자체 목표', 't', v => `${t1(v)}t`));
    if (OL) { const a = olFirstMiss(OL.ys, OL.v, ownOf), b = SOL ? olFirstMiss(SOL.ys, SOL.v, ownOf) : null, f = y => y == null ? '50년까지 안 넘음' : `${yrShort(y)}부터`;
      rows.push({ k: icn('factory') + ' 자체 목표를 처음 넘는 해', cells: [f(a), f(b)], g: '',
        d: a === b ? '그대로' : b == null || (a != null && b > a) ? `<span class="good">${b == null ? '안 넘음' : `${b - a}년 늦춤`}</span>` : `<span class="bad">${a == null ? '넘게 됨' : `${a - b}년 당김`}</span>` }); }
    if (ROL) [2030, 2050].forEach(y => { const r = ROL.rows.find(x => x.y === y); if (r) vRow(`${icn('sun')} ${yrShort(y)} RE100 이행률`, rAt(ROL, y), rAt(SROL, y), p1, false, r.goal ?? r.ref, r.goal == null ? '목표(참고)' : '정부 목표', '%p', v => `${fq(v)}%`); });
    if (ROL) { const r = ROL.rows.find(x => x.y === 2030), z = SROL?.rows.find(x => x.y === 2030), nd = v => v == null ? '—' : v > 0 ? `${kwhK(v)} kWh` : '<span class="ol-v ok">✓ 충분</span>';
      if (r && r.goal != null) { const a = r.need || 0, b = z ? z.need || 0 : null;
        rows.push({ k: `${icn('sun')} 30년 ${r.goal}%까지 남는 양`, g: '연간 재생에너지', cells: [nd(r.need), nd(z?.need)],
          d: b == null ? '' : Math.abs(b - a) < 1 ? '그대로' : `<span class="${b < a ? 'good' : 'bad'}">${b < a ? '▼' : '▲'}${kwhK(Math.abs(b - a))} kWh</span>` }); } }
    eY.forEach(y => { const a = eAt(EVB, y), b = eAt(EVS, y);
      if (a?.ready && b?.ready) vRow(`${icn('file')} 계량 점수 <small>${yrShort(y)}분 · ${yrShort(y + 1)} 평가</small>`, a.got, b.got, v => fmt(v, 1), false, null, '', '점'); });
    box.innerHTML = '<div class="table-wrap"><table class="main-tbl ol-tbl o-wi-tbl"><thead><tr><th>무엇이</th><th>지금 전망</th><th class="o-sc">만약에</th><th>달라지는 것</th></tr></thead><tbody>' +
      rows.map(r => `<tr><td class="ol-k">${r.k}${r.g ? `<small class="ol-x">${r.g}</small>` : ''}</td><td class="num">${r.cells[0]}</td><td class="num o-sc">${r.cells[1]}</td><td class="num">${r.d}</td></tr>`).join('') +
      '</tbody></table></div>' + (sc.pv && !TARGET_SITES.ghg.includes(sc.pv.site) ? `<p class="o-foot">${esc(SITE_SHORT[sc.pv.site] || sc.pv.site)} 태양광은 RE100에만 반영돼요 — 온실가스 목표는 대구본원 기준</p>` : '');
  }
  /* 🎯 목표에 맞춰 넣기 — 다른 만약에 칸은 그대로 두고 이 칸 하나만 얼마면 되는지
     RE100 = 30년 정부 목표 (태양광 = 고른 거점 · 30년 내내 가동 · 구매 = 지금 구매량 + 모자란 양)
     온실가스 = 고른 해부터 50년까지 해마다 자체 목표 안 (전력·도시가스·지역난방 절감률을 반으로 나눠 찾음) */
  function wiFitCalc(sc) {
    const y0 = new Date().getFullYear(), yT = 2030, out = {};
    const drop = k => { const o = { pv: sc?.pv || null, buy: sc?.buy || null, cut: sc?.cut || null }; o[k] = null; return o.pv || o.buy || o.cut ? o : null; };
    const rowT = R => R?.rows.find(x => x.y === yT);
    if (yT > y0) {
      try { const r = rowT(reOutlook(drop('pv'))), site = $('wi-pv-site').value, yl = sumArr(solarYields(trainYearsFor(y0))(site).yl);
        if (r?.goal != null) out.pv = { kw: r.need > 0 && yl > 0 ? Math.ceil(r.need / yl) : 0, site, goal: r.goal, yl }; } catch (e) { console.warn('[목표에 맞춰: 태양광]', e); }
      try { const r = rowT(reOutlook(drop('buy')));
        if (r?.goal != null) out.buy = { kwh: r.need > 0 ? Math.ceil((r.buy + r.need) / 100) * 100 : 0, goal: r.goal }; } catch (e) { console.warn('[목표에 맞춰: 구매]', e); }
    }
    try {
      const G = ghgOutlook(drop('cut')), from = +$('wi-cut-y').value;
      if (G) {
        const ok = c => G.ys.every((y, i) => { const t = ownOf(y); if (t == null || y < from) return true;
          const v = sumBy(G.per, p => { let u = p.tv[i] * (c > 0 && SC_CUT_TYPES.includes(p.t) ? 1 - c / 100 : 1);
            if (p.t === '전력' && G.sol) u -= Math.min(Math.max(0, G.sol.extra[i]), u); return calcGHG(p.t, u); });
          return v <= t + 1e-9; });
        if (ok(0)) out.cut = { pct: 0 };
        else if (!ok(90)) out.cut = { pct: null };
        else { let lo = 0, hi = 90; for (let k = 0; k < 24; k++) { const m = (lo + hi) / 2; if (ok(m)) hi = m; else lo = m; } out.cut = { pct: Math.ceil(hi * 10) / 10 }; }
      }
    } catch (e) { console.warn('[목표에 맞춰: 절감]', e); }
    return out;
  }
  function renderWiFit(sc) {
    const f = wiFitCalc(sc), site = esc(SITE_SHORT[$('wi-pv-site').value] || $('wi-pv-site').value), b = [];
    if (f.pv) b.push(f.pv.kw > 0 ? `<button type="button" class="o-fit" data-fit="pv" data-v="${f.pv.kw}">${icn('sun')} 30년 RE100 ${f.pv.goal}% → 태양광 ${site} <b>${fq(f.pv.kw)}kW</b>` +
        `<small class="n">${site} 1kW당 연 ${fq(Math.round(f.pv.yl))}kWh 기준</small></button>`
      : `<span class="o-fit done">${icn('sun')} 30년 RE100 ${f.pv.goal}% ✓ 지금으로 충분</span>`);
    if (f.buy && f.buy.kwh > 0) b.push(`<button type="button" class="o-fit" data-fit="buy" data-v="${f.buy.kwh}">${icn('leaf')} 30년 RE100 ${f.buy.goal}% → 구매 연 <b>${kwhK(f.buy.kwh)} kWh</b></button>`);
    if (f.cut) b.push(f.cut.pct == null ? '<span class="o-fit hard">' + icn('bolt') + ' 50년까지 자체 목표 → 절감만으로는 어려워요 (90% 넘게 필요)</span>'
      : f.cut.pct === 0 ? '<span class="o-fit done">' + icn('bolt') + ' 50년까지 자체 목표 ✓ 지금으로 지켜요</span>'
      : `<button type="button" class="o-fit${f.cut.pct > 30 ? ' hard' : ''}" data-fit="cut" data-v="${f.cut.pct}">${icn('bolt')} 50년까지 자체 목표 → 절감 <b>${fq(f.cut.pct)}%</b>` +
        `${f.cut.pct > 30 ? '<small>절감만으로는 현실적으로 어려워요</small>' : ''}</button>`);
    $('wi-fit').innerHTML = b.join('') || '<span class="o-wi-empty">맞춰 넣을 목표가 없어요</span>';
  }
  // 📥 전망 CSV — 연도마다 온실가스·RE100 전망과 목표 (만약에가 켜져 있으면 그 값도) · 엑셀 한글 호환
  function exportOutlook() {
    const L = olLast, base = L?.OL || L?.ROL;
    if (!base) { showToast('내보낼 전망이 없어요', 'err'); return; }
    const { OL, ROL, SOL, SROL, sc } = L, y0 = new Date().getFullYear(), n = (v, d) => v == null || !isFinite(v) ? '' : (+v).toFixed(d);
    const head = ['연도', '구분', '온실가스 전망(tCO2eq)', '법적 목표(tCO2eq)', '권장감축률(%)', '법적 목표 상태', '자체 목표(tCO2eq)', '자체 목표 판정',
      'RE100 전망(%)', 'RE100 목표(%)', 'RE100 목표 구분', '목표까지 더 필요한 재생에너지(kWh)', '태양광 설비(kW·연말)', ...(sc ? ['만약에 온실가스(tCO2eq)', '만약에 RE100(%)'] : [])];
    const rows = base.ys.map((y, i) => { const lo = lawOf(y), own = ownOf(y), v = OL?.v[i], r = ROL?.rows[i];
      return [y, y === y0 ? '연말 예측' : '전망', n(v, 3), n(lo?.t, 3), n(lo?.rate, 2), lo ? (lo.tent ? '미확정(참고)' : '확정') : '', n(own, 3),
        v == null || own == null ? '' : v <= own ? '지킴' : '초과',
        n(r?.pct, 2), r ? (r.goal ?? r.ref ?? '') : '', r ? (r.goal != null ? '정부 목표' : r.ref != null ? '참고(30·50년을 이은 값)' : '') : '',
        r?.need != null ? Math.ceil(r.need) : '', ROL?.sol ? n(sumBy(ROL.sol.per, p => p.cap[i]), 3) : '',
        ...(sc ? [n(SOL?.v[i], 3), n(SROL?.rows[i]?.pct, 2)] : [])]; });
    const meta = [[`NIA 환경경영 전망 (${new Date().toLocaleDateString('ko-KR')} 기준) · 온실가스 = ${sitesLabel(TARGET_SITES.ghg)} Scope 1+2 · RE100 = ${sitesLabel(TARGET_SITES.re)} · ${yrShort(y0)} = 연말 예측 · 그 뒤 = 최근 추세(해마다 약해짐)`],
      ...(sc ? [[`만약에: ${scTxt(sc)}`]] : [])];
    const csv = [...meta, head, ...rows].map(row => row.map(x => `"${String(x ?? '').replace(/"/g, '""')}"`).join(',')).join('\n');
    const url = URL.createObjectURL(new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8;' }));
    const a = document.createElement('a');
    a.href = url; a.download = `NIA_전망_${y0}-${OUTLOOK.to}_${new Date().toISOString().slice(0, 10)}.csv`; a.click();
    URL.revokeObjectURL(url);
    showToast(`${icn('download')} ${rows.length}개 연도 내보내기 완료`);
  }
  // 셈 방법 — 숫자는 지금 설정값으로
  function renderOHow(ROL) {
    const y0 = new Date().getFullYear(), d = OUTLOOK.damp, sol = ROL?.sol;
    const seq = [0, 1, 2, 3].map(k => fq(+(5 * Math.pow(d, k)).toFixed(1))).join(' → ');
    const lim = g => fmt(Math.abs(olMult(g, 200) - 1) * 100, 0);   // 끝까지 갔을 때 모두 합친 증감
    const items = [
      ['출발점', `${yrShort(y0)} 연말 예측 = 입력된 실적 + 남은 달 예측 (최근 2년 같은 달 평균 · 전력·도시가스·지역난방은 그 달 날씨로 보정) — 몇 년 뒤 날씨는 알 수 없어 여기부터는 추세로 이어 봐요`],
      ['추세', `에너지원마다 최근 ${OUTLOOK.span}년 연평균 증감률 (${yrShort(y0 - OUTLOOK.span)}~${yrShort(y0)} · 12달이 다 있는 해만) — 한 해 ±${OUTLOOK.cap}% 안으로 묶어요`],
      ['감쇠', `추세의 힘은 해마다 ${fmt((1 - d) * 100, 0)}%씩 약해져요 — 한 해 5% 줄던 항목은 ${seq}% … 로 줄어 끝까지 가도 모두 합쳐 약 ${lim(-0.05)}% · 상한 ${OUTLOOK.cap}%로 줄던 항목도 약 ${lim(-OUTLOOK.cap / 100)}%까지만 (사용량이 끝없이 줄거나 늘지 않게)`],
      ['태양광', `자가발전 = 1kW당 발전량 × 설비 용량 — 1kW당 발전량은 ${trainYearsFor(y0).map(yrShort).join('·')} 실적 ÷ 그 달 용량 (달마다)${sol?.yAvg ? ` · 지금 연 ${fq(Math.round(sol.yAvg))} kWh/kW` : ''} · 증설은 가동 시작 달부터 · 늘어난 발전량만큼 한전 전력이 줄어요 (건물이 쓰는 전기 총량은 그대로)`],
      ['그대로 두는 것', '재생에너지 구매량(올해 양) · 배출계수 · 기준배출량(설정값) · 건물·인원 — 바뀌면 전망도 바뀌어요'],
      ['목표', '자체 목표 = NIA 2050 로드맵 · 법적 목표 = 기준배출량 × (1 − 권장감축률), 31~50년은 아직 정해지지 않은 참고값 · RE100 = 정부 이행 목표 (26~30년 · 50년 100%, 31~49년은 30년과 50년을 이은 참고값)'],
      ['만약에', '태양광은 고른 해 1월부터 · 구매량은 고른 해부터 그 양으로 (경영평가 점수에서는 본사 구매로 봄) · 절감은 전력·도시가스·지역난방을 고른 해부터 그만큼 덜 씀 — 저장되지 않아요'],
      ['한계', '날씨·인원·설비 교체 같은 변화는 몰라요 — “지금처럼 가면”의 값이고, 실적이 들어올 때마다 다시 셈해요'],
    ];
    $('o-how').innerHTML = items.map(([k, v]) => `<li><b>${esc(k)}</b><span>${esc(v)}</span></li>`).join('');
  }
  function drawGhgRoadmap(path, path50, ids, y, pred, OL) {
    const [pathId, pathEmpty, path50Id, path50Empty, milesId, peekId] = ids;
    const curYr = new Date().getFullYear(), navy = cssVar('--chart-actual'), years = pastYears();
    const TEAL = cssVar('--chart-own'), AMBER = cssVar('--chart-law'), hasPred = pred > 0;
    const act = yy => +yy < curYr && dgbOf(yy) > 0 ? dgbOf(yy) : null;
    const predBar = (xs, thick) => !hasPred ? [] : [{ type: 'bar', label: '올해 연말 예측', order: 2, grouped: false, borderRadius: 4, maxBarThickness: thick, $pop: true,
      data: xs.map(yy => +yy === curYr ? pred : null), legendColor: hexA(PRED_COLOR, .45),
      backgroundColor: hexA(PRED_COLOR, .28), borderColor: hexA(PRED_COLOR, .95), borderWidth: 1.5 }];
    const base = xs => { const d = xs.map(y => baseOf(y)), one = new Set(d.filter(v => v != null)).size === 1;   // 보이는 해의 기준배출량이 하나면 값도 이름표에
      // 꺾이는 곳 = 앞 해와 기준배출량이 달라지는 해 · 그 해 점 위에 전년 대비 증감률 (예: ▲3.2%)
      const prevOf = i => i > 0 ? d[i - 1] : baseOf(+xs[0] - 1);
      const bend = d.map((v, i) => { const p = prevOf(i); return v != null && p != null && p > 0 && Math.abs(v - p) > 1e-9 ? fmtPct((v - p) / p * 100) : null; });
      // 꺾이는 곳 중 기준배출량이 가장 높은(제일 솟아오른) 한 곳에만 표시
      const peak = bend.reduce((best, t, i) => t && (best < 0 || d[i] > d[best]) ? i : best, -1);
      return { type: 'line', label: '기준배출량', order: 3, data: d, stepped: 'middle', refLabel: one ? `기준배출량 ${fmt(d.find(v => v != null), 1)}` : '기준배출량 (연도별)',
      markIdx: peak >= 0 ? [peak] : [], markLabels: bend, markColor: cssVar('--chart-label'),
      borderColor: cssVar('--chart-ghost'), backgroundColor: cssVar('--chart-ghost'), borderWidth: 1.5, borderDash: [2, 3], pointRadius: 0, pointHoverRadius: 0, tension: 0 }; };
    // 2030 중기: 연도별 실적(막대) vs 자체·법적 목표(선) · 기준배출량은 막대가 아니라 기준선(회색 점선 · 해마다 조정된 값이라 계단 모양)
    //  기준배출량이 바뀌는 해(점선이 꺾이는 곳)에 전년 대비 증감률 % · 표시 기간은 제목 옆에서 고름
    const xsAll = [], first = Math.min(2024, ...years.map(Number));
    for (let yy = first; yy <= Math.max(2030, curYr); yy++) xsAll.push(String(yy));
    const xs = clipRange(xsAll, 'mid');

    if (path) path.data.labels = xs.map(yrShort);
    setChart(path, pathId, pathEmpty, [
      base(xs),
      { type: 'bar', label: '배출 실적', order: 2, grouped: false, borderRadius: 4, maxBarThickness: 44, legendColor: navy, data: xs.map(act),
        backgroundColor: xs.map(yy => hasPred ? hexA(navy, .75) : yy === String(y) ? navy : hexA(navy, .5)) },
      ...predBar(xs, 44),
      { type: 'line', label: '자체 배출목표', order: 1, data: xs.map(yy => ROADMAP[yy]?.target ?? null),
        borderColor: TEAL, backgroundColor: TEAL, borderWidth: 2, pointRadius: 3, tension: 0 },
      { type: 'line', label: '법적 배출목표', order: 1,
        data: xs.map(yy => tgtOf(yy, 'law')),
        borderColor: AMBER, backgroundColor: AMBER, borderWidth: 2, borderDash: [6, 4], pointRadius: 3, tension: 0 },
      ...olBars(OL && { ys: OL.ys, v: OL.v }, xs),
    ]);
    // 2050 장기: 목표 배출량(면) + 기준선 + 연도별 실적(막대), 30·40·50년 목표에 값 표시
    //  법적 목표선: 확정(~30년)은 주황 점선 · 31년~ 미확정 참고값은 흐린 잔 점선 (30년 점에서 이어 그림) · 40년 값 표시
    const ysAll = [], MS = new Set(['2030', '2040', '2050']);
    for (let yy = first; yy <= Math.max(2050, ...Object.keys(ROADMAP).map(Number)); yy++) ysAll.push(String(yy));
    const ys = clipRange(ysAll, 'long');
    // 미확정 선은 이웃한 확정 값(예: 30년)까지 이어 그림 · 확정 값이 홀로 떨어져 있으면(앞뒤가 미확정) 점으로 보여 줌
    const law = ys.map(yy => lawOf(yy)), conf = i => !!law[i] && !law[i].tent;
    const lawTent = law.map((l, i) => l && (l.tent || law[i - 1]?.tent || law[i + 1]?.tent) ? l.t : null);
    if (path50) path50.data.labels = ys.map(yrShort);
    setChart(path50, path50Id, path50Empty, [
      base(ys),
      { type: 'bar', label: '배출 실적', order: 2, grouped: false, borderRadius: 4, maxBarThickness: 14, legendColor: navy, data: ys.map(act), backgroundColor: navy },
      ...predBar(ys, 14),
      { type: 'line', label: '자체 배출목표', order: 1, data: ys.map(yy => ROADMAP[yy]?.target ?? null), legendColor: TEAL,
        markIdx: ys.map((yy, i) => MS.has(yy) ? i : -1).filter(i => i >= 0),
        borderColor: TEAL, backgroundColor: hexA(TEAL, .12), fill: 'origin', borderWidth: 2, tension: 0,
        pointRadius: ys.map(yy => MS.has(yy) ? 4 : 0), pointBackgroundColor: TEAL },
      { type: 'line', label: '법적 배출목표', order: 1, data: law.map((l, i) => conf(i) ? l.t : null), legendColor: AMBER,
        borderColor: AMBER, backgroundColor: AMBER, borderWidth: 2, borderDash: [6, 4], tension: 0,
        pointRadius: law.map((l, i) => conf(i) && !conf(i - 1) && !conf(i + 1) ? 3 : 0), pointHoverRadius: 3 },
      { type: 'line', label: '법적 목표 31년~ (미확정)', order: 1, data: lawTent, legendColor: hexA(AMBER, .45),
        $noTip: law.map(l => !l?.tent),   // 30년 이음점은 확정선과 겹치므로 툴팁에서 뺌
        markIdx: ys.map((yy, i) => yy === '2040' && lawTent[i] != null ? i : -1).filter(i => i >= 0),
        markLabels: lawTent.map(v => v == null ? null : `${fmt(v, 1)} (미확정)`), markBelow: true, markColor: hexA(AMBER, .85),
        borderColor: hexA(AMBER, .6), backgroundColor: hexA(AMBER, .6), borderWidth: 1.5, borderDash: [2, 4], pointRadius: 0, pointHoverRadius: 3, tension: 0 },
      ...olBars(OL && { ys: OL.ys, v: OL.v }, ys, () => '', 14),
    ]);
    renderRangePick('h-rng-mid', 'mid', xsAll);
    renderRangePick('h-rng-long', 'long', ysAll);
    renderRoadmapMilestones(milesId, y, hasPred ? pred : null, peekId);
  }
  // RE100 이행 로드맵 (고른 거점) — 2030 중기: 연도별 이행률(막대) vs 정부 이행 목표(선) · 2050 장기: 100%까지의 경로
  //  지난 연도: 고른 연도(y) 막대를 진하게 · 올해: 연말 예측(pred)을 연한 막대로
  const reIds = P => P === 'h' ? ['h-chart-re-path', 'h-cre-empty', 'h-chart-re-path50', 'h-cre50-empty', 'h-re-miles', 'h-re-peek']
    : [P + 'chart-re-path', P + 'cre-empty', P + 'chart-re-path50', P + 'cre50-empty', P + 're-miles', P + 're-peek'];
  const reOfYear = (y, site) => re100Of(yearStat(String(y), Array.isArray(site) ? site : [site]));   // 여러 거점이면 합산 이행률
  function drawReRoadmap(re, re50, ids, y, site, pred, ROL) {
    const [pathId, pathEmpty, path50Id, path50Empty, milesId, peekId] = ids;
    const curYr = new Date().getFullYear(), hasPred = pred != null;
    const G = cssVar('--chart-re-goal'), AMBER = cssVar('--chart-law');
    const act = yy => +yy < curYr ? reOfYear(yy, site) : null, pctL = v => v == null ? null : `${fmt(v, 1)}%`;
    const first = Math.min(2024, ...pastYears().map(Number)), xs = [], ys = [];
    for (let yy = first; yy <= Math.max(2030, curYr); yy++) xs.push(String(yy));
    for (let yy = first; yy <= 2050; yy++) ys.push(String(yy));
    const predBar = (arr, thick) => !hasPred ? [] : [{ type: 'bar', label: '올해 연말 예측', order: 2, grouped: false, borderRadius: 4, maxBarThickness: thick, $pop: true,
      data: arr.map(yy => +yy === curYr ? pred : null), valueLabels: arr.map(yy => +yy === curYr ? pctL(pred) : null), legendColor: hexA(PRED_COLOR, .45),
      backgroundColor: hexA(PRED_COLOR, .28), borderColor: hexA(PRED_COLOR, .95), borderWidth: 1.5 }];
    const goal = (arr, extra) => ({ type: 'line', label: '정부 이행 목표', order: 1, data: arr.map(reGoalOf), spanGaps: true, legendColor: AMBER,
      borderColor: AMBER, backgroundColor: AMBER, borderWidth: 2, pointRadius: arr.map(yy => reGoalOf(yy) != null ? 3 : 0), tension: 0, markFmt: v => `${v}%`, ...extra });
    // 2030 중기
    const actX = xs.map(act);
    if (re) re.data.labels = xs.map(yrShort);
    setChart(re, pathId, pathEmpty, [
      { type: 'bar', label: 'RE100 이행률', order: 2, grouped: false, borderRadius: 4, maxBarThickness: 44, legendColor: G, data: actX, valueLabels: actX.map(pctL),
        backgroundColor: xs.map(yy => hasPred ? hexA(G, .75) : yy === String(y) ? G : hexA(G, .5)) },
      ...predBar(xs, 44),
      goal(xs, { borderDash: [6, 4], markIdx: xs.map((yy, i) => reGoalOf(yy) != null ? i : -1).filter(i => i >= 0) }),
      ...olBars(ROL && { ys: ROL.ys, v: ROL.rows.map(r => r.pct) }, xs, (y, v) => `${fmt(v, 1)}%`),
    ]);
    // 2050 장기: 목표 경로(면) + 연도별 이행률 · 30·50년 목표 값 표시
    if (re50) re50.data.labels = ys.map(yrShort);
    setChart(re50, path50Id, path50Empty, [
      { type: 'bar', label: 'RE100 이행률', order: 2, grouped: false, borderRadius: 4, maxBarThickness: 14, legendColor: G, data: ys.map(act), valueLabels: ys.map(yy => pctL(act(yy))), backgroundColor: G },
      ...predBar(ys, 14),
      goal(ys, { fill: 'origin', backgroundColor: hexA(AMBER, .06), pointBackgroundColor: AMBER,
                 markIdx: ys.map((yy, i) => yy === '2030' || yy === '2050' ? i : -1).filter(i => i >= 0) }),
      ...olBars(ROL && { ys: ROL.ys, v: ROL.rows.map(r => r.pct) }, ys, () => '', 14),
    ]);
    renderReMilestones(milesId, peekId, y, site, pred);
  }
  // RE100 이정표: 고른 연도 실적(또는 올해 연말 예측) → 다음 목표 → 2030년 60% → 2050년 100% (얼마나 더 올려야 하는지 함께)
  function renderReMilestones(boxId, peekId, y, site, pred) {
    const isPred = pred != null, yy0 = isPred ? new Date().getFullYear() : +y, v = isPred ? pred : reOfYear(y, site);
    const g = reGoalOf(yy0), yS = yrShort(yy0), what = isPred ? '연말 예측' : '실적';
    const box = (cls, k, val, sub, extra = '', tone = '') => `<div class="rm-ms ${cls}"><span class="rm-k">${k}</span><b>${val}</b>` +
      `<span class="rm-sub">${sub}</span>${extra ? `<span class="rm-sub2 ${tone}">${extra}</span>` : ''}</div>`;
    const ok = v != null && g != null && v >= g;
    const ms = [box(v == null ? 'base' : g == null ? 'now' : ok ? 'now' : 'over', `${yS} ${what}`, v == null ? '—' : `${fmt(v, 1)}%`,
      g == null ? `정부 이행 목표는 ${yrShort(RE_FIRST)}부터` : `${yS} 정부 목표 ${g}%`,
      v == null ? '-' : g == null ? '' : ok ? `✓ 목표 달성${isPred ? ' 전망' : ''}` : `✗ 목표까지 ${fmt(g - v, 1)}%p${isPred ? ' (전망)' : ''}`,
      v == null || g == null ? '' : ok ? 'good' : 'bad')];
    const next = Object.keys(RE_GOAL).map(Number).sort((a, b) => a - b).find(gy => gy > yy0);
    [next, 2030, 2050].filter((gy, i, a) => gy && gy > yy0 && a.indexOf(gy) === i).forEach(gy => {
      const need = v != null ? RE_GOAL[gy] - v : null;
      ms.push(box('goal amber', `${gy}년 목표`, `${RE_GOAL[gy]}%`, gy === 2050 ? 'RE100 완전 이행' : '정부 기준 이행 목표',
        need == null ? '' : need > 0 ? `${yS} ${what}에서 +${fmt(need, 1)}%p` : `${yS} ${what}이 이미 목표 이상`));
    });
    $(boxId).innerHTML = ms.join('<span class="rm-arrow" aria-hidden="true">→</span>');
    if (!peekId || !$(peekId)) return;
    $(peekId).innerHTML = (v == null ? `${yS} -` : `${yS} ${what} <b>${fmt(v, 1)}%</b>` +
      (g == null ? ` · 정부 목표는 ${yrShort(RE_FIRST)}부터` : ok ? ` · <span class="good">✓ 목표 ${g}% 달성${isPred ? ' 전망' : ''}</span>`
                                                             : ` · <span class="bad">✗ 목표 ${g}%까지 ${fmt(g - v, 1)}%p</span>`)) +
      ` · 2030년 목표 <b>${RE_GOAL[2030]}%</b>`;
  }
  // 월별 패턴 비교: 고른 항목(온실가스·에너지원·용수)의 월별(또는 누적) 값 — 고른 연도까지 최근 4개년, 고른 연도는 굵게
  function renderMonthly(chart, years, si, fy) {
    const sel = $('h-cmp-etype');
    [...sel.options].forEach(o => { o.hidden = o.disabled = (o.value !== 'ghg' && itemNA(si, o.value)) || (o.classList.contains('v2-opt') && !v2); });
    if (sel.selectedOptions[0]?.disabled) sel.value = 'ghg';   // 고른 거점에서 쓰지 않는 항목이면 온실가스로
    $('h-cum-seg').querySelectorAll('button').forEach(b => b.setAttribute('aria-pressed', String((b.dataset.cum === '1') === histCum)));
    const t = sel.value, isGhg = t === 'ghg', isWater = t === WATER, unit = isGhg ? 'tCO₂eq' : isWater ? '㎥' : GHG[t]?.unit || '';
    const mine = r => !si || r.site === si;
    const monthly = yy => isGhg ? monthlySum(energyRecs.filter(r => r.date?.startsWith(yy) && mine(r) && isEmit(r.type)), r => r.ghg)
      : isWater ? m12(i => { const rs = metricRecs.filter(r => r.item === WATER && r.period === `${yy}-${pad(i + 1)}` && mine(r)); return rs.length ? sumBy(rs, r => r.value) : null; })
      : monthlySum(energyRecs.filter(r => r.date?.startsWith(yy) && r.type === t && mine(r)), r => r.amount);
    const cum = arr => { let acc = 0; return arr.map(v => v == null ? null : (acc += v)); };
    // 비교할 연도: 이 항목에 자료가 있는 연도 중 기간(시작 ~ 끝)으로 고름 (기본 = 고른 연도까지 최근 4개년 · 고른 연도는 항상 포함)
    const data = Object.fromEntries(years.map(yy => [yy, monthly(yy)]));
    const avail = years.filter(yy => data[yy].some(v => v != null));
    const recent = years.filter(yy => +yy <= +fy && avail.includes(yy)).slice(-4);
    if (histMonYrs && !(avail.includes(histMonYrs.from) && avail.includes(histMonYrs.to))) histMonYrs = null;   // 항목을 바꿔 그 해 자료가 없으면 기본으로
    const rng = histMonYrs || { from: recent[0] ?? fy, to: recent[recent.length - 1] ?? fy };
    const ys = avail.filter(yy => +yy >= +rng.from && +yy <= +rng.to).concat([fy])
      .filter((yy, i, a) => a.indexOf(yy) === i).sort();
    const isAll = !!histMonYrs && rng.from === avail[0] && rng.to === avail[avail.length - 1];
    // 연도마다 색을 다르게 · 점은 모두 네모 · 고른 연도 = 주황 굵은 선 · 그 전 해부터 파랑 → 보라 → 청록 → …
    //  어두운 화면에서 눈부시지 않게 채도·밝기를 낮춘 차분한 색
    const { PICK, PAST, NEXT } = YEAR_COLS;
    const colOf = yy => { const d = +fy - +yy; return d === 0 ? PICK : d > 0 ? PAST[(d - 1) % PAST.length] : NEXT[(-d - 1) % NEXT.length]; };
    const styleOf = yy => ({ c: colOf(yy), shape: 'rect' });
    // 비교 연도: [최근 4년] [전체] 바로가기 + 기간(시작 ~ 끝) 선택 — 연도마다 버튼을 두지 않아 한 줄로 끝남
    const opt = sel => avail.map(yy => `<option value="${yy}"${yy === sel ? ' selected' : ''}>${yrShort(yy)}</option>`).join('');
    const outside = +fy < +rng.from || +fy > +rng.to;
    $('h-mon-now').textContent = `비교 연도 ${ys.map(yrShort).join(' · ')}`;
    $('h-mon-yrs').innerHTML = '<span class="yc-lbl">비교 연도</span>' +
      `<button type="button" data-preset="recent" aria-pressed="${!histMonYrs}">최근 4년</button>` +
      `<button type="button" data-preset="all" aria-pressed="${isAll}">전체 (${avail.length}개년)</button><span class="yc-sep"></span>` +
      `<span class="yc-range${histMonYrs && !isAll ? ' on' : ''}"><select data-end="from" aria-label="비교 시작 연도">${opt(rng.from)}</select> ~ ` +
      `<select data-end="to" aria-label="비교 끝 연도">${opt(rng.to)}</select></span>` +
      (outside ? `<span class="yc-hint">+ 고른 연도 ${yrShort(fy)}</span>` : '');
    const qty = t === RE_SELF ? '발전량' : t === SAVE_REGEN ? '회생 전력량' : '사용량';   // 재생에너지는 쓰는 게 아니라 만든 양
    $('h-ce-title').textContent = `월별 ${isGhg ? '온실가스 배출' : `${t} ${qty}`}${histCum ? ' (누적)' : ''} 연도별 비교 (${unit})`;
    // CSV: 지금 차트에 보이는 그대로 (거점 · 항목 · 비교 연도 · 월별/누적) — 행 = 1~12월, 열 = 연도
    const shown = Object.fromEntries(ys.map(yy => [yy, histCum ? cum(data[yy]) : data[yy]]));
    const cell = v => v == null ? '' : +(+v).toFixed(isGhg ? 3 : 2);
    const mRows = MONTHS.map((m, i) => [m, ...ys.map(yy => cell(shown[yy][i]))]);
    if (!histCum) mRows.push(['합계', ...ys.map(yy => data[yy].some(v => v != null) ? cell(sumBy(data[yy].filter(v => v != null), v => v)) : '')]);
    histExports.monthly = { prefix: '실적조회', head: ['월', ...ys.map(yy => `${yy}년 (${unit})`)], rows: mRows,
      name: [si || '전체거점', isGhg ? '온실가스' : t, histCum ? '월별누적' : '월별', ys.length > 1 ? `${ys[0]}-${ys[ys.length - 1]}` : ys[0]]
        .map(s => String(s).replace(/[\\/:*?"<>|\s]+/g, '')).join('_') };
    $('h-mon-note').innerHTML = `${esc(si || '전체 거점')} · ${ys.length}개 연도 비교<span class="hd-legend"> · 굵은 주황 선 = 고른 연도(${yrShort(fy)})</span>`;
    if (chart) chart.options.scales.y.title.text = isGhg ? unit : `${unit} (${t})`;
    setChart(chart, 'h-chart-energy', 'h-ce-empty', ys.map((yy, i) => { const d = data[yy]; return {
      label: yy === fy ? `${yrShort(yy)} (고른 연도)` : yrShort(yy), data: histCum ? cum(d) : d, ...(({ c, shape }) => ({
        borderColor: c, backgroundColor: c, pointBackgroundColor: c, pointBorderColor: c, legendColor: c, pointStyle: shape })) (styleOf(yy)),
      $year: +yy, $type: isGhg || isWater ? null : t, $unit: unit,   // 툴팁(사용량 + tCO₂eq)·누르면 그 달 자료
      borderWidth: yy === fy ? 3 : 1.75, pointRadius: yy === fy ? 3.5 : 2.5, pointHoverRadius: 5, order: yy === fy ? 0 : 1,
      tension: .3, fill: false, spanGaps: true }; }));
  }
  // 배출 구성: 왼쪽 = 연도별 온실가스 (Scope별 · 에너지원별 · 거점별로 쌓음 — 모든 연도 같은 색, 고른 연도는 뒤에 띠 + 굵은 눈금)
  //  오른쪽 = 고른 연도의 거점별 온실가스(Scope 1+2) · 폐기물 발생량 — 세 거점을 한 줄씩 (막대 · 값 · 비중 · 전년 대비, 누르면 그 거점 자료)
  function renderMixCharts(set, years, S, si, fy, py) {
    const navy = cssVar('--chart-actual'), S3C = cssVar('--chart-s3');
    const by = histMixBy === 'site' && si ? 'scope' : histMixBy;   // 거점별로 쌓기는 전체 합계에서만
    $('h-mix-note').textContent = `${yrShort(fy)} 기준 · 막대나 줄을 누르면 그 해 월별 자료`;
    $('h-cs-title').innerHTML = `연도별 온실가스 배출<small>${esc(si || '전체 거점')} · tCO₂eq</small>`;
    const segSite = $('h-cs-by').querySelector('[data-v="site"]');
    segSite.hidden = !!si;
    $('h-cs-by').querySelectorAll('button[data-v]').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.v === by)));
    const fi = years.indexOf(fy), { tick } = chartTheme();
    if (set.scope) {
      set.scope.data.labels = years.map(yrShort);
      set.scope.options.plugins.colBand = { idx: fi, color: null,
                                            line: hexA(PRED_COLOR, .9) };
      Object.assign(set.scope.options.scales.x.ticks, { color: c => c.index === fi ? cssVar('--chart-label-strong') : tick,
                                                         font: c => ({ size: 12, weight: c.index === fi ? '700' : '400' }) });
    }
    const bar = (label, data, c, extra = {}) => ({ label, data, backgroundColor: c, legendColor: c, borderRadius: 4, maxBarThickness: 56, ...extra });
    const GK = { '전력': 'elec', '도시가스': 'gas', '지역난방': 'heat', '휘발유': 'gasoline', '경유': 'diesel' };
    const s3 = bar(by === 'scope' ? 'Scope 3' : '폐기물 (Scope 3)', years.map(yy => S[yy].s3), S3C);   // 쌓은 합계는 나눠 보는 방식과 관계없이 같음
    setChart(set.scope, 'h-chart-scope', 'h-cs-empty',
      by === 'type' ? [...EMIT_TYPES.filter(t => !itemNA(si, t)).map(t => bar(t, years.map(yy => S[yy].g[GK[t]]), typeCol(t), { $type: t, $amt: years.map(yy => S[yy][GK[t]]) })), s3]
      : by === 'site' ? [...SITES.map(s => bar(s, years.map(yy => ghgOfStat(yearStat(yy, [s]))), SITE_COL[s], { $site: s })), s3]
      : [bar('Scope 1', years.map(yy => S[yy].months ? S[yy].s1 : null), cssVar('--chart-s1')), bar('Scope 2', years.map(yy => S[yy].months ? S[yy].s2 : null), navy), s3]);
    // 거점별 온실가스 · 폐기물: 세 거점 (고른 거점이 있으면 그 줄을 강조)
    const cmp = py ? ` · ▲▼ ${yrShort(py)} 대비` : '';
    $('h-csi-title').textContent = `거점별 온실가스 배출 · ${yrShort(fy)}`;
    $('h-csi-note').textContent = `세 거점 · Scope 1+2 · tCO₂eq${cmp}`;
    const ghgAt = (y, s) => y ? ghgOfStat(yearStat(y, [s])) : null;
    $('h-site-rows').innerHTML = siteRowsHtml(s => ghgAt(fy, s), s => ghgAt(py, s),
      { unit: 't', unitFull: 'tCO₂eq', head: '배출량', sel: si, py, what: `${yrShort(fy)} 월별 에너지 자료`, empty: `${yrShort(fy)} 에너지 자료가 없어요` });
    $('h-cw-title').textContent = `폐기물 발생량 · ${yrShort(fy)}`;
    $('h-cw-note').textContent = `세 거점 · 종량제 봉투 기준 · ton${cmp}`;
    $('h-ws-rows').innerHTML = siteRowsHtml(s => wasteYearTon(fy, [s]), s => py ? wasteYearTon(py, [s]) : null,
      { unit: 't', unitFull: 'ton', head: '발생량', sel: si, py, what: `${yrShort(fy)} 폐기물 봉투 자료`, empty: `${yrShort(fy)} 폐기물 자료가 없어요` });
  }
  // 거점 줄 HTML — v(s) = 고른 연도 값, p(s) = 전년 값 (늘면 빨강 · 줄면 초록) · 막대 = 가장 큰 거점 대비 길이 · 비중 = 세 거점 합계 중
  function siteRowsHtml(v, p, o) {
    const vals = Object.fromEntries(SITES.map(s => [s, v(s)])), prev = Object.fromEntries(SITES.map(s => [s, p(s)]));
    const has = SITES.filter(s => vals[s] != null);
    if (!has.length) return `<div class="chart-empty">${esc(o.empty)}</div>`;
    const tot = sumBy(has, s => vals[s]), max = Math.max(...has.map(s => vals[s]), 1e-9);
    const ptot = has.every(s => prev[s] != null) ? sumBy(has, s => prev[s]) : null;   // 전년 합계는 같은 거점끼리
    const dl = (c, q) => c == null || !(q > 0) ? '<span class="none">—</span>' : yoyPill({ v: (c - q) / q * 100 });
    return `<div class="srow-hd" aria-hidden="true"><span>거점</span><span></span><span>${o.head}</span><span>비중</span><span>${o.py ? `${yrShort(o.py)} 대비` : '전년 대비'}</span></div>` +
      '<ol class="srow-list">' + SITES.map(s => { const x = vals[s];
        return `<li><button type="button" class="srow${s === o.sel ? ' on' : ''}" data-site="${esc(s)}" title="${esc(`${s} ${o.what} 보기`)}">` +
          `<span class="srow-nm"><i class="sb-dot" style="background:${SITE_COL[s]}"></i>${s}</span>` +
          `<span class="srow-bar">${x != null ? `<i style="width:${(Math.max(0, x) / max * 100).toFixed(1)}%;background:${SITE_COL[s]}"></i>` : ''}</span>` +
          `<span class="srow-v">${x == null ? '—' : `${fq(x)}<small>${o.unit}</small>`}</span>` +
          `<span class="srow-sh">${x == null || !(tot > 0) ? '—' : `${fmt(x / tot * 100, 1)}%`}</span>` +
          `<span class="srow-dd">${dl(x, prev[s])}</span></button></li>`;
      }).join('') + '</ol>' +
      `<div class="srow-tot"><span>세 거점 합계</span><b>${fq(tot)}</b><span>${o.unitFull}</span>${o.py ? dl(tot, ptot) : ''}</div>`;
  }
  // 감축 로드맵 이정표: 기준배출량 → 기준 연도 실적(또는 올해 연말 예측) → 2030·2040·2050 목표 (2030까지 얼마나 남았는지 함께)
  function renderRoadmapMilestones(boxId, y, pred, peekId) {
    const isPred = pred != null, yy0 = isPred ? new Date().getFullYear() : +y, v = isPred ? pred : dgbOf(y);
    const t = ROADMAP[yy0]?.target, b = baseOf(yy0), what = isPred ? '예측' : '실적';
    const box = (cls, k, val, sub, extra = '', tone = '', tail = '') => `<div class="rm-ms ${cls}"><span class="rm-k">${k}</span><b>${val}</b>` +
      `<span class="rm-sub">${sub}</span>${extra ? `<span class="rm-sub2 ${tone}">${extra}</span>` : ''}${tail}</div>`;
    // 목표 상자 아래 법적 목표 (31년~ 미확정 참고값) · 자체 목표가 법적 목표보다 많으면 ⚠
    const lawLine = (yy, own) => { const l = lawOf(yy); if (!l) return '';
      return `<span class="rm-law${l.tent ? ' tent' : ''}">법적 ${fq(l.t)}t${l.tent ? ' (미확정)' : ''}</span>` +
        (own > l.t + 1e-9 ? `<span class="rm-law warn">⚠ 법적보다 ${fq(own - l.t)}t 많음</span>` : ''); };
    const ms = [box('base', `${yrShort(yy0)} 기준배출량`, b ? `${fq(b)}t` : '—', '그 해 적용값 · 감축의 출발점')];
    if (v > 0) ms.push(box(t && v > t ? 'over' : 'now', `${yrShort(yy0)} ${isPred ? '연말 예측' : '실적'}`, `${fq(v)}t`, !b ? '기준배출량 없음' : `기준 대비 ${v <= b ? '▼' : '▲'}${fmt(Math.abs(b - v) / b * 100, 1)}%`,
      !t ? '' : v <= t ? `✓ 목표(${fq(t)}t) 달성${isPred ? ' 전망' : ''}` : `✗ 목표보다 ${fq(v - t)}t ${isPred ? '많을 전망' : '많음'}`, !t ? '' : v <= t ? 'good' : 'bad'));
    [2030, 2040, 2050].forEach(yy => {
      const r = ROADMAP[yy]; if (!r) return;
      const need = yy === 2030 && v > 0 ? v - r.target : null;
      ms.push(box('goal', `${yy}년 목표`, `${fq(r.target)}t`, `기준 대비 ▼${fmt(ownRate(yy), 1)}%`,
        need == null ? '' : need > 0 ? `${yrShort(yy0)} ${what}에서 ${fq(need)}t 더 감축` : `${yrShort(yy0)} ${what}이 이미 목표 이하`, '', lawLine(yy, r.target)));
    });
    $(boxId).innerHTML = ms.join('<span class="rm-arrow" aria-hidden="true">→</span>');
    // 접었을 때 머리글에 보이는 한 줄 요약
    if (!peekId || !$(peekId)) return;
    const r30 = ROADMAP[2030], goal30 = r30 ? ` · 2030년 목표 <b>${fq(r30.target)}t</b>` : '';
    $(peekId).innerHTML = !(v > 0) ? (b ? `${yrShort(yy0)} 기준배출량 <b>${fq(b)}t</b>` : '기준배출량 없음') + goal30
      : `${yrShort(yy0)} ${isPred ? '연말 예측' : '실적'} <b>${fq(v)}t</b>` +
        (!t ? '' : v <= t ? ` · <span class="good">✓ 목표 ${fq(t)}t 달성${isPred ? ' 전망' : ''}</span>`
                          : ` · <span class="bad">✗ 목표보다 ${fq(v - t)}t ${isPred ? '많을 전망' : '많음'}</span>`) + goal30;
  }

  // 폐기물 감축 로드맵 차트 (고른 청사): 실적(막대) vs 목표(선) — 로드맵이 없으면 실적만
  // 폐기물 감축 로드맵 (세 거점 합산): 거점별로 쌓은 실적 막대 + 합산 감축 목표(선) · 기준연도 막대는 연하게
  const WRM_COL = SITE_COL;
  function renderWasteRoadmapChart(chart, years, sites, proj = null) {   // proj = 올해 연말 예측 (올해를 고를 때만)
    sites = Array.isArray(sites) ? sites : [sites];
    const rm = wasteRoadmap(sites), curYr = new Date().getFullYear(), wYears = years.filter(yy => wasteYearTon(yy, sites) != null);
    $('h-wrm-title').textContent = `폐기물 감축 로드맵 · ${sitesLabel(sites)} (ton)`;
    // 가로축 = 기준연도(또는 첫 자료) ~ 목표를 정한 마지막 해 (올해까지는 늘) — 목표를 안 정한 뒤쪽 해는 빈칸만 남아 그리지 않음
    let xs = wYears, lastT = null;
    if (rm) {
      const tYears = Object.keys(rm.rates).filter(y => rm.target(y) != null).map(Number);
      lastT = tYears.length ? Math.max(...tYears) : null;
      xs = []; for (let yy = Math.min(+rm.baseYear, ...wYears.map(Number)); yy <= Math.max(curYr, lastT || 0); yy++) xs.push(String(yy));
    }
    $('h-wrm-note').textContent = !v2 ? 'DB 설정 후 목표선 표시' : !rm ? '로드맵 미설정 (데이터 관리에서 설정)'
      : `기준 ${yrShort(rm.baseYear)}${rm.baseTon != null ? ` ${fq(rm.baseTon)}t (합산)` : ''} · 막대 = 거점별 실적` + (proj > 0 ? ` · 연한 막대 = ${yrShort(curYr)} 연말 예측` : '') +
        ((lastT || 0) < rmEnd() ? ` · ${yrShort(Math.max(curYr, lastT || 0) + 1)}부터 목표는 아직 정하지 않았어요` : '');
    if (chart) {
      chart.data.labels = xs.map(yrShort);
      chart.options.scales.x.stacked = true; chart.options.scales.y.stacked = true;   // 거점별로 쌓아 합계가 막대 높이
      chart.options.plugins.barLabels = { ...(chart.options.plugins.barLabels || {}), display: true, total: true };
    }
    setChart(chart, 'h-chart-wrm', 'h-cwr-empty', [
      ...sites.map(st => ({ type: 'bar', label: st, $site: st, stack: 'w', order: 2, borderRadius: 2, maxBarThickness: 40, legendColor: WRM_COL[st],
        data: xs.map(yy => +yy < curYr ? wasteYearTon(yy, [st]) : null),
        backgroundColor: xs.map(yy => rm && yy === rm.baseYear ? hexA(WRM_COL[st], .45) : WRM_COL[st]) })),
      ...(proj > 0 ? [{ type: 'bar', label: '올해 연말 예측', stack: 'w', order: 2, borderRadius: 2, maxBarThickness: 40, legendColor: hexA(PRED_COLOR, .45),
        data: xs.map(yy => +yy === curYr ? proj : null), backgroundColor: hexA(PRED_COLOR, .28), borderColor: hexA(PRED_COLOR, .95), borderWidth: 1.5 }] : []),
      ...(rm ? [{ type: 'line', label: '감축 목표 (합산)', stack: 'tgt', order: 1, data: xs.map(yy => yy === rm.baseYear ? rm.baseTon : rm.target(yy)),
        borderColor: cssVar('--chart-gov'), backgroundColor: cssVar('--chart-gov'), borderWidth: 2, pointRadius: 3, spanGaps: true }] : []),
    ]);
  }

  // 표의 에너지 칸 아래 온실가스 환산 (회생제동·자가발전은 회피 배출량) · CSV에는 '○○ 온실가스 환산' 행으로
  const co2Sub = (r, s) => { const g = r.co2?.(s); return g == null ? '' : `<div class="cmp-sub cmp-co2">${r.avoid ? '회피 ' : ''}${fq(g)} tCO₂eq</div>`; };
  const withCo2Rows = rows => rows.flatMap(r => !r.co2 ? [r] : [r, { label: `${r.label} 온실가스 환산${r.avoid ? ' (회피 배출량·참고)' : ''}`, unit: 'tCO₂eq',
    d: DQ, good: r.good, v: (s, y) => (r.v(s, y) == null ? null : r.co2(s)) }]);

  // 연도별 핵심 지표 표: 연도마다 값 + 전년 대비 증감(좋아지면 초록) · 추이 미니 선 · 고른 연도 열 강조 · CSV
  function renderHistCompareTable(years, S, si, T, fy) {
    years.forEach(y => { S[y].dgb = dgbOf(y); });
    const vsT = (s, y, k) => { const t = tgtOf(y, k); return (t && s.dgb > 0) ? s.dgb / t * 100 : null; };
    // good: 'down' = 줄면 좋음 / 'up' = 늘면 좋음, pp = 퍼센트포인트로 비교 · cd = CSV 소수 자릿수 (배출량은 보고서 기준 셋째 자리)
    const ROWS = [
      { label: '총 온실가스 (Scope 1+2)', unit: 'tCO₂eq', d: DQ, good: 'down', strong: true, v: s => ghgOfStat(s) },
      { label: 'Scope 1 (도시가스·차량연료)', unit: 'tCO₂eq', d: DQ, good: 'down', v: s => s.months ? s.s1 : null },
      { label: 'Scope 2 (전력·지역난방)', unit: 'tCO₂eq', d: DQ, good: 'down', v: s => s.months ? s.s2 : null },
      { label: 'Scope 3', unit: 'tCO₂eq', d: DQ, good: 'down', v: s => s.s3 },
      { label: '기준배출량 (그 해 적용값)', unit: 'tCO₂eq', d: DQ, ghg: true, nodelta: true, v: (s, y) => baseOf(y) },
      { label: '기준배출량 대비 감축률', unit: '%', d: 1, good: 'up', pp: true, ghg: true, v: (s, y) => s.dgb > 0 && baseOf(y) ? (baseOf(y) - s.dgb) / baseOf(y) * 100 : null },
      { label: '자체목표 대비 배출', unit: '%', d: 1, good: 'down', pp: true, ghg: true, target: 'own', v: (s, y) => vsT(s, y, 'own') },
      { label: '법적목표 대비 배출', unit: '%', d: 1, good: 'down', pp: true, ghg: true, target: 'law', v: (s, y) => vsT(s, y, 'law') },
      { label: '전력', unit: 'kWh', d: DQ, good: 'down', na: '전력', co2: s => s.g.elec, v: s => s.elec },
      { label: '도시가스', unit: 'Nm³', d: DQ, good: 'down', na: '도시가스', co2: s => s.g.gas, v: s => s.gas },
      { label: '지역난방', unit: 'GJ', d: DQ, good: 'down', na: '지역난방', co2: s => s.g.heat, v: s => s.heat },
      { label: '차량연료 (휘발유+경유)', unit: 'L', d: DQ, good: 'down', na: '휘발유', co2: s => s.g.fuel, v: s => s.fuel },
      { label: 'RE100 이행률', unit: '%', d: 1, good: 'up', pp: true, re: true, v: s => re100Of(s) },
      { label: '승강기 회생제동 발전량', unit: 'kWh', d: DQ, good: 'up', na: SAVE_REGEN, co2: s => s.g.regen, avoid: true, v: s => s.regen },
      { label: '폐기물 발생량', unit: 'ton', d: DQ, good: 'down', na: '폐기물', v: s => s.wTon },
      { label: '용수 사용량', unit: '㎥', d: DQ, good: 'down', na: WATER, v2: true, v: s => s.water },
      { label: '친환경차 전환율 (연말)', unit: '%', d: 1, good: 'up', pp: true, na: EV_ALL, v2: true, v: s => s.evRate },
    ].filter(r => (v2 || !r.v2) && (T.ghg || !r.ghg) && (T.re || !r.re) && !(r.na && allNA(si, r.na))   // 목표 행은 그 목표의 거점을 고를 때만
             && years.some(y => r.v(S[y], y) != null));                                                   // 어느 해에도 값이 없는 행은 뺌
    const fi = years.indexOf(fy), foc = y => y === fy ? ' cmp-focus' : '';
    const diffOf = (r, vals, i) => { const v = vals[i], pv = i > 0 ? vals[i - 1] : null;
      return v == null || pv == null ? null : r.pp ? v - pv : (pv !== 0 ? (v - pv) / Math.abs(pv) * 100 : null); };
    $('h-cmp-tbl').innerHTML =
      `<thead><tr><th>구분</th><th>단위</th><th class="cmp-sp">추이</th>${years.map(y => `<th class="cmp-val${foc(y)}">${yrLock(y)}` +
        `${y === fy ? '<div class="cmp-th-sub">고른 연도</div>' : S[y].months && S[y].months < 12 ? `<div class="cmp-th-sub">${S[y].months}개월</div>` : ''}</th>`).join('')}</tr></thead><tbody>` +
      ROWS.map(r => {
        const vals = years.map(y => r.v(S[y], y));
        return `<tr${r.strong ? ' class="cmp-strong"' : ''}><td>${r.label}</td><td class="cmp-unit">${r.unit}</td><td class="cmp-sp">${sparkSvg(vals, fi)}</td>` + years.map((y, i) => {
          const v = vals[i];
          if (v == null) return `<td class="cmp-val${foc(y)}"><span class="cmp-na">—</span></td>`;
          const goal = r.target ? `목표 ${fq(tgtOf(y, r.target))}t` : r.re && reGoalOf(y) != null ? `목표 ${reGoalOf(y)}%` : '';
          return `<td class="cmp-val${foc(y)}"><span class="num">${r.d === DQ ? fq(v) : fmt(v, r.d)}</span>` + (goal ? `<div class="cmp-sub">${goal}</div>` : '') +
            co2Sub(r, S[y]) + (r.nodelta ? '' : deltaHtml(diffOf(r, vals, i), r.pp ? '%p' : '%', r.good)) + '</td>';
        }).join('') + '</tr>';
      }).join('') + '</tbody>';
    $('h-cmp-note').textContent = `${si || '전체 거점'} · 증감 = 전년 대비 (초록 = 좋아짐) · 파란 열 = 고른 연도 · 에너지 칸 아래 = 온실가스 환산 (tCO₂eq)` + (T.ghg ? ' · 감축률·목표 행 = 대구본원 온실가스 감축 목표' : '');
    // 보고서용 CSV: 값 + 고른 연도 전년 대비 증감 (프로젝트 표기: ↑↓, %p) · 에너지 행 아래에 온실가스 환산 행
    histExports.compare = {
      name: '연도별비교',
      head: ['구분', '단위', ...years.map(yrShort), ...(fi > 0 ? [`${yrShort(fy)} 전년 대비`] : [])],
      rows: withCo2Rows(ROWS).map(r => {
        const vals = years.map(y => r.v(S[y], y)), diff = fi > 0 && !r.nodelta ? diffOf(r, vals, fi) : null;
        return [r.label, r.unit, ...vals.map(x => x == null ? '' : roundD(x, r.d)),
                ...(fi > 0 ? [diff == null ? '' : `${fmt(Math.abs(diff), 1)}${r.pp ? '%p' : '%'}${diff > 0 ? '↑' : diff < 0 ? '↓' : ''}`] : [])];
      }),
    };
  }

  // 그 해 자세히 · 거점별 표: 고른 연도의 세 거점 + 합계
  function renderHistSiteTable(y) {
    const cols = [...SITES.map(s => [s, [s]]), ['합계', SITES]], S = cols.map(([, sites]) => yearStat(y, sites));
    const ROWS = [
      { label: '총 온실가스 (Scope 1+2)', unit: 'tCO₂eq', d: DQ, strong: true, v: s => ghgOfStat(s) },
      { label: 'Scope 1 (도시가스·차량연료)', unit: 'tCO₂eq', d: DQ, v: s => s.months ? s.s1 : null },
      { label: 'Scope 2 (전력·지역난방)', unit: 'tCO₂eq', d: DQ, v: s => s.months ? s.s2 : null },
      { label: 'Scope 3', unit: 'tCO₂eq', d: DQ, v: s => s.s3 },
      { label: '전력', unit: 'kWh', d: DQ, co2: s => s.g.elec, v: s => s.elec },
      { label: '도시가스', unit: 'Nm³', d: DQ, co2: s => s.g.gas, v: s => s.gas },
      { label: '지역난방', unit: 'GJ', d: DQ, co2: s => s.g.heat, v: s => s.heat },
      { label: '휘발유', unit: 'L', d: DQ, co2: s => s.g.gasoline, v: s => s.gasoline },
      { label: '경유', unit: 'L', d: DQ, co2: s => s.g.diesel, v: s => s.diesel },
      { label: '재생에너지 자가발전', unit: 'kWh', d: DQ, co2: s => s.g.reSelf, avoid: true, v: s => s.reSelf },
      { label: '재생에너지 구매', unit: 'kWh', d: DQ, v: s => s.reBuy },
      { label: 'RE100 이행률', unit: '%', d: 1, v: s => re100Of(s) },
      { label: '승강기 회생제동 발전량', unit: 'kWh', d: DQ, co2: s => s.g.regen, avoid: true, v: s => s.regen },
      { label: '폐기물 발생량', unit: 'ton', d: DQ, v: s => s.wTon },
      { label: '용수 사용량', unit: '㎥', d: DQ, v2: true, v: s => s.water },
      { label: '업무용 차량 (연말)', unit: '대', d: 0, v2: true, v: s => s.evAll },
      { label: '친환경차 (연말)', unit: '대', d: 0, v2: true, v: s => s.evGreen },
      { label: '친환경차 전환율', unit: '%', d: 1, v2: true, v: s => s.evRate },
    ].filter(r => v2 || !r.v2);
    $('h-site-tbl').innerHTML =
      `<thead><tr><th>구분</th><th>단위</th>${cols.map(([n]) => `<th class="cmp-val">${n}</th>`).join('')}</tr></thead><tbody>` +
      ROWS.map(r => `<tr${r.strong ? ' class="cmp-strong"' : ''}><td>${r.label}</td><td class="cmp-unit">${r.unit}</td>${S.map(s => {
        const v = s.hasData ? r.v(s) : null;
        return `<td class="cmp-val">${v == null ? '<span class="cmp-na">—</span>' : `<span class="num">${r.d === DQ ? fq(v) : fmt(v, r.d)}</span>${co2Sub(r, s)}`}</td>`;
      }).join('')}</tr>`).join('') + '</tbody>';
    $('h-detail-note').textContent = `${yrShort(y)} ${isClosed(y) ? '확정 실적 [마감]' : '실적'} · 입력 ${S[S.length - 1].months}개월`;
    histExports.site = { name: `${y}년_거점별`, head: ['구분', '단위', ...cols.map(([n]) => n)],
      rows: withCo2Rows(ROWS).map(r => [r.label, r.unit, ...S.map(s => { const v = s.hasData ? r.v(s) : null; return v == null ? '' : roundD(v, r.d); })]) };
  }

  // 폐기물 청사×연도 (마감된 연도, 봉투 구입량 기준)
  function renderWasteMatrix(years) {
    const cell = (y, sites) => { const rs = wasteRecs.filter(r => r.date?.startsWith(y) && sites.includes(r.site));
      if (!rs.length) return '<span class="cmp-na">—</span>';
      const t = sumBy(rs, r => r.weightTon), tg = sumBy(rs, r => r.ghg || 0);
      return `<span class="num">${fq(t)}</span> t<div class="cmp-sub">${fq(tg)} tCO₂eq</div>`; };
    $('h-waste-tbl').innerHTML = !years.length ? '<tbody><tr><td class="table-empty">지난 연도 데이터가 없습니다</td></tr></tbody>' :
      `<thead><tr><th>청사</th>${years.map(y => `<th class="cmp-val">${yrLock(y)}</th>`).join('')}</tr></thead><tbody>` +
      [...SITES.map(s => [s, [s]]), ['합계', SITES]].map(([n, sites]) =>
        `<tr${n === '합계' ? ' class="cmp-strong"' : ''}><td>${n}</td>${years.map(y => `<td class="cmp-val">${cell(y, sites)}</td>`).join('')}</tr>`).join('') + '</tbody>';
  }

  // 폐기물 감축 로드맵: 기준연도 → 지난 연도 실적 vs 목표 → 앞으로의 목표 (올해 진행 상황은 '올해 현황')
  function renderWasteRoadmapTable(sites) {
    sites = Array.isArray(sites) ? sites : [sites];
    const tbl = $('h-rm-tbl'), note = $('h-rm-note'), msg = t => `<tbody><tr><td class="table-empty">${t}</td></tr></tbody>`;
    note.textContent = '';
    if (!v2) { tbl.innerHTML = msg('DB 설정을 한 번 하면 사용할 수 있어요 (방법: 데이터 입력 → 기타 지표)'); return; }
    const rm = wasteRoadmap(sites);
    if (!rm) { tbl.innerHTML = msg('감축 로드맵이 아직 없어요 · ' + (isAdmin() ? '데이터 관리 → 연도 마감·로드맵에서 기준연도와 연도별 목표를 정하세요' : '관리자가 기준연도와 연도별 목표를 정하면 보여요')); return; }
    const curYr = new Date().getFullYear(), cols = [];
    for (let y = +rm.baseYear; y <= rmEnd(); y++) cols.push(String(y));
    note.textContent = `${sitesLabel(sites)} · 종량제 봉투 구입량 기준 · 목표 = 기준연도 합산 발생량 × (1 − 감축률)`;
    const act = (y, ss = sites) => +y < curYr ? wasteYearTon(y, ss) : null;
    const na = '<span class="cmp-na">—</span>';
    const ROWS = [
      ['목표 감축률 (기준 대비)', '%', y => y === rm.baseYear ? '<span class="cmp-na">기준</span>' : rm.rates[y] != null ? fmt(rm.rates[y], 1) : na],
      ['목표 발생량 (합산)', 'ton', y => y === rm.baseYear ? (rm.baseTon != null ? fq(rm.baseTon) : na) : rm.target(y) != null ? fq(rm.target(y)) : na],
      ['실적 발생량 (합산)', 'ton', y => +y === curYr ? '<span class="cmp-na">진행 중</span>' : act(y) != null ? fq(act(y)) : na],
      ...sites.map(st => [`└ ${st}`, 'ton', y => +y === curYr ? '' : act(y, [st]) != null ? fq(act(y, [st])) : na, 'wrm-sub']),
      ['실적 감축률 (기준 대비)', '%', y => { const a = act(y); return (y !== rm.baseYear && a != null && rm.baseTon > 0) ? fmt((rm.baseTon - a) / rm.baseTon * 100, 1) : na; }],
      ['달성 여부', '', y => { const a = act(y), t = rm.target(y); return (a == null || t == null) ? na : a <= t ? '<span class="rm-ok">달성</span>' : '<span class="rm-over">미달</span>'; }],
    ];
    tbl.innerHTML = `<thead><tr><th>구분</th><th>단위</th>${cols.map(y => `<th class="cmp-val">${y === rm.baseYear ? `${yrShort(y)}<div class="cmp-th-sub">기준</div>` : +y === curYr ? `${yrShort(y)}<div class="cmp-th-sub">올해</div>` : yrLock(y)}</th>`).join('')}</tr></thead><tbody>` +
      ROWS.map(([label, unit, f, cls], i) => `<tr class="${[i === 1 ? 'cmp-strong' : '', cls || ''].join(' ').trim()}"><td>${label}</td><td class="cmp-unit">${unit}</td>${cols.map(y => `<td class="cmp-val">${f(y)}</td>`).join('')}</tr>`).join('') + '</tbody>';
  }

  // 온실가스 감축 로드맵 표 (대구본원): 연도마다 기준배출량 · 법적 목표(권장감축률·감축목표량·배출허용량) · 자체 목표(감축률·감축량·목표배출량) · 실적·달성
  //  31~50년 법적 목표 = 미확정 참고값 (흐린 기울임 · 달성 판정 안 함) · 31년 이후는 5년 단위만 보이고 '모두 보기'로 펼침
  //  고른 기준 연도 행 강조 · 올해 = 연말 예측(전망) · 기준배출량을 앞 연도 값으로 이어 쓰는 해는 흐리게
  let rmgAll = false;
  function renderGhgRoadmapTable(selY, pred) {
    const curYr = new Date().getFullYear(), sel = +selY, na = '<span class="cmp-na">—</span>';
    const ks = [...Object.keys(ghgBaseY), ...Object.keys(LAW_RATE), ...Object.keys(LAW_TENT), ...Object.keys(ROADMAP)].map(Number).filter(y => y > 1990);
    const ys = [];
    for (let y = Math.min(...ks); y <= Math.max(...ks); y++) ys.push(y);
    const fr = v => (+Number(v).toPrecision(12)).toLocaleString('ko-KR', { maximumFractionDigits: 2 });   // 감축률 %: 소수 둘째 자리까지 (끝의 0은 생략)
    const R = ys.map(y => {
      const b = baseOf(y), l = lawOf(y), own = ROADMAP[y]?.target ?? null, d = dgbOf(String(y));
      const a = y < curYr ? (d > 0 ? d : null) : y === curYr && pred > 0 ? pred : null;
      return { y, b, l, own, a, est: y === curYr, ownR: own != null && b ? (b - own) / b * 100 : null };
    });
    const strict = r => r.l && r.own != null && r.own > r.l.t + 1e-9;   // 자체 목표가 법적 목표보다 많은(덜 엄격한) 해
    const cross = R.find(strict), firstTent = R.find(r => r.l?.tent);
    const pill = (ok, est, who) => `<span class="gs-pill ${ok ? 'ok' : 'no'}${est ? ' est' : ''}" title="${who} 목표 ${ok ? '달성' : '미달'}${est ? ' 전망 (연말 예측)' : ''}">${who} ${ok ? '✓' : '✗'}</span>`;
    const judge = r => r.a == null ? (r.est ? '<span class="cmp-na">진행 중</span>' : na)
      : [r.l && !r.l.tent ? pill(r.a <= r.l.t, r.est, '법적') : '', r.own != null ? pill(r.a <= r.own, r.est, '자체') : ''].filter(Boolean).join(' ') || na;
    const n = (v, cls = '') => v == null ? na : `<span class="num${cls}">${fq(v)}</span>`;
    const body = R.map(r => {
      const far = r.y > Math.max(2030, curYr) && r.y % 5 !== 0 && r !== cross, tc = r.l?.tent ? ' rmg-tent' : '';
      const sep = r === firstTent ? `<tr class="rmg-sep"><td colspan="10"><span>${yrShort(r.y)}~ 법적 목표(권장감축률)는 미확정 참고값이에요 — 흐린 글씨 · 달성 판정에 쓰지 않아요</span></td></tr>` : '';
      const ownCell = r.own == null ? na : strict(r)
        ? `<span class="num rmg-warn" title="${esc(`법적 목표 ${fq(r.l.t)}t${r.l.tent ? ' (미확정)' : ''}보다 ${fq(r.own - r.l.t)}t 많아요`)}">⚠ ${fq(r.own)}</span>` : n(r.own);
      return sep + `<tr class="${[far ? 'rmg-far' : '', r.y === sel ? 'rmg-sel' : '', r.est ? 'rmg-cur' : ''].filter(Boolean).join(' ')}" data-year="${r.y}">` +
        `<td>${yrShort(r.y)}${isClosed(r.y) ? ' ' + icn('lock') : ''}${r.est ? '<div class="cmp-th-sub">올해</div>' : ''}</td>` +
        `<td class="cmp-val">${n(r.b)}</td>` +
        `<td class="cmp-val${tc}">${r.l ? `<span class="num">${fr(r.l.rate)}</span>` : na}</td>` +
        `<td class="cmp-val${tc}">${n(r.l?.cut)}</td>` +
        `<td class="cmp-val rmg-lawt${tc}">${n(r.l?.t)}</td>` +
        `<td class="cmp-val">${r.ownR == null ? na : `<span class="num">${fr(r.ownR)}</span>`}</td>` +
        `<td class="cmp-val">${n(r.own != null && r.b ? r.b - r.own : null)}</td>` +
        `<td class="cmp-val rmg-own">${ownCell}</td>` +
        `<td class="cmp-val">${r.a == null ? na : `${n(r.a)}${r.est ? '<div class="cmp-sub">연말 예측</div>' : ''}`}</td>` +
        `<td class="rmg-judge">${judge(r)}</td></tr>`;
    }).join('');
    const lb = $('rmap-ghg-long');
    lb.hidden = !R.some(r => r.y > Math.max(2030, curYr) && r.y % 5 !== 0 && r !== cross);
    lb.dataset.more = `${yrShort(Math.max(2030, curYr) + 1)}~ 모든 해 보기 ▾`;
    setRmgAll(rmgAll);
    $('rmap-ghg-note').textContent = `대구본원 · tCO₂eq · ${yrShort(ys[0])}~${yrShort(ys[ys.length - 1])}`;
    $('rmap-ghg-tbl').innerHTML =
      `<thead><tr><th rowspan="2">연도</th><th rowspan="2" class="cmp-val">기준배출량</th>` +
      `<th colspan="3" class="rmg-g law">법적 목표 <small>공공부문 권장감축률</small></th>` +
      `<th colspan="3" class="rmg-g own">자체 목표 <small>NIA 2050 로드맵</small></th>` +
      `<th colspan="2" class="rmg-g act">실적 <small>Scope 1+2</small></th></tr>` +
      `<tr><th class="cmp-val">권장감축률<div class="cmp-th-sub">%</div></th><th class="cmp-val">감축목표량</th><th class="cmp-val">배출허용량</th>` +
      `<th class="cmp-val">자체 감축률<div class="cmp-th-sub">%</div></th><th class="cmp-val">자체 감축량</th><th class="cmp-val">자체 목표배출량</th>` +
      `<th class="cmp-val">배출량</th><th>달성</th></tr></thead><tbody>${body}</tbody>`;
    const foot = ['※ 법적 목표: 감축목표량 = 기준배출량 × 권장감축률 · 배출허용량 = 기준배출량 − 감축목표량 | 자체 목표: 자체 감축량 = 기준배출량 − 자체 목표배출량 · 자체 감축률 = 자체 감축량 ÷ 기준배출량'];
    if (firstTent) foot.push(`※ ${yrShort(firstTent.y)}~ 권장감축률은 미확정 참고값이에요${forAdmin(" · 확정되면 데이터 관리 → 연도 마감·로드맵에서 값을 고치고 '미확정'을 눌러 확정으로 바꾸세요")}`);
    if (cross) { const last = R[R.length - 1];
      foot.push(`<b class="rmg-warn">⚠ ${yrShort(cross.y)}부터 법적 목표${cross.l.tent ? '(미확정)' : ''}가 자체 목표보다 엄격해요</b> — ${yrShort(cross.y)} 법적 ${fq(cross.l.t)}t · 자체 ${fq(cross.own)}t` +
        (last !== cross && last.l && last.own != null ? ` → ${yrShort(last.y)} 법적 ${fq(last.l.t)}t · 자체 ${fq(last.own)}t` : '') + ' · 법적 목표가 확정되면 자체 목표를 다시 볼 필요가 있어요'); }
    $('rmap-ghg-foot').innerHTML = foot.map(t => `<p>${t}</p>`).join('');
    // CSV: 모든 연도 · 법적 목표 상태(확정/미확정) 열
    histExports.ghgRoadmap = { name: '온실가스_감축로드맵', prefix: '목표로드맵',
      head: ['연도', '기준배출량(tCO₂eq)', '법적 목표 - 권장감축률(%)', '법적 목표 - 감축목표량(tCO₂eq)', '법적 목표 - 배출허용량(tCO₂eq)', '법적 목표 상태',
             '자체 목표 - 자체 감축률(%)', '자체 목표 - 자체 감축량(tCO₂eq)', '자체 목표 - 자체 목표배출량(tCO₂eq)', '배출 실적(tCO₂eq)', '비고'],
      rows: R.map(r => [r.y, r.b == null ? '' : roundD(r.b, DQ), r.l ? roundD(r.l.rate, 2) : '', r.l ? roundD(r.l.cut, DQ) : '', r.l ? roundD(r.l.t, DQ) : '',
        r.l ? (r.l.tent ? '미확정(참고)' : '확정') : '', r.ownR == null ? '' : roundD(r.ownR, 2), r.own != null && r.b ? roundD(r.b - r.own, DQ) : '',
        r.own == null ? '' : roundD(r.own, DQ), r.a == null ? '' : roundD(r.a, DQ),
        [r.est && r.a != null ? '연말 예측' : '', strict(r) ? '자체 목표가 법적 목표보다 많음' : ''].filter(Boolean).join(' · ')]) };
  }
  // 31년~ 모든 해 보기 / 5년 단위로 접기 (표를 다시 그리지 않고 행만 보이고 숨김)
  function setRmgAll(on) {
    rmgAll = on;
    const lb = $('rmap-ghg-long');
    $('rmap-ghg-tbl').classList.toggle('show-all', on);
    lb.setAttribute('aria-expanded', String(on));
    lb.textContent = on ? '5년 단위로 접기 ▴' : lb.dataset.more || '모든 해 보기 ▾';
  }
  $('rmap-ghg-long').addEventListener('click', () => setRmgAll(!rmgAll));
  $('rmap-ghg-export').addEventListener('click', () => exportHistory('ghgRoadmap'));
  $('h-mon-export').addEventListener('click', () => exportHistory('monthly'));

  // 실적 조회 표 CSV 내보내기 (엑셀 한글 호환)
  function exportHistory(kind) {
    const histExport = histExports[kind];
    if (!histExport) { showToast('내보낼 표가 없습니다', 'err'); return; }
    const csv = [histExport.head, ...histExport.rows].map(row => row.map(v => `"${String(v ?? '').replace(/"/g, '""')}"`).join(',')).join('\n');
    const url = URL.createObjectURL(new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' }));
    const a = document.createElement('a');
    a.href = url; a.download = `NIA_${histExport.prefix || '실적조회'}_${histExport.name}_${new Date().toISOString().slice(0, 10)}.csv`; a.click();
    URL.revokeObjectURL(url);
    showToast(`${icn('download')} ${histExport.rows.length}행 내보내기 완료`);
  }

