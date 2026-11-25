"use strict";

// Zustand ------------------------------------------------------------------
const eintraege = new Map();   // schluessel -> Eintrag
let gewaehlt = null;
let filter = "alle";
let suchtext = "";
let laedt = 0;
let selbstGewaehlt = false;    // hat die Person schon selbst eine Zeile angeklickt?

const $ = (sel, wurzel = document) => wurzel.querySelector(sel);
const icon = (name) => `<svg class="ic" aria-hidden="true"><use href="#i-${name}"/></svg>`;
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

const bereichAktiv = (name) => !$("#odin-bereiche").hidden && !$(`.bereich[data-bereich="${name}"]`).hidden;

function api() {
  if (!window.pywebview || !window.pywebview.api) throw new Error("Programm-Schnittstelle nicht bereit");
  return window.pywebview.api;
}

// Einlesen -----------------------------------------------------------------
async function einlesen(quellen) {
  if (!quellen.length) return;
  const warLeer = !gewaehlt;
  laedt += quellen.length;
  render();
  let ersetzt = [];
  for (const q of quellen) {
    let liste;
    try {
      liste = q.pfad ? await api().lies_pfad(q.pfad) : await api().lies_upload(q.name, q.b64);
    } catch (e) {
      liste = [{ datei: q.pfad || q.name, interne_id: "", hersteller: "", modell: "", fliesstext: "",
                 hinweise: [], weggelassen: [], fehler: String(e.message || e), status: "Fehler" }];
    }
    ersetzt.push(...nimmAuf(liste));     // eine PDF kann mehrere Preisschilder enthalten
    laedt -= 1;
    render();
  }
  // Nach dem Einlesen oben in der sortierten Liste anfangen
  if (warLeer && !selbstGewaehlt && !laedt && sichtbar().length) waehle(sichtbar()[0].schluessel);
  if (ersetzt.length) {
    zeigeMeldung(`${ersetzt.join(", ")} war schon in der Liste und wurde durch die neue Datei ersetzt.`, "warn");
  }
}

// Ergebnisse (aus Preisschild oder Syscara) in die Liste; gibt die Schlüssel zurück, die schon da waren
function nimmAuf(liste) {
  const ersetzt = [];
  for (const erg of liste) {
    const schluessel = erg.interne_id || erg.datei;
    if (eintraege.has(schluessel)) ersetzt.push(schluessel);
    if (schluessel === gewaehlt) $("#detail").dataset.schluessel = "";    // Textfeld mit dem neuen Text aufbauen
    eintraege.set(schluessel, { ...erg, schluessel, original: erg.fliesstext, erledigt: false,
      mobile: { modell: erg.modell_kurz || "", werbetext: (erg.werbetext || "").slice((erg.modell_kurz || "").length).trim(),
                gewaehlt: null, auswahl: null, manuell: false } });
    if (!gewaehlt) gewaehlt = schluessel;
  }
  return ersetzt;
}

function leseDateien(dateien) {
  const pdfs = [...dateien].filter((d) => d.name.toLowerCase().endsWith(".pdf"));
  if (!pdfs.length) {
    zeigeMeldung("Nur PDF-Dateien können eingelesen werden.", "x", true);
    return;
  }
  Promise.all(pdfs.map((d) => new Promise((ok, fehler) => {
    const r = new FileReader();
    r.onload = () => ok({ name: d.name, b64: String(r.result).split(",")[1] });
    r.onerror = () => fehler(r.error);
    r.readAsDataURL(d);
  }))).then(einlesen).catch((e) => zeigeMeldung(`Datei nicht lesbar: ${e}`, "x", true));
}

// Ansicht ------------------------------------------------------------------
// Nach Interner ID, Preisschilder ohne ID ans Ende
const nachId = (a, b) => (!a.interne_id - !b.interne_id) || (a.interne_id || "").localeCompare(b.interne_id || "")
  || a.datei.localeCompare(b.datei);

function sichtbar() {
  const s = suchtext.toLowerCase();
  return [...eintraege.values()]
    .filter((e) => {
      if (filter === "offen" && e.erledigt) return false;
      if (filter === "pruefen" && e.status === "OK") return false;
      if (filter === "erledigt" && !e.erledigt) return false;
      if (s && !`${e.interne_id} ${e.hersteller} ${e.modell} ${e.datei}`.toLowerCase().includes(s)) return false;
      return true;
    })
    .sort(nachId);
}

