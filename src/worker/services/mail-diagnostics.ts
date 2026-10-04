// Log only known error fields; SMTP replies can contain addresses or credentials.
export function smtpDiagnostic(error:unknown){
 const details=error && typeof error==='object'?error as Record<string,unknown>:{};
 const code=typeof details.code==='string' && /^E[A-Z0-9_]{1,30}$/.test(details.code)?details.code:'UNKNOWN';
 const responseCode=typeof details.responseCode==='number' && Number.isInteger(details.responseCode) && details.responseCode>=100 && details.responseCode<=599?details.responseCode:undefined;
 const command=typeof details.command==='string' && ['API','CONN','EHLO','HELO','STARTTLS','AUTH LOGIN','AUTH PLAIN','AUTH CRAM-MD5','AUTH XOAUTH2','MAIL FROM','RCPT TO','DATA'].includes(details.command)?details.command:undefined;
 const reply=typeof details.response==='string'?details.response:'';
 const authReason=code!=='EAUTH'?undefined:command==='API'?'client_auth_configuration':/too many|frequen|rate.?limit/i.test(reply)?'auth_rate_limited':/disabled|not enabled|not open/i.test(reply)?'smtp_disabled':/blocked|forbidden|denied|unsafe|security|suspicious/i.test(reply)?'auth_security_restriction':responseCode===535?'auth_rejected':'auth_failed';
 return {event:'smtp_failure',code,response_code:responseCode,command,auth_reason:authReason};
}
