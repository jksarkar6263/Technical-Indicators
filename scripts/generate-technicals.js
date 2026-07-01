const fs = require("fs");

/* ════════════════════════════════════════════════════════════
   PHASE 1 — full symbol universe, pulled dynamically from your
   own /dashboard/symbols endpoint instead of a hardcoded list.
   ════════════════════════════════════════════════════════════ */

const API_BASE = "https://all-in-one.stockmarketsinindia.workers.dev/api";
const API_KEY  = process.env.STOCKAPI_KEY || "";   /* set as GitHub Actions secret */

/* Special index tickers that don't follow the SYMBOL.NS pattern */
const INDEX_TICKER_MAP = {
  "NIFTY":              "^NSEI",
  "NIFTY 50":           "^NSEI",
  "BANKNIFTY":          "^NSEBANK",
  "BANK NIFTY":         "^NSEBANK",
  "FINNIFTY":           "NIFTY_FIN_SERVICE.NS",
  "MIDCPNIFTY":         "^NSEMDCP50",
  "NIFTY MIDCAP SELECT":"^NSEMDCP50",
  "SENSEX":             "^BSESN",
  "BSE SENSEX":         "^BSESN"
};

function toYahooSymbol(displaySymbol) {
  const name = (displaySymbol || "").toUpperCase().trim();
  if (INDEX_TICKER_MAP[name]) return INDEX_TICKER_MAP[name];
  /* regular F&O stock -> NSE Yahoo ticker */
  return `${name}.NS`;
}

async function loadSymbolUniverse() {
  const url = API_KEY
    ? `${API_BASE}/dashboard/symbols?key=${encodeURIComponent(API_KEY)}`
    : `${API_BASE}/dashboard/symbols`;
  const resp = await fetch(url);
  const data = await resp.json();

  const indices = data.indices || [];
  const stocks  = data.stocks  || [];

  const universe = {};

  indices.forEach(label => {
    const key = label.toUpperCase().trim();
    universe[key] = toYahooSymbol(label);
  });

  stocks.forEach(sym => {
    const key = sym.toUpperCase().trim();
    universe[key] = toYahooSymbol(sym);
  });

  return universe;
}

/* ════════════════════════════════════════════════════════════
   EXISTING INDICATOR FUNCTIONS (unchanged from your script)
   ════════════════════════════════════════════════════════════ */

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
    if (diff > 0) gains += diff;
    else losses += Math.abs(diff);
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
  if (avgLoss === 0) return 100;
  const rs = avgGain / avgLoss;
  return Number((100 - (100 / (1 + rs))).toFixed(2));
}

/* ════════════════════════════════════════════════════════════
   PHASE 2 — NEW INDICATORS
   ════════════════════════════════════════════════════════════ */

/* ---------- Bollinger Bands (20-period SMA ± 2 std dev) ---------- */
function calculateBollingerBands(prices, period = 20, mult = 2) {
  const slice = prices.slice(-period);
  const sma = slice.reduce((a, b) => a + b, 0) / period;
  const variance = slice.reduce((sum, v) => sum + Math.pow(v - sma, 2), 0) / period;
  const stdDev = Math.sqrt(variance);

  const upper = sma + mult * stdDev;
  const lower = sma - mult * stdDev;
  const lastClose = prices[prices.length - 1];

  let signal = "Neutral";
  if (lastClose >= upper) signal = "Overbought";
  else if (lastClose <= lower) signal = "Oversold";

  return {
    upper: Number(upper.toFixed(2)),
    middle: Number(sma.toFixed(2)),
    lower: Number(lower.toFixed(2)),
    signal
  };
}

/* ---------- Wilder's smoothing helper (used by ADX) ---------- */
function wilderSmooth(values, period) {
  const smoothed = [];
  let sum = values.slice(0, period).reduce((a, b) => a + b, 0);
  smoothed.push(sum);
  for (let i = period; i < values.length; i++) {
    sum = smoothed[smoothed.length - 1] - (smoothed[smoothed.length - 1] / period) + values[i];
    smoothed.push(sum);
  }
  return smoothed;
}

