
const $=s=>document.querySelector(s);
const S={sb:null,session:null,perfil:null,role:null,admin:false,canWrite:true,me:null,view:'montego',names:{},clientes:[],invit:[],equipo:[],obras:[],ordenes:[],eventos:[],catalogo:[],obraId:null,open:null,mode:null,busy:false,
  draft:{titulo:'',motivo:'',plazo:0,lineas:[],tipo:'nueva',item:'',partida:'',wbs:'',cant:'',pu:''},av:{},bit:{texto:'',fotos:''},flash:{},
  acc:{email:'',nombre:'',rol:'cliente',cliente:'',obra:''},nc:{id:'',razon:'',rif:''}};
const fmt=(n,d=2)=>Number(n||0).toLocaleString('es-VE',{minimumFractionDigits:d,maximumFractionDigits:d});
const usd=n=>fmt(n)+' US$';
const fdate=s=>{if(!s)return '';const d=new Date(String(s).length<=10?s+'T12:00:00':s);return d.toLocaleDateString('es-VE',{day:'2-digit',month:'short',year:'numeric'})};
const ftime=s=>{const d=new Date(s);return d.toLocaleDateString('es-VE',{day:'2-digit',month:'short'})+' '+d.toLocaleTimeString('es-VE',{hour:'2-digit',minute:'2-digit'})};
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const today=()=>new Date().toISOString().slice(0,10);
const TIPOS={aumento:'Aumento',nueva:'Partida nueva',disminucion:'Disminución'};
const EST={pendiente:['pend','Por aprobar'],aprobada:['ok','Aprobada'],rechazada:['bad','Rechazada']};
const ESTOBRA={por_iniciar:['','Por iniciar'],en_ejecucion:['run','En ejecución'],pausada:['pend','Pausada'],terminada:['ok','Terminada']};
const sg=(o,l)=>l.tipo==='disminucion'?-1:1;

function toast(t){const el=$('#toast');el.textContent=t;el.hidden=false;clearTimeout(toast.t);toast.t=setTimeout(()=>el.hidden=true,3400)}
function osMonto(o){return (o.lineas||[]).reduce((a,l)=>a+sg(o,l)*(+l.cantidad||0)*(+l.pu||0),0)}
function lineItem(o,x,i){return x.item||(o.numero+'.'+(i+1))}

/* Vigente = contrato + OS aprobadas. El ejecutado sale de obra.avance[item] (cargado por Montego). */
function vigente(ob,ords){
  const av=ob.avance||{};
  const L=(ob.lineas||[]).map(l=>({...l,origen:'contrato',cant_vig:+l.cantidad||0}));
  ords.filter(o=>o.estado==='aprobada').sort((a,b)=>a.numero.localeCompare(b.numero)).forEach(o=>(o.lineas||[]).forEach((x,i)=>{
    const ref=x.item_ref&&L.find(l=>l.item===x.item_ref);
    const q=sg(o,x)*(+x.cantidad||0);
    if(ref&&x.tipo!=='nueva'){ref.cant_vig+=q;ref.os=(ref.os||[]).concat(o.numero)}
    else L.push({item:lineItem(o,x,i),wbs:x.wbs||'General',cod_cliente:x.cod_cliente,cod_covenin:x.cod_covenin,descripcion:x.descripcion,unidad:x.unidad,pu:+x.pu||0,cantidad:0,cant_vig:q,origen:o.numero,os:[o.numero]});
  }));
  L.forEach(l=>{l.ej=+(av[l.item]??l.ejecutado??0)});
  return L;
}

/* Contingencia como reserva: las OS aprobadas la consumen primero; el monto vigente sube solo con el excedente. */
function vig(mC,R,net){return mC+R+(net>R?net-R:net<0?net:0)}
function model(){
  const ob=S.obras.find(o=>o.id===S.obraId);
  const ords=S.ordenes.filter(o=>o.obra_id===ob.id).sort((a,b)=>String(b.numero).localeCompare(String(a.numero)));
  const L=vigente(ob,ords);
  const mC=(ob.lineas||[]).reduce((a,l)=>a+(+l.cantidad||0)*(+l.pu||0),0);
  const apr=ords.filter(o=>o.estado==='aprobada');
  const mA=apr.reduce((a,o)=>a+osMonto(o),0);
  const pend=ords.filter(o=>o.estado==='pendiente');
  const mP=pend.reduce((a,o)=>a+osMonto(o),0);
  const R=mC*(+ob.contingencia_pct||0)/100;
  const mV=vig(mC,R,mA), W=mC+mA;
  const usada=Math.min(R,Math.max(0,mA));
  const ejec=L.reduce((a,l)=>a+Math.min(l.ej,Math.max(0,l.cant_vig))*l.pu,0);
  const ini=new Date(ob.fecha_inicio+'T12:00:00');
  const plazo=(+ob.plazo_dias||0)+apr.reduce((a,o)=>a+(+o.impacto_plazo_dias||0),0);
  const dia=Math.max(0,Math.min(plazo,Math.floor((new Date()-ini)/864e5)+1));
  const fin=new Date(ini.getTime()+plazo*864e5).toISOString().slice(0,10);
  return {ob,ords,L,mC,mA,pend,mP,mV,W,R,usada,disp:R-usada,ejec,av:W?ejec/W*100:0,plazo,dia,fin,iva:+ob.iva_pct||0};
}

/* ---------- Vista cliente ---------- */
function summary(M,inside){
  const {ob}=M, est=ESTOBRA[ob.estado]||['',ob.estado||''];
  return `<section class="panel obra-head">
    <div class="sec-head"><span class="eyebrow">${esc(ob.codigo)} · ${esc(ob.cliente?.razon_social||'')}</span><span class="pill ${est[0]}">${esc(est[1])}</span></div>
    <h1>${esc(ob.nombre)}</h1>
    <div class="meta"><span>Ubicación <b>${esc(ob.ubicacion)}</b></span><span>Inicio <b>${fdate(ob.fecha_inicio)}</b></span><span>Entrega prevista <b>${fdate(M.fin)}</b></span>${ob.responsable?`<span>Coordinador <b>${esc(ob.responsable)}</b></span>`:''}</div>
    <div class="progress"><div class="prow"><span>Avance de obra (ejecutado × precio unitario)</span><span class="num">${fmt(M.av,1)} %</span></div><div class="bar" aria-hidden="true"><span style="width:${Math.min(100,M.av)}%"></span></div></div>
    <div class="progress"><div class="prow"><span>Tiempo transcurrido</span><span class="num">día ${M.dia} de ${M.plazo}</span></div><div class="bar time" aria-hidden="true"><span style="width:${M.plazo?M.dia/M.plazo*100:0}%"></span></div></div>
    <div class="figs">
      <div class="fig"><span class="eyebrow">Presupuesto aprobado</span><span class="num">${usd(M.mC+M.R)}</span><span class="note">partidas ${usd(M.mC)} + reserva ${usd(M.R)}</span></div>
      <div class="fig"><span class="eyebrow">Reserva de contingencia</span><span class="num">${usd(M.disp)}</span><span class="note">disponible · usada ${usd(M.usada)} en órdenes</span></div>
      <div class="fig hl"><span class="eyebrow">Monto vigente</span><span class="num">${usd(M.mV)}</span><span class="note">con IVA ${fmt(M.iva,0)} %: ${usd(M.mV*(1+M.iva/100))}</span></div>
      <div class="fig"><span class="eyebrow">${inside?'Por aprobar':'Ejecutado a la fecha'}</span><span class="num">${usd(inside?M.mP:M.ejec)}</span>${inside?'':'<span class="note">trabajo hecho; se cobra por valuaciones</span>'}</div>
    </div>
    ${ob.actualizado?`<div class="note">Actualizado por Montego el ${fdate(ob.actualizado)}.</div>`:''}
  </section>`;
}

