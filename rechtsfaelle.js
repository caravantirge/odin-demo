/* ODIN · Führung: Rechtsfälle
   Je Fall eine Akte mit allem an einem Ort: Chronologie (Mails, Briefe, Telefonate …), Dokumente mit SHA-256, Fristen,
   Belegmatrix, „Was jetzt zu tun ist“, Entwürfe und ein Dossier für die Weiterarbeit in Claude (muster-recht-einstieg).
   Daten: tirge_helfer/rechtsfaelle.py (Ablage je Fall als Ordner mit akte.json und Dokumente/). Seiten: #/rechtsfaelle
   und #/rechtsfall/<Aktenzeichen>[/<Reiter>] – eingehängt über window.ODIN_SEITEN (cockpit.js). */
(() => {
"use strict";

const R = {
  start: null,              // {ich, personen, faelle, falltypen, rollen, phasen, frist_arten, …, ablage}
  akten: new Map(),         // Aktenzeichen -> Ansicht
  fehler: "",
  filter: "offen", typ: "", bald: false, suche: "",
  chronoArt: "", chronoNeueste: true, chronoNeu: false, ereignisBearbeiten: null,
  dokArt: "",
  entwurf: new Map(),       // Aktenzeichen -> gewählte Entwurfs-ID
  entwuerfe: new Map(),     // "AZ|ID" -> gefüllter Entwurf
  dossier: new Map(),       // Aktenzeichen -> {text, dateiname, gekuerzt}
  dossierOpt: { kuerzen: true, mailtexte: true },
  vorschau: new Map(),      // Dokument-ID -> data:-Adresse oder null
  rechner: new Map(),       // Aktenzeichen -> Ergebnis der Rechenhilfe
  vorlage: new Map(),       // Aktenzeichen -> Vorbelegung für das Frist-Formular
  belegNeu: false,
};

const SEITEN = ["rechtsfaelle", "rechtsfall"];
const REITER = [["ueberblick", "Überblick"], ["chronologie", "Chronologie"], ["dokumente", "Dokumente"],
  ["belege", "Belegmatrix"], ["entwuerfe", "Entwürfe"], ["dossier", "Dossier"]];
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const ic = (n) => '<svg class="ic" aria-hidden="true"><use href="#' + (n.startsWith("i-") ? n : "ci-" + n) + '"/></svg>';
const zwei = (n) => String(n).padStart(2, "0");
const isoLokal = (d) => d.getFullYear() + "-" + zwei(d.getMonth() + 1) + "-" + zwei(d.getDate());
const heute = () => (R.start && R.start.heute) || isoLokal(new Date());
const datum = (iso) => { if (!iso) return ""; const [j, m, t] = String(iso).slice(0, 10).split("-"); return t + "." + m + "." + j; };
const kurz = (iso) => { if (!iso) return ""; const [j, m, t] = String(iso).slice(0, 10).split("-"); return t + "." + m + "." + (j === heute().slice(0, 4) ? "" : j.slice(2)); };
const monat = (iso) => new Date(String(iso).slice(0, 10) + "T12:00:00").toLocaleDateString("de-DE", { month: "long", year: "numeric" });
const euro = (n, nachkomma = true) => n == null ? "" : new Intl.NumberFormat("de-DE", { minimumFractionDigits: nachkomma ? 2 : 0, maximumFractionDigits: nachkomma ? 2 : 0 }).format(n) + " €";
const meldung = (text, fehler) => { if (typeof zeigeMeldung === "function") zeigeMeldung(text, fehler ? "x" : "check", !!fehler); };
const teileAusHash = () => (location.hash || "").slice(2).split("/").map((t) => { try { return decodeURIComponent(t); } catch (e) { return ""; } });
const aktuelleSeite = () => teileAusHash()[0];
const istMeineSeite = () => SEITEN.includes(aktuelleSeite());
const azAusHash = () => (aktuelleSeite() === "rechtsfall" ? teileAusHash()[1] || "" : "");
const reiterAusHash = () => { const r = teileAusHash()[2] || "ueberblick"; return REITER.some(([k]) => k === r) ? r : "ueberblick"; };
const link = (az, reiter) => "#/rechtsfall/" + encodeURIComponent(az) + (reiter && reiter !== "ueberblick" ? "/" + reiter : "");

/* ------------------------------------------------------------ Schnittstelle
   Ändernde Aufrufe laufen nacheinander (pywebview ruft parallel in eigenen Threads auf). */
const LESEN = new Set(["start", "liste", "akte", "entwurf", "dossier", "zaehler", "agenda", "vorschau", "frist_rechnen"]);
let kette = Promise.resolve();
function aufruf(bereich, aktion, args) {
  const los = async () => {
    if (!window.pywebview || !window.pywebview.api) throw new Error("Programm-Schnittstelle nicht bereit");
    const r = await window.pywebview.api[bereich](aktion, args);
    if (!r || !r.ok) throw new Error((r && r.fehler) || "Unbekannter Fehler");
    // „ok“, aber ohne Inhalt: als Fehler behandeln – sonst lädt die Seite beim Neuzeichnen endlos nach
    if ((r.daten === null || r.daten === undefined) && /^(start|liste|akte|zaehler)$/.test(aktion)) throw new Error("Keine Daten erhalten – bitte nochmal versuchen.");
    return r.daten;
  };
  if (LESEN.has(aktion)) return los();
  const weiter = kette.then(los, los);
  kette = weiter.catch(() => null);
  return weiter;
}
const ruf = (aktion, ...args) => aufruf("rechtsfaelle_aufruf", aktion, args);
const rufP = (aktion, ...args) => aufruf("projekte_aufruf", aktion, args);

/* ------------------------------------------------------------ Laden */
let startLaeuft = null;
function ladeStart() {
  if (startLaeuft) return startLaeuft;
  startLaeuft = ruf("start")
    .then((s) => { R.start = s; R.fehler = ""; })
    .catch((e) => { R.fehler = String(e.message || e); })
    .finally(() => { startLaeuft = null; });
  return startLaeuft;
}
const laufend = new Map();
function einmal(schluessel, holen) {
  if (laufend.has(schluessel)) return laufend.get(schluessel);
  const p = holen().finally(() => laufend.delete(schluessel));
  laufend.set(schluessel, p);
  return p;
}
const ladeAkte = (az) => einmal("a:" + az, () => ruf("akte", az)
  .then((a) => { R.akten.set(az, a); })
  .catch((e) => { R.akten.set(az, { fehler: String(e.message || e) }); }));
function nachLaden(versprechen) { versprechen.then(() => { if (istMeineSeite()) neuZeichnen(); }); }

/* Zähler in der Seitenleiste: Fristen in den nächsten 7 Tagen oder überfällig */
let zaehlerTimer = 0;
async function zaehlerLaden() {
  const z = document.getElementById("rechtsfaelle-zahl");
  if (!z) return;
  try {
    const d = await ruf("zaehler");
    z.textContent = d.bald || ""; z.hidden = !d.bald;
    z.title = d.bald ? d.bald + (d.bald === 1 ? " Frist" : " Fristen") + " in den nächsten 7 Tagen" + (d.ueberfaellig ? ", davon " + d.ueberfaellig + " überfällig" : "") : "";
  } catch (e) { z.hidden = true; }
  if (typeof window.cockpitLeisteEinpassen === "function") window.cockpitLeisteEinpassen();
}
const zaehlerBald = () => { clearTimeout(zaehlerTimer); zaehlerTimer = setTimeout(zaehlerLaden, 300); };

/* Neu zeichnen: Scrollstand, Fokus und noch nicht gespeicherte Eingaben bleiben erhalten */
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
    if (f) { f.focus({ preventScroll: true }); try { if (marke) f.setSelectionRange(marke[0], marke[1]); } catch (e) { /* Datumsfelder */ } }
  }
}

/* Änderung an einer Akte: Antwort übernehmen, Zähler und „Heute & Woche“ auffrischen, neu zeichnen */
const geaendert = () => { zaehlerBald(); window.dispatchEvent(new Event("odin-rechtsfaelle-geaendert")); };
async function aendern(aktion, args, vorher) {
  try {
    const a = await ruf(aktion, ...args);
    if (a && a.aktenzeichen && a.fristen) {
      R.akten.set(a.aktenzeichen, a);
      R.dossier.delete(a.aktenzeichen);
      for (const k of [...R.entwuerfe.keys()]) if (k.startsWith(a.aktenzeichen + "|")) R.entwuerfe.delete(k);
    }
    if (vorher) vorher(a);
    if (R.start) R.start = { ...R.start, faelle: null };
    geaendert();
    neuZeichnen();
    return a || true;
  } catch (e) {
    meldung(String(e.message || e), true);
    return null;
  }
}

/* ------------------------------------------------------------ Personen */
const person = (id) => (R.start && R.start.personen.find((p) => p.id === id)) || { id, name: "Unbekannt", kuerzel: "?", farbe: "#8A8586" };
const avatar = (id) => { const p = person(id); return '<span class="pj-avatar" style="--farbe:' + window.odinFarbeOk(p.farbe) + '" title="' + esc(p.name) + '">' + esc(p.kuerzel) + "</span>"; };
const avatare = (ids, max = 4) => '<span class="pj-avatare">' + ids.slice(0, max).map(avatar).join("") +
  (ids.length > max ? '<span class="pj-avatar mehr">+' + (ids.length - max) + "</span>" : "") + "</span>";

/* ------------------------------------------------------------ Bausteine */
function ladeAnzeige(titel) {
  if (R.fehler) return '<div class="pj-leer"><h2>' + esc(titel) + ' gerade nicht erreichbar</h2><p>' + esc(R.fehler) + '</p><button class="btn btn-primaer" data-rf="neu-laden">Nochmal versuchen</button></div>';
  return '<div class="laden" aria-label="Wird geladen"><i class="skelett" style="width:40%"></i><i class="skelett"></i><i class="skelett" style="width:70%"></i></div>';
}

function werBistDu(titel) {
  const personen = R.start.personen || [];
  return '<div class="kopf"><div><h1>' + esc(titel) + '</h1><p>Erst einmal: Wer arbeitet an diesem Rechner? (gilt auch für Projekte, Besprechungen und Urlaub)</p></div></div>' +
    '<section class="karte pj-ich"><div class="pj-ich-inhalt">' +
    (personen.length ? '<div class="pj-ich-liste">' + personen.map((p) => '<button class="pj-ich-person" data-rf="ich" data-id="' + esc(p.id) + '">' + avatar(p.id) + "<span>" + esc(p.name) + "</span></button>").join("") + "</div>" : "") +
    '<form class="pj-zeile-form" data-rf-form="person"><input type="text" name="name" placeholder="' + (personen.length ? "Oder neu: Vor- und Nachname" : "Vor- und Nachname") +
    '" autocomplete="off" required minlength="2" maxlength="60"><button class="btn btn-primaer" type="submit">' + (personen.length ? "Anlegen" : "Los geht’s") + "</button></form>" +
    '<p class="klein">Nach der Auswahl fragt ODIN im Tresor nach deiner PIN (beim ersten Mal legst du sie fest) – mit Microsoft angemeldet (<a href="#/konto">Konto &amp; Anmeldung</a>) geht es ohne.</p></div></section>';
}

function vorab(titel) {
  if (R.fehler) return ladeAnzeige(titel);
  if (!R.start) { nachLaden(ladeStart()); return ladeAnzeige(titel); }
  if (!R.start.ich) return werBistDu(titel);
  return "";
}

