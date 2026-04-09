/* ============================================================
   mtng – Teacher Dashboard · Full Client-Side Controller
   Uses AudioProcessor for noise-filtered broadcast & recording
   ============================================================ */

// ===== GLOBAL STATE =====
let currentMeeting   = null;
let meetingTimer      = null;
let meetingSeconds    = 0;
let isPaused          = false;
let isMicActive       = false;
let isSpeakerOn       = true;
let confirmCallback   = null;
let schedules         = JSON.parse(localStorage.getItem('air_schedules') || '[]');
let studentZoom       = parseInt(localStorage.getItem('air_zoom') || '100', 10);

// Broadcast state (teacher → students)
let broadcastProcessor = null;   // AudioProcessor for broadcasting
let rawBroadcastStream = null;
let broadcastChunkTimer = null;

// Doubt answer recording state
let answerProcessor    = null;
let rawAnswerStream    = null;
let answerBlob         = null;

// Speaking students tracking (teacher sees who is talking)
let speakingStudents   = new Set();

// Teacher VAD speaking indicator state
let teacherVadPollId   = null;

// Auto-save broadcast locally — accumulate chunks and save periodically
let broadcastLocalChunks  = [];
let broadcastAutoSaveTimer = null;
let autoSaveCounter = parseInt(localStorage.getItem('air_autoSaveCount') || '0', 10);

const csrfToken  = document.getElementById('csrfToken')?.value;
const csrfHeader = document.getElementById('csrfHeader')?.value;
const teacherName = document.getElementById('teacherName')?.value;
const isAdmin = document.getElementById('isAdmin')?.value === 'true';
const teacherRole = document.getElementById('teacherRole')?.value;
let   teacherAvatar = document.getElementById('teacherAvatar')?.value || 'avatar-1';

// ===== AVATAR SYSTEM =====
const AVATARS = [
    { id: 'avatar-1',  icon: '🦊', label: 'Fox',       bg: 'from-orange-500 to-red-500' },
    { id: 'avatar-2',  icon: '🐺', label: 'Wolf',      bg: 'from-gray-500 to-blue-600' },
    { id: 'avatar-3',  icon: '🦁', label: 'Lion',      bg: 'from-amber-500 to-yellow-600' },
    { id: 'avatar-4',  icon: '🐱', label: 'Cat',       bg: 'from-pink-500 to-rose-500' },
    { id: 'avatar-5',  icon: '🐼', label: 'Panda',     bg: 'from-gray-600 to-gray-800' },
    { id: 'avatar-6',  icon: '🦉', label: 'Owl',       bg: 'from-amber-700 to-orange-900' },
    { id: 'avatar-7',  icon: '🐸', label: 'Frog',      bg: 'from-green-500 to-emerald-600' },
    { id: 'avatar-8',  icon: '🦋', label: 'Butterfly', bg: 'from-violet-500 to-purple-600' },
    { id: 'avatar-9',  icon: '🐧', label: 'Penguin',   bg: 'from-sky-500 to-blue-600' },
    { id: 'avatar-10', icon: '🦄', label: 'Unicorn',   bg: 'from-pink-400 to-purple-500' },
    { id: 'avatar-11', icon: '🐲', label: 'Dragon',    bg: 'from-red-600 to-orange-500' },
    { id: 'avatar-12', icon: '🦈', label: 'Shark',     bg: 'from-blue-700 to-cyan-600' },
    { id: 'avatar-13', icon: '🦅', label: 'Eagle',     bg: 'from-yellow-700 to-amber-800' },
    { id: 'avatar-14', icon: '🐬', label: 'Dolphin',   bg: 'from-cyan-500 to-teal-500' },
    { id: 'avatar-15', icon: '🦚', label: 'Peacock',   bg: 'from-teal-500 to-emerald-600' },
    { id: 'avatar-16', icon: '🐉', label: 'Serpent',   bg: 'from-indigo-500 to-purple-700' },
];

function getAvatarById(id) { return AVATARS.find(a => a.id === id) || AVATARS[0]; }

/** Render an avatar badge. size = 'sm' | 'md' | 'lg' */
function renderAvatar(avatarId, size = 'md') {
    const av = getAvatarById(avatarId);
    const sizes = { sm: 'w-8 h-8 text-base', md: 'w-10 h-10 text-xl', lg: 'w-14 h-14 text-3xl' };
    const cls = sizes[size] || sizes.md;
    return `<div class="rounded-full bg-gradient-to-br ${av.bg} ${cls} flex items-center justify-center shadow-lg ring-2 ring-white/10 flex-shrink-0" title="${av.label}"><span class="drop-shadow">${av.icon}</span></div>`;
}

/** Build avatar picker grid. targetInputId = hidden input to set value. size = 'sm'|'md' */
function buildAvatarPicker(containerId, targetInputId, selectedId, size = 'md') {
    const grid = $(containerId);
    if (!grid) return;
    selectedId = selectedId || 'avatar-1';
    const sz = size === 'sm' ? 'w-9 h-9 text-lg' : 'w-12 h-12 text-2xl';
    grid.innerHTML = AVATARS.map(av => `
        <div class="avatar-option flex flex-col items-center gap-1 cursor-pointer p-1 rounded-xl border-2 transition-all hover:scale-110 ${av.id === selectedId ? 'border-indigo-500 bg-indigo-500/10 scale-105' : 'border-transparent hover:border-white/20'}"
             data-avatar="${av.id}" data-target="${targetInputId}">
            <div class="rounded-full bg-gradient-to-br ${av.bg} ${sz} flex items-center justify-center shadow-lg"><span class="drop-shadow">${av.icon}</span></div>
        </div>`).join('');
    // Wire click
    grid.querySelectorAll('.avatar-option').forEach(opt => {
        opt.onclick = () => {
            grid.querySelectorAll('.avatar-option').forEach(o => { o.classList.remove('border-indigo-500','bg-indigo-500/10','scale-105'); o.classList.add('border-transparent'); });
            opt.classList.add('border-indigo-500','bg-indigo-500/10','scale-105');
            opt.classList.remove('border-transparent');
            const target = $(opt.dataset.target);
            if (target) target.value = opt.dataset.avatar;
        };
    });
}

let selectedTeacherAvatar = null; // temp state for avatar picker modal

// ===== BOOT =====
document.addEventListener('DOMContentLoaded', () => {
    wireEvents();
    loadStudents();
    checkActiveMeeting();
    loadRecordings();
    loadSettings();
    renderScheduleList();
    applyZoom();
    initAvatars();
    const saved = localStorage.getItem('air_theme');
    if (saved) applyTheme(saved);
});

