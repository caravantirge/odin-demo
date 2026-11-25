"use strict";
// Reiter "Auftragsbestätigungen" (Arbeitsliste), "Fahrzeuge", Dialoge und Design-Schalter.
// Nutzt $, icon, esc, api, zeigeMeldung, aktionen und bereichAktiv aus app.js.

let ablage = { ordner: "", gueltig: false, im_eingang: 0, hersteller: [], jahr_vorschlag: new Date().getFullYear() };
let abZeilen = null;            // null = noch nicht geladen
let abFilter = "offen";
let abSuche = "";
let abHersteller = "";
let abGewaehlt = null;          // Pfad des gewählten Fahrzeugs
let abPrueftGerade = false;
let abDetail = null;            // geladene Details des gewählten Fahrzeugs
let abFreierVergleich = null;   // {datei, gegen}: Einzelansicht einer AB; null = Gesamtprüfung
let verlaufOffenFuer = null;    // Fahrzeug, bei dem „Alle ABs“ aufgeklappt bleiben soll
let abHalten = null;            // nach „In Klärung“: dieses Fahrzeug bleibt rechts stehen, bis ein anderes gewählt wird
let abHaltenIndex = 0;          // seine Stelle in der Liste – dort geht es danach weiter
const notizEntwurf = { pfad: null, text: "" };   // noch nicht gespeicherte Notiz (übersteht Neuzeichnen)
let vergleichNr = 0;            // nur das Ergebnis des letzten Vergleichs anzeigen
let fahrzeugListe = null;
let letzteZuordnungen = { syscara: [], nur_ab: [] };
const zuordnen = { zeile: null, ort: null };   // Syscara-Zeile im Dialog „Zuordnen“ und wo sie herkommt
let fzJahr = "alle";
let fzSuche = "";
const dialogZustand = { hersteller: "Hersteller1", datei: null };
const vergleichDateien = [null, null];

const NUMMERN_TEXTE = {
  Hersteller1: ["Interne ID", "z. B. DETKW00189", "Auftragsnummer Hersteller1", "z. B. 1431110, steht oben auf der AB"],
  Hersteller2: ["Interne ID", "z. B. SLKW00243", "Auftragsnummer Hersteller2", "z. B. 11158154, „BelegNr“ auf der AB"],
  "Hersteller3": ["Hersteller3-Auftragsnummer", "z. B. H90897, „Ihre Auftragsnummer“ auf der AB", "Online-Bestellnummer", "z. B. 21366, bekommst du bei der Bestellung"],
};
const STATUS_TEXT = { offen: "Offen", klaerung: "In Klärung", erledigt: "Erledigt" };
const ERGEBNIS_TEXT = { erste: "Erste AB", keine: "Keine Änderung", info: "Nur Info", wichtig: "Wichtige Änderungen", syscara: "Passt zu Syscara" };

// Werte aus den Akten im gemeinsamen Ordner: nie ungeprüft ins HTML – Zahlen als Zahl, alles andere maskiert
const zahlOk = (x) => (Number.isFinite(Number(x)) ? Number(x) : 0);
const datumKurz = (iso) => (typeof iso === "string" && /^\d{4}-\d{2}-\d{2}/.test(iso) ? iso.slice(0, 10).split("-").reverse().join(".") : esc(iso || ""));
const uhrzeit = (iso) => (iso && iso.length >= 16 ? iso.slice(11, 16) : "");
const schluessel = (z) => z.fahrzeug.pfad;
const pfadIn = (ordner, datei) => ordner + (ordner.includes("\\") ? "\\" : "/") + datei;
const kennungVon = (fz) => fz.interne_id || fz.auftragsnummer || fz.name;
const nummerLabel = (fz) => (fz.hersteller === "Hersteller3" ? "Bestellnr." : "Auftragsnr.");
// ABs seit dem verglichenen Stand (ohne geprüfte AB zählt die erste nicht mit – sie ist ja die Vergleichsbasis)
const MAX_KURZ = 5;              // so viele Änderungen stehen in der Liste direkt unter dem Fahrzeug
const neueSeit = (z) => (z.gegen_art === "erste" ? z.neue_abs - 1 : z.neue_abs);

// Zweite Angabe neben der Kennung: Auftragsnummer, bei Fahrzeugen ohne Interne ID der Bestelltext
function zweiteNummer(z) {
  const fz = z.fahrzeug;
  if (fz.interne_id && fz.auftragsnummer) return `${nummerLabel(fz)} ${fz.auftragsnummer}`;
  if (!fz.interne_id) return z.kommission ? `„${z.kommission}“` : "ohne Interne ID";
  return "";
}

function dateienAlsBase64(dateien) {
  return Promise.all([...dateien].map((d) => new Promise((ok, fehler) => {
    const r = new FileReader();
    r.onload = () => ok({ name: d.name, b64: String(r.result).split(",")[1] });
    r.onerror = () => fehler(r.error);
    r.readAsDataURL(d);
  })));
}

// ================= Design =================
const DESIGNS = ["auto", "hell", "dunkel"];
const DESIGN_ICON = { auto: "auto", hell: "sonne", dunkel: "mond" };
const DESIGN_TEXT = { auto: "automatisch (wie das System)", hell: "hell", dunkel: "dunkel" };

function setzeStil(wert) {
  const stil = wert === "v2" ? "v2" : "v3";
  document.documentElement.dataset.stil = stil;
  document.querySelectorAll("[data-stil-wahl]").forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.stilWahl === stil)));
}

function setzeDesign(wert) {
  document.documentElement.dataset.theme = wert;
  const k = $("#design-knopf");
  k.innerHTML = icon(DESIGN_ICON[wert]);
  k.title = `Design: ${DESIGN_TEXT[wert]} – klicken zum Wechseln`;
}

// ================= Reiter =================
function zeigeBereich(name) {
  document.querySelectorAll(".bereich").forEach((b) => { b.hidden = b.dataset.bereich !== name; });
  // ODIN 2: Cockpit-Fläche weg, Bereiche her, Seitenleiste markieren, Adresse mitführen
  $("#inhalt").hidden = true;
  $("#odin-bereiche").hidden = false;
  document.querySelectorAll(".seitenleiste a[data-seite]").forEach((a) => {
    const aktiv = a.dataset.seite === name;
    a.classList.toggle("aktiv", aktiv);
    if (aktiv) a.setAttribute("aria-current", "page"); else a.removeAttribute("aria-current");
  });
  if (location.hash !== "#/" + name) history.replaceState(null, "", "#/" + name);
  if (name === "preisschilder") render();
  if (name === "abs") ladeAbs().then(frischeAbDetail);      // Syscara-Abgleich kann sich im anderen Reiter geändert haben
  if (name === "fahrzeuge") ladeAblageStatus().then(ladeFahrzeuge);
  if (name === "ausstattung") ladeAusstattung();
  renderKopfZaehler();
}

function renderKopfZaehler() {
  const z = abZeilen || [];
  const offen = z.filter((x) => x.status === "offen").length;
  const reiterZahl = $("#ab-zahl");
  reiterZahl.textContent = offen;
  reiterZahl.hidden = !offen;
  reiterZahl.classList.toggle("rot", offen > 0);
  const syOffen = z.filter((x) => x.syscara && !x.syscara.ok).length;      // Abweichung oder unsicher
  $("#sy-zahl").textContent = syOffen;
  $("#sy-zahl").hidden = !syOffen;
  $("#sy-zahl").classList.toggle("rot", syOffen > 0);
  if (bereichAktiv("ausstattung")) {
    $("#zaehler").innerHTML = syZaehlerHtml();
  } else if (bereichAktiv("abs")) {
    const klaerung = z.filter((x) => x.status === "klaerung").length;
    $("#zaehler").innerHTML = abZeilen ? `<b>${offen}</b> offen · <b>${klaerung}</b> in Klärung · <b>${z.length}</b> Fahrzeuge` : "";
  } else if (bereichAktiv("fahrzeuge")) {
    $("#zaehler").innerHTML = fahrzeugListe ? `<b>${fahrzeugListe.length}</b> Fahrzeugordner` : "";
  }
}

async function ladeAblageStatus() {
  try { ablage = await api().ablage_status(); } catch (e) { /* Schnittstelle noch nicht bereit */ }
  const zahl = $("#eingang-zahl");
  zahl.textContent = ablage.im_eingang;
  zahl.hidden = !ablage.im_eingang;
  $("#knopf-pruefen").disabled = !ablage.gueltig || abPrueftGerade;
  $("#ab-ordner-knopf").title = ablage.gueltig ? `Ordner „Fahrzeuge“: ${ablage.ordner}\nKlicken zum Ändern` : "Ordner „Fahrzeuge“ wählen";
}

function einrichtenHtml() {
  return `
    <section class="leer">
      <div class="leer-text">
        <span class="schraege" aria-hidden="true"></span>
        <h1>Ordner „Fahrzeuge“ verbinden</h1>
        <p>Wähle den SharePoint-Ordner „Fahrzeuge“, den OneDrive auf diesen Rechner synchronisiert.
          Dort legt das Programm die Fahrzeugordner an, sortiert neue ABs ein und merkt sich den Prüfstatus.</p>
        <div class="gruppe">
          <button class="knopf primaer" data-aktion="ablageWaehlen">${icon("folder")}Ordner wählen</button>
        </div>
      </div>
      <ol class="leer-schritte">
        <li><b>AB kommt an</b><span>Power Automate legt jede AB aus den Hersteller-Postfächern in „AB-Eingang“.</span></li>
        <li><b>Prüfen</b><span>Jede AB kommt in ihren Fahrzeugordner. Pro Fahrzeug wird die neueste AB gegen die zuletzt geprüfte verglichen.</span></li>
        <li><b>Abarbeiten</b><span>Ein Eintrag pro Fahrzeug mit allen Änderungen seit deiner letzten Prüfung. Erledigen oder in Klärung setzen.</span></li>
      </ol>
    </section>`;
}

// ================= Auftragsbestätigungen: Arbeitsliste (ein Eintrag pro Fahrzeug) =================
async function ladeAbs({ still = false } = {}) {
  await ladeAblageStatus();
  if (!ablage.gueltig) { abZeilen = []; renderAbs(); return; }
  if (!abZeilen && !still) renderAbs();       // Skelett beim ersten Laden
  try {
    abZeilen = await api().ab_uebersicht();
    const fehlen = await api().ab_uebersprungen();
    if (fehlen.length) {
      zeigeMeldung(`${fehlen.length === 1 ? "Ein Fahrzeug ist" : `${fehlen.length} Fahrzeuge sind`} gerade nicht lesbar (z. B. von OneDrive gesperrt) und fehlt in der Liste – beim nächsten Laden wieder da. ${fehlen[0]}`, "warn", true);
    }
  } catch (e) {
    zeigeMeldung(`Übersicht nicht lesbar: ${e.message || e}`, "x", true);
    abZeilen = abZeilen || [];
  }
  renderAbs();
}

function sichtbareAbs() {
  const s = abSuche.trim().toLowerCase();
  return (abZeilen || [])
    .filter((z) => abFilter === "alle" || z.status === abFilter)
    .filter((z) => !abHersteller || z.fahrzeug.hersteller === abHersteller)
    .filter((z) => !s || `${z.fahrzeug.name} ${z.fahrzeug.hersteller} ${(z.stichworte || []).join(" ")} ${z.notiz || ""} ${z.kommission || ""}`
      .toLowerCase().includes(s))
    .sort((a, b) => (b.eingang || "").localeCompare(a.eingang || "") || a.fahrzeug.name.localeCompare(b.fahrzeug.name));
}

function tagUeberschrift(iso) {
  if (!iso) return "Ohne Datum";
  const tag = new Date(iso.slice(0, 10) + "T12:00:00");
  const heute = new Date(); heute.setHours(12, 0, 0, 0);
  const diff = Math.round((heute - tag) / 86400000);
  if (diff === 0) return "Heute";
  if (diff === 1) return "Gestern";
  return tag.toLocaleDateString("de-DE", { weekday: "short", day: "2-digit", month: "2-digit", year: "numeric" });
}