const typPille = (id, name) => '<span class="pille rf-typ typ-' + esc(id) + '">' + esc(name) + "</span>";
const rollenChip = (rolle, name) => '<span class="pj-chip rf-rolle ' + esc(rolle) + '">' + esc(name) + "</span>";
const quelle = (q) => q ? '<span class="rf-quelle" title="Quelle: ' + esc(q) + '">' + ic("info") + esc(q) + "</span>" : "";
function fristChip(f, mitTitel) {
  if (!f) return '<span class="pj-chip leise">keine Frist</span>';
  const t = f.tage;
  const wann = f.erledigt ? "erledigt" : t == null ? datum(f.datum) : t < 0 ? "seit " + kurz(f.datum) : t === 0 ? "heute" : t === 1 ? "morgen" : t <= 7 ? "in " + t + " Tagen" : datum(f.datum);
  return '<span class="pj-chip rf-frist-chip ' + esc(f.zustand) + '" title="' + esc((f.titel || "") + " · " + datum(f.datum) + " · " + (f.art_name || "")) + '">' +
    ic("fristen") + esc(wann) + (mitTitel ? " · " + esc(f.titel) : "") + "</span>";
}
const recht = (text) => '<p class="rf-recht">' + ic("info") + "<span>" + esc(text || (R.start && R.start.hinweis_recht) || "") + "</span></p>";

function ablageHinweis() {
  const a = R.start.ablage || {};
  if (a.fehler) return '<div class="hinweis rf-ablage krit">' + ic("i-warn") + '<div class="rf-ablage-text"><b>Ablage nicht erreichbar.</b><span>' + esc(a.fehler) + '</span><span><button class="mini" data-rf="ablage">Ablageort ändern</button></span></div></div>';
  return '<div class="hinweis rf-ablage' + (a.eigener ? "" : " warn") + '">' + ic("schloss") + '<div class="rf-ablage-text">' +
    "<span><b>Rechtsfälle enthalten personenbezogene Daten.</b> Sie gehören nicht in die Wissensdatenbank musterOS, auf die alle Agents zugreifen. Eine Akte sehen in ODIN nur Beteiligte.</span>" +
    "<span>Ablage: <code class=\"rf-pfad\">" + esc(a.ordner || "") + "</code>" +
    (a.eigener ? " (eigener Ordner)" : a.lokal ? " – nur auf diesem Rechner" : " – im gemeinsamen Ordner „Fahrzeuge“: wer ihn öffnen kann, kann die Akten lesen. Besser ein eigener Ordner mit beschränktem Zugriff.") +
    ' <button class="mini" data-rf="ablage">Ablageort</button></span></div></div>';
}

/* ------------------------------------------------------------ Seite: Liste */
function seiteListe() {
  const v = vorab("Rechtsfälle");
  if (v) return { html: v };
  if (!R.start.faelle) { nachLaden(ladeStart()); return { html: ladeAnzeige("Rechtsfälle") }; }
  const alle = R.start.faelle;
  const offen = alle.filter((f) => !f.erledigt);
  const s = R.suche.trim().toLowerCase();
  const liste = alle.filter((f) => (R.filter === "alle" || (R.filter === "offen") !== f.erledigt) && (!R.typ || f.falltyp === R.typ) &&
    (!R.bald || f.fristen_bald > 0) &&
    (!s || [f.aktenzeichen, f.titel, f.gegenseite, f.fahrzeug, f.kunde, f.falltyp_name].join(" ").toLowerCase().includes(s)));
  const bald = offen.reduce((n, f) => n + (f.fristen_bald || 0), 0);
  const summe = offen.reduce((n, f) => n + (f.streitwert || 0), 0);
  const typen = R.start.falltypen.filter((t) => alle.some((f) => f.falltyp === t.id));
  const zeile = (f) => {
    const phasen = R.start.phasen.map((p) => p.id);
    const stelle = phasen.indexOf(f.phase);
    return '<li><a class="rf-zeile' + (f.erledigt ? " erledigt" : "") + '" href="' + link(f.aktenzeichen) + '">' +
      '<span class="rf-az">' + esc(f.aktenzeichen) + "</span>" +
      '<span class="rf-zeile-haupt"><span class="rf-zeile-titel">' + esc(f.titel) + "</span>" +
        '<span class="rf-zeile-meta">' + typPille(f.falltyp, f.falltyp_name) + rollenChip(f.rolle, f.rolle_name) +
        (f.gegenseite ? "<span>" + esc(f.gegenseite) + "</span>" : "") + (f.fahrzeug ? '<span class="leise">' + esc(f.fahrzeug) + "</span>" : "") + "</span></span>" +
      '<span class="rf-zeile-rechts">' + (f.erledigt ? '<span class="pj-chip leise">erledigt</span>' : fristChip(f.naechste_frist)) +
        '<span class="rf-mini-phasen" title="Phase: ' + esc(f.phase_name) + '" aria-label="Phase: ' + esc(f.phase_name) + '">' + phasen.map((p, i) => '<i class="' + (i < stelle ? "an" : i === stelle ? "jetzt" : "") + '"></i>').join("") + "</span>" +
        '<span class="rf-betrag">' + esc(f.streitwert != null ? euro(f.streitwert, false) : "") + "</span>" + avatare(f.bearbeiter, 3) + "</span></a></li>";
  };
  const html = ablageHinweis() +
    '<div class="kopf"><div><h1>Rechtsfälle</h1><p>Je Fall alles an einem Ort: Mails, Dateien, Fotos, Verträge, Protokolle und Rechnungen – dazu Fristen, Belege, der nächste Schritt und Entwürfe.</p></div>' +
    '<div class="kopf-aktionen"><button class="btn" data-rf="ordner">' + ic("i-folder") + 'Ordner</button><button class="btn btn-primaer" data-rf="neu">' + ic("plus") + "Neuer Fall</button></div></div>" +
    '<div class="kacheln rf-kacheln">' +
      '<div class="kachel"><div class="titel">Offene Fälle</div><div class="wert">' + offen.length + '</div><div class="fuss">' + (alle.length - offen.length) + " erledigt</div></div>" +
      '<div class="kachel"><div class="titel">Fristen ≤ 7 Tage</div><div class="wert' + (bald ? " krit" : "") + '">' + bald + '</div><div class="fuss">' + (bald ? "inklusive überfälliger" : "nichts drängt") + "</div></div>" +
      '<div class="kachel"><div class="titel">Streitwert gesamt</div><div class="wert">' + esc(euro(summe, false)) + '</div><div class="fuss">in offenen Fällen</div></div></div>' +
    '<div class="rf-werkzeuge"><div class="filter" role="group" aria-label="Stand">' + [["offen", "Offen", offen.length], ["erledigt", "Erledigt", alle.length - offen.length], ["alle", "Alle", alle.length]].map(([k, t, n]) =>
        '<button class="' + (R.filter === k ? "aktiv" : "") + '" data-rf="filter" data-wert="' + k + '" aria-pressed="' + (R.filter === k) + '">' + t + ' <span class="rf-zahl">' + n + "</span></button>").join("") + "</div>" +
      '<select data-rf-auswahl="typ" aria-label="Falltyp"><option value="">Alle Falltypen</option>' + typen.map((t) => '<option value="' + esc(t.id) + '"' + (R.typ === t.id ? " selected" : "") + ">" + esc(t.kurz) + "</option>").join("") + "</select>" +
      '<label class="rf-schalter"><input type="checkbox" data-rf-auswahl="bald"' + (R.bald ? " checked" : "") + "> Fristen bald</label>" +
      '<label class="pj-suche"><svg class="ic" aria-hidden="true"><use href="#i-search"/></svg><input type="search" placeholder="Aktenzeichen, Titel, Gegenseite" value="' + esc(R.suche) + '" data-rf-suche="1" data-fokus="suche"></label></div>' +
    (liste.length ? '<section class="karte rf-liste"><ul>' + liste.map(zeile).join("") + "</ul></section>"
      : alle.length ? '<div class="pj-leer klein"><p>Kein Fall passt zum Filter.</p></div>'
      : '<div class="pj-leer"><h2>Noch keine Rechtsfälle</h2><p>Eine Reklamation, ein Anwaltsschreiben, eine offene Rechnung oder eine Abmahnung: als Fall anlegen, Mails und Dateien hineinziehen, Fristen eintragen. ODIN sagt, was als Nächstes zu tun ist, und bereitet alles für den Anwalt oder für Claude auf.</p>' +
        '<button class="btn btn-primaer" data-rf="neu">' + ic("plus") + "Ersten Fall anlegen</button></div>") +
    recht();
  return { html };
}

/* ------------------------------------------------------------ Seite: eine Akte */
function phasenLeiste(a) {
  const phasen = R.start.phasen;
  const stelle = phasen.findIndex((p) => p.id === a.phase);
  return '<ol class="rf-phasen" aria-label="Phase des Falls">' + phasen.map((p, i) => {
    const klasse = i < stelle ? "vorbei" : i === stelle ? "jetzt" : "";
    return '<li class="rf-phase ' + klasse + '"><button type="button" data-rf="phase" data-wert="' + esc(p.id) + '"' + (i === stelle ? ' aria-current="step"' : "") +
      ' title="' + esc(p.name) + (i === stelle ? " (aktuell)" : " – Phase setzen") + '"><span class="rf-punkt">' + (i < stelle ? ic("haken") : i + 1) + '</span><span class="rf-phase-name">' + esc(p.name.split(" / ")[0]) + "</span></button></li>";
  }).join("") + "</ol>";
}

function naechsterSchritt(a, kompakt) {
  const n = a.naechster_schritt;
  const wichtig = a.hinweise.filter((h) => h.ton === "krit").concat(a.hinweise.filter((h) => h.ton === "warn"));
  if (kompakt) {
    const krit = wichtig.filter((h) => h.ton === "krit").length;
    return '<section class="karte rf-jetzt kompakt" aria-label="Was jetzt zu tun ist"><span class="rf-jetzt-kopf">' + ic("aufgaben") + "Als Nächstes</span>" +
      '<span class="rf-jetzt-text" title="' + esc(n ? n.text + " · Quelle: " + n.quelle : "") + '">' + esc(n ? n.text : "Alle Schritte der Checkliste sind erledigt.") + "</span>" +
      (wichtig.length ? '<a class="pj-chip ' + (krit ? "krit" : "warn") + '" href="' + link(a.aktenzeichen) + '">' + wichtig.length + (wichtig.length === 1 ? " Hinweis" : " Hinweise") + "</a>" : "") +
      (n ? '<button class="btn" data-rf="schritt" data-id="' + esc(n.id) + '" data-wert="true">' + ic("haken") + "Erledigt</button>" : "") + "</section>";
  }
  return '<section class="karte rf-jetzt" aria-label="Was jetzt zu tun ist"><div>' +
    '<div class="rf-jetzt-kopf">' + ic("aufgaben") + "Was jetzt zu tun ist" + (n && n.andere_phase ? ' <span class="pj-chip">nächste Phase: ' + esc(n.phase_name) + "</span>" : "") + "</div>" +
    (n ? '<p class="rf-jetzt-text">' + esc(n.text) + '</p><div class="rf-jetzt-fuss">' + quelle(n.quelle) +
        (n.offen_in_phase > 1 ? "<span>noch " + (n.offen_in_phase - 1) + " weitere in „" + esc(n.phase_name) + "“</span>" : "") + "</div>"
      : '<p class="rf-jetzt-text">Alle Schritte der Checkliste sind erledigt.</p>') + "</div>" +
    '<div class="rf-jetzt-knoepfe">' + (n ? '<button class="btn" data-rf="schritt" data-id="' + esc(n.id) + '" data-wert="true">' + ic("haken") + "Erledigt</button>" : "") +
      '<button class="btn" data-rf="zu-schritten">Alle Schritte</button></div>' +
    (wichtig.length ? '<ul class="rf-hinweise">' + wichtig.slice(0, 3).map(hinweisZeile).join("") + "</ul>" : "") + "</section>";
}
const hinweisZeile = (h) => '<li class="rf-hinweis ' + esc(h.ton) + '"><span class="rf-hinweis-text">' + esc(h.text) + "</span>" + quelle(h.quelle) + "</li>";

