import test from 'node:test';
import assert from 'node:assert/strict';
import {visitInterval} from '../lib/scheduling.ts';

test('reserves the full visit and time to reach the next client',()=>{
 assert.deepEqual(visitInterval('2026-10-10T10:00',60,30),{
  startsAt:'2026-10-10T10:00',endsAt:'2026-10-10T11:00',availableAt:'2026-10-10T11:30'
 });
});
test('carries a reservation over midnight and the year boundary',()=>{
 assert.equal(visitInterval('2026-12-31T23:30',60,15).availableAt,'2027-01-01T00:45');
});
test('rejects impossible dates and times rather than normalizing them',()=>{
 for(const value of ['2026-02-30T10:00','2026-10-10T24:00','2026-10-10T09:60','not a date']){
  assert.throws(()=>visitInterval(value,60));
 }
});
test('rejects invalid durations and travel buffers',()=>{
 for(const duration of [0,-1,14,481,NaN,30.5])assert.throws(()=>visitInterval('2026-10-10T10:00',duration));
 for(const buffer of [-1,181,NaN,0.5])assert.throws(()=>visitInterval('2026-10-10T10:00',60,buffer));
 assert.equal(visitInterval('2026-10-10T10:00',15,0).availableAt,'2026-10-10T10:15');
});