// Ist das gewählte Fahrzeug durch Filter oder Suche ausgeblendet, das erste sichtbare wählen (oder keins)
function auswahlSichtbarHalten() {
  const zeilen = sichtbar();
  if (zeilen.some((e) => e.schluessel === gewaehlt)) return;
  gewaehlt = zeilen.length ? zeilen[0].schluessel : null;
  $("#detail").dataset.schluessel = "";
}

function render() {
  const leer = eintraege.size === 0 && laedt === 0;
  $("#leer").hidden = !leer;
  $("#arbeit").hidden = leer;
  renderZaehler();
  if (leer) return;
  auswahlSichtbarHalten();
  renderListe();
  renderDetail();
}

function renderZaehler() {
  const alle = [...eintraege.values()];
  const erledigt = alle.filter((e) => e.erledigt).length;
  const pruefen = alle.filter((e) => e.status !== "OK").length;
  if (bereichAktiv("preisschilder")) {
    $("#zaehler").innerHTML = alle.length
      ? `<b>${alle.length}</b> Preisschilder · <b>${erledigt}</b> erledigt · <b>${pruefen}</b> prüfen`
      : "";
  }
  const anzahl = { alle: alle.length, offen: alle.length - erledigt, pruefen, erledigt };
  document.querySelectorAll(".filter-knopf[data-filter]").forEach((k) => {
    const name = { alle: "Alle", offen: "Offen", pruefen: "Prüfen", erledigt: "Erledigt" }[k.dataset.filter];
    k.innerHTML = `${name}<span class="anzahl">${anzahl[k.dataset.filter]}</span>`;
  });
}

function statusMarke(e) {
  if (e.status === "Fehler") return `<span class="marke-status fehler">${icon("x")}Fehler</span>`;
  if (e.status === "Prüfen") return `<span class="marke-status pruefen">${icon("warn")}Prüfen</span>`;
  return `<span class="marke-status hersteller">${esc(e.hersteller)}</span>`;
}

function renderListe() {
  const liste = $("#liste");
  const zeilen = sichtbar();
  let html = zeilen.map((e, i) => `
    <div class="zeile${e.schluessel === gewaehlt ? " gewaehlt" : ""}${e.erledigt ? " erledigt" : ""}"
         role="option" aria-selected="${e.schluessel === gewaehlt}" data-schluessel="${esc(e.schluessel)}" style="--i:${Math.min(i, 12)}">
      <span class="haken">${icon("check")}</span>
      <span class="infos">
        <div class="kennung">${esc(e.interne_id || "Ohne ID")}</div>
        <div class="modell">${esc([e.hersteller, e.modell].filter(Boolean).join(" ") || e.datei)}</div>
      </span>
      ${statusMarke(e)}
    </div>`).join("");
  for (let i = 0; i < laedt; i++) {
    html += `<div class="zeile skelett"><span class="haken"></span>
      <span class="infos"><div class="balken" style="width:96px"></div><div class="balken" style="width:180px;margin-top:8px"></div></span><span></span></div>`;
  }
  if (!zeilen.length && !laedt) {
    html = `<div class="detail"><p class="erklaerung">Keine Fahrzeuge für diesen Filter.</p></div>`;
  }
  // Animation nur beim ersten Erscheinen, nicht bei jedem Neuzeichnen
  const schonDa = new Set([...liste.querySelectorAll(".zeile[data-schluessel]")].map((z) => z.dataset.schluessel));
  liste.innerHTML = html;
  liste.querySelectorAll(".zeile[data-schluessel]").forEach((z) => {
    if (schonDa.has(z.dataset.schluessel)) z.style.animation = "none";
  });
}

