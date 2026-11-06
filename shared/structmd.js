/**
 * 구조 md — 네이버 스마트에디터의 편집 구조를 텍스트로 적는 문법.
 *
 * 참고글(스크래핑 결과)·텍스트 업로드·생성 글이 모두 이 문법을 쓴다.
 * 서버(Node)와 화면(브라우저)이 같은 파일을 import 하므로 Node 전용 API 를 쓰지 않는다.
 *
 * ── 문법 요약 ───────────────────────────────────────────────
 *   맨 위 `---` 블록          메타 정보 (제목, 카테고리, 공감, 기본정렬, 기본글자크기 …)
 *   한 줄 = 한 문단
 *   [가운데|굵게|19px|색#e64980|배경#ffe3c8|밑줄] 문단   ← 기본값과 다른 속성만 적는다
 *   빈 줄 또는 [빈줄] / [빈줄x3]                         ← 여백
 *   [소제목] 텍스트
 *   [인용구-따옴표형] 텍스트<br>둘째 줄   /  [인용구-말풍선형|출처: 누구] …
 *   [구분선] / [구분선-점선] / ---
 *   참고글 사진: [사진-단독] [사진-연속3장] [사진-나란히2장] [사진-슬라이드5장] [사진-콜라주4장]
 *   생성글 사진: [사진1] [사진2~4-연속] [사진5~6-나란히] [사진7~9-슬라이드]
 *   사진 캡션:  [사진-단독|캡션: 정면 모습]   (여러 장이면 " / " 로 구분)
 *   [스티커] [동영상] [링크카드] 제목 | 주소  [지도] 장소 | 주소  [내돈내산인증] 내용
 *   [표 3x2] … | 칸 | 칸 | … [/표]
 *
 *   문단 안 강조:  **굵게**  __밑줄__  ~~취소선~~  ==배경강조==  ^^글자색강조^^
 *                  ==#ffe3c8|색 지정 배경==  ^^#e64980|색 지정 글자^^  {{24px|큰 글자}}
 *                  <br> (문단 안 줄바꿈)   [AI경험]…[/AI경험] (AI가 지어낸 경험 표시)
 * ────────────────────────────────────────────────────────────
 *
 * 블록(JSON) 모델은 parse() 의 반환값 주석 참고.
 */

export const DEFAULT_SIZE = 15;
export const DEFAULT_ACCENT_COLOR = '#e64980';
export const DEFAULT_ACCENT_BG = '#ffd6e7';

/** 네이버 정렬 값 ↔ 한글 표기 */
export const ALIGN_LABEL = { left: '왼쪽', center: '가운데', right: '오른쪽', justify: '양쪽' };
const ALIGN_FROM_LABEL = Object.fromEntries(Object.entries(ALIGN_LABEL).map(([k, v]) => [v, k]));

/**
 * 인용구 레이아웃 클래스(se-l-*) → 한글 이름.
 * 에디터 인용구 메뉴 순서: 따옴표 / 버티컬 라인 / 말풍선 / 라인&따옴표 / 포스트잇 / 프레임
 */
export const QUOTE_STYLES = {
  default: '따옴표형',
  quotation_line: '버티컬라인형',
  quotation_bubble: '말풍선형',
  quotation_underline: '라인따옴표형',
  quotation_postit: '포스트잇형',
  quotation_corner: '프레임형',
};

/**
 * 구분선 레이아웃 클래스 → 한글 이름.
 * 뷰어 CSS(se.viewer.css 1.78.1)에서 확인한 모양:
 *   default 1px 연회색 짧은 선 / line1 1px 연회색 전체폭 / line2 3px 검정
 *   line3~6 은 스프라이트 이미지(238×9, 192×23, 66×6, 44×44) / line7 2×60 세로선
 * line3~6 의 이름은 크기로 추정한 것이다. 틀리면 이 표만 고치면 된다.
 */
export const HR_STYLES = {
  default: '기본',
  line1: '실선',
  line2: '굵은선',
  line3: '점선',
  line4: '물결',
  line5: '짧은점선',
  line6: '심볼',
  line7: '세로선',
};

