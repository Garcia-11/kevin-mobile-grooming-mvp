# Run only against the configured local preview with operator-created disposable fixtures.
# JSON stdin contains three synthetic test users; never print their passwords or tokens.
import json,sys,urllib.request,urllib.error,uuid,datetime,os,concurrent.futures
if sys.stdin.isatty():
 import termios
 state=termios.tcgetattr(sys.stdin);state[3]&=~termios.ECHO;termios.tcsetattr(sys.stdin,termios.TCSANOW,state)
print('Ready for disposable fixture JSON on stdin (input hidden).',flush=True)
users=json.loads(sys.stdin.readline())
BASE=os.environ.get('TEST_BASE_URL','http://127.0.0.1:5173').rstrip('/')
def req(method,path,data=None,cookie='',origin=BASE):
 request=urllib.request.Request(BASE+path,method=method,data=json.dumps(data).encode() if data is not None else (b'' if method=='POST' else None),headers={'Origin':origin,'Content-Type':'application/json','Cookie':cookie})
 try:
  with urllib.request.urlopen(request) as response:return response.status,json.load(response),'; '.join(c.split(';')[0] for c in response.headers.get_all('Set-Cookie',[]))
 except urllib.error.HTTPError as response:return response.code,json.load(response),''
checks=[]
def check(name,condition):
 assert condition,name
 checks.append(name);print('PASS',name,flush=True)
def login(user,admin=False):
 code,data,cookie=req('POST','/api/auth/login',{'email':user['email'],'password':user['password'],'admin':admin})
 check('Synthetic '+('admin' if admin else 'customer')+' signs in',code==200)
 return cookie
cookies=[login(users[0]),login(users[1]),login(users[2],True)]
a,b,owner=cookies
code,data,_=req('GET','/api/auth/session',cookie=a);check('Verified session exposes customer role only',code==200 and data['authenticated'] and not data['admin'])
code,_,_=req('GET','/api/requests',cookie=a);check('Customer cannot read admin inbox',code==403)
code,_,_=req('POST','/api/auth/login',{'email':users[1]['email'],'password':users[1]['password'],'admin':True});check('Admin sign-in rejects ordinary account',code==403)
day=(datetime.date.today()+datetime.timedelta(days=8)).isoformat()
def payload(dog):return {'requestKey':str(uuid.uuid4()),'ownerName':'Disposable Test Client','phone':'+1 202 555 0140','email':'test@example.com','dogName':dog,'breed':'Poodle','size':'Small','service':'Full groom','address':'12 Example Street, Demo City','preferredDate':day,'timeWindow':'Morning','notes':'Synthetic integration fixture','website':''}
code,_,_=req('POST','/api/requests',payload('Unsigned'));check('Real requests require customer sign-in',code==401)
ids=[]
for cookie,dog in [(a,'Test Alpha'),(b,'Test Beta'),(a,'Test Gamma')]:
 code,data,_=req('POST','/api/requests',payload(dog),cookie);check('Signed-in customer can request visit',code==201);ids.append(data['id'])
code,data,_=req('GET','/api/client/requests',cookie=a);check('First history contains only own requests',code==200 and {x['id'] for x in data['requests']}=={ids[0],ids[2]})
code,data,_=req('GET','/api/client/requests',cookie=b);check('Second history cannot see first customer',code==200 and {x['id'] for x in data['requests']}=={ids[1]})
code,_,_=req('PATCH','/api/requests/'+ids[0],{'status':'declined'},a);check('Customer cannot change business status',code==403)
code,_,_=req('DELETE','/api/requests/'+ids[0],{'confirm':True},a);check('Customer cannot use admin deletion',code==403)
code,data,_=req('GET','/api/requests',cookie=owner);check('Owner sees the real requests',code==200 and all(any(x['id']==id for x in data['requests']) for id in ids))
# Both requests attempt the same interval concurrently. Exactly one must reserve it.
def confirm(id):return req('PATCH','/api/requests/'+id,{'status':'confirmed','scheduledAt':day+'T14:00','durationMinutes':60,'travelMinutes':20},owner)[0]
with concurrent.futures.ThreadPoolExecutor(max_workers=2) as pool:results=list(pool.map(confirm,ids[:2]))
check('Concurrent confirmations allow exactly one appointment',sorted(results)==[200,409])
code,data,_=req('GET','/api/client/requests',cookie=a);check('Customer sees latest business status',code==200 and data['requests'][0]['id'] in ids)
# Tamper both tokens: an unverified cookie cannot identify another client.
code,_,_=req('GET','/api/client/requests',cookie='; '.join(c[:-5]+'xxxxx' for c in a.split('; ')));check('Tampered access and refresh tokens are rejected',code==401)
# An expired access cookie with a valid refresh cookie is renewed by the server.
renew='; '.join('grooming_access=expired-token' if c.startswith('grooming_access=') else c for c in a.split('; '))
code,data,newcookies=req('GET','/api/auth/session',cookie=renew);check('Access-token refresh preserves customer session',code==200 and data['authenticated'] and bool(newcookies))
for id in ids:
 code,_,_=req('DELETE','/api/requests/'+id,{'confirm':True},owner);check('Owner permanently deletes disposable request',code==200)
code,data,_=req('GET','/api/client/requests',cookie=b);check('Deleted request disappears from customer history',code==200 and data['requests']==[])
code,_,_=req('POST','/api/auth/logout',cookie=b);check('Customer can sign out',code==200)
code,_,_=req('GET','/api/client/requests');check('Signed-out request does not expose history',code==401)
print('All '+str(len(checks))+' account checks passed.',flush=True)
