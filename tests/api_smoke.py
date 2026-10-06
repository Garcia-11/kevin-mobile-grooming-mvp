import json, urllib.request, urllib.error, uuid, datetime, os
BASE=os.environ.get('TEST_BASE_URL','http://127.0.0.1:5173').rstrip('/')
def req(method,path,data=None,cookie=None,origin=BASE):
 h={'Content-Type':'application/json','Origin':origin}
 if cookie:h['Cookie']=cookie
 r=urllib.request.Request(BASE+path,data=json.dumps(data).encode() if data is not None else (b'' if method=='POST' else None),headers=h,method=method)
 try:
  with urllib.request.urlopen(r) as x:return x.status,json.load(x),x.headers
 except urllib.error.HTTPError as x:
  raw=x.read().decode()
  try: data=json.loads(raw)
  except ValueError:data={"error":raw}
  return x.code,data,x.headers
checks=[]
def check(name,condition):
 assert condition,name
 checks.append(name);print('PASS',name)
code,d,h=req('GET','/api/requests?demo=1');check('Demo inbox rejects missing session',code==401)
code,d,h=req('POST','/api/demo',{});check('Demo starts',code==200);a=h['Set-Cookie'].split(';')[0]
code,d,h=req('GET','/api/requests?demo=1',cookie=a);check('Demo contains four sample requests',len(d['requests'])==4)
code,d,h=req('POST','/api/demo',{});b=h['Set-Cookie'].split(';')[0]
payload={'requestKey':str(uuid.uuid4()),'ownerName':'Taylor Test','phone':'+1 202 555 0140','email':'test@example.com','dogName':'Teddy','breed':'Poodle','size':'Small','service':'Full groom','address':'12 Example Street, Demo City','preferredDate':(datetime.date.today()+datetime.timedelta(days=7)).isoformat(),'timeWindow':'Morning','notes':'Gentle around the ears.','website':''}
code,d,h=req('POST','/api/requests?demo=1',payload,a);check('New request saved',code==201);id=d['id']
code,d,h=req('POST','/api/requests?demo=1',payload,a);check('Retry returns same receipt',code==200 and d['id']==id)
code,d,h=req('GET','/api/requests?demo=1',cookie=a);check('Request persists on fresh read',len(d['requests'])==5 and d['requests'][0]['id']==id)
code,d,h=req('GET','/api/requests?demo=1',cookie=b);check('Another session cannot see request',len(d['requests'])==4 and all(x['id']!=id for x in d['requests']))
code,d,h=req('PATCH','/api/requests/'+id+'?demo=1',{'status':'declined'},b);check('Another session cannot change request',code==404)
code,d,h=req('PATCH','/api/requests/'+id+'?demo=1',{'status':'completed'},a);check('Invalid status transition rejected',code==409)
code,d,h=req('PATCH','/api/requests/'+id+'?demo=1',{'status':'confirmed'},a);check('Confirmation requires agreed time',code==400)
clash_date=(datetime.date.today()+datetime.timedelta(days=1)).isoformat()+'T14:00'
code,d,h=req('PATCH','/api/requests/'+id+'?demo=1',{'status':'confirmed','scheduledAt':clash_date},a);check('Same-start appointment conflict rejected',code==409)
code,d,h=req('PATCH','/api/requests/'+id+'?demo=1',{'status':'confirmed','scheduledAt':payload['preferredDate']+'T10:30'},a);check('Visit confirmed',code==200)
code,d,h=req('PATCH','/api/requests/'+id+'?demo=1',{'status':'completed'},a);check('Visit completed',code==200)
code,d,h=req('GET','/api/requests?demo=1',cookie=a);row=next(x for x in d['requests'] if x['id']==id);check('Completed status persists',row['status']=='completed' and row['seen']==1)
invalid=payload|{'requestKey':str(uuid.uuid4()),'preferredDate':'2020-01-01'}
code,d,h=req('POST','/api/requests?demo=1',invalid,a);check('Past dates rejected',code==400)
code,d,h=req('POST','/api/requests?demo=1',payload,a,'https://malicious.example');check('Cross-origin write rejected',code==403)
code,d,h=req('GET','/api/requests?demo=1',cookie=a[:-5]+'xxxxx');check('Tampered session rejected',code==401)
code,d,h=req('DELETE','/api/requests/'+id+'?demo=1',{'confirm':True});check('Deletion rejects missing session',code==401)
code,d,h=req('DELETE','/api/requests/'+id+'?demo=1',{'confirm':True},b);check('Another session cannot delete request',code==404)
code,d,h=req('DELETE','/api/requests/'+id+'?demo=1',{'confirm':True},a,'https://malicious.example');check('Cross-origin deletion rejected',code==403)
code,d,h=req('DELETE','/api/requests/'+id+'?demo=1',{'confirm':False},a);check('Deletion requires explicit confirmation',code==400)
code,d,h=req('GET','/api/requests?demo=1',cookie=a);check('Rejected deletions preserve request',any(x['id']==id for x in d['requests']))
code,d,h=req('DELETE','/api/requests/'+id+'?demo=1',{'confirm':True},a);check('Confirmed deletion succeeds',code==200)
code,d,h=req('GET','/api/requests?demo=1',cookie=a);check('Deleted request stays absent on fresh read',all(x['id']!=id for x in d['requests']) and len(d['requests'])==4)
code,d,h=req('DELETE','/api/requests/'+id+'?demo=1',{'confirm':True},a);check('Repeated deletion returns not found',code==404)
print(f'All {len(checks)} checks passed.')
