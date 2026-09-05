/**
 * Sensor Views
 * ==============
 * Manages all sensor data visualizations:
 * - Conveyor top-down canvas view
 * - NIR spectral chart (Chart.js)
 * - Depth/RGB/NIR image displays
 * - Physical sensor bar displays
 */

class SensorViews {
    constructor() {
        this._initConveyorCanvas();
        this._initNIRChart();
        this._conveyorState = null;
        this._animationFrame = null;
        this._beltOffset = 0;
        this._drawnBeltW = null;   // eased toward the belt_width setpoint
        this._lastFrameTs = 0;

        // Start conveyor animation
        this._animateConveyor = this._animateConveyor.bind(this);
        this._animateConveyor();
    }

    // ─── Conveyor Top-Down View ─────────────────────────────────

    _initConveyorCanvas() {
        this.conveyorCanvas = document.getElementById('conveyor-canvas');
        if (!this.conveyorCanvas) return;
        this.ctx = this.conveyorCanvas.getContext('2d');
        this._resizeConveyorCanvas();
        window.addEventListener('resize', () => this._resizeConveyorCanvas());
    }

    _resizeConveyorCanvas() {
        if (!this.conveyorCanvas) return;
        const wrapper = this.conveyorCanvas.parentElement;
        const rect = wrapper.getBoundingClientRect();
        this.conveyorCanvas.width = rect.width * window.devicePixelRatio;
        this.conveyorCanvas.height = rect.height * window.devicePixelRatio;
        this.conveyorCanvas.style.width = rect.width + 'px';
        this.conveyorCanvas.style.height = rect.height + 'px';
        this.ctx.scale(window.devicePixelRatio, window.devicePixelRatio);
    }

    _animateConveyor(ts) {
        // Belt travel is integrated against wall-clock time, not frame count, so
        // the stripe speed reads the same on a 60 Hz and a 144 Hz display.
        const now = ts || performance.now();
        const dt = this._lastFrameTs ? Math.min(0.1, (now - this._lastFrameTs) / 1000) : 0;
        this._lastFrameTs = now;
        this._drawConveyor(dt);
        this._animationFrame = requestAnimationFrame(this._animateConveyor);
    }

