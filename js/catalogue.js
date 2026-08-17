import{currentSession,getProfile}from'./services/supabase.js';import{initSettingsModal,applySettings}from'./core/settings.js';import{click}from'./services/audio.js';applySettings();initSettingsModal();
document.addEventListener('click',e=>{if(e.target.closest('button,.button'))click()});
currentSession().then(async session=>{if(!session)return;const profile=await getProfile(session.user);const name=profile?.display_name||session.user.email.split('@')[0];document.querySelector('[data-operator-name]').textContent=name;document.querySelector('[data-avatar]').textContent=name.slice(0,2).toUpperCase()}).catch(()=>{});
requestAnimationFrame(()=>document.querySelectorAll('.reveal').forEach(e=>e.classList.add('is-visible')));
