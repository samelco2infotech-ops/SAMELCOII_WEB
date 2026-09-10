/**
 * Kung SAAN nakatira ang mga table ni SAM.
 *
 * MAHALAGANG NATUKLASAN: ang api/ai_chat.php ay gumagawa ng `USE \`messenger\`` bago
 * hawakan ang brain/knowledge/audit/notices. Kaya ang TUNAY na alaala ni SAM ay nasa
 * `messenger` database, HINDI sa `it_program`:
 *
 *     sam_brain          messenger = 2,238 rows   it_program = 0
 *     ai_knowledge_base  messenger =    13 rows   it_program = 0
 *     ai_audit_log       messenger =   192 rows   it_program = 0
 *
 * Kung ituturo natin ang Node sa it_program, magsisimula si SAM na WALANG alaala —
 * mawawala ang 2,238 natutunang sagot. Kaya lahat ng SAM table ay dapat may prefix
 * na `messenger`. Ang datos naman ng ulat (usertb, fuelallocation_history, checkinout,
 * atbp.) ay nasa it_program pa rin — iyon ang default na koneksyon.
 */

const config = require('../../config/env');

const SAM_DB = process.env.DB_SAM || config.dbMessenger || 'messenger';
const APP_DB = process.env.DB_NAME || config.db?.database || 'it_program';

/** Table ng SAM (brain, knowledge, audit, notices) — nasa messenger DB. */
const sam = (table) => `\`${SAM_DB}\`.\`${table}\``;

/** Table ng datos ng kooperatiba (usertb, fuel, dtr, ...) — nasa it_program. */
const app = (table) => `\`${APP_DB}\`.\`${table}\``;

module.exports = { sam, app, SAM_DB, APP_DB };
