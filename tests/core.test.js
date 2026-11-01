import {test} from 'node:test';
import assert from 'node:assert/strict';
import {defaults,extract,mvuText,stable,hash,cosine,modelSpace} from '../src/core.js';
import {Api} from '../src/api.js';
test('exclude executes before include; missing summary never falls back',()=>{
 const s={...defaults,mode:'summary'};
 assert.equal(extract('<think><summary>secret</summary></think>正文<summary>港口约定</summary>',s),'港口约定');
 assert.equal(extract('只有正文',s),'');
 assert.equal(extract('<summary>未闭合',s),'');
 assert.equal(extract('正文<thinking>未闭合秘密',defaults),'正文');
});
test('multiple includes preserve source order and remove tags',()=>assert.equal(extract('<b>一</b><a>二</a>',{...defaults,include:'a,b'}),'一\n二'));
test('MVU paths filter before embedding and arrays retain order',()=>{
 const s={...defaults,mvuPaths:'角色',mvuExclude:'角色.秘密'};
 assert.equal(mvuText({角色:{秘密:'x',背包:['b','a'],好感:0,$internal:'secret'},地点:'港口'},s),'角色.好感=0\n角色.背包=["b","a"]');
 assert.deepEqual(stable({b:2,a:null,$internal:1}),{a:null,b:2});
});
test('hash canonical state and model namespaces',async()=>{
 assert.equal(await hash(JSON.stringify(stable({a:1,b:2}))),await hash(JSON.stringify(stable({b:2,a:1}))));
 assert.notEqual(await hash(''),await hash('null'));
 assert.notEqual(modelSpace({base:'https://a',model:'a'}),modelSpace({base:'https://a',model:'b'}));
 assert.equal(cosine([1,0],[1,0]),1);assert.equal(cosine([1],[1,0]),0);
});
test('concurrent and repeated embeddings share a single request',async()=>{
 const data=new Map();const db={get:async(s,id)=>data.get(id),put:async(s,v)=>data.set(v.id,v)};
 const s=structuredClone(defaults);s.presets[0].base='https://example.test/v1';s.presets[0].model='test';
 let calls=0;const api=new Api(db,()=>s);api.request=async()=>{calls++;await new Promise(r=>setTimeout(r,5));return {data:[{embedding:[1,2]}]};};
 const [a,b]=await Promise.all([api.embed('港口'),api.embed('港口')]);assert.equal(a.id,b.id);await api.embed('港口');assert.equal(calls,1);
 s.presets[0].model='changed';await api.embed('港口');assert.equal(calls,2);
});
test('invalid embeddings do not enter cache',async()=>{
 const api=new Api({get:async()=>null,put:async()=>assert.fail('invalid cached')},()=>defaults);api.request=async()=>({data:[{embedding:[0,0]}]});await assert.rejects(api.embed('x'),/无效向量/);
});
