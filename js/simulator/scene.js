import*as THREE from'../../vendor/three/three.module.min.js';

const UP=new THREE.Vector3(0,1,0);

export class RideScene{
 constructor(canvas){
  this.canvas=canvas;this.scene=new THREE.Scene();this.scene.background=new THREE.Color(0x071015);this.scene.fog=new THREE.FogExp2(0x071015,.022);
  this.renderer=new THREE.WebGLRenderer({canvas,antialias:true,powerPreference:'high-performance'});this.renderer.setPixelRatio(Math.min(devicePixelRatio,1.75));this.renderer.shadowMap.enabled=true;this.renderer.shadowMap.type=THREE.PCFSoftShadowMap;this.renderer.outputColorSpace=THREE.SRGBColorSpace;this.renderer.toneMapping=THREE.ACESFilmicToneMapping;this.renderer.toneMappingExposure=1.42;
  this.camera=new THREE.PerspectiveCamera(42,1,.1,120);this.cameraViews={operator:{position:[13.5,7.3,18],target:[0,5.1,0]},wide:{position:[20,13,25],target:[0,5.4,0]},platform:{position:[0,5.4,15],target:[0,5.1,0]}};this.camera.position.fromArray(this.cameraViews.operator.position);this.cameraTarget=new THREE.Vector3(...this.cameraViews.operator.target);this.desiredCamera=this.camera.position.clone();this.desiredTarget=this.cameraTarget.clone();
  this.materials=this.createMaterials();this.fountains=[];this.beacons=[];this.gondolaAngle=0;this.armAngle=0;this.buildEnvironment();this.buildRide();this.buildShowLighting();this.resize();new ResizeObserver(()=>this.resize()).observe(canvas.parentElement);
 }
 createMaterials(){return{
  black:new THREE.MeshStandardMaterial({color:0x11171a,metalness:.72,roughness:.3}),
  steel:new THREE.MeshStandardMaterial({color:0x566167,metalness:.88,roughness:.25}),
  darkSteel:new THREE.MeshStandardMaterial({color:0x252d31,metalness:.86,roughness:.3}),
  acid:new THREE.MeshStandardMaterial({color:0x26380a,emissive:0x548800,emissiveIntensity:.82,metalness:.08,roughness:.3}),
  lime:new THREE.MeshStandardMaterial({color:0xcfff00,emissive:0x8cab00,emissiveIntensity:1.25,metalness:.28,roughness:.3}),
  yellow:new THREE.MeshStandardMaterial({color:0xf1c916,metalness:.32,roughness:.45}),
  concrete:new THREE.MeshStandardMaterial({color:0x272d2e,metalness:.05,roughness:.88}),
  rubber:new THREE.MeshStandardMaterial({color:0x080a0b,metalness:.08,roughness:.8}),
  seat:new THREE.MeshStandardMaterial({color:0x263438,metalness:.35,roughness:.5}),
  glass:new THREE.MeshPhysicalMaterial({color:0x9ddb44,emissive:0x5a8f00,emissiveIntensity:.42,transparent:true,opacity:.48,roughness:.12,transmission:.18}),
  water:new THREE.MeshPhysicalMaterial({color:0x77ff35,emissive:0x2a9400,emissiveIntensity:1.6,transparent:true,opacity:.68,roughness:.1,metalness:.05}),
  fence:new THREE.MeshStandardMaterial({color:0x596267,metalness:.9,roughness:.3})
 }}
 mesh(geometry,material,parent=this.scene){const m=new THREE.Mesh(geometry,material);m.castShadow=true;m.receiveShadow=true;parent.add(m);return m}
 box(size,position,material,parent=this.scene){const m=this.mesh(new THREE.BoxGeometry(...size),material,parent);m.position.set(...position);return m}
 cylinder(radius,length,position,material,parent=this.scene,segments=20){const m=this.mesh(new THREE.CylinderGeometry(radius,radius,length,segments),material,parent);m.position.set(...position);return m}
 beamBetween(a,b,radius,material,parent=this.scene){const start=new THREE.Vector3(...a),end=new THREE.Vector3(...b),delta=end.clone().sub(start),m=this.mesh(new THREE.CylinderGeometry(radius,radius,delta.length(),12),material,parent);m.position.copy(start).add(end).multiplyScalar(.5);m.quaternion.setFromUnitVectors(UP,delta.normalize());return m}
 buildEnvironment(){
  const ground=this.mesh(new THREE.PlaneGeometry(100,100),new THREE.MeshStandardMaterial({color:0x101719,metalness:.05,roughness:.94}));ground.rotation.x=-Math.PI/2;ground.receiveShadow=true;
  const grid=new THREE.GridHelper(100,50,0x314044,0x1c292c);grid.position.y=.015;grid.material.transparent=true;grid.material.opacity=.42;this.scene.add(grid);
  for(let i=0;i<16;i++){const x=(i%8-3.5)*5.2,z=-10-Math.floor(i/8)*4.8,h=3+((i*17)%4);const ruin=this.box([3.4,h,2.4],[x,h/2,z],i%3===0?this.materials.darkSteel:this.materials.concrete);ruin.rotation.y=(i%5-.2)*.08}
  this.addFence(-13,13,8.7);this.addFence(-13,-7.5,4.5);this.addFence(7.5,13,4.5);
  for(let i=0;i<7;i++){this.box([2.2,.22,.75],[-10.5+i*.5,.2+i*.22,2.3+i*.75],this.materials.steel)}
  for(const x of[-12.5,12.5]){this.beamBetween([x,.3,-3],[x,4.5,-3],.13,this.materials.fence);this.beamBetween([x,4.5,-3],[x,4.5,5],.13,this.materials.fence)}
 }
 addFence(x1,x2,z){for(let x=x1;x<=x2;x+=1.7)this.box([.09,1.45,.09],[x,.72,z],this.materials.fence);this.box([Math.abs(x2-x1)+.3,.09,.09],[(x1+x2)/2,1.25,z],this.materials.fence);this.box([Math.abs(x2-x1)+.3,.06,.06],[(x1+x2)/2,.58,z],this.materials.fence)}
 buildRide(){
  this.ride=new THREE.Group();this.scene.add(this.ride);
  this.box([19,.8,9],[0,.72,0],this.materials.concrete,this.ride);this.box([17.6,.18,7.7],[0,1.2,0],this.materials.darkSteel,this.ride);
  const pool=this.mesh(new THREE.CircleGeometry(6.6,64),this.materials.acid,this.ride);pool.rotation.x=-Math.PI/2;pool.position.set(0,1.32,.25);const inner=this.mesh(new THREE.CircleGeometry(5.8,64),this.materials.glass,this.ride);inner.rotation.x=-Math.PI/2;inner.position.set(0,1.35,.25);
  for(let i=0;i<30;i++){const hazard=this.box([.42,.16,.7],[-7.1+i*.49,1.34,4.06],i%2?this.materials.yellow:this.materials.rubber,this.ride);hazard.rotation.y=-.58}
  const towerX=6.65,pivotY=9.5;this.armRadius=6.05;this.pivotY=pivotY;this.armPivots=[];
  for(const side of[-1,1]){
   const x=side*towerX,tower=new THREE.Group();this.ride.add(tower);
   this.box([1.25,8.4,1.7],[x,5.25,0],this.materials.black,tower);this.box([2.35,.65,2.45],[x,1.55,0],this.materials.darkSteel,tower);this.box([1.65,1.25,2.15],[x,pivotY,0],this.materials.steel,tower);
   this.beamBetween([x,1.75,-.45],[x-side*2.7,7.8,-.45],.23,this.materials.steel,tower);this.beamBetween([x,2.25,.45],[x-side*2.5,8.2,.45],.18,this.materials.darkSteel,tower);
   const motor=this.cylinder(1.15,.8,[x,pivotY,0],this.materials.black,tower,32);motor.rotation.z=Math.PI/2;const motorRing=this.mesh(new THREE.TorusGeometry(1.14,.12,10,32),this.materials.lime,tower);motorRing.position.set(x,pivotY,side*.42);motorRing.rotation.y=Math.PI/2;
   const pivot=new THREE.Group();pivot.position.set(x,pivotY,0);tower.add(pivot);for(const z of[-.36,.36])this.box([.62,this.armRadius,.33],[0,-this.armRadius/2,z],this.materials.steel,pivot);for(let j=1;j<6;j++)this.beamBetween([-.31,-j*.95,-.36],[.31,-(j+.55)*.95,.36],.11,this.materials.lime,pivot);const endBearing=this.cylinder(.82,.92,[0,-this.armRadius,0],this.materials.black,pivot,28);endBearing.rotation.z=Math.PI/2;this.armPivots.push(pivot);
   const beaconBase=this.cylinder(.32,.16,[x,pivotY+1.15,0],this.materials.black,tower);const beacon=this.mesh(new THREE.SphereGeometry(.2,12,8),new THREE.MeshStandardMaterial({color:0xff5a19,emissive:0xff1800,emissiveIntensity:2.5}),tower);beacon.position.set(x,pivotY+1.36,0);this.beacons.push(beacon)
  }
  this.gondola=new THREE.Group();this.ride.add(this.gondola);this.box([12.7,.72,2.5],[0,0,0],this.materials.darkSteel,this.gondola);this.box([11.8,.34,2.85],[0,-.48,0],this.materials.black,this.gondola);for(const side of[-1,1]){const bearing=this.cylinder(.8,.65,[side*towerX,0,0],this.materials.steel,this.gondola,28);bearing.rotation.z=Math.PI/2}
  const riderColours=[0x91a7aa,0x71837d,0x303b43,0x9b7c4a,0x576b73,0x798b54];
  for(const row of[-1,1])for(let i=0;i<19;i++){
   const x=-5.25+i*.583,seatGroup=new THREE.Group();seatGroup.position.set(x,.15,row*.78);seatGroup.rotation.y=row<0?Math.PI:0;this.gondola.add(seatGroup);
   this.box([.5,.2,.7],[0,-.08,0],this.materials.seat,seatGroup);this.box([.5,1.08,.18],[0,.48,-.29],this.materials.seat,seatGroup);this.box([.07,.85,.1],[-.245,.23,0],this.materials.steel,seatGroup);this.box([.07,.85,.1],[.245,.23,0],this.materials.steel,seatGroup);
   const torsoMat=new THREE.MeshStandardMaterial({color:riderColours[(i+(row>0?2:0))%riderColours.length],roughness:.75});this.box([.31,.6,.25],[0,.3,.05],torsoMat,seatGroup);const head=this.mesh(new THREE.SphereGeometry(.145,12,8),new THREE.MeshStandardMaterial({color:[0xd8aa7b,0x8a5c3b,0xefc7a1][i%3],roughness:.9}),seatGroup);head.position.set(0,.82,.02);
   const restraint=this.mesh(new THREE.TorusGeometry(.225,.042,8,16,Math.PI),this.materials.lime,seatGroup);restraint.position.set(0,.56,.33);restraint.rotation.z=Math.PI;this.box([.055,.62,.07],[-.215,.28,.31],this.materials.lime,seatGroup);this.box([.055,.62,.07],[.215,.28,.31],this.materials.lime,seatGroup)
  }
  this.buildFountains();this.buildSign();this.setArmPosition(0);
 }
 buildFountains(){for(let i=0;i<13;i++){const x=-5.7+i*.95,material=this.materials.water.clone(),jet=this.mesh(new THREE.CylinderGeometry(.055,.14,1,9),material,this.ride);jet.position.set(x,1.65,2.7+(i%2)*.35);jet.scale.y=.01;jet.visible=false;this.fountains.push(jet)}}
 buildSign(){const canvas=document.createElement('canvas');canvas.width=1024;canvas.height=256;const ctx=canvas.getContext('2d');ctx.fillStyle='#080d0e';ctx.fillRect(0,0,1024,256);ctx.strokeStyle='#b8ee00';ctx.lineWidth=14;ctx.strokeRect(8,8,1008,240);for(let x=-80;x<1100;x+=80){ctx.fillStyle=(x/80)%2?'#d2ff00':'#111';ctx.beginPath();ctx.moveTo(x,256);ctx.lineTo(x+55,190);ctx.lineTo(x+105,190);ctx.lineTo(x+50,256);ctx.fill()}ctx.fillStyle='#dfff00';ctx.font='900 112px Arial';ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillText('TOXICATOR',512,104);ctx.fillStyle='#829091';ctx.font='600 24px Arial';ctx.fillText('PHALANX // CENTRIFUGE SYSTEM 01',512,170);const texture=new THREE.CanvasTexture(canvas);texture.colorSpace=THREE.SRGBColorSpace;const sign=this.mesh(new THREE.PlaneGeometry(8,2),new THREE.MeshStandardMaterial({map:texture,emissiveMap:texture,emissive:0x779900,emissiveIntensity:.65}),this.ride);sign.position.set(0,11.7,-2.8);this.beamBetween([-4,10.5,-2.8],[-4,12.7,-2.8],.12,this.materials.steel,this.ride);this.beamBetween([4,10.5,-2.8],[4,12.7,-2.8],.12,this.materials.steel,this.ride)}
 buildShowLighting(){
  this.scene.add(new THREE.HemisphereLight(0x8aabb7,0x10140b,1.8));const moon=new THREE.DirectionalLight(0xbad8e9,3.2);moon.position.set(-8,18,12);moon.castShadow=true;moon.shadow.mapSize.set(2048,2048);moon.shadow.camera.left=-22;moon.shadow.camera.right=22;moon.shadow.camera.top=22;moon.shadow.camera.bottom=-10;this.scene.add(moon);
  const acidLight=new THREE.PointLight(0xb9ff00,22,18,1.5);acidLight.position.set(0,3,1);this.scene.add(acidLight);for(const x of[-8.5,8.5]){const spot=new THREE.SpotLight(0xbaff20,42,32,.5,.55,1.2);spot.position.set(x,3,7);spot.target.position.set(0,7,0);spot.castShadow=true;this.scene.add(spot,spot.target)}const rim=new THREE.PointLight(0x3cc9ff,25,30);rim.position.set(0,12,-8);this.scene.add(rim)
 }
 setArmPosition(angle){this.armAngle=THREE.MathUtils.degToRad(angle);for(const pivot of this.armPivots)pivot.rotation.x=this.armAngle;const y=this.pivotY-Math.cos(this.armAngle)*this.armRadius,z=-Math.sin(this.armAngle)*this.armRadius;this.gondola.position.set(0,y,z)}
 resize(){const parent=this.canvas.parentElement,w=Math.max(1,parent.clientWidth),h=Math.max(1,parent.clientHeight);this.renderer.setSize(w,h,false);this.camera.aspect=w/h;this.camera.updateProjectionMatrix()}
 setCamera(name){const view=this.cameraViews[name]||this.cameraViews.operator;this.desiredCamera.fromArray(view.position);this.desiredTarget.fromArray(view.target)}
 update(state,dt){
  const targetArm=THREE.MathUtils.degToRad(state.arm);this.armAngle=THREE.MathUtils.lerp(this.armAngle,targetArm,Math.min(1,dt*3.2));for(const pivot of this.armPivots)pivot.rotation.x=this.armAngle;this.gondola.position.set(0,this.pivotY-Math.cos(this.armAngle)*this.armRadius,-Math.sin(this.armAngle)*this.armRadius);this.gondolaAngle+=state.rpm*Math.PI*2/60*dt;this.gondola.rotation.x=this.gondolaAngle;
  const running=state.mode==='CYCLE RUNNING';for(let i=0;i<this.fountains.length;i++){const jet=this.fountains[i],pulse=running?Math.max(.04,.5+.5*Math.sin(performance.now()*.004+i*.8)):0;jet.visible=running;jet.scale.y=.2+pulse*4.5;jet.position.y=1.45+jet.scale.y*.5;jet.material.opacity=.32+pulse*.5}for(let i=0;i<this.beacons.length;i++)this.beacons[i].material.emissiveIntensity=1.2+1.8*Math.max(0,Math.sin(performance.now()*.006+i*Math.PI));
  this.camera.position.lerp(this.desiredCamera,Math.min(1,dt*2.4));this.cameraTarget.lerp(this.desiredTarget,Math.min(1,dt*2.4));this.camera.lookAt(this.cameraTarget);this.renderer.render(this.scene,this.camera)
 }
}
