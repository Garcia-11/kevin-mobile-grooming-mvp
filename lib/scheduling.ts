// Treat these values as local service-calendar times, matching the booking UI.
// UTC arithmetic here adds minutes without using the server's local timezone.
export function visitInterval(start:string,durationMinutes:number,travelMinutes=0){
 if(!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(start))throw new Error('Choose a valid appointment time.');
 const ms=Date.parse(start+':00Z');
 if(!Number.isFinite(ms)||new Date(ms).toISOString().slice(0,16)!==start)throw new Error('Choose a valid appointment time.');
 if(!Number.isInteger(durationMinutes)||durationMinutes<15||durationMinutes>480)throw new Error('Visit duration must be 15 to 480 minutes.');
 if(!Number.isInteger(travelMinutes)||travelMinutes<0||travelMinutes>180)throw new Error('Travel time must be 0 to 180 minutes.');
 const at=(minutes:number)=>new Date(ms+minutes*60000).toISOString().slice(0,16);
 return {startsAt:start,endsAt:at(durationMinutes),availableAt:at(durationMinutes+travelMinutes)};
}
