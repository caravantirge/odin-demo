/* ODIN · Anmeldebildschirm „Tresor“
   Reihenfolge: Tresor zu → Person wählen → PIN eingeben → erst dann öffnet sich der Tresor. Geprüft wird auf dem
   Rechner (tresor_aufruf → tirge_helfer/tresor.py), nicht hier – die Oberfläche zeigt nur, was der Server sagt.
   - Programm: Person + PIN (beim ersten Mal: PIN festlegen und wiederholen) oder Microsoft-Anmeldung (konto_aufruf,
     ersetzt die PIN, sobald das Konto mit der Person verknüpft ist).
   - Browser (Handy & Tablet): erst die Nummer (Server), dann Person + PIN. Abmelden beendet die Sitzung des Geräts
     (POST /abmelden), die automatische Sperre vergisst nur die Person.
   - Das Drehrad dreht je Ziffer und rastet ein – bewusst nicht auf die Ziffer selbst (sonst ließe sich die PIN über
     die Schulter am Rad ablesen). Falsch: Rad ruckelt zurück, Punkte schütteln; gesperrt: Countdown.
   Ablauf beim Start: Ist schon jemand angemeldet (gemerkte Anmeldung, Microsoft), kurz „Willkommen zurück“ (≈1,2 s),
   höchstens einmal am Tag die volle Öffnung (≈2,7 s). Sonst Personenwahl. Jede Bewegung ist per Klick, Enter,
   Leertaste oder Esc sofort zu Ende.
   Einstellungen (Animation immer / einmal am Tag / aus, Klickgeräusche) liegen im Programm in den Einstellungen dieses
   Rechners (oberflaeche „anmeldung“), im Browser auf dem Gerät. Gestaltung: anmeldung.css. */
