/* ODIN · Urlaub
   Anträge stellen, genehmigen, Überschneidungen sehen. Bis zum Stichtag eingegangene Anträge sind gleichrangig
   („fristgerecht“), spätere werden nachrangig in der Reihenfolge des Eingangs behandelt. Die Regeln (Gruppen, in
   denen nur einer gleichzeitig fehlen darf, Sperrzeiten wie die Hausmesse, Betriebsurlaub, Anspruch) pflegen
   die Genehmiger. Daten: tirge_helfer/urlaub_antraege.py, gespeichert im Ordner „Fahrzeuge“ unter _ODIN/Urlaub.
   Seiten: #/urlaub (mein Urlaub), #/urlaub/genehmigen, #/urlaub/kalender, #/urlaub/regeln. */
(() => {
"use strict";

const U = {
  jahr: new Date().getFullYear() + (new Date().getMonth() >= 9 ? 1 : 0),   // ab Oktober wird fürs Folgejahr geplant
  start: null,          // {ich, personen, genehmiger}
  konto: null, meine: null, offen: null, alle: null, kalender: null, regeln: null,
  monat: new Date().getMonth(),
  fehler: "", laedt: false,
};

const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const ic = (n) => '<svg class="ic" aria-hidden="true"><use href="#ci-' + n + '"/></svg>';
const datum = (iso) => { if (!iso) return "–"; const [j, m, t] = String(iso).slice(0, 10).split("-"); return t + "." + m + "." + j; };
const kurz = (iso) => { if (!iso) return ""; const [, m, t] = String(iso).slice(0, 10).split("-"); return t + "." + m + "."; };
const zeit = (iso) => iso ? new Date(iso).toLocaleString("de-DE", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" }) : "";
const tage = (n) => (n === 0.5 ? "½" : String(n).replace(".", ",")) + (n === 1 ? " Tag" : " Tage");
const MONATE = ["Januar", "Februar", "März", "April", "Mai", "Juni", "Juli", "August", "September", "Oktober", "November", "Dezember"];
const meldung = (t, f) => { if (typeof zeigeMeldung === "function") zeigeMeldung(t, f ? "x" : "check", !!f); };

async function ruf(aktion, ...args) {
  if (!window.pywebview || !window.pywebview.api) throw new Error("Programm-Schnittstelle nicht bereit");
  const r = await window.pywebview.api.urlaub_aufruf(aktion, args);
  if (!r || !r.ok) throw new Error((r && r.fehler) || "Unbekannter Fehler");
  return r.daten;
}

const person = (id) => (U.start && U.start.personen.find((p) => p.id === id)) || { id, name: "Unbekannt", kuerzel: "?", farbe: "#8A8586" };
const avatar = (id) => { const p = person(id); return '<span class="pj-avatar" style="--farbe:' + window.odinFarbeOk(p.farbe) + '" title="' + esc(p.name) + '">' + esc(p.kuerzel) + "</span>"; };
const istGenehmiger = () => !!(U.start && U.start.ist_genehmiger);
// Solange niemand Genehmiger ist, darf jeder die Regeln öffnen – wer zuerst speichert, wird Genehmiger
const darfRegeln = () => istGenehmiger() || !!(U.start && U.start.genehmiger_fehlt);

/* ------------------------------------------------------------ Laden */
/* Läuft schon ein Laden, wird danach geladen – nie sofort zurückkehren: sonst zeichnet die Seite sich in einer
   Schleife ohne Pause neu und die Antwort von ODIN kommt nie an. */
let laufend = null;
function laden(was) {
  if (laufend) return laufend.then(() => laden(was));
  laufend = ladenJetzt(was).finally(() => { laufend = null; });
  return laufend;
}

async function ladenJetzt(was) {
  U.laedt = true;
  try {
    if (!U.start || was === "alles") U.start = await ruf("start", U.jahr);
    if (U.start.ich) {
      const aufgaben = [ruf("konto", U.jahr).then((k) => { U.konto = k; }), ruf("antraege", U.jahr, false, U.start.ich).then((a) => { U.meine = a; })];
      if (U.start.ist_genehmiger) aufgaben.push(ruf("antraege", U.jahr, false, null).then((a) => { U.alle = a; }));
      if (was === "kalender" || U.kalender) aufgaben.push(ruf("kalender", U.jahr).then((k) => { U.kalender = k; }));
      if (was === "regeln" && darfRegeln()) aufgaben.push(ruf("regeln").then((r) => { U.regeln = r; }));
      await Promise.all(aufgaben);
    }
    U.fehler = "";
  } catch (e) {
    U.fehler = String(e.message || e);
  } finally {
    U.laedt = false;
  }
  seitenleiste();
}

function seitenleiste() {
  const z = document.getElementById("urlaub-zahl");
  if (!z) return;
  const offen = istGenehmiger() ? (U.alle ? U.alle.filter((a) => a.status === "beantragt").length : (U.start.offen || 0)) : 0;
  z.textContent = offen; z.hidden = !offen;
  z.title = offen ? offen + " Anträge warten auf Entscheidung" : "";
}

const neu = () => { if (typeof window.cockpitZeichne === "function") window.cockpitZeichne(); };
async function nachAenderung(was) { U.kalender = was === "kalender" ? U.kalender : null; await laden(was); neu(); }

/* ------------------------------------------------------------ Bausteine */
function ladeAnzeige() {
  if (U.fehler) return '<div class="pj-leer"><h2>Urlaub gerade nicht erreichbar</h2><p>' + esc(U.fehler) + '</p><button class="btn btn-primaer" data-ul="neu-laden">Nochmal versuchen</button></div>';
  return '<div class="laden"><i class="skelett" style="width:40%"></i><i class="skelett"></i><i class="skelett" style="width:70%"></i></div>';
}

function reiter(aktiv) {
  const r = [["", "Mein Urlaub"], ["kalender", "Kalender"]];
  if (istGenehmiger()) r.splice(1, 0, ["genehmigen", "Genehmigen"]);
  if (darfRegeln()) r.push(["regeln", "Regeln"]);
  const offen = istGenehmiger() && U.alle ? U.alle.filter((a) => a.status === "beantragt").length : 0;
  return '<div class="pj-segment ul-reiter" role="tablist">' + r.map(([k, t]) => '<a role="tab" href="#/urlaub' + (k ? "/" + k : "") + '" aria-selected="' + (k === aktiv) + '">' + t +
    (k === "genehmigen" && offen ? ' <span class="pj-anzahl">' + offen + "</span>" : "") + "</a>").join("") + "</div>";
}

function kopf(aktiv, text) {
  return '<div class="kopf"><div><h1>Urlaub ' + U.jahr + '</h1><p>' + text + '</p></div><div class="kopf-aktionen">' +
    '<button class="btn" data-ul="jahr" data-wert="-1" aria-label="Vorjahr">‹</button><span class="ul-jahr">' + U.jahr + '</span><button class="btn" data-ul="jahr" data-wert="1" aria-label="Folgejahr">›</button></div></div>' +
    reiter(aktiv);
}

const STATUS = { beantragt: ["beantragt", "warn"], genehmigt: ["genehmigt", "gut"], abgelehnt: ["abgelehnt", "krit"], "zurückgezogen": ["zurückgezogen", "leise"] };
const statusChip = (s) => { const [t, k] = STATUS[s] || [s, ""]; return '<span class="pj-chip ' + k + '">' + esc(t) + "</span>"; };
const rangChip = (a) => a.rang === "nachrangig"
  ? '<span class="pj-chip warn" title="Nach dem Stichtag eingegangen – wird nach den fristgerechten Anträgen behandelt">nachrangig</span>'
  : a.rang ? '<span class="pj-chip" title="Bis zum Stichtag eingegangen">fristgerecht</span>' : "";

function konflikteHtml(a) {
  const k = a.konflikte || [];
  if (!k.length) return "";
  return '<ul class="ul-konflikte">' + k.map((x) => "<li>" + ic("schliessen") + "<span>" + esc(x.text) + "</span></li>").join("") + "</ul>";
}

/* ------------------------------------------------------------ Mein Urlaub */
function seiteMein() {
  const k = U.konto || {};
  const kachel = (t, w, f, art) => '<div class="kachel"><div class="titel">' + t + '</div><div class="wert' + (art ? " " + art : "") + '">' + w + '</div><div class="fuss">' + f + "</div></div>";
  const liste = (U.meine || []).slice().sort((a, b) => String(b.von).localeCompare(String(a.von)));
  return kopf("", "Urlaub beantragen und den Stand deiner Anträge sehen.") +
    '<div class="kacheln">' +
      kachel("Anspruch", k.anspruch != null ? tage(k.anspruch + (k.uebertrag || 0)) : "–",
        k.anspruch == null ? "noch nicht hinterlegt" : k.uebertrag ? tage(k.anspruch) + " + " + tage(k.uebertrag) + " aus " + (U.jahr - 1) : "für " + U.jahr) +
      kachel("Genehmigt", tage((k.genommen || 0) + (k.betriebsurlaub || 0)), k.betriebsurlaub ? "davon " + tage(k.betriebsurlaub) + " Betriebsurlaub" : "inkl. Betriebsurlaub") +
      kachel("Beantragt", tage(k.beantragt || 0), "wartet auf Entscheidung", k.beantragt ? "warn" : "") +
      kachel("Rest", k.rest_nach_antraegen != null ? tage(k.rest_nach_antraegen) : "–", k.rest != null ? "nach allen Anträgen · " + tage(k.rest) + " ohne offene" : "nach allen Anträgen",
        k.rest_nach_antraegen != null && k.rest_nach_antraegen < 0 ? "krit" : "gut") +
    "</div>" +
    '<div class="gitter halb">' +
      '<section class="karte"><div class="karte-kopf"><div><h2>Urlaub beantragen</h2><p class="klein">Arbeitstage zählt ODIN selbst – Wochenenden und Feiertage nicht mit.</p></div></div>' +
      '<form class="ul-antrag" data-ul-form="antrag">' +
        '<label class="feld"><span>Von</span><input type="date" name="von" required></label>' +
        '<label class="feld"><span>Bis</span><input type="date" name="bis" required></label>' +
        '<label class="feld"><span>Art</span><select name="art"><option>Urlaub</option><option>Überstundenausgleich</option><option>Sonderurlaub</option></select></label>' +
        '<label class="feld ul-halb"><span>&nbsp;</span><span class="ul-check"><input type="checkbox" name="halber_tag"> halber Tag</span></label>' +
        '<label class="feld ul-breit"><span>Bemerkung (optional)</span><input type="text" name="bemerkung" maxlength="300" placeholder="z. B. Hochzeit, Umzug"></label>' +
        '<div class="ul-breit ul-vorschau" id="ul-vorschau" aria-live="polite"></div>' +
        '<div class="ul-breit ul-knoepfe"><button class="btn btn-primaer" type="submit">Antrag stellen</button></div>' +
      "</form></section>" +
      '<section class="karte"><div class="karte-kopf"><div><h2>Meine Anträge</h2></div></div>' +
      (liste.length ? '<ul class="ul-liste">' + liste.map((a) => '<li class="ul-zeile">' +
        '<div class="ul-zeile-haupt"><b>' + datum(a.von) + (a.bis !== a.von ? " – " + datum(a.bis) : "") + "</b>" +
          '<span class="leise klein">' + esc(a.art || "Urlaub") + " · " + tage(a.arbeitstage || 0) + (a.halber_tag ? " (halber Tag)" : "") + "</span></div>" +
        '<div class="ul-zeile-rechts">' + statusChip(a.status) + rangChip(a.status === "beantragt" ? a : {}) +
          (a.darf_zurueckziehen ? '<button class="mini" data-ul="zurueck" data-id="' + esc(a.id) + '">zurückziehen</button>' : "") + "</div>" +
        (a.entscheidung && a.entscheidung.kommentar ? '<p class="ul-kommentar">' + avatar(a.entscheidung.von) + esc(a.entscheidung.kommentar) + "</p>" : "") +
        (a.status === "beantragt" ? konflikteHtml(a) : "") + "</li>").join("") + "</ul>"
        : '<div class="karte-leer">Noch keine Anträge für ' + U.jahr + ".</div>") +
      "</section></div>";
}

/* ------------------------------------------------------------ Genehmigen */
function seiteGenehmigen() {
  if (!istGenehmiger()) return '<div class="pj-leer"><h2>Nur für Genehmiger</h2><p>Wer Urlaub genehmigen darf, legen die Genehmiger unter „Regeln“ fest.</p></div>';
  const alle = U.alle || [];
  const offen = alle.filter((a) => a.status === "beantragt");
  const rest = alle.filter((a) => a.status !== "beantragt").sort((a, b) => String(b.entscheidung && b.entscheidung.am || "").localeCompare(String(a.entscheidung && a.entscheidung.am || ""))).slice(0, 30);
  const karte = (a) => '<li class="ul-entscheid' + ((a.konflikte || []).length ? " mit-konflikt" : "") + '">' +
    '<div class="ul-entscheid-kopf">' + avatar(a.person) + '<div><b>' + esc(person(a.person).name) + '</b><span class="leise klein">' +
      datum(a.von) + (a.bis !== a.von ? " – " + datum(a.bis) : "") + " · " + tage(a.arbeitstage || 0) + " · " + esc(a.art || "Urlaub") + "</span></div>" +
      '<div class="ul-zeile-rechts">' + rangChip(a) + '<span class="leise klein" title="Eingang">' + esc(zeit(a.eingereicht_am)) + "</span></div></div>" +
    (a.bemerkung ? '<p class="ul-kommentar">„' + esc(a.bemerkung) + "“</p>" : "") +
    konflikteHtml(a) +
    '<form class="ul-entscheid-form" data-ul-form="entscheiden" data-id="' + esc(a.id) + '"><input type="text" name="kommentar" maxlength="300" placeholder="Kommentar (optional, sieht der Antragsteller)">' +
      '<button class="btn" type="submit" name="wahl" value="nein">Ablehnen</button><button class="btn btn-primaer" type="submit" name="wahl" value="ja">Genehmigen</button></form></li>';
  return kopf("genehmigen", "Offene Anträge in der Reihenfolge, in der sie zu behandeln sind: fristgerechte zuerst, dann nachrangige nach Eingang.") +
    (offen.length ? '<ul class="ul-entscheide">' + offen.map(karte).join("") + "</ul>" : '<div class="pj-leer klein"><p>Keine offenen Anträge.</p></div>') +
    (rest.length ? '<section class="karte" style="margin-top:18px"><div class="karte-kopf"><div><h2>Zuletzt entschieden</h2></div></div><ul class="ul-liste">' +
      rest.map((a) => '<li class="ul-zeile"><div class="ul-zeile-haupt">' + avatar(a.person) + "<b>" + esc(person(a.person).name) + '</b><span class="leise klein">' + datum(a.von) + " – " + datum(a.bis) + " · " + tage(a.arbeitstage || 0) + "</span></div>" +
        '<div class="ul-zeile-rechts">' + statusChip(a.status) + "</div></li>").join("") + "</ul></section>" : "");
}

/* ------------------------------------------------------------ Kalender (ein Monat, alle Personen) */
function seiteKalender() {
  const k = U.kalender;
  if (!k) { if (!U.fehler) laden("kalender").then(neu); return kopf("kalender", "") + ladeAnzeige(); }
  const tageListe = (k.tage || []).filter((t) => Number(String(t.datum).slice(5, 7)) === U.monat + 1);
  const personen = (k.personen || []).slice().sort((a, b) => String(a.bereich || "").localeCompare(String(b.bereich || "")) || String(a.name).localeCompare(String(b.name)));
  let bereich = null;
  const zeilen = personen.map((p) => {
    const kopfzeile = p.bereich !== bereich ? (bereich = p.bereich, '<tr class="ul-bereich"><th colspan="' + (tageListe.length + 1) + '">' + esc(p.bereich || "ohne Bereich") + "</th></tr>") : "";
    return kopfzeile + "<tr><th>" + avatar(p.id) + "<span>" + esc(p.name) + "</span></th>" + tageListe.map((t) => {
      const e = (p.tage || {})[t.datum];
      const kl = ["ul-tag", t.wochenende ? "we" : "", t.feiertag ? "ft" : "", t.sperrzeit ? "sp" : "", t.betriebsurlaub ? "bu" : "", e ? "st-" + e.status : ""].filter(Boolean).join(" ");
      const titel = [datum(t.datum), t.feiertag || "", t.sperrzeit ? "Sperrzeit: " + t.sperrzeit : "", t.betriebsurlaub ? "Betriebsurlaub" : "", e ? e.status : ""].filter(Boolean).join(" · ");
      return '<td class="' + kl + '" title="' + esc(titel) + '"></td>';
    }).join("") + "</tr>";
  }).join("");
  const kopfTage = tageListe.map((t) => { const d = new Date(t.datum + "T00:00:00"); return '<th class="' + (t.wochenende ? "we" : "") + (t.feiertag ? " ft" : "") + '" title="' + esc(t.feiertag || "") + '"><span>' + "SMDMDFS"[d.getDay()] + "</span>" + d.getDate() + "</th>"; }).join("");
  return kopf("kalender", "Wer wann fehlt – genehmigt, beantragt, Feiertage und Sperrzeiten auf einen Blick.") +
    '<div class="ul-monate">' + MONATE.map((m, i) => '<button class="' + (i === U.monat ? "aktiv" : "") + '" data-ul="monat" data-wert="' + i + '">' + m.slice(0, 3) + "</button>").join("") + "</div>" +
    '<section class="karte ul-kalender-karte"><div class="ul-kalender-scroll"><table class="ul-kalender"><thead><tr><th></th>' + kopfTage + "</tr></thead><tbody>" +
      (zeilen || '<tr><td class="leise" style="padding:16px">Noch keine Personen – angelegt werden sie unter „Projekte“ (Mitglieder) oder in den Regeln.</td></tr>') + "</tbody></table></div>" +
      '<div class="ul-legende"><span><i class="st-genehmigt"></i>genehmigt</span><span><i class="st-beantragt"></i>beantragt</span><span><i class="ft"></i>Feiertag</span><span><i class="bu"></i>Betriebsurlaub</span><span><i class="sp"></i>Sperrzeit</span><span><i class="we"></i>Wochenende</span></div></section>';
}

/* ------------------------------------------------------------ Regeln (nur Genehmiger) */
function seiteRegeln() {
  if (!darfRegeln()) return kopf("regeln", "") + '<div class="pj-leer"><h2>Nur für Genehmiger</h2></div>';
  const r = U.regeln;
  if (!r) { if (!U.fehler) laden("regeln").then(neu); return kopf("regeln", "") + ladeAnzeige(); }
  const personen = U.start.personen;
  const wahl = (name, gewaehlt) => '<div class="pj-auswahl">' + personen.map((p) => '<label class="pj-person-chip"><input type="checkbox" name="' + name + '" value="' + esc(p.id) + '"' + ((gewaehlt || []).includes(p.id) ? " checked" : "") + ">" + avatar(p.id) + esc(p.name) + "</label>").join("") + "</div>";
  const stichtag = (r.stichtage || {})[String(U.jahr)] || "";
  const standardTag = r.stichtag_standard ? r.stichtag_standard.split("-").reverse().join(".") + "." + (U.jahr - 1) : "";
  const zeitraeume = (liste, art) => (liste || []).map((s, i) => '<div class="ul-zeitraum"><input type="date" name="' + art + '-von" value="' + esc(s.von) + '"><span>bis</span><input type="date" name="' + art + '-bis" value="' + esc(s.bis) + '"><input type="text" name="' + art + '-grund" value="' + esc(s.grund || "") + '" placeholder="Grund"><button type="button" class="mini" data-ul="zeile-weg">entfernen</button></div>').join("");
  const bereichVon = (pid) => ((r.bereiche || {}).personen || {})[pid] || "";
  return kopf("regeln", "Was beim Genehmigen geprüft wird. Änderungen gelten sofort für alle offenen Anträge.") +
    (U.start.genehmiger_fehlt ? '<div class="hinweis"><div><b>Noch niemand ist Genehmiger.</b> Wer die Regeln zuerst speichert, wird Genehmiger – unten lassen sich weitere eintragen.</div></div>' : "") +
    '<div class="ul-vorschlag"><button type="button" class="btn" data-ul="planer">Vorschlag aus dem Excel-Urlaubsplaner</button><span class="klein">Übernimmt Gruppen, Hausmesse-Sperre und Betriebsurlaub ins Formular – gespeichert wird erst mit „Regeln speichern“.</span></div>' +
    (U.vorschlagHinweise ? '<div class="hinweis"><div>' + U.vorschlagHinweise.map(esc).join("<br>") + "</div></div>" : "") +
    '<form class="ul-regeln" data-ul-form="regeln">' +
    '<section class="karte"><div class="karte-kopf"><div><h2>Stichtag ' + U.jahr + '</h2><p class="klein">Bis zu diesem Tag eingegangene Anträge sind gleichrangig; spätere werden danach in der Reihenfolge des Eingangs behandelt.' +
      (standardTag ? " Ohne eigenes Datum gilt der " + esc(standardTag) + "." : "") + "</p></div></div>" +
      '<div class="ul-inhalt"><input type="date" name="stichtag" value="' + esc(stichtag) + '">' +
      '<label class="ul-check"><input type="checkbox" name="resttage"' + (r.resttage_uebertragen !== false ? " checked" : "") + "> Nicht genommene Urlaubstage ins Folgejahr übertragen</label></div></section>" +
    '<section class="karte"><div class="karte-kopf"><div><h2>Gruppen</h2><p class="klein">Aus einer Gruppe darf nur die angegebene Zahl Personen gleichzeitig fehlen.</p></div><button type="button" class="btn" data-ul="gruppe-neu">Gruppe hinzufügen</button></div>' +
      '<div class="ul-inhalt ul-gruppen">' + (r.gruppen || []).map((g, i) => '<div class="ul-gruppe" data-gruppe="' + i + '"><div class="ul-gruppe-kopf"><input type="text" name="gruppe-name" value="' + esc(g.name || "Gruppe " + (i + 1)) + '"><label>höchstens <input type="number" name="gruppe-max" min="1" max="20" value="' + esc(g.max_gleichzeitig || 1) + '"> gleichzeitig</label><button type="button" class="mini" data-ul="gruppe-weg">entfernen</button></div>' + wahl("gruppe-" + i, g.personen) + "</div>").join("") + "</div></section>" +
    '<section class="karte"><div class="karte-kopf"><div><h2>Sperrzeiten</h2><p class="klein">z. B. Hausmesse – in dieser Zeit kein Urlaub.</p></div><button type="button" class="btn" data-ul="zeitraum-neu" data-art="sperre">Sperrzeit hinzufügen</button></div><div class="ul-inhalt" data-liste="sperre">' + zeitraeume(r.sperrzeiten, "sperre") + "</div></section>" +
    '<section class="karte"><div class="karte-kopf"><div><h2>Betriebsurlaub</h2><p class="klein">Gilt für alle und wird vom Anspruch abgezogen.</p></div><button type="button" class="btn" data-ul="zeitraum-neu" data-art="betrieb">Zeitraum hinzufügen</button></div><div class="ul-inhalt" data-liste="betrieb">' + zeitraeume(r.betriebsurlaub, "betrieb") + "</div></section>" +
    '<section class="karte"><div class="karte-kopf"><div><h2>Anspruch und Bereich je Person</h2></div></div><div class="ul-inhalt"><table class="ul-personen"><thead><tr><th>Person</th><th>Bereich</th><th>Urlaubstage ' + U.jahr + "</th></tr></thead><tbody>" +
      personen.map((p) => "<tr><td>" + avatar(p.id) + esc(p.name) + '</td><td><input type="text" name="bereich-' + esc(p.id) + '" value="' + esc(bereichVon(p.id)) + '" placeholder="z. B. Werkstatt" list="ul-bereiche"></td><td><input type="number" step="0.5" min="0" max="60" name="anspruch-' + esc(p.id) + '" value="' + esc(((r.anspruch || {})[p.id] || {})[String(U.jahr)] ?? "") + '"></td></tr>').join("") +
      '</tbody></table><datalist id="ul-bereiche"><option>Werkstatt</option><option>Waschplatz</option><option>Shop</option><option>Verkauf</option><option>Büro</option></datalist></div></section>' +
    '<section class="karte"><div class="karte-kopf"><div><h2>Genehmiger</h2><p class="klein">Diese Personen sehen alle Anträge und entscheiden.</p></div></div><div class="ul-inhalt">' + wahl("genehmiger", r.genehmiger) + "</div></section>" +
    '<div class="ul-knoepfe"><button class="btn btn-primaer" type="submit">Regeln speichern</button></div></form>';
}

function regelnAusFormular(form) {
  const fd = new FormData(form);
  const r = JSON.parse(JSON.stringify(U.regeln || {}));
  r.stichtage = { ...(r.stichtage || {}) };
  if (fd.get("stichtag")) r.stichtage[String(U.jahr)] = fd.get("stichtag"); else delete r.stichtage[String(U.jahr)];
  r.gruppen = [...form.querySelectorAll(".ul-gruppe")].map((g) => ({
    name: g.querySelector('[name="gruppe-name"]').value.trim(),
    max_gleichzeitig: Number(g.querySelector('[name="gruppe-max"]').value) || 1,
    personen: [...g.querySelectorAll('input[type="checkbox"]:checked')].map((x) => x.value),
  }));
  const zeitraeume = (art) => [...form.querySelectorAll('[data-liste="' + art + '"] .ul-zeitraum')].map((z) => ({
    von: z.querySelector('[name="' + art + '-von"]').value, bis: z.querySelector('[name="' + art + '-bis"]').value,
    grund: z.querySelector('[name="' + art + '-grund"]').value.trim(),
  })).filter((x) => x.von && x.bis);
  r.sperrzeiten = zeitraeume("sperre");
  r.betriebsurlaub = zeitraeume("betrieb");
  r.bereiche = { personen: {}, max_abwesend: ((U.regeln || {}).bereiche || {}).max_abwesend || {} };
  r.anspruch = { ...(r.anspruch || {}) };
  for (const p of U.start.personen) {
    const b = (fd.get("bereich-" + p.id) || "").trim();
    if (b) r.bereiche.personen[p.id] = b;
    const a = fd.get("anspruch-" + p.id);
    r.anspruch[p.id] = { ...(r.anspruch[p.id] || {}) };
    if (a !== null && a !== "") r.anspruch[p.id][String(U.jahr)] = Number(a); else delete r.anspruch[p.id][String(U.jahr)];
  }
  r.genehmiger = fd.getAll("genehmiger");
  r.resttage_uebertragen = !!fd.get("resttage");
  return r;
}

/* ------------------------------------------------------------ Seite */
function werBistDu() {
  const personen = U.start.personen || [];
  return '<div class="kopf"><div><h1>Urlaub</h1><p>Erst einmal: Wer arbeitet an diesem Rechner? (gilt auch für „Projekte“)</p></div></div>' +
    '<section class="karte pj-ich"><div class="pj-ich-inhalt">' +
    (personen.length ? '<div class="pj-ich-liste">' + personen.map((p) =>
      '<button class="pj-ich-person" data-ul="ich" data-id="' + esc(p.id) + '">' + avatar(p.id) + "<span>" + esc(p.name) + "</span></button>").join("") + "</div>" : "") +
    '<form class="pj-zeile-form" data-ul-form="person"><input type="text" name="name" placeholder="' + (personen.length ? "Oder neu: Vor- und Nachname" : "Vor- und Nachname") +
      '" autocomplete="off" required minlength="2" maxlength="60"><button class="btn btn-primaer" type="submit">' + (personen.length ? "Anlegen" : "Los geht’s") + "</button></form>" +
    '<p class="klein">Nach der Auswahl fragt ODIN im Tresor nach deiner PIN (beim ersten Mal legst du sie fest) – mit Microsoft angemeldet (<a href="#/konto">Konto &amp; Anmeldung</a>) geht es ohne.</p></div></section>';
}

async function ichSetzen(id) {
  await window.odinAnmelden(id);                       // Tresor: Person + PIN, erst dann gilt sie
  zuruecksetzen();
  window.dispatchEvent(new Event("odin-ich-urlaub"));
  await laden("alles");
  neu();
}

function zuruecksetzen() { U.start = U.konto = U.meine = U.alle = U.kalender = U.regeln = null; U.fehler = ""; }

function seite(rest) {
  if (!U.start) { if (!U.fehler) laden("alles").then(neu); return { html: ladeAnzeige() }; }
  if (U.fehler) return { html: ladeAnzeige() };
  if (!U.start.ich) return { html: werBistDu() };
  if (!U.meine) { if (!U.fehler) laden().then(neu); return { html: ladeAnzeige() }; }
  const html = rest === "genehmigen" ? seiteGenehmigen() : rest === "kalender" ? seiteKalender() : rest === "regeln" ? seiteRegeln() : seiteMein();
  return { html };
}

document.addEventListener("click", async (ev) => {
  const k = ev.target.closest("#inhalt [data-ul]");
  if (!k) return;
  const art = k.dataset.ul;
  if (art === "neu-laden") { U.start = null; U.fehler = ""; neu(); }
  if (art === "ich") { try { await ichSetzen(k.dataset.id); } catch (e) { meldung(String(e.message || e), true); } }
  if (art === "jahr") { U.jahr += Number(k.dataset.wert); U.konto = U.meine = U.alle = U.kalender = null; await laden(); neu(); }
  if (art === "monat") { U.monat = Number(k.dataset.wert); neu(); }
  if (art === "zurueck") {
    if (!confirm("Antrag zurückziehen?")) return;
    try { await ruf("antrag_zurueckziehen", k.dataset.id); meldung("Antrag zurückgezogen."); } catch (e) { meldung(String(e.message || e), true); }
    await nachAenderung();
  }
  if (art === "gruppe-neu") { U.regeln = regelnAusFormular(k.closest("form")); U.regeln.gruppen.push({ name: "Gruppe " + (U.regeln.gruppen.length + 1), max_gleichzeitig: 1, personen: [] }); neu(); }
  if (art === "gruppe-weg") { const f = k.closest("form"); k.closest(".ul-gruppe").remove(); U.regeln = regelnAusFormular(f); neu(); }
  if (art === "zeitraum-neu") {
    const f = k.closest("form"); U.regeln = regelnAusFormular(f);
    (k.dataset.art === "sperre" ? (U.regeln.sperrzeiten = U.regeln.sperrzeiten || []) : (U.regeln.betriebsurlaub = U.regeln.betriebsurlaub || [])).push({ von: "", bis: "", grund: "" });
    neu();
  }
  if (art === "zeile-weg") k.closest(".ul-zeitraum").remove();
  if (art === "planer") {
    k.disabled = true;
    try {
      const v = await ruf("planer_vorschlag");
      const f = document.querySelector('#inhalt [data-ul-form="regeln"]');
      U.regeln = regelnAusFormular(f);
      if ((v.gruppen || []).length) U.regeln.gruppen = v.gruppen.map((g, i) => ({ name: g.name || "Gruppe " + (i + 1), max_gleichzeitig: g.max_gleichzeitig || 1, personen: g.personen || [] }));
      if ((v.sperrzeiten || []).length) U.regeln.sperrzeiten = v.sperrzeiten;
      if ((v.betriebsurlaub || []).length) U.regeln.betriebsurlaub = v.betriebsurlaub;
      const unklar = (v.gruppen || []).flatMap((g) => g.unklar || []);
      U.vorschlagHinweise = ["Vorschlag aus dem Urlaubsplaner übernommen – bitte prüfen und speichern."]
        .concat(unklar.length ? ["Nicht eindeutig zugeordnet (bitte von Hand ankreuzen): " + unklar.join(", ")] : [])
        .concat((v.hinweise || []).slice(0, 4));
      neu();
    } catch (e) { meldung(String(e.message || e), true); k.disabled = false; }
  }
});

document.addEventListener("submit", async (ev) => {
  const f = ev.target.closest("#inhalt [data-ul-form]");
  if (!f) return;
  ev.preventDefault();
  const art = f.dataset.ulForm;
  const knopf = ev.submitter;
  if (knopf) knopf.disabled = true;
  try {
    if (art === "person") {
      const r = await window.pywebview.api.projekte_aufruf("person_anlegen", [{ name: new FormData(f).get("name") }]);
      if (!r || !r.ok) throw new Error((r && r.fehler) || "Anlegen hat nicht geklappt.");
      await ichSetzen(r.daten.id);
      meldung("Hallo " + r.daten.name.split(" ")[0] + "!");
    }
    if (art === "antrag") {
      const fd = new FormData(f);
      const r = await ruf("antrag_stellen", { von: fd.get("von"), bis: fd.get("bis"), art: fd.get("art"), halber_tag: !!fd.get("halber_tag"), bemerkung: fd.get("bemerkung") });
      const k = (r && r.konflikte) || [];
      meldung(k.length ? "Antrag gestellt – Achtung: " + k[0].text : "Antrag gestellt.", false);
      f.reset();
      await nachAenderung();
    }
    if (art === "entscheiden") {
      const ja = ev.submitter && ev.submitter.value === "ja";
      await ruf("entscheiden", f.dataset.id, ja, new FormData(f).get("kommentar") || "");
      meldung(ja ? "Genehmigt." : "Abgelehnt.");
      await nachAenderung();
    }
    if (art === "regeln") {
      U.regeln = await ruf("regeln_speichern", regelnAusFormular(f));
      meldung("Regeln gespeichert.");
      await laden("alles"); neu();
    }
  } catch (e) {
    meldung(String(e.message || e), true);
  } finally {
    if (knopf) knopf.disabled = false;
  }
});

// Beim Ausfüllen: Arbeitstage und Konflikte schon vor dem Absenden zeigen (nichts wird gespeichert)
let vorschauTimer;
document.addEventListener("change", (ev) => {
  const f = ev.target.closest('#inhalt [data-ul-form="antrag"]');
  if (!f) return;
  clearTimeout(vorschauTimer);
  vorschauTimer = setTimeout(async () => {
    const fd = new FormData(f), box = document.getElementById("ul-vorschau");
    if (!box || !fd.get("von")) return;
    try {
      const a = await ruf("antrag_pruefen", { von: fd.get("von"), bis: fd.get("bis") || fd.get("von"), art: fd.get("art"), halber_tag: !!fd.get("halber_tag") });
      box.innerHTML = '<div class="ul-vorschau-text"><b>' + String(a.arbeitstage || 0).replace(".", ",") + "</b> Arbeitstage" + (a.rang ? " · " + rangChip(a) : "") +
        ((a.konflikte || []).length ? "" : ' · <span class="gut-text">keine Konflikte</span>') + "</div>" + konflikteHtml(a);
    } catch (e) { box.innerHTML = '<div class="quelle-fehler">' + esc(e.message || e) + "</div>"; }
  }, 200);
});

// „ich“ wurde unter „Projekte“ gewählt: alles neu laden, sonst bliebe hier der alte Stand stehen
addEventListener("odin-ich", () => { zuruecksetzen(); laden("alles").then(() => { if ((location.hash || "").startsWith("#/urlaub")) neu(); }); });
// Beim Betreten der Urlaubsseite frisch laden (Anträge anderer Rechner, neue Regeln)
let zuletztGeladen = 0;
addEventListener("hashchange", (ev) => {
  const rein = (location.hash || "").startsWith("#/urlaub") && !String(ev.oldURL || "").includes("#/urlaub");
  if (!rein || Date.now() - zuletztGeladen < 3000) return;
  zuletztGeladen = Date.now();
  U.kalender = null;
  laden("alles").then(() => { if ((location.hash || "").startsWith("#/urlaub")) neu(); });
});

window.ODIN_SEITEN = window.ODIN_SEITEN || {};
window.ODIN_SEITEN.urlaub = { render: seite, menue: () => "urlaub" };
// Wurde die Seite gezeichnet, bevor dieser Bereich angemeldet war (direkter Aufruf), jetzt richtig zeichnen
if ((location.hash || "").startsWith("#/urlaub") && typeof window.cockpitZeichne === "function") window.cockpitZeichne();
const anfangen = () => laden("alles");
if (window.pywebview && window.pywebview.api) anfangen(); else addEventListener("pywebviewready", anfangen, { once: true });
})();
