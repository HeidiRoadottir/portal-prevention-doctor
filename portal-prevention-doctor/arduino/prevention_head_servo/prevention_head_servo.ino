/*
  Prevention Head Serial - stable robot baseline

  USB serial at 115200 baud:
    STATE:idle
    STATE:ready
    STATE:listening
    STATE:processing
    STATE:speaking
    STATE:waiting_for_reply
    STATE:error
    STATE:reset
    MOUTH:0..100

  Hardware mapping:
    Start button C/NO     -> pin 2 + GND
    Eye left/right servo  -> pin 3
    Eye up/down servo     -> pin 5
    Head side/side servo  -> pin 6
    Mouth servo           -> pin 9
    Thermal printer TX    -> pin 10 (optional, printer-to-Arduino)
    Thermal printer RX    -> pin 11 (Arduino-to-printer)

  Receipt printer:
    Browser sends PRINT|method|protects|effectiveness|use|gender|sideEffects|footer
    after the consultation is completed.
*/

#include <Servo.h>
#if defined(ARDUINO_ARCH_AVR)
#include <SoftwareSerial.h>
#define RECEIPT_PRINTER_AVAILABLE 1
#else
#define RECEIPT_PRINTER_AVAILABLE 0
#endif

const unsigned long SERIAL_BAUD = 115200;
const unsigned long PRINTER_BAUD = 9600;

const uint8_t BUTTON_PIN = 2;
const uint8_t SERVO_EYE_LR_PIN = 3;
const uint8_t SERVO_EYE_UD_PIN = 5;
const uint8_t SERVO_HEAD_YAW_PIN = 6;
const uint8_t SERVO_MOUTH_PIN = 9;
const uint8_t PRINTER_RX_PIN = 10;
const uint8_t PRINTER_TX_PIN = 11;

const int EYE_LR_MIN = 45;
const int EYE_LR_CENTER = 90;
const int EYE_LR_MAX = 135;

const int EYE_UD_MIN = 55;
const int EYE_UD_CENTER = 92;
const int EYE_UD_MAX = 130;

const int HEAD_YAW_MIN = 35;
const int HEAD_YAW_CENTER = 75;
const int HEAD_YAW_MAX = 115;

const int MOUTH_CLOSED = 42;
const int MOUTH_MID = 68;
const int MOUTH_OPEN = 95;

const float SERVO_SMOOTHING = 0.07f;
const float MOUTH_SMOOTHING = 0.34f;
const unsigned long BOOT_SETTLE_MS = 1400;
const unsigned long MANUAL_MOUTH_HOLD_MS = 420;
const unsigned long BUTTON_DEBOUNCE_MS = 45;

Servo servoEyeLR;
Servo servoEyeUD;
Servo servoHeadYaw;
Servo servoMouth;

#if RECEIPT_PRINTER_AVAILABLE
SoftwareSerial printerSerial(PRINTER_RX_PIN, PRINTER_TX_PIN);
#endif

String serialBuffer = "";
String currentState = "boot";

float eyeLRValue = EYE_LR_CENTER;
float eyeUDValue = EYE_UD_CENTER;
float headYawValue = HEAD_YAW_CENTER;
float mouthValue = MOUTH_CLOSED;

float eyeLRTarget = EYE_LR_CENTER;
float eyeUDTarget = EYE_UD_CENTER;
float headYawTarget = HEAD_YAW_CENTER;
float mouthTarget = MOUTH_CLOSED;

unsigned long bootStartedAt = 0;
unsigned long lastGazeShiftAt = 0;
unsigned long nextGazeShiftDelayMs = 1200;
unsigned long lastHeadShiftAt = 0;
unsigned long nextHeadShiftDelayMs = 1600;
unsigned long lastManualMouthAt = 0;
int manualMouthPercent = 0;

bool lastButtonReading = HIGH;
bool buttonState = HIGH;
unsigned long lastButtonChangeAt = 0;

void setup() {
  Serial.begin(SERIAL_BAUD);
  pinMode(BUTTON_PIN, INPUT_PULLUP);

#if RECEIPT_PRINTER_AVAILABLE
  printerSerial.begin(PRINTER_BAUD);
  resetPrinter();
#endif

  servoEyeLR.attach(SERVO_EYE_LR_PIN);
  servoEyeUD.attach(SERVO_EYE_UD_PIN);
  servoHeadYaw.attach(SERVO_HEAD_YAW_PIN);
  servoMouth.attach(SERVO_MOUTH_PIN);

  bootStartedAt = millis();
  setState("boot");
  writeServosImmediate();

  Serial.println("PreventionHeadSerial ready");
#if RECEIPT_PRINTER_AVAILABLE
  Serial.println("Receipt printer serial ready");
#else
  Serial.println("Receipt printer unavailable on this board build");
#endif
}

