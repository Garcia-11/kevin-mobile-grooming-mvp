export const PHOTO_LIMIT=1024*1024;
export function validDogPhoto(bytes:Uint8Array){return bytes.length>4&&bytes.length<=PHOTO_LIMIT&&bytes[0]===255&&bytes[1]===216&&bytes[2]===255&&bytes.at(-2)===255&&bytes.at(-1)===217;}
export function dogPhotoPath(clientId:string,id:string){return `${clientId}/${id}/dog.jpg`;}
export async function boundedPhoto(req:Request){
 if(!req.body)throw new Error('empty');const reader=req.body.getReader(),parts:Uint8Array[]=[];let size=0;
 while(true){const {done,value}=await reader.read();if(done)break;size+=value.length;if(size>PHOTO_LIMIT){await reader.cancel();throw new Error('large');}parts.push(value);}
 const bytes=new Uint8Array(size);let offset=0;for(const part of parts){bytes.set(part,offset);offset+=part.length;}return bytes;
}
