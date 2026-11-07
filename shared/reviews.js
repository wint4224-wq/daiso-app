/**
 * 다이소몰 리뷰 장단점 — 서버·노트북 화면·폰 앱이 같이 쓴다.
 * work.reviews = { [품번]: { state, pdNo, product, url, total, count, stats, summary, error, at } }
 *   state: running | done | notfound | blocked | error
 * 글 생성에는 쓰지 않는다 (남의 후기가 내 경험처럼 쓰이지 않게). 화면에서 보기만 한다.
 */

/** 품번 칸에서 5~9자리 숫자를 모두 꺼낸다: "10413371 (블랙) / 10413372 (그레이)" → 두 개 */
export function parseCodes(value) {
  return [...new Set(String(value || '').match(/(?<!\d)\d{5,9}(?!\d)/g) || [])];
}

/** 이 상품의 리뷰 결과 (품번 중 하나라도 결과가 있으면) */
export function reviewFor(work, product) {
  const all = work?.reviews || {};
  const codes = parseCodes(product?.code?.value);
  return codes.map((c) => all[c]).find(Boolean) || null;
}

const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);

function points(list) {
  return (list || []).length ? `<ol>${list.map((x) => `<li><b>${esc(x.point)}</b>${x.quote ? ` <q>${esc(x.quote)}</q>` : ''}</li>`).join('')}</ol>` : '<p class="rv-none">없음</p>';
}

/** 리뷰 카드. 결과가 없으면 빈 문자열 */
export function reviewCardHtml(entry, { open = false } = {}) {
  if (!entry) return '';
  const box = (body, summary = '다이소몰 리뷰') => `<details class="rv"${open ? ' open' : ''}><summary>${summary}</summary>${body}</details>`;
  if (entry.state === 'running') return '<div class="rv rv-wait">다이소몰 리뷰 읽는 중…</div>';
  if (entry.state === 'notfound') return `<div class="rv rv-wait">다이소몰에서 이 품번(${esc((entry.codes || [entry.pdNo]).join(', '))})을 찾지 못했어요.</div>`;
  if (entry.state !== 'done') return `<div class="rv rv-wait">리뷰를 가져오지 못했어요: ${esc(entry.error || entry.state)}</div>`;
  const st = entry.stats || {};
  const head = `다이소몰 리뷰 · ★${st.avg_rating ?? '-'} · ${entry.count}개 분석${entry.total ? ` (전체 ${Number(entry.total).toLocaleString('ko-KR')}개)` : ''}`;
  if (!entry.count) return `<div class="rv rv-wait">다이소몰에 아직 리뷰가 없어요.${entry.url ? ` <a href="${esc(entry.url)}" target="_blank" rel="noopener">상품 보기</a>` : ''}</div>`;
  const s = entry.summary || {};
  return box(
    `<p class="rv-name">${esc(entry.product || '')}</p>
    ${s.one_line ? `<p class="rv-one">${esc(s.one_line)}</p>` : ''}
    <h4>장점</h4>${points(s.pros)}
    <h4>단점</h4>${points(s.cons)}
    ${s.recommend ? `<p><b>추천</b> ${esc(s.recommend)}</p>` : ''}
    ${s.not_recommend ? `<p><b>비추천</b> ${esc(s.not_recommend)}</p>` : ''}
    ${s.tips?.length ? `<h4>구매 팁</h4><ul>${s.tips.map((t) => `<li>${esc(t)}</li>`).join('')}</ul>` : ''}
    ${s.keywords?.length ? `<p class="rv-kw">${s.keywords.map((k) => `#${esc(k)}`).join(' ')}</p>` : ''}
    <p class="rv-meta">재구매 ${st.reorder_rate ?? 0}% · ${esc(entry.at || '')} 기준${entry.url ? ` · <a href="${esc(entry.url)}" target="_blank" rel="noopener">다이소몰에서 보기</a>` : ''}</p>`,
    esc(head),
  );
}
