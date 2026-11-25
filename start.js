/* Läuft vor allem anderen (eigene Datei, weil die Seite keine eingebetteten Skripte erlaubt). */
// Ohne „Microsoft Edge WebView2“ zeigt Windows die Seite im alten Internet Explorer – damit läuft ODIN nicht.
if (document.documentMode) {
  document.body.innerHTML = '<div style="font:16px Segoe UI,sans-serif;padding:40px;max-width:640px">' +
    '<h2>Microsoft Edge WebView2 fehlt</h2><p>ODIN braucht die kostenlose „Microsoft Edge WebView2 Runtime“. ' +
    'Bitte bei Microsoft herunterladen (Suche: „WebView2 Runtime herunterladen“, Evergreen), installieren und ODIN neu starten.</p></div>';
}