function renderDetail() {
  const d = $("#detail");
  const e = eintraege.get(gewaehlt);
  if (!e) {
    d.dataset.schluessel = "";
    d.innerHTML = laedt ? "" : `<p class="erklaerung">${sichtbar().length ? "Links ein Fahrzeug auswählen." : "Kein Fahrzeug für diesen Filter oder diese Suche."}</p>`;
    return;
  }
  if ($("#textfeld") && d.dataset.schluessel === e.schluessel) {
    aktualisiereDetailKopf(e);   // Textfeld nicht neu aufbauen, sonst springt der Cursor
    return;
  }
  d.dataset.schluessel = e.schluessel;
  const hinweise = [
    ...(e.fehler ? [`<div class="hinweis fehler">${icon("x")}<span>${esc(e.fehler)}</span></div>`] : []),
    ...e.hinweise.map((h) => `<div class="hinweis warnung">${icon("warn")}<span>${esc(h)}</span></div>`),
  ].join("");
  d.innerHTML = `
    <div class="ueber">${esc(e.hersteller || "Hersteller unbekannt")}</div>
    <h2>${esc(e.interne_id || "Ohne Interne ID")}</h2>
    <div class="untertitel">${esc(e.modell)}</div>
    ${hinweise ? `<div class="abschnitt">${hinweise}</div>` : ""}
    <div class="abschnitt">
      <div class="feldkopf"><label for="textfeld">Fließtext</label><span class="klein" id="zeichen"></span></div>
      <textarea id="textfeld" class="textfeld" spellcheck="false">${esc(e.fliesstext)}</textarea>
      <div class="aktionen">
        <button class="knopf primaer gross" data-aktion="kopieren" ${e.fliesstext ? "" : "disabled"}>
          ${icon("copy")}Kopieren und weiter<kbd>Strg+Enter</kbd></button>
        <button class="knopf gross" data-aktion="erledigt" id="erledigt-knopf"></button>
        <span class="klein" id="geaendert-info"></span>
      </div>
    </div>
    ${mobileHtml(e)}
    ${e.weggelassen.length ? `
    <div class="abschnitt">
      <h3>Weggelassen</h3>
      <p class="erklaerung">Blöcke ohne eigenen Preis, z. B. Serienausstattung oder Unterpakete.</p>
      <ul class="weggelassen">${e.weggelassen.map((w) => `<li>${icon("minus")}<span>${esc(w)}</span></li>`).join("")}</ul>
    </div>` : ""}
    <div class="datei">${e.quelle === "Syscara" ? "Quelle: Syscara-Schnittstelle" : `Datei: ${esc(e.datei)}`}${e.pfad ? ` · <button class="link" data-aktion="oeffnePfad" data-pfad="${esc(e.pfad)}">PDF öffnen</button>` : ""}</div>`;
  const feld = $("#textfeld");
  passeHoeheAn(feld);
  feld.addEventListener("input", () => {
    e.fliesstext = feld.value;
    passeHoeheAn(feld);
    aktualisiereDetailKopf(e);
  });
  aktualisiereDetailKopf(e);
  verbindeMobile(e);
}

// mobile.de: Modell + Werbetext (zusammen höchstens 48 Zeichen) -------------
const MOBILE_GRENZE = 48;
const euro = (n) => `${Number(n).toLocaleString("de-DE")} €`;
const mobileGesamt = (m) => `${m.modell.trim()} ${m.werbetext.trim()}`.trim();

function mobileHtml(e) {
  if (!e.werbe_optionen?.length && !e.mobile?.modell) return "";
  return `
    <div class="abschnitt mobile-de">
      <div class="feldkopf"><label for="mobile-text">mobile.de: Baureihe/Modell und Werbetext</label><span class="klein" id="mobile-zaehler"></span></div>
      <div class="mobile-zeile">
        <input id="mobile-modell" class="textfeld mobile-modell" spellcheck="false" aria-label="Baureihe und Modell" placeholder="Baureihe und Modell" title="Zählt bei mobile.de mit (die Marke nicht)" value="${esc(e.mobile.modell)}">
        <input id="mobile-text" class="textfeld mobile-text" spellcheck="false" aria-label="Werbetext" value="${esc(e.mobile.werbetext)}">
      </div>
      <div class="mobile-optionen" id="mobile-optionen"></div>
      <div class="aktionen">
        <button class="knopf" data-aktion="mobileKopieren">${icon("copy")}Werbetext kopieren</button>
        <button class="knopf leise" data-aktion="mobileAutomatisch" id="mobile-auto">Automatisch</button>
        <span class="klein" id="mobile-info"></span>
      </div>
    </div>`;
}

