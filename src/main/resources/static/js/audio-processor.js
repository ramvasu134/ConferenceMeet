/* ============================================================
   mtng – AudioProcessor v2
   Ultra-aggressive voice clarity pipeline for noisy environments
   HighPass → multi-band noise cut → NoiseGate → Compressor →
   Limiter → Gain → De-esser → output
   + Voice Activity Detection with callbacks
   + Auto-save blobs to local filesystem
   ============================================================ */

class AudioProcessor {

    constructor() {
        this.audioCtx          = null;
        this.sourceNode        = null;
        this.processorChain    = [];
        this.analyser          = null;
        this.destinationStream = null;
        this.mediaRecorder     = null;
        this.chunks            = [];
        this.isRecording       = false;
        this.onChunk           = null;     // callback(blob) per timeslice
        this.onStop            = null;     // callback(blob) when recording stops
        this.onSpeaking        = null;     // callback()  when voice detected
        this.onSilence         = null;     // callback()  when voice stops
        this.animFrameId       = null;
        this._isSpeaking       = false;
        this._vadInterval      = null;
    }

    /* ==============================================================
       Build the full pipeline from raw mic stream.
       Everything is designed for MAXIMUM voice clarity in noisy rooms.
       ============================================================== */
    async init(rawStream) {
        this.audioCtx = new (window.AudioContext || window.webkitAudioContext)({
            sampleRate: 48000
        });

        this.sourceNode = this.audioCtx.createMediaStreamSource(rawStream);

        // ---- 1. AGGRESSIVE HIGH-PASS — kill everything below 100 Hz ----
        //         (removes fans, AC, traffic rumble, footsteps)
        const hp1 = this._biquad('highpass', 100, 1.0);
        const hp2 = this._biquad('highpass', 100, 1.0); // cascade for -24dB/oct

        // ---- 2. LOW-PASS — kill everything above 7.5 kHz ----
        //         (removes hiss, electronic whine, sibilance artefacts)
        const lp1 = this._biquad('lowpass', 7500, 0.8);
        const lp2 = this._biquad('lowpass', 7500, 0.8); // cascade

        // ---- 3. NOTCH FILTERS — kill mains hum and harmonics ----
        const notch50  = this._biquad('notch', 50, 35);
        const notch60  = this._biquad('notch', 60, 35);
        const notch100 = this._biquad('notch', 100, 30);  // 2nd harmonic
        const notch120 = this._biquad('notch', 120, 30);
        const notch150 = this._biquad('notch', 150, 25);  // 3rd harmonic

        // ---- 4. MID-SCOOP — cut 200-400 Hz muddiness ----
        const midScoop = this._biquad('peaking', 300, 1.5);
        midScoop.gain.value = -4; // cut

        // ---- 5. PRESENCE BOOST — voice clarity at 2.5-4 kHz ----
        const presence1 = this._biquad('peaking', 2800, 1.2);
        presence1.gain.value = 6; // +6 dB — strong boost

        const presence2 = this._biquad('peaking', 4000, 1.0);
        presence2.gain.value = 3; // +3 dB gentle lift

        // ---- 6. NOISE GATE — hard-cut ambient noise ----
        //     Aggressive threshold; 200 ms hold; smooth fade
        const gateThreshold = 0.02;
        const gateBuffSize  = 2048;
        const noiseGate     = this.audioCtx.createScriptProcessor(gateBuffSize, 1, 1);
        let gateOpen     = false;
        let holdCounter  = 0;
        const holdFrames = Math.ceil(0.20 * 48000 / gateBuffSize); // 200 ms
        let envelope     = 0;

        noiseGate.onaudioprocess = (e) => {
            const inp = e.inputBuffer.getChannelData(0);
            const out = e.outputBuffer.getChannelData(0);

            // RMS level
            let sumSq = 0;
            for (let i = 0; i < inp.length; i++) sumSq += inp[i] * inp[i];
            const rms = Math.sqrt(sumSq / inp.length);

            if (rms > gateThreshold) {
                gateOpen = true;
                holdCounter = holdFrames;
            } else if (holdCounter > 0) {
                holdCounter--;
            } else {
                gateOpen = false;
            }

            // Smooth envelope follower (attack 5ms, release 50ms)
            const target = gateOpen ? 1.0 : 0.0;
            const coeff  = gateOpen ? 0.15 : 0.03;
            envelope += (target - envelope) * coeff;

            for (let i = 0; i < inp.length; i++) {
                out[i] = inp[i] * envelope;
            }
        };

        // ---- 7. COMPRESSOR — aggressive dynamic range squash ----
        const compressor = this.audioCtx.createDynamicsCompressor();
        compressor.threshold.value = -35;
        compressor.knee.value      = 6;
        compressor.ratio.value     = 10;   // heavy compression
        compressor.attack.value    = 0.002; // 2 ms — instant catch
        compressor.release.value   = 0.12;  // 120 ms

        // ---- 8. LIMITER — prevent clipping ----
        const limiter = this.audioCtx.createDynamicsCompressor();
        limiter.threshold.value = -3;
        limiter.knee.value      = 0;
        limiter.ratio.value     = 20;
        limiter.attack.value    = 0.001;
        limiter.release.value   = 0.05;

        // ---- 9. MAKE-UP GAIN — big boost so voice is LOUD ----
        const gainNode = this.audioCtx.createGain();
        gainNode.gain.value = 3.0;  // ~+9.5 dB — very loud & clear

        // ---- ANALYSER ----
        this.analyser = this.audioCtx.createAnalyser();
        this.analyser.fftSize = 256;
        this.analyser.smoothingTimeConstant = 0.6;

        // ---- Wire chain ----
        const chain = [
            hp1, hp2,
            lp1, lp2,
            notch50, notch60, notch100, notch120, notch150,
            midScoop,
            presence1, presence2,
            noiseGate,
            compressor,
            limiter,
            gainNode
        ];

        let prev = this.sourceNode;
        for (const node of chain) {
            prev.connect(node);
            prev = node;
        }
        prev.connect(this.analyser);

        // Destination for recording
        this.destinationStream = this.audioCtx.createMediaStreamDestination();
        prev.connect(this.destinationStream);

        this.processorChain = chain;

        // Start Voice Activity Detection polling
        this._startVAD();

        return this.destinationStream.stream;
    }

