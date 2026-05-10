# Stratégie de partage de code entre twake-drive-mobile et twake-drive-web

> **Statut :** proposition / réflexion non décidée. À reprendre quand on voudra réduire la duplication entre les deux apps.
>
> **Pas un plan d'implémentation** : la décision de scope (A / B / C ci-dessous) reste à prendre. Une fois choisie, ce doc sera converti en plan détaillé via le skill `writing-plans`.

## 1. Pourquoi cette réflexion

Au cours du développement de `twake-drive-mobile`, on s'est régulièrement retrouvés à ré-écrire à la main des helpers / queries / patterns qui existent déjà dans `twake-drive-web` (cozy-drive). À chaque fois qu'on a dévié, on a cassé quelque chose ou pris du retard ; à chaque fois qu'on s'est aligné mot pour mot sur web, ça a marché du premier coup.

Quelques exemples concrets vécus dans le repo :

- `buildDriveQuery({ dirId, type })` ré-implémenté dans `src/client/queries.ts` (deux queries séparées + `partialIndex` + `indexFields` + sentinelle `name: { $gt: null }`). Une copie au mot près de cozy-drive.
- `softDeleteEntry` initialement passé par `client.collection('io.cozy.files').destroy(doc)` au lieu de `client.destroy(doc)` (top-level) — bug de cache, un cycle complet pour le diagnostiquer.
- `fetchSharedDriveFolder` initialement écrit avec `stackClient.fetchJSON('GET', '/sharings/drives/...')` au lieu de `stackClient.collection('io.cozy.files', { driveId }).get(folderId)` — qui fait la même chose nativement depuis cozy-stack-client v60.
- Détection de fichiers (`isOfficeFile`, `isCozyNoteFile`, `isShortcutFile`, `isDocsNoteFile`) ré-écrite à partir des regex web.
- Logique de partage (`src/files/sharing.ts`, ~13 KB) qui mirror la modale Drive web ligne par ligne.

Voir aussi : `memory/feedback_mirror_web.md`.

## 2. Inventaire de ce qui est dupliqué (mobile ⇄ web)

Les fichiers candidats à extraction (plateforme-agnostiques, déjà alignés sur web) :

| Fichier mobile | Équivalent web (approx.) | Volume |
|---|---|---|
| `src/client/queries.ts` (`buildDriveQuery`, `recentQuery`, `trashQuery`, `reachableContactsQuery`, etc.) | `cozy-drive/src/queries/*` | ~120 lignes |
| `src/files/fileTypes.ts` (`isOfficeFile`, `isCozyNoteFile`, etc.) | `cozy-drive/src/lib/fileTypes` | ~50 lignes |
| `src/files/sharedDrives.ts` (`fetchSharedDrives`, `resolveSharedDriveTarget`, `fetchSharedDriveFolder`) | logique de la liste shared-drives + per-drive content | ~150 lignes |
| `src/files/createFolder.ts`, `createCozyNote.ts`, `createOfficeFile.ts` | mutations correspondantes web | ~100 lignes |
| `src/files/deleteFile.ts` (`softDeleteEntry`) | helper delete web | ~30 lignes |
| `src/files/shortcuts.ts` (`fetchShortcutUrl`, `fetchShortcutTarget`) | `useFetchShortcut` web | ~60 lignes |
| `src/files/streamUrl.ts` (`buildFileStreamSource`, `buildThumbnailUrl`, `getPreviewKind`, `canPreviewInApp`) | URL building + viewer dispatch | ~70 lignes |
| `src/files/contactSuggestions.ts` (autocomplete logic) | `cozy-sharing/src/components/ShareAutosuggest` | ~80 lignes |
| `src/files/sharing.ts` (~13 KB) | `cozy-sharing` | gros |
| `src/utils/fileIcons.ts` (mime → icon mapping) | `cozy-drive` icon mapping | ~150 lignes |
| `src/utils/formatters.ts` (`formatFileSize`) | trivial, partout | ~20 lignes |

**Total : ~800-1000 lignes de business logic** qui ont aujourd'hui deux sources de vérité.

À l'inverse, ce qui reste **intrinsèquement plateforme-spécifique** et ne sera pas partagé :
- Auth flow (Expo SecureStore + InAppBrowser ↔ web cookies)
- UI components (Paper / FlatList / gesture-handler ↔ React DOM)
- Navigation (expo-router ↔ React Router)
- File system (`expo-file-system` ↔ `Blob`/`File`)
- Préviewers (`react-native-pdf`/`expo-video` ↔ `pdf.js`/`<video>`)

## 3. Trois options envisagées

### Option A — Extraction surgicale dans un package npm `twake-drive-core`

On crée **un seul nouveau package npm** (`@linagora/twake-drive-core` ou similaire) qui exporte les helpers ci-dessus identifiés comme dupliqués. Web et mobile l'importent.

