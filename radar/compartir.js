// Botones para reenviar el radar por WhatsApp o copiar su enlace (D-009: canales que no pasan por Gmail).
// Lo comparte la persona, desde su cuenta y si quiere; la página no envía nada. Vive aparte de radar.js para no tocar el
// cruce: solo mira cuándo radar.js pinta un resultado en #resultado.
(function () {
  var caja = document.getElementById("compartir"), res = document.getElementById("resultado");
  if (!caja || !res) return;
  var wa = document.getElementById("compartir-wa"), ok = document.getElementById("compartir-ok");
  function enlace() { return location.href.split("#")[0]; }
  function actualizar() {
    var resumen = res.querySelector(".resumen");
    caja.hidden = !resumen;
    ok.textContent = "";
    if (!resumen) return;
    var b = resumen.querySelector("b"), nombre = b ? b.textContent.trim() : "";
    wa.href = "https://wa.me/?text=" + encodeURIComponent("Radar de licitaciones gratis" + (nombre ? " de " + nombre : "") +
      ": los procesos abiertos de SECOP II que encajan con lo que la empresa ya ganó. " + enlace());
  }
  new MutationObserver(actualizar).observe(res, { childList: true });
  document.getElementById("compartir-copiar").addEventListener("click", function () {
    function hecho() { ok.textContent = "Enlace copiado."; }
    function aMano() { ok.textContent = "Copie este enlace: " + enlace(); }
    if (navigator.clipboard && window.isSecureContext) navigator.clipboard.writeText(enlace()).then(hecho, aMano);
    else aMano();
  });
})();