    _drawConveyor(dt) {
        if (!this.ctx || !this.conveyorCanvas) return;
        const ctx = this.ctx;
        const W = this.conveyorCanvas.width / window.devicePixelRatio;
        const H = this.conveyorCanvas.height / window.devicePixelRatio;

        // Clear
        ctx.fillStyle = '#0a0f1a';
        ctx.fillRect(0, 0, W, H);

        const state = this._conveyorState;
        if (!state) {
            ctx.fillStyle = '#1e293b';
            ctx.font = '12px Inter, sans-serif';
            ctx.textAlign = 'center';
            ctx.fillText('Awaiting conveyor data...', W / 2, H / 2);
            return;
        }

        const beltW = state.belt_width || 1.4;
        const beltL = state.belt_length || 3.0;
        const speed = state.speed || 0;
        const paused = !!state.paused;

        // The drawn belt is scaled against the widest belt the line supports, so a
        // Line Control width change moves the twin's geometry and not just a
        // number. Ease toward the setpoint rather than snapping between frames.
        if (this._drawnBeltW === null) this._drawnBeltW = beltW;
        this._drawnBeltW += (beltW - this._drawnBeltW) * 0.12;
        if (Math.abs(beltW - this._drawnBeltW) < 0.002) this._drawnBeltW = beltW;
        const drawW = this._drawnBeltW;

        // Belt dimensions in pixels
        const margin = 50;
        const maxPxW = W - margin - 24;
        const beltPxH = H - 30;
        
        // Enforce realistic physical aspect ratio
        let beltPxW = beltPxH * (drawW / beltL);
        if (beltPxW > maxPxW) {
            beltPxW = maxPxW;
        }
        
        const beltX = margin + (maxPxW - beltPxW) / 2;
        const beltY = 10;

        // Draw belt background
        ctx.fillStyle = '#161e2e';
        ctx.strokeStyle = '#2a3a55';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.roundRect(beltX, beltY, beltPxW, beltPxH, 4);
        ctx.fill();
        ctx.stroke();

        // Belt movement stripes
        this._beltOffset += speed * 120 * (dt || 0);
        while (this._beltOffset > 20) this._beltOffset -= 20;
        ctx.save();
        ctx.clip();
        ctx.strokeStyle = 'rgba(56, 189, 248, 0.06)';
        ctx.lineWidth = 1;
        for (let y = beltY - 20 + this._beltOffset; y < beltY + beltPxH + 20; y += 20) {
            ctx.beginPath();
            ctx.moveTo(beltX, y);
            ctx.lineTo(beltX + beltPxW, y);
            ctx.stroke();
        }
        ctx.restore();

        // Draw zone markers
        const scanStartPx = beltY + (state.scan_zone.start / beltL) * beltPxH;
        const scanEndPx = beltY + (state.scan_zone.end / beltL) * beltPxH;
        const diverterPx = beltY + (state.diverter_pos / beltL) * beltPxH;

        // Scan zone
        ctx.fillStyle = 'rgba(34, 211, 238, 0.08)';
        ctx.fillRect(beltX, scanStartPx, beltPxW, scanEndPx - scanStartPx);
        ctx.strokeStyle = 'rgba(34, 211, 238, 0.3)';
        ctx.lineWidth = 1;
        ctx.setLineDash([4, 4]);
        ctx.strokeRect(beltX, scanStartPx, beltPxW, scanEndPx - scanStartPx);
        ctx.setLineDash([]);

        // Scan zone label
        ctx.fillStyle = 'rgba(34, 211, 238, 0.6)';
        ctx.font = '9px JetBrains Mono, monospace';
        ctx.textAlign = 'left';
        ctx.fillText('◀ SCAN ZONE', beltX + 4, scanStartPx + 12);

        // Diverter gate
        ctx.strokeStyle = 'rgba(255, 51, 102, 0.4)';
        ctx.lineWidth = 2;
        ctx.setLineDash([6, 3]);
        ctx.beginPath();
        ctx.moveTo(beltX, diverterPx);
        ctx.lineTo(beltX + beltPxW, diverterPx);
        ctx.stroke();
        ctx.setLineDash([]);
        ctx.fillStyle = 'rgba(255, 51, 102, 0.6)';
        ctx.fillText('◀ DIVERTER GATE', beltX + 4, diverterPx - 4);

        // Belt direction arrow
        ctx.fillStyle = 'rgba(148, 163, 184, 0.3)';
        ctx.font = '10px Inter, sans-serif';
        ctx.textAlign = 'right';
        ctx.fillText('▼ BELT DIRECTION', beltX + beltPxW - 4, beltY + beltPxH - 6);

        // Entry label
        ctx.fillStyle = 'rgba(148, 163, 184, 0.3)';
        ctx.textAlign = 'left';
        ctx.fillText('ENTRY ▶', beltX + 4, beltY + 12);

        // Scale markers on left
        ctx.fillStyle = 'rgba(100, 116, 139, 0.4)';
        ctx.font = '8px JetBrains Mono, monospace';
        ctx.textAlign = 'right';
        for (let m = 0; m <= beltL; m += 0.5) {
            const py = beltY + (m / beltL) * beltPxH;
            ctx.fillText(`${m.toFixed(1)}m`, beltX - 6, py + 3);
            ctx.strokeStyle = 'rgba(100, 116, 139, 0.1)';
            ctx.lineWidth = 0.5;
            ctx.beginPath();
            ctx.moveTo(beltX, py);
            ctx.lineTo(beltX + 4, py);
            ctx.stroke();
        }

        // Draw items
        if (state.items && state.items.length > 0) {
            for (const item of state.items) {
                this._drawItem(ctx, item, beltX, beltY, beltPxW, beltPxH, drawW, beltL);
            }
        }

        this._drawBeltHud(ctx, W, H, beltX, beltY, beltPxW, beltPxH, beltW, speed, paused);
    }

