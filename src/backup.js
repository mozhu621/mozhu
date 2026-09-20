const validateBackup=globalThis.createFundValidator(DATA);
function backupPanel(){
  if(CLOUD_ENABLED&&(!cloud.ready||cloud.inFlight)){toast('请先等待当前账号同步完成。');return;}
  const cached=[];
  try{for(let i=0;i<localStorage.length;i++){const key=localStorage.key(i);if(key?.startsWith(KEY+'-cloud-draft')){const record=JSON.parse(localStorage.getItem(key)||'null');if(record?.state&&record.userId!==cloud.userId)cached.push(record);}}}catch{}
  dialog.innerHTML=`<h2>学习记录备份</h2><p>${CLOUD_ENABLED?'当前账号：'+esc(cloud.account?.username||'已登录'):'当前为本机学习，记录只保存在这个浏览器。'} 导出文件后，可在其他设备或自己的云端账号中导入。</p><div class="row wrap"><button type="button" class="btn primary" id="export-record">导出当前记录</button></div><label class="account-field space">导入记录文件<input id="import-record" type="file" accept=".json,application/json"></label>${cached.length?'<p>检测到以前保存在此浏览器的账号记录：</p><div id="cached-records" class="row wrap"></div>':''}<p id="backup-message" role="status"></p><div class="row"><button class="btn" type="button" data-action="cancel-modal">关闭</button></div>`;
  document.getElementById('export-record').addEventListener('click',()=>{
    const body={format:'fund-study-backup',version:1,exportedAt:Date.now(),state:validateBackup(FundState.upgrade(state))};
    const url=URL.createObjectURL(new Blob([JSON.stringify(body,null,2)],{type:'application/json'}));
    const link=document.createElement('a');link.href=url;link.download='fund-study-backup-'+new Date().toISOString().slice(0,10)+'.json';document.body.appendChild(link);link.click();link.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);
  });
  function prepareRestore(input){
    const restored=validateBackup(FundState.upgrade(input));
    modal('导入这些学习记录？',`将合并到${CLOUD_ENABLED?'当前账号 '+esc(cloud.account?.username||''):'当前浏览器'}。包含 ${Object.keys(restored.stats).length} 道已练习题、${restored.history.length} 次模拟成绩。已有作答会保留，同一条记录不会重复计数。`,()=>{
      state=validateBackup(FundState.merge(state,restored,Object.fromEntries(BANK.map(q=>[q.id,q.answer]))));save();if(state.activeExam)tab='exam';render();checkDeadline();toast('记录已导入。'+(CLOUD_ENABLED?'正在同步到账号。':'请定期导出备份。'));
    },'确认导入');
  }
  document.getElementById('import-record').addEventListener('change',async event=>{
    const file=event.target.files?.[0];if(!file)return;
    try{if(file.size>1600000)throw Error();const parsed=JSON.parse(await file.text());if(parsed.format!=='fund-study-backup'||parsed.version!==1)throw Error();prepareRestore(parsed.state);}
    catch{document.getElementById('backup-message').textContent='无法识别这份记录，请选择学习室导出的 JSON 文件。';}
  });
  cached.forEach((record,index)=>{const button=document.createElement('button');button.className='btn';button.type='button';button.textContent='导入旧账号缓存 '+(index+1);button.addEventListener('click',()=>{try{prepareRestore(record.state);}catch{document.getElementById('backup-message').textContent='这份旧缓存无法导入，请使用完整备份文件。';}});document.getElementById('cached-records').appendChild(button);});
  dialog.showModal();
}
