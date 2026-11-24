import {test} from 'node:test';
import assert from 'node:assert/strict';
import {Api,proxyUrl,proxyHint} from '../src/api.js';
import {defaults} from '../src/core.js';
const settings=proxy=>{const s=structuredClone(defaults);Object.assign(s.presets[0],{base:'https://api.example/v1/',key:'secret-key',model:'emb',retries:0});s.apiProxy=proxy;return s;};
async function capture(proxy,response={ok:true,status:200,headers:new Headers(),json:async()=>({data:[]})}){
 const calls=[],original=globalThis.fetch,st=globalThis.SillyTavern;
 globalThis.fetch=async(url,options)=>{calls.push({url,options});return response;};
 globalThis.SillyTavern={getContext:()=>({getRequestHeaders:()=>({'Content-Type':'application/json','X-CSRF-Token':'csrf-1'})})};
 try{return {calls,result:await new Api({},()=>settings(proxy)).request('document','embeddings',{input:'x'}).catch(e=>e)};}finally{globalThis.fetch=original;globalThis.SillyTavern=st;}
}
test('direct mode calls the API address without SillyTavern headers',async()=>{const {calls}=await capture(false);assert.equal(calls[0].url,'https://api.example/v1/embeddings');assert.equal(calls[0].options.headers['X-CSRF-Token'],undefined);assert.equal(calls[0].options.headers.Authorization,'Bearer secret-key');});
test('proxy mode goes through /proxy/<url> with the CSRF token and keeps the API key header',async()=>{const {calls}=await capture(true);assert.equal(calls[0].url,'/proxy/https://api.example/v1/embeddings');assert.equal(calls[0].options.headers['X-CSRF-Token'],'csrf-1');assert.equal(calls[0].options.headers.Authorization,'Bearer secret-key');assert.equal(JSON.parse(calls[0].options.body).input,'x');assert.equal(proxyUrl('http://a/b'),'/proxy/http://a/b');});
test('a disabled SillyTavern proxy is explained instead of a bare 404',async()=>{const {result}=await capture(true,{ok:false,status:404,headers:new Headers(),text:async()=>'CORS proxy is disabled. Enable it in config.yaml or use the --corsProxy flag.'});assert.match(result.message,/HTTP 404/);assert.match(result.message,/enableCorsProxy: true/);assert.ok(!result.message.includes('.。'));});
test('proxy hints cover unreachable target, CSRF and circular requests only',()=>{assert.match(proxyHint(500,''),/localhost 指的是酒馆所在的机器/);assert.match(proxyHint(500,'Internal Server Error'),/连不上/);assert.match(proxyHint(403,'Invalid CSRF token'),/刷新页面/);assert.match(proxyHint(400,'Circular requests are not allowed'),/酒馆自身/);assert.equal(proxyHint(401,'{"error":"bad key"}'),'');assert.equal(proxyHint(500,'upstream error'),'');});
test('requests go through the SillyTavern proxy by default',()=>{assert.equal(defaults.apiProxy,true);});
