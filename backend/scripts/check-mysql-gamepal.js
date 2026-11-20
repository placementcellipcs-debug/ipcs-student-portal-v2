const assert = require('node:assert/strict');
const mysqlPool = require('../config/mysqlPool');
const gamePal = require('../services/mysqlGamePalService');

function mockResponse() {
    return {
        statusCode: 200,
        body: null,
        status(code) { this.statusCode = code; return this; },
        json(body) { this.body = body; return this; },
    };
}

async function callRead(handler, req) {
    const response = mockResponse();
    await handler(req, response);
    assert.equal(response.statusCode, 200, `${handler.name} should return HTTP 200`);
    assert.equal(response.body?.success, true, `${handler.name} should return success`);
    return response.body;
}

async function main() {
    const pool = mysqlPool.getPool();
    try {
        const [[student]] = await pool.execute(
            `SELECT email FROM gamepal_sessions
              WHERE email <> '' ORDER BY occurred_at, created_at LIMIT 1`,
        );
        if (!student?.email) throw new Error('No GamePal account is available for a read-only query check.');

        const dashboard = await callRead(gamePal.getGamePalDashboard, { user: { email: student.email } });
        assert.ok(dashboard.stats && typeof dashboard.stats === 'object');
        assert.ok(dashboard.stats.categories && typeof dashboard.stats.categories === 'object');
        assert.ok(Array.isArray(dashboard.dailyGames));

        const history = await callRead(gamePal.getGamePalHistory, { user: { email: student.email } });
        assert.ok(Array.isArray(history.sessions));
        assert.ok(history.sessions.length <= 20);

        const leaderboard = await callRead(gamePal.getGamePalLeaderboard, { user: { email: student.email } });
        assert.ok(Array.isArray(leaderboard.leaderboard));
        assert.ok(leaderboard.leaderboard.length <= 15);

        const [[challengeOwner]] = await pool.execute(
            `SELECT creator_email AS email FROM gamepal_challenges
             UNION ALL SELECT opponent_email AS email FROM gamepal_challenges LIMIT 1`,
        );
        const challenges = await callRead(gamePal.getFriendChallenges, { user: { email: challengeOwner?.email || student.email } });
        assert.ok(Array.isArray(challenges.challenges));

        console.log(JSON.stringify({
            status: 'passed',
            checks: {
                dashboard: 'passed', history: 'passed', leaderboard: 'passed', friendChallenges: 'passed',
            },
            observedCounts: {
                recentSessions: history.sessions.length,
                leaderboardPlayers: leaderboard.leaderboard.length,
                visibleChallenges: challenges.challenges.length,
            },
            writes: 0,
        }, null, 2));
        console.log('Read-only SQL checks only. No student details or game activity were printed or changed.');
    } finally {
        await mysqlPool.close();
    }
}

main().catch(async error => {
    console.error(`GamePal MySQL read check failed: ${error.message}`);
    await mysqlPool.close().catch(() => {});
    process.exitCode = 1;
});
