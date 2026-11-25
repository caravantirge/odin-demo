"""Startet ODIN im Browser (Pyodide): echtes Programm, erfundene Excel-Listen, alles nur im Speicher dieses Tabs.

Wird von bruecke.js nach dem Entpacken von odin.zip nach /odin ausgeführt. Danach ruft die Oberfläche `rufe(name, json)`.
"""
import importlib.abc
import importlib.machinery
import json
import os
import sys
import threading
import types
import datetime as dt

HOME = "/home/demo"
for k in ("HOME", "APPDATA", "XDG_CONFIG_HOME"):
    os.environ[k] = HOME
os.environ["USER"] = "demo"
os.makedirs(HOME, exist_ok=True)
sys.path.insert(0, "/odin")
os.chdir("/odin")


# ------------------------------------------------ Bibliotheken, die es im Browser nicht gibt: leere Platzhalter
class _Leer:
    def __init__(self, *a, **k): pass
    def __call__(self, *a, **k): return _Leer()
    def __getattr__(self, n): return _Leer()
    def __iter__(self): return iter(())
    def __bool__(self): return False
    def __mro_entries__(self, bases): return (object,)


class _Platzhalter(importlib.abc.MetaPathFinder, importlib.abc.Loader):
    WURZELN = {"webview", "pyperclip", "pdfplumber", "reportlab", "msal", "segno", "olefile", "certifi"}

    def find_spec(self, name, path=None, target=None):
        if name.split(".")[0] in self.WURZELN:
            return importlib.machinery.ModuleSpec(name, self, is_package=True)
        return None

    def create_module(self, spec):
        m = types.ModuleType(spec.name)
        m.__path__ = []
        m.__getattr__ = lambda n: _Leer() if not n.startswith("__") else (_ for _ in ()).throw(AttributeError(n))
        return m

    def exec_module(self, module):
        pass


sys.meta_path.append(_Platzhalter())

# ------------------------------------------------ Hintergrund-Fäden: im Browser gibt es keine – kurze Arbeit sofort
_OHNE = ("ODIN-Live", "ODIN-Erinnerung", "ODIN-Anmeldung", "odin-web")


def _start(self):
    if self.name in _OHNE:
        return
    self._demo_lief = True
    self.run()


threading.Thread.start = _start
threading.Thread.join = lambda self, timeout=None: None
threading.Thread.is_alive = lambda self: False

import app  # noqa: E402
from tirge_helfer import web  # noqa: E402
from tirge_helfer.cockpit import beispieldateien  # noqa: E402
import demo_daten  # noqa: E402

demo_daten.aufstocken()

LISTEN = os.path.join(HOME, "Listen")
quellen = beispieldateien.schreibe_alle(LISTEN, artikel=300)
fahrzeuge = os.path.join(HOME, "Fahrzeuge")
os.makedirs(fahrzeuge, exist_ok=True)
app.EINSTELLUNGEN["fahrzeuge_ordner"] = fahrzeuge
app.EINSTELLUNGEN["cockpit_quellen"] = {a: quellen[a] for a in (
    "bestandsliste", "finanzierungen", "auslieferungen", "finanzplanung", "provisionen", "teilepreise", "urlaubsplaner")}
api = app.Api()

# ------------------------------------------------ Beispielinhalte (erfunden)
P = lambda a, *x: api.projekte_aufruf(a, list(x))["daten"]          # noqa: E731
heute = dt.date.today()
tag = lambda n: (heute + dt.timedelta(days=n)).isoformat()            # noqa: E731
DEMO_PIN = "1234"
for name in ("Anna Berg", "Lars Albers", "Mia Krause", "Tom Wagner", "Jonas Peters", "Lea Hoffmann"):
    P("person_anlegen", {"name": name})
pers = {p["name"]: p["id"] for p in P("personen")}
for pid in pers.values():
    try:
        api._tresor.pins.setzen(pid, DEMO_PIN, von=pid, wie="Rechner")
    except Exception as e:  # noqa: BLE001
        print("pin", e)


def _versuch(was, f):
    try:
        return f()
    except Exception as e:  # noqa: BLE001 – Demo: fehlende Beispielinhalte sind kein Abbruch
        print("Beispiel", was, repr(e))


def projekt(name, beschreibung, farbe, mitglieder, aufgaben, ziel=None):
    p = P("projekt_anlegen", {"name": name, "beschreibung": beschreibung, "farbe": farbe})
    for m in mitglieder:
        _versuch("mitglied", lambda: P("mitglied_hinzufuegen", p["id"], pers[m]))
    for titel, wer, tage, prio in aufgaben:
        _versuch("aufgabe", lambda: P("aufgabe_anlegen", p["id"], {
            "titel": titel, "zustaendig": [pers[wer]], "faellig": tag(tage) if tage is not None else None,
            "prioritaet": prio}))
    if ziel:
        _versuch("ziel", lambda: P("projekt_aendern", p["id"], ziel))


