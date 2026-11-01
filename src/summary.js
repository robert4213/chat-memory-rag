import {extract,hash,config,modelSpace} from './core.js';
export function buildSummaryRequest(raw,settings){
 const source=extract(raw,{...settings,mode:'content',include:settings.summaryInclude??settings.include,exclude:settings.summaryExclude??settings.exclude});
 const prompt=String(settings.summaryPrompt||'').replaceAll('{{summaryTag}}',settings.summaryTag);
 return {messages:[{role:'system',content:prompt},{role:'user',content:source}],stream:false};
}
export function timeSummary(text){
 return String(text||'').replace(/^来源消息时间（非剧情时间）[：:][^\r\n]*(?:\r?\n|$)/gm,'').trim();
}
export async function summaryText(raw,settings,api,db,isCurrent=()=>true,sourceTime,{force=false}={}){
 const request=buildSummaryRequest(raw,settings);const [prompt,source]=request.messages.map(m=>m.content);
 if(!source)return '';
 const id='summary:'+await hash(JSON.stringify([source,prompt,sourceTime??null,settings.summaryTag,settings.summaryExclude??settings.exclude,modelSpace(config(settings,'text'))]));
 const cached=!force&&await db.get('indexState',id);if(cached?.text){const text=timeSummary(cached.text);if(text!==cached.text)await db.put('indexState',{...cached,text,sourceTime});return text;}
 const response=await api.request('text','chat/completions',request);
 if(!isCurrent())return '';
 const rawOutput=response.choices?.[0]?.message?.content;
 const text=timeSummary(typeof rawOutput==='string'?extract(rawOutput,{...settings,mode:'summary',exclude:settings.summaryExclude??settings.exclude}):'',sourceTime);
 if(text)await db.put('indexState',{id,text,sourceTime});
 return text;
}
