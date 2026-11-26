import {test} from 'node:test';
import assert from 'node:assert/strict';
import {pickRecent,recentText,buildQuery,buildInjection,INJECTION_HEADER,RECENT_CONTENT_MAX} from '../src/recent.js';
const floor=(index,role)=>({uid:'u'+index,swipe:0,index,role});
const chars=async t=>t.length;
test('recent rounds are the last n assistant floors; user and system floors do not count',()=>{
 const floors=[floor(0,'assistant'),floor(1,'user'),floor(2,'assistant'),floor(3,'user'),floor(4,'system'),floor(5,'assistant'),floor(6,'user')];
 assert.deepEqual(pickRecent(floors,2).map(f=>f.index),[2,5]);
 assert.deepEqual(pickRecent(floors,5).map(f=>f.index),[0,2,5]);
 assert.deepEqual(pickRecent(floors,0),[]);assert.deepEqual(pickRecent(floors,'x'),[]);
});
test('summary text is kept whole; content mode keeps only the tail',()=>{
 const recs=[{chunk:1,text:'后'},{chunk:0,text:'前'}];assert.equal(recentText(recs,'summary'),'前后');
 const long=[{chunk:0,text:'a'.repeat(RECENT_CONTENT_MAX)+'END'}];const t=recentText(long,'content');assert.ok(t.startsWith('…')&&t.endsWith('END'));assert.equal(t.length,RECENT_CONTENT_MAX+1);
 assert.equal(recentText(long,'summary').length,RECENT_CONTENT_MAX+3);assert.equal(recentText([],'summary'),'');
});
test('query puts the user input first, then recent summaries in order',()=>{
 assert.equal(buildQuery(' 好，走吧 ',[{text:'摘要一'},{text:'摘要二'}]),'好，走吧\n摘要一\n摘要二');
 assert.equal(buildQuery('',[{text:'摘要'}]),'摘要');assert.equal(buildQuery('只有输入',[]),'只有输入');
});
test('injection always keeps recent rounds first; retrieved memories only fill the remaining budget',async()=>{
 const recent=[{index:7,text:'近期A'},{index:9,text:'近期B'}];const results=[{index:2,kind:'content',text:'x'.repeat(50)},{index:3,kind:'mvu',text:'短'}];
 const full=await buildInjection(recent,results,10000,chars);assert.ok(full.startsWith(INJECTION_HEADER));assert.ok(full.indexOf('近期剧情 · 第 7 层')<full.indexOf('近期剧情 · 第 9 层'));assert.ok(full.indexOf('第 9 层')<full.indexOf('楼层 2 / 剧情'));assert.match(full,/楼层 3 \/ 历史变量/);
 const tight=await buildInjection(recent,results,(await buildInjection(recent,[],0,chars)).length+20,chars);assert.match(tight,/近期A/);assert.match(tight,/近期B/);assert.doesNotMatch(tight,/楼层 2/);assert.match(tight,/楼层 3/);
 const over=await buildInjection(recent,results,1,chars);assert.match(over,/近期A/);assert.doesNotMatch(over,/楼层/);
 assert.equal(await buildInjection([],[],100,chars),'');
});