api._tresor.rechner_setzen(pers["Anna Berg"])
q = f"{heute.year}-Q{(heute.month - 1) // 3 + 1}"
_versuch("projekte", lambda: (
    projekt("Hausmesse", "Frühjahrs-Hausmesse: Fahrzeuge, Catering, Werbung.", "#2F6DB3",
            ["Lars Albers", "Mia Krause", "Jonas Peters"], [
                ("Fahrzeugliste für die Ausstellung festlegen", "Anna Berg", 3, "hoch"),
                ("Catering anfragen", "Mia Krause", 10, "normal"),
                ("Anzeige Tageszeitung buchen", "Anna Berg", 0, "normal"),
                ("Flyer drucken lassen", "Mia Krause", 14, "normal"),
                ("Probefahrt-Route festlegen", "Jonas Peters", 6, "niedrig")],
            {"quartalsziel": q, "ziel_status": "auf Kurs", "ziel_erledigt_heisst": "Messe geplant, Einladungen raus"}),
    projekt("Werkstatt umbauen", "Zweite Hebebühne und neue Teile-Ausgabe.", "#0F8F78",
            ["Lars Albers", "Tom Wagner"], [
                ("Angebote Hebebühne vergleichen", "Lars Albers", 5, "hoch"),
                ("Elektriker beauftragen", "Tom Wagner", 12, "normal"),
                ("Regale Teile-Ausgabe bestellen", "Anna Berg", -2, "normal")],
            {"quartalsziel": q, "ziel_status": "nicht auf Kurs"}),
    projekt("Neue Website", "Fahrzeugsuche mit Anbindung an das Fahrzeugsystem.", "#D0141C", ["Mia Krause", "Lea Hoffmann"], [
        ("Texte für die Startseite", "Mia Krause", 20, "niedrig"),
        ("Fotos der Ausstellungsfahrzeuge", "Lea Hoffmann", 8, "normal")]),
))
B = lambda a, *x: api.besprechungen_aufruf(a, list(x))                # noqa: E731


def _besprechung():
    b = B("anlegen", {"art": "lieferant", "titel": "Jahresgespräch Hersteller1", "datum": tag(-3),
                      "teilnehmer": [pers["Anna Berg"], pers["Lars Albers"]]})["daten"]
    B("thema_anlegen", b["id"], {"titel": "Liefertermine Frühjahr absichern"})
    B("beschluss_anlegen", b["id"], {"text": "Vororder für 6 Kastenwagen bis 15.12. bestätigen",
                                     "grund": "Messefahrzeuge rechtzeitig auf dem Hof"})


_versuch("besprechung", _besprechung)
for text, bereich, tage, prio in [
        ("Zulassungsbescheinigung Teil II nachfordern", "Auslieferung", 1, "hoch"),
        ("Langsteher für die Herbstaktion auspreisen", "Bestand", 6, "normal"),
        ("Ablösung der zinsfreien Verträge mit der Bank besprechen", "Finanzierung", 3, "hoch"),
        ("Fotos für die Fahrzeugbörse nachreichen", "Bestand", 2, "normal"),
        ("Einweisungstermin mit Kunde Hansen bestätigen", "Auslieferung", 0, "hoch"),
        ("Messe-Fahrzeuge reservieren lassen", "Messe", 14, "niedrig")]:
    _versuch("todo", lambda: api.cockpit.todo_anlegen({"text": text, "bereich": bereich, "faellig_am": tag(tage),
                                                       "prioritaet": prio}))
api._tresor.rechner_setzen("")

# ------------------------------------------------ Aufrufe aus der Oberfläche – wie im Browser-Modus von ODIN
web.NUR_AM_RECHNER.clear()                      # Demo: jeder darf alles ausprobieren (nur in diesem Tab)
SERVER = web.WebServer(api, "/odin/ui")
SITZUNG = {"ich": None, "ip": "demo"}


def rufe(name, args_json):
    try:
        erg = SERVER.aufrufen(name, json.loads(args_json), SITZUNG)
        return json.dumps({"ergebnis": erg}, ensure_ascii=False, default=str)
    except Exception as e:  # noqa: BLE001
        return json.dumps({"__fehler": str(e) or e.__class__.__name__}, ensure_ascii=False)


def abmelden():
    SITZUNG["ich"] = None
    return True