function ergebnisMarke(z) {
  if (z.status === "erledigt") {
    return `<span class="marke-status ok">${icon("check")}${z.art === "automatisch" ? "automatisch" : z.art === "eingelesen" ? "AB erledigt" : "geprüft"}</span>`;
  }
  if (z.ergebnis === "wichtig") return `<span class="marke-status wichtig">${icon("warn")}${zahlOk(z.wichtig)} wichtig</span>`;
  if (z.ergebnis === "erste") return `<span class="marke-status pruefen">${icon("file")}Syscara</span>`;
  if (z.ergebnis === "info") return `<span class="marke-status neutral">${icon("minus")}Nur Info</span>`;
  return `<span class="marke-status neutral">${icon("check")}Keine Änderung</span>`;
}

function stichwortText(worte = []) {
  const kopf = worte.filter((w) => !w.startsWith("Pos.")), pos = worte.filter((w) => w.startsWith("Pos."));
  const teile = [...kopf];
  if (pos.length) teile.push(pos.length === 1 ? pos[0] : `${pos.length} Positionen`);
  return esc(teile.join(" · "));
}

// Unter der Kennung: erst „Mit Syscara abgleichen“, dann was sich geändert hat – im Klartext
function syscaraZaehler(sy) {
  const teile = [];
  if (zahlOk(sy.abweichung)) teile.push(`${zahlOk(sy.abweichung)} Nummer${zahlOk(sy.abweichung) === 1 ? "" : "n"} abweichend`);
  if (zahlOk(sy.fehlt)) teile.push(`${zahlOk(sy.fehlt)} fehlt`);
  if (zahlOk(sy.unsicher)) teile.push(`${zahlOk(sy.unsicher)} unsicher`);
  if (zahlOk(sy.nur_ab)) teile.push(`${zahlOk(sy.nur_ab)} nur in AB`);
  return teile.join(" · ");
}

function syscaraListenzeile(z) {
  const sy = z.syscara;
  if (sy?.ok) return z.status === "erledigt" ? "" : `<div class="syscara ok">${icon("check")}Passt zu Syscara</div>`;
  if (sy) return `<div class="syscara">${icon("syscara")}Syscara: ${esc(syscaraZaehler(sy))}</div>`;
  return z.ergebnis === "erste" ? `<div class="syscara">${icon("file")}Mit Syscara abgleichen</div>` : "";
}

function zeilenZusatz(z) {
  if (z.status === "erledigt") {
    return `<div class="stichworte">${icon("check")}${z.art === "manuell" ? `${esc(z.von)} · ${datumKurz(z.am)}` : wieGeprueft(z)}</div>${syscaraListenzeile(z)}`;
  }
  let html = syscaraListenzeile(z);
  if (z.status === "klaerung" && z.notiz) html += `<div class="stichworte">${icon("notiz")}${esc(z.notiz)}</div>`;
  const kurz = z.kurz || [];
  if (kurz.length) {
    // bis zu 5 Änderungen ganz, ab 4 etwas kleiner; darüber „… und n weitere Änderungen“
    const mehr = kurz.length - MAX_KURZ;
    html += `<ul class="kurz${kurz.length > 3 ? " eng" : ""}">${kurz.slice(0, MAX_KURZ).map((k) => `<li>${esc(k)}</li>`).join("")}${
      mehr > 0 ? `<li class="mehr">… und ${mehr} weitere Änderung${mehr === 1 ? "" : "en"}</li>` : ""}</ul>`;
  } else if (!html && z.stichworte?.length) {
    html = `<div class="stichworte">${stichwortText(z.stichworte)}</div>`;
  }
  return html;
}

function statusMarkeAb(status) {
  return `<span class="status-pille ${esc(status)}">${esc(STATUS_TEXT[status] || status)}</span>`;
}

function wieGeprueft(g) {
  if (!g) return "";
  if (g.art === "automatisch") return g.gegen_syscara || (g.syscara && !g.gegen) ? "automatisch (passt zu Syscara)" : "automatisch (keine wichtige Änderung)";
  if (g.art === "eingelesen") return "aus „AB erledigt“";
  return `${esc(g.von || "")} · ${datumKurz(g.am)}`;
}

// nurListe: das Detail rechts nicht anfassen (z. B. während dort gerade geklickt wird)
function renderAbs({ nurListe = false } = {}) {
  const f = $("#ab-flaeche");
  renderKopfZaehler();
  zaehleFilter();
  if (!ablage.gueltig) { f.innerHTML = einrichtenHtml(); return; }
  if (!f.querySelector("#ab-liste")) {
    f.innerHTML = `<section class="arbeit"><div class="liste" id="ab-liste" role="listbox" aria-label="Fahrzeuge mit ABs"></div>
      <article class="detail" id="ab-detail"></article></section>`;
  }
  const liste = $("#ab-liste");
  if (abZeilen === null || abPrueftGerade) {
    liste.innerHTML = Array.from({ length: Math.max(3, Math.min(ablage.im_eingang || 3, 8)) }, () =>
      `<div class="zeile skelett"><span class="punkt"></span><span class="infos"><div class="balken" style="width:110px"></div>
       <div class="balken" style="width:200px;margin-top:8px"></div></span><span></span></div>`).join("");
    if (abPrueftGerade) $("#ab-detail").innerHTML = `<p class="erklaerung gross">Prüfe ${zahlOk(ablage.im_eingang) || ""} AB(s) aus dem Eingang …</p>`;
    return;
  }
  const zeilen = sichtbareAbs();
  const gehalten = abHalten && abHalten === abGewaehlt && abZeilen.some((z) => schluessel(z) === abHalten);
  if (!zeilen.length) {
    liste.innerHTML = leereListeHtml();
    if (nurListe) return;
    if (gehalten) renderAbDetail();
    else { abGewaehlt = null; abDetail = null; $("#ab-detail").innerHTML = leeresDetailHtml(); }
    return;
  }
  let html = "", letzterTag = null;
  zeilen.forEach((z, i) => {
    const tag = tagUeberschrift(z.eingang);
    if (tag !== letzterTag) { html += `<div class="gruppen-kopf">${esc(tag)}</div>`; letzterTag = tag; }
    const fz = z.fahrzeug;
    const mehr = neueSeit(z) > 1 ? ` · <b>${neueSeit(z)} neue ABs</b>` : "";
    const vergleich = z.gegen ? `AB ${datumKurz(z.datum)} ↔ ${z.gegen_art === "erste" ? "erste" : "geprüft"} ${datumKurz(z.gegen_datum)}${mehr}`
      : `AB ${datumKurz(z.datum)}${mehr}`;
    html += `<div class="zeile ab-zeile ${esc(z.status)}${schluessel(z) === abGewaehlt ? " gewaehlt" : ""}" role="option"
        data-ab="${esc(schluessel(z))}" style="--i:${Math.min(i, 12)}">
        <span class="punkt ${esc(z.status)}"></span>
        <span class="infos">
          <div class="kennung">${esc(kennungVon(fz))}${zweiteNummer(z) ? `<span class="nummer">${esc(zweiteNummer(z))}</span>` : ""}</div>
          <div class="modell">${esc(fz.hersteller)} · ${vergleich}</div>
          ${zeilenZusatz(z)}
        </span>
        ${ergebnisMarke(z)}
      </div>`;
  });
  const schonDa = new Set([...liste.querySelectorAll("[data-ab]")].map((z) => z.dataset.ab));
  liste.innerHTML = html;
  liste.querySelectorAll("[data-ab]").forEach((z) => { if (schonDa.has(z.dataset.ab)) z.style.animation = "none"; });
  if (nurListe) return;
  if (gehalten || (abGewaehlt && zeilen.some((z) => schluessel(z) === abGewaehlt))) renderAbDetail();
  else waehleAb(schluessel(zeilen[0]));
}

function zaehleFilter() {
  const z = abZeilen || [];
  const anzahl = { offen: 0, klaerung: 0, erledigt: 0, alle: z.length };
  z.forEach((x) => { anzahl[x.status] = (anzahl[x.status] || 0) + 1; });
  document.querySelectorAll("[data-abstatus]").forEach((k) => {
    const name = { offen: "Offen", klaerung: "In Klärung", erledigt: "Erledigt", alle: "Alle" }[k.dataset.abstatus];
    k.innerHTML = `${name}<span class="anzahl">${anzahl[k.dataset.abstatus] || 0}</span>`;
    k.classList.toggle("aktiv", k.dataset.abstatus === abFilter);
  });
}

function leereListeHtml() {
  if (abFilter === "offen" && !abSuche && !abHersteller) {
    return `<div class="liste-leer">${icon("check")}<b>Nichts offen</b>
      <span>${ablage.im_eingang ? `${zahlOk(ablage.im_eingang)} AB(s) warten im Eingang.` : "Alle Fahrzeuge sind auf dem geprüften Stand."}</span>
      ${ablage.im_eingang ? `<button class="knopf primaer" data-aktion="eingangPruefen">${icon("inbox")}Eingang prüfen</button>` : ""}</div>`;
  }
  return `<div class="liste-leer">${icon("search")}<b>Keine Treffer</b><span>Filter oder Suche anpassen.</span></div>`;
}

function leeresDetailHtml() {
  const z = abZeilen || [];
  const auto = z.filter((x) => x.status === "erledigt" && x.art === "automatisch").length;
  return `<div class="detail-leer">
    <span class="schraege" aria-hidden="true"></span>
    <h2>Auftragsbestätigungen</h2>
    <p>Pro Fahrzeug ein Eintrag: Die neueste AB wird gegen die AB verglichen, die du zuletzt geprüft hast – alle Änderungen
      seitdem auf einen Blick. Ohne wichtige Änderung wird das Fahrzeug automatisch erledigt${auto ? ` (bisher ${auto})` : ""}.</p>
    <p class="erklaerung">Tastatur: ↑ ↓ wechseln · E erledigt · K in Klärung · O wieder öffnen</p>
    <p class="erklaerung">ABs, die noch im Outlook-Posteingang liegen: <button class="link" data-aktion="dialogEinlesen">nachträglich einlesen</button></p>
  </div>`;
}

async function waehleAb(key, frei = null) {
  if (abHalten && abHalten !== key) abHalten = null;
  abGewaehlt = key;
  abFreierVergleich = frei;          // {datei, gegen} = Einzelansicht, null = Gesamtprüfung
  document.querySelectorAll("[data-ab]").forEach((z) => z.classList.toggle("gewaehlt", z.dataset.ab === key));
  const zeile = $(`[data-ab="${CSS.escape(key)}"]`);
  if (zeile && !frei) zeile.scrollIntoView({ block: "nearest" });
  const z = (abZeilen || []).find((x) => schluessel(x) === key);
  if (!z) return;
  abDetail = null;
  renderAbDetail();
  try {
    const d = await api().ab_details(z.fahrzeug.pfad, frei?.datei || null, frei ? (frei.gegen ?? null) : null);
    if (abGewaehlt === key && abFreierVergleich === frei) { abDetail = d; renderAbDetail(); }
  } catch (e) {
    $("#ab-detail").innerHTML = `<div class="hinweis fehler">${icon("x")}<span>${esc(e.message || e)}</span></div>`;
  }
}

// Details des gewählten Fahrzeugs neu holen, wenn es noch in der Liste steht
function frischeAbDetail() {
  if (abGewaehlt && (abZeilen || []).some((x) => schluessel(x) === abGewaehlt)) waehleAb(abGewaehlt, abFreierVergleich);
}

function woerter(liste, art) {
  if (!liste.length) return `<span class="leer-wert">–</span>`;
  const gruppen = [];
  for (const [w, g] of liste) {
    const letzte = gruppen[gruppen.length - 1];
    if (letzte && letzte.g === g) letzte.w.push(w); else gruppen.push({ g, w: [w] });
  }
  return gruppen.map(({ g, w }) => (g ? `<mark class="${art}">${esc(w.join(" "))}</mark>` : esc(w.join(" ")))).join(" ");
}

function stummKnopf(a) {
  const daten = `data-bereich="${esc(a.bereich)}" data-art="${esc(a.art)}" data-titel="${esc(a.titel || "")}" data-kurz="${esc(a.kurz || "")}"`;
  if (a.stufe === "wichtig") {
    return `<button class="regel-knopf" data-stumm ${daten} title="Diese Art Änderung künftig nicht mehr als wichtig zählen – für alle Fahrzeuge dieses Herstellers">${icon("stumm")}</button>`;
  }
  if (a.stumm) return `<button class="regel-knopf an" data-laut ${daten} title="Stumm geschaltet – klicken: wieder als wichtig zählen">${icon("stumm")}</button>`;
  return "";
}

