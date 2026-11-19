/* js/ui.js (2/9) — 공통 부품 — 토스트 · 로딩 단추 · 인라인 오류 · 지우기/되돌리기 · 확인 창 · 연도 셀렉터
   한 덩어리였던 js/app.js 를 순서 그대로 나눈 것. 파일들은 index.html 에 적힌 순서(core → … → main)로 불러오고,
   최상위 const·let·function 은 모든 파일이 함께 쓴다. 새 파일을 만들면 index.html 에도 넣을 것. */
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

