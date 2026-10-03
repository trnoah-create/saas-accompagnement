# SimuTrade

Simulateur de trading à **argent 100 % fictif**. Portefeuille virtuel, backtests de
stratégies et bot automatique sur Bitcoin, Ethereum, Solana, le S&P 500 et le
Nasdaq 100.

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
| Bitcoin, Ethereum | Binance | Coinbase Exchange | Kraken | CoinGecko |
| Solana (paire **SOL-EUR**) | Coinbase Exchange | Binance | Kraken | CoinGecko |
| S&P 500, Nasdaq 100 | Stooq | Yahoo Finance | FRED (indice) | — |

Solana remonte Coinbase en tête parce que c'est la seule source qui donne
directement une paire en **euros** ; l'ordre de secours habituel est conservé
derrière. Les autres actifs sont cotés en dollars et affichés tels quels.

**Au moins un an d'historique par actif.** Chaque actif est téléchargé sur
400 journées cotées. Une source qui renvoie moins de 250 journées est écartée
au profit de la suivante ; si aucune n'atteint ce seuil, la plus fournie est
gardée et la page `/diagnostic` le signale en rouge. Coinbase plafonnant à
300 bougies par appel, son historique est récupéré en plusieurs appels puis
fusionné.

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

### Le bot automatique — sans aucun coût

Un portefeuille fictif **distinct du tien**, doté de **100 €**, piloté par des
règles mécaniques. **Aucun appel à une intelligence artificielle, aucune API
payante, aucune clé** : son coût de fonctionnement est nul.

Tous les réglages sont dans un seul fichier :
[`config/bot-regles.ts`](config/bot-regles.ts).

**La règle, en une phrase :** le bot achète un actif dont le prix clôture
**au-dessus de sa moyenne des 50 derniers jours**, et le vend dès qu'il
**repasse en dessous**.

| Règle | Valeur |
|---|---|
| Signal | prix contre sa **moyenne mobile 50 jours** |
| Actifs | Bitcoin, Ethereum, S&P 500 (SPY), Nasdaq 100 (QQQ), Solana |
| Part maximale par actif | **25 %** du portefeuille — **10 % pour Solana** |
| Stop loss | **−5 %** sous le prix d'entrée, obligatoire |
| Perte sur une journée | alerte à 1 €, **arrêt de la journée à 3 €** |
| Perte sur une semaine | 6 € → mise en pause |
| Perte sur un mois | 15 € → mise en pause |
| Ordres par jour | 5 au maximum, 2 € minimum par ordre |
| Effet de levier, vente à découvert | interdits |
| Coûts simulés | frais 0,1 % + écart achat/vente 0,1 % |

Ces montants sont écrits **dans le code**, pas dans une variable
d'environnement : aucun réglage oublié dans Vercel ne peut les desserrer.

Les journées vont de minuit à minuit **heure de Paris**, et les pertes se
comptent en **euros**, pas en pourcentage. Après un arrêt quotidien, le bot
reprend le lendemain ; après une pause hebdomadaire ou mensuelle, il attend une
**réactivation manuelle** via le bouton de la page.

**Le déroulé de chaque journée**

1. La tâche planifiée (protégée par `CRON_SECRET`) récupère les prix et au
   moins un an d'historique par actif.
2. Elle calcule la limite de perte du jour. Si elle est atteinte, **tout
   s'arrête jusqu'au lendemain** et le compte rendu le dit.
3. Pour chaque actif détenu, elle vérifie dans cet ordre : **stop loss**, puis
   **passage sous la moyenne mobile**. Sans position, elle n'entre que si le
   prix est **au-dessus** de sa moyenne.
4. Les ordres sont exécutés par le **courtier simulé**, puis un compte rendu
   est écrit : ordres passés et pourquoi, ordres refusés et pour quelle raison,
   valeur du portefeuille, gain du jour, comparaison avec un témoin « acheter
   et garder ».

**Désactiver un actif** (par exemple Solana) : passer `actif: false` sur sa
ligne dans `config/bot-regles.ts`. Le bot cesse immédiatement d'en acheter ;
une position déjà ouverte reste gérée, stop loss compris, jusqu'à sa fermeture.

**Les règles ne sont pas mélangées au courtier.** `lib/bot-regles/decider.ts`
est une fonction pure : elle reçoit des chiffres et renvoie des intentions
d'ordres, sans connaître ni base de données, ni réseau, ni courtier. Le
courtier, lui, n'expose que quatre opérations
(`acheter` · `vendre` · `solde` · `positions`) décrites dans
[`lib/broker/types.ts`](lib/broker/types.ts). Brancher un vrai courtier plus
tard consisterait à écrire une nouvelle implémentation de ces quatre méthodes,
**sans toucher à une seule règle**. Un test vérifie cette frontière en
inspectant les imports du fichier de règles.

