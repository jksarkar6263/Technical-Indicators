const fs = require("fs");

const SYMBOLS = {
  NIFTY: "^NSEI",
  BANKNIFTY: "^NSEBANK",
  SENSEX: "^BSESN",
  RELIANCE: "RELIANCE.NS",
  TCS: "TCS.NS",
  SBIN: "SBIN.NS"
};
function calculateEMA(prices, period) {
  const k = 2 / (period + 1);

  let ema = prices[0];

  for (let i = 1; i < prices.length; i++) {
    ema = prices[i] * k + ema * (1 - k);
  }

  return Number(ema.toFixed(2));
}
async function fetchYahoo(symbol) {
  const url =
    `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?range=1y&interval=1d`;

  const response = await fetch(url);

  if (!response.ok) {
    throw new Error(`Failed: ${symbol}`);
  }

  return response.json();
}

async function main() {
  const result = {
    updated: new Date().toISOString(),
    symbols: {}
  };

  for (const [name, yahooSymbol] of Object.entries(SYMBOLS)) {
    try {
      console.log(`Fetching ${name}...`);

      const data = await fetchYahoo(yahooSymbol);

      const chart = data.chart.result?.[0];

      if (!chart) continue;

      const quote = chart.indicators.quote[0];

      const closes = quote.close.filter(v => v != null);

const lastClose = closes[closes.length - 1];
const previousClose = closes[closes.length - 2];

const change = Number(
  (lastClose - previousClose).toFixed(2)
);

const changePercent = Number(
  (((lastClose - previousClose) / previousClose) * 100).toFixed(2)
);

const ema20 = calculateEMA(closes.slice(-60), 20);
const ema50 = calculateEMA(closes.slice(-120), 50);
const ema200 = calculateEMA(closes, 200);

result.symbols[name] = {
  yahooSymbol,
  lastClose,
  previousClose,
  change,
  changePercent,
  candles: closes.length,

  ema20: {
    value: ema20,
    signal: lastClose > ema20 ? "Buy" : "Sell"
  },

  ema50: {
    value: ema50,
    signal: lastClose > ema50 ? "Buy" : "Sell"
  },

  ema200: {
    value: ema200,
    signal: lastClose > ema200 ? "Buy" : "Sell"
  }
};

    } catch (err) {
      console.error(err);

      result.symbols[name] = {
        error: err.message
      };
    }
  }

  fs.writeFileSync(
    "data/technicals.json",
    JSON.stringify(result, null, 2)
  );

  console.log("technicals.json updated");
}

main();
