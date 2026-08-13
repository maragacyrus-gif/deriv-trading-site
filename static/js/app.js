// ==========================================
// ⚙️ DEFENSIVE CONFIGURATION & IDENTITY MATCH
// ==========================================
const DERIV_APP_ID = '346c9D1uSj4VDAZKWHnTM'; 
const DERIV_API_TOKEN = 'pat_523b5c4a31cb6f052cfd9349f0793118ffca9685695f88fbcf949f47e013103a'; 

const symbol = 'R_100';        // Volatility 100 Index
const BASE_UNIT = 0.35;        // Lowest allowed stake to minimize risk (e.g., $0.35 USD)

// Hard Circuit Breakers (Protection Guardrails)
const TARGET_PROFIT = 2.00;    // Conservatively take profit early and stop
const MAX_LOSS_LIMIT = -1.05;  // Hard stop-loss (stops the bot after 3 consecutive structural losses)
const COOLDOWN_PERIOD = 15000; // Force a 15-second pause between trades to clear emotional/volatile spikes

// ==========================================
// 📊 CONSERVATIVE CYCLE MANAGEMENT STATE
// ==========================================
const unitPattern =; 
let cycleIndex = 0;              
let currentStake = BASE_UNIT * unitPattern[cycleIndex];

let lastPrice = null;
let consecutiveUpTicks = 0;
let consecutiveDownTicks = 0;
let isTrading = false;
let onCooldown = false;
let totalProfitLoss = 0.00;

// Connect via WebSockets
const ws = new WebSocket(`wss://://derivws.com{DERIV_APP_ID}`);

ws.onopen = () => {
    console.log('🏁 WebSocket Connected. Processing Token Authorization...');
    ws.send(JSON.stringify({ authorize: DERIV_API_TOKEN }));
};

ws.onmessage = (message) => {
    const data = JSON.parse(message.data);

    // 1. Authorization Callback
    if (data.msg_type === 'authorize') {
        if (data.error) {
            console.error('❌ Authentication Failure:', data.error.message);
            return;
        }
        console.log(`✅ Authenticated! Safe Mode Active. Starting ${symbol} Ticks...`);
        ws.send(JSON.stringify({ ticks: symbol }));
    }

    // 2. High-Threshold Technical Filter
    if (data.msg_type === 'tick') {
        const currentPrice = data.tick.quote;
        
        if (lastPrice !== null) {
            if (currentPrice > lastPrice) {
                consecutiveUpTicks++;
                consecutiveDownTicks = 0;
            } else if (currentPrice < lastPrice) {
                consecutiveDownTicks++;
                consecutiveUpTicks = 0;
            }
        }
        
        lastPrice = currentPrice;

        // Safety Guard check before running strategy triggers
        if (!isTrading && !onCooldown && checkRiskBoundaries()) {
            evaluateHighProbabilityStrategy();
        }
    }

    // 3. Trade Outcome and Settlement Callback
    if (data.msg_type === 'proposal_open_contract' && data.proposal_open_contract.contract) {
        const contract = data.proposal_open_contract.contract;
        
        if (contract.is_expired) {
            const status = contract.status; // 'won' or 'lost'
            const profit = parseFloat(contract.profit);
            totalProfitLoss += profit;

            console.log(`🏁 Position Closed! Outcome: ${status.toUpperCase()} | Net Shift: $${profit} | Total Portfolio: $${totalProfitLoss.toFixed(2)}`);

            // 1-3-2-6 adjustment logic matching the unit rule tree
            if (status === 'won') {
                cycleIndex++;
                if (cycleIndex >= unitPattern.length) {
                    console.log('🎉 Full Unit Cycle Completed successfully! Resetting safely...');
                    cycleIndex = 0; 
                }
            } else {
                console.log('⚠️ Loss encountered. Capital safety rule engaged: Resetting to base 1 Unit.');
                cycleIndex = 0; 
            }

            currentStake = BASE_UNIT * unitPattern[cycleIndex];
            
            // Activate Cooldown to avoid volatile market clusters
            activateCooldown();
        }
    }

    if (data.msg_type === 'buy') {
        if (data.error) {
            console.error('❌ Execution Request Denied:', data.error.message);
            isTrading = false; 
        } else {
            console.log(`🚀 Automated Unit Order Filled! Tracking settlement...`);
            ws.send(JSON.stringify({ proposal_open_contract: 1, contract_id: data.buy.contract_id }));
        }
    }
};

// ==========================================
// 🧠 HIGH-THRESHOLD STRATEGY MECHANICS
// ==========================================
function evaluateHighProbabilityStrategy() {
    // Increased safety threshold: requiring 5 consecutive matching directional ticks instead of 3
    if (consecutiveUpTicks >= 5) {
        console.log(`🎯 Condition Found: Extended Up-Trend detected. Triggering CALL contract.`);
        executeMarketOrder('CALL');
    } else if (consecutiveDownTicks >= 5) {
        console.log(`🎯 Condition Found: Extended Down-Trend detected. Triggering PUT contract.`);
        executeMarketOrder('PUT');
    }
}

function executeMarketOrder(direction) {
    isTrading = true; 
    consecutiveUpTicks = 0;
    consecutiveDownTicks = 0;

    ws.send(JSON.stringify({
        buy: 1,
        price: currentStake,
        parameters: {
            amount: currentStake,
            basis: 'stake',
            contract_type: direction,
            currency: 'USD',
            duration: 5,
            duration_unit: 't', // 5-tick contract
            symbol: symbol
        }
    }));
}

function activateCooldown() {
    onCooldown = true;
    isTrading = false;
    console.log(`⏳ Cooldown active for ${COOLDOWN_PERIOD / 1000}s to let market noise settle...`);
    setTimeout(() => {
        onCooldown = false;
        console.log('⚡ Cooldown over. Scanning market again.');
    }, COOLDOWN_PERIOD);
}

function checkRiskBoundaries() {
    if (totalProfitLoss >= TARGET_PROFIT) {
        console.log('💰 Session Target Profit Reached! Shutting down safely to keep winnings.');
        ws.close();
        return false;
    }
    if (totalProfitLoss <= MAX_LOSS_LIMIT) {
        console.log('⚠️ Hard Stop-Loss Triggered! Account protected from drawdown. Shutting down bot.');
        ws.close();
        return false;
    }
    return true;
}

ws.onerror = (err) => console.error('🔌 Network Error Status:', err);
ws.onclose = () => console.log('🛑 Bot Offline.');

                

                                        

        