// ===== API HELPERS =====
function hdrs(json){
    const h = {};
    if (json) h['Content-Type'] = 'application/json';
    if (csrfHeader && csrfToken) h[csrfHeader] = csrfToken;
    return h;
}
async function safeJson(r) {
    const text = await r.text();
    try { return JSON.parse(text); }
    catch(e) {
        // Non-JSON response (e.g. session expired → login HTML page, or server error page)
        if (!r.ok) throw new Error(`Server error (${r.status})`);
        throw new Error('Unexpected server response');
    }
}
const api = {
    get:  url => fetch(url, {credentials:'same-origin'}).then(safeJson),
    post: (url, body) => fetch(url, {method:'POST', headers:hdrs(!!body), body: body ? JSON.stringify(body) : undefined, credentials:'same-origin'}).then(safeJson),
    put:  (url, body) => fetch(url, {method:'PUT',  headers:hdrs(true),  body: JSON.stringify(body), credentials:'same-origin'}).then(safeJson),
    del:  url => fetch(url, {method:'DELETE', headers:hdrs(false), credentials:'same-origin'}).then(safeJson),
};

// ===== WIRE ALL EVENTS =====
function wireEvents(){
    $$('[data-tab]').forEach(b => b.onclick = () => switchTab(b.dataset.tab));

    $('btnStartMeeting').onclick  = () => currentMeeting ? endMeeting() : startMeeting();
    $('btnStopMeeting').onclick   = endMeeting;
    $('btnSettings').onclick      = openSettings;
    $('btnScreenShare').onclick   = screenShare;
    $('btnSpeaker').onclick       = () => toggleSpeaker();
    $('btnMic').onclick           = toggleBroadcast;
    $('btnPauseResume').onclick   = pauseResume;

    $('btnMicToggle').onclick     = toggleBroadcast;
    $('btnSpeakerToggle').onclick = () => toggleSpeaker();
    $('btnSendAudio').onclick     = sendBroadcastChunkNow;

    $('btnSendChat').onclick = sendChatMessage;
    $('chatInput').onkeypress = e => { if(e.key==='Enter') sendChatMessage(); };

    $('btnRefreshStudents').onclick = loadStudents;
    $('searchStudents').oninput     = searchStudentsList;

    $('btnCreateStudent').onclick    = createStudent;
    $('btnToggleStudentPwd').onclick = () => togglePwdField('studentPassword');
    $('deviceLock').onchange   = () => $('optDeviceLock').classList.toggle('active', $('deviceLock').checked);
    $('showRecordings').onchange = () => $('optShowRec').classList.toggle('active', $('showRecordings').checked);

    $('btnRefreshRecordings').onclick = loadRecordings;

    // Manager buttons (admin only)
    if ($('btnCreateManager')) $('btnCreateManager').onclick = createManager;
    if ($('btnToggleManagerPwd')) $('btnToggleManagerPwd').onclick = () => togglePwdField('managerPassword');
    if ($('btnSaveManager')) $('btnSaveManager').onclick = updateManager;

    // Doubts panel
    if ($('btnRefreshDoubtsPanel')) $('btnRefreshDoubtsPanel').onclick = loadDoubtsPanel;

    // Answer doubt modal
    if ($('btnRecordAnswer')) $('btnRecordAnswer').onclick = toggleAnswerRecording;
    if ($('btnSubmitAnswer')) $('btnSubmitAnswer').onclick = submitAnswer;

    // Settings sidebar
    $('settingsOverlay').onclick  = closeSettings;
    $('sAvatar').onclick          = () => { closeSettings(); openAvatarPicker(); };
    $('sChangePassword').onclick  = () => { closeSettings(); openModal('passwordModal'); };
    $('sSchedule').onclick        = () => { closeSettings(); openModal('scheduleModal'); };
    $('sThemes').onclick          = () => { closeSettings(); openModal('themeModal'); };
    $('sSpeakDetection').onclick  = () => { closeSettings(); openModal('speakDetectionModal'); };
    $('sZoomStudents').onclick    = () => { closeSettings(); openModal('zoomModal'); };
    $('fullRecordingToggle').onchange = toggleFullRecording;

    // Navbar logout dropdown
    const doLogout = () => {
        const form = document.createElement('form');
        form.method = 'POST';
        form.action = '/logout';
        const csrfInput = document.createElement('input');
        csrfInput.type = 'hidden';
        csrfInput.name = '_csrf';
        csrfInput.value = $('csrfToken').value;
        form.appendChild(csrfInput);
        document.body.appendChild(form);
        form.submit();
    };
    if ($('navLogout')) $('navLogout').onclick = doLogout;

    $('btnChangePassword').onclick    = changePassword;
    $('btnSaveStudent').onclick       = updateStudent;
    $('btnAddSchedule').onclick       = addSchedule;
    $('btnSaveSpeakDetection').onclick = saveSpeakDetection;
    $('btnApplyZoom').onclick         = applyZoomFromSlider;
    $('btnSaveAvatar').onclick        = saveTeacherAvatar;
    $('btnConfirmAction').onclick     = () => { if(confirmCallback) confirmCallback(); closeModal('confirmModal'); };
    $('navbarAvatar').onclick         = openAvatarPicker;
    $('zoomRange').oninput = () => $('zoomValue').textContent = $('zoomRange').value;

    $$('.theme-swatch').forEach(s => s.onclick = () => {
        $$('.theme-swatch').forEach(x => { x.classList.remove('selected'); x.classList.replace('border-indigo-500','border-transparent'); });
        s.classList.add('selected');
        s.classList.replace('border-transparent','border-indigo-500');
        applyTheme(s.dataset.theme);
    });

    $$('[data-close]').forEach(b => b.onclick = () => closeModal(b.dataset.close));
}

// ===== UTILITY =====
function $(id){ return document.getElementById(id); }
function $$(sel){ return document.querySelectorAll(sel); }
function escHtml(t){ const d=document.createElement('div'); d.textContent=t; return d.innerHTML; }
function fmtDur(s){ if(!s)return '0:00'; return Math.floor(s/60)+':'+String(s%60).padStart(2,'0'); }
function fmtSize(b){ if(!b)return '0 B'; const u=['B','KB','MB','GB']; let i=0,s=b; while(s>=1024&&i<u.length-1){s/=1024;i++} return s.toFixed(1)+' '+u[i]; }
function toast(msg, type=''){
    const t=$('toast'); t.textContent=msg;
    t.className='toast show px-7 py-3.5 bg-[#1a1a38] rounded-xl text-sm shadow-[0_10px_30px_rgba(0,0,0,0.4)]';
    if(type==='error') t.classList.add('border','border-red-500/50','text-red-400');
    else if(type==='success') t.classList.add('border','border-emerald-500/50','text-emerald-400');
    else t.classList.add('border','border-indigo-500/40','text-white');
    setTimeout(()=>t.classList.remove('show'),3000);
}
function openModal(id){ $(id).classList.add('modal-open'); }
function closeModal(id){ $(id).classList.remove('modal-open'); }
function showConfirm(title,msg,cb){ $('confirmTitle').textContent=title; $('confirmMsg').textContent=msg; confirmCallback=cb; openModal('confirmModal'); }

