/* In ODIN arbeiten: Satz → (Rückfrage) → Vorschau → Ausführen → Rückgängig.
   - Der Fragen-Assistent (cockpit.js) fragt zuerst hier, ob der Satz ein Auftrag ist (ODIN_AKTIONEN.verstehen).
   - Vorschaukarten (Excel-Zellen alt → neu, ODIN-Seite, Hinweise des Gehirns) zeichnet karte(), binde() verdrahtet sie.
   - Knöpfe in Tabellen (Auslieferungen, Teile) öffnen einen Dialog mit denselben Aktionen (dialog()).
   - Seite „Änderungen“ (#/aenderungen): Protokoll mit Filter und Rückgängig.
   - Live: alle 4 Sekunden fragt die Oberfläche nach der Datenversion und zeichnet sich bei Änderungen neu.
   Sicherheit: jeder Text geht durch esc(); ausgeführt wird nur ein Entwurf, den ODIN selbst gebaut hat (Kennung). */
(() => {
"use strict";

const esc = (s) => String(s ?? "").replace(/[&<>"'`]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;", "`": "&#96;" }[c]));
const api = () => {
  if (!window.pywebview || !window.pywebview.api) throw new Error("Programm-Schnittstelle nicht bereit");
  return window.pywebview.api;
};
async function ruf(aktion, args) {
  const r = await api().aktionen_aufruf(aktion, args || []);
  if (!r || !r.ok) { const e = new Error((r && r.fehler) || "Das hat nicht geklappt."); e.geaendert = !!(r && r.geaendert); throw e; }
  return r.daten;
}
const imBrowser = () => !!(window.pywebview && window.pywebview.web);
const melde = (text, fehler) => { if (typeof window.zeigeMeldung === "function") window.zeigeMeldung(text, fehler ? "x" : "check", fehler); };
const neuLaden = () => { if (typeof window.cockpitNeuLaden === "function") return window.cockpitNeuLaden(false); };

const SCHWERE = { kritisch: "Kritisch", warnung: "Bitte prüfen", info: "Hinweis" };
const ICON = {
  excel: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8l-5-5Zm0 0v5h5"/><path d="m9.5 12.5 4 4m0-4-4 4"/></svg>',
  odin: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="3" width="7" height="8" rx="1.5"/><rect x="14" y="3" width="7" height="5" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="11" width="7" height="10" rx="1.5"/></svg>',
  pfeil: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12h14M13 6l6 6-6 6"/></svg>',
  mikro: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5.5 11a6.5 6.5 0 0 0 13 0M12 17.5V21"/></svg>',
  haken: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>',
  zurueck: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4.5 12a7.5 7.5 0 1 0 2.2-5.3"/><path d="M4.5 3.5v3.2h3.2"/></svg>',
};

/* ------------------------------------------------------------------------------------------ Katalog */
const KAT = { daten: null, laedt: null };
function katalog() {
  if (KAT.daten) return Promise.resolve(KAT.daten);
  if (!KAT.laedt) KAT.laedt = ruf("katalog", []).then((d) => { KAT.daten = d; return d; }).catch(() => { KAT.laedt = null; return null; });
  return KAT.laedt;
}
const aktionInfo = (kennung) => (KAT.daten && KAT.daten.aktionen || []).find((a) => a.kennung === kennung) || null;

async function verstehen(text, kontext) {
  try { return await ruf("verstehen", [text, kontext || null]); }
  catch (e) { return { art: "fehler", text: String(e.message || e) }; }
}

/* ------------------------------------------------------------------------------------------ Karte */
function tabelleExcel(r) {
  if (!r.zellen || !r.zellen.length) return "";
  return '<div class="ak-block"><div class="ak-ort">' + ICON.excel + "<span><b>Excel</b> · " + esc(r.liste || "Liste") +
    (r.datei ? ' <span class="ak-leise">(' + esc(r.datei) + ")</span>" : "") + "</span></div>" +
    '<div class="ak-tabwrap"><table class="ak-tab"><thead><tr><th>Zelle</th><th>Feld</th><th>bisher</th><th aria-hidden="true"></th><th>neu</th></tr></thead><tbody>' +
    r.zellen.map((z) => "<tr><td class=\"ak-mono\">" + esc((z.blatt ? z.blatt + "!" : "") + z.adresse) + "</td><td>" + esc(z.label) + '<span class="ak-adr">' + esc((z.blatt ? z.blatt + "!" : "") + z.adresse) + "</span>" +
      (z.formel ? ' <span class="ak-pille">Formel</span>' : "") + '</td><td class="ak-alt">' + esc(z.alt) + '</td><td class="ak-pfeil" aria-label="wird zu">' + ICON.pfeil +
      '</td><td class="ak-neu">' + esc(z.neu) + "</td></tr>").join("") + "</tbody></table></div></div>";
}
function tabelleOdin(r) {
  if (!r.odin || !r.odin.length) return "";
  return '<div class="ak-block"><div class="ak-ort">' + ICON.odin + "<span><b>ODIN</b> · sofort sichtbar</span></div>" +
    '<div class="ak-tabwrap"><table class="ak-tab"><tbody>' + r.odin.map((o) => "<tr><td>" + esc(o.was) + '</td><td class="ak-alt">' + esc(o.alt || "") +
      '</td><td class="ak-pfeil" aria-hidden="true">' + (o.alt ? ICON.pfeil : "") + '</td><td class="ak-neu">' + esc(o.neu) + "</td></tr>").join("") + "</tbody></table></div></div>";
}
function hinweiseHtml(liste) {
  if (!liste || !liste.length) return '<p class="ak-ok">' + ICON.haken + "Das Gehirn hat nichts zu bemängeln.</p>";
  return '<ul class="ak-hinweise">' + liste.map((h) => '<li class="ak-h ak-h-' + esc(h.schwere) + '"><span class="ak-h-art">' + esc(SCHWERE[h.schwere] || "Hinweis") +
    "</span><b>" + esc(h.titel) + "</b> " + esc(h.text) + "</li>").join("") + "</ul>";
}
function karte(r, z) {
  z = z || {};
  if (!r) return "";
  if (r.art === "fehler") return '<div class="ak-karte ak-fehlerkarte"><p>' + esc(r.text) + "</p></div>";
  if (r.art === "rueckfrage") {
    const aktiv = !z.beantwortet;
    return '<div class="ak-karte ak-frage">' + (r.titel ? '<div class="ak-kopf"><span class="ak-pille">Aktion</span><b>' + esc(r.titel) + "</b></div>" : "") +
      "<p>" + esc(r.frage) + "</p>" +
      (r.optionen && r.optionen.length ? '<div class="ak-optionen">' + r.optionen.map((o, i) =>
        '<button type="button" data-ak="wahl" data-i="' + i + '"' + (aktiv ? "" : " disabled") + (z.gewaehlt === i ? ' class="gewaehlt"' : "") + ">" + esc(o.text) +
        (o.hinweis ? "<small>" + esc(o.hinweis) + "</small>" : "") + "</button>").join("") + "</div>" : "") +
      (r.frei && aktiv ? '<p class="ak-leise">' + (r.optionen && r.optionen.length ? "Oder unten eintippen" : "Bitte unten eintippen") +
        (r.platzhalter ? " – " + esc(r.platzhalter) : "") + ".</p>" : "") +
      (aktiv ? '<div class="ak-knoepfe"><button type="button" class="ak-knopf leise" data-ak="abbrechen">Abbrechen</button></div>' : "") + "</div>";
  }
  if (r.art !== "vorschau") return "";
  const phase = z.phase || "vorschau";
  const kopf = '<div class="ak-kopf"><span class="ak-pille">' + esc(r.bereich || "Aktion") + "</span><b>" + esc(r.titel) + "</b>" +
    (r.schwere ? '<span class="ak-ampel ak-ampel-' + esc(r.schwere) + '" title="' + esc(SCHWERE[r.schwere] || "") + '"></span>' : "") + "</div>";
  let fuss = "";
  if (phase === "vorschau" || phase === "laeuft") {
    const sperre = phase === "laeuft" ? " disabled" : "";
    const weg = r.weg_text ? '<p class="ak-weg">Schreibweg: <b>' + esc(r.weg_text) + "</b>" +
      (r.andere_wege && r.andere_wege.length ? ' <details><summary>warum nicht anders?</summary><ul>' + r.andere_wege.map((w) =>
        "<li><b>" + esc(w.titel) + ":</b> " + esc(w.grund) + "</li>").join("") + "</ul></details>" : "") + "</p>" : "";
    fuss = weg + (r.ausfuehrbar
      ? (r.trotzdem_noetig ? '<label class="ak-trotz"><input type="checkbox" data-ak="trotz"' + (z.trotz ? " checked" : "") + sperre +
          "> Ich habe die kritischen Hinweise gelesen und will trotzdem ausführen.</label>" : "") +
        '<div class="ak-knoepfe"><button type="button" class="ak-knopf primaer" data-ak="ausfuehren"' +
          (r.trotzdem_noetig && !z.trotz ? " disabled" : "") + sperre + ">" + (phase === "laeuft" ? "Wird ausgeführt …" : r.trotzdem_noetig ? "Trotzdem ausführen" : "Ausführen") + "</button>" +
        (z.aendern !== false ? '<button type="button" class="ak-knopf" data-ak="aendern"' + sperre + ">Ändern</button>" : "") +
        '<button type="button" class="ak-knopf leise" data-ak="abbrechen"' + sperre + ">Abbrechen</button></div>"
      : '<p class="ak-grund">' + esc(r.grund || "Das lässt sich hier nicht ausführen.") + "</p>" +
        '<div class="ak-knoepfe">' + (z.aendern !== false ? '<button type="button" class="ak-knopf" data-ak="aendern">Ändern</button>' : "") +
        '<button type="button" class="ak-knopf leise" data-ak="abbrechen">Schließen</button></div>') +
      (z.fehler ? '<p class="ak-grund" role="alert">' + esc(z.fehler) + "</p>" : "");
  } else if (phase === "fertig") {
    fuss = '<div class="ak-erledigt">' + ICON.haken + "<span>" + esc(z.ergebnis && z.ergebnis.text || "Erledigt.") + "</span>" +
      (z.ergebnis && z.ergebnis.rueckgaengig && !imBrowser() ? '<button type="button" class="ak-knopf" data-ak="rueckgaengig">' + ICON.zurueck + "Rückgängig</button>" : "") + "</div>" +
      (z.fehler ? '<p class="ak-grund" role="alert">' + esc(z.fehler) + "</p>" : "");
  } else if (phase === "zurueck") {
    fuss = '<div class="ak-erledigt ak-zurueck">' + ICON.zurueck + "<span>" + esc(z.text || "Rückgängig gemacht.") + "</span></div>";
  } else if (phase === "abgebrochen") {
    fuss = '<p class="ak-leise">Abgebrochen – nichts geändert.</p>';
  }
  const klein = phase === "abgebrochen";
  return '<div class="ak-karte ak-' + esc(r.schwere || "ok") + (klein ? " ak-klein" : "") + '">' + kopf +
    '<p class="ak-satz">' + esc(r.zusammenfassung) + "</p>" +
    (klein ? "" : tabelleExcel(r) + tabelleOdin(r) + hinweiseHtml(r.hinweise)) + fuss + "</div>";
}

/* Knöpfe einer Karte. h: {neu() zeichnen, wahl(option), aendern(), fertig(ergebnis)} */
function binde(el, r, z, h) {
  if (!el || !r) return;
  el.querySelectorAll("[data-ak]").forEach((b) => {
    const art = b.dataset.ak;
    if (art === "trotz") { b.addEventListener("change", () => { z.trotz = b.checked; h.neu(); }); return; }
    b.addEventListener("click", async () => {
      if (art === "wahl") { z.beantwortet = true; z.gewaehlt = Number(b.dataset.i); h.neu(); h.wahl && h.wahl(r.optionen[Number(b.dataset.i)]); return; }
      if (art === "abbrechen") {
        z.phase = "abgebrochen"; z.beantwortet = true;
        try { await ruf("abbrechen", [r.id]); } catch (e) { /* abgelaufen – egal */ }
        h.neu(); h.abgebrochen && h.abgebrochen(); return;
      }
      if (art === "aendern") { z.phase = "abgebrochen"; h.neu(); h.aendern && h.aendern(); return; }
      if (art === "ausfuehren") {
        z.phase = "laeuft"; z.fehler = ""; h.neu();
        try {
          z.ergebnis = await ruf("ausfuehren", [r.id, !!z.trotz]);
          z.phase = "fertig";
          h.neu();
          await neuLaden();
          h.fertig && h.fertig(z.ergebnis);
        } catch (e) {
          z.phase = "vorschau"; z.fehler = String(e.message || e); h.neu();
        }
        return;
      }
      if (art === "rueckgaengig") {
        b.disabled = true;
        try {
          const d = await ruf("rueckgaengig", [z.ergebnis.eintrag]);
          z.phase = "zurueck"; z.text = d.text; h.neu(); await neuLaden();
        } catch (e) { z.fehler = String(e.message || e); h.neu(); }
      }
    });
  });
}

/* ---------------------------------------------------------------------------------------- Mikrofon */
function mikrofon(feld, knopf) {
  if (!feld || !knopf) return;
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  const hinweis = "Diktieren: Windows-Taste + H drücken (Windows-Spracheingabe), dann sprechen.";
  if (!SR) {
    knopf.title = hinweis;
    knopf.classList.add("ak-ohne");
    knopf.addEventListener("click", () => { melde(hinweis, false); feld.focus(); });
    return;
  }
  let rec = null;
  knopf.title = "Sprechen statt tippen (Deutsch)";
  knopf.addEventListener("click", () => {
    if (rec) { rec.stop(); return; }
    try { rec = new SR(); } catch (e) { melde(hinweis, false); return; }
    rec.lang = "de-DE"; rec.interimResults = true; rec.continuous = false;
    const vorher = feld.value ? feld.value.trimEnd() + " " : "";
    rec.onresult = (ev) => { feld.value = vorher + [...ev.results].map((x) => x[0].transcript).join(""); };
    rec.onerror = () => { melde("Spracheingabe ging nicht. " + hinweis, false); };
    rec.onend = () => { rec = null; knopf.classList.remove("an"); knopf.setAttribute("aria-pressed", "false"); feld.focus(); };
    knopf.classList.add("an"); knopf.setAttribute("aria-pressed", "true");
    try { rec.start(); } catch (e) { rec = null; knopf.classList.remove("an"); melde(hinweis, false); }
  });
}

/* ------------------------------------------------------------------------------------------ Dialog
   Für Knöpfe in Tabellen: feste Angaben (z. B. welche Übergabe), wählbare Aktionen, Felder je Aktion. */
let DLG = null;
function dialogElement() {
  if (DLG) return DLG;
  DLG = document.createElement("dialog");
  DLG.className = "dialog ak-dialog";
  DLG.setAttribute("aria-labelledby", "ak-dialog-titel");
  document.body.appendChild(DLG);
  DLG.addEventListener("close", () => { DLG.innerHTML = ""; });
  return DLG;
}
function feldHtml(f, wert) {
  const id = "ak-f-" + f.name;
  const label = '<span class="feld-label">' + esc(f.label || f.name) + "</span>";
  if (f.typ === "wahl") {
    return '<div class="feld">' + label + '<div class="ak-wahl" role="group">' + (f.optionen || []).map((o, i) =>
      '<label><input type="radio" name="' + esc(f.name) + '" value="' + esc(o) + '"' + ((wert ?? f.optionen[0]) === o ? " checked" : "") + "><span>" +
      esc((f.texte && f.texte[i]) || o) + "</span></label>").join("") + "</div></div>";
  }
  const typ = { date: "date", time: "time", zahl: "text", text: "text" }[f.typ] || "text";
  return '<label class="feld" for="' + id + '">' + label + '<input id="' + id + '" name="' + esc(f.name) + '" type="' + typ + '"' +
    (f.typ === "zahl" ? ' inputmode="decimal"' : "") + ' value="' + esc(wert ?? "") + '" autocomplete="off"></label>';
}
async function dialog(o) {
  const d = dialogElement();
  await katalog();
  const kennungen = (o.aktionen || []).filter((k) => aktionInfo(k));
  if (!kennungen.length) { melde("Diese Aktionen gibt es hier nicht (Rechte?).", true); return; }
  const st = { kennung: kennungen.length === 1 ? kennungen[0] : null, r: null, z: {} };
  const zeichneDlg = () => {
    const info = st.kennung ? aktionInfo(st.kennung) : null;
    let inhalt;
    if (!info) {
      inhalt = '<div class="ak-menue">' + kennungen.map((k) => { const a = aktionInfo(k);
        return '<button type="button" data-k="' + esc(k) + '"><b>' + esc(a.titel) + "</b><small>" + esc(a.beschreibung) + "</small></button>"; }).join("") + "</div>";
    } else if (!st.r) {
      inhalt = '<form class="ak-form" novalidate>' + (info.felder || []).map((f) => feldHtml(f, (o.vorgaben || {})[f.name])).join("") +
        (info.felder && info.felder.length ? "" : '<p class="ak-leise">' + esc(info.beschreibung) + "</p>") +
        '<div class="dialog-fuss">' + (kennungen.length > 1 ? '<button type="button" class="knopf" data-zurueck>Zurück</button>' : "") +
        '<span class="vorschau"></span><button type="button" class="knopf" data-schliessen>Abbrechen</button>' +
        '<button type="submit" class="knopf primaer">Vorschau</button></div></form>';
    } else {
      inhalt = '<div class="ak-dlg-karte">' + karte(st.r, { ...st.z, aendern: true }) + "</div>" +
        (st.z.phase === "fertig" || st.z.phase === "zurueck" || st.r.art === "fehler" ? '<div class="dialog-fuss"><span class="vorschau"></span><button type="button" class="knopf primaer" data-schliessen>Fertig</button></div>' : "");
    }
    d.innerHTML = '<div class="ak-dlg"><div class="dialog-kopf"><h2 id="ak-dialog-titel">' + esc(info ? info.titel : (o.titel || "Ändern")) + "</h2>" +
      "<p>" + esc(o.untertitel || "") + "</p></div>" + inhalt + "</div>";
    d.querySelectorAll("[data-schliessen]").forEach((b) => b.addEventListener("click", () => d.close()));
    const zur = d.querySelector("[data-zurueck]");
    if (zur) zur.addEventListener("click", () => { st.kennung = null; zeichneDlg(); });
    d.querySelectorAll("[data-k]").forEach((b) => b.addEventListener("click", () => { st.kennung = b.dataset.k; zeichneDlg(); }));
    const form = d.querySelector(".ak-form");
    if (form) {
      form.addEventListener("submit", async (ev) => {
        ev.preventDefault();
        const parameter = { ...(o.parameter || {}) };
        new FormData(form).forEach((v, k) => { if (String(v).trim() !== "") parameter[k] = String(v).trim(); });
        const knopf = form.querySelector("[type=submit]");
        knopf.disabled = true; knopf.textContent = "Prüfe …";
        st.r = await verstehen(o.satz || "", { aktion: st.kennung, parameter });
        if (st.r.art === "rueckfrage" && st.r.optionen && st.r.optionen.length === 0) st.r = { art: "fehler", text: st.r.frage };
        st.z = {};
        zeichneDlg();
      });
      const erstes = form.querySelector("input:not([type=radio])");
      if (erstes) setTimeout(() => erstes.focus(), 30);
    }
    const kk = d.querySelector(".ak-dlg-karte");
    if (kk && st.r) binde(kk, st.r, st.z, {
      neu: zeichneDlg,
      wahl: async (opt) => { st.r = await verstehen(opt.text, { rueckfrage: st.r.id, wert: opt.wert }); st.z = {}; zeichneDlg(); },
      aendern: () => { st.r = null; st.z = {}; zeichneDlg(); },
      abgebrochen: () => d.close(),
    });
  };
  zeichneDlg();
  if (!d.open) d.showModal();
}

/* ------------------------------------------------------------------------------------ Änderungen */
const PR = { daten: null, laedt: false, fehler: "", filter: { bereich: "", status: "", suche: "" }, offen: new Set() };
async function protokollLaden() {
  PR.laedt = true;
  try { PR.daten = await ruf("liste", [{ bereich: PR.filter.bereich, status: PR.filter.status, suche: PR.filter.suche }]); PR.fehler = ""; }
  catch (e) { PR.fehler = String(e.message || e); }
  PR.laedt = false;
  PR.zeit = Date.now();
  if (seite() === "aenderungen" && typeof window.cockpitZeichne === "function") window.cockpitZeichne();
}
const seite = () => (location.hash || "").slice(2).split("/")[0];
const zeitText = (iso) => { if (!iso) return ""; const d = new Date(iso); return isNaN(d) ? iso : d.toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit", year: "numeric" }) + ", " + d.toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit" }) + " Uhr"; };
const STATUS = { ausgefuehrt: ["ausgeführt", "gut"], rueckgaengig: ["rückgängig gemacht", ""], rueckgaengig_von: ["Rückgängig", ""], fehlgeschlagen: ["fehlgeschlagen", "krit"], teilweise: ["teilweise", "warn"] };
function seiteAenderungen() {
  const f = PR.filter;
  const liste = PR.daten ? PR.daten.eintraege : [];
  const bereiche = PR.daten ? PR.daten.bereiche : [];
  const zeilen = liste.map((e) => {
    const [st, ton] = STATUS[e.status] || [e.status || "", ""];
    const offen = PR.offen.has(e.id);
    return '<li class="ak-eintrag' + (offen ? " offen" : "") + '"><button type="button" class="ak-eintrag-kopf" data-auf="' + esc(e.id) + '" aria-expanded="' + offen + '">' +
      '<span class="ak-zeit">' + esc(zeitText(e.am)) + "</span><span class=\"ak-was\"><b>" + esc(e.titel) + "</b><span>" + esc(e.zusammenfassung || "") + "</span></span>" +
      '<span class="ak-wer">' + esc(e.von_name || e.von || "–") + '</span><span class="pille ' + ton + '">' + esc(st) + "</span></button>" +
      (offen ? '<div class="ak-eintrag-inhalt">' + (e.satz ? '<p class="ak-leise">„' + esc(e.satz) + "“</p>" : "") +
        tabelleExcel({ zellen: e.zellen, liste: e.liste || "Liste", datei: e.dateiname }) + tabelleOdin(e) +
        (e.hinweise && e.hinweise.length ? hinweiseHtml(e.hinweise) : "") +
        '<p class="ak-weg">Schreibweg: <b>' + esc(e.weg_text || "–") + "</b>" + (e.fehler ? ' · <span style="color:var(--kritisch)">' + esc(e.fehler) + "</span>" : "") + "</p>" +
        (e.rueckgaengig_moeglich && !imBrowser() ? '<div class="ak-knoepfe"><button type="button" class="ak-knopf" data-rueck="' + esc(e.id) + '">' + ICON.zurueck + "Rückgängig machen</button></div>" : "") +
        "</div>" : "") + "</li>";
  }).join("");
  const html = '<div class="kopf"><div><h1>Änderungen</h1><p>Was in ODIN gearbeitet wurde – mit Datei, Zelle, alt und neu. Jede Aktion lässt sich zurücknehmen, solange niemand die Zelle inzwischen geändert hat.</p></div></div>' +
    '<form class="ak-filter" id="ak-filter"><input type="search" name="suche" placeholder="Suchen (Kunde, Fahrzeug, Datei, Person)" value="' + esc(f.suche) + '">' +
    '<select name="bereich" aria-label="Bereich"><option value="">Alle Bereiche</option>' + bereiche.map((b) => '<option' + (f.bereich === b ? " selected" : "") + ">" + esc(b) + "</option>").join("") + "</select>" +
    '<select name="status" aria-label="Status"><option value="">Alle</option><option value="ausgefuehrt"' + (f.status === "ausgefuehrt" ? " selected" : "") + '>ausgeführt</option><option value="rueckgaengig"' + (f.status === "rueckgaengig" ? " selected" : "") + ">rückgängig gemacht</option></select></form>" +
    (PR.fehler ? '<p class="ak-grund">' + esc(PR.fehler) + "</p>" : "") +
    (PR.daten ? (liste.length ? '<ul class="ak-protokoll">' + zeilen + "</ul>" : '<div class="karte-leer">Noch keine Änderungen' + (f.suche || f.bereich || f.status ? " zu diesem Filter" : "") + ". Im Assistenten zum Beispiel: „Verschieb die Übergabe von … auf Freitag 15 Uhr“.</div>")
      : '<div class="laden"><i class="skelett"></i><i class="skelett" style="width:70%"></i></div>') +
    (PR.daten && PR.daten.ordner ? '<p class="ak-leise ak-ablage">Abgelegt unter ' + esc(PR.daten.ordner) + "</p>" : "");
  return { html, nach() {
    const form = document.getElementById("ak-filter");
    let warte = 0;
    if (form) form.addEventListener("input", () => {
      clearTimeout(warte);
      warte = setTimeout(() => { const fd = new FormData(form); PR.filter = { suche: String(fd.get("suche") || ""), bereich: String(fd.get("bereich") || ""), status: String(fd.get("status") || "") }; protokollLaden(); }, 250);
    });
    if (form) form.addEventListener("submit", (e) => e.preventDefault());
    document.querySelectorAll("[data-auf]").forEach((b) => b.addEventListener("click", () => {
      const id = b.dataset.auf; if (PR.offen.has(id)) PR.offen.delete(id); else PR.offen.add(id); window.cockpitZeichne();
    }));
    document.querySelectorAll("[data-rueck]").forEach((b) => b.addEventListener("click", async () => {
      b.disabled = true;
      try { const d = await ruf("rueckgaengig", [b.dataset.rueck]); melde(d.text, false); await neuLaden(); }
      catch (e) { melde(String(e.message || e), true); }
      protokollLaden();
    }));
  } };
}
window.ODIN_SEITEN = window.ODIN_SEITEN || {};
window.ODIN_SEITEN.aenderungen = { render: () => { if (!PR.laedt && Date.now() - (PR.zeit || 0) > 5000) protokollLaden(); return seiteAenderungen(); },
  menue: () => "aenderungen" };

