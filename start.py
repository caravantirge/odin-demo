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

import beispielinhalte  # noqa: E402

beispielinhalte.fuellen(api)

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