function aktualisiereMobile(e) {
  const zaehler = $("#mobile-zaehler");
  if (!zaehler) return;
  const m = e.mobile;
  const laenge = mobileGesamt(m).length;
  zaehler.textContent = `${laenge} / ${MOBILE_GRENZE} Zeichen`;
  zaehler.classList.toggle("zu-lang", laenge > MOBILE_GRENZE);
  const an = new Set(m.auswahl || []);
  $("#mobile-optionen").innerHTML = (e.werbe_optionen || []).map((o) => `
    <button type="button" class="option-chip${an.has(o.id) ? " an" : ""}" data-option="${esc(o.id)}"${m.modell.trim() ? "" : " disabled"}
      title="${esc(o.quelle)} · ${o.echt ? "Preis laut Preisschild" : "Richtwert"}">${an.has(o.id) ? icon("check") : icon("plus")}${esc(o.kurz)}${o.wert ? `<span>${o.echt ? "" : "ca. "}${euro(o.wert)}</span>` : ""}</button>`).join("");
  $("#mobile-info").textContent = !m.modell.trim() && !m.manuell ? "Erst Baureihe und Modell eintragen – sie zählen zu den 48 Zeichen."
    : m.manuell ? "Von Hand geändert" : m.gewaehlt ? "Eigene Auswahl" : "Automatisch: die wertvollsten Merkmale, die passen";
  $("#mobile-auto").hidden = !m.manuell && !m.gewaehlt;
}

let mobileTimer;
async function baueMobile(e) {
  const m = e.mobile;
  if (!m.modell.trim()) {
    m.werbetext = ""; m.auswahl = []; m.manuell = false;
    if ($("#mobile-text") && gewaehlt === e.schluessel) { $("#mobile-text").value = ""; aktualisiereMobile(e); }
    return;
  }
  try {
    const r = await api().werbetext(e.werbe_optionen || [], m.modell, m.gewaehlt);
    if (e.mobile !== m) return;                         // inzwischen neu eingelesen
    m.werbetext = r.werbetext;
    m.auswahl = r.gewaehlt;
    m.manuell = false;
    if ($("#mobile-text") && gewaehlt === e.schluessel) $("#mobile-text").value = m.werbetext;
  } catch (fehler) { zeigeMeldung(String(fehler.message || fehler), "x", true); }
  if (gewaehlt === e.schluessel) aktualisiereMobile(e);
}

function verbindeMobile(e) {
  if (!$("#mobile-text")) return;
  if (e.mobile.auswahl === null) baueMobile(e); else aktualisiereMobile(e);
  $("#mobile-modell").addEventListener("input", (ev) => {
    e.mobile.modell = ev.target.value;
    clearTimeout(mobileTimer);
    if (e.mobile.manuell) { aktualisiereMobile(e); return; }
    mobileTimer = setTimeout(() => baueMobile(e), 150);
  });
  $("#mobile-text").addEventListener("input", (ev) => {
    e.mobile.werbetext = ev.target.value;
    e.mobile.manuell = true;
    aktualisiereMobile(e);
  });
  $("#mobile-optionen").addEventListener("click", (ev) => {
    const chip = ev.target.closest("[data-option]");
    if (!chip) return;
    const ids = new Set(e.mobile.auswahl || []);
    if (ids.has(chip.dataset.option)) ids.delete(chip.dataset.option); else ids.add(chip.dataset.option);
    e.mobile.gewaehlt = (e.werbe_optionen || []).map((o) => o.id).filter((id) => ids.has(id));   // Reihenfolge nach Wert
    baueMobile(e);
  });
}

function aktualisiereDetailKopf(e) {
  const feld = $("#textfeld");
  const geaendert = e.fliesstext !== e.original;
  feld.classList.toggle("geaendert", geaendert);
  $("#zeichen").textContent = `${e.fliesstext.length} Zeichen`;
  $("#erledigt-knopf").innerHTML = e.erledigt ? `${icon("minus")}Wieder öffnen` : `${icon("check")}Als erledigt markieren`;
  $("#geaendert-info").innerHTML = geaendert
    ? `Von Hand geändert · <button data-aktion="zuruecksetzen">Original wiederherstellen</button>` : "";
  $('[data-aktion="kopieren"]').disabled = !e.fliesstext.trim();
}

