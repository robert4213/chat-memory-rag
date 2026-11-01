import {test} from 'node:test';
import assert from 'node:assert/strict';
import {defaults} from '../src/core.js';
import {migrateApiSettings} from '../src/api-settings.js';
import {summaryText} from '../src/summary.js';
function fixture(){const settings=migrateApiSettings(defaults),rows=new Map();let count=0,last;const db={get:async(s,k)=>rows.get(k),put:async(s,v)=>rows.set(v.id,v)};const api={request:async(kind,path,body)=>{count++;last={kind,path,body};return {choices:[{message:{content:'<think>hidden</think><summary>港口约定</summary>'}}]};}};return {settings,db,api,rows,count:()=>count,last:()=>last};}
test('separate Text API receives filtered source and cache prevents duplicate calls',async()=>{const f=fixture();f.settings.summaryInclude='scene';const raw='<think>secret</think><scene>港口</scene><UpdateVariable>private</UpdateVariable>';assert.equal(await summaryText(raw,f.settings,f.api,f.db),'港口约定');assert.equal(f.last().kind,'text');assert.equal(f.last().body.messages[1].content,'港口');await summaryText(raw,f.settings,f.api,f.db);assert.equal(f.count(),1);f.settings.summaryPrompt+='新规则';await summaryText(raw,f.settings,f.api,f.db);assert.equal(f.count(),2);});
test('empty filtered source skips Text API; empty output is not cached',async()=>{const f=fixture();assert.equal(await summaryText('<think>secret</think>',f.settings,f.api,f.db),'');assert.equal(f.count(),0);f.api.request=async()=>({choices:[{message:{content:'<summary> </summary>'}}]});assert.equal(await summaryText('正文',f.settings,f.api,f.db),'');assert.equal(f.rows.size,0);});
test('obsolete generation response cannot enter summary cache',async()=>{const f=fixture();assert.equal(await summaryText('旧分支',f.settings,f.api,f.db,()=>false),'');assert.equal(f.rows.size,0);});
