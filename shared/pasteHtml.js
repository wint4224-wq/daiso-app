/**
 * 구조 블록 → 네이버 스마트에디터에 붙여넣을 HTML / 서식 없는 글 / "에디터에서 직접 적용할 항목".
 *
 * 붙여넣기로 무엇이 살아남는지는 이전 프로젝트 `20260826 블로그 서식 복제기` 에서 실측했다 (2026-08-27):
 *   인라인 font-size · font-family · <b> · background-color   → 유지
 *   (2026-09-30 이 프로젝트 실측 추가: text-align:center · <i> · <em> · font-style · <u> · 글자색 → 유지)
 *   <hr> → 구분선 컴포넌트(기본 모양),  <blockquote> → 인용구 컴포넌트(기본 따옴표형),  <table> → 표
 *   <h3>/<h4> → 본문 크기로 눌림  → 그래서 소제목도 인라인 크기 + 굵게로 넣는다
 * 붙여넣기로 옮길 수 없는 것(인용구·구분선 종류, 사진 배치, 스티커·지도…)은 checklist 로 따로 알려준다.
 *
 * 클립보드로는 로컬 사진이 넘어가지 않으므로 사진 자리에는 [사진N] 표시만 남긴다.
 * [AI경험] 표시는 복사본에서 모두 뺀다.
 */
import { DEFAULT_SIZE, runsText } from './structmd.js';

const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
const ALIGN = { 왼쪽: 'left', 가운데: 'center', 오른쪽: 'right', 양쪽: 'justify' };

/** 에디터 인용구 메뉴의 이름 (체크리스트 안내용) */
export const EDITOR_QUOTE_NAME = {
  따옴표형: '따옴표',
  버티컬라인형: '버티컬 라인',
  말풍선형: '말풍선',
  라인따옴표형: '라인&따옴표',
  포스트잇형: '포스트잇',
  프레임형: '프레임',
};

function runsToHtml(runs) {
  return (runs || [])
    .map((r) => {
      let s = esc(r.text).replace(/\n/g, '<br>');
      if (r.b) s = `<b>${s}</b>`;
      if (r.i) s = `<i>${s}</i>`;
      if (r.u) s = `<u>${s}</u>`;
      if (r.s) s = `<s>${s}</s>`;
      const st = [];
      if (r.color) st.push(`color:${r.color}`);
      if (r.bg) st.push(`background-color:${r.bg}`);
      if (r.size) st.push(`font-size:${r.size}px`);
      return st.length ? `<span style="${st.join(';')}">${s}</span>` : s;
    })
    .join('');
}

/** 사진 표시 글자: [사진3] / [사진2~4 연속] */
export function photoLabel(b) {
  const ps = b.photos?.length ? b.photos : null;
  if (!ps) return `[사진-${b.layout}${b.count > 1 ? `${b.count}장` : ''}]`;
  const contiguous = ps.every((n, k) => k === 0 || n === ps[k - 1] + 1);
  const range = ps.length === 1 ? `${ps[0]}` : contiguous ? `${ps[0]}~${ps[ps.length - 1]}` : ps.join(',');
  return ps.length === 1 && b.layout === '단독' ? `[사진${range}]` : `[사진${range} ${b.layout}]`;
}

/**
 * @param {{meta:object, blocks:object[]}} doc
 * @returns {string} 스마트에디터에 붙여넣을 HTML
 */
