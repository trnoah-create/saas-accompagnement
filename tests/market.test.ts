/**
 * Tests du mécanisme de secours entre sources de prix et des analyseurs
 * de réponses. Aucune connexion réseau : les réponses sont injectées.
 */
import assert from "node:assert/strict";
import { telecharger, type FetchLike } from "../lib/market/providers";
import { SOURCES_CRYPTO, SOURCES_INDICE, sourcesPour } from "../lib/market/sources";
import { getAsset } from "../lib/market/assets";

let reussis = 0;
async function test(nom: string, fn: () => Promise<void> | void) {
  try {
    await fn();
    reussis++;
    console.log(`  ✓ ${nom}`);
  } catch (e) {
    console.error(`  ✗ ${nom}\n    ${(e as Error).message}`);
    process.exitCode = 1;
  }
}

const BTC = getAsset("BTC")!;
const SPY = getAsset("SPY")!;

/** Fausse réponse HTTP. */
const rep = (status: number, corps: string) => ({
  ok: status >= 200 && status < 300,
  status,
  text: async () => corps,
});

/** Génère une réponse Binance valide de n journées. */
function binanceJSON(n: number): string {
  const base = Date.UTC(2025, 0, 1);
  return JSON.stringify(
    Array.from({ length: n }, (_, i) => [
      base + i * 86400000, "100.0", "110.0", "90.0", "105.0", "1", 0, "0", 0, "0", "0", "0",
    ]),
  );
}

function coinbaseJSON(n: number): string {
  const base = Math.floor(Date.UTC(2025, 0, 1) / 1000);
  // [time, low, high, open, close, volume], du plus récent au plus ancien
  return JSON.stringify(
    Array.from({ length: n }, (_, i) => [base + (n - 1 - i) * 86400, 90, 110, 100, 105, 1]),
  );
}

function krakenJSON(n: number): string {
  const base = Math.floor(Date.UTC(2025, 0, 1) / 1000);
  return JSON.stringify({
    error: [],
    result: {
      XXBTZUSD: Array.from({ length: n }, (_, i) => [
        base + i * 86400, "100.0", "110.0", "90.0", "105.0", "104", "1", 1,
      ]),
      last: base,
    },
  });
}

