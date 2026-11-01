import {DEFAULT_SUMMARY_PROMPT} from './summary-rules.js';
export const defaults = {
 enabled:false, debugMode:false, logLimit:300, mode:'content', include:'', exclude:'think,thinking,UpdateVariable', indexUsers:false,
 summaryEnabled:false, summaryTag:'summary', summaryInclude:'',summaryExclude:'think,thinking,UpdateVariable', summaryPrompt:DEFAULT_SUMMARY_PROMPT,
 mvuEnabled:false, mvuPaths:'', mvuExclude:'', chunkSize:1800, topK:6, threshold:0.25, vectorWeight:0.75, budget:1600, depth:2, position:1, rerankEnabled:false,
 presets:[{id:'default',name:'默认连接',base:'',key:'',model:'',dimensions:0,timeout:20000,retries:1}],
 calls:{document:{preset:'default',overrides:{}},query:{preset:'default',overrides:{}},rerank:{preset:'default',overrides:{}}},
};
export const tags = s => String(s||'').split(/[,，\n]/).map(x=>x.trim()).filter(Boolean);
const esc = s => s.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
export function extract(text,s) {
 let out=String(text||'');
 for(const t of tags(s.exclude)) out=out.replace(new RegExp(`<${esc(t)}\\b[^>]*>[\\s\\S]*?(?:<\\/${esc(t)}\\s*>|$)`,'gi'),'');
 const include=s.mode==='summary'?[s.summaryTag]:tags(s.include);
 if(include.length){const parts=[];for(const t of include){const re=new RegExp(`<${esc(t)}\\b[^>]*>([\\s\\S]*?)<\\/${esc(t)}\\s*>`,'gi');for(const m of out.matchAll(re))parts.push({at:m.index,text:m[1]});}out=parts.sort((a,b)=>a.at-b.at).map(x=>x.text).join('\n');}
 return out.replace(/<\/?[A-Za-z][^>]*>/g,'').replace(/\r\n/g,'\n').replace(/[ \t]+/g,' ').trim();
}
export function stable(value){if(Array.isArray(value))return value.map(stable);if(value&&typeof value==='object')return Object.fromEntries(Object.keys(value).sort().filter(k=>!k.startsWith('$')).map(k=>[k,stable(value[k])]));return value;}
export function mvuText(data,s){
 if(!data||typeof data!=='object')return '';
 const flat=[];const deny=tags(s.mvuExclude),allow=tags(s.mvuPaths);
 function walk(v,p){if(deny.some(x=>p===x||p.startsWith(x+'.')))return;if(v&&typeof v==='object'&&!Array.isArray(v)){for(const k of Object.keys(v).sort())if(!k.startsWith('$'))walk(v[k],p?`${p}.${k}`:k);}else if(!allow.length||allow.some(x=>p===x||p.startsWith(x+'.')))flat.push(`${p}=${JSON.stringify(stable(v))}`);}
 walk(data,'');return flat.join('\n');
}
export async function hash(text){return [...new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(text)))].map(x=>x.toString(16).padStart(2,'0')).join('');}
export function chunks(text,size){const out=[];for(let i=0;i<text.length;i+=size)out.push(text.slice(i,i+size));return out;}
export function cosine(a,b){if(!a?.length||a.length!==b?.length)return 0;let d=0,x=0,y=0;for(let i=0;i<a.length;i++){d+=a[i]*b[i];x+=a[i]**2;y+=b[i]**2;}return x&&y?d/Math.sqrt(x*y):0;}
export function lexical(a,b){const tokenize=s=>new Set(String(s).toLowerCase().match(/[a-z0-9_]+|[\u3400-\u9fff]/g)||[]);const q=tokenize(a),d=tokenize(b);return q.size?[...q].filter(x=>d.has(x)).length/q.size:0;}
export function config(s,kind){const c=s.calls[kind];return {...s.presets.find(p=>p.id===c.preset),...c.overrides};}
export function modelSpace(c){return JSON.stringify([c.base.replace(/\/+$/,''),c.model,Number(c.dimensions)||0]);}
export function validVector(v){return Array.isArray(v)&&v.length>0&&v.every(Number.isFinite)&&v.some(x=>x!==0);}