function clientHTML(M){
  let h=(S.admin?`<div class="vlabel cli">Lo que ve el cliente<small>${esc(M.ob.cliente?.razon_social||'')}</small></div>`:'')+summary(M,false);
  h+=`<section class="sec"><div class="sec-head"><h2>Órdenes por aprobar</h2>${M.pend.length?`<span class="note">${M.pend.length} pendiente${M.pend.length>1?'s':''} · ${usd(M.mP)}</span>`:''}</div>`;
  h+=M.pend.length?M.pend.map(o=>osCard(o,M)).join(''):`<div class="panel empty"><b>No tiene órdenes pendientes</b>Si en la obra surge un aumento o una partida nueva, Montego la publicará aquí con su precio y el motivo, y no la ejecuta hasta que usted la apruebe.</div>`;
  h+=`</section>`;
  h+=`<section class="panel sec"><div class="sec-head"><h2>Avance por partida</h2><span class="note">Cantidades vigentes incluyen órdenes aprobadas</span></div><div class="tbl"><table>
    <thead><tr><th>Código</th><th>Descripción</th><th>Und</th><th class="n">Cant. vigente</th><th class="n">Ejecutado</th><th class="n">P. unit.</th><th class="n">Total</th></tr></thead><tbody>`;
  [...new Set(M.L.map(l=>l.wbs||'General'))].forEach(c=>{
    h+=`<tr class="cap"><td colspan="7">${esc(c)}</td></tr>`;
    M.L.filter(l=>(l.wbs||'General')===c).forEach(l=>{
      const p=l.cant_vig>0?Math.min(100,l.ej/l.cant_vig*100):0;
      h+=`<tr${S.flash['av:'+l.item]?' class="flash"':''}><td class="code">${esc(l.cod_cliente||l.cod_covenin||l.item)}</td><td>${esc(l.descripcion)}${l.os?` <span class="tag ${l.origen==='contrato'?'aumento':'nueva'}">${esc(l.os.join(', '))}</span>`:''}</td><td>${esc(l.unidad)}</td>
      <td class="n">${fmt(l.cant_vig)}</td><td class="n"><span class="mini" aria-hidden="true"><span style="width:${p}%"></span></span>${fmt(l.ej)}</td><td class="n">${fmt(l.pu)}</td><td class="n">${fmt(l.cant_vig*l.pu)}</td></tr>`;
    });
  });
  h+=`<tr class="tot"><td colspan="6">Total partidas vigentes</td><td class="n">${fmt(M.W)}</td></tr>
  <tr class="res"><td colspan="6">Reserva de contingencia disponible</td><td class="n">${fmt(M.disp)}</td></tr>
  <tr class="res"><td colspan="6"><b>Monto vigente sin IVA</b></td><td class="n"><b>${fmt(M.mV)}</b></td></tr></tbody></table></div></section>`;
  const hitos=(M.ob.bitacora||[]).slice().sort((a,b)=>String(b.fecha).localeCompare(String(a.fecha)));
  h+=`<section class="panel sec"><h2>Bitácora de obra</h2>${hitos.length?`<ul class="log">${hitos.map(x=>`<li><span class="d">${fdate(x.fecha)}</span><div class="t">${esc(x.texto)}${x.fotos?`<div class="ph">${x.fotos} fotos georreferenciadas en el expediente</div>`:''}</div></li>`).join('')}</ul>`:'<p class="note">Montego registrará aquí cada jornada de trabajo.</p>'}</section>`;
  const hist=M.ords.filter(o=>o.estado!=='pendiente');
  if(hist.length)h+=`<section class="sec"><h2>Órdenes decididas</h2>${hist.map(o=>osCard(o,M)).join('')}</section>`;
  return h;
}

function osCard(o,M){
  const m=osMonto(o),[cls,lab]=EST[o.estado]||['',o.estado];
  const nv=vig(M.mC,M.R,M.mA+m), cubre=Math.min(Math.max(0,m),M.disp);
  let h=`<article class="os ${o.estado==='aprobada'?'ok':o.estado==='rechazada'?'bad':''}${S.flash['os:'+o.id]?' flash':''}">
   <div class="os-top"><div><span class="eyebrow">${esc(o.numero)} · emitida ${fdate(o.fecha)}</span><h3>${esc(o.titulo)}</h3></div>
   <div class="os-amt"><span class="pill ${cls}">${lab}</span><div class="num">${m>=0?'+':''}${usd(m)}</div><span class="note">IVA aparte${o.impacto_plazo_dias?` · +${o.impacto_plazo_dias} día${o.impacto_plazo_dias>1?'s':''} de plazo`:''}</span></div></div>
   ${o.motivo?`<p class="why">${esc(o.motivo)}</p>`:''}
   ${o.estado==='pendiente'&&m>0?`<div class="os-note${m>M.disp?' over':''}">${m<=M.disp?`Si la aprueba, se paga con la reserva de contingencia; el monto vigente sigue en ${usd(M.mV)}.`:M.disp>0?`La reserva cubre ${usd(M.disp)}; si la aprueba, el monto vigente sube a ${usd(nv)}.`:`La reserva ya se usó; si la aprueba, el monto vigente sube a ${usd(nv)}.`}</div>`:''}
   <div class="tbl"><table><thead><tr><th>Tipo</th><th>Código</th><th>Descripción</th><th>Und</th><th class="n">Cant.</th><th class="n">P. unit.</th><th class="n">Total</th></tr></thead><tbody>
   ${(o.lineas||[]).map(l=>`<tr><td><span class="tag ${esc(l.tipo)}">${TIPOS[l.tipo]||esc(l.tipo)}</span></td><td class="code">${esc(l.cod_cliente||l.cod_covenin||'')}</td><td>${esc(l.descripcion)}</td><td>${esc(l.unidad)}</td><td class="n">${fmt(l.cantidad)}</td><td class="n">${fmt(l.pu)}</td><td class="n">${fmt(sg(o,l)*l.cantidad*l.pu)}</td></tr>`).join('')}
   </tbody></table></div>`;
  if(o.estado==='pendiente'){
    if(S.canWrite===false)h+=`<p class="note">Solo lectura: pida a Montego acceso de aprobación para decidir esta orden.</p>`;
    else if(S.open===o.id){
      const ap=S.mode==='aprobar';
      h+=`<div class="confirm"><p>${ap?`Va a aprobar <b>${esc(o.numero)}</b> por <b class="num">${usd(m)}</b> más IVA. ${m<=M.disp?`Se cubre con la reserva de contingencia (quedan <b class="num">${usd(M.disp-Math.max(0,m))}</b>) y el monto vigente no cambia.`:`La reserva cubre <b class="num">${usd(cubre)}</b>; el resto sube el monto vigente a <b class="num">${usd(nv)}</b>.`}`:`Va a rechazar <b>${esc(o.numero)}</b>. Montego no ejecutará estos trabajos; indique el motivo para que puedan replantearlos.`}</p>
        ${ap?`<p class="note">Su aprobación equivale a aceptación escrita, según las condiciones comerciales de la propuesta ${esc(M.ob.codigo)}.</p>`:''}
        <label class="note" for="c-cm-${esc(o.id)}">${ap?'Comentario (opcional)':'Motivo del rechazo'}</label>
        <textarea id="c-cm-${esc(o.id)}" maxlength="600"></textarea>
        <div class="actions"><button class="btn ${ap?'ok':'bad solid'}" data-act="confirm" data-id="${esc(o.id)}"${S.busy?' disabled':''}>${ap?'Confirmar aprobación':'Confirmar rechazo'}</button><button class="btn" data-act="cancel">Volver</button></div></div>`;
    } else h+=`<div class="actions"><button class="btn ok" data-act="aprobar" data-id="${esc(o.id)}">Aprobar</button><button class="btn bad" data-act="rechazar" data-id="${esc(o.id)}">Rechazar</button></div>`;
  } else if(o.decision){
    h+=`<div class="decision">${o.estado==='aprobada'?'Aprobada':'Rechazada'} por ${esc(S.names[o.decision.por]||'el cliente')} el ${fdate(o.decision.fecha)}${o.decision.comentario?`: <q>${esc(o.decision.comentario)}</q>`:''}</div>`;
  }
  return h+`</article>`;
}

