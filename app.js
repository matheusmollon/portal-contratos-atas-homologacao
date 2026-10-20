
'use strict';
const $ = id => document.getElementById(id);
const requestedView = new URLSearchParams(location.search).get('view');
const initialView = ['inicio', 'contratos', 'atas', 'pca', 'atas-externas', 'oportunidades', 'orientacoes'].includes(requestedView) ? requestedView : (document.body.dataset.tela || 'inicio');
const state = { data: null, view: initialView, page: 1, size: 8, items: new Map(), busy: false };
const externalState = { page: 1, size: 25, total: 0, busy: false, query: '', cache: new Map(), controller: null, loaded: false };
const opportunityState = { page: 1, size: 12, busy: false, loaded: false, items: [], controller: null, failures: 0 };
const pcaState = { busy: false, controller: null, year: null, sequencial: null, categories: [], items: new Map(), pages: new Map(), filters: new Map(), query: '' };
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
function link(parent, url, label) { if (!/^https:\/\/(?:pncp\.gov\.br|(?:[a-z0-9-]+\.)*comprasnet\.gov\.br|(?:[a-z0-9-]+\.)*compras\.gov\.br|contratos\.sistema\.gov\.br)(?:\/|$)/i.test(url || '')) return; const a = el('a', label + ' ↗'); a.href = url; a.target = '_blank'; a.rel = 'noopener noreferrer'; parent.append(a); }
function portalRecordTitle(row) {
  const label = row.tipo === 'ata' ? 'Ata' : 'Contrato', number = String(row.numero || '').replace(/^(?:contrato|ata)\s*(?:n[º°o.]*)?\s*/i, '').trim();
  return label + ' nº ' + (number || 'não informado');
}
function portalProcurementTitle(item) {
  const modality = item.modalidadeNome || 'Contratação', number = String(item.numeroCompra || '').trim(), year = String(item.anoCompra ?? '').trim();
  const full = number && /^\d{4}$/.test(year) && !/[\/]\s*\d{4}\s*$/.test(number) ? number + '/' + year : number;
  return modality + (full ? ' nº ' + full : ' — número não informado');
}
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
    years(); render(); if (typeof renderDashboard === 'function') renderDashboard();
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
  state.catalogUnit = ''; state.view = view; state.page = 1; $('query').value = ''; $('campus').value = ''; $('year').value = ''; $('status').value = 'Vigente';
  $('home').hidden = view !== 'inicio'; $('catalog').hidden = !['contratos', 'atas', 'todos'].includes(view); $('externalAtas').hidden = view !== 'atas-externas'; $('opportunities').hidden = view !== 'oportunidades'; $('annualPlan').hidden = view !== 'pca'; $('guidance').hidden = view !== 'orientacoes';
  document.querySelectorAll('nav [data-view]').forEach(b => { b.classList.toggle('active', b.dataset.view === view); if (b.dataset.view === view) b.setAttribute('aria-current', 'page'); else b.removeAttribute('aria-current'); });
  $('catalogTitle').textContent = view === 'atas' ? 'Atas e itens' : view === 'todos' ? 'Resultados da pesquisa' : 'Contratos';
  $('catalogSub').textContent = view === 'atas' ? 'Pesquise atas por ano ou encontre um item registrado.' : 'Consulte por ano do instrumento, objeto e fornecedor.';
  years(); render(); if (view === 'inicio' && typeof renderDashboard === 'function') { renderDashboard(); consultarOportunidades(); } if (view === 'atas-externas' && !externalState.loaded) consultarAtasExternas(1); if (view === 'oportunidades' && !opportunityState.loaded) consultarOportunidades();
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
function externalParams(page) {
  const params = new URLSearchParams({ q: $('externalQuery').value.trim(), tipos_documento: 'ata', pagina: String(page), tam_pagina: String(externalState.size), esferas: 'F', permite_adesao: 'true', status: 'vigente', ordenacao: '-data' });
  for (const [id, param] of [['externalType', 'tipos'], ['externalModality', 'modalidades'], ['externalUf', 'ufs'], ['externalPower', 'poderes']]) if ($(id).value) params.set(param, $(id).value);
  return params;
}
function externalScope() {
  const labels = ['esfera federal', 'atas vigentes', 'permite adesão'];
  for (const id of ['externalType', 'externalModality', 'externalUf', 'externalPower']) if ($(id).value) labels.push($(id).selectedOptions[0].textContent);
  $('externalScope').textContent = 'Filtros aplicados: ' + labels.join(' · ') + ' · ' + externalState.size + ' resultados por página.';
}
async function consultarAtasExternas(page, options = {}) {
  if (externalState.busy) return false;
  const params = options.pagination && externalState.appliedParams ? new URLSearchParams(externalState.appliedParams) : externalParams(page); params.set('pagina', String(Math.max(1, page)));
  let key = params.toString(); const cached = externalState.cache.get(key), previousPage = externalState.page;
  externalState.busy = true; externalState.dirty = false;
  if (typeof uiClearFeedback === 'function') uiClearFeedback('externalStatus');
  $('externalStatus').textContent = 'Consultando o PNCP…'; $('externalCards').setAttribute('aria-busy', 'true'); $('externalPrev').disabled = $('externalNext').disabled = true;
  for (const control of $('externalFilters').elements) control.disabled = true;
  const controller = new AbortController(); externalState.controller = controller; const timeout = setTimeout(() => controller.abort(), 30000); let success = false;
  try {
    let data = cached && Date.now() - cached.at < 300000 ? cached.data : null;
    if (!data) { const r = await fetch('https://pncp.gov.br/api/search/?' + key, { headers: { Accept: 'application/json' }, signal: controller.signal }); if (!r.ok) throw new Error('HTTP ' + r.status); data = await r.json(); }
    if (!data || !Array.isArray(data.items) || !Number.isFinite(Number(data.total)) || Number(data.total) < 0) throw new Error('Resposta inválida');
    const lastPage = Math.max(1, Math.ceil(Number(data.total) / externalState.size));
    if (Number(params.get('pagina')) > lastPage) { params.set('pagina', String(lastPage)); key = params.toString(); const r = await fetch('https://pncp.gov.br/api/search/?' + key, { headers: { Accept: 'application/json' }, signal: controller.signal }); if (!r.ok) throw new Error('HTTP ' + r.status); data = await r.json(); if (!data || !Array.isArray(data.items) || !Number.isFinite(Number(data.total)) || Number(data.total) < 0 || lastPage > Math.max(1, Math.ceil(Number(data.total) / externalState.size))) throw new Error('A paginação mudou; tente novamente.'); }
    if (externalState.cache.size >= 12) externalState.cache.delete(externalState.cache.keys().next().value); externalState.cache.set(key, { at: Date.now(), data });
    externalState.page = Number(params.get('pagina')); externalState.query = params.get('q') || ''; externalState.appliedParams = key; externalState.lastData = data; externalScope(); renderAtasExternas(data); success = true;
  } catch (err) {
    externalState.page = previousPage;
    if (externalState.lastData) renderAtasExternas(externalState.lastData);
    const message = (err.name === 'AbortError' ? 'A consulta ao PNCP demorou mais que o esperado.' : 'O PNCP não respondeu à consulta.') + (externalState.lastData ? ' Mantidos os resultados da consulta anterior, na página ' + previousPage + '.' : ' Tente novamente em alguns instantes.');
    if (typeof uiFeedback === 'function') uiFeedback('externalStatus', message, () => consultarAtasExternas(page, options)); else $('externalStatus').textContent = message;
  } finally {
    clearTimeout(timeout); externalState.busy = false; $('externalCards').removeAttribute('aria-busy');
    for (const control of $('externalFilters').elements) control.disabled = false;
    $('externalPrev').disabled = !externalState.loaded || externalState.page <= 1; $('externalNext').disabled = !externalState.total || externalState.page >= Math.ceil(externalState.total / externalState.size);
    if (typeof uiExternalDirty === 'function') uiExternalDirty(); if (typeof uiRefreshExternal === 'function') uiRefreshExternal(); if (success && options.scroll && typeof uiFocusResults === 'function') uiFocusResults('externalStatus');
  }
  return success;
}