// ===== TABS =====
function switchTab(tab){
    $$('[data-tab]').forEach(b => {
        const isActive = b.dataset.tab===tab;
        b.classList.toggle('tab-active', isActive);
        b.classList.toggle('text-white', isActive);
        b.classList.toggle('text-gray-500', !isActive);
    });
    $$('.tab-pane').forEach(p => {
        if(p.id===tab){ p.classList.add('active-tab'); }
        else { p.classList.remove('active-tab'); }
    });
    if(tab==='students-list') loadStudents();
    if(tab==='recordings')    loadRecordings();
    if(tab==='chat' && currentMeeting) loadChatMessages();
    if(tab==='managers' && isAdmin) loadManagers();
}

// ================= STUDENTS LIST =================
function loadStudents(){
    api.get('/api/students').then(students => { renderStudents(students); updateOnlineCount(students); }).catch(e => { console.error('Load students error:', e); });
}
function searchStudentsList(){
    const q = $('searchStudents').value;
    api.get(q ? `/api/students?search=${encodeURIComponent(q)}` : '/api/students').then(renderStudents);
}
function renderStudents(list){
    const c = $('studentsList');
    if(!list.length){ c.innerHTML='<div class="text-center py-16 text-gray-500"><div class="text-5xl mb-4">👥</div><p>No students found</p></div>'; return; }
    c.innerHTML = list.map(s => `
      <div class="flex items-center bg-white/[0.02] border border-white/5 border-l-4 border-l-indigo-500 rounded-lg px-5 py-4 mb-2 hover:bg-white/[0.04] transition flex-col md:flex-row gap-3" style="font-size:${studentZoom}%">
        <div class="flex items-center gap-3 flex-1">
          ${renderAvatar(s.avatar || 'avatar-1', 'md')}
          <div class="text-center md:text-left">
            <span class="text-lg font-bold">${escHtml(s.name)}</span>
            <span class="text-gray-500 text-sm">(${escHtml(s.username)})</span>
            <span class="inline-flex items-center gap-1.5 text-xs ml-2.5">
              <span class="w-2.5 h-2.5 rounded-full flex-shrink-0 ${s.online?'bg-emerald-400':'bg-red-500'}"></span>
              ${s.online?'<span class="text-emerald-400">Online</span>':'<span class="text-red-500">Offline</span>'}
            </span>
            <div class="text-gray-600 text-xs mt-1">Created: ${s.createdAt} | Last seen: ${s.lastSeen}</div>
          </div>
        </div>
        <div class="flex gap-2 items-center flex-wrap justify-center">
          <button class="btn btn-xs bg-emerald-500 border-none text-white hover:bg-emerald-600" onclick="contactWhatsApp('${escHtml(s.name)}','${escHtml(s.username)}')">💬</button>
          <button class="btn btn-xs bg-indigo-500 border-none text-white hover:bg-indigo-600" onclick="openEditStudent(${s.id},'${escHtml(s.name)}',${s.deviceLock},${s.showRecordings},'${s.avatar||'avatar-1'}')">✏️ Edit</button>
          <button class="btn btn-xs ${s.blocked?'bg-orange-500':'bg-red-500'} border-none text-white hover:opacity-80" onclick="doToggleBlock(${s.id})">${s.blocked?'🔓 Unblock':'🚫 Block'}</button>
          <button class="btn btn-xs ${s.muted?'bg-red-500':'bg-yellow-500'} border-none text-white hover:opacity-80" onclick="doToggleMute(${s.id})">${s.muted?'🔊 Unmute':'🔇 Mute'}</button>
          <button class="btn btn-xs bg-red-700 border-none text-white hover:bg-red-800" onclick="doDeleteStudent(${s.id},'${escHtml(s.name)}')">🗑️ Delete</button>
        </div>
      </div>`).join('');
}
function updateOnlineCount(students){ $('onlineCount').textContent = students.filter(s=>s.online).length; }

window.contactWhatsApp = (name, username, password) => {
    const loginUrl = window.location.origin + '/login';
    let msg = `📚 *mtng — Student Login Details*\n\n`
              + `👤 Name: ${name}\n`
              + `🔑 Username: ${username}\n`;
    if (password) {
        msg += `🔒 Password: ${password}\n\n`;
    } else {
        msg += `🔒 Password: (use the password given to you)\n\n`;
    }
    msg += `🌐 Login here: ${loginUrl}\n\n`
         + `— Sent from mtng app`;
    const waUrl = `https://wa.me/?text=${encodeURIComponent(msg)}`;
    window.open(waUrl, '_blank');
    toast(`WhatsApp opened for ${name}`, 'success');
};
window.openEditStudent = (id,name,dl,sr,avatar) => {
    $('editStudentId').value=id; $('editStudentName').value=name; $('editStudentPassword').value='';
    $('editDeviceLock').checked=dl; $('editShowRecordings').checked=sr;
    $('editStudentAvatar').value = avatar || 'avatar-1';
    buildAvatarPicker('editStudentAvatarGrid', 'editStudentAvatar', avatar || 'avatar-1', 'sm');
    openModal('editStudentModal');
};
window.doToggleBlock = id => api.post(`/api/students/${id}/block`).then(()=>{ loadStudents(); toast('Block toggled','success'); }).catch(e => toast('Failed: '+e.message,'error'));
window.doToggleMute  = id => api.post(`/api/students/${id}/mute`).then(()=>{ loadStudents(); toast('Mute toggled','success'); }).catch(e => toast('Failed: '+e.message,'error'));
window.doDeleteStudent = (id,name) => showConfirm('Delete Student',`Delete "${name}"? Cannot undo.`,()=>{
    api.del(`/api/students/${id}`).then(()=>{ loadStudents(); toast(`"${name}" deleted`,'success'); });
});
function updateStudent(){
    const id=$('editStudentId').value;
    const body={name:$('editStudentName').value.trim(), password:$('editStudentPassword').value,
                deviceLock:$('editDeviceLock').checked, showRecordings:$('editShowRecordings').checked,
                avatar:$('editStudentAvatar').value || 'avatar-1'};
    if(!body.name){ toast('Name required','error'); return; }
    api.put(`/api/students/${id}`,body).then(d=>{
        if(d.error){ toast(d.error,'error'); return; }
        toast('Updated','success'); closeModal('editStudentModal'); loadStudents();
    }).catch(e => { console.error('Update student error:', e); toast('Failed to update: ' + e.message, 'error'); });
}

