'use strict';
let c6Active = null;
const c6Dialog = el('dialog', undefined, 'c6-dialog'); c6Dialog.id = 'contractReport'; c6Dialog.setAttribute('aria-labelledby', 'c6-title'); document.body.append(c6Dialog);
const c6Text = v => v === null || v === undefined || String(v).trim() === '' ? 'Não informado pela fonte' : String(v);
function c6Exercise(n) { const m = String(n.numero || '').match(/^(\d{4})NE/); return m ? m[1] : String(n.data_emissao || '').slice(0, 4); }
function c6Id(n) { return String(n.id); }
function c6Competencias(f) { return c5Competencias(f).map(x => x.slice(3) + '-' + x.slice(0, 2)); }
function c6Current(s) { return c6Active === s && !s.api.controller.signal.aborted; }
function c6Status(s, message, error = false) { s.status.textContent = message; s.status.className = error ? 'c6-feedback c6-error' : 'c6-feedback'; s.status.setAttribute('role', error ? 'alert' : 'status'); }
function c6Button(text, fn, cls = 'secondary') { const b = el('button', text, cls); b.type = 'button'; b.onclick = fn; return b; }
function c6Field(parent, id, label, type, options) { const box = el('div', undefined, 'field'), lab = el('label', label), input = el(options ? 'select' : 'input'); input.id = id; lab.htmlFor = id; if (options) for (const [v, t] of options) input.add(new Option(t, v)); else input.type = type; box.append(lab, input); parent.append(box); return input; }
function c6Check(parent, label, checked) { const box = el('label', undefined, 'c6-check'), input = el('input'); input.type = 'checkbox'; input.checked = checked; box.append(input, document.createTextNode(label)); parent.append(box); return input; }
function c6Filtered(s) {
    const unit = s.unit.value, year = s.year.value, month = s.month.value;
    const ns = s.empenhos.filter(n => (!unit || String(n.unidade_gestora) === unit) && (!year || c6Exercise(n) === year));
    const fs = s.faturas.filter(f => (!unit || c5InvoiceUnit(f, s.empenhos).code === unit) && (!month || c6Competencias(f).includes(month)));
    return { ns, fs };
}
function c6Chosen(s) { const { ns, fs } = c6Filtered(s); return { ns: ns.filter(n => s.selectedE.has(c6Id(n))), fs: fs.filter(f => s.selectedF.has(c6Id(f))) }; }
function c6ResetSelection(s) { const { ns, fs } = c6Filtered(s); s.selectedE = new Set(ns.map(c6Id)); s.selectedF = new Set(fs.map(c6Id)); c6Draw(s); }
function c6Draw(s) {
    const { ns, fs } = c6Filtered(s), isF = s.tab === 'f', query = norm(s.search.value.trim()), raw = isF ? fs : ns, set = isF ? s.selectedF : s.selectedE;
    const matches = raw.filter(r => !query || norm([r.numero, r.situacao, r.credor, r.infcomplementar, r.informacao_complementar, ...(r.dados_empenho || []).map(x => x.numero_empenho)].join(' ')).includes(query));
    const pages = Math.max(1, Math.ceil(matches.length / 10)); s.page = Math.max(1, Math.min(s.page, pages)); s.list.replaceChildren();
    for (const r of matches.slice((s.page - 1) * 10, s.page * 10)) {
        const label = el('label', undefined, 'c6-record'), check = el('input'), desc = el('span'), val = el('strong'); check.type = 'checkbox'; check.checked = set.has(c6Id(r)); check.onchange = () => { check.checked ? set.add(c6Id(r)) : set.delete(c6Id(r)); c6Draw(s); };
        desc.append(el('strong', isF ? (r.tipo_instrumento_cobranca || 'Fatura') + ' nº ' + c6Text(r.numero) : c6Text(r.numero)), el('small', isF ? c5Competencias(r).join(', ') + ' · ' + c6Text(r.situacao) + ' · ' + c5Unit(c5InvoiceUnit(r, s.empenhos).code) : c5Unit(r.unidade_gestora) + ' · Emissão ' + c5Date(r.data_emissao)));
        val.textContent = isF ? c5Money(r.valor) : 'Empenhado: ' + c5Money(r.empenhado); label.append(check, desc, val); s.list.append(label);
    }
    if (!matches.length) s.list.append(el('p', 'Nenhum registro para os filtros e a busca selecionados.', 'hint'));
    s.all.checked = matches.length > 0 && matches.every(r => set.has(c6Id(r))); s.all.indeterminate = matches.some(r => set.has(c6Id(r))) && !s.all.checked; s.all.disabled = !matches.length;
    s.all.onchange = () => { for (const r of matches) s.all.checked ? set.add(c6Id(r)) : set.delete(c6Id(r)); c6Draw(s); };
    s.pageLabel.textContent = 'Página ' + s.page + ' de ' + pages + ' · ' + matches.length + ' registro(s)'; s.prev.disabled = s.page === 1; s.next.disabled = s.page === pages; s.pager.hidden = matches.length <= 10;
    const chosen = c6Chosen(s), activeF = s.sections.faturas.checked, activeE = s.sections.empenhos.checked || s.sections.pagamentos.checked;
    s.count.textContent = (activeF ? chosen.fs.length : 0) + ' fatura(s) · ' + (activeE ? chosen.ns.length : 0) + ' empenho(s)' + (s.sections.pagamentos.checked ? ' · Ordens bancárias incluídas' : '');
    s.total.textContent = activeF ? 'Bruto das faturas selecionadas: ' + c5Money(chosen.fs.reduce((a, f) => a + (c5Number(f.valor) || 0), 0)) : '';
    s.tabF.setAttribute('aria-pressed', String(isF)); s.tabE.setAttribute('aria-pressed', String(!isF)); s.tabF.classList.toggle('active', isF); s.tabE.classList.toggle('active', !isF);
}
function c6Abort(s) { s?.api.controller.abort(); s?.run?.abort(); }
c6Dialog.addEventListener('close', () => { if (c6Dialog.open) return; const s = c6Active; c6Abort(s); c6Active = null; if (s?.launcher.isConnected) s.launcher.focus({ preventScroll: true }); });
c6Dialog.addEventListener('cancel', event => { if (c6Active?.busy) { event.preventDefault(); c6Active.run?.abort(); c6Status(c6Active, 'Cancelando a preparação…'); } });
async function c6Load(s) {
    s.config.hidden = true; s.generate.disabled = true; s.retry.hidden = true; c6Status(s, 'Consultando empenhos e faturas na fonte oficial…'); s.status.classList.add('query-loading');
    try {
        const results = await Promise.allSettled([c5Get(s.api, 'empenhos'), c5Get(s.api, 'faturas')]); if (!c6Current(s)) return;
        const failed = []; for (const [i, key] of ['empenhos', 'faturas'].entries()) if (results[i].status === 'fulfilled') { s[key] = results[i].value.data; s.stamps.set(key, results[i].value.consultadoEm); } else failed.push(key);
        if (failed.length) { s.retry.hidden = false; c6Status(s, 'Não foi possível carregar ' + failed.join(' e ') + '. Tente novamente. Nenhum relatório foi emitido.', true); return; }
        const ugValues = [...new Set([...s.empenhos.map(n => String(n.unidade_gestora || '')), ...s.faturas.map(f => c5InvoiceUnit(f, s.empenhos).code)].filter(Boolean))].sort();
        s.unit.replaceChildren(new Option('Todas as unidades', '')); for (const u of ugValues) s.unit.add(new Option(u === 'unknown' ? 'UG não identificada / múltiplas UGs' : c5Unit(u), u)); if (ugValues.includes(String(s.row.uasg))) s.unit.value = String(s.row.uasg);
        const years = [...new Set(s.empenhos.map(c6Exercise).filter(y => /^\d{4}$/.test(y)))].sort().reverse(); s.year.replaceChildren(new Option('Todos os exercícios', '')); for (const y of years) s.year.add(new Option(y, y));
        s.config.hidden = false; s.generate.disabled = false; c6ResetSelection(s); c6Status(s, 'Dados carregados. Defina o recorte e escolha os registros para o relatório.');
    } catch (error) { if (c6Current(s)) { c6Status(s, 'Não foi possível preparar a seleção. Tente novamente.', true); s.retry.hidden = false; } }
}
function c6Open(row, source, launcher) {
    if (!source || source.controller.signal.aborted) return; c6Abort(c6Active);
    const api = { id: source.id, controller: new AbortController(), pending: new Map() }; const s = { row: { ...row }, api, launcher, empenhos: [], faturas: [], selectedE: new Set(), selectedF: new Set(), tab: 'f', page: 1, stamps: new Map(), busy: false }; c6Active = s;
    c6Dialog.replaceChildren(); const head = el('div', undefined, 'c6-top'), titles = el('div'); const title = el('h2', 'Gerar relatório gerencial'); title.id = 'c6-title'; titles.append(el('span', 'RELATÓRIO DO CONTRATO', 'eyebrow'), title, el('p', portalRecordTitle(row) + ' · ' + c6Text(row.fornecedor), 'hint')); s.close = c6Button('Fechar ×', () => c6Dialog.close()); head.append(titles, s.close); c6Dialog.append(head);
    s.status = el('p', undefined, 'c6-feedback'); s.status.setAttribute('aria-live', 'polite'); s.retry = c6Button('Tentar novamente', () => c6Load(s)); s.retry.hidden = true; c6Dialog.append(s.status, s.retry);
    s.config = el('div', undefined, 'c6-config'); s.config.hidden = true; const filters = el('section', undefined, 'c6-section'), grid = el('div', undefined, 'c6-grid'); filters.append(el('h3', '1. Período e unidade'), grid);
    s.unit = c6Field(grid, 'c6-unit', 'Unidade gestora', null, [['', 'Todas as unidades']]); s.year = c6Field(grid, 'c6-year', 'Exercício dos empenhos', null, [['', 'Todos os exercícios']]); s.month = c6Field(grid, 'c6-month', 'Competência das faturas', 'month'); filters.append(el('p', 'A competência filtra apenas as faturas. O exercício filtra os empenhos. Campos em branco incluem todo o período. As ordens bancárias abrangem todas as datas disponíveis dos empenhos selecionados.', 'hint')); const clearFilters = c6Button('Limpar filtros', () => { s.unit.value = ''; s.year.value = ''; s.month.value = ''; s.search.value = ''; s.page = 1; c6ResetSelection(s); }); filters.append(clearFilters);
    const sections = el('section', undefined, 'c6-section'), checks = el('div', undefined, 'c6-checks'); sections.append(el('h3', '2. Informações do relatório'), checks); s.sections = { resumo: c6Check(checks, 'Resumo do contrato', true), empenhos: c6Check(checks, 'Empenhos', true), faturas: c6Check(checks, 'Faturas', true), pagamentos: c6Check(checks, 'Ordens bancárias', false) }; sections.append(el('p', 'As ordens bancárias só serão consultadas ao preparar o relatório. Selecione os empenhos na lista abaixo.', 'hint'));
    const records = el('section', undefined, 'c6-section'), tabs = el('div', undefined, 'c6-tabs'), toolbar = el('div', undefined, 'c6-toolbar'); records.append(el('h3', '3. Selecionar registros'), tabs, toolbar);
    s.tabF = c6Button('Faturas', () => { s.tab = 'f'; s.page = 1; c6Draw(s); }); s.tabE = c6Button('Empenhos', () => { s.tab = 'e'; s.page = 1; c6Draw(s); }); tabs.append(s.tabF, s.tabE);
    s.all = c6Check(toolbar, 'Selecionar todos os resultados da busca', true); s.search = c6Field(toolbar, 'c6-search', 'Buscar registro', 'search'); s.search.placeholder = 'Número, situação ou empenho'; s.search.maxLength = 160; s.search.oninput = () => { s.page = 1; c6Draw(s); };
    s.list = el('div', undefined, 'c6-records'); s.pager = el('div', undefined, 'pagination'); s.pageLabel = el('span'); s.prev = c6Button('← Anterior', () => { s.page--; c6Draw(s); }); s.next = c6Button('Próxima →', () => { s.page++; c6Draw(s); }); s.pager.append(s.prev, s.pageLabel, s.next); records.append(s.list, s.pager, el('p', 'A busca apenas reduz a lista visível: registros já marcados permanecem selecionados. Confira o total no rodapé.', 'hint'), c6Button('Limpar seleção desta lista', () => { (s.tab === 'f' ? s.selectedF : s.selectedE).clear(); c6Draw(s); }));
    s.config.append(filters, sections, records); s.preview = el('div', undefined, 'c6-preview'); s.preview.hidden = true; c6Dialog.append(s.config, s.preview);
    const foot = el('div', undefined, 'c6-footer'), counts = el('div'), buttons = el('div', undefined, 'c6-actions'); s.count = el('strong'); s.total = el('small'); counts.append(s.count, s.total); s.cancel = c6Button('Cancelar', () => { if (s.busy) s.run?.abort(); else c6Dialog.close(); }); s.back = c6Button('Voltar à seleção', () => { s.preview.hidden = true; s.config.hidden = false; s.back.hidden = true; s.print.hidden = true; s.generate.hidden = false; c6Status(s, 'Ajuste os filtros ou a seleção e prepare novamente.'); }); s.back.hidden = true; s.print = c6Button('Imprimir / Salvar PDF', () => c6Print(s), 'primary'); s.print.hidden = true; s.generate = c6Button('Preparar relatório', () => c6Generate(s), 'primary'); buttons.append(s.cancel, s.back, s.generate, s.print); foot.append(counts, buttons); c6Dialog.append(foot);
    for (const input of [s.unit, s.year, s.month]) input.onchange = () => { s.page = 1; c6ResetSelection(s); }; for (const input of Object.values(s.sections)) input.onchange = () => c6Draw(s);
    c6Dialog.showModal(); c6Load(s);
}
function c6Values(parent, values) { const dl = el('dl', undefined, 'c6-values'); for (const [label, value] of values) { const wrap = el('div'); wrap.append(el('dt', label), el('dd', c6Text(value))); dl.append(wrap); } parent.append(dl); }
function c6Table(parent, headers, rows) { const table = el('table'), thead = el('thead'), tr = el('tr'), tbody = el('tbody'); for (const h of headers) { const th = el('th', h); th.scope = 'col'; tr.append(th); } thead.append(tr); for (const row of rows) { const r = el('tr'); for (const v of row) r.append(el('td', c6Text(v))); tbody.append(r); } table.append(thead, tbody); const wrap = el('div', undefined, 'c6-table-wrap'); wrap.append(table); parent.append(wrap); }
function c6Article(parent, title) { const a = el('article', undefined, 'c6-report-card'); a.append(el('h3', title)); parent.append(a); return a; }
function c6RenderReport(s, chosen, sections, payments) {
    const report = el('article', undefined, 'c6-report'), brand = el('div', undefined, 'c6-report-brand'), logo = document.querySelector('header svg.utfpr-logo') || document.querySelector('header svg'); if (logo) { const clone = logo.cloneNode(true); clone.removeAttribute('id'); brand.append(clone); } brand.append(el('span', 'PORTAL DA TRANSPARÊNCIA · HOMOLOGAÇÃO')); report.append(brand, el('h1', 'Relatório gerencial do contrato'), el('p', portalRecordTitle(s.row) + ' · ' + c6Text(s.row.fornecedor)));
    c6Values(report, [['Unidade do recorte', s.unit.value ? c5Unit(s.unit.value) : 'Todas'], ['Exercício dos empenhos', s.year.value || 'Todos'], ['Competência das faturas', s.month.value ? s.month.value.split('-').reverse().join('/') : 'Todas'], ['Seções incluídas', Object.entries({ resumo: 'Resumo', empenhos: 'Empenhos', faturas: 'Faturas', pagamentos: 'Ordens bancárias' }).filter(([k]) => sections[k]).map(([, v]) => v).join(', ')], ['Emitido em', new Date().toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' })]]);
    report.append(el('p', 'As rubricas dos empenhos são a posição retornada pela fonte, não uma posição histórica da competência selecionada. Valores negativos foram preservados. Valores líquidos e ordens emitidas não comprovam, isoladamente, crédito bancário. Quando uma fatura abrange várias competências, o valor bruto exibido é o valor integral da fatura, sem rateio automático. A seleção de faturas e de empenhos é independente; os vínculos oficiais aparecem no detalhamento.', 'c6-report-notice'));
    if (sections.resumo) {
        report.append(el('h2', 'Resumo do contrato')); c6Values(report, [['Objeto', s.row.objeto], ['Fornecedor', s.row.fornecedor], ['CNPJ/CPF', s.row.documento], ['Processo', s.row.processo], ['Vigência', c5Date(s.row.inicio) + ' a ' + c5Date(s.row.fim)], ['Valor global no portal', c5Money(s.row.valor)], ['Unidade do contrato', c5Unit(s.row.uasg)], ['Atualização do resumo', state.data?.atualizadoEm ? dateTime(state.data.atualizadoEm) : 'Não informada']]);
        if (sections.faturas) { const sum = chosen.fs.reduce((a, f) => a + (c5Number(f.valor) || 0), 0), missing = chosen.fs.filter(f => c5Number(f.valor) === null).length; report.append(el('p', 'Faturas selecionadas: ' + chosen.fs.length + ' · Soma dos valores brutos informados: ' + c5Money(sum) + (missing ? ' · ' + missing + ' fatura(s) sem valor informado; não incluídas na soma.' : ''))); }
    }
    if (sections.empenhos) { report.append(el('h2', 'Empenhos selecionados')); for (const n of chosen.ns) { const a = c6Article(report, c6Text(n.numero)); c6Values(a, [['UG emitente', c5Unit(n.unidade_gestora)], ['Emissão', c5Date(n.data_emissao)], ['Credor', n.credor], ['Gestão', n.gestao], ['Fonte de recursos', n.fonte_recurso], ['Natureza da despesa', n.naturezadespesa], ['Plano interno', n.planointerno]]); c6Table(a, ['Empenhado', 'A liquidar', 'Liquidado', 'Pago'], [[c5Money(n.empenhado), c5Money(n.aliquidar), c5Money(n.liquidado), c5Money(n.pago)]]); c6Table(a, ['Restos a pagar: inscrito', 'A liquidar', 'Liquidado', 'Pago'], [[c5Money(n.rpinscrito), c5Money(n.rpaliquidar), c5Money(n.rpliquidado), c5Money(n.rppago)]]); if (n.informacao_complementar) a.append(el('p', n.informacao_complementar)); } if (!chosen.ns.length) report.append(el('p', 'Nenhum empenho selecionado.')); }
    if (sections.faturas) {
        report.append(el('h2', 'Faturas selecionadas')); for (const f of chosen.fs) {
            const a = c6Article(report, (f.tipo_instrumento_cobranca || 'Fatura') + ' nº ' + c6Text(f.numero)); c6Values(a, [['Competência(s)', c5Competencias(f).join(', ') || null], ['UG', c5Unit(c5InvoiceUnit(f, s.empenhos).code)], ['Situação na fonte', f.situacao], ['Emissão', c5Date(f.emissao)], ['Protocolo', c5Date(f.protocolo)], ['Vencimento', c5Date(f.vencimento)], ['Ateste', c5Date(f.ateste)], ['Liquidação', c5Date(f.data_liquidacao)], ['Documento de liquidação', f.sfadrao_id], ['Valor bruto', c5Money(f.valor)], ['Glosa', c5Money(f.glosa)], ['Valor líquido registrado', c5Money(f.valorliquido)], ['Processo', f.processo], ['Nota cancelada', f.nota_cancelada]]);
            if (f.infcomplementar) a.append(el('p', f.infcomplementar)); const refs = f.dados_empenho || []; if (refs.length) c6Table(a, ['Empenho vinculado', 'Valor na fatura', 'Subelemento'], refs.map(x => [x.numero_empenho, c5Money(x.valor_empenho), x.subelemento])); const comps = f.dados_referencia || []; if (comps.length) c6Table(a, ['Competência', 'Valor de referência'], comps.map(x => [String(x.mesref).padStart(2, '0') + '/' + x.anoref, c5Money(x.valorref)])); const items = f.dados_item_faturado || []; if (items.length) c6Table(a, ['Item (ID Compras)', 'Quantidade faturada', 'Valor unitário', 'Valor total'], items.map(x => [x.id_item_contrato, c5Qty(x.quantidade_faturado), c5Money(x.valorunitario_faturado), c5Money(x.valortotal_faturado)]));
        } if (!chosen.fs.length) report.append(el('p', 'Nenhuma fatura selecionada.'));
    }
    if (sections.pagamentos) {
        report.append(el('h2', 'Ordens bancárias dos empenhos selecionados'), el('p', 'Todas as datas disponíveis, da emissão mais recente à mais antiga. Uma OB pode abranger vários empenhos e faturas; o valor integral não foi rateado. A presença da OB não comprova pagamento de uma fatura específica.', 'c6-report-notice'));
        const seen = new Map(); for (const entry of payments) { if (entry.error) { const a = c6Article(report, 'Consulta indisponível — ' + entry.item.numero); a.append(el('p', 'Não foi possível consultar as ordens bancárias deste empenho. Não interprete como ausência de pagamentos.', 'c6-report-error')); continue; } if (!entry.result.data.length) report.append(el('p', entry.item.numero + ': nenhuma ordem bancária retornada pela fonte na consulta.')); for (const ob of entry.result.data) { const key = [ob.ug, ob.gestao, ob.numero].join('/'); if (!seen.has(key)) seen.set(key, { ob, selected: [] }); seen.get(key).selected.push(entry.item.numero); } }
        const obs = [...seen.values()].sort((a, b) => String(b.ob.emissao || '').localeCompare(String(a.ob.emissao || '')) || String(b.ob.numero || '').localeCompare(String(a.ob.numero || '')));
        report.append(el('p', obs.length + ' ordem(ns) bancária(s) distinta(s) retornada(s). Ordens comuns a mais de um empenho selecionado aparecem uma única vez.'));
        for (const { ob, selected } of obs) { const a = c6Article(report, c6Text(ob.numero) + ' · ' + c5Date(ob.emissao)); c6Values(a, [['Valor integral da OB', c5Money(ob.valor, 'sta')], ['UG emitente', c5Unit(ob.ug)], ['Gestão', ob.gestao], ['Favorecido', ob.favorecidonome], ['Documento de origem', ob.documentoorigem], ['Processo', ob.processo], ['Empenhos selecionados com vínculo', selected.join(', ')], ['Todos os empenhos na fonte', (ob.empenhos || []).join(' · ')], ['Cancelamento (código da fonte)', ob.cancelamentoob], ['OB de cancelamento', ob.numeroobcancelamento]]); a.append(el('h4', 'Descrição na fonte'), el('p', c6Text(ob.observacao))); if ((ob.empenhos || []).length > 1) a.append(el('p', 'Ordem compartilhada: rateio por empenho não informado neste retorno.', 'c6-report-notice')); if (ob.cancelamentoob != null && String(ob.cancelamentoob) !== '0') a.append(el('p', 'Há indicação de cancelamento na fonte. Confira o documento oficial.', 'c6-report-error')); }
    }
    report.append(el('h2', 'Fontes e consultas')); for (const [key, stamp] of s.stamps) report.append(el('p', (key === 'empenhos' ? 'Empenhos' : key === 'faturas' ? 'Faturas' : key) + ' · ' + dateTime(stamp), 'c6-source')); for (const entry of payments) if (entry.result) report.append(el('p', 'Ordens bancárias de ' + entry.item.numero + ' · ' + dateTime(entry.result.consultadoEm), 'c6-source'));
    const source = el('a', 'Consultar o contrato na fonte oficial'); source.href = linkTransparenciaContrato(s.row.id); source.target = '_blank'; source.rel = 'noopener noreferrer'; report.append(source, el('footer', 'UTFPR · Campus Cornélio Procópio · Homologação | Relatório emitido pelo portal. Dados: Contratos.gov.br e STA, consultados por serviço de leitura.')); return report;
}
async function c6Generate(s) {
    if (s.busy || !c6Current(s)) return; const sections = Object.fromEntries(Object.entries(s.sections).map(([k, v]) => [k, v.checked])), chosen = c6Chosen(s);
    if (!Object.values(sections).some(Boolean)) { c6Status(s, 'Selecione pelo menos uma seção do relatório.', true); s.status.scrollIntoView({ block: 'nearest' }); return; }
    if ((sections.empenhos || sections.pagamentos) && !chosen.ns.length) { c6Status(s, 'Selecione pelo menos um empenho na lista “Empenhos”, ou desmarque as seções Empenhos e Ordens bancárias.', true); return; }
    if (sections.faturas && !chosen.fs.length) { c6Status(s, 'Selecione pelo menos uma fatura, ou desmarque a seção Faturas.', true); return; }
    s.busy = true; s.run = new AbortController(); s.config.inert = true; s.generate.disabled = true; s.close.disabled = true; s.cancel.textContent = 'Cancelar preparação'; const payments = []; let complete = false;
    try {
        if (sections.pagamentos) {
            for (const [i, item] of chosen.ns.entries()) {
                if (s.run.signal.aborted) throw new DOMException('Cancelado', 'AbortError'); c6Status(s, 'Consultando ordens bancárias: ' + (i + 1) + ' de ' + chosen.ns.length + ' empenho(s)…'); s.status.classList.add('query-loading');
                // Sessão própria para permitir cancelamento sem interromper as abas da central.
                const paySession = { id: s.api.id, controller: s.run, pending: s.api.pending }; try { const result = await c5Get(paySession, 'empenhos/' + encodeURIComponent(item.id) + '/pagamentos'); payments.push({ item, result }); } catch (error) { if (s.run.signal.aborted) throw error; payments.push({ item, error: true }); if (error.message === 'HTTP 429') { for (const pending of chosen.ns.slice(i + 1)) payments.push({ item: pending, error: true }); break; } }
            }
        }
        if (!c6Current(s) || s.run.signal.aborted) throw new DOMException('Cancelado', 'AbortError');
        const report = c6RenderReport(s, chosen, sections, payments); s.preview.replaceChildren(report); s.report = report; s.preview.hidden = false; s.config.hidden = true; s.back.hidden = false; s.print.hidden = false; s.generate.hidden = true; const failures = payments.filter(x => x.error).length; c6Status(s, failures ? 'Relatório preparado com ' + failures + ' consulta(s) de ordens bancárias indisponível(is). As pendências estão identificadas no documento. Volte à seleção para tentar novamente.' : 'Relatório preparado. Revise a prévia antes de imprimir ou salvar em PDF.', !!failures); complete = true; c6Dialog.scrollTop = 0;
    } catch (error) { if (c6Current(s)) c6Status(s, s.run.signal.aborted ? 'Preparação cancelada. A seleção foi mantida.' : 'Não foi possível preparar o relatório. Tente novamente.', !s.run.signal.aborted); }
    finally { s.busy = false; s.config.inert = false; s.generate.disabled = false; s.close.disabled = false; s.cancel.textContent = 'Cancelar'; if (!complete) s.preview.hidden = true; }
}
function c6Print(s) {
    if (!s.report || s.busy) return; const frame = document.createElement('iframe'); frame.title = 'Impressão do relatório gerencial'; frame.className = 'c6-print-frame';
    const doc = document.implementation.createHTMLDocument('Relatório gerencial - ' + c6Text(s.row.numero)), style = document.createElement('style'); style.textContent = C6_PRINT_CSS; doc.head.append(style); doc.documentElement.lang = 'pt-BR'; doc.body.append(s.report.cloneNode(true));
    frame.onload = () => { try { frame.contentWindow.addEventListener('afterprint', () => frame.remove(), { once: true }); frame.contentWindow.focus(); frame.contentWindow.print(); } catch { c6Status(s, 'Não foi possível abrir a impressão. Tente novamente pelo navegador.', true); } }; frame.srcdoc = '<!doctype html>' + doc.documentElement.outerHTML; c6Dialog.append(frame); setTimeout(() => frame.remove(), 300000);
}
const C6_PRINT_CSS = `@page{size:A4;margin:16mm}*{box-sizing:border-box;-webkit-print-color-adjust:exact;print-color-adjust:exact}body{margin:0;color:#242424;background:white;font:10pt/1.5 Arial,sans-serif}h1{font-size:22pt}h2{font-size:15pt;margin-top:22pt;break-after:avoid}h3{font-size:12pt;break-after:avoid}p,dd,td{overflow-wrap:anywhere}.c6-report-brand{display:flex;align-items:center;justify-content:space-between;gap:24px;border-bottom:3px solid #ffcb05;padding-bottom:15px}.c6-report-brand svg{width:140px;height:56px;flex:none}.utfpr-ink{fill:#171717}.utfpr-gold{fill:#ffcb05}.c6-report-brand span{font-size:8pt}.c6-values{display:grid;grid-template-columns:1fr 1fr;gap:10px 20px}.c6-values>div{break-inside:avoid;min-width:0}dt{font-weight:bold;font-size:9pt}dd{margin:3px 0 0;color:#444}.c6-report-card{border:1px solid #ddd;padding:12px;margin:16px 0}.c6-report-card h3{margin:0 0 12px}table{border-collapse:collapse;width:100%;font-size:9pt;margin:14px 0;table-layout:fixed}thead{display:table-header-group}tr{break-inside:avoid}th{text-align:left;background:#eee;border-bottom:2px solid #ffcb05}td,th{padding:8px;vertical-align:top;border-bottom:1px solid #ddd}td{white-space:normal}.c6-report-notice{padding:10px;background:#fff9e3;border-left:3px solid #d3b64e}.c6-report-error{padding:10px;background:#fff1f0;border-left:3px solid #b42c27}.c6-source,footer{font-size:8pt;color:#555}footer{border-top:1px solid #ddd;margin-top:20px;padding-top:12px}a{color:#333}.c6-table-wrap{overflow:visible}`;
/* O cabeçalho do modal é reaproveitado: descarte ações da abertura anterior. */
function c6RemoveLaunchers() {
    const head = $('detail')?.querySelector('.dialog-top');
    if (head) head.querySelectorAll('.c6-contract-actions,.c6-launch').forEach(node => node.remove());
}
const c6InstallOriginal = c5Install;
c5Install = function (row) {
    c6RemoveLaunchers(); c6InstallOriginal(row);
    const session = c5Session;
    const launcher = c6Button('Gerar relatório', () => c6Open(row, session, launcher), 'primary c6-launch');
    launcher.setAttribute('aria-haspopup', 'dialog'); launcher.setAttribute('aria-controls', 'contractReport');
    const actions = el('div', undefined, 'c6-contract-actions'); actions.append(launcher);
    $('detail').querySelector('.dialog-top').insertBefore(actions, $('closeDetail'));
};
// Também remove a ação ao trocar de contrato para ata ou outra visualização.
const c6OriginalDetail = detail;
detail = function (row) { c6RemoveLaunchers(); return c6OriginalDetail(row); };
$('detail').addEventListener('close', () => { if (!$('detail').open) c6RemoveLaunchers(); });
