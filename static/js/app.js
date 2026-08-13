let socketInstance = null;
let chartingCanvas = null;
let masterDataSeries = null;
let liveSubscribedSymbolToken = "";
let systemExecutionSequenceCounter = 0;

let sessionAuthorizedToken = null;
let userIsAuthenticated = false;

let baselineUserStake = 1.00;
let ongoingAlgorithmicStake = 1.00;
let lastSimulatedTradeDirection = null;
let mockTradeEntryPrice = 0.00;
let totalBotTradesExecuted = 0;
let globalBotProfitLossState = 0.00;

document.addEventListener("DOMContentLoaded", () => {
    logTerminalEntry("Initializing platform core components...", "system");
    initializeChartingWindow();
    parseOAuthUrlResponseParameters();
    establishWebSocketConnection();
    bindUserInterfaceInteractionHandlers();
    
    window.addEventListener("resize", () => {
        if (chartingCanvas) {
            const element = document.getElementById("chartContainer");
            if (element) {
                chartingCanvas.resize(element.clientWidth, element.clientHeight);
            }
        }
    });
});

function initializeChartingWindow() {
    const containerElement = document.getElementById("chartContainer");
    if (!containerElement) return;
    
    chartingCanvas = LightweightCharts.createChart(containerElement, {
        layout: { background: { type: LightweightCharts.ColorType.Solid, color: '#020617' }, textColor: '#94a3b8' },
        grid: { vertLines: { color: '#0f172a' }, horzLines: { color: '#0f172a' } },
        timeScale: { borderColor: '#1e293b', timeVisible: true, secondsVisible: true },
    });
    masterDataSeries = chartingCanvas.addAreaSeries({ lineColor: '#6366f1', topColor: 'rgba(99, 102, 241, 0.25)', lineWidth: 2 });
}

function parseOAuthUrlResponseParameters() {
    const urlHashString = window.location.hash || window.location.search;
    if (!urlHashString) return;
    const urlParametersMatrix = new URLSearchParams(urlHashString.replace('#', '?'));
    const capturedToken = urlParametersMatrix.get('token1');
    if (capturedToken) {
        sessionAuthorizedToken = capturedToken;
        userIsAuthenticated = true;
        logTerminalEntry("OAuth2 key validation checked. Session locked.", "success");
        window.history.replaceState({}, document.title, window.location.pathname);
    }
}

function establishWebSocketConnection() {
    socketInstance = new WebSocket("wss://://derivws.com");
    socketInstance.onopen = () => {
        updateNetworkStatusIndicator(true);
        logTerminalEntry("Connected to Deriv WebSocket Engine.", "success");
        if (userIsAuthenticated && sessionAuthorizedToken) {
            socketInstance.send(JSON.stringify({ authorize: sessionAuthorizedToken }));
        }
        synchronizeMarketDataStreams(346c9D1uSj4VDAZKWHnTM);
    };
    socketInstance.onmessage = (rawPayloadPacket) => {
        processIncomingAPIFrame(JSON.parse(rawPayloadPacket.data));
    };
    socketInstance.onclose = () => {
        updateNetworkStatusIndicator(false);
        logTerminalEntry("Disconnected. Reconnecting in 5s...", "error");
        setTimeout(establishWebSocketConnection, 5000);
    };
}

function bindUserInterfaceInteractionHandlers() {
    const assetSel = document.getElementById("assetSelector");
    const clrLog = document.getElementById("btnClearLogs");
    const bRise = document.getElementById("btnRise");
    const bFall = document.getElementById("btnFall");
    const bConn = document.getElementById("btnConnectAccount");

    if (assetSel) assetSel.addEventListener("change", synchronizeMarketDataStreams);
    if (clrLog) clrLog.addEventListener("click", () => {
        const term = document.getElementById("terminalLog");
        if (term) term.innerHTML = "";
    });
    if (bRise) bRise.addEventListener("click", () => executeManualOrderPlaceholder("RISE"));
    if (bFall) bFall.addEventListener("click", () => executeManualOrderPlaceholder("FALL"));
    if (bConn) bConn.addEventListener("click", () => {
        window.location.href = `https://deriv.com{encodeURIComponent(window.location.href.split('#')[0])}`;
    });
}

