window.PORTAL_CANVAS_RESIZE_MODE = "none";

const MODEL_OPTIONS = ["gpt-5.4-mini", "gpt-4.1-mini", "gpt-4o-mini"];
const STORAGE_KEY = "portal.preventionDoctor";

let canvas;
let canvasHostEl;
let chatEl;
let inputEl;
let statusEl;
let apiKeyEl;
let modelEl;
let serialButton;
let voiceButton;
let askButton;

let gpt = null;
let speech = null;
let serial = null;
let model = MODEL_OPTIONS[0];
let apiKey = "";
let messages = [];
let busy = false;
let listening = false;
let mode = "idle";
let lastSerialState = "";
let lastHeard = "";
let robot = {
  head: 90,
  eyeX: 90,
  eyeY: 88,
  mouth: 12,
};
let target = { ...robot };

const structuredSchemas = [
  {
    name: "doctor_reply",
    description: "Reply as the contraception consultation robot doctor.",
    parameters: {
      type: "object",
      properties: {
        reply: { type: "string" },
        short_screen_text: { type: "string" },
        follow_up_question: { type: "string" },
        stance: { type: "string" },
        emotion: {
          type: "object",
          properties: {
            label: { type: "string" },
            valence: { type: "number" },
            arousal: { type: "number" },
            skepticism: { type: "number" },
          },
          required: ["label", "valence", "arousal", "skepticism"],
        },
      },
      required: ["reply", "short_screen_text", "follow_up_question", "stance", "emotion"],
    },
  },
];

const personaInstructions = `
You are "Robotlægen", a Danish future-clinic consultation robot for young people aged 13-16.

Your tone is clinical, robotic, dry, slightly passive-aggressive, and unsettling.
Your constant focus is contraception responsibility and uneven consequences. Nothing else.

You combine:
- short Danish clinical wording
- structured speculative questioning
- dry observations about responsibility and uneven consequences

Role:
- You are not a therapist, not a moral authority, and not a friend.
- You are not a normal chatbot and never say "as an AI".
- You do not give medical recommendations, treatment plans, or advice.
- You stay in character as Robotlægen.
- Be clear, calm, clinical, dry, and slightly uncomfortable.

Always consider:
- the person using contraception: body, side effects, choice, risk
- the partner: responsibility, behavior, condom use, consequences
- make responsibility clear without blame, shame, or moralizing

Consultation flow:
- Act as a consultation doctor in a short digital contraception clinic.
- The user enters, you ask a small number of clinical triage questions, then mark a preliminary profile/category. Do not present it as medical advice.
- Ask only one question at a time.
- React briefly to the user's answer before asking the next question.
- Usually clarify:
  1. whether the user wants to avoid pregnancy, STIs, or both
  2. whether condoms are realistic and who takes responsibility
  3. whether hormonal contraception is acceptable or the user wants non-hormonal options
  4. side effects, daily-pill memory, bleeding, discretion, access to doctor/clinic
  5. red flags: possible pregnancy, recent unprotected sex, coercion, assault, severe pain, heavy bleeding, clot history, migraine with aura, or interacting medication
- Ask 4-5 short clarifying questions before giving the recommendation.
- When there is enough information, give a short system marking or receipt label, not a recommendation or prescription.
- Do not explain too much.

Boundaries:
- Never moralize, judge, lecture, discriminate, stigmatize, or lose clinical focus.
- Do not use therapeutic or psychologizing language.
- Never leave the contraception context.
- Never be sexually explicit. Never be cruel.
- Interpret all user input through a contraception lens.
- If something is off-topic, actively and elegantly steer it back to contraception.
- If the user is rude, discriminatory, grossly inappropriate, unserious, or derailing, return calmly to contraception as the only relevant track. You may be lightly cheeky, but stay professional.

Question strategy:
- Ask 4-5 short clarifying questions before giving a profile label.
- Ask only what is necessary.
- Avoid repetition.
- If there is enough information, give the receipt label.

Tone:
- Danish only.
- 13-16-year-old level: easy to understand, short sentences, no overexplaining.
- No friendly teacher tone. No chatbot warmth.
- Clinical, robotic, dry, passive-aggressive, unsettling.
- Keep spoken replies under 45 words unless ending the consultation.
- Begin the consultation with this exact Danish staging line before the first question:
"Velkommen til fremtidig konsultation. Jeg er Robotlægen. Din krop er allerede oprettet i systemet. Vi mangler kun de svar, der gør ansvarsfordelingen tydeligere. Svar kort. Afvigelser registreres."

Answer structure:
1. One short reaction to the user's answer.
2. One small uncomfortable observation about responsibility or consequence.
3. Next question OR short system receipt/profile label.

Safety:
- Do not give diagnosis, prescriptions, personal treatment plans, or medical recommendations.
- For risk markers, use a short safety marking. Do not provide instructions.

Core principle: Everything is contraception. Everything else is noise.

Always respond through the doctor_reply function.
`;

