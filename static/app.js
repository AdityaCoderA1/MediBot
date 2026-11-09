const $ = id => document.getElementById(id);
const WELCOME = $('messages').innerHTML;
let history = [], imageData = null, recorder = null, audioChunks = [], cameraStream = null, lastAnswer = '';

/* ---------- helpers ---------- */
const headers = () => {
  const h = {};
  const token = $('token').value.trim();
  if (token) h.Authorization = `Bearer ${token}`;
  return h;
};
const scrollDown = () => { $('messages').scrollTop = $('messages').scrollHeight; };

/* Safe mini-markdown renderer: builds DOM nodes, never uses innerHTML. */
function inline(parent, text) {
  text.split(/(\*\*[^*]+\*\*)/g).forEach(part => {
    if (/^\*\*[^*]+\*\*$/.test(part)) {
      const s = document.createElement('strong');
      s.textContent = part.slice(2, -2);
      parent.appendChild(s);
    } else if (part) {
      parent.appendChild(document.createTextNode(part.replace(/\*(?!\s)([^*]+)\*/g, '$1')));
    }
  });
}
function renderMarkdown(container, text) {
  container.textContent = '';
  let list = null, listType = null, para = [];
  const flushPara = () => {
    if (!para.length) return;
    const p = document.createElement('p');
    inline(p, para.join(' '));
    container.appendChild(p);
    para = [];
  };
  const endList = () => { list = null; listType = null; };
  text.replace(/\r/g, '').split('\n').forEach(raw => {
    const line = raw.trim();
    let m;
    if (!line) { flushPara(); endList(); return; }
    if ((m = line.match(/^#{1,6}\s+(.*)$/))) {
      flushPara(); endList();
      const h = document.createElement('h4');
      inline(h, m[1]);
      container.appendChild(h);
    } else if ((m = line.match(/^[-*•]\s+(.*)$/)) || (m = line.match(/^(\d+)[.)]\s+(.*)$/))) {
      flushPara();
      const type = /^\d/.test(line) ? 'ol' : 'ul';
      if (!list || listType !== type) {
        list = document.createElement(type);
        listType = type;
        container.appendChild(list);
      }
      const li = document.createElement('li');
      inline(li, m[m.length - 1]);
      list.appendChild(li);
    } else {
      endList();
      para.push(line);
    }
  });
  flushPara();
}

function addSources(bubble, sources) {
  if (!sources || !sources.length) return;
  const box = document.createElement('div');
  box.className = 'sources';
  const label = document.createElement('span');
  label.className = 'label';
  label.textContent = 'Sources';
  box.appendChild(label);
  sources.slice(0, 8).forEach(x => {
    const isPdf = x.type === 'pdf';
    const text = isPdf ? `PDF · page ${x.page}` : (x.title || x.url || 'Source');
    let el;
    if (!isPdf && /^https?:\/\//i.test(x.url || '')) {
      el = document.createElement('a');
      el.href = x.url; el.target = '_blank'; el.rel = 'noopener noreferrer';
    } else {
      el = document.createElement('span');
    }
    el.className = 'src';
    el.textContent = text;
    el.title = text;
    box.appendChild(el);
  });
  bubble.appendChild(box);
}

function addMessage(kind, { text = '', image = null, sources = [], typing = false } = {}) {
  const wrap = document.createElement('article');
  wrap.className = `msg ${kind}`;
  if (kind !== 'user') {
    const av = document.createElement('div');
    av.className = 'avatar'; av.textContent = '✚'; av.setAttribute('aria-hidden', 'true');
    wrap.appendChild(av);
  }
  const bubble = document.createElement('div');
  bubble.className = 'bubble';
  if (image) {
    const img = document.createElement('img');
    img.className = 'sent'; img.src = image; img.alt = 'Attached image';
    bubble.appendChild(img);
  }
  if (typing) {
    bubble.innerHTML = '<span class="typing"><i></i><i></i><i></i></span>';
  } else if (kind === 'bot') {
    const body = document.createElement('div');
    renderMarkdown(body, text);
    bubble.appendChild(body);
  } else {
    bubble.appendChild(document.createTextNode(text));
  }
  addSources(bubble, sources);
  wrap.appendChild(bubble);
  $('messages').appendChild(wrap);
  scrollDown();
  return { wrap, bubble };
}

/* ---------- health ---------- */
async function check() {
  try {
    const r = await fetch('/api/health');
    const d = await r.json();
    $('status').textContent = d.configured ? '● Connected' : '⚠ Configure API keys';
    $('status').className = 'status ' + (d.configured ? 'ok' : 'bad');
  } catch {
    $('status').textContent = '● Server offline';
    $('status').className = 'status bad';
  }
}
check();

/* ---------- theme ---------- */
function applyTheme(t) {
  document.documentElement.dataset.theme = t;
  $('theme').textContent = t === 'dark' ? '☀️' : '🌙';
  try { localStorage.setItem('medguide-theme', t); } catch {}
}
let saved = null;
try { saved = localStorage.getItem('medguide-theme'); } catch {}
applyTheme(saved || (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'));
$('theme').onclick = () => applyTheme(document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark');

/* ---------- image ---------- */
function setImage(file) {
  if (!file) return;
  if (!['image/png', 'image/jpeg', 'image/webp'].includes(file.type) || file.size > 5e6) {
    alert('Use PNG/JPEG/WebP under 5MB'); return;
  }
  const reader = new FileReader();
  reader.onload = () => {
    imageData = reader.result;
    $('thumbnail').src = imageData;
    $('preview').hidden = false;
  };
  reader.readAsDataURL(file);
}
$('image').addEventListener('change', e => setImage(e.target.files[0]));
$('remove').onclick = () => { imageData = null; $('preview').hidden = true; $('image').value = ''; };

/* ---------- composer ---------- */
const ta = $('message');
function autosize() {
  ta.style.height = 'auto';
  ta.style.height = Math.min(ta.scrollHeight, 160) + 'px';
  $('count').textContent = `${ta.value.length} / 4000`;
}
ta.addEventListener('input', autosize);
ta.addEventListener('keydown', e => {
  if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) {
    e.preventDefault();
    $('chatForm').requestSubmit();
  }
});
document.querySelectorAll('.chip').forEach(c => c.onclick = () => {
  ta.value = c.textContent; autosize(); $('chatForm').requestSubmit();
});

$('chatForm').addEventListener('submit', async e => {
  e.preventDefault();
  const message = ta.value.trim();
  if (!message) return;
  const prior = history.slice(-8);
  const sentImage = imageData;
  addMessage('user', { text: message, image: sentImage });
  ta.value = ''; autosize();
  $('chips').hidden = true;
  $('send').disabled = true;
  const pending = addMessage('bot', { typing: true });
  try {
    const r = await fetch('/api/chat', {
      method: 'POST',
      headers: { ...headers(), 'Content-Type': 'application/json' },
      body: JSON.stringify({ message, history: prior, image_data: sentImage })
    });
    const d = await r.json();
    if (!r.ok) throw new Error(d.detail || 'Request failed');
    pending.bubble.textContent = '';
    const body = document.createElement('div');
    renderMarkdown(body, d.answer);
    pending.bubble.appendChild(body);
    addSources(pending.bubble, d.sources);
    lastAnswer = d.answer;
    history.push({ role: 'user', content: message }, { role: 'assistant', content: d.answer });
    $('remove').click();
  } catch (err) {
    pending.wrap.classList.add('error');
    pending.bubble.textContent = 'Error: ' + err.message;
  } finally {
    $('send').disabled = false;
    scrollDown();
    ta.focus();
  }
});

$('clear').onclick = () => {
  history = []; lastAnswer = '';
  $('messages').innerHTML = WELCOME;
  $('chips').hidden = false;
  $('remove').click();
};

/* ---------- voice ---------- */
$('mic').onclick = async () => {
  if (recorder && recorder.state === 'recording') { recorder.stop(); return; }
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    audioChunks = [];
    recorder = new MediaRecorder(stream);
    recorder.ondataavailable = e => audioChunks.push(e.data);
    recorder.onstop = async () => {
      stream.getTracks().forEach(t => t.stop());
      $('mic').classList.remove('rec');
      $('mic').textContent = '🎤 Voice';
      const blob = new Blob(audioChunks, { type: recorder.mimeType });
      const data = new FormData();
      data.append('file', blob, 'voice.webm');
      $('mic').disabled = true;
      try {
        const r = await fetch('/api/transcribe', { method: 'POST', headers: headers(), body: data });
        const out = await r.json();
        if (!r.ok) throw Error(out.detail);
        ta.value = out.text; autosize();
      } catch (err) { alert(err.message); }
      finally { $('mic').disabled = false; }
    };
    recorder.start();
    $('mic').classList.add('rec');
    $('mic').textContent = '⏹ Stop recording';
  } catch (err) { alert('Microphone unavailable: ' + err.message); }
};

$('listen').onclick = () => {
  if (!lastAnswer) return alert('Ask a question first');

  if (!('speechSynthesis' in window)) {
    return alert('Text-to-speech is not supported by this browser.');
  }

  window.speechSynthesis.cancel();

  const utterance = new SpeechSynthesisUtterance(lastAnswer);

  utterance.lang = 'en-US';
  utterance.rate = 1;
  utterance.pitch = 1;

  $('listen').disabled = true;

  utterance.onend = () => {
    $('listen').disabled = false;
  };

  utterance.onerror = () => {
    $('listen').disabled = false;
    alert('Could not read the answer aloud.');
  };

  window.speechSynthesis.speak(utterance);
};

/* ---------- camera ---------- */
$('camera').onclick = async () => {
  try {
    cameraStream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
    $('video').srcObject = cameraStream;
    $('video').hidden = false;
    $('cameraActions').hidden = false;
  } catch (err) { alert('Camera unavailable: ' + err.message); }
};
$('closeCamera').onclick = () => {
  cameraStream?.getTracks().forEach(t => t.stop());
  cameraStream = null;
  $('video').hidden = true;
  $('cameraActions').hidden = true;
};
$('snap').onclick = () => {
  const v = $('video'), c = $('canvas');
  c.width = v.videoWidth; c.height = v.videoHeight;
  c.getContext('2d').drawImage(v, 0, 0);
  c.toBlob(b => setImage(new File([b], 'camera.jpg', { type: 'image/jpeg' })), 'image/jpeg', .85);
  $('closeCamera').click();
};