// ================= CREATE STUDENT =================
function createStudent(){
    const body={name:$('studentName').value.trim(), username:$('studentUsername').value.trim(),
                password:$('studentPassword').value, deviceLock:$('deviceLock').checked, showRecordings:$('showRecordings').checked,
                avatar:$('studentAvatarChoice').value || 'avatar-1'};
    if(!body.name||!body.username||!body.password){ toast('All fields required','error'); return; }
    $('btnCreateStudent').disabled = true;
    $('btnCreateStudent').textContent = 'Creating…';
    api.post('/api/students',body).then(d=>{
        if(d.error){ toast(d.error,'error'); return; }
        toast(`"${body.name}" created!`,'success');
        // Auto-open WhatsApp with login details including password
        contactWhatsApp(body.name, body.username, body.password);
        $('studentName').value=''; $('studentUsername').value=''; $('studentPassword').value='';
        $('deviceLock').checked=false; $('showRecordings').checked=true;
        $('studentAvatarChoice').value='avatar-1';
        buildAvatarPicker('createStudentAvatarGrid', 'studentAvatarChoice', 'avatar-1', 'sm');
        $('optDeviceLock').classList.remove('active'); $('optShowRec').classList.add('active');
        switchTab('students-list');
    }).catch(e => {
        console.error('Create student error:', e);
        toast('Failed to create student: ' + e.message, 'error');
    }).finally(() => {
        $('btnCreateStudent').disabled = false;
        $('btnCreateStudent').textContent = 'Create Student';
    });
}

// ================= MEETING =================
function startMeeting(){
    api.post('/api/meeting/start').then(d=>{
        currentMeeting=d; meetingSeconds=0; isPaused=false;
        startTimer(); updateMeetingUI(true);
        loadDoubtsPanel();
        toast('Meeting started!','success');
    });
}
function endMeeting(){
    showConfirm('End Meeting','End for all students?',()=>{
        stopBroadcast();
        api.post('/api/meeting/end').then(()=>{
            currentMeeting=null; stopTimer(); updateMeetingUI(false);
            toast('Meeting ended','success');
        });
    });
}
function checkActiveMeeting(){
    api.get('/api/meeting/active').then(d=>{
        if(!d.active) return;
        currentMeeting=d;
        meetingSeconds=Math.floor((Date.now()-new Date(d.startTime).getTime())/1000);
        startTimer(); updateMeetingUI(true);
        $('meetingCount').textContent=d.participantCount||0;
        loadDoubtsPanel();
    });
}
function updateMeetingUI(active){
    const btn=$('btnStartMeeting'), dot=$('recDot'), tmr=$('meetingTimer'), ban=$('meetingBanner');
    if(active){
        btn.textContent='End Meeting'; btn.className='btn btn-sm bg-gradient-to-r from-red-900 to-red-700 border-red-400/40 text-white font-semibold';
        dot.classList.add('recording'); tmr.classList.add('border-red-500/50','bg-red-500/5');
        ban.innerHTML='<span class="text-emerald-400 font-semibold text-sm">🟢 Meeting Active — Broadcasting to students. Click 🎤 to start voice.</span>';
        ban.classList.add('border-emerald-500/35','bg-gradient-to-r','from-emerald-900/25','to-emerald-900/8');
    } else {
        btn.textContent='Start Meeting'; btn.className='btn btn-sm bg-gradient-to-r from-indigo-900 to-indigo-700 border-indigo-400/40 text-white font-semibold hover:from-indigo-700 hover:to-indigo-500';
        dot.classList.remove('recording'); tmr.classList.remove('border-red-500/50','bg-red-500/5');
        ban.innerHTML='<span class="text-emerald-400/70 text-sm">Press <strong>Start Meeting</strong> to begin</span>';
        ban.classList.remove('border-emerald-500/35');
        $('timerDisplay').textContent='00:00:00';
        $('audioVisualiser').classList.remove('active');
    }
}

// ===== TIMER =====
function startTimer(){
    stopTimer();
    meetingTimer=setInterval(()=>{
        meetingSeconds++;
        const h=String(Math.floor(meetingSeconds/3600)).padStart(2,'0');
        const m=String(Math.floor((meetingSeconds%3600)/60)).padStart(2,'0');
        const s=String(meetingSeconds%60).padStart(2,'0');
        $('timerDisplay').textContent=`${h}:${m}:${s}`;
    },1000);
}
function stopTimer(){ if(meetingTimer){clearInterval(meetingTimer);meetingTimer=null;} }
function pauseResume(){
    if(!currentMeeting){ toast('No meeting','error'); return; }
    isPaused=!isPaused;
    if(isPaused){ stopTimer(); stopBroadcast(); $('btnPauseResume').textContent='▶️'; toast('Paused','success'); }
    else        { startTimer(); $('btnPauseResume').textContent='⏸️'; toast('Resumed','success'); }
}

// ======================================================================
//  BROADCAST — Teacher mic with AudioProcessor voice filters
//  Records in chunks (5s) and uploads each chunk to server.
//  Students poll and play these chunks.
// ======================================================================
async function toggleBroadcast(){
    if(isMicActive) stopBroadcast();
    else await startBroadcast();
}

async function startBroadcast(){
    if(!currentMeeting){ toast('Start a meeting first','error'); return; }
    try{
        // Get raw mic with browser-level noise suppression
        rawBroadcastStream = await navigator.mediaDevices.getUserMedia({
            audio:{ echoCancellation:true, noiseSuppression:true, autoGainControl:true, sampleRate:48000, channelCount:1 }
        });

        // Initialise AudioProcessor with full filter chain
        broadcastProcessor = new AudioProcessor();
        await broadcastProcessor.init(rawBroadcastStream);

        // VAD: show/hide teacher speaking indicator + level bar
        broadcastProcessor.onSpeaking = () => {
            $('btnMicToggle').querySelector('.ctrl-icon').textContent = '🗣️';
            $('btnMic').textContent = '🗣️';
            showTeacherSpeakingIndicator(true);
        };
        broadcastProcessor.onSilence = () => {
            $('btnMicToggle').querySelector('.ctrl-icon').textContent = '🎤';
            $('btnMic').textContent = '🎤';
            showTeacherSpeakingIndicator(false);
        };

        // Start VAD level meter polling (updates level bar every 80ms)
        startVadLevelPolling();

        // Reset local chunks accumulator
        broadcastLocalChunks = [];

        // Each chunk → upload to server + accumulate for local auto-save
        broadcastProcessor.onChunk = async (chunkBlob) => {
            uploadBroadcastChunk(chunkBlob);
            broadcastLocalChunks.push(chunkBlob);
        };

        // On stop → final upload + meeting recording (server-side only, no local download popup)
        broadcastProcessor.onStop = (fullBlob) => {
            uploadBroadcastChunk(fullBlob);
            uploadMeetingRecording(fullBlob);
            toast('📁 Broadcast saved to server', 'success');
        };

        // Record in 5-second timeslices
        broadcastProcessor.startRecording(5000);

        // Visualise
        $('audioVisualiser').classList.add('active');
        broadcastProcessor.drawVisualiser($('audioCanvas'));

        isMicActive=true;
        $('btnMicToggle').classList.add('active');
        $('btnMic').classList.add('text-emerald-400');
        toast('🎤 Broadcasting with enhanced voice clarity — students can hear you','success');
    } catch(e){
        toast('Mic access denied','error');
        console.error(e);
    }
}