/* ---------- ADX (Average Directional Index, 14-period) ---------- */
function calculateADX(highs, lows, closes, period = 14) {
  const len = closes.length;
  const trArr = [], plusDM = [], minusDM = [];

  for (let i = 1; i < len; i++) {
    const highDiff = highs[i] - highs[i - 1];
    const lowDiff  = lows[i - 1] - lows[i];

    plusDM.push(highDiff > lowDiff && highDiff > 0 ? highDiff : 0);
    minusDM.push(lowDiff > highDiff && lowDiff > 0 ? lowDiff : 0);

    const tr = Math.max(
      highs[i] - lows[i],
      Math.abs(highs[i] - closes[i - 1]),
      Math.abs(lows[i] - closes[i - 1])
    );
    trArr.push(tr);
  }

  const smoothedTR    = wilderSmooth(trArr, period);
  const smoothedPlusDM  = wilderSmooth(plusDM, period);
  const smoothedMinusDM = wilderSmooth(minusDM, period);

  const plusDI  = smoothedPlusDM.map((v, i) => (v / smoothedTR[i]) * 100);
  const minusDI = smoothedMinusDM.map((v, i) => (v / smoothedTR[i]) * 100);

  const dx = plusDI.map((v, i) => {
    const sum = v + minusDI[i];
    return sum === 0 ? 0 : (Math.abs(v - minusDI[i]) / sum) * 100;
  });

  /* ADX = Wilder-smoothed average of DX over period */
  const adxArr = wilderSmooth(dx, period).map(v => v / period);
  const adx = adxArr[adxArr.length - 1];

  let signal = "Weak/No Trend";
  if (adx >= 25 && adx < 50) signal = "Strong Trend";
  else if (adx >= 50) signal = "Very Strong Trend";

  return {
    value: Number(adx.toFixed(2)),
    plusDI: Number(plusDI[plusDI.length - 1].toFixed(2)),
    minusDI: Number(minusDI[minusDI.length - 1].toFixed(2)),
    signal
  };
}

/* ---------- Stochastic Oscillator (14,3,3) ---------- */
function calculateStochastic(highs, lows, closes, period = 14, smoothK = 3, smoothD = 3) {
  const kValues = [];

  for (let i = period - 1; i < closes.length; i++) {
    const sliceHigh = highs.slice(i - period + 1, i + 1);
    const sliceLow  = lows.slice(i - period + 1, i + 1);
    const highestHigh = Math.max(...sliceHigh);
    const lowestLow   = Math.min(...sliceLow);
    const k = highestHigh === lowestLow ? 50
            : ((closes[i] - lowestLow) / (highestHigh - lowestLow)) * 100;
    kValues.push(k);
  }

  /* smooth %K (slow stochastic) */
  const smoothedK = [];
  for (let i = smoothK - 1; i < kValues.length; i++) {
    const avg = kValues.slice(i - smoothK + 1, i + 1).reduce((a, b) => a + b, 0) / smoothK;
    smoothedK.push(avg);
  }

  /* %D = SMA of smoothed %K */
  const dValues = [];
  for (let i = smoothD - 1; i < smoothedK.length; i++) {
    const avg = smoothedK.slice(i - smoothD + 1, i + 1).reduce((a, b) => a + b, 0) / smoothD;
    dValues.push(avg);
  }

  const k = smoothedK[smoothedK.length - 1];
  const d = dValues[dValues.length - 1];

  let signal = "Neutral";
  if (k > 80) signal = "Overbought";
  else if (k < 20) signal = "Oversold";

  return {
    k: Number(k.toFixed(2)),
    d: Number(d.toFixed(2)),
    signal
  };
}

/* ---------- Williams %R (14-period) ---------- */
function calculateWilliamsR(highs, lows, closes, period = 14) {
  const sliceHigh = highs.slice(-period);
  const sliceLow  = lows.slice(-period);
  const highestHigh = Math.max(...sliceHigh);
  const lowestLow   = Math.min(...sliceLow);
  const lastClose   = closes[closes.length - 1];

  const wr = highestHigh === lowestLow ? -50
           : ((highestHigh - lastClose) / (highestHigh - lowestLow)) * -100;

  let signal = "Neutral";
  if (wr > -20) signal = "Overbought";
  else if (wr < -80) signal = "Oversold";

  return {
    value: Number(wr.toFixed(2)),
    signal
  };
}

