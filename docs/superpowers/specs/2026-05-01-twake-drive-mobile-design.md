# Twake Drive Mobile — Design (v1)

**Date:** 2026-05-01
**Status:** Draft, en attente de revue utilisateur

## 1. Contexte & objectif

Construire une application mobile React Native (full-native) pour Twake Drive. La v1 est strictement read-only : l'utilisateur peut se connecter avec son adresse email (auto-discovery du domaine), parcourir ses fichiers, ses partages, ses récents et sa corbeille. Pas de download, pas de preview de contenu, pas de création de partage. Ces features arriveront dans des versions ultérieures.

Inspirations :
- Authentification : `linagora/cozy-flagship-app` (mécanisme `.well-known/twake-configuration`).
- UX listing : version mobile responsive de `twake-drive` web.
- Conventions de code : `cozy/cozy-guidelines` et `linagora/twake-guidelines`.

## 2. Périmètre v1

**Inclus :**
- Onboarding : welcome → saisie email → discovery → OIDC → session persistée.
- 4 sections via bottom tabs : Mes fichiers, Partagés avec moi, Récents, Corbeille.
- Navigation dans les dossiers de "Mes fichiers" et "Partagés".
- Tap sur fichier → bottom sheet métadonnées (read-only).
- Tap sur dossier → navigation dedans.
- Swipe-back (iOS et Android) sur la stack de navigation.
- Fil d'Ariane scrollable sous l'AppBar (style web mobile).
- Pull-to-refresh sur toutes les listes.
- Mode sombre auto (suit l'OS).
- i18n FR + EN.
- Logout.

**Exclus de la v1 :**
- Download de fichier.
- Preview natif (image, PDF, vidéo).
- Upload depuis l'appareil.
- Création/gestion de partage.
- Recherche.
- Offline (au-delà du cache mémoire de cozy-client).
- Notifications push.
- Realtime / sync continue.
- Biométrie (Face ID / Touch ID) à l'ouverture de l'app.
- Switch manuel light/dark.
- Sentry / crash reporting.

## 3. Stack technique

| Couche | Choix |
|---|---|
| Framework | React Native via Expo (managed) avec **Expo Prebuild** pour préserver la possibilité d'ajouter des modules natifs |
| Plateformes | iOS + Android |
| Routing | **Expo Router** (file-based) |
| UI lib | **React Native Paper** (Material Design 3) |
| Bottom sheet | **`@gorhom/bottom-sheet`** |
| Icônes | **`react-native-vector-icons`** (Material Community Icons, fourni par Paper) |
| API client | **`cozy-client`** (queries, hooks, cache, refresh token) |
| State global | cozy-client uniquement (pas de Redux ni Zustand au MVP) |
| i18n | **`react-i18next`** + **`expo-localization`** |
| Dates | **`date-fns`** + locales FR/EN |
| Token storage | **`expo-secure-store`** |
| Auth web | **`expo-web-browser`** (`openAuthSessionAsync`) |
| Logging | **`cozy-minilog`** |
| Tests | **Jest** + **`@testing-library/react-native`** + **`nock`** |
| TS | TypeScript strict |

## 4. Architecture & arborescence

```
twake-drive-mobile/
├── app.json                    # Config Expo (custom scheme `twakedrive`, plugins, splash)
├── app/                        # Expo Router (file-based routing)
│   ├── _layout.tsx             # Root layout: providers (Cozy, Paper, i18n, SafeArea, ErrorBoundary)
│   ├── index.tsx               # Splash / redirect selon état auth
│   ├── (auth)/
│   │   ├── _layout.tsx
│   │   ├── welcome.tsx         # Écran d'accueil
│   │   └── login.tsx           # Saisie email → discovery → OIDC
│   └── (drive)/                # Écrans authentifiés
│       ├── _layout.tsx         # Bottom tabs
│       ├── files/
│       │   ├── _layout.tsx     # Stack pour navigation dossiers
│       │   └── [...path].tsx   # Listing + nav dans dossiers
│       ├── shared/
│       │   ├── _layout.tsx
│       │   └── [...path].tsx
│       ├── recent.tsx
│       └── trash.tsx
├── src/
│   ├── auth/                   # Discovery, OIDC, register, token mgmt
│   │   ├── autodiscovery.ts    # extractDomain + fetchTwakeConfig (calque flagship)
│   │   ├── oidcFlow.ts         # InAppBrowser + parsing deep link callback
│   │   ├── tokenStorage.ts     # expo-secure-store wrappers
│   │   ├── useAuth.ts          # hook orchestrant la session (load, login, logout)
│   │   └── revocationListener.ts
│   ├── client/                 # cozy-client setup
│   │   ├── createClient.ts
│   │   └── queries.ts          # Query definitions (folder content, shared, recent, trash)
│   ├── ui/                     # Composants réutilisables
│   │   ├── FileRow.tsx
│   │   ├── FolderRow.tsx
│   │   ├── FileMetadataSheet.tsx
│   │   ├── Breadcrumb.tsx
│   │   ├── EmptyState.tsx
│   │   ├── ErrorState.tsx
│   │   ├── LoadingState.tsx
│   │   ├── AppBar.tsx
│   │   └── theme.ts            # MD3 light/dark theme + couleurs Twake
│   ├── i18n/
│   │   ├── index.ts
│   │   └── locales/
│   │       ├── fr.json
│   │       └── en.json
│   └── utils/
│       ├── fileIcons.ts        # Mapping mime → icône MCI
│       ├── formatters.ts       # Tailles, dates relatives
│       └── errorMessages.ts    # error → message i18n key
├── assets/
│   ├── icon.png
│   ├── splash.png
│   └── ...
└── package.json
```

**Couches & responsabilités :**

- **Auth layer** (`src/auth/`) — pure logique, isolée de l'UI, testable.
- **Data layer** = cozy-client. Pas de couche d'abstraction supplémentaire (YAGNI). Les écrans consomment `useQuery` directement.
- **UI primitives** (`src/ui/`) — composants visuels réutilisables, sans logique métier.
- **Routing** = Expo Router. Le `<CozyProvider>` est au **root layout**, partagé entre tous les groupes (auth + drive) et tous les onglets.

## 5. Flow d'authentification

Calque le flow `linagora/cozy-flagship-app` (`src/screens/login/components/functions/autodiscovery.ts`).

```
WelcomeScreen → LoginScreen → OIDC (InAppBrowser) → register → DriveScreen
```

### 5.1 Discovery

```ts
// src/auth/autodiscovery.ts
const extractDomain = (email: string): string | null => { /* split sur '@' */ }

const fetchTwakeConfiguration = async (domain: string): Promise<TwakeConfig | null> => {
  const url = `https://${domain}/.well-known/twake-configuration`
  const response = await fetch(url, { headers: { Accept: 'application/json' } })
  if (!response.ok) return null
  return response.json()
}

