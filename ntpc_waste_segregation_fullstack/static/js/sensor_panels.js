/**
 * Shared sensor-panel wiring
 * ===========================
 * One place that maps a `state_update` payload onto the sensor panels, so the
 * same panel behaves identically wherever it is rendered.
 *
 * The Overview used to host every sensor panel and dashboard.js drove them all
 * inline. Splitting them across Overview, Vision Feed and Sensor Suite would
 * otherwise have meant three copies of this dispatch drifting apart. Each panel
 * is optional: SensorViews no-ops when its element is absent, so a page gets
 * exactly the panels its template declares.
 *
 * Exposed as window.SmartSegPanels — no bundler in this project.
 */
(function () {
    'use strict';

    /**
     * Push one state_update into whichever sensor panels this page has.
     *
     * @param {object} data         the state_update payload
     * @param {SensorViews} views   required; guards internally on missing nodes
     * @param {object} [pointCloud] PointCloudRenderer, when the page has the 3D panel
     */
    function apply(data, views, pointCloud) {
        if (!data || !views) return;

        const sv = data.sensor_views;
        const scan = data.current_scan;

        // Conveyor-wide imagery. A per-item scan carries a sharper crop, so it
        // wins when present — but the wide view is what shows an empty belt.
        if (sv) {
            if (sv.depth_image) views.updateDepthImage(sv.depth_image);
            if (!scan && sv.rgb_image) views.updateRGBImage(sv.rgb_image);
            if (pointCloud && sv.point_cloud) pointCloud.updatePointCloud(sv.point_cloud);
        }

        if (!scan) return;

        views.updateDecision(scan);
        if (scan.rgb_image) views.updateRGBImage(scan.rgb_image);
        if (scan.nir_spectrum && scan.nir_wavelengths) {
            views.updateNIRChart(scan.nir_spectrum, scan.nir_wavelengths);
        }
        if (scan.nir_section_image) views.updateNIRSectionImage(scan.nir_section_image);
        if (scan.features) views.updateSensorReadings(scan.features);
    }

    /**
     * Model Analytics: a server-rendered pandas/seaborn PNG. Lives on whichever
     * page declares `#analytics-plot`; silent no-op everywhere else.
     */
    function loadAnalyticsPlot() {
        const img = document.getElementById('analytics-plot');
        const loading = document.getElementById('analytics-loading');
        if (!img) return Promise.resolve();

        return fetch('/api/analytics_plot')
            .then(r => r.json())
            .then(d => {
                if (!d.plot_b64) return;
                img.src = 'data:image/png;base64,' + d.plot_b64;
                img.style.display = 'inline-block';
                if (loading) loading.style.display = 'none';
            })
            .catch(e => console.warn('[Analytics] Failed to fetch plot', e));
    }

    /**
     * Feature-importance bars, from the classifier's reported importances.
     * Markup matches the .feature-bar styles already in smartseg.css.
     */
    function updateFeatureImportance(aiStats) {
        const container = document.getElementById('ai-feature-importance');
        if (!container || !aiStats) return;

        // DecisionEngine publishes this as `feature_importance`. The dashboard
        // had always read `feature_importances`, so this panel never rendered —
        // accept both rather than depend on which spelling wins.
        const imps = aiStats.feature_importance || aiStats.feature_importances;
        if (!imps) return;

        // Descending, so the dominant feature reads first.
        const entries = Object.entries(imps).sort((a, b) => b[1] - a[1]);
        if (!entries.length) return;

        // Scale bars against the strongest feature: absolute importances rarely
        // exceed ~0.35, so raw percentages would render as slivers.
        const max = entries[0][1] || 1;

        container.innerHTML = entries.map(([name, imp]) => `
            <div class="feature-bar">
                <span class="fb-label">${name.replace(/_/g, ' ')}</span>
                <div class="fb-track">
                    <div class="fb-fill" style="width: ${((imp / max) * 100).toFixed(1)}%; background: linear-gradient(90deg, #a78bfa, #22d3ee);"></div>
                </div>
                <span class="fb-value">${(imp * 100).toFixed(1)}%</span>
            </div>
        `).join('');
    }

    /**
     * Subtitle beside the Model Analytics title. Lives with the panel on /logs;
     * left on the Overview it stayed stuck reading "initialising…" forever.
     */
    function updateModelInfo(aiStats) {
        const el = document.getElementById('ai-model-info');
        if (!el || !aiStats) return;
        const total = aiStats.total || 0;
        const safeRate = ((1 - (aiStats.hazard_rate || 0)) * 100).toFixed(1);
        const cv = ((aiStats.accuracy != null ? aiStats.accuracy : 1) * 100).toFixed(1);
        el.textContent = `Random Forest · ${total} decisions · ${safeRate}% safe rate · ${cv}% CV accuracy`;
    }

    window.SmartSegPanels = {
        apply, loadAnalyticsPlot, updateFeatureImportance, updateModelInfo,
    };
})();
