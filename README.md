# Vagt-app

Offline vagt-app til SOSU-personale. Alle vagter, afvigelser og indstillinger gemmes kun lokalt på telefonen – intet sendes til en server.

Åbn appen: https://destinycomes2-a11y.github.io/Vagt-app/

## Google Kalender

Knappen **Forbind Google Kalender** bruger Google Identity Services i browseren (ingen server, ingen client secret). Vagterne hentes med læseadgang og gemmes kun lokalt på enheden – de committes ikke til dette repo.

Sådan opretter du OAuth-klient-id og sætter det ind:

1. Gå til [Google Cloud Console](https://console.cloud.google.com/) og vælg eller opret et projekt.
2. Aktivér **Google Calendar API** (APIs & Services → Library → Google Calendar API → Enable).
3. Opret samtykkeskærmen (APIs & Services → OAuth consent screen):
   - User type: **External**
   - Publishing status: **Testing**
   - Tilføj ejeren som testbruger (Test users).
4. Opret et OAuth-klient-id (APIs & Services → Credentials → Create credentials → OAuth client ID):
   - Application type: **Web application**
   - Authorized JavaScript origins: `https://destinycomes2-a11y.github.io`
5. Kopiér klient-id'et ind i `index.html` i konstanten `GOOGLE_CLIENT_ID` (erstat `INDSÆT_CLIENT_ID`).

Indtil pladsholderen er udskiftet, viser appen en kort besked og lader fil-importen virke som før. Scope er kun `https://www.googleapis.com/auth/calendar.readonly`.
