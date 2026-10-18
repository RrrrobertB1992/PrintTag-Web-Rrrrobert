// One color picker for all colors: a row of color buttons picks which color
// the picker edits, and "+" adds the next color. The original color fields
// stay in the page (only one is shown at a time), so reading, writing and
// saving tags keep working through them unchanged.
//
// Works with both color layouts:
//  - one "Additional Colors" checkbox for colors 2-4 (white = unused)
//  - a checkbox per extra color (colorEnable2..N)

const ColorSlots = {
    active: 1,       // color the picker is editing
    count: 1,        // colors in use (single-checkbox layout only)
    root: null,
    actions: null,
    busy: false,     // ignore our own calls into app while changing colors

    perColor() { return !!document.getElementById('colorEnable2'); },

    group(i) {
        if (i === 1) {
            const el = document.getElementById('colorHex1');
            return el && el.closest('.form-group');
        }
        return document.querySelector(`.form-group[data-field="colorHex${i}"]`);
    },

    // Colors the current format can hold
    max() {
        let n = 1;
        while (document.getElementById(`colorHex${n + 1}`)) {
            const g = this.group(n + 1);
            if (!g || g.classList.contains('hidden')) break;
            n++;
        }
        return n;
    },

    // Colors in use
    used() {
        if (this.perColor()) {
            let n = 1;
            while (document.getElementById(`colorEnable${n + 1}`) && document.getElementById(`colorEnable${n + 1}`).checked) n++;
            return n;
        }
        return this.count;
    },

    // Single-checkbox layout: colors in use, from the values (white = unused)
    countFromValues() {
        const box = document.getElementById('showAdditionalColors');
        if (!box || !box.checked) return 1;
        let n = 1;
        for (let i = 2; document.getElementById(`colorHex${i}`); i++) {
            const v = document.getElementById(`colorHex${i}`).value.replace('#', '').toUpperCase();
            if (/^[0-9A-F]{6}$/.test(v) && v !== 'FFFFFF') n = i;
        }
        return n;
    },

    hex(i) {
        const v = (document.getElementById(`colorHex${i}`).value || '').replace('#', '').toUpperCase();
        return /^[0-9A-F]{6}$/.test(v) ? v : 'FFFFFF';
    },

    setHex(i, v) {
        document.getElementById(`colorHex${i}`).value = v;
        app.updateColor('#' + v, i);
    },

    setAdditional(on) {
        const box = document.getElementById('showAdditionalColors');
        if (!box) return;
        box.checked = on;
        app.toggleAdditionalColors(on);
    },

    select(i) {
        this.active = i;
        this.render();
    },

    add() {
        const n = this.used() + 1;
        if (n > this.max()) return;
        this.busy = true;
        this.setHex(n, 'FFFFFF');
        if (this.perColor()) {
            app.setColorEnabled(n, true);
        } else {
            this.count = n;
            this.setAdditional(true);
        }
        this.busy = false;
        this.active = n;
        app.updateRecordSize();
        this.render();
    },

    // Remove color k; later colors move down one
    remove(k) {
        const n = this.used();
        if (k < 2 || k > n) return;
        this.busy = true;
        for (let j = k; j < n; j++) this.setHex(j, this.hex(j + 1));
        this.setHex(n, 'FFFFFF');
        if (this.perColor()) {
            app.setColorEnabled(n, false);
        } else {
            this.count = n - 1;
            if (this.count === 1) this.setAdditional(false);
        }
        this.busy = false;
        this.active = Math.min(k, n - 1);
        app.updateRecordSize();
        this.render();
    },

    // Update just the button colors (called while dragging the picker)
    paint() {
        if (!this.root) return;
        this.root.querySelectorAll('.cs-slot[data-index]').forEach(el => {
            el.querySelector('.cs-sw').style.background = '#' + this.hex(+el.dataset.index);
        });
    },

    render() {
        if (!this.root) return;
        const max = this.max();
        const on = max > 1;
        document.body.classList.toggle('cs-on', on);
        this.root.classList.toggle('cs-hidden', !on);
        const n = Math.min(this.used(), max);
        if (this.active > n) this.active = n;

        // Show only the color being edited
        for (let i = 1; document.getElementById(`colorHex${i}`); i++) {
            const g = this.group(i);
            if (!g) continue;
            g.classList.add('cs-group');
            g.classList.toggle('cs-hidden', on && i !== this.active);
        }

        const grid = this.root.querySelector('.cs-grid');
        grid.innerHTML = '';
        for (let i = 1; i <= n; i++) {
            const b = document.createElement('div');
            b.className = 'material-swatch cs-slot' + (i === this.active ? ' cs-active' : '');
            b.dataset.index = i;
            b.setAttribute('role', 'button');
            b.setAttribute('aria-label', `Color ${i}`);
            b.innerHTML = '<span class="cs-sw"></span><span class="cs-num"></span>';
            b.querySelector('.cs-num').textContent = i;
            b.addEventListener('click', () => this.select(i));
            grid.appendChild(b);
        }
        if (n < max) {
            const plus = document.createElement('div');
            plus.className = 'material-swatch cs-slot cs-add';
            plus.setAttribute('role', 'button');
            plus.setAttribute('aria-label', `Add color ${n + 1}`);
            plus.textContent = '+';
            plus.addEventListener('click', () => this.add());
            grid.appendChild(plus);
        }
        this.paint();

        const editing = this.root.querySelector('.cs-editing span');
        editing.textContent = this.active === 1 ? 'Color 1 (Primary)' : `Color ${this.active}`;

        // Remove button under the picker for colors 2+
        const g = this.group(this.active);
        if (on && this.active > 1 && g) {
            g.insertAdjacentElement('afterend', this.actions);
            const btn = this.actions.querySelector('button');
            btn.textContent = `🗑 Remove Color ${this.active}`;
            this.actions.classList.remove('cs-hidden');
        } else {
            this.actions.classList.add('cs-hidden');
        }
        this.followSavedColors();

        // Canvases that were hidden need resizing to their real width
        requestAnimationFrame(() => window.dispatchEvent(new Event('resize')));
    },

    // When a saved color hides the pickers, hide the buttons too
    followSavedColors() {
        const g1 = this.group(1);
        const hidden = !!(g1 && g1.classList.contains('saved-color-hidden'));
        this.root.classList.toggle('cs-saved-hidden', hidden);
        this.actions.classList.toggle('cs-saved-hidden', hidden);
    },

    wrap(name, after) {
        const original = app[name];
        if (typeof original !== 'function') return;
        app[name] = function (...args) {
            const result = original.apply(this, args);
            after(args);
            return result;
        };
    },

    init() {
        const g1 = this.group(1);
        if (!g1) return;

        const style = document.createElement('style');
        style.textContent = `
            .cs-hidden, .cs-saved-hidden { display: none !important; }
            body.cs-on .cs-group > label { display: none !important; }
            body.cs-on .cs-group { margin-bottom: 0.5rem; }
            body.cs-on #showAdditionalColors { display: none; }
            body.cs-on .cs-extra-hint { display: none !important; }
            #colorSlots .cs-grid { margin-bottom: 0.5rem; }
            #colorSlots .cs-slot { flex-direction: column; align-items: stretch; justify-content: flex-end; gap: 0.2rem; padding: 0.3rem; min-height: 58px; font-weight: 700; }
            #colorSlots .cs-sw { flex: 1; min-height: 26px; border-radius: 3px; border: 1px solid rgba(255, 255, 255, 0.25); }
            #colorSlots .cs-num { text-align: center; line-height: 1; font-size: 0.8rem; }
            #colorSlots .cs-slot.cs-active { border-color: var(--accent); box-shadow: 0 0 0 2px rgba(255, 107, 53, 0.35); }
            #colorSlots .cs-slot.cs-active .cs-num { color: var(--accent); }
            #colorSlots .cs-add { justify-content: center; align-items: center; border-style: dashed; font-size: 1.4rem; font-weight: 400; color: var(--text-secondary); }
            #colorSlots .cs-editing { font-size: 0.85rem; font-weight: 600; margin-bottom: 0; }
            #colorSlots .cs-editing span { color: var(--accent); }
            #colorSlotsActions button { width: auto; margin: 0 0 1rem; padding: 0.3rem 0.6rem; font-size: 0.8rem; }
        `;
        document.head.appendChild(style);

        this.root = document.createElement('div');
        this.root.id = 'colorSlots';
        this.root.className = 'form-group';
        this.root.innerHTML = '<label>Colors</label><div class="material-palette cs-grid"></div><div class="cs-editing">Editing <span></span></div>';
        this.actions = document.createElement('div');
        this.actions.id = 'colorSlotsActions';
        this.actions.innerHTML = '<button type="button" class="btn-secondary"></button>';
        this.actions.querySelector('button').addEventListener('click', () => this.remove(this.active));

        // Single-checkbox layout keeps colors 2+ in the Advanced section:
        // move them up next to Color 1 so they share its place
        let last = g1;
        for (let i = 2; document.getElementById(`colorHex${i}`); i++) {
            const g = this.group(i);
            if (!g) break;
            if (g.previousElementSibling !== last) last.insertAdjacentElement('afterend', g);
            last = g;
        }
        // Hide the old ways of turning extra colors on
        const box = document.getElementById('showAdditionalColors');
        if (box) box.closest('.form-group').classList.add('cs-extra-hint');
        document.querySelectorAll('small[data-field="colorHex2"]').forEach(el => el.classList.add('cs-extra-hint'));

        // Follow changes made elsewhere (loading a tag, format change, saved colors)
        this.wrap('populateForm', () => {
            this.active = 1;
            if (!this.perColor()) this.count = this.countFromValues();
            this.render();
        });
        this.wrap('updateVisibility', () => this.render());
        this.wrap('updateColorSlots', () => { if (!this.busy) this.render(); });
        this.wrap('toggleAdditionalColors', () => {
            if (this.busy) return;
            this.count = this.countFromValues();
            this.render();
        });
        this.wrap('updateColor', () => this.paint());
        new MutationObserver(() => this.followSavedColors())
            .observe(g1, { attributes: true, attributeFilter: ['class'] });

        // Placed once every script has run, so it sits just above Color 1
        // (below Saved Colors, when that's on the page)
        const place = () => {
            g1.insertAdjacentElement('beforebegin', this.root);
            if (!this.perColor()) this.count = this.countFromValues();
            this.render();
        };
        if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', place);
        else place();
    }
};

ColorSlots.init();