/* ---------- Vista interna Montego ---------- */
function intHTML(M){
  const {ob}=M, d=S.draft;
  let h=`<div class="vlabel int">Gestión Montego<small>solo administrativo</small></div>`;
  h+=`<section class="panel sec"><div class="sec-head"><h2>${esc(ob.codigo)} · ${esc(ob.nombre)}</h2></div>
    <div class="frow">
      <div class="field"><label for="i-estado">Estado de la obra</label><select id="i-estado">${Object.entries(ESTOBRA).map(([k,v])=>`<option value="${k}"${ob.estado===k?' selected':''}>${v[1]}</option>`).join('')}</select></div>
      <div class="field"><span class="eyebrow">Monto vigente</span><span class="num">${usd(M.mV)}</span></div>
      <div class="field"><span class="eyebrow">Reserva disponible</span><span class="num">${usd(M.disp)} de ${usd(M.R)}</span></div>
      <div class="field"><span class="eyebrow">Por aprobar</span><span class="num">${usd(M.mP)}</span></div>
      <div class="field"><span class="eyebrow">Avance</span><span class="num">${fmt(M.av,1)} % · día ${M.dia}/${M.plazo}</span></div>
    </div>
    <p class="note">Línea base congelada desde el APU: ${(ob.lineas||[]).length} partidas, ${usd(M.mC)} sin IVA, contingencia ${fmt(ob.contingencia_pct||0,0)} % como reserva. Las cifras cambian aquí y en la vista del cliente con cada acción.</p></section>`;

  // Órdenes
  h+=`<section class="panel sec"><div class="sec-head"><h2>Órdenes de servicio</h2><span class="note">${M.ords.length} emitidas</span></div><div class="tbl"><table>
   <thead><tr><th>Nº</th><th>Título</th><th class="n">Monto</th><th>Estado</th><th>Decisión del cliente</th><th></th></tr></thead><tbody>
   ${M.ords.map(o=>{const [c,l]=EST[o.estado]||['',o.estado];return `<tr${S.flash['os:'+o.id]?' class="flash"':''}><td class="code">${esc(o.numero)}</td><td>${esc(o.titulo)}</td><td class="n">${fmt(osMonto(o))}</td><td><span class="pill ${c}">${o.estado==='pendiente'?'Esperando al cliente':l}</span></td><td class="note">${o.decision?`${esc(S.names[o.decision.por]||'el cliente')}, ${ftime(o.decision.fecha)}${o.decision.comentario?`: “${esc(o.decision.comentario)}”`:''}`:'—'}</td><td><button class="btn sm bad" type="button" data-act="delos" data-id="${esc(o.id)}"${S.busy?' disabled':''}>Eliminar</button></td></tr>`}).join('')}
   </tbody></table></div></section>`;

  // Emitir OS
  const nextN='OS-'+String(M.ords.reduce((a,o)=>Math.max(a,parseInt(String(o.numero).replace(/\D/g,''))||0),0)+1).padStart(3,'0');
  const tot=d.lineas.reduce((a,l)=>a+sg(null,l)*l.cantidad*l.pu,0);
  const caps=[...new Set(M.L.map(l=>l.wbs||'General'))];
  const secs=[...new Set(S.catalogo.map(p=>p.seccion||'Otras'))];
  h+=`<section class="panel sec"><div class="sec-head"><h2>Emitir orden de servicio</h2><span class="eyebrow">${nextN}</span></div><div class="form">
    <div class="field"><label for="i-tit">Título</label><input type="text" id="i-tit" maxlength="120" value="${esc(d.titulo)}" placeholder="Ej.: Subida por fachada al cuarto técnico"></div>
    <div class="field"><label for="i-mot">Motivo (lo lee el cliente)</label><textarea id="i-mot" maxlength="800" placeholder="Qué se encontró en campo y por qué hace falta">${esc(d.motivo)}</textarea></div>
    <div class="frow">
      <div class="field"><label for="i-tipo">Tipo de línea</label><select id="i-tipo">${Object.entries(TIPOS).map(([k,v])=>`<option value="${k}"${d.tipo===k?' selected':''}>${v}</option>`).join('')}</select></div>
      ${d.tipo==='nueva'
        ?`<div class="field" style="grid-column:span 2"><label for="i-part">Partida del catálogo APU</label><select id="i-part"><option value="">Elegir partida…</option>${secs.map(s=>`<optgroup label="${esc(s)}">${S.catalogo.filter(p=>(p.seccion||'Otras')===s).map(p=>`<option value="${esc(p.id)}"${d.partida===p.id?' selected':''}>${esc(p.cod)} · ${esc(p.descripcion.slice(0,70))} (${fmt(p.pu)}/${esc(p.unidad)})</option>`).join('')}</optgroup>`).join('')}</select></div>
          <div class="field"><label for="i-wbs">Capítulo</label><select id="i-wbs">${caps.map(c=>`<option${d.wbs===c?' selected':''}>${esc(c)}</option>`).join('')}</select></div>`
        :`<div class="field" style="grid-column:span 2"><label for="i-item">Partida de la obra</label><select id="i-item"><option value="">Elegir partida…</option>${M.L.filter(l=>l.origen==='contrato').map(l=>`<option value="${esc(l.item)}"${d.item===l.item?' selected':''}>${esc(l.item)} · ${esc(l.cod_cliente)} · ${esc(l.descripcion.slice(0,60))} (vig. ${fmt(l.cant_vig)} ${esc(l.unidad)})</option>`).join('')}</select></div>`}
      <div class="field"><label for="i-cant">Cantidad</label><input type="number" id="i-cant" min="0" step="any" value="${esc(d.cant)}"></div>
      <div class="field"><label for="i-pu">P. unit. US$</label><input type="number" id="i-pu" min="0" step="any" value="${esc(d.pu)}"></div>
      <div class="field"><button class="btn" type="button" data-act="addline">Agregar línea</button></div>
    </div>
    ${d.lineas.length?`<div class="tbl"><table><thead><tr><th>Tipo</th><th>Código</th><th>Descripción</th><th class="n">Cant.</th><th class="n">P. unit.</th><th class="n">Total</th><th></th></tr></thead><tbody>
      ${d.lineas.map((l,i)=>`<tr><td><span class="tag ${l.tipo}">${TIPOS[l.tipo]}</span></td><td class="code">${esc(l.cod_cliente)}</td><td>${esc(l.descripcion)}</td><td class="n">${fmt(l.cantidad)}</td><td class="n">${fmt(l.pu)}</td><td class="n">${fmt(sg(null,l)*l.cantidad*l.pu)}</td><td><button class="btn sm" data-act="delline" data-i="${i}" aria-label="Quitar línea">Quitar</button></td></tr>`).join('')}
      <tr class="tot"><td colspan="5">Total de la orden sin IVA</td><td class="n">${fmt(tot)}</td><td></td></tr></tbody></table></div>`:`<p class="note">El precio se toma del APU (partida nueva) o de la línea base (aumento o disminución). Puede ajustarse antes de agregar.</p>`}
    <div class="frow">
      <div class="field"><label for="i-plazo">Días de plazo adicionales</label><input type="number" id="i-plazo" min="0" step="1" value="${esc(d.plazo)}"></div>
      <div class="field" style="grid-column:span 2"><button class="btn pri" type="button" data-act="emit"${S.busy?' disabled':''}>Emitir ${nextN} y enviar al cliente</button></div>
    </div></div></section>`;

  h+=avanceHTML(M,false);

  // Registro
  const ev=S.eventos.filter(e=>e.obra_id===ob.id).sort((a,b)=>String(b.fecha).localeCompare(String(a.fecha))).slice(0,40);
  h+=`<section class="panel sec"><div class="sec-head"><h2>Registro de interacciones</h2><span class="note">Lo que hace cada lado, en orden</span></div>
   ${ev.length?`<ul class="feed">${ev.map(e=>`<li><span class="d">${ftime(e.fecha)}</span><span class="side ${esc(e.lado)}">${{cliente:'Cliente',montego:'Montego',campo:'Campo'}[e.lado]||'Sistema'}</span><span>${esc(e.texto)}</span></li>`).join('')}</ul>`:'<p class="note">Aún no hay interacciones en esta obra.</p>'}
   </section>`;
  return h+accesosHTML();
}


