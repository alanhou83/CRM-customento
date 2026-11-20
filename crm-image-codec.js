/* 图片详情/缩略图统一编码，不放大小图，保留透明背景。 */
(function(root){
  'use strict';
  var LIMITS={detail:300000,thumb:60000};
  function blobOf(canvas,mime,quality){return new Promise(function(resolve,reject){canvas.toBlob(function(blob){if(blob)resolve(blob);else reject(new Error('无法编码图片'));},mime,quality);});}
  function dataUrl(blob){return new Promise(function(resolve,reject){var reader=new FileReader();reader.onload=function(){resolve(reader.result);};reader.onerror=function(){reject(new Error('无法读取压缩图片'));};reader.readAsDataURL(blob);});}
  async function encode(source,maxSide,limit){
    var img=new Image();
    await new Promise(function(resolve,reject){img.onload=resolve;img.onerror=function(){reject(new Error('图片无法解码，请选择PNG、JPEG或WebP图片'));};img.src=source;});
    if(!img.naturalWidth||!img.naturalHeight)throw new Error('图片尺寸无效');
    var scale=Math.min(1,maxSide/Math.max(img.naturalWidth,img.naturalHeight));
    for(var round=0;round<14;round++){
      var canvas=document.createElement('canvas');canvas.width=Math.max(1,Math.floor(img.naturalWidth*scale));canvas.height=Math.max(1,Math.floor(img.naturalHeight*scale));
      var ctx=canvas.getContext('2d',{willReadFrequently:true});ctx.drawImage(img,0,0,canvas.width,canvas.height);
      var pixels=ctx.getImageData(0,0,canvas.width,canvas.height).data,alpha=false;
      for(var p=3;p<pixels.length;p+=4){if(pixels[p]!==255){alpha=true;break;}}
      for(var q=0.82;q>=0.42;q-=0.1){
        var blob=await blobOf(canvas,'image/webp',q);
        if(alpha&&blob.type!=='image/webp')blob=await blobOf(canvas,'image/png');
        if(!alpha&&blob.type!=='image/webp')blob=await blobOf(canvas,'image/jpeg',q);
        if(blob.size<=limit){return {blob:blob,url:await dataUrl(blob),bytes:blob.size,width:canvas.width,height:canvas.height,mime:blob.type,transparent:alpha};}
      }
      scale*=0.8;
    }
    throw new Error('无法压缩到大小限制以内，请选择较小或更清晰的图片');
  }
  async function prepare(source){
    var detail=await encode(source,1600,LIMITS.detail);
    var thumb=await encode(detail.url,320,LIMITS.thumb);
    return {detail:detail,thumb:thumb};
  }
  root.CrmImageCodec={prepare:prepare,limits:LIMITS};
})(window);
