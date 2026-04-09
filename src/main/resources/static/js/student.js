/* ============================================================
   mtng – Student Dashboard Controller v2
   Polls teacher broadcast, plays filtered audio,
   records doubt clips with full voice processing pipeline,
   auto-saves clips locally, shows speaking indicator
   ============================================================ */

const studentId   = document.getElementById('studentId')?.value;
const studentName = document.getElementById('studentName')?.value;
const studentAvatar = document.getElementById('studentAvatar')?.value || 'avatar-1';

// ===== AVATAR SYSTEM (shared with app.js) =====
const STUDENT_AVATARS = [
    { id: 'avatar-1',  icon: '🦊', bg: 'from-orange-500 to-red-500' },
    { id: 'avatar-2',  icon: '🐺', bg: 'from-gray-500 to-blue-600' },
    { id: 'avatar-3',  icon: '🦁', bg: 'from-amber-500 to-yellow-600' },
    { id: 'avatar-4',  icon: '🐱', bg: 'from-pink-500 to-rose-500' },
    { id: 'avatar-5',  icon: '🐼', bg: 'from-gray-600 to-gray-800' },
    { id: 'avatar-6',  icon: '🦉', bg: 'from-amber-700 to-orange-900' },
    { id: 'avatar-7',  icon: '🐸', bg: 'from-green-500 to-emerald-600' },
    { id: 'avatar-8',  icon: '🦋', bg: 'from-violet-500 to-purple-600' },
    { id: 'avatar-9',  icon: '🐧', bg: 'from-sky-500 to-blue-600' },
    { id: 'avatar-10', icon: '🦄', bg: 'from-pink-400 to-purple-500' },
    { id: 'avatar-11', icon: '🐲', bg: 'from-red-600 to-orange-500' },
    { id: 'avatar-12', icon: '🦈', bg: 'from-blue-700 to-cyan-600' },
    { id: 'avatar-13', icon: '🦅', bg: 'from-yellow-700 to-amber-800' },
    { id: 'avatar-14', icon: '🐬', bg: 'from-cyan-500 to-teal-500' },
    { id: 'avatar-15', icon: '🦚', bg: 'from-teal-500 to-emerald-600' },
    { id: 'avatar-16', icon: '🐉', bg: 'from-indigo-500 to-purple-700' },
];
function getStudentAvatarById(id) { return STUDENT_AVATARS.find(a => a.id === id) || STUDENT_AVATARS[0]; }
function renderStudentAvatar(avatarId, size='md') {
    const av = getStudentAvatarById(avatarId);
    const sizes = { sm: 'w-8 h-8 text-base', md: 'w-10 h-10 text-xl', lg: 'w-14 h-14 text-3xl' };
    const cls = sizes[size] || sizes.md;
    return `<div class="rounded-full bg-gradient-to-br ${av.bg} ${cls} flex items-center justify-center shadow-lg ring-2 ring-white/10 flex-shrink-0"><span class="drop-shadow">${av.icon}</span></div>`;
}

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
let audioUnlocked  = false;  // Mobile audio unlock state
let silentAudioCtx = null;   // Primed AudioContext for mobile playback

// ===== BOOT =====
document.addEventListener('DOMContentLoaded', () => {
    wireEvents();
    checkAudioUnlock();
    startPolling();
    loadDoubts();
    initStudentAvatar();
});

// ===== MOBILE AUDIO UNLOCK =====
// iOS/Safari/mobile browsers block audio playback until a user gesture occurs.
// This shows an overlay on first load to get a tap, then primes the AudioContext.
function checkAudioUnlock() {
    // Detect if we likely need an unlock (iOS Safari, or any mobile)
    const isMobile = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);
    const isSafari = /^((?!chrome|android).)*safari/i.test(navigator.userAgent);
    const overlay = document.getElementById('audioUnlockOverlay');

    if ((isMobile || isSafari) && overlay) {
        overlay.classList.remove('hidden');
        const unlockBtn = document.getElementById('btnAudioUnlock');
        if (unlockBtn) {
            unlockBtn.addEventListener('click', () => {
                unlockAudio();
                overlay.classList.add('hidden');
            }, { once: true });
        }
        // Also unlock on any touch anywhere
        document.addEventListener('touchstart', function handler() {
            unlockAudio();
            if (overlay) overlay.classList.add('hidden');
            document.removeEventListener('touchstart', handler);
        }, { once: true });
    } else {
        audioUnlocked = true;
    }
}

