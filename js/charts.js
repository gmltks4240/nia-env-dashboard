/* js/charts.js (3/9) — 차트 — Chart.js 설정 · 막대 값 레이블 등 플러그인 · 차트·카드 헬퍼
   한 덩어리였던 js/app.js 를 순서 그대로 나눈 것. 파일들은 index.html 에 적힌 순서(core → … → main)로 불러오고,
   최상위 const·let·function 은 모든 파일이 함께 쓴다. 새 파일을 만들면 index.html 에도 넣을 것. */
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

