/**
 * Téléchargement des prix réels. Deux sources gratuites, sans clé API :
 *   - Binance (crypto)  : /api/v3/klines
 *   - Stooq  (SPY)      : export CSV
 *
 * Si le réseau est bloqué (pare-feu, hors-ligne), ces fonctions lèvent une
 * erreur et l'appelant bascule sur les données de démonstration.
 */
import "server-only";
import type { Asset } from "./assets";
import type { Bar } from "./types";

const TIMEOUT_MS = 15_000;

async function fetchWithTimeout(url: string): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    return await fetch(url, { signal: controller.signal, cache: "no-store" });
  } finally {
    clearTimeout(timer);
  }
}

async function fromBinance(symbol: string, days: number): Promise<Bar[]> {
  const limit = Math.min(days, 1000);
  const url = `https://api.binance.com/api/v3/klines?symbol=${symbol}&interval=1d&limit=${limit}`;
  const res = await fetchWithTimeout(url);
  if (!res.ok) throw new Error(`Binance a répondu ${res.status}`);

  const rows = (await res.json()) as unknown[][];
  return rows.map((r) => ({
    day: new Date(Number(r[0])).toISOString().slice(0, 10),
    open: Number(r[1]),
    high: Number(r[2]),
    low: Number(r[3]),
    close: Number(r[4]),
  }));
}

async function fromStooq(symbol: string, days: number): Promise<Bar[]> {
  const url = `https://stooq.com/q/d/l/?s=${symbol}&i=d`;
  const res = await fetchWithTimeout(url);
  if (!res.ok) throw new Error(`Stooq a répondu ${res.status}`);

  const csv = await res.text();
  const lines = csv.trim().split("\n");
  if (lines.length < 2 || !lines[0].toLowerCase().startsWith("date")) {
    throw new Error("Réponse Stooq inattendue");
  }

  const bars: Bar[] = [];
  for (const line of lines.slice(1)) {
    const [day, open, high, low, close] = line.split(",");
    const bar = {
      day,
      open: Number(open),
      high: Number(high),
      low: Number(low),
      close: Number(close),
    };
    if (Number.isFinite(bar.close) && bar.close > 0) bars.push(bar);
  }
  return bars.slice(-days);
}

export async function downloadBars(asset: Asset, days: number): Promise<Bar[]> {
  const bars =
    asset.provider === "binance"
      ? await fromBinance(asset.symbol, days)
      : await fromStooq(asset.symbol, days);

  if (bars.length === 0) throw new Error("Aucune donnée reçue");
  return bars;
}
