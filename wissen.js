/* ODIN · Wissen & Einarbeitung
   Eine Seite mit Reitern: Abläufe (Checklisten-Vorlagen und Durchläufe), Anleitungen (Artikel je System),
   Einarbeitung (Pläne je Rolle, Fortschritt je Person), „Wer weiß was“, die verbindlichen Hausregeln (mitgeliefert,
   nur lesen) und „Offene Fragen“ (was der Fragen-Assistent nicht verstanden hat – bereinigt um Kundendaten).
   Daten: tirge_helfer/wissen.py über wissen_aufruf (Ablage im Ordner „Fahrzeuge“ unter _ODIN/Wissen).
   Seiten: #/wissen, #/wissen/<reiter>, #/wissen/ablauf|durchlauf|anleitung|plan|einarbeitung/<id> –
   eingehängt über window.ODIN_SEITEN (cockpit.js).
   Sicherheit: Jeder Text aus den Daten geht durch esc() – auch in Attributen. Anleitungen kommen als Bausteine
   (Absatz, Liste, Schritte, Titel) und werden hier zusammengesetzt, nie als HTML übernommen. Links nur mit
   http(s):// oder #/…; IDs nur a–z und 0–9; Farben nur als #RRGGBB. */
(() => {
"use strict";

const W = {
  start: null,            // Antwort von start(): ich, personen, systeme, Listen
  fehler: "",
  teile: new Map(),       // "art:id" -> Ansicht oder {fehler}
  kenner: null,           // Antwort von wer_weiss_was()
  suche: "", system: "", treffer: null, sucheNr: 0,
  bereich: "",            // Filter der Abläufe
  fertigeZeigen: false,
  fragen: null,           // Antwort von offene_fragen()
};

const REITER = [["ablaeufe", "Abläufe"], ["anleitungen", "Anleitungen"], ["einarbeitung", "Einarbeitung"], ["kenner", "Wer weiß was"],
  ["hausregeln", "Hausregeln"], ["fragen", "Offene Fragen"]];
const TEIL_ARTEN = ["ablauf", "durchlauf", "anleitung", "plan", "einarbeitung"];
const ID = /^[a-z0-9]{6,32}$/;
const esc = (s) => String(s ?? "").replace(/[&<>"'`]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;", "`": "&#96;" }[c]));
const ic = (n) => '<svg class="ic" aria-hidden="true"><use href="#ci-' + n + '"/></svg>';
const datum = (iso) => { const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(iso || "")); return m ? m[3] + "." + m[2] + "." + m[1] : ""; };
const kurz = (iso) => datum(iso).slice(0, 6);
const zeit = (iso) => { const m = /T(\d{2}:\d{2})/.exec(String(iso || "")); return datum(iso) + (m ? ", " + m[1] + " Uhr" : ""); };
const meldung = (text, fehler) => { if (typeof zeigeMeldung === "function") zeigeMeldung(text, fehler ? "x" : "check", !!fehler); };
const hashTeile = () => (location.hash || "").slice(2).split("/").map((t) => { try { return decodeURIComponent(t); } catch (e) { return ""; } });
const istMeineSeite = () => hashTeile()[0] === "wissen";
const farbe = (f) => /^#[0-9a-fA-F]{6}$/.test(String(f)) ? f : "#8A8586";
/* Nur Webadressen und Seiten in ODIN – nie javascript:, data:, file: … */
const sichererLink = (l) => typeof l === "string" && /^(https?:\/\/[^\s<>"'`\\]{3,480}|#\/[A-Za-z0-9/_-]{1,200})$/.test(l) ? l : "";
const mehrzahl = (n, eins, viele) => n + " " + (n === 1 ? eins : viele);

/* ------------------------------------------------------------ Schnittstelle (ändernde Aufrufe nacheinander) */
const LESEN = new Set(["start", "ablauf", "durchlauf", "anleitung", "plan", "einarbeitung", "suche", "wer_weiss_was", "offene_fragen"]);
let kette = Promise.resolve();
function ruf(aktion, ...args) {
  const los = async () => {
    const api = window.pywebview && window.pywebview.api;
    if (!api || typeof api.wissen_aufruf !== "function") throw new Error("Wissen & Einarbeitung gibt es nur im ODIN-Fenster am Rechner.");
    const r = await api.wissen_aufruf(aktion, args);
    if (!r || !r.ok) throw new Error((r && r.fehler) || "Unbekannter Fehler");
    // „ok“, aber ohne Inhalt: als Fehler behandeln – sonst lädt die Seite beim Neuzeichnen endlos nach
    if ((r.daten === null || r.daten === undefined) && LESEN.has(aktion)) throw new Error("Keine Daten erhalten – bitte nochmal versuchen.");
    return r.daten;
  };
  if (LESEN.has(aktion)) return los();
  const weiter = kette.then(los, los);
  kette = weiter.catch(() => null);
  return weiter;
}

/* ------------------------------------------------------------ Laden */
const laufend = new Map();
function einmal(schluessel, holen) {
  if (laufend.has(schluessel)) return laufend.get(schluessel);
  const p = holen().finally(() => laufend.delete(schluessel));
  laufend.set(schluessel, p);
  return p;
}
const ladeStart = () => einmal("start", () => ruf("start").then((s) => { W.start = s; W.fehler = ""; }).catch((e) => { W.fehler = String(e.message || e); }));
const ladeTeil = (art, id) => einmal(art + ":" + id, () => ruf(art, id)
  .then((d) => { W.teile.set(art + ":" + id, d); })
  .catch((e) => { W.teile.set(art + ":" + id, { fehler: String(e.message || e) }); }));
const ladeFragen = () => einmal("fragen", () => ruf("offene_fragen").then((f) => { W.fragen = f; }).catch((e) => { W.fragen = { fehler: String(e.message || e) }; }));
const ladeKenner = () => einmal("kenner", () => ruf("wer_weiss_was").then((k) => { W.kenner = k; }).catch((e) => { W.kenner = { fehler: String(e.message || e) }; }));
function nachLaden(versprechen) { versprechen.then(() => { if (istMeineSeite()) neuZeichnen(); }); }

/* Neu zeichnen: Scrollstand, Fokus und noch nicht gespeicherte Eingaben bleiben erhalten */
function neuZeichnen() {
  const inhalt = document.getElementById("inhalt");
  if (!inhalt || typeof window.cockpitZeichne !== "function") return;
  const aktiv = document.activeElement;
  const fokus = aktiv && aktiv.closest && aktiv.closest("#inhalt") && aktiv.dataset ? aktiv.dataset.fokus : null;
  let marke = null;
  try { if (fokus && typeof aktiv.selectionStart === "number") marke = [aktiv.selectionStart, aktiv.selectionEnd]; } catch (e) { marke = null; }
  const entwuerfe = [...inhalt.querySelectorAll("input[data-fokus], textarea[data-fokus]")]
    .filter((el) => el.value !== el.defaultValue).map((el) => [el.dataset.fokus, el.value]);
  const oben = inhalt.scrollTop;
  window.cockpitZeichne();
  inhalt.scrollTop = oben;
  for (const [k, v] of entwuerfe) { const el = [...inhalt.querySelectorAll("[data-fokus]")].find((x) => x.dataset.fokus === k); if (el) el.value = v; }
  if (fokus) {
    const f = [...inhalt.querySelectorAll("[data-fokus]")].find((x) => x.dataset.fokus === fokus);
    if (f) { f.focus({ preventScroll: true }); try { if (marke) f.setSelectionRange(marke[0], marke[1]); } catch (e) { /* ohne Marke */ } }
  }
}

function listenVeraltet() { W.start = W.start && { ...W.start, veraltet: true }; W.kenner = null; W.treffer = null; }
const agendaGeaendert = () => window.dispatchEvent(new Event("odin-wissen-geaendert"));

/* Änderung: Antwort übernehmen (Ansicht eines Teils), Listen beim nächsten Besuch frisch, neu zeichnen */
async function aendern(aktion, args, art) {
  try {
    const d = await ruf(aktion, ...args);
    if (art && d && d.id) W.teile.set(art + ":" + d.id, d);
    listenVeraltet();
    if (art === "durchlauf" || art === "einarbeitung") agendaGeaendert();
    neuZeichnen();
    return d || true;
  } catch (e) {
    meldung(String(e.message || e), true);
    return null;
  }
}

/* ------------------------------------------------------------ Personen und Bausteine */
const person = (id) => (W.start && W.start.personen.find((p) => p.id === id)) || null;
const name = (id) => { const p = person(id); return p ? p.name : "Unbekannt"; };
const avatar = (id) => { const p = person(id) || { name: "Unbekannt", kuerzel: "?", farbe: "" }; return '<span class="pj-avatar" style="--farbe:' + farbe(p.farbe) + '" title="' + esc(p.name) + '">' + esc(p.kuerzel) + "</span>"; };
const mitName = (id) => id ? '<span class="ws-person">' + avatar(id) + "<span>" + esc(name(id)) + "</span></span>" : "";
const personWahl = (feld, gewaehlt, leer) => '<select name="' + feld + '"><option value="">' + esc(leer) + "</option>" +
  W.start.personen.map((p) => '<option value="' + esc(p.id) + '"' + (p.id === gewaehlt ? " selected" : "") + ">" + esc(p.name) + "</option>").join("") + "</select>";
const balken = (fertig, gesamt) => '<span class="pj-fortschritt ws-balken" role="img" aria-label="' + fertig + " von " + gesamt + ' erledigt"><i style="width:' + (gesamt ? Math.round(100 * fertig / gesamt) : 0) + '%"></i></span>';
const statusPille = (x) => x.entwurf
  ? '<span class="pille warn" title="Noch von niemandem aus dem Betrieb geprüft">' + (x.startinhalt ? "Entwurf – bitte prüfen" : "Entwurf – noch nicht geprüft") + "</span>"
  : '<span class="pille gut">geprüft von ' + esc(name(x.geprueft_von)) + " am " + esc(datum(x.geprueft_am)) + "</span>";
const kennerZeile = (x) => x.kenner || x.kenner2
  ? '<span class="ws-kenner"><span class="klein">Kenner</span>' + mitName(x.kenner) + mitName(x.kenner2) + (x.kenner && x.kenner2 ? "" : '<span class="pille krit" title="Fällt diese Person aus, weiß es niemand">kein Zweiter</span>') + "</span>"
  : '<span class="ws-kenner"><span class="pille krit">kein Kenner eingetragen</span></span>';

function ladeAnzeige() {
  if (W.fehler) return '<div class="pj-leer"><h2>Wissen gerade nicht erreichbar</h2><p>' + esc(W.fehler) + '</p><button class="btn btn-primaer" data-ws="neu-laden">Nochmal versuchen</button></div>';
  return '<div class="laden" aria-label="Wird geladen"><i class="skelett" style="width:40%"></i><i class="skelett"></i><i class="skelett" style="width:70%"></i></div>';
}

function werBistDu() {
  const personen = W.start.personen || [];
  return '<div class="kopf"><div><h1>Wissen &amp; Einarbeitung</h1><p>Erst einmal: Wer arbeitet an diesem Rechner? (gilt auch für Projekte und Urlaub)</p></div></div>' +
    '<section class="karte pj-ich"><div class="pj-ich-inhalt">' +
    (personen.length ? '<div class="pj-ich-liste">' + personen.map((p) => '<button class="pj-ich-person" data-ws="ich" data-id="' + esc(p.id) + '">' + avatar(p.id) + "<span>" + esc(p.name) + "</span></button>").join("") + "</div>"
      : '<p class="leise">Noch keine Personen angelegt – bitte zuerst unter „Alle Projekte“ deinen Namen eintragen.</p>') +
    '<p class="klein">Bis zur Anmeldung mit Login merkt sich dieser Rechner, wer du bist.</p></div></section>';
}

function vorab() {
  if (W.fehler) return ladeAnzeige();
  if (!W.start) { nachLaden(ladeStart()); return ladeAnzeige(); }
  if (!W.start.ich) return werBistDu();
  if (W.start.veraltet) { W.start.veraltet = false; nachLaden(ladeStart()); }
  return "";
}

const kopf = (aktiv, aktionen) => (W.start.speicher.lokal ? '<div class="hinweis"><div><b>Nur auf diesem Rechner.</b> Der Ordner „Fahrzeuge“ ist nicht verbunden – andere sehen das Wissen erst, wenn er unter „Auftragsbestätigungen“ verbunden ist.</div></div>' : "") +
  '<div class="kopf"><div><h1>Wissen &amp; Einarbeitung</h1><p>Damit die Qualität nicht davon abhängt, wer gerade da ist: Abläufe als Checklisten, Anleitungen je System und ein Plan für jeden Neuen.</p></div>' +
  '<div class="kopf-aktionen">' + (aktionen || "") + "</div></div>" +
  '<div class="ws-leiste"><nav class="pj-segment ws-reiter" role="tablist" aria-label="Bereiche im Wissen">' + REITER.map(([k, t]) =>
    '<a role="tab" href="#/wissen/' + k + '" aria-selected="' + (k === aktiv) + '">' + esc(t) + "</a>").join("") + "</nav>" +
  '<span class="ws-geheim">' + ic("schloss") + "Keine Passwörter oder Zugangsdaten ins Wissen – nur, wo sie zu finden sind.</span></div>";

const krumen = (reiter, titel) => '<p class="pj-krumen"><a href="#/wissen/' + reiter[0] + '">' + esc(reiter[1]) + "</a> / " + esc(titel) + "</p>";
const teilFehlt = (reiter, d) => '<div class="pj-leer">' + krumen(reiter, "nicht gefunden") + "<h2>Nicht gefunden</h2><p>" + esc(d.fehler) + '</p><a class="btn" href="#/wissen/' + reiter[0] + '">Zurück</a></div>';

/* ------------------------------------------------------------ Reiter: Abläufe */
function durchlaufZeile(d) {
  const bezug = [d.fahrzeug, d.kunde].filter(Boolean).join(" · ");
  return '<li><a class="ws-zeile" href="#/wissen/durchlauf/' + esc(d.id) + '">' +
    '<span class="ws-zeile-haupt"><span class="ws-zeile-titel">' + esc(d.titel) + "</span>" +
      '<span class="ws-zeile-meta">' + (bezug ? '<span class="pj-chip mono">' + esc(bezug) + "</span>" : "") +
        (d.abgeschlossen ? '<span class="pille gut">abgeschlossen ' + esc(kurz(d.abgeschlossen_am)) + "</span>"
          : d.ueberfaellig ? '<span class="pille krit">überfällig seit ' + esc(kurz(d.ziel)) + "</span>"
          : d.ziel ? '<span class="klein">bis ' + esc(kurz(d.ziel)) + "</span>" : "") + "</span></span>" +
    '<span class="ws-zeile-rechts"><span class="klein ws-zahl">' + d.fertig + " / " + d.gesamt + "</span>" + balken(d.fertig, d.gesamt) + (d.zustaendig ? avatar(d.zustaendig) : "") + "</span></a></li>";
}

function seiteAblaeufe() {
  const s = W.start, offen = s.durchlaeufe.filter((d) => !d.abgeschlossen), fertig = s.durchlaeufe.filter((d) => d.abgeschlossen);
  const bereiche = [...new Set(s.ablaeufe.map((a) => a.bereich || "Ohne Bereich"))];
  const liste = s.ablaeufe.filter((a) => !W.bereich || (a.bereich || "Ohne Bereich") === W.bereich);
  const karten = liste.map((a) => '<article class="karte ws-karte">' +
    '<a class="ws-karte-titel" href="#/wissen/ablauf/' + esc(a.id) + '">' + esc(a.titel) + "</a>" +
    (a.zweck ? '<p class="ws-zweck">' + esc(a.zweck) + "</p>" : "") +
    '<div class="ws-karte-meta">' + (a.bereich ? '<span class="pj-chip">' + esc(a.bereich) + "</span>" : "") +
      '<span class="klein">' + mehrzahl(a.schritte, "Schritt", "Schritte") + (a.rolle ? " · " + esc(a.rolle) : "") + "</span>" + statusPille(a) +
      (a.offen ? '<span class="pille info">' + mehrzahl(a.offen, "Durchlauf", "Durchläufe") + " offen</span>" : "") + "</div>" +
    '<div class="ws-karte-fuss">' + kennerZeile(a) + '<button class="btn" data-ws="durchlauf-neu" data-id="' + esc(a.id) + '">Durchlauf starten</button></div></article>').join("");
  return kopf("ablaeufe", '<button class="btn btn-primaer" data-ws="ablauf-neu">' + ic("plus") + "Neuer Ablauf</button>") +
    '<section class="karte ws-liste"><div class="karte-kopf"><div><h2>Offene Durchläufe</h2><p>Gestartete Checklisten, die noch nicht abgeschlossen sind – überfällige zuerst sichtbar.</p></div></div>' +
      (offen.length ? "<ul>" + offen.map(durchlaufZeile).join("") + "</ul>" : '<p class="ws-leer">Gerade läuft kein Durchlauf. Unten einen Ablauf wählen und „Durchlauf starten“.</p>') +
      (fertig.length ? '<div class="ws-mehr"><button class="mini" data-ws="fertige">' + (W.fertigeZeigen ? "Abgeschlossene ausblenden" : "Abgeschlossene zeigen (" + fertig.length + ")") + "</button></div>" +
        (W.fertigeZeigen ? "<ul>" + fertig.map(durchlaufZeile).join("") + "</ul>" : "") : "") + "</section>" +
    '<div class="ws-werkzeuge"><h2>Vorlagen</h2><div class="filter" role="group" aria-label="Bereich">' +
      '<button class="' + (!W.bereich ? "aktiv" : "") + '" data-ws="bereich" data-wert="" aria-pressed="' + !W.bereich + '">Alle</button>' +
      bereiche.map((b) => '<button class="' + (W.bereich === b ? "aktiv" : "") + '" data-ws="bereich" data-wert="' + esc(b) + '" aria-pressed="' + (W.bereich === b) + '">' + esc(b) + "</button>").join("") + "</div></div>" +
    (liste.length ? '<div class="ws-karten">' + karten + "</div>"
      : '<div class="pj-leer"><h2>Noch keine Abläufe</h2><p>Ein Ablauf ist eine Checkliste für etwas, das immer wieder gleich laufen soll – zum Beispiel der Check-in eines Neufahrzeugs.</p><button class="btn btn-primaer" data-ws="ablauf-neu">Ersten Ablauf anlegen</button></div>');
}

function seiteAblauf(id) {
  const a = W.teile.get("ablauf:" + id);
  if (!a) { nachLaden(ladeTeil("ablauf", id)); return ladeAnzeige(); }
  if (a.fehler) return teilFehlt(REITER[0], a);
  const laeufe = a.durchlaeufe || [];
  return '<div class="kopf ws-kopf"><div>' + krumen(REITER[0], a.titel) + "<h1>" + esc(a.titel) + "</h1>" +
      (a.zweck ? '<p class="ws-zweck">' + esc(a.zweck) + "</p>" : "") +
      '<div class="ws-meta">' + statusPille(a) + (a.bereich ? '<span class="pj-chip">' + esc(a.bereich) + "</span>" : "") +
        (a.rolle ? '<span class="klein">verantwortlich: ' + esc(a.rolle) + "</span>" : "") + kennerZeile(a) + "</div></div>" +
    '<div class="kopf-aktionen"><button class="btn btn-primaer" data-ws="durchlauf-neu" data-id="' + esc(a.id) + '">Durchlauf starten</button>' +
      '<button class="btn" data-ws="ablauf-bearbeiten">Bearbeiten</button>' + werkzeugKnoepfe("ablauf", a) + "</div></div>" +
    (a.startinhalt && a.entwurf ? '<div class="hinweis ws-entwurf"><div><b>Mitgelieferter Entwurf.</b> Allgemeines Branchenwissen als Gerüst – bitte durchgehen, an euren Betrieb anpassen und erst dann auf „geprüft“ setzen.</div></div>' : "") +
    '<div class="ws-raster"><section class="karte"><div class="karte-kopf"><div><h2>Schritte</h2><p>So läuft es jedes Mal – in dieser Reihenfolge.</p></div></div>' +
      '<ol class="ws-schritte">' + a.schritte.map((s) => "<li><div><b>" + esc(s.text) + "</b>" + (s.notiz_pflicht ? ' <span class="pj-chip warn">Notiz ist Pflicht</span>' : "") +
        (s.hinweis ? '<p class="ws-hinweis"><span>Woran erkenne ich, dass es stimmt?</span> ' + esc(s.hinweis) + "</p>" : "") + "</div></li>").join("") + "</ol></section>" +
    '<section class="karte ws-liste"><div class="karte-kopf"><div><h2>Durchläufe</h2><p>Ein Durchlauf behält die Schritte vom Tag seines Starts – auch wenn die Vorlage später geändert wird.</p></div></div>' +
      (laeufe.length ? "<ul>" + laeufe.map(durchlaufZeile).join("") + "</ul>" : '<p class="ws-leer">Noch kein Durchlauf gestartet.</p>') + "</section></div>";
}

const werkzeugKnoepfe = (art, x) =>
  '<button class="btn" data-ws="pruefen" data-art="' + art + '" data-wert="' + (x.entwurf ? "1" : "") + '">' + (x.entwurf ? ic("haken") + "Als geprüft markieren" : "Zurück auf Entwurf") + "</button>" +
  '<button class="btn" data-ws="markdown" data-art="' + art + '" title="Als Textdatei speichern, z. B. für SharePoint (musterOS)">Als Markdown speichern</button>' +
  '<button class="btn ws-gefahr" data-ws="loeschen" data-art="' + art + '">Löschen</button>';

/* ------------------------------------------------------------ Durchlauf */
function seiteDurchlauf(id) {
  const d = W.teile.get("durchlauf:" + id);
  if (!d) { nachLaden(ladeTeil("durchlauf", id)); return ladeAnzeige(); }
  if (d.fehler) return teilFehlt(REITER[0], d);
  const zu = d.abgeschlossen, bezug = [d.fahrzeug ? "Fahrzeug " + d.fahrzeug : "", d.kunde ? "Kunde " + d.kunde : ""].filter(Boolean).join(" · ");
  return '<div class="kopf ws-kopf"><div>' + krumen(REITER[0], d.titel) + "<h1>" + esc(d.titel) + "</h1>" +
      '<div class="ws-meta">' + (bezug ? '<span class="pj-chip mono">' + esc(bezug) + "</span>" : "") +
        (zu ? '<span class="pille gut">abgeschlossen am ' + esc(datum(d.abgeschlossen_am)) + " von " + esc(name(d.abgeschlossen_von)) + "</span>"
          : d.ueberfaellig ? '<span class="pille krit">überfällig seit ' + esc(datum(d.ziel)) + "</span>" : d.ziel ? '<span class="klein">Ziel: ' + esc(datum(d.ziel)) + "</span>" : "") +
        '<span class="klein">gestartet am ' + esc(datum(d.gestartet_am)) + " von " + esc(name(d.gestartet_von)) + "</span>" +
        (d.ablauf_id ? '<a class="klein" href="#/wissen/ablauf/' + esc(d.ablauf_id) + '">zur Vorlage</a>' : "") + "</div>" +
      '<div class="ws-fortschritt"><b>' + d.fertig + " von " + d.gesamt + "</b>" + balken(d.fertig, d.gesamt) + "</div></div>" +
    '<div class="kopf-aktionen">' + (zu ? '<button class="btn" data-ws="durchlauf-zu" data-wert="">Wieder öffnen</button>'
        : '<button class="btn btn-primaer" data-ws="durchlauf-zu" data-wert="1"' + (d.fertig < d.gesamt ? ' title="Erst alle Schritte abhaken"' : "") + ">Abschließen</button>") +
      '<button class="btn ws-gefahr" data-ws="loeschen" data-art="durchlauf">Löschen</button></div></div>' +
    '<section class="karte"><ol class="ws-abhaken">' + d.schritte.map((s) => '<li class="' + (s.erledigt ? "fertig" : "") + '">' +
      '<button class="pj-haken' + (s.erledigt ? " an" : "") + '" data-ws="schritt" data-id="' + esc(s.id) + '" aria-pressed="' + !!s.erledigt + '"' + (zu ? " disabled" : "") +
        ' title="' + (s.erledigt ? "Haken zurücknehmen" : "Erledigt") + '" aria-label="' + esc(s.text) + '">' + ic("aufgaben") + "</button>" +
      '<div class="ws-abhaken-haupt"><b>' + esc(s.text) + "</b>" + (s.notiz_pflicht ? ' <span class="pj-chip warn">Notiz ist Pflicht</span>' : "") +
        (s.hinweis ? '<p class="ws-hinweis"><span>Woran erkenne ich, dass es stimmt?</span> ' + esc(s.hinweis) + "</p>" : "") +
        '<textarea rows="1" maxlength="2000" placeholder="' + (s.notiz_pflicht ? "Notiz (Pflicht): was war?" : "Notiz (optional)") + '" data-still="durchlauf:' + esc(s.id) + '" data-fokus="dn-' + esc(s.id) + '"' + (zu ? " readonly" : "") + ">" + esc(s.notiz) + "</textarea>" +
        (s.erledigt ? '<span class="klein">abgehakt von ' + esc(name(s.erledigt_von)) + " am " + esc(zeit(s.erledigt_am)) + "</span>" : "") + "</div></li>").join("") + "</ol></section>";
}

/* ------------------------------------------------------------ Reiter: Anleitungen */
function seiteAnleitungen() {
  const s = W.start, sucht = W.suche.trim().length > 0;
  if (sucht && !W.treffer) nachSuche();
  const liste = sucht ? (W.treffer || []) : s.anleitungen.filter((a) => !W.system || a.system === W.system);
  const zeile = (a) => '<li><a class="ws-zeile" href="#/wissen/anleitung/' + esc(a.id) + '">' +
    '<span class="ws-zeile-haupt"><span class="ws-zeile-titel">' + esc(a.titel) + "</span>" +
      (a.ausschnitt ? '<span class="ws-ausschnitt">' + esc(a.ausschnitt) + "</span>" : "") +
      '<span class="ws-zeile-meta">' + (sucht && a.system ? '<span class="pj-chip">' + esc(a.system) + "</span>" : "") +
        (a.kategorie ? '<span class="klein">' + esc(a.kategorie) + "</span>" : "") + statusPille(a) + '<span class="klein">Stand ' + esc(datum(a.stand)) + "</span></span></span>" +
    '<span class="ws-zeile-rechts">' + (a.kenner ? avatar(a.kenner) : "") + (a.kenner2 ? avatar(a.kenner2) : "") + "</span></a></li>";
  const systeme = sucht ? [""] : s.systeme.filter((x) => !W.system || x === W.system);
  const gruppen = sucht ? (liste.length ? '<section class="karte ws-liste"><ul>' + liste.map(zeile).join("") + "</ul></section>" : '<div class="pj-leer klein"><p>' + (W.treffer ? "Nichts gefunden – anderes Wort versuchen oder den Filter lösen." : "Sucht …") + "</p></div>")
    : systeme.map((sys) => { const eigene = liste.filter((a) => a.system === sys);
      return '<section class="karte ws-liste"><div class="karte-kopf"><div><h2>' + esc(sys) + "</h2></div>" +
        '<button class="mini" data-ws="anleitung-neu" data-system="' + esc(sys) + '">+ Anleitung</button></div>' +
        (eigene.length ? "<ul>" + eigene.map(zeile).join("") + "</ul>" : '<p class="ws-leer">Noch keine Anleitung zu ' + esc(sys) + ".</p>") + "</section>"; }).join("");
  return kopf("anleitungen", '<button class="btn" data-ws="system-neu">System anlegen</button><button class="btn btn-primaer" data-ws="anleitung-neu" data-system="' + esc(W.system) + '">' + ic("plus") + "Neue Anleitung</button>") +
    '<div class="ws-werkzeuge"><label class="pj-suche ws-suche"><svg class="ic" aria-hidden="true"><use href="#i-search"/></svg><input type="search" placeholder="In Titel und Text suchen" value="' + esc(W.suche) + '" data-ws-suche data-fokus="ws-suche" maxlength="200"></label>' +
      '<div class="filter" role="group" aria-label="System"><button class="' + (!W.system ? "aktiv" : "") + '" data-ws="system" data-wert="" aria-pressed="' + !W.system + '">Alle</button>' +
      s.systeme.map((x) => '<button class="' + (W.system === x ? "aktiv" : "") + '" data-ws="system" data-wert="' + esc(x) + '" aria-pressed="' + (W.system === x) + '">' + esc(x) + "</button>").join("") + "</div></div>" + gruppen;
}

function nachSuche() {
  const nr = ++W.sucheNr;
  ruf("suche", W.suche, W.system).then((t) => { if (nr === W.sucheNr) { W.treffer = Array.isArray(t) ? t : []; if (istMeineSeite()) neuZeichnen(); } })
    .catch((e) => { if (nr === W.sucheNr) { W.treffer = []; meldung(String(e.message || e), true); } });
}

/* Bausteine aus wissen.py → Anzeige. Jedes Stück Text wird maskiert; HTML im Artikel bleibt sichtbarer Text. */
const stuecke = (teile) => (Array.isArray(teile) ? teile : []).map((t) => t && t.f ? "<b>" + esc(t.t) + "</b>" : esc(t && t.t)).join("");
function bausteine(bloecke) {
  return (Array.isArray(bloecke) ? bloecke : []).map((b) => {
    if (!b) return "";
    if (b.art === "titel") return "<h3>" + stuecke(b.teile) + "</h3>";
    if (b.art === "liste") return "<ul>" + (b.punkte || []).map((p) => "<li>" + stuecke(p) + "</li>").join("") + "</ul>";
    if (b.art === "schritte") { const start = Number.isInteger(b.start) && b.start > 1 && b.start < 1000 ? ' start="' + b.start + '"' : "";
      return "<ol" + start + ">" + (b.punkte || []).map((p) => "<li>" + stuecke(p) + "</li>").join("") + "</ol>"; }
    if (b.art === "absatz") return "<p>" + (b.zeilen || []).map(stuecke).join("<br>") + "</p>";
    if (b.art === "bild") return bild(b);
    return "";
  }).join("");
}
/* Bild aus dem Programm (ui/wissen-bilder/) – nur ein fester Dateiname, nie eine Adresse aus den Daten. */
const BILD_NAME = /^[A-Za-z0-9_-]{1,80}\.png$/;
function bild(b) {
  if (typeof b.datei !== "string" || !BILD_NAME.test(b.datei)) return "";
  const text = typeof b.text === "string" ? b.text : "";
  return '<figure class="ws-bild"><img src="wissen-bilder/' + b.datei + '" alt="' + esc(text) + '" loading="lazy">' +
    (text ? "<figcaption>" + esc(text) + "</figcaption>" : "") + "</figure>";
}

function seiteAnleitung(id) {
  const a = W.teile.get("anleitung:" + id);
  if (!a) { nachLaden(ladeTeil("anleitung", id)); return ladeAnzeige(); }
  if (a.fehler) return teilFehlt(REITER[1], a);
  const link = sichererLink(a.link);
  return '<div class="kopf ws-kopf"><div>' + krumen(REITER[1], a.titel) + "<h1>" + esc(a.titel) + "</h1>" +
      '<div class="ws-meta">' + statusPille(a) + (a.system ? '<span class="pj-chip">' + esc(a.system) + "</span>" : "") +
        (a.kategorie ? '<span class="klein">' + esc(a.kategorie) + "</span>" : "") + '<span class="klein">Stand ' + esc(datum(a.stand)) + "</span>" + kennerZeile(a) + "</div></div>" +
    '<div class="kopf-aktionen"><button class="btn btn-primaer" data-ws="anleitung-bearbeiten">Bearbeiten</button>' + werkzeugKnoepfe("anleitung", a) + "</div></div>" +
    (a.startinhalt && a.entwurf ? '<div class="hinweis ws-entwurf"><div><b>Mitgelieferter Entwurf.</b> ' + (a.geruest
      ? "Ein Gerüst mit Überschriften – was fehlt, weiß nur euer Betrieb. Am besten zehn Minuten diktieren und hier einfügen."
      : "Bitte einmal mit dem echten Ablauf vergleichen, Abweichungen bei euch ergänzen und dann auf „geprüft“ setzen.") + "</div></div>" : "") +
    '<article class="karte ws-artikel">' + (a.bloecke && a.bloecke.length ? bausteine(a.bloecke) : '<p class="leise">Noch kein Text.</p>') +
      (link ? '<p class="ws-aufzeichnung">' + ic("foto") + '<a href="' + esc(link) + '" target="_blank" rel="noopener noreferrer">Aufzeichnung ansehen</a></p>' : "") + "</article>";
}

/* ------------------------------------------------------------ Reiter: Einarbeitung */
function seiteEinarbeitungen() {
  const s = W.start, laufend = s.einarbeitungen.filter((e) => !e.abgeschlossen), fertig = s.einarbeitungen.filter((e) => e.abgeschlossen);
  const karte = (e) => '<a class="karte ws-karte ws-person-karte" href="#/wissen/einarbeitung/' + esc(e.id) + '">' +
    '<span class="ws-person-kopf">' + avatar(e.person) + '<span><b>' + esc(name(e.person)) + '</b><span class="klein">' + esc(e.rolle) + " · seit " + esc(datum(e.start)) + "</span></span></span>" +
    '<span class="ws-fortschritt"><b>' + e.prozent + " %</b>" + balken(e.fertig, e.gesamt) + "</span>" +
    '<span class="ws-karte-meta"><span class="klein">' + e.fertig + " von " + e.gesamt + " kann er oder sie selbst · " + e.gezeigt + " gezeigt</span>" +
      (e.abgeschlossen ? '<span class="pille gut">abgeschlossen</span>' : e.ueberfaellig ? '<span class="pille krit">' + mehrzahl(e.ueberfaellig, "Schritt", "Schritte") + " überfällig</span>"
        : e.naechster ? '<span class="klein">nächster Termin ' + esc(kurz(e.naechster)) + "</span>" : "") + "</span>" +
    '<span class="ws-karte-fuss"><span class="ws-kenner"><span class="klein">Pate</span>' + mitName(e.pate) + "</span></span></a>";
  return kopf("einarbeitung", '<button class="btn" data-ws="plan-neu">Neuer Plan</button><button class="btn btn-primaer" data-ws="einarbeitung-neu">' + ic("plus") + "Einarbeitung starten</button>") +
    '<div class="ws-werkzeuge"><h2>Wer wird gerade eingearbeitet</h2></div>' +
    (laufend.length ? '<div class="ws-karten">' + laufend.map(karte).join("") + "</div>"
      : '<div class="pj-leer klein"><p>Gerade wird niemand eingearbeitet. „Einarbeitung starten“: Person, Rolle, Startdatum und Pate wählen – die Termine rechnet ODIN aus.</p></div>') +
    (fertig.length ? '<div class="ws-werkzeuge"><h2>Abgeschlossen</h2></div><div class="ws-karten">' + fertig.map(karte).join("") + "</div>" : "") +
    '<div class="ws-werkzeuge"><h2>Pläne je Rolle</h2></div>' +
    (s.plaene.length ? '<section class="karte ws-liste"><ul>' + s.plaene.map((p) => '<li><a class="ws-zeile" href="#/wissen/plan/' + esc(p.id) + '"><span class="ws-zeile-haupt"><span class="ws-zeile-titel">' + esc(p.rolle) + "</span></span>" +
        '<span class="ws-zeile-rechts">' + (p.startinhalt ? '<span class="pille warn">Entwurf – bitte prüfen</span>' : "") + '<span class="klein">' + mehrzahl(p.schritte, "Schritt", "Schritte") + "</span></span></a></li>").join("") + "</ul></section>"
      : '<div class="pj-leer klein"><p>Noch kein Plan. Ein Plan sagt je Rolle, was am ersten Tag, in der ersten Woche, im ersten Monat und nach 90 Tagen sitzen soll.</p></div>');
}

function verweis(v) {
  if (v && v.art === "beirat" && ID.test(String(v.id))) {       // Modul aus „Beirat & Coaching“ (mitgeliefert)
    const m = (W.start.beirat || []).find((x) => x.id === v.id);
    return m ? '<a class="pj-chip ws-verweis" href="#/beirat/modul/' + esc(v.id) + '">Beirat: ' + esc(m.titel) + "</a>" : "";
  }
  if (!v || !ID.test(String(v.id)) || !["ablauf", "anleitung"].includes(v.art)) return "";
  const ziel = (v.art === "ablauf" ? W.start.ablaeufe : W.start.anleitungen).find((x) => x.id === v.id);
  return ziel ? '<a class="pj-chip ws-verweis" href="#/wissen/' + v.art + "/" + esc(v.id) + '">' + (v.art === "ablauf" ? "Ablauf: " : "Anleitung: ") + esc(ziel.titel) + "</a>"
    : '<span class="pj-chip leise">Verweis gibt es nicht mehr</span>';
}

function phasen(schritte, zeile, zusatz) {
  return W.start.phasen.map((ph) => { const eigene = schritte.filter((s) => s.phase === ph.id);
    return eigene.length ? '<section class="karte ws-phase"><div class="karte-kopf"><div><h2>' + esc(ph.titel) + "</h2><p>" + esc(zusatz(ph, eigene)) + "</p></div></div><ul>" + eigene.map(zeile).join("") + "</ul></section>" : ""; }).join("");
}

function seitePlan(id) {
  const p = W.teile.get("plan:" + id);
  if (!p) { nachLaden(ladeTeil("plan", id)); return ladeAnzeige(); }
  if (p.fehler) return teilFehlt(REITER[2], p);
  return '<div class="kopf ws-kopf"><div>' + krumen(REITER[2], "Plan " + p.rolle) + "<h1>Einarbeitungsplan: " + esc(p.rolle) + "</h1>" +
      '<div class="ws-meta">' + (p.startinhalt ? '<span class="pille warn">Entwurf – bitte prüfen</span>' : "") + '<span class="klein">' + mehrzahl(p.schritte.length, "Schritt", "Schritte") + " · dazu kommen automatisch die Gespräche nach 30 und 90 Tagen</span></div></div>" +
    '<div class="kopf-aktionen"><button class="btn btn-primaer" data-ws="plan-bearbeiten">Bearbeiten</button><button class="btn" data-ws="einarbeitung-neu" data-plan="' + esc(p.id) + '">Einarbeitung starten</button>' +
      '<button class="btn ws-gefahr" data-ws="loeschen" data-art="plan">Löschen</button></div></div>' +
    phasen(p.schritte, (s) => '<li class="ws-schritt"><div class="ws-schritt-haupt"><b>' + esc(s.text) + "</b>" + verweis(s.verweis) + "</div></li>",
      (ph) => ph.tage ? "fällig " + ph.tage + " Tage nach dem Start" : "fällig am ersten Tag");
}

function seiteEinarbeitung(id) {
  const e = W.teile.get("einarbeitung:" + id);
  if (!e) { nachLaden(ladeTeil("einarbeitung", id)); return ladeAnzeige(); }
  if (e.fehler) return teilFehlt(REITER[2], e);
  const darf = e.beteiligt && !e.abgeschlossen, aus = darf ? "" : " disabled", heute = W.start.heute;
  const zeile = (s) => {
    const spaet = !s.fertig && s.faellig && s.faellig < heute && !e.abgeschlossen;
    if (s.gespraech) return '<li class="ws-schritt ws-gespraech' + (s.fertig ? " fertig" : "") + '"><div class="ws-schritt-haupt"><b>' + esc(s.text) + "</b>" +
        (spaet ? '<span class="pille krit">überfällig</span>' : "") +
        '<ul class="ws-leitfragen">' + s.leitfragen.map((f) => "<li>" + esc(f) + "</li>").join("") + "</ul>" +
        (s.notiz_verborgen ? '<p class="klein">Die Notizen zum Gespräch sehen nur ' + esc(name(e.person)) + ", der Pate und wer die Einarbeitung angelegt hat.</p>"
          : '<textarea rows="2" maxlength="2000" placeholder="Notizen zum Gespräch" data-still="einarbeitung:' + esc(s.id) + '" data-fokus="en-' + esc(s.id) + '"' + (darf ? "" : " readonly") + ">" + esc(s.notiz) + "</textarea>") + "</div>" +
      '<div class="ws-haken"><button class="ws-schalter' + (s.gefuehrt ? " an" : "") + '" data-ws="e-schritt" data-feld="gefuehrt" data-id="' + esc(s.id) + '" aria-pressed="' + !!s.gefuehrt + '"' + aus + ">" + ic("haken") + "Gespräch geführt</button></div></li>";
    return '<li class="ws-schritt' + (s.fertig ? " fertig" : "") + '"><div class="ws-schritt-haupt"><b>' + esc(s.text) + "</b>" + (spaet ? '<span class="pille krit">überfällig</span>' : "") + verweis(s.verweis) + "</div>" +
      '<div class="ws-haken"><button class="ws-schalter' + (s.gezeigt_von ? " an" : "") + '" data-ws="e-schritt" data-feld="gezeigt" data-id="' + esc(s.id) + '" aria-pressed="' + !!s.gezeigt_von + '"' + aus +
          ' title="' + (s.gezeigt_von ? "gezeigt am " + esc(zeit(s.gezeigt_am)) : "Der Pate hat es gezeigt") + '">' + ic("haken") + (s.gezeigt_von ? "gezeigt von " + esc(name(s.gezeigt_von).split(" ")[0]) : "gezeigt") + "</button>" +
        '<button class="ws-schalter selbst' + (s.kann ? " an" : "") + '" data-ws="e-schritt" data-feld="kann" data-id="' + esc(s.id) + '" aria-pressed="' + !!s.kann + '"' + aus + ">" + ic("haken") + "kann es selbst</button></div></li>";
  };
  return '<div class="kopf ws-kopf"><div>' + krumen(REITER[2], name(e.person)) + "<h1>Einarbeitung: " + esc(name(e.person)) + "</h1>" +
      '<div class="ws-meta"><span class="pj-chip">' + esc(e.rolle) + '</span><span class="klein">Start ' + esc(datum(e.start)) + '</span><span class="ws-kenner"><span class="klein">Pate</span>' + mitName(e.pate) + "</span>" +
        (e.abgeschlossen ? '<span class="pille gut">abgeschlossen</span>' : e.ueberfaellig ? '<span class="pille krit">' + mehrzahl(e.ueberfaellig, "Schritt", "Schritte") + " überfällig</span>" : "") + "</div>" +
      '<div class="ws-fortschritt"><b>' + e.prozent + " %</b>" + balken(e.fertig, e.gesamt) + '<span class="klein">' + e.fertig + " von " + e.gesamt + " erledigt · " + e.gezeigt + " gezeigt</span></div></div>" +
    '<div class="kopf-aktionen">' + (e.beteiligt ? '<button class="btn' + (e.abgeschlossen ? "" : " btn-primaer") + '" data-ws="einarbeitung-zu" data-wert="' + (e.abgeschlossen ? "" : "1") + '">' + (e.abgeschlossen ? "Wieder öffnen" : "Abschließen") + "</button>" +
      '<button class="btn ws-gefahr" data-ws="loeschen" data-art="einarbeitung">Löschen</button>' : "") + "</div></div>" +
    (e.beteiligt ? "" : '<div class="hinweis"><div>Abhaken können hier nur ' + esc(name(e.person)) + ", der Pate und wer die Einarbeitung angelegt hat.</div></div>") +
    phasen(e.schritte, zeile, (ph, eigene) => "fällig bis " + datum(eigene[0].faellig) + " · " + eigene.filter((s) => s.fertig).length + " von " + eigene.length + " erledigt");
}

/* ------------------------------------------------------------ Reiter: Wer weiß was */
function seiteKenner() {
  if (!W.kenner) { nachLaden(ladeKenner()); return kopf("kenner") + ladeAnzeige(); }
  const k = W.kenner;
  if (k.fehler) return kopf("kenner") + '<div class="pj-leer"><p>' + esc(k.fehler) + "</p></div>";
  const zeile = (t) => '<tr class="' + (t.risiko ? "risiko" : "") + '"><td>' + (t.art === "ablauf" && ID.test(t.id) ? '<a href="#/wissen/ablauf/' + esc(t.id) + '">' + esc(t.name) + "</a>" : "<b>" + esc(t.name) + "</b>") +
      '<span class="klein">' + (t.art === "system" ? "System · " + mehrzahl(t.inhalt, "Anleitung", "Anleitungen") + ", " + t.geprueft + " geprüft" : "Ablauf · " + (t.geprueft ? "geprüft" : "Entwurf")) + "</span></td>" +
    "<td>" + (t.kenner[0] ? mitName(t.kenner[0]) : '<span class="leise">–</span>') + "</td>" +
    "<td>" + (t.kenner.length > 1 ? t.kenner.slice(1).map(mitName).join("") : '<span class="leise">–</span>') + "</td>" +
    "<td>" + (t.risiko ? '<span class="pille krit">Risiko: hängt an einer Person</span><span class="klein">' + esc(t.gruende.join(" · ")) + "</span>" : '<span class="pille gut">abgesichert</span>') + "</td></tr>";
  const tabelle = (titel, text, liste) => liste.length ? '<section class="karte"><div class="karte-kopf"><div><h2>' + titel + "</h2><p>" + text + '</p></div></div><div class="ws-tabelle"><table><thead><tr><th>Thema</th><th>Kenner</th><th>Zweiter</th><th>Stand</th></tr></thead><tbody>' + liste.map(zeile).join("") + "</tbody></table></div></section>" : "";
  return kopf("kenner") +
    '<div class="ws-zahlen"><div class="ws-zahl-kachel' + (k.risiken ? " krit" : " gut") + '"><b>' + k.risiken + "</b><span>von " + k.gesamt + " Themen hängen an einer Person oder sind ungeprüft</span></div>" +
      k.allein.slice(0, 3).map((a) => '<div class="ws-zahl-kachel"><b>' + a.themen + "</b><span>" + (a.themen === 1 ? "Thema" : "Themen") + ", bei denen " + esc(name(a.person)) + " der einzige Kenner ist</span></div>").join("") + "</div>" +
    '<div class="hinweis"><div><b>So wird ein Thema grün:</b> In der Anleitung oder im Ablauf einen Kenner <b>und</b> einen Zweiten eintragen (unter „Bearbeiten“) und den Inhalt als geprüft markieren.</div></div>' +
    '<div class="ws-stapel">' + tabelle("Systeme", "Kenner sind alle, die in einer Anleitung des Systems eingetragen sind.", k.themen.filter((t) => t.art === "system")) +
      tabelle("Abläufe", "Je Ablauf der Kenner und ein Zweiter.", k.themen.filter((t) => t.art === "ablauf")) + "</div>";
}

/* ------------------------------------------------------------ Reiter: Hausregeln (verbindlich, mitgeliefert) */
const REGEL_ID = /^[A-Z]{3,12}-\d{3}$/;
function seiteHausregeln() {
  const regeln = (W.start.hausregeln || []).filter((r) => r && REGEL_ID.test(String(r.id)));
  const karte = (r) => '<article class="karte ws-regel" id="regel-' + esc(r.id) + '">' +
    '<div class="ws-regel-kopf"><span class="pj-chip mono">' + esc(r.id) + "</span><h2>" + esc(r.titel) + "</h2></div>" +
    '<div class="ws-meta"><span class="pj-chip">' + esc(r.bereich) + '</span><span class="klein">Stand ' + esc(datum(r.stand)) + "</span>" +
      '<span class="klein">Verantwortlich: ' + esc(r.verantwortlich) + "</span></div>" +
    '<p class="ws-regel-text">' + esc(r.regel) + "</p>" +
    '<p class="ws-regel-ausnahme"><b>Erlaubte Ausnahme:</b> ' + esc(r.ausnahme) + "</p>" +
    '<div class="ws-regel-kunde"><span class="feld-label">So sagst du es dem Kunden</span>' + (r.kunde || []).map((k, i) =>
      '<div class="ws-zitat"><p>„' + esc(k) + '“</p><button class="mini" data-ws="kopieren" data-regel="' + esc(r.id) + '" data-nr="' + i + '">Kopieren</button></div>').join("") + "</div></article>";
  return kopf("hausregeln") +
    '<div class="hinweis ws-regel-hinweis">' + ic("recht") + "<div><b>Verbindlich für alle.</b> Hausregeln hat die Geschäftsführung festgelegt. Sie gehen jedem Tipp aus „Beirat &amp; Coaching“ vor. " +
      "Fragt ein Kunde nach, darfst du die Regel immer sachlich erklären. Der Fragen-Assistent kennt die Regeln auch („Kann ich den Neuwagen reservieren?“).</div></div>" +
    (regeln.length ? '<div class="ws-stapel">' + regeln.map(karte).join("") + "</div>" : '<div class="pj-leer"><p>Noch keine Hausregeln.</p></div>');
}

/* ------------------------------------------------------------ Reiter: Offene Fragen (aus dem Fragen-Assistenten) */
const SCHLUESSEL = /^[0-9a-f]{16}$/;
function seiteFragen() {
  if (!W.fragen) { nachLaden(ladeFragen()); return kopf("fragen") + ladeAnzeige(); }
  const f = W.fragen;
  if (f.fehler) return kopf("fragen") + '<div class="pj-leer"><p>' + esc(f.fehler) + "</p></div>";
  const liste = (f.fragen || []).filter((x) => SCHLUESSEL.test(String(x.schluessel)));
  const zeile = (x) => '<li class="ws-frage">' +
    '<div class="ws-frage-haupt"><b>' + esc(x.frage) + "</b>" +
      '<span class="ws-frage-meta"><span class="klein">' + mehrzahl(x.anzahl, "Mal", "Mal") + " gefragt</span>" +
        (x.zuletzt ? '<span class="klein">zuletzt ' + esc(zeit(x.zuletzt)) + "</span>" : "") +
        (x.gemeldet ? '<span class="pille warn">als Lücke gemeldet' + (x.gemeldet > 1 ? " (" + x.gemeldet + "×)" : "") + "</span>" : "") + "</span></div>" +
    '<div class="ws-frage-knoepfe"><button class="btn" data-ws="frage-anleitung" data-id="' + esc(x.schluessel) + '">Anleitung anlegen</button>' +
      '<button class="btn" data-ws="frage-erledigt" data-id="' + esc(x.schluessel) + '">' + ic("haken") + "Erledigt</button></div></li>";
  return kopf("fragen") +
    '<div class="hinweis"><div><b>Was der Fragen-Assistent nicht beantworten konnte.</b> Gleiche Fragen sind zusammengefasst. Namen, Telefonnummern, E-Mail-Adressen, IBAN und Fahrgestellnummern sind vor der Anzeige entfernt; interne Fahrzeugnummern bleiben. ' +
      "„Erledigt“ blendet eine Frage aus – wird sie wieder gestellt, kommt sie zurück.</div></div>" +
    (liste.length ? '<section class="karte ws-liste"><div class="karte-kopf"><div><h2>' + mehrzahl(f.gesamt || liste.length, "offene Frage", "offene Fragen") + "</h2><p>Gemeldete Lücken zuerst, dann die neuesten.</p></div></div><ul>" + liste.map(zeile).join("") + "</ul></section>"
      : '<div class="pj-leer"><h2>Keine offenen Fragen</h2><p>Alles, was im Assistenten gefragt wurde, konnte er beantworten – oder es ist erledigt.</p></div>') +
    (f.erledigt ? '<p class="klein ws-fuss">' + mehrzahl(f.erledigt, "Frage ist", "Fragen sind") + " als erledigt ausgeblendet.</p>" : "");
}

async function kopieren(text, knopf) {
  try { await navigator.clipboard.writeText(text); }
  catch (e) {
    const t = document.createElement("textarea"); t.value = text; document.body.appendChild(t); t.select();
    try { document.execCommand("copy"); } finally { t.remove(); }
  }
  if (knopf) { knopf.textContent = "Kopiert"; setTimeout(() => { if (knopf.isConnected) knopf.textContent = "Kopieren"; }, 1600); }
}

async function frageErledigt(schluessel) {
  try { W.fragen = await ruf("offene_frage_erledigt", schluessel, true); neuZeichnen(); meldung("Als erledigt markiert."); }
  catch (e) { meldung(String(e.message || e), true); }
}

/* ------------------------------------------------------------ Seite */
function seite(rest) {
  const v = vorab();
  if (v) return { html: v };
  const [teil, id] = String(rest || "").split("/");
  let html;
  if (TEIL_ARTEN.includes(teil) && id) {
    if (!ID.test(id)) html = teilFehlt(REITER[0], { fehler: "Diese Adresse gibt es nicht." });
    else html = { ablauf: seiteAblauf, durchlauf: seiteDurchlauf, anleitung: seiteAnleitung, plan: seitePlan, einarbeitung: seiteEinarbeitung }[teil](id);
  } else html = teil === "anleitungen" ? seiteAnleitungen() : teil === "einarbeitung" ? seiteEinarbeitungen() : teil === "kenner" ? seiteKenner()
    : teil === "hausregeln" ? seiteHausregeln() : teil === "fragen" ? seiteFragen() : seiteAblaeufe();
  return { html: '<div class="ws">' + html + "</div>", nach: () => document.querySelectorAll("#inhalt .ws textarea").forEach(groesse) };
}
const groesse = (t) => { if (!t || !t.isConnected) return; t.style.height = "auto"; t.style.height = (t.scrollHeight + 2) + "px"; };

/* ------------------------------------------------------------ Dialoge */
function dialog(html, beimAbsenden, breit) {
  const d = document.createElement("dialog");
  d.className = "dialog pj-dialog ws-dialog" + (breit ? " ws-breit" : "");
  d.innerHTML = html;
  document.body.appendChild(d);
  d.addEventListener("close", () => d.remove());
  // Klick daneben schließt nur kleine Dialoge – im großen Editor ginge sonst Getipptes verloren
  d.addEventListener("click", (ev) => { if ((ev.target === d && !breit) || ev.target.closest("[data-schliessen]")) d.close(); });
  const form = d.querySelector("form");
  if (form && beimAbsenden) form.addEventListener("submit", async (ev) => {
    ev.preventDefault();
    const knopf = form.querySelector('button[type="submit"]');
    if (knopf) knopf.disabled = true;
    try { await beimAbsenden(new FormData(form), d); d.close(); }
    catch (e) { const f = d.querySelector(".feld-fehler"); if (f) { f.textContent = String(e.message || e); f.hidden = false; } else meldung(String(e.message || e), true); }
    finally { if (knopf) knopf.disabled = false; }
  });
  d.showModal();
  const erstes = d.querySelector("input:not([type=hidden]):not([type=checkbox]), textarea");
  if (erstes) erstes.focus();
  return d;
}
const fuss = (text) => '<p class="feld-fehler" role="alert" hidden></p><div class="gruppe dialog-fuss"><span class="rechts"></span><button class="knopf" type="button" data-schliessen>Abbrechen</button><button class="knopf primaer" type="submit">' + text + "</button></div>";
const GEHEIM = '<p class="feld-hilfe ws-geheim-hilfe">Keine Passwörter oder Zugangsdaten eintragen – ODIN lehnt Eingaben wie „Passwort: …“ ab.</p>';
const feld = (label, inhalt, hilfe) => '<label class="feld"><span class="feld-label">' + label + "</span>" + inhalt + (hilfe ? '<span class="feld-hilfe">' + hilfe + "</span>" : "") + "</label>";
const wahl = (feldname, werte, gewaehlt) => '<select name="' + feldname + '">' + werte.map((w) => '<option value="' + esc(w) + '"' + (w === gewaehlt ? " selected" : "") + ">" + esc(w || "–") + "</option>").join("") + "</select>";

/* Zeilen-Editor für Schritte: hinzufügen, hoch/runter, löschen – gelesen wird beim Absenden die Reihenfolge im Dialog */
const zeilenKnoepfe = '<span class="ws-ed-knoepfe"><button type="button" class="knopf leise" data-ed="hoch" title="Nach oben" aria-label="Nach oben">↑</button><button type="button" class="knopf leise" data-ed="runter" title="Nach unten" aria-label="Nach unten">↓</button><button type="button" class="knopf leise" data-ed="weg" title="Schritt löschen" aria-label="Schritt löschen">✕</button></span>';
const ablaufZeile = (s) => '<li class="ws-ed-zeile" data-id="' + esc(s.id || "") + '"><div class="ws-ed-felder"><input name="s-text" maxlength="300" placeholder="Was ist zu tun?" value="' + esc(s.text || "") + '" aria-label="Schritt">' +
  '<input name="s-hinweis" maxlength="600" placeholder="Woran erkenne ich, dass es stimmt? (optional)" value="' + esc(s.hinweis || "") + '" aria-label="Woran erkenne ich, dass es stimmt?">' +
  '<label class="ws-ed-pflicht"><input type="checkbox" name="s-pflicht"' + (s.notiz_pflicht ? " checked" : "") + "> Notiz ist Pflicht</label></div>" + zeilenKnoepfe + "</li>";
function planZeile(s) {
  const v = s.verweis ? s.verweis.art + ":" + s.verweis.id : "";
  const gruppe = (art, titel, liste) => liste.length ? '<optgroup label="' + titel + '">' + liste.map((x) => '<option value="' + art + ":" + esc(x.id) + '"' + (v === art + ":" + x.id ? " selected" : "") + ">" + esc(x.titel) + "</option>").join("") + "</optgroup>" : "";
  return '<li class="ws-ed-zeile" data-id="' + esc(s.id || "") + '"><div class="ws-ed-felder"><input name="s-text" maxlength="300" placeholder="Was soll sitzen?" value="' + esc(s.text || "") + '" aria-label="Schritt">' +
    '<div class="ws-ed-reihe"><select name="s-phase" aria-label="Phase">' + W.start.phasen.map((p) => '<option value="' + esc(p.id) + '"' + (p.id === s.phase ? " selected" : "") + ">" + esc(p.titel) + "</option>").join("") + "</select>" +
    '<select name="s-verweis" aria-label="Verweis"><option value="">kein Verweis</option>' + gruppe("ablauf", "Abläufe", W.start.ablaeufe) + gruppe("anleitung", "Anleitungen", W.start.anleitungen) + gruppe("beirat", "Beirat &amp; Coaching", W.start.beirat || []) + "</select></div></div>" + zeilenKnoepfe + "</li>";
}
function editor(d, neueZeile) {
  const liste = d.querySelector(".ws-ed");
  d.addEventListener("click", (ev) => {
    const k = ev.target.closest("[data-ed]");
    if (!k) return;
    const z = k.closest(".ws-ed-zeile");
    if (k.dataset.ed === "neu") { liste.insertAdjacentHTML("beforeend", neueZeile()); liste.lastElementChild.querySelector("input").focus(); }
    else if (k.dataset.ed === "weg") z.remove();
    else if (k.dataset.ed === "hoch" && z.previousElementSibling) liste.insertBefore(z, z.previousElementSibling);
    else if (k.dataset.ed === "runter" && z.nextElementSibling) liste.insertBefore(z.nextElementSibling, z);
  });
}
const editorHtml = (zeilen) => '<div class="feld"><span class="feld-label">Schritte</span><ol class="ws-ed">' + zeilen + '</ol><button type="button" class="knopf" data-ed="neu">+ Schritt hinzufügen</button></div>';

function dialogAblauf(a) {
  a = a || { schritte: [{}, {}, {}] };
  const d = dialog('<form method="dialog"><div class="dialog-kopf"><h2>' + (a.id ? "Ablauf bearbeiten" : "Neuer Ablauf") + "</h2><p>Eine Checkliste für etwas, das immer wieder gleich laufen soll. Laufende Durchläufe behalten ihren Stand.</p></div>" +
    feld("Titel", '<input name="titel" required minlength="3" maxlength="120" value="' + esc(a.titel || "") + '" placeholder="z. B. Neufahrzeug: Check-in">') +
    feld("Zweck", '<textarea name="zweck" rows="2" maxlength="600" placeholder="Wozu ist der Ablauf gut – woran merkt man, dass er gelungen ist?">' + esc(a.zweck || "") + "</textarea>") +
    '<div class="feld-reihe">' + feld("Bereich", wahl("bereich", ["", ...new Set([...W.start.bereiche, a.bereich || ""])].filter((x, i) => i === 0 || x), a.bereich || "")) +
      feld("Verantwortliche Rolle", '<input name="rolle" maxlength="60" value="' + esc(a.rolle || "") + '" placeholder="z. B. Disposition">') + "</div>" +
    '<div class="feld-reihe">' + feld("Kenner", personWahl("kenner", a.kenner, "noch niemand")) + feld("Zweiter Kenner", personWahl("kenner2", a.kenner2, "noch niemand")) + "</div>" +
    editorHtml(a.schritte.map(ablaufZeile).join("")) + GEHEIM + fuss("Speichern") + "</form>",
  async (fd, dlg) => {
    const schritte = [...dlg.querySelectorAll(".ws-ed-zeile")].map((z) => ({ id: z.dataset.id || null, text: z.querySelector('[name="s-text"]').value,
      hinweis: z.querySelector('[name="s-hinweis"]').value, notiz_pflicht: z.querySelector('[name="s-pflicht"]').checked }));
    const neu = await ruf("ablauf_speichern", { id: a.id || null, titel: fd.get("titel"), zweck: fd.get("zweck"), bereich: fd.get("bereich"), rolle: fd.get("rolle"),
      kenner: fd.get("kenner"), kenner2: fd.get("kenner2"), schritte });
    W.teile.set("ablauf:" + neu.id, neu); listenVeraltet();
    if (a.id) neuZeichnen(); else location.hash = "#/wissen/ablauf/" + neu.id;
    meldung("Ablauf gespeichert.");
  }, true);
  editor(d, () => ablaufZeile({}));
}

function dialogDurchlauf(id) {
  const a = W.start.ablaeufe.find((x) => x.id === id) || (W.teile.get("ablauf:" + id) || {});
  dialog('<form method="dialog"><div class="dialog-kopf"><h2>Durchlauf starten</h2><p>' + esc(a.titel || "") + " – die Schritte werden jetzt kopiert und dann abgehakt.</p></div>" +
    '<div class="feld-reihe">' + feld("Fahrzeug (optional)", '<input name="fahrzeug" maxlength="40" placeholder="Interne ID" autocomplete="off">') +
      feld("Kunde (optional)", '<input name="kunde" maxlength="80" autocomplete="off">') + "</div>" +
    '<div class="feld-reihe">' + feld("Zuständig", personWahl("zustaendig", W.start.ich, "ich")) + feld("Zieltermin (optional)", '<input type="date" name="ziel">', "Danach gilt der Durchlauf als überfällig.") + "</div>" + fuss("Starten") + "</form>",
  async (fd) => {
    const d = await ruf("durchlauf_starten", id, { fahrzeug: fd.get("fahrzeug"), kunde: fd.get("kunde"), zustaendig: fd.get("zustaendig"), ziel: fd.get("ziel") });
    W.teile.set("durchlauf:" + d.id, d); W.teile.delete("ablauf:" + id); listenVeraltet(); agendaGeaendert();
    location.hash = "#/wissen/durchlauf/" + d.id;
  });
}

function dialogAnleitung(a, system, nachher) {
  a = a || { system: system || W.start.systeme[0] };
  dialog('<form method="dialog"><div class="dialog-kopf"><h2>' + (a.id ? "Anleitung bearbeiten" : "Neue Anleitung") + "</h2><p>Kurz und für eine Aufgabe. Am einfachsten: die Aufgabe einmal machen, dabei diktieren, hier einfügen.</p></div>" +
    feld("Titel", '<input name="titel" required minlength="3" maxlength="120" value="' + esc(a.titel || "") + '">') +
    '<div class="feld-reihe">' + feld("System", wahl("system", W.start.systeme, a.system)) + feld("Kategorie", '<input name="kategorie" maxlength="60" value="' + esc(a.kategorie || "") + '" placeholder="z. B. Grundlagen">') + "</div>" +
    feld("Text", '<textarea name="text" rows="12" maxlength="20000">' + esc(a.text || "") + "</textarea>", "Leerzeile = neuer Absatz · „- “ Aufzählung · „1. “ Schritt · **fett** · „## “ Überschrift") +
    '<div class="feld-reihe">' + feld("Kenner", personWahl("kenner", a.kenner, "noch niemand")) + feld("Zweiter Kenner", personWahl("kenner2", a.kenner2, "noch niemand")) + "</div>" +
    feld("Link zu einer Aufzeichnung (optional)", '<input name="link" maxlength="480" inputmode="url" placeholder="https://…" value="' + esc(sichererLink(a.link)) + '">', "Nur Adressen mit https:// oder http://.") +
    GEHEIM + fuss("Speichern") + "</form>",
  async (fd) => {
    const neu = await ruf("anleitung_speichern", { id: a.id || null, titel: fd.get("titel"), system: fd.get("system"), kategorie: fd.get("kategorie"), text: fd.get("text"),
      kenner: fd.get("kenner"), kenner2: fd.get("kenner2"), link: fd.get("link") });
    W.teile.set("anleitung:" + neu.id, neu); listenVeraltet();
    if (nachher) await nachher(neu);
    if (a.id) neuZeichnen(); else location.hash = "#/wissen/anleitung/" + neu.id;
    meldung("Anleitung gespeichert.");
  }, true);
}

function dialogSystem() {
  dialog('<form method="dialog"><div class="dialog-kopf"><h2>System anlegen</h2><p>Ein Programm oder Thema, zu dem es Anleitungen geben soll.</p></div>' +
    feld("Name", '<input name="name" required minlength="2" maxlength="40" placeholder="z. B. Kasse">') + fuss("Anlegen") + "</form>",
  async (fd) => { const systeme = await ruf("system_anlegen", fd.get("name")); W.start.systeme = systeme; W.kenner = null; neuZeichnen(); });
}

function dialogPlan(p) {
  p = p || { schritte: [{ phase: "tag1" }, { phase: "woche" }, { phase: "monat" }, { phase: "tage90" }] };
  const d = dialog('<form method="dialog"><div class="dialog-kopf"><h2>' + (p.id ? "Plan bearbeiten" : "Neuer Einarbeitungsplan") + "</h2><p>Was soll wann sitzen? Die Gespräche nach 30 und 90 Tagen kommen beim Start von selbst dazu. Laufende Einarbeitungen ändern sich nicht.</p></div>" +
    feld("Rolle", '<input name="rolle" required minlength="2" maxlength="60" value="' + esc(p.rolle || "") + '" placeholder="z. B. Verkauf">') +
    editorHtml(p.schritte.map(planZeile).join("")) + GEHEIM + fuss("Speichern") + "</form>",
  async (fd, dlg) => {
    const schritte = [...dlg.querySelectorAll(".ws-ed-zeile")].map((z) => { const v = z.querySelector('[name="s-verweis"]').value.split(":");
      return { id: z.dataset.id || null, text: z.querySelector('[name="s-text"]').value, phase: z.querySelector('[name="s-phase"]').value, verweis: v.length === 2 ? { art: v[0], id: v[1] } : null }; });
    const neu = await ruf("plan_speichern", { id: p.id || null, rolle: fd.get("rolle"), schritte });
    W.teile.set("plan:" + neu.id, neu); listenVeraltet();
    if (p.id) neuZeichnen(); else location.hash = "#/wissen/plan/" + neu.id;
    meldung("Plan gespeichert.");
  }, true);
  editor(d, () => planZeile({ phase: "woche" }));
}

function dialogEinarbeitung(planId) {
  if (!W.start.plaene.length) { meldung("Erst einen Einarbeitungsplan anlegen.", true); return; }
  dialog('<form method="dialog"><div class="dialog-kopf"><h2>Einarbeitung starten</h2><p>Die Termine rechnet ODIN aus dem Startdatum: Tag 1, nach 7, 30 und 90 Tagen (am Wochenende der Montag danach).</p></div>' +
    '<div class="feld-reihe">' + feld("Wer wird eingearbeitet?", personWahl("person", "", "bitte wählen")) + feld("Pate", personWahl("pate", W.start.ich, "bitte wählen"), "Zeigt die Schritte und ist Ansprechpartner.") + "</div>" +
    '<div class="feld-reihe">' + feld("Rolle (Plan)", '<select name="plan_id">' + W.start.plaene.map((p) => '<option value="' + esc(p.id) + '"' + (p.id === planId ? " selected" : "") + ">" + esc(p.rolle) + "</option>").join("") + "</select>") +
      feld("Startdatum", '<input type="date" name="start" required value="' + esc(W.start.heute) + '">') + "</div>" +
    '<p class="feld-hilfe">Fehlt die Person in der Liste? Unter „Alle Projekte“ anlegen.</p>' + fuss("Starten") + "</form>",
  async (fd) => {
    const e = await ruf("einarbeitung_starten", { person: fd.get("person"), pate: fd.get("pate"), plan_id: fd.get("plan_id"), start: fd.get("start") });
    W.teile.set("einarbeitung:" + e.id, e); listenVeraltet(); agendaGeaendert();
    location.hash = "#/wissen/einarbeitung/" + e.id;
  });
}

/* ------------------------------------------------------------ Still speichern (Notizen) */
const stillTimer = new Map();
async function stillSpeichern(el) {
  const [art, sid] = el.dataset.still.split(":"), id = hashTeile()[2];
  clearTimeout(stillTimer.get(el.dataset.still)); stillTimer.delete(el.dataset.still);
  if (el.value === el.defaultValue || !ID.test(id || "")) return;
  const wert = el.value;
  try {
    const d = await ruf(art === "durchlauf" ? "durchlauf_schritt" : "einarbeitung_schritt", id, sid, { notiz: wert });
    W.teile.set(art + ":" + d.id, d);
    if (el.isConnected) el.defaultValue = wert;
  } catch (e) { meldung("Nicht gespeichert: " + String(e.message || e), true); }
}

/* ------------------------------------------------------------ Ereignisse (einmal, per Delegation) */
document.addEventListener("click", async (ev) => {
  if (!istMeineSeite()) return;
  const k = ev.target.closest("#inhalt [data-ws]");
  if (!k) return;
  const [, teil, id] = hashTeile(), aktuell = W.teile.get(teil + ":" + id);
  switch (k.dataset.ws) {
    case "neu-laden": W.fehler = ""; W.start = null; neuZeichnen(); break;
    case "ich":
      try {
        await window.odinAnmelden(k.dataset.id);          // Tresor: Person + PIN, erst dann gilt sie
        zuruecksetzen(); window.dispatchEvent(new Event("odin-ich")); window.dispatchEvent(new Event("odin-ich-urlaub")); nachLaden(ladeStart());
      } catch (e) { meldung(String(e.message || e), true); }
      break;
    case "bereich": W.bereich = k.dataset.wert; neuZeichnen(); break;
    case "fertige": W.fertigeZeigen = !W.fertigeZeigen; neuZeichnen(); break;
    case "system": W.system = k.dataset.wert; W.treffer = null; neuZeichnen(); break;
    case "ablauf-neu": dialogAblauf(); break;
    case "ablauf-bearbeiten": if (aktuell) dialogAblauf(aktuell); break;
    case "durchlauf-neu": dialogDurchlauf(k.dataset.id); break;
    case "anleitung-neu": dialogAnleitung(null, k.dataset.system); break;
    case "kopieren": {
      const regel = (W.start.hausregeln || []).find((x) => x.id === k.dataset.regel);
      const text = regel && (regel.kunde || [])[Number(k.dataset.nr)];
      if (text) kopieren(text, k);
      break;
    }
    case "frage-erledigt": if (SCHLUESSEL.test(k.dataset.id)) await frageErledigt(k.dataset.id); break;
    case "frage-anleitung": {
      const x = ((W.fragen && W.fragen.fragen) || []).find((y) => y.schluessel === k.dataset.id);
      if (!x) break;
      // Neue Anleitung mit der Frage als Titel; nach dem Speichern ist die Frage erledigt
      dialogAnleitung({ system: W.start.systeme[0], titel: String(x.frage).replace(/\s*\?+$/, "").slice(0, 120) }, null,
        async () => { try { W.fragen = await ruf("offene_frage_erledigt", x.schluessel, true); } catch (e) { W.fragen = null; } });
      break;
    }
    case "anleitung-bearbeiten": if (aktuell) dialogAnleitung(aktuell); break;
    case "system-neu": dialogSystem(); break;
    case "plan-neu": dialogPlan(); break;
    case "plan-bearbeiten": if (aktuell) dialogPlan(aktuell); break;
    case "einarbeitung-neu": dialogEinarbeitung(k.dataset.plan); break;
    case "pruefen": await aendern("pruefen", [k.dataset.art, id, !!k.dataset.wert], k.dataset.art); break;
    case "markdown":
      try { const r = await ruf("markdown_speichern", k.dataset.art, id); if (r) meldung("Gespeichert als „" + r.datei + "“."); }
      catch (e) { meldung(String(e.message || e), true); }
      break;
    case "loeschen": {
      const art = k.dataset.art, was = { ablauf: "Diesen Ablauf", durchlauf: "Diesen Durchlauf", anleitung: "Diese Anleitung", plan: "Diesen Plan", einarbeitung: "Diese Einarbeitung" }[art];
      if (!was || !confirm(was + " wirklich löschen? Das lässt sich nicht rückgängig machen.")) break;
      if (await aendern(art + "_loeschen", [id])) { W.teile.delete(art + ":" + id); location.hash = "#/wissen/" + (art === "anleitung" ? "anleitungen" : art === "plan" || art === "einarbeitung" ? "einarbeitung" : "ablaeufe"); }
      break;
    }
    case "schritt": {
      const notiz = k.closest("li").querySelector("textarea");
      const eingabe = { erledigt: k.getAttribute("aria-pressed") !== "true" };
      if (notiz && notiz.value !== notiz.defaultValue) { eingabe.notiz = notiz.value; clearTimeout(stillTimer.get(notiz.dataset.still)); notiz.defaultValue = notiz.value; }
      await aendern("durchlauf_schritt", [id, k.dataset.id, eingabe], "durchlauf");
      break;
    }
    case "durchlauf-zu": await aendern("durchlauf_abschliessen", [id, !!k.dataset.wert], "durchlauf"); break;
    case "e-schritt": await aendern("einarbeitung_schritt", [id, k.dataset.id, { [k.dataset.feld]: k.getAttribute("aria-pressed") !== "true" }], "einarbeitung"); break;
    case "einarbeitung-zu": await aendern("einarbeitung_abschliessen", [id, !!k.dataset.wert], "einarbeitung"); break;
    default: break;
  }
});

let suchTimer = 0;
document.addEventListener("input", (ev) => {
  if (!istMeineSeite()) return;
  const t = ev.target;
  if (t.matches && t.matches("#inhalt [data-ws-suche]")) {
    W.suche = t.value; W.treffer = null;
    clearTimeout(suchTimer); suchTimer = setTimeout(neuZeichnen, 250);
  } else if (t.dataset && t.dataset.still && t.closest("#inhalt")) {
    groesse(t);
    clearTimeout(stillTimer.get(t.dataset.still));
    stillTimer.set(t.dataset.still, setTimeout(() => stillSpeichern(t), 1200));
  }
});
document.addEventListener("focusout", (ev) => {
  const t = ev.target;
  if (istMeineSeite() && t && t.dataset && t.dataset.still && t.closest("#inhalt")) stillSpeichern(t);
});

function zuruecksetzen() { W.start = null; W.teile.clear(); W.kenner = null; W.treffer = null; W.fehler = ""; W.fragen = null; }
addEventListener("odin-ich", zuruecksetzen);
addEventListener("odin-ich-urlaub", zuruecksetzen);

/* Beim Betreten frisch laden (Änderungen anderer Rechner) */
addEventListener("hashchange", () => {
  if (!istMeineSeite()) return;
  const [, teil, id] = hashTeile();
  if (TEIL_ARTEN.includes(teil) && ID.test(id || "")) nachLaden(ladeTeil(teil, id));
  else if (teil === "kenner") nachLaden(ladeKenner());
  else if (teil === "fragen") { W.fragen = null; nachLaden(ladeFragen()); }
  else if (W.start) nachLaden(ladeStart());
});

/* ------------------------------------------------------------ Anmelden bei der Navigation */
window.ODIN_SEITEN = window.ODIN_SEITEN || {};
window.ODIN_SEITEN.wissen = { render: seite, menue: () => "wissen" };
if (istMeineSeite() && typeof window.cockpitZeichne === "function") window.cockpitZeichne();
})();