    /** Helper: create a BiquadFilter */
    _biquad(type, freq, q) {
        const f = this.audioCtx.createBiquadFilter();
        f.type = type;
        f.frequency.value = freq;
        f.Q.value = q;
        return f;
    }

    /* ==============================================================
       Voice Activity Detection — polls analyser, fires callbacks
       ============================================================== */
    _startVAD() {
        const speechThreshold = 0.08; // level that counts as "speaking"
        const silenceDelay    = 600;  // ms of silence before onSilence fires
        let silenceTimer = null;

        this._vadInterval = setInterval(() => {
            const level = this.getLevel();
            if (level >= speechThreshold && !this._isSpeaking) {
                this._isSpeaking = true;
                if (silenceTimer) { clearTimeout(silenceTimer); silenceTimer = null; }
                if (this.onSpeaking) this.onSpeaking();
            } else if (level < speechThreshold && this._isSpeaking) {
                if (!silenceTimer) {
                    silenceTimer = setTimeout(() => {
                        this._isSpeaking = false;
                        if (this.onSilence) this.onSilence();
                        silenceTimer = null;
                    }, silenceDelay);
                }
            }
        }, 100);
    }

    _stopVAD() {
        if (this._vadInterval) { clearInterval(this._vadInterval); this._vadInterval = null; }
        this._isSpeaking = false;
    }

    get isSpeaking() { return this._isSpeaking; }

