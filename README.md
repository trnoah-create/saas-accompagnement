# SimuTrade

Simulateur de trading à **argent 100 % fictif**. Portefeuille virtuel, backtests de
stratégies et bot automatique sur Bitcoin, Ethereum, Dogecoin et le S&P 500.

> ⚠️ **Simulation, pas un conseil financier. Les performances passées ne garantissent rien.**
> Aucun courtier n'est contacté, aucun ordre réel n'est passé, aucune donnée bancaire
> n'est demandée.

## Démarrer

```bash
npm install
npm run dev      # http://localhost:3000
npm test         # tests du moteur de backtest
```

Aucune clé API n'est nécessaire pour les prix. En revanche l'application a besoin
d'une base PostgreSQL : renseigne `DATABASE_URL`. Pour essayer en local sans rien
installer, un vrai Postgres en mémoire est fourni :

```bash
node tests/pg-local.mjs &
DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:5433/postgres npm run dev
```

Les tables sont créées automatiquement au premier lancement.

## Comment ça marche

### Données de marché

Plusieurs sources gratuites et sans clé API, essayées **dans l'ordre** ; la
première qui répond est retenue.

| Actif | 1ʳᵉ source | 2ᵉ | 3ᵉ | 4ᵉ |
|---|---|---|---|---|
| Bitcoin, Ethereum, Dogecoin | Binance | Coinbase Exchange | Kraken | CoinGecko |
| S&P 500 | Stooq | Yahoo Finance | FRED (indice) | — |

Pourquoi plusieurs : Binance restreint l'accès depuis certains pays, et les
serveurs de Vercel sont majoritairement aux États-Unis. Coinbase et Kraken
sont des sociétés américaines, CoinGecko est ouvert — au moins l'une devrait
répondre.

⚠️ **FRED publie l'indice S&P 500, pas l'ETF SPY** : le niveau de prix diffère
(≈ 5 000 contre ≈ 600), l'évolution reste comparable, et la source ne fournit
que des clôtures. Si c'est elle qui répond, `/diagnostic` l'affiche en clair.

> **Non vérifié depuis le dépôt.** Le réseau sortant de l'environnement de
> développement est fermé : aucune de ces adresses n'a pu être appelée, ni
> aucune documentation consultée. Les formats de réponse sont couverts par des
> tests avec réponses simulées, mais seule la page `/diagnostic`, une fois le
> site en ligne, dit laquelle répond vraiment.

Les prix sont mis en cache une heure. Si aucune source ne répond, un cache
même périmé est préféré aux prix inventés ; en dernier recours seulement,
l'application bascule sur des prix **inventés** et l'affiche en rouge sur
toutes les pages concernées.

### Accès
Le site entier est protégé par **un seul mot de passe**, lu dans la variable
d'environnement `SITE_PASSWORD`. Il n'y a ni inscription, ni comptes, ni
adresses e-mail : un seul propriétaire, un seul portefeuille.

Le verrou est posé dans `proxy.ts`, qui s'exécute avant toute page et toute
route d'API — c'est ce qui garantit qu'aucune adresse ne puisse être atteinte
sans le mot de passe. Les Server Actions revérifient de leur côté : on ne
s'appuie jamais sur une barrière unique.

La session est un jeton **signé** (HMAC-SHA256, clé = `SITE_PASSWORD`) déposé
dans un cookie `httpOnly`, donc inaccessible au JavaScript du navigateur. Rien
n'est stocké en base. Conséquence utile : changer `SITE_PASSWORD` déconnecte
instantanément toutes les sessions.

Si `SITE_PASSWORD` est absente, le site est entièrement verrouillé et la page
d'accès explique quoi faire — aucun accès de secours n'existe.

### Portefeuille fictif
Le portefeuille unique démarre avec **1 000 € virtuels**. Achat et vente au dernier prix connu,
avec des **frais de 0,1 % par ordre**. Tout l'historique est conservé.

### Backtest
Rejoue une stratégie sur les prix passés et renvoie : valeur finale, gain en %,
pire chute (*max drawdown*), nombre d'ordres, frais et courbe d'évolution.

Stratégies disponibles :
- **Acheter et garder** — la référence à battre.
- **Croisement de moyennes mobiles** — 20 et 50 jours par défaut, paramétrables.

### ⚠️ Pas de triche avec le futur
C'est le piège classique du backtest : utiliser sans s'en rendre compte un prix
qu'on ne pouvait pas connaître, ce qui gonfle artificiellement les résultats.

La règle appliquée ici, dans `lib/engine/backtest.ts` :

1. la décision du jour *i* ne lit que les journées `0 … i-1` ;
2. l'ordre est exécuté à **l'ouverture** du jour *i* ;
3. le portefeuille n'est valorisé à la clôture qu'*après* l'exécution.