(async () => {
  console.log("\nBascule entre sources");

  await test("la première source qui répond est retenue", async () => {
    const appels: string[] = [];
    const f: FetchLike = async (url) => {
      appels.push(new URL(url).hostname);
      return rep(200, binanceJSON(30));
    };
    const r = await telecharger(BTC, 30, f);
    assert.equal(r.source, "binance");
    assert.equal(appels.length, 1, "les sources suivantes n'auraient pas dû être appelées");
    assert.equal(r.tentatives.length, 1);
    assert.equal(r.tentatives[0].ok, true);
  });

  await test("si la première échoue, la suivante prend le relais", async () => {
    const f: FetchLike = async (url) => {
      if (url.includes("binance")) return rep(451, "Service unavailable from a restricted location");
      if (url.includes("coinbase")) return rep(200, coinbaseJSON(30));
      throw new Error("ne devrait pas être appelée");
    };
    const r = await telecharger(BTC, 30, f);
    assert.equal(r.source, "coinbase", `source retenue = ${r.source}`);
    assert.equal(r.tentatives.length, 2);
    assert.equal(r.tentatives[0].ok, false);
    assert.equal(r.tentatives[0].status, 451, "le code HTTP doit être conservé");
    assert.match(r.tentatives[0].message, /451/);
    assert.match(r.tentatives[0].message, /restricted location/);
    assert.equal(r.tentatives[1].ok, true);
  });

  await test("la bascule va jusqu'à la troisième source", async () => {
    const f: FetchLike = async (url) => {
      if (url.includes("binance")) return rep(451, "bloqué");
      if (url.includes("coinbase")) return rep(403, "interdit");
      if (url.includes("kraken")) return rep(200, krakenJSON(40));
      throw new Error("inattendu");
    };
    const r = await telecharger(BTC, 40, f);
    assert.equal(r.source, "kraken");
    assert.equal(r.tentatives.map((t) => t.ok).join(","), "false,false,true");
  });

  await test("toutes les sources en échec : erreur enrichie des causes", async () => {
    const f: FetchLike = async () => rep(500, "panne");
    await assert.rejects(
      async () => telecharger(BTC, 30, f),
      (e: Error & { tentatives?: unknown[] }) => {
        assert.match(e.message, /aucune source n'a répondu/);
        assert.equal(e.tentatives?.length, SOURCES_CRYPTO.length);
        return true;
      },
    );
  });

  await test("un délai dépassé est identifié comme tel", async () => {
    const f: FetchLike = async (_url, init) =>
      new Promise((_resolve, reject) => {
        init.signal.addEventListener("abort", () => {
          const e = new Error("The operation was aborted");
          e.name = "AbortError";
          reject(e);
        });
      });
    // On n'attend pas 12 s : on déclenche l'annulation nous-mêmes via une
    // source unique, puis on vérifie le libellé produit.
    const court = [SOURCES_CRYPTO[0]];
    const promesse = telecharger(BTC, 30, f, court);
    await assert.rejects(promesse, (e: Error & { tentatives?: { message: string }[] }) => {
      assert.match(e.tentatives![0].message, /délai dépassé/);
      return true;
    });
  });

  await test("une source qui ne couvre pas l'actif est sautée, pas comptée en panne", async () => {
    // Les sources crypto n'ont aucun symbole pour le SPY.
    const f: FetchLike = async () => {
      throw new Error("aucun appel réseau ne devrait partir");
    };
    await assert.rejects(
      async () => telecharger(SPY, 30, f, SOURCES_CRYPTO),
      (e: Error & { tentatives?: { message: string }[] }) => {
        assert.ok(e.tentatives!.every((t) => /ne couvre pas/.test(t.message)));
        return true;
      },
    );
  });

  await test("une réponse trop courte est refusée et la suivante essayée", async () => {
    const f: FetchLike = async (url) => {
      if (url.includes("binance")) return rep(200, binanceJSON(3)); // trop peu
      if (url.includes("coinbase")) return rep(200, coinbaseJSON(50));
      throw new Error("inattendu");
    };
    const r = await telecharger(BTC, 50, f);
    assert.equal(r.source, "coinbase");
    assert.match(r.tentatives[0].message, /insuffisant/);
  });

  await test("une réponse illisible fait basculer au lieu de planter", async () => {
    const f: FetchLike = async (url) => {
      if (url.includes("binance")) return rep(200, "<html>page d'erreur</html>");
      if (url.includes("coinbase")) return rep(200, coinbaseJSON(30));
      throw new Error("inattendu");
    };
    const r = await telecharger(BTC, 30, f);
    assert.equal(r.source, "coinbase");
    assert.equal(r.tentatives[0].ok, false);
  });

  console.log("\nAnalyse des réponses");

  await test("Binance : bougies complètes", async () => {
    const f: FetchLike = async () => rep(200, binanceJSON(20));
    const r = await telecharger(BTC, 20, f, [SOURCES_CRYPTO[0]]);
    assert.equal(r.bars.length, 20);
    assert.deepEqual(
      { o: r.bars[0].open, h: r.bars[0].high, l: r.bars[0].low, c: r.bars[0].close },
      { o: 100, h: 110, l: 90, c: 105 },
    );
    assert.match(r.bars[0].day, /^\d{4}-\d{2}-\d{2}$/);
  });

  await test("Coinbase : ordre inversé puis remis à l'endroit", async () => {
    const f: FetchLike = async () => rep(200, coinbaseJSON(15));
    const r = await telecharger(BTC, 15, f, [SOURCES_CRYPTO[1]]);
    assert.equal(r.bars.length, 15);
    assert.ok(r.bars[0].day < r.bars.at(-1)!.day, "les journées doivent aller du passé vers le présent");
    assert.equal(r.bars[0].open, 100);
    assert.equal(r.bars[0].low, 90);
  });

  await test("Kraken : la paire renommée est retrouvée", async () => {
    const f: FetchLike = async () => rep(200, krakenJSON(25));
    const r = await telecharger(BTC, 25, f, [SOURCES_CRYPTO[2]]);
    assert.equal(r.bars.length, 25);
    assert.equal(r.bars[0].close, 105);
  });

  await test("Kraken : une erreur applicative est remontée", async () => {
    const f: FetchLike = async () => rep(200, JSON.stringify({ error: ["EQuery:Unknown asset pair"] }));
    await assert.rejects(
      async () => telecharger(BTC, 25, f, [SOURCES_CRYPTO[2]]),
      (e: Error & { tentatives?: { message: string }[] }) => {
        assert.match(e.tentatives![0].message, /Unknown asset pair/);
        return true;
      },
    );
  });

  await test("CoinGecko : bougies complètes", async () => {
    const base = Date.UTC(2025, 0, 1);
    const corps = JSON.stringify(
      Array.from({ length: 30 }, (_, i) => [base + i * 86400000, 100, 110, 90, 105]),
    );
    const f: FetchLike = async () => rep(200, corps);
    const r = await telecharger(BTC, 30, f, [SOURCES_CRYPTO[3]]);
    assert.equal(r.bars.length, 30);
    assert.equal(r.bars[0].high, 110);
  });

  await test("Stooq : CSV de cotations", async () => {
    const lignes = ["Date,Open,High,Low,Close,Volume"];
    for (let i = 1; i <= 20; i++) {
      const j = String(i).padStart(2, "0");
      lignes.push(`2025-01-${j},500,510,495,505,1000`);
    }
    const f: FetchLike = async () => rep(200, lignes.join("\n"));
    const r = await telecharger(SPY, 20, f, [SOURCES_INDICE[0]]);
    assert.equal(r.bars.length, 20);
    assert.equal(r.bars[0].close, 505);
  });

  await test("Yahoo : séries parallèles recomposées", async () => {
    const base = Math.floor(Date.UTC(2025, 0, 1) / 1000);
    const n = 20;
    const corps = JSON.stringify({
      chart: {
        result: [
          {
            timestamp: Array.from({ length: n }, (_, i) => base + i * 86400),
            indicators: {
              quote: [
                {
                  open: Array(n).fill(500),
                  high: Array(n).fill(510),
                  low: Array(n).fill(495),
                  close: Array(n).fill(505),
                },
              ],
            },
          },
        ],
      },
    });
    const f: FetchLike = async () => rep(200, corps);
    const r = await telecharger(SPY, n, f, [SOURCES_INDICE[1]]);
    assert.equal(r.bars.length, n);
    assert.equal(r.bars[0].open, 500);
    assert.equal(r.bars.at(-1)!.close, 505);
  });

  await test("Yahoo : les journées sans cotation sont écartées", async () => {
    const base = Math.floor(Date.UTC(2025, 0, 1) / 1000);
    const corps = JSON.stringify({
      chart: {
        result: [
          {
            timestamp: Array.from({ length: 15 }, (_, i) => base + i * 86400),
            indicators: {
              quote: [
                {
                  open: Array.from({ length: 15 }, (_, i) => (i === 3 ? null : 500)),
                  high: Array(15).fill(510),
                  low: Array(15).fill(495),
                  close: Array.from({ length: 15 }, (_, i) => (i === 3 ? null : 505)),
                },
              ],
            },
          },
        ],
      },
    });
    const f: FetchLike = async () => rep(200, corps);
    const r = await telecharger(SPY, 15, f, [SOURCES_INDICE[1]]);
    assert.equal(r.bars.length, 14, "la journée sans cotation aurait dû être écartée");
  });

  await test("FRED : clôtures seules, signalées comme telles", async () => {
    const lignes = ["DATE,SP500"];
    for (let i = 1; i <= 20; i++) {
      const j = String(i).padStart(2, "0");
      // FRED marque les jours fériés par un point.
      lignes.push(`2025-01-${j},${i === 5 ? "." : "5000.5"}`);
    }
    const f: FetchLike = async () => rep(200, lignes.join("\n"));
    const r = await telecharger(SPY, 20, f, [SOURCES_INDICE[2]]);
    assert.equal(r.ohlc, false, "FRED ne fournit pas de vraies bougies");
    assert.ok(r.note && /indice/i.test(r.note), "l'écart avec l'ETF SPY doit être signalé");
    assert.equal(r.bars.length, 19, "le jour férié aurait dû être écarté");
    assert.equal(r.bars[0].open, r.bars[0].close);
  });

  console.log("\nCohérence du catalogue");

  await test("chaque actif a au moins deux sources utilisables", () => {
    for (const id of ["BTC", "ETH", "DOGE", "SPY"]) {
      const a = getAsset(id)!;
      const utilisables = sourcesPour(a).filter((s) => s.url(a, 30) !== null);
      assert.ok(
        utilisables.length >= 2,
        `${id} n'a que ${utilisables.length} source(s) : pas de vrai secours`,
      );
    }
  });

  await test("aucune adresse ne contient de clé ni de secret", () => {
    for (const id of ["BTC", "ETH", "DOGE", "SPY"]) {
      const a = getAsset(id)!;
      for (const s of sourcesPour(a)) {
        const url = s.url(a, 30);
        if (!url) continue;
        assert.ok(
          !/api[_-]?key|token|secret|password/i.test(url),
          `${s.id} : l'adresse semble contenir un secret`,
        );
        assert.ok(url.startsWith("https://"), `${s.id} : l'adresse doit être en HTTPS`);
      }
    }
  });

  console.log(`\n${reussis} test(s) réussi(s)\n`);
})();
