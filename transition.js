/* 채택한 쪽 넘김. 글과 바탕을 기기 안에서만 그려 셰이더에 건넨다. */
(function(global){
'use strict';
const vertex=`attribute vec2 aPosition;varying vec2 vUv;void main(){vUv=vec2((aPosition.x+1.0)*.5,(1.0-aPosition.y)*.5);gl_Position=vec4(aPosition,0.,1.);}`;
const fragment=`
precision highp float;
varying vec2 vUv;
uniform sampler2D uBefore;
uniform sampler2D uAfter;
uniform sampler2D uBeforeSoft;
uniform sampler2D uAfterSoft;
uniform float uProgress;
uniform vec2 uSize;
uniform float uReduced;
uniform float uMode;
vec2 safe(vec2 p){return clamp(p,vec2(.001),vec2(.999));}
vec3 above(vec2 p){return texture2D(uBefore,safe(p)).rgb;}
vec3 below(vec2 p){return texture2D(uAfter,safe(p)).rgb;}
vec3 softBefore(vec2 p,vec2 r){
 return mix(above(p),texture2D(uBeforeSoft,safe(p)).rgb,clamp(r.x*uSize.x/6.0,0.,1.));
}
vec3 softAfter(vec2 p,vec2 r){
 return mix(below(p),texture2D(uAfterSoft,safe(p)).rgb,clamp(r.x*uSize.x/6.0,0.,1.));
}
float surface(float x,float p){
 float approach=smoothstep(0.,.30,p);
 float plunge=smoothstep(.285,.495,p);
 float gate=smoothstep(.02,.15,p)*(1.-smoothstep(.50,.68,p));
 float swell=.034*sin(x*5.4+p*6.3)+.014*sin(x*14.7-p*9.0)+.006*sin(x*29.0+p*12.0);
 return 1.085-.15*approach-1.20*plunge+gate*(swell+.085*(x-.5));
}
float hash(float n){return fract(sin(n*127.1+311.7)*43758.5453);}
float pulse(float p,float start,float peak,float end){return smoothstep(start,peak,p)*(1.-smoothstep(peak,end,p));}
float inkDrop(vec2 uv,vec2 center,float p,float delay,float size,float phase){
 float age=max(0.,p-delay);
 vec2 q=(uv-center)*uSize;
 float angle=atan(q.y,q.x);
 float rough=1.+.064*sin(angle*7.+phase)+.025*sin(angle*13.-phase);
 float radius=length(uSize)*size*pow(age,.87);
 float feather=mix(5.,15.,smoothstep(0.,.18,age));
 float dist=radius*rough-length(q);
 float body=smoothstep(-feather,feather,dist);
 float seep=smoothstep(-feather*2.1,feather*.5,dist);
 return mix(body,seep,.16)*smoothstep(0.,.026,age);
}
vec3 ink(vec2 uv,float p){
 vec2 q=(uv-vec2(.43,.48))*uSize;
 float angle=atan(q.y,q.x);
 float rough=1.+.085*sin(angle*7.+.6)+.036*sin(angle*17.)+.014*sin(angle*43.);
 float radius=length(uSize)*.77*pow(p,.83);
 float dist=radius*rough-length(q);
 // 퍼지는 경계만 넓고 흐릿하게. 이미 번진 안쪽의 글은 선명하게 남긴다.
 float feather=mix(13.,25.,smoothstep(0.,.46,p));
 float body=smoothstep(-feather,feather,dist);
 float seep=smoothstep(-feather*2.1,feather*.5,dist);
 float mask=mix(body,seep,.16)*smoothstep(0.,.035,p);
 // 작은 두 방울이 시차를 두고 번져 큰 자국으로 스며든다.
 float dropA=inkDrop(uv,vec2(.72,.30),p,.035,.29,1.3);
 float dropB=inkDrop(uv,vec2(.76,.77),p,.085,.23,3.8);
 mask=1.-(1.-mask)*(1.-dropA)*(1.-dropB);
 return mix(above(uv),below(uv),mask);
}
vec3 signalAt(vec2 uv,float p){
 float row=floor(uv.y*19.);
 float change=.38+hash(row*11.+4.)*.19;
 float next=smoothstep(change-.018,change+.018,p);
 return mix(above(uv),below(uv),next);
}
vec3 glitch(vec2 uv,float p){
 // 세 번의 짧은 신호 이탈. 마지막 박자에는 제자리로 붙는다.
 float hit=pulse(p,.13,.21,.30)*.46+pulse(p,.32,.43,.57)+pulse(p,.61,.65,.77)*.28;
 float beat=floor(p*17.);
 float row=floor(uv.y*19.);
 float seed=hash(row+beat*31.);
 float strip=step(.52,seed);
 float tear=(hash(row*7.+beat*13.)-.5)*.17*strip*hit;
 float fine=step(.92,hash(floor(uv.y*uSize.y/3.)+beat*67.));
 tear+=(hash(row+beat)-.5)*.034*fine*hit;
 float jump=(step(.64,seed)-step(seed,.18))*.009*hit;
 vec2 shifted=uv+vec2(tear,jump);
 // 장면 교체 시점도 띠마다 살짝 다르게 둔다.
 float change=.38+hash(row*11.+4.)*.19;
 float next=smoothstep(change-.018,change+.018,p);
 vec3 color=mix(above(shifted),below(shifted),next);
 // 글자와 신호 띠의 경계에서 세 채널이 서로 다른 방향으로 벌어진다.
 float fringe=hit*(4.+strip*4.5);
 vec2 split=vec2(fringe,hit*2.)/uSize;
 vec2 greenShift=vec2(-hit*1.2,hit*.8)/uSize;
 vec3 red=signalAt(shifted+split,p);
 vec3 green=signalAt(shifted+greenShift,p);
 vec3 blue=signalAt(shifted-split,p);
 color=mix(color,vec3(red.r,green.g,blue.b),.92);
 // 일부 경계만 작은 디지털 블록으로 끊겨 보이게 한다.
 vec2 pixel=uv*uSize;
 vec2 cell=floor(pixel/vec2(9.,4.));
 float chip=step(.83,hash(cell.x+cell.y*71.+beat*131.))*hit;
 vec2 snapped=(floor(shifted*uSize/vec2(9.,4.))+.5)*vec2(9.,4.)/uSize;
 vec3 pixelRed=signalAt(snapped+split*1.6,p);
 vec3 pixelGreen=signalAt(snapped+greenShift,p);
 vec3 pixelBlue=signalAt(snapped-split*1.6,p);
 color=mix(color,vec3(pixelRed.r,pixelGreen.g,pixelBlue.b),chip*.8);
 // 옆으로 밀린 잔상은 잠깐만 남기며 바탕의 밝기는 유지한다.
 vec3 echo=mix(above(uv-vec2(tear*.4,0.)),below(uv-vec2(tear*.4,0.)),next);
 color=mix(color,echo,strip*hit*.13);
 float scan=step(.91,fract(uv.y*uSize.y*.25));
 color*=1.-scan*hit*.07;
 return color;
}
void main(){
 vec2 uv=vUv;float p=uProgress;
 if(p<=.0001){gl_FragColor=vec4(above(uv),1.);return;}
 if(p>=.9999){gl_FragColor=vec4(below(uv),1.);return;}
 if(uReduced>.5){gl_FragColor=vec4(mix(above(uv),below(uv),p),1.);return;}
 if(uMode>1.5){gl_FragColor=vec4(glitch(uv,p),1.);return;}
 if(uMode>.5){gl_FragColor=vec4(ink(uv,p),1.);return;}
 float line=surface(uv.x,p),d=uv.y-line;
 float contact=exp(-abs(d)*19.0);
 float core=exp(-d*d*1800.0);
 float wet=smoothstep(-.014,.014,d);
 float settle=1.-smoothstep(.49,.98,p);
 float wake=smoothstep(.29,.51,p)*settle;
 float slope=(surface(uv.x+.005,p)-surface(uv.x-.005,p))/.01;
 // 물막의 두께를 지나는 자리에서 영상이 접히고 넓게 굴절된다.
 vec2 bend;
 bend.x=(slope*.016+sin(uv.y*31.+uv.x*8.-p*19.)*.008)*contact;
 bend.y=contact*(.060*d/sqrt(d*d+.0008)+.018*sin(uv.x*12.-p*7.));
 vec2 ripple=vec2(sin(uv.y*24.+uv.x*6.-p*17.),cos(uv.x*17.-uv.y*9.+p*15.))*.0065*wake;
 vec2 first=uv+bend;
 first.y+=.008*smoothstep(.08,.36,p);
 vec2 second=vec2(.5)+(uv-vec2(.5))/(1.+.028*wake)+bend*.85+ripple;
 // 렌즈에 물이 닿는 짧은 구간의 흐림. 통과 뒤에는 굴절만 잠시 남는다.
 float hit=exp(-pow((p-.415)/.059,2.));
 float radius=contact*3.8+core*5.5+hit*2.8+1.1*wake;
 vec2 blur=vec2(radius,radius*1.25)/uSize;
 vec3 a=softBefore(first,blur),b=softAfter(second,blur*.9);
 // 물 아래에서 올려다본 반사가 윗부분에 잠깐 남는다.
 vec2 mirrored=vec2(uv.x+.018*sin(uv.y*45.+uv.x*7.-p*17.)*wake,.56-uv.y*.82+.026*sin(uv.x*12.+p*14.)*wake);
 float reflection=(1.-smoothstep(.09,.30,uv.y))*.34*wake*wet;
 b=mix(b,softAfter(mirrored,vec2(1.8)/uSize),reflection);
 vec3 color=mix(a,b,wet);
 // 수면의 반사광은 경계의 짧은 구간에만 남긴다.
 vec3 mirror=softBefore(vec2(first.x,clamp(line-d*.55,0.,1.)),blur*1.4);
 color=mix(color,mirror,contact*wet*.20);
 float shine=exp(-abs(d+.009)*150.)*(.028+.028*sin(uv.x*19.+p*13.));
 color+=vec3(.70,.87,.89)*shine;
 color=mix(color,color*vec3(.84,1.015,1.055),wet*(.20*wake+.14*contact));
 gl_FragColor=vec4(clamp(color,0.,1.),1.);
}`;

// 화면에서 보이는 글자 위치·글꼴·꾸밈을 그대로 읽는다. 원문은 밖으로 보내지 않는다.
function capture(sheet,w,h,scale){
  const canvas=document.createElement('canvas');
  canvas.width=Math.round(w*scale);canvas.height=Math.round(h*scale);
  const c=canvas.getContext('2d');c.scale(scale,scale);
  const bounds=sheet.getBoundingClientRect(),sx=w/bounds.width,sy=h/bounds.height;
  const style=getComputedStyle(sheet);
  c.fillStyle=style.getPropertyValue('--paper').trim()||style.backgroundColor;c.fillRect(0,0,w,h);
  const ground=sheet.dataset.ground;
  const backdrop=global.GeulBackdrop;
  if(ground!=='wongoji'){
    const bg=backdrop&&(backdrop.snapshot(sheet)||backdrop.still(ground,w,h,sheet.dataset.scene));
    if(bg)c.drawImage(bg,0,0,w,h);
  }
  const column=sheet.querySelector('.column');
  if(ground==='letter'&&column){
    const r=column.getBoundingClientRect(),st=getComputedStyle(column),font=parseFloat(st.fontSize);
    const unit=v=>v.endsWith('rem')?parseFloat(v)*parseFloat(getComputedStyle(document.documentElement).fontSize):v.endsWith('em')?parseFloat(v)*font:parseFloat(v)||0;
    const pad=unit(st.getPropertyValue('--lp-x').trim())||font*2;
    const top=unit(st.getPropertyValue('--lp-t').trim()),bottom=unit(st.getPropertyValue('--lp-b').trim());
    const x=(r.left-bounds.left)*sx,y=(r.top-bounds.top)*sy;
    c.fillStyle=st.getPropertyValue('--lp-face').trim();c.fillRect(x-pad,y-top,r.width*sx+2*pad,r.height*sy+top+bottom);
    c.strokeStyle=st.getPropertyValue('--lp-rule').trim();c.lineWidth=1;
    for(let yy=y+font*1.72;yy<y+r.height*sy;yy+=font*1.95){c.beginPath();c.moveTo(x,yy);c.lineTo(x+r.width*sx,yy);c.stroke();}
  }
  // 원고지의 칸은 글자와 같은 실제 위치에서 가져온다.
  if(ground==='wongoji'){
    c.strokeStyle=getComputedStyle(column||sheet).getPropertyValue('--wg-rule').trim()||'#a78979';c.lineWidth=.7;
    sheet.querySelectorAll('.ch,.sp,.wg-empty,.wg-indent').forEach(el=>{
      const r=el.getBoundingClientRect();if(r.bottom<bounds.top||r.top>bounds.bottom)return;
      c.strokeRect((r.left-bounds.left)*sx,(r.top-bounds.top)*sy,r.width*sx,r.height*sy);
    });
  }
  const area=sheet.querySelector('.scroll')||column||sheet;
  const clip=area.getBoundingClientRect();
  c.save();c.beginPath();c.rect((clip.left-bounds.left)*sx,(clip.top-bounds.top)*sy,clip.width*sx,clip.height*sy);c.clip();
  const walk=document.createTreeWalker(area,NodeFilter.SHOW_TEXT);
  const segmenter=typeof Intl.Segmenter==='function'?new Intl.Segmenter('ko',{granularity:'grapheme'}):null;
  let node;
  while((node=walk.nextNode())){
    const el=node.parentElement;if(!el||el.closest('button,input,script,style,.sr-only,[aria-hidden="true"]:not(.sheet)'))continue;
    const st=getComputedStyle(el);if(st.display==='none'||st.visibility==='hidden')continue;
    let opacity=1;for(let a=el;a&&a!==sheet;a=a.parentElement)opacity*=Number(getComputedStyle(a).opacity);
    if(opacity<.005)continue;
    c.globalAlpha=opacity;c.font=`${st.fontStyle} ${st.fontWeight} ${st.fontSize} ${st.fontFamily}`;c.fillStyle=st.color;
    const text=node.textContent;let offset=0;
    const segments=segmenter?[...segmenter.segment(text)].map(s=>s.segment):Array.from(text);
    for(const ch of segments){
      const range=document.createRange();range.setStart(node,offset);offset+=ch.length;range.setEnd(node,offset);
      if(!ch.trim())continue;
      const r=range.getBoundingClientRect();if(!r.width||r.bottom<bounds.top||r.top>bounds.bottom)continue;
      const x=(r.left-bounds.left)*sx,y=(r.top-bounds.top)*sy;
      const metrics=c.measureText(ch),font=parseFloat(st.fontSize);
      const ascent=metrics.fontBoundingBoxAscent||font*.9,descent=metrics.fontBoundingBoxDescent||font*.2;
      const baseline=y+(r.height*sy-ascent-descent)/2+ascent;
      c.fillText(ch,x,baseline);
      const deco=st.textDecorationLine;
      if(deco.includes('underline')||deco.includes('line-through')){
        c.strokeStyle=st.color;c.lineWidth=1;
        for(const yy of [deco.includes('underline')?baseline+font*.18:null,deco.includes('line-through')?baseline-font*.3:null]){
          if(yy===null)continue;c.beginPath();c.moveTo(x,yy);c.lineTo(x+r.width*sx,yy);c.stroke();
        }
      }
    }
  }
  c.restore();return canvas;
}
function create(stage,from,to,mode,w,h){
  const canvas=document.createElement('canvas');canvas.className='flip-texture';canvas.setAttribute('aria-hidden','true');
  const gl=canvas.getContext('webgl',{alpha:false,antialias:false,preserveDrawingBuffer:true});if(!gl)return null;
  let program,buffer,textures=[],shaders=[],lost=false;
  const dispose=()=>{canvas.remove();textures.forEach(t=>gl.deleteTexture(t));if(buffer)gl.deleteBuffer(buffer);if(program)gl.deleteProgram(program);shaders.forEach(s=>gl.deleteShader(s));gl.getExtension('WEBGL_lose_context')?.loseContext();};
  try{
    const compile=(type,source)=>{const s=gl.createShader(type);shaders.push(s);gl.shaderSource(s,source);gl.compileShader(s);if(!gl.getShaderParameter(s,gl.COMPILE_STATUS))throw Error(gl.getShaderInfoLog(s));return s;};
    program=gl.createProgram();gl.attachShader(program,compile(gl.VERTEX_SHADER,vertex));gl.attachShader(program,compile(gl.FRAGMENT_SHADER,fragment));gl.linkProgram(program);if(!gl.getProgramParameter(program,gl.LINK_STATUS))throw Error(gl.getProgramInfoLog(program));gl.useProgram(program);
    buffer=gl.createBuffer();gl.bindBuffer(gl.ARRAY_BUFFER,buffer);gl.bufferData(gl.ARRAY_BUFFER,new Float32Array([-1,-1,1,-1,-1,1,-1,1,1,-1,1,1]),gl.STATIC_DRAW);
    const pos=gl.getAttribLocation(program,'aPosition');gl.enableVertexAttribArray(pos);gl.vertexAttribPointer(pos,2,gl.FLOAT,false,0,0);
    const scale=Math.min(2,global.devicePixelRatio||1,2048/Math.max(w,h));
    canvas.width=Math.round(w*scale);canvas.height=Math.round(h*scale);gl.viewport(0,0,canvas.width,canvas.height);
    const pages=[capture(from,w,h,scale),capture(to,w,h,scale)];
    for(let i=0;i<2;i++){
      const blurred=document.createElement('canvas');blurred.width=canvas.width;blurred.height=canvas.height;
      const c=blurred.getContext('2d');c.drawImage(pages[i],0,0);c.filter=`blur(${6*scale}px)`;c.drawImage(pages[i],0,0);pages.push(blurred);
    }
    textures=pages.map((page,i)=>{const t=gl.createTexture();gl.activeTexture(gl.TEXTURE0+i);gl.bindTexture(gl.TEXTURE_2D,t);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.LINEAR);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.LINEAR);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_S,gl.CLAMP_TO_EDGE);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_T,gl.CLAMP_TO_EDGE);gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,gl.RGBA,gl.UNSIGNED_BYTE,page);gl.uniform1i(gl.getUniformLocation(program,['uBefore','uAfter','uBeforeSoft','uAfterSoft'][i]),i);return t;});
    gl.uniform2f(gl.getUniformLocation(program,'uSize'),w,h);gl.uniform1f(gl.getUniformLocation(program,'uMode'),{dive:0,ink:1,glitch:2}[mode]);gl.uniform1f(gl.getUniformLocation(program,'uReduced'),0);
    const progress=gl.getUniformLocation(program,'uProgress');
    canvas.addEventListener('webglcontextlost',()=>{lost=true;canvas.hidden=true;});stage.append(canvas);
    return {canvas,render(p){if(lost)return false;gl.uniform1f(progress,p);gl.drawArrays(gl.TRIANGLES,0,6);return true;},dispose};
  }catch(e){dispose();return null;}
}
global.GeulTransition={create,capture};
})(window);
