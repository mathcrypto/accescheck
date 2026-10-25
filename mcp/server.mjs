import {McpServer} from '@modelcontextprotocol/server';
import {serveStdio} from '@modelcontextprotocol/server/stdio';
import * as z from 'zod/v4';
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import worker from '../worker/index.js';
import {consultationTools} from '../prototype/session-bridge.mjs';
import {agentInstructions,agentPrompt} from './agent-prompt.mjs';

const errorResult = text => ({isError:true,content:[{type:'text',text}]});
const request = (method,params) => ({jsonrpc:'2.0',id:1,method,params});
const practiceList = await worker.fetch(new Request('http://127.0.0.1/mcp',{
  method:'POST',body:JSON.stringify(request('tools/list',{}))
})).then(r=>r.json());

export function bridgeEndpoint(value='http://127.0.0.1:4180/mcp') {
  const u=new URL(value);
  if(u.protocol!=='http:'||u.hostname!=='127.0.0.1'||u.pathname!=='/mcp'||u.username||u.password||u.search||u.hash)
    throw new Error('The consultation bridge must be a loopback HTTP /mcp endpoint.');
  return u.href;
}

// These tools use flat, primitive schemas. Fail closed if that contract changes.
function inputSchema(schema) {
  const shape={};
  for(const [name,p] of Object.entries(schema.properties)) {
    let field;
    if(p.enum) field=z.enum(p.enum);
    else if(p.type==='string') field=z.string().min(1).max(p.maxLength||4000);
    else if(p.type==='integer') field=z.number().int();
    else if(p.type==='number') field=z.number();
    else throw new Error('Unsupported tool schema.');
    if(p.minimum!==undefined) field=field.min(p.minimum);
    if(p.maximum!==undefined) field=field.max(p.maximum);
    if(!schema.required?.includes(name)) field=field.optional();
    shape[name]=field;
  }
  return z.object(shape).strict();
}

export async function forwardConsultation(name,args,endpoint,fetcher=fetch) {
  try {
    const r=await fetcher(bridgeEndpoint(endpoint),{method:'POST',redirect:'error',
      headers:{'Content-Type':'application/json','Accept':'application/json'},
      body:JSON.stringify(request('tools/call',{name,arguments:args})),signal:AbortSignal.timeout(8000)});
    if(!r.ok||Number(r.headers.get('content-length'))>250000) return errorResult('Pont local indisponible. Démarrez npm run dev:companion et reliez le panneau.');
    const raw=await r.text();if(raw.length>250000) return errorResult('Réponse du pont local trop volumineuse.');
    const data=JSON.parse(raw);
    if(data.jsonrpc!=='2.0'||data.id!==1||!data.result||!Array.isArray(data.result.content)) return errorResult('Réponse du pont local invalide.');
    return data.result;
  } catch {
    return errorResult('Pont local indisponible. Démarrez npm run dev:companion et reliez le panneau.');
  }
}

export function createAgentServer({endpoint=process.env.ACCESCHECK_MCP_URL,fetcher=fetch}={}) {
  const localEndpoint=bridgeEndpoint(endpoint);
  const server=new McpServer({name:'accescompanion',version:'0.4.0'},{instructions:agentInstructions});
  const consultationNames=new Set(consultationTools.map(t=>t.name));
  for(const tool of [...practiceList.result.tools,...consultationTools]) {
    const readOnly=['search_practices','get_practice_accessibility','create_visit_briefing','get_caption_updates','get_consultation_context'].includes(tool.name);
    server.registerTool(tool.name,{description:tool.description,inputSchema:inputSchema(tool.inputSchema),
      annotations:{readOnlyHint:readOnly,destructiveHint:tool.name==='stop_session',openWorldHint:false}},async args=>{
      if(consultationNames.has(tool.name)) return forwardConsultation(tool.name,args,localEndpoint,fetcher);
      const r=await worker.fetch(new Request('http://127.0.0.1/mcp',{
        method:'POST',body:JSON.stringify(request('tools/call',{name:tool.name,arguments:args}))
      }));
      return (await r.json()).result;
    });
  }
  server.registerPrompt(agentPrompt.name,{description:agentPrompt.description},()=>({
    description:agentPrompt.description,messages:[{role:'user',content:{type:'text',text:agentInstructions}}]
  }));
  return server;
}

if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)) {
  try {
    serveStdio(()=>createAgentServer(),{onerror:()=>console.error('accescompanion MCP: transport error.')});
  } catch {
    console.error('accescompanion MCP: configuration invalide. Utilisez une adresse HTTP locale 127.0.0.1 avec le chemin /mcp.');
    process.exitCode=1;
  }
}
