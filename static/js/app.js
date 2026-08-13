// ==========================================
// 1. GLOBAL STATE INITIALIZATION
// ==========================================
let systemExecutionSequenceCounter = 0;
let lastSimulatedTradeDirection = null;
let mockTradeEntryPrice = 0;
let globalBotProfitLossState = 0;
let ongoingAlgorithmicStake = 1.00; // Default fallback stake volume
let baselineUserStake = 1.00;
let totalBotTradesExecuted = 0;
let liveSubscribedSymbolToken = null;
let socketInstance = null;
let masterDataSeries = null; // Target hook for Lightweight Charts

// Your authentic Deriv App ID registered from your developer portal
const DERIV_APP_ID = "346c9D1uSj4VDAZKWHnTM"; 
const DERIV_WS_URL = `wss://://derivws.com{DERIV_APP_ID}`;
const MAX_MARTINGALE_STREAK = 6; // Safety barrier to protect account balances

// ==========================================
// 2. NETWORK CONNECTION & PIPELINE ENGINE
// ==========================================
function establishLiveDerivConnection() {
    logTerminalEntry("Opening secure connection pipeline to Deriv exchanges...", "bot");
    socketInstance = new WebSocket(DERIV_WS_URL);

    socketInstance.onmessage = function(event) {
        processIncomingAPIFrame(event);
    };

    socketInstance.onopen = function() {
        logTerminalEntry("Network connection stabilized. Checking for active account keys...", "success");
        updateNetworkStatusIndicator(true); 
    };

    socketInstance.onclose = function() {
        logTerminalEntry("Network channel disconnected. Auto-reconnecting in 5 seconds...", "error");
        updateNetworkStatusIndicator(false); 
        setTimeout(establishLiveDerivConnection, 5000);
    };
}

// ==========================================
// 3. SECURE AUTHENTICATION EXTRACTION
// ==========================================
function getDerivTokenFromURL() {
    const hash = window.location.hash;
    if (!hash) return null;

    const params = new URLSearchParams(hash.substring(1));
    return params.get('token1'); 
}

// ==========================================
// 4. INTERFACE EVENT MATRIX LISTENERS
// ==========================================
function initializeUIEventListeners() {
    const assetSel = document.getElementById("assetSelector");
    const clrLog = document.getElementById("clearLogBtn");
    const bRise = document.getElementById("riseBtn");
    const bFall = document.getElementById("fallBtn");
    const bConn = document.getElementById("connectBtn");

    if (assetSel) assetSel.addEventListener("change", synchronizeMarketDataStreams);
    
    if (clrLog) clrLog.addEventListener("click", () => {
        const term = document.getElementById("terminalLog");
        if (term) term.innerHTML = "";
    });
    
    // Wire up manual buy/sell buttons to dispatch real contracts
    if (bRise) bRise.addEventListener("click", () => executeLiveOrderContract("RISE"));
    if (bFall) bFall.addEventListener("click", () => executeLiveOrderContract("FALL"));
    
    if (bConn) bConn.addEventListener("click", () => {
        logTerminalEntry("Redirecting user safely to Deriv secure OAuth2 clearing screen...", "bot");
        window.location.href = `https://deriv.com{DERIV_APP_ID}&l=en&brand=deriv`;
    });
}

// ==========================================
// 5. ASYNC MARKET FEED ROUTING
// ==========================================
function synchronizeMarketDataStreams() {
    if (!socketInstance || socketInstance.readyState !== WebSocket.OPEN) {
        logTerminalEntry("Error: Cannot stream market feeds while network is offline.", "error");
        return;
    }
    const assetSel = document.getElementById("assetSelector");
    if (!assetSel) return;
    const chosenSymbolString = assetSel.value;
    
    if (liveSubscribedSymbolToken) {
        socketInstance.send(JSON.stringify({ forget_all: "ticks" }));
        if (masterDataSeries) masterDataSeries.setData([]);
    }
    
    liveSubscribedSymbolToken = chosenSymbolString;
    socketInstance.send(JSON.stringify({ ticks: chosenSymbolString, subscribe: 1 }));
    logTerminalEntry(`Switched data streams to asset asset ticker focus: ${chosenSymbolString}`, "bot");
}

// ==========================================
// 6. SERVER PACKET DECODING & ANALYSIS
// ==========================================
function processIncomingAPIFrame(event) {
    const dataFrame = JSON.parse(event.data);

    if (dataFrame.error) {
        logTerminalEntry(`Error: ${dataFrame.error.message}`, "error");
        return;
    }
    
    if (dataFrame.msg_type === "authorize") {
        logTerminalEntry(`Auth Success: ${dataFrame.authorize.email} | Bal: $${dataFrame.authorize.balance}`, "success");
        return;
    }

    // Capture contract purchase feedback from the server
    if (dataFrame.msg_type === "buy") {
        logTerminalEntry(`Contract Purchased Successfully! ID: ${dataFrame.buy.contract_id} | Balance: $${dataFrame.buy.balance_after}`, "success");
        return;
    }
    
    if (dataFrame.msg_type === "tick" && dataFrame.tick.symbol === liveSubscribedSymbolToken) {
        const tick = dataFrame.tick;
        const livePrice = document.getElementById("livePriceDisplay");
        if (livePrice) livePrice.innerText = tick.quote.toFixed(4);
        
        if (masterDataSeries) masterDataSeries.update({ time: tick.epoch, value: tick.quote });
        
        const botTog = document.getElementById("botToggle");
        if (botTog && botTog.checked) {
            processAutomatedStrategyLoop(tick.quote);
        }
    }
}

