# Budget Personnel — application iPhone

Application iPhone native de gestion de budget personnel, reprise et prolongement
du classeur Excel `Budget_Personnel_2026_APP_PRO.xlsx`.

**100 % local, 100 % gratuit** : SwiftUI, SwiftData, Swift Charts,
LocalAuthentication, Trousseau iOS. Aucune librairie tierce, aucun compte,
aucun serveur, aucun abonnement. L'app fonctionne sans connexion internet.

---

## Ouvrir le projet

```
BudgetPersonnel/BudgetPersonnel.xcodeproj
```

Ouvrez ce fichier dans Xcode 16 ou plus récent. Cible minimale : **iOS 17**
(SwiftData et `SectorMark` de Swift Charts en dépendent).

Le projet utilise les *groupes synchronisés* d'Xcode : tout fichier ajouté dans
le dossier `BudgetPersonnel/` est automatiquement pris en compte, sans passer par
le navigateur de projet.

---

## Installer sur votre iPhone avec un compte Apple gratuit

1. **Branchez l'iPhone** au Mac par câble et déverrouillez-le. À la première
   connexion, acceptez « Se fier à cet ordinateur ».
2. **Xcode ▸ Settings ▸ Accounts ▸ +** et connectez-vous avec votre identifiant
   Apple habituel. Un compte gratuit suffit, aucun paiement n'est demandé.
3. Dans Xcode, sélectionnez le projet **BudgetPersonnel** dans le navigateur,
   puis la cible **BudgetPersonnel** ▸ onglet **Signing & Capabilities** :
   - cochez **Automatically manage signing** ;
   - choisissez votre équipe dans **Team** (elle apparaît sous la forme
     « Votre Nom (Personal Team) ») ;
   - remplacez le **Bundle Identifier** `com.exemple.budgetpersonnel` par
     quelque chose d'unique, par exemple `com.votrenom.budgetpersonnel`.
     Xcode refuse un identifiant déjà utilisé par quelqu'un d'autre.
4. **Choisissez votre iPhone** dans le sélecteur d'appareil, en haut de la
   fenêtre, à la place du simulateur.
5. Appuyez sur **▶ Run** (`⌘R`).
6. Au premier lancement, l'iPhone refusera d'ouvrir l'app : allez dans
   **Réglages ▸ Général ▸ VPN et gestion de l'appareil**, touchez votre profil
   de développeur et **Faire confiance**. Relancez l'app.

### La limite des 7 jours — à lire avant de commencer

Avec un **compte Apple gratuit**, le certificat qui signe l'app est valable
**7 jours**. Passé ce délai, l'app refuse de s'ouvrir, avec un message du type
« l'app n'est plus disponible ». Ce n'est pas un défaut de l'app : c'est une
règle d'Apple, et **aucun moyen gratuit ne permet de la contourner**.

Concrètement :

- **Pour repartir pour 7 jours** : rebranchez l'iPhone et relancez `⌘R` depuis
  Xcode. L'opération prend une minute.
- **Vos données sont conservées** tant que vous ne supprimez pas l'app de
  l'iPhone. Une réinstallation par-dessus ne les efface pas. En revanche,
  **supprimer l'app efface toutes les données** — d'où l'export CSV des
  Réglages, à faire avant toute suppression.
- **Vous devez donc garder un Mac avec Xcode** et un câble à portée de main.
- Un **compte développeur Apple payant (99 $/an)** porte cette durée à un an et
  ouvre la distribution par TestFlight ou l'App Store. C'est la seule façon de
  s'affranchir du rendez-vous hebdomadaire. Ce n'est pas nécessaire pour utiliser
  l'app, mais il faut le savoir.

Un compte gratuit limite aussi le nombre d'identifiants d'app à 10 par période
de 7 jours — sans conséquence ici, une seule app étant concernée.

---

## Ce que fait l'application

