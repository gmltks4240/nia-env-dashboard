(async () => {
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

  /* ── 토스트 ─────────────────────────────────────────── */
  function showToast(msg, type = 'ok') {
    const box = $('toasts'); if (!box) return;
    while (box.children.length >= 3) box.firstElementChild.remove();   // 최대 3장
    const t = document.createElement('div'); box.appendChild(t);
    const icon = (type === 'ok') ? '<img src=\"img/mascot-toast-ok.png\" style=\"width:28px;height:28px;vertical-align:middle;margin-right:8px;object-fit:contain\">' : '';
    t.innerHTML = icon;
    t.appendChild(document.createTextNode(msg));
    t.className = `toast ${type}`;
    requestAnimationFrame(() => t.classList.add('show'));   // 다음 프레임에 켜야 떠오르는 전환이 보인다
    setTimeout(() => { t.classList.remove('show'); setTimeout(() => t.remove(), 400); }, 3000);
  }

  /* ── 로딩 버튼: 누르면 버튼 안에 스피너 + '저장 중…' (끝나면 원래 글자로) ──
     켜고 끄는 일(disabled)만 여기서 하고, 끝난 뒤 다시 켤지 말지는 부른 쪽의 원래 규칙(마감 연도 등)이 정함 */
  function setBusy(btn, on, text = '저장 중…') {
    if (!btn) return;
    if (on) {
      if (btn.dataset.idle == null) btn.dataset.idle = btn.innerHTML;
      btn.disabled = true; btn.classList.add('is-busy'); btn.setAttribute('aria-busy', 'true');
      btn.innerHTML = `<span class="spin" aria-hidden="true"></span>${esc(text)}`;
    } else {
      btn.classList.remove('is-busy'); btn.removeAttribute('aria-busy');
      // 저장 중에 화면이 버튼 글자를 새로 그렸으면 그 글자를 그대로 둠
      if (btn.dataset.idle != null && btn.querySelector(':scope > .spin')) btn.innerHTML = btn.dataset.idle;
      delete btn.dataset.idle;
    }
  }

  /* ── 인라인 오류: 틀린 칸은 빨간 테두리, 문구는 저장 버튼 바로 옆 (토스트처럼 사라지지 않음)
     칸을 다시 고치면 그 칸 표시가 지워지고, 틀린 칸이 다 고쳐지면 문구도 사라짐 */
  function fieldErr(anchor, inputs, msg) {
    const els = (inputs || []).filter(Boolean);
    const row = anchor?.closest('.save-row, .modal-actions, .drill-foot, .bulk-actions') || anchor?.parentElement;
    if (!row) { showToast(msg, 'err'); els[0]?.focus(); return; }
    clearFieldErr(anchor);
    let p = row.querySelector(':scope > .inline-err');
    if (!p) { p = document.createElement('p'); p.className = 'inline-err'; p.setAttribute('role', 'alert'); row.appendChild(p); }
    p.innerHTML = `${icn('alert')}<span>${esc(msg)}</span>`;
    p.hidden = false;
    const left = new Set(els);
    els.forEach(el => {
      el.classList.add('is-invalid'); el.setAttribute('aria-invalid', 'true');
      el.addEventListener('input', () => {
        el.classList.remove('is-invalid'); el.removeAttribute('aria-invalid'); left.delete(el);
        if (!left.size) p.hidden = true;
      }, { once: true });
    });
    if (els[0]) { els[0].focus({ preventScroll: true }); els[0].scrollIntoView({ block: 'nearest', behavior: 'smooth' }); }
  }
  function clearFieldErr(anchor) {
    const row = anchor?.closest('.save-row, .modal-actions, .drill-foot, .bulk-actions') || anchor?.parentElement;
    const p = row?.querySelector(':scope > .inline-err'); if (p) p.hidden = true;
    document.querySelectorAll('.is-invalid').forEach(el => { el.classList.remove('is-invalid'); el.removeAttribute('aria-invalid'); });
  }

  /* ── 지우기 + 되돌리기: 목록에서 먼저 빼고 6초 뒤에 실제로 지움 (그 안에 '되돌리기'를 누르면 취소)
     실제로 지우기 전이라 되돌려도 기록(id·입력한 사람·변경 이력)이 그대로 남음 ── */
  const UNDO_MS = 6000;
  let pendDel = null;   // { key, table, id, timer }
  const pendKey = (type, id) => `${type}:${id}`;
  const isPendingDel = (type, id) => pendDel?.key === pendKey(type, String(id));
  const recLabel = (r, type) => !r ? '자료' : type === 'energy' ? `${r.date} ${r.site} ${r.type}`
    : type === 'waste' ? `${r.date} ${r.site} 폐기물 ${r.bagSize}L` : `${r.period} ${r.site} ${r.item}`;
  async function commitDel() {
    const p = pendDel; if (!p) return;
    pendDel = null; clearTimeout(p.timer); $('snackbar').hidden = true;
    try { await sb('DELETE', p.table, `?id=eq.${p.id}`); await refresh(); }
    catch (e) { renderManage(); saveFailed(e, '삭제'); }   // 못 지웠으면 목록에 다시 보임
  }
  function deleteWithUndo(id, type, table, rec) {
    if (pendDel) commitDel();   // 앞서 지운 것은 바로 확정
    pendDel = { key: pendKey(type, String(id)), table, id };
    pendDel.timer = setTimeout(commitDel, UNDO_MS);
    renderManage();
    $('sn-msg').textContent = `지웠어요 · ${recLabel(rec, type)}`;
    const bar = $('sn-bar');
    bar.classList.remove('run'); void bar.offsetWidth; bar.style.setProperty('--sn-ms', UNDO_MS + 'ms'); bar.classList.add('run');
    $('snackbar').hidden = false;
  }
  $('sn-undo').addEventListener('click', () => {
    if (!pendDel) return;
    clearTimeout(pendDel.timer); pendDel = null; $('snackbar').hidden = true;
    renderManage(); showToast('되돌렸어요');
  });
  // 6초가 지나기 전에 창을 닫아도 지우기는 마무리 (keepalive 요청)
  window.addEventListener('pagehide', () => {
    const p = pendDel; if (!p) return;
    pendDel = null; clearTimeout(p.timer);
    try { fetch(`${SB_URL}/rest/v1/${p.table}?id=eq.${p.id}`, { method: 'DELETE', keepalive: true,
      headers: { ...HDR, Authorization: `Bearer ${session?.access_token || SB_KEY}`, Prefer: 'return=minimal' } }); } catch (e) { /* 창이 닫히는 중 */ }
  });

  /* ── 확인 창 (예/아니오) → Promise<boolean> ───────────── */
  // tone: 'danger'(삭제 등, 빨간 버튼) | 'primary'(마감 등)
  function confirmBox(message, okLabel = '확인', sub = '삭제한 값은 복구할 수 없습니다.', tone = 'danger') {
    return new Promise(resolve => {
      const ov = document.createElement('div');
      ov.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.45);z-index:2000;display:flex;align-items:center;justify-content:center';
      ov.innerHTML = `<div role="dialog" aria-modal="true" style="background:var(--surface);border:1px solid var(--border);border-radius:12px;padding:28px 32px;max-width:380px;width:90%;box-shadow:0 8px 32px rgba(0,0,0,.2);text-align:center">
        <div style="font-size:14px;font-weight:600;margin-bottom:8px;color:var(--text)" class="cb-msg"></div>
        <div style="font-size:12px;color:var(--muted);margin-bottom:22px;line-height:1.6;white-space:pre-line" class="cb-sub"></div>
        <div style="display:flex;gap:10px;justify-content:center">
          <button class="cb-no" style="padding:8px 20px;border:1px solid var(--border);border-radius:8px;background:var(--surface2);color:var(--text);font-size:14px;cursor:pointer">취소</button>
          <button class="cb-ok" style="padding:8px 20px;border:none;border-radius:8px;background:${tone === 'danger' ? 'var(--danger-bg)' : 'var(--accent)'};color:#fff;font-size:14px;font-weight:600;cursor:pointer"></button>
        </div></div>`;
      ov.querySelector('.cb-msg').textContent = message;
      ov.querySelector('.cb-sub').textContent = sub;
      ov.querySelector('.cb-ok').textContent = okLabel;
      const done = v => { ov.remove(); resolve(v); };
      ov.querySelector('.cb-no').onclick = () => done(false);
      ov.querySelector('.cb-ok').onclick = () => done(true);
      ov.addEventListener('click', e => { if (e.target === ov) done(false); });
      document.body.appendChild(ov);
      ov.querySelector('.cb-ok').focus();
    });
  }

  /* ── 연도 셀렉터 (10년) ─────────────────────────────── */
  function buildYearSel(sel) {
    const y = new Date().getFullYear();
    sel.innerHTML = Array.from({ length: 10 }, (_, i) => y - i)
      .map(yr => `<option value="${yr}"${yr === y ? ' selected' : ''}>${yr}년</option>`).join('');
  }
  ['e-year', 'w-year', 'x-year', 'v-year', 'pu-year', 'cl-year'].forEach(id => buildYearSel($(id)));

  function refreshDashboardYears() {
    const curYr = String(new Date().getFullYear());
    ['e-year', 'w-year', 'x-year', 'v-year', 'pu-year', 'cl-year'].forEach(id => {
      const sel = $(id);
      if (sel.options[0]?.value === curYr) return;
      const keep = sel.value; buildYearSel(sel);
      if ([...sel.options].some(o => o.value === keep)) sel.value = keep;
    });
    markYearOptions();
    const years = [...new Set([...energyRecs.map(r => r.date), ...wasteRecs.map(r => r.date), ...metricRecs.map(r => r.period)]
      .map(d => (d || '').slice(0, 4)).filter(y => /^\d{4}$/.test(y)))].sort().reverse();
    const mc = $('m-year').value;
    $('m-year').innerHTML = `<option value="">연도 전체</option>` +
      years.map(y => `<option value="${y}"${y === mc ? ' selected' : ''}>${y}년</option>`).join('');
  }

  /* ── 차트 ─────────────────────────────────────────────── */
  // 화면마다 차트 묶음을 따로 가짐: '' = 올해 현황, 'y-' = 실적 조회 한 해(올해 현황 복제), h = 실적 조회 연도별 비교
  const CHARTS = { '': {}, 'y-': {}, h: {}, o: {} };   // o = 📈 전망 탭
  const chartTheme = () => {
    return { grid: 'rgba(255,255,255,.07)', tick: cssVar('--chart-ghost') };
  };

  /* ── 막대 값 레이블 (Chart.js 플러그인, 외부 라이브러리 없이) ──────────
     options.plugins.barLabels = { display, total: 쌓은 막대는 맨 위에 합계만, kind: 'pct'면 ▲▼% 표시 }
     세로 막대는 위에, 가로 막대는 끝에 표시. 막대가 좁으면 세로로 돌려 쓰고, 그래도 좁으면 생략.
     소수 자릿수는 차트마다 하나로 통일 (가장 큰 값 기준: 100 이상 0자리 · 10 이상 1자리 · 그 밖 2자리) */
  const fmtPct = v => `${v > 0 ? '▲' : v < 0 ? '▼' : ''}${fmt(Math.abs(v), 1)}%`;
  const barLabelPlugin = {
    id: 'barLabels',
    defaults: { display: false, total: false, kind: 'num' },
    afterDatasetsDraw(chart, args, o) {
      if (!o?.display) return;
      const ctx = chart.ctx, horiz = chart.options.indexAxis === 'y', size = 10;
      const items = [], metas = chart.getSortedVisibleDatasetMetas().filter(m => m.type === 'bar');
      const val = (m, i) => { const v = chart.data.datasets[m.index].data[i];
        if (Array.isArray(v)) return v.length === 2 && v.every(x => x != null && isFinite(x)) ? v[1] - v[0] : null;   // 폭포 막대 = 끝 − 시작
        return v == null || !isFinite(v) ? null : +v; };
      const floating = (m, i) => Array.isArray(chart.data.datasets[m.index].data[i]);
      const own = (m, i) => chart.data.datasets[m.index].valueLabels?.[i];   // 계열이 직접 준 글자 (예: '2.9%', '+56.1t (▲79.5%)')
      if (o.total) {               // 쌓은 막대: 칸마다 맨 위 막대에 합계
        const top = {};
        metas.forEach(m => m.data.forEach((el, i) => {
          const v = val(m, i); if (v == null) return;
          const t = top[i] || (top[i] = { sum: 0, el: null });
          t.sum += v;
          if (!t.el || (horiz ? el.x > t.el.x : el.y < t.el.y)) t.el = el;
        }));
        Object.entries(top).forEach(([i, t]) => { if (!o.only || o.only.includes(+i)) items.push([t.el, t.sum]); });
      } else metas.forEach(m => m.data.forEach((el, i) => { const v = val(m, i); if (v != null && (!o.only || o.only.includes(i))) items.push([el, v, own(m, i), floating(m, i)]); }));
      const maxAbs = Math.max(0, ...items.map(([, v]) => Math.abs(v))), d = maxAbs >= 100 ? 0 : maxAbs >= 10 ? 1 : 2;
      const f = o.kind === 'pct' ? fmtPct : v => fmt(v, d);
      ctx.save();
      ctx.font = `600 ${size}px 'IBM Plex Sans','IBM Plex Sans KR',sans-serif`;
      ctx.fillStyle = cssVar('--chart-label');
      // 글자 둘레에 배경색 테두리: 선·격자가 지나가도 숫자가 또렷하게
      ctx.strokeStyle = cssVar('--surface'); ctx.lineWidth = 3; ctx.lineJoin = 'round';
      const put = (t, x, y) => { ctx.strokeText(t, x, y); ctx.fillText(t, x, y); };
      const solo = o.total || metas.length === 1, slot = chart.chartArea.width / (chart.data.labels.length || 1);   // 칸마다 레이블이 하나뿐인지 · 한 칸 너비
      chart.getSortedVisibleDatasetMetas().filter(m => m.type === 'line').forEach(m => {
        const ds = chart.data.datasets[m.index];
        (ds.markIdx || []).forEach(i => {               // 이정표 지점 값 (예: 30·40·50년 목표)
          const el = m.data[i], v = ds.data[i];
          if (!el || v == null) return;
          const right = el.x > chart.chartArea.right - 24, below = !!ds.markBelow;
          ctx.save();
          if (ds.markColor) ctx.fillStyle = ds.markColor;
          ctx.textAlign = right ? 'right' : 'center'; ctx.textBaseline = below ? 'top' : 'bottom';
          put(ds.markLabels?.[i] ?? (ds.markFmt || (x => fmt(x, 1)))(v), el.x + (right ? 4 : 0), below ? el.y + 7 : el.y - 7);
          ctx.restore();
        });
        const ref = ds.refLabel, el = m.data.find(e => e && !e.skip);
        if (!ref || !el) return;
        ctx.save(); ctx.fillStyle = cssVar('--chart-ghost');
        ctx.textAlign = 'left'; ctx.textBaseline = 'bottom'; put(ref, chart.chartArea.left + 6, el.y - 3); ctx.restore();
      });
      items.forEach(([el, v, custom, fl]) => {
        const txt = custom ?? f(v), w = ctx.measureText(txt).width, neg = v < 0;
        if (horiz) {
          if ((el.height ?? 0) < size - 2) return;
          ctx.textAlign = neg ? 'right' : 'left'; ctx.textBaseline = 'middle';
          put(txt, el.x + (neg ? -4 : 4), el.y);
        } else if ((el.width ?? 0) >= w + 2) {
          ctx.textAlign = 'center'; ctx.textBaseline = neg ? 'top' : 'bottom';
          put(txt, el.x, (neg && fl ? el.base : el.y) + (neg ? 3 : -3));   // 폭포에서 줄어든 막대는 막대 아래에
        } else if (!neg && (solo && w + 6 <= slot || w > el.y - 4)) {
          // 막대는 좁아도 칸이 넉넉하면(막대가 칸마다 하나) 가로로 · 세로로 돌리면 캔버스 위로 잘릴 때도 가로로 (잘린 숫자는 틀린 숫자로 읽힘)
          ctx.textAlign = 'center'; ctx.textBaseline = 'bottom';
          put(txt, Math.min(Math.max(el.x, w / 2 + 2), chart.width - w / 2 - 2), el.y - 3);
        } else if ((el.width ?? 0) >= size - 1) { // 좁은 막대: 세로로
          ctx.save(); ctx.translate(el.x, el.y - 3); ctx.rotate(-Math.PI / 2);
          ctx.textAlign = 'left'; ctx.textBaseline = 'middle'; put(txt, 0, 0); ctx.restore();
        }
      });
      ctx.restore();
    },
  };

  // 고른 칸 강조 띠 (연도별 막대에서 고른 연도): options.plugins.colBand = { idx, color } — 그 칸 뒤에 옅은 띠 (막대 색은 그대로)
  const colBandPlugin = {
    id: 'colBand',
    defaults: { idx: -1 },
    beforeDatasetsDraw(chart, args, o) {
      const x = chart.scales.x, a = chart.chartArea, n = (chart.data.labels || []).length;
      if (!x || !a || !(o?.idx >= 0) || o.idx >= n) return;
      const w = Math.min(x.width / n * 0.86, 120), l = x.getPixelForValue(o.idx) - w / 2, ctx = chart.ctx;
      ctx.save();
      if (o.color) {   // 바탕 상자는 기본으로 그리지 않음 (막대가 주인공이 되게)
        ctx.fillStyle = o.color; ctx.beginPath();
        if (ctx.roundRect) ctx.roundRect(l, a.top, w, a.bottom - a.top, 6); else ctx.rect(l, a.top, w, a.bottom - a.top);
        ctx.fill();
      }
      ctx.fillStyle = o.line || hexA(PRED_COLOR, .9);     // 아래 굵은 밑줄 = 고른 해
      ctx.beginPath();
      if (ctx.roundRect) ctx.roundRect(l, a.bottom - 1, w, 4, 2); else ctx.rect(l, a.bottom - 1, w, 4);
      ctx.fill(); ctx.restore();
    },
  };

  // 한 해 화면 차트 — P = '' 올해 현황 · 'y-' 실적 조회 한 해 (같은 모양)
  function makeChartSet(P = '') {
    const { grid, tick } = chartTheme(), $$ = id => $(P + id);
    const legend = { labels: { color: tick, boxWidth: 12, font: { size: 12 } } };
    return {
      // 월별 에너지원별 작은 그래프 (전력·도시가스·지역난방·재생에너지) — 에너지원마다 단위가 달라 그래프도 축도 하나씩
      //  막대 = 그 해 실적 (올해는 아직 입력 안 된 거점·달을 옅은 막대로 예측) · 회색 점선 = 전년 같은 달
      //  툴팁에 사용량 + 온실가스 환산값 + 전년 같은 달 대비
      em: ETYPES.map((t, k) => new Chart($$('chart-em' + k), {
        type: 'bar',
        data: { labels: MONTHS, datasets: [] },
        options: {
          responsive: true, interaction: { mode: 'index', intersect: false },
          layout: { padding: { top: 4 } },
          plugins: { legend: { display: false },
                     tooltip: { filter: c => c.raw != null, itemSort: (a, b) => a.datasetIndex - b.datasetIndex,
                                callbacks: { title: items => items.length ? `${items[0].label} · ${emName(t)}` : '', label: emTipLabel, footer: emTipFoot } } },
          scales: {
            x: { stacked: true, grid: { display: false },
                 ticks: { color: tick, font: { size: 10 }, maxRotation: 0, autoSkipPadding: 4, callback(v) { return String(this.getLabelForValue(v)).replace('월', ''); } } },
            y: { stacked: true, beginAtZero: true, grace: '6%', border: { display: false }, grid: { color: grid },
                 ticks: { color: tick, font: { size: 10 }, maxTicksLimit: 4, callback: v => compactNum(v) } },
          }
        }
      })),
      // 차량연료 월별 막대 (툴팁: L + tCO₂eq)
      fuel: new Chart($$('chart-fuel'), {
        type: 'bar',
        data: { labels: MONTHS, datasets: [] },
        options: {
          responsive: true, interaction: { mode: 'index', intersect: false },
          plugins: { legend, barLabels: { display: true }, tooltip: { filter: c => c.raw != null, callbacks: { label: energyTipLabel } } },
          scales: { x: { ticks: { color: tick }, grid: { color: grid } }, y: { ticks: { color: tick }, grid: { color: grid }, beginAtZero: true, grace: '18%' } }
        }
      }),
      // 월별 온실가스 — 입력된 실적(Scope 1·2 또는 에너지원별) 위에 아직 입력 안 된 부분의 예측을 쌓음
      ghg: new Chart($$('chart-ghg-monthly'), {
        type: 'bar',
        data: { labels: MONTHS, datasets: [] },
        options: {
          responsive: true, interaction: { mode: 'index', intersect: false },
          plugins: { legend: { ...legend, position: 'bottom' }, barLabels: { display: true, total: true },
                     tooltip: { filter: c => c.raw != null, callbacks: { label: c => {
                       const a = c.dataset.$amt?.[c.dataIndex];
                       return `${c.dataset.label}: ${fq(c.raw)} tCO₂eq` + (a != null ? ` (${amtTxt(c.dataset.$type, a)})` : '');
                     } } } },
          scales: { x: { stacked: true, ticks: { color: tick }, grid: { color: grid } },
                    y: { stacked: true, ticks: { color: tick }, grid: { color: grid }, beginAtZero: true, grace: '10%' } }
        }
      }),
      // 월별 승강기 회생제동 발전량 (kWh) — 대구본원 · 전년 같은 달 (점선)
      regen: new Chart($$('chart-regen'), {
        type: 'bar',
        data: { labels: MONTHS, datasets: [] },
        options: {
          responsive: true, interaction: { mode: 'index', intersect: false },
          plugins: { legend, barLabels: { display: true },
                     tooltip: { filter: c => c.raw != null, callbacks: { label: c => `${c.dataset.label}: ${fq(c.raw)} kWh (회피 ${fq(calcGHG('전력', c.raw || 0))} tCO₂eq)` } } },
          scales: { x: { ticks: { color: tick }, grid: { color: grid } },
                    y: { ticks: { color: tick }, grid: { color: grid }, beginAtZero: true, grace: '12%', title: { display: true, text: 'kWh', color: tick, font: { size: 11 } } } }
        }
      }),
      // 월별 폐기물 발생량 (kg) — 고른 거점 (전체 합계면 거점별로 쌓음) + 전년 같은 달 (점선)
      ws: new Chart($$('chart-ws'), {
        type: 'bar',
        data: { labels: MONTHS, datasets: [] },
        options: {
          responsive: true, interaction: { mode: 'index', intersect: false },
          plugins: { legend, barLabels: { display: true, total: true },
                     tooltip: { filter: c => c.raw != null, callbacks: { label: c => `${c.dataset.label}: ${fq(c.raw)} kg (${fq(wasteGhg((c.raw || 0) / 1000, curSite)) || '—'} tCO₂eq)` } } },
          scales: { x: { stacked: true, ticks: { color: tick }, grid: { color: grid } },
                    y: { stacked: true, ticks: { color: tick }, grid: { color: grid }, beginAtZero: true, grace: '12%', title: { display: true, text: 'kg', color: tick, font: { size: 11 } } } }
        }
      }),
      // 예측 근거: 월평균기온 (학습연도 vs 올해) — 올해 현황에만
      ...(P ? {} : { wx: new Chart($('chart-wx'), {
        type: 'line',
        data: { labels: MONTHS, datasets: [] },
        options: {
          responsive: true, interaction: { mode: 'index', intersect: false },
          plugins: { legend, tooltip: { callbacks: { label: c => `${c.dataset.label}: ${fq(c.raw)}℃` } } },
          scales: { x: { ticks: { color: tick }, grid: { color: grid } },
                    y: { ticks: { color: tick }, grid: { color: grid }, title: { display: true, text: '℃', color: tick, font: { size: 11 } } } }
        }
      }) }),
    };
  }

  // 실적 조회 차트 공통 설정 (축 1개 · 범례 대표색 · 기준배출량 대비 툴팁) — 올해 현황의 감축 로드맵도 같이 씀
  function chartKit() {
    const { grid, tick } = chartTheme();
    const legend = { labels: { color: tick, boxWidth: 12, font: { size: 12 },
      // 범례 상자: 점선 테두리 없이, 막대 색이 연도마다 다르면 대표색(legendColor)으로
      generateLabels: c => Chart.defaults.plugins.legend.labels.generateLabels(c).map(l => {
        const lc = c.data.datasets[l.datasetIndex]?.legendColor;
        return { ...l, lineDash: [], ...(lc ? { fillStyle: lc, strokeStyle: lc } : {}) };
      }),
      sort: (a, b) => a.datasetIndex - b.datasetIndex } };
    // 격자·축 — 꾸밈은 한 겹만. 값을 읽는 데 필요한 가로 격자만 남기고,
    //  세로 격자는 끈다 (막대와 x 눈금이 이미 구간을 나누고 있어 겹친다).
    //  축선과 눈금 돌기도 뺀다 — 격자가 있는데 테두리까지 그으면 상자 안에 갇혀 보인다.
    //  세로 격자가 필요한 차트는 xGrid 로 다시 켤 수 있다.
    const scales = (stacked = false, yTitle = '', grace = 0, xTicks = {}, xGrid = {}) => ({
      x: { stacked, border: { display: false },
           ticks: { color: tick, font: { size: 11 }, padding: 6, ...xTicks },
           grid: { display: false, ...xGrid } },
      y: { stacked, border: { display: false },
           ticks: { color: tick, font: { size: 11 }, padding: 8 },
           grid: { color: grid, drawTicks: false }, beginAtZero: true, grace,
           title: { display: !!yTitle, text: yTitle, color: tick, font: { size: 11 } } } });
    const tip = unit => ({ callbacks: { label: c => c.raw == null ? null : `${c.dataset.label}: ${fq(c.raw)} ${unit}` } });
    // 올해 연말 예측·전망 막대에 올리면 '누르면 계산 근거' 한 줄
    const popFoot = items => items.some(i => i.raw != null && (i.dataset.$ol || i.dataset.$pop)) ? '누르면 어떻게 계산했는지 봐요' : '';
    const pathTip = { callbacks: { footer: popFoot, label: c => {
      if (c.raw == null || c.dataset.$noTip?.[c.dataIndex]) return null;   // $noTip: 선을 잇기만 하는 점 (예: 미확정 법적 목표선의 30년)
      const b = baseOf(2000 + parseInt(c.label));
      return `${c.dataset.label}: ${fq(c.raw)} tCO₂eq` + (c.dataset.refLabel || !b ? '' : ` (기준 대비 ${c.raw <= b ? '▼' : '▲'}${fmt(Math.abs(b - c.raw) / b * 100, 1)}%)`);
    } } };
    const bar = (id, labels, opt = {}) => new Chart($(id), {
      type: 'bar', data: { labels, datasets: [] },
      options: { responsive: true, animation: false, interaction: { mode: 'index', intersect: false },
                 plugins: { legend, tooltip: opt.tooltip || tip(opt.unit || 'tCO₂eq'), barLabels: { display: true, total: !!opt.stacked } },
                 scales: scales(!!opt.stacked, opt.yTitle, opt.grace || '12%', opt.xTicks, opt.xGrid) } });
    // 감축 로드맵(2030 중기 · 2050 장기): 실적·목표 툴팁에 그 해 기준배출량 대비 감축률
    // 2050 장기 눈금은 5년 단위만 (첫 해는 다음 5년 눈금과 3년 이상 떨어질 때만), 세로 격자 없음
    const roadmap = (id2030, id2050) => ({
      path:   bar(id2030, [], { yTitle: 'tCO₂eq', grace: '16%', tooltip: pathTip }),
      path50: bar(id2050, [], { grace: '14%', tooltip: pathTip, xGrid: { display: false }, xTicks: { autoSkip: false, maxRotation: 0,
        callback(v, i) { const l = this.getLabelForValue(v), y = 2000 + parseInt(l);
                         if ((this.chart.data.labels || []).length <= 12) return l;   // 기간을 좁히면 모든 연도
                         return y % 5 === 0 || (i === 0 && 5 - (y % 5) >= 3) ? l : ''; } } }),
    });
    // RE100 이행 로드맵(2030 중기 · 2050 장기): 이행률 % · 2050 눈금은 5년 단위
    const pctTip = { callbacks: { footer: popFoot, label: c => c.raw == null ? null : `${c.dataset.label}: ${fmt(c.raw, 1)}%` } };
    const reRoadmap = (id2030, id2050) => {
      const re = bar(id2030, [], { yTitle: '%', grace: '12%', tooltip: pctTip }), re50 = bar(id2050, [], { grace: '8%', tooltip: pctTip, xGrid: { display: false },
        xTicks: { autoSkip: false, maxRotation: 0, callback(v, i) { const l = this.getLabelForValue(v), y = 2000 + parseInt(l);
                                                                   return y % 5 === 0 || (i === 0 && 5 - (y % 5) >= 3) ? l : ''; } } });
      // 0~100% 눈금 (위쪽 여백은 50년 목표 값 표시 자리)
      Object.assign(re50.options.scales.y, { max: 112, afterBuildTicks: ax => { ax.ticks = ax.ticks.filter(t => t.value <= 100); } });
      re50.options.scales.y.ticks.stepSize = 20;
      return { re, re50 };
    };
    return { grid, tick, legend, scales, tip, bar, roadmap, reRoadmap, pathTip, pctTip };
  }
  // 실적 조회 · 연도별 비교 차트 — 모두 축 1개
  function makeHistCharts() {
    const { legend, scales, bar, roadmap, reRoadmap } = chartKit();
    const t = reRoadmap('h-chart-re-path', 'h-chart-re-path50');
    return {
      ...roadmap('h-chart-path', 'h-chart-path50'),
      re: t.re, re50: t.re50,
      // 월별 패턴 (고른 항목 · 고른 연도까지 최근 4개년 · 월별/누적) — 에너지원이면 툴팁에 tCO₂eq도
      energy: new Chart($('h-chart-energy'), {
        type: 'line', data: { labels: MONTHS, datasets: [] },
        options: { responsive: true, animation: false, interaction: { mode: 'index', intersect: false },
                   plugins: { legend: { ...legend, labels: { ...legend.labels, usePointStyle: true, pointStyleWidth: 14 } },   // 범례도 네모 점
                              tooltip: { usePointStyle: true, filter: c => c.raw != null, callbacks: { label: c => {
                     const t = c.dataset.$type, g = t ? co2Txt(t, c.raw) : '';
                     return `${c.dataset.label}: ${t ? amtTxt(t, c.raw) : `${fq(c.raw)} ${c.dataset.$unit || ''}`}${g ? ` · ${g}` : ''}`;
                   } } } },
                   scales: scales(false, ' ') } }),
      scope: bar('h-chart-scope', [], { stacked: true, tooltip: { callbacks: { label: c => {   // 에너지원별이면 사용량도 · 맨 아래 = 그 해 합계
        if (c.raw == null) return null;
        const a = c.dataset.$amt?.[c.dataIndex];
        return `${c.dataset.label}: ${fq(c.raw)} tCO₂eq` + (a != null ? ` (${amtTxt(c.dataset.$type, a)})` : '');
      }, footer: items => { const xs = items.filter(i => i.raw != null); return xs.length > 1 ? `합계 ${fq(sumBy(xs, i => i.raw))} tCO₂eq` : ''; } } } }),
      wrm:   bar('h-chart-wrm', [], { unit: 'ton' }),
    };
  }

  function buildCharts() {
    Chart.defaults.maintainAspectRatio = false; // 높이는 .chart-box가 정함
    Chart.defaults.font.family = cssVar('--fdata');   // 축·범례 글자도 화면과 같은 글꼴
    if (!Chart.registry.plugins.get('barLabels')) Chart.register(barLabelPlugin);
    if (!Chart.registry.plugins.get('colBand')) Chart.register(colBandPlugin);
    Object.values(CHARTS).forEach(set => Object.values(set).flat().forEach(c => c && c.destroy()));   // em = 차트 여러 개
    CHARTS[''] = makeChartSet('');
    CHARTS['y-'] = makeChartSet('y-');
    CHARTS.h = makeHistCharts();
    CHARTS.o = makeOutlookCharts();
    attachDrills();   // 막대·점을 누르면 그 자료 보기·고치기
  }

  /* ── 차트·카드 헬퍼 ──────────────────────────────────── */
  const PRED_COLOR = cssVar('--chart-pred');
  const ETYPES = ['전력', '도시가스', '지역난방', '휘발유', '경유', RE_SELF];   // 월별 에너지원별 작은 그래프 순서 (표 줄 순서와 같게)
  // 에너지원 색 (모든 그래프·표에서 같은 색) — 색각 이상(적록·청황)에서도 서로 구분되게 고른 값, 다크 모드는 밝은 단계
  const TYPE_COLS = { '전력': cssVar('--chart-elec'), '도시가스': cssVar('--chart-gas'), '지역난방': cssVar('--chart-heat'),
                      '휘발유': cssVar('--chart-gasoline'), '경유': cssVar('--chart-diesel'), [RE_SELF]: cssVar('--chart-re') };
  const typeCol = t => TYPE_COLS[t] || cssVar('--chart-fallback');
  // 연도별 색 (실적 조회 비교 그래프) — 고른 해는 PICK, 지난 해들은 PAST 순서대로, 다음 해들은 NEXT.
  // 색각 이상에서도 서로 구분되게 고른 값. 차트 색은 여기와 CSS --chart-* 두 곳 밖에 없다.
  const YEAR_COLS = { PICK: '#E0946A', PAST: ['#7FA3D1', '#A496C9', '#6EAFA6', '#C48DA8', '#C2AC6E', '#8A92C4', '#7FB08A', '#7AAAC4', '#C48888', '#8E99A8'], NEXT: ['#B48EBF', '#A0B377', '#CDA17E'] };
  const EMIT_TYPES = ['전력', '도시가스', '지역난방', '휘발유', '경유'];   // 온실가스 배출원 (월별 온실가스 '에너지원별' 순서)
  const amtTxt = (t, v) => `${fq(v)} ${GHG[t]?.unit || ''}`;   // 사용량 + 원래 단위
  // 사용량 → 온실가스 환산 (tCO₂eq): 배출원 = 배출량 · 재생에너지 자가발전·승강기 회생제동 = 회피 배출량(참고, 전력 배출계수) · 구매 = 환산 안 함
  const isAvoid = t => t === RE_SELF || t === SAVE_REGEN;
  const co2Of = (t, v) => v == null ? null : isEmit(t) ? calcGHG(t, v) : isAvoid(t) ? calcGHG('전력', v) : null;
  const co2Txt = (t, v) => { const g = co2Of(t, v); return g == null ? '' : `${isAvoid(t) ? '회피 ' : ''}${fq(g)} tCO₂eq`; };
  // 차량연료 그래프 툴팁: '경유: 100 L · 0.266 tCO₂eq' (계열의 $type = 에너지원)
  const energyTipLabel = c => {
    const t = c.dataset.$type, g = co2Txt(t, c.raw);
    return `${t}${c.dataset.$pred ? ' 예측' : ''}: ${amtTxt(t, c.raw)}${g ? ` · ${g}` : ''}`;
  };
  // 연도별 색: 옛 연도 → 최근 연도 순으로 밝기 단계를 고르게 벌림 (밝은 쪽도 흰 배경 대비 3:1 이상)
  const yearColors = n => {
    const [a, b] = [cssVar('--chart-yr-from'), cssVar('--chart-yr-to')];
    if (n <= 1) return [b];
    const rgb = h => [1, 3, 5].map(k => parseInt(h.slice(k, k + 2), 16)), A = rgb(a), B = rgb(b);
    return Array.from({ length: n }, (_, i) => '#' + A.map((v, k) => Math.round(v + (B[k] - v) * i / (n - 1)).toString(16).padStart(2, '0')).join(''));
  };
  const hexA = (hex, a) => hex + Math.round(a * 255).toString(16).padStart(2, '0');
  const yrShort = y => `${String(y).slice(2)}년`;
  // 월별 합계 (해당 월 레코드가 없으면 null)
  const monthlySum = (recs, f) => m12(i => {
    const rs = recs.filter(r => r.date?.slice(5, 7) === pad(i + 1));
    return rs.length ? sumBy(rs, f) : null;
  });
  // 값이 있는 계열만 그리고, 하나도 없으면 '데이터가 없습니다' 표시
  function setChart(chart, canvasId, emptyId, datasets) {
    const ds = datasets.filter(d => d.data.some(v => v != null));
    $(emptyId).hidden = ds.length > 0;
    const cv = $(canvasId), card = cv.closest('.chart-card');
    (cv.parentElement.classList.contains('chart-box') ? cv.parentElement : cv).hidden = ds.length === 0;
    // 그래프 하나짜리 카드: 자료가 없으면 표시 (올해 현황·그 해 자세히는 큰 빈 상자 대신 한 줄로 줄여 맨 아래로)
    if (card && card.querySelectorAll('canvas').length === 1) card.classList.toggle('is-empty', ds.length === 0);
    if (chart) { chart.data.datasets = ds; chart.update(chartQuiet ? 'none' : undefined); }   // 자동 새로고침은 애니메이션 없이
  }
  // 에너지원별 작은 그래프 — 이름 · 툴팁 ('26년 실적: 123,456 kWh · 56.719 tCO₂eq' · 아래에 합계·전년 같은 달 대비)
  const emName = t => t === RE_SELF ? '재생에너지 자가발전' : t;
  const emTipLabel = c => {
    const t = c.dataset.$type, g = c.dataset.$prev ? '' : co2Txt(t, c.raw);
    return `${c.dataset.label}: ${amtTxt(t, c.raw)}${g ? ` · ${g}` : ''}`;
  };
  const emTipFoot = items => {
    const cur = items.filter(x => !x.dataset.$prev && x.raw != null), pv = items.find(x => x.dataset.$prev)?.raw;
    if (!cur.length) return '';
    const t = cur[0].dataset.$type, v = sumBy(cur, x => x.raw), pred = cur.some(x => x.dataset.$pred), out = [];
    if (cur.length > 1) out.push(`합계 ${amtTxt(t, v)} (실적 + 예측)`);
    if (pv > 0) out.push(`전년 같은 달 대비 ${v >= pv ? '▲' : '▼'}${fmt(Math.abs(v - pv) / pv * 100, 1)}%${pred ? ' (예측 포함)' : ''}`);
    return out;
  };
  // 작은 그래프 세로축 숫자: 15만 · 2.5만 · 3,000
  const compactNum = v => { const a = Math.abs(v);
    return a >= 1e8 ? `${+(v / 1e8).toFixed(a >= 1e9 ? 0 : 1)}억` : a >= 1e4 ? `${+(v / 1e4).toFixed(a >= 1e5 ? 0 : 1)}만` : fq(v); };
  // 목표 카드 게이지 (P = 화면 id 접두어: '' 올해 현황 · 'y-' 실적 조회 한 해)
  function setBar(P, id, pct, text, color) {
    const fill = $(`${P}tbar-${id}`);
    fill.style.width = Math.max(0, Math.min(pct || 0, 100)) + '%';
    if (color) fill.style.background = color;
    $(`${P}pct-${id}`).textContent = text;
  }
  // 목표 카드 막대 (RE100 · 폐기물) — 온실가스 카드와 같은 그림 (굵은 막대 + 색 눈금 + 눈금 이름)
  //  stack  = 진한 = 누적 · 옅은 = 남은 달(연말 예측까지) — 폐기물처럼 쌓이는 양
  //  bullet = 옅은 굵은 막대 = 연말 예측 · 안의 진한 가는 막대 = 누적 — 비율(RE100)은 쌓이지 않아 누적이 예측보다 클 수도 있어서
  //  ticks  = [{ k: 'goal' 청록 목표 | 'base' 회색 기준, x, n: 눈금 이름 }] · 눈금이 없으면 견줄 것이 없어 막대도 그리지 않음
  // 원형 링: 진한 호 = 누적(실적) · 옅은 호 = 연말 예측 · 흰 눈금 = 목표 (100%를 향하는 지표용)
  //  SVG 속성에는 CSS 변수가 안 먹어서 색은 style로
  function ringSvg({ act = null, est = null, goal = null, col = 'var(--accent)', size = 56, center = null, aria = '' }) {
    const w = size >= 50 ? 7 : 5, r = size / 2 - w / 2 - 1, c = 2 * Math.PI * r, h = size / 2;
    const arc = (v, op) => v == null || !(v > 0) ? '' : `<circle cx="${h}" cy="${h}" r="${r}" fill="none" stroke-width="${w}" stroke-linecap="round" ` +
      `stroke-dasharray="${(Math.min(100, v) / 100 * c).toFixed(2)} ${c.toFixed(2)}" transform="rotate(-90 ${h} ${h})" style="stroke:${col};opacity:${op}"/>`;
    let svg = `<svg class="tg-ring" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" role="img" aria-label="${esc(aria)}">` +
      `<circle cx="${h}" cy="${h}" r="${r}" fill="none" stroke-width="${w}" style="stroke:var(--border)"/>` + arc(est, .38) + arc(act, 1);
    if (goal != null) { const a = Math.min(100, goal) / 100 * 2 * Math.PI - Math.PI / 2, p = d => `${(h + d * Math.cos(a)).toFixed(1)} ${(h + d * Math.sin(a)).toFixed(1)}`;
      svg += `<path d="M${p(r - w / 2 - 2)} L${p(r + w / 2 + 2)}" stroke-width="2.2" stroke-linecap="round" style="stroke:var(--text)"/>`; }
    if (center != null) svg += `<text x="${h}" y="${h + 4}" text-anchor="middle" font-size="${size >= 50 ? 12.5 : 10}" font-weight="700" style="fill:var(--text)">${esc(center)}</text>`;
    return svg + '</svg>';
  }
  function famChart(el, { mode, act, est, ticks, col, aria }) {
    if (!(act > 0 || est > 0) || !ticks.length) { el.innerHTML = ''; el.removeAttribute('aria-label'); return; }
    const goal = ticks.find(t => t.k === 'goal')?.x;
    const mx = Math.max(mode === 'bullet' && goal > 0 ? goal / 0.8 : 0, ...[act, est, ...ticks.map(t => t.x)].filter(x => x > 0).map(x => x * 1.04));
    const pc = x => +(Math.max(0, Math.min(x || 0, mx)) / mx * 100).toFixed(2), pe = est > 0;
    el.style.setProperty('--tgc', col); el.setAttribute('aria-label', aria);
    const bars = mode === 'bullet'
      ? (pe ? `<div class="tg-fill p bl" style="left:0;width:${pc(est)}%"></div>` : '') + (act > 0 ? `<div class="tg-fill a ${pe ? 'thin' : 'solo'}" style="width:${pc(act)}%"></div>` : '')
      : `<div class="tg-fill a${pe && est > act ? '' : ' solo'}" style="width:${pc(act)}%"></div>` +
        (pe && est > act ? `<div class="tg-fill p" style="left:${pc(act)}%;width:${(pc(est) - pc(act)).toFixed(2)}%"></div>` : '');
    el.innerHTML = '<div class="tg-track"></div>' + bars + ticks.map((t, i) => { const at = pc(t.x), al = at > 93 ? ' r' : at < 7 ? ' l' : '';
      return `<i class="tg-tick ${t.k}" style="left:${at}%"></i><span class="tg-tl ${t.k} ${i % 2 ? 'dn' : 'up'}${al}" style="left:${at}%">${esc(t.n)}</span>`; }).join('');
  }
  const TG_COL = { ok: 'var(--ok)', mid: 'var(--warn)', no: 'var(--bad)', na: 'var(--border2)' };   // 목표 없음(na)은 강조색이 아니라 중립색

  // 온실가스 배출목표 한 장 (대구본원 · Scope 1+2) — 기준·자체·법적 세 숫자를 한 막대에
  //  막대 = 누적(진하게) + 연말 예측(옅게, 지난 연도는 실적만) · 눈금 = 자체·법적 목표 · 끝 = 기준배출량
  //  색 = 판정 (자체 목표 이하 초록 · 자체 초과·법적 이하 주황 · 법적도 초과 빨강) · 아래 열쇠를 누르면 그 목표의 계산 근거
  //  → 거점 설명 판정 칩용 { st: 'ok' | 'no', txt } | null
  function renderGhgTarget(P, o) {
    const $$ = id => $(P + id), { act, est, own, law, base, isCur, yS } = o;
    const v = isCur ? est : act, has = v > 0, tg = own ?? law, tgN = own != null ? '자체 목표' : '법적 목표';
    const st = !has || tg == null ? 'na' : v <= tg ? 'ok' : own != null && law != null && v <= law ? 'mid' : 'no';
    const col = TG_COL[st];
    const gap = has && tg != null ? Math.abs(v - tg) : 0, est1 = isCur ? ' 전망' : '';
    const say = st === 'ok' ? `✓ ${tgN}보다 ${fq(gap)}t ${isCur ? '적을 전망' : '적게 배출'}`
      : st === 'mid' ? `✗ 자체 목표 ${fq(v - own)}t 초과${est1} · 법적 목표 ✓`
      : st === 'no' ? `✗ ${law != null ? '법적 목표도' : tgN} ${fq(v - (law ?? tg))}t 초과${est1}` : '';
    const vd = $$('tg-verdict');
    vd.className = 're-verdict' + (st === 'ok' ? ' good' : st === 'na' ? '' : ' bad'); vd.textContent = say;
    const pct = x => +(Math.max(0, x) / (Math.max(base || 0, v || 0, act || 0, own || 0, law || 0) * 1.04 || 1) * 100).toFixed(2);
    $$('tg-nums').innerHTML = !(act > 0) ? '<span class="cmp-na">대구본원 배출 자료가 아직 없어요</span>' :
      `<span><i class="tg-k a" style="--tgc:${col}"></i>${isCur ? '누적' : `${yS} 실적`} <b>${fq(act)}</b>t</span>` +
      (isCur && est > 0 ? `<span><i class="tg-k p" style="--tgc:${col}"></i>연말 예측 <b>${fq(est)}</b>t</span>` : '') +
      (base > 0 && has ? `<span class="tg-cut">기준배출량 대비 ${v <= base ? '▼' : '▲'}${fmt(Math.abs(base - v) / base * 100, 1)}%${est1}</span>` : '');
    const ticks = [['own', own, '자체'], ['law', law, '법적'], ['base', base, '기준']].filter(([, x]) => x > 0);
    const ch = $$('tg-chart'), pe = isCur && est > act;
    ch.style.setProperty('--tgc', col);
    ch.setAttribute('aria-label', !(act > 0) ? '' : `${isCur ? `누적 ${fq(act)}t · 연말 예측 ${fq(est)}t` : `${yS} 실적 ${fq(act)}t`} · ` +
      ticks.map(([, x, n]) => `${n} ${fq(x)}t`).join(' · '));
    ch.innerHTML = !(act > 0) ? '' : '<div class="tg-track"></div>' +
      `<div class="tg-fill a${pe ? '' : ' solo'}" style="width:${pct(act)}%"></div>` +
      (pe ? `<div class="tg-fill p" style="left:${pct(act)}%;width:${(pct(est) - pct(act)).toFixed(2)}%"></div>` : '') +
      ticks.map(([k, x, n], i) => { const at = pct(x), al = at > 93 ? ' r' : at < 7 ? ' l' : '';
        return `<i class="tg-tick ${k}" style="left:${at}%"></i><span class="tg-tl ${k} ${i % 2 ? 'dn' : 'up'}${al}" style="left:${at}%">${n}</span>`; }).join('');
    const NM = { own: '자체 목표', law: '법적 목표', base: '기준배출량' };
    $$('tg-keys').innerHTML = ticks.map(([k, x]) => { const cut = k !== 'base' && base > 0 ? fmt((base - x) / base * 100, 1) : null;
      return `<button type="button" class="tg-key" data-calc="k-tgt-${k}" title="${cut ? `기준배출량 대비 ${cut}% 감축 · ` : ''}누르면 ${NM[k]} 계산 근거">` +
        `<i class="${k}"></i>${NM[k]} <b>${fq(x)}t</b>${cut ? `<small>▼${cut}%</small>` : ''}</button>`; }).join('');
    return st === 'na' ? null : st === 'ok' ? { st: 'ok', txt: `✓ 여유 ${fq(gap)}t` } : { st: 'no', txt: `✗ ${tgN === '자체 목표' ? '자체 ' : ''}${fq(gap)}t 초과` };
  }

  // 거점 설명의 '적용 목표' 칩 → 판정 칩 (예: 온실가스 감축 ✓ 여유 97t) · 누르면 그 목표 카드로
  //  P = '' 올해 현황(#site-info) · 'y-' 그 해 자세히(#h-site-info)
  const VD_CARD = { ghg: 'tc-ghg', re: 'tc-re', wt: 'tc-wt' };
  function siteVerdicts(P, vd, isCur, year) {
    const box = $(P ? 'h-site-info' : 'site-info'); if (!box) return;
    box.querySelectorAll('.si-tag[data-k]').forEach(tg => {
      const k = tg.dataset.k, v = vd[k], nm = tg.dataset.nm || tg.textContent;
      if (!v) return;
      const b = document.createElement('button');
      b.type = 'button'; b.className = `si-tag si-v ${v.st}`; b.dataset.k = k; b.dataset.nm = nm; b.dataset.to = VD_CARD[k];
      b.title = `${nm} — ${isCur ? '연말 전망' : `${yrShort(year)} 실적`} · 누르면 목표 카드로`;
      b.innerHTML = `${esc(nm)} <b>${esc(v.txt)}</b>`;
      tg.replaceWith(b);
    });
    const lb = box.querySelector('.si-tk');
    if (lb && Object.keys(vd).length) lb.textContent = isCur ? `적용 목표 · ${yrShort(year)} 연말 전망` : `적용 목표 · ${yrShort(year)} 실적`;
  }
  document.addEventListener('click', e => {
    const b = e.target.closest('.si-v[data-to]'); if (!b) return;
    const inHist = !!b.closest('#h-site-info'), cmpOn = inHist && !$('h-cmp-view')?.hidden;
    let card;
    if (cmpOn) card = document.querySelector(`#h-sum [data-vk="${b.dataset.k}"]`);   // 연도별 비교 → 핵심 성과 카드
    else { const P = inHist ? 'y-' : ''; card = $(P + b.dataset.to); const sec = $(P + 'sec-target'); if (sec && !sec.open) sec.open = true; }
    if (!card) return;
    card.scrollIntoView({ behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'center' });
    card.classList.remove('flash'); void card.offsetWidth; card.classList.add('flash');
    setTimeout(() => card.classList.remove('flash'), 1400);
  });

  // 자원·기타 지표 정리: 값이 있는 카드만 · 자료 없음·해당 없음은 한 줄 · 접힌 머리에 요약 (예: 용수 1,200㎥ ▲20.0% · 친환경차 40%)
  function tidyEnv(P) {
    const $$ = id => $(P + id), sec = $$('sec-env'); if (!sec) return;
    const none = [], na = [], peek = [];
    sec.querySelectorAll('.env-grid > .kpi-card').forEach(c => {
      if (c.classList.contains('v2-only') && !v2) return;   // 2단계 전: 설정 안내가 대신
      const nm = (c.querySelector('.kpi-label')?.firstChild?.textContent || '').replace(/^[^\p{L}\p{N}]+/u, '').replace(/\s*\(.*\)\s*$/, '').trim();
      const val = c.querySelector('.kpi-value')?.textContent.trim() || '', sub = c.querySelector('.kpi-sub')?.textContent || '';
      const isNa = c.classList.contains('tgt-na') || /해당 없음/.test(val + sub) || (c.id?.endsWith('card-regen') && c.hidden);
      const empty = isNa || !val || val === '-' || val === '—';
      c.classList.toggle('tidy-out', empty);
      if (isNa) na.push(nm); else if (empty) none.push(nm);
      else { const u = c.querySelector('.kpi-u')?.textContent.trim() || '', yo = c.querySelector('.kpi-yoy')?.textContent.match(/[▲▼]\s?[\d.,]+%/)?.[0] || '';
             peek.push(`${nm.replace(/ (사용량|전환율|전환률|발전량)$/, '')} ${val}${u === '%' || u === '㎥' || u === '배' ? u : ` ${u}`}${yo ? ` ${yo.replace(/\s/g, '')}` : ''}`); }
    });
    const note = $$('env-empty');
    note.innerHTML = [none.length ? `<b>자료 없음</b> ${esc(none.join(' · '))}<span data-need="edit"> — 데이터 입력 → 기타 지표에서 넣어요</span>` : '',
                      na.length ? `<b>해당 없음</b> ${esc(na.join(' · '))}` : ''].filter(Boolean).join('<br>');
    note.hidden = !(none.length || na.length) || (!v2 && !na.length);
    $$('env-peek').textContent = peek.join(' · ');
  }
  // 에너지·폐기물 사용량: 칸은 예전처럼 모두 그대로 ('항목 미정'·'추후 업데이트 예정'·'해당 없음'도 — Scope별 칸 구성이 늘 같아야
  //  앞으로 넣을 항목(출장 등)까지 한눈에 보여서) · 접힌 머리에 배출 구성 막대 (어디서 많이 나오나)
  function tidyUsage(P, ey) {
    const $$ = id => $(P + id); if (!$$('sec-usage')) return;
    // 배출 구성 (Scope 1+2 · 에너지원별 비중) — 접혀 있어도 머리에 보임
    const parts = EMIT_TYPES.map(t => ({ t, g: sumBy(ey.filter(r => r.type === t), r => r.ghg) })).filter(x => x.g > 0).sort((a, b) => b.g - a.g);
    const tot = sumBy(parts, x => x.g), pc = x => fmt(x.g / tot * 100, 0);
    $$('use-peek').innerHTML = !(tot > 0) ? '' :
      `<span class="pk-bar" role="img" aria-label="${esc(`온실가스 배출 구성: ${parts.map(x => `${x.t} ${pc(x)}%`).join(', ')}`)}">` +
      parts.map(x => `<i style="flex:${x.g} 0 0;background:${typeCol(x.t)}" title="${esc(`${x.t} ${fq(x.g)} tCO₂eq (${fmt(x.g / tot * 100, 1)}%)`)}"></i>`).join('') + '</span>' +
      `<span class="pk-t">${parts.slice(0, 3).map(x => `${x.t} ${pc(x)}%`).join(' · ')}</span>`;
  }
  // 경고 표시 읽는 법 (카드에 표시가 하나라도 있을 때만) — ⚠ 늘어남 · 🔍 입력 확인(입력 권한) · 빨간 테두리 = 목표 초과
  function alLegend(P) {
    const root = $(P ? 'y-yv' : 'yv'), el = $(P + 'al-legend'); if (!root || !el) return;
    const up = !!root.querySelector('.kpi-alert'), chk = !!root.querySelector('.kpi-check'), over = !!root.querySelector('.kpi-card.alert-over:not([hidden])');
    el.hidden = !(up || chk || over);
    const cur = !P;   // 그 해 자세히(지난 연도)는 '넘었음', 올해는 '넘을 전망'
    el.innerHTML = '<b>표시 읽는 법</b>' + (up ? '<span><span class="al-up">⚠</span> 전년·평년보다 늘어남</span>' : '') +
      (chk ? `<span data-need="edit">${icn('search')} 입력 실수 의심</span>` : '') + (over ? `<span><span class="al-over">빨간 테두리</span> 목표 초과${cur ? ' 전망' : ''}</span>` : '') +
      '<span>카드를 누르면 이유·계산 근거</span>';
  }
  const yearSpan = o => { const k = Object.keys(o); return `${k[0].slice(2)}~${k[k.length - 1].slice(2)}년`; };
  const tgtOf = (y, kind) => kind === 'own' ? (ROADMAP[y]?.target ?? null)
    : (LAW_RATE[y] !== undefined && baseOf(y) ? baseOf(y) * (1 - LAW_RATE[y] / 100) : null);   // 법적 = 그 해 기준배출량 × (1 − 권장감축률)
  // 증감 표시: good = 'down'(줄면 좋음) | 'up'(늘면 좋음)
  const deltaHtml = (diff, unit, good) => {
    if (diff == null || !isFinite(diff)) return '';
    if (Math.abs(diff) < 0.05) return `<div class="cmp-delta">→ 0.0${unit}</div>`;
    const up = diff > 0, ok = (good === 'up') === up;
    return `<div class="cmp-delta ${ok ? 'good' : 'bad'}">${up ? '▲' : '▼'}${fmt(Math.abs(diff), 1)}${unit}</div>`;
  };
  // 목표 구역: 고른 거점에 해당하는 목표 카드만 · 해당 없는 목표는 숨기고 줄 끝에 한 줄로 (빈 회색 카드 대신)
  //  온실가스는 한 장(tc-ghg · 두 칸 너비)으로 그리고, 예전 세 카드(기준·자체·법적)는 계산 근거·기존 동작용으로 숨겨 둠
  const TGT_LABEL = { ghg: '온실가스', re: 'RE100', wt: '폐기물' };
  const TGT_COLS = 4;
  function setTargetView(T, si, cards, secId, gridId, siteId) {
    const NA_WHY = { ghg: '온실가스 감축 목표 = 대구본원만', re: 'RE100 = 대구본원·제주글로벌센터', wt: '폐기물 감축 목표 = DB 설정 후' };
    let used = 0;
    Object.entries(cards).forEach(([id, k]) => {
      const el = $(id), legacy = /tc-(base|own|law)$/.test(id);
      el.classList.remove('tgt-na'); el.title = '';
      el.hidden = legacy || !T[k];
      if (!el.hidden) used += el.classList.contains('tgt-ghg') ? 2 : 1;
    });
    const na = [...new Set(Object.values(cards))].filter(k => !T[k]), P = gridId.startsWith('y-') ? 'y-' : '', note = $(P + 'tgt-na-note');
    if (note) {
      note.hidden = !na.length;
      note.innerHTML = `<span><b>이 거점에 적용하지 않는 목표</b> ${na.map(k => NA_WHY[k]).join(' · ')}</span>`;
      note.style.setProperty('--na-span', String(Math.max(1, TGT_COLS - used)));
    }
    $(secId).hidden = false;
    $(gridId).style.gridTemplateColumns = `repeat(${TGT_COLS},minmax(0,1fr))`;
    const n = ['ghg', 're', 'wt'].filter(k => T[k]).length;
    $(siteId).textContent = n ? `${si || '전체 합계'} · ${['ghg', 're', 'wt'].filter(k => T[k]).map(k => TGT_LABEL[k]).join('·')}` : '';
    // 전체 합계일 때 카드 제목 옆에 대상 거점 (대구본원 · 대구+제주 합산 · 세 거점 합산)
    const SCOPE = { ghg: TARGET_SITES.ghg, re: TARGET_SITES.re, wt: TARGET_SITES.waste };
    Object.entries(cards).forEach(([id, k]) => { const lb = $(id)?.querySelector('.kpi-label'); if (!lb) return;
      let sp = lb.querySelector('.tgt-scope'); if (!sp) { sp = document.createElement('span'); sp.className = 'tgt-scope'; lb.appendChild(sp); }
      sp.textContent = si ? '' : k === 'wt' ? '세 거점 합산' : k === 're' ? '대구+제주 합산' : sitesLabel(SCOPE[k]); });
    return n;
  }

  /* ── 거점 선택 (올해 현황·실적 조회가 같이 씀) — 기본은 모든 목표를 적용하는 대구본원 ── */
  let curSite = '대구본원';
  const SITE_INFO = {
    '대구본원':       { role: '감축 목표 관리', tone: 'goal',
                        desc: '온실가스 감축(기준배출량 대비 자체·법적 목표)·RE100·폐기물 감축 목표를 모두 적용하는 거점이에요. 목표 대비 실적을 함께 보여드려요.' },
    '서울사무소':     { role: '폐기물 목표', tone: 'part',
                        desc: '폐기물 감축 목표(세 거점 합산)에 포함되는 거점이에요. 온실가스·RE100 목표는 적용하지 않아 에너지 사용량과 배출 추이를 모니터링해요.' },
    '제주글로벌센터': { role: 'RE100·폐기물 목표', tone: 'part',
                        desc: 'RE100(대구본원과 합산)·폐기물(세 거점 합산) 감축 목표에 포함되는 거점이에요. 온실가스 감축 목표는 대구본원에만 적용돼 여기서는 배출 추이를 봐요.' },
    '':               { role: '3개 거점 합계', tone: '',
                        desc: '세 거점의 사용량·배출량을 합친 화면이에요. 목표는 대상 거점끼리 모아 보여 줘요 — 온실가스 = 대구본원 · RE100 = 대구+제주 합산 · 폐기물 = 세 거점 합산.' },
  };
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
    if (!si) tags.push(['ghg', '온실가스 감축 (대구본원)'], ['re', `RE100 (대구+제주 합산)`], ['wt', '폐기물 감축 (세 거점 합산)']);
    $(id).innerHTML = `<div class="si-head"><b class="si-name">${si || '전체 합계'}</b><span class="si-role ${info.tone}">${info.role}</span></div>` +
      `<p class="si-desc">${info.desc}</p><div class="si-meta"><span class="si-k si-tk">적용 목표</span>` +
      (tags.length ? tags.map(([k, t]) => `<span class="si-tag" data-k="${k}">${t}</span>`).join('') : '<span class="si-none">없음</span>') +
      `<span class="si-items"><span class="si-k">관리 항목</span><span>${items.length ? items.map(esc).join(' · ') : '<span class="si-none">입력된 자료 없음</span>'}</span></span></div>`;
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
      setBar(P, `${key}-act`, 0, '—'); setBar(P, `${key}-pred`, 0, '—'); sub.textContent = '대구본원 데이터 없음'; return null;
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
    $('cur-year-label').textContent = `${curYr}년 현황 · ` + (thr.max ? `실적 ${thr.txt}${thr.max < 12 ? ' + 예측' : ''}` : '아직 입력 전 · 예측') +
      (upd ? ` · ${upd.getMonth() + 1}.${upd.getDate()} 업데이트` : '');
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
      : T.ghg ? '온실가스 = Scope 1+2 · 예측 = 기상연동 예측(직전 2개년 같은 달 평균 + 추세 보정 + 냉난방도일 보정) · <a href="#sec-basis" class="hd-link">근거 보기 ↓</a>'
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
    const siteTxt = si || '세 거점 합계';
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
        const re100 = reAll / cons * 100, reEq = `${si ? '' : '대구+제주 · '}(자가 ${fq(rSelf)} + 구매 ${fq(rBuy)}) ÷ 총 ${fq(cons)} kWh`;
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
      const dataMonths = new Set(energyRecs.filter(r => r.date?.startsWith(yr) && r.site === '대구본원' && isEmit(r.type)).map(r => r.date.slice(5, 7))).size;
      const annualEst = !isCur ? null : fc?.annualPred ?? (dataMonths > 0 ? totalDgb * 12 / dataMonths : 0);
      const rm = ROADMAP[year], lr = LAW_RATE[year], b = baseOf(year);
      const vOwn = renderTargetCard(P, 'own', rm ? { target: rm.target, rate: ownRate(year) } : null, totalDgb, annualEst, `자체 로드맵 목표 없음 (${yearSpan(ROADMAP)})`, isCur);
      const vLaw = renderTargetCard(P, 'law', lr !== undefined && b ? { target: b * (1 - lr / 100), rate: lr } : null, totalDgb, annualEst, `법적 권장감축률 없음 (${yearSpan(LAW_RATE)})`, isCur);
      const ownT0 = rm ? rm.target : null, lawT0 = lr !== undefined && b ? b * (1 - lr / 100) : null;
      const gv = renderGhgTarget(P, { act: totalDgb, est: annualEst, own: ownT0, law: lawT0, base: b || null, isCur, yS });
      if (gv) vdict.ghg = gv;
      $$('k-tgt-base').textContent = b ? fq(b) : '—';
      $$('k-tgt-base-yr').textContent = `${yS} 적용값 (해마다 조정)`;
      $$('k-tgt-base-sub').textContent = isCur || !(totalDgb > 0) || !b ? '대구본원 기준'
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
      $$('k-regen-sub').textContent = `${si ? '' : '대구본원 · '}${months}개월 ${isCur ? '누적' : '합계'}` + (ry == null ? '' : ` · ${isCur ? '전년 동기' : '전년'} 대비 ${arrow(ry.v)}${fmt(Math.abs(ry.v), 1)}%`) +
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
    tidyEnv(P); tidyUsage(P, ey); alLegend(P);
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
      `<div class="sb-share-hd"><span>온실가스 (Scope 1+2) 거점별 비중</span><span class="sb-tot">세 거점 합계 <b>${fq(tot)}</b> tCO₂eq</span></div>` +
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
    }).join('') + '<th class="sb-sumh"><span class="nm-l">세 거점 합계</span><span class="nm-s">합계</span></th></tr></thead>';
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
      period: `${yrShort(yr)}`, site: si || '세 거점 합계', unit: '%', rows: [], sites: [], months: [], ...o }; };
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
      period: isCur ? `${yrShort(yr)} 올해 누적 (1월~이번 달)` : `${yrShort(yr)} 연간`, site: si || '세 거점 합계',
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
    // PUE: 낮을수록 좋음 · 고른 거점 (전체 합계 = 대구본원 + 서울사무소 · 제주는 전산실이 없어 해당 없음)
    $$('k-pue').closest('.kpi-card').classList.toggle('kpi-placeholder', !pueSites.length);
    if (!pueSites.length) { $$('k-pue').textContent = '해당 없음'; $$('k-pue-sub').textContent = '전산실 PUE는 대구본원·서울사무소'; }
    else show('pue', 'k-pue', 'k-pue-sub', v => fmt(v, 2), s => `총 ${fq(s.t)} ÷ IT ${fq(s.it)} kWh`,
      (v, p) => `전년 ${fmt(p, 2)} ${v < p ? '▼' : v > p ? '▲' : '→'}${fmt(Math.abs(v - p), 2)}`,
      s => ({ title: icn('monitor') + ' PUE (전력효율지수)', sub: '데이터센터가 쓴 전기 중 IT 장비 몫', unit: '배',
        site: sitesLabel(pueSites),
        formula: !s ? null : { parts: [{ k: '데이터센터 총 전력', v: s.t, u: 'kWh' }, { k: 'IT 장비 전력', v: s.it, u: 'kWh', op: '÷' }],
          result: { k: 'PUE', v: s.pue, u: '배' } },
        facts: !s ? [] : [{ k: '냉방·조명 등 IT 외 전력', v: s.t - s.it, u: 'kWh' }],
        note: '1에 가까울수록 효율적이에요 (1.0 = 모든 전기를 IT 장비가 씀) · 전산실이 있는 대구본원·서울사무소만 해당' }));
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
      : `막대에 마우스를 올리면 사용량·온실가스 환산값(tCO₂eq)·전년 같은 달을 함께 보여 줘요 · 누르면 ${tap}`;
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
      (anyPrev ? `<span><i class="k-q"></i>${pS} 같은 달</span>` : '') + '<span>· 에너지원마다 단위가 달라 그래프를 나눴어요</span>';
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
    const site = $('bs-site').value || '대구본원', w = wxBySite?.[site], curYr = new Date().getFullYear(), yr = String(curYr);
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
  const dgbOf = y => sumBy(energyRecs.filter(r => r.date?.startsWith(y) && r.site === '대구본원' && isEmit(r.type)), r => r.ghg);
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
    const vis = id => { const el = $(id); return el && !el.hidden && el.style.display !== 'none' && !el.closest('[hidden]'); };
    $('d-toc').innerHTML = D_TOC.filter(([id]) => vis(id)).map(([id, t]) => `<a href="#${id}" data-to="${id}">${t}</a>`).join('');
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
      `<span class="ov-k">${o.ic} ${esc(o.k)}</span><b class="ov-b">${o.st === 'ok' ? '✓' : o.st === 'warn' ? '!' : '✗'} ${o.b}</b><span class="ov-t">${o.t}</span></li>`).join('');
  }
  // ① 카드 — 30·50년 온실가스 · 30·50년 RE100 · 계량 점수 (누르면 그 해 계산 근거) · 만약에가 켜져 있으면 보라 줄
  function renderOCards(OL, ROL, EV, SOL, SROL, EVS) {
    const t1 = v => fmt(v, 1), cards = [];
    const card = o => `<div class="gs-card o-card ${o.st}" role="button" tabindex="0"` +
      (o.pop ? ` data-rmpop="${o.pop}" title="누르면 계산 근거"` : ` data-go="outlook" data-scroll="${o.go}" title="누르면 아래 표로"`) + '>' +
      `<div class="gs-k">${o.k}</div><div class="gs-v">${o.v}<small>${o.u}</small></div><div class="gs-t">${o.t}</div>` +
      `<div class="gs-r">${o.r}</div>${o.sc ? `<div class="o-scl">만약에 ${o.sc}</div>` : ''}${o.s ? `<div class="o-cs">${o.s}</div>` : ''}</div>`;
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

  await boot();
  decorateNums();
})();