function stopBroadcast(){
    // Auto-save any remaining accumulated local chunks before cleanup
    flushLocalAutoSave();
    stopBroadcastAutoSave();
    stopVadLevelPolling();
    showTeacherSpeakingIndicator(false);

    if(broadcastProcessor){
        broadcastProcessor.stopRecording();
        broadcastProcessor.stopVisualiser();
        broadcastProcessor.destroy();
        broadcastProcessor=null;
    }
    if(rawBroadcastStream){
        rawBroadcastStream.getTracks().forEach(t=>t.stop());
        rawBroadcastStream=null;
    }
    isMicActive=false;
    $('btnMicToggle').classList.remove('active');
    $('btnMicToggle').querySelector('.ctrl-icon').textContent = '🎤';
    $('btnMic').classList.remove('text-emerald-400');
    $('btnMic').textContent = '🎤';
    $('audioVisualiser').classList.remove('active');
    broadcastLocalChunks = [];
}

function sendBroadcastChunkNow(){
    if(isMicActive){
        // Stop current recording, auto-uploads via onStop, then restart
        broadcastProcessor.stopRecording();
        setTimeout(()=>{
            if(isMicActive && broadcastProcessor) broadcastProcessor.startRecording(5000);
        },500);
        toast('Chunk sent','success');
    } else { toast('Start mic first','error'); }
}

async function uploadBroadcastChunk(blob){
    if(!currentMeeting || blob.size < 100) return; // skip tiny chunks
    const fd=new FormData();
    fd.append('audio', blob, `broadcast_${Date.now()}.webm`);
    fd.append('meetingId', currentMeeting.id);
    const h={}; if(csrfHeader&&csrfToken) h[csrfHeader]=csrfToken;
    try{
        await fetch('/api/broadcast/chunk',{method:'POST',headers:h,body:fd});
    } catch(e){ console.error('Broadcast upload error:',e); }
}

async function uploadMeetingRecording(blob){
    if(!currentMeeting) return;
    const fd=new FormData();
    fd.append('audio', blob, `meeting_${currentMeeting.id}_${Date.now()}.webm`);
    fd.append('meetingId', currentMeeting.id);
    fd.append('duration', meetingSeconds);
    const h={}; if(csrfHeader&&csrfToken) h[csrfHeader]=csrfToken;
    try{
        await fetch('/api/recordings/upload',{method:'POST',headers:h,body:fd});
    } catch(e){ console.error('Recording upload error:',e); }
}

// ======================================================================
//  TEACHER VAD SPEAKING INDICATOR
//  Shows a bar when teacher is speaking + real-time audio level meter
// ======================================================================
function showTeacherSpeakingIndicator(active) {
    const el = $('teacherSpeakingIndicator');
    if (!el) return;
    if (active) {
        el.classList.add('active');
    } else {
        el.classList.remove('active');
        // Reset level bar
        const fill = $('vadLevelFill');
        if (fill) fill.style.width = '0%';
    }
}

function startVadLevelPolling() {
    stopVadLevelPolling();
    teacherVadPollId = setInterval(() => {
        if (!broadcastProcessor) return;
        const level = broadcastProcessor.getLevel();
        const fill = $('vadLevelFill');
        if (!fill) return;
        const pct = Math.min(100, Math.round(level * 300)); // amplify for visibility
        fill.style.width = pct + '%';
        if (pct > 70) { fill.style.background = 'linear-gradient(90deg, #2ecc71, #f39c12)'; }
        else { fill.style.background = 'linear-gradient(90deg, #2ecc71, #27ae60)'; }
    }, 80);
}

function stopVadLevelPolling() {
    if (teacherVadPollId) { clearInterval(teacherVadPollId); teacherVadPollId = null; }
}

// ======================================================================
//  AUTO-SAVE BROADCAST RECORDINGS LOCALLY
//  Periodically saves accumulated audio chunks to local Downloads folder.
//  This ensures teacher has a local backup even if the session is interrupted.
// ======================================================================
function startBroadcastAutoSave() {
    stopBroadcastAutoSave();
    broadcastAutoSaveTimer = setInterval(() => {
        flushLocalAutoSave();
    }, 30000); // Auto-save every 30 seconds
}

function stopBroadcastAutoSave() {
    if (broadcastAutoSaveTimer) { clearInterval(broadcastAutoSaveTimer); broadcastAutoSaveTimer = null; }
}

function flushLocalAutoSave() {
    // No-op: server handles all recording storage, no local downloads needed
    broadcastLocalChunks = [];
}

// ===== SPEAKER =====
function toggleSpeaker(){
    isSpeakerOn=!isSpeakerOn;
    const icon=isSpeakerOn?'🔊':'🔇';
    $('btnSpeaker').textContent=icon;
    $('btnSpeakerToggle').querySelector('.ctrl-icon').textContent=icon;
    if(!isSpeakerOn){ $('btnSpeaker').classList.add('opacity-40'); $('btnSpeakerToggle').classList.add('opacity-40'); }
    else            { $('btnSpeaker').classList.remove('opacity-40'); $('btnSpeakerToggle').classList.remove('opacity-40'); }
    toast(isSpeakerOn?'Speaker ON':'Speaker OFF','success');
}

// ===== SCREEN SHARE =====
async function screenShare(){
    try{ const s=await navigator.mediaDevices.getDisplayMedia({video:true}); toast('Screen sharing started','success'); s.getVideoTracks()[0].onended=()=>toast('Stopped','success'); }
    catch(e){ toast('Cancelled','error'); }
}

// ================= DOUBTS PANEL (Teacher side) =================
let doubtPollTimer = null;

