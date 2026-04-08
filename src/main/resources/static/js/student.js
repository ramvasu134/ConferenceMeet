/* ============================================================
   Air – Student Dashboard Controller v2
   Polls teacher broadcast, plays filtered audio,
   records doubt clips with full voice processing pipeline,
   auto-saves clips locally, shows speaking indicator
   ============================================================ */

const studentId   = document.getElementById('studentId')?.value;
const studentName = document.getElementById('studentName')?.value;

let meetingActive  = false;
let currentMeetingId = null;
let lastChunkIndex = -1;
let pollTimer      = null;
let listenTimer    = null;
let listenSeconds  = 0;
let isSpeakerOn    = true;
let isRecordingDoubt = false;
let doubtProcessor = null;
let rawMicStream   = null;
let audioQueue     = [];
let isPlaying      = false;
let doubtStartTime = 0;
let doubtClipCounter = 0;

// ===== BOOT =====
document.addEventListener('DOMContentLoaded', () => {
    wireEvents();
    startPolling();
    loadDoubts();
});

// ===== UTILS =====
const $ = id => document.getElementById(id);
const $$ = sel => document.querySelectorAll(sel);
function toast(msg, type='') {
    const t = $('toast'); t.textContent = msg; t.className = 'toast show ' + type;
    setTimeout(() => t.classList.remove('show'), 3000);
}
function escHtml(t) { const d = document.createElement('div'); d.textContent = t; return d.innerHTML; }
function fmtDur(s) { if (!s) return '0:00'; return Math.floor(s/60) + ':' + String(s%60).padStart(2,'0'); }
function ts() { return new Date().toISOString().replace(/[:.]/g,'-').slice(0,19); }

// ===== WIRE EVENTS =====
function wireEvents() {
    $$('.tab-btn').forEach(b => b.onclick = () => {
        $$('.tab-btn').forEach(x => x.classList.toggle('active', x === b));
        $$('.tab-pane').forEach(p => p.classList.toggle('active', p.id === b.dataset.tab));
        if (b.dataset.tab === 'doubts-tab') loadDoubts();
    });

    $('btnSpeakerToggle').onclick = toggleSpeaker;
    $('btnAskDoubt').onclick = toggleDoubtRecording;
    $('btnSendDoubt').onclick = sendDoubt;
    $('btnLogout').onclick = logout;
    $('btnRefreshDoubts').onclick = loadDoubts;
}

// ===== BROADCAST POLLING =====
function startPolling() {
    pollBroadcast();
    pollTimer = setInterval(pollBroadcast, 2000);
}

async function pollBroadcast() {
    try {
        const res = await fetch(`/api/student/broadcast/poll?afterChunk=${lastChunkIndex}`);
        if (!res.ok) return;
        const data = await res.json();

        if (data.active && !meetingActive) {
            meetingActive = true;
            currentMeetingId = data.meetingId;
            listenSeconds = 0;
            startListenTimer();
            updateListenUI(true);
        } else if (!data.active && meetingActive) {
            meetingActive = false;
            currentMeetingId = null;
            stopListenTimer();
            updateListenUI(false);
            lastChunkIndex = -1;
        }

        if (data.active) currentMeetingId = data.meetingId;

        if (data.chunks && data.chunks.length > 0) {
            for (const chunk of data.chunks) {
                audioQueue.push(chunk.id);
                if (chunk.chunkIndex > lastChunkIndex) lastChunkIndex = chunk.chunkIndex;
            }
            playNextChunk();
        }
    } catch (e) { console.error('Poll error:', e); }
}