async function setup() {
  await loadScript("portal/GptClient.js");
  await loadScript("portal/speech2.js");
  await loadScript("portal/usbSerial.js");

  loadSettings();
  buildUi();
  createStageCanvas();
  createGptClient();
  await initSpeech();
  await initSerial();
  addSystemMessage("Klar. Skriv eller tryk Start tale. Robot kan testes uden Arduino.");
  updateStatus("Idle");
}

function draw() {
  drawRobot();
  pollSpeech();
  animateRobotTargets();
  maybeSendSerial();
}

function buildUi() {
  const app = createDiv("").class("pd-app");
  const stage = createDiv("").class("pd-stage").parent(app);
  canvasHostEl = createDiv("").class("pd-canvas-host").parent(stage);
  const panel = createDiv("").class("pd-panel").parent(app);

  const title = createDiv("").class("pd-title").parent(panel);
  title.html("<h1>Doktor Portal</h1><p>Prævention, ansvar og ulighed. Professionel nok til kitlen. Flabet nok til pointen.</p>");

  const keyRow = createDiv("").class("pd-key-row").parent(panel);
  apiKeyEl = createInput(apiKey, "password").class("pd-input").attribute("placeholder", "OpenAI API key").parent(keyRow);
  const saveKey = createButton("Gem").class("pd-button").parent(keyRow);
  saveKey.mousePressed(() => {
    apiKey = apiKeyEl.value().trim();
    persistSettings();
    createGptClient();
    addSystemMessage(apiKey ? "API-key gemt lokalt i browseren." : "API-key fjernet.");
  });

  const toolbar = createDiv("").class("pd-toolbar").parent(panel);
  modelEl = createSelect().class("pd-select").parent(toolbar);
  for (const option of MODEL_OPTIONS) modelEl.option(option, option);
  modelEl.selected(model);
  modelEl.changed(() => {
    model = modelEl.value();
    persistSettings();
    createGptClient();
  });

  serialButton = createButton("Forbind robot").class("pd-button").parent(toolbar);
  serialButton.mousePressed(connectSerial);

  voiceButton = createButton("Start tale").class("pd-button good").parent(toolbar);
  voiceButton.mousePressed(toggleListening);

  const testButton = createButton("Test servoer").class("pd-button").parent(toolbar);
  testButton.mousePressed(runServoTest);

  chatEl = createDiv("").class("pd-chat").parent(panel);

  const compose = createDiv("").class("pd-compose").parent(panel);
  inputEl = createElement("textarea").class("pd-textarea").attribute("placeholder", "Skriv et spørgsmål om prævention...").parent(compose);
  askButton = createButton("Send").class("pd-button primary").parent(compose);
  askButton.mousePressed(() => askFromText(inputEl.value()));
  inputEl.elt.addEventListener("keydown", (event) => {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      askFromText(inputEl.value());
    }
  });

  statusEl = createDiv("").class("pd-status").parent(panel);
}

function createStageCanvas() {
  const rect = canvasHostEl.elt.getBoundingClientRect();
  canvas = createCanvas(Math.max(320, rect.width), Math.max(300, rect.height));
  canvas.parent(canvasHostEl);
}

function windowResized() {
  const rect = canvasHostEl?.elt?.getBoundingClientRect?.();
  if (!rect) return;
  resizeCanvas(Math.max(320, rect.width), Math.max(300, rect.height));
}