function passeHoeheAn(feld) {
  feld.style.height = "auto";
  feld.style.height = `${Math.max(150, feld.scrollHeight + 2)}px`;
}

function waehle(schluessel) {
  gewaehlt = schluessel;
  $("#detail").dataset.schluessel = "";
  render();
  const z = $(`.zeile[data-schluessel="${CSS.escape(schluessel)}"]`);
  if (z) z.scrollIntoView({ block: "nearest" });
}

function nachbar(richtung) {
  const zeilen = sichtbar();
  const i = zeilen.findIndex((e) => e.schluessel === gewaehlt);
  const n = zeilen[i + richtung];
  if (n) { selbstGewaehlt = true; waehle(n.schluessel); }
}

let meldungTimer;
function zeigeMeldung(text, ic = "check", fehler = false) {
  const m = $("#meldung");
  m.className = `meldung${fehler ? " fehler" : ""}`;
  m.innerHTML = `${icon(ic)}<span>${esc(text)}</span>`;
  m.hidden = false;
  m.style.animation = "none"; void m.offsetWidth; m.style.animation = "";
  clearTimeout(meldungTimer);
  meldungTimer = setTimeout(() => { m.hidden = true; }, fehler ? 6000 : 3500);
}

// Aktionen -----------------------------------------------------------------
const aktionen = {
  async dateien() { einlesen((await api().dateien_waehlen()).map((pfad) => ({ pfad }))); },
  async ordner() {
    const pfade = await api().ordner_waehlen();
    if (pfade === null) return;                          // abgebrochen
    if (pfade.length) einlesen(pfade.map((pfad) => ({ pfad })));
    else zeigeMeldung("In diesem Ordner liegen keine PDF-Dateien.", "warn");
  },
  async kopieren() {
    const e = eintraege.get(gewaehlt);
    if (!e || !e.fliesstext.trim()) return;
    await api().kopiere(e.fliesstext.trim());
    const zeilen = sichtbar();
    const i = zeilen.findIndex((x) => x.schluessel === e.schluessel);
    e.erledigt = true;
    zeigeMeldung(`${e.interne_id || e.datei} kopiert. In der Bestandsliste mit Strg+V einfügen.`);
    const naechste = zeilen.slice(i + 1).find((x) => !x.erledigt) || zeilen.find((x) => !x.erledigt);
    selbstGewaehlt = true;
    if (naechste) waehle(naechste.schluessel); else { $("#detail").dataset.schluessel = ""; render(); }
  },
  erledigt() {
    const e = eintraege.get(gewaehlt);
    if (!e) return;
    const zeilen = sichtbar();
    const i = zeilen.findIndex((x) => x.schluessel === e.schluessel);
    e.erledigt = !e.erledigt;
    if (sichtbar().some((x) => x.schluessel === e.schluessel)) { render(); return; }
    const rest = zeilen.filter((x) => x !== e);
    if (rest.length) waehle(rest[Math.min(i, rest.length - 1)].schluessel);
    else { gewaehlt = null; render(); }
  },
  zuruecksetzen() {
    const e = eintraege.get(gewaehlt);
    if (!e) return;
    e.fliesstext = e.original;
    $("#detail").dataset.schluessel = "";
    render();
  },
  mobileAutomatisch() {
    const e = eintraege.get(gewaehlt);
    if (!e) return;
    e.mobile.gewaehlt = null;
    baueMobile(e);
  },
  async mobileKopieren() {
    const e = eintraege.get(gewaehlt);
    const werbetext = e?.mobile?.werbetext?.trim();
    if (!werbetext) return;
    await api().kopiere(werbetext);                      // nur der Werbetext – Baureihe/Modell steht bei mobile.de schon da
    const laenge = mobileGesamt(e.mobile).length;
    const zuLang = laenge > MOBILE_GRENZE;
    zeigeMeldung(zuLang ? `Werbetext kopiert – aber zusammen mit dem Modell ${laenge} Zeichen, mobile.de erlaubt ${MOBILE_GRENZE}.`
      : `Werbetext kopiert: „${werbetext}“`, zuLang ? "warn" : "copy", zuLang);
  },
  leeren() {
    if (!eintraege.size || !confirm("Alle Fahrzeuge aus der Liste entfernen?")) return;
    eintraege.clear();
    gewaehlt = null;
    selbstGewaehlt = false;
    render();
  },
  async export() {
    if (!eintraege.size) { zeigeMeldung("Noch keine Preisschilder eingelesen.", "warn"); return; }
    const zeilen = [...eintraege.values()]
      .sort(nachId)
      .map((e) => ({ datei: e.datei, interne_id: e.interne_id, hersteller: e.hersteller, modell: e.modell,
        fliesstext: e.fliesstext, hinweise: e.hinweise, weggelassen: e.weggelassen, fehler: e.fehler,
        werbetext: e.mobile?.werbetext ?? "" }));
    const r = await api().exportiere(zeilen);
    if (r.ok) zeigeMeldung(`Gespeichert: ${r.pfad}`, "sheet");
    else if (r.fehler) zeigeMeldung(r.fehler, "x", true);
  },
};