/* ------------------------------------------------------------------------------------------- Live */
const LIVE = { version: null, stand: 0, alter: 0, neu: false, fehler: "" };
function liveAnzeige() {
  let el = document.getElementById("ak-live");
  const z = document.getElementById("zaehler");
  if (!el && z && z.parentNode) {
    el = document.createElement("span");
    el.id = "ak-live"; el.className = "ak-live"; el.setAttribute("aria-live", "off");
    z.parentNode.insertBefore(el, z.nextSibling);
  }
  if (!el || !LIVE.stand) return;
  const s = Math.max(0, Math.round((Date.now() - LIVE.stand) / 1000) + (LIVE.alter || 0));
  el.innerHTML = LIVE.neu ? '<button type="button" data-ak-neu>Neue Daten – anzeigen</button>'
    : '<i class="ak-punkt' + (LIVE.fehler ? " aus" : "") + '"></i>live · ' + (s < 5 ? "gerade eingelesen" : "eingelesen vor " + (s < 60 ? s + " s" : Math.round(s / 60) + " min"));
  el.title = LIVE.fehler ? "Überwachung: " + LIVE.fehler : "ODIN beobachtet die Excel-Listen und liest Änderungen von selbst neu ein.";
  const b = el.querySelector("[data-ak-neu]");
  if (b) b.addEventListener("click", async () => { LIVE.neu = false; await neuLaden(); liveAnzeige(); });
}
const beschaeftigt = () => {
  const a = document.activeElement;
  return !!(document.querySelector("dialog[open]") || (a && /^(INPUT|TEXTAREA|SELECT)$/.test(a.tagName) && a.value));
};
async function livePruefen() {
  if (document.hidden || !window.pywebview || !window.pywebview.api) return;
  let st = null;
  try { st = await api().cockpit_aufruf("live_stand", []); } catch (e) { st = null; }
  if (!st || typeof st.version !== "number") return;
  LIVE.fehler = st.fehler || "";
  if (LIVE.version === null) { LIVE.version = st.version; LIVE.stand = Date.now(); LIVE.alter = st.alter || 0; liveAnzeige(); return; }
  if (st.version !== LIVE.version) {
    LIVE.version = st.version;
    if (beschaeftigt()) LIVE.neu = true;
    else { await neuLaden(); LIVE.neu = false; if (seite() === "aenderungen") protokollLaden(); }
    LIVE.stand = Date.now(); LIVE.alter = 0;
  }
  liveAnzeige();
}
window.odinLive = livePruefen;
const liveStart = () => { livePruefen(); setInterval(livePruefen, 4000); setInterval(liveAnzeige, 1000); };
if (window.pywebview && window.pywebview.api) liveStart(); else addEventListener("pywebviewready", liveStart, { once: true });

window.ODIN_AKTIONEN = { verstehen, karte, binde, dialog, mikrofon, katalog, aktionInfo, neuLaden };
if (seite() === "aenderungen" && typeof window.cockpitZeichne === "function") window.cockpitZeichne();
})();
