const headers={'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'};
const json=(data,status=200)=>new Response(JSON.stringify(data),{status,headers});
const schema={type:'object',properties:{needs:{type:'string',maxLength:2000},width:{type:'number',minimum:40,maximum:200},district:{type:'string'},specialty:{type:'string'},mode:{type:'string',enum:['real','demo']}},required:['needs'],additionalProperties:false};
const tools=[
 {name:'search_practices',description:'Compare les établissements par critères documentés. Données Accès Libre mises en cache ; aucun créneau ni réservation.',inputSchema:schema},
 {name:'get_practice_accessibility',description:'Retourne la provenance et les champs d’un établissement par identifiant.',inputSchema:{type:'object',properties:{id:{type:'string'}},required:['id'],additionalProperties:false}},
 {name:'create_visit_briefing',description:'Prépare les questions à poser au cabinet sans transmettre ni enregistrer les besoins.',inputSchema:{...schema,properties:{...schema.properties,id:{type:'string'}},required:['id','needs']}}
];
function runTool(name,args) {
 if(!args || typeof args!=='object' || Array.isArray(args)) throw new Error('Arguments invalides.');
 const tool=tools.find(t=>t.name===name); if(!tool) throw new Error('Outil inconnu.');
 if(Object.keys(args).some(k=>!Object.hasOwn(tool.inputSchema.properties,k))) throw new Error('Paramètre inconnu.');
 for(const required of tool.inputSchema.required) if(args[required]===undefined)throw new Error('Paramètre requis : '+required);
 if(name==='search_practices')return search(practices,args);
 if(typeof args.id!=='string'||args.id.length>150)throw new Error('Identifiant invalide.');
 const p=practices.find(p=>p.id===args.id); if(!p)throw new Error('Établissement introuvable.');
 if(name==='get_practice_accessibility')return {...p,evidence:Object.fromEntries(Object.entries(p.evidence).map(([k,v])=>[k,{...v,state:evidenceState(v)}]))};
 validateInput(args); return briefing(p,parseNeeds(args.needs,args.width));
}
export default {
 async fetch(request) {
  const url=new URL(request.url);
  if(request.method==='GET' && ['/','/consultation','/consultation/'].includes(url.pathname))return new Response(url.pathname==='/'?html:consultationHtml,{headers:{'Content-Type':'text/html; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer','Content-Security-Policy':"default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'"}});
  if(request.method==='GET' && url.pathname==='/api/catalog')return json({districts:[...new Set(practices.filter(p=>p.mode==='real').map(p=>p.postalCode))].sort(),specialties:[...new Set(practices.filter(p=>p.mode==='real').map(p=>p.specialty))].sort(),count:practices.filter(p=>p.mode==='real').length,datasetDate:'2026-10-24'});
  if(request.method==='GET' && url.pathname==='/health')return json({ok:true,version:'0.2.0'});
  if(request.method!=='POST')return json({error:'Route introuvable.'},404);
  const origin=request.headers.get('Origin'); if(origin && origin!==url.origin)return json({error:'Origine non autorisée.'},403);
  if(Number(request.headers.get('content-length'))>12000)return json({error:'Requête trop volumineuse.'},413);
  let body;try{const raw=await request.text();if(raw.length>12000)return json({error:'Requête trop volumineuse.'},413);body=JSON.parse(raw);}catch{return json({error:'JSON invalide.'},400);}
  if(url.pathname==='/mcp'){
   if(!body || body.jsonrpc!=='2.0' || typeof body.method!=='string' || Array.isArray(body))return json({jsonrpc:'2.0',id:null,error:{code:-32600,message:'Invalid Request'}},400);
   const id=body.id??null; let result;
   if(body.method.startsWith('notifications/'))return new Response(null,{status:202});
   if(body.method==='server/discover')result={supportedVersions:['2026-07-28'],capabilities:{tools:{}}};
   else if(body.method==='initialize')result={protocolVersion:'2025-03-26',capabilities:{tools:{}},serverInfo:{name:'accescheck',version:'0.2.0'}};
   else if(body.method==='ping')result={};
   else if(body.method==='tools/list')result={tools};
   else if(body.method==='tools/call'){try{result={content:[{type:'text',text:JSON.stringify(runTool(body.params?.name,body.params?.arguments))}]};}catch(e){result={isError:true,content:[{type:'text',text:e.message}]};}}
   else return json({jsonrpc:'2.0',id,error:{code:-32601,message:'Method not found'}});
   return json({jsonrpc:'2.0',id,result});
  }
  try{
   if(url.pathname==='/api/search')return json(runTool('search_practices',body));
   if(url.pathname==='/api/briefing')return json(runTool('create_visit_briefing',body));
   return json({error:'Route introuvable.'},404);
  }catch(e){return json({error:e.message},400);}
 }
};
