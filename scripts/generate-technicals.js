const fs = require("fs");

const SYMBOLS = {
  NIFTY: "^NSEI",
  BANKNIFTY: "^NSEBANK",
  SENSEX: "^BSESN",
  RELIANCE: "RELIANCE.NS",
  TCS: "TCS.NS",
  SBIN: "SBIN.NS"
};

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

      result.symbols[name] = {
        yahooSymbol,
        lastClose,
        candles: closes.length
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
