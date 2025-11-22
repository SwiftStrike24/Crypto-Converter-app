/* eslint-disable no-restricted-globals */

// Define types for the worker messages
export type WorkerMessage =
    | { id: string; type: 'PROCESS_PRICE_BATCH'; payload: { marketsData: any[]; exchangeRates: any } }
    | { id: string; type: 'CALCULATE_TOKEN_STATS'; payload: { prices: number[][] } };

export type WorkerResponse =
    | { id: string; type: 'PRICE_BATCH_PROCESSED'; payload: Record<string, any> }
    | { id: string; type: 'TOKEN_STATS_CALCULATED'; payload: { low7d: number; high7d: number; volatility7d: number } }
    | { id: string; type: 'ERROR'; error: string };

const ctx: Worker = self as any;

ctx.addEventListener('message', (event: MessageEvent<WorkerMessage>) => {
    const { id, type, payload } = event.data;

    try {
        switch (type) {
            case 'PROCESS_PRICE_BATCH':
                handleProcessPriceBatch(id, payload.marketsData, payload.exchangeRates);
                break;
            case 'CALCULATE_TOKEN_STATS':
                handleCalculateTokenStats(id, payload.prices);
                break;
            default:
                throw new Error(`Unknown message type: ${type}`);
        }
    } catch (error: any) {
        ctx.postMessage({ id, type: 'ERROR', error: error.message });
    }
});

function handleProcessPriceBatch(id: string, marketsData: any[], exchangeRates: any) {
    const processedPrices: Record<string, any> = {};
    const ratioEUR = exchangeRates?.EUR || 0.92;
    const ratioCAD = exchangeRates?.CAD || 1.36;

    marketsData.forEach((token) => {
        const tokenSymbolUpper = token.symbol.toUpperCase();
        const usdPrice = token.current_price;
        const usdChange = token.price_change_percentage_24h ?? null;
        const usdLow = token.low_24h ?? null;
        const usdHigh = token.high_24h ?? null;

        processedPrices[tokenSymbolUpper] = {
            usd: { price: usdPrice, change24h: usdChange, low24h: usdLow, high24h: usdHigh },
            eur: {
                price: usdPrice ? usdPrice * ratioEUR : null,
                change24h: usdChange,
                low24h: usdLow ? usdLow * ratioEUR : null,
                high24h: usdHigh ? usdHigh * ratioEUR : null
            },
            cad: {
                price: usdPrice ? usdPrice * ratioCAD : null,
                change24h: usdChange,
                low24h: usdLow ? usdLow * ratioCAD : null,
                high24h: usdHigh ? usdHigh * ratioCAD : null
            }
        };
    });

    ctx.postMessage({ id, type: 'PRICE_BATCH_PROCESSED', payload: processedPrices });
}

function handleCalculateTokenStats(id: string, prices: number[][]) {
    if (!prices || prices.length === 0) {
        ctx.postMessage({
            id,
            type: 'TOKEN_STATS_CALCULATED',
            payload: { low7d: 0, high7d: 0, volatility7d: 0 }
        });
        return;
    }

    const priceValues = prices.map(p => p[1]);
    const low7d = Math.min(...priceValues);
    const high7d = Math.max(...priceValues);
    let volatility7d = 0;

    if (priceValues.length > 1) {
        const dailyReturns: number[] = [];
        for (let i = 1; i < priceValues.length; i++) {
            if (priceValues[i - 1] !== 0) {
                dailyReturns.push((priceValues[i] / priceValues[i - 1]) - 1);
            }
        }

        if (dailyReturns.length > 1) {
            const n = dailyReturns.length;
            const mean = dailyReturns.reduce((a, b) => a + b) / n;
            const variance = dailyReturns.reduce((a, b) => a + Math.pow(b - mean, 2), 0) / (n - 1);
            volatility7d = Math.sqrt(variance);
        }
    }

    ctx.postMessage({
        id,
        type: 'TOKEN_STATS_CALCULATED',
        payload: { low7d, high7d, volatility7d }
    });
}