const getLoginUri = async (email: string): Promise<URL | null> => {
  const domain = extractDomain(email)
  if (!domain) return null
  const config = await fetchTwakeConfiguration(domain)
  if (!config?.['twake-flagship-login-uri']) return null
  const uri = new URL(config['twake-flagship-login-uri'])
  uri.searchParams.append('redirect_after_oidc', 'twakedrive://')
  return uri
}
```

### 5.2 OIDC

```ts
// src/auth/oidcFlow.ts
import * as WebBrowser from 'expo-web-browser'

const startOidcFlow = async (loginUri: URL): Promise<OidcCallback> => {
  const result = await WebBrowser.openAuthSessionAsync(
    loginUri.toString(),
    'twakedrive://'
  )
  if (result.type !== 'success') throw new UserCancelledError()
  return parseCallbackUrl(result.url) // { fqdn, registerToken, code? }
}
```

### 5.3 Register cozy-client

Avec `fqdn` + `registerToken`, on construit un `CozyClient` initial, on appelle son flow de register pour échanger le token contre access/refresh, on persiste la session.

```ts
const session = await registerSession({ fqdn, registerToken })
await saveSession(session) // expo-secure-store, clé 'twake-drive-session'
```

### 5.4 Bootstrap au cold start

`app/index.tsx` lit la session, recrée le client, redirige selon présence/validité.

### 5.5 Logout

Effacer la session de secure-store, appeler `client.logout()`, retourner `/welcome`.

### 5.6 Custom scheme

Déclaré dans `app.json` :
```json
{
  "expo": {
    "scheme": "twakedrive"
  }
}
```

### 5.7 Cas d'erreur

| Cas | Traitement |
|---|---|
| Pas de réseau | Toast + retry sur écran login |
| `.well-known` absent ou champ manquant | "Domaine non supporté" sous le champ email |
| `openAuthSessionAsync` retourne `cancel` | Retour silencieux à l'écran email |
| `register()` échoue | On efface le secure-store partiel + retour email |
| Token expiré au boot | cozy-client tente le refresh ; si échec → logout silencieux + welcome |
| `RevocationListener` (cozy-client) émet | Logout silencieux + welcome |

## 6. Couche données

### 6.1 Création du client

```ts
// src/client/createClient.ts
import CozyClient from 'cozy-client'

