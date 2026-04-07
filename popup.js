const statusIcon = document.getElementById('statusIcon');
const statusText = document.getElementById('statusText');
const actions = document.getElementById('actions');
const notLinkedIn = document.getElementById('notLinkedIn');
const toggleBtn = document.getElementById('togglePanel');
chrome.tabs.query({ active: true, currentWindow: true }, ([tab]) => {
  if (!tab?.url?.includes('linkedin.com/mynetwork/invite-connect/connections')) {
    statusIcon.className = 'status-icon inactive';
    statusText.textContent = 'Not on connections page';
    notLinkedIn.style.display = 'block';
    return;
  }
  statusIcon.className = 'status-icon active';
  statusText.textContent = 'Ready on connections page';
  actions.style.display = 'block';
  chrome.scripting.executeScript({ target: { tabId: tab.id }, func: () => !!document.getElementById('lcr-panel') }, ([result]) => {
    toggleBtn.textContent = result?.result ? 'Close Selection Panel' : 'Open Selection Panel';
  });
  toggleBtn.addEventListener('click', () => {
    chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: () => {
        const panel = document.getElementById('lcr-panel');
        if (panel) { panel.remove(); return false; }
        if (typeof window.lcrInit === 'function') { window.lcrInit(); return true; }
        return false;
      }
    }, ([result]) => {
      toggleBtn.textContent = result?.result ? 'Close Selection Panel' : 'Open Selection Panel';
      if (result?.result) window.close();
    });
  });
});
