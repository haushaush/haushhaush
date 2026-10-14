# Laufzeiten korrigieren und Projekte neu aufsetzen

## Ergebnis
- „Verlängern“ bleibt jederzeit anklickbar. Unter 30 Tagen oder nach Ablauf wird es nur stärker hervorgehoben.
- Projekte erhalten einen Archivzeitpunkt. Bestehende Verknüpfungen, Zeiten und KPI-Einträge bleiben erhalten.
- Alle Projektansichten und ihre Zähler zeigen standardmäßig nur nicht archivierte Projekte. „Archiv anzeigen“ blendet archivierte Projekte ein; Admins können einzelne wiederherstellen.
- Auf der Projektseite erhalten Admins „Projekte neu aufsetzen“. Die Vorschau liest die aktuellen Close-Kunden und ihre Leistungen, zeigt tatsächliche Zahlen, Projekte je Kunde sowie Kunden ohne Leistungen. Sie verändert nichts.
- Erst „Jetzt ausführen“ archiviert Altprojekte und erzeugt die neuen Projekte in einer Transaktion. Anschließend erscheint der tatsächliche Ergebnisbericht.

## Festlegungen
- Laufzeiten und Projektvorschau nutzen dieselbe Kundenquelle und dieselben beiden festen Close-Status-IDs.
- Ein Projekt pro Kunde und eindeutiger Leistung, einschließlich Upsell-Leistungen. Bereits vorhandene passende aktive Projekte bleiben bestehen; alle übrigen Altprojekte werden archiviert. So erzeugt ein zweiter Durchlauf keine Dubletten.
- Board-Status der neuen Projekte: **Laufzeitbetreuung** (vorhandenes Feld `projektstatus`). Projektarten werden nur bei eindeutig passender bestehender Bezeichnung übernommen, sonst leer gelassen.
- Fehlt eine sichere Kundenverknüpfung, wird die Ausführung gesperrt und der betroffene Kunde in der Vorschau genannt, statt neue Kunden zu erfinden.
- Ich führe die Neuaufsetzung nicht aus. Dennis entscheidet nach der Vorschau.

## Technische Umsetzung
- Gemeinsamer Close-Kundenhelfer und gemeinsamer Ladeweg für die Laufzeitenliste; serverseitiger Close-Schlüssel und Adminprüfung.
- Vorschau mit signiertem, kurzzeitig gültigem Plan; Bestätigung prüft auf zwischenzeitliche Projektänderungen.
- Archivspalte, Close-Lead-Verknüpfung und administrativ abgesicherte Transaktionsfunktion. Sperre gegen parallele Durchläufe, keine Löschungen oder Änderungen bestehender Fremdschlüssel.
- Gemeinsamer Standardfilter für Projektabfragen; Archivprojekte werden erkennbar markiert und nicht per Drag-and-drop verändert.
- Tests für Leistungszusammenführung, Wiederholung und schreibfreie Vorschau; Browserprüfung auf Desktop und Handy ohne Ausführung der Neuaufsetzung.