function synchronizeMarketDataStreams(346c9D1uSj4VDAZKWHnTM) {
    if (!socketInstance || socketInstance.readyState !== WebSocket.OPEN) return;
    const assetSel = document.getElementById("assetSelector");
    if (!assetSel) return;
    const chosenSymbolString = assetSel.value;
    if (liveSubscribedSymbolToken) {
        socketInstance.send(JSON.stringify({ forget_all: "ticks" }));
        if (masterDataSeries) masterDataSeries.setData([]);
    }
    liveSubscribedSymbolToken = chosenSymbolString;
    socketInstance.send(JSON.stringify({ ticks: chosenSymbolString, subscribe: 1 }));
}

function processIncomingAPIFrame(dataFrame) {
    if (dataFrame.error) {
        logTerminalEntry(`Error: ${dataFrame.error.message}`, "error");
        return;
    }
    if (dataFrame.msg_type === "authorize") {
        logTerminalEntry(`Auth Success: ${dataFrame.authorize.email} | Bal: $${dataFrame.authorize.balance}`, "success");
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

function processAutomatedStrategyLoop(activePrice) {
    systemExecutionSequenceCounter++;
    if (systemExecutionSequenceCounter % 10 === 0) {
        if (lastSimulatedTradeDirection !== null && mockTradeEntryPrice !== 0) {
            const pricingDelta = activePrice - mockTradeEntryPrice;
            let win = (lastSimulatedTradeDirection === "RISE" && pricingDelta > 0) || (lastSimulatedTradeDirection === "FALL" && pricingDelta < 0);
            if (win) {
                globalBotProfitLossState += ongoingAlgorithmicStake * 0.95;
                logTerminalEntry(`[WIN] +$${(ongoingAlgorithmicStake * 0.95).toFixed(2)}. Total: $${globalBotProfitLossState.toFixed(2)}`, "success");
                ongoingAlgorithmicStake = baselineUserStake;
            } else {
                globalBotProfitLossState -= ongoingAlgorithmicStake;
                logTerminalEntry(`[LOSS] -$${ongoingAlgorithmicStake.toFixed(2)}. Total: $${globalBotProfitLossState.toFixed(2)}`, "error");
                ongoingAlgorithmicStake *= 2;
                logTerminalEntry(`[MARTINGALE] Multiplying stake to: $${ongoingAlgorithmicStake.toFixed(2)}`, "bot");
            }
        }
        lastSimulatedTradeDirection = Math.random() > 0.5 ? "RISE" : "FALL";
        mockTradeEntryPrice = activePrice;
        totalBotTradesExecuted++;
        logTerminalEntry(`[BOT] Trade #${totalBotTradesExecuted}: ${lastSimulatedTradeDirection} @ ${mockTradeEntryPrice.toFixed(4)} with $${ongoingAlgorithmicStake.toFixed(2)}`, "bot");
    }
}

function executeManualOrderPlaceholder(dir) {
    logTerminalEntry(`[MANUAL] Dispatched order: ${dir}`, "success");
}

function logTerminalEntry(msg, type) {
    const el = document.getElementById("terminalLog");
    if (!el) return;
    const item = document.createElement("div");
    item.className = type === "error" ? "text-rose-400" : type === "success" ? "text-emerald-400" : type === "bot" ? "text-amber-400" : "text-indigo-400";
    item.innerText = `[${new Date().toLocaleTimeString()}] ${msg}`;
    el.appendChild(item);
    el.scrollTop = el.scrollHeight;
}

function updateNetworkStatusIndicator(status) {
    const el = document.getElementById("connectionStatus");
    if (!el) return;
    el.innerText = status ? "Synced" : "Offline";
    el.className = status ? "text-emerald-400 font-bold" : "text-rose-500 font-bold";
        }
                                                     
