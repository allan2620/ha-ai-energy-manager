# AI Energy Manager – Nordic Night

**Status: Eksperimentel prototype (v1.3.0). Ikke testet på en faktisk Home Assistant-installation.**

En lokal Home Assistant Custom Integration til at overvåge og koordinere IVT Greenline C11 / Rego 637 (Husdata), Nilan, Danfoss-solceller, P1-måler, Energi Data Service og vejrdata. Beslutningsmotoren er **regelbaseret** med simpel observation af afkølingsrate – **ikke en trænet AI-model**.

## Installation

1. Kopiér `custom_components/ai_energy_manager` til `/config/custom_components/ai_energy_manager`.
2. Genstart Home Assistant.
3. Gå til **Indstillinger → Enheder og tjenester → Tilføj integration → AI Energy Manager**.
4. Vælg og kontrollér alle entity-ID'er, især P1-målerens fortegn og hvilken temperaturføler der må repræsentere boligen.
5. Start **uden** skriveadgang. Kontrollér status- og beslutningssensorerne.
6. Efter manuel afprøvning af Husdata-kommandoerne kan du aktivere separate skriveindstillinger til rumvarme og varmtvand.

## Automatisk sidepanel

Når integrationen er konfigureret, registrerer den automatisk sidepanelet **AI Energy** på adressen `/ai-energy`. Panelet er nu **én samlet Nordic Night-side** med sol/elmåler/IVT/Nilan/elpris/vejr/varmtvand/beslutningslog, samt en grafisk illustration af energiflowet. Knappen **Simulér drift** skifter til tydeligt markerede eksempeldata. Den ændrer kun visningen i din browser, sender ingen kommandoer og ændrer ikke integrationens faktiske drift. Genindlæs siden for at vende tilbage til livevisning. Diagrammets pile viser forbindelser, ikke præcist målt fordeling til de enkelte apparater. Du behøver ikke manuelt at oprette et Lovelace-dashboard. Genstart Home Assistant efter opdateringen.

## Valgfrit Lovelace-dashboard og tema

Kopiér `nordic_night_ai.yaml` til `/config/themes/`. Tilføj eller flet `frontend: themes: !include_dir_merge_named themes` i `configuration.yaml`, og genindlæs temaer. Opret et dashboard via **Indstillinger → Dashboards** og indsæt indholdet fra `dashboard.yaml` i rå editor. Vis dashboardet i sidepanelet.

Dashboardet oprettes **ikke automatisk**, og entity-ID'erne i dashboardet kan kræve tilpasning.

## Sikkerhed / begrænsninger

- Ingen skrivning er aktiveret som standard.
- Nilan **overvåges**; integrationen styrer ikke Nilan-ventilatorens hastighed.
- Verificér særligt at `climate.hp_extra_warm_water` accepterer kommandoen `60` som **60 minutter**, og ikke en temperatur, før varmtvandsstyring aktiveres.
- Eksisterende automations, der ændrer samme IVT-setpunkt, bør deaktiveres.
- Et rumsetpunkt kan blive stående på boostniveau ved Home Assistant-nedbrud, mislykket gendannelse eller afinstallation. Kontrollér og gendan selv normalværdien.
- Manuel ændring af et ejet rumsetpunkt udløser en intern pause. Denne prototype har endnu ikke en god grafisk nulstillingsfunktion.
- Varmtvandshygiejne, fabriksbeskyttelser og sikkerhedsindstillinger må ikke ændres.
- Vejrprognose fra dagsensoren er grov, ikke en reel 48-timers timeprognose.
- Ingen kalibreret COP-model eller dokumenteret besparelsesberegning.

Tilføj først en funktion, der ændrer hardware, efter verificering på anlægget. Brug på eget ansvar.


## En-sides dashboard v1.3.0
Nordic Night-dashboardet indeholder et samlet overblik over IVT, Nilan, solproduktion, elpris, vejr, varmtvand og beslutningslog. Knappen **Simulér drift** viser fiktive eksempeldata uden at skrive til nogen Home Assistant-enheder. Husk at bekræfte sensorernes entity-ID'er og fortegnet for P1-måleren. Temperaturgrafen er en illustration, ikke historisk måling. Nilan bliver overvåget; ventilationshastigheden reguleres ikke automatisk.


## Klikbare detaljer – v1.4.0
Klik på statusfelterne, energiflowets enheder eller de større kort for at åbne en lokal detaljevisning med alle relevante sensorværdier. Brug knappen **Vis graf og data** ved en sensor for at åbne Home Assistants indbyggede historik og attributter.

- Solproduktion: Danfoss-strenge og dagens produktion
- Elnet: P1-effekt, faseværdier, import og eksport
- IVT: kompressor, varme, fremløb, retur og alarm
- Varmtvand: temperaturer, stoptemperatur og ekstra varmtvand
- Nilan: T3, T7, T15, ventilation og varmegenvinding
- Elpriser, vejr og AI-beslutningslog

Når **Simulér drift** er valgt, er oversigten simuleret, men detaljevinduets sensordata er stadig de rigtige Home Assistant-data. Der sendes ingen styringskommandoer fra klikfunktionerne.