    /**
     * On-canvas readout of the live setpoints plus the stopped-line overlay.
     * Without it a stopped belt is indistinguishable from a running one, and a
     * Line Control change that the belt cannot show yet looks like a dead control.
     */
    _drawBeltHud(ctx, W, H, beltX, beltY, beltPxW, beltPxH, beltW, speed, paused) {
        // Width dimension line across the head of the belt.
        const dimY = beltY + beltPxH + 11;
        ctx.strokeStyle = 'rgba(148, 163, 184, 0.35)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(beltX, dimY); ctx.lineTo(beltX + beltPxW, dimY);
        ctx.moveTo(beltX, dimY - 3); ctx.lineTo(beltX, dimY + 3);
        ctx.moveTo(beltX + beltPxW, dimY - 3); ctx.lineTo(beltX + beltPxW, dimY + 3);
        ctx.stroke();

        ctx.font = '9px JetBrains Mono, monospace';
        ctx.textAlign = 'center';
        ctx.fillStyle = 'rgba(148, 163, 184, 0.75)';
        const wLabel = `${beltW.toFixed(2)} m`;
        const wPad = ctx.measureText(wLabel).width / 2 + 4;
        ctx.fillStyle = '#0a0f1a';
        ctx.fillRect(beltX + beltPxW / 2 - wPad, dimY - 5, wPad * 2, 10);
        ctx.fillStyle = 'rgba(148, 163, 184, 0.75)';
        ctx.fillText(wLabel, beltX + beltPxW / 2, dimY + 3);

        // Speed readout, tinted by run state. Top-right of the belt — the top-left
        // carries the ENTRY marker and the left gutter carries the scale ticks.
        ctx.textAlign = 'right';
        ctx.fillStyle = paused ? 'rgba(255, 51, 102, 0.9)' : 'rgba(56, 189, 248, 0.9)';
        ctx.fillText(paused ? 'STOPPED · 0.00 m/s' : `${speed.toFixed(2)} m/s`,
                     beltX + beltPxW - 5, beltY + 12);

        if (!paused) return;

        // Stopped-line overlay.
        ctx.fillStyle = 'rgba(10, 15, 26, 0.55)';
        ctx.fillRect(beltX, beltY, beltPxW, beltPxH);
        const bandH = 22;
        const bandY = beltY + beltPxH / 2 - bandH / 2;
        ctx.fillStyle = 'rgba(255, 51, 102, 0.14)';
        ctx.fillRect(beltX, bandY, beltPxW, bandH);
        ctx.strokeStyle = 'rgba(255, 51, 102, 0.5)';
        ctx.lineWidth = 1;
        ctx.strokeRect(beltX + 0.5, bandY + 0.5, beltPxW - 1, bandH - 1);
        ctx.font = '11px JetBrains Mono, monospace';
        ctx.textAlign = 'center';
        ctx.fillStyle = 'rgba(255, 120, 150, 0.95)';
        ctx.fillText('LINE STOPPED', beltX + beltPxW / 2, bandY + 15);
    }

