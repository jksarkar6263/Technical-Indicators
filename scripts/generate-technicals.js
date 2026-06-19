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
function calculateEMAArray(prices, period) {
  const k = 2 / (period + 1);

  const emaValues = [];
  let ema = prices[0];

  emaValues.push(ema);

  for (let i = 1; i < prices.length; i++) {
    ema = prices[i] * k + ema * (1 - k);
    emaValues.push(ema);
  }

  return emaValues;
}

function calculateMACD(prices) {
  const ema12 = calculateEMAArray(prices, 12);
  const ema26 = calculateEMAArray(prices, 26);

  const macdLine = [];

  for (let i = 0; i < prices.length; i++) {
    macdLine.push(ema12[i] - ema26[i]);
  }

  const signalLine = calculateEMAArray(macdLine, 9);

  const macd = macdLine[macdLine.length - 1];
  const signal = signalLine[signalLine.length - 1];
  const histogram = macd - signal;

  return {
    macd: Number(macd.toFixed(2)),
    signal: Number(signal.toFixed(2)),
    histogram: Number(histogram.toFixed(2)),
    trend: macd > signal ? "Bullish" : "Bearish"
  };
}
function calculateRSI(prices, period = 14) {
  let gains = 0;
  let losses = 0;

  for (let i = 1; i <= period; i++) {
    const diff = prices[i] - prices[i - 1];

    if (diff > 0) {
      gains += diff;
    } else {
      losses += Math.abs(diff);
    }
  }

  let avgGain = gains / period;
  let avgLoss = losses / period;

  for (let i = period + 1; i < prices.length; i++) {
    const diff = prices[i] - prices[i - 1];

    const gain = diff > 0 ? diff : 0;
    const loss = diff < 0 ? Math.abs(diff) : 0;

    avgGain = ((avgGain * (period - 1)) + gain) / period;
    avgLoss = ((avgLoss * (period - 1)) + loss) / period;
  }

  if (avgLoss === 0) {
    return 100;
  }

  const rs = avgGain / avgLoss;

  return Number(
    (100 - (100 / (1 + rs))).toFixed(2)
  );
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
    updated: new Date().toLocaleString('en-IN', {
    timeZone: 'Asia/Kolkata'
    }),
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
const rsi = calculateRSI(closes);
const macdData = calculateMACD(closes);      
result.symbols[name] = {
  yahooSymbol,
  lastClose,
  previousClose,
  change,
  changePercent,
  candles: closes.length,
rsi: {
  value: rsi,
  signal:
    rsi > 70
      ? "Overbought"
      : rsi < 30
      ? "Oversold"
      : "Neutral"
},
  macd: {
  value: macdData.macd,
  signal: macdData.signal,
  histogram: macdData.histogram,
  trend: macdData.trend
},
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
