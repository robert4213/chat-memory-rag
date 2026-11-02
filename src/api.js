import {config,hash,modelSpace,validVector} from './core.js';
export class Api {
 constructor(db,settings,logger=null){this.db=db;this.settings=settings;this.pending=new Map();this.logger=logger;}
 async request(kind,path,body,method='POST'){
  const c=config(this.settings(),kind),label={text:'Text 摘要/文本生成',document:'Embedding 文档',query:'Embedding 查询',rerank:'Rerank 重排序'}[kind]||kind;
  if(!c.base||(method!=='GET'&&!c.model))throw new Error(`${label}：请配置 API 地址和模型`);let error;
  const callId=crypto.randomUUID(),url=c.base.replace(/\/+$/,'')+'/'+path,payload=method==='GET'?null:{model:c.model,...body};
  const timeoutMs=Math.max(1000,Math.min(300000,Number(c.timeout)||300000)),maxAttempts=1+Math.max(0,Math.min(3,Number(c.retries)||0));
  for(let i=0;i<maxAttempts;i++){
   const started=Date.now(),attempt=i+1;
   this.logger?.write('debug','api.request',{callId,kind,model:c.model,attempt,maxAttempts,timeoutMs,url,method,body:payload},[c.key]);
   let timedOut=false,httpStatus=null,requestId=null;
   const controller=new AbortController();const timer=setTimeout(()=>{timedOut=true;controller.abort();},timeoutMs);
   try{
    const r=await fetch(url,{method,headers:{'Content-Type':'application/json',...(c.key?{Authorization:`Bearer ${c.key}`}:{})},...(payload?{body:JSON.stringify(payload)}:{}),signal:controller.signal});
    requestId=r.headers?.get('request-id')||r.headers?.get('x-request-id')||null;httpStatus=r.status;
    if(!r.ok){let response='',responseReadError=null;try{response=typeof r.text==='function'?await r.text():'';}catch(readError){responseReadError=readError.message;}
     this.logger?.write('error','api.http_error',{callId,kind,label,model:c.model,attempt,maxAttempts,status:r.status,statusText:r.statusText||'',path,requestId,ms:Date.now()-started,response:response||'[empty response body]',responseReadError},[c.key]);
     let provider='';try{const parsed=JSON.parse(response);provider=String(parsed.error?.message||parsed.message||'');}catch{provider=response.replace(/<[^>]*>/g,' ').replace(/\s+/g,' ').trim();}
     if(c.key)provider=provider.split(c.key).join('[REDACTED]');provider=provider.replace(/Bearer\s+\S+/gi,'Bearer [REDACTED]').replace(/\bsk-[\w-]+/g,'[REDACTED]');
     const failure=new Error(`${label} [${c.model}] /${path}：HTTP ${r.status}${provider?' — '+provider.slice(0,400):'，响应为空'}${responseReadError?'（响应正文读取失败）':''}`);failure.category='http';throw failure;
    }
    let data;try{data=await r.json();}catch(parseError){if(timedOut)throw parseError;const invalid=new Error(`${label} [${c.model}] /${path}：HTTP ${r.status} 响应不是有效 JSON`);invalid.category='invalid_json';throw invalid;}
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
