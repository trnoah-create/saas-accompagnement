export type AssetId = "BTC" | "ETH" | "DOGE" | "SPY";

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
    id: "DOGE",
    label: "Dogecoin",
    kind: "crypto",
    symboles: {
      binance: "DOGEUSDT",
      coinbase: "DOGE-USD",
      // Chez Kraken, le Dogecoin s'appelle XDG.
      kraken: "XDGUSD",
      coingecko: "dogecoin",
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
];

export function getAsset(id: string): Asset | undefined {
  return ASSETS.find((a) => a.id === id);
}

export const ASSET_IDS = ASSETS.map((a) => a.id);
