import {readFile,writeFile,mkdir} from 'node:fs/promises';
const core=(await readFile('src/core.mjs','utf8')).replace(/^export /gm,'');
const data=await readFile('data/practices.json','utf8');
const html=await readFile('src/index.html','utf8');
const handler=await readFile('src/handler.mjs','utf8');
await mkdir('worker',{recursive:true});
await writeFile('worker/index.js',core+'\nconst practices='+data+';\nconst html='+JSON.stringify(html)+';\n'+handler);