export function toPasteHtml(doc) {
  const meta = doc.meta || {};
  const baseAlign = ALIGN[meta['기본정렬']] || 'left';
  const baseSize = Number(meta['기본글자크기']) || DEFAULT_SIZE;
  // 소제목 크기: 인용구 제목과 [소제목] 에 쓴다. 인용구 안에서 따로 크기를 적은 글자는 그 크기가 이긴다 (안쪽 span)
  const headSize = Number(meta['소제목글자크기']) || 0;
  const para = (inner, { align = baseAlign, size = baseSize, b = false, color, bg, i, u, s } = {}) => {
    let x = inner;
    if (b) x = `<b>${x}</b>`;
    if (i) x = `<i>${x}</i>`;
    if (u) x = `<u>${x}</u>`;
    if (s) x = `<s>${x}</s>`;
    // 굵기·기울임을 항상 명시한다. 실측(2026-09-30): 커서가 기울임 문단에 있을 때 붙여넣으면
    // 서식을 적지 않은 글자가 기울임을 물려받았다. font-style:normal 을 적은 문단은 물려받지 않았다.
    const st = [`font-size:${size}px`, `font-weight:${b ? 'bold' : 'normal'}`, `font-style:${i ? 'italic' : 'normal'}`];
    if (color) st.push(`color:${color}`);
    if (bg) st.push(`background-color:${bg}`);
    return `<p style="text-align:${align}"><span style="${st.join(';')}">${x || '<br>'}</span></p>`;
  };
  const out = [];
  for (const b of doc.blocks || []) {
    switch (b.t) {
      case 'p':
        out.push(para(runsToHtml(b.runs), { align: b.align || baseAlign, size: b.size || baseSize, b: b.b, color: b.color, bg: b.bg, i: b.i, u: b.u, s: b.s }));
        break;
      case 'blank':
        for (let k = 0; k < b.n; k++) out.push(`<p style="text-align:${baseAlign}"><br></p>`);
        break;
      case 'heading':
        out.push(para(runsToHtml(b.runs), { align: b.align || baseAlign, size: b.size && b.size > baseSize ? b.size : headSize || 24, b: true, color: b.color }));
        break;
      case 'quote':
        out.push(`<blockquote><p>${headSize ? `<span style="font-size:${headSize}px">${runsToHtml(b.runs)}</span>` : runsToHtml(b.runs)}</p></blockquote>`);
        break;
      case 'hr':
        out.push('<hr>');
        break;
      case 'img':
        out.push(para(esc(photoLabel(b)), { align: 'center', b: true, color: '#03a94d' }));
        break;
      case 'table':
        out.push(`<table>${b.rows.map((r) => `<tr>${r.map((c) => `<td>${esc(c)}</td>`).join('')}</tr>`).join('')}</table>`);
        break;
      case 'link':
        out.push(para(b.url ? `<a href="${esc(b.url)}">${esc(b.url)}</a>` : esc(`[링크카드: ${b.title}]`)));
        break;
      case 'map':
        out.push(para(esc(`[지도: ${b.name}]`), { align: 'center', color: '#03a94d' }));
        break;
      case 'sticker':
        out.push(para(esc('[스티커]'), { align: 'center', color: '#03a94d' }));
        break;
      case 'video':
        out.push(para(esc('[동영상]'), { align: 'center', color: '#03a94d' }));
        break;
      case 'receipt':
        out.push(para(esc('[내돈내산 인증]'), { align: 'center', color: '#03a94d' }));
        break;
      default:
        break;
    }
  }
  return out.join('');
}

/** 서식 없는 본문 (사진 자리 표시는 남긴다) */
export function toPlainText(doc) {
  const out = [];
  for (const b of doc.blocks || []) {
    if (b.t === 'p' || b.t === 'heading' || b.t === 'quote') out.push(runsText(b.runs));
    else if (b.t === 'blank') for (let k = 0; k < b.n; k++) out.push('');
    else if (b.t === 'img') out.push(photoLabel(b));
    else if (b.t === 'hr') out.push('');
    else if (b.t === 'table') for (const r of b.rows) out.push(r.join(' | '));
    else if (b.t === 'link') out.push(b.url || b.title);
    else if (b.t === 'map') out.push(`[지도: ${b.name}]`);
  }
  return out.join('\n').replace(/\n{4,}/g, '\n\n\n').trim();
}

/**
 * 붙여넣은 뒤 에디터에서 직접 해야 하는 일.
 * @param {object} doc
 * @param {{photoFiles?: string[]}} opts photoFiles[n-1] = n번 사진 파일 이름
 * @returns {Array<{id:string, kind:string, text:string}>}
 */
