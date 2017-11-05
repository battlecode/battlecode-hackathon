import test from 'ava';

import { Game } from '../src/game';
import * as schema from '../src/schema';

const TEST_MAP: schema.MapFile = {
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
    let map = { ...TEST_MAP };
    map.entities = [{id: 0, type: 'statue', hp: 10, teamID: 1, location: {x:1,y:1}}];
    let game = new Game('test', map, [schema.NEUTRAL_TEAM, {teamID: 1, name: 'a'}], true);
    let nextTurn = game.firstTurn();
    // first played turn should be turn 0
    t.deepEqual(nextTurn.turn, 0);
    let diff = game.makeTurn(1, 0, []);
    t.deepEqual(diff.changed.length, 1);
    t.deepEqual(diff.changed[0].teamID, 1);
});

test('neutral team check', (t) => {
    t.throws(() => {
        let game = new Game('test', TEST_MAP, [{teamID: 0, name: 'notneutral'}], true);
    });
});