export type AssetId = "BTC" | "ETH" | "DOGE" | "SPY";

export type Asset = {
  id: AssetId;
  label: string;
  /** Fournisseur de données, tous gratuits et sans clé API. */
  provider: "binance" | "stooq";
  /** Symbole chez le fournisseur. */
  symbol: string;
  kind: "crypto" | "indice";
};

export const ASSETS: Asset[] = [
  { id: "BTC", label: "Bitcoin", provider: "binance", symbol: "BTCUSDT", kind: "crypto" },
  { id: "ETH", label: "Ethereum", provider: "binance", symbol: "ETHUSDT", kind: "crypto" },
  { id: "DOGE", label: "Dogecoin", provider: "binance", symbol: "DOGEUSDT", kind: "crypto" },
  { id: "SPY", label: "S&P 500 (SPY)", provider: "stooq", symbol: "spy.us", kind: "indice" },
];

export function getAsset(id: string): Asset | undefined {
  return ASSETS.find((a) => a.id === id);
}

export const ASSET_IDS = ASSETS.map((a) => a.id);