export function editorChecklist(doc, { photoFiles = [] } = {}) {
  const items = [];
  const blocks = doc.blocks || [];
  const file = (n) => photoFiles[n - 1] || `${String(n).padStart(2, '0')}_…jpg`;

  // 인용구·구분선은 스타일별로 묶어서 한 항목으로 (같은 작업을 7번 따로 적으면 체크리스트가 너무 길어진다)
  const quoteByStyle = new Map();
  const hrByStyle = new Map();
  let qi = 0;
  let hi = 0;
  for (const b of blocks) {
    if (b.t === 'img' && b.photos?.length) {
      const files = b.photos.map(file).join(', ');
      const how = {
        단독: '',
        연속: ' — 여러 장을 한 번에 골라 올리고 "개별사진" 으로 넣기',
        나란히: ' — 올린 뒤 사진을 옆 사진 쪽으로 끌어서 나란히(한 줄) 배치',
        슬라이드: ' — 여러 장을 한 번에 골라 올리고 "슬라이드" 선택',
        콜라주: ' — 여러 장을 한 번에 골라 올리고 "콜라주" 선택',
      }[b.layout] || '';
      const caps = (b.captions || []).filter(Boolean);
      items.push({
        id: `img-${b.photos.join('-')}`,
        kind: '사진',
        text: `${photoLabel(b)} 자리에 ${files} 올리고 표시 줄 지우기${how}${caps.length ? ` · 캡션: ${caps.join(' / ')}` : ''}`,
      });
    }
    if (b.t === 'quote') {
      qi++;
      if (b.style && b.style !== '따옴표형') {
        if (!quoteByStyle.has(b.style)) quoteByStyle.set(b.style, []);
        quoteByStyle.get(b.style).push({ no: qi, head: runsText(b.runs).replace(/\n/g, ' ').slice(0, 16) });
      }
    }
    if (b.t === 'hr') {
      hi++;
      if (b.style && b.style !== '기본') {
        if (!hrByStyle.has(b.style)) hrByStyle.set(b.style, []);
        hrByStyle.get(b.style).push(hi);
      }
    }
    if (b.t === 'heading') items.push({ id: `heading-${runsText(b.runs).slice(0, 10)}`, kind: '소제목', text: `"${runsText(b.runs).slice(0, 20)}" 은 큰 굵은 글씨로 들어갑니다. 소제목 컴포넌트로 쓰려면 직접 바꾸기` });
    if (b.t === 'link') items.push({ id: `link-${b.url || b.title}`, kind: '링크', text: `링크카드 넣기: ${b.title || b.url}${b.url ? ` (${b.url})` : ''}` });
    if (b.t === 'map') items.push({ id: `map-${b.name}`, kind: '기타', text: `지도 넣기: ${b.name}` });
    if (b.t === 'sticker') items.push({ id: `sticker-${items.length}`, kind: '기타', text: '스티커 넣기 (표시된 자리)' });
    if (b.t === 'receipt') items.push({ id: 'receipt', kind: '기타', text: '내돈내산 인증(영수증) 넣기' });
  }
  for (const [style, list] of quoteByStyle) {
    const which = list.length === qi ? `인용구 ${list.length}개 모두` : `인용구 ${list.length}개 (${list.map((q) => `"${q.head}…"`).join(', ')})`;
    items.push({ id: `quote-${style}`, kind: '인용구', text: `${which}를 "${EDITOR_QUOTE_NAME[style] || style}" 스타일로 바꾸기 — 붙여넣으면 기본 따옴표 모양으로 들어감` });
  }
  for (const [style, list] of hrByStyle) {
    const which = list.length === hi ? `구분선 ${list.length}개 모두` : `${list.join(', ')}번째 구분선`;
    items.push({ id: `hr-${style}`, kind: '구분선', text: `${which}를 "${style}" 모양으로 바꾸기 — 붙여넣으면 기본 구분선으로 들어감` });
  }
  items.push({ id: 'align', kind: '확인', text: `정렬·글자 크기 확인 — 기본 ${doc.meta?.['기본정렬'] || '왼쪽'} 정렬 ${doc.meta?.['기본글자크기'] || DEFAULT_SIZE}px${doc.meta?.['소제목글자크기'] ? `, 소제목(인용구 제목) ${doc.meta['소제목글자크기']}px` : ''} 로 들어갔는지 (다르면 본문 전체 선택 후 지정)` });
  items.push({ id: 'tags', kind: '확인', text: '해시태그는 발행 창의 태그 칸에 넣기 (자동 임시저장은 프로그램이 넣습니다. 직접 붙여넣을 때는 "해시태그만 복사")' });
  return items;
}

/** [AI경험] 표시 빼기 (복사·최종본용) */
export function stripAiMarkers(md) {
  return String(md || '').replace(/(?<!\\)\[\/?AI경험\]/g, '');
}
