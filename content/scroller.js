// ============================================
// Threads Data Collector — 자동 스크롤
// ============================================
// 스크롤만 담당. 데이터 추출은 interceptor가 가로챈
// API 응답 JSON에서 parser가 처리한다.
// ============================================

class AutoScroller {

  constructor(options = {}) {
    this.isScrolling = false;
    this.scrollDistance = options.scrollDistance || 800;
    this.scrollDelay = options.scrollDelay || 2000;
    this.maxScrollAttempts = options.maxScrollAttempts || 200;
    this.noNewContentLimit = options.noNewContentLimit || 5;

    this._noNewContentCount = 0;
    this._attempts = 0;
    this._lastInterceptCount = 0;
  }

  /**
   * 자동 스크롤 시작
   * @param {Function} getPostCount - 현재까지 수집된 게시글 수를 반환하는 함수
   * @param {Function} onProgress - 진행 콜백 (attempts, postCount)
   * @param {Function} onComplete - 완료 콜백 (reason)
   */
  async start(getPostCount, onProgress, onComplete) {
    if (this.isScrolling) {
      tdcWarn('AutoScroller: 이미 스크롤 중');
      return;
    }

    this.isScrolling = true;
    this._noNewContentCount = 0;
    this._attempts = 0;
    this._lastInterceptCount = getPostCount();

    tdcLog('AutoScroller: 시작');

    while (this.isScrolling && this._attempts < this.maxScrollAttempts) {
      // 스크롤
      window.scrollBy({ top: this.scrollDistance, behavior: 'smooth' });

      // API 응답 대기 (스크롤 후 서버 응답이 올 시간)
      await this._sleep(this.scrollDelay);
      this._attempts++;

      // 새 데이터가 intercept되었는지 확인
      const currentCount = getPostCount();

      if (currentCount > this._lastInterceptCount) {
        this._noNewContentCount = 0;
        tdcLog(`AutoScroller: 새 데이터 감지 (${this._lastInterceptCount} → ${currentCount})`);
      } else {
        this._noNewContentCount++;
        tdcLog(`AutoScroller: 새 데이터 없음 (${this._noNewContentCount}/${this.noNewContentLimit})`);
      }

      this._lastInterceptCount = currentCount;

      if (onProgress) onProgress(this._attempts, currentCount);

      // 종료 조건
      if (this._noNewContentCount >= this.noNewContentLimit) {
        tdcLog('AutoScroller: 피드 끝 도달');
        break;
      }
    }

    const reason = this._noNewContentCount >= this.noNewContentLimit
      ? 'end_of_feed'
      : this._attempts >= this.maxScrollAttempts
        ? 'max_attempts'
        : 'stopped';

    this.isScrolling = false;
    tdcLog(`AutoScroller: 완료 (${reason}), 총 스크롤: ${this._attempts}회`);

    if (onComplete) onComplete(reason);
  }

  stop() {
    tdcLog('AutoScroller: 수동 중지');
    this.isScrolling = false;
  }

  _sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}