function seiteAkte(rest) {
  const v = vorab("Rechtsfall");
  if (v) return { html: v };
  const az = String(rest || "").split("/")[0];
  const a = R.akten.get(az);
  if (!a) { nachLaden(ladeAkte(az)); return { html: ladeAnzeige("Rechtsfall") }; }
  if (a.fehler) return { html: '<div class="pj-leer"><h2>Akte nicht verfügbar</h2><p>' + esc(a.fehler) + '</p><a class="btn" href="#/rechtsfaelle">Zu allen Rechtsfällen</a></div>' };
  const reiter = reiterAusHash();
  const z = a.zahlen;
  const anzahl = { chronologie: z.ereignisse, dokumente: z.dokumente, belege: z.luecken || z.belege };
  const reiterHtml = '<nav class="rf-reiter" role="tablist" aria-label="Bereiche der Akte">' + REITER.map(([k, t]) =>
    '<a role="tab" href="' + link(a.aktenzeichen, k) + '" aria-selected="' + (k === reiter) + '">' + esc(t) +
    (anzahl[k] ? ' <span class="pj-anzahl' + (k === "belege" && z.luecken ? " krit" : "") + '"' + (k === "belege" && z.luecken ? ' title="Lücken: wir müssen beweisen, kein Beleg"' : "") + ">" + anzahl[k] + "</span>" : "") + "</a>").join("") + "</nav>";
  const inhalt = { ueberblick: reiterUeberblick, chronologie: reiterChronologie, dokumente: reiterDokumente, belege: reiterBelege,
    entwuerfe: reiterEntwuerfe, dossier: reiterDossier }[reiter](a);
  const html = '<div class="rf-seite">' +
    '<div class="kopf rf-kopf"><div class="rf-kopf-links"><p class="pj-krumen"><a href="#/rechtsfaelle">Rechtsfälle</a> / <span class="rf-az">' + esc(a.aktenzeichen) + "</span></p>" +
      '<input class="rf-titel" type="text" value="' + esc(a.titel) + '" maxlength="140" data-rf-feld="titel" data-fokus="titel" aria-label="Titel des Falls">' +
      '<div class="rf-meta">' + typPille(a.falltyp, a.falltyp_name) + rollenChip(a.rolle, a.rolle_name) +
        (a.gegenseite.name ? "<span>Gegenseite: <b>" + esc(a.gegenseite.name) + "</b>" + (a.gegenseite.anwalt ? " · Anwalt: " + esc(a.gegenseite.anwalt) : "") + "</span>" : "") +
        (a.streitwert != null ? "<span>Streitwert " + esc(euro(a.streitwert)) + "</span>" : "") + avatare(a.bearbeiter) +
        '<span class="rf-speicher klein" id="rf-speicher" aria-live="polite"></span></div></div>' +
      '<div class="kopf-aktionen"><button class="btn" data-rf="ordner" data-az="' + esc(a.aktenzeichen) + '">' + ic("i-folder") + "Ordner öffnen</button>" +
        '<a class="btn" href="' + link(a.aktenzeichen, "dossier") + '">' + ic("i-copy") + "Für Claude vorbereiten</a>" +
        (a.darf_loeschen ? '<button class="mini gefahr" data-rf="loeschen">Akte löschen</button>' : "") + "</div></div>" +
    phasenLeiste(a) + naechsterSchritt(a, reiter !== "ueberblick") + reiterHtml + '<div role="tabpanel">' + inhalt + "</div></div>";
  return { html, nach: () => { document.querySelectorAll("#inhalt textarea").forEach(groesse); if (reiter === "dokumente") vorschauenLaden(a); if (reiter === "dossier" || reiter === "entwuerfe") nachReiter(a, reiter); } };
}

/* ---------- Reiter: Überblick ---------- */
function feld(beschriftung, inhalt, breit) {
  return '<label class="rf-feld' + (breit ? " breit" : "") + '"><span>' + esc(beschriftung) + "</span>" + inhalt + "</label>";
}
const eingabe = (pfad, wert, mehr) => '<input type="text" data-rf-feld="' + pfad + '" data-fokus="f-' + pfad + '" value="' + esc(wert || "") + '" autocomplete="off"' + (mehr || "") + ">";
const datumsfeld = (pfad, wert) => '<input type="date" data-rf-feld="' + pfad + '" value="' + esc(wert || "") + '">';
const auswahl = (pfad, liste, wert) => '<select data-rf-feld="' + pfad + '">' + liste.map((x) => '<option value="' + esc(x.id) + '"' + (x.id === wert ? " selected" : "") + ">" + esc(x.name) + "</option>").join("") + "</select>";
const langtext = (pfad, wert, platz, zeilen) => '<textarea rows="' + (zeilen || 3) + '" maxlength="20000" data-still="' + pfad + '" data-fokus="t-' + pfad + '" placeholder="' + esc(platz) + '">' + esc(wert || "") + "</textarea>";

function stammdaten(a) {
  const st = R.start;
  const typen = st.falltypen.map((t) => ({ id: t.id, name: t.name }));
  const bearbeiter = st.personen.map((p) => {
    const an = a.bearbeiter.includes(p.id) || p.id === a.erstellt_von;
    return '<button type="button" class="pj-person-chip' + (an ? " an" : "") + '" data-rf="bearbeiter" data-id="' + esc(p.id) + '" aria-pressed="' + an + '"' +
      (p.id === a.erstellt_von ? ' title="Hat die Akte angelegt – sieht sie immer"' : "") + ">" + avatar(p.id) + esc(p.name.split(" ")[0]) + "</button>";
  }).join("");
  return '<section class="karte"><div class="karte-kopf"><div><h2>Akte</h2><p>Änderungen werden sofort gespeichert. Sichtbar nur für Beteiligte.</p></div></div>' +
    '<div class="rf-felder">' +
      '<div class="rf-zwischen">Fall</div>' +
      feld("Falltyp", auswahl("falltyp", typen, a.falltyp)) +
      feld("Unsere Rolle", auswahl("rolle", st.rollen, a.rolle)) +
      feld("Streitwert (EUR)", eingabe("streitwert", a.streitwert != null ? String(a.streitwert).replace(".", ",") : "", ' inputmode="decimal" placeholder="z. B. 2.400"')) +
      feld("Aufbewahrung bis", datumsfeld("aufbewahren_bis", a.aufbewahren_bis)) +
      '<div class="rf-zwischen">Gegenseite</div>' +
      feld("Name", eingabe("gegenseite.name", a.gegenseite.name, ' maxlength="140"')) +
      feld("Verbraucher oder Unternehmer?", auswahl("gegenseite.art", st.gegenseite_arten, a.gegenseite.art || "")) +
      feld("Anwalt der Gegenseite", eingabe("gegenseite.anwalt", a.gegenseite.anwalt, ' maxlength="200"')) +
      feld("Kontakt", eingabe("gegenseite.kontakt", a.gegenseite.kontakt, ' maxlength="300" placeholder="Adresse, Mail, Telefon"')) +
      '<div class="rf-zwischen">Bezug</div>' +
      feld("Fahrzeug (interne Nummer)", eingabe("bezug.fahrzeug", a.bezug.fahrzeug, ' maxlength="60" placeholder="z. B. DRM12345"')) +
      feld("Kunde", eingabe("bezug.kunde", a.bezug.kunde, ' maxlength="140"')) +
      feld("Übergabe bzw. Abnahme am", datumsfeld("bezug.uebergabe", a.bezug.uebergabe)) +
      feld("Unser Anwalt (extern)", eingabe("anwalt_extern", a.anwalt_extern, ' maxlength="200"')) +
      '<div class="rf-feld breit"><span>Bearbeiter (sehen die Akte)</span><div class="rf-personen">' + bearbeiter + "</div></div>" +
      '<div class="rf-zwischen">Inhalt</div>' +
      feld("Sachverhalt", langtext("sachverhalt", a.sachverhalt, "Was ist passiert? Kurz und sachlich – das steht im Dossier oben.", 4), true) +
      feld("Ziel", langtext("ziel", a.ziel, "Was wollen wir erreichen? (intern)", 2), true) +
      feld("Offene Fragen", langtext("offene_fragen", a.offene_fragen, "Was ist noch unklar? Was fehlt?", 2), true) +
      feld("Notizen", langtext("notizen", a.notizen, "Interne Notizen", 3), true) +
    "</div></section>";
}

