// ============================================
// Threads Data Collector — JSON 파서 (SSR + API)
// ============================================
// DOM을 절대 사용하지 않음.
// SSR <script type="application/json"> 또는
// 가로챈 GraphQL API 응답 JSON에서 재귀적으로
// thread_items → post 객체를 찾아 데이터를 추출한다.
// ============================================

class ThreadsPostParser {

  constructor() {
    this.targetAccountId = this._getAccountIdFromURL();
    tdcLog('Parser 초기화. 대상 계정:', this.targetAccountId);
  }

  // ============================================
  // 공개 메서드
  // ============================================

  /**
   * SSR 데이터에서 초기 게시글 추출
   * 페이지 최초 로드 시 <script type="application/json">에 담긴 데이터
   */
  extractFromSSR() {
    const scripts = document.querySelectorAll('script[type="application/json"]');
    let targetScript = null;

    for (const s of scripts) {
      const text = s.textContent;
      if (text.includes('thread_items') && text.includes('BarcelonaProfileThreadsTab')) {
        targetScript = s;
        break;
      }
    }

    if (!targetScript) {
      tdcWarn('SSR 데이터를 찾을 수 없습니다.');
      return [];
    }

    try {
      const raw = JSON.parse(targetScript.textContent);
      const posts = this._extractThreadItems(raw);
      tdcLog(`SSR에서 ${posts.length}개 게시글 추출 완료`);
      return posts;
    } catch (e) {
      tdcError('SSR JSON 파싱 실패:', e);
      return [];
    }
  }

  /**
   * 가로챈 API 응답 JSON에서 게시글 추출
   * interceptor.js가 postMessage로 전달한 데이터
   */
  extractFromAPIResponse(json) {
    try {
      const posts = this._extractThreadItems(json);
      tdcLog(`API 응답에서 ${posts.length}개 게시글 추출`);
      return posts;
    } catch (e) {
      tdcError('API 응답 파싱 실패:', e);
      return [];
    }
  }

  // ============================================
  // Private — 재귀적 데이터 탐색
  // ============================================

  /**
   * 객체 트리를 재귀 탐색하여 thread_items를 모두 찾아낸다
   */
  _extractThreadItems(obj) {
    const posts = [];
    this._findThreadItems(obj, posts, 0);
    return posts;
  }

  /**
   * 재귀 탐색 — thread_items 배열을 발견하면 각 post를 파싱
   * maxDepth로 무한 재귀 방지
   */
  _findThreadItems(obj, results, depth) {
    if (!obj || typeof obj !== 'object' || depth > 20) return;

    // 배열인 경우 각 요소 탐색
    if (Array.isArray(obj)) {
      for (const item of obj) {
        this._findThreadItems(item, results, depth + 1);
      }
      return;
    }

    // thread_items 배열 발견!
    if (obj.thread_items && Array.isArray(obj.thread_items)) {
      for (const threadItem of obj.thread_items) {
        if (threadItem.post) {
          const parsed = this._parsePost(threadItem.post);
          if (parsed) results.push(parsed);
        }
      }
      // 이 노드의 하위는 더 탐색하지 않음 (중복 방지)
      return;
    }

    // 하위 키 재귀 탐색
    for (const key of Object.keys(obj)) {
      this._findThreadItems(obj[key], results, depth + 1);
    }
  }

  /**
   * 개별 post 객체에서 필요한 필드 추출
   *
   * Meta/Instagram 계열 API의 일반적인 필드명:
   * - pk: 게시글 고유 ID
   * - code: 숏코드 (게시물 URL /t/{code} 에 사용)
   * - user.username: 작성자
   * - caption.text: 글 내용
   * - taken_at: Unix timestamp (초 단위)
   * - like_count: 좋아요 수
   * - text_post_app_info.direct_reply_count: 댓글/답글 수
   * - text_post_app_info.repost_count: 리포스트 수
   * - text_post_app_info.quote_count: 인용(공유) 수
   * - text_post_app_info.share_info.*: 대안 경로
   *
   * ★ view_count는 프로필 피드 GraphQL에 포함되지 않음!
   *    → code(숏코드)를 저장해두고, background.js에서
   *      개별 페이지 fetch로 view_count를 별도 추출한다.
   */
  _parsePost(post) {
    try {
      const info = post.text_post_app_info || {};
      const shareInfo = info.share_info || {};

      const media = this._extractMediaURLs(post);

      const data = {
        postId: String(post.pk || post.id || ''),
        code: post.code || '',  // ★ 숏코드 (조회수 추출에 필수)
        accountId: post.user?.username
          ? '@' + post.user.username
          : this.targetAccountId,
        content: post.caption?.text || '',
        date: post.taken_at
          ? new Date(post.taken_at * 1000).toISOString()
          : '',
        comments: info.direct_reply_count
          ?? post.comment_count
          ?? 0,
        reposts: info.repost_count
          ?? shareInfo.repost_count
          ?? 0,
        shares: post.share_count
          ?? info.share_count
          ?? shareInfo.share_count
          ?? info.quote_count
          ?? shareInfo.quote_count
          ?? 0,
        likes: post.like_count ?? 0,
        views: 0,  // ★ 조회수: 나중에 background.js가 채워줌
        imageURLs: media.imageURLs,
        videoURLs: media.videoURLs,
      };

      tdcLog('파싱된 게시글:', {
        id: data.postId,
        code: data.code,
        account: data.accountId,
        preview: data.content.substring(0, 40),
        date: data.date,
        comments: data.comments,
        reposts: data.reposts,
        shares: data.shares,
        likes: data.likes
      });

      return data;
    } catch (e) {
      tdcError('개별 post 파싱 오류:', e);
      tdcLog('문제의 post 객체 키:', Object.keys(post));
      return null;
    }
  }

  // ============================================
  // Private — 미디어 URL 추출
  // ============================================

  /**
   * post 객체에서 이미지/동영상 URL 추출
   * - 단일 미디어: image_versions2, video_versions
   * - 캐러셀(다중): carousel_media[] 내 각 항목
   */
  _extractMediaURLs(post) {
    const imageURLs = [];
    const videoURLs = [];

    if (post.carousel_media && Array.isArray(post.carousel_media)) {
      for (const item of post.carousel_media) {
        this._extractSingleMedia(item, imageURLs, videoURLs);
      }
    } else {
      this._extractSingleMedia(post, imageURLs, videoURLs);
    }

    return { imageURLs, videoURLs };
  }

  /**
   * 단일 미디어 객체에서 최고 해상도 URL 추출
   * 동영상이 있으면 videoURLs에, 이미지는 imageURLs에 추가
   */
  _extractSingleMedia(mediaObj, imageURLs, videoURLs) {
    if (mediaObj.video_versions && mediaObj.video_versions.length > 0) {
      const best = this._getBestCandidate(mediaObj.video_versions);
      if (best) videoURLs.push(best);
    }

    if (mediaObj.image_versions2?.candidates?.length > 0) {
      const best = this._getBestCandidate(mediaObj.image_versions2.candidates);
      if (best) imageURLs.push(best);
    }
  }

  /**
   * 후보 배열에서 최고 해상도 URL 선택
   */
  _getBestCandidate(candidates) {
    if (!candidates || candidates.length === 0) return null;
    const sorted = [...candidates].sort((a, b) =>
      (b.width * b.height) - (a.width * a.height)
    );
    return sorted[0].url;
  }

  /**
   * URL에서 계정 ID 추출
   */
  _getAccountIdFromURL() {
    const match = window.location.pathname.match(/\/@([^/?#]+)/);
    return match ? '@' + match[1] : 'unknown';
  }
}
