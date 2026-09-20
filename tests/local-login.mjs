import {createRequire} from 'node:module';const {chromium}=createRequire(import.meta.url)('playwright');
import http from 'node:http';import fs from 'node:fs';import assert from 'node:assert/strict';
const server=http.createServer((req,res)=>{const path=new URL(req.url,'http://localhost').pathname;const file='.'+(path==='/'?'/index.html':path);try{res.setHeader('Content-Type',file.endsWith('.js')?'text/javascript':file.endsWith('.css')?'text/css':'text/html');res.end(fs.readFileSync(file));}catch{res.writeHead(404);res.end();}}).listen(4319);
const browser=await chromium.launch({headless:true});const page=await browser.newPage();const external=[];page.on('request',r=>{if(!r.url().startsWith('http://localhost:4319'))external.push(r.url());});
try{
await page.goto('http://localhost:4319');await page.getByText('第一次使用，注册本机账号').click();
async function fill(name,password){await page.locator('[name=username]').fill(name);await page.locator('[name=password]').fill(password);}
await fill('测试甲','sample-password-123');await page.locator('[name=confirm]').fill('sample-password-123');await page.getByRole('button',{name:'注册并开始学习'}).click();await page.getByText('学习概览',{exact:true}).first().waitFor();
const keyA=await page.evaluate(()=>window.FundLocal.key);await page.evaluate(()=>window.FundStudy.startPractice({subject:1,limit:20}));await page.evaluate(()=>window.FundStudy.handle('practice-answer',0,{}));
assert(await page.evaluate(k=>!!localStorage.getItem(k),keyA));
await page.goto('http://localhost:4319/account.html');await page.getByText('退出并切换账号').click();await fill('测试甲','wrong-password');await page.getByRole('button',{name:'登录',exact:true}).click();await page.getByText('用户名或密码不正确。').waitFor();
await page.getByText('第一次使用，注册本机账号').click();await fill('测试乙','sample-password-456');await page.locator('[name=confirm]').fill('sample-password-456');await page.getByRole('button',{name:'注册并开始学习'}).click();await page.getByText('学习概览',{exact:true}).first().waitFor();assert.notEqual(await page.evaluate(()=>window.FundLocal.key),keyA);assert.equal(await page.evaluate(()=>window.FundStudy.getState().practice),null);
await page.goto('http://localhost:4319/account.html');await page.getByText('退出并切换账号').click();await fill('测试甲','sample-password-123');await page.getByRole('button',{name:'登录',exact:true}).click();await page.getByText('学习概览',{exact:true}).first().waitFor();assert.equal(await page.evaluate(()=>window.FundLocal.key),keyA);assert(await page.evaluate(()=>!!window.FundStudy.getState().practice));
assert.equal(external.length,0);assert(!(await page.evaluate(()=>localStorage.getItem('fund-local-users-v1'))).includes('sample-password'));
console.log('PASS registration, login, wrong password, logout, account isolation, progress recovery, hashed passwords, zero external requests');
}catch(e){console.error(e);process.exitCode=1;}finally{await browser.close();server.close();}