Si la quantité minimale coûte plus que le plafond par ordre, l'ordre est
**refusé avec son motif** plutôt qu'exécuté dans une taille irréaliste.

La page `/bot-regles` affiche les comptes rendus, les positions avec leurs
seuils de sortie, et un graphique comparant le bot, le témoin « acheter et
garder » et ton portefeuille manuel — ce dernier n'étant pas encore suivi jour
par jour, sa courbe reste vide.

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
  bot-regles/         Comptes rendus du bot automatique et bouton de pause
  api/cron/           Tâche quotidienne (protégée par CRON_SECRET)
lib/
  db.ts               Base PostgreSQL (schéma, migration, transactions)
  broker/             Interface courtier (acheter/vendre/solde/positions)
                      — simulation uniquement
  bot-regles/         Règles pures (decider.ts) et exécution du jour (run.ts)
  limites.ts          Limites de perte et découpage du temps, partagés
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
tests/bot-regles.test.ts     Tests du bot : moyenne mobile, stop loss, plafonds,
                             limites de perte, séparation règles/courtier
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

### Étape 5 — Activer le bot automatique

Une tâche quotidienne est déclarée dans `vercel.json` et créée par Vercel au
premier déploiement :

| Tâche | Heure | Coût |
|---|---|---|
| Bot automatique | 18 h 30 UTC | **gratuit** — aucun appel d'API, aucune clé |

Dans **Settings → Environment Variables**, ajoute :

| Key | Value |
|---|---|
| `CRON_SECRET` | une longue phrase aléatoire de ton choix |

Coche les trois environnements, puis **Save**.

`CRON_SECRET` protège l'adresse de la tâche : une tâche planifiée ne peut pas
saisir le mot de passe du site, c'est donc ce secret qui tient la porte. **Sans
lui, l'adresse reste fermée et le bot ne tourne pas.** Aucune autre clé n'est
nécessaire : le bot ne contacte aucun service payant.

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
- ✅ **Base de données : connectée** → les comptes seront bien enregistrés ;
- ✅ **Prix de marché : les 5 actifs reçoivent de vrais prix** → au moins une
  source répond pour chacun ;
- ✅ **Historique : au moins un an de cotations pour chaque actif** → le bot
  peut calculer sa moyenne 50 jours ;
- ✅ **Tâche quotidienne : `CRON_SECRET` défini** → le bot peut s'exécuter.

Un bloc **Bot automatique** affiche en plus sa **dernière exécution**, le
**nombre d'ordres passés** et son dernier compte rendu.

Si toutes les lignes sont vertes, c'est terminé.

### Si quelque chose cloche

| Ce que tu vois | Ce qu'il faut faire |
|---|---|
| « Site pas encore configuré » sur la page d'accès | `SITE_PASSWORD` manque (étape 4), ou tu n'as pas redéployé (étape 7). |
| « Base de données : pas encore connectée » | L'étape 6 n'a pas abouti, ou tu n'as pas redéployé (étape 7). |
| « `CRON_SECRET` manquant » | Étape 5 : sans ce secret, le bot ne s'exécute pas. |
| « Historique : moins d'un an » sur un actif | Aucune source n'a renvoyé assez de journées. `/diagnostic` indique laquelle a répondu et combien de journées elle a fournies. Le bot attend d'avoir 50 journées closes avant de décider quoi que ce soit. |
| « Bot automatique : jamais exécuté » | La tâche n'a pas encore tourné. Vercel → **Settings → Cron Jobs** permet de la déclencher à la main. |
| « Base configurée mais injoignable » | La base Neon est peut-être en veille : recharge la page une fois. |
| « Démonstration » sur les prix | Les prix affichés sont **inventés**. Ouvre `/diagnostic` : chaque source essayée y est listée avec la cause exacte de son échec (code HTTP, message, délai dépassé). |
| Page blanche ou erreur 500 | Vercel → **Deployments** → clique le déploiement → **Runtime Logs** pour voir le message. |

> La page `/diagnostic` n'expose aucune donnée personnelle ni mot de passe, et
> n'est pas indexée par les moteurs de recherche.

## Renommer le projet

Une seule ligne dans [`config/site.ts`](config/site.ts) : `name`.
