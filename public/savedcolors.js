// Saved colors: remembers the colors used for each brand + material type so a
// replacement spool can reuse them. Stored per browser (localStorage).
//
// Data: { "<brand>|<type>": [ { colors: ["2B2B2D", ...], name: "", variants: ["Matte", ...] } ] }
// newest first. A color set used under another variant gains that variant
// instead of becoming a new row.

const SavedColors = {
    STORAGE_KEY: 'printtag-saved-colors',
    PAGE_SIZE: 15,

    selected: null,     // colors key (e.g. "2B2B2D,FF0000") of the selected row
    snapshot: null,     // color pickers from before a saved color was selected
    renaming: false,
    expanded: false,
    shown: 15,          // rows shown before "Show more"
    currentKey: null,   // brand|type the list is showing

    // --- Storage ---

    loadAll() {
        try {
            const all = JSON.parse(localStorage.getItem(this.STORAGE_KEY) || '{}');
            return all && typeof all === 'object' && !Array.isArray(all) ? all : {};
        } catch (e) {
            return {};
        }
    },

    storeAll(all) {
        try {
            localStorage.setItem(this.STORAGE_KEY, JSON.stringify(all));
        } catch (e) {
            // Storage unavailable (e.g. private mode); colors just aren't saved
        }
    },

    getEntries(key) {
        const list = this.loadAll()[key];
        return Array.isArray(list) ? list.filter(e => e && Array.isArray(e.colors) && e.colors.length) : [];
    },

    setEntries(key, list) {
        const all = this.loadAll();
        if (list.length) all[key] = list;
        else delete all[key];
        this.storeAll(all);
    },

    colorsId(colors) {
        return colors.join(',');
    },

    // --- Reading / applying the form ---

    formKey(formData) {
        const brand = (formData.brand || '').trim();
        const type = (formData.materialType || '').trim();
        return brand && type ? `${brand}|${type}` : null;
    },

    // Colors that would be written for this form: primary plus enabled extras
    formColors(formData) {
        const valid = hex => /^[0-9A-Fa-f]{6}$/.test(hex || '');
        const colors = [];
        if (valid(formData.colorHex)) colors.push(formData.colorHex.toUpperCase());
        else return [];
        // With per-color enable checkboxes, disabled colors come through empty
        // and white is a real color; otherwise white means "unused"
        const hasEnables = !!document.getElementById('colorEnable2');
        for (let i = 2; i <= 5; i++) {
            const hex = formData[`colorHex${i}`];
            if (!valid(hex)) continue;
            if (!hasEnables && hex.toUpperCase() === 'FFFFFF') continue;
            colors.push(hex.toUpperCase());
        }
        return colors;
    },

    formVariant(formData) {
        return (formData.extendedSubType ?? '').trim();
    },

    applyColors(colors) {
        const set = (i, hex) => {
            const input = document.getElementById(`colorHex${i}`);
            if (!input) return;
            input.value = hex;
            app.updateColor('#' + hex, i);
        };
        set(1, colors[0]);
        if (document.getElementById('colorEnable2')) {
            // Per-color enable checkboxes (multi-color layout)
            for (let i = 2; i <= 5; i++) {
                const enabled = i <= colors.length;
                if (enabled) set(i, colors[i - 1]);
                const box = document.getElementById(`colorEnable${i}`);
                if (box) box.checked = enabled;
            }
            if (typeof app.updateColorSlots === 'function') app.updateColorSlots();
        } else {
            // Single "Additional Colors" checkbox
            for (let i = 2; i <= 4; i++) set(i, colors[i - 1] || 'FFFFFF');
            const show = colors.length > 1;
            const box = document.getElementById('showAdditionalColors');
            if (box) box.checked = show;
            if (typeof app.toggleAdditionalColors === 'function') app.toggleAdditionalColors(show);
        }
    },

    // --- Saving ---

    // Save the form's colors under its brand + type, adding the current
    // variant to an existing row with the same colors
    saveFromForm(formData) {
        const key = this.formKey(formData);
        const colors = this.formColors(formData);
        if (!key || !colors.length) return false;
        const variant = this.formVariant(formData);
        const id = this.colorsId(colors);
        const entries = this.getEntries(key);
        const index = entries.findIndex(e => this.colorsId(e.colors) === id);
        const entry = index >= 0 ? entries.splice(index, 1)[0] : { colors, name: '', variants: [] };
        if (!entry.variants.includes(variant)) entry.variants.push(variant);
        if (!entry.name && formData.colorName) entry.name = formData.colorName.trim();
        entries.unshift(entry);
        this.setEntries(key, entries);
        return true;
    },

    // --- Actions ---

    // Remember the color pickers before a saved color replaces them, so
    // deselecting brings back what was there (e.g. colors picked by hand)
    takeSnapshot() {
        const value = id => { const el = document.getElementById(id); return el ? el.value : null; };
        const checked = id => { const el = document.getElementById(id); return el ? el.checked : null; };
        this.snapshot = {
            hex: [1, 2, 3, 4, 5].map(i => value(`colorHex${i}`)),
            enabled: [2, 3, 4, 5].map(i => checked(`colorEnable${i}`)),
            additional: checked('showAdditionalColors'),
            colorName: value('colorName')
        };
    },

    restoreSnapshot() {
        const snap = this.snapshot;
        this.snapshot = null;
        if (!snap) return;
        snap.hex.forEach((hex, idx) => {
            const input = document.getElementById(`colorHex${idx + 1}`);
            if (!input || hex === null) return;
            input.value = hex;
            app.updateColor('#' + hex, idx + 1);
        });
        if (document.getElementById('colorEnable2')) {
            snap.enabled.forEach((on, idx) => {
                const box = document.getElementById(`colorEnable${idx + 2}`);
                if (box && on !== null) box.checked = on;
            });
            if (typeof app.updateColorSlots === 'function') app.updateColorSlots();
        } else if (snap.additional !== null) {
            document.getElementById('showAdditionalColors').checked = snap.additional;
            if (typeof app.toggleAdditionalColors === 'function') app.toggleAdditionalColors(snap.additional);
        }
        const colorName = document.getElementById('colorName');
        if (colorName && snap.colorName !== null) colorName.value = snap.colorName;
    },

    select(entry) {
        // Keep the first snapshot when switching between saved colors
        if (!this.selected) this.takeSnapshot();
        this.selected = this.colorsId(entry.colors);
        this.renaming = false;
        this.applyColors(entry.colors);
        const colorName = document.getElementById('colorName');
        if (colorName && entry.name) colorName.value = entry.name;
        app.updateRecordSize();
        this.render();
    },

    // Deselecting puts back the colors from before the saved color was picked
    deselect() {
        this.selected = null;
        this.renaming = false;
        this.restoreSnapshot();
        app.updateRecordSize();
        this.render();
    },

    removeRow(entry) {
        const label = entry.colors.join(' + ') + (entry.name ? ` (${entry.name})` : '');
        if (!window.confirm(`Remove saved color ${label}?`)) return;
        const id = this.colorsId(entry.colors);
        this.setEntries(this.currentKey, this.getEntries(this.currentKey).filter(e => this.colorsId(e.colors) !== id));
        if (this.selected === id) this.deselect();
        else this.render();
    },

    removeVariant(entry, variant) {
        const id = this.colorsId(entry.colors);
        const entries = this.getEntries(this.currentKey);
        const target = entries.find(e => this.colorsId(e.colors) === id);
        if (!target) return;
        target.variants = target.variants.filter(v => v !== variant);
        const remaining = target.variants.length ? entries : entries.filter(e => e !== target);
        this.setEntries(this.currentKey, remaining);
        if (!target.variants.length) this.deselect();
        else this.render();
    },

    rename(entry, name) {
        const id = this.colorsId(entry.colors);
        const entries = this.getEntries(this.currentKey);
        const target = entries.find(e => this.colorsId(e.colors) === id);
        if (target) target.name = name.trim();
        this.setEntries(this.currentKey, entries);
        this.renaming = false;
        this.render();
    },

    clearKey() {
        const label = this.currentKey.replace('|', ' ');
        if (!window.confirm(`Remove all saved colors for ${label}?`)) return;
        this.setEntries(this.currentKey, []);
        this.deselect();
    },

    saveCurrent() {
        const formData = app.getFormData();
        if (this.saveFromForm(formData)) {
            this.render();
            app.showStatus('writeStatus', 'success', 'Colors saved');
        }
    },

    // --- Rendering ---

    // Color pickers are hidden while a saved color is selected
    setPickersHidden(hidden) {
        const targets = new Set();
        for (let i = 1; i <= 5; i++) {
            const input = document.getElementById(`colorHex${i}`);
            if (!input) continue;
            targets.add(input.closest('.extra-color') || input.closest('.form-group'));
        }
        const additional = document.getElementById('showAdditionalColors');
        if (additional) targets.add(additional.closest('.form-group'));
        document.querySelectorAll('small[data-field="colorHex2"]').forEach(el => targets.add(el));
        targets.forEach(el => el && el.classList.toggle('saved-color-hidden', hidden));
    },

    button(text, onClick, extraClass) {
        const b = document.createElement('button');
        b.type = 'button';
        b.className = 'btn-secondary' + (extraClass ? ' ' + extraClass : '');
        b.textContent = text;
        b.onclick = onClick;
        return b;
    },

    render() {
        const root = document.getElementById('savedColors');
        if (!root) return;
        const formData = app.getFormData();
        const key = this.formKey(formData);
        root.classList.toggle('hidden', !key);
        if (!key) {
            this.setPickersHidden(false);
            return;
        }
        const entries = this.getEntries(key);
        const variant = this.formVariant(formData);
        const selected = entries.find(e => this.colorsId(e.colors) === this.selected) || null;
        if (!selected) {
            this.selected = null;
            this.renaming = false;
        }
        this.setPickersHidden(!!selected);

        const [brand, type] = key.split('|');
        root.innerHTML = '';

        // Label row: "Saved Colors · Brand Type (n)" with a Show/Hide toggle
        const labelRow = document.createElement('div');
        labelRow.className = 'sc-labelrow';
        const label = document.createElement('label');
        label.textContent = `Saved Colors · ${brand} ${type} (${entries.length})`;
        labelRow.appendChild(label);
        if (selected && !this.expanded) {
            const picked = this.colorBar(selected.colors);
            picked.classList.add('sc-picked');
            labelRow.appendChild(picked);
        }
        if (entries.length) {
            const toggle = document.createElement('button');
            toggle.type = 'button';
            toggle.className = 'sc-toggle';
            toggle.textContent = this.expanded ? 'Hide ▴' : 'Show ▾';
            toggle.onclick = () => { this.expanded = !this.expanded; this.renaming = false; this.render(); };
            labelRow.appendChild(toggle);
        }
        root.appendChild(labelRow);

        // Tiles, styled and laid out like the palette swatches
        if (this.expanded && entries.length) {
            const grid = document.createElement('div');
            grid.className = 'material-palette sc-grid';
            entries.slice(0, this.shown).forEach(entry => {
                const isSelected = selected === entry;
                const tile = document.createElement('div');
                tile.className = 'material-swatch sc-tile' + (isSelected ? ' selected' : '');
                tile.setAttribute('role', 'button');
                tile.tabIndex = 0;
                tile.title = entry.colors.map(h => '#' + h).join(' + ') + (entry.name ? ` · ${entry.name}` : '');
                tile.appendChild(this.colorBar(entry.colors));
                const hex = document.createElement('span');
                hex.className = 'sc-hex';
                hex.textContent = entry.colors.join('\n');
                const name = document.createElement('span');
                name.className = 'sc-name';
                name.textContent = entry.name || ' ';
                const vars = document.createElement('span');
                vars.className = 'sc-vars';
                // The current variant is highlighted so matching colors are easy to spot
                entry.variants.forEach((v, idx) => {
                    if (idx) vars.appendChild(document.createTextNode(' · '));
                    const tag = document.createElement('span');
                    tag.textContent = v || 'No variant';
                    if (v === variant) tag.className = 'sc-var-current';
                    vars.appendChild(tag);
                });
                tile.append(hex, name, vars);
                // Tapping the selected tile again deselects it
                const choose = () => (isSelected ? this.deselect() : this.select(entry));
                tile.onclick = choose;
                tile.onkeydown = e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); choose(); } };
                grid.appendChild(tile);
            });
            root.appendChild(grid);
        }

        // Buttons
        const actions = document.createElement('div');
        actions.className = 'saved-actions sc-actions';
        if (selected && this.renaming) {
            const input = document.createElement('input');
            input.type = 'text';
            input.value = selected.name || '';
            input.placeholder = 'Color name';
            input.maxLength = 32;
            input.className = 'sc-rename';
            input.onkeydown = e => {
                if (e.key === 'Enter') { e.preventDefault(); this.rename(selected, input.value); }
                if (e.key === 'Escape') { e.preventDefault(); this.renaming = false; this.render(); }
            };
            actions.append(input,
                this.button('✓ Save name', () => this.rename(selected, input.value)),
                this.button('Cancel', () => { this.renaming = false; this.render(); }));
            setTimeout(() => input.focus(), 0);
        } else if (selected) {
            actions.appendChild(this.button('✏️ Rename', () => { this.renaming = true; this.render(); }));
            if (selected.variants.includes(variant)) {
                actions.appendChild(this.button(`🗑 Remove "${variant || 'No variant'}"`, () => this.removeVariant(selected, variant)));
            }
            actions.appendChild(this.button('🗑 Remove color', () => this.removeRow(selected)));
        } else {
            actions.appendChild(this.button('💾 Save current colors', () => this.saveCurrent()));
        }
        if (this.expanded && entries.length > this.shown) {
            const left = entries.length - this.shown;
            actions.appendChild(this.button(`Show ${Math.min(this.PAGE_SIZE, left)} more (${left} left)`,
                () => { this.shown += this.PAGE_SIZE; this.render(); }, 'sc-more'));
        }
        if (this.expanded && entries.length && !selected) {
            actions.appendChild(this.button(`🗑 Clear ${brand} ${type}`, () => this.clearKey(), 'sc-clear'));
        }
        root.appendChild(actions);
    },

    // Color bar: one block per color
    colorBar(colors) {
        const bar = document.createElement('span');
        bar.className = 'sc-bar';
        colors.forEach(hex => {
            const part = document.createElement('span');
            part.style.background = '#' + hex;
            bar.appendChild(part);
        });
        return bar;
    },

    // Re-render when brand/type changes (and reset paging/selection)
    refresh() {
        const key = this.formKey(app.getFormData());
        if (key !== this.currentKey) {
            this.currentKey = key;
            this.selected = null;
            this.snapshot = null;
            this.renaming = false;
            this.shown = this.PAGE_SIZE;
        }
        this.render();
    },

    init() {
        const color1 = document.getElementById('colorHex1');
        const group = color1 && color1.closest('.form-group');
        if (!group) return;

        const style = document.createElement('style');
        style.textContent = `
            .saved-color-hidden { display: none !important; }
            #savedColors .sc-labelrow { display: flex; align-items: center; gap: 0.5rem; margin-bottom: 0.5rem; }
            #savedColors .sc-labelrow label { flex: 1; margin: 0; }
            #savedColors .sc-toggle { width: auto; margin: 0; padding: 0; background: none; border: none; color: var(--accent); font-size: 0.85rem; font-weight: 600; cursor: pointer; }
            #savedColors .sc-tile { flex-direction: column; align-items: stretch; gap: 0.2rem; padding: 0.4rem; text-align: center; white-space: normal; overflow: visible; }
            #savedColors .sc-bar { display: flex; height: 22px; border-radius: 3px; overflow: hidden; border: 1px solid rgba(255, 255, 255, 0.25); }
            #savedColors .sc-bar span { flex: 1; }
            #savedColors .sc-picked { width: 40px; height: 18px; flex: none; }
            #savedColors .sc-hex { font-family: monospace; font-size: 0.78rem; white-space: pre-line; line-height: 1.2; }
            #savedColors .sc-name { font-size: 0.72rem; font-weight: 500; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; opacity: 0.85; }
            #savedColors .sc-vars { font-size: 0.65rem; font-weight: 500; opacity: 0.7; white-space: normal; line-height: 1.25; }
            #savedColors .sc-tile.selected .sc-name, #savedColors .sc-tile.selected .sc-vars { opacity: 1; }
            #savedColors .sc-var-current { color: var(--accent); font-weight: 700; }
            #savedColors .sc-tile:has(.sc-var-current) .sc-vars { opacity: 1; }
            #savedColors .sc-tile.selected .sc-var-current { color: #fff; text-decoration: underline; }
            #savedColors .sc-actions { display: flex; flex-wrap: wrap; gap: 0.35rem; margin-top: 0.35rem; }
            #savedColors .sc-actions button { width: auto; margin: 0; padding: 0.3rem 0.6rem; font-size: 0.8rem; }
            #savedColors .sc-rename { flex: 1 1 100%; padding: 0.5rem; }
        `;
        document.head.appendChild(style);

        const root = document.createElement('div');
        root.id = 'savedColors';
        root.className = 'form-group';
        group.insertAdjacentElement('beforebegin', root);

        // Follow form changes (brand/type/variant/format) without changing app.js
        const updateRecordSize = app.updateRecordSize;
        app.updateRecordSize = function (...args) {
            const result = updateRecordSize.apply(this, args);
            SavedColors.refresh();
            return result;
        };
        // Loading a tag or starting a new one clears the selection
        const populateForm = app.populateForm;
        app.populateForm = function (...args) {
            SavedColors.selected = null;
            SavedColors.snapshot = null;
            const result = populateForm.apply(this, args);
            SavedColors.refresh();
            return result;
        };
        // Save colors automatically after a successful write
        const handleWriteProgress = app.handleWriteProgress;
        app.handleWriteProgress = function (...args) {
            const callback = handleWriteProgress.apply(this, args);
            return (status, error) => {
                callback(status, error);
                if (status === 'success' && SavedColors.saveFromForm(app.getFormData())) SavedColors.render();
            };
        };

        this.refresh();
    }
};

SavedColors.init();
