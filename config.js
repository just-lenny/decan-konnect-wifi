// Edit these three values. Leave appUrl empty until the full platform is deployed (e.g. on Vercel).
window.DK = {
  appUrl: "",                          // e.g. "https://app.decankonnect.co.ke"  (no trailing slash)
  whatsapp: "",                        // e.g. "254712345678"
  email: ""                            // e.g. "hello@decankonnect.co.ke"
};
document.addEventListener("DOMContentLoaded", function () {
  var c = window.DK, live = !!c.appUrl;
  document.querySelectorAll("[data-cta]").forEach(function (a) {
    var kind = a.getAttribute("data-cta");
    if (live) { a.href = c.appUrl + (kind === "login" ? "/login" : "/register"); return; }
    if (kind === "login") { a.style.display = "none"; return; }
    if (c.whatsapp) a.href = "https://wa.me/" + c.whatsapp + "?text=" + encodeURIComponent("Hi, I want to set up Wi-Fi billing for my business.");
    else if (c.email) a.href = "mailto:" + c.email + "?subject=Decan%20Konnect%20Wi-Fi%20billing";
    else a.href = "#contact";
    a.textContent = "Get early access";
  });
});
