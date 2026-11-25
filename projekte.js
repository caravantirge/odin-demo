/* ODIN · Projekte
   Jeder legt Projekte an und holt einzelne Personen dazu. Board mit Spalten (Aufgaben ziehen), Liste,
   „Meine Aufgaben“ über alle Projekte, Details mit Zuständigen, Fälligkeit, Priorität, Checkliste und
   Kommentaren. Gespeichert wird über ODIN (tirge_helfer/projekte.py) im Ordner „Fahrzeuge“.
   Seiten: #/projekte, #/projekt/<id>[/liste], #/aufgaben – eingehängt über window.ODIN_SEITEN (cockpit.js). */
(() => {
"use strict";

const P = {
  start: null,            // {ich, personen, projekte, farben, speicher}
  projekte: new Map(),    // id -> volles Projekt
  meine: null,            // offene Aufgaben, für die ich zuständig bin
  fehler: "",
  laedt: new Map(),       // Projekt-ID -> laufendes Laden
  offen: null,            // {projekt, aufgabe} im Detailfenster
  nurMeine: false,
  suche: "",
  schnell: null,          // Spalte mit offenem Schnell-Eingabefeld
  archivZeigen: false,
};

const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const ic = (n) => '<svg class="ic" aria-hidden="true"><use href="#ci-' + n + '"/></svg>';
const heute = () => new Date().toISOString().slice(0, 10);
const tagDiff = (iso) => Math.round((new Date(iso + "T00:00:00") - new Date(heute() + "T00:00:00")) / 864e5);
const kurzDatum = (iso) => { if (!iso) return ""; const [j, m, t] = iso.slice(0, 10).split("-"); return t + "." + m + "." + (j === heute().slice(0, 4) ? "" : j.slice(2)); };
const zeitpunkt = (iso) => { if (!iso) return ""; const d = new Date(iso); return d.toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit" }) + ", " + d.toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit" }); };
const meldung = (text, fehler) => { if (typeof zeigeMeldung === "function") zeigeMeldung(text, fehler ? "x" : "check", !!fehler); };

