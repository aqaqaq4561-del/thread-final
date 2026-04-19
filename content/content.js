// ============================================
// Threads Data Collector — 메인 Content Script
// ============================================
// JSON 기반 데이터 추출 전용 (DOM 파싱 없음)
//
// 데이터 흐름:
// 1. 페이지 로드 → SSR <script> JSON에서 초기 게시글 추출
// 2. 자동 스크롤 → Threads API 호출 발생
// 3. injected.js가 API 응답을 가로채서 postMessage 전달
// 4. 이 스크립트가 메시지 수신 → parser.js로 JSON 파싱
// 5. 모든 게시글을 Map에 저장 (중복 제거)
// 6. 스크롤 완료 → injected.js에 조회수 요청 (same-origin fetch) ★
// 7. 조회수 반영 후 CSV 다운로드
// ============================================

(function () {
  'use strict';

  const parser = new ThreadsPostParser();
  const scroller = new AutoScroller({
    scrollDistance: 800,
    scrollDelay: 2000,
    maxScrollAttempts: 200,
    noNewContentLimit: 5
  });

  // 수집된 게시글 (postId → postData)
  const collectedPosts = new Map();
  let isCollecting = false;

  // 조회수 결과를 받기 위한 Promise resolve 함수
  let viewCountResolve = null;

  // ============================================
  // 1. injected.js로부터 메시지 수신
  // ============================================

  window.addEventListener('message', (event) => {
    if (event.data?.source !== 'threads-data-collector') return;

    switch (event.data.type) {
      // GraphQL API 응답 가로채기
      case 'TDC_FETCH_INTERCEPTED':
        handleInterceptedData(event.data.data);
        break;

      // 조회수 추출 진행 상황
      case 'TDC_VIEW_COUNT_PROGRESS':
        handleViewCountProgress(event.data);
        break;

      // 조회수 추출 완료 결과
      case 'TDC_VIEW_COUNTS_RESULT':
        handleViewCountsResult(event.data.viewCounts);
        break;
    }
  });

  function handleInterceptedData(data) {
    tdcLog('API 응답 가로채기 수신!');

    const posts = parser.extractFromAPIResponse(data);
    let newCount = 0;

    for (const post of posts) {
      const key = post.postId || `${post.date}_${post.content.substring(0, 50)}`;
      if (!collectedPosts.has(key)) {
        collectedPosts.set(key, post);
        newCount++;
      }
    }

    if (newCount > 0) {
      tdcLog(`API에서 새로 ${newCount}개 추가 (총 ${collectedPosts.size}개)`);
      sendStatus('collecting', `🔄 수집 중... ${collectedPosts.size}개 게시글`);
    }
  }

  function handleViewCountProgress(data) {
    sendStatus('collecting', `👁️ 조회수 추출 중... (${data.current}/${data.total})`);
  }

  function handleViewCountsResult(viewCounts) {
    tdcLog('조회수 결과 수신:', Object.keys(viewCounts).length, '개');

    let filled = 0;
    for (const [postId, viewCount] of Object.entries(viewCounts)) {
      if (collectedPosts.has(postId)) {
        const post = collectedPosts.get(postId);
        post.views = viewCount;
        collectedPosts.set(postId, post);
        if (viewCount > 0) filled++;
      }
    }

    tdcLog(`조회수 반영 완료: ${filled}개 성공`);

    // Promise resolve (fetchViewCounts의 await를 풀어줌)
    if (viewCountResolve) {
      viewCountResolve();
      viewCountResolve = null;
    }
  }

  // ============================================
  // 2. 수집 시작/중지
  // ============================================

  async function startCollection() {
    if (!isProfilePage()) {
      sendStatus('error', '⚠️ Threads 프로필 페이지에서 실행해주세요. (예: threads.com/@username)');
      return;
    }

    collectedPosts.clear();
    isCollecting = true;

    const accountId = getAccountId();
    tdcLog('=== JSON 기반 수집 시작 ===');
    tdcLog('대상 계정:', accountId);

    sendStatus('collecting', `🔄 SSR 데이터 추출 중...`);

    // Step 1: SSR 데이터에서 초기 게시글 추출
    const ssrPosts = parser.extractFromSSR();
    for (const post of ssrPosts) {
      const key = post.postId || `${post.date}_${post.content.substring(0, 50)}`;
      collectedPosts.set(key, post);
    }
    tdcLog(`SSR에서 ${ssrPosts.length}개 게시글 추출 완료`);
    sendStatus('collecting', `🔄 SSR: ${collectedPosts.size}개 → 스크롤 시작...`);

    // Step 2: 자동 스크롤 → injected.js가 추가 API 응답 캡처
    await scroller.start(
      () => collectedPosts.size,
      (attempts, count) => {
        sendStatus('collecting', `🔄 스크롤 ${attempts}회... ${collectedPosts.size}개 게시글`);
      },
      async (reason) => {
        const reasonText = {
          end_of_feed: '피드 끝 도달',
          max_attempts: '최대 스크롤 횟수 초과',
          stopped: '수동 중지'
        }[reason] || reason;

        tdcLog(`=== 스크롤 완료 === (${reasonText})`);
        tdcLog(`수집된 게시글: ${collectedPosts.size}개`);

        // Step 3: ★ 조회수 추출 (injected.js에 요청)
        sendStatus('collecting', `👁️ 조회수 추출 준비 중... (${collectedPosts.size}개 게시물)`);
        await fetchViewCounts();

        isCollecting = false;

        sendStatus('complete', `✅ 수집 완료! 총 ${collectedPosts.size}개 (${reasonText})`);

        chrome.runtime.sendMessage({
          type: 'COLLECTION_COMPLETE',
          data: Array.from(collectedPosts.values()),
          accountId: accountId,
          postCount: collectedPosts.size
        });
      }
    );
  }

  /**
   * ★ injected.js (MAIN world)에 조회수 추출 요청
   *
   * 왜 injected.js에서 하는가?
   * - MAIN world이므로 same-origin fetch 가능 (CORS 없음)
   * - 브라우저 쿠키가 자동 포함됨 (로그인 상태 유지)
   * - background.js Service Worker에서는 쿠키가 공유되지 않음!
   */
  function fetchViewCounts() {
    return new Promise((resolve) => {
      const posts = Array.from(collectedPosts.values());
      const postsWithCode = posts.filter(p => p.code);

      if (postsWithCode.length === 0) {
        tdcWarn('숏코드가 있는 게시물이 없어 조회수를 추출할 수 없습니다.');
        resolve();
        return;
      }

      tdcLog(`조회수 추출 요청: ${postsWithCode.length}개 게시물 → injected.js`);

      // resolve 함수를 저장 → handleViewCountsResult에서 호출
      viewCountResolve = resolve;

      // 타임아웃: 5분 이내에 응답이 없으면 강제 resolve
      setTimeout(() => {
        if (viewCountResolve) {
          tdcWarn('조회수 추출 타임아웃 (5분)');
          viewCountResolve = null;
          resolve();
        }
      }, 300000);

      // injected.js에 조회수 추출 요청
      window.postMessage({
        type: 'TDC_FETCH_VIEWS',
        source: 'threads-data-collector',
        posts: postsWithCode.map(p => ({ postId: p.postId, code: p.code }))
      }, '*');
    });
  }

  function stopCollection() {
    scroller.stop();
    isCollecting = false;
    tdcLog('수집 중지. 현재:', collectedPosts.size, '개');
  }

  // ============================================
  // 3. 유틸
  // ============================================

  function isProfilePage() {
    return /^\/@[\w.]+\/?$/.test(window.location.pathname);
  }

  function getAccountId() {
    const match = window.location.pathname.match(/\/@([^/?#]+)/);
    return match ? '@' + match[1] : 'unknown';
  }

  function sendStatus(status, message) {
    try {
      chrome.runtime.sendMessage({
        type: 'STATUS_UPDATE',
        status, message,
        postCount: collectedPosts.size,
        accountId: getAccountId()
      });
    } catch (e) { }
  }

  function triggerCSVDownload() {
    if (collectedPosts.size === 0) {
      tdcWarn('다운로드할 데이터 없음');
      return false;
    }
    const posts = Array.from(collectedPosts.values());
    const csv = convertToCSV(posts);
    const name = getAccountId().replace('@', '');
    const date = new Date().toISOString().slice(0, 10);
    downloadCSV(csv, `threads_${name}_${date}.csv`);
    tdcLog(`CSV 다운로드: ${posts.length}개 게시글`);
    return true;
  }

  // ============================================
  // 4. 메시지 리스너 (팝업 ↔ content)
  // ============================================

  chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    switch (msg.type) {
      case 'START_COLLECTION':
        startCollection();
        sendResponse({ success: true });
        break;
      case 'STOP_COLLECTION':
        stopCollection();
        sendResponse({ success: true, postCount: collectedPosts.size });
        break;
      case 'DOWNLOAD_CSV':
        sendResponse({ success: triggerCSVDownload(), postCount: collectedPosts.size });
        break;
      case 'GET_STATUS':
        sendResponse({
          isCollecting: isCollecting || scroller.isScrolling,
          postCount: collectedPosts.size,
          accountId: getAccountId(),
          isProfilePage: isProfilePage()
        });
        break;
    }
    return true;
  });

  // ============================================
  // 5. 초기화
  // ============================================
  tdcLog('Content script 로드:', window.location.href);
  tdcLog('모드: JSON 기반 (SSR + Fetch Interceptor + 조회수 Same-Origin Fetch)');
  if (isProfilePage()) {
    tdcLog('✅ 프로필 페이지 감지:', getAccountId());
  }

})();
