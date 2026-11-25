// ODIN – Reiter „Ausstattungsvergleich“: jedes Fahrzeug aus Syscara, abgeglichen mit seiner neuesten AB
"use strict";

let syDaten = null;           // {fahrzeuge: [...], export: {stand, datei}} aus api().syscara_uebersicht()
let syFilter = null;          // Gruppe; null = beim nächsten Laden die erste Gruppe mit Fahrzeugen
let sySuche = "";
let syHersteller = "";
let syGewaehlt = null;        // schluessel des gewählten Eintrags
let syDetail = null;          // ab_details des gewählten Fahrzeugs (nur mit AB)
let syImport = null;          // letztes Einlesen: {laeuft} | Ergebnis | {fehler} – bleibt stehen, bis es geschlossen wird

const SY_GRUPPEN = [
  ["abweichung", "Abweichung"], ["unsicher", "Unsicher"], ["passt", "Passt"],
  ["ohne_ab", "Ohne AB"], ["nicht_in_syscara", "Nicht in Syscara"], ["alle", "Alle"],
];
const SY_PUNKT = { abweichung: "offen", unsicher: "klaerung", passt: "ok", ohne_ab: "erledigt", nicht_in_syscara: "erledigt" };

const syEintrag = (key = syGewaehlt) => (syDaten?.fahrzeuge || []).find((f) => f.schluessel === key);
const syKennung = (f) => f.syscara?.interne_id || (f.fahrzeug ? kennungVon(f.fahrzeug) : "") || `Bestellnr. ${f.syscara?.bestellnummer || ""}`;
const syModell = (f) => [f.syscara?.hersteller || f.fahrzeug?.hersteller, f.syscara?.baureihe, f.syscara?.modell]
  .filter(Boolean).join(" ");

syscaraOrte.ausstattung = () => ({
  z: syEintrag()?.zeile, h1: syDetail,
  neu: () => ladeAusstattung({ still: true }),
});

function syZaehlerHtml() {
  if (!syDaten) return "";
  const n = syDaten.fahrzeuge.filter((f) => f.syscara).length;
  return `<b>${n}</b> Fahrzeuge in Syscara`;
}

async function ladeAusstattung({ still = false } = {}) {
  await ladeAblageStatus();
  if (!ablage.gueltig || syImport?.laeuft) { renderAusstattung(); return; }
  if (!syDaten && !still) renderAusstattung();                  // Skelett beim ersten Laden
  try {
    syDaten = await api().syscara_uebersicht();
  } catch (e) {
    zeigeMeldung(`Ausstattungsvergleich nicht lesbar: ${e.message || e}`, "x", true);
    syDaten = syDaten || { fahrzeuge: [], export: null };
  }
  // die AB-Übersicht gleich mitziehen (Status kann sich durch den Abgleich geändert haben)
  const neu = new Map(syDaten.fahrzeuge.filter((f) => f.zeile).map((f) => [f.zeile.fahrzeug.pfad, f.zeile]));
  (abZeilen || []).forEach((z) => { if (neu.has(z.fahrzeug.pfad)) Object.assign(z, neu.get(z.fahrzeug.pfad)); });
  if (!syFilter) syFilter = SY_GRUPPEN.map(([g]) => g).find((g) => syDaten.fahrzeuge.some((f) => f.gruppe === g)) || "alle";
  renderAusstattung({ neuLaden: true });
}

function sichtbareSy() {
  const s = sySuche.trim().toLowerCase();
  const rang = Object.fromEntries(SY_GRUPPEN.map(([g], i) => [g, i]));
  return (syDaten?.fahrzeuge || [])
    .filter((f) => syFilter === "alle" || f.gruppe === syFilter)
    .filter((f) => !syHersteller || (f.syscara?.hersteller || f.fahrzeug?.hersteller) === syHersteller)
    .filter((f) => !s || [syKennung(f), syModell(f), f.syscara?.bestellnummer, f.fahrzeug?.name, ...(f.ausstattung || []),
      ...(f.zeile?.syscara?.kurz || [])].join(" ").toLowerCase().includes(s))
    .sort((a, b) => rang[a.gruppe] - rang[b.gruppe] || syKennung(a).localeCompare(syKennung(b)));
}

