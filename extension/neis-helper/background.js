importScripts('core.js');
chrome.action.onClicked.addListener(async tab => {
  if (!tab.id) return;
  try {
    if (!DamimNeis.allowed(tab.url)) throw new Error('나이스 HTTPS 화면 또는 담임노트 연습 화면에서 열어 주세요.');
    await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ['core.js', 'content.js'] });
    await chrome.action.setBadgeText({ tabId: tab.id, text: '' });
  } catch {
    // No page content, job data, tokens or URLs are logged.
    await chrome.action.setBadgeText({ tabId: tab.id, text: '!' });
    await chrome.action.setTitle({ tabId: tab.id, title: '나이스 HTTPS 화면 또는 담임노트 연습 화면에서 다시 열어 주세요. 이 화면은 지원하지 않습니다.' });
  }
});