/* Quartalsziele („2027-Q1“): laufendes Quartal, blättern, vorbei? */
const lokalHeute = () => { const d = new Date(); return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0"); };
const quartalVon = (iso) => iso.slice(0, 4) + "-Q" + (Math.floor((Number(iso.slice(5, 7)) - 1) / 3) + 1);
const quartalPlus = (q, n) => { const t = Number(q.slice(0, 4)) * 4 + Number(q.slice(-1)) - 1 + n; return Math.floor(t / 4) + "-Q" + (t % 4 + 1); };
const quartalName = (q) => "Q" + q.slice(-1) + " " + q.slice(0, 4);
const quartalVorbei = (q) => { const n = quartalPlus(q, 1); return lokalHeute() >= n.slice(0, 4) + "-" + String((Number(n.slice(-1)) - 1) * 3 + 1).padStart(2, "0") + "-01"; };
const ZIEL_TON = { "auf Kurs": "gut", "nicht auf Kurs": "krit", erledigt: "gut", "nicht erledigt": "krit" };
const zielChip = (p, lang) => p.quartalsziel ? '<a class="pj-chip pj-ziel-chip ' + (ZIEL_TON[p.ziel_status] || "warn") + '" href="#/ziele" title="Quartalsziel – Übersicht unter „Quartalsziele“">' +
  ic("ziele") + (lang ? "Quartalsziel " : "Ziel ") + esc(quartalName(p.quartalsziel)) + (lang ? " · " + esc(p.ziel_status || "Abschluss fehlt") : "") + "</a>" : "";

async function ruf(aktion, ...args) {
  if (!window.pywebview || !window.pywebview.api) throw new Error("Programm-Schnittstelle nicht bereit");
  const r = await window.pywebview.api.projekte_aufruf(aktion, args);
  if (!r || !r.ok) throw new Error((r && r.fehler) || "Unbekannter Fehler");
  return r.daten;
}

/* ------------------------------------------------------------ Laden */
async function ladeStart() {
  try {
    P.start = await ruf("start");
    P.fehler = "";
    if (P.start.ich) P.meine = await ruf("meine_aufgaben");
  } catch (e) {
    P.fehler = String(e.message || e);
  }
  seitenleiste();
}

/* Läuft das Laden schon, dasselbe Versprechen zurückgeben – nie sofort: sonst zeichnet die Seite sich ohne Pause
   neu und die Antwort kommt nie an. */
function ladeProjekt(id) {
  if (P.laedt.has(id)) return P.laedt.get(id);
  const laeuft = ruf("projekt", id)
    .then((p) => { P.projekte.set(id, p); })
    .catch((e) => { P.projekte.set(id, { fehler: String(e.message || e) }); })
    .finally(() => { P.laedt.delete(id); });
  P.laedt.set(id, laeuft);
  return laeuft;
}

/* Nach jeder Änderung: Projekt ersetzen, Übersicht/Meine Aufgaben nachziehen, neu zeichnen (Scroll bleibt) */
async function aendern(aktion, ...args) {
  try {
    const p = await ruf(aktion, ...args);
    if (p && p.id && p.spalten) P.projekte.set(p.id, p);
    ladeStart().then(() => { if (aktuelleSeite() !== "projekt") neuZeichnen(); else seitenleiste(); });
    neuZeichnen();
    return p;
  } catch (e) {
    meldung(String(e.message || e), true);
    return null;
  }
}

const aktuelleSeite = () => (location.hash || "").slice(2).split("/")[0];

function neuZeichnen() {
  const inhalt = document.getElementById("inhalt");
  const board = inhalt.querySelector(".pj-board");
  const detail = inhalt.querySelector(".pj-detail-inhalt");
  const merken = { oben: inhalt.scrollTop, links: board ? board.scrollLeft : 0, detail: detail ? detail.scrollTop : 0,
    fokus: document.activeElement && document.activeElement.dataset ? document.activeElement.dataset.fokus : null };
  if (typeof window.cockpitZeichne === "function") window.cockpitZeichne();
  inhalt.scrollTop = merken.oben;
  const b = inhalt.querySelector(".pj-board"); if (b) b.scrollLeft = merken.links;
  const d = inhalt.querySelector(".pj-detail-inhalt"); if (d) d.scrollTop = merken.detail;
  if (merken.fokus) { const f = inhalt.querySelector('[data-fokus="' + merken.fokus + '"]'); if (f) f.focus(); }
}

/* ------------------------------------------------------------ Personen */
const person = (id) => (P.start && P.start.personen.find((x) => x.id === id)) || { id, name: "Unbekannt", kuerzel: "?", farbe: "#8A8586" };
const avatar = (id, gross) => { const p = person(id); return '<span class="pj-avatar' + (gross ? " gross" : "") + '" style="--farbe:' + window.odinFarbeOk(p.farbe) + '" title="' + esc(p.name) + '">' + esc(p.kuerzel) + "</span>"; };
const avatare = (ids, max = 4) => '<span class="pj-avatare">' + ids.slice(0, max).map((i) => avatar(i)).join("") +
  (ids.length > max ? '<span class="pj-avatar mehr">+' + (ids.length - max) + "</span>" : "") + "</span>";

/* ------------------------------------------------------------ Seitenleiste */
function seitenleiste() {
  const box = document.getElementById("projekt-links");
  if (!box) return;
  // Einzelne Projekte nur, solange man im Projektbereich ist – sonst bräuchte die Leiste einen Rollbalken
  const liste = P.start && P.start.ich && istProjektSeite() ? P.start.projekte.filter((p) => !p.archiviert).slice(0, 4) : [];
  box.innerHTML = liste.map((p) => '<a title="' + esc(p.name) + '" href="#/projekt/' + esc(p.id) + '" data-seite="projekt-' + esc(p.id) + '">' +
    '<span class="pj-punkt" style="--farbe:' + window.odinFarbeOk(p.farbe) + '"></span><span>' + esc(p.name) + "</span></a>").join("");
  // Nur so viele Projekte, wie ohne Rollbalken in die Leiste passen (alle gibt es unter „Alle Projekte“)
  const menue = box.closest(".seite-menue");
  while (menue && box.lastElementChild && menue.scrollHeight > menue.clientHeight + 1) box.lastElementChild.remove();
  const zahl = document.getElementById("aufgaben-zahl");
  if (zahl) {
    const n = P.meine ? P.meine.length : 0;
    const ueber = P.meine ? P.meine.filter((a) => a.faellig && a.faellig < heute()).length : 0;
    zahl.textContent = n; zahl.hidden = !n; zahl.classList.toggle("rot", ueber > 0);
    zahl.title = ueber ? ueber + " überfällig" : "";
  }
  const { name } = { name: aktuelleSeite() };
  const rest = (location.hash || "").slice(2).split("/")[1] || "";
  document.querySelectorAll(".seite-menue a").forEach((a) => {
    const soll = name === "projekt" ? "projekt-" + rest : name;
    if (a.closest("#projekt-links")) a.classList.toggle("aktiv", a.dataset.seite === soll);
  });
}

/* ------------------------------------------------------------ Bausteine */
function leerOderLaden() {
  if (P.fehler) return '<div class="pj-leer"><h2>Projekte gerade nicht erreichbar</h2><p>' + esc(P.fehler) + '</p><button class="btn btn-primaer" data-pj="neu-laden">Nochmal versuchen</button></div>';
  return '<div class="laden" aria-label="Projekte werden geladen"><i class="skelett" style="width:40%"></i><i class="skelett"></i><i class="skelett" style="width:70%"></i></div>';
}

function werBistDu() {
  const personen = P.start.personen;
  return '<div class="kopf"><div><h1>Projekte</h1><p>Erst einmal: Wer arbeitet an diesem Rechner?</p></div></div>' +
    '<section class="karte pj-ich"><div class="pj-ich-inhalt">' +
    (personen.length ? '<div class="pj-ich-liste">' + personen.map((p) =>
      '<button class="pj-ich-person" data-pj="ich" data-id="' + esc(p.id) + '">' + avatar(p.id, true) + "<span>" + esc(p.name) + "</span></button>").join("") + "</div>" : "") +
    '<form class="pj-zeile-form" data-pj-form="person-ich"><input type="text" name="name" placeholder="' + (personen.length ? "Oder neu: Vor- und Nachname" : "Vor- und Nachname") + '" autocomplete="off" required minlength="2" maxlength="60">' +
    '<button class="btn btn-primaer" type="submit">' + (personen.length ? "Anlegen" : "Los geht’s") + "</button></form>" +
    '<p class="klein">Nach der Auswahl fragt ODIN im Tresor nach deiner PIN (beim ersten Mal legst du sie fest) – mit Microsoft angemeldet (<a href="#/konto">Konto &amp; Anmeldung</a>) geht es ohne.</p>' +
    "</div></section>" + speicherHinweis();
}

function speicherHinweis() {
  return P.start && P.start.speicher.lokal ? '<div class="hinweis pj-hinweis"><b>Nur auf diesem Rechner.</b>&nbsp;Der Ordner „Fahrzeuge“ ist nicht verbunden – Projekte sehen andere erst, wenn er unter „Auftragsbestätigungen“ verbunden ist.</div>' : "";
}

function faelligChip(iso, erledigt) {
  if (!iso) return "";
  const d = tagDiff(iso);
  const art = erledigt ? "" : d < 0 ? " krit" : d === 0 ? " warn" : "";
  const text = d === 0 ? "heute" : d === 1 ? "morgen" : d === -1 ? "gestern" : kurzDatum(iso);
  return '<span class="pj-chip' + art + '" title="Fällig am ' + esc(kurzDatum(iso)) + '">' + ic("kalender") + esc(text) + "</span>";
}

const prioChip = (p) => p === "hoch" ? '<span class="pj-chip hoch">hoch</span>' : p === "niedrig" ? '<span class="pj-chip leise">niedrig</span>' : "";

/* ------------------------------------------------------------ Seite: Alle Projekte */
function seiteProjekte() {
  if (!P.start) { if (!P.fehler) ladeStart().then(neuZeichnen); return { html: leerOderLaden() }; }
  if (P.fehler) return { html: leerOderLaden() };
  if (!P.start.ich) return { html: werBistDu() };
  const ich = P.start.ich;
  const aktiv = P.start.projekte.filter((p) => !p.archiviert);
  const archiv = P.start.projekte.filter((p) => p.archiviert);
  const karte = (p) => {
    const anteil = p.aufgaben ? Math.round((p.erledigt / p.aufgaben) * 100) : 0;
    return '<a class="pj-karte" href="#/projekt/' + esc(p.id) + '" style="--farbe:' + window.odinFarbeOk(p.farbe) + '">' +
      '<div class="pj-karte-kopf"><span class="pj-punkt"></span><b>' + esc(p.name) + "</b>" + (p.besitzer === ich ? "" : '<span class="pj-chip leise">Mitglied</span>') + (p.quartalsziel ? '<span class="pj-chip pj-ziel-klein ' + (ZIEL_TON[p.ziel_status] || "warn") + '">' + ic("ziele") + esc(quartalName(p.quartalsziel)) + "</span>" : "") + "</div>" +
      (p.beschreibung ? '<p class="pj-karte-text">' + esc(p.beschreibung.split("\n")[0]) + "</p>" : '<p class="pj-karte-text leise">Keine Beschreibung</p>') +
      '<div class="pj-fortschritt" role="img" aria-label="' + anteil + ' % erledigt"><i style="width:' + anteil + '%"></i></div>' +
      '<div class="pj-karte-fuss"><span>' + p.erledigt + " / " + p.aufgaben + " erledigt" +
      (p.ueberfaellig ? ' · <b class="krit">' + p.ueberfaellig + " überfällig</b>" : p.naechste_frist ? " · nächste Frist " + esc(kurzDatum(p.naechste_frist)) : "") + "</span>" +
      avatare(p.mitglieder) + "</div></a>";
  };
  const html = speicherHinweis() +
    '<div class="kopf"><div><h1>Projekte</h1><p>Eigene Projekte anlegen und einzelne Personen dazuholen – sichtbar nur für Mitglieder.</p></div>' +
    '<div class="kopf-aktionen"><span class="pj-ich-anzeige">' + avatar(ich) + esc(person(ich).name) +
      (P.start.ich_fest ? ' <a class="mini pj-konto" href="#/konto" title="Mit Microsoft angemeldet – ändern unter „Konto &amp; Anmeldung“">angemeldet</a>'
        : ' <button class="mini" data-pj="ich-wechseln">wechseln</button>') + "</span>" +
    '<button class="btn btn-primaer" data-pj="projekt-neu">' + ic("plus") + "Neues Projekt</button></div></div>" +
    (aktiv.length ? '<div class="pj-karten">' + aktiv.map(karte).join("") + "</div>"
      : '<div class="pj-leer"><h2>Noch keine Projekte</h2><p>Ein Projekt sammelt Aufgaben, Zuständige und Fristen an einem Ort – zum Beispiel „Hausmesse 2027“ oder „Werkstatt umbauen“.</p><button class="btn btn-primaer" data-pj="projekt-neu">' + ic("plus") + "Erstes Projekt anlegen</button></div>") +
    (archiv.length ? '<div class="pj-archiv"><button class="mini" data-pj="archiv">' + (P.archivZeigen ? "Archiv ausblenden" : "Archiv zeigen (" + archiv.length + ")") + "</button>" +
      (P.archivZeigen ? '<div class="pj-karten archiviert">' + archiv.map(karte).join("") + "</div>" : "") + "</div>" : "");
  return { html };
}

/* ------------------------------------------------------------ Seite: ein Projekt */
function gefiltert(p) {
  const s = P.suche.trim().toLowerCase();
  return p.aufgaben.filter((a) => (!P.nurMeine || (a.zustaendig || []).includes(P.start.ich)) &&
    (!s || a.titel.toLowerCase().includes(s) || (a.fahrzeug || "").toLowerCase().includes(s) || (a.beschreibung || "").toLowerCase().includes(s)));
}

function kartenHtml(p, a) {
  const fertig = p.spalten.find((s) => s.id === a.spalte && s.erledigt);
  const punkte = a.checkliste || [];
  const erledigtePunkte = punkte.filter((x) => x.erledigt).length;
  const meta = [
    faelligChip(a.faellig, fertig), prioChip(a.prioritaet),
    punkte.length ? '<span class="pj-chip' + (erledigtePunkte === punkte.length ? " gut" : "") + '">' + ic("aufgaben") + erledigtePunkte + "/" + punkte.length + "</span>" : "",
    (a.kommentare || []).length ? '<span class="pj-chip">' + ic("kommentar") + a.kommentare.length + "</span>" : "",
    a.fahrzeug ? '<span class="pj-chip mono">' + esc(a.fahrzeug) + "</span>" : "",
  ].filter(Boolean).join("");
  return '<article class="pj-aufgabe' + (fertig ? " fertig" : "") + (P.offen && P.offen.aufgabe === a.id ? " gewaehlt" : "") + '" draggable="true" tabindex="0" data-aufgabe="' + esc(a.id) + '" aria-label="' + esc(a.titel) + '">' +
    '<div class="pj-aufgabe-titel">' + esc(a.titel) + "</div>" +
    (meta || (a.zustaendig || []).length ? '<div class="pj-aufgabe-meta"><span class="pj-chips">' + meta + "</span>" + avatare(a.zustaendig || [], 3) + "</div>" : "") +
    "</article>";
}

function boardHtml(p) {
  const aufgaben = gefiltert(p);
  return '<div class="pj-board">' + p.spalten.map((s) => {
    const inSpalte = aufgaben.filter((a) => a.spalte === s.id).sort((x, y) => (x.position || 0) - (y.position || 0));
    const schnell = P.schnell === s.id;
    return '<section class="pj-spalte' + (s.erledigt ? " erledigt" : "") + '" data-spalte="' + esc(s.id) + '">' +
      '<header class="pj-spalte-kopf"><b>' + esc(s.name) + '</b><span class="pj-anzahl">' + inSpalte.length + "</span>" +
      '<button class="pj-icon-knopf" data-pj="spalte-menue" data-spalte="' + esc(s.id) + '" title="Spalte umbenennen oder löschen" aria-label="Spalte bearbeiten">' + ic("punkte") + "</button></header>" +
      '<div class="pj-spalte-inhalt">' + inSpalte.map((a) => kartenHtml(p, a)).join("") +
      (schnell ? '<form class="pj-schnell" data-pj-form="schnell" data-spalte="' + esc(s.id) + '"><textarea name="titel" rows="2" placeholder="Was ist zu tun? (Enter = anlegen)" data-fokus="schnell" maxlength="200"></textarea>' +
        '<div class="pj-schnell-knoepfe"><button class="btn btn-primaer" type="submit">Anlegen</button><button class="btn" type="button" data-pj="schnell-zu">Fertig</button></div></form>' : "") +
      "</div>" +
      (schnell ? "" : '<button class="pj-neu" data-pj="schnell" data-spalte="' + esc(s.id) + '">' + ic("plus") + "Aufgabe</button>") +
      "</section>";
  }).join("") +
  '<button class="pj-spalte-neu" data-pj="spalte-neu">' + ic("plus") + "Spalte</button></div>";
}

function listeHtml(p) {
  const aufgaben = gefiltert(p);
  return '<div class="pj-liste">' + p.spalten.map((s) => {
    const zeilen = aufgaben.filter((a) => a.spalte === s.id).sort((x, y) => (x.position || 0) - (y.position || 0));
    if (!zeilen.length) return "";
    return '<section class="karte"><div class="pj-liste-kopf"><b>' + esc(s.name) + '</b><span class="pj-anzahl">' + zeilen.length + "</span></div>" +
      '<table class="pj-tabelle"><thead><tr><th class="pj-haken-spalte"></th><th>Aufgabe</th><th>Zuständig</th><th>Fällig</th><th>Priorität</th><th>Checkliste</th></tr></thead><tbody>' +
      zeilen.map((a) => {
        const punkte = a.checkliste || [];
        return '<tr data-aufgabe="' + esc(a.id) + '" class="' + (P.offen && P.offen.aufgabe === a.id ? "gewaehlt" : "") + '">' +
          '<td><button class="pj-haken' + (s.erledigt ? " an" : "") + '" data-pj="haken" data-id="' + esc(a.id) + '" aria-pressed="' + s.erledigt + '" title="' + (s.erledigt ? "Wieder öffnen" : "Erledigt") + '">' + ic("aufgaben") + "</button></td>" +
          '<td class="pj-titel-zelle">' + esc(a.titel) + (a.fahrzeug ? ' <span class="pj-chip mono">' + esc(a.fahrzeug) + "</span>" : "") + "</td>" +
          "<td>" + ((a.zustaendig || []).length ? avatare(a.zustaendig, 4) : '<span class="leise">–</span>') + "</td>" +
          "<td>" + (faelligChip(a.faellig, s.erledigt) || '<span class="leise">–</span>') + "</td>" +
          "<td>" + (prioChip(a.prioritaet) || '<span class="leise">normal</span>') + "</td>" +
          "<td>" + (punkte.length ? punkte.filter((x) => x.erledigt).length + "/" + punkte.length : '<span class="leise">–</span>') + "</td></tr>";
      }).join("") + "</tbody></table></section>";
  }).join("") + (aufgaben.length ? "" : '<div class="pj-leer klein"><p>' + (P.suche || P.nurMeine ? "Keine Aufgabe passt zum Filter." : "Noch keine Aufgaben – im Board mit „+ Aufgabe“ anlegen.") + "</p></div>") + "</div>";
}

function detailHtml(p) {
  if (!P.offen || P.offen.projekt !== p.id) return "";
  const a = p.aufgaben.find((x) => x.id === P.offen.aufgabe);
  if (!a) { P.offen = null; return ""; }
  const ich = P.start.ich;
  const punkte = a.checkliste || [];
  const fertig = punkte.filter((x) => x.erledigt).length;
  const spalteFertig = p.spalten.find((s) => s.id === a.spalte && s.erledigt);
  return '<aside class="pj-detail" aria-label="Aufgabe">' +
    '<div class="pj-detail-kopf"><button class="pj-haken' + (spalteFertig ? " an" : "") + '" data-pj="haken" data-id="' + esc(a.id) + '" aria-pressed="' + !!spalteFertig + '">' + ic("aufgaben") + "<span>" + (spalteFertig ? "Erledigt" : "Als erledigt markieren") + "</span></button>" +
    '<button class="pj-icon-knopf" data-pj="detail-zu" title="Schließen (Esc)" aria-label="Schließen">' + ic("schliessen") + "</button></div>" +
    '<div class="pj-detail-inhalt">' +
    '<textarea class="pj-detail-titel" data-feld="titel" data-fokus="titel" rows="1" maxlength="200" aria-label="Titel">' + esc(a.titel) + "</textarea>" +
    '<dl class="pj-felder">' +
      "<dt>Spalte</dt><dd><select data-feld=\"spalte\">" + p.spalten.map((s) => '<option value="' + esc(s.id) + '"' + (s.id === a.spalte ? " selected" : "") + ">" + esc(s.name) + "</option>").join("") + "</select></dd>" +
      "<dt>Zuständig</dt><dd class=\"pj-zustaendig\">" + p.mitglieder.map((m) => '<button class="pj-person-chip' + ((a.zustaendig || []).includes(m) ? " an" : "") + '" data-pj="zustaendig" data-id="' + esc(m) + '" aria-pressed="' + (a.zustaendig || []).includes(m) + '">' + avatar(m) + esc(person(m).name.split(" ")[0]) + "</button>").join("") + "</dd>" +
      '<dt>Fällig</dt><dd><input type="date" data-feld="faellig" value="' + esc(a.faellig || "") + '"></dd>' +
      "<dt>Priorität</dt><dd><div class=\"pj-segment\">" + ["niedrig", "normal", "hoch"].map((x) => '<button data-pj="prio" data-wert="' + x + '" aria-pressed="' + (a.prioritaet === x) + '">' + x + "</button>").join("") + "</div></dd>" +
      '<dt>Fahrzeug</dt><dd><input type="text" data-feld="fahrzeug" value="' + esc(a.fahrzeug || "") + '" placeholder="Interne Nummer, z. B. DETKW00182" maxlength="20">' +
        (a.fahrzeug ? ' <a class="mini-link" href="#/fahrzeug/' + esc(a.fahrzeug) + '">im Bestand ansehen</a>' : "") + "</dd>" +
    "</dl>" +
    '<div class="pj-abschnitt"><h3>Beschreibung</h3><textarea class="pj-text" data-feld="beschreibung" rows="4" placeholder="Details, Links, Absprachen …">' + esc(a.beschreibung || "") + "</textarea></div>" +
    '<div class="pj-abschnitt"><h3>Checkliste' + (punkte.length ? ' <span class="leise">' + fertig + "/" + punkte.length + "</span>" : "") + "</h3>" +
      (punkte.length ? '<div class="pj-fortschritt klein"><i style="width:' + Math.round(fertig / punkte.length * 100) + '%"></i></div>' : "") +
      '<ul class="pj-checkliste">' + punkte.map((x) => '<li class="' + (x.erledigt ? "an" : "") + '"><label><input type="checkbox" data-pj="punkt" data-id="' + esc(x.id) + '"' + (x.erledigt ? " checked" : "") + "><span>" + esc(x.text) + "</span></label>" +
        '<button class="pj-icon-knopf klein" data-pj="punkt-weg" data-id="' + esc(x.id) + '" title="Punkt löschen" aria-label="Punkt löschen">' + ic("schliessen") + "</button></li>").join("") + "</ul>" +
      '<form class="pj-zeile-form" data-pj-form="punkt"><input type="text" name="text" placeholder="Punkt hinzufügen" maxlength="200" data-fokus="punkt" autocomplete="off"><button class="btn" type="submit">Hinzufügen</button></form></div>' +
    '<div class="pj-abschnitt"><h3>Kommentare</h3>' +
      '<ul class="pj-kommentare">' + (a.kommentare || []).map((k) => "<li>" + avatar(k.von) + '<div><div class="pj-kommentar-kopf"><b>' + esc(person(k.von).name) + "</b><span class=\"leise\">" + esc(zeitpunkt(k.am)) + "</span>" +
        (k.von === ich ? '<button class="mini" data-pj="kommentar-weg" data-id="' + esc(k.id) + '">löschen</button>' : "") + "</div><p>" + esc(k.text) + "</p></div></li>").join("") + "</ul>" +
      '<form class="pj-kommentar-form" data-pj-form="kommentar"><textarea name="text" rows="2" placeholder="Kommentar schreiben … (Strg+Enter)" data-fokus="kommentar" maxlength="4000"></textarea><button class="btn" type="submit">Kommentieren</button></form></div>' +
    '<div class="pj-detail-fuss"><span class="leise klein">Angelegt von ' + esc(person(a.erstellt_von).name) + " am " + esc(zeitpunkt(a.erstellt_am)) + "</span>" +
      '<button class="mini gefahr" data-pj="aufgabe-weg">Aufgabe löschen</button></div>' +
    "</div></aside>";
}

function seiteProjekt(rest) {
  const [id, ansicht] = rest.split("/");
  if (!P.start) { if (!P.fehler) ladeStart().then(neuZeichnen); return { html: leerOderLaden() }; }
  if (!P.start.ich) { location.hash = "#/projekte"; return { html: "" }; }
  const p = P.projekte.get(id);
  if (!p) { if (!P.fehler) ladeProjekt(id).then(neuZeichnen); return { html: leerOderLaden() }; }
  if (p.fehler) return { html: '<div class="pj-leer"><h2>Projekt nicht verfügbar</h2><p>' + esc(p.fehler) + '</p><a class="btn" href="#/projekte">Zu allen Projekten</a></div>' };
  const liste = ansicht === "liste";
  const ich = P.start.ich;
  const offen = p.aufgaben.filter((a) => !p.spalten.find((s) => s.id === a.spalte && s.erledigt)).length;
  const html = '<div class="pj-seite' + (P.offen && P.offen.projekt === p.id ? " mit-detail" : "") + '" style="--farbe:' + window.odinFarbeOk(p.farbe) + '">' +
    '<div class="pj-haupt">' +
    '<div class="kopf pj-kopf"><div><p class="pj-krumen"><a href="#/projekte">Projekte</a> /</p><h1><span class="pj-punkt gross"></span>' + esc(p.name) + "</h1>" +
      (p.beschreibung ? "<p>" + esc(p.beschreibung) + "</p>" : "") +
      (p.quartalsziel ? '<p class="pj-ziel-zeile">' + zielChip(p, true) + (p.ziel_definition ? '<span class="leise">Erledigt heißt: ' + esc(p.ziel_definition) + "</span>" : "") + "</p>" : "") + "</div>" +
      '<div class="kopf-aktionen"><button class="pj-mitglieder" data-pj="mitglieder" title="Mitglieder verwalten">' + avatare(p.mitglieder, 5) + "<span>" + p.mitglieder.length + " Mitglied" + (p.mitglieder.length === 1 ? "" : "er") + "</span></button>" +
      (p.besitzer === ich ? '<button class="btn" data-pj="projekt-bearbeiten">Bearbeiten</button>' : '<button class="btn" data-pj="projekt-bearbeiten">Details</button>') + "</div></div>" +
    '<div class="pj-werkzeuge">' +
      '<div class="pj-segment" role="tablist"><a role="tab" href="#/projekt/' + esc(p.id) + '" aria-selected="' + !liste + '">' + ic("board") + 'Board</a><a role="tab" href="#/projekt/' + esc(p.id) + '/liste" aria-selected="' + liste + '">' + ic("liste") + "Liste</a></div>" +
      '<label class="pj-suche">' + '<svg class="ic" aria-hidden="true"><use href="#i-search"/></svg><input type="search" placeholder="Aufgaben suchen" value="' + esc(P.suche) + '" data-pj-eingabe="suche" data-fokus="suche"></label>' +
      '<button class="pj-filter' + (P.nurMeine ? " an" : "") + '" data-pj="nur-meine" aria-pressed="' + P.nurMeine + '">Nur meine</button>' +
      '<span class="leise klein pj-zaehler">' + offen + " offen · " + (p.aufgaben.length - offen) + " erledigt</span>" +
    "</div>" +
    (liste ? listeHtml(p) : boardHtml(p)) +
    "</div>" + detailHtml(p) + "</div>";
  return { html, nach: () => projektNach(p) };
}

/* ------------------------------------------------------------ Seite: Meine Aufgaben */
function seiteAufgaben() {
  if (!P.start) { if (!P.fehler) ladeStart().then(neuZeichnen); return { html: leerOderLaden() }; }
  if (P.fehler) return { html: leerOderLaden() };
  if (!P.start.ich) return { html: werBistDu() };
  if (!P.meine) { if (!P.fehler) ladeStart().then(neuZeichnen); return { html: leerOderLaden() }; }
  const t = heute();
  const inWoche = new Date(Date.now() + 7 * 864e5).toISOString().slice(0, 10);
  const gruppen = [
    ["Überfällig", (a) => a.faellig && a.faellig < t, "krit"],
    ["Heute", (a) => a.faellig === t, "warn"],
    ["Nächste 7 Tage", (a) => a.faellig && a.faellig > t && a.faellig <= inWoche, ""],
    ["Später", (a) => a.faellig && a.faellig > inWoche, ""],
    ["Ohne Datum", (a) => !a.faellig, ""],
  ];
  const zeile = (a) => '<li class="pj-meine-zeile">' +
    '<button class="pj-haken" data-pj="meine-haken" data-projekt="' + esc(a.projekt_id) + '" data-id="' + esc(a.id) + '" title="Erledigt" aria-label="Erledigt">' + ic("aufgaben") + "</button>" +
    '<a href="#/projekt/' + esc(a.projekt_id) + '" data-pj-oeffnen="' + esc(a.id) + '" data-projekt="' + esc(a.projekt_id) + '" class="pj-meine-titel">' + esc(a.titel) + "</a>" +
    '<span class="pj-chip pj-projekt-chip" style="--farbe:' + window.odinFarbeOk(a.projekt_farbe || "#888") + '"><span class="pj-punkt"></span>' + esc(a.projekt) + "</span>" +
    '<span class="leise klein">' + esc(a.spalte_name) + "</span>" + prioChip(a.prioritaet) + faelligChip(a.faellig, false) + "</li>";
  const html = '<div class="kopf"><div><h1>Meine Aufgaben</h1><p>Alles, wofür du zuständig bist – aus allen Projekten.</p></div></div>' +
    (P.meine.length ? gruppen.map(([titel, test, art]) => {
      const liste = P.meine.filter(test);
      return liste.length ? '<section class="karte pj-meine"><div class="pj-liste-kopf"><b class="' + art + '">' + titel + '</b><span class="pj-anzahl">' + liste.length + '</span></div><ul>' + liste.map(zeile).join("") + "</ul></section>" : "";
    }).join("") : '<div class="pj-leer"><h2>Nichts offen</h2><p>Dir ist gerade keine offene Aufgabe zugewiesen.</p><a class="btn" href="#/projekte">Zu den Projekten</a></div>');
  return { html };
}

/* ------------------------------------------------------------ Board: Ziehen und Ablegen */
let gezogen = null;
function projektNach(p) {
  const inhalt = document.getElementById("inhalt");
  inhalt.querySelectorAll(".pj-aufgabe").forEach((k) => {
    k.addEventListener("dragstart", (ev) => {
      gezogen = k.dataset.aufgabe;
      ev.dataTransfer.effectAllowed = "move";
      ev.dataTransfer.setData("text/plain", gezogen);
      requestAnimationFrame(() => k.classList.add("zieht"));
    });
    k.addEventListener("dragend", () => { k.classList.remove("zieht"); gezogen = null; markierungWeg(); });
  });
  inhalt.querySelectorAll(".pj-spalte").forEach((spalte) => {
    spalte.addEventListener("dragover", (ev) => {
      if (!gezogen) return;
      ev.preventDefault();
      ev.dataTransfer.dropEffect = "move";
      markierungWeg();
      const vor = vorKarte(spalte, ev.clientY);
      spalte.classList.add("ziel");
      if (vor) vor.classList.add("einfuegen-vor"); else spalte.classList.add("einfuegen-ende");
    });
    spalte.addEventListener("dragleave", (ev) => { if (!spalte.contains(ev.relatedTarget)) { spalte.classList.remove("ziel", "einfuegen-ende"); } });
    spalte.addEventListener("drop", (ev) => {
      if (!gezogen) return;
      ev.preventDefault();
      const vor = vorKarte(spalte, ev.clientY);
      const id = gezogen;
      markierungWeg();
      if (vor && vor.dataset.aufgabe === id) return;
      verschiebeLokal(p, id, spalte.dataset.spalte, vor ? vor.dataset.aufgabe : null);
      aendern("aufgabe_verschieben", p.id, id, spalte.dataset.spalte, vor ? vor.dataset.aufgabe : null);
    });
  });
  const titel = inhalt.querySelector(".pj-detail-titel");
  if (titel) groesse(titel);
  const schnell = inhalt.querySelector('.pj-schnell textarea');
  if (schnell && document.activeElement !== schnell) schnell.focus();
}

function vorKarte(spalte, y) {
  return [...spalte.querySelectorAll(".pj-aufgabe:not(.zieht)")].find((k) => { const r = k.getBoundingClientRect(); return y < r.top + r.height / 2; }) || null;
}
function markierungWeg() {
  document.querySelectorAll(".einfuegen-vor").forEach((x) => x.classList.remove("einfuegen-vor"));
  document.querySelectorAll(".pj-spalte.ziel, .pj-spalte.einfuegen-ende").forEach((x) => x.classList.remove("ziel", "einfuegen-ende"));
}
/* Sofort umsortieren, damit nichts zurückspringt; die Antwort von ODIN ersetzt es gleich darauf */
function verschiebeLokal(p, id, spalte, vorId) {
  const a = p.aufgaben.find((x) => x.id === id);
  if (!a) return;
  const andere = p.aufgaben.filter((x) => x.spalte === spalte && x.id !== id).sort((x, y) => x.position - y.position);
  const i = vorId ? andere.findIndex((x) => x.id === vorId) : -1;
  a.spalte = spalte;
  a.position = i < 0 ? (andere.length ? andere[andere.length - 1].position + 1024 : 1024) : (i > 0 ? (andere[i - 1].position + andere[i].position) / 2 : andere[i].position - 512);
}

const groesse = (t) => { t.style.height = "auto"; t.style.height = t.scrollHeight + "px"; };

/* ------------------------------------------------------------ Dialoge */
function dialog(html, beimAbsenden) {
  const d = document.createElement("dialog");
  d.className = "dialog pj-dialog";
  d.innerHTML = html;
  document.body.appendChild(d);
  d.addEventListener("close", () => d.remove());
  d.addEventListener("click", (ev) => { if (ev.target === d) d.close(); if (ev.target.closest("[data-schliessen]")) d.close(); });
  const form = d.querySelector("form");
  if (form && beimAbsenden) form.addEventListener("submit", async (ev) => {
    ev.preventDefault();
    const knopf = form.querySelector('button[type="submit"]');
    if (knopf) knopf.disabled = true;
    try { if (await beimAbsenden(new FormData(form), d) !== false) d.close(); }
    finally { if (knopf) knopf.disabled = false; }
  });
  d.showModal();
  const erstes = d.querySelector("input, textarea");
  if (erstes) erstes.focus();
  return d;
}

const farbWahl = (aktiv) => '<div class="pj-farben">' + P.start.farben.map((f, i) => '<label class="pj-farbe" style="--farbe:' + window.odinFarbeOk(f) + '"><input type="radio" name="farbe" value="' + esc(f) + '"' + ((aktiv ? f === aktiv : i === 0) ? " checked" : "") + '><span></span></label>').join("") + "</div>";

function dialogProjektNeu() {
  const ich = P.start.ich;
  const andere = P.start.personen.filter((x) => x.id !== ich);
  dialog('<form method="dialog"><div class="dialog-kopf"><h2>Neues Projekt</h2><p>Du bist automatisch dabei. Weitere Personen kannst du jederzeit dazuholen.</p></div>' +
    '<label class="feld"><span class="feld-label">Name</span><input name="name" required maxlength="80" placeholder="z. B. Hausmesse 2027"></label>' +
    '<label class="feld"><span class="feld-label">Beschreibung</span><textarea name="beschreibung" rows="3" maxlength="2000" placeholder="Worum geht es, bis wann?"></textarea></label>' +
    '<div class="feld"><span class="feld-label">Farbe</span>' + farbWahl() + "</div>" +
    (andere.length ? '<div class="feld"><span class="feld-label">Mitglieder</span><div class="pj-auswahl">' + andere.map((x) => '<label class="pj-person-chip"><input type="checkbox" name="mitglieder" value="' + esc(x.id) + '">' + avatar(x.id) + esc(x.name) + "</label>").join("") + "</div></div>" : "") +
    '<div class="gruppe dialog-fuss"><button class="knopf" type="button" data-schliessen>Abbrechen</button><button class="knopf primaer" type="submit">Projekt anlegen</button></div></form>',
  async (fd) => {
    try {
      const p = await ruf("projekt_anlegen", { name: fd.get("name"), beschreibung: fd.get("beschreibung"), farbe: fd.get("farbe"), mitglieder: fd.getAll("mitglieder") });
      P.projekte.set(p.id, p);
      await ladeStart();
      location.hash = "#/projekt/" + p.id;
      meldung("Projekt „" + p.name + "“ angelegt.");
    } catch (e) { meldung(String(e.message || e), true); return false; }
  });
}

function dialogProjektBearbeiten(p) {
  const besitzer = p.besitzer === P.start.ich;
  const verlauf = (p.verlauf || []).slice(-12).reverse();
  dialog('<form method="dialog"><div class="dialog-kopf"><h2>' + (besitzer ? "Projekt bearbeiten" : "Projekt") + "</h2><p>Angelegt von " + esc(person(p.besitzer).name) + " am " + esc(zeitpunkt(p.erstellt_am)) + "</p></div>" +
    '<label class="feld"><span class="feld-label">Name</span><input name="name" required maxlength="80" value="' + esc(p.name) + '"></label>' +
    '<label class="feld"><span class="feld-label">Beschreibung</span><textarea name="beschreibung" rows="3" maxlength="2000">' + esc(p.beschreibung || "") + "</textarea></label>" +
    '<div class="feld"><span class="feld-label">Farbe</span>' + farbWahl(p.farbe) + "</div>" +
    zielFelder(p) +
    (verlauf.length ? '<details class="pj-verlauf"><summary>Verlauf</summary><ul>' + verlauf.map((v) => "<li>" + avatar(v.von) + "<span><b>" + esc(person(v.von).name) + "</b> " + esc(v.text) + ' <span class="leise">' + esc(zeitpunkt(v.am)) + "</span></span></li>").join("") + "</ul></details>" : "") +
    '<div class="gruppe dialog-fuss">' + (besitzer ? '<button class="knopf leise" type="button" data-aktion-pj="archivieren">' + (p.archiviert ? "Wieder aktivieren" : "Archivieren") + '</button><button class="knopf leise gefahr" type="button" data-aktion-pj="loeschen">Löschen</button>' :
      '<button class="knopf leise" type="button" data-aktion-pj="verlassen">Projekt verlassen</button>') +
    '<span class="rechts"></span><button class="knopf" type="button" data-schliessen>Abbrechen</button><button class="knopf primaer" type="submit">Speichern</button></div></form>',
  async (fd) => {
    const felder = { name: fd.get("name"), beschreibung: fd.get("beschreibung"), farbe: fd.get("farbe"), quartalsziel: fd.get("quartalsziel") || "" };
    if (felder.quartalsziel) {
      felder.ziel_definition = fd.get("ziel_definition") || "";
      if (fd.get("ziel_status")) felder.ziel_status = fd.get("ziel_status");
    }
    const r = await aendern("projekt_aendern", p.id, felder);
    if (!r) return false;
    window.dispatchEvent(new Event("odin-ziele-geaendert"));        // Quartalsziele-Seite lädt dann frisch
  });
  const d = document.querySelector("dialog.pj-dialog[open]");
  zielFelderAktivieren(d, p);
  d.querySelectorAll("[data-aktion-pj]").forEach((b) => b.addEventListener("click", async () => {
    const art = b.dataset.aktionPj;
    if (art === "archivieren") { if (await aendern("projekt_aendern", p.id, { archiviert: !p.archiviert })) { d.close(); location.hash = "#/projekte"; } }
    if (art === "loeschen") {
      if (!confirm("Projekt „" + p.name + "“ mit allen " + p.aufgaben.length + " Aufgaben endgültig löschen?")) return;
      try { await ruf("projekt_loeschen", p.id); P.projekte.delete(p.id); d.close(); await ladeStart(); location.hash = "#/projekte"; meldung("Projekt gelöscht."); }
      catch (e) { meldung(String(e.message || e), true); }
    }
    if (art === "verlassen") {
      if (!confirm("Projekt „" + p.name + "“ verlassen? Du siehst es danach nicht mehr.")) return;
      try { await ruf("mitglied_entfernen", p.id, P.start.ich); P.projekte.delete(p.id); d.close(); await ladeStart(); location.hash = "#/projekte"; }
      catch (e) { meldung(String(e.message || e), true); }
    }
  }));
}

/* Quartalsziel im Bearbeiten-Dialog: Quartal, Status (laufend: auf Kurs / nicht auf Kurs / erledigt,
   nach Quartalsende: erledigt / nicht erledigt) und „Erledigt heißt …“ */
function zielFelder(p) {
  const jetzt = quartalVon(lokalHeute());
  const quartale = [...new Set([jetzt, quartalPlus(jetzt, 1), quartalPlus(jetzt, 2)].concat(p.quartalsziel ? [p.quartalsziel] : []))].sort();
  return '<div class="feld pj-ziel-feld"><span class="feld-label">Quartalsziel</span>' +
    '<div class="pj-ziel-wahl"><select name="quartalsziel" aria-label="Quartal"><option value="">kein Quartalsziel</option>' +
      quartale.map((q) => '<option value="' + q + '"' + (q === p.quartalsziel ? " selected" : "") + ">" + quartalName(q) + (q === jetzt ? " (laufend)" : quartalVorbei(q) ? " (vorbei)" : "") + "</option>").join("") + "</select>" +
      '<div class="pj-auswahl pj-ziel-status" role="radiogroup" aria-label="Status"></div></div>' +
    '<textarea name="ziel_definition" rows="2" maxlength="500" placeholder="Erledigt heißt … (woran man am Quartalsende eindeutig sieht, dass es geschafft ist)">' + esc(p.ziel_definition || "") + "</textarea>" +
    '<span class="feld-hilfe">Verantwortlich ist, wer das Projekt angelegt hat. 3–7 Ziele je Quartal – Übersicht unter „Quartalsziele“.</span></div>';
}

function zielFelderAktivieren(d, p) {
  const wahl = d.querySelector('select[name="quartalsziel"]'), box = d.querySelector(".pj-ziel-status"), text = d.querySelector('textarea[name="ziel_definition"]');
  if (!wahl) return;
  const zeichne = () => {
    const q = wahl.value, aktuell = q === p.quartalsziel ? p.ziel_status : null;
    const moeglich = !q ? [] : quartalVorbei(q) ? ["erledigt", "nicht erledigt"] : ["auf Kurs", "nicht auf Kurs", "erledigt"];
    box.innerHTML = moeglich.map((s) => '<label class="pj-person-chip"><input type="radio" name="ziel_status" value="' + s + '"' + (s === aktuell ? " checked" : "") + ">" + s + "</label>").join("");
    text.hidden = !q;
  };
  wahl.addEventListener("change", zeichne);
  zeichne();
}

function dialogMitglieder(p) {
  const zeichneInhalt = (d) => {
    const projekt = P.projekte.get(p.id) || p;
    const ich = P.start.ich, besitzer = projekt.besitzer === ich;
    const nicht = P.start.personen.filter((x) => !projekt.mitglieder.includes(x.id));
    d.querySelector(".pj-mitglieder-inhalt").innerHTML =
      '<ul class="pj-personen">' + projekt.mitglieder.map((m) => "<li>" + avatar(m, true) + "<span><b>" + esc(person(m).name) + "</b>" + (m === projekt.besitzer ? '<span class="leise">hat das Projekt angelegt</span>' : '<span class="leise">Mitglied</span>') + "</span>" +
        (m !== projekt.besitzer && (besitzer || m === ich) ? '<button class="knopf leise" type="button" data-weg="' + esc(m) + '">' + (m === ich ? "Verlassen" : "Entfernen") + "</button>" : "") + "</li>").join("") + "</ul>" +
      (nicht.length ? '<div class="feld"><span class="feld-label">Dazuholen</span><div class="pj-auswahl">' + nicht.map((x) => '<button type="button" class="pj-person-chip" data-dazu="' + esc(x.id) + '">' + avatar(x.id) + esc(x.name) + " " + ic("plus") + "</button>").join("") + "</div></div>" : "");
  };
  const d = dialog('<form method="dialog"><div class="dialog-kopf"><h2>Mitglieder</h2><p>Nur Mitglieder sehen „' + esc(p.name) + '“. Jeder darf Personen dazuholen; entfernen darf, wer das Projekt angelegt hat.</p></div>' +
    '<div class="pj-mitglieder-inhalt"></div>' +
    '<div class="feld"><span class="feld-label">Neue Person anlegen</span><div class="pj-zeile-form"><input name="neu" maxlength="60" placeholder="Vor- und Nachname" autocomplete="off"><button class="knopf" type="submit">Anlegen und dazuholen</button></div><span class="feld-hilfe">Personen gelten für alle Projekte. Wer neu ist, legt beim ersten Anmelden seine PIN fest.</span></div>' +
    '<div class="gruppe dialog-fuss"><span class="rechts"></span><button class="knopf primaer" type="button" data-schliessen>Fertig</button></div></form>',
  async (fd, dlg) => {
    const name = String(fd.get("neu") || "").trim();
    if (!name) return false;
    try {
      const neu = await ruf("person_anlegen", { name });
      await ladeStart();
      await aendern("mitglied_hinzufuegen", p.id, neu.id);
      dlg.querySelector('input[name="neu"]').value = "";
      zeichneInhalt(dlg);
    } catch (e) { meldung(String(e.message || e), true); }
    return false;
  });
  zeichneInhalt(d);
  d.addEventListener("click", async (ev) => {
    const dazu = ev.target.closest("[data-dazu]"), weg = ev.target.closest("[data-weg]");
    if (dazu) { await aendern("mitglied_hinzufuegen", p.id, dazu.dataset.dazu); zeichneInhalt(d); }
    if (weg) {
      const selbst = weg.dataset.weg === P.start.ich;
      if (selbst && !confirm("Projekt verlassen? Du siehst es danach nicht mehr.")) return;
      try { const r = await ruf("mitglied_entfernen", p.id, weg.dataset.weg); P.projekte.set(p.id, r); }
      catch (e) { meldung(String(e.message || e), true); return; }
      if (selbst) { P.projekte.delete(p.id); d.close(); await ladeStart(); location.hash = "#/projekte"; return; }
      zeichneInhalt(d); neuZeichnen();
    }
  });
}

function dialogSpalte(p, spalteId) {
  const s = p.spalten.find((x) => x.id === spalteId);
  const neu = !s;
  const d = dialog('<form method="dialog"><div class="dialog-kopf"><h2>' + (neu ? "Neue Spalte" : "Spalte bearbeiten") + "</h2>" +
    (s && s.erledigt ? "<p>Aufgaben in dieser Spalte gelten als erledigt.</p>" : "") + "</div>" +
    '<label class="feld"><span class="feld-label">Name</span><input name="name" required maxlength="40" value="' + esc(s ? s.name : "") + '" placeholder="z. B. Freigabe"></label>' +
    '<div class="gruppe dialog-fuss">' + (!neu && !s.erledigt ? '<button class="knopf leise gefahr" type="button" data-spalte-weg>Spalte löschen</button>' : "") +
    '<span class="rechts"></span><button class="knopf" type="button" data-schliessen>Abbrechen</button><button class="knopf primaer" type="submit">' + (neu ? "Anlegen" : "Speichern") + "</button></div></form>",
  async (fd) => { const r = neu ? await aendern("spalte_anlegen", p.id, fd.get("name")) : await aendern("spalte_umbenennen", p.id, spalteId, fd.get("name")); if (!r) return false; });
  const weg = d.querySelector("[data-spalte-weg]");
  if (weg) weg.addEventListener("click", async () => {
    const n = p.aufgaben.filter((a) => a.spalte === spalteId).length;
    if (n && !confirm("Spalte „" + s.name + "“ löschen? Ihre " + n + " Aufgabe(n) wandern in die erste Spalte.")) return;
    if (await aendern("spalte_loeschen", p.id, spalteId)) d.close();
  });
}

/* ------------------------------------------------------------ Ereignisse (einmal, per Delegation) */
const projektAusHash = () => { const t = (location.hash || "").slice(2).split("/"); return t[0] === "projekt" ? P.projekte.get(t[1]) : null; };
const istProjektSeite = () => ["projekte", "projekt", "aufgaben"].includes(aktuelleSeite());

document.addEventListener("click", async (ev) => {
  if (!istProjektSeite() || !ev.target.closest("#inhalt")) return;
  const oeffnen = ev.target.closest("[data-pj-oeffnen]");
  if (oeffnen) { P.offen = { projekt: oeffnen.dataset.projekt, aufgabe: oeffnen.dataset.pjOeffnen }; return; }   // Link wechselt die Seite
  const k = ev.target.closest("[data-pj]");
  const p = projektAusHash();
  if (!k) {
    const karte = ev.target.closest(".pj-aufgabe, .pj-tabelle tr[data-aufgabe]");
    if (karte && p) { P.offen = { projekt: p.id, aufgabe: karte.dataset.aufgabe }; neuZeichnen(); }
    return;
  }
  const art = k.dataset.pj;
  const a = p && P.offen ? p.aufgaben.find((x) => x.id === P.offen.aufgabe) : null;
  switch (art) {
    case "neu-laden": P.fehler = ""; P.start = null; neuZeichnen(); break;
    case "ich":
      try { await window.odinAnmelden(k.dataset.id); P.start = null; P.meine = null; P.projekte.clear(); window.dispatchEvent(new Event("odin-ich")); await ladeStart(); neuZeichnen(); }
      catch (e) { meldung(String(e.message || e), true); }
      break;
    case "ich-wechseln": P.start = { ...P.start, ich: "" }; neuZeichnen(); break;
    case "projekt-neu": dialogProjektNeu(); break;
    case "archiv": P.archivZeigen = !P.archivZeigen; neuZeichnen(); break;
    case "projekt-bearbeiten": if (p) dialogProjektBearbeiten(p); break;
    case "mitglieder": if (p) dialogMitglieder(p); break;
    case "nur-meine": P.nurMeine = !P.nurMeine; neuZeichnen(); break;
    case "spalte-menue": if (p) dialogSpalte(p, k.dataset.spalte); break;
    case "spalte-neu": if (p) dialogSpalte(p, null); break;
    case "schnell": P.schnell = k.dataset.spalte; neuZeichnen(); break;
    case "schnell-zu": P.schnell = null; neuZeichnen(); break;
    case "detail-zu": P.offen = null; neuZeichnen(); break;
    case "haken": {
      if (!p) break;
      const aufgabe = p.aufgaben.find((x) => x.id === k.dataset.id);
      const fertig = p.spalten.find((s) => s.id === aufgabe.spalte && s.erledigt);
      await aendern("aufgabe_erledigen", p.id, aufgabe.id, !fertig);
      break;
    }
    case "meine-haken": {
      k.disabled = true;
      try { await ruf("aufgabe_erledigen", k.dataset.projekt, k.dataset.id, true); P.projekte.delete(k.dataset.projekt); meldung("Erledigt."); }
      catch (e) { meldung(String(e.message || e), true); }
      await ladeStart(); neuZeichnen();
      break;
    }
    case "zustaendig": {
      if (!a) break;
      const liste = new Set(a.zustaendig || []);
      liste.has(k.dataset.id) ? liste.delete(k.dataset.id) : liste.add(k.dataset.id);
      await aendern("aufgabe_aendern", p.id, a.id, { zustaendig: [...liste] });
      break;
    }
    case "prio": if (a) await aendern("aufgabe_aendern", p.id, a.id, { prioritaet: k.dataset.wert }); break;
    case "punkt": if (a) await aendern("punkt_umschalten", p.id, a.id, k.dataset.id); break;
    case "punkt-weg": if (a) await aendern("punkt_loeschen", p.id, a.id, k.dataset.id); break;
    case "kommentar-weg": if (a && confirm("Kommentar löschen?")) await aendern("kommentar_loeschen", p.id, a.id, k.dataset.id); break;
    case "aufgabe-weg":
      if (a && confirm("Aufgabe „" + a.titel + "“ löschen?")) { const id = a.id; P.offen = null; await aendern("aufgabe_loeschen", p.id, id); }
      break;
  }
});

/* Felder im Detailfenster: speichern beim Verlassen bzw. bei Auswahl */
document.addEventListener("change", async (ev) => {
  const feld = ev.target.closest("#inhalt [data-feld]");
  if (!feld || !istProjektSeite()) return;
  const p = projektAusHash();
  const a = p && P.offen ? p.aufgaben.find((x) => x.id === P.offen.aufgabe) : null;
  if (!a) return;
  const name = feld.dataset.feld;
  const wert = feld.value;
  if ((a[name] || "") === wert) return;
  await aendern("aufgabe_aendern", p.id, a.id, { [name]: wert });
});

document.addEventListener("input", (ev) => {
  if (!istProjektSeite()) return;
  const t = ev.target;
  if (t.matches && t.matches(".pj-detail-titel")) groesse(t);
  if (t.dataset && t.dataset.pjEingabe === "suche") { P.suche = t.value; clearTimeout(suchTimer); suchTimer = setTimeout(neuZeichnen, 150); }
});
let suchTimer;

document.addEventListener("submit", async (ev) => {
  const form = ev.target.closest("#inhalt [data-pj-form]");
  if (!form || !istProjektSeite()) return;
  ev.preventDefault();
  const art = form.dataset.pjForm;
  const fd = new FormData(form);
  const p = projektAusHash();
  const a = p && P.offen ? p.aufgaben.find((x) => x.id === P.offen.aufgabe) : null;
  if (art === "person-ich") {
    try { const neu = await ruf("person_anlegen", { name: fd.get("name") }); await window.odinAnmelden(neu.id); P.start = null; window.dispatchEvent(new Event("odin-ich")); await ladeStart(); neuZeichnen(); meldung("Hallo " + neu.name.split(" ")[0] + "!"); }
    catch (e) { meldung(String(e.message || e), true); }
  }
  if (art === "schnell" && p) {
    const titel = String(fd.get("titel") || "").trim();
    if (!titel) return;
    if (await aendern("aufgabe_anlegen", p.id, { titel, spalte: form.dataset.spalte, zustaendig: P.nurMeine ? [P.start.ich] : [] })) {
      const t = document.querySelector('#inhalt .pj-schnell textarea'); if (t) { t.value = ""; t.focus(); }
    }
  }
  if (art === "punkt" && a) { const text = String(fd.get("text") || "").trim(); if (text) await aendern("punkt_anlegen", p.id, a.id, text); }
  if (art === "kommentar" && a) { const text = String(fd.get("text") || "").trim(); if (text) await aendern("kommentar_anlegen", p.id, a.id, text); }
});

document.addEventListener("keydown", (ev) => {
  if (!istProjektSeite() || document.querySelector("dialog[open]")) return;
  const t = ev.target;
  if (t.matches && t.matches(".pj-schnell textarea") && ev.key === "Enter" && !ev.shiftKey) { ev.preventDefault(); t.form.requestSubmit(); return; }
  if (t.matches && t.matches(".pj-schnell textarea") && ev.key === "Escape") { P.schnell = null; neuZeichnen(); return; }
  if (t.matches && t.matches(".pj-detail-titel") && ev.key === "Enter") { ev.preventDefault(); t.blur(); return; }
  if (t.matches && t.matches(".pj-kommentar-form textarea") && ev.key === "Enter" && (ev.ctrlKey || ev.metaKey)) { ev.preventDefault(); t.form.requestSubmit(); return; }
  if (ev.key === "Escape" && P.offen) { P.offen = null; neuZeichnen(); return; }
  if (ev.key === "Enter" && t.matches && t.matches(".pj-aufgabe")) { const p = projektAusHash(); if (p) { P.offen = { projekt: p.id, aufgabe: t.dataset.aufgabe }; neuZeichnen(); } }
}, true);

let groesseTimer;
addEventListener("resize", () => { clearTimeout(groesseTimer); groesseTimer = setTimeout(seitenleiste, 150); });
addEventListener("odin-ich-urlaub", () => { P.start = null; P.meine = null; P.projekte.clear(); ladeStart(); });
// Quartalsziele oder Aufgaben aus Besprechungen wurden anderswo geändert: beim nächsten Zeichnen frisch
addEventListener("odin-projekte-geaendert", () => { P.projekte.clear(); ladeStart(); });

/* Zurück ins Fenster: Änderungen anderer Rechner holen (höchstens alle 20 Sekunden) */
let zuletzt = 0;
addEventListener("focus", async () => {
  if (Date.now() - zuletzt < 20000 || !P.start) return;
  zuletzt = Date.now();
  await ladeStart();
  const p = projektAusHash();
  if (p && p.id) await ladeProjekt(p.id);
  if (istProjektSeite() && !document.querySelector("dialog[open]") && !(document.activeElement && document.activeElement.closest && document.activeElement.closest("#inhalt textarea, #inhalt input"))) neuZeichnen();
});
addEventListener("hashchange", () => {
  const t = (location.hash || "").slice(2).split("/");
  if (!(t[0] === "projekt" && P.offen && P.offen.projekt === t[1])) P.offen = null;   // Detail nur im eigenen Projekt
  P.schnell = null;
  if (t[0] === "projekt" && t[1]) ladeProjekt(t[1]).then(() => { if (aktuelleSeite() === "projekt") neuZeichnen(); });
  seitenleiste();
});

/* ------------------------------------------------------------ Anmelden bei der Navigation */
window.ODIN_SEITEN = window.ODIN_SEITEN || {};
window.ODIN_SEITEN.projekte = { render: seiteProjekte, menue: () => "projekte" };
window.ODIN_SEITEN.projekt = { render: seiteProjekt, menue: (rest) => "projekt-" + rest.split("/")[0] };
window.ODIN_SEITEN.aufgaben = { render: seiteAufgaben, menue: () => "aufgaben" };
if (istProjektSeite() && typeof window.cockpitZeichne === "function") window.cockpitZeichne();

function start() { ladeStart().then(() => { if (istProjektSeite()) neuZeichnen(); }); }
if (window.pywebview && window.pywebview.api) start(); else addEventListener("pywebviewready", start, { once: true });
})();