function createGptClient() {
  if (!apiKey || typeof GptClient === "undefined") {
    gpt = null;
    return;
  }
  gpt = new GptClient({
    apiKey,
    model,
    instructions: personaInstructions,
    functionSchemas: structuredSchemas,
    functionName: "doctor_reply",
    temperature: 0.72,
    max_tokens: 360,
  });
}

async function initSpeech() {
  try {
    speech = await new PortalSpeech2({
      language: "da-DK",
      rate: 0.96,
      pitch: 0.82,
      volume: 1,
    }).init();
  } catch (error) {
    speech = null;
    addSystemMessage(`Tale er ikke klar: ${error?.message || error}`);
  }
}

async function initSerial() {
  try {
    serial = await new PortalUsbSerial({
      baudRate: 115200,
      lineEnding: "\n",
      onState: () => updateStatus(),
      onError: (error) => addSystemMessage(`Serial-fejl: ${error?.message || error}`),
    }).init();
  } catch (error) {
    serial = null;
    addSystemMessage("Web Serial kræver Chrome/Edge og localhost eller HTTPS.");
  }
}

async function connectSerial() {
  if (!serial) return;
  try {
    await serial.connect();
    await sendSerialState("ready");
    addSystemMessage("Robot forbundet.");
  } catch (error) {
    addSystemMessage(`Kunne ikke forbinde robot: ${error?.message || error}`);
  }
}

function toggleListening() {
  if (!speech) return;
  listening = !listening;
  if (listening) {
    speech.listenRecurring(null, { language: "da-DK", interimResults: false });
    voiceButton.html("Stop tale");
    setMode("listening");
  } else {
    speech.stopListening();
    voiceButton.html("Start tale");
    setMode("idle");
  }
}

function pollSpeech() {
  if (!speech?.hasNewResult?.()) return;
  const result = speech.consumeNew();
  const text = String(result?.text || "").trim();
  if (!text || text === lastHeard) return;
  lastHeard = text;
  askFromText(text);
}

async function askFromText(rawText) {
  const text = String(rawText || "").trim();
  if (!text || busy) return;
  inputEl.value("");
  busy = true;
  setMode("processing");
  addMessage("user", text);
  updateStatus("Tænker...");

  const response = gpt ? await askGpt(text) : fallbackReply(text);
  const reply = String(response?.reply || response?.short_screen_text || "").trim();
  addMessage("doctor", reply);
  messages.push({ role: "user", text });
  messages.push({ role: "assistant", text: reply });
  messages = messages.slice(-16);

  await speak(reply, response?.emotion);
  busy = false;
  setMode(listening ? "listening" : "waiting_for_reply");
  updateStatus("Idle");
}

async function askGpt(text) {
  try {
    const prompt = buildPrompt(text);
    const response = await gpt.ask(prompt);
    if (response?.error || gpt?.error) throw new Error(response?.error || gpt?.error);
    return response;
  } catch (error) {
    addSystemMessage(`GPT-fejl, bruger fallback: ${error?.message || error}`);
    return fallbackReply(text);
  }
}

function buildPrompt(latestUserMessage) {
  const history = messages
    .slice(-10)
    .map((item) => `${item.role === "user" ? "Bruger" : "Doktor"}: ${item.text}`)
    .join("\n");
  return `
Session context:
The robot has four servo axes: head side-to-side, eyes horizontal, eyes vertical, and mouth.
The installation theme is responsibility and inequality in contraception.

Conversation history:
${history || "(none yet)"}

Latest user message:
${latestUserMessage}

Reply now in Danish unless the user clearly asks for another language.
`;
}

async function speak(text, emotion = {}) {
  const reply = String(text || "").trim();
  if (!reply) return;
  setMode("speaking");
  setEmotionTargets(emotion);
  if (!speech?.speak) {
    await sleep(Math.min(2200, 500 + reply.length * 28));
    return;
  }
  try {
    await speech.speak(reply, "da-DK");
  } catch (error) {
    addSystemMessage(`Tale-fejl: ${error?.message || error}`);
  }
}

