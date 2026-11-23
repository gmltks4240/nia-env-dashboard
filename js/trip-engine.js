/* js/trip-engine.js (Scope 3 출장 2/3) — 산정·분류 엔진 (순수 함수)
   화면도 DB도 건드리지 않는다. 엑셀 한 행 → 구간·횟수·거리·배출량과 판정 등급을 내는 규칙만 둔다.
   tests/test_trip_rail.py 와 tools/build_trip_seen.py 가 이 파일을 그대로 읽어 브라우저에 넣고 돌린다.
   js/trip-data.js 의 TRIP_REF·TRIP_FARE·TRIP_SEEN·TRIP_LABELS 를 입력으로 받는다. */
  /* @trip-start ── 출장(철도) Scope 3 산정 (순수 함수: 검증 스크립트에서도 이 코드를 그대로 사용) ── */
  // 한 행 = 출장 1건(1인) · 기본 왕복 1회 · 교통비가 왕복 운임의 n배이고 출장 일수가 n일 이상이면 왕복 n회 · 교통비 0원은 미이동으로 제외
  // 판정 등급  A 업무상 확정(사용자 확인 라벨 · 또는 구간·횟수가 가정 없이 하나로 정해짐 — 2026-11-20 재정의)
  //            → B 운임표+구간 일치 · B 기관 판정기준(장소 미확인) → C 운임표만 일치 → D 추정
  const TRIP_RATE = 43500 / 286.7;           // 운임 역산: 원/km (동대구–서울 일반실)
  const TRIP_STOP_STEPS = 5;                 // 정차역 할인 단계 수 (0.2% × 1~5)
  const TRIP_SEAT_DK = 9;                    // 입석·자유석은 정차역 변형보다 뒤에 보도록 주는 가중치
  const TRIP_A_KM_TOL = 0.02;                // A 로 볼 때 다른 설명과의 거리 차이 허용 폭 (2%)
  const TRIP_DK_MAX = 2 * (TRIP_SEAT_DK + TRIP_STOP_STEPS);   // 폭은 그대로 — 왕복에서 한 편만 입석·자유석인 조합이 이 안에 들어와야 한다 (두 편 모두 할인 좌석인 왕복은 classifyRail 에서 후보로 만들지 않음)
  const TRIP_KM_CAP = 573.4 * 1.5;           // 운임 역산 상한 (km)
  // 강릉선 역 — 서울역 기점 영업거리(km). 국토교통부고시 제2017-428호 철도거리표(위키백과 '강릉선 KTX' 역 목록에서 옮김) ·
  //  코레일 운영노선 '원주~강릉 120.7km'(2026-09-01 기준)와 대조함. 기준표(@trip-ref)의 거리표에는 강릉선 역이 없어 여기에 둠
  const TRIP_GANG_KM = { 강릉: 223.2, 진부: 182.9, 평창: 166.6, 둔내: 146.6, 횡성: 126.0 };
  const TRIP_GANG_FARE = 27600;              // 서울–강릉 KTX 일반실 편도 — 편도·왕복을 가르는 데만 씀(역별 운임은 거리에 비례한다고 봄)
  const TRIP_STN_CITY = { 서울: '서울', 용산: '서울', 광명: '서울', 수서: '서울', 영등포: '서울', 동대구: '대구', 서대구: '대구', 오송: '세종' };
  // 같은 도시의 '부역' — 금액이 여러 역과 맞을 때는 대표역(서울·동대구)을 먼저 본다
  //  (2026-11-17 사용자 확인: 서울→서울 41,300 은 광명 좌석이 아니라 서울역 자유석이다. 직원들은 서울역을 쓴다)
  const TRIP_SUB_STN = ['광명', '영등포', '용산', '서대구'];
  const TRIP_HOME = '대구';                  // 본원이 있는 도시 — '서울→서울'처럼 같은 도시로 적힌 행(선이동 관행)은 이 도시와의 구간으로 본다
  const TRIP_NORTH = ['서울', '용산', '광명', '천안아산', '오송', '대전', '김천구미', '영등포'];   // 서대구 기준 북쪽 역
  // 표준 지점(도시) — AI 분류 함수도 이 목록 안에서만 고름
  const TRIP_POINTS = ['대구', '서울', '세종', '대전', '부산', '천안아산', '김천구미', '경주', '울산', '포항', '광주송정', '나주', '익산', '전주',
    '목포', '여수EXPO', '순천', '진주', '창원', '밀양', '공주', '정읍', '강릉선', '제주', '기타'];
  // 글자가 우연히 겹치는 함정을 피함: '해운대구'의 대구 · '연수원'의 수원 · '경기장'의 경기 · 다른 도시의 혁신도시·중구 · 세종대(서울) · 정부서울/대전/과천청사 · 경기 광주
  // 2026-11-18 추가: 경산(→대구, 인수인계 기준) · 수도권 시·지명 · 세종·대전·김천 소재 기관 · 자료에 반복해 나오는 오타(사울·서욻·새종·댜구 등)
  const TRIP_PAT = [
    ['대구', /(?<!해운)대구|본원|신서|경산|댜구|데구|동데구|때구|^(?!.*(서울|무교|사무소|글로벌센터|제주)).*NIA|^(?!.*(김천|나주|충북|진천|음성|전북|전주|완주|원주|진주|경남|울산|부산|제주)).*혁신도시/],
    ['서울', /서울|광화문|용산|국회|프레스센터|가산|의정부|부천|파주|김포|군포|남양주|하남|의왕|안산|시흥|평촌|킨텍스|행신|을지로|충무로|남대문|공덕|삼성동|삼성역|가락동|국방부|국립국악원|대한체육회|포스트타워|은행회관|누리꿈스퀘어|과학기술회관|생산성본부|삼일회계|대한상공회의소|숙대|숙명여|중앙대|사울|서욻|사을|서룰|서율|국토지리정보원|LW컨벤션|한전아트센터|DMC|여의도|강남|마포|종로|코엑스|상암|판교|성남|분당|수서|과천|양재|무교|서초|송파|영등포|잠실|명동|광명|(?<!연)수원|인천|경기(?!장)|고양|일산|안양|용인|과기정통부서울|세종대(?!전)|세종문화|세종호텔|^(?!.*(대구|대전|부산|울산|광주)).*중구/],
    ['세종', /세종(?!대(?!전)|문화|호텔)|오송|행정안전부|과학기술정보통신부|식품의약품안전처|식약처|우정사업본부|국토부|국토교통부|오창|식품안전관리인증원|새종|기재부|과기부|과기정통부|행안부|청주|기획재정부|조치원|^(?!.*(서울|대전|과천)).*정부청사/],
    ['대전', /대전|유성|대덕|소상공인시장진흥공단|한국철도공사|국가정보자원관리원|한국화학연구원|^(?!.*서울).*ETRI|한밭/], ['부산', /(?<!양산)부산|해운대|벡스코/], ['천안아산', /천안|아산(?!병원|정책|나눔|재단)/], ['김천구미', /김천|구미|한국도로공사/],
    ['경주', /경주/], ['울산', /울산|울주/], ['포항', /포항/], ['광주송정', /^(?!.*경기).*광주|나주(?=$)/], ['나주', /나주|빛가람/], ['익산', /익산/],
    ['전주', /전주|완주|^(?!.*(정읍|익산|군산|무주|남원|김제|고창|부안)).*전북/], ['목포', /목포|무안/], ['여수EXPO', /여수/], ['순천', /순천/], ['진주', /진주/],
    ['창원', /창원|마산|진해/], ['밀양', /밀양/], ['공주', /공주/], ['정읍', /정읍/], ['강릉선', /강릉|평창|진부|횡성|둔내/], ['제주', /제주|서귀포|^(?!.*서울).*글로벌센터/]
  ];
  const tripR1 = x => Math.round(x * 10) / 10;
  const tripCity = s => TRIP_STN_CITY[s] || s;
  const tripPairKey = (a, b) => a < b ? a + '|' + b : b + '|' + a;
  // 장소명 → 표준 지점 목록 · 사전(placeMap: AI·사람 확정)에 있으면 그 값, 없으면 내장 키워드 규칙
  function tripCities(text, placeMap) {
    const t = String(text ?? '').trim();
    if (!t) return [];
    const e = placeMap && placeMap[t];
    if (Array.isArray(e)) return e;   // 옛 형식(배열)은 확정으로 본다 — 하위호환
    // 2026-11-20 사용자 결정: 장소를 안다는 것은 확신 high 일 때뿐. low·unknown 은 미확정 → 빈 목록(source 는 보지 않음)
    if (e && typeof e === 'object') return e.confidence === 'high' && Array.isArray(e.points) ? e.points : [];
    return TRIP_PAT.filter(([, re]) => re.test(t)).map(([c]) => c);
  }
  //  FARE(코레일 KTX 운임표, 기간별)가 있으면: 2026-08-31 까지는 [옛 기준표 + 2025년판], 2026-09-01 부터는 [2026년판]만 씀(통합 뒤 SRT 운임표·옛 판정기준은 쓰지 않음)
  function tripBuildRef(REF, FARE) {
    const DT = new Map(REF.dist.map(([a, b, km]) => [tripPairKey(a, b), km]));
    const official = (a, b) => DT.get(tripPairKey(a, b));
    // 역간 거리: 공식 거리표 → 수서·서대구는 참고값으로 추정
    const dist = (a, b) => {
      if (a === b) return null;
      const d = official(a, b);
      if (d != null) return { km: d, q: '공식' };
      if (a === '수서' || b === '수서') {
        const o = a === '수서' ? b : a;
        let v = o === '서대구' ? 261.8 : o === '동대구' ? 269.2 : official(o, '서울') != null ? official(o, '서울') - 17.5 : null;
        if (v && v > 0) return { km: tripR1(v), q: '추정' };
        if (o !== '서대구') return null;
      }
      if (a === '서대구' || b === '서대구') {
        const o = a === '서대구' ? b : a, d0 = official(o, '동대구');
        if (d0 == null) return null;
        return { km: tripR1(TRIP_NORTH.includes(o) ? d0 - 7.4 : d0 + 7.4), q: '추정' };
      }
      return null;
    };
    //  rows : 코레일 운임표 [역, 역, 일반실, 특실 계] · legacy : 옛 기준표(REF.fares·판정기준)를 함께 쓸지
    const build = (rows, legacy) => {
    const segs = [], have = new Set(), topFare = new Map();
    const bump = (a, b, f) => { const k = tripPairKey(a, b); if (!(topFare.get(k) >= f)) topFare.set(k, f); };
    (rows || []).forEach(([a, b, fare]) => bump(a, b, fare));
    if (legacy) REF.fares.forEach(f => bump(f.a, f.b, f.fare));
    //  special : 숫자 = 운임표의 특실 금액 · true = 일반실 × 1.4 산식(운임표에 없는 옛 기준표 행) · false = 특실 없음
    //  vary : 같은 구간·좌석이라도 금액이 조금씩 다름 — 운임표의 금액에서 파생시켜 함께 둠
    //    정차역 수: 중간 정차역 4개부터 1개당 0.2% 할인 → 0.2~1.0%. 일반실·특실 모두 깎인다(2026-11-17 사용자 확인)
    //      통합 뒤 KTX·SRT 의 공식 산정 방식이고, 통합 전 KTX 금액도 같은 폭(±100원)으로 흩어져 있어 모든 기간에 적용한다
    //    'nonstop' (통합 전 KTX) 도중 정차역 2개 이하 열차 0.6% 할증 (2025년판 운임표 주석)
    //    좌석 종류: 입석 = 일반실 좌석운임의 15% 할인 · 자유석 = 5% 할인 (코레일 운임 안내) — 정차역 변형에도 각각 붙음
    //    dk = 운임표 금액에서 몇 단계 파생된 것인지(0 = 표 그대로). 후보가 여럿이면 dk 가 작은 것을 먼저 본다
    const add = (a, b, fare, train, special, vary) => {
      const d = dist(a, b), base = { a, b, train, km: d?.km ?? null, q: d?.q ?? null, main: !TRIP_SUB_STN.includes(a) && !TRIP_SUB_STN.includes(b) };
      //  그 역쌍의 대표 운임(가장 높은 일반실 운임)보다 10% 이상 싼 행에서는 입석·자유석을 파생시키지 않는다
      //  (예: 동대구–서울 34,500 은 수원 경유 완행 KTX 운임 — 여기서 입석 29,200 까지 만들면 우연히 맞는 금액이 늘어난다)
      const seatOK = fare >= 0.9 * (topFare.get(tripPairKey(a, b)) || fare);
      //  100원 단위 처리 — 코레일 여객운송약관 제8조①: 기준운임을 할인하는 등으로 생기는 100원 미만은 50원까지 버리고 50원 초과는 100원
      //   (39,000 × 0.994 = 38,766 → 38,800 · 43,500 × 1.006 = 43,761 → 43,800 · 43,500 × 0.95 = 41,325 → 41,300)
      const r100 = v => { const x = Math.round(v * 1000) / 1000, q = Math.floor(x / 100 + 1e-9); return (x - q * 100 > 50 + 1e-9 ? q + 1 : q) * 100; };
      //  정차역 수에 따른 변형 — SR 할인제도 '정차역 당 운임 0.2% 할인'(SRT · 통합 뒤 KTX), 통합 전 KTX 는 무정차 0.6% 할증
      const genStops = f0 => {
        const arr = [[f0, 0, '']];
        if (vary === 'stops') for (let k = 1; k <= TRIP_STOP_STEPS; k++) arr.push([r100(f0 * (1 - 0.002 * k)), k, ` 정차역 할인 ${(0.2 * k).toFixed(1)}%`]);
        if (vary === 'nonstop') arr.push([r100(f0 * 1.006), 1, ' 무정차 할증 0.6%']);   // 2025년판 주석: 도중 정차역 2개 이하 열차는 운임·요금의 0.6% 할증
        return arr;
      };
      //  s14: 이 금액이 '일반실 × 1.4' 산식에서 나왔는가(2026-11-21). 산식은 코레일 공식 특실 운임표와 대조되지 않은 가정이라 A 가 될 수 없다 — 운임표에 적힌 특실 금액은 가정이 아니다.
      //   cls 만으로는 못 가른다: 운임표에 특실이 있는 구간도 plain × 1.4 를 같은 '특실' 로 넣는다.
      const mk = (cls, s14 = false, seen = new Set()) => { return (v, dk, note, seat = '') => { if (!(v > 0) || seen.has(v)) return; seen.add(v); segs.push({ ...base, fare: v, cls, dk, note, seat, s14 }); }; };
      const plain = genStops(fare), putG = mk('일반');
      plain.forEach(([v, dk, note]) => putG(v, dk, note));
      //  입석·자유석은 운임표 금액(정차역 변형 전)에서만 파생시킨다 — 변형까지 겹쳐 쓰면 우연히 맞는 금액이 너무 늘어난다
      if (seatOK) { putG(r100(fare * 0.85), TRIP_SEAT_DK, ' 입석(15% 할인)', '입석'); putG(r100(fare * 0.95), TRIP_SEAT_DK, ' 자유석(5% 할인)', '자유석'); }
      //  특실 = 운임표의 특실 금액 + 일반실 금액 × 1.4 (특실요금 = 운임의 40%, 100원 단위)
      //   할증·할인이 붙은 일반실에서도 다시 계산한다: 60,800 = 43,400(43,100 + 0.6% 할증) × 1.4
      if (special) {
        const tbl = special !== true, sSeen = new Set(), putS = mk(tbl ? '특실' : '특실(×1.4 산식)', !tbl, sSeen), putF = mk('특실', true, sSeen);   // 운임표 특실은 s14 false, 산식은 true
        if (tbl) genStops(special).forEach(([v, dk, note]) => putS(v, dk, note));
        //  putF 는 putS 와 같은 seen 을 쓴다 — 운임표 특실과 금액이 같으면 기존처럼 운임표 쪽(s14 false)이 남고 산식 쪽은 건너뛴다(후보 집합 불변)
        plain.forEach(([v, dk, note]) => (tbl ? putF : putS)(r100(v * 1.4), dk + (tbl ? 1 : 0), note + (tbl && note ? ' (일반실 × 1.4)' : '')));
      }
    };
    (rows || []).forEach(([a, b, fare, sp]) => { have.add(tripPairKey(a, b) + '|' + fare); add(a, b, fare, 'KTX', sp || false, legacy ? 'nonstop' : 'stops'); });
    if (legacy) {
      REF.fares.filter(f => f.train === 'KTX' && !have.has(tripPairKey(f.a, f.b) + '|' + f.fare)).forEach(f => add(f.a, f.b, f.fare, 'KTX', true));
      // 옛 기준표의 SRT 표에 섞여 있는 서울·광명 착발 행은 통합 뒤 운임이라 통합 전 기간에는 쓰지 않음(SRT는 2026-08 까지 수서에서만 다님)
      REF.fares.filter(f => f.train !== 'KTX' && ![f.a, f.b].some(x => x === '서울' || x === '광명')).forEach(f => add(f.a, f.b, f.fare, f.train, false, 'stops'));
      // 판정기준표의 편도 운임은 '두 구간 합' 계산의 재료로도 씀 (예: 80,400 = 43,500 + 36,900)
      [36900, 37000, 37100, 37200, 37300].forEach(f => segs.push({ a: '동대구', b: '수서', fare: f, train: 'SRT', cls: '일반', km: 269.2, q: '추정', dk: 0, note: '', main: true, seat: '' }));
      add('동대구', '서울', 43300, 'KTX(오송 환승)', true, 'nonstop');   // 판정기준표의 오송 환승 운임 — 특실·할증도 같이 만든다
    }
    const one = new Map(), two = new Map(), byCity = new Map(), push = (m, k, v) => { const l = m.get(k); l ? l.push(v) : m.set(k, [v]); };
    segs.forEach(s => {
      if (!s.km) return;
      push(one, s.fare, s);
      push(byCity, tripPairKey(tripCity(s.a), tripCity(s.b)), s);
      s.c1 = tripCity(s.a); s.c2 = tripCity(s.b);
    });
    // 두 구간 합: 같은 도시쌍·같은 좌석끼리. 정차역 변형 때문에 조합이 많아지므로 [합계·거리·좌석]이 같은 것은 가장 단순한 조합(변형이 적고 KTX인 것) 하나만 둠
    byCity.forEach(L0 => {
      if (L0[0].c1 === L0[0].c2) return;
      const L = [...L0].sort((x, y) => x.dk - y.dk || (x.train !== 'KTX') - (y.train !== 'KTX')), seen = new Set();
      for (let i = 0; i < L.length; i++) for (let j = i; j < L.length; j++) {
        if (L[i].cls !== L[j].cls) continue;
        const sum = L[i].fare + L[j].fare, sig = sum + '|' + tripR1(L[i].km + L[j].km) + '|' + L[i].cls + '|' + (L[i].q === '공식' && L[j].q === '공식');
        if (!seen.has(sig)) { seen.add(sig); push(two, sum, [L[i], L[j]]); }
      }
    });
    const J = new Map(legacy ? REF.judgment.map(j => [j.fare, j]) : []);
    return { one, two, byCity, J, pairs: new Map(), factors: REF.factors, version: REF.version, gang: FARE ? FARE.gangneung : null };
    };
    const ref = build(FARE ? FARE.periods[0].rows : null, true);
    if (FARE) { ref.post = build(FARE.periods[1].rows, false); ref.cutover = FARE.cutover; ref.version = `${REF.version} · 운임표 ${FARE.version}`; ref.post.version = ref.version; }
    return ref;
  }
  // 그 출장에 적용할 기준표 — 출장시작일이 운임 개편일(2026-09-01) 이후면 새 운임표
  const tripRefFor = (ref, row) => ref.post && row && row.date && String(row.date) >= ref.cutover ? ref.post : ref;
  //  row : { origin, via, dest, fare, days }  →  { grade, gradeLabel, legs, km, factor, kg, basis, check? }
  //  왕복 횟수: 대개 1회. 교통비가 왕복 운임(등급 A·B·C)의 정확히 n배(2~5)면 n회 후보 — 출장 일수가 n일 이상일 때만 n회로 산정하고,
  //  일수가 모자라거나 일수를 모르면 일수만큼(모르면 1회)만 산정하고 check 로 표시해 사람이 확인
  function classifyRail(row, ref, placeMap) {
    const period = tripRefFor(ref, row) === ref ? '전' : '후';   // 운임 개편(2026-09-01) 전·후
    ref = tripRefFor(ref, row);
    const f = Math.round(Number(row.fare) || 0);
    if (f <= 0) return { grade: '제외', gradeLabel: '제외(교통비 0원)', legs: 0, km: 0, factor: 0, kg: 0, basis: '교통비 0원 — 미이동' };
    const O = tripCities(row.origin, placeMap), D = [...new Set([...tripCities(row.dest, placeMap), ...tripCities(row.via, placeMap)])];
    const gang = O.includes('강릉선') || D.includes('강릉선'), factor = gang ? ref.factors.gangneung : ref.factors.rail;
    //  x14: 특실 금액이 '일반실 × 1.4' 산식에서 나왔는가 — 후보에서만 올라온다(작업 5 의 aLabel 이 !c.x14 로 쓴다)
    const out = (grade, gradeLabel, legs, km, basis, x14 = false) => ({ grade, gradeLabel, legs, km, factor, kg: Math.round(km * factor * 1000) / 1000, basis, x14 });
    //  사용자가 확인한 설명(라벨) — [도시 모음(방향 무관) | 교통비 | 운임 개편 전/후]로 찾아 그대로 쓴다. 장소명은 들어 있지 않다(@trip-labels 블록)
    const labs = typeof window !== 'undefined' && window.TRIP_LABELS;
    if (labs) {
      const cities = [...new Set([...O, ...D])].sort(), lk = `${cities.join('|')}|${f}`;   // 방향 무관(2026-11-20)
      //  도시가 둘 이상인 라벨은 출발·목적 도시가 겹치지 않을 때만 — 서울→(경유 대구)→서울 같은 왕복 모양 행이 편도 라벨로 접혀
      //  거리가 2배 틀린 A 가 되는 것을 막는다(2026-11-21). 도시 하나짜리 라벨(서울→서울 선이동)에는 겹침 요건이 없다
      const apart = cities.length < 2 || !O.some(x => D.includes(x));
      const hit = apart && labs.items.find(l => l.key === lk && (!l.period || l.period === period));
      if (hit) return { ...out('A', 'A 업무상 확정(사용자 확인)', hit.legs, hit.km, hit.basis), label: hit.id };
    }
    if (gang) {
      // 타는 역·내리는 역을 추정: 강릉선 쪽은 장소 글자의 역(여럿이면 가장 먼 역 · 글자에 없으면 강릉), 반대쪽은 그 도시에서 서울까지 간 뒤 강릉선으로 갈아탐
      // 계수는 구간별로: 서울까지는 기본 계수, 서울–강릉선 역만 강릉선 계수
      const stn = t => (String(t ?? '').match(/강릉|진부|평창|둔내|횡성/g) || []);
      const gs = [...new Set([row.origin, row.dest, row.via].flatMap(stn))].sort((a, b) => TRIP_GANG_KM[b] - TRIP_GANG_KM[a]);
      const far = gs[0] || '강릉', others = [...new Set([...O, ...D])].filter(c => c !== '강릉선');
      const feed = others.filter(c => c !== '서울').flatMap(c => (ref.byCity.get(tripPairKey(c, '서울')) || []).filter(s => s.cls === '일반' && s.train === 'KTX'))
        .sort((x, y) => y.km - x.km || y.fare - x.fare)[0];
      const within = !others.length && O.includes('강릉선') && D.includes('강릉선') && gs.length >= 2;
      if (!feed && !others.includes('서울') && !within)   // 반대쪽이 어딘지 모름 → 운임으로 거리 역산
        return out('D', 'D 추정', f < 40000 ? 1 : 2, tripR1(Math.min(f / TRIP_RATE, TRIP_KM_CAP)), `강릉선(${far}): 반대쪽 장소를 몰라 운임÷km당 운임`);
      const kmG = within ? tripR1(TRIP_GANG_KM[far] - TRIP_GANG_KM[gs[gs.length - 1]]) : TRIP_GANG_KM[far];
      // 강릉선 역 운임: 운임표(서울–역, 일반실)가 있으면 그 값, 없으면 서울–강릉 운임을 거리에 비례
      const gFare = within || !ref.gang ? TRIP_GANG_FARE * kmG / TRIP_GANG_KM.강릉 : ref.gang[far];
      if (!within && ref.gang && gs.length) {   // 교통비가 [서울까지 운임 + 강릉선 역 운임]의 편도·왕복과 정확히 같으면 운임표+구간 일치(B)
        const F = feed ? (ref.byCity.get(tripPairKey(feed.c1, feed.c2)) || []).filter(s => s.cls === '일반' && s.train === 'KTX') : [null];
        const mk = (ss) => { const k1 = ss.reduce((t, s) => t + (s ? s.km : 0), 0), k2 = kmG * ss.length, kg = Math.round((k1 * ref.factors.rail + k2 * ref.factors.gangneung) * 1000) / 1000, km = tripR1(k1 + k2);
          return { grade: 'B', gradeLabel: 'B 운임표+구간 일치', legs: ss.length, km, factor: Math.round(kg / km * 10000) / 10000, kg,
            basis: `강릉선 ${ss.length === 2 ? '왕복' : '편도'}: ` + (ss[0] ? `${ss[0].a}-${ss[0].b} ${ss[0].km}km(계수 ${ref.factors.rail}) + ` : '') + `서울-${far} ${kmG}km(계수 ${ref.factors.gangneung}) · 운임 ${ss.map(s => ((s ? s.fare : 0) + gFare).toLocaleString('ko-KR')).join(' + ')}` }; };
        for (const s1 of F) if ((s1 ? s1.fare : 0) + gFare === f) return mk([s1]);
        for (const s1 of F) for (const s2 of F) if ((s1 ? s1.fare : 0) + (s2 ? s2.fare : 0) + 2 * gFare === f) return mk([s1, s2]);
      }
      const one = (feed ? feed.fare : 0) + gFare, legs = f < 1.5 * one ? 1 : 2;
      const k1 = feed ? feed.km * legs : 0, k2 = kmG * legs, km = tripR1(k1 + k2), kg = Math.round((k1 * ref.factors.rail + k2 * ref.factors.gangneung) * 1000) / 1000;
      const way = legs === 2 ? '왕복' : '편도', a = within ? gs[gs.length - 1] : '서울';
      return { grade: 'D', gradeLabel: 'D 추정', legs, km, factor: km ? Math.round(kg / km * 10000) / 10000 : factor, kg,
        basis: `강릉선 ${way}: ` + (feed ? `${feed.a}-${feed.b} ${feed.km}km(계수 ${ref.factors.rail}) + ` : '') + `${a}-${far} ${kmG}km(계수 ${ref.factors.gangneung})` };
    }
    // 판정기준표에 '왕복 운임 × 2'로 올라 있는 금액(174,000 = 87,000 × 2)은 여기서 확정하지 않고 아래 왕복 횟수 판정으로 보냄
    const doubled = g => { const a = ref.J.get(g), b = ref.J.get(g / 2); return !!(a && b && /↔/.test(b.label) && a.km === b.km && a.train === b.train); };
    const base = f => {
    const j = doubled(f) ? null : ref.J.get(f);
    //  기관 판정기준표는 더 이상 여기서 A 로 확정하지 않는다 (2026-11-20 사용자 결정 — 새 A 는 구간·횟수를 직접 검증한 행만).
    //   금액이 기준표에 있다는 사실만으로는 그 행의 장소가 그 구간이라는 근거가 없어서다. 대신 등급만 B 로 내리고
    //   거리는 기준표의 legs·km 을 그대로 쓴다(설계서 §11.2-ㄱ) — 기준표 거리는 운임 역산보다 강한 근거이고,
    //   버리면 이 유형 전체(45.1%)의 거리가 움직여 총 배출량이 조용히 바뀐다. 아래 후보 경로를 먼저 돌린 뒤에 쓴다.
    const jOut = () => out('B', 'B 기관 판정기준(장소 미확인)' + (j.kmQ === '공식' ? '' : '(거리 추정)'), j.legs, j.km, `${j.train} ${j.label}`);
    const score = (c1, c2) => (O.includes(c1) && D.includes(c2)) || (O.includes(c2) && D.includes(c1)) ? 2 : [c1, c2].some(c => O.includes(c) || D.includes(c)) ? 1 : 0;
    const cands = [];
    (ref.one.get(f) || []).forEach(s => cands.push({ sc: score(s.c1, s.c2), legs: 1, km: s.km, q: s.q, train: s.train, cls: s.cls, dk: s.dk, main: s.main, c1: s.c1, c2: s.c2, seats: [s.seat].filter(Boolean), x14: !!s.s14, basis: `${s.train} ${s.a}→${s.b} 편도 ${s.cls}${s.note}` }));
    (ref.two.get(f) || []).forEach(([s1, s2]) => cands.push({
      sc: score(s1.c1, s1.c2), legs: 2, km: tripR1(s1.km + s2.km), q: s1.q === '공식' && s2.q === '공식' ? '공식' : '추정', train: s1.train, cls: s1.cls,
      same: s1.a === s2.a && s1.b === s2.b, main: s1.main && s2.main, dk: s1.dk + s2.dk, c1: s1.c1, c2: s1.c2, seats: [s1.seat, s2.seat].filter(Boolean), x14: !!(s1.s14 || s2.s14), basis: (s1 === s2 ? `${s1.train} ${s1.a}↔${s1.b} 왕복 ${s1.cls}${s1.note}` : s1.a === s2.a && s1.b === s2.b && s1.train === s2.train
        ? `${s1.train} ${s1.a}↔${s1.b} 왕복 ${s1.cls} (${s1.fare.toLocaleString('ko-KR')}${s1.note} + ${s2.fare.toLocaleString('ko-KR')}${s2.note})`
        : `${s1.train} ${s1.a}-${s1.b}${s1.note} + ${s2.train} ${s2.a}-${s2.b}${s2.note} 왕복 ${s1.cls}`)
    }));
    const od = [];
    O.forEach(co => D.forEach(cd => { if (co !== cd) od.push(...(ref.byCity.get(tripPairKey(co, cd)) || [])); }));
    //  가는 편·오는 편이 모두 입석·자유석인 왕복은 후보로 만들지 않는다 (2026-11-20 사용자 확인: 그런 출장은 실제로 없다 — 11-17 의 '전부 입석도 있음' 은 철회).
    //  한쪽만 할인 좌석인 왕복(입석+일반실)은 그대로 둔다. 남겨 두면 멀쩡한 금액이 '설명이 여러 개'라 내려간다 (60,900 이 특실 편도 286.7km 가 아닌 입석 두 편 왕복 546.8km 로 잡혔음)
    const okAll = cands.filter(c => c.dk <= TRIP_DK_MAX && !(c.legs === 2 && c.seats.length === 2));
    //  후보가 여럿이면 가정 개수가 적은 설명부터 (f7aaad4 의 원칙 복구, 2026-11-20 — 사용자가 세 차례 확정: 60,900 은 특실 편도다).
    //  '특실은 왠만하면 없다'를 특실 후보를 뒤로 미루는 분기로 구현했더니 특실 편도(좌석 가정 1개)가 입석 두 편 왕복(2개)에 졌다.
    //  특실이 드물다는 사실은 2순위 선호로만 쓴다 — 아래 best 정렬: 파생 단계 dk(가정 수) → 일반실 > 입석·자유석 > 특실 → 대표역·공식거리 → KTX
    const okc = okAll;
    if (okc.length) {
      const top = Math.max(...okc.map(c => c.sc));
      //  운임표 금액에 가까운 설명(파생 단계 dk 가 작은 것)을 먼저 — 그래야 '특실 정차역 할인 편도'가 '입석 왕복'보다 앞선다
      //  같은 도시로 적힌 행은 본원(대구)과의 구간을 먼저 본다 — 전날 올라가서 '서울 → 서울'로 적는 관행
      const oneCity = O.length === 1 && D.length === 1 && O[0] === D[0];
      const home = x => (oneCity && (x.c1 === TRIP_HOME || x.c2 === TRIP_HOME) ? 0 : 1);
      const best = okc.filter(c => c.sc === top).sort((x, y) => home(x) - home(y) || (!x.main) - (!y.main) || x.dk - y.dk || (x.cls !== '일반') - (y.cls !== '일반') || (x.q !== '공식') - (y.q !== '공식') || (x.train !== 'KTX') - (y.train !== 'KTX'));
      // 같은 금액을 설명하는 가장 단순한 방법부터: 운임표 금액 그대로(dk 0) → 편도 한 장 → 같은 구간 왕복 → 서로 다른 두 구간 왕복
      //  (예: 서울→서울 41,300 은 '광명-동대구 편도'와 '광명-대전 + 대전-수서 왕복' 둘 다 맞지만 편도로 본다)
      const tier = x => (x.legs === 1 ? 0 : x.same ? 1 : 2);
      const h0 = Math.min(...best.map(home)), hb = best.filter(c => home(c) === h0);
      const m0 = hb.some(c => c.main), mm = hb.filter(c => !!c.main === m0);   // 대표역 후보가 있으면 그것만 본다
      const dk0 = Math.min(...mm.map(c => c.dk)), lo = mm.filter(c => c.dk === dk0);
      const t0 = Math.min(...lo.map(tier)), exact = lo.filter(c => tier(c) === t0);
      const kms = exact.map(c => c.km), spread = (Math.max(...kms) - Math.min(...kms)) / Math.max(...kms), c = exact[0];
      const tag = (c.cls !== '일반' ? '(특실 가정)' : '') + (c.seats.length ? '(좌석 종류 가정)' : '') + (c.q === '공식' ? '' : '(거리 추정)');
      //  A 업무상 확정 — "출발지·목적지·교통운임을 대조했을 때 그 구간의 철도를 이용한 게 99.9% 이상 확실한 것"
      //   (2026-11-20 사용자 결정). 99.9% 는 확률로 검증할 수 없으므로 "가정을 하나도 하지 않았다"는 구조 조건으로 번역했다.
      //   배출량 = 거리 × 계수 · 거리 = 구간거리 × 횟수 이고 계수에는 좌석 구분이 없다(설계서 §2.1). 그래서
      //   좌석 종류(입석·자유석·운임표 특실) · 무정차 할증 0.6% · 정차역 할인 0.2%/역은 거리를 바꾸지 않아 A 탈락 사유가 아니다.
      //   거리를 바꾸는 위험은 둘뿐이다 — 구간 오판(①)과 횟수 오판(③). 네 조건을 모두 만족해야 A 다:
      //   ① 구간: 출발·목적 둘 다 도시가 확정되고(장소 사전 confidence high 또는 키워드 규칙) 그 구간과 일치 — 선이동(서울→서울) 예외는 없앴다(가정이므로)
      //   ② 금액: 그 구간의 운임 계열로 설명된다 — 할증·정차역 할인·입석·자유석·운임표 특실 모두 허용하고,
      //      일반실 × 1.4 산식으로 만든 특실 금액(x14)만 배제한다. 그 산식은 코레일 특실 운임표와 대조되지 않은 가정이다(설계서 §11.2-ㄴ)
      //   ③ 횟수: 편도냐 왕복 1회냐가 하나로 정해진다 — 같은 순위의 후보(mm) 전체가 횟수가 같고 거리가 2% 안에서 같다.
      //      왕복 1회(편도 운임 × 2)는 산술이라 가정으로 보지 않고, 왕복 n회(n ≥ 2)는 가정으로 본다(아래 왕복 횟수 판정에서 B 로 내린다)
      //   ④ 거리: 공식 거리표에 있는 구간이다 — 추정 거리(수서·서대구·강릉선)는 탈락
      let seenKey = '';
      const aLabel = (() => {
        if (!(O.length && D.length && top === 2)) return '';          // ① 구간
        if (c.x14) return '';                                          // ② 금액 — 0원 '제외' 행은 x14 키가 없으므로 참거짓으로 본다
        const same = mm.every(x => x.legs === c.legs && Math.abs(x.km - c.km) <= TRIP_A_KM_TOL * Math.max(x.km, c.km));
        if (!same) return '';                                          // ③ 횟수
        if (c.q !== '공식') return '';                                  // ④ 거리
        //  seenKey 는 등급에 쓰지 않는다 — 생성 도구(tools/build_trip_seen.py)가 파생 금액의 반복 횟수를 세어 라벨 우선순위를 매기는 열쇠다(설계서 §10)
        const der = !c.seats.length && c.dk > 0;
        if (der) seenKey = tripPairKey(c.c1, c.c2) + '|' + period + '|' + f;
        const why = c.seats.length ? '좌석 종류' : c.cls !== '일반' ? '운임표 특실' : der ? '운임표 · 할증/정차역' : '운임표';
        return 'A 업무상 확정(' + why + ')' + (c.q === '공식' ? '' : '(거리 추정)');   // ④ 때문에 '(거리 추정)' 은 서지 않지만 접미사 규칙은 남긴다
      })();
      const keep = r => { if (seenKey) r.seenKey = seenKey; r.pair = tripPairKey(c.c1, c.c2); return r; };   // seenKey: 생성 도구(tools/build_trip_seen.py)가 반복 횟수를 세는 열쇠
      if (aLabel) return keep(out('A', aLabel, c.legs, c.km, c.basis, c.x14));
      if (j) return jOut();   // A 가 아니면 기준표 거리가 운임 역산보다 강한 근거다
      if (top === 2) return keep(out('B', 'B 운임표+구간 일치' + tag, c.legs, c.km, c.basis, c.x14));
      if (!od.length && spread <= 0.05) return out('C', 'C 운임표만 일치' + tag, c.legs, c.km, c.basis, c.x14);
    }
    if (j) return jOut();   // 후보가 아예 없을 때도 기준표 거리를 쓴다
    // 운임 불일치 — 출발·목적 도시의 구간 거리를 쓰고, 기준 편도 운임의 1.5배 미만이면 편도
    const plain = od.filter(s => s.cls === '일반'), ktx = plain.filter(s => s.train === 'KTX'), L = ktx.length ? ktx : plain;
    if (L.length) {
      const s = [...L].sort((x, y) => y.km - x.km || y.fare - x.fare)[0], legs = f < 1.5 * s.fare ? 1 : 2;
      return out('D', 'D 추정', legs, tripR1(s.km * legs), `구간 ${s.a}-${s.b} 거리 적용(운임 불일치, 기준 편도 ${s.fare.toLocaleString('ko-KR')})`);
    }
    return out('D', 'D 추정', f < 65000 ? 1 : 2, tripR1(Math.min(f / TRIP_RATE, TRIP_KM_CAP)), '운임÷km당 운임(151.7원/km)');
    };
    const r0 = base(f);
    if (r0.grade !== 'D') return r0;
    for (let k = 2; k <= 5; k++) {
      if (f % k) continue;
      const rb = base(f / k);
      if (rb.grade === 'D' || rb.legs !== 2 || !/↔|왕복/.test(rb.basis)) continue;
      const days = Number(row.days) >= 1 ? Math.floor(Number(row.days)) : null, n = Math.min(k, days || 1), check = n < k;
      //  왕복 n회(n ≥ 2)는 교통비 배수와 출장 일수로 추론한 것이라 가정이다 — 새 A 정의에서는 A 가 될 수 없다(설계서 §4, 2026-11-20 사용자 결정).
      //   그래서 한 번 왕복이 A 로 서 있어도 등급만 B 로 내린다. 거리(2 × n 회분)는 종전 그대로 두고 승격 경로는 사용자 라벨뿐이다.
      const nKey = rb.pair ? `${rb.pair}|${period}|${f}|×${k}` : '';   // 생성 도구가 '왕복 n회' 조합의 반복 횟수를 세는 열쇠
      const demote = rb.grade === 'A';
      const g = demote ? 'B' : rb.grade, gl = demote ? 'B 운임표+구간 일치' : rb.gradeLabel;
      const r = out(g, gl + (n > 1 ? ` · 왕복 ${n}회` : '') + (check ? ' · 횟수 확인 필요' : ''), 2 * n, tripR1(rb.km * n),
        `${rb.basis} × ${n}회 (교통비 = 왕복 운임 × ${k} · 출장 ${days ? days + '일' : '일수 모름'})`, rb.x14);
      if (check) r.check = true;
      if (demote && !check) r.seenKey = nKey;
      return r;
    }
    return r0;
  }
  /* 운임 대조 — 분류(사람·AI·규칙)가 맞는지 교통비로 검산. 장소를 정하는 데는 쓰지 않음(등급 B가 자기 자신을 확인하게 되므로) */
  // 그 금액이 가리키는 도시쌍 — 판정기준표에 있으면 그 구간 하나, 없으면 운임표 금액 그대로인 편도 → 그대로인 같은 구간 왕복 → 정차역 변형 편도 → 변형 왕복 → 두 구간 합 순으로 처음 나오는 것
  function tripFarePairs(fare, ref) {
    const f = Math.round(Number(fare) || 0);
    let p = ref.pairs.get(f);
    if (!p) {
      const keys = new Set(), j = ref.J.get(f);
      if (j?.cities) keys.add(tripPairKey(j.cities[0], j.cities[1]));   // 판정기준표에 있는 금액은 그 구간으로 확정(등급 A) — 다른 후보를 보지 않음
      else {
        // 운임표가 커지면 우연히 같은 금액이 늘어남 → 가장 단순한 설명부터: 편도 운임 하나 → 같은 구간 왕복 → 서로 다른 두 운임의 합
        const two = ref.two.get(f) || [];
        const one = ref.one.get(f) || [], same = two.filter(([x, y]) => x.a === y.a && x.b === y.b), plain = ([x, y]) => !x.dk && !(y || x).dk;
        for (const tier of [one.filter(x => !x.dk), same.filter(plain).map(([x]) => x), one, same.map(([x]) => x), two.map(([x]) => x)]) {
          tier.forEach(s => keys.add(tripPairKey(s.c1, s.c2)));
          if (keys.size) break;
        }
      }
      ref.pairs.set(f, p = [...keys].map(k => k.split('|')));
    }
    return p;
  }
  //  rows : [{ origin, dest, fare }]  →  Map<장소, { hit, votes: { 도시: 건수 } }>
  //  한 행은 양쪽 장소 각각의 증거가 됨: 반대편 도시를 알 때, 그 도시에서 이 운임으로 닿는 곳이 한 군데면 그곳에 한 표
  //  세지 않는 경우 — 반대편을 모름 · 두 장소가 같은 도시(선이동 관행) · 분류된 도시까지의 운임표가 없음 · 경유지
  function tripPlaceEvidence(rows, ref, placeMap) {
    const memo = new Map(), cities = t => { let c = memo.get(t); if (!c) memo.set(t, c = tripCities(t, placeMap)); return c; };
    const ev = new Map();
    const all = ref;
    rows.forEach(r => {
      if (!(Number(r.fare) > 0)) return;
      const ref = tripRefFor(all, r);
      let pairs = null;
      [[r.dest, r.origin], [r.origin, r.dest]].forEach(([u, o]) => {
        if (!u || !o) return;
        const mine = cities(u), other = cities(o);
        if (!other.length || mine.some(c => other.includes(c))) return;
        if (mine.length && !mine.some(c => other.some(k => ref.byCity.has(tripPairKey(c, k))))) return;
        const hits = new Set();
        (pairs ||= tripFarePairs(r.fare, ref)).forEach(([a, b]) => {
          if (other.includes(a) && !other.includes(b)) hits.add(b);
          else if (other.includes(b) && !other.includes(a)) hits.add(a);
        });
        if (hits.size !== 1) return;                    // 운임표에 없거나 후보가 여러 곳이면 증거로 안 씀
        let e = ev.get(u); if (!e) ev.set(u, e = { hit: 0, votes: {} });
        const c = [...hits][0]; e.votes[c] = (e.votes[c] || 0) + 1; e.hit++;
      });
    });
    return ev;
  }
  // 분류(points)와 운임 증거의 대조 — '다름'은 틀렸다는 뜻이 아니라 먼저 볼 곳 (운임표에 없는 구간·다른 곳에서 탄 경우에도 나옴)
  function tripEvidenceMark(points, e) {
    if (!e || !e.hit) return '대조 불가';
    if (!points || !points.length) return '참고';
    const agree = points.reduce((s, c) => s + (e.votes[c] || 0), 0);
    return agree * 2 >= e.hit ? '일치' : e.hit >= 3 ? '다름' : '다름(건수 적음)';
  }
  // 엑셀 한 시트(2차원 배열) → 출장 행 · 양식: 머리글에 출발지·목적지·교통편·교통비, 그 아래 번호가 숫자인 행
  function tripParseSheet(name, grid) {
    const norm = v => String(v ?? '').replace(/\s/g, '');
    const hi = grid.slice(0, 6).findIndex(r => { const h = (r || []).map(norm); return h.includes('출발지') && h.includes('목적지') && h.includes('교통편') && h.includes('교통비'); });
    if (hi < 0) return { rows: [], error: `'${name}' 시트는 출장 양식이 아니에요 (머리글에 출발지·목적지·교통편·교통비가 있어야 해요)` };
    const h = grid[hi].map(norm), col = k => h.indexOf(k);
    // 출장 일수: '일' 칸(머리글이 두 줄이면 아랫줄에 있음) → 없으면 시작일·종료일로 계산 → 그래도 없으면 null(왕복 1회로 봄)
    const h2 = (grid[hi + 1] || []).map(norm), iDay = h.indexOf('일') >= 0 ? h.indexOf('일') : h2.indexOf('일');
    // 출장시작일도 머리글 아랫줄에 있을 수 있다 (2026-11-23 양식: 윗줄 '출장시간' · 아랫줄 '출장시작일')
    const iS = [h, h2].map(x => x.findIndex(v => /시작일/.test(v))).find(i => i >= 0) ?? -1;
    const iEnd = [h, h2].map(x => x.findIndex(v => /종료일/.test(v))).find(i => i >= 0) ?? -1;
    const c = { o: col('출발지'), v: col('경유지'), d: col('목적지'), m: col('교통편'), f: col('교통비'), s: iS >= 0 ? iS : 1 };
    const toDate = v => {
      if (v instanceof Date) return isNaN(v) ? '' : new Date(v.getTime() - v.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
      if (typeof v === 'number' && v > 20000 && v < 80000) return new Date(Math.round((v - 25569) * 86400000)).toISOString().slice(0, 10);   // 엑셀 날짜 일련번호
      const m = /(\d{4})\s*[-./년]\s*(\d{1,2})\s*[-./월]\s*(\d{1,2})/.exec(String(v ?? ''));   // 2025-01-02 · 2025.1.2 · 2025년 1월 2일
      return m ? `${m[1]}-${m[2].padStart(2, '0')}-${m[3].padStart(2, '0')}` : '';
    };
    const sheetYear = /^\d{4}$/.test(String(name).trim()) ? String(name).trim() : '';
    const rows = [];
    grid.slice(hi + 1).forEach(r => {
      if (!r || norm(r[c.m]) === '교통편' || !norm(r[c.m])) return;   // 머리글 아랫줄·빈 줄·합계 줄
      const date = toDate(r[c.s]), fare = Number(String(r[c.f] ?? '').replace(/,/g, ''));
      // 자료 행인지: 번호가 숫자이거나(첫 양식) 날짜가 읽히면(번호 칸이 없는 양식, 2026-11-23) 자료 행으로 본다
      const seq = Number(String(r[0] ?? '').replace(/,/g, ''));
      if (!(seq > 0) && !date) return;
      const end = iEnd >= 0 ? toDate(r[iEnd]) : '', dn = iDay >= 0 ? Number(String(r[iDay] ?? '').trim() || NaN) : NaN;
      const span = date && end ? Math.round((Date.parse(end) - Date.parse(date)) / 86400000) + 1 : NaN;
      const days = dn >= 1 ? Math.floor(dn) : span >= 1 ? span : null;
      rows.push({ year: sheetYear || date.slice(0, 4), seq: seq > 0 ? seq : null, date, origin: String(r[c.o] ?? '').trim(), via: c.v >= 0 ? String(r[c.v] ?? '').trim() : '',
        dest: String(r[c.d] ?? '').trim(), mode: norm(r[c.m]), fare: Number.isFinite(fare) ? fare : 0, days });
    });
    return { rows, error: rows.length ? '' : `'${name}' 시트에 출장 행이 없어요` };
  }
  //  results : [{ row, res }] (철도 행만)  →  연도별·월별 합계
  function tripSummarize(results) {
    const byYear = {}, byMonth = {};
    results.forEach(({ row, res }) => {
      const y = byYear[row.year] ||= { n: 0, excluded: 0, A: 0, B: 0, C: 0, D: 0, km: 0, kg: 0, kgD: 0 };
      if (res.grade === '제외') { y.excluded++; return; }
      y.n++; y[res.grade]++; y.km += res.km; y.kg += res.kg; if (res.grade === 'D') y.kgD += res.kg;
      const mk = row.date ? row.date.slice(0, 7) : `${row.year}-00`, m = byMonth[mk] ||= { n: 0, km: 0, kg: 0 };
      m.n++; m.km += res.km; m.kg += res.kg;
    });
    return { byYear, byMonth };
  }
  /* @trip-end */