function aenderungsTabelle(zeilen, info = false, regeln = false) {
  return `<table class="aenderungen${info ? " info" : ""}">
    <thead><tr><th>Bereich</th><th>Änderung</th><th>Vorher</th><th>Neu</th>${regeln ? "<th></th>" : ""}</tr></thead>
    <tbody>${zeilen.map((a) => `<tr class="${a.stumm ? "stumm" : ""}">
      <td class="bereich-zelle">${esc(a.bereich)}${a.titel && a.titel !== a.alt && a.titel !== a.neu ? `<span class="titel">${esc(a.titel)}</span>` : ""}</td>
      <td>${esc(a.art)}${a.stumm ? `<span class="stumm-marke">stumm</span>` : ""}</td>
      <td class="alt">${woerter(a.alt_w, "weg")}</td><td class="neu">${woerter(a.neu_w, "hinzu")}</td>
      ${regeln ? `<td class="regel-zelle">${stummKnopf(a)}</td>` : ""}</tr>`).join("")}
    </tbody></table>`;
}

function fassungText(v) {
  const teile = [v.belegart || "AB"];
  if (v.fassung) teile.push(`Fassung ${zahlOk(v.fassung)}`);
  return teile.join(" · ");
}

function einzelText(v) {
  const e = v.einzel || {};
  if (e.ergebnis === "erste" || !v.vorgaenger) return "erste AB";
  if (e.ergebnis === "wichtig") {
    const k = e.kurz || [];
    return k.length ? esc(k.slice(0, 2).join(" · ")) + (k.length > 2 ? ` · + ${k.length - 2}` : "") : `${e.wichtig} wichtig: ${stichwortText(e.stichworte)}`;
  }
  if (e.ergebnis === "info") return "nur Infos";
  return "keine Änderung";
}

// ================= Abgleich mit Syscara =================
const SY_STATUS = {
  fehlt: ["fehler", "x", "Fehlt in AB"], abweichung: ["fehler", "x", "Abweichend"],
  unsicher: ["pruefen", "warn", "Unsicher"], nur_ab: ["pruefen", "warn", "Nur in AB"],
  passt: ["ok", "check", "Passt"], ignoriert: ["neutral", "minus", "Ignoriert"],
  gebuehr: ["neutral", "minus", "Gebühr"], ohne_preis: ["neutral", "minus", "Ohne Preis"],
};
const WIE_TEXT = { gleich: "gleicher Name", woerter: "alle Wörter gefunden", gelernt: "zugeordnet", inhalt: "im Paket enthalten",
  aehnlich: "ähnlicher Name", stichwort: "gleiches Stichwort", gebuehr: "Gebühr" };

const posText = (p) => `<span class="pos-nr">Pos. ${esc(p.pos)}</span>${esc(p.text)}${p.preis ? `<span class="preis">${esc(p.preis)} €</span>` : ""}`;

function syscaraZeileHtml(r, mitKnoepfen) {
  const [klasse, ic, text] = SY_STATUS[r.status] || ["neutral", "minus", r.status];
  let links, rechts;
  if (r.art === "nummer") {
    links = `<b>${esc(r.feld)}</b> ${esc(r.syscara)}`;
    rechts = esc(r.ab_wert);
  } else if (r.art === "nur_ab") {
    links = `<span class="leer-wert">–</span>`;
    rechts = posText(r.ab[0]);
  } else {
    links = `${r.art === "modell" ? `<span class="art-klein">Modell</span>` : ""}${esc(r.syscara || r.kurz)}${String(r.syscara || "").length >= 50 && !/[)\s]$/.test(r.syscara) ? `<span class="leer-wert" title="Syscara schneidet lange Namen im Export nach 50 Zeichen ab"> …</span>` : ""}`;
    rechts = r.ab.length ? r.ab.map(posText).join("<br>") + (r.erwartet ? `<br><span class="leer-wert">nicht gefunden: ${esc(r.erwartet)}</span>` : "")
      : `<span class="leer-wert">${r.erwartet ? `erwartet: ${esc(r.erwartet)}` : r.status === "ignoriert" ? "steht nie in der AB" : "nicht gefunden"}</span>`;
  }
  // warum „unsicher“: Zahl oder Modellnummer weicht ab, Name in Syscara gekürzt und doppelt
  if (r.hinweis) {
    rechts += `<span class="sy-hinweis"${r.mehrdeutig ? ` title="Zwei Optionen in Syscara beginnen gleich – ODIN kann nicht sicher sagen, welche gemeint ist. Bitte selbst in der AB prüfen."` : ""}>${icon("warn")}${esc(r.hinweis)}</span>`;
  }
  let knoepfe = "";
  if (mitKnoepfen) {
    if (r.status === "unsicher" && r.ab.length && !r.mehrdeutig) knoepfe += `<button class="knopf klein" data-sy-passt="${zahlOk(r.i)}" title="Ja, das ist dieselbe Ausstattung – ODIN merkt sich das">${icon("check")}Passt</button>`;
    // fehlt trotz gelernter Zuordnung: eine weitere Zuordnung kommt als Alternative dazu
    if (["fehlt", "unsicher"].includes(r.status) && r.art !== "nummer" && !r.mehrdeutig && (!r.regel || r.status === "fehlt")) knoepfe += `<button class="knopf klein leise" data-sy-zuordnen="${zahlOk(r.i)}">Zuordnen …</button>`;
    if (r.art === "nur_ab" && r.status === "nur_ab") knoepfe += `<button class="knopf klein leise" data-sy-nurab="${esc(r.ab[0].pos)}" title="Diese Position steht bei diesem Hersteller nie in Syscara (z. B. eine Gebühr)">Nie in Syscara</button>`;
    if (r.regel) knoepfe += `<button class="knopf klein leise" data-sy-loesen="${esc(r.regel)}" title="Gelernte Zuordnung entfernen">Lösen</button>`;
  }
  const wie = r.status === "passt" && r.wie ? `<span class="wie">${esc(WIE_TEXT[r.wie] || r.wie)}</span>` : "";
  return `<tr class="sy-${esc(r.status)}">
    <td class="sy-status"><span class="marke-status ${klasse}">${icon(ic)}${text}</span></td>
    <td>${links}</td><td>${rechts}${wie}</td>
    <td class="sy-knoepfe">${knoepfe}</td></tr>`;
}

function syscaraTabelle(zeilen, mitKnoepfen) {
  return `<table class="aenderungen syscara-tabelle"><thead><tr><th></th><th>Syscara</th><th>AB</th><th></th></tr></thead>
    <tbody>${zeilen.map((r) => syscaraZeileHtml(r, mitKnoepfen)).join("")}</tbody></table>`;
}

function syscaraHtml(h1, z) {
  const sy = h1?.syscara;
  if (!h1) return "";
  if (!sy) {
    if (z.ergebnis !== "erste" && z.gegen_art !== "erste") return "";
    return `<div class="abschnitt"><div class="hinweis info">${icon("syscara")}<span>Für dieses Fahrzeug liegt noch kein Syscara-Export vor.
      <button class="link" data-aktion="syscaraEinlesen">Syscara-Export einlesen</button> – dann gleicht ODIN die AB selbst mit der Bestellung ab.</span></div></div>`;
  }
  const zeilen = sy.zeilen.map((r, i) => ({ ...r, i }));
  const achtung = zeilen.filter((r) => ["fehlt", "unsicher", "abweichung", "nur_ab"].includes(r.status));
  const passt = zeilen.filter((r) => r.status === "passt");
  const info = zeilen.filter((r) => ["ignoriert", "gebuehr", "ohne_preis"].includes(r.status));
  const nummern = zeilen.filter((r) => r.art === "nummer");
  let html = `<div class="abschnitt syscara-block">
    <h3 class="mit-zahl">Abgleich mit Syscara${achtung.length ? ` <span>${achtung.length}</span>` : ""}</h3>
    <p class="erklaerung">Export vom ${datumKurz(sy.stand)} · ${zahlOk(sy.ausstattung)} Ausstattungen · gegen die AB vom ${datumKurz(sy.ab)}</p>`;
  if (sy.ok) {
    const gefunden = zeilen.filter((r) => r.art === "ausstattung" && r.status === "passt").length;
    const ohne = sy.ausstattung - gefunden;
    html += `<div class="hinweis ok">${icon("check")}<span>Alles passt: Modell und ${gefunden} Ausstattungen stehen in der AB${
      ohne ? ` (${ohne} ohne AB-Position, z. B. Verkaufsaktion)` : ""}${nummern.length ? ", die Nummern stimmen" : ""}.</span></div>`;
  } else {
    html += syscaraTabelle(achtung, true) + `<p class="erklaerung">„Passt“ und „Zuordnen“ merkt sich ODIN für alle ${esc(z.fahrzeug.hersteller)}-Fahrzeuge.</p>`;
  }
  if (passt.length) html += `<details class="aufklapper"><summary>${icon("chevron")}Passt <span class="anzahl-klein">${passt.length}</span></summary>${syscaraTabelle(passt, true)}</details>`;
  if (info.length) html += `<details class="aufklapper"><summary>${icon("chevron")}Zur Info <span class="anzahl-klein">${info.length}</span>
      <span class="summary-zusatz">– Gebühren, Positionen ohne Preis und was nie in AB bzw. Syscara steht</span></summary>${syscaraTabelle(info, true)}</details>`;
  return html + "</div>";
}

// Den Abgleich mit Syscara gibt es im Reiter ABs und im Reiter Ausstattungsvergleich. Ein „Ort“ sagt, welches
// Fahrzeug dort gerade gezeigt wird (z = Zeile der AB-Übersicht, h1 = Details) und wie danach neu geladen wird.
const syscaraOrte = {
  ab: () => ({
    z: (abZeilen || []).find((x) => schluessel(x) === abGewaehlt), h1: abDetail,
    neu: async () => {
      await ladeAbs({ still: true });
      if ((abZeilen || []).some((x) => schluessel(x) === abGewaehlt)) waehleAb(abGewaehlt);
    },
  }),
};
const syscaraOrtVon = (el) => (el?.closest?.("#sy-detail") && syscaraOrte.ausstattung ? syscaraOrte.ausstattung : syscaraOrte.ab)();

async function syscaraAktion(ort, aufruf, meldung) {
  const z = ort.z;
  if (!z) return;
  const vorher = z.status;
  try { Object.assign(z, await aufruf(z)); } catch (e) { zeigeMeldung(String(e.message || e), "x", true); return; }
  const fertig = vorher !== "erledigt" && z.status === "erledigt";
  zeigeMeldung(fertig ? `${kennungVon(z.fahrzeug)}: passt jetzt alles zu Syscara – automatisch erledigt.` : meldung, "check");
  await ort.neu();
}

function syscaraPasst(i, ort) {
  const r = ort.h1?.syscara?.zeilen[i];
  if (!r) return;
  syscaraAktion(ort, (z) => api().syscara_zuordnen(z.fahrzeug.pfad, r.syscara, r.ab.map((p) => p.pos)),
    `Gemerkt: „${r.syscara || r.kurz}“ = ${r.ab.map((p) => p.text).join(" + ")}`);
}

function oeffneZuordnen(i, ort) {
  const sy = ort.h1?.syscara, r = sy?.zeilen[i];
  if (!r) return;
  zuordnen.zeile = r;
  zuordnen.ort = ort;
  const z = ort.z;
  const frei = new Set(sy.zeilen.filter((x) => x.art === "nur_ab").map((x) => x.ab[0].pos));
  const gewaehlt = new Set(r.ab.map((p) => p.pos));
  const positionen = [...sy.positionen].sort((a, b) => (frei.has(b.pos) - frei.has(a.pos)));
  $("#zuordnen-titel").textContent = `„${r.syscara || r.kurz}“`;
  $("#zuordnen-text").textContent = `Welche Position der AB ist das? ODIN merkt es sich für alle ${z?.fahrzeug.hersteller || ""}-Fahrzeuge.`;
  $("#zuordnen-liste").innerHTML = positionen.map((p) => `
    <label class="zuordnen-pos${frei.has(p.pos) ? " frei" : ""}"><input type="checkbox" value="${esc(p.pos)}"${gewaehlt.has(p.pos) ? " checked" : ""}>
      <span>${posText(p)}</span>${frei.has(p.pos) ? `<span class="frei-marke">noch frei</span>` : ""}</label>`).join("");
  $("#zuordnen-nie").hidden = r.art === "modell";
  aktualisiereZuordnen();
  $("#dialog-zuordnen").showModal();
}

