import {test} from 'node:test';
import assert from 'node:assert/strict';
import {defaults,config} from '../src/core.js';
import {migrateApiSettings} from '../src/api-settings.js';
import {Api} from '../src/api.js';
test('migration separates text/embedding/rerank and preserves existing endpoints',()=>{
 const old=structuredClone(defaults);old.presets[0].base='https://embed.example/v1';old.presets[0].key='secret';old.calls.rerank.overrides={base:'https://rank.example/v1',model:'rank'};
 const s=migrateApiSettings(old);assert.equal(new Set(s.presets.map(p=>p.id)).size,3);assert.equal(config(s,'document').base,'https://embed.example/v1');assert.equal(config(s,'query').key,'secret');assert.equal(config(s,'rerank').base,'https://rank.example/v1');assert.equal(config(s,'text').base,'');
 config(s,'text').base='changed';assert.equal(config(s,'document').base,'https://embed.example/v1');assert.deepEqual(migrateApiSettings(s),s);
});
test('query and document use the same embedding configuration',()=>{const s=migrateApiSettings(defaults);s.presets.find(p=>p.id===s.calls.document.preset).model='embedding-new';assert.equal(config(s,'query').model,'embedding-new');assert.notEqual(s.calls.rerank.preset,s.calls.document.preset);});
test('model discovery uses selected independent endpoint and GET without a body',async()=>{const s=migrateApiSettings(defaults);s.presets.find(p=>p.id===s.calls.text.preset).base='https://text.example/v1';const original=globalThis.fetch;let request;globalThis.fetch=async(url,options)=>{request={url,options};return {ok:true,status:200,json:async()=>({data:[{id:'model'}]})};};try{const api=new Api({},()=>s);await api.request('text','models',null,'GET');assert.equal(request.url,'https://text.example/v1/models');assert.equal(request.options.method,'GET');assert.equal(request.options.body,undefined);}finally{globalThis.fetch=original;}});