document.addEventListener("click", (ev) => {
  const knopf = ev.target.closest("[data-aktion]");
  if (knopf) {
    const aktion = aktionen[knopf.dataset.aktion];
    if (aktion) Promise.resolve(aktion(knopf)).catch((e) => zeigeMeldung(String(e.message || e), "x", true));
    return;
  }
  const f = ev.target.closest(".filter-knopf[data-filter]");
  if (f) {
    filter = f.dataset.filter;
    document.querySelectorAll(".filter-knopf[data-filter]").forEach((k) => k.classList.toggle("aktiv", k === f));
    render();
    return;
  }
  const z = ev.target.closest(".zeile[data-schluessel]");
  if (z) { selbstGewaehlt = true; waehle(z.dataset.schluessel); }
});

$("#suche").addEventListener("input", (ev) => { suchtext = ev.target.value; render(); });

document.addEventListener("keydown", (ev) => {
  if (!bereichAktiv("preisschilder") || document.querySelector("dialog[open]")) return;
  if (ev.ctrlKey && ev.key === "Enter") {
    ev.preventDefault();
    const imMobile = ev.target.closest?.(".mobile-de");
    Promise.resolve(imMobile ? aktionen.mobileKopieren() : aktionen.kopieren()).catch((e) => zeigeMeldung(String(e.message || e), "x", true));
    return;
  }
  const imFeld = ["TEXTAREA", "INPUT"].includes(document.activeElement.tagName);
  if (imFeld) return;
  if (ev.key === "ArrowDown") { ev.preventDefault(); nachbar(1); }
  if (ev.key === "ArrowUp") { ev.preventDefault(); nachbar(-1); }
});

// Syscara-Schnittstelle: Fahrzeuge mit vollständiger Ausstattung statt Preisschild ------------
let syscaraBenutzer = "";
let syscaraAendern = false;          // Formular für den Zugang zeigen
let syscaraHatRohdaten = false;
let syscaraHinweis = { text: "", warnung: false };   // Zugang nur bis zum Schließen / ältere unsichere Datei

function syscaraFehler(text) {
  const f = $("#syscara-fehler");
  f.textContent = text || "";
  f.hidden = !text;
}