export const IMAGE_LAYOUTS = ['단독', '연속', '나란히', '슬라이드', '콜라주'];

const FRONT_KEYS = [
  '제목', '주소', '그룹', '출처', '카테고리', '공감', '댓글', '발행일', '태그',
  '기본정렬', '기본글자크기', '소제목글자크기', '구조정보', '수집방식', '수집일시', '비고',
];

// ─────────────────────────────── 인라인 ───────────────────────────────

/** 두 런의 서식이 같은가 (텍스트 제외) */
function sameStyle(a, b) {
  return (
    !!a.b === !!b.b && !!a.i === !!b.i && !!a.u === !!b.u && !!a.s === !!b.s && !!a.ai === !!b.ai &&
    (a.color || null) === (b.color || null) && (a.bg || null) === (b.bg || null) &&
    (a.size || null) === (b.size || null)
  );
}

/** 이웃한 같은 서식 런을 합친다. 빈 런은 버린다. */
export function mergeRuns(runs) {
  const out = [];
  for (const r of runs) {
    if (!r.text) continue;
    const last = out[out.length - 1];
    if (last && sameStyle(last, r)) last.text += r.text;
    else out.push({ ...r });
  }
  return out;
}

export function runsText(runs) {
  return (runs || []).map((r) => r.text).join('');
}

const HEX = /^#[0-9a-f]{3,8}$/i;

/**
 * 인라인 문법 → 런 배열.
 * 닫히지 않은 마커는 서식으로 보지 않고 글자 그대로 남긴다 (안전한 폴백).
 */
