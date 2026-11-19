// Per-floor memory view: one entry for every chat message, indexed or not.
export const overrideId=(key,uid,swipe,kind)=>'override:'+JSON.stringify([key,uid,swipe,kind]);
export const missingId=(key,uid,swipe)=>JSON.stringify([key,uid,swipe]);
// floors: [{index,uid,swipe,role,name,text,hash}]; records: this chat's records;
// states: Map id -> indexState row (missing reasons and overrides).
export function buildFloors(floors,records,states,s){
 const byKey=new Map();
 for(const r of records){const k=`${r.uid}\n${r.swipe}\n${r.kind}`;if(!byKey.has(k))byKey.set(k,[]);byKey.get(k).push(r);}
 return floors.map(f=>{
  const kinds={};
  for(const kind of ['content','mvu']){
   const rows=(byKey.get(`${f.uid}\n${f.swipe}\n${kind}`)||[]).sort((a,b)=>a.chunk-b.chunk);
   const o=states.get(overrideId(s.chatKey,f.uid,f.swipe,kind));const override=o&&o.sourceHash===f.hash?(o.excluded?'excluded':'edited'):null;
   if(kind==='mvu'&&!rows.length&&!override)continue;
   let note='';
   if(!rows.length){
    const missing=states.get(missingId(s.chatKey,f.uid,f.swipe));
    note=override==='excluded'?'已删除：不会自动生成，点「重新生成」恢复'
     :f.role==='system'?'系统消息，不自动索引'
     :f.role==='user'&&!s.indexUsers?'用户消息（未开启「同时索引用户消息」），不自动索引'
     :missing&&missing.sourceHash===f.hash?missing.message
     :'尚未索引，点「更新索引」生成';
   }
   kinds[kind]={text:rows.map(r=>r.text).join(''),chunks:rows.length,override,note};
  }
  const content=kinds.content;
  const state=content.override==='excluded'?'excluded':content.chunks?(content.override==='edited'?'edited':'indexed'):'empty';
  return {...f,kinds,state};
 });
}
