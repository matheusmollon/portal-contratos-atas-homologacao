(function () {
    'use strict';
    if (window.__utfprAlertasInstalado) return;
    window.__utfprAlertasInstalado = true;
    const APP_URL = 'https://script.google.com/macros/s/AKfycbxfFiUZT306nCce_pik8sA-iyS17vr4IRqewl9cXxlR46aTtjjxKvrfUgzKnh_yiIk4BA/exec';
    const configured = /^https:\/\/script\.google\.com\/macros\/s\/[A-Za-z0-9_-]+\/exec$/.test(APP_URL);
    const style = document.createElement('style'); style.id = 'utfprAlertasStyle'; style.textContent = `
 .header nav .utfpr-alertas-link{display:inline-flex;align-items:center;justify-content:center;min-height:44px;padding:10px 9px;color:#425063;font:600 13px/1.55 Arial,Helvetica,sans-serif;text-decoration:none;white-space:nowrap;border-radius:5px;flex-shrink:0}
 .header nav .utfpr-alertas-link:hover{background:#f6f8fa;color:#181b20}
 .utfpr-alertas-link[aria-disabled="true"],.utfpr-alertas-bell[aria-disabled="true"]{opacity:.5;cursor:default}
 #detail .dialog-top>div:first-child:not(.utfpr-alertas-actions){min-width:0;flex:1}
 #detail .utfpr-alertas-bell{display:inline-flex;align-items:center;justify-content:center;width:44px;height:44px;flex:0 0 44px;border:1px solid #dce1e7;border-radius:6px;background:#fff;color:#425063;text-decoration:none}
 #detail .utfpr-alertas-bell:hover{border-color:#ffcb05;background:#fff9dc;color:#181b20}
 .utfpr-alertas-bell svg{width:21px;height:21px;fill:none;stroke:currentColor;stroke-width:1.8;stroke-linecap:round;stroke-linejoin:round}
 @media(min-width:961px) and (max-width:1399px){.header nav .utfpr-alertas-link{font-size:12px;padding-left:7px;padding-right:7px}}
 @media(max-width:960px){.header nav .utfpr-alertas-link{justify-content:flex-start;width:100%;padding:11px 12px;font-size:14px}#detail .dialog-top.utfpr-alertas-header{display:grid;grid-template-columns:minmax(0,1fr) auto auto;gap:8px}#detail .utfpr-alertas-header>.utfpr-alertas-bell{grid-column:2;grid-row:1}#detail .utfpr-alertas-header>#closeDetail{grid-column:3;grid-row:1}#detail .utfpr-alertas-header>.c6-contract-actions{grid-column:1/-1;grid-row:2}}
 `; document.head.append(style);
    function link(label, cls) { const a = document.createElement('a'); a.className = cls; a.textContent = label; a.target = '_blank'; a.rel = 'noopener noreferrer'; if (configured) { a.href = APP_URL; a.title = 'Gerenciar alertas (abre em nova aba)'; a.setAttribute('aria-label', a.title); } else { a.setAttribute('aria-disabled', 'true'); a.title = 'Alertas temporariamente indisponíveis'; a.setAttribute('aria-label', a.title); } return a; }
    function closeMenu() { if (typeof uiCloseMenu === 'function') uiCloseMenu(); }
    const nav = document.querySelector('#mainNavigation') || document.querySelector('.header nav') || document.querySelector('nav');
    if (nav) {
        const pca = nav.querySelector('[data-view="pca"]'), more = nav.querySelector('.nav-more'), options = nav.querySelector('.nav-more-options');
        let entry = document.getElementById('abrirAlertasUTFPR'); if (entry) entry.remove(); entry = link('Alertas', 'utfpr-alertas-link'); entry.id = 'abrirAlertasUTFPR'; entry.addEventListener('click', closeMenu);
        if (pca && pca.parentElement === nav) nav.insertBefore(entry, pca); else if (more) nav.insertBefore(entry, more); else nav.append(entry);
        if (pca && options) options.insertBefore(pca, options.firstChild);
        
        function syncMore() { if (!more || !options) return; const active = !!options.querySelector('[data-view].active'); if (more.classList.contains('contains-active') !== active) more.classList.toggle('contains-active', active); }
        if (typeof navigate === 'function') { const previous = navigate; navigate = function () { const result = previous.apply(this, arguments); syncMore(); return result; }; }
        syncMore();
    }
    if (typeof detail === 'function') {
        const previous = detail; detail = function (row) {
            const result = previous.apply(this, arguments), dialog = document.getElementById('detail'), head = dialog && dialog.querySelector('.dialog-top'), close = document.getElementById('closeDetail');
            if (!head || !close) return result;
            head.querySelectorAll('.utfpr-alertas-bell').forEach(n => n.remove());
            head.classList.toggle('utfpr-alertas-header', !!row && row.tipo === 'contrato');
            if (row && row.tipo === 'contrato') {
                const bell = link('', 'utfpr-alertas-bell'); bell.setAttribute('aria-label', configured ? 'Gerenciar alertas de contratos (abre em nova aba)' : 'Alertas temporariamente indisponíveis');
                const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg'); svg.setAttribute('viewBox', '0 0 24 24'); svg.setAttribute('aria-hidden', 'true'); svg.setAttribute('focusable', 'false');
                for (const d of ['M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9', 'M10 21h4']) { const path = document.createElementNS('http://www.w3.org/2000/svg', 'path'); path.setAttribute('d', d); svg.append(path); } bell.append(svg); head.insertBefore(bell, close);
            }
            return result;
        };
    }
    
    let target = '', tries = 0;
    function openContract() {
        const match = location.hash.match(/^#contrato=([^&]+)$/); if (!match) return;
        let id; try { id = decodeURIComponent(match[1]); } catch { return; }
        if (target === id) return;
        if (typeof state !== 'undefined' && state.data && Array.isArray(state.data.contratos) && typeof detail === 'function') {
            const row = state.data.contratos.find(c => String(c.id) === id); if (row) { target = id; detail({ ...row, tipo: 'contrato' }); return; }
        }
        if (tries++ < 90) setTimeout(openContract, 1000);
    }
    addEventListener('hashchange', () => { target = ''; tries = 0; openContract(); }); openContract();
})();
