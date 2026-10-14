# Ehrlicher Stand im Bonus-Cockpit

- Kacheln zeigen zuerst die erfasste Leistung, darunter Punkte und die nächste erreichbare Stufe aus der bestehenden Staffel.
- Calls zeigen Anzahl, Gewichtung, erreichte Kunden und die tatsächlich fehlende gewichtete Leistung bis zur nächsten Stufe.
- Laufende Monate erhalten Tagesstand, anteiligen Soll-Stand und gekennzeichnete Prognosen; Punkte bleiben vorläufig.
- Die Monatsbasis wird mit aktuellen Kundenzahlen erklärt, ohne die Zielzahl zu ändern.
- Kachel-Klicks führen zur passenden Liste auf derselben Seite; Call-Gewichte bleiben aus der bestehenden Berechnung übernommen.
- Prüfung mit echten Daten auf großem und kleinem Bildschirm sowie Tests der Anzeige-Berechnungen.

## Fachliche Annahmen
Zeitplan und Prognose verwenden Kalendertage. Fehlende Calls werden als benötigte Calls mit vollem Gewicht ausgewiesen; Wiederholungen können mehr Calls erfordern. Bei Anti-Churn ist ein linear steigendes Verlust-Soll fachlich nicht sinnvoll: stattdessen wird der anteilige Grenzwert erläutert. Ein Unterschied zwischen Monatsbasis und heutigen aktiven Kunden wird nur mit belegten Abgängen als „im Monat abgegangen“ bezeichnet.

## Technik
Rechenfunktion, Staffel, Freigaben und gespeicherte Ergebnisse bleiben unverändert. Neue Anzeige-Helfer lesen die bestehende Mitarbeiterkonfiguration und berechnete Werte mit normalen Sitzungsrechten.