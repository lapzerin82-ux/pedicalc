// App state/logic — ported from the approved Claude Design Component class.
// Behavior (state shape, screen flow, dosing math, view-model shape) is
// unchanged from the source; only the runtime host (setState/render) differs.
(function () {
  const { CATEGORIES, CALCS } = window.PEDICALC_DATA;

  // Parses an "available form" strength string like "125mg/5mL", "100mg/mL",
  // or "1g/10mL" into a concentration in mg/mL (matching what a drug's own
  // `strengths[].value` holds). Returns null if the text doesn't match a
  // recognisable strength format, so the caller can skip showing a mL/dose
  // figure rather than silently computing one from a guessed concentration.
  function parseStrengthConcentration(text) {
    const m = String(text || '').trim().match(/^([\d.]+)\s*(mcg|micrograms?|mg|g)\s*\/\s*([\d.]*)\s*m?l$/i);
    if (!m) return null;
    const amount = parseFloat(m[1]);
    if (!amount || isNaN(amount)) return null;
    const unit = m[2].toLowerCase();
    const ml = m[3] ? parseFloat(m[3]) : 1;
    if (!ml) return null;
    const mg = unit === 'g' ? amount * 1000 : (unit.indexOf('mcg') === 0 || unit.indexOf('microgram') === 0 ? amount / 1000 : amount);
    return mg / ml;
  }

  class PediCalcApp {
    constructor(props) {
      this.props = props || {};
      this.state = {
        screen: 'home', tab: 'home', categoryId: null, calcId: null,
        calcOrigin: null, calcOriginCategory: null,
        search: '', drugFilter: '', inputsByCalc: {}, saved: [], ack: {},
        patient: { weightKg: null, heightCm: null, ageValue: null, ageUnit: 'years', sex: 'M', name: '', weightText: '', heightText: '', ageText: '' },
        installAvailable: false,
        customDrugs: [], customMedForm: { name: '', form: '', dose: '', frequency: '', route: '' }, customMedEditingId: null,
        customMedImportMessage: null
      };
      this.CATEGORIES = CATEGORIES;
      this.CALCS = CALCS;
      this._listeners = [];
      this._loadPersisted();
    }

    subscribe(fn) { this._listeners.push(fn); }

    // Saved calculators and patient context persist across app launches;
    // everything else (screen, search, in-progress field values) stays
    // in-memory only, matching the original design.
    _loadPersisted() {
      try {
        const saved = JSON.parse(localStorage.getItem('pedicalc.saved'));
        if (Array.isArray(saved)) this.state.saved = saved;
      } catch (e) {}
      try {
        const patient = JSON.parse(localStorage.getItem('pedicalc.patient'));
        if (patient && typeof patient === 'object') this.state.patient = Object.assign({}, this.state.patient, patient);
      } catch (e) {}
      // weightText/heightText/ageText are the live editing buffers shown in the
      // input; derive them from the persisted numeric values so a reopened app
      // shows the saved patient info (these buffers are not themselves persisted).
      const p = this.state.patient;
      if (!p.weightText && p.weightKg != null) p.weightText = String(this.displayWeight(p.weightKg));
      if (!p.heightText && p.heightCm != null) p.heightText = String(p.heightCm);
      if (!p.ageText && p.ageValue != null) p.ageText = String(p.ageValue);
      try {
        const customDrugs = JSON.parse(localStorage.getItem('pedicalc.customDrugs'));
        if (Array.isArray(customDrugs)) this.state.customDrugs = customDrugs;
      } catch (e) {}
      // Custom medications live in state (so they persist/render like any
      // other list) but also need to appear in the drug-dosing calculator's
      // own search/select — which reads straight from calc.drugs — so we
      // mirror them into that array in place rather than threading a merged
      // list through every call site that reads calc.drugs.
      this._syncCustomDrugsIntoCalc(this.state.customDrugs);
    }

    _persist() {
      try {
        localStorage.setItem('pedicalc.saved', JSON.stringify(this.state.saved));
        localStorage.setItem('pedicalc.patient', JSON.stringify(this.state.patient));
        localStorage.setItem('pedicalc.customDrugs', JSON.stringify(this.state.customDrugs));
      } catch (e) {}
    }

    _syncCustomDrugsIntoCalc(customDrugs) {
      const calc = this.drugCalc();
      if (!calc) return;
      calc.drugs = calc.drugs.filter(d => !d.isCustom).concat(customDrugs);
    }

    setState(update) {
      const patch = typeof update === 'function' ? update(this.state) : update;
      this.state = Object.assign({}, this.state, patch);
      this._persist();
      this._listeners.forEach(function (fn) { fn(); });
    }

      toKg(n) { return (this.props.weightUnit || 'kg') === 'lb' ? n / 2.20462 : n; }
      displayWeight(kg) { return (this.props.weightUnit || 'kg') === 'lb' ? Math.round(kg * 2.20462 * 10) / 10 : Math.round(kg * 10) / 10; }
      categoryLabel(id) { const c = this.CATEGORIES.find(x => x.id === id); return c ? c.label : ''; }
    
      updateField(calcId, key, val) {
        this.setState(s => ({ inputsByCalc: { ...s.inputsByCalc, [calcId]: { ...s.inputsByCalc[calcId], [key]: val } } }));
      }
    
      // The actual `beforeinstallprompt` event/deferred prompt is a browser
      // API concern owned by index.html (not app state); it flips this flag
      // on/off and wires requestInstall() to actually show the browser's
      // install dialog via props.onInstallRequest.
      setInstallAvailable(v) { this.setState({ installAvailable: v }); }
      requestInstall() { if (this.props.onInstallRequest) this.props.onInstallRequest(); }

      goHome() { this.setState({ screen: 'home', tab: 'home' }); }
      goSaved() { this.setState({ screen: 'saved', tab: 'saved' }); }
      goPatient() { this.setState({ screen: 'patient', tab: 'patient' }); }
      goCategory(catId) { this.setState({ screen: 'category', categoryId: catId, tab: 'home' }); }

      // Custom (manually-entered) medications: a simple add/remove list that
      // also mirrors into the drug-dosing calculator's own drug list (see
      // _syncCustomDrugsIntoCalc), so a custom entry is searchable/selectable
      // there and computes mg/kg/dose (+ mL/dose, if the strength parses)
      // through the exact same calculated-mode path as a BNFC-sourced drug.
      goCustomMeds() { this.setState({ screen: 'custom-meds' }); }
      backFromCustomMeds() {
        this.setState({ screen: 'calc', customMedEditingId: null, customMedForm: { name: '', form: '', dose: '', frequency: '', route: '' } });
      }
      updateCustomMedField(key, val) {
        this.setState(s => ({ customMedForm: { ...s.customMedForm, [key]: val } }));
      }
      _buildCustomDrug(id, f) {
        const name = f.name.trim();
        const form = f.form.trim(), frequency = f.frequency.trim(), route = f.route.trim();
        const mgPerKg = Number(f.dose.trim());
        const conc = parseStrengthConcentration(form);
        return {
          id: id, name: name, group: 'Custom (added by you)',
          mgPerKg: mgPerKg, freq: frequency || 'as directed', route: route || '—',
          doseText: mgPerKg + ' mg/kg/dose' + (frequency ? ', ' + frequency : '') + (route ? ' (' + route + ')' : ''),
          strengths: conc != null ? [{ value: conc, label: form }] : [],
          cautionText: 'Manually entered by you — not sourced from BNF for Children. Verify dose, frequency, route, and formulation strength independently before use.'
            + (form && conc == null ? ' The available form entered ("' + form + '") could not be read as a concentration (expected e.g. "125mg/5mL"), so only mg/kg/dose is shown, not mL/dose.' : ''),
          source: 'User-entered (manual custom medication).',
          isCustom: true
        };
      }
      // Add or, when customMedEditingId is set (see editCustomMed), save an
      // in-place edit — keeping the same id so it stays the same entry
      // wherever it's already selected (search results, an open calc screen).
      saveCustomMed() {
        const f = this.state.customMedForm;
        const name = f.name.trim();
        const doseText = f.dose.trim();
        const mgPerKg = Number(doseText);
        if (!name || !doseText || isNaN(mgPerKg) || mgPerKg <= 0) return;
        const editingId = this.state.customMedEditingId;
        const drug = this._buildCustomDrug(editingId || ('custom-' + Date.now() + '-' + Math.random().toString(36).slice(2, 7)), f);
        const nextCustomDrugs = editingId
          ? this.state.customDrugs.map(d => d.id === editingId ? drug : d)
          : [...this.state.customDrugs, drug];
        this._syncCustomDrugsIntoCalc(nextCustomDrugs);
        this.setState({ customDrugs: nextCustomDrugs, customMedEditingId: null, customMedForm: { name: '', form: '', dose: '', frequency: '', route: '' } });
      }
      editCustomMed(id) {
        const d = this.state.customDrugs.find(x => x.id === id);
        if (!d) return;
        this.setState({
          customMedEditingId: id,
          customMedForm: {
            name: d.name,
            form: (d.strengths && d.strengths[0]) ? d.strengths[0].label : '',
            dose: String(d.mgPerKg),
            frequency: d.freq === 'as directed' ? '' : d.freq,
            route: d.route === '—' ? '' : d.route
          }
        });
      }
      cancelEditCustomMed() {
        this.setState({ customMedEditingId: null, customMedForm: { name: '', form: '', dose: '', frequency: '', route: '' } });
      }
      removeCustomMed(id) {
        const nextCustomDrugs = this.state.customDrugs.filter(d => d.id !== id);
        this._syncCustomDrugsIntoCalc(nextCustomDrugs);
        const patch = { customDrugs: nextCustomDrugs };
        if (this.state.customMedEditingId === id) {
          patch.customMedEditingId = null;
          patch.customMedForm = { name: '', form: '', dose: '', frequency: '', route: '' };
        }
        this.setState(patch);
      }
      // Custom medications live in this device's localStorage, which an app
      // update never touches — but a full uninstall (or moving to a new
      // device) can still clear it depending on the OS/browser's own backup
      // settings, which this app has no control over. Export/Import gives a
      // reliable, user-controlled way to carry the list across that gap
      // regardless of platform or backup settings.
      exportCustomMeds() {
        const data = JSON.stringify(this.state.customDrugs, null, 2);
        const blob = new Blob([data], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'pedicalc-custom-medications.json';
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        setTimeout(() => URL.revokeObjectURL(url), 1000);
      }
      importCustomMedsFromFile(file) {
        const reader = new FileReader();
        reader.onload = () => {
          let parsed;
          try { parsed = JSON.parse(reader.result); } catch (e) {
            this.setState({ customMedImportMessage: { type: 'error', text: "That file isn't valid JSON." } });
            return;
          }
          if (!Array.isArray(parsed)) {
            this.setState({ customMedImportMessage: { type: 'error', text: 'Expected a list of medications (from a previous Export).' } });
            return;
          }
          const valid = parsed.filter(d => d && typeof d.name === 'string' && d.name.trim() && typeof d.mgPerKg === 'number' && d.mgPerKg > 0);
          if (!valid.length) {
            this.setState({ customMedImportMessage: { type: 'error', text: 'No valid medications found in that file.' } });
            return;
          }
          // Match by id first (a re-import of the same export), else by
          // name (so importing an updated backup overwrites, not duplicates,
          // an entry you already have).
          const nextCustomDrugs = this.state.customDrugs.slice();
          valid.forEach(d => {
            const idx = nextCustomDrugs.findIndex(x => x.id === d.id || x.name.toLowerCase() === d.name.trim().toLowerCase());
            const entry = Object.assign({}, d, { isCustom: true, group: d.group || 'Custom (added by you)' });
            if (idx >= 0) nextCustomDrugs[idx] = entry; else nextCustomDrugs.push(entry);
          });
          this._syncCustomDrugsIntoCalc(nextCustomDrugs);
          this.setState({
            customDrugs: nextCustomDrugs,
            customMedImportMessage: { type: 'success', text: 'Imported ' + valid.length + ' medication' + (valid.length === 1 ? '' : 's') + '.' }
          });
        };
        reader.readAsText(file);
      }
      getCustomMedsView() {
        const f = this.state.customMedForm;
        const doseNum = Number(f.dose);
        const editingId = this.state.customMedEditingId;
        return {
          name: f.name, form: f.form, dose: f.dose, frequency: f.frequency, route: f.route,
          onName: (e) => this.updateCustomMedField('name', e.target.value),
          onForm: (e) => this.updateCustomMedField('form', e.target.value),
          onDose: (e) => this.updateCustomMedField('dose', e.target.value),
          onFrequency: (e) => this.updateCustomMedField('frequency', e.target.value),
          onRoute: (e) => this.updateCustomMedField('route', e.target.value),
          onAdd: () => this.saveCustomMed(),
          canAdd: f.name.trim().length > 0 && f.dose.trim().length > 0 && !isNaN(doseNum) && doseNum > 0,
          isEditing: !!editingId,
          submitLabel: editingId ? 'Save changes' : 'Add medication',
          onCancelEdit: () => this.cancelEditCustomMed(),
          items: this.state.customDrugs.map(d => ({
            id: d.id, name: d.name,
            summary: d.mgPerKg + ' mg/kg/dose' + (d.freq ? ', ' + d.freq : '') + (d.route && d.route !== '—' ? ' — ' + d.route : '')
              + (d.strengths && d.strengths[0] ? ' (' + d.strengths[0].label + ')' : ''),
            isBeingEdited: d.id === editingId,
            onEdit: () => this.editCustomMed(d.id),
            onRemove: () => this.removeCustomMed(d.id)
          })),
          hasItems: this.state.customDrugs.length > 0,
          onExport: () => this.exportCustomMeds(),
          onImportFile: (e) => {
            const file = e.target.files && e.target.files[0];
            if (file) this.importCustomMedsFromFile(file);
            e.target.value = '';
          },
          importMessage: this.state.customMedImportMessage,
          back: () => this.backFromCustomMeds()
        };
      }
    
      drugCalc() { return this.CALCS.find(c => c.id === 'drug-dosing'); }
    
      openDrug(drugId, origin) {
        const calc = this.drugCalc();
        if (!calc) return;
        const drug = calc.drugs.find(d => d.id === drugId) || calc.drugs[0];
        this.setState(s => {
          const prev = s.inputsByCalc[calc.id] || {};
          const init = {};
          calc.fields.forEach(f => {
            if (f.type === 'number' && f.prefillWeight) {
              init[f.key] = prev[f.key] !== undefined ? prev[f.key]
                : (s.patient.weightKg ? String(this.displayWeight(s.patient.weightKg)) : String(f.default));
            } else if (f.type === 'ageCombo' && f.prefillAge) {
              init[f.key] = prev[f.key] !== undefined ? prev[f.key]
                : (s.patient.ageValue != null ? String(s.patient.ageValue) : String(f.default));
              init[f.key + 'Unit'] = prev[f.key + 'Unit'] !== undefined ? prev[f.key + 'Unit'] : (s.patient.ageUnit || 'years');
            } else if (f.key === 'drug') init[f.key] = drug.id;
            else if (f.key === 'strength') init[f.key] = String((drug.strengths && drug.strengths[0]) ? drug.strengths[0].value : '1');
            else init[f.key] = prev[f.key] !== undefined ? prev[f.key] : String(f.default);
          });
          return {
            screen: 'calc', calcId: calc.id, calcOrigin: origin || 'home', calcOriginCategory: null,
            drugFilter: '', inputsByCalc: { ...s.inputsByCalc, [calc.id]: init }
          };
        });
      }
    
      drugMeta(d) {
        const isRef = d.mode === 'reference';
        return {
          id: d.id, name: d.name,
          meta: isRef ? (d.route || '') + ' — reference dosing' : (d.route || '') + ' — ' + (d.doseText || 'weight-based'),
          tagLabel: isRef ? 'Reference' : 'Calculated',
          tagClass: isRef ? 'tag-outline' : ''
        };
      }
    
      matchDrugs(q) {
        const calc = this.drugCalc();
        if (!calc) return [];
        const needle = q.trim().toLowerCase();
        if (!needle) return calc.drugs;
        return calc.drugs.filter(d => (d.name + ' ' + (d.group || '') + ' ' + (d.route || '')).toLowerCase().includes(needle));
      }
    
      goCalc(calc, origin, originCat) {
        this.setState(s => {
          const inputsByCalc = { ...s.inputsByCalc };
          if (!inputsByCalc[calc.id]) {
            const init = {};
            calc.fields.forEach(f => {
              if (f.type === 'number' && f.prefillWeight && s.patient.weightKg) init[f.key] = String(this.displayWeight(s.patient.weightKg));
              else if (f.type === 'ageCombo' && f.prefillAge) {
                init[f.key] = s.patient.ageValue != null ? String(s.patient.ageValue) : String(f.default);
                init[f.key + 'Unit'] = s.patient.ageUnit || 'years';
              }
              else if (f.key === 'drug' && calc.drugs) init[f.key] = calc.drugs[0].id;
              else if (f.key === 'strength' && calc.drugs) init[f.key] = String((calc.drugs[0].strengths && calc.drugs[0].strengths[0]) ? calc.drugs[0].strengths[0].value : '1');
              else init[f.key] = String(f.default);
            });
            inputsByCalc[calc.id] = init;
          }
          return { screen: 'calc', calcId: calc.id, calcOrigin: origin, calcOriginCategory: originCat, inputsByCalc };
        });
      }
    
      backFromCalc() {
        const { calcOrigin, calcOriginCategory } = this.state;
        if (calcOrigin === 'category') this.goCategory(calcOriginCategory);
        else if (calcOrigin === 'saved') this.setState({ screen: 'saved', tab: 'saved' });
        else this.setState({ screen: 'home', tab: 'home' });
      }
    
      toggleSaveId(id) {
        this.setState(s => ({ saved: s.saved.indexOf(id) >= 0 ? s.saved.filter(x => x !== id) : [...s.saved, id] }));
      }
    
      buildResult(calc) {
        const raw = this.state.inputsByCalc[calc.id] || {};
        const v = {};
        calc.fields.forEach(f => {
          if (f.key === 'strength' && calc.drugs) {
            const drugVal = raw.drug !== undefined ? raw.drug : calc.fields.find(x => x.key === 'drug').default;
            const drugObj = calc.drugs.find(d => d.id === drugVal) || calc.drugs[0];
            const opts = drugObj.strengths || [];
            const val = raw.strength;
            v.strength = opts.some(o => String(o.value) === String(val)) ? val : (opts[0] ? opts[0].value : '1');
          } else if (f.key === 'strength' && calc.strengths) {
            const drugVal = raw.drug !== undefined ? raw.drug : calc.fields.find(x => x.key === 'drug').default;
            const opts = calc.strengths[drugVal] || [];
            const val = raw.strength;
            v.strength = opts.some(o => String(o.value) === String(val)) ? val : (opts[0] ? opts[0].value : '1');
          } else if (f.type === 'number') {
            const r = raw[f.key] !== undefined ? raw[f.key] : f.default;
            const rt = String(r).trim();
            let n = rt === '' ? Number(f.default) : Number(r);
            if (isNaN(n)) n = Number(f.default);
            v[f.key] = f.prefillWeight ? this.toKg(n) : n;
          } else if (f.type === 'ageCombo') {
            const text = raw[f.key] !== undefined ? raw[f.key] : f.default;
            const unit = raw[f.key + 'Unit'] || 'years';
            const n = Number(text);
            const valid = String(text).trim() !== '' && !isNaN(n);
            v.ageValue = valid ? n : null;
            v.ageUnit = unit;
            v.ageMonths = valid ? (unit === 'months' ? n : n * 12) : null;
          } else {
            v[f.key] = raw[f.key] !== undefined ? raw[f.key] : f.default;
          }
        });
        return calc.compute(v, this.state.patient, calc);
      }
    
      getFieldsDisplay(calc) {
        const raw = this.state.inputsByCalc[calc.id] || {};
        return calc.fields.map(f => {
          const val = raw[f.key] !== undefined ? raw[f.key] : String(f.default);
          if (f.key === 'weight' && calc.drugs) {
            const drugVal = raw.drug !== undefined ? raw.drug : calc.fields.find(x => x.key === 'drug').default;
            const drugObj = calc.drugs.find(d => d.id === drugVal) || calc.drugs[0];
            if (drugObj.mode === 'reference' && !drugObj.weightBands) return null;
          }
          if (f.key === 'strength' && calc.drugs) {
            const drugVal = raw.drug !== undefined ? raw.drug : calc.fields.find(x => x.key === 'drug').default;
            const drugObj = calc.drugs.find(d => d.id === drugVal) || calc.drugs[0];
            const opts = drugObj.strengths || [];
            if (opts.length === 0) return null;
            const curVal = opts.some(o => String(o.value) === String(val)) ? val : (opts[0] ? opts[0].value : '');
            return {
              key: f.key, label: f.label, isSeg: true, isNumber: false, isSelect: false,
              options: opts.map(o => ({ value: String(o.value), label: o.label, checked: String(curVal) === String(o.value), onSelect: () => this.updateField(calc.id, f.key, String(o.value)) }))
            };
          }
          if (f.type === 'select' && calc.drugs) {
            const q = (this.state.drugFilter || '').trim().toLowerCase();
            let list = calc.drugs;
            if (q) {
              const hits = calc.drugs.filter(d => (d.name + ' ' + (d.group || '') + ' ' + (d.route || '')).toLowerCase().includes(q));
              const selected = calc.drugs.find(d => d.id === val);
              list = (selected && !hits.some(d => d.id === selected.id)) ? [selected, ...hits] : hits;
              if (!list.length && selected) list = [selected];
            }
            const groupsMap = {};
            list.forEach(d => { (groupsMap[d.group] = groupsMap[d.group] || []).push(d); });
            const groups = Object.keys(groupsMap).map(g => ({ label: g, options: groupsMap[g].map(d => ({ value: d.id, label: d.name })) }));
            return {
              key: f.key, label: f.label, isSelect: true, isSeg: false, isNumber: false,
              isSearchable: true, filterQuery: this.state.drugFilter || '',
              filterCountLabel: q ? (list.length + ' of ' + calc.drugs.length + ' medications') : (calc.drugs.length + ' medications'),
              onFilterChange: (e) => {
                const query = e.target.value;
                const needle = query.trim().toLowerCase();
                const topHit = needle ? calc.drugs.find(d => (d.name + ' ' + (d.group || '') + ' ' + (d.route || '')).toLowerCase().includes(needle)) : null;
                this.setState(s => {
                  const patch = { drugFilter: query };
                  if (topHit) {
                    const prev = s.inputsByCalc[calc.id] || {};
                    patch.inputsByCalc = {
                      ...s.inputsByCalc,
                      [calc.id]: { ...prev, drug: topHit.id, strength: String((topHit.strengths && topHit.strengths[0]) ? topHit.strengths[0].value : '1') }
                    };
                  }
                  return patch;
                });
              },
              value: val, groups,
              onChange: (e) => {
                this.updateField(calc.id, f.key, e.target.value);
                const drugObj = calc.drugs.find(d => d.id === e.target.value);
                if (drugObj && drugObj.strengths && drugObj.strengths[0]) this.updateField(calc.id, 'strength', String(drugObj.strengths[0].value));
              }
            };
          }
          if (f.type === 'seg') {
            return {
              key: f.key, label: f.label, isSeg: true, isNumber: false,
              options: f.options.map(o => ({ value: String(o.value), label: o.label, checked: String(val) === String(o.value), onSelect: () => {
                this.updateField(calc.id, f.key, String(o.value));
                if (f.key === 'drug' && calc.strengths) {
                  const opts = calc.strengths[o.value] || [];
                  if (opts[0]) this.updateField(calc.id, 'strength', String(opts[0].value));
                }
              } }))
            };
          }
          if (f.type === 'ageCombo') {
            const unit = raw[f.key + 'Unit'] || 'years';
            return {
              key: f.key, label: f.label, isAgeCombo: true, isNumber: false, isSeg: false, isSelect: false,
              value: val,
              onChange: (e) => this.updateField(calc.id, f.key, e.target.value),
              onClear: () => this.updateField(calc.id, f.key, ''),
              ageUnitOptions: [ { value: 'months', label: 'mo' }, { value: 'years', label: 'yr' } ].map(o => ({
                ...o, checked: unit === o.value, onSelect: () => this.updateField(calc.id, f.key + 'Unit', o.value)
              }))
            };
          }
          return {
            key: f.key, label: f.prefillWeight ? (f.label + ' (' + (this.props.weightUnit || 'kg') + ')') : f.label,
            isSeg: false, isNumber: true, value: val, step: f.step || 1,
            onChange: (e) => this.updateField(calc.id, f.key, e.target.value),
            onClear: () => this.updateField(calc.id, f.key, '')
          };
        });
      }
    
      getCurrentCalcView() {
        const calc = this.CALCS.find(c => c.id === this.state.calcId);
        if (!calc) return null;
        const result = this.buildResult(calc);
        const hasCaution = !!(result && result.caution);
        const acked = !!this.state.ack[calc.id];
        const gateOn = !!this.props.requireCautionAck && hasCaution && !acked;
        const isSaved = this.state.saved.indexOf(calc.id) >= 0;
        return {
          id: calc.id, name: calc.name, categoryLabel: this.categoryLabel(calc.categoryId),
          fields: this.getFieldsDisplay(calc).filter(Boolean), result, showGate: gateOn, showDetails: !gateOn,
          acknowledge: () => this.setState(s => ({ ack: { ...s.ack, [calc.id]: true } })),
          isSaved, isSavedNot: !isSaved,
          toggleSave: (e) => { if (e && e.stopPropagation) e.stopPropagation(); this.toggleSaveId(calc.id); },
          showAddCustomMed: calc.id === 'drug-dosing', onAddCustomMed: () => this.goCustomMeds(),
          back: () => this.backFromCalc()
        };
      }

      getCategoryView() {
        const cat = this.CATEGORIES.find(c => c.id === this.state.categoryId);
        if (!cat) return null;
        const calcs = this.CALCS.filter(c => c.categoryId === cat.id).map(c => {
          const isSaved = this.state.saved.indexOf(c.id) >= 0;
          return {
            id: c.id, name: c.name, tagClass: c.flagship ? 'tag-accent' : 'tag-neutral', tagLabel: c.flagship ? 'Decision support' : 'Quick calc',
            isSaved, isSavedNot: !isSaved,
            toggleSave: (e) => { if (e && e.stopPropagation) e.stopPropagation(); this.toggleSaveId(c.id); },
            onClick: () => this.goCalc(c, 'category', cat.id)
          };
        });
        return { label: cat.label, iconD: cat.iconD, calcs, back: () => this.goHome() };
      }
    
      renderVals() {
        const screen = this.state.screen;
        const search = this.state.search;
        const hasSearch = search.trim().length > 0;
        const searchResults = hasSearch ? this.CALCS.filter(c => (c.name + ' ' + this.categoryLabel(c.categoryId)).toLowerCase().includes(search.toLowerCase())).map(c => ({
          id: c.id, name: c.name, categoryLabel: this.categoryLabel(c.categoryId), onClick: () => this.goCalc(c, 'home', null)
        })) : [];
        const homeCategories = this.CATEGORIES.map(cat => ({
          ...cat, count: this.CALCS.filter(c => c.categoryId === cat.id).length, onClick: () => this.goCategory(cat.id)
        }));
        const savedPreview = this.state.saved.map(id => this.CALCS.find(c => c.id === id)).filter(Boolean).map(c => ({ name: c.name, onClick: () => this.goCalc(c, 'saved', null) }));
        const savedView = this.state.saved.map(id => this.CALCS.find(c => c.id === id)).filter(Boolean).map(c => ({
          name: c.name, categoryLabel: this.categoryLabel(c.categoryId), onClick: () => this.goCalc(c, 'saved', null)
        }));
        const patient = this.state.patient;
        const weightUnit = this.props.weightUnit || 'kg';
        const patientChipLabel = patient.weightKg ? (this.displayWeight(patient.weightKg) + ' ' + weightUnit + (patient.ageValue ? ' · ' + patient.ageValue + (patient.ageUnit === 'years' ? 'y' : 'mo') : '')) : 'Tap to add patient info';
        const patientView = {
          name: patient.name, weightUnit,
          weightDisplay: patient.weightText != null ? patient.weightText : '',
          heightDisplay: patient.heightText != null ? patient.heightText : '',
          ageDisplay: patient.ageText != null ? patient.ageText : '',
          onName: (e) => this.setState(s => ({ patient: { ...s.patient, name: e.target.value } })),
          // Store the raw text verbatim (so a trailing "." or in-progress decimal
          // isn't stripped by re-rendering with a rounded value) while also
          // keeping the parsed numeric field up to date for use elsewhere
          // (prefill, patient chip, persistence). An empty field clears the
          // numeric value; text that doesn't yet parse leaves it unchanged.
          onWeight: (e) => {
            const text = e.target.value; const n = Number(text);
            this.setState(s => ({ patient: { ...s.patient, weightText: text,
              weightKg: text.trim() === '' ? null : (isNaN(n) ? s.patient.weightKg : this.toKg(n)) } }));
          },
          onHeight: (e) => {
            const text = e.target.value; const n = Number(text);
            this.setState(s => ({ patient: { ...s.patient, heightText: text,
              heightCm: text.trim() === '' ? null : (isNaN(n) ? s.patient.heightCm : n) } }));
          },
          onAge: (e) => {
            const text = e.target.value; const n = Number(text);
            this.setState(s => ({ patient: { ...s.patient, ageText: text,
              ageValue: text.trim() === '' ? null : (isNaN(n) ? s.patient.ageValue : n) } }));
          },
          ageUnitOptions: [ { value: 'months', label: 'mo' }, { value: 'years', label: 'yr' } ].map(o => ({ ...o, checked: patient.ageUnit === o.value, onSelect: () => this.setState(s => ({ patient: { ...s.patient, ageUnit: o.value } })) })),
          sexOptions: [ { value: 'M', label: 'Male' }, { value: 'F', label: 'Female' } ].map(o => ({ ...o, checked: patient.sex === o.value, onSelect: () => this.setState(s => ({ patient: { ...s.patient, sex: o.value } })) })),
          onClearWeight: () => this.setState(s => ({ patient: { ...s.patient, weightText: '', weightKg: null } })),
          onClearHeight: () => this.setState(s => ({ patient: { ...s.patient, heightText: '', heightCm: null } })),
          onClearAge: () => this.setState(s => ({ patient: { ...s.patient, ageText: '', ageValue: null } })),
          onClear: () => this.setState({ patient: { weightKg: null, heightCm: null, ageValue: null, ageUnit: 'years', sex: 'M', name: '', weightText: '', heightText: '', ageText: '' } })
        };
        const tab = this.state.tab;
        const drugHits = hasSearch ? this.matchDrugs(search).slice(0, 12) : [];
        const drugResults = drugHits.map(d => ({ ...this.drugMeta(d), onClick: () => this.openDrug(d.id, 'home') }));
    
        return {
          isHome: screen === 'home', isCategory: screen === 'category', isCalc: screen === 'calc', isSaved: screen === 'saved', isPatient: screen === 'patient',
          isCustomMeds: screen === 'custom-meds',
          drugResults, hasDrugResults: drugResults.length > 0,
          search, onSearchChange: (e) => this.setState({ search: e.target.value }),
          hasSearch, hasNoSearch: !hasSearch, searchResults, noSearchResults: hasSearch && searchResults.length === 0 && drugResults.length === 0,
          homeCategories, hasSaved: this.state.saved.length > 0, savedPreview,
          patientChipLabel, patientView,
          categoryView: this.getCategoryView(), calcView: this.getCurrentCalcView(), customMedsView: this.getCustomMedsView(),
          savedView, hasSavedList: savedView.length > 0, hasNoSavedList: savedView.length === 0,
          installAvailable: this.state.installAvailable, onInstall: () => this.requestInstall(),
          goHome: () => this.goHome(), goSaved: () => this.goSaved(), goPatient: () => this.goPatient(),
          tabHomeColor: tab === 'home' ? 'var(--color-accent-700)' : 'var(--color-neutral-700)',
          tabSavedColor: tab === 'saved' ? 'var(--color-accent-700)' : 'var(--color-neutral-700)',
          tabPatientColor: tab === 'patient' ? 'var(--color-accent-700)' : 'var(--color-neutral-700)'
        };
      }
  }

  window.PediCalcApp = PediCalcApp;
})();
