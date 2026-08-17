import{currentSession}from'./services/supabase.js';import{loadSettings,saveSettings,applySettings}from'./core/settings.js';
applySettings();window.addEventListener('load',()=>setTimeout(()=>document.querySelector('#app-loader')?.classList.add('is-hidden'),450));
document.querySelectorAll('.reveal').forEach(el=>new IntersectionObserver(([entry],obs)=>{if(entry.isIntersecting){el.classList.add('is-visible');obs.disconnect()}},{threshold:.15}).observe(el));
document.querySelectorAll('[data-scroll]').forEach(b=>b.addEventListener('click',()=>document.querySelector(b.dataset.scroll)?.scrollIntoView({behavior:'smooth'})));
document.querySelector('[data-audio-toggle]')?.addEventListener('click',e=>{const s=loadSettings();s.audio=!s.audio;saveSettings(s);e.currentTarget.textContent=s.audio?'◖':'×'});
currentSession().then(session=>{if(session){const link=document.querySelector('[data-session-link]');link.textContent='Open roster';link.href='catalogue.html'}}).catch(()=>{});
