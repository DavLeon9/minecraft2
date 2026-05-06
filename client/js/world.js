import * as THREE from 'three';
import { BLOCK } from './constants.js';

// ─── World data ───────────────────────────────────────────────────────────────
export class World {
  constructor() { this.data=null; this.width=0; this.depth=0; this.height=0; }

  load({ data, width, depth, height }) {
    this.width=width; this.depth=depth; this.height=height;
    this.data=new Uint8Array(data);
  }
  _idx(x,y,z){ return x+z*this.width+y*this.width*this.depth; }
  _inBounds(x,y,z){ return x>=0&&x<this.width&&y>=0&&y<this.height&&z>=0&&z<this.depth; }
  getBlock(x,y,z){ x=x|0;y=y|0;z=z|0; return this._inBounds(x,y,z)?this.data[this._idx(x,y,z)]:BLOCK.AIR; }
  setBlock(x,y,z,t){ x=x|0;y=y|0;z=z|0; if(this._inBounds(x,y,z)) this.data[this._idx(x,y,z)]=t; }
  isSolid(x,y,z){ return this.getBlock(x,y,z)!==BLOCK.AIR; }
}

// ─── Helpers de textura ───────────────────────────────────────────────────────
function px(ctx,x,y,r,g,b){ ctx.fillStyle=`rgb(${r|0},${g|0},${b|0})`; ctx.fillRect(x,y,1,1); }
function n(v,a){ return Math.max(0,Math.min(255,v+(Math.random()*2-1)*a)); }

function makeTex(drawFn){
  const cv=document.createElement('canvas'); cv.width=cv.height=16;
  drawFn(cv.getContext('2d'));
  const t=new THREE.CanvasTexture(cv);
  t.magFilter=THREE.NearestFilter; t.minFilter=THREE.NearestFilter;
  t.colorSpace=THREE.SRGBColorSpace;
  return t;
}

// ─── Drawers ──────────────────────────────────────────────────────────────────
function grassTop(c){ for(let y=0;y<16;y++) for(let x=0;x<16;x++) px(c,x,y,n(78,18),n(138,22),n(50,14)); }
function grassSide(c){
  for(let y=0;y<16;y++) for(let x=0;x<16;x++)
    y<4 ? px(c,x,y,n(68,12),n(130,16),n(45,10)) : px(c,x,y,n(134,16),n(96,16),n(60,12));
}
function dirt(c){ for(let y=0;y<16;y++) for(let x=0;x<16;x++) px(c,x,y,n(134,18),n(96,18),n(60,12)); }
function stone(c){
  for(let y=0;y<16;y++) for(let x=0;x<16;x++){ const v=n(156,18); px(c,x,y,v,v,v); }
  c.fillStyle='rgba(70,70,70,.55)';
  [[3,0,3,6],[3,6,10,6],[10,6,10,15],[0,11,4,11],[13,0,13,5],[13,5,7,5]].forEach(([x0,y0,x1,y1])=>
    c.fillRect(Math.min(x0,x1),Math.min(y0,y1),Math.abs(x1-x0)||1,Math.abs(y1-y0)||1));
}
function cobblestone(c){
  // Stone base mais escura com padrão de pedra irregular
  for(let y=0;y<16;y++) for(let x=0;x<16;x++){ const v=n(128,22); px(c,x,y,v,v,v); }
  c.fillStyle='rgba(50,50,50,.6)';
  [[0,4,16,1],[0,10,16,1],[4,0,1,4],[11,4,1,6],[6,10,1,6],[2,0,1,4]].forEach(([x,y,w,h])=>c.fillRect(x,y,w,h));
}
function planks(c){
  for(let y=0;y<16;y++) for(let x=0;x<16;x++){
    const base=((y/4)|0)%2===0?172:156;
    px(c,x,y,n(base,10),n(base-48,10),n(base-92,8));
  }
  for(let y=0;y<16;y+=4) for(let x=0;x<16;x++) px(c,x,y,100,60,24);
  for(let y=0;y<16;y++) px(c,((y/4)|0)%2===0?8:4,y,n(110,8),n(68,8),n(30,6));
}
function logSide(c){
  for(let y=0;y<16;y++) for(let x=0;x<16;x++){
    const e=(x<2||x>13)?-30:0, s=x%3===0?-8:6;
    px(c,x,y,n(108+e+s,7),n(74+e+s,7),n(38+e+s,5));
  }
}
function logTop(c){
  for(let y=0;y<16;y++) for(let x=0;x<16;x++){
    const d=Math.sqrt((x-7.5)**2+(y-7.5)**2);
    const [r,g,b]=d<2.5?[72,44,16]:d<4?[122,84,42]:d<5.5?[92,60,26]:[108,74,36];
    px(c,x,y,n(r,6),n(g,6),n(b,5));
  }
}
function leaves(c){
  for(let y=0;y<16;y++) for(let x=0;x<16;x++)
    Math.random()<0.08?px(c,x,y,n(22,5),n(42,8),n(16,5)):px(c,x,y,n(Math.random()<.15?70:44,14),n(Math.random()<.15?148:106,18),n(30,12));
}

// ── Ores — base de pedra com spots coloridos ──────────────────────────────────
function oreBase(c, sr, sg, sb, count=8) {
  stone(c);  // começa com pedra
  for(let i=0;i<count;i++){
    const bx=1+(Math.random()*13)|0, by=1+(Math.random()*13)|0;
    for(let dy=0;dy<2;dy++) for(let dx=0;dx<2;dx++) px(c,bx+dx,by+dy,n(sr,15),n(sg,15),n(sb,15));
  }
}
function coalOre(c)   { oreBase(c, 30,  30,  28,  10); }
function ironOre(c)   { oreBase(c, 190, 120,  70,  8);  }
function goldOre(c)   { oreBase(c, 210, 180,  10,  7);  }
function diamondOre(c){ oreBase(c,  40, 190, 210,  6);  }

