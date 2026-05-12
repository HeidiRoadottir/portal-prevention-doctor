# Raspberry Pi guide til Doktor Portal

Denne guide saetter projektet op paa en Raspberry Pi, saa Pi'en koerer webappen i Chrome/Chromium, kalder OpenAI via den lokale Node-server og taler med Arduinoen over USB Serial.

## Det skal du bruge

- Raspberry Pi 4 eller 5, helst med 4 GB RAM eller mere
- Raspberry Pi OS 64-bit med desktop
- MicroSD-kort paa mindst 16 GB, gerne 32 GB
- Stabil 5V USB-C stroemforsyning til Raspberry Pi
- Skaerm, HDMI-kabel, tastatur og mus til opsaetning
- Internetforbindelse paa Pi'en
- Arduino eller ESP32-kompatibelt board til robotten
- USB-kabel mellem Raspberry Pi og Arduino/ESP32
- 4 servoer:
  - oejne venstre/hoejre
  - oejne op/ned
  - hoved side/side
  - mund op/ned
- Ekstern 5-6V servoforsyning med nok ampere til servoerne
- Faelles GND mellem servoforsyning og Arduino/ESP32
- Startknap, hvis den skal bruges fysisk, monteret mellem pin 2 og GND
- OpenAI API key

Vigtigt: Servoer skal normalt ikke drives fra Raspberry Pi'ens eller Arduinoens USB-stroem. Brug en separat 5-6V forsyning til servoerne, og forbind GND fra servoforsyningen til GND paa Arduinoen.

## Overblik

Systemet bestaar af tre dele:

1. Raspberry Pi koerer `dev-server.js` og viser webappen i Chromium.
2. Webappen bruger mikrofon, talegenkendelse, OpenAI-svar og tekst-til-tale.
3. Arduinoen modtager korte `STATE:`-beskeder fra browseren via USB Serial og styrer servoerne.

Den nemmeste og mest stabile opsaetning er at lade browseren koere direkte paa Raspberry Pi'en. Saa virker Web Serial via `localhost`, og Arduinoen kan vaelges direkte i Chromium.

## 1. Installer Raspberry Pi OS

1. Installer Raspberry Pi Imager paa din computer.
2. Vaelg `Raspberry Pi OS 64-bit` med desktop.
3. Skriv imaget til microSD-kortet.
4. Start Pi'en og gennemfoer den foerste opsaetning.
5. Opdater systemet:

```bash
sudo apt update
sudo apt full-upgrade -y
sudo reboot
```

## 2. Installer noedvendige programmer

Efter genstart, aabn Terminal paa Pi'en og koer:

```bash
sudo apt update
sudo apt install -y git curl chromium-browser
```

Installer Node.js 20:

```bash
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs
node --version
npm --version
```

Projektets server bruger Node's indbyggede `fetch`, saa brug Node 18 eller nyere. Node 20 er et godt valg.

## 3. Hent projektet til Pi'en

Hvis projektet ligger i GitHub:

```bash
cd ~
git clone DIN_REPO_URL portal-prevention-doctor
cd portal-prevention-doctor
```

Hvis du kopierer projektmappen manuelt, skal mappen paa Pi'en ende med at indeholde disse filer:

```text
index.html
sketch.js
style.css
dev-server.js
arduino/prevention_head_servo/prevention_head_servo.ino
```

Hvis du kopierer hele repo-mappen, ligger appen muligvis i en undermappe:

```bash
cd ~/portal-prevention-doctor
```

## 4. Upload Arduino-koden

Du kan enten uploade Arduino-koden fra din almindelige computer, eller installere Arduino IDE/CLI paa Pi'en.

Den kode, der skal bruges til robotten, er:

```text
arduino/prevention_head_servo/prevention_head_servo.ino
```

Hardware mapping i robotkoden:

```text
Startknap C/NO    -> pin 2 + GND
Oejne venstre/hoejre -> pin 3
Oejne op/ned         -> pin 5
Hoved side/side      -> pin 6
Mund op/ned          -> pin 9
Baud rate            -> 115200
```

Hvis du bruger hardware-testen foerst:

```text
arduino/servo_hardware_test/servo_hardware_test.ino
```

Tjek mund-pinnen i testsketchen, foer du uploader. Produktionskoden bruger pin 9 til munden.

## 5. Forbind hardware

1. Upload Arduino-koden.
2. Sluk stroemmen.
3. Forbind servo-signalkabler:
   - eye left/right til D3
   - eye up/down til D5
   - head yaw til D6
   - mouth til D9
4. Forbind servoernes plus og minus til den eksterne 5-6V servoforsyning.
5. Forbind GND fra servoforsyning til GND paa Arduinoen.
6. Forbind Arduinoen til Raspberry Pi'en med USB.
7. Taend servoforsyning og Pi.

Kalibreringstip: Start med servoarme afmonteret fra mekanikken. Lad Arduinoen centrere servoerne, og monter derefter armene forsigtigt.

## 6. Start webserveren manuelt

Fra projektmappen:

```bash
node dev-server.js
```

Serveren skriver typisk:

```text
Doktor Portal server: http://localhost:8000/portal-prevention-doctor/
```

