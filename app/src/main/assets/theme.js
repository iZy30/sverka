'use strict';
const Theme=(()=>{
  const key='sverka-appearance';
  const modes=['system','light','dark'];
  const media=matchMedia('(prefers-color-scheme: dark)');
  const native=typeof window.Phone?.themePreference==='function'?window.Phone:null;

  function load(){
    if(native)return native.themePreference();
    try{return localStorage.getItem(key);}catch{return null;}
  }

  const stored=load();
  let preference=modes.includes(stored)?stored:'system';

  function apply(){
    const dark=preference==='system'?(native?native.systemDarkTheme():media.matches):preference==='dark';
    document.documentElement.dataset.theme=dark?'dark':'light';
  }

  function set(mode){
    if(!modes.includes(mode))return;
    preference=mode;
    if(native)native.setThemePreference(mode);
    else{
      try{localStorage.setItem(key,mode);}catch{}
    }
    apply();
  }

  apply();
  if(!native){
    if(media.addEventListener)media.addEventListener('change',apply);
    else media.addListener(apply);
  }
  window.refreshSverkaTheme=apply;
  return {get:()=>preference,set};
})();