void loop() {
  readSerialMessages();
  readButton();
  updateStateMachine();
  updateGazeTargets();
  updateHeadTargets();
  updateStateTargets();
  easeServos();
  writeServos();
}

void readSerialMessages() {
  while (Serial.available() > 0) {
    const char ch = (char)Serial.read();
    if (ch == '\r') continue;

    if (ch == '\n') {
      if (serialBuffer.length() > 0) {
        handleLine(serialBuffer);
        serialBuffer = "";
      }
      continue;
    }

    if (serialBuffer.length() < 560) {
      serialBuffer += ch;
    }
  }
}

void readButton() {
  const bool reading = digitalRead(BUTTON_PIN);

  if (reading != lastButtonReading) {
    lastButtonChangeAt = millis();
    lastButtonReading = reading;
  }

  if (millis() - lastButtonChangeAt < BUTTON_DEBOUNCE_MS) return;

  if (reading != buttonState) {
    buttonState = reading;

    if (buttonState == LOW) {
      Serial.println("BUTTON:start");
      setState("listening");
    }
  }
}

void handleLine(String line) {
  line.trim();
  if (!line.length()) return;

  if (line.startsWith("STATE:")) {
    String next = line.substring(6);
    next.trim();
    next.toLowerCase();
    setState(next);
    Serial.print("state -> ");
    Serial.println(currentState);
  } else if (line.startsWith("MOUTH:")) {
    String value = line.substring(6);
    value.trim();
    manualMouthPercent = constrain(value.toInt(), 0, 100);
    lastManualMouthAt = millis();
    mouthTarget = map(manualMouthPercent, 0, 100, MOUTH_CLOSED, MOUTH_OPEN);
  } else if (line.startsWith("PRINT|")) {
    printReceipt(line);
  }
}

void resetPrinter() {
#if RECEIPT_PRINTER_AVAILABLE
  printerSerial.write(27);
  printerSerial.write('@');
  delay(60);
#endif
}

void printReceipt(const String &line) {
#if RECEIPT_PRINTER_AVAILABLE
  String fields[7];
  splitReceiptFields(line, fields, 7);

  resetPrinter();
  printerSerial.println();
  printerSerial.println("TILDELT PRAEVENTION:");
  printerSerial.println(printerAscii(fields[0]));
  printerSerial.println();
  printerSerial.println("BESKYTTER MOD:");
  printerSerial.println(printerAscii(fields[1]));
  printerSerial.println();
  printerSerial.println("EFFEKTIVITET:");
  printerSerial.println(printerAscii(fields[2]));
  printerSerial.println();
  printerSerial.println("ANVENDELSE:");
  printerSerial.println(printerAscii(fields[3]));
  printerSerial.println();
  printerSerial.println("BRUGERKOEN:");
  printerSerial.println(printerAscii(fields[4]));
  printerSerial.println();
  printerSerial.println("REGISTREREDE BIVIRKNINGER:");
  printReceiptEffects(fields[5]);
  printerSerial.println();
  printerSerial.println("---");
  printerSerial.println();
  printReceiptFooter(fields[6]);
  printerSerial.println();
  printerSerial.println();
  printerSerial.println();

  Serial.println("PRINT:done");
#else
  Serial.println("PRINT:printer_unavailable");
#endif
}

String printerText(String value) {
  value.replace("æ", "ae");
  value.replace("ø", "oe");
  value.replace("å", "aa");
  value.replace("Æ", "AE");
  value.replace("Ø", "OE");
  value.replace("Å", "AA");
  value.replace("…", "...");
  value.replace("–", "-");
  value.replace("•", "-");
  value.trim();
  if (!value.length()) return "-";
  return value;
}

String printerAscii(String value) {
  value.trim();
  String clean = "";
  for (unsigned int i = 0; i < value.length(); i += 1) {
    const char ch = value.charAt(i);
    if (ch >= 32 && ch <= 126) {
      clean += ch;
    }
  }
  clean.trim();
  if (!clean.length()) return "-";
  return clean;
}

void printReceiptEffects(const String &effects) {
  int start = 0;
  while (start <= effects.length()) {
    const int divider = effects.indexOf('~', start);
    String effect = divider < 0 ? effects.substring(start) : effects.substring(start, divider);
    effect.trim();
    if (effect.length()) {
      printerSerial.print("- ");
      printerSerial.println(printerAscii(effect));
    }
    if (divider < 0) break;
    start = divider + 1;
  }
}

