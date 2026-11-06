/**
 * 구조 블록 → 네이버 블로그 모바일 화면 비슷한 미리보기 HTML.
 *
 * 스타일은 public/preview.css 의 .nb-* 클래스. 서버(최종 HTML 저장)와 화면이 같이 쓴다.
 * 사진은 photos 옵션(번호 → 이미지 주소)이 있으면 실제 사진을, 없으면 자리 상자를 그린다.
 */
import { DEFAULT_SIZE, runsText } from './structmd.js';

const esc = (s) =>
  String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

const ALIGN_CSS = { left: 'left', center: 'center', right: 'right', justify: 'justify' };

function runsHtml(runs, { showAi = true } = {}) {
  let out = '';
  let inAi = false;
  for (const r of runs || []) {
    if (!!r.ai !== inAi && showAi) {
      out += r.ai ? '<mark class="nb-ai" title="AI 생성 경험 — 사실과 맞는지 확인하세요">' : '</mark>';
      inAi = !!r.ai;
    }
    let s = esc(r.text).replace(/\n/g, '<br>');
    const style = [];
    if (r.color) style.push(`color:${r.color}`);
    if (r.bg) style.push(`background-color:${r.bg}`);
    if (r.size) style.push(`font-size:${r.size}px`);
    if (r.b) s = `<b>${s}</b>`;
    if (r.i) s = `<i>${s}</i>`;
    if (r.u) s = `<u>${s}</u>`;
    if (r.s) s = `<s>${s}</s>`;
    if (style.length) s = `<span style="${style.join(';')}">${s}</span>`;
    out += s;
  }
  if (inAi && showAi) out += '</mark>';
  return out;
}

function paraStyle(b, base) {
  const st = [];
  st.push(`text-align:${ALIGN_CSS[b.align] || base.align}`);
  if (b.size && b.size !== DEFAULT_SIZE) st.push(`font-size:${b.size}px`);
  if (b.color) st.push(`color:${b.color}`);
  if (b.b) st.push('font-weight:700');
  if (b.i) st.push('font-style:italic');
  if (b.u) st.push('text-decoration:underline');
  if (b.s) st.push('text-decoration:line-through');
  return st.join(';');
}

/** 사진 한 칸. 참고글은 원본 비율(sizes)로, 없으면 4:3 으로 그린다 */
function photoCell(b, k, opts) {
  const no = b.photos?.[k];
  const src = no != null ? opts.photos?.[no] : null;
  if (src) return `<div class="nb-photo has-img"><img src="${esc(src)}" alt="사진 ${no}" loading="lazy"><span class="nb-photo-no">${no}</span></div>`;
  const sz = b.sizes?.[k];
  const ratio = sz?.w && sz?.h ? Math.min(1.6, Math.max(0.5, sz.h / sz.w)) : 0.75;
  const label = no != null ? `사진 ${no}` : '사진';
  return `<div class="nb-photo" style="padding-top:${(ratio * 100).toFixed(1)}%"><span>${label}${no != null && opts.photos ? ' (없음)' : ''}</span></div>`;
}

function imageBlock(b, opts) {
  const n = Math.max(1, b.count || b.photos?.length || 1);
  const caps = (b.captions || []).filter(Boolean);
  const cap = caps.length ? `<div class="nb-caption">${esc(caps.join(' / '))}</div>` : '';
  const badge = `<span class="nb-photo-kind">${esc(b.layout)}${n > 1 ? ` ${n}장` : ''}</span>`;
  const cells = Array.from({ length: n }, (_, k) => photoCell(b, k, opts));

  if (b.layout === '나란히') return `<div class="nb-img nb-strip nb-strip-${Math.min(n, 4)}">${badge}${cells.join('')}</div>${cap}`;
  if (b.layout === '슬라이드') {
    const dots = Array.from({ length: n }, (_, k) => `<i class="${k === 0 ? 'on' : ''}"></i>`).join('');
    return `<div class="nb-img nb-slide" data-count="${n}">${badge}<div class="nb-slide-track">${cells.join('')}</div><div class="nb-slide-count">1 / ${n}</div><div class="nb-slide-dots">${dots}</div></div>${cap}`;
  }
  if (b.layout === '콜라주') return `<div class="nb-img nb-collage nb-collage-${Math.min(n, 4)}">${badge}${cells.join('')}</div>${cap}`;
  if (b.layout === '연속') return `<div class="nb-img nb-stack">${badge}${cells.join('')}</div>${cap}`;
  return `<div class="nb-img">${cells.join('')}</div>${cap}`;
}

const QUOTE_CLASS = {
  따옴표형: 'q-default',
  버티컬라인형: 'q-line',
  말풍선형: 'q-bubble',
  라인따옴표형: 'q-underline',
  포스트잇형: 'q-postit',
  프레임형: 'q-corner',
};

const HR_CLASS = {
  기본: 'hr-default',
  실선: 'hr-line1',
  굵은선: 'hr-line2',
  점선: 'hr-line3',
  물결: 'hr-line4',
  짧은점선: 'hr-line5',
  심볼: 'hr-line6',
  세로선: 'hr-line7',
};