function aktualisiereZuordnen() {
  const n = $("#zuordnen-liste").querySelectorAll("input:checked").length;
  $("#zuordnen-ok").disabled = !n;
  $("#zuordnen-hinweis").textContent = n > 1 ? `${n} Positionen – zusammen eine Ausstattung (z. B. ein Paket)` : "";
}

async function zuordnenSpeichern(positionen) {
  const r = zuordnen.zeile;
  $("#dialog-zuordnen").close();
  if (!r || !zuordnen.ort) return;
  await syscaraAktion(zuordnen.ort, (z) => api().syscara_zuordnen(z.fahrzeug.pfad, r.syscara, positionen),
    positionen.length ? `Gemerkt: „${r.syscara || r.kurz}“ zugeordnet.` : `Gemerkt: „${r.syscara || r.kurz}“ steht nie in der AB.`);
}

function renderZuordnungen(zu = letzteZuordnungen) {
  letzteZuordnungen = zu;
  const eintraege = [
    ...zu.syscara.map((r) => ({ id: r.id, text: `${r.hersteller} · „${r.name.split(" (")[0]}“ → ${r.artikel.length || r.titel ? `${r.titel || ""}${r.artikel.length ? ` (${r.artikel.join(", ")})` : ""}` : "steht nie in der AB"}`, r })),
    ...zu.nur_ab.map((r) => ({ id: r.id, text: `${r.hersteller} · ${r.titel || "Artikel"} (${r.artikel}) → steht nie in Syscara`, r })),
  ];
  $("#zuordnungen-liste").innerHTML = eintraege.length ? `<ul class="regel-liste">${eintraege.map(({ id, text, r }) => `
    <li><span class="regel-text"><b>${esc(text)}</b><span>${esc(r.von || "")} · ${datumKurz(r.am)}</span></span>
      <button class="knopf klein" data-zuordnung-weg="${esc(id)}">Entfernen</button></li>`).join("")}</ul>`
    : `<p class="erklaerung">Noch nichts gelernt. Beim Abgleich mit Syscara auf „Passt“ oder „Zuordnen …“ klicken.</p>`;
}

async function zuordnungEntfernen(id) {
  try { renderZuordnungen(await api().syscara_zuordnung_entfernen(id)); } catch (e) { zeigeMeldung(String(e.message || e), "x", true); return; }
  zeigeMeldung("Zuordnung entfernt – ODIN gleicht neu ab.", "syscara");
  await ladeAbs({ still: true });
  if (abGewaehlt) waehleAb(abGewaehlt, abFreierVergleich);
  if (bereichAktiv("ausstattung")) ladeAusstattung({ still: true });
}

// Einlesen zeigt immer den Reiter Ausstattungsvergleich – dort bleibt das Ergebnis stehen
async function syscaraEinlesen(quelle) {
  const datei = quelle.name || String(quelle.pfad || "").split(/[\\/]/).pop();
  syImport = { laeuft: true, datei };
  zeigeBereich("ausstattung");
  let r;
  try { r = await api().syscara_einlesen(quelle.pfad || null, quelle.name || "", quelle.b64 || null); }
  catch (e) { r = { ok: false, fehler: String(e.message || e) }; }
  syImport = r.ok ? r : { fehler: r.fehler, datei };
  if (!r.ok) { zeigeMeldung(r.fehler, "x", true); await ladeAusstattung({ still: true }); return; }
  if (r.aelter && r.aelter === r.fahrzeuge) zeigeMeldung("Nichts übernommen – ODIN kennt schon einen neueren Syscara-Export.", "warn");
  else zeigeMeldung(`Syscara-Export eingelesen: ${r.fahrzeuge} Fahrzeug${r.fahrzeuge === 1 ? "" : "e"}.`, "syscara");
  syFilter = null;                                   // gleich die erste Gruppe mit Fahrzeugen zeigen
  await ladeAusstattung({ still: true });
  await ladeAbs({ still: true });
}

function renderAbDetail() {
  const d = $("#ab-detail");
  const z = (abZeilen || []).find((x) => schluessel(x) === abGewaehlt);
  if (!z) { d.innerHTML = leeresDetailHtml(); return; }
  const fz = z.fahrzeug;
  const h1 = abDetail;
  const verlauf = h1?.verlauf || [];
  const vInfo = (datei) => verlauf.find((v) => v.datei === datei) || {};
  const frei = abFreierVergleich;
  const neuDatei = frei ? frei.datei : z.datei;
  const gegen = frei ? (h1 ? h1.gegen : frei.gegen || "") : z.gegen;

  const kopf = `
    <div class="ueber">${esc(fz.hersteller)} · ${esc(fz.jahr)}${fz.auftragsnummer ? ` · ${nummerLabel(fz)} ${esc(fz.auftragsnummer)}` : ""}${!fz.interne_id && z.kommission ? ` · „${esc(z.kommission)}“` : ""}</div>
    <div class="titel-zeile"><h2>${esc(kennungVon(fz))}</h2>${statusMarkeAb(z.status)}</div>`;

  const bearbeitet = z.status === "erledigt" ? `geprüft: ${z.art === "manuell" ? `${esc(z.von)} · ${datumKurz(z.am)} ${uhrzeit(z.am)}` : wieGeprueft(z)}`
    : z.status === "klaerung" && z.von ? `in Klärung: ${esc(z.von)} · ${datumKurz(z.am)}` : "";
  const aktionen = `
    <div class="status-aktionen">
      ${!frei && z.status !== "erledigt" ? `<button class="knopf primaer" data-aktion="abErledigt">${icon("check")}Erledigt<kbd>E</kbd></button>` : ""}
      ${!frei && z.status !== "klaerung" ? `<button class="knopf" data-aktion="abKlaerung">${icon("uhr")}In Klärung<kbd>K</kbd></button>` : ""}
      ${!frei && z.status !== "offen" ? `<button class="knopf leise" data-aktion="abOffen">Wieder öffnen<kbd>O</kbd></button>` : ""}
      <span class="bearbeitet">${bearbeitet}</span>
    </div>
    <label class="notiz-feld">${icon("notiz")}<textarea id="ab-notiz" rows="1" placeholder="Notiz zum Fahrzeug, z. B. „Rückfrage bei Hersteller1 wegen Wohnwelt-Preis“">${esc(notizEntwurf.pfad === fz.pfad ? notizEntwurf.text : z.notiz || "")}</textarea></label>`;

  const pdfKnopf = (datei) => `<button class="link" data-aktion="oeffnePfad" data-pfad="${esc(pfadIn(fz.pfad, datei))}">PDF öffnen</button>`;
  const neuInfo = vInfo(neuDatei), altInfo = vInfo(gegen);
  let karte;
  if (gegen) {
    const linksTitel = frei ? "Diese AB" : "Neueste AB";
    const ersteAb = !frei && z.gegen_art === "erste";
    const rechtsTitel = frei ? "Vorher" : ersteAb ? "Erste AB (nicht geprüft)" : z.status === "erledigt" ? "Davor geprüft" : "Zuletzt geprüft";
    const pfeilText = !frei && neueSeit(z) > 1 ? `${neueSeit(z)} neue ABs seitdem` : "verglichen mit";
    const geprueftVon = !frei && altInfo.geprueft ? `<span>${wieGeprueft(altInfo.geprueft)}</span>` : "";
    karte = `
      <div class="vergleichs-karte">
        <div class="seite neu"><span class="etikett">${linksTitel}</span><b>AB vom ${datumKurz(neuInfo.datum || neuDatei.slice(0, 10))}</b><span>${esc(fassungText(neuInfo))}</span>${pdfKnopf(neuDatei)}</div>
        <div class="pfeil">${icon("arrow")}<span>${pfeilText}</span></div>
        <div class="seite"><span class="etikett">${rechtsTitel}</span><b>AB vom ${datumKurz(altInfo.datum || gegen.slice(0, 10))}</b><span>${esc(fassungText(altInfo))}</span>${geprueftVon}${pdfKnopf(gegen)}</div>
      </div>`;
  } else {
    karte = `
      <div class="vergleichs-karte einzeln"><div class="seite neu"><span class="etikett">${frei || h1?.syscara ? "Erste AB" : "Mit Syscara abgleichen"}</span>
        <b>AB vom ${datumKurz(neuInfo.datum || neuDatei.slice(0, 10))}</b>
        <span>${esc(fassungText(neuInfo))} – ${frei ? "keine ältere Fassung" : z.gegen_syscara ? "gegen die Bestellung in Syscara geprüft" : "es gibt noch keine geprüfte AB zum Vergleichen"}</span>${pdfKnopf(neuDatei)}</div></div>`;
  }

  const freiHinweis = frei ? `<div class="hinweis info">${icon("vergleich")}<span>Einzelansicht – nur zur Info, ändert keinen Status.
    <button class="link" data-aktion="abRegulaer">Zurück zur Gesamtprüfung</button></span></div>` : "";
  const zHinweis = z.hinweis && !frei ? `<div class="hinweis warnung">${icon("warn")}<span>${esc(z.hinweis)}</span></div>` : "";

  let inhalt;
  if (!h1) {
    inhalt = `<div class="abschnitt"><div class="balken lang"></div><div class="balken lang"></div><div class="balken"></div></div>`;
  } else {
    const wichtig = h1.aenderungen.filter((a) => a.stufe === "wichtig");
    const info = h1.aenderungen.filter((a) => a.stufe !== "wichtig");
    const nachgetragen = info.filter((a) => a.art.endsWith("nachgetragen") && a.bereich.startsWith("Pos."));
    const sonstige = info.filter((a) => !nachgetragen.includes(a));
    inhalt = "";
    if (h1.unlesbar) {
      inhalt += `<div class="abschnitt"><div class="hinweis warnung">${icon("warn")}<span>Eine der ABs ist gerade nicht lesbar (${esc(h1.unlesbar)}) –
        z. B. noch nicht von OneDrive geladen. ODIN vergleicht beim nächsten Laden noch einmal.</span></div></div>`;
    } else if (gegen && !h1.aenderungen.length) {
      inhalt += `<div class="abschnitt"><div class="hinweis ok">${icon("check")}<span>Inhaltlich identisch.</span></div></div>`;
    }
    if (wichtig.length) {
      const titel = frei ? "Wichtige Änderungen" : z.gegen_art === "erste" ? "Wichtige Änderungen seit der ersten AB" : "Wichtige Änderungen seit dem geprüften Stand";
      inhalt += `<div class="abschnitt"><h3 class="mit-zahl">${titel} <span>${wichtig.length}</span></h3>${aenderungsTabelle(wichtig, false, true)}</div>`;
    } else if (gegen && h1.aenderungen.length) {
      inhalt += `<div class="abschnitt"><div class="hinweis ok">${icon("check")}<span>Keine wichtigen Änderungen, nur Informationen.</span></div></div>`;
    }
    if (info.length) {
      inhalt += `<details class="aufklapper abschnitt"${wichtig.length ? "" : " open"}><summary>${icon("chevron")}Zur Info <span class="anzahl-klein">${info.length}</span></summary>
        ${sonstige.length ? aenderungsTabelle(sonstige, true, sonstige.some((a) => a.stumm)) : ""}
        ${nachgetragen.length ? `<p class="erklaerung">Preise erstmals angegeben bei ${nachgetragen.length} Position${nachgetragen.length === 1 ? "" : "en"}:</p>${aenderungsTabelle(nachgetragen, true)}` : ""}
      </details>`;
    }
    if (h1.hinweise.length) {
      inhalt += `<div class="abschnitt"><h3 class="mit-zahl">Bemerkungen auf der AB</h3>
        <ul class="weggelassen">${h1.hinweise.map((h) => `<li>${icon("notiz")}<span>${esc(h)}</span></li>`).join("")}</ul>
        <p class="erklaerung">Bemerkungszeilen ohne Positionsnummer – werden nicht als Änderung gezählt.</p></div>`;
    }
    const lt = h1.kopf?.Liefertermin;
    if (lt) inhalt = `<div class="kennzahlen"><div><span>Liefertermin</span><b>${esc(lt)}</b></div>
      ${h1.kopf["Produktionstermin"] ? `<div><span>Produktion</span><b>${esc(h1.kopf["Produktionstermin"])}</b></div>` : ""}
      ${h1.kopf["Fahrgestell-Nr."] ? `<div><span>FIN</span><b>${esc(h1.kopf["Fahrgestell-Nr."])}</b></div>` : ""}</div>` + inhalt;
  }

  const ohnePruefung = z.status !== "erledigt" && z.ergebnis === "erste" && verlauf.length > 1;
  const offenVerlauf = !!frei || ohnePruefung || verlaufOffenFuer === fz.pfad;
  const verlaufHtml = verlauf.length > 1 || (verlauf.length && frei) ? `
    <details class="aufklapper abschnitt verlauf-block"${offenVerlauf ? " open" : ""}>
      <summary>${icon("chevron")}Alle ABs dieses Fahrzeugs <span class="anzahl-klein">${verlauf.length}</span>
        ${!frei && z.neue_abs > 1 ? `<span class="summary-zusatz">– was kam mit welcher AB?</span>` : ""}</summary>
      ${ohnePruefung ? `<p class="erklaerung">Eine AB schon mit Syscara abgeglichen? Hake sie ab – ODIN vergleicht die neueste dann damit.</p>` : ""}
      <ol class="verlauf">${[...verlauf].reverse().map((v) => {
        const aktiv = frei && v.datei === frei.datei;
        const art = v.geprueft ? "geprueft" : v.neu ? "neu" : "";
        const marke = v.geprueft ? `${icon("check")}geprüft${v.geprueft.art === "manuell" ? ` · ${esc(v.geprueft.von)}` : v.geprueft.art === "eingelesen" ? " · AB erledigt" : " · automatisch"}`
          : v.neu ? "neu" : "";
        return `<li class="${aktiv ? "aktiv" : ""} ${art}">
          <button class="haken${v.geprueft ? " an" : ""}" data-abhaken="${esc(v.datei)}" aria-pressed="${v.geprueft ? "true" : "false"}"
            title="${v.geprueft ? "Haken entfernen" : "Als geprüft abhaken – die neueste AB wird dann damit verglichen"}">${icon("check")}</button>
          <button class="verlauf-eintrag" data-verlauf="${esc(v.datei)}" title="Diese AB gegen ihre Vorgängerin anzeigen">
            <span class="verlauf-punkt"></span>
            <span class="verlauf-text"><b>AB vom ${datumKurz(v.datum)}</b><span>${esc(fassungText(v))} · eingegangen ${datumKurz(v.eingang)}</span></span>
            <span class="verlauf-ergebnis">${einzelText(v)}</span>
            <span class="verlauf-status">${marke}</span>
          </button>
        </li>`;
      }).join("")}</ol>
    </details>` : "";

  const fuss = `<div class="aktionen abstand">
      <button class="knopf" data-aktion="oeffnePfad" data-pfad="${esc(fz.pfad)}">${icon("folder")}Fahrzeugordner</button>
      ${gegen ? `<button class="knopf" data-aktion="abBericht" data-datei="${esc(neuDatei)}" data-gegen="${esc(gegen)}">${icon("pdf")}Vergleich als PDF</button>` : ""}
    </div>`;

  const notizAlt = $("#ab-notiz");
  const fokusNotiz = notizAlt && document.activeElement === notizAlt;
  const cursor = fokusNotiz ? notizAlt.selectionStart : null;
  if (notizAlt) notizAlt.onblur = null;            // das alte Feld verschwindet gleich – kein Speichern auslösen
  d.innerHTML = kopf + aktionen + zHinweis + freiHinweis + (frei ? "" : syscaraHtml(h1, z)) + karte + inhalt + verlaufHtml + fuss;
  $(".verlauf-block")?.addEventListener("toggle", (ev) => {
    verlaufOffenFuer = ev.target.open ? fz.pfad : (verlaufOffenFuer === fz.pfad ? null : verlaufOffenFuer);
  });
  const notiz = $("#ab-notiz");
  passeNotizAn(notiz);
  notiz.oninput = () => {
    notizEntwurf.pfad = fz.pfad;
    notizEntwurf.text = notiz.value;
    passeNotizAn(notiz);
  };
  notiz.onblur = () => speichereNotiz(z, notiz.value);
  if (fokusNotiz) {
    notiz.focus();
    notiz.setSelectionRange(cursor, cursor);
  }
}

