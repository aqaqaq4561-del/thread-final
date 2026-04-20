// ============================================
// Threads Data Collector — 유틸리티 함수
// ============================================

/**
 * 축약 숫자를 실제 숫자로 변환
 * "1.2K" → 1200, "3.5M" → 3500000, "142" → 142, "" → 0
 * "1,234" → 1234
 */
function parseMetricNumber(text) {
  if (!text || text.trim() === '') return 0;
  text = text.trim().replace(/,/g, '');

  const multipliers = { 'K': 1000, 'M': 1000000, 'B': 1000000000 };
  const match = text.match(/^([\d.]+)\s*([KMB])?$/i);

  if (!match) return 0;
  const num = parseFloat(match[1]);
  const suffix = match[2] ? match[2].toUpperCase() : null;

  return suffix ? Math.round(num * multipliers[suffix]) : num;
}

/**
 * 수집 데이터를 CSV 문자열로 변환
 * @param {Array} posts - 게시글 데이터 배열
 * @returns {string} CSV 문자열 (UTF-8 BOM 포함)
 */
function convertToCSV(posts) {
  const headers = ['계정ID', '글내용', '작성일시', '댓글수', '리포스트수', '공유수', '좋아요수', '조회수', '이미지URL', '동영상URL'];

  const rows = posts.map(p => [
    p.accountId,
    '"' + (p.content || '').replace(/"/g, '""').replace(/\n/g, ' ') + '"',
    p.date,
    p.comments,
    p.reposts,
    p.shares,
    p.likes,
    p.views || 0,
    '"' + (p.imageURLs || []).join('|') + '"',
    '"' + (p.videoURLs || []).join('|') + '"'
  ]);

  // UTF-8 BOM 추가 (엑셀 한글 호환)
  return '\uFEFF' + [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
}

/**
 * CSV 파일 다운로드 트리거
 * @param {string} csvString - CSV 문자열
 * @param {string} filename - 파일명
 */
function downloadCSV(csvString, filename) {
  const a = document.createElement('a');
  a.href = 'data:text/csv;charset=utf-8,' + encodeURIComponent(csvString);
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
}

/**
 * 수집 데이터를 HTML 리포트 문자열로 변환
 * @param {Array} posts - 게시글 데이터 배열
 * @param {string} accountId - @username
 * @returns {string} 완성된 HTML 문자열
 */
function generateHTML(posts, accountId) {
  const collectedAt = new Date().toLocaleString('ko-KR');

  function escapeHTML(str) {
    return (str || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function formatNum(n) {
    return (n || 0).toLocaleString('ko-KR');
  }

  const postCards = posts.map(post => {
    const date = post.date
      ? new Date(post.date).toLocaleDateString('ko-KR', { year: 'numeric', month: 'long', day: 'numeric', weekday: 'short' })
      : '날짜 없음';

    const contentHTML = (post.content || '')
      ? `<div class="post-content">${escapeHTML(post.content).replace(/\n/g, '<br>')}</div>`
      : '';

    const mediaItems = [
      ...(post.imageURLs || []).map(url =>
        `<img src="${escapeHTML(url)}" loading="lazy" alt="이미지" onerror="this.style.display='none'">`),
      ...(post.videoURLs || []).map(url =>
        `<video src="${escapeHTML(url)}" controls preload="metadata"></video>`)
    ];
    const mediaHTML = mediaItems.length > 0
      ? `<div class="media-grid media-count-${Math.min(mediaItems.length, 4)}">${mediaItems.join('')}</div>`
      : '';

    return `<article class="post-card">
      <div class="post-header">
        <span class="post-date">📅 ${date}</span>
        <div class="post-stats">
          <span title="좋아요">👍 ${formatNum(post.likes)}</span>
          <span title="댓글">💬 ${formatNum(post.comments)}</span>
          <span title="리포스트">🔁 ${formatNum(post.reposts)}</span>
          <span title="공유">↗️ ${formatNum(post.shares)}</span>
          <span title="조회수">👁 ${formatNum(post.views)}</span>
        </div>
      </div>
      ${contentHTML}
      ${mediaHTML}
    </article>`;
  }).join('\n');

  return `<!DOCTYPE html>
<html lang="ko">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Threads Report — ${escapeHTML(accountId)}</title>
<style>
  *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
  body {
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
    background: #0f0f1a;
    color: #e4e6ea;
    font-size: 14px;
    line-height: 1.6;
  }
  .container { max-width: 720px; margin: 0 auto; padding: 32px 16px 64px; }

  /* 헤더 */
  .report-header {
    border-bottom: 1px solid rgba(255,255,255,0.08);
    padding-bottom: 20px;
    margin-bottom: 32px;
  }
  .report-header h1 {
    font-size: 24px;
    font-weight: 700;
    background: linear-gradient(135deg, #a78bfa, #818cf8);
    -webkit-background-clip: text;
    -webkit-text-fill-color: transparent;
    margin-bottom: 6px;
  }
  .report-header p { font-size: 12px; color: #6b7280; }

  /* 포스트 카드 */
  .post-card {
    background: rgba(255,255,255,0.03);
    border: 1px solid rgba(255,255,255,0.07);
    border-radius: 14px;
    padding: 18px 20px;
    margin-bottom: 16px;
    transition: border-color 0.2s;
  }
  .post-card:hover { border-color: rgba(167,139,250,0.3); }

  /* 포스트 헤더 */
  .post-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    flex-wrap: wrap;
    gap: 8px;
    margin-bottom: 12px;
  }
  .post-date { font-size: 12px; color: #9ca3af; }
  .post-stats {
    display: flex;
    gap: 12px;
    flex-wrap: wrap;
  }
  .post-stats span {
    font-size: 12px;
    color: #a78bfa;
    font-weight: 600;
    cursor: default;
  }

  /* 본문 */
  .post-content {
    color: #d1d5db;
    font-size: 14px;
    line-height: 1.7;
    white-space: pre-wrap;
    word-break: break-word;
    margin-bottom: 14px;
  }

  /* 미디어 그리드 */
  .media-grid {
    display: grid;
    gap: 6px;
    border-radius: 10px;
    overflow: hidden;
  }
  .media-count-1 { grid-template-columns: 1fr; }
  .media-count-2 { grid-template-columns: 1fr 1fr; }
  .media-count-3 { grid-template-columns: 1fr 1fr 1fr; }
  .media-count-4 { grid-template-columns: 1fr 1fr; }

  .media-grid img,
  .media-grid video {
    width: 100%;
    aspect-ratio: 1;
    object-fit: cover;
    border-radius: 8px;
    display: block;
    background: rgba(255,255,255,0.05);
  }
  .media-count-1 img,
  .media-count-1 video {
    aspect-ratio: 4/3;
    max-height: 480px;
    object-fit: contain;
    background: #000;
  }
</style>
</head>
<body>
<div class="container">
  <header class="report-header">
    <h1>${escapeHTML(accountId)}</h1>
    <p>수집일: ${collectedAt} &nbsp;|&nbsp; 총 ${posts.length.toLocaleString('ko-KR')}개 게시글</p>
  </header>
  <main>
    ${postCards}
  </main>
</div>
</body>
</html>`;
}

/**
 * 로그 유틸 (콘솔에 [TDC] 접두사 표시)
 */
function tdcLog(...args) {
  console.log('[Threads Data Collector]', ...args);
}

function tdcWarn(...args) {
  console.warn('[Threads Data Collector]', ...args);
}

function tdcError(...args) {
  console.error('[Threads Data Collector]', ...args);
}