(() => {
"use strict";

const $ = (s, w = document) => w.querySelector(s);
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const reduziert = () => matchMedia("(prefers-reduced-motion: reduce)").matches;
const feineMaus = () => matchMedia("(hover: hover) and (pointer: fine)").matches;
const imWeb = () => !!(window.pywebview && window.pywebview.web);
const vorschau = () => !!(window.pywebview && window.pywebview.vorschau);
const kontoMoeglich = () => !imWeb() && !vorschau();
const heute = () => { const d = new Date(); return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0"); };
const farbe = (f) => (typeof window.odinFarbeOk === "function" ? window.odinFarbeOk(f || "#5B7083") : (/^#[0-9a-f]{6}$/i.test(f || "") ? f : "#5B7083"));

const STANDARD = { animation: "tag", ton: false, zuletzt: "", letzte: "" };
const ANIMATIONEN = { immer: "Immer", tag: "Einmal am Tag", aus: "Aus" };
const SPEICHER = "odin-anmeldung";

const A = {
  el: null, tafel: null,
  zustand: "laden",       // laden · wahl · oeffnet · weg · schliesst
  start: null,            // tresor_aufruf status: {ich, ich_fest, personen (mit pin, warten, rest), einstellungen, …}
  pin: null,              // PIN-Eingabe: {id, modus: pruefen · neu1 · neu2 · verknuepfen, erst, sperreBis, timer}
  warten: [],             // odinAnmelden(): wer auf eine Anmeldung wartet
  konto: null,            // konto_aufruf status (nur im Programm)
  einst: { ...STANDARD },
  winkel: 0,              // Stellung des Drehrads (Grad)
  lauf: null,             // laufende Bewegung {anims, ende, uebersprungen}
  beschaeftigt: false,
  poll: 0,
  leerlauf: null,         // Rad dreht langsam, solange Microsoft antwortet
  meldung: "",
};

/* ------------------------------------------------------------------ Schnittstelle */
const api = () => { if (!window.pywebview || !window.pywebview.api) throw new Error("Programm-Schnittstelle nicht bereit"); return window.pywebview.api; };
async function ruf(aktion, ...args) {
  const r = await api().projekte_aufruf(aktion, args);
  if (!r || !r.ok) throw new Error((r && r.fehler) || "Das hat nicht geklappt.");
  return r.daten;
}
async function tresor(aktion, ...args) {
  const r = await api().tresor_aufruf(aktion, args);
  if (!r || !r.ok) throw new Error((r && r.fehler) || "Das hat nicht geklappt.");
  return r.daten;
}
async function konto(aktion, ...args) {
  const r = await api().konto_aufruf(aktion, args);
  if (!r || !r.ok) throw new Error((r && r.fehler) || "Das hat nicht geklappt.");
  return r.daten;
}
const fehlerText = (e) => String((e && e.message) || e || "Das hat nicht geklappt.");

/* Einstellungen: im Programm beim Rechner (das Fenster hat keinen dauerhaften Browserspeicher), sonst auf dem Gerät */
function bereinigt(w) {
  const e = { ...STANDARD, ...(w && typeof w === "object" ? w : {}) };
  return { animation: ANIMATIONEN[e.animation] ? e.animation : "tag", ton: e.ton === true,
           zuletzt: /^\d{4}-\d{2}-\d{2}$/.test(e.zuletzt || "") ? e.zuletzt : "", letzte: /^[0-9a-z]{1,40}$/i.test(e.letzte || "") ? e.letzte : "" };
}
async function einstLaden() {
  if (!kontoMoeglich()) {
    try { return bereinigt(JSON.parse(localStorage.getItem(SPEICHER) || "{}")); } catch (e) { return { ...STANDARD }; }
  }
  try { return bereinigt(await api().oberflaeche("anmeldung")); } catch (e) { return { ...STANDARD }; }
}
function einstSpeichern() {
  A.einst = bereinigt(A.einst);
  if (!kontoMoeglich()) { try { localStorage.setItem(SPEICHER, JSON.stringify(A.einst)); } catch (e) { /* nur für diese Sitzung */ } return; }
  try { Promise.resolve(api().oberflaeche("anmeldung", A.einst)).catch(() => {}); } catch (e) { /* nur für diese Sitzung */ }
}

/* ------------------------------------------------------------------ Texte */
function gruss(d = new Date()) {
  const h = d.getHours() + d.getMinutes() / 60;
  if (h < 4.5) return "Gute Nacht";
  if (h < 11) return "Guten Morgen";
  if (h < 17.5) return "Guten Tag";
  return "Guten Abend";
}
const datumText = () => new Date().toLocaleDateString("de-DE", { weekday: "long", day: "numeric", month: "long" });
const vorname = (p) => String((p && p.name) || "").trim().split(/\s+/)[0] || "";
const personen = () => ((A.start && A.start.personen) || []).filter((p) => p && p.id && p.aktiv !== false);
const person = (id) => personen().find((p) => p.id === id) || ((A.start && A.start.personen) || []).find((p) => p.id === id) || null;
const kuerzel = (p) => esc(p.kuerzel || String(p.name || "?").split(/\s+/).map((t) => t[0] || "").join("").slice(0, 2).toUpperCase());

/* ------------------------------------------------------------------ Sichtbarkeit */
const APP = () => [".rahmen", ".mobil-kopf", ".mobil-schleier"].map((s) => $(s)).filter(Boolean);
function appSperren(an) { APP().forEach((el) => { el.inert = an; }); }
function setzeZustand(z) {
  A.zustand = z;
  if (!A.el) return;
  A.el.dataset.zustand = z;
  if (z !== "wahl") {                                          // Neigung zur Maus gleitet zurück (Übergang im CSS)
    const k = $(".anm-kipp", A.el), g = $(".anm-glanz i", A.el);
    if (k) k.style.transform = ""; if (g) g.style.transform = "";
  }
}

/* ------------------------------------------------------------------ Klang (WebAudio, standardmäßig aus) */
const Ton = {
  ctx: null, master: null, rauschen: null,
  bereit() {
    if (!A.einst.ton) return false;
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return false;
      if (!this.ctx) this.ctx = new AC();
      if (this.ctx.state === "suspended") this.ctx.resume();
      if (!this.master) {
        this.master = this.ctx.createGain();
        this.master.gain.value = 0.55;
        this.master.connect(this.ctx.destination);
      }
      if (!this.rauschen) {
        const n = Math.floor(this.ctx.sampleRate * 0.5);
        this.rauschen = this.ctx.createBuffer(1, n, this.ctx.sampleRate);
        const d = this.rauschen.getChannelData(0);
        for (let i = 0; i < n; i++) d[i] = Math.random() * 2 - 1;
      }
      return true;
    } catch (e) { return false; }
  },
  jetzt() { return this.ctx ? this.ctx.currentTime : 0; },
  _rausch(t, dauer, filterArt, freq, q, laut) {
    const c = this.ctx, s = c.createBufferSource(), f = c.createBiquadFilter(), g = c.createGain();
    s.buffer = this.rauschen; f.type = filterArt; f.frequency.value = freq; f.Q.value = q;
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(laut, t + 0.002); g.gain.exponentialRampToValueAtTime(0.0001, t + dauer);
    s.connect(f).connect(g).connect(this.master); s.start(t, Math.random() * 0.4); s.stop(t + dauer + 0.02);
    return f;
  },
  tick(t, laut = 0.05) { this._rausch(t, 0.022, "bandpass", 2600 + Math.random() * 500, 4, laut); },
  klack(t) { this._rausch(t, 0.05, "bandpass", 1500, 2.5, 0.12); },
  bolzen(t) {
    const c = this.ctx, o = c.createOscillator(), g = c.createGain();
    o.type = "sine"; o.frequency.setValueAtTime(140, t); o.frequency.exponentialRampToValueAtTime(55, t + 0.1);
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.16, t + 0.004); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.14);
    o.connect(g).connect(this.master); o.start(t); o.stop(t + 0.16);
    this._rausch(t, 0.035, "lowpass", 900, 0.7, 0.06);
  },
  zischen(t, dauer) {
    const f = this._rausch(t, dauer, "lowpass", 300, 0.8, 0.035);
    f.frequency.setValueAtTime(300, t); f.frequency.exponentialRampToValueAtTime(2400, t + dauer * 0.8);
  },
  stopp() {
    if (!this.ctx || !this.master) return;
    const m = this.master;
    try { m.gain.setTargetAtTime(0.0001, this.ctx.currentTime, 0.015); setTimeout(() => m.disconnect(), 120); } catch (e) { /* egal */ }
    this.master = null;
  },
};

/* ------------------------------------------------------------------ kleine Animationshilfe */
// cubic-bezier wie in CSS (für Klick-Ticks, die zur Drehung passen sollen)
function bezier(x1, y1, x2, y2) {
  const ax = 3 * x1 - 3 * x2 + 1, bx = 3 * x2 - 6 * x1, cx = 3 * x1;
  const ay = 3 * y1 - 3 * y2 + 1, by = 3 * y2 - 6 * y1, cy = 3 * y1;
  const x = (t) => ((ax * t + bx) * t + cx) * t, y = (t) => ((ay * t + by) * t + cy) * t;
  return (p) => {
    let lo = 0, hi = 1, t = p;
    for (let i = 0; i < 24; i++) { const v = x(t); if (Math.abs(v - p) < 1e-5) break; if (v < p) lo = t; else hi = t; t = (lo + hi) / 2; }
    return y(t);
  };
}
const KURVE = {
  aus: "cubic-bezier(0.23, 1, 0.32, 1)",           // kräftiges ease-out (Ankommen)
  inout: "cubic-bezier(0.77, 0, 0.175, 1)",        // Bewegung auf der Fläche
  dreh: "cubic-bezier(0.45, 0, 0.2, 1)",           // eine Hand dreht das Rad: zügig an, weich zum Halt
  tuer: "cubic-bezier(0.62, 0.02, 0.22, 1)",       // schwere Tür: kommt langsam in Gang, läuft weich aus
  bolzen: "cubic-bezier(0.6, 0, 0.3, 1)",
};

function lauf() {
  const L = { anims: [], uebersprungen: false, timer: [] };
  L.add = (el, frames, opt) => { if (!el) return null; const a = el.animate(frames, { fill: "both", ...opt }); L.anims.push(a); return a; };
  L.spaeter = (ms, fn) => { L.timer.push(setTimeout(fn, ms)); };
  return L;
}
function laufBeenden(L) {
  if (!L) return;
  L.timer.forEach(clearTimeout);
  L.anims.forEach((a) => { try { a.cancel(); } catch (e) { /* schon weg */ } });
}
const rot = (w) => `rotate(${w}deg)`;
function winkelLesen(el) {
  const m = getComputedStyle(el).transform;
  if (!m || m === "none") return 0;
  const v = m.match(/matrix\(([^)]+)\)/);
  if (!v) return 0;
  const [a, b] = v[1].split(",").map(Number);
  return Math.round(Math.atan2(b, a) * 180 / Math.PI * 10) / 10;
}

/* Drehrad: Segmente [ziel, dauer, kurve]; liefert Keyframes und plant die Klick-Ticks dazu */
function radPlan(segmente, tonStart) {
  const gesamt = segmente.reduce((s, x) => s + x[1], 0);
  const frames = [{ transform: rot(A.winkel), offset: 0, easing: segmente[0][2] }];
  let t = 0, von = A.winkel;
  segmente.forEach(([ziel, dauer, kurve], i) => {
    if (tonStart != null) {
      const f = bezier(...kurve.match(/[\d.]+/g).map(Number));
      let letzte = -Infinity, stufe = Math.floor(von / 7.2);
      for (let ms = 0; ms <= dauer; ms += 2) {
        const w = von + (ziel - von) * f(ms / dauer), s = Math.floor(w / 7.2);
        if (s !== stufe && t + ms - letzte >= 16) { Ton.tick(tonStart + (t + ms) / 1000, 0.035 + Math.random() * 0.02); letzte = t + ms; }
        stufe = s;
      }
      if (i < segmente.length - 1 && Math.abs(ziel - von) > 30) Ton.klack(tonStart + (t + dauer) / 1000);
    }
    t += dauer; von = ziel;
    frames.push({ transform: rot(ziel), offset: Math.min(1, t / gesamt), easing: (segmente[i + 1] || [])[2] || "linear" });
  });
  return { frames, dauer: gesamt };
}

/* ------------------------------------------------------------------ Öffnen */
const BOLZEN_REIHE = [3, 4, 2, 5, 1, 6, 0, 7];      // von der Schlossseite (rechts) nach oben und unten

function oeffnen(art) {
  if (A.lauf) laufBeenden(A.lauf);
  stoppeLeerlauf();
  setzeZustand("oeffnet");
  const L = A.lauf = lauf();
  const el = A.el, d = $(".anm-tresor", el).offsetWidth || 300;
  const tresor = $(".anm-tresor", el), tuer = $(".anm-tuer", el), rad = $(".anm-rad", el);
  const bolzen = [...el.querySelectorAll(".anm-bolzen b")];
  const rahmen = $(".rahmen");
  const tafel = A.tafel;
  strahlSetzen();
  const tonAn = art !== "blende" && !reduziert() && Ton.bereit();
  const t0 = tonAn ? Ton.jetzt() + 0.03 : null;

  // Bedienung nie blockieren: ab dem Durchflug gehört die Fläche der App
  const freigeben = () => { el.style.pointerEvents = "none"; appSperren(false); };

  if (art === "blende" || reduziert()) {
    L.add(el, [{ opacity: 1 }, { opacity: 0 }], { duration: 280, easing: "ease" });
    L.add(rahmen, [{ opacity: 0 }, { opacity: 1 }], { duration: 280, easing: "ease" });
    freigeben();
    return abschluss(L, 280);
  }
  const voll = art === "voll";
  // Zeitplan (ms) – Rad führt, Bolzen setzen kurz vor seinem Halt ein, dann Druckausgleich, Tür, Durchflug
  const T = voll
    ? { bolzen: 760, bolzenDauer: 240, versatz: [0, 45, 80, 130, 160, 205, 230, 270], atmen: 1230, tuer: 1460, tuerDauer: 800,
        tafel: 1880, durch: 1950, durchDauer: 750, weg: 2150, wegDauer: 550, app: 2050, appDauer: 650 }
    : { bolzen: 300, bolzenDauer: 170, versatz: [0, 20, 35, 55, 70, 90, 100, 120], atmen: 560, tuer: 600, tuerDauer: 460,
        tafel: 640, durch: 700, durchDauer: 500, weg: 800, wegDauer: 400, app: 780, appDauer: 420 };
  const ende = T.weg + T.wegDauer;

  // 1 · Drehrad: links – rechts – links mit leichtem Überschwingen (kurz: eine Umdrehung nach links)
  const segmente = voll
    ? [[-252, 360, KURVE.dreh], [108, 340, KURVE.dreh], [-8, 210, KURVE.dreh], [2, 60, KURVE.inout], [0, 50, KURVE.inout]]
    : [[-372, 340, KURVE.dreh], [-357, 70, KURVE.inout], [-360, 50, KURVE.inout]];
  const plan = radPlan(segmente, t0);
  L.add(rad, plan.frames, { duration: plan.dauer });
  A.winkel = segmente[segmente.length - 1][0];

  // 2 · Bolzen fahren ein – gestaffelt, nicht im Gleichtakt, jeder mit kleinem Nachfedern
  const weg = -d * 0.105;
  BOLZEN_REIHE.forEach((n, i) => {
    const b = bolzen[n];
    const start = T.bolzen + T.versatz[i] + (voll ? (n % 3) * 6 : 0);
    L.add(b, [{ transform: "translateX(0)", easing: KURVE.bolzen }, { transform: `translateX(${weg * 1.07}px)`, offset: 0.78, easing: KURVE.inout },
              { transform: `translateX(${weg}px)` }], { duration: T.bolzenDauer, delay: start });
    if (tonAn) Ton.bolzen(t0 + (start + T.bolzenDauer * 0.78) / 1000);
  });

  // 3 · Druckausgleich (Tür „atmet“, Licht dringt durch die Fuge) und 4 · Tür schwingt auf (Scharnier links)
  const atmen = T.tuer - T.atmen, tuerGesamt = atmen + T.tuerDauer, a1 = atmen / tuerGesamt;
  L.add(tuer, [
    { transform: "rotateY(0deg) scale(1)", offset: 0, easing: KURVE.inout },
    { transform: "rotateY(0deg) scale(1.016)", offset: a1 * 0.45, easing: KURVE.inout },
    { transform: "rotateY(0deg) scale(1)", offset: a1, easing: KURVE.tuer },
    { transform: `rotateY(${voll ? -104 : -98}deg) scale(1)`, offset: 1 },
  ], { duration: tuerGesamt, delay: T.atmen });
  L.add($(".anm-fuge", el), [{ opacity: 0 }, { opacity: 1, offset: 0.35 }, { opacity: 1, offset: 0.6 }, { opacity: 0 }],
        { duration: T.tuer + T.tuerDauer * 0.5 - T.atmen, delay: T.atmen, easing: "ease-out" });
  L.add($(".anm-innen", el), [{ opacity: 0 }, { opacity: 1 }], { duration: T.tuerDauer * 0.6, delay: T.tuer, easing: "ease-out" });
  L.add($(".anm-strahl", el), [{ opacity: 0 }, { opacity: 1 }], { duration: T.tuerDauer * 0.85, delay: T.tuer + 40, easing: "ease-out" });
  if (tonAn) { Ton.zischen(t0 + T.atmen / 1000, atmen / 1000 + 0.18); Ton.klack(t0 + (T.tuer + 20) / 1000); }

  // 5 · Durchflug: der Tresor kommt auf uns zu und vergeht, ODIN kommt aus der Tiefe nach vorn
  L.add(tafel, [{ opacity: 1, transform: "none" }, { opacity: 0, transform: "translateY(-6px)" }],
        { duration: voll ? 260 : 200, delay: T.tafel, easing: "ease-in-out", fill: "forwards" });
  L.add(tresor, [{ transform: "scale(1)", opacity: 1, easing: KURVE.inout }, { transform: "scale(1.42)", opacity: 1, offset: 0.4, easing: KURVE.aus },
                 { transform: "scale(1.9)", opacity: 0 }], { duration: T.durchDauer, delay: T.durch });
  L.add(el, [{ opacity: 1 }, { opacity: 0 }], { duration: T.wegDauer, delay: T.weg, easing: "cubic-bezier(0.4, 0, 0.2, 1)" });
  L.add(rahmen, [{ opacity: 0, transform: "scale(0.965)" }, { opacity: 1, transform: "scale(1)" }],
        { duration: T.appDauer, delay: T.app, easing: KURVE.aus });
  L.spaeter(T.weg, freigeben);
  return abschluss(L, ende);
}

/* Ende einer Öffnung: aufräumen (alle Animationen weg, Ruhezustand = geschlossene Tür im CSS) */
function abschluss(L, dauer) {
  return new Promise((fertig) => {
    L.fertig = () => {
      if (L.erledigt) return;
      L.erledigt = true;
      laufBeenden(L);
      if (A.lauf === L) A.lauf = null;
      A.el.hidden = true;
      A.el.style.pointerEvents = "";
      $(".anm-rad", A.el).style.transform = rot(A.winkel);
      appSperren(false);
      setzeZustand("weg");
      Ton.stopp();
      fertig();
    };
    L.spaeter(dauer + 30, L.fertig);
  });
}

/* Überspringen: was gerade läuft, hält an, und die Fläche blendet in 180 ms aus */
function ueberspringen() {
  const L = A.lauf;
  if (!L || L.uebersprungen || A.zustand !== "oeffnet") return;
  L.uebersprungen = true;
  Ton.stopp();
  L.timer.forEach(clearTimeout); L.timer = [];
  const el = A.el, rahmen = $(".rahmen");
  const o = Number(getComputedStyle(el).opacity) || 1;
  const ro = rahmen ? Number(getComputedStyle(rahmen).opacity) : 1, rt = rahmen ? getComputedStyle(rahmen).transform : "none";
  L.anims.forEach((a) => a.pause());
  el.style.pointerEvents = "none"; appSperren(false);
  L.add(el, [{ opacity: o }, { opacity: 0 }], { duration: 180, easing: "ease-out" });
  if (rahmen) L.add(rahmen, [{ opacity: ro, transform: rt === "none" ? "none" : rt }, { opacity: 1, transform: "none" }], { duration: 180, easing: KURVE.aus });
  L.spaeter(190, () => L.fertig && L.fertig());
}

/* ------------------------------------------------------------------ Schließen (nach „Abmelden“) */
function schliessen() {
  return new Promise((fertig) => {
    if (A.lauf) laufBeenden(A.lauf);
    const el = A.el;
    el.hidden = false; el.style.pointerEvents = "";
    el.dataset.layout = "seite";
    appSperren(true);
    setzeZustand("schliesst");
    const neu = Math.round((Math.random() * 220 - 110) / 7.2) * 7.2 || 43.2;
    if (reduziert()) {
      const L = A.lauf = lauf();
      L.add(el, [{ opacity: 0 }, { opacity: 1 }], { duration: 220, easing: "ease" });
      A.winkel = neu; $(".anm-rad", el).style.transform = rot(neu);
      L.spaeter(230, () => { laufBeenden(L); A.lauf = null; fertig(); });
      return;
    }
    const L = A.lauf = lauf();
    const d = $(".anm-tresor", el).offsetWidth || 300;
    const tonAn = Ton.bereit(), t0 = tonAn ? Ton.jetzt() + 0.03 : 0;
    L.add(el, [{ opacity: 0 }, { opacity: 1 }], { duration: 260, easing: KURVE.aus });
    L.add($(".rahmen"), [{ opacity: 1, transform: "scale(1)" }, { opacity: 0.4, transform: "scale(0.97)" }], { duration: 260, easing: KURVE.aus });
    L.add($(".anm-tresor", el), [{ transform: "scale(1.25)", opacity: 0 }, { transform: "scale(1)", opacity: 1 }], { duration: 420, easing: KURVE.aus });
    L.add($(".anm-tuer", el), [
      { transform: "rotateY(-104deg) scale(1)", easing: KURVE.inout },
      { transform: "rotateY(0deg) scale(1)", offset: 0.84, easing: "ease-out" },
      { transform: "rotateY(0deg) scale(0.993)", offset: 0.92, easing: "ease-out" },
      { transform: "rotateY(0deg) scale(1)" }], { duration: 620, delay: 160 });
    L.add($(".anm-innen", el), [{ opacity: 1 }, { opacity: 0 }], { duration: 520, delay: 160, easing: "ease-in-out" });
    L.add($(".anm-strahl", el), [{ opacity: 0.8 }, { opacity: 0 }], { duration: 420, delay: 160, easing: "ease-out" });
    const bolzen = [...el.querySelectorAll(".anm-bolzen b")];
    [0, 30, 55, 85, 105, 130, 150, 175].forEach((v, i) => {
      const b = bolzen[BOLZEN_REIHE[i]];
      L.add(b, [{ transform: `translateX(${-d * 0.105}px)`, easing: KURVE.bolzen }, { transform: "translateX(0)" }], { duration: 180, delay: 700 + v });
      if (tonAn) Ton.bolzen(t0 + (700 + v + 150) / 1000);
    });
    const plan = radPlan([[neu, 420, KURVE.aus]], tonAn ? t0 + 0.76 : null);
    L.add($(".anm-rad", el), plan.frames, { duration: plan.dauer, delay: 760 });
    A.winkel = neu;
    L.add(A.tafel, [{ opacity: 0, transform: "translateY(8px)" }, { opacity: 1, transform: "none" }], { duration: 320, delay: 640, easing: KURVE.aus });
    L.spaeter(1200, () => {
      laufBeenden(L); if (A.lauf === L) A.lauf = null;
      $(".anm-rad", el).style.transform = rot(A.winkel);
      Ton.stopp();
      fertig();
    });
  });
}

/* Fehler oder Abbruch: das Rad ruckelt zurück */
function schuetteln() {
  if (!A.el) return;
  const rad = $(".anm-rad", A.el), w = A.winkel, ziel = Math.round(w / 360) * 360;
  A.winkel = ziel;
  if (reduziert()) { rad.style.transform = rot(ziel); return; }
  // Steht das Rad irgendwo (z. B. nach dem Warten auf Microsoft), schnappt es ruckelnd auf die Null zurück
  const weit = Math.abs(w - ziel) > 3;
  rad.animate(weit
    ? [{ transform: rot(w), easing: "cubic-bezier(0.5, 0, 0.9, 0.6)" }, { transform: rot(ziel + Math.sign(w - ziel) * -12), offset: 0.48, easing: "ease-out" },
       { transform: rot(ziel + Math.sign(w - ziel) * 7) , offset: 0.64 }, { transform: rot(ziel - Math.sign(w - ziel) * 3.5), offset: 0.8 }, { transform: rot(ziel) }]
    : [{ transform: rot(w) }, { transform: rot(w - 11) }, { transform: rot(w + 7) }, { transform: rot(w - 4) }, { transform: rot(w + 1.5) }, { transform: rot(w) }],
    { duration: weit ? 680 : 440, easing: "ease-out" });
  rad.style.transform = rot(ziel);
  $(".anm-tuer", A.el).animate([{ transform: "translateX(0)" }, { transform: "translateX(-3px)" }, { transform: "translateX(2px)" }, { transform: "translateX(-1px)" }, { transform: "translateX(0)" }],
              { duration: 360, easing: "ease-out" });
  if (Ton.bereit()) { const t = Ton.jetzt() + 0.01; Ton.klack(t); Ton.tick(t + 0.09, 0.05); Ton.tick(t + 0.17, 0.035); setTimeout(() => Ton.stopp(), 500); }
}

/* Rad dreht sich langsam, solange auf Microsoft gewartet wird */
function starteLeerlauf() {
  if (A.leerlauf || reduziert()) return;
  const rad = $(".anm-rad", A.el);
  A.leerlauf = rad.animate([{ transform: rot(A.winkel) }, { transform: rot(A.winkel + 360) }], { duration: 9000, iterations: Infinity });
}
function stoppeLeerlauf() {
  if (!A.leerlauf) return;
  const rad = $(".anm-rad", A.el);
  A.winkel = winkelLesen(rad);
  A.leerlauf.cancel(); A.leerlauf = null;
  rad.style.transform = rot(A.winkel);
}

function strahlSetzen() {
  const r = $(".anm-tresor", A.el).getBoundingClientRect();
  A.el.style.setProperty("--sx", Math.round(r.left + r.width / 2) + "px");
  A.el.style.setProperty("--sy", Math.round(r.top + r.height / 2) + "px");
}

/* ------------------------------------------------------------------ Tafel */
function kopfHtml(titel, text) {
  return '<p class="anm-datum">' + esc(datumText()) + "</p>" +
    '<h1 class="anm-titel" id="anm-titel">' + titel + "</h1>" + (text ? '<p class="anm-text" id="anm-text">' + text + "</p>" : "");
}

function einstHtml() {
  const e = A.einst;
  return '<div class="anm-einst-inhalt">' +
    '<div class="anm-einst-zeile"><span id="anm-einst-anim">Anmeldeanimation</span><div class="anm-wahl" role="group" aria-labelledby="anm-einst-anim">' +
    Object.entries(ANIMATIONEN).map(([k, t]) => '<button type="button" data-anm-einst="animation" data-wert="' + k + '" aria-pressed="' + (e.animation === k) + '">' + t + "</button>").join("") +
    "</div></div>" +
    '<label class="anm-schalter"><input type="checkbox" data-anm-einst="ton"' + (e.ton ? " checked" : "") + "> Leise Klickgeräusche</label></div>";
}
const einstKurz = () => "Anmeldung: " + ANIMATIONEN[A.einst.animation].replace("Einmal am Tag", "einmal am Tag").replace("Immer", "immer").replace("Aus", "ohne Animation") +
  (A.einst.ton ? " · mit Tönen" : "");

function wahlHtml() {
  const ko = A.konto, v = (ko && ko.vorgang) || {};
  const msVerknuepfen = !!(ko && ko.angemeldet && !ko.person);
  const msMoeglich = kontoMoeglich() && ko && ko.verfuegbar && ko.eingerichtet && !ko.angemeldet;
  const liste = personen();
  const letzte = A.einst.letzte;
  const sortiert = letzte && liste.some((p) => p.id === letzte) ? [liste.find((p) => p.id === letzte), ...liste.filter((p) => p.id !== letzte)] : liste;
  const text = msVerknuepfen
    ? "Mit Microsoft angemeldet als <b>" + esc(ko.name || ko.email) + "</b>. Wer bist du in ODIN?"
    : liste.length ? "Wer bist du?" : "Wie heißt du?";
  let html = kopfHtml(esc(gruss()) + ".", text);
  if (sortiert.length) {
    html += '<div class="anm-personen" role="group" aria-label="Personen">' + sortiert.map((p, i) =>
      '<button type="button" class="anm-person" data-anm="person" data-id="' + esc(p.id) + '" tabindex="' + (i === 0 ? "0" : "-1") + '">' +
      '<span class="anm-avatar" style="--farbe:' + farbe(p.farbe) + '" aria-hidden="true">' + kuerzel(p) + "</span>" +
      '<span class="name">' + esc(p.name) + kachelZusatz(p, letzte) + "</span></button>").join("") + "</div>";
  }
  // Neu anlegen: nur im Programm (im Browser legt niemand Personen an)
  if (msVerknuepfen) {
    html += '<div class="anm-neu"><button type="button" class="anm-link" data-anm="ms-neu">Nicht dabei? Neu anlegen als „' + esc(ko.name || ko.email) + "“</button></div>";
  } else if (!imWeb()) {
    const form = '<form data-anm-form="neu"><input class="anm-feld" name="name" type="text" placeholder="Vor- und Nachname" autocomplete="off" required minlength="2" maxlength="60" aria-label="Vor- und Nachname">' +
      '<button class="anm-knopf primaer" type="submit">' + (liste.length ? "Anlegen" : "Los geht’s") + "</button></form>";
    html += liste.length ? '<details class="anm-neu"><summary>Nicht dabei? Neu anlegen</summary>' + form + "</details>" : '<div class="anm-neu">' + form + "</div>";
  }
  if (msMoeglich) {
    html += '<div class="anm-oder">oder</div>';
    if (v.laeuft) {
      html += '<div class="anm-warte" role="status">' + (v.code
        ? "<span>Öffne <b>microsoft.com/devicelogin</b> und gib diesen Code ein:</span><span class=\"anm-code\">" + esc(v.code.code) + "</span>" +
          '<div class="anm-reihe"><button type="button" class="anm-knopf klein" data-anm="ms-seite">Seite öffnen</button><button type="button" class="anm-knopf klein" data-anm="ms-kopieren">Code kopieren</button><button type="button" class="anm-knopf klein" data-anm="ms-abbrechen">Abbrechen</button></div>'
        : "<span><b>Warte auf Microsoft …</b> Melde dich im Browser mit deinem Firmenkonto an – danach geht es hier von selbst weiter.</span>" +
          '<div class="anm-reihe"><button type="button" class="anm-knopf klein" data-anm="ms-abbrechen">Abbrechen</button><button type="button" class="anm-link" data-anm="ms-code">Stattdessen mit Code</button></div>') + "</div>";
    } else {
      html += '<button type="button" class="anm-knopf breit" data-anm="ms"><span class="anm-ms-logo" aria-hidden="true"><i></i><i></i><i></i><i></i></span>Mit Microsoft anmelden</button>';
    }
  }
  if (imWeb()) html += '<p class="anm-hinweis">Danach fragt ODIN nach deiner PIN. Angemeldet bleibst du auf diesem Gerät bis zum Abmelden.</p>';
  html += '<p class="anm-meldung" role="alert">' + esc(A.meldung) + "</p>";
  html += '<div class="anm-fuss"><details class="anm-einst"><summary>' + esc(einstKurz()) + "</summary>" + einstHtml() + "</details></div>";
  return html;
}

/* Unter dem Namen auf der Kachel: gesperrt, noch keine PIN, zuletzt hier – je nachdem, was gerade zählt */
function kachelZusatz(p, letzte) {
  const z = p.warten ? "Gesperrt · " + Math.max(1, Math.ceil(p.warten / 60)) + " Min." : p.pin === false ? (p.zurueckgesetzt ? "PIN zurückgesetzt" : "Noch keine PIN")
    : p.id === letzte ? "Zuletzt hier" : "";
  return z ? '<span class="zuletzt' + (p.warten ? " gesperrt" : "") + '">' + z + "</span>" : "";
}

function grussHtml(p, art) {
  const ko = A.konto;
  const name = vorname(p);
  const fest = A.start && A.start.ich_fest;
  return kopfHtml(esc(gruss()) + (name ? ", " + esc(name) : "") + ".", art === "neu" ? "Schön, dass du da bist." : "Willkommen zurück.") +
    (fest && ko && ko.email ? '<span class="anm-chip"><span class="anm-ms-logo" aria-hidden="true"><i></i><i></i><i></i><i></i></span>mit Microsoft angemeldet</span>' : "");
}

/* Wahl zeigen (beim Start ohne Person, nach dem Abmelden, nach Fehlern) – Fokus bleibt, wo er war */
function zeigeWahl(opt = {}) {
  const el = A.el;
  const tresorEl = $(".anm-tresor", el);
  const vorher = !el.hidden && el.dataset.layout === "mitte" && A.zustand === "laden" ? tresorEl.getBoundingClientRect() : null;
  const vonPin = !!A.pin;
  if (vonPin) tresorFlip(pinBeenden); else pinBeenden();
  el.hidden = false; el.style.pointerEvents = "";
  el.dataset.layout = "seite";
  appSperren(true);
  setzeZustand("wahl");
  const fokus = document.activeElement && A.tafel.contains(document.activeElement)
    ? (document.activeElement.dataset.anm === "person" ? '[data-id="' + CSS.escape(document.activeElement.dataset.id) + '"]' : document.activeElement.dataset.anm ? '[data-anm="' + document.activeElement.dataset.anm + '"]' : null) : null;
  const einstOffen = !!$(".anm-einst[open]", A.tafel), neuOffen = !!$("details.anm-neu[open]", A.tafel);
  const eingabe = $('[data-anm-form="neu"] input', A.tafel);
  const wert = eingabe ? eingabe.value : "";
  A.tafel.innerHTML = wahlHtml();
  if (einstOffen) { const d = $(".anm-einst", A.tafel); if (d) d.open = true; }
  if (neuOffen || wert) { const d = $("details.anm-neu", A.tafel); if (d) d.open = true; const i = $('[data-anm-form="neu"] input', A.tafel); if (i) i.value = wert; }
  const ziel = (fokus && $(fokus, A.tafel)) || (opt.fokus !== false && ($(".anm-person[tabindex='0']", A.tafel) || $('[data-anm-form="neu"] input', A.tafel) || $('[data-anm="ms"]', A.tafel)));
  if (ziel && (opt.fokus !== false || fokus)) ziel.focus({ preventScroll: true });
  // Vom Start (Tür in der Mitte) zur Wahl: die Tür gleitet zur Seite, die Tafel kommt kurz danach
  if (vonPin) tafelWechsel(-1);
  if (vorher && !reduziert()) {
    const nachher = tresorEl.getBoundingClientRect();
    const dx = vorher.left - nachher.left, dy = vorher.top - nachher.top;
    if (Math.abs(dx) + Math.abs(dy) > 2) tresorEl.animate([{ transform: `translate(${dx}px, ${dy}px)` }, { transform: "none" }], { duration: 520, easing: KURVE.aus });
    A.tafel.animate([{ opacity: 0, transform: "translateY(8px)" }, { opacity: 1, transform: "none" }], { duration: 380, delay: 90, easing: KURVE.aus, fill: "backwards" });
  }
}

/* ------------------------------------------------------------------ Ablauf */
async function start() {
  A.el = $("#anmeldung");
  A.tafel = $("#anm-tafel");
  if (!A.el) return;
  verdrahten();
  appSperren(true);
  // Kommt keine Antwort, gibt ODIN die Oberfläche frei – die Anmeldung blockiert nie die Arbeit
  const notfall = setTimeout(() => { if (A.zustand === "laden") { setzeZustand("oeffnet"); A.lauf = lauf(); abschluss(A.lauf, 0); } }, 9000);
  let st = null;
  const [s, e, ko] = await Promise.all([
    tresor("status").catch((x) => ({ fehler: fehlerText(x) })),
    einstLaden(),
    kontoMoeglich() ? konto("status").catch(() => null) : Promise.resolve(null),
  ]);
  clearTimeout(notfall);
  if (A.zustand !== "laden") return;
  st = s; A.einst = e; A.konto = ko;
  if (!st || st.fehler) { oeffnen("blende"); return; }          // Projekte gerade nicht erreichbar: ODIN trotzdem zeigen
  A.start = st;
  const ich = st.ich ? person(st.ich) : null;
  if (ich) {
    if (A.einst.animation === "aus") { oeffnen("blende"); return; }
    const voll = A.einst.animation === "immer" || A.einst.zuletzt !== heute();
    A.tafel.innerHTML = grussHtml(ich, "zurueck");
    A.tafel.animate([{ opacity: 0, transform: "translateY(6px)" }, { opacity: 1, transform: "none" }], { duration: 320, easing: KURVE.aus });
    if (voll) { A.einst.zuletzt = heute(); einstSpeichern(); }
    oeffnen(voll ? "voll" : "kurz");
    return;
  }
  zeigeWahl();
  if (A.konto && A.konto.vorgang && A.konto.vorgang.laeuft) { starteLeerlauf(); pollen(); }
}

/* Jemand ist angemeldet (PIN stimmt, Microsoft): alle Bereiche erfahren es, dann öffnet sich der Tresor */
function angemeldet(p, art = "zurueck") {
  stoppePoll();
  pinBeenden();
  A.meldung = "";
  ruheStarten();
  const wartende = A.warten.splice(0);
  setTimeout(() => wartende.forEach((f) => f(p.id)), 0);
  A.einst.letzte = p.id;
  const anim = A.einst.animation === "aus" ? "blende" : "voll";
  if (anim === "voll") A.einst.zuletzt = heute();
  einstSpeichern();
  ["odin-ich", "odin-ich-urlaub"].forEach((n) => window.dispatchEvent(new Event(n)));
  if (typeof window.cockpitZeichne === "function") { try { window.cockpitZeichne(); } catch (e) { /* zeichnet beim nächsten Mal */ } }
  A.tafel.innerHTML = grussHtml(p, art);
  if (!reduziert()) A.tafel.animate([{ opacity: 0, filter: "blur(2px)", transform: "translateY(4px)" }, { opacity: 1, filter: "blur(0)", transform: "none" }], { duration: 260, easing: KURVE.aus });
  return oeffnen(anim);
}

/* Kachel gewählt: weiter zur PIN. Mit Microsoft angemeldet, aber noch nicht verknüpft: Person ohne PIN gleich
   verknüpfen (Microsoft ist der Nachweis), Person mit PIN nur mit ihrer PIN. */
async function personWaehlen(knopf) {
  if (A.beschaeftigt || A.zustand !== "wahl") return;
  const id = knopf.dataset.id, p = person(id);
  if (!p) return;
  const msVerknuepfen = !!(A.konto && A.konto.angemeldet && !A.konto.person);
  if (!msVerknuepfen || p.pin) { zeigePin(id, { modus: msVerknuepfen ? "verknuepfen" : p.pin ? "pruefen" : "neu1" }); return; }
  A.beschaeftigt = true;
  knopf.setAttribute("aria-busy", "true");
  try {
    A.konto = await konto("person_verknuepfen", id);             // wie auf „Konto & Anmeldung“: E-Mail kommt zur Person
    A.start = await tresor("status");
    if (A.start.ich !== id) throw new Error("Das hat nicht geklappt – bitte noch einmal.");
    A.beschaeftigt = false;
    angemeldet(person(id) || p, id === A.einst.letzte ? "zurueck" : "neu");
  } catch (e) {
    A.beschaeftigt = false;
    knopf.removeAttribute("aria-busy");
    fehler(fehlerText(e));
  }
}

async function neuAnlegen(form) {
  if (A.beschaeftigt) return;
  const name = String(new FormData(form).get("name") || "").trim();
  if (name.length < 2) { fehler("Bitte den Namen eingeben (mindestens 2 Zeichen)."); return; }
  A.beschaeftigt = true;
  try {
    const neu = await ruf("person_anlegen", { name });
    A.start = await tresor("status");
    A.beschaeftigt = false;
    zeigePin(neu.id, { modus: "neu1" });                         // neue Person: gleich ihre PIN festlegen
  } catch (e) { A.beschaeftigt = false; fehler(fehlerText(e)); }
}

function fehler(text, wackeln = true) {
  A.meldung = text;
  const m = $(".anm-meldung", A.tafel);
  if (m) m.textContent = text;
  if (wackeln) schuetteln();
}

/* ------------------------------------------------------------------ PIN */
const PIN_MIN = 4, PIN_MAX = 8;
const grob = () => matchMedia("(pointer: coarse)").matches;
const ICON_ZURUECK = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M14.5 6 8.5 12l6 6"/></svg>';
const ICON_LOESCHEN = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 6h10.5A1.5 1.5 0 0 1 21 7.5v9a1.5 1.5 0 0 1-1.5 1.5H9l-6-6 6-6Z"/><path d="m12.5 9.5 5 5m0-5-5 5"/></svg>';
const ICON_PFEIL = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12h13.5M13 6.5l5.5 5.5-5.5 5.5"/></svg>';

/* Wie tresor.py: gleiche Ziffern, Folgen (auch rückwärts) und eine kurze Liste – hier nur für schnelle Rückmeldung */
const GESPERRT = new Set(["1212", "1122", "1313", "2580", "0852", "1004", "2000", "2001", "2020", "6969", "4321", "1010", "0101",
  "123123", "121212", "112233", "147258", "159753", "696969", "102030", "1357", "2468", "13579", "24680"]);
function pinTrivial(pin) {
  if (new Set(pin).size === 1 || GESPERRT.has(pin)) return true;
  const schritte = new Set([...pin].slice(1).map((z, i) => (Number(z) - Number(pin[i]) + 10) % 10));
  return schritte.size === 1 && (schritte.has(1) || schritte.has(9));
}

const datumKurz = (iso) => { const d = new Date(String(iso || "").slice(0, 19)); return isNaN(d) ? "" : d.toLocaleDateString("de-DE", { day: "numeric", month: "long" }); };

function pinHtml() {
  const P = A.pin, p = person(P.id) || { name: "", id: P.id };
  const neu = P.modus === "neu1" || P.modus === "neu2";
  const titel = P.modus === "neu1" ? (p.zurueckgesetzt ? "Neue PIN festlegen." : "PIN festlegen.") : P.modus === "neu2" ? "Noch einmal." : esc(gruss()) + (vorname(p) ? ", " + esc(vorname(p)) : "") + ".";
  const text = P.modus === "neu1" ? "Wähle 4 bis 8 Ziffern – die brauchst du ab jetzt bei jeder Anmeldung."
    : P.modus === "neu2" ? "Gib die neue PIN zur Bestätigung ein zweites Mal ein."
    : P.modus === "verknuepfen" ? "Zum Verknüpfen mit deinem Microsoft-Konto einmal deine PIN – danach meldet dich Microsoft an."
    : P.gesperrt ? "Der Tresor hat sich nach " + esc(P.gesperrt) + " ohne Eingabe geschlossen. Gib deine PIN ein." : "Gib deine PIN ein.";
  const schritt = neu ? '<span class="anm-schritt" aria-label="Schritt ' + (P.modus === "neu1" ? 1 : 2) + ' von 2"><i class="an"></i><i' + (P.modus === "neu2" ? ' class="an"' : "") + "></i></span>" : "";
  let html = '<div class="anm-pin-kopf"><button type="button" class="anm-wer" data-anm="zurueck" aria-label="Andere Person wählen – gerade: ' + esc(p.name) + '">' +
    ICON_ZURUECK + '<span class="anm-avatar" style="--farbe:' + farbe(p.farbe) + '" aria-hidden="true">' + kuerzel(p) + "</span>" +
    '<span class="anm-wer-name">' + esc(p.name) + "</span></button>" + schritt + "</div>" +
    '<h1 class="anm-titel" id="anm-titel">' + titel + '</h1><p class="anm-text" id="anm-text">' + text + "</p>";
  if (P.modus === "neu1" && p.zurueckgesetzt) {
    const z = p.zurueckgesetzt;
    html += '<p class="anm-notiz" role="note">Deine PIN wurde' + (z.am ? " am " + esc(datumKurz(z.am)) : "") + (z.von_name ? " von " + esc(z.von_name) : "") + " zurückgesetzt.</p>";
  }
  const beschriftung = (neu ? (P.modus === "neu1" ? "Neue PIN" : "Neue PIN wiederholen") : "PIN") + " für " + p.name + ", 4 bis 8 Ziffern";
  html += '<form class="anm-pin" data-anm-form="pin" autocomplete="off" novalidate>' +
    '<div class="anm-pin-feld-huelle">' +
      '<label class="anm-sr" for="anm-pin-feld">' + esc(beschriftung) + "</label>" +
      '<input id="anm-pin-feld" class="anm-pin-feld" type="password" inputmode="' + (grob() ? "none" : "numeric") + '" pattern="[0-9]*" maxlength="' + PIN_MAX + '" ' +
        'autocomplete="off" autocapitalize="off" autocorrect="off" spellcheck="false" enterkeyhint="go" aria-describedby="anm-text anm-pin-meldung">' +
      '<div class="anm-punkte" aria-hidden="true"></div>' +
    "</div>" +
    '<p class="anm-meldung anm-pin-meldung" id="anm-pin-meldung" role="alert"></p>' +
    '<div class="anm-tasten" role="group" aria-label="Ziffernfeld">' +
      [1, 2, 3, 4, 5, 6, 7, 8, 9].map((z) => '<button type="button" class="anm-taste" data-anm="taste" data-wert="' + z + '">' + z + "</button>").join("") +
      '<button type="button" class="anm-taste leise" data-anm="loeschen" aria-label="Letzte Ziffer löschen">' + ICON_LOESCHEN + "</button>" +
      '<button type="button" class="anm-taste" data-anm="taste" data-wert="0">0</button>' +
      '<button type="submit" class="anm-taste ok" aria-label="' + (P.modus === "neu1" ? "Weiter" : "Bestätigen") + '">' + ICON_PFEIL + "</button>" +
    "</div>" +
    (neu ? '<p class="anm-hinweis">Nichts Naheliegendes wie 1234, 0000 oder dein Geburtsjahr.</p>' : "") +
    "</form>";
  return html;
}

/* Ändert sich die Größe oder Lage des Tresors (Handy: kleiner in der PIN-Ansicht), gleitet er dorthin statt zu springen */
function tresorFlip(aendern) {
  const t = A.el && $(".anm-tresor", A.el);
  const vorher = t && !A.el.hidden ? t.getBoundingClientRect() : null;
  aendern();
  if (!vorher || reduziert()) return;
  const nachher = t.getBoundingClientRect();
  const dx = vorher.left - nachher.left, dy = vorher.top - nachher.top, s = vorher.width / (nachher.width || 1);
  if (Math.abs(dx) + Math.abs(dy) < 2 && Math.abs(s - 1) < 0.01) return;
  t.animate([{ transformOrigin: "0 0", transform: `translate(${dx}px, ${dy}px) scale(${s})` }, { transformOrigin: "0 0", transform: "none" }],
            { duration: 420, easing: KURVE.aus });
}

/* Die Tafel wechselt den Inhalt: kurzer Übergang in Leserichtung (vor: von rechts, zurück: von links) */
function tafelWechsel(richtung = 1) {
  if (reduziert()) return;
  A.tafel.animate([{ opacity: 0, transform: `translateX(${richtung * 14}px)` }, { opacity: 1, transform: "none" }], { duration: 240, easing: KURVE.aus });
}

function zeigePin(id, opt = {}) {
  const p = person(id);
  if (!p) { zeigeWahl(); return; }
  const vorher = A.pin;
  if (A.pin) clearInterval(A.pin.timer);                     // Ansicht bleibt „pin“ – der Tresor springt nicht
  const el = A.el;
  el.hidden = false; el.style.pointerEvents = "";
  el.dataset.layout = "seite";
  appSperren(true);
  setzeZustand("wahl");
  A.pin = { id, modus: opt.modus || (p.pin ? "pruefen" : "neu1"), erst: "", sperreBis: 0, timer: 0, gesperrt: opt.gesperrt || "" };
  A.meldung = "";
  pinAlt = "";
  tresorFlip(() => { el.dataset.ansicht = "pin"; A.tafel.innerHTML = pinHtml(); });
  punkteZeichnen(0);
  if (opt.meldung) pinMeldung(opt.meldung);
  if (opt.wechsel !== false) tafelWechsel(vorher ? 0 : 1);
  if (!vorher) radAufNull();
  if (p.warten) sperre(p.warten);
  const feld = $("#anm-pin-feld", A.tafel);
  if (feld && !p.warten) feld.focus({ preventScroll: true });
}

function pinBeenden() {
  if (A.pin) clearInterval(A.pin.timer);
  A.pin = null;
  if (A.el) delete A.el.dataset.ansicht;
}

const pinFeld = () => A.pin && $("#anm-pin-feld", A.tafel);
function pinMeldung(text, art = "fehler") {
  const m = $("#anm-pin-meldung", A.tafel);
  if (!m) return;
  m.textContent = text || "";
  m.dataset.art = art;
}

/* Punkte: mindestens vier Stellen, mehr erscheinen beim Tippen (verrät nicht, wie lang die gespeicherte PIN ist) */
function punkteZeichnen(n, neuIndex = -1) {
  const reihe = $(".anm-punkte", A.tafel);
  if (!reihe) return;
  const stellen = Math.max(PIN_MIN, n);
  while (reihe.children.length < stellen) {
    const i = document.createElement("i");
    reihe.appendChild(i);
    if (!reduziert() && reihe.children.length > PIN_MIN) i.animate([{ opacity: 0, transform: "scale(0.4)" }, { opacity: 1, transform: "none" }], { duration: 160, easing: KURVE.aus });
  }
  while (reihe.children.length > stellen) reihe.lastElementChild.remove();
  [...reihe.children].forEach((i, k) => i.classList.toggle("voll", k < n));
  const neu = reihe.children[neuIndex];
  if (neu && !reduziert()) neu.animate([{ transform: "scale(0.45)" }, { transform: "scale(1.12)", offset: 0.6 }, { transform: "none" }], { duration: 200, easing: KURVE.aus });
}

/* Rad dreht je Ziffer: abwechselnd rechts und links herum wie an einem Zahlenschloss, um eine zufällige Strecke, und
   rastet mit einem Tick ein. Tippt man schneller, setzt die nächste Drehung dort an, wo das Rad gerade steht. */
function radDrehen(stelle, zurueck = false) {
  const rad = $(".anm-rad", A.el);
  if (!rad || reduziert()) return;
  const von = winkelLesen(rad);
  rad.getAnimations().forEach((a) => a.cancel());
  A.winkel = von;
  const richtung = (stelle % 2 === 0 ? 1 : -1) * (zurueck ? -1 : 1);
  const strecke = zurueck ? 21.6 : (7 + Math.floor(Math.random() * 12)) * 7.2;      // 50–130°, in Rasten
  const ziel = Math.round((von + richtung * strecke) / 7.2) * 7.2;
  const dauer = zurueck ? 170 : Math.round(Math.min(320, 160 + strecke));
  const tonAn = Ton.bereit(), t0 = tonAn ? Ton.jetzt() + 0.005 : null;
  const plan = radPlan([[ziel + richtung * 2.6, Math.round(dauer * 0.8), KURVE.dreh], [ziel, Math.round(dauer * 0.2), KURVE.inout]], t0);
  rad.animate(plan.frames, { duration: plan.dauer });
  if (tonAn) Ton.klack(t0 + dauer * 0.8 / 1000);
  A.winkel = ziel;
  rad.style.transform = rot(ziel);
}

/* Beim Wechsel zur PIN: das Rad läuft auf die Null zurück (kürzester Weg) */
function radAufNull() {
  const rad = $(".anm-rad", A.el);
  if (!rad) return;
  const von = A.leerlauf ? winkelLesen(rad) : A.winkel;
  stoppeLeerlauf();
  const ziel = Math.round(von / 360) * 360;
  if (reduziert() || Math.abs(ziel - von) < 1) { A.winkel = ziel; rad.style.transform = rot(ziel); return; }
  A.winkel = von;
  const plan = radPlan([[ziel, 460, KURVE.aus]], Ton.bereit() ? Ton.jetzt() + 0.01 : null);
  rad.animate(plan.frames, { duration: plan.dauer });
  A.winkel = ziel;
  rad.style.transform = rot(ziel);
}

/* Eingabe ins (unsichtbare) Feld – über Tastatur, Ziffernblock oder Ziffernfeld: nur Ziffern, höchstens acht */
let pinAlt = "";
function pinGeaendert() {
  const feld = pinFeld();
  if (!feld) return;
  const wert = feld.value.replace(/\D/g, "").slice(0, PIN_MAX);
  if (wert !== feld.value) feld.value = wert;
  if (A.pin.sperreBis > Date.now() || A.beschaeftigt) { feld.value = pinAlt; return; }
  const alt = pinAlt;
  pinAlt = wert;
  if (wert === alt) return;
  aktivitaet();
  if (wert.length > alt.length) { punkteZeichnen(wert.length, wert.length - 1); radDrehen(wert.length - 1); }
  else { punkteZeichnen(wert.length); radDrehen(wert.length, true); }
  const m = $("#anm-pin-meldung", A.tafel);
  if (m && m.textContent && m.dataset.art !== "sperre") pinMeldung("");
}
function pinTippen(ziffer) {
  const feld = pinFeld();
  if (!feld || feld.disabled) return;
  if (feld.value.length >= PIN_MAX) { punkteSchuetteln(true); return; }
  feld.value += ziffer;
  pinGeaendert();
}
function pinLoeschen(alles = false) {
  const feld = pinFeld();
  if (!feld || feld.disabled || !feld.value) return;
  feld.value = alles ? "" : feld.value.slice(0, -1);
  pinGeaendert();
}
function pinLeeren() {
  const feld = pinFeld();
  if (feld) feld.value = "";
  pinAlt = "";
  punkteZeichnen(0);
}

function punkteSchuetteln(leise = false) {
  const reihe = $(".anm-punkte", A.tafel);
  if (!reihe) return;
  if (!leise) {
    reihe.classList.add("falsch");
    setTimeout(() => reihe.classList.remove("falsch"), 650);
  }
  if (reduziert()) return;
  reihe.animate([{ transform: "translateX(0)" }, { transform: "translateX(-9px)" }, { transform: "translateX(7px)" }, { transform: "translateX(-5px)" },
                 { transform: "translateX(3px)" }, { transform: "translateX(-1px)" }, { transform: "translateX(0)" }], { duration: leise ? 260 : 420, easing: "ease-out" });
}

function pinFalsch(text) {
  pinMeldung(text);
  punkteSchuetteln();
  schuetteln();
  setTimeout(() => { if (A.pin) pinLeeren(); }, reduziert() ? 0 : 380);
  const feld = pinFeld();
  if (feld) feld.focus({ preventScroll: true });
}

/* Gesperrt: Countdown, Ziffernfeld aus. Danach geht es von selbst weiter. */
function sperre(sekunden) {
  if (!A.pin) return;
  clearInterval(A.pin.timer);
  A.pin.sperreBis = Date.now() + sekunden * 1000;
  const form = $(".anm-pin", A.tafel);
  const knoepfe = [...A.tafel.querySelectorAll(".anm-taste")], feld = pinFeld();
  const an = (aus) => { knoepfe.forEach((b) => { b.disabled = aus; }); if (feld) feld.disabled = aus; if (form) form.classList.toggle("gesperrt", aus); };
  an(true);
  pinLeeren();
  const p = person(A.pin.id);
  if (p) p.warten = sekunden;
  const m = $("#anm-pin-meldung", A.tafel);
  if (m) {
    m.dataset.art = "sperre";
    m.innerHTML = "Zu viele falsche Versuche. Wieder möglich in " + '<span class="anm-uhr" aria-hidden="true"></span><span class="anm-sr">' + Math.max(1, Math.ceil(sekunden / 60)) + " Minuten</span>.";
  }
  const tick = () => {
    const rest = Math.max(0, Math.ceil((A.pin ? A.pin.sperreBis : 0) - Date.now()) / 1000);
    const uhr = $(".anm-uhr", A.tafel);
    const s = Math.ceil(rest);
    if (uhr) uhr.textContent = Math.floor(s / 60) + ":" + String(s % 60).padStart(2, "0");
    if (rest > 0 || !A.pin) return;
    clearInterval(A.pin.timer);
    A.pin.sperreBis = 0;
    if (p) p.warten = 0;
    an(false);
    pinMeldung("Du kannst es jetzt wieder versuchen.", "info");
    const f = pinFeld();
    if (f) f.focus({ preventScroll: true });
  };
  tick();
  A.pin.timer = setInterval(tick, 250);
}

async function pinAbschicken() {
  const P = A.pin, feld = pinFeld();
  if (!P || !feld || A.beschaeftigt || P.sperreBis > Date.now()) return;
  const wert = feld.value;
  if (wert.length < PIN_MIN) { pinFalsch(wert ? "Mindestens " + PIN_MIN + " Ziffern." : "Bitte die PIN eingeben."); return; }
  if (P.modus === "neu1") {
    if (pinTrivial(wert)) { pinFalsch("Zu leicht zu erraten – bitte eine andere PIN."); return; }
    P.erst = wert;
    P.modus = "neu2";
    A.tafel.innerHTML = pinHtml();
    pinAlt = ""; punkteZeichnen(0); tafelWechsel(1);
    pinFeld().focus({ preventScroll: true });
    return;
  }
  if (P.modus === "neu2" && wert !== P.erst) {
    P.modus = "neu1"; P.erst = "";
    A.tafel.innerHTML = pinHtml();
    pinAlt = ""; punkteZeichnen(0); tafelWechsel(-1);
    pinFalsch("Die Eingaben waren verschieden – bitte von vorn.");
    return;
  }
  A.beschaeftigt = true;
  feld.closest(".anm-pin").setAttribute("aria-busy", "true");
  try {
    let erg;
    if (P.modus === "verknuepfen") {
      A.konto = await konto("person_verknuepfen", P.id, wert);
      erg = { angemeldet: true };
    } else if (P.modus === "neu2") {
      erg = await tresor("pin_festlegen", P.id, P.erst, wert);
    } else {
      erg = await tresor("anmelden", P.id, wert);
    }
    A.beschaeftigt = false;
    if (!A.pin) return;
    feld.closest(".anm-pin").removeAttribute("aria-busy");
    if (erg && erg.angemeldet) {
      try { A.start = await tresor("status"); } catch (e) { /* dann mit dem, was da ist */ }
      const p = person(P.id);
      // Punkte werden grün, das Rad rastet ein letztes Mal – dann der Gruß und die Öffnung
      $(".anm-punkte", A.tafel).classList.add("richtig");
      if (Ton.bereit()) Ton.klack(Ton.jetzt() + 0.01);
      const art = P.modus === "neu2" ? "neu" : P.id === A.einst.letzte ? "zurueck" : "neu";
      A.beschaeftigt = true;
      setTimeout(() => { A.beschaeftigt = false; angemeldet(p || { id: P.id, name: "" }, art); }, reduziert() ? 0 : 240);
      return;
    }
    if (erg.grund === "gesperrt") { punkteSchuetteln(); schuetteln(); sperre(erg.warten); return; }
    if (erg.grund === "pin_fehlt") {                         // inzwischen zurückgesetzt: jetzt neu festlegen
      try { A.start = await tresor("status"); } catch (e) { /* egal */ }
      zeigePin(P.id, { modus: "neu1", meldung: erg.meldung });
      return;
    }
    pinFalsch(erg.meldung || "PIN stimmt nicht.");
  } catch (e) {
    A.beschaeftigt = false;
    if (feld.closest(".anm-pin")) feld.closest(".anm-pin").removeAttribute("aria-busy");
    const text = fehlerText(e);
    if (P.modus === "neu2") {                                // z. B. zu leicht: zurück zum ersten Schritt
      P.modus = "neu1"; P.erst = "";
      A.tafel.innerHTML = pinHtml(); pinAlt = ""; punkteZeichnen(0); tafelWechsel(-1);
    }
    pinFalsch(text);
  }
}

/* Für die Bereiche („Wer bist du?“): Tresor zeigen und warten, bis jemand angemeldet ist. Mit Person-ID gleich zur PIN. */
function anmeldenLassen(id) {
  return new Promise((fertig) => {
    if (!A.el) { fertig(""); return; }
    A.warten.push(fertig);
    const zeigen = async () => {
      try { A.start = await tresor("status"); } catch (e) { /* mit dem, was da ist */ }
      if (id && person(id)) zeigePin(id); else zeigeWahl();
    };
    if (A.zustand === "weg") { A.tafel.innerHTML = ""; schliessen().then(zeigen); }
    else if (A.zustand === "wahl") zeigen();
  });
}
window.odinAnmelden = anmeldenLassen;

/* ------------------------------------------------------------------ Sperre nach Inaktivität (Einstellung je Rechner) */
const RUHE = { letzte: Date.now(), timer: 0 };
function aktivitaet() { RUHE.letzte = Date.now(); }
function ruheStoppen() { clearInterval(RUHE.timer); RUHE.timer = 0; }
function ruheStarten() {
  ruheStoppen();
  const e = A.start && A.start.einstellungen, min = (e && e.sperre_minuten) || 0;
  if (!min || (A.start && A.start.ich_fest)) return;                       // mit Microsoft angemeldet: keine Sperre
  RUHE.letzte = Date.now();
  RUHE.timer = setInterval(() => {
    if (A.zustand === "weg" && !A.beschaeftigt && Date.now() - RUHE.letzte > min * 60000) sperren(min);
  }, 10000);
}
async function sperren(min) {
  ruheStoppen();
  const id = A.start && A.start.ich;
  if (!id) return;
  try { A.start = await tresor("abmelden"); } catch (e) { ruheStarten(); return; }
  A.tafel.innerHTML = "";
  await schliessen();
  ["odin-ich", "odin-ich-urlaub"].forEach((n) => window.dispatchEvent(new Event(n)));
  if (typeof window.cockpitZeichne === "function") { try { window.cockpitZeichne(); } catch (e) { /* egal */ } }
  if (person(id)) zeigePin(id, { modus: "pruefen", gesperrt: min === 1 ? "1 Minute" : min + " Minuten" }); else zeigeWahl();
}
["pointerdown", "keydown", "wheel", "touchstart"].forEach((n) => addEventListener(n, aktivitaet, { passive: true, capture: true }));

/* ------------------------------------------------------------------ Microsoft (nur im Programm) */
async function ms(aktion) {
  if (!kontoMoeglich() || A.beschaeftigt) return;
  A.meldung = "";
  try {
    if (aktion === "anmelden" || aktion === "anmelden_mit_code") {
      A.konto = await konto(aktion);
      zeigeWahl();
      starteLeerlauf();
      pollen();
    } else if (aktion === "anmeldung_abbrechen") {
      stoppePoll();
      A.konto = await konto(aktion);
      stoppeLeerlauf();
      A.meldung = "Anmeldung abgebrochen.";
      zeigeWahl();
      schuetteln();
    } else if (aktion === "code_seite_oeffnen") {
      await konto(aktion);
    } else if (aktion === "person_anlegen") {
      A.beschaeftigt = true;
      A.konto = await konto(aktion);
      A.start = await tresor("status");
      A.beschaeftigt = false;
      const p = person(A.start.ich) || (A.konto && A.konto.person);
      if (p) angemeldet(p, "neu"); else zeigeWahl();
    }
  } catch (e) {
    A.beschaeftigt = false;
    stoppeLeerlauf();
    fehler(fehlerText(e));
  }
}

function stoppePoll() { clearTimeout(A.poll); A.poll = 0; }
function pollen() {
  stoppePoll();
  A.poll = setTimeout(async () => {
    A.poll = 0;
    if (A.zustand !== "wahl") return;
    let ko;
    try { ko = await konto("status"); } catch (e) { pollen(); return; }
    const vorher = JSON.stringify(A.konto && A.konto.vorgang);
    A.konto = ko;
    const v = ko.vorgang || {};
    if (v.laeuft) { if (JSON.stringify(v) !== vorher) zeigeWahl({ fokus: false }); pollen(); return; }
    stoppeLeerlauf();
    if (ko.angemeldet && ko.person) {
      try { A.start = await tresor("status"); } catch (e) { /* dann mit dem, was da ist */ }
      angemeldet(person(A.start && A.start.ich) || ko.person);
      return;
    }
    if (ko.angemeldet) { A.meldung = ""; zeigeWahl(); return; }   // angemeldet, aber noch keiner Person zugeordnet
    A.meldung = v.fehler || "Die Anmeldung bei Microsoft hat nicht geklappt.";
    zeigeWahl({ fokus: false });
    schuetteln();
  }, 1000);
}

/* ------------------------------------------------------------------ Abmelden */
async function abmelden() {
  if (!A.el || A.zustand !== "weg" || A.beschaeftigt) return;
  ruheStoppen();
  if (vorschau()) {                                            // Vorschau: nur zeigen, nichts speichern
    A.start = { ...(A.start || {}), ich: "" };
    await schliessen(); zeigeWahl(); return;
  }
  if (imWeb()) {                                               // Browser: Sitzung des Geräts beenden, dann wieder die Nummer
    const p = A.start && person(A.start.ich);
    A.tafel.innerHTML = kopfHtml("Bis bald" + (p && vorname(p) ? ", " + esc(vorname(p)) : "") + ".", "Du bist auf diesem Gerät abgemeldet.");
    const fertig = schliessen();
    let ok = true;
    try { const r = await fetch("/abmelden", { method: "POST", credentials: "same-origin" }); ok = r.ok || r.status === 401; } catch (e) { ok = false; }
    await fertig;
    if (ok) { location.reload(); return; }
    zeigeWahl(); fehler("Abmelden hat nicht geklappt – ist der Rechner noch erreichbar?");
    return;
  }
  A.beschaeftigt = true;
  try {
    const ko = kontoMoeglich() ? await konto("status").catch(() => null) : null;
    if (ko && ko.angemeldet && ko.person) {
      // Wer mit Microsoft angemeldet ist, ist es fest – abmelden heißt hier auch: Anmeldung auf diesem Rechner löschen
      if (!confirm("Abmelden? Du bist mit Microsoft angemeldet – die gespeicherte Anmeldung wird auf diesem Rechner gelöscht.")) { A.beschaeftigt = false; return; }
      await konto("abmelden");
    }
    A.start = await tresor("abmelden");
    A.konto = kontoMoeglich() ? await konto("status").catch(() => null) : null;
  } catch (e) {
    A.beschaeftigt = false;
    if (typeof window.zeigeMeldung === "function") window.zeigeMeldung(fehlerText(e), "x", true); else alert(fehlerText(e));
    return;
  }
  A.beschaeftigt = false;
  A.meldung = "";
  A.tafel.innerHTML = wahlHtml();
  await schliessen();
  ["odin-ich", "odin-ich-urlaub"].forEach((n) => window.dispatchEvent(new Event(n)));
  if (typeof window.cockpitZeichne === "function") { try { window.cockpitZeichne(); } catch (e) { /* egal */ } }
  zeigeWahl();
}

/* ------------------------------------------------------------------ Bedienung */
function einstellungKlick(t) {
  if (t.dataset.anmEinst === "animation") {
    A.einst.animation = t.dataset.wert;
    document.querySelectorAll('[data-anm-einst="animation"]').forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.wert === A.einst.animation)));
  } else if (t.dataset.anmEinst === "ton") {
    A.einst.ton = !!t.checked;
    document.querySelectorAll('[data-anm-einst="ton"]').forEach((b) => { b.checked = A.einst.ton; });
    if (A.einst.ton && Ton.bereit()) { const z = Ton.jetzt() + 0.02; Ton.tick(z, 0.06); Ton.tick(z + 0.07, 0.045); Ton.klack(z + 0.16); setTimeout(() => Ton.stopp(), 400); }
  } else return;
  einstSpeichern();
  document.querySelectorAll(".anm-einst summary").forEach((s) => { s.textContent = einstKurz(); });
}

