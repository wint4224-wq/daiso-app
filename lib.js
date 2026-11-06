/**
 * 폰 앱의 화면 없는 부분: GitHub 저장소 읽기·쓰기, 작업 파일 만들기, 진행 단계 판단.
 * 토큰은 폰의 브라우저에만 저장되고 GitHub API 로만 보낸다.
 */
export const MAX_PHOTOS = 15;
export const LONG_EDGE = 1600;

const pad = (n) => String(n).padStart(2, '0');
export const stampNow = (d = new Date()) => `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}_${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`;
export const humanNow = (d = new Date()) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
export const hex6 = () => [...crypto.getRandomValues(new Uint8Array(3))].map((b) => b.toString(16).padStart(2, '0')).join('');
export const jobDir = (id) => `data/jobs/${id}`;
export const tagsText = (tags) => (tags || []).map((t) => `#${t}`).join(' ');

/** 노트북의 createWork() 와 같은 모양의 작업 */
export function newWork(photos, now = new Date()) {
  const at = humanNow(now);
  return {
    id: `w_${stampNow(now)}_${hex6()}`,
    createdAt: at,
    updatedAt: at,
    source: 'phone',
    photos: photos.map((p) => ({ pid: p.pid, label: '', labelByUser: false, originalName: p.name || '', width: p.width, height: p.height, bytes: p.bytes, hadExif: false, hadGps: false })),
    extraction: null,
    products: [],
    format: 'single',
    keyword: '',
    keywordSuggestions: [],
    memo: '',
  };
}

/**
 * 지금 어느 단계인가.
 * 요청 파일이 남아 있으면 처리 중이다. Actions 는 요청 지우기와 결과 쓰기를 한 커밋으로 올린다.
 */
export function jobPhase({ work, status, reqs = [] }) {
  if (reqs.includes('generate')) return 'generating';
  if (reqs.includes('extract')) return 'extracting';
  if (status?.state === 'error') return 'error';
  if (status?.stage === 'generate' && status.draftId) return 'draft';
  if (work?.extraction) return 'ready';
  return 'extracting';
}

/** 상품 칸을 폰에서 고쳤을 때 (노트북 화면의 "직접 입력" 과 같게) */
export function editField(product, key, value) {
  const f = (product[key] ||= {});
  f.value = value;
  f.source = 'user';
  f.status = value.trim() ? '확인됨' : '확인 필요';
  return product;
}

/** 승인 전에 볼 검수 결과를 글로 */
export function reviewNotes(d) {
  const c = d.checks || {};
  const out = [];
  if (c.facts && !c.facts.ok) out.push(`입력값에 없는 숫자: ${(c.facts.unknown || []).map((u) => u.token).join(', ')}`);
  for (const i of d.review?.issues || []) out.push(`[${i.kind}] "${i.quote}" — ${i.problem}`);
  if (d.review?.failed) out.push('AI 검수를 하지 못했습니다');
  if (c.photos && !c.photos.ok) out.push('사진 배치를 확인해 주세요');
  for (const i of c.products?.items || []) if (!i.ok) out.push(`${i.label}: ${i.detail}`);
  for (const m of c.products?.misplaced || []) out.push(`${m.photo}번 사진이 다른 상품 자리에 들어갔습니다`);
  if (c.aiExperience?.count) out.push(`AI 가 지어낸 경험 ${c.aiExperience.count}곳 (미리보기의 노란 부분)`);
  return out;
}

export function errorText(status, detail = '') {
  const base =
    { 401: '토큰이 올바르지 않거나 만료됐어요. 설정에서 토큰을 확인해 주세요.', 403: '권한이 부족하거나 요청 한도를 넘었어요.', 404: '저장소를 찾을 수 없어요. 토큰의 저장소 범위를 확인해 주세요.' }[status] || 'GitHub 요청이 실패했어요.';
  return `${base} (HTTP ${status}${detail ? ` · ${detail}` : ''})`;
}

/** 저장소 접근 */
export function client({ owner, repo, token, api = 'https://api.github.com' }, fetchFn = (...a) => fetch(...a)) {
  const root = `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}`;
  const contentPath = (p) => `${root}/contents/${p.split('/').map(encodeURIComponent).join('/')}`;

  async function call(path, { method = 'GET', body, raw = false } = {}) {
    const headers = { Authorization: `Bearer ${token}`, 'X-GitHub-Api-Version': '2022-11-28', Accept: raw ? 'application/vnd.github.raw' : 'application/vnd.github+json' };
    const init = { method, headers, cache: 'no-store' };
    if (body !== undefined) {
      headers['Content-Type'] = 'application/json';
      init.body = JSON.stringify(body);
    }
    try {
      return await fetchFn(api + path, init);
    } catch {
      throw new Error('GitHub 에 연결할 수 없어요. 인터넷 연결을 확인해 주세요.');
    }
  }
  async function fail(res) {
    const j = await res.json().catch(() => null);
    return new Error(errorText(res.status, j?.message));
  }
  async function json(path, opt) {
    const res = await call(path, opt);
    if (!res.ok) throw await fail(res);
    return res.json();
  }
  /** 없는 파일은 null */
  async function raw(path) {
    const res = await call(contentPath(path), { raw: true });
    if (res.status === 404) return null;
    if (!res.ok) throw await fail(res);
    return res;
  }

  return {
    check: () => json(root),
    async readJson(path) {
      const res = await raw(path);
      return res ? res.json() : null;
    },
    async readBlob(path) {
      const res = await raw(path);
      return res ? res.blob() : null;
    },
    /** 폴더 안 이름들. 없는 폴더는 [] */
    async list(path) {
      const res = await call(contentPath(path));
      if (res.status === 404) return [];
      if (!res.ok) throw await fail(res);
      return (await res.json()).map((e) => e.name);
    },
    /**
     * 여러 파일을 커밋 하나로 올린다 (Actions 가 한 번만 돌도록).
     * files: [{path, text} | {path, base64}]. 그사이 Actions 가 먼저 올렸으면 최신 위에 다시 시도한다.
     */
    async commit(message, files, { onProgress = () => {}, deletes = [] } = {}) {
      const entries = deletes.map((path) => ({ path, mode: '100644', type: 'blob', sha: null }));
      let done = 0;
      const queue = [...files];
      const worker = async () => {
        for (let f = queue.shift(); f; f = queue.shift()) {
          const blob = await json(`${root}/git/blobs`, { method: 'POST', body: f.base64 ? { content: f.base64, encoding: 'base64' } : { content: f.text, encoding: 'utf-8' } });
          entries.push({ path: f.path, mode: '100644', type: 'blob', sha: blob.sha });
          onProgress(++done, files.length);
        }
      };
      await Promise.all([worker(), worker(), worker()]);
      for (let attempt = 0; ; attempt++) {
        const ref = await json(`${root}/git/ref/heads/main`);
        const head = ref.object.sha;
        const base = await json(`${root}/git/commits/${head}`);
        const tree = await json(`${root}/git/trees`, { method: 'POST', body: { base_tree: base.tree.sha, tree: entries } });
        const commit = await json(`${root}/git/commits`, { method: 'POST', body: { message, tree: tree.sha, parents: [head] } });
        const res = await call(`${root}/git/refs/heads/main`, { method: 'PATCH', body: { sha: commit.sha } });
        if (res.ok) return commit.sha;
        if (attempt >= 3 || ![409, 422].includes(res.status)) throw await fail(res);
        await new Promise((r) => setTimeout(r, 800 * (attempt + 1)));
      }
    },
  };
}
