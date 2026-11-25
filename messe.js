/* ODIN · Messe-Personal (ABF 2027, Hausmesse)
   Personalplanung für die Messe: eine Zeile je Person – Einsatzzeitraum, Verkaufsbereiche, Hotel, Wohnmobil, Essen,
   Westengröße. Eigene Gestaltung (messe.css, nur unter #/messe aktiv), die ODIN-Seitenleiste bleibt.
   Daten: tirge_helfer/messe.py über messe_aufruf, gespeichert im Ordner „Fahrzeuge“ unter _ODIN/Messen/<messe>/.
   Rechte prüft der Server: lesen alle, ändern die Verwalter (Urlaubs-Genehmiger); im Browser nur lesen und CSV.
   Seiten: #/messe (ABF 2027), #/messe/<messe> (z. B. hausmesse-2027). Eingehängt über window.ODIN_SEITEN.
   Sicherheit: jeder Text geht durch esc() – auch in Attributen; IDs nur nach Muster. */
(() => {
"use strict";

const M = {
  messe: "abf-2027",      // Schlüssel der angezeigten Messe
  daten: null,            // Antwort von start()
  fehler: "",
  ladeFuer: "",           // Messe, für die gerade geladen wird
  personenWahl: null,     // Personen aus ODIN, falls noch niemand ausgewählt ist
};

const ID = /^[0-9a-f]{12}$/;                       // Eintrag der Personalplanung
const PERSON = /^[0-9a-f]{6,32}$/;                 // Person aus ODIN (personen.json)
const MESSE = /^[a-z0-9]+(-[a-z0-9]+){0,4}$/;
const esc = (s) => String(s ?? "").replace(/[&<>"'`]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;", "`": "&#96;" }[c]));
const meldung = (t, f) => { if (typeof zeigeMeldung === "function") zeigeMeldung(t, f ? "x" : "check", !!f); };
const hashTeile = () => (location.hash || "").slice(2).split("/").map((t) => { try { return decodeURIComponent(t); } catch (e) { return ""; } });
const istMeineSeite = () => hashTeile()[0] === "messe";
const imBrowser = () => !!(window.pywebview && window.pywebview.web) || document.documentElement.dataset.web === "1";
const darf = () => !!(M.daten && M.daten.darf_schreiben) && !imBrowser();
const neu = () => { if (typeof window.cockpitZeichne === "function") window.cockpitZeichne(); };
const personenText = (n) => n + (n === 1 ? " Person" : " Personen");

/* ------------------------------------------------------------ Schnittstelle */
async function ruf(aktion, ...args) {
  const api = window.pywebview && window.pywebview.api;
  if (!api || typeof api.messe_aufruf !== "function") throw new Error("Die Messe-Personalplanung ist gerade nicht erreichbar.");
  const r = await api.messe_aufruf(aktion, args);
  if (!r || !r.ok) { const e = new Error((r && r.fehler) || "Unbekannter Fehler"); e.abgebrochen = !!(r && r.abgebrochen); throw e; }
  return r.daten;
}

function laden() {
  if (M.ladeFuer === M.messe) return;
  if (!(window.pywebview && window.pywebview.api)) {           // Programm noch nicht bereit: danach laden
    addEventListener("pywebviewready", () => { if (istMeineSeite()) neu(); }, { once: true });
    return;
  }
  const messe = M.ladeFuer = M.messe;
  ruf("start", messe).then((d) => {
    if (messe !== M.messe) return;
    M.daten = d; M.fehler = ""; M.personenWahl = null;
  }).catch(async (e) => {
    if (messe !== M.messe) return;
    M.fehler = String(e.message || e);
    if (/wer du bist/i.test(M.fehler)) {
      try { const p = await window.pywebview.api.projekte_aufruf("personen", []); M.personenWahl = (p && p.ok && Array.isArray(p.daten)) ? p.daten : []; }
      catch (x) { M.personenWahl = []; }
    }
  }).finally(() => { if (M.ladeFuer === messe) M.ladeFuer = ""; if (istMeineSeite()) neu(); });
}

/* ------------------------------------------------------------ Bausteine */
const pille = (wert) => '<span class="ms-wert ' + (wert === "Ja" ? "ja" : wert === "Nein" ? "nein" : "offen") + '">' + esc(wert) + "</span>";

function kopf(info) {
  const messen = (M.daten && M.daten.messen) || [{ id: "abf-2027", name: "ABF 2027" }];
  const umschalter = messen.length > 1 ? '<nav class="ms-umschalter" aria-label="Messe">' + messen.map((x) =>
    '<a href="#/messe' + (x.id === "abf-2027" ? "" : "/" + esc(x.id)) + '" aria-current="' + (x.id === M.messe ? "page" : "false") + '">' + esc(x.name) + "</a>").join("") + "</nav>" : "";
  const zeile = [info.zeitraum, info.ort].filter(Boolean).map(esc).join(" · ");
  return '<header class="ms-kopf"><div class="ms-breite">' +
    '<div class="ms-kopf-oben"><span class="ms-marke">CARAVAN MUSTER</span>' + umschalter + "</div>" +
    '<p class="ms-messe">' + esc(info.titel || info.name) + "</p>" +
    '<h1>Personalplanung</h1>' +
    '<p class="ms-zeile">' + zeile + "</p></div></header>";
}

function tabelle(d) {
  const zeilen = d.eintraege.map((e) => '<tr data-id="' + esc(e.id) + '">' +
    '<td class="ms-nr"><span>' + esc(e.nr) + "</span></td>" +
    '<td class="ms-name">' + esc(e.name) + "</td>" +
    '<td class="ms-zeitraum">' + (e.zeitraum ? esc(e.zeitraum) : '<span class="ms-leer">–</span>') + "</td>" +
    '<td class="ms-bereiche">' + (e.bereiche.length ? e.bereiche.map((b) => '<span class="ms-chip">' + esc(b) + "</span>").join("") : '<span class="ms-leer">–</span>') + "</td>" +
    "<td>" + pille(e.hotel) + "</td><td>" + pille(e.wohnmobil) + "</td><td>" + pille(e.essen) + "</td>" +
    '<td class="ms-weste">' + (e.weste ? esc(e.weste) : '<span class="ms-leer">–</span>') + "</td>" +
    '<td class="ms-aktion">' + (darf()
      ? '<button type="button" class="ms-link" data-ms="bearbeiten" data-id="' + esc(e.id) + '" aria-label="' + esc(e.name) + ' bearbeiten">Bearbeiten</button>' +
        '<button type="button" class="ms-link ms-weg" data-ms="entfernen" data-id="' + esc(e.id) + '" aria-label="' + esc(e.name) + ' entfernen">Entfernen</button>'
      : '<span class="ms-leer">–</span>') + "</td></tr>").join("");
  const leer = '<tr class="ms-leer-zeile"><td colspan="9"><b>Noch niemand eingetragen.</b> ' +
    (darf() ? "Mit „+ Person hinzufügen“ die erste Person anlegen." : "Die Verwalter tragen das Messe-Personal ein.") + "</td></tr>";
  return '<div class="ms-tabelle-rahmen" tabindex="0" role="region" aria-label="Personalübersicht"><table class="ms-tabelle"><thead><tr>' +
    '<th class="ms-nr">Nr.</th><th>Name</th><th>Einsatz&shy;zeitraum</th><th>Verkaufs&shy;bereiche</th><th>Hotel benötigt</th><th>Mit Wohnmobil</th><th>Beim Essen dabei</th><th>Westen&shy;größe</th><th class="ms-aktion">Aktion</th>' +
    "</tr></thead><tbody>" + (zeilen || leer) + "</tbody></table></div>";
}

function summen(d) {
  const s = d.summe;
  if (!s.personen) return "";
  return '<dl class="ms-summen">' +
    "<div><dt>Hotel benötigt</dt><dd>" + esc(s.hotel) + "</dd></div>" +
    "<div><dt>Mit Wohnmobil</dt><dd>" + esc(s.wohnmobil) + "</dd></div>" +
    "<div><dt>Beim Essen dabei</dt><dd>" + esc(s.essen) + "</dd></div>" +
    '<div class="' + (s.offen ? "ms-offen" : "") + '"><dt>Offene Angaben</dt><dd>' + esc(s.offen) + "</dd></div></dl>";
}

function hinweise(d) {
  const h = [];
  if (imBrowser()) h.push("Im Browser lässt sich die Liste ansehen und exportieren. Ändern geht am Rechner in ODIN.");
  const namen = (d.bearbeiter || []).map((id) => ((d.personen || []).find((p) => p.id === id) || {}).name).filter(Boolean);
  if (!imBrowser() && !d.darf_schreiben) h.push(namen.length ? "Ändern können " + namen.join(", ") + ". Du siehst die Liste und kannst sie exportieren."
    : "Ändern können die Verwalter (die Urlaubs-Genehmiger). Du siehst die Liste und kannst sie exportieren.");
  else if (!imBrowser() && d.verwalter_fehlt) h.push("Noch sind keine Bearbeiter festgelegt – bis dahin darf jede Person die Liste ändern. Lege sie über „Bearbeiter“ fest.");
  if (!d.gemeinsam) h.push("Der Ordner „Fahrzeuge“ ist nicht verbunden: die Liste liegt nur auf diesem Rechner.");
  if (d.kaputt) h.push(d.kaputt + (d.kaputt === 1 ? " Datei ist" : " Dateien sind") + " gerade nicht lesbar (OneDrive synchronisiert noch?) und fehlen in der Liste.");
  return h.map((t) => '<p class="ms-hinweis">' + esc(t) + "</p>").join("");
}

/* ------------------------------------------------------------ Seite */
function seite(rest) {
  const gewuenscht = String(rest || "").split("/")[0] || "abf-2027";
  if (MESSE.test(gewuenscht) && gewuenscht !== M.messe) { M.messe = gewuenscht; M.daten = null; M.fehler = ""; }
  const d = M.daten;
  const info = d ? d.messe : { titel: "ABF 2027", zeitraum: "10. bis 14. Februar 2027", ort: "Messegelände Hannover" };
  let inhalt;
  if (M.fehler && M.personenWahl) {
    inhalt = '<section class="ms-karte ms-wer"><h2>Wer bist du?</h2><p>Die Personalplanung sehen alle, die in ODIN angemeldet sind (mit PIN oder Microsoft).</p>' +
      (M.personenWahl.length ? '<div class="ms-wer-liste">' + M.personenWahl.map((p) => '<button type="button" class="ms-knopf" data-ms="ich" data-id="' + esc(p.id) + '">' + esc(p.name) + "</button>").join("") + "</div>"
        : '<p><a href="#/projekte">Unter „Alle Projekte“ die eigene Person anlegen.</a></p>') + "</section>";
  } else if (M.fehler) {
    inhalt = '<section class="ms-karte ms-wer"><h2>Personalplanung gerade nicht erreichbar</h2><p>' + esc(M.fehler) + '</p><button type="button" class="ms-knopf" data-ms="neu-laden">Nochmal versuchen</button></section>';
  } else if (!d) {
    laden();
    inhalt = '<section class="ms-karte"><div class="laden" aria-label="Wird geladen"><i class="skelett" style="width:40%"></i><i class="skelett"></i><i class="skelett" style="width:70%"></i></div></section>';
  } else {
    inhalt = '<section class="ms-karte" aria-labelledby="ms-titel">' +
      '<div class="ms-karte-kopf"><div><h2 id="ms-titel">Personalübersicht</h2><p class="ms-anzahl" aria-live="polite">' + esc(personenText(d.summe.personen)) + "</p></div>" +
      '<div class="ms-aktionen">' + (d.darf_bearbeiter && !imBrowser() ? '<button type="button" class="ms-knopf ms-leise" data-ms="bearbeiter">Bearbeiter</button>' : "") +
      '<button type="button" class="ms-knopf" data-ms="export">Excel-CSV exportieren</button>' +
      (darf() ? '<button type="button" class="ms-knopf ms-primaer" data-ms="neu">+ Person hinzufügen</button>' : "") + "</div></div>" +
      hinweise(d) + tabelle(d) + summen(d) + "</section>";
  }
  return { html: '<div class="ms">' + kopf(info) + '<div class="ms-flaeche"><div class="ms-breite">' + inhalt + "</div></div></div>" };
}

/* ------------------------------------------------------------ Formular */
function formular(e) {
  const d = M.daten, neuAnlage = !e;
  e = e || { name: "", zeitraum: "", bereiche: [], hotel: "Offen", wohnmobil: "Offen", essen: "Offen", weste: "" };
  const wahl = (name, titel) => '<fieldset class="ms-feld"><legend>' + esc(titel) + '</legend><div class="ms-segment">' + d.auswahl.map((w) =>
    '<label><input type="radio" name="' + name + '" value="' + esc(w) + '"' + (e[name] === w ? " checked" : "") + "><span>" + esc(w) + "</span></label>").join("") + "</div></fieldset>";
  const dlg = document.createElement("dialog");
  dlg.className = "ms-dialog";
  dlg.setAttribute("aria-labelledby", "ms-dialog-titel");
  dlg.innerHTML = '<form method="dialog" novalidate>' +
    '<div class="ms-dialog-kopf"><h2 id="ms-dialog-titel">' + (neuAnlage ? "Person hinzufügen" : "Person bearbeiten") + "</h2>" +
      '<p>' + esc((d.messe.titel || d.messe.name) + " · " + [d.messe.zeitraum, d.messe.ort].filter(Boolean).join(" · ")) + "</p></div>" +
    '<label class="ms-feld"><span>Name <b class="ms-pflicht" aria-hidden="true">*</b></span><input name="name" maxlength="80" required autocomplete="off" list="ms-namen" value="' + esc(e.name) + '" placeholder="Vor- und Nachname"></label>' +
    '<datalist id="ms-namen">' + (d.namen || []).map((n) => '<option value="' + esc(n) + '">').join("") + "</datalist>" +
    '<div class="ms-feld-reihe"><label class="ms-feld"><span>Einsatzzeitraum</span><input name="zeitraum" maxlength="60" autocomplete="off" value="' + esc(e.zeitraum) + '" placeholder="z. B. 10. bis 12.02."></label>' +
      '<label class="ms-feld ms-schmal"><span>Westengröße</span><input name="weste" maxlength="20" autocomplete="off" value="' + esc(e.weste) + '" placeholder="z. B. L"></label></div>' +
    '<fieldset class="ms-feld"><legend>Verkaufsbereiche <small>(Mehrfachauswahl)</small></legend><div class="ms-bereich-wahl">' + d.bereiche.map((b) =>
      '<label><input type="checkbox" name="bereiche" value="' + esc(b) + '"' + (e.bereiche.includes(b) ? " checked" : "") + "><span>" + esc(b) + "</span></label>").join("") + "</div></fieldset>" +
    '<div class="ms-feld-drei">' + wahl("hotel", "Hotel benötigt") + wahl("wohnmobil", "Mit Wohnmobil") + wahl("essen", "Beim Essen dabei") + "</div>" +
    '<p class="ms-fehler" role="alert" hidden></p>' +
    '<div class="ms-dialog-fuss"><button type="button" class="ms-knopf" data-schliessen>Abbrechen</button><button type="submit" class="ms-knopf ms-primaer">Speichern</button></div></form>';
  document.body.appendChild(dlg);
  const form = dlg.querySelector("form"), fehler = dlg.querySelector(".ms-fehler");
  dlg.addEventListener("close", () => dlg.remove());                               // Abbrechen/Esc verwirft alles
  dlg.addEventListener("click", (ev) => { if (ev.target.closest("[data-schliessen]")) dlg.close(); });
  form.addEventListener("input", () => { fehler.hidden = true; });
  form.addEventListener("submit", async (ev) => {
    ev.preventDefault();
    const fd = new FormData(form);
    const eingabe = { name: String(fd.get("name") || "").trim(), zeitraum: fd.get("zeitraum") || "", weste: fd.get("weste") || "",
      bereiche: fd.getAll("bereiche"), hotel: fd.get("hotel") || "Offen", wohnmobil: fd.get("wohnmobil") || "Offen", essen: fd.get("essen") || "Offen" };
    if (!eingabe.name) { fehler.textContent = "Bitte den Namen eingeben."; fehler.hidden = false; form.elements.name.focus(); return; }
    const knopf = form.querySelector('button[type="submit"]');
    knopf.disabled = true;
    try {
      M.daten = neuAnlage ? await ruf("anlegen", M.messe, eingabe) : await ruf("aendern", M.messe, e.id, eingabe);
      dlg.close();
      neu();
      meldung(neuAnlage ? eingabe.name + " hinzugefügt" : "Gespeichert");
    } catch (x) { fehler.textContent = String(x.message || x); fehler.hidden = false; }
    finally { knopf.disabled = false; }
  });
  dlg.showModal();
  form.elements.name.focus();
}

/* ------------------------------------------------------------ Export */
async function exportieren() {
  try {
    if (!imBrowser()) {                                                          // im Fenster: Speichern-Dialog
      const r = await ruf("csv_speichern", M.messe);
      meldung("Gespeichert: " + String(r.pfad || "").split(/[\\/]/).pop());
      return;
    }
    const x = await ruf("csv", M.messe);                                           // im Browser: Datei herunterladen
    const url = URL.createObjectURL(new Blob(["\ufeff" + x.text], { type: "text/csv;charset=utf-8" }));
    const a = document.createElement("a");
    a.href = url; a.download = String(x.name || "Personalplanung.csv").replace(/[^\w.\-]/g, "_");
    a.click();                     // nicht ins Dokument hängen: der Link-Wächter (cockpit.js) ließe blob: nicht durch
    setTimeout(() => URL.revokeObjectURL(url), 2000);
  } catch (e) { if (!e.abgebrochen) meldung(String(e.message || e), true); }
}

/* ------------------------------------------------------------ Bearbeiter festlegen */
function bearbeiterDialog() {
  const d = M.daten; const gewaehlt = new Set(d.bearbeiter || []);
  const dlg = document.createElement("dialog");
  dlg.className = "ms-dialog";
  dlg.setAttribute("aria-labelledby", "ms-bearb-titel");
  dlg.innerHTML = '<form method="dialog" novalidate><div class="ms-dialog-kopf"><h2 id="ms-bearb-titel">Bearbeiter festlegen</h2>' +
    "<p>Nur diese Personen dürfen die Messe-Personalplanung ändern (gilt für ABF und Hausmesse). Ansehen und exportieren können alle.</p></div>" +
    '<fieldset class="ms-feld"><legend>Personen</legend><div class="ms-bereich-wahl">' + (d.personen || []).map((p) =>
      '<label><input type="checkbox" name="bearbeiter" value="' + esc(p.id) + '"' + (gewaehlt.has(p.id) ? " checked" : "") + "><span>" + esc(p.name) + "</span></label>").join("") + "</div></fieldset>" +
    '<p class="ms-fehler" role="alert" hidden></p>' +
    '<div class="ms-dialog-fuss"><button type="button" class="ms-knopf" data-schliessen>Abbrechen</button><button type="submit" class="ms-knopf ms-primaer">Speichern</button></div></form>';
  document.body.appendChild(dlg);
  const form = dlg.querySelector("form"), fehler = dlg.querySelector(".ms-fehler");
  dlg.addEventListener("close", () => dlg.remove());
  dlg.addEventListener("click", (ev) => { if (ev.target.closest("[data-schliessen]")) dlg.close(); });
  form.addEventListener("submit", async (ev) => {
    ev.preventDefault();
    const ids = [...form.querySelectorAll("input[name=bearbeiter]:checked")].map((i) => i.value).filter((v) => PERSON.test(v));
    try { M.daten = await ruf("bearbeiter_setzen", ids); dlg.close(); neu(); meldung("Bearbeiter gespeichert"); }
    catch (e) { fehler.textContent = String(e.message || e); fehler.hidden = false; }
  });
  dlg.showModal();
}

/* ------------------------------------------------------------ Ereignisse (einmal, per Delegation) */
document.addEventListener("click", async (ev) => {
  const k = ev.target.closest && ev.target.closest("#inhalt [data-ms]");
  if (!k || !istMeineSeite()) return;
  const art = k.dataset.ms, id = k.dataset.id || "";
  const eintrag = M.daten && ID.test(id) ? M.daten.eintraege.find((e) => e.id === id) : null;
  if (art === "neu-laden") { M.fehler = ""; M.daten = null; neu(); }
  else if (art === "ich" && PERSON.test(id)) {
    try { await window.odinAnmelden(id); window.dispatchEvent(new Event("odin-ich")); M.fehler = ""; M.daten = null; neu(); }
    catch (e) { meldung(String(e.message || e), true); }
  }
  else if (art === "export") exportieren();
  else if (art === "bearbeiter" && M.daten) bearbeiterDialog();
  else if (art === "neu" && M.daten) formular(null);
  else if (art === "bearbeiten" && eintrag) formular(eintrag);
  else if (art === "entfernen" && eintrag) {
    if (!confirm("„" + eintrag.name + "“ aus der Personalplanung entfernen?")) return;
    k.disabled = true;
    try { M.daten = await ruf("entfernen", M.messe, eintrag.id); neu(); meldung(eintrag.name + " entfernt"); }
    catch (e) { k.disabled = false; meldung(String(e.message || e), true); }
  }
});
// Wer am Rechner sitzt, hat gewechselt (z. B. in Projekten): neu laden
addEventListener("odin-ich", () => { M.daten = null; M.fehler = ""; if (istMeineSeite()) neu(); });

/* ------------------------------------------------------------ Anmelden bei der Navigation */
window.ODIN_SEITEN = window.ODIN_SEITEN || {};
window.ODIN_SEITEN.messe = { render: seite, menue: () => "messe" };
if (istMeineSeite() && typeof window.cockpitZeichne === "function") window.cockpitZeichne();
})();