function unlockAudio() {
    // Create a silent AudioContext and play a tiny buffer to "prime" audio playback
    try {
        silentAudioCtx = new (window.AudioContext || window.webkitAudioContext)();
        const buffer = silentAudioCtx.createBuffer(1, 1, 22050);
        const source = silentAudioCtx.createBufferSource();
        source.buffer = buffer;
        source.connect(silentAudioCtx.destination);
        source.start(0);
        if (silentAudioCtx.state === 'suspended') silentAudioCtx.resume();
    } catch(e) { console.warn('Audio unlock failed:', e); }

    // Also play a silent HTML5 audio element to unlock that pathway
    try {
        const silentAudio = new Audio('data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEARKwAAIhYAQACABAAZGF0YQAAAAA=');
        silentAudio.volume = 0.01;
        silentAudio.play().then(() => silentAudio.pause()).catch(() => {});
    } catch(e) {}

    audioUnlocked = true;
    toast('🔊 Audio enabled!', 'success');
}

// ===== UTILS =====
const $ = id => document.getElementById(id);
const $$ = sel => document.querySelectorAll(sel);
function toast(msg, type='') {
    const t = $('toast'); t.textContent = msg;
    t.className = 'toast-container fixed left-1/2 -translate-x-1/2 z-[999] transition-all duration-400 px-7 py-3.5 rounded-xl text-sm shadow-[0_10px_30px_rgba(0,0,0,0.4)] bg-[#1a1a38]';
    if(type==='error') t.classList.add('border','border-red-500/50','text-red-400');
    else if(type==='success') t.classList.add('border','border-emerald-500/50','text-emerald-400');
    else t.classList.add('border','border-indigo-500/40','text-white');
    t.style.bottom = '30px';
    setTimeout(() => { t.style.bottom = '-100px'; }, 3000);
}
function escHtml(t) { const d = document.createElement('div'); d.textContent = t; return d.innerHTML; }
function fmtDur(s) { if (!s) return '0:00'; return Math.floor(s/60) + ':' + String(s%60).padStart(2,'0'); }
function ts() { return new Date().toISOString().replace(/[:.]/g,'-').slice(0,19); }

