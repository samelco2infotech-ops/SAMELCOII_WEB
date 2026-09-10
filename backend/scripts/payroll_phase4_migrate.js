/** Phase 4 forward-only migration. */
const fs=require('fs'); const path=require('path'); const db=require('../src/config/database');
const run=async()=>{const sql=fs.readFileSync(path.join(__dirname,'payroll_phase4.sql'),'utf8').split(/^-- ROLLBACK\s*$/m)[0].split(';').map(v=>v.trim()).filter(Boolean);
 if(sql.length!==3) throw new Error(`Expected 3 statements, found ${sql.length}.`);
 if(process.argv.includes('--check')) return console.log('payroll phase 4 migration check: passed');
 try{for(const statement of sql) await db.execute(statement);console.log('payroll phase 4 migration: applied');}finally{await db.closePool();}};
run().catch(e=>{console.error(e.message);process.exitCode=1;});
