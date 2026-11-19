import {extract,mvuText} from './core.js';
import {renderApiSettings} from './api-settings.js';
import {Api} from './api.js';
import {mountInputMenu} from './menu.js';
import {buildSummaryRequest} from './summary.js';
import {DEFAULT_SUMMARY_PROMPT} from './summary-rules.js';
import {config} from './core.js';
const escape=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export async function mount(app){
 const entry=document.createElement('div');entry.id='cmrag-settings';entry.className='extension_container';
 entry.innerHTML=`<div class="inline-drawer">
  <div class="inline-drawer-toggle inline-drawer-header"><b>Chat Memory RAG</b><div class="inline-drawer-icon fa-solid fa-circle-chevron-down down"></div></div>
  <div class="inline-drawer-content">
   <label class="checkbox_label cmrag-enable"><input type="checkbox" data-entry-enabled><span>启用 Chat Memory RAG</span></label>
   <div class="cmrag-status" role="status" aria-live="polite"><span>索引状态：</span><span data-entry-status></span></div>
   <div class="cmrag-entry-actions"><button type="button" class="menu_button" data-entry-open>打开记忆管理</button><button type="button" class="menu_button" data-entry-sync>更新索引</button></div>
  </div>
 </div>`;
 (document.querySelector('#extensions_settings2')||document.querySelector('#extensions_settings')||document.body).append(entry);
 const enabled=entry.querySelector('[data-entry-enabled]'),state=entry.querySelector('[data-entry-status]'),syncButton=entry.querySelector('[data-entry-sync]');
 function refreshEntry(){enabled.checked=!!app.getSettings().enabled;const next=app.status.busy?'处理中…':app.status.message;if(state.textContent!==next)state.textContent=next;syncButton.disabled=app.status.busy||!enabled.checked;}
 enabled.onchange=async()=>{enabled.disabled=true;try{await app.save({...structuredClone(app.getSettings()),enabled:enabled.checked});}catch(e){alert(e.message);}finally{enabled.disabled=false;refreshEntry();}};
 syncButton.onclick=async()=>{syncButton.disabled=true;try{await app.sync();}catch(e){alert(e.message);}finally{refreshEntry();}};
 refreshEntry();const entryTimer=setInterval(refreshEntry,1000);globalThis.addEventListener('pagehide',()=>clearInterval(entryTimer),{once:true});
 const dialog=document.createElement('dialog');dialog.id='cmrag';dialog.setAttribute('aria-label','Chat Memory RAG');document.body.append(dialog);let page='概览',draft;
 const PAGES=[
  ['记忆',[['概览','当前聊天的索引状态、依赖和最近警告'],['记忆','逐层查看记忆，修改、删除或重新生成'],['检索预览','用任意一段话测试召回结果和注入内容']]],
  ['设置',[['常规','扩展开关和基础索引选项'],['内容提取','每层消息里哪些文字进入索引'],['Summary','用独立 Text API 为每层生成摘要'],['MVU','把 MVU 变量快照也作为记忆'],['检索与注入','召回数量、阈值和注入位置'],['API / Presets','Text、Embedding、Rerank 三组连接']]],
  ['维护',[['数据管理','导出、导入和清理索引'],['诊断','Debug 日志和运行状态'],['TODO','规划中的功能']]]];
 const pageInfo=Object.fromEntries(PAGES.flatMap(([,items])=>items));
 const SAVE_PAGES=new Set(['常规','内容提取','Summary','MVU','检索与注入','API / Presets','诊断']);
 const fid=name=>`cmrag-f-${name}`;
 const control=(name,type='text',attrs='')=>type==='switch'?`<input id="${fid(name)}" class="cmrag-switch" type="checkbox" role="switch" data-field="${name}" ${draft[name]?'checked':''}>`
  :type==='textarea'?`<textarea id="${fid(name)}" data-field="${name}" ${attrs}>${escape(draft[name])}</textarea>`
  :`<input id="${fid(name)}" data-field="${name}" type="${type}" ${type==='number'?'step="any" ':''}value="${escape(draft[name])}" ${attrs}>`;
 const choice=(name,options)=>`<select id="${fid(name)}" data-field="${name}">${options.map(([v,t])=>`<option value="${v}" ${String(draft[name])===String(v)?'selected':''}>${t}</option>`).join('')}</select>`;
 const row=(name,label,hint,ctrl,wide=false)=>`<div class="cmrag-row${wide?' cmrag-row-wide':''}"><div class="cmrag-row-text"><label for="${fid(name)}">${label}</label>${hint?`<p>${hint}</p>`:''}</div><div class="cmrag-row-control">${ctrl}</div></div>`;
 const section=(title,body,desc='')=>`<section class="cmrag-section"><h3>${title}</h3>${desc?`<p class="cmrag-section-desc">${desc}</p>`:''}${body}</section>`;
 const note=(text,tone='')=>`<p class="cmrag-note"${tone?` data-tone="${tone}"`:''}>${text}</p>`;
 const muted=text=>`<p class="cmrag-muted">${text}</p>`;
 function collect(){for(const el of dialog.querySelectorAll('[data-field]'))draft[el.dataset.field]=el.type==='checkbox'?el.checked:el.type==='number'?Number(el.value):el.value;}
 function drawResults(el){
  const r=app.status.results;
  el.innerHTML=section(`召回结果${r.length?` · ${r.length} 条`:''}`,r.length?`<ol class="cmrag-hits">${r.map(x=>`<li><div class="cmrag-hit-head"><b>第 ${escape(x.index)} 层</b><span class="cmrag-tag">${x.kind==='mvu'?'MVU 变量':'剧情'}</span><span class="cmrag-score" aria-hidden="true"><i style="width:${Math.round(Math.max(0,Math.min(1,Number(x.score)||0))*100)}%"></i></span><code>${(Number(x.score)||0).toFixed(3)}</code></div><p>${escape(x.text)}</p></li>`).join('')}</ol>`:muted('还没有结果。输入一段话后点「检索」。'))
   +section('注入预览',app.status.injection?`<pre class="cmrag-code">${escape(app.status.injection)}</pre>`:muted('这次检索没有内容会被注入。'));
 }
 async function render(){
  const s=app.getSettings();
  dialog.innerHTML=`<div class="cmrag-shell"><aside class="cmrag-side"><div class="cmrag-brand"><strong>Chat Memory RAG</strong><span class="cmrag-pill" data-on="${!!s.enabled}">${s.enabled?'已启用':'未启用'}</span></div><nav aria-label="管理页面">${PAGES.map(([group,items])=>`<div class="cmrag-nav-group"><span>${group}</span>${items.map(([p])=>`<button type="button" data-page="${p}" ${page===p?'aria-current="page"':''}>${p}</button>`).join('')}</div>`).join('')}</nav></aside>
  <div class="cmrag-pane"><header class="cmrag-top"><div><h2>${page}</h2><p>${pageInfo[page]}</p></div><button type="button" class="cmrag-close" data-action="close" aria-label="关闭">✕</button></header><main></main><footer class="cmrag-foot"><span id="cmrag-state" role="status">${escape(app.status.busy?'处理中…':app.status.message)}</span>${SAVE_PAGES.has(page)?'<button type="button" class="cmrag-btn-primary" data-action="save">保存设置</button>':''}</footer></div></div>`;
  const main=dialog.querySelector('main');
  if(page==='概览'){
   // Same default as the 记忆 page: counts exclude user messages.
   const floors=(await app.floors().catch(()=>[])).filter(f=>f.role!=='user'),n=st=>floors.filter(f=>f.state===st).length,deps=app.dependencies();
   const mode=s.mode==='summary'?(s.summaryEnabled?'Summary 模式 · 独立 Text API 生成摘要':'Summary 模式 · 读取回复里已有的摘要标签'):'Content 模式 · 直接索引正文';
   main.innerHTML=`<div class="cmrag-hero"><div><span class="cmrag-eyebrow">索引状态</span><p class="cmrag-hero-status">${escape(app.status.busy?'处理中…':app.status.message)}</p><p class="cmrag-muted">${mode}${s.mvuEnabled?' · MVU 已开启':''}${s.rerankEnabled?' · Rerank 已开启':''}</p></div><div class="cmrag-actions"><button type="button" class="cmrag-btn-primary" data-action="sync" ${s.enabled?'':'disabled'}>更新索引</button><button type="button" data-goto="记忆">查看记忆</button></div></div>
   ${s.enabled?'':note('扩展还没启用。先在「API / Presets」配置 Embedding，再到「常规」打开开关。','warn')}
   <div class="cmrag-tiles">${[['楼层（不含用户消息）',floors.length],['已索引',n('indexed')+n('edited')],['无内容',n('empty')],['已删除',n('excluded')]].map(([t,v])=>`<div class="cmrag-tile"><span>${t}</span><b>${v}</b></div>`).join('')}</div>
   ${section('依赖',`<ul class="cmrag-deps">${Object.entries(deps).map(([k,v])=>`<li data-ok="${!!v}"><span class="cmrag-dot" aria-hidden="true"></span><b>${escape(k)}</b><em>${v?'已检测到':'未检测到'}</em></li>`).join('')}</ul>`)}
   ${section('最近警告',app.status.warnings.length?`<ul class="cmrag-warnings">${app.status.warnings.slice(0,8).map(w=>`<li><time>${escape(w.time)}</time><span>${escape(w.message)}</span></li>`).join('')}</ul>`:muted('暂无警告'))}`;
  }
  if(page==='记忆')await renderMemory(main);
  if(page==='检索预览'){main.innerHTML=section('查询',`<textarea id="cmrag-query" aria-label="查询内容" placeholder="输入一段话，例如用户接下来要说的台词"></textarea><div class="cmrag-actions"><button type="button" class="cmrag-btn-primary" data-action="search">检索</button></div>`)+'<div id="cmrag-results"></div>';drawResults(main.querySelector('#cmrag-results'));}
  if(page==='常规')main.innerHTML=section('扩展',row('enabled','启用 Chat Memory RAG','关闭后不再更新索引，也不注入记忆',control('enabled','switch')))
   +section('索引',row('indexUsers','同时索引用户消息','默认只索引角色回复',control('indexUsers','switch'))+row('chunkSize','每块最大字符数','超过时拆成多块分别 Embedding，最小 200',control('chunkSize','number','min="200"')))
   +note('数据保存在当前浏览器的 IndexedDB；换设备请在「数据管理」导出、导入。');
  if(page==='内容提取')main.innerHTML=section('索引来源',row('mode','索引模式','Content 直接索引正文；Summary 索引摘要',choice('mode',[['content','Content 正文'],['summary','Summary 摘要']]))
   +row('include','Include 标签','逗号分隔，留空使用全文。Summary 模式下改用摘要标签',control('include','text','placeholder="例如 content, story"'))
   +row('exclude','Exclude 标签','这些标签连同内容会先被移除',control('exclude')))
   +section('试一试',`<textarea id="cmrag-original" aria-label="回复原文" placeholder="粘贴一条回复原文"></textarea><div class="cmrag-actions"><button type="button" data-action="preview">查看提取结果</button></div><pre class="cmrag-code" id="cmrag-preview" hidden></pre>`,'用当前表单（未保存也可以）提取，看看会索引哪些文字。');
  if(page==='Summary'){
   main.innerHTML=section('摘要生成',row('summaryEnabled','用独立 Text API 生成摘要','关闭时只读取回复里已有的摘要标签。需要在「内容提取」选择 Summary 模式',control('summaryEnabled','switch'))
    +row('summaryTag','摘要输出标签','模型把摘要写在这个标签里',control('summaryTag'))
    +row('summaryInclude','输入 Include 标签','送去总结的正文范围，留空用整条回复',control('summaryInclude'))
    +row('summaryExclude','输入 / 输出 Exclude 标签','总结前和提取摘要时都会移除',control('summaryExclude')))
    +section('System 提示词',`${control('summaryPrompt','textarea','class="cmrag-prompt" spellcheck="false" aria-label="System 提示词"')}<div class="cmrag-actions"><button type="button" id="cmrag-reset-summary">恢复默认提示词</button><span class="cmrag-muted">恢复后需要点「保存设置」</span></div>`,'这就是发给模型的完整 System 提示词，没有隐藏规则；{{summaryTag}} 会替换为输出标签。')
    +section('请求预览',`<textarea id="cmrag-summary-source" aria-label="待总结的正文" placeholder="粘贴待总结的正文；预览不会发送请求"></textarea><div class="cmrag-actions"><button type="button" id="cmrag-summary-request">预览最终请求</button></div><pre class="cmrag-code" id="cmrag-summary-request-preview" hidden></pre>`,'显示当前表单生成的实际请求体（不含密钥）。来源消息时间只存元数据，不进入摘要。');
   main.querySelector('#cmrag-reset-summary').onclick=()=>{draft.summaryPrompt=DEFAULT_SUMMARY_PROMPT;main.querySelector('[data-field="summaryPrompt"]').value=DEFAULT_SUMMARY_PROMPT;};
   main.querySelector('#cmrag-summary-request').onclick=()=>{collect();const request={model:config(draft,'text').model,...buildSummaryRequest(main.querySelector('#cmrag-summary-source').value,draft)};const out=main.querySelector('#cmrag-summary-request-preview');out.textContent=JSON.stringify(request,null,2);out.hidden=false;};
  }
  if(page==='MVU')main.innerHTML=section('MVU 记忆',row('mvuEnabled','启用 MVU 向量索引与检索','发送前或更新索引时读取上一层的 MVU 快照；不影响 MVU 自身的变量更新和世界书注入',control('mvuEnabled','switch'))
   +row('mvuPaths','Include 变量路径','逗号或换行分隔；留空包含全部非内部字段',control('mvuPaths','textarea'),true)
   +row('mvuExclude','Exclude 变量路径','这些路径及其子字段不会进入记忆',control('mvuExclude','textarea'),true))
   +section('最新快照',`<div class="cmrag-actions"><button type="button" data-action="mvu">预览最新快照</button></div><pre class="cmrag-code" id="cmrag-mvu" hidden></pre>`,'按当前表单的路径过滤，显示会被索引的内容。');
  if(page==='API / Presets')renderApiSettings(main,draft,Api,app.db,app.logger,async presets=>{await app.save({...structuredClone(app.getSettings()),apiSavedPresets:structuredClone(presets)});});
  if(page==='检索与注入')main.innerHTML=section('召回',row('topK','最多命中块数','每次最多注入的记忆块数',control('topK','number','min="1"'))
   +row('threshold','召回阈值','分数低于此值的结果会被丢弃，0–1',control('threshold','number','min="0" max="1"'))
   +row('vectorWeight','向量权重','0 只用关键词，1 只用向量相似度',control('vectorWeight','number','min="0" max="1"'))
   +row('rerankEnabled','启用 Rerank','用 Rerank API 对召回结果再排序；失败时保留原顺序',control('rerankEnabled','switch')))
   +section('注入',row('position','注入位置','',choice('position',[['1','聊天内'],['0','主提示词后'],['2','主提示词前']]))
   +row('depth','聊天注入深度','选「聊天内」时，距最新消息的层数',control('depth','number','min="0"'))
   +row('budget','注入预算','Token 上限；没有 tokenizer 时按字符计算',control('budget','number','min="1"'))
   +row('waitLimit','生成前最长等待（秒）','超时本轮不注入，索引在后台继续更新',control('waitLimit','number','min="1"')));
  if(page==='数据管理')main.innerHTML=`<div class="cmrag-cards">
   <article class="cmrag-card"><h3>导出</h3><p>导出全部索引、摘要缓存、日志和设置。API 密钥会被移除。</p><button type="button" data-action="export">导出 JSON</button></article>
   <article class="cmrag-card"><h3>导入</h3><p>按相同 ID 合并覆盖。导入后刷新页面生效；复制出的聊天需要重新索引。</p><label class="cmrag-file"><input type="file" id="cmrag-import" accept="application/json"><span>选择 JSON 文件…</span></label></article>
   <article class="cmrag-card" data-tone="danger"><h3>清理当前聊天索引</h3><p>删除这个聊天的全部向量记录。聊天本身，以及手动修改、删除标记都不受影响。</p><button type="button" class="cmrag-btn-danger" data-action="clear">清理索引</button></article></div>`;
  if(page==='诊断'){
   main.innerHTML=section('日志设置',row('debugMode','Debug 模式','记录 API 请求与响应、RAG 注入全文；导出的日志会包含聊天内容。密钥和请求头始终隐藏',control('debugMode','switch'))
    +row('logLimit','最多保留日志','50–2000 条',control('logLimit','number','min="50" max="2000"')))
    +section('日志',`<div class="cmrag-toolbar"><select id="cmrag-log-level" aria-label="日志级别"><option value="all">全部级别</option><option value="debug">Debug</option><option value="info">Info</option><option value="warn">Warning</option><option value="error">Error</option></select><button type="button" id="cmrag-refresh-logs">刷新</button><button type="button" id="cmrag-export-logs">导出</button><button type="button" class="cmrag-btn-danger" id="cmrag-clear-logs">清空</button></div><ol class="cmrag-logs" id="cmrag-logs"></ol>`)
    +`<details class="cmrag-section cmrag-raw"><summary>运行状态（可能包含召回正文）</summary><pre class="cmrag-code">${escape(JSON.stringify({dependencies:app.dependencies(),...app.status},null,2))}</pre></details>`;
   const logs=main.querySelector('#cmrag-logs');
   const refresh=async()=>{try{const level=main.querySelector('#cmrag-log-level').value;const rows=(await app.logger.all()).filter(r=>level==='all'||r.level===level);logs.innerHTML=rows.map(r=>`<li data-level="${escape(r.level)}"><div><span class="cmrag-tag">${escape(r.level)}</span><code>${escape(r.event)}</code><time>${escape(new Date(r.time).toLocaleString())}</time></div><pre>${escape(JSON.stringify(r.details,null,1))}</pre></li>`).join('')||'<li class="cmrag-muted">暂无日志</li>';if(app.logger.failure)logs.insertAdjacentHTML('afterbegin',`<li data-level="error">${escape(app.logger.failure)}</li>`);}catch(e){logs.innerHTML=`<li data-level="error">${escape(e.message)}</li>`;}};
   main.querySelector('#cmrag-refresh-logs').onclick=refresh;main.querySelector('#cmrag-log-level').onchange=refresh;
   main.querySelector('#cmrag-clear-logs').onclick=async()=>{if(!confirm('清空全部日志？'))return;try{await app.logger.clear();await refresh();}catch(e){alert(e.message);}};
   main.querySelector('#cmrag-export-logs').onclick=async()=>{try{const url=URL.createObjectURL(new Blob([JSON.stringify(await app.logger.export(),null,2)],{type:'application/json'}));const link=document.createElement('a');link.href=url;link.download='chat-memory-rag-logs.json';link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}catch(e){alert(e.message);}};
   await refresh();
  }
  if(page==='TODO')main.innerHTML=`<div class="cmrag-empty"><h3>额外解析 · 规划中</h3><p>用额外的 API 抽取人物约定、承诺、长期事实和未解决事项。</p><p class="cmrag-muted">待确定：抽取时机、去重、事实更新、来源追踪、独立 API 与提示词设置。本页不会发送请求。</p></div>`;
  dialog.querySelectorAll('[data-page],[data-goto]').forEach(b=>b.onclick=()=>{collect();page=b.dataset.page||b.dataset.goto;render();});
  dialog.querySelectorAll('[data-action]').forEach(b=>b.onclick=()=>action(b.dataset.action));
  const file=main.querySelector('#cmrag-import');if(file)file.onchange=async()=>{if(!file.files[0]||!confirm('将合并导入数据，同 ID 记录会被覆盖。继续？'))return;try{await app.db.import(JSON.parse(await file.files[0].text()));alert('已导入；重新打开面板以读取设置，刷新页面使其生效。');}catch(e){alert(e.message);}};
 }
 // 记忆 page: floor timeline (list) + selected floor (detail); stacks on narrow containers.
 const memoryView={selected:null,status:'all',query:'',view:'list',listTop:0,showUsers:false};
 const badges={indexed:'已索引',edited:'手动修改',empty:'无内容',excluded:'已删除'};
 async function renderMemory(main,message=''){
  // User messages are hidden by default; the toggle brings them back (counts follow what is shown).
  const all=await app.floors(),floors=memoryView.showUsers?all:all.filter(f=>f.role!=='user'),users=all.filter(f=>f.role==='user').length,summary=app.getSettings().mode==='summary';
  const label=kind=>kind==='mvu'?'MVU 变量':summary?'摘要':'正文';
  const who=f=>`${f.role==='user'?'用户':f.role==='system'?'系统':'回复'}${f.name?' · '+f.name:''}`;
  const preview=f=>f.kinds.content.chunks?f.kinds.content.text:f.kinds.content.note;
  const match=f=>(memoryView.status==='all'||f.state===memoryView.status)&&(!memoryView.query||[f.text,...Object.values(f.kinds).map(k=>k.text)].some(t=>t.includes(memoryView.query)));
  const count=s=>s==='all'?floors.length:floors.filter(f=>f.state===s).length;
  main.innerHTML=`<div class="cmrag-mem" data-view="${memoryView.view}">
   <div class="cmrag-mem-toolbar"><div class="cmrag-mem-chips" role="group" aria-label="按状态筛选">${[['all','全部'],...Object.entries(badges)].map(([s,t])=>`<button type="button" data-status="${s}" aria-pressed="${memoryView.status===s}">${t}<b>${count(s)}</b></button>`).join('')}</div><input type="search" id="cmrag-filter" placeholder="搜索记忆或原文" aria-label="搜索记忆或原文" value="${escape(memoryView.query)}"><label class="cmrag-mem-users"><input type="checkbox" class="cmrag-switch" role="switch" data-show-users ${memoryView.showUsers?'checked':''}>用户消息<b>${users}</b></label><button type="button" class="cmrag-btn-primary cmrag-mem-sync" data-mem-sync ${app.getSettings().enabled?'':'disabled title="扩展未启用"'}>更新索引</button></div>
   <div class="cmrag-mem-split"><ol class="cmrag-mem-list" aria-label="楼层列表"></ol><section class="cmrag-mem-detail" aria-label="楼层详情"></section></div></div>`;
  const root=main.querySelector('.cmrag-mem'),list=root.querySelector('.cmrag-mem-list'),detail=root.querySelector('.cmrag-mem-detail');
  const setView=v=>{memoryView.view=v;root.dataset.view=v;};
  function drawList(){
   const shown=floors.filter(match);if(!shown.some(f=>f.uid===memoryView.selected))memoryView.selected=shown[0]?.uid??null;
   list.innerHTML=shown.map(f=>`<li><button type="button" class="cmrag-mem-row" data-uid="${escape(f.uid)}" data-state="${f.state}" ${f.uid===memoryView.selected?'aria-current="true"':''}><span class="cmrag-mem-node" aria-hidden="true"></span><span class="cmrag-mem-floor">#${f.index}</span><span class="cmrag-mem-main"><span class="cmrag-mem-who"><span>${escape(who(f))}</span><span class="cmrag-mem-tag" data-state="${f.state}">${badges[f.state]}</span></span><span class="cmrag-mem-preview">${escape(preview(f))}</span></span></button></li>`).join('')||`<li class="cmrag-mem-none">${floors.length?'没有符合筛选的楼层':'当前聊天还没有消息'}</li>`;
   drawDetail();
  }
  function drawDetail(msg=''){
   const f=floors.find(x=>x.uid===memoryView.selected);
   if(!f){detail.innerHTML='<p class="cmrag-mem-none">在左侧选择一层查看记忆</p>';return;}
   detail.innerHTML=`<button type="button" class="cmrag-mem-back" data-back>← 楼层列表</button>
   <header class="cmrag-mem-head"><h3>第 ${f.index} 层<span>${escape(who(f))}</span></h3><span class="cmrag-mem-tag" data-state="${f.state}">${badges[f.state]}</span></header>
   <output class="cmrag-mem-msg" aria-live="polite">${escape(msg)}</output>
   ${Object.entries(f.kinds).map(([kind,k])=>`<article class="cmrag-mem-card" data-kind="${kind}"><div class="cmrag-mem-card-head"><h4>${label(kind)}</h4><small>${[k.chunks>1?k.chunks+' 块':'',k.override==='edited'?'手动修改':''].filter(Boolean).join(' · ')}</small></div><div class="cmrag-mem-body">${k.chunks?`<p class="cmrag-mem-text">${escape(k.text)}</p>`:`<p class="cmrag-mem-note">${escape(k.note)}</p>`}</div><div class="cmrag-mem-actions"><button type="button" class="cmrag-mem-primary" data-floor-action="edit">${k.chunks?'修改':'手动填写'}</button><button type="button" data-floor-action="regenerate">重新生成</button>${k.override!=='excluded'?'<button type="button" class="cmrag-mem-danger" data-floor-action="delete">删除</button>':''}</div></article>`).join('')}
   <details class="cmrag-mem-source"><summary>查看原文 · swipe ${f.swipe}</summary><p class="cmrag-mem-text">${escape(f.text)}</p></details>`;
  }
  function select(uid,open=true){memoryView.selected=uid;list.querySelectorAll('.cmrag-mem-row').forEach(r=>r.dataset.uid===uid?r.setAttribute('aria-current','true'):r.removeAttribute('aria-current'));drawDetail();detail.scrollTop=0;if(open)setView('detail');}
  async function run(f,kind,act,text){
   detail.querySelectorAll('button,textarea').forEach(x=>x.disabled=true);detail.setAttribute('aria-busy','true');detail.querySelector('.cmrag-mem-msg').textContent=act==='regenerate'?'正在重新生成…':'正在保存…';
   try{await app.floorAction(f.uid,kind,act,text);memoryView.listTop=list.scrollTop;await renderMemory(main,`${label(kind)}${{edit:'已保存，并重新 Embedding',delete:'已删除，之后不会自动生成',regenerate:'已重新生成'}[act]}`);}
   catch(e){detail.removeAttribute('aria-busy');detail.querySelectorAll('button,textarea').forEach(x=>x.disabled=false);detail.querySelector('.cmrag-mem-msg').textContent=e.message;}
  }
  function openEditor(card,f,kind){
   const k=f.kinds[kind],area=document.createElement('textarea');area.className='cmrag-mem-editor';area.setAttribute('aria-label',`修改第 ${f.index} 层${label(kind)}`);area.value=k.chunks?k.text:'';
   card.querySelector('.cmrag-mem-body').replaceChildren(area);const actions=card.querySelector('.cmrag-mem-actions');
   actions.innerHTML='<button type="button" class="cmrag-mem-primary" data-edit-save>保存修改</button><button type="button" data-edit-cancel>取消</button><span class="cmrag-mem-hint">Ctrl+Enter 保存 · Esc 取消</span>';
   area.style.height=Math.min(480,Math.max(160,area.scrollHeight+6))+'px';area.focus();
   const save=()=>run(f,kind,'edit',area.value);actions.querySelector('[data-edit-save]').onclick=save;actions.querySelector('[data-edit-cancel]').onclick=()=>drawDetail();
   area.onkeydown=e=>{if(e.key==='Enter'&&(e.ctrlKey||e.metaKey)){e.preventDefault();save();}else if(e.key==='Escape'){e.preventDefault();e.stopPropagation();drawDetail();}};
  }
  root.querySelector('.cmrag-mem-chips').onclick=e=>{const b=e.target.closest('[data-status]');if(!b)return;memoryView.status=b.dataset.status;root.querySelectorAll('[data-status]').forEach(x=>x.setAttribute('aria-pressed',String(x===b)));drawList();};
  root.querySelector('#cmrag-filter').oninput=e=>{memoryView.query=e.target.value;drawList();};
  root.querySelector('[data-show-users]').onchange=e=>{memoryView.showUsers=e.target.checked;memoryView.listTop=0;renderMemory(main);};
  root.querySelector('[data-mem-sync]').onclick=async e=>{const b=e.currentTarget;b.disabled=true;b.textContent='更新中…';root.setAttribute('aria-busy','true');memoryView.listTop=list.scrollTop;try{await app.sync();}finally{await renderMemory(main,app.status.message);const state=dialog.querySelector('#cmrag-state');if(state)state.textContent=app.status.message;}};
  list.onclick=e=>{const b=e.target.closest('.cmrag-mem-row');if(b)select(b.dataset.uid);};
  list.onkeydown=e=>{if(e.key!=='ArrowDown'&&e.key!=='ArrowUp')return;const rows=[...list.querySelectorAll('.cmrag-mem-row')],next=rows[rows.indexOf(document.activeElement)+(e.key==='ArrowDown'?1:-1)];if(next){e.preventDefault();next.focus();select(next.dataset.uid,false);}};
  detail.onclick=e=>{
   if(e.target.closest('[data-back]')){setView('list');list.querySelector('[aria-current]')?.focus();return;}
   const b=e.target.closest('[data-floor-action]');if(!b)return;const card=b.closest('.cmrag-mem-card'),kind=card.dataset.kind,act=b.dataset.floorAction,f=floors.find(x=>x.uid===memoryView.selected);
   if(act==='edit')return openEditor(card,f,kind);
   if(act==='delete'&&!confirm(`删除第 ${f.index} 层的${label(kind)}记忆？之后不会再自动生成，可点「重新生成」恢复。`))return;
   run(f,kind,act);
  };
  drawList();drawDetail(message);list.scrollTop=memoryView.listTop;list.querySelector('[aria-current]')?.scrollIntoView({block:'nearest'});
 }
 async function action(a){try{collect();if(a==='close'){dialog.close();return;}if(a==='save'){const invalid=dialog.querySelector(':invalid');if(invalid){invalid.focus();throw Error(`请修正无效的输入：${invalid.closest('.cmrag-row')?.querySelector('label')?.textContent.trim()||invalid.closest('.cmrag-api-row')?.querySelector('label')?.textContent.trim()||invalid.dataset.field||invalid.id}`);}if(!/^[A-Za-z][A-Za-z0-9_-]*$/.test(draft.summaryTag))throw Error('摘要标签格式无效');for(const k of ['chunkSize','topK','budget','waitLimit'])if(!(Number(draft[k])>0))throw Error(`${k} 必须大于零`);if(draft.vectorWeight<0||draft.vectorWeight>1)throw Error('向量权重应在 0 到 1 之间');await app.save(structuredClone(draft));await render();}if(a==='sync'){await app.sync();if(page==='概览')await render();}if(a==='preview'){const out=dialog.querySelector('#cmrag-preview');out.textContent=extract(dialog.querySelector('#cmrag-original').value,draft)||'没有可索引的内容：标签缺失或提取后为空';out.hidden=false;}if(a==='mvu'){const d=globalThis.Mvu?.getMvuData({type:'message',message_id:'latest'});const out=dialog.querySelector('#cmrag-mvu');out.textContent=d?.stat_data?mvuText(d.stat_data,draft)||'按路径过滤后为空':'未检测到 MVU 快照';out.hidden=false;}if(a==='search'){const q=dialog.querySelector('#cmrag-query').value.trim();if(!q)throw Error('请先输入查询内容');await app.search(q);drawResults(dialog.querySelector('#cmrag-results'));}if(a==='export'){const blob=new Blob([JSON.stringify(await app.db.export(),null,2)],{type:'application/json'});const url=URL.createObjectURL(blob);const link=document.createElement('a');link.href=url;link.download='chat-memory-rag.json';link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}if(a==='clear'&&confirm('清理当前聊天的 RAG 索引？原聊天不受影响。'))await app.clear();const state=dialog.querySelector('#cmrag-state');if(state)state.textContent=app.status.message;}catch(e){alert(e.message);}}
 const openPanel=()=>{draft=structuredClone(app.getSettings());render();if(!dialog.open)dialog.showModal();};
 entry.querySelector('[data-entry-open]').onclick=openPanel;
 mountInputMenu({...app,openPanel});
 dialog.addEventListener('close',refreshEntry);
}
