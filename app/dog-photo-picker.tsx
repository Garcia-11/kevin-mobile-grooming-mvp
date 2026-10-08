'use client';
import {useEffect,useRef,useState} from 'react';
import {Camera,X} from 'lucide-react';
export default function DogPhotoPicker({onChange,onPreparing,disabled=false}:{onChange:(photo:Blob|null)=>void;onPreparing:(busy:boolean)=>void;disabled?:boolean}){
 const [preview,setPreview]=useState(''),[error,setError]=useState(''),[preparing,setPreparing]=useState(false);const input=useRef<HTMLInputElement>(null),attempt=useRef(0);
 useEffect(()=>onPreparing(preparing),[preparing,onPreparing]);useEffect(()=>()=>{attempt.current++},[]);useEffect(()=>()=>{if(preview)URL.revokeObjectURL(preview)},[preview]);
 async function choose(file?:File){const token=++attempt.current;setError('');setPreview('');onChange(null);if(!file)return;
  if(!['image/jpeg','image/png','image/webp'].includes(file.type)||file.size>5*1024*1024){setError('Choose a JPEG, PNG or WebP photo up to 5 MB.');return;}
  setPreparing(true);
  try{const image=await createImageBitmap(file);try{
   if(!image.width||!image.height||image.width*image.height>40_000_000)throw new Error('Choose a smaller photo.');
   const scale=Math.min(1,1400/Math.max(image.width,image.height));const canvas=document.createElement('canvas');canvas.width=Math.max(1,Math.round(image.width*scale));canvas.height=Math.max(1,Math.round(image.height*scale));
   const ctx=canvas.getContext('2d');if(!ctx)throw new Error('Could not prepare this photo.');ctx.fillStyle='#ffffff';ctx.fillRect(0,0,canvas.width,canvas.height);ctx.drawImage(image,0,0,canvas.width,canvas.height);
   const jpg=await new Promise<Blob>((resolve,reject)=>canvas.toBlob(b=>b?resolve(b):reject(new Error('Could not prepare this photo.')),'image/jpeg',0.8));
   if(jpg.size>1024*1024)throw new Error('Choose a smaller photo.');if(token!==attempt.current)return;
   setPreview(URL.createObjectURL(jpg));onChange(jpg);
  }finally{image.close();}}catch(e){if(token===attempt.current)setError(e instanceof Error?e.message:'Could not read this photo.');}finally{if(token===attempt.current)setPreparing(false);}
 }
 return <div className="dog-photo-picker"><label htmlFor="dog-photo"><Camera size={18}/> Dog photo <span className="optional">Optional</span></label><input ref={input} id="dog-photo" type="file" accept="image/jpeg,image/png,image/webp" disabled={disabled||preparing} onChange={e=>void choose(e.target.files?.[0])}/><p className="fine">JPEG, PNG or WebP, up to 5 MB. Only you and Kevin can view it.</p>{preparing&&<p role="status">Preparing your photo…</p>}{preview&&<div className="dog-photo-preview"><img src={preview} alt="Selected dog photo"/><button type="button" className="text-button" disabled={disabled} onClick={()=>{attempt.current++;setPreview('');onChange(null);if(input.current)input.current.value='';}}><X size={16}/>Remove photo</button></div>}{error&&<p className="error" role="alert">{error}</p>}</div>;
}