function passeNotizAn(feld) {
  feld.style.height = "auto";
  feld.style.height = `${Math.max(38, feld.scrollHeight + 2)}px`;
}

// Läuft beim Verlassen des Notizfelds – also oft mitten in einem Klick. Darum hier nie die Auswahl wechseln
// oder das Detail neu aufbauen: das gehaltene Fahrzeug bleibt stehen, bis jemand ein anderes wählt.
async function speichereNotiz(z, text) {
  if ((z.notiz || "") === text) {
    if (notizEntwurf.pfad === z.fahrzeug.pfad) notizEntwurf.pfad = null;
    return;
  }
  try {
    Object.assign(z, await api().ab_status(z.fahrzeug.pfad, null, text, null));
    if (notizEntwurf.pfad === z.fahrzeug.pfad && notizEntwurf.text === text) notizEntwurf.pfad = null;
    renderAbs({ nurListe: true });                        // Notiz in der Liste zeigen, Detail und Auswahl bleiben
    zeigeMeldung("Notiz gespeichert.", "notiz");
  } catch (e) { zeigeMeldung(`Notiz nicht gespeichert: ${e.message || e}`, "x", true); }
}

async function setzeAbStatus(status) {
  const z = (abZeilen || []).find((x) => schluessel(x) === abGewaehlt);
  if (!z || z.status === status) return;
  const notiz = $("#ab-notiz")?.value ?? z.notiz;
  const vorher = sichtbareAbs();
  let index = vorher.findIndex((x) => schluessel(x) === abGewaehlt);
  if (index < 0) index = abHalten === abGewaehlt ? abHaltenIndex : 0;    // gehalten: steht nicht mehr in der Liste
  try {
    Object.assign(z, await api().ab_status(z.fahrzeug.pfad, status, notiz, z.datei));
  } catch (e) {
    zeigeMeldung(String(e.message || e), "warn", true);
    await ladeAbs({ still: true });
    return;
  }
  zeigeMeldung(`${kennungVon(z.fahrzeug)}: ${STATUS_TEXT[z.status]}`, z.status === "erledigt" ? "check" : "uhr");
  if (status === "klaerung") {                         // erst den Grund notieren, dann geht es weiter
    abHalten = abGewaehlt;
    abHaltenIndex = index;
    renderAbs();
    await waehleAb(abGewaehlt);
    if (abGewaehlt === z.fahrzeug.pfad) $("#ab-notiz")?.focus();
    return;
  }
  abHalten = null;
  const nachher = sichtbareAbs();
  if (!nachher.some((x) => schluessel(x) === abGewaehlt) && nachher.length) {
    abGewaehlt = schluessel(nachher[Math.min(index, nachher.length - 1)]);   // weiter zum nächsten Fahrzeug
    abDetail = null;
    renderAbs();
    waehleAb(abGewaehlt);
  } else {
    renderAbs();
    waehleAb(abGewaehlt);
  }
}

async function stummSchalten(d, stumm) {
  const z = (abZeilen || []).find((x) => schluessel(x) === abGewaehlt);
  if (!z) return;
  const was = `${z.fahrzeug.hersteller} · ${d.titel && d.bereich.startsWith("Pos.") ? d.titel : d.bereich} · ${d.art}`;
  const vorherStatus = z.status, pfad = z.fahrzeug.pfad;
  const index = Math.max(0, sichtbareAbs().findIndex((x) => x === z));
  try {
    if (stumm) await api().ab_stumm(z.fahrzeug.pfad, d.bereich, d.art, d.titel, d.kurz);
    else await api().ab_laut("", z.fahrzeug.pfad, d.bereich, d.art);
  } catch (e) { zeigeMeldung(String(e.message || e), "x", true); return; }
  await ladeAbs({ still: true });
  const jetzt = (abZeilen || []).find((x) => x.fahrzeug.pfad === pfad);
  const fertig = vorherStatus !== "erledigt" && jetzt?.status === "erledigt";
  zeigeMeldung((stumm ? `Stumm geschaltet: ${was} – gilt für alle ${z.fahrzeug.hersteller}-Fahrzeuge.` : `Wieder wichtig: ${was}`)
    + (fertig ? ` ${kennungVon(z.fahrzeug)} hat damit nichts Wichtiges mehr – automatisch erledigt.` : ""), "stumm");
  const nachher = sichtbareAbs();
  if (jetzt && !nachher.includes(jetzt) && nachher.length) waehleAb(schluessel(nachher[Math.min(index, nachher.length - 1)]));
  else if (jetzt && nachher.includes(jetzt)) waehleAb(schluessel(jetzt), abFreierVergleich);
}

async function regelEntfernen(id) {
  try { renderRegeln(await api().ab_laut(id)); } catch (e) { zeigeMeldung(String(e.message || e), "x", true); return; }
  zeigeMeldung("Regel entfernt – diese Änderungen zählen wieder als wichtig.", "stumm");
  await ladeAbs({ still: true });
  if (abGewaehlt) waehleAb(abGewaehlt, abFreierVergleich);
}

function renderRegeln(regeln) {
  $("#regeln-liste").innerHTML = regeln.length ? `<ul class="regel-liste">${regeln.map((r) => `
    <li><span class="regel-text"><b>${esc(r.hersteller)} · ${esc(r.titel && r.schluessel.startsWith("Artikel") ? `${r.titel} (${r.schluessel})` : r.schluessel)} · ${esc(r.art)}</b>
      <span>${r.beispiel ? `z. B. „${esc(r.beispiel)}“ · ` : ""}${esc(r.von || "")} · ${datumKurz(r.am)}</span></span>
      <button class="knopf klein" data-regel-weg="${esc(r.id)}">Entfernen</button></li>`).join("")}</ul>`
    : `<p class="erklaerung">Noch nichts stumm geschaltet. Bei einer wichtigen Änderung auf ${icon("stumm")} klicken, wenn diese Art Änderung künftig egal ist.</p>`;
}

async function abhaken(datei, an) {
  const z = (abZeilen || []).find((x) => schluessel(x) === abGewaehlt);
  if (!z) return;
  verlaufOffenFuer = z.fahrzeug.pfad;
  try {
    Object.assign(z, await api().ab_abhaken(z.fahrzeug.pfad, datei, an));
  } catch (e) { zeigeMeldung(String(e.message || e), "x", true); return; }
  zeigeMeldung(an ? `AB vom ${datumKurz(datei)} als geprüft abgehakt – neu verglichen.` : `Haken bei der AB vom ${datumKurz(datei)} entfernt.`,
    an ? "check" : "minus");
  renderAbs();
  waehleAb(abGewaehlt);
}

async function eingangPruefen({ still = false } = {}) {
  if (abPrueftGerade) return;
  await ladeAblageStatus();
  if (!ablage.gueltig) { zeigeBereich("abs"); return; }
  if (!ablage.im_eingang) {
    if (!still) zeigeMeldung("Der AB-Eingang ist leer.", "inbox");
    if (bereichAktiv("abs")) ladeAbs({ still: true });
    return;
  }
  abPrueftGerade = true;
  $("#knopf-pruefen").disabled = true;
  if (bereichAktiv("abs")) renderAbs();
  let ergebnisse = [];
  try {
    ergebnisse = await api().eingang_pruefen();
  } catch (e) {
    zeigeMeldung(`Prüfen fehlgeschlagen: ${e.message || e}`, "x", true);
  }
  abPrueftGerade = false;
  await ladeAbs({ still: true });
  const fahrzeuge = new Map();
  ergebnisse.forEach((e) => { if (e.stand && e.status !== "Doppelt") fahrzeuge.set(e.stand.fahrzeug.pfad, e.stand); });
  const offen = [...fahrzeuge.values()].filter((s) => s.status !== "erledigt");
  const fehler = ergebnisse.filter((e) => e.status === "Nicht erkannt").length;
  const abbrueche = ergebnisse.filter((e) => e.status === "Fehler");
  const doppelt = ergebnisse.filter((e) => e.status === "Doppelt").length;
  if (ergebnisse.length && doppelt === ergebnisse.length) {
    zeigeMeldung(doppelt === 1 ? "Diese AB ist schon abgelegt – nichts Neues." : `Alle ${doppelt} ABs sind schon abgelegt – nichts Neues.`, "check");
  } else if (ergebnisse.length) {
    let text = `${ergebnisse.length} AB(s) verarbeitet: ${offen.length} Fahrzeug(e) zu prüfen`;
    if (fahrzeuge.size - offen.length) text += `, ${fahrzeuge.size - offen.length} ohne Handlungsbedarf`;
    if (doppelt) text += `, ${doppelt} schon abgelegt (doppelt)`;
    if (fehler) text += `, ${fehler} nicht erkannt (liegt in „AB-Eingang/Nicht erkannt“)`;
    if (abbrueche.length) text += `, ${abbrueche.length} mit Fehler (bleibt im Eingang): ${abbrueche[0].datei} – ${abbrueche[0].meldung}`;
    zeigeMeldung(text + ".", offen.length || fehler || abbrueche.length ? "warn" : "check", !!(fehler || abbrueche.length));
  }
  if (offen.length && bereichAktiv("abs")) {
    abFilter = "offen";
    abGewaehlt = offen[0].fahrzeug.pfad;
    renderAbs();
    waehleAb(abGewaehlt);
  }
  fahrzeugListe = null;
}

