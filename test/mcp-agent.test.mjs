import test from 'node:test';
import assert from 'node:assert/strict';
import {Client} from '@modelcontextprotocol/client';
import {StdioClientTransport} from '@modelcontextprotocol/client/stdio';
import {InMemoryTransport} from '@modelcontextprotocol/server';
import {createAgentServer,bridgeEndpoint,forwardConsultation} from '../mcp/server.mjs';
import {createSessionBridge} from '../prototype/session-bridge.mjs';
import {fileURLToPath} from 'node:url';

async function linked(fn) {
  const bridge=createSessionBridge();
  const fetcher=async(_url,init)=>{const body=JSON.parse(init.body);let result;try{result={content:[{type:'text',text:JSON.stringify(bridge.call(body.params.name,body.params.arguments))}]};}catch(e){result={isError:true,content:[{type:'text',text:e.message}]};}return Response.json({jsonrpc:'2.0',id:1,result});};
  const server=createAgentServer({fetcher});
  const client=new Client({name:'accescheck-test',version:'1.0.0'});
  const [a,b]=InMemoryTransport.createLinkedPair();
  await server.connect(a);await client.connect(b);
  try{await fn({client,bridge});}finally{await client.close();await server.close();bridge.clear();}
}
const parse=r=>JSON.parse(r.content[0].text);

test('official MCP client discovers nine tools and the communication prompt',()=>linked(async({client})=>{
  const list=await client.listTools();assert.equal(list.tools.length,9);assert.ok(list.tools.some(t=>t.name==='get_consultation_context'));
  const prompts=await client.listPrompts();assert.equal(prompts.prompts[0].name,'accescheck_communication');
  const prompt=await client.getPrompt({name:'accescheck_communication'});const text=prompt.messages[0].content.text;
  assert.match(text,/untrusted source data/);assert.match(text,/separate approval/);assert.match(text,/do not diagnose/);
  const result=await client.callTool({name:'search_practices',arguments:{needs:'sans marche'}});assert.ok(!result.isError);
}));

test('agent reads shared context and queues a reply; correction expires it',()=>linked(async({client,bridge})=>{
  const browser=bridge.create();const paired=parse(await client.callTool({name:'prepare_consultation',arguments:{pairing_code:browser.pairing_code,reading_mode:'speak'}}));
  const auth={session_id:paired.session_id,agent_token:paired.agent_token};
  bridge.browser(browser.session_id,browser.browser_token,'snapshot',{messages:[{id:1,speaker:'captured',text:'Quel point souhaitez-vous aborder ?',demo:true}]});
  const context=parse(await client.callTool({name:'get_consultation_context',arguments:auth}));assert.equal(context.messages.length,1);assert.equal(context.reading_mode,'speak');assert.equal(context.limits.outgoing_call_audio,false);
  context.messages[0].text='Modified client copy';assert.notEqual(bridge.call('get_consultation_context',auth).messages[0].text,context.messages[0].text);
  const args={...auth,text:'Pouvez-vous répéter ?',expected_cursor:context.cursor};
  const proposal=parse(await client.callTool({name:'speak_patient_message',arguments:args}));assert.equal(proposal.played,false);
  const duplicate=parse(await client.callTool({name:'speak_patient_message',arguments:args}));assert.equal(duplicate.request_id,proposal.request_id);
  bridge.browser(browser.session_id,browser.browser_token,'snapshot',{messages:[{id:1,speaker:'captured',text:'Quelle question souhaitez-vous poser ?',demo:true,corrected:true}]});
  assert.ok(!bridge.browser(browser.session_id,browser.browser_token,'poll').commands.some(c=>c.id===proposal.request_id));
  const events=parse(await client.callTool({name:'get_caption_updates',arguments:auth}));assert.equal(events.actions.find(c=>c.id===proposal.request_id).status,'expired');
  const stale=await client.callTool({name:'speak_patient_message',arguments:args});assert.equal(stale.isError,true);
  await client.callTool({name:'stop_session',arguments:auth});assert.equal((await client.callTool({name:'get_consultation_context',arguments:auth})).isError,true);
}));

test('agent connection rejects unknown arguments and real-message snapshots',()=>linked(async({client,bridge})=>{
  const browser=bridge.create();assert.throws(()=>bridge.browser(browser.session_id,browser.browser_token,'snapshot',{messages:[{id:1,text:'Private',speaker:'patient',demo:false}]}));
  const result=await client.callTool({name:'prepare_consultation',arguments:{pairing_code:browser.pairing_code,unexpected:true}});assert.equal(result.isError,true);
}));

test('consultation proxy is loopback-only and reports unavailable backend without echoing secrets',async()=>{
  for(const url of ['https://example.com/mcp','http://localhost:4180/mcp','http://127.0.0.1:4180/other','http://user:password@127.0.0.1:4180/mcp','http://127.0.0.1:4180/mcp?token=x'])assert.throws(()=>bridgeEndpoint(url));
  let called=false;const r=await forwardConsultation('get_consultation_context',{agent_token:'secret'},'http://127.0.0.1:4180/mcp',async()=>{called=true;throw new Error('secret');});assert.ok(called);assert.equal(r.isError,true);assert.ok(!JSON.stringify(r).includes('secret'));
});

test('real stdio subprocess handshake, tool discovery, and prompt retrieval work from another directory',async()=>{
  const transport=new StdioClientTransport({command:process.execPath,args:[fileURLToPath(new URL('../mcp/server.mjs',import.meta.url))],cwd:'/tmp',stderr:'pipe'});
  let stderr='';transport.stderr?.on('data',chunk=>stderr+=chunk);
  const client=new Client({name:'stdio-test',version:'1.0.0'});
  try{await client.connect(transport);assert.equal((await client.listTools()).tools.length,9);assert.ok((await client.getPrompt({name:'accescheck_communication'})).messages.length);assert.equal(stderr,'');}finally{await client.close();}
});