/* ---------- SuperTrend (10-period ATR, multiplier 3) ---------- */
function calculateSuperTrend(highs, lows, closes, period = 10, mult = 3) {
  const len = closes.length;
  const trArr = [];

  for (let i = 1; i < len; i++) {
    const tr = Math.max(
      highs[i] - lows[i],
      Math.abs(highs[i] - closes[i - 1]),
      Math.abs(lows[i] - closes[i - 1])
    );
    trArr.push(tr);
  }

  /* simple ATR via rolling average (close enough for daily signal use) */
  const atrArr = [];
  for (let i = period - 1; i < trArr.length; i++) {
    const avg = trArr.slice(i - period + 1, i + 1).reduce((a, b) => a + b, 0) / period;
    atrArr.push(avg);
  }

  const offset = len - atrArr.length; /* align index with highs/lows/closes */

  let trend = "Bullish";
  let finalUpperBand = 0, finalLowerBand = 0, superTrendValue = 0;

  for (let i = 0; i < atrArr.length; i++) {
    const idx = i + offset;
    const atr = atrArr[i];
    const hl2 = (highs[idx] + lows[idx]) / 2;

    const basicUpper = hl2 + mult * atr;
    const basicLower = hl2 - mult * atr;

    if (i === 0) {
      finalUpperBand = basicUpper;
      finalLowerBand = basicLower;
      trend = closes[idx] <= finalUpperBand ? "Bearish" : "Bullish";
    } else {
      finalUpperBand = (basicUpper < finalUpperBand || closes[idx - 1] > finalUpperBand) ? basicUpper : finalUpperBand;
      finalLowerBand = (basicLower > finalLowerBand || closes[idx - 1] < finalLowerBand) ? basicLower : finalLowerBand;

      if (trend === "Bullish" && closes[idx] < finalLowerBand) trend = "Bearish";
      else if (trend === "Bearish" && closes[idx] > finalUpperBand) trend = "Bullish";
    }

    superTrendValue = trend === "Bullish" ? finalLowerBand : finalUpperBand;
  }

  return {
    value: Number(superTrendValue.toFixed(2)),
    trend,
    signal: trend === "Bullish" ? "Buy" : "Sell"
  };
}

