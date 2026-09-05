/**
 * SMART-SEG UI System
 * ====================
 * Shared frontend runtime for every page: animated numeric transitions,
 * sparklines, the toast/alert stack, and global connection-state handling.
 *
 * Design constraints:
 *   - No framework, no build step — attaches to window.SmartSegUI.
 *   - All animation is transform/opacity or canvas redraws batched through a
 *     single requestAnimationFrame loop, so it coexists with the 30 Hz
 *     simulation canvas and the Three.js scene without fighting for frames.
 *   - Everything degrades: if an element is missing, calls are no-ops.
 */
(function () {
    'use strict';

    // ─── Animated numbers (spec §9) ─────────────────────────────────────
    // One rAF loop drives every active tween; finished tweens are pruned.

    const tweens = new Map();   // id -> {from,to,start,dur,fmt,el}
    let rafId = null;

    function tick(now) {
        let live = false;
        tweens.forEach((t, id) => {
            const p = Math.min(1, (now - t.start) / t.dur);
            const eased = 1 - Math.pow(1 - p, 3);          // ease-out cubic
            const val = t.from + (t.to - t.from) * eased;
            t.el.textContent = t.fmt(val);
            if (p >= 1) tweens.delete(id); else live = true;
        });
        rafId = live ? requestAnimationFrame(tick) : null;
    }

    /**
     * Animate an element's numeric text toward `target`.
     * Non-numeric targets are set immediately (labels like "~120" pass through).
     */
    function animateNumber(el, target, opts) {
        if (!el) return;
        opts = opts || {};
        const str = String(target);
        const num = parseFloat(str.replace(/[^0-9.eE+-]/g, ''));
        if (!isFinite(num)) { el.textContent = str; return; }

        const decimals = opts.decimals !== undefined ? opts.decimals
            : (str.includes('.') ? (str.split('.')[1] || '').length : 0);
        const prefix = str.match(/^[^0-9.-]*/)[0];
        const suffix = str.replace(/^[^0-9.-]*-?[0-9.,eE+]*/, '');

        const current = parseFloat((el.textContent || '0').replace(/[^0-9.eE+-]/g, ''));
        const from = isFinite(current) ? current : 0;
        if (from === num) { el.textContent = str; return; }

        // Importance-scaled duration: bigger relative jumps take a bit longer.
        const dur = opts.duration ||
            Math.max(300, Math.min(700, 300 + Math.abs(num - from) * 8));

        el.classList.remove('ticking');
        void el.offsetWidth;                 // restart the colour-tick animation
        el.classList.add('ticking');

        const id = el.id || (el.dataset._twid || (el.dataset._twid = 'tw' + Math.random()));
        tweens.set(id, {
            from, to: num, start: performance.now(), dur, el,
            fmt: v => prefix + v.toFixed(decimals) + suffix,
        });
        if (rafId === null) rafId = requestAnimationFrame(tick);
    }

    // ─── Sparklines (spec §8, §10) ──────────────────────────────────────
    // Tiny canvas telemetry traces. Each keeps a bounded ring of samples and
    // redraws only when pushed to — no free-running loops.

    function Sparkline(canvas, opts) {
        this.canvas = typeof canvas === 'string' ? document.getElementById(canvas) : canvas;
        opts = opts || {};
        this.max = opts.samples || 40;
        this.color = opts.color || getComputedStyle(document.documentElement)
                                       .getPropertyValue('--accent').trim() || '#2E5FE8';
        this.fill = opts.fill !== false;
        this.data = [];
        this._sized = false;
    }

    Sparkline.prototype.push = function (v) {
        if (!this.canvas || typeof v !== 'number' || !isFinite(v)) return;
        this.data.push(v);
        if (this.data.length > this.max) this.data.shift();
        this.draw();
    };

    Sparkline.prototype._resize = function () {
        const r = this.canvas.getBoundingClientRect();
        if (r.width === 0) return false;
        const dpr = window.devicePixelRatio || 1;
        this.canvas.width = r.width * dpr;
        this.canvas.height = r.height * dpr;
        this._sized = true;
        return true;
    };

    Sparkline.prototype.draw = function () {
        if (!this.canvas) return;
        if (!this._sized && !this._resize()) return;
        const ctx = this.canvas.getContext('2d');
        const W = this.canvas.width, H = this.canvas.height;
        ctx.clearRect(0, 0, W, H);
        const d = this.data;
        if (d.length < 2) return;

        let lo = Math.min.apply(null, d), hi = Math.max.apply(null, d);
        if (hi - lo < 1e-9) { hi = lo + 1; lo -= 1; }
        const pad = H * 0.12;
        const x = i => (i / (this.max - 1)) * W;
        const y = v => H - pad - ((v - lo) / (hi - lo)) * (H - pad * 2);
        const off = this.max - d.length;

        ctx.lineWidth = Math.max(1.4, H / 18);
        ctx.lineJoin = 'round';
        ctx.strokeStyle = this.color;
        ctx.beginPath();
        d.forEach((v, i) => { const px = x(off + i), py = y(v); i ? ctx.lineTo(px, py) : ctx.moveTo(px, py); });
        ctx.stroke();

        if (this.fill) {
            ctx.lineTo(x(this.max - 1), H); ctx.lineTo(x(off), H); ctx.closePath();
            ctx.globalAlpha = 0.10; ctx.fillStyle = this.color; ctx.fill(); ctx.globalAlpha = 1;
        }
    };

    // ─── Toast / alert stack (spec §24) ─────────────────────────────────

    let stack = null;
    function ensureStack() {
        if (!stack) {
            stack = document.createElement('div');
            stack.className = 'toast-stack';
            stack.setAttribute('role', 'status');
            stack.setAttribute('aria-live', 'polite');
            document.body.appendChild(stack);
        }
        return stack;
    }

    /** severity: 'info' | 'warn' | 'hazard' | 'critical' */
    function toast(title, body, severity, ms) {
        const host = ensureStack();
        // Coalesce identical repeats so a hazard storm doesn't stack 30 toasts.
        const dup = host.querySelector('.toast[data-t="' + CSS.escape(title) + '"]');
        if (dup) { dup.remove(); }

        const el = document.createElement('div');
        el.className = 'toast ' + (severity || 'info');
        el.dataset.t = title;
        el.innerHTML = '<div class="toast-bar"></div><div style="min-width:0">' +
            '<div class="toast-title"></div><div class="toast-body"></div></div>';
        el.querySelector('.toast-title').textContent = title;
        el.querySelector('.toast-body').textContent = body || '';
        host.appendChild(el);
        while (host.children.length > 4) host.firstChild.remove();

        setTimeout(() => {
            el.classList.add('leaving');
            el.addEventListener('animationend', () => el.remove(), { once: true });
        }, ms || (severity === 'hazard' || severity === 'critical' ? 6000 : 3800));
    }

    // ─── Connection state (spec §28) ────────────────────────────────────
    // Pages call markConnected/markDisconnected from their socket handlers.
    // The <html> class lets CSS grey out live surfaces globally.

    let lastUpdate = null;
    let wasDown = false;

    function markConnected() {
        document.documentElement.classList.remove('sys-offline');
        const b = document.getElementById('conn-lost-banner');
        if (wasDown) {
            wasDown = false;
            if (b) {
                b.classList.add('restored');
                b.innerHTML = '<span class="dot" style="color:var(--safe)"></span>' +
                              '<strong>SYSTEM CONNECTION RESTORED</strong>';
                setTimeout(() => { b.classList.remove('active', 'restored'); }, 3200);
            }
            toast('Connection restored', 'Live telemetry resumed.', 'info');
        } else if (b) {
            b.classList.remove('active', 'restored');
        }
    }

    function markDisconnected() {
        document.documentElement.classList.add('sys-offline');
        wasDown = true;
        const b = document.getElementById('conn-lost-banner');
        if (b) {
            b.classList.remove('restored');
            b.innerHTML = '<span class="dot" style="color:var(--warn)"></span>' +
                '<div><strong>SYSTEM CONNECTION LOST</strong>' +
                '<div class="t-meta">Waiting for sensor gateway…' +
                (lastUpdate ? ' Last update: ' + lastUpdate : '') + '</div></div>';
            b.classList.add('active');
        }
    }

    function touch() {
        lastUpdate = new Date().toLocaleTimeString('en-IN', { hour12: false });
    }

    // ─── Drive command feedback (spec §20) ──────────────────────────────

    /**
     * Wrap a control action with transitional button feedback:
     *   STOP → "STOPPING DRIVE…" → resolves → "DRIVE STOPPED" toast.
     */
    function driveCommand(btn, busyLabel, doneTitle, action, opts) {
        if (!btn || btn.classList.contains('is-busy')) return Promise.resolve();
        opts = opts || {};
        if (opts.confirm && !window.confirm(opts.confirm)) return Promise.resolve();
        const original = btn.textContent;
        btn.classList.add('is-busy');
        btn.textContent = busyLabel;
        return Promise.resolve()
            .then(action)
            .then(() => { toast(doneTitle, '', opts.severity || 'info'); })
            .catch(e => { toast('Command failed', String(e), 'warn'); })
            .finally(() => {
                setTimeout(() => {
                    btn.classList.remove('is-busy');
                    btn.textContent = original;
                }, 450);
            });
    }

    // ─── Exports ────────────────────────────────────────────────────────

    window.SmartSegUI = {
        animateNumber, Sparkline, toast,
        markConnected, markDisconnected, touch, driveCommand,
    };
})();