/* Carga de avance: solo cantidades, nunca montos (la usa gestión y la vista de campo). */
function avanceHTML(M,campo){
  return `<section class="panel sec"><div class="sec-head"><h2>Cargar avance del día</h2><span class="note">Cantidad ejecutada acumulada</span></div><div class="tbl"><table>
   <thead><tr><th>Ítem</th><th>Descripción</th><th>Und</th><th class="n">Vigente</th>${campo?'<th class="n">Falta</th><th class="n">Avance</th>':''}<th class="n">Ejecutado</th></tr></thead><tbody>
   ${M.L.map(l=>{const p=l.cant_vig>0?Math.min(100,l.ej/l.cant_vig*100):0;return `<tr><td class="code">${esc(l.item)}</td><td>${esc(campo?l.descripcion:l.descripcion.slice(0,80))}${l.os?` <span class="tag ${l.origen==='contrato'?'aumento':'nueva'}">${esc(l.os.join(', '))}</span>`:''}</td><td>${esc(l.unidad)}</td><td class="n">${fmt(l.cant_vig)}</td>${campo?`<td class="n">${fmt(Math.max(0,l.cant_vig-l.ej))}</td><td class="n"><span class="mini" aria-hidden="true"><span style="width:${p}%"></span></span>${fmt(p,0)} %</td>`:''}<td class="n"><input type="number" min="0" step="any" id="i-av-${esc(l.item)}" data-item="${esc(l.item)}" value="${esc(S.av[l.item]??l.ej)}" aria-label="Ejecutado ${esc(l.item)}"></td></tr>`}).join('')}
   </tbody></table></div>
   <div class="form"><div class="field"><label for="i-bit">Nota de bitácora (la lee el cliente)</label><textarea id="i-bit" maxlength="600" placeholder="Qué se hizo hoy">${esc(S.bit.texto)}</textarea></div>
   <div class="frow"><div class="field"><label for="i-fotos">Fotos en el expediente</label><input type="number" id="i-fotos" min="0" step="1" value="${esc(S.bit.fotos)}"></div>
   <div class="field" style="grid-column:span 2"><button class="btn pri" type="button" data-act="avance"${S.busy?' disabled':''}>Guardar avance y publicar</button></div></div></div></section>`;
}

/* ---------- Vista de campo Montego: cantidades, pendientes y bitácora; sin precios ni montos ---------- */
function campoHTML(M){
  const {ob}=M, est=ESTOBRA[ob.estado]||['',ob.estado||''];
  const term=M.L.filter(l=>l.cant_vig>0&&l.ej>=l.cant_vig).length, tot=M.L.filter(l=>l.cant_vig>0).length;
  let h=`<div class="vlabel int">Campo Montego<small>carga de avance · sin montos</small></div>
  <section class="panel obra-head">
    <div class="sec-head"><span class="eyebrow">${esc(ob.codigo)}</span><span class="pill ${est[0]}">${esc(est[1])}</span></div>
    <h1>${esc(ob.nombre)}</h1>
    <div class="meta"><span>Ubicación <b>${esc(ob.ubicacion)}</b></span><span>Entrega prevista <b>${fdate(M.fin)}</b></span></div>
    <div class="progress"><div class="prow"><span>Partidas terminadas</span><span class="num">${term} de ${tot}</span></div><div class="bar" aria-hidden="true"><span style="width:${tot?term/tot*100:0}%"></span></div></div>
    <div class="progress"><div class="prow"><span>Tiempo transcurrido</span><span class="num">día ${M.dia} de ${M.plazo}</span></div><div class="bar time" aria-hidden="true"><span style="width:${M.plazo?M.dia/M.plazo*100:0}%"></span></div></div>
  </section>`;
  if(M.pend.length)h+=`<section class="panel sec"><div class="sec-head"><h2>No ejecutar todavía</h2><span class="pill pend">Esperando al cliente</span></div>
   <p class="note">Estos trabajos están en órdenes de servicio que el cliente aún no aprueba.</p>
   <ul class="log">${M.pend.map(o=>`<li><span class="d">${esc(o.numero)}</span><div class="t"><b>${esc(o.titulo)}</b>${(o.lineas||[]).map(l=>`<div class="note">${TIPOS[l.tipo]||''}: ${esc(l.descripcion.slice(0,70))} · ${fmt(l.cantidad)} ${esc(l.unidad)}</div>`).join('')}</div></li>`).join('')}</ul></section>`;
  h+=avanceHTML(M,true);
  const hitos=(ob.bitacora||[]).slice().sort((a,b)=>String(b.fecha).localeCompare(String(a.fecha))).slice(0,5);
  if(hitos.length)h+=`<section class="panel sec"><h2>Últimas notas de bitácora</h2><ul class="log">${hitos.map(x=>`<li><span class="d">${fdate(x.fecha)}</span><div class="t">${esc(x.texto)}${x.fotos?`<div class="ph">${x.fotos} fotos</div>`:''}</div></li>`).join('')}</ul></section>`;
  return h;
}

/* ---------- Accesos (solo administrativo): quién entra, con qué rol y a qué obras ---------- */
function accesosHTML(){
  const a=S.acc, ob=S.obras.find(o=>o.id===S.obraId);
  const ROL={admin:'Administrativo',campo:'Líder de campo',cliente:'Cliente'};
  const cli=Object.fromEntries(S.clientes.map(c=>[c.id,c.razon_social]));
  const eq=S.equipo.filter(e=>e.obra_id===S.obraId).map(e=>e.email.toLowerCase());
  return `<section class="panel sec"><div class="sec-head"><h2>Accesos al portal</h2><span class="note">${S.invit.length} correos registrados</span></div>
   <div class="tbl"><table><thead><tr><th>Correo</th><th>Nombre</th><th>Rol</th><th>Código</th><th>Cliente / obra</th><th></th></tr></thead><tbody>
   ${S.invit.map(i=>`<tr><td>${esc(i.email)}</td><td>${esc(i.nombre||'')}</td><td>${ROL[i.rol]||esc(i.rol)}</td><td class="num">${esc(i.codigo||'')}</td>
     <td>${i.rol==='cliente'?esc(cli[i.cliente_id]||i.cliente_id||''):i.rol==='campo'?(eq.includes(i.email.toLowerCase())?`<span class="pill ok">Asignado a esta obra</span>`:`<button class="btn sm" data-act="asignar" data-email="${esc(i.email)}">Asignar a esta obra</button>`):'Todas'}</td>
     <td>${i.rol==='campo'&&eq.includes(i.email.toLowerCase())?`<button class="btn sm" data-act="desasignar" data-email="${esc(i.email)}">Quitar de la obra</button>`:''}</td></tr>`).join('')||'<tr><td colspan="6" class="note">Aún no hay correos registrados.</td></tr>'}
   </tbody></table></div>
   <div class="form"><div class="frow">
     <div class="field"><label for="a-email">Correo</label><input type="text" id="a-email" inputmode="email" value="${esc(a.email)}" placeholder="persona@empresa.com"></div>
     <div class="field"><label for="a-nombre">Nombre</label><input type="text" id="a-nombre" value="${esc(a.nombre)}"></div>
     <div class="field"><label for="a-rol">Rol</label><select id="a-rol">${Object.entries(ROL).map(([k,v])=>`<option value="${k}"${a.rol===k?' selected':''}>${v}</option>`).join('')}</select></div>
     ${a.rol==='cliente'?`<div class="field"><label for="a-cli">Cliente</label><select id="a-cli"><option value="">Elegir cliente…</option>${S.clientes.map(c=>`<option value="${esc(c.id)}"${a.cliente===c.id?' selected':''}>${esc(c.id)} · ${esc(c.razon_social)}</option>`).join('')}</select></div>`:''}
     <div class="field"><button class="btn pri" type="button" data-act="invitar">Dar acceso</button></div>
   </div><p class="note">Envíele a la persona su código: con él crea su clave la primera vez en la página de inicio. ${ob?`Los líderes de campo solo ven las obras a las que los asigne; los clientes ven todas las obras de su empresa.`:''}</p></div>
   <h2>Clientes</h2>
   <div class="frow">
     <div class="field"><label for="c-id">Código</label><input type="text" id="c-id" value="${esc(S.nc.id)}" placeholder="CLI-001"></div>
     <div class="field"><label for="c-razon">Razón social</label><input type="text" id="c-razon" value="${esc(S.nc.razon)}"></div>
     <div class="field"><label for="c-rif">RIF</label><input type="text" id="c-rif" value="${esc(S.nc.rif)}"></div>
     <div class="field"><button class="btn" type="button" data-act="nuevocli">Agregar cliente</button></div>
   </div>
   <h2>Cargar una obra desde el APU</h2>
   <p class="note">Suba el archivo de obra (JSON) que le entrega Claude a partir de la propuesta aprobada en el APU. Si la obra ya existe, se reemplaza su línea base.</p>
   <div class="actions"><label class="btn" for="f-obra">Elegir archivo de obra</label><input type="file" id="f-obra" accept="application/json,.json" hidden></div>
   <h2>Respaldo</h2>
   <p class="note">Descarga una copia completa de la base del portal (obras, órdenes, avances, bitácora, accesos y registro de auditoría) en un archivo que puede guardar en Drive. Además, GitHub guarda una copia automática cada noche.</p>
   <div class="actions"><button class="btn" type="button" data-act="respaldo"${S.busy?' disabled':''}>Descargar respaldo</button></div>
  </section>`;
}