    _drawItem(ctx, item, beltX, beltY, beltPxW, beltPxH, beltW, beltL) {
        // Map world coordinates to pixel coordinates
        const px = beltX + ((item.x / beltW + 0.5) * beltPxW);
        const py = beltY + (item.y / beltL) * beltPxH;
        const pw = Math.max(8, (item.width / beltW) * beltPxW);
        const ph = Math.max(8, (item.depth_extent / beltL) * beltPxH);

        // Simple string hash for deterministic random shape
        let hash = 0;
        for (let i = 0; i < item.id.length; i++) {
            hash = Math.imul(31, hash) + item.id.charCodeAt(i) | 0;
        }
        const rng = () => {
            hash = Math.imul(hash, 1664525) + 1013904223 | 0;
            return (hash >>> 0) / 4294967296;
        };

        // Item color from material table
        const [r, g, b] = item.color || [128, 128, 128];
        
        ctx.fillStyle = `rgba(${r}, ${g}, ${b}, 0.8)`;
        ctx.strokeStyle = `rgba(${Math.max(0, r-40)}, ${Math.max(0, g-40)}, ${Math.max(0, b-40)}, 1)`;
        ctx.lineWidth = 1.5;

        // Draw organic polygon shape based on physical size
        ctx.beginPath();
        const numPoints = 8;
        for (let i = 0; i < numPoints; i++) {
            const angle = (i / numPoints) * Math.PI * 2;
            // Radius variation between 0.7 and 1.1
            const rVar = 0.7 + rng() * 0.4;
            const ptX = px + Math.cos(angle) * (pw / 2) * rVar;
            const ptY = py + Math.sin(angle) * (ph / 2) * rVar;
            if (i === 0) ctx.moveTo(ptX, ptY);
            else ctx.lineTo(ptX, ptY);
        }
        ctx.closePath();
        ctx.fill();
        ctx.stroke();

        // Draw clear annotation if it has been classified
        if (item.decision) {
            const isHazard = item.decision === 'HAZARD';
            const badgeColor = isHazard ? '#ff3366' : '#00ff88';
            const bgColor = 'rgba(15, 23, 42, 0.8)';
            const text = item.label || item.type || 'Unknown';
            
            // Draw leader line
            ctx.beginPath();
            ctx.moveTo(px, py);
            ctx.lineTo(px + pw/2 + 5, py - ph/2 - 5);
            ctx.strokeStyle = badgeColor;
            ctx.lineWidth = 1;
            ctx.stroke();

            // Label background
            ctx.font = '9px "Inter", sans-serif';
            const textWidth = ctx.measureText(text).width;
            const labelX = px + pw/2 + 5;
            const labelY = py - ph/2 - 5;
            
            ctx.fillStyle = bgColor;
            ctx.beginPath();
            ctx.roundRect(labelX, labelY - 10, textWidth + 18, 14, 2);
            ctx.fill();
            
            // Border left
            ctx.fillStyle = badgeColor;
            ctx.beginPath();
            ctx.roundRect(labelX, labelY - 10, 3, 14, [2, 0, 0, 2]);
            ctx.fill();

            // Text
            ctx.fillStyle = '#fff';
            ctx.textAlign = 'left';
            ctx.fillText(text, labelX + 6, labelY);
            
            // Confidence or mark
            if (isHazard) {
                ctx.fillStyle = badgeColor;
                ctx.fillText('!', labelX + textWidth + 10, labelY);
            } else {
                ctx.fillStyle = badgeColor;
                ctx.fillText('✓', labelX + textWidth + 8, labelY);
            }
        }
    }

    updateConveyorState(state) {
        this._conveyorState = state;
    }

    // ─── NIR Spectral Chart ─────────────────────────────────────

