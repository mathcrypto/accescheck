// One JSON-RPC request on stdin; never pass pairing tokens in command arguments.
if(process.stdin.isTTY)process.stdin.setRawMode(true);
process.stdin.setEncoding('utf8');let input='';
console.log('Ready for local MCP request JSON on stdin (input is hidden).');
process.stdin.on('data',async chunk=>{input+=chunk;if(!input.includes('\n'))return;process.stdin.pause();try{const body=JSON.parse(input.slice(0,input.indexOf('\n')));const r=await fetch('http://127.0.0.1:4180/mcp',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});console.log(JSON.stringify(await r.json()));process.exit(0);}catch{console.log(JSON.stringify({error:'MCP request failed'}));process.exit(1);}});
