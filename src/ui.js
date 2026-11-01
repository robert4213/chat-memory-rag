import {extract,mvuText} from './core.js';
import {renderApiSettings} from './api-settings.js';
import {Api} from './api.js';
import {mountInputMenu} from './menu.js';
import {buildSummaryRequest} from './summary.js';
import {DEFAULT_SUMMARY_PROMPT} from './summary-rules.js';
import {config} from './core.js';
const escape=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export async function mount(app){
 mountInputMenu(app);
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
 const dialog=document.createElement('dialog');dialog.id='cmrag';document.body.append(dialog);let page='概览',draft;
 const pages=['概览','记忆','检索预览','常规','内容提取','Summary','MVU','API / Presets','检索与注入','数据管理','诊断','TODO'];
 const field=(name,label,type='text')=>`<label>${label}<input data-field="${name}" type="${type}" ${type==='checkbox'?(draft[name]?'checked':''):`value="${escape(draft[name])}"`}></label>`;
 const area=(name,label)=>`<label>${label}<textarea data-field="${name}">${escape(draft[name])}</textarea></label>`;
 function collect(){for(const el of dialog.querySelectorAll('[data-field]'))draft[el.dataset.field]=el.type==='checkbox'?el.checked:el.type==='number'?Number(el.value):el.value;}
 async function render(){dialog.innerHTML=`<header><strong>Chat Memory RAG</strong><button data-action="close">关闭</button></header><nav>${pages.map(p=>`<button data-page="${p}" class="${page===p?'active':''}">${p}</button>`).join('')}</nav><main></main><footer><span id="cmrag-state"></span><button data-action="save">保存设置</button></footer>`;const main=dialog.querySelector('main');
 if(page==='概览')main.innerHTML=`<h2>当前聊天记忆</h2><p>${escape(app.status.message)}</p><button data-action="sync">更新索引</button><p>配置 API 后开启扩展。摘要缺失会显示警告。</p><pre>${escape(JSON.stringify(app.dependencies(),null,2))}</pre>${app.status.warnings.slice(0,5).map(w=>`<p class="warning">${escape(w.message)}</p>`).join('')}`;
 if(page==='记忆'){const rows=await app.records();main.innerHTML=`<h2>楼层记忆 · ${rows.length} 条</h2><input id="cmrag-filter" placeholder="筛选内容"><div id="cmrag-records">${rows.sort((a,b)=>a.index-b.index).map(r=>`<details><summary>第 ${r.index} 层 · ${r.kind} · swipe ${r.swipe}</summary><pre>${escape(r.text)}</pre><small>SHA-256 ${escape(r.hash)}</small></details>`).join('')||'<p>尚无索引，先配置 API 并更新索引。</p>'}</div>`;main.querySelector('input').oninput=e=>main.querySelectorAll('details').forEach(d=>d.hidden=!d.textContent.includes(e.target.value));}
 if(page==='检索预览')main.innerHTML='<h2>测试召回</h2><textarea id="cmrag-query" placeholder="输入查询"></textarea><button data-action="search">检索</button><pre id="cmrag-results">'+escape(app.status.results.map(x=>`楼层 ${x.index} / ${x.kind} / ${x.score.toFixed(3)}\n${x.text}`).join('\n\n')+'\n\n注入预览：\n'+app.status.injection)+'</pre>';
 if(page==='常规')main.innerHTML=field('enabled','启用扩展','checkbox')+field('indexUsers','同时索引用户消息','checkbox')+field('chunkSize','每块最大字符数','number')+'<p>数据保存在当前浏览器 IndexedDB。额外 API 解析尚未启用。</p>';
 if(page==='内容提取')main.innerHTML=`<label>索引模式<select data-field="mode"><option value="content" ${draft.mode==='content'?'selected':''}>Content 正文</option><option value="summary" ${draft.mode==='summary'?'selected':''}>Summary 摘要</option></select></label>`+field('include','Include 标签（逗号分隔，留空使用全文）')+field('exclude','Exclude 标签（逗号分隔）')+'<label>原文预览<textarea id="cmrag-original"></textarea></label><button data-action="preview">查看提取结果</button><pre id="cmrag-preview"></pre>';
 if(page==='Summary'){
  main.innerHTML=field('summaryEnabled','使用独立 Text API 生成摘要','checkbox')+field('summaryTag','摘要输出标签')+area('summaryPrompt','完整 System 提示词（可编辑，无隐藏追加规则）')+'<p>{{summaryTag}} 会替换为上方输出标签。删除或修改规则后，以这里的内容为准。</p><button type="button" id="cmrag-reset-summary">恢复默认提示词</button>'+field('summaryInclude','摘要输入 Include 标签（留空使用正文）')+field('summaryExclude','摘要输入/输出 Exclude 标签')+'<label>请求预览的原文<textarea id="cmrag-summary-source" placeholder="粘贴待总结正文；预览不会发送 API 请求"></textarea></label><button type="button" id="cmrag-summary-request">预览最终请求</button><pre id="cmrag-summary-request-preview"></pre><p>预览显示当前表单的实际请求体，不含密钥。代码不添加来源消息时间或剧情时间；来源时间只存元数据，不参与摘要 embedding。使用前配置 Text API，选择 Summary 索引模式。</p>';
  main.querySelector('#cmrag-reset-summary').onclick=()=>{draft.summaryPrompt=DEFAULT_SUMMARY_PROMPT;main.querySelector('[data-field="summaryPrompt"]').value=DEFAULT_SUMMARY_PROMPT;};
  main.querySelector('#cmrag-summary-request').onclick=()=>{collect();const request={model:config(draft,'text').model,...buildSummaryRequest(main.querySelector('#cmrag-summary-source').value,draft)};main.querySelector('#cmrag-summary-request-preview').textContent=JSON.stringify(request,null,2);};
 }
 if(page==='MVU')main.innerHTML=field('mvuEnabled','发送前读取前一层 MVU 快照','checkbox')+area('mvuPaths','Include 变量路径（逗号或换行；留空包含全部非内部字段）')+area('mvuExclude','Exclude 变量路径')+'<button data-action="mvu">预览最新快照</button><pre id="cmrag-mvu"></pre>';
 if(page==='API / Presets')renderApiSettings(main,draft,Api,app.db,app.logger);
 if(page==='检索与注入')main.innerHTML=field('topK','最多命中块数','number')+field('threshold','召回阈值','number')+field('vectorWeight','向量权重 0–1','number')+field('budget','注入 Token 预算（无 tokenizer 时使用字符上限）','number')+field('depth','聊天注入深度','number')+`<label>位置<select data-field="position"><option value="1" ${Number(draft.position)===1?'selected':''}>聊天内</option><option value="0" ${Number(draft.position)===0?'selected':''}>主提示词后</option><option value="2" ${Number(draft.position)===2?'selected':''}>主提示词前</option></select></label>`+field('rerankEnabled','启用 Rerank','checkbox');
 if(page==='数据管理')main.innerHTML='<h2>IndexedDB 数据</h2><button data-action="export">导出数据（不含密钥）</button><label>合并导入<input type="file" id="cmrag-import" accept="application/json"></label><button data-action="clear">清理当前聊天索引</button><p>导入会按相同 ID 覆盖。消息来源对应原聊天；复制的聊天需要重新索引。</p>';
 if(page==='诊断'){
  main.innerHTML=field('debugMode','Debug 模式：记录详细阶段并输出到浏览器控制台','checkbox')+field('logLimit','最多保留日志条数（50–2000）','number')+'<p>普通模式保留运行结果、警告和错误；Debug 增加缓存命中、请求阶段、生命周期与召回分数。不记录密钥、聊天正文、MVU 值或向量。</p><button id="cmrag-refresh-logs">刷新日志</button> <button id="cmrag-export-logs">导出日志</button> <button id="cmrag-clear-logs">清空日志</button><label>日志级别<select id="cmrag-log-level"><option value="all">全部</option><option value="debug">Debug</option><option value="info">Info</option><option value="warn">Warning</option><option value="error">Error</option></select></label><pre id="cmrag-logs"></pre><details><summary>运行状态（可能包含召回正文，仅本机显示）</summary><pre>'+escape(JSON.stringify({dependencies:app.dependencies(),...app.status},null,2))+'</pre></details>';
  const refresh=async()=>{try{const level=main.querySelector('#cmrag-log-level').value;const rows=(await app.logger.all()).filter(r=>level==='all'||r.level===level);main.querySelector('#cmrag-logs').textContent=rows.map(r=>`${r.time} [${r.level}] ${r.event}\n${JSON.stringify(r.details)}`).join('\n\n')||'暂无日志';if(app.logger.failure)main.querySelector('#cmrag-logs').textContent+='\n'+app.logger.failure;}catch(e){main.querySelector('#cmrag-logs').textContent=e.message;}};
  main.querySelector('#cmrag-refresh-logs').onclick=refresh;main.querySelector('#cmrag-log-level').onchange=refresh;
  main.querySelector('#cmrag-clear-logs').onclick=async()=>{try{await app.logger.clear();await refresh();}catch(e){alert(e.message);}};
  main.querySelector('#cmrag-export-logs').onclick=async()=>{try{const url=URL.createObjectURL(new Blob([JSON.stringify(await app.logger.export(),null,2)],{type:'application/json'}));const link=document.createElement('a');link.href=url;link.download='chat-memory-rag-logs.json';link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}catch(e){alert(e.message);}};
  await refresh();
 }
 if(page==='TODO')main.innerHTML='<h2>额外解析 · 待定</h2><p>人物约定、承诺、长期事实与未解决事项的额外 API 抽取。</p><p>待确定：抽取时机、去重、事实更新、来源追踪、独立 API 与提示词设置。本页不发送 API 请求。</p>';
 dialog.querySelectorAll('[data-page]').forEach(b=>b.onclick=()=>{collect();page=b.dataset.page;render();});dialog.querySelectorAll('[data-action]').forEach(b=>b.onclick=()=>action(b.dataset.action));const file=main.querySelector('#cmrag-import');if(file)file.onchange=async()=>{if(!file.files[0]||!confirm('将合并导入数据，同 ID 记录会被覆盖。继续？'))return;try{await app.db.import(JSON.parse(await file.files[0].text()));alert('已导入；重新打开面板以读取设置，刷新页面使其生效。');}catch(e){alert(e.message);}};
 }
 async function action(a){try{collect();if(a==='close'){dialog.close();return;}if(a==='save'){if(dialog.querySelector(':invalid'))throw Error('请修正无效的覆盖配置');if(!/^[A-Za-z][A-Za-z0-9_-]*$/.test(draft.summaryTag))throw Error('摘要标签格式无效');for(const k of ['chunkSize','topK','budget'])if(!(Number(draft[k])>0))throw Error(`${k} 必须大于零`);if(draft.vectorWeight<0||draft.vectorWeight>1)throw Error('向量权重应在 0 到 1 之间');await app.save(structuredClone(draft));}if(a==='sync')await app.sync();if(a==='preview')dialog.querySelector('#cmrag-preview').textContent=extract(dialog.querySelector('#cmrag-original').value,draft)||'⚠ 没有可索引内容';if(a==='mvu'){const d=globalThis.Mvu?.getMvuData({type:'message',message_id:'latest'});dialog.querySelector('#cmrag-mvu').textContent=d?.stat_data?mvuText(d.stat_data,draft):'未检测到 MVU 快照';}if(a==='search'){const r=await app.search(dialog.querySelector('#cmrag-query').value);dialog.querySelector('#cmrag-results').textContent=r.map(x=>`楼层 ${x.index} / ${x.kind} / ${x.score.toFixed(3)}\n${x.text}`).join('\n\n')+'\n\n注入预览：\n'+app.status.injection;}if(a==='add-preset'){draft.presets.push({id:crypto.randomUUID(),name:'新预设',base:'',key:'',model:'',dimensions:0,timeout:20000,retries:1});await render();}if(a==='export'){const blob=new Blob([JSON.stringify(await app.db.export(),null,2)],{type:'application/json'});const url=URL.createObjectURL(blob);const link=document.createElement('a');link.href=url;link.download='chat-memory-rag.json';link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}if(a==='clear'&&confirm('清理当前聊天的 RAG 索引？原聊天不受影响。'))await app.clear();const state=dialog.querySelector('#cmrag-state');if(state)state.textContent=app.status.message;}catch(e){alert(e.message);}}
 entry.querySelector('[data-entry-open]').onclick=()=>{draft=structuredClone(app.getSettings());render();dialog.showModal();};
 dialog.addEventListener('close',refreshEntry);
}
