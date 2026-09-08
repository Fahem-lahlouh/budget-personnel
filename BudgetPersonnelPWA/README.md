# Budget Personnel — version PWA

Application web installable sur iPhone, **sans Mac, sans Xcode, sans Sideloadly
et sans abonnement Apple**. Même modèle de données et mêmes règles métier que
l'application SwiftUI du dossier `BudgetPersonnel/`, qui reste inchangée et
sert de référence fonctionnelle.

Une fois ajoutée à l'écran d'accueil depuis Safari, elle s'ouvre en plein
écran, fonctionne hors ligne, et ne se réinstalle **jamais** — il n'y a pas de
limite des 7 jours ici, puisqu'il n'y a pas de signature de code.

---

## Démarrer

```bash
cd BudgetPersonnelPWA
npm install
npm run dev      # http://localhost:5173/fahem_c-/
```

> Le serveur de développement sert l'app sous `/fahem_c-/`, exactement comme
> GitHub Pages : le scope du service worker et le `start_url` du manifest en
> dépendent, et une incohérence entre dev et production casserait
> l'installation à l'écran d'accueil.

| Commande | Rôle |
|---|---|
| `npm run dev` | Serveur de développement |
| `npm run build` | Build de production (`tsc -b` puis `vite build`) |
| `npm run preview` | Sert le build tel qu'il sera en ligne |
| `npm run lint` | ESLint, zéro avertissement toléré |
| `npm test` | Tests unitaires (Vitest) |

---

## Installer sur iPhone

1. Ouvrir l'URL de l'app **dans Safari** (pas Chrome : sur iOS, seul Safari
   sait ajouter une PWA à l'écran d'accueil).
2. Appuyer sur le bouton **Partager** (carré avec une flèche).
3. Choisir **Sur l'écran d'accueil**.
4. Valider avec **Ajouter**.
5. Lancer **Budget** depuis la nouvelle icône.

L'app s'ouvre alors sans la barre d'adresse de Safari, avec sa propre icône et
son propre basculeur d'application.

**Première ouverture** : gardez une connexion le temps du premier chargement.
Ensuite, tout fonctionne hors ligne.

---

## Sauvegardez régulièrement — ce n'est pas optionnel

Une PWA n'offre pas les mêmes garanties de conservation qu'une application
installée depuis l'App Store :

- effacer les données de navigation de Safari **efface la base** ;
- iOS peut évincer le stockage d'un site resté longtemps inutilisé ;
- désinstaller l'icône de l'écran d'accueil peut emporter les données.

L'app demande automatiquement le **stockage persistant**
(`navigator.storage.persist()`), que Safari accorde ou non — l'écran Réglages
affiche l'état réel obtenu. Mais le vrai filet de sécurité, c'est l'export :

**Réglages → Sauvegarde → Exporter une sauvegarde (JSON)**

Le fichier contient tout (dépenses, catégories, enseignes, récurrentes,
budgets mensuels, préférences) avec sa version de format et sa date.
**Réglages → Restaurer une sauvegarde** le relit, après validation du format
et affichage d'un récapitulatif à confirmer. Rien n'est écrasé en silence.

Un **export CSV** (séparateur `;`, décimale `,`, BOM UTF-8) est également
disponible pour ouvrir les données dans Excel ou Numbers.

---

## Architecture

```
BudgetPersonnelPWA/
├── src/
│   ├── app/            Contextes (données, verrouillage, notifications), coquille, onglets
│   ├── components/     Briques réutilisables + graphiques SVG
│   ├── data/           Jeu de démonstration repris du classeur Excel
│   ├── design-system/  Jetons CSS, palette validée, icônes
│   ├── features/       dashboard · expenses · analytics · year · settings · security · recurring
│   ├── hooks/          Gestes (balayage entre les mois)
│   ├── models/         Types et helpers de dates
│   ├── repositories/   Schéma Dexie et accès aux données
│   ├── services/       BudgetEngine, formatage, PIN, WebAuthn, sauvegarde, CSV
│   └── utils/          Haptique, téléchargement
└── tests/              Vitest (BudgetEngine, repositories, sauvegarde/CSV)
```

Le flux est strictement descendant :

```
UI → services (BudgetEngine) → repositories → IndexedDB
```

Aucun composant ne calcule un agrégat. Tout passe par **`BudgetEngine`**, un
ensemble de **fonctions pures** — mêmes entrées, mêmes sorties, aucun accès à
la base ni au DOM. C'est ce qui le rend testable sans navigateur, et ce qui
empêche un calcul de diverger d'un écran à l'autre.

### Catégories et enseignes par identifiant

Différence assumée avec la version Swift, qui stockait les **noms** dans chaque
dépense : ici les dépenses référencent un **identifiant**. Renommer « Courses »
en « Alimentation » ne réécrit aucune dépense et ne peut pas casser
l'historique. Un test le vérifie explicitement.

### Un seul composant affiche un montant

`<AmountText amount={…} confidential={…} />` est le **seul** endroit du code
qui met un montant à l'écran. Un nouvel écran hérite donc automatiquement des
règles de confidentialité : il est impossible d'oublier de masquer une valeur.

---

## Confidentialité

**Code PIN à 6 chiffres.** Jamais stocké en clair : seule une empreinte
PBKDF2-SHA256 (310 000 itérations, sel aléatoire de 16 octets) est conservée,
et la comparaison se fait en temps constant. Verrouillage automatique au retour
d'arrière-plan après 2 minutes, temporisation progressive après 5 échecs
(30 s, 60 s, 120 s… plafonnée à 5 minutes).