/* ---------- Render ---------- */
const last={cli:'',int:''};
function render(){
  const wrap=$('#wrap'), vc=$('#v-cli'), vi=$('#v-int');
  const v=S.admin?S.view:S.role==='campo'?'campo':'cliente';
  $('#viewsel').hidden=!S.admin;
  document.querySelectorAll('#viewsel button').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.view===v)));
  wrap.classList.toggle('both',v==='ambas');
  vc.hidden=v==='montego'||v==='campo'; vi.hidden=v==='cliente';
  if(v==='ambas')vi.hidden=false;
  if(!S.obras.length){
    const msg=S.admin?`<div class="panel empty"><b>Todavía no hay obras</b>Cargue la primera obra desde el APU en la sección de abajo.</div>`:
      S.role==='campo'?`<div class="panel empty"><b>No tiene obras asignadas</b>Pida al administrativo de Montego que lo asigne a una obra.</div>`:
      `<div class="panel empty"><b>Todavía no hay obras publicadas</b>Cuando Montego inicie su obra, aparecerá aquí con su presupuesto aprobado y el avance de cada partida.</div>`;
    vc.hidden=!!S.admin; vi.hidden=!S.admin;
    vc.innerHTML=S.admin?'':msg; vi.innerHTML=S.admin?msg+accesosHTML():'';last.cli=last.int='';bind();return;
  }
  if(!S.obraId||!S.obras.find(o=>o.id===S.obraId))S.obraId=S.obras[0].id;
  $('#obra-pick').innerHTML=S.obras.length>1?`<select id="sel-obra" aria-label="Obra">${S.obras.map(o=>`<option value="${esc(o.id)}"${o.id===S.obraId?' selected':''}>${esc(o.codigo)} · ${esc(o.nombre)}</option>`).join('')}</select>`:'';
  const sel=$('#sel-obra'); if(sel)sel.onchange=e=>{S.obraId=e.target.value;S.open=null;forceRender()};
  const M=model();
  if(!vc.hidden){const h=clientHTML(M);if(h!==last.cli){vc.innerHTML=h;last.cli=h}}
  if(!vi.hidden){const h=v==='campo'?campoHTML(M):intHTML(M);if(h!==last.int){vi.innerHTML=h;last.int=h}}
  bind();
}
function forceRender(){last.cli='';last.int='';render()}

function bind(){
  document.querySelectorAll('[data-act]').forEach(b=>b.onclick=()=>act(b.dataset.act,b.dataset));
  const on=(id,ev,fn)=>{const el=$('#'+id);if(el)el[ev]=fn};
  on('i-tit','oninput',e=>S.draft.titulo=e.target.value);
  on('i-mot','oninput',e=>S.draft.motivo=e.target.value);
  on('i-plazo','oninput',e=>S.draft.plazo=e.target.value);
  on('i-cant','oninput',e=>S.draft.cant=e.target.value);
  on('i-pu','oninput',e=>S.draft.pu=e.target.value);
  on('i-tipo','onchange',e=>{S.draft.tipo=e.target.value;S.draft.pu='';forceRender()});
  on('i-part','onchange',e=>{S.draft.partida=e.target.value;const p=S.catalogo.find(x=>x.id===e.target.value);S.draft.pu=p?p.pu:'';forceRender()});
  on('i-wbs','onchange',e=>S.draft.wbs=e.target.value);
  on('i-item','onchange',e=>{S.draft.item=e.target.value;const l=model().L.find(x=>x.item===e.target.value);S.draft.pu=l?l.pu:'';forceRender()});
  on('i-bit','oninput',e=>S.bit.texto=e.target.value);
  on('i-fotos','oninput',e=>S.bit.fotos=e.target.value);
  on('i-estado','onchange',e=>setEstado(e.target.value));
  on('a-email','oninput',e=>S.acc.email=e.target.value);
  on('a-nombre','oninput',e=>S.acc.nombre=e.target.value);
  on('a-rol','onchange',e=>{S.acc.rol=e.target.value;forceRender()});
  on('a-cli','onchange',e=>S.acc.cliente=e.target.value);
  on('c-id','oninput',e=>S.nc.id=e.target.value);
  on('c-razon','oninput',e=>S.nc.razon=e.target.value);
  on('c-rif','oninput',e=>S.nc.rif=e.target.value);
  on('f-obra','onchange',e=>importarObra(e.target.files&&e.target.files[0]));
  document.querySelectorAll('input[data-item]').forEach(i=>i.oninput=e=>S.av[e.target.dataset.item]=e.target.value);
}

/* ---------- Datos (Supabase) ---------- */
const sb=()=>S.sb;
const ok=r=>{if(r.error)throw r.error;return r.data};
async function loadAll(){
  const admin=S.admin, campo=S.role==='campo';
  const [obras,lineas,avances,bit]=await Promise.all([
    sb().from('obras').select('*').order('codigo'),
    sb().from('obra_lineas').select('*').order('orden'),
    sb().from('avances').select('obra_id,item,cantidad'),
    sb().from('bitacora').select('obra_id,fecha,texto,fotos,creada').order('creada')]).then(rs=>rs.map(ok));
  const precios=campo?[]:ok(await sb().from('obra_precios').select('*'));
  const pu={};precios.forEach(p=>pu[p.obra_id+'|'+p.item]=+p.pu);
  const clientes=campo?[]:ok(await sb().from('clientes').select('*').order('id'));
  const cn=Object.fromEntries(clientes.map(c=>[c.id,c]));
  S.clientes=clientes;
  S.obras=obras.map(o=>({...o,cliente:cn[o.cliente_id]||null,
    lineas:lineas.filter(l=>l.obra_id===o.id).map(l=>({...l,cantidad:+l.cantidad,pu:pu[o.id+'|'+l.item]??0})),
    avance:Object.fromEntries(avances.filter(a=>a.obra_id===o.id).map(a=>[a.item,+a.cantidad])),
    bitacora:bit.filter(b=>b.obra_id===o.id)}));
  let ords=[];
  if(campo){for(const o of obras)ords=ords.concat(ok(await sb().rpc('ordenes_campo',{o:o.id})).map(r=>({...r,obra_id:o.id})));}
  else ords=ok(await sb().from('ordenes').select('*'));
  S.ordenes=ords.map(r=>({...r,lineas:(r.lineas||[]).map(l=>({...l,cantidad:+l.cantidad,pu:+(l.pu||0)})),
    decision:r.decision_fecha?{por:r.decision_por,fecha:r.decision_fecha,comentario:r.decision_comentario}:null}));
  if(admin){
    const [ev,cat,inv,eq,perf]=await Promise.all([
      sb().from('eventos').select('*').order('fecha',{ascending:false}).limit(200),
      S.catalogo.length?Promise.resolve({data:S.catalogo}):sb().from('catalogo').select('*').order('seccion').order('cod'),
      sb().from('invitaciones').select('*').order('email'),
      sb().from('obra_equipo').select('*'),
      sb().from('perfiles').select('id,nombre,email')]).then(rs=>rs.map(ok));
    S.eventos=ev;S.catalogo=cat.map(p=>({...p,pu:+p.pu}));S.invit=inv;S.equipo=eq;
    perf.forEach(p=>S.names[p.id]=p.nombre||p.email);
  }
  if(S.perfil)S.names[S.perfil.id]=S.perfil.nombre||S.perfil.email;
}
let reloadT=null;
function scheduleReload(){clearTimeout(reloadT);reloadT=setTimeout(async()=>{try{await loadAll();render()}catch(e){console.warn(e)}},400)}
function errText(e){return (e&&e.message)||'Error desconocido'}

