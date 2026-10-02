/** Une bougie journalière : les prix d'une journée. */
export type Bar = {
  day: string; // AAAA-MM-JJ
  open: number;
  high: number;
  low: number;
  close: number;
};

/** Trace d'un appel à une source, réussi ou non. */
export type Tentative = {
  source: string;
  hote: string;
  ok: boolean;
  /** Code HTTP, ou null si la connexion n'a même pas abouti. */
  status: number | null;
  /** Cause exacte, lisible. Ne contient jamais de secret. */
  message: string;
  /** Durée de l'appel en millisecondes. */
  ms: number;
};

export type PriceSeries = {
  asset: string;
  bars: Bar[];
  /** Identifiant de la source retenue, ou "demo" si prix inventés. */
  source: string;
  /** Libellé lisible de la source retenue. */
  sourceLabel: string;
  /** false si la source ne fournit que des clôtures. */
  ohlc: boolean;
  /** Avertissement éventuel (instrument différent de celui demandé). */
  note?: string;
  /** Détail de chaque source essayée, dans l'ordre. */
  tentatives: Tentative[];
};
