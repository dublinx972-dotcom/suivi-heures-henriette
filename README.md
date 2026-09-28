# Suivi des heures

PWA personnelle de suivi du temps de travail, conçue d'abord pour l'iPhone. Elle fonctionne sans compte, sans serveur de données et sans connexion après la première ouverture.

## Utilisation

1. Ouvrir l'application.
2. Toucher **ARRIVÉE**.
3. À la fin de la journée, toucher **DÉPART**.

Le pointage actif est conservé dans IndexedDB même si Safari ou l'application est complètement fermé. Les durées utilisent les timestamps réels, y compris lors des changements d'heure.

## Calendrier prévisionnel et règles

Le calendrier prévisionnel 2026 est intégré à l'application : jours travaillés, vendredis prévus, repos, congés, récupérations et journée de solidarité. Il sert uniquement de prévision. Une journée préremplie ne crée jamais d'heures réellement travaillées ou comptabilisées tant qu'elle n'est pas pointée ou confirmée dans l'éditeur.

Le bilan distingue toujours le **temps réel**, le **temps comptabilisé** et le **temps prévu**. Dans **Réglages > Poids des types de journée**, chaque type possède :

- un coefficient appliqué au temps réel ;
- un forfait horaire ajouté ou retiré ensuite.

Les valeurs initiales sont notamment `Travail x1`, `Astreinte x1 + 01:30` et `RTT / récupération x-1 journée`. Les coefficients liés à la date sont réglés séparément : `Dimanche x2` et `Jour férié x2`.

## Lancer sur un ordinateur

Le projet ne nécessite aucune installation de dépendances pour fonctionner. Depuis ce dossier :

```powershell
node scripts/server.mjs
```

Puis ouvrir [http://127.0.0.1:4173](http://127.0.0.1:4173).

Il est aussi possible d'utiliser tout serveur statique HTTPS. Ne pas ouvrir directement `index.html` avec une URL `file://`, car le service worker et l'installation PWA nécessitent HTTP(S).

## Installer sur iPhone

L'iPhone exige une adresse HTTPS publique ou locale approuvée.

1. Héberger le contenu de ce dossier sur un service statique HTTPS, par exemple GitHub Pages, Cloudflare Pages ou un hébergement personnel.
2. Ouvrir l'adresse dans **Safari**.
3. Toucher **Partager**.
4. Choisir **Sur l'écran d'accueil**.
5. Toucher **Ajouter**.

Après une première ouverture en ligne, l'application et ses fichiers sont mis en cache et restent utilisables hors connexion.

## Données et sauvegardes

- Les journées et réglages restent uniquement dans IndexedDB sur l'appareil.
- **Exporter une sauvegarde** crée un fichier JSON complet.
- **Importer une sauvegarde** permet de fusionner sans écraser ou de remplacer après confirmation.
- **Exporter Excel** crée `Suivi_heures_YYYY.xlsx` avec les feuilles `JOURNAL`, `MENSUEL`, `ANNUEL` et `PARAMÈTRES`.
- Les dates, heures et durées du classeur sont de vraies valeurs Excel, avec des formats horaires adaptés aux sommes.

Une suppression des données exige deux confirmations. Il est conseillé d'exporter régulièrement une sauvegarde JSON, notamment avant un changement d'iPhone ou de navigateur.

## Tests

Les tests de calcul utilisent uniquement Node.js :

```powershell
npm test
```

Ils couvrent les trois scénarios horaires obligatoires, les pauses, une période active, les jours sans pointage, les changements d'heure, les astreintes, les récupérations, les dimanches, les jours fériés et les coefficients personnalisés.

Le parcours navigateur complet nécessite Playwright :

```powershell
npm install
npm run test:e2e
```

Il vérifie aussi le chargement du calendrier prévisionnel 2026, la persistance après rechargement, la correction d'une journée, l'export Excel, l'export/import JSON, l'absence de débordement horizontal et le redémarrage hors connexion.

## Structure

- `index.html` : interface complète.
- `styles.css` : design mobile et ordinateur.
- `js/db.js` : persistance IndexedDB.
- `js/time.js` : calculs et formats horaires.
- `js/app.js` : navigation et interactions.
- `js/xlsx.js` : génération du véritable classeur Excel.
- `assets/calendrier-previsionnel-2026.json` : calendrier prévisionnel annuel intégré.
- `manifest.webmanifest` et `sw.js` : installation et fonctionnement hors connexion.

L'architecture permet d'ajouter plus tard un nouveau millésime de calendrier, des raccourcis iPhone, un widget, le NFC ou une synchronisation, sans que ces fonctions alourdissent l'usage actuel.

Les bibliothèques JavaScript utilisées dans le navigateur sont copiées dans `vendor/`. Leurs mentions sont dans `LICENSES.md`.
