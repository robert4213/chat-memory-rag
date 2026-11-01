import {test} from 'node:test';
import assert from 'node:assert/strict';
import {selectInput} from '../src/menu.js';
import {Api} from '../src/api.js';
import {defaults} from '../src/core.js';
test('menu uses composer first and falls back to latest real user message',()=>{const chat=[{is_user:true,mes:'历史输入'},{is_user:false,mes:'回答'},{is_user:true,is_system:true,mes:'system'}];assert.equal(selectInput(' 草稿 ',chat),'草稿');assert.equal(selectInput(' ',chat),'历史输入');assert.equal(selectInput('',[]),'');});
test('forced input embedding bypasses cache and preserves previous vector on failure',async()=>{const rows=new Map();const db={get:async(s,id)=>rows.get(id),put:async(s,v)=>rows.set(v.id,v)};const api=new Api(db,()=>defaults);let calls=0;api.request=async()=>({data:[{embedding:[++calls,1]}]});const first=await api.embed('input','query');const second=await api.embed('input','query',{force:true});assert.equal(calls,2);assert.equal(first.id,second.id);assert.deepEqual((await api.embed('input','query')).vector,[2,1]);api.request=async()=>{throw Error('offline');};await assert.rejects(api.embed('input','query',{force:true}));assert.deepEqual((await api.embed('input','query')).vector,[2,1]);});
