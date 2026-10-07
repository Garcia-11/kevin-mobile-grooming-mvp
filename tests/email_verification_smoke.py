"""One-time email-link integration, with operator-created disposable Auth fixtures.

Supply {hash,type} via hidden stdin. Never use a real customer's link here.
The caller creates and cleans the fixture through a private project operation.
"""
import json, sys, urllib.request, urllib.error, http.cookiejar, termios

origin='http://127.0.0.1:5173'
if sys.stdin.isatty():
    settings=termios.tcgetattr(sys.stdin)
    hidden=settings.copy(); hidden[3] &= ~termios.ECHO
    termios.tcsetattr(sys.stdin,termios.TCSANOW,hidden)
    print('Ready for disposable email fixture JSON on stdin (input is hidden).',flush=True)
    try: fixture=json.loads(sys.stdin.readline())
    finally: termios.tcsetattr(sys.stdin,termios.TCSANOW,settings)
else: fixture=json.load(sys.stdin)

class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self,*args): return None
jar=http.cookiejar.CookieJar()
client=urllib.request.build_opener(urllib.request.HTTPCookieProcessor(jar),NoRedirect)
def request(path,method='GET',use=client,headers=None):
    req=urllib.request.Request(origin+path,method=method,headers=headers or {'Origin':origin})
    try: res=use.open(req)
    except urllib.error.HTTPError as e: res=e
    payload=res.read()
    try: body=json.loads(payload)
    except: body=None
    return res.code,res.headers,body
def check(value,label):
    assert value,label
    print('PASS '+label,flush=True)

t=fixture['type']; token=fixture['hash']
bare=urllib.request.build_opener(NoRedirect)
status,_,_=request('/api/auth/verify','POST',use=bare)
check(status==400,'a verification token is required')
status,_,_=request('/api/auth/verify','POST',headers={'Origin':'https://other.example'})
check(status==403,'cross-origin verification is refused')
status,headers,_=request('/auth/callback?token_hash='+token+'&type='+t)
check(status==303 and headers.get('Location')=='/confirm-email?type='+t,'email GET opens a clean confirmation page')
check(headers.get('Referrer-Policy')=='no-referrer','email token is not sent as a referrer')
check('HttpOnly' in headers.get('Set-Cookie','') and 'Max-Age=600' in headers.get('Set-Cookie',''),'pending token cookie is HttpOnly and short-lived')
status,_,body=request('/api/auth/session')
check(status==200 and not body['authenticated'],'GET does not consume the token or sign in')
status,_,_=request('/auth/callback?token_hash='+token+'&type='+t)
check(status==303,'email previews can repeat without consuming the token')
status,headers,body=request('/api/auth/verify','POST')
check(status==200 and body.get('next')==('/account/password' if t=='recovery' else '/account'),'explicit POST verifies the real Supabase token without a PKCE browser cookie (status '+str(status)+', error '+str((body or {}).get('error'))+')')
check('access_token' not in body and 'refresh_token' not in body,'tokens are not exposed in the JSON result')
status,_,body=request('/api/auth/session')
check(status==200 and body['authenticated'],'verified session is accepted by the real Auth server')
status,_,_=request('/auth/callback?token_hash='+token+'&type='+t)
status,_,_=request('/api/auth/verify','POST')
check(status==401,'one-time email token cannot be reused')
status,_,_=request('/api/auth/logout','POST')
check(status==200,'fixture session is revoked and logged out')
print('12 email verification checks passed.',flush=True)
