const stores=['settings','records','embeddings','indexState','logs'];
export class Database {
 constructor(name='st-chat-memory-rag-v1'){this.ready=new Promise((resolve,reject)=>{const r=indexedDB.open(name,3);r.onupgradeneeded=()=>{for(const s of stores)if(!r.result.objectStoreNames.contains(s))r.result.createObjectStore(s,{keyPath:'id'});const records=r.transaction.objectStore('records'),logs=r.transaction.objectStore('logs');if(!records.indexNames.contains('chat'))records.createIndex('chat','chat');if(!logs.indexNames.contains('time'))logs.createIndex('time','time');};r.onsuccess=()=>{r.result.onversionchange=()=>r.result.close();resolve(r.result);};r.onerror=()=>reject(r.error);r.onblocked=()=>reject(new Error('数据库升级被其他酒馆标签页阻塞，请关闭其他标签页后刷新'));});}
 async transaction(store,mode,fn){const db=await this.ready;return new Promise((resolve,reject)=>{const tx=db.transaction(store,mode);const r=fn(tx.objectStore(store));tx.oncomplete=()=>resolve(Array.isArray(r)?r.map(x=>x.result):r?.result);tx.onerror=()=>reject(tx.error);tx.onabort=()=>reject(tx.error||new Error('数据库事务已取消'));});}
 get(s,id){return this.transaction(s,'readonly',o=>o.get(id));}
 getMany(s,ids){return ids.length?this.transaction(s,'readonly',o=>ids.map(id=>o.get(id))):Promise.resolve([]);}
 all(s){return this.transaction(s,'readonly',o=>o.getAll());}
 chat(key){return this.transaction('records','readonly',o=>o.index('chat').getAll(key));}
 put(s,value){return this.transaction(s,'readwrite',o=>o.put(value));}
 putMany(s,values){return values.length?this.transaction(s,'readwrite',o=>{for(const v of values)o.put(v);}):Promise.resolve();}
 delete(s,id){return this.transaction(s,'readwrite',o=>o.delete(id));}
 deleteMany(s,ids){return ids.length?this.transaction(s,'readwrite',o=>{for(const id of ids)o.delete(id);}):Promise.resolve();}
 clear(s){return this.transaction(s,'readwrite',o=>o.clear());}
 // Keep the newest `keep` rows, ordered by the given index; one transaction, no full read.
 trim(s,index,keep){return this.transaction(s,'readwrite',o=>{const c=o.count();c.onsuccess=()=>{const extra=c.result-keep;if(extra>0){const k=o.index(index).getAllKeys(null,extra);k.onsuccess=()=>{for(const id of k.result)o.delete(id);};}};});}
 async export(){const out={version:1};for(const s of stores)out[s]=await this.all(s);for(const r of out.settings){if(r.value?.presets)r.value.presets.forEach(p=>p.key='');if(r.value?.apiSavedPresets)for(const list of Object.values(r.value.apiSavedPresets))for(const p of list)if(p.config)p.config.key='';if(r.value?.calls)Object.values(r.value.calls).forEach(c=>{if(c.overrides)delete c.overrides.key;});}return out;}
 async import(data){if(data.version!==1)throw new Error('不支持的数据版本');for(const s of stores)if(!Array.isArray(data[s]))throw new Error(`缺少数据表 ${s}`);const db=await this.ready;await new Promise((resolve,reject)=>{const tx=db.transaction(stores,'readwrite');try{for(const s of stores)for(const row of data[s]){if(typeof row.id!=='string')throw new Error('无效记录');tx.objectStore(s).put(row);}}catch(e){tx.abort();reject(e);}tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error);});}
}
