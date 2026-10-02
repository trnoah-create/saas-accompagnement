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

Aucune clé API n'est nécessaire. La base de données se crée toute seule au premier
lancement (`data/simutrade.db`).

## Comment ça marche

### Données de marché
Deux sources gratuites et sans inscription :
- **Binance** (`/api/v3/klines`) pour BTC, ETH et DOGE ;
- **Stooq** (export CSV) pour le SPY.

Les prix sont mis en cache en base pendant une heure. **Si le réseau est bloqué**
(hors-ligne, pare-feu d'entreprise), l'application bascule sur des prix *inventés* pour
rester utilisable — et affiche alors un bandeau rouge « Données de démonstration ».
Ces prix n'ont aucune valeur historique.

### Portefeuille fictif
Chaque compte démarre avec **1 000 € virtuels**. Achat et vente au dernier prix connu,
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

### Bot
Applique la stratégie choisie au portefeuille fictif, avec un **stop de perte maximale**
réglable : si la valeur passe sous le seuil, tout est vendu et le bot s'arrête en
expliquant pourquoi. Même règle anti-triche que le backtest.

## Structure

```
app/
  page.tsx            Accueil
  connexion/ inscription/
  tableau-de-bord/    Portefeuille, ordres, graphiques
  backtest/           Test d'une stratégie
  comparateur/        Tous les actifs × toutes les stratégies
  bot/                Réglages et exécution du bot
lib/
  db.ts               Base SQLite (schéma + migrations)
  auth.ts             Comptes, mots de passe, sessions
  portfolio.ts        Achat, vente, frais, historique
  bot.ts              Bot et stop de perte
  constants.ts        Capital de départ, frais, avertissement
  market/             Actifs, téléchargement des prix, cache, démo
  engine/             Stratégies et moteur de backtest
tests/engine.test.ts  Tests du moteur
```

## Technique

Next.js (App Router) · TypeScript · Tailwind CSS v4 · SQLite (better-sqlite3).

Les mots de passe sont stockés sous forme d'empreinte scrypt avec sel aléatoire, jamais
en clair. La session est un jeton aléatoire dans un cookie `httpOnly`, inaccessible au
JavaScript du navigateur.

### Déploiement

Le code fonctionne tel quel sur un serveur Node classique. **Sur Vercel, attention** :
le système de fichiers est éphémère, donc la base SQLite serait remise à zéro à chaque
déploiement. Pour un usage en ligne durable, il faut remplacer SQLite par une base
hébergée (Postgres, Turso…) — seul `lib/db.ts` est à adapter.

## Renommer le projet

Une seule ligne dans [`config/site.ts`](config/site.ts) : `name`.
