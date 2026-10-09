
'use strict';
const $ = id => document.getElementById(id);
const requestedView = new URLSearchParams(location.search).get('view');
const initialView = ['inicio', 'contratos', 'atas', 'pca', 'atas-externas', 'oportunidades', 'orientacoes'].includes(requestedView) ? requestedView : (document.body.dataset.tela || 'inicio');
const state = { data: null, view: initialView, page: 1, size: 12, items: new Map(), busy: false };
const externalState = { page: 1, size: 25, total: 0, busy: false, query: '', cache: new Map(), controller: null, loaded: false };
const opportunityState = { page: 1, size: 12, busy: false, loaded: false, items: [], controller: null, failures: 0 };
const pcaState = { busy: false, controller: null, year: null, sequencial: null, categories: [], items: new Map(), pages: new Map(), filters: new Map() };
const OPPORTUNITY_UASGS = ['153176', '150148', '150149'];
const OPPORTUNITY_MODALITIES = [8, 6, 4];
const UTFPR_CNPJ = '75101873000190';
const hojeSP = () => { const parts = new Intl.DateTimeFormat('en-US', { timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date()); const get = k => parts.find(p => p.type === k).value; return get('year') + '-' + get('month') + '-' + get('day'); };
function situacaoLocal(row, hoje) { if (row.excluido === true || /cancelad|inativ|rescind|suspens/.test(norm(row.situacaoOrigem))) return 'Inativo'; if (!/^\d{4}-\d{2}-\d{2}$/.test(row.inicio || '') || !/^\d{4}-\d{2}-\d{2}$/.test(row.fim || '') || row.inicio > row.fim) return 'Não confirmada'; if (row.inicio > hoje) return 'A iniciar'; if (row.fim < hoje) return 'Encerrado'; return 'Vigente'; }
const norm = v => String(v ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
const money = v => v === null || v === undefined || v === '' ? 'Não informado' : Number(v).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const qty = v => v === null || v === undefined || v === '' ? 'Não informada' : Number(v).toLocaleString('pt-BR');
const date = v => /^\d{4}-\d{2}-\d{2}$/.test(v || '') ? v.slice(8, 10) + '/' + v.slice(5, 7) + '/' + v.slice(0, 4) : 'Não informada';
const dateTime = v => { const d = new Date(v); return v && Number.isFinite(d.getTime()) ? d.toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' }) : 'Não informada'; };
const yesNo = v => v === true ? 'Sim' : v === false ? 'Não' : 'Não informado';
function el(tag, text, cls) { const e = document.createElement(tag); if (text !== undefined) e.textContent = text; if (cls) e.className = cls; return e; }
function note(text, type = '') { $('notice').textContent = text; $('notice').className = 'notice ' + type; }
function link(parent, url, label) { if (!/^https:\/\/(?:pncp\.gov\.br|(?:[a-z0-9-]+\.)*comprasnet\.gov\.br|(?:[a-z0-9-]+\.)*compras\.gov\.br)(?:\/|$)/i.test(url || '')) return; const a = el('a', label + ' ↗'); a.href = url; a.target = '_blank'; a.rel = 'noopener noreferrer'; parent.append(a); }
function badge(row) { return el('span', row.situacao, 'badge' + (row.situacao === 'Vigente' ? ' live' : '')); }
function field(dl, label, value) { const wrap = el('div'); wrap.append(el('dt', label), el('dd', value === null || value === undefined || value === '' ? 'Não informado' : value)); dl.append(wrap); }
const informed = v => v !== null && v !== undefined && v !== '';
function itemMetric(label, value, cls = '', help = '') { const box = el('div', undefined, 'item-metric ' + cls); box.append(el('span', label), el('strong', value)); if (help) box.append(el('small', help)); return box; }
function itemSection(title, cls = '') { const section = el('section', undefined, 'item-section ' + cls); section.append(el('h5', title)); const grid = el('div', undefined, 'item-metrics'); section.append(grid); return { section, grid }; }
function empenhoValue(item, campo, formatador) {
  if (item.statusConsultaEmpenho === 'INDISPONIVEL') return 'Consulta temporariamente indisponível';
  if (item.statusConsultaEmpenho === 'SEM_MOVIMENTACAO') return 'Sem movimentação registrada';
  if ((item.camposEmpenhoNaoInformados || []).includes(campo) || !informed(item[campo])) return 'Não informado pela fonte oficial';
  return formatador(item[campo]);
}
function empenhoAviso(item) {
  if (item.statusConsultaEmpenho === 'SEM_MOVIMENTACAO') return 'A fonte oficial foi consultada, mas não retornou movimentações de empenho para este item.';
  if (item.statusConsultaEmpenho === 'INDISPONIVEL') return 'Não foi possível consultar empenhos e saldos nesta atualização. O coletor tentará novamente na próxima atualização.';
  if (item.statusConsultaEmpenho === 'CAMPO_NAO_INFORMADO') return 'O registro foi localizado, mas a fonte oficial deixou um ou mais campos sem preenchimento.';
  return '';
}
const campusList = row => String(row.campus || 'Regional Norte').split('|').map(x => x.trim()).filter(Boolean);
const campusLabel = row => campusList(row).join(', ');
const campusMatch = (row, value) => !value || campusList(row).includes(value);
const unidadeContrato = row => row.uasg === '150148' ? '150148 — Campus Londrina' : row.uasg === '150149' ? '150149 — Campus Apucarana' : '153176 — Núcleo Regional Norte';

const SEI_CONSULTA_PUBLICA = 'https://sei.utfpr.edu.br/sei/modulos/pesquisa/md_pesq_processo_pesquisar.php?acao_externa=protocolo_pesquisar&acao_origem_externa=protocolo_pesquisar&id_orgao_acesso_externo=0';
function linkTransparenciaContrato(id) {
  const value = String(id ?? '').trim();
  return /^\d+$/.test(value) ? 'https://contratos.comprasnet.gov.br/transparencia/contratos/' + value : '';
}
function campoProcesso(dl, value) {
  const raw = String(value || '').trim(); if (!raw) { field(dl, 'Processo administrativo', 'Não informado'); return; }
  const digits = raw.replace(/\D/g, ''), numero = digits.length === 17 ? digits.slice(0, 5) + '.' + digits.slice(5, 11) + '/' + digits.slice(11, 15) + '-' + digits.slice(15) : raw;
  const wrap = el('div'), dd = el('dd'), a = el('a', numero + ' ↗'), hint = el('p', 'Clique no número para copiar e abrir a consulta pública do SEI em outra aba. Depois, cole no campo de pesquisa.', 'hint');
  a.href = SEI_CONSULTA_PUBLICA; a.target = '_blank'; a.rel = 'noopener noreferrer'; a.setAttribute('aria-label', 'Copiar processo ' + numero + ' e abrir consulta pública do SEI em outra aba'); hint.setAttribute('role', 'status');
  a.addEventListener('click', () => {
    // Copia durante o gesto do usuário; o link abre normalmente sem aguardar promises.
    const input = el('textarea'); input.value = numero; input.setAttribute('readonly', ''); input.style.position = 'fixed'; input.style.opacity = '0'; dd.append(input); input.select(); let copied = false;
    try { copied = document.execCommand('copy'); } catch (ignore) { } input.remove(); a.focus();
    const done = () => { hint.textContent = 'Processo copiado. Cole o número na pesquisa pública do SEI.'; };
    const fail = () => { hint.textContent = 'A cópia automática foi bloqueada. Selecione e copie o número: ' + numero + '. Cole-o na consulta pública do SEI.'; };
    if (copied) done(); else if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(numero).then(done, fail); else fail();
  }); dd.append(a, hint); wrap.append(el('dt', 'Processo administrativo'), dd); dl.append(wrap);
}

function mark(text, term) {
  const wrap = el('span'), needle = norm(term), hay = norm(text); const pos = needle ? hay.indexOf(needle) : -1;
  if (pos < 0) { wrap.textContent = text; return wrap; } wrap.append(document.createTextNode(text.slice(0, pos)), el('mark', text.slice(pos, pos + term.length)), document.createTextNode(text.slice(pos + term.length))); return wrap;
}
function load() {
  if (state.busy) return; state.busy = true; $('reload').disabled = true; note('Carregando a última versão publicada…');
  const success = d => {
    state.busy = false; $('reload').disabled = false; if (!d || !d.ok) { note(d?.mensagem || 'Dados indisponíveis.', 'error'); return; }
    const hoje = hojeSP(); d.contratos.forEach(x => x.situacao = situacaoLocal(x, hoje)); d.atas.forEach(x => x.situacao = situacaoLocal(x, hoje)); d.desatualizado = !Number.isFinite(Date.parse(d.atualizadoEm)) || Date.now() - Date.parse(d.atualizadoEm) > 48 * 3600000;
    state.data = d; state.items = new Map(); for (const i of d.itens) { if (!state.items.has(i.ataId)) state.items.set(i.ataId, []); state.items.get(i.ataId).push(i); }
    const live = d.atas.filter(x => x.situacao === 'Vigente'), ids = new Set(live.map(x => x.id));
    $('nContratos').textContent = d.contratos.filter(x => x.situacao === 'Vigente').length;
    $('nAtas').textContent = live.length; $('nItens').textContent = new Set(d.itens.filter(x => ids.has(x.ataId)).map(x => x.ataId + '|' + x.numero)).size;
    const dt = new Date(d.atualizadoEm).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' });
    $('updated').textContent = 'Última atualização: ' + dt; $('coverage').textContent = 'Histórico de atas coletado desde ' + date(d.coberturaAtas);
    note(d.desatualizado ? 'A atualização tem mais de 48 horas. Exibindo os últimos dados disponíveis.' : 'Dados oficiais · Contratos das UGs 153176, 150148 e 150149 · Atas gerenciadas pela UASG 153176', d.desatualizado ? 'warning' : '');
    if (d.atasComPendenciaItens) note((d.desatualizado ? 'A atualização tem mais de 48 horas. ' : '') + d.atasComPendenciaItens + ' ata(s) com itens indisponíveis ou incompletos na fonte oficial. A pesquisa por itens e sua contagem não incluem essas atas.', 'warning');
    if (d.pendenciasEnriquecimento) note(d.pendenciasEnriquecimento + ' consulta(s) de saldo ou adesão ficaram indisponíveis na fonte oficial. Os campos afetados aparecem como não informados e serão consultados novamente na próxima atualização.', 'warning');
    years(); render();
  };
  const failure = () => { state.busy = false; $('reload').disabled = false; note('Não foi possível carregar os dados. Tente “Recarregar dados”.', 'error'); };
  fetch('./dados.json?at=' + Date.now(), { cache: 'no-store' }).then(r => {
    if (!r.ok) throw new Error('HTTP ' + r.status);
    return r.json();
  }).then(d => {
    if (!d || d.formato !== 1 || d.uasg !== '153176' || !Array.isArray(d.contratos) || !Array.isArray(d.atas) || !Array.isArray(d.itens)) throw new Error('Arquivo de dados inválido');
    success(d);
  }).catch(failure);
}
function navigate(view) {
  state.view = view; state.page = 1; $('query').value = ''; $('campus').value = ''; $('year').value = ''; $('status').value = 'Vigente';
  $('home').hidden = view !== 'inicio'; $('catalog').hidden = !['contratos', 'atas', 'todos'].includes(view); $('externalAtas').hidden = view !== 'atas-externas'; $('opportunities').hidden = view !== 'oportunidades'; $('annualPlan').hidden = view !== 'pca'; $('guidance').hidden = view !== 'orientacoes';
  document.querySelectorAll('nav [data-view]').forEach(b => { b.classList.toggle('active', b.dataset.view === view); if (b.dataset.view === view) b.setAttribute('aria-current', 'page'); else b.removeAttribute('aria-current'); });
  $('catalogTitle').textContent = view === 'atas' ? 'Atas e itens' : view === 'todos' ? 'Resultados da pesquisa' : 'Contratos';
  $('catalogSub').textContent = view === 'atas' ? 'Pesquise atas por ano ou encontre um item registrado.' : 'Consulte por ano do instrumento, objeto e fornecedor.';
  years(); render(); if (view === 'atas-externas' && !externalState.loaded) consultarAtasExternas(1); if (view === 'oportunidades' && !opportunityState.loaded) consultarOportunidades();
}

function linkAtaExterna(item) {
  const raw = String(item.item_url || '').trim();
  if (!/^\/atas\/\d{14}\/\d{4}\/\d+\/\d+$/.test(raw)) return '';
  return 'https://pncp.gov.br/app' + raw;
}
function externalDate(value) { return /^\d{4}-\d{2}-\d{2}/.test(value || '') ? date(String(value).slice(0, 10)) : 'Não informada'; }
function renderAtasExternas(data) {
  externalState.total = Number(data.total) || 0; externalState.loaded = true;
  const pages = Math.max(1, Math.ceil(externalState.total / externalState.size)), items = Array.isArray(data.items) ? data.items : [];
  $('externalCards').replaceChildren();
  for (const item of items) {
    const card = el('article', undefined, 'card external-card'), top = el('div', undefined, 'card-top'), url = linkAtaExterna(item);
    if (url) { const title = el('a', item.title || 'Ata sem número', 'external-ata-link'); title.href = url; title.target = '_blank'; title.rel = 'noopener noreferrer'; title.setAttribute('aria-label', (item.title || 'Ata') + ' — abrir informações no PNCP em nova aba'); top.append(title); }
    else top.append(el('h2', item.title || 'Ata sem número'));
    top.append(el('span', 'Vigente', 'badge live')); card.append(top, el('p', item.description || 'Objeto não informado pelo PNCP.', 'object'));
    const dl = el('dl'); field(dl, 'ÓRGÃO', item.orgao_nome); field(dl, 'UNIDADE', item.unidade_nome); field(dl, 'LOCAL', item.municipio_nome && item.uf ? item.municipio_nome + '/' + item.uf : item.uf); field(dl, 'VIGÊNCIA', externalDate(item.data_inicio_vigencia) + ' a ' + externalDate(item.data_fim_vigencia)); card.append(dl);
    if (url) { const a = el('a', 'Ver informações no PNCP ↗', 'secondary external-open'); a.href = url; a.target = '_blank'; a.rel = 'noopener noreferrer'; card.append(a); }
    $('externalCards').append(card);
  }
  if (!items.length) $('externalCards').append(el('p', 'Nenhuma ata foi encontrada para estes parâmetros.', 'empty'));
  $('externalStatus').textContent = externalState.total.toLocaleString('pt-BR') + ' ata(s) encontrada(s) no PNCP.';
  $('externalPageInfo').textContent = 'Página ' + externalState.page + ' de ' + pages;
  $('externalPrev').disabled = externalState.busy || externalState.page <= 1; $('externalNext').disabled = externalState.busy || externalState.page >= pages;
}
function consultarAtasExternas(page) {
  if (externalState.busy) return;
  const query = $('externalQuery').value.trim(), key = query + '|' + page;
  externalState.page = page; externalState.query = query;
  if (externalState.cache.has(key)) { renderAtasExternas(externalState.cache.get(key)); return; }
  externalState.busy = true; $('externalStatus').textContent = 'Consultando o PNCP…'; $('externalCards').replaceChildren(); $('externalPrev').disabled = true; $('externalNext').disabled = true; $('externalSearch').disabled = true;
  if (externalState.controller) externalState.controller.abort(); externalState.controller = new AbortController();
  const params = new URLSearchParams({ q: query, tipos_documento: 'ata', pagina: String(page), tam_pagina: String(externalState.size), esferas: 'F', permite_adesao: 'true', status: 'vigente', ordenacao: '-data' });
  const timeout = setTimeout(() => externalState.controller.abort(), 30000);
  fetch('https://pncp.gov.br/api/search/?' + params.toString(), { headers: { Accept: 'application/json' }, signal: externalState.controller.signal }).then(r => { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); }).then(data => {
    if (!data || !Array.isArray(data.items) || !Number.isFinite(Number(data.total))) throw new Error('Resposta inválida');
    externalState.cache.set(key, data); renderAtasExternas(data);
  }).catch(err => {
    $('externalCards').replaceChildren(); const box = el('div', undefined, 'external-error'), message = err.name === 'AbortError' ? 'A consulta ao PNCP excedeu o tempo de espera.' : 'O PNCP não respondeu à consulta neste momento.'; box.append(el('p', message)); const retry = el('button', 'Tentar novamente', 'secondary'); retry.addEventListener('click', () => consultarAtasExternas(externalState.page)); box.append(retry); $('externalCards').append(box); $('externalStatus').textContent = 'Consulta externa temporariamente indisponível.'; $('externalPageInfo').textContent = '';
  }).finally(() => { clearTimeout(timeout); externalState.busy = false; $('externalSearch').disabled = false; $('externalPrev').disabled = externalState.page <= 1; $('externalNext').disabled = !externalState.total || externalState.page >= Math.ceil(externalState.total / externalState.size); });
}
function opportunityUrl(item) {
  const raw = String(item.linkSistemaOrigem || '').trim();
  if (/^https:\/\/[^\s]+$/i.test(raw)) return raw;
  const id = String(item.numeroControlePNCP || ''), m = id.match(/^(\d{14})-1-(\d{6})\/(\d{4})$/);
  return m ? 'https://pncp.gov.br/app/editais/' + m[1] + '/' + m[3] + '/' + Number(m[2]) : '';
}
function opportunitySituation(item) {
  const now = Date.now(), start = Date.parse(item.dataAberturaProposta), end = Date.parse(item.dataEncerramentoProposta);
  if (Number.isFinite(end) && end < now) return 'Prazo encerrado';
  if (Number.isFinite(start) && start > now) return 'Abre em breve';
  return 'Recebendo propostas';
}
function opportunityUnit(item) { return String(item.unidadeOrgao?.codigoUnidade || ''); }
function opportunitySessionDate(item) {
  const end = Date.parse(item.dataEncerramentoProposta), source = String(item.linkSistemaOrigem || '');
  if (!Number.isFinite(end) || !/compras(?:net)?|cnetmobile/i.test(source)) return 'Não informada separadamente pelo PNCP';
  return dateTime(new Date(end + 60000).toISOString()) + ' · previsão';
}
function filteredOpportunities() {
  const q = norm($('opportunityQuery').value.trim()), ug = $('opportunityCampus').value, mod = $('opportunityModality').value;
  return opportunityState.items.filter(x => (!ug || opportunityUnit(x) === ug) && (!mod || String(x.modalidadeId) === mod) && (!q || norm([x.objetoCompra, x.numeroCompra, x.processo, x.modalidadeNome, x.unidadeOrgao?.nomeUnidade].join(' ')).includes(q)) && opportunitySituation(x) !== 'Prazo encerrado');
}
function renderOpportunities() {
  const items = filteredOpportunities().sort((a, b) => String(a.dataEncerramentoProposta || '').localeCompare(String(b.dataEncerramentoProposta || ''))), pages = Math.max(1, Math.ceil(items.length / opportunityState.size));
  opportunityState.page = Math.min(opportunityState.page, pages); $('opportunityCards').replaceChildren();
  for (const item of items.slice((opportunityState.page - 1) * opportunityState.size, opportunityState.page * opportunityState.size)) {
    const card = el('article', undefined, 'card opportunity-card'), top = el('div', undefined, 'card-top'), status = opportunitySituation(item), url = opportunityUrl(item);
    top.append(el('h2', (item.modalidadeNome || 'Oportunidade') + ' ' + (item.numeroCompra || '')), el('span', status, 'badge ' + (status === 'Recebendo propostas' ? 'live' : 'soon'))); card.append(top, el('p', item.objetoCompra || 'Objeto não informado pelo PNCP.', 'object'));
    const dl = el('dl'); field(dl, 'UNIDADE', ((item.unidadeOrgao?.nomeUnidade || 'Não informada') + (opportunityUnit(item) ? ' · ' + opportunityUnit(item) : ''))); campoProcesso(dl, item.processo); field(dl, 'VALOR ESTIMADO', money(item.valorTotalEstimado)); field(dl, 'INÍCIO DO RECEBIMENTO DAS PROPOSTAS', dateTime(item.dataAberturaProposta)); field(dl, 'FIM DO RECEBIMENTO DAS PROPOSTAS', dateTime(item.dataEncerramentoProposta)); field(dl, 'DATA PREVISTA PARA ABERTURA DA SESSÃO PÚBLICA', opportunitySessionDate(item)); field(dl, 'MODO DE DISPUTA', item.modoDisputaNome); card.append(dl, el('p', 'A abertura da sessão é uma previsão calculada para o minuto seguinte ao encerramento das propostas no Compras.gov.br. Confirme o horário no edital e no sistema oficial.', 'session-hint'));
    if (url) { const a = el('a', 'Consultar ou participar ↗', 'primary opportunity-open'); a.href = url; a.target = '_blank'; a.rel = 'noopener noreferrer'; card.append(a); } $('opportunityCards').append(card);
  }
  if (!items.length) $('opportunityCards').append(el('p', 'Nenhuma oportunidade aberta ou programada foi encontrada para os filtros selecionados.', 'empty'));
  $('opportunityStatus').textContent = items.length + ' oportunidade(s) encontrada(s) nas três unidades.' + (opportunityState.failures ? ' ' + opportunityState.failures + ' de 9 consulta(s) não responderam; os demais resultados foram preservados.' : ''); $('opportunityPageInfo').textContent = 'Página ' + opportunityState.page + ' de ' + pages; $('opportunityPrev').disabled = opportunityState.page <= 1; $('opportunityNext').disabled = opportunityState.page >= pages;
}
function consultarOportunidades(force = false) {
  if (opportunityState.busy) return; if (opportunityState.loaded && !force) { renderOpportunities(); return; } opportunityState.busy = true; $('opportunityStatus').textContent = 'Consultando oportunidades no PNCP…'; $('opportunityCards').replaceChildren(); $('opportunityReload').disabled = true;
  if (opportunityState.controller) opportunityState.controller.abort(); opportunityState.controller = new AbortController(); const signal = opportunityState.controller.signal, limit = new Date(); limit.setFullYear(limit.getFullYear() + 1); const dataFinal = limit.toISOString().slice(0, 10).replaceAll('-', '');
  const calls = []; for (const ug of OPPORTUNITY_UASGS) for (const modality of OPPORTUNITY_MODALITIES) { const p = new URLSearchParams({ dataFinal, codigoModalidadeContratacao: String(modality), cnpj: UTFPR_CNPJ, codigoUnidadeAdministrativa: ug, pagina: '1', tamanhoPagina: '50' }); calls.push(fetch('https://pncp.gov.br/api/consulta/v1/contratacoes/proposta?' + p, { headers: { Accept: 'application/json' }, signal }).then(async r => r.status === 204 ? [] : (r.ok ? (await r.json()).data || [] : Promise.reject(new Error('HTTP ' + r.status))))); }
  const timeout = setTimeout(() => opportunityState.controller.abort(), 30000); Promise.allSettled(calls).then(results => { const successful = results.filter(x => x.status === 'fulfilled'); if (!successful.length) throw new Error('Nenhuma consulta respondeu'); opportunityState.failures = results.length - successful.length; const unique = new Map(); successful.flatMap(x => x.value).forEach(x => { if (x && OPPORTUNITY_UASGS.includes(opportunityUnit(x))) unique.set(x.numeroControlePNCP || opportunityUnit(x) + '|' + x.numeroCompra + '|' + x.anoCompra, x); }); opportunityState.items = [...unique.values()]; opportunityState.loaded = true; opportunityState.page = 1; renderOpportunities(); }).catch(() => { const box = el('div', undefined, 'external-error'); box.append(el('p', 'O PNCP não respondeu à consulta de oportunidades neste momento.')); const retry = el('button', 'Tentar novamente', 'secondary'); retry.addEventListener('click', () => consultarOportunidades(true)); box.append(retry); $('opportunityCards').append(box); $('opportunityStatus').textContent = 'Consulta temporariamente indisponível.'; }).finally(() => { clearTimeout(timeout); opportunityState.busy = false; $('opportunityReload').disabled = false; });
}
function pcaFillYears() {
  const select = $('pcaYear'), current = new Date().getFullYear(), old = select.value || String(current); select.replaceChildren();
  for (let y = current + 1; y >= 2022; y--)select.add(new Option(String(y), String(y)));
  select.value = [...select.options].some(o => o.value === old) ? old : String(current);
}
function pcaFetchJson(url, signal) { return fetch(url, { headers: { Accept: 'application/json' }, signal, cache: 'no-store' }).then(r => { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); }); }
function pcaDate(value, withTime = false) { const d = new Date(value); if (!value || !Number.isFinite(d.getTime())) return 'Não informada'; return withTime ? d.toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' }) : d.toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' }); }
function pcaOfficialUrl(year, seq) { return 'https://pncp.gov.br/app/pca/' + UTFPR_CNPJ + '/' + year + '/' + seq; }
function pcaSummaryCard(label, value) { const box = el('article', undefined, 'pca-summary-card'); box.append(el('span', label), el('strong', value)); return box; }
function pcaRenderItemRows(categoryId) {
  const id = String(categoryId), all = pcaState.items.get(id) || [], query = norm(pcaState.filters.get(id) || ''), filtered = all.filter(x => !query || norm([x.classificacaoSuperiorCodigo, x.classificacaoSuperiorNome, x.grupoContratacaoCodigo, x.grupoContratacaoNome].join(' ')).includes(query));
  const size = 10, pages = Math.max(1, Math.ceil(filtered.length / size)), page = Math.min(pcaState.pages.get(id) || 1, pages); pcaState.pages.set(id, page);
  const body = $('pcaRows-' + id), info = $('pcaPageInfo-' + id), prev = $('pcaPrev-' + id), next = $('pcaNext-' + id); body.replaceChildren();
  filtered.slice((page - 1) * size, page * size).forEach(item => {
    const tr = el('tr');
    const itemCell = el('td', String(item.numeroItem ?? 'Não informado')); itemCell.dataset.label = 'Item no PCA';
    const classCell = el('td'); classCell.dataset.label = 'Classe/Grupo'; classCell.append(el('strong', [item.classificacaoSuperiorCodigo, item.classificacaoSuperiorNome].filter(Boolean).join(' - ') || 'Não informado')); if (item.grupoContratacaoNome) classCell.append(el('small', item.grupoContratacaoNome));
    const groupCell = el('td', item.grupoContratacaoCodigo || 'Não informado'); groupCell.dataset.label = 'Futura contratação';
    const desiredCell = el('td', pcaDate(item.dataDesejada)); desiredCell.dataset.label = 'Data desejada';
    const valueCell = el('td', money(item.valorTotal)); valueCell.dataset.label = 'Valor estimado'; valueCell.className = 'pca-money'; tr.append(itemCell, classCell, groupCell, desiredCell, valueCell); body.append(tr);
  });
  if (!filtered.length) { const tr = el('tr'), td = el('td', 'Nenhum item encontrado para este filtro.', 'pca-table-empty'); td.colSpan = 5; tr.append(td); body.append(tr); }
  info.textContent = filtered.length ? ((page - 1) * size + 1) + '-' + Math.min(page * size, filtered.length) + ' de ' + filtered.length + ' itens' : '0 itens'; prev.disabled = page <= 1; next.disabled = page >= pages;
}
function pcaRender(summary) {
  const root = $('pcaContent'); root.replaceChildren();
  const top = el('section', undefined, 'pca-overview'), heading = el('div', undefined, 'pca-overview-head'), title = el('div'); title.append(el('span', 'PCA ' + pcaState.year + ' · UASG ' + (summary.codigoUnidade || '153176'), 'eyebrow'), el('h2', summary.nomeUnidade || 'UTFPR - Núcleo Regional Norte'));
  const source = el('a', 'Ver PCA no PNCP ↗', 'secondary pca-source'); source.href = pcaOfficialUrl(pcaState.year, pcaState.sequencial); source.target = '_blank'; source.rel = 'noopener noreferrer'; heading.append(title, source); top.append(heading);
  const meta = el('div', undefined, 'pca-meta'); meta.append(pcaSummaryCard('Valor total estimado', money(summary.valorTotal)), pcaSummaryCard('Total de itens', Number(summary.quantidade || 0).toLocaleString('pt-BR')), pcaSummaryCard('Publicação no PNCP', pcaDate(summary.dataPublicacaoPncp)), pcaSummaryCard('Última atualização', pcaDate(summary.dataAtualizacao, true))); top.append(meta);
  const details = el('dl', undefined, 'pca-details'); field(details, 'ID PCA PNCP', summary.numeroControlePNCP); field(details, 'LOCAL', [summary.municipio, summary.uf].filter(Boolean).join('/') || 'Não informado'); field(details, 'FONTE', summary.usuario || 'Não informada'); top.append(details); root.append(top);
  const chart = el('section', undefined, 'pca-chart'); chart.append(el('h2', 'Valor estimado e quantidade de itens por categoria')); const max = Math.max(1, ...pcaState.categories.map(c => Number(c.valorTotal) || 0));
  pcaState.categories.forEach(cat => { const row = el('div', undefined, 'pca-bar-row'), label = el('div', undefined, 'pca-bar-label'); label.append(el('strong', cat.categoriaItemNome), el('span', Number(cat.quantidadeItens || 0).toLocaleString('pt-BR') + ' item(ns)')); const track = el('div', undefined, 'pca-bar-track'), bar = el('div', undefined, 'pca-bar'); bar.style.width = Math.max(0, Math.min(100, (Number(cat.valorTotal || 0) / max) * 100)) + '%'; track.setAttribute('aria-hidden', 'true'); track.append(bar); const value = el('strong', money(cat.valorTotal), 'pca-bar-value'); row.append(label, track, value); chart.append(row); }); root.append(chart, el('h2', 'Detalhamento por categoria', 'pca-detail-title'));
  pcaState.categories.forEach((cat, index) => {
    const id = String(cat.categoriaItemId), section = el('details', undefined, 'pca-category'); if (index === 0) section.open = true; const summaryEl = el('summary'), summaryText = el('span'); summaryText.append(el('strong', cat.categoriaItemNome), el('small', Number(cat.quantidadeItens || 0).toLocaleString('pt-BR') + ' item(ns) · ' + money(cat.valorTotal))); summaryEl.append(summaryText, el('span', '⌄', 'pca-chevron')); section.append(summaryEl);
    const inner = el('div', undefined, 'pca-category-body'), search = el('input'); search.type = 'search'; search.maxLength = 160; search.placeholder = 'Filtrar por classe, grupo ou futura contratação'; search.className = 'pca-category-search'; search.setAttribute('aria-label', 'Filtrar itens da categoria ' + cat.categoriaItemNome); search.addEventListener('input', () => { pcaState.filters.set(id, search.value); pcaState.pages.set(id, 1); pcaRenderItemRows(id); }); inner.append(search);
    const wrap = el('div', undefined, 'pca-table-wrap'), table = el('table', undefined, 'pca-table'), thead = el('thead'), hr = el('tr');['Item no PCA', 'Classe/Grupo', 'Futura contratação', 'Data desejada', 'Valor estimado'].forEach(x => hr.append(el('th', x))); thead.append(hr); const tbody = el('tbody'); tbody.id = 'pcaRows-' + id; table.append(thead, tbody); wrap.append(table); inner.append(wrap);
    const pager = el('div', undefined, 'pca-pager'), prev = el('button', '← Anterior', 'secondary'), info = el('span'), next = el('button', 'Próxima →', 'secondary'); prev.type = next.type = 'button'; prev.id = 'pcaPrev-' + id; next.id = 'pcaNext-' + id; info.id = 'pcaPageInfo-' + id; prev.addEventListener('click', () => { pcaState.pages.set(id, (pcaState.pages.get(id) || 1) - 1); pcaRenderItemRows(id); }); next.addEventListener('click', () => { pcaState.pages.set(id, (pcaState.pages.get(id) || 1) + 1); pcaRenderItemRows(id); }); pager.append(prev, info, next); inner.append(pager); section.append(inner); root.append(section); pcaRenderItemRows(id);
  });
}
async function consultarPca() {
  if (pcaState.busy) return; const year = Number($('pcaYear').value); if (year < 2022 || year > new Date().getFullYear() + 1) return;
  pcaState.busy = true; pcaState.year = year; $('pcaSearch').disabled = true; $('pcaStatus').textContent = 'Localizando o PCA da Regional Norte…'; $('pcaContent').replaceChildren(); if (pcaState.controller) pcaState.controller.abort(); pcaState.controller = new AbortController(); const signal = pcaState.controller.signal, base = 'https://pncp.gov.br/api/pncp/v1/orgaos/' + UTFPR_CNPJ + '/pca/' + year;
  try {
    const units = await pcaFetchJson(base + '/consolidado/unidades?pagina=1&tamanhoPagina=50', signal), regional = Array.isArray(units) ? units.find(x => String(x.codigoUnidade) === '153176') : null; if (!regional) throw new Error('PCA_NOT_FOUND');
    pcaState.sequencial = regional.sequencialPca ?? regional.sequencialPCA; const plan = base + '/' + pcaState.sequencial;
    $('pcaStatus').textContent = 'Carregando resumo e categorias…'; const [summary, categories] = await Promise.all([pcaFetchJson(plan + '/consolidado', signal), pcaFetchJson(plan + '/valorescategoriaitem', signal)]); if (!summary || !Array.isArray(categories)) throw new Error('INVALID_RESPONSE');
    pcaState.categories = categories; pcaState.items.clear(); pcaState.pages.clear(); pcaState.filters.clear(); $('pcaStatus').textContent = 'Carregando itens das categorias…';
    await Promise.all(categories.map(async cat => { const count = Number(cat.quantidadeItens) || 0, pages = Math.max(1, Math.ceil(count / 100)), urls = Array.from({ length: pages }, (_, i) => plan + '/itens?categoria=' + encodeURIComponent(cat.categoriaItemId) + '&pagina=' + (i + 1) + '&tamanhoPagina=100'), parts = await Promise.all(urls.map(url => pcaFetchJson(url, signal))), items = parts.flatMap(x => Array.isArray(x) ? x : (Array.isArray(x?.data) ? x.data : [])); pcaState.items.set(String(cat.categoriaItemId), items); pcaState.pages.set(String(cat.categoriaItemId), 1); }));
    pcaRender(summary); $('pcaStatus').textContent = 'PCA ' + year + ' carregado: ' + Number(summary.quantidade || 0).toLocaleString('pt-BR') + ' item(ns) em ' + categories.length + ' categoria(s).';
  } catch (err) {
    const msg = err.message === 'PCA_NOT_FOUND' ? 'Não foi localizado PCA da UASG 153176 para ' + year + '.' : err.name === 'AbortError' ? 'A consulta foi interrompida.' : 'O PNCP não respondeu corretamente à consulta do PCA. Tente novamente em alguns instantes.'; $('pcaStatus').textContent = msg; const box = el('div', undefined, 'external-error'); box.append(el('p', msg)); const retry = el('button', 'Tentar novamente', 'secondary'); retry.addEventListener('click', consultarPca); box.append(retry); $('pcaContent').append(box);
  } finally { pcaState.busy = false; $('pcaSearch').disabled = false; }
}
function rows() { if (!state.data) return []; const c = state.data.contratos.map(x => ({ ...x, tipo: 'contrato' })), a = state.data.atas.map(x => ({ ...x, tipo: 'ata' })); return state.view === 'atas' ? a : state.view === 'todos' ? c.concat(a) : c; }
function years() { const old = $('year').value; $('year').replaceChildren(new Option('Todos os anos', ''));[...new Set(rows().map(x => x.ano))].sort().reverse().forEach(y => $('year').add(new Option(y, y))); $('year').value = old; if ($('year').selectedIndex < 0) $('year').value = ''; }
function matchItems(r, q) { return r.tipo === 'ata' ? (state.items.get(r.id) || []).filter(i => norm([i.descricao, i.codigo, i.fornecedor, i.numero].join(' ')).includes(q)) : []; }
function render() {
  if (!state.data || !['contratos', 'atas', 'todos'].includes(state.view)) return;
  const q = norm($('query').value.trim()), campus = $('campus').value, year = $('year').value, status = $('status').value;
  const found = rows().filter(r => campusMatch(r, campus) && (!year || r.ano === year) && (!status || r.situacao === status) && (!q || norm([r.objeto, r.numero, r.fornecedor, r.processo, campusLabel(r)].join(' ')).includes(q) || matchItems(r, q).length));
  found.sort((a, b) => String(b.ano).localeCompare(String(a.ano)) || a.numero.localeCompare(b.numero, undefined, { numeric: true }));
  const pages = Math.max(1, Math.ceil(found.length / state.size)); state.page = Math.min(state.page, pages);
  $('resultCount').textContent = found.length + ' resultado(s) · ' + (status || 'Todas as situações'); $('cards').replaceChildren();
  for (const row of found.slice((state.page - 1) * state.size, state.page * state.size)) {
    const card = el('article', undefined, 'card'), top = el('div', undefined, 'card-top'); top.append(el('h2', (row.tipo === 'ata' ? 'Ata ' : 'Contrato ') + row.numero), badge(row)); card.append(top, el('p', row.objeto, 'object'));
    const dl = el('dl'); field(dl, 'CÂMPUS', campusLabel(row)); if (row.fornecedor) field(dl, 'FORNECEDOR', row.fornecedor); field(dl, 'VALOR ' + (row.tipo === 'ata' ? 'REGISTRADO' : 'GLOBAL'), money(row.valor)); field(dl, 'VIGÊNCIA', date(row.inicio) + ' a ' + date(row.fim)); card.append(dl);
    if (q) { const matches = matchItems(row, q); if (matches.length) { const m = el('div', undefined, 'match'); m.append(el('strong', matches.length + ' registro(s) de item encontrado(s): '), mark(matches[0].descricao, $('query').value.trim())); card.append(m); } }
    if (row.avisoItens) card.append(el('p', row.avisoItens, 'notice warning'));
    const b = el('button', row.tipo === 'ata' ? 'Ver ata e itens →' : 'Ver contrato →', 'secondary'); b.addEventListener('click', () => detail(row)); card.append(b); $('cards').append(card);
  }
  if (!found.length) $('cards').append(el('p', 'Nenhum registro encontrado. Tente outra palavra, ano ou situação.', 'empty'));
  $('pageInfo').textContent = 'Página ' + state.page + ' de ' + pages; $('prev').disabled = state.page === 1; $('next').disabled = state.page === pages;
}
function detail(row) {
  $('detailType').textContent = row.tipo === 'ata' ? 'ATA DE REGISTRO DE PREÇOS' : 'CONTRATO'; $('detailTitle').textContent = row.numero;
  const body = $('detailBody'); body.replaceChildren(badge(row), el('p', row.objeto, 'detail-object'));
  const dl = el('dl', undefined, 'detail-grid'); field(dl, 'Vigência', date(row.inicio) + ' a ' + date(row.fim)); field(dl, 'Valor', money(row.valor));
  field(dl, 'Câmpus atendido', campusLabel(row));
  if (row.tipo === 'contrato') { field(dl, 'Fornecedor', row.fornecedor); field(dl, 'Documento do fornecedor', row.documento); campoProcesso(dl, row.processo); field(dl, 'Situação na fonte', row.situacaoOrigem); }
  field(dl, 'Unidade', row.tipo === 'contrato' ? unidadeContrato(row) : '153176 — Núcleo Regional Norte'); body.append(dl);
  if (row.tipo === 'ata') {
    body.append(el('h3', 'Processo e licitação de origem'));
    if (row.compra) {
      const c = row.compra, cd = el('dl', undefined, 'detail-grid'); campoProcesso(cd, c.processo); field(cd, 'Número/ano da compra', c.numero + '/' + c.ano); field(cd, 'Modalidade', c.modalidade); field(cd, 'Publicação da contratação', date(c.publicacao)); body.append(cd);
      const more = el('details'), summary = el('summary', 'Mais informações da contratação'), values = el('dl', undefined, 'detail-grid'); field(values, 'Valor estimado da contratação', money(c.estimado)); field(values, 'Valor homologado da contratação', money(c.homologado)); more.append(summary, el('p', 'Valores da licitação inteira; não correspondem ao valor individual desta ata.', 'hint'), values); if (c.informacao) more.append(el('p', c.informacao)); body.append(more);
    } else body.append(el('p', 'Dados complementares da contratação ainda não disponíveis. Nova consulta será realizada na próxima atualização.', 'hint'));
    body.append(el('p', 'Atualização do portal: ' + new Date(state.data.atualizadoEm).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' }), 'hint'));
  }

  const links = el('div', undefined, 'links'); link(links, row.link, row.tipo === 'ata' ? 'Abrir ata no PNCP' : 'Documento oficial'); link(links, row.linkCompra, 'Abrir contratação no PNCP'); link(links, row.tipo === 'contrato' ? linkTransparenciaContrato(row.id) : row.linkDados, 'Consultar dados na fonte'); body.append(links);
  const pncpLinks = Array.from(links.querySelectorAll('a')).filter(a => /^https:\/\/pncp\.gov\.br(?:\/|$)/i.test(a.href));
  if (pncpLinks.length) { const aviso = el('p', 'Os links do PNCP abrem um serviço externo, que pode apresentar instabilidade ao consultar atas, contratações ou arquivos. Se ocorrer um erro no PNCP, tente novamente mais tarde. A falha na abertura externa não significa, por si só, falha deste portal.', 'pncp-notice'); aviso.id = 'pncpNotice'; pncpLinks.forEach(a => a.setAttribute('aria-describedby', aviso.id)); body.append(aviso); }

  if (row.tipo === 'contrato') body.append(el('p', 'A consulta pública do SEI exibe as informações disponibilizadas pela instituição. O link abre a pesquisa; não preenche o número automaticamente.', 'hint'));
  if (row.tipo === 'ata') {
    body.append(el('h3', 'Itens da ata'));
    if (row.avisoItens) body.append(el('p', row.avisoItens + ' Os dados serão conferidos novamente na próxima atualização. Consulte também o documento oficial da ata.', 'notice warning'));
    const search = el('input'); search.type = 'search'; search.placeholder = 'Filtrar itens desta ata'; search.className = 'detail-search'; search.setAttribute('aria-label', 'Filtrar itens desta ata'); body.append(search);
    body.append(el('p', 'Quantidade registrada não equivale a saldo disponível. Preços devem ser interpretados conforme a descrição do item.', 'hint'));
    const list = el('div', undefined, 'item-list'); body.append(list);
    const draw = () => {
      list.replaceChildren(); const q = norm(search.value), items = (state.items.get(row.id) || []).filter(i => norm([i.descricao, i.codigo, i.fornecedor].join(' ')).includes(q));
      for (const item of items) {
        const box = el('article', undefined, 'item'), head = el('div', undefined, 'item-head'), title = el('div'); title.append(el('span', 'ITEM ' + item.numero, 'item-number'), el('h4', 'Descrição do item')); const tags = el('div', undefined, 'item-tags'); tags.append(el('span', item.tipo || 'Tipo não informado'), el('span', 'Código ' + (item.codigo || 'não informado'))); head.append(title, tags); box.append(head);
        const description = el('p', undefined, 'item-description'); description.append(mark(item.descricao || 'Descrição não informada', search.value)); box.append(description);
        const supplier = el('div', undefined, 'item-supplier'), supplierText = el('div'); supplierText.append(el('span', 'FORNECEDOR'), el('strong', item.fornecedor || 'Não informado')); supplier.append(supplierText, el('span', 'CNPJ/CPF: ' + (item.documento || 'Não informado'), 'supplier-document')); box.append(supplier);
        const commercial = itemSection('Valores registrados', 'commercial'); commercial.grid.append(itemMetric('Preço unitário', money(item.preco), 'highlight'), itemMetric('Quantidade do fornecedor', qty(item.quantidade)), itemMetric('Valor total', money(item.valor), 'highlight'));
        if (informed(item.desconto) && Number(item.desconto) !== 0) commercial.grid.append(itemMetric('Maior desconto', qty(item.desconto) + '%')); box.append(commercial.section);
        const balance = itemSection('Empenhos e saldo', 'balance'), balanceNotice = empenhoAviso(item);
        if (balanceNotice) balance.section.insertBefore(el('p', balanceNotice, 'balance-state ' + String(item.statusConsultaEmpenho || '').toLowerCase()), balance.grid);
        balance.grid.append(
          itemMetric('Quantidade registrada', informed(item.quantidadeRegistrada) ? qty(item.quantidadeRegistrada) : 'Não informada pela fonte oficial', '', 'Quantidade originalmente registrada para este item.'),
          itemMetric('Quantidade já empenhada', empenhoValue(item, 'quantidadeEmpenhada', qty), '', 'Quantidade que já possui empenho registrado na fonte oficial.'),
          itemMetric('Saldo disponível para empenho', empenhoValue(item, 'saldoEmpenho', qty), 'balance-value', 'Quantidade que a fonte oficial indica como ainda disponível para empenho.'),
          itemMetric('Última atualização do saldo', empenhoValue(item, 'dataHoraAtualizacao', dateTime), 'wide', 'Data e hora da última atualização publicada pela fonte oficial.')
        ); box.append(balance.section);
        const hasAdhesion = [item.saldoAdesoes, item.qtdLimiteAdesao, item.qtdLimiteInformadoCompra, item.aceitaAdesao, item.quantidadeAprovadaAdesao].some(informed), adhesion = itemSection('Possibilidade de adesão por outros órgãos', 'adhesion');
        adhesion.section.insertBefore(el('p', 'Adesão é a utilização da ata por um órgão que não participou originalmente da licitação. Ela depende de autorização do órgão gerenciador, aceite do fornecedor e análise de vantagem.', 'adhesion-intro'), adhesion.grid);
        if (hasAdhesion) adhesion.grid.append(
          itemMetric('Saldo disponível para novas adesões', qty(item.saldoAdesoes), 'balance-value', 'Quantidade que o sistema ainda indica como disponível para pedidos de outros órgãos.'),
          itemMetric('Limite máximo de adesões', qty(item.qtdLimiteAdesao), '', 'Teto de quantidade controlado pelo sistema para adesões deste item.'),
          itemMetric('Limite previsto na compra', qty(item.qtdLimiteInformadoCompra), '', 'Quantidade para adesões registrada originalmente no procedimento de compra.'),
          itemMetric('Admite pedidos de adesão', yesNo(item.aceitaAdesao), item.aceitaAdesao === true ? 'positive' : '', '“Sim” permite solicitar, mas não representa autorização automática.'),
          itemMetric('Quantidade já aprovada para adesões', qty(item.quantidadeAprovadaAdesao), 'wide', 'Soma das adesões aprovadas publicadas pela fonte oficial. Zero significa que nenhuma aprovação foi retornada.')
        );
        else adhesion.grid.append(el('p', 'A fonte oficial ainda não disponibilizou informações de adesão para este item.', 'item-empty')); box.append(adhesion.section);
        if (Array.isArray(item.unidadesAdesao) && item.unidadesAdesao.length) {
          const more = el('details', undefined, 'adhesion-details'), sum = el('summary', 'Detalhamento por unidade (' + item.unidadesAdesao.length + ')'), units = el('div', undefined, 'adhesion-list'); more.append(sum);
          item.unidadesAdesao.forEach(u => { const unit = el('div', undefined, 'adhesion-unit'); unit.append(el('strong', (u.nomeUnidade || u.codigoUnidade || 'Unidade não informada') + (u.tipoUnidade ? ' · ' + u.tipoUnidade : '')), el('span', 'Fornecedor: ' + (u.fornecedor || 'Não informado')), el('span', 'Saldo para novas adesões: ' + qty(u.saldoAdesoes)), el('span', 'Limite máximo: ' + qty(u.qtdLimiteAdesao)), el('span', 'Limite previsto na compra: ' + qty(u.qtdLimiteInformadoCompra)), el('span', 'Admite pedidos: ' + yesNo(u.aceitaAdesao))); units.append(unit); }); more.append(units); box.append(more);
        }
        if (Array.isArray(item.adesoesAprovadas) && item.adesoesAprovadas.length) {
          const approved = el('details', undefined, 'approved-details'), summary = el('summary', 'Adesões já aprovadas (' + item.adesoesAprovadas.length + ')'), list = el('div', undefined, 'approved-list'); approved.append(summary);
          item.adesoesAprovadas.forEach(a => { const row = el('div', undefined, 'approved-row'); row.append(el('strong', a.unidadeNaoParticipante || 'Órgão não participante não informado'), el('span', 'Quantidade aprovada: ' + qty(a.quantidadeAprovadaAdesao)), el('span', 'Data da aprovação: ' + dateTime(a.dataAprovacaoAnalise))); list.append(row); }); approved.append(list); box.append(approved);
        }
        else if (item.statusConsultaAdesoes === 'INDISPONIVEL') box.append(el('p', 'A consulta de adesões aprovadas estava temporariamente indisponível. Ela será repetida na próxima atualização.', 'no-approved'));
        else box.append(el('p', 'Nenhuma adesão aprovada foi localizada na fonte oficial para este item. Isso não impede a apresentação de novos pedidos quando a ata admitir adesões e houver saldo.', 'no-approved'));
        list.append(box);
      }
      if (!items.length) list.append(el('p', 'Nenhum item encontrado para este filtro.'));
    }; search.addEventListener('input', draw); draw();
  }
  $('detail').showModal();
}
document.querySelectorAll('[data-view]').forEach(b => b.addEventListener('click', () => navigate(b.dataset.view)));
$('globalSearch').addEventListener('submit', e => { e.preventDefault(); const q = $('globalQ').value; navigate('todos'); $('query').value = q; render(); });
$('filters').addEventListener('submit', e => { e.preventDefault(); state.page = 1; render(); });
$('externalFilters').addEventListener('submit', e => { e.preventDefault(); externalState.page = 1; consultarAtasExternas(1); });
$('externalClear').addEventListener('click', () => { $('externalQuery').value = ''; externalState.page = 1; consultarAtasExternas(1); });
$('externalPrev').addEventListener('click', () => consultarAtasExternas(Math.max(1, externalState.page - 1)));
$('externalNext').addEventListener('click', () => consultarAtasExternas(externalState.page + 1));
$('opportunityFilters').addEventListener('submit', e => { e.preventDefault(); opportunityState.page = 1; renderOpportunities(); });
$('opportunityClear').addEventListener('click', () => { $('opportunityQuery').value = ''; $('opportunityCampus').value = ''; $('opportunityModality').value = ''; opportunityState.page = 1; renderOpportunities(); });
$('opportunityReload').addEventListener('click', () => consultarOportunidades(true));
$('opportunityPrev').addEventListener('click', () => { opportunityState.page--; renderOpportunities(); }); $('opportunityNext').addEventListener('click', () => { opportunityState.page++; renderOpportunities(); });
$('pcaForm').addEventListener('submit', e => { e.preventDefault(); consultarPca(); });
let timer; $('query').addEventListener('input', () => { clearTimeout(timer); timer = setTimeout(() => { state.page = 1; render(); }, 150); });
['campus', 'year', 'status'].forEach(id => $(id).addEventListener('change', () => { state.page = 1; render(); }));
$('clear').addEventListener('click', () => { $('query').value = ''; $('campus').value = ''; $('year').value = ''; $('status').value = 'Vigente'; state.page = 1; render(); });
$('prev').addEventListener('click', () => { state.page--; render(); }); $('next').addEventListener('click', () => { state.page++; render(); });
$('closeDetail').addEventListener('click', () => $('detail').close()); $('reload').addEventListener('click', load);
$('closeHomologacao').addEventListener('click', () => $('homologacao').close());
pcaFillYears(); navigate(state.view); $('homologacao').showModal(); load();
