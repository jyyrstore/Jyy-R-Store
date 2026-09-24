const path = require('path');
const sanitize = require('sanitize-filename');
let fileTypeFromBufferImpl;

async function fileTypeFromBuffer(buffer) {
  if (!fileTypeFromBufferImpl) {
    ({ fileTypeFromBuffer: fileTypeFromBufferImpl } = await import('file-type'));
  }

  return fileTypeFromBufferImpl(buffer);
}
const ALLOWED = {
  IMAGE: ['image/jpeg','image/png','image/webp'],
  VIDEO: ['video/mp4','video/webm','video/quicktime'],
  AUDIO: ['audio/mpeg','audio/wav','audio/ogg','audio/mp4'],
  FILE: ['application/zip','application/x-zip-compressed','application/pdf','application/octet-stream'],
  THUMBNAIL: ['image/jpeg','image/png','image/webp']
};
const EXTENSIONS = {
  IMAGE: ['.jpg','.jpeg','.png','.webp'],
  THUMBNAIL: ['.jpg','.jpeg','.png','.webp'],
  VIDEO: ['.mp4','.webm','.mov'],
  AUDIO: ['.mp3','.wav','.ogg','.m4a'],
  FILE: ['.zip','.pdf']
};
async function detect(buffer) { return fileTypeFromBuffer(buffer); }
function safeName(name) { return sanitize(path.basename(String(name || 'file'))) || 'file'; }
function ext(name) { return path.extname(name || '').toLowerCase(); }
function validateContentType(type, detectedMime, category) {
  const allowed = ALLOWED[category] || ALLOWED.FILE;
  return allowed.includes(type) && (!detectedMime || allowed.includes(detectedMime));
}
function validateUploadDescriptor({originalName,mime},category){
  const normalized=String(category||'FILE').toUpperCase();

  if(!ALLOWED[normalized]){
    throw Object.assign(
      new Error('Tipe file tidak didukung.'),
      {status:400,code:'UNSUPPORTED_FILE_TYPE',expose:true}
    );
  }

  const cleanName=safeName(originalName);
  const originalExt=ext(cleanName);
  const allowedExt=EXTENSIONS[normalized]||[];

  if(!originalExt || !allowedExt.includes(originalExt)){
    throw Object.assign(
      new Error(`Extension ${originalExt||'(tanpa extension)'} tidak diperbolehkan.`),
      {status:400,code:'INVALID_FILE_EXTENSION',expose:true}
    );
  }

  const declaredMime=String(mime||'').toLowerCase();
  const allowedMime=ALLOWED[normalized]||[];

  if(!declaredMime || !allowedMime.includes(declaredMime)){
    throw Object.assign(
      new Error('MIME type file tidak diperbolehkan.'),
      {status:400,code:'INVALID_FILE_MIME',expose:true}
    );
  }

  return {
    mime:declaredMime,
    kind:normalized==='THUMBNAIL'?'IMAGE':normalized,
    extension:originalExt.slice(1),
    originalName:cleanName
  };
}

async function validateFile(file, category) {
  if (!file || !Buffer.isBuffer(file.buffer) || file.buffer.length===0) throw Object.assign(new Error('File upload tidak valid.'),{status:400,code:'INVALID_FILE',expose:true});
  const normalized=String(category||'FILE').toUpperCase();
  if (!ALLOWED[normalized]) throw Object.assign(new Error('Tipe file tidak didukung.'),{status:400,code:'UNSUPPORTED_FILE_TYPE',expose:true});
  const originalExt=ext(file.originalname);
  const allowedExt=EXTENSIONS[normalized]||[];
  if (allowedExt.length && !allowedExt.includes(originalExt)) throw Object.assign(new Error(`Extension ${originalExt||'(tanpa extension)'} tidak diperbolehkan.`),{status:400,code:'INVALID_FILE_EXTENSION',expose:true});
  const detected=await detect(file.buffer);
  const detectedMime=detected?.mime || null;
  const declaredMime=String(file.mimetype||'').toLowerCase();
  if (!validateContentType(declaredMime,detectedMime,normalized)) throw Object.assign(new Error('MIME type file tidak diperbolehkan atau tidak cocok dengan content.'),{status:400,code:'INVALID_FILE_MIME',expose:true});
  const mime=detectedMime||declaredMime;
  const kind=normalized==='THUMBNAIL'?'IMAGE':normalized;
  return {mime,kind,extension:detected?.ext||originalExt.slice(1),size:file.size||file.buffer.length,originalName:safeName(file.originalname)};
}
module.exports = { detect, safeName, ext, validateContentType, validateUploadDescriptor, validateFile, ALLOWED, EXTENSIONS };
