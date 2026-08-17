import{loadSettings}from'../core/settings.js';
let context;
function ctx(){return context||(context=new(window.AudioContext||window.webkitAudioContext)())}
export function tone(frequency=520,duration=.045,type='square',gain=.025){if(!loadSettings().audio)return;try{const c=ctx(),o=c.createOscillator(),g=c.createGain();o.type=type;o.frequency.value=frequency;g.gain.setValueAtTime(gain,c.currentTime);g.gain.exponentialRampToValueAtTime(.0001,c.currentTime+duration);o.connect(g).connect(c.destination);o.start();o.stop(c.currentTime+duration)}catch{}}
export const click=()=>tone(420,.035,'square',.018);export const alarm=()=>{tone(190,.18,'sawtooth',.04);setTimeout(()=>tone(150,.22,'sawtooth',.04),190)};
