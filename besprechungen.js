/* ODIN · Führung: Besprechungen & Protokolle, Beschluss-Log, Quartalsziele
   Wochenrunde nach EOS „Level 10“ (90 Minuten, feste Reihenfolge), Gespräche und Termine mit Notizen je Abschnitt,
   Themen (Top 3 zuerst), Beschlüssen mit Grund, Aufgaben (echte Aufgaben in den Projekten) und Bewertung 1–10.
   Daten: tirge_helfer/besprechungen.py (Ablage im Ordner „Fahrzeuge“ unter _ODIN/Besprechungen), Quartalsziele aus
   tirge_helfer/projekte.py. Seiten: #/besprechungen, #/besprechung/<id>, #/beschluesse, #/ziele –
   eingehängt über window.ODIN_SEITEN (cockpit.js). */
(() => {
"use strict";

const B = {
  start: null,            // {ich, personen, arten, vorlage, besprechungen, projekte, sammelprojekt, heute, quartal, speicher}
  aktuell: new Map(),     // Besprechungs-ID -> Ansicht (mit Aufgabenstand, Zielen, Vorwoche)
  fehler: "",
  art: "",                // Filter der Liste
  suche: "",
  log: null,              // Beschluss-Log
  logSuche: "", logStatus: "",
  ziele: null,            // Antwort von projekte.ziele()
  quartal: null,          // gewähltes Quartal auf #/ziele
  loesen: null,           // {thema, art: "aufgabe"|"beschluss"} – offenes Formular unter einem Thema
  geloesteZeigen: false,
};

const SEITEN = ["besprechungen", "besprechung", "beschluesse", "ziele"];
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const ic = (n) => '<svg class="ic" aria-hidden="true"><use href="#ci-' + n + '"/></svg>';
const zwei = (n) => String(n).padStart(2, "0");
const isoLokal = (d) => d.getFullYear() + "-" + zwei(d.getMonth() + 1) + "-" + zwei(d.getDate());
const heute = () => isoLokal(new Date());
const plusTage = (n) => { const d = new Date(); d.setDate(d.getDate() + n); return isoLokal(d); };
const datum = (iso) => { if (!iso) return ""; const [j, m, t] = String(iso).slice(0, 10).split("-"); return t + "." + m + "." + j; };
const kurz = (iso) => { if (!iso) return ""; const [j, m, t] = String(iso).slice(0, 10).split("-"); return t + "." + m + "." + (j === heute().slice(0, 4) ? "" : j.slice(2)); };
const wochentag = (iso) => new Date(iso + "T12:00:00").toLocaleDateString("de-DE", { weekday: "short" });
const monat = (iso) => new Date(iso + "T12:00:00").toLocaleDateString("de-DE", { month: "long", year: "numeric" });
const zahl = (n) => String(n).replace(".", ",");
const quartalName = (q) => q ? "Q" + q.slice(-1) + " " + q.slice(0, 4) : "";
const meldung = (text, fehler) => { if (typeof zeigeMeldung === "function") zeigeMeldung(text, fehler ? "x" : "check", !!fehler); };
const aktuelleSeite = () => (location.hash || "").slice(2).split("/")[0];
const istMeineSeite = () => SEITEN.includes(aktuelleSeite());
const idAusHash = () => { try { return decodeURIComponent((location.hash || "").slice(2).split("/")[1] || ""); } catch (e) { return ""; } };

/* ------------------------------------------------------------ Schnittstelle
   Ändernde Aufrufe laufen nacheinander: pywebview ruft parallel in eigenen Threads auf, und zwei Änderungen an
   derselben Datei dürfen sich nicht überholen. */
const LESEN = new Set(["start", "liste", "besprechung", "beschluesse", "ziele", "projekt"]);
let kette = Promise.resolve();
function aufruf(bereich, aktion, args) {
  const los = async () => {
    if (!window.pywebview || !window.pywebview.api) throw new Error("Programm-Schnittstelle nicht bereit");
    const r = await window.pywebview.api[bereich](aktion, args);
    if (!r || !r.ok) throw new Error((r && r.fehler) || "Unbekannter Fehler");
    // „ok“, aber ohne Inhalt: als Fehler behandeln – sonst lädt die Seite beim Neuzeichnen endlos nach
    if ((r.daten === null || r.daten === undefined) && /^(start|ziele|beschluesse|besprechung|liste)$/.test(aktion)) throw new Error("Keine Daten erhalten – bitte nochmal versuchen.");
    return r.daten;
  };
  if (LESEN.has(aktion)) return los();
  const weiter = kette.then(los, los);
  kette = weiter.catch(() => null);
  return weiter;
}
const ruf = (aktion, ...args) => aufruf("besprechungen_aufruf", aktion, args);
const rufP = (aktion, ...args) => aufruf("projekte_aufruf", aktion, args);

/* ------------------------------------------------------------ Laden */
let startLaeuft = null;
function ladeStart() {
  if (startLaeuft) return startLaeuft;
  startLaeuft = ruf("start")
    .then((s) => { B.start = s; B.fehler = ""; })
    .catch((e) => { B.fehler = String(e.message || e); })
    .finally(() => { startLaeuft = null; });
  return startLaeuft;
}

const laufend = new Map();
function einmal(schluessel, holen) {          // läuft das Laden schon, dasselbe Versprechen – nie sofort zurück
  if (laufend.has(schluessel)) return laufend.get(schluessel);
  const p = holen().finally(() => laufend.delete(schluessel));
  laufend.set(schluessel, p);
  return p;
}
const ladeBesprechung = (id) => einmal("b:" + id, () => ruf("besprechung", id)
  .then((b) => { B.aktuell.set(id, b); })
  .catch((e) => { B.aktuell.set(id, { fehler: String(e.message || e) }); }));
const ladeLog = () => einmal("log", () => ruf("beschluesse").then((l) => { B.log = l; }).catch((e) => { B.log = { fehler: String(e.message || e) }; }));
const ladeZiele = () => einmal("ziele", () => rufP("ziele", B.quartal).then((z) => { B.ziele = z; B.quartal = z.quartal; })
  .catch((e) => { B.ziele = { fehler: String(e.message || e) }; }));

function nachLaden(versprechen) { versprechen.then(() => { if (istMeineSeite()) neuZeichnen(); }); }

/* Neu zeichnen: Scrollstand, Fokus mit Schreibmarke und noch nicht gespeicherte Eingaben bleiben erhalten */
function neuZeichnen() {
  const inhalt = document.getElementById("inhalt");
  if (!inhalt || typeof window.cockpitZeichne !== "function") return;
  const aktiv = document.activeElement;
  const fokus = aktiv && aktiv.closest && aktiv.closest("#inhalt") && aktiv.dataset ? aktiv.dataset.fokus : null;
  let marke = null;
  try { if (fokus && typeof aktiv.selectionStart === "number") marke = [aktiv.selectionStart, aktiv.selectionEnd]; } catch (e) { marke = null; }
  const entwuerfe = [...inhalt.querySelectorAll("input[data-fokus], textarea[data-fokus]")]
    .filter((el) => el.type !== "checkbox" && el.type !== "radio" && el.value !== el.defaultValue).map((el) => [el.dataset.fokus, el.value]);
  const oben = inhalt.scrollTop;
  window.cockpitZeichne();
  inhalt.scrollTop = oben;
  for (const [k, v] of entwuerfe) { const el = inhalt.querySelector('[data-fokus="' + k + '"]'); if (el) el.value = v; }
  if (fokus) {
    const f = inhalt.querySelector('[data-fokus="' + fokus + '"]');
    if (f) { f.focus({ preventScroll: true }); try { if (marke) f.setSelectionRange(marke[0], marke[1]); } catch (e) { /* Datumsfelder kennen keine Marke */ } }
  }
}

/* Änderung an einer Besprechung: Antwort übernehmen, neu zeichnen. 'vorher' läuft nach Erfolg vor dem Zeichnen
   (z. B. Formular leeren, damit der Text nicht als Entwurf zurückkommt). */
async function aendern(aktion, args, vorher) {
  try {
    const b = await ruf(aktion, ...args);
    if (b && b.id && b.abschnitte) B.aktuell.set(b.id, b);
    if (vorher) vorher(b);
    B.start = B.start && { ...B.start, besprechungen: null };     // Liste beim nächsten Besuch frisch
    if (aktion.startsWith("aufgabe_")) projekteGeaendert();
    neuZeichnen();
    return b || true;
  } catch (e) {
    meldung(String(e.message || e), true);
    return null;
  }
}

/* Aufgaben oder Ziele liegen in den Projekten: „Meine Aufgaben“, Zähler und Projektseiten frisch laden */
const projekteGeaendert = () => window.dispatchEvent(new Event("odin-projekte-geaendert"));

/* ------------------------------------------------------------ Personen */
const person = (id) => (B.start && B.start.personen.find((p) => p.id === id)) || { id, name: "Unbekannt", kuerzel: "?", farbe: "#8A8586" };
const avatar = (id) => { const p = person(id); return '<span class="pj-avatar" style="--farbe:' + window.odinFarbeOk(p.farbe) + '" title="' + esc(p.name) + '">' + esc(p.kuerzel) + "</span>"; };
const avatare = (ids, max = 5) => '<span class="pj-avatare">' + ids.slice(0, max).map(avatar).join("") +
  (ids.length > max ? '<span class="pj-avatar mehr">+' + (ids.length - max) + "</span>" : "") + "</span>";
const vorname = (id) => person(id).name.split(" ")[0];

/* ------------------------------------------------------------ Bausteine */
function ladeAnzeige(titel) {
  if (B.fehler) return '<div class="pj-leer"><h2>' + esc(titel) + ' gerade nicht erreichbar</h2><p>' + esc(B.fehler) + '</p><button class="btn btn-primaer" data-bs="neu-laden">Nochmal versuchen</button></div>';
  return '<div class="laden" aria-label="Wird geladen"><i class="skelett" style="width:40%"></i><i class="skelett"></i><i class="skelett" style="width:70%"></i></div>';
}

function werBistDu(titel) {
  const personen = B.start.personen || [];
  return '<div class="kopf"><div><h1>' + esc(titel) + '</h1><p>Erst einmal: Wer arbeitet an diesem Rechner? (gilt auch für Projekte und Urlaub)</p></div></div>' +
    '<section class="karte pj-ich"><div class="pj-ich-inhalt">' +
    (personen.length ? '<div class="pj-ich-liste">' + personen.map((p) => '<button class="pj-ich-person" data-bs="ich" data-id="' + esc(p.id) + '">' + avatar(p.id) + "<span>" + esc(p.name) + "</span></button>").join("") + "</div>" : "") +
    '<form class="pj-zeile-form" data-bs-form="person"><input type="text" name="name" placeholder="' + (personen.length ? "Oder neu: Vor- und Nachname" : "Vor- und Nachname") +
    '" autocomplete="off" required minlength="2" maxlength="60"><button class="btn btn-primaer" type="submit">' + (personen.length ? "Anlegen" : "Los geht’s") + "</button></form>" +
    '<p class="klein">Nach der Auswahl fragt ODIN im Tresor nach deiner PIN (beim ersten Mal legst du sie fest) – mit Microsoft angemeldet (<a href="#/konto">Konto &amp; Anmeldung</a>) geht es ohne.</p></div></section>';
}

/* Gemeinsamer Einstieg aller vier Seiten: geladen? wer bin ich? */
function vorab(titel) {
  if (B.fehler) return ladeAnzeige(titel);
  if (!B.start) { nachLaden(ladeStart()); return ladeAnzeige(titel); }
  if (!B.start.ich) return werBistDu(titel);
  return "";
}

const speicherHinweis = () => B.start && B.start.speicher.lokal ? '<div class="hinweis"><div><b>Nur auf diesem Rechner.</b> Der Ordner „Fahrzeuge“ ist nicht verbunden – andere sehen die Besprechungen erst, wenn er unter „Auftragsbestätigungen“ verbunden ist.</div></div>' : "";
const artPille = (b) => '<span class="pille bs-art art-' + esc(b.art) + '">' + esc(b.art_name) + "</span>";
const schloss = (b) => b.vertraulich ? '<span class="bs-schloss" title="Vertraulich: nur Teilnehmer und wer sie angelegt hat">' + ic("schloss") + "<span>vertraulich</span></span>" : "";
const schnittChip = (wert, ziel = 8) => wert == null ? "" : '<span class="pj-chip ' + (wert >= ziel ? "gut" : "warn") + '" title="Bewertung im Schnitt (Ziel: ' + ziel + ' oder besser)">Ø ' + zahl(wert) + "</span>";

/* ------------------------------------------------------------ Seite: Liste */
function seiteListe() {
  const v = vorab("Besprechungen");
  if (v) return { html: v };
  if (!B.start.besprechungen) { nachLaden(ladeStart()); return { html: ladeAnzeige("Besprechungen") }; }
  const alle = B.start.besprechungen;
  const s = B.suche.trim().toLowerCase();
  const liste = alle.filter((b) => (!B.art || b.art === B.art) && (!s || b.titel.toLowerCase().includes(s) || b.art_name.toLowerCase().includes(s)));
  const anzahl = (art) => alle.filter((b) => b.art === art).length;
  let gruppe = "";
  const zeilen = liste.map((b) => {
    const m = b.datum ? monat(b.datum) : "Ohne Datum";
    const kopfzeile = m !== gruppe ? (gruppe = m, '<li class="bs-monat">' + esc(m) + "</li>") : "";
    const zahlen = [b.themen_offen ? b.themen_offen + " offene" + (b.themen_offen === 1 ? "s Thema" : " Themen") : "",
      b.beschluesse ? b.beschluesse + " Beschl" + (b.beschluesse === 1 ? "uss" : "üsse") : "",
      b.aufgaben ? b.aufgaben + " Aufgabe" + (b.aufgaben === 1 ? "" : "n") : ""].filter(Boolean).join(" · ");
    return kopfzeile + '<li><a class="bs-zeile" href="#/besprechung/' + esc(b.id) + '">' +
      '<span class="bs-tag"><b>' + esc(b.datum ? b.datum.slice(8, 10) : "–") + "</b><span>" + esc(b.datum ? wochentag(b.datum) : "") + "</span></span>" +
      '<span class="bs-zeile-haupt"><span class="bs-zeile-titel">' + esc(b.titel) + "</span>" +
        '<span class="bs-zeile-meta">' + artPille(b) + schloss(b) + (zahlen ? '<span class="leise">' + esc(zahlen) + "</span>" : "") + "</span></span>" +
      '<span class="bs-zeile-rechts">' + schnittChip(b.bewertung) + avatare(b.teilnehmer, 4) + "</span></a></li>";
  }).join("");
  const html = speicherHinweis() +
    '<div class="kopf"><div><h1>Besprechungen</h1><p>Wochenrunde, Gespräche und Termine – mit Themen, Beschlüssen und Aufgaben, die direkt in den Projekten landen.</p></div>' +
    '<div class="kopf-aktionen"><a class="btn" href="#/beschluesse">' + ic("beschluss") + "Beschlüsse</a>" +
    '<button class="btn" data-bs="protokoll" title="Protokoll aus der Protokoll-App (iPad/iPhone) übernehmen">' + ic("import") + "Aus Protokoll-App</button>" +
    '<button class="btn" data-bs="neu">' + ic("plus") + "Neue Besprechung</button>" +
    '<button class="btn btn-primaer" data-bs="wochenrunde">' + ic("plus") + "Neue Wochenrunde</button></div></div>" +
    '<div class="hinweis bs-regel">' + ic("uhr") + "<div><b>Wochenrunde:</b> immer zur selben Zeit – zum Beispiel dienstags 8:00 Uhr, 90 Minuten – und alle sind dabei. Offene Themen und unerledigte Aufgaben der letzten Runde kommen automatisch mit.</div></div>" +
    '<div class="bs-werkzeuge"><div class="filter" role="group" aria-label="Art">' +
      '<button class="' + (!B.art ? "aktiv" : "") + '" data-bs="art" data-wert="" aria-pressed="' + !B.art + '">Alle <span class="bs-zahl">' + alle.length + "</span></button>" +
      B.start.arten.map((a) => '<button class="' + (B.art === a.id ? "aktiv" : "") + '" data-bs="art" data-wert="' + esc(a.id) + '" aria-pressed="' + (B.art === a.id) + '">' + esc(a.name) + ' <span class="bs-zahl">' + anzahl(a.id) + "</span></button>").join("") +
    '</div><label class="pj-suche"><svg class="ic" aria-hidden="true"><use href="#i-search"/></svg><input type="search" placeholder="Titel suchen" value="' + esc(B.suche) + '" data-bs-suche="liste" data-fokus="suche-liste"></label></div>' +
    (liste.length ? '<section class="karte bs-liste"><ul>' + zeilen + "</ul></section>"
      : alle.length ? '<div class="pj-leer klein"><p>Keine Besprechung passt zum Filter.</p></div>'
      : '<div class="pj-leer"><h2>Noch keine Besprechungen</h2><p>Am besten mit einer Wochenrunde anfangen: 90 Minuten, feste Reihenfolge – gute Nachrichten, Zahlen, Quartalsziele, Meldungen, Aufgaben, dann Themen lösen. Was entschieden wird, steht danach im Beschluss-Log; Aufgaben landen bei den Zuständigen.</p>' +
        '<div class="bs-knoepfe"><button class="btn btn-primaer" data-bs="wochenrunde">' + ic("plus") + 'Erste Wochenrunde</button><button class="btn" data-bs="neu">Andere Besprechung</button></div></div>');
  return { html };
}

/* ------------------------------------------------------------ Seite: eine Besprechung */
function projektWahl(b, auto) {
  auto = auto || (b.vertraulich ? "Automatisch: eigenes vertrauliches Projekt" : "Automatisch: „" + B.start.sammelprojekt + "“");
  return '<select name="projekt_id" aria-label="Projekt">' + '<option value="">' + esc(auto) + "</option>" +
    (B.start.projekte || []).map((p) => '<option value="' + esc(p.id) + '">' + esc(p.name) + "</option>").join("") + "</select>";
}

function personWahl(b, name = "zustaendig") {
  const drin = b.teilnehmer, rest = B.start.personen.filter((p) => !drin.includes(p.id));
  return '<select name="' + name + '" required aria-label="Verantwortlich"><option value="">Verantwortlich …</option>' +
    (drin.length ? '<optgroup label="Teilnehmer">' + drin.map((id) => '<option value="' + esc(id) + '">' + esc(person(id).name) + "</option>").join("") + "</optgroup>" : "") +
    (rest.length ? '<optgroup label="Weitere">' + rest.map((p) => '<option value="' + esc(p.id) + '">' + esc(p.name) + "</option>").join("") + "</optgroup>" : "") + "</select>";
}

function aufgabeFormular(b, themaId, titel) {
  return '<form class="bs-formular bs-aufgabe-form" data-bs-form="aufgabe"' + (themaId ? ' data-thema="' + esc(themaId) + '"' : "") + ">" +
    '<input type="text" name="titel" required maxlength="200" placeholder="Was ist zu tun?" value="' + esc(titel || "") + '" data-fokus="aufgabe-titel-' + esc(themaId || "neu") + '" autocomplete="off">' +
    '<div class="bs-formular-reihe">' + personWahl(b) +
      '<label class="bs-feld-klein"><span>fällig</span><input type="date" name="faellig" value="' + plusTage(7) + '"></label>' + projektWahl(b) + "</div>" +
    '<div class="bs-formular-fuss"><span class="klein">Genau eine verantwortliche Person – die Aufgabe steht dann bei ihr unter „Meine Aufgaben“.</span>' +
      (themaId ? '<button class="btn" type="button" data-bs="thema-zu">Abbrechen</button>' : "") + '<button class="btn' + (themaId ? " btn-primaer" : "") + '" type="submit">Aufgabe anlegen</button></div></form>';
}

function beschlussFormular(themaId, text) {
  return '<form class="bs-formular" data-bs-form="beschluss"' + (themaId ? ' data-thema="' + esc(themaId) + '"' : "") + ">" +
    '<textarea name="text" rows="2" required maxlength="2000" placeholder="Was wurde beschlossen?" data-fokus="beschluss-text-' + esc(themaId || "neu") + '">' + esc(text || "") + "</textarea>" +
    '<input type="text" name="grund" required maxlength="2000" placeholder="Warum? (Grund, Pflicht)" data-fokus="beschluss-grund-' + esc(themaId || "neu") + '" autocomplete="off">' +
    '<div class="bs-formular-fuss"><label class="bs-feld-klein"><span>Wiedervorlage</span><input type="date" name="wiedervorlage"></label>' +
      (themaId ? '<button class="btn" type="button" data-bs="thema-zu">Abbrechen</button>' : "") + '<button class="btn' + (themaId ? " btn-primaer" : "") + '" type="submit">Beschluss festhalten</button></div></form>';
}

function themenHtml(b) {
  const offen = b.themen.filter((t) => t.status !== "geloest");
  const geloest = b.themen.filter((t) => t.status === "geloest");
  const top = offen.filter((t) => t.top).length;
  const zeile = (t) => {
    const fertig = t.status === "geloest";
    const auf = B.loesen && B.loesen.thema === t.id;
    return '<li class="bs-thema' + (fertig ? " fertig" : "") + (t.top ? " top" : "") + '">' +
      '<div class="bs-thema-zeile"><button class="pj-haken' + (fertig ? " an" : "") + '" data-bs="thema-haken" data-id="' + esc(t.id) + '" aria-pressed="' + fertig + '" title="' + (fertig ? "Wieder öffnen" : "Als gelöst markieren") + '">' + ic("aufgaben") + "</button>" +
        '<span class="bs-thema-titel">' + esc(t.titel) + "</span>" +
        (t.uebernommen_aus ? '<span class="pj-chip leise" title="Aus der letzten Wochenrunde übernommen">aus Vorwoche</span>' : "") +
        (fertig ? "" : '<button class="bs-top' + (t.top ? " an" : "") + '" data-bs="thema-top" data-id="' + esc(t.id) + '" aria-pressed="' + !!t.top + '" title="' + (t.top ? "Aus den Top 3 nehmen" : "Zu den Top 3") + '">Top 3</button>' +
          '<button class="mini" data-bs="thema-loesen" data-id="' + esc(t.id) + '" data-art="aufgabe">→ Aufgabe</button>' +
          '<button class="mini" data-bs="thema-loesen" data-id="' + esc(t.id) + '" data-art="beschluss">→ Beschluss</button>') +
        '<button class="pj-icon-knopf klein" data-bs="thema-weg" data-id="' + esc(t.id) + '" title="Thema löschen" aria-label="Thema löschen">' + ic("schliessen") + "</button></div>" +
      (auf || t.notiz || !fertig ? '<textarea class="bs-thema-notiz" rows="1" maxlength="5000" placeholder="Erkennen – Besprechen: Notizen zum Thema" data-still="thema:' + esc(t.id) + '" data-fokus="thema-notiz-' + esc(t.id) + '">' + esc(t.notiz || "") + "</textarea>" : "") +
      (auf ? '<div class="bs-loesen">' + (B.loesen.art === "beschluss" ? beschlussFormular(t.id, "") : aufgabeFormular(b, t.id, t.titel)) + "</div>" : "") +
      "</li>";
  };
  return '<div class="bs-themen">' +
    '<form class="pj-zeile-form bs-thema-neu" data-bs-form="thema"><input type="text" name="titel" required maxlength="200" placeholder="Neues Thema – kurz benennen (Enter)" data-fokus="thema-neu" autocomplete="off"><button class="btn" type="submit">Thema</button></form>' +
    (offen.length ? '<p class="bs-top-zahl klein">Top 3: <b>' + top + "</b> von 3 gewählt – die wichtigsten zuerst lösen.</p>" : "") +
    '<ul class="bs-themen-liste">' + offen.map(zeile).join("") + "</ul>" +
    (!offen.length ? '<p class="bs-leer">' + (geloest.length ? "Alle Themen gelöst." : "Noch keine Themen. Was auffällt – in den Zahlen, bei Zielen, Kunden oder Mitarbeitern – wird hier ein Thema.") + "</p>" : "") +
    (geloest.length ? '<button class="mini bs-geloest-knopf" data-bs="geloeste">' + (B.geloesteZeigen ? "Gelöste ausblenden" : "Gelöst (" + geloest.length + ")") + "</button>" +
      (B.geloesteZeigen ? '<ul class="bs-themen-liste">' + geloest.map(zeile).join("") + "</ul>" : "") : "") + "</div>";
}

const BESCHLUSS_STATUS = [["gilt", "gilt"], ["beendet", "beendet"], ["geändert", "geändert"]];
function beschluesseHtml(b) {
  return '<section class="karte bs-seitenkarte"><div class="karte-kopf"><div><h2>Beschlüsse</h2><p>Was entschieden ist – mit Grund. Steht danach im <a href="#/beschluesse">Beschluss-Log</a>.</p></div></div>' +
    '<div class="bs-karten-inhalt">' + beschlussFormular(null, "") +
    (b.beschluesse.length ? '<ul class="bs-beschluesse">' + b.beschluesse.slice().reverse().map((x) =>
      '<li class="status-' + esc(x.status || "gilt") + '"><div class="bs-beschluss-text">' + esc(x.text) + "</div>" +
        '<div class="bs-beschluss-grund"><span>Grund:</span> ' + esc(x.grund || "–") + "</div>" +
        '<div class="bs-beschluss-meta">' + avatar(x.von) +
          '<select class="bs-status-wahl" data-beschluss-status="' + esc(x.id) + '" aria-label="Status">' + BESCHLUSS_STATUS.map(([w, t]) => '<option value="' + w + '"' + ((x.status || "gilt") === w ? " selected" : "") + ">" + t + "</option>").join("") + "</select>" +
          (x.wiedervorlage ? '<span class="pj-chip' + (x.wiedervorlage <= heute() && (x.status || "gilt") === "gilt" ? " warn" : "") + '" title="Wiedervorlage">' + ic("kalender") + esc(kurz(x.wiedervorlage)) + "</span>" : "") +
          '<button class="pj-icon-knopf klein" data-bs="beschluss-weg" data-id="' + esc(x.id) + '" title="Beschluss löschen" aria-label="Beschluss löschen">' + ic("schliessen") + "</button></div></li>").join("") + "</ul>"
      : '<p class="bs-leer">Noch keine Beschlüsse.</p>') + "</div></section>";
}

function faelligChip(iso, erledigt) {
  if (!iso) return '<span class="pj-chip leise">ohne Frist</span>';
  const rot = !erledigt && iso < heute(), heuteFaellig = !erledigt && iso === heute();
  return '<span class="pj-chip' + (rot ? " krit" : heuteFaellig ? " warn" : "") + '" title="Fällig am ' + esc(datum(iso)) + '">' + ic("kalender") + esc(heuteFaellig ? "heute" : kurz(iso)) + "</span>";
}

function aufgabeZeile(a, mitLoeschen) {
  const s = a.stand || {};
  const titel = s.titel || a.titel, wer = (s.zustaendig && s.zustaendig.length ? s.zustaendig : a.zustaendig) || [];
  const projekt = s.projekt ? (s.mitglied ? '<a class="pj-chip pj-projekt-chip" href="#/projekt/' + esc(a.projekt_id) + '" style="--farbe:' + window.odinFarbeOk(s.projekt_farbe || "#888") + '"><span class="pj-punkt"></span>' + esc(s.projekt) + "</a>"
    : '<span class="pj-chip pj-projekt-chip" style="--farbe:' + window.odinFarbeOk(s.projekt_farbe || "#888") + '"><span class="pj-punkt"></span>' + esc(s.projekt) + "</span>") : "";
  return '<li class="bs-aufgabe' + (a.erledigt ? " fertig" : "") + (a.geloescht ? " weg" : "") + '">' +
    (a.geloescht ? '<span class="bs-weg-marke" title="Im Projekt gelöscht">–</span>'
      : '<button class="pj-haken' + (a.erledigt ? " an" : "") + '" data-bs="aufgabe-haken" data-id="' + esc(a.id) + '" data-wert="' + !a.erledigt + '" aria-pressed="' + !!a.erledigt + '" title="' + (a.erledigt ? "Wieder öffnen" : "Erledigt") + '">' + ic("aufgaben") + "</button>") +
    '<div class="bs-aufgabe-haupt"><span class="bs-aufgabe-titel">' + esc(titel) + "</span>" +
      '<span class="bs-aufgabe-meta">' + (wer.length ? avatar(wer[0]) + '<span class="leise">' + esc(vorname(wer[0])) + "</span>" : '<span class="pj-chip warn">ohne Verantwortlichen</span>') +
        (a.geloescht ? '<span class="pj-chip leise">im Projekt gelöscht</span>' : faelligChip(s.faellig !== undefined ? s.faellig : a.faellig, a.erledigt) + projekt) +
        (a.uebernommen_aus ? '<span class="pj-chip leise">aus Vorwoche</span>' : "") + "</span>" +
      (a.hinweis ? '<span class="bs-aufgabe-hinweis">' + esc(a.hinweis) + "</span>" : "") + "</div>" +
    (mitLoeschen ? '<button class="pj-icon-knopf klein" data-bs="aufgabe-weg" data-id="' + esc(a.id) + '" title="Aufgabe löschen (auch im Projekt)" aria-label="Aufgabe löschen">' + ic("schliessen") + "</button>" : "") + "</li>";
}

function aufgabenHtml(b) {
  const offen = b.aufgaben.filter((a) => !a.erledigt).length;
  return '<section class="karte bs-seitenkarte"><div class="karte-kopf"><div><h2>Aufgaben' + (b.aufgaben.length ? ' <span class="pj-anzahl">' + offen + "</span>" : "") + "</h2>" +
    "<p>Landen als echte Aufgaben im Projekt – bei „Meine Aufgaben“ und in „Heute &amp; Woche“.</p></div></div>" +
    '<div class="bs-karten-inhalt">' + aufgabeFormular(b, null, "") +
    (b.aufgaben.length ? '<ul class="bs-aufgaben">' + b.aufgaben.map((a) => aufgabeZeile(a, true)).join("") + "</ul>" : '<p class="bs-leer">Noch keine Aufgaben.</p>') +
    "</div></section>";
}

function bewertungHtml(b) {
  const ziel = b.bewertung_ziel || 8;
  const unter = b.bewertung != null && b.bewertung < ziel;
  return '<div class="bs-bewertung">' +
    (b.teilnehmer.length ? '<ul class="bs-noten">' + b.teilnehmer.map((id) => {
      const note = (b.bewertungen || {})[id];
      return '<li><span class="bs-noten-wer">' + avatar(id) + esc(person(id).name) + '</span><div class="bs-skala" role="group" aria-label="Bewertung von ' + esc(person(id).name) + '">' +
        Array.from({ length: 10 }, (_, i) => i + 1).map((n) => '<button data-bs="note" data-person="' + esc(id) + '" data-wert="' + n + '" aria-pressed="' + (note === n) + '" class="' + (n < ziel ? "unter" : "") + '">' + n + "</button>").join("") + "</div></li>";
    }).join("") + "</ul>" : '<p class="bs-leer">Erst Teilnehmer wählen, dann bewertet jeder die Besprechung.</p>') +
    '<div class="bs-schnitt"><span>Durchschnitt</span><b class="' + (b.bewertung == null ? "" : unter ? "warn" : "gut") + '">' + (b.bewertung == null ? "–" : zahl(b.bewertung)) + '</b><span class="klein">Ziel: ' + ziel + " oder besser</span></div>" +
    (unter || b.zur_zehn ? '<label class="bs-feld"><span>' + (unter ? "Unter " + ziel + " – was würde es zur 10 machen?" : "Was würde es zur 10 machen?") + "</span>" +
      '<textarea rows="2" maxlength="4000" data-still="feld:zur_zehn" data-fokus="zur-zehn" placeholder="Konkret: pünktlich anfangen, Themen vorher sammeln …">' + esc(b.zur_zehn || "") + "</textarea></label>" : "") + "</div>";
}

function zieleHtml(b) {
  const ziele = b.ziele || [];
  const zeile = (z) => '<li class="bs-ziel-zeile">' + avatar(z.verantwortlich) +
    '<div class="bs-ziel-text"><a href="#/projekt/' + esc(z.id) + '">' + esc(z.name) + "</a>" + (z.ziel_definition ? '<span class="klein">Erledigt heißt: ' + esc(z.ziel_definition) + "</span>" : "") + "</div>" +
    '<div class="pj-segment bs-status" role="group" aria-label="Status">' + ["auf Kurs", "nicht auf Kurs"].map((s) =>
      '<button data-bs="ziel-status" data-projekt="' + esc(z.id) + '" data-wert="' + esc(s) + '" aria-pressed="' + (z.ziel_status === s) + '" class="' + (s === "auf Kurs" ? "gut" : "krit") + '">' + esc(s) + "</button>").join("") + "</div>" +
    (z.ziel_status === "erledigt" ? '<span class="pj-chip gut">erledigt</span>' : "") + "</li>";
  return '<div class="bs-eingebettet">' + (ziele.length ? '<ul class="bs-ziele-liste">' + ziele.map(zeile).join("") + "</ul>"
    : '<p class="bs-leer">Für ' + esc(quartalName(b.quartal)) + " sind noch keine Quartalsziele markiert, in denen du Mitglied bist.</p>") +
    '<a class="mini-link" href="#/ziele">Alle Quartalsziele ' + esc(quartalName(b.quartal)) + " →</a></div>";
}

function vorwocheHtml(b) {
  const v = b.vorwoche;
  if (!v) return '<div class="bs-eingebettet"><p class="bs-leer">Keine vorherige Wochenrunde – ab der nächsten stehen hier deren Aufgaben.</p></div>';
  const quote = v.anzahl ? Math.round(100 * v.erledigt / v.anzahl) : null;
  return '<div class="bs-eingebettet"><p class="bs-quote">Aus <a href="#/besprechung/' + esc(v.id) + '">' + esc(v.titel) + "</a>: <b>" + v.erledigt + " von " + v.anzahl + "</b> erledigt" +
    (quote != null ? ' <span class="pj-chip ' + (quote >= 90 ? "gut" : "warn") + '">' + quote + " %</span> <span class=\"klein\">Ziel: 90 %</span>" : "") + "</p>" +
    (v.aufgaben.length ? '<ul class="bs-aufgaben">' + v.aufgaben.map((a) => aufgabeZeile(a, false)).join("") + "</ul>" : "") + "</div>";
}

function abschnittHtml(b, a, i) {
  const eingebettet = {
    scorecard: '<div class="bs-eingebettet"><a class="btn" href="#/scorecard">' + ic("uebersicht") + "Scorecard öffnen</a></div>",
    quartalsziele: zieleHtml(b),
    aufgaben: vorwocheHtml(b),
    themen: themenHtml(b),
    abschluss: '<label class="bs-feld"><span>Was sagen wir unseren Leuten (in 24 Stunden)?</span><textarea rows="2" maxlength="4000" data-still="feld:mitteilung" data-fokus="mitteilung" placeholder="Was alle wissen müssen – und wer es wem sagt">' + esc(b.mitteilung || "") + "</textarea></label>" + bewertungHtml(b),
  }[b.art === "wochenrunde" ? a.schluessel : ""] || "";
  const eigener = !(b.art === "wochenrunde" && a.schluessel !== "eigener");
  return '<section class="karte bs-abschnitt" id="abschnitt-' + esc(a.id) + '"><div class="bs-abschnitt-kopf"><span class="bs-nr">' + (i + 1) + "</span><h2>" + esc(a.titel) + "</h2>" +
    (a.minuten ? '<span class="pj-chip" title="Geplante Zeit">' + ic("uhr") + a.minuten + " Min.</span>" : "") +
    (eigener && b.abschnitte.length > 1 ? '<button class="pj-icon-knopf klein" data-bs="abschnitt-weg" data-id="' + esc(a.id) + '" title="Abschnitt löschen" aria-label="Abschnitt löschen">' + ic("schliessen") + "</button>" : "") + "</div>" +
    (a.hilfe ? '<p class="bs-hilfe">' + esc(a.hilfe) + "</p>" : "") + eingebettet +
    '<textarea class="bs-notiz" rows="2" maxlength="20000" placeholder="Notizen" data-still="abschnitt:' + esc(a.id) + '" data-fokus="notiz-' + esc(a.id) + '" aria-label="Notizen zu ' + esc(a.titel) + '">' + esc(a.notiz || "") + "</textarea></section>";
}

function seiteBesprechung(rest) {
  const v = vorab("Besprechung");
  if (v) return { html: v };
  const id = rest;
  const b = B.aktuell.get(id);
  if (!b) { nachLaden(ladeBesprechung(id)); return { html: ladeAnzeige("Besprechung") }; }
  if (b.fehler) return { html: '<div class="pj-leer"><h2>Besprechung nicht verfügbar</h2><p>' + esc(b.fehler) + '</p><a class="btn" href="#/besprechungen">Zu allen Besprechungen</a></div>' };
  const runde = b.art === "wochenrunde";
  const teilnehmerHtml = B.start.personen.map((p) => '<button class="pj-person-chip' + (b.teilnehmer.includes(p.id) ? " an" : "") + '" data-bs="teilnehmer" data-id="' + esc(p.id) + '" aria-pressed="' + b.teilnehmer.includes(p.id) + '">' + avatar(p.id) + esc(p.name.split(" ")[0]) + "</button>").join("");
  const html = '<div class="bs-seite">' +
    '<div class="kopf bs-kopf"><div class="bs-kopf-links"><p class="pj-krumen"><a href="#/besprechungen">Besprechungen</a> /</p>' +
      '<input class="bs-titel" type="text" value="' + esc(b.titel) + '" maxlength="120" data-bs-feld="titel" data-fokus="titel" aria-label="Titel">' +
      '<div class="bs-meta">' + (runde ? artPille(b) : '<select data-bs-feld="art" aria-label="Art">' + B.start.arten.filter((a) => a.id !== "wochenrunde").map((a) => '<option value="' + esc(a.id) + '"' + (a.id === b.art ? " selected" : "") + ">" + esc(a.name) + "</option>").join("") + "</select>") +
        '<input type="date" value="' + esc(b.datum) + '" data-bs-feld="datum" aria-label="Datum">' +
        (b.darf_vertraulich ? '<label class="bs-schalter"><input type="checkbox" data-bs-feld="vertraulich"' + (b.vertraulich ? " checked" : "") + "><span>" + ic("schloss") + "vertraulich</span></label>" : schloss(b)) +
        (b.minuten ? '<span class="leise klein">' + b.minuten + " Minuten geplant</span>" : "") +
        '<span class="bs-speicher klein" id="bs-speicher" aria-live="polite"></span></div></div>' +
      '<div class="kopf-aktionen">' + (b.darf_loeschen ? '<button class="mini gefahr" data-bs="loeschen">Besprechung löschen</button>' : "") + "</div></div>" +
    '<div class="bs-teilnehmer"><span class="klein">Teilnehmer</span>' + teilnehmerHtml + "</div>" +
    (runde ? '<p class="bs-regel-text klein">' + ic("uhr") + "Feste Zeit, 90 Minuten, alle dabei. Erst Meldungen ohne Diskussion – alles, was Gespräch braucht, wird ein Thema für „Themen lösen“.</p>" : "") +
    '<div class="bs-raster"><div class="bs-haupt">' + b.abschnitte.map((a, i) => abschnittHtml(b, a, i)).join("") +
      '<button class="pj-spalte-neu bs-abschnitt-neu" data-bs="abschnitt-neu">' + ic("plus") + "Abschnitt</button>" +
      (runde ? "" : '<section class="karte bs-abschnitt"><div class="bs-abschnitt-kopf"><h2>Themen</h2></div>' + themenHtml(b) + "</section>" +
        '<section class="karte bs-abschnitt"><div class="bs-abschnitt-kopf"><h2>Bewertung</h2></div>' + bewertungHtml(b) + "</section>") +
    '</div><aside class="bs-seite-rechts">' + aufgabenHtml(b) + beschluesseHtml(b) + "</aside></div></div>";
  return { html, nach: () => { document.querySelectorAll("#inhalt textarea").forEach(groesse); } };
}

/* ------------------------------------------------------------ Seite: Beschluss-Log */
function seiteBeschluesse() {
  const v = vorab("Beschlüsse");
  if (v) return { html: v };
  if (!B.log) { nachLaden(ladeLog()); return { html: ladeAnzeige("Beschlüsse") }; }
  if (B.log.fehler) return { html: '<div class="pj-leer"><h2>Beschlüsse nicht verfügbar</h2><p>' + esc(B.log.fehler) + "</p></div>" };
  const woerter = B.logSuche.toLowerCase().split(/\s+/).filter(Boolean);
  const passt = (x) => { const t = [x.text, x.grund, x.besprechung, x.art_name, person(x.von).name, x.status].join(" ").toLowerCase(); return woerter.every((w) => t.includes(w)); };
  const liste = B.log.filter((x) => (!B.logStatus || x.status === B.logStatus) && passt(x));
  const faellig = B.log.filter((x) => x.wiedervorlage_faellig).length;
  const zeile = (x) => '<li class="bs-log-zeile status-' + esc(x.status) + (x.wiedervorlage_faellig ? " faellig" : "") + '">' +
    '<span class="bs-tag"><b>' + esc(x.datum ? x.datum.slice(8, 10) + "." + x.datum.slice(5, 7) + "." : "–") + "</b><span>" + esc(x.datum ? x.datum.slice(0, 4) : "") + "</span></span>" +
    '<div class="bs-log-haupt"><div class="bs-beschluss-text">' + esc(x.text) + "</div>" +
      '<div class="bs-beschluss-grund"><span>Grund:</span> ' + esc(x.grund || "–") + "</div>" +
      '<div class="bs-beschluss-meta">' + avatar(x.von) + '<a href="#/besprechung/' + esc(x.besprechung_id) + '">' + esc(x.besprechung) + "</a>" + artPille(x) + schloss(x) + "</div></div>" +
    '<div class="bs-log-rechts"><select class="bs-status-wahl" data-log-status="' + esc(x.id) + '" data-besprechung="' + esc(x.besprechung_id) + '" aria-label="Status">' +
      BESCHLUSS_STATUS.map(([w, t]) => '<option value="' + w + '"' + (x.status === w ? " selected" : "") + ">" + t + "</option>").join("") + "</select>" +
      '<label class="bs-feld-klein' + (x.wiedervorlage_faellig ? " faellig" : "") + '"><span>' + (x.wiedervorlage_faellig ? "Wiedervorlage fällig" : "Wiedervorlage") + "</span>" +
      '<input type="date" value="' + esc(x.wiedervorlage || "") + '" data-log-wv="' + esc(x.id) + '" data-besprechung="' + esc(x.besprechung_id) + '"></label></div></li>';
  const html = '<div class="kopf"><div><p class="pj-krumen"><a href="#/besprechungen">Besprechungen</a> /</p><h1>Beschlüsse</h1>' +
    "<p>Alle Beschlüsse aus den Besprechungen, die du sehen darfst – mit Grund und Status. Fällige Wiedervorlagen stehen oben.</p></div></div>" +
    '<div class="kacheln bs-kacheln">' +
      '<div class="kachel"><div class="titel">Beschlüsse</div><div class="wert">' + B.log.length + '</div><div class="fuss">insgesamt</div></div>' +
      '<div class="kachel"><div class="titel">Gelten</div><div class="wert">' + B.log.filter((x) => x.status === "gilt").length + '</div><div class="fuss">aktuell gültig</div></div>' +
      '<div class="kachel"><div class="titel">Wiedervorlage</div><div class="wert' + (faellig ? " warn" : "") + '">' + faellig + '</div><div class="fuss">heute oder früher fällig</div></div></div>' +
    '<div class="bs-werkzeuge"><div class="filter" role="group" aria-label="Status">' + [["", "Alle"]].concat(BESCHLUSS_STATUS).map(([w, t]) =>
      '<button class="' + (B.logStatus === w ? "aktiv" : "") + '" data-bs="log-filter" data-wert="' + w + '" aria-pressed="' + (B.logStatus === w) + '">' + t + "</button>").join("") + "</div>" +
      '<label class="pj-suche bs-suche-breit"><svg class="ic" aria-hidden="true"><use href="#i-search"/></svg><input type="search" placeholder="Suchen in Beschluss, Grund, Besprechung, Name" value="' + esc(B.logSuche) + '" data-bs-suche="log" data-fokus="suche-log"></label></div>' +
    (liste.length ? '<section class="karte bs-liste"><ul>' + liste.map(zeile).join("") + "</ul></section>"
      : '<div class="pj-leer klein"><p>' + (B.log.length ? "Kein Beschluss passt zur Suche." : "Noch keine Beschlüsse – sie entstehen in den Besprechungen.") + "</p></div>");
  return { html };
}

/* ------------------------------------------------------------ Seite: Quartalsziele */
const ZIEL_TON = { "auf Kurs": "gut", "nicht auf Kurs": "krit", erledigt: "gut", "nicht erledigt": "krit" };
function seiteZiele() {
  const v = vorab("Quartalsziele");
  if (v) return { html: v };
  if (!B.ziele) { nachLaden(ladeZiele()); return { html: ladeAnzeige("Quartalsziele") }; }
  if (B.ziele.fehler) return { html: '<div class="pj-leer"><h2>Quartalsziele nicht verfügbar</h2><p>' + esc(B.ziele.fehler) + '</p><button class="btn" data-bs="quartal" data-wert="">Nochmal versuchen</button></div>' };
  const z = B.ziele, n = z.ziele.length, [min, max] = z.empfohlen || [3, 7];
  const zaehle = (s) => z.ziele.filter((x) => x.ziel_status === s).length;
  const rahmen = n < min ? "Erst " + n + " Ziel" + (n === 1 ? "" : "e") + " – üblich sind " + min + " bis " + max + " je Quartal."
    : n > max ? n + " Ziele sind zu viele – höchstens " + max + ", sonst wird keines richtig fertig." : n + " Ziele – im Rahmen (" + min + " bis " + max + ").";
  const karte = (x) => {
    return '<article class="bs-ziel' + (x.ziel_status ? " ton-" + (ZIEL_TON[x.ziel_status] || "") : " ton-offen") + '" style="--farbe:' + window.odinFarbeOk(x.farbe) + '">' +
      '<div class="bs-ziel-kopf"><a href="#/projekt/' + esc(x.id) + '"><span class="pj-punkt"></span>' + esc(x.name) + "</a>" +
        '<button class="pj-icon-knopf klein" data-bs="ziel-weg" data-projekt="' + esc(x.id) + '" title="Nicht mehr als Quartalsziel führen" aria-label="Nicht mehr als Ziel führen">' + ic("schliessen") + "</button></div>" +
      '<div class="bs-ziel-wer">' + avatar(x.verantwortlich) + "<span>" + esc(person(x.verantwortlich).name) + '</span><span class="klein">verantwortlich</span></div>' +
      '<label class="bs-feld"><span>Erledigt heißt …</span><textarea rows="2" maxlength="500" data-still="ziel:' + esc(x.id) + '" data-fokus="ziel-' + esc(x.id) + '" placeholder="Woran man am Quartalsende eindeutig sieht, dass es geschafft ist">' + esc(x.ziel_definition || "") + "</textarea></label>" +
      '<div class="pj-segment bs-status" role="group" aria-label="Status">' + z.status.map((s) =>
        '<button data-bs="ziel-status" data-projekt="' + esc(x.id) + '" data-wert="' + esc(s) + '" aria-pressed="' + (x.ziel_status === s) + '" class="' + (ZIEL_TON[s] || "") + '">' + esc(s) + "</button>").join("") + "</div>" +
      (x.abschluss_noetig ? '<p class="bs-ziel-hinweis">Quartal vorbei: bitte „erledigt“ oder „nicht erledigt“ wählen.</p>' : "") +
      '<p class="klein bs-ziel-fuss">' + (x.aufgaben ? x.erledigt + " von " + x.aufgaben + " Aufgaben erledigt" : "Noch keine Aufgaben") + (x.ueberfaellig ? ' · <b class="krit">' + x.ueberfaellig + " überfällig</b>" : "") + "</p></article>";
  };
  const kacheln = z.vorbei
    ? [["Ziele", n, "im Quartal", ""], ["Erledigt", zaehle("erledigt"), "von " + n, "gut"], ["Nicht erledigt", zaehle("nicht erledigt"), "von " + n, zaehle("nicht erledigt") ? "krit" : ""],
       ["Zielquote", z.zielquote == null ? "–" : z.zielquote + " %", "Ziel: mindestens " + z.zielquote_soll + " %", z.zielquote == null ? "" : z.zielquote >= z.zielquote_soll ? "gut" : "krit"]]
    : [["Ziele", n, "empfohlen " + min + "–" + max, n < min || n > max ? "warn" : ""], ["Auf Kurs", zaehle("auf Kurs"), "diese Woche", "gut"],
       ["Nicht auf Kurs", zaehle("nicht auf Kurs"), "werden ein Thema", zaehle("nicht auf Kurs") ? "krit" : ""], ["Erledigt", zaehle("erledigt"), "Ziel am Ende: " + z.zielquote_soll + " %", ""]];
  const html = '<div class="kopf"><div><h1>Quartalsziele ' + esc(quartalName(z.quartal)) + "</h1>" +
    "<p>Die wichtigsten Ziele des Quartals – je Ziel ein Projekt mit einer verantwortlichen Person. Jede Woche: auf Kurs oder nicht. Am Quartalsende zählt nur erledigt oder nicht erledigt.</p></div>" +
    '<div class="kopf-aktionen"><div class="bs-quartal"><button class="btn" data-bs="quartal" data-wert="' + esc(z.vorher) + '" aria-label="Voriges Quartal">‹</button>' +
      "<span>" + esc(quartalName(z.quartal)) + (z.quartal === z.laufend ? ' <span class="klein">laufend</span>' : z.vorbei ? ' <span class="klein">vorbei</span>' : "") + "</span>" +
      '<button class="btn" data-bs="quartal" data-wert="' + esc(z.nachher) + '" aria-label="Nächstes Quartal">›</button></div>' +
      '<button class="btn" data-bs="ziel-markieren">Projekt als Ziel</button><button class="btn btn-primaer" data-bs="ziel-neu">' + ic("plus") + "Neues Ziel</button></div></div>" +
    '<div class="hinweis bs-regel">' + ic("ziele") + "<div><b>" + esc(rahmen) + "</b> Am Quartalsende sollten mindestens " + esc(z.zielquote_soll) + " % der Ziele erledigt sein." +
      (z.quartal !== z.laufend ? ' <button class="mini" data-bs="quartal" data-wert="' + esc(z.laufend) + '">zum laufenden Quartal</button>' : "") + "</div></div>" +
    '<div class="kacheln bs-kacheln">' + kacheln.map(([t, w, f, ton]) => '<div class="kachel"><div class="titel">' + esc(t) + '</div><div class="wert' + (ton ? " " + ton : "") + '">' + esc(w) + '</div><div class="fuss">' + esc(f) + "</div></div>").join("") + "</div>" +
    (n ? '<div class="bs-ziele">' + z.ziele.map(karte).join("") + "</div>"
      : '<div class="pj-leer"><h2>Noch keine Ziele für ' + esc(quartalName(z.quartal)) + "</h2><p>Ein Quartalsziel ist ein Projekt mit klarer Definition, woran man „erledigt“ erkennt. Drei bis sieben je Quartal – mehr schafft niemand richtig.</p>" +
        '<div class="bs-knoepfe"><button class="btn btn-primaer" data-bs="ziel-neu">' + ic("plus") + 'Erstes Ziel</button><button class="btn" data-bs="ziel-markieren">Vorhandenes Projekt markieren</button></div></div>');
  return { html, nach: () => { document.querySelectorAll("#inhalt textarea").forEach(groesse); } };
}

/* ------------------------------------------------------------ Dialoge */
function dialog(html, beimAbsenden) {
  const d = document.createElement("dialog");
  d.className = "dialog pj-dialog bs-dialog";
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
  const erstes = d.querySelector("input:not([type=hidden]):not([type=checkbox]), textarea");
  if (erstes) erstes.focus();
  return d;
}

function personenAuswahl(name, gewaehlt) {
  return '<div class="pj-auswahl">' + B.start.personen.map((p) => '<label class="pj-person-chip"><input type="checkbox" name="' + name + '" value="' + esc(p.id) + '"' + (gewaehlt.includes(p.id) ? " checked" : "") + ">" + avatar(p.id) + esc(p.name) + "</label>").join("") + "</div>";
}

function dialogNeu() {
  const ich = B.start.ich;
  const d = dialog('<form method="dialog"><div class="dialog-kopf"><h2>Neue Besprechung</h2><p>Gespräch, Kunden-, Lieferanten- oder Banktermin – mit Notizen, Themen, Beschlüssen und Aufgaben.</p></div>' +
    '<div class="feld-reihe"><label class="feld"><span class="feld-label">Art</span><select name="art">' + B.start.arten.filter((a) => a.id !== "wochenrunde").map((a) => '<option value="' + esc(a.id) + '">' + esc(a.name) + "</option>").join("") + "</select></label>" +
      '<label class="feld"><span class="feld-label">Datum</span><input type="date" name="datum" value="' + heute() + '" required></label></div>' +
    '<label class="feld"><span class="feld-label">Titel</span><input name="titel" maxlength="120" placeholder="z. B. Jahresgespräch Hersteller1 (leer: Art und Datum)"></label>' +
    '<div class="feld"><span class="feld-label">Teilnehmer</span>' + personenAuswahl("teilnehmer", [ich]) + "</div>" +
    '<label class="bs-schalter-zeile"><input type="checkbox" name="vertraulich"> <span><b>Vertraulich</b> – nur Teilnehmer und du sehen sie (z. B. Mitarbeitergespräch)</span></label>' +
    '<div class="gruppe dialog-fuss"><span class="rechts"></span><button class="knopf" type="button" data-schliessen>Abbrechen</button><button class="knopf primaer" type="submit">Anlegen</button></div></form>',
  async (fd) => {
    try {
      const b = await ruf("anlegen", { art: fd.get("art"), datum: fd.get("datum"), titel: fd.get("titel"), teilnehmer: fd.getAll("teilnehmer"), vertraulich: !!fd.get("vertraulich") });
      oeffne(b);
    } catch (e) { meldung(String(e.message || e), true); return false; }
  });
  const art = d.querySelector('select[name="art"]'), vertraulich = d.querySelector('input[name="vertraulich"]');
  const passend = () => { vertraulich.checked = art.value === "gespraech"; };
  art.addEventListener("change", passend);
  passend();
}

function oeffne(b) {
  B.aktuell.set(b.id, b);
  B.start = { ...B.start, besprechungen: null };
  location.hash = "#/besprechung/" + b.id;
}

async function neueWochenrunde(knopf) {
  if (knopf) knopf.disabled = true;
  try { const b = await ruf("anlegen", { art: "wochenrunde" }); oeffne(b);
    const mit = b.themen.length + b.aufgaben.length;
    meldung(mit ? "Wochenrunde angelegt – " + b.themen.length + " Themen und " + b.aufgaben.length + " Aufgaben aus der letzten Runde übernommen." : "Wochenrunde angelegt."); }
  catch (e) { meldung(String(e.message || e), true); }
  finally { if (knopf) knopf.disabled = false; }
}

async function dialogProtokoll(knopf) {
  let v;
  if (knopf) knopf.disabled = true;
  try { v = await ruf("protokoll_waehlen"); }
  catch (e) { meldung(String(e.message || e), true); return; }
  finally { if (knopf) knopf.disabled = false; }
  if (!v) return;                                          // Dateiauswahl abgebrochen
  const zahlKachel = (t, w, f) => '<div class="bs-vorschau-zahl"><b>' + w + "</b><span>" + esc(t) + "</span>" + (f ? '<span class="klein">' + esc(f) + "</span>" : "") + "</div>";
  dialog('<form method="dialog"><div class="dialog-kopf"><h2>Protokoll übernehmen</h2><p>Aus „' + esc(v.datei) + "“ der Protokoll-App – die Datei selbst bleibt unverändert.</p></div>" +
    '<div class="bs-vorschau-zahlen">' + zahlKachel("Themen", v.themen, v.themen_offen + " offen") + zahlKachel("Beschlüsse", v.beschluesse, "mit Grund") +
      zahlKachel("Aufgaben", v.aufgaben, v.aufgaben_ohne_person ? v.aufgaben_ohne_person + " ohne Person" : "alle zugeordnet") + "</div>" +
    '<div class="feld-reihe"><label class="feld"><span class="feld-label">Titel</span><input name="titel" maxlength="120" value="' + esc(v.titel) + '"></label>' +
      '<label class="feld"><span class="feld-label">Art</span><select name="art">' + B.start.arten.filter((a) => a.id !== "wochenrunde").map((a) => '<option value="' + esc(a.id) + '"' + (a.id === "gespraech" ? " selected" : "") + ">" + esc(a.name) + "</option>").join("") + "</select></label></div>" +
    '<div class="feld"><span class="feld-label">Teilnehmer (erkannt)</span><div class="bs-vorschau-leute">' + (v.teilnehmer.length ? v.teilnehmer.map((id) => '<span class="pj-person-chip an">' + avatar(id) + esc(person(id).name) + "</span>").join("") : '<span class="leise">keine Person erkannt – du stehst dann allein drin</span>') +
      (v.teilnehmer_unbekannt.length ? '<span class="leise klein">nicht in ODIN: ' + esc(v.teilnehmer_unbekannt.join(", ")) + "</span>" : "") + "</div></div>" +
    (v.hinweise.length ? '<ul class="bs-hinweise">' + v.hinweise.map((h) => "<li>" + esc(h) + "</li>").join("") + "</ul>" : "") +
    '<label class="feld"><span class="feld-label">Aufgaben landen in</span>' + projektWahl({}, "Automatisch – vertraulich: eigenes Projekt, sonst „" + B.start.sammelprojekt + "“") + "</label>" +
    '<label class="bs-schalter-zeile"><input type="checkbox" name="vertraulich" checked> <span><b>Vertraulich</b> – nur die erkannten Teilnehmer und du sehen die Besprechung</span></label>' +
    '<div class="gruppe dialog-fuss"><span class="vorschau">' + esc(datum(v.datum)) + '</span><button class="knopf" type="button" data-schliessen>Abbrechen</button><button class="knopf primaer" type="submit">Übernehmen</button></div></form>',
  async (fd) => {
    try {
      const b = await ruf("protokoll_uebernehmen", { titel: fd.get("titel"), art: fd.get("art"), vertraulich: !!fd.get("vertraulich"), projekt_id: fd.get("projekt_id") || "" });
      oeffne(b);
      projekteGeaendert();
      const u = b.uebernahme || {};
      meldung("Übernommen: " + (u.themen || 0) + " Themen, " + (u.beschluesse || 0) + " Beschlüsse, " + (u.aufgaben || 0) + " Aufgaben.");
    } catch (e) { meldung(String(e.message || e), true); return false; }
  });
}

function dialogAbschnitt(b) {
  dialog('<form method="dialog"><div class="dialog-kopf"><h2>Abschnitt hinzufügen</h2><p>Eigener Tagesordnungspunkt mit Notizen.</p></div>' +
    '<div class="feld-reihe"><label class="feld"><span class="feld-label">Titel</span><input name="titel" required maxlength="80" placeholder="z. B. Werkstattauslastung"></label>' +
    '<label class="feld"><span class="feld-label">Minuten (optional)</span><input name="minuten" type="number" min="0" max="600"></label></div>' +
    '<div class="gruppe dialog-fuss"><span class="rechts"></span><button class="knopf" type="button" data-schliessen>Abbrechen</button><button class="knopf primaer" type="submit">Hinzufügen</button></div></form>',
  async (fd) => { if (!await aendern("abschnitt_anlegen", [b.id, fd.get("titel"), fd.get("minuten") || null])) return false; });
}

async function meineProjekte() {
  const s = await rufP("start");
  return s.projekte.filter((p) => !p.archiviert);
}

async function dialogZielMarkieren() {
  let projekte;
  try { projekte = (await meineProjekte()).filter((p) => p.quartalsziel !== B.ziele.quartal); }
  catch (e) { meldung(String(e.message || e), true); return; }
  if (!projekte.length) { meldung("Kein weiteres Projekt vorhanden – mit „Neues Ziel“ ein Projekt als Ziel anlegen.", true); return; }
  dialog('<form method="dialog"><div class="dialog-kopf"><h2>Projekt als Ziel für ' + esc(quartalName(B.ziele.quartal)) + "</h2><p>Verantwortlich ist, wer das Projekt angelegt hat.</p></div>" +
    '<label class="feld"><span class="feld-label">Projekt</span><select name="projekt" required>' + projekte.map((p) => '<option value="' + esc(p.id) + '">' + esc(p.name) + (p.quartalsziel ? " (Ziel " + esc(quartalName(p.quartalsziel)) + ")" : "") + "</option>").join("") + "</select></label>" +
    '<label class="feld"><span class="feld-label">Erledigt heißt …</span><textarea name="definition" rows="2" maxlength="500" placeholder="Woran man am Quartalsende eindeutig sieht, dass es geschafft ist"></textarea></label>' +
    '<div class="gruppe dialog-fuss"><span class="rechts"></span><button class="knopf" type="button" data-schliessen>Abbrechen</button><button class="knopf primaer" type="submit">Als Ziel markieren</button></div></form>',
  async (fd) => {
    try { await rufP("projekt_aendern", fd.get("projekt"), { quartalsziel: B.ziele.quartal, ziel_definition: fd.get("definition") }); }
    catch (e) { meldung(String(e.message || e), true); return false; }
    projekteGeaendert();
    await ladeZiele(); neuZeichnen();
  });
}

function dialogZielNeu() {
  const andere = B.start.personen.filter((p) => p.id !== B.start.ich);
  dialog('<form method="dialog"><div class="dialog-kopf"><h2>Neues Ziel für ' + esc(quartalName(B.ziele.quartal)) + "</h2><p>Legt ein Projekt an – du bist verantwortlich. Aufgaben zum Ziel kommen ins Projekt.</p></div>" +
    '<label class="feld"><span class="feld-label">Ziel</span><input name="name" required maxlength="80" placeholder="z. B. Werkstatt-Termine online buchbar"></label>' +
    '<label class="feld"><span class="feld-label">Erledigt heißt …</span><textarea name="definition" rows="2" maxlength="500" placeholder="z. B. Kunden buchen über die Website, mindestens 20 Buchungen"></textarea></label>' +
    (andere.length ? '<div class="feld"><span class="feld-label">Mitglieder</span>' + personenAuswahl("mitglieder", []) + "</div>" : "") +
    '<div class="gruppe dialog-fuss"><span class="rechts"></span><button class="knopf" type="button" data-schliessen>Abbrechen</button><button class="knopf primaer" type="submit">Ziel anlegen</button></div></form>',
  async (fd) => {
    try { await rufP("projekt_anlegen", { name: fd.get("name"), quartalsziel: B.ziele.quartal, ziel_definition: fd.get("definition"), mitglieder: fd.getAll("mitglieder").filter((id) => id !== B.start.ich) }); }
    catch (e) { meldung(String(e.message || e), true); return false; }
    projekteGeaendert();
    await ladeZiele(); neuZeichnen();
  });
}

/* ------------------------------------------------------------ Still speichern (Notizen, Definitionen) */
const zuletztGespeichert = new Map();
const stillTimer = new Map();
function speicherAnzeige(text) { const s = document.getElementById("bs-speicher"); if (s) s.textContent = text; }

async function stillSpeichern(el) {
  const ziel = el.dataset.still, wert = el.value;
  clearTimeout(stillTimer.get(ziel)); stillTimer.delete(ziel);
  if (zuletztGespeichert.get(ziel) === wert || (!zuletztGespeichert.has(ziel) && wert === el.defaultValue)) return;
  zuletztGespeichert.set(ziel, wert);
  const [art, id] = ziel.split(":");
  const bid = idAusHash();
  speicherAnzeige("Speichert …");
  try {
    if (art === "ziel") { await rufP("projekt_aendern", id, { ziel_definition: wert }); speicherAnzeige(""); return; }
    const b = art === "abschnitt" ? await ruf("aendern", bid, { abschnitte: [{ id, notiz: wert }] })
      : art === "thema" ? await ruf("thema_aendern", bid, id, { notiz: wert })
      : await ruf("aendern", bid, { [id]: wert });
    if (b && b.id) B.aktuell.set(b.id, b);
    speicherAnzeige("Gespeichert");
  } catch (e) {
    zuletztGespeichert.delete(ziel);
    speicherAnzeige("");
    meldung("Nicht gespeichert: " + String(e.message || e), true);
  }
}

const groesse = (t) => { if (!t || !t.isConnected) return; t.style.height = "auto"; t.style.height = (t.scrollHeight + 2) + "px"; };

/* ------------------------------------------------------------ Ereignisse (einmal, per Delegation) */
document.addEventListener("click", async (ev) => {
  if (!istMeineSeite()) return;
  const k = ev.target.closest("#inhalt [data-bs]");
  if (!k) return;
  const art = k.dataset.bs, bid = idAusHash(), b = B.aktuell.get(bid);
  switch (art) {
    case "neu-laden": B.fehler = ""; B.start = null; neuZeichnen(); break;
    case "ich":
      try { await window.odinAnmelden(k.dataset.id); zuruecksetzen(); window.dispatchEvent(new Event("odin-ich")); window.dispatchEvent(new Event("odin-ich-urlaub")); nachLaden(ladeStart()); }
      catch (e) { meldung(String(e.message || e), true); }
      break;
    case "wochenrunde": await neueWochenrunde(k); break;
    case "neu": dialogNeu(); break;
    case "protokoll": await dialogProtokoll(k); break;
    case "art": B.art = k.dataset.wert; neuZeichnen(); break;
    case "log-filter": B.logStatus = k.dataset.wert; neuZeichnen(); break;
    case "geloeste": B.geloesteZeigen = !B.geloesteZeigen; neuZeichnen(); break;
    case "teilnehmer": {
      if (!b) break;
      const neu = b.teilnehmer.includes(k.dataset.id) ? b.teilnehmer.filter((x) => x !== k.dataset.id) : b.teilnehmer.concat(k.dataset.id);
      await aendern("aendern", [bid, { teilnehmer: neu }]);
      break;
    }
    case "thema-haken": {
      const t = b && b.themen.find((x) => x.id === k.dataset.id);
      if (t) await aendern("thema_aendern", [bid, t.id, { status: t.status === "geloest" ? "offen" : "geloest" }]);
      break;
    }
    case "thema-top": {
      const t = b && b.themen.find((x) => x.id === k.dataset.id);
      if (t) await aendern("thema_aendern", [bid, t.id, { top: !t.top }]);
      break;
    }
    case "thema-loesen":
      B.loesen = { thema: k.dataset.id, art: k.dataset.art }; neuZeichnen();
      { const f = document.querySelector('#inhalt .bs-loesen input[name="titel"], #inhalt .bs-loesen textarea[name="text"]'); if (f) { f.focus(); f.select && f.select(); } }
      break;
    case "thema-zu": B.loesen = null; neuZeichnen(); break;
    case "thema-weg": {
      const t = b && b.themen.find((x) => x.id === k.dataset.id);
      if (t && confirm("Thema „" + t.titel + "“ löschen?")) await aendern("thema_loeschen", [bid, t.id]);
      break;
    }
    case "beschluss-weg": if (confirm("Beschluss löschen? Er verschwindet auch aus dem Beschluss-Log.")) await aendern("beschluss_loeschen", [bid, k.dataset.id]); break;
    case "aufgabe-haken":
      k.disabled = true;
      await aendern("aufgabe_erledigen", [bid, k.dataset.id, k.dataset.wert === "true"]);
      break;
    case "aufgabe-weg": {
      const a = b && b.aufgaben.find((x) => x.id === k.dataset.id);
      if (a && confirm("Aufgabe „" + a.titel + "“ löschen? Sie verschwindet auch aus dem Projekt" + (a.stand && a.stand.projekt ? " „" + a.stand.projekt + "“" : "") + ".")) await aendern("aufgabe_loeschen", [bid, a.id]);
      break;
    }
    case "note": {
      const alt = b && (b.bewertungen || {})[k.dataset.person];
      await aendern("bewerten", [bid, String(alt) === k.dataset.wert ? "" : Number(k.dataset.wert), k.dataset.person]);
      break;
    }
    case "abschnitt-neu": if (b) dialogAbschnitt(b); break;
    case "abschnitt-weg": {
      const a = b && b.abschnitte.find((x) => x.id === k.dataset.id);
      if (a && confirm("Abschnitt „" + a.titel + "“ mit seinen Notizen löschen?")) await aendern("abschnitt_loeschen", [bid, a.id]);
      break;
    }
    case "loeschen":
      if (b && confirm("Besprechung „" + b.titel + "“ löschen? Aufgaben in den Projekten bleiben erhalten.")) {
        try { await ruf("loeschen", bid); B.aktuell.delete(bid); B.start = { ...B.start, besprechungen: null }; B.log = null; location.hash = "#/besprechungen"; meldung("Besprechung gelöscht."); }
        catch (e) { meldung(String(e.message || e), true); }
      }
      break;
    case "ziel-status":
      k.disabled = true;
      try {
        await rufP("projekt_aendern", k.dataset.projekt, { ziel_status: k.dataset.wert });
        if (aktuelleSeite() === "ziele") await ladeZiele(); else await ladeBesprechung(bid);
        projekteGeaendert();
      } catch (e) { meldung(String(e.message || e), true); }
      neuZeichnen();
      break;
    case "ziel-weg":
      if (!confirm("Dieses Projekt nicht mehr als Quartalsziel führen? Das Projekt selbst bleibt.")) break;
      try { await rufP("projekt_aendern", k.dataset.projekt, { quartalsziel: "" }); await ladeZiele(); projekteGeaendert(); }
      catch (e) { meldung(String(e.message || e), true); }
      neuZeichnen();
      break;
    case "quartal": B.quartal = k.dataset.wert || B.quartal; B.ziele = null; neuZeichnen(); break;
    case "ziel-markieren": await dialogZielMarkieren(); break;
    case "ziel-neu": dialogZielNeu(); break;
  }
});

document.addEventListener("change", async (ev) => {
  if (!istMeineSeite()) return;
  const t = ev.target;
  if (!t.closest || !t.closest("#inhalt")) return;
  const bid = idAusHash(), b = B.aktuell.get(bid);
  if (t.dataset.still) { stillSpeichern(t); return; }
  if (t.dataset.bsFeld && b) {
    const feld = t.dataset.bsFeld, wert = t.type === "checkbox" ? t.checked : t.value;
    if (feld === "titel" && !String(wert).trim()) { t.value = b.titel; return; }
    if (b[feld] === wert) return;
    await aendern("aendern", [bid, { [feld]: wert }]);
    return;
  }
  if (t.dataset.beschlussStatus) { await aendern("beschluss_aendern", [bid, t.dataset.beschlussStatus, { status: t.value }]); return; }
  if (t.dataset.logStatus || t.dataset.logWv !== undefined) {
    const felder = t.dataset.logStatus ? { status: t.value } : { wiedervorlage: t.value };
    try { await ruf("beschluss_aendern", t.dataset.besprechung, t.dataset.logStatus || t.dataset.logWv, felder); B.aktuell.delete(t.dataset.besprechung); await ladeLog(); }
    catch (e) { meldung(String(e.message || e), true); }
    neuZeichnen();
  }
});

let suchTimer;
document.addEventListener("input", (ev) => {
  if (!istMeineSeite()) return;
  const t = ev.target;
  if (!t.closest || !t.closest("#inhalt")) return;
  if (t.tagName === "TEXTAREA") groesse(t);
  if (t.dataset.still) {
    clearTimeout(stillTimer.get(t.dataset.still));
    stillTimer.set(t.dataset.still, setTimeout(() => stillSpeichern(t), 1200));
    speicherAnzeige("Ungespeichert …");
  }
  if (t.dataset.bsSuche) {
    if (t.dataset.bsSuche === "log") B.logSuche = t.value; else B.suche = t.value;
    clearTimeout(suchTimer); suchTimer = setTimeout(neuZeichnen, 150);
  }
});

document.addEventListener("submit", async (ev) => {
  const form = ev.target.closest("#inhalt [data-bs-form]");
  if (!form || !istMeineSeite()) return;
  ev.preventDefault();
  const art = form.dataset.bsForm, fd = new FormData(form), bid = idAusHash();
  const knopf = form.querySelector('button[type="submit"]');
  if (knopf) knopf.disabled = true;
  const leeren = () => { form.reset(); if (form.dataset.thema) B.loesen = null; };
  try {
    if (art === "person") {
      const neu = await rufP("person_anlegen", { name: fd.get("name") });
      await window.odinAnmelden(neu.id);                // neue Person: PIN festlegen im Tresor
      zuruecksetzen(); window.dispatchEvent(new Event("odin-ich")); window.dispatchEvent(new Event("odin-ich-urlaub"));
      meldung("Hallo " + neu.name.split(" ")[0] + "!");
      nachLaden(ladeStart());
    }
    if (art === "thema") await aendern("thema_anlegen", [bid, { titel: fd.get("titel") }], leeren);
    if (art === "beschluss") {
      await aendern("beschluss_anlegen", [bid, { text: fd.get("text"), grund: fd.get("grund"), wiedervorlage: fd.get("wiedervorlage") || null, thema_id: form.dataset.thema || null }], leeren);
      B.log = null;
    }
    if (art === "aufgabe") {
      const ok = await aendern("aufgabe_anlegen", [bid, { titel: fd.get("titel"), zustaendig: fd.get("zustaendig"), faellig: fd.get("faellig"), projekt_id: fd.get("projekt_id") || null, thema_id: form.dataset.thema || null }], leeren);
      if (ok) meldung("Aufgabe angelegt – sie steht jetzt bei " + vorname(fd.get("zustaendig")) + " unter „Meine Aufgaben“.");
    }
  } catch (e) {
    meldung(String(e.message || e), true);
  } finally {
    if (knopf && knopf.isConnected) knopf.disabled = false;
  }
});

document.addEventListener("keydown", (ev) => {
  if (!istMeineSeite() || document.querySelector("dialog[open]")) return;
  if (ev.key === "Escape" && B.loesen) { B.loesen = null; neuZeichnen(); }
  if (ev.key === "Enter" && ev.target.matches && ev.target.matches(".bs-titel")) { ev.preventDefault(); ev.target.blur(); }
});

/* Vor dem Verlassen der Seite: Notizen sofort speichern statt auf den Zeitgeber zu warten */
document.addEventListener("focusout", (ev) => {
  const t = ev.target;
  if (t && t.dataset && t.dataset.still && stillTimer.has(t.dataset.still)) stillSpeichern(t);
});

function zuruecksetzen() { B.start = null; B.aktuell.clear(); B.log = null; B.ziele = null; B.fehler = ""; B.loesen = null; }
addEventListener("odin-ich", () => zuruecksetzen());
addEventListener("odin-ich-urlaub", () => zuruecksetzen());
addEventListener("odin-ziele-geaendert", () => { B.ziele = null; B.aktuell.clear(); });

/* Beim Betreten frisch laden (Änderungen anderer Rechner); Lösen-Formular nur auf seiner Seite */
addEventListener("hashchange", () => {
  B.loesen = null;
  const seite = aktuelleSeite();
  if (!SEITEN.includes(seite)) return;
  if (seite === "besprechung") nachLaden(ladeBesprechung(idAusHash()));
  if (seite === "besprechungen" && B.start) nachLaden(ladeStart());
  if (seite === "beschluesse") nachLaden(ladeLog());
  if (seite === "ziele") nachLaden(ladeZiele());
});

/* Zurück ins Fenster: höchstens alle 20 Sekunden frisch laden – nicht, solange jemand tippt */
let zuletzt = 0;
addEventListener("focus", () => {
  if (!istMeineSeite() || Date.now() - zuletzt < 20000 || document.querySelector("dialog[open]")) return;
  const aktiv = document.activeElement;
  if (aktiv && aktiv.closest && aktiv.closest("#inhalt input, #inhalt textarea, #inhalt select")) return;
  zuletzt = Date.now();
  const seite = aktuelleSeite();
  nachLaden(seite === "besprechung" ? ladeBesprechung(idAusHash()) : seite === "beschluesse" ? ladeLog() : seite === "ziele" ? ladeZiele() : ladeStart());
});

/* ------------------------------------------------------------ Anmelden bei der Navigation */
window.ODIN_SEITEN = window.ODIN_SEITEN || {};
window.ODIN_SEITEN.besprechungen = { render: seiteListe, menue: () => "besprechungen" };
window.ODIN_SEITEN.besprechung = { render: seiteBesprechung, menue: () => "besprechungen" };
window.ODIN_SEITEN.beschluesse = { render: seiteBeschluesse, menue: () => "besprechungen" };
window.ODIN_SEITEN.ziele = { render: seiteZiele, menue: () => "ziele" };
// Wurde die Seite gezeichnet, bevor dieser Bereich angemeldet war (direkter Aufruf), jetzt richtig zeichnen
if (istMeineSeite() && typeof window.cockpitZeichne === "function") window.cockpitZeichne();
})();