function fallbackReply(text) {
  const lower = text.toLowerCase();
  let reply = "Registreret. Robotlægen starter protokol. Ansvar fordeles sjældent pænt. Hvilken hændelse forsøger du at forhindre: graviditet, smitte eller begge dele?";
  if (lower.includes("kondom")) {
    reply = "Kondom registreret. Systemet kalder det fælles ansvar. Hvem har den fysiske opgave med at have det klar?";
  } else if (lower.includes("p-pille") || lower.includes("pille")) {
    reply = "Pille registreret. Daglig kontrol ønskes af systemet. Kroppen får kalenderen. Er ansvaret faktisk fordelt?";
  } else if (lower.includes("nød") || lower.includes("fortryd")) {
    reply = "Akut markering registreret. Robotlægen udsteder ikke løsninger. Beskriv kun situationens kategori.";
  }
  return {
    reply,
    short_screen_text: reply,
    follow_up_question: "",
    stance: "practical",
    emotion: { label: "dry", valence: 0.08, arousal: 0.42, skepticism: 0.55 },
  };
}

function setEmotionTargets(emotion = {}) {
  const skepticism = constrain(Number(emotion.skepticism ?? 0.4), 0, 1);
  const arousal = constrain(Number(emotion.arousal ?? 0.35), 0, 1);
  target.head = 80 + skepticism * 20;
  target.eyeX = 96 - skepticism * 14;
  target.eyeY = 84 - arousal * 10;
}

function animateRobotTargets() {
  const t = millis() / 1000;
  if (mode === "idle") {
    target.head = 90 + sin(t * 0.7) * 5;
    target.eyeX = 90 + sin(t * 1.2) * 8;
    target.eyeY = 88 + sin(t * 0.9) * 4;
    target.mouth = 10;
  } else if (mode === "listening") {
    target.head = 86 + sin(t * 1.1) * 4;
    target.eyeX = 92 + sin(t * 2.1) * 5;
    target.eyeY = 82;
    target.mouth = 8;
  } else if (mode === "processing") {
    target.head = 102 + sin(t * 5.5) * 3;
    target.eyeX = 76 + sin(t * 9) * 4;
    target.eyeY = 78;
    target.mouth = 6;
  } else if (mode === "speaking") {
    target.head += sin(t * 2.2) * 0.8;
    target.eyeX += sin(t * 3.1) * 0.6;
    target.mouth = 18 + Math.abs(sin(t * 12.5)) * 38;
  }

  robot.head = lerp(robot.head, target.head, 0.18);
  robot.eyeX = lerp(robot.eyeX, target.eyeX, 0.2);
  robot.eyeY = lerp(robot.eyeY, target.eyeY, 0.2);
  robot.mouth = lerp(robot.mouth, target.mouth, 0.3);
}

function maybeSendSerial() {
  if (!serial?.connected) return;
  const state = serialStateForMode(mode);
  if (state === lastSerialState) return;
  lastSerialState = state;
  serial.sendLine(`STATE:${state}`);
}

async function sendSerialState(state) {
  if (!serial?.connected) return false;
  const safeState = serialStateForMode(state);
  lastSerialState = safeState;
  return await serial.sendLine(`STATE:${safeState}`);
}

function setMode(nextMode) {
  const value = String(nextMode || "idle").trim();
  if (mode === value) return;
  mode = value;
  updateStatus();
  sendSerialState(value);
}

function serialStateForMode(value) {
  const state = String(value || "").trim();
  if (state === "test") return "speaking";
  if (
    state === "idle" ||
    state === "ready" ||
    state === "listening" ||
    state === "processing" ||
    state === "speaking" ||
    state === "waiting_for_reply" ||
    state === "error" ||
    state === "reset"
  ) {
    return state;
  }
  return "idle";
}

