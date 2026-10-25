import {fileURLToPath} from 'node:url';
console.log(JSON.stringify({mcpServers:{accescheck:{command:process.execPath,args:[fileURLToPath(new URL('../mcp/server.mjs',import.meta.url))]}}},null,2));