Trois tests le vérifient (`npm test`), dont celui-ci : deux séries identiques jusqu'à
un jour donné puis radicalement différentes doivent produire **exactement les mêmes
ordres** avant le point de divergence.

### Mode « Claude trader »

Chaque jour, une tâche planifiée par Vercel Cron rassemble les prix récents et
l'état d'un **portefeuille fictif dédié** (distinct du tien), demande au modèle
une liste d'ordres au format strictement imposé, puis :

1. **valide** chaque ordre — actif connu, quantité positive, liquidités
   suffisantes, position détenue, plafond par ordre ;
2. **exécute** ceux qui passent, via le courtier simulé, frais de 0,1 % ;
3. **écrit un compte rendu** en français : ordres et justifications, valeur du
   portefeuille, gain du jour, comparaison avec un témoin « acheter et garder »
   démarré le même jour avec le même capital.

Garde-fous : un ordre ne peut engager plus de 25 % du portefeuille, 6 ordres par
jour au maximum, et au-delà de 5 % de perte depuis la veille plus aucun ordre
n'est passé. **Si l'appel échoue ou si la réponse ne respecte pas le format,
aucun ordre n'est passé** et la raison est consignée. Un bouton met le mode en
pause.

### ⚠️ Aucun courtier réel

Toute exécution passe par l'interface `Courtier` (`lib/broker/`). Une seule
implémentation existe : **la simulation**. Le dépôt ne contient aucun code
capable de contacter un courtier, aucun identifiant, aucune donnée bancaire.

Brancher un vrai courtier demanderait d'écrire une nouvelle implémentation de
l'interface *et* de modifier sciemment une constante dans
[`lib/broker/index.ts`](lib/broker/index.ts). Aucune variable d'environnement
oubliée ne peut déclencher d'ordre réel.

### Bot
Applique la stratégie choisie au portefeuille fictif, avec un **stop de perte maximale**
réglable : si la valeur passe sous le seuil, tout est vendu et le bot s'arrête en
expliquant pourquoi. Même règle anti-triche que le backtest.

## Structure

```
proxy.ts              Verrou global : aucune page sans mot de passe
app/
  page.tsx            Accueil
  connexion/          Saisie du mot de passe
  tableau-de-bord/    Portefeuille, ordres, graphiques
  backtest/           Test d'une stratégie
  comparateur/        Tous les actifs × toutes les stratégies
  bot/                Réglages et exécution du bot
  diagnostic/         Vérification base + prix, à ouvrir après déploiement
  claude-trader/      Comptes rendus quotidiens et bouton de pause
  api/cron/           Tâche quotidienne (protégée par CRON_SECRET)
lib/
  db.ts               Base PostgreSQL (schéma, migration, transactions)
  broker/             Interface courtier — simulation uniquement
  claude-trader/      Décision, validation, exécution, compte rendu
  session.ts          Mot de passe unique et jeton de session signé
  acces.ts            Ouverture et fermeture de session (cookie)
  health.ts           Contrôles affichés sur /diagnostic
  auth.ts             Comptes, mots de passe, sessions
  portfolio.ts        Achat, vente, frais, historique
  bot.ts              Bot et stop de perte
  constants.ts        Capital de départ, frais, avertissement
  market/             Actifs, téléchargement des prix, cache, démo
  engine/             Stratégies et moteur de backtest
tests/engine.test.ts  Tests du moteur (anti-triche, frais, calculs)
tests/session.test.ts Tests du mot de passe et des jetons de session
tests/market.test.ts  Tests de la bascule entre sources et des analyseurs
tests/claude-trader.test.ts  Tests de validation des ordres et des plafonds
tests/db.test.ts      Tests SQL contre un vrai PostgreSQL en mémoire
tests/pg-local.mjs    Serveur PostgreSQL local pour le développement
```

## Technique

Next.js (App Router) · TypeScript · Tailwind CSS v4 · PostgreSQL.

La base est accessible via le pilote HTTP de Neon en production (adapté au
serverless, sans connexion TCP à maintenir) et via le pilote `pg` classique pour
tout autre PostgreSQL — Supabase, Railway ou une base locale.

Les mots de passe sont stockés sous forme d'empreinte scrypt avec sel aléatoire, jamais
en clair. La session est un jeton aléatoire dans un cookie `httpOnly`, inaccessible au
JavaScript du navigateur.

## 📱 Mettre le site en ligne depuis un téléphone

Tout se fait depuis le navigateur du téléphone. Aucun ordinateur, aucune
ligne de commande. Compte environ 15 minutes.

### Étape 1 — Choisir la bonne branche

Le simulateur vit sur la branche **`simulateur-trading`**. L'ancien site
d'accompagnement est resté sur `main`. Deux possibilités :

- **Simple** : dans GitHub → ton dépôt → onglet **Pull requests** → *New pull
  request* → base `main`, compare `simulateur-trading` → *Create* puis *Merge*.
  Le simulateur devient le contenu de `main`.
