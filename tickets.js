/* ODIN · Tickets
   Probleme, Ideen und Fragen zu ODIN melden – mit passenden Hinweisen vor dem Absenden – und die Antworten sehen,
   auch den „Hinweis von Claude“ aus dem Ticketordner. Verwalter (die Urlaubs-Genehmiger) sehen alle Tickets, setzen
   den Status und kopieren den Auftragstext für Claude.
   Daten: tirge_helfer/tickets.py über tickets_aufruf, gespeichert im Ordner „Fahrzeuge“ unter _ODIN/Tickets.
   Seiten: #/tickets (Übersicht), #/tickets/neu (melden), #/tickets/<id> (Ticket). Eingehängt über window.ODIN_SEITEN.
   Schnellzugang: Knopf „Problem melden“ unten in der Seitenleiste (#ticket-melden) – gibt die aktuelle Seite mit.
   Sicherheit: Jeder Text geht durch esc() – auch in Attributen; Adressen nur aus geprüften Kennungen, Links von
   Claude nur http(s) und nur mit target="_blank" (öffnet der Standardbrowser). */
(() => {
"use strict";

const TK = {
  start: null,            // {ich, personen, ist_verwalter, tickets, arten, status, dringlichkeiten, im_browser, nur_hier}
  fehler: "",
  ticket: null,           // geöffnetes Ticket (Ansicht aus ticket())
  ticketFehler: "",
  filter: "offen",        // offen | alle | <status>
  art: "",
  suche: "",
  nurMeine: false,
  vonRoute: "",           // Seite, von der aus „Problem melden“ geklickt wurde
  entwurf: null,          // {art, titel, beschreibung, schritte, erwartet, route, dringlichkeit}
  bild: "",               // data:-Adresse (JPEG, verkleinert)
  hinweise: [],
  hinweisNr: 0,
  claudeText: "",
  sendet: false,
};

const ID = /^[0-9a-f]{10}$/;
const esc = (s) => String(s ?? "").replace(/[&<>"'`]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;", "`": "&#96;" }[c]));
const linkOk = (l) => (typeof l === "string" && /^#\/[\w\-/]*$/.test(l) ? l : "");
const webLinkOk = (l) => (typeof l === "string" && /^https?:\/\/[^\s<>"'`\\]{3,480}$/i.test(l) ? l : "");
const aufSeite = () => (location.hash || "").startsWith("#/tickets");
const meldung = (t, f) => { if (typeof zeigeMeldung === "function") zeigeMeldung(t, f ? "x" : "check", !!f); };
const neu = () => { if (typeof window.cockpitZeichne === "function") window.cockpitZeichne(); };
const zeit = (iso) => { if (!iso) return ""; const d = new Date(String(iso).replace(" ", "T")); return isNaN(d) ? "" : d.toLocaleString("de-DE", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" }); };
const tag = (iso) => { if (!iso) return ""; const d = new Date(String(iso).replace(" ", "T")); return isNaN(d) ? "" : d.toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit", year: "2-digit" }); };
const mehrzahl = (n, eins, viele) => n + " " + (n === 1 ? eins : viele);
const ic = (n) => '<svg class="ic" aria-hidden="true"><use href="#' + n + '"/></svg>';

const ARTEN = { fehler: "Fehler", idee: "Idee", frage: "Frage", daten: "Daten falsch" };
const ARTEN_TEXT = { fehler: "Etwas geht nicht oder sieht falsch aus", idee: "So könnte ODIN besser werden", frage: "Wie geht das?", daten: "Eine Zahl, ein Fahrzeug, ein Preis stimmt nicht" };
const STATUS = { neu: "Neu", pruefung: "In Prüfung", hinweis: "Hinweis gegeben", arbeit: "In Arbeit", erledigt: "Erledigt", abgelehnt: "Abgelehnt" };
const STATUS_TON = { neu: "warn", pruefung: "", hinweis: "gut", arbeit: "", erledigt: "leise", abgelehnt: "leise" };
const OFFEN = ["neu", "pruefung", "hinweis", "arbeit"];
const DRINGLICHKEIT = { niedrig: "Niedrig", normal: "Normal", hoch: "Hoch", dringend: "Dringend" };
const DRINGLICHKEIT_TON = { hoch: "warn", dringend: "krit" };
const chip = (text, ton) => '<span class="pj-chip' + (ton ? " " + ton : "") + '">' + esc(text) + "</span>";
const statusChip = (s) => chip(STATUS[s] || s, STATUS_TON[s]);
const dringChip = (d) => d === "normal" ? "" : chip(DRINGLICHKEIT[d] || d, DRINGLICHKEIT_TON[d]);

/* ------------------------------------------------------------ Schnittstelle */
async function ruf(aktion, ...args) {
  const api = window.pywebview && window.pywebview.api;
  if (!api || typeof api.tickets_aufruf !== "function") throw new Error("Tickets sind gerade nicht erreichbar.");
  const r = await api.tickets_aufruf(aktion, args);
  if (!r || !r.ok) throw new Error((r && r.fehler) || "Unbekannter Fehler");
  if ((r.daten === null || r.daten === undefined) && /^(start|ticket|liste)$/.test(aktion)) throw new Error("Keine Daten erhalten – bitte nochmal versuchen.");
  return r.daten;
}

let laufend = null;
function laden() {
  if (laufend) return laufend.then(() => laden());
  laufend = (async () => {
    try { TK.start = await ruf("start"); TK.fehler = ""; } catch (e) { TK.fehler = String(e.message || e); }
    zaehlerAusStart();
  })().finally(() => { laufend = null; });
  return laufend;
}

/* Zähler in der Seitenleiste: Verwalter – neue Tickets; alle anderen – eigene Tickets mit Hinweis */
function zaehlerSetzen(z) {
  const el = document.getElementById("tickets-zahl");
  if (!el || !z) return;
  const n = z.verwalter ? z.neu : z.hinweis;
  el.textContent = n || ""; el.hidden = !n;
  el.title = !n ? "" : z.verwalter ? mehrzahl(n, "neues Ticket", "neue Tickets") : mehrzahl(n, "Ticket mit Hinweis", "Tickets mit Hinweis");
}
function zaehlerAusStart() {
  const s = TK.start;
  if (!s || !s.ich) return;
  const t = s.tickets || [];
  zaehlerSetzen({ verwalter: s.ist_verwalter, neu: t.filter((x) => x.status === "neu").length, hinweis: t.filter((x) => x.eigen && x.status === "hinweis").length });
}
async function zaehlerLaden() {
  try { zaehlerSetzen(await ruf("zaehler")); } catch (e) { /* Zähler ist Zugabe */ }
}

/* ------------------------------------------------------------ Bausteine */
function ladeAnzeige(fehler) {
  if (fehler) return '<div class="pj-leer"><h2>Tickets gerade nicht erreichbar</h2><p>' + esc(fehler) + '</p><button class="btn btn-primaer" data-tk="neu-laden">Nochmal versuchen</button></div>';
  return '<div class="laden" aria-label="Tickets werden geladen"><i class="skelett" style="width:40%"></i><i class="skelett"></i><i class="skelett" style="width:70%"></i></div>';
}

function kopf(titel, text, aktionen) {
  return '<div class="kopf"><div><h1>' + titel + "</h1><p>" + text + "</p></div>" + (aktionen ? '<div class="kopf-aktionen">' + aktionen + "</div>" : "") + "</div>";
}

function werBistDu() {
  return kopf("Tickets", "Erst einmal: Wer arbeitet an diesem Rechner?") +
    '<section class="karte"><div class="karte-leer">Bitte unter <a href="#/projekte">Alle Projekte</a> einmal den eigenen Namen wählen – mit Microsoft angemeldet geht es von selbst.</div></section>';
}

function nurHierHinweis() {
  if (!TK.start.nur_hier) return "";
  return '<div class="hinweis">' + ic("i-warn") + "<div><b>Der Ordner „Fahrzeuge“ ist auf diesem Rechner nicht verbunden.</b> Tickets liegen dann nur hier – " +
    'die Verwalter und Claude sehen sie nicht. <a href="#/abs">Ordner wählen</a></div></div>';
}

/* ------------------------------------------------------------ Übersicht */
function passt(t) {
  if (TK.filter === "offen" && !OFFEN.includes(t.status)) return false;
  if (TK.filter !== "offen" && TK.filter !== "alle" && t.status !== TK.filter) return false;
  if (TK.art && t.art !== TK.art) return false;
  if (TK.nurMeine && !t.eigen) return false;
  const q = TK.suche.trim().toLowerCase();
  return !q || (t.titel + " " + t.nummer + " " + t.seite + " " + t.von_name).toLowerCase().includes(q);
}

function zeileHtml(t) {
  const verwalter = TK.start.ist_verwalter;
  return '<li><a class="tk-zeile" href="#/tickets/' + esc(t.id) + '">' +
    '<span class="tk-art tk-art-' + esc(t.art) + '" aria-hidden="true"></span>' +
    '<span class="tk-zeile-haupt"><b>' + esc(t.titel) + "</b>" +
      '<span class="tk-meta"><span class="mono">#' + esc(t.nummer) + "</span><span>" + esc(ARTEN[t.art] || t.art) + "</span>" +
        (t.seite ? "<span>" + esc(t.seite) + "</span>" : "") +
        (verwalter && !t.eigen ? "<span>von " + esc(t.von_name) + "</span>" : "") +
        "<span>" + esc(tag(t.zuletzt)) + "</span>" +
        (t.kommentare ? "<span>" + mehrzahl(t.kommentare, "Kommentar", "Kommentare") + "</span>" : "") + "</span></span>" +
    '<span class="tk-zeile-chips">' + dringChip(t.dringlichkeit) + (t.antworten ? chip("Claude", "info") : "") + statusChip(t.status) + "</span></a></li>";
}

function seiteListe() {
  const s = TK.start;
  const alle = s.tickets || [];
  const liste = alle.filter(passt);
  const zahl = (f) => f === "offen" ? alle.filter((t) => OFFEN.includes(t.status)).length : f === "alle" ? alle.length : alle.filter((t) => t.status === f).length;
  const filter = ["offen", "neu", "hinweis", "arbeit", "erledigt", "alle"].map((f) =>
    '<button type="button" data-tk-filter="' + f + '" class="' + (TK.filter === f ? "aktiv" : "") + '" aria-pressed="' + (TK.filter === f) + '">' +
      esc(f === "offen" ? "Offen" : f === "alle" ? "Alle" : STATUS[f]) + ' <span class="tk-anzahl">' + zahl(f) + "</span></button>").join("");
  const arten = '<select data-tk-art aria-label="Art"><option value="">Alle Arten</option>' +
    Object.entries(ARTEN).map(([k, v]) => '<option value="' + k + '"' + (TK.art === k ? " selected" : "") + ">" + esc(v) + "</option>").join("") + "</select>";
  const text = s.ist_verwalter
    ? "Alle Meldungen aus dem Team. Status setzen, antworten – und mit „Für Claude kopieren“ den fertigen Auftragstext holen."
    : "Deine Meldungen mit Status und Antworten. Etwas geht nicht, ist falsch oder könnte besser sein? Einfach melden.";
  return nurHierHinweis() + (s.ist_verwalter || !s.verwalter_fehlt ? "" : '<div class="hinweis">' + ic("i-warn") + "<div><b>Noch kein Verwalter für Tickets.</b> Verwalter sind die Urlaubs-Genehmiger (Urlaub → Regeln).</div></div>") +
    kopf("Tickets", text, '<a class="btn btn-primaer" href="#/tickets/neu">' + ic("i-plus") + "Problem melden</a>") +
    '<div class="tk-werkzeuge"><div class="filter" role="group" aria-label="Status">' + filter + "</div>" +
      '<div class="tk-filter-rechts">' + arten +
        (s.ist_verwalter ? '<label class="tk-schalter"><input type="checkbox" data-tk-meine' + (TK.nurMeine ? " checked" : "") + "> nur meine</label>" : "") +
        '<input type="search" data-tk-suche placeholder="Suchen …" aria-label="Tickets durchsuchen" value="' + esc(TK.suche) + '"></div></div>' +
    '<section class="karte tk-liste-karte">' + (liste.length ? '<ul class="tk-liste">' + liste.map(zeileHtml).join("") + "</ul>"
      : '<div class="karte-leer">' + (alle.length ? "Keine Tickets für diese Auswahl." : "Noch keine Tickets – zum Glück. Unten in der Seitenleiste geht „Problem melden“ von jeder Seite aus.") + "</div>") +
    "</section>";
}

/* ------------------------------------------------------------ Melden */
function seitenOptionen(gewaehlt) {
  const gesehen = new Set();
  const opt = [];
  document.querySelectorAll(".seitenleiste a[data-seite]").forEach((a) => {
    const k = a.dataset.seite;
    if (gesehen.has(k) || k === "tickets") return;
    gesehen.add(k);
    const name = (a.querySelector("span:not(.zahl)") || a).textContent.trim() || a.title || k;
    opt.push(["#/" + k, name]);
  });
  const name = (gewaehlt || "").slice(2).split("/")[0];
  return '<option value="">keine bestimmte Seite</option>' + opt.map(([v, t]) =>
    '<option value="' + esc(v) + '"' + (v === "#/" + name ? " selected" : "") + ">" + esc(t) + "</option>").join("") +
    (gewaehlt && !gesehen.has(name) && /^#\/[\w-]+/.test(gewaehlt) ? '<option value="' + esc(gewaehlt) + '" selected>' + esc(gewaehlt) + "</option>" : "");
}

function entwurf() {
  if (!TK.entwurf) TK.entwurf = { art: "fehler", titel: "", beschreibung: "", schritte: "", erwartet: "", route: TK.vonRoute || "", dringlichkeit: "normal" };
  return TK.entwurf;
}

function hinweiseHtml() {
  const h = TK.hinweise || [];
  if (!h.length) return "";
  return '<div class="tk-hinweise-kopf">' + ic("ci-wissen") + "<b>Vielleicht hilft das schon</b></div>" +
    h.map((x) => '<article class="tk-hinweis"><b>' + esc(x.titel) + "</b><p>" + esc(x.text) + "</p>" +
      (linkOk(x.link) ? '<a href="' + esc(linkOk(x.link)) + '">' + esc(x.link_text || "Ansehen") + " →</a>" : "") +
      (x.quelle === "wissen" ? '<span class="klein">aus Wissen &amp; Einarbeitung</span>' : "") + "</article>").join("") +
    '<p class="klein">Hat es geholfen? Dann musst du nichts senden. Sonst einfach weiter ausfüllen.</p>';
}

function seiteNeu() {
  const e = entwurf();
  const arten = Object.entries(ARTEN).map(([k, v]) => '<label class="tk-art-wahl"><input type="radio" name="art" value="' + k + '"' + (e.art === k ? " checked" : "") + ">" +
    '<span><b>' + esc(v) + '</b><span class="klein">' + esc(ARTEN_TEXT[k]) + "</span></span></label>").join("");
  const dring = Object.entries(DRINGLICHKEIT).map(([k, v]) => '<option value="' + k + '"' + (e.dringlichkeit === k ? " selected" : "") + ">" + esc(v) + "</option>").join("");
  const fehlerArt = e.art === "fehler" || e.art === "daten";
  return nurHierHinweis() +
    '<p class="pj-krumen"><a href="#/tickets">Tickets</a> / melden</p>' +
    kopf("Problem melden", "Kurz beschreiben, was passiert ist. Version, Seite und – am Rechner – die letzten Fehler aus dem ODIN-Protokoll hängt ODIN selbst an (ohne Namen, Adressen und Passwörter).") +
    '<div class="gitter zweidrittel tk-melden">' +
    '<section class="karte"><form class="tk-formular" data-tk-form="anlegen" novalidate>' +
      '<fieldset class="tk-arten"><legend>Was möchtest du melden?</legend>' + arten + "</fieldset>" +
      '<label class="feld"><span>Titel</span><input type="text" name="titel" maxlength="120" required autocomplete="off" value="' + esc(e.titel) + '" placeholder="z. B. Teileliste wird nicht gelesen"></label>' +
      '<label class="feld"><span>Beschreibung</span><textarea name="beschreibung" rows="4" maxlength="4000" placeholder="Was ist passiert? Was hast du gemacht? Fahrzeug, Teilenummer oder Zeile helfen.">' + esc(e.beschreibung) + "</textarea></label>" +
      '<div class="tk-hinweise-schmal" id="tk-hinweise-schmal" aria-live="polite">' + hinweiseHtml() + "</div>" +
      '<label class="feld' + (fehlerArt ? "" : " tk-aus") + '"><span>So lässt es sich nachstellen (optional)</span><textarea name="schritte" rows="3" maxlength="2000" placeholder="1. Seite öffnen  2. auf … klicken  3. …">' + esc(e.schritte) + "</textarea></label>" +
      '<label class="feld"><span>' + (e.art === "idee" ? "Was soll stattdessen passieren?" : "Was hättest du erwartet? (optional)") + '</span><textarea name="erwartet" rows="2" maxlength="1000">' + esc(e.erwartet) + "</textarea></label>" +
      '<div class="tk-zwei"><label class="feld"><span>Betroffene Seite</span><select name="route">' + seitenOptionen(e.route) + "</select></label>" +
        '<label class="feld"><span>Dringlichkeit</span><select name="dringlichkeit">' + dring + "</select></label></div>" +
      '<div class="feld"><span>Bildschirmfoto (optional)</span>' +
        '<div class="tk-bild-feld" data-tk-bild-feld>' + (TK.bild ? '<img src="' + esc(TK.bild) + '" alt="Bildschirmfoto (Vorschau)"><button type="button" class="btn" data-tk="bild-weg">Bild entfernen</button>'
          : '<label class="btn tk-datei">' + ic("i-file") + 'Bild wählen<input type="file" accept="image/png,image/jpeg" data-tk-datei hidden></label>' +
            '<span class="klein">oder mit Strg+V einfügen (Windows: Win+Umschalt+S macht ein Bildschirmfoto). Nur PNG oder JPEG – bitte nichts Vertrauliches zeigen.</span>') + "</div></div>" +
      '<div class="tk-knoepfe"><a class="btn" href="#/tickets">Abbrechen</a><button class="btn btn-primaer" type="submit">Ticket senden</button></div>' +
    "</form></section>" +
    '<aside class="karte tk-hinweise" id="tk-hinweise" aria-live="polite">' + (hinweiseHtml() || '<div class="tk-hinweise-leer">' + ic("ci-wissen") + "<p>Beim Tippen sucht ODIN nach bekannten Lösungen – in typischen Problemen und in den Anleitungen.</p></div>") + "</aside>" +
    "</div>";
}

let hinweisZeit = 0;
function hinweiseSuchen() {
  clearTimeout(hinweisZeit);
  hinweisZeit = setTimeout(async () => {
    const e = entwurf();
    const text = (e.titel + " " + e.beschreibung).trim();
    const nr = ++TK.hinweisNr;
    let h = [];
    if (text.length >= 4) { try { h = await ruf("hinweise", text, e.route || ""); } catch (x) { h = []; } }
    if (nr !== TK.hinweisNr) return;
    TK.hinweise = Array.isArray(h) ? h : [];
    const schmal = document.getElementById("tk-hinweise-schmal");
    if (schmal) schmal.innerHTML = hinweiseHtml();
    const el = document.getElementById("tk-hinweise");
    if (el) el.innerHTML = hinweiseHtml() || '<div class="tk-hinweise-leer">' + ic("ci-wissen") + "<p>" + (text.length >= 4 ? "Dazu kennt ODIN noch keine Lösung – dann bitte melden." : "Beim Tippen sucht ODIN nach bekannten Lösungen – in typischen Problemen und in den Anleitungen.") + "</p></div>";
  }, 450);
}

/* Bild: verkleinern (höchstens 1920 Pixel) und als JPEG – so bleibt es klein, auch für den Browser-Zugang. */
async function bildLesen(datei) {
  if (!datei || !/^image\/(png|jpeg)$/.test(datei.type)) throw new Error("Bitte ein PNG- oder JPEG-Bild wählen.");
  if (datei.size > 15 * 1024 * 1024) throw new Error("Das Bild ist zu groß (höchstens 15 MB).");
  const url = URL.createObjectURL(datei);
  try {
    const img = await new Promise((ok, fehler) => { const i = new Image(); i.onload = () => ok(i); i.onerror = () => fehler(new Error("Das Bild ließ sich nicht lesen.")); i.src = url; });
    for (const [kante, guete] of [[1920, 0.85], [1600, 0.75], [1280, 0.7]]) {
      const f = Math.min(1, kante / Math.max(img.naturalWidth, img.naturalHeight));
      const c = document.createElement("canvas");
      c.width = Math.max(1, Math.round(img.naturalWidth * f)); c.height = Math.max(1, Math.round(img.naturalHeight * f));
      const g = c.getContext("2d");
      g.fillStyle = "#fff"; g.fillRect(0, 0, c.width, c.height);
      g.drawImage(img, 0, 0, c.width, c.height);
      const daten = c.toDataURL("image/jpeg", guete);
      if (daten.length < 1.6e6) return daten;
    }
    throw new Error("Das Bild ist zu groß – bitte einen kleineren Ausschnitt wählen.");
  } finally { URL.revokeObjectURL(url); }
}
async function bildSetzen(datei) {
  try {
    TK.bild = await bildLesen(datei);
    const feld = document.querySelector("[data-tk-bild-feld]");
    if (feld) neu();
  } catch (e) { meldung(String(e.message || e), true); }
}

function formLesen(form) {
  const fd = new FormData(form);
  const e = entwurf();
  for (const k of ["art", "titel", "beschreibung", "schritte", "erwartet", "route", "dringlichkeit"]) if (fd.has(k)) e[k] = String(fd.get(k) || "");
  return e;
}

function kontext() {
  const ua = navigator.userAgent || "";
  const geraet = /iPhone/.test(ua) ? "iPhone" : /iPad/.test(ua) ? "iPad" : /Android/.test(ua) ? "Android" : /Windows/.test(ua) ? "Windows" : /Mac OS X/.test(ua) ? "Mac" : "";
  const browser = /Edg\//.test(ua) ? "Edge" : /Chrome\//.test(ua) ? "Chrome" : /Firefox\//.test(ua) ? "Firefox" : /Safari\//.test(ua) ? "Safari" : "";
  return { route: TK.entwurf ? TK.entwurf.route : "", plattform: [geraet, browser].filter(Boolean).join(" · "), bildschirm: innerWidth + "×" + innerHeight };
}

/* ------------------------------------------------------------ Ein Ticket */
function textBlock(titel, text) {
  return text ? '<div class="tk-block"><h3>' + titel + '</h3><p class="tk-text">' + esc(text) + "</p></div>" : "";
}

function claudeHtml(t) {
  const a = t.claude || [];
  if (!a.length) return "";
  return '<section class="karte tk-claude"><div class="karte-kopf"><div><h2>Hinweis von Claude</h2><p>Aus dem Ticketordner – ' + (a.length > 1 ? mehrzahl(a.length, "Antwort", "Antworten") : "eine Antwort") + ".</p></div></div>" +
    a.slice().reverse().map((x) => '<article class="tk-antwort"><div class="tk-antwort-kopf">' + statusChip(x.status) +
      (x.behoben_in ? chip("behoben in Version " + x.behoben_in, "gut") : "") + '<span class="klein">' + esc(zeit(x.am)) + "</span></div>" +
      '<p class="tk-text">' + esc(x.text) + "</p>" +
      (x.links && x.links.length ? '<ul class="tk-links">' + x.links.map((l) => webLinkOk(l.url) ? '<li><a href="' + esc(webLinkOk(l.url)) + '" target="_blank" rel="noopener noreferrer">' + esc(l.titel || l.url) + "</a></li>" : "").join("") + "</ul>" : "") +
      "</article>").join("") + "</section>";
}

function verlaufHtml(t) {
  const punkte = [{ am: t.am, art: "angelegt", von_name: t.von_name, text: "" }].concat(t.verlauf || [])
    .concat((t.claude || []).map((a) => ({ am: a.am, art: "claude", von_name: "Claude", status: a.status, text: "" })));
  punkte.sort((a, b) => String(a.am).localeCompare(String(b.am)));
  return '<ol class="tk-verlauf">' + punkte.map((p) => {
    const was = p.art === "angelegt" ? "hat das Ticket angelegt" : p.art === "status" ? "Status → " + (STATUS[p.status] || p.status) : p.art === "claude" ? "Hinweis aus dem Ticketordner" + (p.status !== "hinweis" ? " · " + (STATUS[p.status] || "") : "") : "";
    return '<li class="tk-v-' + esc(p.art) + '"><div class="tk-v-kopf"><b>' + esc(p.von_name) + "</b>" + (was ? "<span>" + esc(was) + "</span>" : "") + '<span class="klein">' + esc(zeit(p.am)) + "</span></div>" +
      (p.text ? '<p class="tk-text">' + esc(p.text) + "</p>" : "") + "</li>";
  }).join("") + "</ol>";
}

function seiteTicket(id) {
  if (!ID.test(id)) return '<div class="pj-leer"><h2>Unbekanntes Ticket</h2><a class="btn" href="#/tickets">Zur Übersicht</a></div>';
  if (!TK.ticket || TK.ticket.id !== id) {
    if (TK.ticketFehler) return '<p class="pj-krumen"><a href="#/tickets">Tickets</a> / nicht gefunden</p><div class="pj-leer"><h2>Nicht gefunden</h2><p>' + esc(TK.ticketFehler) + '</p><a class="btn" href="#/tickets">Zur Übersicht</a></div>';
    ruf("ticket", id).then((t) => { TK.ticket = t; TK.ticketFehler = ""; }).catch((e) => { TK.ticketFehler = String(e.message || e); }).finally(() => { if (aufSeite()) neu(); });
    return ladeAnzeige();
  }
  const t = TK.ticket;
  const k = t.kontext || {};
  const d = t.darf || {};
  const statusWahl = d.status ? '<form class="tk-status-form" data-tk-form="status"><label class="feld"><span>Status</span><select name="status">' +
      Object.entries(STATUS).map(([s, n]) => '<option value="' + s + '"' + (s === t.status ? " selected" : "") + ">" + esc(n) + "</option>").join("") + "</select></label>" +
      '<label class="feld"><span>Kurz dazu (optional, sieht die meldende Person)</span><textarea name="kommentar" rows="2" maxlength="2000"></textarea></label>' +
      '<button class="btn btn-primaer" type="submit">Status setzen</button></form>' : "";
  const melder = d.melder_status ? '<div class="tk-knoepfe tk-links-buendig">' + (OFFEN.includes(t.status)
      ? '<button class="btn" data-tk="melder-status" data-status="erledigt">' + ic("i-check") + "Problem ist gelöst</button>"
      : '<button class="btn" data-tk="melder-status" data-status="neu">Wieder öffnen</button>') + "</div>" : "";
  const claude = d.claude ? '<section class="karte tk-fuer-claude"><div class="karte-kopf"><div><h2>Für Claude</h2><p>Fertiger Auftragstext – bereinigt, ohne Namen, Adressen und Passwörter. Die Antwort legt Claude als <span class="mono">' + esc(t.id) + '.antwort.json</span> in den Ticketordner; sie erscheint dann hier.</p></div></div>' +
      '<div class="tk-claude-knoepfe"><button class="btn btn-primaer" data-tk="claude-kopieren">' + ic("i-copy") + "Für Claude kopieren</button></div>" +
      (TK.claudeText ? '<textarea class="tk-claude-text" readonly rows="10" aria-label="Auftragstext für Claude">' + esc(TK.claudeText) + "</textarea>" : "") + "</section>" : "";
  const details = [["Status", statusChip(t.status) + (t.status_quelle === "claude" ? ' <span class="klein">durch Hinweis von Claude</span>' : "")],
    ["Art", esc(ARTEN[t.art] || t.art)], ["Dringlichkeit", esc(DRINGLICHKEIT[t.dringlichkeit] || "")],
    ["Seite", t.route ? (linkOk(t.route) ? '<a href="' + esc(linkOk(t.route)) + '">' + esc(t.seite || t.route) + "</a>" : esc(t.route)) : "–"],
    ["Gemeldet", esc(t.von_name) + '<br><span class="klein">' + esc(zeit(t.am)) + "</span>"],
    ["Kennung", '<span class="mono">' + esc(t.id) + "</span>"]];
  const technik = k.version ? '<details class="tk-technik"><summary>Technischer Kontext</summary><dl>' +
      "<dt>Version</dt><dd>" + esc(k.version) + "</dd><dt>Plattform</dt><dd>" + esc(k.plattform || "–") + "</dd>" +
      (k.bildschirm ? "<dt>Fenster</dt><dd>" + esc(k.bildschirm) + "</dd>" : "") + "</dl>" +
      (k.protokoll && k.protokoll.length ? '<p class="klein">Letzte Fehler aus dem Protokoll (bereinigt):</p>' + k.protokoll.map((z) => '<pre class="tk-pre">' + esc(z) + "</pre>").join("") : '<p class="klein">Keine Fehler im Protokoll der letzten Tage' + (k.browser ? " (im Browser gemeldet – das Protokoll gehört zum Rechner)" : "") + ".</p>") +
      "</details>" : "";
  return '<p class="pj-krumen"><a href="#/tickets">Tickets</a> / #' + esc(t.nummer) + "</p>" +
    kopf(esc(t.titel), esc(ARTEN[t.art] || t.art) + " · gemeldet am " + esc(zeit(t.am)) + (t.seite ? " · " + esc(t.seite) : "")) +
    '<div class="gitter zweidrittel tk-ticket"><div class="tk-spalte">' +
      claudeHtml(t) +
      '<section class="karte"><div class="karte-kopf"><div><h2>Meldung</h2></div></div><div class="tk-inhalt">' +
        (textBlock("Beschreibung", t.beschreibung) || '<p class="klein">Keine Beschreibung.</p>') + textBlock("So lässt es sich nachstellen", t.schritte) + textBlock(t.art === "idee" ? "Was stattdessen passieren soll" : "Erwartet", t.erwartet) +
        (t.bild_daten && /^data:image\/jpeg;base64,[A-Za-z0-9+/=]+$/.test(t.bild_daten) ? '<div class="tk-block"><h3>Bildschirmfoto</h3><img class="tk-bild" src="' + esc(t.bild_daten) + '" alt="Bildschirmfoto zum Ticket"></div>' : "") +
      "</div></section>" +
      '<section class="karte"><div class="karte-kopf"><div><h2>Verlauf</h2></div></div>' + verlaufHtml(t) +
        '<form class="tk-kommentar" data-tk-form="kommentar"><label class="feld"><span>Kommentar</span><textarea name="text" rows="2" maxlength="2000" required placeholder="' + (d.status ? "Antwort an die meldende Person …" : "Noch etwas dazu? Hat es geklappt?") + '"></textarea></label>' +
        '<button class="btn" type="submit">Kommentar senden</button></form></section>' +
    "</div><div class=\"tk-spalte\">" +
      '<section class="karte"><div class="karte-kopf"><div><h2>Details</h2></div></div><dl class="tk-details">' +
        details.map(([a, b]) => "<dt>" + a + "</dt><dd>" + b + "</dd>").join("") + "</dl>" + technik + melder + "</section>" +
      (statusWahl ? '<section class="karte"><div class="karte-kopf"><div><h2>Bearbeiten</h2><p>Nur Verwalter, nur am Rechner.</p></div></div>' + statusWahl + "</section>" : "") +
      claude +
    "</div></div>";
}

/* ------------------------------------------------------------ Seite */
function seite(rest) {
  if (!TK.start) { if (!TK.fehler) laden().then(neu); return { html: ladeAnzeige(TK.fehler) }; }
  if (TK.fehler) return { html: ladeAnzeige(TK.fehler) };
  if (!TK.start.ich) return { html: werBistDu() };
  const teil = String(rest || "").split("/")[0];
  if (teil === "neu") return { html: '<div class="tk">' + seiteNeu() + "</div>" };
  if (teil) return { html: '<div class="tk">' + seiteTicket(teil) + "</div>" };
  return { html: '<div class="tk">' + seiteListe() + "</div>" };
}

async function nachAenderung(t) {
  if (t) TK.ticket = t;
  await laden();
  neu();
}

async function kopieren(text) {
  try { await navigator.clipboard.writeText(text); return true; } catch (e) { /* weiter unten versuchen */ }
  const api = window.pywebview && window.pywebview.api;
  if (api && typeof api.kopiere === "function") { try { await api.kopiere(text); return true; } catch (e) { /* weiter */ } }
  const feld = document.querySelector(".tk-claude-text");
  if (feld) { feld.select(); try { return document.execCommand("copy"); } catch (e) { return false; } }
  return false;
}

document.addEventListener("click", async (ev) => {
  const f = ev.target.closest("#inhalt [data-tk-filter]");
  if (f) { TK.filter = f.dataset.tkFilter; neu(); return; }
  const k = ev.target.closest("#inhalt [data-tk]");
  if (!k) return;
  const art = k.dataset.tk;
  try {
    if (art === "neu-laden") { TK.start = null; TK.fehler = ""; neu(); }
    if (art === "bild-weg") { TK.bild = ""; neu(); }
    if (art === "melder-status") {
      k.disabled = true;
      const t = await ruf("status_setzen", TK.ticket.id, k.dataset.status, "");
      meldung(k.dataset.status === "erledigt" ? "Danke – als erledigt markiert." : "Wieder geöffnet.");
      await nachAenderung(t);
    }
    if (art === "claude-kopieren") {
      k.disabled = true;
      TK.claudeText = await ruf("fuer_claude", TK.ticket.id);
      neu();
      const ok = await kopieren(TK.claudeText);
      meldung(ok ? "Auftragstext kopiert – jetzt bei Claude einfügen." : "Kopieren ging nicht – bitte den Text unten markieren und kopieren.", !ok);
    }
  } catch (e) {
    meldung(String(e.message || e), true);
  } finally { if (k.isConnected) k.disabled = false; }
});

document.addEventListener("input", (ev) => {
  const s = ev.target.closest("#inhalt [data-tk-suche]");
  if (s) {
    TK.suche = s.value;
    const karte = document.querySelector("#inhalt .tk-liste-karte");
    if (karte && TK.start) {
      const liste = (TK.start.tickets || []).filter(passt);
      karte.innerHTML = liste.length ? '<ul class="tk-liste">' + liste.map(zeileHtml).join("") + "</ul>" : '<div class="karte-leer">Keine Tickets für diese Auswahl.</div>';
    }
    return;
  }
  const form = ev.target.closest('#inhalt [data-tk-form="anlegen"]');
  if (form) {
    formLesen(form);
    if (ev.target.name === "titel" || ev.target.name === "beschreibung") hinweiseSuchen();
  }
});

document.addEventListener("change", async (ev) => {
  const a = ev.target.closest("#inhalt [data-tk-art]");
  if (a) { TK.art = a.value; neu(); return; }
  const m = ev.target.closest("#inhalt [data-tk-meine]");
  if (m) { TK.nurMeine = m.checked; neu(); return; }
  const d = ev.target.closest("#inhalt [data-tk-datei]");
  if (d) { if (d.files && d.files[0]) await bildSetzen(d.files[0]); return; }
  const form = ev.target.closest('#inhalt [data-tk-form="anlegen"]');
  if (form) {
    const vorher = entwurf().art;
    formLesen(form);
    if (ev.target.name === "art" && vorher !== entwurf().art) neu();
    if (ev.target.name === "route") hinweiseSuchen();
  }
});

document.addEventListener("paste", (ev) => {
  if (!(location.hash || "").startsWith("#/tickets/neu")) return;
  const teil = [...((ev.clipboardData && ev.clipboardData.items) || [])].find((x) => x.kind === "file" && /^image\/(png|jpeg)$/.test(x.type));
  if (!teil) return;
  ev.preventDefault();
  bildSetzen(teil.getAsFile());
});

document.addEventListener("submit", async (ev) => {
  const f = ev.target.closest("#inhalt [data-tk-form]");
  if (!f) return;
  ev.preventDefault();
  const knopf = ev.submitter || f.querySelector('[type="submit"]');
  if (TK.sendet) return;
  TK.sendet = true;
  if (knopf) knopf.disabled = true;
  try {
    const art = f.dataset.tkForm;
    if (art === "anlegen") {
      const e = formLesen(f);
      if ((e.titel || "").trim().length < 3) { const t = f.querySelector('[name="titel"]'); t.setAttribute("aria-invalid", "true"); t.focus(); throw new Error("Bitte einen kurzen Titel eingeben."); }
      const t = await ruf("anlegen", { ...e, bild: TK.bild || "" }, kontext());
      TK.entwurf = null; TK.bild = ""; TK.hinweise = []; TK.vonRoute = ""; TK.ticket = t; TK.claudeText = ""; TK.frisch = true;
      meldung("Danke! Dein Ticket ist angekommen.");
      await laden();
      location.hash = "#/tickets/" + t.id;
    }
    if (art === "kommentar") {
      const text = new FormData(f).get("text");
      const t = await ruf("kommentieren", TK.ticket.id, text);
      meldung("Kommentar gespeichert.");
      await nachAenderung(t);
    }
    if (art === "status") {
      const fd = new FormData(f);
      const t = await ruf("status_setzen", TK.ticket.id, fd.get("status"), fd.get("kommentar") || "");
      meldung("Status: " + (STATUS[t.status] || t.status));
      await nachAenderung(t);
    }
  } catch (e) {
    meldung(String(e.message || e), true);
  } finally {
    TK.sendet = false;
    if (knopf && knopf.isConnected) knopf.disabled = false;
  }
});

/* Schnellzugang „Problem melden“: merkt sich die aktuelle Seite und öffnet das Formular */
function melden() {
  const hash = location.hash || "#/uebersicht";
  if (!hash.startsWith("#/tickets")) {
    TK.vonRoute = hash;
    if (TK.entwurf && !TK.entwurf.titel && !TK.entwurf.beschreibung) TK.entwurf.route = hash;
  }
  if (TK.entwurf && !TK.entwurf.route) TK.entwurf.route = TK.vonRoute;
  location.hash = "#/tickets/neu";
}
document.addEventListener("click", (ev) => {
  const b = ev.target.closest("#ticket-melden");
  if (!b) return;
  ev.preventDefault();
  melden();
});

// Beim Betreten frisch laden (Antworten von Claude, neue Tickets von anderen Rechnern)
let zuletzt = 0;
addEventListener("hashchange", (ev) => {
  const alt = String(ev.oldURL || "");
  const rein = aufSeite() && !alt.includes("#/tickets");
  const teil = (location.hash || "").slice(2).split("/")[1] || "";
  // Ein Ticket immer frisch lesen (Antworten von Claude, Kommentare von anderen) – außer direkt nach dem Anlegen
  if (aufSeite() && ID.test(teil) && !(TK.frisch && TK.ticket && TK.ticket.id === teil)) { TK.ticket = null; TK.ticketFehler = ""; TK.claudeText = ""; }
  TK.frisch = false;
  if (!rein || Date.now() - zuletzt < 3000) return;
  zuletzt = Date.now();
  laden().then(() => { if (aufSeite()) neu(); });
});
addEventListener("focus", () => { if (!aufSeite()) zaehlerLaden(); });
const ichGewechselt = () => { TK.start = null; TK.ticket = null; TK.fehler = ""; if (aufSeite()) laden().then(neu); else zaehlerLaden(); };
addEventListener("odin-ich", ichGewechselt);
addEventListener("odin-ich-urlaub", ichGewechselt);

window.ODIN_SEITEN = window.ODIN_SEITEN || {};
window.ODIN_SEITEN.tickets = { render: seite, menue: () => "tickets" };
if (aufSeite() && typeof window.cockpitZeichne === "function") window.cockpitZeichne();
const anfangen = () => { if (aufSeite()) laden().then(neu); else zaehlerLaden(); };
if (window.pywebview && window.pywebview.api) anfangen(); else addEventListener("pywebviewready", anfangen, { once: true });
})();