/* ---------- Simple Overall Rating (weighted vote across all signals) ---------- */
function calculateOverallRating(indicators) {
  let bullishScore = 0;
  let bearishScore = 0;
  let total = 0;

  const votes = [
    indicators.rsi.signal === "Oversold" ? "Bullish" : indicators.rsi.signal === "Overbought" ? "Bearish" : "Neutral",
    indicators.macd.trend,
    indicators.ema20.signal === "Buy" ? "Bullish" : "Bearish",
    indicators.ema50.signal === "Buy" ? "Bullish" : "Bearish",
    indicators.ema200.signal === "Buy" ? "Bullish" : "Bearish",
    indicators.bb.signal === "Oversold" ? "Bullish" : indicators.bb.signal === "Overbought" ? "Bearish" : "Neutral",
    indicators.adx.plusDI > indicators.adx.minusDI ? "Bullish" : "Bearish",
    indicators.stochastic.signal === "Oversold" ? "Bullish" : indicators.stochastic.signal === "Overbought" ? "Bearish" : "Neutral",
    indicators.williamsR.signal === "Oversold" ? "Bullish" : indicators.williamsR.signal === "Overbought" ? "Bearish" : "Neutral",
    indicators.superTrend.trend
  ];

  votes.forEach(v => {
    total++;
    if (v === "Bullish") bullishScore++;
    else if (v === "Bearish") bearishScore++;
  });

  const bullishPct = Number(((bullishScore / total) * 100).toFixed(1));
  const bearishPct = Number(((bearishScore / total) * 100).toFixed(1));

  let overall = "Neutral";
  if (bullishPct >= 60) overall = "Bullish";
  else if (bearishPct >= 60) overall = "Bearish";

  return {
    overall,
    bullishPct,
    bearishPct,
    bullishCount: bullishScore,
    bearishCount: bearishScore,
    totalIndicators: total
  };
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

/* ════════════════════════════════════════════════════════════
   MAIN
   ════════════════════════════════════════════════════════════ */

async function main() {
  const result = {
    updated: new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' }),
    symbols: {}
  };

  console.log("Loading symbol universe from /dashboard/symbols...");
  const SYMBOLS = await loadSymbolUniverse();
  const symbolCount = Object.keys(SYMBOLS).length;
  console.log(`Loaded ${symbolCount} symbols (indices + F&O stocks).`);

  let processed = 0;

  for (const [name, yahooSymbol] of Object.entries(SYMBOLS)) {
    try {
      processed++;
      console.log(`[${processed}/${symbolCount}] Fetching ${name} (${yahooSymbol})...`);

      const data = await fetchYahoo(yahooSymbol);
      const chart = data.chart.result?.[0];
      if (!chart) continue;

      const quote = chart.indicators.quote[0];

      /* ── extract all three price arrays, filtering nulls in sync ── */
      const rawCloses = quote.close  || [];
      const rawHighs  = quote.high   || [];
      const rawLows   = quote.low    || [];

      const validIndices = rawCloses
        .map((v, i) => v != null && rawHighs[i] != null && rawLows[i] != null ? i : -1)
        .filter(i => i !== -1);

      const closes = validIndices.map(i => rawCloses[i]);
      const highs  = validIndices.map(i => rawHighs[i]);
      const lows   = validIndices.map(i => rawLows[i]);

      if (closes.length < 50) {
        console.warn(`  Skipping ${name} — insufficient candle history (${closes.length})`);
        continue;
      }

      const rawOpens  = quote.open || [];
      const opens     = validIndices.map(i => rawOpens[i]).filter(v => v != null);

      const lastClose     = closes[closes.length - 1];
      const previousClose = closes[closes.length - 2];
      const lastHigh      = highs[highs.length - 1];
      const lastLow       = lows[lows.length - 1];
      const lastOpen      = opens.length ? opens[opens.length - 1] : null;
      const change        = Number((lastClose - previousClose).toFixed(2));
      const changePercent = Number((((lastClose - previousClose) / previousClose) * 100).toFixed(2));

      /* ── calculate all indicators ── */
      const ema20     = calculateEMA(closes.slice(-60),  20);
      const ema50     = calculateEMA(closes.slice(-120), 50);
      const ema200    = calculateEMA(closes, 200);
      const rsi       = calculateRSI(closes);
      const macdData  = calculateMACD(closes);
      const bbData    = calculateBollingerBands(closes);
      const adxData   = calculateADX(highs, lows, closes);
      const stochData = calculateStochastic(highs, lows, closes);
      const wrData    = calculateWilliamsR(highs, lows, closes);
      const stData    = calculateSuperTrend(highs, lows, closes);

      const indicators = {
        rsi:        { value: rsi, signal: rsi > 70 ? "Overbought" : rsi < 30 ? "Oversold" : "Neutral" },
        macd:       { value: macdData.macd, signal: macdData.signal, histogram: macdData.histogram, trend: macdData.trend },
        ema20:      { value: ema20,  signal: lastClose > ema20  ? "Buy" : "Sell" },
        ema50:      { value: ema50,  signal: lastClose > ema50  ? "Buy" : "Sell" },
        ema200:     { value: ema200, signal: lastClose > ema200 ? "Buy" : "Sell" },
        bb:         bbData,
        adx:        adxData,
        stochastic: stochData,
        williamsR:  wrData,
        superTrend: stData,
      };

      const rating = calculateOverallRating(indicators);

      result.symbols[name] = {
        yahooSymbol,
        lastOpen,
        lastHigh,
        lastLow,
        lastClose,
        previousClose,
        change,
        changePercent,
        candles: closes.length,
        ...indicators,
        overallRating: rating
      };

      /* small delay to avoid hammering Yahoo with 240 rapid requests */
      await new Promise(r => setTimeout(r, 250));

    } catch (err) {
      console.error(`  Error for ${name}:`, err.message);
      result.symbols[name] = { error: err.message };
    }
  }

  fs.writeFileSync("data/technicals.json", JSON.stringify(result, null, 2));
  console.log(`technicals.json updated — ${processed} symbols processed.`);
}

main();