function fristenKarte(a) {
  const vorlage = R.vorlage.get(a.aktenzeichen) || {};
  const rechner = R.rechner.get(a.aktenzeichen);
  const zeile = (f) => '<li class="rf-frist' + (f.erledigt ? " erledigt" : "") + '">' +
    '<button class="pj-haken' + (f.erledigt ? " an" : "") + '" data-rf="frist-haken" data-id="' + esc(f.id) + '" aria-pressed="' + !!f.erledigt + '" title="' + (f.erledigt ? "Wieder öffnen" : "Erledigt") + '">' + ic("aufgaben") + "</button>" +
    '<div class="rf-frist-haupt"><span class="rf-frist-titel">' + esc(f.titel) + "</span>" +
      '<span class="rf-frist-meta">' + fristChip(f) + "<span>" + (f.erledigt || (f.tage != null && f.tage <= 7) ? esc(datum(f.datum)) + " · " : "") + esc(f.art_name) + "</span>" +
        (f.vorfrist_ab && !f.erledigt ? "<span>Vorfrist " + esc(kurz(f.vorfrist_ab)) + "</span>" : "") +
        (f.pruefen ? '<span class="pj-chip warn" title="' + esc(f.berechnung) + '">berechnet – bitte prüfen</span><button class="mini" data-rf="frist-geprueft" data-id="' + esc(f.id) + '">geprüft</button>' : "") +
        (f.berechnung && !f.pruefen ? '<span title="' + esc(f.berechnung) + '">geprüft</span>' : "") + "</span>" +
      (f.notiz ? '<span class="klein">' + esc(f.notiz) + "</span>" : "") + "</div>" +
    '<button class="pj-icon-knopf klein" data-rf="frist-weg" data-id="' + esc(f.id) + '" title="Frist löschen" aria-label="Frist löschen">' + ic("schliessen") + "</button></li>";
  const arten = R.start.frist_arten;
  const art = vorlage.art || "wiedervorlage";
  return '<section class="karte" id="fristen"><div class="karte-kopf"><div><h2>Fristen <span class="pj-anzahl">' + a.zahlen.fristen_offen + "</span></h2><p>Erscheinen in „Heute &amp; Woche“; in der Seitenleiste zählen die nächsten 7 Tage.</p></div></div>" +
    '<div class="rf-inhalt">' +
    (a.fristen.length ? '<ul class="rf-fristen">' + a.fristen.map(zeile).join("") + "</ul>" : '<p class="rf-leer">Noch keine Frist. Mindestens eine Wiedervorlage setzen.</p>') +
    '<form class="rf-formular" data-rf-form="frist">' +
      (vorlage.berechnung ? '<div class="rf-vorlage">Aus der Rechenhilfe: ' + esc(vorlage.berechnung) + ' – bitte prüfen. <button type="button" class="mini" data-rf="vorlage-weg">verwerfen</button></div>' : "") +
      '<input type="text" name="titel" required maxlength="200" placeholder="Neue Frist, z. B. Antwort an Anwalt Meyer" value="' + esc(vorlage.titel || "") + '" data-fokus="frist-titel" autocomplete="off">' +
      '<div class="rf-formular-reihe"><select name="art" aria-label="Art der Frist">' + arten.map((x) => '<option value="' + esc(x.id) + '"' + (x.id === art ? " selected" : "") + ">" + esc(x.name) + "</option>").join("") + "</select>" +
        '<input type="date" name="datum" required value="' + esc(vorlage.datum || "") + '" aria-label="Datum">' +
        '<input type="number" name="vorfrist_tage" min="0" max="90" placeholder="Vorfrist" title="Vorfrist in Tagen (leer: nach Art)" aria-label="Vorfrist in Tagen"></div>' +
      '<div class="rf-formular-fuss"><span class="klein">Vorfrist ohne Angabe: Notfrist und gesetzlich 7 Tage, Gegenseite 3 Tage.</span><button class="btn" type="submit">Frist eintragen</button></div></form>' +
    '<details class="rf-rechner"' + (rechner ? " open" : "") + "><summary>Rechenhilfe (bitte prüfen)</summary><div class=\"rf-rechner-inhalt\">" +
      (a.rechenhilfen.length ? '<div class="rf-vorschlaege">' + a.rechenhilfen.map((h) =>
        '<button type="button" class="mini" data-rf="rechenhilfe" data-id="' + esc(h.id) + '" title="' + esc(h.norm + " · Quelle: " + h.quelle) + '">' + esc(h.titel) + ": " + esc(h.ab) + " + " + h.anzahl + " " + esc(einheitText(h.einheit, h.anzahl)) + "</button>").join("") + "</div>" : "") +
      '<form class="rf-formular-reihe" data-rf-form="rechnen"><input type="date" name="von" required aria-label="Ausgangsdatum" value="' + esc((rechner && rechner.von) || "") + '">' +
        '<input type="number" name="anzahl" min="1" max="3650" required value="' + esc((rechner && rechner.anzahl) || 14) + '" aria-label="Anzahl">' +
        '<select name="einheit" aria-label="Einheit">' + [["tage", "Tage"], ["wochen", "Wochen"], ["monate", "Monate"], ["jahre", "Jahre"]].map(([k, t]) => '<option value="' + k + '"' + (rechner && rechner.einheit === k ? " selected" : "") + ">" + t + "</option>").join("") + "</select>" +
        '<button class="btn" type="submit">Rechnen</button></form>' +
      (rechner && rechner.datum ? '<div class="rf-ergebnis"><span>' + esc(rechner.text) + "</span><b>" + esc(datum(rechner.datum)) + (rechner.wochenende ? ' <span class="warn">(' + esc(rechner.wochenende) + ")</span>" : "") + "</b>" +
        '<span class="klein">' + esc(rechner.hinweis) + "</span>" + (rechner.titel ? '<span class="klein">' + esc(rechner.norm || "") + (rechner.quelle ? " · Quelle: " + esc(rechner.quelle) : "") + "</span>" : "") +
        '<span><button class="mini" data-rf="rechnung-uebernehmen">Als Frist übernehmen</button></span></div>' : "") +
    "</div></details></div></section>";
}
const einheitText = (e, n) => ({ tage: ["Tag", "Tage"], wochen: ["Woche", "Wochen"], monate: ["Monat", "Monate"], jahre: ["Jahr", "Jahre"] }[e] || ["", ""])[n === 1 ? 0 : 1];

function schritteKarte(a) {
  const phasen = R.start.phasen;
  return '<section class="karte" id="schritte"><div class="karte-kopf"><div><h2>Was zu tun ist</h2><p>Checkliste aus den muster-recht-Skills, je Phase. Abhaken, was erledigt ist.</p></div></div>' +
    '<div class="rf-inhalt">' + phasen.map((p) => {
      const liste = a.schritte.filter((s) => s.phase === p.id);
      if (!liste.length) return "";
      const offen = liste.filter((s) => !s.erledigt).length;
      return '<details class="rf-phase-schritte"' + (p.id === a.phase ? " open" : "") + "><summary>" + esc(p.name) +
        ' <span class="pj-anzahl">' + (offen ? offen : "✓") + "</span>" + (p.id === a.phase ? ' <span class="pj-chip">aktuell</span>' : "") + "</summary>" +
        '<ul class="rf-schritte">' + liste.map((s) => '<li class="rf-schritt' + (s.erledigt ? " an" : "") + '"><label' + (s.automatisch ? ' title="Aus den Angaben der Akte erkannt"' : "") + '><input type="checkbox" data-rf-schritt="' + esc(s.id) + '"' + (s.erledigt ? " checked" : "") + (s.automatisch ? " disabled" : "") + '><span class="rf-schritt-text">' + esc(s.text) + "</span></label>" + '<span class="rf-schritt-fuss">' + quelle(s.quelle) + (s.automatisch ? '<span class="rf-quelle rf-auto">aus der Akte erkannt</span>' : "") + "</span></li>").join("") + "</ul></details>";
    }).join("") + recht(a.hinweis_recht) + "</div></section>";
}

function reiterUeberblick(a) {
  const weitere = a.hinweise.filter((h) => h.ton === "info");
  return '<div class="rf-raster"><div class="rf-spalte">' + stammdaten(a) + "</div>" +
    '<div class="rf-spalte">' + fristenKarte(a) +
      (weitere.length ? '<section class="karte"><div class="karte-kopf"><div><h2>Hinweise</h2><p>Aus den Angaben der Akte abgeleitet – bitte prüfen.</p></div></div><div class="rf-inhalt"><ul class="rf-hinweise">' + weitere.map(hinweisZeile).join("") + "</ul></div></section>" : "") +
      schritteKarte(a) +
      '<section class="karte"><div class="karte-kopf"><div><h2>Passende Skills</h2><p>Für die Weiterarbeit in Claude: Dossier einfügen und mit muster-recht-einstieg beginnen.</p></div></div>' +
        '<div class="rf-inhalt"><div class="rf-skills">' + ["muster-recht-einstieg"].concat(a.skills.filter((s) => s !== "muster-recht-einstieg"), a.skills_allgemein).map((s) => '<span class="pj-chip mono">' + esc(s) + "</span>").join("") + "</div></div></section>" +
    "</div></div>";
}

/* ---------- Reiter: Chronologie ---------- */
const dokName = (a, id) => { const d = a.dokumente.find((x) => x.id === id); return d ? d.name : ""; };
const dokSymbol = (d) => d.art === "mail" ? "i-mail" : d.bild || d.art === "foto" ? "ci-foto" : d.endung === ".pdf" ? "i-pdf" : "i-file";
const dokChip = (a, id) => { const d = a.dokumente.find((x) => x.id === id); return d ? '<button class="rf-dok-chip" data-rf="dok-oeffnen" data-id="' + esc(d.id) + '" title="' + esc(d.name + " öffnen") + '">' + ic(dokSymbol(d).replace("ci-", "")) + "<span>" + esc(d.name) + "</span></button>" : ""; };

function ereignisFormular(a, e) {
  const arten = R.start.ereignis_arten;
  const [tag, zeit] = e ? [String(e.datum).slice(0, 10), String(e.datum).slice(11, 16)] : [heute(), ""];
  const gewaehlt = e ? e.dokumente || [] : [];
  return '<form class="rf-formular" data-rf-form="ereignis"' + (e ? ' data-id="' + esc(e.id) + '"' : "") + ">" +
    '<div class="rf-formular-reihe"><select name="art" aria-label="Art">' + arten.map((x) => '<option value="' + esc(x.id) + '"' + ((e ? e.art : "notiz") === x.id ? " selected" : "") + ">" + esc(x.name) + "</option>").join("") + "</select>" +
      '<input type="date" name="tag" required value="' + esc(tag) + '" aria-label="Datum"><input type="time" name="zeit" value="' + esc(zeit) + '" aria-label="Uhrzeit (optional)"></div>' +
    '<input type="text" name="titel" required maxlength="200" placeholder="Was ist passiert? z. B. Kundin ruft an, Markise klemmt wieder" value="' + esc(e ? e.titel : "") + '" data-fokus="ereignis-titel" autocomplete="off">' +
    '<textarea name="text" rows="3" maxlength="20000" placeholder="Einzelheiten (optional)">' + esc(e ? e.text || "" : "") + "</textarea>" +
    (a.dokumente.length ? '<details class="rf-auswahl"' + (gewaehlt.length ? " open" : "") + "><summary>Dokumente verknüpfen" + (gewaehlt.length ? " (" + gewaehlt.length + ")" : "") + '</summary><div class="rf-auswahl-liste">' +
      a.dokumente.map((d) => '<label><input type="checkbox" name="dokumente" value="' + esc(d.id) + '"' + (gewaehlt.includes(d.id) ? " checked" : "") + ">" + esc(d.name) + ' <span class="klein">' + esc(d.art_name) + "</span></label>").join("") + "</div></details>" : "") +
    '<div class="rf-formular-fuss"><button class="btn" type="button" data-rf="ereignis-zu">Abbrechen</button><button class="btn btn-primaer" type="submit">' + (e ? "Speichern" : "Eintragen") + "</button></div></form>";
}