// ================= Fahrzeuge =================
async function ladeFahrzeuge() {
  if (ablage.gueltig) {
    try { fahrzeugListe = await api().fahrzeuge(); } catch (e) { zeigeMeldung(String(e.message || e), "x", true); }
  }
  renderFahrzeuge();
}

function renderFahrzeuge() {
  const f = $("#fz-flaeche");
  renderKopfZaehler();
  if (!ablage.gueltig) { f.innerHTML = einrichtenHtml(); $("#fz-jahre").innerHTML = ""; return; }
  const liste = fahrzeugListe || [];
  const jahre = [...new Set(liste.map((x) => x.jahr))].sort().reverse();
  if (fzJahr !== "alle" && !jahre.includes(fzJahr)) fzJahr = "alle";
  $("#fz-jahre").innerHTML = jahre.length > 1
    ? [`<button class="filter-knopf${fzJahr === "alle" ? " aktiv" : ""}" data-jahr="alle">Alle</button>`,
       ...jahre.map((j) => `<button class="filter-knopf${fzJahr === j ? " aktiv" : ""}" data-jahr="${esc(j)}">${esc(j)}</button>`)].join("")
    : "";
  if (!liste.length) {
    f.innerHTML = `<section class="leer"><div class="leer-text"><span class="schraege" aria-hidden="true"></span>
      <h1>Noch keine Fahrzeugordner</h1>
      <p>Ordner entstehen automatisch mit der ersten AB. In der Bestellphase legst du sie hier von Hand an.</p>
      <div class="gruppe"><button class="knopf primaer" data-aktion="dialogFahrzeug">${icon("plus")}Fahrzeug hinzufügen</button></div>
      </div></section>`;
    return;
  }
  const s = fzSuche.toLowerCase();
  const sichtbare = liste
    .filter((x) => fzJahr === "alle" || x.jahr === fzJahr)
    .filter((x) => !s || `${x.name} ${x.hersteller}`.toLowerCase().includes(s))
    .sort((a, b) => b.jahr.localeCompare(a.jahr) || a.hersteller.localeCompare(b.hersteller) || a.name.localeCompare(b.name));
  const leer = `<span class="leer-wert">–</span>`;
  f.innerHTML = `<div class="tabelle-rahmen"><table class="fahrzeuge">
    <thead><tr><th>Interne ID</th><th>Auftragsnr.</th><th>Hersteller</th><th>Jahr</th><th class="zahl-spalte">ABs</th>
      <th>Letzte AB</th><th>Liefertermin</th><th>Prüfung</th><th></th></tr></thead>
    <tbody>${sichtbare.map((x) => `<tr data-fahrzeug="${esc(x.interne_id || x.auftragsnummer)}" data-anzahl-abs="${x.anzahl_abs || 0}"
      title="${x.anzahl_abs ? "Klicken: ABs dieses Fahrzeugs anzeigen" : "Noch keine AB – sie kommt automatisch in diesen Ordner"}">
      <td class="kennung">${esc(x.interne_id) || `<span class="leer-wert">fehlt</span>`}</td>
      <td>${esc(x.auftragsnummer) || `<span class="leer-wert">fehlt</span>`}</td>
      <td>${esc(x.hersteller)}</td><td>${esc(x.jahr)}</td>
      <td class="zahl-spalte">${x.anzahl_abs || leer}</td>
      <td>${x.letzte_ab ? esc(datumKurz(x.letzte_ab)) : leer}</td>
      <td>${x.liefertermin ? esc(x.liefertermin) : leer}</td>
      <td>${x.status === "offen" ? `<span class="marke-status wichtig">offen${neueSeit(x) > 1 ? ` · ${neueSeit(x)} neue ABs` : ""}</span>`
        : x.status === "klaerung" ? `<span class="status-pille klaerung">in Klärung</span>`
        : x.status === "erledigt" ? `<span class="marke-status ok">${icon("check")}geprüft</span>` : leer}</td>
      <td class="aktion-spalte"><button class="knopf klein" data-aktion="oeffnePfad" data-pfad="${esc(x.pfad)}">${icon("folder")}Ordner</button></td>
    </tr>`).join("")}</tbody></table>
    ${!sichtbare.length ? `<p class="erklaerung tabelle-leer">Kein Fahrzeug passt zur Suche.</p>` : ""}</div>`;
}

// ================= Dialog: Fahrzeug hinzufügen =================
function oeffneDialog() {
  if (!ablage.gueltig) { zeigeMeldung("Bitte zuerst den Ordner „Fahrzeuge“ wählen.", "folder"); return; }
  const dlg = $("#dialog-fahrzeug");
  $("#form-fahrzeug").reset();
  dialogZustand.datei = null;
  $("#f-hersteller").innerHTML = (ablage.hersteller.length ? ablage.hersteller : Object.keys(NUMMERN_TEXTE))
    .map((h) => `<button type="button" class="filter-knopf${h === dialogZustand.hersteller ? " aktiv" : ""}" data-hersteller="${esc(h)}">${esc(h)}</button>`).join("");
  const j = Number(ablage.jahr_vorschlag) || new Date().getFullYear();
  $("#f-jahr").innerHTML = [j - 1, j, j + 1, j + 2].map((x) => `<option${x === j ? " selected" : ""}>${x}</option>`).join("");
  $("#f-fehler").hidden = true;
  aktualisiereDialog();
  dlg.showModal();
  $("#f-id").focus();
}

function aktualisiereDialog() {
  const [idLabel, idHilfe, nrLabel, nrHilfe] = NUMMERN_TEXTE[dialogZustand.hersteller] || NUMMERN_TEXTE.Hersteller1;
  $("#f-id-label").textContent = idLabel;
  $("#f-id-hilfe").textContent = idHilfe;
  $("#f-nr-label").textContent = nrLabel;
  $("#f-nr-hilfe").textContent = nrHilfe;
  document.querySelectorAll("#f-hersteller .filter-knopf").forEach((k) => k.classList.toggle("aktiv", k.dataset.hersteller === dialogZustand.hersteller));
  const id = $("#f-id").value.trim(), nr = $("#f-nr").value.trim();
  const name = [id, nr].filter(Boolean).join("_");
  const ordnerHersteller = dialogZustand.hersteller === "Hersteller3" ? "Hersteller3" : dialogZustand.hersteller;
  $("#f-vorschau").innerHTML = name ? `${icon("folder")}${esc($("#f-jahr").value)} / ${esc(ordnerHersteller)} / <b>${esc(name)}</b>` : "";
  $("#f-datei-text").textContent = dialogZustand.datei ? dialogZustand.datei.name : "PDF hierher ziehen oder klicken";
  $("#f-datei").classList.toggle("gefuellt", !!dialogZustand.datei);
}

async function dialogAbsenden(ev) {
  ev.preventDefault();
  const daten = {
    hersteller: dialogZustand.hersteller, jahr: $("#f-jahr").value,
    interne_id: $("#f-id").value.trim(), auftragsnummer: $("#f-nr").value.trim(),
    datei_name: dialogZustand.datei?.name || "", datei_b64: dialogZustand.datei?.b64 || "",
  };
  const fehler = $("#f-fehler");
  if (!daten.interne_id && !daten.auftragsnummer) {
    fehler.textContent = "Bitte mindestens eine Nummer eintragen.";
    fehler.hidden = false;
    $("#f-id").focus();
    return;
  }
  $("#f-anlegen").disabled = true;
  try {
    const r = await api().fahrzeug_anlegen(daten);
    if (!r.ok) { fehler.textContent = r.fehler; fehler.hidden = false; return; }
    $("#dialog-fahrzeug").close();
    zeigeMeldung(r.neu ? `Ordner angelegt: ${r.fahrzeug.name}` : `Fahrzeug gab es schon: ${r.fahrzeug.name}${daten.datei_b64 ? " – Bestellung abgelegt" : ""}`,
      r.neu ? "check" : "folder");
    await ladeFahrzeuge();
  } catch (e) {
    fehler.textContent = `Hat nicht geklappt: ${e.message || e}`;
    fehler.hidden = false;
  } finally {
    $("#f-anlegen").disabled = false;
  }
}

// ================= Dialog: Zwei ABs vergleichen =================
function renderVergleichDialog(ergebnis) {
  ["#vergleich-a", "#vergleich-b"].forEach((sel, i) => {
    const d = vergleichDateien[i];
    $(sel).classList.toggle("gefuellt", !!d);
    $(sel).querySelector("span").textContent = d ? d.name : (i ? "Zweite AB hierher ziehen oder klicken" : "Erste AB hierher ziehen oder klicken");
  });
  const box = $("#vergleich-ergebnis");
  if (!ergebnis) { box.innerHTML = ""; return; }
  if (!ergebnis.ok) { box.innerHTML = `<div class="hinweis fehler">${icon("x")}<span>${esc(ergebnis.fehler)}</span></div>`; return; }
  const wichtig = ergebnis.aenderungen.filter((a) => a.stufe === "wichtig");
  const info = ergebnis.aenderungen.filter((a) => a.stufe !== "wichtig");
  box.innerHTML = `
    ${ergebnis.hinweis ? `<div class="hinweis warnung">${icon("warn")}<span>${esc(ergebnis.hinweis)}</span></div>` : ""}
    <div class="vergleichs-karte">
      <div class="seite neu"><span class="etikett">Neu</span><b>${esc(ergebnis.neu.id)} · AB vom ${esc(ergebnis.neu.datum)}</b><span>${esc(ergebnis.neu.datei)}</span></div>
      <div class="pfeil">${icon("arrow")}<span>gegen</span></div>
      <div class="seite"><span class="etikett">Vorher</span><b>${esc(ergebnis.alt.id)} · AB vom ${esc(ergebnis.alt.datum)}</b><span>${esc(ergebnis.alt.datei)}</span></div>
    </div>
    ${!ergebnis.aenderungen.length ? `<div class="hinweis ok">${icon("check")}<span>Inhaltlich identisch.</span></div>` : ""}
    ${wichtig.length ? `<h3 class="mit-zahl">Wichtige Änderungen <span>${wichtig.length}</span></h3>${aenderungsTabelle(wichtig)}` : ""}
    ${info.length ? `<details class="aufklapper"${wichtig.length ? "" : " open"}><summary>${icon("chevron")}Zur Info <span class="anzahl-klein">${info.length}</span></summary>${aenderungsTabelle(info, true)}</details>` : ""}`;
}

async function vergleicheWennBereit() {
  const nr = ++vergleichNr;
  renderVergleichDialog(null);
  if (!vergleichDateien[0] || !vergleichDateien[1]) return;
  $("#vergleich-ergebnis").innerHTML = `<p class="erklaerung">Vergleiche …</p>`;
  let ergebnis;
  try {
    ergebnis = await api().abs_vergleichen(vergleichDateien);
  } catch (e) {
    ergebnis = { ok: false, fehler: String(e.message || e) };
  }
  if (nr === vergleichNr) renderVergleichDialog(ergebnis);      // inzwischen „Neu“ oder andere Dateien: verwerfen
}

async function nimmVergleichsdateien(dateien, slot) {
  const pdfs = [...dateien].filter((d) => d.name.toLowerCase().endsWith(".pdf"));
  if (!pdfs.length) { zeigeMeldung("Zum Vergleichen bitte AB-PDFs nehmen.", "x", true); return; }
  const gelesen = await dateienAlsBase64(pdfs.slice(0, 2));
  if (gelesen.length === 2) { vergleichDateien[0] = gelesen[0]; vergleichDateien[1] = gelesen[1]; }
  else {
    const ziel = slot ?? (vergleichDateien[0] ? 1 : 0);
    vergleichDateien[ziel] = gelesen[0];
  }
  vergleicheWennBereit();
}

