# AI Energy Manager 2.3.0 – Nordic Night

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


## Version 2.2.0: samordnet energi- og komfortplan

En ny **rådgivende koordinering** kombinerer elpriser, vejr/vind, eksisterende Forecast.Solar-PV-prognose, rumtemperatur, varmtvandsbehov, valgfri hjemme-/ude-status og valgfri batteristand. Den udvider tidslinjens råd, men udfører aldrig batteri-, ventilations- eller ekstra varmtvandskommandoer.

**Indstillinger / Auto Detect:** De nye felter er valgfrie:
- `presence_entity`: person/device_tracker eller binary_sensor/input_boolean, hvor **on betyder hjemme** og **off betyder ude**. Ukendt tilstedeværelse forbliver *ukendt*. En status nu er ikke en prognose for, hvornår nogen kommer hjem.
- `battery_soc_entity`: batteriets opladningsgrad i procent (0–100).
- `battery_power_entity`: valgfri batterieffekt i W/kW. Positivt/negativt fortegn fortolkes ikke som ind-/udladning uden verificering.
- `house_load_entity`: målt forbrug i huset i W/kW. Et eksempel kan være `sensor.husets_liveforbrug` hvis den findes.
- `assumed_base_load_w`: frivilligt estimat for grundlast (W). Bruges **kun** til illustrative fremtidige overskudsestimater, når husforbrug ikke kan måles. Standard nul betyder ukendt.
- `solar_overheat_margin`: temperaturmargin (°C), som sammen med høj prognosticeret PV og varm rumføler spærrer **ekstra** boost.

**Varmtvandsbehov:** Mulige store temperaturfald i toppen af varmtvandsbeholderen tælles pr. lokal time over de seneste syv dage. Temperaturfald kan også skyldes varmetab eller ændringer i tanken; det er ikke registreret vandforbrug. En lav tanktemperatur medfører anbefalingen **udsæt ikke alene for billig el**. Planlagt ekstravarmtvand er ikke aktiveret, før Rego/Husdata-styring er verificeret.

**PV og batteri:** Timevis solproduktion er en **prognose**, ikke sikker egenforbrugt energi. Ved lavt batteriniveau viser tidslinjen forsigtige forslag om opladning frem for fleksibelt boost. Batteriet styres ikke af denne integration. Der gættes ikke en batteristand, hvis sensoren mangler.

**Vejr og komfort:** Stærk vind og lave temperaturer giver varmetabsadvarsler. Når rumtemperaturen allerede er tæt på målet og der forventes høj PV-produktion, foreslås det at undgå unødvendig forvarmning; en ekstra sikkerhedsregel kan blokere boost. Den bygger ikke på måling af faktisk solindfald gennem vinduerne.

**Sikkerhed:** Kun eksisterende IVT-rumsetpunktstyring kan skrive til hardware, og kun efter bekræftelse af rumføler, aktiveret skriveadgang og deaktiveret testtilstand. Øvrig koordinering er rådgivende og ændrer ikke kompressorstyringen direkte. Start med `test_mode=true`.

**Begrænsninger:** Dette er ikke en gennemført optimering af fremtidig tilstedeværelse, batteriafladning eller termisk COP. Hverken batteriets BMS, PV-inverter, Nilan, EV-lader eller ekstra varmtvandsfunktion aktiveres af de nye råd.


## Version 2.2.1 – stabil live-visning uden blink

- Liveopdateringer bruger nu en inkrementel DOM-patch frem for at genopbygge hele dashboardet via `shadowRoot.innerHTML`.
- Kun ændrede tekst- og attributværdier justeres; eksisterende kort, grafer, animationer og vandret scroll bevarer deres DOM-elementer.
- Hændelseslyttere bindes kun én gang pr. element, herunder til dashboardeditoren.
- Sensoropdateringer begrænses i frontend til højst cirka én pr. 750 ms, og fokuserede valgfelter opdateres ikke midt i brugerens redigering.
- Ingen ændringer af varmepumpens fysiske styringslogik. Test både desktop, tablet og mobil efter opdatering og Ctrl+F5.

## Version 2.3.0 – animeret energiflow (P1, PV, hus og IVT)

Et indbygget **Live energiflow**-kort vises nu direkte i Nordic Night-dashboardet. Det kræver **ingen separat YAML, Mushroom-kort, HACS frontendkort eller hjælpesensorer**. Tilgængelige målinger hentes fra de allerede konfigurerede Home Assistant-entities.

Kortet viser:
- Aktuel Danfoss solproduktion og P1-nettoeffekt
- Reelt målt **netimport** og **neteksport**, aldrig begge på én gang
- Beregnet samlet forbrug i huset (inklusive IVT)
- IVT's elektriske forbrug og et **estimat** over fordelingen mellem solceller og elnet til IVT
- Separate animerede pile fra solceller til øvrigt hus, solceller til IVT, solceller til elnet, elnet til øvrigt hus og elnet til IVT

**Måleforudsætninger:** Husholdningens samlede effekt estimeres som `PV + nettoimport - nettoeksport`. Forventet PV/elnetsandel til IVT fordeles proportionalt efter samtidige effekter. Det er **ikke** en direkte fysisk måling af elektroner til IVT. Ved aktivt eller ukendt batteriflow, manglende sol-/IVT-data eller inkonsistent effektregnskab skjules den usikre fordeling, mens den **målte** import/eksport fortsat vises. Sensorer i både W og kW understøttes. Beregningsmodellen forudsætter, at PV og P1 dækker hele det relevante effektregnskab, samt at øvrige lokale energikilder/batterier ikke tilfører eller aftager effekt.

**P1-fortegn:** Under **AI Energy Manager → Konfigurer** findes indstillingen `export_positive` / “Positiv P1-effekt betyder eksport”. Standard er **fra**: positiv P1 = import, negativ P1 = eksport. Kontrollér målerens faktiske fortegn ved både import og eksport, før kortets retning anvendes.

Animerede pile vises fra **50 W**, så små udsving ikke giver flimren. Foretrukken reduceret animation (reduced motion) respekteres. Kortet bruger den eksisterende blinkfrie, inkrementelle opdatering fra version 2.2.1.

CI tester nu strømbevarelse, import/eksport, fortegn, W/kW, manglende sensorer og batterispærring med Node ud over Python-tests. **Ingen af flowkortets beregninger sender styringskommandoer** til varmepumpe, Nilan eller inverter.
