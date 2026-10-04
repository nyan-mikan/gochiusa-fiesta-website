/** Email-safe tables and inline styles; no remote fonts, images or tracking. */
export function loginCodeEmail(code:string,validMinutes:number){
 if(!/^\d{6}$/.test(code)||!Number.isInteger(validMinutes)||validMinutes<1)throw new Error('Invalid login email parameters');
 const text=`点兔贺年祭 · Gochiusa New Year Fiesta\n\n你的登录验证码是：${code}\n${validMinutes} 分钟内有效，请勿告诉他人。\n\n请返回登录页面填写验证码：https://usagi.mikanyan.com/login\n如果不是你本人发起的登录，请忽略这封邮件。`;
 const html=`<!doctype html>
<html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="color-scheme" content="light"><title>点兔贺年祭 · 登录验证码</title></head>
<body style="margin:0;padding:0;background-color:#f4f0e9;color:#493f3e;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI','PingFang SC','Microsoft YaHei',Arial,sans-serif;">
<div style="display:none;max-height:0;overflow:hidden;mso-hide:all;">登录验证码 ${validMinutes} 分钟内有效。</div>
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" bgcolor="#f4f0e9"><tr><td align="center" style="padding:36px 16px;">
<!--[if mso]><table role="presentation" width="560" cellspacing="0" cellpadding="0" border="0"><tr><td><![endif]-->
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="max-width:560px;">
<tr><td style="padding:0 8px 24px;"><p style="margin:0 0 7px;font-size:22px;line-height:1.4;font-weight:700;color:#955e49;">点兔贺年祭<span style="color:#ee7180;"> ✿</span></p><p style="margin:0;font-size:12px;line-height:1.5;letter-spacing:1px;color:#80675e;">Gochiusa New Year Fiesta</p></td></tr>
<tr><td bgcolor="#fffdf9" style="border:1px solid #e5d9ce;border-radius:18px;padding:32px 24px;">
<h1 style="margin:0 0 14px;font-size:26px;line-height:1.4;font-weight:700;color:#493f3e;">登录验证码</h1>
<p style="margin:0 0 24px;font-size:15px;line-height:1.8;color:#7d706c;">请在登录页面输入以下验证码，完成登录。</p>
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0"><tr><td align="center" bgcolor="#f2e9e4" style="padding:24px 10px;border-radius:12px;">
<p style="margin:0 0 10px;font-size:12px;line-height:1.5;color:#80675e;">你的登录验证码</p>
<p dir="ltr" style="margin:0;font-family:'Courier New',Courier,monospace;font-size:38px;line-height:1.3;letter-spacing:6px;font-weight:700;color:#775766;white-space:nowrap;">${code}</p>
<p style="margin:12px 0 0;font-size:12px;line-height:1.5;color:#80675e;">${validMinutes} 分钟内有效 · 仅限本次登录</p>
</td></tr></table>
<p style="margin:22px 0 0;font-size:13px;line-height:1.8;color:#7d706c;">请勿向任何人转发或透露验证码。<br>如果不是你本人发起的登录，忽略这封邮件即可。</p>
<p style="margin:20px 0 0;font-size:13px;line-height:1.6;"><a href="https://usagi.mikanyan.com/login" style="color:#775766;text-decoration:underline;">返回登录页面</a></p>
</td></tr>
<tr><td align="center" style="padding:24px 12px 0;"><p style="margin:0;font-size:11px;line-height:1.8;color:#93847e;">点兔贺年祭 · Gochiusa New Year Fiesta<br>这是一封自动发送的登录邮件。</p></td></tr>
</table><!--[if mso]></td></tr></table><![endif]-->
</td></tr></table></body></html>`;
 return {text,html};
}