export function renderBlocks(blocks, meta = {}, opts = {}) {
  const base = {
    align: { 왼쪽: 'left', 가운데: 'center', 오른쪽: 'right', 양쪽: 'justify' }[meta['기본정렬']] || 'left',
    size: Number(meta['기본글자크기']) || DEFAULT_SIZE,
    heading: Number(meta['소제목글자크기']) || 0,
  };
  const out = [];
  blocks.forEach((b, idx) => {
    const data = `data-idx="${idx}"`;
    switch (b.t) {
      case 'p': {
        // 네이버의 배경 강조는 문단 칸이 아니라 글자 뒤에만 칠해진다 → span 으로 감싼다
        const inner = runsHtml(b.runs, opts) || '&nbsp;';
        const body = b.bg ? `<span style="background-color:${b.bg}">${inner}</span>` : inner;
        out.push(`<p class="nb-p" ${data} style="${paraStyle(b, base)}">${body}</p>`);
        break;
      }
      case 'blank':
        out.push(`<div class="nb-blank" ${data} style="height:${(b.n * 1.8 * base.size).toFixed(0)}px" title="빈 줄 ${b.n}"></div>`);
        break;
      case 'heading':
        out.push(`<h3 class="nb-heading" ${data} style="text-align:${ALIGN_CSS[b.align] || base.align}${b.size || base.heading ? `;font-size:${b.size || base.heading}px` : ''}${b.color ? `;color:${b.color}` : ''}">${runsHtml(b.runs, opts)}</h3>`);
        break;
      case 'quote':
        out.push(
          `<blockquote class="nb-quote ${QUOTE_CLASS[b.style] || 'q-default'}" ${data} title="인용구 — ${esc(b.style)}"><div class="nb-quote-text"${base.heading ? ` style="font-size:${base.heading}px"` : ''}>${runsHtml(b.runs, opts)}</div>${b.cite ? `<cite>${esc(b.cite)}</cite>` : ''}</blockquote>`,
        );
        break;
      case 'hr':
        out.push(`<div class="nb-hr ${HR_CLASS[b.style] || 'hr-default'}" ${data} title="구분선 — ${esc(b.style)}"><hr></div>`);
        break;
      case 'img':
        out.push(`<div class="nb-img-wrap" ${data}>${imageBlock(b, opts)}</div>`);
        break;
      case 'sticker':
        out.push(`<div class="nb-sticker" ${data} title="스티커">스티커</div>`);
        break;
      case 'video':
        out.push(`<div class="nb-video" ${data}>▶ 동영상</div>`);
        break;
      case 'link':
        out.push(`<div class="nb-link" ${data}><div class="nb-link-thumb"></div><div class="nb-link-body"><b>${esc(b.title || '링크')}</b><span>${esc(b.url ? new URL(b.url, 'https://x').hostname : '')}</span></div></div>`);
        break;
      case 'map':
        out.push(`<div class="nb-map" ${data}><div class="nb-map-img">지도</div><div class="nb-map-body"><b>${esc(b.name)}</b><span>${esc(b.address)}</span></div></div>`);
        break;
      case 'receipt':
        out.push(`<div class="nb-receipt" ${data}>${esc(b.text || '내돈내산 인증')}</div>`);
        break;
      case 'table':
        out.push(
          `<table class="nb-table" ${data}>${b.rows.map((r) => `<tr>${r.map((c) => `<td>${esc(c)}</td>`).join('')}</tr>`).join('')}</table>`,
        );
        break;
      case 'etc':
        out.push(`<div class="nb-etc" ${data}>[${esc(b.name)}] ${esc(b.text || '')}</div>`);
        break;
      default:
        break;
    }
  });
  return out.join('\n');
}

/**
 * 글 전체 미리보기 (머리말 + 본문 + 태그).
 * @param {{meta:object, blocks:object[]}} doc structmd.parse() 결과
 * @param {{photos?:Object<number,string>, showAi?:boolean, title?:string, tags?:string[]}} opts
 */
export function renderPost(doc, opts = {}) {
  const meta = doc.meta || {};
  const title = opts.title ?? meta['제목'] ?? '';
  const tagField = String(meta['태그'] || '').trim();
  const tagsRaw = opts.tags ?? (/^(확인 불가|\(없음\))$/.test(tagField) ? [] : tagField.split(/[\s,]+/).filter(Boolean));
  const tags = tagsRaw.map((t) => (t.startsWith('#') ? t : `#${t}`));
  const reactions = [];
  if (meta['공감'] != null && meta['공감'] !== '') reactions.push(`공감 ${esc(meta['공감'])}`);
  if (meta['댓글'] != null && meta['댓글'] !== '') reactions.push(`댓글 ${esc(meta['댓글'])}`);

  return `<article class="nb-post">
  <header class="nb-head">
    ${meta['카테고리'] ? `<div class="nb-category">${esc(meta['카테고리'])}</div>` : ''}
    <h1 class="nb-title">${esc(title) || '<span class="nb-muted">(제목 없음)</span>'}</h1>
    <div class="nb-byline">${esc(meta['발행일'] || '')}</div>
  </header>
  <div class="nb-body">
${renderBlocks(doc.blocks || [], meta, opts)}
  </div>
  ${tags.length ? `<div class="nb-tags">${tags.map((t) => `<span>${esc(t)}</span>`).join('')}</div>` : ''}
  ${reactions.length ? `<footer class="nb-foot">${reactions.join(' · ')}</footer>` : ''}
</article>`;
}

export { runsText };