function reiterChronologie(a) {
  const vorhanden = R.start.ereignis_arten.filter((x) => a.ereignisse.some((e) => e.art === x.id));
  let liste = a.ereignisse.filter((e) => !R.chronoArt || e.art === R.chronoArt);
  if (R.chronoNeueste) liste = liste.slice().reverse();
  let gruppe = "";
  const zeilen = liste.map((e) => {
    if (R.ereignisBearbeiten === e.id) return '<li class="rf-ereignis-bearbeiten">' + ereignisFormular(a, e) + "</li>";
    const m = monat(e.datum);
    const kopf = m !== gruppe ? (gruppe = m, '<li class="rf-monat">' + esc(m) + "</li>") : "";
    const text = String(e.text || "").trim();
    const lang = text.length > 280 || text.split("\n").length > 5;
    return kopf + '<li class="rf-ereignis art-' + esc(e.art) + '"><span class="rf-ereignis-zeit"><b>' + esc(kurz(e.datum)) + "</b>" + esc(String(e.datum).slice(11, 16)) + "</span>" +
      '<span class="rf-marke" aria-hidden="true"></span>' +
      '<div class="rf-ereignis-haupt"><span class="rf-ereignis-titel">' + esc(e.titel) + "</span>" +
        '<span class="rf-ereignis-meta"><span>' + esc(e.art_name) + "</span>" + (e.mail_von ? "<span>von " + esc(e.mail_von) + "</span>" : "") + (e.mail_an ? "<span>an " + esc(e.mail_an) + "</span>" : "") + "</span>" +
        (text ? (lang ? '<details class="rf-mehr"><summary>' + esc(text.slice(0, 160).replace(/\s+/g, " ")) + " …</summary><p class=\"rf-ereignis-text\">" + esc(text) + "</p></details>"
          : '<p class="rf-ereignis-text">' + esc(text) + "</p>") : "") +
        ((e.dokumente || []).length ? '<div class="rf-dok-chips">' + e.dokumente.map((d) => dokChip(a, d)).join("") + "</div>" : "") + "</div>" +
      '<span class="rf-ereignis-aktionen"><button class="pj-icon-knopf klein" data-rf="ereignis-bearbeiten" data-id="' + esc(e.id) + '" title="Bearbeiten" aria-label="Eintrag bearbeiten">' + ic("i-notiz") + "</button>" +
        '<button class="pj-icon-knopf klein" data-rf="ereignis-weg" data-id="' + esc(e.id) + '" title="Eintrag löschen (Dokumente bleiben)" aria-label="Eintrag löschen">' + ic("schliessen") + "</button></span></li>";
  }).join("");
  return '<div class="rf-werkzeuge"><div class="filter" role="group" aria-label="Art">' +
      '<button class="' + (!R.chronoArt ? "aktiv" : "") + '" data-rf="chrono-art" data-wert="" aria-pressed="' + !R.chronoArt + '">Alle <span class="rf-zahl">' + a.ereignisse.length + "</span></button>" +
      vorhanden.map((x) => '<button class="' + (R.chronoArt === x.id ? "aktiv" : "") + '" data-rf="chrono-art" data-wert="' + esc(x.id) + '" aria-pressed="' + (R.chronoArt === x.id) + '">' + esc(x.name) + ' <span class="rf-zahl">' + a.ereignisse.filter((e) => e.art === x.id).length + "</span></button>").join("") + "</div>" +
      '<div class="rechts"><button class="btn" data-rf="chrono-sortieren">' + (R.chronoNeueste ? "Neueste zuerst" : "Älteste zuerst") + "</button>" +
      '<button class="btn" data-rf="dateien">' + ic("i-mail") + "Mails &amp; Dateien</button>" +
      '<button class="btn btn-primaer" data-rf="ereignis-neu">' + ic("plus") + "Eintrag</button></div></div>" +
    (R.chronoNeu ? '<section class="karte rf-neu-karte"><div class="rf-inhalt">' + ereignisFormular(a, null) + "</div></section>" : "") +
    (liste.length ? '<section class="karte"><ul class="rf-zeitleiste">' + zeilen + "</ul></section>"
      : '<div class="pj-leer klein"><p>' + (a.ereignisse.length ? "Kein Eintrag dieser Art." : "Noch keine Einträge. Gespeicherte Mails (.msg oder .eml) unter „Mails & Dateien“ hinzufügen – Betreff, Absender, Datum und Text kommen automatisch hierher.") + "</p></div>");
}

/* ---------- Reiter: Dokumente ---------- */
function reiterDokumente(a) {
  const arten = R.start.dokument_arten;
  const vorhanden = arten.filter((x) => a.dokumente.some((d) => d.art === x.id));
  const liste = a.dokumente.filter((d) => !R.dokArt || d.art === R.dokArt);
  const fotos = liste.filter((d) => d.bild);
  const mailName = (id) => dokName(a, id);
  const zeile = (d) => '<tr><td><div class="rf-dok-name">' + ic(dokSymbol(d).replace("ci-", "")) + '<div><button data-rf="dok-oeffnen" data-id="' + esc(d.id) + '" title="Im passenden Programm öffnen">' + esc(d.name) + "</button>" +
      '<div class="rf-dok-unter"><span>' + esc(d.groesse_text) + '</span><span class="rf-hash" title="SHA-256: ' + esc(d.sha256) + '">SHA-256 ' + esc(String(d.sha256 || "").slice(0, 12)) + "…</span>" +
      (d.aus_mail ? '<span title="Anhang aus ' + esc(mailName(d.aus_mail)) + '">Anhang aus Mail</span>' : "") + (d.hinweis ? '<span class="krit">' + esc(d.hinweis) + "</span>" : "") + "</div></div></div></td>" +
    '<td><select data-dok-feld="art" data-id="' + esc(d.id) + '" aria-label="Art">' + arten.map((x) => '<option value="' + esc(x.id) + '"' + (x.id === d.art ? " selected" : "") + ">" + esc(x.name) + "</option>").join("") + "</select></td>" +
    '<td><input type="date" data-dok-feld="datum" data-id="' + esc(d.id) + '" value="' + esc(d.datum || "") + '" aria-label="Datum"></td>' +
    '<td><input type="text" data-dok-feld="beschreibung" data-id="' + esc(d.id) + '" data-fokus="dok-' + esc(d.id) + '" value="' + esc(d.beschreibung || "") + '" maxlength="500" placeholder="Beschreibung" aria-label="Beschreibung"></td>' +
    '<td class="r"><button class="pj-icon-knopf klein" data-rf="dok-weg" data-id="' + esc(d.id) + '" title="Aus der Akte nehmen (Datei kommt in „_entfernt“)" aria-label="Dokument entfernen">' + ic("schliessen") + "</button></td></tr>";
  return '<div class="rf-werkzeuge"><div class="filter" role="group" aria-label="Art">' +
      '<button class="' + (!R.dokArt ? "aktiv" : "") + '" data-rf="dok-art" data-wert="" aria-pressed="' + !R.dokArt + '">Alle <span class="rf-zahl">' + a.dokumente.length + "</span></button>" +
      vorhanden.map((x) => '<button class="' + (R.dokArt === x.id ? "aktiv" : "") + '" data-rf="dok-art" data-wert="' + esc(x.id) + '" aria-pressed="' + (R.dokArt === x.id) + '">' + esc(x.name) + ' <span class="rf-zahl">' + a.dokumente.filter((d) => d.art === x.id).length + "</span></button>").join("") + "</div>" +
      '<div class="rechts"><button class="btn btn-primaer" data-rf="dateien">' + ic("plus") + "Dateien hinzufügen</button></div></div>" +
    '<div class="hinweis">' + ic("i-mail") + "<div><b>Mails aus Outlook:</b> in einen Ordner ziehen und hier hinzufügen (.msg oder .eml). Betreff, Absender, Datum und Text kommen in die Chronologie, jeder Anhang wird ein eigenes Dokument. ODIN kopiert die Dateien in den Ordner der Akte und merkt sich je Datei den SHA-256 – damit lässt sich später zeigen, dass nichts verändert wurde.</div></div>" +
    (fotos.length ? '<section class="karte"><div class="karte-kopf"><div><h2>Fotos</h2><p>Klick öffnet das Bild.</p></div></div><div class="rf-fotos">' + fotos.map((d) => {
      const bild = R.vorschau.get(d.id);
      return '<button class="rf-foto" data-rf="dok-oeffnen" data-id="' + esc(d.id) + '" title="' + esc(d.name) + '">' +
        (bild ? '<img src="' + esc(bild) + '" alt="' + esc(d.beschreibung || d.name) + '" loading="lazy">' : '<span class="rf-foto-platz">' + ic("foto") + "</span>") +
        '<span class="rf-foto-name">' + esc(d.datum ? kurz(d.datum) + " · " : "") + esc(d.name) + "</span></button>";
    }).join("") + "</div></section>" : "") +
    (liste.length ? '<section class="karte' + (fotos.length ? " " : "") + '" style="margin-top:14px"><div class="tab-huelle"><table class="rf-doks"><thead><tr><th>Datei</th><th>Art</th><th>Datum</th><th>Beschreibung</th><th></th></tr></thead><tbody>' + liste.map(zeile).join("") + "</tbody></table></div></section>"
      : '<div class="pj-leer klein"><p>' + (a.dokumente.length ? "Kein Dokument dieser Art." : "Noch keine Dokumente – Verträge, Rechnungen, Fotos, Protokolle und Mails hinzufügen.") + "</p></div>");
}

async function vorschauenLaden(a) {
  const fehlen = a.dokumente.filter((d) => d.bild && !R.vorschau.has(d.id)).slice(0, 24);
  if (!fehlen.length) return;
  for (const d of fehlen) {
    try { R.vorschau.set(d.id, await ruf("vorschau", a.aktenzeichen, d.id)); } catch (e) { R.vorschau.set(d.id, null); }
  }
  if (azAusHash() === a.aktenzeichen && reiterAusHash() === "dokumente") neuZeichnen();
}

/* ---------- Reiter: Belegmatrix ---------- */
function reiterBelege(a) {
  const st = R.start;
  const opt = (liste, wert) => liste.map((x) => '<option value="' + esc(x.id) + '"' + (x.id === wert ? " selected" : "") + ">" + esc(x.name) + "</option>").join("");
  const wer = [{ id: "wir", name: "Wir" }, { id: "gegenseite", name: "Gegenseite" }];
  const zeile = (b) => {
    const frei = a.dokumente.filter((d) => !b.belege.includes(d.id));
    return '<tr class="' + (b.luecke ? "luecke" : "") + '"><td class="rf-behauptung">' + esc(b.behauptung) + "</td>" +
      '<td><select data-beleg-feld="von" data-id="' + esc(b.id) + '" aria-label="Wer behauptet">' + opt(wer, b.von) + "</select></td>" +
      '<td><select data-beleg-feld="beweislast" data-id="' + esc(b.id) + '" aria-label="Wer muss beweisen">' + opt(st.beweislast, b.beweislast) + "</select></td>" +
      '<td><select data-beleg-feld="status" data-id="' + esc(b.id) + '" aria-label="Status">' + opt(st.beleg_status, b.status) + "</select></td>" +
      '<td><div class="rf-belege-zelle"><div class="rf-dok-chips">' + b.belege.map((d) => '<span class="rf-beleg-chip">' + dokChip(a, d) + '<button class="x" data-rf="beleg-ab" data-id="' + esc(b.id) + '" data-dok="' + esc(d) + '" title="Verknüpfung lösen" aria-label="Verknüpfung lösen">×</button></span>').join("") + "</div>" +
        (frei.length ? '<select data-beleg-dazu="' + esc(b.id) + '" aria-label="Beleg verknüpfen"><option value="">+ Dokument als Beleg …</option>' + frei.map((d) => '<option value="' + esc(d.id) + '">' + esc(d.name) + "</option>").join("") + "</select>" : "") +
        '<input type="text" data-beleg-feld="weitere" data-id="' + esc(b.id) + '" data-fokus="weitere-' + esc(b.id) + '" value="' + esc(b.weitere || "") + '" placeholder="Zeugen, sonstige Beweismittel" maxlength="1000"></div></td>' +
      "<td>" + (b.luecke ? '<span class="pj-chip krit">Lücke</span>' : b.status === "unstreitig" ? '<span class="pj-chip gut">unstreitig</span>' : b.beweislast === "gegenseite" && !b.belege.length ? '<span class="pj-chip leise">Gegenseite muss beweisen</span>' : '<span class="pj-chip gut">belegt</span>') +
        '<input type="text" data-beleg-feld="beschaffen" data-id="' + esc(b.id) + '" data-fokus="beschaffen-' + esc(b.id) + '" value="' + esc(b.beschaffen || "") + '" placeholder="Wie beschaffen?" maxlength="1000" style="margin-top:6px"></td>' +
      '<td class="r"><button class="pj-icon-knopf klein" data-rf="beleg-weg" data-id="' + esc(b.id) + '" title="Zeile löschen" aria-label="Zeile löschen">' + ic("schliessen") + "</button></td></tr>";
  };
  return '<div class="hinweis">' + ic("info") + "<div><b>Wer behauptet, muss beweisen</b> – jede Partei die Tatsachen, die für sie günstig sind. Ausnahmen gibt es, etwa beim Verbrauchsgüterkauf: Zeigt sich ein Mangel innerhalb eines Jahres nach Übergabe, wird vermutet, dass er schon da war (§ 477 BGB). " +
      "Rot markiert: Behauptungen, die wir beweisen müssen, ohne Beleg. " + quelle("workflow-beweislast-und-belegmatrix") + "</div></div>" +
    '<section class="karte rf-neu-karte"><div class="karte-kopf"><div><h2>Behauptung oder Tatsache hinzufügen</h2></div></div><div class="rf-inhalt"><form class="rf-formular" data-rf-form="beleg">' +
      '<textarea name="behauptung" rows="2" required maxlength="1000" placeholder="z. B. Die Markise war bei der Übergabe in Ordnung" data-fokus="beleg-neu"></textarea>' +
      '<div class="rf-formular-reihe"><label class="rf-feld-klein">Wer behauptet? <select name="von">' + opt(wer, "wir") + "</select></label>" +
        '<label class="rf-feld-klein">Wer muss beweisen? <select name="beweislast"><option value="">wie „wer behauptet“</option>' + opt(st.beweislast, "") + "</select></label>" +
        '<label class="rf-feld-klein">Status <select name="status">' + opt(st.beleg_status, "offen") + "</select></label></div>" +
      '<div class="rf-formular-fuss"><button class="btn btn-primaer" type="submit">Hinzufügen</button></div></form></div></section>' +
    (a.belege.length ? '<section class="karte" style="margin-top:14px"><div class="tab-huelle"><table class="rf-matrix"><thead><tr><th>Behauptung</th><th>Wer behauptet</th><th>Beweislast</th><th>Status</th><th>Belege</th><th>Lücke</th><th></th></tr></thead><tbody>' + a.belege.map(zeile).join("") + "</tbody></table></div></section>"
      : '<div class="pj-leer klein"><p>Noch keine Behauptungen. Am besten mit den drei, vier Punkten anfangen, auf die es im Streit ankommt.</p></div>');
}