// ================= ABs nachträglich einlesen =================
const nachlesen = { ordner: null, basis: null, stand: null, timer: null };
const PHASE_TEXT = { start: "Starte …", lesen: "Mails lesen", einordnen: "ABs einordnen und prüfen", abschluss: "Abschließen …" };

function ordnerFeld(art, wahl, label, hilfe) {
  const text = wahl
    ? `${icon("folder")}<span><b>${esc(wahl.ordner.split(/[\\/]/).pop())}</b> · ${wahl.mails} Mail(s)${wahl.pdfs ? `, ${wahl.pdfs} PDF(s)` : ""}</span>`
    : `${icon("folder")}<span>Ordner wählen</span>`;
  return `<div class="feld"><span class="feld-label">${label}</span>
    <button type="button" class="dropzone${wahl ? " gefuellt" : ""}" data-aktion="einlesenOrdner" data-art="${art}">${text}</button>
    ${hilfe ? `<span class="feld-hilfe">${hilfe}</span>` : ""}</div>`;
}

function renderEinlesen() {
  const st = nachlesen.stand;
  const inhalt = $("#einlesen-inhalt"), fuss = $("#einlesen-fuss");
  if (st?.laeuft) {
    const prozent = st.n ? Math.round((100 * st.i) / st.n) : 0;
    inhalt.innerHTML = `<div class="einlesen-lauf">
      <b>${PHASE_TEXT[st.phase] || "…"}${st.n ? ` – ${st.i + 1} von ${st.n}` : ""}</b>
      <div class="fortschritt" role="progressbar" aria-valuenow="${prozent}" aria-valuemin="0" aria-valuemax="100"><span style="width:${st.phase === "abschluss" ? 100 : prozent}%"></span></div>
      <span class="feld-hilfe">${esc(st.text || "")}</span>
      <p class="erklaerung">Bei vielen Mails dauert das einige Minuten.</p></div>`;
    fuss.innerHTML = `<span class="vorschau"></span><button type="button" class="knopf" data-aktion="einlesenAbbrechen">Abbrechen</button>`;
    return;
  }
  if (st?.fehler) {
    inhalt.innerHTML = `<div class="hinweis fehler">${icon("x")}<span>${esc(st.fehler)}</span></div>`;
    fuss.innerHTML = `<span class="vorschau"></span><button type="button" class="knopf primaer" data-aktion="einlesenZurueck">Zurück</button>`;
    return;
  }
  if (st?.ergebnis) {
    const e = st.ergebnis;
    const zeilen = [
      ["Aus dem Posteingang eingelesen (ABs)", e.eingeordnet],
      ["Fahrzeuge zu prüfen (jetzt in „Offen“)", e.offen],
      ["davon erste AB – mit Syscara abgleichen", e.ohne_vorgaenger],
      ["Fahrzeuge ohne wichtige Änderung (automatisch erledigt)", e.automatisch],
      ["Geprüfter Stand aus „AB erledigt“ (ABs)", e.basis],
      ["Aus „AB erledigt“ nicht gebraucht (andere Fahrzeuge)", e.basis_ignoriert],
      ["Schon vorhanden oder doppelt", e.doppelt],
      ["Neue Fahrzeugordner", e.fahrzeuge_neu],
    ].filter(([, n], i) => n || i < 2);
    const liste = (titel, eintraege, offen) => eintraege.length ? `<details class="aufklapper"${offen ? " open" : ""}>
      <summary>${icon("chevron")}${titel} <span class="anzahl-klein">${eintraege.length}</span></summary>
      <ul class="weggelassen">${eintraege.slice(0, 200).map((u) => `<li>${icon("notiz")}<span><b>${esc(u.datei)}</b> – ${esc(u.grund)}</span></li>`).join("")}</ul></details>` : "";
    inhalt.innerHTML = `
      ${e.abgebrochen ? `<div class="hinweis warnung">${icon("warn")}<span>Abgebrochen. Was schon eingelesen ist, bleibt. Einfach erneut starten – Doppelte werden erkannt.</span></div>` : ""}
      <div class="hinweis ${e.offen ? "warnung" : "ok"}">${icon(e.offen ? "warn" : "check")}<span>${e.offen
        ? `<b>${e.offen} Fahrzeug(e) zu prüfen</b> – sie stehen jetzt unter „Offen“.` : e.abgebrochen ? "Bisher nichts zu prüfen." : !e.eingeordnet && !e.basis && e.doppelt ? "Nichts Neues – diese ABs waren alle schon abgelegt."
        : "Nichts zu prüfen – keine wichtigen Änderungen gefunden."}</span></div>
      <table class="einlesen-zahlen">${zeilen.map(([t, n]) => `<tr${t.startsWith("davon") ? ` class="unter"` : ""}><td>${t}</td><td>${n}</td></tr>`).join("")}</table>
      ${liste("Übersprungen (keine AB)", e.uebersprungen, false)}
      ${liste("Nicht lesbar", e.fehler, true)}`;
    fuss.innerHTML = `<span class="vorschau">${e.abgebrochen ? `${e.gelesen ?? 0} von ${e.dateien} Dateien gelesen` : `${e.mails} Mail(s) und ${e.dateien - e.mails} PDF(s) gelesen`}</span>
      <button type="button" class="knopf primaer" data-aktion="einlesenFertig">${icon("check")}Fertig</button>`;
    return;
  }
  inhalt.innerHTML = `
    <ol class="schritte">
      <li>In Outlook im <b>Posteingang</b> die AB-Mails markieren (alle: Strg+A, am Mac ⌘A) und in einen leeren Ordner
        ziehen, z. B. auf dem Schreibtisch. Andere Mails dürfen dabei sein – sie werden übersprungen.</li>
      <li>Optional genauso mit dem Ordner <b>„AB erledigt“</b> – in einen zweiten Ordner. Die letzten ein bis zwei Jahre
        reichen (in Outlook erste Mail anklicken, mit gedrückter Umschalttaste die letzte).</li>
      <li>Ordner hier wählen und auf „Einlesen“ klicken.</li>
    </ol>
    ${ordnerFeld("ordner", nachlesen.ordner, "Noch nicht bearbeitet (Posteingang)", "")}
    ${ordnerFeld("basis", nachlesen.basis, "Optional: schon bearbeitet, nur zum Vergleichen (z. B. „AB erledigt“)",
      "Damit jede AB aus dem Posteingang gegen ihre Vorgängerin geprüft werden kann. Genommen werden nur ABs der Fahrzeuge aus dem Posteingang – alle anderen werden ignoriert. Sie werden als erledigt eingetragen und landen nicht in „Offen“.")}`;
  fuss.innerHTML = `<span class="vorschau"></span>
    <button type="button" class="knopf" data-aktion="einlesenSchliessen">Abbrechen</button>
    <button type="button" class="knopf primaer" data-aktion="einlesenStarten"${nachlesen.ordner || nachlesen.basis ? "" : " disabled"}>${icon("mail")}Einlesen</button>`;
}

async function einlesenVerfolgen() {
  clearTimeout(nachlesen.timer);
  try { nachlesen.stand = await api().einlesen_stand(); } catch (e) { nachlesen.stand = { fehler: String(e.message || e) }; }
  renderEinlesen();
  if (nachlesen.stand?.laeuft) nachlesen.timer = setTimeout(einlesenVerfolgen, 400);
}

// ================= Aktionen und Ereignisse =================
Object.assign(aktionen, {
  async ablageWaehlen() {
    let r = await api().ablage_waehlen();
    if (r.frage) {
      const ok = confirm(`„${r.frage}“ sieht nicht wie der Ordner „Fahrzeuge“ aus (kein AB-Eingang, keine Jahresordner).\n\n`
        + "Trotzdem verwenden? ODIN legt dort die Ordner „AB-Eingang“ und „_Mailberichte“ an.");
      if (!ok) return;
      r = await api().ablage_setzen(r.frage);
    }
    ablage = r;
    fahrzeugListe = null;
    abZeilen = null;
    if (bereichAktiv("fahrzeuge")) await ladeFahrzeuge(); else await ladeAbs();
    if (ablage.gueltig && ablage.im_eingang) eingangPruefen();
  },
  eingangPruefen: () => eingangPruefen(),
  abErledigt: () => setzeAbStatus("erledigt"),
  abKlaerung: () => setzeAbStatus("klaerung"),
  abOffen: () => setzeAbStatus("offen"),
  abRegulaer: () => waehleAb(abGewaehlt),
  async abBericht(knopf) {
    const z = (abZeilen || []).find((x) => schluessel(x) === abGewaehlt);
    if (z && !(await api().ab_bericht(z.fahrzeug.pfad, knopf.dataset.datei, knopf.dataset.gegen))) zeigeMeldung("PDF konnte nicht geöffnet werden.", "x", true);
  },
  async abExport() {
    const zeilen = sichtbareAbs();
    if (!zeilen.length) { zeigeMeldung("Keine ABs in der aktuellen Ansicht.", "warn"); return; }
    const r = await api().ab_uebersicht_exportieren(zeilen);
    if (r.ok) zeigeMeldung(`Gespeichert: ${r.pfad}`, "sheet");
    else if (r.fehler) zeigeMeldung(r.fehler, "x", true);
  },
  fahrzeugeLaden: () => ladeAblageStatus().then(ladeFahrzeuge),
  dialogFahrzeug: oeffneDialog,
  dialogSchliessen: () => $("#dialog-fahrzeug").close(),
  dialogVergleich() {
    vergleichDateien[0] = vergleichDateien[1] = null;
    renderVergleichDialog(null);
    $("#dialog-vergleich").showModal();
  },
  dialogVergleichSchliessen: () => { vergleichNr++; $("#dialog-vergleich").close(); },
  async dialogRegeln() {
    if (!ablage.gueltig) { zeigeMeldung("Bitte zuerst den Ordner „Fahrzeuge“ wählen.", "folder"); return; }
    const [regeln, zu] = await Promise.all([api().ab_regeln(), api().syscara_zuordnungen()]);
    renderRegeln(regeln);
    renderZuordnungen(zu);
    $("#dialog-regeln").showModal();
  },
  async syscaraEinlesen() {
    if (!ablage.gueltig) { zeigeMeldung("Bitte zuerst den Ordner „Fahrzeuge“ wählen.", "folder"); return; }
    const pfad = await api().syscara_datei_waehlen();
    if (pfad) await syscaraEinlesen({ pfad });
  },
  zuordnenSchliessen: () => $("#dialog-zuordnen").close(),
  zuordnenOk: () => zuordnenSpeichern([...$("#zuordnen-liste").querySelectorAll("input:checked")].map((x) => x.value)),
  zuordnenNie: () => zuordnenSpeichern([]),
  dialogRegelnSchliessen: () => $("#dialog-regeln").close(),
  dialogEinlesen() {
    if (!ablage.gueltig) { zeigeMeldung("Bitte zuerst den Ordner „Fahrzeuge“ wählen.", "folder"); return; }
    if (!nachlesen.stand?.laeuft) { nachlesen.ordner = nachlesen.basis = null; nachlesen.stand = null; }
    renderEinlesen();
    $("#dialog-einlesen").showModal();
    if (nachlesen.stand?.laeuft) einlesenVerfolgen();
  },
  async einlesenOrdner(knopf) {
    const wahl = await api().einlesen_ordner_waehlen();
    if (!wahl) return;
    if (!wahl.mails && !wahl.pdfs) { zeigeMeldung("In diesem Ordner liegen keine Mails (.msg/.eml) oder PDFs.", "warn"); return; }
    nachlesen[knopf.dataset.art] = wahl;
    renderEinlesen();
  },
  async einlesenStarten() {
    const r = await api().einlesen_starten(nachlesen.ordner?.ordner || "", nachlesen.basis?.ordner || "");
    if (!r.ok) { zeigeMeldung(r.fehler, "x", true); return; }
    nachlesen.stand = { laeuft: true, phase: "start", i: 0, n: 0 };
    einlesenVerfolgen();
  },
  async einlesenAbbrechen() { await api().einlesen_abbrechen(); },
  einlesenZurueck() { nachlesen.stand = null; renderEinlesen(); },
  einlesenSchliessen: () => $("#dialog-einlesen").close(),
  async einlesenFertig() {
    const offen = nachlesen.stand?.ergebnis?.offen;
    nachlesen.stand = null;
    $("#dialog-einlesen").close();
    fahrzeugListe = null;
    if (offen) { abFilter = "offen"; abGewaehlt = null; }
    zeigeBereich("abs");
    await ladeAbs();
  },
  vergleichZuruecksetzen() { vergleichNr++; vergleichDateien[0] = vergleichDateien[1] = null; renderVergleichDialog(null); },
  async designWechseln() {
    const jetzt = document.documentElement.dataset.theme || "auto";
    const naechstes = DESIGNS[(DESIGNS.indexOf(jetzt) + 1) % DESIGNS.length];
    setzeDesign(naechstes);
    zeigeMeldung(`Design: ${DESIGN_TEXT[naechstes]}`, DESIGN_ICON[naechstes]);
    try { await api().design(naechstes); } catch (e) { /* nur für diese Sitzung */ }
  },
  async oeffnePfad(knopf) {
    if (!(await api().oeffne(knopf.dataset.pfad))) zeigeMeldung("Ordner oder Datei nicht gefunden oder ließ sich nicht öffnen.", "x", true);
  },
});

