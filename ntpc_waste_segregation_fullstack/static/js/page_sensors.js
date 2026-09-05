/**
 * Sensor Suite page (/sensors)
 * =============================
 * A thin page script: open the socket, hand each state_update to the shared
 * panel dispatch, and keep the connection chrome honest. All of the panel
 * rendering lives in sensor_views.js / sensor_panels.js, so this page and the
 * Overview cannot drift apart.
 */
(function () {
    'use strict';

    let views = null;

    function setConnection(connected) {
        const badge = document.getElementById('connection-status');
        const text = document.getElementById('status-text');
        if (badge) badge.className = 'status-badge ' + (connected ? 'connected' : 'disconnected');
        if (text) text.textContent = connected ? 'LIVE' : 'DISCONNECTED';
        if (window.SmartSegUI) {
            connected ? SmartSegUI.markConnected() : SmartSegUI.markDisconnected();
        }
    }

    document.addEventListener('DOMContentLoaded', function () {
        views = new SensorViews();
        const socket = io();

        socket.on('connect', () => setConnection(true));
        socket.on('disconnect', () => setConnection(false));

        socket.on('initial_state', (data) => {
            // The badge should name the mode actually in effect, which is not
            // always the configured one — see SimulationLoop.active_sensor_mode.
            const badge = document.getElementById('mode-badge');
            if (badge && data.sensor_mode) badge.textContent = data.sensor_mode + ' SENSORS';
        });

        socket.on('state_update', (data) => {
            if (window.SmartSegUI) SmartSegUI.touch();
            SmartSegPanels.apply(data, views);
        });
    });
})();