function renderSyscaraDialog() {
  syscaraFehler("");
  if (syscaraAendern) {
    $("#syscara-inhalt").innerHTML = `
      <div class="feld-reihe">
        <label class="feld"><span class="feld-label">Benutzername</span>
          <input id="sy-benutzer" autocomplete="username" spellcheck="false" value="${esc(syscaraBenutzer)}"></label>
        <label class="feld"><span class="feld-label">Passwort</span>
          <input id="sy-passwort" type="password" autocomplete="current-password"></label>
      </div>
      <p class="feld-hilfe">Den Zugang bekommst du von Syscara. ODIN liest damit nur und speichert ihn nur auf diesem Rechner –
        unter Windows verschlüsselt für dein Benutzerkonto, am Mac im Schlüsselbund. Nicht im Ordner „Fahrzeuge“.</p>`;
    $("#syscara-fuss").innerHTML = `<span class="vorschau"></span>
      <button type="button" class="knopf" data-aktion="syscaraSchliessen">Abbrechen</button>
      <button type="submit" class="knopf primaer" id="sy-zugang-ok">Prüfen und speichern</button>`;
    return;
  }
  const ids = $("#sy-ids")?.value || "", tage = $("#sy-tage")?.value || "14";
  $("#syscara-inhalt").innerHTML = `
    <p class="syscara-angemeldet">Verbunden als <b>${esc(syscaraBenutzer)}</b> ·
      <button type="button" class="link" data-aktion="syscaraZugangAendern">Zugang ändern</button> ·
      <button type="button" class="link" data-aktion="syscaraAbmelden">abmelden</button></p>
    ${syscaraHinweis.text ? `<p class="feld-hilfe syscara-hinweis${syscaraHinweis.warnung ? " warnung" : ""}">${esc(syscaraHinweis.text)}</p>` : ""}
    <div class="feld">
      <label class="feld-label" for="sy-ids">Interne IDs</label>
      <textarea id="sy-ids" rows="3" spellcheck="false" placeholder="z. B. DRM00297, SLKW00299 – auch eine ganze Spalte aus Excel einfügen">${esc(ids)}</textarea>
      <span class="feld-hilfe">Leer lassen: alle Fahrzeuge, die in den letzten<input class="tage" id="sy-tage" type="number" min="1" max="365"
        value="${esc(tage)}" aria-label="Tage">Tagen in Syscara geändert wurden.</span>
    </div>`;
  $("#syscara-fuss").innerHTML = `<span class="vorschau">${syscaraHatRohdaten ? `<button type="button" class="link klein" data-aktion="syscaraRohdaten"
      title="Die zuletzt geholten Daten als Datei, z. B. für Rückfragen (ohne Passwort)">Rohdaten speichern</button>` : ""}</span>
    <button type="button" class="knopf" data-aktion="syscaraSchliessen">Abbrechen</button>
    <button type="submit" class="knopf primaer" id="sy-holen">${icon("syscara")}Holen</button>`;
}

async function syscaraZugangSpeichern() {
  const benutzer = $("#sy-benutzer").value.trim(), passwort = $("#sy-passwort").value;
  if (!benutzer || !passwort) { syscaraFehler("Bitte Benutzername und Passwort eingeben."); return; }
  const knopf = $("#sy-zugang-ok");
  knopf.disabled = true;
  knopf.textContent = "Prüfe …";
  let r;
  try { r = await api().syscara_zugang_speichern(benutzer, passwort); } catch (e) { r = { ok: false, fehler: String(e.message || e) }; }
  if (!r.ok) {
    knopf.disabled = false;
    knopf.textContent = "Prüfen und speichern";
    syscaraFehler(r.fehler);
    return;
  }
  syscaraBenutzer = r.benutzer;
  syscaraAendern = false;
  syscaraHinweis = { text: r.hinweis || "", warnung: false };
  renderSyscaraDialog();
  zeigeMeldung(r.wie === "Sitzung" ? "Verbunden mit Syscara – Zugang wird nur bis zum Schließen gemerkt (kein sicherer Speicher auf diesem Rechner)."
    : `Verbunden mit Syscara – Zugang ${r.wie === "Schlüsselbund" ? "im Schlüsselbund" : "verschlüsselt"} gespeichert.`);
  $("#sy-ids").focus();
}

async function syscaraHolen() {
  const knopf = $("#sy-holen");
  knopf.disabled = true;
  knopf.innerHTML = `${icon("syscara")}Hole …`;
  let r;
  try { r = await api().syscara_fliesstexte($("#sy-ids").value, Number($("#sy-tage").value) || 14); }
  catch (e) { r = { ok: false, fehler: String(e.message || e) }; }
  knopf.disabled = false;
  knopf.innerHTML = `${icon("syscara")}Holen`;
  if (!r.ok) {
    if (r.zugang_fehlt) { syscaraBenutzer = ""; syscaraAendern = true; renderSyscaraDialog(); }
    syscaraFehler(r.fehler);
    return;
  }
  syscaraHatRohdaten = true;
  if (!r.ergebnisse.length) {
    renderSyscaraDialog();
    syscaraFehler(r.nicht_gefunden.length ? `In Syscara nicht gefunden: ${r.nicht_gefunden.join(", ")}`
      : `Keine Fahrzeuge, die seit ${r.seit.split("-").reverse().join(".")} in Syscara geändert wurden.`);
    return;
  }
  $("#dialog-syscara").close();
  const warLeer = !gewaehlt;
  const ersetzt = nimmAuf(r.ergebnisse);
  render();
  if (warLeer && !selbstGewaehlt && sichtbar().length) waehle(sichtbar()[0].schluessel);
  const n = r.ergebnisse.length;
  let text = `${n} Fahrzeug${n === 1 ? "" : "e"} aus Syscara geholt.`;
  if (r.nicht_gefunden.length) text += ` Nicht gefunden: ${r.nicht_gefunden.join(", ")}.`;
  if (ersetzt.length) text += ` Schon in der Liste, neu geholt: ${ersetzt.join(", ")}.`;
  zeigeMeldung(text, r.nicht_gefunden.length ? "warn" : "check", !!r.nicht_gefunden.length);
}

