export type AssetId = "BTC" | "ETH" | "SOL" | "SPY" | "QQQ";

/**
 * Symbole de l'actif chez chaque fournisseur. Une clé absente signifie que
 * le fournisseur ne couvre pas cet actif : il sera sauté.
 */
export type Symboles = {
  binance?: string;
  coinbase?: string;
  kraken?: string;
  coingecko?: string;
  stooq?: string;
  yahoo?: string;
  fred?: string;
};

export type Asset = {
  id: AssetId;
  label: string;
  kind: "crypto" | "indice";
  symboles: Symboles;
  /**
   * Sources à essayer EN PREMIER pour cet actif, avant l'ordre habituel de
   * son type. Le reste de l'ordre de secours est conservé derrière.
   */
  sourcesPrioritaires?: string[];
};

export const ASSETS: Asset[] = [
  {
    id: "BTC",
    label: "Bitcoin",
    kind: "crypto",
    symboles: {
      binance: "BTCUSDT",
      coinbase: "BTC-USD",
      kraken: "XBTUSD",
      coingecko: "bitcoin",
    },
  },
  {
    id: "ETH",
    label: "Ethereum",
    kind: "crypto",
    symboles: {
      binance: "ETHUSDT",
      coinbase: "ETH-USD",
      kraken: "ETHUSD",
      coingecko: "ethereum",
    },
  },
  {
    id: "SOL",
    // Seul actif coté directement en euros : la paire SOL-EUR de Coinbase.
    label: "Solana (SOL-EUR)",
    kind: "crypto",
    // Coinbase d'abord, comme demandé ; les autres restent en secours.
    sourcesPrioritaires: ["coinbase"],
    symboles: {
      coinbase: "SOL-EUR",
      binance: "SOLUSDT",
      kraken: "SOLUSD",
      coingecko: "solana",
    },
  },
  {
    id: "SPY",
    label: "S&P 500 (SPY)",
    kind: "indice",
    symboles: {
      stooq: "spy.us",
      yahoo: "SPY",
      // FRED publie l'INDICE S&P 500, pas l'ETF SPY : niveau de prix
      // différent, évolution comparable. Signalé dans l'interface.
      fred: "SP500",
    },
  },
  {
    id: "QQQ",
    label: "Nasdaq 100 (QQQ)",
    kind: "indice",
    symboles: {
      stooq: "qqq.us",
      yahoo: "QQQ",
      // Idem : FRED publie l'indice Nasdaq 100, pas l'ETF QQQ.
      fred: "NASDAQ100",
    },
  },
];

export function getAsset(id: string): Asset | undefined {
  return ASSETS.find((a) => a.id === id);
}

export const ASSET_IDS = ASSETS.map((a) => a.id);
