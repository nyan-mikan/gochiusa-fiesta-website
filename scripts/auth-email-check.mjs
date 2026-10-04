import assert from 'node:assert/strict';
import {mkdirSync,writeFileSync} from 'node:fs';
import nodemailer from 'nodemailer';
import {loginCodeEmail} from '../src/worker/services/auth-email.ts';
const message=loginCodeEmail('052713',10);
// Compile MIME without a network connection or an actual recipient delivery.
const transport=nodemailer.createTransport({streamTransport:true,buffer:true,newline:'windows',disableFileAccess:true,disableUrlAccess:true});
const result=await transport.sendMail({from:'preview@example.test',to:'preview@example.test',subject:'登录验证码预览',...message});
const mime=result.message.toString();
assert.match(mime,/Content-Type: multipart\/alternative;/);
assert.match(mime,/Content-Type: text\/plain; charset=utf-8/);
assert.match(mime,/Content-Type: text\/html; charset=utf-8/);
assert.ok(message.text.includes('052713')&&message.html.includes('>052713</p>'));
assert.ok(!/<script|<img|<link|@import/i.test(message.html));
mkdirSync('docs/previews',{recursive:true});writeFileSync('docs/previews/login-code-email.html',message.html);
console.log('PASS: SMTP MIME contains UTF-8 HTML and text alternatives with the same sample code; static preview saved. No email sent.');
