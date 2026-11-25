# Fremde Bestandteile und Datenquellen

## Mitgelieferte Software und Schriften
| Bestandteil | Lizenz | Lizenztext |
|---|---|---|
| Leaflet 1.9.4 | BSD-2-Clause | `mobile/vendor/LICENSE-leaflet.txt` |
| proj4js 2.11.0 | MIT | `mobile/vendor/LICENSE-proj4.txt` |
| Schrift Inter | SIL Open Font License 1.1 | `mobile/vendor/fonts/LICENSE-Inter-OFL.txt` |
| Schrift Space Grotesk | SIL Open Font License 1.1 | `mobile/vendor/fonts/LICENSE-SpaceGrotesk-OFL.txt` |

## Übernommenes Verfahren: SunCalc (Mondberechnung in `mobile/mobile.js`)
Die Berechnung von Mondposition, Beleuchtung sowie Mondauf- und -untergang folgt der Bibliothek
SunCalc (https://github.com/mourner/suncalc):

```
Copyright (c) 2014, Vladimir Agafonkin
All rights reserved.

Redistribution and use in source and binary forms, with or without modification, are
permitted provided that the following conditions are met:

   1. Redistributions of source code must retain the above copyright notice, this list of
      conditions and the following disclaimer.

   2. Redistributions in binary form must reproduce the above copyright notice, this list
      of conditions and the following disclaimer in the documentation and/or other materials
      provided with the distribution.

THIS SOFTWARE IS PROVIDED BY THE COPYRIGHT HOLDERS AND CONTRIBUTORS "AS IS" AND ANY
EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT LIMITED TO, THE IMPLIED WARRANTIES OF
MERCHANTABILITY AND FITNESS FOR A PARTICULAR PURPOSE ARE DISCLAIMED. IN NO EVENT SHALL THE
COPYRIGHT HOLDER OR CONTRIBUTORS BE LIABLE FOR ANY DIRECT, INDIRECT, INCIDENTAL, SPECIAL,
EXEMPLARY, OR CONSEQUENTIAL DAMAGES (INCLUDING, BUT NOT LIMITED TO, PROCUREMENT OF
SUBSTITUTE GOODS OR SERVICES; LOSS OF USE, DATA, OR PROFITS; OR BUSINESS INTERRUPTION)
HOWEVER CAUSED AND ON ANY THEORY OF LIABILITY, WHETHER IN CONTRACT, STRICT LIABILITY, OR
TORT (INCLUDING NEGLIGENCE OR OTHERWISE) ARISING IN ANY WAY OUT OF THE USE OF THIS
SOFTWARE, EVEN IF ADVISED OF THE POSSIBILITY OF SUCH DAMAGE.
```

## Datenquellen (zur Laufzeit direkt vom Gerät abgerufen, nicht im Code enthalten)
| Daten | Quelle | Lizenz / Hinweis |
|---|---|---|
| Messwerte, Radar, Warnungen, Blitze | Deutscher Wetterdienst, über Bright Sky (brightsky.dev) und maps.dwd.de | CC BY 4.0 – „Quelle: Deutscher Wetterdienst“, teils verändert |
| Vorhersagen, Modellraster | Open-Meteo.com (DWD ICON) | CC BY 4.0 – „Wetterdaten von Open-Meteo.com“; frei für nicht-kommerzielle Nutzung |
| Luftqualität, Pollen | Copernicus Atmosphere Monitoring Service, über Open-Meteo | „Enthält veränderte Copernicus-CAMS-Informationen“ |
| Satellitenbilder | EUMETSAT (view.eumetsat.int) | © EUMETSAT, verändert |
| Hintergrundkarte | OpenTopoMap / OpenStreetMap, SRTM | © OpenStreetMap-Mitwirkende (ODbL), Darstellung CC BY-SA |
| Ortssuche | Photon (komoot), OpenStreetMap-Daten | faire Nutzung, © OpenStreetMap-Mitwirkende |
| IP-Ortung (optional) | ipwho.is | kostenloser Tarif |

Das Design ist eigenständig; es wurden keine Grafiken, Logos oder Inhalte anderer Wetterdienste übernommen.