const createClient = (session: Session): CozyClient =>
  new CozyClient({
    uri: session.uri,
    token: session.accessToken,
    schema: { files: { doctype: 'io.cozy.files' } },
    appMetadata: { slug: 'twake-drive-mobile', version: '0.1.0' }
  })
```

Provider unique au root layout. Reconstruit quand la session change.

### 6.2 Queries par section

Naming des `as` selon `cozy-guidelines` : `as: DOCTYPE` par défaut, paramétré `${DOCTYPE}/${param}/...`.

| Section | Query |
|---|---|
| **Mes fichiers** (un dossier) | `Q('io.cozy.files').where({ dir_id: <id> }).sortBy([{ type: 'asc' }, { name: 'asc' }])`<br>`as: 'io.cozy.files/dir/${dirId}'` |
| **Partagés avec moi** | `Q('io.cozy.files.shared-with-me')`<br>`as: 'io.cozy.files.shared-with-me'` |
| **Récents** | `Q('io.cozy.files').where({ type: 'file', trashed: false }).sortBy([{ updated_at: 'desc' }]).limitBy(50)`<br>`as: 'io.cozy.files/recent'` |
| **Corbeille** | `Q('io.cozy.files').where({ dir_id: 'io.cozy.files.trash-dir' })`<br>`as: 'io.cozy.files/trash'` |
| **Lookup d'un dossier (breadcrumb)** | `Q('io.cozy.files').getById(id)`<br>`as: 'io.cozy.files/${id}'` |

Root dir = `'io.cozy.files.root-dir'`, trash dir = `'io.cozy.files.trash-dir'`.

### 6.3 Pagination

`useQuery` retourne `fetchMore`. Branché sur `onEndReached` du `FlatList`, seuil 0.5.

### 6.4 Refresh

Pull-to-refresh via `RefreshControl` → re-fetch de la query courante.

### 6.5 Cache & offline

Cache mémoire de cozy-client uniquement. Pas de PouchDB / persistence custom au MVP. Cold start sans réseau → `ErrorState` avec retry.

## 7. Navigation & écrans

### 7.1 Structure

- Groupe `(auth)` : welcome, login.
- Groupe `(drive)` : bottom tabs avec 4 onglets, chacun avec sa propre stack interne.
- Le `<CozyProvider>` est au-dessus des deux groupes (root layout).
- Swipe-back activé : `<Stack screenOptions={{ gestureEnabled: true, fullScreenGestureEnabled: true }}>`.

### 7.2 Écrans

**Action "logout" — accessible depuis un menu (icône 3-points dans l'AppBar) uniquement sur les écrans racines des onglets (Mes fichiers root, Partagés root, Récents, Corbeille). Pas de page Paramètres dédiée au MVP.**

#### `app/(auth)/welcome.tsx`
- Logo Twake Drive.
- Slogan i18n.
- Bouton `Button mode="contained"` "Se connecter" → `/login`.

#### `app/(auth)/login.tsx`
- `TextField` email avec validation regex (`type="email-address"`, `autoCapitalize="none"`).
- Bouton "Continuer" disabled tant qu'email invalide.
- Au tap : `getLoginUri(email)` → `startOidcFlow()` → `registerSession()` → save → push `/files`.
- Spinner pendant les phases async (un seul état `loading`).
- Toast d'erreur sous le champ.

#### `app/(drive)/files/[...path].tsx`
- AppBar avec :
  - Bouton retour (sauf root) — natif via Expo Router.
  - Titre = nom du dossier courant (root = i18n `drive.myFiles`).
- `Breadcrumb` sous l'AppBar (caché à la racine).
- `FlatList` :
  - `data` = résultat de la query (dossiers avant fichiers).
  - `renderItem` = factory : `FolderRow` si `type === 'directory'`, sinon `FileRow`.
  - `RefreshControl` pour pull-to-refresh.
  - `onEndReached` → `fetchMore`.
  - États : `LoadingState` (initial), `EmptyState` (zéro résultat), `ErrorState` (query en erreur).
- Tap `FolderRow` → `router.push` avec le path étendu.
- Tap `FileRow` → ouverture `FileMetadataSheet` avec le doc en prop.

#### `app/(drive)/shared/[...path].tsx`
Même UI, query "shared-with-me" à la racine, puis navigation dans les dossiers via la même logique.

#### `app/(drive)/recent.tsx`
- Liste plate, pas de navigation dans les dossiers.
- Pas de breadcrumb.
- Tap fichier → `FileMetadataSheet`.

#### `app/(drive)/trash.tsx`
- Liste plate, pas de navigation.
- Pas de breadcrumb.
- Tap fichier → `FileMetadataSheet` (en mode read-only, pas d'actions).

### 7.3 Breadcrumb

- Composant `Breadcrumb` placé sous l'AppBar.
- Données : array `[{ id, name }]` correspondant à chaque segment du chemin.
- Reconstruit à partir du path Expo Router : on lookup chaque ID via `Q('io.cozy.files').getById(id)` (mis en cache).
- Affichage : `ScrollView horizontal` (sans tronquage côté texte), segments séparés par `/`.
- Au render initial, le scroll est positionné sur le segment courant (à droite) — c'est lui qui est visible par défaut, les segments parents sont accessibles en scrollant à gauche.
- Segment courant en gras, non-tappable. Autres segments tappables → `router.dismissTo` jusqu'au bon écran.

### 7.4 Bottom sheet métadonnées

`@gorhom/bottom-sheet` snap points `[40%, 90%]`. Contenu :
- Icône large selon mime.
- Nom complet (wrap multi-ligne si besoin).
- Type (mime humanisé) · taille (formatée) · `formatRelative` modif (date-fns).
- Chemin complet (`path`).
- Propriétaire (depuis `cozyMetadata.createdBy.account` ou nom).
- Bouton "Fermer" (Paper).

## 8. UI, theming, i18n

### 8.1 Theming

- `MD3LightTheme` + `MD3DarkTheme` étendus avec palette Twake. Couleurs récupérées du CSS de twake-drive web (à caler à l'implémentation).
- `useColorScheme()` au root layout détermine le thème actif.
- Tous les styles consomment `useTheme()`. **Aucune couleur en dur** dans les composants.
- **Aucun style inline** — tous les styles via `StyleSheet.create()` ou via les props Paper.

### 8.2 Composants UI partagés

| Composant | Rôle | Base |
|---|---|---|
| `FileRow` | Ligne fichier | `List.Item` Paper |
| `FolderRow` | Ligne dossier | `List.Item` Paper avec chevron right |
| `FileMetadataSheet` | Bottom sheet | `@gorhom/bottom-sheet` |
| `Breadcrumb` | Fil d'Ariane | `ScrollView` horizontal + `Pressable` |
| `EmptyState` | Liste vide | `View` + icône + texte |
| `ErrorState` | Erreur + retry | `View` + icône + `Button` |
| `LoadingState` | Spinner centré | `ActivityIndicator` |
| `AppBar` | Header d'écran | `Appbar.Header` Paper |

### 8.3 Icônes (mime → icon)

`src/utils/fileIcons.ts` :
- `application/pdf` → `file-pdf-box`
- `image/*` → `file-image`
- `video/*` → `file-video`
- `audio/*` → `file-music`
- `application/vnd.ms-excel`, `application/vnd.openxmlformats-officedocument.spreadsheetml.sheet` → `file-excel`
- `application/msword`, `application/vnd.openxmlformats-officedocument.wordprocessingml.document` → `file-word`
- `text/*` → `file-document`
- `application/zip`, `application/x-tar`, `application/x-gzip` → `folder-zip`
- dossier (`type === 'directory'`) → `folder`
- fallback → `file`

### 8.4 i18n

- `react-i18next` configuré dans `src/i18n/index.ts`. Langue auto via `expo-localization`. Fallback : `en`.
- Namespaces : `common`, `auth`, `drive`, `errors`.
- Aucune chaîne en dur dans le JSX. Hook `useTranslation()` partout où on affiche du texte.
- Format de dates via `date-fns` + locale dynamique.

## 9. Conventions de code

Issues de `cozy/cozy-guidelines` et `linagora/twake-guidelines`.

- **Naming des fonctions** : `fetchX`, `getX`, `findX`, `saveX`, `hasX`/`isX`, `makeX`, `ensureX`, `computeX`, `normalizeX`, `doXAndForget`.
- **Naming des queries cozy-client** : `as: DOCTYPE` par défaut, paramétré `${DOCTYPE}/${param}/...`.
- **Import order** : externals → cozy-* → locaux (alias `@/...` configuré via `babel-plugin-module-resolver`).
- `null` plutôt que `undefined` pour les valeurs absentes.
- `async`/`await` uniquement, pas de `.then()`.
- **Pas de styles inline** — `StyleSheet.create()` ou props Paper.
- **Pas de commentaires** sauf logique métier complexe ou contre-intuitive.
- **Composants fonctionnels uniquement**, pas de class components.
- TypeScript strict.

## 10. Gestion d'erreurs

### 10.1 Mapping erreur → UI

| Cas | Traitement |
|---|---|
| Réseau indisponible | `ErrorState` "Pas de connexion" + retry |
| Token expiré + refresh impossible | Logout silencieux + redirect `/welcome` |
| 403 sur ressource | `ErrorState` "Accès refusé" |
| 404 dossier supprimé pendant nav | `ErrorState` "Ce dossier n'existe plus" + retour |
| 5xx | `ErrorState` "Erreur serveur, réessayez plus tard" + retry |
| Discovery échoue | Toast sous le champ email "Domaine non supporté" |
| OIDC annulé | Retour silencieux à l'écran email |
| Exception JS non capturée | `ErrorBoundary` global au root layout |

Mapping centralisé dans `src/utils/errorMessages.ts` : `getErrorMessage(error): string` (clé i18n).

### 10.2 Logging

`cozy-minilog` en dev. Pas de Sentry au MVP.

## 11. Tests

Stratégie pragmatique pour MVP — on teste ce qui est risqué/critique, pas tout.

| Couche | Outils | Coverage cible |
|---|---|---|
| Auth utilities (`autodiscovery.ts`, `tokenStorage.ts`, parsing callback) | Jest + nock | Quasi 100% (logique pure, critique) |
| `useAuth` hook | RTL + mock cozy-client | Cas nominal, token expiré, logout, OIDC cancel |
| Composants UI primitives (`FileRow`, `FolderRow`, `EmptyState`, `ErrorState`, `Breadcrumb`) | RTL | Render + props |
| `FileMetadataSheet` | RTL | Render avec doc fictif |
| Écrans avec data | **Pas au MVP** |
| E2E | **Pas au MVP** |

TDD strict sur la logique pure d'auth. Pas de TDD sur l'UI au MVP.

## 12. Définition de "done" pour la v1

- [ ] L'utilisateur saisit son email, est redirigé vers OIDC, revient avec une session.
- [ ] La session persiste après fermeture/réouverture de l'app.
- [ ] L'utilisateur voit ses fichiers dans "Mes fichiers" et navigue dans les sous-dossiers.
- [ ] Les onglets "Partagés", "Récents", "Corbeille" affichent leur contenu respectif.
- [ ] Le tap sur un fichier ouvre la bottom sheet métadonnées.
- [ ] Le tap sur un dossier navigue dedans (même comportement dans Mes fichiers et Partagés).
- [ ] Le swipe-back fonctionne sur iOS et Android.
- [ ] Le fil d'Ariane s'affiche sous l'AppBar (sauf à la racine), est scrollable, et chaque segment est tappable.
- [ ] Le pull-to-refresh fonctionne sur toutes les listes.
- [ ] Mode sombre suit le système.
- [ ] FR + EN disponibles.
- [ ] Logout fonctionne et ramène à `/welcome`.
- [ ] Tests verts pour auth + composants UI primitives.
- [ ] Build iOS + Android via Expo prebuild fonctionne.

## 13. Hors-périmètre, à reprendre dans v2+

- Upload (création/édition de fichiers depuis le mobile). Partiellement levé : création de dossier, note Cozy, et fichiers Office vides (cf. §14.3). Reste : upload de binaires (camera roll, partage iOS / Android intent).
- Preview natif des fichiers : v1.1 livrée via `react-native-file-viewer` (Quick Look iOS / intent Android, téléchargement en cache via `expo-file-system`). Étendu en v1.4 avec un viewer in-app multi-type (cf. §14.4).
- Création et gestion de partages : livré en v1.2 (cf. §14.1).
- Recherche.
- Offline persistant (PouchDB ou équivalent).
- Notifications push.
- Realtime cozy-client.
- Biométrie à l'ouverture.
- Switch manuel light/dark.
- Sentry / crash reporting.
- Tests E2E (Detox / Maestro).

---

## 14. Itérations post-v1

Cette section retrace les ajouts livrés au-delà du périmètre v1 défini ci-dessus, par phase, dans l'ordre chronologique. Elle ne réécrit pas le design d'origine — elle le complète. Les principes structurants restent les mêmes : un seul groupe `(auth)` + `(drive)`, queries cozy-client alignées sur `twake-drive-web`, hooks Paper, theming via `useTheme`, i18n FR/EN.

**Règle d'or établie en v1.4** : avant de coder un appel `cozy-client` ou `cozy-stack-client`, vérifier ce que `twake-drive-web` fait pour la même opération et utiliser **exactement** la même API à la même couche d'abstraction. Pas de `stackClient.fetchJSON('/...')` manuel quand un helper de plus haut niveau existe ; pas de `client.collection().destroy()` quand `client.destroy()` au top-level invalide aussi le cache. Cf. `memory/feedback_mirror_web.md`.

### 14.1 Partage (v1.2)

Surface en deux temps :

- **Bouton de partage par row** (`FolderRow` `onShare`, bouton dans `FileMetadataSheet`).
- **`ShareSheet`** : bottom sheet plein écran qui mirror la modale du Drive web. Structure :
  - **Lien public** (toggle Switch + spinner pendant la mutation, choix Lecteur/Éditeur, copier-coller). URL générée à partir du `shortcode` de cozy-sharing (pas du sharecode brut), gated derrière le flag `sharing.generate-link-button.enabled`.
  - **Destinataires** : autocomplete email basé sur `io.cozy.contacts` (via `reachableContactsQuery`, mêmes selectors que `cozy-sharing`'s `buildReachableContactsQuery`), choix Lecteur/Éditeur, send → cozy-stack `POST /sharings`.
  - **Liste des membres** avec leur statut (`pending`, `ready`, `revoked`) et action de révocation.
- **`SharingProvider` + `useFileSharingStatus(id)`** : context React qui pré-charge `io.cozy.sharings` une seule fois au mount du layout `(drive)/_layout`, indexe les sharings par fileId, et expose un statut (`shared` / `recipient` / `none`) consommé par `FileRow`/`FolderRow` pour afficher le `SharedBadge` (point coloré au-dessus de la thumbnail).

### 14.2 Onglet « Drives » et drives partagés (v1.2.1)

Cinquième onglet du `(drive)` group, en plus de Mes fichiers / Partagés / Récents / Corbeille. Affiche les drives partagés dont l'utilisateur est destinataire.

- **Listing** : on n'utilise PAS la route v60 `GET /sharings/drives` (404 sur les stacks plus anciennes côté instance utilisateur). À la place, on liste les enfants de `io.cozy.files.shared-drives-dir` qui sont des `class === 'shortcut'` (les `.url` que cozy-stack y dépose pour chaque drive partagé). Le `relationships.referenced_by` du shortcut donne le `io.cozy.sharings._id` qui sert de `driveId` pour les routes per-drive. `metadata.target._id` donne le rootFolderId.
- **Navigation in-app** : `app/(drive)/shareddrives/[...path].tsx` — `[]` = liste des drives, `[driveId, folderId, ...]` = à l'intérieur. Au tap d'un drive, on `router.push('/(drive)/shareddrives/{driveId}/{rootFolderId}')` ; si la liste n'a pas extrait les ids (fallback), on les ré-résout via `Q('io.cozy.files.shortcuts').getById(shortcutId)`.
- **Contenu d'un dossier dans un drive** : `stackClient.collection('io.cozy.files', { driveId }).get(folderId)`. La v60 du `cozy-stack-client` reroute le préfixe vers `sharedDriveApiPrefix(driveId)` = `/sharings/drives/{driveId}` automatiquement, donc même URL que web sans aucun fetchJSON manuel.
- **Filtre** : on n'affiche que les `class === 'shortcut'` (le shared-drives-dir contient aussi des docs système type trash bin qu'il ne faut pas surfacer comme drive).

### 14.3 Notes, OnlyOffice, et création de fichiers (v1.3)

- **Cozy Notes** : nouveau type `.cozy-note`, rendu via `app/(drive)/note/[fileId].tsx` qui charge le drive web app dans une `WebView` avec un `session_code` obtenu via `stackClient.fetchSessionCode()`. Détection via `isCozyNoteFile(name)` dans `FileMetadataSheet`.
- **Docs notes** (`.docs-note`) : icône dédiée, ouverture via la même technique WebView pointant la drive web app `/#/docs/{id}`. Création directe d'une nouvelle note depuis la FAB.
- **OnlyOffice** : `app/(drive)/onlyoffice/[fileId].tsx` — WebView vers la drive web app `/#/onlyoffice/{id}` avec `session_code`. La création de document Word/Excel/PowerPoint passe par `createOfficeFile(client, class, name, dirId)` qui crée un fichier vide avec le bon mime, puis on push directement le screen onlyoffice sur le doc créé. **TODO backend** documenté : la stack actuelle bloque `GET /office/{id}/open` pour les OAuth clients `kind=mobile` ; à fixer côté stack pour rendre l'éditeur natif.
- **Création depuis la FAB** : `FAB.Group` dans Mes fichiers, actions `New folder`, `New note`, `New document` (gated `drive.lasuitedocs.enabled`), `Word`, `Spreadsheet`, `Presentation`. Dialogs `CreateFolderDialog` et `CreateOfficeFileDialog`.
- **Shortcuts (`.url`)** : `isShortcutFile()` détection + `fetchShortcutUrl()` qui lit `io.cozy.files.shortcuts/{id}`.url et ouvre via `Linking.openURL`.

### 14.4 Viewer in-app (v1.4)

`app/(drive)/preview/[fileId].tsx` : screen plein écran qui dispatch par type de fichier détecté via `getPreviewKind(file)` (basé sur `class` + `mime`). Streaming systématique via `/files/download/{id}` avec header `Authorization: Bearer {token}` — pas de download complet pour les médias.

| Kind | Composant | Source |
|------|-----------|--------|
| `pdf` | `react-native-pdf` (`cache: true`) | URL + headers, range requests natifs |
| `image` | `expo-image` | URL + headers, `placeholder` = thumbnail (`large`) |
| `video` | `expo-video` (`useVideoPlayer`) | HLS / Range, `nativeControls`, `allowsFullscreen` |
| `audio` | `expo-audio` (`useAudioPlayer`) | Range, scrubber custom + play/pause |
| `text` | `fetch` partiel (`Range: bytes=0-999999`) | ScrollView monospace, indicateur "(truncated)" |
| autre | `openFileNatively` (download + `react-native-file-viewer`) | fallback, comme v1.1 |

- **Loaders** sur tous les types (overlay `ActivityIndicator` + `ProgressBar` pour PDF) jusqu'à l'event `onLoadComplete` / `onLoad` / `readyToPlay` / `isLoaded`.
- **Placeholder thumbnail** : pour les images via `placeholder={{ uri: thumbnailUrl }}` d'`expo-image`, et pour les PDFs via une `<Image>` posée en `absoluteFill` sous le `<Pdf>` jusqu'à ce qu'il rende sa première page. Les thumbnails viennent des `links.tiny/small/medium/large` du doc, prefixés par `stackClient.uri`.
- **Helper centralisé** : `src/files/streamUrl.ts` exporte `buildFileStreamSource(client, fileId)`, `buildThumbnailUrl(client, links, size)`, `getPreviewKind(file)`, `canPreviewInApp(file)`.
- **Routing** : `FileMetadataSheet.onOpen` route vers `/preview/{id}` quand `canPreviewInApp(file)` est vrai, sinon comportement v1.1 (download + intent).
- **Bouton « Open externally »** depuis le viewer pour les types supportés (avec loader pendant le download).

Pas de Nitro Modules : tous les viewers font le streaming au niveau natif (NSURLSession / OkHttp), aucun chatter JS↔native pendant la lecture.

### 14.5 Soft-delete (v1.5)

Fichiers et dossiers déplaçables dans la corbeille depuis Mes fichiers et Récents.

- **`src/files/deleteFile.ts`** — `softDeleteEntry(client, entry)` appelle `client.destroy(doc)` (top-level, **pas** `client.collection().destroy()`). Le top-level dispatch `Mutations.deleteDocument` qui invalide les query results en cache. Sans ça, le doc supprimé reste dans la liste jusqu'à un reload complet de l'app.
- **UI** :
  - `FolderRow` : item « Supprimer » dans le menu `…` (corbeille rouge).
  - `FileRow` : même item dans son menu `…` (ajouté en parité avec FolderRow).
  - `FileMetadataSheet` : bouton « Supprimer » en `theme.colors.error`.
- **Confirmation** : `src/ui/ConfirmDeleteDialog.tsx` (Paper Dialog), titre adapté file/folder, body interpole le nom.
- **Feedback** : Snackbar « Fichier/Dossier déplacé dans la corbeille » + retour du cache mis à jour immédiatement.
- **Pas activé** dans `shared/` (delete = stop sharing, sémantique différente) ni `shareddrives/`.

### 14.6 Multi-select (v1.6)

Sélection multiple par long-press, avec barre d'action en haut, dans Mes fichiers (élargissable aux autres écrans).

- **Hook partagé** : `src/ui/useMultiSelect.ts` — `{ selectedIds, count, isSelecting, isSelected, select, deselect, toggle, clear }`. Memoïsé pour éviter les re-renders en cascade.
- **AppBar** : prop optionnelle `selection={ count, onCancel, actions }` qui swap entièrement le header (close à gauche, count traduit via `t('drive.selection.count', { count })` au centre, icônes destructive à droite).
- **Rows** : `FileRow` et `FolderRow` reçoivent `selected` et `onLongPress`. En mode sélection :
  - Le thumbnail / l'icône folder est remplacé par un check tinté (`theme.colors.primary` + `onPrimary`).
  - Le row prend `theme.colors.primaryContainer` en arrière-plan.
  - Le menu `…` est masqué (les actions passent par la barre du haut).
- **Comportement** :
  - Long-press → entre en sélection et sélectionne le row pressé.
  - Tap en mode sélection → toggle (et exit auto quand le count retombe à 0).
  - Tap sur le X → `selection.clear()`.
  - FAB caché tant qu'on est en sélection.
- **Actions bulk** : pour l'instant un seul, `Delete`, qui ouvre `ConfirmDeleteDialog` en mode `bulkCount`. La suppression boucle séquentiellement sur `softDeleteEntry` (cozy-stack 409 sur mutations parallèles sur le même `dir_id`). Snackbar « N éléments déplacés dans la corbeille ».
- **Extensible** : la prop `actions: AppBarSelectionAction[]` accepte un tableau, donc Share / Move / Download peuvent s'ajouter sans modifier l'AppBar.

### 14.7 Upgrade cozy-client v58 → v60.24 (v1.6)

Bump `cozy-client` et `cozy-stack-client` vers 60.24.0 pour aligner l'API mobile sur celle de `twake-drive-web`. Aucun breaking change dans le code applicatif (220+ tests passent).

Ce qui change concrètement :

- **`Q().sharingById(driveId)`** disponible nativement (utilisé via `stackClient.collection({ driveId })`).
- **`client.destroy(doc)`** (top-level) qui passe par `Mutations.deleteDocument` et invalide le cache des queries (cf. §14.5). C'est ce que web utilise.
- **Folder listing** : on adopte le pattern `buildDriveQuery({ currentFolderId, type })` de cozy-drive — **deux queries** par dossier (`folderSubfoldersQuery(dirId)` + `folderFilesQuery(dirId)`), mergées au niveau de l'écran. Selector :
  ```ts
  Q('io.cozy.files')
    .where({ dir_id: dirId, type, name: { $gt: null } })
    .partialIndex({ _id: { $ne: TRASH_DIR_ID } })
    .indexFields(['dir_id', 'type', 'name'])
    .sortBy([{ dir_id: 'asc' }, { type: 'asc' }, { name: 'asc' }])
    .limitBy(100)
  ```
  Le `name: { $gt: null }` est la sentinelle web qui force cozy-stack à utiliser un index sur `name`. Le `partialIndex` exclut le doc `trash-dir` lui-même au niveau de l'index.

- **Shared-drive contents** : `stackClient.collection('io.cozy.files', { driveId }).get(folderId)` — la v60 swap le préfixe vers `/sharings/drives/{driveId}` automatiquement (`sharedDriveApiPrefix`). Plus de `fetchJSON` manuel.

### 14.8 Récap des dépendances ajoutées post-v1

| Package | Version | Itération | Native ? |
|---------|---------|-----------|----------|
| `expo-image` | ~3.0.11 | v1.4 | Pré-linké Expo |
| `react-native-pdf` | ^7.0.4 | v1.4 | Oui (Pods) |
| `react-native-blob-util` | ^0.24.7 | v1.4 (peer de pdf) | Oui (Pods) |
| `expo-video` | ~3.0.16 | v1.4 | Oui (config plugin) |
| `expo-audio` | ~1.1.1 | v1.4 | Oui (config plugin) |
| `cozy-client` | ^60.24.0 (bump) | v1.6 | Non |
| `cozy-stack-client` | ^60.24.0 (bump) | v1.6 | Non |

Chaque ajout de module natif → `pod install` + `expo run:ios` pour le rebuild.

### 14.9 Hors-périmètre, à reprendre

- Upload de binaires (camera roll, share extension iOS, intent Android).
- Multi-select : étendre aux écrans `shared/` (avec sémantique « stop sharing ») et `recent/`. Ajouter Move / Share / Download dans la barre d'action.
- Recherche, offline persistant (PouchDB), realtime, push, biométrie, light/dark switch, Sentry, E2E — inchangé depuis v1.