function loadDoubtsPanel(){
    if(!currentMeeting) return;
    const url=`/api/doubts?meetingId=${currentMeeting.id}`;
    api.get(url).then(doubts=>{
        if($('doubtCount')) $('doubtCount').textContent=`(${doubts.length})`;
        const c=$('doubtsPanelList');
        if(!doubts.length){ c.innerHTML='<div class="text-center py-5 text-gray-500"><p>No doubts yet</p></div>'; return; }

        // Track recently submitted doubts as "speaking" students (within last 20 sec)
        const now = Date.now();
        const recentSpeakers = new Set();
        doubts.forEach(d => {
            try {
                const created = new Date(d.createdAt).getTime();
                if (now - created < 20000) recentSpeakers.add(d.studentName);
            } catch(e) {}
        });
        updateSpeakingStrip(recentSpeakers);

        c.innerHTML=doubts.map(d=>`
          <div class="bg-white/[0.03] border border-white/5 ${d.answered?'border-l-4 border-l-emerald-500':'border-l-4 border-l-yellow-500'} rounded-xl px-4 py-3 mb-2 transition">
            <div class="flex items-center gap-2.5 flex-wrap mb-1">
              ${renderAvatar(d.studentAvatar || 'avatar-1', 'sm')}
              <strong>${escHtml(d.studentName)}</strong>
              <span class="text-gray-500 text-xs">${d.createdAt} · ${fmtDur(d.durationSeconds)}</span>
              ${d.answered?'<span class="badge badge-success badge-xs">✅ Answered</span>':'<span class="badge badge-warning badge-xs">⏳ Pending</span>'}
            </div>
            <audio class="w-full h-9 rounded-lg my-1.5" controls preload="none" src="/api/doubts/${d.id}/play"></audio>
            ${!d.answered?`<button class="btn btn-primary btn-xs" onclick="openAnswerDoubt(${d.id})">💬 Answer</button>`:''}
          </div>`).join('');
    });

    // Auto-refresh doubts every 8 seconds while meeting active
    if(!doubtPollTimer){
        doubtPollTimer=setInterval(()=>{
            if(currentMeeting) loadDoubtsPanel(); else { clearInterval(doubtPollTimer); doubtPollTimer=null; }
        },8000);
    }
}

/** Update the speaking-strip at top of teacher dashboard.
 *  Shows which students are currently speaking (recently submitted doubts)
 *  and optionally the teacher's own speaking state.  */
function updateSpeakingStrip(speakerNames) {
    const strip = $('speakingStrip');
    const container = $('speakingAvatars');
    if (!strip || !container) return;

    // Also include teacher in strip if broadcasting and VAD active
    const showTeacher = isMicActive && broadcastProcessor && broadcastProcessor.isSpeaking;

    if (speakerNames.size === 0 && !showTeacher) {
        strip.style.display = 'none';
        return;
    }
    strip.style.display = 'flex';
    container.innerHTML = '';

    // Show teacher indicator in strip
    if (showTeacher) {
        const tBadge = document.createElement('span');
        tBadge.className = 'speaking-avatar inline-flex items-center gap-1.5 bg-indigo-500/15 border border-indigo-500/30 rounded-full px-3 py-0.5 text-xs text-indigo-400 font-semibold whitespace-nowrap';
        tBadge.innerHTML = `${renderAvatar(teacherAvatar, 'sm')}<span class="w-2 h-2 rounded-full bg-indigo-400 flex-shrink-0"></span>You (Teacher)`;
        container.appendChild(tBadge);
    }

    // Show student speakers
    speakerNames.forEach(name => {
        const badge = document.createElement('span');
        badge.className = 'speaking-avatar inline-flex items-center gap-1.5 bg-emerald-500/15 border border-emerald-500/30 rounded-full px-3 py-0.5 text-xs text-emerald-400 font-semibold whitespace-nowrap';
        badge.innerHTML = `<span class="w-2 h-2 rounded-full bg-emerald-400 flex-shrink-0"></span>${escHtml(name)}`;
        container.appendChild(badge);
    });

    // Update label count
    const totalSpeaking = speakerNames.size + (showTeacher ? 1 : 0);
    const label = strip.querySelector('.speaking-label');
    if (label) label.textContent = `🎤 Speaking (${totalSpeaking}):`;
}

window.openAnswerDoubt = (id) => {
    $('answerDoubtId').value=id;
    $('answerDoubtAudio').src=`/api/doubts/${id}/play`;
    $('answerDoubtNote').value='';
    $('answerPreview').style.display='none';
    $('answerRecStatus').textContent='Not recording';
    answerBlob=null;
    openModal('answerDoubtModal');
};

// ===== ANSWER RECORDING =====
let isRecordingAnswer=false;

async function toggleAnswerRecording(){
    if(isRecordingAnswer){
        // Stop
        if(answerProcessor){ answerProcessor.stopRecording(); answerProcessor.destroy(); answerProcessor=null; }
        if(rawAnswerStream){ rawAnswerStream.getTracks().forEach(t=>t.stop()); rawAnswerStream=null; }
        isRecordingAnswer=false;
        $('btnRecordAnswer').textContent='🎤 Record';
        $('answerRecStatus').textContent='Recording saved';
    } else {
        // Start
        try{
            rawAnswerStream=await navigator.mediaDevices.getUserMedia({audio:{echoCancellation:true,noiseSuppression:true,autoGainControl:true}});
            answerProcessor=new AudioProcessor();
            await answerProcessor.init(rawAnswerStream);
            answerProcessor.onStop=(blob)=>{
                answerBlob=blob;
                const url=URL.createObjectURL(blob);
                $('answerPreview').src=url;
                $('answerPreview').style.display='block';
            };
            answerProcessor.startRecording();
            isRecordingAnswer=true;
            $('btnRecordAnswer').textContent='⏹ Stop';
            $('answerRecStatus').textContent='🔴 Recording…';
        } catch(e){ toast('Mic denied','error'); }
    }
}

async function submitAnswer(){
    const id=$('answerDoubtId').value;
    const note=$('answerDoubtNote').value.trim();
    if(!id){ toast('No doubt selected','error'); return; }

    const fd=new FormData();
    if(note) fd.append('note',note);
    if(answerBlob) {
        fd.append('audio', answerBlob, 'answer.webm');
    }

    const h={}; if(csrfHeader&&csrfToken) h[csrfHeader]=csrfToken;
    try{
        const res=await fetch(`/api/doubts/${id}/answer`,{method:'POST',headers:h,body:fd});
        const data=await res.json();
        if(data.answered){
            toast('Answer submitted!','success');
            closeModal('answerDoubtModal');
            loadDoubtsPanel();
        } else { toast(data.error||'Failed','error'); }
    } catch(e){ toast('Network error','error'); }
}

