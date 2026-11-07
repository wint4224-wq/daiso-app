/**
 * 폰 앱 화면. 사진 → 메모 → 글 쓰기 → 미리보기 → 승인.
 * 처리는 GitHub Actions 가 하고, 이 앱은 저장소에 요청을 넣고 결과를 읽는다. 그래서 앱을 닫아도 계속된다.
 */
import { parse } from './shared/structmd.js';
import { renderPost } from './shared/preview.js';
import { toPasteHtml, toPlainText, stripAiMarkers } from './shared/pasteHtml.js';
import { reviewFor, reviewCardHtml } from './shared/reviews.js';
import { MAX_PHOTOS, LONG_EDGE, client, newWork, jobDir, jobPhase, reqStage, editField, reviewNotes, tagsText, hex6, humanNow } from './lib.js';

const CFG = window.DAISO_CONFIG || {};
const K = { token: 'daiso.token', memo: (id) => `daiso.memo.${id}` };
const $ = (s) => document.querySelector(s);
const view = $('#view');
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);

function lsGet(k) {
  try {
    return localStorage.getItem(k);
  } catch {
    return null;
  }
}
function lsSet(k, v) {
  try {
    if (v == null) localStorage.removeItem(k);
    else localStorage.setItem(k, v);
  } catch {
    /* 저장이 안 되는 환경이면 이번 화면에서만 쓴다 */
  }
}

let gh = null;
let timer = null;
const job = { id: null, phaseKey: '', reviewKey: '', edits: {}, work: null, status: null, reqs: [], choice: null, naver: null, draft: null, title: 0, urls: {}, direct: false, keyword: null };

function toast(msg, bad = false) {
  const t = $('#toast');
  t.textContent = msg;
  t.className = bad ? 'on bad' : 'on';
  clearTimeout(toast.t);
  toast.t = setTimeout(() => (t.className = ''), bad ? 6000 : 2600);
}

function connect() {
  const token = lsGet(K.token);
  gh = token ? client({ owner: CFG.owner, repo: CFG.repo, token, api: CFG.api }) : null;
  return !!gh;
}

// ─────────────── 설정 ───────────────

function renderSetup() {
  stopPolling();
  view.innerHTML = `<section class="card">
    <h2>처음 설정</h2>
    <p class="hint">GitHub 토큰을 넣어 주세요. 이 폰의 브라우저에만 저장되고 GitHub 로만 보내집니다.</p>
    <label class="field">토큰<input id="token" type="text" name="daiso-access" autocomplete="off" autocapitalize="off" autocorrect="off" spellcheck="false" placeholder="github_pat_…"></label>
    <p class="hint" id="token-info"></p>
    <button class="btn primary" id="save-token">연결 확인 후 저장</button>
    ${lsGet(K.token) ? '<button class="btn ghost" id="back-home">돌아가기</button><button class="btn ghost danger" id="clear-token">이 폰에서 토큰 지우기</button>' : ''}
  </section>`;
}

async function saveToken() {
  const token = $('#token').value.trim();
  if (!token) return toast('토큰을 넣어 주세요', true);
  try {
    await client({ owner: CFG.owner, repo: CFG.repo, token, api: CFG.api }).check();
    lsSet(K.token, token);
    connect();
    toast('연결했습니다');
    location.hash = '#/';
    route();
  } catch (e) {
    toast(e.message, true);
  }
}

// ─────────────── 처음 화면 ───────────────

const PHASE_LABEL = { extracting: '사진 읽는 중', ready: '메모 기다림', generating: '글 쓰는 중', draft: '초안 완성', error: '실패' };

