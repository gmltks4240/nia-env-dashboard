/* js/core.js (1/9) — 상수 · 경영평가 계량 정의 · 계산 헬퍼 · Supabase REST · 로그인 · 입력자 이력 · 기상(냉난방도일) · 연결 상태 · 2단계 기능 켜기
   한 덩어리였던 js/app.js 를 순서 그대로 나눈 것. 파일들은 index.html 에 적힌 순서(core → … → main)로 불러오고,
   최상위 const·let·function 은 모든 파일이 함께 쓴다. 새 파일을 만들면 index.html 에도 넣을 것. */
  const $ = id => document.getElementById(id);

  /* ── 상수 (한 곳에서 관리) ─────────────────────────── */
  const SITES = ['대구본원', '제주글로벌센터', '서울사무소'];   // 화면·표·그래프의 거점 순서
  // 거점 색 (거점별 비중 막대·거점 줄·거점별로 쌓은 막대) — 색각 이상에서도 서로 구분되고 밝은/어두운 바탕 모두 3:1 이상
  // 데이터 색은 CSS 토큰(--chart-*)이 한 곳에서 정하고 JS 는 읽기만 한다
  const cssVar = n => getComputedStyle(document.documentElement).getPropertyValue(n).trim();
  const rgbOf  = h => [1, 3, 5].map(k => parseInt(h.slice(k, k + 2), 16)).join(',');   // cssVar('--chart-s1') → '230,81,0'
  const SITE_COL = { '대구본원': cssVar('--chart-site-dgb'), '제주글로벌센터': cssVar('--chart-site-jeju'), '서울사무소': cssVar('--chart-site-seoul') };
  // 거점별 기상 관측 좌표 (Open-Meteo, 도시 중심 기준)
  const SITE_COORDS = { '대구본원': [35.8714, 128.6014], '서울사무소': [37.5665, 126.9780], '제주글로벌센터': [33.4996, 126.5312] };
  const MONTHS = ['1월','2월','3월','4월','5월','6월','7월','8월','9월','10월','11월','12월'];
  const RE_SELF = '재생에너지', RE_BUY = '재생에너지 구매', SAVE_REGEN = '승강기 회생제동';
  // scope = 배출 구분. 화면·집계는 DB에 저장된 값이 아니라 이 표를 기준으로 분류함
  // factor 0 = 온실가스 배출원이 아님 (재생에너지)
  const GHG = {
    '전력':     { unit:'kWh', scope:'Scope 2', factor:0.0004594106, div:1, desc:'0.0004594106 tCO₂eq/kWh (= 0.4594106 tCO₂eq/MWh)', src:'2026년 NGMS 산정 실적 기반 역산 유효계수 · 전력 간접배출 (Scope 2)' },
    '도시가스': { unit:'Nm³', scope:'Scope 1', factor:0.0021649672212, div:1, desc:'0.0021649672212 tCO₂eq/m³ (NGMS 유효계수 · 보일러 등 고정연소 = 직접배출)', src:'2026년 NGMS 산정 실적 기반 역산 유효계수 · 고정연소 직접배출 (Scope 1)' },
    '지역난방': { unit:'GJ',  scope:'Scope 2', factor:0.0481938763, div:1, desc:'0.0481938763 tCO₂eq/GJ (NGMS 유효계수 · CO₂·CH₄·N₂O × GWP 1·21·310 합산)', src:'2026년 NGMS 산정 실적 기반 역산 유효계수 · 열 간접배출 (Scope 2)' },
    '휘발유':   { unit:'L',   scope:'Scope 1', factor:0.002176470768, div:1, desc:'0.002176470768 tCO₂eq/L (NGMS 유효계수 · 차량 이동연소)', src:'2026년 NGMS 산정 실적 기반 역산 유효계수 · 차량 이동연소 (Scope 1)' },
    '경유':     { unit:'L',   scope:'Scope 1', factor:0.0026613886511, div:1, desc:'0.0026613886511 tCO₂eq/L (NGMS 유효계수 · 차량 이동연소)', src:'2026년 NGMS 산정 실적 기반 역산 유효계수 · 차량 이동연소 (Scope 1)' },
    [RE_SELF]:  { unit:'kWh', scope:'Scope 2', factor:0,        div:1,    desc:'태양광 등 자가발전량 — RE100 이행률에 반영' },
    [RE_BUY]:   { unit:'kWh', scope:'Scope 2', factor:0,        div:1,    desc:'녹색프리미엄·REC·PPA 구매량 — RE100 이행률에만 반영 (온실가스 감축에는 미반영)' },
    [SAVE_REGEN]: { unit:'kWh', scope:'Scope 2', factor:0,      div:1,    desc:'승강기 회생제동장치가 되돌려준 전력 — 절감 실적(참고). 한전 계량에 이미 반영돼 배출량·RE100에서 다시 빼지 않음' },
  };
  const scopeOf  = t => GHG[t]?.scope ?? null;
  const isEmit   = t => (GHG[t]?.factor ?? 0) > 0;   // 온실가스 배출원 (재생에너지·절감 항목 제외)
  const isRE     = t => t === RE_SELF || t === RE_BUY;
  const isSaving = t => t === SAVE_REGEN;
  // 기준배출량 (공공부문 온실가스 목표관리 · 대구본원 · tCO₂eq) — 해마다 조정되는 값
  //  기본값 = 연도별 기준배출량 표의 합계 · 데이터 관리 → 연도 마감·로드맵에서 고치면 DB(env_settings.ghg_base)에 저장한 값을 씀
  //  27~50년은 26년 값(1,593.162)으로 채워 둠 — 정해지면 데이터 관리에서 고침 (올해 이후 값을 고치면 뒤 연도도 함께)
  const GHG_BASE_DEFAULT = { 2016: 2053.428, 2017: 2066.453, 2018: 2066.453, 2019: 2066.453, 2020: 2066.453, 2021: 2066.453, 2022: 2066.453,
                             2023: 2412.65, 2024: 1594.65, 2025: 1593.162, 2026: 1593.162,
                             ...Object.fromEntries(Array.from({ length: 24 }, (_, i) => [2027 + i, 1593.162])) };
  let ghgBaseY = GHG_BASE_DEFAULT;   // 지금 쓰는 표 (loadAll에서 DB 값으로 바꿈)
  // 그 해 적용 기준배출량: 그 해 값이 없으면 앞 연도 값을 그대로 씀 (예: 27년 = 26년 값) · 첫 해보다 앞이면 없음(null)
  function baseOf(y, tbl) {
    if (!tbl || typeof tbl !== 'object') tbl = ghgBaseY;   // map(baseOf)처럼 불려도 안전하게
    let best = null, by = -Infinity;
    for (const k in tbl) { const ky = +k; if (ky <= +y && ky > by && tbl[k] > 0) { by = ky; best = +tbl[k]; } }
    return best;
  }
  // 온실가스 감축 목표 — 자체 로드맵(2050 중장기 전략), 대구본원 기준 연도별 목표배출량(tCO₂eq)
  //  감축률은 그 해 기준배출량 대비로 계산 (기준배출량을 고치면 함께 바뀜 · 지금 값이면 24년 26.4% … 50년 87.6%)
  const ROADMAP_DEFAULT = (() => {
    const T = [1173.66, 1132.584, 1092.944, 1054.691, 1017.777, 982.154, 947.779, 900.390, 855.371, 812.602, 771.972, 733.373, 696.705,
               661.869, 628.776, 597.337, 567.470, 510.723, 459.651, 413.686, 372.317, 335.086, 301.577, 271.419, 244.277, 219.850, 197.865];
    return Object.fromEntries(T.map((t, i) => [2024 + i, { target: t }]));
  })();
  // 지금 쓰는 자체 목표 = 기본 로드맵 + 데이터 관리에서 입력한 값 (loadAll에서 다시 채움 · 같은 객체를 고쳐 씀)
  const ROADMAP = Object.fromEntries(Object.entries(ROADMAP_DEFAULT).map(([y, r]) => [y, { ...r }]));
  function applyOwnTargets(own) {
    Object.keys(ROADMAP).forEach(k => delete ROADMAP[k]);
    Object.entries(ROADMAP_DEFAULT).forEach(([y, r]) => { ROADMAP[y] = { ...r }; });
    Object.entries(own || {}).forEach(([y, t]) => { ROADMAP[y] = { ...(ROADMAP[y] || {}), target: t }; });
  }
  const ownRate = y => { const t = ROADMAP[y]?.target, b = baseOf(y); return t != null && b ? (b - t) / b * 100 : null; };   // 자체 목표 감축률(%)
  // 공공부문 권장감축률 (법적 기준, 그 해 기준배출량 대비 %) — 16~30년 확정값
  //  감축목표량 = 기준배출량 × 권장감축률 · 법적 목표(배출허용량) = 기준배출량 − 감축목표량
  const LAW_RATE_DEFAULT = { 2016:22, 2017:24, 2018:26, 2019:28, 2020:30, 2021:32, 2022:34, 2023:36,
                             2024:13.2, 2025:15.2, 2026:17.4, 2027:20.1, 2028:23.7, 2029:28.1, 2030:37.4 };
  // 31~50년 권장감축률: 아직 확정되지 않은 참고값 (30년 37.4% → 50년 100%)
  //  로드맵 그래프·표에서만 '미확정'으로 흐리게 보여 주고 목표 달성 판정에는 쓰지 않음 · 데이터 관리에서 그 해 법적 목표를 입력하면 확정값으로 씀
  const LAW_RATE_TENT_DEFAULT = Object.fromEntries([40.52, 43.64, 46.76, 49.88, 53, 56.13, 59.26, 62.39, 65.52, 68.65,
    71.78, 74.91, 78.04, 81.17, 84.3, 87.43, 90.56, 93.69, 96.82, 100].map((r, i) => [2031 + i, r]));
  // 지금 쓰는 권장감축률 = 기본값 + 데이터 관리에서 입력한 법적 목표로 계산한 값 (loadAll에서 다시 채움 · 같은 객체를 고쳐 씀)
  const LAW_RATE = { ...LAW_RATE_DEFAULT };
  function applyLawRates(lr) {
    Object.keys(LAW_RATE).forEach(k => delete LAW_RATE[k]);
    Object.assign(LAW_RATE, LAW_RATE_DEFAULT, lr || {});
  }
  // 지금 쓰는 미확정 권장감축률 = 기본값 + 데이터 관리에서 고친 값(env_settings.ghg_law_tent) · 확정(LAW_RATE)에 있는 해는 확정이 우선
  const LAW_TENT = { ...LAW_RATE_TENT_DEFAULT };
  function applyLawTent(t) {
    Object.keys(LAW_TENT).forEach(k => delete LAW_TENT[k]);
    Object.assign(LAW_TENT, LAW_RATE_TENT_DEFAULT, t || {});
  }
  // 그 해 법적 목표: 확정 권장감축률이 있으면 그 값, 없으면 31~50년 미확정 참고값(tent: true) · 기준배출량이 없으면 null
  //  rate = 권장감축률(%) · cut = 감축목표량(t) · t = 배출허용량(법적 목표, t)
  function lawOf(y) {
    const b = baseOf(y), conf = LAW_RATE[y], r = conf !== undefined ? conf : LAW_TENT[y];
    return r === undefined || !b ? null : { rate: r, cut: b * r / 100, t: b * (1 - r / 100), tent: conf === undefined };
  }
  // RE100 이행 목표 (정부 기준, 이행률 %) — 26년부터 · 25년 이전은 목표 없음 · 31~49년은 정해진 값이 없어 그래프에서만 30→50년을 잇는 선
  const RE_GOAL = { 2026: 15, 2027: 25, 2028: 36, 2029: 48, 2030: 60, 2050: 100 };
  const reGoalOf = y => RE_GOAL[+y] ?? null;
  const RE_FIRST = Math.min(...Object.keys(RE_GOAL).map(Number));   // 이행 목표가 시작되는 해
  // 목표를 적용하는 거점 — 그 밖의 거점·'전체'에서는 목표 카드를 숨기고 모니터링만 보여 줌
  // 목표별 대상 거점 — 온실가스 = 대구본원 · RE100 = 대구본원 + 제주 합산 · 폐기물 = 세 거점 합산 (목표·로드맵 탭은 이 묶음으로 집계)
  const TARGET_SITES = { ghg: ['대구본원'], re: ['대구본원', '제주글로벌센터'], waste: ['대구본원', '제주글로벌센터', '서울사무소'] };
  /* ── 경영평가 계량지표 (100점) ─────────────────────────────────────────────────
     ① 이행연도 온실가스 감축목표 달성률 (60점)
        감축률(%)    = (기준배출량 − 이행연도 배출량) ÷ 기준배출량 × 100
        달성률(지수) = 감축률 ÷ 그 해 권장감축률 × 60      — 권장감축률 이상이면 60점
     ② 에너지 사용량 절감 실적 (40점)
        절감률 X(%)  = (B − A) ÷ B × 100
          A = 당해연도 본사(대구본원) 전력·도시가스·지역난방 TOE 합계 (실적이 들어온 달까지)
          B = 기준연도(20~22년) 같은 기간 TOE 합계의 평균
        평정점 = 40점 (X ≥ 1%) · 20점 (1% > X ≥ 0.5%) · 0점 (X < 0.5%)
        X가 1%에 못 미치면 RE100 이행실적(녹색프리미엄·제3자/직접 PPA 구매량)을 그 해 절감량으로 추가 인정받을 수 있음 */
  const EVAL = {
    site: '대구본원',                                  // 본사(본청) — ORG_SITE와 같은 거점
    types: ['전력', '도시가스', '지역난방'],           // 산식이 정한 세 가지만 (차량연료 제외)
    baseYears: ['2020', '2021', '2022'],              // 기준연도
    ghgPt: 60, enPt: 40,
    enSteps: [[1, 40], [0.5, 20]],                    // [절감률 하한(%), 평정점] — 위에서부터 처음 맞는 칸
  };
  // TOE 환산계수 — 에너지법 시행규칙 [별표] 에너지열량 환산기준 (22.11.21 개정)
  //  전력 0.000229 toe/kWh (전기 소비기준 2,290 kcal) · 도시가스 0.001019 toe/Nm³ (LNG 총발열량 42.7 MJ)
  //  지역난방은 별표에 없어 1 Gcal = 0.1 toe를 GJ로 환산 (0.1 ÷ 4.1868)
  //  계수가 개정되면 데이터 관리 → 연도 마감·로드맵의 'TOE 환산계수'에서 고침 (env_settings.toe_factor)
  const TOE_DEFAULT = { '전력': 0.000229, '도시가스': 0.001019, '지역난방': +(0.1 / 4.1868).toFixed(9) };
  let toeF = { ...TOE_DEFAULT };   // 지금 쓰는 계수 (loadAll에서 DB 값으로 덮어씀)
  // 거점별 적용 항목 — 그 거점에서 쓰지 않는 항목은 입력 목록·현황판·화면에서 뺌
  //  기본값: 차량연료(휘발유·경유)·승강기 회생제동·지역난방·업무용 차량/친환경차는 대구본원만
  //  데이터 관리 → 연도 마감·로드맵의 '거점별 적용 항목'에서 거점마다 고칠 수 있음 (env_settings.site_na)
  const SITE_NA_DEFAULT = {
    '서울사무소':     ['휘발유', '경유', '승강기 회생제동', '지역난방', '업무용 차량', '친환경차'],
    '제주글로벌센터': ['휘발유', '경유', '승강기 회생제동', '지역난방', '업무용 차량', '친환경차'],
  };
  const SITE_NA = {};   // 지금 쓰는 값 (loadAll에서 DB 값으로 다시 채움 · 같은 객체를 고쳐 씀)
  function applySiteNa(v) {
    Object.keys(SITE_NA).forEach(k => delete SITE_NA[k]);
    Object.entries(v || SITE_NA_DEFAULT).forEach(([st, items]) => { SITE_NA[st] = [...items]; });
  }
  applySiteNa(null);
  const itemNA = (site, item) => !!SITE_NA[site]?.includes(item);
  const siteOf = item => SITES.filter(s => !itemNA(s, item));   // 그 항목을 쓰는 거점
  const allNA = (si, item) => (si ? [si] : SITES).every(s => itemNA(s, item));   // 고른 거점(또는 전체)에서 모두 해당 없음
  const PAGE_SIZE = 25;
  // 폐기물(종량제 봉투) 환산
  const WASTE_KG_PER_L = 0.174; // 봉투 1L당 무게(kg) — 환경정보공개시스템 비가정부문 환산기준
  // 폐기물 소각·매립 혼합 유효 배출계수 (tCO₂eq/ton) — 2024 시·도 폐기물 처리통계 기반 사업장별 추정계수
  //  기본계수: 소각 1.182 · 매립 0.45515 (에너지회수 미산정) · 대구본원 0.477114(소각 21.19%+매립 49.79%, 에너지회수 29.02%는 산정 제외) · 제주 1.138357(소각 94%+매립 6%) · 서울 미산정
  const WASTE_EF = { '대구본원': 0.477114, '제주글로벌센터': 1.138357 };   // 그 밖(서울 등): 미산정(null)
  const WASTE_EF_TXT = '사업장별 유효계수 (대구 0.477114 · 제주 1.138357 · 서울 미산정) tCO₂eq/ton';
  const TRAIN_N = 2;            // 예측 학습에 쓰는 직전 연도 수 (매년 자동으로 바뀜)
  // 기타 환경지표 (env_metrics 테이블) — month: 월별 'YYYY-MM' / year: 연도별 'YYYY'(연말 기준)
  const WATER = '용수', EV_ALL = '업무용 차량', EV_GREEN = '친환경차';
  // PUE = 데이터센터 총 전력 ÷ IT 장비 전력 · 클라우드 전환률 = 클라우드 전환 시스템 ÷ 운영 정보시스템 (연도별 · 기관 전체 = 대구본원에 저장)
  const PUE_TOTAL = '데이터센터 총 전력', PUE_IT = 'IT 장비 전력', CL_ALL = '운영 정보시스템', CL_DONE = '클라우드 전환 시스템', ORG_SITE = '대구본원';
  const icn      = n => `<svg class="ic" aria-hidden="true"><use href="#i-${n}"/></svg>`;   // 선 아이콘 (스프라이트)
  const MASCOT_EMPTY = 'img/mascot-empty.png';
  { const _m = $('manage-init-mascot'); if (_m) _m.src = MASCOT_EMPTY; }
  const METRICS = {
    [WATER]:    { unit: '㎥', freq: 'month', icon: icn('drop') },
    [EV_ALL]:   { unit: '대', freq: 'year',  icon: icn('car') },
    [EV_GREEN]: { unit: '대', freq: 'year',  icon: icn('battery') },
    [PUE_TOTAL]: { unit: 'kWh', freq: 'year', icon: icn('monitor') },
    [PUE_IT]:    { unit: 'kWh', freq: 'year', icon: icn('monitor') },
    [CL_ALL]:    { unit: '개', freq: 'year', icon: icn('cloud') },
    [CL_DONE]:   { unit: '개', freq: 'year', icon: icn('cloud') },
  };
  // 거점마다 해당 여부를 정할 수 있는 항목 (데이터 관리 → 거점별 적용 항목) — PUE·클라우드는 기관 전체 값이라 뺌
  const NA_ITEMS = [
    { k: '전력', icon: icn('bolt'), g: '에너지' }, { k: '도시가스', icon: icn('flame'), g: '에너지' }, { k: '지역난방', icon: icn('heat'), g: '에너지' },
    { k: '휘발유', icon: icn('pump'), g: '에너지' }, { k: '경유', icon: icn('truck'), g: '에너지' },
    { k: RE_SELF, icon: icn('sun'), g: '재생에너지', name: '재생에너지 자가발전' }, { k: RE_BUY, icon: icn('leaf'), g: '재생에너지' },
    { k: SAVE_REGEN, icon: icn('lift'), g: '절감' },
    { k: '폐기물', icon: icn('trash'), g: '자원' }, { k: WATER, icon: icn('drop'), g: '자원' },
    { k: EV_ALL, with: [EV_GREEN], icon: icn('battery'), name: '친환경차 전환율', sub: '업무용 차량 · 친환경차', g: '차량' },
  ];
  const rmEnd = () => Math.max(2030, new Date().getFullYear() + 4); // 폐기물 감축 로드맵 마지막 연도

  /* ── 계산 헬퍼 ──────────────────────────────────────── */
  const calcGHG  = (t, a) => { const f = GHG[t]; return f ? a * f.factor / f.div : 0; };
  const calcKg   = (s, q) => s * q * WASTE_KG_PER_L;
  const calcTon  = (s, q) => calcKg(s, q) / 1000;
  const wasteEF  = site => (WASTE_EF[site] ?? null);
  const wasteGhg = (ton, site) => { if (ton == null) return null; const ef = wasteEF(site); return ef == null ? null : ton * ef; };
  const targetsFor = si => ({ ghg: TARGET_SITES.ghg.includes(si), re: TARGET_SITES.re.includes(si), wt: v2 && TARGET_SITES.waste.includes(si) });
  const josa = (w, a, b) => { const c = String(w).charCodeAt(String(w).length - 1) - 0xAC00; return c >= 0 && c <= 11171 && c % 28 ? a : b; }; // 은/는 등
  const near     = (x, y) => Math.abs(x - y) <= 1e-6 * Math.max(1, Math.abs(y)); // 저장값 비교 (DB 반올림 오차 허용)
  const sumBy    = (arr, f) => arr.reduce((a, r) => a + (+f(r) || 0), 0);
  const sumArr   = arr => (arr || []).reduce((a, v) => a + (v || 0), 0);
  const medianOf = xs => { const a = [...xs].sort((x, y) => x - y), h = a.length >> 1; return !a.length ? 0 : a.length % 2 ? a[h] : (a[h - 1] + a[h]) / 2; };
  // 카드 경고 기준: 전년 동기 대비 +10% · 평년(같은 달 평균) 대비 +20% · 한 칸이 평소의 3배 이상이면 입력 실수 의심
  const AL = { yoy: 10, norm: 20, spike: 3 };
  const calcStore = {};   // 화면마다(올해 현황 '' · 실적 조회 'y-') 카드별 계산 근거
  const m12      = f => Array.from({ length: 12 }, (_, i) => f(i));
  // 숫자 표시: 더하기에서 생기는 아주 작은 오차(…4999999)를 먼저 걷어 낸 뒤 반올림 (넷째 자리 5는 올림)
  const fmt      = (n, d=2) => (n === null || n === undefined || isNaN(n)) ? '—' : (+Number(n).toPrecision(12)).toLocaleString('ko-KR', { minimumFractionDigits:d, maximumFractionDigits:d });
  // 수량(사용량·배출량·발생량·용수 등)의 합계·평균 자릿수 — 보고서 기준: 소수점 넷째 자리에서 반올림해 셋째 자리까지 (비율 %는 0.0%, 개수는 정수)
  const DQ       = 3;
  // 수량 표시: 소수점 넷째 자리 이상이면 반올림해 셋째 자리까지, 끝의 0은 생략 (예: 1,354,469 · 184.93 · 17.381)
  // 자릿수는 크기에 따라: 1,000 이상 정수 · 100 이상 1자리 · 10 이상 2자리 · 그 아래 DQ(3)자리.
  // 표시 전용(입력·저장 경로에서는 쓰지 않음). 정밀값이 필요한 곳은 fmt(n, d) 로 자릿수를 직접 준다.
  const fqDigits = n => { const a = Math.abs(n); return a >= 1000 ? 0 : a >= 100 ? 1 : a >= 10 ? 2 : DQ; };
  const fq       = n => (n === null || n === undefined || isNaN(n)) ? '—' : (+Number(n).toPrecision(12)).toLocaleString('ko-KR', { minimumFractionDigits: 0, maximumFractionDigits: fqDigits(n) });
  const roundD   = (n, d = DQ) => +(+Number(n).toPrecision(12)).toLocaleString('en-US', { useGrouping: false, maximumFractionDigits: d });   // CSV용 숫자
  const fmtYM    = ym => { if(!ym) return '—'; const [y,m] = String(ym).split('-'); return m ? `${y}년 ${+m}월` : `${y}년`; };
  const fmtTs    = ts => ts ? new Date(ts).toLocaleDateString('ko-KR') : '—';
  const pad      = n => String(n).padStart(2, '0');
  const fmtDT    = ts => { const d = new Date(ts); return `${String(d.getFullYear()).slice(2)}.${pad(d.getMonth() + 1)}.${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`; };
  // HTML에 넣는 사용자 입력(비고 등)은 반드시 이스케이프
  const esc      = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  /* ── Supabase REST ──────────────────────────────────── */
  const SB_URL = 'https://yyvfxecvcgfvqpydhqsh.supabase.co';
  const SB_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inl5dmZ4ZWN2Y2dmdnFweWRocXNoIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODkwMTA1MjIsImV4cCI6MjEwNDU4NjUyMn0.0koO0AaM0vLKESAn7qqwNpwdygcroln1zu9YpflT_oU';
  const HDR = {
    'apikey': SB_KEY,
    'Authorization': `Bearer ${SB_KEY}`,
    'Content-Type': 'application/json',
    'Prefer': 'return=representation'
  };

  /* ── 로그인 (Supabase Auth) ─────────────────────────────
     세션 = { access_token, refresh_token, expires_at(초), user: { id, email } } — 이 브라우저에 기억 (로그아웃하면 지움)
     모든 DB 요청은 로그인한 사람의 토큰으로 → DB 접근 규칙(RLS)이 권한별로 막음 (화면에서 버튼을 숨기는 건 보조)
     권한: admin 관리자 · editor 입력·수정 · viewer 모니터링 · null 승인 대기 (supabase/auth_roles.sql) */
  // 응답이 없으면 오래 기다리지 않음 — 막히거나 느린 사이트 때문에 로딩에서 멈추지 않게 (DB 20초 · 날씨 6초)
  const fetchT = (url, opts = {}, ms = 20000) => {
    const ac = new AbortController();
    setTimeout(() => ac.abort(), ms);
    return fetch(url, { ...opts, signal: ac.signal });
  };
  const AUTH_KEY = 'nia-env.auth';
  const ROLE_NAME = { admin: '관리자', editor: '입력·수정', viewer: '모니터링' };
  let session = null, me = null, users = [];   // me = app_users 내 줄 { user_id, email, name, dept, role } · users = 사용자 목록 (관리자만 받음)
  const canEdit = () => me?.role === 'admin' || me?.role === 'editor';
  const isAdmin = () => me?.role === 'admin';
  // data-need="edit"(입력·수정·관리자) · "admin"(관리자) 요소를 지금 권한으로 쓸 수 있는지
  const needOk = el => !((el.dataset.need === 'edit' && !canEdit()) || (el.dataset.need === 'admin' && !isAdmin()));
  const forAdmin = s => isAdmin() ? s : '';   // 관리자만 할 수 있는 일을 안내하는 문구
  // 보기만 할 때 팝업 아래 안내 (로그인 안 함 · 승인 대기 · 모니터링·권한 없음)
  const viewOnlyMsg = () => !session ? '보기 전용이에요 · 입력·수정은 로그인 후 (권한 필요)'
    : !me?.role && !me?.approved_by ? '보기 전용이에요 · 관리자가 승인하면 고칠 수 있어요' : '보기 전용이에요 (입력·수정 권한 없음)';
  const whoName = e => !e ? '' : users.find(x => x.email === e)?.name || (me?.email === e && me.name) || (e.includes('@') ? e.split('@')[0] : e);   // 관리자 = 사용자 목록 · 그 밖엔 내 이름만 앎
  /* ── 누가 입력·수정했나 — 변경 이력(change_log)에서 ─────────────────────────────────────────
     DB 보기 record_who (supabase/who_changed.sql) = 자료마다 처음 입력한 사람 · 마지막으로 바꾼 사람 (이름은 바꾼 그때 이름)
     보기가 아직 없으면 변경 이력 최근 3,000건으로 셈 (이름은 관리자 화면에서만 · 그 밖엔 이메일 앞부분)
     입력·수정 · 관리자만 (변경 이력을 읽을 수 있는 사람과 같음) — 로그인하지 않았거나 모니터링이면 없음 */
  let whoMap = null, whoView = null, whoAt = null, whoUser = null;   // whoMap: 'energy|<id>' → { by, name, at, act, firstBy, firstName, firstAt } · whoView: 보기가 있나 (모름 = null) · whoAt: 지금까지 본 가장 최근 변경 (다음엔 그 뒤만 받음)
  const WHO_TABLES = ['energy', 'waste', 'env_metrics', 'env_settings'];
  // 변경 이력 한 줄을 합침 — 더 최근이면 '마지막 변경'을 바꾸고, INSERT는 가장 이른 것을 '처음 입력'으로 (같은 줄을 다시 받아도 그대로)
  const mergeWho = (map, r) => { const k = `${r.table_name}|${r.record_id}`, nm = r.changed_by_name ?? null; let w = map.get(k);
    if (!w) map.set(k, w = { by: r.changed_by, name: nm, at: r.changed_at, act: r.action });
    else if (r.changed_at > w.at) Object.assign(w, { by: r.changed_by, name: nm, at: r.changed_at, act: r.action });
    if (r.action === 'INSERT' && (!w.firstAt || r.changed_at < w.firstAt)) Object.assign(w, { firstBy: r.changed_by, firstName: nm, firstAt: r.changed_at }); };
  async function loadWho() {
    if (!session || !canEdit()) { whoMap = null; whoAt = null; return; }
    if (whoUser !== me?.email) { whoMap = null; whoAt = null; whoUser = me?.email; }   // 다른 사람으로 로그인하면 새로
    const inc = !!(whoMap && whoAt), map = inc ? whoMap : new Map(), since = inc ? whoAt : null;
    const seen = at => { if (at && (!whoAt || at > whoAt)) whoAt = at; };
    if (whoView !== false) {
      try {
        for (let off = 0; ; off += 1000) {
          const rs = await sb('GET', 'record_who', `?select=*${since ? `&updated_at=gt.${encodeURIComponent(since)}` : ''}&order=table_name.asc,record_id.asc&limit=1000&offset=${off}`);
          rs.forEach(r => { map.set(`${r.table_name}|${r.record_id}`, { by: r.updated_by, name: r.updated_by_name, at: r.updated_at, act: r.last_action,
            firstBy: r.created_by, firstName: r.created_by_name, firstAt: r.created_at }); seen(r.updated_at); });
          if (rs.length < 1000) break;
        }
        whoView = true; whoMap = map; return;
      } catch (e) {
        if (!isMissingTable(e)) { console.warn('[누가: record_who]', e); return; }   // 잠깐 안 되면 전에 받은 그대로
        whoView = false;
      }
    }
    try {   // 보기가 없으면 변경 이력에서 — 처음엔 최근 3,000건 · 다음부터는 그 뒤에 생긴 줄만
      for (let off = 0; off < 3000; off += 1000) {
        const rs = await sb('GET', 'change_log', `?select=table_name,record_id,action,changed_at,changed_by&table_name=in.(${WHO_TABLES.join(',')})` +
          `${since ? `&changed_at=gt.${encodeURIComponent(since)}` : ''}&order=changed_at.desc&limit=1000&offset=${off}`);
        rs.forEach(r => { mergeWho(map, r); seen(r.changed_at); });
        if (rs.length < 1000) break;
      }
      whoMap = map;
    } catch (e) { console.warn('[누가: 변경 이력]', e); }
  }
  const whoOf = (t, id) => id == null ? null : whoMap?.get(`${t}|${id}`) || null;
  // 여러 자료(그 달 봉투 규격들처럼) 중 마지막으로 바꾼 것 · 처음 입력은 가장 이른 것
  function whoLatest(t, recs) {
    if (!whoMap) return null;
    let last = null, first = null;
    (recs || []).forEach(r => { const w = r && whoOf(t, r.id); if (!w) return;
      if (!last || w.at > last.at) last = w;
      if (w.firstAt && (!first || w.firstAt < first.firstAt)) first = w; });
    return !last ? null : first && first !== last ? { ...last, firstBy: first.firstBy, firstName: first.firstName, firstAt: first.firstAt } : last;
  }
  const whoLabel = w => w?.by ? (w.name || whoName(w.by)) : '';
  const whoFirstLabel = w => w?.firstBy ? (w.firstName || whoName(w.firstBy)) : '';
  const WHO_ACT = { INSERT: '입력', UPDATE: '수정', DELETE: '삭제' };
  // 짧은 날짜 — 올해면 '10.28' · 다른 해면 '25.12.3'
  const whoWhen = ts => { if (!ts) return ''; const d = new Date(ts);
    return `${d.getFullYear() === new Date().getFullYear() ? '' : `${String(d.getFullYear()).slice(2)}.`}${d.getMonth() + 1}.${d.getDate()}`; };
  // 마우스를 올리면 — '처음 입력 박신규 · 26.10.01 09:00 / 마지막 수정 이동환 · 26.10.28 14:02'
  function whoTitle(w) {
    if (!w) return '';
    const nm = x => x || '누군지 기록 없음 (로그인 기능 전)', last = `${WHO_ACT[w.act] || '변경'} ${nm(whoLabel(w))} · ${fmtDT(w.at)}`;
    return !w.firstAt || (w.firstAt === w.at && w.firstBy === w.by) ? last : `처음 입력 ${nm(whoFirstLabel(w))} · ${fmtDT(w.firstAt)}\n마지막 ${last}`;
  }
  // 입력표 끝 칸 — 저장된 칸: 마지막으로 바꾼 사람 · 날짜 (마우스를 올리면 처음 입력한 사람까지) · 누군지 모르면 '기저장'
  const savedBadge = (t, recs) => { const w = whoLatest(t, recs), nm = whoLabel(w);
    return !w ? '<span class="existing-badge">기저장</span>'
      : `<span class="existing-badge who-b" title="${esc(whoTitle(w))}"><span class="wb-n">${esc(nm || '기저장')}</span><small>${whoWhen(w.at)}</small></span>`; };
  // 에너지 자료 찾기 (거점|에너지원|YYYY-MM → 자료들) — 자료를 다시 불러오면 새로 만듦
  let eIdx = null, eIdxSrc = null;
  const energyAt = (site, t, ym) => {
    if (eIdxSrc !== energyRecs) { eIdx = new Map(); energyRecs.forEach(r => { const k = `${r.site}|${r.type}|${r.date}`; if (!eIdx.has(k)) eIdx.set(k, []); eIdx.get(k).push(r); }); eIdxSrc = energyRecs; }
    return eIdx.get(`${site}|${t}|${ym}`) || [];
  };
  // 입력 현황판 칸 · 그래프에서 연 자료의 칸 — 그 칸 자료를 누가 마지막으로 바꿨나
  const whoCell = (site, item, ym) => item === '폐기물' ? whoLatest('waste', wasteRecs.filter(r => r.site === site && r.date === ym))
    : item === WATER ? whoLatest('env_metrics', [metricOf(ym, site, WATER)]) : whoLatest('energy', energyAt(site, item, ym));
  const whoShort = w => w ? `${whoLabel(w) || '누군지 기록 없음'} ${WHO_ACT[w.act] || '변경'} ${whoWhen(w.at)}` : '';
  // 설정 카드 머리 — '마지막 변경 이동환 · 26.10.28 14:02' (카드에 딸린 설정 키 중 가장 최근)
  function renderWhoLines() {
    document.querySelectorAll('[data-who]').forEach(el => {
      const ks = el.dataset.who.split(','), w = whoLatest('env_settings', ks.map(k => ({ id: k })));
      el.hidden = !w;
      el.innerHTML = !w ? '' : `마지막 변경 <b>${esc(whoLabel(w) || '누군지 기록 없음')}</b> · ${fmtDT(w.at)}${w.act === 'DELETE' ? ' (기본값으로 되돌림)' : ''}`;
      el.title = whoTitle(w);
    });
  }
  const loadSession = () => { try { const v = JSON.parse(localStorage.getItem(AUTH_KEY) || 'null'); return v?.access_token && v?.refresh_token ? v : null; } catch { return null; } };
  const saveSession = v => { session = v; try { v ? localStorage.setItem(AUTH_KEY, JSON.stringify(v)) : localStorage.removeItem(AUTH_KEY); } catch { /* 기억 못 해도 이번 창에서는 동작 */ } };
  const toSession = j => ({ access_token: j.access_token, refresh_token: j.refresh_token,
    expires_at: j.expires_at || Math.floor(Date.now() / 1000) + (j.expires_in || 3600), user: { id: j.user?.id, email: j.user?.email } });
  // 로그인 서버 오류 → 알아듣기 쉬운 말
  const AUTH_ERR = {
    invalid_credentials: '이메일이나 비밀번호가 맞지 않아요', invalid_grant: '이메일이나 비밀번호가 맞지 않아요',
    user_already_exists: '이미 가입한 이메일이에요 · 로그인해 주세요', email_exists: '이미 가입한 이메일이에요 · 로그인해 주세요',
    weak_password: '비밀번호가 너무 쉬워요 · 8자 이상으로 숫자·글자를 섞어 주세요', same_password: '새 비밀번호가 지금 비밀번호와 같아요',
    email_address_invalid: '이메일 주소를 확인해 주세요', validation_failed: '이메일 주소를 확인해 주세요',
    signup_disabled: '지금은 회원가입이 꺼져 있어요 · 관리자에게 문의하세요 (Supabase → Authentication에서 가입 허용)',
    email_not_confirmed: '이메일 확인이 아직 안 됐어요 · 관리자에게 문의하세요 (Supabase에서 Confirm email 끄기)',
    over_request_rate_limit: '요청이 많아요 · 잠시 뒤 다시 시도해 주세요', over_email_send_rate_limit: '메일 발송 한도를 넘었어요 · 잠시 뒤 다시 시도해 주세요',
    refresh_token_not_found: '로그인이 끝났어요 · 다시 로그인해 주세요', session_not_found: '로그인이 끝났어요 · 다시 로그인해 주세요',
  };
  async function authApi(path, body, method = 'POST', token = null) {
    let res;
    try {
      res = await fetchT(`${SB_URL}/auth/v1/${path}`, { method, headers: { apikey: SB_KEY, 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        ...(body != null ? { body: JSON.stringify(body) } : {}) });
    } catch (e) { const err = new Error('서버에 연결할 수 없어요 · 네트워크를 확인해 주세요'); err.network = true; throw err; }
    const text = await res.text(); let j = {};
    try { j = text ? JSON.parse(text) : {}; } catch { /* JSON이 아닌 응답 */ }
    if (!res.ok) {
      const code = j.error_code || j.error || '', raw = j.msg || j.error_description || j.message || text;
      const err = new Error(AUTH_ERR[code] || (res.status === 429 ? AUTH_ERR.over_request_rate_limit : /password/i.test(raw) && /(6|8) characters|at least/i.test(raw) ? AUTH_ERR.weak_password : raw || `HTTP ${res.status}`));
      err.status = res.status; err.code = code; throw err;
    }
    return j;
  }
  // 토큰 갱신 (여러 요청이 동시에 와도 한 번만) — 실패하면 다시 로그인
  let refreshing = null;
  function refreshSession() {
    if (!session?.refresh_token) return Promise.reject(Object.assign(new Error('로그인이 필요해요'), { status: 401 }));
    return refreshing ||= authApi('token?grant_type=refresh_token', { refresh_token: session.refresh_token })
      .then(j => { saveSession(toSession(j)); return session; })
      .finally(() => { refreshing = null; });
  }
  const ensureToken = async () => { if (session && session.expires_at - Date.now() / 1000 < 90) await refreshSession(); };   // 만료 1분 반 전이면 미리
  // 로그인이 끝났을 때 (갱신 실패): 다시 로그인 화면으로 — 로그인하면 이어서 처음부터 불러옴
  function onSessionLost(msg = '로그인이 끝났어요 · 다시 로그인해 주세요') {
    if (!session && $('auth').hidden === false) return;
    saveSession(null); me = null; users = []; stopAutoRefresh(); closeOverlays();
    applyRole();   // 보기 전용으로 ('로그인 없이 현황 보기'를 누르면 그대로 이어서 봄)
    showAuth('login', msg);
  }

  // prefer: 'resolution=merge-duplicates,…' = 같은 키가 있으면 덮어쓰기(upsert)
  // 오류는 서버 메시지(JSON의 message)를 그대로 보여 줌 — 예: 마감된 연도 수정 차단 안내
  const FRIENDLY_ERR = { '23505': '같은 기간·거점에 이미 저장된 값이 있어요', '23514': '입력값이 허용 범위를 벗어났어요',
                         '42501': '권한이 없어요 · 관리자에게 권한을 요청하세요' };
  // 예전에 만든 DB 표에 '비고·구분'처럼 없어도 되는 칸이 없으면 그 칸을 빼고 다시 저장 (이후 저장에서도 뺌)
  const OPTIONAL_COLS = ['note', 'scope'], noCols = {};
  const stripCols = (b, cols) => Array.isArray(b) ? b.map(o => stripCols(o, cols)) : Object.fromEntries(Object.entries(b).filter(([k]) => !cols.includes(k)));
  let noteWarned = false;
  async function sb(method, table, query = '', body = null, prefer = 'return=representation', _retry = 0) {
    const writes = body != null && (method === 'POST' || method === 'PATCH');
    if (writes && noCols[table]?.size) body = stripCols(body, [...noCols[table]]);
    try { await ensureToken(); } catch (e) { if (!e.network) onSessionLost(); throw e; }
    let res;
    try {
      res = await fetchT(`${SB_URL}/rest/v1/${table}${query}`, {
        method, headers: { ...HDR, Authorization: `Bearer ${session?.access_token || SB_KEY}`, Prefer: prefer },
        ...(body != null ? { body: JSON.stringify(body) } : {})
      });
    } catch (e) {
      // 네트워크 오류 — 읽기 요청은 최대 2회 재시도 (1초·3초 대기)
      if (!writes && _retry < 2) { await new Promise(r => setTimeout(r, _retry === 0 ? 1000 : 3000)); return sb(method, table, query, body, prefer, _retry + 1); }
      const err = new Error(e?.name === 'AbortError' ? '서버 응답이 없어요 · 네트워크를 확인해 주세요' : '서버에 연결할 수 없어요 · 네트워크를 확인해 주세요');
      err.network = true;
      if (lastLoadAt) netDown(err);   // 화면을 연 뒤에 끊긴 것 (처음 불러오기 실패는 '서버 연결 실패' 화면이 맡음)
      throw err;
    }
    // 5xx 서버 에러 — 읽기 요청은 최대 2회 재시도
    if (res.status >= 500 && !writes && _retry < 2) { await new Promise(r => setTimeout(r, _retry === 0 ? 1000 : 3000)); return sb(method, table, query, body, prefer, _retry + 1); }
    // 토큰이 만료됐으면(401) 한 번 갱신하고 다시 · 갱신도 안 되면 다시 로그인
    if (res.status === 401 && session && _retry < 1) {
      try { await refreshSession(); } catch (e) { if (!e.network) onSessionLost(); throw e; }
      return sb(method, table, query, body, prefer, _retry + 1);
    }
    if (!res.ok) {
      const text = await res.text();
      let msg = text, code = '', raw = '';
      try { const j = JSON.parse(text); code = j.code || ''; raw = j.message || ''; msg = FRIENDLY_ERR[code] || raw || text; } catch { /* JSON이 아닌 오류 */ }
      // PGRST204: "Could not find the 'note' column of 'waste' in the schema cache"
      const miss = code === 'PGRST204' ? /'([^']+)' column/.exec(raw)?.[1] : null;
      if (writes && miss && OPTIONAL_COLS.includes(miss) && !noCols[table]?.has(miss)) {
        (noCols[table] ||= new Set()).add(miss);
        console.warn(`[DB] ${table} 표에 '${miss}' 칸이 없어 빼고 저장해요`);
        const hadNote = miss === 'note' && [].concat(body).some(o => String(o?.note ?? '').trim());
        if (hadNote && !noteWarned) { noteWarned = true; setTimeout(() => showToast('DB 표에 비고 칸이 없어 비고는 빼고 저장했어요 · supabase/phase2.sql을 한 번 실행하면 비고도 저장돼요', 'err'), 3200); }
        return sb(method, table, query, body, prefer);
      }
      if (miss) msg = `DB의 ${table} 표에 '${miss}' 칸이 없어 저장하지 못했어요 (DB 표 구조 확인 필요)`;
      const err = new Error(msg || `HTTP ${res.status}`);
      err.status = res.status; err.code = code;
      throw err;
    }
    if (res.status === 204 || method === 'DELETE') return [];
    const text = await res.text();
    return text ? JSON.parse(text) : [];
  }

  // 배출량(ghg)은 DB에 저장된 값 대신 '사용량 × 지금 배출계수'로 다시 계산 — 배출계수가 바뀌면 지난 연도까지 같은 계수로 맞춤
  //  (저장된 값은 ghgStored로 남겨, 입력표에서 다시 저장할 때 새 계수로 갱신)
  const normE = r => ({ ...r, ghgStored: r.ghg, ghg: GHG[r.type] ? calcGHG(r.type, +r.amount || 0) : (+r.ghg || 0),
                        createdAt: r.created_at ? +new Date(r.created_at) : null });
  const normW = r => ({
    ...r, bagSize: r.bag_size, weightKg: r.weight_kg, weightTon: r.weight_ton,
    ghg: wasteGhg(+r.weight_ton || 0, r.site), ghgStored: r.ghg,
    createdAt: r.created_at ? +new Date(r.created_at) : null
  });
  const normM = r => ({ ...r, value: +r.value, createdAt: r.created_at ? +new Date(r.created_at) : null,
    updatedAt: r.updated_at ? +new Date(r.updated_at) : null });

  let energyRecs = [], wasteRecs = [], metricRecs = [];
  let managePage = 0;
  // 2단계(phase2.sql) 테이블이 있으면 true — 없으면 기타 지표·연도 마감·로드맵·변경 이력만 꺼지고 나머지는 그대로 동작
  let v2 = false;
  let settings = { closed_years: [], waste_roadmap: null, ghg_base: null, ghg_own: null, ghg_law: null, ghg_law_tent: null, na_cells: new Set(), site_na: null, toe_factor: null, solar_plants: null, ghg_factor_log: [], official_ghg: {} };
  let factorLog = [];   // 배출계수 변경 이력 (env_settings.ghg_factor_log = [{ date, note, by, at, factors }])
  let officialGhg = {};   // 연도별 공식 확정 배출량 (env_settings.official_ghg = { 'YYYY': { total, date, note } })
  const isMissingTable = e => e?.status === 404 || ['PGRST205', '42P01'].includes(e?.code);
  const isClosed = y => v2 && settings.closed_years.includes(String(y).slice(0, 4));
  const lockMsg  = y => `${icn('lock')} ${y}년은 마감된 연도예요${isAdmin() ? ' · 고치려면 데이터 관리 → 연도 마감·로드맵에서 해제하세요' : canEdit() ? ' · 고치려면 관리자에게 마감 해제를 요청하세요' : ''}`;

  /* ── 기상 데이터: 거점별 일평균기온 → 월별 냉난방도일 ── */
  let wxBySite = null; // { 거점: { 'YYYY-MM': { t: 월평균기온, hdd, cdd, days, full } } }

  async function fetchWeatherData() {
    const today = new Date().toISOString().slice(0, 10);
    // sessionStorage 캐시: 기상 관측 데이터는 하루에 한 번만 바뀌므로 같은 날이면 재사용
    const cacheKey = 'wx_' + today;
    try {
      const cached = sessionStorage.getItem(cacheKey);
      if (cached) {
        const parsed = JSON.parse(cached);
        if (parsed && typeof parsed === 'object' && Object.keys(parsed).length) {
          wxBySite = parsed;
          console.log('[기상] 캐시에서 날씨 데이터 로드:', Object.keys(parsed).join(', '));
          return;
        }
      }
    } catch (_) { /* sessionStorage 접근 불가 — 네트워크에서 가져옴 */ }
    const start = `${new Date().getFullYear() - TRAIN_N}-01-01`;
    const res = {};
    await Promise.all(SITES.map(async site => {
      try {
        const [lat, lon] = SITE_COORDS[site];
        const r = await fetchT(`https://archive-api.open-meteo.com/v1/archive?latitude=${lat}&longitude=${lon}` +
                               `&start_date=${start}&end_date=${today}&daily=temperature_2m_mean&timezone=Asia%2FSeoul`, {}, 6000);
        if (!r.ok) return;
        const d = await r.json(), agg = {};
        (d.daily?.time || []).forEach((t, i) => {
          const v = d.daily.temperature_2m_mean[i];
          if (v == null) return;
          const k = t.slice(0, 7), a = agg[k] || (agg[k] = { sum: 0, days: 0, hdd: 0, cdd: 0 });
          a.sum += v; a.days += 1; a.hdd += Math.max(0, DD_BASE - v); a.cdd += Math.max(0, v - DD_BASE);
        });
        res[site] = Object.fromEntries(Object.entries(agg).map(([ym, a]) => {
          const dim = new Date(+ym.slice(0, 4), +ym.slice(5, 7), 0).getDate(); // 그 달 일수
          return [ym, { t: a.sum / a.days, hdd: a.hdd, cdd: a.cdd, days: a.days, full: a.days >= dim - 2 }];
        }));
      } catch (e) { console.warn(`[기상] ${site} 날씨 데이터를 불러오지 못했습니다`, e); }
    }));
    if (Object.keys(res).length) {
      wxBySite = res;
      try { sessionStorage.setItem(cacheKey, JSON.stringify(res)); } catch (_) { /* 저장 실패 무시 */ }
      console.log('[기상] 날씨 데이터 로드 완료:', Object.keys(res).join(', '));
    }
  }
  /* @model-start ── 기상연동 예측 모델 (순수 함수: 검증 스크립트에서도 이 코드를 그대로 사용) ── */
  // 직전 학습연도의 '같은 달 평균'에 해마다의 추세와 냉난방도일(기준 18℃) 편차 보정을 더해, 실적이 없는 달만 예측
  //  hist  : { 'YYYY-MM': 사용량 }               — 한 거점·한 에너지원
  //  wx    : { 'YYYY-MM': { hdd, cdd, full } }   — 같은 거점 월별 냉난방도일 (full = 그 달 관측 완료)
  //  useWx : 기상 보정 여부 (차량연료·재생에너지는 false → 같은 달 평균만 사용)
  const DD_BASE = 18;    // 냉난방도일 기준온도(℃)
  const TREND_CAP = 0.15; // 추세는 연 ±15%까지만 인정 (자료가 튀어도 예측이 멀리 가지 않게)
  function forecastMonthly(hist, wx, trainYears, curYr, useWx) {
    const MOS = ['01','02','03','04','05','06','07','08','09','10','11','12'];
    const avg = a => a.reduce((s, v) => s + v, 0) / a.length;
    const base = {}, baseH = {}, baseC = {}, baseYr = {};
    MOS.forEach(m => {
      const ys = trainYears.filter(y => hist[`${y}-${m}`] != null);
      if (!ys.length) return;
      base[m] = avg(ys.map(y => hist[`${y}-${m}`]));
      baseYr[m] = avg(ys.map(Number));   // 이 달 평균이 가리키는 '가운데 연도' (추세를 끌어올 거리)
      const ws = ys.map(y => wx?.[`${y}-${m}`]);
      if (ws.every(w => w && w.full)) { baseH[m] = avg(ws.map(w => w.hdd)); baseC[m] = avg(ws.map(w => w.cdd)); }
    });
    // 같은 달 평균 대비 편차로 기울기 추정: ΔE = kH·ΔHDD + kC·ΔCDD
    let kH = 0, kC = 0;
    if (useWx) {
      const rows = [];
      trainYears.forEach(y => MOS.forEach(m => {
        const e = hist[`${y}-${m}`], w = wx?.[`${y}-${m}`];
        if (e == null || baseH[m] == null || !w?.full) return;
        rows.push([w.hdd - baseH[m], w.cdd - baseC[m], e - base[m]]);
      }));
      [kH, kC] = fitDegreeDaySlopes(rows);
    }
    // 해마다 줄거나 느는 흐름(추세) — 감축 사업 중이면 이걸 빼먹으면 예측이 높게 나온다.
    // '같은 달 평균'은 학습연도의 가운데를 가리키는데 예측할 해는 그보다 뒤이기 때문.
    // 추위가 심했던 해를 추세로 오해하지 않도록, 날씨 몫을 먼저 뺀 총량으로 변화율을 구한다.
    const ysAll = trainYears.filter(y => MOS.some(m => hist[`${y}-${m}`] != null)).map(Number).sort((a, b) => a - b);
    let yrRate = 1;   // 연평균 변화율 (1 = 변화 없음, 0.95 = 해마다 5%씩 감소)
    if (ysAll.length >= 2) {
      const y0 = ysAll[0], y1 = ysAll[ysAll.length - 1];
      // 두 해 모두 자료가 있는 달만 비교해야 한다 (한쪽만 반년이면 총량 비교가 무의미)
      const common = MOS.filter(m => hist[`${y0}-${m}`] != null && hist[`${y1}-${m}`] != null);
      if (common.length >= 6 && y1 > y0) {
        const norm = y => common.reduce((s, m) => {
          const w = wx?.[`${y}-${m}`];
          const adj = (useWx && w?.full && baseH[m] != null) ? kH * (w.hdd - baseH[m]) + kC * (w.cdd - baseC[m]) : 0;
          return s + (hist[`${y}-${m}`] - adj);
        }, 0);
        const a = norm(y0), b = norm(y1);
        if (a > 0 && b > 0) {
          const r = Math.pow(b / a, 1 / (y1 - y0));
          yrRate = Math.min(1 + TREND_CAP, Math.max(1 - TREND_CAP, r));   // 자료 이상치로 예측이 튀지 않게
        }
      }
    }
    const out = MOS.map(m => {
      const key = `${curYr}-${m}`, actual = hist[key] ?? null;
      if (actual != null || base[m] == null) return { actual, pred: null };
      const w = wx?.[key];
      const adj = (useWx && w?.full && baseH[m] != null) ? kH * (w.hdd - baseH[m]) + kC * (w.cdd - baseC[m]) : 0;
      const tr = Math.pow(yrRate, Number(curYr) - baseYr[m]);   // 가운데 연도 → 예측 연도까지 추세를 끌어옴
      return { actual: null, pred: Math.max(0, base[m] * tr + adj) };
    });
    out.kH = kH; out.kC = kC;        // 학습된 기온 민감도 (예측 근거 표시용)
    out.yrRate = yrRate;             // 연평균 변화율 (예측 근거 표시용)
    return out;
  }
  // 절편 없는 2변수 최소자승. 냉난방이 늘면 사용량도 느는 방향만 인정(음수 기울기는 0)
  function fitDegreeDaySlopes(rows) {
    const sum = f => rows.reduce((a, r) => a + f(r), 0);
    const one = i => { const d = sum(r => r[i] * r[i]); return d > 1e-9 ? Math.max(0, sum(r => r[i] * r[2]) / d) : 0; };
    const hh = sum(r => r[0] * r[0]), cc = sum(r => r[1] * r[1]), hc = sum(r => r[0] * r[1]);
    const he = sum(r => r[0] * r[2]), ce = sum(r => r[1] * r[2]), det = hh * cc - hc * hc;
    if (det > 1e-9) {
      const kH = (he * cc - ce * hc) / det, kC = (ce * hh - he * hc) / det;
      if (kH >= 0 && kC >= 0) return [kH, kC];
      if (kH < 0 && kC < 0) return [0, 0];
      return kH < 0 ? [0, one(1)] : [one(0), 0];
    }
    return [one(0), one(1)];
  }
  /* @model-end */

  // 학습연도: 올해 직전 TRAIN_N개 연도 중 데이터가 있는 해 (해가 바뀌면 자동으로 바뀜)
  function trainYearsFor(curYr) {
    const ys = [...new Set(energyRecs.map(r => (r.date || '').slice(0, 4)))]
      .filter(y => /^\d{4}$/.test(y) && +y < curYr).sort();
    return ys.slice(-TRAIN_N);
  }

  // 올해 기상연동 예측 (실적이 없는 달만 채움)
  //  · 화면용: 선택 거점 기준 ('전체'면 거점별로 각자 이력으로 예측해서 합산)
  //  · 목표카드용 annualPred: 화면 거점 필터와 무관하게 항상 대구본원 Scope 1+2 (실적 + 예측)
  const PRED_TYPES = ['전력', '도시가스', '지역난방', '휘발유', '경유', RE_SELF];
  const WX_TYPES   = new Set(['전력', '도시가스', '지역난방']); // 냉난방도일 보정 대상 (나머지는 같은 달 평균만)

  // '거점|에너지원' → { 'YYYY-MM': 사용량 }
  function seriesHist() {
    const hist = {};
    energyRecs.forEach(r => {
      const k = `${r.site}|${r.type}`, ym = (r.date || '').slice(0, 7);
      const h = hist[k] || (hist[k] = {});
      h[ym] = (h[ym] || 0) + (+r.amount || 0);
    });
    return hist;
  }

  // 입력 칸 규칙: 빈칸 = 누락 · 0 = 입력됨 · '-' = 해당없음 (자료가 없어 비워 두는 칸)
  const isDash = v => /^[-–—]$/.test(String(v ?? '').trim());
  const naKey = (site, item, ym) => `${site}|${item}|${ym}`;
  const isNaCell = (site, item, ym) => settings.na_cells.has(naKey(site, item, ym));
  const numIn = raw => { const t = String(raw).replace(/,/g, '').trim(); return /^\d+(\.\d+)?$/.test(t) ? +t : NaN; };   // 입력칸 숫자 (천 단위 쉼표 허용)
  const NA_V2_MSG = "'-'(해당없음)는 DB 추가 설정(phase2.sql)을 한 뒤에 저장할 수 있어요";
  // 실제로 바뀌는 해당없음 칸만 남김
  const naDiff = (add, del) => ({ add: [...new Set(add)].filter(k => !settings.na_cells.has(k)), del: [...new Set(del)].filter(k => settings.na_cells.has(k)) });
  // 해당없음 목록 저장 — 다른 사람이 방금 바꾼 목록을 덮어쓰지 않게 최신 값을 읽은 뒤 바꿈 → 바뀐 칸 수
  async function saveNa({ add, del }) {
    if (!add.length && !del.length) return 0;
    if (!v2) throw new Error(NA_V2_MSG);
    const cur = cleanNa((await sb('GET', 'env_settings', '?key=eq.na_cells&select=value'))[0]?.value);
    add.forEach(k => cur.add(k)); del.forEach(k => cur.delete(k));
    await sb('POST', 'env_settings', '?on_conflict=key', [{ key: 'na_cells', value: [...cur].sort() }], 'resolution=merge-duplicates,return=minimal');
    settings.na_cells = cur;
    return add.length + del.length;
  }
  function buildForecast(curYr, filterSite) {
    const curYrStr = String(curYr), trainYears = trainYearsFor(curYr);
    if (!trainYears.length) return null;
    const hist = seriesHist();
    const cache = {};
    const series = (site, type) => {
      const k = `${site}|${type}`;
      if (cache[k]) return cache[k];
      const h = hist[k] || {};
      const out = forecastMonthly(h, wxBySite?.[site], trainYears, curYrStr, WX_TYPES.has(type));
      // '-'(해당없음)로 입력한 달 → 예측하지 않고 사용량 0으로 봄 · 빈칸(누락)인 달은 예측으로 채움
      out.forEach((o, i) => { if (o.actual == null && isNaCell(site, type, `${curYrStr}-${pad(i + 1)}`)) { o.actual = 0; o.pred = null; } });
      const active = Object.keys(h).some(ym => trainYears.includes(ym.slice(0, 4)) || ym.startsWith(curYrStr));
      return (cache[k] = { actual: out.map(o => o.actual), pred: out.map(o => o.pred), active });
    };
    const sumOrNull = arr => arr.some(v => v != null) ? arr.reduce((a, v) => a + (v ?? 0), 0) : null;

    // ① 화면용
    const viewSites = filterSite ? [filterSite] : SITES;
    const predEnergy = {};
    const predGhgS1 = Array(12).fill(null), predGhgS2 = Array(12).fill(null), missing = m12(() => []);
    PRED_TYPES.forEach(type => {
      const per = viewSites.map(s => series(s, type)).filter(p => p.active);
      if (isEmit(type)) viewSites.forEach(s => { const p = series(s, type);
        if (p.active) p.pred.forEach((v, i) => { if (v != null) missing[i].push(`${s} ${type}`); }); });
      // 예측분만 (실적이 없는 거점·달) — 누적 막대·RE·연간 예측용
      predEnergy[type] = m12(i => sumOrNull(per.map(p => p.pred[i])));
      if (isEmit(type)) predEnergy[type].forEach((v, i) => {
        if (v == null) return;
        const arr = scopeOf(type) === 'Scope 1' ? predGhgS1 : predGhgS2;
        arr[i] = (arr[i] ?? 0) + calcGHG(type, v);
      });
    });

    // ② 목표카드용: 대구본원 Scope 1+2 (실적은 저장된 배출량, 미입력 달은 예측)
    const actDgb = sumBy(energyRecs.filter(r => r.site === '대구본원' && (r.date || '').startsWith(curYrStr) && isEmit(r.type)), r => r.ghg);
    let predDgb = 0;
    PRED_TYPES.filter(isEmit).forEach(t => series('대구본원', t).pred.forEach(v => { if (v != null) predDgb += calcGHG(t, v); }));
    const annualPred = (actDgb + predDgb) > 0 ? actDgb + predDgb : null;

    return { trainYears, predEnergy, predGhgS1, predGhgS2, annualPred, missing };
  }

  // Supabase는 한 번에 최대 1,000행만 돌려줌(프로젝트 기본값) → 1,000행씩 끝까지 이어 읽음
  async function sbAll(table, order) {
    const PAGE = 1000, out = [];
    for (let off = 0; ; off += PAGE) {
      const rows = await sb('GET', table, `?select=*&order=${order},id.asc&limit=${PAGE}&offset=${off}`);
      out.push(...rows);
      if (rows.length < PAGE) return out;
    }
  }
  // 기준배출량 설정값 검증: { 'YYYY': 0보다 큰 숫자 } 만 남김 (하나도 없으면 null → 기본값)
  // PUE·클라우드 전환률 검증: { 'YYYY': { pue: 1~5, pueNote, cloud: 0~100, cloudNote } } (예전 note는 PUE 비고로)
  function cleanIt(v) {
    const out = {};
    if (!v || typeof v !== 'object' || Array.isArray(v)) return out;
    const txt = t => typeof t === 'string' && t.trim() ? t.trim().slice(0, 200) : null;
    Object.entries(v).forEach(([y, r]) => {
      if (!/^\d{4}$/.test(y) || !r || typeof r !== 'object') return;
      const o = {}, p = +r.pue, c = +r.cloud;
      if (r.pue != null && Number.isFinite(p) && p >= 1 && p <= 5) o.pue = p;
      if (r.cloud != null && Number.isFinite(c) && c >= 0 && c <= 100) o.cloud = c;
      const pn = txt(r.pueNote) ?? txt(r.note), cn = txt(r.cloudNote);
      if (pn) o.pueNote = pn;
      if (cn) o.cloudNote = cn;
      if (Object.keys(o).length) out[y] = o;
    });
    return out;
  }
  // 연도별 권장감축률(%) 검증: 0 이상 100 이하 (50년 100% = 법적 목표 0t)
  function cleanRates(v) {
    if (!v || typeof v !== 'object' || Array.isArray(v)) return null;
    const out = {};
    Object.entries(v).forEach(([y, r]) => { if (/^\d{4}$/.test(y) && Number.isFinite(+r) && +r >= 0 && +r <= 100) out[y] = +r; });
    return Object.keys(out).length ? out : null;
  }
  function cleanBase(v) {
    if (!v || typeof v !== 'object' || Array.isArray(v)) return null;
    const out = {};
    Object.entries(v).forEach(([y, b]) => { if (/^\d{4}$/.test(y) && Number.isFinite(+b) && +b > 0 && +b < 1e7) out[y] = +b; });
    return Object.keys(out).length ? out : null;
  }
  /* 태양광 설비 (env_settings.solar_plants = [{ site, name, kw, from }]) — from = 가동 시작 'YYYY-MM' (비우면 기존 설비)
     전망(RE100·온실가스 · 50년까지)에서 증설분을 셈 · 저장한 적이 없으면 SOLAR_DEFAULT (지금 설치된 설비) */
  const SOLAR_DEFAULT = [
    { site: '대구본원', name: '체육시설 상단', kw: 31.4, from: '' },
    { site: '대구본원', name: '증축동 옥상', kw: 110.904, from: '' },
    { site: '제주글로벌센터', name: '', kw: 62.784, from: '' },
  ];
  const SOLAR_YM = /^\d{4}-(0[1-9]|1[0-2])$/;
  function cleanSolar(v) {
    if (!Array.isArray(v)) return null;
    return v.filter(r => r && SITES.includes(r.site) && Number.isFinite(+r.kw) && +r.kw > 0 && +r.kw < 1e5 && (!r.from || SOLAR_YM.test(r.from)))
      .map(r => ({ site: r.site, name: String(r.name || '').trim().slice(0, 40), kw: +(+r.kw).toFixed(3), from: r.from || '' }));
  }
  let solarRows = SOLAR_DEFAULT.map(r => ({ ...r }));
  // TOE 환산계수 (env_settings.toe_factor = { 에너지원: toe/단위 }) — 경영평가 '에너지 사용량 절감 실적' 계산용
  function cleanToe(v) {
    if (!v || typeof v !== 'object' || Array.isArray(v)) return null;
    const out = {};
    Object.entries(v).forEach(([t, f]) => { if (TOE_DEFAULT[t] !== undefined && Number.isFinite(+f) && +f > 0 && +f < 1) out[t] = +f; });
    return Object.keys(out).length ? out : null;
  }
  // 해당없음 칸 목록 (env_settings.na_cells = ['거점|항목|YYYY-MM', …]) — 입력표에 '-'를 넣으면 추가, 숫자나 빈칸이면 빠짐
  const NA_KEY = /^[^|]{1,40}\|[^|]{1,40}\|\d{4}-(0[1-9]|1[0-2])$/;
  const cleanNa = v => new Set((Array.isArray(v) ? v : []).map(String).filter(k => NA_KEY.test(k)));
  // 거점별 적용 항목 (env_settings.site_na = { 거점: [해당 없는 항목, …] }) — 아는 거점·항목만
  function cleanSiteNa(v) {
    if (!v || typeof v !== 'object' || Array.isArray(v)) return null;
    const keys = NA_ITEMS.flatMap(i => [i.k, ...(i.with || [])]), out = {};
    SITES.forEach(st => { if (Array.isArray(v[st])) out[st] = [...new Set(v[st].map(String).filter(k => keys.includes(k)))]; });
    return Object.keys(out).length ? out : null;
  }
  // 폐기물 감축 로드맵 설정값 검증 (공개 키로 누구나 쓸 수 있으므로 화면에 넣기 전에 형식 확인)
  function cleanRoadmap(v) {
    if (!v || !/^\d{4}$/.test(String(v.baseYear))) return null;
    const rates = {};
    Object.entries(v.rates || {}).forEach(([y, r]) => { if (/^\d{4}$/.test(y) && Number.isFinite(+r) && +r >= 0 && +r <= 100) rates[y] = +r; });
    return { baseYear: String(v.baseYear), rates };
  }
  // 배출계수 이력 (공개 키로 누구나 쓸 수 있으므로 화면에 넣기 전에 형식 확인) — date = 'YYYY-MM'(또는 YYYY·YYYY-MM-DD)
  const FL_DATE = /^\d{4}(-\d{2}(-\d{2})?)?$/;
  function cleanFactorLog(v) {
    if (!Array.isArray(v)) return [];
    return v.filter(e => e && typeof e === 'object' && FL_DATE.test(String(e.date)))
      .map(e => ({ date: String(e.date), note: String(e.note || '').slice(0, 120),
        by: e.by ? String(e.by).slice(0, 40) : '', at: e.at ? String(e.at).slice(0, 30) : '',
        factors: (e.factors && typeof e.factors === 'object' && !Array.isArray(e.factors)) ? e.factors : {} }))
      .sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0))   // 최근 적용일이 위로
      .slice(0, 50);
  }
  // 지금 적용 중인 배출계수 묶음 (이력에 스냅샷으로 함께 저장) — EMIT_TYPES는 아래에서 선언한 걸 그대로 씀
  const factorStr = n => (n == null || !Number.isFinite(+n)) ? '-' : String(+n);
  const currentFactors = () => ({
    energy: Object.fromEntries(EMIT_TYPES.map(t => [t, GHG[t]?.factor ?? null])),
    wasteKgPerL: WASTE_KG_PER_L, wasteEF: { ...WASTE_EF },
  });
  // 연도별 공식 확정 배출량 (공개 키 대비 형식 검증) — total = 전체 거점 Scope 1+2 tCO₂eq, date = 'YYYY-MM'
  function cleanOfficialGhg(v) {
    if (!v || typeof v !== 'object' || Array.isArray(v)) return {};
    const out = {};
    Object.entries(v).forEach(([y, o]) => {
      if (!/^\d{4}$/.test(y) || !o || typeof o !== 'object') return;
      const t = +o.total; if (!Number.isFinite(t) || t < 0 || t > 1e7) return;
      out[y] = { total: t, date: /^\d{4}-\d{2}$/.test(String(o.date)) ? String(o.date) : '', note: String(o.note || '').slice(0, 80) };
    });
    return out;
  }

  async function loadAll() {
    const wxTask = wxBySite ? null : fetchWeatherData(); // 날씨는 DB와 동시에 불러옴 (실패해도 예측은 같은 달 평균으로 동작)
    // 2단계 테이블은 SQL 실행 전엔 없음(404) → null로 받아 2단계 기능만 끔. 그 밖의 오류는 DB 오류로 처리
    const optional = p => p.catch(e => { if (isMissingTable(e)) return null; throw e; });
    const whoTask = loadWho().catch(e => { console.warn('[누가]', e); whoMap = null; });   // 자료와 함께 (실패해도 화면은 그대로)
    const [eData, wData, mData, sData] = await Promise.all([
      sbAll('energy', 'date.desc'),
      sbAll('waste', 'date.desc'),
      optional(sbAll('env_metrics', 'period.desc')),
      optional(sb('GET', 'env_settings', '?select=*')),
    ]);
    // 자료 지문: 자동 새로고침 때 바뀐 게 없으면 화면을 다시 그리지 않으려고 (그래프가 1분마다 다시 자라나지 않게)
    dataSig = hashStr(JSON.stringify([eData, wData, mData, sData]));
    energyRecs = eData.map(normE);
    wasteRecs  = wData.map(normW);
    v2 = mData != null && sData != null;
    metricRecs = (mData || []).map(normM);
    const st = Object.fromEntries((sData || []).map(r => [r.key, r.value]));
    settings = {
      closed_years: (Array.isArray(st.closed_years) ? st.closed_years : []).map(String).filter(y => /^\d{4}$/.test(y)),
      waste_roadmap: cleanRoadmap(st.waste_roadmap),
      ghg_base: cleanBase(st.ghg_base),
      ghg_own: cleanBase(st.ghg_own),
      ghg_law: cleanRates(st.ghg_law),
      ghg_law_tent: cleanRates(st.ghg_law_tent),
      na_cells: cleanNa(st.na_cells),
      site_na: cleanSiteNa(st.site_na),
      toe_factor: cleanToe(st.toe_factor),
      ghg_factor_log: cleanFactorLog(st.ghg_factor_log),
      official_ghg: cleanOfficialGhg(st.official_ghg),
      solar_plants: cleanSolar(st.solar_plants),
    };
    toeF = { ...TOE_DEFAULT, ...(settings.toe_factor || {}) };   // TOE 환산계수 (고친 에너지원만 저장값)
    factorLog = settings.ghg_factor_log || [];   // 배출계수 변경 이력
    officialGhg = settings.official_ghg || {};   // 연도별 공식 확정 배출량
    solarRows = (settings.solar_plants ?? SOLAR_DEFAULT).map(r => ({ ...r }));   // 태양광 설비 (저장값 없으면 지금 설치된 설비)
    ghgBaseY = settings.ghg_base || GHG_BASE_DEFAULT;
    applyOwnTargets(settings.ghg_own);   // 자체 목표 (입력한 해만 기본값 대신)
    applyLawRates(settings.ghg_law);     // 법적 목표 → 확정 권장감축률 (저장한 해는 저장값, 없는 해는 기본값)
    applyLawTent(settings.ghg_law_tent); // 31~50년 미확정 권장감축률 (참고값)
    applySiteNa(settings.site_na);       // 거점별 적용 항목 (저장한 값이 없으면 기본값)
    await whoTask;
    if (wxTask) await wxTask;
  }

  // 입력표 편집 상태: 저장 전 입력값이 있거나 입력칸에 커서가 있으면 자동 새로고침이 표를 다시 그리지 않음
  let energyDirty = false, wasteDirty = false, waterDirty = false, evDirty = false, rmDirty = false, gbDirty = false, naDirty = false;
  const isEditing = (tbodyId, dirty) => dirty || !!$(tbodyId)?.contains(document.activeElement);

  // 화면 그리기: 한 영역에서 오류가 나도 나머지는 그리고, DB 연결 오류와 구분해서 알림
  function renderAll({ force = false } = {}) {
    const failed = [];
    const run = (label, fn) => { try { fn(); } catch (e) { console.error(`[화면 오류] ${label}`, e); failed.push(label); } };
    run('2단계 기능 표시', applyV2);
    run('연도 목록', refreshDashboardYears);
    run('올해 현황', renderDash);
    run('입력 현황', renderStatusBoard);
    run('예측 근거', renderBasis);
    run('실적 조회', renderHistory);
    run('목표·로드맵', renderRoadmapTab);
    run('전망', () => { if (olTabOn()) renderOutlookTab(); });   // 전망 탭은 열려 있을 때만 (탭을 누르면 그때 그림)
    run('메인', renderHome);
    run('거점 선택 줄', syncNavSite);
    run('데이터 관리', renderManage);
    if (force || !isEditing('energy-tbody', energyDirty)) run('에너지 입력표', renderEnergyTable);
    if (force || !isEditing('waste-mtbl', wasteDirty))    run('폐기물 입력표', renderWasteTable);
    if (v2) {
      if (force || !isEditing('water-tbody', waterDirty)) run('용수 입력표', renderWaterTable);
      if (force || !isEditing('ev-tbody', evDirty))       run('친환경차 입력표', renderEvTable);
      if (force || !isEditing('pu-tbody', pairDirty.pu))  run('PUE 입력표', () => renderPairTable('pu'));
      if (force || !isEditing('cl-tbody', pairDirty.cl))  run('클라우드 입력표', () => renderPairTable('cl'));
      run('연도 마감', renderCloseTable);
      if (force || !isEditing('rm-card', rmDirty))        run('감축 로드맵', renderRoadmapForm);
      if (force || !isEditing('gb-card', gbDirty))        run('기준배출량', renderBaseForm);
      if (force || !naDirty)                             run('거점별 적용 항목', renderSiteNaForm);
      if (force || !isEditing('toe-tbody', false))       run('TOE 환산계수', renderToeTbl);
      if (force || !isEditing('solar-tbody', solarDirty)) run('태양광 설비', renderSolarTbl);
      run('배출계수 이력', renderFactorLog);
      if (force || !isEditing('og-tbody', false)) run('공식 확정 배출량', renderOfficialGhg);
    }
    run('누가 바꿨나', renderWhoLines);
    run('거점 목록', syncSiteSelects);
    run('탭 배지', refreshTabCounts);
    run('일괄 입력 미리보기', () => { if (bulkGrid) runBulk(); });   // 새 자료와 다시 비교 (중복 저장 방지)
    if (failed.length) showToast(`화면 표시 오류: ${failed.join(', ')} (데이터 연결은 정상)`, 'err');
    shownSig = viewSig();   // 이 자료로 그렸음 — 다음 자동 새로고침에서 같으면 건너뜀
  }

  // force: 저장 직후처럼 입력표도 반드시 DB 값으로 다시 그려야 할 때
  // opts.auto = 1분 자동 새로고침: 자료·누가 바꿨나·날씨·날짜가 그대로면 다시 그리지 않음 · 바뀌었으면 애니메이션 없이 조용히 다시 그림
  let dataSig = '', shownSig = '', chartQuiet = false;
  const hashStr = str => { let h = 2166136261; for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); } return (h >>> 0).toString(36); };
  const viewSig = () => [dataSig, whoAt || '', !!wxBySite, new Date().toDateString(), me?.role || '', users.length].join('|');
  /* ── 연결 상태: 서버에 닿지 않으면 위에 띠 (마지막으로 불러온 시각 + 다시 불러오기) · 닿으면 숨김 ── */
  let lastLoadAt = null;   // 마지막으로 서버에서 자료를 받은 시각
  const isConnErr = e => !navigator.onLine || !!e?.network || (e?.status >= 500);
  function netDown(e) {
    if (e && !isConnErr(e)) return;
    const t = lastLoadAt ? new Date(lastLoadAt).toLocaleTimeString('ko-KR', { hour: 'numeric', minute: '2-digit' }) : '';
    $('net-msg').innerHTML = `<b>${navigator.onLine ? '서버에 연결할 수 없어요' : '인터넷 연결이 끊겼어요'}</b>` +
      (t ? ` · ${t}에 불러온 자료를 보여 주고 있어요 (그 뒤 바뀐 값은 아직 안 보여요)` : '');
    $('net-banner').hidden = false;
  }
  function netUp() {   // 끊겼다가 다시 닿았으면 true
    const b = $('net-banner'), was = !b.hidden;
    b.hidden = true;
    return was;
  }
  async function retryLoad(btn) {
    setBusy(btn, true, '불러오는 중…');
    try { await refresh(); }
    catch (e) { console.warn('[다시 불러오기 실패]', e); netDown(e); if (!isConnErr(e)) showToast('불러오지 못했어요: ' + e.message, 'err'); }
    finally { setBusy(btn, false); if (btn) btn.disabled = false; }
  }

  async function refresh(opts = {}) {
    await loadAll();   // DB 오류는 호출한 쪽으로 전달
    lastLoadAt = Date.now();
    if (netUp()) showToast('다시 연결됐어요 · 최신 자료를 불러왔어요');
    if (opts.auto && viewSig() === shownSig) return;   // shownSig = 마지막으로 화면을 그릴 때의 지문 (renderAll 끝에서 적음)
    chartQuiet = !!opts.auto;
    try { renderAll(opts); } finally { chartQuiet = false; }
  }

  /* ── 탭 배지 업데이트 ─────────────────────────────── */
  function refreshTabCounts() {
    const total = energyRecs.length + wasteRecs.length + metricRecs.length;
    $('badge-manage').textContent = total;
  }

  /* ── 2단계 기능 켜기/끄기 + DB 설정 안내 ─────────────── */
  const SETUP_HTML = `<b>${icn('sliders')} 아직 DB 추가 설정 전이라 이 기능이 꺼져 있어요</b>
    <p>연도 마감 · 기준배출량 수정 · 폐기물 감축 로드맵 · 용수·친환경차 · 변경 이력은 DB에 표 3개(설정·기타 지표·변경 이력)가 있어야 저장할 수 있어요. 아래를 한 번만 하면 켜져요.</p>
    <ol><li>Supabase 대시보드 → 왼쪽 메뉴 <b>SQL Editor</b> → <b>New query</b></li>
    <li>대시보드 폴더의 <code>supabase/phase2.sql</code> 내용을 전부 붙여넣고 <b>Run</b></li>
    <li>이 페이지를 새로고침</li></ol>
    <span>기존 에너지·폐기물 데이터는 바뀌지 않아요 · 여러 번 실행해도 안전해요.</span>`;
  const SETUP_SHORT = `${icn('drop')} 용수·${icn('battery')} 친환경차·${icn('trash')} 폐기물 감축 목표는 DB 설정을 한 번 하면 표시돼요 (방법: 데이터 입력 → 기타 지표).`;
  function applyV2() {
    fillBulkSelects();
    document.querySelectorAll('.v2-only').forEach(el => { el.hidden = !v2; });
    document.querySelectorAll('.v2-opt').forEach(o => { o.hidden = o.disabled = !v2; });
    if (!v2 && $('h-cmp-etype').value === WATER) $('h-cmp-etype').value = 'ghg';
    document.querySelectorAll('.v2-setup').forEach(el => {
      el.hidden = v2;
      el.className = 'v2-setup setup-card' + (el.classList.contains('compact') ? ' compact' : '');
      if (!v2 && !el.innerHTML) el.innerHTML = el.classList.contains('compact') ? SETUP_SHORT : SETUP_HTML;
    });
  }
  // 입력 탭 거점 목록: 그 항목을 쓰지 않는 거점은 숨김 (고른 거점이 빠지면 선택 해제)
  function syncSiteSelects() {
    [['w-site', '폐기물'], ['x-site', WATER]].forEach(([id, item]) => {
      const sel = $(id); if (!sel) return;
      [...sel.options].forEach(o => { if (o.value) o.hidden = o.disabled = itemNA(o.value, item); });
      if (sel.value && itemNA(sel.value, item)) { sel.value = ''; sel.dispatchEvent(new Event('change')); }
    });
  }
  // 입력표 연도 목록에 마감 표시
  function markYearOptions() {
    ['e-year', 'w-year', 'x-year', 'v-year', 'pu-year', 'cl-year'].forEach(id =>
      [...$(id).options].forEach(o => { o.textContent = `${o.value}년${isClosed(o.value) ? ' [마감]' : ''}`; }));
  }
  // 입력표 잠금: 마감된 연도면 칸·저장 버튼을 막고 안내 문구 표시
  function applyLock(tb, saveId, infoId, yr, msg) {
    const locked = isClosed(yr);
    tb.querySelectorAll('input,select').forEach(el => { el.disabled = locked; });
    $(saveId).disabled = locked;
    $(infoId).innerHTML = locked ? `<span class="lock-note">${esc(lockMsg(yr))}</span>` : esc(msg);
  }
  // 저장 실패 공통 처리: 일부만 저장됐을 수 있으니 DB를 다시 읽어 둠(다시 저장해도 중복이 생기지 않게).
  // 다른 사람이 막 마감한 연도라 막힌 경우(P0001)에는 그 입력표도 잠긴 상태로 다시 그림
  function saveFailed(e, what = '저장', rerender = null) {
    showToast(`${what} 실패: ${e.message}`, 'err');
    refresh().then(() => { if (e.code === 'P0001' && rerender) rerender(); }).catch(() => {});
  }