async function logEvent(lado,texto,obra_id){
  try{ok(await sb().from('eventos').insert({obra_id:obra_id||S.obraId,lado,texto,por:S.me}))}catch(_){}
}
function flash(k){S.flash[k]=1;setTimeout(()=>{delete S.flash[k]},1800)}

async function act(a,ds){
  const id=ds.id;
  if(a==='aprobar'||a==='rechazar'){S.open=id;S.mode=a;forceRender();$('#c-cm-'+CSS.escape(id))?.focus();return}
  if(a==='cancel'){S.open=null;forceRender();return}
  if(a==='confirm')return decide(id);
  if(a==='addline')return addLine();
  if(a==='delline'){S.draft.lineas.splice(+ds.i,1);forceRender();return}
  if(a==='emit')return emitOS();
  if(a==='avance')return saveAvance();
  if(a==='invitar')return invitar();
  if(a==='asignar'||a==='desasignar')return asignar(ds.email,a==='asignar');
  if(a==='nuevocli')return nuevoCliente();
  if(a==='respaldo')return respaldo();
  if(a==='delos')return borrarOS(id);
}

async function decide(id){
  const ap=S.mode==='aprobar';
  const cm=($('#c-cm-'+CSS.escape(id))?.value||'').trim();
  if(!ap&&!cm){toast('Indique el motivo del rechazo para que Montego pueda replantear la orden.');return}
  S.busy=true;forceRender();
  try{
    ok(await sb().rpc('decidir_orden',{oid:id,aprobar:ap,comentario:cm}));
    flash('os:'+id);toast(ap?'Orden aprobada. Montego recibe el aviso.':'Orden rechazada. Montego recibe su motivo.');
    await loadAll();
  }catch(e){toast('No se pudo guardar la decisión: '+errText(e))}
  S.open=null;S.busy=false;forceRender();
}

function addLine(){
  const d=S.draft,q=+d.cant,pu=+d.pu;
  if(!(q>0)){toast('Indique una cantidad mayor que cero.');return}
  if(d.pu===''||!(pu>=0)){toast('Indique el precio unitario.');return}
  if(d.tipo==='nueva'){
    const p=S.catalogo.find(x=>x.id===d.partida);if(!p){toast('Elija una partida del catálogo.');return}
    d.lineas.push({tipo:'nueva',partida_id:p.id,cod_cliente:p.cod,descripcion:p.descripcion,unidad:p.unidad,cantidad:q,pu,wbs:d.wbs||$('#i-wbs')?.value||'General'});
  }else{
    const l=model().L.find(x=>x.item===d.item);if(!l){toast('Elija la partida de la obra.');return}
    if(d.tipo==='disminucion'&&q>l.cant_vig){toast('La disminución supera la cantidad vigente.');return}
    d.lineas.push({tipo:d.tipo,item_ref:l.item,partida_id:l.partida_id||'',cod_cliente:l.cod_cliente,descripcion:l.descripcion,unidad:l.unidad,cantidad:q,pu});
  }
  d.cant='';d.partida='';d.item='';d.pu='';forceRender();
}

async function emitOS(){
  const d=S.draft;
  if(!d.titulo.trim()){toast('Escriba el título de la orden.');return}
  if(!d.lineas.length){toast('Agregue al menos una línea.');return}
  const M=model();
  const n=M.ords.reduce((a,o)=>Math.max(a,parseInt(String(o.numero).replace(/\D/g,''))||0),0)+1;
  const numero='OS-'+String(n).padStart(3,'0'), id=M.ob.id+'-os-'+String(n).padStart(3,'0');
  S.busy=true;forceRender();
  try{
    const doc={id,obra_id:M.ob.id,numero,fecha:today(),titulo:d.titulo.trim(),motivo:d.motivo.trim(),lineas:d.lineas,impacto_plazo_dias:Math.max(0,parseInt(d.plazo)||0),estado:'pendiente',emitida_por:S.me};
    ok(await sb().from('ordenes').insert(doc));
    await logEvent('montego',`Emitió ${numero} “${doc.titulo}” por ${usd(osMonto(doc))}. Queda esperando al cliente.`);
    S.draft={titulo:'',motivo:'',plazo:0,lineas:[],tipo:'nueva',item:'',partida:'',wbs:'',cant:'',pu:''};
    flash('os:'+id);toast(numero+' emitida. Ya la ve el cliente.');
    await loadAll();
  }catch(e){toast('No se pudo emitir la orden: '+errText(e))}
  S.busy=false;forceRender();
}

async function saveAvance(){
  const M=model(),ob=M.ob,rows=[],cambios=[];
  M.L.forEach(l=>{if(S.av[l.item]!==undefined&&S.av[l.item]!==''){const v=+S.av[l.item];if(!(v>=0))return;if(v!==l.ej){rows.push({obra_id:ob.id,item:l.item,cantidad:v,por:S.me,actualizado:new Date().toISOString()});cambios.push(`${l.item} ${fmt(l.ej)}→${fmt(v)} ${l.unidad}`)}}});
  const txt=S.bit.texto.trim();
  if(!rows.length&&!txt){toast('No hay cambios de avance ni nota de bitácora.');return}
  S.busy=true;forceRender();
  try{
    if(rows.length)ok(await sb().from('avances').upsert(rows,{onConflict:'obra_id,item'}));
    if(txt)ok(await sb().from('bitacora').insert({obra_id:ob.id,fecha:today(),texto:txt,fotos:parseInt(S.bit.fotos)||0,por:S.me}));
    if(S.admin)await sb().from('obras').update({actualizado:today()}).eq('id',ob.id);
    await logEvent(S.role==='campo'||S.view==='campo'?'campo':'montego',`Cargó avance${cambios.length?': '+cambios.join('; '):''}${txt?'. Bitácora: “'+txt+'”':''}`);
    rows.forEach(r=>flash('av:'+r.item));
    S.av={};S.bit={texto:'',fotos:''};toast('Avance guardado. El cliente ya lo ve.');
    await loadAll();
  }catch(e){toast('No se pudo guardar el avance: '+errText(e))}
  S.busy=false;forceRender();
}

async function setEstado(v){
  const ob=S.obras.find(o=>o.id===S.obraId);if(!ob||ob.estado===v)return;
  try{ok(await sb().from('obras').update({estado:v,actualizado:today()}).eq('id',ob.id));await logEvent('montego',`Cambió el estado de la obra a “${ESTOBRA[v][1]}”.`);toast('Estado actualizado.');await loadAll();forceRender()}
  catch(e){toast('No se pudo cambiar el estado: '+errText(e))}
}

