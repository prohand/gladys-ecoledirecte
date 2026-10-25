# EcoleDirecte

Diese Integration verbindet Gladys mit **EcoleDirecte**, der Online-Schulplattform
vieler französischer weiterführender Schulen. Für jedes Kind, dem das Konto
folgt, liest sie Noten und Durchschnitte, Hausaufgaben, den Stundenplan,
Fehlzeiten und Verspätungen sowie das Postfach.

Sie arbeitet über das Internet (Badge **Cloud**): In deinem Netzwerk muss nichts
installiert werden. Sie benötigt **Gladys 5.3.0 oder neuer**.

## Konfiguration

1. Öffne den Reiter **Konfiguration** der Integration.
2. Gib den **Benutzernamen** und das **Passwort** ein, die du auf
   [ecoledirecte.com](https://www.ecoledirecte.com) verwendest. Ein
   **Elternkonto** liefert alle Kinder, ein **Schülerkonto** den Schüler selbst.
3. Optionale Einstellungen:
   - **Aktualisierungsintervall**: standardmäßig alle 30 Minuten (mindestens
     10 Minuten);
   - **Zeitzone der Schule**: standardmäßig `Europe/Paris`. Nur für eine Schule
     außerhalb des französischen Festlands ändern (`America/Martinique`,
     `Indian/Reunion`…);
   - **Sprache der Gerätenamen**: die Sprache der Namen, die beim Anlegen der
     Geräte geschrieben werden.
4. Speichere und klicke dann auf **Verbindung testen**.

### Die Sicherheitsfrage

Beim ersten Mal verlangt EcoleDirecte oft, das Gerät mit einer Frage zu bestätigen
(zum Beispiel „Was ist dein Geburtsjahr?“). Der Status der Integration zeigt das an.
Dann:

1. klicke auf **Sicherheitsfrage abrufen**: Die Frage und die nummerierten
   möglichen Antworten erscheinen unter der Schaltfläche;
2. gib innerhalb von 10 Minuten die **Nummer** der richtigen Antwort (oder ihren
   Text) unter **Sicherheitsfrage beantworten** ein.

Die Integration speichert die Antwort: Die Frage wird bei den nächsten Starts
nicht mehr gestellt. Falls EcoleDirecte sie eines Tages erneut stellt, wiederhole
diese beiden Schritte.

## Geräte

Jedes Kind erscheint im Reiter **Erkennung**; füge es hinzu. Seine Funktionen:

| Funktion                  | Inhalt                                                     |
| ------------------------- | ---------------------------------------------------------- |
| Gesamtdurchschnitt        | Durchschnitt des laufenden Zeitraums (von 20)              |
| Letzte Note (/20)         | Zuletzt eingetragene Note, auf 20 umgerechnet              |
| Letzte Note               | Als Text: „MATHEMATIQUES : 15/20 (Contrôle chap. 3)“       |
| Hausaufgaben für morgen   | Nicht erledigte Hausaufgaben für morgen                    |
| Offene Hausaufgaben       | Nicht erledigte, noch anstehende Hausaufgaben              |
| Nächste Stunde            | „08:00 MATHEMATIQUES (S12)“, mit dem Tag, wenn nicht heute |
| Fehlzeiten / Verspätungen | Anzahl im Schuljahr                                        |
| Ungelesene Nachrichten    | Ungelesene Nachrichten im Postfach des Kontos              |

Wenn die Schule ein Modul abschaltet (zum Beispiel die Noten), bleibt die
entsprechende Funktion leer. Veröffentlicht die Schule keinen Gesamtdurchschnitt,
berechnet ihn die Integration aus den Noten: Durchschnitt jedes Fachs (mit den
Koeffizienten), dann Durchschnitt der Fächer.

## Szenen (Gladys 5.1 oder neuer)

### Auslöser

- **Neue Note**: Variablen `subject`, `assignment`, `grade`, `out_of`,
  `grade_20`, `date`, `student_name`.
- **Neue Hausaufgabe**: `subject`, `due_date`, `is_test`.
- **Neue Fehlzeit oder Verspätung**: Filter nach Art; `kind`, `date`, `label`,
  `justified`.
- **Stunde entfällt**: eine kommende Stunde wurde gestrichen; `subject`, `date`,
  `start`, `end`, `teacher`.
- **Neue Nachricht**: `from`, `subject`, `date`.

Jeder Auslöser kann nach einem Schüler gefiltert werden. Beim ersten Start
erfasst die Integration das bereits Vorhandene, ohne etwas auszulösen.

### Aktionen

- **EcoleDirecte aktualisieren**: liest EcoleDirecte sofort.
- **Hausaufgaben abrufen** (heute, morgen, nächster Schultag): `count`, `tests`,
  `subjects`, `summary` (der Inhalt der Hausaufgaben, bereit zum Versenden).
- **Stundenplan abrufen**: `has_lessons`, `first_start`, `first_subject`,
  `last_end`, `lesson_count`, `cancelled_count` — genug, um den Wecker auf die
  erste Stunde zu stellen.

Beispiel: jeden Abend um 19 Uhr „Hausaufgaben abrufen“ für morgen, dann `summary`
per Telegram senden, wenn `count` größer als 0 ist.

## Widgets (Gladys 5.1 oder neuer)

- **Schulübersicht**: Durchschnitt, letzte Note, Hausaufgaben für morgen und
  ungelesene Nachrichten live, nächste Stunde, Fehlzeiten und Verspätungen.
- **Hausaufgaben**: die offenen Hausaufgaben mit ihrem Inhalt.
- **Stundenplan**: die Stunden eines Tages, entfallene markiert.

Wähle den Schüler in den Widget-Einstellungen.

## Fehlerbehebung

- „EcoleDirecte hat den Benutzernamen oder das Passwort abgelehnt“: Prüfe sie auf
  ecoledirecte.com.
- „Die Schule ist nicht verfügbar“: EcoleDirecte sperrt den Zugang oft in den
  Ferien; die Integration versucht es von selbst erneut.
- „EcoleDirecte hat die API-Version abgelehnt“: Aktualisiere die Integration.
- Die Logs der Integration zeigen nie das Passwort.
