/*
 * Service worker của extension - chỉ làm một việc: khi content script trong tab
 * Discord nhắn "keep-tab-alive", đặt autoDiscardable = false cho tab đó để
 * "Trình tiết kiệm bộ nhớ" của Chrome không ngủ tab (ngủ là mất bot, phải tải lại).
 * Không cần quyền gì thêm: sender.tab.id có sẵn trong tin nhắn từ content script.
 */
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (!msg || msg.type !== 'keep-tab-alive' || !sender.tab || sender.tab.id == null) return;
  chrome.tabs.update(sender.tab.id, { autoDiscardable: false })
    .then(() => sendResponse({ ok: true }))
    .catch((err) => sendResponse({ ok: false, error: String(err) }));
  return true;   // trả lời bất đồng bộ
});