### Suivi des dépenses
Date, catégorie, enseigne, description, montant, type (Fixe / Variable /
Exceptionnelle), montant prévu, écart, statut (Payé / À payer), remarque,
confidentiel. Saisie rapide : le clavier décimal s'ouvre directement sur le
montant, la catégorie se choisit d'un tap, « Ajouter » enregistre.

Balayage vers la gauche pour supprimer, vers la droite pour basculer
payé / à payer. Recherche et filtres par type et statut.

### Écart au budget
`écart = montant réel − montant prévu`. Positif et rouge = dépassement ; négatif
et vert = économie.

> Le classeur Excel calculait l'inverse (`prévu − réel`). La convention retenue
> ici est celle de la demande, et elle a l'avantage qu'un nombre rouge et positif
> signale toujours un dépassement.

Le montant prévu est repris automatiquement de la dépense récurrente dont la
description correspond — l'équivalent du `RECHERCHEV` du classeur, en direct
pendant la frappe.

### Dépenses récurrentes
Catégorie, enseigne, description, montant prévu, jour du mois, type, remarque,
confidentialité, actif/inactif. Elles servent à trois choses : fournir le montant
prévu, alimenter le rappel « À ne pas oublier » du mois en cours, et pré-remplir
la saisie en un tap.

Les 14 récurrentes du classeur sont pré-chargées.

### Tableau de bord mensuel
Anneau de consommation du budget (vert < 80 %, orange 80–100 %, rouge au-delà,
avec un arc de dépassement distinct), salaire, objectif d'épargne, total dépensé,
reste disponible, épargne réelle, nombre de dépenses. Prévisions de fin de mois
incluant les récurrentes pas encore saisies. Un conseil contextuel, choisi selon
la situation.

Navigation entre les mois par balayage horizontal ou par les flèches.

### Analyses
Anneau de répartition par catégorie (top 5 + « Autres »), classement des
enseignes, salaire vs dépenses mois par mois, évolution annuelle des dépenses,
répartition Fixe / Variable / Exceptionnelle, répartition Payé / À payer. Tout en
Swift Charts natif. Une bascule **Mois / Année** donne les mêmes indicateurs en
cumul annuel, plus le détail mois par mois.

### Confidentialité
Deux niveaux indépendants :

1. **Verrouillage global** — code à 6 chiffres, avec Face ID / Touch ID en
   option. Tant que l'app est verrouillée, tous les montants s'affichent
   `•••••• €`. L'app se re-verrouille dès qu'elle passe en arrière-plan.
2. **Dépenses confidentielles** — les lignes marquées « Confidentiel » restent
   masquées même après le déverrouillage global, jusqu'à une authentification
   dédiée valable le temps de la session (bouton œil dans la barre de
   navigation).

Cinq codes erronés d'affilée déclenchent une temporisation croissante (30 s,
60 s, 120 s… plafonnée à 5 minutes).

**Ce que le code protège vraiment.** Il est stocké haché (SHA-256 + sel
aléatoire de 32 octets) dans le Trousseau iOS, marqué
`WhenUnlockedThisDeviceOnly` : jamais en clair, jamais dans une sauvegarde, et il
ne quitte pas l'appareil. Il protège l'**affichage** des montants dans l'app.
Ce n'est **pas** un coffre-fort chiffré séparé : la base SwiftData est protégée
par le chiffrement du système, c'est-à-dire par le code de déverrouillage de
l'iPhone. C'est nettement mieux que le mécanisme du classeur Excel (dont le PIN
était lisible en clair dans le fichier), mais ce n'est pas du chiffrement de bout
en bout.

### Réglages
Catégories et enseignes (ajout, renommage avec report sur l'historique,
suppression, réordonnancement), libellés des types et statuts, dépenses
récurrentes, code PIN, Face ID, thème clair / sombre / automatique, export CSV,
rechargement de la démonstration, effacement total.

### Données de démonstration
Au premier lancement, l'app charge les 14 récurrentes et une vingtaine de
dépenses d'exemple sur le **mois en cours**, reprises de janvier du classeur,
avec un salaire de 3 000 € et un objectif d'épargne de 300 €. Deux dépenses sont
laissées « à payer » pour que le rappel des récurrentes soit visible tout de
suite.

