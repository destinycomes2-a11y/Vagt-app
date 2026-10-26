# Vagt-app (PWA) – udgivelse
Mappen /workspace/opus/pwa (uden tools/) er hele appen. Den indeholder ingen vagter eller persondata.
Byg: ./build-pwa.sh   Test: cd ../test && node pwa.test.js
Vigtigt: Vælg en FAST adresse. Vagterne gemmes pr. adresse på telefonen, så hvis adressen skifter, starter appen tom.
Når adressen kendes: sæt APP_URL i app/src/05b_pwa.js og byg igen (så advarslen i mail-forhåndsvisningen linker til appen).
- GitHub Pages: gh auth login → gh repo create vagt-app --public → push → gh api -X POST repos/<bruger>/vagt-app/pages -f source[branch]=main -f source[path]=/
- Netlify: netlify deploy --dir . --prod (kræver konto/token); anonym udgivelse slettes efter 1 time hvis den ikke gøres krav på.
- Cloudflare Pages: npx wrangler pages deploy . --project-name vagt-app (kræver Cloudflare-konto).