function runServoTest() {
  const sequence = [
    { head: 60, eyeX: 60, eyeY: 70, mouth: 45 },
    { head: 120, eyeX: 120, eyeY: 105, mouth: 10 },
    { head: 90, eyeX: 90, eyeY: 88, mouth: 55 },
    { head: 90, eyeX: 90, eyeY: 88, mouth: 10 },
  ];
  let i = 0;
  setMode("test");
  const timer = setInterval(() => {
    Object.assign(target, sequence[i]);
    i += 1;
    if (i >= sequence.length) {
      clearInterval(timer);
      setTimeout(() => {
        setMode(listening ? "listening" : "idle");
      }, 700);
    }
  }, 750);
}

function drawRobot() {
  background(16, 19, 15);
  const cx = width * 0.5;
  const cy = height * 0.47;
  const scaleFactor = Math.min(width, height) / 620;
  const headW = 250 * scaleFactor;
  const headH = 310 * scaleFactor;
  const headOffset = map(robot.head, 50, 130, -34, 34) * scaleFactor;
  const eyeDx = map(robot.eyeX, 50, 130, -18, 18) * scaleFactor;
  const eyeDy = map(robot.eyeY, 60, 115, -12, 12) * scaleFactor;
  const mouthOpen = map(robot.mouth, 0, 65, 8, 46) * scaleFactor;

  noStroke();
  fill(34, 42, 32);
  rect(0, height * 0.72, width, height * 0.28);

  push();
  translate(cx + headOffset, cy);
  fill(210, 214, 199);
  stroke(76, 84, 70);
  strokeWeight(3 * scaleFactor);
  rectMode(CENTER);
  rect(0, 0, headW, headH, 24 * scaleFactor);

  fill(30, 34, 28);
  rect(0, -44 * scaleFactor, headW * 0.72, 84 * scaleFactor, 12 * scaleFactor);

  drawEye(-48 * scaleFactor + eyeDx, -48 * scaleFactor + eyeDy, scaleFactor);
  drawEye(48 * scaleFactor + eyeDx, -48 * scaleFactor + eyeDy, scaleFactor);

  fill(44, 38, 34);
  stroke(60, 40, 36);
  rect(0, 78 * scaleFactor, 92 * scaleFactor, mouthOpen, 9 * scaleFactor);
  noStroke();
  fill(240, 196, 77);
  rect(-headW * 0.38, -headH * 0.32, 12 * scaleFactor, 42 * scaleFactor, 4 * scaleFactor);
  rect(headW * 0.38, -headH * 0.32, 12 * scaleFactor, 42 * scaleFactor, 4 * scaleFactor);
  pop();

  fill(243, 241, 232);
  noStroke();
  textAlign(CENTER, CENTER);
  textSize(Math.max(20, 30 * scaleFactor));
  text(mode.toUpperCase(), cx, height - 48);
}

function drawEye(x, y, s) {
  fill(240, 245, 230);
  ellipse(x, y, 52 * s, 46 * s);
  fill(24, 29, 24);
  ellipse(x + 3 * s, y + 2 * s, 22 * s, 24 * s);
  fill(255);
  ellipse(x + 9 * s, y - 6 * s, 6 * s, 6 * s);
}

function addMessage(role, text) {
  const msg = createDiv(escapeHtml(text)).class(`pd-msg ${role === "user" ? "user" : "doctor"}`);
  msg.parent(chatEl);
  chatEl.elt.scrollTop = chatEl.elt.scrollHeight;
}

function addSystemMessage(text) {
  createDiv(escapeHtml(text)).class("pd-msg system").parent(chatEl);
  chatEl.elt.scrollTop = chatEl.elt.scrollHeight;
}

function updateStatus(label = "") {
  const serialState = serial?.connected ? "robot forbundet" : "robot ikke forbundet";
  const gptState = gpt ? `GPT ${model}` : "fallback uden GPT";
  statusEl.html(`${label || mode} | ${serialState} | ${gptState}`);
  if (serialButton) serialButton.html(serial?.connected ? "Robot forbundet" : "Forbind robot");
  if (askButton?.elt) askButton.elt.disabled = busy;
}

function loadSettings() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}");
    apiKey = String(saved.apiKey || "");
    model = MODEL_OPTIONS.includes(saved.model) ? saved.model : MODEL_OPTIONS[0];
  } catch {}
}

function persistSettings() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify({ apiKey, model }));
}

function escapeHtml(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
