/* ODIN · Tagesfragen
   Jeden Arbeitstag ein paar kurze Fragen – eine nach der anderen, sofort die Auflösung mit Erklärung. Oben die Serie
   (ein ausgelassener Tag schadet nicht, zwei in Folge beenden sie), die Lose im Monat und ein kleiner Kalender.
   Falsch heißt hier „noch nicht“: die Frage kommt nach ein paar Arbeitstagen wieder. Statt Rangliste ein Teamziel.
   Daten: tirge_helfer/tagesfragen.py, gespeichert im Ordner „Fahrzeuge“ unter _ODIN/Tagesfragen.
   Seiten: #/tagesfragen (heute), #/tagesfragen/team, #/tagesfragen/vorschlagen,
   für Verwalter #/tagesfragen/fragen und #/tagesfragen/verlosung. */
(() => {
"use strict";

const T = {
  start: null,            // {ich, personen, ist_verwalter, heute, stand, team, einstellungen, …}
  fehler: "",
  aufgeloest: null,       // Antwort auf die gerade gezeigte Frage: {id, richtig, richtige_antwort, erklaerung, …}
  monat: null,            // im Kalender gezeigter Monat (null = laufender)
  monatStand: null,       // stand() für einen anderen Monat
  liste: null,            // Verwalter: fragen_liste()
  formular: null,         // {modus, frage} – offenes Frageformular
  verlosung: null,        // Verwalter: verlosung(monat)
  verlosungMonat: null,
  sendet: false,
};

const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const ic = (n) => '<svg class="ic" aria-hidden="true"><use href="#ci-' + n + '"/></svg>';
const MONATE = ["Januar", "Februar", "März", "April", "Mai", "Juni", "Juli", "August", "September", "Oktober", "November", "Dezember"];
const WOCHENTAGE = ["Mo", "Di", "Mi", "Do", "Fr", "Sa", "So"];
const BUCHSTABEN = ["A", "B", "C", "D", "E", "F"];
const monatsname = (m) => m ? MONATE[Number(m.slice(5, 7)) - 1] + " " + m.slice(0, 4) : "";
const monatKurz = (m) => m ? MONATE[Number(m.slice(5, 7)) - 1] : "";
const datum = (iso) => { if (!iso) return ""; const [j, m, t] = String(iso).slice(0, 10).split("-"); return t + "." + m + "." + j; };
const zeit = (iso) => iso ? new Date(iso).toLocaleString("de-DE", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" }) : "";
const prozent = (x) => x == null ? "–" : Math.round(x * 100) + " %";
const mehrzahl = (n, eins, viele) => n + " " + (n === 1 ? eins : viele);
const meldung = (t, f) => { if (typeof zeigeMeldung === "function") zeigeMeldung(t, f ? "x" : "check", !!f); };
const aufSeite = () => (location.hash || "").startsWith("#/tagesfragen");
const ruhig = () => matchMedia("(prefers-reduced-motion: reduce)").matches;

async function ruf(aktion, ...args) {
  if (!window.pywebview || !window.pywebview.api) throw new Error("Programm-Schnittstelle nicht bereit");
  const r = await window.pywebview.api.tagesfragen_aufruf(aktion, args);
  if (!r || !r.ok) throw new Error((r && r.fehler) || "Unbekannter Fehler");
    // „ok“, aber ohne Inhalt: als Fehler behandeln – sonst lädt die Seite beim Neuzeichnen endlos nach
    if ((r.daten === null || r.daten === undefined) && /^(start|heute|stand|team)$/.test(aktion)) throw new Error("Keine Daten erhalten – bitte nochmal versuchen.");
  return r.daten;
}

const person = (id) => (T.start && (T.start.personen || []).find((p) => p.id === id)) || { id, name: "Unbekannt", kuerzel: "?", farbe: "#8A8586" };
const avatar = (id) => { const p = person(id); return '<span class="pj-avatar" style="--farbe:' + window.odinFarbeOk(p.farbe) + '" title="' + esc(p.name) + '">' + esc(p.kuerzel) + "</span>"; };
const istVerwalter = () => !!(T.start && T.start.ist_verwalter);
const neu = () => { if (typeof window.cockpitZeichne === "function") window.cockpitZeichne(); };

/* ------------------------------------------------------------ Laden */
/* Läuft schon ein Laden, wird danach geladen – nie sofort zurückkehren (sonst Ladeschleife ohne Antwort). */
let laufend = null;
function laden() {
  if (laufend) return laufend.then(() => laden());
  laufend = (async () => {
    try {
      T.start = await ruf("start");
      T.fehler = "";
    } catch (e) {
      T.fehler = String(e.message || e);
    }
    seitenleiste();
  })().finally(() => { laufend = null; });
  return laufend;
}

/* Zähler in der Seitenleiste: offene Fragen heute. Ohne geöffnete Seite reicht die schnelle Abfrage. */
function zaehlerSetzen(n) {
  const z = document.getElementById("tagesfragen-zahl");
  if (!z) return;
  z.textContent = n; z.hidden = !n;
  z.title = n ? mehrzahl(n, "Frage", "Fragen") + " für heute" : "";
}
function seitenleiste() {
  const h = T.start && T.start.heute;
  if (h) zaehlerSetzen(h.arbeitstag && !h.uebersprungen ? h.offen : 0);
}
async function zaehlerLaden() {
  try { zaehlerSetzen(await ruf("offen")); } catch (e) { /* Zähler ist Zugabe */ }
}

/* ------------------------------------------------------------ Bausteine */
function ladeAnzeige() {
  if (T.fehler) return '<div class="pj-leer"><h2>Tagesfragen gerade nicht erreichbar</h2><p>' + esc(T.fehler) + '</p><button class="btn btn-primaer" data-tf="neu-laden">Nochmal versuchen</button></div>';
  return '<div class="laden" aria-label="Tagesfragen werden geladen"><i class="skelett" style="width:40%"></i><i class="skelett"></i><i class="skelett" style="width:70%"></i></div>';
}

function reiter(aktiv) {
  const r = [["", "Heute"], ["team", "Team"], ["vorschlagen", "Frage vorschlagen"]];
  if (istVerwalter()) r.push(["fragen", "Fragen verwalten"], ["verlosung", "Verlosung & Einstellungen"]);
  const offen = istVerwalter() ? T.start.offene_vorschlaege || 0 : 0;
  return '<div class="pj-segment tf-reiter" role="tablist">' + r.map(([k, t]) => '<a role="tab" href="#/tagesfragen' + (k ? "/" + k : "") + '" aria-selected="' + (k === aktiv) + '">' + t +
    (k === "fragen" && offen ? ' <span class="pj-anzahl" title="offene Vorschläge">' + offen + "</span>" : "") + "</a>").join("") + "</div>";
}

function kopf(aktiv, text) {
  return '<div class="kopf"><div><h1>Tagesfragen</h1><p>' + text + "</p></div></div>" + reiter(aktiv);
}

/* ------------------------------------------------------------ Oben: Serie, Lose, Kalender */
function serieHtml() {
  const s = T.start.stand;
  const h = T.start.heute;
  let fuss = s.laengste > s.serie ? "Rekord: " + mehrzahl(s.laengste, "Tag", "Tage") : s.serie ? "Das ist dein Rekord" : "Heute geht’s los";
  const luecke = s.luecke && h.arbeitstag && !h.fertig;
  if (luecke) fuss = h.uebersprungen ? "Heute ausgelassen – morgen geht’s weiter" : "Einmal ausgelassen – heute zählt";
  return '<div class="tf-wert-karte tf-serie' + (s.serie ? " an" : "") + '" id="tf-serie">' +
    '<span class="tf-flamme" aria-hidden="true">' + ic("flamme") + "</span>" +
    '<div><div class="tf-zahl" id="tf-serie-zahl">' + s.serie + '</div><div class="tf-titel">' + (s.serie === 1 ? "Tag" : "Tage") + " in Folge</div>" +
    '<div class="tf-fuss' + (luecke ? " tf-wichtig" : "") + '">' + fuss + "</div></div></div>";
}

function loseHtml() {
  const s = T.start.stand;
  const quote = s.dabei ? "Bei der Verlosung dabei" : s.noch_moeglich ? "Dabei ab " + s.noetig + " von " + s.arbeitstage + " Tagen · " + s.erledigt + " geschafft" : "Diesen Monat nicht mehr dabei – nächster Monat zählt neu";
  const preis = T.start.einstellungen && T.start.einstellungen.preis;
  return '<div class="tf-wert-karte tf-lose" id="tf-lose">' +
    '<span class="tf-los-symbol" aria-hidden="true">' + ic("los") + "</span>" +
    '<div><div class="tf-zahl">' + s.lose + '</div><div class="tf-titel">' + (s.lose === 1 ? "Los" : "Lose") + " im " + monatKurz(s.monat) + "</div>" +
    '<div class="tf-fuss">' + esc(quote) + (preis ? '<br><span title="Preis des Monats">' + ic("geschenk") + esc(preis) + "</span>" : "") + "</div></div></div>";
}

const ARTEN = {
  erledigt: "alles beantwortet", teilweise: "nicht ganz beantwortet", verpasst: "ausgelassen", uebersprungen: "übersprungen",
  offen: "heute – noch offen", zukunft: "", frei: "Wochenende", feiertag: "Feiertag", urlaub: "Urlaub", vor_beginn: "",
};
function kalenderHtml() {
  const s = T.monatStand || T.start.stand;
  const tage = s.kalender || [];
  if (!tage.length) return "";
  const erster = (new Date(tage[0].datum + "T00:00:00").getDay() + 6) % 7;
  const heute = T.start.heute.datum;
  const zellen = Array.from({ length: erster }, () => '<span class="tf-tag leer"></span>').concat(tage.map((t) => {
    const titel = [WOCHENTAGE[(new Date(t.datum + "T00:00:00").getDay() + 6) % 7] + ", " + datum(t.datum).slice(0, 6), t.feiertag || ARTEN[t.art] || "",
      t.beantwortet ? t.richtig + " von " + t.fragen + " richtig" : ""].filter(Boolean).join(" · ");
    return '<span class="tf-tag ' + esc(t.art) + (t.datum === heute ? " heute" : "") + '" title="' + esc(titel) + '"><i></i></span>';
  }));
  const jetzt = T.start.stand.monat;
  return '<div class="tf-wert-karte tf-kalender" id="tf-kalender">' +
    '<div class="tf-kal-kopf"><button class="tf-pfeil" data-tf="monat" data-wert="-1" aria-label="Vormonat">‹</button><b>' + monatsname(s.monat) + "</b>" +
    '<button class="tf-pfeil" data-tf="monat" data-wert="1" aria-label="Folgemonat"' + (s.monat >= jetzt ? " disabled" : "") + ">›</button></div>" +
    '<div class="tf-kal-raster" role="img" aria-label="Kalender ' + esc(monatsname(s.monat)) + ": " + s.erledigt + " von " + s.arbeitstage + ' Arbeitstagen erledigt">' +
      WOCHENTAGE.map((w) => '<span class="tf-wt">' + w.slice(0, 1) + "</span>").join("") + zellen.join("") + "</div>" +
    '<div class="tf-fuss">' + s.erledigt + " von " + s.arbeitstage + " Arbeitstagen" + (s.volle_wochen ? " · " + mehrzahl(s.volle_wochen, "volle Woche", "volle Wochen") : "") + "</div></div>";
}

function obenHtml() {
  return '<div class="tf-oben">' + serieHtml() + loseHtml() + kalenderHtml() + "</div>";
}

/* ------------------------------------------------------------ Die Fragekarte */
function fortschrittHtml(h, aktuelleId) {
  return '<div class="tf-fortschritt" aria-hidden="true">' + h.fragen.map((f) => {
    const k = f.gewaehlt == null ? (f.id === aktuelleId ? "jetzt" : "") : f.korrekt ? "richtig" : "noch";
    return '<i class="' + k + '"></i>';
  }).join("") + "</div>";
}

function aktuelleFrage(h) {
  if (T.aufgeloest) return h.fragen.find((f) => f.id === T.aufgeloest.id) || null;
  return h.fragen.find((f) => f.gewaehlt == null) || null;
}

function rueckmeldungHtml(f, r) {
  const richtigText = f.antworten[r.richtige_antwort];
  const letzte = T.start.heute.offen === 0;
  return '<div class="tf-rueckmeldung ' + (r.richtig ? "richtig" : "noch") + '" role="status">' +
    '<div class="tf-rm-kopf">' + ic(r.richtig ? "haken" : "wiederholen") + "<b>" +
      (r.richtig ? (r.gelernt ? "Richtig – gelernt!" : "Richtig!") : "Noch nicht – so ist es richtig:") + "</b>" +
      (r.gelernt ? '<span class="pj-chip gut">+1 Los fürs Dranbleiben</span>' : "") + "</div>" +
    (r.richtig ? "" : '<p class="tf-rm-loesung">' + esc(richtigText) + "</p>") +
    (r.erklaerung ? '<p class="tf-rm-text">' + esc(r.erklaerung) + "</p>" : "") +
    (r.richtig ? "" : '<p class="klein">Die Frage kommt in ein paar Arbeitstagen wieder.</p>') +
    (r.quelle ? '<p class="klein tf-quelle">Quelle: ' + esc(r.quelle) + "</p>" : "") +
    (/^[a-z0-9]{6,32}$/.test(String(r.modul || "")) ? '<p class="tf-modul"><a href="#/beirat/modul/' + r.modul + '">Im Beirat nachlesen</a></p>' : "") +
    (/^[A-Z]{3,12}-\d{3}$/.test(String(r.regel || "")) ? '<p class="tf-modul"><a href="#/wissen/hausregeln">Hausregel ' + esc(r.regel) + " nachlesen</a></p>" : "") +
    '<div class="tf-rm-knoepfe"><button class="btn btn-primaer" data-tf="weiter" id="tf-weiter">' + (letzte ? "Abschließen" : "Weiter") + ' <kbd>Enter</kbd></button></div></div>';
}

function frageHtml(h, f) {
  const nr = h.fragen.indexOf(f) + 1;
  const r = T.aufgeloest;
  const knoepfe = f.antworten.map((a, i) => {
    let k = "tf-antwort";
    if (r) {
      if (i === r.richtige_antwort) k += " ist-richtig";
      if (i === r.wahl) k += " gewaehlt" + (r.richtig ? "" : " noch");
    }
    return '<button type="button" class="' + k + '" data-tf-wahl="' + i + '"' + (r ? ' aria-disabled="true"' : "") + ">" +
      '<span class="tf-buchstabe" aria-hidden="true">' + BUCHSTABEN[i] + "</span><span class=\"tf-antwort-text\">" + esc(a) + "</span>" +
      (r && i === r.richtige_antwort ? '<span class="tf-zeichen">' + ic("haken") + "</span>" : "") + "</button>";
  }).join("");
  return '<div class="tf-inhalt" data-frage="' + esc(f.id) + '">' +
    '<div class="tf-meta"><span class="pj-chip">' + esc(f.kategorie) + '</span><span class="klein">Frage ' + nr + " von " + h.anzahl + "</span></div>" +
    '<h2 class="tf-frage" id="tf-frage-text">' + esc(f.frage) + "</h2>" +
    '<div class="tf-antworten" role="group" aria-labelledby="tf-frage-text">' + knoepfe + "</div>" +
    (r ? rueckmeldungHtml(f, r) : "") +
    (!r ? '<div class="tf-unten"><span class="klein tf-tasten">Tasten 1–' + f.antworten.length + " wählen</span>" +
      '<button type="button" class="tf-leise" data-tf="ueberspringen">Heute überspringen</button></div>' : "") +
    "</div>";
}

function fertigHtml(h) {
  const s = T.start.stand;
  const gelernt = h.fragen.filter((f) => f.gelernt).length;
  const loseHeute = 1 + h.richtig + gelernt;
  return '<div class="tf-inhalt tf-fertig">' +
    '<div class="tf-fertig-zeichen" aria-hidden="true">' + ic("haken") + "</div>" +
    "<h2>Fertig für heute</h2>" +
    '<p class="tf-fertig-text">' + h.richtig + " von " + h.anzahl + " richtig · +" + mehrzahl(loseHeute, "Los", "Lose") +
      " · Serie: " + mehrzahl(s.serie, "Tag", "Tage") + "</p>" +
    '<p class="klein">Morgen geht’s weiter. Was noch nicht saß, kommt in ein paar Tagen wieder.</p>' +
    '<details class="tf-rueckblick"><summary>Heute zum Nachlesen</summary><ol>' + h.fragen.map((f) =>
      '<li class="' + (f.korrekt ? "richtig" : "noch") + '"><b>' + esc(f.frage) + "</b>" +
      '<span class="tf-rb-antwort">' + ic(f.korrekt ? "haken" : "wiederholen") + esc(f.antworten[f.richtig]) +
        (f.korrekt ? "" : ' <span class="klein">(deine Antwort: ' + esc(f.antworten[f.gewaehlt]) + ")</span>") + "</span>" +
      (f.erklaerung ? '<span class="klein">' + esc(f.erklaerung) + "</span>" : "") + "</li>").join("") + "</ol></details></div>";
}

function freiHtml(h) {
  const text = h.art === "urlaub" ? "Du hast Urlaub – schön! Die Serie pausiert." : h.art === "feiertag" ? h.grund + " – die Serie pausiert." : "Wochenende – die Serie pausiert.";
  return '<div class="tf-inhalt tf-frei"><div class="tf-fertig-zeichen still" aria-hidden="true">' + ic("sonne") + "</div><h2>Heute ist frei</h2><p>" + esc(text) + "</p></div>";
}

function uebersprungenHtml() {
  const s = T.start.stand;
  return '<div class="tf-inhalt tf-frei"><div class="tf-fertig-zeichen still" aria-hidden="true">' + ic("pause") + "</div><h2>Heute übersprungen</h2>" +
    "<p>" + (s.serie ? "Kein Problem: ein ausgelassener Tag schadet der Serie nicht – nur nicht zwei hintereinander." : "Kein Problem – morgen geht’s weiter.") + "</p>" +
    '<button class="btn" data-tf="doch">Doch beantworten</button></div>';
}

function karteHtml() {
  const h = T.start.heute;
  let inhalt;
  if (!h.arbeitstag) inhalt = freiHtml(h);
  else if (!h.anzahl) inhalt = '<div class="tf-inhalt tf-frei"><h2>Heute keine Fragen</h2><p>Gerade sind alle Fragequellen abgeschaltet.' + (istVerwalter() ? " Unter „Fragen verwalten“ lassen sie sich wieder einschalten." : "") + "</p></div>";
  else if (h.uebersprungen && !T.aufgeloest) inhalt = uebersprungenHtml();
  else {
    const f = aktuelleFrage(h);
    inhalt = f ? frageHtml(h, f) : fertigHtml(h);
  }
  const zeigeFortschritt = h.arbeitstag && h.anzahl && !h.uebersprungen;
  return '<section class="karte tf-karte" id="tf-karte" aria-live="polite">' +
    (zeigeFortschritt ? fortschrittHtml(h, (aktuelleFrage(h) || {}).id) : "") + inhalt + "</section>";
}

/* Nach einer Antwort nur Karte und Werte oben neu – kein Neuzeichnen der Seite, damit nichts springt */
function teilweiseNeu(animiert) {
  const karte = document.getElementById("tf-karte");
  if (!karte) { neu(); return; }
  karte.outerHTML = karteHtml();
  const k = document.getElementById("tf-karte");
  if (animiert && k) k.querySelector(".tf-inhalt").classList.add("rein");
  const oben = document.querySelector("#inhalt .tf-oben");
  if (oben) oben.outerHTML = obenHtml();
  seitenleiste();
}

async function antworten(knopf) {
  const h = T.start.heute;
  const f = aktuelleFrage(h);
  if (!f || T.aufgeloest || T.sendet) return;
  const wahl = Number(knopf.dataset.tfWahl);
  T.sendet = true;
  const karte = document.getElementById("tf-karte");
  karte.querySelectorAll(".tf-antwort").forEach((b) => b.setAttribute("aria-disabled", "true"));
  knopf.classList.add("gewaehlt", "wartet");
  try {
    const r = await ruf("antworten", f.id, wahl);
    const serieVorher = T.start.stand.serie;
    T.start.heute = r.heute;
    T.start.stand = r.stand;
    T.monatStand = null; T.monat = null;
    T.aufgeloest = { id: f.id, wahl, ...r };
    teilweiseNeu(false);
    if (r.stand.serie > serieVorher) {
      const z = document.getElementById("tf-serie");
      if (z && !ruhig()) z.classList.add("hoch");
    }
  } catch (e) {
    meldung(String(e.message || e), true);
    await laden(); T.aufgeloest = null; neu();
  } finally {
    T.sendet = false;
  }
}

function weiter() {
  if (!T.aufgeloest) return;
  T.aufgeloest = null;
  teilweiseNeu(true);
}

/* ------------------------------------------------------------ Seite: Heute */
function seiteHeute() {
  const hinweise = (T.start.stand.hinweise || []);
  return kopf("", "Ein paar Fragen am Tag – zu Teilen, Preisen, Service und ODIN. Richtig oder noch nicht: die Gewohnheit zählt.") +
    (hinweise.length ? '<div class="hinweis"><div>' + hinweise.map(esc).join("<br>") + "</div></div>" : "") +
    obenHtml() + '<div class="tf-buehne">' + karteHtml() + "</div>";
}

/* ------------------------------------------------------------ Seite: Team */
function seiteTeam() {
  const t = T.start.team;
  const e = T.start.einstellungen || {};
  const v = T.start.letzte_verlosung;
  const kachel = (titel, wert, fuss) => '<div class="kachel"><div class="titel">' + titel + '</div><div class="wert">' + wert + '</div><div class="fuss">' + fuss + "</div></div>";
  const ziel = t.teamziel
    ? '<section class="karte tf-ziel"><div class="karte-kopf"><div><h2>Teamziel ' + monatKurz(t.monat) + "</h2><p>" + t.teamziel_stand + " von " + t.teamziel + " richtigen Antworten – alle zusammen.</p></div>" +
        '<b class="tf-ziel-zahl">' + prozent(t.teamziel_anteil) + "</b></div>" +
        '<div class="tf-balken" role="progressbar" aria-valuemin="0" aria-valuemax="' + t.teamziel + '" aria-valuenow="' + t.teamziel_stand + '"><i style="--anteil:' + (t.teamziel_anteil || 0) + '"></i></div>' +
        (t.teamziel_anteil >= 1 ? '<p class="tf-ziel-geschafft">' + ic("haken") + "Geschafft – stark, Team!</p>" : "") + "</section>"
    : '<section class="karte tf-ziel"><div class="karte-leer">Für ' + monatKurz(t.monat) + " ist noch kein Teamziel gesetzt." + (istVerwalter() ? ' <a href="#/tagesfragen/verlosung">Teamziel setzen</a>' : "") + "</div></section>";
  return kopf("team", "Was wir zusammen schaffen. Freiwillig – nie für Beurteilung oder Lohn.") +
    ziel +
    '<div class="kacheln tf-team-kacheln">' +
      kachel("Teilnahme " + monatKurz(t.monat), prozent(t.teilnahme_quote), "Arbeitstage mit allen Fragen") +
      kachel("Richtig", prozent(t.richtig_quote), t.beantwortet ? t.richtig + " von " + t.beantwortet + " Antworten" : "noch keine Antworten") +
      kachel("Heute fertig", t.heute_fertig + " von " + t.heute_dran, "wer heute Fragen hat") +
      kachel("Gelernt", String(t.gelernt || 0), "früher falsch, jetzt richtig") +
    "</div>" +
    '<div class="gitter halb">' +
      '<section class="karte"><div class="karte-kopf"><div><h2>Preis des Monats</h2></div></div><div class="tf-preis">' +
        (e.preis ? '<span class="tf-preis-symbol" aria-hidden="true">' + ic("geschenk") + "</span><div><b>" + esc(e.preis) + '</b><p class="klein">Verlost wird nach Monatsende unter allen, die an mindestens 80 % ihrer Arbeitstage dabei waren – je mehr Lose, desto größer die Chance.</p></div>'
          : '<p class="klein">Für diesen Monat ist noch kein Preis eingetragen.</p>') +
        (v ? '<p class="tf-gewinner">' + ic("los") + "Verlosung " + esc(monatsname(v.monat)) + ": gewonnen hat <b>" + esc(v.gewinner_name) + "</b>" + (v.preis ? " (" + esc(v.preis) + ")" : "") + "</p>" : "") +
      "</div></section>" +
      '<section class="karte"><div class="karte-kopf"><div><h2>Rangliste</h2></div></div>' +
        (t.rangliste ? (t.rangliste.length ? '<ol class="tf-rang">' + t.rangliste.map((z) => '<li class="' + (z.ich ? "ich" : "") + '">' + avatar(z.person) + "<span>" + esc(z.name) + '</span><span class="klein">' + mehrzahl(z.lose, "Los", "Lose") + " · Serie " + z.serie + "</span></li>").join("") + "</ol>"
            : '<div class="karte-leer">Noch niemand dabei.</div>')
          : '<div class="karte-leer">Ausgeschaltet – hier zählt das Team. Jeder sieht nur seine eigenen Werte.</div>') +
      "</section></div>";
}

/* ------------------------------------------------------------ Frageformular (Vorschlag, neu, bearbeiten) */
function formularHtml(modus, f) {
  f = f || { frage: "", antworten: ["", "", "", ""], richtig: null, erklaerung: "", kategorie: "", quelle: "" };
  const kategorien = (T.start.kategorien || []).map((k) => "<option" + (k === f.kategorie ? " selected" : "") + ">" + esc(k) + "</option>").join("");
  const knopf = { vorschlag: "Vorschlagen", neu: "Frage speichern", bearbeiten: "Änderungen speichern", freigeben: "Freigeben" }[modus];
  return '<form class="tf-formular" data-tf-form="frage" data-modus="' + modus + '" data-id="' + esc(f.id || "") + '">' +
    '<label class="feld tf-breit"><span>Frage</span><textarea name="frage" rows="2" maxlength="300" required placeholder="z. B. Welche Gasprüfung braucht ein Wohnwagen alle zwei Jahre?">' + esc(f.frage) + "</textarea></label>" +
    '<fieldset class="tf-breit tf-antwort-felder"><legend>Vier Antworten – die richtige anklicken</legend>' +
      [0, 1, 2, 3].map((i) => '<label class="tf-antwort-feld"><input type="radio" name="richtig" value="' + i + '"' + (f.richtig === i ? " checked" : "") + ' required aria-label="Antwort ' + BUCHSTABEN[i] + ' ist richtig">' +
        '<span class="tf-buchstabe" aria-hidden="true">' + BUCHSTABEN[i] + '</span><input type="text" name="antwort" maxlength="160" required value="' + esc((f.antworten || [])[i] || "") + '" placeholder="Antwort ' + BUCHSTABEN[i] + '"></label>').join("") +
    "</fieldset>" +
    '<label class="feld tf-breit"><span>Erklärung – sehen alle nach dem Antworten</span><textarea name="erklaerung" rows="2" maxlength="600" required>' + esc(f.erklaerung) + "</textarea></label>" +
    '<label class="feld"><span>Kategorie</span><select name="kategorie" required><option value="">bitte wählen</option>' + kategorien + "</select></label>" +
    '<label class="feld"><span>Quelle (optional)</span><input type="text" name="quelle" maxlength="160" value="' + esc(f.quelle || "") + '" placeholder="z. B. Herstellerunterlagen, Schulung März"></label>' +
    '<div class="tf-knoepfe tf-breit">' + (modus !== "vorschlag" ? '<button type="button" class="btn" data-tf="formular-zu">Abbrechen</button>' : "") +
      '<button class="btn btn-primaer" type="submit">' + knopf + "</button></div></form>";
}

function formularLesen(form) {
  const fd = new FormData(form);
  return {
    frage: fd.get("frage"), antworten: fd.getAll("antwort"), richtig: fd.get("richtig") === null ? null : Number(fd.get("richtig")),
    erklaerung: fd.get("erklaerung"), kategorie: fd.get("kategorie"), quelle: fd.get("quelle"),
  };
}

const STATUS = { vorgeschlagen: ["wartet auf Freigabe", "warn"], freigegeben: ["freigegeben", "gut"], abgelehnt: ["nicht übernommen", "leise"] };
function seiteVorschlagen() {
  const eigene = T.start.meine_vorschlaege || [];
  return kopf("vorschlagen", "Du weißt etwas, das alle wissen sollten? Schlag eine Frage vor – die Verwalter schauen drüber und geben sie frei.") +
    '<div class="gitter zweidrittel">' +
      '<section class="karte"><div class="karte-kopf"><div><h2>Neue Frage</h2><p>Vier Antworten, genau eine richtig, und eine kurze Erklärung. Bitte nur, was sicher stimmt.</p></div></div>' + formularHtml("vorschlag") + "</section>" +
      '<section class="karte"><div class="karte-kopf"><div><h2>Meine Vorschläge</h2></div></div>' +
        (eigene.length ? '<ul class="tf-liste">' + eigene.map((v) => { const [t, k] = STATUS[v.status] || [v.status, ""]; return '<li><b>' + esc(v.frage) + '</b><span><span class="pj-chip ' + k + '">' + t + "</span>" +
          (v.entscheidung && v.entscheidung.kommentar ? ' <span class="klein">„' + esc(v.entscheidung.kommentar) + "“</span>" : "") + "</span></li>"; }).join("") + "</ul>"
          : '<div class="karte-leer">Noch keine Vorschläge.</div>') + "</section></div>";
}

/* ------------------------------------------------------------ Seite: Fragen verwalten (Verwalter) */
function frageZeile(f, aktionen) {
  return '<li class="tf-frage-zeile' + (f.aktiv === false ? " aus" : "") + '"><div class="tf-fz-haupt"><b>' + esc(f.frage) + "</b>" +
    '<ol class="tf-fz-antworten">' + f.antworten.map((a, i) => '<li class="' + (i === f.richtig ? "richtig" : "") + '">' + (i === f.richtig ? ic("haken") : "") + esc(a) + "</li>").join("") + "</ol>" +
    (f.erklaerung ? '<span class="klein">' + esc(f.erklaerung) + "</span>" : "") +
    '<span class="tf-fz-meta"><span class="pj-chip">' + esc(f.kategorie) + "</span>" + (f.quelle ? '<span class="klein">Quelle: ' + esc(f.quelle) + "</span>" : "") +
      (f.von ? '<span class="klein">von ' + esc(person(f.von).name) + "</span>" : "") + (f.vorgeschlagen_von ? '<span class="klein">vorgeschlagen von ' + esc(person(f.vorgeschlagen_von).name) + "</span>" : "") +
      (f.aktiv === false ? '<span class="pj-chip leise">abgeschaltet</span>' : "") + "</span></div>" +
    '<div class="tf-fz-knoepfe">' + aktionen + "</div></li>";
}

function seiteFragen() {
  if (!istVerwalter()) return kopf("fragen", "") + '<div class="pj-leer"><h2>Nur für Verwalter</h2><p>Verwalter sind die Urlaubs-Genehmiger.</p></div>';
  const l = T.liste;
  if (!l) { ruf("fragen_liste").then((x) => { T.liste = x; neu(); }).catch((e) => { meldung(String(e.message || e), true); }); return kopf("fragen", "") + ladeAnzeige(); }
  const fo = T.formular;
  const vorschlaege = l.vorschlaege || [];
  const mitListen = Object.values(l.datenfragen || {}).some((n) => n > 0);
  const daten = Object.entries(l.schaltbar).map(([k, name]) => {
    const n = k === "odin" ? l.mitgeliefert.length : k === "beirat" ? (l.beirat || []).length : (l.datenfragen[k] || 0);
    const bsp = (l.beispiele || {})[k];
    return '<label class="tf-quelle-schalter"><input type="checkbox" name="quelle-an" value="' + esc(k) + '"' + (l.aus.includes(k) ? "" : " checked") + ">" +
      "<span><b>" + esc(name) + '</b><span class="klein">' + mehrzahl(n, "Frage", "Fragen") + (bsp ? " · z. B. „" + esc(bsp.frage) + "“" + (bsp.quelle ? " (" + esc(bsp.quelle) + ")" : "") : k.startsWith("daten-") && !n ? (mitListen ? " · in den aktuellen Listen keine" : " · kommt mit den Excel-Listen") : "") + "</span></span></label>";
  }).join("");
  return kopf("fragen", "Eigene Fragen anlegen, Vorschläge freigeben, Fragequellen ein- und ausschalten.") + '<div class="tf-stapel">' +
    (vorschlaege.length ? '<section class="karte"><div class="karte-kopf"><div><h2>Vorschläge (' + vorschlaege.length + ')</h2><p>Bitte prüfen: stimmt die Antwort sicher, ist die Erklärung verständlich?</p></div></div><ul class="tf-liste">' +
      vorschlaege.map((v) => fo && fo.modus === "freigeben" && fo.frage.id === v.id ? '<li class="tf-formular-zeile">' + formularHtml("freigeben", v) + "</li>"
        : frageZeile(v, '<button class="btn btn-primaer" data-tf="freigeben" data-id="' + esc(v.id) + '">Freigeben</button><button class="btn" data-tf="vorschlag-bearbeiten" data-id="' + esc(v.id) + '">Bearbeiten</button><button class="btn" data-tf="ablehnen" data-id="' + esc(v.id) + '">Ablehnen</button>')).join("") + "</ul></section>" : "") +
    '<section class="karte"><div class="karte-kopf"><div><h2>Eigene Fragen (' + l.eigene.length + ")</h2><p>Für Produkt, Technik, Verkauf, Service, Firma, ODIN und Beirat. Gelöscht wird nichts – abschalten reicht.</p></div>" +
      (fo && fo.modus === "neu" ? "" : '<button class="btn btn-primaer" data-tf="neue-frage">Neue Frage</button>') + "</div>" +
      (fo && fo.modus === "neu" ? formularHtml("neu") : "") +
      (l.eigene.length ? '<ul class="tf-liste">' + l.eigene.map((f) => fo && fo.modus === "bearbeiten" && fo.frage.id === f.id ? '<li class="tf-formular-zeile">' + formularHtml("bearbeiten", f) + "</li>"
        : frageZeile(f, '<button class="btn" data-tf="bearbeiten" data-id="' + esc(f.id) + '">Bearbeiten</button><button class="btn" data-tf="aktiv" data-id="' + esc(f.id) + '" data-wert="' + (f.aktiv === false) + '">' + (f.aktiv === false ? "Einschalten" : "Abschalten") + "</button>")).join("") + "</ul>"
        : '<div class="karte-leer">Noch keine eigenen Fragen.</div>') + "</section>" +
    '<section class="karte"><div class="karte-kopf"><div><h2>Fragequellen</h2><p>Fragen aus den Excel-Listen entstehen von selbst – mit dem Stand der Liste als Quelle. Aus den Beispieldaten gibt es keine.</p></div></div>' +
      '<form class="tf-quellen" data-tf-form="quellen">' + daten +
      ((l.hausregeln || []).length ? '<p class="klein tf-hausregeln">Immer dabei: ' + mehrzahl(l.hausregeln.length, "Frage", "Fragen") + " zu den verbindlichen Hausregeln (lässt sich nicht abschalten).</p>" : "") +
      '<div class="tf-knoepfe"><button class="btn btn-primaer" type="submit">Speichern</button></div></form></section></div>';
}

/* ------------------------------------------------------------ Seite: Verlosung & Einstellungen (Verwalter) */
function vormonat(m) { const j = Number(m.slice(0, 4)), n = Number(m.slice(5, 7)); return n === 1 ? (j - 1) + "-12" : j + "-" + String(n - 1).padStart(2, "0"); }

function seiteVerlosung() {
  if (!istVerwalter()) return kopf("verlosung", "") + '<div class="pj-leer"><h2>Nur für Verwalter</h2><p>Verwalter sind die Urlaubs-Genehmiger.</p></div>';
  const e = T.start.einstellungen;
  const jetzt = e.monat;
  T.verlosungMonat = T.verlosungMonat || vormonat(jetzt);
  const v = T.verlosung && T.verlosung.monat === T.verlosungMonat ? T.verlosung : null;
  if (!v) ruf("verlosung", T.verlosungMonat).then((x) => { T.verlosung = x; if (aufSeite()) neu(); }).catch((err) => meldung(String(err.message || err), true));
  const monate = []; let m = jetzt; for (let i = 0; i < 12; i++) { m = vormonat(m); monate.push(m); }
  const ziehungen = v ? v.ziehungen : [];
  const verlosungHtml = !v ? ladeAnzeige() :
    '<div class="tf-verlosung">' +
      (v.teilnehmer.length ? '<table class="tf-tabelle"><thead><tr><th>Dabei</th><th class="r">Lose</th><th class="r">Losnummern</th><th class="r">Tage</th></tr></thead><tbody>' +
        v.teilnehmer.map((t) => "<tr><td>" + avatar(t.person) + " " + esc(t.name) + '</td><td class="r">' + t.lose + '</td><td class="r">' + t.los_von + "–" + t.los_bis + '</td><td class="r">' + t.erledigt + " / " + t.arbeitstage + "</td></tr>").join("") +
        "</tbody></table>" : '<div class="karte-leer">' + (v.nicht_dabei ? "Niemand war an mindestens 80 % seiner Arbeitstage dabei." : "In diesem Monat gab es noch keine Tagesfragen.") + "</div>") +
      '<p class="klein">' + mehrzahl(v.teilnehmer.length, "Person", "Personen") + " dabei, " + v.nicht_dabei + " nicht · " + mehrzahl(v.lose_gesamt, "Los", "Lose") + (v.preis ? " · Preis: " + esc(v.preis) : "") + "</p>" +
      (ziehungen.length ? '<ol class="tf-ziehungen">' + ziehungen.map((z, i) => '<li><b>' + esc(z.gewinner_name) + "</b> – Los " + z.gezogenes_los + " von " + z.lose_gesamt +
        '<span class="klein">' + esc(zeit(z.am)) + " von " + esc(z.von_name) + (z.preis ? " · " + esc(z.preis) : "") + (i ? " · neu ausgelost: „" + esc(z.begruendung) + "“" : "") + "</span></li>").join("") + "</ol>" : "") +
      (!v.abgeschlossen ? '<p class="klein">Ausgelost wird, wenn der Monat vorbei ist.</p>'
        : ziehungen.length ? '<form class="tf-neu-auslosen" data-tf-form="neu-auslosen"><label class="feld"><span>Erneut auslosen – nur mit Begründung (wird gespeichert)</span><input type="text" name="begruendung" minlength="5" maxlength="300" required placeholder="z. B. Gewinner ist ausgeschieden"></label><button class="btn" type="submit">Erneut auslosen</button></form>'
        : v.teilnehmer.length ? '<button class="btn btn-primaer" data-tf="auslosen">Jetzt auslosen</button>' : "") +
    "</div>";
  return kopf("verlosung", "Teamziel, Preis, Verlosung und wie viele Fragen es am Tag gibt.") +
    '<div class="hinweis tf-beirat">' + ic("info") + "<div><b>Damit es Spaß macht und fair bleibt</b><ul>" +
      "<li>Freiwillig. Ergebnisse nie für Beurteilung oder Lohn verwenden – auch nicht „nur mal schauen“.</li>" +
      "<li>Verlosung klein und gleichbleibend halten, mit dem Team vereinbaren und nach drei Monaten gemeinsam prüfen.</li>" +
      "<li>Der Chef spielt sichtbar mit.</li>" +
      "<li>Sachgutscheine bis 50 € im Monat sind als Sachbezug steuerfrei (Freigrenze, zusammen mit anderen Sachbezügen) – bitte mit dem Steuerberater abstimmen.</li>" +
    "</ul></div></div>" +
    '<div class="gitter halb">' +
      '<section class="karte"><div class="karte-kopf"><div><h2>Einstellungen</h2></div></div>' +
        '<form class="tf-einstellungen" data-tf-form="einstellungen">' +
          '<label class="feld"><span>Fragen je Tag</span><select name="fragen_je_tag">' + [1, 2, 3, 4, 5].map((n) => "<option" + (n === e.fragen_je_tag ? " selected" : "") + ">" + n + "</option>").join("") + '</select><span class="klein">In der Hochsaison lieber 1–2. Wer heute schon Fragen hat, behält sie.</span></label>' +
          '<label class="feld"><span>Teamziel ' + monatKurz(jetzt) + ' – richtige Antworten aller zusammen</span><input type="number" name="teamziel" min="0" max="100000" value="' + esc(e.teamziel || "") + '" placeholder="z. B. 300"><span class="klein">Leer = kein Teamziel.</span></label>' +
          '<label class="feld"><span>Preis des Monats ' + monatKurz(jetzt) + '</span><input type="text" name="preis" maxlength="200" value="' + esc(e.preis || "") + '" placeholder="z. B. Gutschein Bäckerei 25 €"></label>' +
          '<label class="tf-check"><input type="checkbox" name="rangliste"' + (e.rangliste ? " checked" : "") + "><span><b>Rangliste zeigen</b><span class=\"klein\">Standard: aus. Ohne Rangliste sieht jeder nur seine eigenen Werte und die des Teams.</span></span></label>" +
          '<div class="tf-knoepfe"><button class="btn btn-primaer" type="submit">Speichern</button></div></form></section>' +
      '<section class="karte"><div class="karte-kopf"><div><h2>Verlosung</h2><p>Gewichtet nach Losen, mit dem Zufall des Betriebssystems. Das Ergebnis wird gespeichert und bleibt stehen.</p></div>' +
        '<select data-tf-select="verlosung-monat" aria-label="Monat">' + monate.map((x) => '<option value="' + x + '"' + (x === T.verlosungMonat ? " selected" : "") + ">" + monatsname(x) + "</option>").join("") + "</select></div>" +
        verlosungHtml + "</section></div>";
}

/* ------------------------------------------------------------ Wer bist du? */
function werBistDu() {
  const personen = T.start.personen || [];
  return '<div class="kopf"><div><h1>Tagesfragen</h1><p>Erst einmal: Wer arbeitet an diesem Rechner? (gilt auch für Projekte und Urlaub)</p></div></div>' +
    '<section class="karte pj-ich"><div class="pj-ich-inhalt">' +
    (personen.length ? '<div class="pj-ich-liste">' + personen.map((p) =>
      '<button class="pj-ich-person" data-tf="ich" data-id="' + esc(p.id) + '">' + avatar(p.id) + "<span>" + esc(p.name) + "</span></button>").join("") + "</div>" : "") +
    '<form class="pj-zeile-form" data-tf-form="person"><input type="text" name="name" placeholder="' + (personen.length ? "Oder neu: Vor- und Nachname" : "Vor- und Nachname") +
      '" autocomplete="off" required minlength="2" maxlength="60"><button class="btn btn-primaer" type="submit">' + (personen.length ? "Anlegen" : "Los geht’s") + "</button></form>" +
    '<p class="klein">Nach der Auswahl fragt ODIN im Tresor nach deiner PIN (beim ersten Mal legst du sie fest) – mit Microsoft angemeldet (<a href="#/konto">Konto &amp; Anmeldung</a>) geht es ohne.</p></div></section>';
}

async function ichSetzen(id) {
  await window.odinAnmelden(id);                       // Tresor: Person + PIN, erst dann gilt sie
  zuruecksetzen();
  eigenesIch = true;
  window.dispatchEvent(new Event("odin-ich"));          // Urlaub lädt neu
  window.dispatchEvent(new Event("odin-ich-urlaub"));   // Projekte und Heute & Woche laden neu
  eigenesIch = false;
  await laden();
  neu();
}

function zuruecksetzen() { T.start = null; T.fehler = ""; T.aufgeloest = null; T.monat = null; T.monatStand = null; T.liste = null; T.formular = null; T.verlosung = null; }

/* ------------------------------------------------------------ Seite */
function seite(rest) {
  if (!T.start) { if (!T.fehler) laden().then(neu); return { html: ladeAnzeige() }; }
  if (T.fehler) return { html: ladeAnzeige() };
  if (!T.start.ich) return { html: werBistDu() };
  const html = rest === "team" ? seiteTeam() : rest === "vorschlagen" ? seiteVorschlagen() : rest === "fragen" ? seiteFragen()
    : rest === "verlosung" ? seiteVerlosung() : seiteHeute();
  return { html };
}

async function nachAenderung(listeNeu = true) {
  if (listeNeu) T.liste = null;
  await laden();
  neu();
}

document.addEventListener("click", async (ev) => {
  const wahl = ev.target.closest("#inhalt [data-tf-wahl]");
  if (wahl) { if (wahl.getAttribute("aria-disabled") !== "true") antworten(wahl); return; }
  const k = ev.target.closest("#inhalt [data-tf]");
  if (!k) return;
  const art = k.dataset.tf;
  try {
    if (art === "neu-laden") { T.start = null; T.fehler = ""; neu(); }
    if (art === "ich") await ichSetzen(k.dataset.id);
    if (art === "weiter") weiter();
    if (art === "ueberspringen") {
      const r = await ruf("ueberspringen");
      T.start.heute = r.heute; T.start.stand = r.stand; T.aufgeloest = null;
      teilweiseNeu(true);
      meldung("Heute übersprungen – bis morgen!");
    }
    if (art === "doch") {
      const r = await ruf("ueberspringen", true);
      T.start.heute = r.heute; T.start.stand = r.stand;
      teilweiseNeu(true);
    }
    if (art === "monat") {
      const basis = (T.monatStand || T.start.stand).monat;
      const [j, m] = basis.split("-").map(Number);
      const d = new Date(j, m - 1 + Number(k.dataset.wert), 1);
      const ziel = d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0");
      T.monatStand = ziel === T.start.stand.monat ? null : await ruf("stand", ziel);
      const kal = document.getElementById("tf-kalender");
      if (kal) kal.outerHTML = kalenderHtml();
    }
    if (art === "neue-frage") { T.formular = { modus: "neu", frage: {} }; neu(); }
    if (art === "bearbeiten") { T.formular = { modus: "bearbeiten", frage: T.liste.eigene.find((f) => f.id === k.dataset.id) }; neu(); }
    if (art === "vorschlag-bearbeiten") { T.formular = { modus: "freigeben", frage: T.liste.vorschlaege.find((f) => f.id === k.dataset.id) }; neu(); }
    if (art === "formular-zu") { T.formular = null; neu(); }
    if (art === "aktiv") { await ruf("frage_aktiv", k.dataset.id, k.dataset.wert === "true"); meldung(k.dataset.wert === "true" ? "Frage eingeschaltet." : "Frage abgeschaltet."); await nachAenderung(); }
    if (art === "freigeben") { k.disabled = true; await ruf("vorschlag_entscheiden", k.dataset.id, true); meldung("Freigegeben – die Frage ist ab morgen dabei."); await nachAenderung(); }
    if (art === "ablehnen") {
      const kommentar = prompt("Kurz sagen, warum (sieht die Person, die vorgeschlagen hat):", "");
      if (kommentar === null) return;
      await ruf("vorschlag_entscheiden", k.dataset.id, false, null, kommentar);
      meldung("Vorschlag nicht übernommen.");
      await nachAenderung();
    }
    if (art === "auslosen") {
      if (!confirm("Jetzt für " + monatsname(T.verlosungMonat) + " auslosen? Das Ergebnis wird gespeichert.")) return;
      k.disabled = true;
      const r = await ruf("verlosen", T.verlosungMonat);
      meldung("Gewonnen hat " + r.ziehung.gewinner_name + "!");
      T.verlosung = null; await nachAenderung(false);
    }
  } catch (e) {
    meldung(String(e.message || e), true);
    if (k) k.disabled = false;
  }
});

document.addEventListener("change", async (ev) => {
  const s = ev.target.closest('#inhalt [data-tf-select="verlosung-monat"]');
  if (!s) return;
  T.verlosungMonat = s.value; T.verlosung = null; neu();
});

document.addEventListener("submit", async (ev) => {
  const f = ev.target.closest("#inhalt [data-tf-form]");
  if (!f) return;
  ev.preventDefault();
  const art = f.dataset.tfForm;
  const knopf = ev.submitter;
  if (knopf) knopf.disabled = true;
  try {
    if (art === "person") {
      const r = await window.pywebview.api.projekte_aufruf("person_anlegen", [{ name: new FormData(f).get("name") }]);
      if (!r || !r.ok) throw new Error((r && r.fehler) || "Anlegen hat nicht geklappt.");
      await ichSetzen(r.daten.id);
      meldung("Hallo " + r.daten.name.split(" ")[0] + "!");
    }
    if (art === "frage") {
      const eingabe = formularLesen(f);
      if (eingabe.richtig === null) throw new Error("Bitte die richtige Antwort anklicken.");
      const modus = f.dataset.modus;
      if (modus === "vorschlag") {
        await ruf("frage_vorschlagen", eingabe);
        meldung("Danke! Dein Vorschlag liegt bei den Verwaltern.");
        f.reset();
      } else if (modus === "freigeben") {
        await ruf("vorschlag_entscheiden", f.dataset.id, true, eingabe);
        meldung("Freigegeben – die Frage ist ab morgen dabei.");
      } else {
        await ruf("frage_speichern", modus === "bearbeiten" ? { ...eingabe, id: f.dataset.id } : eingabe);
        meldung("Frage gespeichert.");
      }
      T.formular = null;
      await nachAenderung();
    }
    if (art === "quellen") {
      const an = new FormData(f).getAll("quelle-an");
      await ruf("einstellungen_speichern", { aus: Object.keys(T.liste.schaltbar).filter((k) => !an.includes(k)) });
      meldung("Fragequellen gespeichert.");
      await nachAenderung();
    }
    if (art === "einstellungen") {
      const fd = new FormData(f);
      const e = T.start.einstellungen;
      await ruf("einstellungen_speichern", { fragen_je_tag: Number(fd.get("fragen_je_tag")), rangliste: !!fd.get("rangliste"),
        teamziel: { monat: e.monat, ziel: fd.get("teamziel") || null }, preis: { monat: e.monat, text: fd.get("preis") || "" } });
      meldung("Einstellungen gespeichert.");
      await nachAenderung(false);
    }
    if (art === "neu-auslosen") {
      const begruendung = new FormData(f).get("begruendung");
      if (!confirm("Wirklich erneut auslosen? Die bisherige Ziehung bleibt mit deiner Begründung sichtbar.")) return;
      const r = await ruf("verlosen", T.verlosungMonat, begruendung);
      meldung("Neu ausgelost – gewonnen hat " + r.ziehung.gewinner_name + ".");
      T.verlosung = null; await nachAenderung(false);
    }
  } catch (e) {
    meldung(String(e.message || e), true);
  } finally {
    if (knopf) knopf.disabled = false;
  }
});

/* Tastatur: 1–4 (oder A–D) wählt, Enter geht weiter – nur auf der Seite und nicht beim Tippen in Feldern */
document.addEventListener("keydown", (ev) => {
  if (!aufSeite() || ev.ctrlKey || ev.metaKey || ev.altKey || ev.repeat) return;
  if (ev.target.closest && ev.target.closest("input, textarea, select, [contenteditable]")) return;
  if (document.querySelector("dialog[open]")) return;
  if (ev.key === "Enter" && T.aufgeloest) {
    if (ev.target.closest && ev.target.closest("button:not(#tf-weiter)")) return;   // Fokus auf anderem Knopf: der gilt
    ev.preventDefault(); weiter(); return;
  }
  const i = "1234".indexOf(ev.key) >= 0 ? "1234".indexOf(ev.key) : "abcd".indexOf(String(ev.key).toLowerCase());
  if (i < 0 || T.aufgeloest) return;
  const knopf = document.querySelector('#tf-karte [data-tf-wahl="' + i + '"]:not([aria-disabled="true"])');
  if (knopf) { ev.preventDefault(); antworten(knopf); }
});

// „ich“ wurde anderswo gewählt (Projekte, Urlaub): alles neu
let eigenesIch = false;
const ichGewechselt = () => { if (eigenesIch) return; zuruecksetzen(); if (aufSeite()) laden().then(neu); else zaehlerLaden(); };
addEventListener("odin-ich", ichGewechselt);
addEventListener("odin-ich-urlaub", ichGewechselt);
// Beim Betreten frisch laden (neuer Tag, Fragen von anderen Rechnern, Einstellungen); beim Zurückkehren ins Fenster
// nur den Zähler
let zuletztGeladen = 0;
addEventListener("hashchange", (ev) => {
  const rein = aufSeite() && !String(ev.oldURL || "").includes("#/tagesfragen");
  if (!rein || Date.now() - zuletztGeladen < 3000) return;
  zuletztGeladen = Date.now();
  T.aufgeloest = null; T.monatStand = null; T.liste = null; T.verlosung = null;
  laden().then(() => { if (aufSeite()) neu(); });
});
addEventListener("focus", () => { if (!aufSeite()) zaehlerLaden(); });

window.ODIN_SEITEN = window.ODIN_SEITEN || {};
window.ODIN_SEITEN.tagesfragen = { render: seite, menue: () => "tagesfragen" };
if (aufSeite() && typeof window.cockpitZeichne === "function") window.cockpitZeichne();
const anfangen = () => { if (aufSeite()) laden().then(neu); else zaehlerLaden(); };
if (window.pywebview && window.pywebview.api) anfangen(); else addEventListener("pywebviewready", anfangen, { once: true });
})();