function syMarke(f) {
  const sy = f.zeile?.syscara;
  if (f.nicht_lesbar) return `<span class="marke-status pruefen">${icon("warn")}Gerade nicht lesbar</span>`;
  if (f.gruppe === "passt") return `<span class="marke-status ok">${icon("check")}Passt</span>`;
  if (f.gruppe === "unsicher") return `<span class="marke-status pruefen">${icon("warn")}${sy.unsicher} unsicher</span>`;
  if (f.gruppe === "abweichung") {
    if (!sy) return `<span class="marke-status wichtig">${icon("warn")}Kein Abgleich</span>`;
    const teile = [zahlOk(sy.fehlt) && `${zahlOk(sy.fehlt)} fehlt`, zahlOk(sy.nur_ab) && `${zahlOk(sy.nur_ab)} nur in AB`, sy.abweichung && "Nummer",
      zahlOk(sy.unsicher) && `${zahlOk(sy.unsicher)} unsicher`].filter(Boolean);
    return `<span class="marke-status wichtig">${icon("warn")}${teile.join(" · ")}</span>`;
  }
  return `<span class="marke-status neutral">${f.gruppe === "ohne_ab" ? "Ohne AB" : "Nicht in Syscara"}</span>`;
}

function syZeileHtml(f, i) {
  const z = f.zeile;
  const ab = z ? `AB ${datumKurz(z.datum)} · ${esc(STATUS_TEXT[z.status] || z.status)}` : f.nicht_lesbar ? "Fahrzeugordner gerade nicht lesbar"
    : f.fahrzeug ? "noch keine AB" : "noch kein Fahrzeugordner";
  const nummer = f.syscara?.bestellnummer || f.fahrzeug?.auftragsnummer;
  const kurz = (z?.syscara?.kurz || []);
  const punkte = kurz.slice(0, 3).map((k) => `<li>${esc(k)}</li>`).join("") +
    (kurz.length > 3 ? `<li class="mehr">und ${kurz.length - 3} weitere</li>` : "");
  return `<div class="zeile ab-zeile sy-zeile${f.schluessel === syGewaehlt ? " gewaehlt" : ""}" role="option"
      data-sy="${esc(f.schluessel)}" style="--i:${Math.min(i, 12)}">
      <span class="punkt ${esc(SY_PUNKT[f.gruppe] || "")}"></span>
      <span class="infos">
        <div class="kennung">${esc(syKennung(f))}${nummer ? `<span class="nummer">${esc(nummer)}</span>` : ""}</div>
        <div class="modell">${esc(syModell(f))} · ${ab}</div>
        ${punkte ? `<ul class="kurz${kurz.length > 2 ? " eng" : ""}">${punkte}</ul>` : ""}
      </span>
      ${syMarke(f)}
    </div>`;
}