// ===== WIRE EVENTS =====
function wireEvents() {
    $$('[data-tab]').forEach(b => b.onclick = () => {
        $$('[data-tab]').forEach(x => {
            const isActive = x === b;
            x.classList.toggle('tab-active', isActive);
            x.classList.toggle('text-white', isActive);
            x.classList.toggle('text-gray-500', !isActive);
        });
        $$('.tab-pane').forEach(p => {
            if(p.id === b.dataset.tab) p.classList.add('active-tab');
            else p.classList.remove('active-tab');
        });
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
    if (!audioUnlocked) {
        // Show unlock overlay if not yet unlocked
        const overlay = document.getElementById('audioUnlockOverlay');
        if (overlay) overlay.classList.remove('hidden');
        return;
    }
    isPlaying = true;
    const chunkId = audioQueue.shift();
    try {
        const audio = new Audio(`/api/student/broadcast/chunk/${chunkId}`);
        audio.volume = isSpeakerOn ? 1.0 : 0;
        audio.setAttribute('playsinline', '');  // iOS requires playsinline
        audio.setAttribute('webkit-playsinline', '');
        audio.onplay = () => {
            $('broadcastLabel').textContent = '🔊 Receiving teacher audio…';
            $('broadcastLabel').className = 'mt-2.5 text-sm text-emerald-400';
        };
        audio.onended = () => { isPlaying = false; playNextChunk(); };
        audio.onerror = (e) => {
            console.warn('Chunk playback error:', e);
            isPlaying = false;
            playNextChunk();
        };
        // play() returns a Promise; handle autoplay rejection on mobile
        const playPromise = audio.play();
        if (playPromise !== undefined) {
            playPromise.catch(err => {
                console.warn('Autoplay blocked:', err.message);
                isPlaying = false;
                // Re-queue the chunk and show unlock overlay
                audioQueue.unshift(chunkId);
                const overlay = document.getElementById('audioUnlockOverlay');
                if (overlay && !audioUnlocked) overlay.classList.remove('hidden');
            });
        }
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
        badge.textContent = '🟢 Live'; badge.className = 'badge badge-success badge-sm ml-2';
        banner.innerHTML = '<span class="text-emerald-400 font-semibold text-sm">🟢 Meeting is live — Listening to teacher</span>';
        $('broadcastLabel').textContent = '🔊 Listening…';
        $('broadcastLabel').className = 'mt-2.5 text-sm text-emerald-400';
    } else {
        dot.classList.remove('recording');
        badge.textContent = 'Offline'; badge.className = 'badge badge-error badge-sm ml-2';
        banner.innerHTML = '<span class="text-emerald-400/70 text-sm">⏳ Waiting for teacher to start a meeting…</span>';
        $('timerDisplay').textContent = '00:00:00';
        $('broadcastLabel').textContent = '🔇 No broadcast';
        $('broadcastLabel').className = 'mt-2.5 text-sm text-gray-500';
    }
}

// ===== SPEAKER TOGGLE =====
function toggleSpeaker() {
    isSpeakerOn = !isSpeakerOn;
    $('btnSpeakerToggle').querySelector('.ctrl-icon').textContent = isSpeakerOn ? '🔊' : '🔇';
    $('btnSpeakerToggle').classList.toggle('opacity-40', !isSpeakerOn);
    if (isSpeakerOn) playNextChunk();
    toast(isSpeakerOn ? 'Speaker ON' : 'Speaker muted', 'success');
}

// ================= DOUBT RECORDING (with voice filters + auto-save) =================

async function toggleDoubtRecording() {
    if (isRecordingDoubt) stopDoubtRecording();
    else await startDoubtRecording();
}

async function startDoubtRecording() {
    // Check if browser supports recording at all
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        toast('🚫 Microphone not supported on this browser', 'error');
        return;
    }
    if (typeof MediaRecorder === 'undefined') {
        toast('🚫 Recording not supported on this browser. Try Chrome or Safari 14.5+', 'error');
        return;
    }
    try {
        // Try full constraints first, fall back to simpler constraints for mobile
        try {
            rawMicStream = await navigator.mediaDevices.getUserMedia({
                audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true,
                         sampleRate: 48000, channelCount: 1 }
            });
        } catch(e1) {
            // Fallback: simpler constraints (works on more mobile browsers)
            rawMicStream = await navigator.mediaDevices.getUserMedia({ audio: true });
        }

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
            // Upload doubt clip to server (no local download - avoids popup)
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
    // Determine file extension based on actual blob type (Safari uses mp4, Chrome uses webm)
    const ext = (blob.type && blob.type.includes('mp4')) ? 'mp4' : 'webm';
    const fd = new FormData();
    fd.append('audio', blob, `doubt_${Date.now()}.${ext}`);
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
        c.innerHTML = '<div class="text-center py-16 text-gray-500"><div class="text-5xl mb-4">❓</div><p>No doubt clips yet. Record a doubt during a meeting!</p></div>';
        return;
    }
    c.innerHTML = list.map(d => `
      <div class="flex items-center bg-white/[0.03] border border-white/5 rounded-xl px-5 py-4 mb-2.5 hover:bg-white/[0.05] transition">
        <div class="flex-1">
          <div class="font-semibold text-base mb-1">🎤 ${escHtml(d.fileName)}</div>
          <div class="text-xs text-gray-500 mb-2">
            ${fmtDur(d.durationSeconds)} · ${d.createdAt}
            ${d.answered
                ? ' · <span class="text-emerald-400 font-semibold">✅ Answered</span>'
                : ' · <span class="text-yellow-500">⏳ Waiting</span>'}
          </div>
          <audio class="w-full h-9 rounded-lg" controls preload="none" src="/api/student/doubt/${d.id}/play"></audio>
          ${d.answerNote ? `<div class="mt-2 p-2 bg-indigo-500/10 rounded-lg text-sm"><strong>Teacher:</strong> ${escHtml(d.answerNote)}</div>` : ''}
          ${d.hasAnswerAudio ? `<div class="mt-1.5"><span class="text-xs text-indigo-400">🔊 Teacher reply:</span><audio class="w-full h-9 rounded-lg" controls preload="none" src="/api/student/doubt/${d.id}/answer-audio"></audio></div>` : ''}
        </div>
      </div>`).join('');
}

// ===== STUDENT AVATAR =====
function initStudentAvatar() {
    const container = $('navbarDropdownAvatar');
    if (container) {
        const av = getStudentAvatarById(studentAvatar);
        container.className = `w-8 h-8 rounded-full bg-gradient-to-br ${av.bg} flex items-center justify-center shadow-lg ring-2 ring-white/10 flex-shrink-0`;
        container.innerHTML = `<span class="text-sm drop-shadow">${av.icon}</span>`;
    }
}

// ===== LOGOUT =====
async function logout() {
    // Mark student offline via API
    await fetch('/api/student/logout', { method: 'POST' }).catch(() => {});
    // Use Spring Security POST logout with CSRF
    const form = document.createElement('form');
    form.method = 'POST';
    form.action = '/logout';
    const csrfInput = document.createElement('input');
    csrfInput.type = 'hidden';
    csrfInput.name = '_csrf';
    csrfInput.value = document.getElementById('csrfToken').value;
    form.appendChild(csrfInput);
    document.body.appendChild(form);
    form.submit();
}
