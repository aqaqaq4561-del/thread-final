// ============================================
// Threads Data Collector — Popup Logic
// ============================================

document.addEventListener('DOMContentLoaded', () => {
  // --- DOM 요소 ---
  const btnStart = document.getElementById('btnStart');
  const btnStop = document.getElementById('btnStop');
  const btnDownload = document.getElementById('btnDownload');
  const btnDownloadHTML = document.getElementById('btnDownloadHTML');
  const downloadGroup = document.getElementById('downloadGroup');
  const btnDownloadMedia = document.getElementById('btnDownloadMedia');
  const btnRefresh = document.getElementById('btnRefresh');
  const statusCard = document.getElementById('status');
  const statusText = document.getElementById('statusText');
  const postCountEl = document.getElementById('postCount');
  const accountIdEl = document.getElementById('accountId');
  const pageInfoEl = document.getElementById('pageInfo');
  const errorMsgEl = document.getElementById('errorMsg');
  const errorTextEl = document.getElementById('errorText');

  // --- 초기 상태 확인 ---
  queryActiveTab((tab) => {
    if (!tab || !tab.url || !tab.url.includes('threads.com')) {
      showError('Threads 웹사이트(threads.com)에서 사용해주세요.');
      btnStart.disabled = true;
      btnStart.style.opacity = '0.5';
      return;
    }

    chrome.tabs.sendMessage(tab.id, { type: 'GET_STATUS' }, (res) => {
      if (chrome.runtime.lastError) {
        // content script가 아직 로드되지 않은 경우
        showError('페이지를 새로고침 후 다시 시도해주세요.');
        return;
      }

      if (res) {
        accountIdEl.textContent = res.accountId || '—';
        postCountEl.textContent = res.postCount || 0;

        if (!res.isProfilePage) {
          showError('Threads 프로필 페이지에서 실행해주세요.\n(예: threads.com/@username)');
          btnStart.disabled = true;
          btnStart.style.opacity = '0.5';
          return;
        }

        pageInfoEl.classList.remove('hidden');

        if (res.isCollecting) {
          updateUI('collecting', res.postCount);
        } else if (res.postCount > 0) {
          updateUI('complete', res.postCount);
        }
      }
    });
  });

  // --- 페이지 새로고침 ---
  btnRefresh.addEventListener('click', () => {
    queryActiveTab((tab) => {
      if (tab) chrome.tabs.reload(tab.id);
    });
  });

  // --- 수집 시작 ---
  btnStart.addEventListener('click', () => {
    hideError();
    queryActiveTab((tab) => {
      chrome.tabs.sendMessage(tab.id, { type: 'START_COLLECTION' }, (res) => {
        if (chrome.runtime.lastError) {
          showError('페이지와 연결할 수 없습니다. 새로고침 후 다시 시도해주세요.');
          return;
        }
        updateUI('collecting', 0);
      });
    });
  });

  // --- 수집 중지 ---
  btnStop.addEventListener('click', () => {
    queryActiveTab((tab) => {
      chrome.tabs.sendMessage(tab.id, { type: 'STOP_COLLECTION' }, (res) => {
        if (res) {
          updateUI('stopped', res.postCount || 0);
        }
      });
    });
  });

  // --- CSV 다운로드 ---
  btnDownload.addEventListener('click', () => {
    queryActiveTab((tab) => {
      chrome.tabs.sendMessage(tab.id, { type: 'DOWNLOAD_CSV' }, (res) => {
        if (res && res.success) {
          statusText.textContent = '📥 CSV 다운로드 완료!';
        }
      });
    });
  });

  // --- HTML 리포트 다운로드 ---
  btnDownloadHTML.addEventListener('click', () => {
    queryActiveTab((tab) => {
      chrome.tabs.sendMessage(tab.id, { type: 'DOWNLOAD_HTML' }, (res) => {
        if (res && res.success) {
          statusText.textContent = '📄 리포트 다운로드 완료!';
        }
      });
    });
  });

  // --- 미디어 다운로드 ---
  btnDownloadMedia.addEventListener('click', () => {
    queryActiveTab((tab) => {
      chrome.tabs.sendMessage(tab.id, { type: 'DOWNLOAD_MEDIA' }, (res) => {
        if (res && res.success) {
          statusText.textContent = `🖼️ 미디어 다운로드 시작!`;
        }
      });
    });
  });

  // --- 상태 업데이트 수신 ---
  chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    if (msg.type === 'STATUS_UPDATE') {
      statusText.textContent = msg.message;
      postCountEl.textContent = msg.postCount || 0;
      pageInfoEl.classList.remove('hidden');

      if (msg.accountId) {
        accountIdEl.textContent = msg.accountId;
      }

      if (msg.status === 'complete') {
        updateUI('complete', msg.postCount);
      } else if (msg.status === 'error') {
        updateUI('error', msg.postCount);
        showError(msg.message);
      } else if (msg.status === 'collecting') {
        statusCard.className = 'status-card collecting';
      }
    }
  });

  // ============================================
  // UI 업데이트 함수
  // ============================================

  function updateUI(state, count) {
    postCountEl.textContent = count || 0;
    pageInfoEl.classList.remove('hidden');

    switch (state) {
      case 'collecting':
        statusCard.className = 'status-card collecting';
        statusText.textContent = '🔄 수집 중...';
        btnStart.classList.add('hidden');
        btnStop.classList.remove('hidden');
        downloadGroup.classList.add('hidden');
        btnDownloadMedia.classList.add('hidden');
        break;

      case 'complete':
        statusCard.className = 'status-card complete';
        statusText.textContent = `✅ 수집 완료! (${count}개)`;
        btnStart.classList.remove('hidden');
        btnStart.textContent = '🔄 다시 수집';
        btnStop.classList.add('hidden');
        downloadGroup.classList.remove('hidden');
        btnDownloadMedia.classList.remove('hidden');
        break;

      case 'stopped':
        statusCard.className = 'status-card stopped';
        statusText.textContent = `⏸ 수집 중지됨 (${count}개)`;
        btnStart.classList.remove('hidden');
        btnStop.classList.add('hidden');
        if (count > 0) {
          downloadGroup.classList.remove('hidden');
          btnDownloadMedia.classList.remove('hidden');
        }
        break;

      case 'error':
        statusCard.className = 'status-card error';
        statusText.textContent = '⚠️ 오류 발생';
        btnStart.classList.remove('hidden');
        btnStop.classList.add('hidden');
        downloadGroup.classList.add('hidden');
        btnDownloadMedia.classList.add('hidden');
        break;

      default:
        statusCard.className = 'status-card idle';
        statusText.textContent = '대기 중';
        btnStart.classList.remove('hidden');
        btnStop.classList.add('hidden');
        downloadGroup.classList.add('hidden');
        btnDownloadMedia.classList.add('hidden');
    }
  }

  function showError(message) {
    errorMsgEl.classList.remove('hidden');
    errorTextEl.textContent = message;
  }

  function hideError() {
    errorMsgEl.classList.add('hidden');
    errorTextEl.textContent = '';
  }

  function queryActiveTab(callback) {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      callback(tabs[0] || null);
    });
  }
});