/* PIN-Ansicht: Ziffern und Löschen wirken überall auf der Tafel, Esc führt zurück zur Personenwahl */
function pinTaste(ev) {
  if (ev.key === "Escape") { ev.preventDefault(); zeigeWahl(); return; }
  if (ev.ctrlKey || ev.metaKey || ev.altKey || ev.target.id === "anm-pin-feld") return;
  if (/^[0-9]$/.test(ev.key)) { ev.preventDefault(); pinTippen(ev.key); const f = pinFeld(); if (f && !f.disabled) f.focus({ preventScroll: true }); }
  else if (ev.key === "Backspace") { ev.preventDefault(); pinLoeschen(); }
}

function pfeilTaste(ev) {
  const kacheln = [...A.tafel.querySelectorAll(".anm-person")];
  const i = kacheln.indexOf(document.activeElement);
  if (i < 0) return;
  const spalten = getComputedStyle(kacheln[0].parentElement).gridTemplateColumns.split(" ").filter(Boolean).length || 1;
  const sprung = { ArrowRight: 1, ArrowLeft: -1, ArrowDown: spalten, ArrowUp: -spalten, Home: -i, End: kacheln.length - 1 - i }[ev.key];
  if (sprung === undefined) return;
  ev.preventDefault();
  const ziel = kacheln[Math.max(0, Math.min(kacheln.length - 1, i + sprung))];
  kacheln.forEach((k) => { k.tabIndex = k === ziel ? 0 : -1; });
  ziel.focus();
}

