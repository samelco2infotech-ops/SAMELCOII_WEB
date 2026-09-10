/**
 * Purpose: Verify createMembership/updateMembership reject a blank Area or an invalid/blank
 * Handling Branch before touching the DB.
 * Run from backend/: node src/services/membershipService.areaRequired.selfcheck.js
 */
const assert = require('assert');
const { createMembership, updateMembership } = require('./membershipService');

async function main() {
    await assert.rejects(
        createMembership({ lastName: 'Doe', firstName: 'Jane', area: '', branch: 'MAIN' }),
        /Area is required/,
        'createMembership must reject a blank area before generating an account number'
    );

    await assert.rejects(
        createMembership({ lastName: 'Doe', firstName: 'Jane', area: '004 - PARANAS', branch: '' }),
        /Handling Branch is required/,
        'createMembership must reject a blank Handling Branch'
    );

    await assert.rejects(
        createMembership({ lastName: 'Doe', firstName: 'Jane', area: '004 - PARANAS', branch: 'JIABONG' }),
        /Handling Branch is required/,
        'createMembership must reject a Handling Branch outside the 4-office allowlist'
    );

    await assert.rejects(
        updateMembership({ accountNumber: '04200852', lastName: 'Doe', firstName: 'Jane', area: '', branch: 'MAIN' }),
        /Area is required/,
        'updateMembership must reject a blank area before touching the DB'
    );

    await assert.rejects(
        updateMembership({ accountNumber: '04200852', lastName: 'Doe', firstName: 'Jane', area: '004 - PARANAS', branch: '' }),
        /Handling Branch is required/,
        'updateMembership must reject a blank Handling Branch'
    );

    console.log('membershipService.areaRequired.selfcheck: passed');
}

main().catch((err) => { console.error(err); process.exit(1); });
