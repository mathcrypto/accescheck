import {createHash} from 'node:crypto';
import {createServer} from 'node:http';import {readFile} from 'node:fs/promises';import worker from '../worker/index.js';import {createSessionBridge,consultationTools} from './session-bridge.mjs';
const bridge=createSessionBridge();const port=Number(process.env.MCP_TEST_PORT||4180);const base='http://127.0.0.1:'+port;
const manifest=JSON.parse(await readFile(new URL('../extension/manifest.json',import.meta.url),'utf8'));
const extensionId=[...createHash('sha256').update(Buffer.from(manifest.key,'base64')).digest().subarray(0,16)].map(b=>String.fromCharCode(97+(b>>4),97+(b&15))).join('');
const extensionOrigin='chrome-extension://'+extensionId;
const assets=new Map([['/mock-call',['mock-call.html','text/html; charset=utf-8']],['/mock-call.css',['mock-call.css','text/css']],['/mock-call.js',['mock-call.js','text/javascript']],['/mock-doctor.wav',['assets/mock-doctor.wav','audio/wav']]]);
const client=await readFile(new URL('./client.js',import.meta.url),'utf8');
const json=(res,data,status=200)=>{res.writeHead(status,{'Content-Type':'application/json','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'});res.end(JSON.stringify(data));};
const server=createServer(async(req,res)=>{try{
 if(req.headers.host!=='127.0.0.1:'+port)return json(res,{error:'Invalid host'},403);
 const origin=req.headers.origin;const extensionRequest=origin===extensionOrigin;if(extensionRequest){res.setHeader('Access-Control-Allow-Origin',extensionOrigin);res.setHeader('Access-Control-Allow-Headers','Content-Type, Authorization');res.setHeader('Access-Control-Allow-Methods','POST, GET, OPTIONS');res.setHeader('Vary','Origin');}if(req.method==='OPTIONS'&&extensionRequest){res.writeHead(204);return res.end();}if(origin&&origin!==base&&!extensionRequest)return json(res,{error:'Cross-origin requests blocked'},403);
 if(req.headers['sec-fetch-site']==='cross-site'&&!extensionRequest)return json(res,{error:'Cross-site requests blocked'},403);
 const url=new URL(req.url,base);if(req.method==='GET'&&assets.has(url.pathname)){const[file,type]=assets.get(url.pathname);const data=await readFile(new URL(file,import.meta.url));res.writeHead(200,{'Content-Type':type,'Cache-Control':'no-store','Content-Length':data.length});return res.end(data);}const chunks=[];let size=0;for await(const c of req){size+=c.length;if(size>180000)return json(res,{error:'Request too large'},413);chunks.push(c);}const raw=Buffer.concat(chunks);let body={};if(raw.length){try{body=JSON.parse(raw)}catch{return json(res,{error:'Invalid JSON'},400);}}
 if(req.method==='GET'&&url.pathname==='/mcp-test/client.js'){res.writeHead(200,{'Content-Type':'text/javascript','Cache-Control':'no-store'});return res.end(client);}
 if(req.method==='POST'&&url.pathname==='/bridge/pair'){if(body.fictional_test!==true)return json(res,{error:'Fictional test consent required'},400);return json(res,bridge.create());}
 if(req.method==='POST'&&url.pathname.startsWith('/bridge/')){try{return json(res,bridge.browser(body.session_id,req.headers.authorization?.replace(/^Bearer /,''),url.pathname.split('/').pop(),body));}catch(e){return json(res,{error:e.message},403);}}
 if(req.method==='POST'&&url.pathname==='/mcp'){
  if(!body||body.jsonrpc!=='2.0'||typeof body.method!=='string')return json(res,{jsonrpc:'2.0',id:null,error:{code:-32600,message:'Invalid request'}},400);
  if(body.method==='tools/list'){const r=await worker.fetch(new Request(base+'/mcp',{method:'POST',body:JSON.stringify(body)}));const data=await r.json();data.result.tools.push(...consultationTools);return json(res,data);}
  if(body.method==='tools/call'&&consultationTools.some(t=>t.name===body.params?.name)){let result;try{result={content:[{type:'text',text:JSON.stringify(bridge.call(body.params.name,body.params.arguments))}]};}catch(e){result={isError:true,content:[{type:'text',text:e.message}]};}return json(res,{jsonrpc:'2.0',id:body.id??null,result});}
 }
 const request=new Request(base+req.url,{method:req.method,headers:req.headers,...(raw.length?{body:raw,duplex:'half'}:{})});const r=await worker.fetch(request,{});const headers=Object.fromEntries(r.headers);res.writeHead(r.status,headers);if(req.method==='GET'&&['/consultation','/consultation/'].includes(url.pathname)){return res.end((await r.text()).replace('</body>','<script src="/mcp-test/client.js"></script></body>'));}res.end(Buffer.from(await r.arrayBuffer()));
 }catch{json(res,{error:'Local test request failed'},500);}});
const timer=setInterval(()=>bridge.sweep(),60000);timer.unref();
server.listen(port,'127.0.0.1',()=>console.log('Local MCP test: '+base+'/consultation\nMCP endpoint: '+base+'/mcp\nFictional sessions only. No audio starts automatically.'));
function shutdown(){bridge.clear();server.close();process.exit(0)}process.on('SIGINT',shutdown);process.on('SIGTERM',shutdown);