**Pros :**
- Petit blast radius. ~1-2 semaines de boulot.
- Web et mobile gardent leur cycle de release indépendant.
- Source de vérité unique pour les ~800 lignes problématiques.
- Bumps coordonnés via le numéro de version du package.

**Cons :**
- Encore un package twake-spécifique à maintenir (CI, releases, semver).
- Web doit migrer ses appels actuels vers le package — pas instantané, peut prendre des mois selon priorisation côté équipe web.
- Peer-deps : doit publier des types corrects pour fonctionner avec les versions de cozy-client utilisées par les deux apps.

### Option B — Headless drive complet (`twake-drive-core` étendu)

On extrait **toute** la logique métier plateforme-agnostic : queries, mutations, sharing flows complets, types, file ops, i18n keys, voire des hooks React (puisque les deux apps utilisent React/RN). Web et mobile deviennent des couches purement UI.

**Pros :**
- Vraie source de vérité unique pour l'app drive.
- Si on imagine une troisième cible (desktop Tauri, extension navigateur, watch app), le boulot est trivial.
- Tests une seule fois pour la logique.

**Cons :**
- Refactor lourd des deux apps, ~2-3 mois minimum.
- Coupling de release : pour bouger sur web, on bump le core, ce qui force aussi le mobile à suivre — ou on accepte des versions divergentes pendant longtemps.
- Risque : la plupart de ce qu'on appelle « business logic » est en fait subtilement spécifique (un sharing flow web a des UI flows que mobile gère différemment).
- Sur-engineering si seul mobile + web sont consommateurs.

### Option C — Upstream-first (PRs sur cozy-client / cozy-doctypes / cozy-sharing)

On ne crée **aucun nouveau package**. À la place, pour chaque helper qu'on identifie comme générique, on ouvre une PR sur la lib cozy-team qui devrait logiquement l'héberger :
- `buildDriveQuery` → `cozy-doctypes/io.cozy.files` ou `cozy-client/queries`
- `isOfficeFile` & co → `cozy-doctypes`
- `fetchSharedDrives` → `cozy-sharing`
- `softDeleteEntry` → la doc de `client.destroy()` est suffisante, pas besoin de wrapper
- `fetchShortcutUrl` → `cozy-doctypes/io.cozy.files.shortcuts`
- ...

**Pros :**
- Architecture la plus propre : pas de package twake-spécifique, on enrichit l'écosystème cozy.
- Tout consommateur de cozy-client en bénéficie (cozy-photos, cozy-banks, etc.).
- Pas de coupling release entre web et mobile, on bump cozy-client et c'est tout.

**Cons :**
- Cycle de review/release côté cozy team — peut prendre des semaines/mois par PR.
- Tout n'est pas acceptable upstream : la logique purement *twake-drive*-spécifique (ex : `isDocsNoteFile`, gestion du flag `lasuitedocs.enabled`) ne va pas dans cozy-* qui est générique.
- Versioning : si une PR upstream est rejetée ou stagne, on garde la duplication en attendant.

## 4. Recommandation par défaut

**Hybride C-puis-A** :

1. **D'abord upstream** (option C) : pour chaque helper, identifier le bon package cozy-team et ouvrir une PR. C'est la meilleure architecture et le bénéfice est partagé avec tout l'écosystème.
2. **Fallback `twake-drive-core`** (option A surgicale) : pour ce qui est rejeté upstream parce que trop twake-spécifique, ou quand la cozy team ne peut pas mainteindre dans son backlog, on les met dans un petit package npm twake.
3. **Pas option B** : le coût d'un refactor headless complet est largement supérieur au bénéfice tant qu'on n'a que deux cibles. Si une troisième cible apparaît (Watch / desktop / extension), on rediscute.
4. **Pas de monorepo** : les deux apps ont des cycles de release tellement différents (App Store reviews, Expo SDK upgrades vs déploiements web continus) que les coupler crée plus de friction qu'elle n'en élimine.

## 5. À décider avant d'attaquer

- **Scope précis** : option A surgicale en standalone, hybride C+A, ou autre ?
- **Owner** : qui maintient le package twake-drive-core (s'il existe) ? Une seule personne, l'équipe mobile, ou rotation ?
- **Cycle d'extraction** : on extrait en bloc ou helper par helper avec déprécations progressives côté web ?
- **Process upstream** : si on choisit C, qui ouvre les PRs sur cozy-client ? Quel SLA d'attente max avant de basculer en mode A pour le helper concerné ?
- **i18n** : les clés sont-elles assez stables pour partager les fichiers JSON, ou trop liées à la copywriting de chaque produit ?

## 6. Pour reprendre cette réflexion

- Décider du scope (§5).
- Convertir cette section en spec → plan via le skill `writing-plans` (`/superpowers:writing-plans` après brainstorming).
- Ouvrir un POC sur 2-3 helpers représentatifs avant de s'engager sur le scope complet (par ex. : `buildDriveQuery` upstream + `isOfficeFile` upstream + `fetchSharedDrives` dans un nouveau package), mesurer le coût réel, ajuster.