export function parseInline(src) {
  const text = String(src ?? '');
  // 1) 토큰화
  const tokens = [];
  let buf = '';
  const flush = () => {
    if (buf) tokens.push({ k: 'text', v: buf });
    buf = '';
  };
  for (let i = 0; i < text.length; ) {
    const rest = text.slice(i);
    if (rest[0] === '\\' && i + 1 < text.length) {
      buf += text[i + 1];
      i += 2;
      continue;
    }
    let m;
    if ((m = rest.match(/^<br\s*\/?>/i))) {
      flush();
      tokens.push({ k: 'br' });
      i += m[0].length;
      continue;
    }
    if (rest.startsWith('[AI경험]')) {
      flush();
      tokens.push({ k: 'ai', open: true });
      i += 6;
      continue;
    }
    if (rest.startsWith('[/AI경험]')) {
      flush();
      tokens.push({ k: 'ai', open: false });
      i += 7;
      continue;
    }
    if ((m = rest.match(/^\{\{(\d{1,2})px\|/))) {
      flush();
      tokens.push({ k: 'size', open: true, v: Number(m[1]), raw: m[0] });
      i += m[0].length;
      continue;
    }
    if (rest.startsWith('}}')) {
      flush();
      tokens.push({ k: 'size', open: false, raw: '}}' });
      i += 2;
      continue;
    }
    const two = rest.slice(0, 2);
    if (two === '**' || two === '__' || two === '~~' || two === '==' || two === '^^') {
      flush();
      const kind = { '**': 'b', __: 'u', '~~': 's', '==': 'bg', '^^': 'color' }[two];
      const tok = { k: kind, raw: two };
      // 여는 마커 뒤 "#hex|" 는 색 지정
      if ((kind === 'bg' || kind === 'color') && (m = rest.slice(2).match(/^(#[0-9a-f]{3,8})\|/i))) {
        tok.v = m[1].toLowerCase();
        tok.rawOpen = two + m[0];
        tok.len = 2 + m[0].length;
      }
      tokens.push(tok);
      i += tok.len || 2;
      continue;
    }
    buf += text[i];
    i++;
  }
  flush();

  // 2) 짝 맞추기: 닫는 짝이 없는 마커는 글자로 되돌린다.
  //    [AI경험] 은 짝이 없어도 끝까지 유효하게 둔다 (생성 결과가 잘려도 표시는 남도록).
  const paired = new Array(tokens.length).fill(false);
  const sizeStack = [];
  const openAt = {}; // 토글형 마커별로 열려 있는 토큰 위치
  tokens.forEach((t, idx) => {
    if (t.k === 'size') {
      if (t.open) sizeStack.push(idx);
      else if (sizeStack.length) {
        paired[sizeStack.pop()] = true;
        paired[idx] = true;
      }
      return;
    }
    if (!['b', 'u', 's', 'bg', 'color'].includes(t.k)) return;
    // 토글형: 열린 게 없으면 연다, 있으면 닫는다.
    // 색 지정(#hex|)은 여는 쪽에만 올 수 있으므로, 열린 상태에서 또 오면 새로 여는 것으로 본다.
    if (openAt[t.k] == null || t.v) openAt[t.k] = idx;
    else {
      paired[openAt[t.k]] = true;
      paired[idx] = true;
      openAt[t.k] = null;
    }
  });

  // 3) 런 생성
  const runs = [];
  const state = { b: false, u: false, s: false, ai: false, bg: [], color: [], size: [] };
  const open = { b: false, u: false, s: false, bg: false, color: false };
  const cur = () => {
    const r = {};
    if (state.b) r.b = true;
    if (state.u) r.u = true;
    if (state.s) r.s = true;
    if (state.ai) r.ai = true;
    if (state.bg.length) r.bg = state.bg[state.bg.length - 1];
    if (state.color.length) r.color = state.color[state.color.length - 1];
    if (state.size.length) r.size = state.size[state.size.length - 1];
    return r;
  };
  tokens.forEach((t, idx) => {
    if (t.k === 'text') return runs.push({ ...cur(), text: t.v });
    if (t.k === 'br') return runs.push({ ...cur(), text: '\n' });
    if (t.k === 'ai') {
      state.ai = t.open;
      return;
    }
    if (!paired[idx]) {
      return runs.push({ ...cur(), text: t.rawOpen || t.raw });
    }
    if (t.k === 'size') {
      if (t.open) state.size.push(t.v);
      else state.size.pop();
      return;
    }
    if (t.k === 'b' || t.k === 'u' || t.k === 's') {
      state[t.k] = !state[t.k];
      return;
    }
    // bg / color
    if (!open[t.k]) {
      open[t.k] = true;
      state[t.k].push(t.v || (t.k === 'bg' ? DEFAULT_ACCENT_BG : DEFAULT_ACCENT_COLOR));
    } else {
      open[t.k] = false;
      state[t.k].pop();
    }
  });
  return mergeRuns(runs);
}

/** 문법 문자와 겹치는 글자를 이스케이프한다. */
function escapeInline(text) {
  return text
    .replace(/\\/g, '\\\\')
    .replace(/(\*\*|__|~~|==|\^\^|\{\{|\}\})/g, (m) => `\\${m[0]}\\${m[1]}`)
    .replace(/<br/gi, '\\<br')
    .replace(/\[(\/?)AI경험\]/g, '\\[$1AI경험]');
}

/**
 * 런 배열 → 인라인 문법.
 * @param base 문단 전체에 이미 적용된 속성 (여기에 해당하는 서식은 다시 적지 않는다)
 */
export function serializeInline(runs, base = {}) {
  let out = '';
  let inAi = false;
  for (const r of mergeRuns(runs)) {
    if (!!r.ai !== inAi) {
      out += r.ai ? '[AI경험]' : '[/AI경험]';
      inAi = !!r.ai;
    }
    const parts = r.text.split('\n');
    let s = parts.map(escapeInline).join('<br>');
    if (!s.trim()) {
      out += s;
      continue;
    }
    // 앞뒤 공백은 마커 바깥으로 뺀다: "** 굵게**" 보다 " **굵게**" 가 읽기 쉽다
    const lead = s.match(/^\s*/)[0];
    const trail = s.match(/\s*$/)[0];
    s = s.slice(lead.length, s.length - trail.length);
    if (r.b && !base.b) s = `**${s}**`;
    if (r.u && !base.u) s = `__${s}__`;
    if (r.s && !base.s) s = `~~${s}~~`;
    if (r.bg && r.bg !== base.bg) s = r.bg === DEFAULT_ACCENT_BG ? `==${s}==` : `==${r.bg}|${s}==`;
    if (r.color && r.color !== base.color)
      s = r.color === DEFAULT_ACCENT_COLOR ? `^^${s}^^` : `^^${r.color}|${s}^^`;
    if (r.size && r.size !== base.size) s = `{{${r.size}px|${s}}}`;
    out += lead + s + trail;
  }
  if (inAi) out += '[/AI경험]';
  return out;
}

// ─────────────────────────────── 줄 단위 ───────────────────────────────

/** "[가운데|굵게|19px]" 안쪽을 문단 속성으로 해석. 하나라도 모르는 토큰이면 null. */
function parseParaAttrs(inner) {
  const attrs = {};
  for (const raw of inner.split('|')) {
    const t = raw.trim();
    if (!t) continue;
    let m;
    if (ALIGN_FROM_LABEL[t]) attrs.align = ALIGN_FROM_LABEL[t];
    else if (t === '굵게') attrs.b = true;
    else if (t === '기울임') attrs.i = true;
    else if (t === '밑줄') attrs.u = true;
    else if (t === '취소선') attrs.s = true;
    else if ((m = t.match(/^(\d{1,2})px$/))) attrs.size = Number(m[1]);
    else if ((m = t.match(/^색\s*(#[0-9a-f]{3,8})$/i))) attrs.color = m[1].toLowerCase();
    else if ((m = t.match(/^배경\s*(#[0-9a-f]{3,8})$/i))) attrs.bg = m[1].toLowerCase();
    else return null;
  }
  return attrs;
}

/** "캡션: a / b" 같은 옵션 조각을 key-value 로 */
function parseOptions(parts) {
  const opts = {};
  for (const p of parts) {
    const m = p.match(/^\s*([^:：]+)\s*[:：]\s*(.*)$/);
    if (m) opts[m[1].trim()] = m[2].trim();
  }
  return opts;
}

/** 사진 표시 해석. 참고글(형태만)과 생성글(번호 지정) 모두 받는다. */
function parseImageTag(inner) {
  const [head, ...rest] = inner.split('|');
  const opts = parseOptions(rest);
  const captions = opts['캡션'] ? opts['캡션'].split(/\s+\/\s+/).map((s) => s.trim()) : undefined;
  let m;
  // 생성글: 사진3 / 사진2~4-연속 / 사진2,3,5-나란히
  if ((m = head.match(/^사진\s*(\d+(?:\s*[~,]\s*\d+)*)(?:\s*-\s*(단독|연속|나란히|슬라이드|콜라주))?$/))) {
    const photos = [];
    for (const part of m[1].split(',')) {
      const [a, b] = part.split('~').map((x) => Number(x.trim()));
      const to = Number.isFinite(b) ? b : a;
      for (let n = Math.min(a, to); n <= Math.max(a, to); n++) if (!photos.includes(n)) photos.push(n);
    }
    const layout = m[2] || (photos.length > 1 ? '연속' : '단독');
    return { t: 'img', layout, count: photos.length, photos, ...(captions && { captions }) };
  }
  // 참고글: 사진-단독 / 사진-연속3장 / 사진-슬라이드 5장 / 사진
  if ((m = head.match(/^사진(?:\s*-\s*(단독|연속|나란히|슬라이드|콜라주)\s*(?:(\d+)\s*장)?)?$/))) {
    const layout = m[1] || '단독';
    const count = m[2] ? Number(m[2]) : 1;
    return { t: 'img', layout, count, ...(captions && { captions }) };
  }
  return null;
}

/**
 * 태그로 시작하는 줄 해석. 모르는 태그면 null (→ 일반 문단으로 처리).
 */
function parseTagLine(line) {
  const m = line.match(/^\[([^\]]+)\]\s?(.*)$/);
  if (!m) return null;
  const inner = m[1].trim();
  const body = m[2];
  let mm;

  if ((mm = inner.match(/^빈줄(?:\s*[x×X]\s*(\d+))?$/))) return { t: 'blank', n: Number(mm[1] || 1) };

  if ((mm = inner.match(/^소제목(?:\|(.*))?$/))) {
    const attrs = mm[1] ? parseParaAttrs(mm[1]) || {} : {};
    return { t: 'heading', ...attrs, runs: parseInline(body) };
  }

  if ((mm = inner.match(/^인용구(?:\s*-\s*([^|]+))?(?:\|(.*))?$/))) {
    const style = (mm[1] || '따옴표형').trim();
    const opts = mm[2] ? parseOptions(mm[2].split('|')) : {};
    return { t: 'quote', style, runs: parseInline(body), ...(opts['출처'] && { cite: opts['출처'] }) };
  }

  if ((mm = inner.match(/^구분선(?:\s*-\s*(.+))?$/))) return { t: 'hr', style: (mm[1] || '기본').trim() };

  if (/^사진/.test(inner)) {
    const img = parseImageTag(inner);
    if (img) return img;
  }

  if (inner === '스티커') return { t: 'sticker' };
  if (inner === '동영상') return { t: 'video' };
  if (inner === '링크카드') {
    // 제목 안에도 " | " 가 들어갈 수 있으니 맨 끝의 주소만 떼어낸다
    const lm = body.match(/^(.*?)\s+\|\s+(https?:\/\/\S+)\s*$/);
    return lm ? { t: 'link', title: lm[1].trim(), url: lm[2] } : { t: 'link', title: body.trim(), url: '' };
  }
  if (inner === '지도') {
    const k = body.lastIndexOf(' | ');
    return k < 0 ? { t: 'map', name: body.trim(), address: '' } : { t: 'map', name: body.slice(0, k).trim(), address: body.slice(k + 3).trim() };
  }
  if (inner === '내돈내산인증') return { t: 'receipt', text: body.trim() };
  if ((mm = inner.match(/^기타-(.+)$/))) return { t: 'etc', name: mm[1].trim(), text: body.trim() };

  const attrs = parseParaAttrs(inner);
  if (attrs && Object.keys(attrs).length) return { t: 'p', ...attrs, runs: parseInline(body) };
  return null;
}

/** 맨 위 --- 블록 해석 */
function parseFront(lines) {
  if (lines[0]?.trim() !== '---') return { meta: {}, start: 0 };
  const meta = {};
  for (let i = 1; i < lines.length; i++) {
    const l = lines[i];
    if (l.trim() === '---') return { meta, start: i + 1 };
    const m = l.match(/^\s*([^:：]+?)\s*[:：]\s?(.*)$/);
    if (m) meta[m[1].trim()] = m[2].trim();
  }
  // 닫는 --- 가 없으면 front matter 가 아니다
  return { meta: {}, start: 0 };
}

/**
 * 구조 md → { meta, blocks }
 *
 * 블록 종류:
 *   { t:'p', align?, size?, b?, i?, u?, s?, color?, bg?, runs:[{text,b,i,u,s,color,bg,size,ai}] }
 *   { t:'blank', n }
 *   { t:'heading', runs }            { t:'quote', style, runs, cite? }
 *   { t:'hr', style }                { t:'img', layout, count, photos?, captions? }
 *   { t:'sticker' } { t:'video' } { t:'link', title, url } { t:'map', name, address }
 *   { t:'table', rows:[[cell…]…] }   { t:'receipt', text }  { t:'etc', name, text }
 */
export function parse(md) {
  const lines = String(md ?? '').replace(/\r\n?/g, '\n').split('\n');
  const { meta, start } = parseFront(lines);
  const blocks = [];
  // 블록마다 원래 몇 번째 줄(0부터, 메타 블록 포함)에서 왔는지 기억한다 — 문단 단위 다시 쓰기에 쓴다
  let cur = 0;
  const push = (b) => {
    b.line = cur;
    b.lineEnd = cur;
    blocks.push(b);
  };
  const pushBlank = (n) => {
    const last = blocks[blocks.length - 1];
    if (last?.t === 'blank') {
      last.n += n;
      last.lineEnd = cur;
    } else push({ t: 'blank', n });
  };

  for (let i = start; i < lines.length; i++) {
    cur = i;
    const line = lines[i].replace(/\s+$/, '');
    if (!line.trim()) {
      pushBlank(1);
      continue;
    }
    if (/^-{3,}$/.test(line.trim()) || /^\*{3,}$/.test(line.trim())) {
      push({ t: 'hr', style: '기본' });
      continue;
    }
    // 표: [표 RxC] … [/표]
    if (/^\[표(\s+\d+\s*[x×]\s*\d+)?\]\s*$/.test(line.trim())) {
      const rows = [];
      for (i++; i < lines.length && lines[i].trim() !== '[/표]'; i++) {
        const r = lines[i].trim();
        if (!r) continue;
        rows.push(r.replace(/^\|/, '').replace(/\|$/, '').split('|').map((c) => c.trim()));
      }
      push({ t: 'table', rows });
      blocks[blocks.length - 1].lineEnd = i;
      continue;
    }
    if (line.startsWith('[')) {
      const b = parseTagLine(line);
      if (b) {
        if (b.t === 'blank') pushBlank(b.n);
        else push(b);
        continue;
      }
    }
    // 일반 문단. 줄 맨 앞 "\[" 는 태그가 아니라는 표시다.
    const body = line.startsWith('\\[') ? line.slice(1) : line;
    // 마크다운 습관(# 제목, > 인용)도 받아준다 — 텍스트 업로드용
    let mh;
    if ((mh = body.match(/^#{2,4}\s+(.*)$/))) {
      push({ t: 'heading', runs: parseInline(mh[1]) });
      continue;
    }
    if ((mh = body.match(/^>\s?(.*)$/))) {
      push({ t: 'quote', style: '따옴표형', runs: parseInline(mh[1]) });
      continue;
    }
    push({ t: 'p', runs: parseInline(body) });
  }

  // 앞뒤 여백은 의미가 없다
  while (blocks[0]?.t === 'blank') blocks.shift();
  while (blocks[blocks.length - 1]?.t === 'blank') blocks.pop();

  // 속성을 적지 않은 문단은 문서 기본값(기본정렬·기본글자크기)을 따른다
  const baseAlign = ALIGN_FROM_LABEL[meta['기본정렬']] || 'left';
  const baseSize = Number(meta['기본글자크기']) || DEFAULT_SIZE;
  for (const b of blocks) {
    if (b.t !== 'p') continue;
    if (!b.align) b.align = baseAlign;
    if (!b.size) b.size = baseSize;
  }
  return { meta, blocks };
}

// ─────────────────────────────── 직렬화 ───────────────────────────────

/** 문단 속성 → "[가운데|굵게]" (기본값과 같은 건 뺀다) */
function paraAttrTag(b, defaults) {
  const tags = [];
  const align = b.align || 'left';
  if (align !== (defaults.align || 'left')) tags.push(ALIGN_LABEL[align] || align);
  if (b.b) tags.push('굵게');
  if (b.i) tags.push('기울임');
  if (b.u) tags.push('밑줄');
  if (b.s) tags.push('취소선');
  if (b.size && b.size !== (defaults.size || DEFAULT_SIZE)) tags.push(`${b.size}px`);
  if (b.color) tags.push(`색${b.color}`);
  if (b.bg) tags.push(`배경${b.bg}`);
  return tags.length ? `[${tags.join('|')}] ` : '';
}

function imageTag(b) {
  let head;
  if (b.photos?.length) {
    const ps = b.photos;
    const contiguous = ps.every((n, k) => k === 0 || n === ps[k - 1] + 1);
    const range = ps.length === 1 ? `${ps[0]}` : contiguous ? `${ps[0]}~${ps[ps.length - 1]}` : ps.join(',');
    head = ps.length === 1 && b.layout === '단독' ? `사진${range}` : `사진${range}-${b.layout}`;
  } else {
    head = b.layout === '단독' && (b.count || 1) === 1 ? '사진-단독' : `사진-${b.layout}${b.count || 1}장`;
  }
  const caps = (b.captions || []).filter(Boolean);
  return `[${head}${caps.length ? `|캡션: ${caps.join(' / ')}` : ''}]`;
}

/** { meta, blocks } → 구조 md */
export function serialize({ meta = {}, blocks = [] }) {
  const out = [];
  const keys = Object.keys(meta).filter((k) => meta[k] !== undefined && meta[k] !== null && meta[k] !== '');
  if (keys.length) {
    out.push('---');
    const ordered = [...FRONT_KEYS.filter((k) => keys.includes(k)), ...keys.filter((k) => !FRONT_KEYS.includes(k))];
    for (const k of ordered) {
      const v = Array.isArray(meta[k]) ? meta[k].join(', ') : String(meta[k]).replace(/\n/g, ' ');
      out.push(`${k}: ${v}`);
    }
    out.push('---');
  }
  const defaults = {
    align: ALIGN_FROM_LABEL[meta['기본정렬']] || 'left',
    size: Number(meta['기본글자크기']) || DEFAULT_SIZE,
  };

  for (const b of blocks) {
    switch (b.t) {
      case 'p': {
        const base = { b: b.b, u: b.u, s: b.s, color: b.color, bg: b.bg, size: b.size || defaults.size };
        let text = serializeInline(b.runs, base);
        if (text.startsWith('[')) text = `\\${text}`;
        if (!text.trim()) {
          out.push('[빈줄]');
          break;
        }
        out.push(paraAttrTag(b, defaults) + text);
        break;
      }
      case 'blank':
        out.push(b.n > 1 ? `[빈줄x${b.n}]` : '[빈줄]');
        break;
      case 'heading':
        out.push(`[소제목] ${serializeInline(b.runs, { b: true, size: b.size, color: b.color })}`);
        break;
      case 'quote':
        out.push(`[인용구-${b.style || '따옴표형'}${b.cite ? `|출처: ${b.cite}` : ''}] ${serializeInline(b.runs, { size: b.size })}`);
        break;
      case 'hr':
        out.push(b.style && b.style !== '기본' ? `[구분선-${b.style}]` : '[구분선]');
        break;
      case 'img':
        out.push(imageTag(b));
        break;
      case 'sticker':
        out.push('[스티커]');
        break;
      case 'video':
        out.push('[동영상]');
        break;
      case 'link':
        out.push(`[링크카드] ${b.title || ''}${b.url ? ` | ${b.url}` : ''}`);
        break;
      case 'map':
        out.push(`[지도] ${b.name || ''}${b.address ? ` | ${b.address}` : ''}`);
        break;
      case 'receipt':
        out.push(`[내돈내산인증] ${b.text || ''}`);
        break;
      case 'table': {
        const cols = Math.max(0, ...b.rows.map((r) => r.length));
        out.push(`[표 ${b.rows.length}x${cols}]`);
        for (const r of b.rows) out.push(`| ${r.map((c) => String(c).replace(/\|/g, '/').replace(/\n/g, ' ')).join(' | ')} |`);
        out.push('[/표]');
        break;
      }
      case 'etc':
        out.push(`[기타-${b.name}]${b.text ? ` ${b.text}` : ''}`);
        break;
      default:
        break;
    }
  }
  return out.map((l) => l.replace(/\s+$/, '')).join('\n') + '\n';
}

// ─────────────────────────────── 요약 수치 ───────────────────────────────

/** 목록 화면과 분석에서 쓰는 기본 수치 */
export function summarize(blocks) {
  const s = {
    chars: 0, charsNoSpace: 0, paragraphs: 0, images: 0, imageBlocks: 0,
    headings: 0, quotes: 0, hrs: 0, blanks: 0, stickers: 0, links: 0, maps: 0, tables: 0,
  };
  for (const b of blocks) {
    const txt = b.runs ? runsText(b.runs) : '';
    if (b.t === 'p' || b.t === 'heading' || b.t === 'quote') {
      s.chars += txt.replace(/\n/g, '').length;
      s.charsNoSpace += txt.replace(/\s/g, '').length;
    }
    if (b.t === 'p') s.paragraphs++;
    else if (b.t === 'img') {
      s.images += b.count || 1;
      s.imageBlocks++;
    } else if (b.t === 'heading') s.headings++;
    else if (b.t === 'quote') s.quotes++;
    else if (b.t === 'hr') s.hrs++;
    else if (b.t === 'blank') s.blanks += b.n;
    else if (b.t === 'sticker') s.stickers++;
    else if (b.t === 'link') s.links++;
    else if (b.t === 'map') s.maps++;
    else if (b.t === 'table') s.tables++;
  }
  return s;
}

export { HEX };