// ================= CHAT =================
function sendChatMessage(){
    const inp=$('chatInput'), txt=inp.value.trim();
    if(!txt) return;
    if(!currentMeeting){ toast('Start meeting first','error'); return; }
    api.post(`/api/meeting/${currentMeeting.id}/chat`,{content:txt}).then(m=>{ appendChat(m); inp.value=''; });
}
function appendChat(m){
    const c=$('chatMessages'); const nc=c.querySelector('.text-center'); if(nc && nc.textContent.includes('No messages')) nc.remove();
    const isTeacher=m.senderRole==='TEACHER';
    const div=document.createElement('div');
    div.className=`max-w-[70%] md:max-w-[70%] mb-3 px-4 py-3 rounded-xl border ${isTeacher?'bg-gradient-to-r from-indigo-500/30 to-indigo-500/10 border-indigo-500/20 ml-auto rounded-br-sm':'bg-white/5 border-white/10 mr-auto rounded-bl-sm'}`;
    div.innerHTML=`<div class="font-semibold text-xs mb-1 ${isTeacher?'text-indigo-400':'text-gray-400'}">${escHtml(m.senderName)}</div><div class="text-sm leading-relaxed">${escHtml(m.content)}</div><div class="text-[11px] text-gray-600 text-right mt-1">${m.timestamp}</div>`;
    c.appendChild(div); c.scrollTop=c.scrollHeight;
}
function loadChatMessages(){
    if(!currentMeeting) return;
    api.get(`/api/meeting/${currentMeeting.id}/chat`).then(msgs=>{
        const c=$('chatMessages');
        if(!msgs.length){ c.innerHTML='<div class="text-center text-gray-600 py-10">No messages yet.</div>'; return; }
        c.innerHTML=''; msgs.forEach(appendChat);
    });
}

// ================= RECORDINGS =================
function loadRecordings(){
    api.get('/api/recordings').then(list=>{
        const c=$('recordingsList');
        if(!list.length){ c.innerHTML='<div class="text-center py-16 text-gray-500"><div class="text-5xl mb-4">📼</div><p>No recordings yet</p></div>'; return; }
        c.innerHTML=list.map(r=>`
          <div class="flex items-center bg-white/[0.03] border border-white/5 rounded-xl px-5 py-4 mb-2.5 hover:bg-white/[0.05] transition">
            <div class="flex-1">
              <div class="font-semibold text-base mb-1">🎤 ${escHtml(r.fileName)}</div>
              <div class="text-gray-600 text-xs mb-2">${r.studentName||'Teacher'} · ${fmtDur(r.durationSeconds)} · ${fmtSize(r.fileSize)} · ${r.createdAt}</div>
              <audio class="w-full h-9 rounded-lg" controls preload="none" src="/api/recordings/${r.id}/play"></audio>
            </div>
            <div class="flex gap-2 ml-3">
              <button class="btn btn-xs bg-emerald-500/20 border border-emerald-500/30 text-emerald-400 hover:bg-emerald-500/30" onclick="playRec(${r.id})">▶ Play</button>
              <button class="btn btn-xs bg-indigo-500/20 border border-indigo-500/30 text-indigo-400 hover:bg-indigo-500/30" onclick="downloadRec(${r.id},'${escHtml(r.fileName)}')">⬇ Download</button>
              <button class="btn btn-xs bg-red-500/20 border border-red-500/30 text-red-400 hover:bg-red-500/30" onclick="delRec(${r.id})">🗑 Delete</button>
            </div>
          </div>`).join('');
    });
}
window.playRec = id => { const a=document.querySelector(`audio[src="/api/recordings/${id}/play"]`); if(a) a.paused?a.play():a.pause(); };
window.downloadRec = (id,name) => { const a=document.createElement('a'); a.href=`/api/recordings/${id}/play`; a.download=name; document.body.appendChild(a); a.click(); a.remove(); };
window.delRec = id => showConfirm('Delete Recording','Permanently delete?',()=>{ api.del(`/api/recordings/${id}`).then(()=>{ loadRecordings(); toast('Deleted','success'); }); });

// ================= SETTINGS =================
function openSettings(){ $('settingsOverlay').classList.remove('hidden'); $('settingsSidebar').style.right='0'; }
function closeSettings(){ $('settingsOverlay').classList.add('hidden'); $('settingsSidebar').style.right='-320px'; }
function loadSettings(){
    api.get('/api/settings').then(s=>{
        $('fullRecordingToggle').checked=s.fullMeetingRecording;
        if (s.avatar) { teacherAvatar = s.avatar; updateNavbarAvatar(); }
    });
}

function initAvatars() {
    // Render teacher avatar in navbar
    updateNavbarAvatar();
    // Build student creation avatar picker
    buildAvatarPicker('createStudentAvatarGrid', 'studentAvatarChoice', 'avatar-1', 'sm');
}

function updateNavbarAvatar() {
    const container = $('navbarAvatar');
    if (container) container.innerHTML = renderAvatar(teacherAvatar, 'md');
    // Also update the dropdown avatar
    const dropdownAv = $('dropdownAvatar');
    if (dropdownAv) dropdownAv.innerHTML = renderAvatar(teacherAvatar, 'sm');
}

function openAvatarPicker() {
    selectedTeacherAvatar = teacherAvatar;
    const grid = $('avatarGrid');
    if (!grid) return;
    grid.innerHTML = AVATARS.map(av => `
        <div class="avatar-picker-item flex flex-col items-center gap-1.5 cursor-pointer p-2 rounded-xl border-2 transition-all hover:scale-110 ${av.id === selectedTeacherAvatar ? 'border-indigo-500 bg-indigo-500/10 scale-105' : 'border-transparent hover:border-white/20'}"
             data-avatar="${av.id}">
            <div class="rounded-full bg-gradient-to-br ${av.bg} w-14 h-14 flex items-center justify-center shadow-lg text-3xl"><span class="drop-shadow">${av.icon}</span></div>
            <span class="text-[10px] text-gray-500">${av.label}</span>
        </div>`).join('');
    grid.querySelectorAll('.avatar-picker-item').forEach(opt => {
        opt.onclick = () => {
            grid.querySelectorAll('.avatar-picker-item').forEach(o => { o.classList.remove('border-indigo-500','bg-indigo-500/10','scale-105'); o.classList.add('border-transparent'); });
            opt.classList.add('border-indigo-500','bg-indigo-500/10','scale-105');
            opt.classList.remove('border-transparent');
            selectedTeacherAvatar = opt.dataset.avatar;
        };
    });
    openModal('avatarModal');
}

