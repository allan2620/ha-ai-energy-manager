# AI Energy Manager 2.1.3 – Nordic Night

**En eksperimentel Home Assistant Custom Integration med lokal regelbaseret energiplanlægning.** Den bruger ikke en trænet AI-model eller en ekstern AI-tjeneste. Den er ikke prøvekørt på dit Home Assistant- og Husdata-anlæg.

## Tilsluttede anlæg
- IVT Greenline C11 / Rego 637 via Husdata: kompressor, fremløb, returløb, rumsetpunkt, varmtvand og alarm.
- Nilan ventilation: klima, fugt, varmegenvinding og temperaturer. Automatisk ændring af ventilatorhastigheden er **ikke** implementeret.
- Danfoss TLX-solceller, P1-elmåler og Energi Data Service (DK1/N1).
- `weather.forecast_hjem` med officiel `weather.get_forecasts`-timeservice, hvis tilgængelig.

## Installation via HACS
1. Tilføj `https://github.com/allan2620/ha-ai-energy-manager` som et **Custom repository** med typen *Integration*, hvis det ikke allerede er installeret.
2. Opdater/geninstaller AI Energy Manager, og genstart Home Assistant.
3. Gå til **Indstillinger → Enheder og tjenester → AI Energy Manager → Konfigurer**. Kontrollér entity-ID'erne.
4. Åbn **AI Energy** i sidepanelet. Brug Ctrl+F5 hvis dashboardet er cachet.
5. **Hold testtilstand slået til**, indtil samtlige sensorer og sikkerhedsgrænser er afprøvet.

Dashboardet og editoren kræver ikke manuel YAML-installation. Layoutet gemmes i Home Assistants `.storage`; redigér det gennem dashboardets **Rediger dashboard**-knap.

## Funktioner i 2.0
- 48-timers rådgivende tidsplan med timebaserede elpriser og vejrdata. Manglende timer vises som ukendte.
- Forsigtig mulighed for prisbaseret forvarmning **før** kendte dyrere timer, kun under gældende sikkerhedsgrænser og skriveopt-in.
- Beskyttelse mod gentagne setpunktændringer omkring kompressorskift; maksimal boostvarighed og pause efter længere boost.
- Overvågning af IVT-alarm, kompressor, Nilan-køling og manglende sensorer. Fejl blokerer nye boosts.
- Notifikationer ved en bekræftet IVT-alarm eller nye sensorfejl efter tidligere normal drift.
- Manuel ændring af IVT-rumsetpunkt medfører automatisk pause; særskilt knap **Ophæv manuel varmepause**.
- Energiprofiler via `select.ai_energy_manager_energiprofil`: Normal, Komfort, Økonomi og Ferie.
- Nordisk mørkt sidepanel med informationskort, simuleret drift, 48-timers plan, sensorhistorik, beslutningslog og redigerbart layout.
- Indledende læring af husets afkølingsrate, når der findes en bekræftet rumføler og kompressoren står stille.
- Rådgivende varmtvandsprioritering. Faktiske Rego 637-ekstravarmtvandskommandoer er **slået fra i denne version** indtil kommandoens betydning og hygiejnebeskyttelsen er verificeret.
- COP-sensoren forbliver ukendt, medmindre en særskilt sensor for **målt afgivet varmeeffekt** angives i `heat_output`. Elforbruget alene er ikke nok til at beregne COP.
- Illustrativt 24-timers prisbudget ved **uændret importeffekt**. Det er ikke en forbrugsprognose eller verificeret besparelse.

## Sikkerhedsindstillinger
Standardværdierne er:
```
test_mode: true
room_verified: false
write_heat: false
write_water: false
energy_mode: normal
normal: 20.0
maximum: 22.0
boost: 0.5
min_boost_minutes: 30
max_boost_minutes: 120
```

Vælg først den korrekte rumføler: Nilan T3 og T15 har tidligere vist markant forskellige temperaturer. Kontrollér også fortegnet på P1-nettoeffekten. Integrationens automatiske ændringer retter kun IVT-rumsetpunktet og kræver **alle tre**: `room_verified=true`, `write_heat=true`, `test_mode=false`. Integrationens egne sikkerheder er ikke en erstatning for anlæggenes fabriksbeskyttelser.

Ved Home Assistant- eller Husdata-nedbrud kan et tidligere boost kræve manuel kontrol og gendannelse af rumsetpunktet. Kontrollér dette, før automatisk skriveadgang aktiveres. Slå andre automations fra, hvis de regulerer det samme rumsetpunkt.

## Sådan læses planen
Tidslinjen viser, hvilke timer der har kendt pris og vejr, og hvornår den regelbaserede model **ville anbefale** forvarmning. Planen udfører ikke kommandoer selv. Den indeholder ikke en troværdig solproduktionsprognose uden ekstra solprognosedata, og modellen kan ikke garantere en bestemt besparelse.

Den grønne/blå graf i popup er historiske Recorder-data fra Home Assistant; temperaturkurven i dashboardets øvrige oversigt er en illustration.

## Test og udvikling
GitHub Actions kører `compileall`, `node --check` og unit tests af planlæggeren samt de sikre standardindstillinger. Det er ikke en erstatning for en reel Home Assistant-integrationstest.

Repo: https://github.com/allan2620/ha-ai-energy-manager

## PV-prognose – Forecast.Solar (v2.1.0)

