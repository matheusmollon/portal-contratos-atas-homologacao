
'use strict';
const $=id=>document.getElementById(id);
const state={data:null,view:document.body.dataset.tela||'inicio',page:1,size:12,items:new Map(),busy:false};
const hojeSP=()=>{const parts=new Intl.DateTimeFormat('en-US',{timeZone:'America/Sao_Paulo',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(new Date());const get=k=>parts.find(p=>p.type===k).value;return get('year')+'-'+get('month')+'-'+get('day');};
function situacaoLocal(row,hoje){if(row.excluido===true||/cancelad|inativ|rescind|suspens/.test(norm(row.situacaoOrigem)))return 'Inativo';if(!/^\d{4}-\d{2}-\d{2}$/.test(row.inicio||'')||!/^\d{4}-\d{2}-\d{2}$/.test(row.fim||'')||row.inicio>row.fim)return 'Não confirmada';if(row.inicio>hoje)return 'A iniciar';if(row.fim<hoje)return 'Encerrado';return 'Vigente';}
const norm=v=>String(v??'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
const money=v=>v===null||v===undefined||v===''?'Não informado':Number(v).toLocaleString('pt-BR',{style:'currency',currency:'BRL'});
const qty=v=>v===null||v===undefined||v===''?'Não informada':Number(v).toLocaleString('pt-BR');
const date=v=>/^\d{4}-\d{2}-\d{2}$/.test(v||'')?v.slice(8,10)+'/'+v.slice(5,7)+'/'+v.slice(0,4):'Não informada';
const dateTime=v=>{const d=new Date(v);return v&&Number.isFinite(d.getTime())?d.toLocaleString('pt-BR',{timeZone:'America/Sao_Paulo'}):'Não informada';};
const yesNo=v=>v===true?'Sim':v===false?'Não':'Não informado';
function el(tag,text,cls){const e=document.createElement(tag);if(text!==undefined)e.textContent=text;if(cls)e.className=cls;return e;}
function note(text,type=''){ $('notice').textContent=text;$('notice').className='notice '+type; }
function link(parent,url,label){if(!/^https:\/\/(?:pncp\.gov\.br|(?:[a-z0-9-]+\.)*comprasnet\.gov\.br|(?:[a-z0-9-]+\.)*compras\.gov\.br)(?:\/|$)/i.test(url||''))return;const a=el('a',label+' ↗');a.href=url;a.target='_blank';a.rel='noopener noreferrer';parent.append(a);}
function badge(row){return el('span',row.situacao,'badge'+(row.situacao==='Vigente'?' live':''));}
function field(dl,label,value){const wrap=el('div');wrap.append(el('dt',label),el('dd',value===null||value===undefined||value===''?'Não informado':value));dl.append(wrap);}
const informed=v=>v!==null&&v!==undefined&&v!=='';
function itemMetric(label,value,cls=''){const box=el('div',undefined,'item-metric '+cls);box.append(el('span',label),el('strong',value));return box;}
function itemSection(title,cls=''){const section=el('section',undefined,'item-section '+cls);section.append(el('h5',title));const grid=el('div',undefined,'item-metrics');section.append(grid);return {section,grid};}
const campusList=row=>String(row.campus||'Regional Norte').split('|').map(x=>x.trim()).filter(Boolean);
const campusLabel=row=>campusList(row).join(', ');
const campusMatch=(row,value)=>!value||campusList(row).includes(value);
const unidadeContrato=row=>row.uasg==='150148'?'150148 — Campus Londrina':row.uasg==='150149'?'150149 — Campus Apucarana':'153176 — Núcleo Regional Norte';

const SEI_CONSULTA_PUBLICA='https://sei.utfpr.edu.br/sei/modulos/pesquisa/md_pesq_processo_pesquisar.php?acao_externa=protocolo_pesquisar&acao_origem_externa=protocolo_pesquisar&id_orgao_acesso_externo=0';
function linkTransparenciaContrato(id){
 const value=String(id??'').trim();
 return /^\d+$/.test(value)?'https://contratos.comprasnet.gov.br/transparencia/contratos/'+value:'';
}
function campoProcesso(dl,value){
 const raw=String(value||'').trim();if(!raw){field(dl,'Processo administrativo','Não informado');return;}
 const digits=raw.replace(/\D/g,''),numero=digits.length===17?digits.slice(0,5)+'.'+digits.slice(5,11)+'/'+digits.slice(11,15)+'-'+digits.slice(15):raw;
 const wrap=el('div'),dd=el('dd'),a=el('a',numero+' ↗'),hint=el('p','Clique no número para copiar e abrir a consulta pública do SEI em outra aba. Depois, cole no campo de pesquisa.','hint');
 a.href=SEI_CONSULTA_PUBLICA;a.target='_blank';a.rel='noopener noreferrer';a.setAttribute('aria-label','Copiar processo '+numero+' e abrir consulta pública do SEI em outra aba');hint.setAttribute('role','status');
 a.addEventListener('click',()=>{
  // Copia durante o gesto do usuário; o link abre normalmente sem aguardar promises.
  const input=el('textarea');input.value=numero;input.setAttribute('readonly','');input.style.position='fixed';input.style.opacity='0';dd.append(input);input.select();let copied=false;
  try{copied=document.execCommand('copy');}catch(ignore){}input.remove();a.focus();
  const done=()=>{hint.textContent='Processo copiado. Cole o número na pesquisa pública do SEI.';};
  const fail=()=>{hint.textContent='A cópia automática foi bloqueada. Selecione e copie o número: '+numero+'. Cole-o na consulta pública do SEI.';};
  if(copied)done();else if(navigator.clipboard&&navigator.clipboard.writeText)navigator.clipboard.writeText(numero).then(done,fail);else fail();
 });dd.append(a,hint);wrap.append(el('dt','Processo administrativo'),dd);dl.append(wrap);
}

function mark(text,term){const wrap=el('span'),needle=norm(term),hay=norm(text);const pos=needle?hay.indexOf(needle):-1;
 if(pos<0){wrap.textContent=text;return wrap;}wrap.append(document.createTextNode(text.slice(0,pos)),el('mark',text.slice(pos,pos+term.length)),document.createTextNode(text.slice(pos+term.length)));return wrap;}
function load(){
 if(state.busy)return;state.busy=true;$('reload').disabled=true;note('Carregando a última versão publicada…');
 const success=d=>{state.busy=false;$('reload').disabled=false;if(!d||!d.ok){note(d?.mensagem||'Dados indisponíveis.','error');return;}
 const hoje=hojeSP();d.contratos.forEach(x=>x.situacao=situacaoLocal(x,hoje));d.atas.forEach(x=>x.situacao=situacaoLocal(x,hoje));d.desatualizado=!Number.isFinite(Date.parse(d.atualizadoEm))||Date.now()-Date.parse(d.atualizadoEm)>48*3600000;
 state.data=d;state.items=new Map();for(const i of d.itens){if(!state.items.has(i.ataId))state.items.set(i.ataId,[]);state.items.get(i.ataId).push(i);}
 const live=d.atas.filter(x=>x.situacao==='Vigente'),ids=new Set(live.map(x=>x.id));
 $('nContratos').textContent=d.contratos.filter(x=>x.situacao==='Vigente').length;
 $('nAtas').textContent=live.length;$('nItens').textContent=new Set(d.itens.filter(x=>ids.has(x.ataId)).map(x=>x.ataId+'|'+x.numero)).size;
 const dt=new Date(d.atualizadoEm).toLocaleString('pt-BR',{timeZone:'America/Sao_Paulo'});
 $('updated').textContent='Última atualização: '+dt;$('coverage').textContent='Histórico de atas coletado desde '+date(d.coberturaAtas);
 note(d.desatualizado?'A atualização tem mais de 48 horas. Exibindo os últimos dados disponíveis.':'Dados oficiais · Contratos das UGs 153176, 150148 e 150149 · Atas gerenciadas pela UASG 153176',d.desatualizado?'warning':'');
 if(d.atasComPendenciaItens)note((d.desatualizado?'A atualização tem mais de 48 horas. ':'')+d.atasComPendenciaItens+' ata(s) com itens indisponíveis ou incompletos na fonte oficial. A pesquisa por itens e sua contagem não incluem essas atas.','warning');
 if(d.pendenciasEnriquecimento)note(d.pendenciasEnriquecimento+' consulta(s) de saldo ou adesão ficaram indisponíveis na fonte oficial. Os campos afetados aparecem como não informados e serão consultados novamente na próxima atualização.','warning');
 years();render();};
 const failure=()=>{state.busy=false;$('reload').disabled=false;note('Não foi possível carregar os dados. Tente “Recarregar dados”.','error');};
 fetch('./dados.json?at='+Date.now(),{cache:'no-store'}).then(r=>{
  if(!r.ok)throw new Error('HTTP '+r.status);
  return r.json();
 }).then(d=>{
  if(!d||d.formato!==1||d.uasg!=='153176'||!Array.isArray(d.contratos)||!Array.isArray(d.atas)||!Array.isArray(d.itens))throw new Error('Arquivo de dados inválido');
  success(d);
 }).catch(failure);
}
function navigate(view){state.view=view;state.page=1;$('query').value='';$('campus').value='';$('year').value='';$('status').value='Vigente';
 $('home').hidden=view!=='inicio';$('catalog').hidden=!['contratos','atas','todos'].includes(view);$('guidance').hidden=view!=='orientacoes';
 document.querySelectorAll('nav [data-view]').forEach(b=>{b.classList.toggle('active',b.dataset.view===view);if(b.dataset.view===view)b.setAttribute('aria-current','page');else b.removeAttribute('aria-current');});
 $('catalogTitle').textContent=view==='atas'?'Atas e itens':view==='todos'?'Resultados da pesquisa':'Contratos';
 $('catalogSub').textContent=view==='atas'?'Pesquise atas por ano ou encontre um item registrado.':'Consulte por ano do instrumento, objeto e fornecedor.';
 years();render();}
function rows(){if(!state.data)return [];const c=state.data.contratos.map(x=>({...x,tipo:'contrato'})),a=state.data.atas.map(x=>({...x,tipo:'ata'}));return state.view==='atas'?a:state.view==='todos'?c.concat(a):c;}
function years(){const old=$('year').value;$('year').replaceChildren(new Option('Todos os anos',''));[...new Set(rows().map(x=>x.ano))].sort().reverse().forEach(y=>$('year').add(new Option(y,y)));$('year').value=old;if($('year').selectedIndex<0)$('year').value='';}
function matchItems(r,q){return r.tipo==='ata'?(state.items.get(r.id)||[]).filter(i=>norm([i.descricao,i.codigo,i.fornecedor,i.numero].join(' ')).includes(q)):[];}
function render(){
 if(!state.data||!['contratos','atas','todos'].includes(state.view))return;
 const q=norm($('query').value.trim()),campus=$('campus').value,year=$('year').value,status=$('status').value;
 const found=rows().filter(r=>campusMatch(r,campus)&&(!year||r.ano===year)&&(!status||r.situacao===status)&&(!q||norm([r.objeto,r.numero,r.fornecedor,r.processo,campusLabel(r)].join(' ')).includes(q)||matchItems(r,q).length));
 found.sort((a,b)=>String(b.ano).localeCompare(String(a.ano))||a.numero.localeCompare(b.numero,undefined,{numeric:true}));
 const pages=Math.max(1,Math.ceil(found.length/state.size));state.page=Math.min(state.page,pages);
 $('resultCount').textContent=found.length+' resultado(s) · '+(status||'Todas as situações');$('cards').replaceChildren();
 for(const row of found.slice((state.page-1)*state.size,state.page*state.size)){
 const card=el('article',undefined,'card'),top=el('div',undefined,'card-top');top.append(el('h2',(row.tipo==='ata'?'Ata ':'Contrato ')+row.numero),badge(row));card.append(top,el('p',row.objeto,'object'));
 const dl=el('dl');field(dl,'CÂMPUS',campusLabel(row));if(row.fornecedor)field(dl,'FORNECEDOR',row.fornecedor);field(dl,'VALOR '+(row.tipo==='ata'?'REGISTRADO':'GLOBAL'),money(row.valor));field(dl,'VIGÊNCIA',date(row.inicio)+' a '+date(row.fim));card.append(dl);
 if(q){const matches=matchItems(row,q);if(matches.length){const m=el('div',undefined,'match');m.append(el('strong',matches.length+' registro(s) de item encontrado(s): '),mark(matches[0].descricao,$('query').value.trim()));card.append(m);}}
 if(row.avisoItens)card.append(el('p',row.avisoItens,'notice warning'));
 const b=el('button',row.tipo==='ata'?'Ver ata e itens →':'Ver contrato →','secondary');b.addEventListener('click',()=>detail(row));card.append(b);$('cards').append(card);
 }
 if(!found.length)$('cards').append(el('p','Nenhum registro encontrado. Tente outra palavra, ano ou situação.','empty'));
 $('pageInfo').textContent='Página '+state.page+' de '+pages;$('prev').disabled=state.page===1;$('next').disabled=state.page===pages;
}
function detail(row){
 $('detailType').textContent=row.tipo==='ata'?'ATA DE REGISTRO DE PREÇOS':'CONTRATO';$('detailTitle').textContent=row.numero;
 const body=$('detailBody');body.replaceChildren(badge(row),el('p',row.objeto,'detail-object'));
 const dl=el('dl',undefined,'detail-grid');field(dl,'Vigência',date(row.inicio)+' a '+date(row.fim));field(dl,'Valor',money(row.valor));
 field(dl,'Câmpus atendido',campusLabel(row));
 if(row.tipo==='contrato'){field(dl,'Fornecedor',row.fornecedor);field(dl,'Documento do fornecedor',row.documento);campoProcesso(dl,row.processo);field(dl,'Situação na fonte',row.situacaoOrigem);}
 field(dl,'Unidade',row.tipo==='contrato'?unidadeContrato(row):'153176 — Núcleo Regional Norte');body.append(dl);
 if(row.tipo==='ata'){
  body.append(el('h3','Processo e licitação de origem'));
  if(row.compra){const c=row.compra,cd=el('dl',undefined,'detail-grid');campoProcesso(cd,c.processo);field(cd,'Número/ano da compra',c.numero+'/'+c.ano);field(cd,'Modalidade',c.modalidade);field(cd,'Publicação da contratação',date(c.publicacao));body.append(cd);
   const more=el('details'),summary=el('summary','Mais informações da contratação'),values=el('dl',undefined,'detail-grid');field(values,'Valor estimado da contratação',money(c.estimado));field(values,'Valor homologado da contratação',money(c.homologado));more.append(summary,el('p','Valores da licitação inteira; não correspondem ao valor individual desta ata.','hint'),values);if(c.informacao)more.append(el('p',c.informacao));body.append(more);
  }else body.append(el('p','Dados complementares da contratação ainda não disponíveis. Nova consulta será realizada na próxima atualização.','hint'));
  body.append(el('p','Atualização do portal: '+new Date(state.data.atualizadoEm).toLocaleString('pt-BR',{timeZone:'America/Sao_Paulo'}),'hint'));
 }

 const links=el('div',undefined,'links');link(links,row.link,row.tipo==='ata'?'Abrir ata no PNCP':'Documento oficial');link(links,row.linkCompra,'Abrir contratação no PNCP');link(links,row.tipo==='contrato'?linkTransparenciaContrato(row.id):row.linkDados,'Consultar dados na fonte');body.append(links);
 const pncpLinks=Array.from(links.querySelectorAll('a')).filter(a=>/^https:\/\/pncp\.gov\.br(?:\/|$)/i.test(a.href));
 if(pncpLinks.length){const aviso=el('p','Os links do PNCP abrem um serviço externo, que pode apresentar instabilidade ao consultar atas, contratações ou arquivos. Se ocorrer um erro no PNCP, tente novamente mais tarde. A falha na abertura externa não significa, por si só, falha deste portal.','pncp-notice');aviso.id='pncpNotice';pncpLinks.forEach(a=>a.setAttribute('aria-describedby',aviso.id));body.append(aviso);}

 if(row.tipo==='contrato')body.append(el('p','A consulta pública do SEI exibe as informações disponibilizadas pela instituição. O link abre a pesquisa; não preenche o número automaticamente.','hint'));
 if(row.tipo==='ata'){
  body.append(el('h3','Itens da ata'));
  if(row.avisoItens)body.append(el('p',row.avisoItens+' Os dados serão conferidos novamente na próxima atualização. Consulte também o documento oficial da ata.','notice warning'));
  const search=el('input');search.type='search';search.placeholder='Filtrar itens desta ata';search.className='detail-search';search.setAttribute('aria-label','Filtrar itens desta ata');body.append(search);
  body.append(el('p','Quantidade registrada não equivale a saldo disponível. Preços devem ser interpretados conforme a descrição do item.','hint'));
  const list=el('div',undefined,'item-list');body.append(list);
  const draw=()=>{list.replaceChildren();const q=norm(search.value),items=(state.items.get(row.id)||[]).filter(i=>norm([i.descricao,i.codigo,i.fornecedor].join(' ')).includes(q));
   for(const item of items){const box=el('article',undefined,'item'),head=el('div',undefined,'item-head'),title=el('div');title.append(el('span','ITEM '+item.numero,'item-number'),el('h4','Descrição do item'));const tags=el('div',undefined,'item-tags');tags.append(el('span',item.tipo||'Tipo não informado'),el('span','Código '+(item.codigo||'não informado')));head.append(title,tags);box.append(head);
   const description=el('p',undefined,'item-description');description.append(mark(item.descricao||'Descrição não informada',search.value));box.append(description);
   const supplier=el('div',undefined,'item-supplier'),supplierText=el('div');supplierText.append(el('span','FORNECEDOR'),el('strong',item.fornecedor||'Não informado'));supplier.append(supplierText,el('span','CNPJ/CPF: '+(item.documento||'Não informado'),'supplier-document'));box.append(supplier);
   const commercial=itemSection('Valores registrados','commercial');commercial.grid.append(itemMetric('Preço unitário',money(item.preco),'highlight'),itemMetric('Quantidade do fornecedor',qty(item.quantidade)),itemMetric('Valor total',money(item.valor),'highlight'));
   if(informed(item.desconto)&&Number(item.desconto)!==0)commercial.grid.append(itemMetric('Maior desconto',qty(item.desconto)+'%'));box.append(commercial.section);
   const hasBalance=[item.quantidadeRegistrada,item.quantidadeEmpenhada,item.saldoEmpenho,item.dataHoraAtualizacao].some(informed),balance=itemSection('Utilização e saldo','balance');
   if(hasBalance)balance.grid.append(itemMetric('Quantidade registrada',qty(item.quantidadeRegistrada)),itemMetric('Quantidade empenhada',qty(item.quantidadeEmpenhada)),itemMetric('Saldo para empenho',qty(item.saldoEmpenho),'balance-value'),itemMetric('Atualização na fonte',dateTime(item.dataHoraAtualizacao),'wide'));
   else balance.grid.append(el('p','Os dados de utilização ainda não foram disponibilizados pela fonte oficial.','item-empty'));box.append(balance.section);
   const hasAdhesion=[item.saldoAdesoes,item.qtdLimiteAdesao,item.qtdLimiteInformadoCompra,item.aceitaAdesao].some(informed),adhesion=itemSection('Adesões','adhesion');
   if(hasAdhesion)adhesion.grid.append(itemMetric('Saldo para adesões',qty(item.saldoAdesoes)),itemMetric('Limite de adesão',qty(item.qtdLimiteAdesao)),itemMetric('Limite informado na compra',qty(item.qtdLimiteInformadoCompra)),itemMetric('Aceita adesão',yesNo(item.aceitaAdesao),item.aceitaAdesao===true?'positive':''));
   else adhesion.grid.append(el('p','As informações de adesão ainda não foram disponibilizadas pela fonte oficial.','item-empty'));box.append(adhesion.section);
   if(Array.isArray(item.unidadesAdesao)&&item.unidadesAdesao.length){const more=el('details',undefined,'adhesion-details'),sum=el('summary','Detalhamento por unidade ('+item.unidadesAdesao.length+')'),units=el('div',undefined,'adhesion-list');more.append(sum);
    item.unidadesAdesao.forEach(u=>{const unit=el('div',undefined,'adhesion-unit');unit.append(el('strong',(u.nomeUnidade||u.codigoUnidade||'Unidade não informada')+(u.tipoUnidade?' · '+u.tipoUnidade:'')),el('span','Fornecedor: '+(u.fornecedor||'Não informado')),el('span','Saldo de adesões: '+qty(u.saldoAdesoes)),el('span','Limite de adesão: '+qty(u.qtdLimiteAdesao)),el('span','Limite informado: '+qty(u.qtdLimiteInformadoCompra)),el('span','Aceita adesão: '+yesNo(u.aceitaAdesao)));units.append(unit);});more.append(units);box.append(more);}
   list.append(box);}
   if(!items.length)list.append(el('p','Nenhum item encontrado para este filtro.'));};search.addEventListener('input',draw);draw();
 }
 $('detail').showModal();
}
document.querySelectorAll('[data-view]').forEach(b=>b.addEventListener('click',()=>navigate(b.dataset.view)));
$('globalSearch').addEventListener('submit',e=>{e.preventDefault();const q=$('globalQ').value;navigate('todos');$('query').value=q;render();});
$('filters').addEventListener('submit',e=>{e.preventDefault();state.page=1;render();});
let timer; $('query').addEventListener('input',()=>{clearTimeout(timer);timer=setTimeout(()=>{state.page=1;render();},150);});
['campus','year','status'].forEach(id=>$(id).addEventListener('change',()=>{state.page=1;render();}));
$('clear').addEventListener('click',()=>{$('query').value='';$('campus').value='';$('year').value='';$('status').value='Vigente';state.page=1;render();});
$('prev').addEventListener('click',()=>{state.page--;render();});$('next').addEventListener('click',()=>{state.page++;render();});
$('closeDetail').addEventListener('click',()=>$('detail').close());$('reload').addEventListener('click',load);
$('closeHomologacao').addEventListener('click',()=>$('homologacao').close());
navigate(state.view);$('homologacao').showModal();load();
