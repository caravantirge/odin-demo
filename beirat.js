/* ODIN · Beirat & Coaching
   Das Wissen von Vollprofis, übertragen auf unseren Alltag: „Frag den Beirat“ (typische Situationen mit Rat aus
   2–3 Perspektiven), Themen & Module (Coaching-Karten) und die Beiratsmitglieder.
   Daten: tirge_helfer/beirat.py über beirat_aufruf – mitgeliefert, statisch, für alle lesbar (auch im Browser).
   Seiten: #/beirat (Frag den Beirat), #/beirat/themen, #/beirat/mitglieder, #/beirat/situation|modul|mitglied/<id>,
   #/beirat/suche/<text> (z. B. vom Fragen-Assistenten). Eingehängt über window.ODIN_SEITEN (cockpit.js).
   Sicherheit: Jeder Text geht durch esc() – auch in Attributen; Adressen nur aus geprüften Kennungen (a–z, 0–9).
   Keine Bilder der Personen: Kürzel im Kreis.
   Verbindliche Hausregeln (hausregeln.py) gehen jedem Tipp vor: ein Block auf „Frag den Beirat“ und bei den Modulen,
   die eine Regel berühren. Umbenannte Module (start().alias) öffnen unter ihrer alten Adresse das neue Modul. */
(() => {
"use strict";

const B = {
  start: null,            // Antwort von start(): themen, mitglieder, module, situationen, impuls, hinweis
  fehler: "",
  suche: "",              // Text im Suchfeld
  sucheAusHash: null,     // zuletzt aus #/beirat/suche/<text> übernommen
  treffer: null,          // Antwort von suche() zum aktuellen Text
  nr: 0,                  // laufende Nummer der Suche – ältere Antworten werden verworfen
  thema: "",              // Filter unter „Themen & Module“
};

const REITER = [["frag", "Frag den Beirat"], ["themen", "Module"], ["mitglieder", "Mitglieder"]];
const HAEUFIG = ["zuteuer", "ueberlegen", "rabatt", "reklamationuebergabe", "verzettelt", "entscheidung"];
const ID = /^[a-z0-9]{2,40}$/;
const esc = (s) => String(s ?? "").replace(/[&<>"'`]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;", "`": "&#96;" }[c]));
const ic = (n) => '<svg class="ic" aria-hidden="true"><use href="#ci-' + n + '"/></svg>';
const hashTeile = () => (location.hash || "").slice(2).split("/").map((t) => { try { return decodeURIComponent(t); } catch (e) { return ""; } });
const istMeineSeite = () => hashTeile()[0] === "beirat";
const link = (art, id) => ID.test(String(id)) ? "#/beirat/" + art + "/" + id : "#/beirat";
const mehrzahl = (n, eins, viele) => n + " " + (n === 1 ? eins : viele);

/* ------------------------------------------------------------ Schnittstelle */
async function ruf(aktion, ...args) {
  const api = window.pywebview && window.pywebview.api;
  if (!api || typeof api.beirat_aufruf !== "function") throw new Error("Beirat & Coaching ist gerade nicht erreichbar.");
  const r = await api.beirat_aufruf(aktion, args);
  if (!r || !r.ok) throw new Error((r && r.fehler) || "Unbekannter Fehler");
  if (r.daten === null || r.daten === undefined) throw new Error("Keine Daten erhalten – bitte nochmal versuchen.");
  return r.daten;
}

let laedt = null;
function laden() {
  if (laedt) return laedt;
  if (!(window.pywebview && window.pywebview.api)) {          // Programm noch nicht bereit: danach laden
    laedt = new Promise((fertig) => addEventListener("pywebviewready", () => { laedt = null; laden().then(fertig); }, { once: true }));
    return laedt;
  }
  laedt = ruf("start").then((s) => {
    for (const feld of ["themen", "mitglieder", "module", "situationen"]) if (!Array.isArray(s[feld])) s[feld] = [];
    B.start = s; B.fehler = "";
  }).catch((e) => { B.fehler = String(e.message || e); }).finally(() => { laedt = null; if (istMeineSeite()) neu(); });
  return laedt;
}
const neu = () => { if (typeof window.cockpitZeichne === "function") window.cockpitZeichne(); };

/* ------------------------------------------------------------ Nachschlagen */
const finde = (art, id) => (B.start ? B.start[art] : []).find((x) => x.id === id) || null;
const mitglied = (id) => finde("mitglieder", id);
const modul = (id) => finde("module", id) || (B.start && B.start.alias && Object.prototype.hasOwnProperty.call(B.start.alias, id) ? finde("module", B.start.alias[id]) : null);
const REGEL_ID = /^[A-Z]{3,12}-\d{3}$/;
/* Hausregeln: Text aus den Daten (maskiert); nachlesen unter Wissen & Einarbeitung – nur im ODIN-Fenster */
function regelBlock(regeln, titel) {
  const liste = (regeln || []).filter((r) => r && REGEL_ID.test(String(r.id)));
  if (!liste.length) return "";
  return '<section class="karte br-block br-hausregel" aria-label="Verbindliche Hausregeln"><span class="br-ueber">' + esc(titel) + "</span>" +
    '<ul class="br-regeln">' + liste.map((r) => '<li><b>' + esc(r.id) + " · " + esc(r.titel) + ":</b> " + esc(r.regel) + "</li>").join("") + "</ul>" +
    '<p class="klein">Hausregeln gehen jedem Coaching-Tipp vor. Ausnahmen und Kundenformulierungen: <a href="#/wissen/hausregeln">Wissen &amp; Einarbeitung → Hausregeln</a>.</p></section>';
}
const situation = (id) => finde("situationen", id);
const thema = (id) => finde("themen", id);
const farbIndex = (id) => Math.max(0, (B.start ? B.start.mitglieder : []).findIndex((m) => m.id === id));

/* Kürzel im Kreis – bewusst kein Bild. Farbe nur aus der Position in der festen Liste. */
function mono(id, gross) {
  const m = mitglied(id);
  if (!m) return "";
  return '<span class="br-mono' + (gross ? " gross" : "") + '" style="--ton:' + (farbIndex(id) * 36) + '" aria-hidden="true">' + esc(m.kuerzel) + "</span>";
}
const mitgliedLink = (id) => { const m = mitglied(id); return m ? '<a class="br-person" href="' + link("mitglied", id) + '">' + mono(id) + "<span>" + esc(m.name) + "</span></a>" : ""; };
const themaChip = (id) => { const t = thema(id); return t ? '<span class="pj-chip">' + esc(t.titel) + "</span>" : ""; };

/* ------------------------------------------------------------ Bausteine */
function kopf(aktiv) {
  return '<div class="kopf br-kopf"><div><h1>Beirat &amp; Coaching</h1><p>Das Wissen von Vollprofis – übertragen auf unseren Alltag bei Muster: ' +
    "Verkaufen, Verhandeln, Entscheiden, Struktur, Service und Führung. Für alle im Team, jederzeit.</p></div></div>" +
    '<div class="br-leiste"><nav class="pj-segment br-reiter" role="tablist" aria-label="Bereiche im Beirat">' + REITER.map(([k, t]) =>
      '<a role="tab" href="#/beirat' + (k === "frag" ? "" : "/" + k) + '" aria-selected="' + (k === aktiv) + '">' + esc(t) + "</a>").join("") + "</nav></div>";
}
const krumen = (reiter, titel) => {
  const r = REITER.find((x) => x[0] === reiter) || REITER[0];
  return '<p class="pj-krumen"><a href="#/beirat' + (r[0] === "frag" ? "" : "/" + r[0]) + '">' + esc(r[1]) + "</a> / " + esc(titel) + "</p>";
};
const hinweis = () => '<p class="br-hinweis">' + ic("info") + "<span>" + esc(B.start.hinweis) + " Bilder, Logos oder Aussagen der Personen gibt es hier nicht.</span></p>";
const nichtGefunden = (reiter, was) => '<div class="pj-leer">' + krumen(reiter, "nicht gefunden") + "<h2>Nicht gefunden</h2><p>" + esc(was) + ' gibt es nicht (mehr).</p><a class="btn" href="#/beirat">Zum Beirat</a></div>';
const liste = (punkte, klasse) => punkte && punkte.length ? '<ul class="' + (klasse || "br-liste") + '">' + punkte.map((p) => "<li>" + esc(p) + "</li>").join("") + "</ul>" : "";
const zitate = (punkte) => punkte && punkte.length ? '<div class="br-saetze">' + punkte.map((p) => '<p class="br-satz">' + esc(p) + "</p>").join("") + "</div>" : "";

function situationKarte(s) {
  const wer = s.perspektiven.map((p) => p.mitglied);
  return '<a class="karte br-karte br-sit" href="' + link("situation", s.id) + '">' +
    '<span class="br-karte-titel">' + esc(s.titel) + "</span>" +
    '<span class="br-karte-text">' + esc(s.lage) + "</span>" +
    '<span class="br-karte-fuss"><span class="br-monos">' + wer.map((m) => mono(m)).join("") + "</span>" +
      '<span class="klein">' + esc(wer.map((m) => (mitglied(m) || {}).name || "").filter(Boolean).join(", ")) + "</span></span></a>";
}

function modulKarte(m) {
  return '<a class="karte br-karte" href="' + link("modul", m.id) + '">' +
    '<span class="br-karte-titel">' + esc(m.titel) + "</span>" +
    '<span class="br-karte-text br-drei">' + esc(m.kernidee) + "</span>" +
    '<span class="br-karte-fuss"><span class="br-monos">' + m.mitglieder.map((x) => mono(x)).join("") + "</span>" +
      '<span class="klein">' + mehrzahl(m.schritte.length, "Schritt", "Schritte") + (m.formulierungen.length ? " · Formulierungen" : "") + "</span></span></a>";
}

function mitgliedKarte(m) {
  return '<a class="karte br-karte br-mitglied-karte" href="' + link("mitglied", m.id) + '">' +
    '<span class="br-mitglied-kopf">' + mono(m.id, true) + '<span><span class="br-karte-titel">' + esc(m.name) + '</span><span class="klein">' + esc(m.bekannt) + "</span></span></span>" +
    '<span class="br-karte-text"><b>Steht für:</b> ' + esc(m.fuer) + "</span>" +
    '<span class="br-karte-fuss"><span class="klein">' + mehrzahl(m.module.length, "Modul", "Module") + " · " + mehrzahl(m.situationen.length, "Situation", "Situationen") + "</span></span></a>";
}

function impulsKarte() {
  const g = B.start.impuls;
  if (!g || !g.text) return "";
  return '<section class="karte br-impuls"><div class="br-impuls-kopf">' + mono(g.mitglied) + '<span class="br-ueber">Gedanke des Tages aus dem Beirat</span></div>' +
    '<p class="br-impuls-text">' + esc(g.text) + "</p>" +
    '<p class="klein br-impuls-fuss">Sinngemäß nach ' + esc(g.name) + (modul(g.modul) ? ' · <a href="' + link("modul", g.modul) + '">Modul: ' + esc(modul(g.modul).titel) + "</a>" : "") + "</p></section>";
}

/* ------------------------------------------------------------ Frag den Beirat */
function ergebnisHtml() {
  const s = B.suche.trim();
  if (!s) {
    return B.start.themen.map((t) => {
      const eigene = B.start.situationen.filter((x) => x.thema === t.id);
      return eigene.length ? '<section class="br-gruppe"><div class="br-gruppe-kopf"><h2>' + esc(t.titel) + '</h2><span class="klein">' + esc(t.text) + "</span></div>" +
        '<div class="br-raster">' + eigene.map(situationKarte).join("") + "</div></section>" : "";
    }).join("");
  }
  const t = B.treffer;
  if (!t || t.text !== B.suche) return '<p class="br-leer" aria-live="polite">Suche …</p>';
  const sit = t.situationen.map((x) => situation(x.id)).filter(Boolean);
  const mod = t.module.map((x) => modul(x.id)).filter(Boolean);
  const mit = t.mitglieder.map((x) => mitglied(x.id)).filter(Boolean);
  if (!sit.length && !mod.length && !mit.length) {
    return '<div class="br-leer" aria-live="polite"><b>Dazu habe ich nichts gefunden.</b> Versuch es mit anderen Worten – z. B. „Rabatt“, „Reklamation“, „entscheiden“ – oder stöbere in den Themen.</div>';
  }
  return '<div aria-live="polite">' +
    (sit.length ? '<section class="br-gruppe"><div class="br-gruppe-kopf"><h2>Passende Situationen</h2></div><div class="br-raster">' + sit.map(situationKarte).join("") + "</div></section>" : "") +
    (mod.length ? '<section class="br-gruppe"><div class="br-gruppe-kopf"><h2>Module</h2></div><div class="br-raster">' + mod.map(modulKarte).join("") + "</div></section>" : "") +
    (mit.length ? '<section class="br-gruppe"><div class="br-gruppe-kopf"><h2>Beiratsmitglieder</h2></div><div class="br-raster">' + mit.map(mitgliedKarte).join("") + "</div></section>" : "") +
    "</div>";
}

function seiteFrag() {
  const haeufig = HAEUFIG.map(situation).filter(Boolean);
  return kopf("frag") +
    '<div class="br-frag-oben">' +
      '<section class="karte br-suchkarte"><label class="br-such-label" for="br-suche">Was ist los? Beschreib die Situation in deinen Worten.</label>' +
        '<div class="br-suchfeld">' + '<svg class="ic" aria-hidden="true"><use href="#i-search"/></svg>' +
          '<input type="search" id="br-suche" data-br-suche autocomplete="off" maxlength="200" placeholder="z. B. Kunde sagt: zu teuer" value="' + esc(B.suche) + '"></div>' +
        '<div class="br-haeufig"><span class="klein">Häufig gefragt:</span>' + haeufig.map((s) => '<a class="br-chip" href="' + link("situation", s.id) + '">' + esc(s.titel) + "</a>").join("") + "</div></section>" +
      impulsKarte() +
    "</div>" + regelBlock(B.start.hausregeln, "Verbindliche Hausregeln – gelten vor jedem Tipp hier") +
    '<div id="br-ergebnis">' + ergebnisHtml() + "</div>" + hinweis();
}

function seiteSituation(id) {
  const s = situation(id);
  if (!s) return nichtGefunden("frag", "Diese Situation");
  const verwandt = B.start.situationen.filter((x) => x.thema === s.thema && x.id !== s.id).slice(0, 4);
  return '<div class="kopf br-kopf"><div>' + krumen("frag", s.titel) + "<h1>" + esc(s.titel) + "</h1>" +
      '<p class="br-lage">' + esc(s.lage) + "</p>" + '<div class="br-meta">' + themaChip(s.thema) + '<span class="klein">' + mehrzahl(s.perspektiven.length, "Perspektive", "Perspektiven") + "</span></div></div></div>" +
    '<div class="br-perspektiven">' + s.perspektiven.map((p) => {
      const m = mitglied(p.mitglied) || { name: "", fuer: "" };
      return '<section class="karte br-perspektive"><a class="br-persp-kopf" href="' + link("mitglied", p.mitglied) + '">' + mono(p.mitglied, true) +
          '<span><b>' + esc(m.name) + '</b><span class="klein">' + esc(m.fuer) + "</span></span></a>" +
        '<p class="br-kern">' + esc(p.kern) + "</p>" +
        '<h3 class="br-h3">Nächste Schritte</h3><ol class="br-schritte">' + p.schritte.map((x) => "<li>" + esc(x) + "</li>").join("") + "</ol>" +
        (p.formulierungen.length ? '<h3 class="br-h3">So kannst du es sagen</h3>' + zitate(p.formulierungen) : "") + "</section>";
    }).join("") + "</div>" +
    '<section class="br-gruppe"><div class="br-gruppe-kopf"><h2>Zum Vertiefen</h2><span class="klein">Die Module dahinter – mit Schritten, Praxisbeispiel und typischen Fehlern</span></div>' +
      '<div class="br-raster">' + s.module.map(modul).filter(Boolean).map(modulKarte).join("") + "</div></section>" +
    (verwandt.length ? '<section class="br-gruppe"><div class="br-gruppe-kopf"><h2>Ähnliche Situationen</h2></div><div class="br-raster">' + verwandt.map(situationKarte).join("") + "</div></section>" : "") +
    hinweis();
}

/* ------------------------------------------------------------ Themen & Module */
function seiteThemen() {
  const themen = B.start.themen.filter((t) => !B.thema || t.id === B.thema);
  const filter = '<div class="filter br-filter" role="group" aria-label="Thema">' +
    '<button class="' + (!B.thema ? "aktiv" : "") + '" data-br="thema" data-wert="" aria-pressed="' + !B.thema + '">Alle</button>' +
    B.start.themen.map((t) => '<button class="' + (B.thema === t.id ? "aktiv" : "") + '" data-br="thema" data-wert="' + esc(t.id) + '" aria-pressed="' + (B.thema === t.id) + '">' + esc(t.titel) + "</button>").join("") + "</div>";
  return kopf("themen") + filter + themen.map((t) => {
    const eigene = B.start.module.filter((m) => m.thema === t.id);
    return eigene.length ? '<section class="br-gruppe"><div class="br-gruppe-kopf"><h2>' + esc(t.titel) + '</h2><span class="klein">' + esc(t.text) + "</span></div>" +
      '<div class="br-raster">' + eigene.map(modulKarte).join("") + "</div></section>" : "";
  }).join("") + hinweis();
}

function seiteModul(id) {
  const m = modul(id);
  if (!m) return nichtGefunden("themen", "Dieses Modul");
  const sit = m.situationen.map(situation).filter(Boolean);
  return '<div class="kopf br-kopf"><div>' + krumen("themen", m.titel) + "<h1>" + esc(m.titel) + "</h1>" +
      '<div class="br-meta">' + themaChip(m.thema) + '<span class="klein">Aus dem Beirat:</span>' + m.mitglieder.map(mitgliedLink).join("") + "</div></div></div>" +
    '<div class="br-zweispaltig"><div class="br-spalte">' +
      regelBlock(m.hausregeln, "Hausregel – verbindlich") +
      '<section class="karte br-block br-kernidee"><span class="br-ueber">Kernidee</span><p>' + esc(m.kernidee) + "</p></section>" +
      '<section class="karte br-block"><h2>So gehst du vor</h2><ol class="br-schritte gross">' + m.schritte.map((x) => "<li>" + esc(x) + "</li>").join("") + "</ol></section>" +
      '<section class="karte br-block br-beispiel"><span class="br-ueber">Praxisbeispiel aus dem Caravanhandel</span><p>' + esc(m.beispiel) + "</p></section>" +
    '</div><div class="br-spalte">' +
      (m.formulierungen.length ? '<section class="karte br-block"><h2>Gesprächsleitfaden</h2><p class="klein">Formulierungen zum Anpassen – in deinen Worten wirken sie am besten.</p>' + zitate(m.formulierungen) + "</section>" : "") +
      '<section class="karte br-block br-fehler"><h2>Typische Fehler</h2>' + liste(m.fehler, "br-liste br-x") + "</section>" +
      (sit.length ? '<section class="karte br-block"><h2>Passt zu diesen Situationen</h2><ul class="br-links">' + sit.map((s) => '<li><a href="' + link("situation", s.id) + '">' + esc(s.titel) + "</a></li>").join("") + "</ul></section>" : "") +
    "</div></div>" + hinweis();
}

/* ------------------------------------------------------------ Mitglieder */
function seiteMitglieder() {
  return kopf("mitglieder") + '<p class="br-einleitung">Ein gedachter Beirat: Was würden diese Menschen an unserer Stelle tun? Ihre Ideen sind öffentlich bekannt – aus Büchern, Vorträgen und Briefen. Hier stehen sie in unseren Worten und übertragen auf Caravans, Wohnmobile, Werkstatt und Büro.</p>' +
    '<div class="br-raster">' + B.start.mitglieder.map(mitgliedKarte).join("") + "</div>" + hinweis();
}

function seiteMitglied(id) {
  const m = mitglied(id);
  if (!m) return nichtGefunden("mitglieder", "Dieses Beiratsmitglied");
  const mod = m.module.map(modul).filter(Boolean), sit = m.situationen.map(situation).filter(Boolean);
  return '<div class="kopf br-kopf"><div>' + krumen("mitglieder", m.name) +
      '<div class="br-mitglied-titel">' + mono(m.id, true) + "<div><h1>" + esc(m.name) + '</h1><p class="br-lage">' + esc(m.bekannt) + "</p></div></div></div></div>" +
    '<div class="br-zweispaltig"><div class="br-spalte">' +
      '<section class="karte br-block"><span class="br-ueber">Steckbrief</span><p>' + esc(m.steckbrief) + '</p><p class="klein"><b>Im Beirat für:</b> ' + esc(m.fuer) + "</p></section>" +
      '<section class="karte br-block"><h2>Kernideen</h2><p class="klein">In eigenen Worten zusammengefasst.</p><dl class="br-ideen">' + m.kernideen.map((k) => "<dt>" + esc(k.titel) + "</dt><dd>" + esc(k.text) + "</dd>").join("") + "</dl></section>" +
      (m.leitsatz ? '<section class="karte br-block br-leitsatz"><span class="br-ueber">Bekannter Leitsatz – sinngemäß übersetzt</span><blockquote>„' + esc(m.leitsatz) + "“</blockquote></section>" : "") +
    '</div><div class="br-spalte">' +
      '<section class="karte br-block br-muster"><h2>So übertragen wir das auf Muster</h2>' + liste(m.muster, "br-liste br-haken") + "</section>" +
      (mod.length ? '<section class="karte br-block"><h2>Module</h2><ul class="br-links">' + mod.map((x) => '<li><a href="' + link("modul", x.id) + '">' + esc(x.titel) + "</a></li>").join("") + "</ul></section>" : "") +
      (sit.length ? '<section class="karte br-block"><h2>Rat in diesen Situationen</h2><ul class="br-links">' + sit.map((x) => '<li><a href="' + link("situation", x.id) + '">' + esc(x.titel) + "</a></li>").join("") + "</ul></section>" : "") +
    "</div></div>" + hinweis();
}

/* ------------------------------------------------------------ Seite */
function seite(rest) {
  if (B.fehler) {
    return { html: '<div class="br"><div class="laden-fehler"><h1>Beirat &amp; Coaching ließ sich nicht laden</h1><p>' + esc(B.fehler) + '</p><button class="btn btn-primaer" data-br="neu-laden">Nochmal versuchen</button></div></div>' };
  }
  if (!B.start) {
    laden();
    return { html: '<div class="br"><div class="laden" aria-label="Wird geladen"><i class="skelett" style="width:40%"></i><i class="skelett"></i><i class="skelett" style="width:70%"></i></div></div>' };
  }
  const teile = String(rest || "").split("/");
  const [teil, id] = teile;
  if (teil === "suche") {
    const text = teile.slice(1).join("/").slice(0, 200);
    if (text !== B.sucheAusHash) { B.sucheAusHash = text; B.suche = text; suchen(); }
  }
  let html;
  if (teil === "situation") html = seiteSituation(id);
  else if (teil === "modul") html = seiteModul(id);
  else if (teil === "mitglied") html = seiteMitglied(id);
  else if (teil === "themen") html = seiteThemen();
  else if (teil === "mitglieder") html = seiteMitglieder();
  else html = seiteFrag();
  return { html: '<div class="br">' + html + "</div>" };
}

/* ------------------------------------------------------------ Suche */
let suchTimer = 0;
async function suchen() {
  const text = B.suche, nr = ++B.nr;
  if (!text.trim()) { B.treffer = null; ergebnisZeichnen(); return; }
  try {
    const t = await ruf("suche", text);
    if (nr !== B.nr) return;                                   // inzwischen weitergetippt
    B.treffer = { text, situationen: Array.isArray(t.situationen) ? t.situationen : [], module: Array.isArray(t.module) ? t.module : [], mitglieder: Array.isArray(t.mitglieder) ? t.mitglieder : [] };
  } catch (e) {
    if (nr !== B.nr) return;
    B.treffer = { text, situationen: [], module: [], mitglieder: [] };
    if (typeof zeigeMeldung === "function") zeigeMeldung(String(e.message || e), "x", true);
  }
  ergebnisZeichnen();
}
/* Nur die Ergebnisse neu – das Suchfeld behält Fokus und Cursor */
function ergebnisZeichnen() {
  const ziel = document.getElementById("br-ergebnis");
  if (ziel && istMeineSeite() && B.start) ziel.innerHTML = ergebnisHtml();
}

document.addEventListener("input", (ev) => {
  const t = ev.target;
  if (!istMeineSeite() || !t.matches || !t.matches("#inhalt [data-br-suche]")) return;
  B.suche = t.value.slice(0, 200);
  clearTimeout(suchTimer);
  suchTimer = setTimeout(suchen, 180);
  if (!B.suche.trim()) { B.treffer = null; ergebnisZeichnen(); }
});
document.addEventListener("keydown", (ev) => {
  const t = ev.target;
  if (ev.key !== "Enter" || !istMeineSeite() || !t.matches || !t.matches("#inhalt [data-br-suche]")) return;
  ev.preventDefault();
  const erster = B.treffer && B.treffer.text === B.suche && B.treffer.situationen[0];
  if (erster && ID.test(erster.id)) location.hash = link("situation", erster.id);
});
document.addEventListener("click", (ev) => {
  const k = ev.target.closest && ev.target.closest("#inhalt [data-br]");
  if (!k || !istMeineSeite()) return;
  if (k.dataset.br === "thema") { B.thema = k.dataset.wert || ""; neu(); }
  else if (k.dataset.br === "neu-laden") { B.fehler = ""; laden(); neu(); }
});

/* ------------------------------------------------------------ Anmelden bei der Navigation */
window.ODIN_SEITEN = window.ODIN_SEITEN || {};
window.ODIN_SEITEN.beirat = { render: seite, menue: () => "beirat" };
if (istMeineSeite() && typeof window.cockpitZeichne === "function") window.cockpitZeichne();
})();