async function renderHome() {
  stopPolling();
  view.innerHTML = `<section class="card pick">
    <label class="btn primary big" for="files">사진 고르기</label>
    <input id="files" type="file" accept="image/*" multiple hidden>
    <p class="hint">1~${MAX_PHOTOS}장. 고르면 바로 올라가고 상품 정보를 읽기 시작합니다.</p>
    <div id="progress" hidden></div>
  </section>
  <section class="card"><h2>최근 글</h2><ul class="jobs" id="jobs"><li class="hint">불러오는 중…</li></ul></section>`;
  try {
    const ids = (await gh.list('data/jobs')).filter((n) => n.startsWith('w_')).sort().reverse().slice(0, 8);
    const rows = await Promise.all(
      ids.map(async (id) => {
        const [work, status, choice, naver, reqs] = await Promise.all([gh.readJson(`${jobDir(id)}/work.json`), gh.readJson(`${jobDir(id)}/status.json`), gh.readJson(`${jobDir(id)}/choice.json`), gh.readJson(`${jobDir(id)}/naver.json`), gh.list(`${jobDir(id)}/req`)]);
        const phase = jobPhase({ work, status, reqs: reqs.map(reqStage) });
        const label = choice ? (choice.route === 'phone' ? '폰에서 올림' : naver?.done ? '임시저장 완료' : naver?.error ? '임시저장 실패' : '노트북 대기') : PHASE_LABEL[phase];
        return `<li><a href="#/job/${id}"><span>${esc(work?.keyword || work?.products?.[0]?.name?.value || `사진 ${work?.photos?.length ?? 0}장`)}</span><small>${esc(work?.createdAt?.slice(5, 16) || '')} · ${esc(label)}</small></a></li>`;
      }),
    );
    $('#jobs').innerHTML = rows.join('') || '<li class="hint">아직 글이 없습니다.</li>';
  } catch (e) {
    $('#jobs').innerHTML = `<li class="hint bad">${esc(e.message)}</li>`;
  }
}