async function borrarOS(id){
  const o=S.ordenes.find(x=>x.id===id);if(!o)return;
  const extra=o.estado==='pendiente'?'':` Ya fue ${o.estado} por el cliente: el monto vigente de la obra cambiará.`;
  if(!confirm(`¿Eliminar ${o.numero} “${o.titulo}”?${extra} Queda copia en el registro de auditoría.`))return;
  try{
    ok(await sb().from('ordenes').delete().eq('id',id));
    await logEvent('montego',`Eliminó ${o.numero} “${o.titulo}” (${o.estado}, ${usd(osMonto(o))}).`);
    toast(`${o.numero} eliminada.`);await loadAll();forceRender();
  }catch(e){toast('No se pudo eliminar: '+errText(e))}
}
function bajar(nombre,texto,tipo){
  const a=document.createElement('a');a.href=URL.createObjectURL(new Blob([texto],{type:tipo}));
  a.download=nombre;document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(a.href),5000);
}
/* Libro de presupuestos legible sin internet: una sección por obra con línea base, cantidades vigentes, OS y decisiones. */
function libroOffline(){
  const cli=Object.fromEntries(S.clientes.map(c=>[c.id,c.razon_social])), prev=S.obraId;
  let h='';
  for(const ob of S.obras){
    S.obraId=ob.id;const M=model();
    h+=`<section><h2>${esc(ob.codigo)} · ${esc(ob.nombre)}</h2>
    <p>Cliente: <b>${esc(cli[ob.cliente_id]||ob.cliente_id)}</b> · ${esc(ob.ubicacion||'')} · Estado: ${esc((ESTOBRA[ob.estado]||['',ob.estado])[1])} · Inicio ${esc(ob.fecha_inicio||'—')} · Plazo ${M.plazo} días</p>
    <table class="r"><tr><td>Presupuesto aprobado</td><td>${fmt(M.mC)}</td></tr><tr><td>Reserva de contingencia (${fmt(+ob.contingencia_pct||0,0)} %)</td><td>${fmt(M.R)}</td></tr>
    <tr><td>Órdenes aprobadas</td><td>${fmt(M.mA)}</td></tr><tr><td>Monto vigente sin IVA</td><td><b>${fmt(M.mV)}</b></td></tr><tr><td>Monto vigente con IVA (${fmt(M.iva,0)} %)</td><td>${fmt(M.mV*(1+M.iva/100))}</td></tr>
    <tr><td>Ejecutado a la fecha</td><td>${fmt(M.ejec)} (${fmt(M.av,1)} %)</td></tr></table>
    <h3>Partidas</h3><table><tr><th>Ítem</th><th>Código</th><th>Descripción</th><th>Und</th><th>Contrato</th><th>Vigente</th><th>Ejecutado</th><th>P. unit.</th><th>Total vigente</th><th>Origen</th></tr>
    ${M.L.map(l=>`<tr><td>${esc(l.item)}</td><td>${esc(l.cod_cliente||'')}</td><td>${esc(l.descripcion)}</td><td>${esc(l.unidad||'')}</td><td>${fmt(+l.cantidad||0)}</td><td>${fmt(l.cant_vig)}</td><td>${fmt(l.ej)}</td><td>${fmt(l.pu)}</td><td>${fmt(l.cant_vig*l.pu)}</td><td>${esc(l.origen)}${l.os?' + '+esc(l.os.join(', ')):''}</td></tr>`).join('')}</table>
    <h3>Órdenes de servicio</h3>${M.ords.length?`<table><tr><th>Nº</th><th>Fecha</th><th>Título</th><th>Monto</th><th>Estado</th><th>Decisión</th></tr>
    ${M.ords.slice().reverse().map(o=>`<tr><td>${esc(o.numero)}</td><td>${esc(o.fecha||'')}</td><td>${esc(o.titulo)}</td><td>${fmt(osMonto(o))}</td><td>${esc(o.estado)}</td><td>${o.decision?`${esc(S.names[o.decision.por]||'')} ${esc(String(o.decision.fecha||'').slice(0,16).replace('T',' '))} ${esc(o.decision.comentario||'')}`:''}</td></tr>`).join('')}</table>`:'<p>Sin órdenes.</p>'}
    </section>`;
  }
  S.obraId=prev;
  return `<!doctype html><html lang="es"><head><meta charset="utf-8"><title>Presupuestos Montego ${today()}</title><style>
  body{font:14px/1.45 system-ui,sans-serif;color:#14202e;margin:24px;max-width:1200px}h1{color:#0f4c8a}h2{color:#0f4c8a;border-top:2px solid #0f4c8a;padding-top:14px;margin-top:32px}
  table{border-collapse:collapse;width:100%;margin:8px 0 16px}th,td{border:1px solid #d6dde6;padding:4px 6px;vertical-align:top}th{background:#eef2f6;text-align:left}
  td:nth-child(n+5):not(:last-child){text-align:right;white-space:nowrap}table.r{width:auto}table.r td:last-child{text-align:right}@media print{section{break-before:page}}
  </style></head><body><h1>Grupo Montego · Presupuestos y obras</h1><p>Copia generada el ${new Date().toLocaleString('es-VE')} por ${esc(S.perfil&&S.perfil.email||'')}. Montos en US$. Se abre sin internet en cualquier navegador.</p>${h||'<p>No hay obras.</p>'}</body></html>`;
}
async function respaldo(){
  const tablas=['clientes','invitaciones','perfiles','obras','obra_equipo','obra_lineas','obra_precios','avances','bitacora','ordenes','eventos','catalogo','auditoria'];
  const out={generado:new Date().toISOString(),por:S.perfil&&S.perfil.email,tablas:{}};
  S.busy=true;forceRender();
  try{
    for(const t of tablas){
      const filas=[];
      for(let i=0;;i+=1000){const r=await sb().from(t).select('*').range(i,i+999);if(r.error){if(t==='auditoria'&&/does not exist|schema cache/i.test(r.error.message))break;throw r.error}filas.push(...r.data);if(r.data.length<1000)break}
      out.tablas[t]=filas;
    }
    bajar(`respaldo-portal-montego-${today()}.json`,JSON.stringify(out,null,1),'application/json');
    bajar(`presupuestos-montego-${today()}.html`,libroOffline(),'text/html');
    toast('Respaldo descargado: archivo de datos (JSON) y libro de presupuestos (HTML).');
  }catch(e){toast('No se pudo generar el respaldo: '+errText(e))}
  finally{S.busy=false;forceRender()}
}
async function invitar(){
  const a=S.acc,email=a.email.trim().toLowerCase();
  if(!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)){toast('Escriba un correo válido.');return}
  if(a.rol==='cliente'&&!a.cliente){toast('Elija a qué cliente pertenece.');return}
  try{
    const codigo=String(100000+crypto.getRandomValues(new Uint32Array(1))[0]%900000);
    ok(await sb().from('invitaciones').upsert({email,rol:a.rol,nombre:a.nombre.trim()||null,cliente_id:a.rol==='cliente'?a.cliente:null,codigo}));
    await logEvent('montego',`Dio acceso a ${email} como ${{admin:'administrativo',campo:'líder de campo',cliente:'cliente'}[a.rol]}.`);
    S.acc={email:'',nombre:'',rol:a.rol,cliente:'',obra:''};toast(`Acceso creado. Envíele a ${email} el código ${codigo} para crear su clave.`);
    await loadAll();forceRender();
  }catch(e){toast('No se pudo dar acceso: '+errText(e))}
}
async function asignar(email,si){
  try{
    if(si)ok(await sb().from('obra_equipo').insert({obra_id:S.obraId,email:email.toLowerCase()}));
    else ok(await sb().from('obra_equipo').delete().eq('obra_id',S.obraId).eq('email',email.toLowerCase()));
    await logEvent('montego',`${si?'Asignó':'Quitó'} a ${email} ${si?'a':'de'} la obra.`);
    await loadAll();forceRender();
  }catch(e){toast('No se pudo cambiar la asignación: '+errText(e))}
}
async function nuevoCliente(){
  const c=S.nc;if(!c.id.trim()||!c.razon.trim()){toast('Indique código y razón social.');return}
  try{ok(await sb().from('clientes').upsert({id:c.id.trim().toUpperCase(),razon_social:c.razon.trim(),rif:c.rif.trim()||null}));S.nc={id:'',razon:'',rif:''};toast('Cliente guardado.');await loadAll();forceRender()}
  catch(e){toast('No se pudo guardar el cliente: '+errText(e))}
}

/* Archivo de obra: {id?, codigo, nombre, cliente:{codigo, razon_social}, ubicacion, fecha_inicio, plazo_dias, estado, iva_pct,
   contingencia_pct, responsable, lineas:[{item, wbs, cod_cliente, cod_covenin, partida_id, descripcion, unidad, cantidad, pu, ejecutado?}], bitacora?} */