function saveTeacherAvatar() {
    if (!selectedTeacherAvatar) return;
    api.post('/api/settings/avatar', { avatar: selectedTeacherAvatar }).then(d => {
        if (d.error) { toast(d.error, 'error'); return; }
        teacherAvatar = selectedTeacherAvatar;
        updateNavbarAvatar();
        closeModal('avatarModal');
        toast('Avatar updated! ' + getAvatarById(teacherAvatar).icon, 'success');
    }).catch(e => toast('Failed: ' + e.message, 'error'));
}
function changePassword(){
    const o=$('oldPassword').value,n=$('newPassword').value,c=$('confirmPassword').value;
    if(!o||!n){ toast('Fill all fields','error'); return; }
    if(n!==c){ toast('Passwords don\'t match','error'); return; }
    api.post('/api/settings/password',{oldPassword:o,newPassword:n}).then(d=>{
        if(d.error){ toast(d.error,'error'); return; }
        toast('Password changed!','success'); closeModal('passwordModal');
        $('oldPassword').value=''; $('newPassword').value=''; $('confirmPassword').value='';
    });
}
function toggleFullRecording(){ api.post('/api/settings/toggle-recording').then(d=>toast(`Full recording ${d.fullMeetingRecording?'ON':'OFF'}`,'success')); }
function saveSpeakDetection(){
    const val=document.querySelector('input[name="speakType"]:checked')?.value||'auto';
    api.post('/api/settings/update',{speakDetectionType:val,theme:localStorage.getItem('air_theme')||'dark',fullMeetingRecording:$('fullRecordingToggle').checked})
        .then(()=>{ toast(`Speak detection: ${val}`,'success'); closeModal('speakDetectionModal'); });
}
function applyTheme(name){
    document.body.className=name==='dark'?'':'theme-'+name;
    localStorage.setItem('air_theme',name);
    $$('.theme-swatch').forEach(s=>{
        const active = s.dataset.theme===name;
        s.classList.toggle('selected',active);
        if(active){ s.classList.remove('border-transparent'); s.classList.add('border-indigo-500'); }
        else { s.classList.remove('border-indigo-500'); s.classList.add('border-transparent'); }
    });
}
function addSchedule(){
    const title=$('schedTitle').value.trim(),date=$('schedDate').value,time=$('schedTime').value,dur=$('schedDuration').value;
    if(!title||!date||!time){ toast('Fill title, date & time','error'); return; }
    schedules.push({id:Date.now(),title,date,time,duration:dur});
    localStorage.setItem('air_schedules',JSON.stringify(schedules));
    renderScheduleList(); $('schedTitle').value=''; toast('Added','success');
}
function renderScheduleList(){
    const c=$('scheduleList'); if(!c) return;
    if(!schedules.length){ c.innerHTML='<p class="text-gray-600 text-center">No scheduled meetings</p>'; return; }
    c.innerHTML=schedules.map(s=>`<div class="flex justify-between items-center px-3.5 py-2.5 bg-white/[0.03] border border-white/5 rounded-lg mb-2"><div class="flex-1"><div class="font-semibold">${escHtml(s.title)}</div><div class="text-xs text-gray-500">${s.date} at ${s.time} · ${s.duration} min</div></div><button class="btn btn-xs bg-red-500/20 border border-red-500/30 text-red-400" onclick="removeSched(${s.id})">✕</button></div>`).join('');
}
window.removeSched=id=>{ schedules=schedules.filter(s=>s.id!==id); localStorage.setItem('air_schedules',JSON.stringify(schedules)); renderScheduleList(); toast('Removed','success'); };
function applyZoomFromSlider(){ studentZoom=parseInt($('zoomRange').value,10); localStorage.setItem('air_zoom',studentZoom); applyZoom(); closeModal('zoomModal'); toast(`Zoom: ${studentZoom}%`,'success'); loadStudents(); }
function applyZoom(){ $('zoomRange').value=studentZoom; $('zoomValue').textContent=studentZoom; }
function togglePwdField(id){ const f=$(id); f.type=f.type==='password'?'text':'password'; }

// ================= MANAGER CRUD (Admin Only) =================
function loadManagers(){
    if (!isAdmin) return;
    api.get('/api/managers').then(managers => {
        renderManagers(managers);
    }).catch(e => { console.error('Load managers error:', e); });
}
function renderManagers(list){
    const c = $('managersList');
    if (!c) return;
    if(!list.length){ c.innerHTML='<div class="text-center py-16 text-gray-500"><div class="text-5xl mb-4">👔</div><p>No managers found</p></div>'; return; }
    c.innerHTML = list.map(m => `
      <div class="flex items-center bg-white/[0.02] border border-white/5 border-l-4 border-l-amber-500 rounded-lg px-5 py-4 mb-2 hover:bg-white/[0.04] transition flex-col md:flex-row gap-3">
        <div class="flex items-center gap-3 flex-1">
          ${renderAvatar(m.avatar || 'avatar-1', 'md')}
          <div class="text-center md:text-left">
            <span class="text-lg font-bold">${escHtml(m.name)}</span>
            <span class="text-gray-500 text-sm">(${escHtml(m.username)})</span>
            <span class="badge badge-sm bg-blue-500/20 border-blue-500/30 text-blue-400 ml-2">MANAGER</span>
            <div class="text-gray-600 text-xs mt-1">Created: ${m.createdAt}</div>
          </div>
        </div>
        <div class="flex gap-2 items-center flex-wrap justify-center">
          <button class="btn btn-xs bg-indigo-500 border-none text-white hover:bg-indigo-600" onclick="openEditManager(${m.id},'${escHtml(m.name)}')">✏️ Edit</button>
          <button class="btn btn-xs bg-red-700 border-none text-white hover:bg-red-800" onclick="doDeleteManager(${m.id},'${escHtml(m.name)}')">🗑️ Delete</button>
        </div>
      </div>`).join('');
}
function createManager(){
    const body={name:$('managerName').value.trim(), username:$('managerUsername').value.trim(),
                password:$('managerPassword').value};
    if(!body.name||!body.username||!body.password){ toast('All fields required','error'); return; }
    $('btnCreateManager').disabled = true;
    $('btnCreateManager').textContent = 'Creating…';
    api.post('/api/managers',body).then(d=>{
        if(d.error){ toast(d.error,'error'); return; }
        toast(`Manager "${body.name}" created!`,'success');
        $('managerName').value=''; $('managerUsername').value=''; $('managerPassword').value='';
        loadManagers();
    }).catch(e => {
        console.error('Create manager error:', e);
        toast('Failed to create manager: ' + e.message, 'error');
    }).finally(() => {
        $('btnCreateManager').disabled = false;
        $('btnCreateManager').textContent = 'Create Manager';
    });
}
window.openEditManager = (id, name) => {
    $('editManagerId').value=id; $('editManagerName').value=name; $('editManagerPassword').value='';
    openModal('editManagerModal');
};
function updateManager(){
    const id=$('editManagerId').value;
    const body={name:$('editManagerName').value.trim(), password:$('editManagerPassword').value};
    if(!body.name){ toast('Name required','error'); return; }
    api.put(`/api/managers/${id}`,body).then(d=>{
        if(d.error){ toast(d.error,'error'); return; }
        toast('Manager updated','success'); closeModal('editManagerModal'); loadManagers();
    }).catch(e => { console.error('Update manager error:', e); toast('Failed to update: ' + e.message, 'error'); });
}
window.doDeleteManager = (id, name) => showConfirm('Delete Manager',`Delete manager "${name}"? This cannot be undone.`,()=>{
    api.del(`/api/managers/${id}`).then(()=>{ loadManagers(); toast(`Manager "${name}" deleted`,'success'); });
});