/** 긴 변을 줄이고 JPEG 로 다시 그린다. 다시 그리면 위치정보를 포함한 EXIF 가 사라진다 */
async function shrink(file) {
  const bmp = await createImageBitmap(file, { imageOrientation: 'from-image' });
  const k = Math.min(1, LONG_EDGE / Math.max(bmp.width, bmp.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(bmp.width * k);
  canvas.height = Math.round(bmp.height * k);
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(bmp, 0, 0, canvas.width, canvas.height);
  bmp.close?.();
  const blob = await new Promise((r) => canvas.toBlob(r, 'image/jpeg', 0.85));
  const base64 = await new Promise((res, rej) => {
    const fr = new FileReader();
    fr.onload = () => res(String(fr.result).split(',')[1]);
    fr.onerror = () => rej(new Error('사진을 읽지 못했습니다'));
    fr.readAsDataURL(blob);
  });
  return { pid: `p_${hex6()}`, name: file.name, width: canvas.width, height: canvas.height, bytes: blob.size, base64, blob };
}

async function upload(files) {
  const list = [...files].slice(0, MAX_PHOTOS);
  if (!list.length) return;
  if (files.length > MAX_PHOTOS) toast(`사진은 ${MAX_PHOTOS}장까지라 앞의 ${MAX_PHOTOS}장만 올립니다`, true);
  const box = $('#progress');
  box.hidden = false;
  const say = (t) => (box.textContent = t);
  try {
    const photos = [];
    for (const [i, f] of list.entries()) {
      say(`사진 줄이는 중 ${i + 1}/${list.length}`);
      photos.push(await shrink(f));
    }
    const work = newWork(photos);
    const dir = jobDir(work.id);
    const files2 = [...photos.map((p) => ({ path: `${dir}/processed/${p.pid}.jpg`, base64: p.base64 })), { path: `${dir}/work.json`, text: `${JSON.stringify(work, null, 2)}\n` }, { path: `${dir}/req/extract.json`, text: JSON.stringify({ at: humanNow() }) }];
    await gh.commit(`phone: 사진 ${photos.length}장`, files2, { onProgress: (n, all) => say(`올리는 중 ${n}/${all}`) });
    job.urls = Object.fromEntries(photos.map((p) => [p.pid, URL.createObjectURL(p.blob)]));
    location.hash = `#/job/${work.id}`;
  } catch (e) {
    box.hidden = true;
    toast(e.message || '사진을 올리지 못했습니다', true);
  }
}

// ─────────────── 작업 화면 ───────────────

function stopPolling() {
  clearTimeout(timer);
  timer = null;
}

async function loadJob(id) {
  const dir = jobDir(id);
  const [work, status, choice, naver, reqs] = await Promise.all([gh.readJson(`${dir}/work.json`), gh.readJson(`${dir}/status.json`), gh.readJson(`${dir}/choice.json`), gh.readJson(`${dir}/naver.json`), gh.list(`${dir}/req`)]);
  if (!work) throw new Error('작업을 찾지 못했습니다');
  // 폰에서 고친 상품 칸은 새로 받은 작업에도 다시 얹는다 (1분마다 다시 받아도 지워지지 않게)
  for (const [i, fields] of Object.entries(job.edits)) {
    const p = work.products?.[Number(i)];
    if (!p) continue;
    for (const [k, v] of Object.entries(fields)) {
      if (k === 'keyword') p.keyword = v;
      else editField(p, k, v);
    }
  }
  Object.assign(job, { work, status, choice, naver, reqs: reqs.map(reqStage) });
  const phase = jobPhase(job);
  if (phase === 'draft' && job.draft?.id !== status.draftId) {
    job.draft = await gh.readJson(`drafts/${status.draftId}.json`);
    job.title = choice?.titleIndex ?? job.draft?.titleIndex ?? 0;
  }
  return phase;
}

async function openJob(id) {
  stopPolling();
  if (job.id !== id) Object.assign(job, { id, phaseKey: '', reviewKey: '', edits: {}, draft: null, direct: false, keyword: null });
  view.innerHTML = '<p class="hint center">불러오는 중…</p>';
  await refreshJob(true);
}

async function refreshJob(force = false) {
  const id = job.id;
  try {
    const phase = await loadJob(id);
    if (id !== job.id) return;
    const key = [phase, job.status?.at, job.status?.draftId, job.choice?.route, job.naver?.state].join('|');
    if (force || key !== job.phaseKey) {
      job.phaseKey = key;
      render(phase);
    } else paintReviews(); // 리뷰만 바뀌었으면 그 칸만 바꾼다 (메모를 말하는 중에 화면이 다시 그려지지 않게)
    const reviewsRunning = Object.values(job.work.reviews || {}).some((r) => r.state === 'running');
    const waiting = reviewsRunning || phase === 'extracting' || phase === 'generating' || (job.choice?.route === 'laptop' && !job.naver?.done && !job.naver?.error);
    if (waiting) timer = setTimeout(() => refreshJob(), 8000);
  } catch (e) {
    if (force) view.innerHTML = `<section class="card"><p class="bad">${esc(e.message)}</p><a class="btn ghost" href="#/">처음으로</a></section>`;
    else timer = setTimeout(() => refreshJob(), 15000);
  }
}

function render(phase) {
  const banner = {
    extracting: '<div class="banner run">사진을 읽는 중입니다 (1~2분). 그동안 메모를 말해 주세요.</div>',
    generating: '<div class="banner run">글을 쓰는 중입니다 (3~5분). 앱을 닫아도 계속됩니다.</div>',
    error: `<div class="banner bad">실패했습니다: ${esc(job.status?.error)} ${esc(job.status?.hint || '')}<button class="btn small" data-act="retry">다시 시도</button></div>`,
  }[phase] || '';
  view.innerHTML = `<a class="back" href="#/">‹ 처음으로</a>${banner}${phase === 'draft' ? draftHtml() : phase === 'generating' ? '' : inputHtml(phase)}`;
  if (phase === 'draft') mountPreview();
  job.reviewKey = '';
  paintReviews();
}

/** 상품마다 다이소몰 리뷰 장단점 카드 (보기만 한다) */
function paintReviews() {
  const key = JSON.stringify(job.work?.reviews || {});
  if (key === job.reviewKey) return;
  job.reviewKey = key;
  for (const slot of document.querySelectorAll('.rv-slot')) {
    const p = job.work.products[Number(slot.dataset.i)];
    slot.innerHTML = reviewCardHtml(reviewFor(job.work, p), { open: slot.dataset.open === '1' });
  }
}

function inputHtml(phase) {
  const w = job.work;
  const memo = lsGet(K.memo(job.id)) ?? w.memo ?? '';
  const sug = w.keywordSuggestions || [];
  const kw = job.keyword ?? (w.keyword || sug[0]?.keyword || '');
  const multi = w.format === 'multi' && w.products.length >= 2;
  const products = w.products.map((p, i) => `<div class="product"><h3>상품 ${i + 1}</h3>
      ${[['name', '상품명'], ['price', '가격'], ['code', '품번']].map(([k, label]) => `<label class="field">${label}${p[k]?.status === '확인됨' || p[k]?.source === 'user' ? '' : ' <em>못 읽음</em>'}<input data-p="${i}" data-k="${k}" value="${esc(p[k]?.value)}"></label>`).join('')}
      ${multi ? `<label class="field">상품 키워드<input data-p="${i}" data-k="keyword" value="${esc(p.keyword)}"></label>` : ''}
      <div class="rv-slot" data-i="${i}" data-open="1"></div>
    </div>`).join('');
  return `<section class="card">
      <h2>메모</h2>
      <p class="hint">구매 이유, 써 본 느낌을 편하게 말해 주세요. 키보드의 마이크를 써도 됩니다.</p>
      <textarea id="memo" rows="6">${esc(memo)}</textarea>
      <button class="btn" id="mic" hidden>🎤 받아쓰기</button>
    </section>
    ${phase === 'ready' || w.extraction ? `<section class="card">
      <h2>상품 정보${multi ? ` <span class="tag">상품 ${w.products.length}개 모음 글</span>` : ''}</h2>
      ${products || '<p class="hint">읽어 낸 상품이 없습니다. 메모에 상품 이름과 가격을 말해 주세요.</p>'}
      <label class="field">메인 키워드<input id="keyword" value="${esc(kw)}"></label>
      <div class="chips">${sug.map((s) => `<button class="chip" data-kw="${esc(s.keyword)}">${esc(s.keyword)}</button>`).join('')}</div>
    </section>` : ''}
    <button class="btn primary big" data-act="write">글 쓰기</button>
    ${phase === 'extracting' ? '<p class="hint center">지금 눌러도 됩니다. 사진을 다 읽은 뒤 이어서 씁니다.</p>' : ''}`;
}

function currentMemo() {
  return $('#memo')?.value ?? lsGet(K.memo(job.id)) ?? job.work.memo ?? '';
}

async function requestGenerate() {
  const body = { memo: currentMemo(), at: humanNow() };
  if (job.work.extraction) {
    body.keyword = $('#keyword')?.value.trim() || job.work.keyword || '';
    body.products = job.work.products;
  }
  await gh.commit('phone: 글 쓰기', [{ path: `${jobDir(job.id)}/req/generate-${Date.now()}.json`, text: JSON.stringify(body) }]);
  toast('글 쓰기를 시작했습니다');
  await refreshJob(true);
}

// ─────────────── 초안 ───────────────

function draftHtml() {
  const d = job.draft;
  if (!d) return '<section class="card"><p class="bad">초안을 찾지 못했습니다.</p></section>';
  const notes = reviewNotes(d);
  const ch = job.choice;
  const after = ch?.route === 'phone'
    ? '<div class="banner ok">폰에서 올린 글로 표시했습니다.</div>'
    : ch?.route === 'laptop'
      ? `<div class="banner ${job.naver?.done ? 'ok' : job.naver?.error ? 'bad' : 'run'}">${esc(job.naver?.message || '프로그램이 켜져 있으면 1분 안에 시작합니다. 꺼져 있으면 켜질 때 시작합니다.')}${job.naver?.error ? '<button class="btn small" data-act="naver-retry">다시 시도</button>' : ''}</div>`
      : `<section class="card"><h2>어떻게 올릴까요?</h2>
        <button class="btn primary big" data-act="laptop">노트북에서 자동 임시저장</button>
        <p class="hint">사진 위치·서식·태그까지 들어갑니다. 노트북을 켜면 시작됩니다.</p>
        <button class="btn big" data-act="direct">폰에서 직접 올리기</button>
        <p class="hint">복사해서 네이버 블로그 앱에 붙여넣습니다. 사진은 직접 넣습니다.</p></section>`;
  return `<section class="card"><h2>제목</h2>
      <div class="titles">${d.titles.map((t, i) => `<label><input type="radio" name="title" value="${i}" ${i === job.title ? 'checked' : ''} ${ch ? 'disabled' : ''}><span>${esc(t.title)}</span></label>`).join('')}</div>
    </section>
    ${notes.length ? `<section class="card"><h2>확인할 것 ${notes.length}개</h2><ul class="notes">${notes.map((n) => `<li>${esc(n)}</li>`).join('')}</ul></section>` : ''}
    ${d.notes ? `<p class="hint">AI 메모: ${esc(d.notes)}</p>` : ''}
    ${job.work.products.some((p) => reviewFor(job.work, p)) ? `<section class="card"><h2>다이소몰 리뷰</h2>${job.work.products.map((p, i) => `<div class="rv-slot" data-i="${i}"></div>`).join('')}</section>` : ''}
    <section class="card preview"><div id="preview" class="phone"></div></section>
    ${after}
    ${job.direct ? directHtml() : ''}
    ${ch ? '' : `<details class="card redo"><summary>메모를 고쳐서 다시 쓰기</summary><textarea id="memo" rows="5">${esc(job.work.memo || '')}</textarea><button class="btn" data-act="write">다시 쓰기</button></details>`}`;
}

function directHtml() {
  const d = job.draft;
  return `<section class="card direct"><h2>네이버 앱에 붙여넣기</h2>
    <div class="row"><button class="btn" data-copy="title">제목 복사</button><button class="btn" data-copy="body">본문 복사</button><button class="btn" data-copy="tags">태그 복사</button></div>
    <p class="hint">본문의 [사진N] 자리에 아래 번호의 사진을 넣어 주세요.</p>
    <ol class="thumbs">${d.photoOrder.map((pid, i) => `<li><img data-pid="${pid}" alt="사진 ${i + 1}"><span>${i + 1}</span></li>`).join('')}</ol>
    <button class="btn primary" data-act="posted">올렸어요</button>
  </section>`;
}

async function photoUrl(pid) {
  if (job.urls[pid]) return job.urls[pid];
  const blob = await gh.readBlob(`${jobDir(job.id)}/processed/${pid}.jpg`);
  if (blob) job.urls[pid] = URL.createObjectURL(blob);
  return job.urls[pid];
}

async function mountPreview() {
  const d = job.draft;
  if (!d) return;
  const box = $('#preview');
  const paint = (photos) => {
    box.innerHTML = renderPost(parse(d.md), { title: d.titles[job.title]?.title || '', tags: d.hashtags, photos, showAi: true });
  };
  paint({});
  const urls = await Promise.all(d.photoOrder.map((pid) => photoUrl(pid).catch(() => null)));
  if (!$('#preview')) return;
  paint(Object.fromEntries(urls.map((u, i) => [i + 1, u]).filter(([, u]) => u)));
  for (const img of document.querySelectorAll('.thumbs img')) img.src = job.urls[img.dataset.pid] || '';
}

async function saveChoice(route) {
  const body = { route, draftId: job.draft.id, titleIndex: job.title, at: humanNow() };
  await gh.commit(`phone: ${route === 'phone' ? '폰에서 올림' : '노트북 임시저장 요청'}`, [{ path: `${jobDir(job.id)}/choice.json`, text: JSON.stringify(body) }]);
  job.direct = false;
  await refreshJob(true);
}

async function copy(kind) {
  const d = job.draft;
  const doc = parse(stripAiMarkers(d.md));
  try {
    if (kind === 'body') {
      const text = toPlainText(doc);
      try {
        await navigator.clipboard.write([new ClipboardItem({ 'text/html': new Blob([toPasteHtml(doc)], { type: 'text/html' }), 'text/plain': new Blob([text], { type: 'text/plain' }) })]);
      } catch {
        await navigator.clipboard.writeText(text);
      }
    } else await navigator.clipboard.writeText(kind === 'title' ? d.titles[job.title]?.title || '' : tagsText(d.hashtags));
    toast({ title: '제목을', body: '본문을', tags: '태그를' }[kind] + ' 복사했습니다');
  } catch (e) {
    toast(`복사하지 못했습니다: ${e.message}`, true);
  }
}

// ─────────────── 받아쓰기 ───────────────

const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
let rec = null;
let listening = false;
const joinText = (a, b) => (!b ? a : !a ? b : /\s$/.test(a) ? a + b : `${a} ${b}`);

function toggleMic() {
  if (listening) return rec?.stop();
  const memo = $('#memo');
  let base = memo.value;
  rec = new SR();
  rec.lang = 'ko-KR';
  rec.continuous = true;
  rec.interimResults = true;
  rec.onresult = (ev) => {
    let fin = '';
    let interim = '';
    for (let i = ev.resultIndex; i < ev.results.length; i++) {
      if (ev.results[i].isFinal) fin += ev.results[i][0].transcript;
      else interim += ev.results[i][0].transcript;
    }
    if (fin.trim()) base = joinText(base, fin.trim());
    memo.value = joinText(base, interim.trim());
    lsSet(K.memo(job.id), memo.value);
  };
  rec.onerror = (ev) => {
    if (ev.error !== 'aborted') toast(ev.error === 'not-allowed' ? '마이크 권한을 허용해 주세요' : `받아쓰기 오류: ${ev.error}`, true);
  };
  rec.onend = () => {
    listening = false;
    if ($('#memo')) $('#memo').value = base;
    lsSet(K.memo(job.id), base);
    if ($('#mic')) $('#mic').textContent = '🎤 받아쓰기';
  };
  rec.start();
  listening = true;
  $('#mic').textContent = '■ 멈춤';
}

// ─────────────── 연결 ───────────────

/** 저장소에 쓰는 버튼: 보내는 동안 잠가서 두 번 전송되지 않게 한다 */
async function act(fn, btn) {
  const label = btn.textContent;
  btn.disabled = true;
  btn.textContent = '보내는 중…';
  try {
    await fn();
  } catch (e) {
    toast(e.message, true);
  }
  btn.disabled = false;
  btn.textContent = label;
}

document.addEventListener('click', (e) => {
  const t = e.target;
  if (t.id === 'save-token') return saveToken();
  if (t.id === 'clear-token') {
    lsSet(K.token, null);
    gh = null;
    return route();
  }
  if (t.id === 'back-home') {
    location.hash = '#/';
    return route();
  }
  if (t.id === 'mic') return toggleMic();
  if (t.dataset.kw) {
    job.keyword = t.dataset.kw;
    $('#keyword').value = t.dataset.kw;
    return;
  }
  if (t.dataset.copy) return copy(t.dataset.copy);
  const a = t.dataset.act;
  if (a === 'write') return act(requestGenerate, t);
  if (a === 'laptop') return act(() => saveChoice('laptop'), t);
  if (a === 'posted') return act(() => saveChoice('phone'), t);
  if (a === 'naver-retry') return act(() => gh.commit('phone: 임시저장 다시 시도', [], { deletes: [`${jobDir(job.id)}/naver.json`] }).then(() => refreshJob(true)), t);
  if (a === 'direct') {
    job.direct = true;
    render('draft');
    return document.querySelector('.direct')?.scrollIntoView({ behavior: 'smooth' });
  }
  if (a === 'retry') return act(() => (job.status.stage === 'extract' ? gh.commit('phone: 다시 읽기', [{ path: `${jobDir(job.id)}/req/extract-${Date.now()}.json`, text: JSON.stringify({ at: humanNow() }) }]).then(() => refreshJob(true)) : requestGenerate()), t);
});

document.addEventListener('change', (e) => {
  if (e.target.id === 'files') upload(e.target.files);
  if (e.target.name === 'title') {
    job.title = Number(e.target.value);
    mountPreview();
  }
});

document.addEventListener('input', (e) => {
  const t = e.target;
  // 같은 github.io 주소의 다른 앱 토큰이 들어가지 않았는지 끝자리로 확인한다 (화면 캡처에 토큰이 찍히지 않게 칸은 가린다)
  if (t.id === 'token') $('#token-info').textContent = t.value.trim() ? `넣은 토큰: ${t.value.trim().length}자, 끝 4자리 ${t.value.trim().slice(-4)}` : '';
  if (t.id === 'memo') lsSet(K.memo(job.id), t.value);
  if (t.id === 'keyword') job.keyword = t.value;
  if (t.dataset.p != null) {
    const p = job.work.products[Number(t.dataset.p)];
    if (t.dataset.k === 'keyword') p.keyword = t.value;
    else editField(p, t.dataset.k, t.value);
    (job.edits[t.dataset.p] ||= {})[t.dataset.k] = t.value;
  }
});

new MutationObserver(() => {
  const mic = $('#mic');
  if (mic && SR) mic.hidden = false;
}).observe(view, { childList: true });

document.addEventListener('visibilitychange', () => {
  if (!document.hidden && job.id && location.hash.startsWith('#/job/')) {
    stopPolling();
    refreshJob();
  }
});

function route() {
  $('#settings').hidden = !lsGet(K.token);
  if (!connect() || location.hash === '#/setup') return renderSetup();
  const m = location.hash.match(/^#\/job\/(w_\d{8}_\d{6}_[0-9a-f]{6})$/);
  if (m) return openJob(m[1]);
  job.id = null;
  return renderHome();
}

window.addEventListener('hashchange', route);
route();