let vergleichSlot = 0;
document.addEventListener("click", (ev) => {
  const stilKnopf = ev.target.closest("[data-stil-wahl]");
  if (stilKnopf) {
    setzeStil(stilKnopf.dataset.stilWahl);
    try { api().stil(stilKnopf.dataset.stilWahl).catch(() => {}); } catch (e) { /* nur für diese Sitzung */ }
    return;
  }
  const reiter = ev.target.closest(".reiter-knopf[data-bereich]");
  if (reiter) { zeigeBereich(reiter.dataset.bereich); return; }
  const abZeile = ev.target.closest("[data-ab]");
  if (abZeile) { waehleAb(abZeile.dataset.ab); return; }
  const filterKnopf = ev.target.closest("[data-abstatus]");
  if (filterKnopf) { abFilter = filterKnopf.dataset.abstatus; abGewaehlt = null; renderAbs(); return; }
  const regelKnopf = ev.target.closest("[data-stumm], [data-laut]");
  if (regelKnopf) { stummSchalten(regelKnopf.dataset, regelKnopf.hasAttribute("data-stumm")); return; }
  const regelWeg = ev.target.closest("[data-regel-weg]");
  if (regelWeg) { regelEntfernen(regelWeg.dataset.regelWeg); return; }
  const zuWeg = ev.target.closest("[data-zuordnung-weg]");
  if (zuWeg) { zuordnungEntfernen(zuWeg.dataset.zuordnungWeg); return; }
  const syPasst = ev.target.closest("[data-sy-passt]");
  if (syPasst) { syscaraPasst(Number(syPasst.dataset.syPasst), syscaraOrtVon(syPasst)); return; }
  const syZu = ev.target.closest("[data-sy-zuordnen]");
  if (syZu) { oeffneZuordnen(Number(syZu.dataset.syZuordnen), syscaraOrtVon(syZu)); return; }
  const syNurAb = ev.target.closest("[data-sy-nurab]");
  if (syNurAb) {
    const pos = syNurAb.dataset.syNurab;
    syscaraAktion(syscaraOrtVon(syNurAb), (z) => api().syscara_nur_ab(z.fahrzeug.pfad, pos), "Gemerkt: diese Position steht nie in Syscara.");
    return;
  }
  const syLoesen = ev.target.closest("[data-sy-loesen]");
  if (syLoesen) {
    const id = syLoesen.dataset.syLoesen;
    syscaraAktion(syscaraOrtVon(syLoesen), async (z) => { await api().syscara_zuordnung_entfernen(id); return (await api().ab_details(z.fahrzeug.pfad, null, null)).zeile; },
      "Zuordnung entfernt – ODIN gleicht neu ab.");
    return;
  }
  const haken = ev.target.closest("[data-abhaken]");
  if (haken) { abhaken(haken.dataset.abhaken, haken.getAttribute("aria-pressed") !== "true"); return; }
  const verlauf = ev.target.closest("[data-verlauf]");
  if (verlauf) { waehleAb(abGewaehlt, { datei: verlauf.dataset.verlauf }); return; }
  const fzZeile = ev.target.closest("tr[data-fahrzeug]");
  if (fzZeile && !ev.target.closest("button")) {
    if (fzZeile.dataset.anzahlAbs === "0") {
      zeigeMeldung(`${fzZeile.dataset.fahrzeug}: noch keine AB. Sobald sie kommt, legt ODIN sie in diesen Ordner und zeigt sie unter „ABs“.`, "uhr");
      return;
    }
    abSuche = fzZeile.dataset.fahrzeug;
    $("#ab-suche").value = abSuche;
    abHersteller = "";
    $("#ab-hersteller").value = "";
    abFilter = "alle";
    abGewaehlt = null;
    zeigeBereich("abs");
    return;
  }
  const jahr = ev.target.closest("[data-jahr]");
  if (jahr) { fzJahr = jahr.dataset.jahr; renderFahrzeuge(); return; }
  const h = ev.target.closest("[data-hersteller]");
  if (h) { dialogZustand.hersteller = h.dataset.hersteller; aktualisiereDialog(); return; }
  if (ev.target.closest("#f-datei")) $("#f-datei-input").click();
  const slot = ev.target.closest("[data-slot]");
  if (slot) { vergleichSlot = Number(slot.dataset.slot); $("#vergleich-input").click(); }
});

$("#ab-suche").addEventListener("input", (ev) => { abSuche = ev.target.value; renderAbs(); });
$("#ab-hersteller").addEventListener("change", (ev) => { abHersteller = ev.target.value; renderAbs(); });
$("#fz-suche").addEventListener("input", (ev) => { fzSuche = ev.target.value; renderFahrzeuge(); });
$("#form-fahrzeug").addEventListener("submit", dialogAbsenden);
$("#form-fahrzeug").addEventListener("input", () => { $("#f-fehler").hidden = true; aktualisiereDialog(); });
$("#f-datei").addEventListener("keydown", (ev) => { if (ev.key === "Enter" || ev.key === " ") { ev.preventDefault(); $("#f-datei-input").click(); } });
$("#f-datei-input").addEventListener("change", async (ev) => {
  if (ev.target.files.length) [dialogZustand.datei] = await dateienAlsBase64([ev.target.files[0]]);
  aktualisiereDialog();
});
$("#dialog-einlesen").addEventListener("cancel", (ev) => { if (nachlesen.stand?.laeuft) ev.preventDefault(); });
$("#dialog-einlesen").addEventListener("close", () => { if (nachlesen.stand?.ergebnis) aktionen.einlesenFertig(); });
$("#zuordnen-liste").addEventListener("change", aktualisiereZuordnen);
$("#vergleich-input").addEventListener("change", (ev) => { nimmVergleichsdateien(ev.target.files, vergleichSlot); ev.target.value = ""; });

document.addEventListener("keydown", (ev) => {
  if (!bereichAktiv("abs") || document.querySelector("dialog[open]") || abPrueftGerade) return;
  if (["TEXTAREA", "INPUT", "SELECT"].includes(document.activeElement.tagName) || ev.ctrlKey || ev.metaKey || ev.altKey) return;
  const zeilen = sichtbareAbs();
  const i = zeilen.findIndex((x) => schluessel(x) === abGewaehlt);
  if (ev.key === "ArrowDown" && zeilen[i + 1]) { ev.preventDefault(); waehleAb(schluessel(zeilen[i + 1])); }
  else if (ev.key === "ArrowUp" && i > 0) { ev.preventDefault(); waehleAb(schluessel(zeilen[i - 1])); }
  else if (abFreierVergleich) return;                     // Einzelansicht ändert keinen Status
  else if (ev.key.toLowerCase() === "e") setzeAbStatus("erledigt");
  else if (ev.key.toLowerCase() === "k") setzeAbStatus("klaerung");
  else if (ev.key.toLowerCase() === "o") setzeAbStatus("offen");
});

// Drag & Drop je nach Reiter (app.js fragt hier zuerst)
window.dropZiel = (dateien, ev) => {
  const pdfs = [...dateien].filter((d) => d.name.toLowerCase().endsWith(".pdf"));
  const abDateien = [...dateien].filter((d) => /\.(pdf|msg|eml)$/i.test(d.name));
  if ($("#dialog-einlesen").open) { zeigeMeldung("Bitte den Ordner über „Ordner wählen“ auswählen.", "folder"); return true; }
  if ($("#dialog-fahrzeug").open) {
    if (pdfs.length) dateienAlsBase64([pdfs[0]]).then(([d]) => { dialogZustand.datei = d; aktualisiereDialog(); });
    return true;
  }
  if ($("#dialog-vergleich").open) {
    const zone = ev?.target?.closest?.("[data-slot]");
    nimmVergleichsdateien(dateien, zone ? Number(zone.dataset.slot) : null);
    return true;
  }
  if (bereichAktiv("ausstattung")) {
    if (!ablage.gueltig) { zeigeMeldung("Bitte zuerst den Ordner „Fahrzeuge“ wählen.", "folder"); return true; }
    const exporte = [...dateien].filter((d) => /\.(xlsx|xlsm|csv)$/i.test(d.name));
    if (!exporte.length) { zeigeMeldung("Hier bitte einen Syscara-Export (.xlsx oder .csv) ablegen. ABs gehören in den Reiter „Auftragsbestätigungen“.", "x", true); return true; }
    if (exporte.length > 1) zeigeMeldung("Bitte nur einen Syscara-Export auf einmal – genommen wird der erste.", "warn");
    dateienAlsBase64([exporte[0]]).then(([d]) => syscaraEinlesen({ name: d.name, b64: d.b64 }));
    return true;
  }
  if (bereichAktiv("abs")) {
    if (!ablage.gueltig) { zeigeMeldung("Bitte zuerst den Ordner „Fahrzeuge“ wählen.", "folder"); return true; }
    const exporte = [...dateien].filter((d) => /\.(xlsx|xlsm|csv)$/i.test(d.name));
    if (exporte.length) {
      if (exporte.length > 1) zeigeMeldung("Bitte nur einen Syscara-Export auf einmal – genommen wird der erste.", "warn");
      dateienAlsBase64([exporte[0]]).then(([d]) => syscaraEinlesen({ name: d.name, b64: d.b64 }));
      if (!abDateien.length) return true;
    }
    if (!abDateien.length) { zeigeMeldung("Nur PDFs, gespeicherte Mails (.msg, .eml) oder ein Syscara-Export (.xlsx, .csv) gehen hier.", "x", true); return true; }
    dateienAlsBase64(abDateien)
      .then((liste) => Promise.allSettled(liste.map((d) => api().ab_hinzufuegen(d.name, d.b64))))
      .then((ergebnisse) => {
        const anzahl = ergebnisse.reduce((a, r) => a + (r.status === "fulfilled" ? r.value : 0), 0);
        const fehler = ergebnisse.filter((r) => r.status === "rejected").map((r) => String(r.reason?.message || r.reason));
        if (fehler.length) zeigeMeldung(fehler.join(" "), "x", true);
        if (!anzahl) { if (!fehler.length) zeigeMeldung("Keine AB im Anhang gefunden.", "warn"); return; }
        return eingangPruefen();
      })
      .catch((e) => zeigeMeldung(String(e.message || e), "x", true));
    return true;
  }
  if (bereichAktiv("fahrzeuge")) {
    zeigeMeldung("Preisschilder im Reiter „Preisschilder“, ABs im Reiter „Auftragsbestätigungen“ ablegen.", "warn");
    return true;
  }
  return false;
};

// Beim Start: Design laden, Übersicht laden, neue ABs im Eingang gleich prüfen
async function start() {
  try { setzeDesign(await api().design()); } catch (e) { setzeDesign("auto"); }
  try { setzeStil(await api().stil()); } catch (e) { setzeStil("v3"); }
  await ladeAblageStatus();
  if (!ablage.gueltig) return;
  try { abZeilen = await api().ab_uebersicht(); } catch (e) { abZeilen = []; }
  renderKopfZaehler();
  if (ablage.im_eingang) eingangPruefen({ still: true });
}
setzeDesign("auto");
if (window.pywebview?.api) start(); else window.addEventListener("pywebviewready", start, { once: true });
