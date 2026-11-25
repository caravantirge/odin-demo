/* ODIN-Demo: startet das echte ODIN (Python) im Browser mit Pyodide und ersetzt damit window.pywebview.api.
   Nichts verlässt den Browser: Daten entstehen beim Start neu und verschwinden beim Neuladen. */
(function () {
  const PYODIDE = "pyodide/";
  const lade = document.createElement("div");
  lade.id = "demo-lade";
  lade.innerHTML = '<div class="demo-lade-karte"><img src="img/odin-signet.svg" alt=""><b>ODIN wird gestartet</b>' +
    '<span id="demo-lade-text">Programm laden …</span><i><s id="demo-lade-balken"></s></i>' +
    '<small>Demo mit erfundenen Daten – läuft komplett in deinem Browser.</small></div>';
  const stil = document.createElement("style");
  stil.textContent = "#demo-lade{position:fixed;inset:0;z-index:99999;display:grid;place-items:center;background:var(--bg,#15110F);" +
    "color:#F4EFEC;font:15px/1.5 Inter,system-ui,sans-serif;transition:opacity .4s}#demo-lade.weg{opacity:0;pointer-events:none}" +
    ".demo-lade-karte{display:grid;gap:10px;justify-items:center;text-align:center;width:min(320px,90vw)}" +
    ".demo-lade-karte img{width:56px;height:56px}.demo-lade-karte b{font-size:20px}.demo-lade-karte span{opacity:.75}" +
    ".demo-lade-karte i{display:block;width:100%;height:4px;border-radius:2px;background:rgba(255,255,255,.12);overflow:hidden}" +
    ".demo-lade-karte s{display:block;height:100%;width:0;background:#FF4A50;transition:width .3s}" +
    ".demo-lade-karte small{opacity:.55;font-size:12px}" +
    "#demo-band{position:fixed;left:50%;bottom:10px;transform:translateX(-50%);z-index:9999;padding:5px 12px;border-radius:999px;" +
    "background:rgba(208,20,28,.92);color:#fff;font:600 12px Inter,system-ui,sans-serif;pointer-events:none;white-space:nowrap}";
  document.head.appendChild(stil);
  const schritt = (text, anteil) => {
    const t = document.getElementById("demo-lade-text"), b = document.getElementById("demo-lade-balken");
    if (t) t.textContent = text;
    if (b) b.style.width = Math.round(anteil * 100) + "%";
  };
  const zeigen = () => { document.body.appendChild(lade); };
  if (document.body) zeigen(); else document.addEventListener("DOMContentLoaded", zeigen);

  let rufe = null;
  const fertig = (async () => {
    await new Promise((ok, fehl) => {
      const s = document.createElement("script"); s.src = PYODIDE + "pyodide.js"; s.onload = ok; s.onerror = fehl;
      document.head.appendChild(s);
    });
    schritt("Python starten …", 0.15);
    const py = await loadPyodide({ indexURL: PYODIDE });
    schritt("Bibliotheken laden …", 0.35);
    await py.loadPackage(["sqlite3", "hashlib", "ssl", "micropip"]);
    const mp = py.pyimport("micropip");
    await mp.install(["wheels/et_xmlfile-2.0.0-py3-none-any.whl", "wheels/openpyxl-3.1.5-py2.py3-none-any.whl"].map((w) => new URL(w, location.href).href));
    schritt("ODIN entpacken …", 0.55);
    const zip = await (await fetch("odin.zip")).arrayBuffer();
    py.unpackArchive(zip, "zip", { extractDir: "/odin" });
    schritt("Beispielbetrieb aufbauen (Excel-Listen, Personen, Projekte) …", 0.7);
    await new Promise((r) => setTimeout(r, 30));
    const code = await (await fetch("start.py")).text();
    await py.runPythonAsync(code);
    rufe = py.globals.get("rufe");
    window.__odinAbmelden = py.globals.get("abmelden");
    schritt("Fertig", 1);
  })();

  const ruf = async (name, args) => {
    await fertig;
    const x = JSON.parse(rufe(String(name), JSON.stringify(args)));
    if (x && x.__fehler) throw new Error(x.__fehler);
    return x ? x.ergebnis : null;
  };
  const api = new Proxy({}, { get: (_, name) => (...args) => ruf(String(name), args) });
  window.pywebview = { api, web: true, demo: true };
  document.documentElement.dataset.web = "1";
  document.documentElement.dataset.demo = "1";

  // Abmelden: im Browser-Modus fragt ODIN den Server – hier beendet es nur die Sitzung in diesem Tab
  const echtFetch = window.fetch.bind(window);
  window.fetch = (url, opt) => {
    if (String(url) === "/abmelden") { try { window.__odinAbmelden && window.__odinAbmelden(); } catch (e) {} return Promise.resolve(new Response("", { status: 200 })); }
    return echtFetch(url, opt);
  };

  fertig.then(() => {
    window.dispatchEvent(new Event("pywebviewready"));
    lade.classList.add("weg");
    setTimeout(() => lade.remove(), 500);
    const band = document.createElement("div");
    band.id = "demo-band"; band.textContent = "Demo · erfundene Daten · Anmeldung: beliebige Person, PIN 1234";
    document.body.appendChild(band);
  }).catch((e) => {
    schritt("Start fehlgeschlagen: " + (e && e.message ? e.message : e), 1);
    console.error(e);
  });
})();