/* ---------- Reiter: Entwürfe ---------- */
function reiterEntwuerfe(a) {
  if (!a.entwuerfe.length) return '<div class="pj-leer klein"><p>Für diesen Falltyp gibt es keine Textbausteine.</p></div>';
  const gewaehlt = R.entwurf.get(a.aktenzeichen) && a.entwuerfe.some((e) => e.id === R.entwurf.get(a.aktenzeichen)) ? R.entwurf.get(a.aktenzeichen) : a.entwuerfe[0].id;
  const e = R.entwuerfe.get(a.aktenzeichen + "|" + gewaehlt);
  return '<div class="rf-entwurf-raster"><section class="karte"><div class="rf-entwurf-liste" role="group" aria-label="Textbausteine">' + a.entwuerfe.map((x) =>
      '<button class="rf-entwurf-wahl" data-rf="entwurf" data-id="' + esc(x.id) + '" aria-pressed="' + (x.id === gewaehlt) + '"><span>' + esc(x.titel) + "</span></button>").join("") + "</div></section>" +
    '<section class="karte">' + (!e ? ladeAnzeige("Entwurf") : e.fehler ? '<div class="rf-inhalt"><p>' + esc(e.fehler) + "</p></div>" :
      '<div class="karte-kopf"><div><h2>' + esc(e.titel) + '</h2><p>Aus der Akte gefüllt. Lücken stehen in [eckigen Klammern].</p></div><span class="rf-entwurf-marke">' + ic("i-warn") + esc(e.markierung) + "</span></div>" +
      '<div class="rf-inhalt"><label class="rf-entwurf-betreff"><span class="klein">Betreff</span><input type="text" value="' + esc(e.betreff) + '" data-entwurf-betreff="1" data-fokus="entwurf-betreff-' + esc(e.id) + '"></label>' +
        '<textarea class="rf-entwurf-text" data-entwurf-text="1" data-fokus="entwurf-text-' + esc(e.id) + '" aria-label="Text des Entwurfs">' + esc(e.text) + "</textarea>" +
        (e.offen.length ? '<div class="rf-offen"><span>Noch auszufüllen:</span>' + e.offen.map((o) => '<span class="pj-chip warn">' + esc(o) + "</span>").join("") + "</div>" : "") +
        '<div class="hinweis" style="margin:0">' + ic("info") + "<div>" + esc(e.hinweis) + " " + quelle(e.quelle) + "</div></div>" +
        '<div class="rf-formular-fuss"><button class="btn" data-rf="entwurf-neu-laden">Neu aus der Akte</button><button class="btn" data-rf="entwurf-vermerken" title="Als gesendeten Eintrag in die Chronologie – erst nach dem Versand">In Chronologie vermerken</button>' +
          '<button class="btn btn-primaer" data-rf="entwurf-kopieren">' + ic("i-copy") + "Text kopieren</button></div>" + recht(e.hinweis_recht) + "</div>") +
    "</section></div>";
}

/* ---------- Reiter: Dossier ---------- */
function reiterDossier(a) {
  const d = R.dossier.get(a.aktenzeichen);
  return '<div class="hinweis">' + ic("info") + "<div><b>Brücke zu Claude.</b> Das Dossier fasst die Akte zusammen: Auftrag, Eckdaten, Ziel, Sachverhalt, Chronologie, Fristen, Belege, Dokumente und offene Fragen. " +
      "In Claude einen neuen Chat öffnen, das Dossier einfügen und mit dem Skill muster-recht-einstieg weiterarbeiten. Für den Anwalt: ohne Namenskürzung kopieren und die Dokumente beifügen. " +
      "Vor der Weitergabe prüfen, ob das mit dem Datenschutz geklärt ist.</div></div>" +
    '<section class="karte"><div class="karte-kopf"><div class="rf-dossier-optionen">' +
      '<label class="rf-schalter"><input type="checkbox" data-dossier-opt="kuerzen"' + (R.dossierOpt.kuerzen ? " checked" : "") + "> Namen und Kontaktdaten ersetzen</label>" +
      '<label class="rf-schalter"><input type="checkbox" data-dossier-opt="mailtexte"' + (R.dossierOpt.mailtexte ? " checked" : "") + "> Mailtexte mitnehmen</label></div>" +
      '<div class="kopf-aktionen"><button class="btn" data-rf="dossier-speichern" title="Als Markdown-Datei in den Ordner der Akte">In der Akte speichern</button>' +
        '<button class="btn btn-primaer" data-rf="dossier-kopieren">' + ic("i-copy") + "Kopieren</button></div></div>" +
      (!d ? ladeAnzeige("Dossier") : d.fehler ? '<div class="rf-inhalt"><p>' + esc(d.fehler) + "</p></div>" : '<pre class="rf-dossier" tabindex="0" aria-label="Dossier">' + esc(d.text) + "</pre>") +
    "</section>";
}

function nachReiter(a, reiter) {
  if (reiter === "dossier" && !R.dossier.has(a.aktenzeichen)) {
    ruf("dossier", a.aktenzeichen, { ...R.dossierOpt })
      .then((d) => R.dossier.set(a.aktenzeichen, d)).catch((e) => R.dossier.set(a.aktenzeichen, { fehler: String(e.message || e) }))
      .then(() => { if (azAusHash() === a.aktenzeichen && reiterAusHash() === "dossier") neuZeichnen(); });
  }
  if (reiter === "entwuerfe" && a.entwuerfe.length) {
    const id = R.entwurf.get(a.aktenzeichen) && a.entwuerfe.some((e) => e.id === R.entwurf.get(a.aktenzeichen)) ? R.entwurf.get(a.aktenzeichen) : a.entwuerfe[0].id;
    const schluessel = a.aktenzeichen + "|" + id;
    if (R.entwuerfe.has(schluessel)) return;
    R.entwuerfe.set(schluessel, null);
    ruf("entwurf", a.aktenzeichen, id).then((e) => R.entwuerfe.set(schluessel, e)).catch((e) => R.entwuerfe.set(schluessel, { fehler: String(e.message || e) }))
      .then(() => { if (azAusHash() === a.aktenzeichen && reiterAusHash() === "entwuerfe") neuZeichnen(); });
  }
}

/* ------------------------------------------------------------ Dialoge */
function dialog(html, beimAbsenden) {
  const d = document.createElement("dialog");
  d.className = "dialog pj-dialog rf-dialog";
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
  const erstes = d.querySelector("input:not([type=hidden]):not([type=checkbox]):not([type=radio]), textarea");
  if (erstes) erstes.focus();
  return d;
}

function dialogNeu() {
  const st = R.start;
  const d = dialog('<form method="dialog"><div class="dialog-kopf"><h2>Neuer Rechtsfall</h2><p>ODIN vergibt das Aktenzeichen und legt einen Ordner für Dokumente an. Sichtbar nur für dich und die Bearbeiter.</p></div>' +
    '<label class="feld"><span class="feld-label">Titel</span><input name="titel" required maxlength="140" placeholder="z. B. Reklamation Markise, Familie Beispiel"></label>' +
    '<div class="feld-reihe"><label class="feld"><span class="feld-label">Falltyp</span><select name="falltyp">' + st.falltypen.map((t) => '<option value="' + esc(t.id) + '">' + esc(t.name) + "</option>").join("") + '</select><p class="rf-typ-hilfe" data-typ-hilfe></p></label>' +
      '<div class="feld"><span class="feld-label">Unsere Rolle</span><div class="rf-wahl" role="radiogroup" aria-label="Unsere Rolle">' + st.rollen.map((r, i) => '<label><input type="radio" name="rolle" value="' + esc(r.id) + '"' + (r.id === "gegen_uns" ? " checked" : "") + ">" + esc(r.name) + "</label>").join("") + "</div></div></div>" +
    '<div class="feld-reihe"><label class="feld"><span class="feld-label">Gegenseite</span><input name="gegenseite" maxlength="140" placeholder="Name"></label>' +
      '<label class="feld"><span class="feld-label">Verbraucher oder Unternehmer?</span><select name="art">' + st.gegenseite_arten.map((x) => '<option value="' + esc(x.id) + '">' + esc(x.name) + "</option>").join("") + "</select></label></div>" +
    '<div class="feld-reihe"><label class="feld"><span class="feld-label">Fahrzeug (interne Nummer)</span><input name="fahrzeug" maxlength="60"></label>' +
      '<label class="feld"><span class="feld-label">Streitwert (EUR)</span><input name="streitwert" inputmode="decimal" placeholder="optional"></label></div>' +
    '<div class="feld"><span class="feld-label">Bearbeiter (sehen die Akte)</span><div class="pj-auswahl">' + st.personen.map((p) => '<label class="pj-person-chip"><input type="checkbox" name="bearbeiter" value="' + esc(p.id) + '"' + (p.id === st.ich ? " checked disabled" : "") + ">" + avatar(p.id) + esc(p.name) + "</label>").join("") + "</div></div>" +
    '<div class="gruppe dialog-fuss"><span class="rechts"></span><button class="knopf" type="button" data-schliessen>Abbrechen</button><button class="knopf primaer" type="submit">Anlegen</button></div></form>',
  async (fd) => {
    try {
      const a = await ruf("anlegen", { titel: fd.get("titel"), falltyp: fd.get("falltyp"), rolle: fd.get("rolle"), streitwert: fd.get("streitwert") || null,
        gegenseite: { name: fd.get("gegenseite"), art: fd.get("art") }, bezug: { fahrzeug: fd.get("fahrzeug") }, bearbeiter: [st.ich].concat(fd.getAll("bearbeiter")) });
      R.akten.set(a.aktenzeichen, a);
      R.start = { ...R.start, faelle: null };
      geaendert();
      location.hash = link(a.aktenzeichen);
      meldung("Akte " + a.aktenzeichen + " angelegt.");
    } catch (e) { meldung(String(e.message || e), true); return false; }
  });
  const typ = d.querySelector('select[name="falltyp"]'), hilfe = d.querySelector("[data-typ-hilfe]");
  const zeigen = () => { const t = st.falltypen.find((x) => x.id === typ.value); hilfe.textContent = t ? t.beschreibung : ""; };
  typ.addEventListener("change", zeigen);
  zeigen();
}

