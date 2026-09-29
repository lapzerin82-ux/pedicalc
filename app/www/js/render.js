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
        // Property assignment (not addEventListener) so a reused live node
        // (see reuseFocusedNode) can simply be handed this render's fresh
        // closure without needing to track/remove a previous listener.
        node[k] = v;
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
    close: 'M18 6 6 18 M6 6l12 12',
    install: 'M12 3v12 M7.5 10.5 12 15l4.5-4.5 M5 21h14',
    edit: 'M4 20h4L18.5 9.5a2.1 2.1 0 0 0-3-3L5 17v3z M13.5 8l3 3'
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

  function svgEl(tag, attrs, children) {
    const node = document.createElementNS('http://www.w3.org/2000/svg', tag);
    Object.keys(attrs || {}).forEach(function (k) { node.setAttribute(k, attrs[k]); });
    (children || []).forEach(function (c) { node.appendChild(c); });
    return node;
  }
  function svgText(x, yPos, str, extraAttrs) {
    return svgEl('text', Object.assign({ x: x, y: yPos, 'font-size': '7', fill: '#64748b' }, extraAttrs || {}), [document.createTextNode(str)]);
  }

  // Plots the phototherapy threshold curve for the selected GA/risk-factor
  // combination (same anchors + piecewise-linear interpolation compute()
  // itself uses, so the picture always agrees with the numeric verdict) and
  // marks the patient's own (age, TSB) point on it. Deliberately does not
  // attempt an exchange-transfusion tier — those are separate, higher AAP
  // curves this app doesn't have digitized data for yet.
  // Redraws the full multi-curve AAP nomogram (all gestational-age curves
  // for the selected risk-factor status, alternating solid/dashed from the
  // top curve down, same as the source figure's own convention) rather than
  // just the one curve that applies to this patient — closer to "the chart"
  // itself, with the patient's own curve bolded/highlighted and their point
  // plotted on it.
  function phototherapyChart(d) {
    const W = 320, H = 250, padL = 32, padR = 10, padT = 10, padB = 26;
    const plotW = W - padL - padR, plotH = H - padT - padB;
    const maxHour = 336;
    const gaKeysAsc = Object.keys(d.allCurves).map(Number).sort(function (a, b) { return a - b; });
    const maxVal = Math.max.apply(null, gaKeysAsc.map(function (k) { const arr = d.allCurves[k]; return arr[arr.length - 1][1]; }));
    const maxY = Math.max(20, Math.ceil((maxVal + 2) / 2) * 2);
    const x = function (h) { return padL + (Math.min(h, maxHour) / maxHour) * plotW; };
    const y = function (mg) { return padT + plotH - (Math.max(0, Math.min(mg, maxY)) / maxY) * plotH; };

    const svg = svgEl('svg', { viewBox: '0 0 ' + W + ' ' + H, width: '100%', height: 'auto', style: 'display:block;overflow:visible' });

    for (let mg = 0; mg <= maxY; mg += 2) {
      svg.appendChild(svgEl('line', { x1: padL, x2: W - padR, y1: y(mg), y2: y(mg), stroke: '#e2e8f0', 'stroke-width': 0.5 }));
      svg.appendChild(svgText(padL - 4, y(mg) + 2.5, String(mg), { 'text-anchor': 'end' }));
    }
    for (let h = 0; h <= maxHour; h += 48) {
      svg.appendChild(svgEl('line', { x1: x(h), x2: x(h), y1: padT, y2: padT + plotH, stroke: '#e2e8f0', 'stroke-width': 0.5 }));
      svg.appendChild(svgText(x(h), padT + plotH + 11, (h / 24) + 'd', { 'text-anchor': 'middle' }));
    }
    svg.appendChild(svgEl('line', { x1: padL, x2: W - padR, y1: padT + plotH, y2: padT + plotH, stroke: '#94a3b8', 'stroke-width': 1 }));
    svg.appendChild(svgEl('line', { x1: padL, x2: padL, y1: padT, y2: padT + plotH, stroke: '#94a3b8', 'stroke-width': 1 }));
    svg.appendChild(svgText(W / 2, H - 2, 'Age (days)', { 'text-anchor': 'middle' }));

    const palette = ['#0ea5e9', '#ef4444', '#f59e0b', '#14b8a6', '#a855f7', '#16a34a'];
    const gaKeysDesc = gaKeysAsc.slice().reverse();
    const legendItems = gaKeysDesc.map(function (ga, idx) {
      const arr = d.allCurves[ga];
      const pts = arr.map(function (a) { return x(a[0]) + ',' + y(a[1]); }).join(' ');
      const color = palette[gaKeysAsc.indexOf(ga)];
      const isSelected = ga === d.gaUsed;
      const dashed = idx % 2 === 1;
      svg.appendChild(svgEl('polyline', {
        points: pts, fill: 'none', stroke: color,
        'stroke-width': isSelected ? 3 : 1.3,
        opacity: isSelected ? 1 : 0.4,
        'stroke-dasharray': dashed ? '5,3' : 'none'
      }));
      return { ga: ga, color: color, dashed: dashed, selected: isSelected };
    });

    const px = x(d.ageHours), py = y(d.tsb);
    const dotColor = d.above ? '#dc2626' : '#0d9488';
    svg.appendChild(svgEl('circle', { cx: px, cy: py, r: 5, fill: dotColor, stroke: '#fff', 'stroke-width': 1.5 }));
    svg.appendChild(svgEl('text', { x: px, y: py - 9, 'text-anchor': 'middle', 'font-size': '8', 'font-weight': '700', fill: dotColor }, [document.createTextNode(d.tsb + ' mg/dL')]));

    const legend = el('div', { style: 'display:flex;flex-wrap:wrap;gap:8px 12px;margin-top:8px' });
    legendItems.forEach(function (it) {
      legend.appendChild(el('div', { style: 'display:flex;align-items:center;gap:4px;font-size:10.5px;font-weight:' + (it.selected ? '800' : '500') + ';opacity:' + (it.selected ? '1' : '0.65') }, [
        el('span', { style: 'display:inline-block;width:14px;border-top:' + (it.selected ? '3px' : '2px') + ' ' + (it.dashed ? 'dashed' : 'solid') + ' ' + it.color }, []),
        el('span', {}, [it.ga + ' wk' + (it.selected ? ' (this patient)' : '')])
      ]));
    });

    return el('div', { class: 'card', style: 'margin-bottom:12px' }, [
      el('div', { class: 'card-kicker' }, ['Phototherapy chart — ' + (d.riskKey === 'yes' ? '≥1 neurotoxicity risk factor' : 'no risk factors')]),
      svg,
      legend,
      el('p', { class: 'text-muted', style: 'font-size:11px;margin:8px 0 0' }, [
        'Bold curve = this patient’s gestational age; others shown for context, as in the source chart. Dot = ' + d.tsb + ' mg/dL at ' + d.ageHours + 'h (' + (d.above ? 'at/above' : 'below') + ' this patient’s threshold).'
      ]),
      el('p', { class: 'text-muted', style: 'font-size:11px;margin:2px 0 0;font-style:italic' }, [
        'Exchange-transfusion threshold is a separate, higher curve not yet included in this chart.'
      ])
    ]);
  }

  // ---- focus preservation across full re-renders --------------------------
  //
  // Every render tears down and rebuilds the whole screen from scratch, which
  // is simple but hostile to a focused text input: recreating the DOM node a
  // mobile keyboard/IME is actively composing into is what caused the
  // long-standing "digits land in the wrong order" / "hard to backspace" bug
  // on Android WebView (its InputConnection can desync from a brand-new
  // element's value/selection even when we carefully try to restore the
  // caret with setSelectionRange). The fix is to never recreate the node the
  // user is currently typing in: reuseFocusedNode() below transplants the
  // SAME live <input> into the freshly-built tree (syncing only its
  // non-value attributes and event handlers), so its value and caret are
  // whatever the browser already has natively — nothing to get wrong.
  function captureFocus(root) {
    const a = document.activeElement;
    if (!a || !root.contains(a)) return null;
    const key = a.getAttribute('data-focus-key');
    if (!key) return null;
    let sel = null;
    try { sel = { start: a.selectionStart, end: a.selectionEnd }; } catch (e) {}
    return { key: key, sel: sel, node: a };
  }
  function reuseFocusedNode(newTree, snap) {
    if (!snap || !snap.node) return false;
    const placeholder = newTree.querySelector('[data-focus-key="' + CSS.escape(snap.key) + '"]');
    if (!placeholder || placeholder.tagName !== snap.node.tagName) return false;
    const live = snap.node;
    // Sync attributes other than value (class/placeholder/step/inputmode/...)
    // without ever touching value/selection on the live node.
    Array.prototype.slice.call(live.attributes).forEach(function (attr) {
      if (attr.name === 'value' || attr.name === 'data-focus-key') return;
      if (!placeholder.hasAttribute(attr.name)) live.removeAttribute(attr.name);
    });
    Array.prototype.forEach.call(placeholder.attributes, function (attr) {
      if (attr.name === 'value') return;
      if (live.getAttribute(attr.name) !== attr.value) live.setAttribute(attr.name, attr.value);
    });
    live.oninput = placeholder.oninput;
    live.onchange = placeholder.onchange;
    placeholder.parentNode.replaceChild(live, placeholder);
    return true;
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
    const brandRowKids = [
      el('div', { class: 'brand-mark' }, ['Rx']),
      el('div', { style: 'flex:1;min-width:0' }, [
        el('div', { class: 'nav-brand', style: 'font-size:22px;margin-bottom:2px' }, ['PediCalc']),
        el('p', { class: 'home-disclaimer' }, ['Clinical reference only — verify against institutional protocol.'])
      ])
    ];
    if (vm.installAvailable) {
      brandRowKids.push(el('button', { class: 'install-btn', onclick: vm.onInstall, 'aria-label': 'Install app' }, [
        icon(ICONS.install, { size: 19 })
      ]));
    }
    const banner = el('div', { class: 'home-banner' }, [
      el('div', { class: 'brand-row' }, brandRowKids)
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
        el('div', { class: 'field-row' }, [
          el('input', {
            class: 'input', type: 'text', inputmode: 'decimal', step: f.step, value: f.value,
            focusKey: 'field:' + f.key, oninput: f.onChange
          }),
          el('button', { class: 'field-clear-btn', type: 'button', 'aria-label': 'Clear ' + f.label, onclick: f.onClear }, [icon(ICONS.close, { size: 16 })])
        ])
      ]);
    }
    if (f.isAgeCombo) {
      const ageSeg = el('div', { class: 'seg' });
      f.ageUnitOptions.forEach(function (u) {
        ageSeg.appendChild(el('label', { class: 'seg-opt' }, [
          el('input', { type: 'radio', name: 'agecombo-unit-' + f.key, checked: u.checked, onchange: u.onSelect }),
          el('span', {}, [u.label])
        ]));
      });
      return el('div', { class: 'field' }, [
        el('label', {}, [f.label]),
        el('div', { style: 'display:flex;gap:8px' }, [
          el('input', {
            class: 'input', type: 'text', inputmode: 'decimal', style: 'flex:1', value: f.value,
            focusKey: 'field:' + f.key, oninput: f.onChange
          }),
          el('button', { class: 'field-clear-btn', type: 'button', 'aria-label': 'Clear ' + f.label, onclick: f.onClear }, [icon(ICONS.close, { size: 16 })]),
          ageSeg
        ])
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

    if (cv.showAddCustomMed) {
      body.push(el('button', { class: 'link-btn', onclick: cv.onAddCustomMed, style: 'margin:-8px 0 14px' }, ['+ Add a medication not in this list']));
    }

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
      if (cv.result.chartData) {
        body.push(phototherapyChart(cv.result.chartData));
      }
      if (cv.result.interpretation) {
        body.push(el('div', { class: 'card', style: 'margin-bottom:12px' }, [
          el('div', { class: 'card-kicker' }, ['Clinical interpretation']),
          el('p', { class: 'card-body', style: 'white-space:pre-line' }, [cv.result.interpretation])
        ]));
      }
      if (cv.result.action) {
        body.push(el('div', { class: 'card', style: 'margin-bottom:12px' }, [
          el('div', { class: 'card-kicker' }, ['Recommended action']),
          el('p', { class: 'card-body' }, [cv.result.action])
        ]));
      }
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

  function customMedsScreen(vm) {
    const cmv = vm.customMedsView;
    const header = el('div', { class: 'screen-header calc-header' }, [
      el('button', { class: 'icon-btn', onclick: cmv.back, 'aria-label': 'Back' }, [icon(ICONS.chevronLeft, { size: 22 })]),
      el('div', { style: 'flex:1;min-width:0' }, [
        el('div', { class: 'section-kicker' }, ['Drug dosing']),
        el('h4', { style: 'margin:0;font-size:18px' }, ['Add a medication'])
      ])
    ]);

    const form = el('div', { class: 'card', style: 'margin-bottom:14px' }, [
      el('p', { class: 'text-muted', style: 'font-size:13px;margin:0 0 12px' }, ['Not in the built-in list? Add it here — it will then also show up in the medication search and compute mg/kg/dose (and mL/dose, if the available form parses) just like a built-in drug.']),
      el('div', { class: 'field', style: 'margin-bottom:12px' }, [
        el('label', {}, ['Medication name']),
        el('input', { class: 'input', value: cmv.name, placeholder: 'e.g. Amoxicillin', focusKey: 'custom-med-name', oninput: cmv.onName })
      ]),
      el('div', { class: 'field', style: 'margin-bottom:12px' }, [
        el('label', {}, ['Available form']),
        el('input', { class: 'input', value: cmv.form, placeholder: 'e.g. 125mg/5mL', focusKey: 'custom-med-form', oninput: cmv.onForm })
      ]),
      el('div', { class: 'field', style: 'margin-bottom:12px' }, [
        el('label', {}, ['Dose (mg/kg/dose)']),
        el('input', { class: 'input', type: 'text', inputmode: 'decimal', value: cmv.dose, placeholder: 'e.g. 15', focusKey: 'custom-med-dose', oninput: cmv.onDose })
      ]),
      el('div', { class: 'field', style: 'margin-bottom:12px' }, [
        el('label', {}, ['Frequency']),
        el('input', { class: 'input', value: cmv.frequency, placeholder: 'e.g. every 8 hours', focusKey: 'custom-med-frequency', oninput: cmv.onFrequency })
      ]),
      el('div', { class: 'field', style: 'margin-bottom:14px' }, [
        el('label', {}, ['Route of administration']),
        el('input', { class: 'input', value: cmv.route, placeholder: 'e.g. PO, IV, IM, SC', focusKey: 'custom-med-route', oninput: cmv.onRoute })
      ]),
      el('div', { style: 'display:flex;gap:8px' }, [
        el('button', { class: 'btn btn-primary btn-block', style: 'flex:1', disabled: !cmv.canAdd, onclick: cmv.onAdd }, [cmv.submitLabel]),
        cmv.isEditing ? el('button', { class: 'btn btn-secondary', type: 'button', onclick: cmv.onCancelEdit }, ['Cancel']) : null
      ])
    ]);

    const importInputId = 'custom-med-import-input';
    const backupCard = el('div', { class: 'card', style: 'margin-bottom:14px' }, [
      el('div', { class: 'card-kicker' }, ['Backup']),
      el('p', { class: 'card-body', style: 'margin:2px 0 10px' }, ['These medications are saved on this device. An app update keeps them, but a full uninstall (or a new device) might not, depending on your phone\'s backup settings — export a backup file any time, and import it to restore everything.']),
      el('div', { style: 'display:flex;gap:8px;flex-wrap:wrap' }, [
        el('button', { class: 'btn btn-secondary', type: 'button', onclick: cmv.onExport }, ['Export backup file']),
        el('label', { class: 'btn btn-secondary', for: importInputId, style: 'cursor:pointer' }, [
          'Import backup file',
          el('input', { id: importInputId, type: 'file', accept: 'application/json,.json', style: 'position:absolute;width:1px;height:1px;opacity:0;pointer-events:none', onchange: cmv.onImportFile })
        ])
      ]),
      cmv.importMessage ? el('p', { class: 'card-body', style: 'margin:10px 0 0;font-weight:700;color:' + (cmv.importMessage.type === 'error' ? 'var(--color-caution)' : 'var(--color-accent-700)') }, [cmv.importMessage.text]) : null
    ]);

    const body = [header, form, backupCard];

    if (cmv.hasItems) {
      body.push(el('div', { class: 'card-kicker', style: 'margin-bottom:8px' }, ['Your added medications']));
      const list = el('div', { class: 'calc-list' });
      cmv.items.forEach(function (it) {
        list.appendChild(el('div', { class: 'card' + (it.isBeingEdited ? ' custom-med-editing' : ''), style: 'margin-bottom:10px' }, [
          el('div', { style: 'display:flex;align-items:flex-start;gap:8px' }, [
            el('div', { style: 'flex:1;min-width:0' }, [
              el('div', { class: 'card-title', style: 'font-size:15px' }, [it.name]),
              el('p', { class: 'card-body', style: 'margin-top:4px' }, [it.summary])
            ]),
            el('button', { class: 'field-clear-btn', type: 'button', 'aria-label': 'Edit ' + it.name, onclick: it.onEdit }, [icon(ICONS.edit, { size: 15 })]),
            el('button', { class: 'field-clear-btn', type: 'button', 'aria-label': 'Remove ' + it.name, onclick: it.onRemove }, [icon(ICONS.close, { size: 16 })])
          ])
        ]));
      });
      body.push(list);
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
        el('div', { class: 'field-row' }, [
          el('input', { class: 'input', type: 'text', inputmode: 'decimal', value: pv.weightDisplay, focusKey: 'patient-weight', oninput: pv.onWeight }),
          el('button', { class: 'field-clear-btn', type: 'button', 'aria-label': 'Clear weight', onclick: pv.onClearWeight }, [icon(ICONS.close, { size: 16 })])
        ])
      ]),
      el('div', { class: 'field', style: 'margin-bottom:12px' }, [
        el('label', {}, ['Height (cm)']),
        el('div', { class: 'field-row' }, [
          el('input', { class: 'input', type: 'text', inputmode: 'decimal', value: pv.heightDisplay, focusKey: 'patient-height', oninput: pv.onHeight }),
          el('button', { class: 'field-clear-btn', type: 'button', 'aria-label': 'Clear height', onclick: pv.onClearHeight }, [icon(ICONS.close, { size: 16 })])
        ])
      ]),
      el('div', { class: 'field', style: 'margin-bottom:12px' }, [
        el('label', {}, ['Age']),
        el('div', { style: 'display:flex;gap:8px' }, [
          el('input', { class: 'input', type: 'text', inputmode: 'decimal', style: 'flex:1', value: pv.ageDisplay, focusKey: 'patient-age', oninput: pv.onAge }),
          el('button', { class: 'field-clear-btn', type: 'button', 'aria-label': 'Clear age', onclick: pv.onClearAge }, [icon(ICONS.close, { size: 16 })]),
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
    // Build the new tree BEFORE clearing root, so the live focused node (if
    // any) is still attached/valid when reuseFocusedNode splices it in.
    let content;
    if (vm.isHome) content = homeScreen(vm);
    else if (vm.isCategory) content = categoryScreen(vm);
    else if (vm.isCalc) content = calcScreen(vm);
    else if (vm.isSaved) content = savedScreen(vm);
    else if (vm.isPatient) content = patientScreen(vm);
    else if (vm.isCustomMeds) content = customMedsScreen(vm);
    const scroller = el('div', { class: 'screen-scroll' }, [content]);
    const reused = reuseFocusedNode(scroller, snap);
    root.innerHTML = '';
    root.appendChild(scroller);
    root.appendChild(bottomNav(vm));
    if (prevScreen === content.className) scroller.scrollTop = scroll;
    if (reused) snap.node.focus();
    else restoreFocus(root, snap);
  }

  window.PediCalcRender = { render: render };
})();
