# Computer som midlertidig Raspberry Pi

Denne guide er til testopsaetningen, hvor din computer koerer webappen, mikrofon, hoejtaler og OpenAI, mens Arduinoen styrer knap og servoer via USB.

## Overblik

Din computer erstatter Raspberry Pi'en indtil videre:

- Computer: Chrome/Edge, lokal Node-server, mikrofon, hoejtaler og OpenAI-kald
- Arduino: startknap, servoer og serial thermal printer
- USB mellem computer og Arduino: Web Serial-kommunikation
- Kvitteringsprinter: printer automatisk, naar konsultationen er faerdig

Den nuvaerende robot-firmware lytter efter `PRINT|...` fra webappen og sender kvitteringen videre til en serial thermal printer.

## Det skal du bruge

- Computer med Chrome eller Edge
- Node.js 18 eller nyere
- Arduino IDE
- Arduino eller ESP32-kompatibelt board
- USB-kabel mellem computer og Arduino
- 4 servoer
- Ekstern 5-6V servoforsyning til servoerne
- Faelles GND mellem servoforsyning og Arduino
- Startknap med C/NO-terminaler
- Mikrofon, gerne USB-mikrofon
- Hoejtaler eller computerens lydudgang
- OpenAI API key
- Serial/TTL thermal printer med egen stroemforsyning

## Hardware paa Arduino

Robotkoden bruger denne mapping:

```text
Startknap C/NO        -> Arduino pin 2 + GND
Oejne venstre/hoejre  -> Arduino pin 3
Oejne op/ned          -> Arduino pin 5
Hoved side/side       -> Arduino pin 6
Mund op/ned           -> Arduino pin 9
Thermal printer TX    -> Arduino pin 10 optional
Thermal printer RX    -> Arduino pin 11
Baud rate             -> 115200
Printer baud rate     -> 19200
```

Servo-stroem:

```text
Servo roed/+      -> ekstern 5-6V +
Servo brun/sort/- -> ekstern 5-6V -
Servo signal      -> Arduino pin 3, 5, 6 eller 9
Arduino GND       -> ekstern servo-GND
```

Vigtigt: Undgaa at drive servoerne fra Arduinoens 5V-pin eller computerens USB. Servoerne skal have egen stroemforsyning, men GND skal deles med Arduinoen.

## Startknap

Koden bruger `INPUT_PULLUP`, saa knappen skal bare lukke forbindelsen til GND:

```text
Knap C  -> Arduino GND
Knap NO -> Arduino pin 2
```

Naar knappen trykkes, sender Arduinoen:

```text
BUTTON:start
```

Den saetter ogsaa robottilstand til `listening` lokalt.

## Upload Arduino-koden

1. Aabn Arduino IDE.
2. Aabn:

```text
arduino/prevention_head_servo/prevention_head_servo.ino
```

3. Vaelg board og port.
4. Upload.
5. Luk Serial Monitor, hvis den er aaben. Browseren kan ikke bruge porten, hvis Arduino IDE holder den optaget.

Hvis du vil teste servoerne uden webappen, upload foerst:

```text
arduino/servo_hardware_test/servo_hardware_test.ino
```

Den tester servoerne paa D3, D5, D6 og D9.

## Start webappen paa computeren

Fra projektets overmappe:

```powershell
node portal-prevention-doctor\dev-server.js
```

Aabn derefter i Chrome eller Edge:

```text
http://localhost:8000/portal-prevention-doctor/
```

Brug ikke bare dobbeltklik paa `index.html`, fordi Web Serial og mikrofon er mest stabile via `localhost`.

## Forbind robotten i browseren

1. Gem din OpenAI API key i appen.
2. Tryk `Forbind robot`.
3. Vaelg Arduinoens USB-port.
4. Tillad serial-adgang.
5. Tryk `Test servoer`.
6. Tryk `Start tale`.
7. Tillad mikrofon-adgang.

Hvis Arduino-porten ikke dukker op, saa luk Arduino IDE og andre programmer, der kan holde porten.

## Mikrofon og hoejtaler

Paa computeren:

1. Saet mikrofonen til som standard-input i systemets lydindstillinger.
2. Saet hoejtaler som standard-output.
3. Aabn Chrome/Edge mikrofontilladelser for `localhost`.
4. Test med `Start tale`.

Hvis talen ikke kommer ud af den rigtige hoejtaler, er det normalt operativsystemets output-enhed, der skal skiftes.

## Kvitteringsprinter

Webappen sender automatisk en printkommando, naar konsultationen er faerdig:

```text
PRINT|metode|beskytter|anvendelse|ansvar|status
```

Arduinoen printer derefter kvitteringen paa en serial/TTL thermal printer.

### USB-printer til computeren

Printeren saettes i computeren med USB. Webappen/Node-serveren kan senere udvides til at sende print via computerens printerdriver eller en ESC/POS Node-pakke.

Dette er ofte nemmest, naar computeren agerer Raspberry Pi.

### Serial/Thermal printer til Arduino

Printeren forbindes til Arduinoens SoftwareSerial-pins og separat stroemforsyning:

```text
Printer RX      -> Arduino D11
Printer TX      -> Arduino D10 optional
Printer GND     -> Arduino GND
Printer power   -> egen stroemforsyning
Baud rate       -> 19200
```

Vigtigt: Thermal printere bruger meget stroem, isaer naar de printer. Brug ikke Arduinoens 5V som printer-stroem. Brug printerens egen stroemforsyning, og forbind printer-GND med Arduino-GND.

## Hvad der virker lige nu

- Webapp paa computeren
- OpenAI-svar
- Tale ud gennem computerens hoejtaler
- Mikrofon ind i browseren
- Web Serial fra browser til Arduino
- Servoer paa D3, D5, D6 og D9
- Startknap paa D2 + GND
- Automatisk kvitteringsprint efter afsluttet konsultation
- Manuel printtest med knappen `Print kvittering`

## Det der stadig skal tjekkes for printeren

For at goere printeren helt stabil skal vi stadig kende:

- Printermodel
- Hvilken stroemforsyning den bruger
- Om dens baud rate er 19200 eller en anden hastighed

Hvis printeren ikke reagerer, er baud rate det foerste sted at justere i `PRINTER_BAUD` i Arduino-koden.

## Hurtig testsekvens

1. Upload `servo_hardware_test.ino`.
2. Bekraeft at alle fire servoer bevaeger sig korrekt.
3. Upload `prevention_head_servo.ino`.
4. Tryk paa knappen og se om robotten gaar i lytte-tilstand.
5. Start `node portal-prevention-doctor\dev-server.js`.
6. Aabn `http://localhost:8000/portal-prevention-doctor/`.
7. Tryk `Forbind robot`.
8. Tryk `Test servoer`.
9. Gem OpenAI API key.
10. Test mikrofon og hoejtaler med `Start tale`.
11. Tryk `Print kvittering` og se om thermal printeren printer en testkvittering.
12. Gennemfoer en hel konsultation og tjek at kvitteringen printes automatisk til sidst.