function dialogAblage() {
  const a = R.start.ablage || {};
  const d = dialog('<form method="dialog"><div class="dialog-kopf"><h2>Ablageort der Rechtsfälle</h2><p>Gilt für diesen Rechner. Rechtsfälle enthalten personenbezogene Daten – sie gehören nicht in die Wissensdatenbank musterOS, auf die alle Agents zugreifen.</p></div>' +
    '<p class="rf-hinweis-dialog">Jetzt: <code>' + esc(a.ordner || "") + "</code>" + (a.fehler ? "<br>" + esc(a.fehler) : a.eigener ? " (eigener Ordner)" : " (Standard: Ordner „Fahrzeuge“ unter _ODIN)") + "</p>" +
    '<p class="rf-hinweis-dialog">Empfehlung: ein eigener Ordner (z. B. in OneDrive oder SharePoint), den nur Berechtigte öffnen können. Alle Beteiligten müssen denselben Ordner einstellen. Vorhandene Akten zieht ODIN nicht um – dafür den Ordner „Rechtsfaelle“ von Hand verschieben.</p>' +
    '<div class="gruppe dialog-fuss"><span class="rechts"></span><button class="knopf" type="button" data-schliessen>Schließen</button>' +
      (a.eigener ? '<button class="knopf" type="button" data-ablage="zuruecksetzen">Standard verwenden</button>' : "") +
      '<button class="knopf primaer" type="button" data-ablage="waehlen">Eigenen Ordner wählen …</button></div></form>');
  d.addEventListener("click", async (ev) => {
    const k = ev.target.closest("[data-ablage]");
    if (!k) return;
    k.disabled = true;
    try {
      const s = await ruf(k.dataset.ablage === "waehlen" ? "ablage_waehlen" : "ablage_zuruecksetzen");
      if (s) { R.start = s; R.akten.clear(); d.close(); geaendert(); neuZeichnen(); meldung("Ablageort: " + s.ablage.ordner); }
    } catch (e) { meldung(String(e.message || e), true); }
    finally { k.disabled = false; }
  });
}

function dialogFrage(titel, text, knopf) {
  return new Promise((fertig) => {
    let ok = false;
    const d = dialog('<form method="dialog"><div class="dialog-kopf"><h2>' + esc(titel) + "</h2><p>" + esc(text) + "</p></div>" +
      '<div class="gruppe dialog-fuss"><span class="rechts"></span><button class="knopf" type="button" data-schliessen>Abbrechen</button><button class="knopf primaer" type="submit">' + esc(knopf) + "</button></div></form>",
    () => { ok = true; });
    d.addEventListener("close", () => fertig(ok));
  });
}

/* ------------------------------------------------------------ Kopieren und Dateien */
async function kopiere(text) {
  try {
    const api = window.pywebview && window.pywebview.api;
    if (api && typeof api.kopiere === "function" && await api.kopiere(text)) return true;
  } catch (e) { /* weiter mit dem Browser */ }
  try { await navigator.clipboard.writeText(text); return true; } catch (e) { return false; }
}

async function dateienHinzufuegen(az, knopf) {
  if (knopf) knopf.disabled = true;
  try {
    const r = await ruf("dokumente_hinzufuegen", az);
    if (!r) return;                                                    // Dialog abgebrochen
    R.akten.set(az, r.akte);
    R.dossier.delete(az);
    const b = r.bericht;
    const teile = [b.neu ? b.neu + (b.neu === 1 ? " Dokument" : " Dokumente") + " abgelegt" : "",
      b.mails ? b.mails + (b.mails === 1 ? " Mail" : " Mails") + " in der Chronologie" : "",
      b.doppelt.length ? b.doppelt.length + " schon vorhanden" : "", b.kleinbilder ? b.kleinbilder + " Signatur-Logos übersprungen" : ""].filter(Boolean);
    meldung((teile.join(" · ") || "Nichts Neues") + (b.fehler.length ? " · Fehler: " + b.fehler.join(" ") : ""), !!b.fehler.length && !b.neu);
    geaendert();
    neuZeichnen();
  } catch (e) { meldung(String(e.message || e), true); }
  finally { if (knopf && knopf.isConnected) knopf.disabled = false; }
}

/* ------------------------------------------------------------ Still speichern (lange Texte) */
const zuletztGespeichert = new Map();
const stillTimer = new Map();
function speicherAnzeige(text) { const s = document.getElementById("rf-speicher"); if (s) s.textContent = text; }
async function stillSpeichern(el) {
  const feld = el.dataset.still, wert = el.value, az = azAusHash();
  const schluessel = az + ":" + feld;
  clearTimeout(stillTimer.get(schluessel)); stillTimer.delete(schluessel);
  if (zuletztGespeichert.get(schluessel) === wert || (!zuletztGespeichert.has(schluessel) && wert === el.defaultValue)) return;
  zuletztGespeichert.set(schluessel, wert);
  speicherAnzeige("Speichert …");
  try {
    const a = await ruf("aendern", az, { [feld]: wert });
    R.akten.set(az, a); R.dossier.delete(az);
    speicherAnzeige("Gespeichert");
  } catch (e) {
    zuletztGespeichert.delete(schluessel);
    speicherAnzeige("");
    meldung("Nicht gespeichert: " + String(e.message || e), true);
  }
}
const groesse = (t) => { if (!t || !t.isConnected || t.classList.contains("rf-entwurf-text")) return; t.style.height = "auto"; t.style.height = (t.scrollHeight + 2) + "px"; };

/* Feld der Akte (auch verschachtelt: „gegenseite.name“) als Änderung */
function feldAenderung(pfad, wert) {
  const [oben, unten] = pfad.split(".");
  return unten ? { [oben]: { [unten]: wert } } : { [oben]: wert };
}

/* ------------------------------------------------------------ Ereignisse (einmal, per Delegation) */
document.addEventListener("click", async (ev) => {
  if (!istMeineSeite()) return;
  const k = ev.target.closest("#inhalt [data-rf]");
  if (!k) return;
  const art = k.dataset.rf, az = azAusHash(), a = R.akten.get(az);
  switch (art) {
    case "neu-laden": R.fehler = ""; R.start = null; neuZeichnen(); break;
    case "ich":
      try { await window.odinAnmelden(k.dataset.id); zuruecksetzen(); ["odin-ich", "odin-ich-urlaub"].forEach((n) => window.dispatchEvent(new Event(n))); nachLaden(ladeStart()); }
      catch (e) { meldung(String(e.message || e), true); }
      break;
    case "neu": dialogNeu(); break;
    case "ablage": dialogAblage(); break;
    case "ordner":
      try { await ruf("ordner_oeffnen", k.dataset.az || ""); } catch (e) { meldung(String(e.message || e), true); }
      break;
    case "filter": R.filter = k.dataset.wert; neuZeichnen(); break;
    case "phase": if (a && k.dataset.wert !== a.phase) await aendern("phase_setzen", [az, k.dataset.wert]); break;
    case "schritt": k.disabled = true; await aendern("schritt_abhaken", [az, k.dataset.id, true]); break;
    case "zu-schritten": {
      ev.preventDefault();
      if (reiterAusHash() !== "ueberblick") { location.hash = link(az); setTimeout(() => { const s = document.getElementById("schritte"); if (s) s.scrollIntoView({ block: "start" }); }, 60); }
      else { const s = document.getElementById("schritte"); if (s) s.scrollIntoView({ block: "start" }); }
      break;
    }
    case "loeschen":
      if (a && await dialogFrage("Akte " + a.aktenzeichen + " löschen?", "Der ganze Ordner der Akte kommt in den Ordner „_Papierkorb“ im Ablageort. Endgültig löschen lässt er sich dort von Hand.", "In den Papierkorb")) {
        try { await ruf("loeschen", az); R.akten.delete(az); R.start = { ...R.start, faelle: null }; geaendert(); location.hash = "#/rechtsfaelle"; meldung("Akte in den Papierkorb gelegt."); }
        catch (e) { meldung(String(e.message || e), true); }
      }
      break;
    case "bearbeiter": {
      if (!a) break;
      const id = k.dataset.id;
      if (id === a.erstellt_von) { meldung("Wer die Akte angelegt hat, sieht sie immer."); break; }
      const neu = a.bearbeiter.includes(id) ? a.bearbeiter.filter((x) => x !== id) : a.bearbeiter.concat(id);
      await aendern("aendern", [az, { bearbeiter: neu }]);
      break;
    }
    case "frist-haken": {
      const f = a && a.fristen.find((x) => x.id === k.dataset.id);
      if (f) { k.disabled = true; await aendern("frist_aendern", [az, f.id, { erledigt: !f.erledigt }]); }
      break;
    }
    case "frist-geprueft": await aendern("frist_aendern", [az, k.dataset.id, { geprueft: true }]); break;
    case "frist-weg": {
      const f = a && a.fristen.find((x) => x.id === k.dataset.id);
      if (f && await dialogFrage("Frist löschen?", "„" + f.titel + "“ am " + datum(f.datum) + " – erledigte Fristen besser abhaken, dann bleiben sie sichtbar.", "Löschen")) await aendern("frist_loeschen", [az, f.id]);
      break;
    }
    case "vorlage-weg": R.vorlage.delete(az); neuZeichnen(); break;
    case "rechenhilfe": {
      const h = a && a.rechenhilfen.find((x) => x.id === k.dataset.id);
      if (!h) break;
      const von = (h.ab.startsWith("Übergabe") || h.ab.startsWith("Abnahme") || h.ab.startsWith("Ablieferung")) && a.bezug.uebergabe ? a.bezug.uebergabe : heute();
      try {
        const x = await ruf("frist_rechnen", von, h.anzahl, h.einheit);
        R.rechner.set(az, { ...x, von, anzahl: h.anzahl, einheit: h.einheit, titel: h.titel, norm: h.norm, quelle: h.quelle, ab: h.ab });
      } catch (e) { meldung(String(e.message || e), true); }
      neuZeichnen();
      break;
    }
    case "rechnung-uebernehmen": {
      const x = R.rechner.get(az);
      if (!x) break;
      R.vorlage.set(az, { titel: x.titel || "", datum: x.datum, art: x.titel ? "gesetzlich" : "wiedervorlage",
        berechnung: (x.ab ? x.ab + " " : "") + x.text + (x.norm ? " (" + x.norm + ")" : "") });
      neuZeichnen();
      const t = document.querySelector('#inhalt [data-rf-form="frist"] input[name="titel"]');
      if (t) { t.focus(); t.select(); }
      break;
    }
    case "chrono-art": R.chronoArt = k.dataset.wert; neuZeichnen(); break;
    case "chrono-sortieren": R.chronoNeueste = !R.chronoNeueste; neuZeichnen(); break;
    case "ereignis-neu": R.chronoNeu = true; R.ereignisBearbeiten = null; neuZeichnen(); { const t = document.querySelector('#inhalt [data-rf-form="ereignis"] input[name="titel"]'); if (t) t.focus(); } break;
    case "ereignis-zu": R.chronoNeu = false; R.ereignisBearbeiten = null; neuZeichnen(); break;
    case "ereignis-bearbeiten": R.ereignisBearbeiten = k.dataset.id; R.chronoNeu = false; neuZeichnen(); break;
    case "ereignis-weg": {
      const e = a && a.ereignisse.find((x) => x.id === k.dataset.id);
      if (e && await dialogFrage("Eintrag löschen?", "„" + e.titel + "“ – verknüpfte Dokumente bleiben in der Akte.", "Löschen")) await aendern("ereignis_loeschen", [az, e.id]);
      break;
    }
    case "dateien": await dateienHinzufuegen(az, k); break;
    case "dok-oeffnen":
      try { await ruf("dokument_oeffnen", az, k.dataset.id); } catch (e) { meldung(String(e.message || e), true); }
      break;
    case "dok-art": R.dokArt = k.dataset.wert; neuZeichnen(); break;
    case "dok-weg": {
      const d = a && a.dokumente.find((x) => x.id === k.dataset.id);
      if (d && await dialogFrage("„" + d.name + "“ aus der Akte nehmen?", "Die Datei wird nicht gelöscht, sondern in den Unterordner „_entfernt“ der Akte verschoben. Verknüpfungen in Chronologie und Belegmatrix fallen weg.", "Aus der Akte nehmen")) await aendern("dokument_entfernen", [az, d.id]);
      break;
    }
    case "beleg-ab": {
      const b = a && a.belege.find((x) => x.id === k.dataset.id);
      if (b) await aendern("beleg_aendern", [az, b.id, { belege: b.belege.filter((d) => d !== k.dataset.dok) }]);
      break;
    }
    case "beleg-weg": {
      const b = a && a.belege.find((x) => x.id === k.dataset.id);
      if (b && await dialogFrage("Zeile löschen?", "„" + b.behauptung.slice(0, 120) + "“", "Löschen")) await aendern("beleg_loeschen", [az, b.id]);
      break;
    }
    case "entwurf": R.entwurf.set(az, k.dataset.id); neuZeichnen(); break;
    case "entwurf-neu-laden": { const id = R.entwurf.get(az) || (a && a.entwuerfe[0] && a.entwuerfe[0].id); R.entwuerfe.delete(az + "|" + id); neuZeichnen(); break; }
    case "entwurf-kopieren": {
      const t = document.querySelector("#inhalt [data-entwurf-text]");
      if (t && await kopiere(t.value)) meldung("Entwurf kopiert – vor dem Versand prüfen."); else meldung("Kopieren hat nicht geklappt.", true);
      break;
    }
    case "entwurf-vermerken": {
      const t = document.querySelector("#inhalt [data-entwurf-text]"), b = document.querySelector("#inhalt [data-entwurf-betreff]");
      if (!t || !await dialogFrage("In der Chronologie vermerken?", "Erst nach dem Versand: ODIN trägt den Text als „Mail gesendet“ mit heutigem Datum ein (Art lässt sich danach ändern).", "Vermerken")) break;
      const ok = await aendern("ereignis_anlegen", [az, { datum: heute(), art: "mail_aus", titel: (b && b.value) || "Schreiben", text: t.value }]);
      if (ok) meldung("In der Chronologie vermerkt.");
      break;
    }
    case "dossier-kopieren": {
      const d = R.dossier.get(az);
      if (d && d.text && await kopiere(d.text)) meldung("Dossier kopiert – in Claude einfügen und muster-recht-einstieg nutzen."); else meldung("Kopieren hat nicht geklappt.", true);
      break;
    }
    case "dossier-speichern":
      try { const r = await ruf("dossier_speichern", az, { ...R.dossierOpt }); meldung("Gespeichert im Ordner der Akte: " + r.datei); }
      catch (e) { meldung(String(e.message || e), true); }
      break;
  }
});

