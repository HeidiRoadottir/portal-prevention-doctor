# Doktor Portal: præventionskonsultation

En Portal/p5 prototype til robothovedet: tale til tekst, GPT structured response, tekst til tale og USB Serial til Arduino/ESP32. Den bygger på Mads Hobyes anbefalede setup fra mailen:

- Portal runtime: https://madshobye.github.io/Portal/
- Reference med chat + USB Serial: https://github.com/madshobye/Portal/tree/main/experiments/gptChatUsbSerial
- Reference Arduino-servo: https://github.com/madshobye/Portal/tree/main/ArduinoExamples/AnimatronicHeadSerial
- Speech2-modulet bruges til løbende talegenkendelse.

## Filer

- `index.html` loader p5, Portal og den lokale sketch.
- `sketch.js` er selve Doktor Portal samtalen.
- `style.css` er interfacet.
- `arduino/prevention_head_servo/prevention_head_servo.ino` er Arduino-koden til fire servoer.

## Hardware mapping

Mads' eksempel bruger fire servoer til:

1. eye left/right
2. eye up/down
3. eyelids up/down
4. mouth up/down

Jeres hoved har ikke øjenlåg, men har hoved side/side. Derfor er den lokale Arduino-kode mappet sådan:

1. øjne venstre/højre -> pin 3
2. øjne op/ned -> pin 5
3. hoved side/side -> pin 6
4. mund op/ned -> pin 9

Brug gerne et Arduino shield med pinouts som Mads anbefaler: https://learn.hobye.dk/kits/makerkit

## Serial-protokol

Browseren sender kun korte tilstande:

```text
STATE:idle
STATE:ready
STATE:listening
STATE:processing
STATE:speaking
STATE:waiting_for_reply
STATE:error
STATE:reset
```

Arduinoen styrer selv roaming, hovedbevægelser og mundbevægelse ud fra tilstanden. Det gør systemet mindre skrøbeligt end at sende alle servovinkler fra browseren.

Når konsultationen er færdig, sender browseren også en kvittering til Arduinoen:

```text
PRINT|metode|beskytter|anvendelse|ansvar|status
```

Arduinoen sender den videre til en serial/TTL thermal printer på D11. Printerens TX kan valgfrit forbindes til D10, hvis printeren understøtter svar tilbage.

## Test lokalt

1. Upload `arduino/prevention_head_servo/prevention_head_servo.ino` til Arduino/ESP32.
2. Start en lille webserver. På Windows kan du dobbeltklikke:

```text
portal-prevention-doctor/start-server.bat
```

Hvis du selv har Node.js installeret og `node` virker i terminalen, kan du også bruge:

```powershell
node portal-prevention-doctor\dev-server.js
```

Hvis du har Python installeret, kan du bruge:

```powershell
python -m http.server 8000
```

3. Åbn `http://localhost:8000/portal-prevention-doctor/` i Chrome eller Edge.

På Windows kan du også dobbeltklikke:

```text
portal-prevention-doctor/open-in-browser.bat
```

Brug en rigtig Chrome eller Edge til robot-test. Codex' in-app browser kan vise siden, men Web Serial og mikrofontilladelser er mere pålidelige i en normal browser.
4. Indsæt din egen OpenAI API key i feltet og tryk `Gem`.
5. Tryk `Forbind robot` og vælg Arduinoens serial-port.
6. Tryk `Start tale`, eller skriv i tekstfeltet.

API-keyen sendes til den lokale Node-server på `localhost` og gemmes kun i serverens hukommelse, så browseren ikke kalder OpenAI direkte. Hvis du genstarter serveren, skal du trykke `Gem` igen i appen.

Web Serial virker normalt kun på `localhost` eller HTTPS og i Chrome/Edge.

## Samtalepersona

Robotten er en konsulterende læge om prævention:

- professionel og klinisk forsigtig
- lidt flabet, men ikke nedladende
- fokuseret på ansvar, samtykke og ulighed
- giver generel information, ikke personlig diagnose eller recept
- henviser til rigtig læge, klinik, apotek eller seksualrådgivning ved personlige valg

Den bruger blandt andet disse sikre grundpointer:

- Kondom er den centrale metode, der også beskytter mod mange kønssygdomme.
- Nødprævention kan være relevant efter ubeskyttet sex eller præventionssvigt.
- Valg af prævention bør være frivilligt, informeret og praktisk muligt for personen.
- Ansvaret bør ikke automatisk placeres hos den person, der kan blive gravid.

Faglige referencepunkter til videre udvikling:

- CDC contraception overview: https://www.cdc.gov/contraception/about/index.html
- WHO contraception/family planning: https://www.who.int/health-topics/contraception

## Kalibrering

Start med servoerne afmonteret fra mekanikken. Tænd Arduinoen, lad servoerne gå til center, og monter derefter hornene forsigtigt.

Juster disse værdier i `.ino`-filen:

```cpp
const int EYE_LR_MIN = 60;
const int EYE_LR_CENTER = 90;
const int EYE_LR_MAX = 120;

const int EYE_UD_MIN = 72;
const int EYE_UD_CENTER = 92;
const int EYE_UD_MAX = 112;

const int HEAD_YAW_MIN = 45;
const int HEAD_YAW_CENTER = 75;
const int HEAD_YAW_MAX = 105;

const int MOUTH_CLOSED = 45;
const int MOUTH_OPEN = 94;
```

Tale-munden bruger en smallere range for ikke at klapre for voldsomt:

```cpp
const int MOUTH_SPEAK_CLOSED = 48;
const int MOUTH_SPEAK_OPEN = 72;
```

Hvis noget kører forkert vej, kan du enten bytte `MIN` og `MAX` logisk i bevægelsen eller ændre mekanisk montering.

## Hurtig fejlsøgning

- Ingen robot i browseren: brug Chrome/Edge og `localhost`, ikke bare dobbeltklik på HTML-filen.
- Robot bevæger sig ikke: tjek baud rate `115200`, portvalg og fælles GND mellem servo-strøm og board.
- Servoer ryster: brug ekstern 5-6V servoforsyning, ikke USB alene.
- Tale lytter ikke: giv mikrofontilladelse, og prøv at stoppe/starte tale igen.
- GPT svarer ikke: brug egen API key og tjek browserkonsollen.
