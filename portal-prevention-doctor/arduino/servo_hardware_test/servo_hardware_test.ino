/*
  Servo Hardware Test

  Upload this sketch to test the four servos without Portal, printer,
  button, speech, or serial commands.

  Pins:
    D3 = eye left/right
    D5 = eye up/down
    D6 = head side/side
    D9 = mouth
*/

#include <Servo.h>

const uint8_t EYE_LR_PIN = 3;
const uint8_t EYE_UD_PIN = 5;
const uint8_t HEAD_PIN = 6;
const uint8_t MOUTH_PIN = 9;

Servo eyeLR;
Servo eyeUD;
Servo head;
Servo mouth;

void setup() {
  Serial.begin(115200);

  eyeLR.attach(EYE_LR_PIN);
  eyeUD.attach(EYE_UD_PIN);
  head.attach(HEAD_PIN);
  mouth.attach(MOUTH_PIN);

  centerAll();
  Serial.println("Servo hardware test ready");
}

void loop() {
  Serial.println("Center");
  centerAll();
  delay(1200);

  Serial.println("Eye LR");
  sweepServo(eyeLR, 60, 120);

  Serial.println("Eye UD");
  sweepServo(eyeUD, 86, 98);

  Serial.println("Head");
  sweepServo(head, 50, 105);

  Serial.println("Mouth");
  testMouth();
}

void centerAll() {
  eyeLR.write(90);
  eyeUD.write(92);
  head.write(75);
  mouth.write(45);
}

void sweepServo(Servo &servo, int lowAngle, int highAngle) {
  servo.write(lowAngle);
  delay(700);
  servo.write(highAngle);
  delay(700);
  servo.write((lowAngle + highAngle) / 2);
  delay(700);
}

void testMouth() {
  mouth.write(45);
  delay(1000);
  mouth.write(55);
  delay(1000);
  mouth.write(65);
  delay(1000);
  mouth.write(45);
  delay(1000);
}
