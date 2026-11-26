import {config,hash,modelSpace,validVector} from './core.js';
// SillyTavern CORS proxy route: /proxy/<absolute url>. Requires enableCorsProxy: true in ST's config.yaml.
export const proxyUrl=url=>'/proxy/'+url;
const redactSecrets=(text,key)=>{let t=String(text);if(key)t=t.split(key).join('[REDACTED]');return t.replace(/Bearer\s+\S+/gi,'Bearer [REDACTED]').replace(/\bsk-[\w-]+/g,'[REDACTED]');};
// ST's own headers carry the CSRF token; the proxy strips it before forwarding.
const stHeaders=()=>{try{return globalThis.SillyTavern?.getContext?.()?.getRequestHeaders?.()||{};}catch{return {};}};
export function proxyHint(status,body=''){
 if(status===404&&/CORS proxy is disabled/i.test(body))return '酒馆 CORS 代理未开启：在 SillyTavern 的 config.yaml 设置 enableCorsProxy: true 并重启，或在「API / Presets」关闭「通过酒馆代理」';
 if(status===403&&/csrf/i.test(body))return '酒馆拒绝了请求（CSRF 校验失败），请刷新页面后重试';
 if(status===400&&/Circular requests/i.test(body))return 'API 地址指向了酒馆自身，代理不能转发';
 // The proxy answers a failed upstream fetch with sendStatus(500): body "Internal Server Error".
 if(status===500&&/^(Internal Server Error)?$/i.test(String(body).trim()))return '酒馆服务器连不上这个地址。代理模式下由酒馆服务器访问 API，localhost 指的是酒馆所在的机器';
 return '';
}
export class Api {
 constructor(db,settings,logger=null){this.db=db;this.settings=settings;this.pending=new Map();this.logger=logger;}
 async request(kind,path,body,method='POST'){
  const c=config(this.settings(),kind),label={text:'Text 摘要/文本生成',document:'Embedding 文档',query:'Embedding 查询',rerank:'Rerank 重排序'}[kind]||kind;
  if(!c.base||(method!=='GET'&&!c.model))throw new Error(`${label}：请配置 API 地址和模型`);let error;
  // apiProxy: send through SillyTavern's CORS proxy (/proxy/<url>, needs enableCorsProxy). The ST server then reaches the API.
  const proxied=!!this.settings().apiProxy,url=c.base.replace(/\/+$/,'')+'/'+path,target=proxied?proxyUrl(url):url,via=proxied?'sillytavern-proxy':'direct';
  const callId=crypto.randomUUID(),payload=method==='GET'?null:{model:c.model,...body};
  const timeoutMs=Math.max(1000,Math.min(300000,Number(c.timeout)||300000)),maxAttempts=1+Math.max(0,Math.min(3,Number(c.retries)||0));
  for(let i=0;i<maxAttempts;i++){
   const started=Date.now(),attempt=i+1;
   this.logger?.write('debug','api.request',{callId,kind,model:c.model,attempt,maxAttempts,timeoutMs,url,via,method,body:payload},[c.key]);
   let timedOut=false,httpStatus=null,requestId=null;
   const controller=new AbortController();const timer=setTimeout(()=>{timedOut=true;controller.abort();},timeoutMs);
   try{
    const r=await fetch(target,{method,headers:{...(proxied?stHeaders():{}),'Content-Type':'application/json',...(c.key?{Authorization:`Bearer ${c.key}`}:{})},...(payload?{body:JSON.stringify(payload)}:{}),signal:controller.signal});
    requestId=r.headers?.get('request-id')||r.headers?.get('x-request-id')||null;httpStatus=r.status;
    if(!r.ok){let response='',responseReadError=null;try{response=typeof r.text==='function'?await r.text():'';}catch(readError){responseReadError=readError.message;}
     this.logger?.write('error','api.http_error',{callId,kind,label,model:c.model,via,attempt,maxAttempts,status:r.status,statusText:r.statusText||'',path,requestId,ms:Date.now()-started,response:response||'[empty response body]',responseReadError},[c.key]);
     let provider='';try{const parsed=JSON.parse(response);provider=String(parsed.error?.message||parsed.message||'');}catch{provider=response.replace(/<[^>]*>/g,' ').replace(/\s+/g,' ').trim();}
     if(c.key)provider=provider.split(c.key).join('[REDACTED]');provider=provider.replace(/Bearer\s+\S+/gi,'Bearer [REDACTED]').replace(/\bsk-[\w-]+/g,'[REDACTED]');
     const hint=proxied?proxyHint(r.status,response):'';
     const detail=`${label} [${c.model}] /${path}：HTTP ${r.status}${provider?' — '+provider.slice(0,400):'，响应为空'}${responseReadError?'（响应正文读取失败）':''}`;
     const failure=new Error(hint?`${detail.replace(/[.。]\s*$/,'')}。${hint}`:detail);failure.category='http';throw failure;
    }
    // Read as text first so a non-JSON body (e.g. an HTML login or gateway page) can be reported.
    let data,raw=null;try{if(typeof r.text==='function'){raw=await r.text();data=JSON.parse(raw);}else data=await r.json();}catch(parseError){if(timedOut)throw parseError;
     const body=String(raw??''),type=r.headers?.get?.('content-type')||'',html=/^\s*</.test(body)||/html/i.test(type);
     this.logger?.write('error','api.invalid_json',{callId,kind,label,model:c.model,via,status:r.status,contentType:type,finalUrl:r.url||target,redirected:!!r.redirected,ms:Date.now()-started,body:body.slice(0,4000)},[c.key]);
     const head=redactSecrets(body.replace(/\s+/g,' ').trim().slice(0,120),c.key);
     const where=html?'返回的是网页（HTML）而不是 JSON，请求很可能没有到达 API（被登录页、首页、网关或代理拦下）':head?`响应开头：${head}`:'响应为空';
     const invalid=new Error(`${label} [${c.model}] /${path}：HTTP ${r.status} 响应不是有效 JSON。${where}${proxied?'。当前通过酒馆代理：请确认酒馆 config.yaml 已设置 enableCorsProxy: true 并重启，或在「API / Presets」关闭代理改为直连':''}。详情见「诊断」日志 api.invalid_json`);invalid.category='invalid_json';throw invalid;}
    this.logger?.write('debug','api.response',{callId,kind,attempt,status:r.status,requestId,ms:Date.now()-started,response:data},[c.key]);
    this.logger?.write('info','api.success',{callId,kind,model:c.model,attempt,ms:Date.now()-started,status:r.status,requestId,generationId:data.id,usage:data.usage});return data;
   }catch(e){const category=e.category||(timedOut?'timeout':e.name==='AbortError'?'aborted':'network');const prefix=`${label} [${c.model}] /${path}`;
    error=e.category?e:new Error(timedOut?`${prefix}：请求超时 ${timeoutMs/1000} 秒（第 ${attempt}/${maxAttempts} 次）`:category==='aborted'?`${prefix}：请求被取消（非超时）`:`${prefix}：网络请求失败 — ${e.message}`);
    error.category=category;this.logger?.write('warn','api.failure',{callId,kind,label,model:c.model,path,attempt,maxAttempts,category,status:httpStatus,requestId,timeoutMs,ms:Date.now()-started,reason:error.message},[c.key]);
   }finally{clearTimeout(timer);}
  }throw error;
 }
 async embed(text,kind='document',{force=false}={}){const c=config(this.settings(),kind);const id=await hash(modelSpace(c)+'\n'+text);if(force&&this.pending.has(id))await this.pending.get(id).catch(()=>{});const cached=!force&&await this.db.get('embeddings',id);if(cached){this.logger?.write('debug','embedding.cache_hit',{kind,hash:id});return cached;}if(this.pending.has(id)){this.logger?.write('debug','embedding.shared_request',{kind,hash:id});return this.pending.get(id);}this.logger?.write('debug',force?'embedding.forced':'embedding.cache_miss',{kind,hash:id,characters:text.length});
 const p=(async()=>{const data=await this.request(kind,'embeddings',{input:text,...(Number(c.dimensions)>0?{dimensions:Number(c.dimensions)}:{})});const vector=data.data?.[0]?.embedding;if(!validVector(vector))throw new Error('Embedding 返回了无效向量');const row={id,space:modelSpace(c),vector};await this.db.put('embeddings',row);return row;})();this.pending.set(id,p);try{return await p;}finally{this.pending.delete(id);}}
 async rerank(query,items){const data=await this.request('rerank','rerank',{query,documents:items.map(x=>x.text),top_n:items.length});if(!Array.isArray(data.results))throw new Error('Rerank 返回格式错误');const seen=new Set();return data.results.filter(r=>Number.isInteger(r.index)&&items[r.index]&&Number.isFinite(r.relevance_score)&&!seen.has(r.index)&&(seen.add(r.index))).map(r=>({...items[r.index],score:r.relevance_score}));}
}