async function importarObra(file){
  if(!file)return;
  try{
    const ob=JSON.parse(await file.text());
    if(!ob.codigo||!ob.nombre||!Array.isArray(ob.lineas)||!ob.lineas.length)throw new Error('al archivo le faltan código, nombre o partidas');
    const id=(ob.id||ob.codigo).toLowerCase(), cid=(ob.cliente&&(ob.cliente.codigo||ob.cliente.id))||ob.cliente_id;
    if(!cid)throw new Error('el archivo no indica el cliente');
    ok(await sb().from('clientes').upsert({id:cid,razon_social:ob.cliente?.razon_social||cid}));
    ok(await sb().from('obras').upsert({id,codigo:ob.codigo,nombre:ob.nombre,cliente_id:cid,ubicacion:ob.ubicacion||null,fecha_inicio:ob.fecha_inicio||today(),plazo_dias:+ob.plazo_dias||0,estado:ob.estado||'por_iniciar',iva_pct:+(ob.iva_pct??16),contingencia_pct:+(ob.contingencia_pct||0),responsable:ob.responsable||null,actualizado:today()}));
    ok(await sb().from('obra_lineas').delete().eq('obra_id',id));
    ok(await sb().from('obra_lineas').insert(ob.lineas.map((l,k)=>({obra_id:id,item:String(l.item),wbs:l.wbs||null,cod_cliente:l.cod_cliente||null,cod_covenin:l.cod_covenin||null,partida_id:l.partida_id||null,descripcion:l.descripcion,unidad:l.unidad||null,cantidad:+l.cantidad||0,orden:k}))));
    ok(await sb().from('obra_precios').insert(ob.lineas.map(l=>({obra_id:id,item:String(l.item),pu:+l.pu||0}))));
    const av=ob.lineas.filter(l=>+l.ejecutado>0).map(l=>({obra_id:id,item:String(l.item),cantidad:+l.ejecutado,por:S.me}));
    if(av.length)ok(await sb().from('avances').upsert(av,{onConflict:'obra_id,item'}));
    await logEvent('montego',`Cargó la línea base de la obra desde el APU (${ob.lineas.length} partidas).`,id);
    S.obraId=id;toast('Obra cargada.');await loadAll();forceRender();
  }catch(e){toast('No se pudo cargar la obra: '+errText(e))}
}

/* ---------- Acceso ---------- */
let loginRole='cliente';
function showLogin(msg){
  $('#loading').hidden=true;$('#views').hidden=true;$('#login').hidden=false;$('#salir').hidden=true;$('#viewsel').hidden=true;
  $('#viewer').textContent='';$('#obra-pick').innerHTML='';
  if(msg){$('#loginmsg').textContent=msg}
}
document.querySelectorAll('.role').forEach(b=>b.onclick=()=>{loginRole=b.dataset.role;try{localStorage.setItem('mtg-rol',loginRole)}catch(_){}document.querySelectorAll('.role').forEach(x=>x.setAttribute('aria-pressed',String(x===b)));$('#email').focus()});
let altaModo=false;
$('#modo').onclick=()=>{altaModo=!altaModo;$('#alta').hidden=!altaModo;
  $('#entrar').textContent=altaModo?'Crear mi clave y entrar':'Entrar';
  $('#modo').textContent=altaModo?'Ya tengo clave: entrar':'Primera vez: crear mi clave';
  $('#clave').autocomplete=altaModo?'new-password':'current-password';
  $('#loginmsg').textContent=altaModo?'Use el correo que registró Montego y el código de invitación que le dieron. La clave debe tener al menos 8 caracteres.':'Solo pueden entrar los correos que Montego haya registrado. Si olvidó su clave, pídale a Montego un código nuevo.'};
$('#loginform').onsubmit=async e=>{
  e.preventDefault();
  const email=$('#email').value.trim().toLowerCase(),password=$('#clave').value,msg=t=>$('#loginmsg').textContent=t;
  if(!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email))return msg('Escriba un correo válido.');
  if(password.length<8)return msg('La clave debe tener al menos 8 caracteres.');
  if(altaModo&&password!==$('#clave2').value)return msg('Las dos claves no coinciden.');
  $('#entrar').disabled=true;msg(altaModo?'Creando su acceso…':'Entrando…');
  const r=altaModo
    ?await S.sb.auth.signUp({email,password,options:{data:{codigo:$('#codigo').value.trim()}}})
    :await S.sb.auth.signInWithPassword({email,password});
  $('#entrar').disabled=false;
  if(r.error)return msg(authMsg(r.error.message));
  if(!r.data.session)return msg('Su clave quedó creada, pero falta activar el acceso sin confirmación de correo en Supabase. Avise a Montego.');
  if(!S.session)enter(r.data.session);
};
$('#salir').onclick=async()=>{await S.sb.auth.signOut();location.reload()};
document.querySelectorAll('#viewsel button').forEach(b=>b.onclick=()=>{S.view=b.dataset.view;try{localStorage.setItem('mtg-vista',S.view)}catch(_){}forceRender()});

function authMsg(m){
  m=String(m||'');
  if(/invalid login credentials/i.test(m))return 'Correo o clave incorrectos. Si es su primera vez, use "Primera vez: crear mi clave".';
  if(/c[oó]digo de invitaci[oó]n/i.test(m))return 'El código de invitación no coincide. Pídale a Montego el código correcto.';
  if(/no registrado|database error saving new user/i.test(m))return 'Ese correo no está registrado en Montego, o el código no coincide. Verifique con Montego.';
  if(/already registered|already been registered/i.test(m))return 'Ese correo ya tiene clave. Use "Ya tengo clave: entrar".';
  if(/email not confirmed/i.test(m))return 'Falta activar el acceso sin confirmación de correo en Supabase. Avise a Montego.';
  if(/password/i.test(m)&&/(least|weak|short)/i.test(m))return 'La clave es muy débil. Use al menos 8 caracteres con letras y números.';
  if(/rate limit|only request this/i.test(m))return 'Demasiados intentos seguidos. Espere un minuto y vuelva a intentar.';
  return 'No se pudo entrar: '+m;
}
function hashError(){
  const h=new URLSearchParams(location.hash.slice(1));if(!h.get('error'))return null;
  history.replaceState(null,'',location.pathname+location.search);
  return h.get('error_code')==='otp_expired'
    ?'Ese enlace ya no sirve: vence en una hora y se anula al pedir uno nuevo o al usarlo. Pida otro y abra solo el último correo.'
    :'No se pudo entrar con ese enlace ('+(h.get('error_description')||h.get('error'))+'). Pida uno nuevo.';
}
async function enter(session){
  S.session=session;S.me=session.user.id;
  const r=await S.sb.from('perfiles').select('*').eq('id',S.me).maybeSingle();
  if(r.error||!r.data||!r.data.activo){await S.sb.auth.signOut();showLogin(`El correo ${session.user.email} no tiene acceso. Pida a Montego que lo registre.`);return}
  S.perfil=r.data;S.role=r.data.rol;S.admin=S.role==='admin';
  if(S.admin){let v=null;try{v=localStorage.getItem('mtg-vista')}catch(_){}S.view=v||'montego'}
  $('#login').hidden=true;$('#salir').hidden=false;
  $('#viewer').textContent=(r.data.nombre||r.data.email)+' · '+{admin:'Administrativo',campo:'Líder de campo',cliente:'Cliente'}[S.role];
  let pedido=null;try{pedido=localStorage.getItem('mtg-rol')}catch(_){}
  if(pedido&&pedido!==S.role){$('#banner').textContent=`Su correo está registrado como ${{admin:'administrativo',campo:'líder de campo',cliente:'cliente'}[S.role]}; le mostramos esa vista.`;$('#banner').hidden=false;setTimeout(()=>$('#banner').hidden=true,6000)}
  try{localStorage.removeItem('mtg-rol')}catch(_){}
  try{await loadAll()}catch(e){$('#loading').innerHTML=`<b>No se pudo cargar la información</b>${esc(errText(e))}`;return}
  $('#loading').hidden=true;$('#views').hidden=false;forceRender();
  S.sb.channel('portal').on('postgres_changes',{event:'*',schema:'public'},scheduleReload).subscribe();
}

(async()=>{
  const C=window.MONTEGO_CONFIG||{};
  if(!window.supabase||!C.supabaseUrl||C.supabaseUrl.includes('TU-PROYECTO')){$('#loading').innerHTML='<b>Falta configurar el portal</b>Complete assets/config.js con la dirección y la clave pública de Supabase.';return}
  S.sb=window.supabase.createClient(C.supabaseUrl,C.supabaseAnonKey,{auth:{persistSession:true,detectSessionInUrl:true}});
  const {data}=await S.sb.auth.getSession();
  if(data&&data.session)return enter(data.session);
  const he=hashError();showLogin(he||undefined);
  S.sb.auth.onAuthStateChange((ev,session)=>{if(ev==='SIGNED_IN'&&session&&!S.session)enter(session)});
})();