function syKopfHtml() {
  if (syImport?.laeuft) {
    return `<div class="hinweis info sy-kopf">${icon("syscara")}<span><b>Syscara-Export „${esc(syImport.datei)}“ wird eingelesen …</b>
      Bei vielen Fahrzeugen dauert das etwas – ODIN gleicht dabei jede AB mit der Bestellung ab.</span></div>`;
  }
  if (syImport?.fehler) {
    return `<div class="hinweis fehler sy-kopf">${icon("x")}<span><b>Einlesen hat nicht geklappt:</b> ${esc(syImport.fehler)}</span>
      <button class="knopf klein leise" data-aktion="syImportSchliessen">Schließen</button></div>`;
  }
  if (syImport && syImport.aelter && syImport.aelter === syImport.fahrzeuge) {     // nichts übernommen
    const r = syImport, neuester = syDaten?.export?.stand;
    return `<div class="hinweis warnung sy-kopf">${icon("warn")}<span><b>Nichts übernommen:</b> „${esc(r.datei)}“ vom
      ${datumKurz(r.stand)} ${uhrzeit(r.stand)} ist älter als der schon eingelesene Export${neuester ? ` (vom ${datumKurz(neuester)} ${uhrzeit(neuester)})` : ""}.
      Für einen aktuellen Stand in Syscara neu exportieren.</span>
      <button class="knopf klein leise" data-aktion="syImportSchliessen">Schließen</button></div>`;
  }
  if (syImport) {
    const r = syImport;
    const teile = [`<b>${zahlOk(r.fahrzeuge)}</b> Fahrzeug${r.fahrzeuge === 1 ? "" : "e"} im Export`];
    if (r.mit_ab) teile.push(`<b>${zahlOk(r.mit_ab)}</b> mit AB abgeglichen: <b>${zahlOk(r.passt)}</b> ${r.passt === 1 ? "passt" : "passen"}, <b>${zahlOk(r.abweichung)}</b> mit Abweichung oder unsicher`);
    if (r.automatisch) teile.push(`<b>${zahlOk(r.automatisch)}</b> dadurch automatisch erledigt`);
    if (r.ohne_ab.length) teile.push(`<b>${r.ohne_ab.length}</b> noch ohne AB`);
    if (r.aelter) teile.push(`${zahlOk(r.aelter)} übersprungen (ODIN kennt schon einen neueren Export)`);
    if (r.nicht_lesbar?.length) teile.push(`<b>${r.nicht_lesbar.length}</b> gerade nicht lesbar (z. B. von OneDrive gesperrt) – ODIN gleicht sie beim nächsten Laden ab`);
    return `<div class="hinweis ok sy-kopf">${icon("check")}<span>Eingelesen: „${esc(r.datei)}“ vom ${datumKurz(r.stand)} ${uhrzeit(r.stand)} – ${teile.join(" · ")}</span>
      <button class="knopf klein leise" data-aktion="syImportSchliessen">Schließen</button></div>`;
  }
  const e = syDaten?.export;
  return e ? `<p class="erklaerung sy-kopf">Neuester Syscara-Export: „${esc(e.datei)}“ vom ${datumKurz(e.stand)}. Kommt eine neue AB, gleicht ODIN sie
    sofort mit diesem Stand ab – neu einlesen nur, wenn sich in Syscara etwas geändert hat.</p>` : "";
}

function renderAusstattung({ neuLaden = false } = {}) {
  const f = $("#sy-flaeche");
  renderKopfZaehler();
  syZaehleFilter();
  if (!ablage.gueltig) { f.innerHTML = einrichtenHtml(); return; }
  const kopf = syKopfHtml();
  if (!syDaten || (syImport?.laeuft && !syDaten.export)) {
    f.innerHTML = `${kopf}<section class="arbeit"><div class="liste">${Array.from({ length: 4 }, () =>
      `<div class="zeile skelett"><span class="punkt"></span><span class="infos"><div class="balken" style="width:110px"></div>
       <div class="balken" style="width:200px;margin-top:8px"></div></span><span></span></div>`).join("")}</div><article class="detail"></article></section>`;
    return;
  }
  if (!syDaten.export) {
    f.innerHTML = `${kopf}<section class="leer"><div class="leer-text">
        <span class="schraege" aria-hidden="true"></span>
        <h1>Ausstattung mit Syscara abgleichen</h1>
        <p>In Syscara alle Fahrzeuge exportieren (Excel oder CSV) und hier einlesen. ODIN vergleicht dann bei jedem Fahrzeug
          die bestellte Ausstattung mit der neuesten AB und zeigt, welche passen und wo etwas fehlt.</p>
        <div class="gruppe"><button class="knopf primaer" data-aktion="syscaraEinlesen">${icon("syscara")}Syscara-Export einlesen</button></div>
      </div></section>`;
    return;
  }
  if (!f.querySelector("#sy-liste")) {
    f.innerHTML = `<div id="sy-kopf"></div><section class="arbeit"><div class="liste" id="sy-liste" role="listbox" aria-label="Fahrzeuge aus Syscara"></div>
      <article class="detail" id="sy-detail"></article></section>`;
  }
  $("#sy-kopf").innerHTML = kopf;
  const zeilen = sichtbareSy();
  const liste = $("#sy-liste");
  if (!zeilen.length) {
    liste.innerHTML = syFilter === "abweichung" && !sySuche && !syHersteller
      ? `<div class="liste-leer">${icon("check")}<b>Keine Abweichungen</b><span>Bei allen Fahrzeugen mit AB passt die Ausstattung zu Syscara oder ist noch unsicher.</span></div>`
      : `<div class="liste-leer">${icon("search")}<b>Keine Treffer</b><span>Filter oder Suche anpassen.</span></div>`;
    syGewaehlt = null; syDetail = null;
    $("#sy-detail").innerHTML = "";
    return;
  }
  liste.innerHTML = zeilen.map(syZeileHtml).join("");
  if (syGewaehlt && zeilen.some((x) => x.schluessel === syGewaehlt)) waehleSy(syGewaehlt, { neu: neuLaden });
  else waehleSy(zeilen[0].schluessel);
}