Object.assign(aktionen, {
  async syscaraTexte() {
    try {
      const z = await api().syscara_zugang();
      syscaraBenutzer = z.benutzer || "";
      syscaraHinweis = { text: z.hinweis || "", warnung: !!z.warnung };
    } catch (e) { syscaraBenutzer = ""; }
    syscaraAendern = !syscaraBenutzer;
    renderSyscaraDialog();
    $("#dialog-syscara").showModal();
    (syscaraAendern ? $("#sy-benutzer") : $("#sy-ids")).focus();
  },
  syscaraSchliessen() { $("#dialog-syscara").close(); },
  syscaraZugangAendern() { syscaraAendern = true; renderSyscaraDialog(); $("#sy-passwort").focus(); },
  async syscaraAbmelden() {
    if (!confirm("Syscara-Zugang von diesem Rechner entfernen?")) return;
    await api().syscara_zugang_loeschen();
    syscaraBenutzer = "";
    syscaraAendern = true;
    renderSyscaraDialog();
    zeigeMeldung("Syscara-Zugang entfernt.");
  },
  async syscaraRohdaten() {
    const r = await api().syscara_rohdaten_speichern();
    if (r.ok) zeigeMeldung(`Gespeichert: ${r.pfad}`, "check");
    else if (r.fehler) zeigeMeldung(r.fehler, "x", true);
  },
});

$("#form-syscara").addEventListener("submit", (ev) => {
  ev.preventDefault();
  const schritt = syscaraAendern ? syscaraZugangSpeichern : syscaraHolen;
  Promise.resolve(schritt()).catch((e) => syscaraFehler(String(e.message || e)));
});

// Drag & Drop --------------------------------------------------------------
let ziehTiefe = 0;
const hatDateien = (ev) => [...(ev.dataTransfer?.types || [])].includes("Files");
window.addEventListener("dragenter", (ev) => {
  if (!hatDateien(ev)) return;
  ev.preventDefault();
  ziehTiefe++;
  if ($("#dialog-fahrzeug").open) return;   // im Dialog nimmt das Bestellungs-Feld die Datei
  if (!$("#inhalt").hidden) return;           // Cockpit-Seiten nehmen keine Dateien an
  $("#ablage-text").textContent = bereichAktiv("abs") ? "Loslassen: AB prüfen oder Syscara-Export einlesen" : "Loslassen zum Einlesen";
  $("#ablage").hidden = false;
});
window.addEventListener("dragover", (ev) => { if (hatDateien(ev)) ev.preventDefault(); });
window.addEventListener("dragleave", () => { ziehTiefe = Math.max(0, ziehTiefe - 1); if (!ziehTiefe) $("#ablage").hidden = true; });
window.addEventListener("drop", (ev) => {
  ev.preventDefault();
  ziehTiefe = 0;
  $("#ablage").hidden = true;
  const dateien = ev.dataTransfer?.files;
  if (!dateien?.length) return;
  if (!$("#inhalt").hidden) {
    zeigeMeldung("Preisschilder und ABs bitte in ihrem Bereich ablegen. Excel-Listen richtest du unter „Datenquellen“ ein.", "warn");
    return;
  }
  if (typeof window.dropZiel === "function" && window.dropZiel(dateien, ev)) return;
  leseDateien(dateien);
});

render();
