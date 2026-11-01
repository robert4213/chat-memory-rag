const stores=['settings','records','embeddings','indexState','logs'];
export class Database {
 constructor(name='st-chat-memory-rag-v1'){this.ready=new Promise((resolve,reject)=>{const r=indexedDB.open(name,2);r.onupgradeneeded=()=>{for(const s of stores)if(!r.result.objectStoreNames.contains(s))r.result.createObjectStore(s,{keyPath:'id'});};r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);r.onblocked=()=>reject(new Error('数据库升级被其他酒馆标签页阻塞，请关闭其他标签页后刷新'));});}
 async transaction(store,mode,fn){const db=await this.ready;return new Promise((resolve,reject)=>{const tx=db.transaction(store,mode);const r=fn(tx.objectStore(store));tx.oncomplete=()=>resolve(r?.result);tx.onerror=()=>reject(tx.error);tx.onabort=()=>reject(tx.error||new Error('数据库事务已取消'));});}
 get(s,id){return this.transaction(s,'readonly',o=>o.get(id));}
 all(s){return this.transaction(s,'readonly',o=>o.getAll());}
 put(s,value){return this.transaction(s,'readwrite',o=>o.put(value));}
 delete(s,id){return this.transaction(s,'readwrite',o=>o.delete(id));}
 async export(){const out={version:1};for(const s of stores)out[s]=await this.all(s);for(const r of out.settings){if(r.value?.presets)r.value.presets.forEach(p=>p.key='');if(r.value?.apiSavedPresets)for(const list of Object.values(r.value.apiSavedPresets))for(const p of list)if(p.config)p.config.key='';if(r.value?.calls)Object.values(r.value.calls).forEach(c=>{if(c.overrides)delete c.overrides.key;});}return out;}
 async import(data){if(data.version!==1)throw new Error('不支持的数据版本');for(const s of stores)if(!Array.isArray(data[s]))throw new Error(`缺少数据表 ${s}`);const db=await this.ready;await new Promise((resolve,reject)=>{const tx=db.transaction(stores,'readwrite');try{for(const s of stores)for(const row of data[s]){if(typeof row.id!=='string')throw new Error('无效记录');tx.objectStore(s).put(row);}}catch(e){tx.abort();reject(e);}tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error);});}
}
