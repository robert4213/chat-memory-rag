import {extract,hash,config,modelSpace} from './core.js';
import {SUMMARY_RULES} from './summary-rules.js';
export function timeSummary(text,sourceTime){
 if(!text)return '';
 const story=/^剧情时间[：:]\s*([^\n]+)/m.exec(text);
 const body=story?text.replace(story[0],'').trim():text;
 const sent=typeof sourceTime==='string'||typeof sourceTime==='number'?String(sourceTime).replace(/[\r\n]/g,' ').slice(0,150):'未记录';
 return `剧情时间：${story?.[1]?.trim()||'未明确'}\n来源消息时间（非剧情时间）：${sent||'未记录'}\n${body}`;
}
export async function summaryText(raw,settings,api,db,isCurrent=()=>true,sourceTime,{force=false}={}){
 const source=extract(raw,{...settings,mode:'content',include:settings.summaryInclude??settings.include,exclude:settings.summaryExclude??settings.exclude});
 if(!source)return '';
 const prompt=(settings.summaryPrompt===SUMMARY_RULES?'':settings.summaryPrompt+'\n\n')+SUMMARY_RULES+'\n只输出 <'+settings.summaryTag+'>上述五项摘要</'+settings.summaryTag+'>，五项均放在标签内。';
 const id='summary:'+await hash(JSON.stringify([source,prompt,sourceTime??null,settings.summaryTag,settings.summaryExclude??settings.exclude,modelSpace(config(settings,'text'))]));
 const cached=!force&&await db.get('indexState',id);if(cached?.text)return cached.text;
 const response=await api.request('text','chat/completions',{messages:[{role:'system',content:prompt},{role:'user',content:source}],stream:false});
 if(!isCurrent())return '';
 const rawOutput=response.choices?.[0]?.message?.content;
 const text=timeSummary(typeof rawOutput==='string'?extract(rawOutput,{...settings,mode:'summary',exclude:settings.summaryExclude??settings.exclude}):'',sourceTime);
 if(text)await db.put('indexState',{id,text});
 return text;
}