// ── Bancada de trabalho ───────────────────────────────────────────────────────
function craftingTop(c){
  // Fundo madeira com grelha de trabalho
  planks(c);
  c.fillStyle='rgba(60,30,10,.5)';
  c.fillRect(2,2,12,1); c.fillRect(2,2,1,12); c.fillRect(2,8,12,1); c.fillRect(8,2,1,12);
}
function craftingSide(c){
  // Lateral: prancha com ferramentas "penduradas" (linhas decorativas)
  planks(c);
  c.fillStyle='rgba(40,20,5,.55)';
  c.fillRect(3,3,1,10); c.fillRect(7,3,1,10); c.fillRect(11,3,1,10);
}

// ── Fornalha ──────────────────────────────────────────────────────────────────
function furnaceFront(c){
  // Face frontal: pedra com orifício escuro e "lume"
  stone(c);
  c.fillStyle='#1a1008'; c.fillRect(4,5,8,7);       // abertura escura
  c.fillStyle='rgba(220,120,10,.7)'; c.fillRect(5,8,6,3);  // brasa
  c.fillStyle='rgba(255,200,0,.5)';  c.fillRect(6,9,4,1);  // lume
}
function furnaceSide(c){ stone(c); }
function furnaceTop(c){
  stone(c);
  c.fillStyle='rgba(30,20,10,.5)'; c.fillRect(4,4,8,8);
}

// ─── Material factory ─────────────────────────────────────────────────────────
const _cache = {};
const m = (tex, opts={}) => new THREE.MeshLambertMaterial({ map:tex, ...opts });

function getMaterial(type) {
  if (_cache[type]) return _cache[type];
  switch(type) {
    case BLOCK.GRASS:
      _cache[type]=[m(makeTex(grassSide)),m(makeTex(grassSide)),m(makeTex(grassTop)),m(makeTex(dirt)),m(makeTex(grassSide)),m(makeTex(grassSide))];
      break;
    case BLOCK.DIRT:         _cache[type]=m(makeTex(dirt));        break;
    case BLOCK.STONE:        _cache[type]=m(makeTex(stone));       break;
    case BLOCK.COBBLESTONE:  _cache[type]=m(makeTex(cobblestone)); break;
    case BLOCK.WOOD:         _cache[type]=m(makeTex(planks));      break;
    case BLOCK.LOG: {
      const s=m(makeTex(logSide)), t=m(makeTex(logTop));
      _cache[type]=[s,s,t,t,s,s]; break;
    }
    case BLOCK.LEAVES: _cache[type]=m(makeTex(leaves),{transparent:true,opacity:0.92}); break;
    case BLOCK.COAL_ORE:    _cache[type]=m(makeTex(coalOre));    break;
    case BLOCK.IRON_ORE:    _cache[type]=m(makeTex(ironOre));    break;
    case BLOCK.GOLD_ORE:    _cache[type]=m(makeTex(goldOre));    break;
    case BLOCK.DIAMOND_ORE: _cache[type]=m(makeTex(diamondOre)); break;
    case BLOCK.CRAFTING_TABLE: {
      const top=m(makeTex(craftingTop)), sd=m(makeTex(craftingSide)), bt=m(makeTex(planks));
      _cache[type]=[sd,sd,top,bt,sd,sd]; break;
    }
    case BLOCK.FURNACE: {
      const front=m(makeTex(furnaceFront)), sd=m(makeTex(furnaceSide)), top=m(makeTex(furnaceTop));
      _cache[type]=[sd,sd,top,top,front,sd]; break;  // +Z face = frontal
      break;
    }
    default: _cache[type]=new THREE.MeshLambertMaterial({color:0xff00ff}); break;
  }
  return _cache[type];
}

// ─── WorldRenderer ────────────────────────────────────────────────────────────
export class WorldRenderer {
  constructor(scene, world) {
    this.scene=scene; this.world=world; this.meshes={}; this._geo=new THREE.BoxGeometry(1,1,1); this._dummy=new THREE.Object3D();
  }
  build() {
    this._clear();
    const counts={};
    this._eachVisible((x,y,z,t)=>{ counts[t]=(counts[t]||0)+1; });
    for(const [t,c] of Object.entries(counts)){
      const mesh=new THREE.InstancedMesh(this._geo,getMaterial(+t),c);
      mesh.castShadow=mesh.receiveShadow=true; this.meshes[t]=mesh; this.scene.add(mesh);
    }
    const cur={};
    this._eachVisible((x,y,z,t)=>{
      const i=cur[t]||0;
      this._dummy.position.set(x+.5,y+.5,z+.5); this._dummy.updateMatrix();
      this.meshes[t].setMatrixAt(i,this._dummy.matrix); cur[t]=i+1;
    });
    for(const mesh of Object.values(this.meshes)) mesh.instanceMatrix.needsUpdate=true;
  }
  rebuild(){ this.build(); }
  _clear(){ for(const m of Object.values(this.meshes)) this.scene.remove(m); this.meshes={}; }
  _eachVisible(fn){
    const {world:{width:W,depth:D,height:H,getBlock}}=this, w=this.world;
    const DIRS=[[1,0,0],[-1,0,0],[0,1,0],[0,-1,0],[0,0,1],[0,0,-1]];
    for(let y=0;y<H;y++) for(let z=0;z<D;z++) for(let x=0;x<W;x++){
      const t=w.getBlock(x,y,z); if(t===BLOCK.AIR) continue;
      for(const [dx,dy,dz] of DIRS) if(!w.isSolid(x+dx,y+dy,z+dz)){fn(x,y,z,t);break;}
    }
  }
}
