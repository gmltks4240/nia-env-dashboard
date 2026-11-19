/* js/home.js (5/9) — 메인 — 경영평가 계량·비계량 점수 · 진입 연출
   한 덩어리였던 js/app.js 를 순서 그대로 나눈 것. 파일들은 index.html 에 적힌 순서(core → … → main)로 불러오고,
   최상위 const·let·function 은 모든 파일이 함께 쓴다. 새 파일을 만들면 index.html 에도 넣을 것. */
  /* ── 메인 화면 ──────────────────────────────────────────────
     보직자가 한눈에 보도록: ① 올해 경영평가 전망(계량·비계량) ② 지금 해야 할 일 ③ 탭 바로가기
     계량 전망은 목표 묶음(goalSet)을 그대로 씀 — 목표·로드맵 탭과 늘 같은 값 */
  const HOME_NAV = [
    { tab: 'dashboard', k: `${icn('chart')} 올해 현황`, d: '올해 온실가스·에너지·폐기물이 지금 얼마인지, 연말에 얼마가 될지 봐요.', go: '거점별로 보기' },
    { tab: 'history', k: `${icn('history')} 실적 조회`, d: '지난 연도와 견줘 무엇이 늘고 줄었는지, 보고서에 넣을 문구까지 봐요.', go: '연도별 비교하기' },
    { tab: 'roadmap', k: `${icn('target')} 목표·로드맵`, d: '2050 Net-Zero까지 연도별 목표와 지금 달성 전망을 봐요.', go: '목표 보기' },
    { tab: 'outlook', k: `${icn('trend')} 전망`, d: '지금처럼 가면 2030·2050년에 어디쯤일지, 태양광·절감을 더하면 어떻게 달라지는지 봐요.', go: '전망 보기' },
    { tab: 'input', k: `${icn('plus')} 데이터 입력`, d: '달마다 사용량을 넣어요. 엑셀·CSV를 끌어다 놓으면 한꺼번에 들어가요.', go: '입력하기', need: 'edit' },
    { tab: 'manage', k: `${icn('sliders')} 데이터 관리`, d: '저장된 값을 고치고, 연도 마감·목표 설정·변경 이력을 관리해요.', go: '관리하기', need: 'edit' },
  ];
  // 전망 한 줄 ('✓ 달성 전망' 같은 짧은 말) · st = ok | no | na
  const EV_WORD = { ok: '달성 전망', no: '미달 전망', na: '판단 전 ' };

  /* ── 경영평가 계량 점수 계산 (EVAL 주석의 산식 그대로) ───────────────────── */
  // 그 해 본사에 실적이 '다 들어온' 달 — 기준연도와 '동기간'을 맞추는 기준 (1~6월만 있으면 기준연도도 1~6월)
  //  전력·도시가스·지역난방이 모두 있는 달만 셈 ('-' 해당없음 칸은 있는 것으로) — 한 가지만 먼저 넣은 달을 넣으면
  //  빠진 에너지원이 0으로 잡혀 절감률이 부풀려짐 (예: 10월 도시가스만 입력 → 전력·지역난방 10월이 0)
  function evalMonths(y) {
    const got = {};   // 달 → 들어온 에너지원
    energyRecs.forEach(r => { if (r.site === EVAL.site && EVAL.types.includes(r.type)
      && r.date?.startsWith(String(y)) && r.amount != null) (got[r.date.slice(5, 7)] ||= new Set()).add(r.type); });
    const na = (t, m) => settings.na_cells?.has?.(`${EVAL.site}|${t}|${y}-${m}`);
    const ok = Object.keys(got).filter(m => EVAL.types.every(t => got[m].has(t) || na(t, m))).sort();
    // 일부만 들어온 달 (계산 근거에 '뺀 달'로 알려 줌)
    ok.partial = Object.keys(got).filter(m => !ok.includes(m)).sort()
      .map(m => ({ m, miss: EVAL.types.filter(t => !got[m].has(t) && !na(t, m)) }));
    return ok;
  }
  const evalAmt = (y, t, ms) => sumBy(energyRecs.filter(r => r.site === EVAL.site && r.type === t
    && r.date?.startsWith(String(y)) && (!ms || ms.includes(r.date.slice(5, 7)))), r => +r.amount);
  // ② 에너지 사용량 절감 실적 (40점)
  //  경영평가는 그 해 연간 사용량으로 받으므로 — 올해는 '연말 예측(입력된 실적 + 남은 달 예측) vs 기준연도 연평균'
  //  지난 연도는 12달이 다 있으면 연간, 아니면 다 들어온 달끼리(동기간) · 동기간 비교는 올해도 참고(mid)로 함께
  function evalEnergy(y) {
    const isCur = +y === new Date().getFullYear(), done = evalMonths(y), M12 = m12(i => pad(i + 1));
    const fc = isCur ? buildForecast(+y, EVAL.site) : null, est = isCur && !!fc;
    const ms = est || done.length === 12 ? M12 : done;
    if (!ms.length || (!est && !done.length)) return null;
    const pt = x => (EVAL.enSteps.find(([lo]) => x >= lo) || [0, 0])[1];
    const baseAvg = (t, mm) => EVAL.baseYears.reduce((s, by) => s + evalAmt(by, t, mm), 0) / EVAL.baseYears.length;
    const months = m12(i => ({ m: i + 1, act: 0, pred: 0 }));   // 연말 예측 분해용 (TOE)
    const rows = EVAL.types.map(t => {
      const f = toeF[t] || 0;
      // 올해: 입력된 달 전부(일부만 들어온 달도 그 에너지원은 실적) + 그 에너지원이 비어 있는 달은 예측
      const actA = est ? evalAmt(y, t, null) : evalAmt(y, t, ms), predA = est ? sumArr(fc.predEnergy[t] || []) : 0;
      if (est) {
        energyRecs.filter(r => r.site === EVAL.site && r.type === t && r.date?.startsWith(String(y))).forEach(r => { months[+r.date.slice(5, 7) - 1].act += (+r.amount || 0) * f; });
        (fc.predEnergy[t] || []).forEach((v, i) => { if (v > 0) { months[i].pred += v * f; (months[i].pt ||= []).push(t); } });
      }
      const rawA = actA + predA, rawB = baseAvg(t, ms), rawY = baseAvg(t, null);
      return { t, unit: GHG[t]?.unit || '', f, actA, predA, rawA, rawB, act: actA * f, pred: predA * f, a: rawA * f, b: rawB * f, year: rawY * f,
               cut: rawB > 0 ? (rawB - rawA) / rawB * 100 : null };
    });
    const A = sumBy(rows, r => r.a), B = sumBy(rows, r => r.b), YB = sumBy(rows, r => r.year);
    if (!(B > 0)) return null;
    const X = (B - A) / B * 100;
    // 동기간 비교 (참고) — 올해 세 가지가 다 들어온 달끼리 (상반기 실적 보고처럼)
    let mid = null;
    if (est && done.length && done.length < 12) {
      const mr = EVAL.types.map(t => { const f = toeF[t] || 0, a = evalAmt(y, t, done), b = baseAvg(t, done);
        return { t, f, a: a * f, b: b * f, cut: b > 0 ? (b - a) / b * 100 : null }; });
      const mA = sumBy(mr, r => r.a), mB = sumBy(mr, r => r.b);
      mid = mB > 0 ? { ms: done, rows: mr, A: mA, B: mB, X: (mB - mA) / mB * 100 } : null;
    }
    // RE100 보완 — 절감률이 1%에 못 미칠 때 녹색프리미엄·PPA 구매량을 그 해 절감량으로 추가 인정
    //  구매는 1년치 계약이라 동기간과 무관하게 그 해 입력분 전체 (11월에 넣어도 1~9월 비교에 씀)
    const reKwh = evalAmt(y, RE_BUY, null), reToe = reKwh * (toeF['전력'] || 0);
    const X2 = reToe > 0 ? (B - (A - reToe)) / B * 100 : null;
    const needRe = X < 1 && X2 != null && pt(X2) > pt(X);
    return { y, ms, rows, A, B, YB, goal: YB * 0.99, X, X2, reKwh, reToe, needRe, est, mid, done, months,
             actT: sumBy(rows, r => r.act), predT: sumBy(rows, r => r.pred),
             score: pt(X), score2: X2 == null ? null : pt(X2), pt: needRe ? pt(X2) : pt(X), full: EVAL.enPt };
  }
  // ① 이행연도 온실가스 감축목표 달성률 (60점) — ghgPred를 주면 연말 예측으로, 없으면 그 해 실적으로
  function evalGhg(y, ghgPred) {
    const base = baseOf(y), rate = LAW_RATE[y];
    if (!(base > 0) || rate == null) return null;
    const act = dgbOf(String(y)), v = ghgPred != null ? ghgPred : (act > 0 ? act : null);
    if (v == null) return null;
    const cut = (base - v) / base * 100, idx = cut / rate * EVAL.ghgPt;
    return { y, base, rate, v, act, est: ghgPred != null, cut, idx,
             pt: Math.max(0, Math.min(EVAL.ghgPt, idx)), full: EVAL.ghgPt };
  }
  // 그 해 계량 점수 묶음 — ready가 false면 '판단 전'
  function evalScore(y, ghgPred) {
    const g = evalGhg(y, ghgPred), e = evalEnergy(y);
    // judged = 지금 판단할 수 있는 만점. 자료가 없어 못 재는 항목은 분모에서 뺀다 —
    // 그래야 '0.0 / 100점'이 '0점을 받았다'로 잘못 읽히지 않는다 (full = 원래 만점, 참고용)
    const judged = (g ? EVAL.ghgPt : 0) + (e ? EVAL.enPt : 0);
    return { y, g, e, got: (g?.pt || 0) + (e?.pt || 0), full: EVAL.ghgPt + EVAL.enPt,
             judged: judged || EVAL.ghgPt + EVAL.enPt, ready: !!g && !!e };
  }
  /* ── 경영평가 비계량 — 3대 분야 이행실적 ────────────────────────────────
     Green Infra   : 자체 배출목표 달성률 · RE100 이행률 · 친환경차 전환율
     Green Digital : 클라우드 전환률 · PUE
     Green Culture : 폐기물 감축 목표
     목표가 있는 지표(자체·RE100·폐기물)는 목표·로드맵과 같은 판정(goalSet)을 쓰고,
     목표가 아직 없는 지표(친환경차·PUE·클라우드)는 값과 전년 대비만 보여 줌 */
  const QUAL_AREAS = [
    { k: 'infra',   icon: icn('building'), n: 'Green Infra',   d: '시설·설비 전환',  tab: 'roadmap' },
    { k: 'digital', icon: icn('monitor'),  n: 'Green Digital', d: 'ICT 인프라 효율', tab: 'dashboard' },
    { k: 'culture', icon: icn('recycle'),  n: 'Green Culture', d: '자원순환·문화',   tab: 'roadmap' },
  ];
  // 최근 값이 있는 해 찾기 (PUE·클라우드는 연 1회 입력이라 올해 값이 아직 없을 수 있음)
  function orgPick(key, curYr) {
    for (let y = curYr; y >= curYr - 3; y--) { const s = orgStat(y); if (s[key] != null) return { y, s }; }
    return null;
  }
  // 목표가 있는 지표 한 줄 — goalSet의 판정 결과(i)를 그대로 씀
  const qFromGoal = (i, num, area, name) => ({
    area, n: name || i.g.k, st: i.st,
    v: i.j.v != null ? num(i.j.v, i.g.unit) : null, t: i.j.t != null ? num(i.j.t, i.g.unit) : null,
    nv: i.j.v, nt: i.j.t, up: !i.g.lower,   // 목표 대비 막대용 숫자 (lower = 적을수록 좋음)
    say: i.st === 'na' ? i.why : `${EV_WORD[i.st]}${i.gapTxt ? ` · ${i.gapTxt}` : ''}`, tab: 'roadmap',
  });
  function qualList(items, num, curYr) {
    const L = [];
    const byName = n => items.find(i => i.g.k === n);
    const own = byName('자체 배출목표'), re = byName('RE100 이행 목표'), wt = byName('폐기물 감축 목표');
    if (own) L.push(qFromGoal(own, num, 'infra', '자체 배출목표'));
    if (re) L.push(qFromGoal(re, num, 'infra', 'RE100 이행률'));
    // 친환경차 전환율 — 업무용 차량이 있는 거점(대구본원) 기준 · 아직 목표가 없어 값과 전년 대비만
    const evN = (y) => { const s = yearStat(String(y), TARGET_SITES.ghg); return s?.evRate ?? null; };
    const ev = evN(curYr) ?? evN(curYr - 1), evP = evN(curYr - 1);
    L.push({ area: 'infra', n: '친환경차 전환율', st: 'na', v: ev != null ? `${fmt(ev, 1)}%` : null, t: null, nv: ev, max: 100,
             say: ev == null ? '업무용 차량·친환경차 대수를 넣으면 보여요'
               : evP != null && ev !== evP ? `전년 ${fmt(evP, 1)}% → ${ev > evP ? '▲' : '▼'}${fmt(Math.abs(ev - evP), 1)}%p` : '목표 미설정',
             tab: ev == null ? 'input' : 'dashboard' });
    // 클라우드 전환률 · PUE — 기관 전체 값 (연 1회 입력)
    const cl = orgPick('cloud', curYr), clP = cl ? orgStat(cl.y - 1).cloud : null;
    L.push({ area: 'digital', n: '클라우드 전환률', st: 'na',
             v: cl ? `${fmt(cl.s.cloud, 1)}%` : null, t: null, nv: cl ? cl.s.cloud : null, max: 100,
             say: !cl ? '운영 정보시스템·전환 시스템 수를 넣으면 보여요'
               : `${yrShort(cl.y)} ${fmt(cl.s.done, 0)}/${fmt(cl.s.all, 0)}개` +
                 (clP != null ? ` · 전년 ${cl.s.cloud > clP ? '▲' : cl.s.cloud < clP ? '▼' : '→'}${fmt(Math.abs(cl.s.cloud - clP), 1)}%p` : ''),
             tab: cl ? 'dashboard' : 'input' });
    const pu = orgPick('pue', curYr), puP = pu ? orgStat(pu.y - 1).pue : null;
    L.push({ area: 'digital', n: 'PUE (전력효율지수)', st: 'na',
             v: pu ? `${fmt(pu.s.pue, 2)}배` : null, t: null,
             say: !pu ? '데이터센터 총 전력·IT 장비 전력을 넣으면 보여요'
               : `${yrShort(pu.y)} · 1에 가까울수록 효율적` +
                 (puP != null ? ` · 전년 ${pu.s.pue < puP ? '▼' : pu.s.pue > puP ? '▲' : '→'}${fmt(Math.abs(pu.s.pue - puP), 2)}` : ''),
             tab: pu ? 'dashboard' : 'input' });
    if (wt) L.push(qFromGoal(wt, num, 'culture', '폐기물 감축 목표'));
    return L;
  }
  function renderQual(items, num, curYr) {
    const L = qualList(items, num, curYr);
    const judged = L.filter(q => q.st === 'ok' || q.st === 'no'), nOk = L.filter(q => q.st === 'ok').length;
    const noGoal = L.filter(q => q.st === 'na').length;
    const pct = judged.length ? nOk / judged.length * 100 : 0;
    const tone = !judged.length ? ' na' : nOk === judged.length ? '' : nOk >= judged.length / 2 ? ' warn' : ' bad';
    $('home-qual-note').textContent = `지표 ${L.length}개` + (noGoal ? ` · ${noGoal}개는 목표 미설정` : '');
    // 계량과 같은 틀: [합계] = [분야] + [분야] + [분야]
    $('home-qual').innerHTML = '<div class="evq evq-q">' +
      `<div class="evq-tot${tone}"><div class="et-k"><i>${icn('sprout')}</i>비계량 합계</div>` +
      `<div class="et-v">${judged.length ? nOk : '—'}<small>${judged.length ? `/ ${judged.length}개 달성 전망` : '목표 설정 전'}</small></div>` +
      `<div class="et-bar"><i style="width:${pct.toFixed(0)}%"></i></div>` +
      `<div class="et-say">${!judged.length ? '목표를 정하면 전망이 나와요'
        : nOk === judged.length ? '목표 있는 지표를 <b>모두 달성</b>할 전망이에요'
        : `<b>${judged.length - nOk}개</b>가 미달 전망이에요`}${noGoal ? ` · ${noGoal}개는 목표 미설정` : ''}</div></div>` +
      QUAL_AREAS.map((a, ai) => {
        const qs = L.filter(q => q.area === a.k), j = qs.filter(q => q.st === 'ok' || q.st === 'no');
        const ok = qs.filter(q => q.st === 'ok').length;
        const cls = !j.length ? 'na' : ok === j.length ? 'ok' : 'no';
        return `<span class="evq-op">${ai ? '+' : '='}</span>` +
          `<div class="ev-card ${cls}"><div class="ec-k">${a.icon} ${esc(a.n)}` +
          `<em>${j.length ? `${ok} / ${j.length} 달성` : '목표 미설정'}</em></div>` +
          '<ul class="qa-list">' + qs.map(q =>
            `<li class="${q.st}" role="button" tabindex="0" data-go="${q.tab}">` +
            `<span class="qi-k">${esc(q.n)}</span>` +
            `<span class="qi-v">${q.v == null ? '<i>자료 없음</i>' : esc(q.v)}` +
            `${q.t ? `<small>/ ${esc(q.t)}</small>` : ''}</span>` +
            `<span class="qi-r">${q.st === 'ok' ? '✓' : q.st === 'no' ? '✗' : '·'} ${esc(q.say)}</span>` +
            (q.nv == null || (q.nt == null && !q.max) ? '' : gaugeHtml(q.nv, q.nt, { up: q.up, max: q.max, aria: `${q.n} ${q.v}${q.t ? ` · 목표 ${q.t}` : ''}` })) + '</li>').join('') +
          '</ul></div>';
      }).join('') + '</div>';
  }
  // 메인 — 30년 전망 한 줄 (자체 목표 · RE100 60%) · 누르면 📈 전망 탭
  function renderHomeOutlook() {
    let OL = null, ROL = null;
    try { OL = ghgOutlook(); } catch (e) { console.warn('[메인: 전망 온실가스]', e); }
    try { ROL = reOutlook(); } catch (e) { console.warn('[메인: 전망 RE100]', e); }
    const box = $('home-ol'), bits = [], yE = 2030, yS = yrShort(yE);
    if (OL) {
      const i = OL.ys.indexOf(yE), own = ROADMAP[yE]?.target ?? null;
      if (i >= 0 && own != null) {
        const v = OL.v[i], ok = v <= own;
        bits.push(`온실가스 자체 목표 <b class="${ok ? 'good' : 'bad'}">${ok ? `✓ 달성 전망 · 여유 ${fmt(own - v, 0)}t` : `✗ ${fmt(v - own, 0)}t 초과 전망`}</b>`);
      }
    }
    if (ROL) {
      const r = ROL.rows.find(x => x.y === yE);
      if (r && r.goal != null) {
        const kw = needKw(r.need, ROL.sol);
        bits.push(`RE100 ${r.goal}%까지 ` + (!(r.need > 0) ? '<b class="good">✓ 지금 계획으로 충분</b>'
          : `재생에너지 <b class="bad">${kwhK(r.need)} kWh</b> 더 필요${kw ? ` (태양광이면 약 ${fq(kw)}kW)` : ''}`));
      }
    }
    box.hidden = !bits.length;
    box.innerHTML = bits.length ? `<span class="ey-k"><b>${yS} 전망</b></span>${bits.map(b => `<span>${b}</span>`).join('<span>·</span>')}<span class="ol-go">${icn('trend')} 전망 →</span>` : '';
  }
  // 동기간 이름 — 1~10월 / 연간 / 1·3·5월
  const msLabel = ms => !ms?.length ? '' : ms.length === 12 ? '연간'
    : ms.every((m, i) => +m === i + 1) ? `1~${+ms[ms.length - 1]}월` : `${ms.map(m => +m).join('·')}월`;
  const toe = v => fmt(v, 3);
  // 메인 계량 카드 두 장 — k는 evalScore의 칸 이름
  const EV_PARTS = [
    { k: 'g', n: '온실가스', ttl: '온실가스 감축목표 달성률', full: EVAL.ghgPt,
      need: '기준배출량·권장감축률과 배출 실적이 있어야 계산돼요',
      line: o => `${o.est ? '연말 예측' : '실적'} 감축률 <b>${fmt(o.cut, 1)}%</b> · 권장감축률 ${fmt(o.rate, 1)}%`,
      say: o => o.pt >= o.full ? '권장감축률을 넘겨 만점' : `권장감축률까지 ${fmt(o.rate - o.cut, 1)}%p 더 줄여야`,
      cell: o => `감축률 ${fmt(o.cut, 1)}% / 권장 ${fmt(o.rate, 1)}%`,
      gauge: o => gaugeHtml(o.cut, o.rate, { up: true, max: Math.max(o.rate * 2, o.cut * 1.1), tl: `권장 ${fmt(o.rate, 1)}%`,
        aria: `감축률 ${fmt(o.cut, 1)}% · 권장감축률 ${fmt(o.rate, 1)}%` }) },
    { k: 'e', n: '에너지', ttl: '에너지 사용량 절감 실적', full: EVAL.enPt,
      need: `기준연도(${EVAL.baseYears.map(yrShort).join('·')}) 사용량이 있어야 계산돼요`,
      line: o => `${o.est ? '연말 예측' : msLabel(o.ms)} 절감률 <b>${fmt(o.X, 2)}%</b> · 만점 기준 1%`,
      say: o => o.needRe ? `RE100 이행실적을 더해 ${fmt(o.X2, 2)}%` : o.pt >= o.full ? '1% 이상이라 만점'
        : o.pt > 0 ? `1%까지 ${fmt(1 - o.X, 2)}%p 모자라` : '0.5%에 못 미침',
      cell: o => `${o.est ? '연말 예측' : msLabel(o.ms)} 절감률 ${fmt(o.X, 2)}%`,
      gauge: o => { const x = o.needRe ? o.X2 : o.X;
        return gaugeHtml(x, 1, { up: true, max: Math.max(2, x * 1.1), tl: '만점 1%', aria: `절감률 ${fmt(x, 2)}% · 만점 기준 1%` }); } },
  ];
  // 목표 대비 막대 (불릿) — 값 막대 + 목표 눈금(있으면) · up = 클수록 좋음 · max를 안 주면 값·목표 중 큰 쪽의 1.15배
  //  목표를 지키면 초록, 못 지키면 빨강, 목표가 없으면 파랑 · 눈금 이름(tl)은 막대 아래
  function gaugeHtml(v, t, o = {}) {
    if (v == null || !isFinite(v)) return '';
    const hasT = t != null && isFinite(t), max = o.max || Math.max(hasT ? t : 0, v, 1e-9) * 1.15;
    const pos = x => (Math.max(0, Math.min(x, max)) / max * 100).toFixed(1);
    const st = !hasT ? 'n' : (o.up ? v >= t : v <= t) ? 'ok' : 'no', tp = hasT ? +pos(t) : 0;
    return `<div class="gauge ${st}" role="img" aria-label="${esc(o.aria || '')}"><div class="g-tr"><i class="g-f" style="width:${pos(v)}%"></i>` +
      (hasT ? `<i class="g-t" style="left:${tp}%"></i>` : '') + '</div>' +
      (hasT && o.tl ? `<div class="g-lb"><span class="${tp > 82 ? 'r' : tp < 18 ? 'l' : ''}" style="left:${tp}%">${esc(o.tl)}</span></div>` : '') + '</div>';
  }
  const evCard = (o, p) => {
    const st = !o ? 'na' : o.pt >= p.full ? 'ok' : 'no';
    return `<div class="ev-card ${st}"${o ? ` role="button" tabindex="0" data-calc="${p.k}" data-calc-p="e-" title="누르면 계산 근거를 봐요"` : ''}>` +
      `<div class="ec-k">${esc(p.ttl)}<em>${p.full}점 만점</em></div>` +
      `<div class="ec-v">${o ? fmt(o.pt, 1) : '—'}<small>/ ${p.full}점</small></div>` +
      (o && p.gauge ? p.gauge(o) : '') +
      `<div class="ec-t">${o ? p.line(o) : esc(p.need)}</div>` +
      `<div class="ec-r">${st === 'ok' ? '✓' : st === 'no' ? '✗' : 'ⓘ'} ${o ? esc(p.say(o)) : '판단 전'}</div></div>`;
  };
  /* 지난 해 계량 점수 — 참고 한 줄 (점수판 아래 각주) */
  function renderEvalYears(EV, EVP, curYr) {
    if (!EVP.g && !EVP.e) { $('home-eval-prev').innerHTML = ''; return; }
    const y = EVP.y;
    const chip = isClosed(y) ? '<span class="ey-chip done">마감</span>' : '<span class="ey-chip open">마감 전</span>';
    $('home-eval-prev').innerHTML =
      `<span class="ey-k">참고 · <b>${yrShort(y + 1)} 평가</b>(${yrShort(y)} 실적)${chip}</span>` +
      `<span class="ey-tot">${fmt(EVP.got, 1)} / ${EVP.full}점</span>` +
      EV_PARTS.map(p => EVP[p.k] ? `<button type="button" class="evy-b" data-calc="p${p.k}" data-calc-p="e-" ` +
        `title="누르면 ${yrShort(y)} 계산 근거를 봐요">${esc(p.n)} <b>${fmt(EVP[p.k].pt, 1)}</b></button>` : '').join('') +
      (isClosed(y) ? '' : '<span>· 마감하면 확정돼요</span>');
  }
  // 메인 계량 카드의 계산 근거 (calcStore['e-']) — 보고서 표와 같은 모양으로
  //  키: 올해 'g'(온실가스)·'e'(에너지) · 지난 해 'pg'·'pe'
  function homeEvalCalcs(EV, EVP) {
    const C = calcStore['e-'] = {};
    Object.assign(C, evCalcs(EV));
    if (EVP.ready) Object.entries(evCalcs(EVP)).forEach(([k, v]) => { C['p' + k] = v; });
  }
  function evCalcs(EV) {
    const C = {}, yS = yrShort(EV.y), g = EV.g, e = EV.e;
    if (g) C.g = {
      title: icn('factory') + ' 이행연도 온실가스 감축목표 달성률', sub: `${EVAL.ghgPt}점 만점`, site: EVAL.site,
      period: `${yS} ${g.est ? '연말 예측' : '실적'}`, unit: '점', value: g.pt,
      score: { got: g.pt, full: EVAL.ghgPt, tone: g.pt >= EVAL.ghgPt ? 'ok' : 'no',
               say: g.pt >= EVAL.ghgPt ? '권장감축률을 넘겨 만점' : `권장감축률까지 ${fmt(g.rate - g.cut, 1)}%p 더 줄여야`,
               sub: `기준배출량 <b>${fq(g.base)}t</b> 대비 ${yS} 배출량 <b>${fq(g.v)}t</b> — ` +
                    `<b>${fmt(g.cut, 1)}%</b> 줄여 ${yS} 권장감축률 <b>${fmt(g.rate, 1)}%</b>의 <b>${fmt(g.cut / g.rate * 100, 0)}%</b> 수준이에요` },
      formula: { parts: [{ k: `${yS} 감축률`, v: `${fmt(g.cut, 1)}%` }, { k: '권장감축률', v: `${fmt(g.rate, 1)}%`, op: '÷' },
                         { k: '배점', v: EVAL.ghgPt, u: '점', op: '×' }],
                 result: { k: '달성률(지수)', v: `${fmt(g.idx, 1)}` } },
      facts: [{ k: `기준배출량 (${yS})`, v: g.base, u: 'tCO₂eq' },
              { k: `${yS} 배출량${g.est ? ' (연말 예측)' : ''}`, v: g.v, u: 'tCO₂eq' },
              ...(g.est && g.act > 0 ? [{ k: `${yS} 지금까지 실적`, v: g.act, u: 'tCO₂eq' }] : []),
              { k: '감축량 (기준배출량 − 배출량)', v: g.base - g.v, u: 'tCO₂eq' },
              { k: '달성률(지수)', v: `${fmt(g.idx, 1)}${g.idx > EVAL.ghgPt ? ` → ${EVAL.ghgPt}점 (상한)` : ''}` }],
      tbl: [{ title: '연도별 권장감축률', unit: '기준배출량 대비 %',
              head: ['연도', ...Object.keys(LAW_RATE).filter(y => +y >= 2024 && +y <= 2030).map(yrShort)],
              rows: [{ c: ['권장감축률', ...Object.keys(LAW_RATE).filter(y => +y >= 2024 && +y <= 2030)
                .map(y => ({ v: `${fmt(LAW_RATE[y], 1)}%`, cls: +y === +EV.y ? 'ct-val' : '' }))] }] }],
      fc: g.est ? fcGhgOf(EV.y, TARGET_SITES.ghg) : null,
      src: srcGhg(EV.y, { base: g.base, rateK: '권장감축률', rateV: `${fmt(g.rate, 1)}%`, est: g.est }),
      note: `공공부문 온실가스 목표관리제 · 이행연도 감축실적이 권장감축률 이상이면 ${EVAL.ghgPt}점 · 기준배출량은 데이터 관리 → 연도 마감·로드맵에서 고쳐요`,
    };
    if (e) {
      // 올해 = 연말 예측(입력된 실적 + 남은 달 예측) vs 기준연도 연평균 · 지난 연도 = 연간(또는 다 들어온 달끼리)
      const est = e.est, mL = est ? '연말 예측' : msLabel(e.ms), bL = est || e.ms.length === 12 ? '기준연도 연평균' : `기준연도 ${mL} 평균`;
      const aL = est ? `${yS} 연말 예측` : `${yS} ${mL}`, step = EVAL.enSteps.findIndex(([lo]) => (e.needRe ? e.X2 : e.X) >= lo);
      const pc = x => ({ v: `${x < 0 ? '△' : ''}${fmt(Math.abs(x), 2)}%`, cls: x < 0 ? 'ct-bad' : 'ct-good' });
      C.e = {
        title: icn('bolt') + ' 에너지 사용량 절감 실적', sub: `${EVAL.enPt}점 만점`, site: `${EVAL.site} 전력·도시가스·지역난방`,
        period: est ? `${yS} 연말 예측 기준` : `${yS} ${mL}`, unit: '점', value: e.pt,
        score: { got: e.pt, full: EVAL.enPt, tone: e.pt >= EVAL.enPt ? 'ok' : 'no',
                 say: e.needRe ? `RE100을 더해 ${fmt(e.X2, 2)}%` : e.pt >= EVAL.enPt ? '1% 이상이라 만점'
                   : e.pt > 0 ? `1%까지 ${fmt(1 - e.X, 2)}%p 모자라` : '0.5%에 못 미침',
                 sub: `${bL} <b>${toe(e.B)} TOE</b> 대비 ${aL} <b>${toe(e.A)} TOE</b> — ` +
                      `<b>${toe(e.B - e.A)} TOE</b>(<b>${fmt(e.X, 2)}%</b>) ${est ? '줄일 전망이에요' : '줄였어요'}` +
                      (e.mid ? ` · 지금까지 ${rngLabel(e.mid.ms.map(Number))} 동기간 비교로는 <b>${fmt(e.mid.X, 2)}%</b>` : '') },
        steps: { title: '평정점 구간', note: `${aL} 절감률 ${fmt(e.needRe ? e.X2 : e.X, 2)}%`,
                 cur: step < 0 ? EVAL.enSteps.length : step,
                 items: [...EVAL.enSteps.map(([lo, pt], i) => ({ v: `${pt}점`,
                           k: i === 0 ? `절감률 ${lo}% 이상` : `${EVAL.enSteps[i - 1][0]}% 미만 ~ ${lo}% 이상` })),
                         { v: '0점', k: `${EVAL.enSteps[EVAL.enSteps.length - 1][0]}% 미만` }] },
        formula: { parts: [{ group: [{ k: `${bL} B`, v: e.B, u: 'TOE' }, { k: `${aL} A`, v: e.A, u: 'TOE', op: '−' }] },
                           { k: `${bL} B`, v: e.B, u: 'TOE', op: '÷' }, { k: '백분율', v: 100, op: '×' }],
                   result: { k: '절감률 X', v: `${fmt(e.X, 2)}%` } },
        tbl: [est
          ? { title: '에너지원별 — 연말 예측 기준 (평가 기준)', unit: 'TOE',
              head: ['구분', '기준연도 연평균', `${yS} 목표 (1%↓)`, `${yS} 실적 (입력분)`, '남은 달 예측', `${yS} 연말 예측`, '절감률'],
              rows: [...e.rows.map(r => ({ c: [r.t, toe(r.year), toe(r.year * 0.99), toe(r.act), toe(r.pred), toe(r.a), pc(r.cut)] })),
                     { sum: true, c: ['합계', toe(e.YB), toe(e.goal), toe(e.actT), toe(e.predT), toe(e.A), pc(e.X)] }] }
          : { title: '에너지원별', unit: 'TOE',
              head: ['구분', '기준연도 연평균', `기준연도 ${mL}`, `${yS} 목표 (1%↓)`, `${yS} ${mL}`, '절감률'],
              rows: [...e.rows.map(r => ({ c: [r.t, toe(r.year), toe(r.b), toe(r.year * 0.99), toe(r.a), pc(r.cut)] })),
                     { sum: true, c: ['합계', toe(e.YB), toe(e.B), toe(e.goal), toe(e.A), pc(e.X)] }] },
          ...(e.mid ? [{ title: `참고 — 지금까지 동기간 비교 (${rngLabel(e.mid.ms.map(Number))} · 상반기 보고처럼)`, unit: 'TOE',
              head: ['구분', `기준연도 ${rngLabel(e.mid.ms.map(Number))} 평균`, `${yS} ${rngLabel(e.mid.ms.map(Number))}`, '절감률'],
              rows: [...e.mid.rows.map(r => ({ c: [r.t, toe(r.b), toe(r.a), pc(r.cut)] })),
                     { sum: true, c: ['합계', toe(e.mid.B), toe(e.mid.A), pc(e.mid.X)] }] }] : []),
          { title: '쓴 환산계수', unit: 'toe / 사용단위',
            head: ['에너지원', '사용단위', '환산계수', `${est ? `${yS} 연말 예측` : `${yS}`} 사용량`, 'TOE'],
            rows: e.rows.map(r => ({ c: [r.t, r.unit, r.f.toFixed(7).replace(/0+$/, ''), fq(Math.round(r.rawA)), toe(r.a)] })) }],
        facts: [...(e.reKwh > 0 ? [{ k: 'RE100 이행실적 (녹색프리미엄·PPA 구매)', v: `${fq(e.reKwh)} kWh = ${toe(e.reToe)} TOE` },
                                   { k: 'RE100을 더한 절감률', v: `${fmt(e.X2, 2)}%${e.needRe ? ' (이 값으로 평정)' : ' (절감률만으로 이미 만점)'}` }] : [])],
        fc: est ? { unit: 'TOE', d: 3, act: e.actT, pred: e.predT, months: e.months, method: fcMethod(EV.y), link: fcLink([EVAL.site]) } : null,
        src: [{ k: `${yS} ${est ? '지금까지 ' : ''}사용량`, ...S_IN_E },
              ...(est ? [S_FC(EVAL.site)] : []),
              { k: `기준연도 (${EVAL.baseYears.map(yrShort).join('·')}) 사용량`, ...S_IN_E, from: '데이터 입력 → 에너지 (20~22년 월별 사용량)' },
              { k: 'TOE 환산계수', v: EVAL.types.map(t => `${t} ${String(+(+toeF[t]).toFixed(9))}`).join(' · '), kind: 'set',
                from: '데이터 관리 → 연도 마감·로드맵 → TOE 환산계수 (에너지법 시행규칙 별표)', go: 'manage', sub: 'settings', scroll: 'toe-card', need: 'admin', btn: '계수 보기' }],
        note: `본사(본청) 전력·도시가스·지역난방만 · ${est ? '경영평가는 그 해 연간 사용량으로 받으므로 올해는 연말 예측으로 견줘요 (동기간 비교는 참고)' : `기준연도와 같은 기간(${mL})끼리 비교해요`} · ` +
              '절감률이 1%에 못 미치면 RE100 이행실적을 그 해 절감량으로 추가 인정받을 수 있어요',
      };
    }
    return C;
  }
  function renderHome() {
    const now = new Date(), curYr = now.getFullYear(), yS = yrShort(curYr);
    $('home-asof').textContent = `${curYr}년 기준`;
    $('home-updated').textContent = $('hdr-updated').textContent;

    // ① 계량 전망 — 목표가 있는 지표의 달성 전망
    let ghgPred = null, rePred = null, wtPred = null;
    try { ghgPred = buildForecast(curYr, ORG_SITE)?.annualPred ?? null; } catch (e) { console.warn('[메인: 온실가스 예측]', e); }
    try { const pp = rePredParts(curYr, TARGET_SITES.re); rePred = pp && pp.cons > 0 ? pp.re / pp.cons * 100 : null; } catch (e) { console.warn('[메인: RE100 예측]', e); }
    try { wtPred = v2 ? wasteProjection(curYr, TARGET_SITES.waste)?.proj ?? null : null; } catch (e) { console.warn('[메인: 폐기물 예측]', e); }
    const { GOALS, num, judge, noneMsg } = goalSet(ghgPred, rePred, wtPred);
    const items = GOALS.map(g => {
      const j = judge(g, curYr), gap = j.v != null && j.t != null ? Math.abs(j.v - j.t) : null;
      const st = j.st === 'ok' || j.st === 'no' ? j.st : 'na';
      const need = g.need && st === 'no' ? g.need(String(curYr)) : 0;   // RE100: 몇 kWh 더 필요한지
      const gapTxt = gap == null ? '' : `${num(gap, g.unit).replace('%', '%p')} ${g.lower ? (st === 'ok' ? '여유' : '더 줄여야') : (st === 'ok' ? '여유' : '더 올려야')}` +
        (need > 0 ? ` (${needTxt(need)})` : '');
      return { g, j, st, gap, gapTxt,
        why: j.st === 'none' ? noneMsg(g, curYr, curYr) : j.st === 'nodata' || j.st === 'fut' ? '예측할 자료가 아직 없어요' : gapTxt };
    });
    // 계량 점수 — 올해(연말 예측)가 주, 지난 해(확정 실적)는 참고
    const EV = evalScore(curYr, ghgPred), EVP = evalScore(curYr - 1, null);
    const pct = EV.judged ? EV.got / EV.judged * 100 : 0;   // 막대도 '판단 가능한 만점' 대비
    const tone = !EV.ready ? '' : pct >= 100 ? '' : pct >= 70 ? ' warn' : ' bad';
    homeEvalCalcs(EV, EVP);
    const has = buildHasMap(), st = statusOf(curYr, has);
    const pastOpen = pastYears().filter(y => +y < curYr && !isClosed(y));
    $('home-eval-note').textContent = `${yS} 실적 기준 (${yrShort(curYr + 1)}에 받을 평가) · 카드를 누르면 계산 근거를 봐요`;
    $('home-quant-note').textContent = `${EVAL.ghgPt + EVAL.enPt}점 만점`;
    // 계량: [합계] = [온실가스] + [에너지] 점수판
    const miss = EV_PARTS.filter(p => !EV[p.k]).map(p => p.n);
    $('home-quant').innerHTML =
      `<div class="evq"><div class="evq-tot${tone || (EV.ready ? '' : ' na')}">` +
        `<div class="et-k"><i>${icn('award')}</i>계량 합계</div>` +
        `<div class="et-v"><span class="et-n">${EV.g || EV.e ? fmt(EV.got, 1) : '—'}</span><small>/ ${EV.judged}점</small></div>` +
        `<div class="et-bar"><i style="width:${Math.min(100, pct).toFixed(0)}%"></i></div>` +
        `<div class="et-say">${miss.length ? `${esc(miss.join('·'))} 자료가 없어 <b>${EV.full - EV.judged}점은 판단 전</b>이에요`
          : pct >= 100 ? `지금 추세면 <b>만점</b>이에요` : `만점까지 <b>${fmt(EV.full - EV.got, 1)}점</b> 남았어요`}</div>` +
      `</div><span class="evq-op">=</span>` +
      EV_PARTS.map((p, i) => (i ? '<span class="evq-op">+</span>' : '') + evCard(EV[p.k], p)).join('') +
      '</div>';
    // 연도별 계량 점수 — 지난 해(확정)와 올해(전망)를 나란히
    renderEvalYears(EV, EVP, curYr);
    // 비계량 — 3대 분야 이행실적
    renderQual(items, num, curYr);
    // 30년 전망 한 줄 (자체 목표 · RE100 60%) — 누르면 📈 전망 탭
    renderHomeOutlook();
    requestAnimationFrame(playHomeIntro);   // 진입 연출 (한 번만)
    // 목표·로드맵 탭이 아직 안 그려졌을 수 있어 메인에서도 목표 카드 계산 근거를 채워 둠 (지금 해야 할 일에서 씀)
    if (!calcStore['g-']) renderGoalStatusCalcOnly(curYr, ghgPred, rePred, wtPred);

    // ② 지금 해야 할 일
    const todo = [];
    if (st.late) todo.push({ i: '⚠', t: `올해 입력이 <b>${st.late}칸</b> 비어 있어요`, d: '달마다 넣어야 실적과 예측이 정확해져요', tab: 'input', go: '입력하러 가기', need: 'edit' });
    else if (st.due) todo.push({ i: icn('calendar'), t: `지난달 입력할 차례예요 (<b>${st.due}칸</b>)`, d: '', tab: 'input', go: '입력하러 가기', need: 'edit' });
    items.filter(i => i.st === 'no').forEach(i => todo.push({ i: icn('target'), t: `<b>${esc(i.g.k)}</b> ${EV_WORD.no} · ${esc(i.gapTxt)}`, d: '', tab: 'roadmap', go: '목표 보기' }));
    items.filter(i => i.j.t == null).forEach(i => todo.push({ i: icn('sliders'), t: `<b>${esc(i.g.k)}</b>가 아직 설정되지 않았어요`, d: esc(i.why), tab: 'manage', go: '설정하러 가기', need: 'admin' }));
    if (pastOpen.length) todo.push({ i: icn('lock'), t: `<b>${pastOpen.map(yrShort).join('·')}</b>이 아직 마감 전이에요`, d: '마감하면 실적이 바뀌지 않게 잠겨요', tab: 'manage', go: '마감하러 가기', need: 'admin' });
    if (isAdmin() && users.some(u => !u.role && !u.approved_by))
      todo.push({ i: icn('users'), t: `가입 승인을 기다리는 사람이 <b>${users.filter(u => !u.role && !u.approved_by).length}명</b> 있어요`, d: '', tab: 'manage', go: '승인하러 가기', need: 'admin' });
    const mine = todo.filter(t => !t.need || (t.need === 'admin' ? isAdmin() : canEdit()));
    $('home-todo').innerHTML = mine.length
      ? mine.map(t => `<li class="go" role="button" tabindex="0" data-go="${t.tab}"><span class="td-i">${t.i}</span>` +
          `<span class="td-t">${t.t}${t.d ? `<br><small style="color:var(--muted)">${t.d}</small>` : ''}</span><span class="td-go">${esc(t.go)}</span></li>`).join('')
      : `<li class="done"><span class="td-i">✓</span><span class="td-t">${canEdit() ? '지금 할 일이 없어요. 입력과 목표가 모두 갖춰졌어요' : '지금 챙길 일이 없어요'}</span></li>`;

    // ③ 탭 바로가기
    const navs = HOME_NAV.filter(n => !n.need || canEdit());
    $('home-nav').innerHTML = navs.map(n =>
      `<button type="button" class="nav-card" data-go="${n.tab}"><span class="nc-k">${n.k}</span>` +
      `<span class="nc-d">${esc(n.d)}</span><span class="nc-go">${esc(n.go)}</span></button>`).join('');
    $('home-nav').style.setProperty('--cols', colsFor(navs.length, 4, 2));   // 6개 → 3+3 · 4개 → 한 줄 (혼자 남는 칸 없게)
  }
  /* ── 메인 진입 연출 (anime.js) ──────────────────────────────
     움직임은 한 번만, 한 곳에서. 점수가 0에서 실제 값까지 올라가고 막대가 뒤따라 차오른다.
     섹션마다 떠오르거나 카드마다 반응하는 건 일부러 넣지 않았다 — 흔한 연출이라
     오히려 만들다 만 티가 나고, 숫자를 읽는 화면에서는 방해가 된다.
     움직임을 줄여 달라고 설정했거나 라이브러리를 못 받았으면 조용히 건너뛴다 (값은 이미 DOM 에 있음). */
  let homeIntroDone = false;
  function playHomeIntro() {
    if (homeIntroDone) return;
    const root = $('home-quant'); if (!root) return;
    const num = root.querySelector('.et-n'), bars = [...root.querySelectorAll('.et-bar i')];
    if (!num) return;
    homeIntroDone = true;
    const end = parseFloat(num.textContent);
    if (reduceMotion() || typeof anime !== 'function' || !isFinite(end)) return;   // 값은 그대로 둔다
    const o = { v: 0 };
    anime({ targets: o, v: end, duration: 520, easing: 'easeOutCubic',
            update: () => { num.textContent = fmt(o.v, 1); },
            complete: () => { num.textContent = fmt(end, 1); } });   // 끝나면 정확한 값으로
    bars.forEach(b => {
      const w = b.style.width; if (!w) return;
      b.style.width = '0%';
      anime({ targets: b, width: w, duration: 520, delay: 80, easing: 'easeOutCubic' });
    });
  }

  // 메인에서 목표 카드를 눌렀을 때 쓸 계산 근거만 만들어 둠 (목표·로드맵 탭을 아직 안 열었을 때)
  function renderGoalStatusCalcOnly(y, ghgPred, rePred, wtPred) {
    const keep = $('gs-cards').innerHTML;
    try { renderGoalStatus(y, ghgPred, rePred, wtPred); } catch (e) { console.warn('[메인: 목표 계산 근거]', e); }
    $('gs-cards').innerHTML = keep || $('gs-cards').innerHTML;
  }
  const goFrom = g => goTab(g.dataset.go, g.dataset.sub, g.dataset.scroll, g.dataset.site);
  document.addEventListener('click', e => { const g = e.target.closest('[data-go]'); if (g) goFrom(g); });
  document.addEventListener('keydown', e => {
    if (e.key !== 'Enter' && e.key !== ' ') return;
    const g = e.target.closest?.('[data-go]');
    if (g && g.tagName !== 'BUTTON') { e.preventDefault(); goFrom(g); }   // 단추는 Enter가 click으로 이어짐
  });
  // 다른 화면으로 — 탭 · 하위 탭(sub) · 거점(site) · 그 화면의 한 곳(scroll) · 계산 근거 팝업 안에서 누르면 팝업을 닫고 이동
  const goTab = (tab, sub, scrollId, site) => {
    const b = document.querySelector(`.tab-btn[data-tab="${tab}"]`);
    if (!b || !needOk(b)) return;
    if ($('calc').style.display !== 'none') closeCalc();
    b.click();
    if (site != null) { const sb = document.querySelector(`#nav-site .site-seg button[data-site="${site}"]`); if (sb && sb.getAttribute('aria-pressed') !== 'true') sb.click(); }
    if (sub) { const sb = $(`tab-${tab}`)?.querySelector(`.subtab-btn[data-sub="${sub}"]`); if (sb && needOk(sb)) sb.click(); }
    const t = scrollId && $(scrollId);
    if (t) { if (t.tagName === 'DETAILS') t.open = true; setTimeout(() => t.scrollIntoView({ block: 'start', behavior: 'smooth' }), 80); }
    else window.scrollTo({ top: 0 });
  };
  // 거점 선택 줄은 거점별로 보는 탭에서만 (목표·로드맵은 목표마다 대상 거점이 정해져 있음)
  const syncNavSite = () => { $('nav-site').hidden = !['dashboard', 'history'].includes(document.querySelector('.tab-btn.active')?.dataset.tab); };