    /* ==============================================================
       Recording
       ============================================================== */
    startRecording(timesliceMs = 0) {
        if (!this.destinationStream) throw new Error('Call init() first');
        this.chunks = [];
        this.isRecording = true;

        let opts;
        try { opts = { mimeType: 'audio/webm;codecs=opus' }; new MediaRecorder(this.destinationStream.stream, opts); }
        catch { opts = undefined; }

        this.mediaRecorder = new MediaRecorder(this.destinationStream.stream, opts);

        this.mediaRecorder.ondataavailable = (e) => {
            if (e.data.size > 0) {
                this.chunks.push(e.data);
                if (this.onChunk) this.onChunk(e.data);
            }
        };

        this.mediaRecorder.onstop = () => {
            const blob = new Blob(this.chunks, { type: 'audio/webm' });
            if (this.onStop) this.onStop(blob);
            this.isRecording = false;
        };

        timesliceMs > 0 ? this.mediaRecorder.start(timesliceMs) : this.mediaRecorder.start();
    }

    stopRecording() {
        if (this.mediaRecorder && this.mediaRecorder.state !== 'inactive') {
            this.mediaRecorder.stop();
        }
    }

    /* ==============================================================
       Visualiser
       ============================================================== */
    drawVisualiser(canvas) {
        if (!this.analyser || !canvas) return;
        const ctx = canvas.getContext('2d');
        const bufLen = this.analyser.frequencyBinCount;
        const data = new Uint8Array(bufLen);

        const draw = () => {
            this.animFrameId = requestAnimationFrame(draw);
            this.analyser.getByteFrequencyData(data);
            ctx.clearRect(0, 0, canvas.width, canvas.height);
            const barW = (canvas.width / bufLen) * 2.5;
            let x = 0;
            for (let i = 0; i < bufLen; i++) {
                const h = (data[i] / 255) * canvas.height;
                const g = Math.min(255, 99 + data[i]);
                ctx.fillStyle = this._isSpeaking
                    ? `rgb(46, ${150 + data[i]/3}, 113)`   // green when speaking
                    : `rgb(108, ${g}, 255)`;                // purple when idle
                ctx.fillRect(x, canvas.height - h, barW, h);
                x += barW + 1;
            }
        };
        draw();
    }

    stopVisualiser() {
        if (this.animFrameId) cancelAnimationFrame(this.animFrameId);
        this.animFrameId = null;
    }

    /** Get current level 0..1 */
    getLevel() {
        if (!this.analyser) return 0;
        const data = new Uint8Array(this.analyser.frequencyBinCount);
        this.analyser.getByteFrequencyData(data);
        let sum = 0;
        for (let i = 0; i < data.length; i++) sum += data[i];
        return sum / (data.length * 255);
    }

    /** Tear down */
    destroy() {
        this.stopRecording();
        this.stopVisualiser();
        this._stopVAD();
        if (this.sourceNode) { try { this.sourceNode.disconnect(); } catch {} }
        this.processorChain.forEach(n => { try { n.disconnect(); } catch {} });
        if (this.analyser) { try { this.analyser.disconnect(); } catch {} }
        if (this.audioCtx && this.audioCtx.state !== 'closed') this.audioCtx.close();
        this.audioCtx = null;
        this.sourceNode = null;
        this.processorChain = [];
        this.analyser = null;
        this.destinationStream = null;
    }
}

/* ==============================================================
   Auto-save a Blob as file to user's local Downloads folder.
   Silently creates a download link and clicks it — no prompt.
   ============================================================== */
function autoSaveLocal(blob, fileName) {
    const url = URL.createObjectURL(blob);
    const a   = document.createElement('a');
    a.href     = url;
    a.download = fileName;
    a.style.display = 'none';
    document.body.appendChild(a);
    a.click();
    setTimeout(() => { document.body.removeChild(a); URL.revokeObjectURL(url); }, 1000);
}

window.AudioProcessor = AudioProcessor;
window.autoSaveLocal  = autoSaveLocal;