- **Ou** : garder les deux et indiquer à Vercel, à l'étape 3, que la branche de
  production est `simulateur-trading`.

### Étape 2 — Créer le projet Vercel

1. Va sur **vercel.com** → *Sign Up* → **Continue with GitHub**.
2. Autorise Vercel à accéder à tes dépôts.
3. *Add New…* → **Project** → choisis `saas-accompagnement` → **Import**.
4. Ne touche à aucun réglage (Next.js est détecté tout seul) → **Deploy**.

Le premier déploiement va réussir, mais le site ne pourra pas encore créer de
comptes : il manque la base de données. C'est normal, on s'en occupe tout de
suite.

### Étape 3 — Vérifier la branche déployée

Dans le projet Vercel → **Settings** → **Git** → *Production Branch*.
Mets-y `main` si tu as fusionné à l'étape 1, sinon `simulateur-trading`.
Si tu as dû la changer, va dans **Deployments** → bouton `⋯` du dernier
déploiement → **Redeploy**.

### Étape 4 — Choisir le mot de passe du site

1. Dans ton projet Vercel → **Settings** → **Environment Variables**.
2. *Key* : `SITE_PASSWORD`
3. *Value* : le mot de passe de ton choix (long et unique, c'est la seule
   protection du site).
4. Coche les trois environnements proposés (*Production*, *Preview*,
   *Development*) → **Save**.

Ce mot de passe n'est écrit nulle part dans le code ni sur GitHub : il ne vit
que dans Vercel. Si tu le changes, tu seras déconnecté et devras ressaisir le
nouveau.

### Étape 5 — Activer le mode « Claude trader » (facultatif)

Dans **Settings → Environment Variables**, ajoute :

| Key | Value |
|---|---|
| `ANTHROPIC_API_KEY` | ta clé, créée sur **console.anthropic.com** → *API keys* |
| `CRON_SECRET` | une longue phrase aléatoire de ton choix |

Coche les trois environnements, puis **Save**. Sans `ANTHROPIC_API_KEY`, le reste
du site fonctionne normalement : la tâche quotidienne se contente de noter qu'elle
n'a pas pu décider, et ne passe aucun ordre.

La tâche est déclarée dans `vercel.json` et s'exécute chaque jour à 18 h UTC.
Vercel la crée automatiquement au premier déploiement.

### Étape 6 — Brancher la base de données gratuite

1. Dans ton projet Vercel → onglet **Storage**.
2. **Create Database** → choisis **Neon** (PostgreSQL) → *Continue*.
3. Laisse le plan **Free**, choisis une région proche (ex. *Frankfurt*) → crée.
4. Vercel propose de connecter la base au projet : **accepte**.

Vercel ajoute alors tout seul la variable `DATABASE_URL`. Tu n'as aucune
adresse à recopier — ce qui évite les fautes de frappe sur un téléphone.

### Étape 7 — Redéployer

**Deployments** → bouton `⋯` sur le déploiement le plus récent → **Redeploy**.
C'est nécessaire pour que le site voie les nouvelles variables.

### Étape 8 — Vérifier que tout marche

Ouvre **`https://ton-site.vercel.app/diagnostic`** sur ton téléphone.

Le mot de passe te sera demandé. Cette page te dit ensuite en clair :

- ✅ **Mot de passe du site : configuré** → le site est bien protégé ;
- ✅ **Mode Claude trader** → clé d'API et secret de la tâche présents ;
- ✅ **Base de données : connectée** → les comptes seront bien enregistrés ;
- ✅ **Prix de marché : les 4 actifs reçoivent de vrais prix** → Binance et
  Stooq répondent correctement.

Si les deux lignes sont vertes, c'est terminé : crée ton compte et tu reçois
tes 1 000 € fictifs.

### Si quelque chose cloche

| Ce que tu vois | Ce qu'il faut faire |
|---|---|
| « Site pas encore configuré » sur la page d'accès | `SITE_PASSWORD` manque (étape 4), ou tu n'as pas redéployé (étape 6). |
| « Base de données : pas encore connectée » | L'étape 4 n'a pas abouti, ou tu n'as pas redéployé (étape 5). |
| « Base configurée mais injoignable » | La base Neon est peut-être en veille : recharge la page une fois. |
| « Démonstration » sur les prix | Les prix affichés sont **inventés**. Ouvre `/diagnostic` : chaque source essayée y est listée avec la cause exacte de son échec (code HTTP, message, délai dépassé). |
| Page blanche ou erreur 500 | Vercel → **Deployments** → clique le déploiement → **Runtime Logs** pour voir le message. |

> La page `/diagnostic` n'expose aucune donnée personnelle ni mot de passe, et
> n'est pas indexée par les moteurs de recherche.

## Renommer le projet

Une seule ligne dans [`config/site.ts`](config/site.ts) : `name`.