function opportunitySourceUrl(item) {
  const raw = String(item.linkSistemaOrigem || '').trim(); try { const u = new URL(raw); if (u.protocol === 'https:' && !u.username && !u.password && (!u.port || u.port === '443') && (/^(?:[a-z0-9-]+\.)*compras(?:net)?\.gov\.br$/i.test(u.hostname) || u.hostname.toLowerCase() === 'cnetmobile.estaleiro.serpro.gov.br')) return u.href; } catch { } return '';
}
function opportunityUrl(item) {
  const source = opportunitySourceUrl(item); if (source) return source;
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
  const end = Date.parse(item.dataEncerramentoProposta), source = opportunitySourceUrl(item);
  if (!Number.isFinite(end) || !source) return 'Previsão indisponível; confira no sistema de origem';
  return dateTime(new Date(end + 60000).toISOString()) + ' · estimativa';
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
    top.append(el('h2', portalProcurementTitle(item)), el('span', status, 'badge ' + (status === 'Recebendo propostas' ? 'live' : 'soon'))); card.append(top, el('p', item.objetoCompra || 'Objeto não informado pelo PNCP.', 'object'));
    const dl = el('dl'); field(dl, 'UNIDADE', ((item.unidadeOrgao?.nomeUnidade || 'Não informada') + (opportunityUnit(item) ? ' · ' + opportunityUnit(item) : ''))); campoProcesso(dl, item.processo); field(dl, 'VALOR ESTIMADO', money(item.valorTotalEstimado)); field(dl, 'INÍCIO DO RECEBIMENTO DAS PROPOSTAS', dateTime(item.dataAberturaProposta)); field(dl, 'FIM DO RECEBIMENTO DAS PROPOSTAS', dateTime(item.dataEncerramentoProposta)); field(dl, 'DATA PREVISTA PARA ABERTURA DA SESSÃO PÚBLICA', opportunitySessionDate(item)); field(dl, 'MODO DE DISPUTA', item.modoDisputaNome); card.append(dl, el('p', 'A abertura da sessão é uma previsão calculada para o minuto seguinte ao encerramento das propostas no Compras.gov.br. Confirme o horário no edital e no sistema oficial.', 'session-hint'));
    if (url) { const a = el('a', opportunitySourceUrl(item) ? 'Consultar ou participar ↗' : 'Consultar no PNCP ↗', 'primary opportunity-open'); a.href = url; a.target = '_blank'; a.rel = 'noopener noreferrer'; card.append(a); } $('opportunityCards').append(card);
  }
  if (!items.length) $('opportunityCards').append(el('p', 'Nenhuma oportunidade aberta ou programada foi encontrada para os filtros selecionados.', 'empty'));
  opportunityState.filteredTotal = items.length; opportunityState.pages = pages;
  $('opportunityStatus').textContent = items.length + ' oportunidade(s) encontrada(s) nas três unidades.'; const stamp = $('opportunityUpdated'); if (stamp) { const stale = Date.now() - Date.parse(opportunityState.at) > 6 * 3600000; stamp.textContent = 'Oportunidades atualizadas em ' + dateTime(opportunityState.at) + (stale ? ' · A última coleta tem mais de 6 horas. Confira os prazos na fonte oficial.' : ' · Novas publicações aparecerão após a próxima coleta.'); } $('opportunityPageInfo').textContent = 'Página ' + opportunityState.page + ' de ' + pages; $('opportunityPrev').disabled = opportunityState.page <= 1; $('opportunityNext').disabled = opportunityState.page >= pages;
}
async function consultarOportunidades(force = false) {
  if (opportunityState.busy) return; if (opportunityState.loaded && !force) { renderOpportunities(); if (typeof renderDashboard === 'function') renderDashboard(); return; }
  opportunityState.busy = true; opportunityState.error = false; $('opportunityStatus').textContent = 'Carregando oportunidades publicadas pelo coletor…'; $('opportunityReload').disabled = true;
  const controller = new AbortController(), timer = setTimeout(() => controller.abort(), 20000); opportunityState.controller = controller;
  try {
    const r = await fetch('./oportunidades.json?at=' + Date.now(), { cache: 'no-store', signal: controller.signal }); if (!r.ok) throw new Error('HTTP ' + r.status);
    const d = await r.json(); if (!d || d.ok !== true || d.formato !== 1 || d.completo !== true || !Array.isArray(d.oportunidades) || !Number.isFinite(Date.parse(d.atualizadoEm))) throw new Error('Arquivo de oportunidades inválido.');
    const ids = new Set(), items = d.oportunidades; for (const item of items) { if (!item || !/^75101873000190-1-\d+\/\d{4}$/.test(String(item.numeroControlePNCP || '')) || !OPPORTUNITY_UASGS.includes(opportunityUnit(item)) || !OPPORTUNITY_MODALITIES.includes(Number(item.modalidadeId)) || !Number.isFinite(Date.parse(item.dataEncerramentoProposta)) || ids.has(item.numeroControlePNCP)) throw new Error('Registro de oportunidade inválido.'); ids.add(item.numeroControlePNCP); }
    opportunityState.items = items; opportunityState.loaded = true; opportunityState.at = d.atualizadoEm; opportunityState.failures = 0; renderOpportunities();
  } catch (e) {
    opportunityState.error = true;
    if (opportunityState.loaded) renderOpportunities();
    const message = opportunityState.loaded ? 'Não foi possível recarregar as oportunidades. Mantida a última base recebida.' : 'A base de oportunidades ainda não foi publicada ou não pôde ser carregada. Tente novamente mais tarde.';
    $('opportunityStatus').textContent = message; if (typeof uiFeedback === 'function') uiFeedback('opportunityStatus', message, () => consultarOportunidades(true));
  } finally { clearTimeout(timer); opportunityState.busy = false; $('opportunityReload').disabled = false; if (typeof uiBusy === 'function') uiBusy('opportunityFilters', 'opportunityCards', false); if (typeof uiRefreshOpportunities === 'function') uiRefreshOpportunities(); if (typeof renderDashboard === 'function') renderDashboard(); }
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
function pcaFilteredItems(categoryId) {
  const q = norm(pcaState.query || '').trim();
  return (pcaState.items.get(String(categoryId)) || []).filter(item => !q || norm([item.numeroItem, item.classificacaoSuperiorCodigo, item.classificacaoSuperiorNome, item.grupoContratacaoCodigo, item.grupoContratacaoNome, item.descricaoItem, item.descricao].filter(v => v !== null && v !== undefined).join(' ')).includes(q));
}
function pcaApplySearch() {
  const active = !!norm(pcaState.query || '').trim(); let total = 0, categories = 0;
  for (const cat of pcaState.categories) {
    const id = String(cat.categoriaItemId), section = $('pcaCategory-' + id), count = pcaFilteredItems(id).length;
    total += count; if (count) categories++;
    if (active && !section.dataset.searching) { section.dataset.preSearchOpen = String(section.open); section.dataset.searching = 'true'; }
    section.hidden = active && !count;
    if (active) section.open = count > 0; else if (section.dataset.searching) { section.open = section.dataset.preSearchOpen === 'true'; delete section.dataset.searching; delete section.dataset.preSearchOpen; }
    $('pcaCategoryCount-' + id).textContent = active ? count + ' resultado(s) de ' + (pcaState.items.get(id) || []).length + ' item(ns) carregado(s)' : Number(cat.quantidadeItens || 0).toLocaleString('pt-BR') + ' item(ns) · ' + money(cat.valorTotal);
    pcaState.pages.set(id, 1); pcaRenderItemRows(id);
  }
  $('pcaSearchResults').textContent = active ? (total ? total + ' item(ns) encontrado(s) em ' + categories + ' categoria(s).' : 'Nenhum item encontrado. Tente outra palavra ou limpe a busca.') : 'Pesquise nos ' + total + ' itens carregados, em todas as categorias.';
  $('pcaClearSearch').disabled = !pcaState.query;
}
function pcaRenderItemRows(categoryId) {
  const id = String(categoryId), filtered = pcaFilteredItems(id);
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
  const searchForm = el('form', undefined, 'pca-global-search'), searchField = el('div', undefined, 'field grow'), searchLabel = el('label', 'Buscar em todas as categorias'), searchInput = el('input'), clearSearch = el('button', 'Limpar busca', 'secondary'), searchResults = el('p', undefined, 'hint');
  searchLabel.htmlFor = 'pcaGlobalSearch'; searchInput.id = 'pcaGlobalSearch'; searchInput.type = 'search'; searchInput.maxLength = 160; searchInput.placeholder = 'Classe, grupo, futura contratação ou número do item'; searchInput.value = pcaState.query || ''; searchInput.setAttribute('aria-describedby', 'pcaSearchResults'); clearSearch.id = 'pcaClearSearch'; clearSearch.type = 'button'; searchResults.id = 'pcaSearchResults'; searchResults.setAttribute('role', 'status'); searchResults.setAttribute('aria-live', 'polite'); searchField.append(searchLabel, searchInput); searchForm.append(searchField, clearSearch); root.append(searchForm, searchResults);
  searchForm.addEventListener('submit', event => event.preventDefault()); searchInput.addEventListener('input', () => { pcaState.query = searchInput.value; pcaApplySearch(); }); clearSearch.addEventListener('click', () => { pcaState.query = ''; searchInput.value = ''; pcaApplySearch(); searchInput.focus(); });

  pcaState.categories.forEach((cat, index) => {
    const id = String(cat.categoriaItemId), section = el('details', undefined, 'pca-category'); section.id = 'pcaCategory-' + id; if (index === 0) section.open = true; const summaryEl = el('summary'), summaryText = el('span'); summaryText.append(el('strong', cat.categoriaItemNome), el('small', Number(cat.quantidadeItens || 0).toLocaleString('pt-BR') + ' item(ns) · ' + money(cat.valorTotal))); summaryText.querySelector('small').id = 'pcaCategoryCount-' + id; summaryEl.append(summaryText, el('span', '⌄', 'pca-chevron')); section.append(summaryEl);
    const inner = el('div', undefined, 'pca-category-body');
    const wrap = el('div', undefined, 'pca-table-wrap'), table = el('table', undefined, 'pca-table'), thead = el('thead'), hr = el('tr');['Item no PCA', 'Classe/Grupo', 'Futura contratação', 'Data desejada', 'Valor estimado'].forEach(x => hr.append(el('th', x))); thead.append(hr); const tbody = el('tbody'); tbody.id = 'pcaRows-' + id; table.append(thead, tbody); wrap.append(table); inner.append(wrap);
    const pager = el('div', undefined, 'pca-pager'), prev = el('button', '← Anterior', 'secondary'), info = el('span'), next = el('button', 'Próxima →', 'secondary'); prev.type = next.type = 'button'; prev.id = 'pcaPrev-' + id; next.id = 'pcaNext-' + id; info.id = 'pcaPageInfo-' + id; prev.addEventListener('click', () => { pcaState.pages.set(id, (pcaState.pages.get(id) || 1) - 1); pcaRenderItemRows(id); }); next.addEventListener('click', () => { pcaState.pages.set(id, (pcaState.pages.get(id) || 1) + 1); pcaRenderItemRows(id); }); pager.append(prev, info, next); inner.append(pager); section.append(inner); root.append(section); pcaRenderItemRows(id);
  });
  pcaApplySearch();
}
async function consultarPca() {
  if (pcaState.busy) return; const year = Number($('pcaYear').value); if (year < 2022 || year > new Date().getFullYear() + 1) return;
  const previous = { year: pcaState.year, sequencial: pcaState.sequencial, categories: pcaState.categories, items: pcaState.items, pages: pcaState.pages, filters: pcaState.filters, query: pcaState.query, summary: pcaState.summary };
  if (typeof uiClearFeedback === 'function') uiClearFeedback('pcaStatus'); pcaState.busy = true; pcaState.year = year; $('pcaSearch').disabled = true; $('pcaYear').disabled = true; $('pcaStatus').textContent = 'Localizando o PCA da Regional Norte…'; $('pcaContent').setAttribute('aria-busy', 'true'); $('pcaContent').inert = true; if (pcaState.controller) pcaState.controller.abort(); pcaState.controller = new AbortController(); const signal = pcaState.controller.signal, base = 'https://pncp.gov.br/api/pncp/v1/orgaos/' + UTFPR_CNPJ + '/pca/' + year, timer = setTimeout(() => pcaState.controller.abort(), 30000);
  try {
    const units = await pcaFetchJson(base + '/consolidado/unidades?pagina=1&tamanhoPagina=50', signal), regional = Array.isArray(units) ? units.find(x => String(x.codigoUnidade) === '153176') : null; if (!regional) throw new Error('PCA_NOT_FOUND');
    pcaState.sequencial = regional.sequencialPca ?? regional.sequencialPCA; const plan = base + '/' + pcaState.sequencial;
    $('pcaStatus').textContent = 'Carregando resumo e categorias…'; const [summary, categories] = await Promise.all([pcaFetchJson(plan + '/consolidado', signal), pcaFetchJson(plan + '/valorescategoriaitem', signal)]); if (!summary || !Array.isArray(categories)) throw new Error('INVALID_RESPONSE');
    const collected = new Map(); $('pcaStatus').textContent = 'Carregando itens das categorias…';
    await Promise.all(categories.map(async cat => { const count = Number(cat.quantidadeItens) || 0, pages = Math.max(1, Math.ceil(count / 100)), urls = Array.from({ length: pages }, (_, i) => plan + '/itens?categoria=' + encodeURIComponent(cat.categoriaItemId) + '&pagina=' + (i + 1) + '&tamanhoPagina=100'), parts = await Promise.all(urls.map(url => pcaFetchJson(url, signal))), items = parts.flatMap(x => Array.isArray(x) ? x : (Array.isArray(x?.data) ? x.data : [])); collected.set(String(cat.categoriaItemId), items); }));
    pcaState.categories = categories; pcaState.items = collected; pcaState.pages = new Map(); pcaState.filters = new Map(); pcaState.query = ''; pcaState.summary = summary; pcaRender(summary); $('pcaStatus').textContent = 'PCA ' + year + ' carregado: ' + Number(summary.quantidade || 0).toLocaleString('pt-BR') + ' item(ns) em ' + categories.length + ' categoria(s).';
  } catch (err) {
    pcaState.controller.abort(); Object.assign(pcaState, previous); const msg = err.message === 'PCA_NOT_FOUND' ? 'Não foi localizado PCA da UASG 153176 para ' + year + '.' : err.name === 'AbortError' ? 'A consulta foi interrompida.' : 'O PNCP não respondeu corretamente à consulta do PCA. Tente novamente em alguns instantes.'; $('pcaStatus').textContent = msg; const box = el('div', undefined, 'external-error'); box.append(el('p', msg)); const retry = el('button', 'Tentar novamente', 'secondary'); retry.addEventListener('click', consultarPca); box.append(retry); if (typeof uiFeedback === 'function') uiFeedback('pcaStatus', msg + (previous.summary ? ' O PCA ' + previous.year + ' anteriormente carregado foi mantido.' : ''), consultarPca); else $('pcaContent').append(box);
  } finally { clearTimeout(timer); pcaState.busy = false; $('pcaSearch').disabled = false; $('pcaYear').disabled = false; $('pcaContent').removeAttribute('aria-busy'); $('pcaContent').inert = false; }
}
function compareContracts(a, b, order) {
  const number = (x, y) => String(x.numero || '').localeCompare(String(y.numero || ''), undefined, { numeric: true }) || Number(x.ano || 0) - Number(y.ano || 0);
  if (order === 'numberAsc') return number(a, b); if (order === 'numberDesc') return number(b, a);
  if (order === 'yearAsc') return Number(a.ano || 0) - Number(b.ano || 0) || number(a, b); if (order === 'yearDesc') return Number(b.ano || 0) - Number(a.ano || 0) || number(a, b);
  const da = Date.parse(a.fim), db = Date.parse(b.fim); if (!Number.isFinite(da)) return Number.isFinite(db) ? 1 : number(a, b); if (!Number.isFinite(db)) return -1; return (order === 'expiryDesc' ? db - da : da - db) || number(a, b);
}
function rows() { if (!state.data) return []; const c = state.data.contratos.map(x => ({ ...x, tipo: 'contrato' })), a = state.data.atas.map(x => ({ ...x, tipo: 'ata' })); return state.view === 'atas' ? a : state.view === 'todos' ? c.concat(a) : c; }
function years() { const old = $('year').value; $('year').replaceChildren(new Option('Todos os anos', ''));[...new Set(rows().map(x => x.ano))].sort().reverse().forEach(y => $('year').add(new Option(y, y))); $('year').value = old; if ($('year').selectedIndex < 0) $('year').value = ''; }
function matchItems(r, q) { return r.tipo === 'ata' ? (state.items.get(r.id) || []).filter(i => norm([i.descricao, i.codigo, i.fornecedor, i.numero].join(' ')).includes(q)) : []; }
function render() {
  if (!state.data || !['contratos', 'atas', 'todos'].includes(state.view)) return;
  const q = norm($('query').value.trim()), campus = $('campus').value, year = $('year').value, status = $('status').value;
  const found = rows().filter(r => campusMatch(r, campus) && (!year || r.ano === year) && (!status || r.situacao === status) && (!q || norm([r.objeto, r.numero, r.fornecedor, r.processo, campusLabel(r)].join(' ')).includes(q) || matchItems(r, q).length));
  found.sort((a, b) => state.view === 'contratos' ? compareContracts(a, b, $('contractOrder')?.value || 'expiryAsc') : String(b.ano).localeCompare(String(a.ano)) || a.numero.localeCompare(b.numero, undefined, { numeric: true }));
  const pages = Math.max(1, Math.ceil(found.length / state.size)); state.page = Math.min(state.page, pages);
  state.filteredTotal = found.length; state.pages = pages;
  $('resultCount').textContent = found.length + ' resultado(s) · ' + (status || 'Todas as situações') + (state.catalogUnit ? ' · UASG ' + state.catalogUnit : ''); $('cards').replaceChildren();
  for (const row of found.slice((state.page - 1) * state.size, state.page * state.size)) {
    const card = el('article', undefined, 'card catalog-card'), top = el('div', undefined, 'card-top'); card.dataset.recordId = row.id;
    top.append(el('h2', portalRecordTitle(row)), badge(row)); card.append(top, el('p', row.objeto || 'Objeto não informado pela fonte.', 'object'));
    const meta = el('p', [campusLabel(row), row.fornecedor].filter(Boolean).join(' · '), 'catalog-meta'); card.append(meta);
    if (typeof uiExpiry === 'function') card.append(uiExpiry(row)); else card.append(el('p', 'Vigência: ' + date(row.inicio) + ' a ' + date(row.fim), 'hint'));

    if (q) { const matches = matchItems(row, q); if (matches.length) { const m = el('div', undefined, 'match'); m.append(el('strong', matches.length + ' registro(s) de item encontrado(s): '), mark(matches[0].descricao, $('query').value.trim())); card.append(m); } }
    if (row.avisoItens) card.append(el('p', row.avisoItens, 'notice warning'));
    const foot = el('div', undefined, 'catalog-card-footer'), value = el('span', money(row.valor), 'catalog-value'); value.setAttribute('aria-label', (row.tipo === 'ata' ? 'Valor registrado: ' : 'Valor global: ') + money(row.valor)); const b = el('button', row.tipo === 'ata' ? 'Ver ata e itens →' : 'Ver detalhes →', 'text-action'); b.setAttribute('aria-label', 'Ver detalhes ' + (row.tipo === 'ata' ? 'da ata ' : 'do contrato ') + row.numero); b.addEventListener('click', () => detail(row)); foot.append(value, b); card.append(foot); $('cards').append(card);
  }
  if (!found.length) $('cards').append(el('p', 'Nenhum registro encontrado. Tente outra palavra, ano ou situação.', 'empty'));
  $('pageInfo').textContent = 'Página ' + state.page + ' de ' + pages; $('prev').disabled = state.page === 1; $('next').disabled = state.page === pages;
}
function detail(row) {
  $('detailType').textContent = row.tipo === 'ata' ? 'ATA DE REGISTRO DE PREÇOS' : 'CONTRATO'; $('detailTitle').textContent = portalRecordTitle(row);
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

  const links = el('div', undefined, 'links'); link(links, row.link, row.tipo === 'ata' ? 'Abrir ata no PNCP' : 'Documento oficial'); link(links, row.linkCompra, 'Abrir contratação no PNCP'); link(links, row.tipo === 'contrato' ? linkTransparenciaContrato(row.id) : row.linkDados, 'Consultar dados na fonte'); if (row.tipo === 'ata') link(links, row.linkContratos || 'https://contratos.sistema.gov.br/transparencia/arp', 'Abrir ata no Contratos.gov.br' + (row.linkContratos ? '' : ' — pesquisar')); body.append(links);
  const pncpLinks = Array.from(links.querySelectorAll('a')).filter(a => /^https:\/\/pncp\.gov\.br(?:\/|$)/i.test(a.href));
  if (pncpLinks.length) { const aviso = el('p', 'Os links do PNCP abrem um serviço externo, que pode apresentar instabilidade ao consultar atas, contratações ou arquivos. Se ocorrer um erro no PNCP, tente novamente mais tarde. A falha na abertura externa não significa, por si só, falha deste portal.', 'pncp-notice'); aviso.id = 'pncpNotice'; pncpLinks.forEach(a => a.setAttribute('aria-describedby', aviso.id)); body.append(aviso); }

  if (row.tipo === 'contrato') body.append(el('p', 'A consulta pública do SEI exibe as informações disponibilizadas pela instituição. O link abre a pesquisa; não preenche o número automaticamente.', 'hint'));
  if (row.tipo === 'ata') {
    body.append(el('h3', 'Itens da ata'));
    if (row.avisoItens) { const available = new Set((state.items.get(row.id) || []).map(i => i.numero)).size, expected = Number(row.itensEsperados ?? row.quantidadeItens), count = 'Itens disponíveis no portal: ' + available + (Number.isFinite(expected) && expected > 0 ? ' · Total informado na ata: ' + expected : '') + '. '; body.append(el('p', count + row.avisoItens + ' Exibimos os itens disponíveis; pode haver divergência com o total da fonte. Consulte a ata no PNCP para conferir a relação completa.', 'notice warning')); }
    const search = el('input'); search.type = 'search'; search.placeholder = 'Filtrar itens desta ata'; search.className = 'detail-search'; search.setAttribute('aria-label', 'Filtrar itens desta ata'); body.append(search);
    body.append(el('p', 'Quantidade registrada não equivale a saldo disponível. Preços devem ser interpretados conforme a descrição do item.', 'hint'));
    const list = el('div', undefined, 'item-list'); body.append(list);
    const draw = () => {
      list.replaceChildren(); const q = norm(search.value), items = (state.items.get(row.id) || []).filter(i => norm([i.descricao, i.codigo, i.fornecedor].join(' ')).includes(q));
      for (const item of items) {
        const box = el('article', undefined, 'item'), head = el('div', undefined, 'item-head'), title = el('div'); title.append(el('span', 'ITEM ' + item.numero, 'item-number'), el('h4', 'Descrição do item')); const tags = el('div', undefined, 'item-tags'); tags.append(el('span', item.tipo || 'Tipo não informado'), el('span', 'Código ' + (item.codigo || 'não informado'))); head.append(title, tags); box.append(head);
        const description = el('p', undefined, 'item-description'); description.append(mark(item.descricao || 'Descrição não informada', search.value)); box.append(description);
        const supplier = el('div', undefined, 'item-supplier'), supplierText = el('div'); supplierText.append(el('span', 'FORNECEDOR'), el('strong', item.fornecedor || 'Não informado')); supplier.append(supplierText, el('span', 'CNPJ/CPF: ' + (item.documento || 'Não informado'), 'supplier-document')); box.append(supplier);
        const commercial = itemSection('Valores registrados', 'commercial'); commercial.grid.append(itemMetric('Preço unitário', money(item.preco), 'highlight'), itemMetric('Quantidade registrada', qty(item.quantidade), '', 'Quantidade do fornecedor registrada neste item; não representa saldo disponível.'), itemMetric('Valor total', money(item.valor), 'highlight'));
        if (informed(item.desconto) && Number(item.desconto) !== 0) commercial.grid.append(itemMetric('Maior desconto', qty(item.desconto) + '%')); box.append(commercial.section);
        const official = el('div', undefined, 'links item-official-links');
        link(official, item.linkItemContratos || row.linkContratos || 'https://contratos.sistema.gov.br/transparencia/arp', item.linkItemContratos ? 'Consultar empenhos, saldos e adesões' : row.linkContratos ? 'Consultar empenhos, saldos e adesões na ata' : 'Localizar ata no portal oficial'); box.append(official);
        box.append(el('p', item.linkItemContratos ? 'Consulte os empenhos, saldos e adesões deste item no portal oficial Contratos.gov.br.' : row.linkContratos ? 'O link abre a ata no portal oficial. Selecione o item para consultar empenhos, saldos e adesões.' : 'O vínculo direto ainda não foi confirmado. Localize a ata na pesquisa oficial para consultar empenhos, saldos e adesões.', 'hint item-official-note'));
        list.append(box);
      }
      if (!items.length) list.append(el('p', 'Nenhum item encontrado para este filtro.'));
    }; search.addEventListener('input', draw); draw();
  }
  $('detail').showModal();
}
document.querySelectorAll('[data-view]').forEach(b => b.addEventListener('click', () => navigate(b.dataset.view)));
$('filters').addEventListener('submit', e => { e.preventDefault(); state.page = 1; render(); });
$('externalFilters').addEventListener('input', () => { if (typeof uiExternalDirty === 'function') uiExternalDirty(); });
$('externalFilters').addEventListener('submit', e => { e.preventDefault(); externalState.page = 1; consultarAtasExternas(1); });
$('externalClear').addEventListener('click', () => { $('externalFilters').reset(); externalState.page = 1; consultarAtasExternas(1); });
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


// Usabilidade integrada. Executa após os módulos de consultas e painel.
function iniciarUsabilidadePortal() {
  'use strict';
  // Apresentação e navegação do checkpoint 2. Sem cadastro, credenciais ou escrita de dados.
  const uiViews = new Map(), uiActions = new WeakMap(); let uiLastOpener = null;
  function uiFocusResults(id) { const target = typeof id === 'string' ? $(id) : id; if (!target || target.closest('[hidden]')) return; target.tabIndex = -1; target.focus({ preventScroll: true }); target.scrollIntoView({ block: 'start', behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' }); }
  function uiClearFeedback(id) { $(id + 'Feedback')?.remove(); }
  function uiFeedback(id, message, retry) {
    uiClearFeedback(id); const node = el('div', undefined, 'ui-feedback'); node.id = id + 'Feedback'; node.setAttribute('role', 'alert'); node.append(el('p', message)); if (retry) { const b = el('button', 'Tentar novamente', 'secondary'); b.onclick = retry; node.append(b); } $(id).after(node);
  }
  function uiRange(page, size, total) { if (!total) return 'Nenhum resultado'; return 'Exibindo ' + ((page - 1) * size + 1) + '–' + Math.min(page * size, total) + ' de ' + total; }
  function uiExpiry(row) {
    const days = cp2Days(row), wrap = el('p', undefined, 'catalog-expiry');
    if (days !== null && days >= 0) { const tone = days <= 30 ? '30' : days <= 60 ? '60' : days <= 90 ? '90' : 'neutral', text = days === 0 ? 'Vence hoje' : days === 1 ? 'Vence amanhã' : 'Vence em ' + days + ' dias'; wrap.classList.add('expiry-tone-' + tone); const icon = el('span', undefined, 'calendar-icon'); icon.setAttribute('aria-hidden', 'true'); icon.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><rect x="3" y="5" width="18" height="16" rx="2"/><path d="M16 3v4M8 3v4M3 11h18"/></svg>'; wrap.append(icon, el('span', text), el('time', date(row.fim))); wrap.lastChild.dateTime = row.fim; }
    else wrap.append(el('span', 'Vigência: ' + date(row.inicio) + ' a ' + date(row.fim)));
    return wrap;
  }
  // A situação não repete o vencimento no cabeçalho; o prazo aparece junto à data.
  badge = cp2OriginalBadge;
  function uiBindAction(button, action) { if (!button) return; uiActions.set(button, action); if (button.dataset.uiAction) return; button.dataset.uiAction = 'true'; button.addEventListener('click', event => { event.preventDefault(); event.stopImmediatePropagation(); if (!button.disabled) uiActions.get(button)?.(); }, true); }
  function uiPager(infoId, prevId, nextId, page, pages, total, size, onPage, busy = false) {
    const info = $(infoId), prev = $(prevId), next = $(nextId); if (!info || !prev || !next) return;
    const parent = info.parentElement; parent.setAttribute('role', 'navigation'); parent.setAttribute('aria-label', 'Paginação dos resultados'); parent.setAttribute('aria-busy', String(busy));
    let numbers = parent.querySelector('.pager-numbers'); if (!numbers) { numbers = el('div', undefined, 'pager-numbers'); parent.insertBefore(numbers, info); } numbers.replaceChildren();
    const set = new Set(pages <= 7 ? Array.from({ length: pages }, (_, i) => i + 1) : [1, pages, page - 1, page, page + 1]); let last = 0;
    [...set].filter(n => n >= 1 && n <= pages).sort((a, b) => a - b).forEach(n => { if (last && n - last > 1) numbers.append(el('span', '…', 'pager-gap')); const b = el('button', String(n), 'page-number'); b.type = 'button'; b.disabled = busy || n === page; b.setAttribute('aria-label', 'Ir para a página ' + n); if (n === page) b.setAttribute('aria-current', 'page'); b.onclick = () => onPage(n); numbers.append(b); last = n; });
    info.textContent = 'Página ' + page + ' de ' + pages + ' · ' + uiRange(page, size, total); info.setAttribute('aria-live', 'polite'); info.classList.add('pager-caption'); prev.disabled = busy || page <= 1; next.disabled = busy || page >= pages;
    uiBindAction(prev, () => onPage(Math.max(1, page - 1))); uiBindAction(next, () => onPage(Math.min(pages, page + 1)));
  }
  function uiBusy(formId, cardsId, busy) { const form = $(formId), cards = $(cardsId); if (cards) { if (busy) cards.setAttribute('aria-busy', 'true'); else cards.removeAttribute('aria-busy'); } if (form) for (const control of form.elements) control.disabled = busy; }
  function uiCatalogSnapshot() { const values = {}; for (const id of ['query', 'campus', 'year', 'status', 'expiryFilter', 'contractOrder']) values[id] = $(id)?.value || ''; return { values, page: state.page, unit: state.catalogUnit || '' }; }
  function uiChips() {
    const node = $('activeFilters'); if (!node) return; node.replaceChildren();
    for (const id of ['query', 'campus', 'year', 'status', 'expiryFilter']) { const control = $(id), value = control?.value; if (!value || id === 'status' && value === 'Vigente') continue; const label = control.tagName === 'SELECT' ? control.selectedOptions[0]?.textContent : value, b = el('button', label + ' ×', 'filter-chip'); b.type = 'button'; b.setAttribute('aria-label', 'Remover filtro ' + label); b.onclick = () => { control.value = id === 'status' ? 'Vigente' : ''; state.page = 1; render(); }; node.append(b); }
    if (state.catalogUnit) { const b = el('button', 'UASG ' + state.catalogUnit + ' ×', 'filter-chip'); b.type = 'button'; b.onclick = () => { state.catalogUnit = ''; state.page = 1; render(); }; node.append(b); }
    node.hidden = !node.childElementCount;
    const n = ['year', 'expiryFilter'].filter(id => $(id)?.value).length; $('moreFiltersSummary').textContent = 'Mais filtros' + (n ? ' (' + n + ')' : '');
  }
  function uiRefreshCatalog() {
    if (!state.data) return; document.body.classList.add('has-published-data'); uiChips(); uiPager('pageInfo', 'prev', 'next', state.page, state.pages || 1, state.filteredTotal || 0, state.size, n => { state.page = n; render(); uiFocusResults('resultCount'); });
    const updated = $('catalogUpdated'); if (updated) updated.textContent = 'Atualizado em ' + dateTime(state.data.atualizadoEm);
  }
  function uiRefreshExternal() {
    const total = externalState.total || 0; uiPager('externalPageInfo', 'externalPrev', 'externalNext', externalState.page, Math.max(1, Math.ceil(total / externalState.size)), total, externalState.size, n => consultarAtasExternas(n, { pagination: true, scroll: true }), externalState.busy || externalState.dirty || !externalState.loaded);
  }
  function uiExternalDirty() { if (!externalState.appliedParams) return; const current = externalParams(1), applied = new URLSearchParams(externalState.appliedParams); current.delete('pagina'); applied.delete('pagina'); externalState.dirty = current.toString() !== applied.toString(); $('externalFilterHint').textContent = externalState.dirty ? 'Filtros alterados. Clique em “Pesquisar no PNCP” para aplicar.' : ''; uiRefreshExternal(); }
  function uiRefreshOpportunities() {
    uiPager('opportunityPageInfo', 'opportunityPrev', 'opportunityNext', opportunityState.page, opportunityState.pages || 1, opportunityState.filteredTotal || 0, opportunityState.size, n => { opportunityState.page = n; renderOpportunities(); uiFocusResults('opportunityStatus'); }, opportunityState.busy || !opportunityState.loaded);
  }
  function uiRefreshHistory() {
    uiPager('historyPageInfo', 'historyPrev', 'historyNext', history.page, history.pages || 1, history.filteredTotal || 0, history.size, n => { history.page = n; cp2RenderHistory(); uiFocusResults('historyStatus'); }, history.busy || !history.loaded);
    if (history.criteria && history.loaded) { const [start, end, unit] = history.criteria; $('historyCriteria').textContent = 'Resultados de ' + date(start) + ' a ' + date(end) + ' · ' + (unit === 'all' ? 'Regional Norte, Londrina e Apucarana' : 'UASG ' + unit); }
  }
  function uiCloseMenu() { document.querySelector('.header').classList.remove('nav-open'); $('menuToggle').setAttribute('aria-expanded', 'false'); document.querySelector('.nav-more').open = false; }
  function uiInstallHeader() {
    const header = document.querySelector('.header'), nav = document.querySelector('nav'), more = el('details', undefined, 'nav-more'), summary = el('summary', 'Mais'), list = el('div', undefined, 'nav-more-options'); const chevron = document.createElementNS('http://www.w3.org/2000/svg', 'svg'), path = document.createElementNS('http://www.w3.org/2000/svg', 'path'); chevron.setAttribute('viewBox', '0 0 24 24'); chevron.setAttribute('aria-hidden', 'true'); chevron.setAttribute('focusable', 'false'); chevron.classList.add('nav-more-chevron'); path.setAttribute('d', 'm6 9 6 6 6-6'); chevron.append(path); summary.append(chevron); more.append(summary, list);
    ['historico', 'atas-externas', 'orientacoes'].forEach(view => { const b = nav.querySelector('[data-view="' + view + '"]'); if (b) list.append(b); }); nav.append(more); nav.id = 'mainNavigation';
    const menu = el('button', undefined, 'menu-toggle'); menu.id = 'menuToggle'; menu.type = 'button'; menu.setAttribute('aria-label', 'Abrir menu de navegação'); menu.setAttribute('aria-controls', nav.id); menu.setAttribute('aria-expanded', 'false'); menu.append(el('span', '☰')); header.insertBefore(menu, nav); menu.onclick = () => { const open = header.classList.toggle('nav-open'); menu.setAttribute('aria-expanded', String(open)); };
    nav.addEventListener('click', e => { if (e.target.closest('[data-view]')) uiCloseMenu(); }); document.addEventListener('click', e => { if (!header.contains(e.target)) uiCloseMenu(); }); document.addEventListener('keydown', e => { if (e.key === 'Escape' && header.classList.contains('nav-open')) { uiCloseMenu(); menu.focus(); } });
  }
  function uiInstallFilters() {
    const form = $('filters'), advanced = el('details', undefined, 'advanced-filters'), summary = el('summary', 'Mais filtros'), fields = el('div', undefined, 'advanced-fields'); summary.id = 'moreFiltersSummary'; advanced.append(summary, fields);
    for (const id of ['year', 'expiryFilter']) fields.append($(id).closest('.field')); form.append(advanced);
    const toolbar = el('div', undefined, 'result-toolbar'); $('resultCount').before(toolbar); toolbar.append($('resultCount'), $('contractOrder').closest('.field')); const chips = el('div', undefined, 'active-filters'); chips.id = 'activeFilters'; chips.hidden = true; form.after(chips);
    const stamp = el('p', undefined, 'catalog-updated'); stamp.id = 'catalogUpdated'; $('catalog').querySelector('.heading').append(stamp);
    const ext = el('p', undefined, 'filter-pending'); ext.id = 'externalFilterHint'; ext.setAttribute('role', 'status'); $('externalFilters').after(ext);
    const historyInfo = el('span'); historyInfo.id = 'historyPageInfo'; $('historyNext').before(historyInfo); const criteria = el('p', undefined, 'hint history-criteria'); criteria.id = 'historyCriteria'; $('historyStatus').before(criteria);
  }
  uiInstallHeader(); uiInstallFilters();
  const uiRender = render; render = function () { uiRender(); uiRefreshCatalog(); };
  const uiExternalRender = renderAtasExternas; renderAtasExternas = function (data) { uiExternalRender(data); externalState.lastData = data; uiRefreshExternal(); };
  const uiOpportunityRender = renderOpportunities; renderOpportunities = function () { uiOpportunityRender(); uiRefreshOpportunities(); };
  const uiHistoryRender = cp2RenderHistory; cp2RenderHistory = function () { uiHistoryRender(); uiRefreshHistory(); };
  const uiOpportunityQuery = consultarOportunidades; consultarOportunidades = async function (...args) { if (opportunityState.busy) return; uiClearFeedback('opportunityStatus'); const pending = uiOpportunityQuery(...args); uiBusy('opportunityFilters', 'opportunityCards', opportunityState.busy); uiRefreshOpportunities(); try { return await pending; } finally { uiBusy('opportunityFilters', 'opportunityCards', false); uiRefreshOpportunities(); } };
  const uiHistoryQuery = cp2History; cp2History = async function (...args) { if (history.busy) return; uiClearFeedback('historyStatus'); const pending = uiHistoryQuery(...args); if (history.busy) $('historyCards').setAttribute('aria-busy', 'true'); uiRefreshHistory(); try { return await pending; } finally { $('historyCards').removeAttribute('aria-busy'); uiRefreshHistory(); } };
  const uiNavigate = navigate; navigate = function (view) {
    if (['contratos', 'atas', 'todos'].includes(state.view)) uiViews.set(state.view, uiCatalogSnapshot());
    uiNavigate(view); const saved = uiViews.get(view); if (['contratos', 'atas', 'todos'].includes(view)) {
      for (const id of ['query', 'campus', 'year', 'status', 'expiryFilter', 'contractOrder']) if ($(id)) $(id).value = saved ? saved.values[id] : (id === 'status' ? 'Vigente' : id === 'contractOrder' ? 'expiryAsc' : '');
      state.catalogUnit = saved?.unit || ''; state.page = saved?.page || 1; years(); render();
    }
    document.querySelector('.nav-more').classList.toggle('contains-active', ['historico', 'atas-externas', 'orientacoes'].includes(view)); uiCloseMenu();
    const section = view === 'historico' ? $('history') : view === 'contratos' || view === 'atas' || view === 'todos' ? $('catalog') : view === 'atas-externas' ? $('externalAtas') : view === 'oportunidades' ? $('opportunities') : view === 'pca' ? $('annualPlan') : view === 'orientacoes' ? $('guidance') : $('home'); if (section && !section.hidden) uiFocusResults(section.querySelector('h1') || section);
  };
  document.addEventListener('click', e => { const advanced = document.querySelector('.advanced-filters'); if (advanced?.open && !advanced.contains(e.target)) advanced.open = false; });
  document.addEventListener('keydown', e => { if (e.key === 'Escape') { const advanced = document.querySelector('.advanced-filters'); if (advanced?.open) { advanced.open = false; advanced.querySelector('summary').focus(); } } });
  const uiDetail = detail; detail = function (row) { uiLastOpener = document.activeElement; const result = uiDetail(row); $('detail').scrollTop = 0; const search = $('detailBody').querySelector('.detail-search'); if (search) { const count = el('p', undefined, 'hint item-result-count'); count.setAttribute('role', 'status'); search.after(count); const update = () => { count.textContent = $('detailBody').querySelectorAll('.item-list article').length + ' item(ns) exibido(s)'; }; search.addEventListener('input', update); update(); } return result; };
  const uiPncpOpen = cp2Open; cp2Open = async function (item) { uiLastOpener = document.activeElement; const pending = uiPncpOpen(item); $('detail').scrollTop = 0; return pending; };
  $('detail').addEventListener('close', () => { if (uiLastOpener?.isConnected) uiLastOpener.focus({ preventScroll: true }); });
  $('filters').addEventListener('submit', () => uiFocusResults('resultCount'));
  $('externalFilters').addEventListener('submit', event => { event.preventDefault(); event.stopImmediatePropagation(); consultarAtasExternas(1, { scroll: true }); }, true);
  uiBindAction($('externalClear'), () => { $('externalFilters').reset(); consultarAtasExternas(1, { scroll: true }); });
  const uiPcaRows = pcaRenderItemRows; pcaRenderItemRows = function (id) { uiPcaRows(id); const total = pcaFilteredItems(id).length, page = pcaState.pages.get(String(id)) || 1; uiPager('pcaPageInfo-' + id, 'pcaPrev-' + id, 'pcaNext-' + id, page, Math.max(1, Math.ceil(total / 10)), total, 10, n => { pcaState.pages.set(String(id), n); pcaRenderItemRows(id); uiFocusResults($('pcaRows-' + id).closest('.pca-category-body')); }); };
  uiRefreshCatalog(); uiRefreshExternal(); uiRefreshOpportunities(); uiRefreshHistory();

  Object.assign(globalThis, { uiFocusResults, uiClearFeedback, uiFeedback, uiRange, uiExpiry, uiBindAction, uiPager, uiBusy, uiCatalogSnapshot, uiChips, uiRefreshCatalog, uiRefreshExternal, uiExternalDirty, uiRefreshOpportunities, uiRefreshHistory, uiCloseMenu, uiInstallHeader, uiInstallFilters });
}
document.addEventListener('DOMContentLoaded', iniciarUsabilidadePortal, { once: true });

// Atualiza prazos locais; não consulta a API nem o JSON automaticamente.
setInterval(() => { if (opportunityState.loaded && !opportunityState.busy) { if (state.view === 'oportunidades') renderOpportunities(); if (state.view === 'inicio' && typeof renderDashboard === 'function') renderDashboard(); } }, 60000);
