import {test} from 'node:test';
import assert from 'node:assert/strict';
import {buildFloors,overrideId,missingId} from '../src/floors.js';
const key='["","a.png","chat"]';
const floor=(index,role,extra={})=>({index,uid:'u'+index,swipe:0,role,name:'',text:'原文'+index,hash:'h'+index,...extra});
const rec=(index,kind,chunk,text)=>({uid:'u'+index,swipe:0,kind,chunk,text});
const view=(floors,records=[],states=[],indexUsers=false)=>buildFloors(floors,records,new Map(states.map(s=>[s.id,s])),{chatKey:key,indexUsers});
test('every floor is listed, including ones without memory, with the reason',()=>{
 const out=view([floor(0,'assistant'),floor(1,'user'),floor(2,'assistant'),floor(3,'system'),floor(4,'assistant')],[rec(0,'content',0,'摘要零')],[{id:missingId(key,'u2',0),message:'Summary 缺失或为空，跳过 embedding',sourceHash:'h2'}]);
 assert.deepEqual(out.map(f=>f.index),[0,1,2,3,4]);
 assert.deepEqual(out.map(f=>f.state),['indexed','empty','empty','empty','empty']);
 assert.equal(out[0].kinds.content.text,'摘要零');
 assert.match(out[1].kinds.content.note,/未开启「同时索引用户消息」/);
 assert.equal(out[2].kinds.content.note,'Summary 缺失或为空，跳过 embedding');
 assert.match(out[3].kinds.content.note,/系统消息/);
 assert.match(out[4].kinds.content.note,/尚未索引/);
});
test('chunks are joined in order and MVU appears only when present',()=>{
 const [f]=view([floor(0,'assistant')],[rec(0,'content',1,'后半'),rec(0,'content',0,'前半'),rec(0,'mvu',0,'角色.好感=1')]);
 assert.equal(f.kinds.content.text,'前半后半');assert.equal(f.kinds.content.chunks,2);assert.equal(f.kinds.mvu.text,'角色.好感=1');
 assert.equal(view([floor(1,'assistant')])[0].kinds.mvu,undefined);
});
test('manual edits and deletes show, and lapse once the message text changes',()=>{
 const states=[{id:overrideId(key,'u0',0,'content'),text:'手改',sourceHash:'h0'},{id:overrideId(key,'u1',0,'content'),excluded:true,sourceHash:'h1'}];
 const out=view([floor(0,'assistant'),floor(1,'assistant')],[rec(0,'content',0,'手改')],states);
 assert.equal(out[0].state,'edited');assert.equal(out[1].state,'excluded');assert.match(out[1].kinds.content.note,/已删除/);
 const changed=view([floor(1,'assistant',{hash:'new'})],[],states);
 assert.equal(changed[0].state,'empty');assert.match(changed[0].kinds.content.note,/尚未索引/);
});
test('a stale missing-reason is not shown after the message changed',()=>{
 const [f]=view([floor(0,'assistant',{hash:'new'})],[],[{id:missingId(key,'u0',0),message:'旧原因',sourceHash:'old'}]);
 assert.match(f.kinds.content.note,/尚未索引/);
});