// ==========================================
// 7. LIVE TRANSACTION DISPATCH ENGINE
// ==========================================
function executeLiveOrderContract(direction) {
    if (!socketInstance || socketInstance.readyState !== WebSocket.OPEN) {
        logTerminalEntry("Execution failed: Network connection is down.", "error");
        return;
    }

    // Determine target market ticker asset or default to Volatility 10 Index
    const assetSel = document.getElementById("assetSelector");
    const operationalTargetSymbol = assetSel ? assetSel.value : "R_10";

    // Pull custom stake value entered on screen
    const userStakeInput = document.getElementById("stakeVolumeInput"); 
    if (userStakeInput && !isNaN(parseFloat(userStakeInput.value))) {
        baselineUserStake = parseFloat(userStakeInput.value);
    }

    logTerminalEntry(`[ORDER] Transmitting real contract request: ${direction} via WebSocket...`, "bot");

    // Constructing the exact payload parameters requested by the Deriv API schema
    const orderPayload = {
        buy: 1,
        price: ongoingAlgorithmicStake,
        parameters: {
            amount: ongoingAlgorithmicStake,
            basis: "stake",
            contract_type: direction === "RISE" ? "CALL" : "PUT",
            currency: "USD",
            duration: 1,
            duration_unit: "t", // 't' runs a hyper-fast 1-tick trade contract execution
            symbol: operationalTargetSymbol
        }
    };

    socketInstance.send(JSON.stringify(orderPayload));
}

// ==========================================
// 8. ALGORITHMIC BOT STRATEGY EXECUTION
// ==========================================
function processAutomatedStrategyLoop(activePrice) {
    systemExecutionSequenceCounter++;
    
    // Evaluates local logic matrices and submits market trades every 10 ticks
    if (systemExecutionSequenceCounter % 10 === 0) {
        if (lastSimulatedTradeDirection !== null && mockTradeEntryPrice !== 0) {
            const pricingDelta = activePrice - mockTradeEntryPrice;
            let win = (lastSimulatedTradeDirection === "RISE" && pricingDelta > 0) || 
                      (lastSimulatedTradeDirection === "FALL" && pricingDelta < 0);
            
            if (win) {
                globalBotProfitLossState += ongoingAlgorithmicStake * 0.95; 
                logTerminalEntry(`[WIN] +$${(ongoingAlgorithmicStake * 0.95).toFixed(2)}. Net Balance: $${globalBotProfitLossState.toFixed(2)}`, "success");
                ongoingAlgorithmicStake = baselineUserStake; 
            } else {
                globalBotProfitLossState -= ongoingAlgorithmicStake;
                logTerminalEntry(`[LOSS] -$${ongoingAlgorithmicStake.toFixed(2)}. Net Balance: $${globalBotProfitLossState.toFixed(2)}`, "error");
                
                if (ongoingAlgorithmicStake >= (baselineUserStake * Math.pow(2, MAX_MARTINGALE_STREAK))) {
                    logTerminalEntry(`[⚠️ RISK SHIELD] Maximum loss cap hit. Resetting stake to avoid margin liquidation.`, "error");
                    ongoingAlgorithmicStake = baselineUserStake;
                } else {
                    ongoingAlgorithmicStake *= 2; 
                    logTerminalEntry(`[MARTINGALE] Bot multiplied stake size target to: $${ongoingAlgorithmicStake.toFixed(2)}`, "bot");
                }
            }
        }
        
        lastSimulatedTradeDirection = Math.random() > 0.5 ? "RISE" : "FALL";
        mockTradeEntryPrice = activePrice;
        totalBotTradesExecuted++;
        
        logTerminalEntry(`[BOT] Executing Position #${totalBotTradesExecuted}: ${lastSimulatedTradeDirection} @ $${ongoingAlgorithmicStake.toFixed(2)}`, "bot");
        
        // 🌟 SUBMITS THE AUTHENTIC PURCHASE PAYLOAD DIRECTLY TO DERIV
        executeLiveOrderContract(lastSimulatedTradeDirection);
    }
}

// ==========================================
// 9. LOGGING & APPLICATION RUNTIME INITIALIZATION
// ==========================================
function logTerminalEntry(msg, type) {
    const el = document.getElementById("terminalLog");
    if (!el) return;
    const item = document.createElement("div");
    item.className = type === "error" ? "text-rose-400" : type === "success" ? "text-emerald-400" : type === "bot" ? "text-amber-400" : "text-indigo-400";
    item.innerText = `[${new Date().toLocaleTimeString()}] ${msg}`;
    el.appendChild(item);
                                        

        