function verdrahten() {
  const el = A.el;
  el.addEventListener("click", (ev) => {
    if (A.zustand === "oeffnet") { ueberspringen(); return; }
    const t = ev.target.closest("[data-anm]");
    if (!t || A.zustand !== "wahl") return;
    switch (t.dataset.anm) {
      case "person": personWaehlen(t); break;
      case "zurueck": zeigeWahl(); break;
      case "taste": pinTippen(t.dataset.wert); break;
      case "loeschen": pinLoeschen(); break;
      case "ms": ms("anmelden"); break;
      case "ms-code": ms("anmelden_mit_code"); break;
      case "ms-abbrechen": ms("anmeldung_abbrechen"); break;
      case "ms-seite": ms("code_seite_oeffnen"); break;
      case "ms-neu": ms("person_anlegen"); break;
      case "ms-kopieren": {
        const code = A.konto && A.konto.vorgang && A.konto.vorgang.code && A.konto.vorgang.code.code;
        if (code && navigator.clipboard) navigator.clipboard.writeText(code).then(() => { t.textContent = "Kopiert"; setTimeout(() => { t.textContent = "Code kopieren"; }, 1400); }).catch(() => {});
        break;
      }
    }
  });
  el.addEventListener("submit", (ev) => {
    const f = ev.target.closest("[data-anm-form]");
    if (!f) return;
    ev.preventDefault();
    if (A.zustand !== "wahl") return;
    if (f.dataset.anmForm === "pin") pinAbschicken(); else neuAnlegen(f);
  });
  el.addEventListener("input", (ev) => { if (ev.target.id === "anm-pin-feld") pinGeaendert(); });
  // Ziffernfeld: der Fokus bleibt im PIN-Feld (Maus/Touch), damit die Tastatur weiter tippt
  el.addEventListener("pointerdown", (ev) => { if (ev.target.closest && ev.target.closest(".anm-taste") && pinFeld()) ev.preventDefault(); });
  el.addEventListener("keydown", (ev) => {
    if (A.zustand === "oeffnet" && ["Enter", "Escape", " "].includes(ev.key)) { ev.preventDefault(); ueberspringen(); }
    else if (A.zustand === "wahl" && A.pin) pinTaste(ev);
    else if (A.zustand === "wahl" && ev.target.closest && ev.target.closest(".anm-personen")) pfeilTaste(ev);
    ev.stopPropagation();                                      // Tastenkürzel der Bereiche dahinter bleiben ruhig
  });
  // Auch ohne Fokus im Tresor (Start ohne Klick): Taste überspringt
  window.addEventListener("keydown", (ev) => {
    if (A.zustand === "oeffnet" && ["Enter", "Escape", " "].includes(ev.key)) { ev.preventDefault(); ev.stopPropagation(); ueberspringen(); }
  }, true);
  ["dragover", "drop", "paste"].forEach((n) => el.addEventListener(n, (ev) => { ev.stopPropagation(); if (n !== "paste") ev.preventDefault(); }));
  // Licht wandert über die Kachel unter der Maus
  el.addEventListener("pointermove", (ev) => {
    if (!feineMaus() || reduziert()) return;
    const k = ev.target.closest && ev.target.closest(".anm-person");
    if (k) { const r = k.getBoundingClientRect(); k.style.setProperty("--mx", (ev.clientX - r.left) + "px"); k.style.setProperty("--my", (ev.clientY - r.top) + "px"); }
    if (A.zustand !== "wahl") return;
    // Der Tresor folgt der Maus ein klein wenig (Neigung und Glanzlicht)
    const t = $(".anm-tresor", el).getBoundingClientRect();
    const x = Math.max(-1, Math.min(1, (ev.clientX - t.left - t.width / 2) / innerWidth * 2));
    const y = Math.max(-1, Math.min(1, (ev.clientY - t.top - t.height / 2) / innerHeight * 2));
    $(".anm-kipp", el).style.transform = `rotateX(${(-y * 3.2).toFixed(2)}deg) rotateY(${(x * 4.2).toFixed(2)}deg)`;
    $(".anm-glanz i", el).style.transform = `translate(${(x * 9).toFixed(1)}%, ${(y * 9).toFixed(1)}%)`;
  });
  el.addEventListener("pointerleave", () => {
    $(".anm-kipp", el).style.transform = "";
    $(".anm-glanz i", el).style.transform = "";
  });
  // Einstellungen: auf dem Anmeldebildschirm und auf der Seite „Datenquellen“
  document.addEventListener("click", (ev) => { const t = ev.target.closest && ev.target.closest("[data-anm-einst]"); if (t && t.tagName === "BUTTON") einstellungKlick(t); });
  document.addEventListener("change", (ev) => { const t = ev.target.closest && ev.target.closest("[data-anm-einst]"); if (t && t.tagName === "INPUT") einstellungKlick(t); });
  const knopf = $("#abmelden-knopf");
  if (knopf) knopf.addEventListener("click", abmelden);
  addEventListener("resize", () => { if (A.zustand === "oeffnet") strahlSetzen(); });
}

