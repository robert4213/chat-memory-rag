const sensitive=/key|authorization|password|secret|token|prompt|content|text|body|headers|vector|query|input/i;
export function sanitize(value,secrets=[]){
 if(typeof value==='string'){
  let text=value;
  for(const secret of secrets.filter(x=>typeof x==='string'&&x.length))text=text.split(secret).join('[REDACTED]');
  return text.replace(/Bearer\s+[^\s"']+/gi,'Bearer [REDACTED]').replace(/\bsk-[\w-]+/g,'[REDACTED]').replace(/https?:\/\/[^\s]+/gi,'[URL]').slice(0,800);
 }
 if(Array.isArray(value))return value.slice(0,30).map(x=>sanitize(x,secrets));
 if(value&&typeof value==='object')return Object.fromEntries(Object.entries(value).slice(0,30).map(([k,v])=>[k,sensitive.test(k)?'[REDACTED]':sanitize(v,secrets)]));
 return value;
}
export class Logger {
 constructor(db,settings){this.db=db;this.settings=settings;this.pending=Promise.resolve();this.failure=null;}
 write(level,event,details={}){
  const s=this.settings();if(level==='debug'&&!s.debugMode)return Promise.resolve();
  const secrets=[...(s.presets||[]).map(p=>p.key),...Object.values(s.calls||{}).map(c=>c.overrides?.key)];
  const row={id:crypto.randomUUID(),time:new Date().toISOString(),level,event:sanitize(event,secrets),details:sanitize(details,secrets)};
  if(s.debugMode){const method=level==='error'?'error':level==='warn'?'warn':'debug';console[method]('[Chat Memory RAG]',row);}
  this.pending=this.pending.catch(()=>{}).then(async()=>{await this.db.put('logs',row);const rows=(await this.db.all('logs')).sort((a,b)=>a.time.localeCompare(b.time)||a.id.localeCompare(b.id));const cap=Math.max(50,Math.min(2000,Number(s.logLimit)||300));for(const old of rows.slice(0,Math.max(0,rows.length-cap)))await this.db.delete('logs',old.id);}).catch(()=>{this.failure='日志存储失败，请检查浏览器存储空间';});
  return this.pending;
 }
 async all(){await this.pending;return (await this.db.all('logs')).sort((a,b)=>b.time.localeCompare(a.time));}
 async clear(){await this.pending;for(const row of await this.db.all('logs'))await this.db.delete('logs',row.id);}
 async export(){return {version:1,exportedAt:new Date().toISOString(),logs:await this.all()};}
}
