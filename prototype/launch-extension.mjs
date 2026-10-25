import {mkdtemp,mkdir,writeFile} from 'node:fs/promises';
import {createRequire} from 'node:module';import {resolve} from 'node:path';
const require=createRequire(import.meta.url);const{chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');const extension=resolve('extension');
const profile=await mkdtemp('/tmp/accescheck-extension-test-');await mkdir(profile+'/Default');await writeFile(profile+'/Default/Preferences',JSON.stringify({extensions:{ui:{developer_mode:true}}}));
const debugPort=Number(process.env.MCP_EXTENSION_DEBUG_PORT||9231);
const context=await chromium.launchPersistentContext(profile,{headless:false,executablePath:process.env.CHROME_BIN,args:['--disable-extensions-except='+extension,'--load-extension='+extension,'--force-renderer-accessibility','--autoplay-policy=no-user-gesture-required','--remote-debugging-port='+debugPort]});
const page=context.pages()[0]||await context.newPage();await page.goto('http://127.0.0.1:4180/mock-call');
const worker=context.serviceWorkers()[0]||await context.waitForEvent('serviceworker');console.log(JSON.stringify({loaded:true,serviceWorker:worker.url(),mockCall:page.url(),isolatedProfile:true}));
process.on('SIGINT',async()=>{await context.close();process.exit(0)});await new Promise(()=>{});