/* Für die Seite „Datenquellen“: Anmeldung als Karte (cockpit.js reicht seine Karten-Hülle herein) – eigene PIN ändern,
   Einstellungen dieses Rechners (angemeldet bleiben, automatische Sperre), für Verwalter: PINs zurücksetzen. */
const K = { offen: false, meldung: "", fehler: false, team: null, teamFehler: "" };
const pinFeldHtml = (name, label, auto) => '<label class="anm-k-feld"><span>' + label + '</span><input type="password" name="' + name + '" inputmode="numeric" pattern="[0-9]*" maxlength="8" autocomplete="' + auto + '" spellcheck="false"></label>';
function karteInhalt() {
  const st = A.start || {}, e = st.einstellungen, ich = st.ich && person(st.ich);
  let html = '<div class="anm-k-abschnitt"><div class="anm-k-zeile"><div><b>Deine PIN</b><span class="anm-k-leise">' +
    (!ich ? "Niemand angemeldet." : st.meine_pin ? "Festgelegt" + (st.pin_gesetzt_am ? " am " + esc(datumKurz(st.pin_gesetzt_am)) : "") + "." :
      st.ich_fest ? "Du bist mit Microsoft angemeldet – eine PIN brauchst du nur ohne Microsoft." : "Noch keine PIN festgelegt.") + "</span></div>" +
    (ich && !K.offen ? '<button type="button" class="btn" data-anm-k="pin-offen">' + (st.meine_pin ? "PIN ändern" : "PIN festlegen") + "</button>" : "") + "</div>";
  if (ich && K.offen) {
    html += '<form class="anm-k-form" data-anm-k-form="pin">' + (st.meine_pin ? pinFeldHtml("alt", "Bisherige PIN", "current-password") : "") +
      pinFeldHtml("neu", "Neue PIN", "new-password") + pinFeldHtml("wdh", "Wiederholen", "new-password") +
      '<div class="quelle-knoepfe"><button type="submit" class="btn btn-primaer">Speichern</button><button type="button" class="btn" data-anm-k="pin-zu">Abbrechen</button></div></form>';
  }
  html += "</div>";
  if (e) {
    html += '<div class="anm-k-abschnitt"><b>An diesem Rechner</b>' +
      '<label class="anm-schalter"><input type="checkbox" data-anm-k="bleiben"' + (e.bleiben ? " checked" : "") + "> Angemeldet bleiben, bis ich mich abmelde</label>" +
      '<span class="anm-k-leise">' + (e.bleiben ? (e.sicher ? "Verschlüsselt und nur für dein Benutzerkonto auf diesem Rechner gemerkt." : "Auf diesem Rechner gibt es keinen sicheren Speicher – gemerkt wird nur bis zum Schließen von ODIN.")
        : "Bei jedem Start fragt ODIN nach der PIN.") + "</span>" +
      '<label class="anm-k-feld waagerecht"><span>Automatisch sperren nach</span><select data-anm-k="sperre">' +
      (e.sperre_moeglich || [0, 5, 15, 30, 60]).map((m) => '<option value="' + m + '"' + (m === e.sperre_minuten ? " selected" : "") + ">" + (m ? m + " Minuten ohne Eingabe" : "nie") + "</option>").join("") +
      "</select></label></div>";
  }
  if (st.verwalter && !st.web) {
    html += '<details class="anm-k-abschnitt anm-k-team" data-anm-k="team"' + (K.team ? " open" : "") + "><summary><b>PINs im Team</b><span class=\"anm-k-leise\"> · nur Verwalter</span></summary>" +
      (K.teamFehler ? '<div class="quelle-fehler">' + esc(K.teamFehler) + "</div>" : !K.team ? '<span class="anm-k-leise">Wird geladen …</span>' :
        '<ul class="anm-k-liste">' + K.team.map((p) => "<li>" + '<span class="anm-avatar klein" style="--farbe:' + farbe(p.farbe) + '" aria-hidden="true">' + kuerzel(p) + "</span>" +
          '<span class="anm-k-name">' + esc(p.name) + '<span class="anm-k-leise">' + (p.pin ? "PIN seit " + esc(datumKurz(p.gesetzt_am)) : p.zurueckgesetzt ? "zurückgesetzt am " + esc(datumKurz(p.zurueckgesetzt.am)) + " von " + esc(p.zurueckgesetzt.von_name) : "noch keine PIN") + "</span></span>" +
          (p.pin && p.id !== st.ich ? '<button type="button" class="btn" data-anm-k="zuruecksetzen" data-id="' + esc(p.id) + '" data-name="' + esc(p.name) + '">Zurücksetzen</button>' : "") + "</li>").join("") + "</ul>" +
        '<span class="anm-k-leise">Nach dem Zurücksetzen legt die Person beim nächsten Anmelden eine neue PIN fest und sieht, wer es war.</span>') + "</details>";
  }
  html += '<div class="anm-k-abschnitt"><b>Anmeldebildschirm</b><span class="anm-k-leise">Einmal am Tag öffnet sich der Tresor ausführlich, sonst nur kurz. Klick oder Taste überspringt. ' +
    (imWeb() ? "Gilt für dieses Gerät." : "Gilt für diesen Rechner.") + "</span>" + einstHtml() + "</div>";
  if (K.meldung) html += '<div class="' + (K.fehler ? "quelle-fehler" : "anm-k-ok") + '" role="status">' + esc(K.meldung) + "</div>";
  html += '<div class="quelle-knoepfe"><button type="button" class="btn" data-anm-abmelden>Abmelden</button></div>';
  return html;
}
function karteNeu(fokus) {
  document.querySelectorAll("[data-anm-karte]").forEach((el) => { el.innerHTML = karteInhalt(); });
  if (fokus) { const f = document.querySelector("[data-anm-karte] " + fokus); if (f) f.focus(); }
}
function karteMeldung(text, istFehler = false) { K.meldung = text; K.fehler = istFehler; karteNeu(); }
async function teamLaden() {
  try { K.team = await tresor("pin_uebersicht"); K.teamFehler = ""; } catch (e) { K.teamFehler = fehlerText(e); K.team = []; }
  karteNeu();
}
document.addEventListener("click", async (ev) => {
  const t = ev.target.closest && ev.target.closest("[data-anm-karte] [data-anm-k]");
  if (!t || t.tagName === "DETAILS" || t.tagName === "INPUT" || t.tagName === "SELECT") return;
  const art = t.dataset.anmK;
  if (art === "pin-offen") { K.offen = true; K.meldung = ""; karteNeu("input"); }
  else if (art === "pin-zu") { K.offen = false; karteNeu(); }
  else if (art === "zuruecksetzen") {
    if (!confirm("PIN von " + t.dataset.name + " zurücksetzen? " + t.dataset.name.split(" ")[0] + " legt beim nächsten Anmelden eine neue fest.")) return;
    t.disabled = true;
    try { const r = await tresor("pin_zuruecksetzen", t.dataset.id); K.team = r.uebersicht; karteMeldung(r.meldung); A.start = await tresor("status"); }
    catch (e) { karteMeldung(fehlerText(e), true); }
  }
});
document.addEventListener("toggle", (ev) => {
  const d = ev.target;
  if (d && d.matches && d.matches("[data-anm-karte] details[data-anm-k='team']") && d.open && !K.team) teamLaden();
}, true);
document.addEventListener("change", async (ev) => {
  const t = ev.target.closest && ev.target.closest("[data-anm-karte] [data-anm-k]");
  if (!t || !A.start || !A.start.einstellungen) return;
  const e = A.start.einstellungen;
  const bleiben = t.dataset.anmK === "bleiben" ? t.checked : e.bleiben;
  const minuten = t.dataset.anmK === "sperre" ? Number(t.value) : e.sperre_minuten;
  try { const st = await tresor("einstellungen_speichern", bleiben, minuten); A.start = st; ruheStarten(); karteMeldung(st.meldung); }
  catch (x) { karteMeldung(fehlerText(x), true); }
});
document.addEventListener("submit", async (ev) => {
  const f = ev.target.closest && ev.target.closest("[data-anm-karte] [data-anm-k-form='pin']");
  if (!f) return;
  ev.preventDefault();
  const d = new FormData(f), knopf = f.querySelector("[type=submit]");
  if (knopf) knopf.disabled = true;
  try {
    const st = await tresor("pin_aendern", String(d.get("alt") || ""), String(d.get("neu") || ""), String(d.get("wdh") || ""));
    A.start = st; K.offen = false; karteMeldung(st.meldung || "PIN geändert.");
  } catch (e) {
    if (knopf) knopf.disabled = false;
    K.meldung = fehlerText(e); K.fehler = true;
    let m = f.parentElement.querySelector(".anm-k-formfehler");
    if (!m) { m = document.createElement("div"); m.className = "quelle-fehler anm-k-formfehler"; m.setAttribute("role", "alert"); f.appendChild(m); }
    m.textContent = K.meldung;
  }
});

window.odinAnmeldung = {
  karte(karte) {
    const st = A.start || {}, ich = st.ich && person(st.ich);
    K.meldung = ""; K.team = null; K.teamFehler = "";
    return karte("Anmeldung & PIN", ich ? "angemeldet als " + esc(ich.name) : "niemand angemeldet",
      '<div class="anm-karte" data-anm-karte>' + karteInhalt() + "</div>");
  },
  abmelden,
  anmelden: anmeldenLassen,
};
document.addEventListener("click", (ev) => { if (ev.target.closest && ev.target.closest("[data-anm-abmelden]")) abmelden(); });

if (window.pywebview && window.pywebview.api) start(); else addEventListener("pywebviewready", start, { once: true });
})();