void printReceiptFooter(const String &footer) {
  String text = printerAscii(footer);
  int start = 0;
  while (start < text.length()) {
    int end = start + 32;
    if (end >= text.length()) {
      printerSerial.println(text.substring(start));
      break;
    }
    int space = text.lastIndexOf(' ', end);
    if (space <= start) space = end;
    printerSerial.println(text.substring(start, space));
    start = space + 1;
  }
}

void splitReceiptFields(const String &line, String fields[], int fieldCount) {
  int start = 6;
  for (int i = 0; i < fieldCount; i += 1) {
    const int divider = line.indexOf('|', start);
    if (divider < 0) {
      fields[i] = line.substring(start);
      start = line.length();
    } else {
      fields[i] = line.substring(start, divider);
      start = divider + 1;
    }
    fields[i].trim();
    if (!fields[i].length()) fields[i] = "-";
  }
}

void setState(const String &next) {
  currentState = next;

  if (currentState == "reset" || currentState == "boot") {
    eyeLRTarget = EYE_LR_CENTER;
    eyeUDTarget = EYE_UD_CENTER;
    headYawTarget = HEAD_YAW_CENTER;
    mouthTarget = MOUTH_CLOSED;
    return;
  }

  scheduleGazeShiftFromNow();
  scheduleHeadShiftFromNow();
}

void updateStateMachine() {
  if (currentState == "boot" && millis() - bootStartedAt > BOOT_SETTLE_MS) {
    setState("ready");
  }
}

void updateGazeTargets() {
  if (!shouldRoamEyes()) return;

  const unsigned long now = millis();
  if (now - lastGazeShiftAt < nextGazeShiftDelayMs) return;

  lastGazeShiftAt = now;
  nextGazeShiftDelayMs = pickGazeDelayForState();

  if (currentState == "processing") {
    eyeLRTarget = EYE_LR_CENTER;
    const float scanPhase = (float)(now % 1600UL) / 1600.0f;
    eyeUDTarget = EYE_UD_MIN + (int)round(scanPhase * (EYE_UD_MAX - EYE_UD_MIN));
  } else if (currentState == "speaking") {
    eyeLRTarget = randomInt(EYE_LR_CENTER - 12, EYE_LR_CENTER + 12);
    eyeUDTarget = randomInt(EYE_UD_CENTER - 3, EYE_UD_CENTER + 3);
  } else if (currentState == "waiting_for_reply") {
    eyeLRTarget = randomInt(EYE_LR_CENTER - 4, EYE_LR_CENTER + 4);
    eyeUDTarget = randomInt(EYE_UD_CENTER - 2, EYE_UD_CENTER + 2);
  } else {
    eyeLRTarget = randomInt(EYE_LR_CENTER - 14, EYE_LR_CENTER + 14);
    eyeUDTarget = randomInt(EYE_UD_CENTER - 4, EYE_UD_CENTER + 4);
  }
}

void updateHeadTargets() {
  if (!shouldRoamHead()) return;

  const unsigned long now = millis();
  if (now - lastHeadShiftAt < nextHeadShiftDelayMs) return;

  lastHeadShiftAt = now;
  nextHeadShiftDelayMs = pickHeadDelayForState();

  if (currentState == "idle" || currentState == "ready") {
    headYawTarget = randomInt(HEAD_YAW_CENTER - 15, HEAD_YAW_CENTER + 15);
  } else if (currentState == "listening") {
    headYawTarget = randomInt(HEAD_YAW_CENTER - 8, HEAD_YAW_CENTER + 8);
  } else if (currentState == "processing") {
    headYawTarget = HEAD_YAW_CENTER + (int)round(sinf(now / 820.0f) * 26.0f);
  } else if (currentState == "speaking") {
    headYawTarget = randomInt(HEAD_YAW_CENTER - 11, HEAD_YAW_CENTER + 11);
  } else if (currentState == "waiting_for_reply") {
    headYawTarget = randomInt(HEAD_YAW_CENTER - 3, HEAD_YAW_CENTER + 3);
  }
}