    _initNIRChart() {
        const canvas = document.getElementById('nir-chart');
        if (!canvas || typeof Chart === 'undefined') return;

        this.nirChart = new Chart(canvas, {
            type: 'line',
            data: {
                labels: [],
                datasets: [{
                    label: 'NIR Spectrum',
                    data: [],
                    borderColor: '#a78bfa',
                    backgroundColor: 'rgba(167, 139, 250, 0.1)',
                    borderWidth: 1.5,
                    fill: true,
                    tension: 0.3,
                    pointRadius: 0,
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                animation: { duration: 200 },
                scales: {
                    x: {
                        title: { display: true, text: 'Wavelength (nm)', color: '#64748b', font: { size: 10 } },
                        ticks: { color: '#475569', font: { size: 8 }, maxTicksLimit: 10 },
                        grid: { color: 'rgba(51, 65, 85, 0.3)' },
                    },
                    y: {
                        title: { display: true, text: 'Absorption', color: '#64748b', font: { size: 10 } },
                        ticks: { color: '#475569', font: { size: 8 } },
                        grid: { color: 'rgba(51, 65, 85, 0.3)' },
                        min: 0,
                        max: 1,
                    }
                },
                plugins: {
                    legend: { display: false },
                    tooltip: {
                        backgroundColor: '#1e293b',
                        borderColor: '#334155',
                        borderWidth: 1,
                        titleColor: '#e2e8f0',
                        bodyColor: '#94a3b8',
                        callbacks: {
                            title: (items) => `λ = ${items[0].label} nm`,
                            label: (item) => `Absorption: ${item.parsed.y.toFixed(4)}`,
                        }
                    }
                }
            },
            plugins: [{
                id: 'nirBandAnnotations',
                afterDraw: (chart) => {
                    const ctx = chart.ctx;
                    const xScale = chart.scales.x;
                    const yScale = chart.scales.y;
                    
                    // Annotate C-H and O-H bands
                    const bands = [
                        { center: 1200, label: 'C-H', color: '#22d3ee' },
                        { center: 1400, label: 'O-H', color: '#38bdf8' },
                        { center: 1725, label: 'C-H', color: '#22d3ee' },
                        { center: 1950, label: 'O-H', color: '#38bdf8' },
                    ];

                    for (const band of bands) {
                        const labels = chart.data.labels;
                        if (!labels || labels.length === 0) continue;
                        
                        // Find closest label index
                        let closest = 0;
                        let minDist = Infinity;
                        for (let i = 0; i < labels.length; i++) {
                            const dist = Math.abs(parseFloat(labels[i]) - band.center);
                            if (dist < minDist) {
                                minDist = dist;
                                closest = i;
                            }
                        }

                        const x = xScale.getPixelForValue(closest);
                        const top = yScale.top;
                        const bottom = yScale.bottom;

                        ctx.save();
                        ctx.strokeStyle = band.color;
                        ctx.globalAlpha = 0.3;
                        ctx.lineWidth = 1;
                        ctx.setLineDash([3, 3]);
                        ctx.beginPath();
                        ctx.moveTo(x, top);
                        ctx.lineTo(x, bottom);
                        ctx.stroke();
                        ctx.setLineDash([]);

                        ctx.globalAlpha = 0.7;
                        ctx.fillStyle = band.color;
                        ctx.font = '8px JetBrains Mono';
                        ctx.textAlign = 'center';
                        ctx.fillText(band.label, x, top + 10);
                        ctx.restore();
                    }
                }
            }]
        });
    }

    updateNIRChart(spectrum, wavelengths) {
        if (!this.nirChart || !spectrum || !wavelengths) return;
        
        this.nirChart.data.labels = wavelengths.map(w => Math.round(w).toString());
        this.nirChart.data.datasets[0].data = spectrum;
        this.nirChart.update('none');
    }

    // ─── Image Displays ─────────────────────────────────────────

    updateDepthImage(base64) {
        // The Vision Feed shows two different depth images: the camera's own
        // colourised stream (#depth-image) and this conveyor-wide segmented one.
        // Where both exist the segmented view has its own element, so prefer it
        // and fall back to the shared id on pages that only have one.
        const target = document.getElementById('tof-image') ? 'tof' : 'depth';
        this._updateImage(target + '-image', target + '-placeholder', base64);
    }

    updateRGBImage(base64) {
        this._updateImage('rgb-image', 'rgb-placeholder', base64);
    }

    updateNIRSectionImage(base64) {
        this._updateImage('nir-section-image', 'nir-section-placeholder', base64);
    }

    _updateImage(imgId, placeholderId, base64) {
        const img = document.getElementById(imgId);
        const placeholder = document.getElementById(placeholderId);
        if (!img || !base64) return;
        
        img.src = 'data:image/png;base64,' + base64;
        img.style.display = 'block';
        if (placeholder) placeholder.style.display = 'none';
        // Frame is live — enable the scan-sweep treatment on its pane.
        const pane = img.closest('.media');
        if (pane) pane.classList.add('scanning');
    }

    // ─── Physical Sensor Bars ───────────────────────────────────

    updateSensorReadings(features) {
        if (!features) return;

        const updates = [
            { id: 'weight', value: features.mass_kg, max: 20, unit: ' kg', decimals: 2 },
            { id: 'density', value: features.density_kg_m3, max: 3000, unit: ' kg/m³', decimals: 0 },
            { id: 'nir-ch', value: features.nir_ch_peak, max: 1, unit: '', decimals: 3 },
            { id: 'nir-oh', value: features.nir_oh_peak, max: 1, unit: '', decimals: 3 },
            { id: 'metal', value: features.metal_flag ? 1 : 0, max: 1, 
              unit: features.metal_flag ? ' YES' : ' NO', decimals: 0 },
            { id: 'dielectric', value: features.dielectric, max: 1, unit: '', decimals: 3 },
        ];

        for (const u of updates) {
            const fill = document.getElementById(`fb-${u.id}`);
            const val = document.getElementById(`fv-${u.id}`);
            if (fill) {
                const pct = Math.min(100, (u.value / u.max) * 100);
                fill.style.width = `${pct}%`;
            }
            if (val) {
                val.textContent = (typeof u.value === 'number' ? u.value.toFixed(u.decimals) : u.value) + u.unit;
            }
        }
    }

    // ─── Decision Display ───────────────────────────────────────

    updateDecision(data) {
        if (!data) return;
        
        const display = document.getElementById('decision-display');
        if (!display) return; // UI element was removed, ignore
        
        const label = document.getElementById('decision-label');
        const detail = document.getElementById('decision-detail');
        const confidence = document.getElementById('decision-confidence-value');
        const icon = display.querySelector('.decision-icon');

        const isHazard = data.decision === 'HAZARD';

        display.className = `decision-display ${isHazard ? 'hazard' : 'safe'}`;
        label.textContent = isHazard
            ? `⛔ HAZARD — DIVERTER GATE TRIGGERED`
            : `✅ SAFE — KEEP ON BELT`;

        let detailText = data.reasoning || '';
        if (data.item && data.item.label) {
            detailText = `${data.item.label} | ${detailText}`;
        }
        detail.textContent = detailText;

        confidence.textContent = `${(data.confidence * 100).toFixed(1)}%`;
        icon.textContent = isHazard ? '⛔' : '✅';

        // Confidence meter (spec: rich AI result panel)
        const conf = document.getElementById('decision-conf-fill');
        if (conf) {
            const pct = Math.round(data.confidence * 100);
            conf.style.width = pct + '%';
            conf.className = 'conf-fill ' + (pct < 70 ? 'low' : (isHazard ? 'hazard' : 'safe'));
        }

        // Alert banner. Only the Overview declares one — this panel is also
        // rendered on /sensors, where an unguarded lookup threw on every hazard.
        const banner = document.getElementById('alert-banner');
        const alertText = document.getElementById('alert-text');
        if (isHazard && banner) {
            banner.classList.add('active', 'hazard');
            if (alertText) {
                alertText.textContent = `HAZARD: ${data.item?.label || 'Unknown'} — DIVERTER GATE TRIGGERED`;
            }
            // Auto-hide after 3 seconds
            clearTimeout(this._alertTimeout);
            this._alertTimeout = setTimeout(() => {
                banner.classList.remove('active');
            }, 3000);
        }
    }

    destroy() {
        if (this._animationFrame) {
            cancelAnimationFrame(this._animationFrame);
        }
        if (this.nirChart) {
            this.nirChart.destroy();
        }
    }
}

// Widest belt the line supports (matches the Line Control slider max and the
// server-side clamp in SimulationLoop.update_config). The twin draws every
// narrower belt as a fraction of this, so width changes are visible.
SensorViews.BELT_WIDTH_MAX = 2.0;

// Export globally
window.SensorViews = SensorViews;
