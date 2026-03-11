import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

document.addEventListener('DOMContentLoaded', () => {
  const apiKey = localStorage.getItem('mindweave_llm_api_key');
  const apiStatusEl = document.getElementById('api-status');
  const chatInput = document.getElementById('player-input');
  const sendBtn = document.getElementById('btn-send');
  const chatHistory = document.getElementById('chat-history');

  const phaseTitle = document.getElementById('phase-title');
  const phaseContent = document.getElementById('phase-content');
  const phaseButtons = Array.from(document.querySelectorAll('.phase-btn'));
  const telemetryEl = document.getElementById('telemetry');
  const finalScoreEl = document.getElementById('final-score');
  const protocolScoreListEl = document.getElementById('protocol-score-list');
  const objectiveLog = document.getElementById('objective-log');
  const btnHome = document.getElementById('btn-home');
  const btnSettings = document.getElementById('btn-settings');
  const btnNewGame = document.getElementById('btn-new-game');
  const settingsModal = document.getElementById('settings-modal');
  const settingsClose = document.getElementById('settings-close');
  const bgmVolumeInput = document.getElementById('bgm-volume');
  const sfxVolumeInput = document.getElementById('sfx-volume');
  const bgmMuteInput = document.getElementById('bgm-mute');
  const sfxMuteInput = document.getElementById('sfx-mute');
  const voiceVolumeInput = document.getElementById('voice-volume');
  const voiceMuteInput = document.getElementById('voice-mute');

  const iqValue = document.getElementById('iq-value');
  const iqBar = document.getElementById('iq-bar');
  const eqSyncValue = document.getElementById('eq-sync-value');
  const eqSyncBar = document.getElementById('eq-sync-bar');
  const progressValue = document.getElementById('progress-value');
  const progressBar = document.getElementById('progress-bar');
  const emotionIndicator = document.getElementById('emotion-indicator');

  const audioLibrary = {
    bgm: ['../src/audio/bg_01.mp3', '../src/audio/bg_02.mp3', '../src/audio/bg_03.mp3', '../src/audio/bg_04.mp3'],
    sfx: {
      error: '../src/audio/error.mp3',
      correct: '../src/audio/correct.mp3',
      wrong: '../src/audio/wrong.mp3',
    },
    voice: {
      briefing: '../src/audio/A7_01_mission_briefing.m4a',
      briefingAcknowledge: '../src/audio/A7_02_briefing_acknowledge.m4a',
      protocol1: '../src/audio/A7_campaign_protocol_01.m4a',
      protocol2: '../src/audio/A7_campaign_protocol_02.m4a',
      protocol3: '../src/audio/A7_campaign_protocol_03.m4a',
      protocol4: '../src/audio/A7_campaign_protocol_04.m4a',
      chatError: '../src/audio/A7_chat_error.m4a',
      calmResponse: '../src/audio/A7_calm_response.m4a',
      stressResponse: '../src/audio/A7_stress_response.m4a',
      thinkingResponse: '../src/audio/A7_thinking_response.m4a',
      ambiguousResponse: '../src/audio/A7_ambiguous_chat.mp4',
      debriefReceived: '../src/audio/A7_final_debrief.m4a',
    }
  };

  const audioState = {
    bgmVolume: 0.6,
    sfxVolume: 0.75,
    voiceVolume: 1,
    bgmMuted: false,
    sfxMuted: false,
    voiceMuted: false,
    bgmCurrent: null,
    bgmNext: null,
    bgmFadeInterval: null,
    bgmTrackIndex: 0,
  };

  const voiceCache = new Map();
  const sfxCache = new Map();

  const voicePriority = {
    protocol: 4,
    sequence: 3,
    reply: 2,
    reaction: 1,
  };

  const voiceQueue = [];
  let activeVoiceJob = null;
  let hasPlayedStartupBriefing = false;

  const gameState = {
    phase: 'briefing',
    iqScore: 48,
    eqScore: 82,
    progress: 0,
    completedObjectives: new Set(),
    activeSessionId: null,
    nbackSequence: [],
    resourceTarget: 14,
    regulationBreaths: 0,
    challengeAttempts: {
      nback_clear: { count: 0, locked: false },
      resource_clear: { count: 0, locked: false },
      logic_clear: { count: 0, locked: false },
      micro_clear: { count: 0, locked: false },
    },
    protocolScore: {
      iq: 0,
      eq: 0,
      debrief: 0,
    },
  };

  const protocolWeights = {
    iq: 45,
    eq: 35,
    debrief: 20,
  };


  if (!apiKey) {
    apiStatusEl.textContent = 'ERROR: No LLM Key detected. Neural link severed.';
    apiStatusEl.classList.replace('text-yellow-400', 'text-red-500');
    appendChat('SYSTEM', 'CRITICAL ERROR: API key missing. Return to launcher and configure BYOK credentials.', 'text-red-500');
  } else {
    apiStatusEl.textContent = 'Uplink Secure. LLM Active.';
    apiStatusEl.classList.replace('text-yellow-400', 'text-green-400');
    chatInput.disabled = false;
    sendBtn.disabled = false;
    chatInput.focus();
  }

  btnHome.addEventListener('click', () => {
    window.location.href = '/index.html';
  });

  btnSettings.addEventListener('click', () => {
    openSettings();
  });

  btnNewGame.addEventListener('click', () => {
    resetGameState();
  });

  document.getElementById('btn-exit').addEventListener('click', () => {
    window.location.href = '/index.html';
  });

  const container = document.getElementById('canvas-container');
  const scene = new THREE.Scene();
  scene.fog = new THREE.FogExp2(0x020617, 0.04);
  const aspect = window.innerWidth / window.innerHeight;
  const frustumSize = 20;
  const camera = new THREE.OrthographicCamera(frustumSize * aspect / -2, frustumSize * aspect / 2, frustumSize / 2, frustumSize / -2, 1, 1000);
  camera.position.set(20, 20, 20);
  camera.lookAt(0, 0, 0);

  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.setPixelRatio(window.devicePixelRatio);
  container.appendChild(renderer.domElement);

  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enablePan = false;
  controls.enableZoom = false;
  controls.enableDamping = true;

  scene.add(new THREE.AmbientLight(0xffffff, 0.4));
  const dirLight = new THREE.DirectionalLight(0x38bdf8, 2);
  dirLight.position.set(10, 20, 10);
  scene.add(dirLight);
  const redLight = new THREE.PointLight(0xef4444, 1.5, 20);
  redLight.position.set(-5, 5, -5);
  scene.add(redLight);

  const gridGroup = new THREE.Group();
  const tileGeo = new THREE.BoxGeometry(1.9, 0.5, 1.9);
  for (let i = -3; i < 4; i++) {
    for (let j = -3; j < 4; j++) {
      if (Math.random() > 0.85) continue;
      const mat = new THREE.MeshStandardMaterial({ color: Math.random() > 0.9 ? 0x38bdf8 : 0x1e293b, emissive: 0x0ea5e9, emissiveIntensity: Math.random() > 0.9 ? 0.5 : 0.08 });
      const mesh = new THREE.Mesh(tileGeo, mat);
      mesh.position.set(i * 2, (Math.random() * 0.5) - 0.25, j * 2);
      mesh.userData.baseY = mesh.position.y;
      gridGroup.add(mesh);
    }
  }
  scene.add(gridGroup);

  const npcMesh = new THREE.Mesh(
    new THREE.IcosahedronGeometry(1.5, 1),
    new THREE.MeshPhysicalMaterial({ color: 0xffffff, emissive: 0x38bdf8, roughness: 0.1, transmission: 0.8, thickness: 1.0 })
  );
  npcMesh.position.set(0, 3, 0);
  scene.add(npcMesh);

  const emotionColors = { neutral: 0x38bdf8, stress: 0xef4444, calm: 0x10b981, thinking: 0xa855f7 };
  let currentEmotion = 'neutral';

  const architectProtocolResponses = {
    briefing: { text: 'Campaign Protocol 1 engaged. Confirm mission parameters and we will synchronize the civic lattice.', voice: audioLibrary.voice.protocol1 },
    iq: { text: 'Campaign Protocol 2 online. Precision first, Weaver—stability emerges from correct sequence decisions.', voice: audioLibrary.voice.protocol2 },
    eq: { text: 'Campaign Protocol 3 active. Emotional calibration in progress. Lead with validation, then coordinate recovery.', voice: audioLibrary.voice.protocol3 },
    debrief: { text: 'Campaign Protocol 4 unlocked. Integrate cognition and empathy, then encode your transfer strategy.', voice: audioLibrary.voice.protocol4 }
  };

  function resolveAudioPath(path) {
    return path;
  }

  function createAudio(path, loop = false) {
    const audio = new Audio(resolveAudioPath(path));
    audio.loop = loop;
    audio.preload = 'auto';
    return audio;
  }

  function cacheSfx() {
    Object.entries(audioLibrary.sfx).forEach(([key, path]) => {
      sfxCache.set(key, createAudio(path));
    });
  }

  function playSfx(kind) {
    if (audioState.sfxMuted) return;
    const base = sfxCache.get(kind) || createAudio(audioLibrary.sfx[kind]);
    const instance = base.cloneNode();
    instance.volume = audioState.sfxVolume;
    instance.play().catch(() => {});
  }

  function processVoiceQueue() {
    if (activeVoiceJob || !voiceQueue.length) return;
    const nextJob = voiceQueue.shift();
    const cached = voiceCache.get(nextJob.path) || createAudio(nextJob.path);
    voiceCache.set(nextJob.path, cached);
    const instance = cached.cloneNode();
    activeVoiceJob = { ...nextJob, audio: instance };

    instance.volume = audioState.voiceMuted ? 0 : audioState.voiceVolume;
    instance.play().catch(() => {
      activeVoiceJob = null;
      if (nextJob.resolve) nextJob.resolve();
      processVoiceQueue();
    });

    instance.addEventListener('ended', () => {
      const finish = () => {
        activeVoiceJob = null;
        if (nextJob.resolve) nextJob.resolve();
        processVoiceQueue();
      };
      if (nextJob.delayMs) {
        setTimeout(finish, nextJob.delayMs);
      } else {
        finish();
      }
    }, { once: true });
  }

  function enqueueVoice(path, options = {}) {
    if (!path || audioState.voiceMuted) return Promise.resolve();
    const {
      priority = voicePriority.reaction,
      clearQueue = false,
      interrupt = false,
      delayMs = 0,
    } = options;

    if (clearQueue) voiceQueue.length = 0;

    if (interrupt && activeVoiceJob?.audio) {
      activeVoiceJob.audio.pause();
      activeVoiceJob.audio.currentTime = 0;
      activeVoiceJob = null;
    }

    return new Promise((resolve) => {
      voiceQueue.push({ path, priority, delayMs, resolve });
      voiceQueue.sort((a, b) => b.priority - a.priority);
      processVoiceQueue();
    });
  }

  function fadeTrack(audio, from, to, durationMs, onDone) {
    const steps = 20;
    const delta = (to - from) / steps;
    let i = 0;
    audio.volume = Math.max(0, Math.min(1, from));
    const id = setInterval(() => {
      i += 1;
      audio.volume = Math.max(0, Math.min(1, from + (delta * i)));
      if (i >= steps) {
        clearInterval(id);
        if (onDone) onDone();
      }
    }, Math.max(50, durationMs / steps));
    return id;
  }

  function startBgmTrack(trackIndex = 0) {
    const totalTracks = audioLibrary.bgm.length;
    if (!totalTracks) return;

    const normalizedIndex = ((trackIndex % totalTracks) + totalTracks) % totalTracks;
    audioState.bgmTrackIndex = normalizedIndex;

    if (audioState.bgmCurrent) {
      audioState.bgmCurrent.pause();
      audioState.bgmCurrent.currentTime = 0;
      audioState.bgmCurrent = null;
    }

    const nextTrack = createAudio(audioLibrary.bgm[normalizedIndex], false);
    audioState.bgmCurrent = nextTrack;
    nextTrack.volume = audioState.bgmMuted ? 0 : audioState.bgmVolume;
    nextTrack.addEventListener('ended', () => {
      startBgmTrack((normalizedIndex + 1) % totalTracks);
    }, { once: true });
    nextTrack.play().catch(() => {});
  }

  function startBgm() {
    startBgmTrack(0);
  }

  function applyAudioSettings() {
    if (audioState.bgmCurrent) audioState.bgmCurrent.volume = audioState.bgmMuted ? 0 : audioState.bgmVolume;
    if (activeVoiceJob?.audio) activeVoiceJob.audio.volume = audioState.voiceMuted ? 0 : audioState.voiceVolume;
    if (audioState.bgmNext) audioState.bgmNext.volume = audioState.bgmMuted ? 0 : audioState.bgmVolume;
  }

  function openSettings() {
    settingsModal.classList.remove('hidden');
    settingsModal.setAttribute('aria-hidden', 'false');
  }

  function closeSettings() {
    settingsModal.classList.add('hidden');
    settingsModal.setAttribute('aria-hidden', 'true');
  }

  function renderTelemetry() {
    telemetryEl.innerHTML = `
      <div>Phase: ${gameState.phase.toUpperCase()}</div>
      <div>Objectives: ${gameState.completedObjectives.size}/7</div>
      <div>Session: ${gameState.activeSessionId || 'pending'}</div>
      <div>Breaths: ${gameState.regulationBreaths}</div>
    `;
  }

  function markObjective(id, label) {
    if (!gameState.completedObjectives.has(id)) {
      gameState.completedObjectives.add(id);
      appendChat('SYSTEM', `[Objective complete] ${label}`, 'text-emerald-400');
      const percent = Math.round((gameState.completedObjectives.size / 7) * 100);
      gameState.progress = percent;
      progressValue.textContent = `${percent}%`;
      progressBar.style.width = `${percent}%`;
      renderObjectives();
    }
    renderTelemetry();
  }

  function renderObjectives() {
    objectiveLog.innerHTML = [
      ['briefing_read', 'Complete mission briefing'],
      ['nback_clear', 'Pass dual n-back memory drill'],
      ['resource_clear', 'Stabilize resource routing'],
      ['logic_clear', 'Repair logic gate'],
      ['micro_clear', 'Identify micro-expression'],
      ['regulation_clear', 'Finish regulation breaths'],
      ['debrief_submit', 'Submit metacognitive debrief'],
    ].map(([id, label]) => `<div class="${gameState.completedObjectives.has(id) ? 'text-emerald-400' : 'text-slate-500'}">${gameState.completedObjectives.has(id) ? '✓' : '•'} ${label}</div>`).join('');
  }

  function updateNPCState(emotion, textIndicator) {
    currentEmotion = emotion;
    emotionIndicator.textContent = `Analysis: ${textIndicator}`;
    npcMesh.material.emissive.copy(new THREE.Color(emotionColors[emotion] || emotionColors.neutral));
    npcMesh.material.emissiveIntensity = 0.8;
  }

  function updateBars() {
    iqValue.textContent = `${gameState.iqScore}%`;
    iqBar.style.width = `${gameState.iqScore}%`;
    eqSyncValue.textContent = `${gameState.eqScore}%`;
    eqSyncBar.style.width = `${gameState.eqScore}%`;
    eqSyncBar.style.backgroundColor = gameState.eqScore < 40 ? 'var(--traffic-red)' : gameState.eqScore < 70 ? '#eab308' : '#10b981';
  }

  function calculateAttemptMultiplier(attemptCount) {
    if (attemptCount <= 1) return 1;
    if (attemptCount === 2) return 0.65;
    return 0.35;
  }

  function registerChallengeAttempt(challengeId, onSuccess, onFailure) {
    const challenge = gameState.challengeAttempts[challengeId];
    if (!challenge) return false;

    if (challenge.locked) {
      appendChat('SYSTEM', 'Protocol already resolved. Additional submissions are ignored.', 'text-slate-400');
      playSfx('error');
      return false;
    }

    if (challenge.count >= 3) {
      appendChat('SYSTEM', 'Maximum attempts reached for this protocol.', 'text-yellow-400');
      playSfx('error');
      return false;
    }

    challenge.count += 1;
    const attemptCount = challenge.count;

    if (onSuccess(attemptCount)) {
      challenge.locked = true;
      return true;
    }

    if (attemptCount >= 3) {
      challenge.locked = true;
      appendChat('SYSTEM', 'Protocol locked after 3 attempts.', 'text-yellow-400');
      playSfx('error');
    } else if (onFailure) {
      onFailure(attemptCount);
    }

    return false;
  }

  function awardProtocolScore(protocol, basePoints, attemptCount = 1) {
    const multiplier = calculateAttemptMultiplier(attemptCount);
    const weightedScore = Math.round(basePoints * multiplier);
    gameState.protocolScore[protocol] = Math.min(protocolWeights[protocol], gameState.protocolScore[protocol] + weightedScore);
    renderFinalScore();
  }

  function renderFinalScore() {
    const totalScore = gameState.protocolScore.iq + gameState.protocolScore.eq + gameState.protocolScore.debrief;
    finalScoreEl.textContent = `${totalScore} / 100`;
    protocolScoreListEl.innerHTML = [
      `IQ Protocol: ${gameState.protocolScore.iq}/${protocolWeights.iq}`,
      `EQ Protocol: ${gameState.protocolScore.eq}/${protocolWeights.eq}`,
      `Debrief Protocol: ${gameState.protocolScore.debrief}/${protocolWeights.debrief}`,
    ].map((line) => `<div>${line}</div>`).join('');
  }

  function appendChat(sender, message, colorClass = 'text-white', voicePath = null) {
    const div = document.createElement('div');
    const senderColor = sender === 'Weaver' ? 'text-[var(--traffic-red)]' : 'text-[var(--neural-blue)]';
    div.innerHTML = `<span class="${senderColor}">> ${sender}:</span> <span class="${colorClass}">${message}</span>`;
    chatHistory.appendChild(div);
    chatHistory.scrollTop = chatHistory.scrollHeight;
    if (voicePath) enqueueVoice(voicePath, { priority: voicePriority.reply });
  }

  async function ensureMindweaveSelected() {
    const selectionResp = await fetch('/api/select-game', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ game: 'mindweave' })
    });
    if (!selectionResp.ok) throw new Error('Unable to initialize Mindweave backend');
    const selectedPayload = await selectionResp.json();
    gameState.activeSessionId = selectedPayload.session_id || null;
  }

  async function sendTaskMessage(message, taskType = 'npc_dialogue') {
    if (!apiKey) return;
    try {
      const response = await fetch('/api/ai/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Mindweave-API-Key': apiKey },
        body: JSON.stringify({
          session_id: gameState.activeSessionId,
          player_id: 'weaver',
          message,
          task_type: taskType,
          telemetry: { phase: gameState.phase, iq: gameState.iqScore, eq: gameState.eqScore, timestamp: Date.now() }
        })
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error || 'Chat request failed');
      updateNPCState(payload.emotion || 'neutral', payload.analysis || 'Synced');
      gameState.eqScore = Math.max(0, Math.min(100, gameState.eqScore + Number(payload.eq_delta || 0)));
      updateBars();
      const reply = payload.reply || 'No response generated.';
      const normalizedReply = reply.toLowerCase();
      let replyVoice = audioLibrary.voice.calmResponse;
      if (normalizedReply.includes('ambiguous')) replyVoice = audioLibrary.voice.ambiguousResponse;
      if (normalizedReply.includes('stress') || normalizedReply.includes('unstable')) replyVoice = audioLibrary.voice.stressResponse;
      appendChat('Architect-7', reply, 'text-white', replyVoice);
      playSfx('correct');
    } catch (error) {
      appendChat('SYSTEM', `Backend sync failed: ${error.message}`, 'text-red-500');
      appendChat('Architect-7', 'Input acknowledged. However, the emotional context is ambiguous. Please recalibrate your active listening protocols.', 'text-slate-200');
      await enqueueVoice(audioLibrary.voice.chatError, { priority: voicePriority.sequence, clearQueue: true, interrupt: true });
      await enqueueVoice(audioLibrary.voice.ambiguousResponse, { priority: voicePriority.sequence });
      playSfx('error');
      updateNPCState('stress', 'Link Unstable');
    }
    renderTelemetry();
  }

  function renderPhase() {
    phaseButtons.forEach((btn) => btn.classList.toggle('phase-active', btn.dataset.phase === gameState.phase));

    if (gameState.phase === 'briefing') {
      phaseTitle.textContent = 'Mission Briefing';
      phaseContent.innerHTML = `
        <div class="mindweave-card space-y-2">
          <p>Welcome Weaver. You must restore a fractured society using cognitive planning, emotional diplomacy, and reflective learning.</p>
          <ul class="list-disc pl-5 text-slate-300 text-xs space-y-1">
            <li>IQ Engine: Dual N-Back, resource balancing, logic gates.</li>
            <li>EQ Engine: micro-expression reading, empathy dialogue, emotional regulation.</li>
            <li>Debrief: explain strategy, transfer to real-world behavior.</li>
          </ul>
          <button id="start-campaign" class="mindweave-action">Acknowledge Briefing</button>
        </div>`;
      document.getElementById('start-campaign').onclick = async () => {
        markObjective('briefing_read', 'Briefing acknowledged');
        appendChat('Architect-7', 'Acknowledged. Mission brief locked.', 'text-white');
        await enqueueVoice(audioLibrary.voice.briefingAcknowledge, { priority: voicePriority.sequence, clearQueue: true, interrupt: true, delayMs: 500 });
        setPhase('iq', { skipProtocolVoice: true });
        enqueueVoice(audioLibrary.voice.protocol2, { priority: voicePriority.sequence });
      };
    }

    if (gameState.phase === 'iq') {
      if (!gameState.nbackSequence.length) gameState.nbackSequence = Array.from({ length: 6 }, () => Math.ceil(Math.random() * 4));
      phaseTitle.textContent = 'IQ Systems Repair';
      phaseContent.innerHTML = `
        <div class="space-y-3 text-xs">
          <div class="mindweave-card">
            <strong>Dual N-Back (2-back)</strong>
            <p>Sequence: ${gameState.nbackSequence.join(' - ')}</p>
            <p>What is the last number that matches two steps earlier?</p>
            <input id="nback-input" class="mindweave-input w-20" type="number" min="1" max="4" />
            <button id="nback-submit" class="mindweave-action ml-2">Validate</button>
          </div>
          <div class="mindweave-card">
            <strong>Resource Management</strong>
            <p>Allocate power cores A + B to reach exact stabilization target (${gameState.resourceTarget}).</p>
            <input id="resource-a" class="mindweave-input w-16" type="number" value="7" /> +
            <input id="resource-b" class="mindweave-input w-16" type="number" value="7" />
            <button id="resource-submit" class="mindweave-action ml-2">Route</button>
          </div>
          <div class="mindweave-card">
            <strong>Logic Gate Repair</strong>
            <p>Inputs: A=true, B=false. Choose output for (A AND B) OR (NOT B).</p>
            <select id="logic-choice" class="mindweave-input"><option>false</option><option>true</option></select>
            <button id="logic-submit" class="mindweave-action ml-2">Commit</button>
          </div>
        </div>`;

      document.getElementById('nback-submit').onclick = () => {
        const guess = Number(document.getElementById('nback-input').value);
        const expected = gameState.nbackSequence[gameState.nbackSequence.length - 3];
        registerChallengeAttempt(
          'nback_clear',
          (attemptCount) => {
            if (guess !== expected) return false;
            gameState.iqScore = Math.min(100, gameState.iqScore + 12);
            awardProtocolScore('iq', 15, attemptCount);
            markObjective('nback_clear', 'Dual N-Back solved');
            appendChat('SYSTEM', `Working memory lock acquired on attempt ${attemptCount}.`, 'text-emerald-400');
            playSfx('correct');
            updateBars();
            return true;
          },
          () => {
            gameState.iqScore = Math.max(0, gameState.iqScore - 6);
            appendChat('SYSTEM', 'N-back mismatch. Retry with pattern focus.', 'text-yellow-400');
            playSfx('wrong');
            updateBars();
          }
        );
      };

      document.getElementById('resource-submit').onclick = () => {
        const a = Number(document.getElementById('resource-a').value);
        const b = Number(document.getElementById('resource-b').value);
        registerChallengeAttempt(
          'resource_clear',
          (attemptCount) => {
            if (a + b !== gameState.resourceTarget) return false;
            gameState.iqScore = Math.min(100, gameState.iqScore + 10);
            awardProtocolScore('iq', 15, attemptCount);
            markObjective('resource_clear', 'Resource routing stable');
            playSfx('correct');
            updateBars();
            return true;
          },
          () => {
            gameState.iqScore = Math.max(0, gameState.iqScore - 4);
            appendChat('SYSTEM', 'Supply chain imbalance detected.', 'text-yellow-400');
            playSfx('wrong');
            updateBars();
          }
        );
      };

      document.getElementById('logic-submit').onclick = () => {
        const output = document.getElementById('logic-choice').value;
        registerChallengeAttempt(
          'logic_clear',
          (attemptCount) => {
            if (output !== 'true') return false;
            gameState.iqScore = Math.min(100, gameState.iqScore + 10);
            awardProtocolScore('iq', 15, attemptCount);
            markObjective('logic_clear', 'Logic gate repaired');
            playSfx('correct');
            if (gameState.completedObjectives.has('nback_clear') && gameState.completedObjectives.has('resource_clear') && gameState.completedObjectives.has('logic_clear')) {
              setPhase('eq');
            }
            updateBars();
            return true;
          },
          () => {
            gameState.iqScore = Math.max(0, gameState.iqScore - 4);
            appendChat('SYSTEM', 'Gate output incorrect.', 'text-yellow-400');
            playSfx('wrong');
            updateBars();
          }
        );
      };
    }

    if (gameState.phase === 'eq') {
      phaseTitle.textContent = 'EQ Diplomacy & Regulation';
      phaseContent.innerHTML = `
        <div class="space-y-3 text-xs">
          <div class="mindweave-card">
            <strong>Micro-expression Probe (FACS-inspired)</strong>
            <p>NPC profile: brow raise + lip press + avert gaze. Best emotional interpretation?</p>
            <select id="micro-choice" class="mindweave-input"><option value="fear">Fear / uncertainty</option><option value="joy">Joy</option><option value="disgust">Disgust</option></select>
            <button id="micro-submit" class="mindweave-action ml-2">Analyze</button>
          </div>
          <div class="mindweave-card">
            <strong>Empathy Bridge</strong>
            <p>Use chat to validate, reflect, and guide Architect-7. Suggestion: "I hear your concern, let's stabilize one subsystem at a time."</p>
          </div>
          <div class="mindweave-card">
            <strong>Biometric Regulation</strong>
            <p>Complete four breathing cycles using Regulation Pulse.</p>
          </div>
        </div>`;

      document.getElementById('micro-submit').onclick = () => {
        const value = document.getElementById('micro-choice').value;
        registerChallengeAttempt(
          'micro_clear',
          (attemptCount) => {
            if (value !== 'fear') return false;
            gameState.eqScore = Math.min(100, gameState.eqScore + 8);
            awardProtocolScore('eq', 20, attemptCount);
            markObjective('micro_clear', 'Micro-expression recognized');
            updateNPCState('calm', 'Validated and understood');
            appendChat('Architect-7', 'Your empathy parameters are acceptable. My logic loops are stabilizing. Proceed with the temporal hack.', 'text-white', audioLibrary.voice.calmResponse);
            playSfx('correct');
            updateBars();
            return true;
          },
          () => {
            gameState.eqScore = Math.max(0, gameState.eqScore - 8);
            updateNPCState('stress', 'Misread social cue');
            appendChat('Architect-7', 'Your aggressive syntax triggers my defense subroutines! The grid cannot be forced!', 'text-white', audioLibrary.voice.stressResponse);
            playSfx('wrong');
            updateBars();
          }
        );
      };
    }

    if (gameState.phase === 'debrief') {
      phaseTitle.textContent = 'Metacognitive Debrief';
      phaseContent.innerHTML = `
        <div class="mindweave-card text-xs space-y-3">
          <p>Describe your strategy and how it transfers to real-world collaboration.</p>
          <textarea id="debrief-text" class="mindweave-input w-full h-28" placeholder="I slowed down, chunked information, validated emotion, and prioritized system repair..."></textarea>
          <button id="debrief-submit" class="mindweave-action">Submit Debrief</button>
        </div>`;
      document.getElementById('debrief-submit').onclick = async () => {
        const reflection = document.getElementById('debrief-text').value.trim();
        if (reflection.length < 20) {
          appendChat('SYSTEM', 'Debrief too short. Include strategy + transfer insight.', 'text-yellow-400');
          appendChat('Architect-7', 'Debrief received, but include explicit strategy and transfer language for stronger consolidation.', 'text-white', audioLibrary.voice.debriefReceived);
          playSfx('error');
          return;
        }
        markObjective('debrief_submit', 'Debrief submitted');
        gameState.protocolScore.debrief = protocolWeights.debrief;
        renderFinalScore();
        await sendTaskMessage(`Debrief reflection: ${reflection}`, 'debrief_reflection');
        appendChat('SYSTEM', 'Campaign loop complete. Far-transfer reinforcement logged.', 'text-emerald-400');
      };
    }

    renderTelemetry();
  }

  function resetGameState() {
    gameState.phase = 'briefing';
    gameState.iqScore = 48;
    gameState.eqScore = 82;
    gameState.progress = 0;
    gameState.completedObjectives = new Set();
    gameState.nbackSequence = [];
    gameState.regulationBreaths = 0;
    gameState.challengeAttempts = {
      nback_clear: { count: 0, locked: false },
      resource_clear: { count: 0, locked: false },
      logic_clear: { count: 0, locked: false },
      micro_clear: { count: 0, locked: false },
    };
    gameState.protocolScore = { iq: 0, eq: 0, debrief: 0 };


    chatHistory.innerHTML = '';
    appendChat('Architect-7', 'Session reboot acknowledged. We restart from Campaign Protocol 1: Mission Briefing.');
    updateNPCState('neutral', 'Session reset and synchronized');
    updateBars();
    renderObjectives();
    setPhase('briefing');
  }

  function setPhase(phase, options = {}) {
    const { skipProtocolVoice = false } = options;
    gameState.phase = phase;
    renderPhase();
    if (architectProtocolResponses[phase]) {
      appendChat('Architect-7', architectProtocolResponses[phase].text, 'text-white');
      if (!skipProtocolVoice) {
        enqueueVoice(architectProtocolResponses[phase].voice, { priority: voicePriority.protocol });
      }
    }
  }

  async function handleChatSubmit() {
    const text = chatInput.value.trim();
    if (!text || !apiKey) return;
    appendChat('Weaver', text);
    chatInput.value = '';
    updateNPCState('thinking', 'Processing Semantics...');
    await sendTaskMessage(text, gameState.phase === 'debrief' ? 'debrief_reflection' : 'npc_dialogue');

    if (gameState.phase === 'eq' && /understand|hear|support|calm|together/i.test(text)) {
      gameState.eqScore = Math.min(100, gameState.eqScore + 5);
      updateBars();
      if (gameState.completedObjectives.has('micro_clear') && gameState.completedObjectives.has('regulation_clear')) {
        setPhase('debrief');
      }
    }
  }

  sendBtn.addEventListener('click', handleChatSubmit);
  chatInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') handleChatSubmit();
  });

  document.getElementById('btn-empathy-ping').addEventListener('click', () => {
    appendChat('SYSTEM', '[Empathy Ping] Architect-7 is masking fear and resource shame. Use validation before directives.', 'text-slate-400 italic');
  });

  document.getElementById('btn-reset-iq').addEventListener('click', () => {
    gameState.nbackSequence = [];
    gameState.challengeAttempts.nback_clear = { count: 0, locked: false };
    gameState.challengeAttempts.resource_clear = { count: 0, locked: false };
    gameState.challengeAttempts.logic_clear = { count: 0, locked: false };
    gameState.iqScore = 48;
    updateBars();
    if (gameState.phase === 'iq') renderPhase();
  });

  document.getElementById('btn-regulate').addEventListener('click', () => {
    gameState.regulationBreaths += 1;
    gameState.eqScore = Math.min(100, gameState.eqScore + 3);
    appendChat('SYSTEM', `Breath cycle ${gameState.regulationBreaths}/4 completed.`, 'text-emerald-400');
    if (gameState.regulationBreaths >= 4) {
      gameState.regulationBreaths = 4;
      gameState.protocolScore.eq = Math.min(protocolWeights.eq, gameState.protocolScore.eq + 15);
      renderFinalScore();
      markObjective('regulation_clear', 'Biometric regulation cycle completed');
      if (gameState.phase === 'eq' && gameState.completedObjectives.has('micro_clear')) setPhase('debrief');
    }
    updateBars();
    renderTelemetry();
  });

  settingsClose.addEventListener('click', closeSettings);
  settingsModal.addEventListener('click', (event) => {
    if (event.target === settingsModal) closeSettings();
  });

  bgmVolumeInput.addEventListener('input', (event) => {
    audioState.bgmVolume = Number(event.target.value);
    applyAudioSettings();
  });

  sfxVolumeInput.addEventListener('input', (event) => {
    audioState.sfxVolume = Number(event.target.value);
  });

  bgmMuteInput.addEventListener('change', (event) => {
    audioState.bgmMuted = event.target.checked;
    applyAudioSettings();
  });

  sfxMuteInput.addEventListener('change', (event) => {
    audioState.sfxMuted = event.target.checked;
  });

  voiceVolumeInput.addEventListener('input', (event) => {
    audioState.voiceVolume = Number(event.target.value);
    applyAudioSettings();
  });

  voiceMuteInput.addEventListener('change', (event) => {
    audioState.voiceMuted = event.target.checked;
    if (audioState.voiceMuted) {
      if (activeVoiceJob?.audio) {
        activeVoiceJob.audio.pause();
        activeVoiceJob.audio.currentTime = 0;
      }
      activeVoiceJob = null;
      voiceQueue.length = 0;
    }
    applyAudioSettings();
  });

  phaseButtons.forEach((btn) => {
    btn.addEventListener('click', () => {
      const phase = btn.dataset.phase;
      setPhase(phase, { skipProtocolVoice: phase === 'briefing' });
      if (phase === 'briefing') {
        enqueueVoice(audioLibrary.voice.protocol1, { priority: voicePriority.protocol, clearQueue: true, interrupt: true });
      }
    });
  });

  cacheSfx();
  bgmVolumeInput.value = String(audioState.bgmVolume);
  sfxVolumeInput.value = String(audioState.sfxVolume);
  voiceVolumeInput.value = String(audioState.voiceVolume);
  bgmMuteInput.checked = audioState.bgmMuted;
  sfxMuteInput.checked = audioState.sfxMuted;
  voiceMuteInput.checked = audioState.voiceMuted;
  startBgm();

  ensureMindweaveSelected().catch((error) => {
    appendChat('SYSTEM', `Backend initialization error: ${error.message}`, 'text-red-500');
    apiStatusEl.textContent = 'Backend link unstable.';
    apiStatusEl.classList.replace('text-green-400', 'text-red-500');
  });

  appendChat('Architect-7', 'Weaver, the socio-cognitive lattice is collapsing. Begin with mission briefing and restore balance.', 'text-white');
  if (!hasPlayedStartupBriefing) {
    hasPlayedStartupBriefing = true;
    enqueueVoice(audioLibrary.voice.briefing, { priority: voicePriority.protocol, clearQueue: true, interrupt: true });
  }
  updateBars();
  renderObjectives();
  renderFinalScore();
  setPhase('briefing', { skipProtocolVoice: true });

  window.addEventListener('resize', () => {
    const nextAspect = window.innerWidth / window.innerHeight;
    camera.left = -frustumSize * nextAspect / 2;
    camera.right = frustumSize * nextAspect / 2;
    camera.top = frustumSize / 2;
    camera.bottom = -frustumSize / 2;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
  });

  const clock = new THREE.Clock();
  function animate() {
    requestAnimationFrame(animate);
    const time = clock.getElapsedTime();
    controls.update();

    gridGroup.children.forEach((mesh, index) => {
      mesh.position.y = mesh.userData.baseY + Math.sin(time * 2 + index * 0.1) * 0.1;
    });

    npcMesh.rotation.y += 0.01;
    npcMesh.rotation.x += 0.005;
    npcMesh.position.y = 3 + Math.sin(time * 1.5) * 0.3;
    if (currentEmotion === 'stress') {
      npcMesh.position.x = (Math.random() - 0.5) * 0.1;
      npcMesh.scale.setScalar(1 + Math.sin(time * 20) * 0.05);
    } else {
      npcMesh.position.x = 0;
      npcMesh.scale.setScalar(1);
    }

    renderer.render(scene, camera);
  }

  animate();
});