void updateStateTargets() {
  const unsigned long now = millis();

  if (currentState == "boot" || currentState == "reset") {
    eyeLRTarget = EYE_LR_CENTER;
    eyeUDTarget = EYE_UD_CENTER;
    headYawTarget = HEAD_YAW_CENTER;
    mouthTarget = MOUTH_CLOSED;
  } else if (currentState == "idle") {
    mouthTarget = MOUTH_CLOSED;
  } else if (currentState == "ready") {
    eyeLRTarget = EYE_LR_CENTER;
    eyeUDTarget = EYE_UD_CENTER;
    headYawTarget = HEAD_YAW_CENTER;
    mouthTarget = MOUTH_CLOSED;
  } else if (currentState == "listening") {
    eyeUDTarget = EYE_UD_CENTER - 2;
    mouthTarget = MOUTH_CLOSED;
  } else if (currentState == "processing") {
    mouthTarget = MOUTH_CLOSED;
  } else if (currentState == "speaking") {
    mouthTarget = speakingMouthTarget(now);
  } else if (currentState == "waiting_for_reply") {
    mouthTarget = MOUTH_CLOSED;
  } else if (currentState == "error") {
    eyeLRTarget = EYE_LR_CENTER;
    eyeUDTarget = EYE_UD_CENTER + 2;
    headYawTarget = HEAD_YAW_CENTER - 8;
    mouthTarget = MOUTH_MID;
  }

  eyeLRTarget = clampf(eyeLRTarget, EYE_LR_MIN, EYE_LR_MAX);
  eyeUDTarget = clampf(eyeUDTarget, EYE_UD_MIN, EYE_UD_MAX);
  headYawTarget = clampf(headYawTarget, HEAD_YAW_MIN, HEAD_YAW_MAX);
  mouthTarget = clampf(mouthTarget, MOUTH_CLOSED, MOUTH_OPEN);
}

void easeServos() {
  eyeLRValue += (eyeLRTarget - eyeLRValue) * SERVO_SMOOTHING;
  eyeUDValue += (eyeUDTarget - eyeUDValue) * SERVO_SMOOTHING;
  headYawValue += (headYawTarget - headYawValue) * SERVO_SMOOTHING;
  mouthValue += (mouthTarget - mouthValue) * MOUTH_SMOOTHING;
}

void writeServos() {
  servoEyeLR.write((int)round(eyeLRValue));
  servoEyeUD.write((int)round(eyeUDValue));
  servoHeadYaw.write((int)round(headYawValue));
  servoMouth.write((int)round(mouthValue));
}

void writeServosImmediate() {
  eyeLRValue = eyeLRTarget;
  eyeUDValue = eyeUDTarget;
  headYawValue = headYawTarget;
  mouthValue = mouthTarget;
  writeServos();
}

bool shouldRoamEyes() {
  return currentState == "idle" ||
         currentState == "ready" ||
         currentState == "processing" ||
         currentState == "speaking" ||
         currentState == "waiting_for_reply";
}

bool shouldRoamHead() {
  return currentState == "idle" ||
         currentState == "ready" ||
         currentState == "listening" ||
         currentState == "processing" ||
         currentState == "speaking" ||
         currentState == "waiting_for_reply";
}

unsigned long pickGazeDelayForState() {
  if (currentState == "idle" || currentState == "ready") return (unsigned long)randomInt(1700, 2800);
  if (currentState == "processing") return (unsigned long)randomInt(90, 140);
  if (currentState == "speaking") return (unsigned long)randomInt(550, 1050);
  if (currentState == "waiting_for_reply") return (unsigned long)randomInt(1800, 2800);
  return (unsigned long)randomInt(900, 1700);
}

unsigned long pickHeadDelayForState() {
  if (currentState == "idle" || currentState == "ready") return (unsigned long)randomInt(1400, 2400);
  if (currentState == "processing") return (unsigned long)randomInt(180, 260);
  if (currentState == "speaking") return (unsigned long)randomInt(700, 1300);
  return (unsigned long)randomInt(1100, 2200);
}

void scheduleGazeShiftFromNow() {
  lastGazeShiftAt = millis();
  nextGazeShiftDelayMs = pickGazeDelayForState();
}

void scheduleHeadShiftFromNow() {
  lastHeadShiftAt = millis();
  nextHeadShiftDelayMs = pickHeadDelayForState();
}

int speakingMouthTarget(unsigned long now) {
  if (now - lastManualMouthAt <= MANUAL_MOUTH_HOLD_MS) {
    return map(manualMouthPercent, 0, 100, MOUTH_CLOSED, MOUTH_OPEN);
  }

  const float phase = (float)(now % 760UL) / 760.0f;
  const float waveA = sinf(phase * TWO_PI * 2.0f);
  const float waveB = sinf(phase * TWO_PI * 3.0f + 0.8f);
  const float amount = (waveA * 0.55f + waveB * 0.25f + 1.0f) * 0.5f;
  return (int)round(MOUTH_CLOSED + amount * (MOUTH_OPEN - MOUTH_CLOSED));
}

long randomInt(long minValue, long maxValue) {
  if (maxValue <= minValue) return minValue;
  return random(minValue, maxValue + 1);
}

float clampf(float value, float minValue, float maxValue) {
  if (value < minValue) return minValue;
  if (value > maxValue) return maxValue;
  return value;
}
