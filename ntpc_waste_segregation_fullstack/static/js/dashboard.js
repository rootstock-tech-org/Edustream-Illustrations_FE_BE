/**
 * Dashboard Controller
 * =====================
 * Main entry point for the SMART-SEG dashboard.
 * Manages WebSocket connection, UI controls, and orchestrates
 * all visualization modules.
 */

(function() {
    'use strict';

    // ─── Module Instances ───────────────────────────────────────
    let socket = null;
    let sensorViews = null;
    let itemTypes = {};
    let decisionLog = [];
    let scanHistory = {};
    let lastSensorViews = null;
    let lastHazardId = null;
    let lastPaused = null;
    let beltWidth = 1.4;        // live, from state_update; config default until then
    const boundSliders = {};   // sliderId -> { slider, valueEl, format }
    const MAX_LOG_ENTRIES = 50;

    // ─── Initialize ─────────────────────────────────────────────

    function init() {
        console.log('[SMART-SEG] Initializing dashboard...');

        // Init visualization modules
        sensorViews = new SensorViews();
        // The 3D point cloud lives on /camera now, and three_renderer.js is not
        // loaded here. SmartSegPanels.apply() takes `undefined` for it happily.

        // Init WebSocket
        initSocket();

        // Init UI controls
        initControls();

        // Fetch initial config
        fetchConfig();
        
        console.log('[SMART-SEG] Dashboard ready.');
    }

    // ─── WebSocket ──────────────────────────────────────────────

    function initSocket() {
        socket = io();

        socket.on('connect', () => {
            console.log('[WS] Connected');
            setConnectionStatus(true);
        });

        socket.on('disconnect', () => {
            console.log('[WS] Disconnected');
            setConnectionStatus(false);
        });

        socket.on('initial_state', (data) => {
            console.log('[WS] Initial state received');
            if (data.item_types) {
                itemTypes = data.item_types;
                buildSpawnButtons();
            }
            if (data.conveyor) {
                sensorViews.updateConveyorState(data.conveyor);
                updateStats(data.conveyor.stats);
            }
            syncLineConfig(data.line_config);
            if (data.line_config) setRunState(data.line_config.paused);
        });

        socket.on('state_update', (data) => {
            handleStateUpdate(data);
            feedTelemetry(data);
            if (window.SmartSegUI) SmartSegUI.touch();
        });

        socket.on('item_spawned', (data) => {
            if (data.error) {
                console.warn('[WS] Spawn error:', data.error);
            }
        });
    }

    function setConnectionStatus(connected) {
        const badge = document.getElementById('connection-status');
        const text = document.getElementById('status-text');
        if (connected) {
            badge.className = 'status-badge connected';
            text.textContent = 'CONNECTED';
            if (window.SmartSegUI) SmartSegUI.markConnected();
        } else {
            badge.className = 'status-badge disconnected';
            text.textContent = 'DISCONNECTED';
            if (window.SmartSegUI) SmartSegUI.markDisconnected();
        }
    }

    // ─── State Update Handler ───────────────────────────────────

    function handleStateUpdate(data) {
        // Update conveyor view
        sensorViews.updateConveyorState(data);

        // Update stats
        if (data.stats) {
            updateStats(data.stats);
        }
        updateBeltSpeed(data.speed);
        syncLineConfig(data.line_config);
        setRunState(data.paused);
        // Keep the live belt width in one place; the depth-map hit test and the
        // 3D belt plane both read it rather than assuming the config default.
        if (typeof data.belt_width === 'number') beltWidth = data.belt_width;

        // Update AI stats
        if (data.ai_stats) {
            updateAIStats(data.ai_stats);
        }

        // Update sensor views if we have scan data
        if (data.current_scan) {
            const scan = data.current_scan;
            normalizeScan(scan);

            // Save to history
            if (scan.item && scan.item.id) {
                scanHistory[scan.item.id] = scan;
            }

            // Add to decision log
            addDecisionLogEntry(scan);

            // Global alert on hazard — once per item, not per tick.
            const scanId = scan.item && scan.item.id;
            if (scan.decision === 'HAZARD' && scanId && scanId !== lastHazardId) {
                lastHazardId = scanId;
                if (window.SmartSegUI) {
                    SmartSegUI.toast('⚠ HAZARD DETECTED',
                        (scan.item.label || 'Unknown material') + ' → diverter triggered', 'hazard');
                }
            }
        }

        if (data.sensor_views) lastSensorViews = data.sensor_views;

        // Sensor panels are shared with /camera and /sensors; each page renders
        // whichever of them its template declares. On the Overview that is just
        // the classification hero.
        if (window.SmartSegPanels) SmartSegPanels.apply(data, sensorViews);
    }

    /**
     * Give current_scan the { item: {id, type, label} } shape the UI reads.
     *
     * _serialize_scan() puts id and type at the top level and never sends a
     * human-readable name, so the decision feed, hazard toast, alert banner
     * and scan tooltip all displayed 'unknown'. The label comes from the
     * item_types table the server already sends with initial_state.
     */
    function normalizeScan(scan) {
        if (!scan || scan.item) return;
        const type = scan.type || scan.hazard_type || null;
        const info = (type && itemTypes[type]) || null;
        scan.item = {
            id: scan.id || null,
            type: type,
            label: (info && info.label) || prettifyType(type),
            is_hazard: info ? !!info.is_hazard : undefined,
        };
    }

    /** Fallback for a material the item_types table does not describe. */
    function prettifyType(type) {
        if (!type) return 'Unidentified object';
        return String(type).replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
    }

    // ─── Stats Display ──────────────────────────────────────────

    function updateStats(stats) {
        // Measured server-side over a trailing 60 s window of completions. This
        // used to be a hardcoded '~120', so the KPI never moved when the spawn
        // rate changed — which read as a broken control.
        if (typeof stats.throughput_per_min === 'number') {
            setText('stat-items-min', Math.round(stats.throughput_per_min));
        }
        setText('total-spawned', stats.total_spawned || 0);
        setText('total-passed', stats.total_passed || 0);
        setText('total-diverted', stats.total_diverted || 0);
        setText('total-active', stats.active_on_belt || 0);
        setText('stat-safe-count', stats.total_passed || 0);
        setText('stat-hazard-count', stats.total_diverted || 0);
    }

    function updateBeltSpeed(speed) {
        if (speed !== undefined) {
            setText('stat-belt-speed', speed.toFixed(2));
        }
    }

    /**
     * Reflect whether the line is actually running.
     *
     * The belt speed KPI reports the *measured* speed, which the server reports as
     * 0.00 while the line is stopped. Without this the operator sees a slider at
     * 0.50 m/s next to a KPI at 0.00 and a frozen twin, and reads it as a broken
     * control rather than a stopped line.
     */
    function setRunState(paused) {
        if (paused === undefined || paused === null) return;
        if (paused === lastPaused) { if (paused) updateSpeedFoot(); return; }
        lastPaused = paused;

        const pill = document.getElementById('line-status-pill');
        if (pill) {
            pill.className = 'pill ' + (paused ? 'pill-hazard' : 'pill-safe');
            pill.style.padding = '2px 8px';
            pill.innerHTML = '<span class="dot' + (paused ? '' : ' dot-live') + '"></span>';
            pill.appendChild(document.createTextNode(paused ? 'Stopped' : 'Running'));
        }

        updateSpeedFoot();
        updateDriveButtons();
    }

    /**
     * Grey out the command that is already satisfied.
     *
     * Start and Stop were always enabled, so pressing Start on a running line
     * did nothing and looked like a dead button. Disabling the inapplicable one
     * makes the no-op legible instead.
     */
    function updateDriveButtons() {
        const start = document.getElementById('btn-sim-start');
        const stop = document.getElementById('btn-sim-stop');
        if (start) {
            start.disabled = !lastPaused;
            start.title = lastPaused ? 'Start the line' : 'Line is already running';
        }
        if (stop) {
            stop.disabled = !!lastPaused;
            stop.title = lastPaused ? 'Line is already stopped' : 'Stop the line';
        }
    }

    /** Caption under the belt speed KPI: run state, plus the armed setpoint when stopped. */
    function updateSpeedFoot() {
        const foot = document.getElementById('belt-speed-foot');
        if (!foot) return;
        if (!lastPaused) {
            foot.innerHTML = '<span class="pill pill-safe" style="padding:1px 7px; font-size:10px">Normal</span>' +
                ' range 0.4 – 0.7';
            return;
        }
        const sp = document.getElementById('speed-slider');
        const setpoint = sp ? parseFloat(sp.value).toFixed(2) : '—';
        foot.innerHTML = '<span class="pill pill-hazard" style="padding:1px 7px; font-size:10px">Stopped</span>' +
            ' setpoint ' + setpoint + ' m/s';
    }

    function updateAIStats(stats) {

        // Feature importance panel lives on /logs; no-ops when absent.
        if (window.SmartSegPanels) SmartSegPanels.updateFeatureImportance(stats);

        // Model info caption sits with the analytics panel on /logs.
        if (window.SmartSegPanels) SmartSegPanels.updateModelInfo(stats);
        // Accuracy Chip
        const passRate = ((stats.simulation_accuracy || 1.0) * 100).toFixed(1);
        const passRateEl = document.getElementById('stat-pass-rate');
        if (passRateEl) passRateEl.textContent = `${passRate}%`;
    }

    // ─── Decision Log ───────────────────────────────────────────

    // current_scan persists on the server until the next item is classified,
    // so it arrives on every tick at 30 Hz. Without this guard one physical
    // item produced a dozen identical feed rows (ntpc.js already dedupes the
    // audit log the same way).
    const loggedScanIds = new Set();

    function addDecisionLogEntry(scan) {
        const scanKey = (scan.item && scan.item.id) || null;
        if (scanKey) {
            if (loggedScanIds.has(scanKey)) return;
            loggedScanIds.add(scanKey);
            if (loggedScanIds.size > 2000) {
                loggedScanIds.delete(loggedScanIds.values().next().value);
            }
        }

        const entry = {
            id: scanKey || 'unknown',
            type: (scan.item && (scan.item.label || scan.item.type)) || 'Unidentified object',
            decision: scan.decision,
            confidence: scan.confidence,
            time: new Date().toLocaleTimeString(),
        };

        decisionLog.unshift(entry);
        if (decisionLog.length > MAX_LOG_ENTRIES) {
            decisionLog = decisionLog.slice(0, MAX_LOG_ENTRIES);
        }

        renderDecisionLog();
    }

    function renderDecisionLog() {
        const container = document.getElementById('decision-log');
        if (!container) return;

        if (decisionLog.length === 0) {
            container.innerHTML = `
                <div class="no-data">
                    <div class="no-data-icon">📭</div>
                    <span>No decisions yet</span>
                </div>`;
            return;
        }

        container.innerHTML = decisionLog.slice(0, 20).map(entry => {
            const cls = entry.decision === 'HAZARD' ? 'hazard' : 'safe';
            return `
                <div class="decision-entry ${cls}" style="cursor: pointer;" onclick="showHistoricalScan('${entry.id}', event)" title="Click to view scan data">
                    <span class="decision-tag ${cls}">${entry.decision}</span>
                    <span style="flex:1; color: var(--text-secondary);">${entry.type}</span>
                    <span style="color: var(--text-dim); font-size: 0.65rem;">${entry.time}</span>
                </div>`;
        }).join('');
    }

    // ─── UI Controls ────────────────────────────────────────────

    function initControls() {
        bindSlider('speed-slider', 'speed-value', 'speed',
            (val) => `${parseFloat(val).toFixed(2)} m/s`);
        bindSlider('spawn-rate-slider', 'spawn-rate-value', 'spawn_rate',
            (val) => `${parseInt(val, 10)} /min`);
        bindSlider('belt-width-slider', 'belt-width-value', 'belt_width',
            (val) => `${parseFloat(val).toFixed(2)} m`);
        bindSlider('noise-slider', 'noise-value', 'noise_scale',
            (val) => `${parseFloat(val).toFixed(1)}×`);

        const speedSlider = document.getElementById('speed-slider');
        if (speedSlider) speedSlider.addEventListener('input', updateSpeedFoot);

        // Sim Control Buttons
        const btnStart = document.getElementById('btn-sim-start');
        const btnStop = document.getElementById('btn-sim-stop');
        const btnReset = document.getElementById('btn-sim-reset');
        
        if (btnStart) {
            btnStart.addEventListener('click', () => {
                if (window.SmartSegUI) {
                    SmartSegUI.driveCommand(btnStart, 'STARTING LINE…', 'Line running',
                        () => fetch('/api/sim/start', { method: 'POST' }));
                } else fetch('/api/sim/start', { method: 'POST' });
            });
        }
        if (btnStop) {
            btnStop.addEventListener('click', () => {
                if (window.SmartSegUI) {
                    SmartSegUI.driveCommand(btnStop, 'STOPPING LINE…', 'Line stopped',
                        () => fetch('/api/sim/stop', { method: 'POST' }), { severity: 'warn' });
                } else fetch('/api/sim/stop', { method: 'POST' });
            });
        }
        if (btnReset) {
            btnReset.addEventListener('click', () => {
                if (window.SmartSegUI) {
                    SmartSegUI.driveCommand(btnReset, 'RESETTING…', 'Simulation reset',
                        () => fetch('/api/sim/reset', { method: 'POST' }),
                        { confirm: 'Reset the simulation? All counters and the audit log will be cleared.', severity: 'warn' });
                } else fetch('/api/sim/reset', { method: 'POST' });
            });
        }
    }

    function bindSlider(sliderId, valueId, configKey, format) {
        const slider = document.getElementById(sliderId);
        const valueEl = document.getElementById(valueId);
        if (!slider || !valueEl) return;

        slider.addEventListener('input', () => {
            slider.dataset.touchedAt = String(Date.now());
            valueEl.textContent = format(slider.value);
            socket.emit('update_config', { [configKey]: slider.value });
        });
        boundSliders[sliderId] = { slider, valueEl, format };
        valueEl.textContent = format(slider.value);
    }

    /**
     * Push a server-held setpoint back into a slider.
     *
     * The server is the single source of truth for Line Control: it clamps values
     * and it keeps them across reconnects and across other tabs. Without this a
     * fresh page always shows the markup defaults, so the twin and the controls
     * disagree and the sliders look inert.
     */
    function syncSlider(sliderId, value) {
        const b = boundSliders[sliderId];
        if (!b || value === undefined || value === null) return;
        // Never fight a hand on the control.
        if (document.activeElement === b.slider) return;
        if (Date.now() - (+b.slider.dataset.touchedAt || 0) < 1500) return;
        const next = String(value);
        if (b.slider.value === next) return;
        b.slider.value = next;
        b.valueEl.textContent = b.format(b.slider.value);
    }

    function syncLineConfig(cfg) {
        if (!cfg) return;
        syncSlider('speed-slider', cfg.speed);
        syncSlider('spawn-rate-slider', cfg.spawn_rate);
        syncSlider('belt-width-slider', cfg.belt_width);
        syncSlider('noise-slider', cfg.noise_scale);
    }

    // ─── Spawn Buttons ──────────────────────────────────────────

    function buildSpawnButtons() {
        const grid = document.getElementById('spawn-grid');
        if (!grid) return;

        grid.innerHTML = '';

        for (const [type, info] of Object.entries(itemTypes)) {
            const btn = document.createElement('button');
            btn.className = `spawn-btn ${info.is_hazard ? 'hazard-type' : 'safe-type'}`;

            const [r, g, b] = info.color || [128, 128, 128];
            btn.innerHTML = `
                <span class="color-dot" style="background: rgb(${r},${g},${b});"></span>
                <span>${info.label || type}</span>
            `;

            btn.addEventListener('click', () => {
                socket.emit('spawn_item', { type: type });
                // Visual feedback
                btn.style.transform = 'scale(0.95)';
                setTimeout(() => { btn.style.transform = ''; }, 150);
            });

            grid.appendChild(btn);
        }
    }

    // ─── Fetch Config ───────────────────────────────────────────

    async function fetchConfig() {
        try {
            const resp = await fetch('/api/config');
            const data = await resp.json();

            if (data.item_types && Object.keys(itemTypes).length === 0) {
                itemTypes = data.item_types;
                buildSpawnButtons();
            }

            if (data.use_mock) {
                const badge = document.getElementById('mode-badge');
                if (badge) badge.textContent = 'MOCK SENSORS';
            }
        } catch (e) {
            console.warn('[Config] Failed to fetch:', e);
        }
    }

    // ─── Utilities ──────────────────────────────────────────────

    const ANIMATED_IDS = new Set([
        'total-spawned', 'total-passed', 'total-diverted', 'total-active',
        'stat-safe-count', 'stat-hazard-count', 'stat-belt-speed', 'stat-items-min',
    ]);

    function setText(id, text) {
        const el = document.getElementById(id);
        if (!el) return;
        if (window.SmartSegUI && ANIMATED_IDS.has(id)) {
            SmartSegUI.animateNumber(el, text);
        } else {
            el.textContent = text;
        }
    }

    // ─── KPI telemetry sparklines ───────────────────────────────────
    // Sampled once a second from the 30 Hz stream so the traces read as
    // telemetry rather than noise, and canvases redraw at 1 Hz, not 30.
    let sparks = null;
    let lastSparkAt = 0;
    let lastTotals = { total: 0, safe: 0, hazard: 0 };

    function feedTelemetry(data) {
        if (!window.SmartSegUI) return;
        const now = performance.now();
        if (now - lastSparkAt < 1000) return;
        lastSparkAt = now;
        if (!sparks) {
            const css = getComputedStyle(document.documentElement);
            sparks = {
                total:  new SmartSegUI.Sparkline('spark-total'),
                safe:   new SmartSegUI.Sparkline('spark-safe',   { color: css.getPropertyValue('--safe').trim() }),
                hazard: new SmartSegUI.Sparkline('spark-hazard', { color: css.getPropertyValue('--hazard').trim() }),
                speed:  new SmartSegUI.Sparkline('spark-speed',  { fill: false }),
                rate:   new SmartSegUI.Sparkline('spark-rate'),
            };
        }
        const stats = data.stats || {};
        const total = stats.total_spawned || 0;
        sparks.total.push(total);
        sparks.safe.push(stats.total_passed || 0);
        sparks.hazard.push(stats.total_diverted || 0);
        if (typeof data.speed === 'number') sparks.speed.push(data.speed);
        sparks.rate.push(Math.max(0, total - lastTotals.total) * 60);
        const d = total - lastTotals.total;
        const deltaEl = document.getElementById('kpi-delta-total');
        if (deltaEl && d > 0) {
            deltaEl.hidden = false;
            deltaEl.classList.add('delta-up');
            deltaEl.textContent = '+' + d;
        }
        lastTotals = { total: total, safe: stats.total_passed || 0, hazard: stats.total_diverted || 0 };
    }

    // ─── Boot ───────────────────────────────────────────────────
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }

    // ─── Global API for Interactions ────────────────────────────
    window.showHistoricalScan = function(itemId, event) {
        const scan = scanHistory[itemId];
        if (!scan) {
            console.warn(`No scan history found for item ${itemId}`);
            return;
        }
        
        // Show tooltip if event is provided
        if (event) {
            const tooltip = document.getElementById('metrics-tooltip');
            if (tooltip && scan.features) {
                tooltip.style.display = 'block';
                tooltip.style.left = (event.clientX + 15) + 'px';
                tooltip.style.top = (event.clientY + 15) + 'px';
                
                let metricsHtml = `<strong style="color:#38bdf8; font-size:1rem;">${scan.item?.type || 'Unknown'}</strong><br>`;
                metricsHtml += `<span style="color:${scan.decision === 'HAZARD' ? '#ef4444' : '#22c55e'}; font-weight:bold;">${scan.decision} (${(scan.confidence * 100).toFixed(1)}%)</span><br><hr style="border-color:#334155; margin:5px 0;">`;
                
                const f = scan.features;
                if(f.density_kg_m3) metricsHtml += `Density: ${f.density_kg_m3.toFixed(1)} kg/m³<br>`;
                if(f.mass_kg) metricsHtml += `Mass: ${f.mass_kg.toFixed(2)} kg<br>`;
                if(f.nir_ch_peak) metricsHtml += `NIR (Polymer): ${f.nir_ch_peak.toFixed(3)}<br>`;
                if(f.nir_oh_peak) metricsHtml += `NIR (Water): ${f.nir_oh_peak.toFixed(3)}<br>`;
                if(f.metal_flag !== undefined) metricsHtml += `Metal Detected: ${f.metal_flag > 0.5 ? 'YES' : 'NO'}<br>`;
                if(f.dielectric) metricsHtml += `Dielectric: ${f.dielectric.toFixed(3)}<br>`;
                
                tooltip.innerHTML = metricsHtml;
                
                // Hide after 4 seconds
                clearTimeout(tooltip.timeoutId);
                tooltip.timeoutId = setTimeout(() => { tooltip.style.display = 'none'; }, 4000);
            }
        }
        
        // Temporarily pause auto-updating if they click an old item? 
        // For now, just update the panels directly.
        sensorViews.updateDecision(scan);
        
        if (scan.nir_spectrum && scan.nir_wavelengths) {
            sensorViews.updateNIRChart(scan.nir_spectrum, scan.nir_wavelengths);
        }
        if (scan.nir_section_image) {
            sensorViews.updateNIRSectionImage(scan.nir_section_image);
        }
        
        // Highlight in UI
        const decisionPanel = document.querySelector('.decision-panel');
        decisionPanel.style.outline = '2px solid #38bdf8';
        setTimeout(() => decisionPanel.style.outline = 'none', 1000);
    };

    window.handleDepthMapClick = function(event) {
        if (!lastSensorViews || !lastSensorViews.point_cloud || !lastSensorViews.point_cloud.boxes) return;
        
        const img = event.target;
        const rect = img.getBoundingClientRect();
        
        // Calculate relative click coordinates (0 to 1)
        const relX = (event.clientX - rect.left) / rect.width;
        const relY = (event.clientY - rect.top) / rect.height;
        
        // Belt width is live — a Line Control change moves where every item is
        // drawn, so a hardcoded 1.4 here would pick the wrong item (or none).
        const belt_width = beltWidth;
        const view_length = 1.1; 
        const y_min = 0.7; // 1.0 - (1.1 - 0.5) / 2
        
        const clickWorldX = (relX - 0.5) * belt_width;
        const clickWorldY = (relY * view_length) + y_min;
        
        const y_center = 1.25; // 1.0 + 0.5 / 2
        
        // Find which box was clicked
        for (const box of lastSensorViews.point_cloud.boxes) {
            const actualY = box.y + y_center;
            // Add a small 10% padding to the click target for easier clicking
            if (Math.abs(clickWorldX - box.x) <= box.w * 0.6 && 
                Math.abs(clickWorldY - actualY) <= box.l * 0.6) {
                window.showHistoricalScan(box.id, event);
                return;
            }
        }
    };

})();
