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

    select(entry) {
        this.selected = this.colorsId(entry.colors);
        this.renaming = false;
        this.applyColors(entry.colors);
        const colorName = document.getElementById('colorName');
        if (colorName && entry.name) colorName.value = entry.name;
        app.updateRecordSize();
        this.render();
    },

    deselect() {
        this.selected = null;
        this.renaming = false;
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

    swatch(colors) {
        const sw = document.createElement('span');
        sw.className = 'sc-swatch' + (colors.length > 1 ? ' multi' : '');
        colors.forEach(hex => {
            const part = document.createElement('span');
            part.style.background = '#' + hex;
            sw.appendChild(part);
        });
        return sw;
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

        // Header (tap to expand/collapse)
        const header = document.createElement('div');
        header.className = 'sc-header' + (this.expanded ? '' : ' collapsed');
        header.setAttribute('role', 'button');
        header.tabIndex = 0;
        const icon = document.createElement('span');
        icon.className = 'sc-icon';
        icon.textContent = '▼';
        const title = document.createElement('span');
        title.className = 'sc-title';
        title.innerHTML = '<strong>Saved colors</strong> ';
        const sub = document.createElement('span');
        sub.className = 'sc-sub';
        sub.textContent = `${brand} ${type} · ${entries.length}`;
        title.appendChild(sub);
        header.append(icon, title);
        if (selected) {
            const picked = document.createElement('span');
            picked.className = 'sc-picked';
            picked.appendChild(this.swatch(selected.colors));
            header.appendChild(picked);
        }
        const toggle = () => { this.expanded = !this.expanded; this.render(); };
        header.onclick = toggle;
        header.onkeydown = e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggle(); } };
        root.appendChild(header);

        // Rows
        if (this.expanded) {
            const list = document.createElement('div');
            list.className = 'sc-list';
            if (!entries.length) {
                const empty = document.createElement('div');
                empty.className = 'sc-empty';
                empty.textContent = 'No saved colors yet. Colors are saved when you write a tag, or with Save current colors.';
                list.appendChild(empty);
            }
            entries.slice(0, this.shown).forEach(entry => {
                const isSelected = selected === entry;
                const row = document.createElement('div');
                row.className = 'sc-row' + (isSelected ? ' selected' : '');
                row.appendChild(this.swatch(entry.colors));
                const hexes = document.createElement('span');
                hexes.className = 'sc-hexes';
                entry.colors.forEach(hex => {
                    const h = document.createElement('span');
                    h.textContent = hex;
                    hexes.appendChild(h);
                });
                row.appendChild(hexes);

                if (isSelected && this.renaming) {
                    const box = document.createElement('span');
                    box.className = 'sc-rename';
                    const input = document.createElement('input');
                    input.type = 'text';
                    input.value = entry.name || '';
                    input.placeholder = 'Color name';
                    input.maxLength = 32;
                    input.onkeydown = e => {
                        if (e.key === 'Enter') { e.preventDefault(); this.rename(entry, input.value); }
                        if (e.key === 'Escape') { e.preventDefault(); this.renaming = false; this.render(); }
                    };
                    input.onclick = e => e.stopPropagation();
                    box.append(input,
                        this.button('✓', e => { e.stopPropagation(); this.rename(entry, input.value); }),
                        this.button('✕', e => { e.stopPropagation(); this.renaming = false; this.render(); }));
                    row.appendChild(box);
                    setTimeout(() => input.focus(), 0);
                } else {
                    const name = document.createElement('span');
                    name.className = 'sc-name';
                    name.textContent = entry.name || '';
                    const vars = document.createElement('span');
                    vars.className = 'sc-vars';
                    entry.variants.forEach(v => {
                        const tag = document.createElement('span');
                        tag.className = 'sc-var' + (v === variant ? ' current' : '');
                        tag.textContent = v || '—';
                        tag.title = v ? `Saved as ${v}` : 'Saved with no variant';
                        vars.appendChild(tag);
                    });
                    const del = document.createElement('button');
                    del.type = 'button';
                    del.className = 'sc-delete';
                    del.textContent = '✕';
                    del.title = 'Remove this saved color';
                    del.onclick = e => { e.stopPropagation(); this.removeRow(entry); };
                    row.append(name, vars, del);
                    // Tapping the selected row again deselects it
                    row.onclick = () => (isSelected ? this.deselect() : this.select(entry));
                }
                list.appendChild(row);
            });
            if (entries.length > this.shown) {
                const more = this.button(`Show ${Math.min(this.PAGE_SIZE, entries.length - this.shown)} more (${entries.length - this.shown} left)`,
                    () => { this.shown += this.PAGE_SIZE; this.render(); }, 'sc-more');
                list.appendChild(more);
            }
            if (entries.length) {
                const clear = this.button(`Clear saved colors for ${brand} ${type}`, () => this.clearKey(), 'sc-clear');
                list.appendChild(clear);
            }
            root.appendChild(list);
        }

        // Actions (shown even when collapsed)
        const actions = document.createElement('div');
        actions.className = 'sc-actions';
        if (selected) {
            actions.appendChild(this.button('✏️ Rename', () => { this.expanded = true; this.renaming = true; this.render(); }));
            if (selected.variants.includes(variant)) {
                actions.appendChild(this.button(`🗑 Remove "${variant || 'no variant'}"`, () => this.removeVariant(selected, variant)));
            }
        } else {
            actions.appendChild(this.button('💾 Save current colors', () => this.saveCurrent()));
        }
        root.appendChild(actions);
    },

    // Re-render when brand/type changes (and reset paging/selection)
    refresh() {
        const key = this.formKey(app.getFormData());
        if (key !== this.currentKey) {
            this.currentKey = key;
            this.selected = null;
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
            #savedColors { margin-bottom: 1.25rem; }
            #savedColors .sc-header { display: flex; align-items: center; gap: 0.5rem; padding: 0.6rem 0.75rem; background: var(--bg-tertiary); border-radius: 4px; cursor: pointer; user-select: none; }
            #savedColors .sc-icon { transition: transform 0.2s; font-size: 0.75rem; }
            #savedColors .sc-header.collapsed .sc-icon { transform: rotate(-90deg); }
            #savedColors .sc-title { flex: 1; min-width: 0; font-size: 0.9rem; }
            #savedColors .sc-sub { color: var(--text-secondary); font-size: 0.8rem; }
            #savedColors .sc-list { border: 1px solid var(--border); border-top: none; border-radius: 0 0 4px 4px; }
            #savedColors .sc-row { display: flex; align-items: center; gap: 0.55rem; padding: 0.5rem 0.7rem; border-top: 1px solid var(--border); cursor: pointer; }
            #savedColors .sc-row:first-child { border-top: none; }
            #savedColors .sc-row.selected { background: rgba(255, 107, 53, 0.15); box-shadow: inset 3px 0 0 var(--accent); }
            #savedColors .sc-swatch { display: flex; border-radius: 4px; overflow: hidden; border: 1px solid #666; flex-shrink: 0; }
            #savedColors .sc-swatch span { width: 34px; height: 26px; display: block; }
            #savedColors .sc-swatch.multi span { width: 17px; }
            #savedColors .sc-picked .sc-swatch span { width: 22px; height: 18px; }
            #savedColors .sc-picked .sc-swatch.multi span { width: 11px; }
            #savedColors .sc-hexes { display: flex; flex-direction: column; font-family: monospace; font-size: 0.9rem; line-height: 1.25; }
            #savedColors .sc-name { flex: 1; min-width: 0; color: var(--text-secondary); font-size: 0.8rem; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
            #savedColors .sc-vars { display: flex; flex-wrap: wrap; gap: 0.2rem; justify-content: flex-end; max-width: 120px; }
            #savedColors .sc-var { font-size: 0.68rem; font-weight: 600; padding: 0.08rem 0.35rem; border-radius: 3px; background: var(--bg-tertiary); border: 1px solid var(--border); color: var(--text-secondary); }
            #savedColors .sc-var.current { border-color: var(--accent); color: var(--text-primary); }
            #savedColors .sc-delete { width: auto; margin: 0; padding: 0.2rem 0.4rem; background: none; border: none; color: var(--text-secondary); font-size: 1rem; cursor: pointer; }
            #savedColors .sc-rename { flex: 1; display: flex; gap: 0.3rem; align-items: center; min-width: 0; }
            #savedColors .sc-rename input { flex: 1; min-width: 0; padding: 0.35rem 0.5rem; font-size: 0.85rem; }
            #savedColors .sc-empty { padding: 0.6rem 0.75rem; color: var(--text-secondary); font-size: 0.8rem; }
            #savedColors button.btn-secondary { width: auto; margin: 0; padding: 0.3rem 0.6rem; font-size: 0.8rem; }
            #savedColors .sc-more, #savedColors .sc-clear { display: block; margin: 0.5rem 0.7rem !important; }
            #savedColors .sc-actions { display: flex; flex-wrap: wrap; gap: 0.35rem; margin-top: 0.4rem; }
        `;
        document.head.appendChild(style);

        const root = document.createElement('div');
        root.id = 'savedColors';
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
