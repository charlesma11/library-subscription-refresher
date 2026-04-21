const $ = (id) => document.getElementById(id);

async function load() {
  const { workerUrl = '', token = '' } = await chrome.storage.sync.get(['workerUrl', 'token']);
  $('workerUrl').value = workerUrl;
  $('token').value = token;
}

function setStatus(message, ok) {
  const el = $('status');
  el.textContent = message;
  el.style.color = ok ? '#0a7' : '#c00';
}

async function save() {
  const workerUrl = $('workerUrl').value.trim().replace(/\/$/, '');
  const token = $('token').value.trim();
  if (!workerUrl || !token) {
    setStatus('Both fields required.', false);
    return;
  }
  try {
    new URL(workerUrl);
  } catch {
    setStatus('Worker URL is not a valid URL.', false);
    return;
  }
  await chrome.storage.sync.set({ workerUrl, token });
  setStatus('Saved.', true);
}

document.addEventListener('DOMContentLoaded', load);
document.addEventListener('DOMContentLoaded', () => {
  $('save').addEventListener('click', save);
});