**Face ID / Touch ID via WebAuthn**, en option. L'app crée une paire de clés
protégée par l'authentificateur de l'appareil, puis **vérifie réellement la
signature** à chaque déverrouillage (ECDSA P-256 ou RSA, conversion DER → brut
comprise). Rien n'est simulé : une signature invalide est rejetée. Si aucun
authentificateur n'est disponible, le réglage est désactivé et le PIN reste le
seul chemin.

**Dépenses confidentielles.** Une dépense marquée « Confidentiel » reste
masquée (`•••• €`) même après le déverrouillage global, jusqu'à une
authentification dédiée valable le temps de la session.

### Limite, énoncée franchement

Ce verrou protège l'**affichage**. Il n'y a pas de chiffrement de la base :
IndexedDB reste lisible par qui ouvre les outils de développement du
navigateur, et la vérification WebAuthn a lieu dans la page, pas sur un
serveur. C'est efficace contre un accès opportuniste au téléphone, pas contre
un attaquant technique ayant déjà l'appareil déverrouillé en main. La vraie
protection des données au repos reste le code de déverrouillage de l'iPhone,
qui chiffre le stockage du système.

---

## Vos données ne sortent pas de l'appareil

- Aucun compte, aucun serveur, aucune synchronisation.
- Aucun Google Analytics, aucune télémétrie, aucun traceur.
- Aucun appel réseau contenant vos données : une politique de sécurité de
  contenu (`Content-Security-Policy`) déclarée dans `index.html` limite
  `connect-src` à l'origine de l'app. Les seules requêtes concernent ses
  propres fichiers.
- Aucune dépendance nécessitant une clé d'API. Trois dépendances de production
  en tout : `react`, `react-dom`, `dexie`.

---

## Graphiques

Écrits en SVG à la main plutôt qu'avec une bibliothèque : pour la demi-douzaine
de formes utilisées, une dépendance externe pèserait plus lourd que le code
qu'elle remplace et se laisserait moins bien styliser.

La palette catégorielle (6 teintes, ordre fixe, jamais cyclé) a été **validée
par outil** dans les deux thèmes : bande de clarté, plancher de chroma,
séparation deutéranope et tritanope entre teintes voisines, plancher en vision
normale, et contraste sur la surface. Au-delà de six catégories, le reste est
regroupé sous « Autres » avec un gris réservé — jamais une septième teinte
générée.

L'identité ne repose jamais sur la seule couleur : chaque légende porte son
libellé et sa part, et le donut propose une table de données dépliable.

---

## Déploiement — GitHub Pages

Le workflow `.github/workflows/pwa-deploy.yml` enchaîne à chaque push :

```
npm ci → lint → tests → build → déploiement Pages
```

### Activer Pages, une seule fois

1. Dépôt GitHub → **Settings** → **Pages**
2. **Source** : choisir **GitHub Actions** (et non « Deploy from a branch »)
3. Relancer le workflow (**Actions** → *Déploiement PWA* → **Run workflow**)

L'URL sera :

```
https://fahem-lahlouh.github.io/fahem_c-/
```

> **Branche de déploiement.** L'environnement `github-pages` restreint par
> défaut les déploiements à la branche par défaut du dépôt. Le workflow se
> déclenche aussi sur les branches `claude/**` pour valider lint, tests et
> build, mais tant que la branche n'est pas fusionnée dans `master`, l'étape de
> publication peut être refusée. Le chemin fiable : fusionner dans `master`.
> Sinon, autoriser explicitement la branche dans
> **Settings → Environments → github-pages → Deployment branches**.

### Domaine personnalisé

Définir `VITE_BASE=/` dans l'étape de build du workflow, et ajouter un fichier
`public/CNAME`. Le manifest et le service worker suivent automatiquement.

---

## Compatibilité Safari / iOS — ce qu'il faut savoir

| Sujet | État |
|---|---|
| Installation à l'écran d'accueil | Safari uniquement ; Chrome iOS ne le propose pas |
| Mode plein écran | `display: standalone` + `apple-mobile-web-app-capable` |
| Encoche / Dynamic Island | Gérées via `viewport-fit=cover` et `env(safe-area-inset-*)` |
| Retour haptique | **Indisponible** : `navigator.vibrate` n'existe pas sur iOS. L'appel est ignoré ; aucune fonction n'en dépend |
| Notifications push | Non utilisées (elles exigeraient iOS 16.4+ et l'app installée) |
| Persistance du stockage | Demandée, mais Safari peut la refuser — d'où l'insistance sur les sauvegardes |
| WebAuthn | Requiert HTTPS et un domaine stable ; fonctionne sur `*.github.io` |
| Téléchargement d'un fichier | Ouvre la feuille de partage iOS plutôt qu'un dossier « Téléchargements » |

---

## Migrations futures

`SCHEMA_VERSION` (dans `src/models/types.ts`) accompagne le schéma Dexie et
voyage dans chaque sauvegarde JSON. Pour faire évoluer le modèle :

```ts
this.version(2)
  .stores({ /* … */ })
  .upgrade(async (tx) => { /* transformation des données existantes */ })
```

Ne jamais modifier une `version()` déjà publiée : Dexie rejoue les migrations
dans l'ordre, ce qui préserve les dépenses déjà saisies. Une sauvegarde dont le
format est plus récent que l'app est refusée à l'import, avec un message
explicite.