function syZaehleFilter() {
  const f = syDaten?.fahrzeuge || [];
  document.querySelectorAll("[data-syfilter]").forEach((k) => {
    const g = k.dataset.syfilter;
    const n = g === "alle" ? f.length : f.filter((x) => x.gruppe === g).length;
    k.innerHTML = `${SY_GRUPPEN.find(([x]) => x === g)[1]}<span class="anzahl">${n}</span>`;
    k.classList.toggle("aktiv", g === syFilter);
  });
  const hersteller = [...new Set(f.map((x) => x.syscara?.hersteller || x.fahrzeug?.hersteller).filter(Boolean))].sort();
  const auswahl = $("#sy-hersteller");
  const optionen = `<option value="">Alle Hersteller</option>${hersteller.map((h) => `<option${h === syHersteller ? " selected" : ""}>${esc(h)}</option>`).join("")}`;
  if (auswahl.innerHTML !== optionen) auswahl.innerHTML = optionen;
}

async function waehleSy(key, { neu = false } = {}) {
  const wechsel = key !== syGewaehlt;
  syGewaehlt = key;
  document.querySelectorAll("#sy-liste [data-sy]").forEach((z) => z.classList.toggle("gewaehlt", z.dataset.sy === key));
  const f = syEintrag(key);
  if (!f) return;
  if (wechsel) { syDetail = null; $("#sy-liste [data-sy].gewaehlt")?.scrollIntoView({ block: "nearest" }); }
  renderSyDetail();
  if (!f.zeile || (!wechsel && !neu && syDetail)) return;
  try {
    const d = await api().ab_details(f.zeile.fahrzeug.pfad, null, null);
    if (syGewaehlt === key) { syDetail = d; renderSyDetail(); }
  } catch (e) {
    if (syGewaehlt === key) $("#sy-detail").innerHTML = `<div class="hinweis fehler">${icon("x")}<span>${esc(e.message || e)}</span></div>`;
  }
}

function syNummernHtml(f) {
  const s = f.syscara || {};
  const werte = [["Bestellnummer", s.bestellnummer], ["Seriennummer", s.seriennummer], ["Fahrgestellnummer", s.fin]].filter(([, w]) => w);
  return werte.length ? `<dl class="sy-nummern">${werte.map(([k, w]) => `<div><dt>${k}</dt><dd>${esc(w)}</dd></div>`).join("")}</dl>` : "";
}

