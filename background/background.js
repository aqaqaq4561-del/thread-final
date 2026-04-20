// ============================================
// Threads Data Collector — Background Service Worker
// ============================================
//
// 역할:
// 1. 수집 완료 데이터를 chrome.storage에 저장
// 2. 팝업과 content script 간 메시지 중계
// 3. 저장된 데이터 조회
//
// ★ 조회수 추출은 injected.js (MAIN world)에서 수행
//   (Service Worker에서는 threads.com 쿠키에 접근 불가)
// ============================================

// --- 메시지 리스너 ---
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  switch (msg.type) {
    case 'COLLECTION_COMPLETE':
      handleCollectionComplete(msg);
      sendResponse({ success: true });
      break;

    case 'DOWNLOAD_MEDIA':
      handleMediaDownload(msg);
      sendResponse({ success: true, count: msg.mediaItems.length });
      break;

    case 'STATUS_UPDATE':
      // 상태 업데이트는 직접 팝업에 전달됨 (별도 처리 불요)
      break;

    case 'GET_SAVED_DATA':
      handleGetSavedData(msg.accountId, sendResponse);
      return true; // 비동기 응답

    case 'GET_ALL_ACCOUNTS':
      handleGetAllAccounts(sendResponse);
      return true; // 비동기 응답

    case 'CLEAR_DATA':
      handleClearData(msg.accountId, sendResponse);
      return true; // 비동기 응답
  }

  return true;
});

/**
 * 수집 완료 데이터 저장
 */
function handleCollectionComplete(msg) {
  const storageKey = `data_${msg.accountId}`;
  const record = {
    accountId: msg.accountId,
    posts: msg.data,
    postCount: msg.data.length,
    collectedAt: new Date().toISOString()
  };

  chrome.storage.local.set({ [storageKey]: record }, () => {
    console.log(`[TDC Background] 저장 완료: ${msg.accountId} (${msg.data.length}개 게시글)`);
  });

  // 수집 이력 업데이트
  chrome.storage.local.get('collection_history', (result) => {
    const history = result.collection_history || [];
    history.unshift({
      accountId: msg.accountId,
      postCount: msg.data.length,
      timestamp: new Date().toISOString()
    });
    // 최근 50개 이력만 유지
    chrome.storage.local.set({
      collection_history: history.slice(0, 50)
    });
  });
}

/**
 * 미디어 파일 일괄 다운로드 (게시글별 서브폴더)
 *
 * 폴더 구조:
 *   threads_{account}_{date}/
 *     001_{postId}/
 *       info.txt   ← 게시글 내용 + 통계
 *       img1.jpg, vid1.mp4 ...
 *     002_{postId}/
 *       ...
 */
async function handleMediaDownload({ posts, folder }) {
  console.log(`[TDC Background] 미디어 다운로드 시작: ${posts.length}개 게시글 → ${folder}/`);

  for (let i = 0; i < posts.length; i++) {
    const post = posts[i];
    const index = String(i + 1).padStart(3, '0');
    const postFolder = `${folder}/${index}_${post.postId}`;

    // info.txt — 게시글 내용 + 통계
    const infoText = [
      `계정: ${post.accountId}`,
      `날짜: ${post.date}`,
      ``,
      `${post.content || '(내용 없음)'}`,
      ``,
      `좋아요: ${post.likes ?? 0}`,
      `댓글: ${post.comments ?? 0}`,
      `리포스트: ${post.reposts ?? 0}`,
      `공유: ${post.shares ?? 0}`,
      `조회수: ${post.views ?? 0}`,
    ].join('\n');

    chrome.downloads.download({
      url: 'data:text/plain;charset=utf-8,' + encodeURIComponent(infoText),
      filename: `${postFolder}/info.txt`,
      conflictAction: 'uniquify'
    });

    // 이미지
    (post.imageURLs || []).forEach((url, j) => {
      chrome.downloads.download({
        url,
        filename: `${postFolder}/img${j + 1}.jpg`,
        conflictAction: 'uniquify'
      });
    });

    // 동영상
    (post.videoURLs || []).forEach((url, j) => {
      chrome.downloads.download({
        url,
        filename: `${postFolder}/vid${j + 1}.mp4`,
        conflictAction: 'uniquify'
      });
    });

    // 게시글 간 간격 (레이트리밋 방지)
    if (i < posts.length - 1) {
      await new Promise(r => setTimeout(r, 300));
    }
  }

  console.log(`[TDC Background] 미디어 다운로드 완료`);
}

/**
 * 저장된 데이터 조회
 */
function handleGetSavedData(accountId, sendResponse) {
  const storageKey = `data_${accountId}`;
  chrome.storage.local.get(storageKey, (result) => {
    sendResponse(result[storageKey] || null);
  });
}

/**
 * 저장된 모든 계정 목록 조회
 */
function handleGetAllAccounts(sendResponse) {
  chrome.storage.local.get('collection_history', (result) => {
    sendResponse(result.collection_history || []);
  });
}

/**
 * 특정 계정 데이터 삭제
 */
function handleClearData(accountId, sendResponse) {
  const storageKey = `data_${accountId}`;
  chrome.storage.local.remove(storageKey, () => {
    console.log(`[TDC Background] 데이터 삭제: ${accountId}`);
    sendResponse({ success: true });
  });
}

// --- 확장프로그램 설치/업데이트 시 ---
chrome.runtime.onInstalled.addListener((details) => {
  console.log('[TDC Background] 확장프로그램 설치/업데이트:', details.reason);
});