// ===== PLAY BROADCAST CHUNKS =====
async function playNextChunk() {
    if (isPlaying || audioQueue.length === 0 || !isSpeakerOn) return;
    isPlaying = true;
    const chunkId = audioQueue.shift();
    try {
        const audio = new Audio(`/api/student/broadcast/chunk/${chunkId}`);
        audio.volume = isSpeakerOn ? 1.0 : 0;
        audio.onplay = () => {
            $('broadcastLabel').textContent = '🔊 Receiving teacher audio…';
            $('broadcastLabel').style.color = '#2ecc71';
        };
        audio.onended = () => { isPlaying = false; playNextChunk(); };
        audio.onerror = () => { isPlaying = false; playNextChunk(); };
        await audio.play();
    } catch (e) { console.error('Playback error:', e); isPlaying = false; playNextChunk(); }
}

// ===== LISTEN TIMER =====
function startListenTimer() {
    stopListenTimer();
    listenTimer = setInterval(() => {
        listenSeconds++;
        const h = String(Math.floor(listenSeconds / 3600)).padStart(2, '0');
        const m = String(Math.floor((listenSeconds % 3600) / 60)).padStart(2, '0');
        const s = String(listenSeconds % 60).padStart(2, '0');
        $('timerDisplay').textContent = `${h}:${m}:${s}`;
    }, 1000);
}
function stopListenTimer() { if (listenTimer) { clearInterval(listenTimer); listenTimer = null; } }

function updateListenUI(active) {
    const dot = $('recDot'), badge = $('connBadge'), banner = $('listenBanner');
    if (active) {
        dot.classList.add('recording');
        badge.textContent = '🟢 Live'; badge.style.color = '#2ecc71';
        banner.innerHTML = '<span style="color:#2ecc71;font-weight:600">🟢 Meeting is live — Listening to teacher</span>';
        banner.classList.add('live');
        $('broadcastLabel').textContent = '🔊 Listening…';
        $('broadcastLabel').style.color = '#2ecc71';
    } else {
        dot.classList.remove('recording');
        badge.textContent = 'Offline'; badge.style.color = '#e63946';
        banner.innerHTML = '<span class="banner-idle">⏳ Waiting for teacher to start a meeting…</span>';
        banner.classList.remove('live');
        $('timerDisplay').textContent = '00:00:00';
        $('broadcastLabel').textContent = '🔇 No broadcast';
        $('broadcastLabel').style.color = '#888';
    }
}

// ===== SPEAKER TOGGLE =====
function toggleSpeaker() {
    isSpeakerOn = !isSpeakerOn;
    $('btnSpeakerToggle').querySelector('.ctrl-icon').textContent = isSpeakerOn ? '🔊' : '🔇';
    $('btnSpeakerToggle').classList.toggle('off', !isSpeakerOn);
    if (isSpeakerOn) playNextChunk();
    toast(isSpeakerOn ? 'Speaker ON' : 'Speaker muted', 'success');
}

// ================= DOUBT RECORDING (with voice filters + auto-save) =================

async function toggleDoubtRecording() {
    if (isRecordingDoubt) stopDoubtRecording();
    else await startDoubtRecording();
}

async function startDoubtRecording() {
    try {
        rawMicStream = await navigator.mediaDevices.getUserMedia({
            audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true,
                     sampleRate: 48000, channelCount: 1 }
        });

        doubtProcessor = new AudioProcessor();
        await doubtProcessor.init(rawMicStream);

        // VAD callbacks — show/hide speaking indicator, update mute icon
        doubtProcessor.onSpeaking = () => {
            if ($('speakingIndicator')) $('speakingIndicator').classList.add('active');
            $('btnAskDoubt').querySelector('.ctrl-icon').textContent = '🗣️'; // speaking icon replaces mute
        };
        doubtProcessor.onSilence = () => {
            if ($('speakingIndicator')) $('speakingIndicator').classList.remove('active');
            $('btnAskDoubt').querySelector('.ctrl-icon').textContent = '🎤';
        };

        doubtProcessor.onStop = (blob) => {
            // Auto-save to student's local Downloads — no prompt
            doubtClipCounter++;
            const localName = `doubt_${studentName}_${ts()}.webm`;
            autoSaveLocal(blob, localName);

            // Also upload to server
            uploadDoubtClip(blob);
        };

        doubtProcessor.startRecording();

        $('doubtVisualiser').classList.add('active');
        doubtProcessor.drawVisualiser($('doubtCanvas'));

        isRecordingDoubt = true;
        doubtStartTime = Date.now();
        $('btnAskDoubt').classList.add('active');
        toast('🎤 Recording doubt — speak now (auto-saves when you stop)', 'success');

    } catch (e) { toast('Microphone access denied', 'error'); console.error(e); }
}

