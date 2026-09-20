// App state/logic — ported from the approved Claude Design Component class.
// Behavior (state shape, screen flow, dosing math, view-model shape) is
// unchanged from the source; only the runtime host (setState/render) differs.
(function () {
  const { CATEGORIES, CALCS } = window.PEDICALC_DATA;

  class PediCalcApp {
    constructor(props) {
      this.props = props || {};
      this.state = {
        screen: 'home', tab: 'home', categoryId: null, calcId: null,
        calcOrigin: null, calcOriginCategory: null,
        search: '', drugFilter: '', inputsByCalc: {}, saved: [], ack: {},
        patient: { weightKg: null, heightCm: null, ageValue: null, ageUnit: 'years', sex: 'M', name: '', weightText: '', heightText: '', ageText: '' }
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
    }

    _persist() {
      try {
        localStorage.setItem('pedicalc.saved', JSON.stringify(this.state.saved));
        localStorage.setItem('pedicalc.patient', JSON.stringify(this.state.patient));
      } catch (e) {}
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
    
      goHome() { this.setState({ screen: 'home', tab: 'home' }); }
      goSaved() { this.setState({ screen: 'saved', tab: 'saved' }); }
      goPatient() { this.setState({ screen: 'patient', tab: 'patient' }); }
      goCategory(catId) { this.setState({ screen: 'category', categoryId: catId, tab: 'home' }); }
    
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
            let n = Number(r); if (isNaN(n)) n = Number(f.default);
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
              ageUnitOptions: [ { value: 'months', label: 'mo' }, { value: 'years', label: 'yr' } ].map(o => ({
                ...o, checked: unit === o.value, onSelect: () => this.updateField(calc.id, f.key + 'Unit', o.value)
              }))
            };
          }
          return {
            key: f.key, label: f.prefillWeight ? (f.label + ' (' + (this.props.weightUnit || 'kg') + ')') : f.label,
            isSeg: false, isNumber: true, value: val, step: f.step || 1,
            onChange: (e) => this.updateField(calc.id, f.key, e.target.value)
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
          onClear: () => this.setState({ patient: { weightKg: null, heightCm: null, ageValue: null, ageUnit: 'years', sex: 'M', name: '', weightText: '', heightText: '', ageText: '' } })
        };
        const tab = this.state.tab;
        const drugHits = hasSearch ? this.matchDrugs(search).slice(0, 12) : [];
        const drugResults = drugHits.map(d => ({ ...this.drugMeta(d), onClick: () => this.openDrug(d.id, 'home') }));
    
        return {
          isHome: screen === 'home', isCategory: screen === 'category', isCalc: screen === 'calc', isSaved: screen === 'saved', isPatient: screen === 'patient',
          drugResults, hasDrugResults: drugResults.length > 0,
          search, onSearchChange: (e) => this.setState({ search: e.target.value }),
          hasSearch, hasNoSearch: !hasSearch, searchResults, noSearchResults: hasSearch && searchResults.length === 0 && drugResults.length === 0,
          homeCategories, hasSaved: this.state.saved.length > 0, savedPreview,
          patientChipLabel, patientView,
          categoryView: this.getCategoryView(), calcView: this.getCurrentCalcView(),
          savedView, hasSavedList: savedView.length > 0, hasNoSavedList: savedView.length === 0,
          goHome: () => this.goHome(), goSaved: () => this.goSaved(), goPatient: () => this.goPatient(),
          tabHomeColor: tab === 'home' ? 'var(--color-accent-700)' : 'var(--color-neutral-700)',
          tabSavedColor: tab === 'saved' ? 'var(--color-accent-700)' : 'var(--color-neutral-700)',
          tabPatientColor: tab === 'patient' ? 'var(--color-accent-700)' : 'var(--color-neutral-700)'
        };
      }
  }

  window.PediCalcApp = PediCalcApp;
})();
