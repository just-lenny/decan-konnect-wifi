# Decan Konnect website (GitHub Pages)

Static public site: landing page, interactive customer-portal **preview (sample data)** and setup guide.
GitHub Pages only hosts static files, so the real platform (payments, vouchers, router control, database) runs separately
(Vercel + Supabase, see `decan-konnect-wifi.zip`). This site links to it once you set `appUrl` in `config.js`.

## Publish
1. Create a GitHub repository and upload everything in this folder (including the hidden `.github` and `.nojekyll`).
2. Repository **Settings > Pages > Source: GitHub Actions**. Push to `main`; the site goes live in about a minute at
   `https://USERNAME.github.io/REPO/` (all links are relative, so project URLs work).
3. Custom domain: Settings > Pages > Custom domain, add a DNS CNAME to `USERNAME.github.io`, tick Enforce HTTPS.
4. Edit `config.js`: add your WhatsApp/email now; add `appUrl` when the platform is deployed (buttons switch from "Get early access" to Register/Login automatically).
