/* ODIN · Cockpit
   Bestand, Finanzierung, Linien & Bestellungen, Liquidität, Provisionen, Auslieferungen,
   Teile, To-dos und Fragen (Werkstattaufträge laufen über CaraCamp). Die Daten liefert ODIN (Python) aus den
   Excel-Listen; diese Datei zeichnet nur. Alles läuft in einer eigenen
   Funktion, damit sich Namen nicht mit app.js/abs.js überschneiden. */
(() => {
"use strict";
/* ------------------------------------------------------------ Grundlagen */
let D = null;                                   // Daten aus ODIN (Excel-Listen bzw. Beispieldaten)
let HEUTE = "";                                 // Stichtag
const IM_BESTAND = ["Bestand", "Reserviert", "Verkauft"];
const nf = (d = 0) => new Intl.NumberFormat("de-DE", { minimumFractionDigits: d, maximumFractionDigits: d });
const eur = (n, d = 0) => (n === null || n === undefined || isNaN(n)) ? "–" : nf(d).format(n) + "\u00a0€";
const zahl = (n, d = 0) => (n === null || n === undefined || isNaN(n)) ? "–" : nf(d).format(n);
const kurz = (n) => Math.abs(n) >= 1e6 ? nf(1).format(n / 1e6) + " Mio" : Math.abs(n) >= 1000 ? nf(0).format(n / 1000) + " T€" : nf(0).format(n);
// Ein kaputtes Datum (z. B. aus einer von Hand veränderten Datei) wird zu „–“ statt die ganze Seite zu stoppen
const alsDatum = (iso, form) => { const d = new Date(iso); return isNaN(d) ? "–" : new Intl.DateTimeFormat("de-DE", form).format(d); };
const datum = (iso) => !iso ? "–" : alsDatum(iso, { day: "2-digit", month: "2-digit", year: "numeric" });
const monatsLabel = (ym) => { const [j, m] = ym.split("-").map(Number); return new Intl.DateTimeFormat("de-DE", { month: "short", year: "2-digit" }).format(new Date(j, m - 1, 1)); };
const tageBis = (iso) => iso ? Math.round((new Date(iso) - new Date(HEUTE)) / 864e5) : null;
const tageText = (n) => zahl(Math.abs(n)) + (Math.abs(n) === 1 ? " Tag" : " Tage");
const tagenDativ = (n) => zahl(Math.abs(n)) + (Math.abs(n) === 1 ? " Tag" : " Tagen");
const esc = (s) => String(s ?? "").replace(/[&<>"'`]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;", "`": "&#96;" }[c]));
// Für Stellen, an denen ein Wert in style="…" oder als Adresse landet: nur was wirklich eine Farbe / ein sicherer Link ist
const farbeOk = (f, sonst = "#888") => (typeof f === "string" && /^#[0-9a-f]{3,8}$/i.test(f) ? f : sonst);
// Im Fenster bleibt man immer in ODIN: Links führen nur zu eigenen Seiten (#/…)
const linkOk = (l) => (typeof l === "string" && /^#\/[\w\-/.%~]*$/.test(l) ? l : "#/");
window.odinFarbeOk = farbeOk;
const einstand = (v) => (v.purchase_net || 0) + (v.extra_cost_net || 0);
const standtage = (v) => !v.arrival_date ? null : Math.max(0, Math.round(((v.status === "Ausgeliefert" && v.sold_date ? new Date(v.sold_date) : new Date(HEUTE)) - new Date(v.arrival_date)) / 864e5));
const angeliefert = (v) => !v.lieferstatus || v.lieferstatus === "angeliefert";
const bestand = () => D.vehicles.filter((v) => IM_BESTAND.includes(v.status) && angeliefert(v));
const bestellt = () => D.vehicles.filter((v) => IM_BESTAND.includes(v.status) && v.lieferstatus === "geplant");
const jeArt = () => {
  const map = new Map();
  for (const v of bestand()) {
    const e = map.get(v.category) || { kategorie: v.category || "ohne Angabe", anzahl: 0, wert: 0 };
    e.anzahl++; e.wert += einstand(v); map.set(v.category, e);
  }
  for (const v of bestellt()) {
    const e = map.get(v.category) || { kategorie: v.category || "ohne Angabe", anzahl: 0, wert: 0, bestellt: 0 };
    e.bestellt = (e.bestellt || 0) + 1; map.set(v.category, e);
  }
  return [...map.values()].sort((a, b) => b.wert - a.wert);
};
const summe = (arr, f) => arr.reduce((s, x) => s + (f(x) || 0), 0);

/** Interne Nummer vereinheitlichen: "detkw168" -> "DETKW00168". */
function normId(roh) {
  const c = String(roh).toUpperCase().replace(/[^A-Z0-9]/g, "");
  const m = c.match(/^([A-Z]+)(\d+)$/);
  return m ? m[1] + m[2].padStart(5, "0") : String(roh).trim().toUpperCase();
}
const fahrzeug = (id) => D.vehicles.find((v) => v.internal_id === normId(id)) || null;
const finanzierungenVon = (id) => D.financings.filter((f) => f.vehicle_internal_id === normId(id));
const offeneFin = (id) => finanzierungenVon(id).find((f) => f.status === "offen") || finanzierungenVon(id)[0] || null;

/* ---------------------------------------------------------- Auswertungen */
function kennzahlen() {
  const b = bestand();
  const finOffen = D.financings.filter((f) => f.status === "offen" && IM_BESTAND.includes(fahrzeug(f.vehicle_internal_id)?.status));
  const risiko = finOffen.filter((f) => tageBis(f.interest_free_until) <= 60);
  const verkauftJahr = D.vehicles.filter((v) => v.sold_date && v.sold_date >= HEUTE.slice(0, 4) + "-01-01");
  return {
    anzahl: b.length,
    wert: summe(b, einstand),
    standtage: Math.round(summe(b, standtage) / (b.length || 1)),
    finanzierung: summe(finOffen, (f) => f.financed_amount),
    vertraege: finOffen.length,
    risikoAnzahl: risiko.length,
    risikoVolumen: summe(risiko, (f) => f.financed_amount),
    provisionenOffen: summe(D.commissions.filter((c) => c.status === "offen"), (c) => c.amount),
    db: summe(verkauftJahr, (v) => (v.sold_net || 0) - einstand(v)),
    verkauft: verkauftJahr.length,
  };
}

function ablaufListe(tage) {
  return D.financings
    .filter((f) => f.status === "offen" && IM_BESTAND.includes(fahrzeug(f.vehicle_internal_id)?.status) && tageBis(f.interest_free_until) <= tage)
    .map((f) => ({ ...f, rest: tageBis(f.interest_free_until), fzg: fahrzeug(f.vehicle_internal_id) }))
    .sort((a, b) => a.interest_free_until.localeCompare(b.interest_free_until));
}

function ablaufJeMonat(monate = 9) {
  const start = HEUTE.slice(0, 7), map = new Map();
  for (const f of D.financings) {
    if (f.status !== "offen" || !IM_BESTAND.includes(fahrzeug(f.vehicle_internal_id)?.status)) continue;
    const m = (f.interest_free_until || "").slice(0, 7);
    if (!m || m < start) continue;
    const e = map.get(m) || { monat: m, anzahl: 0, volumen: 0 };
    e.anzahl++; e.volumen += f.financed_amount || 0; map.set(m, e);
  }
  return [...map.values()].sort((a, b) => a.monat.localeCompare(b.monat)).slice(0, monate)
    .map((m) => ({ ...m, label: monatsLabel(m.monat) }));
}

function jeBank() {
  const map = new Map();
  for (const f of D.financings) {
    if (f.status !== "offen" || !IM_BESTAND.includes(fahrzeug(f.vehicle_internal_id)?.status)) continue;
    const e = map.get(f.bank) || { bank: f.bank, vertraege: 0, volumen: 0 };
    e.vertraege++; e.volumen += f.financed_amount || 0; map.set(f.bank, e);
  }
  return [...map.values()].sort((a, b) => b.volumen - a.volumen);
}

function jeMarke() {
  const map = new Map();
  for (const v of bestand()) {
    const e = map.get(v.brand) || { brand: v.brand || "ohne Marke", anzahl: 0, wert: 0 };
    e.anzahl++; e.wert += einstand(v); map.set(v.brand, e);
  }
  return [...map.values()].sort((a, b) => b.wert - a.wert);
}

function standzeitKlassen() {
  const grenzen = [["0–90", 0, 90], ["91–180", 91, 180], ["181–270", 181, 270], ["271–365", 271, 365], ["> 365", 366, 1e5]];
  return grenzen.map(([label, min, max]) => {
    const t = bestand().filter((v) => { const s = standtage(v); return s !== null && s >= min && s <= max; });
    return { label, anzahl: t.length, wert: summe(t, einstand) };
  });
}

function jeVerkaeufer() {
  const map = new Map();
  for (const c of D.commissions) {
    const e = map.get(c.salesperson) || { salesperson: c.salesperson, faelle: 0, gesamt: 0, offen: 0 };
    e.faelle++; e.gesamt += c.amount || 0; if (c.status === "offen") e.offen += c.amount || 0;
    map.set(c.salesperson, e);
  }
  return [...map.values()].sort((a, b) => b.gesamt - a.gesamt);
}

const offeneLieferungen = (tage = 60) => D.deliveries
  .filter((d) => !d.actual_date && d.planned_date && tageBis(d.planned_date) <= tage)
  .map((d) => ({ ...d, fzg: fahrzeug(d.vehicle_internal_id) }))
  .sort((a, b) => a.planned_date.localeCompare(b.planned_date));

function teileMitLohn(suche) {
  const q = (suche || "").toLowerCase();
  return D.parts
    .filter((t) => !q || (t.name + " " + t.sku + " " + t.category).toLowerCase().includes(q))
    .map((t) => { const lohn = ((t.install_minutes || 0) / 60) * (t.hourly_rate || 0); return { ...t, lohn, gesamt: (t.sales_net || 0) + lohn }; });
}

/* -------------------------------------------------------------- Diagramme
   Handgezeichnetes SVG: eine Skala für Marken, Ticks und Beschriftungen;
   Farben kommen aus den Design-Tokens, damit hell und dunkel beide stimmen. */
const TIP = document.getElementById("tip");

/** Schmale Karten bekommen ein schmaleres Koordinatensystem, damit
    Achsenbeschriftungen nach dem Skalieren lesbar bleiben. */
function geo(el) {
  const schmal = (el.clientWidth || 700) < 520;
  return schmal
    ? { W: 430, H: 260, PL: 50, PR: 12, PT: 14, PB: 28 }
    : { W: 760, H: 250, PL: 60, PR: 16, PT: 16, PB: 28 };
}

function tipZeigen(ev, titel, zeilen) {
  TIP.innerHTML = "<b>" + esc(titel) + "</b>" + zeilen.map((z) =>
    '<div class="z">' + (z.farbe ? '<i style="background:' + esc(String(z.farbe).replace(/[^#\w(),.\- %]/g, "")) + '"></i>' : "") +
    "<span>" + esc(z.label) + "</span><em>" + esc(z.wert) + "</em></div>").join("");
  TIP.style.opacity = "1";
  const b = TIP.getBoundingClientRect();
  let x = ev.clientX + 14, y = ev.clientY - 10;
  if (x + b.width > window.innerWidth - 8) x = ev.clientX - b.width - 14;
  if (y + b.height > window.innerHeight - 8) y = window.innerHeight - b.height - 8;
  TIP.style.left = Math.max(8, x) + "px";
  TIP.style.top = Math.max(8, y) + "px";
}
const tipWeg = () => { TIP.style.opacity = "0"; };

function skala(werte, g) {
  const max = Math.max(...werte, 0), min = Math.min(...werte, 0);
  const obenRoh = max === 0 ? 1 : max * 1.1;
  const schritt = Math.pow(10, Math.floor(Math.log10(obenRoh || 1)));
  const oben = Math.ceil(obenRoh / (schritt / 2)) * (schritt / 2);
  const unten = min < 0 ? Math.floor((min * 1.1) / (schritt / 2)) * (schritt / 2) : 0;
  return { oben, unten, y: (v) => g.PT + (g.H - g.PT - g.PB) * (1 - (v - unten) / ((oben - unten) || 1)) };
}

function rasterSvg(s, g) {
  let out = "";
  for (let k = 0; k <= 4; k++) {
    const wert = s.unten + ((s.oben - s.unten) * k) / 4, y = s.y(wert);
    out += '<line x1="' + g.PL + '" y1="' + y + '" x2="' + (g.W - g.PR) + '" y2="' + y + '" stroke="var(--raster)" stroke-width="1"/>';
    out += '<text class="achse" x="' + (g.PL - 8) + '" y="' + (y + 4) + '" text-anchor="end">' + esc(kurz(wert)) + "</text>";
  }
  return out;
}

function xBeschriftung(labels, xPos, alle, g) {
  const platz = (g.W - g.PL - g.PR) / labels.length;
  const jeder = alle ? 1 : Math.max(1, Math.ceil(46 / platz));
  return labels.map((l, i) => (i % jeder === 0 || i === labels.length - 1)
    ? '<text class="achse" x="' + xPos(i) + '" y="' + (g.H - g.PB + 17) + '" text-anchor="middle">' + esc(l) + "</text>" : "").join("");
}

/** Flächen-/Liniendiagramm mit Fadenkreuz. */
function zeichneFlaeche(el, reihe, opt) {
  const g = geo(el), n = reihe.length;
  const alleWerte = reihe.flatMap((p) => opt.serien.map((s) => p[s.key]).filter((v) => v !== null && v !== undefined));
  const s = skala(alleWerte, g);
  const step = (g.W - g.PL - g.PR) / Math.max(n - 1, 1);
  const x = (i) => g.PL + i * step;

  let pfade = "";
  opt.serien.forEach((serie) => {
    const punkte = reihe.map((p, i) => ({ i, v: p[serie.key] })).filter((p) => p.v !== null && p.v !== undefined);
    if (!punkte.length) return;
    const d = punkte.map((p, k) => (k ? "L" : "M") + x(p.i).toFixed(1) + " " + s.y(p.v).toFixed(1)).join(" ");
    if (serie.flaeche) {
      const basis = s.y(s.unten);
      pfade += '<path d="' + d + " L" + x(punkte[punkte.length - 1].i).toFixed(1) + " " + basis + " L" + x(punkte[0].i).toFixed(1) + " " + basis + ' Z" fill="' + serie.farbe + '" opacity=".13"/>';
    }
    pfade += '<path d="' + d + '" fill="none" stroke="' + serie.farbe + '" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"' +
      (serie.gestrichelt ? ' stroke-dasharray="5 4"' : "") + "/>";
    const letzter = punkte[punkte.length - 1];
    pfade += '<circle cx="' + x(letzter.i).toFixed(1) + '" cy="' + s.y(letzter.v).toFixed(1) + '" r="3.5" fill="' + serie.farbe + '" stroke="var(--flaeche)" stroke-width="2"/>';
  });

  el.innerHTML = '<svg viewBox="0 0 ' + g.W + " " + g.H + '" role="img" aria-label="' + esc(opt.titel || "Diagramm") + '">' +
    rasterSvg(s, g) + pfade + xBeschriftung(reihe.map(opt.xLabel), x, false, g) +
    '<line class="kreuz" x1="0" y1="' + g.PT + '" x2="0" y2="' + (g.H - g.PB) + '" stroke="var(--linie-stark)" stroke-width="1" opacity="0"/>' +
    '<rect x="' + g.PL + '" y="' + g.PT + '" width="' + (g.W - g.PL - g.PR) + '" height="' + (g.H - g.PT - g.PB) + '" fill="transparent"/></svg>';

  const svg = el.querySelector("svg"), kreuz = el.querySelector(".kreuz");
  svg.addEventListener("mousemove", (ev) => {
    const box = svg.getBoundingClientRect();
    const px = ((ev.clientX - box.left) / box.width) * g.W;
    const i = Math.max(0, Math.min(n - 1, Math.round((px - g.PL) / step)));
    kreuz.setAttribute("x1", x(i)); kreuz.setAttribute("x2", x(i)); kreuz.setAttribute("opacity", "1");
    const t = opt.tip(reihe[i]);
    tipZeigen(ev, t.titel, t.zeilen);
  });
  svg.addEventListener("mouseleave", () => { kreuz.setAttribute("opacity", "0"); tipWeg(); });
}

const balkenPfad = (x, y, b, h, r) => {
  const rr = Math.min(r, b / 2, Math.max(h, 0));
  return "M" + x + " " + (y + h) + " L" + x + " " + (y + rr) + " Q" + x + " " + y + " " + (x + rr) + " " + y +
    " L" + (x + b - rr) + " " + y + " Q" + (x + b) + " " + y + " " + (x + b) + " " + (y + rr) + " L" + (x + b) + " " + (y + h) + " Z";
};

/** Balkendiagramm, einzeln oder gruppiert. */
function zeichneBalken(el, reihe, opt) {
  const g = geo(el), serien = opt.serien;
  const werte = reihe.flatMap((p) => serien.map((s) => p[s.key] || 0));
  const s = skala(werte, g);
  const feld = (g.W - g.PL - g.PR) / Math.max(reihe.length, 1);
  const breite = Math.min(opt.maxBreite || 34, (feld * 0.62) / serien.length);
  const basis = s.y(s.unten);
  let balken = "";

  reihe.forEach((p, i) => {
    const mitte = g.PL + feld * i + feld / 2;
    const gesamtBreite = breite * serien.length + 2 * (serien.length - 1);
    serien.forEach((serie, k) => {
      const wert = p[serie.key] || 0;
      const x = mitte - gesamtBreite / 2 + k * (breite + 2);
      const y = s.y(wert), h = Math.max(basis - y, 1);
      const farbe = opt.warnAb !== undefined && wert >= opt.warnAb ? "var(--warnung)" : serie.farbe;
      balken += '<path d="' + balkenPfad(x, y, breite, h, 4) + '" fill="' + farbe + '" data-i="' + i + '"/>';
    });
  });

  el.innerHTML = '<svg viewBox="0 0 ' + g.W + " " + g.H + '" role="img" aria-label="' + esc(opt.titel || "Diagramm") + '">' +
    rasterSvg(s, g) + balken + xBeschriftung(reihe.map((p) => p[opt.xKey]), (i) => g.PL + feld * i + feld / 2, opt.alleLabels, g) + "</svg>";

  el.querySelectorAll("path[data-i]").forEach((pfad) => {
    const bewegen = (ev) => { const t = opt.tip(reihe[+pfad.dataset.i]); tipZeigen(ev, t.titel, t.zeilen); };
    pfad.addEventListener("mouseenter", bewegen);
    pfad.addEventListener("mousemove", bewegen);
    pfad.addEventListener("mouseleave", tipWeg);
  });
}




/* ------------------------------------------------- Ampel und Sortierung --- */
const ampel = (farbe, kuerzel, titel) => farbe === "leer"
  ? '<span class="ampel leer" title="' + esc(titel) + '">' + esc(kuerzel) + "</span>"
  : '<span class="ampel a-' + farbe + '" title="' + esc(titel) + '">' + esc(kuerzel) + "</span>";

const ampelLegende = (eintraege) => '<div class="ampel-legende">' + eintraege.map((e) =>
  '<span><i style="' + (e.farbe === "leer" ? "border:1px dashed var(--linie-stark)" : "background:" + FARBWERT[e.farbe]) + '"></i>' +
  esc(e.text) + "</span>").join("") + "</div>";

const FARBWERT = {
  rot: "#e8433f", orange: "#f08a3c", gelb: "#f5c518", "gruen-dunkel": "#0f9d58",
  "gruen-hell": "#7bc67b", "blau-dunkel": "#2b6cb0", "blau-hell": "#63b3ed", grau: "#d5d4d0",
};

const sortierStand = {};   // je Tabelle: { key, richtung }

/**
 * Tabelle, die sich über jede Überschrift sortieren lässt. Spalten mit "~"
 * stehen rechts, mit "=" bleiben unsortiert (reine Ampelfelder).
 */
function sortTabelle(id, spalten, zeilen, opt = {}) {
  const stand = sortierStand[id] ?? opt.start ?? null;
  let sortiert = zeilen;
  if (stand) {
    sortiert = [...zeilen].sort((a, b) => {
      const wa = a.werte?.[stand.key], wb = b.werte?.[stand.key];
      const leerA = wa === undefined || wa === null || wa === "";
      const leerB = wb === undefined || wb === null || wb === "";
      if (leerA && leerB) return 0;
      if (leerA) return 1;
      if (leerB) return -1;
      const v = typeof wa === "number" && typeof wb === "number"
        ? wa - wb : String(wa).localeCompare(String(wb), "de", { numeric: true });
      return stand.richtung === "ab" ? -v : v;
    });
  }

  const gruppen = new Map();
  for (const z of sortiert) {
    const g = z.gruppe ?? "";
    if (!gruppen.has(g)) gruppen.set(g, []);
    gruppen.get(g).push(z);
  }

  const kopf = spalten.map((s) => {
    const rechts = s.label.startsWith("~"), fest = s.label.startsWith("=");
    const label = s.label.replace(/^[~=]/, "");
    const aktiv = stand && stand.key === s.key;
    const pfeil = aktiv ? (stand.richtung === "ab" ? "▼" : "▲") : "⇅";
    const extra = s.klasse ? " " + s.klasse : "";
    return "<th" + (rechts ? ' class="r' + (fest ? "" : " sortierbar") + (aktiv ? " aktiv" : "") + extra + '"'
      : ' class="' + (fest ? "" : "sortierbar") + (aktiv ? " aktiv" : "") + extra + '"') +
      (fest ? "" : ' data-sort="' + id + "|" + s.key + '"') +
      (s.titel ? ' title="' + esc(s.titel) + '"' : "") + ">" +
      esc(label) + (fest ? "" : '<span class="pfeil">' + pfeil + "</span>") + "</th>";
  }).join("");

  const reihenfolge = [...gruppen.entries()];
  if (opt.gruppenFolge) {           // feste Reihenfolge der Gruppen (z. B. Fahrzeugtypen), Unbekanntes ans Ende
    const platz = (g) => { const i = opt.gruppenFolge.indexOf(g); return i < 0 ? opt.gruppenFolge.length : i; };
    reihenfolge.sort((a, b) => platz(a[0]) - platz(b[0]));
  }
  const koerper = reihenfolge.map(([gruppe, eintraege]) => {
    const kopfzeile = gruppe
      ? '<tr class="gruppenzeile"><td colspan="' + spalten.length + '">' + esc(gruppe) +
        ' <span style="color:var(--ink-3);font-weight:400">' + eintraege.length + "</span>" +
        (opt.gruppenInfo?.[gruppe] ? '<span class="info">' + esc(opt.gruppenInfo[gruppe]) + "</span>" : "") + "</td></tr>"
      : "";
    return kopfzeile + eintraege.map((z) => "<tr" + ((z.unter || z.klasse) ? ' class="' + [z.unter ? "mit-unter" : "", z.klasse || ""].join(" ").trim() + '"' : "") + ">" + spalten.map((s) =>
      "<td" + ((s.label.startsWith("~") || s.klasse) ? ' class="' + [s.label.startsWith("~") ? "r" : "", s.klasse || ""].join(" ").trim() + '"' : "") + ">" + (z.zellen[s.key] ?? "") + "</td>").join("") + "</tr>" +
      (z.unter ? '<tr class="unterzeile"><td colspan="' + spalten.length + '">' + z.unter + "</td></tr>" : "")).join("");
  }).join("");

  if (!zeilen.length) return '<div class="karte-leer">' + esc(opt.leer ?? "Keine Einträge.") + "</div>";
  return '<div class="tab-wisch">Tabelle seitlich wischen, um alle Spalten zu sehen →</div>' +
    '<div class="tab-huelle"><table style="min-width:' + (opt.minBreite ?? 900) + 'px"><thead><tr>' +
    kopf + "</tr></thead><tbody>" + koerper + "</tbody></table></div>";
}

/** Nach jedem Zeichnen die Sortierköpfe verbinden. */
function sortierungAktivieren() {
  document.querySelectorAll("[data-sort]").forEach((th) => th.addEventListener("click", () => {
    const [id, key] = th.dataset.sort.split("|");
    const stand = sortierStand[id];
    sortierStand[id] = stand && stand.key === key
      ? { key, richtung: stand.richtung === "auf" ? "ab" : "auf" }
      : { key, richtung: "auf" };
    zeichne();
  }));
}

/* ----------------------------------------------------------------- Bausteine */
const ICONS = {
  uebersicht: '<rect x="3" y="3" width="7" height="8" rx="1.5"/><rect x="14" y="3" width="7" height="5" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="11" width="7" height="10" rx="1.5"/>',
  bestand: '<path d="M2 16V7h10v9M12 10h4l3 3v3M2 16h2m6 0h6"/><circle cx="6" cy="17.5" r="1.8"/><circle cx="17" cy="17.5" r="1.8"/>',
  finanzierung: '<path d="M3 9.5 12 4l9 5.5M5 10v8m5-8v8m4-8v8m5-8v8M3 20h18"/>',
  liquiditaet: '<rect x="3" y="6" width="18" height="13" rx="2.5"/><path d="M3 10h18M16 14.5h2"/>',
  provisionen: '<path d="M18 6 6 18"/><circle cx="7.5" cy="7.5" r="2.2"/><circle cx="16.5" cy="16.5" r="2.2"/>',
  auslieferungen: '<path d="m12 3 8 4.5v9L12 21l-8-4.5v-9L12 3Zm0 0v18M4 7.5l8 4.5 8-4.5"/>',
  teile: '<path d="M14.5 5.5a4 4 0 0 0 5 5L21 12l-9 9-3-3 9-9 1.5-3.5ZM7 14l-4 4 3 3 4-4"/>',
  assistent: '<path d="M21 12a8 8 0 0 1-8 8H4l2-3a8 8 0 1 1 15-5Z"/>',
  vororder: '<rect x="3" y="4.5" width="18" height="16" rx="2.5"/><path d="M3 9h18M8 2.5v4M16 2.5v4M8.5 14h7M8.5 17.5h4"/>',
  todos: '<path d="M4 6h1.5l1 1 2-2M4 12h1.5l1 1 2-2M4 18h1.5l1 1 2-2M12 6h8M12 12h8M12 18h8"/>',
  excel: '<path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8l-5-5Zm0 0v5h5"/><path d="m9.5 12.5 4 4m0-4-4 4"/>',
};
const icon = (n) => '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">' + ICONS[n] + "</svg>";

const kachel = (titel, wert, fuss, ton) =>
  '<div class="kachel"><div class="titel">' + (ton === "krit" ? '<i class="puls" aria-hidden="true"></i>' : "") + esc(titel) + '</div><div class="wert ' + (ton || "") + '">' + esc(wert) + "</div>" +
  (fuss ? '<div class="fuss">' + esc(fuss) + "</div>" : "") + "</div>";

const karte = (titel, hinweis, inhalt, link) =>
  '<section class="karte"><div class="karte-kopf"><div><h2>' + esc(titel) + "</h2>" +
  (hinweis ? "<p>" + esc(hinweis) + "</p>" : "") + "</div>" + (link || "") + "</div>" + inhalt + "</section>";

const tabelle = (kopf, zeilen) => !zeilen.length
  ? '<div class="karte-leer">Keine Einträge für diese Auswahl.<br>Filter lockern oder Zeitraum erweitern.</div>'
  : '<div class="tab-huelle"><table><thead><tr>' +
    kopf.map((h) => '<th' + (h.startsWith("~") ? ' class="r"' : "") + ">" + esc(h.replace(/^~/, "")) + "</th>").join("") +
    "</tr></thead><tbody>" + zeilen.join("") + "</tbody></table></div>";

const fzgLink = (id) => '<a href="#/fahrzeug/' + encodeURIComponent(id) + '" class="id">' + esc(id) + "</a>";
const restPille = (rest) => rest < 0
  ? '<span class="pille krit">seit ' + tagenDativ(rest) + " verzinst</span>"
  : '<span class="pille ' + (rest <= 30 ? "warn" : "") + '">noch ' + tageText(rest) + "</span>";

const HINWEIS_ICON = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><circle cx="12" cy="12" r="9"/><path d="M12 11v5M12 7.5v.5"/></svg>';
function banner() {
  if (D.quelle === "beispiel") return '<div class="hinweis">' + HINWEIS_ICON +
    "<div><b>Beispieldaten.</b> Noch sind keine Excel-Listen eingerichtet – alles rechnet echt, aber Fahrzeuge, Banken und Beträge sind erfunden. " +
    '<a href="#/excel">Datenquellen einrichten</a></div></div>';
  // Oben auf jeder Seite nur, wenn eine Liste gar nicht gelesen werden konnte – Hinweise zu einzelnen Zeilen stehen unter „Datenquellen“
  const kaputt = (D.quellen || []).filter((e) => e.pfad && e.fehler);
  return kaputt.length ? '<div class="hinweis">' + HINWEIS_ICON + "<div><b>" + (kaputt.length === 1 ? "„" + esc(kaputt[0].name) + "“ konnte" : zahl(kaputt.length) + " Listen konnten") +
    " nicht eingelesen werden.</b> Die Zahlen sind deshalb unvollständig. " + '<a href="#/excel">Ansehen</a></div></div>' : "";
}

/* ------------------------------------------------------------------ Seiten */
const SEITEN = {};

/* ----------------------------------------------------------------- To-dos */
const TODO_BEREICHE = ["Allgemein", "Bestand", "Finanzierung", "Auslieferung", "Werkstatt", "Teile"];
let todoFilter = null;

const heuteIso = () => HEUTE;
const todoOffen = () => D.todos.filter((t) => !t.erledigt);
const todoUeberfaellig = () => todoOffen().filter((t) => t.faellig_am && t.faellig_am < HEUTE);

function todoSortiert(liste) {
  const rang = { hoch: 0, normal: 1, niedrig: 2 };
  return [...liste].sort((a, b) =>
    (a.erledigt - b.erledigt) ||
    ((a.faellig_am ? 0 : 1) - (b.faellig_am ? 0 : 1)) ||
    String(a.faellig_am || "").localeCompare(String(b.faellig_am || "")) ||
    ((rang[a.prioritaet] ?? 1) - (rang[b.prioritaet] ?? 1)) || (b.id - a.id));
}

const HAKEN = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="m5 13 4 4 10-10"/></svg>';
const MUELL = '<svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"><path d="M4 7h16M9 7V5h6v2M6 7l1 13h10l1-13"/></svg>';

function todoZeilen(liste, mitBereich) {
  if (!liste.length) return '<p class="karte-leer">Keine offenen Aufgaben.<br>Oben eintragen, mit Fälligkeit erscheinen sie hier nach Datum sortiert.</p>';
  return '<ul class="todo-liste">' + liste.map((t) => {
    const spaet = !t.erledigt && t.faellig_am && t.faellig_am < HEUTE;
    return '<li class="' + (t.erledigt ? "fertig" : "") + '">' +
      '<button class="haken ' + (t.erledigt ? "an" : "") + '" data-todo="um:' + esc(t.id) + '" title="' +
        (t.erledigt ? "wieder öffnen" : "erledigt") + '">' + (t.erledigt ? HAKEN : "") + "</button>" +
      '<span class="text">' + esc(t.text) + "</span>" +
      (t.prioritaet === "hoch" && !t.erledigt ? '<span class="pille krit">hoch</span>' : "") +
      (t.bezug_id ? '<span class="klein mono">' + esc(t.bezug_id) + "</span>" : "") +
      (mitBereich && t.bereich && t.bereich !== "Allgemein" ? '<span class="klein">' + esc(t.bereich) + "</span>" : "") +
      (t.faellig_am ? '<span class="klein"' + (spaet ? ' style="color:var(--kritisch)"' : "") + ">" +
        alsDatum(t.faellig_am, { day: "2-digit", month: "2-digit" }) + "</span>" : "") +
      '<button class="weg" data-todo="weg:' + esc(t.id) + '" title="löschen">' + MUELL + "</button></li>";
  }).join("") + "</ul>";
}

function todoFormular(kompakt) {
  return '<form class="todo-form" id="todo-form" novalidate>' +
    '<label class="feld breit"><span>Neue Aufgabe</span>' +
      '<input type="text" id="todo-text" placeholder="z. B. Zulassungsbescheinigung nachfordern" aria-describedby="todo-fehler">' +
      '<em class="fehler" id="todo-fehler" role="alert"></em></label>' +
    '<div class="reihe">' +
      (kompakt ? "" :
        '<label class="feld"><span>Bereich</span><select id="todo-bereich">' + TODO_BEREICHE.map((b) => '<option>' + esc(b) + "</option>").join("") + "</select></label>" +
        '<label class="feld"><span>Priorität</span><select id="todo-prio"><option>hoch</option><option selected>normal</option><option>niedrig</option></select></label>') +
      '<label class="feld"><span>Fällig am</span><input type="date" id="todo-datum"></label>' +
      '<button type="submit" class="btn-primaer">Aufgabe anlegen</button>' +
    "</div></form>";
}

function todoVerdrahten(kompakt) {
  const form = document.getElementById("todo-form");
  if (form) form.addEventListener("submit", (ev) => {
    ev.preventDefault();
    const feld = document.getElementById("todo-text");
    const text = feld.value.trim();
    if (!text) {
      feld.setAttribute("aria-invalid", "true");
      document.getElementById("todo-fehler").textContent = "Bitte beschreib die Aufgabe in ein paar Worten.";
      feld.focus();
      return;
    }
    speichern(() => cpApi().cockpit_todo_anlegen({
      text, bereich: kompakt ? "Allgemein" : document.getElementById("todo-bereich").value,
      bezug_id: null, faellig_am: document.getElementById("todo-datum").value || null,
      prioritaet: kompakt ? "normal" : document.getElementById("todo-prio").value,
    }));
  });
  document.querySelectorAll("[data-todo]").forEach((b) => b.addEventListener("click", () => {
    const [art, id] = b.dataset.todo.split(":");
    const t = D.todos.find((x) => x.id === Number(id));
    if (!t) return;
    if (art === "um") speichern(() => cpApi().cockpit_todo_umschalten(t.id));
    else speichern(() => cpApi().cockpit_todo_loeschen(t.id));
  }));
}

SEITEN.todos = { label: "To-dos", render() {
  const liste = todoSortiert(D.todos.filter((t) => !todoFilter || t.bereich === todoFilter));
  const offen = todoOffen(), spaet = todoUeberfaellig();
  const woche = offen.filter((t) => t.faellig_am && t.faellig_am >= HEUTE &&
    t.faellig_am <= new Date(new Date(HEUTE).getTime() + 7 * 864e5).toISOString().slice(0, 10));
  const chip = (text, aktiv, wert) =>
    '<button type="button" class="' + (aktiv ? "aktiv" : "") + '" data-todofilter="' + esc(wert) + '">' + esc(text) + "</button>";

  const html = banner() +
    '<div class="kopf"><div><h1>To-dos</h1><p>Aufgaben, die nicht in Excel gehören: Nachfassen, Papiere, Termine. ' +
    "ODIN speichert sie im Ordner „Fahrzeuge“, damit alle dieselbe Liste sehen.</p></div></div>" +
    '<div class="kacheln">' +
      kachel("Offen", zahl(offen.length), "noch nicht erledigt") +
      kachel("Überfällig", zahl(spaet.length), "Fälligkeit liegt zurück", spaet.length ? "krit" : "gut") +
      kachel("Diese Woche fällig", zahl(woche.length), "in den nächsten 7 Tagen", woche.length ? "warn" : "") +
      kachel("Hohe Priorität", zahl(offen.filter((t) => t.prioritaet === "hoch").length), "offen und wichtig") +
    "</div>" +
    '<div class="filter">' + chip("alle Bereiche", !todoFilter, "") +
      TODO_BEREICHE.map((b) => chip(b, todoFilter === b, b)).join("") + "</div>" +
    '<div class="gitter">' + karte(todoFilter ? "Aufgaben – " + todoFilter : "Alle Aufgaben",
      "Erledigtes rutscht nach unten und bleibt nachvollziehbar stehen",
      todoFormular(false) + todoZeilen(liste, true)) + "</div>";

  return { html, nach() {
    todoVerdrahten(false);
    document.querySelectorAll("[data-todofilter]").forEach((b) => b.addEventListener("click", () => {
      todoFilter = b.dataset.todofilter || null; zeichne();
    }));
  } };
} };

/* ------------------------------------------------- Heute & Woche
   Was mit Datum zu tun ist: Übergaben, Zulassungen, Bemerkungen, Sonderfahrten, Fristen, To-dos, wer fehlt.
   Tilgungen, Zinsfrei-Enden und Ablösungen nur für Finanz-Berechtigte (D.finanzen) – das Datenpaket enthält sie
   für alle anderen gar nicht erst. Werkstattaufträge laufen über CaraCamp.
   Python liefert zwei Wochen ab Montag (D.agenda); hier wird nur noch auf Heute / diese / nächste Woche geschnitten.
   Dazu das Persönliche aus Projekten und Urlaub: eigene Aufgaben mit Fälligkeit, Anträge zum Entscheiden. */
const AGENDA_ANSICHTEN = [["heute", "Heute"], ["woche", "Diese Woche"], ["naechste", "Nächste Woche"]];
const AGENDA_ARTEN = {
  uebergabe: "Übergabe", zulassung: "Zulassung", bemerkung: "Bemerkung zur Übergabe", sonderfahrt: "Sonderfahrt",
  hinweis: "Hinweis", lehrgang: "Lehrgang", tilgung: "Tilgung", zinsfrei: "Zinsfreiheit",
  abloesung: "Ablösung", vororder: "Kommendes Fahrzeug", frist: "Zulassungsfrist", todo: "To-do", aufgabe: "Projekt",
  zahlung: "Erwartete Zahlung", betrieb: "Frist im Betrieb", recht: "Rechtsfall", cashback: "Cashback", einarbeitung: "Einarbeitung", ablauf: "Ablauf",
};
let agendaAnsicht = "heute";
const AG = { geladen: 0, laedt: false, aufgaben: [], urlaubOffen: 0, ich: false, recht: [], wissen: [], tickets: null };

const mehrzahl = (n, eins, viele) => zahl(n) + " " + (n === 1 ? eins : viele);
const isoPlus = (iso, tage) => { const d = new Date(iso + "T12:00:00"); d.setDate(d.getDate() + tage); return d.toISOString().slice(0, 10); };
const wochentag = (iso, lang) => alsDatum(iso + "T12:00:00", { weekday: lang ? "long" : "short" });
const tagMonat = (iso) => alsDatum(iso + "T12:00:00", { day: "numeric", month: "long" });
const kurzTag = (iso) => alsDatum(iso + "T12:00:00", { day: "2-digit", month: "2-digit" });
function isoKW(iso) {                     // ISO-Kalenderwoche: die Woche mit dem ersten Donnerstag ist KW 1
  const d = new Date(iso + "T12:00:00");
  d.setDate(d.getDate() + 3 - ((d.getDay() + 6) % 7));
  const erste = new Date(d.getFullYear(), 0, 4, 12);
  return 1 + Math.round(((d - erste) / 864e5 - 3 + ((erste.getDay() + 6) % 7)) / 7);
}

async function agendaPersoenlichLaden() {
  if (AG.laedt || Date.now() - AG.geladen < 60e3) return;
  AG.laedt = true;
  try {
    const api = cpApi();
    const [p, u, r, w] = await Promise.all([
      api.projekte_aufruf("meine_aufgaben", []).catch(() => null),
      api.urlaub_aufruf("start", []).catch(() => null),
      typeof api.rechtsfaelle_aufruf === "function" ? api.rechtsfaelle_aufruf("agenda", []).catch(() => null) : null,
      typeof api.wissen_aufruf === "function" ? api.wissen_aufruf("agenda", []).catch(() => null) : null,
    ]);
    // Tickets (tickets.js): Verwalter sehen neue und offene Meldungen, alle anderen eigene mit Hinweis
    const tk = typeof api.tickets_aufruf === "function" ? await api.tickets_aufruf("zaehler", []).catch(() => null) : null;
    AG.tickets = tk && tk.ok && tk.daten ? tk.daten : null;
    AG.wissen = w && w.ok && Array.isArray(w.daten) ? w.daten : [];   // Einarbeitung (als Neuer oder Pate), eigene Durchläufe
    AG.ich = !!(p && p.ok);
    AG.aufgaben = p && p.ok ? (p.daten || []).filter((a) => a.faellig) : [];
    AG.recht = r && r.ok && Array.isArray(r.daten) ? r.daten : [];   // Fristen der Rechtsfälle, an denen ich beteiligt bin
    AG.urlaubOffen = u && u.ok && u.daten.ist_genehmiger ? (u.daten.offen || 0) : 0;
  } catch (e) { /* ohne Programm-Schnittstelle bleibt das Persönliche leer */ }
  AG.geladen = Date.now();
  AG.laedt = false;
  if (seiteAusHash().name === "heute") zeichne();
}
addEventListener("odin-ich", () => { AG.geladen = 0; });
addEventListener("odin-ich-urlaub", () => { AG.geladen = 0; });

/* Gedanke des Tages aus „Beirat & Coaching“ (beirat.js): fest nach Datum, einmal je Tag geholt. Nur Text; der Link
   geht nur zu einem Modul mit geprüfter Kennung. */
const IMPULS = { tag: "", daten: null, laedt: false };
function beiratImpuls() {
  if (IMPULS.tag !== HEUTE && !IMPULS.laedt) {
    IMPULS.laedt = true;
    const tag = HEUTE;
    Promise.resolve().then(() => cpApi().beirat_aufruf("impuls", [tag])).then((r) => {
      IMPULS.daten = r && r.ok && r.daten && typeof r.daten.text === "string" ? r.daten : null;
    }).catch(() => { IMPULS.daten = null; }).finally(() => {
      IMPULS.tag = tag; IMPULS.laedt = false;
      if (IMPULS.daten && seiteAusHash().name === "heute") zeichne();
    });
  }
  const g = IMPULS.tag === HEUTE ? IMPULS.daten : null;
  if (!g) return "";
  const modul = /^[a-z0-9]{6,32}$/.test(String(g.modul || "")) ? g.modul : "";
  return '<section class="karte br-heute"><svg class="ic" aria-hidden="true"><use href="#ci-beirat"/></svg><div>' +
    '<span class="br-ueber">Gedanke des Tages aus dem Beirat</span><p>' + esc(g.text) + "</p>" +
    '<span class="klein">Sinngemäß nach ' + esc(g.name || "") + (modul ? ' · <a href="#/beirat/modul/' + modul + '">' + esc(g.modul_titel || "zum Modul") + "</a>" : "") + "</span></div></section>";
}
addEventListener("odin-projekte-geaendert", () => { AG.geladen = 0; });   // z. B. Aufgaben aus einer Besprechung
addEventListener("odin-rechtsfaelle-geaendert", () => { AG.geladen = 0; });
addEventListener("odin-wissen-geaendert", () => { AG.geladen = 0; });

function agendaTermine() {
  const a = D.agenda || { termine: [] };
  const frueh = isoPlus(HEUTE, -30);
  const eigene = AG.aufgaben.filter((x) => x.faellig >= frueh).map((x) => ({
    datum: x.faellig, art: "aufgabe", titel: x.titel, text: x.projekt + (x.spalte_name ? " · " + x.spalte_name : ""),
    ton: x.prioritaet === "hoch" ? "warn" : "", link: "#/projekt/" + encodeURIComponent(x.projekt_id),
    ueberfaellig: x.faellig < HEUTE, fahrzeug: x.fahrzeug || null, betrag: null,
  }));
  // Rechtsfälle: Fristen und Vorfristen (nur Akten, an denen ich beteiligt bin) – Art „recht“
  const recht = AG.recht.filter((x) => x.datum >= frueh).map((x) => ({
    datum: x.datum, art: "recht", titel: (x.vorfrist ? "Vorfrist: " : "Frist: ") + x.titel,
    text: [x.aktenzeichen, x.fall, x.art === "notfrist" ? "Notfrist" : "", x.vorfrist ? "Frist am " + kurzTag(x.frist_datum) : "", x.pruefen ? "berechnet, bitte prüfen" : ""].filter(Boolean).join(" · "),
    ton: x.ueberfaellig || x.art === "notfrist" ? "krit" : "warn", link: "#/rechtsfall/" + encodeURIComponent(x.aktenzeichen),
    ueberfaellig: !!x.ueberfaellig, fahrzeug: null, betrag: null,
  }));
  // Wissen & Einarbeitung: fällige Schritte der Einarbeitung und eigene Durchläufe mit Zieltermin; Link nur nach #/wissen/…
  const wissen = AG.wissen.filter((x) => x && typeof x.datum === "string" && x.datum >= frueh).map((x) => ({
    datum: x.datum, art: x.art === "ablauf" ? "ablauf" : "einarbeitung", titel: String(x.titel || ""), text: String(x.text || ""),
    ton: x.ueberfaellig ? "krit" : "", link: /^#\/wissen\/[a-z]+\/[a-z0-9]{6,32}$/.test(x.link) ? x.link : "#/wissen",
    ueberfaellig: !!x.ueberfaellig, fahrzeug: null, betrag: null,
  }));
  return [...a.termine, ...eigene, ...recht, ...wissen].sort((x, y) => x.datum.localeCompare(y.datum));
}

const amTag = (p, tag) => p.datum === tag || (!!p.bis && !p.ganze_woche && p.datum <= tag && tag <= p.bis);
const inWoche = (p, von, bis) => p.datum <= bis && (p.bis || p.datum) >= von;

function agendaPunkt(p, mitDatum) {
  const ton = p.ueberfaellig ? "krit" : p.ton;
  // Die Art steht nur dabei, wenn der Titel sie nicht schon nennt („Tilgung fällig“ braucht kein „Tilgung ·“)
  const art = AGENDA_ARTEN[p.art] || p.art;
  const mitArt = !String(p.titel).toLowerCase().includes(art.toLowerCase());
  return '<a class="ag-punkt' + (ton ? " ton-" + ton : "") + '" href="' + esc(linkOk(p.link || "#/heute")) + '">' +
    '<i class="ag-art art-' + esc(p.art) + '" aria-hidden="true"></i>' +
    '<span class="ag-text"><span class="ag-zeile"><b>' + esc(p.titel) + "</b>" +
      (p.ueberfaellig ? '<span class="pille krit">' + (mitDatum ? "seit " + kurzTag(p.datum) : "überfällig") + "</span>"
        : mitDatum ? '<span class="klein">' + kurzTag(p.datum) + "</span>" : "") + "</span>" +
      '<span class="ag-unter">' + (mitArt ? '<span class="ag-was">' + esc(art) + "</span>" + (p.text ? " · " : "") : "") +
      esc(p.text || "") + "</span></span>" +
    (p.betrag ? '<span class="ag-betrag">' + eur(p.betrag) + "</span>" : "") + "</a>";
}

const agendaListe = (punkte, leer, mitDatum) => punkte.length
  ? '<div class="ag-liste">' + punkte.map((p) => agendaPunkt(p, mitDatum)).join("") + "</div>"
  : '<p class="ag-leer">' + esc(leer) + "</p>";

function agendaFehlt(tag) {
  const a = D.agenda || {};
  const feiertag = ((a.feiertage || []).find((f) => f.datum === tag) || {}).name;
  const namen = [...new Set((a.abwesend || []).filter((x) => x.datum === tag).map((x) => x.mitarbeiter))];
  return (feiertag ? '<span class="pille info">' + esc(feiertag) + "</span>" : "") +
    (namen.length ? '<span class="ag-fehlt" title="' + esc(namen.join(", ")) + '">' +
      '<svg class="ic" aria-hidden="true"><use href="#ci-kalender"/></svg>' +
      esc(namen.length > 3 ? namen.slice(0, 3).join(", ") + " +" + (namen.length - 3) : namen.join(", ")) + "</span>" : "");
}

SEITEN.heute = { label: "Heute & Woche", render() {
  agendaPersoenlichLaden();
  const a = D.agenda || { von: HEUTE, termine: [], abwesend: [], feiertage: [], kw: "" };
  const alle = agendaTermine();
  const montag = agendaAnsicht === "naechste" ? isoPlus(a.von, 7) : a.von;
  const tage = Array.from({ length: 7 }, (_, i) => isoPlus(montag, i));
  const ganzeWoche = alle.filter((p) => p.ganze_woche && inWoche(p, agendaAnsicht === "heute" ? HEUTE : tage[0],
    agendaAnsicht === "heute" ? HEUTE : tage[6]));
  const imZeitraum = agendaAnsicht === "heute" ? alle.filter((p) => amTag(p, HEUTE))
    : alle.filter((p) => !p.ganze_woche && inWoche(p, tage[0], tage[6]));
  const ueberfaellig = alle.filter((p) => p.ueberfaellig);
  const zaehle = (art) => imZeitraum.filter((p) => p.art === art);
  const uebergaben = zaehle("uebergabe");
  const vorher = imZeitraum.filter((p) => ["zulassung", "bemerkung"].includes(p.art));
  const sonder = [...imZeitraum, ...ganzeWoche].filter((p) => ["sonderfahrt", "hinweis", "lehrgang"].includes(p.art));
  const geld = imZeitraum.filter((p) => ["tilgung", "zinsfrei", "abloesung", "zahlung"].includes(p.art));
  const wocheKarte = ganzeWoche.length ? '<div class="gitter">' + karte("In dieser Woche, ohne festen Tag",
    "Aus der Auslieferungsliste – Tag und Uhrzeit dort bzw. in CaraCamp", agendaListe(ganzeWoche, "")) + "</div>" : "";
  const fehlTage = agendaAnsicht === "heute" ? [HEUTE] : tage;
  const fehlend = [...new Set((a.abwesend || []).filter((x) => fehlTage.includes(x.datum)).map((x) => x.mitarbeiter))];
  const kwText = "KW " + isoKW(agendaAnsicht === "heute" ? HEUTE : montag);

  const umschalter = '<div class="ag-umschalter" role="tablist" aria-label="Zeitraum">' + AGENDA_ANSICHTEN.map(([k, t]) =>
    '<button type="button" role="tab" aria-selected="' + (k === agendaAnsicht) + '" data-agenda="' + k + '">' + t + "</button>").join("") + "</div>";

  let inhalt;
  if (agendaAnsicht === "heute") {
    const morgen = alle.filter((p) => amTag(p, isoPlus(HEUTE, 1)) && !p.ueberfaellig);
    const heuteListe = imZeitraum.filter((p) => !p.ueberfaellig);
    inhalt = (ueberfaellig.length ? '<div class="gitter">' + karte("Überfällig", "Noch nicht erledigt, obwohl der Tag vorbei ist (letzte 30 Tage)",
        agendaListe(ueberfaellig, "", true)) + "</div>" : "") +
      '<div class="gitter zweidrittel">' +
        karte("Heute", wochentag(HEUTE, true) + ", " + tagMonat(HEUTE),
          (agendaFehlt(HEUTE) ? '<div class="ag-tagzeile">' + agendaFehlt(HEUTE) + "</div>" : "") +
          agendaListe(heuteListe, "Heute steht nichts mit Datum an.")) +
        karte("Morgen", wochentag(isoPlus(HEUTE, 1), true) + ", " + tagMonat(isoPlus(HEUTE, 1)),
          (agendaFehlt(isoPlus(HEUTE, 1)) ? '<div class="ag-tagzeile">' + agendaFehlt(isoPlus(HEUTE, 1)) + "</div>" : "") +
          agendaListe(morgen, "Morgen steht nichts mit Datum an.")) +
      "</div>" + wocheKarte;
  } else {
    const tagHtml = (t) => {
      const punkte = alle.filter((p) => amTag(p, t));
      const wochenende = new Date(t + "T12:00:00").getDay() % 6 === 0;
      const klasse = ["ag-tag", t === HEUTE ? "ist-heute" : "", t < HEUTE ? "vorbei" : "", wochenende && !punkte.length ? "frei" : ""].filter(Boolean).join(" ");
      return '<section class="' + klasse + '" aria-label="' + esc(wochentag(t, true) + ", " + tagMonat(t)) + '">' +
        '<header><b>' + esc(wochentag(t)) + "</b><span>" + kurzTag(t) + "</span>" +
          (punkte.length ? '<span class="ag-anzahl">' + punkte.length + "</span>" : "") + "</header>" +
        (agendaFehlt(t) ? '<div class="ag-tagzeile">' + agendaFehlt(t) + "</div>" : "") +
        agendaListe(punkte, wochenende ? "–" : "Nichts geplant") + "</section>";
    };
    inhalt = (ueberfaellig.filter((p) => p.datum < tage[0]).length ? '<div class="hinweis">' + HINWEIS_ICON + "<div><b>" +
        zahl(ueberfaellig.filter((p) => p.datum < tage[0]).length) + " überfällige Punkte</b> aus früheren Wochen. " +
        '<a href="#/heute" data-agenda="heute">Unter „Heute“ ansehen</a></div></div>' : "") + wocheKarte +
      '<div class="ag-woche">' + tage.slice(0, 5).map(tagHtml).join("") + "</div>" +
      '<div class="ag-woche ag-we">' + tage.slice(5).map(tagHtml).join("") + "</div>";
  }

  const persoenlich = AG.urlaubOffen ? '<div class="hinweis">' + HINWEIS_ICON + "<div><b>" +
    (AG.urlaubOffen === 1 ? "Ein Urlaubsantrag wartet" : zahl(AG.urlaubOffen) + " Urlaubsanträge warten") +
    " auf deine Entscheidung.</b> " + '<a href="#/urlaub/genehmigen">Jetzt ansehen</a></div></div>' : "";
  const tk = AG.tickets || {};
  const ticketHinweis = tk.verwalter && tk.offen ? '<div class="hinweis">' + HINWEIS_ICON + "<div><b>" +
      (tk.neu ? mehrzahl(tk.neu, "neues Ticket", "neue Tickets") + " · " : "") + mehrzahl(tk.offen, "offenes Ticket", "offene Tickets") + ".</b> " +
      '<a href="#/tickets">Tickets ansehen</a></div></div>'
    : !tk.verwalter && tk.hinweis ? '<div class="hinweis">' + HINWEIS_ICON + "<div><b>" + (tk.hinweis === 1 ? "Zu deinem Ticket gibt es einen Hinweis." : "Zu " + zahl(tk.hinweis) + " deiner Tickets gibt es Hinweise.") + "</b> " +
      '<a href="#/tickets">Ansehen</a></div></div>' : "";

  const html = banner() + persoenlich + ticketHinweis +
    '<div class="kopf"><div><h1>Heute &amp; Woche</h1><p>' + esc(wochentag(HEUTE, true) + ", " + tagMonat(HEUTE)) + " · " + kwText +
      ". Übergaben, Zulassungen, Sonderfahrten, Fristen und Aufgaben mit Datum – aus allen Listen an einer Stelle." +
      (AG.ich ? "" : " Deine Projektaufgaben erscheinen hier, sobald du unter „Projekte“ deinen Namen gewählt hast.") +
      "</p></div>" + umschalter + "</div>" +
    '<div class="kacheln">' +
      kachel("Übergaben", zahl(uebergaben.length),
        !uebergaben.length ? "keine geplant" : uebergaben.filter((p) => p.ton === "krit").length ? zahl(uebergaben.filter((p) => p.ton === "krit").length) + " mit offenen Punkten" : "alles vorbereitet",
        uebergaben.some((p) => p.ton === "krit") ? "warn" : "") +
      kachel("Vor Übergaben", zahl(vorher.length),
        !vorher.length ? "nichts vorzubereiten" : mehrzahl(vorher.filter((p) => p.art === "zulassung").length, "Zulassung", "Zulassungen") +
          " · " + mehrzahl(vorher.filter((p) => p.art === "bemerkung").length, "Bemerkung", "Bemerkungen"),
        vorher.some((p) => p.ton === "krit") ? "warn" : "") +
      kachel("Sonderfahrten", zahl(sonder.length),
        sonder.some((p) => p.art === "hinweis") ? "mit Hinweis für den Tag" : sonder.length ? "Partner, Lehrgänge, Termine" : "keine",
        sonder.some((p) => p.art === "hinweis") ? "warn" : "") +
      (D.finanzen ? kachel("Geld", eur(geld.filter((p) => p.art === "tilgung").reduce((s, p) => s + (p.betrag || 0), 0)),
        mehrzahl(geld.filter((p) => p.art === "tilgung").length, "Tilgung", "Tilgungen") + " · " +
        mehrzahl(geld.filter((p) => p.art === "zinsfrei").length, "Zinsfrei-Ende", "Zinsfrei-Enden") +
        (geld.some((p) => p.art === "zahlung") ? " · " + mehrzahl(geld.filter((p) => p.art === "zahlung").length, "Zahlung", "Zahlungen") +
          " erwartet (" + eur(geld.filter((p) => p.art === "zahlung").reduce((s, p) => s + (geldOk(p.betrag) || 0), 0)) + ")" : "")) : "") +
      kachel(agendaAnsicht === "heute" ? "Fehlt heute" : "Abwesend", zahl(fehlend.length),
        fehlend.length ? fehlend.slice(0, 3).join(", ") + (fehlend.length > 3 ? " …" : "") : "alle da") +
      (agendaAnsicht === "heute" ? kachel("Überfällig", zahl(ueberfaellig.length), D.finanzen ? "Übergaben, Zahlungen, To-dos" : "Übergaben, Zulassungen, To-dos", ueberfaellig.length ? "krit" : "gut") : "") +
    "</div>" + inhalt + (agendaAnsicht === "heute" ? beiratImpuls() : "");

  return { html, nach() {
    document.querySelectorAll("[data-agenda]").forEach((b) => b.addEventListener("click", () => {
      if (agendaAnsicht === b.dataset.agenda) return;
      agendaAnsicht = b.dataset.agenda;
      zeichne();
    }));
  } };
} };

/* ------------------------------------------------- Führung: Scorecard, Fristen, Zinsuhr, Bonus
   Ideen aus dem Beirat: Scorecard nach Wickman/Harnish (wenige Zahlen, je Zahl ein Ziel und ein Verantwortlicher,
   rot = Thema für die Wochenrunde), Nachlass gegen Standkosten nach Hermann Simon.
   Gerechnet wird in Python (fuehrung.py); hier nur Darstellung und Eingabe. */
const fuehrungAufruf = (aktion, ...args) => speichern(() => cpApi().cockpit_aufruf(aktion, args));
const fFeld = (beschriftung, inhalt, breite) =>
  '<label class="feld"' + (breite ? ' style="max-width:' + breite + '"' : "") + "><span>" + esc(beschriftung) + "</span>" + inhalt + "</label>";
const fLeer = (text) => '<p class="karte-leer">' + text + "</p>";

/* ---------- Scorecard ---------- */
let scBearbeiten = false;
let scEntwurf = null;
const scZahl = (k, w) => w === null || w === undefined ? "–" : (k.einheit === "%" ? zahl(w) + " %" : zahl(w, Number.isInteger(w) ? 0 : 1));

function scTabelle(sc) {
  const wochen = sc.wochen;
  const kopf = '<tr><th>Kennzahl</th><th>Verantwortlich</th><th class="r">Ziel</th>' +
    wochen.map((w) => '<th class="r' + (w.laufend ? " sc-jetzt" : "") + '" title="' + esc(datum(w.von) + " – " + datum(w.bis)) + '">KW ' + w.kw + "</th>").join("") + "</tr>";
  const zeilen = sc.kennzahlen.map((k) => {
    const zellen = k.werte.map((w, i) => {
      const eingabe = k.quelle === "manuell" && i >= wochen.length - 2;
      const inhalt = eingabe
        ? '<input class="sc-eingabe" inputmode="decimal" aria-label="' + esc(k.name + " KW " + wochen[i].kw) + '" data-sc-wert="' + esc(k.id) + '" data-woche="' + esc(w.woche) + '" value="' + (w.wert ?? "") + '">'
        : scZahl(k, w.wert);
      return '<td class="r sc-zelle ' + (w.ampel ? "sc-" + w.ampel : "") + (wochen[i].laufend ? " sc-jetzt" : "") + '">' + inhalt + "</td>";
    }).join("");
    return '<tr><td title="' + esc(k.erklaerung) + '"><b>' + esc(k.name) + "</b>" + (k.einheit ? ' <span class="klein">' + esc(k.einheit) + "</span>" : "") +
      (k.rot_in_folge >= 3 ? ' <span class="pille krit">' + k.rot_in_folge + " Wochen rot</span>" : "") +
      (k.rot_in_folge >= 3 ? '<div class="klein sc-pruefen">Prüfen: Ist jemand verantwortlich? Der Richtige? Ist das Ziel realistisch?</div>' : "") + "</td>" +
      '<td class="leise">' + esc(k.verantwortlich || "–") + "</td>" +
      '<td class="r">' + (k.ziel === null || k.ziel === undefined ? '<span class="leise">–</span>' : (k.richtung === "<=" ? "≤ " : "≥ ") + scZahl(k, k.ziel)) + "</td>" + zellen + "</tr>";
  }).join("");
  return '<div class="tab-huelle"><table class="sc-tabelle"><thead>' + kopf + "</thead><tbody>" + zeilen + "</tbody></table></div>";
}

function scEditor(sc) {
  const liste = scEntwurf;
  const verfuegbar = sc.verfuegbar.filter((v) => !liste.some((k) => k.id === v.id));
  const zeilen = liste.map((k, i) =>
    '<tr data-sc-zeile="' + i + '"><td><div class="sc-reihe-knoepfe">' +
      '<button type="button" class="mini" data-sc-hoch="' + i + '" aria-label="nach oben"' + (i === 0 ? " disabled" : "") + ">↑</button>" +
      '<button type="button" class="mini" data-sc-runter="' + i + '" aria-label="nach unten"' + (i === liste.length - 1 ? " disabled" : "") + ">↓</button></div></td>" +
    "<td>" + (k.quelle === "auto" ? "<b>" + esc(k.name) + '</b><div class="klein">rechnet ODIN</div>' : '<input data-sc="name" value="' + esc(k.name) + '" maxlength="60">') + "</td>" +
    '<td><input data-sc="einheit" value="' + esc(k.einheit || "") + '" maxlength="12" style="width:64px"></td>' +
    '<td><select data-sc="richtung"><option value=">="' + (k.richtung !== "<=" ? " selected" : "") + '>mindestens</option><option value="<="' + (k.richtung === "<=" ? " selected" : "") + ">höchstens</option></select></td>" +
    '<td><input data-sc="ziel" inputmode="decimal" value="' + (k.ziel ?? "") + '" style="width:80px" placeholder="kein"></td>' +
    '<td><input data-sc="verantwortlich" value="' + esc(k.verantwortlich || "") + '" maxlength="60" placeholder="Name"></td>' +
    '<td><label class="sc-an"><input type="checkbox" data-sc="aktiv"' + (k.aktiv !== false ? " checked" : "") + "> zeigen</label></td>" +
    '<td class="r">' + (k.quelle === "manuell" ? '<button type="button" class="mini" data-sc-weg="' + i + '">entfernen</button>' : "") + "</td></tr>").join("");
  return '<div class="tab-huelle"><table class="sc-editor"><thead><tr><th></th><th>Kennzahl</th><th>Einheit</th><th>Ziel ist</th><th>Ziel</th><th>Verantwortlich</th><th>Sichtbar</th><th></th></tr></thead><tbody>' + zeilen + "</tbody></table></div>" +
    '<div class="sc-neu"><select id="sc-neu-auswahl"><option value="">Kennzahl hinzufügen …</option>' +
      verfuegbar.map((v) => '<option value="' + esc(v.id) + '">' + esc(v.name) + " (rechnet ODIN)</option>").join("") +
      '<option value="eigene">Eigene Kennzahl (Wert je Woche eintragen)</option>' +
      ((sc.vorlagen || []).filter((v) => !liste.some((k) => k.name === v.name)).length
        ? '<optgroup label="Vorschläge aus dem Beirat (Wickman, für Muster übertragen)">' + sc.vorlagen.map((v, i) => liste.some((k) => k.name === v.name) ? ""
          : '<option value="vorlage:' + i + '">' + esc(v.name) + " – " + esc(v.verantwortlich) + "</option>").join("") + "</optgroup>" : "") + "</select>" +
    '<button type="button" class="btn-primaer" id="sc-speichern">Speichern</button><button type="button" class="mini" id="sc-abbrechen">Abbrechen</button></div>';
}

function scEntwurfLesen() {
  document.querySelectorAll("[data-sc-zeile]").forEach((tr) => {
    const k = scEntwurf[Number(tr.dataset.scZeile)];
    tr.querySelectorAll("[data-sc]").forEach((el) => { k[el.dataset.sc] = el.type === "checkbox" ? el.checked : el.value; });
  });
}

SEITEN.scorecard = { label: "Scorecard", render() {
  const sc = D.scorecard;
  if (!sc) return { html: banner() + '<div class="kopf"><div><h1>Scorecard</h1></div></div>' + fLeer("Die Scorecard konnte nicht berechnet werden – Details stehen im Protokoll.") };
  const ohneZiel = sc.kennzahlen.filter((k) => k.ziel === null || k.ziel === undefined).length;
  const html = banner() +
    '<div class="kopf"><div><h1>Scorecard</h1><p>Die wichtigsten Zahlen der Woche auf einen Blick – je Zahl ein Ziel und ein Verantwortlicher. ' +
      "Rot heißt nicht „schlecht gelaufen“, sondern: hinschauen, was dahintersteckt. Wenige Zahlen, die man wirklich steuert, schlagen viele.</p></div>" +
      '<div class="kopf-aktionen">' + (scBearbeiten ? "" : '<button type="button" class="btn" id="sc-bearbeiten">Kennzahlen bearbeiten</button>') +
      "</div></div>" +
    '<div class="kacheln">' +
      kachel("Im Ziel diese Woche", sc.mit_ziel ? zahl(sc.im_ziel) + " von " + zahl(sc.mit_ziel) : "–", sc.mit_ziel ? "Kennzahlen mit Ziel" : "noch keine Ziele gesetzt", sc.mit_ziel && sc.im_ziel === sc.mit_ziel ? "gut" : "") +
      kachel("Seit 3 Wochen rot", zahl(sc.rot_seit_3), sc.rot_seit_3 ? "genauer hinschauen" : "nichts Dauerhaftes", sc.rot_seit_3 ? "krit" : "gut") +
      kachel("Kennzahlen", zahl(sc.kennzahlen.length), ohneZiel ? ohneZiel + " ohne Ziel" : "alle mit Ziel", ohneZiel ? "warn" : "") +
    "</div>" +
    '<div class="gitter">' + (scBearbeiten
      ? karte("Kennzahlen bearbeiten", "Reihenfolge, Ziel und Verantwortlicher. Ohne Ziel bleibt die Zelle grau. Eigene Kennzahlen (z. B. Beratungstermine, Anfragen, Bewertungen) bekommen ihren Wert je Woche von Hand.", scEditor(sc))
      : karte("Letzte 13 Wochen", "Grün = im Ziel, rot = verfehlt. Zeiger auf den Namen erklärt die Kennzahl. Eigene Kennzahlen: Wert in den letzten beiden Wochen direkt eintragen.", scTabelle(sc))) + "</div>";
  return { html, nach() {
    const b = document.getElementById("sc-bearbeiten");
    if (b) b.addEventListener("click", () => { scEntwurf = JSON.parse(JSON.stringify(sc.konfiguration)); scBearbeiten = true; zeichne(); });
    const huelle = document.querySelector(".sc-tabelle") && document.querySelector(".sc-tabelle").closest(".tab-huelle");
    if (huelle) huelle.scrollLeft = huelle.scrollWidth;          // die laufende Woche steht rechts – dorthin rollen
    document.querySelectorAll("[data-sc-wert]").forEach((el) => el.addEventListener("change", () =>
      fuehrungAufruf("scorecard_wert", el.dataset.scWert, el.dataset.woche, el.value.trim())));
    if (!scBearbeiten) return;
    const tausch = (i, j) => { scEntwurfLesen(); [scEntwurf[i], scEntwurf[j]] = [scEntwurf[j], scEntwurf[i]]; zeichne(); };
    document.querySelectorAll("[data-sc-hoch]").forEach((x) => x.addEventListener("click", () => tausch(Number(x.dataset.scHoch), Number(x.dataset.scHoch) - 1)));
    document.querySelectorAll("[data-sc-runter]").forEach((x) => x.addEventListener("click", () => tausch(Number(x.dataset.scRunter), Number(x.dataset.scRunter) + 1)));
    document.querySelectorAll("[data-sc-weg]").forEach((x) => x.addEventListener("click", () => { scEntwurfLesen(); scEntwurf.splice(Number(x.dataset.scWeg), 1); zeichne(); }));
    document.getElementById("sc-neu-auswahl").addEventListener("change", (ev) => {
      const wahl = ev.target.value;
      if (!wahl) return;
      scEntwurfLesen();
      const v = sc.verfuegbar.find((x) => x.id === wahl);
      const vorlage = wahl.startsWith("vorlage:") ? sc.vorlagen[Number(wahl.slice(8))] : null;
      scEntwurf.push(v ? { id: v.id, quelle: "auto", name: v.name, einheit: v.einheit, richtung: v.richtung, ziel: null, verantwortlich: "", aktiv: true }
        : vorlage ? { id: "", quelle: "manuell", name: vorlage.name, einheit: vorlage.einheit, richtung: vorlage.richtung, ziel: null, verantwortlich: vorlage.verantwortlich, aktiv: true }
        : { id: "", quelle: "manuell", name: "", einheit: "", richtung: ">=", ziel: null, verantwortlich: "", aktiv: true });
      zeichne();
    });
    document.getElementById("sc-abbrechen").addEventListener("click", () => { scBearbeiten = false; scEntwurf = null; zeichne(); });
    document.getElementById("sc-speichern").addEventListener("click", async () => {
      scEntwurfLesen();
      const r = await cpApi().cockpit_aufruf("scorecard_speichern", [scEntwurf]);
      if (r && r.fehler) { meldung(r.fehler, true); return; }
      scBearbeiten = false; scEntwurf = null;
      speichern(async () => ({ ok: true }));
      meldung("Scorecard gespeichert");
    });
  } };
} };

/* ---------- Fristen ---------- */
let fristBearbeiten = null;
const fristIntervall = (m) => !m ? "einmalig" : m % 12 === 0 ? (m === 12 ? "jährlich" : "alle " + m / 12 + " Jahre") : "alle " + m + " Monate";
function fristPille(f) {
  if (f.zustand === "ueberfaellig") return '<span class="pille krit">seit ' + tagenDativ(f.tage_bis) + " überfällig</span>";
  if (f.zustand === "bald") return '<span class="pille warn">' + (f.tage_bis === 0 ? "heute" : "in " + tageText(f.tage_bis)) + "</span>";
  if (f.zustand === "erledigt") return '<span class="pille gut">erledigt</span>';
  return '<span class="pille">' + datum(f.faellig_am) + "</span>";
}

SEITEN.fristen = { label: "Fristen", render() {
  const fristen = D.fristen || [];
  const offen = fristen.filter((f) => f.zustand !== "erledigt");
  const ueber = offen.filter((f) => f.zustand === "ueberfaellig"), bald = offen.filter((f) => f.zustand === "bald");
  const e = fristBearbeiten ? fristen.find((f) => f.id === fristBearbeiten) || {} : {};
  const kategorien = D.fristKategorien || [];
  const intervalle = [[0, "einmalig"], [6, "halbjährlich"], [12, "jährlich"], [24, "alle 2 Jahre"], [36, "alle 3 Jahre"], [60, "alle 5 Jahre"]];
  const formular = '<form class="frist-form" id="frist-form" novalidate>' +
    fFeld("Was ist fällig?", '<input id="fr-titel" maxlength="120" value="' + esc(e.titel || "") + '" placeholder="z. B. Prüfung Hebebühnen">', "320px") +
    fFeld("Bereich", '<select id="fr-kategorie">' + kategorien.map((k) => "<option" + (k === e.kategorie ? " selected" : "") + ">" + esc(k) + "</option>").join("") + "</select>") +
    fFeld("Fällig am", '<input type="date" id="fr-datum" value="' + esc(e.faellig_am || "") + '">') +
    fFeld("Wiederholung", '<select id="fr-intervall">' + intervalle.map(([m, t]) => '<option value="' + m + '"' + (Number(e.intervall_monate || 12) === m ? " selected" : "") + ">" + t + "</option>").join("") + "</select>") +
    fFeld("Erinnern ab (Tage vorher)", '<input type="number" id="fr-vorlauf" min="0" max="365" value="' + (e.vorlauf_tage ?? 30) + '" style="width:90px">') +
    fFeld("Verantwortlich", '<input id="fr-wer" maxlength="60" value="' + esc(e.verantwortlich || "") + '" placeholder="Name oder Rolle">') +
    fFeld("Notiz", '<input id="fr-notiz" maxlength="500" value="' + esc(e.notiz || "") + '" placeholder="z. B. Prüfer, Vertragsnummer">', "320px") +
    '<div class="feld knopf-zeile"><span>&nbsp;</span><div style="display:flex;gap:8px"><button type="submit" class="btn-primaer">' + (fristBearbeiten ? "Änderung speichern" : "Frist eintragen") + "</button>" +
      (fristBearbeiten ? '<button type="button" class="mini" id="fr-abbrechen">Abbrechen</button>' : "") + "</div></div></form>" +
    (fristBearbeiten ? "" : '<div class="filter fr-vorlagen"><span class="klein">Vorlagen:</span>' + (D.fristVorlagen || []).map((v, i) =>
      '<button type="button" data-fr-vorlage="' + i + '">' + esc(v.titel) + "</button>").join("") + "</div>");
  const liste = offen.length ? '<div class="fr-liste">' + offen.map((f) =>
    '<div class="fr-zeile fr-' + esc(f.zustand) + '"><div class="fr-text"><b>' + esc(f.titel) + "</b> " + fristPille(f) +
      '<div class="klein">' + esc([f.kategorie, f.verantwortlich, fristIntervall(f.intervall_monate), "fällig " + datum(f.faellig_am)].filter(Boolean).join(" · ")) +
      (f.notiz ? " · " + esc(f.notiz) : "") + (f.historie && f.historie.length ? " · zuletzt erledigt " + datum(f.historie[f.historie.length - 1].erledigt_am) : "") + "</div></div>" +
      '<div class="fr-knoepfe"><button type="button" class="btn-primaer" data-fr-erledigt="' + esc(f.id) + '">Erledigt</button>' +
      '<button type="button" class="mini" data-fr-bearbeiten="' + esc(f.id) + '">bearbeiten</button>' +
      '<button type="button" class="mini" data-fr-weg="' + esc(f.id) + '">löschen</button></div></div>').join("") + "</div>"
    : fLeer("Noch keine Fristen eingetragen.<br>Oben eintragen oder eine Vorlage wählen.");
  const html = banner() +
    '<div class="kopf"><div><h1>Fristen</h1><p>Prüfungen, Versicherungen, Verträge und Nachweise des Betriebs. ODIN erinnert rechtzeitig, zeigt Fälliges in „Heute &amp; Woche“ ' +
      "und rückt wiederkehrende Fristen nach dem Erledigen von selbst weiter. Die Intervalle der Vorlagen sind Startwerte – bitte für euren Betrieb prüfen.</p></div></div>" +
    '<div class="kacheln">' +
      kachel("Überfällig", zahl(ueber.length), ueber.length ? ueber[0].titel : "nichts überfällig", ueber.length ? "krit" : "gut") +
      kachel("Bald fällig", zahl(bald.length), "innerhalb der Erinnerungszeit", bald.length ? "warn" : "") +
      kachel("Fristen", zahl(offen.length), "werden überwacht") +
    "</div>" +
    '<div class="gitter">' + karte(fristBearbeiten ? "Frist bearbeiten" : "Neue Frist", "Gespeichert im Ordner „Fahrzeuge“ – alle mit ODIN sehen dieselben Fristen.", formular) + "</div>" +
    '<div class="gitter">' + karte("Alle Fristen", "Überfälliges zuerst, dann nach Datum", liste) + "</div>";
  return { html, nach() {
    const form = document.getElementById("frist-form");
    const wert = (id) => document.getElementById(id).value;
    form.addEventListener("submit", (ev) => {
      ev.preventDefault();
      const eingabe = { id: fristBearbeiten || undefined, titel: wert("fr-titel"), kategorie: wert("fr-kategorie"), faellig_am: wert("fr-datum"),
        intervall_monate: Number(wert("fr-intervall")), vorlauf_tage: wert("fr-vorlauf"), verantwortlich: wert("fr-wer"), notiz: wert("fr-notiz") };
      fristBearbeiten = null;
      fuehrungAufruf("frist_speichern", eingabe);
    });
    const ab = document.getElementById("fr-abbrechen");
    if (ab) ab.addEventListener("click", () => { fristBearbeiten = null; zeichne(); });
    document.querySelectorAll("[data-fr-vorlage]").forEach((b) => b.addEventListener("click", () => {
      const v = D.fristVorlagen[Number(b.dataset.frVorlage)];
      document.getElementById("fr-titel").value = v.titel;
      document.getElementById("fr-kategorie").value = v.kategorie;
      document.getElementById("fr-intervall").value = String(v.intervall_monate);
      document.getElementById("fr-datum").focus();
    }));
    document.querySelectorAll("[data-fr-erledigt]").forEach((b) => b.addEventListener("click", () => fuehrungAufruf("frist_erledigt", Number(b.dataset.frErledigt))));
    document.querySelectorAll("[data-fr-bearbeiten]").forEach((b) => b.addEventListener("click", () => { fristBearbeiten = Number(b.dataset.frBearbeiten); zeichne(); document.getElementById("inhalt").scrollTo({ top: 0, behavior: "smooth" }); }));
    document.querySelectorAll("[data-fr-weg]").forEach((b) => b.addEventListener("click", () => {
      if (confirm("Diese Frist löschen?")) fuehrungAufruf("frist_loeschen", Number(b.dataset.frWeg));
    }));
  } };
} };

/* ---------- Zinsuhr & Langsteher ---------- */
/* ---------- Cashback & Gutschriften
   Liest die Aktionslisten je Hersteller (Ordner „GUTSCHRIFTEN Cashback Aktionen“). ODIN schreibt nie hinein:
   eingetragen wird weiter in Excel. Hier steht, was jetzt zu tun ist – einreichen, bevor die Frist abläuft,
   und nachhaken, wenn die Gutschrift auf sich warten lässt. */
const cbDe = (iso) => iso ? kurzTag(iso) + iso.slice(2, 4) : "";
function cbLage(v) {
  if (v.lage === "ueberfaellig") return '<span class="pille krit">Frist abgelaufen am ' + esc(cbDe(v.frist)) + "</span>";
  if (v.lage === "bald") return '<span class="pille warn">einreichen bis ' + esc(cbDe(v.frist)) + (v.frist_tage === 0 ? " (heute)" : " (noch " + tageText(v.frist_tage) + ")") + "</span>";
  if (v.lage === "nachhaken") return '<span class="pille warn">seit ' + tagenDativ(v.tage_seit) + " angefordert</span>";
  if (v.lage === "ohne_datum") return '<span class="pille">angefordert – Datum fehlt in der Liste</span>';
  if (v.status === "Angefordert" && v.tage_seit !== null) return '<span class="pille">seit ' + tagenDativ(v.tage_seit) + " angefordert</span>";
  if (v.frist) return '<span class="pille">Frist ' + esc(cbDe(v.frist)) + "</span>";
  return "";
}
const cbBetrag = (v) => v.soll !== null ? eur(v.soll) : v.aktionsbetrag !== null ? eur(v.aktionsbetrag) + " Endkunde" : "Betrag offen";
function cbPunkt(v) {
  const unter = [v.modell, v.aktion, v.hersteller + " " + v.jahr].filter(Boolean).join(" · ");
  return '<div class="cb-punkt"><div class="cb-text"><div class="cb-zeile"><b>' + esc(v.kunde || v.fin) + "</b>" + cbLage(v) +
    '<span class="pille ' + (v.status === "Prüfen" ? "warn" : "") + '">' + esc(v.status || "Status fehlt") + "</span></div>" +
    '<div class="klein">' + esc(unter) + (v.anmerkung ? " · " + esc(v.anmerkung) : "") + "</div></div>" +
    '<div class="cb-betrag">' + esc(cbBetrag(v)) + "</div></div>";
}
function cbZusammenfassung(c) {
  const k = c.kennzahlen, z = [];
  z.push("Cashback – Stand " + datum(HEUTE));
  z.push("Offen: " + k.offen + " Vorgänge, " + eur(k.offen_netto) + " netto erwartet" + (k.offen_ohne_betrag ? " (" + k.offen_ohne_betrag + " ohne Betrag)" : ""));
  if (c.fristen.length) {
    z.push("", "Einreichen (Frist):");
    c.fristen.forEach((v) => z.push("- " + [v.kunde, v.modell, v.aktion, v.hersteller].filter(Boolean).join(", ") + ": " +
      (v.lage === "ueberfaellig" ? "Frist abgelaufen am " : "bis ") + cbDe(v.frist)));
  }
  if (c.nachhaken.length) {
    z.push("", "Nachhaken (Gutschrift angefordert):");
    c.nachhaken.forEach((v) => z.push("- " + [v.kunde, v.aktion, v.hersteller].filter(Boolean).join(", ") + ": " +
      (v.tage_seit !== null ? "seit " + v.tage_seit + " Tagen angefordert" : "Anforderungsdatum fehlt")));
  }
  if (c.aktionen.length) {
    z.push("", "Aktionen mit Einreichungsfrist:");
    c.aktionen.forEach((a) => z.push("- " + a.aktion + " (" + a.hersteller + "): bis " + cbDe(a.frist) + (a.noch_einreichen ? ", noch " + a.noch_einreichen + " einzureichen" : "")));
  }
  return z.join("\n");
}

SEITEN.cashback = { label: "Cashback", render() {
  const c = D.cashback;
  const kopf = '<div class="kopf"><div><h1>Cashback &amp; Gutschriften</h1><p>Herstelleraktionen aus euren Aktionslisten: was eingereicht werden muss, ' +
    "bevor die Frist abläuft, wo die Gutschrift auf sich warten lässt und wie viel noch offen ist. ODIN liest nur – eingetragen wird weiter in Excel.</p></div></div>";
  if (!c) return { html: banner() + kopf + '<div class="gitter">' + karte("Cashback", "", fLeer("Die Cashback-Listen ließen sich nicht auswerten. Details stehen im Protokoll.")) + "</div>" };
  const einrichten = '<div class="cb-einrichten"><p>Wähle den Ordner, in dem die Aktionslisten liegen (z. B. „GUTSCHRIFTEN Cashback Aktionen“ im OneDrive-Ordner Finanzen). ' +
    "Je Hersteller zählt die zuletzt gespeicherte Datei, Sicherungskopien und die Vorlage werden übersprungen.</p>" +
    '<button type="button" class="btn-primaer nur-programm" id="cb-ordner">Ordner wählen</button>' +
    '<p class="klein nur-web">Einrichten geht am Rechner in ODIN.</p></div>';
  if (!c.eingerichtet && !c.beispiel) return { html: banner() + kopf + '<div class="gitter">' + karte("Cashback-Listen einbinden", "Einmal je Rechner", einrichten) + "</div>", nach: cbVerdrahten };
  const k = c.kennzahlen;
  const fristZahl = k.fristen_ueberfaellig + k.fristen_bald;
  const jetzt = [...c.fristen, ...c.nachhaken];
  const fehler = c.fehler ? '<div class="cb-fehler">' + esc(c.fehler) + "</div>" : "";
  const kacheln = '<div class="kacheln">' +
    kachel("Offen erwartet", eur(k.offen_netto), zahl(k.offen) + " Vorgänge" + (k.offen_ohne_betrag ? " · " + k.offen_ohne_betrag + " ohne Betrag" : "") + (k.offen_endkunde ? " · " + eur(k.offen_endkunde) + " Aktionsbetrag Endkunde" : "")) +
    kachel("Fristen", zahl(fristZahl), k.fristen_ueberfaellig ? k.fristen_ueberfaellig + " abgelaufen, " + k.fristen_bald + " bald" : fristZahl ? "bald einreichen" : "nichts läuft ab", k.fristen_ueberfaellig ? "krit" : fristZahl ? "warn" : "gut") +
    kachel("Nachhaken", zahl(k.nachhaken), "angefordert, Gutschrift fehlt noch", k.nachhaken ? "warn" : "") +
    kachel("Erhalten " + k.jahr, eur(k.erhalten_jahr), "Gutschriften netto" + (k.abweichung_summe ? " · Abweichung " + eur(k.abweichung_summe) : "")) +
    "</div>";
  const jetztKarte = karte("Jetzt erledigen", "Fristen, die ablaufen, und Gutschriften zum Nachhaken. Erledigt wird in der Excel-Liste – ODIN liest beim nächsten Speichern neu.",
    jetzt.length ? '<div class="cb-liste">' + jetzt.map(cbPunkt).join("") + "</div>" : fLeer("Nichts zu tun – keine Frist läuft ab, keine Gutschrift ist überfällig."),
    '<button type="button" class="mini" id="cb-kopieren">Als Text kopieren</button>');
  const aktionen = c.aktionen.length ? karte("Aktionen: Einreichungsfrist endet bald", "Aus dem Aktionskatalog der Listen, nächste " + 45 + " Tage",
    tabelle(["Aktion", "Hersteller", "Zeitraum", "Einreichen bis", "~Noch einreichen"], c.aktionen.map((a) =>
      "<tr><td><b>" + esc(a.aktion) + "</b>" + (a.bedingung ? '<div class="klein cb-bedingung">' + esc(a.bedingung) + "</div>" : "") + "</td><td>" + esc(a.hersteller) + "</td><td>" +
      esc(a.von && a.bis ? cbDe(a.von) + " – " + cbDe(a.bis) : a.bis ? "bis " + cbDe(a.bis) : a.von ? "ab " + cbDe(a.von) : "") + "</td><td>" + esc(cbDe(a.frist)) + ' <span class="klein">(' + tageText(a.tage) + ")</span></td>" +
      '<td class="r">' + (a.noch_einreichen ? '<span class="pille warn">' + a.noch_einreichen + "</span>" : "–") + "</td></tr>"))) : "";
  const offen = karte("Alle offenen Vorgänge", "Angelegt, Angefordert und Prüfen – aus allen Jahresblättern",
    tabelle(["Status", "Kunde", "Modell", "Aktion", "Hersteller", "Stand", "~Erwartet netto"], c.offen.map((v) =>
      "<tr><td>" + esc(v.status) + "</td><td><b>" + esc(v.kunde || v.fin) + "</b></td><td>" + esc(v.modell) + "</td><td>" + esc(v.aktion) + "</td><td>" + esc(v.hersteller + " " + v.jahr) + "</td><td>" +
      cbLage(v) + '</td><td class="r">' + (v.soll !== null ? eur(v.soll) : "–") + "</td></tr>")));
  const hersteller = karte("Je Hersteller", "Offen über alle Jahre, erhalten im laufenden Jahr",
    tabelle(["Hersteller", "~Angelegt", "~Angefordert", "~Prüfen", "~Offen netto", "~Erhalten " + k.jahr, "Liste"], c.hersteller.map((h) =>
      "<tr><td><b>" + esc(h.name) + '</b><div class="klein">Nachhaken ab ' + h.nachfassen + " Tagen · warnen " + h.warnen + " Tage vor der Frist</div></td>" +
      '<td class="r">' + zahl(h.angelegt) + '</td><td class="r">' + zahl(h.angefordert) + '</td><td class="r">' + zahl(h.pruefen) + '</td><td class="r">' + eur(h.offen_netto) +
      '</td><td class="r">' + eur(h.erhalten_jahr) + "</td><td>" + (h.datei && !c.beispiel ? '<button type="button" class="mini nur-programm" data-cb-datei="' + esc(h.datei) + '">öffnen</button>' : "") + "</td></tr>")));
  const abw = c.abweichungen.length ? karte("Gutschrift weicht vom Soll ab", "Erledigte Vorgänge, bei denen der Hersteller mehr oder weniger gezahlt hat",
    tabelle(["Kunde", "Aktion", "Hersteller", "GS-Datum", "~Soll", "~Ist", "~Differenz"], c.abweichungen.map((v) =>
      "<tr><td>" + esc(v.kunde) + "</td><td>" + esc(v.aktion) + "</td><td>" + esc(v.hersteller) + "</td><td>" + esc(cbDe(v.gs_datum)) + '</td><td class="r">' + (v.soll !== null ? eur(v.soll) : "–") +
      '</td><td class="r">' + (v.gs_netto !== null ? eur(v.gs_netto) : "–") + '</td><td class="r' + (v.differenz < 0 ? " cb-minus" : "") + '">' + eur(v.differenz) + "</td></tr>"))) : "";
  const dateien = (c.dateien || []).map((d) => '<li><b>' + esc(d.datei) + "</b> – " + (d.gezaehlt ? esc(d.hersteller) + ", " + zahl(d.vorgaenge) + " Vorgänge" : '<span class="klein">' + esc(d.grund) + "</span>") +
    (d.stand ? ' <span class="klein">· gespeichert ' + esc(d.stand) + "</span>" : "") + "</li>").join("");
  const einstellung = karte("Listen & Zuständigkeit", c.beispiel ? "Beispieldaten – echte Listen am Rechner einbinden" : "Ordner: " + (c.ordner_name || c.ordner),
    '<ul class="cb-dateien">' + dateien + "</ul>" +
    '<div class="cb-einstellung">' + fFeld("Zuständig (steht in „Heute & Woche“)", '<input id="cb-wer" maxlength="40" value="' + esc(c.verantwortlich || "") + '" placeholder="Name">', "260px") +
    '<div class="cb-knoepfe"><button type="button" class="mini" id="cb-wer-speichern">Speichern</button>' +
    '<button type="button" class="mini nur-programm" id="cb-ordner">' + (c.eingerichtet ? "Anderen Ordner wählen" : "Ordner wählen") + "</button>" +
    (c.eingerichtet ? '<button type="button" class="mini nur-programm" id="cb-ordner-oeffnen">Ordner öffnen</button><button type="button" class="mini nur-programm" id="cb-ordner-weg">Entfernen</button>' : "") + "</div></div>");
  const html = (c.beispiel ? banner() : "") + kopf + fehler + kacheln +
    '<div class="gitter">' + jetztKarte + "</div>" + (aktionen ? '<div class="gitter">' + aktionen + "</div>" : "") +
    '<div class="gitter">' + offen + "</div>" + '<div class="gitter">' + hersteller + "</div>" + (abw ? '<div class="gitter">' + abw + "</div>" : "") +
    '<div class="gitter">' + einstellung + "</div>";
  return { html, nach: cbVerdrahten };
} };

function cbVerdrahten() {
  const api = cpApi();
  const neuLaden = async (r) => {
    if (!r) return;
    if (r.fehler || r.ok === false) { meldung(r.fehler || "Das hat nicht geklappt.", true); return; }
    if (r.meldung) meldung(r.meldung);
    datenUebernehmen(await api.cockpit_daten(true));
    zeichne();
  };
  const klick = (id, f) => { const b = document.getElementById(id); if (b) b.addEventListener("click", f); };
  klick("cb-ordner", async () => { try { await neuLaden(await api.cashback_ordner_waehlen()); } catch (e) { meldung(String(e.message || e), true); } });
  klick("cb-ordner-weg", async () => { if (confirm("Cashback-Ordner auf diesem Rechner entfernen? Die Listen selbst bleiben unverändert.")) await neuLaden(await api.cashback_ordner_entfernen()); });
  klick("cb-ordner-oeffnen", async () => { const r = await api.cashback_oeffnen(""); if (r && r.ok === false) meldung(r.fehler || "Ließ sich nicht öffnen.", true); });
  klick("cb-wer-speichern", () => fuehrungAufruf("cashback_verantwortlich", document.getElementById("cb-wer").value));
  klick("cb-kopieren", async () => {
    const text = cbZusammenfassung(D.cashback);
    try { await navigator.clipboard.writeText(text); meldung("Kopiert – z. B. in eine Mail einfügen."); }
    catch (e) { meldung("Kopieren ging nicht.", true); }
  });
  document.querySelectorAll("[data-cb-datei]").forEach((b) => b.addEventListener("click", async () => {
    const r = await api.cashback_oeffnen(b.dataset.cbDatei);
    if (r && r.ok === false) meldung(r.fehler || "Ließ sich nicht öffnen.", true);
  }));
}

SEITEN.zinsuhr = { label: "Zinsuhr & Langsteher", render() {
  const z = D.zinsuhr;
  if (!z) return { html: banner() + '<div class="kopf"><div><h1>Zinsuhr &amp; Langsteher</h1></div></div>' + fLeer("Konnte nicht berechnet werden – Details stehen im Protokoll.") };
  const p = z.parameter;
  const fz = (e) => fzgLink(e.internal_id) + '<div class="klein">' + esc([e.brand, e.model].filter(Boolean).join(" ")) + "</div>";
  const langsteher = z.langsteher.length ? tabelle(["Fahrzeug", "~Standtage", "~Kosten/Tag", "~Listenpreis netto", "~Untergrenze", "~Rahmen", "~Vorschlag"], z.langsteher.map((e) =>
    "<tr><td>" + fz(e) + '</td><td class="r">' + zahl(e.standtage) + '</td><td class="r">' + eur(e.kosten_tag, 2) + "</td>" +
    '<td class="r">' + eur(e.list_price_net) + '</td><td class="r leise">' + eur(e.nachlass.untergrenze) + "</td>" +
    '<td class="r">' + eur(e.nachlass.rahmen) + '</td><td class="r"><b>' + eur(e.nachlass.vorschlag) + "</b>" +
      (e.nachlass.spielraum !== null && e.nachlass.spielraum < e.nachlass.rahmen ? '<div class="klein">durch Untergrenze begrenzt</div>' : "") + "</td></tr>"))
    : fLeer("Keine Langsteher – kein Fahrzeug steht länger als " + p.langsteher_tage + " Tage oder kostet schon Zinsen.");
  const teuer = tabelle(["Fahrzeug", "Status", "~Standtage", "Bank", "~Zinsen/Tag", "~Kapital/Tag", "~Gesamt/Tag", "~im Monat"], z.fahrzeuge.slice(0, 15).map((e) =>
    "<tr><td>" + fz(e) + '</td><td class="leise">' + esc(e.status) + '</td><td class="r">' + zahl(e.standtage) + '</td><td class="leise">' + esc(e.bank || "bar") + "</td>" +
    '<td class="r' + (e.zins_tag ? '" style="color:var(--kritisch)' : " leise") + '">' + (e.zins_tag ? eur(e.zins_tag, 2) : "–") + '</td><td class="r leise">' + eur(e.kapital_tag, 2) + "</td>" +
    '<td class="r"><b>' + eur(e.kosten_tag, 2) + '</b></td><td class="r">' + eur(e.kosten_monat) + "</td></tr>"));
  const einstellungen = '<form class="frist-form" id="zu-form" novalidate>' +
    fFeld("Kalkulatorischer Zins (% p. a.)", '<input id="zu-zins" inputmode="decimal" value="' + p.kalk_zins_pct + '" style="width:90px">') +
    fFeld("Langsteher ab (Tagen)", '<input type="number" id="zu-tage" value="' + p.langsteher_tage + '" style="width:90px">') +
    fFeld("Nachlass soll den Verkauf vorziehen um (Tage)", '<input type="number" id="zu-vorziehen" value="' + p.vorzieh_tage + '" style="width:90px">') +
    '<div class="feld knopf-zeile"><span>&nbsp;</span><button type="submit" class="btn-primaer">Übernehmen</button></div></form>';
  const html = banner() +
    '<div class="kopf"><div><h1>Zinsuhr &amp; Langsteher</h1><p>Was der Bestand jeden Tag kostet: echte Zinsen, sobald die Zinsfreiheit vorbei ist, und – kalkulatorisch – das gebundene Kapital. ' +
      "Daraus folgt für Langsteher ein Nachlass, der sich rechnet: Er ist kleiner als das, was das Fahrzeug in " + p.vorzieh_tage + " weiteren Tagen kosten würde, und geht nie unter die Preisuntergrenze.</p></div></div>" +
    '<div class="kacheln">' +
      kachel("Zinsen pro Tag", eur(z.zins_tag, 2), zahl(z.mit_zins) + " Fahrzeuge ohne Zinsfreiheit", z.zins_tag ? "krit" : "gut") +
      kachel("Kapitalbindung pro Tag", eur(z.kapital_tag, 2), "kalkulatorisch, " + zahl(p.kalk_zins_pct, 1) + " % p. a.") +
      kachel("Kosten pro Monat", eur(z.kosten_monat), "Zinsen plus Kapitalbindung") +
      kachel("Zinsen bisher", eur(z.zins_bisher), "seit Ende der Zinsfreiheit", z.zins_bisher ? "warn" : "") +
    "</div>" +
    '<div class="gitter">' + karte("Langsteher: Nachlass, der sich rechnet", "Rahmen = Kosten pro Tag × " + p.vorzieh_tage + " Tage · Vorschlag = Rahmen, höchstens bis zur Untergrenze (VK min aus der Bestandsliste)",
      '<div class="hinweis zu-tipp">' + HINWEIS_ICON + "<div><b>Erst als Zugabe anbieten, dann als Rabatt.</b> Zubehör im Wert des Vorschlags kostet euch nur den Einkauf, " +
        "der Kunde bekommt den vollen Wert (Hermann Simon). Und: Der Einkaufspreis ist Vergangenheit – entscheidend ist, was jeder weitere Tag kostet.</div></div>" + langsteher) + "</div>" +
    '<div class="gitter zweidrittel">' + karte("Was jeder Tag kostet", "die 15 teuersten Fahrzeuge im Bestand", teuer) +
      karte("Annahmen", "gelten für alle Rechner", einstellungen) + "</div>";
  return { html, nach() {
    document.getElementById("zu-form").addEventListener("submit", (ev) => {
      ev.preventDefault();
      fuehrungAufruf("fuehrung_einstellungen", { kalk_zins_pct: document.getElementById("zu-zins").value, langsteher_tage: document.getElementById("zu-tage").value,
        vorzieh_tage: document.getElementById("zu-vorziehen").value });
    });
  } };
} };

/* ---------- Herstellerbonus (Karte auf der Seite „Linien & Bestellungen“) ---------- */
let bonusBearbeiten = null;
function bonusKarte() {
  const liste = D.bonus || [];
  const roh = bonusBearbeiten ? (D.bonusRoh || []).find((b) => b.id === bonusBearbeiten) || {} : {};
  const marken = [...new Set(D.vehicles.map((v) => v.brand).filter(Boolean))].sort();
  const staffeln = roh.staffeln && roh.staffeln.length ? roh.staffeln : [{ ab: "", prozent: "" }, { ab: "", prozent: "" }, { ab: "", prozent: "" }];
  const anzeige = liste.length ? liste.map((b) => {
    const max = Math.max(...b.staffeln.map((s) => s.ab), b.mit_vororder) * 1.08;
    const marken = b.staffeln.map((s) => '<b class="bo-marke" style="left:' + (s.ab / max * 100) + '%" title="ab ' + s.ab + " Stück: " + zahl(s.prozent, 1) + ' %"><span>' + zahl(s.prozent, 1) + " %</span></b>").join("");
    return '<div class="bo-eintrag"><div class="bo-kopf"><b>' + esc(b.hersteller) + " " + b.jahr + "</b>" +
        '<span class="leise">' + zahl(b.anzahl) + " Fahrzeuge" + (b.vororder ? " + " + zahl(b.vororder) + " kommend" : "") + " · Bonus jetzt " + eur(b.bonus_mit_vororder) + "</span>" +
        '<span class="bo-knoepfe"><button type="button" class="mini" data-bo-bearbeiten="' + esc(b.id) + '">bearbeiten</button><button type="button" class="mini" data-bo-weg="' + esc(b.id) + '">löschen</button></span></div>' +
      '<div class="bo-balken"><i style="width:' + (b.anzahl / max * 100) + '%"></i><i class="vo" style="left:' + (b.anzahl / max * 100) + "%;width:" + (b.vororder / max * 100) + '%"></i>' + marken + "</div>" +
      '<p class="klein">' + (b.naechste ? "Noch <b>" + zahl(b.naechste.fehlen) + " Fahrzeug" + (b.naechste.fehlen === 1 ? "" : "e") + "</b> bis " + zahl(b.naechste.prozent, 1) + " % – das wären rund <b>" + eur(b.naechste.mehr_bonus) + "</b> mehr Bonus. " +
          "Lohnt nur, wenn jedes zusätzliche Fahrzeug weniger als <b>" + eur(b.naechste.mehr_bonus / b.naechste.fehlen) + "</b> an Nachlass, Zinsen und Standzeit kostet."
        : "Höchste Stufe erreicht.") + (b.notiz ? " · " + esc(b.notiz) : "") + "</p></div>";
  }).join("") : fLeer("Noch keine Bonusstaffel eingetragen.<br>Unten Hersteller, Jahr und Staffeln eingeben.");
  const formular = '<form class="frist-form" id="bo-form" novalidate>' +
    fFeld("Hersteller", '<select id="bo-hersteller">' + marken.map((m) => "<option" + (m === roh.hersteller ? " selected" : "") + ">" + esc(m) + "</option>").join("") + "</select>") +
    fFeld("Jahr (Jahresblatt)", '<input type="number" id="bo-jahr" value="' + (roh.jahr || new Date(HEUTE).getFullYear()) + '" style="width:90px">') +
    staffeln.map((s, i) => fFeld("Stufe " + (i + 1) + ": ab Stück / %", '<span style="display:flex;gap:6px"><input data-bo-ab="' + i + '" type="number" min="1" value="' + (s.ab ?? "") + '" style="width:70px"><input data-bo-pct="' + i + '" inputmode="decimal" value="' + (s.prozent ?? "") + '" style="width:60px"></span>')).join("") +
    fFeld("Notiz", '<input id="bo-notiz" maxlength="300" value="' + esc(roh.notiz || "") + '" placeholder="z. B. Händlervertrag 2027">', "260px") +
    '<div class="feld knopf-zeile"><span>&nbsp;</span><div style="display:flex;gap:8px"><button type="submit" class="btn-primaer">' + (bonusBearbeiten ? "Speichern" : "Staffel eintragen") + "</button>" +
      (bonusBearbeiten ? '<button type="button" class="mini" id="bo-abbrechen">Abbrechen</button>' : "") + "</div></div></form>";
  return '<div class="gitter">' + karte("Herstellerbonus",
    "Gezählt werden die Fahrzeuge im Jahresblatt der Bestandsliste plus die kommenden Fahrzeuge aus der Finanzaufstellung mit Termin im Jahr. Bonus = Prozent auf den Einkauf netto. " +
      "Vorsicht vor der „fast erreichten“ Stufe: Bonusjagd erzeugt Langsteher (Beirat: Munger, Prusseit).",
    anzeige + '<div class="bo-form-huelle">' + formular + "</div>") + "</div>";
}
function bonusVerdrahten() {
  const form = document.getElementById("bo-form");
  if (!form) return;
  form.addEventListener("submit", (ev) => {
    ev.preventDefault();
    const staffeln = [...form.querySelectorAll("[data-bo-ab]")].map((el) => ({ ab: el.value, prozent: form.querySelector('[data-bo-pct="' + el.dataset.boAb + '"]').value }))
      .filter((s) => String(s.ab).trim() !== "");
    const eingabe = { id: bonusBearbeiten || undefined, hersteller: document.getElementById("bo-hersteller").value, jahr: document.getElementById("bo-jahr").value,
      staffeln, notiz: document.getElementById("bo-notiz").value };
    bonusBearbeiten = null;
    fuehrungAufruf("bonus_speichern", eingabe);
  });
  const ab = document.getElementById("bo-abbrechen");
  if (ab) ab.addEventListener("click", () => { bonusBearbeiten = null; zeichne(); });
  document.querySelectorAll("[data-bo-bearbeiten]").forEach((b) => b.addEventListener("click", () => { bonusBearbeiten = Number(b.dataset.boBearbeiten); zeichne(); }));
  document.querySelectorAll("[data-bo-weg]").forEach((b) => b.addEventListener("click", () => { if (confirm("Diese Bonusstaffel löschen?")) fuehrungAufruf("bonus_loeschen", Number(b.dataset.boWeg)); }));
}

/* ------------------------------------------------- Handy & Tablet: ODIN im Browser freigeben
   Startet im Programm einen kleinen Web-Server; Handys und Tablets im selben Netz öffnen ODIN dann im Browser
   (Adresse oder QR-Code, dazu die sechsstellige Nummer). Endet, wenn ODIN geschlossen wird. */
const WEB = { status: null, laedt: false };
async function webStatusLaden(aktion) {
  WEB.laedt = true;
  try { WEB.status = (await cpApi()[aktion || "web_status"]()) || { laeuft: false, fehler: "Keine Antwort – bitte nochmal versuchen." }; } catch (e) { WEB.status = { laeuft: false, fehler: String(e.message || e) }; }
  WEB.laedt = false;
  if (seiteAusHash().name === "web") zeichne();
}
SEITEN.web = { label: "Handy & Tablet", render() {
  if (window.pywebview && window.pywebview.web) {
    return { html: '<div class="kopf"><div><h1>Handy &amp; Tablet</h1><p>Du nutzt ODIN gerade im Browser. Freigeben und beenden geht am Rechner, auf dem ODIN läuft.</p></div></div>' };
  }
  if (!WEB.status && !WEB.laedt) webStatusLaden();
  const st = WEB.status || {};
  const schritte = '<ol class="web-schritte">' +
    "<li>Handy oder Tablet ins Firmen-WLAN (dasselbe Netz wie dieser Rechner).</li>" +
    "<li>QR-Code scannen – oder die Adresse im Browser öffnen und die Nummer eingeben.</li>" +
    "<li>Unter „Alle Projekte“ einmal den eigenen Namen wählen – jedes Gerät merkt sich das selbst.</li>" +
    "<li>Fragt Windows beim ersten Mal nach der Firewall: „Zugriff zulassen“ für private Netzwerke.</li></ol>";
  const inhalt = st.laeuft
    ? '<div class="web-freigabe">' + (st.qr ? '<div class="web-qr">' + st.qr + "</div>" : "") +
        '<div><div class="klein">Adresse im Firmennetz</div>' + (st.adressen || []).map((a) => '<div class="web-adresse">' + esc(a) + "</div>").join("") +
        '<div class="klein" style="margin-top:12px">Nummer</div><div class="web-code">' + esc(st.code) + "</div>" +
        '<div class="klein">' + zahl(st.geraete || 0) + " Gerät(e) angemeldet · gilt, bis ODIN geschlossen wird</div>" + schritte +
        '<div style="display:flex;gap:8px;margin-top:14px;flex-wrap:wrap"><button type="button" class="btn" id="web-aus">Freigabe beenden</button>' +
        '<button type="button" class="btn" id="web-neu">Aktualisieren</button></div></div></div>'
    : '<div style="padding:18px"><p class="klein" style="margin:0 0 12px">' + (st.fehler ? '<b style="color:var(--kritisch)">' + esc(st.fehler) + "</b><br>" : "") +
        "Noch nicht freigegeben. Mit einem Klick ist ODIN für Handys und Tablets im Firmennetz erreichbar – mit denselben Daten wie hier.</p>" +
        '<button type="button" class="btn-primaer" id="web-an">Jetzt freigeben</button>' + schritte + "</div>";
  const html = '<div class="kopf"><div><h1>Handy &amp; Tablet</h1><p>ODIN im Browser – eine Vorstufe der Web-App. Läuft über diesen Rechner und nur im Firmennetz. ' +
      "Dateien auswählen, öffnen oder Zugänge einrichten geht weiter nur hier am Rechner.</p></div></div>" +
    '<div class="gitter">' + karte(st.laeuft ? "Freigegeben" : "ODIN im Browser", st.laeuft ? "Zum Ausprobieren: Handy scannen lassen" : "", inhalt) + "</div>" +
    '<div class="hinweis">' + HINWEIS_ICON + "<div><b>Nur im Firmennetz nutzen.</b> Die Freigabe nicht am Router ins Internet weiterleiten – für unterwegs kommt die richtige Web-App mit Anmeldung.</div></div>";
  return { html, nach() {
    const an = document.getElementById("web-an"), aus = document.getElementById("web-aus"), neu = document.getElementById("web-neu");
    if (an) an.addEventListener("click", () => webStatusLaden("web_freigeben"));
    if (aus) aus.addEventListener("click", () => webStatusLaden("web_beenden"));
    if (neu) neu.addEventListener("click", () => webStatusLaden());
  } };
} };

/* ------------------------------------------------- Konto & Anmeldung (Microsoft)
   Anmelden mit dem eigenen Microsoft-Konto: ODIN weiß dann, wer am Rechner sitzt (Person mit derselben E-Mail), und
   schickt auf Wunsch jeden Morgen eine Erinnerung ins eigene Postfach. Erreichbar über „Datenquellen“ und den
   Wegweiser – die Seitenleiste bleibt, wie sie ist. Nur im Programm; die Logik steht in tirge_helfer/konto.py. */
const KONTO = { st: null, laedt: false, fehler: "", timer: 0 };
const kontoImBrowser = () => !!(window.pywebview && (window.pywebview.web || window.pywebview.vorschau));   // auch die Vorschau: dort gibt es kein Konto
async function kontoAufruf(aktion, ...args) {
  const r = await cpApi().konto_aufruf(aktion, args);
  if (!r || !r.ok) throw new Error((r && r.fehler) || "Das hat nicht geklappt.");
  return r.daten;
}
/* Status holen (ohne Aktion) oder eine Aktion ausführen. Neu gezeichnet wird nur, wenn sich etwas geändert hat –
   sonst gingen Eingaben verloren (beim Nachsehen während der Anmeldung oder nach einer Fehlermeldung). */
async function kontoLaden(aktion, args, knopf) {
  if (kontoImBrowser()) return;
  const vorher = JSON.stringify(KONTO.st);
  const text = knopf ? knopf.textContent : "";
  if (knopf) { knopf.disabled = true; knopf.textContent = "Einen Moment …"; }
  KONTO.laedt = true;
  let ok = true;
  try {
    const d = await kontoAufruf(aktion || "status", ...(args || []));
    if (d && typeof d === "object" && "angemeldet" in d) KONTO.st = d;
    if (d && d.meldung) meldung(d.meldung);
    KONTO.fehler = "";
  } catch (e) {
    ok = false;
    if (aktion) meldung(String(e.message || e), true); else KONTO.fehler = String(e.message || e);
  }
  KONTO.laedt = false;
  if (knopf && knopf.isConnected) { knopf.disabled = false; knopf.textContent = text; }
  const seite = seiteAusHash().name;
  if ((seite === "konto" || seite === "excel") && ((aktion && ok) || JSON.stringify(KONTO.st) !== vorher || (!aktion && !ok))) zeichne();
  clearTimeout(KONTO.timer);
  KONTO.timer = 0;
  if (KONTO.st && KONTO.st.vorgang.laeuft && seite === "konto") KONTO.timer = setTimeout(() => { KONTO.timer = 0; kontoLaden(); }, 1500);
}
const kontoZeit = (iso) => iso ? datum(iso.slice(0, 10)) + ", " + iso.slice(11, 16) + " Uhr" : "";
const kontoAvatar = (p) => '<span class="ko-avatar" style="--farbe:' + window.odinFarbeOk(p.farbe || "#5B7083") + '" aria-hidden="true">' + esc(p.kuerzel || (p.name || "?").slice(0, 2).toUpperCase()) + "</span>";
const kontoKnopf = (ko, text, art, aus) => '<button type="button" class="btn' + (art === "primaer" ? " btn-primaer" : "") + '" data-ko="' + ko + '"' +
  (aus ? " disabled" : "") + ">" + text + "</button>";

function kontoAnmeldung(st) {
  const v = st.vorgang || {};
  const zeilen = [];
  if (!st.verfuegbar) zeilen.push("<p>In dieser ODIN-Version fehlt die Microsoft-Anmeldung. Bitte die aktuelle Version installieren.</p>");
  else if (!st.eingerichtet) zeilen.push("<p>Noch nicht eingerichtet: Unten unter „Einrichtung“ einmal Client-ID und Tenant-ID eintragen – das gilt dann für alle Rechner.</p>");
  else if (v.laeuft && v.art === "code") {
    zeilen.push(v.code
      ? '<ol class="ko-schritte"><li>Öffne <b class="ko-adresse">' + esc(v.code.adresse.replace(/^https:\/\//, "")) + "</b> im Browser.</li>" +
        '<li>Gib diesen Code ein:<div class="ko-code mono">' + esc(v.code.code) + "</div></li><li>Melde dich mit deinem Firmenkonto an – danach geht es hier von selbst weiter.</li></ol>" +
        (v.code.bis ? '<p class="klein">Der Code gilt bis ' + esc(new Date(v.code.bis * 1000).toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit" })) + " Uhr.</p>" : "")
      : '<p class="ko-warte">Code wird bei Microsoft angefordert …</p>');
    zeilen.push('<div class="quelle-knoepfe">' + (v.code ? kontoKnopf("seite", "Seite öffnen", "primaer") + kontoKnopf("kopieren", "Code kopieren") : "") + kontoKnopf("abbrechen", "Abbrechen") + "</div>");
  } else if (v.laeuft) {
    zeilen.push('<p class="ko-warte">Dein Browser öffnet die Anmeldung bei Microsoft. Melde dich dort mit deinem Firmenkonto an und komm dann hierher zurück.</p>' +
      '<p class="klein">Kein Browserfenster aufgegangen? Dann geht es auch mit einem Code.</p>' +
      '<div class="quelle-knoepfe">' + kontoKnopf("code", "Mit Code anmelden") + kontoKnopf("abbrechen", "Abbrechen") + "</div>");
  } else if (st.angemeldet) {
    zeilen.push('<div class="ko-wer"><b>' + esc(st.name) + '</b><span class="ko-mail">' + esc(st.email) + "</span>" +
      (st.angemeldet_am ? '<span class="klein">angemeldet seit ' + esc(kontoZeit(st.angemeldet_am)) + "</span>" : "") + "</div>");
    if (st.einrichtung_geaendert) zeilen.push('<div class="quelle-fehler">Die Einrichtung hat sich geändert – bitte ab- und neu anmelden.</div>');
    if (st.speicher && st.speicher.hinweis) zeilen.push('<div class="' + (st.speicher.warnung ? "quelle-fehler" : "hinweis") + '">' + esc(st.speicher.hinweis) + "</div>");
    zeilen.push('<div class="quelle-knoepfe">' + kontoKnopf("abmelden", "Abmelden") + "</div>");
  } else {
    zeilen.push("<p>Nicht angemeldet. Angemeldet wird im Browser mit deinem Firmenkonto – ein Kennwort speichert ODIN nicht, nur die Anmeldung selbst (verschlüsselt, nur für dein Benutzerkonto auf diesem Rechner; ohne sicheren Speicher nur bis zum Schließen).</p>" +
      '<div class="quelle-knoepfe">' + kontoKnopf("anmelden", "Mit Microsoft anmelden", "primaer") + kontoKnopf("code", "Mit Code anmelden") + "</div>");
  }
  if (v.fehler) zeilen.push('<div class="quelle-fehler">' + esc(v.fehler) + "</div>");
  else if (v.meldung && !v.laeuft) zeilen.push('<p class="klein">' + esc(v.meldung) + "</p>");
  return karte("Microsoft-Konto", st.angemeldet ? "angemeldet" : v.laeuft ? "Anmeldung läuft" : "nicht angemeldet", '<div class="ko-inhalt">' + zeilen.join("") + "</div>");
}

function kontoPerson(st) {
  const auswahl = (leer) => '<select id="ko-person"><option value="">' + esc(leer) + "</option>" + (st.personen || []).filter((p) => !st.person || p.id !== st.person.id).map((p) =>
    '<option value="' + esc(p.id) + '">' + esc(p.name) + (p.email ? " (" + esc(p.email) + ")" : "") + "</option>").join("") + "</select>";
  // Hat die gewählte Person eine PIN, braucht das Verknüpfen ihre PIN (sonst wäre Microsoft ein Weg an der PIN vorbei)
  const kontoPin = fFeld("PIN der Person", '<input type="password" id="ko-pin" inputmode="numeric" pattern="[0-9]*" maxlength="8" autocomplete="off" placeholder="falls festgelegt">', "150px");
  const zeilen = [];
  if (!st.angemeldet) {
    zeilen.push("<p>Ohne Microsoft meldest du dich im Anmeldebildschirm mit deiner Person und deiner PIN an. Ist dein Microsoft-Konto mit deiner Person verknüpft, ersetzt es die PIN.</p>" +
      '<p class="klein">' + (st.ich ? "Gerade gewählt: <b>" + esc(st.ich) + "</b>" : "Noch niemand gewählt.") + "</p>");
  } else if (st.person) {
    zeilen.push('<div class="ko-person">' + kontoAvatar(st.person) + "<div><b>" + esc(st.person.name) + '</b><span class="klein">Projekte, Urlaub, Tagesfragen und Besprechungen gelten für diese Person.</span></div></div>');
    if ((st.personen || []).length > 1) zeilen.push('<details class="ko-mehr"><summary>Andere Person wählen</summary><div class="ko-zeile">' + fFeld("Person in ODIN", auswahl("Bitte wählen …")) +
      kontoPin + kontoKnopf("verknuepfen", "Verknüpfen") + "</div></details>");
  } else {
    zeilen.push("<p>Zu " + esc(st.email) + " gibt es noch keine Person in ODIN. Wähle dich aus der Liste – oder leg dich neu an.</p>");
    if ((st.personen || []).length) zeilen.push('<div class="ko-zeile">' + fFeld("Person in ODIN", auswahl("Bitte wählen …")) + kontoPin + kontoKnopf("verknuepfen", "Verknüpfen", "primaer") + "</div>");
    zeilen.push('<div class="quelle-knoepfe">' + kontoKnopf("neu", "Neu anlegen als „" + esc(st.name) + "“", (st.personen || []).length ? "" : "primaer") + "</div>");
  }
  if (st.personen_fehler) zeilen.push('<div class="quelle-fehler">' + esc(st.personen_fehler) + "</div>");
  return karte("Du in ODIN", st.angemeldet ? (st.person ? "verknüpft über die E-Mail-Adresse" : "noch nicht verknüpft") : "Auswahl von Hand", '<div class="ko-inhalt">' + zeilen.join("") + "</div>");
}

function kontoErinnerung(st) {
  const e = st.erinnerung || {};
  return karte("Tägliche Erinnerung", e.an ? "an, ab " + e.uhrzeit + " Uhr" : "aus",
    '<div class="ko-inhalt">' +
    '<div class="ko-zeile"><label class="ko-schalter"><input type="checkbox" id="ko-an"' + (e.an ? " checked" : "") + "> Jeden Tag eine Mail an mich</label>" +
      fFeld("Uhrzeit", '<input type="time" id="ko-uhrzeit" value="' + esc(e.uhrzeit || "07:30") + '" step="300">', "130px") + kontoKnopf("erinnerung", "Speichern") + "</div>" +
    "<p>Die Mail kommt nur an Tagen, an denen etwas ansteht – höchstens einmal am Tag, über dein eigenes Postfach und nur an dich:</p>" +
    '<ul class="ko-liste"><li>Cashback, wenn du dort als zuständig eingetragen bist</li><li>Fristen im Betrieb, bei denen du verantwortlich bist</li>' +
    "<li>deine Projektaufgaben, die heute fällig oder überfällig sind</li></ul>" +
    '<p class="klein">Läuft ODIN zur Uhrzeit nicht, kommt die Mail kurz nach dem Start.</p>' +
    (e.fehler ? '<div class="quelle-fehler">' + esc(e.fehler) + "</div>" : e.meldung ? '<p class="klein">' + esc(e.meldung) + "</p>"
      : e.gesendet_am ? '<p class="klein">Zuletzt gesendet am ' + esc(datum(e.gesendet_am)) + ".</p>" : "") +
    '<div class="quelle-knoepfe">' + kontoKnopf("test", "Test-Mail an mich senden", "", !st.angemeldet) + "</div>" +
    (st.angemeldet ? "" : '<p class="klein">Zum Senden erst mit Microsoft anmelden.</p>') + "</div>");
}

function kontoEinrichtung(st) {
  const k = st.einrichtung || {};
  const muster = "00000000-0000-0000-0000-000000000000";
  return karte("Einrichtung", k.quelle === "alle" ? "gilt für alle Rechner" : k.quelle === "rechner" ? "gilt nur für diesen Rechner" : "einmal für alle Rechner",
    '<div class="ko-inhalt">' +
    '<p>Client-ID und Tenant-ID stammen aus der <span class="ko-nw">App-Registrierung</span> in Microsoft Entra (Übersicht: <span class="ko-nw">„Anwendungs-ID (Client)“</span> und <span class="ko-nw">„Verzeichnis-ID (Mandant)“</span>). ' +
    "Beides ist kein Geheimnis – ein Kennwort der App braucht ODIN nicht. Gespeichert wird im Ordner „Fahrzeuge“, so gilt es auf jedem Rechner.</p>" +
    '<div class="ko-felder">' + fFeld("Client-ID", '<input type="text" id="ko-client" class="mono" spellcheck="false" autocomplete="off" value="' + esc(k.client_id || "") + '" placeholder="' + muster + '">') +
      fFeld("Tenant-ID", '<input type="text" id="ko-tenant" class="mono" spellcheck="false" autocomplete="off" value="' + esc(k.tenant_id || "") + '" placeholder="' + muster + '">') + "</div>" +
    '<div class="quelle-knoepfe">' + kontoKnopf("einrichten", "Speichern") + "</div>" +
    '<details class="ko-mehr"><summary>So legst du die App-Registrierung an</summary><ol class="ko-schritte">' +
      "<li>entra.microsoft.com → Identität → Anwendungen → App-Registrierungen → „Neue Registrierung“, Name „ODIN“, nur Konten in diesem Organisationsverzeichnis.</li>" +
      '<li>Umleitungs-URI: Plattform „Öffentlicher Client/nativ (mobil und Desktop)“ mit <span class="mono">http://localhost</span>.</li>' +
      "<li>API-Berechtigungen → Microsoft Graph → Delegiert: <b>User.Read</b> und <b>Mail.Send</b>, dann „Administratorzustimmung erteilen“.</li>" +
      "<li>Authentifizierung → „Öffentliche Clientflows zulassen“ auf „Ja“ (für die Anmeldung mit Code).</li>" +
      "<li>Kein Geheimnis und kein Zertifikat anlegen. Aus der Übersicht die beiden IDs hier eintragen.</li></ol></details></div>");
}

SEITEN.konto = { label: "Konto & Anmeldung", render() {
  const kopf = '<div class="kopf"><div><h1>Konto &amp; Anmeldung</h1><p>Mit deinem Microsoft-Konto weiß ODIN, wer am Rechner sitzt – und schickt dir auf Wunsch jeden Morgen eine Erinnerung ins eigene Postfach.</p></div>' +
    '<div class="kopf-aktionen"><a class="btn" href="#/excel">Zu den Datenquellen</a></div></div>';
  if (kontoImBrowser()) return { html: kopf + '<div class="hinweis">' + HINWEIS_ICON + "<div><b>Nur am Rechner.</b> Du nutzt ODIN gerade im Browser. Anmelden und die Erinnerungsmail einrichten geht am Rechner, auf dem ODIN läuft.</div></div>" };
  if (!KONTO.st && !KONTO.laedt && !KONTO.fehler) kontoLaden();
  if (!KONTO.st) return { html: kopf + (KONTO.fehler
    ? '<div class="gitter">' + karte("Konto", "", '<div class="ko-inhalt"><div class="quelle-fehler">' + esc(KONTO.fehler) + '</div><div class="quelle-knoepfe"><button type="button" class="btn" data-ko="neu-laden">Nochmal versuchen</button></div></div>') + "</div>"
    : '<div class="laden" aria-label="Wird geladen"><i class="skelett" style="width:40%"></i><i class="skelett"></i></div>'), nach: kontoVerdrahten };
  const st = KONTO.st;
  if (st.vorgang && st.vorgang.laeuft && !KONTO.timer && !KONTO.laedt) KONTO.timer = setTimeout(() => { KONTO.timer = 0; kontoLaden(); }, 1500);
  const html = kopf + '<div class="gitter halb">' + kontoAnmeldung(st) + kontoPerson(st) + "</div>" +
    '<div class="gitter halb">' + kontoErinnerung(st) + kontoEinrichtung(st) + "</div>";
  return { html, nach: kontoVerdrahten };
} };

function kontoVerdrahten() {
  document.querySelectorAll("#inhalt [data-ko]").forEach((b) => b.addEventListener("click", async () => {
    const wert = (id) => (document.getElementById(id) || {}).value || "";
    const los = (aktion, ...args) => kontoLaden(aktion, args, b);
    switch (b.dataset.ko) {
      case "neu-laden": KONTO.fehler = ""; los(); break;
      case "anmelden": los("anmelden"); break;
      case "code": los("anmelden_mit_code"); break;
      case "abbrechen": los("anmeldung_abbrechen"); break;
      case "abmelden": if (confirm("Abmelden? Die gespeicherte Anmeldung wird auf diesem Rechner gelöscht.")) los("abmelden"); break;
      case "seite": try { await kontoAufruf("code_seite_oeffnen"); } catch (e) { meldung(String(e.message || e), true); } break;
      case "kopieren": {
        const code = KONTO.st && KONTO.st.vorgang.code ? KONTO.st.vorgang.code.code : "";
        try { await navigator.clipboard.writeText(code); meldung("Code kopiert."); } catch (e) { meldung("Kopieren ging nicht – bitte abtippen.", true); }
        break;
      }
      case "verknuepfen": if (!wert("ko-person")) { meldung("Bitte zuerst eine Person wählen.", true); break; } los("person_verknuepfen", wert("ko-person"), wert("ko-pin")); break;
      case "neu": los("person_anlegen"); break;
      case "erinnerung": los("erinnerung_speichern", !!(document.getElementById("ko-an") || {}).checked, wert("ko-uhrzeit")); break;
      case "test": los("test_mail"); break;
      case "einrichten": los("app_speichern", wert("ko-client").trim(), wert("ko-tenant").trim()); break;
    }
  }));
}
// Beim Verlassen der Seite nicht weiter nachsehen
addEventListener("hashchange", () => { if (seiteAusHash().name !== "konto") { clearTimeout(KONTO.timer); KONTO.timer = 0; } });

/* ------------------------------------------------- Handy: Menü als Schublade */
(() => {
  const knopf = document.querySelector(".mobil-menue");
  if (!knopf) return;
  const zu = () => { document.body.classList.remove("menue-offen"); knopf.setAttribute("aria-expanded", "false"); };
  knopf.addEventListener("click", () => {
    const offen = document.body.classList.toggle("menue-offen");
    knopf.setAttribute("aria-expanded", String(offen));
    if (offen && typeof leisteEinpassen === "function") requestAnimationFrame(() => leisteEinpassen());
  });
  const schleier = document.querySelector(".mobil-schleier");
  if (schleier) schleier.addEventListener("click", zu);
  addEventListener("hashchange", zu);
  addEventListener("keydown", (e) => { if (e.key === "Escape") zu(); });
})();

/* ------------------------------------------------- anpassbares Dashboard
   Wie auf dem iPhone: „Anpassen“ schaltet in den Bearbeiten-Modus, die Kacheln wackeln leicht, man zieht sie mit
   der Maus an die gewünschte Stelle und die anderen weichen aus (FLIP: alte Lage merken, umsortieren, mit
   transform von der alten zur neuen Lage gleiten). Kennzahlen und Karten sind zwei Bereiche, weil sie verschieden
   groß sind; Karten lassen sich zusätzlich schmal/breit/ganz breit stellen. Gespeichert wird je Rechner über ODIN. */
const DASH_SCHLUESSEL = "dashboard";
let dashBearbeiten = false;
let dashCfg = null;
let dashGeladen = false;
const WENIG_BEWEGUNG = matchMedia("(prefers-reduced-motion: reduce)");
const DASH_KURVE = "cubic-bezier(0.23, 1, 0.32, 1)";
const GROESSEN = ["halb", "breit", "voll"];
const GROESSE_TEXT = { halb: "schmal", breit: "breit", voll: "ganze Breite" };
const MINUS = '<svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round"><path d="M6 12h12"/></svg>';
const GROESSE_ICON = '<svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 4h6v6M10 20H4v-6M20 4l-7 7M4 20l7-7"/></svg>';

async function dashLaden() {
  if (dashGeladen) return;
  dashGeladen = true;
  try { const c = await cpApi().oberflaeche(DASH_SCHLUESSEL); if (c && typeof c === "object") dashCfg = c; } catch (e) { /* Standard */ }
}
function dashSichern() {
  try { cpApi().oberflaeche(DASH_SCHLUESSEL, dashCfg).catch(() => {}); } catch (e) { /* nur für diese Sitzung */ }
}

/** Baut die Übersicht aus Blöcken: Kennzahlen oben, Karten darunter – Reihenfolge, Größe, Auswahl wie gespeichert. */
function dashRaster(bloecke) {
  const kpis = bloecke.filter((b) => b.breite === "klein").map((b) => b.id);
  const karten = bloecke.filter((b) => b.breite !== "klein").map((b) => b.id);
  if (!dashCfg || !Array.isArray(dashCfg.kennzahlen)) {                // ältere Ablage: eine gemeinsame Reihenfolge
    const alt = dashCfg && Array.isArray(dashCfg.reihenfolge) ? dashCfg.reihenfolge : [];
    dashCfg = { kennzahlen: alt.filter((id) => kpis.includes(id)), karten: alt.filter((id) => karten.includes(id)),
      versteckt: (dashCfg && dashCfg.versteckt) || [], groessen: {} };
  }
  const ergaenzt = (liste, alle) => [...liste.filter((id) => alle.includes(id)), ...alle.filter((id) => !liste.includes(id))];
  dashCfg.kennzahlen = ergaenzt(dashCfg.kennzahlen, kpis);
  dashCfg.karten = ergaenzt(dashCfg.karten, karten);
  dashCfg.versteckt = (dashCfg.versteckt || []).filter((id) => kpis.includes(id) || karten.includes(id));
  dashCfg.groessen = dashCfg.groessen || {};

  const nach = (id) => bloecke.find((b) => b.id === id);
  const sichtbar = (id) => !dashCfg.versteckt.includes(id);
  const groesse = (b) => GROESSEN.includes(dashCfg.groessen[b.id]) ? dashCfg.groessen[b.id] : b.breite;
  const kachelHtml = (b, kpi, i) => '<div class="dash-k' + (kpi ? "" : " b-" + groesse(b)) + '" data-block="' + esc(b.id) + '"' +
    (dashBearbeiten ? ' tabindex="0" style="--w:' + ((i * 37) % 5) + '" aria-label="' + esc(b.titel) + ': ziehen oder mit den Pfeiltasten verschieben"' : "") + ">" +
    (dashBearbeiten ? '<button type="button" class="dash-weg" data-dash-weg="' + esc(b.id) + '" title="Ausblenden" aria-label="' + esc(b.titel) + ' ausblenden">' + MINUS + "</button>" +
      (kpi ? "" : '<button type="button" class="dash-groesse" data-dash-groesse="' + esc(b.id) + '" title="Größe: ' + GROESSE_TEXT[groesse(b)] + ' – klicken zum Ändern" aria-label="Größe ändern">' + GROESSE_ICON + "</button>") : "") +
    b.html + "</div>";

  const versteckt = dashCfg.versteckt.map(nach).filter(Boolean);
  const leiste = dashBearbeiten
    ? '<div class="dash-leiste bearbeiten"><span class="dash-tipp">Kacheln an die gewünschte Stelle ziehen · <b>−</b> blendet aus · <b>⤢</b> ändert die Größe</span>' +
      '<button type="button" class="btn" id="dash-zurueck">Zurücksetzen</button><button type="button" class="btn btn-primaer" id="dash-fertig">Fertig</button></div>' +
      (versteckt.length ? '<div class="dash-ablage"><span>Ausgeblendet:</span>' + versteckt.map((b) =>
        '<button type="button" data-dash-dazu="' + esc(b.id) + '">+ ' + esc(b.titel.replace(/^Kennzahl: /, "")) + "</button>").join("") + "</div>" : "")
    : '<div class="dash-leiste"><button type="button" class="btn" id="dash-auf">Anpassen' +
      (versteckt.length ? ' <span class="leise">· ' + versteckt.length + " ausgeblendet</span>" : "") + "</button></div>";

  const k = dashCfg.kennzahlen.filter(sichtbar).map(nach).filter(Boolean);
  const c = dashCfg.karten.filter(sichtbar).map(nach).filter(Boolean);
  const kl = dashBearbeiten ? " bearbeiten" : "";
  return leiste +
    (k.length ? '<div class="dash-kpis' + kl + '" data-zone="kennzahlen">' + k.map((b, i) => kachelHtml(b, true, i)).join("") + "</div>" : "") +
    (c.length ? '<div class="dash' + kl + '" data-zone="karten">' + c.map((b, i) => kachelHtml(b, false, i + 3)).join("") + "</div>" : "") +
    (!k.length && !c.length ? '<div class="karte karte-leer">Alle Kacheln ausgeblendet – über „Anpassen“ wieder einblenden.</div>' : "");
}

/* Lage aller anderen Kacheln merken, umsortieren, dann von der alten zur neuen Lage gleiten (unterbrechbar:
   eine Kachel mitten in der Bewegung startet von dort, wo sie gerade ist). */
function dashFlip(zone, aendern, ausser) {
  const andere = [...zone.children].filter((x) => x !== ausser);
  const vorher = new Map(andere.map((x) => [x, x.getBoundingClientRect()]));
  aendern();
  if (WENIG_BEWEGUNG.matches) return;
  andere.forEach((x) => { x.style.transition = "none"; x.style.transform = ""; });
  andere.forEach((x) => {
    const a = vorher.get(x), b = x.getBoundingClientRect();
    const dx = a.left - b.left, dy = a.top - b.top;
    if (Math.abs(dx) > 0.5 || Math.abs(dy) > 0.5) x.style.transform = "translate(" + dx + "px," + dy + "px)";
  });
  requestAnimationFrame(() => andere.forEach((x) => {
    if (!x.style.transform) { x.style.transition = ""; return; }
    x.style.transition = "transform 260ms " + DASH_KURVE;
    x.style.transform = "";
  }));
}

function dashReihenfolgeMerken(zone) {
  const art = zone.dataset.zone;
  const ids = [...zone.children].map((x) => x.dataset.block);
  dashCfg[art] = [...ids, ...dashCfg[art].filter((id) => !ids.includes(id))];   // Ausgeblendete behalten ihren Platz am Ende
  dashSichern();
}

function dashZiehen(zone) {
  zone.addEventListener("pointerdown", (ev) => {
    const el = ev.target.closest(".dash-k");
    if (!dashBearbeiten || ev.button !== 0 || !el || el.parentElement !== zone || ev.target.closest("button")) return;
    ev.preventDefault();
    const inhalt = document.getElementById("inhalt");
    const start = { x: ev.clientX, y: ev.clientY };
    let gestartet = false, sperre = 0, lage0 = null, scroll0 = 0, zuletzt = null, schleife = 0;
    const lage = () => ({ x: el.offsetLeft, y: el.offsetTop });
    const folgen = (e) => {
      const l = lage();
      el.style.transform = "translate(" + (e.clientX - start.x + lage0.x - l.x) + "px," +
        (e.clientY - start.y + lage0.y - l.y + inhalt.scrollTop - scroll0) + "px) scale(1.03)";
    };
    // Am oberen/unteren Rand scrollt die Seite mit – schneller, je näher am Rand
    const randScrollen = () => {
      if (!zuletzt) return;
      const r = inhalt.getBoundingClientRect(), rand = 80;
      const tempo = zuletzt.clientY > r.bottom - rand ? (zuletzt.clientY - (r.bottom - rand)) / 4
        : zuletzt.clientY < r.top + rand ? -((r.top + rand) - zuletzt.clientY) / 4 : 0;
      if (tempo) { inhalt.scrollTop += tempo; folgen(zuletzt); umsortieren(zuletzt); }
      schleife = requestAnimationFrame(randScrollen);
    };
    const bewegen = (e) => {
      zuletzt = e;
      if (!gestartet) {
        if (Math.hypot(e.clientX - start.x, e.clientY - start.y) < 4) return;    // ein Klick ist noch kein Ziehen
        gestartet = true;
        lage0 = lage();
        scroll0 = inhalt.scrollTop;
        el.classList.add("zieht");
        zone.classList.add("beim-ziehen");
        schleife = requestAnimationFrame(randScrollen);
      }
      folgen(e);
      umsortieren(e);
    };
    // Wohin? Über einer Kachel: davor oder dahinter. In einer Lücke (z. B. neben einer schmalen Karte, wo die
    // gezogene hinpasst): neben die nächstgelegene Kachel derselben Zeile. Unter allem: ans Ende.
    const zielFinden = (e) => {
      const drauf = document.elementsFromPoint(e.clientX, e.clientY)
        .map((x) => x.closest && x.closest(".dash-k")).find((x) => x && x !== el && x.parentElement === zone);
      if (drauf) {
        const r = drauf.getBoundingClientRect();
        const ganzeZeile = r.width > zone.clientWidth * 0.8;
        return { ziel: drauf, dahinter: ganzeZeile ? e.clientY > r.top + r.height / 2 : e.clientX > r.left + r.width / 2 };
      }
      const andere = [...zone.children].filter((x) => x !== el && x.classList.contains("dash-k"));
      if (!andere.length) return null;
      const zone_r = zone.getBoundingClientRect();
      if (e.clientX < zone_r.left - 40 || e.clientX > zone_r.right + 40) return null;
      const inZeile = andere.filter((x) => { const r = x.getBoundingClientRect(); return e.clientY >= r.top - 8 && e.clientY <= r.bottom + 8; });
      if (inZeile.length) {
        const abstand = (x) => { const r = x.getBoundingClientRect(); return e.clientX < r.left ? r.left - e.clientX : e.clientX > r.right ? e.clientX - r.right : 0; };
        const naechste = inZeile.reduce((a, b) => (abstand(b) < abstand(a) ? b : a));
        const r = naechste.getBoundingClientRect();
        return { ziel: naechste, dahinter: e.clientX > r.left + r.width / 2 };
      }
      const letzte = andere[andere.length - 1];
      if (e.clientY > letzte.getBoundingClientRect().bottom) return { ziel: letzte, dahinter: true };
      return null;
    };
    const umsortieren = (e) => {
      if (performance.now() < sperre) return;
      const fund = zielFinden(e);
      if (!fund) return;
      const vor = fund.dahinter ? fund.ziel.nextElementSibling : fund.ziel;
      if (vor === el || vor === el.nextElementSibling) return;
      dashFlip(zone, () => zone.insertBefore(el, vor), el);
      folgen(e);
      sperre = performance.now() + 140;                 // Ausweichen erst ausspielen lassen, sonst flattert es
    };
    const ende = () => {
      cancelAnimationFrame(schleife);
      removeEventListener("pointermove", bewegen);
      removeEventListener("pointerup", ende);
      removeEventListener("pointercancel", ende);
      if (!gestartet) return;
      el.classList.remove("zieht");
      zone.classList.remove("beim-ziehen");
      el.style.transition = WENIG_BEWEGUNG.matches ? "none" : "transform 220ms " + DASH_KURVE;
      el.style.transform = "";
      el.addEventListener("transitionend", () => { el.style.transition = ""; }, { once: true });
      dashReihenfolgeMerken(zone);
    };
    addEventListener("pointermove", bewegen);
    addEventListener("pointerup", ende);
    addEventListener("pointercancel", ende);
  });
  // Tastatur: Pfeiltasten verschieben ohne Animation (bei Tastenbedienung bremst Bewegung nur), Entf blendet aus
  zone.addEventListener("keydown", (ev) => {
    const el = ev.target.closest && ev.target.closest(".dash-k");
    if (!dashBearbeiten || !el || el.parentElement !== zone) return;
    if (["ArrowLeft", "ArrowUp"].includes(ev.key) && el.previousElementSibling) { zone.insertBefore(el, el.previousElementSibling); }
    else if (["ArrowRight", "ArrowDown"].includes(ev.key) && el.nextElementSibling) { zone.insertBefore(el.nextElementSibling, el); }
    else if (ev.key === "Delete" || ev.key === "Backspace") { ev.preventDefault(); dashAusblenden(el.dataset.block); return; }
    else return;
    ev.preventDefault();
    el.focus();
    dashReihenfolgeMerken(zone);
  });
}

function dashAusblenden(id) {
  if (!dashCfg.versteckt.includes(id)) dashCfg.versteckt.push(id);
  dashSichern(); zeichne();
}

function dashVerdrahten() {
  const auf = document.getElementById("dash-auf");
  if (auf) auf.addEventListener("click", () => { dashBearbeiten = true; zeichne(); });
  const fertig = document.getElementById("dash-fertig");
  if (fertig) fertig.addEventListener("click", () => { dashBearbeiten = false; zeichne(); });
  const zurueck = document.getElementById("dash-zurueck");
  if (zurueck) zurueck.addEventListener("click", () => { dashCfg = {}; dashSichern(); zeichne(); });
  document.querySelectorAll("#inhalt [data-dash-weg]").forEach((b) => b.addEventListener("click", () => dashAusblenden(b.dataset.dashWeg)));
  document.querySelectorAll("#inhalt [data-dash-dazu]").forEach((b) => b.addEventListener("click", () => {
    dashCfg.versteckt = dashCfg.versteckt.filter((x) => x !== b.dataset.dashDazu);
    dashSichern(); zeichne();
  }));
  document.querySelectorAll("#inhalt [data-dash-groesse]").forEach((b) => b.addEventListener("click", () => {
    const id = b.dataset.dashGroesse;
    const el = b.closest(".dash-k");
    const jetzt = GROESSEN.find((g) => el.classList.contains("b-" + g)) || "halb";
    const naechste = GROESSEN[(GROESSEN.indexOf(jetzt) + 1) % GROESSEN.length];
    dashCfg.groessen[id] = naechste;
    dashFlip(el.parentElement, () => { el.classList.remove("b-" + jetzt); el.classList.add("b-" + naechste); }, null);
    b.title = "Größe: " + GROESSE_TEXT[naechste] + " – klicken zum Ändern";
    dashSichern();
    setTimeout(zeichne, 300);                         // Diagramme für die neue Breite neu zeichnen
  }));
  document.querySelectorAll("#inhalt [data-zone]").forEach(dashZiehen);
}

SEITEN.uebersicht = { label: "Übersicht", render() {
  const k = kennzahlen();
  const cash = D.cash || [];
  const saldoJetzt = [...cash].reverse().find((c) => c.saldo_ist !== null && c.saldo_ist !== undefined);
  const plan = cash.filter((c) => !c.ist && Number.isFinite(c.saldo_plan));
  const tief = plan.length ? Math.min(...plan.map((c) => c.saldo_plan)) : null;
  const ablauf = ablaufListe(60);
  const lieferungen = offeneLieferungen(30);
  const klassen = standzeitKlassen();
  const langsteher = klassen.slice(3).reduce((s, b) => s + b.anzahl, 0);
  const offen = todoOffen(), spaet = todoUeberfaellig();

  // Jede Kachel ist ein eigener Block – ein- und ausblendbar, verschiebbar
  const bloecke = [
    { id: "kpi-bestand", titel: "Kennzahl: Bestand angeliefert", breite: "klein",
      html: kachel("Bestand angeliefert", zahl(k.anzahl), "Einkaufswert " + eur(k.wert)) },
    { id: "kpi-bestellt", titel: "Kennzahl: bestellt, noch nicht da", breite: "klein",
      html: kachel("Bestellt, noch nicht da", zahl(bestellt().length),
        eur(bestellt().reduce((s, v) => s + (v.purchase_net || 0), 0)) + " Einkauf") },
    { id: "kpi-kapital", titel: "Kennzahl: gebundenes Kapital", breite: "klein",
      html: kachel("Gebundenes Kapital", eur(k.finanzierung), k.vertraege + " laufende Verträge") },
    { id: "kpi-zinsfrei", titel: "Kennzahl: Zinsfreiheit endet", breite: "klein",
      html: kachel("Zinsfreiheit endet in 60 Tagen", zahl(k.risikoAnzahl) + " Fzg.",
        eur(k.risikoVolumen) + " betroffen", k.risikoAnzahl ? "warn" : "gut") },
    { id: "kpi-liquiditaet", titel: "Kennzahl: Liquidität heute", breite: "klein",
      html: saldoJetzt
        ? kachel("Liquidität heute", eur(saldoJetzt.saldo_ist), tief === null ? "keine Planung" : "Planungstief " + eur(tief), tief !== null && tief < 50000 ? "krit" : "")
        : kachel("Liquidität heute", "–", "Finanzplanung noch nicht eingelesen") },
    { id: "kpi-db", titel: "Kennzahl: Deckungsbeitrag", breite: "klein",
      html: kachel("Deckungsbeitrag " + HEUTE.slice(0, 4), eur(k.db),
        k.verkauft + " Verkäufe · Ø " + k.standtage + " Standtage", "gut") },
    { id: "kpi-preise", titel: "Kennzahl: Preise unter Kalkulation", breite: "klein",
      html: (() => { const n = (D.katalog || []).filter(unterKalkulation).length;
        return '<a href="#/teile" class="kachel-link">' + kachel("Preise unter Kalkulation", zahl(n), n ? "Teileliste: Spalte H unter Spalte I" : "alle Preise passen", n ? "warn" : "gut") + "</a>"; })() },
    { id: "kpi-linien", titel: "Kennzahl: Linien werden eng", breite: "klein",
      html: (() => {
        const eng = bedarfRechnen(projektionRechnen("streng", 12));
        const fehlt = eng.reduce((s, b) => s + b.fehlbetrag, 0);
        const frueh = eng.map((b) => b.stichtag).sort()[0];
        return kachel("Linien werden eng", eng.length ? eng.length + (eng.length === 1 ? " Linie" : " Linien") : "keine",
          frueh ? "ab " + datum(frueh) + " · " + eur(fehlt) + " zu viel"
                : zahl((D.kommend || []).length) + " Fahrzeuge bestellt",
          eng.length ? "krit" : "gut");
      })() },
    { id: "todos", titel: "To-dos", breite: "halb",
      html: karte("To-dos", offen.length
          ? offen.length + " offen" + (spaet.length ? " · " + spaet.length + " überfällig" : "")
          : "nichts offen",
        todoFormular(true) + todoZeilen(todoSortiert(offen).slice(0, 8), false),
        '<a href="#/todos">alle</a>') },
  ];

  const engpaesse = bedarfRechnen(projektionRechnen("streng", 12));
  if (engpaesse.length) bloecke.push({ id: "linienbedarf", titel: "Linien: Handlungsbedarf", breite: "breit",
    html: karte("Finanzierungslinie wird eng", "Bestand plus kommende Fahrzeuge gegen das vereinbarte Limit gerechnet",
      tabelle(["Linie", "~ab", "~fehlt", "~Kapital nötig", "Vorschlag"], engpaesse.slice(0, 5).map((b) =>
        "<tr><td><b>" + esc(b.hersteller) + '</b><div class="klein">' + esc(b.bank) + "</div></td>" +
        '<td class="r">' + datum(b.stichtag) + '</td><td class="r"><span class="pille krit">' + eur(b.fehlbetrag) + "</span></td>" +
        '<td class="r">' + eur(b.kapitalbedarf) + '</td><td class="leise">' +
        (b.kandidaten.length ? b.kandidaten.length + (b.kandidaten.length === 1 ? " Vertrag ablösen" : " Verträge ablösen") : "kein Vertrag zum Ablösen") +
        "</td></tr>")),
      '<a href="#/vororder">Linien und Bestellungen</a>') });

  if (D.fristen.length) bloecke.push({ id: "fristen", titel: "Zulassungsfristen", breite: "breit",
    html: karte("Zulassungsfrist läuft ab",
      "Nach Ablauf der Ausnahmegenehmigung ist das Fahrzeug so nicht mehr zulassungsfähig",
      tabelle(["Fahrzeug", "Ausnahme", "~Frist", "~Verbleibend", "~Einkaufswert"], D.fristen.slice(0, 5).map((f) =>
        "<tr><td>" + fzgLink(f.vehicle_internal_id) + '<div class="klein">' + esc((f.brand || "") + " " + (f.model || "")) + "</div></td>" +
        '<td class="leise">' + esc(f.ausnahme_art || "–") + '</td><td class="r">' + datum(f.frist) + "</td>" +
        '<td class="r"><span class="pille ' + (f.tage_bis <= 60 ? "krit" : "warn") + '">' + f.tage_bis + " Tage</span></td>" +
        '<td class="r">' + eur(f.purchase_net) + "</td></tr>"))) });

  bloecke.push(
    { id: "liquiditaet", titel: "Liquiditätsentwicklung", breite: "breit",
      html: karte("Liquiditätsentwicklung", "Ist bis zum laufenden Monat, danach Plan aus der Finanzplanung",
        '<div class="legende"><span><i class="lstrich"></i>Saldo Ist</span><span><i class="lstrich gestrichelt"></i>Saldo Plan</span></div><div class="diagramm" id="d-saldo"></div>') },
    { id: "zinsfrei-monate", titel: "Auslaufende Zinsfreiheit je Monat", breite: "halb",
      html: karte("Auslaufende Zinsfreiheit", "Volumen je Monat – so viel muss abgelöst oder verzinst werden",
        '<div class="legende"><span><i class="lpunkt" style="background:var(--warnung)"></i>Monate über 150 T€</span></div><div class="diagramm" id="d-ablauf"></div>') },
    { id: "standtage", titel: "Standtage im Bestand", breite: "halb",
      html: karte("Standtage im Bestand", "Einkaufswert je Standzeit in Tagen · " + langsteher + " Fahrzeuge stehen länger als 270 Tage",
        '<div class="diagramm" id="d-standzeit"></div>') },
    { id: "bestand-art", titel: "Bestand nach Fahrzeugart", breite: "breit",
      html: karte("Bestand nach Fahrzeugart", "Angelieferte Fahrzeuge, Einkaufswert inklusive Nebenkosten",
        tabelle(["Fahrzeugart", "~Auf dem Hof", "~Bestellt", "~Einkaufswert", "~Anteil"], jeArt().map((a) =>
          "<tr><td>" + esc(a.kategorie) + '</td><td class="r">' + zahl(a.anzahl) + '</td><td class="r leise">' +
          (a.bestellt ? "+" + zahl(a.bestellt) : "–") + '</td><td class="r">' + eur(a.wert) +
          '</td><td class="r leise">' + zahl((a.wert / (k.wert || 1)) * 100, 1) + " %</td></tr>"))) },
    { id: "zinsfrei-ablauf", titel: "Zinsfreiheit läuft aus (Liste)", breite: "halb",
      html: karte("Zinsfreiheit läuft aus", "Nächste 60 Tage",
        tabelle(["Fahrzeug", "Bank", "~Betrag", "~zinsfrei bis"], ablauf.slice(0, 7).map((f) =>
          "<tr><td>" + fzgLink(f.vehicle_internal_id) + '<div class="klein">' + esc((f.fzg?.brand || "") + " " + (f.fzg?.model || "")) + "</div></td>" +
          '<td class="leise">' + esc(f.bank) + '</td><td class="r">' + eur(f.financed_amount) + '</td>' +
          '<td class="r">' + datum(f.interest_free_until) + '<div style="margin-top:5px">' + restPille(f.rest) + "</div></td></tr>")),
        '<a href="#/finanzierung">alle ansehen</a>') },
    { id: "auslieferungen", titel: "Anstehende Auslieferungen", breite: "halb",
      html: karte("Anstehende Auslieferungen", "Nächste 30 Tage",
        tabelle(["Termin", "Fahrzeug", "Kunde", "Status"], lieferungen.slice(0, 7).map((d) =>
          "<tr><td>" + datum(d.planned_date) + "</td><td>" + fzgLink(d.vehicle_internal_id) +
          '<div class="klein">' + esc((d.fzg?.brand || "") + " " + (d.fzg?.model || "")) + "</div></td>" +
          '<td class="leise">' + esc(d.customer) + '<div class="klein">' + esc(d.city) + "</div></td>" +
          '<td><span class="pille ' + (d.status === "bestätigt" ? "gut" : "info") + '">' + esc(d.status) + "</span>" +
          (d.checklist_open ? '<div class="klein" style="color:var(--warnung)">' + esc(d.checklist_open) + "</div>" : "") + "</td></tr>")),
        '<a href="#/auslieferungen">alle ansehen</a>') },
  );

  const html = banner() +
    '<div class="kopf"><div><h1>Übersicht</h1><p>Stand ' + datum(HEUTE) + " · " + k.anzahl + " Fahrzeuge im Bestand</p></div></div>" +
    dashRaster(bloecke);

  return { html, nach() {
    dashVerdrahten();
    todoVerdrahten(true);
    const saldo = document.getElementById("d-saldo");
    if (saldo) zeichneFlaeche(saldo, D.cash, {
      titel: "Liquiditätsentwicklung", xLabel: (p) => monatsLabel(p.monat),
      serien: [{ key: "saldo_ist", farbe: "var(--serie-1)", flaeche: true }, { key: "saldo_plan", farbe: "var(--serie-1)", gestrichelt: true }],
      tip: (p) => ({ titel: monatsLabel(p.monat) + " · " + (p.ist ? "Ist" : "Plan"), zeilen: [
        { label: "Einzahlungen", wert: eur(p.ein), farbe: "var(--serie-3)" },
        { label: "Auszahlungen", wert: eur(p.aus), farbe: "var(--serie-2)" },
        { label: "Saldo", wert: eur(p.saldo_ist ?? p.saldo_plan), farbe: "var(--serie-1)" }] }),
    });
    const dAblauf = document.getElementById("d-ablauf");
    if (dAblauf) zeichneBalken(dAblauf, ablaufJeMonat(8), {
      titel: "Auslaufende Zinsfreiheit", xKey: "label", warnAb: 150000,
      serien: [{ key: "volumen", farbe: "var(--serie-1)" }],
      tip: (p) => ({ titel: p.label, zeilen: [{ label: "Volumen", wert: eur(p.volumen), farbe: "var(--serie-1)" }, { label: "Fahrzeuge", wert: zahl(p.anzahl) }] }),
    });
    const dStand = document.getElementById("d-standzeit");
    if (dStand) zeichneBalken(dStand, klassen, {
      titel: "Standtage", xKey: "label", alleLabels: true,
      serien: [{ key: "wert", farbe: "var(--serie-1)" }],
      tip: (p) => ({ titel: p.label + " Tage", zeilen: [{ label: "Einkaufswert", wert: eur(p.wert), farbe: "var(--serie-1)" }, { label: "Fahrzeuge", wert: zahl(p.anzahl) }] }),
    });
  } };
} };

let filterBestand = { status: "bestand", art: null, marke: null, lieferung: null, gruppe: "art", suche: "" };

const STATUS_A = { Bestand: "gruen-hell", Reserviert: "gelb", Verkauft: "orange", Ausgeliefert: "grau" };
const STATUS_K = { Bestand: "frei", Reserviert: "res", Verkauft: "verk", Ausgeliefert: "ausg" };

SEITEN.bestand = { label: "Bestand", render() {
  const f = filterBestand;
  const treffer = D.vehicles.filter((v) => {
    if (f.status === "bestand" ? !IM_BESTAND.includes(v.status) : f.status && v.status !== f.status) return false;
    if (f.art && v.category !== f.art) return false;
    if (f.marke && v.brand !== f.marke) return false;
    if (f.lieferung === "angeliefert" && v.lieferstatus === "geplant") return false;
    if (f.lieferung === "geplant" && v.lieferstatus !== "geplant") return false;
    if (f.suche) {
      const q = f.suche.toLowerCase();
      if (![v.internal_id, v.model, v.customer, v.vin].some((s) => (s || "").toLowerCase().includes(q))) return false;
    }
    return true;
  });

  const brutto = (v) => v.list_price_gross || (v.list_price_net || 0) * 1.19;
  const gruppeVon = (v) => f.gruppe === "art" ? (v.category || "ohne Fahrzeugart")
    : f.gruppe === "marke" ? (v.brand || "ohne Hersteller")
    : f.gruppe === "jahrgang" ? (v.jahrgang ? "Jahrgang " + v.jahrgang : "ohne Jahrgang")
    : f.gruppe === "lieferung" ? (v.lieferstatus === "geplant" ? "bestellt, noch nicht da" : "auf dem Hof")
    : f.gruppe === "standort" ? (v.location || "kein Platz") : "";

  const spalten = [
    { key: "nummer", label: "Interne Nr." }, { key: "modell", label: "Modell" },
    { key: "ausstattung", label: "Ausstattung" },
    { key: "status", label: "Status" }, { key: "lieferung", label: "Lieferung" },
    { key: "kommission", label: "Kommission" }, { key: "standort", label: "Standort" },
    { key: "eingang", label: "~Eingang" }, { key: "standtage", label: "~Standtage" },
    { key: "ek", label: "~EK netto" }, { key: "nk", label: "~NK" },
    { key: "vkliste", label: "~VK Liste" }, { key: "internet", label: "~Internet" },
    { key: "vkmin", label: "~VK min." }, { key: "marge", label: "~Rohertrag" },
    { key: "finanziert", label: "Finanziert" },
    { key: "fin", label: "FIN / Serien-Nr." }, { key: "bestell", label: "Bestell-Nr." },
    { key: "syscara", label: "=Syscara" },
  ];

  const zeilen = treffer.map((v) => {
    const st = standtage(v), geplant = v.lieferstatus === "geplant";
    const roh = brutto(v) / 1.19 - einstand(v);
    return {
      gruppe: f.gruppe ? gruppeVon(v) : undefined,
      werte: { nummer: v.internal_id, modell: (v.brand || "") + " " + (v.model || ""),
        ausstattung: v.ausstattung || "", status: v.status,
        lieferung: geplant ? "1" + (v.lieferblock || "") : "0" + (v.schluessel_nr || ""),
        kommission: v.kommission_name || v.kommission_art || "", standort: v.location || "",
        eingang: v.arrival_date || "", standtage: geplant ? -1 : st || 0, ek: v.purchase_net || 0,
        nk: v.extra_cost_net || 0, vkliste: brutto(v), internet: v.internet_price || 0,
        vkmin: v.vk_min || 0, marge: roh,
        finanziert: v.fin_bank ? v.fin_bank + " " + (v.fin_vertrag || "") : (v.caracamp_objekt || ""),
        fin: v.vin || "", bestell: v.bestell_nr || "", syscara: v.syscara || "" },
      zellen: {
        nummer: fzgLink(v.internal_id) + '<div class="klein">' + (v.jahrgang || "–") + " · MJ " + (v.model_year || "–") + "</div>",
        modell: esc(v.model || "") + '<div class="klein">' + esc((v.brand || "") + " · " + (v.category || "") + " · " + (v.condition || "")) + "</div>",
        ausstattung: v.ausstattung
          ? '<div class="klein leise" style="min-width:240px;max-width:360px">' + esc(v.ausstattung) + "</div>"
          : '<span class="klein">–</span>',
        status: ampel(STATUS_A[v.status] || "grau", STATUS_K[v.status] || v.status, "Status: " + v.status),
        lieferung: geplant
          ? ampel("rot", v.lieferblock || "Block", "noch nicht auf Lager, geplanter Lieferblock")
          : ampel("gruen-hell", v.schluessel_nr || "da", "angeliefert, Schlüssel " + (v.schluessel_nr || "ohne Nummer")),
        kommission: v.kommission_art === "Kommission"
          ? '<span class="leise">' + esc(v.kommission_name || "kommissioniert") + "</span>"
          : '<span class="klein">Lager</span>',
        standort: '<span class="leise">' + esc(v.location || "–") + "</span>",
        eingang: '<span class="leise">' + (geplant ? "–" : datum(v.arrival_date)) + "</span>",
        standtage: geplant ? '<span class="klein">bestellt</span>'
          : '<span' + (st > 270 ? ' style="color:var(--kritisch);font-weight:500"' : st > 180 ? ' style="color:var(--warnung)"' : "") + ">" + zahl(st) + "</span>",
        ek: eur(v.purchase_net), nk: v.extra_cost_net ? eur(v.extra_cost_net) : '<span class="klein">–</span>',
        vkliste: eur(brutto(v)), internet: v.internet_price ? eur(v.internet_price) : '<span class="klein">–</span>',
        vkmin: '<span class="leise">' + eur(v.vk_min) + "</span>",
        marge: '<span style="color:' + (roh <= 0 ? "var(--kritisch)" : roh < 5000 ? "var(--warnung)" : "var(--gut)") + '">' + eur(roh) + "</span>",
        finanziert: v.fin_bank
          ? '<span class="klein">' + esc(v.fin_bank) + (v.fin_vertrag ? '<div class="leise mono">Vertrag ' + esc(v.fin_vertrag) + "</div>" : "") + "</span>"
          : v.caracamp_objekt
            ? '<span class="klein mono leise" title="Objektnummer aus CaraCamp">Obj. ' + esc(v.caracamp_objekt) + "</span>"
            : '<span class="klein">–</span>',
        fin: '<span class="klein mono">' + esc(v.vin || "–") + '<div>' + esc(v.serien_nr || "") + "</div></span>",
        bestell: '<span class="klein">' + esc(v.bestell_nr || "–") + "</span>",
        syscara: v.syscara ? ampel("blau-hell", "ins", "Syscara: " + v.syscara) : ampel("leer", "–", "nicht inseriert"),
      },
    };
  });

  const gruppenInfo = {};
  for (const g of new Set(zeilen.map((z) => z.gruppe))) {
    const teil = treffer.filter((v) => gruppeVon(v) === g);
    gruppenInfo[g] = eur(teil.reduce((s, v) => s + einstand(v), 0)) + " Einkauf · " +
      eur(teil.reduce((s, v) => s + brutto(v), 0)) + " VK-Liste";
  }

  const chip = (text, aktiv, aktion) =>
    '<button type="button" class="' + (aktiv ? "aktiv" : "") + '" data-best="' + esc(aktion) + '">' + esc(text) + "</button>";
  const reihe = (titel, inhalt) =>
    '<div class="filter"><span style="font-size:12px;color:var(--ink-3);align-self:center;width:84px">' + titel + "</span>" + inhalt + "</div>";

  const html = banner() +
    '<div class="kopf"><div><h1>Bestand</h1><p>Alle Felder der Bestandsführung, gruppiert und über jede Überschrift sortierbar</p></div></div>' +
    '<div class="kacheln">' +
      kachel("Auf dem Hof", zahl(bestand().length), "Einkaufswert " + eur(bestand().reduce((s, v) => s + einstand(v), 0))) +
      kachel("Angezeigte Treffer", zahl(treffer.length), "Einkaufswert " + eur(treffer.reduce((s, v) => s + einstand(v), 0))) +
      kachel("VK-Liste der Treffer", eur(treffer.reduce((s, v) => s + brutto(v), 0)), "brutto") +
      kachel("Rohertrag kalkuliert", eur(treffer.reduce((s, v) => s + brutto(v) / 1.19 - einstand(v), 0)), "VK Liste netto minus Einstand", "gut") +
    "</div>" +
    reihe("Gruppierung", [["art", "Fahrzeugart"], ["marke", "Hersteller"], ["jahrgang", "Jahrgang"],
      ["lieferung", "Lieferstand"], ["standort", "Standort"], ["", "ohne"]]
      .map(([k, l]) => chip(l, f.gruppe === k, "gruppe:" + k)).join("")) +
    reihe("Status", ["bestand", "Bestand", "Reserviert", "Verkauft", "Ausgeliefert"]
      .map((s) => chip(s === "bestand" ? "Im Bestand" : s, f.status === s, "status:" + s)).join("")) +
    reihe("Fahrzeugart", chip("Alle", !f.art, "art:") +
      jeArt().map((a) => chip(a.kategorie + " " + a.anzahl, f.art === a.kategorie, "art:" + a.kategorie)).join("")) +
    reihe("Hersteller", chip("Alle", !f.marke, "marke:") +
      jeMarke().map((m) => chip(m.brand + " " + m.anzahl, f.marke === m.brand, "marke:" + m.brand)).join("")) +
    reihe("Lieferung", chip("Alle", !f.lieferung, "lieferung:") +
      chip("Auf dem Hof", f.lieferung === "angeliefert", "lieferung:angeliefert") +
      chip("Bestellt", f.lieferung === "geplant", "lieferung:geplant")) +
    '<div style="margin-top:12px"><input type="search" id="suche-bestand" placeholder="Suche nach interner Nummer, Modell, Kunde oder FIN …" value="' + esc(f.suche) + '"></div>' +
    '<div class="gitter">' + karte("Fahrzeuge", treffer.length + " Einträge · Überschrift anklicken zum Sortieren",
      sortTabelle("bestand", spalten, zeilen, { minBreite: 1700, gruppenInfo, start: { key: "standtage", richtung: "ab" }, leer: "Keine Fahrzeuge gefunden." }) +
      ampelLegende([
        { farbe: "gruen-hell", text: "frei / angeliefert" }, { farbe: "gelb", text: "reserviert" },
        { farbe: "orange", text: "verkauft, noch nicht übergeben" }, { farbe: "rot", text: "noch nicht auf Lager (Lieferblock)" },
        { farbe: "grau", text: "ausgeliefert" }, { farbe: "blau-hell", text: "in Syscara inseriert" },
      ])) + "</div>";

  return { html, nach() {
    document.querySelectorAll("[data-best]").forEach((b) => b.addEventListener("click", () => {
      const [art, wert] = b.dataset.best.split(":");
      filterBestand[art === "gruppe" ? "gruppe" : art] = wert || null;
      if (art === "gruppe") filterBestand.gruppe = wert;
      zeichne();
    }));
    const feld = document.getElementById("suche-bestand");
    feld.addEventListener("input", () => {
      clearTimeout(feld._t);
      feld._t = setTimeout(() => { filterBestand.suche = feld.value; zeichne(); setTimeout(() => {
        const neu = document.getElementById("suche-bestand");
        if (neu) { neu.focus(); neu.setSelectionRange(neu.value.length, neu.value.length); }
      }, 0); }, 260);
    });
  } };
} };

SEITEN.fahrzeug = { versteckt: true, render(id) {
  const v = fahrzeug(id);
  if (!v) return { html: '<div class="kopf"><h1>Fahrzeug nicht gefunden</h1></div><p class="leise">Die Nummer ' + esc(id) + ' steht in keiner eingelesenen Liste. <a href="#/bestand">Zurück zum Bestand</a></p>' };
  const fin = offeneFin(v.internal_id);
  const alleFin = finanzierungenVon(v.internal_id);
  const rest = fin ? tageBis(fin.interest_free_until) : null;
  const lieferung = D.deliveries.find((d) => d.vehicle_internal_id === v.internal_id) || null;
  const provision = D.commissions.find((c) => c.vehicle_internal_id === v.internal_id) || null;
  const ein = einstand(v);
  const roh = (v.sold_net || v.list_price_net || 0) - ein;
  const zeile = (l, w) => '<div><span class="l">' + esc(l) + '</span><span class="w">' + w + "</span></div>";

  const html = banner() +
    '<div class="kopf"><div><h1 class="mono">' + esc(v.internal_id) + "</h1><p>" +
      esc([v.brand + " " + v.model, v.category, v.condition, "MJ " + v.model_year].join(" · ")) + "</p></div>" +
      '<a href="#/bestand" style="color:var(--akzent);text-decoration:none;font-size:13px">zurück zum Bestand</a></div>' +
    '<div class="kacheln">' +
      kachel("Einstand netto", eur(ein), "EK " + eur(v.purchase_net) + " + NK " + eur(v.extra_cost_net)) +
      kachel(v.sold_net ? "Verkauf netto" : "Listenpreis netto", eur(v.sold_net || v.list_price_net), v.sold_date ? "verkauft am " + datum(v.sold_date) : "noch nicht verkauft") +
      kachel(v.sold_net ? "Rohertrag" : "Rohertrag (kalkuliert)", eur(roh), zahl((roh / (ein || 1)) * 100, 1) + " % auf Einstand", roh > 0 ? "gut" : "krit") +
      kachel("Standtage", zahl(standtage(v)), "Eingang " + datum(v.arrival_date), standtage(v) > 270 ? "warn" : "") +
    "</div>" +
    '<div class="gitter halb">' +
      karte("Stammdaten", null, '<div class="detailliste">' +
        zeile("Status", '<span class="pille ' + (v.status === "Ausgeliefert" ? "gut" : "") + '">' + esc(v.status) + "</span>") +
        zeile("Standort", esc(v.location || "–")) +
        zeile("Fahrgestellnummer", '<span class="mono">' + esc(v.vin || "–") + "</span>") +
        zeile("Kunde", esc(v.customer || "–")) +
        zeile("Verkäufer", esc(v.salesperson || "–")) +
        zeile("Einkauf brutto", eur(v.purchase_gross)) +
        zeile("Notiz", esc(v.notes || "–")) + "</div>") +
      karte("Einkaufsfinanzierung", fin ? alleFin.length + (alleFin.length === 1 ? " Vertrag" : " Verträge") + " hinterlegt" : null,
        !fin ? '<div class="karte-leer">Keine Finanzierung hinterlegt – Bareinkauf.</div>' :
        '<div class="detailliste">' +
          zeile("Bank", esc(fin.bank)) +
          zeile("Vertragsnummer", '<span class="mono">' + esc(fin.contract_no || "–") + "</span>") +
          zeile("Finanzierter Betrag", eur(fin.financed_amount)) +
          zeile("Beginn", datum(fin.start_date)) +
          zeile("Zinsfrei bis", datum(fin.interest_free_until) + " " + restPille(rest)) +
          zeile("Zins nach Ablauf", fin.interest_rate_pct ? zahl(fin.interest_rate_pct, 1) + " % p. a." : "–") +
          zeile("Spätestes Ablösedatum", datum(fin.due_date)) +
          zeile("Status", '<span class="pille ' + (fin.status === "offen" ? "info" : "gut") + '">' + esc(fin.status) + "</span>") +
        "</div>" +
        (rest !== null && rest < 0 && fin.interest_rate_pct
          ? '<div style="padding:11px 15px;border-top:1px solid var(--linie);font-size:12px;color:var(--warnung)">Laufende Zinskosten seit Ablauf: rund ' +
            eur((fin.financed_amount * (fin.interest_rate_pct / 100) * Math.abs(rest)) / 365) + " – Ablösung oder Verkauf prüfen.</div>" : "")) +
    "</div>" +
    (lieferung || provision ? '<div class="gitter halb">' +
      (lieferung ? karte("Auslieferung", null, '<div class="detailliste">' +
        zeile("Geplant", datum(lieferung.planned_date)) + zeile("Tatsächlich", datum(lieferung.actual_date)) +
        zeile("Kunde", esc(lieferung.customer || "–")) + zeile("Ort", esc(lieferung.city || "–")) +
        zeile("Status", '<span class="pille">' + esc(lieferung.status) + "</span>") +
        zeile("Offene Punkte", esc(lieferung.checklist_open || "keine")) + "</div>") : "") +
      (provision ? karte("Provision", null, '<div class="detailliste">' +
        zeile("Verkäufer", esc(provision.salesperson)) + zeile("Bemessung", eur(provision.basis_amount)) +
        zeile("Satz", zahl(provision.rate_pct, 1) + " %") + zeile("Betrag", eur(provision.amount)) +
        zeile("Status", '<span class="pille ' + (provision.status === "offen" ? "warn" : "gut") + '">' + esc(provision.status) + "</span>") + "</div>") : "") +
      "</div>" : "");

  return { html };
} };

let finTage = 90;
const finOffen = new Set();          // aufgeklappte Linien (Bank||Hersteller)

/* -------- Linien wie in der Finanzaufstellung: je Bank × Hersteller ein Blatt. Limit, genutzt (offene
   Finanzierungen), kommend (bestellt, noch nicht da) und frei = Limit − genutzt − kommend. */
const endlich = (n) => (typeof n === "number" && isFinite(n) ? n : 0);
const anteil = (teil, ganz) => (ganz > 0 ? Math.max(0, Math.min(100, (endlich(teil) / ganz) * 100)) : 0);
const finHersteller = (f) => {
  if (f.hersteller) return f.hersteller;
  const v = fahrzeug(f.vehicle_internal_id) || {};
  return v.category === "Gebrauchtwagen" ? "Gebrauchtfahrzeuge" : (v.brand || "ohne Hersteller");
};
const kommendWer = (k) => k.kunde ? k.kunde : (k.kommission_art === "Lager" ? "Lager" : (k.kommission || "–"));

function linienSicht() {
  const map = new Map();
  const holen = (bank, hersteller) => {
    const key = bank + "||" + hersteller;
    if (!map.has(key)) map.set(key, { key, bank, hersteller, linie: null, limit: null, konditionen: null, zins: null,
      hinterlegt: false, fin: [], kommend: [] });
    return map.get(key);
  };
  for (const l of D.linien || []) {
    const e = holen(l.bank, l.hersteller);
    Object.assign(e, { linie: l.linie || null, limit: typeof l.limit_betrag === "number" && l.limit_betrag > 0 ? l.limit_betrag : null,
      konditionen: l.konditionen || null, zins: l.zins_pct, hinterlegt: true });
  }
  for (const f of D.financings) if (f.status === "offen") holen(f.bank, finHersteller(f)).fin.push(f);
  for (const k of D.kommend || []) holen(k.bank, k.hersteller).kommend.push(k);
  return [...map.values()].map((l) => {
    const genutzt = summe(l.fin, (f) => endlich(f.financed_amount));
    const kommend = summe(l.kommend, (k) => endlich(k.betrag));
    const frei = l.limit === null ? null : l.limit - genutzt - kommend;
    const fin = [...l.fin].sort((a, b) => (a.interest_free_until || "9").localeCompare(b.interest_free_until || "9"));
    const kom = [...l.kommend].sort((a, b) => (a.termin_datum || "9").localeCompare(b.termin_datum || "9"));
    // Ab welchem kommenden Fahrzeug reicht das Limit nicht mehr? (ohne Verkäufe gerechnet)
    let kipptBei = null, lauf = genutzt;
    if (l.limit !== null) for (const k of kom) { lauf += endlich(k.betrag); if (lauf > l.limit) { kipptBei = k; break; } }
    if (l.limit !== null && genutzt > l.limit) kipptBei = null;
    return { ...l, fin, kommend: kom, genutzt, kommendSumme: kommend, frei, kipptBei };
  }).sort((a, b) => a.bank.localeCompare(b.bank, "de") || Number(b.hinterlegt) - Number(a.hinterlegt) || a.hersteller.localeCompare(b.hersteller, "de"));
}

function linienBalken(l) {
  const ganz = Math.max(l.limit || 0, l.genutzt + l.kommendSumme) || 1;
  const g = anteil(l.genutzt, ganz), k = anteil(l.kommendSumme, ganz);
  const limit = l.limit ? anteil(l.limit, ganz) : null;
  return '<div class="fl-balken' + (l.frei !== null && l.frei < 0 ? " ueber" : "") + (l.limit ? "" : " ohne") + '" aria-hidden="true"><i class="g" style="width:' + g.toFixed(2) + '%"></i>' +
    '<i class="k" style="left:' + g.toFixed(2) + "%;width:" + k.toFixed(2) + '%"></i>' +
    (limit !== null && limit < 99.9 ? '<b class="fl-limit" style="left:' + limit.toFixed(2) + '%"></b>' : "") + "</div>";
}

const freiText = (l) => l.frei === null ? '<span class="leise">kein Limit</span>'
  : l.frei < 0 ? '<span class="fl-minus">' + eur(-l.frei) + "</span>" : eur(l.frei);

function linienKopf(l, kompakt) {
  const name = (l.linie ? l.linie + " · " : "") + (l.konditionen || (l.zins ? zahl(l.zins, 2) + " %" : ""));
  return '<div class="fl-name"><b>' + esc(l.hersteller) + "</b>" + (kompakt ? '<span class="klein">' + esc(l.bank) + "</span>" : "") +
      (name.trim() ? '<span class="klein">' + esc(name.replace(/ · $/, "")) + "</span>" : "") +
      (!l.hinterlegt ? '<span class="klein">nicht in der Finanzaufstellung</span>' : "") + "</div>" +
    '<div class="fl-mitte">' + linienBalken(l) +
      '<div class="fl-legende klein"><span><i class="g"></i>' + zahl(l.fin.length) + " finanziert</span>" +
      (l.kommend.length ? '<span><i class="k"></i>' + zahl(l.kommend.length) + " kommend</span>" : "") +
      (l.limit ? "<span>" + zahl(Math.round((l.genutzt + l.kommendSumme) / l.limit * 100)) + " % vom Limit</span>" : "") + "</div></div>" +
    '<dl class="fl-zahlen">' +
      "<div><dt>Limit</dt><dd>" + (l.limit ? eur(l.limit) : "–") + "</dd></div>" +
      "<div><dt>genutzt</dt><dd>" + eur(l.genutzt) + "</dd></div>" +
      "<div><dt>kommend</dt><dd>" + eur(l.kommendSumme) + "</dd></div>" +
      '<div class="fl-frei"><dt>' + (l.frei !== null && l.frei < 0 ? "über Limit" : "frei") + "</dt><dd>" + freiText(l) + "</dd></div></dl>";
}

function linienFahrzeuge(l) {
  const fzgZeilen = l.fin.map((f) => {
    const v = fahrzeug(f.vehicle_internal_id) || {};
    const rest = tageBis(f.interest_free_until);
    const wer = v.kommission_art === "Kommission" ? (v.kommission_name || v.customer || "Kommission") : (v.customer || "Lager");
    const abl = ABLOESUNGEN.get(f.vehicle_internal_id);
    return "<tr><td>" + fzgLink(f.vehicle_internal_id) + '<div class="klein">' + esc(v.model || "") + "</div></td>" +
      '<td class="leise">' + esc(wer) + "</td>" +
      '<td class="r">' + eur(f.financed_amount) + "</td>" +
      '<td class="r">' + datum(f.interest_free_until) + (rest === null ? "" : "<div>" + restPille(rest) + "</div>") + "</td>" +
      '<td class="r">' + (f.naechste_rate_am ? datum(f.naechste_rate_am) + '<div class="klein">' + eur(f.naechste_rate) + "</div>" : '<span class="klein">–</span>') + "</td>" +
      '<td class="r">' + (abl ? '<span class="pille gut">geplant ' + datum(abl) + "</span>" : f.due_date ? datum(f.due_date) : '<span class="klein">–</span>') + "</td></tr>";
  });
  const komZeilen = l.kommend.map((k) =>
    "<tr><td><b>" + esc(k.termin_text || "ohne Termin") + "</b>" + (k.termin_datum && k.termin_text !== datum(k.termin_datum) ? '<div class="klein">ab ca. ' + datum(k.termin_datum) + "</div>" : "") + "</td>" +
    "<td>" + esc(k.modell || "–") + "</td>" +
    '<td class="leise">' + esc(kommendWer(k)) + (k.internal_id ? '<div class="klein mono">' + (fahrzeug(k.internal_id) ? fzgLink(k.internal_id) : esc(k.internal_id)) + "</div>" : "") + "</td>" +
    '<td class="leise">' + esc(k.konditionen || "–") + "</td>" +
    '<td class="r">' + (typeof k.betrag === "number" ? eur(k.betrag) : '<span class="pille warn">Betrag fehlt</span>') + "</td></tr>");
  return '<div class="fl-inhalt">' +
    (fzgZeilen.length ? '<h3>Finanziert <span class="klein">' + zahl(fzgZeilen.length) + " offen · " + eur(l.genutzt) + "</span></h3>" +
      tabelle(["Fahrzeug", "Kommission", "~Betrag", "~zinsfrei bis", "~nächste Rate", "~Ablösung bis"], fzgZeilen) : '<p class="klein fl-leer">Kein offener Vertrag auf dieser Linie.</p>') +
    (komZeilen.length ? '<h3>Kommend <span class="klein">' + zahl(komZeilen.length) + " bestellt · " + eur(l.kommendSumme) + "</span></h3>" +
      tabelle(["Termin", "Modell", "Kommission", "Konditionen", "~Betrag"], komZeilen) : "") +
    "</div>";
}

SEITEN.finanzierung = { label: "Finanzierung", render() {
  const rows = ablaufListe(finTage);
  const abgelaufen = rows.filter((r) => r.rest < 0);
  const zinskosten = summe(abgelaufen, (r) => (r.financed_amount * ((r.interest_rate_pct || 0) / 100) * Math.abs(r.rest)) / 365);
  const monate = ablaufJeMonat(10);
  const linien = linienSicht();
  const mitLimit = linien.filter((l) => l.limit !== null);
  const ueber = linien.filter((l) => l.frei !== null && l.frei < 0);
  const genutzt = summe(linien, (l) => l.genutzt), kommend = summe(linien, (l) => l.kommendSumme);
  const anzahlKommend = summe(linien, (l) => l.kommend.length);
  const frei = summe(mitLimit, (l) => l.frei);
  const banken = [...new Set(linien.map((l) => l.bank))];

  const bankBlock = (bank) => {
    const meine = linien.filter((l) => l.bank === bank);
    const limit = summe(meine, (l) => l.limit || 0);
    const freiBank = summe(meine.filter((l) => l.frei !== null), (l) => l.frei);
    return '<section class="fl-bank"><div class="fl-bank-kopf"><h2>' + esc(bank) + "</h2><span>" +
        zahl(meine.length) + (meine.length === 1 ? " Linie" : " Linien") + (limit ? " · Limit " + eur(limit) + " · frei " +
        (freiBank < 0 ? '<span class="fl-minus">' + eur(freiBank) + "</span>" : eur(freiBank)) : "") + "</span></div>" +
      '<div class="fl-liste">' + meine.map((l) =>
        '<details class="fl-linie' + (l.frei !== null && l.frei < 0 ? " ueber" : "") + '" data-fl="' + esc(l.key) + '"' + (finOffen.has(l.key) ? " open" : "") + ">" +
          '<summary><span class="fl-kopf">' + linienKopf(l, false) + '</span><span class="fl-pfeil" aria-hidden="true"></span></summary>' +
          linienFahrzeuge(l) + "</details>").join("") + "</div></section>";
  };

  const html = banner() +
    '<div class="kopf"><div><h1>Einkaufsfinanzierung</h1><p>Je Bank und Hersteller wie in der Finanzaufstellung: Limit, was finanziert ist, was noch kommt und was frei bleibt</p></div></div>' +
    '<div class="kacheln">' +
      kachel("Limit gesamt", eur(summe(mitLimit, (l) => l.limit)), zahl(mitLimit.length) + (mitLimit.length === 1 ? " Linie" : " Linien")) +
      kachel("Genutzt", eur(genutzt), zahl(summe(linien, (l) => l.fin.length)) + " Fahrzeuge finanziert") +
      kachel("Kommend", eur(kommend), anzahlKommend ? zahl(anzahlKommend) + " Fahrzeuge bestellt" : "nichts bestellt") +
      kachel("Frei", eur(frei), ueber.length ? zahl(ueber.length) + (ueber.length === 1 ? " Linie überzogen" : " Linien überzogen") : "nach allen Bestellungen", frei < 0 ? "krit" : ueber.length ? "warn" : "gut") +
      kachel("Zinsfreiheit abgelaufen", zahl(abgelaufen.length) + " Fzg.", eur(summe(abgelaufen, (r) => r.financed_amount)) + " verzinst" + (zinskosten >= 1 ? " · ca. " + eur(zinskosten) + " Zinsen" : ""), abgelaufen.length ? "krit" : "gut") +
    "</div>" +
    (ueber.length ? '<div class="fl-warnung" role="status"><b>' + (ueber.length === 1 ? "Eine Linie läuft" : zahl(ueber.length) + " Linien laufen") +
      " mit den bestellten Fahrzeugen über das Limit:</b> " + ueber.map((l) => esc(l.bank + " · " + l.hersteller) + " " + eur(-l.frei)).join(", ") +
      '. <a href="#/vororder">Was bis wann kommt</a></div>' : "") +
    (linien.length ? banken.map(bankBlock).join("")
      : '<div class="gitter">' + karte("Linien", null, '<p class="karte-leer">Noch keine Finanzaufstellung eingelesen.<br>Unter „Datenquellen“ die Liste „Finanzierungen“ wählen.</p>') + "</div>") +
    '<div class="gitter zweidrittel">' +
      karte("Auslaufende Zinsfreiheit je Monat", "Planungsgrundlage für Ablösung und Abverkauf",
        '<div class="legende"><span><i class="lpunkt" style="background:var(--warnung)"></i>Monate über 150 T€ Ablösebedarf</span></div><div class="diagramm" id="d-fin"></div>') +
      karte("Raten der nächsten 90 Tage", "aus dem Tilgungsplan rechts in der Finanzaufstellung",
        tabelle(["Fällig", "Fahrzeug", "~Rate"], (D.tilgungOffen || []).slice(0, 8).map((t) =>
          "<tr><td>" + datum(t.faellig_am) + '<div class="klein">' + esc(t.bank || "") + "</div></td><td>" + fzgLink(t.vehicle_internal_id) +
          '<div class="klein">' + esc(t.model || "") + '</div></td><td class="r">' + eur(t.betrag) + "</td></tr>"))) +
    "</div>" +
    '<div class="filter">' + [30, 60, 90, 180, 365].map((t) =>
      '<button type="button" class="' + (finTage === t ? "aktiv" : "") + '" data-tage="' + t + '">' + t + " Tage</button>").join("") + "</div>" +
    '<div class="gitter">' + karte("Fälligkeitsliste", "Zinsfreiheit endet innerhalb von " + finTage + " Tagen oder ist bereits abgelaufen",
      tabelle(["Fahrzeug", "Linie", "~Betrag", "~Zins", "~zinsfrei bis", "~Ablösung bis", "Lage"], rows.map((r) =>
        "<tr><td>" + fzgLink(r.vehicle_internal_id) + '<div class="klein">' + esc((r.fzg?.brand || "") + " " + (r.fzg?.model || "")) + "</div></td>" +
        '<td class="leise">' + esc(r.linie || r.bank) + '<div class="klein">' + esc(r.linie ? r.bank : (r.contract_no || "")) + "</div></td>" +
        '<td class="r">' + eur(r.financed_amount) + '</td><td class="r leise">' + (r.interest_rate_pct ? zahl(r.interest_rate_pct, 1) + " %" : "–") + "</td>" +
        '<td class="r">' + datum(r.interest_free_until) + '</td><td class="r leise">' + datum(r.due_date) + "</td>" +
        "<td>" + restPille(r.rest) + "</td></tr>"))) + "</div>";

  return { html, nach() {
    zeichneBalken(document.getElementById("d-fin"), monate, {
      titel: "Auslaufende Zinsfreiheit je Monat", xKey: "label", warnAb: 150000,
      serien: [{ key: "volumen", farbe: "var(--serie-1)" }],
      tip: (p) => ({ titel: p.label, zeilen: [{ label: "Volumen", wert: eur(p.volumen), farbe: "var(--serie-1)" }, { label: "Fahrzeuge", wert: zahl(p.anzahl) }] }),
    });
    document.querySelectorAll("[data-tage]").forEach((b) => b.addEventListener("click", () => { finTage = +b.dataset.tage; zeichne(); }));
    document.querySelectorAll("details[data-fl]").forEach((d) => d.addEventListener("toggle", () => {
      if (d.open) finOffen.add(d.dataset.fl); else finOffen.delete(d.dataset.fl);
    }));
  } };
} };

/* Zu erwartende Zahlungen auf der Liquiditätsseite: offene zuerst, Finanzierungen hervorgehoben, Eingegangenes darunter. */
function erwartetKarte() {
  if (!D.finanzen || !Array.isArray(D.erwartet) || !D.erwartet.length) return "";
  const offen = erwartetOffen(), bank = bankOffen();
  const erledigt = D.erwartet.filter((e) => e && !e.offen);
  const ohne = offen.filter((e) => geldOk(e.betrag) === null).length;
  const hinweis = "Aus der Finanzaufstellung (erstes Blatt) – zusammen " + eur(betragSumme(offen)) + ", davon " +
    mehrzahl(bank.length, "Finanzierung", "Finanzierungen") + " über " + eur(betragSumme(bank)) + ", die die Bank noch nicht ausgezahlt hat" +
    (ohne ? "; " + mehrzahl(ohne, "Zeile", "Zeilen") + " ohne Betrag" : "");
  return '<div class="kacheln">' +
      kachel("Zu erwartende Zahlungen", eur(betragSumme(offen)), mehrzahl(offen.length, "Zahlung", "Zahlungen") + " offen") +
      kachel("Bank zahlt noch aus", eur(betragSumme(bank)), mehrzahl(bank.length, "Kundenfinanzierung", "Kundenfinanzierungen"), bank.length ? "warn" : "gut") +
      kachel("Überfällig", zahl(offen.filter((e) => e.ueberfaellig).length), "Datum vorbei, noch nicht da", offen.some((e) => e.ueberfaellig) ? "krit" : "gut") +
    "</div>" +
    '<div class="gitter">' + karte("Zu erwartende Zahlungen", hinweis, erwartetTabelle(offen, true)) + "</div>" +
    (erledigt.length ? '<div class="gitter">' + karte("Laut Finanzaufstellung schon eingegangen", "Bemerkung „bezahlt“ o. ä. – zählt nicht mehr mit",
      erwartetTabelle(erledigt, true)) + "</div>" : "");
}

SEITEN.liquiditaet = { label: "Liquidität", render() {
  const jetzt = [...D.cash].reverse().find((c) => c.saldo_ist !== null);
  const plan = D.cash.filter((c) => !c.ist);
  const tief = Math.min(...plan.map((c) => c.saldo_plan));
  const tiefMonat = plan.find((c) => c.saldo_plan === tief);
  const aus = D.cashKategorien.filter((c) => c.direction === "aus");
  const ein = D.cashKategorien.filter((c) => c.direction === "ein");

  const html = banner() +
    '<div class="kopf"><div><h1>Liquidität</h1><p>Ist-Zahlen bis zum laufenden Monat, danach die Planung</p></div></div>' +
    '<div class="kacheln">' +
      kachel("Saldo heute", eur(jetzt.saldo_ist), monatsLabel(jetzt.monat)) +
      kachel("Netto laufender Monat", eur(jetzt.netto), "ein " + eur(jetzt.ein) + " / aus " + eur(jetzt.aus), jetzt.netto >= 0 ? "gut" : "krit") +
      kachel("Planungstief", eur(tief), tiefMonat ? "erwartet " + monatsLabel(tiefMonat.monat) : "", tief < 50000 ? "krit" : tief < 150000 ? "warn" : "gut") +
      kachel("Planhorizont", plan.length + " Monate", "aus der Finanzplanung übernommen") +
    "</div>" +
    '<div class="gitter">' +
      karte("Saldoverlauf", "Durchgezogen = Ist, gestrichelt = Plan",
        '<div class="legende"><span><i class="lstrich"></i>Saldo Ist</span><span><i class="lstrich gestrichelt"></i>Saldo Plan</span></div><div class="diagramm" id="d-liq"></div>') +
      karte("Ein- und Auszahlungen je Monat", "Nebeneinander, damit knappe Monate auffallen",
        '<div class="legende"><span><i class="lpunkt" style="background:var(--serie-3)"></i>Einzahlungen</span><span><i class="lpunkt" style="background:var(--serie-2)"></i>Auszahlungen</span></div><div class="diagramm" id="d-einaus"></div>') +
    "</div>" +
    '<div class="gitter halb">' +
      karte("Größte Auszahlungen", "letzte drei Monate, Ist", tabelle(["Kategorie", "~Summe"], aus.map((c) =>
        "<tr><td>" + esc(c.category) + '</td><td class="r">' + eur(c.summe) + "</td></tr>"))) +
      karte("Einzahlungen", "letzte drei Monate, Ist", tabelle(["Kategorie", "~Summe"], ein.map((c) =>
        "<tr><td>" + esc(c.category) + '</td><td class="r">' + eur(c.summe) + "</td></tr>"))) +
    "</div>" +
    '<div class="gitter">' + karte("Monatsübersicht", "Dieselben Zahlen als Tabelle",
      tabelle(["Monat", "Art", "~Einzahlungen", "~Auszahlungen", "~Netto", "~Saldo"], D.cash.map((c) =>
        "<tr><td>" + monatsLabel(c.monat) + '</td><td><span class="pille ' + (c.ist ? "" : "info") + '">' + (c.ist ? "Ist" : "Plan") + "</span></td>" +
        '<td class="r">' + eur(c.ein) + '</td><td class="r">' + eur(c.aus) + "</td>" +
        '<td class="r" style="color:' + (c.netto < 0 ? "var(--kritisch)" : "var(--gut)") + '">' + eur(c.netto) + "</td>" +
        '<td class="r">' + eur(c.saldo_ist ?? c.saldo_plan) + "</td></tr>"))) + "</div>" + erwartetKarte();

  return { html, nach() {
    zeichneFlaeche(document.getElementById("d-liq"), D.cash, {
      titel: "Saldoverlauf", xLabel: (p) => monatsLabel(p.monat),
      serien: [{ key: "saldo_ist", farbe: "var(--serie-1)", flaeche: true }, { key: "saldo_plan", farbe: "var(--serie-1)", gestrichelt: true }],
      tip: (p) => ({ titel: monatsLabel(p.monat) + " · " + (p.ist ? "Ist" : "Plan"), zeilen: [
        { label: "Einzahlungen", wert: eur(p.ein), farbe: "var(--serie-3)" },
        { label: "Auszahlungen", wert: eur(p.aus), farbe: "var(--serie-2)" },
        { label: "Saldo", wert: eur(p.saldo_ist ?? p.saldo_plan), farbe: "var(--serie-1)" }] }),
    });
    zeichneBalken(document.getElementById("d-einaus"), D.cash.map((c) => ({ ...c, label: monatsLabel(c.monat) })), {
      titel: "Ein- und Auszahlungen", xKey: "label", maxBreite: 14,
      serien: [{ key: "ein", farbe: "var(--serie-3)" }, { key: "aus", farbe: "var(--serie-2)" }],
      tip: (p) => ({ titel: monatsLabel(p.monat) + " · " + (p.ist ? "Ist" : "Plan"), zeilen: [
        { label: "Einzahlungen", wert: eur(p.ein), farbe: "var(--serie-3)" },
        { label: "Auszahlungen", wert: eur(p.aus), farbe: "var(--serie-2)" },
        { label: "Netto", wert: eur(p.netto) }] }),
    });
  } };
} };

let provStatus = null;

SEITEN.provisionen = { label: "Provisionen", render() {
  const rows = D.commissions.filter((c) => !provStatus || c.status === provStatus)
    .sort((a, b) => (b.sale_date || "").localeCompare(a.sale_date || ""));
  const offen = D.commissions.filter((c) => c.status === "offen");
  const verkaeufer = jeVerkaeufer();

  const html = banner() +
    '<div class="kopf"><div><h1>Provisionen</h1><p>Abrechnung je Verkäufer und Fahrzeug</p></div></div>' +
    '<div class="kacheln">' +
      kachel("Offene Provisionen", eur(summe(offen, (c) => c.amount)), offen.length + " Vorgänge", offen.length ? "warn" : "gut") +
      kachel("Gesamt erfasst", eur(summe(D.commissions, (c) => c.amount)), D.commissions.length + " Vorgänge") +
      kachel("Verkäufer", zahl(verkaeufer.length), "mit Provisionsanspruch") +
    "</div>" +
    '<div class="gitter halb">' +
      karte("Provision je Verkäufer", "Summe aller erfassten Vorgänge", '<div class="diagramm" id="d-prov"></div>') +
      karte("Offen und ausgezahlt", null, tabelle(["Verkäufer", "~Fälle", "~Gesamt", "~davon offen"], verkaeufer.map((v) =>
        "<tr><td>" + esc(v.salesperson) + '</td><td class="r">' + zahl(v.faelle) + '</td><td class="r">' + eur(v.gesamt) +
        '</td><td class="r" style="color:' + (v.offen ? "var(--warnung)" : "var(--ink-3)") + '">' + eur(v.offen) + "</td></tr>"))) +
    "</div>" +
    '<div class="filter">' + [["Alle", null], ["Offen", "offen"], ["Ausgezahlt", "ausgezahlt"]].map(([l, w]) =>
      '<button type="button" class="' + (provStatus === w ? "aktiv" : "") + '" data-prov="' + (w || "") + '">' + l + "</button>").join("") + "</div>" +
    '<div class="gitter">' + karte("Einzelvorgänge", null,
      tabelle(["Fahrzeug", "Verkäufer", "~Verkauf", "~Bemessung", "~Satz", "~Provision", "Status"], rows.map((c) => {
        const v = fahrzeug(c.vehicle_internal_id);
        return "<tr><td>" + fzgLink(c.vehicle_internal_id) + '<div class="klein">' + esc((v?.brand || "") + " " + (v?.model || "")) + "</div></td>" +
          '<td class="leise">' + esc(c.salesperson) + '</td><td class="r leise">' + datum(c.sale_date) + "</td>" +
          '<td class="r">' + eur(c.basis_amount) + '</td><td class="r leise">' + zahl(c.rate_pct, 1) + " %</td>" +
          '<td class="r">' + eur(c.amount) + '</td><td><span class="pille ' + (c.status === "offen" ? "warn" : "gut") + '">' + esc(c.status) + "</span></td></tr>";
      }))) + "</div>";

  return { html, nach() {
    zeichneBalken(document.getElementById("d-prov"), verkaeufer, {
      titel: "Provision je Verkäufer", xKey: "salesperson", alleLabels: true,
      serien: [{ key: "gesamt", farbe: "var(--serie-1)" }],
      tip: (p) => ({ titel: p.salesperson, zeilen: [
        { label: "Gesamt", wert: eur(p.gesamt), farbe: "var(--serie-1)" },
        { label: "davon offen", wert: eur(p.offen) }, { label: "Fälle", wert: zahl(p.faelle) }] }),
    });
    document.querySelectorAll("[data-prov]").forEach((b) => b.addEventListener("click", () => { provStatus = b.dataset.prov || null; zeichne(); }));
  } };
} };

let ampelFilter = { verkaeufer: null, nur: null };

/* Farben wie in der Excel-Legende */
const K_TEILE = { "nicht bestellt": "rot", "bestellt": "gelb", "teilweise geliefert": "gruen-dunkel",
  "geliefert": "gruen-hell", "teilweise im Fahrzeug": "blau-dunkel", "alle im Fahrzeug": "blau-hell" };
const K_TANK = { "nicht begonnen": "rot", "offen": "rot", "in Arbeit": "gelb", "fertig": "gruen-hell", "fertig getankt": "gruen-hell" };
const K_FZG = { "auf Lager": "gruen-hell", "im Werk fertig": "gruen-dunkel", "im Werk offen": "rot" };
const K_PAP = { "beim Kunden": "gruen-hell", "bei uns": "gelb", "im Werk": "orange" };
const K_EINBAU = { "erledigt": "gruen-hell", "beim Einbaupartner": "gelb", "offen": "rot" };

const zelleFarbe = (wert, karte, kuerzel, label) => wert && karte[wert]
  ? ampel(karte[wert], kuerzel, label + ": " + wert)
  : ampel("leer", kuerzel, label + ": nicht erfasst");

const zahlFarbe = (z) => z.zahlstatus === "bezahlt" ? "gruen-hell"
  : z.zahlstatus === "angezahlt" ? "orange" : z.zahlart === "VDR" ? "gelb" : "rot";

function offenePunkte(z) {
  const p = [];
  if (!z.teilestatus || !["geliefert", "alle im Fahrzeug"].includes(z.teilestatus)) p.push("Teile");
  if (z.papiere_status !== "beim Kunden") p.push("Papiere");
  if (z.zahlstatus !== "bezahlt") p.push("Zahlung");
  if (!z.werk_bezahlt) p.push("Werk");
  if (z.tuev_faellig) p.push("TÜV");
  for (const [wert, name] of [[z.ahk_starr, "AHK starr"], [z.ahk_abnehmbar, "AHK abn."],
                              [z.unterboden, "Unterboden"], [z.sondereinbau, "Sondereinbau"]]) {
    if (wert && wert !== "erledigt") p.push(name);
  }
  return p;
}

/* Übergaben je Kalenderwoche – als Kapazitätsübersicht: wie voll ist eine Woche schon? */
function kwUebersicht() {
  const jeKw = new Map();
  for (const z of D.raster) {
    if (!z.planned_date || z.planned_date < HEUTE.slice(0, 10)) continue;
    const montag = isoPlus(z.planned_date, -((new Date(z.planned_date + "T12:00:00").getDay() + 6) % 7));
    jeKw.set(montag, (jeKw.get(montag) || 0) + 1);
  }
  const wochen = [...jeKw.entries()].sort((a, b) => a[0].localeCompare(b[0])).slice(0, 9);
  if (!wochen.length) return "";
  const max = Math.max(...wochen.map((w) => w[1]));
  return '<div class="gitter">' + karte("Übergaben je Kalenderwoche", "Wie voll die nächsten Wochen schon sind – zum Einplanen neuer Termine",
    '<div class="ep-raster">' + wochen.map(([montag, n]) =>
      '<div class="ep-zeile"><span class="ep-kw">KW ' + isoKW(montag) + '</span><span class="ep-balken"><i style="width:' +
      Math.round(n / max * 100) + '%"></i></span><span class="ep-pct">' + zahl(n) + "</span></div>").join("") + "</div>") + "</div>";
}

/* ------------------------------------------------- Zu erwartende Zahlungen
   Aus dem ersten Blatt der Finanzaufstellung (laufender Liquiditätsplan): Kundenzahlungen, die noch kommen – vor allem
   Finanzierungen, bei denen die Bank noch nicht an uns ausgezahlt hat. Nur für Finanz-Berechtigte: ohne D.finanzen
   enthält das Datenpaket die Liste gar nicht erst. Die Ampel der Übergaben zeigt „Bank zahlt noch aus“ ohne Betrag. */
const geldOk = (x) => (x !== null && x !== undefined && x !== "" && Number.isFinite(Number(x)) ? Number(x) : null);
// Offene Zahlungen sehen alle (wer ausliefert, muss wissen, ob das Geld da ist) – Beträge nur mit Finanzrecht;
// ohne Recht kommen die Zeilen schon ohne Betrag und Bemerkung an.
const erwartetOffen = () => (Array.isArray(D.erwartet) ? D.erwartet : []).filter((e) => e && e.offen);
const bankOffen = () => erwartetOffen().filter((e) => e.art === "Finanzierung");
const betragSumme = (liste) => liste.reduce((s, e) => s + (geldOk(e.betrag) || 0), 0);
function erwartetTermin(e) {
  if (e.erwartet_am) return datum(e.erwartet_am) + (e.ueberfaellig ? ' <span class="pille krit">überfällig</span>' : "");
  if (e.erwartet_ab) return datum(e.erwartet_ab) + ' <span class="leise">zur Übergabe</span>';
  return '<span class="leise">' + esc(e.erwartet_text || "ohne Datum") + "</span>";
}
function erwartetTabelle(liste, mitArt) {
  const geld = !!D.finanzen;
  return tabelle(["Kunde", "Fahrzeug", ...(mitArt ? ["Art"] : []), "Bank", "Erwartet", ...(geld ? ["~Betrag"] : []), "Stand"], liste.map((e) =>
    "<tr><td>" + esc(e.kunde || "–") + "</td><td>" + (e.internal_id ? fzgLink(e.internal_id) + " " : "") + esc(e.fahrzeug || "") + "</td>" +
    (mitArt ? "<td>" + esc(e.art || "") + "</td>" : "") +
    "<td>" + esc(e.bank || "–") + "</td><td>" + erwartetTermin(e) + "</td>" +
    (geld ? '<td class="r">' + (geldOk(e.betrag) === null ? '<span class="leise">ohne Betrag</span>' : eur(geldOk(e.betrag))) + "</td>" : "") +
    '<td><span class="pille ' + (!e.offen ? "gut" : e.art === "Finanzierung" ? "warn" : "") + '">' + esc(e.status || "offen") + "</span>" +
      (e.uebergabe ? '<div class="klein">Übergabe ' + datum(e.uebergabe.planned_date) + "</div>" : "") +
      (e.bemerkung ? '<div class="klein">' + esc(e.bemerkung) + "</div>" : "") + "</td></tr>"));
}

SEITEN.auslieferungen = { label: "Auslieferungen", render() {
  const k = D.ampelK;
  const bankListe = bankOffen();
  const verkaeufer = [...new Set(D.raster.map((z) => z.verkaeufer).filter(Boolean))];
  const zeilenRoh = D.raster.filter((z) => {
    if (ampelFilter.verkaeufer && z.verkaeufer !== ampelFilter.verkaeufer) return false;
    const offen = offenePunkte(z);
    if (ampelFilter.nur === "offen" && offen.length === 0) return false;
    if (ampelFilter.nur && ampelFilter.nur !== "offen" && !offen.some((x) => x.startsWith(ampelFilter.nur))) return false;
    return true;
  });

  const spalten = [
    { key: "termin", label: "Termin" }, { key: "fahrzeug", label: "Fahrzeug" },
    { key: "kunde", label: "Kunde" }, { key: "verkaeufer", label: "VK" }, { key: "art", label: "Art" },
    { key: "tank", label: "=Tank" }, { key: "teile", label: "=Teile" }, { key: "fzg", label: "=Fzg" },
    { key: "tuev", label: "=TÜV" }, { key: "papiere", label: "=Pap" }, { key: "geld", label: "=Geld" },
    { key: "werk", label: "=Werk" }, { key: "einbau", label: "=Einbauten" },
    { key: "minuten", label: "~Min" }, { key: "offen", label: "~Offen" }, { key: "bemerkung", label: "Bemerkung" },
    { key: "aendern", label: "=", titel: "In ODIN ändern – schreibt in die Auslieferungsliste" },
  ];

  const zeilen = zeilenRoh.map((z) => {
    const rest = tageBis(z.planned_date), offen = offenePunkte(z);
    return {
      werte: { termin: z.planned_date, fahrzeug: z.vehicle_internal_id, kunde: z.customer,
        verkaeufer: z.verkaeufer || "", art: z.fahrzeugart || "", minuten: z.geplante_minuten || 0,
        offen: offen.length, bemerkung: z.bemerkung || "" },
      zellen: {
        termin: datum(z.planned_date) + (z.uhrzeit ? '<span class="leise"> · ' + esc(z.uhrzeit) + "</span>" : "") +
          '<div class="klein"' + (rest <= 7 ? ' style="color:var(--warnung)"' : "") + ">" +
          (rest < 0 ? Math.abs(rest) + " T überfällig" : "in " + rest + " T") +
          (z.termin_art && z.termin_art !== "Kundenabholung" ? " · " + esc(z.termin_art) : "") + "</div>",
        fahrzeug: fzgLink(z.vehicle_internal_id) + '<div class="klein">' + esc((z.brand || "") + " " + (z.model || "")) + "</div>",
        kunde: esc(z.customer) + '<div class="klein">' + esc(z.city || "") + "</div>" +
          (z.bank_zahlt_aus ? '<div class="klein" style="color:var(--warnung)">Bank zahlt noch aus</div>' : ""),
        verkaeufer: '<span class="leise">' + esc(z.verkaeufer || "–") + "</span>",
        art: '<span class="leise">' + esc(z.fahrzeugart || "–") + "</span>",
        tank: zelleFarbe(z.tankstatus, K_TANK, "T", "Tanken"),
        teile: zelleFarbe(z.teilestatus, K_TEILE, "TE", "Teile" + (z.arbeitskarte ? " (Karte " + z.arbeitskarte + ")" : "")),
        fzg: zelleFarbe(z.verfuegbarkeit, K_FZG, "F", "Fahrzeug"),
        tuev: z.tuev_faellig ? ampel("rot", "TÜ", "TÜV vor Übergabe fällig") : ampel("leer", "TÜ", "TÜV nicht nötig"),
        papiere: zelleFarbe(z.papiere_status, K_PAP, "P", "Papiere" + (z.papiere_text ? ": " + z.papiere_text : "")),
        geld: ampel(zahlFarbe(z), z.zahlart || "–", (z.zahlart || "ohne") + ": " + (z.zahlstatus || "offen") +
          (z.bank_zahlt_aus ? " · Finanzierung: Bank zahlt noch aus" : "") +
          (z.anzahlung ? " · Anzahlung " + eur(z.anzahlung) : "") +
          (z.inzahlungnahme_fzg ? " · Inzahlungnahme " + z.inzahlungnahme_fzg + " (" + eur(z.inzahlungnahme_wert) +
            (z.inzahlungnahme_da ? ", steht bei uns" : ", noch nicht da") + ")" : "")),
        werk: z.werk_bezahlt ? ampel("gruen-hell", "W", "ans Werk bezahlt") : ampel("rot", "W", "ans Werk offen"),
        einbau: '<span style="display:inline-flex;gap:2px">' +
          zelleFarbe(z.ahk_starr, K_EINBAU, "AS", "AHK starr") +
          zelleFarbe(z.ahk_abnehmbar, K_EINBAU, "AA", "AHK abnehmbar") +
          zelleFarbe(z.unterboden, K_EINBAU, "UB", "Unterboden & Hohlraum") +
          zelleFarbe(z.sondereinbau, K_EINBAU, "SO", "Sondereinbau" + (z.sondereinbau_text ? ": " + z.sondereinbau_text : "")) + "</span>",
        minuten: '<span class="leise">' + (z.geplante_minuten ? zahl(z.geplante_minuten) : "–") + "</span>",
        offen: offen.length === 0 ? '<span class="pille gut">bereit</span>'
          : '<span style="color:' + (offen.length >= 4 ? "var(--kritisch);font-weight:600" : "var(--warnung)") + '">' + offen.length + "</span>",
        bemerkung: '<span class="klein">' + esc(z.bemerkung || "") +
          (z.inzahlungnahme_fzg ? '<span style="display:block;color:var(--ink-3)">IZ: ' + esc(z.inzahlungnahme_fzg) +
            (z.inzahlungnahme_da ? " (da)" : " (offen)") + "</span>" : "") + "</span>",
        aendern: '<button type="button" class="ak-zeilenknopf" data-ak-uebergabe="' + esc(z.id) + '" title="Termin, Papiere, Zahlung … ändern" aria-label="Übergabe ' + esc(z.customer) + ' ändern">Ändern</button>',
      },
    };
  });

  const chip = (text, aktiv, aktion) =>
    '<button type="button" class="' + (aktiv ? "aktiv" : "") + '" data-ampel="' + esc(aktion) + '">' + esc(text) + "</button>";

  const html = banner() +
    '<div class="kopf"><div><h1>Auslieferungen</h1><p>Jede Übergabe mit allen Prüfpunkten auf einen Blick – sortierbar über jede Überschrift</p></div></div>' +
    '<div class="kacheln">' +
      kachel("Offene Übergaben", zahl(k.anzahl), "nächste 60 Tage") +
      kachel("Übergabebereit", zahl(k.ohne_befund), "kein offener Punkt", k.ohne_befund ? "gut" : "") +
      kachel("Warten auf Teile", zahl(k.teile), "nicht vollständig im Fahrzeug", k.teile ? "warn" : "gut") +
      kachel("Geld offen", zahl(k.zahlung), "nicht oder nur angezahlt" +
        (D.raster.some((z) => z.bank_zahlt_aus) ? " · bei " + zahl(D.raster.filter((z) => z.bank_zahlt_aus).length) + " zahlt die Bank noch aus" : ""),
        k.zahlung ? "krit" : "gut") +
      (bankListe.length ? kachel("Finanzierung offen", D.finanzen ? eur(betragSumme(bankListe)) : zahl(bankListe.length),
        mehrzahl(bankListe.length, "Kunde", "Kunden") + " · Bank hat noch nicht ausgezahlt", "warn") : "") +
      kachel("Papiere offen", zahl(k.papiere), "Brief nicht beim Kunden", k.papiere ? "warn" : "gut") +
    "</div>" +
    '<div class="filter"><span style="font-size:12px;color:var(--ink-3);align-self:center;width:70px">Verkäufer</span>' +
      chip("Alle", !ampelFilter.verkaeufer, "v:") +
      verkaeufer.map((v) => chip(v, ampelFilter.verkaeufer === v, "v:" + v)).join("") + "</div>" +
    '<div class="filter"><span style="font-size:12px;color:var(--ink-3);align-self:center;width:70px">Filter</span>' +
      chip("Alle", !ampelFilter.nur, "n:") + chip("Nur mit offenen Punkten", ampelFilter.nur === "offen", "n:offen") +
      ["Teile", "Papiere", "Zahlung", "Werk", "TÜV"].map((f) => chip(f, ampelFilter.nur === f, "n:" + f)).join("") + "</div>" +
    kwUebersicht() +
    (bankListe.length ? '<div class="gitter">' + karte("Finanzierung noch nicht ausgezahlt",
      "Aus der Finanzaufstellung: Kunden finanzieren über ihre Bank, das Geld ist noch nicht bei uns" + (D.finanzen ? " – zusammen " + eur(betragSumme(bankListe)) : "") +
        ". Ist die Zahlung in der Auslieferungsliste grün, gilt sie als eingegangen.",
      erwartetTabelle(bankListe, false), D.finanzen ? '<a href="#/liquiditaet">Alle erwarteten Zahlungen</a>' : "") + "</div>" : "") +
    '<div class="gitter">' + karte("Übergaberaster", zeilenRoh.length + " von " + D.raster.length + " Terminen · Spalte anklicken zum Sortieren",
      sortTabelle("raster", spalten, zeilen, { minBreite: 1280, start: { key: "termin", richtung: "auf" }, leer: "Keine Übergabe passt zum Filter." }) +
      ampelLegende([
        { farbe: "rot", text: "offen / nicht bestellt / fällig" },
        { farbe: "gelb", text: "bestellt / bei uns / Rechnung offen" },
        { farbe: "orange", text: "angezahlt / Brief im Werk" },
        { farbe: "gruen-dunkel", text: "teilweise geliefert / im Werk fertig" },
        { farbe: "gruen-hell", text: "erledigt / bezahlt / auf Lager" },
        { farbe: "blau-dunkel", text: "Teile teilweise im Fahrzeug" },
        { farbe: "blau-hell", text: "alle Teile im Fahrzeug" },
        { farbe: "leer", text: "nicht erfasst" },
      ])) + "</div>";

  return { html, nach() {
    document.querySelectorAll("[data-ak-uebergabe]").forEach((b) => b.addEventListener("click", () => {
      const z = D.raster.find((x) => String(x.id) === b.dataset.akUebergabe);
      if (!z || !window.ODIN_AKTIONEN) return;
      window.ODIN_AKTIONEN.dialog({
        titel: "Übergabe ändern", untertitel: z.customer + " · " + z.vehicle_internal_id + " · " + datum(z.planned_date) + (z.uhrzeit ? ", " + z.uhrzeit + " Uhr" : ""),
        aktionen: ["termin_verschieben", "papiere", "zahlung", "werkszahlung", "teile", "tuev", "einbau", "tank", "bemerkung", "zulassung"],
        parameter: { uebergabe_id: String(z.id) }, satz: "Übergabe " + z.customer,
        vorgaben: { neu_datum: z.planned_date, neu_uhrzeit: z.uhrzeit || "" },
      });
    }));
    document.querySelectorAll("[data-ampel]").forEach((b) => b.addEventListener("click", () => {
      const [art, wert] = b.dataset.ampel.split(":");
      if (art === "v") ampelFilter.verkaeufer = wert || null;
      else ampelFilter.nur = wert || null;
      zeichne();
    }));
  } };
} };

let teileFilter = { suche: "", gruppe: null, typ: null, nurBestand: false, nach: "fahrzeugtyp" };

const teileOffen = new Set();      // aufgeklappte Stücklisten (Code des Artikels)
/* Einkauf, Lohnkosten, Eigenkosten und Spanne sind interne Werte: standardmäßig verborgen, „Einkauf anzeigen“
   blendet sie ein (gemerkt nur für diesen Rechner). Im Browser (Handy & Tablet) gibt es den Schalter nicht, dort
   liefert ODIN diese Werte gar nicht erst aus. Das ist keine Berechtigung – echte Rechte kommen mit der Anmeldung. */
const TEILE_EINKAUF = { an: false, geladen: false };
const imBrowser = () => !!(window.pywebview && window.pywebview.web);
const einkaufSichtbar = () => TEILE_EINKAUF.an && !imBrowser();
async function teileEinkaufLaden() {
  if (TEILE_EINKAUF.geladen || imBrowser()) return;
  TEILE_EINKAUF.geladen = true;
  try { TEILE_EINKAUF.an = (await cpApi().oberflaeche("teile_einkauf")) === true; } catch (e) { /* Standard: verborgen */ }
}
/* Fahrzeugtypen: die feste Einteilung kommt aus ODIN (fahrzeugtypen.py), typ_neu aus der Zuordnung des Inhabers.
   Was noch nicht zugeordnet ist, bleibt unter seinem Namen aus der Teileliste sichtbar. */
const fzTypen = () => D.fahrzeugtypen || { liste: [], alle: "Alle Fahrzeuge", bezeichnungen: [] };
const teilTyp = (t) => t.typ_neu || t.fahrzeugtyp || "";
const typOffen = (t) => !t.typ_neu && !!t.fahrzeugtyp;
/* Festgelegter Preis (Teileliste Spalte H) unter dem per Formel berechneten (Spalte I, rot)? Das soll nie sein –
   bisher wurde dafür Spalte A gelb gefärbt; ODIN rechnet es selbst nach. */
const unterKalkulation = (t) => t.set_preis != null && t.preis_brutto != null && t.set_preis < t.preis_brutto - 0.005;
SEITEN.teile = { label: "Teile & Montage", render() {
  const f = teileFilter, k = D.katalogK, ek = einkaufSichtbar(), FT = fzTypen();
  const zuNiedrig = D.katalog.filter(unterKalkulation);
  const treffer = D.katalog.filter((t) => {
    if (f.nurUnter && !unterKalkulation(t)) return false;
    if (f.gruppe && t.warengruppe !== f.gruppe) return false;
    if (f.typ && teilTyp(t) !== f.typ) return false;
    if (f.nurBestand && !(t.bestand > 0)) return false;
    if (f.suche) {
      const q = f.suche.toLowerCase();
      const heu = [t.name, t.code, t.artikel_nr, t.warengruppe, t.produkt, t.fahrzeugtyp, t.typ_neu,
        ...(t.stueckliste || []).map((x) => (x.name || "") + " " + (x.code || "") + " " + (x.artikel_nr || ""))].join(" ").toLowerCase();
      if (!heu.includes(q)) return false;
    }
    return true;
  });

  // Verkauf rechnet brutto, der Einkauf netto: daraus entstehen Eigenkosten und Spanne
  const lohnBrutto = (t) => t.lohn_vk ?? ((t.aw || 0) * (t.vk_pro_aw || 0));

  // Vorn der Kundenpreis (Teil + Montage, brutto) – danach, was der Verkauf braucht; Einkauf nur auf Wunsch
  const spalten = [
    { key: "code", label: "Code", titel: "unsere interne Nummer" },
    { key: "artikel", label: "Artikel" },
    { key: "gesamt", label: "~Kundenpreis inkl. Montage", titel: "brutto: Teil + Montage (bei Sets mit Unterartikeln); ein festgelegter Preis aus Spalte H gilt vor", klasse: "kundenpreis" },
    { key: "vk", label: "~Teil brutto", titel: "Verkaufspreis des Teils, brutto" },
    { key: "lohn", label: "~Montage brutto", titel: "AW × VK je Arbeitswert, brutto" },
    { key: "aw", label: "~AW", titel: "Arbeitswerte, 1 AW = 6 Minuten" }, { key: "minuten", label: "~Minuten" },
    { key: "bestand", label: "~Lager", titel: "Bestand aus der Artikelverwaltung" },
    { key: "nummer", label: "Artikel-Nr." }, { key: "gruppe", label: "Warengruppe" }, { key: "gewicht", label: "~Gewicht" },
    { key: "aendern", label: "=", titel: "Arbeitszeit, Preis oder Lagerbestand ändern – schreibt in die Teileliste" },
    ...(ek ? [
      { key: "ek", label: "~EK netto", titel: "Einkaufspreis des Teils, netto", klasse: "intern" },
      { key: "lohnek", label: "~Lohn-EK netto", titel: "interne Lohnkosten inklusive Kleinteile, netto", klasse: "intern" },
      { key: "eigen", label: "~Eigenkosten brutto", titel: "(EK netto + Lohn-EK netto) × 1,19 – das zahlen wir selbst", klasse: "intern" },
      { key: "spanne", label: "~Spanne", titel: "Kundenpreis minus Eigenkosten brutto", klasse: "intern" },
    ] : []),
  ];

  // Stückliste: Unterartikel, die mit dem verkauften Artikel bestellt werden müssen (aufklappbar)
  const stueckHtml = (t) => {
    const liste = t.stueckliste || [];
    const preis = (x) => x.vk_brutto ?? x.vk ?? x.preis_brutto ?? x.einzelteil_vk;
    const ekWert = (x) => x.ek ?? x.purchase_net ?? x.stamm_ek;
    return '<div class="stueckliste"><table><thead><tr><th>Code</th><th>Unterartikel</th><th class="r">Menge</th><th class="r">VK brutto je Stück</th>' +
      (ek ? '<th class="r">EK netto je Stück</th>' : "") + '<th class="r">Lager</th></tr></thead><tbody>' +
      liste.map((x) => '<tr><td class="mono">' + esc(x.code || "–") + "</td><td>" + esc(x.name || "") +
        (x.artikel_nr ? ' <span class="klein">' + esc(x.artikel_nr) + "</span>" : "") + '</td><td class="r">' + zahl(x.menge ?? 1) + '</td><td class="r">' +
        (preis(x) != null ? eur(preis(x), 2) : "–") + "</td>" +
        (ek ? '<td class="r leise">' + (ekWert(x) ? eur(ekWert(x), 2) : "–") + "</td>" : "") +
        '<td class="r">' + (x.bestand == null ? '<span class="klein">–</span>' : zahl(x.bestand)) + "</td></tr>").join("") +
      "</tbody></table><p class=\"klein\">Diese Teile gehören zum Artikel und müssen mitbestellt werden." +
      (t.stueckliste_vk ? " Unterartikel-VK " + eur(t.stueckliste_vk, 2) + "." : "") +
      (t.set_preis != null ? " Set-Preis " + eur(t.set_preis, 2) + "." : "") +
      (ek && t.set_ek != null ? " Set gesamt: EK netto " + eur(t.set_ek, 2) +
        (t.set_eigenkosten_brutto != null ? " · Eigenkosten brutto " + eur(t.set_eigenkosten_brutto, 2) : "") + "." : "") + "</p></div>";
  };
  const typGruppe = (t) => !t.fahrzeugtyp && !t.typ_neu ? "ohne Zuordnung"
    : typOffen(t) ? t.fahrzeugtyp + " · noch nicht zugeordnet" : teilTyp(t);
  const zeilen = treffer.map((t) => {
    const vkBrutto = t.vk_brutto ?? ((t.sales_net || 0) * 1.19);
    const lohn = lohnBrutto(t);
    const istSet = (t.stueckliste || []).length > 0;
    // Set: verkauft wird zum Set-Preis; Eigenkosten mit allen Unterartikeln (die Excel-Spalte rechnet sie nicht mit)
    // Verkauft wird zum festgelegten Preis (Spalte H), sonst zur Summe aus Teil und Montage
    const gesamt = t.set_preis ?? (istSet ? vkBrutto + lohn + (t.stueckliste_vk || 0) : vkBrutto + lohn);
    const zuBillig = unterKalkulation(t);
    const eigen = ek ? ((istSet ? t.set_eigenkosten_brutto : null) ?? t.gesamt_ek_brutto ?? 0) : 0;
    const spanne = eigen ? gesamt - eigen : 0;
    return {
      gruppe: f.nach === "keine" ? undefined
        : f.nach === "warengruppe" ? (t.warengruppe || "ohne Warengruppe") : typGruppe(t),
      werte: { code: t.code || "", artikel: t.name, nummer: t.artikel_nr || "", gruppe: t.warengruppe || "",
        gewicht: parseFloat(String(t.gewicht || "0").replace(",", ".")) || 0,
        bestand: t.bestand === null || t.bestand === undefined ? -1 : t.bestand,
        ek: ek ? ((istSet ? t.set_ek : null) ?? (t.purchase_net || t.stamm_ek || 0)) : 0, lohnek: ek ? t.lohn_ek || 0 : 0, eigen,
        vk: vkBrutto, lohn, gesamt, spanne, aw: t.aw || 0, minuten: t.install_minutes || 0 },
      zellen: {
        code: '<span class="mono" style="white-space:nowrap">' + esc(t.code || "–") + "</span>",
        artikel: '<div style="min-width:240px;max-width:400px"><span style="font-weight:500">' + esc(t.produkt || t.name) + "</span>" +
          (t.variante && t.variante !== t.produkt ? ' <span class="leise">· ' + esc(t.variante) + "</span>" : "") +
          (f.nach !== "fahrzeugtyp" && teilTyp(t) ? '<div class="klein">' + esc(teilTyp(t)) + (typOffen(t) ? " · noch nicht zugeordnet" : "") + "</div>" : "") +
          (t.hinweis ? '<div class="klein" style="color:var(--warnung)">' + esc(t.hinweis) + "</div>" : "") +
          (zuBillig ? '<div class="preis-warnung" title="Festgelegter Preis (Spalte H) liegt unter dem berechneten Preis (Spalte I)">Preis unter Kalkulation: ' +
            eur(t.set_preis, 2) + " statt mind. " + eur(t.preis_brutto, 2) + "</div>" : "") +
          ((t.stueckliste || []).length ? '<button type="button" class="stueck-auf" data-stueck="' + esc(t.code || t.id) + '" aria-expanded="' + teileOffen.has(String(t.code || t.id)) + '">' +
            '<span class="pfeil">▸</span>Stückliste · ' + t.stueckliste.length + (t.stueckliste.length === 1 ? " Teil" : " Teile") + "</button>" : "") + "</div>",
        nummer: t.artikel_nr
          ? (/^https?:\/\//i.test(t.movera_link || "")
            ? '<a href="' + esc(t.movera_link) + '" target="_blank" rel="noopener" style="color:var(--akzent);white-space:nowrap" title="bei Movera ansehen">' + esc(t.artikel_nr) + " ↗</a>"
            : '<span class="leise">' + esc(t.artikel_nr) + "</span>")
          : '<span class="klein">–</span>',
        gruppe: '<span class="leise">' + esc(t.warengruppe || "–") + "</span>",
        gewicht: '<span class="leise">' + esc(t.gewicht || "–") + "</span>",
        bestand: t.bestand === null || t.bestand === undefined ? ampel("leer", "–", "nicht im Artikelstamm")
          : t.bestand > 0 ? ampel("gruen-hell", String(t.bestand), t.bestand + " auf Lager")
          : ampel("grau", "0", "nicht auf Lager"),
        vk: eur(vkBrutto),
        lohn: lohn ? eur(lohn) : '<span class="klein">–</span>',
        gesamt: '<span class="kundenpreis-wert' + (zuBillig ? " zu-billig" : "") + '"' + (t.set_preis != null ? ' title="festgelegter Preis (Spalte H)' + (t.preis_brutto != null ? ", berechnet " + eur(t.preis_brutto, 2) : "") + '"' : "") + ">" + eur(gesamt) + "</span>",
        aw: '<span class="leise">' + (t.aw ? zahl(t.aw, 1) : "–") + "</span>",
        minuten: '<span class="leise">' + (t.install_minutes ? zahl(t.install_minutes) : "–") + "</span>",
        aendern: '<button type="button" class="ak-zeilenknopf" data-ak-teil="' + esc(t.sku) + '" aria-label="' + esc(t.name) + ' ändern">Ändern</button>',
        ...(ek ? {
          ek: '<span class="leise"' + (istSet ? ' title="Set: Artikel plus Unterartikel"' : "") + ">" + eur((istSet ? t.set_ek : null) ?? (t.purchase_net || t.stamm_ek)) + "</span>",
          lohnek: '<span class="leise">' + (t.lohn_ek ? eur(t.lohn_ek) : "–") + "</span>",
          eigen: eigen ? '<span title="das zahlen wir selbst">' + eur(eigen) + "</span>" : '<span class="klein">–</span>',
          spanne: spanne ? '<span style="color:' + (spanne <= 0 ? "var(--kritisch)" : "var(--gut)") + '">' + eur(spanne) + "</span>" : '<span class="klein">–</span>',
        } : {}),
      },
      unter: (t.stueckliste || []).length && teileOffen.has(String(t.code || t.id)) ? stueckHtml(t) : "",
      klasse: zuBillig ? "zeile-warnung" : "",
    };
  });

  const chip = (text, aktiv, aktion, zusatz = "", titel = "") =>
    '<button type="button" class="' + [aktiv ? "aktiv" : "", zusatz].join(" ").trim() + '" data-teil="' + esc(aktion) + '"' +
    (titel ? ' title="' + esc(titel) + '"' : "") + ">" + esc(text) + "</button>";
  const reihe = (titel, inhalt) =>
    '<div class="filter"><span style="font-size:12px;color:var(--ink-3);align-self:center;width:84px">' + titel + "</span>" + inhalt + "</div>";

  // Typen in fester Reihenfolge, „alle Fahrzeuge“ danach, noch nicht Zugeordnetes zuletzt
  const typZahl = new Map(), offeneTypen = new Set();
  for (const t of D.katalog) {
    const typ = teilTyp(t);
    if (!typ) continue;
    typZahl.set(typ, (typZahl.get(typ) || 0) + 1);
    if (typOffen(t)) offeneTypen.add(typ);
  }
  const folge = [...FT.liste, FT.alle];
  const typen = [...typZahl.keys()].sort((a, b) => {
    const ia = folge.indexOf(a), ib = folge.indexOf(b);
    return (ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib) || typZahl.get(b) - typZahl.get(a) || a.localeCompare(b, "de");
  });
  const gruppenFolge = typen.map((t) => offeneTypen.has(t) ? t + " · noch nicht zugeordnet" : t);
  const nOffen = FT.bezeichnungen.filter((b) => !b.typ).length;

  const html = banner() +
    '<div class="kopf"><div><h1>Teile &amp; Montage</h1><p>Einbaukatalog mit Kundenpreisen inklusive Montage, Arbeitswerten, Gewichten und Lagerbestand aus der Artikelverwaltung</p></div>' +
    (imBrowser() ? "" : '<div class="kopf-aktionen nur-programm"><label class="ko-schalter einkauf-schalter" title="Einkaufspreise, Eigenkosten und Spanne einblenden – gilt nur auf diesem Rechner">' +
      '<input type="checkbox" id="teile-einkauf"' + (ek ? " checked" : "") + "> Einkauf anzeigen</label></div>") + "</div>" +
    '<div class="kacheln">' +
      kachel("Positionen im Katalog", zahl(k.positionen), k.gruppen + " Warengruppen") +
      kachel("Fahrzeugtypen", FT.liste.length ? FT.liste.filter((t) => typZahl.has(t)).length + " von " + FT.liste.length : zahl(typen.length),
        nOffen ? nOffen + (nOffen === 1 ? " Bezeichnung" : " Bezeichnungen") + " der Teileliste noch nicht zugeordnet" : "in der Teileliste belegt", nOffen ? "warn" : "") +
      kachel("Artikel im Stamm", zahl(k.artikel), zahl(k.mit_bestand) + " mit Bestand" + (ek ? " · Lagerwert " + eur(k.lagerwert) + " (Stamm-EK)" : "")) +
      kachel("Stundensatz", eur(k.satz), "brutto, aus VK je Arbeitswert") +
      kachel("Preise unter Kalkulation", zahl(zuNiedrig.length), zuNiedrig.length ? "Spalte H kleiner als Spalte I" : "alle Preise passen", zuNiedrig.length ? "warn" : "gut") +
      kachel("Angezeigte Treffer", zahl(treffer.length), f.suche ? "Suche: " + f.suche : "ohne Suchfilter") +
    "</div>" +
    reihe("Gruppierung", [["fahrzeugtyp", "Fahrzeugtyp"], ["warengruppe", "Warengruppe"], ["keine", "ohne"]]
      .map(([k2, l]) => chip(l, f.nach === k2, "nach:" + k2)).join("") +
      chip("Nur mit Lagerbestand", f.nurBestand, "bestand:" + (f.nurBestand ? "" : "1")) +
      (zuNiedrig.length || f.nurUnter ? chip("Nur Preise unter Kalkulation (" + zuNiedrig.length + ")", f.nurUnter, "unter:" + (f.nurUnter ? "" : "1")) : "")) +
    reihe("Warengruppe", chip("Alle", !f.gruppe, "gruppe:") +
      D.katalogFilter.gruppen.slice(0, 12).map((g) => chip(g.warengruppe + " " + g.n, f.gruppe === g.warengruppe, "gruppe:" + g.warengruppe)).join("")) +
    reihe("Fahrzeugtyp", chip("Alle", !f.typ, "typ:") +
      typen.map((t) => offeneTypen.has(t)
        ? chip(t + " " + typZahl.get(t), f.typ === t, "typ:" + t, "typ-offen", "noch nicht zugeordnet")
        : chip(t + " " + typZahl.get(t), f.typ === t, "typ:" + t)).join("")) +
    '<div style="margin-top:12px"><input type="search" id="suche-teile" placeholder="Suche nach Artikel, Nummer, Warengruppe oder Fahrzeugtyp …" value="' + esc(f.suche) + '"></div>' +
    '<div class="gitter">' + karte("Einbaukatalog",
      "Kundenpreis = Teil + Montage, brutto · Artikelnummer führt zu Movera · Überschrift anklicken zum Sortieren" +
        (ek ? " · Einkauf netto, Eigenkosten brutto = (EK netto + Lohn-EK netto) × 1,19" : ""),
      sortTabelle("katalog", spalten, zeilen, { minBreite: ek ? 1680 : 1320, start: { key: "code", richtung: "auf" }, leer: "Kein Artikel gefunden.",
        gruppenFolge: f.nach === "fahrzeugtyp" ? gruppenFolge : null })) + "</div>" +
    (imBrowser() || !FT.bezeichnungen.length ? "" : '<div class="gitter nur-programm" id="typ-zuordnung">' + typZuordnungKarte(FT) + "</div>");

  return { html, nach() {
    document.querySelectorAll("[data-ak-teil]").forEach((b) => b.addEventListener("click", () => {
      const t = D.katalog.find((x) => String(x.sku) === b.dataset.akTeil);
      if (!t || !window.ODIN_AKTIONEN) return;
      window.ODIN_AKTIONEN.dialog({
        titel: "Teil ändern", untertitel: t.name + (t.code ? " · " + t.code : "") + " · bisher " + (t.install_minutes ? zahl(t.install_minutes) + " Min." : "ohne Zeit"),
        aktionen: ["arbeitszeit", "teilpreis", "lagerbestand"], parameter: { sku: String(t.sku) }, satz: t.name,
        vorgaben: { einheit: "Stunden", richtung: "+" },
      });
    }));
    document.querySelectorAll("[data-stueck]").forEach((b) => b.addEventListener("click", () => {
      const id = b.dataset.stueck;
      teileOffen.has(id) ? teileOffen.delete(id) : teileOffen.add(id);
      const huelle = document.querySelector("#inhalt .tab-huelle"), links = huelle ? huelle.scrollLeft : 0, oben = document.getElementById("inhalt").scrollTop;
      zeichne();
      const h = document.querySelector("#inhalt .tab-huelle"); if (h) h.scrollLeft = links;
      document.getElementById("inhalt").scrollTop = oben;
    }));
    document.querySelectorAll("[data-teil]").forEach((b) => b.addEventListener("click", () => {
      const i = b.dataset.teil.indexOf(":");
      const art = b.dataset.teil.slice(0, i), wert = b.dataset.teil.slice(i + 1);   // Typnamen dürfen „:“ enthalten
      if (art === "bestand") teileFilter.nurBestand = Boolean(wert);
      else if (art === "unter") teileFilter.nurUnter = Boolean(wert);
      else if (art === "nach") teileFilter.nach = wert;
      else teileFilter[art] = wert || null;
      zeichne();
    }));
    const schalter = document.getElementById("teile-einkauf");
    if (schalter) schalter.addEventListener("change", () => {
      TEILE_EINKAUF.an = schalter.checked;
      try { cpApi().oberflaeche("teile_einkauf", TEILE_EINKAUF.an).catch(() => {}); } catch (e) { /* nur für diese Sitzung */ }
      zeichne();
    });
    document.querySelectorAll("select[data-typ-alt]").forEach((s) => s.addEventListener("change", async () => {
      const oben = document.getElementById("inhalt").scrollTop;
      s.disabled = true;
      await speichern(() => cpApi().cockpit_aufruf("fahrzeugtyp_zuordnen", [s.dataset.typAlt, s.value]));
      document.getElementById("inhalt").scrollTop = oben;
    }));
    const feld = document.getElementById("suche-teile");
    feld.addEventListener("input", () => {
      clearTimeout(feld._t);
      feld._t = setTimeout(() => { teileFilter.suche = feld.value; zeichne(); setTimeout(() => {
        const neu = document.getElementById("suche-teile");
        if (neu) { neu.focus(); neu.setSelectionRange(neu.value.length, neu.value.length); }
      }, 0); }, 260);
    });
  } };
} };

/** Karte „Fahrzeugtypen zuordnen“: links die Bezeichnungen aus der Teileliste, rechts der feste Typ. Gespeichert wird im
    gemeinsamen Speicher (gilt für alle Rechner); im Browser gibt es die Karte nicht. */
function typZuordnungKarte(FT) {
  const ziele = [...FT.liste, FT.alle];
  const zeilen = FT.bezeichnungen.map((b) => {
    const auswahl = b.herkunft === "gleichnamig"
      ? '<span class="pille gut">' + esc(b.typ) + '</span> <span class="klein">gilt automatisch (gleicher Name)</span>'
      : '<select data-typ-alt="' + esc(b.name) + '" aria-label="' + esc("Fahrzeugtyp für " + b.name) + '">' +
        '<option value=""' + (b.typ ? "" : " selected") + ">– noch nicht zugeordnet –</option>" +
        ziele.map((z) => '<option value="' + esc(z) + '"' + (b.typ === z ? " selected" : "") + ">" + esc(z) + "</option>").join("") + "</select>";
    return "<tr><td>" + esc(b.name) + (b.typ ? "" : ' <span class="pille warn">noch nicht zugeordnet</span>') + '</td><td class="r">' + zahl(b.n) +
      "</td><td>" + auswahl + "</td></tr>";
  });
  return karte("Fahrzeugtypen zuordnen",
    "Abschnitte der Teileliste den festen Typen zuordnen – gilt für alle Rechner. Heißt ein Abschnitt schon wie ein Typ, gilt er automatisch.",
    tabelle(["Bezeichnung in der Teileliste", "~Positionen", "Fahrzeugtyp"], zeilen));
}
const LISTENTYPEN = [
  { art: "bestandsliste", name: "Bestandsliste", ziel: "Fahrzeuge", felder: ["Interne Nr*", "FIN", "Marke", "Modell", "Kategorie", "Modelljahr", "Zustand", "Status", "Standort", "Eingang", "EK netto", "Nebenkosten", "VK netto", "Verkauft netto", "Verkaufsdatum", "Kunde", "Verkäufer", "Bemerkung"] },
  { art: "finanzierungen", name: "Finanzierungen", ziel: "Einkaufsfinanzierung", felder: ["Interne Nr*", "Bank*", "Zinsfrei bis*", "Vertragsnummer", "Finanzierungsbetrag", "Beginn", "Zinssatz", "Laufzeit", "Ablösung bis", "Status"] },
  { art: "finanzplanung", name: "Finanzplanung", ziel: "Liquidität", felder: ["Datum*", "Betrag*", "Art (Ist/Plan)", "Richtung (Ein/Aus)", "Kategorie", "Konto", "Bezeichnung", "Interne Nr"] },
  { art: "provisionen", name: "Provisionen", ziel: "Provisionen", felder: ["Verkäufer*", "Interne Nr", "Verkaufsdatum", "Bemessungsgrundlage", "Satz", "Provision", "Status", "Auszahlungsdatum"] },
  { art: "auslieferungen", name: "Auslieferungen", ziel: "Übergaben", felder: ["Interne Nr*", "Termin", "Ausgeliefert am", "Kunde", "Ort", "Status", "Offene Punkte"] },
  { art: "teilepreise", name: "Teilepreise", ziel: "Teile & Montage", felder: ["Artikelnummer*", "Bezeichnung*", "Warengruppe", "Lieferant", "EK netto", "VK netto", "Montagezeit", "Stundensatz"] },
];

/* --------------------------------------------- Linien und Bestellungen */
/* Dieselbe Logik wie im System (vororder.py): kommende Fahrzeuge aus der Finanzaufstellung
   belasten ab ihrem Termin die Linie, frei wird nur, was verkauft und übergeben ist oder
   wofür eine Ablösung vorgemerkt wurde. */

let vororderFilter = { annahme: "streng", monate: 12 };
let ABLOESUNGEN = new Map();          // interne Nummer -> geplantes Ablösedatum (gespeichert im Ordner „Fahrzeuge“)

const monatsEndeVon = (ym) => { const [j, m] = ym.split("-").map(Number); return new Date(Date.UTC(j, m, 0)).toISOString().slice(0, 10); };
const monateAb = (n) => { const d = new Date(HEUTE); return [...Array(n)].map((_, i) =>
  new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + i, 1)).toISOString().slice(0, 7)); };

function belegungenRechnen(annahme) {
  const ausBestand = D.financings.filter((f) => f.status === "offen").map((f) => {
    const v = fahrzeug(f.vehicle_internal_id) || {};
    const lieferung = D.deliveries.find((d) => d.vehicle_internal_id === f.vehicle_internal_id);
    const verkauft = v.status === "Verkauft" || v.status === "Ausgeliefert";
    const uebergabe = verkauft ? ((lieferung && (lieferung.actual_date || lieferung.planned_date)) || v.sold_date) : null;
    const geplant = ABLOESUNGEN.get(f.vehicle_internal_id);
    let frei = null, grund = "bleibt belegt, bis abgelöst wird";
    if (geplant) { frei = geplant; grund = "Ablösung geplant"; }
    else if (uebergabe) { frei = uebergabe; grund = "verkauft, Übergabe geplant"; }
    else if (annahme === "faellig" && f.due_date) { frei = f.due_date; grund = "spätestes Ablösedatum der Bank"; }
    if (frei && frei < HEUTE) frei = HEUTE;
    return {
      quelle: "bestand", schluessel: f.vehicle_internal_id,
      bezeichnung: ((v.brand || "") + " " + (v.model || "")).trim() || f.vehicle_internal_id,
      bank: f.bank, hersteller: finHersteller(f),
      betrag: f.financed_amount || 0, ab: null, frei_ab: frei, freigabe_grund: grund,
      zins_pct: f.interest_rate_pct, zinsfrei_bis: f.interest_free_until, faellig_am: f.due_date,
    };
  });
  // Kommende Fahrzeuge aus der Finanzaufstellung belasten die Linie ab ihrem groben Termin (ohne Termin: sofort).
  // Früher von Hand eingetragene Vorordern zählen nicht mehr.
  const ausKommend = (D.kommend || []).filter((k) => endlich(k.betrag) > 0).map((k) => ({
    quelle: "kommend", schluessel: "K" + k.id,
    bezeichnung: (k.modell || "Fahrzeug") + " (" + kommendWer(k) + ")",
    bank: k.bank, hersteller: k.hersteller, betrag: k.betrag,
    ab: k.termin_datum || null, frei_ab: null, freigabe_grund: "kommt noch",
    zins_pct: null, zinsfrei_bis: null, faellig_am: null,
  }));
  return [...ausBestand, ...ausKommend];
}

function projektionRechnen(annahme, anzahlMonate) {
  const posten = belegungenRechnen(annahme);
  const linien = new Map();
  for (const l of D.linien) linien.set(l.bank + "||" + l.hersteller, { bank: l.bank, hersteller: l.hersteller, limit_betrag: l.limit_betrag, zins_pct: l.zins_pct });
  for (const p of posten) {
    const k = p.bank + "||" + p.hersteller;
    if (!linien.has(k)) linien.set(k, { bank: p.bank, hersteller: p.hersteller, limit_betrag: null, zins_pct: null });
  }
  const monate = monateAb(anzahlMonate);
  return [...linien.values()].map((l) => {
    const meine = posten.filter((p) => p.bank === l.bank && p.hersteller === l.hersteller);
    const aktiv = (p, tag) => (p.ab === null || p.ab <= tag) && (p.frei_ab === null || p.frei_ab > tag);
    const summe = (tag, quelle) => meine.filter((p) => (!quelle || p.quelle === quelle) && aktiv(p, tag))
      .reduce((s, p) => s + p.betrag, 0);
    const zeilen = monate.map((m) => {
      const tag = monatsEndeVon(m), belegt = summe(tag);
      const frei = l.limit_betrag === null ? null : l.limit_betrag - belegt;
      return { monat: m, belegt, bestand: summe(tag, "bestand"), kommend: summe(tag, "kommend"), frei,
        auslastung: l.limit_betrag ? Math.round((belegt / l.limit_betrag) * 100) : null };
    });
    let engAb = null, engBetrag = 0;
    if (l.limit_betrag) {
      const tage = [...new Set(meine.flatMap((p) => [p.ab, p.frei_ab]).filter(Boolean))]
        .filter((d) => d >= HEUTE && d <= monatsEndeVon(monate[monate.length - 1])).sort();
      for (const tag of [HEUTE, ...tage]) {
        const belegt = summe(tag);
        if (belegt > l.limit_betrag) { engAb = tag; engBetrag = belegt - l.limit_betrag; break; }
      }
    }
    return { ...l, heute_belegt: summe(HEUTE), monate: zeilen, eng_ab: engAb, eng_betrag: engBetrag, posten: meine };
  }).sort((a, b) => (a.eng_ab ? 0 : 1) - (b.eng_ab ? 0 : 1) || b.eng_betrag - a.eng_betrag
    || a.bank.localeCompare(b.bank) || a.hersteller.localeCompare(b.hersteller));
}

function bedarfRechnen(projektion) {
  return projektion.filter((l) => l.eng_ab).map((l) => {
    const tag = l.eng_ab;
    const aktiv = (p) => (p.ab === null || p.ab <= tag) && (p.frei_ab === null || p.frei_ab > tag);
    const kandidaten = l.posten.filter((p) => p.quelle === "bestand" && aktiv(p) && p.frei_ab === null)
      .map((p) => {
        const verzinst = Boolean(p.zinsfrei_bis && p.zinsfrei_bis <= tag);
        return { ...p, laeuft_verzinst: verzinst, zinskosten_monat: verzinst ? (p.betrag * ((p.zins_pct || 0) / 100)) / 12 : 0 };
      })
      .sort((a, b) => Number(b.laeuft_verzinst) - Number(a.laeuft_verzinst)
        || b.zinskosten_monat - a.zinskosten_monat || b.betrag - a.betrag);
    const vorschlag = []; let gedeckt = 0;
    for (const k of kandidaten) { if (gedeckt >= l.eng_betrag) break; vorschlag.push(k); gedeckt += k.betrag; }
    const ausweich = projektion.filter((x) => x.hersteller === l.hersteller && x.bank !== l.bank && x.limit_betrag)
      .map((x) => ({ bank: x.bank, frei: x.limit_betrag - x.posten.filter((p) => (p.ab === null || p.ab <= tag)
        && (p.frei_ab === null || p.frei_ab > tag)).reduce((s, p) => s + p.betrag, 0) }))
      .filter((x) => x.frei > 0).sort((a, b) => b.frei - a.frei);
    const liq = D.cash.find((c) => c.monat === tag.slice(0, 7));
    return { bank: l.bank, hersteller: l.hersteller, stichtag: tag, fehlbetrag: l.eng_betrag,
      limit_betrag: l.limit_betrag, kandidaten: vorschlag, gedeckt,
      kapitalbedarf: vorschlag.reduce((s, k) => s + k.betrag, 0), ausweichlinien: ausweich,
      liquiditaet_monat: liq ? (liq.saldo_ist ?? liq.saldo_plan ?? null) : null };
  });
}

const tonAuslastung = (a) => a === null ? "" : a > 100 ? ' style="background:var(--kritisch-weich);color:var(--kritisch);font-weight:600"'
  : a > 90 ? ' style="background:var(--warnung-weich);color:var(--warnung)"' : a > 75 ? "" : ' class="leise"';

SEITEN.vororder = { label: "Linien & Bestellungen", render() {
  const f = vororderFilter;
  const projektion = projektionRechnen(f.annahme, f.monate);
  const bedarf = bedarfRechnen(projektion);
  const linien = linienSicht();
  const kommend = [...(D.kommend || [])].sort((a, b) => (a.termin_datum || "9").localeCompare(b.termin_datum || "9"));
  const volumen = summe(kommend, (k) => endlich(k.betrag));
  const ueber = linien.filter((l) => l.frei !== null && l.frei < 0);
  const naechste = kommend.find((k) => k.termin_datum && k.termin_datum >= HEUTE) || null;
  const frueheste = bedarf.map((b) => b.stichtag).sort()[0];
  const spalten = projektion[0] ? projektion[0].monate.map((m) => m.monat) : [];
  const linieVon = (bank, hersteller) => linien.find((l) => l.bank === bank && l.hersteller === hersteller);

  const chip = (text, aktiv, aktion) =>
    '<button type="button" class="' + (aktiv ? "aktiv" : "") + '" data-vor="' + esc(aktion) + '">' + esc(text) + "</button>";
  const reihe = (titel, inhalt) =>
    '<div class="filter"><span class="fl-filtertitel">' + titel + "</span>" + inhalt + "</div>";

  // Warnungen: über dem Limit mit allen Bestellungen (ohne Verkäufe gerechnet) bzw. eng laut Monatsrechnung
  const warnungen = linien.filter((l) => (l.frei !== null && l.frei < 0) || bedarf.some((b) => b.bank === l.bank && b.hersteller === l.hersteller)).map((l) => {
    const b = bedarf.find((x) => x.bank === l.bank && x.hersteller === l.hersteller);
    const teile = [];
    if (l.frei !== null && l.frei < 0) {
      const mitBestellt = l.kommend.length === 1 ? "mit dem bestellten Fahrzeug " : "mit den " + zahl(l.kommend.length) + " bestellten Fahrzeugen ";
      teile.push(l.genutzt > l.limit ? "Schon heute " + eur(l.genutzt - l.limit) + " über dem Limit, " + mitBestellt + eur(-l.frei) + "."
        : mitBestellt.charAt(0).toUpperCase() + mitBestellt.slice(1) + eur(-l.frei) + " über dem Limit" +
          (l.kipptBei ? " – es kippt mit " + (l.kipptBei.modell || "einem Fahrzeug") + " (" + (l.kipptBei.termin_text || "ohne Termin") + ")." : "."));
    }
    if (b) teile.push("Auch wenn verkaufte Fahrzeuge abgelöst werden, fehlen ab " + datum(b.stichtag) + " " + eur(b.fehlbetrag) + ".");
    else if (l.frei !== null && l.frei < 0) teile.push("Rechnerisch reicht es nur, wenn verkaufte Fahrzeuge bis zur Lieferung abgelöst sind.");
    return '<li><b>' + esc(l.bank + " · " + l.hersteller) + "</b> " + esc(teile.join(" ")) + "</li>";
  });

  const bedarfKarten = bedarf.map((b) => karte(b.bank + " · " + b.hersteller,
    "Ab " + datum(b.stichtag) + " ist die Linie um " + eur(b.fehlbetrag) + " überzogen – bis dahin muss so viel frei werden",
    '<div class="fl-bedarf">' +
      '<p class="klein">Vorschlag: zuerst ablösen, was bereits Zinsen kostet.' +
      (b.kapitalbedarf ? " Dafür brauchst du bis " + datum(b.stichtag) + " rund <b>" + eur(b.kapitalbedarf) + "</b> Kapital." : "") +
      (b.liquiditaet_monat !== null ? " Planungssaldo im " + esc(monatsLabel(b.stichtag.slice(0, 7))) + ": " + eur(b.liquiditaet_monat) +
        (b.liquiditaet_monat < b.kapitalbedarf
          ? ' <span class="fl-minus">– das reicht nicht, ' + eur(b.kapitalbedarf - b.liquiditaet_monat) + " fehlen.</span>"
          : ' <span class="fl-plus">– das reicht.</span>') : "") + "</p>" +
      (b.gedeckt < b.fehlbetrag
        ? '<p class="klein fl-rest">Selbst wenn du alle ' + zahl(b.kandidaten.length) + " Verträge dieser Linie ablöst, bleiben " +
          eur(b.fehlbetrag - b.gedeckt) + " über dem Limit. Dann hilft nur: Bestellung schieben, auf eine andere Linie legen oder das Limit erhöhen.</p>"
        : "") +
      (b.kandidaten.length
        ? tabelle(["Fahrzeug", "Zustand", "~Betrag", "~Zins", "~kostet im Monat", "Ablösung"], b.kandidaten.map((k) =>
            "<tr><td>" + fzgLink(k.schluessel) + '<div class="klein">' + esc(k.bezeichnung) + "</div></td>" +
            "<td>" + (k.laeuft_verzinst ? '<span class="pille krit">verzinst</span>'
              : '<span class="pille gut">zinsfrei bis ' + datum(k.zinsfrei_bis) + "</span>") + "</td>" +
            '<td class="r">' + eur(k.betrag) + '</td><td class="r leise">' + (k.zins_pct ? zahl(k.zins_pct, 1) + " %" : "–") + "</td>" +
            '<td class="r">' + (k.zinskosten_monat ? '<span class="fl-minus">' + eur(k.zinskosten_monat) + "</span>" : '<span class="klein">–</span>') + "</td>" +
            "<td>" + (ABLOESUNGEN.has(k.schluessel)
              ? '<span class="klein fl-plus">Ablösung ' + datum(ABLOESUNGEN.get(k.schluessel)) +
                ' <button type="button" class="mini" data-abl="' + esc("weg:" + k.schluessel) + '">×</button></span>'
              : '<button type="button" class="mini" data-abl="' + esc("plan:" + k.schluessel + ":" + b.stichtag) + '">Ablösung planen</button>') + "</td></tr>"))
        : '<p class="klein">Kein Vertrag in dieser Linie, den man ablösen könnte.</p>') +
      (b.ausweichlinien.length
        ? '<p class="klein">Andere Linie für ' + esc(b.hersteller) + " mit Luft zum " + datum(b.stichtag) + ": " +
          esc(b.ausweichlinien.map((a) => a.bank + " (" + eur(a.frei) + " frei)").join(" · ")) + "</p>"
        : "") +
    "</div>")).join("");

  // Zeitleiste: was kommt in welchem Monat (grobes Datum aus KW bzw. Zeitraum), ohne Termin zuletzt
  const gruppen = new Map();
  for (const k of kommend) {
    const m = k.termin_datum ? k.termin_datum.slice(0, 7) : "";
    if (!gruppen.has(m)) gruppen.set(m, []);
    gruppen.get(m).push(k);
  }
  const zeitleiste = kommend.length ? '<ol class="fl-zeit">' + [...gruppen.entries()].map(([m, liste]) =>
    '<li class="fl-monat"><div class="fl-monat-kopf"><b>' + (m ? esc(alsDatum(m + "-01T12:00:00", { month: "long", year: "numeric" })) : "ohne Termin") + "</b>" +
      '<span class="klein">' + zahl(liste.length) + (liste.length === 1 ? " Fahrzeug · " : " Fahrzeuge · ") + eur(summe(liste, (k) => endlich(k.betrag))) +
      (m && m < HEUTE.slice(0, 7) ? " · Termin vorbei" : "") + "</span></div>" +
      '<ul class="fl-punkte">' + liste.map((k) => {
        const l = linieVon(k.bank, k.hersteller);
        return '<li><span class="pille' + (l && l.frei !== null && l.frei < 0 ? " krit" : "") + '">' + esc(k.termin_text || "ohne Termin") + "</span>" +
          '<span class="fl-was"><b>' + esc(k.modell || "Fahrzeug") + "</b>" +
          '<span class="klein">' + esc((l && l.linie ? l.linie : k.bank + " · " + k.hersteller) + " · " + kommendWer(k) + (k.konditionen ? " · " + k.konditionen : "")) + "</span></span>" +
          '<span class="fl-betrag">' + (typeof k.betrag === "number" ? eur(k.betrag) : '<span class="pille warn">Betrag fehlt</span>') + "</span></li>";
      }).join("") + "</ul></li>").join("") + "</ol>"
    : '<p class="karte-leer">Keine kommenden Fahrzeuge.<br>Sie stehen in der Finanzaufstellung unten in jedem Linienblatt (Rechnungsdatum als KW oder Zeitraum).</p>';

  const uebersicht = '<div class="fl-kompakt">' + linien.filter((l) => l.hinterlegt || l.kommend.length).map((l) =>
    '<div class="fl-zeile' + (l.frei !== null && l.frei < 0 ? " ueber" : "") + '">' + linienKopf(l, true) + "</div>").join("") + "</div>";

  const matrix = '<div class="tab-wisch">Tabelle seitlich wischen, um alle Monate zu sehen →</div><div class="tab-huelle"><table style="min-width:' + (300 + spalten.length * 74) + 'px"><thead><tr>' +
    '<th>Linie</th><th class="r">Limit</th><th class="r">heute</th>' +
    spalten.map((m) => '<th class="r">' + esc(monatsLabel(m)) + "</th>").join("") + "</tr></thead><tbody>" +
    projektion.map((l) => "<tr><td><b>" + esc(l.hersteller) + '</b><div class="klein">' + esc(l.bank) + "</div></td>" +
      '<td class="r leise">' + (l.limit_betrag ? eur(l.limit_betrag) : "–") + "</td>" +
      '<td class="r">' + eur(l.heute_belegt) + "</td>" +
      l.monate.map((m) => '<td class="r"' + tonAuslastung(m.auslastung) + ' title="' +
        esc(monatsLabel(m.monat) + ": " + eur(m.belegt) + " belegt (Bestand " + eur(m.bestand) + ", kommend " + eur(m.kommend) + ")" +
        (m.frei !== null ? " · " + (m.frei < 0 ? eur(-m.frei) + " über Limit" : eur(m.frei) + " frei") : "")) + '">' +
        (m.auslastung === null ? "–" : zahl(m.auslastung) + " %") + "</td>").join("") + "</tr>").join("") +
    "</tbody></table></div>";

  const alte = D.vorordern || [];
  const altListe = alte.length ? '<details class="fl-alt"><summary>Früher in ODIN eingetragene Vorordern (' + zahl(alte.length) + ") – zählen nicht mehr</summary>" +
    '<p class="klein">Bestellte Fahrzeuge kommen jetzt aus der Finanzaufstellung. Diese Einträge bleiben nur zum Nachlesen; löschen, wenn sie dort stehen.</p>' +
    tabelle(["Liefertermin", "Fahrzeug", "Linie", "~Anzahl", "~EK netto", ""],
      [...alte].sort((a, b) => String(a.liefertermin).localeCompare(String(b.liefertermin))).map((v) =>
        "<tr><td>" + datum(v.liefertermin) + "</td><td>" + esc(v.bezeichnung) + '<div class="klein">' + esc(v.hersteller + " · " + (v.status || "")) + "</div></td>" +
        '<td class="leise">' + esc(v.bank) + '</td><td class="r">' + zahl(v.anzahl) + '</td><td class="r">' + eur(v.ek_netto) + "</td>" +
        '<td class="r"><button type="button" class="mini" data-vorweg="' + esc(v.id) + '">löschen</button></td></tr>')) + "</details>" : "";

  const html = banner() +
    '<div class="kopf"><div><h1>Linien und Bestellungen</h1><p>Was bis wann kommt und ob die Linie dafür reicht. ' +
    "Die bestellten Fahrzeuge stehen in der Finanzaufstellung unten in jedem Linienblatt – ODIN liest sie von dort.</p></div></div>" +
    '<div class="kacheln">' +
      kachel("Kommende Fahrzeuge", zahl(kommend.length), eur(volumen) + " belasten die Linien") +
      kachel("Nächste Lieferung", naechste ? (naechste.termin_text || datum(naechste.termin_datum)) : "–", naechste ? (naechste.modell || "") + " · " + (linieVon(naechste.bank, naechste.hersteller)?.linie || naechste.bank) : "nichts terminiert") +
      kachel("Über dem Limit", zahl(ueber.length) + (ueber.length === 1 ? " Linie" : " Linien"), ueber.length ? eur(summe(ueber, (l) => -l.frei)) + " zu viel, mit allen Bestellungen" : "alle Bestellungen passen", ueber.length ? "krit" : "gut") +
      kachel("Erste Enge", frueheste ? datum(frueheste) : "–", frueheste ? "auch nach Ablösung verkaufter Fahrzeuge" : "nach Monatsrechnung keine", frueheste ? "warn" : "") +
    "</div>" +
    (warnungen.length ? '<div class="fl-warnung" role="status"><b>Hier wird es eng</b><ul>' + warnungen.join("") + "</ul></div>" : "") +
    '<div class="gitter zweidrittel">' +
      karte("Was bis wann kommt", "Nach Monat, grob aus KW oder Zeitraum der Finanzaufstellung", zeitleiste) +
      karte("Linien", "Limit, genutzt, kommend, frei", uebersicht, '<a href="#/finanzierung">Fahrzeuge je Linie</a>') +
    "</div>" +
    (bedarf.length ? '<h2 class="fl-abschnitt">Was hilft</h2>' + reihe("Annahme", chip("nur Verkauf und geplante Ablösungen", f.annahme === "streng", "annahme:streng") +
      chip("auch spätestes Ablösedatum der Bank", f.annahme === "faellig", "annahme:faellig")) + '<div class="gitter">' + bedarfKarten + "</div>" : "") +
    reihe("Zeitraum", [6, 12, 18, 24].map((m) => chip(m + " Monate", f.monate === m, "monate:" + m)).join("")) +
    '<div class="gitter">' + karte("Linienauslastung Monat für Monat",
      "Prozent des Limits · finanzierter Bestand plus kommende Fahrzeuge ab ihrem Termin, verkaufte bis zur Übergabe", matrix) + "</div>" +
    bonusKarte() + altListe;

  return { html, nach() {
    bonusVerdrahten();
    document.querySelectorAll("[data-vor]").forEach((b) => b.addEventListener("click", () => {
      const [art, wert] = b.dataset.vor.split(":");
      vororderFilter[art] = art === "monate" ? Number(wert) : wert;
      zeichne();
    }));
    document.querySelectorAll("[data-abl]").forEach((b) => b.addEventListener("click", () => {
      const [art, id, tag] = b.dataset.abl.split(":");
      if (art === "weg") speichern(() => cpApi().cockpit_abloesung_loeschen(id));
      else {
        const d = new Date(tag); d.setDate(d.getDate() - 7);
        speichern(() => cpApi().cockpit_abloesung_planen(id, d.toISOString().slice(0, 10)));
      }
    }));
    document.querySelectorAll("[data-vorweg]").forEach((b) => b.addEventListener("click", () => {
      if (confirm("Diesen alten Vororder-Eintrag löschen?")) speichern(() => cpApi().cockpit_vororder_loeschen(Number(b.dataset.vorweg)));
    }));
  } };
} };

SEITEN.excel = { label: "Datenquellen", render() {
  const qs = D.quellen || [];
  const eingerichtet = qs.filter((q) => q.pfad).length;
  const zustand = (q) => {
    if (!q.pfad) return '<span class="pille">nicht eingerichtet</span>';
    if (q.fehler) return '<span class="pille krit">' + esc(q.vorhanden ? "nicht lesbar" : "Datei fehlt") + "</span>";
    if ((q.hinweise || []).length) return '<span class="pille warn">' + zahl(q.hinweise.length) + " Hinweis" + (q.hinweise.length === 1 ? "" : "e") + "</span>";
    return '<span class="pille gut">eingelesen</span>';
  };
  const knopf = (aktion, art, text, primaer) => '<button class="btn' + (primaer ? " btn-primaer" : "") + '" data-quelle-aktion="' + aktion + '" data-art="' + esc(art) + '">' + text + "</button>";
  const quelleKarte = (q) => {
    const typ = LISTENTYPEN.find((t) => t.art === q.art) || { felder: [] };
    const zeilen = q.pfad ? '<div class="quelle-datei"><b>' + esc(q.datei) + "</b>" +
        '<span class="leise">' + (q.stand ? "Stand " + datum(q.stand) + (q.uhrzeit ? ", " + esc(q.uhrzeit) : "") : "") +
        (q.gelesen !== null && q.gelesen !== undefined && !q.fehler ? " · " + zahl(q.gelesen) + " Zeilen gelesen, " + zahl(q.geschrieben) + " übernommen" : "") + "</span>" +
        '<span class="pfad mono">' + esc(q.pfad) + "</span></div>"
      : '<div class="quelle-datei leise">' + esc(q.leer || "Noch keine Datei gewählt.") + "</div>";
    const meldungen = (q.fehler ? '<div class="quelle-fehler">' + esc(q.fehler) + "</div>" : "") +
      ((q.hinweise || []).length ? '<ul class="quelle-hinweise">' + q.hinweise.slice(0, 6).map((h) => "<li>" + esc(h) + "</li>").join("") +
        (q.hinweise.length > 6 ? '<li class="leise">… und ' + zahl(q.hinweise.length - 6) + " weitere</li>" : "") + "</ul>" : "");
    return karte(q.name, q.ziel ? "Für: " + q.ziel : null,
      '<div class="qkarte">' + '<div class="quelle-kopf">' + zustand(q) + "</div>" + zeilen + meldungen +
      '<div class="quelle-knoepfe">' + knopf("waehlen", q.art, q.pfad ? "Andere Datei …" : "Datei wählen …", !q.pfad) +
        (q.pfad ? knopf("pruefen", q.art, "Aufbau prüfen") + knopf("oeffnen", q.art, "Öffnen") + knopf("entfernen", q.art, "Entfernen") : "") + "</div>" +
      ((q.verstanden || []).length ? '<details class="quelle-spalten"><summary>Was ODIN verstanden hat</summary><ul class="quelle-verstanden">' +
        q.verstanden.map((h) => "<li>" + esc(h) + "</li>").join("") + "</ul></details>" : "") +
      (typ.felder.length ? '<details class="quelle-spalten"><summary>Welche Spalten ODIN erwartet</summary><div class="felder">' +
        typ.felder.map((f) => "<span>" + esc(f.replace("*", "")) + (f.endsWith("*") ? "<i> *</i>" : "") + "</span>").join("") + "</div></details>" : "") +
      "</div>");
  };
  const sy = D.syscara || {};
  // Microsoft-Konto: Zugang zur Seite „Konto & Anmeldung“ (nicht in der Seitenleiste, die ist voll)
  if (!kontoImBrowser() && !KONTO.st && !KONTO.laedt && !KONTO.fehler) kontoLaden();
  const ko = KONTO.st;
  const kontoKarte = kontoImBrowser() ? "" : karte("Microsoft-Konto",
    !ko ? "" : ko.angemeldet ? "angemeldet als " + ko.name : ko.eingerichtet ? "nicht angemeldet" : "noch nicht eingerichtet",
    '<div style="padding:14px 15px;font-size:13px;color:var(--ink-2);display:grid;gap:9px">' +
    "<div>Mit dem eigenen Microsoft-Konto anmelden: ODIN weiß dann, wer am Rechner sitzt, und schickt dir auf Wunsch jeden Morgen eine Erinnerung ins eigene Postfach.</div>" +
    (ko && ko.angemeldet && ko.erinnerung && ko.erinnerung.an ? '<div class="leise">Tägliche Erinnerung an, ab ' + esc(ko.erinnerung.uhrzeit) + " Uhr</div>" : "") +
    '<div class="quelle-knoepfe"><a class="btn' + (ko && ko.eingerichtet && !ko.angemeldet ? " btn-primaer" : "") + '" href="#/konto">Konto &amp; Anmeldung</a></div></div>');
  const html = (D.quelle === "beispiel" ? banner() : "") +
    '<div class="kopf"><div><h1>Datenquellen</h1><p>Die Excel-Listen bleiben die Quelle – ODIN liest sie bei jedem Öffnen frisch ein und verändert sie nie.</p></div>' +
      '<div class="kopf-aktionen">' + (D.geladen ? '<span class="leise klein">Zuletzt eingelesen ' + esc(D.geladen) + "</span>" : "") +
      '<button class="btn btn-primaer" data-quelle-aktion="neu" data-art="">Jetzt neu einlesen</button></div></div>' +
    '<div class="gitter halb">' +
      karte("So funktioniert es", eingerichtet + " von " + qs.length + " Listen eingerichtet", '<ol class="schritte">' +
        "<li>Für jede Liste einmal die Excel-Datei wählen – am besten direkt im OneDrive-Ordner, dann ist sie auf jedem Rechner aktuell.</li>" +
        "<li>ODIN liest beim Öffnen und mit „Jetzt neu einlesen“ alles neu, auch die Zellfarben (z. B. Fahrzeuge in Bestellung).</li>" +
        "<li>Passt etwas nicht, zeigt die Liste hier Hinweise. „Aufbau prüfen“ speichert einen Bericht nur mit Spaltennamen und Farben – ohne Werte. Den kannst du bedenkenlos weitergeben.</li>" +
        "<li>To-dos und geplante Ablösungen speichert ODIN im Ordner „Fahrzeuge“ – so sehen alle dieselben.</li>" +
        "</ol>") +
      '<div class="dq-stapel">' + karte("Syscara", sy.angemeldet ? "angemeldet als " + esc(sy.benutzer || "") : "nicht angemeldet",
        '<div style="padding:14px 15px;font-size:13px;color:var(--ink-2);display:grid;gap:9px">' +
        "<div>Fehlen in der Bestandsliste Angaben wie FIN, Modell oder Modelljahr, ergänzt ODIN sie aus Syscara. Die Excel-Liste hat immer Vorrang.</div>" +
        (sy.stand ? '<div class="leise">Letzter Abgleich ' + esc(sy.stand) + " · " + zahl(sy.ergaenzt || 0) + " Fahrzeuge ergänzt" + (sy.fehler ? "" : "") + "</div>" : "") +
        (sy.fehler ? '<div class="quelle-fehler">' + esc(sy.fehler) + "</div>" : "") +
        '<div class="quelle-knoepfe">' + (sy.angemeldet ? knopf("syscara", "", "Jetzt aus Syscara ergänzen", true) : "") +
          '<button class="btn" data-quelle-aktion="syscara-zugang" data-art="">' + (sy.angemeldet ? "Zugang ändern" : "Bei Syscara anmelden") + "</button></div></div>") +
      kontoKarte + (window.odinAnmeldung ? window.odinAnmeldung.karte(karte) : "") + "</div>" +
    "</div>" +
    '<div class="gitter halb">' + qs.map(quelleKarte).join("") + "</div>" +
    '<div class="gitter halb">' +
      karte("Was die Listen verbindet", "Die interne Fahrzeugnummer",
        '<div style="padding:14px 15px;font-size:13px;color:var(--ink-2);display:grid;gap:9px">' +
        "<div>Steht dieselbe Nummer in Bestandsliste, Finanzierung, Provision und Auslieferung, führt ODIN die Listen zusammen – erst dann funktionieren Fragen über mehrere Dateien hinweg.</div>" +
        '<div>Schreibweisen gleicht ODIN selbst an: <code>detkw168</code>, <code>DETKW-00168</code> und <code>DETKW 168</code> werden alle zu <span class="mono">DETKW00168</span>.</div>' +
        "<div>Was nicht funktioniert: dasselbe Fahrzeug in zwei Listen unter zwei verschiedenen Nummern.</div></div>") +
      karte("Beispieldaten", D.quelle === "beispiel" ? "laufen gerade" : "aus",
        '<div style="padding:14px 15px;font-size:13px;color:var(--ink-2);display:grid;gap:9px">' +
        "<div>Solange keine Bestandsliste eingerichtet ist, zeigt ODIN erfundene Beispieldaten, damit man sich alles ansehen kann. Sobald eine Liste eingelesen ist, verschwinden sie.</div></div>") +
    "</div>";
  return { html, nach() {
    document.querySelectorAll("#inhalt [data-quelle-aktion]").forEach((b) => b.addEventListener("click", () => quelleAktion(b.dataset.quelleAktion, b.dataset.art, b)));
  } };
} };

async function quelleAktion(aktion, art, knopf) {
  if (aktion === "syscara-zugang") { aktionen.syscaraTexte(); return; }
  knopf.disabled = true;
  try {
    if (aktion === "waehlen") { const r = await cpApi().cockpit_quelle_waehlen(art); if (!r) return; meldung(r.meldung || "Datei übernommen.", r.fehler); }
    else if (aktion === "entfernen") { await cpApi().cockpit_quelle_entfernen(art); meldung("Liste entfernt – die Datei selbst bleibt, wo sie ist."); }
    else if (aktion === "oeffnen") { if (!(await cpApi().cockpit_quelle_oeffnen(art))) meldung("Datei nicht gefunden oder ließ sich nicht öffnen.", true); return; }
    else if (aktion === "pruefen") { const r = await cpApi().cockpit_struktur_speichern(art); if (r) meldung(r.meldung, r.fehler); return; }
    else if (aktion === "syscara") { const r = await cpApi().cockpit_syscara_abgleich(); if (r) meldung(r.meldung, r.fehler); }
    await cockpitLaden(aktion === "neu");
    if (aktion === "neu") meldung("Alle Listen neu eingelesen.");
  } catch (e) {
    meldung(String(e.message || e), true);
  } finally {
    knopf.disabled = false;
  }
}

/* --------------------------------------------------------------- Assistent
   Dasselbe Regelwerk wie im echten System: erkannte Fragemuster werden direkt
   aus den Daten beantwortet. Keine erfundenen Zahlen, kein KI-Aufruf nötig. */
const praefixe = () => new Set(D.vehicles.map((v) => v.internal_id.replace(/[0-9]/g, "")));
const MARKEN = { hersteller1: "Hersteller1", detlef: "Hersteller1", detleffs: "Hersteller1", hersteller4: "Hersteller4", hersteller6: "Hersteller6", hersteller6: "Hersteller6", hersteller5: "Hersteller5", hersteller2: "Hersteller2", hersteller3: "Hersteller3", hersteller3: "Hersteller3" };
const MEHRZAHL = { Reisemobil: "Reisemobile", Wohnwagen: "Wohnwagen", Kastenwagen: "Kastenwagen" };
const KATEGORIEN = { reisemobil: "Reisemobil", reisemobile: "Reisemobil", wohnmobil: "Reisemobil", wohnmobile: "Reisemobil", wohnwagen: "Wohnwagen", caravan: "Wohnwagen", caravans: "Wohnwagen", kastenwagen: "Kastenwagen" };

function findeId(text) {
  for (const m of text.matchAll(/([A-Za-zÄÖÜäöü]{2,8})[\s\-_.]?(\d{2,6})\b/g)) {
    const id = normId(m[1] + m[2]);
    if (praefixe().has(id.replace(/[0-9]/g, ""))) return id;
  }
  return null;
}
function findeTage(f, standard) {
  const t = f.match(/(\d{1,3})\s*(tag|tagen|tage)/); if (t) return +t[1];
  const w = f.match(/(\d{1,2})\s*woche/); if (w) return 7 * +w[1];
  const m = f.match(/(\d{1,2})\s*monat/); if (m) return 30 * +m[1];
  if (/woche/.test(f)) return 7;
  if (/monat/.test(f)) return 30;
  return standard;
}

const ABSAGE = { text: "Zu Finanzzahlen gebe ich hier nur Berechtigten Auskunft.", werkzeug: "vertraulich" };
const WERKSTATT = { text: "Werkstattaufträge laufen über CaraCamp.", werkzeug: "werkstatt" };
const BEIRAT_FRAGE = /\bbeirat|coaching|verkaufstraining|buffett|munger|hormozi|kreuter|wickman|harnish|chris voss|covey|david allen|sinek|zu teuer|einwand|einw(ä|ae)nde|verzettel|wie entscheide|(ü|ue)berlegen|kunde (sagt|meint|will|z(ö|oe)gert)|mitarbeiter liefert|liefert nicht/;
const FINANZFRAGE = /zinsfrei|zinsbindung|zinslos|finanzier|bank|kredit|gekostet|einkauf|eingekauft|\bek\b|netto|brutto|preis|kostet|wert\b|kapital|gebunden|abl(ö|oe)s|abgel(ö|oe)st|tilgung|rate\b|abschlag|liquidit|kontostand|saldo|cashflow|provision|deckungsbeitrag|marge|rohertrag|umsatz|gewinn/;

/* Verbindliche Hausregeln (wie hausregeln.py, gekürzt): gehen jedem Rat vor */
const HAUSREGEL_FRAGE = [
  [/reservier|zur(ü|ue)ck ?(legen|gelegt|stellen|gestellt)|(festhalten|freihalten|zur(ü|ue)ckhalten).{0,40}(fahrzeug|wagen|mobil|wochenende)|(fahrzeug|wagen|mobil|wochenende).{0,40}(festhalten|freihalten|zur(ü|ue)ckhalten)/,
    "Hausregel VERKAUF-002 – Keine Reservierungen (verbindlich, Geschäftsführung): Reservierungen sind nicht vorgesehen – auch nicht übers Wochenende. Einziger Sonderfall: Ein Kunde ruft unmittelbar vor seiner Anfahrt an – dann nur für die konkret bestätigte Fahrtzeit, ohne generellen Anspruch."],
  [/probe ?fahr|test ?fahr|proberunde/,
    "Hausregel VERKAUF-001 – Probefahrt bei Neufahrzeugen (verbindlich, Geschäftsführung): Bei Neufahrzeugen bietet der Verkäufer keine Probefahrt aktiv an. Stattdessen Besichtigung und Beratungsgespräch am Fahrzeug. Fragt der Kunde selbst, die Regel sachlich erklären."],
];

function antwort(frageRoh) {
  const f = frageRoh.toLowerCase();
  const regeln = findeId(frageRoh) ? [] : HAUSREGEL_FRAGE.filter(([m]) => m.test(f)).map(([, t]) => t);
  if (regeln.length) return { werkzeug: "hausregel", ziel: "#/wissen/hausregeln", text: regeln.join("\n\n") + "\nAlle Hausregeln mit Kundenformulierungen: Team & Projekte → Wissen & Einarbeitung → Hausregeln." };
  // Dasselbe wie in ODIN (assistent.py): Werkstatt läuft über CaraCamp, Finanzzahlen nur für Berechtigte.
  // Teilepreise sind Kundenpreise und bleiben erlaubt.
  if (/werkstatt|monteur|ausgelastet|auslastung|kapazit/.test(f)) return WERKSTATT;
  // Rat statt Daten (wie beirat.py): in „Beirat & Coaching“ suchen lassen
  if (!findeId(frageRoh) && BEIRAT_FRAGE.test(f)) {
    return { werkzeug: "beirat", ziel: "#/beirat/suche/" + encodeURIComponent(frageRoh.slice(0, 120)).replace(/[!'()*]/g, (c) => "%" + c.charCodeAt(0).toString(16).toUpperCase()),
      text: "Dazu hat der Beirat Rat aus mehreren Perspektiven – mit nächsten Schritten und Formulierungen. Zu finden unter Team & Projekte → Beirat & Coaching." };
  }
  const teilefrage = /markise|solar|sat\b|antenne|batterie|klima|heizung|kupplung|kamera|träger|traeger|montage|einbau|arbeitszeit/.test(f);
  if (!D.finanzen && !teilefrage && FINANZFRAGE.test(f)) return ABSAGE;
  const id = findeId(frageRoh);
  const marke = Object.keys(MARKEN).find((m) => f.includes(m));
  const kategorie = Object.keys(KATEGORIEN).find((k) => f.includes(k));

  if (id) {
    const v = fahrzeug(id);
    if (!v) return { text: "Zu " + id + " liegt kein Fahrzeug in der Datenbank.", werkzeug: "fahrzeug_details" };
    const fin = offeneFin(id);
    const W = (t) => ({ text: t, werkzeug: "fahrzeug_details", ziel: "#/fahrzeug/" + encodeURIComponent(id) });

    if (/zinsfrei|zinsbindung|zinslos/.test(f)) {
      if (!fin) return W(id + " ist nicht finanziert (Bareinkauf) – es läuft also keine Zinsfreiheit.");
      const rest = tageBis(fin.interest_free_until);
      return W(id + " ist bei " + fin.bank + " zinsfrei bis " + datum(fin.interest_free_until) + " – " +
        (rest >= 0 ? "noch " + tageText(rest) + "." : "das war vor " + tagenDativ(rest) + ", seitdem läuft der Zins von " + zahl(fin.interest_rate_pct, 1) + " % p. a.") +
        " Spätestes Ablösedatum: " + datum(fin.due_date) + ".");
    }
    if (/finanzier|bank|kredit/.test(f)) {
      if (!fin) return W(id + " ist nicht finanziert, das Fahrzeug wurde bar eingekauft.");
      return W(id + " ist bei " + fin.bank + " finanziert (Vertrag " + fin.contract_no + ", " + eur(fin.financed_amount) + "). Zinsfrei bis " +
        datum(fin.interest_free_until) + ", Ablösung spätestens " + datum(fin.due_date) + ", Status " + fin.status + ".");
    }
    if (/gekostet|einkauf|eingekauft|netto|preis|kostet|ek\b/.test(f)) {
      const ein = einstand(v);
      return W(id + " (" + v.brand + " " + v.model + ") hat netto " + eur(v.purchase_net) + " im Einkauf gekostet, mit Nebenkosten (Überführung, Zubehör, Aufbereitung) " +
        eur(v.extra_cost_net) + " sind es " + eur(ein) + ". Brutto " + eur(v.purchase_gross) + ". Listenpreis netto " + eur(v.list_price_net) +
        ", Rohertrag also " + eur((v.list_price_net || 0) - ein) + ".");
    }
    if (/wo steht|standort|platz|halle/.test(f)) {
      return W(id + " steht auf " + (v.location || "keinem hinterlegten Platz") + " (Status " + v.status + ", " + zahl(standtage(v)) + " Standtage).");
    }
    if (/offene punkte|was fehlt|h(ä|ae)ngt|bereit/.test(f)) {
      const z = D.ampel.find((x) => x.vehicle_internal_id === id);
      if (!z) return W(id + ": keine anstehende Übergabe.");
      const offenP = z.punkte.filter((p) => p.status !== "gut");
      return W(id + " am " + datum(z.planned_date) + " an " + z.customer +
        (offenP.length ? ": " + offenP.map((p) => p.label + " (" + p.text + ")").join(", ") : ": alles erledigt."));
    }
    if (/ausgeliefert|auslieferung|übergabe|uebergabe|geliefert/.test(f)) {
      const d = D.deliveries.find((x) => x.vehicle_internal_id === id);
      if (!d) return W("Für " + id + " ist keine Auslieferung geplant (Status " + v.status + ").");
      return W(d.actual_date
        ? id + " wurde am " + datum(d.actual_date) + " an " + d.customer + " (" + d.city + ") ausgeliefert."
        : id + " soll am " + datum(d.planned_date) + " an " + d.customer + " (" + d.city + ") übergeben werden – Status " + d.status +
          (d.checklist_open ? ", offen: " + d.checklist_open : "") + ".");
    }
    if (/standtage|wie lange|steht.*seit/.test(f)) {
      return W(id + " steht seit " + datum(v.arrival_date) + " im Bestand, das sind " + zahl(standtage(v)) + " Standtage.");
    }
    const fz = [id + " – " + v.brand + " " + v.model + " (" + v.category + ", " + v.condition + ", MJ " + v.model_year + ")",
      "Status: " + v.status + (v.location ? ", Standort " + v.location : "") + ", " + zahl(standtage(v)) + " Standtage"];
    if (D.finanzen) fz.push("Einkauf netto: " + eur(v.purchase_net) + " + " + eur(v.extra_cost_net) + " Nebenkosten = " + eur(einstand(v)),
      "Listenpreis netto: " + eur(v.list_price_net),
      fin ? "Finanzierung: " + fin.bank + ", " + eur(fin.financed_amount) + ", zinsfrei bis " + datum(fin.interest_free_until) : "Finanzierung: keine hinterlegt");
    return W(fz.join("\n"));
  }

  if (/wie viele|anzahl|bestand/.test(f) && (marke || kategorie || /bestand/.test(f))) {
    if (/wert|kapital|gebunden/.test(f) && !marke && !kategorie) return D.finanzen ? kennzahlenAntwort() : ABSAGE;
    const treffer = bestand().filter((v) => (!marke || v.brand === MARKEN[marke]) && (!kategorie || v.category === KATEGORIEN[kategorie]));
    const kat = kategorie ? (treffer.length === 1 ? KATEGORIEN[kategorie] : MEHRZAHL[KATEGORIEN[kategorie]]) : null;
    const was = [marke ? MARKEN[marke] : null, kat].filter(Boolean).join(" ") || "Fahrzeuge";
    const nachWert = /wert|kapital|gebunden|einkauf|\bek\b|kostet|gekostet|euro|€/.test(f);
    return { text: treffer.length + " " + was + " im Bestand" + (nachWert && D.finanzen ? ", gebundener Einkaufswert " + eur(summe(treffer, einstand)) : "") + ".",
      werkzeug: "bestand_zaehlen", ziel: "#/bestand" };
  }
  // „Welche Finanzierungen sind noch nicht ausgezahlt?“ – wie ERWARTET_FRAGE in assistent.py; ohne Recht oben schon abgesagt
  if (!/provision/.test(f) && /(nicht|noch).{0,20}ausgezahlt|ausgezahlt.{0,20}(nicht|noch)|auszahlung.{0,20}(bank|offen|aus)|bank.{0,25}(auszahl|zahlt.{0,10}aus)|zahlt.{0,20}bank.{0,15}aus\b|kundenfinanzierung|(zu )?erwartende?n? zahlung|erwartete?n? zahlung|zahlungen?.{0,15}erwart|offene?n? zahlung|zahlungseing(ä|ae)ng|geld.{0,20}(rein|herein)|noch.{0,10}(rein|herein)/.test(f)) {
    if (!D.finanzen) return ABSAGE;
    const nurBank = /finanzier|bank/.test(f), rows = nurBank ? bankOffen() : erwartetOffen();
    if (!rows.length) return { werkzeug: "erwartete_zahlungen", ziel: "#/liquiditaet", text: nurBank
      ? "Keine Finanzierung wartet auf die Auszahlung der Bank." : "Keine offenen zu erwartenden Zahlungen." };
    return { werkzeug: "erwartete_zahlungen", ziel: "#/liquiditaet", text:
      [(nurBank ? rows.length + (rows.length === 1 ? " Finanzierung ist" : " Finanzierungen sind") + " noch nicht ausgezahlt, zusammen "
        : rows.length + (rows.length === 1 ? " Zahlung" : " Zahlungen") + " erwartet, zusammen ") + eur(betragSumme(rows)) + ":",
      ...rows.slice(0, 15).map((e) => "• " + ([e.kunde, e.fahrzeug].filter(Boolean).join(" ") || "–") + (nurBank ? "" : ", " + e.art) +
        (e.bank ? ", " + e.bank : "") + ", " + (geldOk(e.betrag) === null ? "Betrag offen" : eur(geldOk(e.betrag))) +
        (e.erwartet_am ? ", erwartet " + datum(e.erwartet_am) : e.erwartet_text ? ", " + e.erwartet_text : ""))].join("\n") };
  }
  if (/zinsfrei|zinsbindung|l(ä|ae)uf(t|en).*aus|finanzierung.*(aus|ablauf|ende|fällig)|abl(ö|oe)s/.test(f)) {
    const t = findeTage(f, 60), rows = ablaufListe(t);
    if (!rows.length) return { text: "In den nächsten " + t + " Tagen läuft keine zinsfreie Finanzierung aus.", werkzeug: "zinsfrei_ablauf", ziel: "#/finanzierung" };
    const ab = rows.filter((r) => r.rest < 0);
    return { werkzeug: "zinsfrei_ablauf", ziel: "#/finanzierung", text:
      [rows.length + (rows.length === 1 ? " Finanzierung" : " Finanzierungen") + " (" + eur(summe(rows, (r) => r.financed_amount)) + "), davon " +
        ab.length + " bereits abgelaufen und damit verzinst:",
      ...rows.slice(0, 12).map((r) => "• " + r.vehicle_internal_id + " – " + r.bank + ", " + eur(r.financed_amount) + ", zinsfrei bis " +
        datum(r.interest_free_until) + " (" + (r.rest < 0 ? "seit " + tagenDativ(r.rest) + " verzinst" : "noch " + tageText(r.rest)) + ")")].join("\n") };
  }
  if (/zulassung|ausnahme|euro ?6|euro ?vi|zulassungsfrist/.test(f)) {
    if (!D.fristen.length) return { werkzeug: "zulassungsfristen", ziel: "#/finanzierung", text: "Keine Zulassungsfrist läuft im nächsten Jahr ab." };
    return { werkzeug: "zulassungsfristen", ziel: "#/finanzierung", text:
      [D.fristen.length + (D.fristen.length === 1 ? " Fahrzeug" : " Fahrzeuge") + " mit ablaufender Frist:",
      ...D.fristen.map((r) => "• " + r.vehicle_internal_id + " (" + (r.brand || "") + " " + (r.model || "") + "): " +
        r.ausnahme_art + ", Zulassung bis " + datum(r.frist) + " – noch " + r.tage_bis + " Tage")].join("\n") };
  }
  if (/tilgung|rate|abschlag|ratenplan/.test(f)) {
    const summeT = D.tilgungOffen.reduce((s, t) => s + (t.betrag || 0), 0);
    return { werkzeug: "tilgungen", ziel: "#/finanzierung", text:
      [D.tilgungOffen.length + (D.tilgungOffen.length === 1 ? " Rate" : " Raten") + " über " + eur(summeT) + ":",
      ...D.tilgungOffen.slice(0, 12).map((t) => "• " + datum(t.faellig_am) + ": " + t.vehicle_internal_id +
        " – " + eur(t.betrag) + " (" + t.bank + ")")].join("\n") };
  }
  if (/übergabe|uebergabe|offene punkte|was fehlt|h(ä|ae)ngt/.test(f)) {
    const offen = D.ampel.filter((z) => z.offen > 0);
    if (!offen.length) return { werkzeug: "uebergabe_status", ziel: "#/auslieferungen", text: "Alle anstehenden Übergaben sind vorbereitet." };
    return { werkzeug: "uebergabe_status", ziel: "#/auslieferungen", text:
      [offen.length + (offen.length === 1 ? " Übergabe" : " Übergaben") + " mit offenen Punkten:",
      ...offen.slice(0, 12).map((z) => "• " + z.vehicle_internal_id + " am " + datum(z.planned_date) + " an " + z.customer +
        ": " + z.punkte.filter((p) => p.status !== "gut").map((p) => p.label + " (" + p.text + ")").join(", "))].join("\n") };
  }
  if (/liquidit|kontostand|saldo|cashflow|liquide/.test(f)) {
    const tief = Math.min(...D.cash.map((c) => c.saldo_ist ?? c.saldo_plan));
    return { werkzeug: "liquiditaet", ziel: "#/liquiditaet", text:
      [...D.cash.map((c) => "• " + monatsLabel(c.monat) + " (" + (c.ist ? "Ist" : "Plan") + "): ein " + eur(c.ein) + ", aus " + eur(c.aus) +
        ", netto " + eur(c.netto) + ", Saldo " + eur(c.saldo_ist ?? c.saldo_plan)),
      "Tiefster Saldo im Zeitraum: " + eur(tief) + "."].join("\n") };
  }
  if (/provision/.test(f)) {
    const status = /offen/.test(f) ? "offen" : /ausgezahlt|bezahlt/.test(f) ? "ausgezahlt" : null;
    const rows = D.commissions.filter((c) => !status || c.status === status);
    return { werkzeug: "provisionen", ziel: "#/provisionen", text:
      [rows.length + (rows.length === 1 ? " Provision" : " Provisionen") + ", Summe " + eur(summe(rows, (c) => c.amount)) + ":",
      ...rows.slice(0, 12).map((c) => "• " + c.vehicle_internal_id + " – " + c.salesperson + ", " + eur(c.amount) + " (" + zahl(c.rate_pct, 1) + " %), " + c.status)].join("\n") };
  }
  if (/auslieferung|übergabe|uebergabe|liefertermin/.test(f)) {
    const t = findeTage(f, 45), rows = offeneLieferungen(t);
    if (!rows.length) return { text: "Keine offenen Auslieferungen in den nächsten " + t + " Tagen.", werkzeug: "auslieferungen", ziel: "#/auslieferungen" };
    return { werkzeug: "auslieferungen", ziel: "#/auslieferungen", text:
      [rows.length + (rows.length === 1 ? " Auslieferung" : " Auslieferungen") + " geplant:",
      ...rows.map((d) => "• " + datum(d.planned_date) + " – " + d.vehicle_internal_id + " (" + (d.fzg?.brand || "") + " " + (d.fzg?.model || "") +
        ") an " + d.customer + ", " + d.city + ", " + d.status + (d.checklist_open ? ", offen: " + d.checklist_open : ""))].join("\n") };
  }
  if (/markise|solar|sat\b|antenne|batterie|klima|heizung|kupplung|kamera|träger|traeger|montage|einbau|arbeitszeit/.test(f)) {
    const begriff = ["markise", "solar", "sat", "antenne", "batterie", "klima", "heizung", "kupplung", "kamera", "träger"].find((b) => f.includes(b)) || frageRoh;
    const rows = teileMitLohn(begriff).slice(0, 5);
    if (!rows.length) return { text: 'Kein Teil zu "' + begriff + '" gefunden.', werkzeug: "teile_und_montage", ziel: "#/teile" };
    return { werkzeug: "teile_und_montage", ziel: "#/teile", text: rows.map((t) =>
      "• " + t.name + " (" + t.sku + "): Teil " + eur(t.sales_net) + " + Montage " + zahl(t.install_minutes) + " Min = " + eur(t.lohn) +
      " → gesamt " + eur(t.gesamt) + " netto").join("\n") };
  }
  if (/kennzahl|überblick|ueberblick|wie steht|zusammenfassung|bestandswert|deckungsbeitrag|marge/.test(f)) {
    if (D.finanzen) return kennzahlenAntwort();
    const k = kennzahlen();
    return { werkzeug: "kennzahlen", ziel: "#/uebersicht", text: "Bestand: " + k.anzahl + " Fahrzeuge, Ø " + k.standtage + " Standtage." };
  }
  if (marke || kategorie) {
    const treffer = bestand().filter((v) => (!marke || v.brand === MARKEN[marke]) && (!kategorie || v.category === KATEGORIEN[kategorie]));
    return { text: treffer.length + " Fahrzeuge im Bestand.", werkzeug: "bestand_zaehlen", ziel: "#/bestand" };
  }
  return { werkzeug: "hilfe", text:
    ["Diese Frage habe ich nicht sicher verstanden. Ich kenne Fragen wie diese:", ...beispiele().map((b) => "• " + b)].join("\n") };
}

function kennzahlenAntwort() {
  const k = kennzahlen();
  const marken = jeMarke().slice(0, 4).map((m) => m.brand + ": " + m.anzahl).join(", ");
  return { werkzeug: "kennzahlen", ziel: "#/uebersicht", text:
    ["Bestand: " + k.anzahl + " Fahrzeuge, Einkaufswert " + eur(k.wert) + ", Ø " + k.standtage + " Standtage (" + marken + ").",
    "Finanzierung: " + eur(k.finanzierung) + " offen über " + k.vertraege + " Verträge.",
    "Zinsfreiheit läuft in 60 Tagen bei " + k.risikoAnzahl + " Fahrzeugen aus (" + eur(k.risikoVolumen) + ").",
    "Offene Provisionen: " + eur(k.provisionenOffen) + ". Deckungsbeitrag " + HEUTE.slice(0, 4) + ": " + eur(k.db) + " aus " + k.verkauft + " Verkäufen."].join("\n") };
}

/* Beispielnummer aus den echten Daten: ein Fahrzeug mit offener Finanzierung */
const beispielId = () => {
  const f = D.financings.find((x) => x.status === "offen" && fahrzeug(x.vehicle_internal_id));
  return f ? f.vehicle_internal_id : (D.vehicles[0] ? D.vehicles[0].internal_id : "DETKW00168");
};
const beispiele = () => [
  "Wie viele Hersteller2 Kastenwagen habe ich?",
  "Wo steht " + beispielId() + "?",
  "Was kostet eine Markise mit Einbau?",
  "Was hängt bei den nächsten Übergaben noch?",
  "Bei welchen Fahrzeugen läuft die Zulassungsfrist ab?",
  ...(D.finanzen ? ["Wo ist " + beispielId() + " finanziert?", "Bis wann ist " + beispielId() + " zinsfrei?",
    "Was hat " + beispielId() + " netto gekostet?", "Welche Finanzierungen laufen in 30 Tagen aus?",
    "Wie sieht die Liquidität aus?"] : []),
];

/* Wer bekommt Finanzfragen beantwortet? Bis es eine Anmeldung mit Rechten gibt, eine Liste im gemeinsamen Speicher.
   Ändern nur am Rechner; ist die Liste nicht leer, nur von Personen, die selbst darin stehen. */
let finanzPersonen = null;            // [{id, name}] aus den Projekten
let finanzFehler = "";
async function finanzPersonenLaden() {
  if (finanzPersonen) return;
  finanzPersonen = [];
  try {
    const r = await cpApi().projekte_aufruf("personen", []);
    finanzPersonen = r && r.ok && Array.isArray(r.daten) ? r.daten.filter((p) => p && typeof p.id === "string")
      .map((p) => ({ id: p.id, name: String(p.name || p.id) })) : [];
  } catch (e) { finanzPersonen = []; }
  if (seiteAusHash().name === "assistent") zeichne();
}
function finanzKarte() {
  const e = D.assistentFinanzen || { personen: [], aendern: false };
  const frei = new Set(e.personen || []);
  if (!finanzPersonen) finanzPersonenLaden();
  const personen = finanzPersonen || [];
  const namen = personen.filter((p) => frei.has(p.id)).map((p) => p.name);
  const inhalt = e.aendern && personen.length
    ? '<form id="finanz-form" class="finanz-liste">' + personen.map((p) =>
        '<label class="finanz-person"><input type="checkbox" name="p" value="' + esc(p.id) + '"' + (frei.has(p.id) ? " checked" : "") + "> " + esc(p.name) + "</label>").join("") +
      '<div class="finanz-fuss"><button type="submit" class="btn-primaer">Speichern</button>' +
      (finanzFehler ? '<span class="klein" style="color:var(--kritisch)">' + esc(finanzFehler) + "</span>" : "") + "</div></form>"
    : '<p class="finanz-text">' + (namen.length ? esc(namen.join(", ")) : frei.size ? zahl(frei.size) + " Person(en)" : "noch niemand") +
      (e.aendern ? "" : '<span class="klein" style="display:block;margin-top:4px">Ändern kann nur, wer selbst eingetragen ist – und nur am Rechner.</span>') + "</p>";
  return karte("Finanzfragen beantwortet der Assistent für:", null, inhalt +
    '<p class="finanz-text klein">Bis zur Anmeldung mit Rechten ist das nur ein einfacher Schutz: ODIN glaubt der Auswahl „Wer bin ich?“ unter Projekte. Im Browser auf Handy und Tablet gibt es keine Finanzantworten.</p>');
}
let chatVerlauf = [];
let chatKontext = null;          // offene Rückfrage des Assistenten (z. B. „für welches Fahrzeug?“)
let letzterAuftrag = "";         // der Satz, zu dem die letzte Aktion gehört („Ändern“ holt ihn zurück)
let aktionOffen = null;          // offene Rückfrage einer Aktion (In ODIN arbeiten) – die nächste Eingabe ist die Antwort
const AUFTRAG_BEISPIELE = ["Übergabe Schou auf nächsten Freitag 14 Uhr", "Papiere von DWWA00188 sind bei uns",
  "TÜV für DWWA00188 ist erledigt", "Erinner mich morgen an die Zulassung von DRM00245",
  "Arbeitszeit SAT-Anlage Caro Sidetrack 2 Stunden mehr", "Lagerbestand Giba2 auf 5"];

SEITEN.assistent = { label: "Assistent", render() {
  // Finanzfragen zeigt die Oberfläche nur Berechtigten (ODIN schickt sie anderen ohnehin nicht mit)
  const gruppen = D.beispielfragen ? D.beispielfragen.filter((g) => D.finanzen || !g.finanzen) : null;
  const AK = window.ODIN_AKTIONEN;
  const blasen = chatVerlauf.length ? chatVerlauf.map((n, i) => n.aktion && AK
    ? '<div class="blase sys ak-blase" data-ak-blase="' + i + '">' + AK.karte(n.aktion, n.zustand) + "</div>"
    : n.von === "denkt"
    ? '<div class="blase sys denkt" aria-label="Antwort wird gesucht"><i class="skelett" style="width:88%"></i><i class="skelett" style="width:64%"></i><i class="skelett" style="width:40%"></i></div>'
    : n.von === "ich"
    ? '<div class="blase ich">' + esc(n.text) + "</div>"
    : '<div class="blase sys">' + esc(n.text) +
      (n.rueckfrage && n === chatVerlauf[chatVerlauf.length - 1] ? '<div class="rueckfrage">' + n.rueckfrage.optionen.map((o) =>
        '<button type="button" data-antwort="' + esc(o) + '">' + esc(o) + "</button>").join("") +
        (n.rueckfrage.hinweis ? '<span class="klein">' + esc(n.rueckfrage.hinweis) + "</span>" : "") + "</div>" : "") +
      (n.kundentext ? '<div class="kundentext"><div class="kundentext-kopf"><b>Antwort für den Kunden</b><span class="klein">' + esc(n.kundentext_hinweis || "vor dem Senden Maße und Ausführung prüfen") + "</span>" +
        '<button type="button" class="mini" data-kopieren>Kopieren</button></div><textarea readonly rows="4">' + esc(n.kundentext) + "</textarea></div>" : "") +
      (n.werkzeug ? '<div class="quelle"><span class="pille">Datenabfrage</span><span class="mono">' + esc(n.werkzeug) + "</span>" +
        (n.ziel ? '<a href="' + esc(linkOk(n.ziel)) + '" style="color:var(--ink);text-decoration:none;margin-left:auto;border-bottom:1px solid var(--linie-stark)">' + (n.werkzeug === "wegweiser" ? "hingehen" : n.werkzeug === "wissen" ? "öffnen" : n.werkzeug === "beirat" ? "im Beirat ansehen" : n.werkzeug === "hausregel" ? "Hausregeln öffnen" : "im Cockpit ansehen") + "</a>" : "") +
        // Nicht verstanden: die Frage für die Verantwortlichen als Lücke melden (Wissen & Einarbeitung → Offene Fragen)
        (n.werkzeug === "hilfe" && n.frage ? (n.gemeldet ? '<span class="klein" style="margin-left:auto">Als Lücke gemeldet – danke!</span>'
          : '<button type="button" class="mini" data-luecke="' + chatVerlauf.indexOf(n) + '" style="margin-left:auto">Lücke melden</button>') : "") + "</div>" : "") +
      "</div>").join("")
    : '<div class="karte-leer">Stell eine Frage zu Bestand, Übergaben, Terminen oder Teilen' + (D.finanzen ? ", Finanzierung, Liquidität oder Provisionen" : "") + ".<br>Beispiele stehen rechts.</div>";

  const html = banner() +
    '<div class="kopf"><div><h1>Assistent</h1><p>Fragen in normaler Sprache – die Antworten kommen aus den Daten, nicht aus dem Bauch</p></div></div>' +
    '<div class="chat">' +
      '<section class="karte"><div class="verlauf" id="verlauf">' + blasen + "</div>" +
        '<form class="eingabe" id="chat-form"><input type="text" id="chat-eingabe" placeholder="' + esc(aktionOffen ? "Antwort eintippen …" : D.finanzen ? "z. B. Bis wann ist " + beispielId() + " zinsfrei?" : "Fragen oder Auftrag, z. B. Übergabe … auf Freitag 15 Uhr") + '" autocomplete="off">' +
        '<button type="button" class="ak-mikro" id="chat-mikro" aria-label="Sprechen statt tippen" aria-pressed="false"><svg viewBox="0 0 24 24" aria-hidden="true"><rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5.5 11a6.5 6.5 0 0 0 13 0M12 17.5V21"/></svg></button>' +
        '<button type="submit">' + (aktionOffen ? "Antworten" : "Senden") + "</button></form></section>" +
      "<div>" +
        karte("Zum Ausprobieren", (gruppen ? gruppen.reduce((n, g) => n + g.fragen.length, 0) : beispiele().length) + " vorbereitete Fragen",
          (gruppen || [{ bereich: "", fragen: beispiele() }]).map((g) =>
            (g.bereich ? '<div class="beispiel-bereich">' + esc(g.bereich) + "</div>" : "") + '<div class="beispiele">' + g.fragen.map((b) =>
              '<button type="button" data-frage="' + esc(b) + '">' + esc(b) + "</button>").join("") + "</div>").join("")) +
        '<div style="height:14px"></div>' +
        karte("In ODIN arbeiten", "Aufträge ändern Excel und ODIN – erst nach deiner Bestätigung",
          '<div class="beispiele">' + AUFTRAG_BEISPIELE.map((b) => '<button type="button" data-frage="' + esc(b) + '">' + esc(b) + "</button>").join("") + "</div>" +
          '<p class="klein" style="padding:0 15px 12px;margin:0">Vor dem Ausführen prüft ODIN Überschneidungen, Urlaub, Feiertage, Fristen und mehr. Alles steht danach unter <a href="#/aenderungen">Änderungen</a> und lässt sich zurücknehmen.</p>') +
        '<div style="height:14px"></div>' +
        karte("Wie der Assistent arbeitet", null,
          '<div style="padding:13px 15px;font-size:12.5px;color:var(--ink-2)">Bekannte Fragemuster werden direkt aus der Datenbank beantwortet – ohne KI, ohne laufende Kosten. ' +
          "Die Daten bleiben auf diesem Rechner – es wird nichts an einen fremden Dienst geschickt. Fehlt eine Angabe (z. B. das Fahrzeug bei einem Teilepreis), fragt er nach. " +
          "Was er nicht erkennt, sagt er offen – und merkt sich die Frage, damit das Regelwerk gezielt erweitert werden kann („Lücke melden“ hebt sie unter Wissen &amp; Einarbeitung → Offene Fragen nach oben). " +
          "Verbindliche Hausregeln (z. B. Reservierung, Probefahrt) nennt er vor allem anderen. " +
          "Er beantwortet nur, was gefragt ist; Finanzzahlen nennt er nur den unten eingetragenen Personen.</div>") +
        '<div style="height:14px"></div>' + finanzKarte() +
      "</div></div>";

  return { html, nach() {
    const verlauf = document.getElementById("verlauf");
    const feld = document.getElementById("chat-eingabe");
    verlauf.scrollTop = verlauf.scrollHeight;
    // Antworten kommen aus ODINs Regelwerk (Python, lokal); stellt es eine Rückfrage, geht die nächste Eingabe
    // mit dem Zusammenhang dorthin. Fällt die Schnittstelle aus, antwortet das Regelwerk hier im Fenster.
    const fragen = async (text, wahl) => {
      if (!text.trim()) return;
      const kontext = chatKontext;
      chatKontext = null;
      const offen = aktionOffen;
      aktionOffen = null;
      chatVerlauf.push({ von: "ich", text });
      chatVerlauf.push({ von: "denkt" });
      zeichne();
      // Erst fragen, ob es ein Auftrag ist (In ODIN arbeiten) – sonst beantwortet das Regelwerk die Frage
      const AKT = window.ODIN_AKTIONEN;
      if (AKT && (offen || !kontext)) {
        const r = await AKT.verstehen(text, offen ? { rueckfrage: offen, wert: wahl } : null);
        if (r && r.art && r.art !== "keine") {
          chatVerlauf.pop();
          if (!offen) letzterAuftrag = text;
          chatVerlauf.push({ von: "sys", aktion: r, zustand: {}, frage: letzterAuftrag || text });
          if (r.art === "rueckfrage") aktionOffen = r.id;
          zeichne();
          const f = document.getElementById("chat-eingabe"); if (f) f.focus();
          return;
        }
      }
      let a;
      try { a = await cpApi().cockpit_frage(text, kontext); } catch (e) { a = null; }
      if (!a || typeof a.text !== "string") a = antwort(text);
      chatVerlauf.pop();
      chatVerlauf.push({ von: "sys", text: a.text, werkzeug: a.werkzeug === "rueckfrage" ? "" : a.werkzeug, ziel: a.ziel, rueckfrage: a.rueckfrage, kundentext: a.kundentext,
        kundentext_hinweis: a.kundentext_hinweis, frage: text });
      if (a.rueckfrage) chatKontext = a.rueckfrage.kontext;
      zeichne();
      const f = document.getElementById("chat-eingabe"); if (f) f.focus();
    };
    document.querySelectorAll("[data-antwort]").forEach((b) => b.addEventListener("click", () => fragen(b.dataset.antwort)));
    if (AK) {
      document.querySelectorAll("[data-ak-blase]").forEach((el) => {
        const n = chatVerlauf[Number(el.dataset.akBlase)];
        if (n && n.aktion) bindeNeu(el, n);
      });
      AK.mikrofon(feld, document.getElementById("chat-mikro"));
    }
    function bindeNeu(el, n) {
      AK.binde(el, n.aktion, n.zustand, {
        neu: () => { el.innerHTML = AK.karte(n.aktion, n.zustand); bindeNeu(el, n); },
        wahl: (opt) => { aktionOffen = n.aktion.id; fragen(opt.text, opt.wert); },
        aendern: () => { const f = document.getElementById("chat-eingabe"); if (f) { f.value = n.frage || ""; f.focus(); } },
        abgebrochen: () => { if (aktionOffen === n.aktion.id) aktionOffen = null; },
      });
    }
    document.querySelectorAll("[data-luecke]").forEach((b) => b.addEventListener("click", async () => {
      const n = chatVerlauf[Number(b.dataset.luecke)];
      if (!n || !n.frage) return;
      b.disabled = true;
      let r = null;
      try { r = await cpApi().cockpit_aufruf("luecke_melden", [n.frage]); } catch (e) { r = null; }
      if (r && r.ok) { n.gemeldet = true; zeichne(); }
      else { b.disabled = false; b.textContent = "Nicht gemeldet – nochmal?"; }
    }));
    document.querySelectorAll("[data-kopieren]").forEach((b) => b.addEventListener("click", async () => {
      const feld = b.closest(".kundentext").querySelector("textarea");
      try { await navigator.clipboard.writeText(feld.value); } catch (e) { feld.select(); document.execCommand("copy"); }
      b.textContent = "Kopiert"; setTimeout(() => { b.textContent = "Kopieren"; }, 1600);
    }));
    document.getElementById("chat-form").addEventListener("submit", (e) => { e.preventDefault(); fragen(feld.value); });
    document.querySelectorAll("[data-frage]").forEach((b) => b.addEventListener("click", () => fragen(b.dataset.frage)));
    const ff = document.getElementById("finanz-form");
    if (ff) ff.addEventListener("submit", async (e) => {
      e.preventDefault();
      const ids = [...ff.querySelectorAll("input[name=p]:checked")].map((x) => x.value);
      let r = null;
      try { r = await cpApi().cockpit_aufruf("assistent_finanzen", [ids]); } catch (err) { r = null; }
      finanzFehler = r && r.ok ? "" : (r && r.fehler) || "Speichern hat nicht geklappt.";
      if (r && r.ok) { chatVerlauf = []; await cockpitLaden(false); } else zeichne();
    });
    if (chatVerlauf.length) feld.focus();
  } };
} };

/* ------------------------------------------------------------ Navigation
   Die Seitenleiste ist fest in index.html. Cockpit-Seiten zeichnet diese Datei
   nach #inhalt, die bisherigen ODIN-Bereiche (ABs, Ausstattung, Preisschilder,
   Fahrzeugordner) schaltet zeigeBereich() aus abs.js. */
const ODIN_BEREICHE = ["abs", "ausstattung", "preisschilder", "fahrzeuge"];
const STANDARD = "uebersicht";

function seiteAusHash() {
  const teile = (location.hash || "#/" + STANDARD).slice(2).split("/");
  // Alles nach dem Seitennamen geht weiter, z. B. „#/projekt/<id>/liste“ – sonst ginge „/liste“ verloren
  const klar = (t) => { try { return decodeURIComponent(t); } catch (e) { return ""; } };   // „%“ allein ist keine gültige Kodierung
  return { name: teile[0], rest: teile.slice(1).map(klar).join("/") };
}

function menueMarkieren(name) {
  document.querySelectorAll(".seitenleiste a[data-seite]").forEach((a) => {
    const aktiv = a.dataset.seite === name || (name === "fahrzeug" && a.dataset.seite === "bestand") || (name === "konto" && a.dataset.seite === "excel");
    a.classList.toggle("aktiv", aktiv);
    if (aktiv) a.setAttribute("aria-current", "page"); else a.removeAttribute("aria-current");
  });  const titel = document.querySelector(".mobil-titel");
  if (titel) {
    const aktiv = document.querySelector(".seitenleiste a.aktiv span:not(.zahl)");
    titel.textContent = aktiv ? aktiv.textContent : (SEITEN[name] && SEITEN[name].label) || "ODIN";
  }
  if (typeof leisteEinpassen === "function") requestAnimationFrame(() => leisteEinpassen());
}

/* ------------------------------------------------- Seitenleiste: Gruppen einklappen
   Ein Klick auf die Überschrift klappt eine Gruppe ein oder aus (je Rechner gemerkt). Reicht die Höhe nicht, klappt
   ODIN von unten her Gruppen ein, in denen man gerade nicht ist – gescrollt wird nie. Eingeklappte Gruppen mit
   offenen Zählern bekommen einen Punkt, damit nichts untergeht. In schmalen Fenstern (nur Symbole) steht eine
   eingeklappte Gruppe als „•••“ da und öffnet sich per Klick. */
const LEISTE = { zu: new Set(), auto: new Set(), geladen: false, laeuft: false };
const leisteSchmal = () => matchMedia("(max-width: 1180px)").matches;

function leisteGruppen() {
  const menue = document.querySelector(".seite-menue");
  if (!menue) return [];
  const gruppen = [];
  let aktuell = null;
  for (const el of menue.children) {
    if (el.classList.contains("seite-gruppe")) { aktuell = { kopf: el, name: el.dataset.name || el.textContent.trim(), teile: [] }; gruppen.push(aktuell); }
    else if (aktuell) aktuell.teile.push(el);
  }
  return gruppen;
}

function leisteVorbereiten() {
  document.querySelectorAll(".seite-menue span.seite-gruppe").forEach((sp) => {
    const knopf = document.createElement("button");
    knopf.type = "button";
    knopf.className = "seite-gruppe";
    knopf.dataset.name = sp.textContent.trim();
    knopf.setAttribute("aria-expanded", "true");
    knopf.innerHTML = '<span class="gruppe-name">' + esc(knopf.dataset.name) + '</span><svg class="gruppe-pfeil" viewBox="0 0 24 24" aria-hidden="true"><path d="m8 10 4 4 4-4"/></svg>';
    sp.replaceWith(knopf);
    knopf.addEventListener("click", () => {
      const name = knopf.dataset.name;
      if (knopf.getAttribute("aria-expanded") === "true") { LEISTE.zu.add(name); LEISTE.auto.delete(name); }
      else { LEISTE.zu.delete(name); LEISTE.auto.delete(name); LEISTE.offenGewollt = name; }
      try { cpApi().oberflaeche("leiste_zu", [...LEISTE.zu]); } catch (e) { /* ohne Schnittstelle nur für diese Sitzung */ }
      leisteEinpassen();
    });
  });
  addEventListener("resize", () => leisteEinpassen());
  // Projekt-Links kommen später dazu (projekte.js) – dann neu einpassen
  const links = document.getElementById("projekt-links");
  if (links) new MutationObserver(() => requestAnimationFrame(() => leisteEinpassen())).observe(links, { childList: true });
}

function leisteSetzen(g, offen) {
  g.kopf.setAttribute("aria-expanded", String(offen));
  g.teile.forEach((el) => el.classList.toggle("eingeklappt", !offen));
  const zahlVersteckt = !offen && g.teile.some((el) => { const z = el.querySelector(".zahl"); return z && !z.hidden && z.textContent.trim(); });
  g.kopf.classList.toggle("hat-zahl", zahlVersteckt);
}

function leisteEinpassen() {
  if (LEISTE.laeuft) return;
  LEISTE.laeuft = true;
  try {
    const menue = document.querySelector(".seite-menue");
    const gruppen = leisteGruppen();
    if (!menue || !gruppen.length) return;
    const enthaeltAktiv = (g) => g.teile.some((el) => el.matches("a.aktiv") || el.querySelector("a.aktiv"));
    LEISTE.auto.clear();
    gruppen.forEach((g) => leisteSetzen(g, !LEISTE.zu.has(g.name) || enthaeltAktiv(g)));
    const passt = () => menue.scrollHeight <= menue.clientHeight + 1;
    for (const g of [...gruppen].reverse()) {
      if (passt()) break;
      if (enthaeltAktiv(g) || g.name === LEISTE.offenGewollt || g.kopf.getAttribute("aria-expanded") === "false") continue;
      LEISTE.auto.add(g.name);
      leisteSetzen(g, false);
    }
    // Zweiter Durchgang: was danach wieder Platz hat, von oben her erneut aufklappen
    for (const g of gruppen) {
      if (!LEISTE.auto.has(g.name)) continue;
      leisteSetzen(g, true);
      if (passt()) LEISTE.auto.delete(g.name); else leisteSetzen(g, false);
    }
  } finally {
    LEISTE.laeuft = false;
  }
}

async function leisteLaden() {
  if (LEISTE.geladen) return;
  LEISTE.geladen = true;
  try { const zu = await cpApi().oberflaeche("leiste_zu"); if (Array.isArray(zu)) LEISTE.zu = new Set(zu); } catch (e) { /* Standard: alles offen */ }
  leisteEinpassen();
}
leisteVorbereiten();

const EXTERN = window.ODIN_SEITEN = window.ODIN_SEITEN || {};

// Kein Klick verlässt die Oberfläche: Links im Fenster gehen nur zu eigenen Seiten (#…). Alles andere braucht
// target="_blank" (öffnet der Standardbrowser) – sonst passiert nichts. Schutz, falls doch einmal fremdes HTML
// in die Seite gerät; das Programm selbst bricht fremde Seitenwechsel zusätzlich ab.
const linkWaechter = (e) => {
  const a = e.target && e.target.closest ? e.target.closest("a[href], area[href]") : null;
  if (!a) return;
  const ziel = a.getAttribute("href") || "";
  if (ziel.startsWith("#")) return;
  if (e.type === "click" && a.target === "_blank" && /^https?:\/\//i.test(ziel)) return;
  e.preventDefault();
};
document.addEventListener("click", linkWaechter, true);
document.addEventListener("auxclick", linkWaechter, true);        // Mittelklick öffnet sonst am Wächter vorbei
document.addEventListener("submit", (e) => { if (e.target && e.target.getAttribute && e.target.getAttribute("action")) e.preventDefault(); }, true);

function zeichne() {
  try { zeichneSeite(); } catch (e) {                 // ein Fehler in einer Seite darf nie eine weiße Fläche hinterlassen
    console.error(e);
    const inhalt = document.getElementById("inhalt");
    if (inhalt) {
      inhalt.hidden = false;
      inhalt.innerHTML = '<div class="laden-fehler"><h1>Diese Seite ließ sich nicht anzeigen</h1><p>Die Daten dafür sind unvollständig oder beschädigt. ' +
        'Andere Bereiche funktionieren weiter.</p><p class="klein">' + esc(String(e && e.message || e).slice(0, 200)) + '</p>' +
        '<a class="btn btn-primaer" href="#/' + STANDARD + '">Zur Übersicht</a></div>';
    }
  }
}

function zeichneSeite() {
  const { name: gewuenscht, rest } = seiteAusHash();
  if (ODIN_BEREICHE.includes(gewuenscht)) { zeigeBereich(gewuenscht); return; }
  if (Object.hasOwn(EXTERN, gewuenscht)) {        // z. B. Projekte: eigene Daten, kein Cockpit-Datenpaket nötig
    const seite = EXTERN[gewuenscht];
    const inhalt = document.getElementById("inhalt");
    document.getElementById("odin-bereiche").hidden = true;
    inhalt.hidden = false;
    menueMarkieren(seite.menue ? seite.menue(rest) : gewuenscht);
    const e = seite.render(rest);
    inhalt.innerHTML = e.html;
    if (e.nach) e.nach();
    tipWeg();
    return;
  }
  const name = Object.hasOwn(SEITEN, gewuenscht) ? gewuenscht : STANDARD;
  const inhalt = document.getElementById("inhalt");
  document.getElementById("odin-bereiche").hidden = true;
  inhalt.hidden = false;
  menueMarkieren(name);
  zaehlerSetzen();
  if (!D) {
    inhalt.innerHTML = cpFehler ? '<div class="laden-fehler"><h1>Cockpit konnte nicht geladen werden</h1><p>' + esc(cpFehler) +
      '</p><button class="btn btn-primaer" data-neu-laden>Nochmal versuchen</button></div>' : '<div class="laden" aria-label="Daten werden eingelesen"><i class="skelett" style="width:40%"></i><i class="skelett"></i><i class="skelett" style="width:70%"></i><p class="leise">Excel-Listen werden eingelesen …</p></div>';
    const n = inhalt.querySelector("[data-neu-laden]");
    if (n) n.addEventListener("click", () => cockpitLaden(true));
    return;
  }
  const ergebnis = SEITEN[name].render(rest);
  inhalt.innerHTML = ergebnis.html;
  [...inhalt.children].forEach((el, i) => el.style.setProperty("--i", Math.min(i, 8)));
  inhalt.querySelectorAll(".dash > *").forEach((el, i) => el.style.setProperty("--i", Math.min(i + 2, 14)));
  if (ergebnis.nach) ergebnis.nach();
  sortierungAktivieren();
  tipWeg();
}

function zaehlerSetzen() {
  const z = document.getElementById("zaehler");
  if (!z) return;
  if (!D) { z.textContent = ""; return; }
  z.innerHTML = D.quelle === "beispiel" ? "<b>Beispieldaten</b>" : "Stand <b>" + esc(datum(HEUTE)) + "</b>";
}

/* ----------------------------------------------- Spotlight unter der Maus
   Karten bekommen die Mausposition als --mx/--my; v3.css malt daraus Lichtkegel und leuchtenden Rand.
   Ein Listener für alles, höchstens einmal je Bild – nur bei echter Maus. */
(() => {
  if (!matchMedia("(hover: hover) and (pointer: fine)").matches) return;
  // Dieselbe Mausposition treibt auch das Licht im Hintergrund (.rahmen, --bx/--by) und in der Seitenleiste (--sx/--sy)
  let ziel = null, x = 0, y = 0, geplant = false, ueberLeiste = false;
  const rahmen = document.querySelector(".rahmen"), leiste = document.querySelector(".seitenleiste");
  addEventListener("pointermove", (e) => {
    const t = e.target instanceof Element ? e.target : null;
    ziel = t ? t.closest(".cp .karte, .cp .ag-tag, .cp .pj-karte") : null;
    ueberLeiste = !!(t && leiste && leiste.contains(t));
    x = e.clientX; y = e.clientY;
    if (geplant) return;
    geplant = true;
    requestAnimationFrame(() => {
      geplant = false;
      if (ziel) {
        const r = ziel.getBoundingClientRect();
        ziel.style.setProperty("--mx", Math.round(x - r.left) + "px");
        ziel.style.setProperty("--my", Math.round(y - r.top) + "px");
      }
      if (rahmen) {
        const r = rahmen.getBoundingClientRect();
        rahmen.style.setProperty("--bx", Math.round(x - r.left) + "px");
        rahmen.style.setProperty("--by", Math.round(y - r.top) + "px");
        rahmen.classList.toggle("maus-da", !ueberLeiste);
      }
      if (leiste && ueberLeiste) {
        const r = leiste.getBoundingClientRect();
        leiste.style.setProperty("--sx", Math.round(x - r.left) + "px");
        leiste.style.setProperty("--sy", Math.round(y - r.top) + "px");
      }
    });
  }, { passive: true });
  document.documentElement.addEventListener("pointerleave", () => { if (rahmen) rahmen.classList.remove("maus-da"); });
})();

/* ------------------------------------------------------- Daten aus ODIN */
const cpApi = () => {
  if (!window.pywebview || !window.pywebview.api) throw new Error("Programm-Schnittstelle nicht bereit");
  return window.pywebview.api;
};
let cpFehler = "";

function meldung(text, fehler = false) {
  if (typeof zeigeMeldung === "function") zeigeMeldung(text, fehler ? "x" : "check", fehler);
}

function datenUebernehmen(daten) {
  D = daten && typeof daten === "object" ? daten : {};
  // Fällt im Programm ein Teil aus (z. B. eine beschädigte gemeinsame Datei), kommt dafür null – die Seiten
  // rechnen aber mit Listen. Dann lieber leer anzeigen als gar nichts.
  for (const feld of ["fristen", "todos", "vororder", "abloesungen", "quellen", "beispielfragen", "bonusRoh", "fristVorlagen", "fristKategorien", "erwartet", "raster"]) {
    if (!Array.isArray(D[feld])) D[feld] = [];
  }
  HEUTE = D.stichtag;
  const fz = document.getElementById("fristen-zahl");
  if (fz) {
    const n = (D.fristen || []).filter((f) => f.zustand === "ueberfaellig").length;
    fz.textContent = n ? String(n) : ""; fz.hidden = !n;
  }
  const cz = document.getElementById("cashback-zahl");
  if (cz) {
    const k = D.cashback && D.cashback.kennzahlen;
    const n = k ? k.zaehler : 0;
    cz.textContent = n ? String(n) : ""; cz.hidden = !n;
    cz.title = n ? [k.fristen_ueberfaellig ? k.fristen_ueberfaellig + " Frist(en) abgelaufen" : "", k.fristen_bald ? k.fristen_bald + " Frist(en) bald" : "",
      k.nachhaken ? k.nachhaken + "× nachhaken" : ""].filter(Boolean).join(", ") : "";
  }
  ABLOESUNGEN = new Map((D.abloesungen || []).map((a) => [a.internal_id, a.datum]));
  cpFehler = "";
}

async function cockpitLaden(neu = false) {
  await dashLaden();
  await teileEinkaufLaden();
  try {
    datenUebernehmen(await cpApi().cockpit_daten(!!neu));
  } catch (e) {
    cpFehler = String(e.message || e);
  }
  if (!ODIN_BEREICHE.includes(seiteAusHash().name)) zeichne();
}

/* Änderungen (To-dos, Vorordern, Ablösungen) speichert ODIN; danach frisch zeichnen. */
async function speichern(aufruf) {
  try {
    const r = await aufruf();
    if (r && r.fehler) { meldung(r.fehler, true); return; }
    datenUebernehmen(await cpApi().cockpit_daten(false));
    zeichne();
  } catch (e) {
    meldung(String(e.message || e), true);
  }
}

(() => {
  const darf = matchMedia("(pointer: fine)").matches && !matchMedia("(prefers-reduced-motion: reduce)").matches;
  if (!darf) return;
  let ziel = null, rahmen = 0;
  addEventListener("pointermove", (ev) => {
    const knopf = document.documentElement.dataset.stil !== "v3" && ev.target.closest && ev.target.closest(".btn-primaer");
    if (ziel && ziel !== knopf) { ziel.style.transform = ""; ziel = null; }
    if (!knopf) return;
    ziel = knopf;
    cancelAnimationFrame(rahmen);
    rahmen = requestAnimationFrame(() => {
      const r = knopf.getBoundingClientRect();
      const dx = ((ev.clientX - r.left) / r.width - .5) * 6, dy = ((ev.clientY - r.top) / r.height - .5) * 4;
      knopf.style.transform = "translate(" + dx.toFixed(1) + "px," + dy.toFixed(1) + "px)";
    });
  }, { passive: true });
})();

addEventListener("hashchange", () => { zeichne(); document.getElementById("inhalt").scrollTop = 0; scrollTo({ top: 0 }); });
// Beim Zurückkehren ins Fenster: geänderte Excel-Listen nachladen (ODIN liest nur, was sich geändert hat)
let zuletztGeprueft = 0;
addEventListener("focus", () => {
  if (!D || Date.now() - zuletztGeprueft < 60000) return;
  zuletztGeprueft = Date.now();
  cockpitLaden(false);
});
window.cockpitNeuLaden = cockpitLaden;
// Nach dem Syscara-Dialog (An-/Abmelden) die Datenquellen-Seite auffrischen
const sdlg = document.getElementById("dialog-syscara");
if (sdlg) sdlg.addEventListener("close", () => { if (seiteAusHash().name === "excel") cockpitLaden(false); });
window.cockpitZeichne = zeichne;
window.cockpitLeisteEinpassen = leisteEinpassen;   // z. B. nach einem neuen Zähler in einer eingeklappten Gruppe
// Sofort die Übersicht (mit Ladeanzeige) zeigen, Daten kommen, sobald ODIN bereit ist
if (!location.hash) history.replaceState(null, "", "#/" + STANDARD);
if (!ODIN_BEREICHE.includes(seiteAusHash().name)) zeichne();
function cockpitStart() {
  if (ODIN_BEREICHE.includes(seiteAusHash().name)) zeichne();
  zuletztGeprueft = Date.now();
  cockpitLaden(false);
}
if (window.pywebview && window.pywebview.api) cockpitStart(); else addEventListener("pywebviewready", cockpitStart, { once: true });
if (window.pywebview && window.pywebview.api) leisteLaden(); else addEventListener("pywebviewready", leisteLaden, { once: true });
})();
