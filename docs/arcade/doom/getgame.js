const _AUTHOR='Gregory Maynard-Hoare';const DLURL='https://gmh-code.github.io/dwasm/';let g_pCB,g_wadReadyCallback,g_wadDict;import{Archive}from './libarchive.js';function clearWADData(){g_wadDict={};}
function dlFile(url,pTitle,dCB){const dlMsg='Downloading '+pTitle+'...';g_pCB(dlMsg);try{const zXHR=new XMLHttpRequest();zXHR.open('GET',url,true);zXHR.responseType='blob';zXHR.onprogress=function(event){g_pCB(dlMsg+' ('+event.loaded+'/'+(event.lengthComputable?event.total:'?')+')');};zXHR.onload=function(){if(zXHR.status===200){const zBlob=new Blob([zXHR.response],{type:zXHR.getResponseHeader('Content-Type')});const zFile=new File([zBlob],'a.zip');dCB(zFile);}else{console.error('File download status:',zXHR.status);dCB();}};zXHR.onerror=function(){dCB();};zXHR.send();}catch(err){console.error('File download error:',err);dCB();}}
async function readWAD(wadName,wadType,wadData){g_pCB('Reading '+wadName+'...');const wArrayBuf=await wadData.arrayBuffer();g_wadDict[wadName.toLowerCase()]=[wadType,new Uint8Array(wArrayBuf)];}
function getSW(dCB){const filename='doom19s.zip';async function dlDone(zFile){try{if(!zFile)
throw new Error('Download failure');g_pCB('Opening '+filename+'...');const zArc=await Archive.open(zFile);g_pCB('Reading ZIP contents...');const zFilesObj=await zArc.getFilesObject();g_pCB('Extracting DOOMS_19.1 file from ZIP file...');const rFile1=await zFilesObj['DOOMS_19.1'].extract();g_pCB('Extracting DOOMS_19.2 file from ZIP file...');const rFile2=await zFilesObj['DOOMS_19.2'].extract();g_pCB('Joining DOOMS_19.* files...');const sFile1=await rFile1.arrayBuffer();const sFile2=await rFile2.arrayBuffer();const pCombArrayBuf=new Uint8Array(sFile1.byteLength+sFile2.byteLength);pCombArrayBuf.set(new Uint8Array(sFile1),0);pCombArrayBuf.set(new Uint8Array(sFile2),sFile1.byteLength);const rFile=new File([pCombArrayBuf],'a.1');g_pCB('Opening combined LHA-format file...');const rArc=await Archive.open(rFile);g_pCB('Reading combined LHA-format contents...');const rFilesObj=await rArc.getFilesObject();const wadName='DOOM1.WAD';g_pCB('Extracting '+wadName+' from LHA-format file...');const wadData=await rFilesObj[wadName].extract();await rArc.close();await zArc.close();await readWAD(wadName,'i',wadData);dCB();}catch(err){console.error('SW processing error:',err);clearWADData();dCB();}}
dlFile(DLURL+filename,'original '+filename,dlDone);}
function getHX(dCB){const filename='hacx12.zip';async function dlDone(zFile){try{if(!zFile)
throw new Error('Download failure');g_pCB('Opening '+filename+'...');const zArc=await Archive.open(zFile);g_pCB('Reading ZIP contents...');const zFilesObj=await zArc.getFilesObject();const wadName='HACX.WAD';g_pCB('Extracting '+wadName+' from ZIP file...');const wadData=await zFilesObj[wadName].extract();await zArc.close();await readWAD(wadName,'i',wadData);dCB();}catch(err){console.error('HX processing error:',err);clearWADData();dCB();}}
dlFile(DLURL+filename,filename,dlDone);}
function getLcl(filename,dCB){async function dlDone(zFile){try{if(!zFile)
throw new Error('Download failure');g_pCB('Opening '+filename+' archive...');const zArc=await Archive.open(zFile);g_pCB('Reading '+filename+' contents...');const zFilesObj=await zArc.getFilesObject();const wadName=filename+'.wad';g_pCB('Extracting '+wadName+'...');const wadData=await zFilesObj[wadName].extract();await zArc.close();await readWAD(wadName,'i',wadData);dCB();}catch(err){console.error('File processing error:',err);clearWADData();dCB();}}
dlFile(filename+'.bin',filename,dlDone);}
function isWADDictEmpty(){return(Object.keys(g_wadDict).length<1)}
function getHY(dCB){function depDone(){if(isWADDictEmpty()){dCB();return;}
const filename='harmonyc.zip';async function dlDone(zFile){try{if(!zFile)
throw new Error('Download failure');g_pCB('Opening '+filename+'...');const zArc=await Archive.open(zFile);g_pCB('Reading ZIP contents...');const zFilesObj=await zArc.getFilesObject();const wadName='HarmonyC.wad';g_pCB('Extracting '+wadName+' from ZIP file...');const wadData=await zFilesObj[wadName].extract();await readWAD(wadName,'p',wadData);const wadWSName='Harm-WS.wad';g_pCB('Extracting '+wadWSName+' widescreen fix...');const wadWSData=await zFilesObj['Extra'][wadWSName].extract();await readWAD(wadWSName,'p',wadWSData);await zArc.close();dCB();}catch(err){console.error('HY processing error:',err);clearWADData();dCB();}}
dlFile(DLURL+filename,filename,dlDone);}
getLcl('freedoom2',depDone);}
function getRR(dCB){function depDone(){if(isWADDictEmpty()){dCB();return;}
const folder='REKKR_1_17_4';const filename=folder+'.zip';async function dlDone(zFile){try{if(!zFile)
throw new Error('Download failure');g_pCB('Opening '+filename+'...');const zArc=await Archive.open(zFile);g_pCB('Reading ZIP contents...');const zFilesObj=await zArc.getFilesObject();const wadName='REKKR.wad';g_pCB('Extracting '+wadName+' from ZIP file...');const wadData=await zFilesObj[folder][wadName].extract();await readWAD(wadName,'p',wadData);await zArc.close();dCB();}catch(err){console.error('RR processing error:',err);clearWADData();dCB();}}
dlFile(DLURL+filename,filename,dlDone);}
getLcl('freedoom1',depDone);}
function postDone(){g_wadReadyCallback(g_wadDict);clearWADData();}
function getGame(dFN,progressCallback,wadReadyCallback){g_pCB=progressCallback;g_wadReadyCallback=wadReadyCallback;clearWADData();let funcDict={'sw':getSW,'hx':getHX,'hy':getHY,'rr':getRR}
const callFunc=funcDict[dFN];if(typeof callFunc==='function')
callFunc(postDone);else if(dFN==='freedoom1'||dFN==='freedoom2')
getLcl(dFN,postDone);else
postDone();}
Window.dGetGame=getGame;