// ============================================
// Threads Data Collector — Injected Script
// ============================================
// world: "MAIN" 에서 실행 (페이지 컨텍스트)
// document_start 시점에 실행
//
// 역할 2가지:
// 1. fetch/XHR 후킹 → GraphQL 응답 중 thread_items 감지 → postMessage
// 2. 조회수 추출 → /t/{code} 페이지를 same-origin fetch → SSR HTML에서 view_count 파싱
// ============================================

(function () {
  'use strict';

  const INTERCEPTOR_ID = 'threads-data-collector';

  // ============================================
  // 1. Fetch/XHR 후킹 (GraphQL 응답 가로채기)
  // ============================================

  const originalFetch = window.fetch;

  window.fetch = async function (...args) {
    const response = await originalFetch.apply(this, args);

    try {
      const url = (typeof args[0] === 'string') ? args[0] : args[0]?.url || '';

      if (url.includes('/api/graphql') || url.includes('/graphql')) {
        const cloned = response.clone();
        cloned.text().then(text => {
          if (text && text.includes('thread_items')) {
            try {
              const json = JSON.parse(text);
              window.postMessage({
                type: 'TDC_FETCH_INTERCEPTED',
                source: INTERCEPTOR_ID,
                url: url,
                data: json
              }, '*');
            } catch (e) { }
          }
        }).catch(() => { });
      }
    } catch (e) { }

    return response;
  };

  const originalXHROpen = XMLHttpRequest.prototype.open;
  const originalXHRSend = XMLHttpRequest.prototype.send;

  XMLHttpRequest.prototype.open = function (method, url, ...rest) {
    this._tdc_url = url;
    return originalXHROpen.call(this, method, url, ...rest);
  };

  XMLHttpRequest.prototype.send = function (...args) {
    this.addEventListener('load', function () {
      try {
        const url = this._tdc_url || '';
        if (url.includes('/api/graphql') || url.includes('/graphql')) {
          const text = this.responseText;
          if (text && text.includes('thread_items')) {
            const json = JSON.parse(text);
            window.postMessage({
              type: 'TDC_FETCH_INTERCEPTED',
              source: INTERCEPTOR_ID,
              url: url,
              data: json
            }, '*');
          }
        }
      } catch (e) { }
    });
    return originalXHRSend.apply(this, args);
  };

  // ============================================
  // 2. 조회수 추출 (Same-Origin Fetch)
  // ============================================
  // content.js가 postMessage로 요청 → 여기서 fetch → 결과 반환
  // MAIN world이므로 쿠키가 자동 포함됨 (로그인 상태 유지)
  // Same-origin이므로 CORS 없음

  window.addEventListener('message', async (event) => {
    if (event.data?.type !== 'TDC_FETCH_VIEWS') return;
    if (event.data?.source !== INTERCEPTOR_ID) return;

    const posts = event.data.posts; // [{postId, code}, ...]
    console.log(`[TDC Injected] 조회수 추출 시작: ${posts.length}개 게시물`);

    const viewCounts = {};
    let successCount = 0;
    let failCount = 0;
    let doneCount = 0;

    // 개별 게시물 조회수 fetch
    async function fetchOne({ postId, code }) {
      if (!code) {
        viewCounts[postId] = 0;
        failCount++;
        return;
      }

      try {
        const url = `https://www.threads.com/t/${code}`;
        const resp = await originalFetch(url, {
          credentials: 'same-origin',
          headers: {
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
            'Accept-Language': 'ko-KR,ko;q=0.9,en-US;q=0.8,en;q=0.7'
          }
        });

        if (!resp.ok) {
          console.warn(`[TDC Injected] HTTP ${resp.status} — /t/${code}`);
          viewCounts[postId] = 0;
          failCount++;
        } else {
          const html = await resp.text();
          const viewCount = extractViewCount(html);
          viewCounts[postId] = viewCount;

          if (viewCount > 0) {
            console.log(`[TDC Injected] ✅ 조회수 ${viewCount.toLocaleString()} — /t/${code}`);
            successCount++;
          } else {
            console.warn(`[TDC Injected] ⚠️ 조회수 미발견 — /t/${code} (HTML length: ${html.length})`);
            debugViewPatterns(html, code);
            failCount++;
          }
        }
      } catch (e) {
        console.error(`[TDC Injected] fetch 오류:`, e);
        viewCounts[postId] = 0;
        failCount++;
      }

      doneCount++;
      window.postMessage({
        type: 'TDC_VIEW_COUNT_PROGRESS',
        source: INTERCEPTOR_ID,
        current: doneCount,
        total: posts.length,
        postId,
        viewCount: viewCounts[postId] || 0
      }, '*');
    }

    // 5개씩 병렬 처리, 배치 간 500ms 간격
    const BATCH_SIZE = 5;
    for (let i = 0; i < posts.length; i += BATCH_SIZE) {
      const batch = posts.slice(i, i + BATCH_SIZE);
      await Promise.all(batch.map(fetchOne));
      if (i + BATCH_SIZE < posts.length) {
        await new Promise(r => setTimeout(r, 500));
      }
    }

    console.log(`[TDC Injected] 조회수 추출 완료: 성공 ${successCount}, 실패 ${failCount}`);

    // 결과를 content.js에 전달
    window.postMessage({
      type: 'TDC_VIEW_COUNTS_RESULT',
      source: INTERCEPTOR_ID,
      viewCounts
    }, '*');
  });

  /**
   * SSR HTML에서 view_count 추출
   * 5가지 패턴 모두 대응 (우선순위 순)
   */
  function extractViewCount(html) {
    const patterns = [
      /"view_count"\s*:\s*(\d+)/,
      /"play_count"\s*:\s*(\d+)/,
      /"ig_play_count"\s*:\s*(\d+)/,
      /"impression_count"\s*:\s*(\d+)/,
      /"views"\s*:\s*\{\s*"count"\s*:\s*(\d+)/
    ];

    for (const pattern of patterns) {
      const match = html.match(pattern);
      if (match && parseInt(match[1]) > 0) {
        return parseInt(match[1]);
      }
    }

    return 0;
  }

  /**
   * 디버깅: HTML에서 view/play/impression 관련 텍스트를 검색해서 콘솔에 출력
   * 조회수를 못 찾았을 때만 호출됨
   */
  function debugViewPatterns(html, code) {
    const keywords = ['view_count', 'play_count', 'ig_play_count', 'impression_count', '"views"'];
    for (const kw of keywords) {
      const idx = html.indexOf(kw);
      if (idx !== -1) {
        console.log(`[TDC Debug] "${kw}" 발견 at ${idx} — /t/${code}:`);
        console.log(html.substring(Math.max(0, idx - 30), idx + 80));
      }
    }
    // view 관련 단어가 아예 없는 경우
    if (!keywords.some(kw => html.includes(kw))) {
      console.log(`[TDC Debug] /t/${code} — view 관련 키워드가 HTML에 전혀 없음 (HTML length: ${html.length})`);
      // 첫 번째 script[type=application/json] 내용 미리보기
      const scriptMatch = html.match(/<script[^>]*type="application\/json"[^>]*>([\s\S]*?)<\/script>/);
      if (scriptMatch) {
        console.log(`[TDC Debug] 첫 번째 JSON script (${scriptMatch[1].length}자):`, scriptMatch[1].substring(0, 300));
      }
    }
  }

  console.log('[TDC Injected] 초기화 완료 — GraphQL 감시 + 조회수 추출 대기 중');
})();
