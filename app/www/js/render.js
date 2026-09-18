// DOM rendering — hand-written (no framework) but driven by the same
// view-model shape the original design's renderVals() produces, so the
// screen structure and behavior match the approved design.
(function () {
  'use strict';

  function el(tag, attrs, children) {
    const node = document.createElement(tag);
    attrs = attrs || {};
    Object.keys(attrs).forEach(function (k) {
      const v = attrs[k];
      if (v === null || v === undefined || v === false) return;
      if (k === 'class') node.className = v;
      else if (k === 'html') node.innerHTML = v;
      else if (k.indexOf('on') === 0 && typeof v === 'function') {
        node.addEventListener(k.slice(2).toLowerCase(), v);
      } else if (k === 'focusKey') {
        node.setAttribute('data-focus-key', v);
      } else if (v === true) {
        node.setAttribute(k, '');
      } else {
        node.setAttribute(k, v);
      }
    });
    (children || []).forEach(function (c) {
      if (c === null || c === undefined || c === false) return;
      node.appendChild(typeof c === 'string' ? document.createTextNode(c) : c);
    });
    return node;
  }

  function icon(d, opts) {
    opts = opts || {};
    const size = opts.size || 22;
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('width', size);
    svg.setAttribute('height', size);
    svg.setAttribute('viewBox', '0 0 24 24');
    svg.setAttribute('fill', opts.fill || 'none');
    svg.setAttribute('stroke', opts.stroke || 'currentColor');
    svg.setAttribute('stroke-width', opts.strokeWidth || '1.7');
    svg.setAttribute('stroke-linecap', 'round');
    svg.setAttribute('stroke-linejoin', 'round');
    if (opts.className) svg.setAttribute('class', opts.className);
    d.split(' M').forEach(function (seg, i) {
      const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
      path.setAttribute('d', i === 0 ? seg : 'M' + seg);
      svg.appendChild(path);
    });
    return svg;
  }

  const ICONS = {
    chevronRight: 'M9 6l6 6-6 6',
    chevronLeft: 'M19 12H5M11 6l-6 6 6 6',
    search: 'M10.5 4a6.5 6.5 0 1 0 0 13 6.5 6.5 0 0 0 0-13z M20 20l-4.8-4.8',
    user: 'M12 8m-3.5 0a3.5 3.5 0 1 0 7 0a3.5 3.5 0 1 0 -7 0 M5 20c0-3.5 3.1-6 7-6s7 2.5 7 6',
    bookmarkFilled: 'M6 3.5h12v17l-6-4-6 4z',
    mail: 'M2.5 4.5h19v15h-19z M3 6l9 6.5L21 6',
    home: 'M4 11.5 12 4l8 7.5 M6 10.5V20a1 1 0 0 0 1 1h4v-6h2v6h4a1 1 0 0 0 1-1v-9.5',
    close: 'M18 6 6 18 M6 6l12 12'
  };

  function bookmarkIcon(filled, size) {
    if (filled) {
      const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
      svg.setAttribute('width', size || 19); svg.setAttribute('height', size || 19);
      svg.setAttribute('viewBox', '0 0 24 24'); svg.setAttribute('fill', 'currentColor'); svg.setAttribute('stroke', 'none');
      const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
      path.setAttribute('d', ICONS.bookmarkFilled);
      svg.appendChild(path);
      return svg;
    }
    return icon(ICONS.bookmarkFilled, { size: size || 19 });
  }

  function warningIcon(size, className) {
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('width', size || 20); svg.setAttribute('height', size || 20);
    svg.setAttribute('viewBox', '0 0 24 24'); svg.setAttribute('fill', 'none');
    svg.setAttribute('stroke', 'currentColor'); svg.setAttribute('stroke-width', '1.7');
    svg.setAttribute('stroke-linecap', 'round'); svg.setAttribute('stroke-linejoin', 'round');
    if (className) svg.setAttribute('class', className);
    [['M12 3.2 21.8 20H2.2z', 'none'], ['M12 9.5v4.2', 'none']].forEach(function (p) {
      const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
      path.setAttribute('d', p[0]);
      svg.appendChild(path);
    });
    const dot = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
    dot.setAttribute('cx', '12'); dot.setAttribute('cy', '17.2'); dot.setAttribute('r', '0.9');
    dot.setAttribute('fill', 'currentColor'); dot.setAttribute('stroke', 'none');
    svg.appendChild(dot);
    return svg;
  }

  // ---- focus preservation across full re-renders --------------------------
  function captureFocus(root) {
    const a = document.activeElement;
    if (!a || !root.contains(a)) return null;
    const key = a.getAttribute('data-focus-key');
    if (!key) return null;
    let sel = null;
    try { sel = { start: a.selectionStart, end: a.selectionEnd }; } catch (e) {}
    return { key: key, sel: sel };
  }
  function restoreFocus(root, snap) {
    if (!snap) return;
    const node = root.querySelector('[data-focus-key="' + CSS.escape(snap.key) + '"]');
    if (!node) return;
    node.focus();
    if (snap.sel && snap.sel.start != null) {
      try { node.setSelectionRange(snap.sel.start, snap.sel.end); } catch (e) {}
    }
  }

  // ---- screens --------------------------------------------------------------

  function homeScreen(vm) {
    const banner = el('div', { class: 'home-banner' }, [
      el('div', { class: 'brand-row' }, [
        el('div', { class: 'brand-mark' }, ['Rx']),
        el('div', {}, [
          el('div', { class: 'nav-brand', style: 'font-size:22px;margin-bottom:2px' }, ['PediCalc']),
          el('p', { class: 'home-disclaimer' }, ['Clinical reference only — verify against institutional protocol.'])
        ])
      ])
    ]);

    const kids = [];
    kids.push(el('button', { class: 'patient-chip', onclick: vm.goPatient }, [
      icon(ICONS.user, { size: 22, className: 'patient-chip-icon' }),
      el('div', { style: 'flex:1;min-width:0' }, [
        el('div', { class: 'patient-chip-label' }, ['Patient']),
        el('div', { style: 'font-size:14px' }, [vm.patientChipLabel])
      ]),
      icon(ICONS.chevronRight, { size: 18, className: 'muted-icon' })
    ]));

    const searchWrap = el('div', { class: 'search-box' }, [
      icon(ICONS.search, { size: 16, className: 'search-box-icon' }),
      el('input', {
        class: 'input', style: 'padding-left:34px', placeholder: 'Search calculators or medications…',
        value: vm.search, focusKey: 'home-search',
        oninput: function (e) { vm.onSearchChange(e); }
      })
    ]);
    if (vm.search) {
      searchWrap.appendChild(el('button', {
        class: 'search-clear', 'aria-label': 'Clear search',
        onclick: function () { vm.onSearchChange({ target: { value: '' } }); }
      }, [icon(ICONS.close, { size: 14 })]));
    }
    kids.push(searchWrap);

    if (vm.hasSearch) {
      const list = el('div', { class: 'result-list' });
      vm.searchResults.forEach(function (r) {
        list.appendChild(el('div', { class: 'card tap-card', onclick: r.onClick }, [
          el('div', { class: 'card-title', style: 'font-size:15px' }, [r.name]),
          el('div', { class: 'card-meta' }, [r.categoryLabel])
        ]));
      });
      if (vm.hasDrugResults) {
        list.appendChild(el('div', { class: 'section-kicker', style: 'margin-top:6px' }, ['Medications']));
        vm.drugResults.forEach(function (d) {
          list.appendChild(el('div', { class: 'card tap-card row-card', onclick: d.onClick }, [
            el('div', { style: 'flex:1;min-width:0' }, [
              el('div', { class: 'card-title', style: 'font-size:15px' }, [d.name]),
              el('div', { class: 'card-meta' }, [d.meta])
            ]),
            el('span', { class: 'tag ' + d.tagClass, style: 'flex-shrink:0' }, [d.tagLabel])
          ]));
        });
      }
      if (vm.noSearchResults) {
        list.appendChild(el('div', { class: 'text-muted', style: 'font-size:13px;padding:8px 0' }, ['Nothing matches "' + vm.search + '".']));
      }
      kids.push(list);
    } else {
      const grid = el('div', { class: 'category-grid' });
      vm.homeCategories.forEach(function (cat) {
        grid.appendChild(el('div', { class: 'card elev-sm category-card tap-card', 'data-cat': cat.id, onclick: cat.onClick }, [
          el('div', { class: 'cat-icon-badge' }, [icon(cat.iconD, { size: 20, className: 'cat-icon' })]),
          el('div', { class: 'card-title', style: 'font-size:14.5px' }, [cat.label]),
          el('div', { class: 'card-meta' }, [cat.count + ' tools'])
        ]));
      });
      kids.push(grid);

      if (vm.hasSaved) {
        const savedRow = el('div', { style: 'display:flex;gap:8px;overflow-x:auto;padding-bottom:4px' });
        vm.savedPreview.forEach(function (s) {
          savedRow.appendChild(el('div', { class: 'tag tag-outline tap-chip', onclick: s.onClick }, [s.name]));
        });
        kids.push(el('div', { class: 'saved-preview' }, [
          el('h6', { style: 'color:var(--color-neutral-700);margin-bottom:8px' }, ['Saved']),
          savedRow
        ]));
      }

      kids.push(el('div', { class: 'credit-block' }, [
        el('div', { class: 'credit-photo grayscale' }, [
          el('img', { src: 'assets/bashar-ibrahim.jpg', alt: 'Dr. Bashar Ibrahim' })
        ]),
        el('div', { style: 'flex:1;min-width:0' }, [
          el('div', { class: 'credit-kicker' }, ['Developed by']),
          el('div', { style: 'font-size:14px;color:var(--color-text)' }, ['Dr. Bashar Ibrahim']),
          el('a', { href: 'mailto:bashar.mohammed@uoz.edu.krd', class: 'credit-email' }, [
            icon(ICONS.mail, { size: 13 }),
            el('span', {}, ['bashar.mohammed@uoz.edu.krd'])
          ])
        ])
      ]));
    }

    return el('div', { class: 'screen screen-home' }, [banner, el('div', { class: 'home-body' }, kids)]);
  }

  function headerBar(back, iconD, title, trailing) {
    const kids = [
      el('button', { class: 'icon-btn', onclick: back, 'aria-label': 'Back' }, [icon(ICONS.chevronLeft, { size: 22 })])
    ];
    if (iconD) kids.push(icon(iconD, { size: 22, stroke: 'var(--color-accent)' }));
    kids.push(title);
    if (trailing) kids.push(trailing);
    return el('div', { class: 'screen-header' }, kids);
  }

  function categoryScreen(vm) {
    const cv = vm.categoryView;
    const list = el('div', { class: 'calc-list' });
    cv.calcs.forEach(function (c) {
      list.appendChild(el('div', { class: 'card tap-card row-card', onclick: c.onClick }, [
        el('div', { style: 'flex:1;min-width:0' }, [
          el('div', { class: 'card-title', style: 'font-size:15px' }, [c.name]),
          el('span', { class: 'tag ' + c.tagClass, style: 'margin-top:4px' }, [c.tagLabel])
        ]),
        el('button', { class: 'icon-btn save-btn', onclick: c.toggleSave, 'aria-label': 'Toggle saved' }, [bookmarkIcon(c.isSaved, 19)]),
        icon(ICONS.chevronRight, { size: 17, className: 'muted-icon' })
      ]));
    });
    return el('div', { class: 'screen screen-category' }, [
      headerBar(cv.back, cv.iconD, el('h4', { style: 'margin:0;font-size:19px' }, [cv.label])),
      list
    ]);
  }

  function fieldNode(f) {
    if (f.isNumber) {
      return el('div', { class: 'field' }, [
        el('label', {}, [f.label]),
        el('input', {
          class: 'input', type: 'number', inputmode: 'decimal', step: f.step, value: f.value,
          focusKey: 'field:' + f.key, oninput: f.onChange
        })
      ]);
    }
    if (f.isSeg) {
      const seg = el('div', { class: 'seg', style: 'width:100%' });
      f.options.forEach(function (opt) {
        seg.appendChild(el('label', { class: 'seg-opt', style: 'flex:1;justify-content:center;text-align:center' }, [
          el('input', { type: 'radio', name: 'seg-' + f.key, checked: opt.checked, onchange: opt.onSelect }),
          el('span', {}, [opt.label])
        ]));
      });
      return el('div', { class: 'field' }, [el('label', {}, [f.label]), seg]);
    }
    if (f.isSelect) {
      const kids = [el('label', {}, [f.label])];
      if (f.isSearchable) {
        const filterWrap = el('div', { class: 'search-box', style: 'margin-bottom:8px' }, [
          icon(ICONS.search, { size: 15, className: 'search-box-icon' }),
          el('input', {
            class: 'input', style: 'padding-left:32px', placeholder: 'Filter medications…',
            value: f.filterQuery, focusKey: 'drug-filter', oninput: f.onFilterChange
          })
        ]);
        kids.push(filterWrap);
        kids.push(el('div', { class: 'card-meta', style: 'margin-bottom:6px' }, [f.filterCountLabel]));
      }
      const select = el('select', { class: 'input', onchange: f.onChange });
      f.groups.forEach(function (g) {
        const optg = el('optgroup', { label: g.label });
        g.options.forEach(function (opt) {
          optg.appendChild(el('option', { value: opt.value, selected: opt.value === f.value }, [opt.label]));
        });
        select.appendChild(optg);
      });
      kids.push(select);
      return el('div', { class: 'field' }, kids);
    }
    return null;
  }

  function calcScreen(vm) {
    const cv = vm.calcView;
    const header = el('div', { class: 'screen-header calc-header' }, [
      el('button', { class: 'icon-btn', onclick: cv.back, 'aria-label': 'Back' }, [icon(ICONS.chevronLeft, { size: 22 })]),
      el('div', { style: 'flex:1;min-width:0' }, [
        el('div', { class: 'section-kicker' }, [cv.categoryLabel]),
        el('h4', { style: 'margin:0;font-size:18px' }, [cv.name])
      ]),
      el('button', { class: 'icon-btn save-btn', onclick: cv.toggleSave, 'aria-label': 'Toggle saved' }, [bookmarkIcon(cv.isSaved, 20)])
    ]);

    const fields = el('div', { class: 'calc-fields' });
    cv.fields.forEach(function (f) { const n = fieldNode(f); if (n) fields.appendChild(n); });

    const body = [header, fields];

    if (cv.showGate) {
      body.push(el('div', { class: 'card caution-gate' }, [
        warningIcon(20, 'muted-icon'),
        el('div', { style: 'flex:1' }, [
          el('div', { class: 'card-title', style: 'font-size:14px' }, ['Cautions to review']),
          el('p', { class: 'card-body' }, [cv.result.caution]),
          el('button', { class: 'btn btn-primary btn-block', onclick: cv.acknowledge }, ['Acknowledge & show result'])
        ])
      ]));
    }

    if (cv.showDetails) {
      body.push(el('div', { class: 'card elev-md result-card' }, [
        el('div', { class: 'card-kicker' }, ['Result']),
        el('div', { class: 'result-value' }, [
          cv.result.value + ' ',
          el('span', { class: 'result-unit' }, [cv.result.unit])
        ]),
        el('div', { class: 'text-muted', style: 'font-size:13px' }, [cv.result.label])
      ]));
      body.push(el('div', { class: 'card', style: 'margin-bottom:12px' }, [
        el('div', { class: 'card-kicker' }, ['Clinical interpretation']),
        el('p', { class: 'card-body', style: 'white-space:pre-line' }, [cv.result.interpretation])
      ]));
      body.push(el('div', { class: 'card', style: 'margin-bottom:12px' }, [
        el('div', { class: 'card-kicker' }, ['Recommended action']),
        el('p', { class: 'card-body' }, [cv.result.action])
      ]));
      if (cv.result.caution) {
        body.push(el('div', { class: 'card caution-card' }, [
          warningIcon(18, 'muted-icon'),
          el('div', {}, [
            el('div', { class: 'caution-kicker' }, ['Caution']),
            el('p', { class: 'card-body', style: 'margin-top:4px' }, [cv.result.caution])
          ])
        ]));
      }
      body.push(el('div', { class: 'text-muted', style: 'font-size:11px;font-style:italic' }, [cv.result.reference]));
    }

    return el('div', { class: 'screen screen-calc' }, body);
  }

  function savedScreen(vm) {
    const kids = [el('h4', { style: 'margin:0 0 14px;font-size:19px' }, ['Saved calculators'])];
    if (vm.hasSavedList) {
      const list = el('div', { class: 'calc-list' });
      vm.savedView.forEach(function (s) {
        list.appendChild(el('div', { class: 'card tap-card row-card', onclick: s.onClick }, [
          el('div', { style: 'flex:1;min-width:0' }, [
            el('div', { class: 'card-title', style: 'font-size:15px' }, [s.name]),
            el('div', { class: 'card-meta' }, [s.categoryLabel])
          ]),
          icon(ICONS.chevronRight, { size: 17, className: 'muted-icon' })
        ]));
      });
      kids.push(list);
    } else {
      kids.push(el('div', { class: 'empty-state' }, [
        icon(ICONS.bookmarkFilled, { size: 28, className: 'muted-icon' }),
        el('div', { class: 'text-muted', style: 'font-size:13px' }, ['No saved calculators yet. Tap the bookmark icon on any tool to save it here.'])
      ]));
    }
    return el('div', { class: 'screen screen-saved' }, kids);
  }

  function patientScreen(vm) {
    const pv = vm.patientView;
    const ageSeg = el('div', { class: 'seg' });
    pv.ageUnitOptions.forEach(function (u) {
      ageSeg.appendChild(el('label', { class: 'seg-opt' }, [
        el('input', { type: 'radio', name: 'age-unit', checked: u.checked, onchange: u.onSelect }),
        el('span', {}, [u.label])
      ]));
    });
    const sexSeg = el('div', { class: 'seg' });
    pv.sexOptions.forEach(function (sx) {
      sexSeg.appendChild(el('label', { class: 'seg-opt', style: 'flex:1;justify-content:center;text-align:center' }, [
        el('input', { type: 'radio', name: 'sex', checked: sx.checked, onchange: sx.onSelect }),
        el('span', {}, [sx.label])
      ]));
    });
    return el('div', { class: 'screen screen-patient' }, [
      el('h4', { style: 'margin:0 0 4px;font-size:19px' }, ['Patient context']),
      el('p', { class: 'text-muted', style: 'font-size:13px;margin:0 0 16px' }, ['Entered once, used to prefill weight-based calculators throughout the app.']),
      el('div', { class: 'field', style: 'margin-bottom:12px' }, [
        el('label', {}, ['Name (optional)']),
        el('input', { class: 'input', value: pv.name, placeholder: 'e.g. initials only', focusKey: 'patient-name', oninput: pv.onName })
      ]),
      el('div', { class: 'field', style: 'margin-bottom:12px' }, [
        el('label', {}, ['Weight (' + pv.weightUnit + ')']),
        el('input', { class: 'input', type: 'number', inputmode: 'decimal', value: pv.weightDisplay, focusKey: 'patient-weight', oninput: pv.onWeight })
      ]),
      el('div', { class: 'field', style: 'margin-bottom:12px' }, [
        el('label', {}, ['Height (cm)']),
        el('input', { class: 'input', type: 'number', inputmode: 'decimal', value: pv.heightDisplay, focusKey: 'patient-height', oninput: pv.onHeight })
      ]),
      el('div', { class: 'field', style: 'margin-bottom:12px' }, [
        el('label', {}, ['Age']),
        el('div', { style: 'display:flex;gap:8px' }, [
          el('input', { class: 'input', type: 'number', inputmode: 'decimal', style: 'flex:1', value: pv.ageDisplay, focusKey: 'patient-age', oninput: pv.onAge }),
          ageSeg
        ])
      ]),
      el('div', { class: 'field', style: 'margin-bottom:20px' }, [
        el('label', {}, ['Sex']),
        sexSeg
      ]),
      el('button', { class: 'btn btn-secondary btn-block', onclick: pv.onClear }, ['Clear patient data'])
    ]);
  }

  function bottomNav(vm) {
    function tab(onclick, iconD, label, color, size) {
      return el('button', { class: 'nav-tab', onclick: onclick, style: 'color:' + color }, [
        icon(iconD, { size: size }),
        el('span', { style: 'font-size:10.5px' }, [label])
      ]);
    }
    return el('div', { class: 'bottom-nav' }, [
      tab(vm.goHome, ICONS.home, 'Home', vm.tabHomeColor, 21),
      tab(vm.goSaved, ICONS.bookmarkFilled, 'Saved', vm.tabSavedColor, 20),
      tab(vm.goPatient, ICONS.user, 'Patient', vm.tabPatientColor, 21)
    ]);
  }

  function render(root, vm) {
    const snap = captureFocus(root);
    const prevScroller = root.querySelector('.screen-scroll');
    const scroll = prevScroller ? prevScroller.scrollTop : 0;
    const prevScreen = prevScroller && prevScroller.firstChild && prevScroller.firstChild.className;
    root.innerHTML = '';
    let content;
    if (vm.isHome) content = homeScreen(vm);
    else if (vm.isCategory) content = categoryScreen(vm);
    else if (vm.isCalc) content = calcScreen(vm);
    else if (vm.isSaved) content = savedScreen(vm);
    else if (vm.isPatient) content = patientScreen(vm);
    const scroller = el('div', { class: 'screen-scroll' }, [content]);
    root.appendChild(scroller);
    root.appendChild(bottomNav(vm));
    if (prevScreen === content.className) scroller.scrollTop = scroll;
    restoreFocus(root, snap);
  }

  window.PediCalcRender = { render: render };
})();
