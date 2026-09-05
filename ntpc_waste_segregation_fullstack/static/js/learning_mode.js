// learning_mode.js
// Interactive Learning & Simulation Module

const socket = io();
let currentConfidence = 0.0;
let tutorState = 0;

// Sensor states
const sensors = {
    'chk-vision': true,
    'chk-nir': true,
    'chk-ind': true,
    'chk-load': true,
    'chk-cap': true,
    'chk-dust': false
};

// Chart setup
let accuracyChart = null;
const chartData = {
    labels: Array(20).fill(''),
    datasets: [{
        label: 'AI Confidence (%)',
        data: Array(20).fill(100),
        borderColor: '#465889',
        backgroundColor: 'rgba(70, 88, 137, 0.08)',
        borderWidth: 2,
        fill: true,
        tension: 0.4,
        pointRadius: 0
    }]
};

document.addEventListener("DOMContentLoaded", () => {
    // 1. Chart & Sensor Views Init
    window.sensorViews = new SensorViews();
    
    const ctx = document.getElementById('accuracyChart');
    if (ctx) {
        accuracyChart = new Chart(ctx, {
            type: 'line',
            data: chartData,
            options: {
                responsive: true,
                maintainAspectRatio: false,
                animation: { duration: 0 },
                scales: {
                    y: { min: 0, max: 100, grid: { color: '#EAE4E0' }, ticks: { color: '#767E95' } },
                    x: { grid: { display: false }, ticks: { display: false } }
                },
                plugins: { legend: { display: false } }
            }
        });
    }

    // 2. Driver.js Tour (Updated steps)
    const driverObj = window.driver.js.driver({
        showProgress: true,
        steps: [
            { element: '#tour-pid', popover: { title: 'Conveyor Layout', description: 'This is your conveyor belt. Each colored block is a sensor — click any sensor to disable it and see what happens.', side: "bottom", align: 'start' }},
            { element: '#tour-metrics', popover: { title: 'Live Metrics', description: 'Watch the AI confidence drop in real-time when sensors fail.', side: "right", align: 'start' }},
            { element: '#tour-line', popover: { title: 'Line Controls', description: 'Start/stop the simulation and control belt speed and spawn rate.', side: "left", align: 'start' }},
            { element: '#tour-tutor', popover: { title: 'AI Tutor', description: 'Your guide. It will explain what happens when sensors fail.', side: "left", align: 'start' }}
        ]
    });
    
    if (!localStorage.getItem('smartseg-tour-done')) {
        driverObj.drive();
        localStorage.setItem('smartseg-tour-done', 'true');
    }

    const tutorBubbleBtn = document.getElementById('btn-tutor-bubble');
    const tutorPopup = document.getElementById('tour-tutor');
    const btnCollapse = document.getElementById('btn-collapse-tutor');
    const tutorBody = document.getElementById('tutor-body');
    
    if (tutorBubbleBtn && tutorPopup) {
        tutorBubbleBtn.addEventListener('click', () => {
            if (tutorPopup.style.display === 'none') {
                tutorPopup.style.display = 'flex';
                tutorBubbleBtn.style.background = 'var(--surface-sunk)';
                tutorBubbleBtn.style.color = 'var(--text)';
            } else {
                tutorPopup.style.display = 'none';
                tutorBubbleBtn.style.background = 'var(--accent)';
                tutorBubbleBtn.style.color = '#fff';
            }
        });
    }

    if (btnCollapse && tutorBody && tutorPopup) {
        btnCollapse.addEventListener('click', () => {
            tutorPopup.style.display = 'none';
            if (tutorBubbleBtn) {
                tutorBubbleBtn.style.background = 'var(--accent)';
                tutorBubbleBtn.style.color = '#fff';
            }
        });
    }

    // Custom Tooltip Logic (escapes overflow: auto)
    const tooltipEl = document.createElement('div');
    tooltipEl.className = 'custom-tooltip';
    document.body.appendChild(tooltipEl);

    document.querySelectorAll('[data-tooltip]').forEach(el => {
        el.addEventListener('mouseenter', e => {
            tooltipEl.textContent = el.getAttribute('data-tooltip');
            tooltipEl.style.opacity = '1';
            
            const rect = el.getBoundingClientRect();
            // Position above the element
            tooltipEl.style.left = (rect.left + rect.width / 2) + 'px';
            tooltipEl.style.top = (rect.top - 8) + 'px';
        });
        el.addEventListener('mouseleave', () => {
            tooltipEl.style.opacity = '0';
        });
    });

    // Quest Logic & Dynamic Engine
    const MISSIONS = [
        {
            title: "Sensor Diagnostics",
            theory: "The NIR Spectrometer detects the chemical composition of plastics. Without it, the AI relies only on visual and mass data, leading to a drop in confidence for complex materials.",
            steps: [
                "Deactivate the NIR Spectrometer",
                "Observe AI Confidence drop < 90%",
                "Reactivate the NIR Spectrometer"
            ],
            validate: function(state, conf) {
                if (!this.progress[0] && !sensors['chk-nir']) {
                    this.progress[0] = true;
                    if (panelQuest && panelQuest.style.display !== 'flex') panelQuest.style.display = 'flex';
                }
                if (this.progress[0] && !this.progress[1] && conf < 90) {
                    this.progress[1] = true;
                }
                if (this.progress[1] && !this.progress[2] && sensors['chk-nir']) {
                    this.progress[2] = true;
                }
            },
            progress: [false, false, false]
        },
        {
            title: "Belt Overload",
            theory: "If the conveyor spawn rate is too high while the belt speed is slow, items overlap on the belt. The sensors fail to isolate individual objects, causing the AI to lose track of hazards.",
            steps: [
                "Increase Spawn Rate to maximum (300)",
                "Decrease Belt Speed to minimum (0.2)",
                "Observe AI Confidence plummet < 70%"
            ],
            validate: function(state, conf) {
                const spawnRate = parseFloat(document.getElementById('spawn-rate-slider').value);
                const beltSpeed = parseFloat(document.getElementById('speed-slider').value);
                
                if (!this.progress[0] && spawnRate >= 300) {
                    this.progress[0] = true;
                }
                if (this.progress[0] && !this.progress[1] && beltSpeed <= 0.2) {
                    this.progress[1] = true;
                }
                if (this.progress[1] && !this.progress[2] && conf < 70) {
                    this.progress[2] = true;
                }
            },
            progress: [false, false, false]
        },
        {
            title: "Dust Fault Injection",
            theory: "Optical sensors like the NIR Spectrometer are highly sensitive to environmental factors. Dust accumulation blinds the sensor, forcing the AI to rely on backup modalities.",
            steps: [
                "Check the 'Inject Dust Fault' box",
                "Observe the NIR reading fail (ERR)",
                "Uncheck the 'Inject Dust Fault' box"
            ],
            validate: function(state, conf) {
                const dustFault = document.getElementById('chk-dust').checked;
                if (!this.progress[0] && dustFault) {
                    this.progress[0] = true;
                }
                if (this.progress[0] && !this.progress[1] && document.getElementById('reading-nir').textContent === "ERR") {
                    this.progress[1] = true;
                }
                if (this.progress[1] && !this.progress[2] && !dustFault) {
                    this.progress[2] = true;
                }
            },
            progress: [false, false, false]
        },
        {
            title: "Material Properties",
            theory: "The system differentiates between metals, plastics, and organics using electromagnetic properties. Capacitive sensors detect dielectrics, while inductive sensors detect ferrous metals.",
            steps: [
                "Deactivate the Capacitive Sensor",
                "Deactivate the Inductive Sensor",
                "Observe AI Confidence drop < 85%"
            ],
            validate: function(state, conf) {
                if (!this.progress[0] && !sensors['chk-cap']) {
                    this.progress[0] = true;
                }
                if (this.progress[0] && !this.progress[1] && !sensors['chk-ind']) {
                    this.progress[1] = true;
                }
                if (this.progress[1] && !this.progress[2] && conf < 85) {
                    this.progress[2] = true;
                }
            },
            progress: [false, false, false]
        },
        {
            title: "Full Sensor Failure",
            theory: "In worst-case scenarios, all sensors might go offline, leaving the AI completely blind. The system must fail safely and stop the belt if it cannot guarantee segregation.",
            steps: [
                "Deactivate all 5 sensors",
                "Stop the conveyor belt manually (simulate safety stop)",
                "Click Reset to restore operations"
            ],
            validate: function(state, conf) {
                const allSensorsOff = !sensors['chk-vision'] && !sensors['chk-nir'] && !sensors['chk-ind'] && !sensors['chk-load'] && !sensors['chk-cap'];
                if (!this.progress[0] && allSensorsOff) {
                    this.progress[0] = true;
                }
                
                const btnStart = document.getElementById('btn-start');
                // btnStart is disabled when running, so if disabled=false, it means belt is stopped
                if (this.progress[0] && !this.progress[1] && btnStart.disabled === false) {
                    this.progress[1] = true;
                }
                
                const allSensorsOn = sensors['chk-vision'] && sensors['chk-nir'] && sensors['chk-ind'] && sensors['chk-load'] && sensors['chk-cap'];
                if (this.progress[1] && !this.progress[2] && allSensorsOn && btnStart.disabled === true) {
                    this.progress[2] = true;
                }
            },
            progress: [false, false, false]
        }
    ];

    let currentMissionIdx = 0;
    const btnQuestToggle = document.getElementById('btn-quest-toggle');
    const panelQuest = document.getElementById('panel-quest');
    const btnQuestClose = document.getElementById('btn-quest-close');

    if (btnQuestToggle && panelQuest) {
        btnQuestToggle.addEventListener('click', () => {
            panelQuest.style.display = panelQuest.style.display === 'flex' ? 'none' : 'flex';
            if (panelQuest.style.display === 'flex' && currentMissionIdx === 0 && !MISSIONS[0].progress.some(x=>x)) {
                renderMission(); // Initial render if opened manually
            }
        });
        if (btnQuestClose) {
            btnQuestClose.addEventListener('click', () => panelQuest.style.display = 'none');
        }
    }

    function renderMission() {
        if (currentMissionIdx >= MISSIONS.length) {
            document.getElementById('quest-title').textContent = "All Missions Complete!";
            document.getElementById('quest-theory').innerHTML = "You've mastered the basics of the SMART-SEG system. Feel free to continue experimenting in the Simulation Lab.";
            document.getElementById('quest-theory').style.borderLeftColor = "var(--safe)";
            document.getElementById('quest-steps-container').innerHTML = "";
            document.getElementById('btn-quest-next').style.display = 'none';
            document.getElementById('quest-pct').textContent = '100%';
            document.getElementById('quest-progress').style.width = '100%';
            return;
        }

        const m = MISSIONS[currentMissionIdx];
        document.getElementById('quest-label').textContent = `Mission ${currentMissionIdx + 1}`;
        document.getElementById('quest-title').textContent = m.title;
        document.getElementById('quest-theory').innerHTML = m.theory;
        
        let stepsHtml = "";
        m.steps.forEach((step, i) => {
            const isDone = m.progress[i];
            const isActive = !isDone && (i === 0 || m.progress[i-1]);
            
            // ISA-101 Styling
            const bg = isDone ? "var(--surface-inset)" : (isActive ? "var(--bg)" : "transparent");
            const borderColor = isDone ? "var(--safe)" : (isActive ? "var(--info)" : "var(--border)");
            const textColor = isDone ? "var(--text-muted)" : "var(--text)";
            const opacity = isDone ? "0.6" : "1";
            const textDecor = isDone ? "line-through" : "none";
            
            const boxBg = isDone ? "var(--safe)" : "transparent";
            const boxColor = isDone ? "var(--surface)" : "transparent";
            
            stepsHtml += `
                <div style="display:flex; align-items:center; gap:12px; padding:10px 12px; background:${bg}; border:1px solid ${borderColor}; border-radius:var(--radius-sm); opacity:${opacity}; transition:all 0.2s;">
                    <div style="width:16px; height:16px; flex-shrink:0; border:1px solid ${borderColor}; border-radius:3px; display:flex; align-items:center; justify-content:center; background:${boxBg}; color:${boxColor}; font-size:10px; font-weight:bold;">✓</div>
                    <div style="font-size:13px; font-weight:600; color:${textColor}; text-decoration:${textDecor};">${step}</div>
                </div>
            `;
        });
        document.getElementById('quest-steps-container').innerHTML = stepsHtml;
        
        const completed = m.progress.filter(x => x).length;
        const pct = Math.round((completed / m.steps.length) * 100);
        document.getElementById('quest-pct').textContent = pct + '%';
        document.getElementById('quest-progress').style.width = pct + '%';

        const btnNext = document.getElementById('btn-quest-next');
        if (btnNext) {
            if (completed === m.steps.length) {
                btnNext.style.opacity = '1';
                btnNext.style.pointerEvents = 'all';
                btnNext.textContent = currentMissionIdx === MISSIONS.length - 1 ? 'Finish!' : 'Next Mission';
            } else {
                btnNext.style.opacity = '0.5';
                btnNext.style.pointerEvents = 'none';
                btnNext.textContent = 'Mission in Progress...';
            }
        }
    }

    const btnQuestNext = document.getElementById('btn-quest-next');
    if (btnQuestNext) {
        btnQuestNext.addEventListener('click', () => {
            currentMissionIdx++;
            if (currentMissionIdx >= MISSIONS.length) {
                if (panelQuest) panelQuest.style.display = 'none';
                if (btnQuestToggle) {
                    btnQuestToggle.innerHTML = `
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                            <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path>
                            <polyline points="22 4 12 14.01 9 11.01"></polyline>
                        </svg>
                        <span id="quest-toggle-text">Completed</span>
                    `;
                    btnQuestToggle.className = 'btn btn-safe';
                    btnQuestToggle.style.boxShadow = 'var(--sh-3)';
                }
            }
            renderMission();
        });
    }

    // Initialize first mission UI secretly (it remains hidden until triggered)
    renderMission();

    // 3. WebSocket updates
    socket.on('state_update', (state) => {
        if (window.sensorViews) window.sensorViews._conveyorState = state;
        
        document.getElementById('kpi-total').textContent = Math.round(state.stats.throughput_per_min);
        const conf = Math.round(state.ai_stats.accuracy * 100);
        document.getElementById('kpi-accuracy').textContent = conf;
        
        // Show ▲/▼ arrow indicator
        const arrow = document.getElementById('conf-arrow');
        if (arrow && currentConfidence > 0) {
            const diff = conf - currentConfidence;
            if (diff > 0) {
                arrow.textContent = '▲';
                arrow.style.color = 'var(--safe)';
                arrow.style.opacity = '1';
            } else if (diff < 0) {
                arrow.textContent = '▼';
                arrow.style.color = 'var(--hazard)';
                arrow.style.opacity = '1';
            } else {
                arrow.style.opacity = '0.3';
            }
        }

        // Update Chart
        if (accuracyChart) {
            chartData.datasets[0].data.shift();
            chartData.datasets[0].data.push(conf);
            accuracyChart.update();
        }

        // Update live readings in diagram
        if (sensors['chk-vision']) document.getElementById('reading-vision').textContent = (Math.random() * 200 + 500).toFixed(1) + " cm³";
        else document.getElementById('reading-vision').textContent = "ERR";

        if (sensors['chk-nir']) document.getElementById('reading-nir').textContent = (Math.random() * 400 + 1200).toFixed(0) + " nm";
        else document.getElementById('reading-nir').textContent = "ERR";

        if (sensors['chk-ind']) document.getElementById('reading-ind').textContent = (Math.random() > 0.5 ? "0.8 V" : "0.1 V");
        else document.getElementById('reading-ind').textContent = "SHORT";

        if (sensors['chk-load']) document.getElementById('reading-load').textContent = (Math.random() * 50 + 10).toFixed(1) + " g";
        else document.getElementById('reading-load').textContent = "ERR";

        if (sensors['chk-cap']) document.getElementById('reading-cap').textContent = (Math.random() * 20 + 5).toFixed(1) + " pF";
        else document.getElementById('reading-cap').textContent = "ERR";

        if (currentConfidence > 90 && conf < 80 && tutorState === 1) {
            addMsg("Notice how AI Confidence dropped to " + conf + "%? Without mass data, the system can't compute density for hidden hazards.", "system");
            tutorState = 2;
        }
        currentConfidence = conf;

        // Dynamic Quest Validation
        if (currentMissionIdx < MISSIONS.length) {
            const m = MISSIONS[currentMissionIdx];
            const oldPct = m.progress.filter(x=>x).length;
            m.validate(state, conf);
            const newPct = m.progress.filter(x=>x).length;
            if (oldPct !== newPct) {
                renderMission();
            }
        }
    });

    // 4. Start / Stop / Reset
    const belt = document.querySelector('.belt-bar');
    const btnStart = document.getElementById('btn-start');
    const btnStop = document.getElementById('btn-stop');

    function setBeltRunning(running) {
        if (belt) {
            belt.style.background = running ? 'var(--safe)' : 'var(--border)';
            belt.style.opacity = running ? '0.7' : '1';
        }
        btnStart.disabled = running;
        btnStop.disabled = !running;
        btnStart.style.opacity = running ? '0.5' : '1';
        btnStop.style.opacity = running ? '1' : '0.5';
    }

    btnStart.addEventListener('click', () => {
        fetch('/api/sim/start', {method:'POST'});
        setBeltRunning(true);
        addMsg("> Conveyor started", "action");
    });
    btnStop.addEventListener('click', () => {
        fetch('/api/sim/stop', {method:'POST'});
        setBeltRunning(false);
        addMsg("> Conveyor stopped", "action");
    });
    document.getElementById('btn-reset').addEventListener('click', () => {
        fetch('/api/sim/reset', {method:'POST'});
        setBeltRunning(false);
        document.getElementById('tutor-dialogue').innerHTML = `
            <div style="color:var(--accent)">"Welcome to the SMART-SEG Sensor Lab."</div>
            <div style="color:var(--accent)">"All 5 sensors are active. AI Confidence is typically &gt;95%."</div>
            <div style="color:var(--accent)">"Click any sensor to disable it and see the effect."</div>
        `;
        tutorState = 0;
        Object.keys(sensors).forEach(k => sensors[k] = (k !== 'chk-dust'));
        document.getElementById('chk-dust').checked = false;
        syncBoxes();
        emitConfig();
    });

    setBeltRunning(true);

    // 5. Line controls
    document.getElementById('speed-slider').addEventListener('input', (e) => {
        socket.emit('update_config', {speed: parseFloat(e.target.value)});
    });
    document.getElementById('spawn-rate-slider').addEventListener('input', (e) => {
        socket.emit('update_config', {spawn_rate: parseInt(e.target.value)});
    });
    const bwSlider = document.getElementById('belt-width-slider');
    if (bwSlider) bwSlider.addEventListener('input', (e) => {
        socket.emit('update_config', {belt_width: parseFloat(e.target.value)});
    });
    const noiseSlider = document.getElementById('noise-slider');
    if (noiseSlider) noiseSlider.addEventListener('input', (e) => {
        socket.emit('update_config', {noise_scale: parseFloat(e.target.value)});
    });

    // 6. Sensor toggles — clickable blocks
    const sensorMap = [
        { key: 'chk-vision', box: 'svg-3d' },
        { key: 'chk-nir',    box: 'svg-nir' },
        { key: 'chk-ind',    box: 'svg-ind' },
        { key: 'chk-load',   box: 'svg-load' },
        { key: 'chk-cap',    box: 'svg-cap' },
    ];

    function syncBoxes() {
        sensorMap.forEach(s => {
            const on = sensors[s.key];
            const box = document.getElementById(s.box);
            if (box) {
                box.classList.toggle('active', on);
                box.classList.toggle('off', !on);
            }
        });
    }

    sensorMap.forEach(s => {
        const box = document.getElementById(s.box);
        if (box) {
            box.addEventListener('click', () => {
                sensors[s.key] = !sensors[s.key];
                onToggle(s.key);
            });
        }
    });

    const chkDust = document.getElementById('chk-dust');
    if(chkDust) {
        chkDust.addEventListener('change', () => {
            sensors['chk-dust'] = chkDust.checked;
            onToggle('chk-dust');
        });
    }

    function onToggle(id) {
        const on = sensors[id];
        if (id === 'chk-load' && !on && tutorState === 0) {
            addMsg("> Load Cell disabled", "action");
            addMsg("What do you think will happen to accuracy on hidden hazards (stones inside plastic bags)?", "system");
            tutorState = 1;
        } else if (id === 'chk-nir' && !on) {
            addMsg("> NIR Spectrometer disabled", "action");
            addMsg("Without polymer signatures the AI can't tell plastic from wood.", "system");
        } else if (id === 'chk-vision' && !on) {
            addMsg("> 3D Depth Vision disabled", "action");
            addMsg("Volume estimation is now blind — density calculations will be wildly wrong.", "system");
        } else if (id === 'chk-ind' && !on) {
            addMsg("> Inductive Sensor disabled", "action");
            addMsg("Sensor is short-circuited — reports METAL for everything. False positives will spike.", "system");
        } else if (id === 'chk-cap' && !on) {
            addMsg("> Capacitive Sensor disabled", "action");
            addMsg("Dielectric readings stuck high. Moisture detection is unreliable.", "system");
        } else if (id === 'chk-dust' && on) {
            addMsg("> Dust Fault injected", "action");
            addMsg("NIR lens covered in dust. Spectral peaks flattened — polymer ID is lost.", "system");
        }
        syncBoxes();
        emitConfig();
    }

    function emitConfig() {
        socket.emit('update_config', {
            sim_lab: {
                vision:    sensors['chk-vision'],
                nir:       sensors['chk-nir'],
                load_cell: sensors['chk-load'],
                inductive: sensors['chk-ind'],
                capacitive:sensors['chk-cap'],
                dust_fault:sensors['chk-dust']
            }
        });
    }

    syncBoxes();

    // 7. Tutor chat
    document.getElementById('btn-tutor-send').addEventListener('click', sendChat);
    const tutorInput = document.getElementById('tutor-input');
    if(tutorInput) tutorInput.addEventListener('keypress', (e) => { if (e.key === 'Enter') sendChat(); });

    function sendChat() {
        const input = document.getElementById('tutor-input');
        const val = input.value.trim();
        if (!val) return;
        addMsg(val, "user");
        input.value = "";
        setTimeout(() => {
            if (tutorState === 1) addMsg("Good thinking! Click Start to run the simulation and test it.", "system");
            else addMsg("Keep experimenting — try disabling multiple sensors at once.", "system");
        }, 400);
    }

    function addMsg(msg, type) {
        const d = document.getElementById('tutor-dialogue');
        const el = document.createElement('div');
        el.style.marginBottom = "6px";
        el.style.lineHeight = "1.5";
        if (type === "system")      { el.textContent = '"' + msg + '"'; el.style.color = "var(--accent)"; }
        else if (type === "user")   { el.textContent = "[You]: " + msg; el.style.color = "var(--fg)"; }
        else                        { el.textContent = msg; el.style.color = "var(--muted)"; el.style.fontStyle = "italic"; }
        d.appendChild(el);
        d.scrollTop = d.scrollHeight;
    }
});
