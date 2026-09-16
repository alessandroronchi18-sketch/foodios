import { chromium } from 'playwright'
import { join } from 'node:path'
const DIR='/private/tmp/claude-501/-Users-aler/7259be07-0e07-42ba-9be1-e672e3a32c10/scratchpad/viste-mobile'
const b=await chromium.launch()
for(const f of process.argv.slice(2)){
  const p=await b.newPage({viewport:{width:390,height:844},hasTouch:true,deviceScaleFactor:2})
  await p.goto('file://'+join(DIR,f+'.html'),{waitUntil:'networkidle'})
  await p.waitForTimeout(400)
  await p.screenshot({path:join(DIR,f+'-390.png'),fullPage:true})
  await p.close()
}
await b.close()