function renderSyDetail() {
  const d = $("#sy-detail");
  const f = syEintrag();
  if (!d || !f) return;
  const z = f.zeile;
  const kopf = `
    <div class="ueber">${esc(syModell(f))}${f.fahrzeug?.jahr ? ` · ${esc(f.fahrzeug.jahr)}` : ""}</div>
    <div class="titel-zeile"><h2>${esc(syKennung(f))}</h2>${z ? statusMarkeAb(z.status) : ""}</div>
    ${syNummernHtml(f)}`;
  const zurAb = z ? `<button class="knopf" data-aktion="syZurAb" data-fahrzeug="${esc(z.fahrzeug.name)}">${icon("arrow")}Zur AB</button>` : "";
  let inhalt;
  if (f.gruppe === "nicht_in_syscara") {
    inhalt = `<div class="abschnitt"><div class="hinweis warnung">${icon("warn")}<span>Dieses Fahrzeug hat eine AB, steht aber in keinem
      eingelesenen Syscara-Export. Stimmt die Interne ID bzw. Bestellnummer in Syscara? Oder war es beim Export nicht dabei,
      z. B. weil es schon ausgeliefert ist?</span></div></div>`;
  } else if (f.nicht_lesbar) {
    inhalt = `<div class="abschnitt"><div class="hinweis warnung">${icon("warn")}<span>Der Fahrzeugordner ist gerade nicht lesbar – z. B. von
      OneDrive gesperrt oder noch nicht heruntergeladen. ODIN versucht es beim nächsten Laden wieder.</span></div></div>`;
  } else if (!z) {
    inhalt = `<div class="abschnitt sy-ohne-ab"><div class="hinweis info">${icon("uhr")}<span>Noch keine AB da. Sobald sie kommt, gleicht ODIN sie
      automatisch mit dieser Ausstattung ab.${f.fahrzeug ? "" : " Den Fahrzeugordner legt ODIN mit der ersten AB an."}</span></div>
      <h3 class="mit-zahl">Bestellt laut Syscara <span>${f.ausstattung.length}</span></h3>
      <ul class="sy-ausstattung">${f.ausstattung.map((a) => `<li>${esc(a)}</li>`).join("")}</ul></div>`;
  } else if (!syDetail) {
    inhalt = `<p class="erklaerung gross">Abgleich wird geladen …</p>`;
  } else if (!syDetail.syscara) {
    inhalt = `<div class="abschnitt"><div class="hinweis warnung">${icon("warn")}<span>Die neueste AB ließ sich gerade nicht lesen
      (z. B. von OneDrive gesperrt) – ODIN gleicht sie beim nächsten Laden ab.</span></div></div>`;
  } else {
    inhalt = syscaraHtml(syDetail, z);
  }
  d.innerHTML = `${kopf}${inhalt}${zurAb ? `<div class="abschnitt detail-fuss">${zurAb}</div>` : ""}`;
}

Object.assign(aktionen, {
  syImportSchliessen() { syImport = null; renderAusstattung(); },
  syZurAb(knopf) {
    abSuche = knopf.dataset.fahrzeug;
    $("#ab-suche").value = abSuche;
    abHersteller = "";
    $("#ab-hersteller").value = "";
    abFilter = "alle";
    abGewaehlt = null;
    zeigeBereich("abs");
  },
});

document.addEventListener("click", (ev) => {
  const zeile = ev.target.closest("[data-sy]");
  if (zeile) { waehleSy(zeile.dataset.sy); return; }
  const filterKnopf = ev.target.closest("[data-syfilter]");
  if (filterKnopf) { syFilter = filterKnopf.dataset.syfilter; syGewaehlt = null; renderAusstattung(); }
});
$("#sy-suche").addEventListener("input", (ev) => { sySuche = ev.target.value; renderAusstattung(); });
$("#sy-hersteller").addEventListener("change", (ev) => { syHersteller = ev.target.value; renderAusstattung(); });

document.addEventListener("keydown", (ev) => {
  if (!bereichAktiv("ausstattung") || document.querySelector("dialog[open]")) return;
  if (["TEXTAREA", "INPUT", "SELECT"].includes(document.activeElement.tagName) || ev.ctrlKey || ev.metaKey || ev.altKey) return;
  const zeilen = sichtbareSy();
  const i = zeilen.findIndex((x) => x.schluessel === syGewaehlt);
  if (ev.key === "ArrowDown" && zeilen[i + 1]) { ev.preventDefault(); waehleSy(zeilen[i + 1].schluessel); }
  else if (ev.key === "ArrowUp" && i > 0) { ev.preventDefault(); waehleSy(zeilen[i - 1].schluessel); }
});
