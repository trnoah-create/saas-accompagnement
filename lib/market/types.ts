/** Une bougie journalière : les prix d'une journée. */
export type Bar = {
  day: string;   // AAAA-MM-JJ
  open: number;
  high: number;
  low: number;
  close: number;
};

export type PriceSeries = {
  asset: string;
  bars: Bar[];
  /** "binance" | "stooq" = vrais prix ; "demo" = données factices. */
  source: string;
};
