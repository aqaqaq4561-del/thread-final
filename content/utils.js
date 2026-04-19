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
 * <time> 요소에서 날짜 추출
 * datetime 속성이 있으면 우선 사용, 없으면 텍스트 기반 상대시간 변환
 */
function parsePostDate(timeElement) {
  // datetime 속성이 있으면 그대로 사용 (가장 정확)
  if (timeElement && timeElement.getAttribute('datetime')) {
    return timeElement.getAttribute('datetime');
  }

  // 텍스트 기반 상대시간 변환
  const text = timeElement?.textContent?.trim();
  if (!text) return 'unknown';

  const now = new Date();
  const match = text.match(/(\d+)\s*(s|m|h|d|w)/i);
  if (match) {
    const value = parseInt(match[1]);
    const unit = match[2].toLowerCase();
    const offsets = {
      s: 1000,
      m: 60000,
      h: 3600000,
      d: 86400000,
      w: 604800000
    };
    return new Date(now - value * offsets[unit]).toISOString();
  }

  // "Apr 14" 같은 포맷은 그대로 반환
  return text;
}

/**
 * 수집 데이터를 CSV 문자열로 변환
 * @param {Array} posts - 게시글 데이터 배열
 * @returns {string} CSV 문자열 (UTF-8 BOM 포함)
 */
function convertToCSV(posts) {
  const headers = ['계정ID', '글내용', '작성일시', '댓글수', '리포스트수', '공유수', '좋아요수', '조회수'];

  const rows = posts.map(p => [
    p.accountId,
    '"' + (p.content || '').replace(/"/g, '""').replace(/\n/g, ' ') + '"',
    p.date,
    p.comments,
    p.reposts,
    p.shares,
    p.likes,
    p.views || 0
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
 * 디바운스 함수
 */
function debounce(fn, delay) {
  let timer;
  return function (...args) {
    clearTimeout(timer);
    timer = setTimeout(() => fn.apply(this, args), delay);
  };
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
