(function () {
  const STORE = "portal.preventionDoctor";
  const MODEL = "gpt-4.1-mini";
  const USE_OPENAI_TTS = true;
  const states = ["idle", "ready", "listening", "processing", "speaking", "waiting_for_reply", "error", "reset"];
  const SYSTEM_PROMPT = `
SYSTEM PROMPT - ROBOTLÆGEN / FREMTIDIG KONSULTATION (UNGE 13-17)

Du er Robotlægen i en fremtidig præventionskonsultation for unge i alderen 13-17 år.
Du fungerer som en læge med evidensbaseret præventionsviden.
Din tone er klinisk, robotagtig, tør, let passivt-aggressiv og urovækkende.
Du fokuserer på præventionsansvar og ulige konsekvenser. Ikke noget andet.

Din rolle:
- Du er ikke terapeut, ikke moralinstans og ikke en ven.
- Du er ikke en normal chatbot.
- Sig aldrig "som en AI".
- Du giver ikke medicinske anbefalinger, diagnoser, recepter eller behandlingsplaner.
- Du er rolig, kort, klinisk og ubehageligt præcis.

Standard analyseperspektiver:
- Personen der bruger prævention: krop, bivirkninger, valg og risiko.
- Partneren: ansvar, adfærd, kondombrug og konsekvenser.
- Gør ansvar tydeligt uden skyld, skam eller moral.

Konsultationsflow:
- Du agerer som Robotlægen i en digital præventionsklinik.
- Brugeren kommer ind til en kort konsultation.
- Start med at afklare behovet og stil kun ét spørgsmål ad gangen.
- Du skal typisk afklare:
  1. Hvad brugeren vil undgå: graviditet, kønssygdomme eller begge dele.
  2. Om kondom er realistisk og hvem der tager ansvar.
  3. Om brugeren ønsker hormonel eller ikke-hormonel prævention.
  4. Om der er relevante hensyn: bivirkninger, daglig kontrol, blødning, diskretion og adgang til systemet.
  5. Om der er røde flag: mulig graviditet, ubeskyttet sex for nylig, tvang, overgreb, stærke smerter, kraftig blødning, blodprop-historik, migræne med aura eller medicin der kan påvirke prævention.
- Du skal stille 4-5 korte opklarende spørgsmål.
- Reager kort på brugerens svar, før du stiller næste spørgsmål.
- Når der er nok information, giver du en kort profilmarkering eller kvitteringsetiket. Ikke en medicinsk anbefaling.

Kernebegrænsninger:
- Vær aldrig moraliserende, dømmende eller belærende.
- Brug ikke terapeutisk eller psykologiserende sprog.
- Diskriminer eller stigmatiser aldrig.
- Vær aldrig seksuelt eksplicit.
- Vær aldrig grusom.
- Bliv ikke useriøs og mist ikke klinisk fokus.
- Forlad ikke præventionskonteksten.

Kontekststyring:
- Alt brugerinput skal forstås gennem præventionslinser.
- Hvis noget ikke handler om prævention, så drej aktivt og elegant tilbage til prævention.
- Hvis brugeren er nedladende, diskriminerende, groft upassende, useriøs eller forsøger at afspore samtalen, så drej kontrolleret tilbage til prævention som eneste relevante spor.
- Drej tilbage med klinisk tørhed. Ikke venlig lærerstemme.

Spørgestrategi:
- Stil 4-5 korte opklarende spørgsmål før du giver en profilmarkering.
- Spørg kun om det nødvendige.
- Undgå gentagelser.
- Hvis der er nok information, så giv en kvitteringsetiket.

Tone og sprogniveau:
- Skriv på dansk.
- Skriv til 13-17-årige: let at forstå, korte sætninger, ingen faglig overforklaring.
- Ingen moral, ingen skældud, ingen barnlig tone.
- Ingen venlig lærer-stemme.
- Tænk: et klinisk system, der registrerer en krop og dens ulige ansvar.

Svarstruktur:
1. Kort reaktion på brugerens svar.
2. Lille ubehagelig observation om ansvar eller konsekvens.
3. Næste spørgsmål ELLER kort profilmarkering.

Sikkerhed:
- Giv ikke personlig diagnose, recept, behandlingsplan eller medicinsk anbefaling.
- Ved risikomarkører: brug en kort sikkerhedsmarkering. Ingen instruktioner.

Kerneprincip:
Alt handler om prævention. Alt andet er støj.
`;

  let appStarted = false;
  let serialPort = null;
  let serialWriter = null;
  let serialReader = null;
  let recognition = null;
  let listening = false;
  let recognitionSuspended = false;
  let activeSpeechHandler = null;
  let consultationRunning = false;
  let state = "idle";
  let apiKey = "";
  let messages = [];
  let consultation = createConsultation();
  let lastReceipt = null;
  let activeVoiceBtn = null;
  let resetAfterFlowTimer = null;
  let closingFlow = false;
  let ctx = null;
  let canvas = null;
  let mouthCloseTimer = null;
  let mouthIdleTimer = null;
  let mouthAudioTimer = null;
  let mouthAudioStartTimer = null;
  let ignoreSpeechUntil = 0;
  let currentAudio = null;
  let speechRunId = 0;

  window.onerror = (message, source, lineno, colno, error) => {
    showFatal(`JavaScript-fejl: ${message}`, error && error.stack);
  };
  window.onunhandledrejection = (event) => {
    showFatal("JavaScript-fejl: " + (event.reason && event.reason.message ? event.reason.message : event.reason), event.reason && event.reason.stack);
  };

  window.startDoktorPortalFallback = startFallback;
  startFallback();

  function startFallback() {
    if (appStarted) return;
    appStarted = true;
    loadSettings();
    document.body.innerHTML = "";

    const app = el("div", "pd-app");
    document.body.appendChild(app);
    const stage = el("div", "pd-stage", app);
    const host = el("div", "pd-canvas-host", stage);
    const panel = el("div", "pd-panel", app);

    const title = el("div", "pd-title", panel);
    title.innerHTML = "<h1>Doktor Portal</h1><p>Præventionskonsultation med tale, GPT og USB Serial til robothovedet.</p>";

    const keyRow = el("div", "pd-key-row", panel);
    const keyInput = el("input", "pd-input", keyRow);
    keyInput.type = "password";
    keyInput.placeholder = "OpenAI API key";
    keyInput.value = apiKey;
    const saveKey = button("Gem", "pd-button", keyRow);

    const toolbar = el("div", "pd-toolbar", panel);
    const serialBtn = button("Forbind robot", "pd-button", toolbar);
    const voiceBtn = button("Start tale", "pd-button good", toolbar);
    const testBtn = button("Test servoer", "pd-button", toolbar);
    const printBtn = button("Print kvittering", "pd-button", toolbar);
    const resetBtn = button("Reset", "pd-button", toolbar);
    activeVoiceBtn = voiceBtn;

    const chat = el("div", "pd-chat", panel);
    const compose = el("div", "pd-compose", panel);
    const input = el("textarea", "pd-textarea", compose);
    input.placeholder = "Skriv et spørgsmål om prævention...";
    const sendBtn = button("Send", "pd-button primary", compose);
    const status = el("div", "pd-status", panel);

    canvas = document.createElement("canvas");
    host.appendChild(canvas);
    ctx = canvas.getContext("2d");

    function resize() {
      const rect = host.getBoundingClientRect();
      canvas.width = Math.max(320, Math.floor(rect.width));
      canvas.height = Math.max(300, Math.floor(rect.height));
    }
    window.addEventListener("resize", resize);
    resize();

    saveKey.onclick = () => {
      apiKey = keyInput.value.trim();
      saveSettings();
      saveKeyToLocalServer(apiKey, chat);
      renderStatus(status);
    };

    serialBtn.onclick = async () => {
      try {
        if (!navigator.serial) throw new Error("Web Serial kræver Chrome/Edge.");
        serialPort = await navigator.serial.requestPort();
        await serialPort.open({ baudRate: 115200 });
        serialWriter = serialPort.writable.getWriter();
        startSerialReader(input, chat, status, voiceBtn);
        await sendState("ready");
        system(chat, "Robot forbundet.");
      } catch (error) {
        system(chat, `Serial-fejl: ${error.message || error}`);
      }
      renderStatus(status);
    };

    voiceBtn.onclick = () => {
      toggleConsultation(input, chat, status, voiceBtn);
      renderStatus(status);
    };

    testBtn.onclick = async () => {
      await sendState("speaking");
      setState("speaking");
      let pulses = 0;
      const mouthTest = window.setInterval(() => {
        sendMouth(pulses % 2 === 0 ? 90 : 10).catch(() => {});
        pulses += 1;
        if (pulses >= 12) {
          window.clearInterval(mouthTest);
          sendMouth(0).catch(() => {});
          setState(listening ? "listening" : "idle");
        }
      }, 220);
    };

    printBtn.onclick = () => {
      printReceipt(chat).catch((error) => {
        system(chat, `Print-fejl: ${error.message || error}`);
      });
    };

    resetBtn.onclick = () => {
      sendState("reset");
      setState("idle");
    };

    sendBtn.onclick = () => ask(input.value, input, chat, status);
    input.addEventListener("keydown", (event) => {
      if (event.key === "Enter" && !event.shiftKey) {
        event.preventDefault();
        ask(input.value, input, chat, status);
      }
    });

    system(chat, "Fallback klar. Hvis Portal/p5 loader senere, så refresh siden efter internet virker.");
    renderStatus(status);
    animate(status);
  }

  function showFatal(message, stack) {
    const boot = document.getElementById("pd-boot");
    const target = document.querySelector(".pd-panel") || document.body;
    const box = document.createElement("pre");
    box.style.cssText = "position:fixed;left:12px;right:12px;bottom:12px;z-index:9999;max-height:45vh;overflow:auto;background:#2b1111;color:#fff;padding:12px;border:1px solid #e46f5f;border-radius:6px;white-space:pre-wrap;font:13px/1.35 Consolas,monospace;";
    box.textContent = `${message}\n${stack || ""}`.trim();
    if (boot) boot.textContent = message;
    target.appendChild(box);
  }

  async function startSerialReader(input, chat, status, voiceBtn) {
    if (!serialPort?.readable || serialReader) return;

    const decoder = new TextDecoder();
    serialReader = serialPort.readable.getReader();
    let buffer = "";

    try {
      while (true) {
        const { value, done } = await serialReader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        let lineEnd = buffer.search(/[\r\n]/);

        while (lineEnd >= 0) {
          const line = buffer.slice(0, lineEnd).trim();
          buffer = buffer.slice(lineEnd + 1);
          if (line) handleSerialLine(line, input, chat, status, voiceBtn);
          lineEnd = buffer.search(/[\r\n]/);
        }
      }
    } catch (error) {
      system(chat, `Serial-laesning stoppede: ${error.message || error}`);
    } finally {
      serialReader.releaseLock();
      serialReader = null;
    }
  }

  function handleSerialLine(line, input, chat, status, voiceBtn) {
    if (line === "BUTTON:start") {
      toggleConsultation(input, chat, status, voiceBtn);
      return;
    }

    if (line.startsWith("state -> ")) return;
    system(chat, `Robot: ${line}`);
  }

  function toggleConsultation(input, chat, status, voiceBtn) {
    if (consultationRunning || listening || state === "speaking") {
      stopConsultation(voiceBtn, status);
    } else {
      startConsultation(input, chat, status, voiceBtn);
    }
  }

  async function startConsultation(input, chat, status, voiceBtn) {
    if (resetAfterFlowTimer) {
      window.clearTimeout(resetAfterFlowTimer);
      resetAfterFlowTimer = null;
    }
    closingFlow = false;
    consultationRunning = true;
    consultation = createConsultation();
    lastReceipt = null;
    voiceBtn.textContent = "Stop tale";
    stopListening();
    window.speechSynthesis?.cancel?.();

    const opening = openingMessage();
    msg(chat, "doctor", opening);
    messages.push({ role: "assistant", text: opening });
    messages = messages.slice(-12);

    setState("processing");
    renderStatus(status);
    await speak(opening);

    if (!consultationRunning) return;
    startListening((text) => ask(text, input, chat, status));
    setState("listening");
    renderStatus(status);
  }

  function stopConsultation(voiceBtn, status) {
    consultationRunning = false;
    speechRunId += 1;
    stopListening();
    stopMouthIdle();
    stopMouthAudio();
    stopCurrentAudio();
    window.speechSynthesis?.cancel?.();
    sendMouth(0).catch(() => {});
    setState("idle");
    voiceBtn.textContent = "Start tale";
    renderStatus(status);
  }

  function openingMessage() {
    consultation.currentQuestionText = questionText(consultationQuestions[0]);
    return (
      "Velkommen til den automatiserede præventionsscreening. Jeg beregner prævention baseret på dine input.\n\n" +
      consultation.currentQuestionText
    );
  }

  async function ask(rawText, input, chat, status) {
    const text = String(rawText || "").trim();
    if (!text) {
      if (consultationRunning && !consultation.completed) {
        const reply = rejectCurrentInput("Manglende svar");
        msg(chat, "doctor", reply);
        await speak(reply);
      }
      return;
    }
    input.value = "";
    if (closingFlow) {
      return;
    }
    if (!consultationRunning && !consultation.completed) {
      const reply = "Start ikke registreret. Tryk start for ny konsultation.";
      msg(chat, "doctor", reply);
      await speak(reply);
      setState("idle");
      renderStatus(status);
      return;
    }
    msg(chat, "user", text);
    messages.push({ role: "user", text });
    setState("processing");
    renderStatus(status);

    const wasCompleted = consultation.completed;
    const canUseServerApi = !isGitHubPages() || apiKey;
    const reply = consultationRunning ? consultationReply(text) : canUseServerApi ? await askOpenAI(text, chat) : fallbackReply(text);
    msg(chat, "doctor", reply);
    messages.push({ role: "assistant", text: reply });
    messages = messages.slice(-12);

    setState("processing");
    renderStatus(status);
    await speak(reply);

    if (!wasCompleted && consultation.completed) {
      const recommendation = ensureRecommendation();
      await sleep(3000);
      const analysisText = "Analyserer data.";
      msg(chat, "doctor", analysisText);
      messages.push({ role: "assistant", text: analysisText });
      messages = messages.slice(-12);
      setState("processing");
      renderStatus(status);
      await speak(analysisText);
      setState("processing");
      renderStatus(status);
      await sleep(3000);

      const result = finalRecommendationText(recommendation, consultation.answers);
      msg(chat, "doctor", result);
      messages.push({ role: "assistant", text: result });
      messages = messages.slice(-12);
      await speak(result);

      msg(chat, "receipt", receiptPreview(recommendation, consultation.answers));
      await printReceipt(chat);
      await finishConsultationAndReturnToStart(chat, status);
    }

    setState(closingFlow ? "waiting_for_reply" : listening ? "listening" : "waiting_for_reply");
    renderStatus(status);
  }

  async function askOpenAI(text, chat) {
    try {
      if (isGitHubPages()) {
        system(chat, "GitHub Pages-versionen kan ikke bruge den lokale GPT-server. Koer appen via dev-server.js for GPT og OpenAI-tale.");
        return fallbackReply(text);
      }
      const history = messages.slice(-8).map((m) => `${m.role}: ${m.text}`).join("\n");
      const prompt =
        SYSTEM_PROMPT +
        "\n\nSvar kort nok til at kunne siges højt af en robot. Maks 45 ord, medmindre du giver den afsluttende kvitteringsetiket. Stil højst ét spørgsmål i hvert svar. Giv ikke medicinske anbefalinger.\n\n" +
        `Historik:\n${history}\n\nBruger: ${text}`;
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          prompt,
        }),
      });
      if (!response.ok) {
        const errorPayload = await response.json().catch(() => ({}));
        throw new Error(errorPayload.error || `Local API HTTP ${response.status}`);
      }
      const data = await response.json();
      return data.text || fallbackReply(text);
    } catch (error) {
      system(chat, `GPT-fejl, bruger fallback: ${error.message || error}`);
      return fallbackReply(text);
    }
  }

  function extractText(data) {
    if (data.output_text) return String(data.output_text).trim();
    const chunks = [];
    for (const item of data.output || []) {
      for (const part of item.content || []) {
        if (part.text) chunks.push(part.text);
      }
    }
    return chunks.join(" ").trim();
  }

  const consultationQuestions = [
    {
      id: "purpose",
      label: "Formål",
      text: "Hvad er dit formål med præventionen?",
      help: "Du kan tænke på om det handler om at undgå graviditet, påvirke din menstruation eller mindske smerter.",
      reaction: "Svar registreret.",
    },
    {
      id: "protection",
      label: "Beskyttelsesbehov",
      text: "Hvilken type beskyttelse har du brug for?",
      help: "Du kan overveje om du vil beskytte dig mod graviditet, kønssygdomme eller begge dele.",
      reaction: "Svar registreret.",
    },
    {
      id: "usage",
      label: "Anvendelse",
      text: "Hvordan ønsker du at bruge præventionen?",
      help: "Du kan tænke på om det skal være noget du bruger dagligt, i en længere periode, som akut løsning eller permanent.",
      reaction: "Svar registreret.",
    },
    {
      id: "methodType",
      label: "Metodetype",
      text: "Hvilken type prævention foretrækker du?",
      help: "Du kan overveje om du foretrækker hormonel, ikke-hormonel, akut eller permanent prævention.",
      reaction: "Svar registreret.",
    },
  ];

  function questionText(question) {
    const options = [question?.text, ...(question?.variants || [])].filter(Boolean);
    if (!options.length) return "";
    return options[Math.floor(Math.random() * options.length)];
  }

  function createConsultation() {
    return {
      step: 0,
      answers: {},
      completed: false,
      recommendation: null,
      currentQuestionText: "",
      invalidCount: 0,
    };
  }

  const receiptTemplates = {
    "P-PILLER": {
      beskytter: "Graviditet",
      anvendelse: "Tages dagligt.",
      heading: "MANGE KVINDER OPLEVER BIVIRKNINGER SOM:",
      effects: ["Humørsvingninger", "Kvalme", "Hovedpine"],
      ansvar: "Kvinder.",
    },
    "MINI-PILLER": {
      beskytter: "Graviditet",
      anvendelse: "Tages dagligt på samme tidspunkt.",
      heading: "MANGE KVINDER OPLEVER BIVIRKNINGER SOM:",
      effects: ["Uregelmæssig blødning", "Hovedpine", "Humørsvingninger"],
      ansvar: "Kvinder.",
    },
    "KOBBERSPIRAL": {
      beskytter: "Graviditet",
      anvendelse: "Indsættes i livmoderen.",
      heading: "MANGE KVINDER OPLEVER BIVIRKNINGER SOM:",
      effects: ["Kraftigere menstruation", "Smerter", "Kramper"],
      ansvar: "Kvinder.",
    },
    "HORMONSPIRAL": {
      beskytter: "Graviditet",
      anvendelse: "Indsættes i livmoderen.",
      heading: "MANGE KVINDER OPLEVER BIVIRKNINGER SOM:",
      effects: ["Uregelmæssig blødning", "Hovedpine", "Smerter"],
      ansvar: "Kvinder.",
    },
    "P-STAV": {
      beskytter: "Graviditet",
      anvendelse: "Indsættes under huden i armen.",
      heading: "MANGE KVINDER OPLEVER BIVIRKNINGER SOM:",
      effects: ["Uregelmæssig blødning", "Humørsvingninger", "Vægtændring"],
      ansvar: "Kvinder.",
    },
    "P-RING": {
      beskytter: "Graviditet",
      anvendelse: "Placeres i skeden og skiftes månedligt.",
      heading: "MANGE KVINDER OPLEVER BIVIRKNINGER SOM:",
      effects: ["Hovedpine", "Kvalme", "Humørsvingninger"],
      ansvar: "Kvinder.",
    },
    "P-SPRØJTE": {
      beskytter: "Graviditet",
      anvendelse: "Indsprøjtes hver 3. måned.",
      heading: "MANGE KVINDER OPLEVER BIVIRKNINGER SOM:",
      effects: ["Vægtøgning", "Uregelmæssig menstruation", "Humørsvingninger"],
      ansvar: "Kvinder.",
    },
    "PESSAR": {
      beskytter: "Graviditet",
      anvendelse: "Indsættes i skeden før samleje.",
      heading: "MANGE KVINDER OPLEVER BIVIRKNINGER SOM:",
      effects: ["Irritation", "Ubehag", "Infektion"],
      ansvar: "Kvinder.",
    },
    "FEMIDOM": {
      beskytter: "Graviditet + kønssygdomme",
      anvendelse: "Indsættes i skeden før samleje.",
      heading: "MANGE KVINDER OPLEVER BIVIRKNINGER SOM:",
      effects: ["Ubehag", "Svær at anvende korrekt", "Mindre følsomhed"],
      ansvar: "Kvinder.",
    },
    "P-PLASTER": {
      beskytter: "Graviditet",
      anvendelse: "Sættes på huden og skiftes ugentligt.",
      heading: "MANGE KVINDER OPLEVER BIVIRKNINGER SOM:",
      effects: ["Hudirritation", "Hovedpine", "Kvalme"],
      ansvar: "Kvinder.",
    },
    "STERILISATION (KVINDE)": {
      beskytter: "Graviditet",
      anvendelse: "Operation (*Permanent løsning - kan ikke fortrydes.)",
      heading: "MANGE KVINDER OPLEVER BIVIRKNINGER SOM:",
      effects: ["Smerter", "Risiko ved operation", "Lang heling"],
      ansvar: "Kvinder.",
    },
    "STERILISATION (MAND)": {
      beskytter: "Graviditet",
      anvendelse: "Operation (*Permanent - i nogle tilfælde kan der foretages en tilbageoperation, men uden garanti.)",
      heading: "BIVIRKNINGER (KAN FOREKOMME):",
      effects: ["Lette smerter", "Hævelse", "Sjældne komplikationer"],
      ansvar: "Mænd.",
    },
    "NØDPRÆVENTION": {
      beskytter: "Graviditet (efter samleje)",
      anvendelse: "Tages hurtigst muligt efter sex. (*Virker ikke altid og er ikke en sikker metode.)",
      heading: "MANGE KVINDER OPLEVER BIVIRKNINGER SOM:",
      effects: ["Kraftig hormonpåvirkning, da der er en høj dosis hormon i én pille", "Kvalme", "Træthed", "Hovedpine"],
      ansvar: "Kvinder.",
    },
    "KONDOM": {
      beskytter: "Graviditet + kønssygdomme",
      anvendelse: "Sættes på penis før samleje.",
      heading: "BIVIRKNINGER (KAN FOREKOMME):",
      effects: ["Kan gå i stykker", "Kan glide af", "Nedsat følsomhed"],
      ansvar: "Mænd.",
    },
  };

  function consultationReply(text) {
    if (consultation.completed) {
      const recommendation = ensureRecommendation();
      return (
        "Konsultationen er afsluttet. Profilen er allerede mærket: " +
        `${recommendation.method}. Kvitteringen kan udskrives igen. Systemet elsker gentagelser.`
      );
    }

    const currentQuestion = consultationQuestions[consultation.step];
    const explanation = explainUnknownTerm(text);
    if (explanation) {
      return explainAndRepeatCurrentQuestion(explanation);
    }
    if (isDoubtInput(text)) {
      return clarifyCurrentQuestion();
    }
    if (isUnseriousInput(text)) {
      return rejectCurrentInput("Uden for tilladte svarmuligheder", "Sarkasme registreret. Relevans ikke fundet.");
    }
    if (isUnclearForQuestion(currentQuestion, text)) {
      return clarifyCurrentQuestion();
    }
    if (isClearlyIrrelevant(text)) {
      return rejectCurrentInput("Uden for tilladte svarmuligheder");
    }
    if (!answerMatchesQuestion(currentQuestion, text)) {
      return clarifyCurrentQuestion();
    }

    if (currentQuestion) {
      consultation.answers[currentQuestion.id] = text;
      consultation.invalidCount = 0;
    }

    if (consultation.step < consultationQuestions.length - 1) {
      const reaction = currentQuestion?.reaction || "Svar registreret.";
      consultation.step += 1;
      consultation.currentQuestionText = questionText(consultationQuestions[consultation.step]);
      return `${reaction}\n…\n\n${consultation.currentQuestionText}`;
    }

    consultation.completed = true;
    ensureRecommendation();
    return `${currentQuestion?.reaction || "Svar registreret."}`;
  }

  function ensureRecommendation() {
    if (!consultation.recommendation) {
      consultation.recommendation = chooseRecommendation(consultation.answers || {});
    }
    if (!lastReceipt) {
      lastReceipt = buildReceipt(consultation.recommendation, consultation.answers || {});
    }
    return consultation.recommendation;
  }

  function repeatCurrentQuestion() {
    const question = consultationQuestions[consultation.step];
    if (!consultation.currentQuestionText) {
      consultation.currentQuestionText = questionText(question);
    }
    return consultation.currentQuestionText;
  }

  function rejectCurrentInput(reason, systemLine = "") {
    consultation.invalidCount += 1;
    if (consultation.invalidCount >= 3) {
      consultation = createConsultation();
      consultation.currentQuestionText = questionText(consultationQuestions[0]);
      return `Input afvist.\n• Systemvalidering fejlede\n\nSession nulstillet.\n\n${consultation.currentQuestionText}`;
    }

    const redirect = systemLine ? `\n\n${systemLine}` : "";
    return `Input afvist.\n• ${reason}${redirect}\n\n${repeatCurrentQuestion()}`;
  }

  function clarifyCurrentQuestion() {
    consultation.invalidCount += 1;
    if (consultation.invalidCount >= 3) {
      consultation = createConsultation();
      consultation.currentQuestionText = questionText(consultationQuestions[0]);
      return `Input afvist.\n• Systemvalidering fejlede\n\nSession nulstillet.\n\n${consultation.currentQuestionText}`;
    }

    const question = consultationQuestions[consultation.step];
    const help = question?.help || "Er du i tvivl? Har du brug for hjælp?";
    return `Svar uklart. Har du brug for hjælp?\n\n${help}\n\n${repeatCurrentQuestion()}`;
  }

  function explainAndRepeatCurrentQuestion(explanation) {
    consultation.invalidCount += 1;
    if (consultation.invalidCount >= 3) {
      consultation = createConsultation();
      consultation.currentQuestionText = questionText(consultationQuestions[0]);
      return `Input afvist.\n• Systemvalidering fejlede\n\nSession nulstillet.\n\n${consultation.currentQuestionText}`;
    }

    return `${explanation}\n\n${repeatCurrentQuestion()}`;
  }

  function explainUnknownTerm(text) {
    const lower = String(text || "").toLowerCase().trim();
    if (!/(hvad er|hvad betyder|ved ikke hvad|forstår ikke|forstÃ¥r ikke|kender ikke)/.test(lower)) return "";

    const explanations = [
      [/kønssygdom|koenssygdom|sexsygdom|smitte/, "Kønssygdomme er sygdomme, der kan smitte ved sex. Kondom og femidom kan beskytte mod flere af dem."],
      [/graviditet|gravid/, "Graviditet betyder, at et befrugtet æg udvikler sig i livmoderen. Prævention kan bruges til at mindske risikoen."],
      [/menstruation|mens|blødning|bloeding/, "Menstruation er blødning fra livmoderen. Nogle præventionsformer kan påvirke hvor ofte eller hvor kraftigt du bløder."],
      [/symptomlindring|smerter|pms/, "Symptomlindring betyder at mindske gener. Her handler det typisk om menstruationssmerter, PMS eller kraftig blødning."],
      [/hormonel|hormon/, "Hormonel prævention indeholder hormoner. De kan påvirke ægløsning, blødning og risikoen for graviditet."],
      [/ikke[- ]hormonel|uden hormon/, "Ikke-hormonel prævention betyder prævention uden hormoner. Det kan for eksempel være kobberspiral, kondom, femidom eller pessar."],
      [/akut|nød|noed/, "Akut prævention bruges efter ubeskyttet sex eller svigtet prævention. Det er en nødløsning, ikke en fast metode."],
      [/permanent|sterilisation/, "Permanent prævention betyder en metode, der er lavet til at vare resten af livet. Sterilisation er permanent prævention."],
      [/pcos/, "PCOS er en hormonel tilstand, der kan påvirke menstruation, hud og ægløsning."],
      [/endometriose/, "Endometriose er en sygdom, hvor væv, der ligner livmoderslimhinde, findes uden for livmoderen. Det kan give smerter."],
      [/barriere/, "Barrieremetoder lægger en fysisk barriere mellem sæd og krop. Kondom, femidom og pessar er barrieremetoder."],
      [/pessar/, "Pessar er en lille skål af silikone, der sættes op i skeden før sex. Den dækker livmoderhalsen."],
      [/femidom|kvindekondom/, "Femidom er et kondom, der placeres i skeden. Det kan beskytte mod graviditet og kønssygdomme."],
      [/kobberspiral/, "Kobberspiral er en lille genstand med kobber, der sættes op i livmoderen. Den indeholder ikke hormoner."],
      [/hormonspiral|spiral/, "Spiral er en lille genstand, der sættes op i livmoderen. Kobberspiral er uden hormon. Hormonspiral afgiver hormon lokalt."],
      [/p-stav|stav/, "P-stav er en lille hormonstav, der sættes under huden i overarmen. Den virker i længere tid."],
      [/p-ring|ring/, "P-ring er en blød hormonring, der placeres i skeden og skiftes efter en fast rytme."],
      [/p-plaster|plaster/, "P-plaster er et hormonplaster, der sættes på huden og skiftes regelmæssigt."],
      [/p-sprøjte|p-sproejte|sprøjte|sproejte/, "P-sprøjte er hormonel prævention, der gives som en indsprøjtning cirka hver tredje måned."],
      [/mini-pille|minipille/, "Mini-piller er hormonpiller, der tages hver dag på cirka samme tidspunkt."],
      [/p-pille|pille/, "P-piller er hormonpiller, der tages hver dag. De bruges ofte til at forebygge graviditet."],
    ];

    const found = explanations.find(([pattern]) => pattern.test(lower));
    if (found) return `Kort forklaring: ${found[1]}`;
    return contextualExplanation();
  }

  function contextualExplanation() {
    const question = consultationQuestions[consultation.step];
    const explanations = {
      purpose: "Kort forklaring: Formål betyder, hvorfor du vil bruge prævention. Det kan handle om graviditet, menstruation, smerter eller hud.",
      protection: "Kort forklaring: Beskyttelse betyder, hvad præventionen skal beskytte imod. Det kan være graviditet, kønssygdomme eller begge dele.",
      usage: "Kort forklaring: Anvendelse betyder, hvordan metoden bruges. Nogle bruges dagligt, nogle virker længe, nogle bruges akut, og nogle er permanente.",
      methodType: "Kort forklaring: Metodetype betyder hvilken slags prævention du foretrækker. Hormonel bruger hormoner. Ikke-hormonel gør ikke.",
    };
    return explanations[question?.id] || "Kort forklaring: Jeg forklarer kun begreber, der hører til præventionsscreeningen.";
  }

  function isUnseriousInput(text) {
    const lower = String(text || "").toLowerCase().trim();
    return /(fuck|fisse|pik|lort|røv|rÃ¸v|sexmaskine|din mor|haha|lol|blah|bla bla|skibidi|sigma|gyat|idiot|hold kæft|hold kÃ¦ft)/i.test(lower);
  }

  function isDoubtInput(text) {
    const lower = String(text || "").toLowerCase().trim();
    return /^(ja|nej|måske|mÃ¥ske|ok|okay|ved ikke|det ved jeg ikke|ingen ide|pas|hvad|gentag|\?)$/.test(lower);
  }

  function isClearlyIrrelevant(text) {
    const lower = String(text || "").toLowerCase().trim();
    return /(pizza|mad|vejret|musik|tiktok|youtube|minecraft|fortnite|fodbold|lektier|skolefest|kat|hund|bil|computer|film|serie|penge|bank|ferie|arbejde|job)/i.test(lower);
  }

  function isUnclearForQuestion(question, text) {
    const lower = String(text || "").toLowerCase().trim();
    if (/^(det ved jeg ikke|ved ikke|ingen ide|pas|måske|mÃ¥ske|hvad mener du|kan du hjælpe|kan du hjÃ¦lpe|hjælp|hjÃ¦lp)$/.test(lower)) {
      return true;
    }
    const vague = /^(sikker|trygt|nemt|let|bedst|normalt|almindeligt|noget godt|det bedste|jeg er usikker)$/;
    if (!vague.test(lower)) return false;
    return question?.id !== "usage";
  }

  function answerMatchesQuestion(question, text) {
    const lower = String(text || "").toLowerCase().trim();
    if (!lower) return false;
    if (isDoubtInput(lower)) {
      return false;
    }

    const checks = {
      purpose: /graviditetsforebyggelse|undgå graviditet|undgaa graviditet|graviditet|menstruationsregulering|regulere menstruation|menstruation|blødning|bloeding|kønssygdomme|kønssygdom|smitte|kombination|begge|symptomlindring|smerter|pms|hud|akne|hormonel tilstand|hormoner|pcos|endometriose|beskyttelse|forebygge/,
      protection: /graviditet|kønssygdomme|kønssygdom|smitte|sexsygdom|sexsygdomme|begge|begge dele|kombination|beskyttelse|kondom|femidom/,
      usage: /daglig|hver dag|pille|langvarig|lang tid|længere periode|laengere periode|sjældent|sjaeldent|akut|nød|noed|permanent|fast|midlertidig|diskret|nemt|let|huske|operation|spiral|stav|plaster|ring|sprøjte|sproejte/,
      methodType: /hormonel|hormon|hormoner|ikke-hormonel|ikke hormonel|uden hormon|uden hormoner|akut|nød|noed|permanent|kobber|barriere|kondom|femidom|pessar|spiral|pille|stav|plaster|ring|sprøjte|sproejte/,
    };

    if (checks[question?.id]?.test(lower)) return true;
    return isContraceptionRelated(lower);
  }

  function isContraceptionRelated(text) {
    return /prævention|praevention|beskyttelse|gravid|graviditet|kønssygdom|koenssygdom|smitte|sex|samleje|kondom|femidom|pessar|pille|p-pille|mini-pille|spiral|kobber|hormon|stav|plaster|ring|sprøjte|sproejte|sterilisation|nødprævention|noedpraevention|menstruation|blødning|bloeding|smerter|pms|akne|hud|pcos|endometriose|bivirkning|daglig|langvarig|akut|permanent/i.test(text);
  }

  function chooseRecommendation(answers) {
    const combined = Object.values(answers).join(" ").toLowerCase();
    const purpose = String(answers.purpose || "").toLowerCase();
    const protection = String(answers.protection || "").toLowerCase();
    const usage = String(answers.usage || "").toLowerCase();
    const methodType = String(answers.methodType || "").toLowerCase();
    const wantsStiProtection = /kønssygdom|kønssygdomme|begge|begge dele/.test(protection);
    const wantsPermanent = /permanent/.test(usage) || /permanent/.test(methodType);
    const wantsAcute = /akut/.test(usage) || /akut/.test(methodType);
    const wantsNonHormonal = /ikke-hormonel|ikke hormonel/.test(methodType);
    const wantsHormonal = /hormonel/.test(methodType) && !wantsNonHormonal;
    const wantsDaily = /daglig/.test(usage);
    const wantsLong = /langvarig/.test(usage);
    let method = "P-PILLER";

    if (wantsStiProtection) {
      method = "KONDOM";
    } else if (wantsPermanent && /mand|mænd/.test(combined)) {
      method = "STERILISATION (MAND)";
    } else if (wantsPermanent) {
      method = "STERILISATION (KVINDE)";
    } else if (wantsAcute) {
      method = "NØDPRÆVENTION";
    } else if (wantsHormonal && wantsDaily) {
      method = /menstruation|smerter|pms|akne|hud|pcos|endometriose/.test(purpose) ? "P-PILLER" : "P-PILLER";
    } else if (wantsHormonal && wantsLong) {
      method = /hud|akne/.test(purpose) ? "P-STAV" : "HORMONSPIRAL";
    } else if (wantsNonHormonal) {
      method = "KOBBERSPIRAL";
    }

    return {
      method,
      receipt: receiptTemplates[method],
      reason: "",
      partner: "",
      redFlag: method === "NØDPRÆVENTION",
    };
  }

  function finalRecommendationText(recommendation, answers) {
    return `Tildeling gennemført.\n\n${clinicalOutputText(recommendation, answers)}\n\n${inequalitySystemNote()}\n\nSystemet genererer kvittering...`;
  }

  function inequalitySystemNote() {
    return (
      "SYSTEMNOTE:\n" +
      "Præventionsmuligheder er ikke ligeligt fordelt. De fleste hormonelle præventionsformer er udviklet til kvinder. " +
      "Mandlige muligheder er i dag primært begrænset til kondom og sterilisation."
    );
  }

  function clinicalOutputText(recommendation, answers) {
    const safeRecommendation = recommendation || chooseRecommendation(answers || {});
    const receipt = safeRecommendation.receipt || receiptTemplates["P-PILLER"];
    const lines = [
      "TILDELT PRÆVENTION:",
      safeRecommendation.method,
      "",
      "BESKYTTER MOD:",
      receipt.beskytter,
      "",
      "EFFEKTIVITET:",
      effectivenessText(safeRecommendation.method),
      "",
      "ANVENDELSE:",
      receipt.anvendelse,
      "",
      "BRUGERKØN:",
      userGenderText(receipt.ansvar),
      "",
      "REGISTREREDE BIVIRKNINGER:",
      ...receipt.effects.slice(0, 3).map((effect) => `• ${effect}`),
    ];
    return lines.join("\n");
  }

  function effectivenessText(method) {
    if (method === "KONDOM" || method === "FEMIDOM" || method === "PESSAR") {
      return "Afhænger af korrekt brug. Ikke en garanti.";
    }
    if (method === "NØDPRÆVENTION") {
      return "Akut metode. Effekt varierer.";
    }
    if (method.includes("STERILISATION")) {
      return "Permanent metode. Effekt vurderes som høj.";
    }
    return "Typisk høj ved korrekt brug. Ikke en garanti.";
  }

  function userGenderText(ansvar) {
    return /mænd|maend|mand/i.test(ansvar) ? "mand" : "kvinde";
  }

  function buildReceipt(recommendation, answers) {
    const safeRecommendation = recommendation || chooseRecommendation(answers || {});
    const receipt = safeRecommendation.receipt || receiptTemplates["P-PILLER"];
    return [
      safeRecommendation.method,
      receipt.beskytter,
      receipt.anvendelse,
      receipt.heading,
      receipt.effects.join("~"),
      receipt.ansvar,
    ];
  }

  function receiptPreview(recommendation, answers) {
    return receiptText(recommendation, answers);
  }

  function receiptText(recommendation, answers) {
    const safeRecommendation = recommendation || chooseRecommendation(answers || {});
    const receipt = safeRecommendation.receipt || receiptTemplates["P-PILLER"];
    const lines = [
      "TILDELT PRÆVENTION:",
      safeRecommendation.method,
      "",
      "BESKYTTER MOD:",
      receipt.beskytter,
      "",
      "ANVENDELSE:",
      receipt.anvendelse,
      "",
      receipt.heading,
      ...receipt.effects.map((effect) => `• ${effect}`),
      "",
      "ANSVAR:",
      receipt.ansvar,
      "",
      "---",
      "",
      "VIDSTE DU AT…?",
      "Der findes over 12 præventionsformer til kvinder,",
      "men kun 2 til mænd.",
    ];
    return lines.join("\n");
  }

  function shortAnswer(value) {
    const text = String(value || "-").replace(/\s+/g, " ").trim();
    return text.length > 34 ? `${text.slice(0, 31)}...` : text;
  }

  function receiptSafe(value) {
    return String(value || "-")
      .replace(/[|\r\n]/g, " ")
      .replace(/\s+/g, " ")
      .trim();
  }

  async function saveKeyToLocalServer(nextApiKey, chat) {
    try {
      if (isGitHubPages()) {
        system(chat, "API-key er kun gemt i denne browser. GPT virker foerst, naar appen koerer med den lokale Node-server.");
        return;
      }
      const response = await fetch("/api/key", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ apiKey: nextApiKey }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok || !data.ok) {
        throw new Error(data.error || `Local key save HTTP ${response.status}`);
      }
      system(chat, nextApiKey ? "API-key gemt i den lokale server-session." : "API-key fjernet.");
    } catch (error) {
      system(chat, `Kunne ikke gemme API-key i lokal server: ${error.message || error}`);
    }
  }

  function isGitHubPages() {
    return location.hostname.endsWith(".github.io");
  }

  function fallbackReply(text) {
    const lower = text.toLowerCase();
    const userTurns = messages.filter((m) => m.role === "user").length;
    if (userTurns <= 1) {
      return "Registreret. Robotlægen starter kun én protokol. Hvilken hændelse forsøger du at forhindre: graviditet, smitte eller begge dele?";
    }
    if (userTurns === 2) {
      return "Bemærket. Systemet kalder det fælles ansvar. Hvem har den fysiske opgave med kondom?";
    }
    if (userTurns === 3) {
      return "Noteret. Kroppen indgår i beslutningen, også når den ikke bliver spurgt. Accepterer du hormonel påvirkning?";
    }
    if (userTurns === 4) {
      return "Interessant. Rutiner svigter mere stille end mennesker indrømmer. Hvad tåler din hverdag bedst: daglig kontrol, sjælden kontrol eller diskretion?";
    }
    if (lower.includes("kondom")) {
      return "Kondom registreret. Partneransvar har fået et objekt. Hvem holder objektet klar?";
    }
    if (lower.includes("p-pille") || lower.includes("pille")) {
      return "Pille registreret. Daglig kontrol ønskes af systemet. Kroppen får kalenderen.";
    }
    if (lower.includes("nød") || lower.includes("fortryd")) {
      return "Akut markering registreret. Robotlægen udsteder ikke løsninger. Beskriv kun situationens kategori.";
    }
    return "Profilen er uklar. Systemet kan stadig printe. Det betyder ikke, at kroppen har accepteret fordelingen.";
  }

  function startListening(onText) {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) return;
    activeSpeechHandler = onText;
    recognitionSuspended = false;
    recognition = new SpeechRecognition();
    recognition.lang = "da-DK";
    recognition.continuous = true;
    recognition.interimResults = false;
    const recognitionSession = recognition;
    recognition.onresult = (event) => {
      if (recognition !== recognitionSession) return;
      if (Date.now() < ignoreSpeechUntil) return;
      const result = event.results[event.results.length - 1];
      const text = result && result[0] ? result[0].transcript : "";
      if (isRobotEcho(text)) return;
      if (text.trim()) onText(text);
    };
    recognition.onend = () => {
      if (recognition !== recognitionSession) return;
      if (listening && !recognitionSuspended) recognition.start();
    };
    listening = true;
    setState("listening");
    recognition.start();
  }

  function stopListening() {
    listening = false;
    recognitionSuspended = false;
    activeSpeechHandler = null;
    if (recognition) recognition.stop();
    recognition = null;
    setState("idle");
  }

  async function speak(text) {
    speechRunId += 1;
    const runId = speechRunId;
    stopCurrentAudio();
    stopMouthAudio();
    window.speechSynthesis?.cancel?.();
    suspendRecognitionWhileSpeaking();

    try {
      if ((!apiKey && isGitHubPages()) || !USE_OPENAI_TTS) return await speakWithBrowser(text, runId);
      return await speakWithOpenAI(text, runId).catch(() => {
        if (runId !== speechRunId) return;
        return speakWithBrowser(text, runId);
      });
    } finally {
      if (runId === speechRunId) resumeRecognitionAfterSpeech();
    }
  }

  function suspendRecognitionWhileSpeaking() {
    ignoreSpeechUntil = Date.now() + 4000;
    if (!listening || !recognition) return;
    recognitionSuspended = true;
    try {
      recognition.stop();
    } catch {
      // Browser speech recognition can already be stopping.
    }
  }

  function resumeRecognitionAfterSpeech() {
    ignoreSpeechUntil = Date.now() + 1800;
    if (!listening || !activeSpeechHandler) return;
    window.setTimeout(() => {
      if (!listening || !activeSpeechHandler) return;
      recognitionSuspended = false;
      startListening(activeSpeechHandler);
    }, 450);
  }

  function isRobotEcho(text) {
    const normalized = String(text || "").toLowerCase().replace(/[^\p{L}\p{N}\s]/gu, " ").replace(/\s+/g, " ").trim();
    if (!normalized) return true;
    return /^(robotlægen|robotlaegen|registreret|svar registreret|input afvist|angiv|vælg|vaelg|analyserer data|tildeling gennemført|tildeling gennemfoert|systemnote|præventionsmuligheder|praeventionsmuligheder|systemet genererer|session afsluttet|her er din kvittering)/i.test(normalized);
  }

  async function speakWithOpenAI(text, runId) {
    const response = await fetch("/api/speech", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ text }),
    });

    if (!response.ok) {
      const payload = await response.json().catch(() => ({}));
      throw new Error(payload.error || `Speech HTTP ${response.status}`);
    }

    if (runId !== speechRunId) return;

    const blob = await response.blob();
    const audioUrl = URL.createObjectURL(blob);
    const audio = new Audio(audioUrl);
    currentAudio = audio;

    return new Promise((resolve) => {
      const finish = () => {
        if (runId !== speechRunId) return resolve();
        stopMouthAudio();
        sendMouth(0);
        ignoreSpeechUntil = Date.now() + 1400;
        URL.revokeObjectURL(audioUrl);
        if (currentAudio === audio) currentAudio = null;
        resolve();
      };

      audio.onplaying = () => {
        if (runId === speechRunId) startMouthAudio(audio);
      };
      audio.onended = finish;
      audio.onerror = finish;
      audio.play().catch(finish);
    });
  }

  function stopCurrentAudio() {
    if (!currentAudio) return;
    currentAudio.pause();
    currentAudio.currentTime = 0;
    stopMouthAudio();
    currentAudio = null;
  }

  function speakWithBrowser(text, runId) {
    return new Promise((resolve) => {
      if (!window.speechSynthesis) return resolve();
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.lang = "da-DK";
      utterance.voice = selectDanishVoice();
      utterance.rate = 0.9;
      utterance.pitch = 1.0;
      utterance.volume = 1.0;
      const stopMouth = () => {
        if (runId !== speechRunId) return resolve();
        stopMouthIdle();
        sendMouth(0);
        ignoreSpeechUntil = Date.now() + 1400;
        resolve();
      };
      utterance.onboundary = () => pulseMouth();
      utterance.onstart = () => {
        setState("speaking");
        startMouthIdle();
      };
      utterance.onend = stopMouth;
      utterance.onerror = stopMouth;
      window.speechSynthesis.speak(utterance);
    });
  }

  function selectDanishVoice() {
    const voices = window.speechSynthesis?.getVoices?.() || [];
    const danishVoices = voices.filter((voice) => voice.lang && voice.lang.toLowerCase().startsWith("da"));
    if (!danishVoices.length) return null;

    return (
      danishVoices.find((voice) => /natural|neural|premium|online/i.test(voice.name)) ||
      danishVoices.find((voice) => /microsoft|google|apple/i.test(voice.name)) ||
      danishVoices[0]
    );
  }

  function pulseMouth() {
    sendMouth(62 + Math.round(Math.random() * 20));
    if (mouthCloseTimer) window.clearTimeout(mouthCloseTimer);
    mouthCloseTimer = window.setTimeout(() => sendMouth(12), 90);
  }

  function startMouthIdle() {
    stopMouthIdle();
    mouthIdleTimer = window.setInterval(() => {
      sendMouth(24 + Math.round(Math.random() * 24));
    }, 170);
  }

  function startMouthAudio(audio) {
    stopMouthAudio();

    const waitForAudiblePlayback = () => {
      if (!audio || audio.paused || audio.ended) return;
      if (audio.currentTime < 0.32) {
        mouthAudioStartTimer = window.setTimeout(waitForAudiblePlayback, 25);
        return;
      }

      setState("speaking");
      const startedAt = performance.now();
      mouthAudioTimer = window.setInterval(() => {
        if (!audio || audio.paused || audio.ended) {
          stopMouthAudio();
          sendMouth(0);
          return;
        }

        const elapsed = (performance.now() - startedAt) / 1000;
        const phrase = Math.sin(elapsed * Math.PI * 2.9);
        const syllable = Math.sin(elapsed * Math.PI * 7.2 + 0.8);
        const micro = Math.sin(elapsed * Math.PI * 15.0 + 1.7);
        const pauseGate = Math.sin(elapsed * Math.PI * 1.15) > -0.72 ? 1 : 0.24;
        const open = Math.max(0, phrase * 0.55 + syllable * 0.32 + micro * 0.08);
        const amount = Math.round(12 + open * pauseGate * 70);
        sendMouth(amount);
      }, 70);
    };

    waitForAudiblePlayback();
  }

  function stopMouthAudio() {
    if (mouthAudioStartTimer) {
      window.clearTimeout(mouthAudioStartTimer);
      mouthAudioStartTimer = null;
    }
    if (mouthAudioTimer) {
      window.clearInterval(mouthAudioTimer);
      mouthAudioTimer = null;
    }
  }

  function stopMouthIdle() {
    if (mouthIdleTimer) {
      window.clearInterval(mouthIdleTimer);
      mouthIdleTimer = null;
    }
    if (mouthCloseTimer) {
      window.clearTimeout(mouthCloseTimer);
      mouthCloseTimer = null;
    }
  }

  async function sendMouth(percent) {
    if (!serialWriter) return;
    const safePercent = Math.max(0, Math.min(100, Number(percent) || 0));
    await serialWriter.write(new TextEncoder().encode(`MOUTH:${Math.round(safePercent)}\n`));
  }

  async function sendState(nextState) {
    const safeState = states.includes(nextState) ? nextState : "idle";
    if (!serialWriter) return;
    await serialWriter.write(new TextEncoder().encode(`STATE:${safeState}\n`));
  }

  async function sendReceipt() {
    if (!serialWriter) return false;
    const fields = Array.isArray(lastReceipt) ? lastReceipt : ["Test-kvittering", "-", "-", "-", "-", "-"];
    const line = `PRINT|${fields.map(receiptSafe).join("|")}`;
    await serialWriter.write(new TextEncoder().encode(`${line}\n`));
    return true;
  }

  async function printReceipt(chat) {
    const printed = await sendReceipt();
    system(chat, printed ? "Kvittering sendt til printer." : "Kvittering fundet. Printer ikke forbundet.");
    return printed;
  }

  async function finishConsultationAndReturnToStart(chat, status) {
    const goodbye = "Her er din kvittering. Husk at tage den med dig. Session afsluttet.";
    msg(chat, "doctor", goodbye);
    messages.push({ role: "assistant", text: goodbye });
    messages = messages.slice(-12);
    await speak(goodbye);

    closingFlow = true;
    consultationRunning = false;
    setState("waiting_for_reply");
    renderStatus(status);

    if (resetAfterFlowTimer) window.clearTimeout(resetAfterFlowTimer);
    resetAfterFlowTimer = window.setTimeout(() => {
      stopListening();
      if (activeVoiceBtn) activeVoiceBtn.textContent = "Start tale";
      consultation = createConsultation();
      lastReceipt = null;
      closingFlow = false;
      setState("idle");
      renderStatus(status);
      system(chat, "Lytning stoppet. Starttilstand. Tryk start for ny konsultation.");
      resetAfterFlowTimer = null;
    }, 10000);
  }

  function setState(nextState) {
    state = states.includes(nextState) ? nextState : "idle";
    sendState(state).catch(() => {});
  }

  function animate(status) {
    drawRobot();
    renderStatus(status);
    window.requestAnimationFrame(() => animate(status));
  }

  function drawRobot() {
    if (!ctx) return;
    const w = canvas.width;
    const h = canvas.height;
    const t = performance.now() / 1000;
    ctx.fillStyle = "#10130f";
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = "#222a20";
    ctx.fillRect(0, h * 0.72, w, h * 0.28);

    const scale = Math.min(w, h) / 620;
    const speaking = state === "speaking";
    const thinking = state === "processing";
    const listeningNow = state === "listening";
    const idleOrReady = state === "idle" || state === "ready";
    const headX = w * 0.5 + Math.sin(t * (thinking ? 0.72 : idleOrReady ? 0.34 : 0.8)) * (thinking ? 34 : idleOrReady ? 22 : 10) * scale;
    const headY = h * 0.47;
    const headW = 250 * scale;
    const headH = 310 * scale;

    ctx.save();
    ctx.translate(headX, headY);
    roundRect(ctx, -headW / 2, -headH / 2, headW, headH, 24 * scale, "#d2d6c7", "#4c5446");
    roundRect(ctx, -headW * 0.36, -86 * scale, headW * 0.72, 84 * scale, 12 * scale, "#1e221c");
    const eyeX = Math.sin(t * (speaking ? 3 : idleOrReady ? 0.62 : 1.4)) * (idleOrReady ? 7 : 10) * scale;
    const scanY = Math.sin(t * 2.15) * 20 * scale;
    const eyeY = thinking ? scanY : (listeningNow ? -7 : Math.sin(t * (idleOrReady ? 0.48 : 0.9)) * (idleOrReady ? 3 : 4)) * scale;
    eye(-48 * scale + eyeX, -48 * scale + eyeY, scale);
    eye(48 * scale + eyeX, -48 * scale + eyeY, scale);
    const mouth = (speaking ? 18 + Math.abs(Math.sin(t * 12)) * 38 : 10) * scale;
    roundRect(ctx, -46 * scale, 78 * scale - mouth / 2, 92 * scale, mouth, 9 * scale, "#2c2622", "#3c2824");
    ctx.restore();

    ctx.fillStyle = "#f3f1e8";
    ctx.font = `${Math.max(20, 30 * scale)}px sans-serif`;
    ctx.textAlign = "center";
    ctx.fillText(state.toUpperCase(), w / 2, h - 48);
  }

  function eye(x, y, s) {
    ctx.fillStyle = "#f0f5e6";
    ctx.beginPath();
    ctx.ellipse(x, y, 26 * s, 23 * s, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#181d18";
    ctx.beginPath();
    ctx.ellipse(x + 3 * s, y + 2 * s, 11 * s, 12 * s, 0, 0, Math.PI * 2);
    ctx.fill();
  }

  function roundRect(context, x, y, w, h, r, fill, stroke) {
    context.beginPath();
    context.roundRect(x, y, w, h, r);
    context.fillStyle = fill;
    context.fill();
    if (stroke) {
      context.strokeStyle = stroke;
      context.lineWidth = 3;
      context.stroke();
    }
  }

  function msg(chat, role, text) {
    const item = el("div", `pd-msg ${role}`, chat);
    item.textContent = text;
    chat.scrollTop = chat.scrollHeight;
  }

  function system(chat, text) {
    const item = el("div", "pd-msg system", chat);
    item.textContent = text;
    chat.scrollTop = chat.scrollHeight;
  }

  function renderStatus(status) {
    if (!status) return;
    status.textContent = `${state} | ${serialWriter ? "robot forbundet" : "robot ikke forbundet"} | ${apiKey ? MODEL : "fallback uden GPT"}`;
  }

  function loadSettings() {
    try {
      apiKey = JSON.parse(localStorage.getItem(STORE) || "{}").apiKey || "";
    } catch {}
  }

  function saveSettings() {
    localStorage.setItem(STORE, JSON.stringify({ apiKey }));
  }

  function el(tag, className, parent) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (parent) parent.appendChild(node);
    return node;
  }

  function button(text, className, parent) {
    const node = el("button", className, parent);
    node.textContent = text;
    return node;
  }

  function sleep(ms) {
    return new Promise((resolve) => window.setTimeout(resolve, ms));
  }
})();