Home Assistants indbyggede **Forecast.Solar** er nu understøttet. Den skal installeres og konfigureres **separat** under Indstillinger → Enheder og tjenester → Tilføj integration → Forecast.Solar. Indtast dit anlægs faktiske kWp, panelernes retning og hældning; undgå at gætte.

- Med **én** Forecast.Solar-konfiguration finder AI Energy Manager den automatisk.
- Med **flere** Forecast.Solar-konfigurationer vælger du konfigurations-entry-ID under AI Energy Manager → Konfigurer i feltet `pv_forecast_entry`. Prognosen hentes da kun fra den valgte konfiguration; vælg den samlede anlægsopsætning, hvis det er den, du ønsker.
- Integrationens prognose hentes via `forecast_solar.get_forecast` med `resolution: hourly`; HA kræver support for den handling (2026.9 eller nyere).
- 48-timersplanen viser forventede PV-kWh for hver time, tilbageværende energi i dag, forventet energi i morgen og datadækning. Manglende timer forbliver ukendte, ikke nul.
- Timer med rigelig forventet produktion kan få anbefalingen **solforvarmning (forslag)**. PV-prognosen er produceret energi, **ikke** garanteret overskudsstrøm efter husets forbrug.
- PV-prognosen er **kun rådgivende**. Den ændrer ikke sikkerhedsgrænser eller sender nye fysiske kommandoer til IVT, Nilan eller varmtvand.
- De nye sensorer hedder blandt andet *AI Energy Manager PV rest i dag*, *PV i morgen*, *PV forventet top*, *PV prognose timer* og *PV prognose status*.
- Hvis Forecast.Solar mangler, fortsætter integrationen med elpris-/vejrplan og viser PV-status som manglende.

Reference: https://www.home-assistant.io/actions/forecast_solar.get_forecast/


## Version 2.1.1 – stabil betjening
Live-opdateringer bevarer nu den vandrette 48-timers plans scrollposition og tager hensyn til brugeren, når en dropdown er aktiv. Vælg en energiprofil uden at menuen lukker på grund af sensoropdateringer. Valget bliver holdt synligt, indtil Home Assistant bekræfter den nye tilstand. Test efter HACS-opdatering og genstart.


## Version 2.1.2 – søgbare entities og Auto Detect

Opsætning og Konfigurer anvender nu Home Assistants indbyggede søgbare entity-vælger til alle sensor- og climate-entityfelter, herunder valgfri `heat_output`. Forecast.Solar-konfigurationen anvender en særskilt konfigurationsvælger.

- **Ny installation:** Installationsformularen foreslår entydigt identificerede entities automatisk.
- **Eksisterende installation:** Vælg **Konfigurer → Rediger indstillinger** eller **Konfigurer → Automatisk registrering**. Sidstnævnte foreslår nyt entity-ID, hvis det gemte ikke længere findes, og viser alle forslag, inden du selv gemmer.
- Scanner alene Home Assistants lokale liste over registrerede entities, uden netværkssøgning og uden automatiske styringskommandoer.
- Ved tvetydige træffere vælges ingen vilkårlig sensor. Kontrollér især Nilan T15/T3, Husdata, elmålerens fortegn og om `room_verified` skal være aktiveret. Automatisk styring slås aldrig til af en scanning.
- Der findes ikke automatisk COP-beregning uden en særskilt korrekt termisk effektmåling.

## Version 2.1.3 – gennemgang og fejlrettelser

Gennemgået og rettet efter den tomme opsætningsmenu:

- Manglende `strings.json` og danske/engelske oversættelser til **Konfigurer**, **Rediger indstillinger** og **Auto Detect** samt samtlige formularfelter.
- Auto Detect afviser ukendte måleenheder, enheder med forkert type og tvetydige sensorforslag.
- Manuel eller automatisk ændring af en kritisk sensorbinding (bl.a. rumføler, IVT eller P1) **sætter testtilstand til** og slår hardware-skriveadgang fra, indtil brugeren aktivt har bekræftet og sat den til igen.
- Måleværdier kontrolleres for rigtige enheder og plausible intervaller før beslutninger: °C, W/kW og DKK/kWh; negative elpriser håndteres korrekt.
- Ved ukendt IVT-alarm/kompressorstatus sendes der ingen rumsetpunktkommandoer.
- Valgfri COP- eller Forecast.Solar-sensor kan nu ryddes korrekt i indstillingerne.
- Simulering kan ikke udløse ændring af energiprofil eller ophæve manuel varmepause.
- IVT-effekt i dashboardet håndterer både W og kW.
- Browsereditoren bevarer sine felter, når input mister fokus.
- Frontendens statiske HTTP-filer registreres kun én gang, så en ændring i opsætningen ikke prøver at registrere samme URL igen.
- PV-prognosen for *resten af dagen* fratrækker den del af den aktuelle time, som allerede er gået.
- Testene omfatter nu også måleenheder, migration, oversættelser, manuel sensorudskiftning og PV-timesummer.

**Begrænsning:** GitHub Actions validerer syntaks og de tests, der er skrevet til dette projekt. Integrationens reelle drift mod din specifikke Home Assistant, Husdata og Nilan er ikke testet her. Hold `test_mode=true`, indtil sensorstatus, P1-fortegn og IVT-setpunkter er verificeret på anlægget. Reboot efter HACS-opdatering, og opdater siden med Ctrl+F5.
