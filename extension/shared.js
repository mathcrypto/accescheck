export function permittedTarget(value){try{const u=new URL(value);if(u.username||u.password)return false;return u.protocol==='https:'&&(u.hostname==='doctolib.fr'||u.hostname.endsWith('.doctolib.fr'))||u.origin==='http://127.0.0.1:4180'&&u.pathname==='/mock-call';}catch{return false;}}
export function fictionalTarget(value){try{const u=new URL(value);return u.origin==='http://127.0.0.1:4180'&&u.pathname==='/mock-call';}catch{return false;}}
export function draftText(messages){if(!messages.length)return '';return (messages.every(m=>m.demo)?'EXEMPLE FICTIF\n\n':'')+'NOTES DE CONVERSATION — À RELIRE AVEC LE SOIGNANT\nSans interprétation ni synthèse médicale.\n\n'+messages.map(m=>(m.speaker==='patient'?'Patient · texte saisi':'Parole captée · locuteur non identifié')+(m.corrected?' · corrigé':'')+'\n'+m.text).join('\n\n');}
export function cleanMessage(value,max=4000){if(typeof value!=='string'||!value.trim()||value.length>max)throw new Error('Texte requis, '+max+' caractères maximum.');return value.trim();}
export function validateCaptureConsent(input){if(input?.keepListening!==undefined&&typeof input.keepListening!=='boolean')throw new Error('Option de maintien invalide.');if(input?.consent!==true)throw new Error('Confirmez l’accord des personnes présentes.');if(!['local','browser'].includes(input.mode))throw new Error('Mode vocal invalide.');if(input.mode==='browser'&&input.remoteConsent!==true)throw new Error('Acceptez le traitement audio par le service du navigateur.');}
export function captionFeedback(s){
 if(s.starting)return 'Préparation des sous-titres…';
 if(s.paused)return 'Sous-titres en pause. Relancez-les pour reprendre.';
 if(s.recovering)return 'En attente de parole. L’écoute reste sur le même onglet.';
 if(!s.active)return 'Activez les sous-titres quand vous êtes prêt.';
 if(s.interim||s.diagnostics?.captionCount>0||s.messages?.some(m=>m.speaker==='captured'))return 'La parole est transcrite dans la conversation.';
 if(s.diagnostics?.heardAudio)return s.diagnostics.elapsedMs>=10000?'Son reçu, mais aucun texte renvoyé. Vérifiez votre connexion et le mode de reconnaissance ; essayez le service vocal du navigateur avec votre accord.':'Son reçu. Reconnaissance de la parole en cours…';
 return s.diagnostics?.elapsedMs>=4000?'Aucun son reçu de cet onglet. Sur le test, cliquez sur « Lire la voix du soignant ». Si la lecture se termine immédiatement, actualisez la page du test.':'Écoute démarrée. Lancez la voix du soignant dans l’onglet sélectionné.';
}
