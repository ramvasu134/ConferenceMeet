/* ============================================================
   Air – Teacher Dashboard · Full Client-Side Controller
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

// ===== BOOT =====
document.addEventListener('DOMContentLoaded', () => {
    wireEvents();
    loadStudents();
    checkActiveMeeting();
    loadRecordings();
    loadSettings();
    renderScheduleList();
    applyZoom();
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
const api = {
    get:  url => fetch(url).then(r => r.json()),
    post: (url, body) => fetch(url, {method:'POST', headers:hdrs(!!body), body: body ? JSON.stringify(body) : undefined}).then(r => r.json()),
    put:  (url, body) => fetch(url, {method:'PUT',  headers:hdrs(true),  body: JSON.stringify(body)}).then(r => r.json()),
    del:  url => fetch(url, {method:'DELETE', headers:hdrs(false)}).then(r => r.json()),
};

// ===== WIRE ALL EVENTS =====
function wireEvents(){
    $$('.tab-btn').forEach(b => b.onclick = () => switchTab(b.dataset.tab));

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

    // Doubts panel
    if ($('btnRefreshDoubtsPanel')) $('btnRefreshDoubtsPanel').onclick = loadDoubtsPanel;

    // Answer doubt modal
    if ($('btnRecordAnswer')) $('btnRecordAnswer').onclick = toggleAnswerRecording;
    if ($('btnSubmitAnswer')) $('btnSubmitAnswer').onclick = submitAnswer;

    // Settings sidebar
    $('settingsOverlay').onclick  = closeSettings;
    $('sChangePassword').onclick  = () => { closeSettings(); openModal('passwordModal'); };
    $('sSchedule').onclick        = () => { closeSettings(); openModal('scheduleModal'); };
    $('sThemes').onclick          = () => { closeSettings(); openModal('themeModal'); };
    $('sSpeakDetection').onclick  = () => { closeSettings(); openModal('speakDetectionModal'); };
    $('sZoomStudents').onclick    = () => { closeSettings(); openModal('zoomModal'); };
    $('fullRecordingToggle').onchange = toggleFullRecording;
    $('sLogout').onclick          = () => location.href = '/logout';

    $('btnChangePassword').onclick    = changePassword;
    $('btnSaveStudent').onclick       = updateStudent;
    $('btnAddSchedule').onclick       = addSchedule;
    $('btnSaveSpeakDetection').onclick = saveSpeakDetection;
    $('btnApplyZoom').onclick         = applyZoomFromSlider;
    $('btnConfirmAction').onclick     = () => { if(confirmCallback) confirmCallback(); closeModal('confirmModal'); };
    $('zoomRange').oninput = () => $('zoomValue').textContent = $('zoomRange').value;

    $$('.theme-swatch').forEach(s => s.onclick = () => {
        $$('.theme-swatch').forEach(x => x.classList.remove('selected'));
        s.classList.add('selected');
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
function toast(msg, type=''){ const t=$('toast'); t.textContent=msg; t.className='toast show '+type; setTimeout(()=>t.classList.remove('show'),3000); }
function openModal(id){ $(id).classList.add('show'); }
function closeModal(id){ $(id).classList.remove('show'); }
function showConfirm(title,msg,cb){ $('confirmTitle').textContent=title; $('confirmMsg').textContent=msg; confirmCallback=cb; openModal('confirmModal'); }

// ===== TABS =====
function switchTab(tab){
    $$('.tab-btn').forEach(b => b.classList.toggle('active', b.dataset.tab===tab));
    $$('.tab-pane').forEach(p => p.classList.toggle('active', p.id===tab));
    if(tab==='students-list') loadStudents();
    if(tab==='recordings')    loadRecordings();
    if(tab==='chat' && currentMeeting) loadChatMessages();
}

// ================= STUDENTS LIST =================
function loadStudents(){
    api.get('/api/students').then(students => { renderStudents(students); updateOnlineCount(students); });
}
function searchStudentsList(){
    const q = $('searchStudents').value;
    api.get(q ? `/api/students?search=${encodeURIComponent(q)}` : '/api/students').then(renderStudents);
}
function renderStudents(list){
    const c = $('studentsList');
    if(!list.length){ c.innerHTML='<div class="empty-state"><div class="icon">👥</div><p>No students found</p></div>'; return; }
    c.innerHTML = list.map(s => `
      <div class="student-row" style="font-size:${studentZoom}%">
        <div class="student-info">
          <span class="name">${escHtml(s.name)}</span>
          <span class="username">(${escHtml(s.username)})</span>
          <span class="status">
            <span class="status-dot ${s.online?'online':'offline'}"></span>
            ${s.online?'<span style="color:#2ecc71">Online</span>':'<span style="color:#e63946">Offline</span>'}
          </span>
          <div class="dates">Created: ${s.createdAt} | Last seen: ${s.lastSeen}</div>
        </div>
        <div class="student-actions">
          <button class="action-btn btn-whatsapp" onclick="contactWhatsApp('${escHtml(s.name)}')">💬</button>
          <button class="action-btn btn-edit" onclick="openEditStudent(${s.id},'${escHtml(s.name)}',${s.deviceLock},${s.showRecordings})">✏️ Edit</button>
          <button class="action-btn btn-block ${s.blocked?'blocked':''}" onclick="doToggleBlock(${s.id})">${s.blocked?'🔓 Unblock':'🚫 Block'}</button>
          <button class="action-btn btn-mute ${s.muted?'muted':''}" onclick="doToggleMute(${s.id})">${s.muted?'🔊 Unmute':'🔇 Mute'}</button>
          <button class="action-btn btn-delete" onclick="doDeleteStudent(${s.id},'${escHtml(s.name)}')">🗑️ Delete</button>
        </div>
      </div>`).join('');
}
function updateOnlineCount(students){ $('onlineCount').textContent = students.filter(s=>s.online).length; }

window.contactWhatsApp = name => toast(`WhatsApp sharing for ${name} — integration ready`, 'success');
window.openEditStudent = (id,name,dl,sr) => {
    $('editStudentId').value=id; $('editStudentName').value=name; $('editStudentPassword').value='';
    $('editDeviceLock').checked=dl; $('editShowRecordings').checked=sr; openModal('editStudentModal');
};
window.doToggleBlock = id => api.post(`/api/students/${id}/block`).then(()=>{ loadStudents(); toast('Block toggled','success'); });
window.doToggleMute  = id => api.post(`/api/students/${id}/mute`).then(()=>{ loadStudents(); toast('Mute toggled','success'); });
window.doDeleteStudent = (id,name) => showConfirm('Delete Student',`Delete "${name}"? Cannot undo.`,()=>{
    api.del(`/api/students/${id}`).then(()=>{ loadStudents(); toast(`"${name}" deleted`,'success'); });
});
function updateStudent(){
    const id=$('editStudentId').value;
    const body={name:$('editStudentName').value.trim(), password:$('editStudentPassword').value,
                deviceLock:$('editDeviceLock').checked, showRecordings:$('editShowRecordings').checked};
    if(!body.name){ toast('Name required','error'); return; }
    api.put(`/api/students/${id}`,body).then(d=>{
        if(d.error){ toast(d.error,'error'); return; }
        toast('Updated','success'); closeModal('editStudentModal'); loadStudents();
    });
}

// ================= CREATE STUDENT =================
function createStudent(){
    const body={name:$('studentName').value.trim(), username:$('studentUsername').value.trim(),
                password:$('studentPassword').value, deviceLock:$('deviceLock').checked, showRecordings:$('showRecordings').checked};
    if(!body.name||!body.username||!body.password){ toast('All fields required','error'); return; }
    api.post('/api/students',body).then(d=>{
        if(d.error){ toast(d.error,'error'); return; }
        toast(`"${body.name}" created!`,'success');
        $('studentName').value=''; $('studentUsername').value=''; $('studentPassword').value='';
        $('deviceLock').checked=false; $('showRecordings').checked=true;
        $('optDeviceLock').classList.remove('active'); $('optShowRec').classList.add('active');
        switchTab('students-list');
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
        btn.textContent='End Meeting'; btn.classList.add('end-meeting');
        dot.classList.add('recording'); tmr.classList.add('active');
        ban.innerHTML='<span style="color:#2ecc71;font-weight:600">🟢 Meeting Active — Broadcasting to students. Click 🎤 to start voice.</span>';
        ban.classList.add('live');
    } else {
        btn.textContent='Start Meeting'; btn.classList.remove('end-meeting');
        dot.classList.remove('recording'); tmr.classList.remove('active');
        ban.innerHTML='<span class="banner-idle">Press <strong>Start Meeting</strong> to begin</span>';
        ban.classList.remove('live');
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

        // On stop → final upload + auto-save locally + meeting recording
        broadcastProcessor.onStop = (fullBlob) => {
            uploadBroadcastChunk(fullBlob);
            uploadMeetingRecording(fullBlob);

            // Auto-save broadcast to teacher's local Downloads folder
            autoSaveCounter++;
            localStorage.setItem('air_autoSaveCount', autoSaveCounter);
            const ts = new Date().toISOString().replace(/[:.]/g,'-').slice(0,19);
            autoSaveLocal(fullBlob, `broadcast_${teacherName}_${ts}.webm`);
            toast(`📁 Broadcast auto-saved locally (#${autoSaveCounter})`, 'success');
        };

        // Periodic local auto-save: every 30 seconds, save accumulated chunks
        startBroadcastAutoSave();

        // Record in 5-second timeslices
        broadcastProcessor.startRecording(5000);

        // Visualise
        $('audioVisualiser').classList.add('active');
        broadcastProcessor.drawVisualiser($('audioCanvas'));

        isMicActive=true;
        $('btnMicToggle').classList.add('active');
        $('btnMic').classList.add('active-ctrl');
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
    $('btnMic').classList.remove('active-ctrl');
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
        // Color changes for high level
        if (pct > 70) fill.classList.add('high');
        else fill.classList.remove('high');
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
    if (broadcastLocalChunks.length === 0) return;
    try {
        const merged = new Blob(broadcastLocalChunks, { type: 'audio/webm' });
        if (merged.size < 500) return; // skip tiny saves
        autoSaveCounter++;
        localStorage.setItem('air_autoSaveCount', autoSaveCounter);
        const ts = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
        autoSaveLocal(merged, `broadcast_autosave_${teacherName}_${ts}_part${autoSaveCounter}.webm`);
        broadcastLocalChunks = []; // reset after flush
        console.log(`[AutoSave] Saved broadcast part #${autoSaveCounter}`);
    } catch (e) { console.error('[AutoSave] Error:', e); }
}

// ===== SPEAKER =====
function toggleSpeaker(){
    isSpeakerOn=!isSpeakerOn;
    const icon=isSpeakerOn?'🔊':'🔇';
    $('btnSpeaker').textContent=icon;
    $('btnSpeakerToggle').querySelector('.ctrl-icon').textContent=icon;
    if(!isSpeakerOn){ $('btnSpeaker').classList.add('muted-ctrl'); $('btnSpeakerToggle').classList.add('off'); }
    else            { $('btnSpeaker').classList.remove('muted-ctrl'); $('btnSpeakerToggle').classList.remove('off'); }
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
        if(!doubts.length){ c.innerHTML='<div class="empty-state" style="padding:20px"><p>No doubts yet</p></div>'; return; }

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
          <div class="doubt-card ${d.answered?'answered':'pending'}">
            <div class="doubt-header">
              <strong>${escHtml(d.studentName)}</strong>
              <span style="color:#888;font-size:12px">${d.createdAt} · ${fmtDur(d.durationSeconds)}</span>
              ${d.answered?'<span class="doubt-badge answered">✅ Answered</span>':'<span class="doubt-badge pending">⏳ Pending</span>'}
            </div>
            <audio class="audio-player" controls preload="none" src="/api/doubts/${d.id}/play" style="width:100%;margin:6px 0"></audio>
            ${!d.answered?`<button class="btn-confirm" style="font-size:12px;padding:6px 14px" onclick="openAnswerDoubt(${d.id})">💬 Answer</button>`:''}
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
        tBadge.className = 'speaking-avatar';
        tBadge.style.background = 'rgba(108,99,255,0.15)';
        tBadge.style.borderColor = 'rgba(108,99,255,0.3)';
        tBadge.style.color = '#6c63ff';
        tBadge.innerHTML = `<span class="sa-dot" style="background:#6c63ff"></span>You (Teacher)`;
        container.appendChild(tBadge);
    }

    // Show student speakers
    speakerNames.forEach(name => {
        const badge = document.createElement('span');
        badge.className = 'speaking-avatar';
        badge.innerHTML = `<span class="sa-dot"></span>${escHtml(name)}`;
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
        // Auto-save answer audio to teacher's local Downloads
        const ts = new Date().toISOString().replace(/[:.]/g,'-').slice(0,19);
        autoSaveLocal(answerBlob, `answer_doubt${id}_${ts}.webm`);
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
    const c=$('chatMessages'); const nc=c.querySelector('.no-chat'); if(nc) nc.remove();
    const role=m.senderRole==='TEACHER'?'teacher':'student';
    const div=document.createElement('div'); div.className='chat-msg '+role;
    div.innerHTML=`<div class="sender">${escHtml(m.senderName)}</div><div class="content">${escHtml(m.content)}</div><div class="time">${m.timestamp}</div>`;
    c.appendChild(div); c.scrollTop=c.scrollHeight;
}
function loadChatMessages(){
    if(!currentMeeting) return;
    api.get(`/api/meeting/${currentMeeting.id}/chat`).then(msgs=>{
        const c=$('chatMessages');
        if(!msgs.length){ c.innerHTML='<div class="no-chat">No messages yet.</div>'; return; }
        c.innerHTML=''; msgs.forEach(appendChat);
    });
}

// ================= RECORDINGS =================
function loadRecordings(){
    api.get('/api/recordings').then(list=>{
        const c=$('recordingsList');
        if(!list.length){ c.innerHTML='<div class="empty-state"><div class="icon">📼</div><p>No recordings yet</p></div>'; return; }
        c.innerHTML=list.map(r=>`
          <div class="recording-item">
            <div class="recording-info">
              <div class="rec-name">🎤 ${escHtml(r.fileName)}</div>
              <div class="rec-meta">${r.studentName||'Teacher'} · ${fmtDur(r.durationSeconds)} · ${fmtSize(r.fileSize)} · ${r.createdAt}</div>
              <audio class="audio-player" controls preload="none" src="/api/recordings/${r.id}/play"></audio>
            </div>
            <div class="recording-actions">
              <button class="btn-play" onclick="playRec(${r.id})">▶ Play</button>
              <button class="btn-download" onclick="downloadRec(${r.id},'${escHtml(r.fileName)}')">⬇ Download</button>
              <button class="btn-del-rec" onclick="delRec(${r.id})">🗑 Delete</button>
            </div>
          </div>`).join('');
    });
}
window.playRec = id => { const a=document.querySelector(`audio[src="/api/recordings/${id}/play"]`); if(a) a.paused?a.play():a.pause(); };
window.downloadRec = (id,name) => { const a=document.createElement('a'); a.href=`/api/recordings/${id}/play`; a.download=name; document.body.appendChild(a); a.click(); a.remove(); };
window.delRec = id => showConfirm('Delete Recording','Permanently delete?',()=>{ api.del(`/api/recordings/${id}`).then(()=>{ loadRecordings(); toast('Deleted','success'); }); });

// ================= SETTINGS =================
function openSettings(){ $('settingsOverlay').classList.add('show'); $('settingsSidebar').classList.add('show'); }
function closeSettings(){ $('settingsOverlay').classList.remove('show'); $('settingsSidebar').classList.remove('show'); }
function loadSettings(){ api.get('/api/settings').then(s=>{ $('fullRecordingToggle').checked=s.fullMeetingRecording; }); }
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
    $$('.theme-swatch').forEach(s=>s.classList.toggle('selected',s.dataset.theme===name));
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
    if(!schedules.length){ c.innerHTML='<p style="color:#666;text-align:center">No scheduled meetings</p>'; return; }
    c.innerHTML=schedules.map(s=>`<div class="sched-entry"><div class="sched-info"><div class="sched-title">${escHtml(s.title)}</div><div class="sched-time">${s.date} at ${s.time} · ${s.duration} min</div></div><button class="sched-remove" onclick="removeSched(${s.id})">✕</button></div>`).join('');
}
window.removeSched=id=>{ schedules=schedules.filter(s=>s.id!==id); localStorage.setItem('air_schedules',JSON.stringify(schedules)); renderScheduleList(); toast('Removed','success'); };
function applyZoomFromSlider(){ studentZoom=parseInt($('zoomRange').value,10); localStorage.setItem('air_zoom',studentZoom); applyZoom(); closeModal('zoomModal'); toast(`Zoom: ${studentZoom}%`,'success'); loadStudents(); }
function applyZoom(){ $('zoomRange').value=studentZoom; $('zoomValue').textContent=studentZoom; }
function togglePwdField(id){ const f=$(id); f.type=f.type==='password'?'text':'password'; }