function stopDoubtRecording() {
    if (doubtProcessor) {
        doubtProcessor.stopRecording();
        doubtProcessor.stopVisualiser();
    }
    if (rawMicStream) { rawMicStream.getTracks().forEach(t => t.stop()); rawMicStream = null; }
    isRecordingDoubt = false;
    $('btnAskDoubt').classList.remove('active');
    $('btnAskDoubt').querySelector('.ctrl-icon').textContent = '🎤';
    $('doubtVisualiser').classList.remove('active');
    if ($('speakingIndicator')) $('speakingIndicator').classList.remove('active');
}

function sendDoubt() {
    if (isRecordingDoubt) {
        stopDoubtRecording(); // triggers onStop → autoSave + upload
        toast('Doubt sent & saved locally!', 'success');
    } else { toast('Record a doubt first (press mic)', 'error'); }
}

async function uploadDoubtClip(blob) {
    const durationSec = Math.round((Date.now() - doubtStartTime) / 1000);
    const fd = new FormData();
    fd.append('audio', blob, `doubt_${Date.now()}.webm`);
    if (currentMeetingId) fd.append('meetingId', currentMeetingId);
    fd.append('duration', durationSec);

    try {
        const res = await fetch('/api/student/doubt', { method: 'POST', body: fd });
        const data = await res.json();
        if (data.id) toast('✅ Doubt saved to server — teacher will review', 'success');
        else toast(data.error || 'Upload failed', 'error');
    } catch (e) { toast('Network error', 'error'); console.error(e); }
    finally { if (doubtProcessor) { doubtProcessor.destroy(); doubtProcessor = null; } }
}

// ================= MY DOUBTS LIST =================

async function loadDoubts() {
    try {
        const res = await fetch('/api/student/doubts');
        if (!res.ok) return;
        renderDoubts(await res.json());
    } catch (e) { console.error(e); }
}

function renderDoubts(list) {
    const c = $('doubtsList');
    if (!list.length) {
        c.innerHTML = '<div class="empty-state"><div class="icon">❓</div><p>No doubt clips yet. Record a doubt during a meeting!</p></div>';
        return;
    }
    c.innerHTML = list.map(d => `
      <div class="recording-item">
        <div class="recording-info">
          <div class="rec-name">🎤 ${escHtml(d.fileName)}</div>
          <div class="rec-meta">
            ${fmtDur(d.durationSeconds)} · ${d.createdAt}
            ${d.answered
                ? ' · <span style="color:#2ecc71;font-weight:600">✅ Answered</span>'
                : ' · <span style="color:#f39c12">⏳ Waiting</span>'}
          </div>
          <audio class="audio-player" controls preload="none" src="/api/student/doubt/${d.id}/play"></audio>
          ${d.answerNote ? `<div style="margin-top:8px;padding:8px;background:rgba(108,99,255,0.1);border-radius:8px;font-size:14px"><strong>Teacher:</strong> ${escHtml(d.answerNote)}</div>` : ''}
          ${d.hasAnswerAudio ? `<div style="margin-top:6px"><span style="font-size:13px;color:#6c63ff">🔊 Teacher reply:</span><audio class="audio-player" controls preload="none" src="/api/student/doubt/${d.id}/answer-audio"></audio></div>` : ''}
        </div>
      </div>`).join('');
}

// ===== LOGOUT =====
async function logout() {
    await fetch('/api/student/logout', { method: 'POST' });
    window.location.href = '/student/login';
}
