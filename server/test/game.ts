import * as test from 'blue-tape';

import { Game } from '../src/game';
import * as schema from '../src/schema';

const TEST_MAP: schema.MapData = {
    version: 'battlecode 2017 hackathon map',
    teamCount: 10,
    name: 'test',
    width: 3,
    height: 3,
    tiles: [
        ['G', 'G', 'G'],
        ['G', 'G', 'G'],
        ['G', 'G', 'G']
    ],
    entities: [],
    sectorSize: 3
};

test('spawning', (t) => {
    let game = new Game('test', TEST_MAP, [schema.NEUTRAL_TEAM, {teamID: 1, name: 'a', botName: 'a'}]);
    game.addInitialEntitiesAndSectors([{id: 0, type: 'hedge', hp: 10, team: 1, location: {x:0,y:0}}]);
    for (let i = 1; i <= 9; i++) {
        game.makeTurn(1, i, []);
    }
    let diff = game.makeTurn(1, 10, []);
    t.equal(diff.changed.length, 1);
    t.equal(diff.changed[0].teamID, 1);
    t.end();
});

test('neutral team check', (t) => {
    t.throws(() => {
        let game = new Game('test', TEST_MAP, [{teamID: 0, name: 'notneutral', botName: 'notneutral'}]);
    });

    t.end();
});