document.addEventListener("change", async (ev) => {
  if (!istMeineSeite()) return;
  const t = ev.target;
  if (!t.closest || !t.closest("#inhalt")) return;
  const az = azAusHash(), a = R.akten.get(az);
  if (t.dataset.still) { stillSpeichern(t); return; }
  if (t.dataset.rfAuswahl === "typ") { R.typ = t.value; neuZeichnen(); return; }
  if (t.dataset.rfAuswahl === "bald") { R.bald = t.checked; neuZeichnen(); return; }
  if (t.dataset.rfSchritt) { await aendern("schritt_abhaken", [az, t.dataset.rfSchritt, t.checked]); return; }
  if (t.dataset.dossierOpt) { R.dossierOpt[t.dataset.dossierOpt] = t.checked; R.dossier.delete(az); neuZeichnen(); return; }
  if (!a) return;
  if (t.dataset.rfFeld) {
    const pfad = t.dataset.rfFeld;
    if (pfad === "titel" && !t.value.trim()) { t.value = a.titel; return; }
    await aendern("aendern", [az, feldAenderung(pfad, t.value)]);
    return;
  }
  if (t.dataset.dokFeld) { await aendern("dokument_aendern", [az, t.dataset.id, { [t.dataset.dokFeld]: t.value }]); return; }
  if (t.dataset.belegFeld) { await aendern("beleg_aendern", [az, t.dataset.id, { [t.dataset.belegFeld]: t.value }]); return; }
  if (t.dataset.belegDazu !== undefined && t.value) {
    const b = a.belege.find((x) => x.id === t.dataset.belegDazu);
    if (b) await aendern("beleg_aendern", [az, b.id, { belege: b.belege.concat(t.value) }]);
  }
});

let suchTimer;
document.addEventListener("input", (ev) => {
  if (!istMeineSeite()) return;
  const t = ev.target;
  if (!t.closest || !t.closest("#inhalt")) return;
  if (t.tagName === "TEXTAREA") groesse(t);
  if (t.dataset.still) {
    const schluessel = azAusHash() + ":" + t.dataset.still;
    clearTimeout(stillTimer.get(schluessel));
    stillTimer.set(schluessel, setTimeout(() => stillSpeichern(t), 1200));
    speicherAnzeige("Ungespeichert …");
  }
  if (t.dataset.rfSuche) { R.suche = t.value; clearTimeout(suchTimer); suchTimer = setTimeout(neuZeichnen, 150); }
});

document.addEventListener("submit", async (ev) => {
  const form = ev.target.closest("#inhalt [data-rf-form]");
  if (!form || !istMeineSeite()) return;
  ev.preventDefault();
  const art = form.dataset.rfForm, fd = new FormData(form), az = azAusHash();
  const knopf = form.querySelector('button[type="submit"]');
  if (knopf) knopf.disabled = true;
  try {
    if (art === "person") {
      const neu = await rufP("person_anlegen", { name: fd.get("name") });
      await window.odinAnmelden(neu.id);                // neue Person: PIN festlegen im Tresor
      zuruecksetzen(); ["odin-ich", "odin-ich-urlaub"].forEach((n) => window.dispatchEvent(new Event(n)));
      meldung("Hallo " + neu.name.split(" ")[0] + "!");
      nachLaden(ladeStart());
    }
    if (art === "frist") {
      const vorlage = R.vorlage.get(az) || {};
      const eingabe = { titel: fd.get("titel"), art: fd.get("art"), datum: fd.get("datum"), vorfrist_tage: fd.get("vorfrist_tage") || null };
      if (vorlage.berechnung) eingabe.berechnung = vorlage.berechnung;
      const ok = await aendern("frist_anlegen", [az, eingabe], () => { form.reset(); R.vorlage.delete(az); R.rechner.delete(az); });
      if (ok) meldung("Frist eingetragen – sie steht jetzt auch in „Heute & Woche“.");
    }
    if (art === "rechnen") {
      const x = await ruf("frist_rechnen", fd.get("von"), fd.get("anzahl"), fd.get("einheit"));
      R.rechner.set(az, { ...x, von: fd.get("von"), anzahl: fd.get("anzahl"), einheit: fd.get("einheit") });
      neuZeichnen();
    }
    if (art === "ereignis") {
      const zeit = fd.get("zeit");
      const eingabe = { datum: fd.get("tag") + (zeit ? "T" + zeit : ""), art: fd.get("art"), titel: fd.get("titel"), text: fd.get("text") || "" };
      if (form.querySelector('input[name="dokumente"]')) eingabe.dokumente = fd.getAll("dokumente");
      const id = form.dataset.id;
      await aendern(id ? "ereignis_aendern" : "ereignis_anlegen", id ? [az, id, eingabe] : [az, eingabe], () => { R.chronoNeu = false; R.ereignisBearbeiten = null; });
    }
    if (art === "beleg") {
      await aendern("beleg_anlegen", [az, { behauptung: fd.get("behauptung"), von: fd.get("von"), beweislast: fd.get("beweislast") || null, status: fd.get("status") }], () => form.reset());
    }
  } catch (e) {
    meldung(String(e.message || e), true);
  } finally {
    if (knopf && knopf.isConnected) knopf.disabled = false;
  }
});

document.addEventListener("keydown", (ev) => {
  if (!istMeineSeite() || document.querySelector("dialog[open]")) return;
  if (ev.key === "Escape" && (R.chronoNeu || R.ereignisBearbeiten)) { R.chronoNeu = false; R.ereignisBearbeiten = null; neuZeichnen(); }
  if (ev.key === "Enter" && ev.target.matches && ev.target.matches(".rf-titel")) { ev.preventDefault(); ev.target.blur(); }
});
document.addEventListener("focusout", (ev) => {
  const t = ev.target;
  if (t && t.dataset && t.dataset.still && stillTimer.has(azAusHash() + ":" + t.dataset.still)) stillSpeichern(t);
});

function zuruecksetzen() { R.start = null; R.akten.clear(); R.fehler = ""; R.dossier.clear(); R.entwuerfe.clear(); R.vorschau.clear(); }
addEventListener("odin-ich", () => { zuruecksetzen(); zaehlerBald(); });
addEventListener("odin-ich-urlaub", () => zuruecksetzen());

/* Beim Betreten frisch laden (Änderungen anderer Rechner); Formulare gehören zu ihrer Akte */
let letzteAkte = "";
addEventListener("hashchange", () => {
  if (!istMeineSeite()) return;
  const az = azAusHash();
  if (az !== letzteAkte) { R.chronoNeu = false; R.ereignisBearbeiten = null; R.chronoArt = ""; R.dokArt = ""; letzteAkte = az; }
  if (az) { R.dossier.delete(az); nachLaden(ladeAkte(az)); }
  else if (R.start) nachLaden(ladeStart());
});

/* Zurück ins Fenster: höchstens alle 20 Sekunden frisch laden – nicht, solange jemand tippt */
let zuletzt = 0;
addEventListener("focus", () => {
  if (Date.now() - zuletzt < 20000) return;
  zuletzt = Date.now();
  zaehlerBald();
  if (!istMeineSeite() || document.querySelector("dialog[open]")) return;
  const aktiv = document.activeElement;
  if (aktiv && aktiv.closest && aktiv.closest("#inhalt input, #inhalt textarea, #inhalt select")) return;
  const az = azAusHash();
  nachLaden(az ? ladeAkte(az) : ladeStart());
});

/* ------------------------------------------------------------ Anmelden bei der Navigation */
window.ODIN_SEITEN = window.ODIN_SEITEN || {};
window.ODIN_SEITEN.rechtsfaelle = { render: seiteListe, menue: () => "rechtsfaelle" };
window.ODIN_SEITEN.rechtsfall = { render: seiteAkte, menue: () => "rechtsfaelle" };
if (istMeineSeite() && typeof window.cockpitZeichne === "function") window.cockpitZeichne();
const anfangen = () => { zaehlerLaden(); setInterval(zaehlerLaden, 5 * 60 * 1000); };
if (window.pywebview && window.pywebview.api) anfangen(); else addEventListener("pywebviewready", anfangen, { once: true });
})();