Hvis projektet paa Pi'en ligger som selve appmappen og ikke i en overmappe, kan URL'en i praksis stadig testes paa:

```text
http://localhost:8000/portal-prevention-doctor/
```

Aabn Chromium paa Pi'en og gaa til URL'en.

## 7. Brug appen

1. Aabn siden i Chromium.
2. Indsaet din OpenAI API key i feltet.
3. Tryk `Gem`.
4. Tryk `Forbind robot`.
5. Vaelg Arduinoens serial-port.
6. Giv browseren adgang til serial-porten.
7. Giv browseren adgang til mikrofonen.
8. Tryk `Start tale`, eller skriv i tekstfeltet.

Web Serial virker bedst i Chrome/Chromium/Edge og paa `localhost`. Brug derfor browseren direkte paa Pi'en.

## 8. Start serveren automatisk ved boot

Opret en systemd-service:

```bash
sudo nano /etc/systemd/system/portal-doctor.service
```

Indsaet dette, men ret `WorkingDirectory` og `ExecStart`, hvis din mappe hedder noget andet:

```ini
[Unit]
Description=Doktor Portal local server
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
WorkingDirectory=/home/pi/portal-prevention-doctor
ExecStart=/usr/bin/node /home/pi/portal-prevention-doctor/dev-server.js
Restart=always
RestartSec=3
Environment=PORT=8000

[Install]
WantedBy=multi-user.target
```

Aktiver den:

```bash
sudo systemctl daemon-reload
sudo systemctl enable portal-doctor.service
sudo systemctl start portal-doctor.service
sudo systemctl status portal-doctor.service
```

Se logs:

```bash
journalctl -u portal-doctor.service -f
```

## 9. Start Chromium automatisk i kiosk-mode

Lav autostart-mappe:

```bash
mkdir -p ~/.config/autostart
nano ~/.config/autostart/portal-doctor.desktop
```

Indsaet:

```ini
[Desktop Entry]
Type=Application
Name=Doktor Portal
Exec=chromium-browser --kiosk --noerrdialogs --disable-infobars http://localhost:8000/portal-prevention-doctor/
X-GNOME-Autostart-enabled=true
```

Genstart Pi'en:

```bash
sudo reboot
```

Hvis kiosk-mode er irriterende under test, saa fjern `--kiosk` midlertidigt.

## 10. OpenAI API key

Standardopsaetningen gemmer API-keyen i serverens hukommelse, naar du trykker `Gem` i appen. Hvis serveren genstarter, skal keyen indtastes igen.

Til en installation kan du i stedet saette keyen som miljoevariabel i systemd-servicen:

```ini
Environment=PORTAL_OPENAI_API_KEY=sk-...
Environment=PORTAL_OPENAI_MODEL=gpt-4.1-mini
```

Efter aendring:

```bash
sudo systemctl daemon-reload
sudo systemctl restart portal-doctor.service
```

Undgaa at dele servicefilen offentligt, hvis den indeholder en API-key.

## 11. Fejlsoegning

### Siden aabner ikke

Tjek at serveren koerer:

```bash
systemctl status portal-doctor.service
journalctl -u portal-doctor.service -n 50
```

Eller start manuelt:

```bash
node dev-server.js
```

### Chromium kan ikke finde robotten

Tjek at Arduinoen ses af Pi'en:

```bash
ls /dev/ttyACM* /dev/ttyUSB* 2>/dev/null
```

Hvis porten findes, men Chromium ikke maa bruge den, tilfoej brugeren til `dialout`:

```bash
sudo usermod -a -G dialout $USER
sudo reboot
```

### Robotten bevaeger sig ikke

- Tjek at Arduino-koden er uploadet.
- Tjek baud rate `115200`.
- Tjek at du valgte den rigtige serial-port i Chromium.
- Tjek faelles GND mellem Arduino og servoforsyning.
- Tjek at servoforsyningen faktisk leverer nok stroem.

### Servoer ryster eller nulstiller

- Brug ekstern 5-6V servoforsyning.
- Brug tykkere ledninger til servoernes stroem.
- Undgaa at drive flere servoer fra Arduinoens 5V-pin.
- Tjek at mekanikken ikke binder.

### Mikrofon virker ikke

- Giv Chromium mikrofontilladelse.
- Tjek Raspberry Pi's lydindstillinger.
- Proev en USB-mikrofon, hvis skaermens/analog lyd ikke virker stabilt.

### GPT eller tale virker ikke

- Tjek internet paa Pi'en.
- Tjek at API-keyen er gemt.
- Tjek logs fra serveren.
- Tjek at OpenAI-kontoen har adgang og kredit.

## 12. Praktisk testsekvens

1. Test Arduino og servoer uden webappen.
2. Start `node dev-server.js`.
3. Aabn webappen i Chromium paa Pi'en.
4. Gem API-key.
5. Forbind robot via serial.
6. Send en kort tekstbesked i appen.
7. Test mikrofon.
8. Test fysisk startknap.
9. Sluk og taend hele installationen.
10. Bekraeft at server og Chromium starter automatisk.

Naar alle 10 trin virker, er Raspberry Pi-installationen klar til brug.
