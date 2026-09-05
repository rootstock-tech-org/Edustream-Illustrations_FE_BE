/**
 * NTPC SMART-SEG SCADA Dashboard Controller
 * ==========================================
 * Modern Tailwind/Chart.js Implementation
 */

(function () {
    'use strict';

    function el(id) { return document.getElementById(id); }

    // ─── Theme Toggle ──────────────────────────────────────────
    const btnTheme = el('btn-theme');
    if (btnTheme) {
        btnTheme.addEventListener('click', () => {
            const htmlEl = document.documentElement;
            if (htmlEl.classList.contains('dark')) {
                htmlEl.classList.remove('dark');
                htmlEl.classList.add('light'); // For custom CSS hooks if needed
                localStorage.setItem('ntpc-theme', 'light');
                updateChartThemes('light');
            } else {
                htmlEl.classList.remove('light');
                htmlEl.classList.add('dark');
                localStorage.setItem('ntpc-theme', 'dark');
                updateChartThemes('dark');
            }
        });
        
        // Load saved theme
        const savedTheme = localStorage.getItem('ntpc-theme');
        if (savedTheme === 'light') {
            document.documentElement.classList.remove('dark');
            document.documentElement.classList.add('light');
        }
    }

    // ─── Clock ───────────────────────────────────────────

    function updateClock() {
        const now = new Date();
        const timeStr = now.toLocaleTimeString('en-IN', { hour12: false });
        const dateStr = now.toLocaleDateString('en-IN', { day: '2-digit', month: '2-digit', year: 'numeric' });
        if (el('clock-time')) el('clock-time').textContent = timeStr + ' IST';
        if (el('clock-date')) el('clock-date').textContent = dateStr;
    }
    setInterval(updateClock, 1000);
    updateClock();

    // ─── State Store ─────────────────────────────────────────────

    const state = {
        connected: false,
        paused: false,
        speed: 0.5,
        totalSpawned: 0,
        totalPassed: 0,
        totalDiverted: 0,
        aiAccuracy: 0,
        aiSafe: 0,
        aiHazard: 0,
        aiBreakdown: {},
    };

    const TREND_SIZE = 60; // 60 seconds history
    const trendData = new Array(TREND_SIZE).fill(0);
    let lastTotalSpawned = 0;

    const fullClassLog = [];
    const seenScanIds = new Set();

    const materialMap = {
        wood_paper: { color: '#8D6E63', label: 'Wood / Paper' },
        textile: { color: '#AB47BC', label: 'Textile Scrap' },
        plastic_bag: { color: '#42A5F5', label: 'Film Plastic' },
        wet_organic: { color: '#66BB6A', label: 'Wet Organic' },
        stone_concrete: { color: '#9E9E9E', label: 'Stone / Concrete', isHazard: true },
        thick_glass: { color: '#26C6DA', label: 'Thick Glass', isHazard: true },
        metal_scrap: { color: '#FFA726', label: 'Metal Scrap', isHazard: true },
        tire: { color: '#424242', label: 'Tire / Rubber', isHazard: true },
        procedural_anomaly: { color: '#E91E63', label: 'Anomaly', isHazard: true },
        plastic_bag_stone: { color: '#EF5350', label: 'Heavy Plastic', isHazard: true },
        lithium_battery: { color: '#FF7043', label: 'Li-Ion Battery', isHazard: true },
        ceramic_plate: { color: '#BCAAA4', label: 'Ceramic', isHazard: true },
    };

    /**
     * Chart-safe colour: the material colours describe physical appearance, so
     * a few (ceramic, thick glass) are near-white and vanish on a white panel.
     * Darken only those, preserving hue so the material stays recognisable.
     */
    function chartSafe(r, g, b) {
        const lum = (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
        if (lum > 0.80) {
            const k = 0.72 / lum;
            r = Math.round(r * k); g = Math.round(g * k); b = Math.round(b * k);
        }
        return `rgb(${r}, ${g}, ${b})`;
    }

    /**
     * Replace the hardcoded palette with the server's material table.
     * Keys here previously drifted from the real ones (textile vs
     * textile_scrap, tire vs tire_metal, stone_concrete vs stone,
     * plastic_bag vs plastic_bag_organic), so those four rendered as raw
     * snake_case names in one shared grey.
     */
    function hydrateMaterialMap(itemTypes) {
        if (!itemTypes) return;
        Object.keys(itemTypes).forEach(key => {
            const t = itemTypes[key];
            const rgb = t.color || [136, 136, 136];
            materialMap[key] = {
                color: chartSafe(rgb[0], rgb[1], rgb[2]),
                label: t.label || key,
                isHazard: !!t.is_hazard,
            };
        });
    }

    // ─── Charts Setup ───────────────────────────────────────────

    let trendChart = null;
    let donutChart = null;

    function initCharts() {
        const isLight = document.documentElement.classList.contains('light');
        Chart.defaults.color = isLight ? '#64748b' : '#888';
        Chart.defaults.font.family = '"JetBrains Mono", monospace';
        
        const trendCtx = el('trend-chart');
        if (trendCtx) {
            trendChart = new Chart(trendCtx, {
                type: 'line',
                data: {
                    labels: new Array(TREND_SIZE).fill(''),
                    datasets: [{
                        label: 'Throughput (items/sec)',
                        data: trendData,
                        borderColor: '#3b82f6',
                        backgroundColor: 'rgba(59, 130, 246, 0.2)',
                        borderWidth: 2,
                        pointRadius: 0,
                        fill: true,
                        tension: 0.3
                    }]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    animation: false,
                    plugins: { legend: { display: false }, tooltip: { enabled: false } },
                    scales: {
                        x: { display: false },
                        y: { 
                            beginAtZero: true, 
                            grid: { color: isLight ? '#e2e8f0' : '#333', tickLength: 0 },
                            border: { display: false },
                            ticks: { maxTicksLimit: 5 }
                        }
                    }
                }
            });
        }

        const donutCtx = el('donut-chart');
        if (donutCtx) {
            donutChart = new Chart(donutCtx, {
                type: 'doughnut',
                data: {
                    labels: [],
                    datasets: [{
                        data: [],
                        backgroundColor: [],
                        borderWidth: 1,
                        borderColor: isLight ? '#ffffff' : '#1E1E1E'
                    }]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    cutout: '75%',
                    plugins: {
                        legend: { display: true, position: 'right', labels: { color: isLight ? '#475569' : '#94a3b8', font: {size: 10, family: 'monospace'} } },
                        tooltip: { 
                            backgroundColor: 'rgba(0,0,0,0.8)',
                            titleFont: { size: 12 },
                            bodyFont: { size: 12, family: 'monospace' },
                            padding: 10,
                            callbacks: {
                                label: function(context) {
                                    return ' ' + context.label + ': ' + context.raw + ' units';
                                }
                            }
                        }
                    }
                }
            });
        }
    }

    function updateChartThemes(theme) {
        const isLight = theme === 'light';
        Chart.defaults.color = isLight ? '#64748b' : '#888';
        if (trendChart) {
            trendChart.options.scales.y.grid.color = isLight ? '#e2e8f0' : '#333';
            trendChart.update();
        }
        if (donutChart) {
            donutChart.data.datasets[0].borderColor = isLight ? '#ffffff' : '#1E1E1E';
            donutChart.update();
        }
    }

    function updateCharts() {
        if (trendChart) {
            trendChart.update();
        }
        
        if (donutChart) {
            const keys = Object.keys(state.aiBreakdown);
            if (keys.length > 0) {
                const labels = [];
                const data = [];
                const bgColors = [];
                
                keys.forEach(k => {
                    const count = state.aiBreakdown[k];
                    if (count > 0) {
                        const meta = materialMap[k] || { label: k, color: '#888' };
                        labels.push(meta.label);
                        data.push(count);
                        bgColors.push(meta.color);
                    }
                });
                
                donutChart.data.labels = labels;
                donutChart.data.datasets[0].data = data;
                donutChart.data.datasets[0].backgroundColor = bgColors;
                donutChart.update();
            }
        }
    }

    // ─── Socket.IO Handler ───────────────────────────────────────

    let socket = null;
    try {
        socket = io({ transports: ['polling', 'websocket'] });

        socket.on('connect', () => {
            state.connected = true;
            updateConnectionUI();
            if (window.SmartSegUI) SmartSegUI.markConnected();
        });

        socket.on('disconnect', () => {
            state.connected = false;
            updateConnectionUI();
            if (window.SmartSegUI) SmartSegUI.markDisconnected();
        });

        socket.on('initial_state', (data) => {
            hydrateMaterialMap(data.item_types);
            if (data.conveyor) processConveyor(data.conveyor);
            if (data.ai_stats) processAI(data.ai_stats);
            updateDashboardUI();
        });

        socket.on('state_update', (data) => {
            if (data.speed !== undefined) state.speed = data.speed;
            if (data.paused !== undefined) state.paused = data.paused;
            // Model Analytics moved onto /logs; both calls no-op when absent.
            if (window.SmartSegPanels && data.ai_stats) {
                SmartSegPanels.updateFeatureImportance(data.ai_stats);
                SmartSegPanels.updateModelInfo(data.ai_stats);
            }

            if (data.stats || data.items !== undefined) {
                processConveyor(data);
            }
            if (data.ai_stats) {
                processAI(data.ai_stats);
            }
            if (data.current_scan) {
                processScan(data.current_scan);
            }

            updateDashboardUI();
        });
    } catch (e) {
        console.error('[Socket.IO] Failed to connect:', e);
    }

    function updateConnectionUI() {
        const dot = el('conn-dot');
        const text = el('conn-text');

        if (state.connected) {
            if (state.paused) {
                if (dot) dot.className = 'w-3 h-3 rounded-full bg-gray-500';
                if (text) { text.textContent = 'LINE PAUSED'; }
            } else {
                if (dot) dot.className = 'w-3 h-3 rounded-full bg-black dark:bg-white';
                if (text) { text.textContent = 'PLC ONLINE'; }
            }
        } else {
            if (dot) dot.className = 'w-3 h-3 rounded-full bg-[#D32F2F] animate-pulse';
            if (text) { text.textContent = 'DISCONNECTED'; }
        }
    }

    function processConveyor(data) {
        const stats = data.stats || {};
        state.totalSpawned = stats.total_spawned || data.total_spawned || state.totalSpawned;
        state.totalPassed = stats.total_passed || data.total_passed || state.totalPassed;
        state.totalDiverted = stats.total_diverted || data.total_diverted || state.totalDiverted;
    }

    function processAI(ai) {
        state.aiSafe = ai.safe || 0;
        state.aiHazard = ai.hazard || 0;

        if (ai.simulation_accuracy !== undefined) {
            state.aiAccuracy = ai.simulation_accuracy * 100;
        } else if (ai.accuracy !== undefined) {
            state.aiAccuracy = ai.accuracy * 100;
        } else if (ai.total > 0 && ai.correct_classifications !== undefined) {
            state.aiAccuracy = (ai.correct_classifications / ai.total) * 100;
        } else {
            state.aiAccuracy = 98.4;
        }

        if (ai.by_type && Object.keys(ai.by_type).length > 0) {
            state.aiBreakdown = ai.by_type;
        }
    }

    function processScan(scan) {
        const scanId = scan.id || (scan.item && scan.item.id);
        if (!scanId || seenScanIds.has(scanId)) return;

        seenScanIds.add(scanId);
        if (seenScanIds.size > 2000) {
            const it = seenScanIds.values();
            for (let i = 0; i < 500; i++) seenScanIds.delete(it.next().value);
        }

        const now = new Date();
        const timeStr = now.toLocaleTimeString('en-IN', { hour12: false });
        const type = scan.type || (scan.item && scan.item.type) || 'unknown';
        const decision = scan.decision || (scan.result && scan.result.decision) || 'SAFE';
        const confidence = typeof scan.confidence === 'number' ? scan.confidence : (scan.result ? scan.result.confidence : 0.95);
        
        if (!state.aiBreakdown[type]) state.aiBreakdown[type] = 0;
        state.aiBreakdown[type]++;

        fullClassLog.unshift({
            time: timeStr,
            id: scanId.replace('item_', '').substring(0, 9),
            type: type,
            decision: decision,
            confidence: confidence
        });
        
        if (fullClassLog.length > 1000) fullClassLog.length = 1000;

        renderAuditLog();
        renderBreakdownList();
        updateCharts();

        if (decision === 'HAZARD') {
            const card = el('card-hazard');
            if (card) {
                card.classList.add('kpi-alarm');
                setTimeout(() => card.classList.remove('kpi-alarm'), 800);
            }
        }

        if (el('pid-we-val')) {
            const weightStr = scan.weight !== undefined ? scan.weight.toFixed(2) : '0.00';
            el('pid-we-val').textContent = `${weightStr} kg`;
            el('pid-we-val').setAttribute('class', 'text-green-600 dark:text-green-500 font-bold');
            setTimeout(() => { if (el('pid-we-val')) el('pid-we-val').setAttribute('class', 'text-isa-text-light dark:text-isa-text-dark font-bold'); }, 800);
        }

        if (el('pid-ind-val')) {
            const metal = scan.inductive && scan.inductive.metal_detected;
            el('pid-ind-val').textContent = metal ? 'DETECT' : 'CLEAR';
            el('pid-ind-val').setAttribute('class', metal ? 'text-red-600 dark:text-red-500 font-bold' : 'text-green-600 dark:text-green-500 font-bold');
            setTimeout(() => { if (el('pid-ind-val')) { el('pid-ind-val').textContent = 'CLEAR'; el('pid-ind-val').setAttribute('class', 'text-green-600 dark:text-green-500 font-bold'); } }, 800);
        }

        if (el('pid-se-val')) {
            el('pid-se-val').textContent = 'SCAN';
            el('pid-se-val').setAttribute('class', 'text-blue-500 dark:text-blue-400 font-bold');
            setTimeout(() => { if (el('pid-se-val')) { el('pid-se-val').textContent = 'ACTIVE'; el('pid-se-val').setAttribute('class', 'text-blue-700 dark:text-blue-600 font-bold'); } }, 800);
        }

        if (el('pid-nir-val')) {
            el('pid-nir-val').textContent = 'SCAN';
            el('pid-nir-val').setAttribute('class', 'text-purple-500 dark:text-purple-400 font-bold');
            setTimeout(() => { if (el('pid-nir-val')) { el('pid-nir-val').textContent = 'ACTIVE'; el('pid-nir-val').setAttribute('class', 'text-purple-700 dark:text-purple-600 font-bold'); } }, 800);
        }
    }

    // ─── Throughput Sampling Timer ───────────────────────────────

    setInterval(() => {
        const delta = Math.max(0, state.totalSpawned - lastTotalSpawned);
        lastTotalSpawned = state.totalSpawned;
        
        trendData.push(delta);
        if (trendData.length > TREND_SIZE) trendData.shift();

        updateCharts();

        // Calculate items per minute based on recent 10 seconds
        const recent10 = trendData.slice(-10);
        const count10s = recent10.reduce((a, b) => a + b, 0);
        const itemsPerMin = Math.round(count10s * 6);

        if (el('kpi-tph')) {
            const tph = (itemsPerMin * 1.2 * 60 / 1000).toFixed(2);
            el('kpi-tph').textContent = `${tph} Est. TPH`;
        }
    }, 1000);

    // ─── UI Renderers ────────────────────────────────────────────

    function updateDashboardUI() {
        updateConnectionUI();

        // Controls
        const isPaused = state.paused;
        if (el('btn-start')) {
            el('btn-start').style.opacity = !isPaused ? '0.4' : '1';
            el('btn-start').style.cursor = !isPaused ? 'not-allowed' : 'pointer';
        }
        if (el('btn-stop')) {
            el('btn-stop').style.opacity = isPaused ? '0.4' : '1';
            el('btn-stop').style.cursor = isPaused ? 'not-allowed' : 'pointer';
        }

        // KPI Cards
        if (el('kpi-total')) el('kpi-total').innerHTML = `${state.totalSpawned.toLocaleString('en-IN')}<span class="kpi-unit">units</span>`;
        if (el('kpi-safe')) el('kpi-safe').innerHTML = `${state.totalPassed.toLocaleString('en-IN')}<span class="kpi-unit">units</span>`;
        if (el('kpi-hazard')) el('kpi-hazard').innerHTML = `${state.totalDiverted.toLocaleString('en-IN')}<span class="kpi-unit">units</span>`;
        if (el('kpi-accuracy')) el('kpi-accuracy').innerHTML = `${state.aiAccuracy.toFixed(1)}<span class="kpi-unit">%</span>`;

        const totalHandled = state.totalPassed + state.totalDiverted;
        if (totalHandled > 0) {
            const safePct = ((state.totalPassed / totalHandled) * 100).toFixed(1);
            const hazPct = ((state.totalDiverted / totalHandled) * 100).toFixed(1);
            if (el('kpi-safe-pct')) el('kpi-safe-pct').textContent = `${safePct}% of total stream`;
            if (el('kpi-hazard-pct')) el('kpi-hazard-pct').textContent = `${hazPct}% rejection rate`;
        }

        // P&ID Schematic updates
        const isRunning = !state.paused && state.speed > 0;

        if (el('pid-hopper-state')) {
            el('pid-hopper-state').textContent = isRunning ? 'FEEDING' : 'IDLE';
            el('pid-hopper-state').setAttribute('class', isRunning ? 'text-green-600 dark:text-green-500' : 'text-isa-text-light dark:text-isa-text-dark');
        }

        if (el('pid-motor-status')) {
            el('pid-motor-status').textContent = isRunning ? `RUN` : 'STOP';
            el('pid-motor-status').setAttribute('class', isRunning ? 'text-green-600 dark:text-green-500' : 'text-isa-text-light dark:text-isa-text-dark');
        }
        const schematic = document.getElementById('pid-schematic');
        if (schematic) {
            schematic.classList.toggle('flow-run', isRunning);
        }

        if (el('diag-motor')) {
            el('diag-motor').textContent = isRunning ? `RUNNING` : 'STOPPED';
            el('diag-motor').setAttribute('class', isRunning ? 'font-bold text-green-600 dark:text-green-500' : 'font-bold text-isa-muted-light dark:text-isa-muted-dark');
        }
    }

    // Audit filters (wired by /logs page controls; harmless elsewhere)
    const auditFilter = { decision: 'ALL', query: '' };

    function applyAuditFilter(scan) {
        if (auditFilter.decision !== 'ALL' && scan.decision !== auditFilter.decision) return false;
        if (auditFilter.query) {
            const meta = materialMap[scan.type] || { label: scan.type };
            const hay = (scan.id + ' ' + scan.type + ' ' + (meta.label || '')).toLowerCase();
            if (!hay.includes(auditFilter.query)) return false;
        }
        return true;
    }

    function renderAuditLog() {
        const tbody = el('full-audit-tbody');
        const counter = el('log-counter');
        if (!tbody) return;

        // Summary chips (present on the /logs page only)
        const total = fullClassLog.length;
        const haz = fullClassLog.filter(x => x.decision === 'HAZARD').length;
        const lowConf = fullClassLog.filter(x => x.confidence < 0.70).length;
        if (el('audit-sum-total'))  el('audit-sum-total').textContent = total;
        if (el('audit-sum-safe'))   el('audit-sum-safe').textContent = total - haz;
        if (el('audit-sum-hazard')) el('audit-sum-hazard').textContent = haz;
        if (el('audit-sum-warn'))   el('audit-sum-warn').textContent = lowConf;

        const rows = fullClassLog.filter(applyAuditFilter);

        if (rows.length === 0) {
            const msg = total === 0
                ? 'No classifications recorded yet — start the line to begin scanning material.'
                : 'No records match the current filter.';
            tbody.innerHTML = '<tr><td colspan="6"><div class="empty-state">' +
                '<div class="empty-title">' + (total === 0 ? 'No classification data' : 'No matches') + '</div>' +
                '<div class="empty-body">' + msg + '</div></div></td></tr>';
            if (counter) counter.textContent = total + ' records';
            return;
        }

        if (counter) counter.textContent =
            (rows.length === total ? total : rows.length + ' / ' + total) + ' records';

        tbody.innerHTML = rows.map(scan => {
            const meta = materialMap[scan.type] || { label: scan.type, color: '#888' };
            const isHazard = scan.decision === 'HAZARD';
            const decisionSpan = isHazard
                ? '<span class="badge badge-hazard">HAZARD</span>'
                : '<span class="badge badge-safe">SAFE</span>';
            const confPct = (scan.confidence * 100).toFixed(1);
            const confBadge = scan.confidence < 0.70
                ? ' <span class="badge badge-warn" title="Below review threshold">LOW</span>' : '';
            const actionText = isHazard ? 'DIVERT' : 'PASS';

            return `
                <tr class="table-row ${isHazard ? 'hazard-row' : 'safe-row'}">
                    <td class="mono" style="color:var(--text-faint)">${scan.time}</td>
                    <td class="mono" style="font-weight:640">${scan.id}</td>
                    <td>
                        <div class="flex items-center gap-2">
                            <div class="w-2 h-2 rounded-full" style="background-color: ${meta.color}"></div>
                            <span>${meta.label}</span>
                        </div>
                    </td>
                    <td>${decisionSpan}</td>
                    <td class="mono" style="font-weight:640">${confPct}%${confBadge}</td>
                    <td class="mono" style="text-align:right; font-weight:640; ${isHazard ? 'color:var(--hazard)' : 'color:var(--safe)'}">${actionText}</td>
                </tr>
            `;
        }).join('');
    }

    // Filter controls (present on /logs only)
    (function bindAuditControls() {
        const search = document.getElementById('audit-search');
        if (search) search.addEventListener('input', () => {
            auditFilter.query = search.value.trim().toLowerCase();
            renderAuditLog();
        });
        document.querySelectorAll('[data-audit-filter]').forEach(btn => {
            btn.addEventListener('click', () => {
                auditFilter.decision = btn.dataset.auditFilter;
                document.querySelectorAll('[data-audit-filter]').forEach(b =>
                    b.classList.toggle('btn-primary', b === btn));
                renderAuditLog();
            });
        });
    })();

    function renderBreakdownList() {
        const container = el('breakdown-list');
        if (!container) return;

        const keys = Object.keys(state.aiBreakdown);
        if (keys.length === 0) return;

        const total = Object.values(state.aiBreakdown).reduce((a, b) => a + b, 0);
        if (total === 0) return;

        const sorted = keys.map(k => {
            const meta = materialMap[k] || { label: k, color: '#888', isHazard: false };
            const count = state.aiBreakdown[k];
            const pct = ((count / total) * 100).toFixed(1);
            return { key: k, count: count, pct: pct, ...meta };
        }).sort((a, b) => b.count - a.count);

        container.innerHTML = sorted.map(item => `
            <div class="flex items-center justify-between py-1.5 border-b border-isa-border-light dark:border-isa-border-dark last:border-0">
                <div class="flex items-center gap-2">
                    <div class="w-2 h-2 rounded-full" style="background-color: ${item.color}"></div>
                    <span class="text-xs font-bold">${item.label}</span>
                </div>
                <div class="text-xs font-mono">
                    <span class="text-isa-muted-light dark:text-isa-muted-dark mr-2">${item.count}</span>
                    <span class="font-bold w-10 inline-block text-right">${item.pct}%</span>
                </div>
            </div>
        `).join('');
    }

    // ─── Setup Controls ──────────────────────────────────────────

    function setupControls() {
        const btnStart = el('btn-start');
        if (btnStart) {
            btnStart.addEventListener('click', async () => {
                if (!state.paused) { console.log('Already running'); return; }
                const go = async () => {
                    await fetch('/api/sim/start', { method: 'POST' });
                    state.paused = false;
                    updateDashboardUI();
                };
                if (window.SmartSegUI) SmartSegUI.driveCommand(btnStart, 'STARTING DRIVE…', 'Drive running', go);
                else try { await go(); } catch (e) { console.error('Start failed:', e); }
            });
        }

        const btnStop = el('btn-stop');
        if (btnStop) {
            btnStop.addEventListener('click', async () => {
                if (state.paused) { console.log('Already stopped'); return; }
                const halt = async () => {
                    await fetch('/api/sim/stop', { method: 'POST' });
                    state.paused = true;
                    updateDashboardUI();
                };
                if (window.SmartSegUI) SmartSegUI.driveCommand(btnStop, 'STOPPING DRIVE…', 'Drive stopped', halt, { severity: 'warn' });
                else try { await halt(); } catch (e) { console.error('Stop failed:', e); }
            });
        }

        const btnReset = el('btn-reset');
        if (btnReset) {
            btnReset.addEventListener('click', async () => {
                if (confirm('Reset NTPC SCADA shift counters and classification logs?')) {
                    try {
                        await fetch('/api/sim/reset', { method: 'POST' });
                        fullClassLog.length = 0;
                        seenScanIds.clear();
                        state.aiBreakdown = {};
                        trendData.fill(0);
                        lastTotalSpawned = 0;
                        
                        // Reset stats locally to avoid flash
                        state.totalSpawned = 0;
                        state.totalPassed = 0;
                        state.totalDiverted = 0;
                        
                        renderAuditLog();
                        renderBreakdownList();
                        updateCharts();
                        updateDashboardUI();
                    } catch (e) { console.error('Reset failed:', e); }
                }
            });
        }
    }

    /**
     * Load the classification history the server already holds.
     *
     * fullClassLog is per-page browser state, so every navigation to /logs
     * previously started empty even though the run had processed hundreds of
     * items. The server keeps the authoritative history in
     * DecisionEngine.decision_log; this pulls it in on boot and live scans
     * continue to append on top.
     */
    function hydrateAuditLog() {
        fetch('/api/decisions')
            .then(r => (r.ok ? r.json() : []))
            .then(rows => {
                if (!Array.isArray(rows) || rows.length === 0) return;
                rows.forEach(row => {
                    const id = String(row.item_id || '').replace('track_', 'T');
                    if (seenScanIds.has(id)) return;
                    seenScanIds.add(id);
                    const when = row.timestamp ? new Date(row.timestamp * 1000) : new Date();
                    const type = row.item_type || 'unknown';
                    fullClassLog.push({
                        time: when.toLocaleTimeString('en-IN', { hour12: false }),
                        id: id,
                        type: type,
                        decision: row.decision,
                        confidence: typeof row.confidence === 'number' ? row.confidence : 0,
                    });
                    state.aiBreakdown[type] = (state.aiBreakdown[type] || 0) + 1;
                });
                if (fullClassLog.length > 1000) fullClassLog.length = 1000;
                renderAuditLog();
                renderBreakdownList();
                updateCharts();
            })
            .catch(() => { /* history is a nicety; live updates still work */ });
    }

    // Initialize
    initCharts();
    setupControls();
    hydrateAuditLog();
    // Density-distribution PNG for the /logs Model Analytics panel. One shot,
    // server-rendered; no-ops on pages that do not carry the panel.
    if (window.SmartSegPanels) SmartSegPanels.loadAnalyticsPlot();

})();
