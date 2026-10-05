// Prepare a fresh Codex Cloud checkout using local Cloudflare emulation only.
import {execFileSync} from 'node:child_process';
import {writeFileSync} from 'node:fs';
import {randomBytes} from 'node:crypto';
import {tmpdir} from 'node:os';
import {join} from 'node:path';

const [major,minor]=process.versions.node.split('.').map(Number);
if(major<22||(major===22&&minor<12))throw new Error('Node.js 22.12 or newer is required; select Node.js 24 in the cloud environment.');
const localEnv={...process.env,WRANGLER_SEND_METRICS:'false',WRANGLER_LOG_PATH:join(tmpdir(),'gochiusa-wrangler-logs'),XDG_CONFIG_HOME:join(tmpdir(),'gochiusa-wrangler-local')};
try{
 writeFileSync('.dev.vars',`AUTH_CODE_SECRET=${randomBytes(32).toString('hex')}\nMAIL_API_TOKEN=\n`,{mode:0o600,flag:'wx'});
}catch(error){if(error.code!=='EEXIST')throw error;}
const npm=process.platform==='win32'?'npm.cmd':'npm';
for(const args of [['ci'],['run','db:migrate:local'],['run','typecheck'],['run','build']])execFileSync(npm,args,{stdio:'inherit',env:localEnv});
console.log('Cloud development setup ready. Local D1/R2/DO and loopback mail only; no production credentials required.');