**Réglages ▸ Mes données ▸ Tout effacer** vide la base ;
**Recharger les données de démonstration** la remet à l'état initial.

### Export CSV
Séparateur `;`, décimale `,`, BOM UTF-8 : le fichier s'ouvre directement dans
Excel et Numbers en français, accents compris. Vous pouvez choisir d'exclure les
dépenses confidentielles de l'export.

---

## Accessibilité

Dynamic Type sur tous les textes, mode sombre traité couleur par couleur (pas une
inversion), libellés VoiceOver sur les montants, les jauges et les lignes de
liste, respect de « Réduire les animations », cibles tactiles d'au moins 44 pt,
contrastes vérifiés dans les deux thèmes.

---

## Synchroniser avec iCloud (optionnel, gratuit, non activé)

CloudKit est inclus dans un compte Apple sans surcoût, mais **demande le compte
développeur payant** pour la capacité iCloud dans Xcode : un compte gratuit ne
permet pas d'ajouter la capacité CloudKit à une app. C'est la raison principale
pour laquelle la synchronisation n'est pas activée par défaut ici.

Si vous passez un jour au compte payant, la marche à suivre :

1. **Signing & Capabilities ▸ + Capability ▸ iCloud**, cochez **CloudKit** et
   créez un conteneur.
2. Ajoutez aussi la capacité **Background Modes ▸ Remote notifications**.
3. Dans `BudgetPersonnelApp.swift`, remplacez la configuration :
   ```swift
   let configuration = ModelConfiguration(
       schema: schema,
       isStoredInMemoryOnly: false,
       cloudKitDatabase: .automatic
   )
   ```
4. **Retirez les contraintes `@Attribute(.unique)`** de `MonthBudget.key`,
   `CategoryItem.name`, `MerchantItem.name` et `AppSettings.singletonKey` :
   CloudKit ne sait pas les reproduire et le conteneur refusera de démarrer.
   Le code vérifie déjà les doublons avant chaque insertion, la contrainte n'est
   qu'une ceinture de sécurité supplémentaire.

Le code PIN, lui, reste dans le Trousseau local et ne se synchronise pas — c'est
volontaire.

---

## Architecture

```
BudgetPersonnel/
├── App/              Point d'entrée, conteneur SwiftData, onglets, mois sélectionné
├── Models/           @Model SwiftData, énumérations, jeu de démonstration
├── Services/         Trousseau, verrouillage, moteur d'agrégation, export CSV
├── DesignSystem/     Palette, typographie, métriques, animations, composants
└── Views/            Lock · Dashboard · Expenses · Analytics · Year · Settings
```

Le découpage suit le principe MVVM : les vues ne calculent rien, elles affichent.
Tous les agrégats (`MonthSummary`, `YearSummary`, état des récurrentes) sont
produits par `BudgetEngine`, un ensemble de **fonctions pures** — mêmes entrées,
mêmes sorties — testables sans base de données ni interface.

Chaque écran mensuel construit sa requête SwiftData dans son `init`, bornée au
mois affiché : la base n'est jamais chargée en entier.

Un seul composant, `AmountText`, met un montant à l'écran. Tant qu'il est utilisé
partout, il est impossible d'oublier de masquer une valeur quelque part.

---

## Limites assumées

- **Pas de connexion bancaire.** Tous les agrégateurs bancaires sont payants. Les
  dépenses se saisissent à la main, comme dans le classeur.
- **Trois types et deux statuts, figés.** Ils pilotent les calculs et les
  graphiques. Leurs **libellés** sont modifiables dans les Réglages ; en ajouter
  un quatrième supposerait de redéfinir ce que les analyses doivent en faire.
- **Pas de sauvegarde hors de l'appareil** tant qu'iCloud n'est pas activé. La
  sauvegarde iCloud de l'iPhone, elle, inclut bien les données de l'app.
- **iPhone uniquement**, en portrait. L'iPad n'est pas ciblé.
